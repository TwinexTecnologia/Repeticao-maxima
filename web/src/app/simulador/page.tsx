import { AppShell } from "@/components/app-shell";
import { loadFinanceConfig } from "@/lib/financeiro/repository";

import { SimuladorClient } from "./simulador-client";

export default async function SimuladorPage() {
  const { config, persistence } = await loadFinanceConfig();

  return (
    <AppShell
      title="Laboratorio de margens"
      subtitle="Ajuste custos, combos e taxas para entender rapido onde a margem esta forte e onde o canal esta apertado."
      currentPath="/simulador"
    >
      <SimuladorClient
        initialConfig={config}
        initialPersistence={persistence}
      />
    </AppShell>
  );
}
