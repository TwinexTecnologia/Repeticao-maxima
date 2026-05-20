import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";

import type { CompanyCartDiscountRule } from "./repository";

export type CompanyNuvemshopStatus =
  | "pendente"
  | "publicada"
  | "erro"
  | "pausada";

type SyncSuccessResult = {
  ok: true;
  status: CompanyNuvemshopStatus;
  message: string;
  promotionId: string | null;
  callbackUrl: string | null;
  syncedAt: string;
};

type SyncErrorResult = {
  ok: false;
  status: CompanyNuvemshopStatus;
  message: string;
  promotionId: string | null;
  callbackUrl: string | null;
  syncedAt: string;
};

export type SyncCompanyRuleResult = SyncSuccessResult | SyncErrorResult;

type DiscountCallbackPayload = Record<string, unknown>;

type CartLineItem = {
  productId: string;
  quantity: number;
};

export async function syncCompanyRuleWithNuvemshop(
  rule: CompanyCartDiscountRule,
  origin: string,
): Promise<SyncCompanyRuleResult> {
  const syncedAt = new Date().toISOString();
  const credentials = getNuvemshopCredentials();
  const callbackUrl = buildDiscountsCallbackUrl(origin);

  if (!callbackUrl) {
    return {
      ok: false,
      status: "erro",
      message:
        "Nao foi possivel sincronizar na Nuvemshop porque a URL publica do sistema nao esta configurada. Defina APP_PUBLIC_URL na producao e sincronize novamente.",
      promotionId: rule.nuvemshopPromotionId,
      callbackUrl: null,
      syncedAt,
    };
  }

  if (!credentials.ok) {
    return {
      ok: false,
      status: "erro",
      message: `Nao foi possivel sincronizar na Nuvemshop. Configure ${credentials.missing.join(" e ")}.`,
      promotionId: rule.nuvemshopPromotionId,
      callbackUrl,
      syncedAt,
    };
  }

  const client = new NuvemshopClient(credentials.credentials);

  try {
    await client.updateDiscountsCallback(callbackUrl);

    if (!rule.active) {
      if (rule.nuvemshopPromotionId) {
        try {
          await client.updatePromotion(rule.nuvemshopPromotionId, {
            active: false,
            combines_with_quantity_discounts: false,
            combines_with_free_shipping: false,
            combines_with_cart_amount_discounts: false,
            combines_with_app_discounts: false,
            combines_with_price_discounts: false,
          });
        } catch (error) {
          if (
            error instanceof NuvemshopApiError &&
            error.status === 404
          ) {
            return {
              ok: true,
              status: "pausada",
              message:
                "Promocao anterior nao existe mais na Nuvemshop. A regra ficou pausada e pronta para uma nova publicacao.",
              promotionId: null,
              callbackUrl,
              syncedAt,
            };
          }

          throw error;
        }
      }

      return {
        ok: true,
        status: "pausada",
        message: "Promocao pausada na Nuvemshop com sucesso.",
        promotionId: rule.nuvemshopPromotionId,
        callbackUrl,
        syncedAt,
      };
    }

    if (rule.nuvemshopPromotionId) {
      try {
        const updated = await client.updatePromotion(rule.nuvemshopPromotionId, {
          active: true,
          combines_with_quantity_discounts: false,
          combines_with_free_shipping: false,
          combines_with_cart_amount_discounts: false,
          combines_with_app_discounts: false,
          combines_with_price_discounts: false,
        });
        const updatedPromotionId =
          extractPromotionId(updated) || rule.nuvemshopPromotionId;

        return {
          ok: true,
          status: "publicada",
          message: "Promocao atualizada e ativa na Nuvemshop.",
          promotionId: updatedPromotionId,
          callbackUrl,
          syncedAt,
        };
      } catch (error) {
        if (
          error instanceof NuvemshopApiError &&
          error.status === 404
        ) {
          const recreatedPromotionId = await createActivePromotion(client, rule);

          return {
            ok: true,
            status: "publicada",
            message:
              "Promocao anterior nao existia mais na Nuvemshop e foi recriada automaticamente.",
            promotionId: recreatedPromotionId,
            callbackUrl,
            syncedAt,
          };
        }

        throw error;
      }
    }

    const createdPromotionId = await createActivePromotion(client, rule);

    return {
      ok: true,
      status: "publicada",
      message: "Promocao criada e ativa na Nuvemshop.",
      promotionId: createdPromotionId,
      callbackUrl,
      syncedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: "erro",
      message:
        error instanceof NuvemshopApiError
          ? `Falha ao sincronizar na Nuvemshop: ${error.message} ${error.body}`
          : error instanceof Error
            ? `Falha ao sincronizar na Nuvemshop: ${error.message}`
            : "Falha ao sincronizar na Nuvemshop.",
      promotionId: rule.nuvemshopPromotionId,
      callbackUrl,
      syncedAt,
    };
  }
}

