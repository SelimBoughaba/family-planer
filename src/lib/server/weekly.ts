import "server-only";
import { db } from "./db";
import { fromWall, wall } from "./berlin";
import { starts, type EventRow } from "./reminders";
import { sendToPeople } from "./push";

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Sonntags um 18 Uhr: jede Person bekommt eine kurze Vorschau auf ihre Woche */
export async function weeklyPreview(now: number) {
  const w = wall(now);
  const weekday = new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay();
  if (weekday !== 0 || w.h !== 18 || w.mi > 10) return 0;
  const sql = db();
  const mon = fromWall(w.y, w.m, w.d + 1, 0, 0);
  const nextMon = fromWall(w.y, w.m, w.d + 8, 0, 0);
  const mw = wall(mon);
  const monDay = `${mw.y}-${String(mw.m).padStart(2, "0")}-${String(mw.d).padStart(2, "0")}`;
  const sunDay = (() => {
    const s = wall(+nextMon - 3600_000);
    return `${s.y}-${String(s.m).padStart(2, "0")}-${String(s.d).padStart(2, "0")}`;
  })();

  const people = await sql`
    select p.id, p.name, p.notify_prefs from people p
    where exists (select 1 from push_subscriptions s where s.person_id = p.id)`;
  if (!people.length) return 0;
  const events = (await sql`
    select * from events where cardinality(people) > 0
      and (recurrence is not null or (starts_at < ${nextMon} and ends_at > ${mon}))`) as unknown as EventRow[];
  const tasks = await sql`select person_id, rotation from tasks where done = false and due between ${monDay}::date and ${sunDay}::date`;
  const meals = await sql`select day::text as day, cook from meal_plan where day between ${monDay}::date and ${sunDay}::date and cook is not null order by day`;
  const pts = await sql`
    select person_id, coalesce(sum(points), 0)::int as n from points_ledger
    where created_at >= ${fromWall(w.y, w.m, w.d - 6, 0, 0)} group by person_id order by n desc`;

  let sent = 0;
  for (const p of people) {
    const id = p.id as string;
    const prefs = { weekly: true, ...((p.notify_prefs as object) ?? {}) } as { weekly: boolean };
    if (!prefs.weekly) continue;
    const [claimed] = await sql`insert into notifications_sent (key) values (${`weekly:${monDay}:${id}`}) on conflict do nothing returning key`;
    if (!claimed) continue;

    let termine = 0;
    for (const e of events) if (e.people.includes(id)) termine += starts(e, +mon, +nextMon).length;
    const mine = tasks.filter((t) => t.person_id === id);
    const dienste = mine.filter((t) => ((t.rotation as string[]) ?? []).length >= 2).length;
    const kochen = meals.filter((m) => m.cook === id).map((m) => WD[new Date(`${m.day}T12:00:00Z`).getUTCDay()]);
    const rank = pts.findIndex((r) => r.person_id === id);
    const points = rank >= 0 ? Number(pts[rank].n) : 0;

    const parts = [
      termine ? `${termine} ${termine === 1 ? "Termin" : "Termine"}` : "keine Termine",
      mine.length ? `${mine.length} ${mine.length === 1 ? "Aufgabe" : "Aufgaben"}${dienste ? `, davon ${dienste} Dienst` : ""}` : null,
      kochen.length ? `${kochen.join(" und ")} kochst du` : null,
    ].filter(Boolean);
    const score = points ? `Diese Woche hast du ${points} ${points === 1 ? "Punkt" : "Punkte"} geholt, Platz ${rank + 1}.` : "Diese Woche gab es noch keine Punkte für dich.";
    const body = `Nächste Woche: ${parts.join(", ")}. ${score}`;
    sent += await sendToPeople([id], { title: "Deine Woche", body, url: "/", tag: `weekly:${monDay}` });
  }
  return sent;
}
