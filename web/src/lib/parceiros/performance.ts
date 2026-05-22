import { loadFinanceConfig } from "@/lib/financeiro/repository";
import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopOrder } from "@/lib/nuvemshop/types";

import type {
  CouponPartnerProfile,
  PartnerRewardRequest,
  PartnerRole,
} from "./repository";

const PAGE_SIZE = 100;
const MAX_PAGES = 12;
export const WINDOW_MONTHS = 3;
export const INFLUENCER_WINDOW_GOAL = 2000;
export const INFLUENCER_CREDIT_PERCENT = 14;
export const ATHLETE_WINDOW_GOAL = 1500;
export const ATHLETE_WINDOW_CREDIT_PERCENT = 10;
export const ATHLETE_SUPPORT_PERCENT = 4;
export const ATHLETE_SUPPORT_MINIMUM_REDEMPTION = 300;

type CouponStats = {
  code: string;
  orders: number;
  revenue: number;
  netRevenue: number;
  averageTicket: number;
  lastOrderAt: string | null;
  channels: string[];
};

export type PartnerPerformanceOrder = {
  id: string;
  number: string;
  createdAt: string | null;
  status: string;
  paymentStatus: string;
  total: number;
  netRevenue: number;
  channel: string;
  products: string[];
};

export type PartnerPerformanceRow = CouponStats & {
  name: string;
  role: PartnerRole;
  notes: string;
  monthlyGoal: number;
  monthlyCreditPercent: number;
  monthlyUnlockedCredit: number;
  monthlyAmountToGoal: number;
  monthlyGoalReached: boolean;
  lifetimeOrders: number;
  lifetimeRevenue: number;
  lifetimeNetRevenue: number;
  cumulativeSupport: number;
};

export type PartnerPerformanceSnapshot = {
  row: PartnerPerformanceRow;
  selectedMonth: string;
  rollingWindow: {
    startDate: string;
    endDate: string;
    label: string;
  };
  orders: PartnerPerformanceOrder[];
};

export type PartnerAvailableBalances = {
  clothesCommitted: number;
  clothesAvailable: number;
  supportCommitted: number;
  supportAvailable: number;
  canRequestClothes: boolean;
  canRequestSupport: boolean;
};

export async function loadPartnerPerformanceSnapshot(
  profile: CouponPartnerProfile,
  monthInput: string,
): Promise<{ ok: true; data: PartnerPerformanceSnapshot } | { ok: false; message: string }> {
  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return {
      ok: false,
      message: `Faltam credenciais da Nuvemshop: ${credentials.missing.join(", ")}.`,
    };
  }

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const [{ config: financeConfig }, orders] = await Promise.all([
      loadFinanceConfig(),
      fetchAllOrders(client),
    ]);
    const selectedMonth = normalizeMonthInput(monthInput);
    const rollingWindow = getRollingWindowRange(selectedMonth);
    const couponCode = profile.couponCode.trim().toUpperCase();
    const couponOrders = orders.filter((order) => getCouponCode(order) === couponCode);
    const rollingOrders = couponOrders.filter((order) =>
      matchesDateRange(order, rollingWindow.startDate, rollingWindow.endDate),
    );
    const windowStats = aggregateCouponStats(rollingOrders, couponCode, financeConfig);
    const lifetimeStats = aggregateCouponStats(couponOrders, couponCode, financeConfig);
    const row = buildPartnerRow(profile, windowStats, lifetimeStats);
    const orderRows = rollingOrders
      .slice()
      .sort((left, right) => {
        const leftDate = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightDate = right.created_at ? new Date(right.created_at).getTime() : 0;
        return rightDate - leftDate;
      })
      .map((order) => ({
        id: String(order.id ?? ""),
        number: String(order.number ?? order.id ?? ""),
        createdAt: order.created_at || null,
        status: String(order.status ?? "").trim() || "sem status",
        paymentStatus: String(order.payment_status ?? "").trim() || "sem pagamento",
        total: parseMoney(order.total),
        netRevenue: getNetRevenue(order, financeConfig),
        channel: getChannelLabel(order),
        products:
          order.products?.map((product) => String(product.name ?? "").trim()).filter(Boolean) || [],
      }));

    return {
      ok: true,
      data: {
        row,
        selectedMonth,
        rollingWindow,
        orders: orderRows,
      },
    };
  } catch (error) {
    const message =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : "Nao foi possivel carregar o desempenho do parceiro.";

    return {
      ok: false,
      message,
    };
  }
}

export function getCurrentMonthInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function normalizeMonthInput(value: string) {
  return /^\d{4}-\d{2}$/.test(value) ? value : getCurrentMonthInput();
}

