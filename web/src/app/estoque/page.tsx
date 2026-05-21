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
      title="Estoque inteligente"
      subtitle="Controle o fisico por cor e tamanho, acompanhe o que esta publicado na loja, veja a folga para remanejar entre artes e saiba quando pedir nova camiseta a tempo."
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
