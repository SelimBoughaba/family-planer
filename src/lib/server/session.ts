import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "fp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // ein Jahr pro Gerät

function key() {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Kein Schlüssel für Sitzungen konfiguriert.");
  // eigener Ableitungsschlüssel, damit der Datenbank-Schlüssel nie direkt verwendet wird
  return createHmac("sha256", secret).update("familienplaner-session-v1").digest();
}

const password = () => process.env.FAMILY_PASSWORD ?? "";

/**
 * Das Passwort fließt in die Signatur ein: Wird es geändert,
 * sind alle bestehenden Anmeldungen automatisch ungültig.
 */
function passwordFingerprint() {
  return createHash("sha256").update(password()).digest("hex").slice(0, 16);
}

function sign(payload: string) {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export function createSession() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `v1.${exp}.${passwordFingerprint()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const [v, exp, fp, sig] = parts;
  if (Number(exp) * 1000 < Date.now()) return false;
  if (fp !== passwordFingerprint()) return false;
  let expected: string;
  try {
    expected = sign(`${v}.${exp}.${fp}`);
  } catch {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passwordConfigured() {
  return password().length >= 8;
}

export function checkPassword(input: string) {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(password()).digest();
  return passwordConfigured() && timingSafeEqual(a, b);
}
