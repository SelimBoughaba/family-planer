import "server-only";
import { db } from "./db";
import { dayString, formatBerlin, fromWall, wall } from "./berlin";
import { starts, type EventRow } from "./reminders";
import { sendToPeople } from "./push";

/** Wer hat heute Abend (18 bis 20 Uhr) oder ganztägig einen Termin? personId → Grund */
export async function eveningClashes(day: string) {
  const sql = db();
  const [y, m, d] = day.split("-").map(Number);
  const d0 = +fromWall(y, m, d, 0, 0);
  const from = +fromWall(y, m, d, 18, 0);
  const to = +fromWall(y, m, d, 20, 0);
  const rows = (await sql`
    select * from events where cardinality(people) > 0
      and (recurrence is not null or (starts_at < ${new Date(to)} and ends_at > ${new Date(d0)}))
  `) as unknown as EventRow[];
  const out = new Map<string, string>();
  for (const e of rows) {
    const dur = +new Date(e.ends_at) - +new Date(e.starts_at);
    for (const s of starts(e, d0 - dur, to)) {
      const end = +s + dur;
      const hit = e.all_day ? +s <= d0 && end > d0 : +s < to && end > from;
      if (!hit) continue;
      const why = e.all_day ? e.title : `${e.title} ${formatBerlin(s, { hour: "2-digit", minute: "2-digit" })}`;
      for (const p of e.people) if (!out.has(p)) out.set(p, why);
    }
  }
  return out;
}

/** Um 16 Uhr: Wer kocht, erfährt, wie viele mitessen. Läuft im Minutentakt des Zeitplaners. */
export async function dinnerHeadsUp(now: number) {
  const w = wall(now);
  if (w.h !== 16 || w.mi > 10) return 0;
  const sql = db();
  const day = dayString(now);
  const [meal] = await sql`select title, cook from meal_plan where day = ${day}`;
  if (!meal?.cook) return 0;
  const [claimed] = await sql`insert into notifications_sent (key) values (${`dinner:${day}`}) on conflict do nothing returning key`;
  if (!claimed) return 0;
  const people = await sql`select id, name from people order by sort, name`;
  const explicit = new Map((await sql`select person_id, present from meal_attendance where day = ${day}`).map((r) => [r.person_id as string, !!r.present]));
  const clashes = await eveningClashes(day);
  const yes: string[] = [];
  const maybe: string[] = [];
  for (const p of people) {
    const id = p.id as string;
    if (explicit.has(id)) {
      if (explicit.get(id)) yes.push(p.name as string);
    } else if (clashes.has(id)) maybe.push(`${p.name} (${clashes.get(id)})`);
    else yes.push(p.name as string);
  }
  console.log(`[dinner] ${yes.length} essen mit, ${maybe.length} wahrscheinlich nicht`);
  const body = [`${meal.title}: ${yes.join(", ") || "niemand"}`, maybe.length ? `Wahrscheinlich nicht: ${maybe.join(", ")}` : null].filter(Boolean).join(". ");
  return sendToPeople([meal.cook as string], { title: `Heute essen ${yes.length} mit`, body, url: "/", tag: `dinner:${day}` });
}
