import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import {
  ATHLETE_SUPPORT_MINIMUM_REDEMPTION,
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
    month?: string;
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
  const selectedMonth = params?.month || getCurrentMonthInput();
  const [profilesData, allRedemptions, rewardRequests, campaignsData] = await Promise.all([
    loadCouponPartnerProfiles(),
    loadPartnerRedemptions(),
    loadPartnerRewardRequests({ userProfileId: user.profileId }),
    loadPartnerCampaigns(),
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

  const performance = await loadPartnerPerformanceSnapshot(profile, selectedMonth);

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
  const redemptions = allRedemptions.redemptions.filter(
    (item) =>
      item.partnerId === user.linkedPartnerId || item.couponCode === profile.couponCode,
  );
  const partnerCampaigns = campaignsData.campaigns.filter(
    (campaign) =>
      campaign.active &&
      campaign.participants.some((participant) => participant.partnerId === profile.id),
  );
  const campaignSnapshots = await loadPartnerCampaignSnapshots(
    partnerCampaigns,
    performance.data.rollingWindow,
  );
  const greetingRole = profile.role === "atleta" ? "atleta" : "influenciador";

  return (
    <AppShell
      title={`Ola, ${greetingRole}`}
      subtitle={`${profile.name}, segue seu desempenho na janela de ${performance.data.rollingWindow.label}.`}
      currentPath="/meu-desempenho"
    >
      <section className={styles.section}>
        <form className={styles.filterGrid} method="get">
          <label className={styles.filterField}>
            <span>Mes final da janela</span>
            <input type="month" name="month" defaultValue={performance.data.selectedMonth} />
          </label>
          <div className={styles.filterActions}>
            <button type="submit" className={styles.primaryButton}>
              Atualizar leitura
            </button>
          </div>
        </form>
      </section>

      <section className={styles.section}>
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

      <section className={styles.section}>
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
        <section className={styles.section}>
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
                      {campaign.rankingLocked ? "Ranking parcial" : "Ranking liberado"}
                    </span>
                  </div>
                  <p className={styles.sectionSubtitle}>
                    {campaign.description || "Campanha extra com bonus separado do contrato."}
                  </p>
                  <div className={styles.metaList}>
                    <div className={styles.metaItem}>
                      <strong>{campaign.useCurrentWindow ? "Janela atual" : "Periodo"}</strong>
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
                    <div className={styles.metaItem}>
                      <strong>Sua posicao</strong>
                      <span>
                        {myEntry
                          ? `${campaign.rankingLocked ? myEntry.displayRank : myEntry.actualRank}º lugar`
                          : "-"}
                      </span>
                    </div>
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
      ) : null}

      <PartnerPerformanceClient
        selectedMonth={performance.data.selectedMonth}
        canRequestClothes={balances.canRequestClothes}
        canRequestSupport={balances.canRequestSupport}
        clothesAvailable={formatMoney(balances.clothesAvailable)}
        supportAvailable={formatMoney(balances.supportAvailable)}
        partnerRole={profile.role}
      />

      <section className={styles.section}>
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

      <section className={styles.section}>
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

      <section className={styles.section}>
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

function formatDateOnly(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}
