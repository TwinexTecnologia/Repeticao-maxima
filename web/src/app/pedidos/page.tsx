import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import {
  createManualFinanceMovement,
  loadManualFinanceModuleData,
  saveMonthlyOpeningBalance,
  type DebtPaymentMethod,
  type FinancialMovementType,
  type ManualFinanceMovement,
} from "@/lib/operacoes/repository";

const DEFAULT_CURRENT_BANK_BALANCE = 331.34;

const MOVEMENT_CATEGORIES = [
  "Venda direta",
  "Vendas loja",
  "Marketplace",
  "Atacado",
  "Aporte",
  "Fornecedor",
  "DTF",
  "Frete",
  "Trafego pago",
  "Embalagem",
  "Operacional",
  "Imposto",
  "Influenciadores",
  "Outros",
] as const;

const PAYMENT_METHOD_OPTIONS: Array<{
  value: DebtPaymentMethod;
  label: string;
}> = [
  { value: "pix", label: "Pix" },
  { value: "cartao", label: "Cartao" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferencia" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "outro", label: "Outro" },
];

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

type LedgerRow = ManualFinanceMovement & {
  balanceAfter: number;
};

type TrendPoint = {
  day: number;
  label: string;
  value: number;
  x: number;
  y: number;
};

type WeeklyRow = {
  label: string;
  rangeLabel: string;
  entryAmount: number;
  exitAmount: number;
  entryHeight: number;
  exitHeight: number;
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

function formatCompactCurrency(value: number) {
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toFixed(1).replace(".", ",")}k`;
  }

  return formatMoney(value);
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
    totalDays: end.getDate(),
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

function getDefaultMovementDateForMonth(selectedMonth: string) {
  const today = new Date();
  const currentMonth = formatMonthInput(today);

  if (currentMonth === selectedMonth) {
    return `${selectedMonth}-${String(today.getDate()).padStart(2, "0")}`;
  }

  return getMonthStartDate(selectedMonth);
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

function labelForMovementType(value: FinancialMovementType) {
  return value === "entrada" ? "Entrada" : "Saida";
}

function buildLedgerRows(
  movements: ManualFinanceMovement[],
  openingBalance: number,
) {
  let runningBalance = openingBalance;
  const rows: LedgerRow[] = [];

  for (const movement of movements) {
    runningBalance += movement.type === "entrada" ? movement.amount : movement.amount * -1;
    rows.push({
      ...movement,
      balanceAfter: runningBalance,
    });
  }

  return rows.reverse();
}

function buildAnalyticsRows(
  movements: ManualFinanceMovement[],
  type: FinancialMovementType,
) {
  const categoryMap = new Map<string, { amount: number; count: number }>();

  for (const movement of movements) {
    if (movement.type !== type) {
      continue;
    }

    const label = String(movement.category || "Sem categoria").trim() || "Sem categoria";
    const current = categoryMap.get(label) ?? { amount: 0, count: 0 };
    current.amount += movement.amount;
    current.count += 1;
    categoryMap.set(label, current);
  }

  const rows = Array.from(categoryMap.entries()).map(([label, data]) => ({
    label,
    amount: data.amount,
    detail: `${data.count} movimentacao${data.count > 1 ? "oes" : ""}`,
  }));

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const max = rows.reduce((largest, row) => Math.max(largest, row.amount), 0);

  return rows
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 6)
    .map<AnalyticsRow>((row) => ({
      ...row,
      share: total > 0 ? (row.amount / total) * 100 : 0,
      width: max > 0 ? (row.amount / max) * 100 : 0,
    }));
}

function buildTrendPoints(
  movements: ManualFinanceMovement[],
  openingBalance: number,
  selectedMonth: string,
) {
  const { totalDays } = getMonthRange(selectedMonth);
  const balances: number[] = [];
  let runningBalance = openingBalance;

  for (let day = 1; day <= totalDays; day += 1) {
    const dateValue = `${selectedMonth}-${String(day).padStart(2, "0")}`;
    const dayMovements = movements.filter((movement) => movement.movementDate === dateValue);

    for (const movement of dayMovements) {
      runningBalance += movement.type === "entrada" ? movement.amount : movement.amount * -1;
    }

    balances.push(runningBalance);
  }

  const min = balances.reduce((smallest, value) => Math.min(smallest, value), openingBalance);
  const max = balances.reduce((largest, value) => Math.max(largest, value), openingBalance);
  const spread = max - min || 1;
  const monthText = selectedMonth.split("-")[1] || "01";

  return balances.map<TrendPoint>((value, index) => {
    const ratio = (value - min) / spread;

    return {
      day: index + 1,
      label: `${String(index + 1).padStart(2, "0")}/${monthText}`,
      value,
      x: totalDays === 1 ? 50 : (index / (totalDays - 1)) * 100,
      y: 92 - ratio * 68,
    };
  });
}

function buildTrendPath(points: TrendPoint[]) {
  if (points.length === 0) {
    return "";
  }

  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function buildWeeklyRows(
  movements: ManualFinanceMovement[],
  selectedMonth: string,
) {
  const { totalDays } = getMonthRange(selectedMonth);
  const rows: WeeklyRow[] = [];

  for (let startDay = 1; startDay <= totalDays; startDay += 7) {
    const endDay = Math.min(startDay + 6, totalDays);
    const entryAmount = movements
      .filter((movement) => {
        if (movement.type !== "entrada") {
          return false;
        }

        const day = Number.parseInt(movement.movementDate.slice(-2), 10);
        return day >= startDay && day <= endDay;
      })
      .reduce((sum, movement) => sum + movement.amount, 0);
    const exitAmount = movements
      .filter((movement) => {
        if (movement.type !== "saida") {
          return false;
        }

        const day = Number.parseInt(movement.movementDate.slice(-2), 10);
        return day >= startDay && day <= endDay;
      })
      .reduce((sum, movement) => sum + movement.amount, 0);

    rows.push({
      label: `Semana ${rows.length + 1}`,
      rangeLabel: `${String(startDay).padStart(2, "0")}/${selectedMonth.slice(-2)} - ${String(endDay).padStart(2, "0")}/${selectedMonth.slice(-2)}`,
      entryAmount,
      exitAmount,
      entryHeight: 0,
      exitHeight: 0,
    });
  }

  const maxAmount = rows.reduce(
    (largest, row) => Math.max(largest, row.entryAmount, row.exitAmount),
    0,
  );

  return rows.map((row) => ({
    ...row,
    entryHeight: row.entryAmount > 0 ? Math.max((row.entryAmount / (maxAmount || 1)) * 100, 12) : 0,
    exitHeight: row.exitAmount > 0 ? Math.max((row.exitAmount / (maxAmount || 1)) * 100, 12) : 0,
  }));
}

function appendFlashToRedirect(
  basePath: string,
  status: "success" | "error",
  message: string,
) {
  const [path, query = ""] = basePath.split("?");
  const params = new URLSearchParams(query);
  params.set("financeStatus", status);
  params.set("financeMessage", message);
  return `${path || "/pedidos"}?${params.toString()}`;
}

async function saveOpeningBalanceAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/pedidos").trim() || "/pedidos";
  const selectedMonth = String(formData.get("selectedMonth") ?? "").trim();
  const openingBalance = Number.parseFloat(
    String(formData.get("openingBalance") ?? "0").replace(",", "."),
  );
  const notes = String(formData.get("notes") ?? "").trim();

  if (!/^\d{4}-\d{2}$/.test(selectedMonth)) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Informe o mes do saldo inicial."));
  }

  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        "Informe um saldo inicial valido para o banco.",
      ),
    );
  }

  const result = await saveMonthlyOpeningBalance({
    monthRef: selectedMonth,
    openingBalance,
    notes,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel salvar o saldo inicial.",
      ),
    );
  }

  revalidatePath("/pedidos");
  revalidatePath("/financeiro");
  redirect(appendFlashToRedirect(redirectTo, "success", "Saldo inicial salvo com sucesso."));
}

async function registerMovementAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/pedidos").trim() || "/pedidos";
  const title = String(formData.get("title") ?? "").trim();
  const amount = Number.parseFloat(String(formData.get("amount") ?? "0").replace(",", "."));
  const type = String(formData.get("type") ?? "saida").trim().toLowerCase() === "entrada"
    ? "entrada"
    : "saida";
  const category = String(formData.get("category") ?? "").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "outro").trim();
  const movementDate = String(formData.get("movementDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!title) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        `Informe a descricao da ${type === "entrada" ? "entrada" : "saida"}.`,
      ),
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        `Informe um valor valido para a ${type === "entrada" ? "entrada" : "saida"}.`,
      ),
    );
  }

  const result = await createManualFinanceMovement({
    type,
    title,
    category,
    amount,
    paymentMethod,
    movementDate,
    notes,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel salvar a movimentacao.",
      ),
    );
  }

  revalidatePath("/pedidos");
  revalidatePath("/financeiro");
  redirect(
    appendFlashToRedirect(
      redirectTo,
      "success",
      type === "entrada"
        ? "Entrada registrada com sucesso."
        : "Saida registrada com sucesso.",
    ),
  );
}

function MovementForm(props: {
  type: FinancialMovementType;
  redirectTo: string;
  selectedMonth: string;
  sheetId: string;
}) {
  const isEntry = props.type === "entrada";
  const monthLabel = getMonthRange(props.selectedMonth).monthLabel;

  return (
    <form action={registerMovementAction} className={styles.formStack}>
      <input type="hidden" name="redirectTo" value={props.redirectTo} />
      <input type="hidden" name="type" value={props.type} />

      <div className={styles.movementFormIntro}>
        <span className={styles.movementFormBadge}>
          {isEntry ? "Receita e recebimento" : "Despesa e pagamento"}
        </span>
        <p className={styles.movementFormText}>
          {isEntry
            ? "Preencha a entrada exatamente como ela apareceu no banco."
            : "Registre a saida com categoria, pagamento e observacoes do lancamento."}
        </p>
      </div>

      <div className={styles.movementFormGrid}>
        <label className={styles.filterField}>
          <span>Competencia</span>
          <input type="text" value={monthLabel} readOnly />
        </label>

        <label className={styles.filterField}>
          <span>Categoria</span>
          <select name="category" defaultValue={isEntry ? "Venda direta" : "Fornecedor"}>
            {MOVEMENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className={`${styles.filterField} ${styles.movementFieldWide}`}>
          <span>Descricao</span>
          <input
            type="text"
            name="title"
            placeholder={
              isEntry
                ? "Ex.: Venda via Instagram, Pix recebido, aporte"
                : "Ex.: Compra de DTF, fornecedor, embalagem"
            }
            required
          />
        </label>

        <label className={styles.filterField}>
          <span>Valor</span>
          <input type="number" name="amount" min="0" step="0.01" placeholder="0,00" required />
        </label>

        <label className={styles.filterField}>
          <span>Pagamento</span>
          <select name="paymentMethod" defaultValue="pix">
            {PAYMENT_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span>Data</span>
          <input
            type="date"
            name="movementDate"
            defaultValue={getDefaultMovementDateForMonth(props.selectedMonth)}
            required
          />
        </label>

        <label className={`${styles.filterField} ${styles.movementFieldWide}`}>
          <span>Observacao</span>
          <input type="text" name="notes" placeholder="Opcional" />
        </label>
      </div>

      <div className={`${styles.filterActions} ${styles.movementFormActions}`}>
        <button type="submit" className={styles.primaryButton}>
          {isEntry ? "Salvar entrada" : "Salvar saida"}
        </button>
        <label htmlFor={props.sheetId} className={styles.secondaryButton}>
          Cancelar
        </label>
      </div>
    </form>
  );
}

export default async function PedidosPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const selectedMonth = getSelectedMonth(resolvedSearchParams);
  const { monthLabel, totalDays } = getMonthRange(selectedMonth);
  const financeStatus = getSearchValue(resolvedSearchParams, "financeStatus");
  const financeMessage = getSearchValue(resolvedSearchParams, "financeMessage");
  const redirectTo = `/pedidos?month=${selectedMonth}`;
  const currentMonth = formatMonthInput(new Date());
  const movementSheetId = `movement-sheet-${selectedMonth.replace("-", "")}`;
  const openingModeId = `${movementSheetId}-opening`;
  const entryModeId = `${movementSheetId}-entry`;
  const expenseModeId = `${movementSheetId}-expense`;

  const manualFinanceData = await loadManualFinanceModuleData(selectedMonth);
  const openingBalance =
    manualFinanceData.balance?.openingBalance ??
    (selectedMonth === currentMonth ? DEFAULT_CURRENT_BANK_BALANCE : 0);
  const usedDefaultOpeningBalance =
    !manualFinanceData.balance && selectedMonth === currentMonth;
  const totalEntries = manualFinanceData.movements.reduce(
    (sum, movement) => sum + (movement.type === "entrada" ? movement.amount : 0),
    0,
  );
  const totalExpenses = manualFinanceData.movements.reduce(
    (sum, movement) => sum + (movement.type === "saida" ? movement.amount : 0),
    0,
  );
  const resultAmount = totalEntries - totalExpenses;
  const currentBalance = openingBalance + resultAmount;
  const cashMargin = totalEntries > 0 ? (resultAmount / totalEntries) * 100 : 0;
  const ledgerRows = buildLedgerRows(manualFinanceData.movements, openingBalance);
  const expenseRows = buildAnalyticsRows(manualFinanceData.movements, "saida");
  const incomeRows = buildAnalyticsRows(manualFinanceData.movements, "entrada");
  const trendPoints = buildTrendPoints(
    manualFinanceData.movements,
    openingBalance,
    selectedMonth,
  );
  const trendPath = buildTrendPath(trendPoints);
  const weeklyRows = buildWeeklyRows(manualFinanceData.movements, selectedMonth);
  const keyDays = Array.from(
    new Set(
      [1, 7, 14, 21, totalDays]
        .filter((day) => day <= totalDays)
        .map((day) => day),
    ),
  );
  const trendLabelDays = new Set(keyDays);

  return (
    <AppShell
      title="Financeiro"
      subtitle="Visao geral do seu fluxo de caixa"
      currentPath="/pedidos"
    >
      <section className={styles.financeCanvas}>
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
                <div className={styles.listTitle}>Registrar entrada / saida</div>
                <p className={styles.sectionSubtitle}>
                  Use o mesmo botao para definir saldo inicial, registrar entrada ou registrar
                  saida.
                </p>
              </div>
              <div className={styles.financeInlineValue}>{formatMoney(currentBalance)}</div>
            </div>

            <input id={movementSheetId} type="checkbox" className={styles.sheetToggle} />
            <label htmlFor={movementSheetId} className={styles.primaryButton}>
              Registrar movimentacao
            </label>
            <label htmlFor={movementSheetId} className={styles.sheetOverlay} aria-hidden="true" />

            <div className={styles.sheetPanel}>
              <div className={styles.sheetHeader}>
                <div>
                  <div className={styles.sheetTitle}>Registrar movimentacao</div>
                  <p className={styles.sheetSubtitle}>
                    Escolha o tipo de movimentacao e continue.
                  </p>
                </div>
                <label htmlFor={movementSheetId} className={styles.sheetClose} aria-label="Fechar">
                  ×
                </label>
              </div>

              <div className={styles.movementTypeGrid}>
                <input
                  id={openingModeId}
                  type="radio"
                  name={`movement-mode-${selectedMonth}`}
                  className={`${styles.movementTypeInput} ${styles.movementTypeOpening}`}
                  defaultChecked
                />
                <label htmlFor={openingModeId} className={styles.movementTypeLabel}>
                  <span className={styles.movementTypeCopy}>
                    <strong>Saldo inicial</strong>
                    <span>Definir saldo de abertura</span>
                  </span>
                </label>

                <input
                  id={entryModeId}
                  type="radio"
                  name={`movement-mode-${selectedMonth}`}
                  className={`${styles.movementTypeInput} ${styles.movementTypeEntry}`}
                />
                <label htmlFor={entryModeId} className={styles.movementTypeLabel}>
                  <span className={styles.movementTypeCopy}>
                    <strong>Entrada</strong>
                    <span>Receitas e recebimentos</span>
                  </span>
                </label>

                <input
                  id={expenseModeId}
                  type="radio"
                  name={`movement-mode-${selectedMonth}`}
                  className={`${styles.movementTypeInput} ${styles.movementTypeExpense}`}
                />
                <label htmlFor={expenseModeId} className={styles.movementTypeLabel}>
                  <span className={styles.movementTypeCopy}>
                    <strong>Saida</strong>
                    <span>Despesas e pagamentos</span>
                  </span>
                </label>

                <div className={styles.movementPanels}>
                  <div className={`${styles.movementPanel} ${styles.movementPanelOpening}`}>
                    <div className={styles.movementFormIntro}>
                      <span className={styles.movementFormBadge}>Base do mes</span>
                      <p className={styles.movementFormText}>
                        Defina o primeiro valor do mes para o saldo andar corretamente no extrato e
                        nos graficos.
                      </p>
                    </div>

                    <form action={saveOpeningBalanceAction} className={styles.formStack}>
                      <input type="hidden" name="redirectTo" value={redirectTo} />
                      <input type="hidden" name="selectedMonth" value={selectedMonth} />

                      <div className={styles.movementFormGrid}>
                        <label className={styles.filterField}>
                          <span>Competencia</span>
                          <input type="text" value={monthLabel} readOnly />
                        </label>

                        <label className={styles.filterField}>
                          <span>Saldo inicial</span>
                          <input
                            type="number"
                            name="openingBalance"
                            min="0"
                            step="0.01"
                            defaultValue={openingBalance.toFixed(2)}
                            required
                          />
                        </label>

                        <label className={`${styles.filterField} ${styles.movementFieldWide}`}>
                          <span>Observacao</span>
                          <input
                            type="text"
                            name="notes"
                            placeholder="Opcional"
                            defaultValue={manualFinanceData.balance?.notes || ""}
                          />
                        </label>
                      </div>

                      <div className={`${styles.filterActions} ${styles.movementFormActions}`}>
                        <button type="submit" className={styles.primaryButton}>
                          Salvar saldo inicial
                        </button>
                        <label htmlFor={movementSheetId} className={styles.secondaryButton}>
                          Cancelar
                        </label>
                      </div>
                    </form>
                  </div>

                  <div className={`${styles.movementPanel} ${styles.movementPanelEntry}`}>
                    <p className={styles.movementHelper}>
                      Entrada com categoria, descricao, data, pagamento e observacao, igual ao fluxo
                      manual anterior.
                    </p>
                    <MovementForm
                      type="entrada"
                      redirectTo={redirectTo}
                      selectedMonth={selectedMonth}
                      sheetId={movementSheetId}
                    />
                  </div>

                  <div className={`${styles.movementPanel} ${styles.movementPanelExpense}`}>
                    <p className={styles.movementHelper}>
                      Saida completa com categoria, descricao, data, pagamento e observacao.
                    </p>
                    <MovementForm
                      type="saida"
                      redirectTo={redirectTo}
                      selectedMonth={selectedMonth}
                      sheetId={movementSheetId}
                    />
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        {financeMessage ? (
          <div className={financeStatus === "success" ? styles.callout : styles.warningPanel}>
            <h3>{financeStatus === "success" ? "Financeiro atualizado" : "Nao foi possivel atualizar"}</h3>
            <p>{financeMessage}</p>
          </div>
        ) : null}

        {usedDefaultOpeningBalance ? (
          <div className={styles.callout}>
            <h3>Saldo inicial sugerido</h3>
            <p>
              Usei {formatMoney(DEFAULT_CURRENT_BANK_BALANCE)} como saldo inicial padrao deste mes.
              Se quiser, salve esse valor no mesmo botao de movimentacao.
            </p>
          </div>
        ) : null}

        <div className={styles.financeMetricGrid}>
          <article className={styles.financeMetricCard}>
            <span className={styles.financeMetricLabel}>Saldo atual</span>
            <strong className={styles.financeMetricValue}>{formatMoney(currentBalance)}</strong>
            <span className={styles.financeMetricHint}>Saldo inicial + entradas - saidas</span>
          </article>

          <article className={styles.financeMetricCard}>
            <span className={styles.financeMetricLabel}>Entradas do mes</span>
            <strong className={styles.financeMetricValue}>{formatMoney(totalEntries)}</strong>
            <span className={styles.financeMetricHint}>
              {manualFinanceData.movements.filter((item) => item.type === "entrada").length}{" "}
              registros no periodo
            </span>
          </article>

          <article className={styles.financeMetricCard}>
            <span className={styles.financeMetricLabel}>Saidas do mes</span>
            <strong className={styles.financeMetricValue}>{formatMoney(totalExpenses)}</strong>
            <span className={styles.financeMetricHint}>
              {manualFinanceData.movements.filter((item) => item.type === "saida").length}{" "}
              registros no periodo
            </span>
          </article>

          <article className={styles.financeMetricCard}>
            <span className={styles.financeMetricLabel}>Resultado do mes</span>
            <strong className={styles.financeMetricValue}>{formatMoney(resultAmount)}</strong>
            <span className={styles.financeMetricHint}>
              {resultAmount >= 0 ? "Mes positivo ate agora" : "Saidas acima das entradas"}
            </span>
          </article>

          <article className={styles.financeMetricCard}>
            <span className={styles.financeMetricLabel}>Margem de caixa</span>
            <strong className={styles.financeMetricValue}>{formatPercent(cashMargin)}</strong>
            <span className={styles.financeMetricHint}>Do total de entradas</span>
          </article>
        </div>

        <div className={styles.financeHeroGrid}>
          <article className={styles.financeGraphCard}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.listTitle}>Evolucao do caixa (diaria)</div>
                <p className={styles.sectionSubtitle}>
                  Saldo correndo do mes conforme cada movimentacao registrada.
                </p>
              </div>
            </div>

            <div className={styles.financeTrendChart}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polyline
                  points={trendPath}
                  className={styles.financeTrendLine}
                  vectorEffect="non-scaling-stroke"
                />
                {trendPoints.map((point) => (
                  <circle
                    key={`trend-${point.day}`}
                    cx={point.x}
                    cy={point.y}
                    r="1.4"
                    className={styles.financeTrendPoint}
                  />
                ))}
                {trendPoints
                  .filter((point) => trendLabelDays.has(point.day))
                  .map((point) => (
                    <g key={`trend-label-${point.day}`} transform={`translate(${point.x}, ${point.y - 7})`}>
                      <text className={styles.financeTrendLabel} textAnchor="middle">
                        {formatCompactCurrency(point.value)}
                      </text>
                    </g>
                  ))}
              </svg>
            </div>

            <div className={styles.financeTrendAxis}>
              {keyDays.map((day) => (
                <span key={`axis-${day}`}>{`${String(day).padStart(2, "0")}/${selectedMonth.slice(-2)}`}</span>
              ))}
            </div>
          </article>

          <article className={styles.financeGraphCard}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.listTitle}>Entradas x Saidas por semana</div>
                <p className={styles.sectionSubtitle}>
                  Leitura rapida para ver onde o caixa apertou ou respirou no mes.
                </p>
              </div>
            </div>

            <div className={styles.financeWeekGrid}>
              {weeklyRows.map((row) => (
                <div key={row.label} className={styles.financeWeekCard}>
                  <div className={styles.financeWeekBars}>
                    <span className={`${styles.financeWeekValue} ${styles.financeWeekValueEntry}`}>
                      {row.entryAmount > 0 ? formatCompactCurrency(row.entryAmount) : "-"}
                    </span>
                    <span
                      className={`${styles.financeWeekBar} ${styles.financeWeekBarEntry}`}
                      style={{ height: `${row.entryHeight}%` }}
                    />
                    <span className={`${styles.financeWeekValue} ${styles.financeWeekValueExit}`}>
                      {row.exitAmount > 0 ? formatCompactCurrency(row.exitAmount) : "-"}
                    </span>
                    <span
                      className={`${styles.financeWeekBar} ${styles.financeWeekBarExit}`}
                      style={{ height: `${row.exitHeight}%` }}
                    />
                  </div>
                  <strong>{row.label}</strong>
                  <span>{row.rangeLabel}</span>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className={styles.financeChartGrid}>
          <article className={styles.financeActionCard}>
            <div className={styles.listTitle}>Para onde esta indo o dinheiro</div>
            <p className={styles.sectionSubtitle}>
              Categorias com maior peso nas saidas do mes.
            </p>

            {expenseRows.length > 0 ? (
              <div className={styles.chartGrid}>
                {expenseRows.map((row) => (
                  <div key={row.label} className={styles.chartRow}>
                    <div className={styles.chartLabel}>
                      <strong>{row.label}</strong>
                      <span>{row.detail}</span>
                    </div>
                    <div className={styles.chartTrack}>
                      <div
                        className={`${styles.chartBar} ${styles.chartBarExit}`}
                        style={{ width: `${row.width}%` }}
                      >
                        <span className={styles.chartBarLabel}>{formatMoney(row.amount)}</span>
                      </div>
                    </div>
                    <div className={styles.chartValue}>
                      {formatPercent(row.share)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>Nenhuma saida registrada neste mes.</div>
            )}
          </article>

          <article className={styles.financeActionCard}>
            <div className={styles.listTitle}>De onde esta vindo o dinheiro</div>
            <p className={styles.sectionSubtitle}>
              Categorias com maior peso nas entradas do mes.
            </p>

            {incomeRows.length > 0 ? (
              <div className={styles.chartGrid}>
                {incomeRows.map((row) => (
                  <div key={row.label} className={styles.chartRow}>
                    <div className={styles.chartLabel}>
                      <strong>{row.label}</strong>
                      <span>{row.detail}</span>
                    </div>
                    <div className={styles.chartTrack}>
                      <div
                        className={`${styles.chartBar} ${styles.chartBarEntry}`}
                        style={{ width: `${row.width}%` }}
                      >
                        <span className={styles.chartBarLabel}>{formatMoney(row.amount)}</span>
                      </div>
                    </div>
                    <div className={styles.chartValue}>
                      {formatPercent(row.share)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>Nenhuma entrada registrada neste mes.</div>
            )}
          </article>

          <article className={styles.financeActionCard}>
            <div className={styles.listTitle}>Leitura rapida</div>
            <p className={styles.sectionSubtitle}>
              Resumo do financeiro manual carregado do seu banco de dados.
            </p>

            <div className={styles.financeInsightGrid}>
              <article className={styles.definitionCard}>
                <div className={styles.metricLabel}>Maior gasto</div>
                <div className={styles.financeKeyValue}>
                  {expenseRows[0]?.label ?? "Sem saidas"}
                </div>
                <div className={styles.metricHint}>
                  {expenseRows[0]
                    ? `${formatMoney(expenseRows[0].amount)} no periodo`
                    : "Nenhuma categoria de saida por enquanto."}
                </div>
              </article>

              <article className={styles.definitionCard}>
                <div className={styles.metricLabel}>Principal origem</div>
                <div className={styles.financeKeyValue}>
                  {incomeRows[0]?.label ?? "Sem entradas"}
                </div>
                <div className={styles.metricHint}>
                  {incomeRows[0]
                    ? `${formatMoney(incomeRows[0].amount)} no periodo`
                    : "Nenhuma categoria de entrada por enquanto."}
                </div>
              </article>

              <article className={styles.definitionCard}>
                <div className={styles.metricLabel}>Base atual</div>
                <div className={styles.financeKeyValue}>{formatMoney(openingBalance)}</div>
                <div className={styles.metricHint}>Saldo inicial definido para {monthLabel}</div>
              </article>
            </div>

            <div className={manualFinanceData.persistence.enabled ? styles.callout : styles.warningPanel}>
              <h3>Leitura do financeiro</h3>
              <p>{manualFinanceData.persistence.message}</p>
            </div>
          </article>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Extrato do mes</div>
              <p className={styles.sectionSubtitle}>
                Entrada e saida no mesmo lugar, com categoria, descricao, pagamento e saldo apos
                cada lancamento.
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
                  <th>Saldo apos</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.length > 0 ? (
                  ledgerRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.movementDate)}</td>
                      <td
                        className={
                          row.type === "entrada" ? styles.profitPositive : styles.profitAttention
                        }
                      >
                        {labelForMovementType(row.type)}
                      </td>
                      <td>{row.category}</td>
                      <td>
                        {row.title}
                        {row.notes ? (
                          <>
                            <br />
                            <span className={styles.tableSubtleText}>{row.notes}</span>
                          </>
                        ) : null}
                      </td>
                      <td>{labelForPaymentMethod(row.paymentMethod)}</td>
                      <td className={row.type === "entrada" ? styles.profitPositive : undefined}>
                        {row.type === "entrada" ? formatMoney(row.amount) : "-"}
                      </td>
                      <td className={row.type === "saida" ? styles.profitAttention : undefined}>
                        {row.type === "saida" ? formatMoney(row.amount) : "-"}
                      </td>
                      <td>{formatMoney(row.balanceAfter)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>Nenhuma movimentacao manual registrada neste mes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
