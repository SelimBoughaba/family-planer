// Spielt db/schema.sql gegen die Datenbank ein. Läuft vor jedem Build.
// Ohne Datenbank-URL (z. B. lokal ohne .env) wird übersprungen.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!url) {
  console.log("[migrate] Keine Datenbank-URL gesetzt, Migration übersprungen.");
  process.exit(0);
}

const local = /localhost|127\.0\.0\.1|host=\/tmp/.test(url);
const sql = postgres(url, {
  prepare: false,
  max: 1,
  ssl: local ? false : "require",
  onnotice: () => {},
  connect_timeout: 20,
});

try {
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  await sql.unsafe(schema);
  console.log("[migrate] Schema ist aktuell.");
  await scheduleReminders();
} catch (err) {
  console.error("[migrate] Fehler:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

/**
 * Zeitplaner für Erinnerungen: pg_cron ruft jede Minute die Erinnerungs-Route auf.
 * Läuft nur beim Produktions-Build; Fehler hier brechen den Build nicht ab.
 */
async function scheduleReminders() {
  const secret = process.env.CRON_SECRET;
  const host = process.env.APP_URL?.replace(/^https?:\/\//, "") || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV !== "production" || !secret || !host) {
    console.log("[migrate] Zeitplaner nicht eingerichtet (kein Produktions-Build oder Angaben fehlen).");
    return;
  }
  try {
    await sql.unsafe("create extension if not exists pg_cron");
    await sql.unsafe("create extension if not exists pg_net");
    const url = `https://${host}/api/cron/reminders`;
    const command = `select net.http_post(url := '${url}', headers := jsonb_build_object('Authorization', 'Bearer ${secret}', 'Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 25000)`;
    await sql`select cron.schedule('familienplaner-reminders', '* * * * *', ${command})`;
    // alte Protokolle des Zeitplaners klein halten
    await sql`select cron.schedule('familienplaner-cleanup', '17 3 * * *', ${"delete from cron.job_run_details where end_time < now() - interval '3 days'"})`;
    console.log(`[migrate] Zeitplaner aktiv: jede Minute ${url}`);
  } catch (err) {
    console.warn("[migrate] Zeitplaner konnte nicht eingerichtet werden:", err.message);
  }
}
