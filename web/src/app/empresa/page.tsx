import { AppShell } from "@/components/app-shell";
import { loadCompanyDiscountModuleData } from "@/lib/empresa/repository";
import { EmpresaClient } from "./empresa-client";

export default async function EmpresaPage() {
  const { rules, categories, products, persistence, catalogState } =
    await loadCompanyDiscountModuleData();

  return (
    <AppShell
      title="Empresa e configuracoes"
      subtitle="Use esta area para configurar as regras base da operacao. Comecando pelas promocoes de desconto no fim do carrinho."
      currentPath="/empresa"
    >
      <EmpresaClient
        initialRules={rules}
        initialCategories={categories}
        initialProducts={products}
        initialPersistence={persistence}
        initialCatalogState={catalogState}
      />
    </AppShell>
  );
}
