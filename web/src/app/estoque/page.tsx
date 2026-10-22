import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import layoutStyles from "@/components/panel.module.css";
import styles from "./estoque-modern.module.css";
import {
  applyStockMovementCorrection,
  createManualStockEntry,
  createManualStockExit,
  loadStockLedgerModuleData,
  reviewPendingStockMovement,
  type SiteArtSelectionOption,
  type StockMovement,
  type StockSelectionOption,
} from "@/lib/operacoes/repository";

const ENTRY_ORIGINS = ["compra", "fornecedor", "devolucao", "inventario", "ajuste"] as const;
const EXIT_ORIGINS = ["venda", "brinde", "perda", "amostra", "ajuste"] as const;
const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const DEFAULT_PAGE_SIZE = 20;
const SIZE_ORDER = ["PP", "P", "M", "G", "GG", "XG", "XGG", "EXG", "UNICO", "U"];
const COLOR_ORDER = ["Preta", "Branca", "Roxa", "Rosa"];

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type InventoryView = "lisas" | "estampadas";
type PanelType = "entry" | "exit" | "review" | "correction" | "cell";

type CombinedStockBaseOption = {
  key: string;
  sku: string;
  color: string;
  size: string;
  plain: number;
  source: "estoque" | "nuvemshop";
};

