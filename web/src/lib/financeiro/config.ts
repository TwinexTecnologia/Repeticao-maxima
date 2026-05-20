export type FinanceConfig = {
  productCost: number;
  printCost: number;
  packagingCost: number;
  operationCost: number;
  freightSubsidy: number;
  desiredMargin: number;
  couponPercent: number;
  nuvemPixPercent: number;
  nuvemPixFixed: number;
  nuvemCard1Percent: number;
  nuvemCard1Fixed: number;
  nuvemCard2Percent: number;
  nuvemCard2Fixed: number;
  nuvemCard3Percent: number;
  nuvemCard3Fixed: number;
  unitQuantity: number;
  unitPrice: number;
  comboQuantity: number;
  comboPrice: number;
  tiktokMonthlyNet: number;
};

export const defaultFinanceConfig: FinanceConfig = {
  productCost: 28,
  printCost: 14,
  packagingCost: 3.5,
  operationCost: 2,
  freightSubsidy: 0,
  desiredMargin: 22,
  couponPercent: 10,
  nuvemPixPercent: 0.99,
  nuvemPixFixed: 0,
  nuvemCard1Percent: 5.19,
  nuvemCard1Fixed: 0.35,
  nuvemCard2Percent: 8.96,
  nuvemCard2Fixed: 0.35,
  nuvemCard3Percent: 10.92,
  nuvemCard3Fixed: 0.35,
  unitQuantity: 1,
  unitPrice: 99,
  comboQuantity: 3,
  comboPrice: 199,
  tiktokMonthlyNet: 0,
};

export const financeConfigKeys = Object.keys(
  defaultFinanceConfig,
) as Array<keyof FinanceConfig>;

function getNumericValue(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function normalizeFinanceConfig(
  input?: Partial<Record<keyof FinanceConfig, unknown>> | null,
) {
  const source = input ?? {};

  return financeConfigKeys.reduce<FinanceConfig>((acc, key) => {
    acc[key] = getNumericValue(source[key], defaultFinanceConfig[key]);
    return acc;
  }, { ...defaultFinanceConfig });
}

export function financeConfigToRow(config: FinanceConfig) {
  return {
    id: "default",
    product_cost: config.productCost,
    print_cost: config.printCost,
    packaging_cost: config.packagingCost,
    operation_cost: config.operationCost,
    freight_subsidy: config.freightSubsidy,
    desired_margin: config.desiredMargin,
    coupon_percent: config.couponPercent,
    nuvem_pix_percent: config.nuvemPixPercent,
    nuvem_pix_fixed: config.nuvemPixFixed,
    nuvem_card_1_percent: config.nuvemCard1Percent,
    nuvem_card_1_fixed: config.nuvemCard1Fixed,
    nuvem_card_2_percent: config.nuvemCard2Percent,
    nuvem_card_2_fixed: config.nuvemCard2Fixed,
    nuvem_card_3_percent: config.nuvemCard3Percent,
    nuvem_card_3_fixed: config.nuvemCard3Fixed,
    unit_quantity: config.unitQuantity,
    unit_price: config.unitPrice,
    combo_quantity: config.comboQuantity,
    combo_price: config.comboPrice,
    tiktok_monthly_net: config.tiktokMonthlyNet,
    updated_at: new Date().toISOString(),
  };
}

export function rowToFinanceConfig(row: Record<string, unknown> | null | undefined) {
  if (!row) {
    return { ...defaultFinanceConfig };
  }

  return normalizeFinanceConfig({
    productCost: row.product_cost,
    printCost: row.print_cost,
    packagingCost: row.packaging_cost,
    operationCost: row.operation_cost,
    freightSubsidy: row.freight_subsidy,
    desiredMargin: row.desired_margin,
    couponPercent: row.coupon_percent,
    nuvemPixPercent: row.nuvem_pix_percent,
    nuvemPixFixed: row.nuvem_pix_fixed,
    nuvemCard1Percent: row.nuvem_card_1_percent,
    nuvemCard1Fixed: row.nuvem_card_1_fixed,
    nuvemCard2Percent: row.nuvem_card_2_percent,
    nuvemCard2Fixed: row.nuvem_card_2_fixed,
    nuvemCard3Percent: row.nuvem_card_3_percent,
    nuvemCard3Fixed: row.nuvem_card_3_fixed,
    unitQuantity: row.unit_quantity,
    unitPrice: row.unit_price,
    comboQuantity: row.combo_quantity,
    comboPrice: row.combo_price,
    tiktokMonthlyNet: row.tiktok_monthly_net,
  });
}
