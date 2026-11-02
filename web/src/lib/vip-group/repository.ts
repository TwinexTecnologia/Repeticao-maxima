import { createSupabaseServerClient } from "@/lib/supabase/server";

const OPERATIONS_SCHEMA = "repeticao_maxima";
const VIP_GROUP_EVENTS_TABLE = "vip_group_events";
const DEFAULT_LANDING_SLUG = "grupo-vip";

export type VipGroupEventType = "view" | "click";

export type VipGroupTrackingInput = {
  eventType: VipGroupEventType;
  visitorId: string;
  landingSlug?: string;
  pageUrl?: string;
  referrerUrl?: string;
  targetUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  deviceType?: string;
};

export type VipGroupRecentCampaign = {
  label: string;
  source: string;
  views: number;
  clicks: number;
  ctr: number;
};

export type VipGroupRecentEvent = {
  id: string;
  createdAt: string;
  eventType: VipGroupEventType;
  utmSource: string;
  utmCampaign: string;
  utmContent: string;
  deviceType: string;
  referrerUrl: string;
};

export type VipGroupStats = {
  enabled: boolean;
  message: string;
  totalViews: number;
  totalClicks: number;
  viewsToday: number;
  clicksToday: number;
  ctr: number;
  linkConfigured: boolean;
  recentCampaigns: VipGroupRecentCampaign[];
  recentEvents: VipGroupRecentEvent[];
};

type VipGroupEventRow = {
  id: string | number;
  created_at: string | null;
  event_type: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  device_type: string | null;
  referrer_url: string | null;
};

export async function recordVipGroupEvent(input: VipGroupTrackingInput) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      message: `Supabase nao configurado: ${supabase.missing.join(", ")}`,
    };
  }

  const visitorId = normalizeText(input.visitorId, 120);

  if (!visitorId) {
    return {
      ok: false as const,
      message: "visitorId obrigatorio para registrar o evento.",
    };
  }

  const eventType = input.eventType === "click" ? "click" : "view";

  const { error } = await supabase.client.schema(OPERATIONS_SCHEMA).from(VIP_GROUP_EVENTS_TABLE).insert({
    landing_slug: normalizeText(input.landingSlug, 80) || DEFAULT_LANDING_SLUG,
    event_type: eventType,
    visitor_id: visitorId,
    page_url: normalizeText(input.pageUrl, 500),
    referrer_url: normalizeText(input.referrerUrl, 500),
    target_url: normalizeText(input.targetUrl, 500),
    utm_source: normalizeText(input.utmSource, 120),
    utm_medium: normalizeText(input.utmMedium, 120),
    utm_campaign: normalizeText(input.utmCampaign, 180),
    utm_content: normalizeText(input.utmContent, 180),
    utm_term: normalizeText(input.utmTerm, 180),
    device_type: normalizeDeviceType(input.deviceType),
  });

  if (error) {
    return {
      ok: false as const,
      message: error.message,
    };
  }

  return {
    ok: true as const,
  };
}

