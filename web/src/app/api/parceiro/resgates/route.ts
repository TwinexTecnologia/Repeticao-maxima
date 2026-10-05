import { NextResponse } from "next/server";

import { loadAuthenticatedAppUser } from "@/lib/auth/access";
import { loadStoreProductSelectionOptions, loadStockSelectionOptions } from "@/lib/operacoes/repository";
import {
  consumePartnerRewardRequestAmount,
  createPartnerRedemption,
  deletePartnerRedemption,
  loadCouponPartnerProfiles,
  loadPartnerRewardRequests,
} from "@/lib/parceiros/repository";
import { getPartnerRewardRequestRemainingAmount } from "@/lib/parceiros/performance";

export async function POST(request: Request) {
  const user = await loadAuthenticatedAppUser();

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        message: "Voce precisa estar autenticado para resgatar na plataforma.",
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
      requestId?: string;
      productSelectionId?: string;
      quantity?: number | string;
    };
    const requestId = String(body.requestId ?? "").trim();
    const productSelectionId = String(body.productSelectionId ?? "").trim();
    const quantity = Math.max(1, Math.trunc(Number(body.quantity ?? 1) || 1));

    if (!requestId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Selecione qual aprovacao voce quer transformar em resgate.",
        },
        { status: 400 },
      );
    }

    if (!productSelectionId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Selecione o produto da loja para registrar o resgate.",
        },
        { status: 400 },
      );
    }

    const [profilesData, approvedRequests, storeProductOptions, stockOptions] = await Promise.all([
      loadCouponPartnerProfiles(),
      loadPartnerRewardRequests({
        userProfileId: user.profileId,
        statuses: ["aprovado"],
      }),
      loadStoreProductSelectionOptions(),
      loadStockSelectionOptions(),
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

    const approvedRequest = approvedRequests.find(
      (item) => item.id === requestId && item.requestType === "roupa" && item.status === "aprovado",
    );

    if (!approvedRequest) {
      return NextResponse.json(
        {
          ok: false,
          message: "Essa aprovacao de roupa nao esta mais disponivel para resgate.",
        },
        { status: 404 },
      );
    }

    const selectedProduct = storeProductOptions.find((item) => item.id === productSelectionId);

    if (!selectedProduct) {
      return NextResponse.json(
        {
          ok: false,
          message: "O produto selecionado nao foi encontrado na loja.",
        },
        { status: 404 },
      );
    }

    if (selectedProduct.unitPrice <= 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Esse produto nao tem preco valido configurado na loja.",
        },
        { status: 400 },
      );
    }

    const stockItem = stockOptions.find(
      (item) =>
        sameText(item.sku, selectedProduct.sku) &&
        sameText(item.color, selectedProduct.color) &&
        sameText(item.size, selectedProduct.size),
    );

    if (!stockItem) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Esse produto nao encontrou uma lisa correspondente no estoque interno para registrar o resgate.",
        },
        { status: 400 },
      );
    }

    if (stockItem.plain < quantity) {
      return NextResponse.json(
        {
          ok: false,
          message: `Temos apenas ${stockItem.plain} lisa(s) disponiveis para esse item no estoque.`,
        },
        { status: 400 },
      );
    }

    const totalCost = Math.round(selectedProduct.unitPrice * quantity * 100) / 100;

    const remainingApprovedAmount = getPartnerRewardRequestRemainingAmount(approvedRequest);

    if (totalCost > remainingApprovedAmount) {
      const maxQuantity = Math.floor(remainingApprovedAmount / selectedProduct.unitPrice);

      return NextResponse.json(
        {
          ok: false,
          message:
            maxQuantity > 0
              ? `Esse resgate passa do valor aprovado. Com esse item, o maximo permitido agora e ${maxQuantity} unidade(s).`
              : "O saldo restante aprovado ainda nao cobre o preco normal desse produto.",
        },
        { status: 400 },
      );
    }

    const grantedAt = new Date().toISOString().slice(0, 10);
    const redemptionResult = await createPartnerRedemption({
      partnerId: profile.id,
      partnerName: profile.name,
      couponCode: profile.couponCode,
      partnerRole: profile.role,
      stockItemId: stockItem.id,
      sku: stockItem.sku,
      color: stockItem.color,
      size: stockItem.size,
      quantity,
      unitCost: selectedProduct.unitPrice,
      grantedAt,
      dueDate: "",
      adjustStock: true,
      createMarketingDebt: false,
      productLabel: selectedProduct.optionLabel,
      notes: "Resgate por batimento de meta",
      status: "entregue",
    });

    if (!redemptionResult.ok || !redemptionResult.redemption) {
      return NextResponse.json(
        {
          ok: false,
          message: redemptionResult.persistence.message,
        },
        { status: redemptionResult.persistence.enabled ? 500 : 503 },
      );
    }

    const requestResult = await consumePartnerRewardRequestAmount(requestId, {
      consumedAmount: totalCost,
      adminMessage:
        remainingApprovedAmount - totalCost <= 0
          ? "Saldo consumido integralmente no resgate da plataforma."
          : `Resgate registrado na plataforma. Saldo restante: R$ ${(
              remainingApprovedAmount - totalCost
            )
              .toFixed(2)
              .replace(".", ",")}.`,
    });

    if (!requestResult.ok) {
      await deletePartnerRedemption(redemptionResult.redemption.id);

      return NextResponse.json(
        {
          ok: false,
          message: requestResult.persistence.message,
        },
        { status: requestResult.persistence.enabled ? 500 : 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Resgate registrado com sucesso no seu historico e no painel do admin.",
      redemption: redemptionResult.redemption,
      request: requestResult.request,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel concluir o resgate dentro da plataforma.",
      },
      { status: 400 },
    );
  }
}

function sameText(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
