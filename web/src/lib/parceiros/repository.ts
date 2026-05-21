"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { NuvemshopOrder } from "@/lib/nuvemshop/types";

const OPERATIONS_SCHEMA = "repeticao_maxima";
const COUPON_PARTNER_TABLE = "parceiros_cupons";
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
  const [profilesData, discoveryData] = await Promise.all([
    loadCouponPartnerProfiles(),
    loadKnownCouponsFromOrders(),
  ]);

  return {
    profiles: profilesData.profiles,
    knownCoupons: discoveryData.coupons,
    persistence: profilesData.persistence,
    discoveryState: discoveryData.state,
  };
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

async function loadKnownCouponsFromOrders() {
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
    const orders = await fetchAllOrders(client);
    const couponMap = new Map<string, CouponDiscoveryRow>();

    for (const order of orders) {
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

      if (!current.lastOrderAt || new Date(order.created_at || 0) > new Date(current.lastOrderAt)) {
        current.lastOrderAt = order.created_at || null;
      }

      couponMap.set(code, current);
    }

    const coupons = Array.from(couponMap.values()).sort((left, right) => {
      const leftDate = left.lastOrderAt ? new Date(left.lastOrderAt).getTime() : 0;
      const rightDate = right.lastOrderAt ? new Date(right.lastOrderAt).getTime() : 0;

      if (rightDate !== leftDate) {
        return rightDate - leftDate;
      }

      return right.orders - left.orders;
    });

    return {
      coupons,
      state: {
        enabled: true,
        source: "supabase" as const,
        message:
          coupons.length > 0
            ? "Cupons encontrados nos pedidos reais da Nuvemshop."
            : "Nuvemshop conectada, mas ainda sem pedidos com cupom.",
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

function getCouponCode(order: NuvemshopOrder) {
  const code =
    order.coupon
      ?.map((coupon) => String(coupon.code ?? "").trim().toUpperCase())
      .filter(Boolean)[0] || null;

  return code;
}

function parseMoney(value?: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePartnerRole(value: unknown): PartnerRole {
  return String(value ?? "").trim().toLowerCase() === "atleta"
    ? "atleta"
    : "influenciador";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
