"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "@/components/panel.module.css";
import type {
  CouponPartnerProfile,
  PartnerPersistenceState,
  PartnerRedemption,
} from "@/lib/parceiros/repository";
import type { StockSelectionOption } from "@/lib/operacoes/repository";

const FULL_COST = 52;
const MINIMAL_COST = 32;

type PartnerRedemptionManagerProps = {
  initialProfiles: CouponPartnerProfile[];
  initialRedemptions: PartnerRedemption[];
  initialPersistence: PartnerPersistenceState;
  stockOptions: StockSelectionOption[];
  selectedCouponCode: string;
};

type RedemptionApiResponse = {
  ok: boolean;
  message?: string;
  persistence?: PartnerPersistenceState;
  redemption?: PartnerRedemption;
};

type RedemptionFormState = {
  partnerId: string;
  stockItemId: string;
  artName: string;
  quantity: string;
  unitCost: string;
  grantedAt: string;
  dueDate: string;
  createMarketingDebt: boolean;
  notes: string;
};

export function PartnerRedemptionManager({
  initialProfiles,
  initialRedemptions,
  initialPersistence,
  stockOptions,
  selectedCouponCode,
}: PartnerRedemptionManagerProps) {
  const activeProfiles = useMemo(
    () => initialProfiles.filter((profile) => profile.active),
    [initialProfiles],
  );
  const defaultPartnerId =
    activeProfiles.find((profile) => profile.couponCode === selectedCouponCode)?.id ||
    activeProfiles[0]?.id ||
    "";
  const [redemptions, setRedemptions] = useState(initialRedemptions);
  const [persistence, setPersistence] =
    useState<PartnerPersistenceState>(initialPersistence);
  const [feedback, setFeedback] = useState(initialPersistence.message);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<RedemptionFormState>({
    partnerId: defaultPartnerId,
    stockItemId: stockOptions[0]?.id || "",
    artName: "",
    quantity: "1",
    unitCost: String(FULL_COST),
    grantedAt: getTodayDate(),
    dueDate: "",
    createMarketingDebt: false,
    notes: "",
  });

  useEffect(() => {
    if (!form.partnerId && defaultPartnerId) {
      setForm((current) => ({ ...current, partnerId: defaultPartnerId }));
    }
  }, [defaultPartnerId, form.partnerId]);

  const selectedProfile =
    activeProfiles.find((profile) => profile.id === form.partnerId) || null;
  const selectedStock =
    stockOptions.find((item) => item.id === form.stockItemId) || null;
  const selectedCouponHistory = useMemo(() => {
    const couponCode = selectedProfile?.couponCode || selectedCouponCode;

    if (!couponCode) {
      return redemptions;
    }

    return redemptions.filter((item) => item.couponCode === couponCode);
  }, [redemptions, selectedCouponCode, selectedProfile]);
  const totalRedeemedCost = selectedCouponHistory.reduce(
    (sum, item) => sum + item.totalCost,
    0,
  );

  function applyCostPreset(value: "full" | "minimalista") {
    setForm((current) => ({
      ...current,
      unitCost: String(value === "full" ? FULL_COST : MINIMAL_COST),
    }));
  }

  async function handleSaveRedemption() {
    if (!selectedProfile) {
      setFeedback("Selecione um parceiro para registrar o resgate.");
      return;
    }

    if (!selectedStock) {
      setFeedback("Selecione uma base do estoque para baixar.");
      return;
    }

    setIsSaving(true);
    setFeedback("");

    try {
      const payload = {
        partnerId: selectedProfile.id,
        partnerName: selectedProfile.name,
        couponCode: selectedProfile.couponCode,
        partnerRole: selectedProfile.role,
        stockItemId: selectedStock.id,
        sku: selectedStock.sku,
        color: selectedStock.color,
        size: selectedStock.size,
        quantity: Number(form.quantity || 1),
        unitCost: Number(form.unitCost || 0),
        grantedAt: form.grantedAt,
        dueDate: form.dueDate,
        createMarketingDebt: form.createMarketingDebt,
        notes: buildRedemptionNotes(form.artName, form.notes),
        status: "entregue",
      };
      const response = await fetch("/api/influenciadores/resgates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as RedemptionApiResponse;

      if (!response.ok || !result.ok || !result.redemption) {
        throw new Error(result.message || "Nao foi possivel salvar o resgate.");
      }

      setRedemptions((current) =>
        [result.redemption!, ...current].sort((left, right) =>
          `${right.grantedAt}${right.createdAt || ""}`.localeCompare(
            `${left.grantedAt}${left.createdAt || ""}`,
          ),
        ),
      );
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setFeedback(result.message || "Resgate salvo com sucesso.");
      setForm((current) => ({
        ...current,
        artName: "",
        quantity: "1",
        dueDate: "",
        createMarketingDebt: false,
        notes: "",
      }));
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar o resgate.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <div className={styles.sectionTitle}>Resgates de parceiros</div>
          <p className={styles.sectionSubtitle}>
            Aqui voce registra a roupa entregue, baixa o estoque e decide se isso
            vira tambem um compromisso de marketing com vencimento.
          </p>
        </div>
        <div className={styles.chipRow}>
          <span className={styles.chip}>
            {redemptions.length} resgate(s) cadastrados
          </span>
          <span className={styles.chip}>
            {formatMoney(totalRedeemedCost)} no parceiro atual
          </span>
        </div>
      </div>

      <div className={styles.twoColumn}>
        <article className={styles.configCard}>
          <div className={styles.formStack}>
            <label className={styles.filterField}>
              <span>Parceiro</span>
              <select
                value={form.partnerId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    partnerId: event.target.value,
                  }))
                }
              >
                <option value="">Selecione</option>
                {activeProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} · {profile.couponCode}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterField}>
              <span>Base do estoque</span>
              <select
                value={form.stockItemId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    stockItemId: event.target.value,
                  }))
                }
              >
                <option value="">Selecione</option>
                {stockOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.color} · {item.size} · {item.printedReal} estampada(s)
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterField}>
              <span>Arte</span>
              <input
                type="text"
                placeholder="Ex.: Faz o basico / Minimalista White"
                value={form.artName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    artName: event.target.value,
                  }))
                }
              />
            </label>

            <div className={styles.filterGrid}>
              <label className={styles.filterField}>
                <span>Quantidade</span>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                />
              </label>

              <label className={styles.filterField}>
                <span>Custo unitario</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.unitCost}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      unitCost: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => applyCostPreset("full")}
              >
                Full R$ 52
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => applyCostPreset("minimalista")}
              >
                Minimalista R$ 32
              </button>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.filterField}>
                <span>Data do resgate</span>
                <input
                  type="date"
                  value={form.grantedAt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      grantedAt: event.target.value,
                    }))
                  }
                />
              </label>

              <label className={styles.filterField}>
                <span>Vencimento marketing</span>
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
            </div>

            <label className={styles.filterField}>
              <span>Observacao</span>
              <input
                type="text"
                placeholder="Ex.: entrega inicial do kit"
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>

            <label
              className={styles.secondaryButton}
              style={{ gap: 10, cursor: "pointer", width: "fit-content" }}
            >
              <input
                type="checkbox"
                checked={form.createMarketingDebt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    createMarketingDebt: event.target.checked,
                  }))
                }
              />
              Gerar divida de marketing
            </label>
          </div>

          <div className={styles.filterActions} style={{ marginTop: 16 }}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSaveRedemption}
              disabled={!persistence.enabled || isSaving}
            >
              {isSaving ? "Salvando..." : "Salvar resgate"}
            </button>
          </div>
        </article>

        <div className={styles.stack}>
          <div className={styles.callout}>
            <h3>Leitura do resgate</h3>
            <p>{feedback || persistence.message}</p>
            <p style={{ marginTop: 10 }}>
              {selectedProfile
                ? `${selectedProfile.name} usa o cupom ${selectedProfile.couponCode} e o resgate aparece no historico dele sem entrar como venda da loja.`
                : "Selecione um parceiro para ver o historico dele aqui."}
            </p>
          </div>

          <div className={styles.metricGridCompact}>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Base selecionada</div>
              <div className={styles.metricValue}>
                {selectedStock ? `${selectedStock.color} ${selectedStock.size}` : "-"}
              </div>
              <div className={styles.metricHint}>
                {selectedStock
                  ? `${form.artName.trim() || "Arte nao informada"} · ${selectedStock.sku} · ${selectedStock.printedReal} estampada(s) disponiveis`
                  : "Escolha a linha do estoque que sera baixada."}
              </div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Total do resgate</div>
              <div className={styles.metricValue}>
                {formatMoney(Number(form.quantity || 0) * Number(form.unitCost || 0))}
              </div>
              <div className={styles.metricHint}>
                {form.createMarketingDebt && form.dueDate
                  ? `Compromisso previsto para ${formatDate(form.dueDate)}`
                  : "Sem compromisso financeiro adicional."}
              </div>
            </article>
          </div>
        </div>
      </div>

      <div className={styles.tableWrap} style={{ marginTop: 18 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Parceiro</th>
              <th>Item</th>
              <th>Qtd</th>
              <th>Custo</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>
            {selectedCouponHistory.length > 0 ? (
              selectedCouponHistory.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.grantedAt)}</td>
                  <td>
                    <strong>{item.partnerName}</strong>
                    <div>{item.couponCode}</div>
                  </td>
                  <td>
                    {getArtName(item.notes)} · {item.sku} · {item.color} · {item.size}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{formatMoney(item.totalCost)}</td>
                  <td>{item.dueDate ? formatDate(item.dueDate) : "-"}</td>
                  <td>{item.status}</td>
                  <td>{getCleanNotes(item.notes) || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>
                  Esse parceiro ainda nao tem resgates registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(parsed);
}

function buildRedemptionNotes(artName: string, notes: string) {
  const cleanArt = artName.trim();
  const cleanNotes = notes.trim();

  if (cleanArt && cleanNotes) {
    return `[arte] ${cleanArt}\n${cleanNotes}`;
  }

  if (cleanArt) {
    return `[arte] ${cleanArt}`;
  }

  return cleanNotes;
}

function getArtName(notes: string) {
  const match = notes.match(/^\[arte\]\s*(.+)$/im);
  return match?.[1]?.trim() || "Arte nao informada";
}

function getCleanNotes(notes: string) {
  return notes
    .replace(/^\[arte\]\s*.+$/im, "")
    .replace(/^\s+|\s+$/g, "");
}
