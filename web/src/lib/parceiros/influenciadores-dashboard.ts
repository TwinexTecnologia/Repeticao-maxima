import { loadFinanceConfig } from "@/lib/financeiro/repository";
import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopOrder } from "@/lib/nuvemshop/types";

import type { CouponPartnerProfile, PartnerRole } from "./repository";

const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const RECENT_ORDERS_LIMIT = 20;
const INFLUENCER_WINDOW_GOAL = 2000;
const INFLUENCER_CREDIT_PERCENT = 14;
const ATHLETE_WINDOW_GOAL = 1500;
const ATHLETE_WINDOW_CREDIT_PERCENT = 10;
const ATHLETE_SUPPORT_PERCENT = 4;
const ATHLETE_SUPPORT_REFERENCE_COST = 400;

export type InfluenciadoresFiltro = {
  startDate: string;
  endDate: string;
  couponQuery: string;
  selectedCoupon: string;
};

export type CouponStats = {
  code: string;
  orders: number;
  revenue: number;
  netRevenue: number;
  averageTicket: number;
  lastOrderAt: string | null;
  channels: string[];
};

export type PartnerDashboardRow = CouponStats & {
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
  nextSupportMilestone: number | null;
};

export type InfluenciadoresDashboardData = {
  influencerRows: PartnerDashboardRow[];
  athleteRows: PartnerDashboardRow[];
  partnerRows: PartnerDashboardRow[];
  unclassifiedRows: CouponStats[];
  selectedCoupon: PartnerDashboardRow | null;
  selectedCouponOrders: Array<{ order: NuvemshopOrder; couponCode: string }>;
  topPartner: PartnerDashboardRow | null;
  topInfluencer: PartnerDashboardRow | null;
  topAthlete: PartnerDashboardRow | null;
  totalNetRevenue: number;
  totalMonthlyUnlocked: number;
  totalAthleteSupport: number;
  totalOrders: number;
  totalRevenue: number;
  partnersNearGoal: number;
};

export async function loadInfluenciadoresDashboard(
  filters: InfluenciadoresFiltro,
  profiles: CouponPartnerProfile[],
): Promise<
  | { ok: true; data: InfluenciadoresDashboardData }
  | { ok: false; message: string }
> {
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

    const allCouponOrders = orders
      .map((order) => ({
        order,
        couponCode: getCouponCode(order),
      }))
      .filter((item) => item.couponCode) as Array<{
      order: NuvemshopOrder;
      couponCode: string;
    }>;

    const filteredCouponOrders = allCouponOrders
      .filter((item) => matchesDateRange(item.order, filters.startDate, filters.endDate))
      .filter((item) => matchesCouponQuery(item.couponCode, filters.couponQuery));

    const filteredStatsMap = aggregateCouponStats(filteredCouponOrders, financeConfig);
    const lifetimeStatsMap = aggregateCouponStats(allCouponOrders, financeConfig);
    const activeProfiles = profiles.filter((profile) => profile.active);
    const profileCouponMap = new Map(
      activeProfiles.map((profile) => [profile.couponCode, profile]),
    );

    const partnerRows = activeProfiles
      .filter((profile) =>
        matchesCouponQuery(profile.couponCode, filters.couponQuery, profile.name),
      )
      .map((profile) =>
        buildPartnerRow(
          profile,
          filteredStatsMap.get(profile.couponCode) ||
            buildEmptyCouponStats(profile.couponCode),
          lifetimeStatsMap.get(profile.couponCode) ||
            buildEmptyCouponStats(profile.couponCode),
        ),
      )
      .sort((left, right) => right.netRevenue - left.netRevenue);

    const influencerRows = partnerRows.filter((row) => row.role === "influenciador");
    const athleteRows = partnerRows.filter((row) => row.role === "atleta");
    const topInfluencer = influencerRows[0] || null;
    const topAthlete = athleteRows[0] || null;

    const selectedCoupon =
      partnerRows.find((row) => row.code === filters.selectedCoupon) ||
      topInfluencer ||
      topAthlete ||
      null;

    const selectedCouponOrders = selectedCoupon
      ? filteredCouponOrders
          .filter((item) => item.couponCode === selectedCoupon.code)
          .sort((left, right) => {
            const leftDate = left.order.created_at
              ? new Date(left.order.created_at).getTime()
              : 0;
            const rightDate = right.order.created_at
              ? new Date(right.order.created_at).getTime()
              : 0;
            return rightDate - leftDate;
          })
          .slice(0, RECENT_ORDERS_LIMIT)
      : [];

    const unclassifiedRows = Array.from(filteredStatsMap.values())
      .filter((row) => !profileCouponMap.has(row.code))
      .sort((left, right) => right.netRevenue - left.netRevenue);

    const topPartner = partnerRows[0] || null;
    const totalRevenue = partnerRows.reduce((sum, row) => sum + row.revenue, 0);
    const totalNetRevenue = partnerRows.reduce((sum, row) => sum + row.netRevenue, 0);
    const totalOrders = partnerRows.reduce((sum, row) => sum + row.orders, 0);
    const totalMonthlyUnlocked = partnerRows.reduce(
      (sum, row) => sum + row.monthlyUnlockedCredit,
      0,
    );
    const totalAthleteSupport = athleteRows.reduce(
      (sum, row) => sum + row.cumulativeSupport,
      0,
    );
    const partnersNearGoal = partnerRows.filter(
      (row) => row.monthlyAmountToGoal > 0 && row.monthlyAmountToGoal <= 300,
    ).length;

    return {
      ok: true,
      data: {
        influencerRows,
        athleteRows,
        partnerRows,
        unclassifiedRows,
        selectedCoupon,
        selectedCouponOrders,
        topPartner,
        topInfluencer,
        topAthlete,
        totalNetRevenue,
        totalMonthlyUnlocked,
        totalAthleteSupport,
        totalOrders,
        totalRevenue,
        partnersNearGoal,
      },
    };
  } catch (error) {
    const message =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : "Nao foi possivel carregar os influenciadores a partir da Nuvemshop.";

    return {
      ok: false,
      message,
    };
  }
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
  if (!startDate && !endDate) {
    return true;
  }

  if (!order.created_at) {
    return false;
  }

  const createdAt = new Date(order.created_at);

  if (startDate) {
    const from = new Date(`${startDate}T00:00:00`);

    if (createdAt < from) {
      return false;
    }
  }

  if (endDate) {
    const to = new Date(`${endDate}T23:59:59`);

    if (createdAt > to) {
      return false;
    }
  }

  return true;
}

