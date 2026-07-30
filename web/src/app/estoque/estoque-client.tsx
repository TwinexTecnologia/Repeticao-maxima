"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/panel.module.css";
import {
  type BaseStockItem,
  type DtfArtType,
  type DtfCatalogProduct,
  type DtfStockItem,
  type NuvemshopStockProduct,
  type OperationalPersistenceState,
  type StockMovement,
} from "@/lib/operacoes/repository";
type EstoqueClientProps = {
  initialItems: BaseStockItem[];
  initialMovements: StockMovement[];
  initialPersistence: OperationalPersistenceState;
  initialDtfItems: DtfStockItem[];
  initialDtfPersistence: OperationalPersistenceState;
  dtfCatalog: DtfCatalogProduct[];
  dtfCatalogState: OperationalPersistenceState;
  initialNuvemshopStock: NuvemshopStockProduct[];
  initialNuvemshopStockState: OperationalPersistenceState;
};

type StockApiResponse = {
  ok: boolean;
  message?: string;
  persistence?: OperationalPersistenceState;
  item?: BaseStockItem;
};

type StockSavePayload = BaseStockItem & {
  movementReasonCategory?: string;
  movementReasonText?: string;
  movementSourceModule?: string;
};

type DtfApiResponse = {
  ok: boolean;
  message?: string;
  persistence?: OperationalPersistenceState;
  item?: DtfStockItem;
};

type StockAdjustmentState = {
  mode: "add" | "remove";
  quantity: string;
  reasonCategory: string;
  reasonText: string;
};

const TRACKED_BASE_COLORS = ["Preta", "Branca", "Roxa"] as const;

