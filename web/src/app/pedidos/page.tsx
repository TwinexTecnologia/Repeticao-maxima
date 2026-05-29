import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { buildMonthlyCashFlow } from "@/lib/financeiro/calculations";
import { loadFinanceConfig } from "@/lib/financeiro/repository";
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
  };
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
  params.set("expenseStatus", status);
  params.set("expenseMessage", message);
  return `${path || "/pedidos"}?${params.toString()}`;
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

export default async function PedidosPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const selectedMonth = getSelectedMonth(resolvedSearchParams);
  const { start: monthStart, end: monthEnd, monthLabel } = getMonthRange(selectedMonth);
  const dayStats = getMonthDayStats(selectedMonth);
  const expenseStatus = getSearchValue(resolvedSearchParams, "expenseStatus");
  const expenseMessage = getSearchValue(resolvedSearchParams, "expenseMessage");
  const redirectTo = `/pedidos?month=${selectedMonth}`;
  const expenseSheetId = `expense-sheet-${selectedMonth.replace("-", "")}`;
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
      debts,
      nuvemshop: nuvemshopState,
      debtsSource: {
        ok: debtsData.persistence.enabled,
        message: debtsData.persistence.message,
      },
    };

    const cashFlow = buildMonthlyCashFlow(config, flow);
    const averageDailyEntry = cashFlow.entradasTotais / Math.max(dayStats.elapsedDays, 1);
    const projectedMonthEntry = dayStats.isCurrentMonth
      ? averageDailyEntry * dayStats.totalDays
      : cashFlow.entradasTotais;
    const projectedMonthBalance = projectedMonthEntry - cashFlow.saidasTotais;

    return (
      <AppShell
        title="Pedidos"
        subtitle="Sua leitura financeira do mes: entradas, saidas, projecao de fechamento e pedidos com nome do cliente."
        currentPath="/pedidos"
      >
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Fluxo do mes</div>
              <p className={styles.sectionSubtitle}>
                Escolha o mes e registre saidas para acompanhar quanto entrou, quanto saiu e a projecao de fechamento.
              </p>
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chip}>Competencia: {monthLabel}</span>
              <span className={styles.chip}>Pedidos com entrada: {cashFlow.nuvemRows.length}</span>
            </div>
          </div>

          <div className={styles.configGrid}>
            <article className={styles.configCard}>
              <form className={styles.formStack} method="get">
                <label className={styles.filterField}>
                  <span>Mes</span>
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

            <article className={styles.configCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.listTitle}>Saidas manuais</div>
                  <p className={styles.sectionSubtitle}>
                    Registre novas contas e parcelas para elas entrarem direto na saida do mes.
                  </p>
                </div>
              </div>

              <input id={expenseSheetId} type="checkbox" className={styles.sheetToggle} />
              <label htmlFor={expenseSheetId} className={styles.primaryButton}>
                Registrar saida
              </label>
              <label htmlFor={expenseSheetId} className={styles.sheetOverlay} aria-hidden="true" />

              <div className={styles.sheetPanel}>
                <div className={styles.sheetHeader}>
                  <div className={styles.sheetTitle}>Registrar saida</div>
                  <label htmlFor={expenseSheetId} className={styles.sheetClose}>
                    Fechar
                  </label>
                </div>

                <form action={registerExpenseAction} className={styles.formStack}>
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <input type="hidden" name="selectedMonth" value={selectedMonth} />

                  <label className={styles.filterField}>
                    <span>Nome da divida</span>
                    <input type="text" name="title" placeholder="Ex.: Trafego, fornecedor, embalagem" required />
                  </label>

                  <label className={styles.filterField}>
                    <span>Valor</span>
                    <input type="number" name="amount" min="0" step="0.01" placeholder="0,00" required />
                  </label>

                  <label className={styles.filterField}>
                    <span>Como foi feita</span>
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
                    <input type="number" name="installments" min="1" step="1" defaultValue="1" required />
                  </label>

                  <label className={styles.filterField}>
                    <span>Primeiro vencimento</span>
                    <input type="date" name="dueDate" defaultValue={getDefaultDebtDateForMonth(selectedMonth)} required />
                  </label>

                  <div className={styles.filterActions}>
                    <button type="submit" className={styles.primaryButton}>
                      Salvar saida
                    </button>
                    <label htmlFor={expenseSheetId} className={styles.secondaryButton}>
                      Cancelar
                    </label>
                  </div>
                </form>
              </div>
            </article>
          </div>

          {expenseMessage ? (
            <div className={expenseStatus === "success" ? styles.callout : styles.warningPanel}>
              <h3>{expenseStatus === "success" ? "Saida registrada" : "Nao foi possivel registrar"}</h3>
              <p>{expenseMessage}</p>
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Resumo financeiro</div>
              <p className={styles.sectionSubtitle}>
                O lucro estimado saiu daqui e entrou a projecao de fechamento do mes com base na media diaria.
              </p>
            </div>
          </div>

          <div className={styles.metricGrid}>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Entradas do mes</div>
              <div className={styles.metricValue}>{formatMoney(cashFlow.entradasTotais)}</div>
              <div className={styles.metricHint}>Liquido estimado da Nuvemshop mais entradas manuais</div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Saidas do mes</div>
              <div className={styles.metricValue}>{formatMoney(cashFlow.saidasTotais)}</div>
              <div className={styles.metricHint}>Dividas e compromissos vencendo nesta competencia</div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Saldo do mes</div>
              <div className={styles.metricValue}>{formatMoney(cashFlow.saldoProjetado)}</div>
              <div className={styles.metricHint}>Entradas atuais menos saidas ja registradas</div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Projecao de fechamento</div>
              <div className={styles.metricValue}>{formatMoney(projectedMonthEntry)}</div>
              <div className={styles.metricHint}>
                {dayStats.isCurrentMonth
                  ? `Media diaria de ${formatMoney(averageDailyEntry)} para fechar o mes. Saldo projetado: ${formatMoney(projectedMonthBalance)}`
                  : "Mes encerrado. A projecao bate com o valor final da competencia."}
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
              <div className={styles.sectionTitle}>Saidas do mes</div>
              <p className={styles.sectionSubtitle}>
                Aqui voce acompanha o que ja saiu ou ainda vence no mes selecionado.
              </p>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Divida</th>
                  <th>Categoria</th>
                  <th>Pagamento</th>
                  <th>Parcela</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cashFlow.debtRows.length > 0 ? (
                  cashFlow.debtRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.category}</td>
                      <td>{labelForPaymentMethod(row.paymentMethod)}</td>
                      <td>{row.installmentLabel}</td>
                      <td>{formatDate(row.dueDate)}</td>
                      <td>{formatMoney(row.amount)}</td>
                      <td
                        className={
                          row.status === "paga"
                            ? styles.profitPositive
                            : row.status === "cancelada"
                              ? styles.footerNote
                              : styles.profitAttention
                        }
                      >
                        {labelForDebtStatus(row.status)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>Nenhuma saida encontrada para este mes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Pedidos com entrada no mes</div>
              <p className={styles.sectionSubtitle}>
                Mantive o nome de quem fez o pedido e a leitura de quanto cada venda deixou liquido no caixa.
              </p>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Pagamento</th>
                  <th>Bruto</th>
                  <th>Taxa estimada</th>
                  <th>Liquido estimado</th>
                  <th>Cupom</th>
                </tr>
              </thead>
              <tbody>
                {cashFlow.nuvemRows.length > 0 ? (
                  cashFlow.nuvemRows.map((row) => (
                    <tr key={row.id}>
                      <td>#{row.number}</td>
                      <td>{row.customerName}</td>
                      <td>{row.referenceDate ? formatDateTime(row.referenceDate) : "-"}</td>
                      <td>{`${row.paymentMethod} · ${row.installments}x`}</td>
                      <td>{formatMoney(row.total)}</td>
                      <td>{formatMoney(row.feeCost)}</td>
                      <td className={styles.profitPositive}>{formatMoney(row.netReceived)}</td>
                      <td>{row.couponCode || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>Nenhum pedido com efeito de caixa neste mes.</td>
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
        title="Pedidos"
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
