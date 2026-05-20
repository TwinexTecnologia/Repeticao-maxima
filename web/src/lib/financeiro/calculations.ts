import type { FinanceConfig } from "./config";
import type {
  FinanceFlowOrder,
  MonthlyFinanceFlowData,
} from "./flow";

export function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function calculateSuggestedPrice(params: {
  quantity: number;
  discountPercent: number;
  feePercent: number;
  fixedFee: number;
  unitCosts: number;
  freightSubsidy: number;
  targetMargin: number;
}) {
  const totalCosts =
    params.unitCosts * params.quantity +
    params.freightSubsidy +
    params.fixedFee;
  const netRevenueDenominator =
    1 - params.feePercent / 100 - params.targetMargin / 100;
  const discountMultiplier = 1 - params.discountPercent / 100;

  if (netRevenueDenominator <= 0 || discountMultiplier <= 0) {
    return null;
  }

  return totalCosts / netRevenueDenominator / discountMultiplier;
}

export function getMarginStatus(margin: number, targetMargin: number) {
  if (margin >= targetMargin + 8) {
    return "Margem forte";
  }

  if (margin >= targetMargin) {
    return "Margem saudavel";
  }

  return "Margem apertada";
}

function getMaxSuggestedPrice(
  rows: Array<{
    suggestedPrice: number | null;
  }>,
) {
  const validPrices = rows
    .map((row) => row.suggestedPrice)
    .filter((value): value is number => value !== null);

  if (validPrices.length === 0) {
    return null;
  }

  return Math.max(...validPrices);
}

function calculateOfferResult(params: {
  title: string;
  quantity: number;
  basePrice: number;
  discountPercent: number;
  feePercent: number;
  fixedFee: number;
  unitCosts: number;
  freightSubsidy: number;
  targetMargin: number;
}) {
  const discountedRevenue =
    params.basePrice * (1 - params.discountPercent / 100);
  const discountValue = params.basePrice - discountedRevenue;
  const feeCost =
    discountedRevenue * (params.feePercent / 100) + params.fixedFee;
  const netReceived = discountedRevenue - feeCost;
  const totalCosts = params.unitCosts * params.quantity + params.freightSubsidy;
  const netProfit = netReceived - totalCosts;
  const profitPerPiece = params.quantity > 0 ? netProfit / params.quantity : 0;
  const netReceivedPerPiece =
    params.quantity > 0 ? netReceived / params.quantity : 0;
  const margin =
    discountedRevenue > 0 ? (netProfit / discountedRevenue) * 100 : 0;
  const suggestedPrice = calculateSuggestedPrice({
    quantity: params.quantity,
    discountPercent: params.discountPercent,
    feePercent: params.feePercent,
    fixedFee: params.fixedFee,
    unitCosts: params.unitCosts,
    freightSubsidy: params.freightSubsidy,
    targetMargin: params.targetMargin,
  });

  return {
    title: params.title,
    quantity: params.quantity,
    basePrice: params.basePrice,
    discountPercent: params.discountPercent,
    discountValue,
    discountedRevenue,
    netReceived,
    netReceivedPerPiece,
    totalCosts,
    feeCost,
    netProfit,
    profitPerPiece,
    margin,
    suggestedPrice,
    marginStatus: getMarginStatus(margin, params.targetMargin),
  };
}

