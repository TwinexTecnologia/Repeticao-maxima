import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { saveFinanceConfig } from "@/lib/financeiro/repository";

export async function PUT(request: Request) {
  const authorization = await authorizeApiAccess("financeiro");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const result = await saveFinanceConfig(body);

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
      config: result.config,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel processar a configuracao do financeiro.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
