import { NextResponse } from "next/server";

import { loadAuthenticatedAppUser } from "@/lib/auth/access";
import {
  ATHLETE_SUPPORT_MINIMUM_REDEMPTION,
  formatDateOnly,
  getCurrentMonthInput,
  getPartnerAvailableBalances,
  loadPartnerPerformanceSnapshot,
} from "@/lib/parceiros/performance";
import { loadPartnerCampaigns } from "@/lib/parceiros/campaigns-repository";
import {
  createPartnerRewardRequest,
  loadCouponPartnerProfiles,
  loadPartnerRewardRequests,
} from "@/lib/parceiros/repository";

export async function POST(request: Request) {
  const user = await loadAuthenticatedAppUser();

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        message: "Voce precisa estar autenticado para solicitar resgate.",
      },
      { status: 401 },
    );
  }

  if (!user.active || user.userType !== "parceiro" || !user.profileId || !user.linkedPartnerId) {
    return NextResponse.json(
      {
        ok: false,
        message: "Seu acesso de parceiro ainda nao esta vinculado a um cupom valido.",
      },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      selectedMonth?: string;
      requestType?: "roupa" | "apoio";
      supportGoal?: string;
    };
    const selectedMonth = body.selectedMonth || getCurrentMonthInput();
    const requestType = body.requestType === "apoio" ? "apoio" : "roupa";
    const [profilesData, campaignsData] = await Promise.all([
      loadCouponPartnerProfiles(),
      loadPartnerCampaigns(),
    ]);
    const profile = profilesData.profiles.find(
      (item) => item.id === user.linkedPartnerId && item.active,
    );

    if (!profile) {
      return NextResponse.json(
        {
          ok: false,
          message: "Nao foi possivel localizar o cupom ativo desse parceiro.",
        },
        { status: 404 },
      );
    }

    const partnerCampaigns = campaignsData.campaigns.filter(
      (campaign) =>
        campaign.active &&
        campaign.useCurrentWindow &&
        campaign.participants.some((participant) => participant.partnerId === profile.id),
    );
    const windowCampaign =
      partnerCampaigns
        .slice()
        .sort((left, right) => (right.endDate || "").localeCompare(left.endDate || ""))[0] || null;
    const effectiveMonth = windowCampaign?.endDate ? windowCampaign.endDate.slice(0, 7) : selectedMonth;

    const [performance, requests] = await Promise.all([
      loadPartnerPerformanceSnapshot(profile, effectiveMonth, {
        window: windowCampaign
          ? {
              startDate: windowCampaign.startDate,
              endDate: windowCampaign.endDate,
              label: `${formatDateOnly(windowCampaign.startDate)} a ${formatDateOnly(windowCampaign.endDate)}`,
            }
          : undefined,
        monthlyGoal: windowCampaign?.qualificationGoal,
      }),
      loadPartnerRewardRequests({ userProfileId: user.profileId }),
    ]);

    if (!performance.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: performance.message,
        },
        { status: 500 },
      );
    }

    const balances = getPartnerAvailableBalances(
      performance.data.row,
      performance.data.rollingWindow,
      requests,
    );

    if (requestType === "roupa") {
      if (!balances.canRequestClothes) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Essa janela ainda nao liberou saldo em roupa ou esse valor ja foi solicitado anteriormente.",
          },
          { status: 400 },
        );
      }

      const result = await createPartnerRewardRequest({
        userProfileId: user.profileId,
        couponPartnerId: user.linkedPartnerId,
        partnerName: performance.data.row.name,
        couponCode: profile.couponCode,
        partnerRole: profile.role,
        requestType: "roupa",
        supportGoal: "",
        requestedAmount: balances.clothesAvailable,
        availableAmount: balances.clothesAvailable,
        minimumAmount: performance.data.row.monthlyGoal,
        windowStartDate: performance.data.rollingWindow.startDate,
        windowEndDate: performance.data.rollingWindow.endDate,
        notes: `Resgate de roupa solicitado na janela ${performance.data.rollingWindow.label}.`,
      });

      return NextResponse.json({
        ok: result.ok,
        message: result.ok
          ? "Seu resgate em roupa foi enviado para o admin."
          : result.persistence.message,
        request: result.ok ? result.request : null,
      });
    }

    if (profile.role !== "atleta") {
      return NextResponse.json(
        {
          ok: false,
          message: "Somente atletas podem solicitar apoio esportivo.",
        },
        { status: 400 },
      );
    }

    if (!balances.canRequestSupport) {
      return NextResponse.json(
        {
          ok: false,
          message: `O saldo de apoio precisa ter pelo menos R$ ${ATHLETE_SUPPORT_MINIMUM_REDEMPTION} livres para solicitar esse resgate.`,
        },
        { status: 400 },
      );
    }

    const supportGoal = String(body.supportGoal ?? "").trim() || "Pintura / Kit / Apoio";
    const result = await createPartnerRewardRequest({
      userProfileId: user.profileId,
      couponPartnerId: user.linkedPartnerId,
      partnerName: performance.data.row.name,
      couponCode: profile.couponCode,
      partnerRole: profile.role,
      requestType: "apoio",
      supportGoal,
      requestedAmount: balances.supportAvailable,
      availableAmount: balances.supportAvailable,
      minimumAmount: ATHLETE_SUPPORT_MINIMUM_REDEMPTION,
      windowStartDate: null,
      windowEndDate: null,
      notes: `Solicitacao de apoio esportivo para ${supportGoal}.`,
    });

    return NextResponse.json({
      ok: result.ok,
      message: result.ok
        ? "Seu pedido de apoio foi enviado para o admin."
        : result.persistence.message,
      request: result.ok ? result.request : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel enviar a solicitacao de resgate.",
      },
      { status: 400 },
    );
  }
}
