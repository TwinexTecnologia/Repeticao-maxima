import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { buildMonthlyCashFlow } from "@/lib/financeiro/calculations";
import {
  loadFinanceConfig,
  saveFinanceConfig,
} from "@/lib/financeiro/repository";
import type {
  FinanceFlowDebt,
  FinanceFlowOrder,
  MonthlyFinanceFlowData,
} from "@/lib/financeiro/flow";
import {
  createDebt,
  loadDebtModuleData,
  type InternalDebt,
} from "@/lib/operacoes/repository";
import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopOrder } from "@/lib/nuvemshop/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 12;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type AnalyticsRow = {
  label: string;
  amount: number;
  share: number;
  width: number;
  detail: string;
};

type LedgerRow = {
  id: string;
  dateValue: string;
  dateSort: number;
  kind: "entrada" | "saida";
  category: string;
  description: string;
  paymentLabel: string;
  entryAmount: number;
  exitAmount: number;
};

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parseMoney(value?: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(String(value).replace(",", "."));
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

function formatMonthInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getSelectedMonth(searchParams: Record<string, string | string[] | undefined>) {
  const raw = getSearchValue(searchParams, "month").trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : formatMonthInput(new Date());
}

function getMonthRange(selectedMonth: string) {
  const [yearText, monthText] = selectedMonth.split("-");
  const year = Number.parseInt(yearText || "", 10);
  const monthIndex = Number.parseInt(monthText || "", 10) - 1;
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return {
    start,
    end,
    monthLabel: new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(start),
  };
}

function getMonthStartDate(selectedMonth: string) {
  return `${selectedMonth}-01`;
}

function getMonthEndDate(selectedMonth: string) {
  const { end } = getMonthRange(selectedMonth);
  return `${selectedMonth}-${String(end.getDate()).padStart(2, "0")}`;
}

function getDefaultDebtDateForMonth(selectedMonth: string) {
  const today = new Date();
  const currentMonth = formatMonthInput(today);

  if (currentMonth === selectedMonth) {
    return `${selectedMonth}-${String(today.getDate()).padStart(2, "0")}`;
  }

  return getMonthStartDate(selectedMonth);
}

function getMonthDayStats(selectedMonth: string) {
  const { end } = getMonthRange(selectedMonth);
  const totalDays = end.getDate();
  const today = new Date();
  const currentMonth = formatMonthInput(today);

  if (currentMonth !== selectedMonth) {
    return {
      elapsedDays: totalDays,
      totalDays,
      isCurrentMonth: false,
    };
  }

  return {
    elapsedDays: Math.min(today.getDate(), totalDays),
    totalDays,
    isCurrentMonth: true,
  };
}

function getCustomerName(order: NuvemshopOrder) {
  return (
    String(order.contact_name ?? "").trim() ||
    String(order.customer?.name ?? "").trim() ||
    String(order.contact_email ?? "").trim() ||
    "-"
  );
}

function orderHasCashEffectInMonth(order: NuvemshopOrder, monthStart: Date, monthEnd: Date) {
  const raw = order.paid_at || order.created_at;

  if (!raw) {
    return false;
  }

  const reference = new Date(raw);

  if (Number.isNaN(reference.getTime())) {
    return false;
  }

  return reference >= monthStart && reference <= monthEnd;
}

function mapOrderToFinanceFlow(order: NuvemshopOrder): FinanceFlowOrder {
  const couponCode =
    order.coupon && order.coupon.length > 0
      ? String(order.coupon[0]?.code ?? "").trim() || null
      : null;
  const customerKey =
    String(order.customer?.id ?? "").trim() ||
    String(order.contact_email ?? "").trim().toLowerCase() ||
    String(order.contact_name ?? "").trim().toLowerCase() ||
    String(order.id ?? "").trim();

  return {
    id: String(order.id ?? ""),
    number: String(order.number ?? order.id ?? ""),
    total: parseMoney(order.total),
    referenceDate: order.paid_at || order.created_at || null,
    paymentMethod:
      order.payment_details?.method ||
      order.gateway_name ||
      order.gateway ||
      "Nao identificado",
    installments: Math.max(order.payment_details?.installments || 1, 1),
    gateway: order.gateway_name || order.gateway || "Nuvemshop",
    paymentStatus: order.payment_status || "sem status",
    customerName: getCustomerName(order),
    customerKey,
    hasCoupon: Boolean(couponCode),
    couponCode,
    discountTotal: parseMoney(order.discount),
    itemQuantity: getOrderItemQuantity(order),
    destinationState: null,
  };
}

function getOrderItemQuantity(order: NuvemshopOrder) {
  return (order.products ?? []).reduce((sum, product) => {
    const quantity = Number.parseInt(String(product.quantity ?? "1"), 10);
    return sum + (Number.isFinite(quantity) ? Math.max(quantity, 0) : 0);
  }, 0);
}

function mapDebtToFinanceFlow(debt: InternalDebt): FinanceFlowDebt {
  return {
    id: debt.id,
    title: debt.title,
    category: debt.category,
    amount: debt.amount,
    status: debt.status,
    dueDate: debt.dueDate,
    monthLabel: debt.monthLabel,
    paymentMethod: debt.paymentMethod,
    installmentLabel: `${debt.installmentNumber}/${debt.installmentsTotal}`,
  };
}

function isDebtInMonth(debt: InternalDebt, monthStart: Date, monthEnd: Date) {
  if (!debt.dueDate) {
    return false;
  }

  const date = new Date(`${debt.dueDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date >= monthStart && date <= monthEnd;
}

function appendFlashToRedirect(
  basePath: string,
  status: "success" | "error",
  message: string,
) {
  const [path, query = ""] = basePath.split("?");
  const params = new URLSearchParams(query);
  params.set("movementStatus", status);
  params.set("movementMessage", message);
  return `${path || "/pedidos"}?${params.toString()}`;
}

async function registerEntryAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/pedidos").trim() || "/pedidos";
  const amount = Number.parseFloat(String(formData.get("amount") ?? "0").replace(",", "."));

  if (!Number.isFinite(amount) || amount < 0) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        "Informe um valor valido para a entrada manual.",
      ),
    );
  }

  const { config } = await loadFinanceConfig();
  const result = await saveFinanceConfig({
    ...config,
    tiktokMonthlyNet: amount,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel salvar a entrada manual.",
      ),
    );
  }

  revalidatePath("/pedidos");
  revalidatePath("/financeiro");
  redirect(
    appendFlashToRedirect(
      redirectTo,
      "success",
      "Entrada manual do mes atualizada com sucesso.",
    ),
  );
}

async function registerExpenseAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/pedidos").trim() || "/pedidos";
  const selectedMonth = String(formData.get("selectedMonth") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const amount = Number.parseFloat(String(formData.get("amount") ?? "0").replace(",", "."));
  const paymentMethod = String(formData.get("paymentMethod") ?? "outro").trim();
  const installments = Math.max(
    Number.parseInt(String(formData.get("installments") ?? "1"), 10) || 1,
    1,
  );
  const dueDate =
    String(formData.get("dueDate") ?? "").trim() ||
    getDefaultDebtDateForMonth(selectedMonth || formatMonthInput(new Date()));

  if (!title) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Informe o nome da saida."));
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Informe um valor valido para a saida."));
  }

  const result = await createDebt({
    title,
    amount,
    paymentMethod,
    installments,
    dueDate,
    category: "Saida manual",
    status: "aberta",
    billingFrequency: "mensal",
    impact: "",
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel registrar a saida.",
      ),
    );
  }

  revalidatePath("/pedidos");
  revalidatePath("/financeiro");
  redirect(appendFlashToRedirect(redirectTo, "success", "Saida registrada com sucesso."));
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

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(date);
}

function labelForPaymentMethod(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "pix") {
    return "Pix";
  }
  if (normalized === "boleto") {
    return "Boleto";
  }
  if (normalized === "cartao") {
    return "Cartao";
  }
  if (normalized === "transferencia") {
    return "Transferencia";
  }
  if (normalized === "dinheiro") {
    return "Dinheiro";
  }

  return value || "Outro";
}

function labelForDebtStatus(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "aberta") {
    return "Aberta";
  }
  if (normalized === "parcial") {
    return "Parcial";
  }
  if (normalized === "paga") {
    return "Paga";
  }
  if (normalized === "cancelada") {
    return "Cancelada";
  }
  if (normalized === "consumido") {
    return "Consumido";
  }

  return value;
}

function toTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function buildAnalyticsRows(
  rows: Array<{
    label: string;
    amount: number;
    detail: string;
  }>,
) {
  const filtered = rows.filter((row) => row.amount > 0);
  const total = filtered.reduce((sum, row) => sum + row.amount, 0);
  const max = filtered.reduce((largest, row) => Math.max(largest, row.amount), 0);

  return filtered
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 6)
    .map<AnalyticsRow>((row) => ({
      label: row.label,
      amount: row.amount,
      share: total > 0 ? (row.amount / total) * 100 : 0,
      width: max > 0 ? (row.amount / max) * 100 : 0,
      detail: row.detail,
    }));
}

function buildExpenseCategoryRows(
  debtRows: ReturnType<typeof buildMonthlyCashFlow>["debtRows"],
) {
  const categoryMap = new Map<string, { amount: number; count: number }>();

  for (const row of debtRows) {
    if (!row.impactInMonth) {
      continue;
    }

    const label = String(row.category || "Sem categoria").trim() || "Sem categoria";
    const current = categoryMap.get(label) ?? { amount: 0, count: 0 };
    current.amount += row.amount;
    current.count += 1;
    categoryMap.set(label, current);
  }

  return buildAnalyticsRows(
    Array.from(categoryMap.entries()).map(([label, data]) => ({
      label,
      amount: data.amount,
      detail: `${data.count} movimentacao${data.count > 1 ? "oes" : ""}`,
    })),
  );
}

function buildIncomeSourceRows(
  cashFlow: ReturnType<typeof buildMonthlyCashFlow>,
) {
  return buildAnalyticsRows(
    cashFlow.channelRows.map((row) => ({
      label: row.channel,
      amount: row.net,
      detail:
        row.channel === "TikTok Shop"
          ? "Entrada manual acumulada do mes"
          : `${row.volume} pedido${row.volume > 1 ? "s" : ""} com efeito de caixa`,
    })),
  );
}

function buildPaymentMixRows(
  nuvemRows: ReturnType<typeof buildMonthlyCashFlow>["nuvemRows"],
) {
  const paymentMap = new Map<string, { amount: number; count: number }>();

  for (const row of nuvemRows) {
    const label = row.feeLabel || "Sem regra";
    const current = paymentMap.get(label) ?? { amount: 0, count: 0 };
    current.amount += row.netReceived;
    current.count += 1;
    paymentMap.set(label, current);
  }

  return buildAnalyticsRows(
    Array.from(paymentMap.entries()).map(([label, data]) => ({
      label,
      amount: data.amount,
      detail: `${data.count} venda${data.count > 1 ? "s" : ""}`,
    })),
  );
}

function buildLedgerRows(params: {
  selectedMonth: string;
  cashFlow: ReturnType<typeof buildMonthlyCashFlow>;
  manualEntryAmount: number;
}) {
  const rows: LedgerRow[] = params.cashFlow.nuvemRows.map((row) => ({
    id: `order-${row.id}`,
    dateValue: row.referenceDate || `${params.selectedMonth}-01T00:00:00`,
    dateSort: toTimestamp(row.referenceDate || `${params.selectedMonth}-01T00:00:00`),
    kind: "entrada",
    category: "Nuvemshop",
    description: `Pedido #${row.number} · ${row.customerName}`,
    paymentLabel: `${row.paymentMethod} · ${row.installments}x`,
    entryAmount: row.netReceived,
    exitAmount: 0,
  }));

  if (params.manualEntryAmount > 0) {
    rows.push({
      id: `manual-entry-${params.selectedMonth}`,
      dateValue: `${getMonthEndDate(params.selectedMonth)}T12:00:00`,
      dateSort: toTimestamp(`${getMonthEndDate(params.selectedMonth)}T12:00:00`),
      kind: "entrada",
      category: "Entrada manual",
      description: "Ajuste manual do mes para TikTok Shop e outros canais.",
      paymentLabel: "Manual",
      entryAmount: params.manualEntryAmount,
      exitAmount: 0,
    });
  }

  for (const row of params.cashFlow.debtRows) {
    if (!row.impactInMonth) {
      continue;
    }

    rows.push({
      id: `debt-${row.id}`,
      dateValue: `${row.dueDate}T12:00:00`,
      dateSort: toTimestamp(`${row.dueDate}T12:00:00`),
      kind: "saida",
      category: row.category,
      description: row.title,
      paymentLabel: labelForPaymentMethod(row.paymentMethod),
      entryAmount: 0,
      exitAmount: row.amount,
    });
  }

  return rows.sort((left, right) => right.dateSort - left.dateSort);
}

