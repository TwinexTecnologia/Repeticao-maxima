import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import {
  buildFinanceDashboard,
  buildMonthlyCashFlow,
  formatMoney,
  formatPercent,
} from "@/lib/financeiro/calculations";
import { loadFinanceConfig } from "@/lib/financeiro/repository";
import { loadMonthlyFinanceFlow, type FinanceFlowOrder } from "@/lib/financeiro/flow";
import {
  loadDebtModuleData,
  loadStockModuleData,
  type BaseStockItem,
  type InternalDebt,
} from "@/lib/operacoes/repository";

const FULL_UNIT_COST = 52;
const MINIMAL_UNIT_COST = 32;

export default async function Home() {
  const [{ config }, flow, stockModule, debtModule] = await Promise.all([
    loadFinanceConfig(),
    loadMonthlyFinanceFlow(),
    loadStockModuleData(),
    loadDebtModuleData(),
  ]);

  const financeDashboard = buildFinanceDashboard(config);
  const cashFlow = buildMonthlyCashFlow(config, flow);
  const snapshot = buildHomeSnapshot({
    stockItems: stockModule.items,
    debts: debtModule.debts,
    orders: flow.orders,
    cashFlow,
    financeDashboard,
    comboQuantity: config.comboQuantity,
  });

  return (
    <AppShell
      title="Centro da operacao"
      subtitle="Uma visao geral para sair da Dash sabendo quanto o estoque representa, quais cenarios mais apertam o caixa e quanto falta para pagar o que esta em aberto."
      currentPath="/"
    >
      <section className={styles.section}>
        <div className={styles.hero}>
          <div className={styles.heroCard}>
            <h2>O foco da Dash agora e diagnostico, nao repeticao.</h2>
            <p>
              A tela principal cruza estoque, dividas, pedidos do mes e regras
              de taxa para te responder tres coisas: quanto o lote vale hoje,
              como os cenarios de venda mexem no caixa e se o ritmo atual paga
              o que esta aberto.
            </p>
            <div className={styles.heroBulletList}>
              <div className={styles.heroBullet}>
                <span>01</span>
                <span>
                  Estoque atual: {snapshot.totalUnits} pecas, entre{" "}
                  {formatMoney(snapshot.stockValueMinimal)} e{" "}
                  {formatMoney(snapshot.stockValueFull)} em custo.
                </span>
              </div>
              <div className={styles.heroBullet}>
                <span>02</span>
                <span>
                  Dividas em aberto: {formatMoney(snapshot.openDebtTotal)}. No
                  pior cenario do combo, o lote gera{" "}
                  {formatMoney(snapshot.stockPotentialWorstNet)} liquidos.
                </span>
              </div>
              <div className={styles.heroBullet}>
                <span>03</span>
                <span>
                  Perfil do mes: {snapshot.customerProfileSummary}.
                </span>
              </div>
            </div>
          </div>

          <div className={styles.stack}>
            {snapshot.topMetrics.map((metric) => (
              <article key={metric.label} className={styles.metricCard}>
                <div className={styles.metricLabel}>{metric.label}</div>
                <div className={styles.metricValue}>{metric.value}</div>
                <div className={styles.metricHint}>{metric.detail}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Visao geral do momento</div>
            <p className={styles.sectionSubtitle}>
              Esses cards juntam saude do estoque, caixa do mes e peso das
              dividas sem repetir os detalhes das outras abas.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {snapshot.overviewMetrics.map((metric) => (
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
          <div>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Cenarios que mexem no caixa</div>
                <p className={styles.sectionSubtitle}>
                  A leitura abaixo abre todos os cenarios salvos hoje, com taxa,
                  liquido, lucro total e margem percentual para pedido unitario
                  e combo.
                </p>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Cenario</th>
                    <th>Qtd</th>
                    <th>Taxa</th>
                    <th>Liquido</th>
                    <th>Lucro full</th>
                    <th>Margem full</th>
                    <th>Lucro minimalista</th>
                    <th>Margem minimalista</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.scenarioRows.map((row) => (
                    <tr key={row.title}>
                      <td>{row.title}</td>
                      <td>{row.quantity}</td>
                      <td>{formatMoney(row.feeCost)}</td>
                      <td>{formatMoney(row.netReceived)}</td>
                      <td className={getProfitToneClass(row.fullMarginPercent)}>
                        {formatMoney(row.fullProfit)}
                      </td>
                      <td className={getProfitToneClass(row.fullMarginPercent)}>
                        {formatPercent(row.fullMarginPercent)}
                      </td>
                      <td className={getProfitToneClass(row.minimalMarginPercent)}>
                        {formatMoney(row.minimalProfit)}
                      </td>
                      <td className={getProfitToneClass(row.minimalMarginPercent)}>
                        {formatPercent(row.minimalMarginPercent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.stack}>
            <div className={styles.callout}>
              <h3>Leitura direta do lote</h3>
              <p>{snapshot.directDiagnosis}</p>
            </div>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Ticket medio do mes</div>
              <div className={styles.metricValue}>{snapshot.averageTicket}</div>
              <div className={styles.metricHint}>
                {snapshot.totalOrdersLabel} no mes atual da Nuvemshop.
              </div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Pior padrao do mes</div>
              <div className={styles.metricValue}>{snapshot.worstPatternShare}</div>
              <div className={styles.metricHint}>
                Pedidos em 3x ou mais com cupom.
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Saude da base compradora</div>
            <p className={styles.sectionSubtitle}>
              O objetivo aqui e entender se a base esta ajudando seu caixa ou se
              esta puxando demais para o pior cenario.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {snapshot.customerMetrics.map((metric) => (
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
          <div>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Quanto falta para pagar o aberto</div>
                <p className={styles.sectionSubtitle}>
                  Leitura pratica para saber quantos combos voce precisa girar
                  para cobrir as dividas atuais em cada cenario.
                </p>
              </div>
            </div>

            <div className={styles.list}>
              {snapshot.coverageRows.map((row) => (
                <article key={row.label} className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>{row.label}</div>
                    <span className={`${styles.pill} ${styles.pillLow}`}>
                      {row.combosNeeded} combos
                    </span>
                  </div>
                  <p className={styles.listDetail}>
                    {row.piecesNeeded} pecas para cobrir{" "}
                    {formatMoney(snapshot.openDebtTotal)} em aberto. Sobra
                    estimada de {formatMoney(row.surplusAfterCoverage)} apos
                    bater a meta de caixa desse bloco.
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.stack}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Alertas de agora</div>
                <p className={styles.sectionSubtitle}>
                  O que mais merece sua atencao neste momento.
                </p>
              </div>
            </div>

            <div className={styles.list}>
              {snapshot.alerts.map((alert) => {
                const pillClass =
                  alert.level === "alto"
                    ? styles.pillHigh
                    : alert.level === "medio"
                      ? styles.pillMedium
                      : styles.pillLow;

                return (
                  <article key={alert.title} className={styles.listItem}>
                    <div className={styles.listTitleRow}>
                      <div className={styles.listTitle}>{alert.title}</div>
                      <span className={`${styles.pill} ${pillClass}`}>
                        {alert.level}
                      </span>
                    </div>
                    <p className={styles.listDetail}>{alert.detail}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function buildHomeSnapshot(params: {
  stockItems: BaseStockItem[];
  debts: InternalDebt[];
  orders: FinanceFlowOrder[];
  cashFlow: ReturnType<typeof buildMonthlyCashFlow>;
  financeDashboard: ReturnType<typeof buildFinanceDashboard>;
  comboQuantity: number;
}) {
  const { stockItems, debts, orders, cashFlow, financeDashboard, comboQuantity } =
    params;

  const totalUnits = stockItems.reduce((sum, item) => sum + item.total, 0);
  const freeUnits = stockItems.reduce((sum, item) => sum + item.free, 0);
  const printedUnits = stockItems.reduce((sum, item) => sum + item.printed, 0);
  const reorderCount = stockItems.filter((item) => item.free <= item.reorderPoint).length;
  const stockValueMinimal = totalUnits * MINIMAL_UNIT_COST;
  const stockValueFull = totalUnits * FULL_UNIT_COST;
  const monthlySalesCount = orders.length;
  const monthlyGrossSales = orders.reduce((sum, order) => sum + order.total, 0);

  const openDebts = debts.filter(
    (debt) => debt.status !== "paga" && debt.status !== "cancelada",
  );
  const openDebtTotal = openDebts.reduce((sum, debt) => sum + debt.amount, 0);
  const dueSoonDebts = openDebts.filter((debt) => isWithinNextDays(debt.dueDate, 15));
  const dueSoonTotal = dueSoonDebts.reduce((sum, debt) => sum + debt.amount, 0);

  const comboBest = financeDashboard.offers.comboPixNoCoupon;
  const comboPixCoupon = financeDashboard.offers.comboPixCoupon;
  const comboWorst = financeDashboard.offers.comboCard3Coupon;
  const stockPotentialWorstNet = totalUnits * comboWorst.netReceivedPerPiece;
  const saldoAposAberto = stockPotentialWorstNet - openDebtTotal;

  const customerSummary = buildCustomerMetrics(orders);
  const overviewMetrics = [
    {
      label: "Estoque em custo minimalista",
      value: formatMoney(stockValueMinimal),
      detail: `Leitura usando ${formatMoney(MINIMAL_UNIT_COST)} por peca.`,
    },
    {
      label: "Estoque em custo full",
      value: formatMoney(stockValueFull),
      detail: `Leitura usando ${formatMoney(FULL_UNIT_COST)} por peca.`,
    },
    {
      label: "Dividas em aberto",
      value: formatMoney(openDebtTotal),
      detail:
        dueSoonTotal > 0
          ? `${formatMoney(dueSoonTotal)} vencem nos proximos 15 dias.`
          : "Sem pressao de vencimento nos proximos 15 dias.",
    },
    {
      label: "Lote no pior cenario",
      value: formatMoney(stockPotentialWorstNet),
      detail:
        saldoAposAberto >= 0
          ? `Ainda sobra ${formatMoney(saldoAposAberto)} depois do aberto.`
          : `Ainda faltam ${formatMoney(Math.abs(saldoAposAberto))} para zerar o aberto.`,
    },
  ];

  const topMetrics = [
    {
      label: "Vendas no mes",
      value: String(monthlySalesCount),
      detail:
        monthlySalesCount > 0
          ? "Pedidos capturados na Nuvemshop no mes atual."
          : "Nenhuma venda carregada para o mes atual.",
    },
    {
      label: "Valor vendido no mes",
      value: formatMoney(monthlyGrossSales),
      detail: "Faturamento bruto do mes antes das taxas.",
    },
    {
      label: "Saldo projetado do mes",
      value: formatMoney(cashFlow.saldoProjetado),
      detail:
        cashFlow.saldoProjetado >= 0
          ? "O fluxo atual fecha positivo."
          : "O fluxo do mes ainda fecha apertado.",
    },
    {
      label: "Pecas livres",
      value: String(freeUnits),
      detail: `${printedUnits} ja aparecem como estampadas na Nuvemshop.`,
    },
    {
      label: "Reposicoes em alerta",
      value: String(reorderCount),
      detail: "Linhas de estoque que ja pedem recompra ou atencao.",
    },
  ];

  const scenarioRows = financeDashboard.comparisonRows.map((scenario) =>
    toScenarioRow(scenario.title, scenario),
  );

  const coverageRows = [
    comboBest,
    comboPixCoupon,
    comboWorst,
  ].map((scenario) => {
    const combosNeeded =
      scenario.netReceived > 0 ? Math.ceil(openDebtTotal / scenario.netReceived) : 0;
    const piecesNeeded = combosNeeded * comboQuantity;
    const surplusAfterCoverage = combosNeeded * scenario.netReceived - openDebtTotal;

    return {
      label: scenario.title,
      combosNeeded,
      piecesNeeded,
      surplusAfterCoverage,
    };
  });

  const alerts = [
    {
      title: "Cobertura das dividas abertas",
      level: saldoAposAberto >= 0 ? ("baixo" as const) : ("alto" as const),
      detail:
        saldoAposAberto >= 0
          ? `Mesmo no pior cenario do combo, o lote cobre o aberto e sobra ${formatMoney(
              saldoAposAberto,
            )}.`
          : `Mesmo vendendo todo o lote no pior cenario, ainda faltam ${formatMoney(
              Math.abs(saldoAposAberto),
            )} para cobrir o aberto.`,
    },
    {
      title: "Perfil de pagamento da base",
      level:
        customerSummary.worstPatternShareValue >= 20
          ? ("alto" as const)
          : customerSummary.pixShareValue >= 40
            ? ("baixo" as const)
            : ("medio" as const),
      detail: customerSummary.summary,
    },
    {
      title: "Pressao de estoque",
      level: reorderCount >= 3 ? ("alto" as const) : reorderCount > 0 ? ("medio" as const) : ("baixo" as const),
      detail:
        reorderCount > 0
          ? `${reorderCount} linhas precisam de recompra antes de apertar a operacao.`
          : "As linhas atuais ainda nao encostaram no ponto de reposicao.",
    },
    {
      title: "Fluxo do mes",
      level: cashFlow.saldoProjetado >= 0 ? ("baixo" as const) : ("alto" as const),
      detail:
        cashFlow.saldoProjetado >= 0
          ? `Entradas liquidas do mes cobrem as saidas com folga de ${formatMoney(
              cashFlow.saldoProjetado,
            )}.`
          : `Com a leitura atual, o mes fecha com falta de ${formatMoney(
              Math.abs(cashFlow.saldoProjetado),
            )}.`,
    },
  ];

  return {
    totalUnits,
    stockValueMinimal,
    stockValueFull,
    stockPotentialWorstNet,
    openDebtTotal,
    topMetrics,
    overviewMetrics,
    scenarioRows,
    coverageRows,
    alerts,
    customerMetrics: customerSummary.metrics,
    customerProfileSummary: customerSummary.summary,
    directDiagnosis:
      openDebtTotal <= 0
        ? `Hoje a operacao nao tem dividas abertas. O foco principal passa a ser proteger margem e reposicao, porque o lote atual representa ${formatMoney(
            stockValueFull,
          )} se todo ele virar full.`
        : `Se voce olhar o lote atual como caixa futuro, ele representa entre ${formatMoney(
            stockValueMinimal,
          )} e ${formatMoney(
            stockValueFull,
          )} em custo e gera ${formatMoney(
            stockPotentialWorstNet,
          )} liquidos no pior cenario do combo. Contra ${formatMoney(
            openDebtTotal,
          )} em aberto, a leitura de hoje e ${
            saldoAposAberto >= 0 ? "de folga" : "de aperto"
          }.`,
    averageTicket: customerSummary.averageTicket,
    totalOrdersLabel:
      orders.length > 0
        ? `${orders.length} pedidos e ${customerSummary.uniqueCustomers} clientes unicos`
        : "Nenhum pedido carregado",
    worstPatternShare: customerSummary.worstPatternShare,
  };
}

function toScenarioRow(
  title: string,
  scenario: ReturnType<typeof buildFinanceDashboard>["offers"][keyof ReturnType<
    typeof buildFinanceDashboard
  >["offers"]],
) {
  const fullProfit = scenario.netReceived - FULL_UNIT_COST * scenario.quantity;
  const minimalProfit =
    scenario.netReceived - MINIMAL_UNIT_COST * scenario.quantity;
  const fullMarginPercent =
    scenario.discountedRevenue > 0
      ? (fullProfit / scenario.discountedRevenue) * 100
      : 0;
  const minimalMarginPercent =
    scenario.discountedRevenue > 0
      ? (minimalProfit / scenario.discountedRevenue) * 100
      : 0;

  return {
    title,
    quantity: scenario.quantity,
    feeCost: scenario.feeCost,
    netReceived: scenario.netReceived,
    fullProfit,
    fullMarginPercent,
    minimalProfit,
    minimalMarginPercent,
  };
}

function buildCustomerMetrics(orders: FinanceFlowOrder[]) {
  const totalOrders = orders.length;

  if (totalOrders === 0) {
    return {
      metrics: [
        {
          label: "Pedidos no Pix",
          value: "-",
          detail: "Sem pedidos no mes para leitura.",
        },
        {
          label: "Pedidos a vista ou 1x",
          value: "-",
          detail: "Sem pedidos no mes para leitura.",
        },
        {
          label: "Pedidos com cupom",
          value: "-",
          detail: "Sem pedidos no mes para leitura.",
        },
        {
          label: "Ticket medio",
          value: "-",
          detail: "Sem pedidos no mes para leitura.",
        },
      ],
      summary: "Ainda nao ha pedidos no mes atual para ler o perfil da base.",
      averageTicket: "-",
      uniqueCustomers: 0,
      pixShare: "-",
      pixShareValue: 0,
      worstPatternShare: "-",
      worstPatternShareValue: 0,
    };
  }

  const pixCount = orders.filter((order) => isPixOrder(order)).length;
  const oneShotCount = orders.filter(
    (order) => isPixOrder(order) || order.installments <= 1,
  ).length;
  const couponCount = orders.filter((order) => order.hasCoupon).length;
  const worstPatternCount = orders.filter(
    (order) => order.installments >= 3 && order.hasCoupon,
  ).length;
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const averageTicket = totalRevenue / totalOrders;
  const uniqueCustomers = new Set(orders.map((order) => order.customerKey)).size;
  const pixShareValue = (pixCount / totalOrders) * 100;
  const worstPatternShareValue = (worstPatternCount / totalOrders) * 100;
  const pixShare = formatPercent(pixShareValue);
  const oneShotShare = formatPercent((oneShotCount / totalOrders) * 100);
  const couponShare = formatPercent((couponCount / totalOrders) * 100);
  const worstPatternShare = formatPercent(worstPatternShareValue);

  return {
    metrics: [
      {
        label: "Pedidos no Pix",
        value: pixShare,
        detail: `${pixCount} de ${totalOrders} pedidos vieram no Pix.`,
      },
      {
        label: "Pedidos a vista ou 1x",
        value: oneShotShare,
        detail: "Mostra quanto da base evita alongar recebimento.",
      },
      {
        label: "Pedidos com cupom",
        value: couponShare,
        detail: `${couponCount} pedidos chegaram com desconto aplicado.`,
      },
      {
        label: "Ticket medio",
        value: formatMoney(averageTicket),
        detail: `${uniqueCustomers} clientes unicos no mes atual.`,
      },
    ],
    summary: `${pixShare} da base veio no Pix, ${oneShotShare} pagou a vista ou em 1x e ${worstPatternShare} caiu no pior padrao de 3x ou mais com cupom.`,
    averageTicket: formatMoney(averageTicket),
    uniqueCustomers,
    pixShare,
    pixShareValue,
    worstPatternShare,
    worstPatternShareValue,
  };
}

function isPixOrder(order: FinanceFlowOrder) {
  const haystack = `${order.paymentMethod} ${order.gateway} ${order.paymentStatus}`.toLowerCase();
  return haystack.includes("pix");
}

function isWithinNextDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);

  return date >= today && date <= limit;
}

function getProfitToneClass(marginPercent: number) {
  if (marginPercent >= 30) {
    return styles.profitStrong;
  }

  if (marginPercent >= 20) {
    return styles.profitHealthy;
  }

  if (marginPercent >= 10) {
    return styles.profitWarning;
  }

  if (marginPercent >= 0) {
    return styles.profitCritical;
  }

  return styles.profitNegative;
}
