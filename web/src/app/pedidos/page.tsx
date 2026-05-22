import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { loadFinanceConfig } from "@/lib/financeiro/repository";
import {
  loadCouponPartnerProfiles,
  type CouponPartnerProfile,
  type PartnerRole,
} from "@/lib/parceiros/repository";
import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopOrder, NuvemshopOrderProduct } from "@/lib/nuvemshop/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const RECENT_ORDERS_LIMIT = 40;
const PRODUCTION_QUEUE_LIMIT = 6;
const RECOVERY_LIMIT = 6;
const FULL_SHIRT_COST = 52;
const MINIMAL_SHIRT_COST = 32;
const INFLUENCER_PERCENT = 14;
const ATHLETE_PERCENT = 10;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type OrderItemSummary = {
  product: string;
  baseProduct: string;
  variation: string;
  art: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

type OrderRow = {
  id: string;
  number: string;
  createdAt: string | null;
  origin: string;
  products: string[];
  variations: string[];
  arts: string[];
  couponLabel: string;
  couponCode: string | null;
  statusLabel: string;
  paymentStatusLabel: string;
  shippingStatusLabel: string;
  total: number;
  feeCost: number;
  netRevenue: number;
  cost: number;
  partnerLabel: string;
  partnerPercent: number;
  partnerAmount: number;
  profit: number;
  marginPercent: number;
  paymentLabel: string;
  items: OrderItemSummary[];
  paymentPending: boolean;
  shippingPending: boolean;
  cancelled: boolean;
};

type QueueItem = {
  title: string;
  detail: string;
  quantity: number;
  urgency: "alta" | "media" | "baixa";
};

type RecoveryItem = {
  title: string;
  detail: string;
  urgency: "alta" | "media" | "baixa";
};

function getCurrentMonthRange() {
  const now = new Date();
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = `${now.getFullYear()}-${String(now.getDate()).padStart(2, "0")}`;

  return { startDate, endDate };
}

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

function parseMoney(value?: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value?: string | number | null) {
  const amount = parseMoney(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function matchesDateRange(order: NuvemshopOrder, startDate: string, endDate: string) {
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

function hasCoupon(order: NuvemshopOrder) {
  return Array.isArray(order.coupon) && order.coupon.length > 0;
}

function getCouponCode(order: NuvemshopOrder) {
  return (
    order.coupon
      ?.map((coupon) => String(coupon.code ?? "").trim().toUpperCase())
      .filter(Boolean)[0] || null
  );
}

function getCouponLabel(order: NuvemshopOrder) {
  const code = getCouponCode(order);
  return code || "-";
}

function getPartnerPercent(role?: PartnerRole) {
  if (role === "atleta") {
    return ATHLETE_PERCENT;
  }

  if (role === "influenciador") {
    return INFLUENCER_PERCENT;
  }

  return 0;
}

function getNuvemFeeRule(
  order: NuvemshopOrder,
  financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"],
) {
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

function getPaymentLabel(order: NuvemshopOrder) {
  const method = String(
    order.payment_details?.method || order.gateway_name || order.gateway || "",
  ).trim();
  const normalized = normalizeText(method);
  const installments = Math.max(order.payment_details?.installments || 1, 1);

  if (normalized.includes("pix")) {
    return "Pix";
  }

  if (normalized.includes("boleto")) {
    return "Boleto";
  }

  if (!method) {
    return installments > 1 ? `Cartao ${installments}x` : "Cartao 1x";
  }

  if (installments > 1) {
    return `${method} ${installments}x`;
  }

  return method;
}

function getProfitClass(value: number) {
  if (value < 0) {
    return styles.profitNegative;
  }

  if (value < 12) {
    return styles.profitCritical;
  }

  if (value < 20) {
    return styles.profitWarning;
  }

  if (value < 30) {
    return styles.profitStrong;
  }

  return styles.profitHealthy;
}

function getPillClass(urgency: "alta" | "media" | "baixa") {
  if (urgency === "alta") {
    return styles.pillHigh;
  }

  if (urgency === "media") {
    return styles.pillMedium;
  }

  return styles.pillLow;
}

function extractVariantValues(values: unknown[] | null | undefined) {
  return (values || [])
    .map((value) => {
      if (typeof value === "string") {
        return value.trim();
      }

      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const localized = [record.pt, record.en, record.es]
          .find((entry) => typeof entry === "string" && entry.trim().length > 0);

        if (typeof localized === "string") {
          return localized.trim();
        }
      }

      return "";
    })
    .filter(Boolean);
}

function getBaseProduct(name: string) {
  const normalized = normalizeText(name);

  if (normalized.includes("coqueteleira")) {
    return "Coqueteleira";
  }

  if (normalized.includes("baby tee")) {
    return "Baby Tee";
  }

  if (normalized.includes("regata")) {
    return "Regata";
  }

  if (normalized.includes("oversized")) {
    return "Oversized";
  }

  if (normalized.includes("camiseta")) {
    return "Camiseta";
  }

  return name || "-";
}

function getArtName(product: NuvemshopOrderProduct) {
  const rawName = String(product.name ?? "").replace(/\s+-\s+\d+$/, "").trim();

  if (!rawName) {
    return "-";
  }

  const cleaned = rawName
    .replace(/camiseta/gi, "")
    .replace(/oversized/gi, "")
    .replace(/baby tee/gi, "")
    .replace(/regata/gi, "")
    .replace(/repeticao maxima/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || rawName;
}

function getEstimatedUnitCost(product: NuvemshopOrderProduct) {
  const productName = String(product.name ?? "");
  const variant = extractVariantValues(product.variant_values).join(" ");
  const text = normalizeText(`${productName} ${variant}`);
  const price = parseMoney(product.price);

  // The page uses the operating rule already agreed for shirts: minimalista = 32, full = 52.
  if (text.includes("minimalista")) {
    return MINIMAL_SHIRT_COST;
  }

  if (
    text.includes("camiseta") ||
    text.includes("oversized") ||
    text.includes("regata") ||
    text.includes("baby tee")
  ) {
    return FULL_SHIRT_COST;
  }

  return Math.round(price * 0.45 * 100) / 100;
}

function isPaymentPending(status: string) {
  const normalized = normalizeText(status);
  return (
    normalized.includes("pending") ||
    normalized.includes("aguardando") ||
    normalized.includes("pendente") ||
    normalized.includes("authorized")
  );
}

function isPaymentSettled(status: string) {
  const normalized = normalizeText(status);
  return normalized.includes("paid") || normalized.includes("pago");
}

function isShippingPending(status: string) {
  const normalized = normalizeText(status);
  return (
    !normalized ||
    normalized.includes("pending") ||
    normalized.includes("pendente") ||
    normalized.includes("unpacked") ||
    normalized.includes("ready")
  );
}

function isShippingDone(status: string) {
  const normalized = normalizeText(status);
  return (
    normalized.includes("delivered") ||
    normalized.includes("entreg") ||
    normalized.includes("shipped") ||
    normalized.includes("enviado")
  );
}

function isCancelled(status: string) {
  const normalized = normalizeText(status);
  return normalized.includes("cancel");
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildOrderRow(
  order: NuvemshopOrder,
  financeConfig: Awaited<ReturnType<typeof loadFinanceConfig>>["config"],
  partnerMap: Map<string, CouponPartnerProfile>,
) {
  const gross = parseMoney(order.total);
  const feeRule = getNuvemFeeRule(order, financeConfig);
  const feeCost = gross * (feeRule.percent / 100) + feeRule.fixed;
  const netRevenue = Math.max(gross - feeCost, 0);
  const items = (order.products || []).map((product) => {
    const quantity = Math.max(product.quantity || 0, 1);
    const variationValues = extractVariantValues(product.variant_values);
    const unitCost = getEstimatedUnitCost(product);

    return {
      product: String(product.name ?? "").trim() || "-",
      baseProduct: getBaseProduct(String(product.name ?? "").trim()),
      variation: variationValues.join(" / ") || "-",
      art: getArtName(product),
      quantity,
      unitCost,
      totalCost: quantity * unitCost,
    } satisfies OrderItemSummary;
  });
  const totalCost = items.reduce((sum, item) => sum + item.totalCost, 0);
  const couponCode = getCouponCode(order);
  const partnerProfile = couponCode ? partnerMap.get(couponCode) : undefined;
  const partnerPercent = getPartnerPercent(partnerProfile?.role);
  const partnerAmount = netRevenue * (partnerPercent / 100);
  const profit = netRevenue - totalCost - partnerAmount;
  const marginPercent = gross > 0 ? (profit / gross) * 100 : 0;
  const paymentStatus = String(order.payment_status ?? "");
  const shippingStatus = String(order.shipping_status ?? "");

  return {
    id: String(order.id),
    number: String(order.number ?? order.id),
    createdAt: order.created_at || null,
    origin: "Nuvemshop",
    products: uniq(items.map((item) => item.baseProduct)),
    variations: uniq(items.map((item) => item.variation)),
    arts: uniq(items.map((item) => item.art)),
    couponLabel: getCouponLabel(order),
    couponCode,
    statusLabel: String(order.status ?? "-"),
    paymentStatusLabel: paymentStatus || "-",
    shippingStatusLabel: shippingStatus || "-",
    total: gross,
    feeCost,
    netRevenue,
    cost: totalCost,
    partnerLabel: partnerProfile
      ? `${partnerProfile.name} · ${partnerProfile.role}`
      : couponCode
        ? `Cupom ${couponCode}`
        : "-",
    partnerPercent,
    partnerAmount,
    profit,
    marginPercent,
    paymentLabel: getPaymentLabel(order),
    items,
    paymentPending: !isPaymentSettled(paymentStatus) && isPaymentPending(paymentStatus),
    shippingPending: !isShippingDone(shippingStatus) && isShippingPending(shippingStatus),
    cancelled: isCancelled(String(order.status ?? "")),
  } satisfies OrderRow;
}

function buildProductionQueue(rows: OrderRow[]) {
  const grouped = new Map<
    string,
    { title: string; quantity: number; orders: number; arts: string[] }
  >();

  for (const row of rows) {
    if (row.cancelled || row.shippingPending === false) {
      continue;
    }

    for (const item of row.items) {
      const key = `${item.baseProduct}|${item.variation}`;
      const current = grouped.get(key) || {
        title: `${item.baseProduct} / ${item.variation}`,
        quantity: 0,
        orders: 0,
        arts: [],
      };

      current.quantity += item.quantity;
      current.orders += 1;
      current.arts.push(item.art);
      grouped.set(key, current);
    }
  }

  return Array.from(grouped.values())
    .map((entry) => {
      const topArt = uniq(entry.arts)[0] || "Sem arte";
      const urgency =
        entry.quantity >= 6 ? "alta" : entry.quantity >= 3 ? "media" : "baixa";

      return {
        title: entry.title,
        detail: `${entry.orders} pedido(s) puxando essa base. Arte que mais aparece: ${topArt}.`,
        quantity: entry.quantity,
        urgency,
      } satisfies QueueItem;
    })
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, PRODUCTION_QUEUE_LIMIT);
}

function buildRecoveryList(rows: OrderRow[]) {
  const result: RecoveryItem[] = [];
  const now = Date.now();

  for (const row of rows) {
    const createdAt = row.createdAt ? new Date(row.createdAt).getTime() : now;
    const ageHours = Math.max((now - createdAt) / 36e5, 0);

    if (row.paymentPending && ageHours >= 24) {
      result.push({
        title: `Pedido #${row.number} com pagamento em aberto`,
        detail: `${row.paymentLabel} | ${row.couponLabel !== "-" ? `Cupom ${row.couponLabel}. ` : ""}Ja passou ${Math.floor(ageHours)}h sem fechar pagamento.`,
        urgency: ageHours >= 72 ? "alta" : "media",
      });
    }

    if (!row.cancelled && row.shippingPending && ageHours >= 48) {
      result.push({
        title: `Pedido #${row.number} parado antes do envio`,
        detail: `${row.products.join(", ") || "Sem item"} | Status de envio: ${row.shippingStatusLabel}.`,
        urgency: ageHours >= 96 ? "alta" : "media",
      });
    }

    if (!row.cancelled && row.marginPercent < 12) {
      result.push({
        title: `Pedido #${row.number} com margem pressionada`,
        detail: `${formatPercent(row.marginPercent)} de margem | ${row.partnerPercent ? `${row.partnerPercent}% para parceiro. ` : ""}${row.paymentLabel}.`,
        urgency: row.marginPercent < 0 ? "alta" : "baixa",
      });
    }
  }

  return result.slice(0, RECOVERY_LIMIT);
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

export default async function PedidosPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const defaultRange = getCurrentMonthRange();
  const filters = {
    startDate: getSearchValue(resolvedSearchParams, "startDate") || defaultRange.startDate,
    endDate: getSearchValue(resolvedSearchParams, "endDate") || defaultRange.endDate,
    status: getSearchValue(resolvedSearchParams, "status"),
    couponMode: getSearchValue(resolvedSearchParams, "couponMode") || "all",
  };
  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return (
      <AppShell
        title="Pedidos e producao"
        subtitle="Tela real dos pedidos, fila de producao e recuperacao operacional."
        currentPath="/pedidos"
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

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const [financeData, profilesData, orders] = await Promise.all([
      loadFinanceConfig(),
      loadCouponPartnerProfiles(),
      fetchAllOrders(client),
    ]);
    const partnerMap = new Map(
      profilesData.profiles.map((profile) => [profile.couponCode, profile] as const),
    );
    const statusOptions = Array.from(
      new Set(orders.map((order) => order.status).filter(Boolean) as string[]),
    ).sort();
    const filteredOrders = [...orders]
      .filter((order) => matchesDateRange(order, filters.startDate, filters.endDate))
      .filter((order) =>
        filters.status
          ? normalizeText(String(order.status ?? "")) === normalizeText(filters.status)
          : true,
      )
      .filter((order) => {
        if (filters.couponMode === "with") {
          return hasCoupon(order);
        }

        if (filters.couponMode === "without") {
          return !hasCoupon(order);
        }

        return true;
      })
      .sort((left, right) => {
        const leftDate = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightDate = right.created_at ? new Date(right.created_at).getTime() : 0;
        return rightDate - leftDate;
      });
    const orderRows = filteredOrders.map((order) =>
      buildOrderRow(order, financeData.config, partnerMap),
    );
    const recentRows = orderRows.slice(0, RECENT_ORDERS_LIMIT);
    const totalRevenue = orderRows.reduce((sum, row) => sum + row.total, 0);
    const totalNetRevenue = orderRows.reduce((sum, row) => sum + row.netRevenue, 0);
    const totalPartner = orderRows.reduce((sum, row) => sum + row.partnerAmount, 0);
    const totalProfit = orderRows.reduce((sum, row) => sum + row.profit, 0);
    const averageTicket = orderRows.length > 0 ? totalRevenue / orderRows.length : 0;
    const averageMargin = orderRows.length > 0 ? totalProfit / Math.max(totalRevenue, 1) * 100 : 0;
    const pixOrders = orderRows.filter((row) =>
      normalizeText(row.paymentLabel).includes("pix"),
    ).length;
    const cardOrders = orderRows.filter((row) =>
      normalizeText(row.paymentLabel).includes("cartao"),
    ).length;
    const couponOrders = orderRows.filter((row) => row.couponCode).length;
    const productionQueue = buildProductionQueue(orderRows);
    const recoveryItems = buildRecoveryList(orderRows);

    return (
      <AppShell
        title="Pedidos e producao"
        subtitle="Pedidos reais da Nuvemshop com forma de pagamento, cupom, parceiro, margem estimada e prioridade operacional."
        currentPath="/pedidos"
      >
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Filtros</div>
              <p className={styles.sectionSubtitle}>
                Enquanto nao existe TikTok Shop, esta tela le so a Nuvemshop e
                cruza pagamento, cupom e custo estimado por item.
              </p>
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chip}>Origem ativa: Nuvemshop</span>
              <span className={styles.chip}>Parceiros mapeados: {partnerMap.size}</span>
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
              <span>Status do pedido</span>
              <select name="status" defaultValue={filters.status}>
                <option value="">Todos</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Cupom</span>
              <select name="couponMode" defaultValue={filters.couponMode}>
                <option value="all">Todos</option>
                <option value="with">Com cupom</option>
                <option value="without">Sem cupom</option>
              </select>
            </label>
            <div className={styles.filterActions}>
              <button type="submit" className={styles.primaryButton}>
                Aplicar filtros
              </button>
              <a href="/pedidos" className={styles.secondaryButton}>
                Limpar
              </a>
            </div>
          </form>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Resumo real do periodo</div>
              <p className={styles.sectionSubtitle}>
                Ja traz o bruto, liquido apos taxa, comissao por cupom e lucro
                estimado olhando para full, minimalista e forma de pagamento.
              </p>
            </div>
          </div>

          <div className={styles.metricGrid}>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Pedidos no periodo</div>
              <div className={styles.metricValue}>{orderRows.length}</div>
              <div className={styles.metricHint}>Pedidos reais que vieram da Nuvemshop</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Faturamento bruto</div>
              <div className={styles.metricValue}>{formatMoney(totalRevenue)}</div>
              <div className={styles.metricHint}>Soma do total dos pedidos filtrados</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Liquido apos taxa</div>
              <div className={styles.metricValue}>{formatMoney(totalNetRevenue)}</div>
              <div className={styles.metricHint}>Ja descontando Pix e cartao conforme sua regra</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Comissao de parceiros</div>
              <div className={styles.metricValue}>{formatMoney(totalPartner)}</div>
              <div className={styles.metricHint}>Valor estimado para influenciador ou atleta</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Lucro estimado</div>
              <div className={styles.metricValue}>{formatMoney(totalProfit)}</div>
              <div className={styles.metricHint}>Liquido menos custo da peca e parceiro</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Margem media</div>
              <div className={`${styles.metricValue} ${getProfitClass(averageMargin)}`}>
                {formatPercent(averageMargin)}
              </div>
              <div className={styles.metricHint}>Leitura geral da qualidade do pedido</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Mix Pix / cartao</div>
              <div className={styles.metricValue}>
                {pixOrders} / {cardOrders}
              </div>
              <div className={styles.metricHint}>Pix primeiro numero, cartao no segundo</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Pedidos com cupom</div>
              <div className={styles.metricValue}>{couponOrders}</div>
              <div className={styles.metricHint}>
                Ticket medio atual: {formatMoney(averageTicket)}
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Pedidos recentes</div>
              <p className={styles.sectionSubtitle}>
                Extrato real da Nuvemshop com origem, produto, variacao, arte,
                cupom, pagamento, margem em reais e margem em percentual.
              </p>
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chip}>Mostrando: {recentRows.length}</span>
              <span className={styles.chip}>Filtro por cupom: {filters.couponMode}</span>
            </div>
          </div>

          {recentRows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Origem</th>
                    <th>Produto</th>
                    <th>Variacao</th>
                    <th>Arte</th>
                    <th>Cupom</th>
                    <th>Status</th>
                    <th>Pagamento</th>
                    <th>Total</th>
                    <th>% parceiro</th>
                    <th>R$ parceiro</th>
                    <th>Lucro</th>
                    <th>Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        #{row.number}
                        <br />
                        {formatDate(row.createdAt)}
                      </td>
                      <td>{row.origin}</td>
                      <td>{row.products.join(", ") || "-"}</td>
                      <td>{row.variations.join(", ") || "-"}</td>
                      <td>{row.arts.join(", ") || "-"}</td>
                      <td>
                        {row.couponLabel}
                        <br />
                        {row.partnerLabel}
                      </td>
                      <td>
                        {row.statusLabel}
                        <br />
                        Pgto: {row.paymentStatusLabel}
                        <br />
                        Envio: {row.shippingStatusLabel}
                      </td>
                      <td>{row.paymentLabel}</td>
                      <td>
                        {formatMoney(row.total)}
                        <br />
                        Taxa: {formatMoney(row.feeCost)}
                      </td>
                      <td>{row.partnerPercent ? formatPercent(row.partnerPercent) : "-"}</td>
                      <td>{row.partnerPercent ? formatMoney(row.partnerAmount) : "-"}</td>
                      <td className={getProfitClass(row.marginPercent)}>
                        {formatMoney(row.profit)}
                      </td>
                      <td className={getProfitClass(row.marginPercent)}>
                        {formatPercent(row.marginPercent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              Nenhum pedido encontrado com os filtros atuais.
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.twoColumn}>
            <div className={styles.stack}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>Fila de producao</div>
                  <p className={styles.sectionSubtitle}>
                    Prioridade montada pelos pedidos reais ainda nao concluidos,
                    agrupando base e variacao que mais estao puxando a estampa.
                  </p>
                </div>
              </div>

              <div className={styles.list}>
                {productionQueue.length > 0 ? (
                  productionQueue.map((item) => (
                    <article key={item.title} className={styles.listItem}>
                      <div className={styles.listTitleRow}>
                        <div className={styles.listTitle}>{item.title}</div>
                        <span className={`${styles.pill} ${getPillClass(item.urgency)}`}>
                          {item.quantity} pecas
                        </span>
                      </div>
                      <p className={styles.listDetail}>{item.detail}</p>
                    </article>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    Sem fila critica no periodo filtrado.
                  </div>
                )}
              </div>
            </div>

            <div className={styles.stack}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>Recuperacao</div>
                  <p className={styles.sectionSubtitle}>
                    Lista de pedidos que merecem acao agora por pagamento,
                    expedicao ou margem muito pressionada.
                  </p>
                </div>
              </div>

              <div className={styles.list}>
                {recoveryItems.length > 0 ? (
                  recoveryItems.map((item) => (
                    <article key={`${item.title}-${item.detail}`} className={styles.listItem}>
                      <div className={styles.listTitleRow}>
                        <div className={styles.listTitle}>{item.title}</div>
                        <span className={`${styles.pill} ${getPillClass(item.urgency)}`}>
                          {item.urgency}
                        </span>
                      </div>
                      <p className={styles.listDetail}>{item.detail}</p>
                    </article>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    Nenhum pedido pedindo recuperacao agora.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </AppShell>
    );
  } catch (error) {
    const message =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : "Nao foi possivel carregar os pedidos reais da Nuvemshop.";

    return (
      <AppShell
        title="Pedidos e producao"
        subtitle="Tela real dos pedidos, fila de producao e recuperacao operacional."
        currentPath="/pedidos"
      >
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Erro ao carregar pedidos</div>
            <p className={styles.warningText}>{message}</p>
          </div>
        </section>
      </AppShell>
    );
  }
}
