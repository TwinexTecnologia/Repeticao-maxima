"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getNuvemshopCredentials,
  NuvemshopApiError,
  NuvemshopClient,
} from "@/lib/nuvemshop/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NuvemshopCoupon, NuvemshopOrder } from "@/lib/nuvemshop/types";

const OPERATIONS_SCHEMA = "repeticao_maxima";
const COUPON_PARTNER_TABLE = "parceiros_cupons";
const PARTNER_REDEMPTION_TABLE = "parceiros_resgates";
const PARTNER_REWARD_REQUEST_TABLE = "parceiros_solicitacoes_resgate";
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

export type PartnerRewardRequestType = "roupa" | "apoio";
export type PartnerRewardRequestStatus = "pendente" | "aprovado" | "pago" | "recusado";

export type PartnerRewardRequest = {
  id: string;
  userProfileId: string;
  couponPartnerId: string | null;
  partnerName: string;
  couponCode: string;
  partnerRole: PartnerRole;
  requestType: PartnerRewardRequestType;
  supportGoal: string;
  requestedAmount: number;
  availableAmount: number;
  minimumAmount: number;
  windowStartDate: string | null;
  windowEndDate: string | null;
  status: PartnerRewardRequestStatus;
  adminCouponCode: string;
  adminMessage: string;
  notes: string;
  requestedAt: string | null;
  reviewedAt: string | null;
  partnerSeenAt: string | null;
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

export async function loadPartnerRewardRequests(filters?: {
  userProfileId?: string | null;
  statuses?: PartnerRewardRequestStatus[];
}) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return [] as PartnerRewardRequest[];
  }

  try {
    let query = supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(PARTNER_REWARD_REQUEST_TABLE)
      .select("*")
      .order("requested_at", { ascending: false });

    if (filters?.userProfileId) {
      query = query.eq("user_profile_id", filters.userProfileId);
    }

    if (filters?.statuses && filters.statuses.length > 0) {
      query = query.in("status", filters.statuses);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data ?? []).map(rowToPartnerRewardRequest);
  } catch {
    return [] as PartnerRewardRequest[];
  }
}

