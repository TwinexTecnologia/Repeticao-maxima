import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type SupabaseAuthCredentialsResult =
  | {
      ok: true;
      url: string;
      anonKey: string;
    }
  | {
      ok: false;
      missing: string[];
    };

export function getSupabaseAuthCredentials(): SupabaseAuthCredentialsResult {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "";

  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !anonKey
      ? "NEXT_PUBLIC_SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
      : null,
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
    anonKey,
  };
}

export async function createSupabaseServerAuthClient() {
  const credentials = getSupabaseAuthCredentials();

  if (!credentials.ok) {
    return credentials;
  }

  const cookieStore = await cookies();

  return {
    ok: true as const,
    client: createServerClient(credentials.url, credentials.anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // In some server rendering contexts Next does not allow mutating cookies.
          }
        },
      },
    }),
  };
}
