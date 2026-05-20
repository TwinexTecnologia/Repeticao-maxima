import { createClient } from "@supabase/supabase-js";

type SupabaseCredentialsResult =
  | {
      ok: true;
      url: string;
      serviceRoleKey: string;
    }
  | {
      ok: false;
      missing: string[];
    };

export function getSupabaseServerCredentials(): SupabaseCredentialsResult {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
    };
  }

  return {
    ok: true,
    url,
    serviceRoleKey,
  };
}

export function createSupabaseServerClient() {
  const credentials = getSupabaseServerCredentials();

  if (!credentials.ok) {
    return credentials;
  }

  return {
    ok: true as const,
    client: createClient(credentials.url, credentials.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}
