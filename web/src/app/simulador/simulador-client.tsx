"use client";

import { useEffect, useMemo, useState } from "react";

import { formatMoney, formatPercent } from "@/lib/financeiro/calculations";
import type { FinanceConfig } from "@/lib/financeiro/config";
import type { FinancePersistenceState } from "@/lib/financeiro/repository";

import styles from "./simulador.module.css";

type ChannelKey = "nuvemshop" | "tiktok" | "mercadolivre";
type ComboId =
  | "mini-2"
  | "mini-4"
  | "mini-5"
  | "mix-2"
  | "mix-4"
  | "mix-5"
  | "print-2"
  | "print-4"
  | "print-5";
type NuvemPaymentMode = "pix" | "card1" | "card2";
type MercadoLivreListingType = "classico" | "premium" | "full";
type ComboFamily = "minimalistas" | "mesclados" | "estampados";

type ComboDefinition = {
  id: ComboId;
  label: string;
  family: ComboFamily;
  totalQuantity: number;
  plainQuantity: number;
  printedQuantity: number;
  compositionLabel: string;
};

type LabState = {
  comboPrices: Record<
    ComboId,
    {
      nuvemshop: number;
      tiktok: number;
      mercadolivre: number | null;
    }
  >;
  familyTargets: Record<
    ComboFamily,
    {
      nuvemshop: number;
      tiktok: number;
      mercadolivre: number;
    }
  >;
  channels: {
    nuvemshop: {
      monthlyTraffic: number;
      monthlyPlatform: number;
      monthlyVolume: number;
      companyShipping: number;
      paymentMode: NuvemPaymentMode;
      couponEnabled: boolean;
      gohanEnabled: boolean;
      gohanPercent: number;
    };
    tiktok: {
      platformPercent: number;
      fixedFee: number;
      shippingPercent: number;
      shippingEnabled: boolean;
      affiliatePercent: number;
      affiliateEnabled: boolean;
      companyShipping: number;
      otherCosts: number;
      monthlyFixed: number;
      monthlyVolume: number;
    };
    mercadolivre: {
      listingType: MercadoLivreListingType;
      commissionPercent: number | null;
      fixedFee: number;
      companyShipping: number;
      otherCosts: number;
      monthlyFixed: number;
      monthlyVolume: number;
    };
  };
};

type ScenarioResult = {
  ready: boolean;
  missingReason: string;
  salePrice: number;
  grossRevenue: number;
  discountValue: number;
  netRevenue: number;
  productionCost: number;
  feeCost: number;
  affiliateCost: number;
  gohanCost: number;
  shippingCost: number;
  otherCosts: number;
  contributionValue: number;
  contributionMargin: number;
  fixedAllocation: number | null;
  finalProfit: number;
  finalMargin: number;
  targetPrice: number | null;
};

type ImpactRow = {
  comboId: ComboId;
  channel: ChannelKey;
  label: string;
  profitDelta: number;
  marginDelta: number;
};

type SimuladorClientProps = {
  initialConfig: FinanceConfig;
  initialPersistence: FinancePersistenceState;
};

const LOCAL_STORAGE_KEY = "rm-laboratorio-margens-v2";

const COMBOS: ComboDefinition[] = [
  {
    id: "mini-2",
    label: "2 Minimalistas",
    family: "minimalistas",
    totalQuantity: 2,
    plainQuantity: 2,
    printedQuantity: 0,
    compositionLabel: "2 lisas",
  },
  {
    id: "mini-4",
    label: "4 Minimalistas",
    family: "minimalistas",
    totalQuantity: 4,
    plainQuantity: 4,
    printedQuantity: 0,
    compositionLabel: "4 lisas",
  },
  {
    id: "mini-5",
    label: "5 Minimalistas",
    family: "minimalistas",
    totalQuantity: 5,
    plainQuantity: 5,
    printedQuantity: 0,
    compositionLabel: "5 lisas",
  },
  {
    id: "mix-2",
    label: "2 Mescladas",
    family: "mesclados",
    totalQuantity: 2,
    plainQuantity: 1,
    printedQuantity: 1,
    compositionLabel: "1 minimalista + 1 estampada",
  },
  {
    id: "mix-4",
    label: "4 Mescladas",
    family: "mesclados",
    totalQuantity: 4,
    plainQuantity: 2,
    printedQuantity: 2,
    compositionLabel: "2 minimalistas + 2 estampadas",
  },
  {
    id: "mix-5",
    label: "5 Mescladas",
    family: "mesclados",
    totalQuantity: 5,
    plainQuantity: 3,
    printedQuantity: 2,
    compositionLabel: "3 minimalistas + 2 estampadas",
  },
  {
    id: "print-2",
    label: "2 Estampadas",
    family: "estampados",
    totalQuantity: 2,
    plainQuantity: 0,
    printedQuantity: 2,
    compositionLabel: "2 estampadas",
  },
  {
    id: "print-4",
    label: "4 Estampadas",
    family: "estampados",
    totalQuantity: 4,
    plainQuantity: 0,
    printedQuantity: 4,
    compositionLabel: "4 estampadas",
  },
  {
    id: "print-5",
    label: "5 Estampadas",
    family: "estampados",
    totalQuantity: 5,
    plainQuantity: 0,
    printedQuantity: 5,
    compositionLabel: "5 estampadas",
  },
];

const CHANNELS: Array<{
  key: ChannelKey;
  label: string;
}> = [
  { key: "nuvemshop", label: "Nuvemshop" },
  { key: "tiktok", label: "TikTok Shop" },
  { key: "mercadolivre", label: "Mercado Livre" },
];

