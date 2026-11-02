"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./vip-landing.module.css";

const TRACK_ENDPOINT = "/api/public/vip-group/track";
const LANDING_SLUG = "grupo-vip";
const VISITOR_STORAGE_KEY = "rm-vip-visitor-id";
const VIEW_STORAGE_KEY = "rm-vip-last-view";
const VIEW_DEDUP_WINDOW_MS = 1000 * 60 * 60 * 6;

type VipLandingClientProps = {
  targetUrl: string;
  videoEmbedUrl: string;
  videoSrc: string;
};

type TrackingPayload = {
  eventType: "view" | "click";
  visitorId: string;
  landingSlug: string;
  pageUrl: string;
  referrerUrl: string;
  targetUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
};

const BENEFITS = [
  {
    title: "Acesso antecipado",
    description: "Primeiro aviso das ofertas.",
    icon: "flash",
  },
  {
    title: "Combos especiais",
    description: "Condicoes e campanhas VIP.",
    icon: "tag",
  },
  {
    title: "Novas colecoes",
    description: "Lancamentos antes da massa.",
    icon: "box",
  },
] as const;

export function VipLandingClient({ targetUrl, videoEmbedUrl, videoSrc }: VipLandingClientProps) {
  const searchParams = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const hasInitializedVideoRef = useRef(false);

  const trackingContext = useMemo(
    () => ({
      utmSource: searchParams.get("utm_source") ?? "",
      utmMedium: searchParams.get("utm_medium") ?? "",
      utmCampaign: searchParams.get("utm_campaign") ?? "",
      utmContent: searchParams.get("utm_content") ?? "",
      utmTerm: searchParams.get("utm_term") ?? "",
    }),
    [searchParams],
  );

  useEffect(() => {
    const visitorId = getOrCreateVisitorId();
    const now = Date.now();
    const lastTrackedAt = Number(window.localStorage.getItem(VIEW_STORAGE_KEY) ?? "0");

    if (now - lastTrackedAt < VIEW_DEDUP_WINDOW_MS) {
      return;
    }

    window.localStorage.setItem(VIEW_STORAGE_KEY, String(now));

    void sendTrackingEvent({
      eventType: "view",
      visitorId,
      landingSlug: LANDING_SLUG,
      pageUrl: window.location.href,
      referrerUrl: document.referrer,
      targetUrl,
      ...trackingContext,
    });
  }, [targetUrl, trackingContext]);

  const ctaLabel = targetUrl ? "QUERO ENTRAR NO GRUPO VIP" : "CONFIGURAR LINK DO GRUPO VIP";

  async function initializeVideoPlayback() {
    const video = heroVideoRef.current;

    if (!video || hasInitializedVideoRef.current) {
      return;
    }

    hasInitializedVideoRef.current = true;

    try {
      video.muted = false;
      video.defaultMuted = false;
      video.volume = 1;
      await video.play();
    } catch {
      hasInitializedVideoRef.current = false;
    }
  }

  useEffect(() => {
    hasInitializedVideoRef.current = false;

    if (!videoSrc) {
      return;
    }

    void initializeVideoPlayback();
  }, [videoSrc]);

  useEffect(() => {
    if (!videoSrc) {
      return;
    }

    function retryVideoPlayback() {
      void initializeVideoPlayback();
    }

    window.addEventListener("pointerdown", retryVideoPlayback, { passive: true });
    window.addEventListener("touchstart", retryVideoPlayback, { passive: true });
    window.addEventListener("keydown", retryVideoPlayback);
    document.addEventListener("visibilitychange", retryVideoPlayback);

    return () => {
      window.removeEventListener("pointerdown", retryVideoPlayback);
      window.removeEventListener("touchstart", retryVideoPlayback);
      window.removeEventListener("keydown", retryVideoPlayback);
      document.removeEventListener("visibilitychange", retryVideoPlayback);
    };
  }, [videoSrc]);

  async function handleCtaClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!targetUrl) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    setIsRedirecting(true);

    const payload: TrackingPayload = {
      eventType: "click",
      visitorId: getOrCreateVisitorId(),
      landingSlug: LANDING_SLUG,
      pageUrl: window.location.href,
      referrerUrl: document.referrer,
      targetUrl,
      ...trackingContext,
    };

    try {
      await sendTrackingEvent(payload);
    } finally {
      window.location.assign(targetUrl);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlowTop} aria-hidden="true" />
      <div className={styles.backgroundGlowBottom} aria-hidden="true" />

      <section className={styles.shell}>
        <div className={styles.badgeRow}>
          <div className={styles.badge}>BLACK ANTECIPADA</div>
          <div className={styles.badge}>GRUPO VIP</div>
        </div>
        <h1 className={styles.heroTitle}>
          A BLACK COMEÇA ANTES
          <br />
          PARA QUEM É <span className={styles.heroTitleHighlight}>MÁXIMA.</span>
        </h1>
        <p className={styles.heroDescription}>
          Entre para o Grupo VIP e tenha acesso antecipado às ofertas, combos especiais e novidades
          da Repetição Máxima.
        </p>

        <section className={styles.heroBlock}>
          <div className={styles.mediaCard}>
            <div className={styles.videoWrap}>
              {videoEmbedUrl ? (
                <iframe
                  className={styles.heroVideoFrame}
                  src={videoEmbedUrl}
                  title="Video do grupo VIP Repeticao Maxima"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : videoSrc ? (
                <div className={styles.videoStage}>
                  <video
                    ref={heroVideoRef}
                    className={styles.heroVideo}
                    src={videoSrc}
                    autoPlay
                    loop
                    playsInline
                    preload="metadata"
                    onLoadedData={initializeVideoPlayback}
                  />
                </div>
              ) : (
                <div className={styles.videoFallback}>
                  Adicione um link de video em NEXT_PUBLIC_VIP_GROUP_VIDEO_URL.
                </div>
              )}
              <div className={styles.videoOverlay} />
            </div>
          </div>

          <div className={styles.benefitRail}>
            {BENEFITS.map((benefit) => (
              <article key={benefit.title} className={styles.benefitCard}>
                <div className={styles.benefitIcon} aria-hidden="true">
                  {benefit.icon === "flash" ? (
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 4L7.8 12H11L10.3 20L16.2 10.8H13.2L14 4H12Z"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : benefit.icon === "tag" ? (
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M7.5 7H12.5L18 12.5L12.5 18L7 12.5V7.5C7 7.2 7.2 7 7.5 7Z"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinejoin="round"
                      />
                      <circle cx="9.5" cy="9.5" r="1" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 5L18 8.5V15.5L12 19L6 15.5V8.5L12 5Z"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinejoin="round"
                      />
                      <path d="M6 8.5L12 12L18 8.5" stroke="currentColor" strokeWidth="1.9" />
                    </svg>
                  )}
                </div>
                <div className={styles.benefitText}>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <a
          href={targetUrl || "#"}
          className={`${styles.primaryButton} ${!targetUrl ? styles.primaryButtonDisabled : ""}`}
          onClick={handleCtaClick}
          aria-disabled={!targetUrl}
        >
          <span className={styles.primaryButtonIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M8.5 7.5H15.5C16.9 7.5 18 8.6 18 10V13C18 14.4 16.9 15.5 15.5 15.5H12.3L9 18V15.5H8.5C7.1 15.5 6 14.4 6 13V10C6 8.6 7.1 7.5 8.5 7.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>{isRedirecting ? "ABRINDO GRUPO..." : ctaLabel}</span>
          <span className={styles.primaryButtonArrow} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M7 12H17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path
                d="M12.5 7.5L17 12L12.5 16.5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </a>
        <p className={styles.actionHint}>Grupo fechado e exclusivo no WhatsApp</p>
      </section>
    </main>
  );
}

function getOrCreateVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);

  if (existing) {
    return existing;
  }

  const nextId = `vip_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(VISITOR_STORAGE_KEY, nextId);
  return nextId;
}

async function sendTrackingEvent(payload: TrackingPayload) {
  if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const sent = navigator.sendBeacon(TRACK_ENDPOINT, blob);

    if (sent) {
      return;
    }
  }

  await fetch(TRACK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}
