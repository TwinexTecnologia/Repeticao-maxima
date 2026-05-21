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
  loadCompanyDiscountModuleData,
  type CompanyCartDiscountRule,
} from "@/lib/empresa/repository";
import {
  loadDebtModuleData,
  loadStockModuleData,
  type BaseStockItem,
  type InternalDebt,
} from "@/lib/operacoes/repository";

const FULL_UNIT_COST = 52;
const MINIMAL_UNIT_COST = 32;

export default async function Home() {
  const [{ config }, flow, stockModule, debtModule, companyModule] = await Promise.all([
    loadFinanceConfig(),
    loadMonthlyFinanceFlow(),
    loadStockModuleData(),
    loadDebtModuleData(),
    loadCompanyDiscountModuleData(),
  ]);

  const financeDashboard = buildFinanceDashboard(config);
  const cashFlow = buildMonthlyCashFlow(config, flow);
  const snapshot = buildHomeSnapshot({
    stockItems: stockModule.items,
    debts: debtModule.debts,
    orders: flow.orders,
    cashFlow,
    financeDashboard,
    comboRules: companyModule.rules,
    unitPrice: config.unitPrice,
    config,
  });

  return (
    <AppShell
      title="Centro da operacao"
      subtitle="Uma leitura estrategica do mes para entender saude da loja, cobertura das dividas e onde o estoque pede recompra ou remanejamento."
      currentPath="/"
    >
      <section className={styles.section}>
        <div className={styles.hero}>
          <div className={styles.heroCard}>
            <h2>O que esta acontecendo na loja neste mes.</h2>
            <p>
              A Dash agora cruza pedidos do mes, dividas abertas, custos e
              cobertura do estoque para te responder tres coisas: se o caixa
              aguenta os proximos vencimentos, qual cenario comercial aperta a
              margem e quais bases precisam de pedido ou remanejamento.
            </p>
            <div className={styles.heroBulletList}>
              {snapshot.heroBullets.map((bullet, index) => (
                <div key={bullet} className={styles.heroBullet}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span>{bullet}</span>
                </div>
              ))}
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
            <div className={styles.sectionTitle}>Radar do mes</div>
            <p className={styles.sectionSubtitle}>
              O painel abaixo resume faturamento, liquido, vencimentos e pressao
              do estoque em uma leitura rapida.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {snapshot.financeMetrics.map((metric) => (
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
                <div className={styles.sectionTitle}>Dividas por janela</div>
                <p className={styles.sectionSubtitle}>
                  Aqui o foco e simples: quanto vence em cada janela e se o
                  ritmo liquido atual da operacao cobre esse bloco.
                </p>
              </div>
            </div>

            <div className={styles.list}>
              {snapshot.debtWindowRows.map((row) => (
                <article key={row.label} className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>{row.label}</div>
                    <span className={`${styles.pill} ${getAlertPillClass(row.level)}`}>
                      {row.badge}
                    </span>
                  </div>
                  <p className={styles.listDetail}>{row.detail}</p>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.stack}>
            <div className={styles.callout}>
              <h3>Leitura financeira direta</h3>
              <p>{snapshot.financialDiagnosis}</p>
            </div>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Liquido por dia no ritmo atual</div>
              <div className={styles.metricValue}>{snapshot.dailyNetPace}</div>
              <div className={styles.metricHint}>
                Considera Nuvemshop do mes atual e a parcela diaria do TikTok.
              </div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Projecao liquida ate o fim do mes</div>
              <div className={styles.metricValue}>{snapshot.projectedMonthNet}</div>
              <div className={styles.metricHint}>
                Folga estimada da operacao antes de olhar o valor do lote.
              </div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Ticket medio do mes</div>
              <div className={styles.metricValue}>{snapshot.averageTicket}</div>
              <div className={styles.metricHint}>
                {snapshot.totalOrdersLabel} no mes atual da Nuvemshop.
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <div>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Cenarios que mais mexem na margem</div>
                <p className={styles.sectionSubtitle}>
                  A tabela abaixo foca nos cenarios mais provaveis hoje: Pix,
                  cupom e cartao ate 2x, tanto no unitario quanto no combo.
                </p>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Cenario</th>
                    <th>Composicao</th>
                    <th>Qtd</th>
                    <th>Liquido</th>
                    <th>Custo</th>
                    <th>Lucro</th>
                    <th>Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.strategicScenarioRows.map((row) => (
                    <tr key={row.title}>
                      <td>{row.title}</td>
                      <td>{row.mixLabel}</td>
                      <td>{row.quantity}</td>
                      <td>{formatMoney(row.netReceived)}</td>
                      <td>{formatMoney(row.costTotal)}</td>
                      <td className={getProfitToneClass(row.marginPercent)}>
                        {formatMoney(row.netProfit)}
                      </td>
                      <td className={getProfitToneClass(row.marginPercent)}>
                        {formatPercent(row.marginPercent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.stack}>
            <div className={styles.callout}>
              <h3>Leitura comercial direta</h3>
              <p>{snapshot.marginDiagnosis}</p>
            </div>

            {snapshot.pricingFocusMetrics.map((metric) => (
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
            <div className={styles.sectionTitle}>Saude da base compradora</div>
            <p className={styles.sectionSubtitle}>
              O objetivo aqui e entender se a base esta ajudando seu caixa ou se
              esta puxando demais para cenarios com cupom e parcelamento.
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
                <div className={styles.sectionTitle}>Estoque que pede decisao</div>
                <p className={styles.sectionSubtitle}>
                  Aqui a Dash explica o por que de pedir, remanejar ou observar
                  cada base agora.
                </p>
              </div>
            </div>

            <div className={styles.list}>
              {snapshot.stockActionRows.map((row) => (
                <article key={row.title} className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>{row.title}</div>
                    <span className={`${styles.pill} ${getAlertPillClass(row.level)}`}>
                      {row.badge}
                    </span>
                  </div>
                  <p className={styles.listDetail}>{row.detail}</p>
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
              {snapshot.alerts.map((alert) => (
                <article key={alert.title} className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>{alert.title}</div>
                    <span className={`${styles.pill} ${getAlertPillClass(alert.level)}`}>
                      {alert.level}
                    </span>
                  </div>
                  <p className={styles.listDetail}>{alert.detail}</p>
                </article>
              ))}
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
  comboRules: CompanyCartDiscountRule[];
  unitPrice: number;
  config: Awaited<ReturnType<typeof loadFinanceConfig>>["config"];
}) {
  const { stockItems, debts, orders, cashFlow, financeDashboard, comboRules, unitPrice, config } = params;

  const totalUnits = stockItems.reduce((sum, item) => sum + item.total, 0);
  const freeUnits = stockItems.reduce((sum, item) => sum + item.free, 0);
  const publishedUnits = stockItems.reduce((sum, item) => sum + item.published, 0);
  const reorderCount = stockItems.filter(isStockItemInAlert).length;
  const stockValueMinimal = totalUnits * MINIMAL_UNIT_COST;
  const stockValueFull = totalUnits * FULL_UNIT_COST;
  const monthlySalesCount = orders.length;
  const monthlyGrossSales = orders.reduce((sum, order) => sum + order.total, 0);
  const nuvemNet = cashFlow.nuvemRows.reduce((sum, row) => sum + row.netReceived, 0);
  const tiktokNet =
    cashFlow.channelRows.find((row) => row.channel === "TikTok Shop")?.net ?? 0;
  const today = new Date();
  const currentDay = Math.max(today.getDate(), 1);
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();
  const dailyNuvemNetPace = nuvemNet / currentDay;
  const dailyTiktokNetPace = daysInMonth > 0 ? tiktokNet / daysInMonth : 0;
  const dailyNetPaceValue = dailyNuvemNetPace + dailyTiktokNetPace;
  const projectedMonthNetValue = dailyNetPaceValue * daysInMonth;

  const openDebts = debts.filter(
    (debt) => debt.status !== "paga" && debt.status !== "cancelada",
  );
  const openDebtTotal = openDebts.reduce((sum, debt) => sum + debt.amount, 0);
  const dueSoonTotal = sumDebtsWithinNextDays(openDebts, 15);
  const dueFortyFiveTotal = sumDebtsWithinNextDays(openDebts, 45);

  const customerSummary = buildCustomerMetrics(orders);
  const comboDefinitions = buildRealComboDefinitions(comboRules, unitPrice);
  const comboScenarioRows = comboDefinitions.flatMap((definition) => [
    buildComboMixScenarioRow({
      config,
      title: `${definition.label} / Pix / Sem cupom`,
      quantity: definition.quantity,
      basePrice: definition.basePrice,
      fullCount: definition.fullCount,
      minimalCount: definition.minimalCount,
      feePercent: config.nuvemPixPercent,
      fixedFee: config.nuvemPixFixed,
      discountPercent: 0,
      mixLabel: definition.mixLabel,
    }),
    buildComboMixScenarioRow({
      config,
      title: `${definition.label} / Cartao 2x / Cupom 10%`,
      quantity: definition.quantity,
      basePrice: definition.basePrice,
      fullCount: definition.fullCount,
      minimalCount: definition.minimalCount,
      feePercent: config.nuvemCard2Percent,
      fixedFee: config.nuvemCard2Fixed,
      discountPercent: config.couponPercent,
      mixLabel: definition.mixLabel,
    }),
  ]);
  const bestCombo =
    comboScenarioRows.find((row) => row.title.includes("/ Pix / Sem cupom")) ??
    buildComboMixScenarioRow({
      config,
      title: "Combo / Pix / Sem cupom",
      quantity: config.comboQuantity,
      basePrice: config.comboPrice,
      fullCount: config.comboQuantity,
      minimalCount: 0,
      feePercent: config.nuvemPixPercent,
      fixedFee: config.nuvemPixFixed,
      discountPercent: 0,
      mixLabel: `${config.comboQuantity} full`,
    });
  const worstRealisticCombo =
    comboScenarioRows
      .filter((row) => row.title.includes("/ Cartao 2x / Cupom 10%"))
      .sort((left, right) => left.fullMarginPercent - right.fullMarginPercent)[0] ??
    buildComboMixScenarioRow({
      config,
      title: "Combo / Cartao 2x / Cupom 10%",
      quantity: config.comboQuantity,
      basePrice: config.comboPrice,
      fullCount: config.comboQuantity,
      minimalCount: 0,
      feePercent: config.nuvemCard2Percent,
      fixedFee: config.nuvemCard2Fixed,
      discountPercent: config.couponPercent,
      mixLabel: `${config.comboQuantity} full`,
    });
  const strategicScenarioRows = [
    buildUnitMixScenarioRow({
      config,
      title: "Unitaria Full / Pix / Sem cupom",
      basePrice: config.unitPrice,
      fullCount: 1,
      minimalCount: 0,
      feePercent: config.nuvemPixPercent,
      fixedFee: config.nuvemPixFixed,
      discountPercent: 0,
    }),
    buildUnitMixScenarioRow({
      config,
      title: "Unitaria Full / Cartao 2x / Cupom 10%",
      basePrice: config.unitPrice,
      fullCount: 1,
      minimalCount: 0,
      feePercent: config.nuvemCard2Percent,
      fixedFee: config.nuvemCard2Fixed,
      discountPercent: config.couponPercent,
    }),
    buildUnitMixScenarioRow({
      config,
      title: "Unitaria Minimalista / Pix / Sem cupom",
      basePrice: config.unitPrice,
      fullCount: 0,
      minimalCount: 1,
      feePercent: config.nuvemPixPercent,
      fixedFee: config.nuvemPixFixed,
      discountPercent: 0,
    }),
    buildUnitMixScenarioRow({
      config,
      title: "Unitaria Minimalista / Cartao 2x / Cupom 10%",
      basePrice: config.unitPrice,
      fullCount: 0,
      minimalCount: 1,
      feePercent: config.nuvemCard2Percent,
      fixedFee: config.nuvemCard2Fixed,
      discountPercent: config.couponPercent,
    }),
    ...comboScenarioRows,
  ];
  const debtWindowRows = buildDebtWindowRows(openDebts, dailyNetPaceValue);
  const stockActionRows = buildStockActionRows(stockItems);
  const highPriorityStock = stockActionRows.filter((row) => row.level === "alto").length;

  const financeMetrics = [
    {
      label: "Faturamento bruto do mes",
      value: formatMoney(monthlyGrossSales),
      detail:
        monthlySalesCount > 0
          ? `${monthlySalesCount} pedidos puxados da Nuvemshop.`
          : "Sem pedidos carregados no mes atual.",
    },
    {
      label: "Liquido capturado no mes",
      value: formatMoney(cashFlow.entradasTotais),
      detail: `${formatMoney(nuvemNet)} na Nuvemshop e ${formatMoney(tiktokNet)} no TikTok.`,
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
      label: "Dividas em ate 45 dias",
      value: formatMoney(dueFortyFiveTotal),
      detail: "Leitura de curto prazo para nao ser pego na curva do fornecedor.",
    },
    {
      label: "Saldo projetado do mes",
      value: formatMoney(cashFlow.saldoProjetado),
      detail:
        cashFlow.saldoProjetado >= 0
          ? "Entradas do mes atual ainda fecham com folga."
          : "O fluxo do mes atual ainda fecha no aperto.",
    },
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
      label: "Liquido do mes",
      value: formatMoney(cashFlow.entradasTotais),
      detail:
        cashFlow.entradasTotais > 0
          ? "Recebimento estimado depois das taxas e descontos."
          : "Sem entradas liquidas carregadas no periodo.",
    },
    {
      label: "Dividas nos proximos 15 dias",
      value: formatMoney(dueSoonTotal),
      detail: "Primeira trava para saber se o caixa precisa acelerar.",
    },
    {
      label: "Reposicoes em alerta",
      value: String(reorderCount),
      detail:
        highPriorityStock > 0
          ? `${highPriorityStock} linhas ja pedem acao imediata.`
          : "Nenhuma base critica neste momento.",
    },
    {
      label: "Pecas livres para remanejar",
      value: String(freeUnits),
      detail: `${publishedUnits} estao publicadas hoje na Nuvemshop.`,
    },
  ];

  const alerts = [
    {
      title: "Vencimentos dos proximos 15 dias",
      level: debtWindowRows[0]?.level ?? ("baixo" as const),
      detail:
        debtWindowRows[0]?.detail ??
        "Sem vencimentos muito proximos na leitura atual.",
    },
    {
      title: "Perfil de pagamento da base",
      level:
        customerSummary.worstPatternShareValue >= 20 ||
        customerSummary.couponShareValue >= 40
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
        stockActionRows.length > 0
          ? stockActionRows[0]!.detail
          : "As linhas atuais ainda nao encostaram no ponto de reposicao.",
    },
    {
      title: "Combo mais sensivel",
      level: getMarginAlertLevel(worstRealisticCombo.marginPercent),
      detail: `No combo em 2x com cupom de ${worstRealisticCombo.mixLabel.toLowerCase()}, a margem cai para ${formatPercent(
        worstRealisticCombo.marginPercent,
      )} e o lucro fica em ${formatMoney(worstRealisticCombo.netProfit)}.`,
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
    openDebtTotal,
    heroBullets: [
      `${formatMoney(cashFlow.entradasTotais)} liquidos entraram no mes ate agora e ${formatMoney(
        dueSoonTotal,
      )} vencem nos proximos 15 dias.`,
      `${customerSummary.summary} O combo mais sensivel hoje e ${worstRealisticCombo.title.toLowerCase()}.`,
      stockActionRows.length > 0
        ? `${stockActionRows[0]!.title}: ${stockActionRows[0]!.shortReason}`
        : "Nenhuma base pede pedido imediato agora; a pressao maior segue no financeiro.",
    ],
    topMetrics,
    financeMetrics,
    debtWindowRows,
    strategicScenarioRows,
    pricingFocusMetrics: [
      {
        label: "Melhor combo hoje",
        value: formatMoney(bestCombo.netReceived),
        detail: `${bestCombo.mixLabel} deixam ${formatMoney(bestCombo.netProfit)} de lucro no melhor cenario.`,
      },
      {
        label: "Combo mais apertado",
        value: formatMoney(worstRealisticCombo.netReceived),
        detail: `${worstRealisticCombo.mixLabel} ainda deixam ${formatMoney(worstRealisticCombo.netProfit)} em 2x com cupom.`,
      },
      {
        label: "Meta para pagar o aberto com combo",
        value:
          worstRealisticCombo.netReceived > 0
            ? `${Math.ceil(openDebtTotal / worstRealisticCombo.netReceived)} combos`
            : "-",
        detail: `Leitura usando ${worstRealisticCombo.mixLabel.toLowerCase()} em 2x com cupom para cobrir ${formatMoney(openDebtTotal)} em aberto.`,
      },
    ],
    stockActionRows,
    alerts,
    customerMetrics: customerSummary.metrics,
    customerProfileSummary: customerSummary.summary,
    financialDiagnosis:
      openDebtTotal <= 0
        ? `Hoje a operacao nao tem dividas abertas. O foco principal passa a ser defender margem e usar o estoque de forma inteligente, porque o lote representa entre ${formatMoney(
            stockValueMinimal,
          )} e ${formatMoney(stockValueFull)} em custo.`
        : `Hoje existem ${formatMoney(openDebtTotal)} em aberto. No ritmo liquido atual, a operacao projeta ${formatMoney(
            projectedMonthNetValue,
          )} para o mes e precisa vigiar principalmente a janela de 15 dias, onde vencem ${formatMoney(
            dueSoonTotal,
          )}.`,
    marginDiagnosis: `O combo continua sendo a leitura mais sensivel do caixa. No melhor caso ele gera ${formatMoney(
      bestCombo.netReceived,
    )} liquidos com ${bestCombo.mixLabel.toLowerCase()}; no cenario mais apertado de 2x com cupom cai para ${formatMoney(
      worstRealisticCombo.netReceived,
    )} com ${worstRealisticCombo.mixLabel.toLowerCase()}. Isso e o que mais importa para saber se a operacao aguenta desconto e parcelamento sem engolir sua margem.`,
    averageTicket: customerSummary.averageTicket,
    totalOrdersLabel:
      orders.length > 0
        ? `${orders.length} pedidos e ${customerSummary.uniqueCustomers} clientes unicos`
        : "Nenhum pedido carregado",
    projectedMonthNet: formatMoney(projectedMonthNetValue),
    dailyNetPace: formatMoney(dailyNetPaceValue),
  };
}

type DashboardScenarioRow = {
  title: string;
  quantity: number;
  mixLabel: string;
  discountedRevenue: number;
  feeCost: number;
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

function buildUnitMixScenarioRow(params: {
  config: Awaited<ReturnType<typeof loadFinanceConfig>>["config"];
  title: string;
  basePrice: number;
  fullCount: number;
  minimalCount: number;
  feePercent: number;
  fixedFee: number;
  discountPercent: number;
}): DashboardScenarioRow {
  return buildMixScenarioRow({
    ...params,
    quantity: params.fullCount + params.minimalCount,
    mixLabel:
      params.fullCount > 0
        ? params.minimalCount > 0
          ? `${params.fullCount} full + ${params.minimalCount} minimalista`
          : `${params.fullCount} full`
        : `${params.minimalCount} minimalista`,
  });
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
}): DashboardScenarioRow {
  return buildMixScenarioRow(params);
}

function buildMixScenarioRow(params: {
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
}): DashboardScenarioRow {
  const discountedRevenue = params.basePrice * (1 - params.discountPercent / 100);
  const feeCost =
    discountedRevenue * (params.feePercent / 100) + params.fixedFee;
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
    costTotal,
    netReceived,
    netProfit,
    marginPercent,
  };
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
      couponShareValue: 0,
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
    couponShareValue: (couponCount / totalOrders) * 100,
    worstPatternShare,
    worstPatternShareValue,
  };
}

function buildDebtWindowRows(debts: InternalDebt[], dailyNetPace: number) {
  return [15, 30, 45].map((days) => {
    const dueTotal = sumDebtsWithinNextDays(debts, days);
    const projectedCoverage = dailyNetPace * days;
    const gap = projectedCoverage - dueTotal;
    const level =
      dueTotal <= 0
        ? ("baixo" as const)
        : gap >= 0
          ? ("baixo" as const)
          : Math.abs(gap) <= dueTotal * 0.25
            ? ("medio" as const)
            : ("alto" as const);

    return {
      label: `Vence em ate ${days} dias`,
      badge: dueTotal > 0 ? formatMoney(dueTotal) : "sem vencimento",
      level,
      detail:
        dueTotal <= 0
          ? `Nao existem dividas abertas com vencimento em ate ${days} dias.`
          : gap >= 0
            ? `No ritmo liquido atual, a operacao projeta ${formatMoney(
                projectedCoverage,
              )} ate essa janela e cobre os ${formatMoney(
                dueTotal,
              )} com folga de ${formatMoney(gap)}.`
            : `No ritmo liquido atual, a operacao projeta ${formatMoney(
                projectedCoverage,
              )} ate essa janela e ainda faltam ${formatMoney(
                Math.abs(gap),
              )} para cobrir ${formatMoney(dueTotal)}.`,
    };
  });
}

function buildStockActionRows(stockItems: BaseStockItem[]) {
  return [...stockItems]
    .filter(isStockItemInAlert)
    .sort((left, right) => getStockRiskScore(right) - getStockRiskScore(left))
    .slice(0, 6)
    .map((item) => {
      const label = `${item.sku} · ${item.color} ${item.size}`;
      const coverageText =
        item.coverageDays === null ? "sem historico de giro" : `${item.coverageDays} dias`;
      const parts: string[] = [];
      let title = `Acompanhar ${label}`;
      let shortReason = `base em atencao`;
      let level: "alto" | "medio" | "baixo" = "medio";

      if (item.overcommitted > 0) {
        title = `Remanejar ${label}`;
        shortReason = `publicado acima do fisico`;
        level = "alto";
        parts.push(
          `Publicado ${item.published} para um fisico total de ${item.total}; hoje faltam ${item.overcommitted} unidades para sustentar a vitrine sem remanejamento.`,
        );
      }

      if (item.coverageDays !== null && item.coverageDays <= item.leadTimeDays) {
        title = item.overcommitted > 0 ? title : `Pedir ${label}`;
        shortReason = `cobertura menor que o prazo`;
        level = item.overcommitted > 0 ? "alto" : "medio";
        parts.push(
          `No ritmo atual, a cobertura e ${coverageText} e a reposicao leva ${item.leadTimeDays} dias.`,
        );
      }

      if (item.plain <= item.reorderPoint) {
        title =
          item.overcommitted > 0 || item.coverageDays !== null
            ? title
            : `Pedir ${label}`;
        shortReason = shortReason === "base em atencao" ? `lisas abaixo do ponto` : shortReason;
        level = level === "alto" ? "alto" : "medio";
        parts.push(
          `Sobram ${item.plain} lisas para estampar e o ponto de reposicao esta em ${item.reorderPoint}.`,
        );
      }

      if (parts.length === 0) {
        parts.push(
          `A base ainda tem ${item.free} unidades livres e ${item.published} publicadas na loja.`,
        );
      }

      return {
        title,
        shortReason,
        level,
        badge:
          level === "alto"
            ? "agir agora"
            : level === "medio"
              ? "acompanhar"
              : "ok",
        detail: `${parts.join(" ")} Hoje existem ${item.printedReal} estampadas reais, ${item.plain} lisas em maos e ${item.published} publicadas na Nuvemshop.`,
      };
    });
}

function isStockItemInAlert(item: BaseStockItem) {
  return (
    item.overcommitted > 0 ||
    item.plain <= item.reorderPoint ||
    (item.coverageDays !== null && item.coverageDays <= item.leadTimeDays)
  );
}

function getStockRiskScore(item: BaseStockItem) {
  let score = 0;

  if (item.overcommitted > 0) {
    score += 100 + item.overcommitted * 5;
  }

  if (item.coverageDays !== null && item.coverageDays <= item.leadTimeDays) {
    score += 60 + (item.leadTimeDays - item.coverageDays);
  }

  if (item.plain <= item.reorderPoint) {
    score += 30 + (item.reorderPoint - item.plain);
  }

  return score;
}

function sumDebtsWithinNextDays(debts: InternalDebt[], days: number) {
  return debts
    .filter((debt) => isWithinNextDays(debt.dueDate, days))
    .reduce((sum, debt) => sum + debt.amount, 0);
}

function getMarginAlertLevel(marginPercent: number): "alto" | "medio" | "baixo" {
  if (marginPercent < 10) {
    return "alto";
  }

  if (marginPercent < 20) {
    return "medio";
  }

  return "baixo";
}

function getAlertPillClass(level: "alto" | "medio" | "baixo") {
  if (level === "alto") {
    return styles.pillHigh;
  }

  if (level === "medio") {
    return styles.pillMedium;
  }

  return styles.pillLow;
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