type InventoryMatrixRow = {
  color: string;
  colorKey: string;
  totalsBySize: Map<string, number>;
  total: number;
  minimumBySize: Map<string, number>;
};

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getSearchInteger(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
  fallback: number,
) {
  const value = Number.parseInt(getSearchValue(searchParams, key), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatMonthInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getSelectedMonth(searchParams: Record<string, string | string[] | undefined>) {
  const raw = getSearchValue(searchParams, "month").trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : formatMonthInput(new Date());
}

function getMonthLabel(selectedMonth: string) {
  const [yearText, monthText] = selectedMonth.split("-");
  const year = Number.parseInt(yearText || "", 10);
  const monthIndex = Number.parseInt(monthText || "", 10) - 1;
  const date = new Date(year, monthIndex, 1);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function getMonthStartDate(selectedMonth: string) {
  return `${selectedMonth}-01`;
}

function getMonthEndDate(selectedMonth: string) {
  const [yearText, monthText] = selectedMonth.split("-");
  const year = Number.parseInt(yearText || "", 10);
  const monthIndex = Number.parseInt(monthText || "", 10) - 1;
  const date = new Date(year, monthIndex + 1, 0);
  return `${selectedMonth}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDefaultMovementDateForMonth(selectedMonth: string) {
  const today = new Date();
  const currentMonth = formatMonthInput(today);

  if (selectedMonth === currentMonth) {
    return `${selectedMonth}-${String(today.getDate()).padStart(2, "0")}`;
  }

  return getMonthStartDate(selectedMonth);
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function buildStockBaseKey(sku: string, color: string, size: string) {
  return [sku, color, size].join("||");
}

function parseStockBaseKey(value: string) {
  const [sku = "", color = "", size = ""] = value.split("||");
  return {
    sku: sku.trim(),
    color: color.trim(),
    size: size.trim(),
  };
}

function appendFlashToRedirect(
  basePath: string,
  status: "success" | "error",
  message: string,
) {
  const [path, query = ""] = basePath.split("?");
  const params = new URLSearchParams(query);
  params.set("stockStatus", status);
  params.set("stockMessage", message);
  params.delete("panel");
  params.delete("movementId");
  params.delete("cellKey");
  params.delete("correctionBaseKey");
  params.delete("correctionQty");
  params.delete("correctionNotes");
  params.delete("correctionReference");
  return `${path || "/estoque"}?${params.toString()}`;
}

async function registerStockEntryAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/estoque").trim() || "/estoque";
  const stockBaseKey = String(formData.get("stockBaseKey") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10) || 0;
  const movementDate = String(formData.get("movementDate") ?? "").trim();
  const originType = String(formData.get("originType") ?? "compra").trim();
  const originReference = String(formData.get("originReference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const base = parseStockBaseKey(stockBaseKey);

  if (!base.sku || !base.color || !base.size) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Selecione a camiseta base da entrada."));
  }

  const result = await createManualStockEntry({
    ...base,
    quantity,
    movementDate,
    originType,
    originReference,
    notes,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel registrar a entrada.",
      ),
    );
  }

  revalidatePath("/estoque");
  redirect(appendFlashToRedirect(redirectTo, "success", "Entrada registrada com sucesso."));
}

async function registerStockExitAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/estoque").trim() || "/estoque";
  const stockBaseKey = String(formData.get("stockBaseKey") ?? "").trim();
  const artSelectionId = String(formData.get("artSelectionId") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10) || 0;
  const movementDate = String(formData.get("movementDate") ?? "").trim();
  const originType = String(formData.get("originType") ?? "venda").trim();
  const originReference = String(formData.get("originReference") ?? "").trim();
  const alreadyPrinted = String(formData.get("alreadyPrinted") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const base = parseStockBaseKey(stockBaseKey);

  if (!base.sku || !base.color || !base.size) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Selecione a camiseta base da saida."));
  }

  const result = await createManualStockExit({
    ...base,
    quantity,
    movementDate,
    originType,
    originReference,
    artSelectionId,
    alreadyPrinted,
    notes,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel registrar a saida.",
      ),
    );
  }

  revalidatePath("/estoque");
  redirect(appendFlashToRedirect(redirectTo, "success", result.persistence.message));
}

async function reviewPendingStockExitAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/estoque").trim() || "/estoque";
  const movementId = String(formData.get("movementId") ?? "").trim();
  const stockBaseKey = String(formData.get("stockBaseKey") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10) || 0;
  const originReference = String(formData.get("originReference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const decision = String(formData.get("decision") ?? "aprovar").trim();
  const deductFromStock = String(formData.get("deductFromStock") ?? "").trim();
  const alreadyPrinted = String(formData.get("alreadyPrinted") ?? "").trim();
  const base = parseStockBaseKey(stockBaseKey);

  const result = await reviewPendingStockMovement(movementId, {
    ...base,
    quantity,
    originReference,
    notes,
    decision,
    deductFromStock,
    alreadyPrinted,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel revisar a saida.",
      ),
    );
  }

  revalidatePath("/estoque");
  redirect(appendFlashToRedirect(redirectTo, "success", result.persistence.message));
}

async function correctStockMovementAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/estoque").trim() || "/estoque";
  const stockBaseKey = String(formData.get("stockBaseKey") ?? "").trim();
  const base = parseStockBaseKey(stockBaseKey);
  const result = await applyStockMovementCorrection({
    movementId: String(formData.get("movementId") ?? "").trim(),
    ...base,
    quantity: Number.parseInt(String(formData.get("quantity") ?? "0"), 10) || 0,
    originReference: String(formData.get("originReference") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    requestToken: String(formData.get("requestToken") ?? "").trim(),
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel corrigir a baixa.",
      ),
    );
  }

  revalidatePath("/estoque");
  redirect(appendFlashToRedirect(redirectTo, "success", result.persistence.message));
}

function buildCombinedStockBaseOptions(
  stockOptions: StockSelectionOption[],
  artOptions: SiteArtSelectionOption[],
) {
  const optionMap = new Map<string, CombinedStockBaseOption>();

  for (const item of stockOptions) {
    const key = buildStockBaseKey(item.sku, item.color, item.size);
    optionMap.set(key, {
      key,
      sku: item.sku,
      color: item.color,
      size: item.size,
      plain: item.plain,
      source: "estoque",
    });
  }

  for (const art of artOptions) {
    const key = buildStockBaseKey(art.sku, art.color, art.size);

    if (optionMap.has(key)) {
      continue;
    }

    optionMap.set(key, {
      key,
      sku: art.sku,
      color: art.color,
      size: art.size,
      plain: 0,
      source: "nuvemshop",
    });
  }

  return Array.from(optionMap.values()).sort((left, right) =>
    `${left.sku}-${left.color}-${left.size}`.localeCompare(
      `${right.sku}-${right.color}-${right.size}`,
      "pt-BR",
    ),
  );
}

function getPreferredIndex(value: string, reference: string[]) {
  const normalized = value.trim().toUpperCase();
  const index = reference.findIndex((item) => item.toUpperCase() === normalized);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function sortSizes(values: string[]) {
  return values.slice().sort((left, right) => {
    const leftIndex = getPreferredIndex(left, SIZE_ORDER);
    const rightIndex = getPreferredIndex(right, SIZE_ORDER);

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right, "pt-BR");
  });
}

function sortColors(values: string[]) {
  return values.slice().sort((left, right) => {
    const leftIndex = getPreferredIndex(left, COLOR_ORDER);
    const rightIndex = getPreferredIndex(right, COLOR_ORDER);

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right, "pt-BR");
  });
}

function buildBaseSkuOptions(stockOptions: StockSelectionOption[]) {
  return Array.from(new Set(stockOptions.map((item) => item.sku).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

function resolveInventoryView(
  searchParams: Record<string, string | string[] | undefined>,
  stockOptions: StockSelectionOption[],
) {
  const requested = getSearchValue(searchParams, "view").trim().toLowerCase();

  if (requested === "estampadas" && stockOptions.some((item) => item.printedReal > 0)) {
    return "estampadas" as const;
  }

  return "lisas" as const;
}

function buildInventoryMatrixRows(
  stockOptions: StockSelectionOption[],
  selectedBase: string,
  view: InventoryView,
) {
  const filtered = stockOptions.filter((item) => item.sku === selectedBase);
  const sizes = sortSizes(Array.from(new Set(filtered.map((item) => item.size))));
  const rowsByColor = new Map<string, InventoryMatrixRow>();

  for (const item of filtered) {
    const key = item.color.toLowerCase();
    const current = rowsByColor.get(key) ?? {
      color: item.color,
      colorKey: key,
      totalsBySize: new Map<string, number>(),
      total: 0,
      minimumBySize: new Map<string, number>(),
    };
    const nextValue = view === "lisas" ? item.plain : item.printedReal;
    const previousValue = current.totalsBySize.get(item.size) ?? 0;
    const nextMinimum = item.reorderPoint > 0 ? item.reorderPoint : DEFAULT_LOW_STOCK_THRESHOLD;
    const previousMinimum = current.minimumBySize.get(item.size);

    // After normalizing colors like Preto -> Preta, equivalent rows can coexist.
    // Aggregate the quantities instead of overwriting the same size cell.
    current.totalsBySize.set(item.size, previousValue + nextValue);
    current.minimumBySize.set(
      item.size,
      previousMinimum === undefined ? nextMinimum : Math.min(previousMinimum, nextMinimum),
    );
    current.total += nextValue;
    rowsByColor.set(key, current);
  }

  const rows = sortColors(Array.from(rowsByColor.values()).map((item) => item.color)).map(
    (color) => rowsByColor.get(color.toLowerCase())!,
  );
  const totalBySize = new Map<string, number>();

  for (const size of sizes) {
    totalBySize.set(
      size,
      rows.reduce((sum, row) => sum + (row.totalsBySize.get(size) ?? 0), 0),
    );
  }

  return {
    sizes,
    rows,
    grandTotal: rows.reduce((sum, row) => sum + row.total, 0),
    totalBySize,
  };
}

function buildCriticalItems(stockOptions: StockSelectionOption[]) {
  return stockOptions
    .filter((item) => item.plain <= (item.reorderPoint > 0 ? item.reorderPoint : DEFAULT_LOW_STOCK_THRESHOLD))
    .sort((left, right) => {
      if (left.plain !== right.plain) {
        return left.plain - right.plain;
      }

      return `${left.sku}-${left.color}-${left.size}`.localeCompare(
        `${right.sku}-${right.color}-${right.size}`,
        "pt-BR",
      );
    });
}

function labelOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "-";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function getLedgerTypeLabel(movement: StockMovement) {
  if (movement.correctionRole === "estorno") {
    return "Estorno de movimentacao";
  }

  if (movement.correctionRole === "correcao") {
    return "Correcao de baixa";
  }

  if (movement.movementType === "entrada") {
    return movement.originType === "compra" || movement.originType === "fornecedor"
      ? "Entrada por compra"
      : "Entrada manual";
  }

  if (movement.movementType === "saida") {
    return movement.originType === "venda" ? "Baixa de venda" : "Saida manual";
  }

  return "Ajuste";
}

function getLedgerStatusLabel(movement: StockMovement) {
  if (movement.reviewStatus === "pendente") {
    return "Pendente";
  }

  if (movement.reviewStatus === "ignorado") {
    return "Ignorado";
  }

  if (movement.correctionRole === "estorno") {
    return "Estornado";
  }

  if (movement.reversedAt) {
    return "Substituida";
  }

  if (movement.correctionRole === "correcao") {
    return "Corrigida";
  }

  if (!movement.stockEffectApplied) {
    return "Sem baixa";
  }

  return "Aplicada";
}

function canCorrectMovement(movement: StockMovement) {
  return (
    movement.movementType === "saida" &&
    movement.reviewStatus === "aprovado" &&
    movement.stockEffectApplied &&
    movement.originType === "venda" &&
    movement.correctionRole !== "estorno"
  );
}

function buildPageHref(
  current: Record<string, string | string[] | undefined>,
  updates: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(current)) {
    const first = Array.isArray(value) ? value[0] : value;

    if (typeof first === "string" && first.trim()) {
      params.set(key, first);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!value) {
      params.delete(key);
      continue;
    }

    params.set(key, value);
  }

  return `/estoque?${params.toString()}`;
}

function filterMovements(
  movements: StockMovement[],
  filters: {
    startDate: string;
    endDate: string;
    movementType: string;
    status: string;
    color: string;
    size: string;
    base: string;
    reference: string;
  },
) {
  const referenceNeedle = filters.reference.trim().toLowerCase();

  return movements.filter((movement) => {
    if (filters.startDate && movement.movementDate < filters.startDate) {
      return false;
    }

    if (filters.endDate && movement.movementDate > filters.endDate) {
      return false;
    }

    if (filters.movementType === "correcao" && movement.correctionRole === "original") {
      return false;
    }

    if (
      filters.movementType &&
      filters.movementType !== "todos" &&
      filters.movementType !== "correcao" &&
      movement.movementType !== filters.movementType
    ) {
      return false;
    }

    if (filters.status === "pendente" && movement.reviewStatus !== "pendente") {
      return false;
    }

    if (filters.status === "ignorado" && movement.reviewStatus !== "ignorado") {
      return false;
    }

    if (filters.status === "corrigido" && movement.correctionRole === "original") {
      return false;
    }

    if (filters.status === "aplicada" && getLedgerStatusLabel(movement) !== "Aplicada") {
      return false;
    }

    if (
      filters.color &&
      filters.color !== "todas" &&
      movement.color.toLowerCase() !== filters.color.toLowerCase()
    ) {
      return false;
    }

    if (
      filters.size &&
      filters.size !== "todos" &&
      movement.size.toLowerCase() !== filters.size.toLowerCase()
    ) {
      return false;
    }

    if (
      filters.base &&
      filters.base !== "todas" &&
      movement.sku.toLowerCase() !== filters.base.toLowerCase()
    ) {
      return false;
    }

    if (referenceNeedle) {
      const haystack = `${movement.originReference} ${movement.artName} ${movement.reasonText}`.toLowerCase();
      return haystack.includes(referenceNeedle);
    }

    return true;
  });
}

function resolveEffectiveCorrectionMovement(movements: StockMovement[], movementId: string) {
  const target = movements.find((movement) => movement.id === movementId);

  if (!target) {
    return null;
  }

  const rootId = target.correctionRootId || target.id;
  const active = movements
    .filter(
      (movement) =>
        (movement.correctionRootId || movement.id) === rootId &&
        movement.movementType === "saida" &&
        movement.reviewStatus === "aprovado" &&
        movement.stockEffectApplied &&
        !movement.reversedAt,
    )
    .sort((left, right) => {
      const leftKey = `${left.createdAt || ""}-${left.id}`;
      const rightKey = `${right.createdAt || ""}-${right.id}`;
      return rightKey.localeCompare(leftKey, "pt-BR");
    })[0];

  return active || target;
}

function renderMetricIcon(kind: "stock" | "critical" | "pending") {
  if (kind === "critical") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4L21 20H3L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 9V13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 17H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === "pending") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 12H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 7L17 12L12 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 7L7 12L12 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3L19 7V17L12 21L5 17V7L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M5 7L12 11L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 11V21" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export default async function EstoquePage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const selectedMonth = getSelectedMonth(resolvedSearchParams);
  const monthLabel = getMonthLabel(selectedMonth);
  const stockStatus = getSearchValue(resolvedSearchParams, "stockStatus");
  const stockMessage = getSearchValue(resolvedSearchParams, "stockMessage");
  const panel = getSearchValue(resolvedSearchParams, "panel") as PanelType;
  const pageSize = getSearchInteger(resolvedSearchParams, "limit", DEFAULT_PAGE_SIZE);
  const redirectTo = buildPageHref(resolvedSearchParams, {
    month: selectedMonth,
    panel: undefined,
    movementId: undefined,
    cellKey: undefined,
    correctionBaseKey: undefined,
    correctionQty: undefined,
    correctionNotes: undefined,
    correctionReference: undefined,
  });

  const stockData = await loadStockLedgerModuleData(selectedMonth);
  const combinedBaseOptions = buildCombinedStockBaseOptions(stockData.stockOptions, stockData.artOptions);
  const baseSkuOptions = buildBaseSkuOptions(stockData.stockOptions);
  const selectedBase = getSearchValue(resolvedSearchParams, "base").trim() || baseSkuOptions[0] || "";
  const inventoryView = resolveInventoryView(resolvedSearchParams, stockData.stockOptions);
  const matrix = buildInventoryMatrixRows(stockData.stockOptions, selectedBase, inventoryView);
  const criticalItems = buildCriticalItems(stockData.stockOptions);
  const pendingSiteExits = stockData.movements.filter(
    (movement) => movement.movementType === "saida" && movement.reviewStatus === "pendente",
  );
  const queuedSiteSales = stockData.approvalQueue.reduce((sum, order) => sum + order.lineCount, 0);
  const queuedSiteOrderIds = stockData.approvalQueue.map((order) => order.orderId).join(",");
  const totalPlainStock = stockData.stockOptions.reduce((sum, item) => sum + item.plain, 0);
  const ledgerFilters = {
    startDate:
      getSearchValue(resolvedSearchParams, "startDate").trim() || getMonthStartDate(selectedMonth),
    endDate: getSearchValue(resolvedSearchParams, "endDate").trim() || getMonthEndDate(selectedMonth),
    movementType: getSearchValue(resolvedSearchParams, "movementType").trim() || "todos",
    status: getSearchValue(resolvedSearchParams, "status").trim() || "todos",
    color: getSearchValue(resolvedSearchParams, "color").trim() || "todas",
    size: getSearchValue(resolvedSearchParams, "size").trim() || "todos",
    base: getSearchValue(resolvedSearchParams, "ledgerBase").trim() || "todas",
    reference: getSearchValue(resolvedSearchParams, "reference").trim(),
  };
  const filteredMovements = filterMovements(stockData.movements, ledgerFilters);
  const visibleMovements = filteredMovements.slice(0, pageSize);
  const canShowMoreMovements = filteredMovements.length > pageSize;
  const cellKey = getSearchValue(resolvedSearchParams, "cellKey").trim();
  const cellBase = parseStockBaseKey(cellKey);
  const cellHistory = cellKey
    ? stockData.movements.filter(
        (movement) =>
          movement.sku === cellBase.sku &&
          movement.color === cellBase.color &&
          movement.size === cellBase.size,
      )
    : [];
  const correctionMovementId = getSearchValue(resolvedSearchParams, "movementId").trim();
  const correctionMovement = correctionMovementId
    ? resolveEffectiveCorrectionMovement(stockData.movements, correctionMovementId)
    : null;
  const correctionBaseKey =
    getSearchValue(resolvedSearchParams, "correctionBaseKey").trim() ||
    (correctionMovement
      ? buildStockBaseKey(correctionMovement.sku, correctionMovement.color, correctionMovement.size)
      : "");
  const correctionBase = parseStockBaseKey(correctionBaseKey);
  const correctionQuantity =
    getSearchInteger(resolvedSearchParams, "correctionQty", correctionMovement?.quantity || 1) ||
    correctionMovement?.quantity ||
    1;
  const correctionReference =
    getSearchValue(resolvedSearchParams, "correctionReference").trim() ||
    correctionMovement?.originReference ||
    "";
  const correctionNotes = getSearchValue(resolvedSearchParams, "correctionNotes").trim();
  const correctionTargetOption = stockData.stockOptions.find(
    (item) =>
      item.sku === correctionBase.sku &&
      item.color === correctionBase.color &&
      item.size === correctionBase.size,
  );
  const correctionSourceOption = correctionMovement
    ? stockData.stockOptions.find(
        (item) =>
          item.sku === correctionMovement.sku &&
          item.color === correctionMovement.color &&
          item.size === correctionMovement.size,
      )
    : null;
  const correctionPreview =
    correctionMovement && correctionSourceOption && correctionTargetOption
      ? (() => {
          const sameBase = correctionSourceOption.id === correctionTargetOption.id;
          const sourceAfterReversal = correctionSourceOption.plain + correctionMovement.quantity;
          const targetBefore = sameBase ? sourceAfterReversal : correctionTargetOption.plain;
          const targetAfter = targetBefore - correctionQuantity;
          return {
            sameBase,
            sourceAfterReversal,
            targetBefore,
            targetAfter,
            valid: targetAfter >= 0,
          };
        })()
      : null;

  return (
    <AppShell
      title="Estoque"
      subtitle="Controle o saldo físico das camisetas, acompanhe pendências e corrija baixas sem perder o histórico auditável."
      currentPath="/estoque"
    >
      <section className={layoutStyles.section}>
        <div className={styles.inventoryPage}>
          <div className={styles.heroCard}>
            <div className={styles.heroTopbar}>
              <div>
                <p className={styles.eyebrow}>Base física por cor e tamanho</p>
                <h2 className={styles.heroTitle}>Estoque de camisetas</h2>
                <p className={styles.heroSubtitle}>
                  Saldo real das camisetas lisas, baixas do site em revisão e correções auditáveis do
                  extrato.
                </p>
              </div>

              <form method="get" className={styles.heroFilters}>
                <input type="hidden" name="view" value={inventoryView} />
                <input type="hidden" name="base" value={selectedBase} />
                <label className={styles.field}>
                  <span>Competência</span>
                  <input type="month" name="month" defaultValue={selectedMonth} />
                </label>
                <button type="submit" className={styles.primaryButton}>
                  Atualizar
                </button>
              </form>
            </div>

            <div className={styles.metricGrid}>
              <article className={styles.metricCard}>
                <div className={styles.metricIcon}>{renderMetricIcon("stock")}</div>
                <div>
                  <span className={styles.metricLabel}>Total em estoque</span>
                  <strong className={styles.metricValue}>{String(totalPlainStock)}</strong>
                  <span className={styles.metricHint}>Camisetas lisas físicas disponíveis agora.</span>
                </div>
              </article>

              <article className={`${styles.metricCard} ${styles.metricCardCritical}`}>
                <div className={styles.metricIcon}>{renderMetricIcon("critical")}</div>
                <div>
                  <span className={styles.metricLabel}>Estoque crítico</span>
                  <strong className={styles.metricValue}>{String(criticalItems.length)}</strong>
                  <span className={styles.metricHint}>Combinações abaixo do mínimo configurado.</span>
                </div>
              </article>

              <article className={styles.metricCard}>
                <div className={styles.metricIcon}>{renderMetricIcon("pending")}</div>
                <div>
                  <span className={styles.metricLabel}>Baixas pendentes</span>
                  <strong className={styles.metricValue}>{String(pendingSiteExits.length)}</strong>
                  <span className={styles.metricHint}>Saídas de venda aguardando conferência.</span>
                </div>
              </article>
            </div>
          </div>

          <div className={styles.workspaceGrid}>
            <article className={styles.surfaceCard}>
              <div className={styles.sectionTopbar}>
                <div>
                  <h3 className={styles.sectionTitle}>Estoque por cor e tamanho</h3>
                  <p className={styles.sectionText}>
                    Selecione a base para ver o saldo real por cor e tamanho. Clique em qualquer
                    quantidade para abrir o histórico daquela combinação.
                  </p>
                </div>

                <div className={styles.toolbarStack}>
                  <form method="get" className={styles.toolbarInline}>
                    <input type="hidden" name="month" value={selectedMonth} />
                    <input type="hidden" name="view" value={inventoryView} />
                    <label className={styles.fieldCompact}>
                      <span>Base</span>
                      <select name="base" defaultValue={selectedBase}>
                        {baseSkuOptions.map((base) => (
                          <option key={base} value={base}>
                            {base}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className={styles.ghostButton}>
                      Trocar base
                    </button>
                  </form>

                  <div className={styles.viewToggle}>
                    <a
                      href={buildPageHref(resolvedSearchParams, { view: "lisas" })}
                      className={inventoryView === "lisas" ? styles.viewToggleActive : styles.viewToggleButton}
                    >
                      Camisetas lisas
                    </a>
                    <a
                      href={buildPageHref(resolvedSearchParams, { view: "estampadas" })}
                      className={
                        inventoryView === "estampadas" ? styles.viewToggleActive : styles.viewToggleButton
                      }
                    >
                      Camisetas estampadas
                    </a>
                  </div>
                </div>
              </div>

              {matrix.rows.length > 0 ? (
                <div className={styles.matrixWrap}>
                  <table className={styles.matrixTable}>
                    <thead>
                      <tr>
                        <th>Cor</th>
                        {matrix.sizes.map((size) => (
                          <th key={size}>{size}</th>
                        ))}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.rows.map((row) => (
                        <tr key={row.colorKey}>
                          <th>{row.color}</th>
                          {matrix.sizes.map((size) => {
                            const value = row.totalsBySize.get(size) ?? 0;
                            const minimum = row.minimumBySize.get(size) ?? DEFAULT_LOW_STOCK_THRESHOLD;
                            const toneClass =
                              inventoryView === "lisas" && value <= minimum
                                ? styles.stockCellAlert
                                : styles.stockCell;

                            return (
                              <td key={`${row.colorKey}-${size}`} data-label={size}>
                                <a
                                  href={buildPageHref(resolvedSearchParams, {
                                    panel: "cell",
                                    cellKey: buildStockBaseKey(selectedBase, row.color, size),
                                  })}
                                  className={toneClass}
                                >
                                  {String(value)}
                                </a>
                              </td>
                            );
                          })}
                          <td className={styles.totalCell} data-label="Total">
                            {String(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>Total geral</th>
                        {matrix.sizes.map((size) => (
                          <td key={`total-${size}`} data-label={size}>
                            {String(matrix.totalBySize.get(size) ?? 0)}
                          </td>
                        ))}
                        <td className={styles.totalCell} data-label="Total">
                          {String(matrix.grandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h3>Nenhum saldo encontrado</h3>
                  <p>
                    Ainda não existe estoque registrado para a base {selectedBase || "selecionada"} nesta
                    visualização.
                  </p>
                </div>
              )}
            </article>

            <aside className={styles.sidebarStack}>
              <article className={styles.surfaceCard}>
                <div className={styles.sectionTopbar}>
                  <div>
                    <h3 className={styles.sectionTitle}>Ações rápidas</h3>
                    <p className={styles.sectionText}>
                      Abra painéis compactos para movimentar o estoque sem poluir a tela principal.
                    </p>
                  </div>
                </div>

                <div className={styles.quickActionStack}>
                  <a href={buildPageHref(resolvedSearchParams, { panel: "entry" })} className={styles.primaryButton}>
                    + Entrada de estoque
                  </a>
                  <a href={buildPageHref(resolvedSearchParams, { panel: "exit" })} className={styles.secondaryButton}>
                    Registrar saída manual
                  </a>
                  <a href="#extrato" className={styles.ghostButton}>
                    Ver extrato completo
                  </a>
                </div>

                <div className={styles.metaInfo}>
                  <span>Base ativa: {selectedBase || "-"}</span>
                  <span>Competência: {monthLabel}</span>
                </div>
              </article>

              <article className={styles.surfaceCard}>
                <div className={styles.sectionTopbar}>
                  <div>
                    <h3 className={styles.sectionTitle}>Resumo crítico</h3>
                    <p className={styles.sectionText}>
                      Só mostramos as combinações que realmente pedem atenção, sem lotar a tela com saldo
                      zero irrelevante.
                    </p>
                  </div>
                </div>

                <div className={styles.alertPills}>
                  <span className={styles.alertPill}>
                    Estoque crítico: {String(criticalItems.length)}
                  </span>
                  <span className={styles.alertPill}>
                    Pendências de venda: {String(pendingSiteExits.length)}
                  </span>
                  <span className={styles.alertPill}>
                    Vendas do site ainda não lançadas: {String(queuedSiteSales)}
                  </span>
                </div>

                {criticalItems.length > 0 ? (
                  <div className={styles.compactAlertList}>
                    {(getSearchValue(resolvedSearchParams, "showCritical") === "1"
                      ? criticalItems
                      : criticalItems.slice(0, 5)
                    ).map((item) => (
                      <a
                        key={item.id}
                        href={buildPageHref(resolvedSearchParams, {
                          panel: "cell",
                          cellKey: buildStockBaseKey(item.sku, item.color, item.size),
                        })}
                        className={styles.alertRow}
                      >
                        <span>{item.color} · {item.size}</span>
                        <strong>{String(item.plain)}</strong>
                        <small>mín. {String(item.reorderPoint > 0 ? item.reorderPoint : DEFAULT_LOW_STOCK_THRESHOLD)}</small>
                      </a>
                    ))}
                    <a
                      href={buildPageHref(resolvedSearchParams, {
                        showCritical:
                          getSearchValue(resolvedSearchParams, "showCritical") === "1" ? undefined : "1",
                      })}
                      className={styles.inlineLink}
                    >
                      {getSearchValue(resolvedSearchParams, "showCritical") === "1"
                        ? "Recolher detalhes"
                        : "Ver detalhes"}
                    </a>
                  </div>
                ) : (
                  <div className={styles.emptyInline}>Nenhuma combinação crítica agora.</div>
                )}
              </article>
            </aside>
          </div>

          {stockMessage ? (
            <div className={stockStatus === "success" ? styles.feedbackSuccess : styles.feedbackError}>
              <strong>{stockStatus === "success" ? "Estoque atualizado" : "Ação não concluída"}</strong>
              <span>{stockMessage}</span>
            </div>
          ) : null}

          <section className={styles.surfaceCard} id="extrato">
            <div className={styles.sectionTopbar}>
              <div>
                <h3 className={styles.sectionTitle}>Extrato de movimentações</h3>
                <p className={styles.sectionText}>
                  Entradas, saídas, correções e estornos ficam reunidos em um único lugar, com filtros
                  compactos e ações auditáveis.
                </p>
              </div>
              {stockData.approvalQueue.length > 0 ? (
                <form
                  method="post"
                  action="/api/operacoes/estoque/importar-venda-revisao"
                  className={styles.toolbarInline}
                >
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <input type="hidden" name="orderIds" value={queuedSiteOrderIds} />
                  <button type="submit" className={styles.primaryButton}>
                    Trazer {String(queuedSiteSales)} venda(s) do site para o extrato
                  </button>
                </form>
              ) : null}
            </div>

            {stockData.approvalQueue.length > 0 ? (
              <div className={styles.alertPills}>
                <span className={styles.alertPill}>
                  Pedidos do site fora do extrato: {String(stockData.approvalQueue.length)}
                </span>
                <span className={styles.alertPill}>
                  Camisetas prontas para importar: {String(queuedSiteSales)}
                </span>
              </div>
            ) : null}

            <form method="get" className={styles.filterGrid}>
              <input type="hidden" name="month" value={selectedMonth} />
              <input type="hidden" name="view" value={inventoryView} />
              <input type="hidden" name="base" value={selectedBase} />
              <label className={styles.fieldCompact}>
                <span>De</span>
                <input type="date" name="startDate" defaultValue={ledgerFilters.startDate} />
              </label>
              <label className={styles.fieldCompact}>
                <span>Até</span>
                <input type="date" name="endDate" defaultValue={ledgerFilters.endDate} />
              </label>
              <label className={styles.fieldCompact}>
                <span>Tipo</span>
                <select name="movementType" defaultValue={ledgerFilters.movementType}>
                  <option value="todos">Todos os tipos</option>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                  <option value="ajuste">Ajuste</option>
                  <option value="correcao">Correções</option>
                </select>
              </label>
              <label className={styles.fieldCompact}>
                <span>Status</span>
                <select name="status" defaultValue={ledgerFilters.status}>
                  <option value="todos">Todos os status</option>
                  <option value="pendente">Pendentes</option>
                  <option value="aplicada">Aplicadas</option>
                  <option value="corrigido">Corrigidas</option>
                  <option value="ignorado">Ignoradas</option>
                </select>
              </label>
              <label className={styles.fieldCompact}>
                <span>Base</span>
                <select name="ledgerBase" defaultValue={ledgerFilters.base}>
                  <option value="todas">Todas</option>
                  {baseSkuOptions.map((base) => (
                    <option key={base} value={base}>
                      {base}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldCompact}>
                <span>Cor</span>
                <select name="color" defaultValue={ledgerFilters.color}>
                  <option value="todas">Todas</option>
                  {sortColors(Array.from(new Set(stockData.stockOptions.map((item) => item.color)))).map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldCompact}>
                <span>Tamanho</span>
                <select name="size" defaultValue={ledgerFilters.size}>
                  <option value="todos">Todos</option>
                  {sortSizes(Array.from(new Set(stockData.stockOptions.map((item) => item.size)))).map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldCompact}>
                <span>Pedido / referência</span>
                <input type="text" name="reference" defaultValue={ledgerFilters.reference} placeholder="#1052 ou lote 03" />
              </label>
              <div className={styles.filterActions}>
                <button type="submit" className={styles.primaryButton}>
                  Filtrar extrato
                </button>
                <a
                  href={buildPageHref(resolvedSearchParams, {
                    startDate: undefined,
                    endDate: undefined,
                    movementType: undefined,
                    status: undefined,
                    ledgerBase: undefined,
                    color: undefined,
                    size: undefined,
                    reference: undefined,
                    limit: undefined,
                  })}
                  className={styles.ghostButton}
                >
                  Limpar
                </a>
              </div>
            </form>

            <div className={styles.ledgerWrap}>
              <table className={styles.ledgerTable}>
                <thead>
                  <tr>
                    <th>Data e hora</th>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Base</th>
                    <th>Cor</th>
                    <th>Tamanho</th>
                    <th>Quantidade</th>
                    <th>Origem</th>
                    <th>Pedido / referência</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMovements.length > 0 ? (
                    visibleMovements.map((movement) => (
                      <tr key={movement.id}>
                        <td>{formatDateTime(movement.updatedAt || movement.createdAt)}</td>
                        <td>{getLedgerTypeLabel(movement)}</td>
                        <td>
                          <span className={styles.statusBadge}>{getLedgerStatusLabel(movement)}</span>
                        </td>
                        <td>{movement.sku}</td>
                        <td>{movement.color}</td>
                        <td>{movement.size}</td>
                        <td>{movement.movementType === "entrada" ? `+${movement.quantity}` : `-${movement.quantity}`}</td>
                        <td>{labelOrigin(movement.originType)}</td>
                        <td>{movement.originReference || "-"}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <a
                              href={buildPageHref(resolvedSearchParams, {
                                panel: "cell",
                                cellKey: buildStockBaseKey(movement.sku, movement.color, movement.size),
                              })}
                              className={styles.inlineLink}
                            >
                              Detalhes
                            </a>
                            {movement.reviewStatus === "pendente" ? (
                              <>
                                <form
                                  method="post"
                                  action="/api/operacoes/estoque/revisar-pendente"
                                  className={styles.inlineActionForm}
                                >
                                  <input type="hidden" name="redirectTo" value={redirectTo} />
                                  <input type="hidden" name="movementId" value={movement.id} />
                                  <input
                                    type="hidden"
                                    name="stockBaseKey"
                                    value={buildStockBaseKey(movement.sku, movement.color, movement.size)}
                                  />
                                  <input type="hidden" name="quantity" value={String(movement.quantity)} />
                                  <input
                                    type="hidden"
                                    name="originReference"
                                    value={movement.originReference || ""}
                                  />
                                  <input type="hidden" name="deductFromStock" value="true" />
                                  <input type="hidden" name="decision" value="aprovar" />
                                  <button type="submit" className={styles.inlineActionButton}>
                                    Aprovar rápido
                                  </button>
                                </form>
                                <a
                                  href={buildPageHref(resolvedSearchParams, {
                                    panel: "review",
                                    movementId: movement.id,
                                  })}
                                  className={styles.inlineLink}
                                >
                                  Revisar
                                </a>
                              </>
                            ) : null}
                            {canCorrectMovement(movement) ? (
                              <a
                                href={buildPageHref(resolvedSearchParams, {
                                  panel: "correction",
                                  movementId: movement.id,
                                  correctionBaseKey: buildStockBaseKey(movement.sku, movement.color, movement.size),
                                  correctionQty: String(movement.quantity),
                                  correctionReference: movement.originReference || "",
                                })}
                                className={styles.inlineLink}
                              >
                                Corrigir baixa
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10}>
                        <div className={styles.emptyInline}>
                          Nenhuma movimentação encontrada com os filtros atuais.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {canShowMoreMovements ? (
              <div className={styles.moreActions}>
                <a
                  href={buildPageHref(resolvedSearchParams, { limit: String(pageSize + DEFAULT_PAGE_SIZE) })}
                  className={styles.ghostButton}
                >
                  Ver mais {DEFAULT_PAGE_SIZE}
                </a>
              </div>
            ) : null}
          </section>
        </div>
      </section>

      {panel ? (
        <div className={styles.panelOverlay}>
          <div className={styles.panelBackdrop}>
            <a href={redirectTo} aria-label="Fechar painel" className={styles.backdropLink} />
          </div>
          <aside className={styles.sidePanel}>
            <div className={styles.sidePanelHeader}>
              <div>
                <h3 className={styles.sidePanelTitle}>
                  {panel === "entry" && "Entrada de estoque"}
                  {panel === "exit" && "Registrar saída manual"}
                  {panel === "review" && "Revisar baixa pendente"}
                  {panel === "correction" && "Corrigir baixa"}
                  {panel === "cell" && "Detalhes da combinação"}
                </h3>
                <p className={styles.sidePanelSubtitle}>
                  {panel === "entry" &&
                    "Entrada compacta para compra, devolução, inventário ou ajuste físico."}
                  {panel === "exit" &&
                    "Saídas de venda continuam seguras: entram em revisão quando precisarem de conferência."}
                  {panel === "review" &&
                    "Aprove, ignore ou ajuste a combinação antes de aplicar a baixa no estoque."}
                  {panel === "correction" &&
                    "O sistema estorna a baixa anterior e aplica a nova combinação em uma operação auditável."}
                  {panel === "cell" &&
                    "Histórico da combinação selecionada, com visão do saldo atual e dos últimos movimentos."}
                </p>
              </div>
              <a href={redirectTo} className={styles.closeButton}>
                Fechar
              </a>
            </div>

            {panel === "entry" ? (
              <form action={registerStockEntryAction} className={styles.panelForm}>
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <label className={styles.field}>
                  <span>Base, cor e tamanho</span>
                  <select name="stockBaseKey" defaultValue={combinedBaseOptions[0]?.key ?? ""} required>
                    {combinedBaseOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.sku} · {option.color} · {option.size}
                        {option.source === "nuvemshop" ? " · novo" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Quantidade</span>
                  <input type="number" name="quantity" min="1" step="1" defaultValue="1" required />
                </label>
                <label className={styles.field}>
                  <span>Data</span>
                  <input type="date" name="movementDate" defaultValue={getDefaultMovementDateForMonth(selectedMonth)} required />
                </label>
                <label className={styles.field}>
                  <span>Origem</span>
                  <select name="originType" defaultValue="compra">
                    {ENTRY_ORIGINS.map((origin) => (
                      <option key={origin} value={origin}>
                        {labelOrigin(origin)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Referência</span>
                  <input type="text" name="originReference" placeholder="NF, lote ou observação de origem" />
                </label>
                <label className={styles.field}>
                  <span>Observação</span>
                  <textarea name="notes" rows={3} placeholder="Opcional" />
                </label>
                <div className={styles.panelActions}>
                  <button type="submit" className={styles.primaryButton}>
                    Salvar entrada
                  </button>
                </div>
              </form>
            ) : null}

            {panel === "exit" ? (
              <form action={registerStockExitAction} className={styles.panelForm}>
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <label className={styles.field}>
                  <span>Base, cor e tamanho</span>
                  <select name="stockBaseKey" defaultValue={combinedBaseOptions[0]?.key ?? ""} required>
                    {combinedBaseOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.sku} · {option.color} · {option.size} · saldo {option.plain}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Arte / produto</span>
                  <select name="artSelectionId" defaultValue="">
                    <option value="">Sem arte vinculada</option>
                    {stockData.artOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.artName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Quantidade</span>
                  <input type="number" name="quantity" min="1" step="1" defaultValue="1" required />
                </label>
                <label className={styles.field}>
                  <span>Data</span>
                  <input type="date" name="movementDate" defaultValue={getDefaultMovementDateForMonth(selectedMonth)} required />
                </label>
                <label className={styles.field}>
                  <span>Origem</span>
                  <select name="originType" defaultValue="venda">
                    {EXIT_ORIGINS.map((origin) => (
                      <option key={origin} value={origin}>
                        {labelOrigin(origin)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Número do pedido / referência</span>
                  <input type="text" name="originReference" placeholder="#1052 ou ajuste interno" />
                </label>
                <label className={styles.checkboxRow}>
                  <input type="checkbox" name="alreadyPrinted" value="true" />
                  <span>Já estava estampado, sem baixar a lisa física</span>
                </label>
                <label className={styles.field}>
                  <span>Observação</span>
                  <textarea name="notes" rows={3} placeholder="Motivo ou contexto da saída" />
                </label>
                <div className={styles.panelActions}>
                  <button type="submit" className={styles.primaryButton}>
                    Registrar saída
                  </button>
                </div>
              </form>
            ) : null}

            {panel === "review" ? (() => {
              const movement = stockData.movements.find((item) => item.id === correctionMovementId);

              if (!movement) {
                return <div className={styles.emptyInline}>A baixa pendente informada não foi encontrada.</div>;
              }

              const defaultBaseKey = buildStockBaseKey(movement.sku, movement.color, movement.size);

              return (
                <form action={reviewPendingStockExitAction} className={styles.panelForm}>
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <input type="hidden" name="movementId" value={movement.id} />
                  <div className={styles.infoCard}>
                    <strong>{movement.artName || "Venda do site"}</strong>
                    <span>
                      {movement.sku} · {movement.color} · {movement.size} · Qtd {String(movement.quantity)}
                    </span>
                    <small>{movement.reasonText || "Revise a combinação antes de aplicar a baixa."}</small>
                  </div>
                  <label className={styles.field}>
                    <span>Base que vai baixar</span>
                    <select name="stockBaseKey" defaultValue={defaultBaseKey} required>
                      {combinedBaseOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.sku} · {option.color} · {option.size} · saldo {option.plain}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Quantidade</span>
                    <input type="number" name="quantity" min="1" step="1" defaultValue={String(movement.quantity)} required />
                  </label>
                  <label className={styles.field}>
                    <span>Pedido / referência</span>
                    <input type="text" name="originReference" defaultValue={movement.originReference} />
                  </label>
                  <label className={styles.checkboxRow}>
                    <input type="checkbox" name="deductFromStock" value="true" defaultChecked />
                    <span>Baixar do estoque agora</span>
                  </label>
                  <label className={styles.checkboxRow}>
                    <input type="checkbox" name="alreadyPrinted" value="true" />
                    <span>Já estava estampado em outro lote</span>
                  </label>
                  <label className={styles.field}>
                    <span>Observação da revisão</span>
                    <textarea name="notes" rows={3} placeholder="Ex.: trocar P preto por G preto" />
                  </label>
                  <div className={styles.panelActions}>
                    <button type="submit" name="decision" value="aprovar" className={styles.primaryButton}>
                      Aprovar revisão
                    </button>
                    <button type="submit" name="decision" value="ignorar" className={styles.secondaryButton}>
                      Ignorar alerta
                    </button>
                  </div>
                </form>
              );
            })() : null}

            {panel === "correction" ? (
              correctionMovement ? (
                <div className={styles.panelStack}>
                  <div className={styles.infoCard}>
                    <strong>Baixa atualmente aplicada</strong>
                    <span>
                      {correctionMovement.sku} · {correctionMovement.color} · {correctionMovement.size} · Qtd{" "}
                      {String(correctionMovement.quantity)}
                    </span>
                    <small>
                      Pedido / referência: {correctionMovement.originReference || "-"} · Atualizado em{" "}
                      {formatDateTime(correctionMovement.updatedAt || correctionMovement.createdAt)}
                    </small>
                  </div>

                  <form method="get" className={styles.panelForm}>
                    <input type="hidden" name="month" value={selectedMonth} />
                    <input type="hidden" name="view" value={inventoryView} />
                    <input type="hidden" name="base" value={selectedBase} />
                    <input type="hidden" name="panel" value="correction" />
                    <input type="hidden" name="movementId" value={correctionMovement.id} />
                    <label className={styles.field}>
                      <span>Nova combinação</span>
                      <select name="correctionBaseKey" defaultValue={correctionBaseKey}>
                        {stockData.stockOptions.map((option) => {
                          const optionKey = buildStockBaseKey(option.sku, option.color, option.size);

                          return (
                            <option key={optionKey} value={optionKey}>
                              {option.sku} · {option.color} · {option.size} · saldo {option.plain}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Quantidade corrigida</span>
                      <input type="number" name="correctionQty" min="1" step="1" defaultValue={String(correctionQuantity)} />
                    </label>
                    <label className={styles.field}>
                      <span>Pedido / referência</span>
                      <input type="text" name="correctionReference" defaultValue={correctionReference} />
                    </label>
                    <label className={styles.field}>
                      <span>Motivo da correção</span>
                      <textarea name="correctionNotes" rows={3} defaultValue={correctionNotes} placeholder="Ex.: cliente comprou G, mas a baixa saiu em P." />
                    </label>
                    <div className={styles.panelActions}>
                      <button type="submit" className={styles.ghostButton}>
                        Atualizar prévia
                      </button>
                    </div>
                  </form>

                  <div className={styles.previewCard}>
                    <h4>Prévia do impacto no estoque</h4>
                    {correctionPreview ? (
                      <div className={styles.previewList}>
                        <div>
                          <strong>Combinação atual</strong>
                          <span>
                            {correctionMovement.sku} · {correctionMovement.color} · {correctionMovement.size}
                          </span>
                          <small>
                            saldo atual {String(correctionSourceOption?.plain ?? 0)} → após estorno{" "}
                            {String(correctionPreview.sourceAfterReversal)}
                          </small>
                        </div>
                        <div>
                          <strong>Combinação correta</strong>
                          <span>
                            {correctionBase.sku} · {correctionBase.color} · {correctionBase.size}
                          </span>
                          <small>
                            saldo antes {String(correctionPreview.targetBefore)} → depois{" "}
                            {String(correctionPreview.targetAfter)}
                          </small>
                        </div>
                        {!correctionPreview.valid ? (
                          <div className={styles.previewError}>
                            Não há lisa suficiente para aplicar essa correção sem deixar o estoque negativo.
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className={styles.emptyInline}>
                        Selecione a combinação correta para gerar a prévia do impacto.
                      </div>
                    )}
                  </div>

                  <form action={correctStockMovementAction} className={styles.panelForm}>
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <input type="hidden" name="movementId" value={correctionMovement.id} />
                    <input type="hidden" name="stockBaseKey" value={correctionBaseKey} />
                    <input type="hidden" name="quantity" value={String(correctionQuantity)} />
                    <input type="hidden" name="originReference" value={correctionReference} />
                    <input type="hidden" name="notes" value={correctionNotes} />
                    <input type="hidden" name="requestToken" value={crypto.randomUUID()} />
                    <div className={styles.panelActions}>
                      <button type="submit" className={styles.primaryButton} disabled={!correctionPreview?.valid}>
                        Confirmar correção
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className={styles.emptyInline}>A baixa informada não está disponível para correção.</div>
              )
            ) : null}

            {panel === "cell" ? (
              cellKey && cellBase.sku ? (
                <div className={styles.panelStack}>
                  <div className={styles.infoCard}>
                    <strong>{cellBase.sku} · {cellBase.color} · {cellBase.size}</strong>
                    <span>Histórico da combinação selecionada neste período.</span>
                    <small>
                      Saldo atual:{" "}
                      {String(
                        stockData.stockOptions.find(
                          (item) =>
                            item.sku === cellBase.sku &&
                            item.color === cellBase.color &&
                            item.size === cellBase.size,
                        )?.plain ?? 0,
                      )}
                    </small>
                  </div>
                  {cellHistory.length > 0 ? (
                    <div className={styles.historyStack}>
                      {cellHistory.map((movement) => (
                        <div key={movement.id} className={styles.historyRow}>
                          <div>
                            <strong>{getLedgerTypeLabel(movement)}</strong>
                            <span>{formatDate(movement.movementDate)} · {labelOrigin(movement.originType)}</span>
                          </div>
                          <div>
                            <strong>{movement.movementType === "entrada" ? `+${movement.quantity}` : `-${movement.quantity}`}</strong>
                            <span>{getLedgerStatusLabel(movement)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyInline}>
                      Nenhuma movimentação desta combinação dentro da competência selecionada.
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.emptyInline}>Selecione uma quantidade da tabela para abrir os detalhes.</div>
              )
            ) : null}
          </aside>
        </div>
      ) : null}
    </AppShell>
  );
}
