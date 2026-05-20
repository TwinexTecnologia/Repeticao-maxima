import {
  defaultFinanceConfig,
  financeConfigToRow,
  normalizeFinanceConfig,
  rowToFinanceConfig,
  type FinanceConfig,
} from "./config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FINANCE_SCHEMA = "repeticao_maxima";
const FINANCE_TABLE = "financeiro_configuracoes";
const DEFAULT_ROW_ID = "default";

export type FinancePersistenceState = {
  enabled: boolean;
  source: "supabase" | "disabled";
  message: string;
  updatedAt: string | null;
};

export async function loadFinanceConfig() {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      config: { ...defaultFinanceConfig },
      persistence: {
        enabled: false,
        source: "disabled" as const,
        message: `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar no Supabase.`,
        updatedAt: null,
      },
    };
  }

  try {
    const { data, error } = await supabase.client
      .schema(FINANCE_SCHEMA)
      .from(FINANCE_TABLE)
      .select("*")
      .eq("id", DEFAULT_ROW_ID)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return {
      config: rowToFinanceConfig(data),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: data
          ? "Configuracao carregada do Supabase."
          : "Supabase conectado. Ainda nao existe configuracao salva; usando valores padrao.",
        updatedAt:
          data && typeof data.updated_at === "string" ? data.updated_at : null,
      },
    };
  } catch (error) {
    return {
      config: { ...defaultFinanceConfig },
      persistence: {
        enabled: false,
        source: "disabled" as const,
        message: getErrorMessage(error),
        updatedAt: null,
      },
    };
  }
}

export async function saveFinanceConfig(configInput: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: {
        enabled: false,
        source: "disabled" as const,
        message: `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
        updatedAt: null,
      },
    };
  }

  const config = normalizeFinanceConfig(
    configInput as Partial<Record<keyof FinanceConfig, unknown>>,
  );

  try {
    const row = financeConfigToRow(config);
    const { data, error } = await supabase.client
      .schema(FINANCE_SCHEMA)
      .from(FINANCE_TABLE)
      .upsert(row, {
        onConflict: "id",
      })
      .select("updated_at")
      .single();

    if (error) {
      throw error;
    }

    return {
      ok: true as const,
      config,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "Configuracao salva no Supabase.",
        updatedAt:
          data && typeof data.updated_at === "string" ? data.updated_at : row.updated_at,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      persistence: {
        enabled: false,
        source: "disabled" as const,
        message: getErrorMessage(error),
        updatedAt: null,
      },
    };
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `Nao foi possivel acessar o Supabase: ${error.message}`;
  }

  return "Nao foi possivel acessar o Supabase para salvar a configuracao.";
}
