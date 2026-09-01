import { redirect } from "next/navigation";
import { Fragment } from "react";

import { AppShell } from "@/components/app-shell";
import { FinanceAnalyticsCharts } from "@/components/finance-analytics-charts";
import { FinanceGroupSubgroupFields } from "@/components/finance-group-subgroup-fields";
import styles from "@/components/panel.module.css";
import {
  createFinanceCategoryGroup,
  createFinanceCategorySubgroup,
  createManualFinanceMovement,
  deleteManualFinanceMovement,
  type FinanceCategoryGroup,
  loadManualFinanceModuleData,
  saveMonthlyOpeningBalance,
  type DebtPaymentMethod,
  type FinancialMovementType,
  type ManualFinanceMovement,
  updateManualFinanceMovement,
} from "@/lib/operacoes/repository";

const DEFAULT_CURRENT_BANK_BALANCE = 331.34;

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

type FinanceBreakdownGroup = {
  key: string;
  name: string;
  total: number;
  subgroups: Array<{
    key: string;
    name: string;
    total: number;
  }>;
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

function formatMonthLabel(selectedMonth: string) {
  return getMonthRange(selectedMonth).monthLabel;
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

function buildFinanceBreakdown(
  movements: ManualFinanceMovement[],
  type: FinancialMovementType,
): FinanceBreakdownGroup[] {
  const groups = new Map<
    string,
    {
      key: string;
      name: string;
      total: number;
      subgroups: Map<string, { key: string; name: string; total: number }>;
    }
  >();

  for (const movement of movements) {
    if (movement.type !== type) {
      continue;
    }

    const groupName = movement.groupName.trim() || movement.category.trim() || "Sem grupo";
    const groupKey = movement.groupId || groupName.toLowerCase();
    const currentGroup = groups.get(groupKey) ?? {
      key: groupKey,
      name: groupName,
      total: 0,
      subgroups: new Map<string, { key: string; name: string; total: number }>(),
    };

    currentGroup.total += movement.amount;

    const subgroupName = movement.subgroupName.trim();

    if (subgroupName) {
      const subgroupKey = movement.subgroupId || `${groupKey}:${subgroupName.toLowerCase()}`;
      const currentSubgroup = currentGroup.subgroups.get(subgroupKey) ?? {
        key: subgroupKey,
        name: subgroupName,
        total: 0,
      };

      currentSubgroup.total += movement.amount;
      currentGroup.subgroups.set(subgroupKey, currentSubgroup);
    }

    groups.set(groupKey, currentGroup);
  }

  return Array.from(groups.values())
    .map((group) => ({
      key: group.key,
      name: group.name,
      total: group.total,
      subgroups: Array.from(group.subgroups.values()).sort(
        (left, right) => right.total - left.total || left.name.localeCompare(right.name, "pt-BR"),
      ),
    }))
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, "pt-BR"));
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

  redirect(appendFlashToRedirect(redirectTo, "success", "Saldo inicial salvo com sucesso."));
}

async function createFinanceGroupAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/pedidos").trim() || "/pedidos";
  const movementType =
    String(formData.get("movementType") ?? "saida").trim().toLowerCase() === "entrada"
      ? "entrada"
      : "saida";
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Informe o nome do grupo."));
  }

  const result = await createFinanceCategoryGroup({
    movementType,
    name,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel cadastrar o grupo.",
      ),
    );
  }

  redirect(appendFlashToRedirect(redirectTo, "success", "Grupo cadastrado com sucesso."));
}

async function createFinanceSubgroupAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/pedidos").trim() || "/pedidos";
  const groupId = String(formData.get("groupId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!groupId) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Selecione o grupo do subgrupo."));
  }

  if (!name) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Informe o nome do subgrupo."));
  }

  const result = await createFinanceCategorySubgroup({
    groupId,
    name,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel cadastrar o subgrupo.",
      ),
    );
  }

  redirect(appendFlashToRedirect(redirectTo, "success", "Subgrupo cadastrado com sucesso."));
}

