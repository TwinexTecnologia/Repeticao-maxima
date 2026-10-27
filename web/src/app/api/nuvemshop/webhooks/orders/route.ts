import { NextResponse } from "next/server";

import {
  getNuvemshopCredentials,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import { syncPaidNuvemshopOrderToStock } from "@/lib/operacoes/repository";
import { consumePartnerStoreCreditSessionOrder } from "@/lib/parceiros/repository";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      route: "nuvemshop-order-webhooks",
      methods: ["GET", "POST"],
      supportedEvents: ["order/paid"],
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const event = String(body.event ?? request.headers.get("x-linkedstore-event") ?? "").trim();
    const orderId = String(body.id ?? body.order_id ?? "").trim();

    if (!event || !orderId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Webhook sem evento ou pedido valido.",
        },
        { status: 400 },
      );
    }

    if (event !== "order/paid") {
      return NextResponse.json(
        {
          ok: true,
          ignored: true,
          event,
        },
        { status: 200 },
      );
    }

    const credentials = getNuvemshopCredentials();

    if (!credentials.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: `Faltam credenciais da Nuvemshop: ${credentials.missing.join(", ")}.`,
        },
        { status: 500 },
      );
    }

    const client = new NuvemshopClient(credentials.credentials);
    const order = await client.getOrder(orderId);
    const stockSyncResult = await syncPaidNuvemshopOrderToStock({ order });

    if (!stockSyncResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: stockSyncResult.persistence.message,
          stock: {
            orderId: stockSyncResult.orderId,
            orderLabel: stockSyncResult.orderLabel,
            appliedCount: stockSyncResult.appliedCount,
            pendingCount: stockSyncResult.pendingCount,
            duplicateCount: stockSyncResult.duplicateCount,
            ignoredCount: stockSyncResult.ignoredCount,
          },
        },
        { status: 500 },
      );
    }

    const promotionsApplied = order.promotional_discount?.promotions_applied || [];
    const promotionIds = promotionsApplied
      .map((item) => String(item.id ?? "").trim())
      .filter(Boolean);
    let partnerResult = {
      ok: true,
      ignored: promotionIds.length === 0,
      message:
        promotionIds.length === 0
          ? "Pedido pago sem promocao de saldo do parceiro."
          : "Saldo do parceiro ainda nao conciliado.",
    };

    if (promotionIds.length > 0) {
      const totalDiscountAmount = parseMoney(
        order.promotional_discount?.total_discount_amount || order.discount || "0",
      );
      const items = (order.products || []).map((item) => {
        const quantity = Math.max(Number(item.quantity ?? 0) || 0, 0);
        const unitPrice = parseMoney(item.price || "0");

        return {
          name: String(item.name ?? item.sku ?? "Produto da loja").trim() || "Produto da loja",
          sku: String(item.sku ?? "").trim(),
          quantity,
          unitPrice,
          totalPrice: Math.round(unitPrice * quantity * 100) / 100,
        };
      });

      for (const promotionId of promotionIds) {
        const result = await consumePartnerStoreCreditSessionOrder({
          promotionId,
          orderId: String(order.id ?? orderId),
          orderNumber: order.number ? String(order.number) : null,
          paidAt: order.paid_at || order.updated_at || order.created_at || null,
          totalDiscountAmount,
          items,
        });

        if (result.ok) {
          partnerResult = {
            ok: true,
            ignored: false,
            message: result.message,
          };
          break;
        }

        partnerResult = {
          ok: false,
          ignored: false,
          message: result.message,
        };
      }
    }

    if (!partnerResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: partnerResult.message,
          stock: {
            orderId: stockSyncResult.orderId,
            orderLabel: stockSyncResult.orderLabel,
            appliedCount: stockSyncResult.appliedCount,
            pendingCount: stockSyncResult.pendingCount,
            duplicateCount: stockSyncResult.duplicateCount,
            ignoredCount: stockSyncResult.ignoredCount,
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: stockSyncResult.persistence.message,
        partner: partnerResult.message,
        stock: {
          orderId: stockSyncResult.orderId,
          orderLabel: stockSyncResult.orderLabel,
          appliedCount: stockSyncResult.appliedCount,
          pendingCount: stockSyncResult.pendingCount,
          duplicateCount: stockSyncResult.duplicateCount,
          ignoredCount: stockSyncResult.ignoredCount,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel processar o webhook de pedido pago.",
      },
      { status: 400 },
    );
  }
}

function parseMoney(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