const DEFAULT_LAB_STATE: LabState = {
  comboPrices: {
    "mini-2": { nuvemshop: 139.9, tiktok: 149.9, mercadolivre: null },
    "mini-4": { nuvemshop: 259.9, tiktok: 279.9, mercadolivre: null },
    "mini-5": { nuvemshop: 319.9, tiktok: 339.9, mercadolivre: null },
    "mix-2": { nuvemshop: 169.9, tiktok: 179.9, mercadolivre: null },
    "mix-4": { nuvemshop: 309.9, tiktok: 329.9, mercadolivre: null },
    "mix-5": { nuvemshop: 369.9, tiktok: 399.9, mercadolivre: null },
    "print-2": { nuvemshop: 185.9, tiktok: 199.9, mercadolivre: null },
    "print-4": { nuvemshop: 359.9, tiktok: 379.9, mercadolivre: null },
    "print-5": { nuvemshop: 439.9, tiktok: 469.9, mercadolivre: null },
  },
  familyTargets: {
    minimalistas: { nuvemshop: 38.1, tiktok: 38.1, mercadolivre: 25 },
    mesclados: { nuvemshop: 38.8, tiktok: 38.1, mercadolivre: 25 },
    estampados: { nuvemshop: 37.2, tiktok: 36.9, mercadolivre: 25 },
  },
  channels: {
    nuvemshop: {
      monthlyTraffic: 1200,
      monthlyPlatform: 70,
      monthlyVolume: 100,
      companyShipping: 0,
      paymentMode: "card1",
      couponEnabled: true,
      gohanEnabled: false,
      gohanPercent: 7,
    },
    tiktok: {
      platformPercent: 6,
      fixedFee: 6,
      shippingPercent: 6,
      shippingEnabled: true,
      affiliatePercent: 10,
      affiliateEnabled: true,
      companyShipping: 0,
      otherCosts: 0,
      monthlyFixed: 0,
      monthlyVolume: 100,
    },
    mercadolivre: {
      listingType: "classico",
      commissionPercent: null,
      fixedFee: 0,
      companyShipping: 0,
      otherCosts: 0,
      monthlyFixed: 0,
      monthlyVolume: 100,
    },
  },
};

const EPSILON = 0.0001;

