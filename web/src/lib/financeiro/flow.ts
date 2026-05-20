import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopOrder } from "@/lib/nuvemshop/types";
import { loadDebtModuleData, type InternalDebt } from "@/lib/operacoes/repository";

const PAGE_SIZE = 100;
const MAX_PAGES = 12;

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
  selectedMonth?: string,
): Promise<MonthlyFinanceFlowData> {
  const [monthStart, monthEnd, normalizedMonth] =
    getMonthRangeFromInput(selectedMonth);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(monthStart);

  const [ordersResult, debtsResult] = await Promise.all([
    loadMonthlyNuvemshopOrders(monthStart, monthEnd),
    loadMonthlyDebts(monthStart, monthEnd),
  ]);

  return {
    selectedMonth: normalizedMonth,
    monthLabel,
    orders: ordersResult.orders,
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

async function loadMonthlyNuvemshopOrders(monthStart: Date, monthEnd: Date) {
  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return {
      ok: false,
      orders: [] as FinanceFlowOrder[],
      message: `Nuvemshop sem credenciais completas: ${credentials.missing.join(", ")}.`,
    };
  }

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const orders = await fetchAllOrders(client);
    const currentMonthOrders = orders
      .filter((order) => orderHasCashEffectInMonth(order, monthStart, monthEnd))
      .map((order) => mapOrderToFlow(order))
      .filter((order) => order.total > 0);

    return {
      ok: true,
      orders: currentMonthOrders,
      message:
        currentMonthOrders.length > 0
          ? "Entradas da Nuvemshop carregadas para o mes atual."
          : "Nuvemshop conectada. Nenhum pedido encontrado para o mes atual.",
    };
  } catch (error) {
    const message =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : "Nao foi possivel carregar as entradas da Nuvemshop.";

    return {
      ok: false,
      orders: [] as FinanceFlowOrder[],
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
  };
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
