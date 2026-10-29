import "server-only";
import { db } from "./db";
import { formatBerlin, fromWall, wall } from "./berlin";
import { pushConfigured, sendToPeople } from "./push";
import type { EventRecurrence } from "@/lib/types";

const MIN = 60000;
const DAY = 1440 * MIN;
const CATCH_UP = 10 * MIN; // verspätete Läufe holen bis zu 10 Minuten nach

type EventRow = {
  id: string;
  title: string;
  place: string | null;
  starts_at: Date;
  ends_at: Date;
  all_day: boolean;
  people: string[];
  recurrence: EventRecurrence | null;
  recurrence_until: Date | string | null;
  exdates: Date[];
  reminders: number[];
};

/** Vorkommen einer Serie in Berliner Ortszeit, die zwischen from und to beginnen */
function starts(e: EventRow, from: number, to: number): Date[] {
  const base = new Date(e.starts_at);
  if (!e.recurrence) return +base >= from && +base < to ? [base] : [];
  const w = wall(base);
  const until = e.recurrence_until ? String(e.recurrence_until instanceof Date ? e.recurrence_until.toISOString() : e.recurrence_until).slice(0, 10) : null;
  const ex = new Set((e.exdates ?? []).map((x) => +new Date(x)));
  const out: Date[] = [];
  const step = e.recurrence === "daily" ? 1 : e.recurrence === "weekly" ? 7 : e.recurrence === "biweekly" ? 14 : 0;
  let k = step ? Math.max(0, Math.floor((from - +base) / (step * DAY)) - 1) : 0;
  for (let guard = 0; guard < 1000; guard++, k++) {
    let s: Date;
    if (step) s = fromWall(w.y, w.m, w.d + step * k, w.h, w.mi);
    else {
      const months = e.recurrence === "monthly" ? k : 12 * k;
      const y = w.y + Math.floor((w.m - 1 + months) / 12);
      const m = ((w.m - 1 + months) % 12) + 1;
      if (w.d > new Date(Date.UTC(y, m, 0)).getUTCDate()) continue; // z. B. 31. im Februar
      s = fromWall(y, m, w.d, w.h, w.mi);
    }
    if (+s >= to) break;
    const ws = wall(s);
    const sDay = `${ws.y}-${String(ws.m).padStart(2, "0")}-${String(ws.d).padStart(2, "0")}`;
    if (until && sDay > until) break;
    if (+s >= from && !ex.has(+s)) out.push(s);
  }
  return out;
}

function reminderText(e: EventRow, start: Date, offset: number) {
  if (e.all_day) {
    const when = offset > 0 ? "Morgen" : "Heute";
    return `${when} ganztägig${e.place ? `, ${e.place}` : ""}`;
  }
  const time = formatBerlin(start, { hour: "2-digit", minute: "2-digit" });
  const lead =
    offset <= 0 ? "Jetzt" : offset < 60 ? `In ${offset} Min.` : offset < 1440 ? `In ${offset / 60} Std.` : `Morgen`;
  return `${lead}, um ${time} Uhr${e.place ? `, ${e.place}` : ""}`;
}

/** Wird jede Minute vom Zeitplaner aufgerufen */
export async function runReminders(now = Date.now()) {
  const sql = db();
  // ohne Schlüssel nichts als versendet markieren, sonst gingen Erinnerungen verloren
  if (!pushConfigured()) return { checked: 0, sent: 0, skipped: "push_missing" };
  const from = now - CATCH_UP;
  let sent = 0;
  let checked = 0;

  const everyone = (await sql`select id from people`).map((r) => r.id as string);

  // Termine: Erinnerungszeitpunkt = Beginn minus Versatz
  const events = (await sql`
    select * from events
    where cardinality(reminders) > 0
      and (recurrence is not null or starts_at between ${new Date(now - 2 * DAY)} and ${new Date(now + 9 * DAY)})
  `) as unknown as EventRow[];

  for (const e of events) {
    const maxOffset = Math.max(...e.reminders);
    const minOffset = Math.min(...e.reminders);
    for (const s of starts(e, from + minOffset * MIN, now + maxOffset * MIN + MIN)) {
      for (const offset of e.reminders) {
        const fire = +s - offset * MIN;
        if (fire <= from || fire > now) continue;
        checked++;
        const key = `e:${e.id}:${s.toISOString()}:${offset}`;
        const [claimed] = await sql`insert into notifications_sent (key) values (${key}) on conflict do nothing returning key`;
        if (!claimed) continue;
        sent += await sendToPeople(e.people.length ? e.people : everyone, {
          title: e.title,
          body: reminderText(e, s, offset),
          tag: key,
          url: "/",
        });
      }
    }
  }

  // Aufgaben: am Fälligkeitstag zur gewählten Uhrzeit (Berliner Zeit)
  const tasks = await sql`
    select id, title, person_id, due::text as due, remind_time::text as remind_time from tasks
    where done = false and remind_time is not null and due between ${new Date(now - 2 * DAY)}::date and ${new Date(now + 2 * DAY)}::date
  `;
  for (const t of tasks) {
    const [y, m, d] = String(t.due).split("-").map(Number);
    const [h, mi] = String(t.remind_time).split(":").map(Number);
    const fire = +fromWall(y, m, d, h, mi);
    if (fire <= from || fire > now) continue;
    checked++;
    const key = `t:${t.id}:${t.due}`;
    const [claimed] = await sql`insert into notifications_sent (key) values (${key}) on conflict do nothing returning key`;
    if (!claimed) continue;
    sent += await sendToPeople(t.person_id ? [t.person_id as string] : everyone, {
      title: "Aufgabe",
      body: String(t.title),
      tag: key,
      url: "/",
    });
  }

  if (Math.random() < 0.02) await sql`delete from notifications_sent where sent_at < now() - interval '45 days'`;
  await sql`insert into app_meta (key, value, updated_at) values ('reminders_last_run', ${sql.json({ checked, sent })}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  if (sent) console.log(`[reminders] ${sent} Mitteilung(en) verschickt`);
  return { checked, sent };
}
