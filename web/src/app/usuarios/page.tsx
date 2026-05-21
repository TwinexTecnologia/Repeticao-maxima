import { AppShell } from "@/components/app-shell";
import { loadCouponPartnerModuleData, type PartnerRole } from "@/lib/parceiros/repository";
import { UsuariosClient } from "./usuarios-client";

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

function normalizeRole(value: string): PartnerRole {
  return value.trim().toLowerCase() === "atleta" ? "atleta" : "influenciador";
}

export default async function UsuariosPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const moduleData = await loadCouponPartnerModuleData();
  const initialDraft = {
    name: "",
    couponCode: getSearchValue(resolvedSearchParams, "couponCode").trim().toUpperCase(),
    role: normalizeRole(getSearchValue(resolvedSearchParams, "role")),
    active: true,
    notes: "",
  };

  return (
    <AppShell
      title="Usuarios"
      subtitle="Cadastre os parceiros por cupom e defina quem entra como influenciador ou atleta dentro da operacao."
      currentPath="/usuarios"
    >
      <UsuariosClient
        initialProfiles={moduleData.profiles}
        initialKnownCoupons={moduleData.knownCoupons}
        initialPersistence={moduleData.persistence}
        initialDiscoveryState={moduleData.discoveryState}
        initialDraft={initialDraft}
      />
    </AppShell>
  );
}
