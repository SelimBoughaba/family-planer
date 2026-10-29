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
  // Ist die Datenbank gar nicht erreichbar, den Build nicht blockieren: sonst kommt auch keine Reparatur mehr live
  try {
    await sql`select 1`;
  } catch (err) {
    console.warn("[migrate] Datenbank nicht erreichbar, Migration übersprungen:", err.message);
    process.exit(0);
  }
  await diagnose();
  await clearStuck();
  await serverTimeouts();
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
      await clearStuck();
    }
  }
}

/**
 * Hängende Abfragen der App beenden: Bei dieser App dauert legitim keine Abfrage länger als Sekunden.
 * Wer auf Daten vom Client wartet (ClientRead), dessen Gegenstelle ist längst weg.
 */
async function clearStuck() {
  const stuck = await sql`
    select pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) as blocked_by, now() - xact_start as age, left(query, 80) as query
    from pg_stat_activity
    where usename = current_user and pid <> pg_backend_pid() and backend_type = 'client backend'
      and coalesce(application_name, '') not like 'pg_net%' and coalesce(application_name, '') not like 'pg_cron%'
      and (
        (state in ('active', 'idle in transaction', 'idle in transaction (aborted)') and xact_start < now() - interval '20 seconds')
        or (state = 'active' and query_start < now() - interval '20 seconds')
        or (wait_event = 'ClientRead' and state = 'active' and query_start < now() - interval '5 seconds')
      )`;
  for (const r of stuck) {
    console.log(`[migrate] beende hängende Abfrage pid ${r.pid} (${r.state}, wartet auf ${r.wait_event_type ?? "-"}/${r.wait_event ?? "-"}, blockiert von ${JSON.stringify(r.blocked_by)}, seit ${r.age}): ${r.query}`);
    await sql`select pg_terminate_backend(${r.pid})`;
  }
}

/** Überblick über die Verbindungen ins Build-Protokoll, ohne Abfrageinhalte mit Daten */
async function diagnose() {
  try {
    const groups = await sql`
      select usename, coalesce(application_name, '') as app, state, wait_event_type, wait_event, count(*)::int as n,
        max(now() - coalesce(xact_start, query_start, backend_start)) as oldest
      from pg_stat_activity
      where datname = current_database() and backend_type = 'client backend' and pid <> pg_backend_pid()
      group by 1, 2, 3, 4, 5 order by n desc limit 15`;
    console.log("[migrate] Verbindungen:");
    for (const g of groups) console.log(`  ${g.n}× ${g.usename} ${g.app || "-"} ${g.state ?? "-"} ${g.wait_event_type ?? "-"}/${g.wait_event ?? "-"} ältester ${g.oldest ?? "-"}`);
    const [locks] = await sql`select count(*)::int as n from pg_locks where not granted`;
    console.log(`[migrate] wartende Sperren: ${locks.n}`);
  } catch (err) {
    console.warn("[migrate] Diagnose nicht möglich:", err.message);
  }
}

/**
 * Dauerhafte Zeitgrenzen für die App-Rolle: Eine vergessene Transaktion oder ein endlos wartender
 * Befehl wird von der Datenbank selbst beendet und kann den Pooler nicht mehr verstopfen.
 */
async function serverTimeouts() {
  try {
    const [{ user, version }] = await sql`select current_user as user, current_setting('server_version_num')::int as version`;
    const wanted = {
      idle_in_transaction_session_timeout: "30s",
      statement_timeout: "30s",
      lock_timeout: "10s",
      ...(version >= 170000 ? { transaction_timeout: "60s" } : {}),
    };
    const [row] = await sql`select setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = ${user} and s.setdatabase = 0`;
    const current = new Map((row?.setconfig ?? []).map((c) => c.split("=")));
    const missing = Object.entries(wanted).filter(([k, v]) => current.get(k) !== v);
    if (!missing.length) return console.log("[migrate] Zeitgrenzen der Datenbank sind gesetzt.");
    for (const [k, v] of missing) await sql.unsafe(`alter role "${user.replace(/"/g, "")}" set ${k} = '${v}'`);
    console.log(`[migrate] Zeitgrenzen gesetzt: ${missing.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    // bestehende Pooler-Verbindungen übernehmen die Werte erst neu aufgebaut: ruhende App-Verbindungen schließen
    const idle = await sql`
      select pg_terminate_backend(pid) from pg_stat_activity
      where usename = current_user and pid <> pg_backend_pid() and backend_type = 'client backend' and state = 'idle'
        and coalesce(application_name, '') not like 'pg_net%' and coalesce(application_name, '') not like 'pg_cron%'`;
    console.log(`[migrate] ${idle.length} ruhende Verbindung(en) erneuert.`);
  } catch (err) {
    console.warn("[migrate] Zeitgrenzen konnten nicht gesetzt werden:", err.message);
  }
}

/** Bei Problemen ins Build-Protokoll schreiben, wer gerade sperrt */
async function explainLocks() {
  try {
    const rows = await sql`
      select pid, usename, application_name, state, wait_event_type, wait_event, pg_blocking_pids(pid) as blocked_by, now() - xact_start as age, left(query, 120) as query
      from pg_stat_activity
      where pid <> pg_backend_pid() and xact_start is not null and datname = current_database()
      order by xact_start limit 8`;
    for (const r of rows)
      console.error(`[migrate] offen: pid ${r.pid} ${r.usename} ${r.application_name || "-"} ${r.state} wartet ${r.wait_event_type ?? "-"}/${r.wait_event ?? "-"} blockiert von ${JSON.stringify(r.blocked_by)} seit ${r.age}: ${r.query}`);
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
