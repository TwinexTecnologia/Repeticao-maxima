"use client";

import { useMemo, useState } from "react";

import styles from "@/components/panel.module.css";
import {
  type DebtBillingFrequency,
  type DebtPaymentMethod,
  type DebtStatus,
  type InternalDebt,
  type OperationalPersistenceState,
} from "@/lib/operacoes/repository";
import { purchasePlanRows } from "@/lib/operations-data";

type ComprasClientProps = {
  initialDebts: InternalDebt[];
  initialPersistence: OperationalPersistenceState;
};

type DebtApiResponse = {
  ok: boolean;
  message?: string;
  persistence?: OperationalPersistenceState;
  debt?: InternalDebt;
  debts?: InternalDebt[];
};

const statusOptions: DebtStatus[] = [
  "aberta",
  "parcial",
  "paga",
  "cancelada",
  "consumido",
];

const paymentMethodOptions: DebtPaymentMethod[] = [
  "pix",
  "boleto",
  "cartao",
  "transferencia",
  "dinheiro",
  "outro",
];

const billingFrequencyOptions: DebtBillingFrequency[] = [
  "semanal",
  "quinzenal",
  "mensal",
];

export function ComprasClient({
  initialDebts,
  initialPersistence,
}: ComprasClientProps) {
  const [debts, setDebts] = useState(initialDebts);
  const [persistence, setPersistence] =
    useState<OperationalPersistenceState>(initialPersistence);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, DebtStatus>>(
    () =>
      initialDebts.reduce<Record<string, DebtStatus>>((acc, debt) => {
        acc[debt.id] = debt.status;
        return acc;
      }, {}),
  );
  const [form, setForm] = useState({
    title: "",
    category: "Fornecedor",
    dueDate: "",
    amount: "",
    paymentMethod: "pix" as DebtPaymentMethod,
    billingFrequency: "mensal" as DebtBillingFrequency,
    installments: "1",
    status: "aberta" as DebtStatus,
    impact: "",
  });
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savingDebtId, setSavingDebtId] = useState<string | null>(null);

  const metrics = useMemo(() => {
    const openStatuses: DebtStatus[] = ["aberta", "parcial", "consumido"];
    const totalToPay = debts
      .filter((debt) => openStatuses.includes(debt.status))
      .reduce((sum, debt) => sum + debt.amount, 0);
    const currentMonthKey = getMonthKey(new Date());
    const nextMonthKey = getMonthKey(addMonths(new Date(), 1));
    const currentMonthTotal = debts
      .filter(
        (debt) =>
          openStatuses.includes(debt.status) &&
          debt.dueDate &&
          getMonthKey(new Date(`${debt.dueDate}T00:00:00`)) === currentMonthKey,
      )
      .reduce((sum, debt) => sum + debt.amount, 0);
    const nextMonthTotal = debts
      .filter(
        (debt) =>
          openStatuses.includes(debt.status) &&
          debt.dueDate &&
          getMonthKey(new Date(`${debt.dueDate}T00:00:00`)) === nextMonthKey,
      )
      .reduce((sum, debt) => sum + debt.amount, 0);
    const nextDebt = debts
      .filter((debt) => debt.dueDate)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];

    return [
      {
        label: "Divida deste mes",
        value: formatMoney(currentMonthTotal),
        detail: "Parcelas e contas que vencem no mes atual",
      },
      {
        label: "Divida do proximo mes",
        value: formatMoney(nextMonthTotal),
        detail: "Leitura antecipada para nao apertar o caixa",
      },
      {
        label: "Proximo vencimento",
        value: nextDebt ? formatDate(nextDebt.dueDate) : "Sem data",
        detail: nextDebt ? nextDebt.title : "Cadastre a proxima conta a pagar",
      },
      {
        label: "Total em aberto",
        value: formatMoney(totalToPay),
        detail: "Soma geral do que ainda nao foi quitado",
      },
    ];
  }, [debts]);

  async function handleCreateDebt() {
    setIsSaving(true);
    setFeedback("");

    try {
      const response = await fetch("/api/operacoes/dividas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          amount: form.amount,
        }),
      });

      const result = (await response.json()) as DebtApiResponse;

      if (!response.ok || !result.ok || !result.debts?.length) {
        throw new Error(result.message || "Nao foi possivel salvar a divida.");
      }

      setDebts((current) =>
        [...result.debts!, ...current].sort((left, right) =>
          left.dueDate.localeCompare(right.dueDate),
        ),
      );
      setStatusDrafts((current) =>
        result.debts!.reduce<Record<string, DebtStatus>>((acc, debt) => {
          acc[debt.id] = debt.status;
          return acc;
        }, { ...current }),
      );
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setForm({
        title: "",
        category: "Fornecedor",
        dueDate: "",
        amount: "",
        paymentMethod: "pix",
        billingFrequency: "mensal",
        installments: "1",
        status: "aberta",
        impact: "",
      });
      setFeedback(result.message || "Divida adicionada com sucesso.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar a divida.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateStatus(id: string) {
    setSavingDebtId(id);
    setFeedback("");

    try {
      const response = await fetch(`/api/operacoes/dividas/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: statusDrafts[id],
        }),
      });

      const result = (await response.json()) as DebtApiResponse;

      if (!response.ok || !result.ok || !result.debt) {
        throw new Error(
          result.message || "Nao foi possivel atualizar o status.",
        );
      }

      setDebts((current) =>
        current.map((debt) => (debt.id === id ? result.debt! : debt)),
      );
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setFeedback(result.message || "Status atualizado.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar o status.",
      );
    } finally {
      setSavingDebtId(null);
    }
  }

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Banco interno da operacao</div>
            <p className={styles.sectionSubtitle}>
              Tudo que for da marca, como dividas e compromissos, fica salvo no
              nosso banco. Nuvemshop continua sendo lida direto pela API.
            </p>
          </div>
        </div>

        <div className={persistence.enabled ? styles.callout : styles.warningPanel}>
          <h3>{persistence.enabled ? "Supabase conectado" : "Persistencia em modo de exemplo"}</h3>
          <p>
            {feedback || persistence.message}
            {persistence.updatedAt
              ? ` Ultima atualizacao: ${formatDateTime(persistence.updatedAt)}.`
              : ""}
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Nova divida</div>
            <p className={styles.sectionSubtitle}>
              Cadastre fabrica, cartao, brinde de influenciador ou qualquer
              saida que precisa entrar no seu caixa. Se parcelar, o sistema ja
              quebra as parcelas pelos proximos meses.
            </p>
          </div>
        </div>

        <div className={styles.configGrid}>
          <article className={styles.configCard}>
            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Titulo</span>
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Ex.: Pedido da fabrica"
                />
              </label>
              <label className={styles.filterField}>
                <span>Categoria</span>
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                >
                  <option>Fornecedor</option>
                  <option>Cartao</option>
                  <option>Brindes</option>
                  <option>Operacional</option>
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Primeiro vencimento</span>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Valor</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  placeholder="0,00"
                />
              </label>
              <label className={styles.filterField}>
                <span>Como vai ser pago</span>
                <select
                  value={form.paymentMethod}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      paymentMethod: event.target.value as DebtPaymentMethod,
                    }))
                  }
                >
                  {paymentMethodOptions.map((method) => (
                    <option key={method} value={method}>
                      {labelForPaymentMethod(method)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Frequencia da cobranca</span>
                <select
                  value={form.billingFrequency}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      billingFrequency:
                        event.target.value as DebtBillingFrequency,
                    }))
                  }
                >
                  {billingFrequencyOptions.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {labelForBillingFrequency(frequency)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Em quantas vezes</span>
                <input
                  type="number"
                  min="1"
                  value={form.installments}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      installments: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Status inicial</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as DebtStatus,
                    }))
                  }
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {labelForStatus(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Leitura / observacao</span>
                <input
                  value={form.impact}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      impact: event.target.value,
                    }))
                  }
                  placeholder="Ex.: parcela da fabrica em 30 dias"
                />
              </label>
            </div>

            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleCreateDebt}
                disabled={!persistence.enabled || isSaving}
              >
                {isSaving ? "Salvando..." : "Adicionar divida"}
              </button>
            </div>
          </article>

          <article className={styles.configCard}>
            <div className={styles.metricGrid}>
              {metrics.map((metric) => (
                <article key={metric.label} className={styles.metricCard}>
                  <div className={styles.metricLabel}>{metric.label}</div>
                  <div className={styles.metricValue}>{metric.value}</div>
                  <div className={styles.metricHint}>{metric.detail}</div>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Compromissos para pagar</div>
            <p className={styles.sectionSubtitle}>
              Essa lista agora e a base do nosso banco interno. Aqui voce
              adiciona e altera status sem depender da Nuvemshop.
            </p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Compromisso</th>
                <th>Categoria</th>
                <th>Pagamento</th>
                <th>Cobranca</th>
                <th>Parcela</th>
                <th>Competencia</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Leitura</th>
                <th>Atualizar</th>
              </tr>
            </thead>
            <tbody>
              {debts.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.category}</td>
                  <td>{labelForPaymentMethod(row.paymentMethod)}</td>
                  <td>{labelForBillingFrequency(row.billingFrequency)}</td>
                  <td>{`${row.installmentNumber}/${row.installmentsTotal}`}</td>
                  <td>{row.monthLabel}</td>
                  <td>{row.dueDate ? formatDate(row.dueDate) : "Sem data"}</td>
                  <td>{formatMoney(row.amount)}</td>
                  <td>{labelForStatus(row.status)}</td>
                  <td>{row.impact || "-"}</td>
                  <td>
                    <div className={styles.formStack}>
                      <label className={styles.filterField}>
                        <span>Novo status</span>
                        <select
                          value={statusDrafts[row.id] ?? row.status}
                          onChange={(event) =>
                            setStatusDrafts((current) => ({
                              ...current,
                              [row.id]: event.target.value as DebtStatus,
                            }))
                          }
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {labelForStatus(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleUpdateStatus(row.id)}
                        disabled={!persistence.enabled || savingDebtId === row.id}
                      >
                        {savingDebtId === row.id ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <div className={styles.callout}>
            <h3>Plano da proxima compra</h3>
            <p>
              O sistema vai usar a combinacao de caixa, estoque e ritmo de venda
              para dizer se voce deve repetir o lote ou crescer.
            </p>
          </div>

          <div className={styles.list}>
            {purchasePlanRows.map((item) => (
              <article key={item.title} className={styles.listItem}>
                <div className={styles.listTitleRow}>
                  <div className={styles.listTitle}>{item.title}</div>
                  <span className={`${styles.pill} ${styles.pillLow}`}>
                    {item.value}
                  </span>
                </div>
                <p className={styles.listDetail}>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
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

function labelForStatus(status: DebtStatus) {
  switch (status) {
    case "aberta":
      return "Aberta";
    case "parcial":
      return "Parcial";
    case "paga":
      return "Paga";
    case "cancelada":
      return "Cancelada";
    case "consumido":
      return "Consumido";
    default:
      return status;
  }
}

function labelForPaymentMethod(method: DebtPaymentMethod) {
  switch (method) {
    case "pix":
      return "Pix";
    case "boleto":
      return "Boleto";
    case "cartao":
      return "Cartao";
    case "transferencia":
      return "Transferencia";
    case "dinheiro":
      return "Dinheiro";
    default:
      return "Outro";
  }
}

function labelForBillingFrequency(frequency: DebtBillingFrequency) {
  switch (frequency) {
    case "semanal":
      return "Semanal";
    case "quinzenal":
      return "Quinzenal";
    case "mensal":
      return "Mensal";
    default:
      return frequency;
  }
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
