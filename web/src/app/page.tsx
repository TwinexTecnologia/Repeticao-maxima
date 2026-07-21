import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { formatMoney, formatPercent } from "@/lib/financeiro/calculations";
import { loadMonthlyFinanceFlow, type FinanceFlowOrder } from "@/lib/financeiro/flow";
import { loadFinanceConfig } from "@/lib/financeiro/repository";
import {
  loadCompanyDiscountModuleData,
  type CompanyCartDiscountRule,
} from "@/lib/empresa/repository";
import { loadManualFinanceModuleData } from "@/lib/operacoes/repository";

const FULL_UNIT_COST = 52;
const MINIMAL_UNIT_COST = 32;
const DEFAULT_BANK_BALANCE = 331.34;

type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
};

type DashboardListRow = {
  title: string;
  value: string;
  detail: string;
};

type ComboDisplayRow = {
  title: string;
  priceLabel: string;
  detail: string;
};

type DashboardScenarioRow = {
  title: string;
  quantity: number;
  mixLabel: string;
  discountedRevenue: number;
  feeCost: number;
  feePercentOnRevenue: number;
  costTotal: number;
  netReceived: number;
  netProfit: number;
  marginPercent: number;
};

type DashboardComboDefinition = {
  label: string;
  quantity: number;
  fullCount: number;
  minimalCount: number;
  basePrice: number;
  mixLabel: string;
};

type DashboardStateRow = {
  stateCode: string;
  stateName: string;
  customerCount: number;
  orderCount: number;
  piecesSold: number;
  sharePercent: number;
  intensity: number;
};

type BrazilMapPoint = {
  stateCode: string;
  stateName: string;
  x: number;
  y: number;
  customerCount: number;
  intensity: number;
};

const BRAZIL_STATE_POSITIONS: Record<
  string,
  {
    name: string;
    x: number;
    y: number;
  }
> = {
  AC: { name: "Acre", x: 112, y: 356 },
  AL: { name: "Alagoas", x: 718, y: 296 },
  AP: { name: "Amapa", x: 452, y: 100 },
  AM: { name: "Amazonas", x: 232, y: 210 },
  BA: { name: "Bahia", x: 674, y: 370 },
  CE: { name: "Ceara", x: 692, y: 214 },
  DF: { name: "Distrito Federal", x: 532, y: 430 },
  ES: { name: "Espirito Santo", x: 698, y: 484 },
  GO: { name: "Goias", x: 504, y: 426 },
  MA: { name: "Maranhao", x: 572, y: 246 },
  MT: { name: "Mato Grosso", x: 380, y: 372 },
  MS: { name: "Mato Grosso do Sul", x: 390, y: 510 },
  MG: { name: "Minas Gerais", x: 616, y: 452 },
  PA: { name: "Para", x: 424, y: 202 },
  PB: { name: "Paraiba", x: 762, y: 224 },
  PR: { name: "Parana", x: 544, y: 640 },
  PE: { name: "Pernambuco", x: 738, y: 252 },
  PI: { name: "Piaui", x: 622, y: 244 },
  RJ: { name: "Rio de Janeiro", x: 692, y: 532 },
  RN: { name: "Rio Grande do Norte", x: 784, y: 192 },
  RS: { name: "Rio Grande do Sul", x: 522, y: 792 },
  RO: { name: "Rondonia", x: 182, y: 352 },
  RR: { name: "Roraima", x: 256, y: 82 },
  SC: { name: "Santa Catarina", x: 556, y: 716 },
  SP: { name: "Sao Paulo", x: 604, y: 566 },
  SE: { name: "Sergipe", x: 744, y: 326 },
  TO: { name: "Tocantins", x: 486, y: 304 },
};

const BRAZIL_SILHOUETTE_PATH = `
  M126 367
  L111 334
  L120 292
  L146 252
  L179 223
  L206 179
  L246 132
  L293 102
  L338 110
  L389 95
  L434 110
  L484 99
  L540 130
  L595 161
  L653 179
  L704 171
  L760 202
  L790 238
  L804 282
  L793 317
  L764 347
  L757 393
  L724 456
  L709 528
  L681 563
  L650 594
  L623 650
  L610 719
  L585 792
  L543 810
  L511 793
  L498 726
  L486 674
  L455 633
  L423 589
  L399 555
  L367 535
  L334 492
  L280 468
  L248 437
  L201 414
  L166 392
  Z
`;

