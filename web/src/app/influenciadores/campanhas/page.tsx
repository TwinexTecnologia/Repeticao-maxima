import { AppShell } from "@/components/app-shell";
import { PartnerCampaignManager } from "@/components/partner-campaign-manager";
import styles from "@/components/panel.module.css";
import { getNuvemshopCredentials } from "@/lib/nuvemshop/client";
import { loadPartnerCampaignSnapshots } from "@/lib/parceiros/campaigns";
import { loadPartnerCampaigns } from "@/lib/parceiros/campaigns-repository";
import { loadCouponPartnerProfiles } from "@/lib/parceiros/repository";

export default async function InfluenciadoresCampanhasPage() {
  const credentials = getNuvemshopCredentials();
  const [profilesData, campaignsData] = await Promise.all([
    loadCouponPartnerProfiles(),
    loadPartnerCampaigns(),
  ]);
  const snapshots = credentials.ok
    ? await loadPartnerCampaignSnapshots(campaignsData.campaigns)
    : [];

  return (
    <AppShell
      title="Campanhas"
      subtitle="Crie campanhas e acompanhe o ranking conforme o periodo e a meta definidos."
      currentPath="/influenciadores/campanhas"
    >
      {!credentials.ok ? (
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Credenciais pendentes</div>
            <p className={styles.warningText}>
              Falta preencher no `.env.local`: {credentials.missing.join(", ")}.
            </p>
          </div>
        </section>
      ) : null}

      <PartnerCampaignManager
        initialProfiles={profilesData.profiles}
        initialCampaigns={campaignsData.campaigns}
        initialSnapshots={snapshots}
        initialPersistence={campaignsData.persistence}
      />
    </AppShell>
  );
}