function getCouponCode(order: NuvemshopOrder) {
  return (
    order.coupon?.map((coupon) => coupon.code?.trim().toUpperCase()).filter(Boolean)[0] ||
    null
  );
}

function getChannelLabel(order: NuvemshopOrder) {
  return order.gateway_name || order.gateway || "Nuvemshop";
}

function matchesCouponQuery(value: string, couponQuery: string, extraText?: string) {
  if (!couponQuery) {
    return true;
  }

  const normalizedQuery = normalizeText(couponQuery);
  return (
    normalizeText(value).includes(normalizedQuery) ||
    normalizeText(extraText || "").includes(normalizedQuery)
  );
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
  items: Array<{ order: NuvemshopOrder; couponCode: string }>,
  financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"],
) {
  const statsMap = new Map<string, CouponStats>();

  for (const item of items) {
    const current = statsMap.get(item.couponCode) || buildEmptyCouponStats(item.couponCode);
    current.orders += 1;
    current.revenue += parseMoney(item.order.total);
    current.netRevenue += getNetRevenue(item.order, financeConfig);

    const channel = getChannelLabel(item.order);
    if (!current.channels.includes(channel)) {
      current.channels.push(channel);
    }

    if (
      !current.lastOrderAt ||
      new Date(item.order.created_at || 0) > new Date(current.lastOrderAt)
    ) {
      current.lastOrderAt = item.order.created_at || null;
    }

    current.averageTicket = current.orders > 0 ? current.revenue / current.orders : 0;
    statsMap.set(item.couponCode, current);
  }

  return statsMap;
}

function buildPartnerRow(
  profile: CouponPartnerProfile,
  monthStats: CouponStats,
  lifetimeStats: CouponStats,
): PartnerDashboardRow {
  const monthlyGoal = profile.role === "atleta" ? ATHLETE_WINDOW_GOAL : INFLUENCER_WINDOW_GOAL;
  const monthlyCreditPercent =
    profile.role === "atleta" ? ATHLETE_WINDOW_CREDIT_PERCENT : INFLUENCER_CREDIT_PERCENT;
  const monthlyGoalReached = monthStats.netRevenue >= monthlyGoal;
  const monthlyUnlockedCredit = monthlyGoalReached
    ? monthStats.netRevenue * (monthlyCreditPercent / 100)
    : 0;
  const cumulativeSupport =
    profile.role === "atleta" ? lifetimeStats.netRevenue * (ATHLETE_SUPPORT_PERCENT / 100) : 0;
  const nextSupportMilestone =
    profile.role === "atleta"
      ? Math.max(
          (Math.floor(cumulativeSupport / ATHLETE_SUPPORT_REFERENCE_COST) + 1) *
            ATHLETE_SUPPORT_REFERENCE_COST -
            cumulativeSupport,
          0,
        )
      : null;

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
    nextSupportMilestone,
  };
}
