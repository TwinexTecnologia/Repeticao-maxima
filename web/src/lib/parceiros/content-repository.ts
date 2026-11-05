"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { PartnerPersistenceState } from "./repository";

const OPERATIONS_SCHEMA = "repeticao_maxima";
const CONTENT_CAMPAIGNS_TABLE = "parceiros_conteudo_campanhas";
const CONTENT_PRODUCTS_TABLE = "parceiros_conteudo_produtos";
const CONTENT_ASSETS_TABLE = "parceiros_conteudo_assets";

const CONTENT_SCOPE_TYPES = [
  "campaign",
  "product",
  "brand",
  "template",
  "idea",
] as const;
const CONTENT_ASSET_TYPES = [
  "image",
  "video",
  "pdf",
  "link",
  "archive",
  "idea",
] as const;
const CONTENT_CATEGORY_KEYS = [
  "story",
  "feed",
  "pdf",
  "info",
  "other",
  "png_front",
  "png_back",
  "photo_official",
  "photo_model",
  "video",
  "art",
  "logos",
  "elements",
  "backgrounds",
  "story_9_16",
  "feed_4_5",
  "template_other",
  "treino",
  "cupom",
  "unboxing",
  "look",
  "lancamento",
] as const;

export type PartnerContentScopeType = (typeof CONTENT_SCOPE_TYPES)[number];
export type PartnerContentAssetType = (typeof CONTENT_ASSET_TYPES)[number];
export type PartnerContentCategoryKey = (typeof CONTENT_CATEGORY_KEYS)[number];

export type PartnerContentAsset = {
  id: string;
  scopeType: PartnerContentScopeType;
  scopeId: string | null;
  categoryKey: PartnerContentCategoryKey;
  title: string;
  description: string;
  fileUrl: string;
  previewUrl: string;
  downloadLabel: string;
  assetType: PartnerContentAssetType;
  active: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PartnerContentCampaign = {
  id: string;
  title: string;
  summary: string;
  details: string;
  recommendedCta: string;
  imageUrl: string;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  isCurrent: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
  assets: PartnerContentAsset[];
};

export type PartnerContentProduct = {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  shortDescription: string;
  composition: string;
  differentials: string;
  productUrl: string;
  active: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
  assets: PartnerContentAsset[];
};

export type PartnerContentLibrary = {
  campaigns: PartnerContentCampaign[];
  activeCampaign: PartnerContentCampaign | null;
  products: PartnerContentProduct[];
  brandAssets: PartnerContentAsset[];
  templateAssets: PartnerContentAsset[];
  ideas: PartnerContentAsset[];
  persistence: PartnerPersistenceState;
};

export type PartnerContentAdminData = PartnerContentLibrary & {
  allCampaigns: PartnerContentCampaign[];
  allProducts: PartnerContentProduct[];
  allAssets: PartnerContentAsset[];
};

export async function loadPartnerContentLibrary(): Promise<PartnerContentLibrary> {
  const data = await loadPartnerContentAdminData();

  const campaigns = data.allCampaigns.filter((item) => item.active);
  const products = data.allProducts.filter((item) => item.active);
  const brandAssets = data.allAssets.filter(
    (item) => item.scopeType === "brand" && item.active,
  );
  const templateAssets = data.allAssets.filter(
    (item) => item.scopeType === "template" && item.active,
  );
  const ideas = data.allAssets.filter(
    (item) => item.scopeType === "idea" && item.active,
  );
  const activeCampaign =
    campaigns
      .slice()
      .sort((left, right) => {
        if (left.isCurrent !== right.isCurrent) {
          return left.isCurrent ? -1 : 1;
        }

        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        const leftDate = left.startDate || "";
        const rightDate = right.startDate || "";
        return rightDate.localeCompare(leftDate);
      })[0] || null;

  return {
    campaigns,
    activeCampaign,
    products,
    brandAssets,
    templateAssets,
    ideas,
    persistence: data.persistence,
  };
}

export async function loadPartnerContentAdminData(): Promise<PartnerContentAdminData> {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return buildEmptyAdminData(
      buildDisabledState(
        `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar a Central de Conteudo.`,
      ),
    );
  }

  try {
    const [
      { data: campaignRows, error: campaignsError },
      { data: productRows, error: productsError },
      { data: assetRows, error: assetsError },
    ] = await Promise.all([
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(CONTENT_CAMPAIGNS_TABLE)
        .select("*")
        .order("active", { ascending: false })
        .order("is_current", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("start_date", { ascending: false }),
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(CONTENT_PRODUCTS_TABLE)
        .select("*")
        .order("active", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(CONTENT_ASSETS_TABLE)
        .select("*")
        .order("active", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true }),
    ]);

    if (campaignsError) {
      throw campaignsError;
    }

    if (productsError) {
      throw productsError;
    }

    if (assetsError) {
      throw assetsError;
    }

    const allAssets = (assetRows ?? []).map(rowToPartnerContentAsset);
    const campaignAssets = buildScopedAssetMap(
      allAssets.filter((item) => item.scopeType === "campaign"),
    );
    const productAssets = buildScopedAssetMap(
      allAssets.filter((item) => item.scopeType === "product"),
    );
    const allCampaigns = (campaignRows ?? []).map((row) =>
      rowToPartnerContentCampaign(
        row,
        campaignAssets.get(String(row.id ?? "")) ?? [],
      ),
    );
    const allProducts = (productRows ?? []).map((row) =>
      rowToPartnerContentProduct(
        row,
        productAssets.get(String(row.id ?? "")) ?? [],
      ),
    );

    const filtered = {
      campaigns: allCampaigns.filter((item) => item.active),
      activeCampaign:
        allCampaigns
          .filter((item) => item.active)
          .sort((left, right) => {
            if (left.isCurrent !== right.isCurrent) {
              return left.isCurrent ? -1 : 1;
            }
            if (left.sortOrder !== right.sortOrder) {
              return left.sortOrder - right.sortOrder;
            }
            return (right.startDate || "").localeCompare(left.startDate || "");
          })[0] || null,
      products: allProducts.filter((item) => item.active),
      brandAssets: allAssets.filter(
        (item) => item.scopeType === "brand" && item.active,
      ),
      templateAssets: allAssets.filter(
        (item) => item.scopeType === "template" && item.active,
      ),
      ideas: allAssets.filter((item) => item.scopeType === "idea" && item.active),
    };

    return {
      ...filtered,
      allCampaigns,
      allProducts,
      allAssets,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          allCampaigns.length > 0 ||
          allProducts.length > 0 ||
          allAssets.length > 0
            ? "Central de Conteudo carregada do Supabase."
            : "Supabase conectado. Ainda nao existem materiais cadastrados na Central de Conteudo.",
        updatedAt: getLatestUpdatedAt([
          ...(campaignRows ?? []),
          ...(productRows ?? []),
          ...(assetRows ?? []),
        ]),
      },
    };
  } catch (error) {
    return buildEmptyAdminData(buildDisabledState(getErrorMessage(error)));
  }
}

