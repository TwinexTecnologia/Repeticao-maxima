"use client";

import { useMemo, useState } from "react";

import styles from "@/components/panel.module.css";
import type {
  CompanyCartDiscountRule,
  CompanyCartDiscountGroup,
  CompanyDiscountCategoryOption,
  CompanyDiscountProductOption,
  CompanyPersistenceState,
} from "@/lib/empresa/repository";

type EmpresaClientProps = {
  initialRules: CompanyCartDiscountRule[];
  initialCategories: CompanyDiscountCategoryOption[];
  initialProducts: CompanyDiscountProductOption[];
  initialPersistence: CompanyPersistenceState;
  initialCatalogState: CompanyPersistenceState;
};

type CartDiscountApiResponse = {
  ok: boolean;
  message?: string;
  persistence?: CompanyPersistenceState;
  rule?: CompanyCartDiscountRule;
};

type RuleMode = "categoria" | "misto";

export function EmpresaClient({
  initialRules,
  initialCategories,
  initialProducts,
  initialPersistence,
  initialCatalogState,
}: EmpresaClientProps) {
  const defaultCategoryId = useMemo(
    () => getDefaultCategoryId(initialCategories),
    [initialCategories],
  );
  const [rules, setRules] = useState(initialRules);
  const [persistence, setPersistence] =
    useState<CompanyPersistenceState>(initialPersistence);
  const [feedback, setFeedback] = useState(initialPersistence.message);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    ruleMode: "categoria" as RuleMode,
    categoryIds: defaultCategoryId ? [defaultCategoryId] : [],
    minimumQuantity: "3",
    discountAmount: "57",
    allowCombiningWithOtherPromotions: false,
    notes: "",
  });
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [groupMinimums, setGroupMinimums] = useState<Record<string, string>>(() =>
    defaultCategoryId ? { [defaultCategoryId]: "1" } : {},
  );

  const selectedCategories = useMemo(
    () =>
      form.categoryIds
        .map((categoryId) =>
          initialCategories.find((category) => category.id === categoryId),
        )
        .filter(
          (category): category is CompanyDiscountCategoryOption => Boolean(category),
        ),
    [form.categoryIds, initialCategories],
  );

  const filteredProducts = useMemo(
    () =>
      initialProducts.filter((product) =>
        form.categoryIds.length > 0
          ? product.categoryIds.some((categoryId) =>
              form.categoryIds.includes(categoryId),
            )
          : true,
      ),
    [form.categoryIds, initialProducts],
  );

  const selectedProducts = useMemo(
    () =>
      filteredProducts.filter((product) =>
        selectedProductIds.includes(product.productId),
      ),
    [filteredProducts, selectedProductIds],
  );

  const comboGroups = useMemo<CompanyCartDiscountGroup[]>(
    () =>
      form.ruleMode !== "misto"
        ? []
        : selectedCategories.map((category) => {
            const groupProducts = selectedProducts.filter((product) =>
              product.categoryIds.includes(category.id),
            );

            return {
              categoryId: category.id,
              categoryName: category.name,
              minimumQuantity: Math.max(
                getIntegerValue(groupMinimums[category.id] ?? "1"),
                1,
              ),
              productIds: Array.from(
                new Set(
                  groupProducts.flatMap((product) =>
                    product.matchIds.length > 0
                      ? product.matchIds
                      : [product.productId],
                  ),
                ),
              ),
              productNames: groupProducts.map((product) => product.productName),
            };
          }),
    [form.ruleMode, groupMinimums, selectedCategories, selectedProducts],
  );

  const computedMinimumQuantity = useMemo(
    () =>
      form.ruleMode === "misto" && selectedCategories.length > 0
        ? selectedCategories.reduce(
            (sum, category) =>
              sum + Math.max(getIntegerValue(groupMinimums[category.id] ?? "1"), 1),
            0,
          )
        : Math.max(getIntegerValue(form.minimumQuantity), 1),
    [form.minimumQuantity, form.ruleMode, groupMinimums, selectedCategories],
  );

  const metrics = useMemo(() => {
    const activeRules = rules.filter((rule) => rule.active).length;
    const mappedProducts = new Set(rules.flatMap((rule) => rule.productIds)).size;
    const highestDiscount = rules.reduce(
      (highest, rule) => Math.max(highest, rule.discountAmount),
      0,
    );

    return [
      {
        label: "Promocoes salvas",
        value: String(rules.length),
        detail: "Regras internas prontas para sincronizar com a Nuvemshop",
      },
      {
        label: "Promocoes ativas",
        value: String(activeRules),
        detail: "Regras que hoje estao liberadas para uso operacional",
      },
      {
        label: "Produtos mapeados",
        value: String(mappedProducts),
        detail: "Produtos ja ligados a pelo menos uma promocao",
      },
      {
        label: "Maior desconto",
        value: formatMoney(highestDiscount),
        detail: "Valor maximo cadastrado para desconto no fim do carrinho",
      },
    ];
  }, [rules]);

  const isEditing = editingRuleId !== null;
  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((product) =>
      selectedProductIds.includes(product.productId),
    );

  async function handleSaveRule() {
    setIsSaving(true);
    setFeedback("");

    try {
      if (
        form.ruleMode === "misto" &&
        selectedCategories.some(
          (category) =>
            !comboGroups.some(
              (group) =>
                group.categoryId === category.id && group.productIds.length > 0,
            ),
        )
      ) {
        throw new Error(
          "Selecione pelo menos um produto de cada categoria do combo composto.",
        );
      }

      const response = await fetch(
        isEditing
          ? `/api/empresa/promocoes/${editingRuleId}`
          : "/api/empresa/promocoes",
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: form.title,
            ruleMode: form.ruleMode,
            categoryId: form.categoryIds[0] || "",
            categoryName: selectedCategories[0]?.name || "",
            categoryIds: form.categoryIds,
            categoryNames: selectedCategories.map((category) => category.name),
            comboGroups,
            productIds: Array.from(
              new Set(
                selectedProducts.flatMap((product) =>
                  product.matchIds.length > 0 ? product.matchIds : [product.productId],
                ),
              ),
            ),
            productNames: selectedProducts.map((product) => product.productName),
            minimumQuantity: String(computedMinimumQuantity),
            discountAmount: form.discountAmount,
            allowCombiningWithOtherPromotions:
              form.allowCombiningWithOtherPromotions,
            notes: form.notes,
          }),
        },
      );

      const result = (await response.json()) as CartDiscountApiResponse;

      if (!response.ok || !result.ok || !result.rule) {
        throw new Error(result.message || "Nao foi possivel salvar a promocao.");
      }

      setRules((current) =>
        isEditing
          ? current.map((item) =>
              item.id === result.rule!.id ? result.rule! : item,
            )
          : [result.rule!, ...current],
      );
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setFeedback(
        result.message ||
          (isEditing
            ? "Promocao atualizada com sucesso."
            : "Promocao salva com sucesso."),
      );
      resetForm();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar a promocao.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleRule(rule: CompanyCartDiscountRule) {
    setTogglingRuleId(rule.id);
    setFeedback("");

    try {
      const response = await fetch(`/api/empresa/promocoes/${rule.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          active: !rule.active,
        }),
      });

      const result = (await response.json()) as CartDiscountApiResponse;

      if (!response.ok || !result.ok || !result.rule) {
        throw new Error(
          result.message || "Nao foi possivel atualizar a promocao.",
        );
      }

      setRules((current) =>
        current.map((item) => (item.id === result.rule!.id ? result.rule! : item)),
      );
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setFeedback(result.message || "Promocao atualizada.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar a promocao.",
      );
    } finally {
      setTogglingRuleId(null);
    }
  }

  function toggleProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function toggleCategory(categoryId: string) {
    const isCategoryMode = form.ruleMode === "categoria";
    const alreadySelected = form.categoryIds.includes(categoryId);

    setForm((current) => {
      if (current.ruleMode === "categoria") {
        return {
          ...current,
          categoryIds: [categoryId],
        };
      }

      const exists = current.categoryIds.includes(categoryId);
      return {
        ...current,
        categoryIds: exists
          ? current.categoryIds.filter((id) => id !== categoryId)
          : [...current.categoryIds, categoryId],
      };
    });
    setSelectedProductIds([]);
    setGroupMinimums((current) => {
      if (isCategoryMode) {
        return { [categoryId]: current[categoryId] ?? "1" };
      }

      if (alreadySelected) {
        const next = { ...current };
        delete next[categoryId];
        return next;
      }

      return {
        ...current,
        [categoryId]: current[categoryId] ?? "1",
      };
    });
  }

  function toggleSelectAllFilteredProducts() {
    if (allFilteredSelected) {
      setSelectedProductIds((current) =>
        current.filter(
          (productId) =>
            !filteredProducts.some((product) => product.productId === productId),
        ),
      );
      return;
    }

    setSelectedProductIds((current) =>
      Array.from(
        new Set([
          ...current,
          ...filteredProducts.map((product) => product.productId),
        ]),
      ),
    );
  }

  function clearSelectedProducts() {
    setSelectedProductIds([]);
  }

  function updateGroupMinimum(categoryId: string, value: string) {
    setGroupMinimums((current) => ({
      ...current,
      [categoryId]: value,
    }));
  }

  function startEditingRule(rule: CompanyCartDiscountRule) {
    setEditingRuleId(rule.id);
    setForm({
      title: rule.title,
      ruleMode: rule.ruleMode,
      categoryIds:
        rule.categoryIds.length > 0
          ? rule.categoryIds
          : rule.categoryId
            ? [rule.categoryId]
            : [],
      minimumQuantity: String(rule.minimumQuantity),
      discountAmount: String(rule.discountAmount),
      allowCombiningWithOtherPromotions:
        rule.allowCombiningWithOtherPromotions,
      notes: rule.notes,
    });
    setSelectedProductIds(rule.productIds);
    setGroupMinimums(
      rule.comboGroups.length > 0
        ? Object.fromEntries(
            rule.comboGroups.map((group) => [
              group.categoryId,
              String(group.minimumQuantity),
            ]),
          )
        : Object.fromEntries(
            (
              rule.categoryIds.length > 0
                ? rule.categoryIds
                : rule.categoryId
                  ? [rule.categoryId]
                  : []
            ).map((categoryId, index) => [
              categoryId,
              String(index === 0 ? rule.minimumQuantity : 1),
            ]),
          ),
    );
    setFeedback(`Editando a promocao "${rule.title}".`);
  }

  function resetForm() {
    setEditingRuleId(null);
    setSelectedProductIds([]);
    setGroupMinimums(defaultCategoryId ? { [defaultCategoryId]: "1" } : {});
    setForm({
      title: "",
      ruleMode: "categoria",
      categoryIds: defaultCategoryId ? [defaultCategoryId] : [],
      minimumQuantity: "3",
      discountAmount: "57",
      allowCombiningWithOtherPromotions: false,
      notes: "",
    });
  }

  const statusTone =
    !persistence.enabled || feedback.toLowerCase().includes("nao foi")
      ? styles.warningPanel
      : styles.callout;

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Promocoes de carrinho</div>
            <p className={styles.sectionSubtitle}>
              Configure aqui as regras internas de desconto no fim do carrinho.
              Agora voce pode montar tanto um combo por categoria quanto um combo
              com categorias e produtos misturados.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chip}>Categorias e produtos reais</span>
            <span className={styles.chip}>Desconto no fim do carrinho</span>
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
            <div className={styles.sectionTitle}>Promocoes salvas</div>
            <p className={styles.sectionSubtitle}>
              Essa lista fica no topo para voce ver rapido o que ja existe e
              editar, ativar ou inativar sem precisar rolar a tela toda.
            </p>
          </div>
        </div>

        {rules.length === 0 ? (
          <div className={styles.emptyState}>
            Nenhuma promocao salva ainda. Monte a primeira regra abaixo.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Regra</th>
                  <th>Tipo</th>
                  <th>Categorias</th>
                  <th>Produtos</th>
                  <th>Qtd minima</th>
                  <th>Desconto</th>
                  <th>Status</th>
                  <th>Nuvemshop</th>
                  <th>Ajuste</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <strong>{rule.title}</strong>
                      <div style={{ color: "#6f5b82", marginTop: 6 }}>
                        {rule.notes || "Sem observacao interna."}
                      </div>
                    </td>
                    <td>{rule.ruleMode === "misto" ? "Misto" : "Categoria"}</td>
                    <td>
                      {rule.comboGroups.length > 0
                        ? rule.comboGroups
                            .slice(0, 2)
                            .map(
                              (group) =>
                                `${group.minimumQuantity}x ${group.categoryName}`,
                            )
                            .join(", ")
                        : (rule.categoryNames.length > 0
                            ? rule.categoryNames
                            : [rule.categoryName]
                          )
                            .slice(0, 2)
                            .join(", ")}
                      <div style={{ color: "#6f5b82", marginTop: 6 }}>
                        {rule.comboGroups.length > 2
                          ? `+ ${rule.comboGroups.length - 2} grupo(s)`
                          : rule.comboGroups.length > 0
                            ? "Composicao exigida para liberar o desconto"
                            : rule.categoryNames.length > 2
                              ? `+ ${rule.categoryNames.length - 2} categoria(s)`
                              : rule.ruleMode === "misto"
                                ? "Categorias combinadas no mesmo combo"
                                : "Categoria principal da regra"}
                      </div>
                    </td>
                    <td>
                      {rule.productNames.length} produto(s)
                      <div style={{ color: "#6f5b82", marginTop: 6 }}>
                        {rule.productNames.slice(0, 2).join(", ")}
                        {rule.productNames.length > 2
                          ? ` + ${rule.productNames.length - 2}`
                          : ""}
                      </div>
                    </td>
                    <td>{rule.minimumQuantity}</td>
                    <td>{formatMoney(rule.discountAmount)}</td>
                    <td>{rule.active ? "Ativa" : "Pausada"}</td>
                    <td>
                      <div style={{ color: "#6f5b82", marginBottom: 6 }}>
                        {rule.allowCombiningWithOtherPromotions
                          ? "Combina com outras promocoes"
                          : "Nao combina com outras promocoes"}
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          borderRadius: 999,
                          background:
                            getNuvemshopStatusStyles(rule.nuvemshopStatus).background,
                          color: getNuvemshopStatusStyles(rule.nuvemshopStatus).color,
                          fontWeight: 700,
                        }}
                      >
                        {getNuvemshopStatusLabel(rule.nuvemshopStatus)}
                      </div>
                      <div style={{ color: "#6f5b82", marginTop: 6 }}>
                        {rule.nuvemshopMessage}
                      </div>
                      {rule.nuvemshopLastSyncedAt ? (
                        <div style={{ color: "#6f5b82", marginTop: 6 }}>
                          Ultima sync: {formatDateTime(rule.nuvemshopLastSyncedAt)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => startEditingRule(rule)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => handleToggleRule(rule)}
                          disabled={togglingRuleId === rule.id}
                        >
                          {togglingRuleId === rule.id
                            ? "Salvando..."
                            : rule.active
                              ? "Inativar"
                              : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <article className={styles.configCard}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>
                  {isEditing ? "Editar promocao" : "Nova promocao"}
                </div>
                <p className={styles.sectionSubtitle}>
                  Monte uma regra por uma categoria so ou um combo misto com
                  varias categorias e produtos juntos.
                </p>
              </div>
            </div>

            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Titulo da promocao no site</span>
                <input
                  type="text"
                  placeholder="Ex.: Leve 3 oversized e ganhe R$ 57 OFF"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>

              <label className={styles.filterField}>
                <span>Modo do combo</span>
                <select
                  value={form.ruleMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as RuleMode;
                    const nextCategoryIds =
                      nextMode === "categoria"
                        ? form.categoryIds[0]
                          ? [form.categoryIds[0]]
                          : defaultCategoryId
                            ? [defaultCategoryId]
                            : []
                        : form.categoryIds;
                    setForm((current) => ({
                      ...current,
                      ruleMode: nextMode,
                      categoryIds: nextCategoryIds,
                    }));
                    setSelectedProductIds([]);
                    setGroupMinimums((current) => {
                      if (nextMode === "categoria") {
                        const onlyCategoryId = nextCategoryIds[0];
                        return onlyCategoryId
                          ? { [onlyCategoryId]: current[onlyCategoryId] ?? "1" }
                          : {};
                      }

                      return Object.fromEntries(
                        nextCategoryIds.map((categoryId) => [
                          categoryId,
                          current[categoryId] ?? "1",
                        ]),
                      );
                    });
                  }}
                >
                  <option value="categoria">So uma categoria</option>
                  <option value="misto">Categorias e produtos misturados</option>
                </select>
              </label>

              <div className={styles.filterGrid}>
                <label className={styles.filterField}>
                  <span>
                    {form.ruleMode === "misto"
                      ? "Quantidade total do combo"
                      : "Quantidade minima"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={
                      form.ruleMode === "misto"
                        ? String(computedMinimumQuantity)
                        : form.minimumQuantity
                    }
                    disabled={form.ruleMode === "misto"}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        minimumQuantity: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={styles.filterField}>
                  <span>Desconto no carrinho</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.discountAmount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        discountAmount: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={styles.filterField}>
                  <span>Combinar com outras promocoes</span>
                  <select
                    value={form.allowCombiningWithOtherPromotions ? "sim" : "nao"}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allowCombiningWithOtherPromotions:
                          event.target.value === "sim",
                      }))
                    }
                  >
                    <option value="nao">Nao permitir</option>
                    <option value="sim">Permitir combinar</option>
                  </select>
                </label>

                <label
                  className={styles.filterField}
                  style={{ gridColumn: "span 2" }}
                >
                  <span>Observacao interna</span>
                  <input
                    type="text"
                    placeholder="Ex.: combo smart, desconto so para campanha do mes"
                    value={form.notes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <div className={styles.listTitle}>
                {form.ruleMode === "misto"
                  ? "Categorias participantes"
                  : "Categoria principal"}
              </div>
              <div className={styles.chipRow} style={{ marginTop: 12 }}>
                {initialCategories.map((category) => {
                  const selected = form.categoryIds.includes(category.id);

                  return (
                    <button
                      key={category.id}
                      type="button"
                      className={
                        selected ? styles.primaryButton : styles.secondaryButton
                      }
                      onClick={() => toggleCategory(category.id)}
                    >
                      {category.name} ({category.productCount})
                    </button>
                  );
                })}
              </div>
            </div>

            {form.ruleMode === "misto" && selectedCategories.length > 0 ? (
              <div style={{ marginTop: 18 }}>
                <div className={styles.listTitle}>Composicao do combo</div>
                <div className={styles.formStack} style={{ marginTop: 12 }}>
                  {selectedCategories.map((category) => {
                    const selectedCount = selectedProducts.filter((product) =>
                      product.categoryIds.includes(category.id),
                    ).length;

                    return (
                      <div key={category.id} className={styles.filterGrid}>
                        <label className={styles.filterField}>
                          <span>Categoria</span>
                          <input value={category.name} disabled />
                        </label>
                        <label className={styles.filterField}>
                          <span>Qtd exigida</span>
                          <input
                            type="number"
                            min={1}
                            value={groupMinimums[category.id] ?? "1"}
                            onChange={(event) =>
                              updateGroupMinimum(category.id, event.target.value)
                            }
                          />
                        </label>
                        <label className={styles.filterField}>
                          <span>Produtos selecionados</span>
                          <input value={String(selectedCount)} disabled />
                        </label>
                      </div>
                    );
                  })}
                </div>
                <p style={{ color: "#6f5b82", marginTop: 12 }}>
                  Cada item do carrinho conta uma vez so. Exemplo: 2 Full
                  Estampa + 1 Minimalista.
                </p>
              </div>
            ) : null}

            <div className={styles.filterActions} style={{ marginTop: 16 }}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSaveRule}
                disabled={!persistence.enabled || isSaving}
              >
                {isSaving
                  ? "Salvando..."
                  : isEditing
                    ? "Salvar edicao"
                    : "Salvar promocao"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetForm}
              >
                Limpar formulario
              </button>
              {isEditing ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={resetForm}
                >
                  Cancelar edicao
                </button>
              ) : null}
            </div>
          </article>

          <article className={statusTone}>
            <h3>Estado atual</h3>
            <p>{feedback || persistence.message}</p>
            <p style={{ marginTop: 10 }}>{initialCatalogState.message}</p>
            <p style={{ marginTop: 10 }}>
              Agora voce consegue criar o combo, publicar a promocao na
              Nuvemshop e deixar o callback do carrinho decidir quando aplicar
              ou remover o desconto.
            </p>
            <p style={{ marginTop: 10 }}>
              Se alguma regra aparecer com erro, a propria mensagem da linha
              mostra o retorno da sincronizacao para voce corrigir ambiente,
              callback ou payload.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Selecionar produtos</div>
            <p className={styles.sectionSubtitle}>
              Escolha os produtos que realmente entram no combo. Aqui voce pode
              selecionar todos de uma vez ou montar um mix manual.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chip}>
              {selectedCategories.length > 0
                ? selectedCategories.map((category) => category.name).join(", ")
                : "Sem categoria"}
            </span>
            <span className={styles.chip}>
              {selectedProductIds.length} selecionado(s)
            </span>
          </div>
        </div>

        <div className={styles.filterActions} style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={toggleSelectAllFilteredProducts}
          >
            {allFilteredSelected ? "Desmarcar todos" : "Selecionar todos"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={clearSelectedProducts}
          >
            Limpar selecao
          </button>
        </div>

        {filteredProducts.length === 0 ? (
          <div className={styles.emptyState}>
            Nenhum produto elegivel encontrado para as categorias escolhidas na
            Nuvemshop.
          </div>
        ) : (
          <div className={styles.catalogStack}>
            {filteredProducts.map((product) => {
              const checked = selectedProductIds.includes(product.productId);

              return (
                <article
                  key={product.productId}
                  className={styles.catalogDetailCard}
                >
                  <div className={styles.catalogDetailHeader}>
                    <div className={styles.catalogMedia}>
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.imageUrl}
                          alt={product.productName}
                          className={styles.catalogImage}
                        />
                      ) : (
                        <div className={styles.catalogImagePlaceholder}>
                          Sem foto
                        </div>
                      )}
                      <div>
                        <div className={styles.listTitle}>{product.productName}</div>
                        <div className={styles.chipRow} style={{ marginTop: 10 }}>
                          {product.categoryNames.map((categoryName) => (
                            <span
                              key={`${product.productId}-${categoryName}`}
                              className={styles.chip}
                            >
                              {categoryName}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <label
                      className={styles.secondaryButton}
                      style={{ gap: 10, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProduct(product.productId)}
                      />
                      {checked ? "Selecionado" : "Selecionar"}
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function getDefaultCategoryId(categories: CompanyDiscountCategoryOption[]) {
  const oversized =
    categories.find((category) =>
      normalizeText(category.name).includes("oversized"),
    ) ?? categories[0];

  return oversized?.id || "";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatDateTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function getNuvemshopStatusLabel(status: CompanyCartDiscountRule["nuvemshopStatus"]) {
  switch (status) {
    case "publicada":
      return "Publicada";
    case "pausada":
      return "Pausada";
    case "erro":
      return "Erro";
    default:
      return "Pendente";
  }
}

function getNuvemshopStatusStyles(status: CompanyCartDiscountRule["nuvemshopStatus"]) {
  switch (status) {
    case "publicada":
      return { background: "#e6f7ee", color: "#0f8a4a" };
    case "pausada":
      return { background: "#fff3dd", color: "#9a6700" };
    case "erro":
      return { background: "#ffe6e6", color: "#b42318" };
    default:
      return { background: "#eee6fb", color: "#5b2aa8" };
  }
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getIntegerValue(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
