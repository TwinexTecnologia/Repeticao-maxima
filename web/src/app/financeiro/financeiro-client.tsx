"use client";

import { useMemo, useState } from "react";

import styles from "@/components/panel.module.css";
import {
  buildMonthlyCashFlow,
  formatMoney,
} from "@/lib/financeiro/calculations";
import {
  defaultFinanceConfig,
  type FinanceConfig,
} from "@/lib/financeiro/config";
import type { MonthlyFinanceFlowData } from "@/lib/financeiro/flow";
import type { FinancePersistenceState } from "@/lib/financeiro/repository";

type FinanceiroClientProps = {
  initialConfig: FinanceConfig;
  initialPersistence: FinancePersistenceState;
  initialFlow: MonthlyFinanceFlowData;
};

export function FinanceiroClient({
  initialConfig,
  initialPersistence,
  initialFlow,
}: FinanceiroClientProps) {
  const [config, setConfig] = useState(initialConfig);
  const [savedConfig, setSavedConfig] = useState(initialConfig);
  const [persistence, setPersistence] =
    useState<FinancePersistenceState>(initialPersistence);
  const [saveState, setSaveState] = useState<{
    kind: "idle" | "success" | "error";
    message: string;
  }>({
    kind: "idle",
    message: initialPersistence.message,
  });
  const [isSaving, setIsSaving] = useState(false);

  const cashFlow = useMemo(
    () => buildMonthlyCashFlow(config, initialFlow),
    [config, initialFlow],
  );

  async function handleSave() {
    setIsSaving(true);
    setSaveState({
      kind: "idle",
      message: "",
    });

    try {
      const response = await fetch("/api/financeiro/configuracao", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
        persistence?: FinancePersistenceState;
        config?: FinanceConfig;
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "Nao foi possivel salvar a configuracao.",
        );
      }

      if (result.persistence) {
        setPersistence(result.persistence);
      }

      if (result.config) {
        setConfig(result.config);
        setSavedConfig(result.config);
      } else {
        setSavedConfig(config);
      }

      setSaveState({
        kind: "success",
        message: result.message || "Configuracao salva com sucesso.",
      });
    } catch (error) {
      setSaveState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel salvar a configuracao.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleNumberChange(key: keyof FinanceConfig, value: string) {
    const parsed = Number.parseFloat(value.replace(",", "."));

    setConfig((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? parsed : 0,
    }));
  }

  function restoreSavedConfig() {
    setConfig(savedConfig);
    setSaveState({
      kind: "idle",
      message: "Valores restaurados a partir da ultima configuracao salva.",
    });
  }

  function restoreDefaultConfig() {
    setConfig(defaultFinanceConfig);
    setSaveState({
      kind: "idle",
      message: "Valores restaurados para o padrao sugerido.",
    });
  }

  const statusTone =
    saveState.kind === "error" || !persistence.enabled
      ? styles.warningPanel
      : styles.callout;

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Filtro do mes</div>
            <p className={styles.sectionSubtitle}>
              Escolha o mes para ver as entradas e saidas daquela competencia.
            </p>
          </div>
        </div>

        <div style={{ maxWidth: 360 }}>
          <form className={styles.filterBar} method="GET">
            <label className={styles.filterField}>
              <span>Mes</span>
              <input
                type="month"
                name="month"
                defaultValue={initialFlow.selectedMonth}
              />
            </label>
            <div className={styles.filterActions}>
              <button type="submit" className={styles.primaryButton}>
                Filtrar
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Fluxo de entrada e saida do mes</div>
            <p className={styles.sectionSubtitle}>
              Entradas usam o liquido estimado da Nuvemshop no mes atual e a
              entrada manual da TikTok Shop. Saidas usam as dividas registradas
              no banco interno.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {cashFlow.summaryMetrics.map((metric) => (
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
          <div className={initialFlow.nuvemshop.ok ? styles.callout : styles.warningPanel}>
            <h3>Nuvemshop no mes</h3>
            <p>{initialFlow.nuvemshop.message}</p>
          </div>

          <div
            className={
              initialFlow.debtsSource.ok ? styles.callout : styles.warningPanel
            }
          >
            <h3>Dividas do mes</h3>
            <p>{initialFlow.debtsSource.message}</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Ajuste manual da TikTok Shop</div>
            <p className={styles.sectionSubtitle}>
              Enquanto a TikTok Shop ainda nao esta integrada, voce pode salvar
              aqui o valor liquido do mes para entrar no fluxo junto da
              Nuvemshop.
            </p>
          </div>
        </div>

        <div className={styles.configGrid}>
          <article className={styles.configCard}>
            <div className={styles.listTitle}>Entrada manual do mes</div>
            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Entrada liquida manual TikTok no mes</span>
                <input
                  type="number"
                  step="0.01"
                  value={config.tiktokMonthlyNet}
                  onChange={(event) =>
                    handleNumberChange("tiktokMonthlyNet", event.target.value)
                  }
                />
              </label>
            </div>
            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSave}
                disabled={!persistence.enabled || isSaving}
              >
                {isSaving ? "Salvando..." : "Salvar valor"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={restoreSavedConfig}
              >
                Voltar ao salvo
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={restoreDefaultConfig}
              >
                Restaurar padrao
              </button>
            </div>
          </article>

          <article className={styles.configCard}>
            <div className={statusTone}>
              <h3>
                {persistence.enabled
                  ? "Supabase conectado"
                  : "Persistencia desativada"}
              </h3>
              <p>
                {saveState.message || persistence.message}
                {persistence.updatedAt
                  ? ` Ultima atualizacao: ${formatDateTime(
                      persistence.updatedAt,
                    )}.`
                  : ""}
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Saidas do mes</div>
            <p className={styles.sectionSubtitle}>
              Aqui entram as dividas e compromissos que vencem neste mes, vindos
              do modulo de Compras e Dividas.
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
                  <td colSpan={7}>Nenhuma divida encontrada para este mes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Pedidos da Nuvemshop no mes</div>
            <p className={styles.sectionSubtitle}>
              Essa leitura estima o liquido por pedido usando a forma de
              pagamento e as taxas configuradas acima.
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
                <th>Regra usada</th>
                <th>Taxa estimada</th>
                <th>Liquido estimado</th>
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
                    <td>{row.feeLabel}</td>
                    <td>{formatMoney(row.feeCost)}</td>
                    <td className={styles.profitPositive}>
                      {formatMoney(row.netReceived)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>Nenhum pedido da Nuvemshop encontrado para este mes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
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
