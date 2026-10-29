import "server-only";
import { db } from "./db";

/** Fehler dauerhaft festhalten, damit der Owner sie sieht. Darf selbst nie werfen. */
export async function logError(source: string, err: unknown, detail?: string) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${source}]`, message, detail ?? "");
  try {
    const sql = db();
    await sql`insert into error_log (source, message, detail) values (${source.slice(0, 40)}, ${message.slice(0, 500)}, ${detail?.slice(0, 2000) ?? null})`;
    if (Math.random() < 0.05) await sql`delete from error_log where created_at < now() - interval '60 days'`;
  } catch {}
}