export async function createPartnerRewardRequest(input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizePartnerRewardRequestInput(input);

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(PARTNER_REWARD_REQUEST_TABLE)
      .insert({
        user_profile_id: row.userProfileId,
        coupon_partner_id: row.couponPartnerId,
        partner_name: row.partnerName,
        coupon_code: row.couponCode,
        partner_role: row.partnerRole,
        request_type: row.requestType,
        support_goal: row.supportGoal,
        requested_amount: row.requestedAmount,
        available_amount: row.availableAmount,
        minimum_amount: row.minimumAmount,
        window_start_date: row.windowStartDate,
        window_end_date: row.windowEndDate,
        status: "pendente",
        admin_coupon_code: "",
        admin_message: "",
        notes: row.notes,
        partner_seen_at: null,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel salvar a solicitacao de resgate.");
    }

    return {
      ok: true as const,
      request: rowToPartnerRewardRequest(data),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "Solicitacao enviada para o admin com sucesso.",
        updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function reviewPartnerRewardRequest(id: string, input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizePartnerRewardRequestReviewInput(input);
  const reviewedAt = new Date().toISOString();

  try {
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(PARTNER_REWARD_REQUEST_TABLE)
      .update({
        status: row.status,
        admin_coupon_code: row.adminCouponCode,
        admin_message: row.adminMessage,
        reviewed_at: reviewedAt,
        partner_seen_at: null,
        updated_at: reviewedAt,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel atualizar a solicitacao.");
    }

    return {
      ok: true as const,
      request: rowToPartnerRewardRequest(data),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          row.status === "pago"
            ? "Solicitacao marcada como paga."
            : row.status === "recusado"
              ? "Solicitacao recusada."
              : "Solicitacao aprovada com cupom liberado.",
        updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
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
    const currentPlain = Math.max(currentTotal - currentPrinted, 0);

    if (row.quantity > currentPlain) {
      throw new Error(
        `Essa base tem ${currentPlain} lisa(s) disponiveis e nao suporta esse resgate.`,
      );
    }

    const nextTotal = currentTotal - row.quantity;
    const now = new Date().toISOString();
    let debtId: string | null = null;

    const { error: stockUpdateError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(STOCK_TABLE)
      .update({
        total_qty: nextTotal,
        printed_qty: currentPrinted,
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
      notes: buildPartnerRedemptionNotes(
        row.productLabel,
        row.adjustStock,
        row.notes,
      ),
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
          ? "Resgate salvo, lisa baixada do estoque e compromisso de marketing criado."
          : "Resgate salvo e lisa baixada do estoque com sucesso.",
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

export async function updatePartnerRedemption(id: string, input: unknown) {
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
  const now = new Date().toISOString();
  const stockRollbacks: Array<{
    stockItemId: string;
    total: number;
    printed: number;
  }> = [];
  let createdDebtId: string | null = null;
  let previousDebtRow: Record<string, unknown> | null = null;

  try {
    const { data: existingData, error: existingError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(PARTNER_REDEMPTION_TABLE)
      .select("*")
      .eq("id", id)
      .single();

    if (existingError || !existingData) {
      throw existingError || new Error("Nao foi possivel localizar o resgate para editar.");
    }

    const existingRedemption = rowToPartnerRedemption(existingData);
    const previouslyAdjustedStock = getAffectsStockFromNotes(existingRedemption.notes);

    if (existingRedemption.debtId) {
      const { data: debtRow } = await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(DEBTS_TABLE)
        .select("*")
        .eq("id", existingRedemption.debtId)
        .maybeSingle();

      previousDebtRow = debtRow ?? null;
    }

    if (previouslyAdjustedStock && existingRedemption.stockItemId) {
      const previousStockRow = await loadStockRowForRedemption(
        supabase.client,
        existingRedemption.stockItemId,
      );
      const restoredTotal = previousStockRow.total + existingRedemption.quantity;

      await applyStockUpdate(
        supabase.client,
        previousStockRow.id,
        restoredTotal,
        previousStockRow.printed,
        now,
      );

      stockRollbacks.push({
        stockItemId: previousStockRow.id,
        total: previousStockRow.total,
        printed: previousStockRow.printed,
      });
    }

    if (row.adjustStock) {
      const nextStockRow = await loadStockRowForRedemption(
        supabase.client,
        row.stockItemId,
      );
      const currentPlain = Math.max(nextStockRow.total - nextStockRow.printed, 0);

      if (row.quantity > currentPlain) {
        throw new Error(
          `Essa base tem ${currentPlain} lisa(s) disponiveis e nao suporta esse resgate.`,
        );
      }

      const nextTotal = nextStockRow.total - row.quantity;

      await applyStockUpdate(
        supabase.client,
        nextStockRow.id,
        nextTotal,
        nextStockRow.printed,
        now,
      );

      if (!stockRollbacks.some((item) => item.stockItemId === nextStockRow.id)) {
        stockRollbacks.push({
          stockItemId: nextStockRow.id,
          total: nextStockRow.total,
          printed: nextStockRow.printed,
        });
      }
    }

    let debtId: string | null = existingRedemption.debtId;

    if (row.createMarketingDebt && row.dueDate) {
      const debtPayload = {
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
        group_id:
          previousDebtRow?.group_id && typeof previousDebtRow.group_id === "string"
            ? previousDebtRow.group_id
            : crypto.randomUUID(),
      };

      if (existingRedemption.debtId) {
        const { error: debtUpdateError } = await supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(DEBTS_TABLE)
          .update({
            ...debtPayload,
            updated_at: now,
          })
          .eq("id", existingRedemption.debtId);

        if (debtUpdateError) {
          throw debtUpdateError;
        }
      } else {
        const { data: newDebtData, error: debtInsertError } = await supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(DEBTS_TABLE)
          .insert(debtPayload)
          .select("id")
          .single();

        if (debtInsertError) {
          throw debtInsertError;
        }

        debtId = newDebtData?.id ? String(newDebtData.id) : null;
        createdDebtId = debtId;
      }
    } else if (existingRedemption.debtId) {
      const { error: deleteDebtError } = await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(DEBTS_TABLE)
        .delete()
        .eq("id", existingRedemption.debtId);

      if (deleteDebtError) {
        throw deleteDebtError;
      }

      debtId = null;
    }

    const storedNotes = buildPartnerRedemptionNotes(
      row.productLabel,
      row.adjustStock,
      row.notes,
    );
    const { data, error } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(PARTNER_REDEMPTION_TABLE)
      .update({
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
        notes: storedNotes,
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel atualizar o resgate.");
    }

    return {
      ok: true as const,
      redemption: rowToPartnerRedemption(data),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: row.adjustStock
          ? "Resgate atualizado com ajuste de estoque."
          : "Resgate atualizado sem mexer no estoque.",
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

    if (previousDebtRow) {
      await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(DEBTS_TABLE)
        .upsert(previousDebtRow, {
          onConflict: "id",
        });
    }

    for (const rollback of stockRollbacks) {
      await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(STOCK_TABLE)
        .update({
          total_qty: rollback.total,
          printed_qty: rollback.printed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rollback.stockItemId);
    }

    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function deletePartnerRedemption(id: string) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  let previousDebtRow: Record<string, unknown> | null = null;
  let stockRollback: {
    stockItemId: string;
    total: number;
    printed: number;
  } | null = null;

  try {
    const { data: existingData, error: existingError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(PARTNER_REDEMPTION_TABLE)
      .select("*")
      .eq("id", id)
      .single();

    if (existingError || !existingData) {
      throw existingError || new Error("Nao foi possivel localizar o resgate para excluir.");
    }

    const existingRedemption = rowToPartnerRedemption(existingData);
    const affectedStock = getAffectsStockFromNotes(existingRedemption.notes);

    if (existingRedemption.debtId) {
      const { data: debtRow } = await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(DEBTS_TABLE)
        .select("*")
        .eq("id", existingRedemption.debtId)
        .maybeSingle();

      previousDebtRow = debtRow ?? null;
    }

    if (affectedStock && existingRedemption.stockItemId) {
      const stockRow = await loadStockRowForRedemption(
        supabase.client,
        existingRedemption.stockItemId,
      );
      const restoredTotal = stockRow.total + existingRedemption.quantity;

      await applyStockUpdate(
        supabase.client,
        stockRow.id,
        restoredTotal,
        stockRow.printed,
        new Date().toISOString(),
      );

      stockRollback = {
        stockItemId: stockRow.id,
        total: stockRow.total,
        printed: stockRow.printed,
      };
    }

    if (existingRedemption.debtId) {
      const { error: deleteDebtError } = await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(DEBTS_TABLE)
        .delete()
        .eq("id", existingRedemption.debtId);

      if (deleteDebtError) {
        throw deleteDebtError;
      }
    }

    const { error: deleteRedemptionError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(PARTNER_REDEMPTION_TABLE)
      .delete()
      .eq("id", id);

    if (deleteRedemptionError) {
      throw deleteRedemptionError;
    }

    return {
      ok: true as const,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "Resgate excluido com sucesso.",
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (previousDebtRow) {
      await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(DEBTS_TABLE)
        .upsert(previousDebtRow, {
          onConflict: "id",
        });
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

export async function loadKnownCouponsFromStore() {
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

function rowToPartnerRewardRequest(
  row: Record<string, unknown>,
): PartnerRewardRequest {
  return {
    id: String(row.id ?? ""),
    userProfileId: String(row.user_profile_id ?? ""),
    couponPartnerId: row.coupon_partner_id ? String(row.coupon_partner_id) : null,
    partnerName: String(row.partner_name ?? "").trim(),
    couponCode: String(row.coupon_code ?? "").trim().toUpperCase(),
    partnerRole: normalizePartnerRole(row.partner_role),
    requestType: normalizePartnerRewardRequestType(row.request_type),
    supportGoal: String(row.support_goal ?? "").trim(),
    requestedAmount: Math.max(getNumberValue(row.requested_amount), 0),
    availableAmount: Math.max(getNumberValue(row.available_amount), 0),
    minimumAmount: Math.max(getNumberValue(row.minimum_amount), 0),
    windowStartDate: normalizeDate(row.window_start_date) || null,
    windowEndDate: normalizeDate(row.window_end_date) || null,
    status: normalizePartnerRewardRequestStatus(row.status),
    adminCouponCode: String(row.admin_coupon_code ?? "").trim().toUpperCase(),
    adminMessage: String(row.admin_message ?? "").trim(),
    notes: String(row.notes ?? "").trim(),
    requestedAt: typeof row.requested_at === "string" ? row.requested_at : null,
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    partnerSeenAt: typeof row.partner_seen_at === "string" ? row.partner_seen_at : null,
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
  const productLabel = String(source.productLabel ?? source.artName ?? "").trim();
  const stockItemId = String(source.stockItemId ?? "").trim();
  const partnerName = String(source.partnerName ?? "").trim();
  const sku = String(source.sku ?? "").trim();
  const color = String(source.color ?? "").trim();
  const size = String(source.size ?? "").trim();
  const quantity = Math.max(getIntegerValue(source.quantity), 1);
  const unitCost = Math.max(getNumberValue(source.unitCost), 0);
  const grantedAt = normalizeDate(source.grantedAt) || getTodayDate();
  const dueDate = normalizeDate(source.dueDate) || "";
  const adjustStock = source.adjustStock === false ? false : true;
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

  if (!productLabel) {
    throw new Error("Selecione o produto da loja para registrar esse resgate.");
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
    productLabel,
    adjustStock,
    status: normalizePartnerRedemptionStatus(source.status),
    createMarketingDebt,
    notes: String(source.notes ?? "").trim(),
  };
}

async function loadStockRowForRedemption(
  client: SupabaseClient,
  stockItemId: string,
) {
  const { data, error } = await client
    .schema(OPERATIONS_SCHEMA)
    .from(STOCK_TABLE)
    .select("id, total_qty, printed_qty")
    .eq("id", stockItemId)
    .single();

  if (error || !data) {
    throw error || new Error("Nao foi possivel localizar a linha de estoque selecionada.");
  }

  const total = getIntegerValue(data.total_qty);
  const printed = Math.min(getIntegerValue(data.printed_qty), total);

  return {
    id: String(data.id ?? ""),
    total,
    printed,
  };
}

async function applyStockUpdate(
  client: SupabaseClient,
  stockItemId: string,
  total: number,
  printed: number,
  updatedAt: string,
) {
  const { error } = await client
    .schema(OPERATIONS_SCHEMA)
    .from(STOCK_TABLE)
    .update({
      total_qty: total,
      printed_qty: Math.min(printed, total),
      updated_at: updatedAt,
    })
    .eq("id", stockItemId);

  if (error) {
    throw error;
  }
}

function buildPartnerRedemptionNotes(
  productLabel: string,
  adjustStock: boolean,
  notes: string,
) {
  const lines = [`[produto] ${productLabel.trim()}`, `[estoque] ${adjustStock ? "sim" : "nao"}`];
  const cleanNotes = notes.trim();

  if (cleanNotes) {
    lines.push(cleanNotes);
  }

  return lines.join("\n");
}

function getAffectsStockFromNotes(notes: string) {
  const match = notes.match(/^\[estoque\]\s*(sim|nao)$/im);

  if (!match) {
    return true;
  }

  return match[1]?.trim().toLowerCase() !== "nao";
}

function normalizePartnerRewardRequestInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const userProfileId = String(source.userProfileId ?? "").trim();
  const partnerName = String(source.partnerName ?? "").trim();
  const couponCode = String(source.couponCode ?? "").trim().toUpperCase();
  const requestedAmount = Math.max(getNumberValue(source.requestedAmount), 0);

  if (!userProfileId) {
    throw new Error("Nao foi possivel identificar o parceiro logado.");
  }

  if (!partnerName || !couponCode) {
    throw new Error("Nao foi possivel identificar o parceiro e o cupom.");
  }

  if (requestedAmount <= 0) {
    throw new Error("O valor solicitado precisa ser maior que zero.");
  }

  return {
    userProfileId,
    couponPartnerId: String(source.couponPartnerId ?? "").trim() || null,
    partnerName,
    couponCode,
    partnerRole: normalizePartnerRole(source.partnerRole),
    requestType: normalizePartnerRewardRequestType(source.requestType),
    supportGoal: String(source.supportGoal ?? "").trim(),
    requestedAmount,
    availableAmount: Math.max(getNumberValue(source.availableAmount), 0),
    minimumAmount: Math.max(getNumberValue(source.minimumAmount), 0),
    windowStartDate: normalizeDate(source.windowStartDate) || null,
    windowEndDate: normalizeDate(source.windowEndDate) || null,
    notes: String(source.notes ?? "").trim(),
  };
}

function normalizePartnerRewardRequestReviewInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const status = normalizePartnerRewardRequestStatus(source.status);
  const adminCouponCode = String(source.adminCouponCode ?? "")
    .trim()
    .toUpperCase();
  const adminMessage = String(source.adminMessage ?? "").trim();
  const requestType = normalizePartnerRewardRequestType(source.requestType);

  if (status === "pendente") {
    throw new Error("Escolha uma acao valida para a solicitacao.");
  }

  if (requestType === "roupa" && status === "aprovado" && !adminCouponCode) {
    throw new Error("Informe o cupom liberado para aprovar esse resgate em roupa.");
  }

  if (requestType === "apoio" && status === "aprovado") {
    throw new Error("Para apoio esportivo, use marcar como pago ou recusar.");
  }

  return {
    status,
    adminCouponCode,
    adminMessage,
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

function normalizePartnerRewardRequestType(
  value: unknown,
): PartnerRewardRequestType {
  return String(value ?? "").trim().toLowerCase() === "apoio"
    ? "apoio"
    : "roupa";
}

function normalizePartnerRewardRequestStatus(
  value: unknown,
): PartnerRewardRequestStatus {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "aprovado" ||
    normalized === "pago" ||
    normalized === "recusado"
  ) {
    return normalized;
  }

  return "pendente";
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