async function saveMovementAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/pedidos").trim() || "/pedidos";
  const movementId = String(formData.get("movementId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const amount = Number.parseFloat(String(formData.get("amount") ?? "0").replace(",", "."));
  const type = String(formData.get("type") ?? "saida").trim().toLowerCase() === "entrada"
    ? "entrada"
    : "saida";
  const groupId = String(formData.get("groupId") ?? "").trim();
  const subgroupId = String(formData.get("subgroupId") ?? "").trim();
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

  if (!groupId) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        `Selecione um grupo para a ${type === "entrada" ? "entrada" : "saida"}.`,
      ),
    );
  }

  const payload = {
    type,
    title,
    groupId,
    subgroupId,
    amount,
    paymentMethod,
    movementDate,
    notes,
  };
  const result = movementId
    ? await updateManualFinanceMovement(movementId, payload)
    : await createManualFinanceMovement(payload);

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel salvar a movimentacao.",
      ),
    );
  }

  redirect(
    appendFlashToRedirect(
      redirectTo,
      "success",
        movementId
          ? type === "entrada"
            ? "Entrada atualizada com sucesso."
            : "Saida atualizada com sucesso."
          : type === "entrada"
            ? "Entrada registrada com sucesso."
            : "Saida registrada com sucesso.",
    ),
  );
}

async function deleteMovementAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/pedidos").trim() || "/pedidos";
  const movementId = String(formData.get("movementId") ?? "").trim();

  if (!movementId) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        "Nao foi possivel identificar a movimentacao para excluir.",
      ),
    );
  }

  const result = await deleteManualFinanceMovement(movementId);

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel excluir a movimentacao.",
      ),
    );
  }

  redirect(
    appendFlashToRedirect(
      redirectTo,
      "success",
      result.persistence.message || "Movimentacao excluida com sucesso.",
    ),
  );
}

