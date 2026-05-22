import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { getNuvemshopDiagnostics } from "@/lib/nuvemshop/diagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await authorizeApiAccess("nuvemshop");

  if (!authorization.ok) {
    return authorization.response;
  }

  const diagnostics = await getNuvemshopDiagnostics();

  const status =
    diagnostics.status === "conectado"
      ? 200
      : diagnostics.status === "nao_configurado"
        ? 400
        : 502;

  return NextResponse.json(diagnostics, { status });
}
