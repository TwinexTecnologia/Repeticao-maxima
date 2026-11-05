"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import type {
  CouponPartnerProfile,
  PartnerPersistenceState,
  PartnerRole,
} from "./repository";

const OPERATIONS_SCHEMA = "repeticao_maxima";
const CAMPAIGNS_TABLE = "parceiros_campanhas";
const CAMPAIGN_PARTICIPANTS_TABLE = "parceiros_campanhas_participantes";
const PARTNERS_TABLE = "parceiros_cupons";

export type PartnerCampaignParticipant = {
  partnerId: string;
  name: string;
  couponCode: string;
  role: PartnerRole;
  active: boolean;
};

export type PartnerCampaign = {
  id: string;
  name: string;
  description: string;
  importantMessage: string;
  useCurrentWindow: boolean;
  showRanking: boolean;
  startDate: string;
  endDate: string;
  qualificationGoal: number;
  bonusAmount: number;
  rankingLocked: boolean;
  active: boolean;
  participants: PartnerCampaignParticipant[];
  createdAt: string | null;
  updatedAt: string | null;
};

export async function loadPartnerCampaigns() {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      campaigns: [] as PartnerCampaign[],
      persistence: buildDisabledState(
        `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar campanhas.`,
      ),
    };
  }

  try {
    const [{ data: campaignRows, error: campaignsError }, { data: participantRows, error: participantsError }] =
      await Promise.all([
        supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(CAMPAIGNS_TABLE)
          .select("*")
          .order("active", { ascending: false })
          .order("start_date", { ascending: false }),
        supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(CAMPAIGN_PARTICIPANTS_TABLE)
          .select("campaign_id, partner_id"),
      ]);

    if (campaignsError) {
      throw campaignsError;
    }

    if (participantsError) {
      throw participantsError;
    }

    const partnerIds = Array.from(
      new Set((participantRows ?? []).map((row) => String(row.partner_id ?? "")).filter(Boolean)),
    );
    const partnerMap = new Map<string, CouponPartnerProfile>();

    if (partnerIds.length > 0) {
      const { data: partnersData, error: partnersError } = await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(PARTNERS_TABLE)
        .select("*")
        .in("id", partnerIds);

      if (partnersError) {
        throw partnersError;
      }

      for (const row of partnersData ?? []) {
        const partner = rowToCampaignPartner(row);
        partnerMap.set(partner.id, partner);
      }
    }

    const participantsByCampaign = new Map<string, PartnerCampaignParticipant[]>();

    for (const row of participantRows ?? []) {
      const campaignId = String(row.campaign_id ?? "");
      const partnerId = String(row.partner_id ?? "");
      const partner = partnerMap.get(partnerId);

      if (!campaignId || !partner) {
        continue;
      }

      const current = participantsByCampaign.get(campaignId) ?? [];
      current.push({
        partnerId: partner.id,
        name: partner.name,
        couponCode: partner.couponCode,
        role: partner.role,
        active: partner.active,
      });
      participantsByCampaign.set(campaignId, current);
    }

    const campaigns = (campaignRows ?? []).map((row) =>
      rowToPartnerCampaign(row, participantsByCampaign.get(String(row.id ?? "")) ?? []),
    );

    return {
      campaigns,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          campaigns.length > 0
            ? "Campanhas carregadas do Supabase."
            : "Supabase conectado. Ainda nao existem campanhas cadastradas.",
        updatedAt: getLatestUpdatedAt(campaignRows ?? []),
      },
    };
  } catch (error) {
    return {
      campaigns: [] as PartnerCampaign[],
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function createPartnerCampaign(input: unknown) {
  return savePartnerCampaignRecord(null, input);
}

export async function updatePartnerCampaign(id: string, input: unknown) {
  return savePartnerCampaignRecord(id, input);
}

async function savePartnerCampaignRecord(id: string | null, input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizePartnerCampaignInput(input);
  const now = new Date().toISOString();

  try {
    const payload = {
      name: row.name,
      description: row.description,
      start_date: row.startDate,
      end_date: row.endDate,
      qualification_goal: row.qualificationGoal,
      bonus_amount: row.bonusAmount,
      important_message: row.importantMessage,
      use_current_window: row.useCurrentWindow,
      show_ranking: row.showRanking,
      ranking_locked: row.rankingLocked,
      active: row.active,
      updated_at: now,
    };

    const query = id
      ? supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(CAMPAIGNS_TABLE)
          .update(payload)
          .eq("id", id)
      : supabase.client
          .schema(OPERATIONS_SCHEMA)
          .from(CAMPAIGNS_TABLE)
          .insert(payload);

    const { data, error } = await query.select("*").single();

    if (error || !data) {
      throw error || new Error("Nao foi possivel salvar a campanha.");
    }

    const campaignId = String(data.id ?? id ?? "");

    await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(CAMPAIGN_PARTICIPANTS_TABLE)
      .delete()
      .eq("campaign_id", campaignId);

    const participantRows = row.participantIds.map((partnerId) => ({
      campaign_id: campaignId,
      partner_id: partnerId,
    }));

    if (participantRows.length > 0) {
      const { error: participantInsertError } = await supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(CAMPAIGN_PARTICIPANTS_TABLE)
        .insert(participantRows);

      if (participantInsertError) {
        throw participantInsertError;
      }
    }

    const campaignResult = await loadPartnerCampaigns();
    const campaign =
      campaignResult.campaigns.find((item) => item.id === campaignId) || null;

    if (!campaign) {
      throw new Error("A campanha foi salva, mas nao foi possivel recarregar seus participantes.");
    }

    return {
      ok: true as const,
      campaign,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: id
          ? "Campanha atualizada com sucesso."
          : "Campanha criada com sucesso.",
        updatedAt: typeof data.updated_at === "string" ? data.updated_at : now,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

function rowToPartnerCampaign(
  row: Record<string, unknown>,
  participants: PartnerCampaignParticipant[],
): PartnerCampaign {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "").trim(),
    description: String(row.description ?? "").trim(),
    importantMessage: String(row.important_message ?? "").trim(),
    useCurrentWindow: row.use_current_window === true,
    showRanking: row.show_ranking !== false,
    startDate: normalizeDate(row.start_date) || "",
    endDate: normalizeDate(row.end_date) || "",
    qualificationGoal: Math.max(getNumberValue(row.qualification_goal), 0),
    bonusAmount: Math.max(getNumberValue(row.bonus_amount), 0),
    rankingLocked: row.ranking_locked === false ? false : true,
    active: row.active === false ? false : true,
    participants: participants.sort((left, right) => left.name.localeCompare(right.name)),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function rowToCampaignPartner(row: Record<string, unknown>): CouponPartnerProfile {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "").trim(),
    couponCode: String(row.coupon_code ?? "").trim().toUpperCase(),
    role: normalizePartnerRole(row.role),
    active: row.active === false ? false : true,
    notes: String(row.notes ?? "").trim(),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function normalizePartnerCampaignInput(input: unknown) {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const participantIds = Array.from(
    new Set(
      Array.isArray(source.participantIds)
        ? source.participantIds.map((item) => String(item ?? "").trim()).filter(Boolean)
        : [],
    ),
  );
  const useCurrentWindow =
    source.useCurrentWindow === true ||
    String(source.useCurrentWindow ?? "").trim().toLowerCase() === "true";
  let startDate = normalizeDate(source.startDate);
  let endDate = normalizeDate(source.endDate);
  const qualificationGoal = Math.max(getNumberValue(source.qualificationGoal), 0);
  const bonusAmount = Math.max(getNumberValue(source.bonusAmount), 0);
  const showRanking =
    source.showRanking === false || String(source.showRanking ?? "").trim().toLowerCase() === "false"
      ? false
      : true;

  if (!String(source.name ?? "").trim()) {
    throw new Error("Informe o nome da campanha.");
  }

  if (!startDate || !endDate) {
    throw new Error("Informe o periodo completo da campanha.");
  }

  if (startDate > endDate) {
    throw new Error("A data final da campanha precisa ser maior ou igual a data inicial.");
  }

  if (participantIds.length === 0) {
    throw new Error("Selecione pelo menos um parceiro para entrar na campanha.");
  }

  return {
    name: String(source.name ?? "").trim(),
    description: String(source.description ?? "").trim(),
    importantMessage: String(source.importantMessage ?? "").trim(),
    useCurrentWindow,
    showRanking,
    startDate,
    endDate,
    qualificationGoal,
    bonusAmount,
    rankingLocked: source.rankingLocked === false ? false : true,
    active: source.active === false ? false : true,
    participantIds,
  };
}

function normalizeDate(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function getNumberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePartnerRole(value: unknown): PartnerRole {
  return String(value ?? "").trim().toLowerCase() === "atleta"
    ? "atleta"
    : "influenciador";
}

function getLatestUpdatedAt(rows: Array<Record<string, unknown>>) {
  const ordered = rows
    .map((row) =>
      typeof row.updated_at === "string" ? row.updated_at : null,
    )
    .filter(Boolean)
    .sort()
    .reverse();

  return ordered[0] || null;
}

function buildDisabledState(message: string): PartnerPersistenceState {
  return {
    enabled: false,
    source: "disabled",
    message,
    updatedAt: null,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel concluir a operacao no Supabase.";
}
