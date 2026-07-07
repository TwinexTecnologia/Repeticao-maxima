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
const FINANCE_BALANCES_TABLE = "financeiro_saldos_mensais";
const FINANCE_MOVEMENTS_TABLE = "financeiro_movimentacoes";
const STOCK_TABLE = "estoque_base";
const STOCK_MOVEMENTS_TABLE = "estoque_movimentacoes";
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

export type FinancialMovementType = "entrada" | "saida";

export type MonthlyOpeningBalance = {
  id: string;
  monthRef: string;
  openingBalance: number;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ManualFinanceMovement = {
  id: string;
  movementDate: string;
  type: FinancialMovementType;
  title: string;
  category: string;
  amount: number;
  paymentMethod: DebtPaymentMethod;
  notes: string;
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

export type StockSelectionOption = {
  id: string;
  sku: string;
  color: string;
  size: string;
  total: number;
  printedReal: number;
  plain: number;
  notes: string;
};

export type StockMovementType = "entrada" | "saida" | "ajuste";

export type StockMovement = {
  id: string;
  stockItemId: string | null;
  sku: string;
  color: string;
  size: string;
  movementType: StockMovementType;
  quantity: number;
  plainBefore: number;
  plainAfter: number;
  reasonCategory: string;
  reasonText: string;
  sourceModule: string;
  createdAt: string | null;
};

export type SiteArtSelectionOption = {
  id: string;
  artName: string;
  sku: string;
  color: string;
  size: string;
  publishedStock: number;
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

export async function loadManualFinanceModuleData(selectedMonth: string) {
  const supabase = createSupabaseServerClient();
  const monthRef = normalizeMonthReference(selectedMonth) || getCurrentMonthReference();
  const monthStart = `${monthRef}-01`;
  const monthEnd = getMonthEndDate(monthRef);

  if (!supabase.ok) {
    return {
      balance: null as MonthlyOpeningBalance | null,
      movements: [] as ManualFinanceMovement[],
      persistence: buildDisabledState(
        `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar o financeiro manual no Supabase.`,
      ),
    };
  }

  try {
    const [{ data: balanceData, error: balanceError }, { data: movementData, error: movementError }] =
      await Promise.all([
        supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(FINANCE_BALANCES_TABLE)
          .select("*")
          .eq("month_ref", monthStart)
          .maybeSingle(),
        supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(FINANCE_MOVEMENTS_TABLE)
          .select("*")
          .gte("movement_date", monthStart)
          .lte("movement_date", monthEnd)
          .order("movement_date", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (balanceError) {
      throw balanceError;
    }

    if (movementError) {
      throw movementError;
    }

    const movements = (movementData ?? []).map(rowToManualFinanceMovement);
    const latestUpdatedAt = getLatestUpdatedAt([
      ...(balanceData ? [balanceData as Record<string, unknown>] : []),
      ...((movementData ?? []) as Array<Record<string, unknown>>),
    ]);

    return {
      balance: balanceData ? rowToMonthlyOpeningBalance(balanceData) : null,
      movements,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          balanceData || movements.length > 0
            ? "Financeiro manual carregado do Supabase."
            : "Supabase conectado. Ainda nao existem saldo inicial nem movimentacoes para este mes.",
        updatedAt: latestUpdatedAt,
      },
    };
  } catch (error) {
    return {
      balance: null as MonthlyOpeningBalance | null,
      movements: [] as ManualFinanceMovement[],
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function saveMonthlyOpeningBalance(input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeMonthlyOpeningBalanceInput(input);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(FINANCE_BALANCES_TABLE)
      .upsert(
        {
          month_ref: `${row.monthRef}-01`,
          opening_balance: row.openingBalance,
          notes: row.notes,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "month_ref",
        },
      )
      .select("*")
      .single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel salvar o saldo inicial do mes.");
    }

    return {
      ok: true as const,
      balance: rowToMonthlyOpeningBalance(data),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "Saldo inicial do mes salvo com sucesso.",
        updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function createManualFinanceMovement(input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeManualFinanceMovementInput(input);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(FINANCE_MOVEMENTS_TABLE)
      .insert({
        movement_date: row.movementDate,
        movement_type: row.type,
        title: row.title,
        category: row.category,
        amount: row.amount,
        payment_method: row.paymentMethod,
        notes: row.notes,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel salvar a movimentacao financeira.");
    }

    return {
      ok: true as const,
      movement: rowToManualFinanceMovement(data),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          row.type === "entrada"
            ? "Entrada manual registrada com sucesso."
            : "Saida manual registrada com sucesso.",
        updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function loadStockSelectionOptions() {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return [] as StockSelectionOption[];
  }

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(STOCK_TABLE)
      .select("id, sku, color, size, total_qty, printed_qty, notes")
      .order("sku", { ascending: true })
      .order("color", { ascending: true })
      .order("size", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => {
      const total = getIntegerValue(row.total_qty);
      const printedReal = Math.min(getIntegerValue(row.printed_qty), total);

      return {
        id: String(row.id ?? ""),
        sku: String(row.sku ?? ""),
        color: String(row.color ?? ""),
        size: String(row.size ?? ""),
        total,
        printedReal,
        plain: Math.max(total - printedReal, 0),
        notes: String(row.notes ?? ""),
      };
    });
  } catch {
    return [] as StockSelectionOption[];
  }
}

export async function loadSiteArtSelectionOptions() {
  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return [] as SiteArtSelectionOption[];
  }

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const products = await fetchAllNuvemshopPages((params) =>
      client.listProducts(params),
    );

    return buildSiteArtSelectionOptions(products);
  } catch {
    return [] as SiteArtSelectionOption[];
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
      movements: [] as StockMovement[],
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
    const [
      { data: stockData, error: stockError },
      { data: dtfData, error: dtfError },
      { data: movementData, error: movementError },
    ] =
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
        supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(STOCK_MOVEMENTS_TABLE)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(80),
      ]);

    if (stockError) {
      throw stockError;
    }

    if (dtfError) {
      throw dtfError;
    }

    if (movementError) {
      throw movementError;
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
    const movements = (movementData ?? []).map(rowToStockMovement);

    return {
      items: items.length > 0 ? items : [],
      movements,
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
      movements: [] as StockMovement[],
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

    const previousTotal = getIntegerValue(existingRow?.total_qty);
    const previousPrinted = Math.min(
      getIntegerValue(existingRow?.printed_qty),
      previousTotal,
    );
    const previousPlain = Math.max(previousTotal - previousPrinted, 0);

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

    const nextItem = rowToStockItem(
      data,
      stampedContext.publishedByBaseColorSize,
      stampedContext.salesByBaseColorSize,
    );

    if (row.total > 0) {
      await createStockMovement(supabase.client, {
        stockItemId: String(data.id ?? existingRow?.id ?? ""),
        sku: nextItem.sku,
        color: nextItem.color,
        size: nextItem.size,
        movementType: "entrada",
        quantity: row.total,
        plainBefore: previousPlain,
        plainAfter: nextItem.plain,
        reasonCategory: row.movementReasonCategory || "entrada_lote",
        reasonText:
          row.movementReasonText ||
          (existingRow?.id
            ? "Saldo adicionado em linha existente."
            : "Cadastro inicial da linha de estoque."),
        sourceModule: row.movementSourceModule || "estoque",
      });
    }

    return {
      ok: true as const,
      item: nextItem,
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
    const { data: existingRow, error: existingError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(STOCK_TABLE)
      .select("*")
      .eq("id", id)
      .single();

    if (existingError || !existingRow) {
      throw existingError || new Error("Nao foi possivel localizar a linha do estoque.");
    }

    const previousItem = rowToStockItem(
      existingRow,
      stampedContext.publishedByBaseColorSize,
      stampedContext.salesByBaseColorSize,
    );
    const nextPlain = Math.max(row.total - row.printedReal, 0);
    const plainDelta = nextPlain - previousItem.plain;

    if (plainDelta !== 0 && !row.movementReasonText) {
      throw new Error("Informe a justificativa dessa movimentacao de estoque.");
    }

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

    const nextItem = rowToStockItem(
      data,
      stampedContext.publishedByBaseColorSize,
      stampedContext.salesByBaseColorSize,
    );

    if (plainDelta !== 0) {
      await createStockMovement(supabase.client, {
        stockItemId: nextItem.id,
        sku: nextItem.sku,
        color: nextItem.color,
        size: nextItem.size,
        movementType:
          plainDelta > 0
            ? "entrada"
            : row.movementReasonCategory === "correcao_ajuste"
              ? "ajuste"
              : "saida",
        quantity: Math.abs(plainDelta),
        plainBefore: previousItem.plain,
        plainAfter: nextItem.plain,
        reasonCategory: row.movementReasonCategory || "ajuste_manual",
        reasonText: row.movementReasonText,
        sourceModule: row.movementSourceModule || "estoque",
      });
    }

    return {
      ok: true as const,
      item: nextItem,
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

function rowToMonthlyOpeningBalance(row: Record<string, unknown>): MonthlyOpeningBalance {
  return {
    id: String(row.id ?? ""),
    monthRef: String(row.month_ref ?? "").slice(0, 7),
    openingBalance: getNumberValue(row.opening_balance),
    notes: String(row.notes ?? "").trim(),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function rowToManualFinanceMovement(row: Record<string, unknown>): ManualFinanceMovement {
  return {
    id: String(row.id ?? ""),
    movementDate: normalizeDate(row.movement_date) || getTodayDate(),
    type: normalizeFinancialMovementType(row.movement_type),
    title: String(row.title ?? "").trim(),
    category: String(row.category ?? "").trim(),
    amount: Math.max(getNumberValue(row.amount), 0),
    paymentMethod: normalizeDebtPaymentMethod(row.payment_method),
    notes: String(row.notes ?? "").trim(),
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
  const plain = Math.max(total - printedReal, 0);
  const recentSales30d =
    salesByBaseColorSize.get(buildStockKey(sku, color, size)) ?? 0;
  const averageDailySales =
    recentSales30d > 0 ? Math.round((recentSales30d / 30) * 10) / 10 : 0;
  const coverageDays =
    averageDailySales > 0 ? Math.round((plain / averageDailySales) * 10) / 10 : null;

  return {
    id: String(row.id ?? ""),
    sku,
    color,
    size,
    total,
    printed: published,
    free,
    plain,
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

function rowToStockMovement(row: Record<string, unknown>): StockMovement {
  return {
    id: String(row.id ?? ""),
    stockItemId: row.stock_item_id ? String(row.stock_item_id) : null,
    sku: String(row.sku ?? ""),
    color: String(row.color ?? ""),
    size: String(row.size ?? ""),
    movementType: normalizeStockMovementType(row.movement_type),
    quantity: Math.max(getIntegerValue(row.quantity), 0),
    plainBefore: Math.max(getIntegerValue(row.plain_before), 0),
    plainAfter: Math.max(getIntegerValue(row.plain_after), 0),
    reasonCategory: String(row.reason_category ?? "").trim(),
    reasonText: String(row.reason_text ?? "").trim(),
    sourceModule: String(row.source_module ?? "").trim(),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
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

function normalizeMonthlyOpeningBalanceInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const monthRef = normalizeMonthReference(source.monthRef) || getCurrentMonthReference();

  return {
    monthRef,
    openingBalance: getNumberValue(source.openingBalance),
    notes: String(source.notes ?? "").trim(),
  };
}

function normalizeManualFinanceMovementInput(input: unknown) {
  const source = isRecord(input) ? input : {};

  return {
    movementDate: normalizeDate(source.movementDate) || getTodayDate(),
    type: normalizeFinancialMovementType(source.type),
    title: String(source.title ?? "").trim() || "Movimentacao manual",
    category: String(source.category ?? "").trim() || "Operacional",
    amount: Math.max(getNumberValue(source.amount), 0),
    paymentMethod: normalizeDebtPaymentMethod(source.paymentMethod),
    notes: String(source.notes ?? "").trim(),
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
    movementReasonCategory: String(source.movementReasonCategory ?? "").trim(),
    movementReasonText: String(source.movementReasonText ?? "").trim(),
    movementSourceModule:
      String(source.movementSourceModule ?? "").trim() || "estoque",
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

function normalizeFinancialMovementType(value: unknown): FinancialMovementType {
  return String(value ?? "").trim().toLowerCase() === "entrada" ? "entrada" : "saida";
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

function normalizeStockMovementType(value: unknown): StockMovementType {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "entrada" || normalized === "saida" || normalized === "ajuste") {
    return normalized;
  }

  return "ajuste";
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

function buildSiteArtSelectionOptions(products: NuvemshopProduct[]) {
  const items: SiteArtSelectionOption[] = [];

  for (const product of products) {
    const attributeNames = (product.attributes || []).map((value) =>
      getLocalizedText(value),
    );
    const baseCategories = getStockBaseCategories(
      (product.categories || [])
        .map((category) => getLocalizedText(category.name))
        .filter((value) => value && value !== "-"),
    );
    const artName = getLocalizedText(product.name).trim();

    if (!artName || baseCategories.length === 0) {
      continue;
    }

    for (const variant of product.variants || []) {
      const { color, size } = getVariantColorAndSize(
        attributeNames,
        variant.values || [],
      );
      const publishedStock = getVariantStockValue(variant);

      if (!color || !size || publishedStock <= 0) {
        continue;
      }

      for (const baseCategory of baseCategories) {
        items.push({
          id: `${String(product.id)}:${String(variant.id ?? "")}:${baseCategory}`,
          artName,
          sku: baseCategory,
          color,
          size,
          publishedStock,
        });
      }
    }
  }

  return items.sort((left, right) => {
    const leftKey = `${left.artName}-${left.sku}-${normalizeColor(left.color)}-${normalizeSize(left.size)}`;
    const rightKey = `${right.artName}-${right.sku}-${normalizeColor(right.color)}-${normalizeSize(right.size)}`;
    return leftKey.localeCompare(rightKey);
  });
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

function normalizeMonthReference(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : "";
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

function getCurrentMonthReference() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthEndDate(monthRef: string) {
  const [yearText, monthText] = monthRef.split("-");
  const year = Number.parseInt(yearText || "", 10);
  const monthIndex = Number.parseInt(monthText || "", 10) - 1;
  const endDate = new Date(year, monthIndex + 1, 0);
  return formatDateForDb(endDate);
}

function getLatestUpdatedAt(rows: Array<Record<string, unknown>>) {
  const values = rows
    .map((row) => (typeof row.updated_at === "string" ? row.updated_at : null))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left));

  return values[0] ?? null;
}

async function createStockMovement(
  client: ReturnType<typeof createSupabaseServerClient> extends infer T
    ? T extends { ok: true; client: infer C }
      ? C
      : never
    : never,
  movement: {
    stockItemId: string;
    sku: string;
    color: string;
    size: string;
    movementType: StockMovementType;
    quantity: number;
    plainBefore: number;
    plainAfter: number;
    reasonCategory: string;
    reasonText: string;
    sourceModule: string;
  },
) {
  const { error } = await client
    .schema(OPERATIONS_SCHEMA)
    .from(STOCK_MOVEMENTS_TABLE)
    .insert({
      stock_item_id: movement.stockItemId || null,
      sku: movement.sku,
      color: movement.color,
      size: movement.size,
      movement_type: movement.movementType,
      quantity: movement.quantity,
      plain_before: movement.plainBefore,
      plain_after: movement.plainAfter,
      reason_category: movement.reasonCategory || "ajuste_manual",
      reason_text: movement.reasonText,
      source_module: movement.sourceModule || "estoque",
    });

  if (error) {
    throw error;
  }
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
