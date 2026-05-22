import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";
import type {
  PartnerUserType,
  UserMenuPermissionKey,
  UserMenuPermissions,
} from "@/lib/usuarios/repository";

const OPERATIONS_SCHEMA = "repeticao_maxima";

type NavigationIcon =
  | "dashboard"
  | "compras"
  | "estoque"
  | "pedidos"
  | "financeiro"
  | "nuvemshop"
  | "influenciadores"
  | "empresa"
  | "usuarios";

export type AppNavigationItem = {
  href: string;
  label: string;
  hint: string;
  icon: NavigationIcon;
  permission: UserMenuPermissionKey;
};

export type AuthenticatedAppUser = {
  authUserId: string;
  profileId: string | null;
  fullName: string;
  email: string;
  active: boolean;
  userType: "funcionario" | "parceiro" | "desconhecido";
  partnerType: PartnerUserType | null;
  permissions: UserMenuPermissions;
};

export const APP_NAVIGATION_ITEMS: AppNavigationItem[] = [
  {
    href: "/",
    label: "Dashboard",
    hint: "Visao geral",
    icon: "dashboard",
    permission: "dashboard",
  },
  {
    href: "/compras",
    label: "Compras",
    hint: "Lotes e dividas",
    icon: "compras",
    permission: "compras",
  },
  {
    href: "/estoque",
    label: "Estoque",
    hint: "Base por cor",
    icon: "estoque",
    permission: "estoque",
  },
  {
    href: "/pedidos",
    label: "Pedidos",
    hint: "Venda e producao",
    icon: "pedidos",
    permission: "pedidos",
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    hint: "Margem liquida",
    icon: "financeiro",
    permission: "financeiro",
  },
  {
    href: "/integracoes/nuvemshop",
    label: "Nuvemshop",
    hint: "Pedidos reais",
    icon: "nuvemshop",
    permission: "nuvemshop",
  },
  {
    href: "/influenciadores",
    label: "Influenciadores",
    hint: "Cupons e brindes",
    icon: "influenciadores",
    permission: "influenciadores",
  },
  {
    href: "/empresa",
    label: "Empresa",
    hint: "Dados e regras",
    icon: "empresa",
    permission: "empresa",
  },
  {
    href: "/usuarios",
    label: "Usuarios",
    hint: "Permissoes",
    icon: "usuarios",
    permission: "usuarios",
  },
];

const EMPTY_PERMISSIONS: UserMenuPermissions = {
  dashboard: false,
  compras: false,
  estoque: false,
  pedidos: false,
  financeiro: false,
  nuvemshop: false,
  influenciadores: false,
  empresa: false,
  usuarios: false,
};

export async function loadAuthenticatedAppUser(): Promise<AuthenticatedAppUser | null> {
  const authClientResult = await createSupabaseServerAuthClient();

  if (!authClientResult.ok) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await authClientResult.client.auth.getUser();

  if (error || !user) {
    return null;
  }

  const adminResult = createSupabaseServerClient();

  if (!adminResult.ok) {
    return null;
  }

  const { data: profile, error: profileError } = await adminResult.client
    .schema(OPERATIONS_SCHEMA)
    .from("profiles_usuarios")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      authUserId: user.id,
      profileId: null,
      fullName:
        String(user.user_metadata?.full_name ?? "").trim() ||
        user.email ||
        "Usuario",
      email: user.email || "",
      active: false,
      userType: "desconhecido",
      partnerType: null,
      permissions: { ...EMPTY_PERMISSIONS },
    };
  }

  let permissions = { ...EMPTY_PERMISSIONS };

  if (String(profile.user_type ?? "") === "funcionario") {
    const { data: permissionRow } = await adminResult.client
      .schema(OPERATIONS_SCHEMA)
      .from("permissoes_usuario")
      .select("*")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (permissionRow) {
      permissions = {
        dashboard: permissionRow.can_dashboard === true,
        compras: permissionRow.can_compras === true,
        estoque: permissionRow.can_estoque === true,
        pedidos: permissionRow.can_pedidos === true,
        financeiro: permissionRow.can_financeiro === true,
        nuvemshop: permissionRow.can_nuvemshop === true,
        influenciadores: permissionRow.can_influenciadores === true,
        empresa: permissionRow.can_empresa === true,
        usuarios: permissionRow.can_usuarios === true,
      };
    }
  }

  return {
    authUserId: user.id,
    profileId: String(profile.id ?? ""),
    fullName:
      String(profile.full_name ?? "").trim() ||
      String(user.user_metadata?.full_name ?? "").trim() ||
      user.email ||
      "Usuario",
    email: String(profile.email ?? "").trim().toLowerCase() || user.email || "",
    active: profile.active === true,
    userType: normalizeUserType(profile.user_type),
    partnerType: normalizePartnerType(profile.partner_type),
    permissions,
  };
}

export async function requirePageAccess(currentPath: string) {
  const user = await loadAuthenticatedAppUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  }

  if (currentPath.startsWith("/acesso-negado")) {
    return {
      user,
      navigationItems: APP_NAVIGATION_ITEMS.filter(
        (item) => user.permissions[item.permission],
      ),
    };
  }

  if (!user.active) {
    redirect("/acesso-negado");
  }

  const requiredPermission = resolveRequiredPermission(currentPath);

  if (requiredPermission && !user.permissions[requiredPermission]) {
    redirect("/acesso-negado");
  }

  return {
    user,
    navigationItems: APP_NAVIGATION_ITEMS.filter(
      (item) => user.permissions[item.permission],
    ),
  };
}

export async function authorizeApiAccess(permission: UserMenuPermissionKey) {
  const user = await loadAuthenticatedAppUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Voce precisa estar autenticado para usar essa rota.",
        },
        { status: 401 },
      ),
    };
  }

  if (!user.active || !user.permissions[permission]) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Seu usuario nao tem permissao para acessar esse modulo.",
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export function resolveRequiredPermission(path: string): UserMenuPermissionKey | null {
  if (path === "/" || path.startsWith("/?")) {
    return "dashboard";
  }

  if (path.startsWith("/compras")) {
    return "compras";
  }

  if (path.startsWith("/estoque") || path.startsWith("/artes")) {
    return "estoque";
  }

  if (path.startsWith("/pedidos")) {
    return "pedidos";
  }

  if (path.startsWith("/financeiro") || path.startsWith("/simulador")) {
    return "financeiro";
  }

  if (path.startsWith("/integracoes/nuvemshop")) {
    return "nuvemshop";
  }

  if (path.startsWith("/influenciadores")) {
    return "influenciadores";
  }

  if (path.startsWith("/empresa")) {
    return "empresa";
  }

  if (path.startsWith("/usuarios") || path.startsWith("/funcionarios")) {
    return "usuarios";
  }

  return null;
}

export function isNavigationItemActive(currentPath: string, href: string) {
  return href === "/" ? currentPath === "/" : currentPath.startsWith(href);
}

export function getDefaultAuthorizedPath(
  permissions: UserMenuPermissions,
): string {
  return (
    APP_NAVIGATION_ITEMS.find((item) => permissions[item.permission])?.href ||
    "/acesso-negado"
  );
}

function normalizeUserType(value: unknown): "funcionario" | "parceiro" | "desconhecido" {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "funcionario" || normalized === "parceiro") {
    return normalized;
  }

  return "desconhecido";
}

function normalizePartnerType(value: unknown): PartnerUserType | null {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "influenciador" ||
    normalized === "atleta" ||
    normalized === "afiliado"
  ) {
    return normalized;
  }

  return null;
}
