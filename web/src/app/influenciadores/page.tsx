import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { loadFinanceConfig } from "@/lib/financeiro/repository";
import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopOrder } from "@/lib/nuvemshop/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const RECENT_ORDERS_LIMIT = 20;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type InfluencerRow = {
  code: string;
  orders: number;
  revenue: number;
  netRevenue: number;
  averageTicket: number;
  lastOrderAt: string | null;
  channels: string[];
  currentTierLabel: string;
  unlockedCredit: number;
  nextGoalAmount: number | null;
  amountToNextGoal: number | null;
  nextTierLabel: string | null;
};

const INFLUENCER_TIERS = [
  {
    label: "Nivel 1",
    goal: 500,
    credit: 80,
  },
  {
    label: "Nivel 2",
    goal: 1000,
    credit: 180,
  },
  {
    label: "Nivel 3",
    goal: 2000,
    credit: 350,
  },
] as const;

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getCurrentMonthInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthRange(monthInput: string) {
  if (!/^\d{4}-\d{2}$/.test(monthInput)) {
    const current = getCurrentMonthInput();
    return getMonthRange(current);
  }

  const [yearText, monthText] = monthInput.split("-");
  const year = Number.parseInt(yearText || "", 10);
  const monthIndex = Number.parseInt(monthText || "", 10) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);

  return {
    startDate: `${yearText}-${monthText}-01`,
    endDate: `${yearText}-${monthText}-${String(end.getDate()).padStart(2, "0")}`,
    label: new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(start),
  };
}

