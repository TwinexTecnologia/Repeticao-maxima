import { AppShell } from "@/components/app-shell";
import { PartnerCouponManager } from "@/components/partner-coupon-manager";
import styles from "@/components/panel.module.css";
import { loadFinanceConfig } from "@/lib/financeiro/repository";
import {
  loadCouponPartnerModuleData,
  type CouponPartnerProfile,
  type PartnerRole,
} from "@/lib/parceiros/repository";
import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopOrder } from "@/lib/nuvemshop/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const RECENT_ORDERS_LIMIT = 20;
const WINDOW_MONTHS = 3;
const INFLUENCER_WINDOW_GOAL = 2000;
const INFLUENCER_CREDIT_PERCENT = 14;
const ATHLETE_WINDOW_GOAL = 1500;
const ATHLETE_WINDOW_CREDIT_PERCENT = 10;
const ATHLETE_SUPPORT_PERCENT = 4;
const ATHLETE_SUPPORT_REFERENCE_COST = 400;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type CouponStats = {
  code: string;
  orders: number;
  revenue: number;
  netRevenue: number;
  averageTicket: number;
  lastOrderAt: string | null;
  channels: string[];
};

type PartnerDashboardRow = CouponStats & {
  name: string;
  role: PartnerRole;
  notes: string;
  monthlyGoal: number;
  monthlyCreditPercent: number;
  monthlyUnlockedCredit: number;
  monthlyAmountToGoal: number;
  monthlyGoalReached: boolean;
  lifetimeOrders: number;
  lifetimeRevenue: number;
  lifetimeNetRevenue: number;
  cumulativeSupport: number;
  nextSupportMilestone: number | null;
};

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

