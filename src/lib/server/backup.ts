import "server-only";
import { db } from "./db";
import { wall } from "./berlin";

export const BACKUP_VERSION = 5;
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
    recipes?: Record<string, unknown>[];
    meal_plan?: Record<string, unknown>[];
    meal_attendance?: Record<string, unknown>[];
    boards?: Record<string, unknown>[];
    board_items?: Record<string, unknown>[];
    points_ledger?: Record<string, unknown>[];
    rewards?: Record<string, unknown>[];
    reward_claims?: Record<string, unknown>[];
    lists: unknown;
  };
};

/** Alle Familiendaten ohne Geheimnisse (keine Abo-Schlüssel, keine Geräte, keine Anmeldeversuche) */
export async function snapshot(): Promise<Snapshot> {
  const sql = db();
  // nacheinander statt parallel: schont den Pooler und zeigt bei Problemen genau den Schritt
  const step = async <T>(name: string, run: () => Promise<T>) => {
    try {
      return await run();
    } catch (err) {
      throw new Error(`Sicherung, Schritt ${name}: ${(err as Error).message}`);
    }
  };
  const people = await step("Personen", () => sql`select id, name, color, sort, notify_prefs, is_parent, created_at from people order by sort`);
  const events = await step(
    "Termine",
    () =>
      sql`select id, title, place, notes, starts_at, ends_at, all_day, people, recurrence, recurrence_until::text as recurrence_until, exdates, reminders, countdown, countdown_emoji, created_by, created_at, updated_at from events`,
  );
  const tasks = await step(
    "Aufgaben",
    () => sql`select id, title, area, person_id, due::text as due, recurring, remind_time::text as remind_time, rotation, points, done, done_at, created_by, created_at from tasks`,
  );
  const items = await step("Einkauf", () => sql`select id, name, amount, category, added_by, done, done_at, created_at from shopping_items`);
  const lists = await step("Listen", () => sql`select value from app_meta where key = 'lists'`);
  const recipes = await step(
    "Rezepte",
    () => sql`select id, title, description, servings, minutes, ingredients, steps, tags, source_url, images, favorite, created_by, created_at, updated_at from recipes`,
  );
  const meals = await step("Wochenplan", () => sql`select id, day::text as day, recipe_id, title, cook, note, created_by, created_at from meal_plan`);
  const boards = await step("Pinnwände", () => sql`select id, name, sort, created_at from boards`);
  const boardItems = await step("Pinnwand", () => sql`select * from board_items where deleted_at is null`);
  const ledger = await step("Punkte", () => sql`select person_id, points, kind, task_id, reason, created_at from points_ledger`);
  const rewards = await step("Belohnungen", () => sql`select id, title, emoji, cost, active, created_by, created_at from rewards`);
  const claims = await step("Einlösungen", () => sql`select id, reward_id, title, person_id, cost, status, decided_by, decided_at, created_at from reward_claims`);
  const attendance = await step("Wer isst mit", () => sql`select day::text as day, person_id, present from meal_attendance where day >= current_date - 30`);
  return {
    app: "familienplaner",
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    tables: {
      people: [...people],
      events: [...events],
      tasks: [...tasks],
      shopping_items: [...items],
      recipes: [...recipes],
      meal_plan: [...meals],
      meal_attendance: [...attendance],
      boards: [...boards],
      board_items: [...boardItems],
      points_ledger: [...ledger],
      rewards: [...rewards],
      reward_claims: [...claims],
      lists: lists[0]?.value ?? null,
    },
  };
}

export async function saveBackup(kind: "auto" | "manual" | "before-restore") {
  const data = await snapshot();
  const size = Buffer.byteLength(JSON.stringify(data));
  const sql = db();
  // harte Zeitgrenze: eine Sicherung darf nie Sperren dauerhaft festhalten
  const row = await sql
    .begin(async (tx) => {
      await tx`set local statement_timeout = '15s'`;
      await tx`set local lock_timeout = '5s'`;
      // als Text übergeben und in der Datenbank umwandeln, damit die Daten nicht als Parameter-Objekt durch den Pooler müssen
      const [r] = await tx`insert into backups (kind, data, size_bytes) values (${kind}, ${JSON.stringify(data)}::text::jsonb, ${size}) returning id, created_at`;
      // automatische Sicherungen begrenzen, manuelle bleiben bis zum Löschen
      await tx`delete from backups where kind = 'auto' and id not in (select id from backups where kind = 'auto' order by created_at desc limit ${KEEP_AUTO})`;
      await tx`delete from backups where kind = 'before-restore' and created_at < now() - interval '30 days'`;
      return r;
    })
    .catch((err: Error) => {
      throw new Error(`Sicherung, Schritt Speichern: ${err.message}`);
    });
  return { id: row.id as string, createdAt: row.created_at as string, size };
}

