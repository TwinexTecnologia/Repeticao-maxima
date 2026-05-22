"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopCoupon, NuvemshopOrder } from "@/lib/nuvemshop/types";

const OPERATIONS_SCHEMA = "repeticao_maxima";
const COUPON_PARTNER_TABLE = "parceiros_cupons";
const PARTNER_REDEMPTION_TABLE = "parceiros_resgates";
const DEBTS_TABLE = "dividas_internas";
const STOCK_TABLE = "estoque_base";
const PAGE_SIZE = 100;
const MAX_PAGES = 12;

export type PartnerRole = "influenciador" | "atleta";

export type PartnerPersistenceState = {
  enabled: boolean;
  source: "supabase" | "disabled";
  message: string;
  updatedAt: string | null;
};

export type CouponPartnerProfile = {
  id: string;
  name: string;
  couponCode: string;
  role: PartnerRole;
  active: boolean;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CouponDiscoveryRow = {
  code: string;
  orders: number;
  revenue: number;
  lastOrderAt: string | null;
};

export type PartnerRedemptionStatus = "previsto" | "entregue" | "compensado";

export type PartnerRedemption = {
  id: string;
  partnerId: string | null;
  partnerName: string;
  couponCode: string;
  partnerRole: PartnerRole;
  stockItemId: string | null;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  grantedAt: string;
  dueDate: string | null;
  status: PartnerRedemptionStatus;
  createMarketingDebt: boolean;
  debtId: string | null;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function loadCouponPartnerProfiles() {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      profiles: [] as CouponPartnerProfile[],
      persistence: buildDisabledState(
        `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar parceiros por cupom no Supabase.`,
      ),
    };
  }

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(COUPON_PARTNER_TABLE)
      .select("*")
      .order("active", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    const profiles = (data ?? []).map(rowToCouponPartnerProfile);

    return {
      profiles,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          profiles.length > 0
            ? "Parceiros por cupom carregados do Supabase."
            : "Supabase conectado. Ainda nao existe nenhum parceiro por cupom cadastrado.",
        updatedAt: getLatestUpdatedAt(data ?? []),
      },
    };
  } catch (error) {
    return {
      profiles: [] as CouponPartnerProfile[],
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function loadCouponPartnerModuleData() {
  const [profilesData, discoveryData, redemptionsData] = await Promise.all([
    loadCouponPartnerProfiles(),
    loadKnownCouponsFromStore(),
    loadPartnerRedemptions(),
  ]);

  return {
    profiles: profilesData.profiles,
    knownCoupons: discoveryData.coupons,
    redemptions: redemptionsData.redemptions,
    persistence: profilesData.persistence,
    discoveryState: discoveryData.state,
    redemptionState: redemptionsData.persistence,
  };
}

export async function loadPartnerRedemptions() {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      redemptions: [] as PartnerRedemption[],
      persistence: buildDisabledState(
        `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar resgates.`,
      ),
    };
  }

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(PARTNER_REDEMPTION_TABLE)
      .select("*")
      .order("granted_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const redemptions = (data ?? []).map(rowToPartnerRedemption);

    return {
      redemptions,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          redemptions.length > 0
            ? "Resgates carregados do Supabase."
            : "Supabase conectado. Ainda nao existem resgates cadastrados.",
        updatedAt: getLatestUpdatedAt(data ?? []),
      },
    };
  } catch (error) {
    return {
      redemptions: [] as PartnerRedemption[],
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function createCouponPartnerProfile(input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeCouponPartnerInput(input);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(COUPON_PARTNER_TABLE)
      .upsert(
        {
          name: row.name,
          coupon_code: row.couponCode,
          role: row.role,
          active: row.active,
          notes: row.notes,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "coupon_code",
        },
      )
      .select("*")
      .single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel salvar o parceiro por cupom.");
    }

    const profile = rowToCouponPartnerProfile(data);

    return {
      ok: true as const,
      profile,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "Parceiro por cupom salvo no Supabase.",
        updatedAt: profile.updatedAt,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function updateCouponPartnerProfile(id: string, input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeCouponPartnerInput(input);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(COUPON_PARTNER_TABLE)
      .update({
        name: row.name,
        coupon_code: row.couponCode,
        role: row.role,
        active: row.active,
        notes: row.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel atualizar o parceiro por cupom.");
    }

    const profile = rowToCouponPartnerProfile(data);

    return {
      ok: true as const,
      profile,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "Parceiro por cupom atualizado no Supabase.",
        updatedAt: profile.updatedAt,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function createPartnerRedemption(input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizePartnerRedemptionInput(input);

  let stockRollback: {
    stockItemId: string;
    total: number;
    printed: number;
  } | null = null;
  let createdDebtId: string | null = null;

  try {
    const { data: stockRow, error: stockError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(STOCK_TABLE)
      .select("id, total_qty, printed_qty, sku, color, size")
      .eq("id", row.stockItemId)
      .single();

    if (stockError || !stockRow) {
      throw stockError || new Error("Nao foi possivel localizar a linha de estoque selecionada.");
    }

    const currentTotal = getIntegerValue(stockRow.total_qty);
    const currentPrinted = Math.min(getIntegerValue(stockRow.printed_qty), currentTotal);

    if (row.quantity > currentTotal) {
      throw new Error(`O estoque dessa base tem ${currentTotal} unidade(s) e nao suporta esse resgate.`);
    }

    if (row.quantity > currentPrinted) {
      throw new Error(`Essa base tem ${currentPrinted} unidade(s) estampadas reais. Ajuste o saldo antes de resgatar.`);
    }

    const nextTotal = currentTotal - row.quantity;
    const nextPrinted = currentPrinted - row.quantity;
    const now = new Date().toISOString();
    let debtId: string | null = null;

    const { error: stockUpdateError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(STOCK_TABLE)
      .update({
        total_qty: nextTotal,
        printed_qty: nextPrinted,
        updated_at: now,
      })
      .eq("id", row.stockItemId);

    if (stockUpdateError) {
      throw stockUpdateError;
    }

    stockRollback = {
      stockItemId: row.stockItemId,
      total: currentTotal,
      printed: currentPrinted,
    };

    if (row.createMarketingDebt && row.dueDate) {
      const debtRow = {
        title: `Resgate ${row.partnerName}`,
        category: "Marketing",
        due_date: row.dueDate,
        amount: row.totalCost,
        status: "aberta",
        impact: `Resgate em roupa do cupom ${row.couponCode} · ${row.quantity} unidade(s) ${row.sku} ${row.color} ${row.size}`,
        payment_method: "outro",
        billing_frequency: "mensal",
        installments_total: 1,
        installment_number: 1,
        group_id: crypto.randomUUID(),
      };
      const { data: debtData, error: debtError } = await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(DEBTS_TABLE)
        .insert(debtRow)
        .select("id")
        .single();

      if (debtError) {
        throw debtError;
      }

      debtId = debtData?.id ? String(debtData.id) : null;
      createdDebtId = debtId;
    }

    const insertRow = {
      partner_id: row.partnerId,
      partner_name: row.partnerName,
      coupon_code: row.couponCode,
      partner_role: row.partnerRole,
      stock_item_id: row.stockItemId,
      sku: row.sku,
      color: row.color,
      size: row.size,
      quantity: row.quantity,
      unit_cost: row.unitCost,
      total_cost: row.totalCost,
      granted_at: row.grantedAt,
      due_date: row.dueDate,
      status: row.status,
      create_marketing_debt: row.createMarketingDebt,
      debt_id: debtId,
      notes: row.notes,
      updated_at: now,
    };
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(PARTNER_REDEMPTION_TABLE)
      .insert(insertRow)
      .select("*")
      .single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel salvar o resgate.");
    }

    return {
      ok: true as const,
      redemption: rowToPartnerRedemption(data),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: row.createMarketingDebt
          ? "Resgate salvo, estoque baixado e compromisso de marketing criado."
          : "Resgate salvo e estoque baixado com sucesso.",
        updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    if (createdDebtId) {
      await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(DEBTS_TABLE)
        .delete()
        .eq("id", createdDebtId);
    }

    if (stockRollback) {
      await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(STOCK_TABLE)
        .update({
          total_qty: stockRollback.total,
          printed_qty: stockRollback.printed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stockRollback.stockItemId);
    }

    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

async function loadKnownCouponsFromStore() {
  const credentials = getNuvemshopCredentials();

  if (!credentials.ok) {
    return {
      coupons: [] as CouponDiscoveryRow[],
      state: buildDisabledState(
        `Leitura da Nuvemshop indisponivel. Configure ${credentials.missing.join(" e ")}.`,
      ),
    };
  }

  try {
    const client = new NuvemshopClient(credentials.credentials);
    const [ordersResult, couponsResult] = await Promise.allSettled([
      fetchAllOrders(client),
      fetchAllCoupons(client),
    ]);
    const couponMap = new Map<string, CouponDiscoveryRow>();

    if (couponsResult.status === "fulfilled") {
      couponsResult.value.forEach((coupon) => {
        const code = getCouponCatalogCode(coupon);

        if (!code) {
          return;
        }

        couponMap.set(code, {
          code,
          orders: 0,
          revenue: 0,
          lastOrderAt: null,
        });
      });
    }

    if (ordersResult.status === "fulfilled") {
      for (const order of ordersResult.value) {
        const code = getCouponCode(order);

        if (!code) {
          continue;
        }

        const current = couponMap.get(code) || {
          code,
          orders: 0,
          revenue: 0,
          lastOrderAt: null,
        };

        current.orders += 1;
        current.revenue += parseMoney(order.total);

        if (
          !current.lastOrderAt ||
          new Date(order.created_at || 0) > new Date(current.lastOrderAt)
        ) {
          current.lastOrderAt = order.created_at || null;
        }

        couponMap.set(code, current);
      }
    }

    const coupons = Array.from(couponMap.values()).sort((left, right) => {
      const leftDate = left.lastOrderAt ? new Date(left.lastOrderAt).getTime() : 0;
      const rightDate = right.lastOrderAt ? new Date(right.lastOrderAt).getTime() : 0;

      if (rightDate !== leftDate) {
        return rightDate - leftDate;
      }

      if (right.orders !== left.orders) {
        return right.orders - left.orders;
      }

      return left.code.localeCompare(right.code);
    });

    if (
      couponsResult.status === "rejected" &&
      ordersResult.status === "rejected"
    ) {
      const couponMessage = getNuvemshopReadErrorMessage(couponsResult.reason);
      const orderMessage = getNuvemshopReadErrorMessage(ordersResult.reason);

      return {
        coupons: [] as CouponDiscoveryRow[],
        state: buildDisabledState(
          `Nao foi possivel ler cupons nem pedidos da Nuvemshop. Cupons: ${couponMessage}. Pedidos: ${orderMessage}.`,
        ),
      };
    }

    const discoveryMessage =
      couponsResult.status === "fulfilled"
        ? coupons.length > 0
          ? "Cupons cadastrados na Nuvemshop carregados com vendas reais quando existirem."
          : "Nuvemshop conectada, mas ainda sem cupons cadastrados."
        : ordersResult.status === "fulfilled"
          ? "Nao foi possivel ler os cupons cadastrados na Nuvemshop; a lista foi montada com base nos pedidos que ja venderam."
          : "Cupons cadastrados na Nuvemshop carregados, mas os pedidos com cupom nao puderam ser lidos agora.";

    return {
      coupons,
      state: {
        enabled: true,
        source: "supabase" as const,
        message: discoveryMessage,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const message =
      error instanceof NuvemshopApiError
        ? `${error.message} (${error.status}) ${error.body}`
        : getErrorMessage(error);

    return {
      coupons: [] as CouponDiscoveryRow[],
      state: buildDisabledState(message),
    };
  }
}

async function fetchAllOrders(client: NuvemshopClient) {
  const result: NuvemshopOrder[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await client.listOrders({ page, perPage: PAGE_SIZE });
    result.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return result;
}

async function fetchAllCoupons(client: NuvemshopClient) {
  const result: NuvemshopCoupon[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await client.listCoupons({ page, perPage: PAGE_SIZE });
    result.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return result;
}

function rowToCouponPartnerProfile(
  row: Record<string, unknown>,
): CouponPartnerProfile {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "").trim() || String(row.coupon_code ?? "").trim(),
    couponCode: String(row.coupon_code ?? "").trim().toUpperCase(),
    role: normalizePartnerRole(row.role),
    active: row.active === false ? false : true,
    notes: String(row.notes ?? "").trim(),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function rowToPartnerRedemption(row: Record<string, unknown>): PartnerRedemption {
  return {
    id: String(row.id ?? ""),
    partnerId: row.partner_id ? String(row.partner_id) : null,
    partnerName: String(row.partner_name ?? "").trim(),
    couponCode: String(row.coupon_code ?? "").trim().toUpperCase(),
    partnerRole: normalizePartnerRole(row.partner_role),
    stockItemId: row.stock_item_id ? String(row.stock_item_id) : null,
    sku: String(row.sku ?? "").trim(),
    color: String(row.color ?? "").trim(),
    size: String(row.size ?? "").trim(),
    quantity: Math.max(getIntegerValue(row.quantity), 0),
    unitCost: Math.max(getNumberValue(row.unit_cost), 0),
    totalCost: Math.max(getNumberValue(row.total_cost), 0),
    grantedAt: normalizeDate(row.granted_at) || "",
    dueDate: normalizeDate(row.due_date) || null,
    status: normalizePartnerRedemptionStatus(row.status),
    createMarketingDebt: row.create_marketing_debt === true,
    debtId: row.debt_id ? String(row.debt_id) : null,
    notes: String(row.notes ?? "").trim(),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function normalizeCouponPartnerInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const couponCode = String(source.couponCode ?? "")
    .trim()
    .toUpperCase();

  if (!couponCode) {
    throw new Error("Informe o cupom para salvar o parceiro.");
  }

  return {
    name: String(source.name ?? "").trim() || couponCode,
    couponCode,
    role: normalizePartnerRole(source.role),
    active: source.active === false ? false : true,
    notes: String(source.notes ?? "").trim(),
  };
}

function normalizePartnerRedemptionInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const couponCode = String(source.couponCode ?? "")
    .trim()
    .toUpperCase();
  const stockItemId = String(source.stockItemId ?? "").trim();
  const partnerName = String(source.partnerName ?? "").trim();
  const sku = String(source.sku ?? "").trim();
  const color = String(source.color ?? "").trim();
  const size = String(source.size ?? "").trim();
  const quantity = Math.max(getIntegerValue(source.quantity), 1);
  const unitCost = Math.max(getNumberValue(source.unitCost), 0);
  const grantedAt = normalizeDate(source.grantedAt) || getTodayDate();
  const dueDate = normalizeDate(source.dueDate) || "";
  const createMarketingDebt = source.createMarketingDebt === true;

  if (!couponCode) {
    throw new Error("Selecione o cupom do parceiro para registrar o resgate.");
  }

  if (!stockItemId) {
    throw new Error("Selecione a base do estoque que sera baixada.");
  }

  if (!sku || !color || !size) {
    throw new Error("A linha de estoque precisa informar sku, cor e tamanho.");
  }

  if (!partnerName) {
    throw new Error("Informe o nome do parceiro.");
  }

  if (createMarketingDebt && !dueDate) {
    throw new Error("Informe a data de vencimento para criar a divida de marketing.");
  }

  return {
    partnerId: String(source.partnerId ?? "").trim() || null,
    partnerName,
    couponCode,
    partnerRole: normalizePartnerRole(source.partnerRole),
    stockItemId,
    sku,
    color,
    size,
    quantity,
    unitCost,
    totalCost: Math.round(unitCost * quantity * 100) / 100,
    grantedAt,
    dueDate: dueDate || null,
    status: normalizePartnerRedemptionStatus(source.status),
    createMarketingDebt,
    notes: String(source.notes ?? "").trim(),
  };
}

function getCouponCode(order: NuvemshopOrder) {
  const code =
    order.coupon
      ?.map((coupon) => String(coupon.code ?? "").trim().toUpperCase())
      .filter(Boolean)[0] || null;

  return code;
}

function getCouponCatalogCode(coupon: NuvemshopCoupon) {
  const code = String(coupon.code ?? "")
    .trim()
    .toUpperCase();

  return code || null;
}

function parseMoney(value?: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    return parseMoney(value);
  }

  return 0;
}

function getIntegerValue(value: unknown) {
  const parsed = Math.trunc(getNumberValue(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePartnerRole(value: unknown): PartnerRole {
  return String(value ?? "").trim().toLowerCase() === "atleta"
    ? "atleta"
    : "influenciador";
}

function normalizePartnerRedemptionStatus(value: unknown): PartnerRedemptionStatus {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "previsto" ||
    normalized === "entregue" ||
    normalized === "compensado"
  ) {
    return normalized;
  }

  return "entregue";
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDisabledState(message: string): PartnerPersistenceState {
  return {
    enabled: false,
    source: "disabled",
    message,
    updatedAt: null,
  };
}

function getLatestUpdatedAt(rows: Array<Record<string, unknown>>) {
  const values = rows
    .map((row) =>
      typeof row.updated_at === "string"
        ? row.updated_at
        : typeof row.created_at === "string"
          ? row.created_at
          : "",
    )
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left));

  return values[0] || null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel concluir a operacao no Supabase.";
}

function getNuvemshopReadErrorMessage(error: unknown) {
  return error instanceof NuvemshopApiError
    ? `${error.message} (${error.status}) ${error.body}`
    : getErrorMessage(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
