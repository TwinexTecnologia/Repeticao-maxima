import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { reviewPendingStockMovement } from "@/lib/operacoes/repository";

function parseStockBaseKey(value: string) {
  const [sku = "", color = "", size = ""] = value.split("||");
  return {
    sku: sku.trim(),
    color: color.trim(),
    size: size.trim(),
  };
}

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
  const movementId = String(formData.get("movementId") ?? "").trim();
  const base = parseStockBaseKey(String(formData.get("stockBaseKey") ?? "").trim());

  const result = await reviewPendingStockMovement(movementId, {
    ...base,
    quantity: Number.parseInt(String(formData.get("quantity") ?? "0"), 10) || 0,
    originReference: String(formData.get("originReference") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    decision: String(formData.get("decision") ?? "aprovar").trim(),
    deductFromStock: String(formData.get("deductFromStock") ?? "").trim(),
    alreadyPrinted: String(formData.get("alreadyPrinted") ?? "").trim(),
  });

  revalidatePath("/estoque");

  return NextResponse.redirect(
    new URL(
      appendStockRedirect(
        redirectTo,
        result.ok ? "success" : "error",
        result.persistence.message ||
          (result.ok
            ? "Saida revisada com sucesso."
            : "Nao foi possivel concluir a revisao da saida."),
      ),
      request.url,
    ),
    { status: 303 },
  );
}
