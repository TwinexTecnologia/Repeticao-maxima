import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function FinanceiroPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const selectedMonth = getSearchValue(resolvedSearchParams, "month").trim();
  redirect(selectedMonth ? `/pedidos?month=${selectedMonth}` : "/pedidos");
}
