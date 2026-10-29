import "server-only";
import { db } from "./db";
import { logError } from "./log";

/**
 * Selbstheilung: Befehle der App, deren Gegenstelle verschwunden ist (wartet auf ClientRead)
 * oder die in einer offenen Transaktion vergessen wurden, halten sonst Sperren fest.
 */
export async function healStuckQueries() {
  const sql = db();
  const rows = await sql`
    select pid, wait_event, now() - query_start as age, left(query, 60) as query
    from pg_stat_activity
    where usename = current_user and pid <> pg_backend_pid() and backend_type = 'client backend'
      and coalesce(application_name, '') not like 'pg_net%' and coalesce(application_name, '') not like 'pg_cron%'
      and (
        (state = 'active' and wait_event = 'ClientRead' and query_start < now() - interval '2 minutes')
        or (state like 'idle in transaction%' and state_change < now() - interval '2 minutes')
      )`;
  for (const r of rows) {
    await sql`select pg_terminate_backend(${r.pid})`;
    await logError("heal", `Hängende Abfrage beendet (${r.wait_event ?? "Transaktion"}, ${r.age})`, String(r.query));
  }
  return rows.length;
}
