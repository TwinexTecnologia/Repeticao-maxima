import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { getNuvemshopCredentials, NuvemshopApiError, NuvemshopClient } from "@/lib/nuvemshop/client";
import type { NuvemshopLocalizedText, NuvemshopOrder, NuvemshopProduct, NuvemshopVariant } from "@/lib/nuvemshop/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const RECENT_ORDERS_LIMIT = 30;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type VariantDetails = {
  id: number | string;
  sku: string;
  estoque: number;
  preco: string | null;
  promocional: string | null;
  tamanho: string;
  cor: string;
  estilo: string;
  atributos: Array<{ nome: string; valor: string }>;
};

type ProductCard = {
  id: number | string;
  nome: string;
  handle: string;
  imagem: string | null;
  publicado: boolean;
  estoqueTotal: number;
  totalVariantes: number;
  variantes: VariantDetails[];
};

type SalesPoint = {
  dia: string;
  total: number;
  pedidos: number;
};

function getLocalizedText(value: NuvemshopLocalizedText) {
  if (!value) {
    return "-";
  }

  if (typeof value === "string") {
    return value;
  }

  return value.pt || value.en || value.es || Object.values(value)[0] || "-";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseMoney(value?: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const amount = typeof value === "number" ? value : parseMoney(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function buildQueryString(
  filters: Record<string, string>,
  updates: Record<string, string>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...filters, ...updates })) {
    if (value) {
      params.set(key, value);
    }
  }

  return `?${params.toString()}`;
}

function getVariantDetails(product: NuvemshopProduct, variant: NuvemshopVariant): VariantDetails {
  const attributeNames = (product.attributes || []).map((value) => getLocalizedText(value));
  const attributes = (variant.values || []).map((value, index) => ({
    nome: attributeNames[index] || `Opcao ${index + 1}`,
    valor: getLocalizedText(value),
  }));

  let tamanho = "-";
  let cor = "-";
  let estilo = "-";

  for (const attribute of attributes) {
    const normalizedName = normalizeText(attribute.nome);

    if (normalizedName.includes("tamanho")) {
      tamanho = attribute.valor;
      continue;
    }

    if (normalizedName.includes("cor")) {
      cor = attribute.valor;
      continue;
    }

    if (normalizedName.includes("estilo")) {
      estilo = attribute.valor;
    }
  }

  return {
    id: variant.id,
    sku: variant.sku || "-",
    estoque: typeof variant.stock === "number" ? variant.stock : 0,
    preco: variant.price || null,
    promocional: variant.promotional_price || null,
    tamanho,
    cor,
    estilo,
    atributos: attributes,
  };
}

function buildProductCard(product: NuvemshopProduct): ProductCard {
  const variantes = (product.variants || []).map((variant) => getVariantDetails(product, variant));

  return {
    id: product.id,
    nome: getLocalizedText(product.name),
    handle: getLocalizedText(product.handle),
    imagem: product.images?.[0]?.src || null,
    publicado: Boolean(product.published),
    estoqueTotal: variantes.reduce((sum, variant) => sum + variant.estoque, 0),
    totalVariantes: variantes.length,
    variantes,
  };
}

async function fetchAllPages<T>(
  loader: (params: { page: number; perPage: number }) => Promise<T[]>,
) {
  const result: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await loader({ page, perPage: PAGE_SIZE });
    result.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return result;
}

function matchesDateRange(order: NuvemshopOrder, startDate: string, endDate: string) {
  if (!startDate && !endDate) {
    return true;
  }

  if (!order.created_at) {
    return false;
  }

  const createdAt = new Date(order.created_at);

  if (startDate) {
    const from = new Date(`${startDate}T00:00:00`);

    if (createdAt < from) {
      return false;
    }
  }

  if (endDate) {
    const to = new Date(`${endDate}T23:59:59`);

    if (createdAt > to) {
      return false;
    }
  }

  return true;
}

function hasCoupon(order: NuvemshopOrder) {
  return Array.isArray(order.coupon) && order.coupon.length > 0;
}

function getCouponLabel(order: NuvemshopOrder) {
  if (!hasCoupon(order)) {
    return "Nao";
  }

  return order.coupon
    ?.map((coupon) => coupon.code)
    .filter(Boolean)
    .join(", ") || "Sim";
}

