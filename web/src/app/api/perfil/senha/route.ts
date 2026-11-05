import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PasswordMode = "manual" | "random";

function getRequestBody(request: Request) {
  return request.json().catch(() => null) as Promise<unknown>;
}

function normalizeMode(value: unknown): PasswordMode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "manual" || normalized === "random") {
    return normalized;
  }
  return null;
}

function generatePassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(length);
  let text = "";
  for (let index = 0; index < bytes.length; index += 1) {
    text += alphabet[bytes[index] % alphabet.length];
  }
  return text;
}

export async function POST(request: Request) {
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
      { ok: false, message: "Voce precisa estar logado para trocar sua senha." },
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

  const body = await getRequestBody(request);
  const mode =
    body && typeof body === "object" && "mode" in body ? normalizeMode(body.mode) : null;

  if (!mode) {
    return NextResponse.json(
      { ok: false, message: "Modo de troca de senha invalido." },
      { status: 400 },
    );
  }

  const manualPassword =
    body && typeof body === "object" && "password" in body ? String(body.password ?? "") : "";

  const nextPassword = mode === "random" ? generatePassword() : manualPassword.trim();

  if (nextPassword.length < 6) {
    return NextResponse.json(
      { ok: false, message: "A senha precisa ter pelo menos 6 caracteres." },
      { status: 400 },
    );
  }

  const updateResult = await adminClient.client.auth.admin.updateUserById(user.id, {
    password: nextPassword,
  });

  if (updateResult.error) {
    return NextResponse.json(
      {
        ok: false,
        message: updateResult.error.message || "Nao foi possivel atualizar a senha no Supabase.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      password: mode === "random" ? nextPassword : undefined,
    },
    { status: 200 },
  );
}
