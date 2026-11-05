import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopOrder } from "@/lib/nuvemshop/types";
import { loadDebtModuleData, type InternalDebt } from "@/lib/operacoes/repository";

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export type FinanceFlowOrder = {
  id: string;
  number: string;
  total: number;
  referenceDate: string | null;
  paymentMethod: string;
  installments: number;
  gateway: string;
  paymentStatus: string;
  customerName: string;
  customerKey: string;
  hasCoupon: boolean;
  couponCode: string | null;
  discountTotal: number;
  itemQuantity: number;
  destinationState: string | null;
};

export type FinanceFlowDebt = {
  id: string;
  title: string;
  category: string;
  amount: number;
  status: string;
  dueDate: string;
  monthLabel: string;
  paymentMethod: string;
  installmentLabel: string;
};

export type MonthlyFinanceFlowData = {
  selectedMonth: string;
  monthLabel: string;
  orders: FinanceFlowOrder[];
  allOrders: FinanceFlowOrder[];
  period: {
    startDate: string | null;
    endDate: string | null;
    label: string;
  };
  debts: FinanceFlowDebt[];
  nuvemshop: {
    ok: boolean;
    message: string;
  };
  debtsSource: {
    ok: boolean;
    message: string;
  };
};

export async function loadMonthlyFinanceFlow(
  filters?: {
    selectedMonth?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<MonthlyFinanceFlowData> {
  const selectedMonth = filters?.selectedMonth;
  const [monthStart, monthEnd, normalizedMonth] =
    getMonthRangeFromInput(selectedMonth);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(monthStart);
  const dateRange = getDateRangeFilter(filters?.startDate, filters?.endDate);

  const [ordersResult, debtsResult] = await Promise.all([
    loadMonthlyNuvemshopOrders(monthStart, monthEnd, dateRange.startDate, dateRange.endDate),
    loadMonthlyDebts(monthStart, monthEnd),
  ]);

  return {
    selectedMonth: normalizedMonth,
    monthLabel,
    orders: ordersResult.orders,
    allOrders: ordersResult.allOrders,
    period: {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      label: buildPeriodLabel(dateRange.startDate, dateRange.endDate),
    },
    debts: debtsResult.debts,
    nuvemshop: {
      ok: ordersResult.ok,
      message: ordersResult.message,
    },
    debtsSource: {
      ok: debtsResult.ok,
      message: debtsResult.message,
    },
  };
}

async function loadMonthlyNuvemshopOrders(
  monthStart: Date,
  monthEnd: Date,
  startDate?: string | null,
  endDate?: string | null,
) {
  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return {
      ok: false,
      orders: [] as FinanceFlowOrder[],
      allOrders: [] as FinanceFlowOrder[],
      message: `Nuvemshop sem credenciais completas: ${credentials.missing.join(", ")}.`,
    };
  }

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const orders = await fetchAllOrders(client);
    const mappedOrders = orders.map((order) => mapOrderToFlow(order)).filter((order) => order.total > 0);
    const currentMonthOrders =
      startDate || endDate
        ? mappedOrders.filter((order) => orderMatchesDateRange(order, startDate, endDate))
        : mappedOrders;

    return {
      ok: true,
      orders: currentMonthOrders,
      allOrders: mappedOrders,
      message:
        currentMonthOrders.length > 0
          ? startDate || endDate
            ? "Pedidos da Nuvemshop carregados para o periodo filtrado."
            : "Base completa da Nuvemshop carregada com sucesso."
          : startDate || endDate
            ? "Nuvemshop conectada. Nenhum pedido encontrado para o periodo filtrado."
            : "Nuvemshop conectada. Nenhum pedido encontrado na base carregada.",
    };
  } catch (error) {
    const message =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : "Nao foi possivel carregar as entradas da Nuvemshop.";

    return {
      ok: false,
      orders: [] as FinanceFlowOrder[],
      allOrders: [] as FinanceFlowOrder[],
      message,
    };
  }
}

