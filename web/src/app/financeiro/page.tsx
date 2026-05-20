import { AppShell } from "@/components/app-shell";
import { FinanceiroClient } from "./financeiro-client";
import { loadFinanceConfig } from "@/lib/financeiro/repository";
import { loadMonthlyFinanceFlow } from "@/lib/financeiro/flow";

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
  const selectedMonth = getSearchValue(resolvedSearchParams, "month");
  const [{ config, persistence }, flow] = await Promise.all([
    loadFinanceConfig(),
    loadMonthlyFinanceFlow(selectedMonth),
  ]);

  return (
    <AppShell
      title="Financeiro"
      subtitle="Acompanhe so o fluxo do mes, com entradas liquidas por canal e saidas vindas das dividas da operacao."
      currentPath="/financeiro"
    >
      <FinanceiroClient
        initialConfig={config}
        initialPersistence={persistence}
        initialFlow={flow}
      />
    </AppShell>
  );
}
