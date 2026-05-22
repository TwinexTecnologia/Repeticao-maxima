import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { SupabaseClient } from "@supabase/supabase-js";

const OPERATIONS_SCHEMA = "repeticao_maxima";
const USERS_TABLE = "profiles_usuarios";
const PERMISSIONS_TABLE = "permissoes_usuario";
const PARTNER_TABLE = "parceiros_cupons";

export type UserMenuPermissionKey =
  | "dashboard"
  | "compras"
  | "estoque"
  | "pedidos"
  | "financeiro"
  | "nuvemshop"
  | "influenciadores"
  | "empresa"
  | "usuarios";

export type UserMenuPermissions = Record<UserMenuPermissionKey, boolean>;

export type UserAccessPersistenceState = {
  enabled: boolean;
  source: "supabase" | "disabled";
  message: string;
  updatedAt: string | null;
};

export type EmployeeAccessUser = {
  id: string;
  authUserId: string | null;
  fullName: string;
  email: string;
  active: boolean;
  notes: string;
  permissions: UserMenuPermissions;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PartnerUserType = "influenciador" | "atleta" | "afiliado";
export type PartnerPayoutMethod = "pix" | "bancario";

export type PartnerAccessUser = {
  id: string;
  authUserId: string | null;
  linkedPartnerId: string | null;
  linkedPartnerName: string;
  linkedCouponCode: string;
  fullName: string;
  email: string;
  birthDate: string | null;
  age: number | null;
  shirtSize: string;
  payoutMethod: PartnerPayoutMethod;
  pixKey: string;
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  bankAccountType: string;
  partnerType: PartnerUserType;
  active: boolean;
  notes: string;
  hasLogin: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type UserPartnerOption = {
  id: string;
  name: string;
  couponCode: string;
  role: "influenciador" | "atleta";
};

const DEFAULT_PERMISSIONS: UserMenuPermissions = {
  dashboard: true,
  compras: false,
  estoque: false,
  pedidos: false,
  financeiro: false,
  nuvemshop: false,
  influenciadores: false,
  empresa: false,
  usuarios: false,
};

export async function loadUserAccessModuleData() {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      employees: [] as EmployeeAccessUser[],
      partners: [] as PartnerAccessUser[],
      partnerOptions: [] as UserPartnerOption[],
      persistence: buildDisabledState(
        `Persistencia desativada. Configure ${supabase.missing.join(" e ")} para salvar usuarios no Supabase.`,
      ),
    };
  }

  try {
    const [profilesResult, permissionsResult, partnerResult] = await Promise.all([
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(USERS_TABLE)
        .select("*")
        .order("user_type", { ascending: true })
        .order("full_name", { ascending: true }),
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(PERMISSIONS_TABLE)
        .select("*"),
      supabase.client
        .schema(OPERATIONS_SCHEMA)
        .from(PARTNER_TABLE)
        .select("id, name, coupon_code, role")
        .order("name", { ascending: true }),
    ]);

    if (profilesResult.error) {
      throw profilesResult.error;
    }

    if (permissionsResult.error) {
      throw permissionsResult.error;
    }

    if (partnerResult.error) {
      throw partnerResult.error;
    }

    const permissionsMap = new Map<string, UserMenuPermissions>();

    for (const row of permissionsResult.data ?? []) {
      const profileId = String(row.profile_id ?? "");

      if (!profileId) {
        continue;
      }

      permissionsMap.set(profileId, rowToPermissions(row));
    }

    const partnerOptions = (partnerResult.data ?? []).map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? "").trim(),
      couponCode: String(row.coupon_code ?? "").trim().toUpperCase(),
      role: normalizeExistingPartnerRole(row.role),
    }));

    const partnerOptionMap = new Map(partnerOptions.map((item) => [item.id, item] as const));
    const employees: EmployeeAccessUser[] = [];
    const partners: PartnerAccessUser[] = [];

    for (const row of profilesResult.data ?? []) {
      const userType = String(row.user_type ?? "").trim().toLowerCase();

      if (userType === "funcionario") {
        employees.push(
          rowToEmployeeAccessUser(row, permissionsMap.get(String(row.id ?? ""))),
        );
        continue;
      }

      if (userType === "parceiro") {
        partners.push(rowToPartnerAccessUser(row, partnerOptionMap.get(String(row.coupon_partner_id ?? ""))));
      }
    }

    return {
      employees,
      partners,
      partnerOptions,
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message:
          employees.length > 0 || partners.length > 0
            ? "Usuarios e permissoes carregados do Supabase."
            : "Supabase conectado. Ainda nao existem usuarios cadastrados nessa area.",
        updatedAt: getLatestUpdatedAt(profilesResult.data ?? []),
      },
    };
  } catch (error) {
    return {
      employees: [] as EmployeeAccessUser[],
      partners: [] as PartnerAccessUser[],
      partnerOptions: [] as UserPartnerOption[],
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function createEmployeeAccessUser(input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizeEmployeeInput(input);
  let authUserId: string | null = null;

  try {
    const authResult = await supabase.client.auth.admin.createUser({
      email: row.email,
      password: row.password,
      email_confirm: true,
      user_metadata: {
        app_scope: OPERATIONS_SCHEMA,
        user_type: "funcionario",
        full_name: row.fullName,
      },
    });

    if (authResult.error || !authResult.data.user) {
      throw authResult.error || new Error("Nao foi possivel criar o login do funcionario no Supabase Auth.");
    }

    authUserId = authResult.data.user.id;

    const { data: profileData, error: profileError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(USERS_TABLE)
      .insert({
        auth_user_id: authUserId,
        user_type: "funcionario",
        full_name: row.fullName,
        email: row.email,
        active: true,
        notes: row.notes,
      })
      .select("*")
      .single();

    if (profileError || !profileData) {
      throw profileError || new Error("Nao foi possivel salvar o perfil do funcionario.");
    }

    const { error: permissionsError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(PERMISSIONS_TABLE)
      .insert({
        profile_id: profileData.id,
        can_dashboard: row.permissions.dashboard,
        can_compras: row.permissions.compras,
        can_estoque: row.permissions.estoque,
        can_pedidos: row.permissions.pedidos,
        can_financeiro: row.permissions.financeiro,
        can_nuvemshop: row.permissions.nuvemshop,
        can_influenciadores: row.permissions.influenciadores,
        can_empresa: row.permissions.empresa,
        can_usuarios: row.permissions.usuarios,
      });

    if (permissionsError) {
      throw permissionsError;
    }

    return {
      ok: true as const,
      employee: rowToEmployeeAccessUser(profileData, row.permissions),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: "Funcionario criado com login e permissoes no Supabase.",
        updatedAt:
          typeof profileData.updated_at === "string" ? profileData.updated_at : null,
      },
    };
  } catch (error) {
    if (authUserId) {
      await supabase.client.auth.admin.deleteUser(authUserId);
    }

    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

export async function createPartnerAccessUser(input: unknown) {
  const supabase = createSupabaseServerClient();

  if (!supabase.ok) {
    return {
      ok: false as const,
      persistence: buildDisabledState(
        `Persistencia indisponivel. Configure ${supabase.missing.join(" e ")}.`,
      ),
    };
  }

  const row = normalizePartnerInput(input);
  let authUserId: string | null = null;

  try {
    if (row.createAccess) {
      const authResult = await supabase.client.auth.admin.createUser({
        email: row.email,
        password: row.password,
        email_confirm: true,
        user_metadata: {
          app_scope: OPERATIONS_SCHEMA,
          user_type: "parceiro",
          partner_type: row.partnerType,
          full_name: row.fullName,
        },
      });

      if (authResult.error || !authResult.data.user) {
        throw authResult.error || new Error("Nao foi possivel criar o login do parceiro no Supabase Auth.");
      }

      authUserId = authResult.data.user.id;
    }

    const { data: profileData, error: profileError } = await supabase.client
      .schema(OPERATIONS_SCHEMA)
      .from(USERS_TABLE)
      .insert({
        auth_user_id: authUserId,
        coupon_partner_id: row.linkedPartnerId,
        user_type: "parceiro",
        partner_type: row.partnerType,
        full_name: row.fullName,
        email: row.email,
        birth_date: row.birthDate,
        shirt_size: row.shirtSize,
        payout_method: row.payoutMethod,
        pix_key: row.pixKey,
        bank_name: row.bankName,
        bank_agency: row.bankAgency,
        bank_account: row.bankAccount,
        bank_account_type: row.bankAccountType,
        active: row.active,
        notes: row.notes,
      })
      .select("*")
      .single();

    if (profileError || !profileData) {
      throw profileError || new Error("Nao foi possivel salvar o parceiro.");
    }

    const linkedPartner = row.linkedPartnerId
      ? await loadSinglePartnerOption(supabase.client, row.linkedPartnerId)
      : null;

    return {
      ok: true as const,
      partner: rowToPartnerAccessUser(profileData, linkedPartner),
      persistence: {
        enabled: true,
        source: "supabase" as const,
        message: row.createAccess
          ? "Parceiro salvo com dados pessoais e login pronto."
          : "Parceiro salvo com dados pessoais no schema repeticao_maxima.",
        updatedAt:
          typeof profileData.updated_at === "string" ? profileData.updated_at : null,
      },
    };
  } catch (error) {
    if (authUserId) {
      await supabase.client.auth.admin.deleteUser(authUserId);
    }

    return {
      ok: false as const,
      persistence: buildDisabledState(getErrorMessage(error)),
    };
  }
}

async function loadSinglePartnerOption(
  client: SupabaseClient,
  id: string,
) {
  const { data, error } = await client
    .schema(OPERATIONS_SCHEMA)
    .from(PARTNER_TABLE)
    .select("id, name, coupon_code, role")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? "").trim(),
    couponCode: String(data.coupon_code ?? "").trim().toUpperCase(),
    role: normalizeExistingPartnerRole(data.role),
  } satisfies UserPartnerOption;
}

function rowToEmployeeAccessUser(
  row: Record<string, unknown>,
  permissions?: UserMenuPermissions,
): EmployeeAccessUser {
  return {
    id: String(row.id ?? ""),
    authUserId: row.auth_user_id ? String(row.auth_user_id) : null,
    fullName: String(row.full_name ?? "").trim(),
    email: String(row.email ?? "").trim().toLowerCase(),
    active: row.active === false ? false : true,
    notes: String(row.notes ?? "").trim(),
    permissions: permissions ?? { ...DEFAULT_PERMISSIONS },
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function rowToPartnerAccessUser(
  row: Record<string, unknown>,
  linkedPartner?: UserPartnerOption | null,
): PartnerAccessUser {
  const birthDate = normalizeDate(row.birth_date) || null;

  return {
    id: String(row.id ?? ""),
    authUserId: row.auth_user_id ? String(row.auth_user_id) : null,
    linkedPartnerId: row.coupon_partner_id ? String(row.coupon_partner_id) : null,
    linkedPartnerName: linkedPartner?.name || "",
    linkedCouponCode: linkedPartner?.couponCode || "",
    fullName: String(row.full_name ?? "").trim(),
    email: String(row.email ?? "").trim().toLowerCase(),
    birthDate,
    age: birthDate ? getAgeFromDate(birthDate) : null,
    shirtSize: String(row.shirt_size ?? "").trim(),
    payoutMethod: normalizePayoutMethod(row.payout_method),
    pixKey: String(row.pix_key ?? "").trim(),
    bankName: String(row.bank_name ?? "").trim(),
    bankAgency: String(row.bank_agency ?? "").trim(),
    bankAccount: String(row.bank_account ?? "").trim(),
    bankAccountType: String(row.bank_account_type ?? "").trim(),
    partnerType: normalizePartnerUserType(row.partner_type),
    active: row.active === false ? false : true,
    notes: String(row.notes ?? "").trim(),
    hasLogin: Boolean(row.auth_user_id),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function rowToPermissions(row: Record<string, unknown>): UserMenuPermissions {
  return {
    dashboard: row.can_dashboard === true,
    compras: row.can_compras === true,
    estoque: row.can_estoque === true,
    pedidos: row.can_pedidos === true,
    financeiro: row.can_financeiro === true,
    nuvemshop: row.can_nuvemshop === true,
    influenciadores: row.can_influenciadores === true,
    empresa: row.can_empresa === true,
    usuarios: row.can_usuarios === true,
  };
}

function normalizeEmployeeInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const fullName = String(source.fullName ?? "").trim();
  const email = String(source.email ?? "").trim().toLowerCase();
  const password = String(source.password ?? "").trim();

  if (!fullName) {
    throw new Error("Informe o nome do funcionario.");
  }

  if (!isValidEmail(email)) {
    throw new Error("Informe um e-mail valido para o login do funcionario.");
  }

  if (password.length < 6) {
    throw new Error("A senha do funcionario precisa ter pelo menos 6 caracteres.");
  }

  return {
    fullName,
    email,
    password,
    notes: String(source.notes ?? "").trim(),
    permissions: normalizePermissions(source.permissions),
  };
}

function normalizePartnerInput(input: unknown) {
  const source = isRecord(input) ? input : {};
  const fullName = String(source.fullName ?? "").trim();
  const email = String(source.email ?? "").trim().toLowerCase();
  const createAccess = source.createAccess === true;
  const password = String(source.password ?? "").trim();
  const payoutMethod = normalizePayoutMethod(source.payoutMethod);
  const linkedPartnerId = String(source.linkedPartnerId ?? "").trim() || null;
  const partnerType = normalizePartnerUserType(source.partnerType);
  const birthDate = normalizeDate(source.birthDate) || null;

  if (!fullName) {
    throw new Error("Informe o nome do parceiro.");
  }

  if (!isValidEmail(email)) {
    throw new Error("Informe um e-mail valido para o parceiro.");
  }

  if (createAccess && password.length < 6) {
    throw new Error("A senha do parceiro precisa ter pelo menos 6 caracteres.");
  }

  if (payoutMethod === "pix" && !String(source.pixKey ?? "").trim()) {
    throw new Error("Informe a chave Pix quando o recebimento for por Pix.");
  }

  if (
    payoutMethod === "bancario" &&
    (!String(source.bankName ?? "").trim() ||
      !String(source.bankAgency ?? "").trim() ||
      !String(source.bankAccount ?? "").trim())
  ) {
    throw new Error("Preencha banco, agencia e conta para dados bancarios.");
  }

  return {
    linkedPartnerId,
    partnerType,
    fullName,
    email,
    birthDate,
    shirtSize: String(source.shirtSize ?? "").trim(),
    payoutMethod,
    pixKey: String(source.pixKey ?? "").trim(),
    bankName: String(source.bankName ?? "").trim(),
    bankAgency: String(source.bankAgency ?? "").trim(),
    bankAccount: String(source.bankAccount ?? "").trim(),
    bankAccountType: String(source.bankAccountType ?? "").trim(),
    active: source.active === false ? false : true,
    notes: String(source.notes ?? "").trim(),
    createAccess,
    password,
  };
}

function normalizePermissions(value: unknown): UserMenuPermissions {
  const source = isRecord(value) ? value : {};

  return {
    dashboard: source.dashboard === true,
    compras: source.compras === true,
    estoque: source.estoque === true,
    pedidos: source.pedidos === true,
    financeiro: source.financeiro === true,
    nuvemshop: source.nuvemshop === true,
    influenciadores: source.influenciadores === true,
    empresa: source.empresa === true,
    usuarios: source.usuarios === true,
  };
}

function normalizeExistingPartnerRole(value: unknown): "influenciador" | "atleta" {
  return String(value ?? "").trim().toLowerCase() === "atleta"
    ? "atleta"
    : "influenciador";
}

function normalizePartnerUserType(value: unknown): PartnerUserType {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "atleta" || normalized === "afiliado") {
    return normalized;
  }

  return "influenciador";
}

function normalizePayoutMethod(value: unknown): PartnerPayoutMethod {
  return String(value ?? "").trim().toLowerCase() === "bancario"
    ? "bancario"
    : "pix";
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

function getAgeFromDate(value: string) {
  const birthDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() &&
      now.getDate() >= birthDate.getDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return Math.max(age, 0);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildDisabledState(message: string): UserAccessPersistenceState {
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

  return "Nao foi possivel concluir a operacao de usuarios no Supabase.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