export async function loadVipGroupStats(): Promise<VipGroupStats> {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      enabled: false,
      message: `Supabase nao configurado: ${supabase.missing.join(", ")}`,
      totalViews: 0,
      totalClicks: 0,
      viewsToday: 0,
      clicksToday: 0,
      ctr: 0,
      linkConfigured: Boolean(process.env.NEXT_PUBLIC_VIP_GROUP_URL?.trim()),
      recentCampaigns: [],
      recentEvents: [],
    };
  }

  try {
    const todayStart = getTodayStartIsoString();

    const [
      totalViewsResult,
      totalClicksResult,
      viewsTodayResult,
      clicksTodayResult,
      recentEventsResult,
    ] = await Promise.all([
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(VIP_GROUP_EVENTS_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("event_type", "view"),
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(VIP_GROUP_EVENTS_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("event_type", "click"),
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(VIP_GROUP_EVENTS_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("event_type", "view")
        .gte("created_at", todayStart),
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(VIP_GROUP_EVENTS_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("event_type", "click")
        .gte("created_at", todayStart),
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(VIP_GROUP_EVENTS_TABLE)
        .select("id, created_at, event_type, utm_source, utm_campaign, utm_content, device_type, referrer_url")
        .order("created_at", { ascending: false })
        .limit(160),
    ]);

    const firstError =
      totalViewsResult.error ||
      totalClicksResult.error ||
      viewsTodayResult.error ||
      clicksTodayResult.error ||
      recentEventsResult.error;

    if (firstError) {
      return {
        enabled: false,
        message: firstError.message,
        totalViews: 0,
        totalClicks: 0,
        viewsToday: 0,
        clicksToday: 0,
        ctr: 0,
        linkConfigured: Boolean(process.env.NEXT_PUBLIC_VIP_GROUP_URL?.trim()),
        recentCampaigns: [],
        recentEvents: [],
      };
    }

    const totalViews = totalViewsResult.count ?? 0;
    const totalClicks = totalClicksResult.count ?? 0;
    const viewsToday = viewsTodayResult.count ?? 0;
    const clicksToday = clicksTodayResult.count ?? 0;
    const recentRows = ((recentEventsResult.data as VipGroupEventRow[] | null) ?? []).map(mapRecentEventRow);

    return {
      enabled: true,
      message:
        totalViews > 0 || totalClicks > 0
          ? "Rastreamento ativo para visitas e cliques."
          : "Landing pronta. O rastreamento vai aparecer aqui assim que os acessos chegarem.",
      totalViews,
      totalClicks,
      viewsToday,
      clicksToday,
      ctr: totalViews > 0 ? totalClicks / totalViews : 0,
      linkConfigured: Boolean(process.env.NEXT_PUBLIC_VIP_GROUP_URL?.trim()),
      recentCampaigns: buildRecentCampaigns(recentRows),
      recentEvents: recentRows.slice(0, 12),
    };
  } catch (error) {
    return {
      enabled: false,
      message: error instanceof Error ? error.message : "Nao foi possivel carregar as metricas.",
      totalViews: 0,
      totalClicks: 0,
      viewsToday: 0,
      clicksToday: 0,
      ctr: 0,
      linkConfigured: Boolean(process.env.NEXT_PUBLIC_VIP_GROUP_URL?.trim()),
      recentCampaigns: [],
      recentEvents: [],
    };
  }
}

function mapRecentEventRow(row: VipGroupEventRow): VipGroupRecentEvent {
  return {
    id: String(row.id ?? ""),
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    eventType: row.event_type === "click" ? "click" : "view",
    utmSource: normalizeText(row.utm_source, 120),
    utmCampaign: normalizeText(row.utm_campaign, 180),
    utmContent: normalizeText(row.utm_content, 180),
    deviceType: normalizeDeviceType(row.device_type),
    referrerUrl: normalizeText(row.referrer_url, 500),
  };
}

function buildRecentCampaigns(events: VipGroupRecentEvent[]) {
  const campaignMap = new Map<string, VipGroupRecentCampaign>();

  for (const event of events) {
    const source = event.utmSource || "Direto";
    const label = event.utmCampaign || "Sem campanha";
    const key = `${source}::${label}`;
    const current = campaignMap.get(key) ?? {
      label,
      source,
      views: 0,
      clicks: 0,
      ctr: 0,
    };

    if (event.eventType === "click") {
      current.clicks += 1;
    } else {
      current.views += 1;
    }

    campaignMap.set(key, current);
  }

  return Array.from(campaignMap.values())
    .map((item) => ({
      ...item,
      ctr: item.views > 0 ? item.clicks / item.views : 0,
    }))
    .sort((left, right) => right.clicks - left.clicks || right.views - left.views)
    .slice(0, 6);
}

function getTodayStartIsoString() {
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  return todayStart.toISOString();
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeDeviceType(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "mobile" || normalized === "desktop" || normalized === "tablet") {
    return normalized;
  }

  return "unknown";
}
