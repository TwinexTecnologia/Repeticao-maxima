import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import {
  createPartnerContentAsset,
  createPartnerContentCampaign,
  createPartnerContentProduct,
} from "@/lib/parceiros/content-repository";

export async function POST(request: Request) {
  const authorization = await authorizeApiAccess("influenciadores");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const entityKind = String(body?.entityKind ?? "").trim().toLowerCase();

    if (entityKind === "campaign") {
      const result = await createPartnerContentCampaign(body);

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
        entityKind,
        message: result.persistence.message,
        campaign: result.campaign,
      });
    }

    if (entityKind === "product") {
      const result = await createPartnerContentProduct(body);

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
        entityKind,
        message: result.persistence.message,
        product: result.product,
      });
    }

    if (entityKind === "asset") {
      const result = await createPartnerContentAsset(body);

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
        entityKind,
        message: result.persistence.message,
        asset: result.asset,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        message: "Tipo de conteudo invalido.",
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel criar o item da Central de Conteudo.",
      },
      { status: 400 },
    );
  }
}
