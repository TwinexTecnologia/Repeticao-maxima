import { AppShell } from "@/components/app-shell";
import { ComprasClient } from "./compras-client";
import { loadDebtModuleData } from "@/lib/operacoes/repository";

export default async function ComprasPage() {
  const { debts, persistence } = await loadDebtModuleData();

  return (
    <AppShell
      title="Compras, lotes e dividas"
      subtitle="Aqui voce acompanha o pedido da fabrica, os vencimentos do ciclo e o melhor momento para fazer a proxima compra."
      currentPath="/compras"
    >
      <ComprasClient
        initialDebts={debts}
        initialPersistence={persistence}
      />
    </AppShell>
  );
}
