import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import type { AppState, CalEvent, EventFields, EventRecurrence, Item, Mutation, Person, Recurrence, Task } from "@/lib/types";
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
  recurrence: (r.recurrence as EventRecurrence) ?? null,
  recurrenceUntil: day(r.recurrence_until),
  exdates: ((r.exdates as unknown[]) ?? []).map((x) => iso(x)!),
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
    sql`select * from events
      where (recurrence is null and ends_at > ${from} and starts_at < ${to})
         or (recurrence is not null and starts_at < ${to} and (recurrence_until is null or recurrence_until >= ${from}::date - 1))
      order by starts_at`,
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

const eventRecurrences: EventRecurrence[] = ["daily", "weekly", "biweekly", "monthly", "yearly"];

function eventFields(m: EventFields) {
  const start = timestamp(m.startsAt);
  const end = timestamp(m.endsAt);
  if (end < start) throw new InvalidInput("Ende liegt vor dem Beginn");
  if (+end - +start > 60 * 86400000) throw new InvalidInput("Termin ist zu lang");
  const recurrence = m.recurrence && eventRecurrences.includes(m.recurrence) ? m.recurrence : null;
  return {
    title: str(m.title, 140)!,
    place: str(m.place, 140, true),
    start,
    end,
    allDay: !!m.allDay,
    people: Array.isArray(m.people) ? [...new Set(m.people)].slice(0, 10).map((p) => uuid(p)!) : [],
    recurrence,
    until: recurrence ? dateStr(m.recurrenceUntil, true) : null,
  };
}

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
      const f = eventFields(m);
      await sql`insert into events (title, place, starts_at, ends_at, all_day, people, recurrence, recurrence_until, created_by)
        values (${f.title}, ${f.place}, ${f.start}, ${f.end}, ${f.allDay}, ${sql.array(f.people)}::uuid[], ${f.recurrence}, ${f.until}, ${actor})`;
      return "events";
    }
    case "event.update": {
      const f = eventFields(m);
      await sql`update events set title = ${f.title}, place = ${f.place}, starts_at = ${f.start}, ends_at = ${f.end},
        all_day = ${f.allDay}, people = ${sql.array(f.people)}::uuid[], recurrence = ${f.recurrence}, recurrence_until = ${f.until},
        exdates = case when ${f.recurrence}::text is null then '{}' else exdates end, updated_at = now()
        where id = ${uuid(m.id)!}`;
      return "events";
    }
    case "event.move": {
      const start = timestamp(m.startsAt);
      const end = timestamp(m.endsAt);
      if (end < start) throw new InvalidInput("Ende liegt vor dem Beginn");
      // bei Serien verschiebt sich die ganze Serie, Ausnahmen wandern mit
      await sql`update events set
        exdates = coalesce((select array_agg(x + (${start}::timestamptz - starts_at)) from unnest(exdates) as x), '{}'),
        starts_at = ${start}, ends_at = ${end}, updated_at = now()
        where id = ${uuid(m.id)!}`;
      return "events";
    }
    case "event.detach": {
      // ein einzelnes Vorkommen aus der Serie lösen und als eigenen Termin speichern
      const id = uuid(m.id)!;
      const occ = timestamp(m.occurrence);
      const f = eventFields({ ...m, recurrence: null, recurrenceUntil: null });
      await sql.begin(async (tx) => {
        await tx`update events set exdates = array_append(exdates, ${occ}::timestamptz), updated_at = now() where id = ${id}`;
        await tx`insert into events (title, place, starts_at, ends_at, all_day, people, created_by)
          values (${f.title}, ${f.place}, ${f.start}, ${f.end}, ${f.allDay}, ${sql.array(f.people)}::uuid[], ${actor})`;
      });
      return "events";
    }
    case "event.delete": {
      const id = uuid(m.id)!;
      if (m.mode === "one" && m.occurrence) {
        await sql`update events set exdates = array_append(exdates, ${timestamp(m.occurrence)}::timestamptz), updated_at = now() where id = ${id}`;
      } else if (m.mode === "following" && m.occurrence) {
        const occ = timestamp(m.occurrence);
        // Serie endet am Tag vor diesem Vorkommen; ist es das erste, fällt alles weg
        const [e] = await sql`select starts_at from events where id = ${id}`;
        if (e && +new Date(e.starts_at as string) >= +occ) await sql`delete from events where id = ${id}`;
        else await sql`update events set recurrence_until = (${occ}::timestamptz at time zone 'Europe/Berlin')::date - 1, updated_at = now() where id = ${id}`;
      } else {
        await sql`delete from events where id = ${id}`;
      }
      return "events";
    }

    default:
      throw new InvalidInput("Unbekannte Aktion");
  }
}

// --- Kalender-Abo --------------------------------------------------------


export async function ensureCalendarToken(personId: string) {
  const sql = db();
  const id = uuid(personId)!;
  const [row] = await sql`select calendar_token from people where id = ${id}`;
  if (!row) throw new InvalidInput("Unbekannte Person");
  if (row.calendar_token) return row.calendar_token as string;
  const token = randomBytes(24).toString("base64url");
  await sql`update people set calendar_token = ${token} where id = ${id} and calendar_token is null`;
  const [again] = await sql`select calendar_token from people where id = ${id}`;
  return again.calendar_token as string;
}

export async function feedForToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const sql = db();
  const [owner] = await sql`select * from people where calendar_token = ${token}`;
  if (!owner) return null;
  const [people, events] = await Promise.all([
    sql`select * from people order by sort, name`,
    // Serien immer, Einzeltermine ab 90 Tagen in der Vergangenheit
    sql`select * from events where recurrence is not null or ends_at > now() - interval '90 days' order by starts_at`,
  ]);
  return {
    owner: toPerson(owner),
    people: people.map(toPerson),
    events: events.map((r) => ({ ...toEvent(r), updatedAt: iso(r.updated_at)! })),
  };
}
