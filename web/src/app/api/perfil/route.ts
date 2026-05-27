import { NextResponse } from "next/server";

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OPERATIONS_SCHEMA = "repeticao_maxima";

function isMissingColumnError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return message.toLowerCase().includes("column") && message.toLowerCase().includes("does not exist");
}

function normalizeUserType(value: unknown): "funcionario" | "parceiro" | "desconhecido" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "funcionario" || normalized === "parceiro") {
    return normalized;
  }
  return "desconhecido";
}

function normalizePartnerType(value: unknown): "influenciador" | "atleta" | "afiliado" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "influenciador" || normalized === "atleta" || normalized === "afiliado") {
    return normalized;
  }
  return null;
}

export async function GET() {
  const authClient = await createSupabaseServerAuthClient();

  if (!authClient.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: `Supabase Auth indisponivel. Configure ${authClient.missing.join(" e ")}.`,
      },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await authClient.client.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, message: "Voce precisa estar logado para acessar seu perfil." },
      { status: 401 },
    );
  }

  const adminClient = createSupabaseServerClient();

  if (!adminClient.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: `Persistencia indisponivel. Configure ${adminClient.missing.join(" e ")}.`,
      },
      { status: 500 },
    );
  }

  const baseProfileQuery = adminClient.client
    .schema(OPERATIONS_SCHEMA)
    .from("profiles_usuarios")
    .select(
      "id,auth_user_id,full_name,email,active,user_type,partner_type,birth_date,shirt_size,coupon_partner_id",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: profile, error: profileError } = await baseProfileQuery;

  if (profileError || !profile) {
    return NextResponse.json(
      {
        ok: true,
        profile: {
          fullName:
            String(user.user_metadata?.full_name ?? "").trim() || user.email || "Usuario",
          email: user.email || "",
          active: false,
          userType: "desconhecido" as const,
          partnerType: null,
          birthDate: null,
          shirtSize: "",
          linkedCouponCode: "",
          linkedPartnerName: "",
          photoUrl: "",
        },
      },
      { status: 200 },
    );
  }

  let photoUrl = "";

  const { data: photoData, error: photoError } = await adminClient.client
    .schema(OPERATIONS_SCHEMA)
    .from("profiles_usuarios")
    .select("photo_url")
    .eq("id", profile.id)
    .maybeSingle();

  if (!photoError && photoData) {
    photoUrl = String((photoData as unknown as { photo_url?: unknown }).photo_url ?? "").trim();
  }

  let linkedCouponCode = "";
  let linkedPartnerName = "";

  if (profile.coupon_partner_id) {
    const { data: linkedPartner } = await adminClient.client
      .schema(OPERATIONS_SCHEMA)
      .from("parceiros_cupons")
      .select("coupon_code,name")
      .eq("id", profile.coupon_partner_id)
      .maybeSingle();

    linkedCouponCode = String(linkedPartner?.coupon_code ?? "").trim().toUpperCase();
    linkedPartnerName = String(linkedPartner?.name ?? "").trim();
  }

  if (photoError && isMissingColumnError(photoError)) {
    photoUrl = "";
  }

  return NextResponse.json(
    {
      ok: true,
      profile: {
        fullName:
          String(profile.full_name ?? "").trim() ||
          String(user.user_metadata?.full_name ?? "").trim() ||
          user.email ||
          "Usuario",
        email: String(profile.email ?? "").trim().toLowerCase() || user.email || "",
        active: profile.active === true,
        userType: normalizeUserType(profile.user_type),
        partnerType: normalizePartnerType(profile.partner_type),
        birthDate: typeof profile.birth_date === "string" ? profile.birth_date : null,
        shirtSize: String(profile.shirt_size ?? "").trim(),
        linkedCouponCode,
        linkedPartnerName,
        photoUrl,
      },
    },
    { status: 200 },
  );
}

export async function PATCH(request: Request) {
  const authClient = await createSupabaseServerAuthClient();

  if (!authClient.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: `Supabase Auth indisponivel. Configure ${authClient.missing.join(" e ")}.`,
      },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await authClient.client.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, message: "Voce precisa estar logado para atualizar seu perfil." },
      { status: 401 },
    );
  }

  const adminClient = createSupabaseServerClient();

  if (!adminClient.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: `Persistencia indisponivel. Configure ${adminClient.missing.join(" e ")}.`,
      },
      { status: 500 },
    );
  }

  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const birthDateRaw = String(payload.birthDate ?? "").trim();
  const birthDate = birthDateRaw ? birthDateRaw : null;

  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return NextResponse.json(
      { ok: false, message: "Informe uma data de nascimento valida." },
      { status: 400 },
    );
  }

  const { data: existingProfile, error: profileError } = await adminClient.client
    .schema(OPERATIONS_SCHEMA)
    .from("profiles_usuarios")
    .select("id,user_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError || !existingProfile) {
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel localizar seu perfil para atualizar." },
      { status: 404 },
    );
  }

  if (normalizeUserType(existingProfile.user_type) !== "parceiro") {
    return NextResponse.json(
      { ok: false, message: "Apenas parceiros podem atualizar esses dados no perfil." },
      { status: 403 },
    );
  }

  const { data: updated, error: updateError } = await adminClient.client
    .schema(OPERATIONS_SCHEMA)
    .from("profiles_usuarios")
    .update({ birth_date: birthDate, updated_at: new Date().toISOString() })
    .eq("id", existingProfile.id)
    .select("birth_date")
    .single();

  if (updateError) {
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel atualizar sua data de nascimento." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      birthDate: typeof updated.birth_date === "string" ? updated.birth_date : null,
    },
    { status: 200 },
  );
}
