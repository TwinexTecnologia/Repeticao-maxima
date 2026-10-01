const PARTNER_STORE_UTM_SOURCE = "painel-parceiro";
const PARTNER_STORE_UTM_MEDIUM = "saldo";
const PARTNER_STORE_UTM_CAMPAIGN = "batimento-meta";
const DEFAULT_PARTNER_STOREFRONT_URL = "https://repeticaomaxima.com.br";

type UnknownRecord = Record<string, unknown>;

export function resolvePartnerStorefrontUrl() {
  const configured =
    process.env.NUVEMSHOP_STOREFRONT_URL?.trim() ||
    process.env.NEXT_PUBLIC_STOREFRONT_URL?.trim() ||
    DEFAULT_PARTNER_STOREFRONT_URL;

  if (!configured) {
    return null;
  }

  return configured.replace(/\/$/, "");
}

export function buildPartnerStoreRedirectUrl(
  storefrontUrl: string,
  sessionToken: string,
  nextPath = "/",
) {
  const target = new URL(nextPath || "/", ensureTrailingSlash(storefrontUrl));

  target.searchParams.set("utm_source", PARTNER_STORE_UTM_SOURCE);
  target.searchParams.set("utm_medium", PARTNER_STORE_UTM_MEDIUM);
  target.searchParams.set("utm_campaign", PARTNER_STORE_UTM_CAMPAIGN);
  target.searchParams.set("utm_term", sessionToken);

  return target.toString();
}

export function extractPartnerStoreSessionToken(payload: unknown) {
  const root = getRecordValue(payload);

  if (!root) {
    return "";
  }

  const directCandidates = [
    getTextValue(root.utm_term),
    getTextValue(root.utmTerm),
    getTextValue(getRecordValue(root.utm)?.term),
    getTextValue(getRecordValue(root.utm)?.utm_term),
    getTextValue(getRecordValue(root.cart)?.utm_term),
    getTextValue(getRecordValue(getRecordValue(root.cart)?.utm)?.term),
    getSessionTokenFromUtmCollection(root.utm),
    getSessionTokenFromUtmCollection(getRecordValue(root.cart)?.utm),
  ].filter(Boolean);

  for (const candidate of directCandidates) {
    const normalized = normalizeSessionToken(candidate);

    if (normalized) {
      return normalized;
    }
  }

  const urlCandidates = [
    getTextValue(root.landing_url),
    getTextValue(root.url),
    getTextValue(getRecordValue(root.cart)?.landing_url),
    getTextValue(getRecordValue(root.cart)?.url),
  ].filter(Boolean);

  for (const candidate of urlCandidates) {
    const parsed = extractUtmTermFromUrl(candidate);
    const normalized = normalizeSessionToken(parsed);

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function extractUtmTermFromUrl(value: string) {
  try {
    return new URL(value).searchParams.get("utm_term") || "";
  } catch {
    return "";
  }
}

function normalizeSessionToken(value: string) {
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{16,}$/.test(normalized) ? normalized : "";
}

function getSessionTokenFromUtmCollection(value: unknown) {
  const records = getRecordArrayValue(value);

  for (const record of records) {
    const candidate = normalizeSessionToken(
      getTextValue(record.utm_term) || getTextValue(record.term),
    );

    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function getRecordArrayValue(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is UnknownRecord =>
      typeof item === "object" && item !== null,
  );
}

function getRecordValue(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
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