export async function createPartnerContentCampaign(input: unknown) {
  return savePartnerContentCampaignRecord(null, input);
}

export async function updatePartnerContentCampaign(id: string, input: unknown) {
  return savePartnerContentCampaignRecord(id, input);
}

export async function createPartnerContentProduct(input: unknown) {
  return savePartnerContentProductRecord(null, input);
}

export async function updatePartnerContentProduct(id: string, input: unknown) {
  return savePartnerContentProductRecord(id, input);
}

export async function createPartnerContentAsset(input: unknown) {
  return savePartnerContentAssetRecord(null, input);
}

export async function updatePartnerContentAsset(id: string, input: unknown) {
  return savePartnerContentAssetRecord(id, input);
}

async function savePartnerContentCampaignRecord(id: string | null, input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeCampaignInput(input);
  const now = new Date().toISOString();

  try {
    const payload = {
      title: row.title,
      summary: row.summary,
      details: row.details,
      recommended_cta: row.recommendedCta,
      image_url: row.imageUrl,
      start_date: row.startDate,
      end_date: row.endDate,
      active: row.active,
      is_current: row.isCurrent,
      sort_order: row.sortOrder,
      updated_at: now,
    };

    const query = id
      ? supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(CONTENT_CAMPAIGNS_TABLE)
          .update(payload)
          .eq("id", id)
      : supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(CONTENT_CAMPAIGNS_TABLE)
          .insert(payload);

    const { data, error } = await query.select("*").single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel salvar a campanha de conteudo.");
    }

    const adminData = await loadPartnerContentAdminData();
    const campaign =
      adminData.allCampaigns.find((item) => item.id === String(data.id ?? "")) || null;

    if (!campaign) {
      throw new Error(
        "A campanha foi salva, mas nao foi possivel recarregar os materiais.",
      );
    }

    return {
      ok: true as const,
      campaign,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: id
          ? "Campanha de conteudo atualizada com sucesso."
          : "Campanha de conteudo criada com sucesso.",
        updatedAt: typeof data.updated_at === "string" ? data.updated_at : now,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

async function savePartnerContentProductRecord(id: string | null, input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeProductInput(input);
  const now = new Date().toISOString();

  try {
    const payload = {
      name: row.name,
      category: row.category,
      image_url: row.imageUrl,
      short_description: row.shortDescription,
      composition: row.composition,
      differentials: row.differentials,
      product_url: row.productUrl,
      active: row.active,
      sort_order: row.sortOrder,
      updated_at: now,
    };

    const query = id
      ? supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(CONTENT_PRODUCTS_TABLE)
          .update(payload)
          .eq("id", id)
      : supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(CONTENT_PRODUCTS_TABLE)
          .insert(payload);

    const { data, error } = await query.select("*").single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel salvar o produto da Central de Conteudo.");
    }

    const adminData = await loadPartnerContentAdminData();
    const product =
      adminData.allProducts.find((item) => item.id === String(data.id ?? "")) || null;

    if (!product) {
      throw new Error(
        "O produto foi salvo, mas nao foi possivel recarregar os materiais.",
      );
    }

    return {
      ok: true as const,
      product,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: id
          ? "Produto da Central de Conteudo atualizado com sucesso."
          : "Produto da Central de Conteudo criado com sucesso.",
        updatedAt: typeof data.updated_at === "string" ? data.updated_at : now,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

async function savePartnerContentAssetRecord(id: string | null, input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeAssetInput(input);
  const now = new Date().toISOString();

  try {
    const payload = {
      scope_type: row.scopeType,
      scope_id: row.scopeId,
      category_key: row.categoryKey,
      title: row.title,
      description: row.description,
      file_url: row.fileUrl,
      preview_url: row.previewUrl,
      download_label: row.downloadLabel,
      asset_type: row.assetType,
      active: row.active,
      sort_order: row.sortOrder,
      updated_at: now,
    };

    const query = id
      ? supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(CONTENT_ASSETS_TABLE)
          .update(payload)
          .eq("id", id)
      : supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(CONTENT_ASSETS_TABLE)
          .insert(payload);

    const { data, error } = await query.select("*").single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel salvar o material da Central de Conteudo.");
    }

    const adminData = await loadPartnerContentAdminData();
    const asset =
      adminData.allAssets.find((item) => item.id === String(data.id ?? "")) || null;

    if (!asset) {
      throw new Error(
        "O material foi salvo, mas nao foi possivel recarregar a listagem.",
      );
    }

    return {
      ok: true as const,
      asset,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: id
          ? "Material atualizado com sucesso."
          : "Material criado com sucesso.",
        updatedAt: typeof data.updated_at === "string" ? data.updated_at : now,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

function rowToPartnerContentAsset(row: Record<string, unknown>): PartnerContentAsset {
  return {
    id: String(row.id ?? ""),
    scopeType: normalizeScopeType(row.scope_type),
    scopeId: row.scope_id ? String(row.scope_id) : null,
    categoryKey: normalizeCategoryKey(row.category_key),
    title: String(row.title ?? "").trim(),
    description: String(row.description ?? "").trim(),
    fileUrl: String(row.file_url ?? "").trim(),
    previewUrl: String(row.preview_url ?? "").trim(),
    downloadLabel: String(row.download_label ?? "").trim() || "Baixar",
    assetType: normalizeAssetType(row.asset_type),
    active: row.active === false ? false : true,
    sortOrder: getIntegerValue(row.sort_order),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function rowToPartnerContentCampaign(
  row: Record<string, unknown>,
  assets: PartnerContentAsset[],
): PartnerContentCampaign {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? "").trim(),
    summary: String(row.summary ?? "").trim(),
    details: String(row.details ?? "").trim(),
    recommendedCta: String(row.recommended_cta ?? "").trim(),
    imageUrl: String(row.image_url ?? "").trim(),
    startDate: normalizeDate(row.start_date) || null,
    endDate: normalizeDate(row.end_date) || null,
    active: row.active === false ? false : true,
    isCurrent: row.is_current === true,
    sortOrder: getIntegerValue(row.sort_order),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    assets: sortAssets(assets),
  };
}

function rowToPartnerContentProduct(
  row: Record<string, unknown>,
  assets: PartnerContentAsset[],
): PartnerContentProduct {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "").trim(),
    category: String(row.category ?? "").trim(),
    imageUrl: String(row.image_url ?? "").trim(),
    shortDescription: String(row.short_description ?? "").trim(),
    composition: String(row.composition ?? "").trim(),
    differentials: String(row.differentials ?? "").trim(),
    productUrl: String(row.product_url ?? "").trim(),
    active: row.active === false ? false : true,
    sortOrder: getIntegerValue(row.sort_order),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    assets: sortAssets(assets),
  };
}

function buildScopedAssetMap(assets: PartnerContentAsset[]) {
  const grouped = new Map<string, PartnerContentAsset[]>();

  for (const asset of assets) {
    if (!asset.scopeId) {
      continue;
    }

    const current = grouped.get(asset.scopeId) ?? [];
    current.push(asset);
    grouped.set(asset.scopeId, current);
  }

  for (const [key, items] of grouped.entries()) {
    grouped.set(key, sortAssets(items));
  }

  return grouped;
}

function sortAssets(assets: PartnerContentAsset[]) {
  return assets.slice().sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.title.localeCompare(right.title, "pt-BR");
  });
}

function normalizeCampaignInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const title = String(source.title ?? "").trim();
  const startDate = normalizeDate(source.startDate) || "";
  const endDate = normalizeDate(source.endDate) || "";

  if (!title) {
    throw new Error("Informe o titulo da campanha da Central de Conteudo.");
  }

  if (!startDate || !endDate) {
    throw new Error("Informe o periodo completo da campanha.");
  }

  if (startDate > endDate) {
    throw new Error("A data final da campanha precisa ser maior ou igual a data inicial.");
  }

  return {
    title,
    summary: String(source.summary ?? "").trim(),
    details: String(source.details ?? "").trim(),
    recommendedCta: String(source.recommendedCta ?? "").trim(),
    imageUrl: String(source.imageUrl ?? "").trim(),
    startDate,
    endDate,
    active: source.active === false ? false : true,
    isCurrent:
      source.isCurrent === true ||
      String(source.isCurrent ?? "").trim().toLowerCase() === "true",
    sortOrder: getIntegerValue(source.sortOrder),
  };
}

function normalizeProductInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const name = String(source.name ?? "").trim();

  if (!name) {
    throw new Error("Informe o nome do produto da Central de Conteudo.");
  }

  return {
    name,
    category: String(source.category ?? "").trim(),
    imageUrl: String(source.imageUrl ?? "").trim(),
    shortDescription: String(source.shortDescription ?? "").trim(),
    composition: String(source.composition ?? "").trim(),
    differentials: String(source.differentials ?? "").trim(),
    productUrl: String(source.productUrl ?? "").trim(),
    active: source.active === false ? false : true,
    sortOrder: getIntegerValue(source.sortOrder),
  };
}

function normalizeAssetInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const scopeType = normalizeScopeType(source.scopeType);
  const categoryKey = normalizeCategoryKey(source.categoryKey);
  const title = String(source.title ?? "").trim();
  const description = String(source.description ?? "").trim();
  const fileUrl = String(source.fileUrl ?? "").trim();
  const previewUrl = String(source.previewUrl ?? "").trim();
  const assetType = normalizeAssetType(source.assetType);
  const scopeId = String(source.scopeId ?? "").trim() || null;

  if (!title) {
    throw new Error("Informe o nome do material.");
  }

  if ((scopeType === "campaign" || scopeType === "product") && !scopeId) {
    throw new Error("Selecione a campanha ou o produto relacionado a esse material.");
  }

  if (scopeType !== "idea" && !fileUrl) {
    throw new Error("Informe a URL de download do material.");
  }

  if (scopeType === "idea" && !description) {
    throw new Error("As ideias de conteudo precisam ter uma descricao.");
  }

  return {
    scopeType,
    scopeId,
    categoryKey,
    title,
    description,
    fileUrl,
    previewUrl,
    downloadLabel: String(source.downloadLabel ?? "").trim() || "Baixar",
    assetType,
    active: source.active === false ? false : true,
    sortOrder: getIntegerValue(source.sortOrder),
  };
}