export function getRollingWindowRange(monthInput: string) {
  const normalizedMonth = normalizeMonthInput(monthInput);
  const [yearText, monthText] = normalizedMonth.split("-");
  const year = Number.parseInt(yearText || "", 10);
  const monthIndex = Number.parseInt(monthText || "", 10) - 1;
  const start = new Date(year, monthIndex - (WINDOW_MONTHS - 1), 1);
  const end = new Date(year, monthIndex + 1, 0);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

  return {
    startDate,
    endDate,
    label: `${new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      ...(start.getFullYear() === end.getFullYear() ? {} : { year: "numeric" }),
    }).format(start)} a ${new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(end)}`,
  };
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getGoalProgressPercent(value: number, goal: number) {
  if (goal <= 0) {
    return 0;
  }

  return Math.max(0, Math.min((value / goal) * 100, 100));
}

export function getPartnerAvailableBalances(
  row: PartnerPerformanceRow,
  rollingWindow: { startDate: string; endDate: string },
  requests: PartnerRewardRequest[],
): PartnerAvailableBalances {
  const clothesCommitted = requests
    .filter(
      (request) =>
        request.requestType === "roupa" &&
        request.status !== "recusado" &&
        request.windowStartDate === rollingWindow.startDate &&
        request.windowEndDate === rollingWindow.endDate,
    )
    .reduce((sum, request) => sum + request.requestedAmount, 0);
  const supportCommitted = requests
    .filter(
      (request) =>
        request.requestType === "apoio" && request.status !== "recusado",
    )
    .reduce((sum, request) => sum + request.requestedAmount, 0);
  const clothesAvailable = Math.max(row.monthlyUnlockedCredit - clothesCommitted, 0);
  const supportAvailable = Math.max(row.cumulativeSupport - supportCommitted, 0);

  return {
    clothesCommitted,
    clothesAvailable,
    supportCommitted,
    supportAvailable,
    canRequestClothes: row.monthlyGoalReached && clothesAvailable > 0,
    canRequestSupport:
      row.role === "atleta" && supportAvailable >= ATHLETE_SUPPORT_MINIMUM_REDEMPTION,
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseMoney(value?: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNuvemFeeRule(
  order: NuvemshopOrder,
  financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"],
) {
  const method = normalizeText(
    `${order.payment_details?.method || ""} ${order.gateway_name || ""} ${order.gateway || ""} ${order.payment_status || ""}`,
  );
  const installments = Math.max(order.payment_details?.installments || 1, 1);

  if (method.includes("pix")) {
    return {
      percent: financeConfig.nuvemPixPercent,
      fixed: financeConfig.nuvemPixFixed,
    };
  }

  if (installments >= 3) {
    return {
      percent: financeConfig.nuvemCard3Percent,
      fixed: financeConfig.nuvemCard3Fixed,
    };
  }

  if (installments === 2) {
    return {
      percent: financeConfig.nuvemCard2Percent,
      fixed: financeConfig.nuvemCard2Fixed,
    };
  }

  return {
    percent: financeConfig.nuvemCard1Percent,
    fixed: financeConfig.nuvemCard1Fixed,
  };
}

function getNetRevenue(
  order: NuvemshopOrder,
  financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"],
) {
  const gross = parseMoney(order.total);
  const feeRule = getNuvemFeeRule(order, financeConfig);
  const feeCost = gross * (feeRule.percent / 100) + feeRule.fixed;
  return Math.max(gross - feeCost, 0);
}

function matchesDateRange(order: NuvemshopOrder, startDate: string, endDate: string) {
  if (!order.created_at) {
    return false;
  }

  const createdAt = new Date(order.created_at);
  const from = new Date(`${startDate}T00:00:00`);
  const to = new Date(`${endDate}T23:59:59`);

  return createdAt >= from && createdAt <= to;
}

function getCouponCode(order: NuvemshopOrder) {
  return (
    order.coupon
      ?.map((coupon) => coupon.code?.trim().toUpperCase())
      .filter(Boolean)[0] || null
  );
}

function getChannelLabel(order: NuvemshopOrder) {
  return order.gateway_name || order.gateway || "Nuvemshop";
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

function buildEmptyCouponStats(code: string): CouponStats {
  return {
    code,
    orders: 0,
    revenue: 0,
    netRevenue: 0,
    averageTicket: 0,
    lastOrderAt: null,
    channels: [],
  };
}

function aggregateCouponStats(
  orders: NuvemshopOrder[],
  couponCode: string,
  financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"],
) {
  const stats = buildEmptyCouponStats(couponCode);

  for (const order of orders) {
    stats.orders += 1;
    stats.revenue += parseMoney(order.total);
    stats.netRevenue += getNetRevenue(order, financeConfig);

    const channel = getChannelLabel(order);
    if (!stats.channels.includes(channel)) {
      stats.channels.push(channel);
    }

    if (!stats.lastOrderAt || new Date(order.created_at || 0) > new Date(stats.lastOrderAt)) {
      stats.lastOrderAt = order.created_at || null;
    }
  }

  stats.averageTicket = stats.orders > 0 ? stats.revenue / stats.orders : 0;
  return stats;
}

function buildPartnerRow(
  profile: CouponPartnerProfile,
  monthStats: CouponStats,
  lifetimeStats: CouponStats,
): PartnerPerformanceRow {
  const monthlyGoal =
    profile.role === "atleta" ? ATHLETE_WINDOW_GOAL : INFLUENCER_WINDOW_GOAL;
  const monthlyCreditPercent =
    profile.role === "atleta"
      ? ATHLETE_WINDOW_CREDIT_PERCENT
      : INFLUENCER_CREDIT_PERCENT;
  const monthlyGoalReached = monthStats.netRevenue >= monthlyGoal;
  const monthlyUnlockedCredit = monthlyGoalReached
    ? monthStats.netRevenue * (monthlyCreditPercent / 100)
    : 0;
  const cumulativeSupport =
    profile.role === "atleta"
      ? lifetimeStats.netRevenue * (ATHLETE_SUPPORT_PERCENT / 100)
      : 0;

  return {
    ...monthStats,
    name: profile.name,
    role: profile.role,
    notes: profile.notes,
    monthlyGoal,
    monthlyCreditPercent,
    monthlyUnlockedCredit,
    monthlyAmountToGoal: Math.max(monthlyGoal - monthStats.netRevenue, 0),
    monthlyGoalReached,
    lifetimeOrders: lifetimeStats.orders,
    lifetimeRevenue: lifetimeStats.revenue,
    lifetimeNetRevenue: lifetimeStats.netRevenue,
    cumulativeSupport,
  };
}
