import { NextResponse } from "next/server";

import {
  updateCompanyCartDiscountRule,
  updateCompanyCartDiscountRuleStatus,
} from "@/lib/empresa/repository";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteProps) {
  try {
    const body = await request.json();
    const { id } = await context.params;
    const result = await updateCompanyCartDiscountRuleStatus(
      id,
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
        : "Nao foi possivel atualizar a promocao de carrinho.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request, context: RouteProps) {
  try {
    const body = await request.json();
    const { id } = await context.params;
    const result = await updateCompanyCartDiscountRule(
      id,
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
        : "Nao foi possivel editar a promocao de carrinho.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
