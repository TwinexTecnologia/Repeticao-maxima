"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/panel.module.css";
import type {
  CouponPartnerProfile,
  PartnerPersistenceState,
  PartnerRedemption,
} from "@/lib/parceiros/repository";
import type {
  SiteArtSelectionOption,
  StockSelectionOption,
} from "@/lib/operacoes/repository";

const FULL_COST = 52;
const MINIMAL_COST = 32;

type PartnerRedemptionManagerProps = {
  initialProfiles: CouponPartnerProfile[];
  initialRedemptions: PartnerRedemption[];
  initialPersistence: PartnerPersistenceState;
  stockOptions: StockSelectionOption[];
  artOptions: SiteArtSelectionOption[];
  selectedCouponCode: string;
};

type RedemptionApiResponse = {
  ok: boolean;
  message?: string;
  persistence?: PartnerPersistenceState;
  redemption?: PartnerRedemption;
};

type RedemptionFormState = {
  editingId: string | null;
  partnerId: string;
  stockItemId: string;
  artName: string;
  quantity: string;
  unitCost: string;
  grantedAt: string;
  dueDate: string;
  adjustStock: boolean;
  createMarketingDebt: boolean;
  notes: string;
};

export function PartnerRedemptionManager({
  initialProfiles,
  initialRedemptions,
  initialPersistence,
  stockOptions,
  artOptions,
  selectedCouponCode,
}: PartnerRedemptionManagerProps) {
  const router = useRouter();
  const activeProfiles = useMemo(
    () => initialProfiles.filter((profile) => profile.active),
    [initialProfiles],
  );
  const defaultPartnerId =
    activeProfiles.find((profile) => profile.couponCode === selectedCouponCode)?.id ||
    activeProfiles[0]?.id ||
    "";
  const [redemptions, setRedemptions] = useState(initialRedemptions);
  const [liveStockOptions, setLiveStockOptions] = useState(stockOptions);
  const [persistence, setPersistence] =
    useState<PartnerPersistenceState>(initialPersistence);
  const [feedback, setFeedback] = useState(initialPersistence.message);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    setRedemptions(initialRedemptions);
  }, [initialRedemptions]);

  useEffect(() => {
    setLiveStockOptions(stockOptions);
  }, [stockOptions]);

  useEffect(() => {
    setPersistence(initialPersistence);
  }, [initialPersistence]);

  const [form, setForm] = useState<RedemptionFormState>({
    editingId: null,
    partnerId: defaultPartnerId,
    stockItemId: stockOptions.find((item) => item.plain > 0)?.id || "",
    artName: "",
    quantity: "1",
    unitCost: String(FULL_COST),
    grantedAt: getTodayDate(),
    dueDate: "",
    adjustStock: true,
    createMarketingDebt: false,
    notes: "",
  });
  const availableStockOptions = useMemo(
    () =>
      liveStockOptions.filter(
        (item) => item.plain > 0 || item.id === form.stockItemId,
      ),
    [form.stockItemId, liveStockOptions],
  );

  useEffect(() => {
    if (!form.partnerId && defaultPartnerId) {
      setForm((current) => ({ ...current, partnerId: defaultPartnerId }));
    }
  }, [defaultPartnerId, form.partnerId]);

  const selectedProfile =
    activeProfiles.find((profile) => profile.id === form.partnerId) || null;
  const selectedStock =
    availableStockOptions.find((item) => item.id === form.stockItemId) || null;
  const availableArtOptions = useMemo(() => {
    const artMap = new Map<string, number>();

    artOptions.forEach((item) => {
      artMap.set(item.artName, (artMap.get(item.artName) ?? 0) + item.publishedStock);
    });

    return Array.from(artMap.entries())
      .map(([artName, publishedStock]) => ({
        artName,
        publishedStock,
      }))
      .sort((left, right) => left.artName.localeCompare(right.artName));
  }, [artOptions, selectedStock]);
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

  useEffect(() => {
    const hasSelectedStock = availableStockOptions.some(
      (item) => item.id === form.stockItemId,
    );

    if ((!form.stockItemId || !hasSelectedStock) && availableStockOptions[0]?.id) {
      setForm((current) => ({
        ...current,
        stockItemId: availableStockOptions[0]?.id || "",
      }));
    }
  }, [availableStockOptions, form.stockItemId]);

  useEffect(() => {
    if (availableArtOptions.length === 0) {
      if (form.artName) {
        setForm((current) => ({
          ...current,
          artName: "",
        }));
      }
      return;
    }

    const hasSelectedArt = availableArtOptions.some(
      (item) => item.artName === form.artName,
    );

    if (!hasSelectedArt) {
      setForm((current) => ({
        ...current,
        artName: availableArtOptions[0]?.artName || "",
      }));
    }
  }, [availableArtOptions, form.artName]);

  function applyCostPreset(value: "full" | "minimalista") {
    setForm((current) => ({
      ...current,
      unitCost: String(value === "full" ? FULL_COST : MINIMAL_COST),
    }));
  }

  function resetForm() {
    setForm({
      editingId: null,
      partnerId: defaultPartnerId,
      stockItemId: stockOptions.find((item) => item.plain > 0)?.id || "",
      artName: "",
      quantity: "1",
      unitCost: String(FULL_COST),
      grantedAt: getTodayDate(),
      dueDate: "",
      adjustStock: true,
      createMarketingDebt: false,
      notes: "",
    });
  }

  function handleEditRedemption(redemption: PartnerRedemption) {
    const linkedProfile =
      activeProfiles.find((item) => item.id === redemption.partnerId) ||
      activeProfiles.find((item) => item.couponCode === redemption.couponCode) ||
      null;

    setForm({
      editingId: redemption.id,
      partnerId: linkedProfile?.id || "",
      stockItemId: redemption.stockItemId || "",
      artName: getArtName(redemption.notes),
      quantity: String(redemption.quantity),
      unitCost: String(redemption.unitCost),
      grantedAt: redemption.grantedAt || getTodayDate(),
      dueDate: redemption.dueDate || "",
      adjustStock: getAffectsStock(redemption.notes),
      createMarketingDebt: redemption.createMarketingDebt,
      notes: getCleanNotes(redemption.notes),
    });
    setFeedback("Modo edicao ativo. Ajuste o resgate e salve novamente.");
  }

  async function handleSaveRedemption() {
    if (!selectedProfile) {
      setFeedback("Selecione um parceiro para registrar o resgate.");
      return;
    }

    if (!selectedStock) {
      setFeedback("Selecione uma base de lisa em estoque para baixar.");
      return;
    }

    if (!form.artName.trim()) {
      setFeedback("Selecione uma arte disponivel no site para registrar esse resgate.");
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
        adjustStock: form.adjustStock,
        createMarketingDebt: form.createMarketingDebt,
        artName: form.artName,
        notes: form.notes,
        status: "entregue",
      };
      const response = await fetch("/api/influenciadores/resgates", {
        method: form.editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          id: form.editingId,
        }),
      });
      const result = (await response.json()) as RedemptionApiResponse;

      if (!response.ok || !result.ok || !result.redemption) {
        throw new Error(result.message || "Nao foi possivel salvar o resgate.");
      }

      setRedemptions((current) =>
        [
          result.redemption!,
          ...current.filter((item) => item.id !== result.redemption!.id),
        ].sort((left, right) =>
          `${right.grantedAt}${right.createdAt || ""}`.localeCompare(
            `${left.grantedAt}${left.createdAt || ""}`,
          ),
        ),
      );
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setFeedback(result.message || "Resgate salvo com sucesso.");
      resetForm();
      router.refresh();
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
            Aqui voce registra a roupa entregue, baixa da lisa em estoque e decide
            se isso vira tambem um compromisso de marketing com vencimento.
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
            <div className={styles.callout}>
              <h3>{form.editingId ? "Editando resgate" : "Novo resgate"}</h3>
              <p>
                {form.editingId
                  ? "Voce pode editar um resgate ja salvo e decidir se essa edicao mexe no estoque ou nao."
                  : "Registre um novo resgate e escolha se a baixa da lisa deve acontecer agora."}
              </p>
            </div>

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
              <span>Base da lisa em estoque</span>
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
                {availableStockOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.color} · {item.size} · {item.plain} lisa(s)
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterField}>
              <span>Arte</span>
              <select
                value={form.artName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    artName: event.target.value,
                  }))
                }
              >
                <option value="">
                  {availableArtOptions.length > 0
                    ? "Selecione a arte"
                    : "Nenhum produto disponivel no site agora"}
                </option>
                {availableArtOptions.map((item) => (
                  <option key={item.artName} value={item.artName}>
                    {item.artName} · {item.publishedStock} no site
                  </option>
                ))}
              </select>
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
                checked={form.adjustStock}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    adjustStock: event.target.checked,
                  }))
                }
              />
              Mexer no estoque dessa lisa
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
              {isSaving
                ? "Salvando..."
                : form.editingId
                  ? "Salvar edicao"
                  : "Salvar resgate"}
            </button>
            {form.editingId ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetForm}
                disabled={isSaving}
              >
                Cancelar edicao
              </button>
            ) : null}
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
                  ? `${form.artName.trim() || "Arte nao selecionada"} · ${selectedStock.sku} · ${selectedStock.plain} lisa(s) disponiveis`
                  : "Escolha a linha da lisa usada como referencia para esse resgate."}
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
                  : form.adjustStock
                    ? "Vai mexer no estoque. Sem compromisso financeiro adicional."
                    : "Nao mexe no estoque e fica so no registro financeiro/historico."}
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
              <th>Estoque</th>
              <th>Status</th>
              <th>Obs.</th>
              <th>Acoes</th>
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
                  <td>{getAffectsStock(item.notes) ? "Baixou" : "Nao mexeu"}</td>
                  <td>{item.status}</td>
                  <td>{getCleanNotes(item.notes) || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => handleEditRedemption(item)}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10}>
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

function getArtName(notes: string) {
  const match = notes.match(/^\[arte\]\s*(.+)$/im);
  return match?.[1]?.trim() || "Arte nao informada";
}

function getCleanNotes(notes: string) {
  return notes
    .replace(/^\[arte\]\s*.+$/im, "")
    .replace(/^\[estoque\]\s*.+$/im, "")
    .replace(/^\s+|\s+$/g, "");
}

function getAffectsStock(notes: string) {
  const match = notes.match(/^\[estoque\]\s*(sim|nao)$/im);

  if (!match) {
    return true;
  }

  return match[1]?.trim().toLowerCase() !== "nao";
}
