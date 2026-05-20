import { NextResponse } from "next/server";

import { createCompanyCartDiscountRule } from "@/lib/empresa/repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createCompanyCartDiscountRule(
      body,
      new URL(request.url).origin,
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: result.persistence.message,
          persistence: result.persistence,
        },
        { status: result.persistence.enabled ? 500 : 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.persistence.message,
      persistence: result.persistence,
      rule: result.rule,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel processar a promocao de carrinho.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
