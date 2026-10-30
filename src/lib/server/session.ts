import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";

export const SESSION_COOKIE = "fp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // ein Jahr pro Gerät
export const OWNER_COOKIE = "fp_owner";
export const OWNER_MAX_AGE = 60 * 60 * 12; // Owner-Bereich: 12 Stunden
export const VAULT_COOKIE = "fp_vault";
export const VAULT_MAX_AGE = 60 * 10; // Tresor: 10 Minuten, verlängert sich bei jeder Nutzung

function baseSecret() {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Kein Schlüssel für Sitzungen konfiguriert.");
  return secret;
}

// eigene Ableitungsschlüssel, damit der Datenbank-Schlüssel nie direkt verwendet wird
const familyKey = () => createHmac("sha256", baseSecret()).update("familienplaner-session-v1").digest();
const ownerKey = () => createHmac("sha256", baseSecret()).update("familienplaner-owner-v1").digest();
const vaultKey = () => createHmac("sha256", baseSecret()).update("familienplaner-vault-v1").digest();

const password = () => process.env.FAMILY_PASSWORD ?? "";
const ownerPassword = () => process.env.OWNER_PASSWORD ?? "";
const vaultPin = () => (process.env.SECRET_PIN ?? "").trim();
const fingerprint = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const sign = (key: Buffer, payload: string) => createHmac("sha256", key).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Sitzungs-Epoche: Erhöht der Owner sie, werden alle Geräte abgemeldet.
 * Kurz zwischengespeichert, damit nicht jede Anfrage die Datenbank fragt.
 */
let epochCache: { value: number; at: number } | null = null;
export async function sessionEpoch() {
  if (epochCache && Date.now() - epochCache.at < 20000) return epochCache.value;
  try {
    // höchstens kurz warten: die Anmeldung soll nicht an einer langsamen Datenbank hängen
    const [row] = await Promise.race([
      db()`select value from app_meta where key = 'session_epoch'`,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("epoch_timeout")), 3000)),
    ]);
    const value = Number(row?.value ?? 0) || 0;
    epochCache = { value, at: Date.now() };
    return value;
  } catch {
    return epochCache?.value ?? null;
  }
}

export async function bumpSessionEpoch() {
  const [row] = await db()`
    insert into app_meta (key, value) values ('session_epoch', '1'::jsonb)
    on conflict (key) do update set value = to_jsonb(coalesce((app_meta.value)::text::int, 0) + 1), updated_at = now()
    returning value`;
  epochCache = { value: Number(row.value), at: Date.now() };
  return epochCache.value;
}

export async function createSession() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `v2.${exp}.${fingerprint(password())}.${(await sessionEpoch()) ?? 0}`;
  return `${payload}.${sign(familyKey(), payload)}`;
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v2") return false;
  const [v, exp, fp, epoch, sig] = parts;
  if (Number(exp) * 1000 < Date.now()) return false;
  if (fp !== fingerprint(password())) return false;
  try {
    if (!safeEqual(sig, sign(familyKey(), `${v}.${exp}.${fp}.${epoch}`))) return false;
  } catch {
    return false;
  }
  const current = await sessionEpoch();
  // Datenbank nicht erreichbar: gültig signierte Sitzung nicht wegen der Epoche abweisen
  return current === null || Number(epoch) === current;
}

export function passwordConfigured() {
  return password().length >= 8;
}

function matches(input: string, expected: string) {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function checkPassword(input: string) {
  return passwordConfigured() && matches(input, password());
}

// --- Owner ---------------------------------------------------------------

export function ownerConfigured() {
  return ownerPassword().length >= 10;
}

export function checkOwnerPassword(input: string) {
  return ownerConfigured() && matches(input, ownerPassword());
}

export function createOwnerSession() {
  const exp = Math.floor(Date.now() / 1000) + OWNER_MAX_AGE;
  const payload = `o1.${exp}.${fingerprint(ownerPassword())}`;
  return `${payload}.${sign(ownerKey(), payload)}`;
}

export function verifyOwnerSession(token: string | undefined | null) {
  if (!token || !ownerConfigured()) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "o1") return false;
  const [v, exp, fp, sig] = parts;
  if (Number(exp) * 1000 < Date.now()) return false;
  if (fp !== fingerprint(ownerPassword())) return false;
  try {
    return safeEqual(sig, sign(ownerKey(), `${v}.${exp}.${fp}`));
  } catch {
    return false;
  }
}

// --- Tresor ----------------------------------------------------------------

export function vaultConfigured() {
  return /^\d{6}$/.test(vaultPin());
}

export function checkVaultPin(input: string) {
  return vaultConfigured() && /^\d{6}$/.test(input) && matches(input, vaultPin());
}

export function createVaultSession() {
  const exp = Math.floor(Date.now() / 1000) + VAULT_MAX_AGE;
  const payload = `t1.${exp}.${fingerprint(vaultPin())}`;
  return `${payload}.${sign(vaultKey(), payload)}`;
}

export function verifyVaultSession(token: string | undefined | null) {
  if (!token || !vaultConfigured()) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "t1") return false;
  const [v, exp, fp, sig] = parts;
  if (Number(exp) * 1000 < Date.now()) return false;
  if (fp !== fingerprint(vaultPin())) return false;
  try {
    return safeEqual(sig, sign(vaultKey(), `${v}.${exp}.${fp}`));
  } catch {
    return false;
  }
}
