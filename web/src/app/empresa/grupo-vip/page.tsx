import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { loadVipGroupStats } from "@/lib/vip-group/repository";

export const dynamic = "force-dynamic";

export default async function VipGroupMetricsPage() {
  const stats = await loadVipGroupStats();

  const metricCards = [
    {
      label: "Visitas totais",
      value: String(stats.totalViews),
      detail: "Quantidade de entradas registradas na landing.",
    },
    {
      label: "Cliques totais",
      value: String(stats.totalClicks),
      detail: "Toques no botao que levaram para o grupo VIP.",
    },
    {
      label: "CTR",
      value: formatPercent(stats.ctr),
      detail: "Relacao entre visitas da landing e cliques no grupo.",
    },
    {
      label: "Visitas hoje",
      value: String(stats.viewsToday),
      detail: "Leitura rapida do movimento mais recente.",
    },
    {
      label: "Cliques hoje",
      value: String(stats.clicksToday),
      detail: "Quantos acessos ao grupo sairam da landing hoje.",
    },
    {
      label: "Link configurado",
      value: stats.linkConfigured ? "Sim" : "Nao",
      detail: stats.linkConfigured
        ? "A landing ja pode mandar para o grupo VIP."
        : "Defina NEXT_PUBLIC_VIP_GROUP_URL para ativar o CTA real.",
    },
  ];

  return (
    <AppShell
      title="Grupo VIP"
      subtitle="Acompanhe visitas, cliques e campanhas da landing publica do grupo VIP."
      currentPath="/empresa/grupo-vip"
    >
      <section className={styles.section}>
        <div className={styles.metricGrid}>
          {metricCards.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              <div className={styles.metricHint}>{metric.detail}</div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <div className={styles.stack}>
            <div className={stats.enabled ? styles.callout : styles.warningPanel}>
              <h3>Status do rastreio</h3>
              <p>{stats.message}</p>
            </div>

            <div className={styles.callout}>
              <h3>Landing publica</h3>
              <p>
                Link da campanha: <strong>/grupo-vip</strong>
              </p>
            </div>
          </div>

          <div>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Campanhas recentes</div>
                <p className={styles.sectionSubtitle}>
                  UTM source e campaign agrupados para voce ver de onde o trafego esta vindo.
                </p>
              </div>
            </div>

            <div className={styles.list}>
              {stats.recentCampaigns.length > 0 ? (
                stats.recentCampaigns.map((campaign) => (
                  <article key={`${campaign.source}-${campaign.label}`} className={styles.listItem}>
                    <div className={styles.listTitleRow}>
                      <div className={styles.listTitle}>{campaign.label}</div>
                      <strong>{formatPercent(campaign.ctr)}</strong>
                    </div>
                    <p className={styles.listDetail}>
                      {campaign.source} · {campaign.views} visita(s) · {campaign.clicks} clique(s)
                    </p>
                  </article>
                ))
              ) : (
                <article className={styles.listItem}>
                  <div className={styles.listTitle}>Sem campanhas registradas ainda</div>
                  <p className={styles.listDetail}>
                    Assim que a landing receber trafego com UTM, os agrupamentos vao aparecer aqui.
                  </p>
                </article>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Eventos recentes</div>
            <p className={styles.sectionSubtitle}>
              Ultimas visitas e cliques capturados na landing do grupo VIP.
            </p>
          </div>
        </div>

        <div className={styles.list}>
          {stats.recentEvents.length > 0 ? (
            stats.recentEvents.map((event) => (
              <article key={event.id} className={styles.listItem}>
                <div className={styles.listTitleRow}>
                  <div className={styles.listTitle}>
                    {event.eventType === "click" ? "Clique no CTA" : "Visita na landing"}
                  </div>
                  <strong>{formatEventDate(event.createdAt)}</strong>
                </div>
                <p className={styles.listDetail}>
                  {[
                    event.utmSource || "Direto",
                    event.utmCampaign || "Sem campanha",
                    event.deviceType,
                    simplifyReferrer(event.referrerUrl),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </article>
            ))
          ) : (
            <article className={styles.listItem}>
              <div className={styles.listTitle}>Nenhum evento ainda</div>
              <p className={styles.listDetail}>
                A pagina comeca a preencher esta lista assim que as pessoas acessarem a landing.
              </p>
            </article>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatEventDate(value: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function simplifyReferrer(value: string) {
  if (!value) {
    return "Sem referrer";
  }

  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
