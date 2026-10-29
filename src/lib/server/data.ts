import "server-only";
import { db } from "./db";
import type { AppState, CalEvent, Item, Mutation, Person, Recurrence, Task } from "@/lib/types";
import { categories } from "@/lib/shopping";
import { personColors } from "@/lib/types";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));
const day = (v: unknown) => {
  if (!v) return null;
  if (v instanceof Date) {
    // date-Spalten kommen als Mitternacht UTC
    return v.toISOString().slice(0, 10);
  }
  return String(v).slice(0, 10);
};

const toPerson = (r: Row): Person => ({ id: r.id as string, name: r.name as string, color: (r.color as string) ?? null, sort: r.sort as number });
const toEvent = (r: Row): CalEvent => ({
  id: r.id as string,
  title: r.title as string,
  place: (r.place as string) ?? null,
  notes: (r.notes as string) ?? null,
  startsAt: iso(r.starts_at)!,
  endsAt: iso(r.ends_at)!,
  allDay: r.all_day as boolean,
  people: (r.people as string[]) ?? [],
  createdBy: (r.created_by as string) ?? null,
});
const toTask = (r: Row): Task => ({
  id: r.id as string,
  title: r.title as string,
  area: r.area as string,
  personId: (r.person_id as string) ?? null,
  due: day(r.due),
  recurring: (r.recurring as Recurrence) ?? null,
  done: r.done as boolean,
  doneAt: iso(r.done_at),
});
const toItem = (r: Row): Item => ({
  id: r.id as string,
  name: r.name as string,
  amount: (r.amount as string) ?? null,
  category: r.category as string,
  addedBy: (r.added_by as string) ?? null,
  done: r.done as boolean,
  createdAt: iso(r.created_at)!,
});

export async function loadState(from: Date, to: Date): Promise<AppState> {
  const sql = db();
  const [people, events, tasks, items] = await Promise.all([
    sql`select * from people order by sort, name`,
    sql`select * from events where ends_at > ${from} and starts_at < ${to} order by starts_at`,
    sql`select * from tasks where done = false or done_at > now() - interval '2 days' order by done, due nulls first, created_at`,
    sql`select * from shopping_items where done = false or done_at > now() - interval '1 day' order by created_at desc`,
  ]);
  return {
    people: people.map(toPerson),
    events: events.map(toEvent),
    tasks: tasks.map(toTask),
    items: items.map(toItem),
  };
}

// --- Validierung ---------------------------------------------------------

class InvalidInput extends Error {}
const str = (v: unknown, max = 200, optional = false): string | null => {
  if (v == null || v === "") {
    if (optional) return null;
    throw new InvalidInput("Pflichtfeld fehlt");
  }
  if (typeof v !== "string") throw new InvalidInput("Ungültiger Text");
  const t = v.trim();
  if (!t && !optional) throw new InvalidInput("Pflichtfeld fehlt");
  if (t.length > max) throw new InvalidInput("Text zu lang");
  return t || null;
};
const uuid = (v: unknown, optional = false): string | null => {
  if (v == null && optional) return null;
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw new InvalidInput("Ungültige ID");
  return v;
};
const dateStr = (v: unknown, optional = false): string | null => {
  if (v == null && optional) return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new InvalidInput("Ungültiges Datum");
  return v;
};
const timestamp = (v: unknown): Date => {
  const d = new Date(typeof v === "string" ? v : NaN);
  if (isNaN(+d)) throw new InvalidInput("Ungültige Uhrzeit");
  return d;
};
const recurrences: Recurrence[] = ["daily", "weekly", "biweekly", "monthly"];

