import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { updatePartnerCampaign } from "@/lib/parceiros/campaigns-repository";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeApiAccess("influenciadores");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const { id } = await context.params;
    const result = await updatePartnerCampaign(id, body);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: result.persistence.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.persistence.message,
      campaign: result.campaign,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel atualizar a campanha.",
      },
      { status: 400 },
    );
  }
}
