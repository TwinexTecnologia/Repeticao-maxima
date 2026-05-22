import type {
  NuvemshopCategory,
  NuvemshopCoupon,
  NuvemshopCredentials,
  NuvemshopOrder,
  NuvemshopPromotion,
  NuvemshopPromotionInput,
  NuvemshopPromotionResponse,
  NuvemshopProduct,
} from "./types";

const DEFAULT_BASE_URL = "https://api.nuvemshop.com.br/v1";
const DEFAULT_USER_AGENT =
  "Repeticao Maxima (contato@repeticaomaxima.com.br)";

export function getNuvemshopCredentials():
  | { ok: true; credentials: NuvemshopCredentials }
  | { ok: false; missing: string[]; partial: Omit<NuvemshopCredentials, "accessToken"> } {
  const storeId = process.env.NUVEMSHOP_STORE_ID?.trim() ?? "";
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN?.trim() ?? "";
  const baseUrl =
    process.env.NUVEMSHOP_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const userAgent =
    process.env.NUVEMSHOP_USER_AGENT?.trim() || DEFAULT_USER_AGENT;

  const missing = [
    !storeId ? "NUVEMSHOP_STORE_ID" : null,
    !accessToken ? "NUVEMSHOP_ACCESS_TOKEN" : null,
    !userAgent ? "NUVEMSHOP_USER_AGENT" : null,
  ].filter(Boolean) as string[];

  const partial = {
    storeId: storeId || "",
    baseUrl,
    userAgent,
  };

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      partial,
    };
  }

  return {
    ok: true,
    credentials: {
      storeId,
      accessToken,
      baseUrl,
      userAgent,
    },
  };
}

type ListParams = {
  page?: number;
  perPage?: number;
};

export class NuvemshopApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "NuvemshopApiError";
    this.status = status;
    this.body = body;
  }
}

export class NuvemshopClient {
  constructor(private readonly credentials: NuvemshopCredentials) {}

  async listProducts(params: ListParams = {}) {
    const searchParams = this.buildPaginationParams(params);
    return this.requestJson<NuvemshopProduct[]>("/products", {
      searchParams,
    });
  }

  async listCategories(params: ListParams = {}) {
    const searchParams = this.buildPaginationParams(params);
    return this.requestJson<NuvemshopCategory[]>("/categories", {
      searchParams,
    });
  }

  async listOrders(params: ListParams = {}) {
    const searchParams = this.buildPaginationParams(params);
    return this.requestJson<NuvemshopOrder[]>("/orders", {
      searchParams,
    });
  }

  async listCoupons(params: ListParams = {}) {
    const searchParams = this.buildPaginationParams(params);
    return this.requestJson<NuvemshopCoupon[]>("/coupons", {
      searchParams,
    });
  }

  async createPromotion(input: NuvemshopPromotionInput) {
    return this.requestJson<NuvemshopPromotionResponse>("/promotions", {
      method: "POST",
      body: input,
      baseUrl: getNuvemshopDiscountsBaseUrl(this.credentials.baseUrl),
    });
  }

  async updatePromotion(id: string, input: Partial<NuvemshopPromotionInput>) {
    return this.requestJson<NuvemshopPromotionResponse>(`/promotions/${id}`, {
      method: "PATCH",
      body: input,
      baseUrl: getNuvemshopDiscountsBaseUrl(this.credentials.baseUrl),
    });
  }

  async updateDiscountsCallback(url: string) {
    return this.requestJson<{ url?: string | null }>("/discounts/callbacks", {
      method: "PUT",
      body: { url },
      baseUrl: getNuvemshopDiscountsBaseUrl(this.credentials.baseUrl),
    });
  }

  private buildPaginationParams(params: ListParams) {
    const searchParams = new URLSearchParams();

    if (params.page) {
      searchParams.set("page", String(params.page));
    }

    if (params.perPage) {
      searchParams.set("per_page", String(params.perPage));
    }

    return searchParams;
  }

  private async requestJson<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      searchParams?: URLSearchParams;
      body?: unknown;
      baseUrl?: string;
    } = {},
  ) {
    const base = (options.baseUrl || this.credentials.baseUrl).replace(/\/$/, "");
    const url = new URL(
      `${base}/${this.credentials.storeId}${path.startsWith("/") ? path : `/${path}`}`,
    );

    if (options.searchParams) {
      url.search = options.searchParams.toString();
    }

    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Authentication: `bearer ${this.credentials.accessToken}`,
        "User-Agent": this.credentials.userAgent,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new NuvemshopApiError(
        `Falha ao consultar ${path}`,
        response.status,
        body,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const responseText = await response.text();

    if (!responseText.trim()) {
      return undefined as T;
    }

    return JSON.parse(responseText) as T;
  }
}

export function getNuvemshopDiscountsBaseUrl(baseUrl?: string) {
  const configured = process.env.NUVEMSHOP_DISCOUNTS_API_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const current = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  return current.endsWith("/v1")
    ? current.replace(/\/v1$/, "/2025-03")
    : current;
}