function normalizeRole(value: string): PartnerRole {
  return value.trim().toLowerCase() === "atleta" ? "atleta" : "influenciador";
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

function getRollingWindowRange(monthInput: string) {
  const monthRange = getMonthRange(monthInput);
  const [yearText, monthText] = monthRange.startDate.split("-");
  const endYear = Number.parseInt(yearText || "", 10);
  const endMonthIndex = Number.parseInt(monthText || "", 10) - 1;
  const start = new Date(endYear, endMonthIndex - (WINDOW_MONTHS - 1), 1);
  const end = new Date(endYear, endMonthIndex + 1, 0);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(start);
  const endLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(end);

  return {
    startDate,
    endDate,
    label: `${startLabel} a ${endLabel}`,
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

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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
    ?.map((coupon) => coupon.code?.trim().toUpperCase())
    .filter(Boolean)[0] || null;
}

function getChannelLabel(order: NuvemshopOrder) {
  return order.gateway_name || order.gateway || "Nuvemshop";
}

function matchesCouponQuery(value: string, couponQuery: string, extraText?: string) {
  if (!couponQuery) {
    return true;
  }

  const normalizedQuery = normalizeText(couponQuery);
  return (
    normalizeText(value).includes(normalizedQuery) ||
    normalizeText(extraText || "").includes(normalizedQuery)
  );
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

function buildEmptyCouponStats(code: string): CouponStats {
  return {
    code,
    orders: 0,
    revenue: 0,
    netRevenue: 0,
    averageTicket: 0,
    lastOrderAt: null,
    channels: [],
  };
}

function aggregateCouponStats(
  items: Array<{ order: NuvemshopOrder; couponCode: string }>,
  financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"],
) {
  const statsMap = new Map<string, CouponStats>();

  for (const item of items) {
    const current = statsMap.get(item.couponCode) || buildEmptyCouponStats(item.couponCode);
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

    current.averageTicket = current.orders > 0 ? current.revenue / current.orders : 0;
    statsMap.set(item.couponCode, current);
  }

  return statsMap;
}

function buildPartnerRow(
  profile: CouponPartnerProfile,
  monthStats: CouponStats,
  lifetimeStats: CouponStats,
): PartnerDashboardRow {
  const monthlyGoal =
    profile.role === "atleta" ? ATHLETE_WINDOW_GOAL : INFLUENCER_WINDOW_GOAL;
  const monthlyCreditPercent =
    profile.role === "atleta"
      ? ATHLETE_WINDOW_CREDIT_PERCENT
      : INFLUENCER_CREDIT_PERCENT;
  const monthlyGoalReached = monthStats.netRevenue >= monthlyGoal;
  const monthlyUnlockedCredit = monthlyGoalReached
    ? monthStats.netRevenue * (monthlyCreditPercent / 100)
    : 0;
  const cumulativeSupport =
    profile.role === "atleta"
      ? lifetimeStats.netRevenue * (ATHLETE_SUPPORT_PERCENT / 100)
      : 0;
  const nextSupportMilestone =
    profile.role === "atleta"
      ? Math.max(
          (Math.floor(cumulativeSupport / ATHLETE_SUPPORT_REFERENCE_COST) + 1) *
            ATHLETE_SUPPORT_REFERENCE_COST -
            cumulativeSupport,
          0,
        )
      : null;

  return {
    ...monthStats,
    name: profile.name,
    role: profile.role,
    notes: profile.notes,
    monthlyGoal,
    monthlyCreditPercent,
    monthlyUnlockedCredit,
    monthlyAmountToGoal: Math.max(monthlyGoal - monthStats.netRevenue, 0),
    monthlyGoalReached,
    lifetimeOrders: lifetimeStats.orders,
    lifetimeRevenue: lifetimeStats.revenue,
    lifetimeNetRevenue: lifetimeStats.netRevenue,
    cumulativeSupport,
    nextSupportMilestone,
  };
}

function buildPartnerLink(
  filters: {
    month: string;
    couponQuery: string;
  },
  selectedCoupon: string,
) {
  const params = new URLSearchParams({
    month: filters.month,
    couponQuery: filters.couponQuery,
    selectedCoupon,
  });

  return `/influenciadores?${params.toString()}`;
}

async function loadInfluencerDashboard(
  client: NuvemshopClient,
  filters: {
    month: string;
    startDate: string;
    endDate: string;
    couponQuery: string;
    selectedCoupon: string;
  },
  financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"],
  profiles: CouponPartnerProfile[],
) {
  try {
    const orders = await fetchAllOrders(client);
    const allCouponOrders = orders
      .map((order) => ({
        order,
        couponCode: getCouponCode(order),
      }))
      .filter((item) => item.couponCode) as Array<{
      order: NuvemshopOrder;
      couponCode: string;
    }>;
    const filteredCouponOrders = allCouponOrders
      .filter((item) =>
        matchesDateRange(item.order, filters.startDate, filters.endDate),
      )
      .filter((item) =>
        matchesCouponQuery(item.couponCode, filters.couponQuery),
      );
    const filteredStatsMap = aggregateCouponStats(filteredCouponOrders, financeConfig);
    const lifetimeStatsMap = aggregateCouponStats(allCouponOrders, financeConfig);
    const activeProfiles = profiles.filter((profile) => profile.active);
    const profileCouponMap = new Map(
      activeProfiles.map((profile) => [profile.couponCode, profile]),
    );
    const partnerRows = activeProfiles
      .filter((profile) =>
        matchesCouponQuery(profile.couponCode, filters.couponQuery, profile.name),
      )
      .map((profile) =>
        buildPartnerRow(
          profile,
          filteredStatsMap.get(profile.couponCode) || buildEmptyCouponStats(profile.couponCode),
          lifetimeStatsMap.get(profile.couponCode) || buildEmptyCouponStats(profile.couponCode),
        ),
      )
      .sort((left, right) => right.netRevenue - left.netRevenue);
    const influencerRows = partnerRows.filter(
      (row) => row.role === "influenciador",
    );
    const athleteRows = partnerRows.filter((row) => row.role === "atleta");
    const selectedCoupon =
      partnerRows.find((row) => row.code === filters.selectedCoupon) || null;
    const selectedCouponOrders = selectedCoupon
      ? filteredCouponOrders
          .filter((item) => item.couponCode === selectedCoupon.code)
          .sort((left, right) => {
            const leftDate = left.order.created_at ? new Date(left.order.created_at).getTime() : 0;
            const rightDate = right.order.created_at ? new Date(right.order.created_at).getTime() : 0;
            return rightDate - leftDate;
          })
          .slice(0, RECENT_ORDERS_LIMIT)
      : [];
    const unclassifiedRows = Array.from(filteredStatsMap.values())
      .filter((row) => !profileCouponMap.has(row.code))
      .sort((left, right) => right.netRevenue - left.netRevenue);
    const topPartner = partnerRows[0] || null;
    const totalRevenue = partnerRows.reduce((sum, row) => sum + row.revenue, 0);
    const totalNetRevenue = partnerRows.reduce((sum, row) => sum + row.netRevenue, 0);
    const totalOrders = partnerRows.reduce((sum, row) => sum + row.orders, 0);
    const totalMonthlyUnlocked = partnerRows.reduce(
      (sum, row) => sum + row.monthlyUnlockedCredit,
      0,
    );
    const totalAthleteSupport = athleteRows.reduce(
      (sum, row) => sum + row.cumulativeSupport,
      0,
    );
    const partnersNearGoal = partnerRows.filter(
      (row) => row.monthlyAmountToGoal > 0 && row.monthlyAmountToGoal <= 300,
    ).length;

    return {
      ok: true as const,
      data: {
        influencerRows,
        athleteRows,
        partnerRows,
        unclassifiedRows,
        selectedCoupon,
        selectedCouponOrders,
        topPartner,
        totalNetRevenue,
        totalMonthlyUnlocked,
        totalAthleteSupport,
        totalOrders,
        totalRevenue,
        partnersNearGoal,
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
  const rollingWindow = getRollingWindowRange(selectedMonth);
  const filters = {
    month: selectedMonth,
    startDate: rollingWindow.startDate,
    endDate: rollingWindow.endDate,
    couponQuery: getSearchValue(resolvedSearchParams, "couponQuery"),
    selectedCoupon: getSearchValue(resolvedSearchParams, "selectedCoupon"),
  };
  const credentials = getNuvemshopCredentials();
  const [{ config: financeConfig }, moduleData] = await Promise.all([
    loadFinanceConfig(),
    loadCouponPartnerModuleData(),
  ]);
  const initialDraft = {
    name: "",
    couponCode: getSearchValue(resolvedSearchParams, "couponCode").trim().toUpperCase(),
    role: normalizeRole(getSearchValue(resolvedSearchParams, "role")),
    active: true,
    notes: "",
  };

  if (!credentials.ok) {
    return (
      <AppShell
        title="Influenciadores"
        subtitle="Acompanhe cupons, vendas geradas e o desempenho dos parceiros com base nos pedidos da Nuvemshop."
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
  const dashboard = await loadInfluencerDashboard(
    client,
    filters,
    financeConfig,
    moduleData.profiles,
  );

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
    influencerRows,
    athleteRows,
    partnerRows,
    unclassifiedRows,
    selectedCoupon,
    selectedCouponOrders,
    topPartner,
    totalNetRevenue,
    totalMonthlyUnlocked,
    totalAthleteSupport,
    totalOrders,
    totalRevenue,
    partnersNearGoal,
  } = dashboard.data;

  return (
      <AppShell
        title="Influenciadores"
        subtitle="Programa por janela de 3 meses, separando influenciador e atleta com leitura de roupa liberada e apoio acumulativo."
        currentPath="/influenciadores"
      >
        <section className={styles.section}>
          <div className={styles.twoColumn}>
            <div className={styles.callout}>
              <h3>Influenciador</h3>
              <p>
                Bateu {formatMoney(INFLUENCER_WINDOW_GOAL)} de receita liquida em
                ate 3 meses, libera {INFLUENCER_CREDIT_PERCENT}% em roupa. Se nao
                fechar a janela, zera e recomeca.
              </p>
            </div>
            <div className={styles.list}>
              <article className={styles.listItem}>
                <div className={styles.listTitleRow}>
                  <div className={styles.listTitle}>Atleta</div>
                  <span className={`${styles.pill} ${styles.pillLow}`}>
                    10% + 4%
                  </span>
                </div>
                <p className={styles.listDetail}>
                  Bateu {formatMoney(ATHLETE_WINDOW_GOAL)} em ate 3 meses,
                  libera {ATHLETE_WINDOW_CREDIT_PERCENT}% em roupa. Alem disso,
                  acumula {ATHLETE_SUPPORT_PERCENT}% da receita liquida total para
                  apoio esportivo.
                </p>
              </article>
              <article className={styles.listItem}>
                <div className={styles.listTitleRow}>
                  <div className={styles.listTitle}>Apoio esportivo</div>
                  <span className={`${styles.pill} ${styles.pillLow}`}>
                    Base R$ 400
                  </span>
                </div>
                <p className={styles.listDetail}>
                  O acumulado do atleta pode ser lido contra uma referencia de{" "}
                  {formatMoney(ATHLETE_SUPPORT_REFERENCE_COST)} para kit, pintura
                  ou ajuda de campeonato.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Filtros</div>
              <p className={styles.sectionSubtitle}>
                Escolha o mes final da janela de 3 meses e filtre os parceiros
                classificados nesta propria aba.
              </p>
            </div>
          </div>

          <form className={styles.filterGrid} method="get">
            <label className={styles.filterField}>
              <span>Mes final da janela</span>
              <input type="month" name="month" defaultValue={filters.month} />
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

        <PartnerCouponManager
          initialProfiles={moduleData.profiles}
          initialKnownCoupons={moduleData.knownCoupons}
          initialPersistence={moduleData.persistence}
          initialDiscoveryState={moduleData.discoveryState}
          initialDraft={initialDraft}
        />

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Resumo dos parceiros</div>
              <p className={styles.sectionSubtitle}>
                Resumo montado a partir dos cupons classificados e dos pedidos
                reais do periodo.
              </p>
            </div>
          </div>

          <div className={styles.metricGrid}>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Parceiros ativos</div>
              <div className={styles.metricValue}>{partnerRows.length}</div>
              <div className={styles.metricHint}>Cupons ativos na classificacao</div>
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
              <div className={styles.metricHint}>Base usada para bater meta na janela de 3 meses</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Roupa liberada na janela</div>
              <div className={styles.metricValue}>{formatMoney(totalMonthlyUnlocked)}</div>
              <div className={styles.metricHint}>Soma dos beneficios destravados na janela atual</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Apoio acumulado dos atletas</div>
              <div className={styles.metricValue}>{formatMoney(totalAthleteSupport)}</div>
              <div className={styles.metricHint}>Base total acumulativa para kit e pintura</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Quase batendo meta</div>
              <div className={styles.metricValue}>{partnersNearGoal}</div>
              <div className={styles.metricHint}>Parceiros a ate R$ 300 da liberacao na janela</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Melhor parceiro da janela</div>
              <div className={styles.metricValue}>{topPartner?.code || "-"}</div>
              <div className={styles.metricHint}>
                {topPartner ? `${formatMoney(topPartner.netRevenue)} de receita liquida` : "Sem vendas com cupom"}
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Painel de influenciadores</div>
              <p className={styles.sectionSubtitle}>
                Aqui entram so os cupons ativos classificados como influenciador
                dentro da janela de 3 meses.
              </p>
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chip}>{rollingWindow.label}</span>
              <span className={styles.chip}>Meta: R$ 2.000 liquidos</span>
            </div>
          </div>

          {influencerRows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Parceiro</th>
                    <th>Cupom</th>
                    <th>Pedidos</th>
                    <th>Receita liquida 3m</th>
                    <th>Ticket medio</th>
                    <th>Roupa liberada</th>
                    <th>Falta para liberar</th>
                    <th>Canais</th>
                    <th>Ultimo pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {influencerRows.map((row) => (
                    <tr key={row.code}>
                      <td>
                        <strong>{row.name}</strong>
                        <div style={{ color: "#6f5b82", marginTop: 6 }}>
                          {row.notes || "Sem observacao interna."}
                        </div>
                      </td>
                      <td>
                        <a
                          href={buildPartnerLink(filters, row.code)}
                          className={styles.tableLink}
                        >
                          {row.code}
                        </a>
                      </td>
                      <td>{row.orders}</td>
                      <td>{formatMoney(row.netRevenue)}</td>
                      <td>{formatMoney(row.averageTicket)}</td>
                      <td>{formatMoney(row.monthlyUnlockedCredit)}</td>
                      <td>
                        {row.monthlyGoalReached
                          ? "Meta batida na janela"
                          : formatMoney(row.monthlyAmountToGoal)}
                      </td>
                      <td>{row.channels.join(" / ")}</td>
                      <td>{formatDateTime(row.lastOrderAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              Nenhum influenciador ativo apareceu com os filtros atuais.
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Painel de atletas</div>
              <p className={styles.sectionSubtitle}>
                O atleta le em duas frentes: roupa liberada na janela de 3 meses
                e apoio acumulado no historico.
              </p>
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chip}>Meta 3 meses: R$ 1.500</span>
              <span className={styles.chip}>Acumulado: 4%</span>
            </div>
          </div>

          {athleteRows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Parceiro</th>
                    <th>Cupom</th>
                    <th>Pedidos 3m</th>
                    <th>Receita liquida 3m</th>
                    <th>Roupa liberada</th>
                    <th>Apoio acumulado</th>
                    <th>Falta para proximo apoio</th>
                    <th>Ultimo pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {athleteRows.map((row) => (
                    <tr key={row.code}>
                      <td>
                        <strong>{row.name}</strong>
                        <div style={{ color: "#6f5b82", marginTop: 6 }}>
                          {row.notes || "Sem observacao interna."}
                        </div>
                      </td>
                      <td>
                        <a
                          href={buildPartnerLink(filters, row.code)}
                          className={styles.tableLink}
                        >
                          {row.code}
                        </a>
                      </td>
                      <td>{row.orders}</td>
                      <td>{formatMoney(row.netRevenue)}</td>
                      <td>{formatMoney(row.monthlyUnlockedCredit)}</td>
                      <td>{formatMoney(row.cumulativeSupport)}</td>
                      <td>
                        {row.nextSupportMilestone !== null
                          ? formatMoney(row.nextSupportMilestone)
                          : "-"}
                      </td>
                      <td>{formatDateTime(row.lastOrderAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              Nenhum atleta ativo apareceu com os filtros atuais.
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Cupons sem classificacao</div>
              <p className={styles.sectionSubtitle}>
                Se um cupom vendeu no periodo e nao aparece acima, ele ainda nao
                foi marcado como influenciador ou atleta.
              </p>
            </div>
          </div>

          {unclassifiedRows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Cupom</th>
                    <th>Pedidos</th>
                    <th>Receita liquida</th>
                    <th>Ultimo pedido</th>
                    <th>Atalho</th>
                  </tr>
                </thead>
                <tbody>
                  {unclassifiedRows.map((row) => (
                    <tr key={row.code}>
                      <td>{row.code}</td>
                      <td>{row.orders}</td>
                      <td>{formatMoney(row.netRevenue)}</td>
                      <td>{formatDateTime(row.lastOrderAt)}</td>
                      <td>
                        <a
                          href={`/influenciadores?couponCode=${encodeURIComponent(row.code)}&role=influenciador`}
                          className={styles.secondaryButton}
                        >
                          Classificar cupom
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              Todos os cupons com vendas no periodo ja foram classificados.
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
                    <div className={styles.metricLabel}>Parceiro</div>
                    <div className={styles.metricValue}>{selectedCoupon.name}</div>
                    <div className={styles.metricHint}>
                      {selectedCoupon.role === "atleta" ? "Atleta" : "Influenciador"}
                    </div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Cupom</div>
                    <div className={styles.metricValue}>{selectedCoupon.code}</div>
                    <div className={styles.metricHint}>Codigo usado na Nuvemshop</div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Pedidos</div>
                    <div className={styles.metricValue}>{selectedCoupon.orders}</div>
                    <div className={styles.metricHint}>Pedidos no periodo atual</div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Receita bruta</div>
                    <div className={styles.metricValue}>{formatMoney(selectedCoupon.revenue)}</div>
                    <div className={styles.metricHint}>Faturamento gerado pelo cupom</div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Receita liquida</div>
                    <div className={styles.metricValue}>{formatMoney(selectedCoupon.netRevenue)}</div>
                    <div className={styles.metricHint}>Base usada na janela de 3 meses</div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Roupa liberada</div>
                    <div className={styles.metricValue}>
                      {formatMoney(selectedCoupon.monthlyUnlockedCredit)}
                    </div>
                    <div className={styles.metricHint}>
                      {selectedCoupon.monthlyGoalReached
                        ? `${selectedCoupon.monthlyCreditPercent}% liberado na janela`
                        : "Meta da janela ainda nao batida"}
                    </div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Falta para meta da janela</div>
                    <div className={styles.metricValue}>
                      {selectedCoupon.monthlyGoalReached
                        ? "-"
                        : formatMoney(selectedCoupon.monthlyAmountToGoal)}
                    </div>
                    <div className={styles.metricHint}>
                      {selectedCoupon.monthlyGoalReached
                        ? "Meta da janela batida"
                        : `Faltam ${formatMoney(selectedCoupon.monthlyAmountToGoal)} para liberar`}
                    </div>
                  </article>
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Historico liquido</div>
                    <div className={styles.metricValue}>{formatMoney(selectedCoupon.lifetimeNetRevenue)}</div>
                    <div className={styles.metricHint}>Receita liquida total do cupom</div>
                  </article>
                  {selectedCoupon.role === "atleta" ? (
                    <article className={styles.metricCard}>
                      <div className={styles.metricLabel}>Apoio acumulado</div>
                      <div className={styles.metricValue}>
                        {formatMoney(selectedCoupon.cumulativeSupport)}
                      </div>
                      <div className={styles.metricHint}>
                        {selectedCoupon.nextSupportMilestone !== null
                          ? `${formatMoney(selectedCoupon.nextSupportMilestone)} para a proxima base de R$ 400`
                          : "Sem leitura acumulativa"}
                      </div>
                    </article>
                  ) : null}
                  <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Historico de pedidos</div>
                    <div className={styles.metricValue}>{selectedCoupon.lifetimeOrders}</div>
                    <div className={styles.metricHint}>Pedidos totais do cupom</div>
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
                          <td>{formatDateTime(order.created_at)}</td>
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
                    {selectedCoupon.role === "atleta"
                      ? selectedCoupon.monthlyGoalReached
                        ? `Na janela de ${rollingWindow.label}, o atleta ${selectedCoupon.name} ja liberou ${formatMoney(selectedCoupon.monthlyUnlockedCredit)} em roupa. No historico total, o cupom ${selectedCoupon.code} acumulou ${formatMoney(selectedCoupon.cumulativeSupport)} para apoio esportivo.`
                        : `Na janela de ${rollingWindow.label}, o atleta ${selectedCoupon.name} ainda precisa gerar ${formatMoney(selectedCoupon.monthlyAmountToGoal)} liquidos para liberar roupa. No historico total, ele acumula ${formatMoney(selectedCoupon.cumulativeSupport)} para apoio esportivo.`
                      : selectedCoupon.monthlyGoalReached
                        ? `Na janela de ${rollingWindow.label}, o influenciador ${selectedCoupon.name} bateu a meta e liberou ${formatMoney(selectedCoupon.monthlyUnlockedCredit)} em roupa para usar agora.`
                        : `Na janela de ${rollingWindow.label}, o influenciador ${selectedCoupon.name} gerou ${formatMoney(selectedCoupon.netRevenue)} liquidos e ainda faltam ${formatMoney(selectedCoupon.monthlyAmountToGoal)} para liberar o beneficio em roupa.`}
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
