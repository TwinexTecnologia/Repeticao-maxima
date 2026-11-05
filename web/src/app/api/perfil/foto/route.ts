import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OPERATIONS_SCHEMA = "repeticao_maxima";
const BUCKET_NAME = "profile-photos";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function isMissingColumnError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return message.toLowerCase().includes("column") && message.toLowerCase().includes("does not exist");
}

function getFileExtension(file: File) {
  const type = String(file.type || "").toLowerCase();

  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";

  const name = String(file.name || "").trim();
  const match = name.match(/\.([a-z0-9]{2,6})$/i);
  if (match) {
    return match[1].toLowerCase();
  }

  return "png";
}

async function ensureBucketExists(supabase: ReturnType<typeof createSupabaseServerClient> & { ok: true }) {
  const buckets = await supabase.client.storage.listBuckets();
  if (buckets.error) {
    throw buckets.error;
  }

  const exists = (buckets.data ?? []).some((bucket) => bucket.name === BUCKET_NAME);
  if (exists) {
    return;
  }

  const created = await supabase.client.storage.createBucket(BUCKET_NAME, { public: true });
  if (created.error) {
    throw created.error;
  }
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
      { ok: false, message: "Voce precisa estar logado para atualizar sua foto." },
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

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, message: "Envie um arquivo valido no campo file." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { ok: false, message: "A imagem precisa ter no maximo 5MB." },
      { status: 400 },
    );
  }

  try {
    await ensureBucketExists(adminClient);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel preparar o storage para salvar sua foto.",
      },
      { status: 500 },
    );
  }

  const ext = getFileExtension(file);
  const nonce = randomBytes(10).toString("hex");
  const objectPath = `${user.id}/${Date.now()}-${nonce}.${ext}`;

  const uploadResult = await adminClient.client.storage.from(BUCKET_NAME).upload(objectPath, file, {
    contentType: file.type || undefined,
    upsert: true,
  });

  if (uploadResult.error) {
    return NextResponse.json(
      {
        ok: false,
        message: uploadResult.error.message || "Nao foi possivel enviar sua foto.",
      },
      { status: 500 },
    );
  }

  const publicUrlResult = adminClient.client.storage
    .from(BUCKET_NAME)
    .getPublicUrl(uploadResult.data.path);

  const photoUrl = String(publicUrlResult.data.publicUrl ?? "").trim();

  const updateResult = await adminClient.client
    .schema(OPERATIONS_SCHEMA)
    .from("profiles_usuarios")
    .update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
    .eq("auth_user_id", user.id);

  if (updateResult.error) {
    if (isMissingColumnError(updateResult.error)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "A coluna photo_url ainda nao existe no Supabase. Rode o arquivo database/operacoes-internas.sql (ALTER TABLE repeticao_maxima.profiles_usuarios ADD COLUMN photo_url...).",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message: updateResult.error.message || "Nao foi possivel salvar a foto no perfil.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, photoUrl }, { status: 200 });
}
