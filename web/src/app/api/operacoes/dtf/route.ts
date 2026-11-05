import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { createDtfItem } from "@/lib/operacoes/repository";

export async function POST(request: Request) {
  const authorization = await authorizeApiAccess("estoque");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const result = await createDtfItem(body);

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
      item: result.item,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel processar o novo DTF.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