function parseMoney(value?: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const amount = typeof value === "number" ? value : parseMoney(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getInfluencerTier(netRevenue: number) {
  const reachedTier =
    [...INFLUENCER_TIERS].reverse().find((tier) => netRevenue >= tier.goal) || null;
  const nextTier = INFLUENCER_TIERS.find((tier) => netRevenue < tier.goal) || null;

  return {
    reachedTier,
    nextTier,
    unlockedCredit: reachedTier?.credit ?? 0,
    amountToNextGoal: nextTier ? Math.max(nextTier.goal - netRevenue, 0) : null,
  };
}

function getNuvemFeeRule(order: NuvemshopOrder, financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"]) {
  const method = normalizeText(
    `${order.payment_details?.method || ""} ${order.gateway_name || ""} ${order.gateway || ""} ${order.payment_status || ""}`,
  );
  const installments = Math.max(order.payment_details?.installments || 1, 1);

  if (method.includes("pix")) {
    return {
      percent: financeConfig.nuvemPixPercent,
      fixed: financeConfig.nuvemPixFixed,
    };
  }

  if (installments >= 3) {
    return {
      percent: financeConfig.nuvemCard3Percent,
      fixed: financeConfig.nuvemCard3Fixed,
    };
  }

  if (installments === 2) {
    return {
      percent: financeConfig.nuvemCard2Percent,
      fixed: financeConfig.nuvemCard2Fixed,
    };
  }

  return {
    percent: financeConfig.nuvemCard1Percent,
    fixed: financeConfig.nuvemCard1Fixed,
  };
}

function getNetRevenue(order: NuvemshopOrder, financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"]) {
  const gross = parseMoney(order.total);
  const feeRule = getNuvemFeeRule(order, financeConfig);
  const feeCost = gross * (feeRule.percent / 100) + feeRule.fixed;
  return Math.max(gross - feeCost, 0);
}

function matchesDateRange(order: NuvemshopOrder, startDate: string, endDate: string) {
  if (!startDate && !endDate) {
    return true;
  }

  if (!order.created_at) {
    return false;
  }

  const createdAt = new Date(order.created_at);

  if (startDate) {
    const from = new Date(`${startDate}T00:00:00`);

    if (createdAt < from) {
      return false;
    }
  }

  if (endDate) {
    const to = new Date(`${endDate}T23:59:59`);

    if (createdAt > to) {
      return false;
    }
  }

  return true;
}

function getCouponCode(order: NuvemshopOrder) {
  return order.coupon
    ?.map((coupon) => coupon.code?.trim())
    .filter(Boolean)[0] || null;
}

function getChannelLabel(order: NuvemshopOrder) {
  return order.gateway_name || order.gateway || "Nuvemshop";
}

async function fetchAllOrders(client: NuvemshopClient) {
  const result: NuvemshopOrder[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await client.listOrders({ page, perPage: PAGE_SIZE });
    result.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return result;
}

async function loadInfluencerDashboard(
  client: NuvemshopClient,
  filters: {
    month: string;
    startDate: string;
    endDate: string;
    couponQuery: string;
    selectedCoupon: string;
    commissionRate: string;
  },
  financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"],
) {
  try {
    const orders = await fetchAllOrders(client);
    const commissionRate = Math.max(Number(filters.commissionRate) || 0, 0);
    const couponOrders = orders
      .filter((order) => matchesDateRange(order, filters.startDate, filters.endDate))
      .map((order) => ({
        order,
        couponCode: getCouponCode(order),
      }))
      .filter((item) => item.couponCode)
      .filter((item) =>
        filters.couponQuery
          ? normalizeText(item.couponCode || "").includes(normalizeText(filters.couponQuery))
          : true,
      ) as Array<{ order: NuvemshopOrder; couponCode: string }>;

    const influencerMap = new Map<string, InfluencerRow>();

    for (const item of couponOrders) {
      const code = item.couponCode;
      const current = influencerMap.get(code) || {
        code,
        orders: 0,
        revenue: 0,
        netRevenue: 0,
        averageTicket: 0,
        lastOrderAt: null,
        channels: [],
        currentTierLabel: "Sem meta batida",
        unlockedCredit: 0,
        nextGoalAmount: null,
        amountToNextGoal: null,
        nextTierLabel: null,
      };

      current.orders += 1;
      current.revenue += parseMoney(item.order.total);
      current.netRevenue += getNetRevenue(item.order, financeConfig);

      const channel = getChannelLabel(item.order);
      if (!current.channels.includes(channel)) {
        current.channels.push(channel);
      }

      if (!current.lastOrderAt || new Date(item.order.created_at || 0) > new Date(current.lastOrderAt)) {
        current.lastOrderAt = item.order.created_at || null;
      }

      influencerMap.set(code, current);
    }

    const influencerRows = Array.from(influencerMap.values())
      .map((row) => ({
        ...row,
        averageTicket: row.orders > 0 ? row.revenue / row.orders : 0,
        ...(() => {
          const tier = getInfluencerTier(row.netRevenue);
          return {
            currentTierLabel: tier.reachedTier
              ? `${tier.reachedTier.label} · ${formatMoney(tier.reachedTier.credit)} liberados`
              : "Sem meta batida",
            unlockedCredit: tier.unlockedCredit,
            nextGoalAmount: tier.nextTier?.goal ?? null,
            amountToNextGoal: tier.amountToNextGoal,
            nextTierLabel: tier.nextTier?.label ?? null,
          };
        })(),
      }))
      .sort((left, right) => right.netRevenue - left.netRevenue);

    const topCoupon = influencerRows[0] || null;
    const totalRevenue = influencerRows.reduce((sum, row) => sum + row.revenue, 0);
    const totalNetRevenue = influencerRows.reduce((sum, row) => sum + row.netRevenue, 0);
    const totalOrders = influencerRows.reduce((sum, row) => sum + row.orders, 0);
    const totalCommission = totalRevenue * (commissionRate / 100);
    const totalUnlockedCredit = influencerRows.reduce(
      (sum, row) => sum + row.unlockedCredit,
      0,
    );
    const influencersNearGoal = influencerRows.filter(
      (row) => row.amountToNextGoal !== null && row.amountToNextGoal <= 150,
    ).length;
    const selectedCoupon =
      influencerRows.find((row) => row.code === filters.selectedCoupon) || null;
    const selectedCouponOrders = selectedCoupon
      ? couponOrders
          .filter((item) => item.couponCode === selectedCoupon.code)
          .sort((left, right) => {
            const leftDate = left.order.created_at ? new Date(left.order.created_at).getTime() : 0;
            const rightDate = right.order.created_at ? new Date(right.order.created_at).getTime() : 0;
            return rightDate - leftDate;
          })
          .slice(0, RECENT_ORDERS_LIMIT)
      : [];

    return {
      ok: true as const,
      data: {
        commissionRate,
        influencerRows,
        selectedCoupon,
        selectedCouponOrders,
        topCoupon,
        totalNetRevenue,
        totalCommission,
        totalUnlockedCredit,
        totalOrders,
        totalRevenue,
        influencersNearGoal,
      },
    };
  } catch (error) {
    const message =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : "Nao foi possivel carregar os influenciadores a partir da Nuvemshop.";

    return {
      ok: false as const,
      message,
    };
  }
}

export default async function InfluenciadoresPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const selectedMonth = getSearchValue(resolvedSearchParams, "month") || getCurrentMonthInput();
  const monthRange = getMonthRange(selectedMonth);
  const filters = {
    month: selectedMonth,
    startDate: getSearchValue(resolvedSearchParams, "startDate") || monthRange.startDate,
    endDate: getSearchValue(resolvedSearchParams, "endDate") || monthRange.endDate,
    couponQuery: getSearchValue(resolvedSearchParams, "couponQuery"),
    selectedCoupon: getSearchValue(resolvedSearchParams, "selectedCoupon"),
    commissionRate: getSearchValue(resolvedSearchParams, "commissionRate") || "8",
  };
  const credentials = getNuvemshopCredentials();
  const { config: financeConfig } = await loadFinanceConfig();

  if (!credentials.ok) {
    return (
      <AppShell
        title="Influenciadores"
        subtitle="Acompanhe cupons, vendas geradas, comissoes e desempenho com base nos pedidos da Nuvemshop."
        currentPath="/influenciadores"
      >
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Credenciais pendentes</div>
            <p className={styles.warningText}>
              Falta preencher no `.env.local`: {credentials.missing.join(", ")}.
            </p>
          </div>
        </section>
      </AppShell>
    );
  }

  const client = new NuvemshopClient(credentials.credentials);
  const dashboard = await loadInfluencerDashboard(client, filters, financeConfig);

  if (!dashboard.ok) {
    return (
      <AppShell
        title="Influenciadores"
        subtitle="Acompanhe cupons, vendas geradas e desempenho com base na Nuvemshop."
        currentPath="/influenciadores"
      >
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Erro ao carregar a tela</div>
            <p className={styles.warningText}>{dashboard.message}</p>
          </div>
        </section>
      </AppShell>
    );
  }

  const {
    commissionRate,
    influencerRows,
    selectedCoupon,
    selectedCouponOrders,
    topCoupon,
    totalNetRevenue,
    totalCommission,
    totalUnlockedCredit,
    totalOrders,
    totalRevenue,
    influencersNearGoal,
  } = dashboard.data;

  return (
      <AppShell
        title="Influenciadores"
        subtitle="Programa mensal por receita liquida, com credito interno liberado conforme a meta batida por cupom."
        currentPath="/influenciadores"
      >
        <section className={styles.section}>
          <div className={styles.twoColumn}>
            <div className={styles.callout}>
              <h3>Programa do mes</h3>
              <p>
                O modelo mais saudavel agora e liberar credito interno com base na
                receita liquida gerada por cada cupom no mes. Assim voce nao
                registra venda zerada na Nuvemshop e evita confundir faturamento com
                custo de marketing.
              </p>
            </div>
            <div className={styles.list}>
              {INFLUENCER_TIERS.map((tier) => (
                <article key={tier.label} className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>{tier.label}</div>
                    <span className={`${styles.pill} ${styles.pillLow}`}>
                      {formatMoney(tier.credit)}
                    </span>
                  </div>
                  <p className={styles.listDetail}>
                    Bateu {formatMoney(tier.goal)} de receita liquida em {monthRange.label},
                    libera {formatMoney(tier.credit)} de credito para escolher
                    produtos na loja.
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Filtros</div>
              <p className={styles.sectionSubtitle}>
                Filtre o painel por periodo e codigo de cupom para analisar os parceiros.
              </p>
            </div>
          </div>

          <form className={styles.filterGrid} method="get">
            <label className={styles.filterField}>
              <span>Mes</span>
              <input type="month" name="month" defaultValue={filters.month} />
            </label>
            <label className={styles.filterField}>
              <span>Data inicial</span>
              <input type="date" name="startDate" defaultValue={filters.startDate} />
            </label>
            <label className={styles.filterField}>
              <span>Data final</span>
              <input type="date" name="endDate" defaultValue={filters.endDate} />
            </label>
            <label className={styles.filterField}>
              <span>Buscar cupom</span>
              <input
                type="text"
                name="couponQuery"
                placeholder="Ex.: LARIRM"
                defaultValue={filters.couponQuery}
              />
            </label>
            <label className={styles.filterField}>
              <span>Comissao prevista (%)</span>
              <input
                type="number"
                name="commissionRate"
                min="0"
                step="0.1"
                defaultValue={filters.commissionRate}
              />
            </label>
            <input type="hidden" name="selectedCoupon" value={filters.selectedCoupon} />
            <div className={styles.filterActions}>
              <button type="submit" className={styles.primaryButton}>
                Aplicar filtros
              </button>
              <a href="/influenciadores" className={styles.secondaryButton}>
                Limpar
              </a>
            </div>
          </form>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Resumo dos parceiros</div>
              <p className={styles.sectionSubtitle}>
                Resumo montado com os cupons encontrados nos pedidos reais da Nuvemshop.
              </p>
            </div>
          </div>

          <div className={styles.metricGrid}>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Cupons ativos</div>
              <div className={styles.metricValue}>{influencerRows.length}</div>
              <div className={styles.metricHint}>Cupons com pedido no periodo</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Pedidos com cupom</div>
              <div className={styles.metricValue}>{totalOrders}</div>
              <div className={styles.metricHint}>Pedidos atribuidos a parceiros</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Faturamento gerado</div>
              <div className={styles.metricValue}>{formatMoney(totalRevenue)}</div>
              <div className={styles.metricHint}>Receita dos pedidos com cupom</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Receita liquida gerada</div>
              <div className={styles.metricValue}>{formatMoney(totalNetRevenue)}</div>
              <div className={styles.metricHint}>Base usada para bater meta e liberar credito</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Comissao prevista</div>
              <div className={styles.metricValue}>{formatMoney(totalCommission)}</div>
              <div className={styles.metricHint}>Baseada em {commissionRate}%</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Credito liberado no mes</div>
              <div className={styles.metricValue}>{formatMoney(totalUnlockedCredit)}</div>
              <div className={styles.metricHint}>Soma dos niveis batidos por todos os cupons</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Quase batendo meta</div>
              <div className={styles.metricValue}>{influencersNearGoal}</div>
              <div className={styles.metricHint}>Cupons a ate R$ 150 do proximo nivel</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Melhor cupom</div>
              <div className={styles.metricValue}>{topCoupon?.code || "-"}</div>
              <div className={styles.metricHint}>
                {topCoupon ? `${formatMoney(topCoupon.netRevenue)} de receita liquida` : "Sem vendas com cupom"}
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Painel de influenciadores</div>
              <p className={styles.sectionSubtitle}>
                Cada linha representa um cupom encontrado nos pedidos da Nuvemshop.
              </p>
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chip}>Periodo filtrado</span>
              <span className={styles.chip}>Base: pedidos com cupom</span>
            </div>
          </div>

          {influencerRows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Cupom</th>
                    <th>Pedidos</th>
                    <th>Receita bruta</th>
                    <th>Receita liquida</th>
                    <th>Ticket medio</th>
                    <th>Nivel atual</th>
                    <th>Credito liberado</th>
                    <th>Falta para proxima meta</th>
                    <th>Comissao</th>
                    <th>Canais</th>
                    <th>Ultimo pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {influencerRows.map((row) => (
                    <tr key={row.code}>
                      <td>
                        <a
                          href={`/influenciadores?startDate=${filters.startDate}&endDate=${filters.endDate}&couponQuery=${filters.couponQuery}&commissionRate=${filters.commissionRate}&selectedCoupon=${row.code}`}
                          className={styles.tableLink}
                        >
                          {row.code}
                        </a>
                      </td>
                      <td>{row.orders}</td>
                      <td>{formatMoney(row.revenue)}</td>
                      <td>{formatMoney(row.netRevenue)}</td>
                      <td>{formatMoney(row.averageTicket)}</td>
                      <td>{row.currentTierLabel}</td>
                      <td>{formatMoney(row.unlockedCredit)}</td>
                      <td>
                        {row.amountToNextGoal !== null
                          ? `${formatMoney(row.amountToNextGoal)} para ${row.nextTierLabel}`
                          : "Meta maxima batida"}
                      </td>
                      <td>{formatMoney(row.revenue * (commissionRate / 100))}</td>
                      <td>{row.channels.join(" / ")}</td>
                      <td>{formatDate(row.lastOrderAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              Nenhum pedido com cupom encontrado nesse periodo.
            </div>
          )}
        </section>

        {filters.selectedCoupon ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Detalhe do cupom</div>
                <p className={styles.sectionSubtitle}>
                  Pedidos recentes vinculados ao cupom selecionado.
                </p>
              </div>
              <a href="/influenciadores" className={styles.secondaryButton}>
                Fechar detalhe
              </a>
            </div>

            {selectedCoupon ? (
              <>
                <div className={styles.metricGrid}>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Cupom</div>
                    <div className={styles.metricValue}>{selectedCoupon.code}</div>
                    <div className={styles.metricHint}>Codigo em uso na Nuvemshop</div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Pedidos</div>
                    <div className={styles.metricValue}>{selectedCoupon.orders}</div>
                    <div className={styles.metricHint}>Pedidos no periodo atual</div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Receita</div>
                    <div className={styles.metricValue}>{formatMoney(selectedCoupon.revenue)}</div>
                    <div className={styles.metricHint}>Faturamento gerado pelo cupom</div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Receita liquida</div>
                    <div className={styles.metricValue}>{formatMoney(selectedCoupon.netRevenue)}</div>
                    <div className={styles.metricHint}>Base usada para bater a meta do mes</div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Credito liberado</div>
                    <div className={styles.metricValue}>
                      {formatMoney(selectedCoupon.unlockedCredit)}
                    </div>
                    <div className={styles.metricHint}>{selectedCoupon.currentTierLabel}</div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Falta para proxima meta</div>
                    <div className={styles.metricValue}>
                      {selectedCoupon.amountToNextGoal !== null
                        ? formatMoney(selectedCoupon.amountToNextGoal)
                        : "-"}
                    </div>
                    <div className={styles.metricHint}>
                      {selectedCoupon.amountToNextGoal !== null
                        ? `Para chegar em ${selectedCoupon.nextTierLabel}`
                        : "Ja bateu o maior nivel do programa"}
                    </div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Comissao</div>
                    <div className={styles.metricValue}>
                      {formatMoney(selectedCoupon.revenue * (commissionRate / 100))}
                    </div>
                    <div className={styles.metricHint}>Com base em {commissionRate}%</div>
                  </article>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Data</th>
                        <th>Cliente</th>
                        <th>Total</th>
                        <th>Pagamento</th>
                        <th>Status</th>
                        <th>Envio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCouponOrders.map(({ order }) => (
                        <tr key={String(order.id)}>
                          <td>#{order.number}</td>
                          <td>{formatDate(order.created_at)}</td>
                          <td>{order.customer?.name || order.contact_name || "-"}</td>
                          <td>{formatMoney(order.total)}</td>
                          <td>{order.payment_details?.method || order.gateway_name || "-"}</td>
                          <td>{order.status || "-"}</td>
                          <td>{order.shipping_status || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={styles.callout}>
                  <h3>Leitura pratica do parceiro</h3>
                  <p>
                    {selectedCoupon.amountToNextGoal !== null
                      ? `Hoje o cupom ${selectedCoupon.code} gerou ${formatMoney(selectedCoupon.netRevenue)} liquidos em ${monthRange.label}. Faltam ${formatMoney(selectedCoupon.amountToNextGoal)} para bater ${selectedCoupon.nextTierLabel} e liberar mais credito no mes.`
                      : `Hoje o cupom ${selectedCoupon.code} ja bateu o maior nivel do programa em ${monthRange.label} e liberou ${formatMoney(selectedCoupon.unlockedCredit)} de credito interno.`}
                  </p>
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>
                O cupom selecionado nao aparece nos pedidos filtrados.
              </div>
            )}
          </section>
        ) : null}
      </AppShell>
    );
}
