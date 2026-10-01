import {
  getNuvemshopCredentials,
  getNuvemshopDiscountsBaseUrl,
  NuvemshopApiError,
  NuvemshopClient,
} from "./client";
import type { DiagnosticsResourceResult, NuvemshopDiagnostics } from "./types";

function sanitizeSample(data: unknown) {
  if (Array.isArray(data)) {
    return data.slice(0, 5);
  }

  return data;
}

async function inspectResource<T>(
  label: string,
  loader: () => Promise<T[]>,
): Promise<DiagnosticsResourceResult> {
  try {
    const data = await loader();

    return {
      label,
      ok: true,
      count: data.length,
      sample: sanitizeSample(data),
    };
  } catch (error) {
    const detail =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : error instanceof Error
          ? error.message
          : "Erro desconhecido";

    return {
      label,
      ok: false,
      count: null,
      sample: null,
      error: detail,
    };
  }
}

async function inspectValue<T>(
  label: string,
  loader: () => Promise<T>,
): Promise<DiagnosticsResourceResult> {
  try {
    const data = await loader();

    return {
      label,
      ok: true,
      count: null,
      sample: sanitizeSample(data),
    };
  } catch (error) {
    const detail =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : error instanceof Error
          ? error.message
          : "Erro desconhecido";

    return {
      label,
      ok: false,
      count: null,
      sample: null,
      error: detail,
    };
  }
}

export async function getNuvemshopDiagnostics(): Promise<NuvemshopDiagnostics> {
  const credentialsResult = getNuvemshopCredentials();
  const checkedAt = new Date().toISOString();

  if (!credentialsResult.ok) {
    return {
      status: "nao_configurado",
      checkedAt,
      missingEnv: credentialsResult.missing,
      config: {
        baseUrl: credentialsResult.partial.baseUrl,
        discountsBaseUrl: getNuvemshopDiscountsBaseUrl(credentialsResult.partial.baseUrl),
        storeId: credentialsResult.partial.storeId || null,
        userAgent: credentialsResult.partial.userAgent || null,
      },
      resources: [],
    };
  }

  const client = new NuvemshopClient(credentialsResult.credentials);
  const resources = await Promise.all([
    inspectResource("Produtos", () => client.listProducts({ page: 1, perPage: 5 })),
    inspectResource("Categorias", () =>
      client.listCategories({ page: 1, perPage: 5 }),
    ),
    inspectResource("Pedidos", () => client.listOrders({ page: 1, perPage: 5 })),
    inspectResource("Promocoes", () => client.listPromotions({ page: 1, perPage: 5 })),
    inspectValue("Callback de descontos", () =>
      Promise.resolve({
        expectedUrl:
          process.env.NUVEMSHOP_CALLBACK_URL?.trim() ||
          "Use o callback publico /api/nuvemshop/discounts/callback",
        discountsBaseUrl: getNuvemshopDiscountsBaseUrl(credentialsResult.credentials.baseUrl),
      }),
    ),
  ]);

  const hasError = resources.some((resource) => !resource.ok);

  return {
    status: hasError ? "erro" : "conectado",
    checkedAt,
    missingEnv: [],
    config: {
      baseUrl: credentialsResult.credentials.baseUrl,
      discountsBaseUrl: getNuvemshopDiscountsBaseUrl(credentialsResult.credentials.baseUrl),
      storeId: credentialsResult.credentials.storeId,
      userAgent: credentialsResult.credentials.userAgent,
    },
    resources,
  };
}