export function EstoqueClient({
  initialItems,
  initialMovements,
  initialPersistence,
  initialDtfItems,
  initialDtfPersistence,
  dtfCatalog,
  dtfCatalogState,
  initialNuvemshopStock,
  initialNuvemshopStockState,
}: EstoqueClientProps) {
  const router = useRouter();
  const initialVisibleBaseItems = initialItems.filter((item) =>
    TRACKED_BASE_COLORS.includes(item.color as (typeof TRACKED_BASE_COLORS)[number]),
  );
  const firstVisibleBaseItem = initialVisibleBaseItems[0] ?? initialItems[0] ?? null;
  const baseCategoryOptions = useMemo(
    () => getStockBaseCategoryOptions(initialNuvemshopStock),
    [initialNuvemshopStock],
  );
  const defaultBaseCategory = getDefaultStockCategory(initialNuvemshopStock);
  const [items, setItems] = useState(initialItems);
  const [movements, setMovements] = useState(initialMovements);
  const [persistence, setPersistence] =
    useState<OperationalPersistenceState>(initialPersistence);
  const [feedback, setFeedback] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [form, setForm] = useState({
    sku: defaultBaseCategory,
    color: "Preta",
    size: "M",
    total: "0",
    movementReasonCategory: "entrada_lote",
    movementReasonText: "",
    reorderPoint: "0",
    leadTimeDays: "10",
    notes: "",
  });
  const [drafts, setDrafts] = useState<Record<string, BaseStockItem>>(() =>
    initialItems.reduce<Record<string, BaseStockItem>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {}),
  );
  const [stockAdjustments, setStockAdjustments] = useState<
    Record<string, StockAdjustmentState>
  >({});
  const [selectedSku, setSelectedSku] = useState(firstVisibleBaseItem?.sku ?? "");
  const [selectedColor, setSelectedColor] = useState(firstVisibleBaseItem?.color ?? "");
  const [selectedSize, setSelectedSize] = useState(firstVisibleBaseItem?.size ?? "");

  const [dtfItems, setDtfItems] = useState(initialDtfItems);
  const [dtfPersistence, setDtfPersistence] =
    useState<OperationalPersistenceState>(initialDtfPersistence);
  const [dtfFeedback, setDtfFeedback] = useState("");
  const [isCreatingDtf, setIsCreatingDtf] = useState(false);
  const [savingDtfId, setSavingDtfId] = useState<string | null>(null);
  const [dtfForm, setDtfForm] = useState({
    nuvemshopProductId: dtfCatalog[0]?.productId ?? "",
    productName: dtfCatalog[0]?.productName ?? "",
    artType: "outro" as DtfArtType,
    availableQty: "0",
    reorderPoint: "0",
    leadTimeDays: "5",
    notes: "",
  });
  const [dtfDrafts, setDtfDrafts] = useState<Record<string, DtfStockItem>>(() =>
    initialDtfItems.reduce<Record<string, DtfStockItem>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {}),
  );
  const [selectedDtfId, setSelectedDtfId] = useState(initialDtfItems[0]?.id ?? "");
  const [selectedNuvemshopCategory, setSelectedNuvemshopCategory] =
    useState(defaultBaseCategory);
  const [selectedNuvemshopModel, setSelectedNuvemshopModel] = useState("");
  const [selectedNuvemshopColor, setSelectedNuvemshopColor] = useState("");
  const [selectedNuvemshopSize, setSelectedNuvemshopSize] = useState("");
  const [visibleNuvemshopItems, setVisibleNuvemshopItems] = useState(2);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    setMovements(initialMovements);
  }, [initialMovements]);

  useEffect(() => {
    setPersistence(initialPersistence);
  }, [initialPersistence]);

  const visibleBaseItems = useMemo(
    () =>
      items.filter((item) =>
        TRACKED_BASE_COLORS.includes(item.color as (typeof TRACKED_BASE_COLORS)[number]),
      ),
    [items],
  );

  const metrics = useMemo(() => {
    const totalLisas = visibleBaseItems.reduce((sum, item) => sum + item.plain, 0);
    const totalPublished = visibleBaseItems.reduce((sum, item) => sum + item.published, 0);
    const totalDifference = visibleBaseItems.reduce(
      (sum, item) => sum + Math.max(item.plain - item.published, 0),
      0,
    );

    return [
      {
        label: "Lisas em casa",
        value: String(totalLisas),
        detail: "Esse e o total fisico que voce controla internamente hoje.",
      },
      {
        label: "Preta",
        value: String(sumPlainStockByColor(visibleBaseItems, "Preta")),
        detail: "Saldo liso total da cor preta.",
      },
      {
        label: "Branca",
        value: String(sumPlainStockByColor(visibleBaseItems, "Branca")),
        detail: "Saldo liso total da cor branca.",
      },
      {
        label: "Roxa",
        value: String(sumPlainStockByColor(visibleBaseItems, "Roxa")),
        detail: "Saldo liso total da cor roxa.",
      },
      {
        label: "Alocado no site",
        value: String(totalPublished),
        detail: "Quantidade publicada na loja como referencia comercial.",
      },
      {
        label: "Folga interna",
        value: String(totalDifference),
        detail: "Quanto sobra nas lisas depois do que ja esta alocado no site.",
      },
    ];
  }, [visibleBaseItems]);

  const dtfMetrics = useMemo(() => {
    const totalAvailable = dtfItems.reduce(
      (sum, item) => sum + item.availableQty,
      0,
    );
    const atRisk = dtfItems.filter((item) => {
      const byPoint = item.availableQty <= item.reorderPoint;
      const byCoverage =
        item.estimatedCoverageDays !== null &&
        item.estimatedCoverageDays <= item.leadTimeDays;

      return byPoint || byCoverage;
    }).length;
    const averageLeadTime =
      dtfItems.length > 0
        ? Math.round(
            (dtfItems.reduce((sum, item) => sum + item.leadTimeDays, 0) /
              dtfItems.length) *
              10,
          ) / 10
        : 0;

    return [
      {
        label: "Produtos mapeados no DTF",
        value: String(dtfItems.length),
        detail: "Produtos da Nuvemshop que ja tem controle proprio de DTF",
      },
      {
        label: "DTF disponivel",
        value: String(totalAvailable),
        detail: "Saldo informado por voce e salvo no banco interno",
      },
      {
        label: "Produtos em risco",
        value: String(atRisk),
        detail: "Ja perto do ponto de reposicao ou do prazo de producao",
      },
      {
        label: "Lead time medio",
        value: averageLeadTime > 0 ? `${averageLeadTime} dias` : "0 dia",
        detail: "Prazo medio configurado para pedir nova rodada",
      },
    ];
  }, [dtfItems]);

  const skuOptions = useMemo(
    () => Array.from(new Set(visibleBaseItems.map((item) => item.sku))),
    [visibleBaseItems],
  );

  const colorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          visibleBaseItems
            .filter((item) => item.sku === selectedSku)
            .map((item) => item.color),
        ),
      ),
    [selectedSku, visibleBaseItems],
  );

  const sizeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          visibleBaseItems
            .filter(
              (item) => item.sku === selectedSku && item.color === selectedColor,
            )
            .map((item) => item.size),
        ),
      ),
    [selectedColor, selectedSku, visibleBaseItems],
  );

  const selectedItem = useMemo(
    () =>
      visibleBaseItems.find(
        (item) =>
          item.sku === selectedSku &&
          item.color === selectedColor &&
          item.size === selectedSize,
      ) ?? null,
    [visibleBaseItems, selectedColor, selectedSize, selectedSku],
  );

  const matchingFormItem = useMemo(
    () =>
      visibleBaseItems.find(
        (item) =>
          item.sku === form.sku &&
          item.color === form.color &&
          item.size === form.size,
      ) ?? null,
    [form.color, form.size, form.sku, visibleBaseItems],
  );

  const addQuantityPreview = Math.max(parsePositiveInteger(form.total), 0);
  const projectedTotal = matchingFormItem
    ? matchingFormItem.plain + addQuantityPreview
    : addQuantityPreview;

  const selectedDtfItem = useMemo(
    () => dtfItems.find((item) => item.id === selectedDtfId) ?? null,
    [dtfItems, selectedDtfId],
  );

  const nuvemshopCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(initialNuvemshopStock.flatMap((product) => product.categories)),
      ).sort(),
    [initialNuvemshopStock],
  );

  const nuvemshopModelOptions = useMemo(
    () =>
      initialNuvemshopStock
        .filter((product) =>
          selectedNuvemshopCategory
            ? product.categories.some(
                (category) =>
                  normalizeFilterValue(category) ===
                  normalizeFilterValue(selectedNuvemshopCategory),
              )
            : true,
        )
        .map((product) => product.model),
    [initialNuvemshopStock, selectedNuvemshopCategory],
  );

  const nuvemshopColorOptions = useMemo(() => {
    return Array.from(
      new Set(
        initialNuvemshopStock
          .filter((product) =>
            selectedNuvemshopCategory
              ? product.categories.some(
                  (category) =>
                    normalizeFilterValue(category) ===
                    normalizeFilterValue(selectedNuvemshopCategory),
                )
              : true,
          )
          .filter((product) =>
            selectedNuvemshopModel
              ? product.model === selectedNuvemshopModel
              : true,
          )
          .flatMap((product) => product.variants.map((variant) => variant.color)),
      ),
    ).sort();
  }, [
    initialNuvemshopStock,
    selectedNuvemshopCategory,
    selectedNuvemshopModel,
  ]);

  const nuvemshopSizeOptions = useMemo(() => {
    return Array.from(
      new Set(
        initialNuvemshopStock
          .filter((product) =>
            selectedNuvemshopCategory
              ? product.categories.some(
                  (category) =>
                    normalizeFilterValue(category) ===
                    normalizeFilterValue(selectedNuvemshopCategory),
                )
              : true,
          )
          .filter((product) =>
            selectedNuvemshopModel
              ? product.model === selectedNuvemshopModel
              : true,
          )
          .flatMap((product) => product.variants)
          .filter((variant) =>
            selectedNuvemshopColor
              ? variant.color === selectedNuvemshopColor
              : true,
          )
          .map((variant) => variant.size),
      ),
    ).sort();
  }, [
    initialNuvemshopStock,
    selectedNuvemshopCategory,
    selectedNuvemshopColor,
    selectedNuvemshopModel,
  ]);

  const filteredNuvemshopStock = useMemo(() => {
    return initialNuvemshopStock
      .filter((product) =>
        selectedNuvemshopCategory
          ? product.categories.some(
              (category) =>
                normalizeFilterValue(category) ===
                normalizeFilterValue(selectedNuvemshopCategory),
            )
          : true,
      )
      .filter((product) =>
        selectedNuvemshopModel ? product.model === selectedNuvemshopModel : true,
      )
      .map((product) => {
        const filteredVariants = product.variants.filter((variant) => {
          if (
            selectedNuvemshopColor &&
            variant.color !== selectedNuvemshopColor
          ) {
            return false;
          }

          if (selectedNuvemshopSize && variant.size !== selectedNuvemshopSize) {
            return false;
          }

          return true;
        });

        if (filteredVariants.length === 0) {
          return null;
        }

        return {
          ...product,
          filteredVariants,
          filteredTotalStock: filteredVariants.reduce(
            (sum, variant) => sum + variant.stock,
            0,
          ),
        };
      })
      .filter(
        (
          product,
        ): product is NuvemshopStockProduct & {
          filteredVariants: NuvemshopStockProduct["variants"];
          filteredTotalStock: number;
        } => Boolean(product),
      );
  }, [
    initialNuvemshopStock,
    selectedNuvemshopCategory,
    selectedNuvemshopColor,
    selectedNuvemshopModel,
    selectedNuvemshopSize,
  ]);

  const visibleNuvemshopStock = useMemo(
    () => filteredNuvemshopStock.slice(0, visibleNuvemshopItems),
    [filteredNuvemshopStock, visibleNuvemshopItems],
  );

  async function handleCreateItem() {
    setIsCreating(true);
    setFeedback("");

    try {
      if (addQuantityPreview <= 0) {
        throw new Error("Informe quantas lisas chegaram nesse lote.");
      }

      if (!form.movementReasonText.trim()) {
        throw new Error("Informe a justificativa dessa entrada no estoque.");
      }

      const response = await fetch("/api/operacoes/estoque", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const result = (await response.json()) as StockApiResponse;

      if (!response.ok || !result.ok || !result.item) {
        throw new Error(
          result.message || "Nao foi possivel salvar a linha de estoque.",
        );
      }

      setItems((current) => {
        const existingItem = current.find((item) => item.id === result.item!.id);

        if (existingItem) {
          return sortStockItems(
            current.map((item) => (item.id === result.item!.id ? result.item! : item)),
          );
        }

        return sortStockItems([...current, result.item!]);
      });
      setDrafts((current) => ({
        ...current,
        [result.item!.id]: result.item!,
      }));
      setSelectedSku(result.item!.sku);
      setSelectedColor(result.item!.color);
      setSelectedSize(result.item!.size);
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setForm({
        sku: defaultBaseCategory,
        color: "Preta",
        size: "M",
        total: "0",
        movementReasonCategory: "entrada_lote",
        movementReasonText: "",
        reorderPoint: "0",
        leadTimeDays: "10",
        notes: "",
      });
      setFeedback(result.message || "Linha de estoque salva.");
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar a linha de estoque.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function saveStockItem(
    id: string,
    itemToSave: StockSavePayload,
    successMessage?: string,
  ) {
    setSavingItemId(id);
    setFeedback("");

    try {
      const response = await fetch(`/api/operacoes/estoque/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(itemToSave),
      });

      const result = (await response.json()) as StockApiResponse;

      if (!response.ok || !result.ok || !result.item) {
        throw new Error(
          result.message || "Nao foi possivel atualizar os saldos.",
        );
      }

      setItems((current) =>
        sortStockItems(
          current.map((item) => (item.id === id ? result.item! : item)),
        ),
      );
      setDrafts((current) => ({
        ...current,
        [id]: result.item!,
      }));
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setFeedback(result.message || successMessage || "Saldos atualizados.");
      return true;
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar os saldos.",
      );
      return false;
    } finally {
      setSavingItemId(null);
    }
  }

  function getStockAdjustment(id: string): StockAdjustmentState {
    return stockAdjustments[id] ?? {
      mode: "add",
      quantity: "1",
      reasonCategory: "entrada_lote",
      reasonText: "",
    };
  }

  async function handleApplyStockAdjustment(id: string) {
    const currentDraft = drafts[id];
    const adjustment = getStockAdjustment(id);
    const quantity = Math.max(parsePositiveInteger(adjustment.quantity), 0);

    if (!currentDraft) {
      return;
    }

    if (quantity <= 0) {
      setFeedback("Informe quantas lisas voce quer adicionar ou retirar.");
      return;
    }

    if (!adjustment.reasonText.trim()) {
      setFeedback("Informe a justificativa dessa movimentacao de estoque.");
      return;
    }

    const delta = adjustment.mode === "add" ? quantity : -quantity;
    if (adjustment.mode === "remove" && quantity > currentDraft.plain) {
      setFeedback("Nao ha lisas suficientes nessa linha para retirar essa quantidade.");
      return;
    }

    const nextTotal = Math.max(currentDraft.total + delta, currentDraft.printedReal);

    if (nextTotal === currentDraft.total) {
      setFeedback(
        adjustment.mode === "add"
          ? "Esse ajuste nao mudou o saldo de lisas."
          : "Nao ha lisas suficientes para retirar nessa linha.",
      );
      return;
    }

    const nextDraft = recalculateDraftStockState({
      ...currentDraft,
      total: nextTotal,
    });
    const ok = await saveStockItem(
      id,
      {
        ...nextDraft,
        movementReasonCategory: adjustment.reasonCategory,
        movementReasonText: adjustment.reasonText,
        movementSourceModule: "estoque",
      },
      adjustment.mode === "add"
        ? "Lisas adicionadas com sucesso."
        : "Lisas retiradas com sucesso.",
    );

    if (ok) {
      setStockAdjustments((current) => ({
        ...current,
        [id]: {
          mode: adjustment.mode,
          quantity: "1",
          reasonCategory: adjustment.mode === "add" ? "entrada_lote" : "saida_manual",
          reasonText: "",
        },
      }));
      router.refresh();
    }
  }

  async function handleCreateDtfItem() {
    setIsCreatingDtf(true);
    setDtfFeedback("");

    try {
      const response = await fetch("/api/operacoes/dtf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dtfForm),
      });

      const result = (await response.json()) as DtfApiResponse;

      if (!response.ok || !result.ok || !result.item) {
        throw new Error(result.message || "Nao foi possivel salvar o DTF.");
      }

      setDtfItems((current) => {
        const withoutSameProduct = current.filter(
          (item) => item.nuvemshopProductId !== result.item!.nuvemshopProductId,
        );

        return [...withoutSameProduct, result.item!].sort((left, right) =>
          left.productName.localeCompare(right.productName),
        );
      });
      setDtfDrafts((current) => ({
        ...current,
        [result.item!.id]: result.item!,
      }));
      setSelectedDtfId(result.item!.id);
      if (result.persistence) {
        setDtfPersistence(result.persistence);
      }
      setDtfFeedback(result.message || "DTF salvo com sucesso.");
    } catch (error) {
      setDtfFeedback(
        error instanceof Error ? error.message : "Nao foi possivel salvar o DTF.",
      );
    } finally {
      setIsCreatingDtf(false);
    }
  }

  async function handleSaveDtfItem(id: string) {
    const currentDraft = dtfDrafts[id];
    if (!currentDraft) {
      return;
    }

    setSavingDtfId(id);
    setDtfFeedback("");

    try {
      const response = await fetch(`/api/operacoes/dtf/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentDraft),
      });

      const result = (await response.json()) as DtfApiResponse;

      if (!response.ok || !result.ok || !result.item) {
        throw new Error(result.message || "Nao foi possivel atualizar o DTF.");
      }

      setDtfItems((current) =>
        current
          .map((item) => (item.id === id ? result.item! : item))
          .sort((left, right) => left.productName.localeCompare(right.productName)),
      );
      setDtfDrafts((current) => ({
        ...current,
        [id]: result.item!,
      }));
      if (result.persistence) {
        setDtfPersistence(result.persistence);
      }
      setDtfFeedback(result.message || "DTF atualizado.");
    } catch (error) {
      setDtfFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar o DTF.",
      );
    } finally {
      setSavingDtfId(null);
    }
  }

  function handleSelectSku(value: string) {
    setSelectedSku(value);
    const nextColorOptions = Array.from(
      new Set(
        visibleBaseItems
          .filter((item) => item.sku === value)
          .map((item) => item.color),
      ),
    );
    const nextColor = nextColorOptions[0] ?? "";
    setSelectedColor(nextColor);

    const nextSizeOptions = Array.from(
      new Set(
        visibleBaseItems
          .filter((item) => item.sku === value && item.color === nextColor)
          .map((item) => item.size),
      ),
    );
    setSelectedSize(nextSizeOptions[0] ?? "");
  }

  function handleSelectColor(value: string) {
    setSelectedColor(value);
    const nextSizeOptions = Array.from(
      new Set(
        visibleBaseItems
          .filter((item) => item.sku === selectedSku && item.color === value)
          .map((item) => item.size),
      ),
    );
    setSelectedSize(nextSizeOptions[0] ?? "");
  }

  function handleSelectNuvemshopCategory(value: string) {
    setSelectedNuvemshopCategory(value);
    setSelectedNuvemshopModel("");
    setSelectedNuvemshopColor("");
    setSelectedNuvemshopSize("");
    setVisibleNuvemshopItems(2);
  }

  function handleSelectNuvemshopModel(value: string) {
    setSelectedNuvemshopModel(value);
    setSelectedNuvemshopColor("");
    setSelectedNuvemshopSize("");
    setVisibleNuvemshopItems(2);
  }

  function handleSelectNuvemshopColor(value: string) {
    setSelectedNuvemshopColor(value);
    setSelectedNuvemshopSize("");
    setVisibleNuvemshopItems(2);
  }

  function handleSelectDtfProduct(productId: string) {
    const selectedProduct = dtfCatalog.find(
      (product) => product.productId === productId,
    );

    setDtfForm((current) => ({
      ...current,
      nuvemshopProductId: productId,
      productName: selectedProduct?.productName ?? "",
    }));
  }

  function updateDtfDraft(
    id: string,
    field: keyof DtfStockItem,
    value: string | number,
  ) {
    setDtfDrafts((current) => {
      const currentItem = current[id];
      if (!currentItem) {
        return current;
      }

      return {
        ...current,
        [id]: {
          ...currentItem,
          [field]:
            typeof value === "number"
              ? Math.max(value, 0)
              : value,
        },
      };
    });
  }

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Central do estoque base</div>
            <p className={styles.sectionSubtitle}>
              Agora essa tela olha so para o que voce tem liso em casa. O
              alocado no site continua aparecendo apenas como referencia para
              voce comparar e remanejar melhor.
            </p>
          </div>
        </div>

        <div className={persistence.enabled ? styles.callout : styles.warningPanel}>
          <h3>
            {persistence.enabled
              ? "Supabase conectado"
              : "Persistencia em modo de exemplo"}
          </h3>
          <p>
            {feedback || persistence.message}
            {persistence.updatedAt
              ? ` Ultima atualizacao: ${formatDateTime(persistence.updatedAt)}.`
              : ""}
          </p>
        </div>

        <div className={styles.metricGrid} style={{ marginTop: 16 }}>
          {metrics.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              <div className={styles.metricHint}>{metric.detail}</div>
            </article>
          ))}
        </div>

        <div className={styles.stockSplitGrid} style={{ marginTop: 16 }}>
          <article className={styles.stockPanel}>
            <div className={styles.listTitle}>Adicionar ao estoque</div>
            <p className={styles.sectionSubtitle}>
              Use esse bloco quando chegar mais camiseta lisa. Se a linha ja
              existir, o sistema soma no saldo liso que voce controla aqui.
            </p>
            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Produto base</span>
                <select
                  value={form.sku}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sku: event.target.value,
                    }))
                  }
                >
                  {baseCategoryOptions.length === 0 ? (
                    <option value="">Sem categorias da Nuvemshop</option>
                  ) : (
                    baseCategoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Cor</span>
                <select
                  value={form.color}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      color: event.target.value,
                    }))
                  }
                >
                  <option>Preta</option>
                  <option>Branca</option>
                  <option>Roxa</option>
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Tamanho</span>
                <select
                  value={form.size}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      size: event.target.value,
                    }))
                  }
                >
                  <option>P</option>
                  <option>M</option>
                  <option>G</option>
                  <option>GG</option>
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Qtd do lote</span>
                <input
                  type="number"
                  value={form.total}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      total: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Motivo da entrada</span>
                <select
                  value={form.movementReasonCategory}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      movementReasonCategory: event.target.value,
                    }))
                  }
                >
                  <option value="entrada_lote">Chegada de lote</option>
                  <option value="devolucao">Devolucao ao estoque</option>
                  <option value="correcao_ajuste">Correcao de contagem</option>
                  <option value="entrada_manual">Entrada manual</option>
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Justificativa da entrada</span>
                <input
                  value={form.movementReasonText}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      movementReasonText: event.target.value,
                    }))
                  }
                  placeholder="Ex.: lote recebido do fornecedor hoje"
                />
              </label>
              <label className={styles.filterField}>
                <span>Ponto de reposicao</span>
                <input
                  type="number"
                  value={form.reorderPoint}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reorderPoint: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Prazo de reposicao</span>
                <input
                  type="number"
                  value={form.leadTimeDays}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      leadTimeDays: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Observacao</span>
                <input
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Ex.: prioridade de recompra"
                />
              </label>
            </div>

            <div className={styles.callout} style={{ marginTop: 16 }}>
              <h3>
                {matchingFormItem
                  ? "Essa linha ja existe no banco"
                  : "Voce vai criar uma linha nova"}
              </h3>
              <p>
                {matchingFormItem
                  ? `Hoje essa combinacao esta com ${matchingFormItem.plain} lisas em casa. Ao adicionar ${addQuantityPreview}, ela passa para ${projectedTotal} lisas.`
                  : `Ao salvar ${addQuantityPreview}, essa combinacao entra como nova linha de lisa em casa.`}
              </p>
            </div>

            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleCreateItem}
                disabled={!persistence.enabled || isCreating}
              >
                {isCreating ? "Salvando..." : "Adicionar saldo"}
              </button>
            </div>
          </article>

          <article className={styles.stockPanel}>
            <div className={styles.listTitle}>Revisar uma linha especifica</div>
            <p className={styles.sectionSubtitle}>
              Se vendeu ou se voce quer corrigir a contagem, escolha a linha e
              use apenas adicionar ou retirar do saldo liso.
            </p>
            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Modelo</span>
                <select
                  value={selectedSku}
                  onChange={(event) => handleSelectSku(event.target.value)}
                >
                  {skuOptions.map((sku) => (
                    <option key={sku} value={sku}>
                      {sku}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Cor</span>
                <select
                  value={selectedColor}
                  onChange={(event) => handleSelectColor(event.target.value)}
                >
                  {colorOptions.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Tamanho</span>
                <select
                  value={selectedSize}
                  onChange={(event) => setSelectedSize(event.target.value)}
                >
                  {sizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedItem
              ? (() => {
                  const draft = drafts[selectedItem.id] ?? selectedItem;

                  return (
                    <>
                      <div className={styles.callout} style={{ marginTop: 16 }}>
                        <h3>{`${selectedItem.sku} · ${selectedItem.color} · ${selectedItem.size}`}</h3>
                        <p>
                          Hoje voce tem {draft.plain} lisas em casa e {draft.published} alocadas no
                          site nessa combinacao. Quando vender, a baixa deve ser feita aqui no
                          saldo liso.
                        </p>
                      </div>
                      <div className={styles.formStack}>
                        <label className={styles.filterField}>
                          <span>Lisas em casa</span>
                          <input type="number" value={draft.plain} disabled />
                        </label>
                        <label className={styles.filterField}>
                          <span>Alocado no site</span>
                          <input type="number" value={draft.published} disabled />
                        </label>
                        <label className={styles.filterField}>
                          <span>Diferenca</span>
                          <input type="number" value={draft.plain - draft.published} disabled />
                        </label>
                        <div className={styles.filterField}>
                          <span>Ajustar lisas</span>
                          <div className={styles.filterActions}>
                            <button
                              type="button"
                              className={
                                getStockAdjustment(selectedItem.id).mode === "add"
                                  ? styles.primaryButton
                                  : styles.secondaryButton
                              }
                              onClick={() =>
                                setStockAdjustments((current) => ({
                                  ...current,
                                  [selectedItem.id]: {
                                    ...getStockAdjustment(selectedItem.id),
                                    mode: "add",
                                    reasonCategory: "entrada_lote",
                                  },
                                }))
                              }
                            >
                              Adicionar
                            </button>
                            <button
                              type="button"
                              className={
                                getStockAdjustment(selectedItem.id).mode === "remove"
                                  ? styles.primaryButton
                                  : styles.secondaryButton
                              }
                              onClick={() =>
                                setStockAdjustments((current) => ({
                                  ...current,
                                  [selectedItem.id]: {
                                    ...getStockAdjustment(selectedItem.id),
                                    mode: "remove",
                                    reasonCategory: "saida_manual",
                                  },
                                }))
                              }
                            >
                              Retirar
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={getStockAdjustment(selectedItem.id).quantity}
                              onChange={(event) =>
                                setStockAdjustments((current) => ({
                                  ...current,
                                  [selectedItem.id]: {
                                    ...getStockAdjustment(selectedItem.id),
                                    quantity: event.target.value,
                                  },
                                }))
                              }
                              style={{ maxWidth: 100 }}
                            />
                            <select
                              value={getStockAdjustment(selectedItem.id).reasonCategory}
                              onChange={(event) =>
                                setStockAdjustments((current) => ({
                                  ...current,
                                  [selectedItem.id]: {
                                    ...getStockAdjustment(selectedItem.id),
                                    reasonCategory: event.target.value,
                                  },
                                }))
                              }
                            >
                              {getStockAdjustment(selectedItem.id).mode === "add" ? (
                                <>
                                  <option value="entrada_lote">Chegada de lote</option>
                                  <option value="devolucao">Devolucao ao estoque</option>
                                  <option value="correcao_ajuste">Correcao de contagem</option>
                                  <option value="entrada_manual">Entrada manual</option>
                                </>
                              ) : (
                                <>
                                  <option value="venda_site">Venda no site</option>
                                  <option value="resgate_influenciador">Resgate de influenciador</option>
                                  <option value="uso_interno">Uso interno</option>
                                  <option value="perda_avaria">Perda ou avaria</option>
                                  <option value="correcao_ajuste">Correcao de contagem</option>
                                  <option value="saida_manual">Saida manual</option>
                                </>
                              )}
                            </select>
                            <input
                              value={getStockAdjustment(selectedItem.id).reasonText}
                              onChange={(event) =>
                                setStockAdjustments((current) => ({
                                  ...current,
                                  [selectedItem.id]: {
                                    ...getStockAdjustment(selectedItem.id),
                                    reasonText: event.target.value,
                                  },
                                }))
                              }
                              placeholder="Justifique essa movimentacao"
                              style={{ minWidth: 220 }}
                            />
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => handleApplyStockAdjustment(selectedItem.id)}
                              disabled={
                                !persistence.enabled || savingItemId === selectedItem.id
                              }
                            >
                              {savingItemId === selectedItem.id ? "Salvando..." : "OK"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()
              : (
              <div className={styles.callout}>
                <h3>Nenhuma combinacao encontrada</h3>
                <p>
                  Ajuste o modelo, a cor e o tamanho para abrir a linha certa do
                  estoque.
                </p>
              </div>
            )}
          </article>
        </div>

        <div className={styles.stockSplitGrid} style={{ marginTop: 16 }}>
          <article className={styles.stockPanel}>
            <div className={styles.listTitle}>Como usar agora</div>
            <div className={styles.stockList}>
              <div className={styles.stockRow}>
                <span>Lisas em casa</span>
                <strong>Esse e o numero principal que voce controla aqui</strong>
              </div>
              <div className={styles.stockRow}>
                <span>Quando vender</span>
                <strong>Retire da lisa correspondente nessa tela</strong>
              </div>
              <div className={styles.stockRow}>
                <span>Publicado na loja</span>
                <strong>Serve so como referencia para comparar com o que voce tem em casa</strong>
              </div>
            </div>
          </article>

          <article className={styles.stockPanel}>
            <div className={styles.listTitle}>Fluxo recomendado</div>
            <div className={styles.stockList}>
              <div className={styles.stockRow}>
                <span>Chegou lote novo</span>
                <strong>Use "Adicionar ao estoque"</strong>
              </div>
              <div className={styles.stockRow}>
                <span>Vendeu uma arte</span>
                <strong>Baixe direto da lisa daquela cor e tamanho</strong>
              </div>
              <div className={styles.stockRow}>
                <span>Quer corrigir uma linha</span>
                <strong>Use "Revisar uma linha especifica"</strong>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Saldo das lisas</div>
            <p className={styles.sectionSubtitle}>
              Aqui fica a visao simples por produto base, cor e tamanho, com o
              saldo liso em casa e o que esta alocado no site.
            </p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Produto base</th>
                <th>Cor</th>
                <th>Tamanho</th>
                <th>Lisas em casa</th>
                <th>Alocado no site</th>
                <th>Diferenca</th>
                <th>Observacao</th>
              </tr>
            </thead>
            <tbody>
              {visibleBaseItems.map((row) => (
                <tr key={row.id}>
                  <td>{row.sku}</td>
                  <td>{row.color}</td>
                  <td>{row.size}</td>
                  <td>{row.plain}</td>
                  <td>{row.published}</td>
                  <td>{row.plain - row.published}</td>
                  <td>{row.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Lastro do estoque</div>
            <p className={styles.sectionSubtitle}>
              Tudo que entra ou sai da lisa fica registrado com motivo e justificativa.
            </p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Base</th>
                <th>Movimento</th>
                <th>Qtd</th>
                <th>Antes</th>
                <th>Depois</th>
                <th>Motivo</th>
                <th>Justificativa</th>
              </tr>
            </thead>
            <tbody>
              {movements.length > 0 ? (
                movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatDateTime(movement.createdAt || "")}</td>
                    <td>{`${movement.sku} · ${movement.color} · ${movement.size}`}</td>
                    <td>{labelForMovementType(movement.movementType)}</td>
                    <td>{movement.quantity}</td>
                    <td>{movement.plainBefore}</td>
                    <td>{movement.plainAfter}</td>
                    <td>{labelForMovementReason(movement.reasonCategory)}</td>
                    <td>{movement.reasonText || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>Ainda nao existem movimentacoes registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Estoque atual na Nuvemshop</div>
            <p className={styles.sectionSubtitle}>
              Aqui fica a distribuicao comercial publicada na loja. Isso nao
              significa automaticamente que tudo ja esta estampado de verdade.
            </p>
          </div>
        </div>

        <div
          className={
            initialNuvemshopStockState.enabled
              ? styles.callout
              : styles.warningPanel
          }
        >
          <h3>
            {initialNuvemshopStockState.enabled
              ? "Estoque da Nuvemshop conectado"
              : "Leitura da Nuvemshop indisponivel"}
          </h3>
          <p>
            {initialNuvemshopStockState.message}
            {initialNuvemshopStockState.updatedAt
              ? ` Ultima atualizacao: ${formatDateTime(initialNuvemshopStockState.updatedAt)}.`
              : ""}
          </p>
        </div>

        <div className={styles.configGrid}>
          <article className={styles.configCard}>
            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Categoria</span>
                <select
                  value={selectedNuvemshopCategory}
                  onChange={(event) =>
                    handleSelectNuvemshopCategory(event.target.value)
                  }
                >
                  <option value="">Todas</option>
                  {nuvemshopCategoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Modelo</span>
                <select
                  value={selectedNuvemshopModel}
                  onChange={(event) =>
                    handleSelectNuvemshopModel(event.target.value)
                  }
                >
                  <option value="">Todos</option>
                  {nuvemshopModelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Cor</span>
                <select
                  value={selectedNuvemshopColor}
                  onChange={(event) =>
                    handleSelectNuvemshopColor(event.target.value)
                  }
                >
                  <option value="">Todas</option>
                  {nuvemshopColorOptions.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Tamanho</span>
                <select
                  value={selectedNuvemshopSize}
                  onChange={(event) => {
                    setSelectedNuvemshopSize(event.target.value);
                    setVisibleNuvemshopItems(2);
                  }}
                >
                  <option value="">Todos</option>
                  {nuvemshopSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setSelectedNuvemshopCategory("");
                  setSelectedNuvemshopModel("");
                  setSelectedNuvemshopColor("");
                  setSelectedNuvemshopSize("");
                  setVisibleNuvemshopItems(2);
                }}
              >
                Limpar filtros
              </button>
            </div>
          </article>
        </div>

        {filteredNuvemshopStock.length > 0 ? (
          <div className={styles.catalogStack}>
            {visibleNuvemshopStock.map((product) => (
              <article key={product.productId} className={styles.catalogDetailCard}>
                <div className={styles.catalogDetailHeader}>
                  <div className={styles.catalogMedia}>
                    {product.imageUrl ? (
                      <div
                        className={styles.catalogImage}
                        style={{
                          backgroundImage: `url(${product.imageUrl})`,
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                          backgroundSize: "cover",
                        }}
                        role="img"
                        aria-label={product.model}
                      />
                    ) : (
                      <div className={styles.catalogImagePlaceholder}>Sem foto</div>
                    )}
                    <div>
                      <div className={styles.metricLabel}>Modelo #{product.productId}</div>
                      <div className={styles.integrationTitle}>{product.model}</div>
                      <p className={styles.integrationDescription}>
                        Estoque filtrado na Nuvemshop: {product.filteredTotalStock}
                      </p>
                    </div>
                  </div>
                  <div className={styles.chipRow}>
                    {product.categories.map((category) => (
                      <span key={category} className={styles.chip}>
                        {category}
                      </span>
                    ))}
                    <span className={styles.chip}>
                      Variacoes: {product.filteredVariants.length}
                    </span>
                    <span className={styles.chip}>
                      Estoque total: {product.filteredTotalStock}
                    </span>
                  </div>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Cor</th>
                        <th>Tamanho</th>
                        <th>Estoque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.filteredVariants.map((variant) => (
                        <tr key={variant.id}>
                          <td>{variant.sku}</td>
                          <td>{variant.color}</td>
                          <td>{variant.size}</td>
                          <td>{variant.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
            {filteredNuvemshopStock.length > visibleNuvemshopItems ? (
              <div className={styles.filterActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() =>
                    setVisibleNuvemshopItems((current) => current + 5)
                  }
                >
                  Ver mais
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.emptyState}>
            Nenhum modelo da Nuvemshop encontrado com esse filtro.
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Estoque de DTF</div>
            <p className={styles.sectionSubtitle}>
              Esse bloco fica no fim da tela e usa os produtos reais da
              Nuvemshop. Voce informa o saldo de DTF e o sistema cruza isso com
              as vendas dos ultimos 30 dias.
            </p>
          </div>
        </div>

        <div
          className={
            dtfPersistence.enabled && dtfCatalogState.enabled
              ? styles.callout
              : styles.warningPanel
          }
        >
          <h3>
            {dtfPersistence.enabled
              ? "DTF salvo no banco interno"
              : "Persistencia do DTF em modo de exemplo"}
          </h3>
          <p>
            {dtfFeedback || dtfPersistence.message} {dtfCatalogState.message}
            {dtfPersistence.updatedAt
              ? ` Ultima atualizacao: ${formatDateTime(dtfPersistence.updatedAt)}.`
              : ""}
          </p>
        </div>

        <div className={styles.metricGrid}>
          {dtfMetrics.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              <div className={styles.metricHint}>{metric.detail}</div>
            </article>
          ))}
        </div>

        <div className={styles.configGrid}>
          <article className={styles.configCard}>
            <div className={styles.sectionTitle}>Novo DTF</div>
            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Produto da Nuvemshop</span>
                <select
                  value={dtfForm.nuvemshopProductId}
                  onChange={(event) => handleSelectDtfProduct(event.target.value)}
                >
                  {dtfCatalog.length === 0 ? (
                    <option value="">Sem produtos carregados</option>
                  ) : (
                    dtfCatalog.map((product) => (
                      <option key={product.productId} value={product.productId}>
                        {product.productName}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Tipo da arte</span>
                <select
                  value={dtfForm.artType}
                  onChange={(event) =>
                    setDtfForm((current) => ({
                      ...current,
                      artType: event.target.value as DtfArtType,
                    }))
                  }
                >
                  <option value="minimalista">Minimalista</option>
                  <option value="full">Full</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
              <label className={styles.filterField}>
                <span>DTF disponivel</span>
                <input
                  type="number"
                  value={dtfForm.availableQty}
                  onChange={(event) =>
                    setDtfForm((current) => ({
                      ...current,
                      availableQty: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Ponto de reposicao</span>
                <input
                  type="number"
                  value={dtfForm.reorderPoint}
                  onChange={(event) =>
                    setDtfForm((current) => ({
                      ...current,
                      reorderPoint: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Lead time em dias</span>
                <input
                  type="number"
                  value={dtfForm.leadTimeDays}
                  onChange={(event) =>
                    setDtfForm((current) => ({
                      ...current,
                      leadTimeDays: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Observacao</span>
                <input
                  value={dtfForm.notes}
                  onChange={(event) =>
                    setDtfForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Ex.: frente e costas"
                />
              </label>
            </div>
            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleCreateDtfItem}
                disabled={
                  !dtfPersistence.enabled ||
                  !dtfCatalogState.enabled ||
                  isCreatingDtf ||
                  !dtfForm.nuvemshopProductId
                }
              >
                {isCreatingDtf ? "Salvando..." : "Salvar DTF"}
              </button>
            </div>
          </article>

          <article className={styles.configCard}>
            <div className={styles.callout}>
              <h3>Como o alerta funciona</h3>
              <p>
                Se o saldo informado cair abaixo do ponto de reposicao ou se a
                cobertura estimada ficar menor que o lead time, a linha entra em
                risco para voce pedir mais.
              </p>
            </div>
          </article>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Tipo</th>
                <th>DTF disponivel</th>
                <th>Vendas 30d</th>
                <th>Cobertura</th>
                <th>Ponto</th>
                <th>Lead time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dtfItems.length === 0 ? (
                <tr>
                  <td colSpan={8}>Nenhum DTF cadastrado ainda.</td>
                </tr>
              ) : (
                dtfItems.map((row) => {
                  const atRisk =
                    row.availableQty <= row.reorderPoint ||
                    (row.estimatedCoverageDays !== null &&
                      row.estimatedCoverageDays <= row.leadTimeDays);

                  return (
                    <tr key={row.id}>
                      <td>{row.productName}</td>
                      <td>{labelForDtfType(row.artType)}</td>
                      <td>{row.availableQty}</td>
                      <td>{row.recentSales30d}</td>
                      <td>
                        {row.estimatedCoverageDays === null
                          ? "Sem saida recente"
                          : `${row.estimatedCoverageDays} dias`}
                      </td>
                      <td>{row.reorderPoint}</td>
                      <td>{row.leadTimeDays} dias</td>
                      <td>{atRisk ? "Pedir mais" : "Saudavel"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.configGrid}>
          <article className={styles.configCard}>
            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Produto do DTF</span>
                <select
                  value={selectedDtfId}
                  onChange={(event) => setSelectedDtfId(event.target.value)}
                >
                  {dtfItems.length === 0 ? (
                    <option value="">Nenhum DTF salvo</option>
                  ) : (
                    dtfItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.productName}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
          </article>

          {selectedDtfItem ? (
            <article className={styles.configCard}>
              {(() => {
                const draft = dtfDrafts[selectedDtfItem.id] ?? selectedDtfItem;

                return (
                  <>
                    <div className={styles.listTitle}>{draft.productName}</div>
                    <div className={styles.formStack}>
                      <label className={styles.filterField}>
                        <span>Tipo</span>
                        <select
                          value={draft.artType}
                          onChange={(event) =>
                            updateDtfDraft(
                              draft.id,
                              "artType",
                              event.target.value as DtfArtType,
                            )
                          }
                        >
                          <option value="minimalista">Minimalista</option>
                          <option value="full">Full</option>
                          <option value="outro">Outro</option>
                        </select>
                      </label>
                      <label className={styles.filterField}>
                        <span>DTF disponivel</span>
                        <input
                          type="number"
                          value={draft.availableQty}
                          onChange={(event) =>
                            updateDtfDraft(
                              draft.id,
                              "availableQty",
                              Number.parseInt(event.target.value || "0", 10),
                            )
                          }
                        />
                      </label>
                      <label className={styles.filterField}>
                        <span>Ponto de reposicao</span>
                        <input
                          type="number"
                          value={draft.reorderPoint}
                          onChange={(event) =>
                            updateDtfDraft(
                              draft.id,
                              "reorderPoint",
                              Number.parseInt(event.target.value || "0", 10),
                            )
                          }
                        />
                      </label>
                      <label className={styles.filterField}>
                        <span>Lead time</span>
                        <input
                          type="number"
                          value={draft.leadTimeDays}
                          onChange={(event) =>
                            updateDtfDraft(
                              draft.id,
                              "leadTimeDays",
                              Number.parseInt(event.target.value || "0", 10),
                            )
                          }
                        />
                      </label>
                      <label className={styles.filterField}>
                        <span>Observacao</span>
                        <input
                          value={draft.notes}
                          onChange={(event) =>
                            updateDtfDraft(draft.id, "notes", event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.filterActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleSaveDtfItem(draft.id)}
                        disabled={
                          !dtfPersistence.enabled || savingDtfId === draft.id
                        }
                      >
                        {savingDtfId === draft.id ? "Salvando..." : "Salvar DTF"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </article>
          ) : (
            <article className={styles.configCard}>
              <div className={styles.callout}>
                <h3>Nenhum DTF selecionado</h3>
                <p>Salve um produto de DTF para editar os saldos aqui.</p>
              </div>
            </article>
          )}
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

function labelForDtfType(value: DtfArtType) {
  switch (value) {
    case "minimalista":
      return "Minimalista";
    case "full":
      return "Full";
    default:
      return "Outro";
  }
}

function labelForMovementType(value: StockMovement["movementType"]) {
  switch (value) {
    case "entrada":
      return "Entrada";
    case "saida":
      return "Saida";
    default:
      return "Ajuste";
  }
}

function labelForMovementReason(value: string) {
  switch (value) {
    case "entrada_lote":
      return "Chegada de lote";
    case "devolucao":
      return "Devolucao";
    case "correcao_ajuste":
      return "Correcao";
    case "entrada_manual":
      return "Entrada manual";
    case "venda_site":
      return "Venda no site";
    case "resgate_influenciador":
      return "Resgate de influenciador";
    case "uso_interno":
      return "Uso interno";
    case "perda_avaria":
      return "Perda ou avaria";
    case "saida_manual":
      return "Saida manual";
    default:
      return value || "-";
  }
}

function normalizeFilterValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getStockBaseCategoryOptions(products: NuvemshopStockProduct[]) {
  const categories = Array.from(
    new Set(products.flatMap((product) => product.categories)),
  ).sort();
  const blockedCategories = new Set(["full estampa", "minimalista", "outlet"]);
  const filtered = categories.filter(
    (category) => !blockedCategories.has(normalizeFilterValue(category)),
  );

  return filtered.length > 0 ? filtered : categories;
}

function getDefaultStockCategory(products: NuvemshopStockProduct[]) {
  const categories = getStockBaseCategoryOptions(products);

  return (
    categories.find((category) => normalizeFilterValue(category) === "oversized") ??
    categories[0] ??
    ""
  );
}

function parsePositiveInteger(value: string) {
  return Number.parseInt(value || "0", 10) || 0;
}

function sumPlainStockByColor(
  items: BaseStockItem[],
  color: (typeof TRACKED_BASE_COLORS)[number],
) {
  return items
    .filter((item) => item.color === color)
    .reduce((sum, item) => sum + item.plain, 0);
}

function recalculateDraftStockState(item: BaseStockItem): BaseStockItem {
  const total = Math.max(item.total, 0);
  const printedReal = Math.min(Math.max(item.printedReal, 0), total);
  const published = Math.max(item.published, 0);
  const recentSales30d = Math.max(item.recentSales30d, 0);
  const averageDailySales =
    recentSales30d > 0 ? Math.round((recentSales30d / 30) * 10) / 10 : 0;
  const plain = Math.max(total - printedReal, 0);

  return {
    ...item,
    total,
    plain,
    printedReal,
    printed: published,
    published,
    free: Math.max(total - published, 0),
    overcommitted: Math.max(published - total, 0),
    leadTimeDays: Math.max(item.leadTimeDays, 0),
    recentSales30d,
    averageDailySales,
    coverageDays:
      averageDailySales > 0
        ? Math.round((plain / averageDailySales) * 10) / 10
        : null,
  };
}

function sortStockItems(items: BaseStockItem[]) {
  return [...items].sort((left, right) => {
    const leftKey = `${left.sku}-${left.color}-${left.size}`;
    const rightKey = `${right.sku}-${right.color}-${right.size}`;
    return leftKey.localeCompare(rightKey);
  });
}
