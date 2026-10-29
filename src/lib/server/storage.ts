import "server-only";

/**
 * Dateien (Rezeptfotos, Pinnwand) im privaten Supabase-Speicher.
 * Der Browser lädt direkt dorthin hoch (signierte Einmal-Adresse), gelesen wird über kurzlebige Links.
 */
const BUCKET = "familienplaner";
const MAX_BYTES = 20 * 1024 * 1024;

function base() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new StorageError("Der Dateispeicher ist nicht eingerichtet.");
  return `${url.replace(/\/$/, "")}/storage/v1`;
}

function headers(extra: Record<string, string> = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new StorageError("Der Dateispeicher ist nicht eingerichtet.");
  // neue Schlüssel (sb_secret_…) sind keine JWTs und gehören nur in apikey
  return { apikey: key, ...(key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }), ...extra };
}

export class StorageError extends Error {}

export const FILE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
export const typeOfPath = (path: string) => Object.entries(FILE_TYPES).find(([, ext]) => path.endsWith(`.${ext}`))?.[0] ?? "application/octet-stream";
export const PATH_RE = /^(recipes|boards)\/[0-9a-f-]{36}\.(?:jpg|png|webp|pdf)$/;

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const res = await fetch(`${base()}/bucket/${BUCKET}`, { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const made = await fetch(`${base()}/bucket`, {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_BYTES, allowed_mime_types: Object.keys(FILE_TYPES) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!made.ok && made.status !== 409) throw new StorageError(`Speicher konnte nicht angelegt werden (${made.status}).`);
  }
  bucketReady = true;
}

/** Einmal-Adresse, an die der Browser die Datei direkt per PUT schickt */
export async function uploadUrl(path: string) {
  await ensureBucket();
  const res = await fetch(`${base()}/object/upload/sign/${BUCKET}/${path}`, { method: "POST", headers: headers(), signal: AbortSignal.timeout(8000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new StorageError("Hochladen gerade nicht möglich.");
  return `${base()}${body.url}`;
}

/** Kurzlebiger Lese-Link */
export async function readUrl(path: string, seconds = 600) {
  const res = await fetch(`${base()}/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({ expiresIn: seconds }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => ({}));
  const signed = body.signedURL ?? body.signedUrl;
  if (!res.ok || !signed) throw new StorageError("Datei nicht gefunden.");
  return `${base()}${signed}`;
}

export async function download(path: string) {
  const res = await fetch(`${base()}/object/${BUCKET}/${path}`, { headers: headers(), signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new StorageError("Datei nicht gefunden.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new StorageError("Die Datei ist zu groß.");
  return buf;
}

export async function removeFiles(paths: string[]) {
  const list = paths.filter((p) => PATH_RE.test(p));
  if (!list.length) return;
  await fetch(`${base()}/object/${BUCKET}`, {
    method: "DELETE",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({ prefixes: list }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

export const MAX_UPLOAD_BYTES = MAX_BYTES;
