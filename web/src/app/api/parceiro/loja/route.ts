import { NextResponse } from "next/server";

import { loadAuthenticatedAppUser } from "@/lib/auth/access";
import { createPartnerStoreCreditSession } from "@/lib/parceiros/repository";

export async function POST(request: Request) {
  const user = await loadAuthenticatedAppUser();

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        message: "Voce precisa estar autenticado para abrir a loja com saldo.",
      },
      { status: 401 },
    );
  }

  if (!user.active || user.userType !== "parceiro" || !user.profileId) {
    return NextResponse.json(
      {
        ok: false,
        message: "Seu acesso atual nao pode usar saldo na loja.",
      },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      requestId?: string;
      nextPath?: string;
    };
    const requestId = String(body.requestId ?? "").trim();

    if (!requestId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Selecione o saldo aprovado que sera usado na loja.",
        },
        { status: 400 },
      );
    }

    const result = await createPartnerStoreCreditSession({
      requestId,
      userProfileId: user.profileId,
      nextPath: typeof body.nextPath === "string" ? body.nextPath : "/",
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: result.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      redirectUrl: result.redirectUrl,
      session: result.session,
      message: "Saldo preparado. Voce ja pode continuar a compra na loja real.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel abrir a loja com saldo.",
      },
      { status: 400 },
    );
  }
}
