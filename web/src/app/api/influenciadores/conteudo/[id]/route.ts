import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import {
  updatePartnerContentAsset,
  updatePartnerContentCampaign,
  updatePartnerContentProduct,
} from "@/lib/parceiros/content-repository";

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
    const entityKind = String(body?.entityKind ?? "").trim().toLowerCase();

    if (entityKind === "campaign") {
      const result = await updatePartnerContentCampaign(id, body);

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
      const result = await updatePartnerContentProduct(id, body);

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
      const result = await updatePartnerContentAsset(id, body);

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
            : "Nao foi possivel atualizar o item da Central de Conteudo.",
      },
      { status: 400 },
    );
  }
}
