import { getNuvemshopCredentials, NuvemshopApiError, NuvemshopClient } from "@/lib/nuvemshop/client";
import type {
  NuvemshopAbandonedCheckout,
  NuvemshopOrder,
} from "@/lib/nuvemshop/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 12;

export type MarketingFilters = {
  startDate: string;
  endDate: string;
  buyerQuery: string;
  salesStatus: string;
};

export type MarketingSaleRow = {
  orderId: string;
  orderNumber: string;
  createdAt: string | null;
  status: string;
  paymentStatus: string;
  shippingStatus: string;
  total: number;
  discount: number;
  couponCode: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerDocument: string;
  gateway: string;
  paymentMethod: string;
  shippingOption: string;
  shippingCarrier: string;
  shippingCity: string;
  shippingProvince: string;
  itemsLabel: string;
};

export type MarketingAbandonedRow = {
  checkoutId: string;
  createdAt: string | null;
  updatedAt: string | null;
  recoveryUrl: string;
  total: number;
  discount: number;
  couponCode: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerDocument: string;
  shippingOption: string;
  gateway: string;
  shippingCity: string;
  shippingProvince: string;
  shippingCountry: string;
};

export type MarketingModuleData = {
  credentialsMessage: string | null;
  salesError: string | null;
  abandonedError: string | null;
  salesRows: MarketingSaleRow[];
  abandonedRows: MarketingAbandonedRow[];
  summary: {
    salesCount: number;
    salesTotal: number;
    buyersCount: number;
    abandonedCount: number;
    abandonedPotentialTotal: number;
    abandonedWithEmail: number;
  };
};

export type MarketingExportRow = Record<string, string | number>;

export function getMarketingFilters(
  searchParams: Record<string, string | string[] | undefined>,
): MarketingFilters {
  return {
    startDate: getSearchValue(searchParams, "startDate"),
    endDate: getSearchValue(searchParams, "endDate"),
    buyerQuery: getSearchValue(searchParams, "buyerQuery"),
    salesStatus: getSearchValue(searchParams, "salesStatus"),
  };
}

export async function loadMarketingModuleData(
  filters: MarketingFilters,
): Promise<MarketingModuleData> {
  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return {
      credentialsMessage: `Falta preencher no .env.local: ${credentials.missing.join(", ")}.`,
      salesError: null,
      abandonedError: null,
      salesRows: [],
      abandonedRows: [],
      summary: {
        salesCount: 0,
        salesTotal: 0,
        buyersCount: 0,
        abandonedCount: 0,
        abandonedPotentialTotal: 0,
        abandonedWithEmail: 0,
      },
    };
  }

  const client = new NuvemshopClient(credentials.credentials);

  const [ordersResult, abandonedResult] = await Promise.allSettled([
    fetchAllPages((params) => client.listOrders(params)),
    fetchAllPages((params) => client.listAbandonedCheckouts(params)),
  ]);

  const salesRows =
    ordersResult.status === "fulfilled"
      ? buildSalesRows(ordersResult.value, filters)
      : [];
  const abandonedRows =
    abandonedResult.status === "fulfilled"
      ? buildAbandonedRows(abandonedResult.value, filters)
      : [];

  return {
    credentialsMessage: null,
    salesError:
      ordersResult.status === "rejected"
        ? getFriendlyErrorMessage(ordersResult.reason, "vendas")
        : null,
    abandonedError:
      abandonedResult.status === "rejected"
        ? getFriendlyErrorMessage(abandonedResult.reason, "carrinhos abandonados")
        : null,
    salesRows,
    abandonedRows,
    summary: {
      salesCount: salesRows.length,
      salesTotal: salesRows.reduce((sum, row) => sum + row.total, 0),
      buyersCount: new Set(
        salesRows
          .map((row) => row.buyerEmail.trim().toLowerCase())
          .filter(Boolean),
      ).size,
      abandonedCount: abandonedRows.length,
      abandonedPotentialTotal: abandonedRows.reduce((sum, row) => sum + row.total, 0),
      abandonedWithEmail: abandonedRows.filter((row) => row.buyerEmail).length,
    },
  };
}

export function buildSalesCsv(rows: MarketingSaleRow[]) {
  const exportRows = buildSalesExportRows(rows);
  return buildCsv(
    Object.keys(exportRows[0] ?? {}),
    exportRows.map((row) =>
      Object.values(row).map((value) =>
        typeof value === "number" ? formatCsvNumber(value) : String(value),
      ),
    ),
  );
}

