import { authorizeApiAccess } from "@/lib/auth/access";
import {
  buildAbandonedCsv,
  getMarketingFilters,
  loadMarketingModuleData,
} from "@/lib/marketing/repository";

export async function GET(request: Request) {
  const authorization = await authorizeApiAccess("nuvemshop");

  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(request.url);
  const filters = getMarketingFilters(Object.fromEntries(url.searchParams.entries()));
  const data = await loadMarketingModuleData(filters);

  if (data.credentialsMessage) {
    return new Response(data.credentialsMessage, { status: 503 });
  }

  if (data.abandonedError) {
    return new Response(data.abandonedError, { status: 502 });
  }

  const filename = `marketing-carrinhos-abandonados-${buildDateStamp()}.csv`;

  return new Response(buildAbandonedCsv(data.abandonedRows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function buildDateStamp() {
  return new Date().toISOString().slice(0, 10);
}
