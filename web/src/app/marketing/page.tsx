import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import {
  formatDateTime,
  formatMoney,
  getMarketingFilters,
  loadMarketingModuleData,
} from "@/lib/marketing/repository";

const DISPLAY_LIMIT = 100;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MarketingPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const filters = getMarketingFilters(resolvedSearchParams);
  const data = await loadMarketingModuleData(filters);
  const salesPreview = data.salesRows.slice(0, DISPLAY_LIMIT);
  const abandonedPreview = data.abandonedRows.slice(0, DISPLAY_LIMIT);
  const salesStatusOptions = Array.from(
    new Set(data.salesRows.map((row) => row.status).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
  const exportQuery = buildExportQuery(filters);

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
          <div className={styles.filterActions}>
            <a
              href={`/api/marketing/vendas/export?${exportQuery}`}
              className={styles.primaryButton}
            >
              Exportar CSV de vendas
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
            <div className={styles.callout}>
              <h3>Preview da planilha</h3>
              <p>
                A tela mostra as primeiras {DISPLAY_LIMIT} linhas. A exportacao baixa a base
                completa conforme o filtro aplicado.
              </p>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Data</th>
                    <th>Comprador</th>
                    <th>Contato</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Cupom</th>
                    <th>Itens</th>
                  </tr>
                </thead>
                <tbody>
                  {salesPreview.map((row) => (
                    <tr key={row.orderId}>
                      <td>{row.orderNumber}</td>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td className={styles.tableCellTight}>
                        <strong>{row.buyerName || "-"}</strong>
                        <div>{row.buyerDocument || "Sem documento"}</div>
                      </td>
                      <td className={styles.tableCellTight}>
                        <strong>{row.buyerEmail || "-"}</strong>
                        <div>{row.buyerPhone || "Sem telefone"}</div>
                      </td>
                      <td className={styles.tableCellTight}>
                        <strong>{row.status}</strong>
                        <div>{row.paymentStatus}</div>
                      </td>
                      <td>{formatMoney(row.total)}</td>
                      <td>{row.couponCode || "-"}</td>
                      <td className={styles.tableCellTight}>
                        <strong>{row.itemsLabel || "-"}</strong>
                        <div>{row.shippingOption || "Sem envio"}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          <div className={styles.filterActions}>
            <a
              href={`/api/marketing/carrinhos-abandonados/export?${exportQuery}`}
              className={styles.primaryButton}
            >
              Exportar CSV de abandonos
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
            <div className={styles.callout}>
              <h3>Preview da planilha</h3>
              <p>
                A leitura mostra as primeiras {DISPLAY_LIMIT} linhas. O arquivo exportado leva o
                resultado completo do filtro.
              </p>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Checkout</th>
                    <th>Data</th>
                    <th>Comprador</th>
                    <th>Contato</th>
                    <th>Total potencial</th>
                    <th>Cupom</th>
                    <th>Recuperacao</th>
                  </tr>
                </thead>
                <tbody>
                  {abandonedPreview.map((row) => (
                    <tr key={row.checkoutId}>
                      <td>{row.checkoutId}</td>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td className={styles.tableCellTight}>
                        <strong>{row.buyerName || "-"}</strong>
                        <div>{row.buyerDocument || "Sem documento"}</div>
                      </td>
                      <td className={styles.tableCellTight}>
                        <strong>{row.buyerEmail || "-"}</strong>
                        <div>{row.buyerPhone || "Sem telefone"}</div>
                      </td>
                      <td>{formatMoney(row.total)}</td>
                      <td>{row.couponCode || "-"}</td>
                      <td className={styles.tableCellTight}>
                        {row.recoveryUrl ? (
                          <>
                            <strong>Link disponivel</strong>
                            <div>
                              <a
                                href={row.recoveryUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.tableLink}
                              >
                                Abrir checkout
                              </a>
                            </div>
                          </>
                        ) : (
                          <strong>Sem link</strong>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>Nenhum carrinho abandonado encontrado nesse filtro.</div>
        )}
      </section>
    </AppShell>
  );
}

function buildExportQuery(filters: {
  startDate: string;
  endDate: string;
  buyerQuery: string;
  salesStatus: string;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  return params.toString();
}