/** Einmal pro Tag, vom Zeitplaner angestoßen */
export async function maybeAutoBackup() {
  const sql = db();
  // nur zwischen 2 und 5 Uhr Berliner Zeit, damit es tagsüber nie mit Änderungen kollidiert
  // Stunde über die Zeitzonen-Bausteine, nicht als Text: „15 Uhr“ ergäbe keine Zahl und hebelte das Fenster aus
  const hour = wall(Date.now()).h;
  if (!Number.isFinite(hour) || hour < 2 || hour >= 5) return null;
  const [last] = await sql`select created_at from backups where kind = 'auto' order by created_at desc limit 1`.catch((err: Error) => {
    throw new Error(`Sicherung, Schritt letzte Sicherung: ${err.message}`);
  });
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
  const recipeIds = (d.tables.recipes ?? []).map((r) => String(r.id));
  // ältere Sicherungen ohne Rezepte lassen vorhandene Rezepte unangetastet
  const hasFood = Array.isArray(d.tables.recipes);
  await sql.begin(async (tx) => {
    if (hasFood) {
      await tx`delete from meal_plan`;
      await tx`delete from meal_attendance`;
      await tx`delete from recipes`;
    }
    await tx`delete from events`;
    await tx`delete from tasks`;
    await tx`delete from shopping_items`;
    await tx`delete from people where id <> all(${tx.array(ids)}::uuid[])`;
    for (const p of d.tables.people) {
      await tx`insert into people (id, name, color, sort, notify_prefs, is_parent, created_at)
        values (${p.id as string}, ${p.name as string}, ${(p.color as string) ?? null}, ${(p.sort as number) ?? 0}, ${tx.json((p.notify_prefs ?? { invited: true, assigned: true }) as never)}, ${!!p.is_parent}, ${(p.created_at as string) ?? new Date().toISOString()})
        on conflict (id) do update set name = excluded.name, color = excluded.color, sort = excluded.sort, notify_prefs = excluded.notify_prefs,
          is_parent = ${"is_parent" in p ? !!p.is_parent : tx`people.is_parent`}`;
    }
    for (const e of d.tables.events) {
      await tx`insert into events (id, title, place, notes, starts_at, ends_at, all_day, people, recurrence, recurrence_until, exdates, reminders, countdown, countdown_emoji, created_by, created_at, updated_at)
        values (${e.id as string}, ${e.title as string}, ${(e.place as string) ?? null}, ${(e.notes as string) ?? null}, ${e.starts_at as string}, ${e.ends_at as string}, ${!!e.all_day},
          ${tx.array(((e.people as string[]) ?? []).filter((x) => ids.includes(x)))}::uuid[], ${(e.recurrence as string) ?? null}, ${(e.recurrence_until as string) ?? null},
          ${tx.array(((e.exdates as string[]) ?? []).map((x) => new Date(x).toISOString()))}::timestamptz[], ${tx.array((e.reminders as number[]) ?? [])}::int[], ${!!e.countdown}, ${(e.countdown_emoji as string) ?? null},
          ${ids.includes(e.created_by as string) ? (e.created_by as string) : null}, ${(e.created_at as string) ?? new Date().toISOString()}, now())`;
    }
    for (const t of d.tables.tasks) {
      await tx`insert into tasks (id, title, area, person_id, due, recurring, remind_time, rotation, points, done, done_at, created_by, created_at)
        values (${t.id as string}, ${t.title as string}, ${(t.area as string) ?? "Haushalt"}, ${ids.includes(t.person_id as string) ? (t.person_id as string) : null}, ${(t.due as string) ?? null},
          ${(t.recurring as string) ?? null}, ${(t.remind_time as string) ?? null}, ${tx.array(((t.rotation as string[]) ?? []).filter((x) => ids.includes(x)))}::uuid[], ${Number(t.points ?? 1)}, ${!!t.done}, ${(t.done_at as string) ?? null}, ${ids.includes(t.created_by as string) ? (t.created_by as string) : null}, ${(t.created_at as string) ?? new Date().toISOString()})`;
    }
    for (const i of d.tables.shopping_items) {
      await tx`insert into shopping_items (id, name, amount, category, added_by, done, done_at, created_at)
        values (${i.id as string}, ${i.name as string}, ${(i.amount as string) ?? null}, ${(i.category as string) ?? "Vorrat"}, ${ids.includes(i.added_by as string) ? (i.added_by as string) : null},
          ${!!i.done}, ${(i.done_at as string) ?? null}, ${(i.created_at as string) ?? new Date().toISOString()})`;
    }
    for (const r of d.tables.recipes ?? []) {
      await tx`insert into recipes (id, title, description, servings, minutes, ingredients, steps, tags, source_url, images, favorite, created_by, created_at, updated_at)
        values (${r.id as string}, ${r.title as string}, ${(r.description as string) ?? null}, ${(r.servings as number) ?? 4}, ${(r.minutes as number) ?? null},
          ${tx.json((r.ingredients ?? []) as never)}, ${tx.json((r.steps ?? []) as never)}, ${tx.array((r.tags as string[]) ?? [])}::text[], ${(r.source_url as string) ?? null}, ${tx.array((r.images as string[]) ?? [])}::text[], ${!!r.favorite},
          ${ids.includes(r.created_by as string) ? (r.created_by as string) : null}, ${(r.created_at as string) ?? new Date().toISOString()}, now())`;
    }
    for (const m of d.tables.meal_plan ?? []) {
      await tx`insert into meal_plan (id, day, recipe_id, title, cook, note, created_by, created_at)
        values (${m.id as string}, ${m.day as string}, ${recipeIds.includes(m.recipe_id as string) ? (m.recipe_id as string) : null}, ${m.title as string},
          ${ids.includes(m.cook as string) ? (m.cook as string) : null}, ${(m.note as string) ?? null}, ${ids.includes(m.created_by as string) ? (m.created_by as string) : null}, ${(m.created_at as string) ?? new Date().toISOString()})`;
    }
    for (const a of d.tables.meal_attendance ?? []) {
      if (!ids.includes(a.person_id as string)) continue;
      await tx`insert into meal_attendance (day, person_id, present) values (${a.day as string}, ${a.person_id as string}, ${!!a.present}) on conflict do nothing`;
    }
    // Pinnwand nur ersetzen, wenn die Sicherung sie enthält (Dateien selbst liegen im Speicher und bleiben)
    if (Array.isArray(d.tables.boards) && d.tables.boards.length) {
      await tx`delete from boards`;
      for (const b of d.tables.boards)
        await tx`insert into boards (id, name, sort, created_at) values (${b.id as string}, ${b.name as string}, ${Number(b.sort) || 0}, ${(b.created_at as string) ?? new Date().toISOString()})`;
      for (const i of d.tables.board_items ?? []) {
        await tx`insert into board_items (id, board_id, kind, x, y, w, h, rot, z, color, text, ink, file, thumb, file_name, expires, created_by, created_at, updated_at)
          values (${i.id as string}, ${i.board_id as string}, ${i.kind as string}, ${Number(i.x)}, ${Number(i.y)}, ${Number(i.w)}, ${Number(i.h)}, ${Number(i.rot)}, ${Number(i.z)},
            ${(i.color as string) ?? null}, ${(i.text as string) ?? null}, ${i.ink ? tx.json(i.ink as never) : null}, ${(i.file as string) ?? null}, ${(i.thumb as string) ?? null},
            ${(i.file_name as string) ?? null}, ${i.expires ? String(i.expires).slice(0, 10) : null}, ${ids.includes(i.created_by as string) ? (i.created_by as string) : null},
            ${(i.created_at as string) ?? new Date().toISOString()}, now())`;
      }
    }
    // Punkte nur ersetzen, wenn die Sicherung sie enthält (ältere Sicherungen lassen sie stehen)
    if (Array.isArray(d.tables.points_ledger)) {
      await tx`delete from reward_claims`;
      await tx`delete from rewards`;
      await tx`delete from points_ledger`;
      for (const l of d.tables.points_ledger) {
        if (!ids.includes(l.person_id as string)) continue;
        await tx`insert into points_ledger (person_id, points, kind, task_id, reason, created_at)
          values (${l.person_id as string}, ${Number(l.points)}, ${(l.kind as string) ?? "task"}, ${(l.task_id as string) ?? null}, ${(l.reason as string) ?? null}, ${(l.created_at as string) ?? new Date().toISOString()})`;
      }
      for (const r of d.tables.rewards ?? []) {
        await tx`insert into rewards (id, title, emoji, cost, active, created_by, created_at)
          values (${r.id as string}, ${r.title as string}, ${(r.emoji as string) ?? null}, ${Number(r.cost)}, ${r.active !== false}, ${ids.includes(r.created_by as string) ? (r.created_by as string) : null}, ${(r.created_at as string) ?? new Date().toISOString()})`;
      }
      const rewardIds = (d.tables.rewards ?? []).map((r) => String(r.id));
      for (const c of d.tables.reward_claims ?? []) {
        if (!ids.includes(c.person_id as string)) continue;
        await tx`insert into reward_claims (id, reward_id, title, person_id, cost, status, decided_by, decided_at, created_at)
          values (${c.id as string}, ${rewardIds.includes(c.reward_id as string) ? (c.reward_id as string) : null}, ${c.title as string}, ${c.person_id as string}, ${Number(c.cost)}, ${(c.status as string) ?? "pending"},
            ${ids.includes(c.decided_by as string) ? (c.decided_by as string) : null}, ${(c.decided_at as string) ?? null}, ${(c.created_at as string) ?? new Date().toISOString()})`;
      }
    }
    if (d.tables.lists) {
      await tx`insert into app_meta (key, value) values ('lists', ${tx.json(d.tables.lists as never)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
    }
  });
  return {
    before,
    counts: {
      people: d.tables.people.length,
      events: d.tables.events.length,
      tasks: d.tables.tasks.length,
      items: d.tables.shopping_items.length,
      recipes: d.tables.recipes?.length ?? 0,
    },
  };
}
