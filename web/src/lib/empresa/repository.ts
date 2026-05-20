"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getNuvemshopCredentials,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type {
  NuvemshopLocalizedText,
  NuvemshopProduct,
} from "@/lib/nuvemshop/types";
import {
  syncCompanyRuleWithNuvemshop,
  type CompanyNuvemshopStatus,
} from "./nuvemshop-discounts";

const OPERATIONS_SCHEMA = "repeticao_maxima";
const COMPANY_CART_DISCOUNT_TABLE = "promocoes_carrinho";
const NUVEMSHOP_PAGE_SIZE = 100;
const NUVEMSHOP_MAX_PAGES = 6;

export type CompanyPersistenceState = {
  enabled: boolean;
  source: "supabase" | "disabled";
  message: string;
  updatedAt: string | null;
};

export type CompanyDiscountCategoryOption = {
  id: string;
  name: string;
  productCount: number;
};

export type CompanyDiscountProductOption = {
  productId: string;
  productName: string;
  categoryIds: string[];
  categoryNames: string[];
  imageUrl: string | null;
  matchIds: string[];
};

export type CompanyCartDiscountRule = {
  id: string;
  title: string;
  ruleMode: "categoria" | "misto";
  categoryId: string;
  categoryName: string;
  categoryIds: string[];
  categoryNames: string[];
  productIds: string[];
  productNames: string[];
  minimumQuantity: number;
  discountAmount: number;
  active: boolean;
  notes: string;
  nuvemshopPromotionId: string | null;
  nuvemshopStatus: CompanyNuvemshopStatus;
  nuvemshopMessage: string;
  nuvemshopCallbackUrl: string | null;
  nuvemshopLastSyncedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function loadCompanyDiscountModuleData() {
  const supabase = createSupabaseServerClient();
  const catalog = await loadNuvemshopDiscountCatalog();

  if (!supabase.ok) {
    return {
      rules: [] as CompanyCartDiscountRule[],
      categories: catalog.categories,
      products: catalog.products,
      persistence: buildDisabledState(
        `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar promocoes de carrinho no Supabase.`,
      ),
      catalogState: catalog.state,
    };
  }

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(COMPANY_CART_DISCOUNT_TABLE)
      .select("*")
      .order("active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const rules = (data ?? []).map(rowToCompanyCartDiscountRule);

    return {
      rules,
      categories: catalog.categories,
      products: catalog.products,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          rules.length > 0
            ? "Promocoes de carrinho carregadas do Supabase."
            : "Supabase conectado. Ainda nao existem promocoes de carrinho cadastradas.",
        updatedAt: getLatestUpdatedAt(data ?? []),
      },
      catalogState: catalog.state,
    };
  } catch (error) {
    return {
      rules: [] as CompanyCartDiscountRule[],
      categories: catalog.categories,
      products: catalog.products,
      persistence: buildDisabledState(getErrorMessage(error)),
      catalogState: catalog.state,
    };
  }
}

