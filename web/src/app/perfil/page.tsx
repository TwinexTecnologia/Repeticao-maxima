import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { PerfilClient } from "./perfil-client";

export default async function PerfilPage() {
  return (
    <AppShell
      title="Perfil"
      subtitle="Veja seus dados, envie uma foto e troque sua senha."
      currentPath="/perfil"
    >
      <section className={styles.section}>
        <PerfilClient />
      </section>
    </AppShell>
  );
}
