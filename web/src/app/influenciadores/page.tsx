import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
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
  averageTicket: number;
  lastOrderAt: string | null;
  channels: string[];
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
    startDate: string;
    endDate: string;
    couponQuery: string;
    selectedCoupon: string;
    commissionRate: string;
  },
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
        averageTicket: 0,
        lastOrderAt: null,
        channels: [],
      };

      current.orders += 1;
      current.revenue += parseMoney(item.order.total);

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
      }))
      .sort((left, right) => right.revenue - left.revenue);

    const topCoupon = influencerRows[0] || null;
    const totalRevenue = influencerRows.reduce((sum, row) => sum + row.revenue, 0);
    const totalOrders = influencerRows.reduce((sum, row) => sum + row.orders, 0);
    const totalCommission = totalRevenue * (commissionRate / 100);
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
        totalCommission,
        totalOrders,
        totalRevenue,
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
  const filters = {
    startDate: getSearchValue(resolvedSearchParams, "startDate"),
    endDate: getSearchValue(resolvedSearchParams, "endDate"),
    couponQuery: getSearchValue(resolvedSearchParams, "couponQuery"),
    selectedCoupon: getSearchValue(resolvedSearchParams, "selectedCoupon"),
    commissionRate: getSearchValue(resolvedSearchParams, "commissionRate") || "8",
  };
  const credentials = getNuvemshopCredentials();

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
  const dashboard = await loadInfluencerDashboard(client, filters);

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
    totalCommission,
    totalOrders,
    totalRevenue,
  } = dashboard.data;

  return (
      <AppShell
        title="Influenciadores"
        subtitle="Estrutura da tela baseada nos pedidos e cupons reais que chegam da Nuvemshop."
        currentPath="/influenciadores"
      >
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
              <div className={styles.metricLabel}>Comissao prevista</div>
              <div className={styles.metricValue}>{formatMoney(totalCommission)}</div>
              <div className={styles.metricHint}>Baseada em {commissionRate}%</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Melhor cupom</div>
              <div className={styles.metricValue}>{topCoupon?.code || "-"}</div>
              <div className={styles.metricHint}>
                {topCoupon ? `${formatMoney(topCoupon.revenue)} em receita` : "Sem vendas com cupom"}
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
                    <th>Receita</th>
                    <th>Ticket medio</th>
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
                      <td>{formatMoney(row.averageTicket)}</td>
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
