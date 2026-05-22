import { AppShell } from "@/components/app-shell";
import { UsuariosClient } from "./usuarios-client";
import { loadUserAccessModuleData } from "@/lib/usuarios/repository";

export default async function UsuariosPage() {
  const { employees, partners, partnerOptions, persistence } =
    await loadUserAccessModuleData();

  return (
    <AppShell
      title="Usuarios"
      subtitle="Cadastre funcionarios com login e menus liberados, e organize os parceiros com dados pessoais e recebimento."
      currentPath="/usuarios"
    >
      <UsuariosClient
        initialEmployees={employees}
        initialPartners={partners}
        initialPartnerOptions={partnerOptions}
        initialPersistence={persistence}
      />
    </AppShell>
  );
}
