import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { FILE_TYPES, MAX_UPLOAD_BYTES, StorageError, uploadUrl } from "@/lib/server/storage";
import { logError } from "@/lib/server/log";

export const maxDuration = 20;

/** Vergibt Speicherpfad und Einmal-Adresse; die Datei selbst geht direkt vom Gerät in den Speicher */
export async function POST(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const ext = FILE_TYPES[String(b.contentType)];
  const folder = b.kind === "board" ? "boards" : b.kind === "recipe" ? "recipes" : null;
  if (!ext || !folder) return NextResponse.json({ error: "invalid_input", message: "Nur Fotos (JPEG, PNG, WebP) und PDFs." }, { status: 400 });
  if (!(Number(b.size) > 0) || Number(b.size) > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "too_large", message: "Höchstens 20 MB pro Datei." }, { status: 400 });
  const path = `${folder}/${randomUUID()}.${ext}`;
  try {
    return NextResponse.json({ path, uploadUrl: await uploadUrl(path) });
  } catch (err) {
    await logError("upload", err);
    return NextResponse.json({ error: "storage", message: err instanceof StorageError ? err.message : "Hochladen gerade nicht möglich." }, { status: 503 });
  }
}