export function SimuladorClient({
  initialConfig,
  initialPersistence,
}: SimuladorClientProps) {
  const [officialConfig, setOfficialConfig] = useState(initialConfig);
  const [draftConfig, setDraftConfig] = useState(initialConfig);
  const [officialLabState, setOfficialLabState] =
    useState<LabState>(DEFAULT_LAB_STATE);
  const [draftLabState, setDraftLabState] = useState<LabState>(DEFAULT_LAB_STATE);
  const [selectedChannel, setSelectedChannel] =
    useState<ChannelKey>("nuvemshop");
  const [selectedComboId, setSelectedComboId] = useState<ComboId>("mini-2");
  const [persistence, setPersistence] =
    useState<FinancePersistenceState>(initialPersistence);
  const [feedback, setFeedback] = useState(initialPersistence.message);
  const [isSaving, setIsSaving] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored) as Partial<LabState>;
        const merged = mergeLabState(DEFAULT_LAB_STATE, parsed);
        setOfficialLabState(merged);
        setDraftLabState(merged);
      } else {
        setOfficialLabState(DEFAULT_LAB_STATE);
        setDraftLabState(DEFAULT_LAB_STATE);
      }
    } catch {
      setOfficialLabState(DEFAULT_LAB_STATE);
      setDraftLabState(DEFAULT_LAB_STATE);
    } finally {
      setIsReady(true);
    }
  }, []);

  const selectedCombo = useMemo(
    () => COMBOS.find((combo) => combo.id === selectedComboId) ?? COMBOS[0],
    [selectedComboId],
  );
  const selectedFamilyTarget = useMemo(
    () =>
      getFamilyTargetMargin(
        draftLabState,
        selectedCombo.family,
        selectedChannel,
        draftConfig.desiredMargin,
      ),
    [draftConfig.desiredMargin, draftLabState, selectedChannel, selectedCombo.family],
  );

  const topMetrics = useMemo(() => {
    const minimalCost = getMinimalUnitCost(draftConfig);
    const printedCost = getPrintedUnitCost(draftConfig);
    const selectedChannelFixed = getChannelFixedAllocation(
      selectedChannel,
      draftLabState,
    );
    const selectedChannelResults = COMBOS.map((combo) =>
      calculateScenario(combo, selectedChannel, draftConfig, draftLabState),
    ).filter((item) => item.ready);
    const averageMargin =
      selectedChannelResults.length > 0
        ? selectedChannelResults.reduce((sum, item) => sum + item.finalMargin, 0) /
          selectedChannelResults.length
        : 0;

    return [
      {
        label: "Custo Minimalista",
        value: formatMoney(minimalCost),
        detail: "Sem despesas fixas rateadas",
      },
      {
        label: "Custo Estampada",
        value: formatMoney(printedCost),
        detail: "Sem despesas fixas rateadas",
      },
      {
        label: "Despesa fixa / peca",
        value:
          selectedChannelFixed === null
            ? "Indisponivel"
            : formatMoney(selectedChannelFixed),
        detail: getChannelLabel(selectedChannel),
      },
      {
        label: "Margem media",
        value:
          selectedChannelResults.length > 0
            ? formatPercent(averageMargin)
            : "Pendente",
        detail: getChannelLabel(selectedChannel),
      },
    ];
  }, [draftConfig, draftLabState, selectedChannel]);

  const groupedCombos = useMemo(() => {
    const groups: Array<{
      key: ComboDefinition["family"];
      label: string;
      items: Array<{
        combo: ComboDefinition;
        result: ScenarioResult;
      }>;
    }> = [
      { key: "minimalistas", label: "Minimalistas", items: [] },
      { key: "mesclados", label: "Mesclados", items: [] },
      { key: "estampados", label: "Estampados", items: [] },
    ];

    COMBOS.forEach((combo) => {
      const group = groups.find((item) => item.key === combo.family);
      if (!group) {
        return;
      }

      group.items.push({
        combo,
        result: calculateScenario(combo, selectedChannel, draftConfig, draftLabState),
      });
    });

    return groups;
  }, [draftConfig, draftLabState, selectedChannel]);

  const beforeResult = useMemo(
    () =>
      calculateScenario(
        selectedCombo,
        selectedChannel,
        officialConfig,
        officialLabState,
      ),
    [officialConfig, officialLabState, selectedChannel, selectedCombo],
  );

  const afterResult = useMemo(
    () =>
      calculateScenario(selectedCombo, selectedChannel, draftConfig, draftLabState),
    [draftConfig, draftLabState, selectedChannel, selectedCombo],
  );

  const impactedRows = useMemo<ImpactRow[]>(() => {
    const rows: ImpactRow[] = [];

    COMBOS.forEach((combo) => {
      CHANNELS.forEach((channel) => {
        const before = calculateScenario(
          combo,
          channel.key,
          officialConfig,
          officialLabState,
        );
        const after = calculateScenario(combo, channel.key, draftConfig, draftLabState);

        if (!before.ready && !after.ready) {
          return;
        }

        const profitDelta = after.finalProfit - before.finalProfit;
        const marginDelta = after.finalMargin - before.finalMargin;

        if (
          Math.abs(profitDelta) < EPSILON &&
          Math.abs(marginDelta) < EPSILON &&
          Math.abs(after.salePrice - before.salePrice) < EPSILON
        ) {
          return;
        }

        rows.push({
          comboId: combo.id,
          channel: channel.key,
          label: `${combo.label} · ${channel.label}`,
          profitDelta,
          marginDelta,
        });
      });
    });

    return rows.sort((left, right) => Math.abs(right.profitDelta) - Math.abs(left.profitDelta));
  }, [draftConfig, draftLabState, officialConfig, officialLabState]);

  const hasPendingChanges = useMemo(
    () =>
      JSON.stringify(officialConfig) !== JSON.stringify(draftConfig) ||
      JSON.stringify(officialLabState) !== JSON.stringify(draftLabState),
    [draftConfig, draftLabState, officialConfig, officialLabState],
  );

  async function handleApplyChanges() {
    setIsSaving(true);
    setFeedback("");

    try {
      const response = await fetch("/api/financeiro/configuracao", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftConfig),
      });

      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
        persistence?: FinancePersistenceState;
        config?: FinanceConfig;
      };

      if (!response.ok || !result.ok || !result.config) {
        throw new Error(
          result.message || "Nao foi possivel aplicar as alteracoes no Supabase.",
        );
      }

      setOfficialConfig(result.config);
      setDraftConfig(result.config);
      setOfficialLabState(draftLabState);
      setDraftLabState(draftLabState);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(draftLabState));

      if (result.persistence) {
        setPersistence(result.persistence);
      }

      setFeedback(result.message || "Alteracoes aplicadas com sucesso.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel aplicar as alteracoes.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleRestore() {
    setDraftConfig(officialConfig);
    setDraftLabState(officialLabState);
    setFeedback("Simulacao descartada. Valores oficiais restaurados.");
  }

  function handleConfigNumberChange(key: keyof FinanceConfig, value: string) {
    setDraftConfig((current) => ({
      ...current,
      [key]: parseNumber(value),
    }));
  }

  function handleFamilyTargetChange(
    family: ComboFamily,
    channel: ChannelKey,
    value: string,
  ) {
    setDraftLabState((current) => ({
      ...current,
      familyTargets: {
        ...current.familyTargets,
        [family]: {
          ...current.familyTargets[family],
          [channel]: parseNumber(value),
        },
      },
    }));
  }

  function handleNuvemshopChange(
    key: keyof LabState["channels"]["nuvemshop"],
    value: string | boolean,
  ) {
    setDraftLabState((current) => ({
      ...current,
      channels: {
        ...current.channels,
        nuvemshop: {
          ...current.channels.nuvemshop,
          [key]:
            typeof value === "boolean"
              ? value
              : key === "paymentMode"
                ? value
                : parseNumber(value),
        },
      },
    }));
  }

  function handleTikTokChange(
    key: keyof LabState["channels"]["tiktok"],
    value: string | boolean,
  ) {
    setDraftLabState((current) => ({
      ...current,
      channels: {
        ...current.channels,
        tiktok: {
          ...current.channels.tiktok,
          [key]: typeof value === "boolean" ? value : parseNumber(value),
        },
      },
    }));
  }

  function handleMercadoLivreChange(
    key: keyof LabState["channels"]["mercadolivre"],
    value: string,
  ) {
    setDraftLabState((current) => ({
      ...current,
      channels: {
        ...current.channels,
        mercadolivre: {
          ...current.channels.mercadolivre,
          [key]:
            key === "listingType"
              ? value
              : key === "commissionPercent"
                ? normalizeNullablePrice(value)
                : parseNumber(value),
        },
      },
    }));
  }

  function handleSelectedPaymentFeeChange(field: "percent" | "fixed", value: string) {
    const paymentMode = draftLabState.channels.nuvemshop.paymentMode;
    const parsed = parseNumber(value);

    if (paymentMode === "pix") {
      setDraftConfig((current) => ({
        ...current,
        [field === "percent" ? "nuvemPixPercent" : "nuvemPixFixed"]: parsed,
      }));
      return;
    }

    if (paymentMode === "card1") {
      setDraftConfig((current) => ({
        ...current,
        [field === "percent" ? "nuvemCard1Percent" : "nuvemCard1Fixed"]: parsed,
      }));
      return;
    }

    setDraftConfig((current) => ({
      ...current,
      [field === "percent" ? "nuvemCard2Percent" : "nuvemCard2Fixed"]: parsed,
    }));
  }

  const currentPaymentRate = getCurrentNuvemRate(
    draftConfig,
    draftLabState.channels.nuvemshop.paymentMode,
  );

  if (!isReady) {
    return null;
  }

  return (
    <section className={styles.labRoot}>
      <header className={styles.header}>
        <div>
          <div className={styles.headerEyebrow}>Repeticao Maxima</div>
          <h2 className={styles.headerTitle}>Laboratorio de Margens</h2>
          <p className={styles.headerDescription}>
            Ajuste custos, precos e taxas sem sair da tela. O impacto aparece na
            hora no combo selecionado e em todos os itens afetados.
          </p>
        </div>

        <div className={styles.channelTabs} role="tablist" aria-label="Canal de venda">
          {CHANNELS.map((channel) => (
            <button
              key={channel.key}
              type="button"
              className={`${styles.channelTab} ${
                selectedChannel === channel.key ? styles.channelTabActive : ""
              }`}
              onClick={() => setSelectedChannel(channel.key)}
            >
              {channel.label}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.summaryGrid}>
        {topMetrics.map((metric) => (
          <article key={metric.label} className={styles.summaryCard}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>

      <div className={styles.mainLayout}>
        <div className={styles.boardColumn}>
          <section className={styles.boardSection}>
            <div className={styles.sectionTitleRow}>
              <div>
                <h3>Combos - {getChannelLabel(selectedChannel)}</h3>
                <p>
                  Clique em um combo para editar do lado direito. Os cards ja
                  refletem o cenario atual da simulacao.
                </p>
              </div>
            </div>

            <div className={styles.kanbanGroups}>
              {groupedCombos.map((group) => (
                <div key={group.key} className={styles.groupBlock}>
                  <div className={styles.groupTitle}>{group.label}</div>
                  <div className={styles.comboGrid}>
                    {group.items.map(({ combo, result }) => (
                      <button
                        key={combo.id}
                        type="button"
                        className={`${styles.comboCard} ${
                          selectedCombo.id === combo.id ? styles.comboCardActive : ""
                        }`}
                        onClick={() => setSelectedComboId(combo.id)}
                      >
                        <div className={styles.comboCardTop}>
                          <div>
                            <span className={styles.comboName}>{combo.label}</span>
                            <small>{combo.compositionLabel}</small>
                          </div>
                          <span
                            className={getMarginToneClass(
                              result.finalMargin,
                              getFamilyTargetMargin(
                                draftLabState,
                                combo.family,
                                selectedChannel,
                                draftConfig.desiredMargin,
                              ),
                              styles,
                            )}
                          >
                            {result.ready ? formatPercent(result.finalMargin) : "Pendente"}
                          </span>
                        </div>

                        <div className={styles.comboPrice}>
                          {result.ready ? formatMoney(result.salePrice) : "Sem preco"}
                        </div>

                        <div className={styles.comboMeta}>
                          <span>
                            Custo:{" "}
                            {result.ready
                              ? formatMoney(result.productionCost)
                              : result.missingReason}
                          </span>
                          <strong>
                            Lucro:{" "}
                            {result.ready
                              ? formatMoney(result.finalProfit)
                              : result.missingReason}
                          </strong>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.boardSection}>
            <div className={styles.sectionTitleRow}>
              <div>
                <h3>Antes x Depois da alteracao</h3>
                <p>
                  O comparativo e instantaneo. O cenario oficial fica intacto ate
                  voce clicar em aplicar alteracoes.
                </p>
              </div>
            </div>

            <div className={styles.comparisonGrid}>
              <article className={styles.comparisonCard}>
                <span>Cenario atual</span>
                <strong>{formatMoney(beforeResult.salePrice)}</strong>
                <div className={styles.comparisonStats}>
                  <div>
                    <span>Margem</span>
                    <strong>
                      {beforeResult.ready
                        ? formatPercent(beforeResult.finalMargin)
                        : beforeResult.missingReason}
                    </strong>
                  </div>
                  <div>
                    <span>Lucro</span>
                    <strong>
                      {beforeResult.ready
                        ? formatMoney(beforeResult.finalProfit)
                        : beforeResult.missingReason}
                    </strong>
                  </div>
                </div>
              </article>

              <article className={`${styles.comparisonCard} ${styles.comparisonCardHighlight}`}>
                <span>Novo cenario</span>
                <strong>{formatMoney(afterResult.salePrice)}</strong>
                <div className={styles.comparisonStats}>
                  <div>
                    <span>Margem</span>
                    <strong>
                      {afterResult.ready
                        ? formatPercent(afterResult.finalMargin)
                        : afterResult.missingReason}
                    </strong>
                  </div>
                  <div>
                    <span>Lucro</span>
                    <strong>
                      {afterResult.ready
                        ? formatMoney(afterResult.finalProfit)
                        : afterResult.missingReason}
                    </strong>
                  </div>
                </div>
              </article>

              <article className={styles.impactCard}>
                <span>Impacto da alteracao</span>
                <strong
                  className={
                    afterResult.finalProfit - beforeResult.finalProfit >= 0
                      ? styles.impactPositive
                      : styles.impactNegative
                  }
                >
                  {formatDeltaMoney(afterResult.finalProfit - beforeResult.finalProfit)}
                </strong>
                <div className={styles.impactMargin}>
                  {formatDeltaPoints(afterResult.finalMargin - beforeResult.finalMargin)}
                </div>
              </article>
            </div>

            <div className={styles.impactList}>
              <div className={styles.impactListTitle}>Combos e canais afetados</div>
              {impactedRows.length > 0 ? (
                <div className={styles.impactRows}>
                  {impactedRows.slice(0, 12).map((row) => (
                    <div key={`${row.comboId}-${row.channel}`} className={styles.impactRow}>
                      <span>{row.label}</span>
                      <strong
                        className={
                          row.profitDelta >= 0
                            ? styles.impactPositive
                            : styles.impactNegative
                        }
                      >
                        {formatDeltaMoney(row.profitDelta)} ·{" "}
                        {formatDeltaPoints(row.marginDelta)}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyImpact}>
                  Nenhuma alteracao em andamento. Edite um custo, uma meta ou uma
                  taxa para ver o efeito nos combos.
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className={styles.editorPanel}>
          <div className={styles.editorHeader}>
            <div>
              <h3>Ajustes da familia selecionada</h3>
              <p>
                {getFamilyLabel(selectedCombo.family)} · {getChannelLabel(selectedChannel)}
              </p>
            </div>
          </div>

          <div className={styles.editorFields}>
            <div className={styles.editorNote}>
              Mexer aqui recalcula automaticamente todos os combos de{" "}
              {getFamilyLabel(selectedCombo.family).toLowerCase()} desse canal.
            </div>

            <label className={styles.field}>
              <span>Custo camiseta (R$)</span>
              <input
                type="number"
                step="0.01"
                value={draftConfig.productCost}
                onChange={(event) =>
                  handleConfigNumberChange("productCost", event.target.value)
                }
              />
            </label>

            <label className={styles.field}>
              <span>Embalagem (R$)</span>
              <input
                type="number"
                step="0.01"
                value={draftConfig.packagingCost}
                onChange={(event) =>
                  handleConfigNumberChange("packagingCost", event.target.value)
                }
              />
            </label>

            <label className={styles.field}>
              <span>DTF por camiseta (R$)</span>
              <input
                type="number"
                step="0.01"
                value={draftConfig.printCost}
                onChange={(event) =>
                  handleConfigNumberChange("printCost", event.target.value)
                }
              />
            </label>

            <label className={styles.field}>
              <span>Custo adicional por peca (R$)</span>
              <input
                type="number"
                step="0.01"
                value={draftConfig.operationCost}
                onChange={(event) =>
                  handleConfigNumberChange("operationCost", event.target.value)
                }
              />
            </label>

            <label className={styles.field}>
              <span>Meta da familia (%)</span>
              <input
                type="number"
                step="0.01"
                value={selectedFamilyTarget}
                onChange={(event) =>
                  handleFamilyTargetChange(
                    selectedCombo.family,
                    selectedChannel,
                    event.target.value,
                  )
                }
              />
            </label>
          </div>

          {selectedChannel === "nuvemshop" ? (
            <div className={styles.channelSection}>
              <div className={styles.channelSectionTitle}>Taxas da Nuvemshop</div>

              <label className={styles.field}>
                <span>Pagamento</span>
                <select
                  value={draftLabState.channels.nuvemshop.paymentMode}
                  onChange={(event) =>
                    handleNuvemshopChange("paymentMode", event.target.value)
                  }
                >
                  <option value="pix">Pix</option>
                  <option value="card1">Cartao 1x</option>
                  <option value="card2">Cartao 2x</option>
                </select>
              </label>

              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Taxa (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={currentPaymentRate.percent}
                    onChange={(event) =>
                      handleSelectedPaymentFeeChange("percent", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Tarifa fixa (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={currentPaymentRate.fixed}
                    onChange={(event) =>
                      handleSelectedPaymentFeeChange("fixed", event.target.value)
                    }
                  />
                </label>
              </div>

              <div className={styles.toggleGrid}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={draftLabState.channels.nuvemshop.couponEnabled}
                    onChange={(event) =>
                      handleNuvemshopChange("couponEnabled", event.target.checked)
                    }
                  />
                  <span>Cupom de 10%</span>
                </label>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={draftLabState.channels.nuvemshop.gohanEnabled}
                    onChange={(event) =>
                      handleNuvemshopChange("gohanEnabled", event.target.checked)
                    }
                  />
                  <span>Comissao Gohan</span>
                </label>
              </div>

              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Comissao Gohan (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.nuvemshop.gohanPercent}
                    onChange={(event) =>
                      handleNuvemshopChange("gohanPercent", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Frete pago pela empresa (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.nuvemshop.companyShipping}
                    onChange={(event) =>
                      handleNuvemshopChange("companyShipping", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Trafego pago mensal</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.nuvemshop.monthlyTraffic}
                    onChange={(event) =>
                      handleNuvemshopChange("monthlyTraffic", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Plataforma mensal</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.nuvemshop.monthlyPlatform}
                    onChange={(event) =>
                      handleNuvemshopChange("monthlyPlatform", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Volume mensal vendido</span>
                  <input
                    type="number"
                    step="1"
                    value={draftLabState.channels.nuvemshop.monthlyVolume}
                    onChange={(event) =>
                      handleNuvemshopChange("monthlyVolume", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          ) : null}

          {selectedChannel === "tiktok" ? (
            <div className={styles.channelSection}>
              <div className={styles.channelSectionTitle}>Taxas do TikTok Shop</div>

              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Comissao plataforma (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.tiktok.platformPercent}
                    onChange={(event) =>
                      handleTikTokChange("platformPercent", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Tarifa fixa (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.tiktok.fixedFee}
                    onChange={(event) =>
                      handleTikTokChange("fixedFee", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Programa de frete (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.tiktok.shippingPercent}
                    onChange={(event) =>
                      handleTikTokChange("shippingPercent", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Comissao afiliado (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.tiktok.affiliatePercent}
                    onChange={(event) =>
                      handleTikTokChange("affiliatePercent", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Frete pago pela empresa (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.tiktok.companyShipping}
                    onChange={(event) =>
                      handleTikTokChange("companyShipping", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Outros custos (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.tiktok.otherCosts}
                    onChange={(event) =>
                      handleTikTokChange("otherCosts", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Despesas fixas mensais</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.tiktok.monthlyFixed}
                    onChange={(event) =>
                      handleTikTokChange("monthlyFixed", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Volume mensal vendido</span>
                  <input
                    type="number"
                    step="1"
                    value={draftLabState.channels.tiktok.monthlyVolume}
                    onChange={(event) =>
                      handleTikTokChange("monthlyVolume", event.target.value)
                    }
                  />
                </label>
              </div>

              <div className={styles.toggleGrid}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={draftLabState.channels.tiktok.shippingEnabled}
                    onChange={(event) =>
                      handleTikTokChange("shippingEnabled", event.target.checked)
                    }
                  />
                  <span>Programa de frete ativo</span>
                </label>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={draftLabState.channels.tiktok.affiliateEnabled}
                    onChange={(event) =>
                      handleTikTokChange("affiliateEnabled", event.target.checked)
                    }
                  />
                  <span>Venda por afiliado</span>
                </label>
              </div>
            </div>
          ) : null}

          {selectedChannel === "mercadolivre" ? (
            <div className={styles.channelSection}>
              <div className={styles.channelSectionTitle}>Taxas do Mercado Livre</div>

              <label className={styles.field}>
                <span>Tipo de anuncio</span>
                <select
                  value={draftLabState.channels.mercadolivre.listingType}
                  onChange={(event) =>
                    handleMercadoLivreChange("listingType", event.target.value)
                  }
                >
                  <option value="classico">Classico</option>
                  <option value="premium">Premium</option>
                  <option value="full">Full</option>
                </select>
              </label>

              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Comissao marketplace (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Nao configurado"
                    value={draftLabState.channels.mercadolivre.commissionPercent ?? ""}
                    onChange={(event) =>
                      handleMercadoLivreChange(
                        "commissionPercent",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Tarifa fixa (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.mercadolivre.fixedFee}
                    onChange={(event) =>
                      handleMercadoLivreChange("fixedFee", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Frete pago pela empresa (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.mercadolivre.companyShipping}
                    onChange={(event) =>
                      handleMercadoLivreChange("companyShipping", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Custos adicionais (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.mercadolivre.otherCosts}
                    onChange={(event) =>
                      handleMercadoLivreChange("otherCosts", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Despesas fixas mensais</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftLabState.channels.mercadolivre.monthlyFixed}
                    onChange={(event) =>
                      handleMercadoLivreChange("monthlyFixed", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Volume mensal vendido</span>
                  <input
                    type="number"
                    step="1"
                    value={draftLabState.channels.mercadolivre.monthlyVolume}
                    onChange={(event) =>
                      handleMercadoLivreChange("monthlyVolume", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          ) : null}

          <div className={styles.resultPanel}>
            <div className={styles.resultPanelTitle}>Resultado do combo</div>
            <div className={styles.resultRows}>
              <div className={styles.resultRow}>
                <span>Receita bruta</span>
                <strong>{formatMoney(afterResult.grossRevenue)}</strong>
              </div>
              <div className={styles.resultRow}>
                <span>Receita apos descontos</span>
                <strong>{formatMoney(afterResult.netRevenue)}</strong>
              </div>
              <div className={styles.resultRow}>
                <span>Custos de producao</span>
                <strong>{formatMoney(afterResult.productionCost)}</strong>
              </div>
              <div className={styles.resultRow}>
                <span>Taxas e comissoes</span>
                <strong>
                  {formatMoney(
                    afterResult.feeCost + afterResult.affiliateCost + afterResult.gohanCost,
                  )}
                </strong>
              </div>
              <div className={styles.resultRow}>
                <span>Frete e custos extras</span>
                <strong>
                  {formatMoney(afterResult.shippingCost + afterResult.otherCosts)}
                </strong>
              </div>
              <div className={styles.resultRow}>
                <span>Margem de contribuicao</span>
                <strong>
                  {afterResult.ready
                    ? `${formatMoney(afterResult.contributionValue)} · ${formatPercent(afterResult.contributionMargin)}`
                    : afterResult.missingReason}
                </strong>
              </div>
              <div className={styles.resultRow}>
                <span>Despesas fixas rateadas</span>
                <strong>
                  {afterResult.fixedAllocation === null
                    ? "Indisponivel"
                    : formatMoney(afterResult.fixedAllocation)}
                </strong>
              </div>
              <div className={styles.resultRowStrong}>
                <span>Lucro liquido</span>
                <strong>{formatMoney(afterResult.finalProfit)}</strong>
              </div>
            </div>

            <div className={styles.marginBox}>
              <div className={styles.marginValue}>
                {afterResult.ready ? formatPercent(afterResult.finalMargin) : "Pendente"}
              </div>
              <div className={styles.marginMeta}>
                {afterResult.finalMargin >= selectedFamilyTarget
                  ? "Dentro da meta"
                  : "Abaixo da meta"}
              </div>
              <div className={styles.marginHint}>
                Meta da familia: {formatPercent(selectedFamilyTarget)}
              </div>
              <div className={styles.marginHint}>
                Preco projetado:{" "}
                {afterResult.targetPrice === null
                  ? "Reveja taxas"
                  : formatMoney(afterResult.targetPrice)}
              </div>
            </div>
          </div>

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleRestore}
              disabled={!hasPendingChanges || isSaving}
            >
              Restaurar
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleApplyChanges()}
              disabled={!hasPendingChanges || isSaving}
            >
              {isSaving ? "Aplicando..." : "Aplicar alteracoes"}
            </button>
          </div>

          <div
            className={`${styles.feedbackPanel} ${
              persistence.enabled ? styles.feedbackNeutral : styles.feedbackWarning
            }`}
          >
            <strong>
              {persistence.enabled ? "Base oficial conectada" : "Persistencia indisponivel"}
            </strong>
            <span>{feedback || persistence.message}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}

function calculateScenario(
  combo: ComboDefinition,
  channel: ChannelKey,
  config: FinanceConfig,
  labState: LabState,
): ScenarioResult {
  const minimalUnitCost = getMinimalUnitCost(config);
  const printedUnitCost = getPrintedUnitCost(config);
  const productionCost =
    combo.plainQuantity * minimalUnitCost + combo.printedQuantity * printedUnitCost;
  const fixedAllocation = getChannelFixedAllocation(channel, labState);
  const targetMargin = getFamilyTargetMargin(
    labState,
    combo.family,
    channel,
    config.desiredMargin,
  );
  const price = calculateTargetPrice(
    channel,
    config,
    labState,
    productionCost,
    fixedAllocation,
    targetMargin,
  );

  if (price === null || price <= 0) {
    return buildEmptyScenario("Nao foi possivel projetar o preco.");
  }

  const grossRevenue = price;
  let discountValue = 0;
  let netRevenue = grossRevenue;
  let feeCost = 0;
  let affiliateCost = 0;
  let gohanCost = 0;
  let shippingCost = 0;
  let otherCosts = 0;

  if (channel === "nuvemshop") {
    const channelConfig = labState.channels.nuvemshop;
    const paymentRate = getCurrentNuvemRate(config, channelConfig.paymentMode);
    discountValue = channelConfig.couponEnabled
      ? grossRevenue * (config.couponPercent / 100)
      : 0;
    netRevenue = grossRevenue - discountValue;
    feeCost = netRevenue * (paymentRate.percent / 100) + paymentRate.fixed;
    shippingCost = channelConfig.companyShipping;
    const preGohanProfit = netRevenue - productionCost - feeCost - shippingCost;

    if (channelConfig.gohanEnabled && preGohanProfit > 0) {
      gohanCost = preGohanProfit * (channelConfig.gohanPercent / 100);
    }
  }

  if (channel === "tiktok") {
    const channelConfig = labState.channels.tiktok;
    netRevenue = grossRevenue;
    feeCost = netRevenue * (channelConfig.platformPercent / 100) + channelConfig.fixedFee;

    if (channelConfig.shippingEnabled) {
      feeCost += netRevenue * (channelConfig.shippingPercent / 100);
    }

    if (channelConfig.affiliateEnabled) {
      affiliateCost = netRevenue * (channelConfig.affiliatePercent / 100);
    }

    shippingCost = channelConfig.companyShipping;
    otherCosts = channelConfig.otherCosts;
  }

  if (channel === "mercadolivre") {
    const channelConfig = labState.channels.mercadolivre;

    if (channelConfig.commissionPercent === null) {
      return buildEmptyScenario("Defina a comissao do Mercado Livre.");
    }

    netRevenue = grossRevenue;
    feeCost =
      netRevenue * (channelConfig.commissionPercent / 100) + channelConfig.fixedFee;
    shippingCost = channelConfig.companyShipping;
    otherCosts = channelConfig.otherCosts;
  }

  const contributionValue =
    netRevenue -
    productionCost -
    feeCost -
    affiliateCost -
    gohanCost -
    shippingCost -
    otherCosts;
  const contributionMargin =
    netRevenue > 0 ? (contributionValue / netRevenue) * 100 : 0;
  const finalProfit =
    contributionValue - (fixedAllocation === null ? 0 : fixedAllocation);
  const finalMargin = netRevenue > 0 ? (finalProfit / netRevenue) * 100 : 0;

  return {
    ready: true,
    missingReason: "",
    salePrice: price,
    grossRevenue,
    discountValue,
    netRevenue,
    productionCost,
    feeCost,
    affiliateCost,
    gohanCost,
    shippingCost,
    otherCosts,
    contributionValue,
    contributionMargin,
    fixedAllocation,
    finalProfit,
    finalMargin,
    targetPrice: price,
  };
}

function calculateTargetPrice(
  channel: ChannelKey,
  config: FinanceConfig,
  labState: LabState,
  productionCost: number,
  fixedAllocation: number | null,
  targetMarginPercent: number,
) {
  const targetMargin = targetMarginPercent / 100;
  const fixedCosts = (fixedAllocation === null ? 0 : fixedAllocation) + productionCost;

  if (channel === "nuvemshop") {
    const channelConfig = labState.channels.nuvemshop;
    const paymentRate = getCurrentNuvemRate(config, channelConfig.paymentMode);
    const couponMultiplier = channelConfig.couponEnabled
      ? 1 - config.couponPercent / 100
      : 1;
    const gohanPercent = channelConfig.gohanEnabled
      ? channelConfig.gohanPercent / 100
      : 0;
    const feePercent = paymentRate.percent / 100;
    const denominator =
      couponMultiplier * (1 - feePercent - gohanPercent - targetMargin);

    if (denominator <= 0) {
      return null;
    }

    return (
      (fixedCosts + paymentRate.fixed + channelConfig.companyShipping) / denominator
    );
  }

  if (channel === "tiktok") {
    const channelConfig = labState.channels.tiktok;
    const totalPercent =
      channelConfig.platformPercent +
      (channelConfig.shippingEnabled ? channelConfig.shippingPercent : 0) +
      (channelConfig.affiliateEnabled ? channelConfig.affiliatePercent : 0);
    const denominator = 1 - totalPercent / 100 - targetMargin;

    if (denominator <= 0) {
      return null;
    }

    return (
      (fixedCosts +
        channelConfig.fixedFee +
        channelConfig.companyShipping +
        channelConfig.otherCosts) /
      denominator
    );
  }

  const channelConfig = labState.channels.mercadolivre;

  if (channelConfig.commissionPercent === null) {
    return null;
  }

  const denominator = 1 - channelConfig.commissionPercent / 100 - targetMargin;

  if (denominator <= 0) {
    return null;
  }

  return (
    (fixedCosts +
      channelConfig.fixedFee +
      channelConfig.companyShipping +
      channelConfig.otherCosts) /
    denominator
  );
}

function getMinimalUnitCost(config: FinanceConfig) {
  return config.productCost + config.packagingCost + config.operationCost;
}

function getPrintedUnitCost(config: FinanceConfig) {
  return (
    config.productCost +
    config.printCost +
    config.packagingCost +
    config.operationCost
  );
}

function getChannelFixedAllocation(channel: ChannelKey, labState: LabState) {
  if (channel === "nuvemshop") {
    const fixed =
      labState.channels.nuvemshop.monthlyTraffic +
      labState.channels.nuvemshop.monthlyPlatform;
    return labState.channels.nuvemshop.monthlyVolume > 0
      ? fixed / labState.channels.nuvemshop.monthlyVolume
      : null;
  }

  if (channel === "tiktok") {
    return labState.channels.tiktok.monthlyVolume > 0
      ? labState.channels.tiktok.monthlyFixed / labState.channels.tiktok.monthlyVolume
      : null;
  }

  return labState.channels.mercadolivre.monthlyVolume > 0
    ? labState.channels.mercadolivre.monthlyFixed /
        labState.channels.mercadolivre.monthlyVolume
    : null;
}

function getCurrentNuvemRate(config: FinanceConfig, paymentMode: NuvemPaymentMode) {
  if (paymentMode === "pix") {
    return {
      percent: config.nuvemPixPercent,
      fixed: config.nuvemPixFixed,
    };
  }

  if (paymentMode === "card2") {
    return {
      percent: config.nuvemCard2Percent,
      fixed: config.nuvemCard2Fixed,
    };
  }

  return {
    percent: config.nuvemCard1Percent,
    fixed: config.nuvemCard1Fixed,
  };
}

function buildEmptyScenario(message: string): ScenarioResult {
  return {
    ready: false,
    missingReason: message,
    salePrice: 0,
    grossRevenue: 0,
    discountValue: 0,
    netRevenue: 0,
    productionCost: 0,
    feeCost: 0,
    affiliateCost: 0,
    gohanCost: 0,
    shippingCost: 0,
    otherCosts: 0,
    contributionValue: 0,
    contributionMargin: 0,
    fixedAllocation: null,
    finalProfit: 0,
    finalMargin: 0,
    targetPrice: null,
  };
}

function mergeLabState(base: LabState, incoming?: Partial<LabState>): LabState {
  if (!incoming) {
    return base;
  }

  return {
    comboPrices: {
      ...base.comboPrices,
      ...(incoming.comboPrices ?? {}),
    },
    familyTargets: {
      minimalistas: {
        ...base.familyTargets.minimalistas,
        ...(incoming.familyTargets?.minimalistas ?? {}),
      },
      mesclados: {
        ...base.familyTargets.mesclados,
        ...(incoming.familyTargets?.mesclados ?? {}),
      },
      estampados: {
        ...base.familyTargets.estampados,
        ...(incoming.familyTargets?.estampados ?? {}),
      },
    },
    channels: {
      nuvemshop: {
        ...base.channels.nuvemshop,
        ...(incoming.channels?.nuvemshop ?? {}),
      },
      tiktok: {
        ...base.channels.tiktok,
        ...(incoming.channels?.tiktok ?? {}),
      },
      mercadolivre: {
        ...base.channels.mercadolivre,
        ...(incoming.channels?.mercadolivre ?? {}),
      },
    },
  };
}

function getChannelLabel(channel: ChannelKey) {
  return CHANNELS.find((item) => item.key === channel)?.label ?? channel;
}

function getFamilyLabel(family: ComboFamily) {
  if (family === "minimalistas") {
    return "Minimalistas";
  }

  if (family === "mesclados") {
    return "Mescladas";
  }

  return "Estampadas";
}

function getFamilyTargetMargin(
  labState: LabState,
  family: ComboFamily,
  channel: ChannelKey,
  fallback: number,
) {
  const value = labState.familyTargets[family]?.[channel];
  return Number.isFinite(value) ? value : fallback;
}

function getMarginToneClass(
  margin: number,
  targetMargin: number,
  classNames: Record<string, string>,
) {
  if (margin >= targetMargin) {
    return classNames.marginOk;
  }

  if (margin > 0) {
    return classNames.marginWarn;
  }

  return classNames.marginBad;
}

function formatDeltaMoney(value: number) {
  if (Math.abs(value) < EPSILON) {
    return "R$ 0,00";
  }

  return `${value > 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;
}

function formatDeltaPoints(value: number) {
  if (Math.abs(value) < EPSILON) {
    return "0,0 p.p.";
  }

  return `${value > 0 ? "+" : "-"}${Math.abs(value)
    .toFixed(1)
    .replace(".", ",")} p.p.`;
}

function parseNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNullablePrice(value: string) {
  const normalized = value.replace(",", ".").trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
