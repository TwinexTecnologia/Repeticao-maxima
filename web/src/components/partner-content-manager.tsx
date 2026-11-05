"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/panel.module.css";
import type {
  PartnerContentAdminData,
  PartnerContentAsset,
  PartnerContentAssetType,
  PartnerContentCampaign,
  PartnerContentCategoryKey,
  PartnerContentProduct,
  PartnerContentScopeType,
} from "@/lib/parceiros/content-repository";

type ContentManagerResponse = {
  ok: boolean;
  entityKind?: "campaign" | "product" | "asset";
  message?: string;
  campaign?: PartnerContentCampaign;
  product?: PartnerContentProduct;
  asset?: PartnerContentAsset;
};

type ContentUploadResponse = {
  ok: boolean;
  fileUrl?: string;
  message?: string;
};

type CampaignFormState = {
  editingId: string | null;
  title: string;
  summary: string;
  details: string;
  recommendedCta: string;
  imageUrl: string;
  startDate: string;
  endDate: string;
  active: boolean;
  isCurrent: boolean;
  sortOrder: string;
};

type ProductFormState = {
  editingId: string | null;
  name: string;
  category: string;
  imageUrl: string;
  shortDescription: string;
  composition: string;
  differentials: string;
  productUrl: string;
  active: boolean;
  sortOrder: string;
};

type AssetFormState = {
  editingId: string | null;
  scopeType: PartnerContentScopeType;
  scopeId: string;
  categoryKey: PartnerContentCategoryKey;
  title: string;
  description: string;
  fileUrl: string;
  previewUrl: string;
  downloadLabel: string;
  assetType: PartnerContentAssetType;
  active: boolean;
  sortOrder: string;
};

const CAMPAIGN_CATEGORY_OPTIONS: Array<{
  value: PartnerContentCategoryKey;
  label: string;
}> = [
  { value: "story", label: "Story" },
  { value: "feed", label: "Feed" },
  { value: "pdf", label: "PDF / briefing" },
  { value: "info", label: "Informacao" },
  { value: "other", label: "Outro" },
];

const PRODUCT_CATEGORY_OPTIONS: Array<{
  value: PartnerContentCategoryKey;
  label: string;
}> = [
  { value: "png_front", label: "PNG frente" },
  { value: "png_back", label: "PNG costas" },
  { value: "photo_official", label: "Foto oficial" },
  { value: "photo_model", label: "Foto com modelo" },
  { value: "video", label: "Video" },
  { value: "art", label: "Arte pronta" },
  { value: "other", label: "Outro" },
];

const BRAND_CATEGORY_OPTIONS: Array<{
  value: PartnerContentCategoryKey;
  label: string;
}> = [
  { value: "logos", label: "Logos" },
  { value: "elements", label: "Elementos" },
  { value: "backgrounds", label: "Fundos" },
];

const TEMPLATE_CATEGORY_OPTIONS: Array<{
  value: PartnerContentCategoryKey;
  label: string;
}> = [
  { value: "story_9_16", label: "Stories 9:16" },
  { value: "feed_4_5", label: "Feed 4:5" },
  { value: "template_other", label: "Outros" },
];

const IDEA_CATEGORY_OPTIONS: Array<{
  value: PartnerContentCategoryKey;
  label: string;
}> = [
  { value: "treino", label: "Treino" },
  { value: "cupom", label: "Cupom" },
  { value: "unboxing", label: "Unboxing" },
  { value: "look", label: "Look" },
  { value: "lancamento", label: "Lancamento" },
  { value: "other", label: "Outro" },
];

const ASSET_TYPE_OPTIONS: Array<{
  value: PartnerContentAssetType;
  label: string;
}> = [
  { value: "image", label: "Imagem" },
  { value: "video", label: "Video" },
  { value: "pdf", label: "PDF" },
  { value: "archive", label: "Arquivo" },
  { value: "link", label: "Link" },
  { value: "idea", label: "Ideia" },
];