export default async function NuvemshopPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const credentials = getNuvemshopCredentials();

  const filters = {
    startDate: getSearchValue(resolvedSearchParams, "startDate"),
    endDate: getSearchValue(resolvedSearchParams, "endDate"),
    couponMode: getSearchValue(resolvedSearchParams, "couponMode") || "all",
    couponQuery: getSearchValue(resolvedSearchParams, "couponQuery"),
    status: getSearchValue(resolvedSearchParams, "status"),
    productQuery: getSearchValue(resolvedSearchParams, "productQuery"),
    tamanho: getSearchValue(resolvedSearchParams, "tamanho"),
    cor: getSearchValue(resolvedSearchParams, "cor"),
    estilo: getSearchValue(resolvedSearchParams, "estilo"),
    selectedOrder: getSearchValue(resolvedSearchParams, "selectedOrder"),
  };

  if (!credentials.ok) {
    return (
      <AppShell
        title="Nuvemshop"
        subtitle="Configure as credenciais da loja para liberar o painel completo da integracao."
        currentPath="/integracoes/nuvemshop"
      >
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Credenciais pendentes</div>
            <p className={styles.warningText}>
              Falta preencher no `.env.local`: {credentials.missing.join(", ")}.
            </p>
          </div>
        </section>
      </AppShell>
    );
  }

  const client = new NuvemshopClient(credentials.credentials);

  const dashboard = await loadNuvemshopDashboard(client, filters);

  if (!dashboard.ok) {
    return (
      <AppShell
        title="Nuvemshop"
        subtitle="Painel da loja com vendas, estoque e pedidos."
        currentPath="/integracoes/nuvemshop"
      >
        <section className={styles.section}>
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Erro ao carregar a integracao</div>
            <p className={styles.warningText}>{dashboard.message}</p>
          </div>
        </section>
      </AppShell>
    );
  }

  const {
    categories,
    couponOrders,
    filteredOrders,
    filteredOrdersRevenue,
    filteredProductCards,
    productCards,
    recentOrders,
    salesByDay,
    sizeOptions,
    statusOptions,
    stockByColor,
    stockBySize,
    colorOptions,
    styleOptions,
    totalStock,
    totalVariants,
    averageTicket,
    selectedOrder,
    maxDailyRevenue,
  } = dashboard.data;

  const baseFilterValues = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    couponMode: filters.couponMode,
    couponQuery: filters.couponQuery,
    status: filters.status,
    productQuery: filters.productQuery,
    tamanho: filters.tamanho,
    cor: filters.cor,
    estilo: filters.estilo,
    selectedOrder: filters.selectedOrder,
  };

  return (
      <AppShell
        title="Nuvemshop"
        subtitle="Visao geral da loja com vendas, ticket, estoque, catalogo detalhado e pedidos recentes."
        currentPath="/integracoes/nuvemshop"
      >
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Filtros</div>
              <p className={styles.sectionSubtitle}>
                Filtre o dashboard por periodo, cupom, busca de produto, tamanho, cor e estilo.
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
              <span>Cupom</span>
              <select name="couponMode" defaultValue={filters.couponMode}>
                <option value="all">Todos</option>
                <option value="with">Com cupom</option>
                <option value="without">Sem cupom</option>
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Codigo do cupom</span>
              <input
                type="text"
                name="couponQuery"
                placeholder="Ex.: RM10"
                defaultValue={filters.couponQuery}
              />
            </label>
            <label className={styles.filterField}>
              <span>Status do pedido</span>
              <select name="status" defaultValue={filters.status}>
                <option value="">Todos</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Buscar produto</span>
              <input
                type="text"
                name="productQuery"
                placeholder="Nome, handle ou SKU"
                defaultValue={filters.productQuery}
              />
            </label>
            <label className={styles.filterField}>
              <span>Tamanho</span>
              <select name="tamanho" defaultValue={filters.tamanho}>
                <option value="">Todos</option>
                {sizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Cor</span>
              <select name="cor" defaultValue={filters.cor}>
                <option value="">Todas</option>
                {colorOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Estilo</span>
              <select name="estilo" defaultValue={filters.estilo}>
                <option value="">Todos</option>
                {styleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="selectedOrder" value={filters.selectedOrder} />
            <div className={styles.filterActions}>
              <button type="submit" className={styles.primaryButton}>
                Aplicar filtros
              </button>
              <a href="/integracoes/nuvemshop" className={styles.secondaryButton}>
                Limpar
              </a>
            </div>
          </form>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Vendas por dia</div>
              <p className={styles.sectionSubtitle}>
                Leitura visual do faturamento diario dentro do periodo filtrado.
              </p>
            </div>
          </div>

          {salesByDay.length > 0 ? (
            <div className={styles.chartGrid}>
              {salesByDay.map((point) => {
                const width = Math.max(
                  (point.total / Math.max(maxDailyRevenue, 1)) * 100,
                  point.total > 0 ? 8 : 2,
                );

                return (
                  <article key={point.dia} className={styles.chartRow}>
                    <div className={styles.chartLabel}>
                      <strong>{point.dia}</strong>
                      <span>{point.pedidos} pedidos</span>
                    </div>
                    <div className={styles.chartTrack}>
                      <div className={styles.chartBar} style={{ width: `${width}%` }} />
                    </div>
                    <div className={styles.chartValue}>{formatMoney(point.total)}</div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>Sem vendas no periodo para montar o grafico.</div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Visao geral</div>
              <p className={styles.sectionSubtitle}>
                KPI principal da loja, ja considerando o periodo e o filtro de cupom selecionados.
              </p>
            </div>
          </div>

          <div className={styles.metricGrid}>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Vendas no periodo</div>
              <div className={styles.metricValue}>{filteredOrders.length}</div>
              <div className={styles.metricHint}>Pedidos encontrados com os filtros atuais</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Faturamento</div>
              <div className={styles.metricValue}>{formatMoney(filteredOrdersRevenue)}</div>
              <div className={styles.metricHint}>Soma do total dos pedidos filtrados</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Ticket medio</div>
              <div className={styles.metricValue}>{formatMoney(averageTicket)}</div>
              <div className={styles.metricHint}>Media por pedido no periodo</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Pedidos com cupom</div>
              <div className={styles.metricValue}>{couponOrders}</div>
              <div className={styles.metricHint}>Uso de cupom dentro do filtro atual</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Produtos cadastrados</div>
              <div className={styles.metricValue}>{productCards.length}</div>
              <div className={styles.metricHint}>Produtos da loja</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Modelos / variacoes</div>
              <div className={styles.metricValue}>{totalVariants}</div>
              <div className={styles.metricHint}>Combinacoes de tamanho, cor e estilo</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Camisetas em estoque</div>
              <div className={styles.metricValue}>{totalStock}</div>
              <div className={styles.metricHint}>Soma do estoque atual das variacoes</div>
            </article>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Categorias</div>
              <div className={styles.metricValue}>{categories.length}</div>
              <div className={styles.metricHint}>Estrutura atual do catalogo</div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Distribuicao de estoque</div>
              <p className={styles.sectionSubtitle}>
                Quebra do estoque atual por cor e por tamanho para bater o olho rapido.
              </p>
            </div>
          </div>

          <div className={styles.stockSplitGrid}>
            <article className={styles.stockPanel}>
              <div className={styles.listTitle}>Por cor</div>
              <div className={styles.stockList}>
                {stockByColor.map((bucket) => (
                  <div key={bucket.nome} className={styles.stockRow}>
                    <span>{bucket.nome}</span>
                    <strong>{bucket.estoque}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className={styles.stockPanel}>
              <div className={styles.listTitle}>Por tamanho</div>
              <div className={styles.stockList}>
                {stockBySize.map((bucket) => (
                  <div key={bucket.nome} className={styles.stockRow}>
                    <span>{bucket.nome}</span>
                    <strong>{bucket.estoque}</strong>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Catalogo da Nuvemshop</div>
              <p className={styles.sectionSubtitle}>
                Estoque detalhado por produto e por variacao, com filtros por tamanho, cor e estilo.
              </p>
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chip}>Produtos visiveis: {filteredProductCards.length}</span>
              <span className={styles.chip}>
                Variacoes visiveis:{" "}
                {filteredProductCards.reduce(
                  (sum, product) => sum + product.variantesFiltradas.length,
                  0,
                )}
              </span>
            </div>
          </div>

          {filteredProductCards.length > 0 ? (
            <div className={styles.catalogStack}>
              {filteredProductCards.map((product) => (
                <article key={String(product.id)} className={styles.catalogDetailCard}>
                  <div className={styles.catalogDetailHeader}>
                    <div className={styles.catalogMedia}>
                      {product.imagem ? (
                        <img
                          src={product.imagem}
                          alt={product.nome}
                          className={styles.catalogImage}
                        />
                      ) : (
                        <div className={styles.catalogImagePlaceholder}>Sem foto</div>
                      )}
                      <div>
                        <div className={styles.metricLabel}>Produto #{product.id}</div>
                        <div className={styles.integrationTitle}>{product.nome}</div>
                        <p className={styles.integrationDescription}>
                          Handle: {product.handle}
                        </p>
                      </div>
                    </div>
                    <div className={styles.chipRow}>
                      <span
                        className={`${styles.pill} ${
                          product.publicado ? styles.pillLow : styles.pillMedium
                        }`}
                      >
                        {product.publicado ? "Publicado" : "Rascunho"}
                      </span>
                      <span className={styles.chip}>Estoque: {product.estoqueTotal}</span>
                      <span className={styles.chip}>
                        Variacoes: {product.variantesFiltradas.length}
                      </span>
                    </div>
                  </div>

                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Tamanho</th>
                          <th>Cor</th>
                          <th>Estilo</th>
                          <th>Estoque</th>
                          <th>Preco</th>
                          <th>Promocional</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.variantesFiltradas.map((variant) => (
                          <tr key={String(variant.id)}>
                            <td>{variant.sku}</td>
                            <td>{variant.tamanho}</td>
                            <td>{variant.cor}</td>
                            <td>{variant.estilo}</td>
                            <td>{variant.estoque}</td>
                            <td>{formatMoney(variant.preco)}</td>
                            <td>{formatMoney(variant.promocional)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              Nenhum produto encontrado com os filtros atuais.
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Pedidos recentes</div>
              <p className={styles.sectionSubtitle}>
                Mostra os pedidos mais recentes da loja, com status, pagamento, cupom e envio.
              </p>
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chip}>Mostrando: {recentOrders.length}</span>
              <span className={styles.chip}>Total filtrado: {filteredOrders.length}</span>
            </div>
          </div>

          {recentOrders.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Itens</th>
                    <th>Total</th>
                    <th>Pagamento</th>
                    <th>Cupom</th>
                    <th>Envio</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={String(order.id)}>
                      <td>
                        <a
                          href={buildQueryString(baseFilterValues, {
                            selectedOrder: String(order.id),
                          })}
                          className={styles.tableLink}
                        >
                          #{order.number}
                        </a>
                        <br />
                        {order.status || "-"}
                      </td>
                      <td>{formatDate(order.created_at)}</td>
                      <td>{order.customer?.name || order.contact_name || "-"}</td>
                      <td>{order.products?.length || 0}</td>
                      <td>{formatMoney(order.total)}</td>
                      <td>
                        {(order.payment_details?.method || order.gateway_name || "-") as string}
                        <br />
                        {order.payment_status || "-"}
                      </td>
                      <td>{getCouponLabel(order)}</td>
                      <td>
                        {order.shipping_status || "-"}
                        <br />
                        {order.shipping_option || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              Nenhum pedido encontrado com esse periodo e filtro de cupom.
            </div>
          )}
        </section>

        {filters.selectedOrder ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Detalhe do pedido</div>
                <p className={styles.sectionSubtitle}>
                  Leitura completa do pedido selecionado, com itens, cupom, pagamento e envio.
                </p>
              </div>
              <a
                href={buildQueryString(baseFilterValues, { selectedOrder: "" })}
                className={styles.secondaryButton}
              >
                Fechar detalhe
              </a>
            </div>

            {selectedOrder ? (
              <div className={styles.orderDetailLayout}>
                <div className={styles.definitionGrid}>
                  <article className={styles.definitionCard}>
                    <div className={styles.metricLabel}>Pedido</div>
                    <div className={styles.integrationTitle}>#{selectedOrder.number}</div>
                    <p className={styles.integrationDescription}>{selectedOrder.status || "-"}</p>
                  </article>
                  <article className={styles.definitionCard}>
                    <div className={styles.metricLabel}>Pagamento</div>
                    <div className={styles.integrationTitle}>
                      {selectedOrder.payment_details?.method || selectedOrder.gateway_name || "-"}
                    </div>
                    <p className={styles.integrationDescription}>
                      {selectedOrder.payment_status || "-"} |{" "}
                      {selectedOrder.payment_details?.installments || 1}x
                    </p>
                  </article>
                  <article className={styles.definitionCard}>
                    <div className={styles.metricLabel}>Cupom</div>
                    <div className={styles.integrationTitle}>{getCouponLabel(selectedOrder)}</div>
                    <p className={styles.integrationDescription}>
                      Total: {formatMoney(selectedOrder.total)}
                    </p>
                  </article>
                </div>

                <div className={styles.twoColumn}>
                  <div className={styles.list}>
                    <article className={styles.listItem}>
                      <div className={styles.listTitle}>Cliente</div>
                      <p className={styles.listDetail}>
                        {selectedOrder.customer?.name || selectedOrder.contact_name || "-"}
                      </p>
                      <p className={styles.listDetail}>
                        {selectedOrder.customer?.email || selectedOrder.contact_email || "-"}
                      </p>
                    </article>
                    <article className={styles.listItem}>
                      <div className={styles.listTitle}>Entrega</div>
                      <p className={styles.listDetail}>
                        {selectedOrder.shipping_status || "-"} | {selectedOrder.shipping_option || "-"}
                      </p>
                    </article>
                  </div>
                  <div className={styles.list}>
                    <article className={styles.listItem}>
                      <div className={styles.listTitle}>Datas</div>
                      <p className={styles.listDetail}>
                        Criado: {formatDate(selectedOrder.created_at)}
                      </p>
                      <p className={styles.listDetail}>
                        Pago: {formatDate(selectedOrder.paid_at)}
                      </p>
                      <p className={styles.listDetail}>
                        Enviado: {formatDate(selectedOrder.shipped_at)}
                      </p>
                    </article>
                  </div>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Variacao</th>
                        <th>Quantidade</th>
                        <th>Preco</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedOrder.products || []).map((item) => (
                        <tr key={String(item.id)}>
                          <td>{item.name || "-"}</td>
                          <td>{(item.variant_values || []).join(" / ") || "-"}</td>
                          <td>{item.quantity || 0}</td>
                          <td>{formatMoney(item.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={styles.emptyState}>Pedido nao encontrado no filtro atual.</div>
            )}
          </section>
        ) : null}
      </AppShell>
    );
}

async function loadNuvemshopDashboard(
  client: NuvemshopClient,
  filters: {
    startDate: string;
    endDate: string;
    couponMode: string;
    couponQuery: string;
    status: string;
    productQuery: string;
    tamanho: string;
    cor: string;
    estilo: string;
    selectedOrder: string;
  },
) {
  try {
    const [products, categories, orders] = await Promise.all([
      fetchAllPages((params) => client.listProducts(params)),
      fetchAllPages((params) => client.listCategories(params)),
      fetchAllPages((params) => client.listOrders(params)),
    ]);

    const productCards = products.map(buildProductCard);
    const sizeOptions = Array.from(
      new Set(
        productCards.flatMap((product) =>
          product.variantes
            .map((variant) => variant.tamanho)
            .filter((value) => value && value !== "-"),
        ),
      ),
    ).sort();
    const colorOptions = Array.from(
      new Set(
        productCards.flatMap((product) =>
          product.variantes
            .map((variant) => variant.cor)
            .filter((value) => value && value !== "-"),
        ),
      ),
    ).sort();
    const styleOptions = Array.from(
      new Set(
        productCards.flatMap((product) =>
          product.variantes
            .map((variant) => variant.estilo)
            .filter((value) => value && value !== "-"),
        ),
      ),
    ).sort();

    const filteredOrders = [...orders]
      .filter((order) => matchesDateRange(order, filters.startDate, filters.endDate))
      .filter((order) => {
        if (!filters.status) {
          return true;
        }

        return normalizeText(order.status || "") === normalizeText(filters.status);
      })
      .filter((order) => {
        if (filters.couponMode === "with") {
          return hasCoupon(order);
        }

        if (filters.couponMode === "without") {
          return !hasCoupon(order);
        }

        return true;
      })
      .filter((order) => {
        if (!filters.couponQuery) {
          return true;
        }

        return normalizeText(getCouponLabel(order)).includes(
          normalizeText(filters.couponQuery),
        );
      })
      .sort((left, right) => {
        const leftDate = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightDate = right.created_at ? new Date(right.created_at).getTime() : 0;
        return rightDate - leftDate;
      });

    const filteredProductCards = productCards
      .map((product) => {
        const filteredVariants = product.variantes.filter((variant) => {
          if (
            filters.tamanho &&
            normalizeText(variant.tamanho) !== normalizeText(filters.tamanho)
          ) {
            return false;
          }

          if (filters.cor && normalizeText(variant.cor) !== normalizeText(filters.cor)) {
            return false;
          }

          if (
            filters.estilo &&
            normalizeText(variant.estilo) !== normalizeText(filters.estilo)
          ) {
            return false;
          }

          return true;
        });

        const searchText = [
          product.nome,
          product.handle,
          ...product.variantes.flatMap((variant) => [
            variant.sku,
            variant.tamanho,
            variant.cor,
            variant.estilo,
          ]),
        ].join(" ");

        const matchesSearch = !filters.productQuery
          ? true
          : normalizeText(searchText).includes(normalizeText(filters.productQuery));

        if (!matchesSearch) {
          return null;
        }

        if (
          (filters.tamanho || filters.cor || filters.estilo) &&
          filteredVariants.length === 0
        ) {
          return null;
        }

        return {
          ...product,
          variantesFiltradas:
            filters.tamanho || filters.cor || filters.estilo
              ? filteredVariants
              : product.variantes,
        };
      })
      .filter(Boolean) as Array<ProductCard & { variantesFiltradas: VariantDetails[] }>;

    const filteredOrdersRevenue = filteredOrders.reduce(
      (sum, order) => sum + parseMoney(order.total),
      0,
    );
    const salesByDayMap = new Map<string, SalesPoint>();

    for (const order of filteredOrders) {
      const dia = order.created_at
        ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
            new Date(order.created_at),
          )
        : "Sem data";
      const current = salesByDayMap.get(dia) || { dia, total: 0, pedidos: 0 };
      current.total += parseMoney(order.total);
      current.pedidos += 1;
      salesByDayMap.set(dia, current);
    }

    const salesByDay = Array.from(salesByDayMap.values()).sort((left, right) => {
      const parse = (value: string) => {
        if (value === "Sem data") {
          return 0;
        }

        const [day, month, year] = value.split("/");
        const parsedYear = year?.length === 2 ? Number(`20${year}`) : Number(year);
        return new Date(parsedYear, Number(month) - 1, Number(day)).getTime();
      };

      return parse(left.dia) - parse(right.dia);
    });

    const stockColorMap = new Map<string, number>();
    const stockSizeMap = new Map<string, number>();

    for (const product of productCards) {
      for (const variant of product.variantes) {
        if (variant.cor !== "-") {
          stockColorMap.set(variant.cor, (stockColorMap.get(variant.cor) || 0) + variant.estoque);
        }

        if (variant.tamanho !== "-") {
          stockSizeMap.set(
            variant.tamanho,
            (stockSizeMap.get(variant.tamanho) || 0) + variant.estoque,
          );
        }
      }
    }

    const stockByColor = Array.from(stockColorMap.entries())
      .map(([nome, estoque]) => ({ nome, estoque }))
      .sort((left, right) => right.estoque - left.estoque);
    const stockBySize = Array.from(stockSizeMap.entries())
      .map(([nome, estoque]) => ({ nome, estoque }))
      .sort((left, right) => right.estoque - left.estoque);

    const averageTicket =
      filteredOrders.length > 0 ? filteredOrdersRevenue / filteredOrders.length : 0;
    const totalStock = productCards.reduce((sum, product) => sum + product.estoqueTotal, 0);
    const totalVariants = productCards.reduce((sum, product) => sum + product.totalVariantes, 0);
    const couponOrders = filteredOrders.filter((order) => hasCoupon(order)).length;
    const recentOrders = filteredOrders.slice(0, RECENT_ORDERS_LIMIT);
    const statusOptions = Array.from(
      new Set(orders.map((order) => order.status).filter(Boolean) as string[]),
    ).sort();
    const selectedOrder =
      filteredOrders.find((order) => String(order.id) === filters.selectedOrder) || null;
    const maxDailyRevenue = salesByDay.reduce(
      (maxValue, point) => Math.max(maxValue, point.total),
      0,
    );

    return {
      ok: true as const,
      data: {
        averageTicket,
        categories,
        colorOptions,
        couponOrders,
        filteredOrders,
        filteredOrdersRevenue,
        filteredProductCards,
        maxDailyRevenue,
        productCards,
        recentOrders,
        salesByDay,
        selectedOrder,
        sizeOptions,
        statusOptions,
        stockByColor,
        stockBySize,
        styleOptions,
        totalStock,
        totalVariants,
      },
    };
  } catch (error) {
    const message =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : "Nao foi possivel carregar os dados da Nuvemshop.";

    return {
      ok: false as const,
      message,
    };
  }
}