async function fetchAllOrders(client: NuvemshopClient) {
  const result: NuvemshopOrder[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await client.listOrders({ page, perPage: PAGE_SIZE });
    result.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return result;
}

function orderHasCashEffectInMonth(
  order: NuvemshopOrder,
  monthStart: Date,
  monthEnd: Date,
) {
  const reference = getOrderReferenceDate(order);

  if (!reference) {
    return false;
  }

  const time = reference.getTime();
  return time >= monthStart.getTime() && time <= monthEnd.getTime();
}

function getOrderReferenceDate(order: NuvemshopOrder) {
  const raw = order.paid_at || order.created_at;

  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function orderMatchesDateRange(
  order: FinanceFlowOrder,
  startDate?: string | null,
  endDate?: string | null,
) {
  const reference = getReferenceDateFromValue(order.referenceDate);

  if (!reference) {
    return false;
  }

  const start = startDate ? getReferenceDateFromValue(`${startDate}T00:00:00`) : null;
  const end = endDate ? getReferenceDateFromValue(`${endDate}T23:59:59`) : null;

  if (start && reference < start) {
    return false;
  }

  if (end && reference > end) {
    return false;
  }

  return true;
}

function mapOrderToFlow(order: NuvemshopOrder): FinanceFlowOrder {
  const couponCode =
    order.coupon && order.coupon.length > 0
      ? String(order.coupon[0]?.code ?? "").trim() || null
      : null;
  const customerKey =
    String(order.customer?.id ?? "").trim() ||
    String(order.contact_email ?? "").trim().toLowerCase() ||
    String(order.contact_name ?? "").trim().toLowerCase() ||
    String(order.id ?? "").trim();

  return {
    id: String(order.id ?? ""),
    number: String(order.number ?? order.id ?? ""),
    total: parseMoney(order.total),
    referenceDate: order.paid_at || order.created_at || null,
    paymentMethod:
      order.payment_details?.method ||
      order.gateway_name ||
      order.gateway ||
      "Nao identificado",
    installments: Math.max(order.payment_details?.installments || 1, 1),
    gateway: order.gateway_name || order.gateway || "Nuvemshop",
    paymentStatus: order.payment_status || "sem status",
    customerName:
      order.contact_name || order.customer?.name || order.contact_email || "-",
    customerKey,
    hasCoupon: Boolean(couponCode),
    couponCode,
    discountTotal: parseMoney(order.discount),
    itemQuantity: getOrderItemQuantity(order),
    destinationState: resolveOrderDestinationState(order),
  };
}

function getOrderItemQuantity(order: NuvemshopOrder) {
  return (order.products ?? []).reduce((sum, product) => {
    const quantity = Number.parseInt(String(product.quantity ?? "1"), 10);
    return sum + (Number.isFinite(quantity) ? Math.max(quantity, 0) : 0);
  }, 0);
}

function resolveOrderDestinationState(order: NuvemshopOrder) {
  const candidatePaths = [
    ["shipping_address", "province"],
    ["shipping_address", "state"],
    ["shipping_address", "province_code"],
    ["shipping_address", "state_code"],
    ["shipping", "address", "province"],
    ["shipping", "address", "state"],
    ["billing_address", "province"],
    ["billing_address", "state"],
    ["customer", "default_address", "province"],
    ["customer", "default_address", "state"],
  ] as const;

  for (const path of candidatePaths) {
    const value = getNestedString(order, path);
    const stateCode = normalizeBrazilStateCode(value);

    if (stateCode) {
      return stateCode;
    }
  }

  return null;
}

function getNestedString(source: unknown, path: readonly string[]) {
  let current: unknown = source;

  for (const segment of path) {
    if (!isRecord(current)) {
      return "";
    }

    current = current[segment];
  }

  return typeof current === "string" ? current : "";
}

function normalizeBrazilStateCode(rawValue: string) {
  const value = rawValue.trim();

  if (!value) {
    return null;
  }

  const rawParts = value
    .split(/[,\-/|]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const parts = rawParts.length > 0 ? rawParts : [value];

  for (const part of parts) {
    const upper = part.toUpperCase();

    if (BRAZIL_STATE_CODES.has(upper)) {
      return upper;
    }

    const normalized = normalizeText(part).replace(/\s+/g, " ").trim();
    const directMatch = BRAZIL_STATE_NAME_TO_CODE[normalized];

    if (directMatch) {
      return directMatch;
    }
  }

  return null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function loadMonthlyDebts(monthStart: Date, monthEnd: Date) {
  const result = await loadDebtModuleData();

  const debts = result.debts
    .filter((debt) => debt.dueDate)
    .filter((debt) => isDateWithinMonth(debt.dueDate, monthStart, monthEnd))
    .map(mapDebtToFlow);

  return {
    ok: result.persistence.enabled,
    debts,
    message: result.persistence.message,
  };
}

function mapDebtToFlow(debt: InternalDebt): FinanceFlowDebt {
  return {
    id: debt.id,
    title: debt.title,
    category: debt.category,
    amount: debt.amount,
    status: debt.status,
    dueDate: debt.dueDate,
    monthLabel: debt.monthLabel,
    paymentMethod: debt.paymentMethod,
    installmentLabel: `${debt.installmentNumber}/${debt.installmentsTotal}`,
  };
}

function isDateWithinMonth(value: string, monthStart: Date, monthEnd: Date) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date >= monthStart && date <= monthEnd;
}

function getMonthRangeFromInput(selectedMonth?: string) {
  const normalized =
    typeof selectedMonth === "string" &&
    /^\d{4}-\d{2}$/.test(selectedMonth.trim())
      ? selectedMonth.trim()
      : formatMonthInput(new Date());
  const [yearText, monthText] = normalized.split("-");
  const year = Number.parseInt(yearText || "", 10);
  const monthIndex = Number.parseInt(monthText || "", 10) - 1;

  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return [start, end, normalized] as const;
}

function formatMonthInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMoney(value?: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDateRangeFilter(startDate?: string, endDate?: string) {
  const normalizedStart = normalizeDateInput(startDate);
  const normalizedEnd = normalizeDateInput(endDate);

  if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
    return {
      startDate: normalizedEnd,
      endDate: normalizedStart,
    };
  }

  return {
    startDate: normalizedStart,
    endDate: normalizedEnd,
  };
}

function normalizeDateInput(value?: string | null) {
  if (!value) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

function buildPeriodLabel(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) {
    return `${formatDateLabel(startDate)} ate ${formatDateLabel(endDate)}`;
  }

  if (startDate) {
    return `Desde ${formatDateLabel(startDate)}`;
  }

  if (endDate) {
    return `Ate ${formatDateLabel(endDate)}`;
  }

  return "Base completa";
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(date);
}

function getReferenceDateFromValue(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const BRAZIL_STATE_CODES = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);

const BRAZIL_STATE_NAME_TO_CODE: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  espirito: "ES",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};
