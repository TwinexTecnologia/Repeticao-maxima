import { createSupabaseServerClient } from "@/lib/supabase/server";
import { debtRows, stockRows } from "@/lib/operations-data";
import {
  getNuvemshopCredentials,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type {
  NuvemshopLocalizedText,
  NuvemshopOrder,
  NuvemshopProduct,
  NuvemshopVariant,
} from "@/lib/nuvemshop/types";

const OPERATIONS_SCHEMA = "repeticao_maxima";
const DEBTS_TABLE = "dividas_internas";
const STOCK_TABLE = "estoque_base";
const DTF_TABLE = "estoque_dtf";
const NUVEMSHOP_PAGE_SIZE = 100;
const NUVEMSHOP_MAX_PAGES = 6;

export type OperationalPersistenceState = {
  enabled: boolean;
  source: "supabase" | "disabled";
  message: string;
  updatedAt: string | null;
};

export type DebtStatus = "aberta" | "parcial" | "paga" | "cancelada" | "consumido";
export type DebtPaymentMethod =
  | "pix"
  | "boleto"
  | "cartao"
  | "transferencia"
  | "dinheiro"
  | "outro";
export type DebtBillingFrequency = "semanal" | "quinzenal" | "mensal";

export type InternalDebt = {
  id: string;
  title: string;
  category: string;
  dueDate: string;
  amount: number;
  status: DebtStatus;
  impact: string;
  paymentMethod: DebtPaymentMethod;
  billingFrequency: DebtBillingFrequency;
  installmentsTotal: number;
  installmentNumber: number;
  groupId: string;
  monthLabel: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BaseStockItem = {
  id: string;
  sku: string;
  color: string;
  size: string;
  total: number;
  printed: number;
  free: number;
  plain: number;
  printedReal: number;
  published: number;
  overcommitted: number;
  reorderPoint: number;
  leadTimeDays: number;
  recentSales30d: number;
  averageDailySales: number;
  coverageDays: number | null;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DtfArtType = "minimalista" | "full" | "outro";

export type DtfCatalogProduct = {
  productId: string;
  productName: string;
};

export type DtfStockItem = {
  id: string;
  nuvemshopProductId: string;
  productName: string;
  artType: DtfArtType;
  availableQty: number;
  reorderPoint: number;
  leadTimeDays: number;
  recentSales30d: number;
  estimatedCoverageDays: number | null;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type NuvemshopStockVariant = {
  id: string;
  sku: string;
  color: string;
  size: string;
  stock: number;
};

export type NuvemshopStockProduct = {
  productId: string;
  model: string;
  imageUrl: string | null;
  categories: string[];
  totalStock: number;
  variants: NuvemshopStockVariant[];
};

export async function loadDebtModuleData() {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      debts: getFallbackDebts(),
      persistence: buildDisabledState(
        `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar dividas no Supabase.`,
      ),
    };
  }

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(DEBTS_TABLE)
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const debts = (data ?? []).map(rowToDebt);

    return {
      debts: debts.length > 0 ? debts : [],
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          debts.length > 0
            ? "Dividas carregadas do Supabase."
            : "Supabase conectado. Ainda nao existem dividas cadastradas.",
        updatedAt: getLatestUpdatedAt(data ?? []),
      },
    };
  } catch (error) {
    return {
      debts: getFallbackDebts(),
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function createDebt(input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeDebtInput(input);
  const debtGroupId = crypto.randomUUID();
  const installmentRows = buildInstallmentRows(row, debtGroupId);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(DEBTS_TABLE)
      .insert(installmentRows)
      .select("*")
      .order("due_date", { ascending: true });

    if (error) {
      throw error;
    }

    return {
      ok: true as const,
      debts: (data ?? []).map(rowToDebt),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          installmentRows.length > 1
            ? "Divida parcelada salva no Supabase."
            : "Divida salva no Supabase.",
        updatedAt:
          getLatestUpdatedAt((data ?? []) as Array<Record<string, unknown>>),
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function updateDebtStatus(id: string, statusInput: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const status = normalizeDebtStatus(statusInput);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(DEBTS_TABLE)
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return {
      ok: true as const,
      debt: rowToDebt(data),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "Status da divida atualizado.",
        updatedAt:
          data && typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function loadStockModuleData() {
  const supabase = createSupabaseServerClient();
  const catalog = await loadDtfCatalogContext();

  if (!supabase.ok) {
    return {
      items: getFallbackStock(),
      dtfItems: [],
      dtfCatalog: catalog.products,
      nuvemshopStock: catalog.stockProducts,
      persistence: buildDisabledState(
        `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar estoque no Supabase.`,
      ),
      dtfPersistence: buildDisabledState(
        `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar DTF no Supabase.`,
      ),
      dtfCatalogState: catalog.state,
      nuvemshopStockState: catalog.stockState,
    };
  }

  try {
    const [{ data: stockData, error: stockError }, { data: dtfData, error: dtfError }] =
      await Promise.all([
        supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(STOCK_TABLE)
          .select("*")
          .order("color", { ascending: true })
          .order("size", { ascending: true }),
        supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(DTF_TABLE)
          .select("*")
          .order("product_name", { ascending: true }),
      ]);

    if (stockError) {
      throw stockError;
    }

    if (dtfError) {
      throw dtfError;
    }

    const items = (stockData ?? []).map((row) =>
      rowToStockItem(
        row,
        catalog.publishedByBaseColorSize,
        catalog.salesByBaseColorSize,
      ),
    );
    const dtfItems = (dtfData ?? []).map((row) =>
      rowToDtfItem(row, catalog.salesByProductId),
    );

    return {
      items: items.length > 0 ? items : [],
      dtfItems,
      dtfCatalog: catalog.products,
      nuvemshopStock: catalog.stockProducts,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          items.length > 0
            ? "Estoque carregado do Supabase."
            : "Supabase conectado. Ainda nao existem linhas de estoque cadastradas.",
        updatedAt: getLatestUpdatedAt(stockData ?? []),
      },
      dtfPersistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          dtfItems.length > 0
            ? "DTF carregado do Supabase."
            : "Supabase conectado. Ainda nao existem itens de DTF cadastrados.",
        updatedAt: getLatestUpdatedAt(dtfData ?? []),
      },
      dtfCatalogState: catalog.state,
      nuvemshopStockState: catalog.stockState,
    };
  } catch (error) {
    return {
      items: getFallbackStock(),
      dtfItems: [],
      dtfCatalog: catalog.products,
      nuvemshopStock: catalog.stockProducts,
      persistence: buildDisabledState(getErrorMessage(error)),
      dtfPersistence: buildDisabledState(getErrorMessage(error)),
      dtfCatalogState: catalog.state,
      nuvemshopStockState: catalog.stockState,
    };
  }
}

export async function createStockItem(input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeStockInput(input);
  const stampedContext = await loadStampedStockContext();

  try {
    const { data: existingRow, error: existingError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(STOCK_TABLE)
      .select("id, total_qty, printed_qty, reorder_point, lead_time_days, notes")
      .eq("sku", row.sku)
      .eq("color", row.color)
      .eq("size", row.size)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    const operation = existingRow?.id
      ? supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(STOCK_TABLE)
          .update({
            total_qty: getIntegerValue(existingRow.total_qty) + row.total,
            reorder_point:
              row.reorderPoint > 0
                ? row.reorderPoint
                : getIntegerValue(existingRow.reorder_point),
            lead_time_days:
              row.leadTimeDays > 0
                ? row.leadTimeDays
                : getIntegerValue(existingRow.lead_time_days) || 10,
            notes: row.notes || String(existingRow.notes ?? ""),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingRow.id)
      : supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(STOCK_TABLE)
          .insert({
            sku: row.sku,
            color: row.color,
            size: row.size,
            total_qty: row.total,
            printed_qty: row.printedReal,
            reorder_point: row.reorderPoint,
            lead_time_days: row.leadTimeDays,
            notes: row.notes,
          });

    const { data, error } = await operation
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return {
      ok: true as const,
      item: rowToStockItem(
        data,
        stampedContext.publishedByBaseColorSize,
        stampedContext.salesByBaseColorSize,
      ),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: existingRow?.id
          ? "Quantidade adicionada na linha existente do estoque."
          : "Linha de estoque salva no Supabase.",
        updatedAt:
          data && typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function updateStockItem(id: string, input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeStockInput(input);
  const stampedContext = await loadStampedStockContext();

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(STOCK_TABLE)
      .update({
        sku: row.sku,
        color: row.color,
        size: row.size,
        total_qty: row.total,
        printed_qty: row.printedReal,
        reorder_point: row.reorderPoint,
        lead_time_days: row.leadTimeDays,
        notes: row.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return {
      ok: true as const,
      item: rowToStockItem(
        data,
        stampedContext.publishedByBaseColorSize,
        stampedContext.salesByBaseColorSize,
      ),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "Saldos do estoque atualizados.",
        updatedAt:
          data && typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function createDtfItem(input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeDtfInput(input);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(DTF_TABLE)
      .upsert(
        {
          nuvemshop_product_id: row.nuvemshopProductId,
          product_name: row.productName,
          art_type: row.artType,
          available_qty: row.availableQty,
          reorder_point: row.reorderPoint,
          lead_time_days: row.leadTimeDays,
          notes: row.notes,
        },
        {
          onConflict: "nuvemshop_product_id",
        },
      )
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const recentSales = await loadSingleDtfSales(row.nuvemshopProductId);

    return {
      ok: true as const,
      item: rowToDtfItem(data, new Map([[row.nuvemshopProductId, recentSales]])),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "DTF salvo no Supabase.",
        updatedAt:
          data && typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function updateDtfItem(id: string, input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeDtfInput(input);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(DTF_TABLE)
      .update({
        nuvemshop_product_id: row.nuvemshopProductId,
        product_name: row.productName,
        art_type: row.artType,
        available_qty: row.availableQty,
        reorder_point: row.reorderPoint,
        lead_time_days: row.leadTimeDays,
        notes: row.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const recentSales = await loadSingleDtfSales(row.nuvemshopProductId);

    return {
      ok: true as const,
      item: rowToDtfItem(data, new Map([[row.nuvemshopProductId, recentSales]])),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "DTF atualizado.",
        updatedAt:
          data && typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

function rowToDebt(row: Record<string, unknown>): InternalDebt {
  const dueDate = row.due_date ? String(row.due_date) : "";

  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    category: String(row.category ?? ""),
    dueDate,
    amount: getNumberValue(row.amount),
    status: normalizeDebtStatus(row.status),
    impact: String(row.impact ?? ""),
    paymentMethod: normalizeDebtPaymentMethod(row.payment_method),
    billingFrequency: normalizeDebtBillingFrequency(row.billing_frequency),
    installmentsTotal: Math.max(getIntegerValue(row.installments_total), 1),
    installmentNumber: Math.max(getIntegerValue(row.installment_number), 1),
    groupId: String(row.group_id ?? ""),
    monthLabel: dueDate ? formatDebtMonth(dueDate) : "Sem data",
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function rowToStockItem(
  row: Record<string, unknown>,
  publishedByBaseColorSize: Map<string, number>,
  salesByBaseColorSize: Map<string, number>,
): BaseStockItem {
  const total = getIntegerValue(row.total_qty);
  const printedReal = Math.min(getIntegerValue(row.printed_qty), total);
  const sku = String(row.sku ?? "");
  const color = String(row.color ?? "");
  const size = String(row.size ?? "");
  const published =
    publishedByBaseColorSize.get(buildStockKey(sku, color, size)) ?? 0;
  const free = Math.max(total - published, 0);
  const recentSales30d =
    salesByBaseColorSize.get(buildStockKey(sku, color, size)) ?? 0;
  const averageDailySales =
    recentSales30d > 0 ? Math.round((recentSales30d / 30) * 10) / 10 : 0;
  const coverageDays =
    averageDailySales > 0 ? Math.round((total / averageDailySales) * 10) / 10 : null;

  return {
    id: String(row.id ?? ""),
    sku,
    color,
    size,
    total,
    printed: published,
    free,
    plain: Math.max(total - printedReal, 0),
    printedReal,
    published,
    overcommitted: Math.max(published - total, 0),
    reorderPoint: getIntegerValue(row.reorder_point),
    leadTimeDays: Math.max(getIntegerValue(row.lead_time_days), 0),
    recentSales30d,
    averageDailySales,
    coverageDays,
    notes: String(row.notes ?? ""),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function rowToDtfItem(
  row: Record<string, unknown>,
  salesByProductId: Map<string, number>,
): DtfStockItem {
  const productId = String(row.nuvemshop_product_id ?? "");
  const availableQty = getIntegerValue(row.available_qty);
  const recentSales30d = salesByProductId.get(productId) ?? 0;
  const averageDailySales = recentSales30d > 0 ? recentSales30d / 30 : 0;
  const estimatedCoverageDays =
    averageDailySales > 0 ? Math.round((availableQty / averageDailySales) * 10) / 10 : null;

  return {
    id: String(row.id ?? ""),
    nuvemshopProductId: productId,
    productName: String(row.product_name ?? ""),
    artType: normalizeDtfArtType(row.art_type),
    availableQty,
    reorderPoint: getIntegerValue(row.reorder_point),
    leadTimeDays: getIntegerValue(row.lead_time_days),
    recentSales30d,
    estimatedCoverageDays,
    notes: String(row.notes ?? ""),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function normalizeDebtInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const installments = Math.max(getIntegerValue(source.installments), 1);
  const dueDate = normalizeDate(source.dueDate) || getTodayDate();

  return {
    title: String(source.title ?? "").trim() || "Nova divida",
    category: String(source.category ?? "").trim() || "Operacional",
    dueDate,
    amount: Math.max(getNumberValue(source.amount), 0),
    status: normalizeDebtStatus(source.status),
    impact: String(source.impact ?? "").trim(),
    paymentMethod: normalizeDebtPaymentMethod(source.paymentMethod),
    billingFrequency: normalizeDebtBillingFrequency(source.billingFrequency),
    installments,
  };
}

function normalizeStockInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const total = Math.max(getIntegerValue(source.total), 0);
  const printedReal = Math.max(
    getIntegerValue(source.printedReal ?? source.internalPrinted),
    0,
  );

  return {
    sku: String(source.sku ?? "").trim() || "Camiseta base",
    color: String(source.color ?? "").trim() || "Preta",
    size: String(source.size ?? "").trim() || "M",
    total,
    printedReal: Math.min(printedReal, total),
    reorderPoint: Math.max(getIntegerValue(source.reorderPoint), 0),
    leadTimeDays: Math.max(getIntegerValue(source.leadTimeDays), 10),
    notes: String(source.notes ?? "").trim(),
  };
}

function normalizeDtfInput(input: unknown) {
  const source = isRecord(input) ? input : {};

  return {
    nuvemshopProductId: String(source.nuvemshopProductId ?? "").trim(),
    productName: String(source.productName ?? "").trim() || "Produto Nuvemshop",
    artType: normalizeDtfArtType(source.artType),
    availableQty: Math.max(getIntegerValue(source.availableQty), 0),
    reorderPoint: Math.max(getIntegerValue(source.reorderPoint), 0),
    leadTimeDays: Math.max(getIntegerValue(source.leadTimeDays), 0),
    notes: String(source.notes ?? "").trim(),
  };
}

function normalizeDebtStatus(value: unknown): DebtStatus {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "aberta" ||
    normalized === "parcial" ||
    normalized === "paga" ||
    normalized === "cancelada" ||
    normalized === "consumido"
  ) {
    return normalized;
  }

  return "aberta";
}

function normalizeDebtPaymentMethod(value: unknown): DebtPaymentMethod {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "pix" ||
    normalized === "boleto" ||
    normalized === "cartao" ||
    normalized === "transferencia" ||
    normalized === "dinheiro" ||
    normalized === "outro"
  ) {
    return normalized;
  }

  return "outro";
}

function normalizeDebtBillingFrequency(value: unknown): DebtBillingFrequency {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "semanal" ||
    normalized === "quinzenal" ||
    normalized === "mensal"
  ) {
    return normalized;
  }

  return "mensal";
}

function normalizeDtfArtType(value: unknown): DtfArtType {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "minimalista" ||
    normalized === "full" ||
    normalized === "outro"
  ) {
    return normalized;
  }

  return "outro";
}

function getFallbackDebts(): InternalDebt[] {
  return debtRows.map((row, index) => ({
    id: `fallback-debt-${index + 1}`,
    title: row.title,
    category: row.category,
    dueDate: "",
    amount: parseMoney(row.amount),
    status: normalizeDebtStatus(row.status),
    impact: row.impact,
    paymentMethod: "outro",
    billingFrequency: "mensal",
    installmentsTotal: 1,
    installmentNumber: 1,
    groupId: `fallback-group-${index + 1}`,
    monthLabel: "Sem data",
    createdAt: null,
    updatedAt: null,
  }));
}

function getFallbackStock(): BaseStockItem[] {
  return stockRows.map((row, index) => ({
    id: `fallback-stock-${index + 1}`,
    sku: row.sku,
    color: row.color,
    size: row.size,
    total: getIntegerValue(row.total),
    printed: getIntegerValue(row.printed),
    free: Math.max(getIntegerValue(row.total) - getIntegerValue(row.printed), 0),
    plain: Math.max(
      getIntegerValue(row.total) - Math.min(getIntegerValue(row.printed), getIntegerValue(row.total)),
      0,
    ),
    printedReal: Math.min(getIntegerValue(row.printed), getIntegerValue(row.total)),
    published: getIntegerValue(row.printed),
    overcommitted: 0,
    reorderPoint: getIntegerValue(row.reorderPoint),
    leadTimeDays: 10,
    recentSales30d: 0,
    averageDailySales: 0,
    coverageDays: null,
    notes: row.action,
    createdAt: null,
    updatedAt: null,
  }));
}

async function loadDtfCatalogContext() {
  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return {
      products: [] as DtfCatalogProduct[],
      stockProducts: [] as NuvemshopStockProduct[],
      salesByProductId: new Map<string, number>(),
      publishedByBaseColorSize: new Map<string, number>(),
      salesByBaseColorSize: new Map<string, number>(),
      state: buildDisabledState(
        `Catalogo da Nuvemshop indisponivel. Configure ${credentials.missing.join(" e ")}.`,
      ),
      stockState: buildDisabledState(
        `Catalogo da Nuvemshop indisponivel. Configure ${credentials.missing.join(" e ")}.`,
      ),
    };
  }

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const products = await fetchAllNuvemshopPages((params) =>
      client.listProducts(params),
    );
    const stockProducts = buildNuvemshopStockProducts(products);
    const publishedByBaseColorSize = buildPublishedStockByBaseColorSizeMap(products);
    let salesByProductId = new Map<string, number>();
    let salesByBaseColorSize = new Map<string, number>();
    let stateMessage = "Catalogo da Nuvemshop conectado para mapear o DTF aos produtos.";

    try {
      const orders = await fetchAllNuvemshopPages((params) => client.listOrders(params));
      salesByProductId = buildRecentSalesMap(orders);
      salesByBaseColorSize = buildRecentSalesByBaseColorSizeMap(orders, products);
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha ao ler pedidos";
      stateMessage = `Catalogo da Nuvemshop conectado, mas as vendas 30d do DTF nao puderam ser lidas: ${message}.`;
    }

    const mappedProducts = products
      .map((product) => ({
        productId: String(product.id),
        productName: getLocalizedText(product.name),
      }))
      .sort((left, right) => left.productName.localeCompare(right.productName));

    return {
      products: mappedProducts,
      stockProducts,
      salesByProductId,
      publishedByBaseColorSize,
      salesByBaseColorSize,
      state: {
        enabled: true,
        source: "supabase" as const,
        message: stateMessage,
        updatedAt: new Date().toISOString(),
      },
      stockState: {
        enabled: true,
        source: "supabase" as const,
        message: "Estoque da Nuvemshop carregado com foto, modelo, cor e tamanho.",
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      products: [] as DtfCatalogProduct[],
      stockProducts: [] as NuvemshopStockProduct[],
      salesByProductId: new Map<string, number>(),
      publishedByBaseColorSize: new Map<string, number>(),
      salesByBaseColorSize: new Map<string, number>(),
      state: buildDisabledState(
        error instanceof Error
          ? `Nao foi possivel ler os produtos da Nuvemshop: ${error.message}.`
          : "Nao foi possivel ler os produtos da Nuvemshop.",
      ),
      stockState: buildDisabledState(
        error instanceof Error
          ? `Nao foi possivel ler o estoque da Nuvemshop: ${error.message}.`
          : "Nao foi possivel ler o estoque da Nuvemshop.",
      ),
    };
  }
}

async function loadStampedStockContext() {
  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return {
      publishedByBaseColorSize: new Map<string, number>(),
      salesByBaseColorSize: new Map<string, number>(),
    };
  }

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const products = await fetchAllNuvemshopPages((params) =>
      client.listProducts(params),
    );
    const orders = await fetchAllNuvemshopPages((params) => client.listOrders(params));

    return {
      publishedByBaseColorSize: buildPublishedStockByBaseColorSizeMap(products),
      salesByBaseColorSize: buildRecentSalesByBaseColorSizeMap(orders, products),
    };
  } catch {
    return {
      publishedByBaseColorSize: new Map<string, number>(),
      salesByBaseColorSize: new Map<string, number>(),
    };
  }
}

async function loadSingleDtfSales(productId: string) {
  if (!productId) {
    return 0;
  }

  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return 0;
  }

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const orders = await fetchAllNuvemshopPages((params) => client.listOrders(params));
    return buildRecentSalesMap(orders).get(productId) ?? 0;
  } catch {
    return 0;
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

function buildRecentSalesMap(orders: NuvemshopOrder[]) {
  const sales = new Map<string, number>();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  for (const order of orders) {
    if (!order.created_at) {
      continue;
    }

    const createdAt = new Date(order.created_at);
    if (Number.isNaN(createdAt.getTime()) || createdAt < cutoff) {
      continue;
    }

    for (const product of order.products || []) {
      const productId = product.product_id ? String(product.product_id) : "";
      if (!productId) {
        continue;
      }

      const quantity =
        typeof product.quantity === "number" && Number.isFinite(product.quantity)
          ? product.quantity
          : 0;

      sales.set(productId, (sales.get(productId) ?? 0) + quantity);
    }
  }

  return sales;
}

function buildRecentSalesByBaseColorSizeMap(
  orders: NuvemshopOrder[],
  products: NuvemshopProduct[],
) {
  const sales = new Map<string, number>();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const variantCatalog = buildVariantCatalog(products);
  const productBaseCatalog = buildProductBaseCatalog(products);

  for (const order of orders) {
    if (!order.created_at) {
      continue;
    }

    const createdAt = new Date(order.created_at);
    if (Number.isNaN(createdAt.getTime()) || createdAt < cutoff) {
      continue;
    }

    for (const product of order.products || []) {
      const quantity =
        typeof product.quantity === "number" && Number.isFinite(product.quantity)
          ? product.quantity
          : 0;

      if (quantity <= 0) {
        continue;
      }

      const variantId = product.variant_id ? String(product.variant_id) : "";
      const variantEntry = variantId ? variantCatalog.get(variantId) : undefined;
      const fallbackBaseCategories = product.product_id
        ? productBaseCatalog.get(String(product.product_id)) ?? []
        : [];
      const fallbackVariant = getOrderProductColorAndSize(product);
      const baseCategories =
        variantEntry?.baseCategories.length && variantEntry.baseCategories.length > 0
          ? variantEntry.baseCategories
          : fallbackBaseCategories;
      const color = variantEntry?.color ?? fallbackVariant.color;
      const size = variantEntry?.size ?? fallbackVariant.size;

      if (!color || !size || baseCategories.length === 0) {
        continue;
      }

      for (const baseCategory of baseCategories) {
        const key = buildStockKey(baseCategory, color, size);
        sales.set(key, (sales.get(key) ?? 0) + quantity);
      }
    }
  }

  return sales;
}

function buildPublishedStockByBaseColorSizeMap(
  products: Array<Record<string, unknown>>,
) {
  const stockMap = new Map<string, number>();

  for (const rawProduct of products) {
    const product = rawProduct as {
      name?: NuvemshopLocalizedText;
      handle?: NuvemshopLocalizedText;
      tags?: unknown;
      categories?: Array<{ name?: NuvemshopLocalizedText }>;
      attributes?: NuvemshopLocalizedText[];
      variants?: Array<Record<string, unknown>>;
    };

    const baseCategories = getStockBaseCategories(
      (product.categories || [])
      .map((category) => getLocalizedText(category.name))
      .filter((value) => value && value !== "-"),
    );

    if (baseCategories.length === 0) {
      continue;
    }

    const attributeNames = (product.attributes || []).map((value) =>
      getLocalizedText(value),
    );

    for (const rawVariant of product.variants || []) {
      const variant = rawVariant as {
        stock?: unknown;
        inventory?: unknown;
        inventory_levels?: Array<{ stock?: unknown }>;
        values?: NuvemshopLocalizedText[];
      };
      const { color, size } = getVariantColorAndSize(
        attributeNames,
        variant.values || [],
      );

      if (!color || !size) {
        continue;
      }

      const quantity = getVariantStockValue(variant);
      for (const baseCategory of baseCategories) {
        const key = buildStockKey(baseCategory, color, size);
        stockMap.set(key, (stockMap.get(key) ?? 0) + quantity);
      }
    }
  }

  return stockMap;
}

function buildVariantCatalog(products: NuvemshopProduct[]) {
  const catalog = new Map<
    string,
    {
      baseCategories: string[];
      color: string;
      size: string;
    }
  >();

  for (const product of products) {
    const baseCategories = getStockBaseCategories(
      (product.categories || [])
        .map((category) => getLocalizedText(category.name))
        .filter((value) => value && value !== "-"),
    );
    const attributeNames = (product.attributes || []).map((value) =>
      getLocalizedText(value),
    );

    for (const variant of product.variants || []) {
      const { color, size } = getVariantColorAndSize(
        attributeNames,
        variant.values || [],
      );

      if (!color || !size || baseCategories.length === 0) {
        continue;
      }

      catalog.set(String(variant.id), {
        baseCategories,
        color,
        size,
      });
    }
  }

  return catalog;
}

function buildProductBaseCatalog(products: NuvemshopProduct[]) {
  const catalog = new Map<string, string[]>();

  for (const product of products) {
    const baseCategories = getStockBaseCategories(
      (product.categories || [])
        .map((category) => getLocalizedText(category.name))
        .filter((value) => value && value !== "-"),
    );

    if (baseCategories.length > 0) {
      catalog.set(String(product.id), baseCategories);
    }
  }

  return catalog;
}

function buildNuvemshopStockProducts(products: NuvemshopProduct[]) {
  const items: NuvemshopStockProduct[] = [];

  for (const product of products) {
    const attributeNames = (product.attributes || []).map((value) =>
      getLocalizedText(value),
    );
    const categories = (product.categories || [])
      .map((category) => getLocalizedText(category.name))
      .filter((value) => value && value !== "-");
    const variants = (product.variants || [])
      .map((variant) => buildNuvemshopStockVariant(attributeNames, variant))
      .filter((variant): variant is NuvemshopStockVariant => Boolean(variant))
      .sort((left, right) => {
        const leftKey = `${normalizeColor(left.color)}-${normalizeSize(left.size)}`;
        const rightKey = `${normalizeColor(right.color)}-${normalizeSize(right.size)}`;
        return leftKey.localeCompare(rightKey);
      });

    if (variants.length === 0) {
      continue;
    }

    items.push({
      productId: String(product.id),
      model: getLocalizedText(product.name),
      imageUrl:
        product.images && product.images[0] && typeof product.images[0].src === "string"
          ? product.images[0].src
          : null,
      categories,
      totalStock: variants.reduce((sum, variant) => sum + variant.stock, 0),
      variants,
    });
  }

  return items.sort((left, right) => left.model.localeCompare(right.model));
}

function buildNuvemshopStockVariant(
  attributeNames: string[],
  variant: NuvemshopVariant,
) {
  const { color, size } = getVariantColorAndSize(
    attributeNames,
    variant.values || [],
  );

  if (!color || !size) {
    return null;
  }

  return {
    id: String(variant.id),
    sku: variant.sku || "-",
    color,
    size,
    stock: getVariantStockValue(variant),
  };
}

function getVariantColorAndSize(
  attributeNames: string[],
  values: NuvemshopLocalizedText[],
) {
  let color = "";
  let size = "";

  for (const [index, value] of values.entries()) {
    const attributeName = normalizeText(attributeNames[index] || "");
    const attributeValue = String(getLocalizedText(value)).trim();
    const normalizedValue = normalizeText(attributeValue);

    if (!attributeValue || attributeValue === "-") {
      continue;
    }

    if (attributeName.includes("cor")) {
      color = attributeValue;
      continue;
    }

    if (attributeName.includes("tamanho")) {
      size = attributeValue;
      continue;
    }

    if (!color && isKnownColorValue(normalizedValue)) {
      color = attributeValue;
      continue;
    }

    if (!size && isKnownSizeValue(normalizedValue)) {
      size = attributeValue;
    }
  }

  return { color, size };
}

function getVariantStockValue(variant: {
  stock?: unknown;
  inventory?: unknown;
  inventory_levels?: Array<{ stock?: unknown }>;
}) {
  if (typeof variant.stock === "number" && Number.isFinite(variant.stock)) {
    return Math.max(Math.trunc(variant.stock), 0);
  }

  if (
    typeof variant.inventory === "number" &&
    Number.isFinite(variant.inventory)
  ) {
    return Math.max(Math.trunc(variant.inventory), 0);
  }

  if (Array.isArray(variant.inventory_levels)) {
    return variant.inventory_levels.reduce((sum, level) => {
      return sum + Math.max(getIntegerValue(level.stock), 0);
    }, 0);
  }

  return 0;
}

function getOrderProductColorAndSize(product: {
  variant_values?: unknown[];
  properties?: unknown[];
}) {
  const sources = [
    ...(Array.isArray(product.variant_values) ? product.variant_values : []),
    ...(Array.isArray(product.properties) ? product.properties : []),
  ];
  let color = "";
  let size = "";

  for (const entry of sources) {
    if (typeof entry === "string") {
      const normalized = normalizeText(entry);
      if (!color && isKnownColorValue(normalized)) {
        color = entry;
      }
      if (!size && isKnownSizeValue(normalized)) {
        size = entry;
      }
      continue;
    }

    if (!isRecord(entry)) {
      continue;
    }

    const values = [
      String(entry.pt ?? ""),
      String(entry.en ?? ""),
      String(entry.es ?? ""),
      String(entry.value ?? ""),
      String(entry.name ?? ""),
    ].filter(Boolean);

    for (const value of values) {
      const normalized = normalizeText(value);
      if (!color && isKnownColorValue(normalized)) {
        color = value;
      }
      if (!size && isKnownSizeValue(normalized)) {
        size = value;
      }
    }
  }

  return { color, size };
}

function getStockBaseCategories(categories: string[]) {
  const filtered = categories.filter(
    (category) => !isBlockedStockCategory(category),
  );

  return filtered.length > 0 ? filtered : categories;
}

function isBlockedStockCategory(category: string) {
  const normalized = normalizeText(category);

  return (
    normalized === "full estampa" ||
    normalized === "minimalista" ||
    normalized === "outlet"
  );
}

function buildStockKey(base: string, color: string, size: string) {
  return `${normalizeProductBase(base)}::${normalizeColor(color)}::${normalizeSize(size)}`;
}

function normalizeProductBase(value: string) {
  return normalizeText(value);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeColor(value: string) {
  const normalized = normalizeText(value);

  if (normalized === "preta" || normalized === "preto") {
    return "preto";
  }

  if (normalized === "branca" || normalized === "branco") {
    return "branco";
  }

  if (normalized === "roxa" || normalized === "roxo") {
    return "roxo";
  }

  if (
    normalized === "avela" ||
    normalized === "avelã" ||
    normalized === "bege" ||
    normalized === "camel"
  ) {
    return "avela";
  }

  return normalized;
}

function normalizeSize(value: string) {
  const normalized = normalizeText(value).replace(/\s+/g, "");

  if (normalized === "pp") {
    return "pp";
  }

  if (normalized === "p") {
    return "p";
  }

  if (normalized === "m") {
    return "m";
  }

  if (normalized === "g") {
    return "g";
  }

  if (
    normalized === "gg" ||
    normalized === "g1" ||
    normalized === "xg" ||
    normalized === "xl"
  ) {
    return "gg";
  }

  if (
    normalized === "xgg" ||
    normalized === "g2" ||
    normalized === "xxg" ||
    normalized === "xxl"
  ) {
    return "xgg";
  }

  if (normalized === "g3" || normalized === "xxxg" || normalized === "xxxl") {
    return "g3";
  }

  return normalized.toUpperCase();
}

function isKnownColorValue(value: string) {
  const normalized = normalizeColor(value);

  return (
    normalized === "preto" ||
    normalized === "branco" ||
    normalized === "roxo" ||
    normalized === "avela"
  );
}

function isKnownSizeValue(value: string) {
  const normalized = normalizeSize(value);

  return (
    normalized === "pp" ||
    normalized === "p" ||
    normalized === "m" ||
    normalized === "g" ||
    normalized === "gg" ||
    normalized === "xgg" ||
    normalized === "g3"
  );
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

function parseMoney(value: string) {
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    return parseMoney(value);
  }

  return 0;
}

function getIntegerValue(value: unknown) {
  const parsed = Math.trunc(getNumberValue(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

function formatDebtMonth(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildInstallmentRows(
  row: ReturnType<typeof normalizeDebtInput>,
  groupId: string,
) {
  const baseDate = new Date(`${row.dueDate}T00:00:00`);
  const installments = splitAmount(row.amount, row.installments);

  return installments.map((amount, index) => {
    const scheduledDate = addBillingFrequency(baseDate, index, row.billingFrequency);

    return {
      title: row.title,
      category: row.category,
      due_date: formatDateForDb(scheduledDate),
      amount,
      status: row.status,
      impact: row.impact,
      payment_method: row.paymentMethod,
      billing_frequency: row.billingFrequency,
      installments_total: row.installments,
      installment_number: index + 1,
      group_id: groupId,
    };
  });
}

function addBillingFrequency(
  date: Date,
  steps: number,
  frequency: DebtBillingFrequency,
) {
  if (steps === 0) {
    return new Date(date);
  }

  if (frequency === "semanal") {
    return addDays(date, steps * 7);
  }

  if (frequency === "quinzenal") {
    return addDays(date, steps * 15);
  }

  return addMonths(date, steps);
}

function splitAmount(total: number, installments: number) {
  const totalInCents = Math.round(total * 100);
  const base = Math.floor(totalInCents / installments);
  const remainder = totalInCents % installments;

  return Array.from({ length: installments }, (_, index) => {
    const cents = base + (index < remainder ? 1 : 0);
    return cents / 100;
  });
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateForDb(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDate() {
  return formatDateForDb(new Date());
}

function getLatestUpdatedAt(rows: Array<Record<string, unknown>>) {
  const values = rows
    .map((row) => (typeof row.updated_at === "string" ? row.updated_at : null))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left));

  return values[0] ?? null;
}

function buildDisabledState(message: string): OperationalPersistenceState {
  return {
    enabled: false,
    source: "disabled",
    message,
    updatedAt: null,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `Nao foi possivel acessar o Supabase: ${error.message}. Confirme que o schema repeticao_maxima foi adicionado em Settings > API > Exposed schemas e que o SQL foi executado com os GRANTs de acesso ao schema e as tabelas.`;
  }

  return "Nao foi possivel acessar o Supabase para salvar os dados internos. Verifique se o schema repeticao_maxima esta exposto na API e se o SQL foi executado com as permissoes de acesso.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
