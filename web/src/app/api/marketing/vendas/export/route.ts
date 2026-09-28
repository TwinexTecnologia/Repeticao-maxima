import { authorizeApiAccess } from "@/lib/auth/access";
import {
  buildSalesCsv,
  buildSalesExportRows,
  getMarketingFilters,
  loadMarketingModuleData,
} from "@/lib/marketing/repository";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  const authorization = await authorizeApiAccess("nuvemshop");

  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(request.url);
  const filters = getMarketingFilters(Object.fromEntries(url.searchParams.entries()));
  const format = normalizeExportFormat(url.searchParams.get("format"));
  const data = await loadMarketingModuleData(filters);

  if (data.credentialsMessage) {
    return new Response(data.credentialsMessage, { status: 503 });
  }

  if (data.salesError) {
    return new Response(data.salesError, { status: 502 });
  }

  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(buildSalesExportRows(data.salesRows));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vendas");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="marketing-vendas-${buildDateStamp()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(buildSalesCsv(data.salesRows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="marketing-vendas-${buildDateStamp()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function buildDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeExportFormat(value: string | null) {
  return value?.trim().toLowerCase() === "xlsx" ? "xlsx" : "csv";
}
