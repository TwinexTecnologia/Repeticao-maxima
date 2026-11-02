import type { Metadata } from "next";
import { Suspense } from "react";

import { VipLandingClient } from "./vip-landing-client";
import styles from "./vip-landing.module.css";

export const metadata: Metadata = {
  title: "Grupo VIP | Repeticao Maxima",
  description:
    "Entre no grupo VIP da Repeticao Maxima para receber novidades, avisos e oportunidades antes de todo mundo.",
};

const DEFAULT_VIP_GROUP_URL = "https://chat.whatsapp.com/GkVAl2iy7FT0X5pzKNTBOT";

export default function GrupoVipPage() {
  const targetUrl = process.env.NEXT_PUBLIC_VIP_GROUP_URL?.trim() || DEFAULT_VIP_GROUP_URL;
  const videoUrl =
    process.env.NEXT_PUBLIC_VIP_GROUP_VIDEO_URL?.trim() ||
    "https://cdtouwfxwuhnlzqhcagy.supabase.co/storage/v1/object/public/landing/IMG_3587.MOV";
  const videoMedia = resolveVideoMedia(videoUrl);

  return (
    <Suspense fallback={<div className={styles.page} />}>
      <VipLandingClient
        targetUrl={targetUrl}
        videoEmbedUrl={videoMedia.embedUrl}
        videoSrc={videoMedia.directUrl}
      />
    </Suspense>
  );
}

function resolveVideoMedia(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      embedUrl: "",
      directUrl: "",
    };
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return {
        embedUrl: videoId
          ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`
          : "",
        directUrl: "",
      };
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const pathParts = url.pathname.split("/").filter(Boolean);
      const shortsIndex = pathParts.findIndex((part) => part === "shorts");

      if (shortsIndex >= 0 && pathParts[shortsIndex + 1]) {
        return {
          embedUrl: `https://www.youtube.com/embed/${pathParts[shortsIndex + 1]}?rel=0&modestbranding=1`,
          directUrl: "",
        };
      }

      const videoId = url.searchParams.get("v") ?? "";
      return {
        embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1` : "",
        directUrl: "",
      };
    }

    return {
      embedUrl: "",
      directUrl: trimmed,
    };
  } catch {
    return {
      embedUrl: "",
      directUrl: trimmed,
    };
  }
}
