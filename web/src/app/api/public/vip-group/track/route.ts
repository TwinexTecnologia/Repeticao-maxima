import { NextResponse } from "next/server";

import { recordVipGroupEvent, type VipGroupEventType } from "@/lib/vip-group/repository";

export const dynamic = "force-dynamic";

type TrackBody = {
  eventType?: string;
  visitorId?: string;
  landingSlug?: string;
  pageUrl?: string;
  referrerUrl?: string;
  targetUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TrackBody;
    const eventType: VipGroupEventType = body.eventType === "click" ? "click" : "view";
    const userAgent = request.headers.get("user-agent");

    const result = await recordVipGroupEvent({
      eventType,
      visitorId: String(body.visitorId ?? ""),
      landingSlug: body.landingSlug,
      pageUrl: body.pageUrl,
      referrerUrl: body.referrerUrl,
      targetUrl: body.targetUrl,
      utmSource: body.utmSource,
      utmMedium: body.utmMedium,
      utmCampaign: body.utmCampaign,
      utmContent: body.utmContent,
      utmTerm: body.utmTerm,
      deviceType: detectDeviceType(userAgent),
    });

    return NextResponse.json(
      {
        ok: result.ok,
        message: result.ok ? "Evento registrado." : result.message,
      },
      { status: result.ok ? 200 : 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Nao foi possivel registrar o evento.",
      },
      { status: 400 },
    );
  }
}

function detectDeviceType(userAgent: string | null) {
  const value = String(userAgent ?? "").toLowerCase();

  if (!value) {
    return "unknown";
  }

  if (value.includes("ipad") || value.includes("tablet")) {
    return "tablet";
  }

  if (value.includes("mobi") || value.includes("android") || value.includes("iphone")) {
    return "mobile";
  }

  return "desktop";
}