export function buildFinanceDashboard(config: FinanceConfig) {
  const unitCosts =
    config.productCost +
    config.printCost +
    config.packagingCost +
    config.operationCost;

  const offers = {
    unitPixNoCoupon: calculateOfferResult({
      title: "Unitario / Pix / Sem cupom",
      quantity: config.unitQuantity,
      basePrice: config.unitPrice,
      discountPercent: 0,
      feePercent: config.nuvemPixPercent,
      fixedFee: config.nuvemPixFixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    unitPixCoupon: calculateOfferResult({
      title: "Unitario / Pix / Cupom 10%",
      quantity: config.unitQuantity,
      basePrice: config.unitPrice,
      discountPercent: config.couponPercent,
      feePercent: config.nuvemPixPercent,
      fixedFee: config.nuvemPixFixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    unitCard1NoCoupon: calculateOfferResult({
      title: "Unitario / Cartao 1x / Sem cupom",
      quantity: config.unitQuantity,
      basePrice: config.unitPrice,
      discountPercent: 0,
      feePercent: config.nuvemCard1Percent,
      fixedFee: config.nuvemCard1Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    unitCard1Coupon: calculateOfferResult({
      title: "Unitario / Cartao 1x / Cupom 10%",
      quantity: config.unitQuantity,
      basePrice: config.unitPrice,
      discountPercent: config.couponPercent,
      feePercent: config.nuvemCard1Percent,
      fixedFee: config.nuvemCard1Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    unitCard2NoCoupon: calculateOfferResult({
      title: "Unitario / Cartao 2x / Sem cupom",
      quantity: config.unitQuantity,
      basePrice: config.unitPrice,
      discountPercent: 0,
      feePercent: config.nuvemCard2Percent,
      fixedFee: config.nuvemCard2Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    unitCard2Coupon: calculateOfferResult({
      title: "Unitario / Cartao 2x / Cupom 10%",
      quantity: config.unitQuantity,
      basePrice: config.unitPrice,
      discountPercent: config.couponPercent,
      feePercent: config.nuvemCard2Percent,
      fixedFee: config.nuvemCard2Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    unitCard3NoCoupon: calculateOfferResult({
      title: "Unitario / Cartao 3x / Sem cupom",
      quantity: config.unitQuantity,
      basePrice: config.unitPrice,
      discountPercent: 0,
      feePercent: config.nuvemCard3Percent,
      fixedFee: config.nuvemCard3Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    unitCard3Coupon: calculateOfferResult({
      title: "Unitario / Cartao 3x / Cupom 10%",
      quantity: config.unitQuantity,
      basePrice: config.unitPrice,
      discountPercent: config.couponPercent,
      feePercent: config.nuvemCard3Percent,
      fixedFee: config.nuvemCard3Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    comboPixNoCoupon: calculateOfferResult({
      title: "Combo / Pix / Sem cupom",
      quantity: config.comboQuantity,
      basePrice: config.comboPrice,
      discountPercent: 0,
      feePercent: config.nuvemPixPercent,
      fixedFee: config.nuvemPixFixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    comboPixCoupon: calculateOfferResult({
      title: "Combo / Pix / Cupom 10%",
      quantity: config.comboQuantity,
      basePrice: config.comboPrice,
      discountPercent: config.couponPercent,
      feePercent: config.nuvemPixPercent,
      fixedFee: config.nuvemPixFixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    comboCard1NoCoupon: calculateOfferResult({
      title: "Combo / Cartao 1x / Sem cupom",
      quantity: config.comboQuantity,
      basePrice: config.comboPrice,
      discountPercent: 0,
      feePercent: config.nuvemCard1Percent,
      fixedFee: config.nuvemCard1Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    comboCard1Coupon: calculateOfferResult({
      title: "Combo / Cartao 1x / Cupom 10%",
      quantity: config.comboQuantity,
      basePrice: config.comboPrice,
      discountPercent: config.couponPercent,
      feePercent: config.nuvemCard1Percent,
      fixedFee: config.nuvemCard1Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    comboCard2NoCoupon: calculateOfferResult({
      title: "Combo / Cartao 2x / Sem cupom",
      quantity: config.comboQuantity,
      basePrice: config.comboPrice,
      discountPercent: 0,
      feePercent: config.nuvemCard2Percent,
      fixedFee: config.nuvemCard2Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    comboCard2Coupon: calculateOfferResult({
      title: "Combo / Cartao 2x / Cupom 10%",
      quantity: config.comboQuantity,
      basePrice: config.comboPrice,
      discountPercent: config.couponPercent,
      feePercent: config.nuvemCard2Percent,
      fixedFee: config.nuvemCard2Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    comboCard3NoCoupon: calculateOfferResult({
      title: "Combo / Cartao 3x / Sem cupom",
      quantity: config.comboQuantity,
      basePrice: config.comboPrice,
      discountPercent: 0,
      feePercent: config.nuvemCard3Percent,
      fixedFee: config.nuvemCard3Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
    comboCard3Coupon: calculateOfferResult({
      title: "Combo / Cartao 3x / Cupom 10%",
      quantity: config.comboQuantity,
      basePrice: config.comboPrice,
      discountPercent: config.couponPercent,
      feePercent: config.nuvemCard3Percent,
      fixedFee: config.nuvemCard3Fixed,
      unitCosts,
      freightSubsidy: config.freightSubsidy,
      targetMargin: config.desiredMargin,
    }),
  };

  const comparisonRows = [
    offers.unitPixNoCoupon,
    offers.unitPixCoupon,
    offers.unitCard1NoCoupon,
    offers.unitCard1Coupon,
    offers.unitCard2NoCoupon,
    offers.unitCard2Coupon,
    offers.unitCard3NoCoupon,
    offers.unitCard3Coupon,
    offers.comboPixNoCoupon,
    offers.comboPixCoupon,
    offers.comboCard1NoCoupon,
    offers.comboCard1Coupon,
    offers.comboCard2NoCoupon,
    offers.comboCard2Coupon,
    offers.comboCard3NoCoupon,
    offers.comboCard3Coupon,
  ];

  const unitRows = [
    offers.unitPixNoCoupon,
    offers.unitPixCoupon,
    offers.unitCard1NoCoupon,
    offers.unitCard1Coupon,
    offers.unitCard2NoCoupon,
    offers.unitCard2Coupon,
    offers.unitCard3NoCoupon,
    offers.unitCard3Coupon,
  ];
  const comboRows = [
    offers.comboPixNoCoupon,
    offers.comboPixCoupon,
    offers.comboCard1NoCoupon,
    offers.comboCard1Coupon,
    offers.comboCard2NoCoupon,
    offers.comboCard2Coupon,
    offers.comboCard3NoCoupon,
    offers.comboCard3Coupon,
  ];
  const worstScenarioSuggestedPrice = getMaxSuggestedPrice(comparisonRows);

  const presetScenarios = [
    {
      label: "Melhor cenario unitario",
      detail: "Pix sem cupom",
      result: offers.unitPixNoCoupon,
    },
    {
      label: "Cenario moderado unitario",
      detail: "Cartao 1x com cupom de 10%",
      result: offers.unitCard1Coupon,
    },
    {
      label: "Pior cenario unitario",
      detail: "Cartao 3x com cupom de 10%",
      result: offers.unitCard3Coupon,
    },
    {
      label: "Melhor cenario combo",
      detail: "Pix sem cupom",
      result: offers.comboPixNoCoupon,
    },
    {
      label: "Combo com cupom no Pix",
      detail: "Pix com cupom de 10%",
      result: offers.comboPixCoupon,
    },
    {
      label: "Cenario moderado combo",
      detail: "Cartao 1x com cupom de 10%",
      result: offers.comboCard1Coupon,
    },
    {
      label: "Pior cenario combo",
      detail: "Cartao 3x com cupom de 10%",
      result: offers.comboCard3Coupon,
    },
  ];

  const offerInsights = [
    {
      label: "Oferta unitario",
      quantityLabel: `${config.unitQuantity} camiseta`,
      currentPrice: config.unitPrice,
      worstMargin: Math.min(...unitRows.map((row) => row.margin)),
      bestProfitPerPiece: Math.max(...unitRows.map((row) => row.profitPerPiece)),
      worstNetReceivedPerPiece: Math.min(
        ...unitRows.map((row) => row.netReceivedPerPiece),
      ),
      minimumSuggestedPrice: getMaxSuggestedPrice(unitRows),
    },
    {
      label: "Oferta combo",
      quantityLabel: `${config.comboQuantity} camisetas`,
      currentPrice: config.comboPrice,
      worstMargin: Math.min(...comboRows.map((row) => row.margin)),
      bestProfitPerPiece: Math.max(
        ...comboRows.map((row) => row.profitPerPiece),
      ),
      worstNetReceivedPerPiece: Math.min(
        ...comboRows.map((row) => row.netReceivedPerPiece),
      ),
      minimumSuggestedPrice: getMaxSuggestedPrice(comboRows),
    },
  ];

  const summaryMetrics = [
    {
      label: "Custo total por camiseta",
      value: formatMoney(unitCosts),
      detail: "Camiseta + estampa + embalagem + operacao",
    },
    {
      label: "Cupom unico padrao",
      value: formatPercent(config.couponPercent),
      detail:
        "Influencer e primeira compra usam o mesmo desconto, sem acumular",
    },
    {
      label: "Liquido unitario no pior cenario",
      value: formatMoney(offers.unitCard3Coupon.netReceived),
      detail:
        "Recebimento apos desconto e taxa financeira, antes do custo da peca",
    },
    {
      label: "Meta de margem",
      value: formatPercent(config.desiredMargin),
      detail: "Referencia para saber se a oferta esta saudavel",
    },
    {
      label: "Preco minimo no pior cenario",
      value: worstScenarioSuggestedPrice
        ? formatMoney(worstScenarioSuggestedPrice)
        : "Reveja taxa/meta",
      detail: "Valor necessario para proteger a meta de margem",
    },
  ];

  return {
    unitCosts,
    offers,
    comparisonRows,
    unitRows,
    comboRows,
    presetScenarios,
    offerInsights,
    summaryMetrics,
  };
}

export function buildMonthlyCashFlow(
  config: FinanceConfig,
  flow: MonthlyFinanceFlowData,
) {
  const nuvemRows = flow.orders.map((order) => {
    const feeRule = getNuvemFeeRule(order, config);
    const feeCost = order.total * (feeRule.percent / 100) + feeRule.fixed;
    const netReceived = Math.max(order.total - feeCost, 0);

    return {
      ...order,
      feeLabel: feeRule.label,
      feeCost,
      netReceived,
    };
  });

  const entradasNuvem = nuvemRows.reduce((sum, row) => sum + row.netReceived, 0);
  const entradasTikTok = Math.max(config.tiktokMonthlyNet, 0);
  const entradasTotais = entradasNuvem + entradasTikTok;

  const saidasRows = flow.debts.map((debt) => ({
    ...debt,
    impactInMonth: debt.status !== "cancelada",
    openInMonth: debt.status !== "cancelada" && debt.status !== "paga",
  }));
  const saidasTotais = saidasRows
    .filter((row) => row.impactInMonth)
    .reduce((sum, row) => sum + row.amount, 0);
  const saidasEmAberto = saidasRows
    .filter((row) => row.openInMonth)
    .reduce((sum, row) => sum + row.amount, 0);
  const saldoProjetado = entradasTotais - saidasTotais;

  const summaryMetrics = [
    {
      label: "Entradas do mes",
      value: formatMoney(entradasTotais),
      detail: `${flow.monthLabel} · Nuvemshop liquida + TikTok manual`,
    },
    {
      label: "Saidas do mes",
      value: formatMoney(saidasTotais),
      detail: "Dividas registradas para o mes atual",
    },
    {
      label: "Saldo projetado",
      value: formatMoney(saldoProjetado),
      detail:
        saldoProjetado >= 0
          ? "Entrada maior que saida no cenario atual"
          : "O mes fecha apertado com a leitura atual",
    },
    {
      label: "Ainda em aberto",
      value: formatMoney(saidasEmAberto),
      detail: "Contas do mes que ainda nao estao pagas",
    },
  ];

  const channelRows = [
    {
      channel: "Nuvemshop",
      gross: flow.orders.reduce((sum, row) => sum + row.total, 0),
      fees: nuvemRows.reduce((sum, row) => sum + row.feeCost, 0),
      net: entradasNuvem,
      volume: nuvemRows.length,
      detail: flow.nuvemshop.message,
    },
    {
      channel: "TikTok Shop",
      gross: entradasTikTok,
      fees: 0,
      net: entradasTikTok,
      volume: 1,
      detail: "Valor manual salvo na configuracao do Financeiro.",
    },
  ];

  return {
    summaryMetrics,
    channelRows,
    nuvemRows,
    debtRows: saidasRows,
    entradasTotais,
    saidasTotais,
    saldoProjetado,
  };
}

function getNuvemFeeRule(order: FinanceFlowOrder, config: FinanceConfig) {
  const normalizedMethod = normalizeText(
    `${order.paymentMethod} ${order.gateway} ${order.paymentStatus}`,
  );

  if (normalizedMethod.includes("pix")) {
    return {
      label: "Pix",
      percent: config.nuvemPixPercent,
      fixed: config.nuvemPixFixed,
    };
  }

  if (order.installments >= 3) {
    return {
      label: "Cartao 3x",
      percent: config.nuvemCard3Percent,
      fixed: config.nuvemCard3Fixed,
    };
  }

  if (order.installments === 2) {
    return {
      label: "Cartao 2x",
      percent: config.nuvemCard2Percent,
      fixed: config.nuvemCard2Fixed,
    };
  }

  if (
    normalizedMethod.includes("cart") ||
    normalizedMethod.includes("credito") ||
    normalizedMethod.includes("visa") ||
    normalizedMethod.includes("master") ||
    normalizedMethod.includes("amex")
  ) {
    return {
      label: "Cartao 1x",
      percent: config.nuvemCard1Percent,
      fixed: config.nuvemCard1Fixed,
    };
  }

  return {
    label: "Sem regra mapeada",
    percent: 0,
    fixed: 0,
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
