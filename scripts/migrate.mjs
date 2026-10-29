// Spielt db/schema.sql gegen die Datenbank ein. Läuft vor jedem Build.
// Ohne Datenbank-URL (z. B. lokal ohne .env) wird übersprungen.
import { createHash } from "node:crypto";
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

const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const hash = createHash("sha256").update(schema).digest("hex").slice(0, 16);

try {
  if (await upToDate()) {
    console.log("[migrate] Schema unverändert, nichts zu tun.");
  } else {
    await applySchema();
    console.log("[migrate] Schema ist aktuell.");
  }
  await scheduleReminders();
} catch (err) {
  console.error("[migrate] Fehler:", err.message);
  await explainLocks();
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

/** Schema-Stand merken, damit unveränderte Builds keine Sperren anfordern */
async function upToDate() {
  try {
    const [row] = await sql`select value from app_meta where key = 'schema_hash'`;
    return row?.value === hash;
  } catch {
    return false; // Tabelle gibt es beim allerersten Lauf noch nicht
  }
}

async function applySchema() {
  // hängengebliebene, eigene Transaktionen beenden, sie würden die Änderungen blockieren
  const killed = await sql`
    select pg_terminate_backend(pid) as ok from pg_stat_activity
    where usename = current_user and pid <> pg_backend_pid()
      and state in ('idle in transaction', 'idle in transaction (aborted)')
      and xact_start < now() - interval '2 minutes'`;
  if (killed.length) console.log(`[migrate] ${killed.length} hängende Verbindung(en) beendet.`);

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await sql.begin(async (tx) => {
        // lieber kurz warten und erneut versuchen, als zwei Minuten blockieren
        await tx.unsafe("set local lock_timeout = '8s'");
        await tx.unsafe("set local statement_timeout = '60s'");
        await tx.unsafe(schema);
        await tx`insert into app_meta (key, value) values ('schema_hash', ${tx.json(hash)})
          on conflict (key) do update set value = excluded.value, updated_at = now()`;
      });
      return;
    } catch (err) {
      const lock = /lock timeout|canceling statement/i.test(err.message);
      if (!lock || attempt === 4) throw err;
      console.warn(`[migrate] Tabelle gerade gesperrt, Versuch ${attempt} von 4, warte kurz.`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }
}

/** Bei Problemen ins Build-Protokoll schreiben, wer gerade sperrt */
async function explainLocks() {
  try {
    const rows = await sql`
      select pid, usename, application_name, state, now() - xact_start as age, left(query, 120) as query
      from pg_stat_activity
      where pid <> pg_backend_pid() and xact_start is not null and datname = current_database()
      order by xact_start limit 8`;
    for (const r of rows) console.error(`[migrate] offen: pid ${r.pid} ${r.usename} ${r.application_name || "-"} ${r.state} seit ${r.age}: ${r.query}`);
  } catch {}
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
    const url = `https://${host}/api/cron/reminders`;
    const command = `select net.http_post(url := '${url}', headers := jsonb_build_object('Authorization', 'Bearer ${secret}', 'Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 25000)`;
    // nur anlegen oder ändern, wenn nötig: Erweiterungen und Job sind sonst schon da
    const [ext] = await sql`select count(*)::int as n from pg_extension where extname in ('pg_cron', 'pg_net')`;
    if (ext.n < 2) {
      await sql.unsafe("create extension if not exists pg_cron");
      await sql.unsafe("create extension if not exists pg_net");
    }
    const [job] = await sql`select command from cron.job where jobname = 'familienplaner-reminders'`;
    if (job?.command !== command) await sql`select cron.schedule('familienplaner-reminders', '* * * * *', ${command})`;
    const [cleanup] = await sql`select 1 from cron.job where jobname = 'familienplaner-cleanup'`;
    if (!cleanup) await sql`select cron.schedule('familienplaner-cleanup', '17 3 * * *', ${"delete from cron.job_run_details where end_time < now() - interval '3 days'"})`;
    console.log(`[migrate] Zeitplaner aktiv: jede Minute ${url}`);
  } catch (err) {
    console.warn("[migrate] Zeitplaner konnte nicht eingerichtet werden:", err.message);
  }
}