export function buildAbandonedCsv(rows: MarketingAbandonedRow[]) {
  const exportRows = buildAbandonedExportRows(rows);
  return buildCsv(
    Object.keys(exportRows[0] ?? {}),
    exportRows.map((row) =>
      Object.values(row).map((value) =>
        typeof value === "number" ? formatCsvNumber(value) : String(value),
      ),
    ),
  );
}

export function buildSalesExportRows(rows: MarketingSaleRow[]): MarketingExportRow[] {
  return rows.map((row) => ({
    Pedido: row.orderNumber,
    Data: formatDateTime(row.createdAt),
    Status: row.status,
    Pagamento: row.paymentStatus,
    Envio: row.shippingStatus,
    Total: row.total,
    Desconto: row.discount,
    Cupom: row.couponCode,
    Comprador: row.buyerName,
    Email: row.buyerEmail,
    Telefone: row.buyerPhone,
    Documento: row.buyerDocument,
    Gateway: row.gateway,
    "Metodo pagamento": row.paymentMethod,
    "Opcao envio": row.shippingOption,
    Transportadora: row.shippingCarrier,
    Cidade: row.shippingCity,
    Estado: row.shippingProvince,
    Itens: row.itemsLabel,
  }));
}

export function buildAbandonedExportRows(
  rows: MarketingAbandonedRow[],
): MarketingExportRow[] {
  return rows.map((row) => ({
    Checkout: row.checkoutId,
    "Criado em": formatDateTime(row.createdAt),
    "Atualizado em": formatDateTime(row.updatedAt),
    "Link recuperacao": row.recoveryUrl,
    "Total potencial": row.total,
    Desconto: row.discount,
    Cupom: row.couponCode,
    Comprador: row.buyerName,
    Email: row.buyerEmail,
    Telefone: row.buyerPhone,
    Documento: row.buyerDocument,
    Gateway: row.gateway,
    "Opcao envio": row.shippingOption,
    Cidade: row.shippingCity,
    Estado: row.shippingProvince,
    Pais: row.shippingCountry,
  }));
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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

function buildSalesRows(orders: NuvemshopOrder[], filters: MarketingFilters) {
  return orders
    .filter((order) => matchesDateRange(order.created_at, filters.startDate, filters.endDate))
    .filter((order) =>
      filters.salesStatus
        ? normalizeText(order.status || "") === normalizeText(filters.salesStatus)
        : true,
    )
    .filter((order) => matchesBuyerQuery(buildSalesSearchText(order), filters.buyerQuery))
    .sort(sortByDateDesc)
    .map((order) => ({
      orderId: String(order.id ?? ""),
      orderNumber: order.number ? `#${order.number}` : String(order.id ?? "-"),
      createdAt: order.created_at || null,
      status: String(order.status ?? "-"),
      paymentStatus: String(order.payment_status ?? "-"),
      shippingStatus: String(order.shipping_status ?? "-"),
      total: parseMoney(order.total),
      discount: parseMoney(order.discount),
      couponCode: getCouponLabel(order.coupon),
      buyerName: firstNonEmpty(
        readNestedString(order, ["customer", "name"]),
        order.contact_name,
      ),
      buyerEmail: firstNonEmpty(
        readNestedString(order, ["customer", "email"]),
        order.contact_email,
      ),
      buyerPhone: firstNonEmpty(
        readNestedString(order, ["customer", "phone"]),
        readNestedString(order, ["billing_phone"]),
      ),
      buyerDocument: firstNonEmpty(
        readNestedString(order, ["customer", "identification"]),
        readNestedString(order, ["contact_identification"]),
      ),
      gateway: firstNonEmpty(order.gateway_name, order.gateway),
      paymentMethod: firstNonEmpty(
        readNestedString(order, ["payment_details", "method"]),
        order.gateway_name,
      ),
      shippingOption: firstNonEmpty(order.shipping_option),
      shippingCarrier: firstNonEmpty(order.shipping_carrier_name),
      shippingCity: firstNonEmpty(readNestedString(order, ["shipping_address", "city"])),
      shippingProvince: firstNonEmpty(
        readNestedString(order, ["shipping_address", "province"]),
      ),
      itemsLabel: (order.products || [])
        .map((item) => `${item.name || "Produto"} x${item.quantity || 0}`)
        .join(" | "),
    }));
}

function buildAbandonedRows(
  checkouts: NuvemshopAbandonedCheckout[],
  filters: MarketingFilters,
) {
  return checkouts
    .filter((checkout) =>
      matchesDateRange(checkout.created_at, filters.startDate, filters.endDate),
    )
    .filter((checkout) => matchesBuyerQuery(buildAbandonedSearchText(checkout), filters.buyerQuery))
    .sort(sortByDateDesc)
    .map((checkout) => ({
      checkoutId: String(checkout.id ?? ""),
      createdAt: checkout.created_at || null,
      updatedAt: checkout.updated_at || null,
      recoveryUrl: String(checkout.abandoned_checkout_url ?? "").trim(),
      total: parseMoney(checkout.total),
      discount: parseMoney(checkout.discount),
      couponCode: getCouponLabel(checkout.coupon),
      buyerName: firstNonEmpty(checkout.contact_name),
      buyerEmail: firstNonEmpty(checkout.contact_email),
      buyerPhone: firstNonEmpty(checkout.contact_phone),
      buyerDocument: firstNonEmpty(checkout.contact_identification),
      shippingOption: firstNonEmpty(checkout.shipping_option),
      gateway: firstNonEmpty(checkout.gateway),
      shippingCity: firstNonEmpty(checkout.shipping_city),
      shippingProvince: firstNonEmpty(checkout.shipping_province),
      shippingCountry: firstNonEmpty(checkout.shipping_country),
    }));
}

function buildSalesSearchText(order: NuvemshopOrder) {
  return [
    order.number,
    order.contact_name,
    order.contact_email,
    readNestedString(order, ["customer", "name"]),
    readNestedString(order, ["customer", "email"]),
    readNestedString(order, ["customer", "phone"]),
    readNestedString(order, ["customer", "identification"]),
    getCouponLabel(order.coupon),
  ]
    .filter(Boolean)
    .join(" ");
}

function buildAbandonedSearchText(checkout: NuvemshopAbandonedCheckout) {
  return [
    checkout.id,
    checkout.contact_name,
    checkout.contact_email,
    checkout.contact_phone,
    checkout.contact_identification,
    getCouponLabel(checkout.coupon),
  ]
    .filter(Boolean)
    .join(" ");
}

function getCouponLabel(
  coupon:
    | Array<{
        code?: string | null;
      }>
    | null
    | undefined,
) {
  return (
    coupon
      ?.map((item) => String(item.code ?? "").trim())
      .filter(Boolean)
      .join(", ") || ""
  );
}

function matchesDateRange(value: string | null | undefined, startDate: string, endDate: string) {
  if (!startDate && !endDate) {
    return true;
  }

  if (!value) {
    return false;
  }

  const current = new Date(value);

  if (startDate) {
    const from = new Date(`${startDate}T00:00:00`);

    if (current < from) {
      return false;
    }
  }

  if (endDate) {
    const to = new Date(`${endDate}T23:59:59`);

    if (current > to) {
      return false;
    }
  }

  return true;
}

function matchesBuyerQuery(searchText: string, buyerQuery: string) {
  if (!buyerQuery) {
    return true;
  }

  return normalizeText(searchText).includes(normalizeText(buyerQuery));
}

function parseMoney(value?: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function sortByDateDesc(
  left: { created_at?: string | null },
  right: { created_at?: string | null },
) {
  const leftDate = left.created_at ? new Date(left.created_at).getTime() : 0;
  const rightDate = right.created_at ? new Date(right.created_at).getTime() : 0;
  return rightDate - leftDate;
}

function readNestedString(source: unknown, path: string[]) {
  let current: unknown = source;

  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return "";
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current.trim() : "";
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
}

function buildCsv(headers: string[], rows: string[][]) {
  const lines = [headers, ...rows]
    .map((columns) => columns.map(escapeCsvValue).join(";"))
    .join("\r\n");

  return `\uFEFF${lines}`;
}

function escapeCsvValue(value: string) {
  const normalized = String(value ?? "");
  return `"${normalized.replace(/"/g, '""')}"`;
}

function formatCsvNumber(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function getFriendlyErrorMessage(error: unknown, label: string) {
  if (error instanceof NuvemshopApiError) {
    return `Nao foi possivel carregar ${label}: ${error.message} (${error.status}).`;
  }

  if (error instanceof Error) {
    return `Nao foi possivel carregar ${label}: ${error.message}`;
  }

  return `Nao foi possivel carregar ${label}.`;
}
