import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { createDebt } from "@/lib/operacoes/repository";

export async function POST(request: Request) {
  const authorization = await authorizeApiAccess("compras");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const result = await createDebt(body);

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
      debts: result.debts,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel processar a nova divida.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
