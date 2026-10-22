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
  const singleOrderId = String(formData.get("orderId") ?? "").trim();
  const orderIds = String(formData.get("orderIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const targetOrderIds = orderIds.length > 0 ? Array.from(new Set(orderIds)) : [singleOrderId].filter(Boolean);

  if (targetOrderIds.length === 0) {
    return NextResponse.redirect(
      new URL(
        appendStockRedirect(
          redirectTo,
          "error",
          "Nao foi possivel identificar a venda do site para trazer ao extrato.",
        ),
        request.url,
      ),
      { status: 303 },
    );
  }

  const results = await Promise.all(
    targetOrderIds.map(async (orderId) => ({
      orderId,
      result: await importPaidNuvemshopOrderToStockReview(orderId),
    })),
  );
  const successCount = results.filter((entry) => entry.result.ok).length;
  const failureResults = results.filter((entry) => !entry.result.ok);
  const hasFailures = failureResults.length > 0;
  const isSuccess = successCount > 0;

  const message =
    targetOrderIds.length === 1
      ? results[0]?.result.persistence.message ||
        (isSuccess
          ? "Venda do site enviada para revisao no extrato."
          : "Nao foi possivel trazer a venda do site para revisao.")
      : isSuccess && !hasFailures
        ? `${successCount} venda(s) do site foram trazidas para revisao no extrato.`
        : isSuccess
          ? `${successCount} venda(s) foram trazidas para revisao, mas ${failureResults.length} falharam. ${failureResults[0]?.result.persistence.message || ""}`.trim()
          : failureResults[0]?.result.persistence.message ||
            "Nao foi possivel trazer as vendas do site para revisao.";

  revalidatePath("/estoque");

  return NextResponse.redirect(
    new URL(
      appendStockRedirect(
        redirectTo,
        isSuccess ? "success" : "error",
        message,
      ),
      request.url,
    ),
    { status: 303 },
  );
}
