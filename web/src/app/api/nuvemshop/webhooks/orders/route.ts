import { NextResponse } from "next/server";

import {
  getNuvemshopCredentials,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
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
    const promotionsApplied = order.promotional_discount?.promotions_applied || [];
    const promotionIds = promotionsApplied
      .map((item) => String(item.id ?? "").trim())
      .filter(Boolean);

    if (promotionIds.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          ignored: true,
          message: "Pedido pago sem promocao de saldo do parceiro.",
        },
        { status: 200 },
      );
    }

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
        return NextResponse.json(
          {
            ok: true,
            message: result.message,
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json(
      {
        ok: false,
        message: "Nenhuma sessao de saldo correspondente foi conciliada.",
      },
      { status: 404 },
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
