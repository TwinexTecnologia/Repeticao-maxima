import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { reviewPartnerRewardRequest } from "@/lib/parceiros/repository";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteProps) {
  const authorization = await authorizeApiAccess("influenciadores");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const { id } = await context.params;
    const result = await reviewPartnerRewardRequest(id, body);

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
      request: result.request,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nao foi possivel revisar a solicitacao.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
