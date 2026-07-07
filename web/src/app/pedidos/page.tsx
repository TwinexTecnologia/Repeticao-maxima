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
  "Vendas TikTok",
  "Vendas loja",
  "DTF",
  "Fornecedor",
  "Marketing",
  "Frete",
  "Embalagem",
  "Operacional",
  "Imposto",
  "Retirada",
  "Transferencia",
  "Outro",
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

type LedgerRow = ManualFinanceMovement & {
  balanceAfter: number;
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

  return {
    start,
    monthLabel: new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(start),
  };
}

function getMonthStartDate(selectedMonth: string) {
  return `${selectedMonth}-01`;
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
    runningBalance += movement.type === "entrada" ? movement.amount : -movement.amount;
    rows.push({
      ...movement,
      balanceAfter: runningBalance,
    });
  }

  return rows.reverse();
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
        `Informe o nome da ${type === "entrada" ? "entrada" : "saida"}.`,
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

  return (
    <form action={registerMovementAction} className={styles.formStack}>
      <input type="hidden" name="redirectTo" value={props.redirectTo} />
      <input type="hidden" name="type" value={props.type} />

      <label className={styles.filterField}>
        <span>{isEntry ? "Nome da entrada" : "Nome da saida"}</span>
        <input
          type="text"
          name="title"
          placeholder={
            isEntry
              ? "Ex.: Vendas TikTok, aporte, Pix recebido"
              : "Ex.: DTF, fornecedor, trafego"
          }
          required
        />
      </label>

      <label className={styles.filterField}>
        <span>Categoria</span>
        <select name="category" defaultValue={isEntry ? "Vendas TikTok" : "Operacional"}>
          {MOVEMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.filterField}>
        <span>Valor</span>
        <input type="number" name="amount" min="0" step="0.01" placeholder="0,00" required />
      </label>

      <label className={styles.filterField}>
        <span>Como foi feito</span>
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

      <label className={styles.filterField}>
        <span>Observacao</span>
        <input
          type="text"
          name="notes"
          placeholder="Opcional"
        />
      </label>

      <div className={styles.filterActions}>
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
  const { monthLabel } = getMonthRange(selectedMonth);
  const financeStatus = getSearchValue(resolvedSearchParams, "financeStatus");
  const financeMessage = getSearchValue(resolvedSearchParams, "financeMessage");
  const redirectTo = `/pedidos?month=${selectedMonth}`;
  const currentMonth = formatMonthInput(new Date());
  const entrySheetId = `entry-sheet-${selectedMonth.replace("-", "")}`;
  const expenseSheetId = `expense-sheet-${selectedMonth.replace("-", "")}`;

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
  const currentBalance = openingBalance + totalEntries - totalExpenses;
  const ledgerRows = buildLedgerRows(manualFinanceData.movements, openingBalance);

  return (
    <AppShell
      title="Financeiro"
      subtitle="Controle manual do saldo do banco com saldo inicial, entradas, saidas e extrato do mes."
      currentPath="/pedidos"
    >
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Fluxo de caixa manual</div>
            <p className={styles.sectionSubtitle}>
              Aqui voce fixa o saldo inicial do banco e vai alimentando entradas e saidas manuais ao longo do mes.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chip}>Competencia: {monthLabel}</span>
            <span className={styles.chip}>Balanco atual: {formatMoney(currentBalance)}</span>
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
                <div className={styles.listTitle}>Saldo inicial do banco</div>
                <p className={styles.sectionSubtitle}>
                  Esse valor vira a base do mes para o balanco seguir conforme voce registra entrada e saida.
                </p>
              </div>
            </div>

            <form action={saveOpeningBalanceAction} className={styles.formStack}>
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <input type="hidden" name="selectedMonth" value={selectedMonth} />

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

              <label className={styles.filterField}>
                <span>Observacao</span>
                <input
                  type="text"
                  name="notes"
                  placeholder="Opcional"
                  defaultValue={manualFinanceData.balance?.notes || ""}
                />
              </label>

              <div className={styles.filterActions}>
                <button type="submit" className={styles.primaryButton}>
                  Fixar saldo
                </button>
              </div>
            </form>
          </article>

          <article className={styles.configCard}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.listTitle}>Movimentacoes manuais</div>
                <p className={styles.sectionSubtitle}>
                  Registre qualquer entrada ou saida conforme o extrato real do banco.
                </p>
              </div>
            </div>

            <div className={styles.filterActions}>
              <div>
                <input id={entrySheetId} type="checkbox" className={styles.sheetToggle} />
                <label htmlFor={entrySheetId} className={styles.primaryButton}>
                  Registrar entrada
                </label>
                <label htmlFor={entrySheetId} className={styles.sheetOverlay} aria-hidden="true" />

                <div className={styles.sheetPanel}>
                  <div className={styles.sheetHeader}>
                    <div className={styles.sheetTitle}>Registrar entrada</div>
                    <label htmlFor={entrySheetId} className={styles.sheetClose}>
                      Fechar
                    </label>
                  </div>
                  <MovementForm
                    type="entrada"
                    redirectTo={redirectTo}
                    selectedMonth={selectedMonth}
                    sheetId={entrySheetId}
                  />
                </div>
              </div>

              <div>
                <input id={expenseSheetId} type="checkbox" className={styles.sheetToggle} />
                <label htmlFor={expenseSheetId} className={styles.secondaryButton}>
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
                  <MovementForm
                    type="saida"
                    redirectTo={redirectTo}
                    selectedMonth={selectedMonth}
                    sheetId={expenseSheetId}
                  />
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
              Usei {formatMoney(DEFAULT_CURRENT_BANK_BALANCE)} como saldo inicial padrao deste mes, com base no valor que voce informou agora. Se quiser, clique em fixar saldo para deixar salvo no banco.
            </p>
          </div>
        ) : null}

        <div className={manualFinanceData.persistence.enabled ? styles.callout : styles.warningPanel}>
          <h3>Leitura do financeiro</h3>
          <p>{manualFinanceData.persistence.message}</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Resumo do caixa</div>
            <p className={styles.sectionSubtitle}>
              O balanco parte do saldo inicial do banco e anda conforme voce registra cada movimentacao manual.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Saldo inicial</div>
            <div className={styles.metricValue}>{formatMoney(openingBalance)}</div>
            <div className={styles.metricHint}>
              Base fixada para a competencia de {monthLabel}
            </div>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Entradas</div>
            <div className={styles.metricValue}>{formatMoney(totalEntries)}</div>
            <div className={styles.metricHint}>Tudo que entrou manualmente no banco</div>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Saidas</div>
            <div className={styles.metricValue}>{formatMoney(totalExpenses)}</div>
            <div className={styles.metricHint}>Tudo que saiu manualmente do banco</div>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Balanco atual</div>
            <div className={styles.metricValue}>{formatMoney(currentBalance)}</div>
            <div className={styles.metricHint}>Saldo inicial + entradas - saidas</div>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Movimentacoes</div>
            <div className={styles.metricValue}>{String(manualFinanceData.movements.length)}</div>
            <div className={styles.metricHint}>Lancamentos manuais registrados no mes</div>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Extrato do mes</div>
            <p className={styles.sectionSubtitle}>
              Mantive a ideia de extrato, mas agora mostrando entrada e saida no mesmo lugar com o saldo correndo.
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
                          {row.notes}
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
    </AppShell>
  );
}
