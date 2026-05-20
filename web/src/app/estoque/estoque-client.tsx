"use client";

import { useMemo, useState } from "react";

import styles from "@/components/panel.module.css";
import {
  type BaseStockItem,
  type DtfArtType,
  type DtfCatalogProduct,
  type DtfStockItem,
  type NuvemshopStockProduct,
  type OperationalPersistenceState,
} from "@/lib/operacoes/repository";
import { operationAlerts } from "@/lib/operations-data";

type EstoqueClientProps = {
  initialItems: BaseStockItem[];
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

type DtfApiResponse = {
  ok: boolean;
  message?: string;
  persistence?: OperationalPersistenceState;
  item?: DtfStockItem;
};

export function EstoqueClient({
  initialItems,
  initialPersistence,
  initialDtfItems,
  initialDtfPersistence,
  dtfCatalog,
  dtfCatalogState,
  initialNuvemshopStock,
  initialNuvemshopStockState,
}: EstoqueClientProps) {
  const defaultBaseCategory = getDefaultStockCategory(initialNuvemshopStock);
  const [items, setItems] = useState(initialItems);
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
    reorderPoint: "0",
    notes: "",
  });
  const [drafts, setDrafts] = useState<Record<string, BaseStockItem>>(() =>
    initialItems.reduce<Record<string, BaseStockItem>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {}),
  );
  const [selectedSku, setSelectedSku] = useState(initialItems[0]?.sku ?? "");
  const [selectedColor, setSelectedColor] = useState(initialItems[0]?.color ?? "");
  const [selectedSize, setSelectedSize] = useState(initialItems[0]?.size ?? "");

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

  const metrics = useMemo(() => {
    const total = items.reduce((sum, item) => sum + item.total, 0);
    const printed = items.reduce((sum, item) => sum + item.printed, 0);
    const free = items.reduce((sum, item) => sum + item.free, 0);

    return [
      {
        label: "Total de camisetas base",
        value: String(total),
        detail: "Saldo geral somando cores e tamanhos",
      },
      {
        label: "Ja estampadas",
        value: String(printed),
        detail: "Pecas prontas que ja sairam do saldo livre",
      },
      {
        label: "Livres para usar",
        value: String(free),
        detail: "Base real para nova venda ou nova estampa",
      },
    ];
  }, [items]);

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
    () => Array.from(new Set(items.map((item) => item.sku))),
    [items],
  );

  const colorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter((item) => item.sku === selectedSku)
            .map((item) => item.color),
        ),
      ),
    [items, selectedSku],
  );

  const sizeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter(
              (item) => item.sku === selectedSku && item.color === selectedColor,
            )
            .map((item) => item.size),
        ),
      ),
    [items, selectedColor, selectedSku],
  );

  const selectedItem = useMemo(
    () =>
      items.find(
        (item) =>
          item.sku === selectedSku &&
          item.color === selectedColor &&
          item.size === selectedSize,
      ) ?? null,
    [items, selectedColor, selectedSize, selectedSku],
  );

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
          result.message || "Nao foi possivel adicionar a linha de estoque.",
        );
      }

      setItems((current) => [...current, result.item!]);
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
        reorderPoint: "0",
        notes: "",
      });
      setFeedback(result.message || "Linha de estoque adicionada.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel adicionar a linha de estoque.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSaveItem(id: string) {
    const currentDraft = drafts[id];
    if (!currentDraft) {
      return;
    }

    setSavingItemId(id);
    setFeedback("");

    try {
      const response = await fetch(`/api/operacoes/estoque/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentDraft),
      });

      const result = (await response.json()) as StockApiResponse;

      if (!response.ok || !result.ok || !result.item) {
        throw new Error(
          result.message || "Nao foi possivel atualizar os saldos.",
        );
      }

      setItems((current) =>
        current.map((item) => (item.id === id ? result.item! : item)),
      );
      setDrafts((current) => ({
        ...current,
        [id]: result.item!,
      }));
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setFeedback(result.message || "Saldos atualizados.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar os saldos.",
      );
    } finally {
      setSavingItemId(null);
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
        items.filter((item) => item.sku === value).map((item) => item.color),
      ),
    );
    const nextColor = nextColorOptions[0] ?? "";
    setSelectedColor(nextColor);

    const nextSizeOptions = Array.from(
      new Set(
        items
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
        items
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

  function updateDraft(
    id: string,
    field: keyof BaseStockItem,
    value: string | number,
  ) {
    setDrafts((current) => {
      const currentItem = current[id];
      if (!currentItem) {
        return current;
      }

      const nextItem = {
        ...currentItem,
        [field]:
          typeof value === "number"
            ? Math.max(value, 0)
            : value,
      } as BaseStockItem;

      const total = Math.max(nextItem.total, 0);
      const printed = Math.min(Math.max(nextItem.printed, 0), total);

      nextItem.total = total;
      nextItem.printed = printed;
      nextItem.free = Math.max(total - printed, 0);

      return {
        ...current,
        [id]: nextItem,
      };
    });
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
            <div className={styles.sectionTitle}>Banco interno do estoque</div>
            <p className={styles.sectionSubtitle}>
              O estoque base e interno da marca, entao ele fica salvo no nosso
              banco e pode ser alterado direto pelo sistema.
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
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Leitura do estoque atual</div>
            <p className={styles.sectionSubtitle}>
              Agora o resumo bate com a sua rotina: total em maos, estampadas
              na Nuvemshop e livres para novas vendas.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {metrics.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              <div className={styles.metricHint}>{metric.detail}</div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Estoque atual na Nuvemshop</div>
            <p className={styles.sectionSubtitle}>
              Foto do modelo e saldo estampado da loja por cor e tamanho, com
              filtros para voce bater o olho rapido no que esta publicado.
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
            <div className={styles.sectionTitle}>Nova linha de estoque</div>
            <p className={styles.sectionSubtitle}>
              Cadastre por cor e tamanho o que chegou da fabrica ou o que voce
              quer acompanhar separado. O campo estampadas vem da Nuvemshop.
            </p>
          </div>
        </div>

        <div className={styles.configGrid}>
          <article className={styles.configCard}>
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
                  {nuvemshopCategoryOptions.length === 0 ? (
                    <option value="">Sem categorias da Nuvemshop</option>
                  ) : (
                    nuvemshopCategoryOptions.map((category) => (
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
                  <option>Avela</option>
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
                <span>Total</span>
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

            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleCreateItem}
                disabled={!persistence.enabled || isCreating}
              >
                {isCreating ? "Salvando..." : "Adicionar linha"}
              </button>
            </div>
          </article>

          <article className={styles.configCard}>
            <div className={styles.callout}>
              <h3>Regra pratica de leitura</h3>
              <p>
                O que manda a recompra nao e so o total em maos. O sistema olha
                o total interno e desconta automaticamente o estoque estampado
                que esta hoje na Nuvemshop.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Cobertura por cor e tamanho</div>
            <p className={styles.sectionSubtitle}>
              Essa grade mostra a foto atual do banco. Abaixo dela voce ajusta
              os saldos quando algo muda na operacao.
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
                <th>Total</th>
                <th>Ja estampadas</th>
                <th>Livres</th>
                <th>Ponto de reposicao</th>
                <th>Observacao</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{row.sku}</td>
                  <td>{row.color}</td>
                  <td>{row.size}</td>
                  <td>{row.total}</td>
                  <td>{row.printed}</td>
                  <td>{row.free}</td>
                  <td>{row.reorderPoint}</td>
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
            <div className={styles.sectionTitle}>Atualizar saldos</div>
            <p className={styles.sectionSubtitle}>
              Escolha modelo, cor e tamanho. So depois disso os campos de
              edicao aparecem. Estampadas vem da Nuvemshop e nao sao alteradas
              aqui.
            </p>
          </div>
        </div>

        <div className={styles.configGrid}>
          <article className={styles.configCard}>
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
          </article>

          {selectedItem ? (
            <article className={styles.configCard}>
              {(() => {
                const draft = drafts[selectedItem.id] ?? selectedItem;

                return (
                  <>
                    <div className={styles.listTitle}>{`${selectedItem.sku} · ${selectedItem.color} · ${selectedItem.size}`}</div>
                    <div className={styles.formStack}>
                      <label className={styles.filterField}>
                        <span>Total</span>
                        <input
                          type="number"
                          value={draft.total}
                          onChange={(event) =>
                            updateDraft(
                              selectedItem.id,
                              "total",
                              Number.parseInt(event.target.value || "0", 10),
                            )
                          }
                        />
                      </label>
                      <label className={styles.filterField}>
                        <span>Ja estampadas</span>
                        <input type="number" value={draft.printed} disabled />
                      </label>
                      <label className={styles.filterField}>
                        <span>Livres</span>
                        <input type="number" value={draft.free} disabled />
                      </label>
                      <label className={styles.filterField}>
                        <span>Ponto de reposicao</span>
                        <input
                          type="number"
                          value={draft.reorderPoint}
                          onChange={(event) =>
                            updateDraft(
                              selectedItem.id,
                              "reorderPoint",
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
                            updateDraft(selectedItem.id, "notes", event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.filterActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleSaveItem(selectedItem.id)}
                        disabled={
                          !persistence.enabled || savingItemId === selectedItem.id
                        }
                      >
                        {savingItemId === selectedItem.id
                          ? "Salvando..."
                          : "Salvar saldos"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </article>
          ) : (
            <article className={styles.configCard}>
              <div className={styles.callout}>
                <h3>Nenhuma combinacao encontrada</h3>
                <p>
                  Ajuste o modelo, a cor e o tamanho para abrir a linha certa do
                  estoque.
                </p>
              </div>
            </article>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.list}>
          {operationAlerts.slice(0, 3).map((alert) => {
            const pillClass =
              alert.level === "alto"
                ? styles.pillHigh
                : alert.level === "medio"
                  ? styles.pillMedium
                  : styles.pillLow;

            return (
              <article key={alert.title} className={styles.listItem}>
                <div className={styles.listTitleRow}>
                  <div className={styles.listTitle}>{alert.title}</div>
                  <span className={`${styles.pill} ${pillClass}`}>
                    {alert.level}
                  </span>
                </div>
                <p className={styles.listDetail}>{alert.detail}</p>
              </article>
            );
          })}
        </div>
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

function normalizeFilterValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getDefaultStockCategory(products: NuvemshopStockProduct[]) {
  const categories = Array.from(
    new Set(products.flatMap((product) => product.categories)),
  ).sort();

  return (
    categories.find((category) => normalizeFilterValue(category) === "oversized") ??
    categories[0] ??
    ""
  );
}