async function createActivePromotion(
  client: NuvemshopClient,
  rule: CompanyCartDiscountRule,
) {
  const created = await client.createPromotion({
    name: rule.title,
    active: true,
    allocation_type: "cross_items",
    combines_with_quantity_discounts: false,
    combines_with_free_shipping: false,
    combines_with_cart_amount_discounts: false,
    combines_with_app_discounts: false,
    combines_with_price_discounts: false,
  });
  const createdPromotionId = extractPromotionId(created);

  if (!createdPromotionId) {
    throw new Error(
      `A Nuvemshop respondeu sem ID reconhecivel ao criar a promocao. Resposta: ${safeDescribePromotionResponse(created)}`,
    );
  }

  return createdPromotionId;
}

export function buildCompanyDiscountCallbackDecision(
  payload: unknown,
  rules: CompanyCartDiscountRule[],
) {
  const normalizedPayload =
    typeof payload === "object" && payload !== null
      ? (payload as DiscountCallbackPayload)
      : {};
  const publishedRules = rules.filter(
    (rule) => rule.active && rule.nuvemshopPromotionId,
  );

  if (publishedRules.length === 0) {
    return { status: 204 as const };
  }

  const lineItems = extractCartLineItems(normalizedPayload);
  const currency = getTextValue(normalizedPayload.currency) || "BRL";
  const matchingRules = publishedRules
    .map((rule) => ({
      rule,
      quantity: getEligibleQuantity(rule, lineItems),
    }))
    .filter((entry) => entry.quantity >= entry.rule.minimumQuantity)
    .sort((left, right) => {
      if (right.rule.discountAmount !== left.rule.discountAmount) {
        return right.rule.discountAmount - left.rule.discountAmount;
      }

      if (right.rule.minimumQuantity !== left.rule.minimumQuantity) {
        return right.rule.minimumQuantity - left.rule.minimumQuantity;
      }

      return left.rule.title.localeCompare(right.rule.title);
    });

  const chosenRule = matchingRules[0]?.rule ?? null;
  const commands: Array<Record<string, unknown>> = [];

  if (chosenRule?.nuvemshopPromotionId) {
    commands.push({
      command: "create_or_update_discount",
      specs: {
        promotion_id: chosenRule.nuvemshopPromotionId,
        currency,
        display_text: {
          "pt-br": chosenRule.title,
        },
        discount_specs: {
          type: "fixed",
          amount: formatAmount(chosenRule.discountAmount),
        },
      },
    });
  }

  const removablePromotionIds = publishedRules
    .map((rule) => rule.nuvemshopPromotionId)
    .filter(
      (promotionId): promotionId is string =>
        Boolean(promotionId) &&
        promotionId !== chosenRule?.nuvemshopPromotionId,
    );

  if (removablePromotionIds.length > 0) {
    commands.push({
      command: "remove_discount",
      specs: {
        scope: "cart",
        promotion_ids: removablePromotionIds,
      },
    });
  }

  if (commands.length === 0) {
    return { status: 204 as const };
  }

  return {
    status: 200 as const,
    body: {
      commands,
    },
  };
}

function buildDiscountsCallbackUrl(origin: string) {
  const baseUrl = resolvePublicAppBaseUrl(origin);

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/api/nuvemshop/discounts/callback`;
}

function resolvePublicAppBaseUrl(origin: string) {
  const configured =
    process.env.APP_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";

  if (configured) {
    return normalizeBaseUrl(configured);
  }

  if (origin && !isLocalOrigin(origin)) {
    return normalizeBaseUrl(origin);
  }

  return null;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function isLocalOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local")
    );
  } catch {
    return true;
  }
}

function extractCartLineItems(payload: DiscountCallbackPayload) {
  const rawLineItems = getRecordArrayValue(payload.line_items);

  if (rawLineItems.length > 0) {
    return rawLineItems
      .map((lineItem) => ({
        productId: extractProductId(lineItem),
        quantity: Math.max(getIntegerValue(lineItem.quantity), 0),
      }))
      .filter((lineItem) => lineItem.productId && lineItem.quantity > 0);
  }

  const products = getRecordArrayValue(payload.products);
  return products
    .map((product) => ({
      productId: extractProductId(product),
      quantity: Math.max(getIntegerValue(product.quantity), 0),
    }))
    .filter((lineItem) => lineItem.productId && lineItem.quantity > 0);
}

function extractProductId(value: Record<string, unknown>) {
  const productId = getTextValue(value.product_id);

  if (productId) {
    return productId;
  }

  if (typeof value.product === "object" && value.product !== null) {
    return getTextValue((value.product as Record<string, unknown>).id);
  }

  return getTextValue(value.id);
}

function getEligibleQuantity(rule: CompanyCartDiscountRule, items: CartLineItem[]) {
  const eligibleIds = new Set(rule.productIds);

  return items.reduce((total, item) => {
    if (!eligibleIds.has(item.productId)) {
      return total;
    }

    return total + item.quantity;
  }, 0);
}

function formatAmount(value: number) {
  return value.toFixed(2);
}

function extractPromotionId(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directId = getTextValue(record.id);

  if (directId) {
    return directId;
  }

  if (typeof record.data === "object" && record.data !== null) {
    return getTextValue((record.data as Record<string, unknown>).id) || null;
  }

  return null;
}

function safeDescribePromotionResponse(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[resposta nao serializavel]";
  }
}

function getRecordArrayValue(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null,
  );
}

function getTextValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function getIntegerValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
