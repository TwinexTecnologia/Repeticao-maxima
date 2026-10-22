import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { importPaidNuvemshopOrderToStockReview } from "@/lib/operacoes/repository";

function appendStockRedirect(basePath: string, status: "success" | "error", message: string) {
  const normalizedBase = basePath.trim() || "/estoque";
  const url = new URL(
    normalizedBase.startsWith("http") ? normalizedBase : `http://localhost${normalizedBase}`,
  );

  url.searchParams.set("stockStatus", status);
  url.searchParams.set("stockMessage", message);
  url.searchParams.delete("panel");
  url.searchParams.delete("movementId");
  url.searchParams.delete("cellKey");
  url.searchParams.delete("correctionBaseKey");
  url.searchParams.delete("correctionQty");
  url.searchParams.delete("correctionNotes");
  url.searchParams.delete("correctionReference");

  return `${url.pathname}${url.search}`;
}

export async function POST(request: Request) {
  const authorization = await authorizeApiAccess("estoque");

  if (!authorization.ok) {
    return authorization.response;
  }

  const formData = await request.formData();
  const redirectTo = String(formData.get("redirectTo") ?? "/estoque").trim() || "/estoque";
  const orderId = String(formData.get("orderId") ?? "").trim();
  const result = await importPaidNuvemshopOrderToStockReview(orderId);

  revalidatePath("/estoque");

  return NextResponse.redirect(
    new URL(
      appendStockRedirect(
        redirectTo,
        result.ok ? "success" : "error",
        result.persistence.message ||
          (result.ok
            ? "Venda do site enviada para revisao no extrato."
            : "Nao foi possivel trazer a venda do site para revisao."),
      ),
      request.url,
    ),
    { status: 303 },
  );
}