function normalizeScopeType(value: unknown): PartnerContentScopeType {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CONTENT_SCOPE_TYPES.includes(normalized as PartnerContentScopeType)
    ? (normalized as PartnerContentScopeType)
    : "brand";
}

function normalizeAssetType(value: unknown): PartnerContentAssetType {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CONTENT_ASSET_TYPES.includes(normalized as PartnerContentAssetType)
    ? (normalized as PartnerContentAssetType)
    : "image";
}

function normalizeCategoryKey(value: unknown): PartnerContentCategoryKey {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CONTENT_CATEGORY_KEYS.includes(normalized as PartnerContentCategoryKey)
    ? (normalized as PartnerContentCategoryKey)
    : "other";
}

function normalizeDate(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function getIntegerValue(value: unknown) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildEmptyAdminData(
  persistence: PartnerPersistenceState,
): PartnerContentAdminData {
  return {
    campaigns: [],
    activeCampaign: null,
    products: [],
    brandAssets: [],
    templateAssets: [],
    ideas: [],
    allCampaigns: [],
    allProducts: [],
    allAssets: [],
    persistence,
  };
}

function buildDisabledState(message: string): PartnerPersistenceState {
  return {
    enabled: false,
    source: "disabled",
    message,
    updatedAt: null,
  };
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel concluir a operacao da Central de Conteudo no Supabase.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
