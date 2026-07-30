import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import {
  createPartnerRedemption,
  updatePartnerRedemption,
} from "@/lib/parceiros/repository";

export async function POST(request: Request) {
  const authorization = await authorizeApiAccess("influenciadores");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const result = await createPartnerRedemption(body);

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
      redemption: result.redemption,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel processar o resgate do parceiro.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeApiAccess("influenciadores");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const id =
      typeof body?.id === "string" && body.id.trim() ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Informe qual resgate voce quer editar.",
        },
        { status: 400 },
      );
    }

    const result = await updatePartnerRedemption(id, body);

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
      redemption: result.redemption,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel editar o resgate do parceiro.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
