import { AppShell } from "@/components/app-shell";
import { UsuariosClient } from "./usuarios-client";
import { loadUserAccessModuleData } from "@/lib/usuarios/repository";
import { loadPartnerRewardRequests } from "@/lib/parceiros/repository";

export default async function UsuariosPage() {
  const [{ employees, partners, partnerOptions, persistence }, pendingRequests] =
    await Promise.all([
      loadUserAccessModuleData(),
      loadPartnerRewardRequests({ statuses: ["pendente"] }),
    ]);

  return (
    <AppShell
      title="Usuarios"
      subtitle="Cadastre funcionarios com login e menus liberados, e organize os parceiros com os dados pessoais que fazem sentido para a operacao."
      currentPath="/usuarios"
    >
      <UsuariosClient
        initialEmployees={employees}
        initialPartners={partners}
        initialPartnerOptions={partnerOptions}
        initialPersistence={persistence}
        initialPendingRequests={pendingRequests}
      />
    </AppShell>
  );
}
