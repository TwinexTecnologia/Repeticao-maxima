import { NextResponse } from "next/server";

import { updateCouponPartnerProfile } from "@/lib/parceiros/repository";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteProps) {
  try {
    const body = await request.json();
    const { id } = await context.params;
    const result = await updateCouponPartnerProfile(id, body);

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
      profile: result.profile,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel atualizar o parceiro por cupom.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