export default async function Home() {
  const currentMonth = getCurrentMonthReference();
  const [{ config }, flow, companyModule, manualFinance] = await Promise.all([
    loadFinanceConfig(),
    loadMonthlyFinanceFlow(),
    loadCompanyDiscountModuleData(),
    loadManualFinanceModuleData(currentMonth),
  ]);

  const snapshot = buildHomeSnapshot({
    orders: flow.orders,
    comboRules: companyModule.rules,
    unitPrice: config.unitPrice,
    config,
    openingBalance: manualFinance.balance?.openingBalance ?? DEFAULT_BANK_BALANCE,
    manualEntries: manualFinance.movements
      .filter((movement) => movement.type === "entrada")
      .reduce((sum, movement) => sum + movement.amount, 0),
    manualExpenses: manualFinance.movements
      .filter((movement) => movement.type === "saida")
      .reduce((sum, movement) => sum + movement.amount, 0),
    persistenceMessage: manualFinance.persistence.message,
    persistenceEnabled: manualFinance.persistence.enabled,
  });

  return (
    <AppShell
      title="Dashboard"
      subtitle="Uma leitura limpa do mes com caixa manual, vendas da Nuvem Shop e combos ativos."
      currentPath="/"
    >
      <section className={styles.section}>
        <div className={styles.metricGrid}>
          {snapshot.topMetrics.map((metric) => (
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
            <div className={snapshot.persistenceEnabled ? styles.callout : styles.warningPanel}>
              <h3>Caixa do mes</h3>
              <p>{snapshot.cashSummary}</p>
            </div>

            <div className={styles.callout}>
              <h3>Nuvem Shop</h3>
              <p>{snapshot.salesSummary}</p>
            </div>

            <div className={styles.callout}>
              <h3>Base da leitura</h3>
              <p>{snapshot.persistenceMessage}</p>
            </div>
          </div>

          <div>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Resumo da Nuvem Shop</div>
                <p className={styles.sectionSubtitle}>
                  So o essencial para entender o mes sem poluicao visual.
                </p>
              </div>
            </div>

            <div className={styles.list}>
              {snapshot.salesRows.map((row) => (
                <article key={row.title} className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>{row.title}</div>
                    <strong>{row.value}</strong>
                  </div>
                  <p className={styles.listDetail}>{row.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Clientes por estado</div>
            <p className={styles.sectionSubtitle}>
              Leitura dos clientes unicos atendidos no mes atual, com mapa por UF e resumo dos
              estados mais fortes.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chip}>Clientes: {String(snapshot.uniqueCustomers)}</span>
            <span className={styles.chip}>Estados: {String(snapshot.statesServed)}</span>
            <span className={styles.chip}>Sem UF: {String(snapshot.customersWithoutState)}</span>
          </div>
        </div>

        <div className={styles.geoGrid}>
          <article className={styles.geoCard}>
            <div className={styles.geoCardTop}>
              <div>
                <div className={styles.listTitle}>Mapa de clientes</div>
                <p className={styles.listDetail}>{snapshot.stateSummary}</p>
              </div>
              <div className={styles.geoLegend}>
                <span className={styles.geoLegendDotLow} />
                <span>Menor volume</span>
                <span className={styles.geoLegendDotHigh} />
                <span>Maior volume</span>
              </div>
            </div>

            <BrazilCustomerMap rows={snapshot.customerStateRows} />
          </article>

          <div className={styles.list}>
            {snapshot.customerStateRows.length > 0 ? (
              snapshot.customerStateRows.slice(0, 8).map((row) => (
                <article key={row.stateCode} className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>
                      {row.stateCode} · {row.stateName}
                    </div>
                    <strong>{String(row.customerCount)} clientes</strong>
                  </div>
                  <p className={styles.listDetail}>
                    {String(row.orderCount)} pedidos, {String(row.piecesSold)} pecas e{" "}
                    {formatPercent(row.sharePercent)} da base de clientes do mes.
                  </p>
                </article>
              ))
            ) : (
              <article className={styles.listItem}>
                <div className={styles.listTitle}>Sem UF identificada</div>
                <p className={styles.listDetail}>
                  Os pedidos do mes ainda nao trouxeram estado suficiente para montar o mapa.
                </p>
              </article>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Combos</div>
            <p className={styles.sectionSubtitle}>
              Mantive uma leitura enxuta dos combos ativos e do que eles deixam no melhor e no pior cenario.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {snapshot.comboMetrics.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              <div className={styles.metricHint}>{metric.detail}</div>
            </article>
          ))}
        </div>

        <div className={styles.list}>
          {snapshot.comboRows.map((row) => (
            <article key={row.title} className={styles.listItem}>
              <div className={styles.listTitleRow}>
                <div className={styles.listTitle}>{row.title}</div>
                <strong>{row.priceLabel}</strong>
              </div>
              <p className={styles.listDetail}>{row.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function buildHomeSnapshot(params: {
  orders: FinanceFlowOrder[];
  comboRules: CompanyCartDiscountRule[];
  unitPrice: number;
  config: Awaited<ReturnType<typeof loadFinanceConfig>>["config"];
  openingBalance: number;
  manualEntries: number;
  manualExpenses: number;
  persistenceMessage: string;
  persistenceEnabled: boolean;
}) {
  const {
    orders,
    comboRules,
    unitPrice,
    config,
    openingBalance,
    manualEntries,
    manualExpenses,
    persistenceMessage,
    persistenceEnabled,
  } = params;

  const monthlyOrders = orders.length;
  const monthlyGrossSales = orders.reduce((sum, order) => sum + order.total, 0);
  const averageTicketValue = monthlyOrders > 0 ? monthlyGrossSales / monthlyOrders : 0;
  const uniqueCustomers = new Set(orders.map((order) => order.customerKey).filter(Boolean)).size;
  const piecesSold = orders.reduce((sum, order) => sum + order.itemQuantity, 0);
  const couponOrders = orders.filter((order) => order.hasCoupon).length;
  const pixOrders = orders.filter((order) => isPixOrder(order)).length;
  const currentBalance = openingBalance + manualEntries - manualExpenses;
  const stateData = buildCustomerStateData(orders, uniqueCustomers);
  const statesServed = stateData.rows.length;
  const leadState = stateData.rows[0] ?? null;

  const comboDefinitions = buildRealComboDefinitions(comboRules, unitPrice);
  const comboScenarios = comboDefinitions.map((definition) => {
    const bestScenario = buildComboMixScenarioRow({
      config,
      title: definition.label,
      quantity: definition.quantity,
      basePrice: definition.basePrice,
      fullCount: definition.fullCount,
      minimalCount: definition.minimalCount,
      feePercent: config.nuvemPixPercent,
      fixedFee: config.nuvemPixFixed,
      discountPercent: 0,
      mixLabel: definition.mixLabel,
    });
    const tightScenario = buildComboMixScenarioRow({
      config,
      title: definition.label,
      quantity: definition.quantity,
      basePrice: definition.basePrice,
      fullCount: definition.fullCount,
      minimalCount: definition.minimalCount,
      feePercent: config.nuvemCard2Percent,
      fixedFee: config.nuvemCard2Fixed,
      discountPercent: config.couponPercent,
      mixLabel: definition.mixLabel,
    });

    return {
      definition,
      bestScenario,
      tightScenario,
    };
  });

  const sortedByBestProfit = comboScenarios
    .slice()
    .sort((left, right) => right.bestScenario.netProfit - left.bestScenario.netProfit);
  const sortedByTightMargin = comboScenarios
    .slice()
    .sort((left, right) => left.tightScenario.marginPercent - right.tightScenario.marginPercent);
  const bestCombo = sortedByBestProfit[0] ?? null;
  const tightestCombo = sortedByTightMargin[0] ?? null;

  return {
    topMetrics: buildTopMetrics({
      manualEntries,
      manualExpenses,
      openingBalance,
      currentBalance,
      monthlyOrders,
      monthlyGrossSales,
      uniqueCustomers,
      piecesSold,
      statesServed,
    }),
    cashSummary:
      manualEntries > 0 || manualExpenses > 0
        ? `O caixa parte de ${formatMoney(openingBalance)}, recebeu ${formatMoney(manualEntries)}, saiu ${formatMoney(manualExpenses)} e hoje esta em ${formatMoney(currentBalance)}.`
        : `Ainda nao ha movimentacoes manuais neste mes. O saldo base considerado agora e ${formatMoney(openingBalance)}.`,
    salesSummary:
      monthlyOrders > 0
        ? `${monthlyOrders} pedidos puxaram ${formatMoney(monthlyGrossSales)} de faturamento bruto na Nuvem Shop, com ${String(uniqueCustomers)} clientes unicos e ${String(piecesSold)} pecas vendidas.`
        : "Ainda nao ha vendas carregadas da Nuvem Shop para o mes atual.",
    persistenceMessage,
    persistenceEnabled,
    salesRows: buildSalesRows({
      monthlyOrders,
      monthlyGrossSales,
      uniqueCustomers,
      piecesSold,
      averageTicketValue,
      couponOrders,
      pixOrders,
    }),
    uniqueCustomers,
    piecesSold,
    statesServed,
    customersWithoutState: stateData.customersWithoutState,
    customerStateRows: stateData.rows,
    stateSummary: leadState
      ? `${leadState.stateCode} lidera o mes com ${String(leadState.customerCount)} clientes unicos.`
      : "Assim que os pedidos trouxerem UF, o mapa mostra a concentracao de clientes por estado.",
    comboMetrics: buildComboMetrics(bestCombo, tightestCombo),
    comboRows: buildComboRows(comboScenarios),
  };
}

function buildTopMetrics(params: {
  manualEntries: number;
  manualExpenses: number;
  openingBalance: number;
  currentBalance: number;
  monthlyOrders: number;
  monthlyGrossSales: number;
  uniqueCustomers: number;
  piecesSold: number;
  statesServed: number;
}) {
  return [
    {
      label: "Entrada",
      value: formatMoney(params.manualEntries),
      detail: "Entradas manuais registradas no banco neste mes.",
    },
    {
      label: "Saida",
      value: formatMoney(params.manualExpenses),
      detail: "Saidas manuais registradas no banco neste mes.",
    },
    {
      label: "Balanco",
      value: formatMoney(params.currentBalance),
      detail: `Saldo inicial ${formatMoney(params.openingBalance)} mais entradas menos saidas.`,
    },
    {
      label: "Vendas Nuvem Shop",
      value: String(params.monthlyOrders),
      detail:
        params.monthlyOrders > 0 ? "Pedidos capturados no mes atual." : "Sem pedidos no mes atual.",
    },
    {
      label: "Clientes",
      value: String(params.uniqueCustomers),
      detail: "Clientes unicos com compra registrada no mes.",
    },
    {
      label: "Pecas vendidas",
      value: String(params.piecesSold),
      detail: "Soma das quantidades vendidas nos pedidos do mes.",
    },
    {
      label: "Faturamento Nuvem Shop",
      value: formatMoney(params.monthlyGrossSales),
      detail: "Total bruto vendido na Nuvem Shop neste mes.",
    },
    {
      label: "Estados atendidos",
      value: String(params.statesServed),
      detail:
        params.statesServed > 0
          ? "UFs com clientes identificados no mes."
          : "Ainda sem UF identificada nos pedidos do mes.",
    },
  ] satisfies DashboardMetric[];
}

function buildSalesRows(params: {
  monthlyOrders: number;
  monthlyGrossSales: number;
  uniqueCustomers: number;
  piecesSold: number;
  averageTicketValue: number;
  couponOrders: number;
  pixOrders: number;
}) {
  return [
    {
      title: "Pedidos no mes",
      value: String(params.monthlyOrders),
      detail: "Quantidade total de pedidos da Nuvem Shop.",
    },
    {
      title: "Faturamento bruto",
      value: formatMoney(params.monthlyGrossSales),
      detail: "Antes de taxas e ajustes financeiros.",
    },
    {
      title: "Clientes unicos",
      value: String(params.uniqueCustomers),
      detail: "Base de clientes distintos atendidos no mes.",
    },
    {
      title: "Pecas vendidas",
      value: String(params.piecesSold),
      detail: "Quantidade total de pecas somadas nos pedidos.",
    },
    {
      title: "Ticket medio",
      value: params.monthlyOrders > 0 ? formatMoney(params.averageTicketValue) : "-",
      detail: "Media por pedido neste mes.",
    },
    {
      title: "Pedidos com cupom",
      value:
        params.monthlyOrders > 0
          ? formatPercent((params.couponOrders / params.monthlyOrders) * 100)
          : "-",
      detail: `${params.couponOrders} pedidos usaram cupom.`,
    },
    {
      title: "Pedidos no Pix",
      value:
        params.monthlyOrders > 0
          ? formatPercent((params.pixOrders / params.monthlyOrders) * 100)
          : "-",
      detail: `${params.pixOrders} pedidos vieram no Pix.`,
    },
  ] satisfies DashboardListRow[];
}

function buildCustomerStateData(orders: FinanceFlowOrder[], totalCustomers: number) {
  const distribution = new Map<
    string,
    {
      customerKeys: Set<string>;
      orderCount: number;
      piecesSold: number;
    }
  >();
  const customersWithState = new Set<string>();
  const customersWithoutState = new Set<string>();

  for (const order of orders) {
    if (order.destinationState) {
      const current = distribution.get(order.destinationState) ?? {
        customerKeys: new Set<string>(),
        orderCount: 0,
        piecesSold: 0,
      };

      current.customerKeys.add(order.customerKey);
      current.orderCount += 1;
      current.piecesSold += order.itemQuantity;
      distribution.set(order.destinationState, current);
      customersWithState.add(order.customerKey);
      continue;
    }

    customersWithoutState.add(order.customerKey);
  }

  const rows = Array.from(distribution.entries())
    .map(([stateCode, data]) => ({
      stateCode,
      stateName: BRAZIL_STATE_POSITIONS[stateCode]?.name || stateCode,
      customerCount: data.customerKeys.size,
      orderCount: data.orderCount,
      piecesSold: data.piecesSold,
      sharePercent: totalCustomers > 0 ? (data.customerKeys.size / totalCustomers) * 100 : 0,
      intensity: 0,
    }))
    .sort(
      (left, right) =>
        right.customerCount - left.customerCount ||
        right.orderCount - left.orderCount ||
        left.stateCode.localeCompare(right.stateCode),
    );

  const maxCustomers = rows[0]?.customerCount ?? 0;

  return {
    rows: rows.map((row) => ({
      ...row,
      intensity: maxCustomers > 0 ? row.customerCount / maxCustomers : 0,
    })),
    customersWithoutState: Array.from(customersWithoutState).filter(
      (customerKey) => !customersWithState.has(customerKey),
    ).length,
  };
}

function buildBrazilMapPoints(rows: DashboardStateRow[]) {
  const rowMap = new Map(rows.map((row) => [row.stateCode, row]));

  return Object.entries(BRAZIL_STATE_POSITIONS).map(([stateCode, metadata]) => {
    const row = rowMap.get(stateCode);

    return {
      stateCode,
      stateName: metadata.name,
      x: metadata.x,
      y: metadata.y,
      customerCount: row?.customerCount ?? 0,
      intensity: row?.intensity ?? 0,
    } satisfies BrazilMapPoint;
  });
}

function getMapPointRadius(point: BrazilMapPoint) {
  return point.customerCount > 0 ? 17 + point.intensity * 17 : 12;
}

function getMapPointFill(point: BrazilMapPoint) {
  if (point.customerCount <= 0) {
    return "rgba(123, 44, 191, 0.10)";
  }

  if (point.intensity >= 0.75) {
    return "#7b2cbf";
  }

  if (point.intensity >= 0.45) {
    return "#a855f7";
  }

  return "#d8b4fe";
}

function BrazilCustomerMap({ rows }: { rows: DashboardStateRow[] }) {
  const points = buildBrazilMapPoints(rows);

  return (
    <div className={styles.geoMapWrap}>
      <svg viewBox="0 0 900 850" className={styles.geoMap} role="img" aria-label="Mapa do Brasil">
        <path
          d={BRAZIL_SILHOUETTE_PATH}
          className={styles.geoMapSilhouette}
          transform="translate(0 0)"
        />
        {points.map((point) => (
          <g key={point.stateCode} transform={`translate(${point.x} ${point.y})`}>
            <title>{`${point.stateName}: ${String(point.customerCount)} clientes`}</title>
            <circle
              r={getMapPointRadius(point)}
              fill={getMapPointFill(point)}
              stroke={point.customerCount > 0 ? "#5b1795" : "rgba(123, 44, 191, 0.16)"}
              strokeWidth={point.customerCount > 0 ? 2.5 : 1.5}
            />
            <text className={styles.geoMapStateCode} textAnchor="middle" y="-2">
              {point.stateCode}
            </text>
            <text className={styles.geoMapStateCount} textAnchor="middle" y="14">
              {String(point.customerCount)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function buildComboMetrics(
  bestCombo: {
    definition: DashboardComboDefinition;
    bestScenario: DashboardScenarioRow;
    tightScenario: DashboardScenarioRow;
  } | null,
  tightestCombo: {
    definition: DashboardComboDefinition;
    bestScenario: DashboardScenarioRow;
    tightScenario: DashboardScenarioRow;
  } | null,
) {
  return [
    {
      label: "Melhor combo",
      value: bestCombo ? bestCombo.definition.label : "-",
      detail: bestCombo
        ? `${bestCombo.definition.mixLabel} deixam ${formatMoney(bestCombo.bestScenario.netProfit)} de lucro no Pix.`
        : "Nenhum combo ativo agora.",
    },
    {
      label: "Lucro do melhor combo",
      value: bestCombo ? formatMoney(bestCombo.bestScenario.netProfit) : "-",
      detail: "Leitura do melhor cenario: Pix sem cupom.",
    },
    {
      label: "Combo mais apertado",
      value: tightestCombo ? tightestCombo.definition.label : "-",
      detail: tightestCombo
        ? `${formatPercent(tightestCombo.tightScenario.marginPercent)} de margem em 2x com cupom.`
        : "Sem leitura de combo apertado.",
    },
    {
      label: "Lucro no pior cenario",
      value: tightestCombo ? formatMoney(tightestCombo.tightScenario.netProfit) : "-",
      detail: "Leitura do pior cenario: cartao 2x com cupom.",
    },
  ] satisfies DashboardMetric[];
}

function buildComboRows(
  rows: Array<{
    definition: DashboardComboDefinition;
    bestScenario: DashboardScenarioRow;
    tightScenario: DashboardScenarioRow;
  }>,
) {
  if (rows.length === 0) {
    return [
      {
        title: "Sem combos ativos",
        priceLabel: "-",
        detail: "Ative uma regra de combo para a dashboard mostrar essa leitura simplificada.",
      },
    ] satisfies ComboDisplayRow[];
  }

  return rows.map((item) => ({
    title: item.definition.label,
    priceLabel: formatMoney(item.definition.basePrice),
    detail: `${item.definition.mixLabel}. No Pix sem cupom deixa ${formatMoney(item.bestScenario.netProfit)} de lucro. Em 2x com cupom cai para ${formatMoney(item.tightScenario.netProfit)} com margem de ${formatPercent(item.tightScenario.marginPercent)}.`,
  })) satisfies ComboDisplayRow[];
}

function buildComboMixScenarioRow(params: {
  config: Awaited<ReturnType<typeof loadFinanceConfig>>["config"];
  title: string;
  quantity: number;
  basePrice: number;
  fullCount: number;
  minimalCount: number;
  feePercent: number;
  fixedFee: number;
  discountPercent: number;
  mixLabel: string;
}) {
  const discountedRevenue = params.basePrice * (1 - params.discountPercent / 100);
  const feeCost = discountedRevenue * (params.feePercent / 100) + params.fixedFee;
  const feePercentOnRevenue =
    discountedRevenue > 0 ? (feeCost / discountedRevenue) * 100 : 0;
  const netReceived = Math.max(discountedRevenue - feeCost, 0);
  const costTotal =
    params.fullCount * FULL_UNIT_COST +
    params.minimalCount * MINIMAL_UNIT_COST +
    params.config.freightSubsidy;
  const netProfit = netReceived - costTotal;
  const marginPercent =
    discountedRevenue > 0 ? (netProfit / discountedRevenue) * 100 : 0;

  return {
    title: params.title,
    quantity: params.quantity,
    mixLabel: params.mixLabel,
    discountedRevenue,
    feeCost,
    feePercentOnRevenue,
    costTotal,
    netReceived,
    netProfit,
    marginPercent,
  } satisfies DashboardScenarioRow;
}

function buildRealComboDefinitions(
  rules: CompanyCartDiscountRule[],
  unitPrice: number,
) {
  const activeRules = rules.filter((rule) => rule.active);
  const preferred = [
    ["COMBO PREMIUM", "premium"],
    ["COMBO SMART", "smart"],
    ["COMBO ENTRY", "entry"],
  ] as const;
  const selected = preferred
    .map(([, keyword]) =>
      activeRules.find((rule) =>
        normalizeText(`${rule.title} ${rule.categoryName}`).includes(keyword),
      ),
    )
    .filter((rule): rule is CompanyCartDiscountRule => Boolean(rule));

  const sourceRules = selected.length > 0 ? selected : activeRules;

  return sourceRules
    .map((rule) => {
      const mix = inferRuleMix(rule);
      if (!mix || mix.quantity <= 0) {
        return null;
      }

      return {
        label: rule.title.trim() || "Combo ativo",
        quantity: mix.quantity,
        fullCount: mix.fullCount,
        minimalCount: mix.minimalCount,
        basePrice: Math.max(unitPrice * mix.quantity - rule.discountAmount, 0),
        mixLabel: mix.mixLabel,
      };
    })
    .filter((item): item is DashboardComboDefinition => Boolean(item));
}

function inferRuleMix(rule: CompanyCartDiscountRule) {
  const text = normalizeText(
    `${rule.title} ${rule.categoryName} ${rule.categoryNames.join(" ")} ${rule.notes}`,
  );

  if (text.includes("smart")) {
    return {
      fullCount: 2,
      minimalCount: 1,
      quantity: 3,
      mixLabel: buildMixLabel(2, 1),
    };
  }

  if (text.includes("entry") || text.includes("minimalista")) {
    const quantity = Math.max(rule.minimumQuantity, 3);
    return {
      fullCount: 0,
      minimalCount: quantity,
      quantity,
      mixLabel: buildMixLabel(0, quantity),
    };
  }

  if (text.includes("premium")) {
    const quantity = Math.max(rule.minimumQuantity, 3);
    return {
      fullCount: quantity,
      minimalCount: 0,
      quantity,
      mixLabel: buildMixLabel(quantity, 0),
    };
  }

  const groups = rule.comboGroups.map((group) => ({
    ...group,
    normalized: normalizeText(`${group.categoryName} ${group.productNames.join(" ")}`),
  }));
  const fullCount = groups
    .filter((group) => group.normalized.includes("full"))
    .reduce((sum, group) => sum + group.minimumQuantity, 0);
  const minimalCount = groups
    .filter((group) => group.normalized.includes("minimal"))
    .reduce((sum, group) => sum + group.minimumQuantity, 0);
  const groupedQuantity = groups.reduce((sum, group) => sum + group.minimumQuantity, 0);

  if (groupedQuantity > 0 && fullCount + minimalCount > 0) {
    return {
      fullCount,
      minimalCount,
      quantity: groupedQuantity,
      mixLabel: buildMixLabel(fullCount, minimalCount),
    };
  }

  return null;
}

function buildMixLabel(fullCount: number, minimalCount: number) {
  const parts = [];

  if (fullCount > 0) {
    parts.push(`${fullCount} full`);
  }

  if (minimalCount > 0) {
    parts.push(`${minimalCount} minimalista${minimalCount > 1 ? "s" : ""}`);
  }

  return parts.join(" + ");
}

function isPixOrder(order: FinanceFlowOrder) {
  return normalizeText(order.paymentMethod).includes("pix");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getCurrentMonthReference() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
