import { loadFinanceConfig } from "@/lib/financeiro/repository";
import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopOrder } from "@/lib/nuvemshop/types";

import type { PartnerRole } from "./repository";
import type { PartnerCampaign } from "./campaigns-repository";

const PAGE_SIZE = 100;
const MAX_PAGES = 12;

type CouponStats = {
  orders: number;
  revenue: number;
  netRevenue: number;
  lastOrderAt: string | null;
};

export type PartnerCampaignLeaderboardEntry = {
  partnerId: string;
  name: string;
  couponCode: string;
  role: PartnerRole;
  orders: number;
  revenue: number;
  netRevenue: number;
  qualified: boolean;
  remainingToGoal: number;
  actualRank: number;
  displayRank: number;
  lastOrderAt: string | null;
};

export type PartnerCampaignSnapshot = {
  campaignId: string;
  name: string;
  description: string;
  importantMessage: string;
  useCurrentWindow: boolean;
  startDate: string;
  endDate: string;
  qualificationGoal: number;
  bonusAmount: number;
  rankingLocked: boolean;
  active: boolean;
  totalNetRevenue: number;
  qualifiedCount: number;
  daysRemaining: number;
  leaderboard: PartnerCampaignLeaderboardEntry[];
  winnerPartnerId: string | null;
};

export async function loadPartnerCampaignSnapshots(
  campaigns: PartnerCampaign[],
  windowOverride?: { startDate: string; endDate: string },
) {
  if (campaigns.length === 0) {
    return [] as PartnerCampaignSnapshot[];
  }

  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return [] as PartnerCampaignSnapshot[];
  }

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const [{ config: financeConfig }, orders] = await Promise.all([
      loadFinanceConfig(),
      fetchAllOrders(client),
    ]);
    const defaultWindow = getRollingWindowRange(getCurrentMonthInput());

    return campaigns.map((campaign) => {
      const effectiveWindow =
        campaign.useCurrentWindow === true
          ? windowOverride ?? defaultWindow
          : { startDate: campaign.startDate, endDate: campaign.endDate };
      const startDate = effectiveWindow.startDate;
      const endDate = effectiveWindow.endDate;
      const leaderboard = campaign.participants
        .map((participant) => {
          const partnerOrders = orders.filter(
            (order) =>
              getCouponCode(order) === participant.couponCode &&
              matchesDateRange(order, startDate, endDate),
          );
          const stats = aggregateCouponStats(partnerOrders, financeConfig);

          return {
            partnerId: participant.partnerId,
            name: participant.name,
            couponCode: participant.couponCode,
            role: participant.role,
            orders: stats.orders,
            revenue: stats.revenue,
            netRevenue: stats.netRevenue,
            qualified: stats.netRevenue >= campaign.qualificationGoal,
            remainingToGoal: Math.max(campaign.qualificationGoal - stats.netRevenue, 0),
            actualRank: 0,
            displayRank: 0,
            lastOrderAt: stats.lastOrderAt,
          };
        })
        .sort((left, right) => {
          if (right.netRevenue !== left.netRevenue) {
            return right.netRevenue - left.netRevenue;
          }

          if (right.orders !== left.orders) {
            return right.orders - left.orders;
          }

          const leftDate = left.lastOrderAt ? new Date(left.lastOrderAt).getTime() : 0;
          const rightDate = right.lastOrderAt ? new Date(right.lastOrderAt).getTime() : 0;

          if (rightDate !== leftDate) {
            return rightDate - leftDate;
          }

          return left.name.localeCompare(right.name);
        })
        .map((entry, index) => ({
          ...entry,
          actualRank: index + 1,
          displayRank:
            campaign.rankingLocked && index === 0 ? 2 : index + 1,
        }));

      return {
        campaignId: campaign.id,
        name: campaign.name,
        description: campaign.description,
        importantMessage: campaign.importantMessage,
        useCurrentWindow: campaign.useCurrentWindow,
        startDate,
        endDate,
        qualificationGoal: campaign.qualificationGoal,
        bonusAmount: campaign.bonusAmount,
        rankingLocked: campaign.rankingLocked,
        active: campaign.active,
        totalNetRevenue: leaderboard.reduce((sum, item) => sum + item.netRevenue, 0),
        qualifiedCount: leaderboard.filter((item) => item.qualified).length,
        daysRemaining: getDaysRemaining(endDate),
        winnerPartnerId: leaderboard[0]?.partnerId || null,
        leaderboard,
      };
    });
  } catch (error) {
    if (error instanceof NuvemshopApiError) {
      return [] as PartnerCampaignSnapshot[];
    }

    return [] as PartnerCampaignSnapshot[];
  }
}

function getCurrentMonthInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeMonthInput(value: string) {
  return /^\d{4}-\d{2}$/.test(value) ? value : getCurrentMonthInput();
}

function getRollingWindowRange(monthInput: string) {
  const normalizedMonth = normalizeMonthInput(monthInput);
  const [yearText, monthText] = normalizedMonth.split("-");
  const year = Number.parseInt(yearText || "", 10);
  const monthIndex = Number.parseInt(monthText || "", 10) - 1;
  const start = new Date(year, monthIndex - 2, 1);
  const end = new Date(year, monthIndex + 1, 0);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

  return {
    startDate,
    endDate,
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

function getCouponCode(order: NuvemshopOrder) {
  return (
    order.coupon
      ?.map((coupon) => coupon.code?.trim().toUpperCase())
      .filter(Boolean)[0] || null
  );
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

function aggregateCouponStats(
  orders: NuvemshopOrder[],
  financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"],
): CouponStats {
  const stats: CouponStats = {
    orders: 0,
    revenue: 0,
    netRevenue: 0,
    lastOrderAt: null,
  };

  for (const order of orders) {
    stats.orders += 1;
    stats.revenue += parseMoney(order.total);
    stats.netRevenue += getNetRevenue(order, financeConfig);

    if (!stats.lastOrderAt || new Date(order.created_at || 0) > new Date(stats.lastOrderAt)) {
      stats.lastOrderAt = order.created_at || null;
    }
  }

  return stats;
}

function getDaysRemaining(endDate: string) {
  const today = new Date();
  const end = new Date(`${endDate}T23:59:59`);
  const diff = end.getTime() - today.getTime();

  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
}
