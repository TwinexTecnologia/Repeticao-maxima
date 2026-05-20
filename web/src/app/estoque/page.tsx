import { AppShell } from "@/components/app-shell";
import { EstoqueClient } from "./estoque-client";
import { loadStockModuleData } from "@/lib/operacoes/repository";

export default async function EstoquePage() {
  const {
    items,
    persistence,
    dtfItems,
    dtfPersistence,
    dtfCatalog,
    dtfCatalogState,
    nuvemshopStock,
    nuvemshopStockState,
  } = await loadStockModuleData();

  return (
    <AppShell
      title="Estoque base"
      subtitle="Controle das camisetas base por cor e tamanho e acompanhe tambem o estoque de DTF no mesmo lugar."
      currentPath="/estoque"
    >
      <EstoqueClient
        initialItems={items}
        initialPersistence={persistence}
        initialDtfItems={dtfItems}
        initialDtfPersistence={dtfPersistence}
        dtfCatalog={dtfCatalog}
        dtfCatalogState={dtfCatalogState}
        initialNuvemshopStock={nuvemshopStock}
        initialNuvemshopStockState={nuvemshopStockState}
      />
    </AppShell>
  );
}
