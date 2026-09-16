"use client";

import { useMemo } from "react";

import styles from "@/components/panel.module.css";
import type {
  PartnerContentAsset,
  PartnerContentCampaign,
  PartnerContentLibrary,
  PartnerContentProduct,
} from "@/lib/parceiros/content-repository";

export function PartnerContentHub({
  library,
  compact = false,
}: {
  library: PartnerContentLibrary;
  compact?: boolean;
}) {
  const brandGroups = useMemo(
    () => buildCategoryGroups(library.brandAssets),
    [library.brandAssets],
  );
  const templateGroups = useMemo(
    () => buildCategoryGroups(library.templateAssets),
    [library.templateAssets],
  );

  return (
    <div className={styles.stack}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Central de Conteudo</div>
            <p className={styles.sectionSubtitle}>
              Tudo que voce precisa para criar conteudos com a Repeticao Maxima,
              com liberdade para produzir do seu jeito.
            </p>
          </div>
          {!compact ? (
            <div className={styles.chipRow}>
              <span className={styles.chip}>Biblioteca oficial da marca</span>
              <span className={styles.chip}>Arquivos e direcionamentos</span>
            </div>
          ) : null}
        </div>

        {library.activeCampaign ? (
          <article className={styles.contentHeroCard}>
            <div className={styles.contentHeroHeader}>
              <div>
                <div className={styles.contentHeroEyebrow}>🔥 Campanha ativa</div>
                <h2>{library.activeCampaign.title}</h2>
                <p>{library.activeCampaign.summary || "Campanha ativa para voce divulgar."}</p>
              </div>
              <div className={styles.contentHeroBadge}>
                {formatPeriod(library.activeCampaign.startDate, library.activeCampaign.endDate)}
              </div>
            </div>

            {library.activeCampaign.details ? (
              <div className={styles.callout} style={{ marginTop: 18 }}>
                <h3>Informacoes da campanha</h3>
                <p>{library.activeCampaign.details}</p>
              </div>
            ) : null}

            {library.activeCampaign.recommendedCta ? (
              <div className={styles.callout} style={{ marginTop: 16 }}>
                <h3>CTA recomendado</h3>
                <p>{library.activeCampaign.recommendedCta}</p>
              </div>
            ) : null}

            <div className={styles.contentAssetGrid}>
              {library.activeCampaign.assets.length > 0 ? (
                library.activeCampaign.assets.map((asset) => (
                  <AssetCard key={asset.id} asset={asset} />
                ))
              ) : (
                <div className={styles.warningPanel}>
                  <div className={styles.warningTitle}>Sem materiais da campanha</div>
                  <p className={styles.warningText}>
                    O time ainda nao cadastrou arquivos para essa campanha.
                  </p>
                </div>
              )}
            </div>
          </article>
        ) : (
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Nenhuma campanha em destaque</div>
            <p className={styles.warningText}>
              A Central de Conteudo continua disponivel abaixo com produtos, marca, templates e ideias.
            </p>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>👕 Produtos</div>
            <p className={styles.sectionSubtitle}>
              Biblioteca visual dos produtos oficiais da marca.
            </p>
          </div>
        </div>

        {library.products.length > 0 ? (
          <div className={styles.contentProductGrid}>
            {library.products.map((product) => (
              <ProductCard key={product.id} product={product} compact={compact} />
            ))}
          </div>
        ) : (
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Sem produtos publicados</div>
            <p className={styles.warningText}>
              Ainda nao existem produtos cadastrados na biblioteca.
            </p>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>🎨 Materiais da marca</div>
            <p className={styles.sectionSubtitle}>
              Logos, elementos e fundos oficiais da Repeticao Maxima.
            </p>
          </div>
        </div>

        {brandGroups.length > 0 ? (
          <div className={styles.contentCategoryGrid}>
            {brandGroups.map((group) => (
              <MaterialGroupCard
                key={group.key}
                title={group.title}
                subtitle={group.subtitle}
                assets={group.assets}
              />
            ))}
          </div>
        ) : (
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Sem materiais da marca</div>
            <p className={styles.warningText}>
              O time ainda nao cadastrou logos, elementos ou fundos.
            </p>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>🧩 Templates</div>
            <p className={styles.sectionSubtitle}>
              Bases prontas para apoiar seus stories, posts e lancamentos.
            </p>
          </div>
        </div>

        {templateGroups.length > 0 ? (
          <div className={styles.contentCategoryGrid}>
            {templateGroups.map((group) => (
              <MaterialGroupCard
                key={group.key}
                title={group.title}
                subtitle={group.subtitle}
                assets={group.assets}
              />
            ))}
          </div>
        ) : (
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Sem templates publicados</div>
            <p className={styles.warningText}>
              Ainda nao existem templates disponiveis para download.
            </p>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>💡 Ideias para criar</div>
            <p className={styles.sectionSubtitle}>
              Sugestoes rapidas para voce adaptar ao seu publico.
            </p>
          </div>
        </div>

        {library.ideas.length > 0 ? (
          <div className={styles.contentIdeaGrid}>
            {library.ideas.map((idea) => (
              <article key={idea.id} className={styles.contentIdeaCard}>
                <div className={styles.contentIdeaBadge}>
                  {getCategoryLabel(idea.categoryKey)}
                </div>
                <h3>{idea.title}</h3>
                <p>{idea.description}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Sem ideias cadastradas</div>
            <p className={styles.warningText}>
              O time ainda nao publicou sugestoes de conteudo para esta fase.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ProductCard({
  product,
  compact,
}: {
  product: PartnerContentProduct;
  compact: boolean;
}) {
  const infoItems = [
    { label: "Descricao", value: product.shortDescription },
    { label: "Composicao", value: product.composition },
    { label: "Diferenciais", value: product.differentials },
    { label: "Link", value: product.productUrl },
  ].filter((item) => item.value);

  return (
    <details className={styles.contentProductCard}>
      <summary className={styles.contentProductSummary}>
        <AssetPreview
          title={product.name}
          imageUrl={product.imageUrl}
          tone="product"
          className={styles.contentProductPreview}
        />
        <div className={styles.contentProductMeta}>
          <div className={styles.contentProductCategory}>{product.category || "Produto"}</div>
          <strong>{product.name}</strong>
          <span>{product.assets.length} material(is) disponivel(is)</span>
        </div>
      </summary>

      {!compact && infoItems.length > 0 ? (
        <div className={styles.metaList} style={{ marginTop: 16 }}>
          {infoItems.map((item) => (
            <div key={item.label} className={styles.metaItem}>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.contentAssetGrid}>
        {product.assets.length > 0 ? (
          product.assets.map((asset) => <AssetCard key={asset.id} asset={asset} />)
        ) : (
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Sem materiais do produto</div>
            <p className={styles.warningText}>
              O time ainda nao cadastrou imagens ou arquivos para este produto.
            </p>
          </div>
        )}
      </div>
    </details>
  );
}

function MaterialGroupCard({
  title,
  subtitle,
  assets,
}: {
  title: string;
  subtitle: string;
  assets: PartnerContentAsset[];
}) {
  return (
    <details className={styles.contentCategoryCard}>
      <summary className={styles.contentCategorySummary}>
        <div>
          <div className={styles.contentGroupEyebrow}>{subtitle}</div>
          <strong>{title}</strong>
        </div>
        <span>{assets.length} arquivo(s)</span>
      </summary>

      <div className={styles.contentAssetGrid}>
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>
    </details>
  );
}

function AssetCard({ asset }: { asset: PartnerContentAsset }) {
  return (
    <article className={styles.contentAssetCard}>
      <AssetPreview
        title={asset.title}
        imageUrl={asset.previewUrl || asset.fileUrl}
        tone={asset.scopeType}
      />
      <div className={styles.contentAssetMeta}>
        <div className={styles.contentAssetBadge}>{getCategoryLabel(asset.categoryKey)}</div>
        <strong>{asset.title}</strong>
        <p>{asset.description || getAssetTypeLabel(asset.assetType)}</p>
      </div>
      {asset.fileUrl ? (
        <a
          href={asset.fileUrl}
          target="_blank"
          rel="noreferrer"
          className={styles.primaryButton}
        >
          {asset.downloadLabel || "Baixar"}
        </a>
      ) : null}
    </article>
  );
}

function AssetPreview({
  title,
  imageUrl,
  tone,
  className,
}: {
  title: string;
  imageUrl: string;
  tone: "campaign" | "product" | "brand" | "template" | "idea";
  className?: string;
}) {
  if (imageUrl) {
    return (
      <div className={`${styles.contentAssetPreview} ${className || ""}`}>
        <img src={imageUrl} alt={title} className={styles.contentAssetImage} />
      </div>
    );
  }

  return (
    <div className={`${styles.contentAssetPreview} ${styles[`contentAssetPreview${capitalize(tone)}`]} ${className || ""}`}>
      <span>{title}</span>
    </div>
  );
}

function buildCategoryGroups(assets: PartnerContentAsset[]) {
  const grouped = new Map<string, PartnerContentAsset[]>();

  for (const asset of assets) {
    const current = grouped.get(asset.categoryKey) ?? [];
    current.push(asset);
    grouped.set(asset.categoryKey, current);
  }

  return Array.from(grouped.entries())
    .map(([key, items]) => ({
      key,
      title: getCategoryTitle(key),
      subtitle: getCategorySubtitle(key),
      assets: items.slice().sort((left, right) => left.sortOrder - right.sortOrder),
    }))
    .sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
}

function getCategoryLabel(categoryKey: string) {
  const labels: Record<string, string> = {
    story: "Story",
    feed: "Feed",
    pdf: "PDF",
    info: "Informacao",
    other: "Outro",
    png_front: "PNG frente",
    png_back: "PNG costas",
    photo_official: "Foto oficial",
    photo_model: "Foto com modelo",
    video: "Video",
    art: "Arte pronta",
    logos: "Logos",
    elements: "Elementos",
    backgrounds: "Fundos",
    story_9_16: "Stories 9:16",
    feed_4_5: "Feed 4:5",
    template_other: "Outros templates",
    treino: "Treino",
    cupom: "Cupom",
    unboxing: "Unboxing",
    look: "Look",
    lancamento: "Lancamento",
  };

  return labels[categoryKey] || categoryKey;
}

function getCategoryTitle(categoryKey: string) {
  const titles: Record<string, string> = {
    logos: "Logos oficiais",
    elements: "Elementos da marca",
    backgrounds: "Fundos",
    story_9_16: "Stories 9:16",
    feed_4_5: "Feed 4:5",
    template_other: "Outros templates",
  };

  return titles[categoryKey] || getCategoryLabel(categoryKey);
}

function getCategorySubtitle(categoryKey: string) {
  const subtitles: Record<string, string> = {
    logos: "Arquivos oficiais da identidade",
    elements: "Simbolos, icones e texturas",
    backgrounds: "Bases para stories, feed e composicoes",
    story_9_16: "Modelos verticais",
    feed_4_5: "Modelos para postagem",
    template_other: "Arquivos de apoio",
  };

  return subtitles[categoryKey] || "Biblioteca oficial";
}

function getAssetTypeLabel(assetType: string) {
  const labels: Record<string, string> = {
    image: "Imagem pronta para uso",
    video: "Video",
    pdf: "PDF",
    archive: "Arquivo",
    link: "Link",
    idea: "Ideia",
  };

  return labels[assetType] || assetType;
}

function formatPeriod(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) {
    return "Periodo livre";
  }

  if (startDate && endDate && startDate === endDate) {
    return formatDate(startDate);
  }

  return `${formatDate(startDate)} a ${formatDate(endDate)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