export async function createCompanyCartDiscountRule(
  input: unknown,
  origin?: string,
) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeCompanyCartDiscountInput(input);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(COMPANY_CART_DISCOUNT_TABLE)
      .insert({
        title: row.title,
        rule_mode: row.ruleMode,
        category_id: row.categoryId,
        category_name: row.categoryName,
        category_ids: row.categoryIds,
        category_names: row.categoryNames,
        product_ids: row.productIds,
        product_names: row.productNames,
        minimum_quantity: row.minimumQuantity,
        discount_amount: row.discountAmount,
        active: row.active,
        notes: row.notes,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const syncedRule = await syncRuleSnapshot(
      supabase.client,
      rowToCompanyCartDiscountRule(data),
      origin,
    );

    return {
      ok: true as const,
      rule: syncedRule,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: buildSyncMessage(
          "Promocao de carrinho salva no Supabase.",
          syncedRule,
        ),
        updatedAt: syncedRule.updatedAt,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function updateCompanyCartDiscountRuleStatus(
  id: string,
  input: unknown,
  origin?: string,
) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const source = isRecord(input) ? input : {};
  const active = Boolean(source.active);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(COMPANY_CART_DISCOUNT_TABLE)
      .update({
        active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const syncedRule = await syncRuleSnapshot(
      supabase.client,
      rowToCompanyCartDiscountRule(data),
      origin,
    );

    return {
      ok: true as const,
      rule: syncedRule,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: buildSyncMessage(
          active
            ? "Promocao reativada com sucesso."
            : "Promocao pausada com sucesso.",
          syncedRule,
        ),
        updatedAt: syncedRule.updatedAt,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function updateCompanyCartDiscountRule(
  id: string,
  input: unknown,
  origin?: string,
) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeCompanyCartDiscountInput(input);

  try {
    const { data: currentData, error: currentError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(COMPANY_CART_DISCOUNT_TABLE)
      .select("*")
      .eq("id", id)
      .single();

    if (currentError || !currentData) {
      throw currentError || new Error("Promocao nao encontrada para edicao.");
    }

    const previousRule = rowToCompanyCartDiscountRule(currentData);
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(COMPANY_CART_DISCOUNT_TABLE)
      .update({
        title: row.title,
        rule_mode: row.ruleMode,
        category_id: row.categoryId,
        category_name: row.categoryName,
        category_ids: row.categoryIds,
        category_names: row.categoryNames,
        product_ids: row.productIds,
        product_names: row.productNames,
        minimum_quantity: row.minimumQuantity,
        discount_amount: row.discountAmount,
        active: row.active,
        notes: row.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const syncedRule = await syncRuleSnapshot(
      supabase.client,
      rowToCompanyCartDiscountRule(data),
      origin,
      previousRule,
    );

    return {
      ok: true as const,
      rule: syncedRule,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: buildSyncMessage(
          "Promocao de carrinho atualizada no Supabase.",
          syncedRule,
        ),
        updatedAt: syncedRule.updatedAt,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function loadPublishedCompanyDiscountRulesForCallback() {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return [] as CompanyCartDiscountRule[];
  }

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(COMPANY_CART_DISCOUNT_TABLE)
      .select("*")
      .eq("active", true)
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? [])
      .map(rowToCompanyCartDiscountRule)
      .filter((rule) => Boolean(rule.nuvemshopPromotionId));
  } catch {
    return [] as CompanyCartDiscountRule[];
  }
}

async function loadNuvemshopDiscountCatalog() {
  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return {
      categories: [] as CompanyDiscountCategoryOption[],
      products: [] as CompanyDiscountProductOption[],
      state: buildDisabledState(
        `Catalogo da Nuvemshop indisponivel. Configure ${credentials.missing.join(" e ")}.`,
      ),
    };
  }

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const products = await fetchAllNuvemshopPages((params) =>
      client.listProducts(params),
    );

    const mappedProducts = buildCompanyDiscountProductOptions(products);
    const mappedCategories = buildCompanyDiscountCategoryOptions(mappedProducts);

    return {
      categories: mappedCategories,
      products: mappedProducts,
      state: {
        enabled: true,
        source: "supabase" as const,
        message:
          mappedProducts.length > 0
            ? "Categorias e produtos da Nuvemshop carregados para montar promocoes."
            : "Nuvemshop conectada, mas ainda sem produtos mapeaveis para promocoes.",
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      categories: [] as CompanyDiscountCategoryOption[],
      products: [] as CompanyDiscountProductOption[],
      state: buildDisabledState(
        error instanceof Error
          ? `Nao foi possivel ler os produtos da Nuvemshop: ${error.message}.`
          : "Nao foi possivel ler os produtos da Nuvemshop.",
      ),
    };
  }
}

async function fetchAllNuvemshopPages<T>(
  loader: (params: { page: number; perPage: number }) => Promise<T[]>,
) {
  const result: T[] = [];

  for (let page = 1; page <= NUVEMSHOP_MAX_PAGES; page += 1) {
    const batch = await loader({ page, perPage: NUVEMSHOP_PAGE_SIZE });
    result.push(...batch);

    if (batch.length < NUVEMSHOP_PAGE_SIZE) {
      break;
    }
  }

  return result;
}

function buildCompanyDiscountProductOptions(products: NuvemshopProduct[]) {
  return products
    .map((product) => {
      const categories = (product.categories || [])
        .map((category) => ({
          id: String(category.id ?? ""),
          name: getLocalizedText(category.name),
        }))
        .filter((category) => category.id && category.name && category.name !== "-");

      return {
        productId: String(product.id),
        productName: getLocalizedText(product.name),
        categoryIds: categories.map((category) => category.id),
        categoryNames: categories.map((category) => category.name),
        imageUrl:
          product.images && product.images[0] && typeof product.images[0].src === "string"
            ? product.images[0].src
            : null,
        matchIds: Array.from(
          new Set([
            String(product.id),
            ...(product.variants || []).map((variant) => String(variant.id ?? "")),
          ].filter(Boolean)),
        ),
      };
    })
    .filter((product) => product.productId && product.productName && product.categoryIds.length > 0)
    .sort((left, right) => left.productName.localeCompare(right.productName));
}

function buildCompanyDiscountCategoryOptions(
  products: CompanyDiscountProductOption[],
) {
  const categoryMap = new Map<
    string,
    {
      id: string;
      name: string;
      productIds: Set<string>;
    }
  >();

  for (const product of products) {
    product.categoryIds.forEach((categoryId, index) => {
      const categoryName = product.categoryNames[index] || "";

      if (!categoryId || !categoryName) {
        return;
      }

      const current = categoryMap.get(categoryId) ?? {
        id: categoryId,
        name: categoryName,
        productIds: new Set<string>(),
      };

      current.productIds.add(product.productId);
      categoryMap.set(categoryId, current);
    });
  }

  return Array.from(categoryMap.values())
    .map((category) => ({
      id: category.id,
      name: category.name,
      productCount: category.productIds.size,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function rowToCompanyCartDiscountRule(
  row: Record<string, unknown>,
): CompanyCartDiscountRule {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    ruleMode: normalizeRuleMode(row.rule_mode),
    categoryId: String(row.category_id ?? ""),
    categoryName: String(row.category_name ?? ""),
    categoryIds:
      getTextArrayValue(row.category_ids).length > 0
        ? getTextArrayValue(row.category_ids)
        : String(row.category_id ?? "").trim()
          ? [String(row.category_id ?? "").trim()]
          : [],
    categoryNames:
      getTextArrayValue(row.category_names).length > 0
        ? getTextArrayValue(row.category_names)
        : String(row.category_name ?? "").trim()
          ? [String(row.category_name ?? "").trim()]
          : [],
    productIds: getTextArrayValue(row.product_ids),
    productNames: getTextArrayValue(row.product_names),
    minimumQuantity: Math.max(getIntegerValue(row.minimum_quantity), 1),
    discountAmount: Math.max(getNumberValue(row.discount_amount), 0),
    active: Boolean(row.active),
    notes: String(row.notes ?? ""),
    nuvemshopPromotionId: getNullableTextValue(row.nuvemshop_promotion_id),
    nuvemshopStatus: normalizeNuvemshopStatus(row.nuvemshop_status),
    nuvemshopMessage:
      String(row.nuvemshop_message ?? "").trim() ||
      "Ainda nao sincronizada com a Nuvemshop.",
    nuvemshopCallbackUrl: getNullableTextValue(row.nuvemshop_callback_url),
    nuvemshopLastSyncedAt:
      typeof row.nuvemshop_last_synced_at === "string"
        ? row.nuvemshop_last_synced_at
        : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function normalizeCompanyCartDiscountInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const ruleMode = normalizeRuleMode(source.ruleMode);
  const categoryIds = getTextArrayValue(source.categoryIds).filter(Boolean);
  const categoryNames = getTextArrayValue(source.categoryNames).filter(Boolean);
  const fallbackCategoryId = String(source.categoryId ?? "").trim();
  const fallbackCategoryName = String(source.categoryName ?? "").trim();
  const productNames = getTextArrayValue(source.productNames).filter(Boolean);
  const resolvedCategoryIds =
    categoryIds.length > 0
      ? categoryIds
      : fallbackCategoryId
        ? [fallbackCategoryId]
        : [];
  const resolvedCategoryNames =
    categoryNames.length > 0
      ? categoryNames
      : fallbackCategoryName
        ? [fallbackCategoryName]
        : [];

  if (resolvedCategoryIds.length === 0) {
    throw new Error("Escolha pelo menos uma categoria da Nuvemshop para a promocao.");
  }

  if (productNames.length === 0) {
    throw new Error("Selecione pelo menos um produto participante da promocao.");
  }

  return {
    title:
      String(source.title ?? "").trim() ||
      `Leve ${Math.max(getIntegerValue(source.minimumQuantity), 1)} com desconto em ${resolvedCategoryNames.join(", ") || "categoria selecionada"}`,
    ruleMode,
    categoryId: resolvedCategoryIds[0] || "",
    categoryName: resolvedCategoryNames[0] || "",
    categoryIds: resolvedCategoryIds,
    categoryNames: resolvedCategoryNames,
    productIds: getTextArrayValue(source.productIds).filter(Boolean),
    productNames,
    minimumQuantity: Math.max(getIntegerValue(source.minimumQuantity), 1),
    discountAmount: Math.max(getNumberValue(source.discountAmount), 0),
    active: source.active === undefined ? true : Boolean(source.active),
    notes: String(source.notes ?? "").trim(),
  };
}

function buildDisabledState(message: string): CompanyPersistenceState {
  return {
    enabled: false,
    source: "disabled",
    message,
    updatedAt: null,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel concluir a operacao no Supabase.";
}

function getLatestUpdatedAt(rows: Array<Record<string, unknown>>) {
  const values = rows
    .map((row) =>
      typeof row.updated_at === "string"
        ? row.updated_at
        : typeof row.created_at === "string"
          ? row.created_at
          : "",
    )
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left));

  return values[0] || null;
}

function getLocalizedText(value: NuvemshopLocalizedText) {
  if (!value) {
    return "-";
  }

  if (typeof value === "string") {
    return value;
  }

  return value.pt || value.en || value.es || Object.values(value)[0] || "-";
}

function getTextArrayValue(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function getNullableTextValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeNuvemshopStatus(value: unknown): CompanyNuvemshopStatus {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "publicada":
      return "publicada";
    case "erro":
      return "erro";
    case "pausada":
      return "pausada";
    default:
      return "pendente";
  }
}

function normalizeRuleMode(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "misto"
    ? "misto"
    : "categoria";
}

function getNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(
      value
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=\d{3}(?:\D|$))/g, "")
        .replace(",", "."),
    );
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getIntegerValue(value: unknown) {
  const parsed = Math.trunc(getNumberValue(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function syncRuleSnapshot(
  client: SupabaseClient,
  rule: CompanyCartDiscountRule,
  origin?: string,
  previousRule?: CompanyCartDiscountRule | null,
) {
  if (!origin) {
    return rule;
  }

  const syncResult = await syncCompanyRuleWithNuvemshop(
    rule,
    origin,
    previousRule,
  );

  const { data, error } = await client
    .schema(OPERATIONS_SCHEMA)
    .from(COMPANY_CART_DISCOUNT_TABLE)
    .update({
      nuvemshop_promotion_id: syncResult.promotionId,
      nuvemshop_status: syncResult.status,
      nuvemshop_message: syncResult.message,
      nuvemshop_callback_url: syncResult.callbackUrl,
      nuvemshop_last_synced_at: syncResult.syncedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rule.id)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ...rule,
      nuvemshopPromotionId: syncResult.promotionId,
      nuvemshopStatus: syncResult.status,
      nuvemshopMessage: syncResult.message,
      nuvemshopCallbackUrl: syncResult.callbackUrl,
      nuvemshopLastSyncedAt: syncResult.syncedAt,
    };
  }

  return rowToCompanyCartDiscountRule(data);
}

function buildSyncMessage(baseMessage: string, rule: CompanyCartDiscountRule) {
  if (rule.nuvemshopStatus === "publicada" || rule.nuvemshopStatus === "pausada") {
    return `${baseMessage} ${rule.nuvemshopMessage}`;
  }

  if (rule.nuvemshopStatus === "erro") {
    return `${baseMessage} ${rule.nuvemshopMessage}`;
  }

  return baseMessage;
}
