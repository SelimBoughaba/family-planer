import "server-only";
import { db } from "./db";

export const BACKUP_VERSION = 1;
const KEEP_AUTO = 14;

export type Snapshot = {
  app: "familienplaner";
  version: number;
  createdAt: string;
  tables: {
    people: Record<string, unknown>[];
    events: Record<string, unknown>[];
    tasks: Record<string, unknown>[];
    shopping_items: Record<string, unknown>[];
    lists: unknown;
  };
};

/** Alle Familiendaten ohne Geheimnisse (keine Abo-Schlüssel, keine Geräte, keine Anmeldeversuche) */
export async function snapshot(): Promise<Snapshot> {
  const sql = db();
  const [people, events, tasks, items, lists] = await Promise.all([
    sql`select id, name, color, sort, notify_prefs, created_at from people order by sort`,
    sql`select id, title, place, notes, starts_at, ends_at, all_day, people, recurrence, recurrence_until::text as recurrence_until, exdates, reminders, created_by, created_at, updated_at from events`,
    sql`select id, title, area, person_id, due::text as due, recurring, remind_time::text as remind_time, done, done_at, created_by, created_at from tasks`,
    sql`select id, name, amount, category, added_by, done, done_at, created_at from shopping_items`,
    sql`select value from app_meta where key = 'lists'`,
  ]);
  return {
    app: "familienplaner",
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    tables: { people: [...people], events: [...events], tasks: [...tasks], shopping_items: [...items], lists: lists[0]?.value ?? null },
  };
}

export async function saveBackup(kind: "auto" | "manual" | "before-restore") {
  const data = await snapshot();
  const size = Buffer.byteLength(JSON.stringify(data));
  const sql = db();
  const [row] = await sql`insert into backups (kind, data, size_bytes) values (${kind}, ${sql.json(data as never)}, ${size}) returning id, created_at`;
  // automatische Sicherungen begrenzen, manuelle bleiben bis zum Löschen
  await sql`delete from backups where kind = 'auto' and id not in (select id from backups where kind = 'auto' order by created_at desc limit ${KEEP_AUTO})`;
  await sql`delete from backups where kind = 'before-restore' and created_at < now() - interval '30 days'`;
  return { id: row.id as string, createdAt: row.created_at as string, size };
}

/** Einmal pro Tag, vom Zeitplaner angestoßen */
export async function maybeAutoBackup() {
  const sql = db();
  const [last] = await sql`select created_at from backups where kind = 'auto' order by created_at desc limit 1`;
  if (last && Date.now() - +new Date(last.created_at as string) < 23.5 * 3600000) return null;
  return saveBackup("auto");
}

function validate(data: unknown): Snapshot {
  const d = data as Snapshot;
  if (!d || d.app !== "familienplaner" || typeof d.version !== "number" || !d.tables) throw new Error("Das ist keine Sicherung des Familienplaners.");
  if (d.version > BACKUP_VERSION) throw new Error("Die Sicherung stammt aus einer neueren Version.");
  for (const t of ["people", "events", "tasks", "shopping_items"] as const) {
    if (!Array.isArray(d.tables[t])) throw new Error(`In der Sicherung fehlt ${t}.`);
  }
  if (!d.tables.people.length) throw new Error("Die Sicherung enthält keine Personen.");
  return d;
}

/**
 * Ersetzt alle Familiendaten durch die Sicherung. Vorher wird der aktuelle Stand gesichert.
 * Abo-Schlüssel und Geräte bleiben für Personen erhalten, die es weiterhin gibt.
 */
export async function restore(data: unknown) {
  const d = validate(data);
  const before = await saveBackup("before-restore");
  const sql = db();
  const ids = d.tables.people.map((p) => String(p.id));
  await sql.begin(async (tx) => {
    await tx`delete from events`;
    await tx`delete from tasks`;
    await tx`delete from shopping_items`;
    await tx`delete from people where id <> all(${tx.array(ids)}::uuid[])`;
    for (const p of d.tables.people) {
      await tx`insert into people (id, name, color, sort, notify_prefs, created_at)
        values (${p.id as string}, ${p.name as string}, ${(p.color as string) ?? null}, ${(p.sort as number) ?? 0}, ${tx.json((p.notify_prefs ?? { invited: true, assigned: true }) as never)}, ${(p.created_at as string) ?? new Date().toISOString()})
        on conflict (id) do update set name = excluded.name, color = excluded.color, sort = excluded.sort, notify_prefs = excluded.notify_prefs`;
    }
    for (const e of d.tables.events) {
      await tx`insert into events (id, title, place, notes, starts_at, ends_at, all_day, people, recurrence, recurrence_until, exdates, reminders, created_by, created_at, updated_at)
        values (${e.id as string}, ${e.title as string}, ${(e.place as string) ?? null}, ${(e.notes as string) ?? null}, ${e.starts_at as string}, ${e.ends_at as string}, ${!!e.all_day},
          ${tx.array(((e.people as string[]) ?? []).filter((x) => ids.includes(x)))}::uuid[], ${(e.recurrence as string) ?? null}, ${(e.recurrence_until as string) ?? null},
          ${tx.array(((e.exdates as string[]) ?? []).map((x) => new Date(x).toISOString()))}::timestamptz[], ${tx.array((e.reminders as number[]) ?? [])}::int[],
          ${ids.includes(e.created_by as string) ? (e.created_by as string) : null}, ${(e.created_at as string) ?? new Date().toISOString()}, now())`;
    }
    for (const t of d.tables.tasks) {
      await tx`insert into tasks (id, title, area, person_id, due, recurring, remind_time, done, done_at, created_by, created_at)
        values (${t.id as string}, ${t.title as string}, ${(t.area as string) ?? "Haushalt"}, ${ids.includes(t.person_id as string) ? (t.person_id as string) : null}, ${(t.due as string) ?? null},
          ${(t.recurring as string) ?? null}, ${(t.remind_time as string) ?? null}, ${!!t.done}, ${(t.done_at as string) ?? null}, ${ids.includes(t.created_by as string) ? (t.created_by as string) : null}, ${(t.created_at as string) ?? new Date().toISOString()})`;
    }
    for (const i of d.tables.shopping_items) {
      await tx`insert into shopping_items (id, name, amount, category, added_by, done, done_at, created_at)
        values (${i.id as string}, ${i.name as string}, ${(i.amount as string) ?? null}, ${(i.category as string) ?? "Vorrat"}, ${ids.includes(i.added_by as string) ? (i.added_by as string) : null},
          ${!!i.done}, ${(i.done_at as string) ?? null}, ${(i.created_at as string) ?? new Date().toISOString()})`;
    }
    if (d.tables.lists) {
      await tx`insert into app_meta (key, value) values ('lists', ${tx.json(d.tables.lists as never)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
    }
  });
  return { before, counts: { people: d.tables.people.length, events: d.tables.events.length, tasks: d.tables.tasks.length, items: d.tables.shopping_items.length } };
}
