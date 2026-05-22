import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { createPartnerAccessUser } from "@/lib/usuarios/repository";

export async function POST(request: Request) {
  const authorization = await authorizeApiAccess("usuarios");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const result = await createPartnerAccessUser(body);

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
      partner: result.partner,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nao foi possivel criar o parceiro.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
