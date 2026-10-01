import { AppShell } from "@/components/app-shell";
import { MarketingPreviewTable } from "@/components/marketing-preview-table";
import styles from "@/components/panel.module.css";
import {
  formatDateTime,
  formatMoney,
  getMarketingFilters,
  loadMarketingModuleData,
} from "@/lib/marketing/repository";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MarketingPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const filters = getMarketingFilters(resolvedSearchParams);
  const data = await loadMarketingModuleData(filters);
  const salesStatusOptions = Array.from(
    new Set(data.salesRows.map((row) => row.status).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
  const salesExportCsvHref = buildExportHref(
    "/api/marketing/vendas/export",
    filters,
    "csv",
  );
  const salesExportXlsxHref = buildExportHref(
    "/api/marketing/vendas/export",
    filters,
    "xlsx",
  );
  const abandonedExportCsvHref = buildExportHref(
    "/api/marketing/carrinhos-abandonados/export",
    filters,
    "csv",
  );
  const abandonedExportXlsxHref = buildExportHref(
    "/api/marketing/carrinhos-abandonados/export",
    filters,
    "xlsx",
  );
  const salesPreviewRows = data.salesRows.map((row) => ({
    id: row.orderId,
    cells: [
      { primary: row.orderNumber },
      { primary: formatDateTime(row.createdAt) },
      {
        primary: row.buyerName || "-",
        secondary: row.buyerDocument || "Sem documento",
      },
      {
        primary: row.buyerEmail || "-",
        secondary: row.buyerPhone || "Sem telefone",
      },
      {
        primary: row.status,
        secondary: row.paymentStatus,
      },
      { primary: formatMoney(row.total) },
      { primary: row.couponCode || "-" },
      {
        primary: row.itemsLabel || "-",
        secondary: row.shippingOption || "Sem envio",
      },
    ],
  }));
  const abandonedPreviewRows = data.abandonedRows.map((row) => ({
    id: row.checkoutId,
    cells: [
      { primary: row.checkoutId },
      { primary: formatDateTime(row.createdAt) },
      {
        primary: row.buyerName || "-",
        secondary: row.buyerDocument || "Sem documento",
      },
      {
        primary: row.buyerEmail || "-",
        secondary: row.buyerPhone || "Sem telefone",
      },
      { primary: formatMoney(row.total) },
      { primary: row.couponCode || "-" },
      row.recoveryUrl
        ? {
            primary: "Link disponivel",
            secondary: row.shippingOption || "Sem envio",
            href: row.recoveryUrl,
            hrefLabel: "Abrir checkout",
          }
        : {
            primary: "Sem link",
            secondary: row.shippingOption || "Sem envio",
          },
    ],
  }));

  return (
    <AppShell
      title="Marketing"
      subtitle="Planilhas exportaveis com vendas da loja e carrinhos abandonados para acao comercial."
      currentPath="/marketing"
    >
      {data.credentialsMessage ? (
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Credenciais pendentes</div>
            <p className={styles.warningText}>{data.credentialsMessage}</p>
          </div>
        </section>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Filtros da planilha</div>
            <p className={styles.sectionSubtitle}>
              Filtre por periodo, status e comprador antes de exportar ou conferir os dados.
            </p>
          </div>
        </div>

        <form className={styles.filterGrid} method="get">
          <label className={styles.filterField}>
            <span>Data inicial</span>
            <input type="date" name="startDate" defaultValue={filters.startDate} />
          </label>
          <label className={styles.filterField}>
            <span>Data final</span>
            <input type="date" name="endDate" defaultValue={filters.endDate} />
          </label>
          <label className={styles.filterField}>
            <span>Status da venda</span>
            <select name="salesStatus" defaultValue={filters.salesStatus}>
              <option value="">Todos</option>
              {salesStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Buscar comprador</span>
            <input
              type="text"
              name="buyerQuery"
              defaultValue={filters.buyerQuery}
              placeholder="Nome, e-mail, telefone, documento ou cupom"
            />
          </label>
          <div className={styles.filterActions}>
            <button type="submit" className={styles.primaryButton}>
              Aplicar filtros
            </button>
            <a href="/marketing" className={styles.secondaryButton}>
              Limpar
            </a>
          </div>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Resumo rapido</div>
            <p className={styles.sectionSubtitle}>
              Leitura imediata do volume de vendas e da base recuperavel de carrinhos abandonados.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Vendas filtradas</div>
            <div className={styles.metricValue}>{data.summary.salesCount}</div>
            <div className={styles.metricHint}>Pedidos disponiveis para exportacao.</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Faturamento filtrado</div>
            <div className={styles.metricValue}>{formatMoney(data.summary.salesTotal)}</div>
            <div className={styles.metricHint}>Soma do total das vendas do filtro atual.</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Compradores unicos</div>
            <div className={styles.metricValue}>{data.summary.buyersCount}</div>
            <div className={styles.metricHint}>Base de pessoas distintas por e-mail.</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Carrinhos abandonados</div>
            <div className={styles.metricValue}>{data.summary.abandonedCount}</div>
            <div className={styles.metricHint}>Checkout parado no segundo passo da compra.</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Receita potencial</div>
            <div className={styles.metricValue}>
              {formatMoney(data.summary.abandonedPotentialTotal)}
            </div>
            <div className={styles.metricHint}>Total potencial desses abandonos.</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Abandonos com e-mail</div>
            <div className={styles.metricValue}>{data.summary.abandonedWithEmail}</div>
            <div className={styles.metricHint}>Contatos prontos para acao comercial.</div>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Planilha de vendas</div>
            <p className={styles.sectionSubtitle}>
              Exporta todas as vendas com dados pessoais do comprador, status e itens do pedido.
            </p>
          </div>
          <div className={styles.exportActions}>
            <a
              href={salesExportCsvHref}
              className={styles.primaryButton}
            >
              Exportar CSV
            </a>
            <a
              href={salesExportXlsxHref}
              className={styles.secondaryButton}
            >
              Exportar XLSX
            </a>
          </div>
        </div>

        {data.salesError ? (
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Falha nas vendas</div>
            <p className={styles.warningText}>{data.salesError}</p>
          </div>
        ) : data.salesRows.length > 0 ? (
          <>
            <MarketingPreviewTable
              headers={[
                "Pedido",
                "Data",
                "Comprador",
                "Contato",
                "Status",
                "Total",
                "Cupom",
                "Itens",
              ]}
              rows={salesPreviewRows}
              previewLabel="Clique em ver mais para abrir de 10 em 10. A exportacao baixa a base completa conforme o filtro."
            />
          </>
        ) : (
          <div className={styles.emptyState}>Nenhuma venda encontrada para esse filtro.</div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Planilha de carrinhos abandonados</div>
            <p className={styles.sectionSubtitle}>
              Base pronta para recuperacao com link do checkout, valor potencial e contato do cliente.
            </p>
          </div>
          <div className={styles.exportActions}>
            <a
              href={abandonedExportCsvHref}
              className={styles.primaryButton}
            >
              Exportar CSV
            </a>
            <a
              href={abandonedExportXlsxHref}
              className={styles.secondaryButton}
            >
              Exportar XLSX
            </a>
          </div>
        </div>

        {data.abandonedError ? (
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Falha nos abandonos</div>
            <p className={styles.warningText}>{data.abandonedError}</p>
          </div>
        ) : data.abandonedRows.length > 0 ? (
          <>
            <MarketingPreviewTable
              headers={[
                "Checkout",
                "Data",
                "Comprador",
                "Contato",
                "Total potencial",
                "Cupom",
                "Recuperacao",
              ]}
              rows={abandonedPreviewRows}
              previewLabel="Clique em ver mais para abrir de 10 em 10. A exportacao baixa toda a base filtrada."
            />
          </>
        ) : (
          <div className={styles.emptyState}>Nenhum carrinho abandonado encontrado nesse filtro.</div>
        )}
      </section>
    </AppShell>
  );
}

function buildExportHref(
  basePath: string,
  filters: {
    startDate: string;
    endDate: string;
    buyerQuery: string;
    salesStatus: string;
  },
  format: "csv" | "xlsx",
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  params.set("format", format);
  return `${basePath}?${params.toString()}`;
}
