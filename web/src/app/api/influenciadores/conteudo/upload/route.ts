import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { authorizeApiAccess } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET_NAME = "partner-content";
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function getFileExtension(file: File) {
  const type = String(file.type || "").toLowerCase();

  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/svg+xml") return "svg";
  if (type === "application/pdf") return "pdf";
  if (type === "application/zip") return "zip";
  if (type === "application/x-zip-compressed") return "zip";
  if (type === "video/mp4") return "mp4";
  if (type === "video/quicktime") return "mov";
  if (type === "video/webm") return "webm";

  const name = String(file.name || "").trim();
  const match = name.match(/\.([a-z0-9]{2,8})$/i);
  if (match) {
    return match[1].toLowerCase();
  }

  return "bin";
}

function normalizeFolder(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "products" ||
    normalized === "assets" ||
    normalized === "previews"
  ) {
    return normalized;
  }

  return "assets";
}

async function ensureBucketExists(
  supabase: ReturnType<typeof createSupabaseServerClient> & { ok: true },
) {
  const buckets = await supabase.client.storage.listBuckets();
  if (buckets.error) {
    throw buckets.error;
  }

  const exists = (buckets.data ?? []).some((bucket) => bucket.name === BUCKET_NAME);
  if (exists) {
    return;
  }

  const created = await supabase.client.storage.createBucket(BUCKET_NAME, {
    public: true,
  });
  if (created.error) {
    throw created.error;
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeApiAccess("influenciadores");

  if (!authorization.ok) {
    return authorization.response;
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
  const folder = normalizeFolder(formData?.get("folder"));

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Envie um arquivo valido no campo file.",
      },
      { status: 400 },
    );
  }

  if (file.size <= 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "O arquivo enviado esta vazio.",
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        message: "O arquivo precisa ter no maximo 25MB.",
      },
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
            : "Nao foi possivel preparar o storage da Central de Conteudo.",
      },
      { status: 500 },
    );
  }

  const ext = getFileExtension(file);
  const nonce = randomBytes(10).toString("hex");
  const safeName = String(file.name || "arquivo")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const objectPath = `${folder}/${Date.now()}-${nonce}-${safeName || `arquivo.${ext}`}`;

  const uploadResult = await adminClient.client.storage
    .from(BUCKET_NAME)
    .upload(objectPath, file, {
      contentType: file.type || undefined,
      upsert: true,
    });

  if (uploadResult.error) {
    return NextResponse.json(
      {
        ok: false,
        message: uploadResult.error.message || "Nao foi possivel enviar o arquivo.",
      },
      { status: 500 },
    );
  }

  const publicUrlResult = adminClient.client.storage
    .from(BUCKET_NAME)
    .getPublicUrl(uploadResult.data.path);

  return NextResponse.json(
    {
      ok: true,
      fileUrl: String(publicUrlResult.data.publicUrl ?? "").trim(),
      path: uploadResult.data.path,
      fileName: file.name,
      contentType: file.type || "",
      size: file.size,
    },
    { status: 200 },
  );
}
