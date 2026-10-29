import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { logError } from "./log";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  // Absenderkennung muss https oder mailto sein
  const candidates = [process.env.VAPID_SUBJECT, process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`];
  const subject = candidates.find((c): c is string => !!c && /^(https:|mailto:)/.test(c)) ?? "https://familienplaner.vercel.app";
  try {
    webpush.setVapidDetails(subject, pub, priv);
  } catch (err) {
    console.error("[push] Schlüssel ungültig:", (err as Error).message);
    return false;
  }
  configured = true;
  return true;
}

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Sendet an alle Geräte der genannten Personen. Gibt die Zahl erfolgreicher Zustellungen zurück. */
export async function sendToPeople(personIds: string[], payload: PushPayload) {
  if (!personIds.length || !configure()) return 0;
  const sql = db();
  const subs = await sql`select * from push_subscriptions where person_id = any(${sql.array(personIds)}::uuid[])`;
  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: "high" },
        );
        ok++;
        await sql`update push_subscriptions set last_success = now() where id = ${s.id as string}`;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // Gerät hat das Abo beendet: aufräumen
        if (code === 404 || code === 410) await sql`delete from push_subscriptions where id = ${s.id as string}`;
        else await logError("push", err, `Status ${code ?? "unbekannt"}`);
      }
    }),
  );
  return ok;
}