export function PartnerContentManager({
  initialData,
}: {
  initialData: PartnerContentAdminData;
}) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialData.allCampaigns);
  const [products, setProducts] = useState(initialData.allProducts);
  const [assets, setAssets] = useState(initialData.allAssets);
  const [feedback, setFeedback] = useState(initialData.persistence.message);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [isUploadingCampaignImage, setIsUploadingCampaignImage] = useState(false);
  const [isUploadingProductImage, setIsUploadingProductImage] = useState(false);
  const [isUploadingAssetFile, setIsUploadingAssetFile] = useState(false);
  const [isUploadingAssetPreview, setIsUploadingAssetPreview] = useState(false);
  const [processingKey, setProcessingKey] = useState("");
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>({
    editingId: null,
    title: "",
    summary: "",
    details: "",
    recommendedCta: "",
    imageUrl: "",
    startDate: "",
    endDate: "",
    active: true,
    isCurrent: false,
    sortOrder: "0",
  });
  const [productForm, setProductForm] = useState<ProductFormState>({
    editingId: null,
    name: "",
    category: "",
    imageUrl: "",
    shortDescription: "",
    composition: "",
    differentials: "",
    productUrl: "",
    active: true,
    sortOrder: "0",
  });
  const [assetForm, setAssetForm] = useState<AssetFormState>({
    editingId: null,
    scopeType: "brand",
    scopeId: "",
    categoryKey: "logos",
    title: "",
    description: "",
    fileUrl: "",
    previewUrl: "",
    downloadLabel: "Baixar",
    assetType: "image",
    active: true,
    sortOrder: "0",
  });

  const metrics = useMemo(() => {
    const activeCampaigns = campaigns.filter((item) => item.active).length;
    const activeProducts = products.filter((item) => item.active).length;
    const activeAssets = assets.filter((item) => item.active).length;
    const currentCampaigns = campaigns.filter((item) => item.active && item.isCurrent).length;

    return [
      {
        label: "Campanhas de conteudo",
        value: String(campaigns.length),
        detail: `${activeCampaigns} ativa(s) no momento`,
      },
      {
        label: "Produtos na biblioteca",
        value: String(products.length),
        detail: `${activeProducts} ativo(s) para os parceiros`,
      },
      {
        label: "Materiais salvos",
        value: String(assets.length),
        detail: `${activeAssets} ativo(s) para download`,
      },
      {
        label: "Campanha em destaque",
        value: String(currentCampaigns),
        detail: "Idealmente apenas 1 por vez",
      },
    ];
  }, [assets, campaigns, products]);

  const categoryOptions = useMemo(() => {
    switch (assetForm.scopeType) {
      case "campaign":
        return CAMPAIGN_CATEGORY_OPTIONS;
      case "product":
        return PRODUCT_CATEGORY_OPTIONS;
      case "template":
        return TEMPLATE_CATEGORY_OPTIONS;
      case "idea":
        return IDEA_CATEGORY_OPTIONS;
      default:
        return BRAND_CATEGORY_OPTIONS;
    }
  }, [assetForm.scopeType]);

  async function handleSaveCampaign() {
    setIsSavingCampaign(true);
    setFeedback("");

    try {
      const payload = {
        entityKind: "campaign",
        title: campaignForm.title,
        summary: campaignForm.summary,
        details: campaignForm.details,
        recommendedCta: campaignForm.recommendedCta,
        imageUrl: campaignForm.imageUrl,
        startDate: campaignForm.startDate,
        endDate: campaignForm.endDate,
        active: campaignForm.active,
        isCurrent: campaignForm.isCurrent,
        sortOrder: Number(campaignForm.sortOrder || 0),
      };
      const result = await saveContentEntity(
        campaignForm.editingId,
        payload,
      );

      if (!result.campaign) {
        throw new Error(result.message || "Nao foi possivel salvar a campanha.");
      }

      setCampaigns((current) =>
        sortCampaigns(
          current.some((item) => item.id === result.campaign!.id)
            ? current.map((item) =>
                item.id === result.campaign!.id ? result.campaign! : item,
              )
            : [result.campaign!, ...current],
        ),
      );
      setFeedback(result.message || "Campanha salva com sucesso.");
      resetCampaignForm();
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar a campanha.",
      );
    } finally {
      setIsSavingCampaign(false);
    }
  }

  async function handleSaveProduct() {
    setIsSavingProduct(true);
    setFeedback("");

    try {
      const payload = {
        entityKind: "product",
        name: productForm.name,
        category: productForm.category,
        imageUrl: productForm.imageUrl,
        shortDescription: productForm.shortDescription,
        composition: productForm.composition,
        differentials: productForm.differentials,
        productUrl: productForm.productUrl,
        active: productForm.active,
        sortOrder: Number(productForm.sortOrder || 0),
      };
      const result = await saveContentEntity(
        productForm.editingId,
        payload,
      );

      if (!result.product) {
        throw new Error(result.message || "Nao foi possivel salvar o produto.");
      }

      setProducts((current) =>
        sortProducts(
          current.some((item) => item.id === result.product!.id)
            ? current.map((item) =>
                item.id === result.product!.id ? result.product! : item,
              )
            : [result.product!, ...current],
        ),
      );
      setFeedback(result.message || "Produto salvo com sucesso.");
      resetProductForm();
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar o produto.",
      );
    } finally {
      setIsSavingProduct(false);
    }
  }

  async function handleSaveAsset() {
    setIsSavingAsset(true);
    setFeedback("");

    try {
      const payload = {
        entityKind: "asset",
        scopeType: assetForm.scopeType,
        scopeId: assetForm.scopeId || null,
        categoryKey: assetForm.categoryKey,
        title: assetForm.title,
        description: assetForm.description,
        fileUrl: assetForm.fileUrl,
        previewUrl: assetForm.previewUrl,
        downloadLabel: assetForm.downloadLabel,
        assetType: assetForm.scopeType === "idea" ? "idea" : assetForm.assetType,
        active: assetForm.active,
        sortOrder: Number(assetForm.sortOrder || 0),
      };
      const result = await saveContentEntity(assetForm.editingId, payload);

      if (!result.asset) {
        throw new Error(result.message || "Nao foi possivel salvar o material.");
      }

      setAssets((current) =>
        sortAssets(
          current.some((item) => item.id === result.asset!.id)
            ? current.map((item) =>
                item.id === result.asset!.id ? result.asset! : item,
              )
            : [result.asset!, ...current],
        ),
      );
      setFeedback(result.message || "Material salvo com sucesso.");
      resetAssetForm();
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar o material.",
      );
    } finally {
      setIsSavingAsset(false);
    }
  }

  async function handleQuickCampaignToggle(campaign: PartnerContentCampaign) {
    setProcessingKey(`campaign-${campaign.id}`);
    setFeedback("");

    try {
      const result = await saveContentEntity(campaign.id, {
        entityKind: "campaign",
        title: campaign.title,
        summary: campaign.summary,
        details: campaign.details,
        recommendedCta: campaign.recommendedCta,
        imageUrl: campaign.imageUrl,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        active: !campaign.active,
        isCurrent: campaign.isCurrent,
        sortOrder: campaign.sortOrder,
      });

      if (!result.campaign) {
        throw new Error(result.message || "Nao foi possivel atualizar a campanha.");
      }

      setCampaigns((current) =>
        sortCampaigns(
          current.map((item) =>
            item.id === result.campaign!.id ? result.campaign! : item,
          ),
        ),
      );
      setFeedback(result.message || "Campanha atualizada com sucesso.");
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar a campanha.",
      );
    } finally {
      setProcessingKey("");
    }
  }

  async function handleUploadCampaignImage(file: File | null) {
    if (!file) {
      return;
    }

    setIsUploadingCampaignImage(true);
    setFeedback("");

    try {
      const fileUrl = await uploadContentFile(file, "campaigns");
      setCampaignForm((current) => ({
        ...current,
        imageUrl: fileUrl,
      }));
      setFeedback("Imagem da campanha enviada com sucesso.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel enviar a imagem da campanha.",
      );
    } finally {
      setIsUploadingCampaignImage(false);
    }
  }

  async function handleUploadProductImage(file: File | null) {
    if (!file) {
      return;
    }

    setIsUploadingProductImage(true);
    setFeedback("");

    try {
      const fileUrl = await uploadContentFile(file, "products");
      setProductForm((current) => ({
        ...current,
        imageUrl: fileUrl,
      }));
      setFeedback("Imagem do produto enviada com sucesso.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel enviar a imagem do produto.",
      );
    } finally {
      setIsUploadingProductImage(false);
    }
  }

  async function handleUploadAssetFile(file: File | null) {
    if (!file) {
      return;
    }

    setIsUploadingAssetFile(true);
    setFeedback("");

    try {
      const fileUrl = await uploadContentFile(file, "assets");
      setAssetForm((current) => ({
        ...current,
        fileUrl,
        assetType: current.scopeType === "idea" ? "idea" : inferAssetType(file),
      }));
      setFeedback("Arquivo principal enviado com sucesso.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel enviar o arquivo principal.",
      );
    } finally {
      setIsUploadingAssetFile(false);
    }
  }

  async function handleUploadAssetPreview(file: File | null) {
    if (!file) {
      return;
    }

    setIsUploadingAssetPreview(true);
    setFeedback("");

    try {
      const fileUrl = await uploadContentFile(file, "previews");
      setAssetForm((current) => ({
        ...current,
        previewUrl: fileUrl,
      }));
      setFeedback("Preview enviado com sucesso.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel enviar o preview.",
      );
    } finally {
      setIsUploadingAssetPreview(false);
    }
  }

  function startEditingCampaign(campaign: PartnerContentCampaign) {
    setCampaignForm({
      editingId: campaign.id,
      title: campaign.title,
      summary: campaign.summary,
      details: campaign.details,
      recommendedCta: campaign.recommendedCta,
      imageUrl: campaign.imageUrl,
      startDate: campaign.startDate || "",
      endDate: campaign.endDate || "",
      active: campaign.active,
      isCurrent: campaign.isCurrent,
      sortOrder: String(campaign.sortOrder),
    });
    setFeedback(`Editando a campanha ${campaign.title}.`);
  }

  function startEditingProduct(product: PartnerContentProduct) {
    setProductForm({
      editingId: product.id,
      name: product.name,
      category: product.category,
      imageUrl: product.imageUrl,
      shortDescription: product.shortDescription,
      composition: product.composition,
      differentials: product.differentials,
      productUrl: product.productUrl,
      active: product.active,
      sortOrder: String(product.sortOrder),
    });
    setFeedback(`Editando o produto ${product.name}.`);
  }

  function startEditingAsset(asset: PartnerContentAsset) {
    setAssetForm({
      editingId: asset.id,
      scopeType: asset.scopeType,
      scopeId: asset.scopeId || "",
      categoryKey: asset.categoryKey,
      title: asset.title,
      description: asset.description,
      fileUrl: asset.fileUrl,
      previewUrl: asset.previewUrl,
      downloadLabel: asset.downloadLabel,
      assetType: asset.assetType,
      active: asset.active,
      sortOrder: String(asset.sortOrder),
    });
    setFeedback(`Editando o material ${asset.title}.`);
  }

  function resetCampaignForm() {
    setCampaignForm({
      editingId: null,
      title: "",
      summary: "",
      details: "",
      recommendedCta: "",
      imageUrl: "",
      startDate: "",
      endDate: "",
      active: true,
      isCurrent: false,
      sortOrder: "0",
    });
  }

  function resetProductForm() {
    setProductForm({
      editingId: null,
      name: "",
      category: "",
      imageUrl: "",
      shortDescription: "",
      composition: "",
      differentials: "",
      productUrl: "",
      active: true,
      sortOrder: "0",
    });
  }

  function resetAssetForm() {
    setAssetForm({
      editingId: null,
      scopeType: "brand",
      scopeId: "",
      categoryKey: "logos",
      title: "",
      description: "",
      fileUrl: "",
      previewUrl: "",
      downloadLabel: "Baixar",
      assetType: "image",
      active: true,
      sortOrder: "0",
    });
  }

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Central de Conteudo</div>
            <p className={styles.sectionSubtitle}>
              Biblioteca oficial para atletas e influenciadores baixarem campanhas,
              produtos, identidade da marca, templates e ideias de conteudo.
            </p>
          </div>
          <div className={styles.chipRow}>
            <a href="/meu-desempenho?tab=conteudo" className={styles.secondaryButton}>
              Ver painel do parceiro
            </a>
          </div>
        </div>

        <div className={styles.metricGridCompact}>
          {metrics.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              <div className={styles.metricHint}>{metric.detail}</div>
            </article>
          ))}
        </div>

        {feedback ? (
          <div className={styles.callout} style={{ marginTop: 20 }}>
            <h3>Status da biblioteca</h3>
            <p>{feedback}</p>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Campanhas da marca</div>
            <p className={styles.sectionSubtitle}>
              Aqui entram as campanhas promocionais que aparecem em destaque no painel.
            </p>
          </div>
        </div>

        <div className={styles.orderLayout}>
          <article className={styles.catalogCard}>
            <div className={styles.sectionTitle}>
              {campaignForm.editingId ? "Editar campanha" : "Nova campanha"}
            </div>
            <div className={styles.filterGrid} style={{ marginTop: 20 }}>
              <label className={styles.filterField}>
                <span>Titulo</span>
                <input
                  value={campaignForm.title}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Ex.: Dia do Cliente"
                />
              </label>
              <label className={styles.filterField}>
                <span>Resumo curto</span>
                <input
                  value={campaignForm.summary}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      summary: event.target.value,
                    }))
                  }
                  placeholder="Ex.: Frete gratis + combos especiais"
                />
              </label>
              <label className={styles.filterField}>
                <span>Inicio</span>
                <input
                  type="date"
                  value={campaignForm.startDate}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Fim</span>
                <input
                  type="date"
                  value={campaignForm.endDate}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      endDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Argumento recomendado</span>
                <input
                  value={campaignForm.recommendedCta}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      recommendedCta: event.target.value,
                    }))
                  }
                  placeholder="Ex.: Aproveita o frete gratis no meu cupom"
                />
              </label>
              <label className={styles.filterField}>
                <span>Foto da campanha</span>
                <div className={styles.stack}>
                  <input
                    value={campaignForm.imageUrl}
                    onChange={(event) =>
                      setCampaignForm((current) => ({
                        ...current,
                        imageUrl: event.target.value,
                      }))
                    }
                    placeholder="https://..."
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleUploadCampaignImage(event.target.files?.[0] || null)
                    }
                    disabled={isUploadingCampaignImage}
                  />
                  <span className={styles.sectionSubtitle}>
                    {isUploadingCampaignImage
                      ? "Enviando imagem..."
                      : "Voce pode colar a URL ou subir a foto oficial da campanha por aqui."}
                  </span>
                </div>
              </label>
              <label className={styles.filterField}>
                <span>Ordem</span>
                <input
                  type="number"
                  value={campaignForm.sortOrder}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      sortOrder: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField} style={{ gridColumn: "1 / -1" }}>
                <span>Informacoes da campanha</span>
                <textarea
                  value={campaignForm.details}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      details: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Resumo do periodo, regras e pontos importantes para o criador."
                />
              </label>
            </div>

            <div className={styles.checkboxGrid}>
              <label className={styles.checkboxCard}>
                <input
                  type="checkbox"
                  checked={campaignForm.active}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                />
                <div>
                  <strong>Campanha ativa</strong>
                  <span>Quando ativa, pode aparecer no painel do parceiro.</span>
                </div>
              </label>
              <label className={styles.checkboxCard}>
                <input
                  type="checkbox"
                  checked={campaignForm.isCurrent}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      isCurrent: event.target.checked,
                    }))
                  }
                />
                <div>
                  <strong>Campanha em destaque</strong>
                  <span>Usada no topo da Central de Conteudo.</span>
                </div>
              </label>
            </div>

            <div className={styles.filterActions} style={{ marginTop: 20 }}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSaveCampaign}
                disabled={isSavingCampaign}
              >
                {isSavingCampaign
                  ? "Salvando..."
                  : campaignForm.editingId
                    ? "Atualizar campanha"
                    : "Criar campanha"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetCampaignForm}
              >
                Limpar
              </button>
            </div>
          </article>

          <div className={styles.stack}>
            {campaigns.length > 0 ? (
              campaigns.map((campaign) => (
                <article key={campaign.id} className={styles.catalogCard}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.sectionTitle}>{campaign.title}</div>
                    <span
                      className={`${styles.pill} ${
                        campaign.active ? styles.pillMedium : styles.pillLow
                      }`}
                    >
                      {campaign.active ? "Ativa" : "Inativa"}
                    </span>
                  </div>
                  <p className={styles.sectionSubtitle}>
                    {campaign.summary || "Sem resumo curto."}
                  </p>
                  {campaign.imageUrl ? (
                    <div className={styles.metaList} style={{ marginTop: 16 }}>
                      <div className={styles.metaItem}>
                        <strong>Foto da campanha</strong>
                        <span>{campaign.imageUrl}</span>
                      </div>
                    </div>
                  ) : null}
                  <div className={styles.metaList} style={{ marginTop: 16 }}>
                    <div className={styles.metaItem}>
                      <strong>Periodo</strong>
                      <span>
                        {formatDate(campaign.startDate)} ate {formatDate(campaign.endDate)}
                      </span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Materiais</strong>
                      <span>{campaign.assets.length}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Destaque</strong>
                      <span>{campaign.isCurrent ? "Sim" : "Nao"}</span>
                    </div>
                  </div>
                  {campaign.recommendedCta ? (
                    <div className={styles.callout} style={{ marginTop: 16 }}>
                      <h3>Argumento recomendado</h3>
                      <p>{campaign.recommendedCta}</p>
                    </div>
                  ) : null}
                  <div className={styles.filterActions} style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => startEditingCampaign(campaign)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => handleQuickCampaignToggle(campaign)}
                      disabled={processingKey === `campaign-${campaign.id}`}
                    >
                      {campaign.active ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className={styles.emptyState}>
                Nenhuma campanha de conteudo cadastrada ainda.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Produtos da biblioteca</div>
            <p className={styles.sectionSubtitle}>
              Monte os cards visuais dos produtos com foto, infos e links.
            </p>
          </div>
        </div>

        <div className={styles.orderLayout}>
          <article className={styles.catalogCard}>
            <div className={styles.sectionTitle}>
              {productForm.editingId ? "Editar produto" : "Novo produto"}
            </div>
            <div className={styles.filterGrid} style={{ marginTop: 20 }}>
              <label className={styles.filterField}>
                <span>Nome</span>
                <input
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Ex.: Oversized Control"
                />
              </label>
              <label className={styles.filterField}>
                <span>Categoria</span>
                <input
                  value={productForm.category}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder="Ex.: Oversized"
                />
              </label>
              <label className={styles.filterField}>
                <span>Foto principal</span>
                <div className={styles.stack}>
                  <input
                    value={productForm.imageUrl}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        imageUrl: event.target.value,
                      }))
                    }
                    placeholder="https://..."
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleUploadProductImage(event.target.files?.[0] || null)
                    }
                    disabled={isUploadingProductImage}
                  />
                  <span className={styles.sectionSubtitle}>
                    {isUploadingProductImage
                      ? "Enviando imagem..."
                      : "Voce pode colar a URL ou subir a imagem por aqui."}
                  </span>
                </div>
              </label>
              <label className={styles.filterField}>
                <span>Link do produto</span>
                <input
                  value={productForm.productUrl}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      productUrl: event.target.value,
                    }))
                  }
                  placeholder="https://..."
                />
              </label>
              <label className={styles.filterField} style={{ gridColumn: "1 / -1" }}>
                <span>Descricao curta</span>
                <textarea
                  rows={3}
                  value={productForm.shortDescription}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      shortDescription: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Composicao</span>
                <input
                  value={productForm.composition}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      composition: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Diferenciais</span>
                <input
                  value={productForm.differentials}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      differentials: event.target.value,
                    }))
                  }
                  placeholder="Ex.: modelagem ampla, tecido encorpado"
                />
              </label>
              <label className={styles.filterField}>
                <span>Ordem</span>
                <input
                  type="number"
                  value={productForm.sortOrder}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      sortOrder: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className={styles.checkboxGrid}>
              <label className={styles.checkboxCard}>
                <input
                  type="checkbox"
                  checked={productForm.active}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                />
                <div>
                  <strong>Produto ativo</strong>
                  <span>Quando ativo, aparece na Central de Conteudo.</span>
                </div>
              </label>
            </div>

            <div className={styles.filterActions} style={{ marginTop: 20 }}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSaveProduct}
                disabled={isSavingProduct}
              >
                {isSavingProduct
                  ? "Salvando..."
                  : productForm.editingId
                    ? "Atualizar produto"
                    : "Criar produto"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetProductForm}
              >
                Limpar
              </button>
            </div>
          </article>

          <div className={styles.stack}>
            {products.length > 0 ? (
              products.map((product) => (
                <article key={product.id} className={styles.catalogCard}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.sectionTitle}>{product.name}</div>
                    <span
                      className={`${styles.pill} ${
                        product.active ? styles.pillMedium : styles.pillLow
                      }`}
                    >
                      {product.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <p className={styles.sectionSubtitle}>
                    {product.category || "Sem categoria"} · {product.assets.length} material(is)
                  </p>
                  <div className={styles.metaList} style={{ marginTop: 16 }}>
                    <div className={styles.metaItem}>
                      <strong>Link</strong>
                      <span>{product.productUrl || "-"}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Composicao</strong>
                      <span>{product.composition || "-"}</span>
                    </div>
                  </div>
                  <div className={styles.filterActions} style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => startEditingProduct(product)}
                    >
                      Editar
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className={styles.emptyState}>
                Nenhum produto da biblioteca cadastrado ainda.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Materiais, templates e ideias</div>
            <p className={styles.sectionSubtitle}>
              Cadastre arquivos para campanhas, produtos, identidade, templates e ideias de conteudo.
            </p>
          </div>
        </div>

        <div className={styles.orderLayout}>
          <article className={styles.catalogCard}>
            <div className={styles.sectionTitle}>
              {assetForm.editingId ? "Editar material" : "Novo material"}
            </div>
            <div className={styles.filterGrid} style={{ marginTop: 20 }}>
              <label className={styles.filterField}>
                <span>Escopo</span>
                <select
                  value={assetForm.scopeType}
                  onChange={(event) => {
                    const nextScopeType = event.target.value as PartnerContentScopeType;
                    setAssetForm((current) => ({
                      ...current,
                      scopeType: nextScopeType,
                      scopeId: "",
                      categoryKey: getDefaultCategoryForScope(nextScopeType),
                      assetType: nextScopeType === "idea" ? "idea" : current.assetType,
                    }));
                  }}
                >
                  <option value="campaign">Campanha</option>
                  <option value="product">Produto</option>
                  <option value="brand">Materiais da marca</option>
                  <option value="template">Templates</option>
                  <option value="idea">Ideias</option>
                </select>
              </label>
              {(assetForm.scopeType === "campaign" ||
                assetForm.scopeType === "product") ? (
                <label className={styles.filterField}>
                  <span>
                    {assetForm.scopeType === "campaign" ? "Campanha" : "Produto"}
                  </span>
                  <select
                    value={assetForm.scopeId}
                    onChange={(event) =>
                      setAssetForm((current) => ({
                        ...current,
                        scopeId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Selecione</option>
                    {(assetForm.scopeType === "campaign" ? campaigns : products).map(
                      (item) => (
                        <option key={item.id} value={item.id}>
                          {"title" in item ? item.title : item.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ) : null}
              <label className={styles.filterField}>
                <span>Categoria</span>
                <select
                  value={assetForm.categoryKey}
                  onChange={(event) =>
                    setAssetForm((current) => ({
                      ...current,
                      categoryKey: event.target.value as PartnerContentCategoryKey,
                    }))
                  }
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Titulo</span>
                <input
                  value={assetForm.title}
                  onChange={(event) =>
                    setAssetForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Tipo do arquivo</span>
                <select
                  value={assetForm.assetType}
                  onChange={(event) =>
                    setAssetForm((current) => ({
                      ...current,
                      assetType: event.target.value as PartnerContentAssetType,
                    }))
                  }
                  disabled={assetForm.scopeType === "idea"}
                >
                  {ASSET_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>URL de download</span>
                <div className={styles.stack}>
                  <input
                    value={assetForm.fileUrl}
                    onChange={(event) =>
                      setAssetForm((current) => ({
                        ...current,
                        fileUrl: event.target.value,
                      }))
                    }
                    placeholder="https://..."
                    disabled={assetForm.scopeType === "idea"}
                  />
                  <input
                    type="file"
                    onChange={(event) =>
                      handleUploadAssetFile(event.target.files?.[0] || null)
                    }
                    disabled={assetForm.scopeType === "idea" || isUploadingAssetFile}
                  />
                  <span className={styles.sectionSubtitle}>
                    {assetForm.scopeType === "idea"
                      ? "Ideias nao precisam de arquivo para download."
                      : isUploadingAssetFile
                        ? "Enviando arquivo..."
                        : "Voce pode colar a URL ou subir o arquivo por aqui."}
                  </span>
                </div>
              </label>
              <label className={styles.filterField}>
                <span>Preview (opcional)</span>
                <div className={styles.stack}>
                  <input
                    value={assetForm.previewUrl}
                    onChange={(event) =>
                      setAssetForm((current) => ({
                        ...current,
                        previewUrl: event.target.value,
                      }))
                    }
                    placeholder="https://..."
                  />
                  <input
                    type="file"
                    accept="image/*,video/*,.pdf"
                    onChange={(event) =>
                      handleUploadAssetPreview(event.target.files?.[0] || null)
                    }
                    disabled={isUploadingAssetPreview}
                  />
                  <span className={styles.sectionSubtitle}>
                    {isUploadingAssetPreview
                      ? "Enviando preview..."
                      : "Use para capa, thumb ou visualizacao do material."}
                  </span>
                </div>
              </label>
              <label className={styles.filterField}>
                <span>Texto do botao</span>
                <input
                  value={assetForm.downloadLabel}
                  onChange={(event) =>
                    setAssetForm((current) => ({
                      ...current,
                      downloadLabel: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Ordem</span>
                <input
                  type="number"
                  value={assetForm.sortOrder}
                  onChange={(event) =>
                    setAssetForm((current) => ({
                      ...current,
                      sortOrder: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField} style={{ gridColumn: "1 / -1" }}>
                <span>Descricao</span>
                <textarea
                  rows={4}
                  value={assetForm.description}
                  onChange={(event) =>
                    setAssetForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Use para explicar o arquivo ou escrever a ideia."
                />
              </label>
            </div>

            <div className={styles.checkboxGrid}>
              <label className={styles.checkboxCard}>
                <input
                  type="checkbox"
                  checked={assetForm.active}
                  onChange={(event) =>
                    setAssetForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                />
                <div>
                  <strong>Material ativo</strong>
                  <span>Quando ativo, aparece para os parceiros.</span>
                </div>
              </label>
            </div>

            <div className={styles.filterActions} style={{ marginTop: 20 }}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSaveAsset}
                disabled={isSavingAsset}
              >
                {isSavingAsset
                  ? "Salvando..."
                  : assetForm.editingId
                    ? "Atualizar material"
                    : "Criar material"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetAssetForm}
              >
                Limpar
              </button>
            </div>
          </article>

          <div className={styles.stack}>
            {assets.length > 0 ? (
              sortAssets(assets).map((asset) => (
                <article key={asset.id} className={styles.catalogCard}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.sectionTitle}>{asset.title}</div>
                    <span
                      className={`${styles.pill} ${
                        asset.active ? styles.pillMedium : styles.pillLow
                      }`}
                    >
                      {asset.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <p className={styles.sectionSubtitle}>
                    {describeAssetScope(asset, campaigns, products)}
                  </p>
                  <div className={styles.metaList} style={{ marginTop: 16 }}>
                    <div className={styles.metaItem}>
                      <strong>Categoria</strong>
                      <span>{getCategoryLabel(asset.categoryKey)}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Tipo</strong>
                      <span>{getAssetTypeLabel(asset.assetType)}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Download</strong>
                      <span>{asset.fileUrl || "-"}</span>
                    </div>
                  </div>
                  <div className={styles.filterActions} style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => startEditingAsset(asset)}
                    >
                      Editar
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className={styles.emptyState}>
                Nenhum material da Central de Conteudo cadastrado ainda.
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

async function saveContentEntity(
  id: string | null,
  payload: Record<string, unknown>,
) {
  const response = await fetch(
    id ? `/api/influenciadores/conteudo/${id}` : "/api/influenciadores/conteudo",
    {
      method: id ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const result = (await response.json()) as ContentManagerResponse;

  if (!response.ok || !result.ok) {
    throw new Error(
      result.message || "Nao foi possivel salvar o item da Central de Conteudo.",
    );
  }

  return result;
}

async function uploadContentFile(
  file: File,
  folder: "campaigns" | "products" | "assets" | "previews",
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const response = await fetch("/api/influenciadores/conteudo/upload", {
    method: "POST",
    body: formData,
  });
  const result = (await response.json()) as ContentUploadResponse;

  if (!response.ok || !result.ok || !result.fileUrl) {
    throw new Error(result.message || "Nao foi possivel enviar o arquivo.");
  }

  return result.fileUrl;
}

function inferAssetType(file: File): PartnerContentAssetType {
  const type = String(file.type || "").toLowerCase();

  if (type.startsWith("image/")) {
    return "image";
  }

  if (type.startsWith("video/")) {
    return "video";
  }

  if (type === "application/pdf") {
    return "pdf";
  }

  if (type.includes("zip") || type.includes("compressed")) {
    return "archive";
  }

  return "archive";
}

function sortCampaigns(items: PartnerContentCampaign[]) {
  return items.slice().sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    if (left.isCurrent !== right.isCurrent) {
      return left.isCurrent ? -1 : 1;
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return (right.startDate || "").localeCompare(left.startDate || "");
  });
}

function sortProducts(items: PartnerContentProduct[]) {
  return items.slice().sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name, "pt-BR");
  });
}

function sortAssets(items: PartnerContentAsset[]) {
  return items.slice().sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.title.localeCompare(right.title, "pt-BR");
  });
}

function getDefaultCategoryForScope(scopeType: PartnerContentScopeType) {
  switch (scopeType) {
    case "campaign":
      return "story";
    case "product":
      return "png_front";
    case "template":
      return "story_9_16";
    case "idea":
      return "treino";
    default:
      return "logos";
  }
}

function describeAssetScope(
  asset: PartnerContentAsset,
  campaigns: PartnerContentCampaign[],
  products: PartnerContentProduct[],
) {
  if (asset.scopeType === "campaign") {
    return `Campanha · ${
      campaigns.find((item) => item.id === asset.scopeId)?.title || "Sem campanha"
    }`;
  }

  if (asset.scopeType === "product") {
    return `Produto · ${
      products.find((item) => item.id === asset.scopeId)?.name || "Sem produto"
    }`;
  }

  if (asset.scopeType === "template") {
    return "Template";
  }

  if (asset.scopeType === "idea") {
    return "Ideia de conteudo";
  }

  return "Material da marca";
}

function getCategoryLabel(value: PartnerContentCategoryKey) {
  const allOptions = [
    ...CAMPAIGN_CATEGORY_OPTIONS,
    ...PRODUCT_CATEGORY_OPTIONS,
    ...BRAND_CATEGORY_OPTIONS,
    ...TEMPLATE_CATEGORY_OPTIONS,
    ...IDEA_CATEGORY_OPTIONS,
  ];

  return allOptions.find((item) => item.value === value)?.label || value;
}

function getAssetTypeLabel(value: PartnerContentAssetType) {
  return ASSET_TYPE_OPTIONS.find((item) => item.value === value)?.label || value;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}
