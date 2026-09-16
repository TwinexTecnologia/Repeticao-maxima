import { AppShell } from "@/components/app-shell";
import { PartnerContentManager } from "@/components/partner-content-manager";
import styles from "@/components/panel.module.css";
import { loadPartnerContentAdminData } from "@/lib/parceiros/content-repository";

export default async function InfluenciadoresCentralConteudoPage() {
  const contentData = await loadPartnerContentAdminData();

  return (
    <AppShell
      title="Central de Conteudo"
      subtitle="Organize campanhas, produtos, identidade da marca, templates e ideias para atletas e influenciadores."
      currentPath="/influenciadores/central-conteudo"
    >
      {!contentData.persistence.enabled ? (
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Persistencia indisponivel</div>
            <p className={styles.warningText}>{contentData.persistence.message}</p>
          </div>
        </section>
      ) : null}

      <PartnerContentManager initialData={contentData} />
    </AppShell>
  );
}
