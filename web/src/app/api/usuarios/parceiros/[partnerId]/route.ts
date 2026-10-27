import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { updatePartnerAccessUser } from "@/lib/usuarios/repository";

type RouteContext = {
  params: Promise<{
    partnerId: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const authorization = await authorizeApiAccess("usuarios");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const { partnerId } = await context.params;
    const result = await updatePartnerAccessUser(partnerId, body);

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
      generatedPassword: result.generatedPassword,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel atualizar o parceiro.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