export default async function PedidosPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const selectedMonth = getSelectedMonth(resolvedSearchParams);
  const { start: monthStart, end: monthEnd, monthLabel } = getMonthRange(selectedMonth);
  const dayStats = getMonthDayStats(selectedMonth);
  const movementStatus = getSearchValue(resolvedSearchParams, "movementStatus");
  const movementMessage = getSearchValue(resolvedSearchParams, "movementMessage");
  const redirectTo = `/pedidos?month=${selectedMonth}`;
  const movementSheetId = `movement-sheet-${selectedMonth.replace("-", "")}`;
  const entryModeId = `${movementSheetId}-entry`;
  const expenseModeId = `${movementSheetId}-expense`;
  const credentials = getNuvemshopCredentials();

  try {
    const [{ config }, debtsData] = await Promise.all([
      loadFinanceConfig(),
      loadDebtModuleData(),
    ]);

    let orders: FinanceFlowOrder[] = [];
    let nuvemshopState: MonthlyFinanceFlowData["nuvemshop"];

    if (!credentials.ok) {
      nuvemshopState = {
        ok: false,
        message: `Nuvemshop sem credenciais completas: ${credentials.missing.join(", ")}.`,
      };
    } else {
      try {
        const client = new NuvemshopClient(credentials.credentials);
        const allOrders = await fetchAllOrders(client);

        orders = allOrders
          .filter((order) => orderHasCashEffectInMonth(order, monthStart, monthEnd))
          .map((order) => mapOrderToFinanceFlow(order))
          .filter((order) => order.total > 0)
          .sort((left, right) => {
            const leftDate = left.referenceDate ? new Date(left.referenceDate).getTime() : 0;
            const rightDate = right.referenceDate ? new Date(right.referenceDate).getTime() : 0;
            return rightDate - leftDate;
          });

        nuvemshopState = {
          ok: true,
          message:
            orders.length > 0
              ? "Entradas da Nuvemshop carregadas para o mes selecionado."
              : "Nuvemshop conectada. Nenhum pedido com entrada neste mes.",
        };
      } catch (error) {
        const message =
          error instanceof NuvemshopApiError
            ? `${error.message} (${error.status}) ${error.body}`
            : "Nao foi possivel carregar os pedidos da Nuvemshop.";

        nuvemshopState = {
          ok: false,
          message,
        };
      }
    }

    const debts = debtsData.debts
      .filter((debt) => isDebtInMonth(debt, monthStart, monthEnd))
      .map(mapDebtToFinanceFlow);

    const flow: MonthlyFinanceFlowData = {
      selectedMonth,
      monthLabel,
      orders,
      allOrders: orders,
      period: {
        startDate: null,
        endDate: null,
        label: monthLabel,
      },
      debts,
      nuvemshop: nuvemshopState,
      debtsSource: {
        ok: debtsData.persistence.enabled,
        message: debtsData.persistence.message,
      },
    };

    const cashFlow = buildMonthlyCashFlow(config, flow);
    const grossRevenue = cashFlow.nuvemRows.reduce((sum, row) => sum + row.total, 0);
    const netRevenue = cashFlow.nuvemRows.reduce((sum, row) => sum + row.netReceived, 0);
    const totalFees = cashFlow.nuvemRows.reduce((sum, row) => sum + row.feeCost, 0);
    const averageDailyEntry = cashFlow.entradasTotais / Math.max(dayStats.elapsedDays, 1);
    const projectedMonthEntry = dayStats.isCurrentMonth
      ? averageDailyEntry * dayStats.totalDays
      : cashFlow.entradasTotais;
    const projectedMonthBalance = projectedMonthEntry - cashFlow.saidasTotais;
    const expenseCategoryRows = buildExpenseCategoryRows(cashFlow.debtRows);
    const incomeSourceRows = buildIncomeSourceRows(cashFlow);
    const paymentMixRows = buildPaymentMixRows(cashFlow.nuvemRows);
    const ledgerRows = buildLedgerRows({
      selectedMonth,
      cashFlow,
      manualEntryAmount: Math.max(config.tiktokMonthlyNet, 0),
    });
    const biggestExpense = expenseCategoryRows[0] ?? null;
    const biggestIncome = incomeSourceRows[0] ?? null;
    const topPaymentMix = paymentMixRows[0] ?? null;

    return (
      <AppShell
        title="Financeiro"
        subtitle="Leitura rapida do caixa, com foco nas principais entradas, maiores gastos e no saldo do mes."
        currentPath="/pedidos"
      >
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Painel do mes</div>
              <p className={styles.sectionSubtitle}>
                Escolha a competencia e acompanhe rapidamente de onde o dinheiro esta vindo e para onde ele esta indo.
              </p>
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chip}>Competencia: {monthLabel}</span>
              <span className={styles.chip}>
                Entradas: {cashFlow.nuvemRows.length + (config.tiktokMonthlyNet > 0 ? 1 : 0)}
              </span>
              <span className={styles.chip}>
                Saidas: {cashFlow.debtRows.filter((row) => row.impactInMonth).length}
              </span>
            </div>
          </div>

          <div className={styles.financeTopGrid}>
            <article className={styles.financeActionCard}>
              <form className={styles.formStack} method="get">
                <label className={styles.filterField}>
                  <span>Competencia</span>
                  <input type="month" name="month" defaultValue={selectedMonth} />
                </label>
                <div className={styles.filterActions}>
                  <button type="submit" className={styles.primaryButton}>
                    Filtrar
                  </button>
                  <a href="/pedidos" className={styles.secondaryButton}>
                    Voltar ao atual
                  </a>
                </div>
              </form>
            </article>

            <article className={styles.financeActionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.listTitle}>Registrar movimentacao</div>
                  <p className={styles.sectionSubtitle}>
                    Use um unico fluxo para atualizar a entrada manual do mes ou registrar uma nova saida.
                  </p>
                </div>
                <div className={styles.financeInlineValue}>
                  {formatMoney(cashFlow.saldoProjetado)}
                </div>
              </div>

              <input id={movementSheetId} type="checkbox" className={styles.sheetToggle} />
              <label htmlFor={movementSheetId} className={styles.primaryButton}>
                Registrar movimentacao
              </label>
              <label htmlFor={movementSheetId} className={styles.sheetOverlay} aria-hidden="true" />

              <div className={styles.sheetPanel}>
                <div className={styles.sheetHeader}>
                  <div className={styles.sheetTitle}>Registrar movimentacao</div>
                  <label htmlFor={movementSheetId} className={styles.sheetClose}>
                    Fechar
                  </label>
                </div>

                <div className={styles.movementTypeGrid}>
                  <input
                    id={entryModeId}
                    type="radio"
                    name={`movement-mode-${selectedMonth}`}
                    className={`${styles.movementTypeInput} ${styles.movementTypeEntry}`}
                    defaultChecked
                  />
                  <label htmlFor={entryModeId} className={styles.movementTypeLabel}>
                    Entrada
                  </label>

                  <input
                    id={expenseModeId}
                    type="radio"
                    name={`movement-mode-${selectedMonth}`}
                    className={`${styles.movementTypeInput} ${styles.movementTypeExpense}`}
                  />
                  <label htmlFor={expenseModeId} className={styles.movementTypeLabel}>
                    Saida
                  </label>

                  <div className={styles.movementPanels}>
                    <div className={`${styles.movementPanel} ${styles.movementPanelEntry}`}>
                      <p className={styles.movementHelper}>
                        Atualize a entrada manual acumulada do mes para TikTok Shop, venda direta
                        ou outros canais nao integrados.
                      </p>

                      <form action={registerEntryAction} className={styles.formStack}>
                        <input type="hidden" name="redirectTo" value={redirectTo} />

                        <label className={styles.filterField}>
                          <span>Entrada manual do mes</span>
                          <input
                            type="number"
                            name="amount"
                            min="0"
                            step="0.01"
                            defaultValue={config.tiktokMonthlyNet}
                            placeholder="0,00"
                            required
                          />
                        </label>

                        <div className={styles.filterActions}>
                          <button type="submit" className={styles.primaryButton}>
                            Salvar entrada
                          </button>
                          <label htmlFor={movementSheetId} className={styles.secondaryButton}>
                            Cancelar
                          </label>
                        </div>
                      </form>
                    </div>

                    <div className={`${styles.movementPanel} ${styles.movementPanelExpense}`}>
                      <p className={styles.movementHelper}>
                        Registre uma conta nova para ela aparecer imediatamente nas saidas do mes e
                        no extrato financeiro.
                      </p>

                      <form action={registerExpenseAction} className={styles.formStack}>
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <input type="hidden" name="selectedMonth" value={selectedMonth} />

                        <label className={styles.filterField}>
                          <span>Nome da saida</span>
                          <input
                            type="text"
                            name="title"
                            placeholder="Ex.: Trafego, fornecedor, embalagem"
                            required
                          />
                        </label>

                        <label className={styles.filterField}>
                          <span>Valor</span>
                          <input
                            type="number"
                            name="amount"
                            min="0"
                            step="0.01"
                            placeholder="0,00"
                            required
                          />
                        </label>

                        <label className={styles.filterField}>
                          <span>Como foi paga</span>
                          <select name="paymentMethod" defaultValue="pix">
                            <option value="pix">Pix</option>
                            <option value="cartao">Cartao</option>
                            <option value="boleto">Boleto</option>
                            <option value="transferencia">Transferencia</option>
                            <option value="dinheiro">Dinheiro</option>
                            <option value="outro">Outro</option>
                          </select>
                        </label>

                        <label className={styles.filterField}>
                          <span>Em quantas vezes</span>
                          <input
                            type="number"
                            name="installments"
                            min="1"
                            step="1"
                            defaultValue="1"
                            required
                          />
                        </label>

                        <label className={styles.filterField}>
                          <span>Primeiro vencimento</span>
                          <input
                            type="date"
                            name="dueDate"
                            defaultValue={getDefaultDebtDateForMonth(selectedMonth)}
                            required
                          />
                        </label>

                        <div className={styles.filterActions}>
                          <button type="submit" className={styles.primaryButton}>
                            Salvar saida
                          </button>
                          <label htmlFor={movementSheetId} className={styles.secondaryButton}>
                            Cancelar
                          </label>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>

          {movementMessage ? (
            <div className={movementStatus === "success" ? styles.callout : styles.warningPanel}>
              <h3>
                {movementStatus === "success"
                  ? "Movimentacao atualizada"
                  : "Nao foi possivel salvar"}
              </h3>
              <p>{movementMessage}</p>
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Resumo financeiro</div>
              <p className={styles.sectionSubtitle}>
                Mantive a leitura essencial do mes e deixei o foco nas metricas que ajudam a
                decidir mais rapido.
              </p>
            </div>
          </div>

          <div className={styles.metricGrid}>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Entradas do mes</div>
              <div className={styles.metricValue}>{formatMoney(cashFlow.entradasTotais)}</div>
              <div className={styles.metricHint}>
                Liquido estimado da Nuvemshop mais entrada manual acumulada
              </div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Faturamento</div>
              <div className={styles.metricValue}>{formatMoney(grossRevenue)}</div>
              <div className={styles.metricHint}>Valor bruto vendido na Nuvemshop no mes</div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Faturamento liquido</div>
              <div className={styles.metricValue}>{formatMoney(netRevenue)}</div>
              <div className={styles.metricHint}>
                Faturamento menos {formatMoney(totalFees)} de taxa
              </div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Saidas do mes</div>
              <div className={styles.metricValue}>{formatMoney(cashFlow.saidasTotais)}</div>
              <div className={styles.metricHint}>
                Dividas e compromissos vencendo nesta competencia
              </div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Saldo do mes</div>
              <div className={styles.metricValue}>{formatMoney(cashFlow.saldoProjetado)}</div>
              <div className={styles.metricHint}>Entradas atuais menos saidas ja registradas</div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Projecao liquida</div>
              <div className={styles.metricValue}>{formatMoney(projectedMonthEntry)}</div>
              <div className={styles.metricHint}>
                {dayStats.isCurrentMonth
                  ? `Media diaria liquida de ${formatMoney(averageDailyEntry)} para fechar o mes. Saldo projetado: ${formatMoney(projectedMonthBalance)}`
                  : "Mes encerrado. A projecao bate com o valor final da competencia."}
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Analise rapida</div>
              <p className={styles.sectionSubtitle}>
                Graficos leves para destacar os maiores pesos da operacao sem aumentar a carga da
                consulta.
              </p>
            </div>
          </div>

          <div className={styles.financeChartGrid}>
            <article className={styles.configCard}>
              <div className={styles.listTitle}>Para onde o dinheiro esta indo</div>
              <p className={styles.sectionSubtitle}>
                Ranking das categorias de saida com maior impacto no caixa desta competencia.
              </p>

              {expenseCategoryRows.length > 0 ? (
                <div className={styles.chartGrid}>
                  {expenseCategoryRows.map((row) => (
                    <div key={row.label} className={styles.chartRow}>
                      <div className={styles.chartLabel}>
                        <strong>{row.label}</strong>
                        <span>{row.detail}</span>
                      </div>
                      <div className={styles.chartTrack}>
                        <div
                          className={`${styles.chartBar} ${styles.chartBarExit}`}
                          style={{ width: `${row.width}%` }}
                        />
                      </div>
                      <div className={styles.chartValue}>
                        {formatMoney(row.amount)} · {formatPercent(row.share)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  Nenhuma saida com impacto encontrada para este mes.
                </div>
              )}
            </article>

            <article className={styles.configCard}>
              <div className={styles.listTitle}>De onde o dinheiro esta vindo</div>
              <p className={styles.sectionSubtitle}>
                Visao por origem de entrada para identificar rapidamente seu canal principal.
              </p>

              {incomeSourceRows.length > 0 ? (
                <div className={styles.chartGrid}>
                  {incomeSourceRows.map((row) => (
                    <div key={row.label} className={styles.chartRow}>
                      <div className={styles.chartLabel}>
                        <strong>{row.label}</strong>
                        <span>{row.detail}</span>
                      </div>
                      <div className={styles.chartTrack}>
                        <div
                          className={`${styles.chartBar} ${styles.chartBarEntry}`}
                          style={{ width: `${row.width}%` }}
                        />
                      </div>
                      <div className={styles.chartValue}>
                        {formatMoney(row.amount)} · {formatPercent(row.share)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>Nenhuma entrada encontrada para este mes.</div>
              )}
            </article>

            <article className={styles.configCard}>
              <div className={styles.listTitle}>Entradas Nuvemshop por pagamento</div>
              <p className={styles.sectionSubtitle}>
                Distribuicao do liquido por regra de pagamento para leitura mais operacional.
              </p>

              {paymentMixRows.length > 0 ? (
                <div className={styles.chartGrid}>
                  {paymentMixRows.map((row) => (
                    <div key={row.label} className={styles.chartRow}>
                      <div className={styles.chartLabel}>
                        <strong>{row.label}</strong>
                        <span>{row.detail}</span>
                      </div>
                      <div className={styles.chartTrack}>
                        <div
                          className={`${styles.chartBar} ${styles.chartBarEntry}`}
                          style={{ width: `${row.width}%` }}
                        />
                      </div>
                      <div className={styles.chartValue}>
                        {formatMoney(row.amount)} · {formatPercent(row.share)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  Nenhuma entrada Nuvemshop encontrada para este mes.
                </div>
              )}
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.financeInsightGrid}>
            <article className={styles.definitionCard}>
              <div className={styles.metricLabel}>Maior gasto</div>
              <div className={styles.financeKeyValue}>
                {biggestExpense ? biggestExpense.label : "Sem saidas"}
              </div>
              <div className={styles.metricHint}>
                {biggestExpense
                  ? `${formatMoney(biggestExpense.amount)} · ${formatPercent(biggestExpense.share)} das saidas`
                  : "Nenhuma categoria de saida com impacto no mes."}
              </div>
            </article>

            <article className={styles.definitionCard}>
              <div className={styles.metricLabel}>Principal origem</div>
              <div className={styles.financeKeyValue}>
                {biggestIncome ? biggestIncome.label : "Sem entradas"}
              </div>
              <div className={styles.metricHint}>
                {biggestIncome
                  ? `${formatMoney(biggestIncome.amount)} · ${formatPercent(biggestIncome.share)} das entradas`
                  : "Nenhuma entrada registrada na competencia."}
              </div>
            </article>

            <article className={styles.definitionCard}>
              <div className={styles.metricLabel}>Meio mais forte da Nuvemshop</div>
              <div className={styles.financeKeyValue}>
                {topPaymentMix ? topPaymentMix.label : "Sem vendas"}
              </div>
              <div className={styles.metricHint}>
                {topPaymentMix
                  ? `${formatMoney(topPaymentMix.amount)} em recebimento liquido`
                  : "Sem pedidos com efeito de caixa no periodo."}
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.twoColumn}>
            <div className={flow.nuvemshop.ok ? styles.callout : styles.warningPanel}>
              <h3>Nuvemshop</h3>
              <p>{flow.nuvemshop.message}</p>
            </div>

            <div className={flow.debtsSource.ok ? styles.callout : styles.warningPanel}>
              <h3>Saidas internas</h3>
              <p>{flow.debtsSource.message}</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Extrato do mes</div>
              <p className={styles.sectionSubtitle}>
                Entradas e saidas em uma unica leitura para deixar a analise mais direta no dia a
                dia.
              </p>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th>Descricao</th>
                  <th>Pagamento</th>
                  <th>Entrada</th>
                  <th>Saida</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.length > 0 ? (
                  ledgerRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.dateValue)}</td>
                      <td
                        className={
                          row.kind === "entrada" ? styles.profitPositive : styles.profitAttention
                        }
                      >
                        {row.kind === "entrada" ? "Entrada" : "Saida"}
                      </td>
                      <td>{row.category}</td>
                      <td>{row.description}</td>
                      <td>{row.paymentLabel}</td>
                      <td className={row.entryAmount > 0 ? styles.profitPositive : undefined}>
                        {row.entryAmount > 0 ? formatMoney(row.entryAmount) : "-"}
                      </td>
                      <td className={row.exitAmount > 0 ? styles.profitAttention : undefined}>
                        {row.exitAmount > 0 ? formatMoney(row.exitAmount) : "-"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>Nenhuma movimentacao encontrada para este mes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </AppShell>
    );
  } catch (error) {
    const message =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : "Nao foi possivel carregar a tela financeira de pedidos.";

    return (
      <AppShell
        title="Financeiro"
        subtitle="Sua leitura financeira do mes."
        currentPath="/pedidos"
      >
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Erro ao carregar dados</div>
            <p className={styles.warningText}>{message}</p>
          </div>
        </section>
      </AppShell>
    );
  }
}
