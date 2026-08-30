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
  matchIds: string[];
  quantity: number;
};

export async function syncCompanyRuleWithNuvemshop(
  rule: CompanyCartDiscountRule,
  origin: string,
  previousRule?: CompanyCartDiscountRule | null,
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
  const activePromotionUpdateSettings = getActivePromotionUpdateSettings(rule);

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

    const titleChanged =
      Boolean(rule.nuvemshopPromotionId) &&
      Boolean(previousRule?.nuvemshopPromotionId) &&
      previousRule?.nuvemshopPromotionId === rule.nuvemshopPromotionId &&
      previousRule?.title.trim() !== rule.title.trim();

    if (rule.nuvemshopPromotionId) {
      if (titleChanged) {
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
          if (!(error instanceof NuvemshopApiError && error.status === 404)) {
            throw error;
          }
        }

        const recreatedPromotionId = await createActivePromotion(client, rule);

        return {
          ok: true,
          status: "publicada",
          message:
            "Promocao recriada na Nuvemshop para refletir o novo titulo no checkout.",
          promotionId: recreatedPromotionId,
          callbackUrl,
          syncedAt,
        };
      }

      try {
        const updated = await client.updatePromotion(
          rule.nuvemshopPromotionId,
          activePromotionUpdateSettings,
        );
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
    ...getActivePromotionCreateSettings(rule),
    name: rule.title,
  });
  const createdPromotionId = extractPromotionId(created);

  if (!createdPromotionId) {
    throw new Error(
      `A Nuvemshop respondeu sem ID reconhecivel ao criar a promocao. Resposta: ${safeDescribePromotionResponse(created)}`,
    );
  }

  return createdPromotionId;
}

function getActivePromotionCreateSettings(rule: CompanyCartDiscountRule) {
  return {
    allocation_type: "cross_items" as const,
    ...getActivePromotionUpdateSettings(rule),
  };
}

function getActivePromotionUpdateSettings(rule: CompanyCartDiscountRule) {
  const allowCombining = rule.allowCombiningWithOtherPromotions;

  return {
    active: true,
    combines_with_other_discounts: allowCombining,
    combines_with_quantity_discounts: allowCombining,
    combines_with_free_shipping: allowCombining,
    combines_with_cart_amount_discounts: allowCombining,
    combines_with_app_discounts: allowCombining,
    combines_with_price_discounts: allowCombining,
  };
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
  const currency = extractCurrency(normalizedPayload) || "BRL";
  const matchingRules = publishedRules
    .map((rule) => ({
      rule,
      quantity: getMatchedQuantity(rule, lineItems),
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
  const cartPayload = getRecordValue(payload.cart);
  const rawLineItems =
    getRecordArrayValue(payload.line_items).length > 0
      ? getRecordArrayValue(payload.line_items)
      : getRecordArrayValue(cartPayload?.line_items);

  if (rawLineItems.length > 0) {
    return rawLineItems
      .map((lineItem) => ({
        matchIds: extractMatchIds(lineItem),
        quantity: Math.max(getIntegerValue(lineItem.quantity), 0),
      }))
      .filter((lineItem) => lineItem.matchIds.length > 0 && lineItem.quantity > 0);
  }

  const products =
    getRecordArrayValue(payload.products).length > 0
      ? getRecordArrayValue(payload.products)
      : getRecordArrayValue(cartPayload?.products);
  return products
    .map((product) => ({
      matchIds: extractMatchIds(product),
      quantity: Math.max(getIntegerValue(product.quantity), 0),
    }))
    .filter((lineItem) => lineItem.matchIds.length > 0 && lineItem.quantity > 0);
}

function extractCurrency(payload: DiscountCallbackPayload) {
  const topLevelCurrency = getTextValue(payload.currency);

  if (topLevelCurrency) {
    return topLevelCurrency;
  }

  const cartPayload = getRecordValue(payload.cart);
  return getTextValue(cartPayload?.currency);
}

function extractMatchIds(value: Record<string, unknown>) {
  const productPayload = getRecordValue(value.product);
  const variantPayload = getRecordValue(value.variant);

  return Array.from(
    new Set(
      [
        getTextValue(value.product_id),
        getTextValue(value.variant_id),
        getTextValue(value.id),
        getTextValue(productPayload?.id),
        getTextValue(variantPayload?.id),
      ].filter(Boolean),
    ),
  );
}

function getMatchedQuantity(rule: CompanyCartDiscountRule, items: CartLineItem[]) {
  if (rule.comboGroups.length > 0) {
    return getEligibleGroupedQuantity(rule, items);
  }

  return getEligibleQuantity(rule, items);
}

function getEligibleGroupedQuantity(
  rule: CompanyCartDiscountRule,
  items: CartLineItem[],
) {
  const remainingItems = items.map((item) => ({
    matchIds: item.matchIds,
    quantity: item.quantity,
  }));
  let matchedQuantity = 0;

  for (const group of rule.comboGroups) {
    const eligibleIds = new Set(group.productIds);
    let groupQuantity = 0;

    for (const item of remainingItems) {
      if (groupQuantity >= group.minimumQuantity) {
        break;
      }

      if (
        item.quantity <= 0 ||
        !item.matchIds.some((matchId) => eligibleIds.has(matchId))
      ) {
        continue;
      }

      const allocatable = Math.min(
        item.quantity,
        group.minimumQuantity - groupQuantity,
      );
      item.quantity -= allocatable;
      groupQuantity += allocatable;
    }

    if (groupQuantity < group.minimumQuantity) {
      return 0;
    }

    matchedQuantity += groupQuantity;
  }

  return matchedQuantity;
}

function getEligibleQuantity(rule: CompanyCartDiscountRule, items: CartLineItem[]) {
  const eligibleIds = new Set(rule.productIds);

  return items.reduce((total, item) => {
    if (!item.matchIds.some((matchId) => eligibleIds.has(matchId))) {
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

function getRecordValue(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
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
