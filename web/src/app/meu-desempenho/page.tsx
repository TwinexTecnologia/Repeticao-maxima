import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import {
  ATHLETE_SUPPORT_MINIMUM_REDEMPTION,
  formatDateOnly,
  formatDateTime,
  formatMoney,
  getCurrentMonthInput,
  getGoalProgressPercent,
  getPartnerAvailableBalances,
  loadPartnerPerformanceSnapshot,
} from "@/lib/parceiros/performance";
import { loadPartnerCampaignSnapshots } from "@/lib/parceiros/campaigns";
import { loadPartnerCampaigns } from "@/lib/parceiros/campaigns-repository";
import {
  loadCouponPartnerProfiles,
  loadPartnerRedemptions,
  loadPartnerRewardRequests,
} from "@/lib/parceiros/repository";
import { loadAuthenticatedAppUser } from "@/lib/auth/access";
import { PartnerPerformanceClient } from "./partner-performance-client";

type MeuDesempenhoPageProps = {
  searchParams?: Promise<{
    tab?: string;
    month?: string;
    rangeStart?: string;
    rangeEnd?: string;
    campaignId?: string;
  }>;
};

export default async function MeuDesempenhoPage({
  searchParams,
}: MeuDesempenhoPageProps) {
  const user = await loadAuthenticatedAppUser();

  if (!user) {
    redirect("/login?next=/meu-desempenho");
  }

  if (!user.active || user.userType !== "parceiro" || !user.profileId || !user.linkedPartnerId) {
    redirect("/acesso-negado");
  }

  const params = searchParams ? await searchParams : undefined;
  const tab = normalizeTab(params?.tab);
  const selectedMonth = params?.month || getCurrentMonthInput();
  const customRangeStart = normalizeDateParam(params?.rangeStart);
  const customRangeEnd = normalizeDateParam(params?.rangeEnd);
  const selectedCampaignId = normalizeIdParam(params?.campaignId);
  const needsRedemptionData = tab === "inicio" || tab === "resgates";
  const needsRewardRequests = tab !== "campanhas";
  const [profilesData, campaignsData, rewardRequests, allRedemptions] = await Promise.all([
    loadCouponPartnerProfiles(),
    loadPartnerCampaigns(),
    needsRewardRequests
      ? loadPartnerRewardRequests({ userProfileId: user.profileId })
      : Promise.resolve([]),
    needsRedemptionData ? loadPartnerRedemptions() : Promise.resolve({ redemptions: [] }),
  ]);
  const profile = profilesData.profiles.find(
    (item) => item.id === user.linkedPartnerId && item.active,
  );

  if (!profile) {
    return (
      <AppShell
        title="Meu desempenho"
        subtitle="Seu acesso ainda nao esta vinculado a um cupom ativo."
        currentPath="/meu-desempenho"
      >
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Cupom nao encontrado</div>
            <p className={styles.warningText}>
              Fale com o admin para vincular seu login ao cupom correto antes de acompanhar as vendas.
            </p>
          </div>
        </section>
      </AppShell>
    );
  }

  const partnerCampaigns = campaignsData.campaigns.filter(
    (campaign) =>
      campaign.active &&
      campaign.participants.some((participant) => participant.partnerId === profile.id),
  );
  const selectedCampaign =
    partnerCampaigns.find((campaign) => campaign.id === selectedCampaignId) || null;
  const windowCampaign =
    partnerCampaigns
      .filter((campaign) => campaign.useCurrentWindow)
      .slice()
      .sort((left, right) => (right.endDate || "").localeCompare(left.endDate || ""))[0] || null;
  const effectiveMonth = windowCampaign?.endDate ? windowCampaign.endDate.slice(0, 7) : selectedMonth;
  const needsPerformance = tab !== "campanhas";
  const performance = needsPerformance
    ? await loadPartnerPerformanceSnapshot(profile, effectiveMonth, {
        window: windowCampaign
          ? {
              startDate: windowCampaign.startDate,
              endDate: windowCampaign.endDate,
              label: `${formatDateOnly(windowCampaign.startDate)} a ${formatDateOnly(windowCampaign.endDate)}`,
            }
          : undefined,
        monthlyGoal: windowCampaign?.qualificationGoal,
      })
    : null;
  const summaryFilter = buildSummaryFilter({
    campaign: selectedCampaign,
    rangeStart: customRangeStart,
    rangeEnd: customRangeEnd,
  });
  const summaryPerformance =
    needsPerformance && summaryFilter.window
      ? await loadPartnerPerformanceSnapshot(
          profile,
          summaryFilter.window.endDate.slice(0, 7) || effectiveMonth,
          {
            window: summaryFilter.window,
          },
        )
      : null;

  const redemptions = needsRedemptionData
    ? allRedemptions.redemptions.filter(
        (item) =>
          item.partnerId === user.linkedPartnerId || item.couponCode === profile.couponCode,
      )
    : [];
  const needsCampaignSnapshots = tab === "inicio" || tab === "campanhas";
  const campaignSnapshots = needsCampaignSnapshots
    ? await loadPartnerCampaignSnapshots(partnerCampaigns)
    : [];
  const greetingRole = profile.role === "atleta" ? "atleta" : "influenciador";
  const featuredCampaign =
    campaignSnapshots
      .slice()
      .sort((left, right) => (right.endDate || "").localeCompare(left.endDate || ""))[0] || null;
  const featuredEntry =
    featuredCampaign?.leaderboard.find((item) => item.partnerId === profile.id) || null;

  if (!performance) {
    return (
      <AppShell
        title={`Ola, ${greetingRole}`}
        subtitle={`${profile.name}, veja as campanhas ativas para voce.`}
        currentPath="/meu-desempenho?tab=campanhas"
      >
        {campaignSnapshots.length > 0 ? (
          <>
            <section className={`${styles.section} ${styles.mobileOnly}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>Campanhas</div>
                  <p className={styles.sectionSubtitle}>Corridas e metas extras ativas.</p>
                </div>
              </div>
              <div className={styles.mobileList}>
                {campaignSnapshots.map((campaign) => {
                  const myEntry =
                    campaign.leaderboard.find((item) => item.partnerId === profile.id) || null;

                  return (
                    <details key={campaign.campaignId} className={styles.mobileListItem}>
                      <summary className={styles.mobileListSummary}>
                        <div className={styles.mobileListTitleRow}>
                          <div className={styles.mobileListTitle}>{campaign.name}</div>
                          <span className={`${styles.pill} ${styles.pillMedium}`}>
                            {!campaign.showRanking
                              ? "Sem ranking"
                              : campaign.rankingLocked
                                ? "Ranking parcial"
                                : "Ranking"}
                          </span>
                        </div>
                        <div className={styles.mobileListMeta}>
                          <span>Meta {formatMoney(campaign.qualificationGoal)}</span>
                          <span>Bonus {formatMoney(campaign.bonusAmount)} PIX</span>
                          <span>
                            {campaign.daysRemaining > 0
                              ? `${campaign.daysRemaining} dias`
                              : "Encerrando hoje"}
                          </span>
                        </div>
                        <div className={styles.mobileListMeta}>
                          {campaign.showRanking ? (
                            <span>
                              Sua posicao{" "}
                              {myEntry
                                ? `${campaign.rankingLocked ? myEntry.displayRank : myEntry.actualRank}º`
                                : "-"}
                            </span>
                          ) : null}
                          <span>Faltam {formatMoney(myEntry?.remainingToGoal || 0)}</span>
                        </div>
                      </summary>

                      <div className={styles.metaList} style={{ marginTop: 12 }}>
                        <div className={styles.metaItem}>
                          <strong>Periodo</strong>
                          <span>
                            {formatDateOnly(campaign.startDate)} ate {formatDateOnly(campaign.endDate)}
                          </span>
                        </div>
                        {campaign.description ? (
                          <div className={styles.metaItem}>
                            <strong>Descricao</strong>
                            <span>{campaign.description}</span>
                          </div>
                        ) : null}
                      </div>
                      {campaign.importantMessage ? (
                        <div className={styles.callout} style={{ marginTop: 12 }}>
                          <h3>Importante</h3>
                          <p>{campaign.importantMessage}</p>
                        </div>
                      ) : null}
                    </details>
                  );
                })}
              </div>
            </section>

            <section className={`${styles.section} ${styles.desktopOnly}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>Campanhas ativas</div>
                  <p className={styles.sectionSubtitle}>
                    Essas campanhas sao extras e separadas da sua meta normal de 3 meses.
                  </p>
                </div>
              </div>
              <div className={styles.catalogGrid}>
                {campaignSnapshots.map((campaign) => {
                  const myEntry =
                    campaign.leaderboard.find((item) => item.partnerId === profile.id) || null;

                  return (
                    <article key={campaign.campaignId} className={styles.catalogCard}>
                      <div className={styles.listTitleRow}>
                        <div className={styles.sectionTitle}>{campaign.name}</div>
                        <span className={`${styles.pill} ${styles.pillMedium}`}>
                          {!campaign.showRanking
                            ? "Sem ranking"
                            : campaign.rankingLocked
                              ? "Ranking parcial"
                              : "Ranking liberado"}
                        </span>
                      </div>
                      <p className={styles.sectionSubtitle}>
                        {campaign.description || "Campanha extra com bonus separado do contrato."}
                      </p>
                      <div className={styles.metaList}>
                        <div className={styles.metaItem}>
                          <strong>Periodo travado</strong>
                          <span>
                            {formatDateOnly(campaign.startDate)} ate {formatDateOnly(campaign.endDate)}
                          </span>
                        </div>
                        <div className={styles.metaItem}>
                          <strong>Meta para entrar</strong>
                          <span>{formatMoney(campaign.qualificationGoal)}</span>
                        </div>
                        <div className={styles.metaItem}>
                          <strong>Bonus extra</strong>
                          <span>{formatMoney(campaign.bonusAmount)} no Pix</span>
                        </div>
                        <div className={styles.metaItem}>
                          <strong>Prazo restante</strong>
                          <span>
                            {campaign.daysRemaining > 0
                              ? `${campaign.daysRemaining} dia(s)`
                              : "Encerrando hoje"}
                          </span>
                        </div>
                        {campaign.showRanking ? (
                          <div className={styles.metaItem}>
                            <strong>Sua posicao</strong>
                            <span>
                              {myEntry
                                ? `${campaign.rankingLocked ? myEntry.displayRank : myEntry.actualRank}º lugar`
                                : "-"}
                            </span>
                          </div>
                        ) : null}
                        <div className={styles.metaItem}>
                          <strong>Sua corrida</strong>
                          <span>
                            {myEntry?.qualified
                              ? "Voce ja entrou na disputa do bonus."
                              : `Faltam ${formatMoney(myEntry?.remainingToGoal || 0)} para entrar.`}
                          </span>
                        </div>
                      </div>
                      {campaign.importantMessage ? (
                        <div className={styles.callout} style={{ marginTop: 16 }}>
                          <h3>Importante</h3>
                          <p>{campaign.importantMessage}</p>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        ) : (
          <section className={styles.section}>
            <div className={styles.warningPanel}>
              <div className={styles.warningTitle}>Sem campanhas</div>
              <p className={styles.warningText}>Nenhuma campanha ativa para voce agora.</p>
            </div>
          </section>
        )}
      </AppShell>
    );
  }

  if (!performance.ok) {
    return (
      <AppShell
        title="Meu desempenho"
        subtitle="Nao foi possivel carregar seus dados agora."
        currentPath="/meu-desempenho"
      >
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Erro ao carregar</div>
            <p className={styles.warningText}>{performance.message}</p>
          </div>
        </section>
      </AppShell>
    );
  }

  const balances = getPartnerAvailableBalances(
    performance.data.row,
    performance.data.rollingWindow,
    rewardRequests,
  );
  const windowDaysRemaining = getDaysRemaining(performance.data.rollingWindow.endDate);
  const windowProgressPercent = getGoalProgressPercent(
    performance.data.row.netRevenue,
    performance.data.row.monthlyGoal,
  );
  const summaryOrders =
    summaryPerformance && summaryPerformance.ok
      ? summaryPerformance.data.row.orders
      : performance.data.row.lifetimeOrders;
  const summaryRevenue =
    summaryPerformance && summaryPerformance.ok
      ? summaryPerformance.data.row.netRevenue
      : performance.data.row.lifetimeNetRevenue;
  const summaryLabel =
    summaryPerformance && summaryPerformance.ok
      ? summaryPerformance.data.rollingWindow.label
      : "Historico completo";
  const summaryCampaignLabel = selectedCampaign ? selectedCampaign.name : "Todas as campanhas";
  const summaryMessage =
    summaryFilter.message ||
    (summaryPerformance && !summaryPerformance.ok ? summaryPerformance.message : null);

  return (
    <AppShell
      title={`Ola, ${greetingRole}`}
      subtitle={`${profile.name}, segue seu desempenho na janela de ${performance.data.rollingWindow.label}.`}
      currentPath={tab === "inicio" ? "/meu-desempenho" : `/meu-desempenho?tab=${tab}`}
    >
      {tab === "inicio" ? (
        <>
          <section className={`${styles.section} ${styles.mobileOnly}`}>
            {featuredCampaign ? (
              <article className={styles.heroCard}>
                <div className={styles.listTitleRow}>
                  <div>
                    <div className={styles.sectionTitle}>🏆 {featuredCampaign.name}</div>
                    <div className={styles.sectionSubtitle}>
                      {formatDateOnly(featuredCampaign.startDate)} ate {formatDateOnly(featuredCampaign.endDate)}
                    </div>
                    {featuredCampaign.description ? (
                      <div className={styles.sectionSubtitle} style={{ marginTop: 8 }}>
                        {featuredCampaign.description}
                      </div>
                    ) : null}
                  </div>
                  <span className={`${styles.pill} ${styles.pillMedium}`}>
                    {!featuredCampaign.showRanking
                      ? "Sem ranking"
                      : featuredCampaign.rankingLocked
                        ? "Ranking parcial"
                        : "Ranking"}
                  </span>
                </div>
                <div className={styles.metaList} style={{ marginTop: 14 }}>
                  <div className={styles.metaItem}>
                    <strong>Meta</strong>
                    <span>{formatMoney(featuredCampaign.qualificationGoal)}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <strong>Bonus</strong>
                    <span>{formatMoney(featuredCampaign.bonusAmount)} PIX</span>
                  </div>
                  {featuredCampaign.showRanking ? (
                    <div className={styles.metaItem}>
                      <strong>Sua posicao</strong>
                      <span>
                        {featuredEntry
                          ? `${featuredCampaign.rankingLocked ? featuredEntry.displayRank : featuredEntry.actualRank}º lugar`
                          : "-"}
                      </span>
                    </div>
                  ) : null}
                  <div className={styles.metaItem}>
                    <strong>Faltam</strong>
                    <span>{formatMoney(featuredEntry?.remainingToGoal || 0)}</span>
                  </div>
                </div>
                <div className={styles.filterActions} style={{ marginTop: 14 }}>
                  <a href="/meu-desempenho?tab=campanhas" className={styles.primaryButton}>
                    Ver campanhas
                  </a>
                </div>
              </article>
            ) : null}

          </section>

          <section className={`${styles.section} ${styles.mobileOnly}`}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Resumo rapido</div>
              </div>
              <div>
                <input id="period-filter-sheet" type="checkbox" className={styles.sheetToggle} />
                <label htmlFor="period-filter-sheet" className={styles.sheetTrigger}>
                  Filtrar periodo
                </label>
                <label htmlFor="period-filter-sheet" className={styles.sheetOverlay} />
                <div className={styles.sheetPanel}>
                  <div className={styles.sheetHeader}>
                    <div className={styles.sheetTitle}>Filtrar periodo</div>
                    <label htmlFor="period-filter-sheet" className={styles.sheetClose}>
                      ✕
                    </label>
                  </div>
                  <form className={styles.filterGrid} method="get">
                    <input type="hidden" name="tab" value="inicio" />
                    <input type="hidden" name="month" value={performance.data.selectedMonth} />
                    <label className={styles.filterField}>
                      <span>Campanha</span>
                      <select name="campaignId" defaultValue={selectedCampaign?.id || ""}>
                        <option value="">Todas as campanhas</option>
                        {partnerCampaigns.map((campaign) => (
                          <option key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.filterField}>
                      <span>Inicio</span>
                      <input type="date" name="rangeStart" defaultValue={customRangeStart || ""} />
                    </label>
                    <label className={styles.filterField}>
                      <span>Fim</span>
                      <input type="date" name="rangeEnd" defaultValue={customRangeEnd || ""} />
                    </label>
                    <div className={styles.filterActions}>
                      <button type="submit" className={styles.primaryButton}>
                        Aplicar filtro
                      </button>
                    </div>
                  </form>
                  {summaryPerformance && summaryPerformance.ok ? (
                    <div className={styles.mobileCardsGrid} style={{ marginTop: 14 }}>
                      <div className={styles.mobileCard}>
                        <div className={styles.mobileCardLabel}>Vendas</div>
                        <div className={styles.mobileCardValue}>{summaryPerformance.data.row.orders}</div>
                        <div className={styles.mobileCardHint}>{summaryPerformance.data.rollingWindow.label}</div>
                      </div>
                      <div className={styles.mobileCard}>
                        <div className={styles.mobileCardLabel}>Valor vendido</div>
                        <div className={styles.mobileCardValue}>
                          {formatMoney(summaryPerformance.data.row.netRevenue)}
                        </div>
                        <div className={styles.mobileCardHint}>{summaryCampaignLabel}</div>
                      </div>
                    </div>
                  ) : summaryMessage ? (
                    <div className={styles.warningPanel} style={{ marginTop: 14 }}>
                      <div className={styles.warningTitle}>Nao foi possivel aplicar o filtro</div>
                      <p className={styles.warningText}>{summaryMessage}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={styles.mobileCardsGrid}>
              <div className={styles.mobileCard}>
                <div className={styles.mobileCardLabel}>Vendas</div>
                <div className={styles.mobileCardValue}>{summaryOrders}</div>
                <div className={styles.mobileCardHint}>{summaryLabel}</div>
              </div>
              <div className={styles.mobileCard}>
                <div className={styles.mobileCardLabel}>Valor vendido</div>
                <div className={styles.mobileCardValue}>{formatMoney(summaryRevenue)}</div>
                <div className={styles.mobileCardHint}>{summaryCampaignLabel}</div>
              </div>
              <div className={styles.mobileCard}>
                <div className={styles.mobileCardLabel}>Filtro ativo</div>
                <div className={styles.mobileCardValue}>{summaryCampaignLabel}</div>
                <div className={styles.mobileCardHint}>{summaryLabel}</div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <section className={`${styles.section} ${styles.desktopOnly}`}>
        <form className={styles.filterGrid} method="get">
          <input type="hidden" name="tab" value={tab} />
          <label className={styles.filterField}>
            <span>Mes final da janela</span>
            <input
              type="month"
              name="month"
              defaultValue={performance.data.selectedMonth}
              disabled={Boolean(windowCampaign)}
            />
          </label>
          {windowCampaign ? (
            <input type="hidden" name="month" value={performance.data.selectedMonth} />
          ) : null}
          <div className={styles.filterActions}>
            <button type="submit" className={styles.primaryButton}>
              Atualizar leitura
            </button>
          </div>
        </form>
        {windowCampaign ? (
          <div className={styles.callout} style={{ marginTop: 16 }}>
            <h3>Janela travada pela campanha</h3>
            <p>
              {windowCampaign.name}: {formatDateOnly(windowCampaign.startDate)} ate{" "}
              {formatDateOnly(windowCampaign.endDate)}.
            </p>
          </div>
        ) : null}
      </section>

      <section className={`${styles.section} ${styles.desktopOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Resumo geral</div>
            <p className={styles.sectionSubtitle}>
              Acompanhe seu historico total ou filtre por campanha e periodo.
            </p>
          </div>
        </div>

        <form className={styles.filterGrid} method="get">
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="month" value={performance.data.selectedMonth} />
          <label className={styles.filterField}>
            <span>Campanha</span>
            <select name="campaignId" defaultValue={selectedCampaign?.id || ""}>
              <option value="">Todas as campanhas</option>
              {partnerCampaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Inicio</span>
            <input type="date" name="rangeStart" defaultValue={customRangeStart || ""} />
          </label>
          <label className={styles.filterField}>
            <span>Fim</span>
            <input type="date" name="rangeEnd" defaultValue={customRangeEnd || ""} />
          </label>
          <div className={styles.filterActions}>
            <button type="submit" className={styles.secondaryButton}>
              Filtrar
            </button>
          </div>
        </form>

        {summaryMessage ? (
          <div className={styles.warningPanel} style={{ marginTop: 16 }}>
            <div className={styles.warningTitle}>Nao foi possivel aplicar o filtro</div>
            <p className={styles.warningText}>{summaryMessage}</p>
          </div>
        ) : null}

        <div className={styles.metricGrid} style={{ marginTop: 16 }}>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Vendas</div>
            <div className={styles.metricValue}>{summaryOrders}</div>
            <div className={styles.metricHint}>{summaryLabel}</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Valor vendido</div>
            <div className={styles.metricValue}>{formatMoney(summaryRevenue)}</div>
            <div className={styles.metricHint}>{summaryCampaignLabel}</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Campanha</div>
            <div className={styles.metricValue}>{summaryCampaignLabel}</div>
            <div className={styles.metricHint}>
              {selectedCampaign ? "Filtro por campanha aplicado" : "Leitura geral do cupom"}
            </div>
          </article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.desktopOnly}`}>
        <div className={styles.metricGrid}>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Vendas na janela</div>
            <div className={styles.metricValue}>{performance.data.row.orders}</div>
            <div className={styles.metricHint}>Pedidos com seu cupom no periodo</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Receita liquida</div>
            <div className={styles.metricValue}>{formatMoney(performance.data.row.netRevenue)}</div>
            <div className={styles.metricHint}>Base usada para liberar roupa</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Meta da janela</div>
            <div className={styles.metricValue}>{formatMoney(performance.data.row.monthlyGoal)}</div>
            <div className={styles.metricHint}>
              Faltam {formatMoney(performance.data.row.monthlyAmountToGoal)} para liberar
            </div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Janela atual acaba em</div>
            <div className={styles.metricValue}>
              {formatDateOnly(performance.data.rollingWindow.endDate)}
            </div>
            <div className={styles.metricHint}>
              Esse e o prazo final da sua meta normal de 3 meses.
            </div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Saldo em roupa</div>
            <div className={styles.metricValue}>{formatMoney(balances.clothesAvailable)}</div>
            <div className={styles.metricHint}>Ja descontando solicitacoes pendentes e aprovadas</div>
          </article>
          {profile.role === "atleta" ? (
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Saldo de apoio</div>
              <div className={styles.metricValue}>{formatMoney(balances.supportAvailable)}</div>
              <div className={styles.metricHint}>
                Minimo de {formatMoney(ATHLETE_SUPPORT_MINIMUM_REDEMPTION)} para solicitar
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className={`${styles.section} ${styles.desktopOnly}`}>
        <div className={styles.definitionGrid}>
          <article className={styles.definitionCard}>
            <div className={styles.listTitle}>Corrida da janela</div>
            <p className={styles.listDetail}>
              Voce percorreu{" "}
              <strong>
                {getGoalProgressPercent(
                  performance.data.row.netRevenue,
                  performance.data.row.monthlyGoal,
                ).toFixed(0)}
                %
              </strong>{" "}
              da meta de {formatMoney(performance.data.row.monthlyGoal)}.
            </p>
          </article>
          <article className={styles.definitionCard}>
            <div className={styles.listTitle}>Roupa liberada</div>
            <p className={styles.listDetail}>
              Nesta janela, o sistema calculou {formatMoney(performance.data.row.monthlyUnlockedCredit)} em roupa.
            </p>
          </article>
          {profile.role === "atleta" ? (
            <article className={styles.definitionCard}>
              <div className={styles.listTitle}>Cashback de apoio</div>
              <p className={styles.listDetail}>
                Seu saldo acumulado para pintura, kit ou ajuda esportiva esta em{" "}
                {formatMoney(performance.data.row.cumulativeSupport)}.
              </p>
            </article>
          ) : null}
        </div>
      </section>

      {campaignSnapshots.length > 0 ? (
        <>
          {tab === "inicio" || tab === "campanhas" ? (
            <section className={`${styles.section} ${styles.mobileOnly}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>Campanhas</div>
                  <p className={styles.sectionSubtitle}>Corridas e metas extras ativas.</p>
                </div>
                {tab === "inicio" ? (
                  <a href="/meu-desempenho?tab=campanhas" className={styles.secondaryButton}>
                    Ver todas
                  </a>
                ) : null}
              </div>

              <div className={styles.mobileList}>
                {(tab === "inicio" ? campaignSnapshots.slice(0, 2) : campaignSnapshots).map(
                  (campaign) => {
                    const myEntry =
                      campaign.leaderboard.find((item) => item.partnerId === profile.id) || null;

                    return (
                      <details key={campaign.campaignId} className={styles.mobileListItem}>
                        <summary className={styles.mobileListSummary}>
                          <div className={styles.mobileListTitleRow}>
                            <div className={styles.mobileListTitle}>{campaign.name}</div>
                            <span className={`${styles.pill} ${styles.pillMedium}`}>
                              {!campaign.showRanking
                                ? "Sem ranking"
                                : campaign.rankingLocked
                                  ? "Ranking parcial"
                                  : "Ranking"}
                            </span>
                          </div>
                          <div className={styles.mobileListMeta}>
                            <span>Meta {formatMoney(campaign.qualificationGoal)}</span>
                            <span>Bonus {formatMoney(campaign.bonusAmount)} PIX</span>
                            <span>
                              {campaign.daysRemaining > 0
                                ? `${campaign.daysRemaining} dias`
                                : "Encerrando hoje"}
                            </span>
                          </div>
                          <div className={styles.mobileListMeta}>
                            {campaign.showRanking ? (
                              <span>
                                Sua posicao{" "}
                                {myEntry
                                  ? `${campaign.rankingLocked ? myEntry.displayRank : myEntry.actualRank}º`
                                  : "-"}
                              </span>
                            ) : null}
                            <span>Faltam {formatMoney(myEntry?.remainingToGoal || 0)}</span>
                          </div>
                        </summary>

                        <div className={styles.metaList} style={{ marginTop: 12 }}>
                          <div className={styles.metaItem}>
                            <strong>Periodo</strong>
                            <span>
                              {formatDateOnly(campaign.startDate)} ate {formatDateOnly(campaign.endDate)}
                            </span>
                          </div>
                          {campaign.description ? (
                            <div className={styles.metaItem}>
                              <strong>Descricao</strong>
                              <span>{campaign.description}</span>
                            </div>
                          ) : null}
                        </div>
                        {campaign.importantMessage ? (
                          <div className={styles.callout} style={{ marginTop: 12 }}>
                            <h3>Importante</h3>
                            <p>{campaign.importantMessage}</p>
                          </div>
                        ) : null}
                      </details>
                    );
                  },
                )}

                {tab === "inicio" && campaignSnapshots.length > 2 ? (
                  <div className={styles.filterActions} style={{ marginTop: 12 }}>
                    <a href="/meu-desempenho?tab=campanhas" className={styles.primaryButton}>
                      Ver todas as campanhas
                    </a>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className={`${styles.section} ${styles.desktopOnly}`}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Campanhas ativas</div>
              <p className={styles.sectionSubtitle}>
                Essas campanhas sao extras e separadas da sua meta normal de 3 meses.
              </p>
            </div>
          </div>
          <div className={styles.catalogGrid}>
            {campaignSnapshots.map((campaign) => {
              const myEntry =
                campaign.leaderboard.find((item) => item.partnerId === profile.id) || null;

              return (
                <article key={campaign.campaignId} className={styles.catalogCard}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.sectionTitle}>{campaign.name}</div>
                    <span className={`${styles.pill} ${styles.pillMedium}`}>
                      {!campaign.showRanking
                        ? "Sem ranking"
                        : campaign.rankingLocked
                          ? "Ranking parcial"
                          : "Ranking liberado"}
                    </span>
                  </div>
                  <p className={styles.sectionSubtitle}>
                    {campaign.description || "Campanha extra com bonus separado do contrato."}
                  </p>
                  <div className={styles.metaList}>
                    <div className={styles.metaItem}>
                      <strong>
                        {campaign.useCurrentWindow ? "Janela atual (do painel)" : "Periodo travado"}
                      </strong>
                      <span>
                        {formatDateOnly(campaign.startDate)} ate {formatDateOnly(campaign.endDate)}
                      </span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Meta para entrar</strong>
                      <span>{formatMoney(campaign.qualificationGoal)}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Bonus extra</strong>
                      <span>{formatMoney(campaign.bonusAmount)} no Pix</span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Prazo restante</strong>
                      <span>
                        {campaign.daysRemaining > 0
                          ? `${campaign.daysRemaining} dia(s)`
                          : "Encerrando hoje"}
                      </span>
                    </div>
                    {campaign.showRanking ? (
                      <div className={styles.metaItem}>
                        <strong>Sua posicao</strong>
                        <span>
                          {myEntry
                            ? `${campaign.rankingLocked ? myEntry.displayRank : myEntry.actualRank}º lugar`
                            : "-"}
                        </span>
                      </div>
                    ) : null}
                    <div className={styles.metaItem}>
                      <strong>Sua corrida</strong>
                      <span>
                        {myEntry?.qualified
                          ? "Voce ja entrou na disputa do bonus."
                          : `Faltam ${formatMoney(myEntry?.remainingToGoal || 0)} para entrar.`}
                      </span>
                    </div>
                  </div>
                  {campaign.importantMessage ? (
                    <div className={styles.callout} style={{ marginTop: 16 }}>
                      <h3>Importante</h3>
                      <p>{campaign.importantMessage}</p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
        </>
      ) : null}

      {tab === "inicio" || tab === "resgates" ? (
        <PartnerPerformanceClient
          selectedMonth={performance.data.selectedMonth}
          canRequestClothes={balances.canRequestClothes}
          canRequestSupport={balances.canRequestSupport}
          clothesAvailable={formatMoney(balances.clothesAvailable)}
          supportAvailable={formatMoney(balances.supportAvailable)}
          partnerRole={profile.role}
        />
      ) : null}

      {tab === "inicio" || tab === "pedidos" ? (
        <section className={`${styles.section} ${styles.mobileOnly}`}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>
                {tab === "pedidos" ? "Extrato de vendas" : "Ultimos pedidos"}
              </div>
              <p className={styles.sectionSubtitle}>
                {tab === "pedidos"
                  ? "Historico completo dos pedidos com seu cupom."
                  : "Vendas recentes com seu cupom na janela."}
              </p>
            </div>

            {tab === "inicio" ? (
              <a href="/meu-desempenho?tab=pedidos" className={styles.secondaryButton}>
                Ver todos
              </a>
            ) : (
              <div>
                <input id="orders-filter-sheet" type="checkbox" className={styles.sheetToggle} />
                <label htmlFor="orders-filter-sheet" className={styles.sheetTrigger}>
                  Filtrar periodo
                </label>
                <label htmlFor="orders-filter-sheet" className={styles.sheetOverlay} />
                <div className={styles.sheetPanel}>
                  <div className={styles.sheetHeader}>
                    <div className={styles.sheetTitle}>Filtrar periodo</div>
                    <label htmlFor="orders-filter-sheet" className={styles.sheetClose}>
                      ✕
                    </label>
                  </div>
                  <form className={styles.filterGrid} method="get">
                    <input type="hidden" name="tab" value="pedidos" />
                    <input type="hidden" name="month" value={performance.data.selectedMonth} />
                    <label className={styles.filterField}>
                      <span>Inicio</span>
                      <input type="date" name="rangeStart" defaultValue={customRangeStart || ""} />
                    </label>
                    <label className={styles.filterField}>
                      <span>Fim</span>
                      <input type="date" name="rangeEnd" defaultValue={customRangeEnd || ""} />
                    </label>
                    <div className={styles.filterActions}>
                      <button type="submit" className={styles.primaryButton}>
                        Aplicar filtro
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>

          <div className={styles.mobileList}>
            {performance.data.orders.length > 0 ? (
              (tab === "inicio" ? performance.data.orders.slice(0, 3) : performance.data.orders).map(
                (order) => (
                  <details key={order.id} className={styles.mobileListItem}>
                    <summary className={styles.mobileListSummary}>
                      <div className={styles.mobileListTitleRow}>
                        <div className={styles.mobileListTitle}>Pedido #{order.number}</div>
                        <span className={`${styles.pill} ${styles.pillMedium}`}>{order.status}</span>
                      </div>
                      <div className={styles.mobileListMeta}>
                        <span>{order.createdAt ? formatDateTime(order.createdAt) : "-"}</span>
                        <span>{formatMoney(order.netRevenue)} liquidos</span>
                        <span>{order.products.length} produtos</span>
                      </div>
                    </summary>
                    <div className={styles.metaList} style={{ marginTop: 12 }}>
                      <div className={styles.metaItem}>
                        <strong>Total</strong>
                        <span>{formatMoney(order.total)}</span>
                      </div>
                      <div className={styles.metaItem}>
                        <strong>Canal</strong>
                        <span>{order.channel || "-"}</span>
                      </div>
                      <div className={styles.metaItem}>
                        <strong>Status pagamento</strong>
                        <span>{order.paymentStatus || "-"}</span>
                      </div>
                    </div>
                    <div className={styles.callout} style={{ marginTop: 12 }}>
                      <h3>Itens</h3>
                      <p>{order.products.join(", ") || "-"}</p>
                    </div>
                  </details>
                ),
              )
            ) : (
              <div className={styles.warningPanel}>
                <div className={styles.warningTitle}>Sem vendas</div>
                <p className={styles.warningText}>Nenhuma venda com seu cupom nessa janela.</p>
              </div>
            )}

            {tab === "inicio" && performance.data.orders.length > 3 ? (
              <div className={styles.filterActions} style={{ marginTop: 12 }}>
                <a href="/meu-desempenho?tab=pedidos" className={styles.primaryButton}>
                  Ver historico completo
                </a>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className={`${styles.section} ${styles.desktopOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Extrato de vendas</div>
            <p className={styles.sectionSubtitle}>
              Historico dos pedidos com seu cupom dentro da janela selecionada.
            </p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Data</th>
                <th>Status</th>
                <th>Total</th>
                <th>Liquido</th>
                <th>Produtos</th>
              </tr>
            </thead>
            <tbody>
              {performance.data.orders.length > 0 ? (
                performance.data.orders.map((order) => (
                  <tr key={order.id}>
                    <td>#{order.number}</td>
                    <td>{formatDateTime(order.createdAt)}</td>
                    <td>{order.status}</td>
                    <td>{formatMoney(order.total)}</td>
                    <td>{formatMoney(order.netRevenue)}</td>
                    <td>{order.products.join(", ") || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>Nenhuma venda com seu cupom nessa janela.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {tab === "inicio" ? (
        <section className={`${styles.section} ${styles.mobileOnly}`}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Resgates</div>
              <p className={styles.sectionSubtitle}>Saldo e historico em uma tela.</p>
            </div>
            <a href="/meu-desempenho?tab=resgates" className={styles.secondaryButton}>
              Abrir
            </a>
          </div>

          <div className={styles.mobileCardsGrid}>
            <div className={styles.mobileCard}>
              <div className={styles.mobileCardLabel}>Minhas solicitacoes</div>
              <div className={styles.mobileCardValue}>{rewardRequests.length}</div>
              <div className={styles.mobileCardHint}>Pedidos enviados para o admin</div>
            </div>
            <div className={styles.mobileCard}>
              <div className={styles.mobileCardLabel}>Resgates entregues</div>
              <div className={styles.mobileCardValue}>{redemptions.length}</div>
              <div className={styles.mobileCardHint}>Itens ja registrados no seu nome</div>
            </div>
          </div>
        </section>
      ) : tab === "resgates" ? (
        <>
          <section className={`${styles.section} ${styles.mobileOnly}`}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Minhas solicitacoes</div>
                <p className={styles.sectionSubtitle}>Acompanhe o que voce ja pediu.</p>
              </div>
            </div>

            <div className={styles.mobileList}>
              {rewardRequests.length > 0 ? (
                rewardRequests.map((request) => (
                  <div key={request.id} className={styles.mobileListItem}>
                    <div className={styles.mobileListTitleRow}>
                      <div className={styles.mobileListTitle}>
                        {request.requestType === "apoio" ? "Apoio" : "Roupa"}
                      </div>
                      <span className={`${styles.pill} ${styles.pillMedium}`}>
                        {labelForRequestStatus(request.status)}
                      </span>
                    </div>
                    <div className={styles.mobileListMeta}>
                      <span>{formatMoney(request.requestedAmount)}</span>
                      <span>{request.supportGoal || "Cupom / roupa"}</span>
                      <span>{formatDateTime(request.requestedAt)}</span>
                    </div>
                    {request.adminMessage ? (
                      <div className={styles.callout} style={{ marginTop: 12 }}>
                        <h3>Mensagem</h3>
                        <p>{request.adminMessage}</p>
                      </div>
                    ) : null}
                    {request.couponCode ? (
                      <div className={styles.callout} style={{ marginTop: 12 }}>
                        <h3>Cupom</h3>
                        <p>{request.couponCode}</p>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className={styles.warningPanel}>
                  <div className={styles.warningTitle}>Sem solicitacoes</div>
                  <p className={styles.warningText}>Nenhuma solicitacao feita ainda.</p>
                </div>
              )}
            </div>
          </section>

          <section className={`${styles.section} ${styles.mobileOnly}`}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Resgates entregues</div>
                <p className={styles.sectionSubtitle}>O que ja foi registrado no seu nome.</p>
              </div>
            </div>

            <div className={styles.mobileList}>
              {redemptions.length > 0 ? (
                redemptions.map((redemption) => (
                  <div key={redemption.id} className={styles.mobileListItem}>
                    <div className={styles.mobileListTitleRow}>
                      <div className={styles.mobileListTitle}>
                        {`${redemption.sku} ${redemption.color} ${redemption.size}`}
                      </div>
                      <span className={`${styles.pill} ${styles.pillMedium}`}>{redemption.status}</span>
                    </div>
                    <div className={styles.mobileListMeta}>
                      <span>{redemption.grantedAt}</span>
                      <span>{redemption.quantity} un</span>
                      <span>{formatMoney(redemption.totalCost)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.warningPanel}>
                  <div className={styles.warningTitle}>Sem resgates</div>
                  <p className={styles.warningText}>Nenhum resgate entregue ainda.</p>
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}

      <section className={`${styles.section} ${styles.desktopOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Minhas solicitacoes</div>
            <p className={styles.sectionSubtitle}>
              Tudo o que voce ja pediu para o admin gerar em roupa ou apoio.
            </p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Destino</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Cupom</th>
                <th>Mensagem</th>
                <th>Solicitado em</th>
              </tr>
            </thead>
            <tbody>
              {rewardRequests.length > 0 ? (
                rewardRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.requestType === "apoio" ? "Apoio" : "Roupa"}</td>
                    <td>{request.supportGoal || "Cupom / roupa"}</td>
                    <td>{formatMoney(request.requestedAmount)}</td>
                    <td>{labelForRequestStatus(request.status)}</td>
                    <td>{request.couponCode || "-"}</td>
                    <td>{request.adminMessage || "-"}</td>
                    <td>{formatDateTime(request.requestedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>Nenhuma solicitacao feita ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${styles.section} ${styles.desktopOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Resgates ja entregues</div>
            <p className={styles.sectionSubtitle}>
              Historico do que ja foi entregue ou registrado no seu nome.
            </p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Item</th>
                <th>Qtd</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.length > 0 ? (
                redemptions.map((redemption) => (
                  <tr key={redemption.id}>
                    <td>{redemption.grantedAt}</td>
                    <td>{`${redemption.sku} ${redemption.color} ${redemption.size}`}</td>
                    <td>{redemption.quantity}</td>
                    <td>{formatMoney(redemption.totalCost)}</td>
                    <td>{redemption.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>Nenhum resgate entregue ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function normalizeDateParam(value: unknown) {
  const text = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  return text;
}

function normalizeIdParam(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeTab(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "inicio" ||
    normalized === "campanhas" ||
    normalized === "pedidos" ||
    normalized === "resgates"
  ) {
    return normalized as "inicio" | "campanhas" | "pedidos" | "resgates";
  }

  return "inicio" as const;
}

function buildSummaryFilter(input: {
  campaign: { name: string; startDate: string; endDate: string } | null;
  rangeStart: string | null;
  rangeEnd: string | null;
}) {
  const hasCampaign = Boolean(input.campaign);
  const startDate =
    hasCampaign && input.rangeStart
      ? (input.rangeStart > input.campaign!.startDate ? input.rangeStart : input.campaign!.startDate)
      : (input.rangeStart ?? input.campaign?.startDate ?? null);
  const endDate =
    hasCampaign && input.rangeEnd
      ? (input.rangeEnd < input.campaign!.endDate ? input.rangeEnd : input.campaign!.endDate)
      : (input.rangeEnd ?? input.campaign?.endDate ?? null);

  if ((startDate && !endDate) || (!startDate && endDate)) {
    return {
      window: null,
      message: "Preencha inicio e fim do periodo para aplicar o filtro.",
    };
  }

  if (!startDate || !endDate) {
    return {
      window: null,
      message: null,
    };
  }

  if (startDate > endDate) {
    return {
      window: null,
      message: "O inicio do periodo nao pode ser maior que o fim.",
    };
  }

  return {
    window: {
      startDate,
      endDate,
      label: input.campaign
        ? `${input.campaign.name} · ${formatDateOnly(startDate)} a ${formatDateOnly(endDate)}`
        : `${formatDateOnly(startDate)} a ${formatDateOnly(endDate)}`,
    },
    message: null,
  };
}

function getDaysRemaining(endDate: string) {
  const today = new Date();
  const end = new Date(`${endDate}T23:59:59`);
  const diff = end.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function labelForRequestStatus(value: "pendente" | "aprovado" | "pago" | "recusado") {
  switch (value) {
    case "aprovado":
      return "Cupom liberado";
    case "pago":
      return "Pago";
    case "recusado":
      return "Recusado";
    default:
      return "Pendente";
  }
}
