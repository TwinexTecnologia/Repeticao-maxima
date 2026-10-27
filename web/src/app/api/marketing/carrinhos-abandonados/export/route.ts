import { authorizeApiAccess } from "@/lib/auth/access";
import {
  buildAbandonedCsv,
  buildAbandonedExportRows,
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

  if (data.abandonedError) {
    return new Response(data.abandonedError, { status: 502 });
  }

  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(
      buildAbandonedExportRows(data.abandonedRows),
    );
    XLSX.utils.book_append_sheet(workbook, worksheet, "Carrinhos abandonados");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="marketing-carrinhos-abandonados-${buildDateStamp()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(buildAbandonedCsv(data.abandonedRows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="marketing-carrinhos-abandonados-${buildDateStamp()}.csv"`,
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