function nextDue(from: string, r: Recurrence) {
  const d = new Date(`${from}T12:00:00Z`);
  if (r === "daily") d.setUTCDate(d.getUTCDate() + 1);
  if (r === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  if (r === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
  if (r === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export { InvalidInput };

/** Führt eine Änderung aus und gibt den betroffenen Bereich zurück */
export async function mutate(m: Mutation, by: string | null): Promise<string> {
  const sql = db();
  const actor = by && /^[0-9a-f-]{36}$/i.test(by) ? by : null;

  switch (m.op) {
    case "person.setColor": {
      const color = str(m.color, 9)!;
      if (!personColors.includes(color)) throw new InvalidInput("Farbe nicht erlaubt");
      await sql`update people set color = ${color} where id = ${uuid(m.id)!}`;
      return "people";
    }
    case "task.create": {
      const rec = m.recurring && recurrences.includes(m.recurring) ? m.recurring : null;
      await sql`insert into tasks (title, area, person_id, due, recurring, created_by)
        values (${str(m.title, 140)!}, ${str(m.area, 40) ?? "Haushalt"}, ${uuid(m.personId, true)}, ${dateStr(m.due, true)}, ${rec}, ${actor})`;
      return "tasks";
    }
    case "task.toggle": {
      const id = uuid(m.id)!;
      const today = dateStr(m.today)!;
      const [t] = await sql`select * from tasks where id = ${id}`;
      if (!t) return "tasks";
      if (m.done) {
        await sql`update tasks set done = true, done_at = now() where id = ${id}`;
        // wiederkehrend: nächste Runde direkt anlegen
        if (t.recurring && !t.done) {
          const base = day(t.due) && day(t.due)! > today ? day(t.due)! : today;
          await sql`insert into tasks (title, area, person_id, due, recurring, created_by)
            values (${t.title}, ${t.area}, ${t.person_id}, ${nextDue(base, t.recurring as Recurrence)}, ${t.recurring}, ${t.created_by})`;
        }
      } else {
        await sql`update tasks set done = false, done_at = null where id = ${id}`;
      }
      return "tasks";
    }
    case "task.postpone": {
      const today = dateStr(m.today)!;
      const tomorrow = nextDue(today, "daily");
      await sql`update tasks set due = greatest(coalesce(due, ${today}::date) + 1, ${tomorrow}::date) where id = ${uuid(m.id)!}`;
      return "tasks";
    }
    case "task.assign":
      await sql`update tasks set person_id = ${uuid(m.personId, true)} where id = ${uuid(m.id)!}`;
      return "tasks";
    case "task.delete":
      await sql`delete from tasks where id = ${uuid(m.id)!}`;
      return "tasks";

    case "item.create": {
      const cat = categories.includes(m.category) ? m.category : "Vorrat";
      await sql`insert into shopping_items (name, amount, category, added_by)
        values (${str(m.name, 80)!}, ${str(m.amount, 30, true)}, ${cat}, ${actor})`;
      return "items";
    }
    case "item.toggle":
      await sql`update shopping_items set done = ${!!m.done}, done_at = ${m.done ? sql`now()` : null} where id = ${uuid(m.id)!}`;
      return "items";
    case "item.move": {
      if (!categories.includes(m.category)) throw new InvalidInput("Unbekannte Abteilung");
      await sql`update shopping_items set category = ${m.category} where id = ${uuid(m.id)!}`;
      return "items";
    }
    case "item.delete":
      await sql`delete from shopping_items where id = ${uuid(m.id)!}`;
      return "items";
    case "item.clearDone":
      await sql`delete from shopping_items where done = true`;
      return "items";

    case "event.create": {
      const start = timestamp(m.startsAt);
      const end = timestamp(m.endsAt);
      if (end < start) throw new InvalidInput("Ende liegt vor dem Beginn");
      const ppl = Array.isArray(m.people) ? m.people.slice(0, 10).map((p) => uuid(p)!) : [];
      await sql`insert into events (title, place, starts_at, ends_at, all_day, people, created_by)
        values (${str(m.title, 140)!}, ${str(m.place, 140, true)}, ${start}, ${end}, ${!!m.allDay}, ${sql.array(ppl)}::uuid[], ${actor})`;
      return "events";
    }
    case "event.delete":
      await sql`delete from events where id = ${uuid(m.id)!}`;
      return "events";

    default:
      throw new InvalidInput("Unbekannte Aktion");
  }
}