function MovementForm(props: {
  type: FinancialMovementType;
  redirectTo: string;
  selectedMonth: string;
  sheetId: string;
  groups: FinanceCategoryGroup[];
  initialMovement?: ManualFinanceMovement;
}) {
  const movementType = props.initialMovement?.type ?? props.type;
  const isEntry = movementType === "entrada";
  const availableGroups = props.groups
    .filter((group) => group.active && group.movementType === movementType)
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const submitLabel = props.initialMovement
    ? isEntry
      ? "Salvar edicao da entrada"
      : "Salvar edicao da saida"
    : isEntry
      ? "Salvar entrada"
      : "Salvar saida";

  return (
    <form action={saveMovementAction} className={styles.formStack}>
      <input type="hidden" name="redirectTo" value={props.redirectTo} />
      <input type="hidden" name="movementId" value={props.initialMovement?.id || ""} />
      <input type="hidden" name="type" value={movementType} />

      <label className={styles.filterField}>
        <span>{isEntry ? "Nome da entrada" : "Nome da saida"}</span>
        <input
          type="text"
          name="title"
          defaultValue={props.initialMovement?.title || ""}
          placeholder={
            isEntry
              ? "Ex.: Vendas TikTok, aporte, Pix recebido"
              : "Ex.: DTF, fornecedor, trafego"
          }
          required
        />
      </label>

      <FinanceGroupSubgroupFields
        groups={availableGroups}
        initialGroupId={props.initialMovement?.groupId || availableGroups[0]?.id || ""}
        initialSubgroupId={props.initialMovement?.subgroupId || ""}
      />

      <label className={styles.filterField}>
        <span>Valor</span>
        <input
          type="number"
          name="amount"
          min="0"
          step="0.01"
          placeholder="0,00"
          defaultValue={props.initialMovement ? props.initialMovement.amount.toFixed(2) : ""}
          required
        />
      </label>

      <label className={styles.filterField}>
        <span>Como foi feito</span>
        <select name="paymentMethod" defaultValue={props.initialMovement?.paymentMethod || "pix"}>
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
          defaultValue={
            props.initialMovement?.movementDate || getDefaultMovementDateForMonth(props.selectedMonth)
          }
          required
        />
      </label>

      <label className={styles.filterField}>
        <span>Observacao</span>
        <input
          type="text"
          name="notes"
          defaultValue={props.initialMovement?.notes || ""}
          placeholder="Opcional"
        />
      </label>

      <div className={styles.filterActions}>
        <button type="submit" className={styles.primaryButton}>
          {submitLabel}
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
    manualFinanceData.effectiveOpeningBalance ??
    (selectedMonth === currentMonth ? DEFAULT_CURRENT_BANK_BALANCE : 0);
  const usedDefaultOpeningBalance =
    manualFinanceData.openingBalanceSource === "none" && selectedMonth === currentMonth;
  const usesInheritedOpeningBalance = manualFinanceData.openingBalanceSource === "previous_month";
  const inheritedMonthLabel = manualFinanceData.inheritedFromMonthRef
    ? formatMonthLabel(manualFinanceData.inheritedFromMonthRef)
    : "";
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
  const activeGroups = manualFinanceData.groups.filter((group) => group.active);
  const entryBreakdown = buildFinanceBreakdown(manualFinanceData.movements, "entrada");
  const expenseBreakdown = buildFinanceBreakdown(manualFinanceData.movements, "saida");

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
                  Se nao fixar nada, o sistema herda o fechamento do mes anterior automaticamente.
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
                <div className={styles.listTitle}>Grupos e subgrupos</div>
                <p className={styles.sectionSubtitle}>
                  Cadastre aqui a estrutura do financeiro para lancar cada entrada e saida de forma mais detalhada.
                </p>
              </div>
            </div>

            <div className={styles.formStack}>
              <form action={createFinanceGroupAction} className={styles.formStack}>
                <input type="hidden" name="redirectTo" value={redirectTo} />

                <label className={styles.filterField}>
                  <span>Tipo do grupo</span>
                  <select name="movementType" defaultValue="saida">
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saida</option>
                  </select>
                </label>

                <label className={styles.filterField}>
                  <span>Novo grupo</span>
                  <input type="text" name="name" placeholder="Ex.: Fornecedor, Marketing, Vendas" required />
                </label>

                <div className={styles.filterActions}>
                  <button type="submit" className={styles.primaryButton}>
                    Cadastrar grupo
                  </button>
                </div>
              </form>

              <form action={createFinanceSubgroupAction} className={styles.formStack}>
                <input type="hidden" name="redirectTo" value={redirectTo} />

                <label className={styles.filterField}>
                  <span>Grupo pai</span>
                  <select name="groupId" defaultValue="">
                    <option value="">
                      {activeGroups.length > 0
                        ? "Selecione o grupo"
                        : "Cadastre um grupo antes do subgrupo"}
                    </option>
                    {activeGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {labelForMovementType(group.movementType)} · {group.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.filterField}>
                  <span>Novo subgrupo</span>
                  <input type="text" name="name" placeholder="Ex.: Moletom, Trafego Meta, Shopee" required />
                </label>

                <div className={styles.filterActions}>
                  <button type="submit" className={styles.secondaryButton}>
                    Cadastrar subgrupo
                  </button>
                </div>
              </form>
            </div>
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
                    groups={manualFinanceData.groups}
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
                    groups={manualFinanceData.groups}
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
              Usei {formatMoney(DEFAULT_CURRENT_BANK_BALANCE)} como saldo inicial padrao deste mes porque ainda nao existe saldo fixado nem fechamento anterior para herdar. Se quiser, clique em fixar saldo para deixar salvo no banco.
            </p>
          </div>
        ) : null}

        {usesInheritedOpeningBalance ? (
          <div className={styles.callout}>
            <h3>Saldo inicial herdado</h3>
            <p>
              Este mes comecou com {formatMoney(openingBalance)}, que veio do fechamento de {inheritedMonthLabel}. Se voce lancar algo retroativo em {inheritedMonthLabel}, este valor recalcula sozinho.
            </p>
          </div>
        ) : null}

        <div className={manualFinanceData.persistence.enabled ? styles.callout : styles.warningPanel}>
          <h3>Leitura do financeiro</h3>
          <p>{manualFinanceData.persistence.message}</p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.mobileOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Resumo do caixa</div>
            <p className={styles.sectionSubtitle}>
              Totais e agrupamentos principais em leitura mobile.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Saldo inicial</div>
            <div className={styles.metricValue}>{formatMoney(openingBalance)}</div>
            <div className={styles.metricHint}>Base de abertura do mes.</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Entradas</div>
            <div className={styles.metricValue}>{formatMoney(totalEntries)}</div>
            <div className={styles.metricHint}>Tudo que entrou manualmente.</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Saidas</div>
            <div className={styles.metricValue}>{formatMoney(totalExpenses)}</div>
            <div className={styles.metricHint}>Tudo que saiu manualmente.</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Balanco atual</div>
            <div className={styles.metricValue}>{formatMoney(currentBalance)}</div>
            <div className={styles.metricHint}>Saldo inicial + entradas - saidas.</div>
          </article>
        </div>

        <div className={styles.financeAnalyticsSection}>
          <FinanceAnalyticsCharts
            movements={manualFinanceData.movements}
            selectedMonth={selectedMonth}
          />
        </div>

        <div className={styles.twoColumn} style={{ marginTop: 16 }}>
          <article className={styles.configCard}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.listTitle}>Saidas por grupo</div>
                <p className={styles.sectionSubtitle}>Quanto cada grupo consumiu no mes.</p>
              </div>
            </div>
            <div className={styles.mobileList}>
              {expenseBreakdown.length > 0 ? (
                expenseBreakdown.map((group) => (
                  <details key={group.key} className={styles.mobileListItem}>
                    <summary className={styles.mobileListSummary}>
                      <div className={styles.mobileListTitleRow}>
                        <div className={styles.mobileListTitle}>{group.name}</div>
                        <span className={`${styles.pill} ${styles.pillHigh}`}>
                          {formatMoney(group.total)}
                        </span>
                      </div>
                      <div className={styles.mobileListMeta}>
                        <span>{group.subgroups.length} subgrupo(s)</span>
                      </div>
                    </summary>
                    <div className={styles.mobileKeyValueList}>
                      {group.subgroups.length > 0 ? (
                        group.subgroups.map((subgroup) => (
                          <div key={subgroup.key} className={styles.mobileKeyValueRow}>
                            <strong>{subgroup.name}</strong>
                            <span>{formatMoney(subgroup.total)}</span>
                          </div>
                        ))
                      ) : (
                        <div className={styles.mobileKeyValueRow}>
                          <strong>Total do grupo</strong>
                          <span>{formatMoney(group.total)}</span>
                        </div>
                      )}
                    </div>
                  </details>
                ))
              ) : (
                <div className={styles.warningPanel}>
                  <div className={styles.warningTitle}>Nenhuma saida agrupada</div>
                  <p className={styles.warningText}>As saidas do mes aparecem aqui.</p>
                </div>
              )}
            </div>
          </article>

          <article className={styles.configCard}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.listTitle}>Entradas por grupo</div>
                <p className={styles.sectionSubtitle}>Tudo o que entrou detalhado por grupo.</p>
              </div>
            </div>
            <div className={styles.mobileList}>
              {entryBreakdown.length > 0 ? (
                entryBreakdown.map((group) => (
                  <details key={group.key} className={styles.mobileListItem}>
                    <summary className={styles.mobileListSummary}>
                      <div className={styles.mobileListTitleRow}>
                        <div className={styles.mobileListTitle}>{group.name}</div>
                        <span className={`${styles.pill} ${styles.pillLow}`}>
                          {formatMoney(group.total)}
                        </span>
                      </div>
                      <div className={styles.mobileListMeta}>
                        <span>{group.subgroups.length} subgrupo(s)</span>
                      </div>
                    </summary>
                    <div className={styles.mobileKeyValueList}>
                      {group.subgroups.length > 0 ? (
                        group.subgroups.map((subgroup) => (
                          <div key={subgroup.key} className={styles.mobileKeyValueRow}>
                            <strong>{subgroup.name}</strong>
                            <span>{formatMoney(subgroup.total)}</span>
                          </div>
                        ))
                      ) : (
                        <div className={styles.mobileKeyValueRow}>
                          <strong>Total do grupo</strong>
                          <span>{formatMoney(group.total)}</span>
                        </div>
                      )}
                    </div>
                  </details>
                ))
              ) : (
                <div className={styles.warningPanel}>
                  <div className={styles.warningTitle}>Nenhuma entrada agrupada</div>
                  <p className={styles.warningText}>As entradas do mes aparecem aqui.</p>
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.desktopOnly}`}>
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
              {manualFinanceData.openingBalanceSource === "manual"
                ? `Base fixada manualmente para ${monthLabel}`
                : manualFinanceData.openingBalanceSource === "previous_month"
                  ? `Herdado do fechamento de ${inheritedMonthLabel}`
                  : `Base usada para iniciar a competencia de ${monthLabel}`}
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

        <div className={styles.financeAnalyticsSection}>
          <FinanceAnalyticsCharts
            movements={manualFinanceData.movements}
            selectedMonth={selectedMonth}
          />
        </div>

        <div className={styles.configGrid}>
          <article className={styles.configCard}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.listTitle}>Saidas por grupo e subgrupo</div>
                <p className={styles.sectionSubtitle}>
                  Aqui voce enxerga quanto cada grupo e cada subgrupo consumiram no mes.
                </p>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Subgrupo</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseBreakdown.length > 0 ? (
                    expenseBreakdown.map((group) => (
                      <Fragment key={group.key}>
                        <tr>
                          <td>{group.name}</td>
                          <td>Total do grupo</td>
                          <td className={styles.profitAttention}>{formatMoney(group.total)}</td>
                        </tr>
                        {group.subgroups.map((subgroup) => (
                          <tr key={subgroup.key}>
                            <td>{group.name}</td>
                            <td>{subgroup.name}</td>
                            <td>{formatMoney(subgroup.total)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3}>Nenhuma saida agrupada registrada neste mes.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className={styles.configCard}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.listTitle}>Entradas por grupo e subgrupo</div>
                <p className={styles.sectionSubtitle}>
                  Aqui voce separa o que entrou por linha principal e tambem pelos detalhes.
                </p>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Subgrupo</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {entryBreakdown.length > 0 ? (
                    entryBreakdown.map((group) => (
                      <Fragment key={group.key}>
                        <tr>
                          <td>{group.name}</td>
                          <td>Total do grupo</td>
                          <td className={styles.profitPositive}>{formatMoney(group.total)}</td>
                        </tr>
                        {group.subgroups.map((subgroup) => (
                          <tr key={subgroup.key}>
                            <td>{group.name}</td>
                            <td>{subgroup.name}</td>
                            <td>{formatMoney(subgroup.total)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3}>Nenhuma entrada agrupada registrada neste mes.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.mobileOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Extrato do mes</div>
            <p className={styles.sectionSubtitle}>
              Entradas e saidas com edicao direta no celular.
            </p>
          </div>
        </div>

        <div className={styles.mobileList}>
          {ledgerRows.length > 0 ? (
            ledgerRows.map((row) => {
              const editSheetId = `mobile-edit-movement-${row.id}`;

              return (
                <details key={row.id} className={styles.mobileListItem}>
                  <summary className={styles.mobileListSummary}>
                    <div className={styles.mobileListTitleRow}>
                      <div className={styles.mobileListTitle}>{row.title}</div>
                      <span
                        className={`${styles.pill} ${
                          row.type === "entrada" ? styles.pillLow : styles.pillHigh
                        }`}
                      >
                        {labelForMovementType(row.type)}
                      </span>
                    </div>
                    <div className={styles.mobileListMeta}>
                      <span>{formatDate(row.movementDate)}</span>
                      <span>{row.groupName || row.category || "-"}</span>
                      <span>{formatMoney(row.amount)}</span>
                    </div>
                  </summary>

                  <div className={styles.mobileKeyValueList}>
                    <div className={styles.mobileKeyValueRow}>
                      <strong>Subgrupo</strong>
                      <span>{row.subgroupName || "-"}</span>
                    </div>
                    <div className={styles.mobileKeyValueRow}>
                      <strong>Pagamento</strong>
                      <span>{labelForPaymentMethod(row.paymentMethod)}</span>
                    </div>
                    <div className={styles.mobileKeyValueRow}>
                      <strong>Saldo apos</strong>
                      <span>{formatMoney(row.balanceAfter)}</span>
                    </div>
                    {row.notes ? (
                      <div className={styles.mobileKeyValueRow}>
                        <strong>Obs.</strong>
                        <span>{row.notes}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.mobileListActions}>
                    <input id={editSheetId} type="checkbox" className={styles.sheetToggle} />
                    <label htmlFor={editSheetId} className={styles.secondaryButton}>
                      Editar
                    </label>
                    <form action={deleteMovementAction}>
                      <input type="hidden" name="redirectTo" value={redirectTo} />
                      <input type="hidden" name="movementId" value={row.id} />
                      <button type="submit" className={styles.dangerButton}>
                        Excluir
                      </button>
                    </form>
                    <label htmlFor={editSheetId} className={styles.sheetOverlay} aria-hidden="true" />

                    <div className={styles.sheetPanel}>
                      <div className={styles.sheetHeader}>
                        <div className={styles.sheetTitle}>
                          {row.type === "entrada" ? "Editar entrada" : "Editar saida"}
                        </div>
                        <label htmlFor={editSheetId} className={styles.sheetClose}>
                          Fechar
                        </label>
                      </div>
                      <MovementForm
                        type={row.type}
                        redirectTo={redirectTo}
                        selectedMonth={selectedMonth}
                        sheetId={editSheetId}
                        groups={manualFinanceData.groups}
                        initialMovement={row}
                      />
                    </div>
                  </div>
                </details>
              );
            })
          ) : (
            <div className={styles.warningPanel}>
              <div className={styles.warningTitle}>Sem movimentacoes no mes</div>
              <p className={styles.warningText}>
                Registre entradas e saidas para acompanhar o extrato por aqui.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.desktopOnly}`}>
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
                <th>Grupo</th>
                <th>Subgrupo</th>
                <th>Descricao</th>
                <th>Pagamento</th>
                <th>Entrada</th>
                <th>Saida</th>
                <th>Saldo apos</th>
                <th>Ajuste</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.length > 0 ? (
                ledgerRows.map((row) => {
                  const editSheetId = `edit-movement-${row.id}`;

                  return (
                    <tr key={row.id}>
                      <td>{formatDate(row.movementDate)}</td>
                      <td
                        className={
                          row.type === "entrada" ? styles.profitPositive : styles.profitAttention
                        }
                      >
                        {labelForMovementType(row.type)}
                      </td>
                      <td>{row.groupName || row.category || "-"}</td>
                      <td>{row.subgroupName || "-"}</td>
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
                      <td>
                        <input id={editSheetId} type="checkbox" className={styles.sheetToggle} />
                        <label htmlFor={editSheetId} className={styles.secondaryButton}>
                          Editar
                        </label>
                        <form action={deleteMovementAction} style={{ marginTop: 8 }}>
                          <input type="hidden" name="redirectTo" value={redirectTo} />
                          <input type="hidden" name="movementId" value={row.id} />
                          <button type="submit" className={styles.dangerButton}>
                            Excluir
                          </button>
                        </form>
                        <label htmlFor={editSheetId} className={styles.sheetOverlay} aria-hidden="true" />

                        <div className={styles.sheetPanel}>
                          <div className={styles.sheetHeader}>
                            <div className={styles.sheetTitle}>
                              {row.type === "entrada" ? "Editar entrada" : "Editar saida"}
                            </div>
                            <label htmlFor={editSheetId} className={styles.sheetClose}>
                              Fechar
                            </label>
                          </div>
                          <MovementForm
                            type={row.type}
                            redirectTo={redirectTo}
                            selectedMonth={selectedMonth}
                            sheetId={editSheetId}
                            groups={manualFinanceData.groups}
                            initialMovement={row}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10}>Nenhuma movimentacao manual registrada neste mes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
