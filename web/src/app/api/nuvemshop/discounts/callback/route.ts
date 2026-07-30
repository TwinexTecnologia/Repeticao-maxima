import { NextResponse } from "next/server";

import {
  buildCompanyDiscountCallbackDecision,
} from "@/lib/empresa/nuvemshop-discounts";
import { loadPublishedCompanyDiscountRulesForCallback } from "@/lib/empresa/repository";

export async function GET() {
  const rules = await loadPublishedCompanyDiscountRulesForCallback();
  const appPublicUrl =
    process.env.APP_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    null;

  return NextResponse.json(
    {
      ok: true,
      route: "nuvemshop-discounts-callback",
      publishedRules: rules.length,
      appPublicUrl,
      methods: ["GET", "POST"],
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const rules = await loadPublishedCompanyDiscountRulesForCallback();
    const decision = buildCompanyDiscountCallbackDecision(payload, rules);

    if (decision.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(decision.body, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel avaliar o carrinho para desconto.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
