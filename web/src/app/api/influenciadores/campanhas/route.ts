import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { createPartnerCampaign } from "@/lib/parceiros/campaigns-repository";

export async function POST(request: Request) {
  const authorization = await authorizeApiAccess("influenciadores");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const result = await createPartnerCampaign(body);

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
            : "Nao foi possivel criar a campanha.",
      },
      { status: 400 },
    );
  }
}
