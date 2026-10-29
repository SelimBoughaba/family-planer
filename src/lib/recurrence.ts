import type { CalEvent } from "./types";

export type Occurrence = {
  key: string;
  event: CalEvent;
  start: Date;
  end: Date;
  /** Beginn dieses Vorkommens laut Serie, für Ausnahmen */
  occurrence: string;
  recurring: boolean;
};

const DAY = 86400000;

function nth(base: Date, rule: NonNullable<CalEvent["recurrence"]>, k: number): Date | null {
  const d = new Date(base);
  switch (rule) {
    case "daily":
      d.setDate(base.getDate() + k);
      return d;
    case "weekly":
      d.setDate(base.getDate() + 7 * k);
      return d;
    case "biweekly":
      d.setDate(base.getDate() + 14 * k);
      return d;
    case "monthly":
      d.setDate(1);
      d.setMonth(base.getMonth() + k);
      // 31. gibt es nicht in jedem Monat: dann auslassen
      if (base.getDate() > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) return null;
      d.setDate(base.getDate());
      return d;
    case "yearly":
      d.setDate(1);
      d.setFullYear(base.getFullYear() + k);
      d.setMonth(base.getMonth());
      if (base.getDate() > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) return null;
      d.setDate(base.getDate());
      return d;
  }
}

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Alle Vorkommen eines Termins, die den Zeitraum berühren */
export function expand(e: CalEvent, from: Date, to: Date): Occurrence[] {
  const base = new Date(e.startsAt);
  const dur = Math.max(0, +new Date(e.endsAt) - +base);
  if (!e.recurrence) {
    const end = new Date(+base + dur);
    return end > from && base < to ? [{ key: e.id, event: e, start: base, end, occurrence: e.startsAt, recurring: false }] : [];
  }
  const ex = new Set(e.exdates.map((x) => +new Date(x)));
  const out: Occurrence[] = [];
  const period = e.recurrence === "daily" ? 1 : e.recurrence === "weekly" ? 7 : e.recurrence === "biweekly" ? 14 : 0;
  // bei festen Abständen direkt in die Nähe des Zeitraums springen
  let k = period ? Math.max(0, Math.floor((+from - +base - dur) / (period * DAY)) - 1) : 0;
  for (let guard = 0; guard < 2000; guard++, k++) {
    const s = nth(base, e.recurrence, k);
    if (!s) continue;
    if (s >= to) break;
    if (e.recurrenceUntil && localDate(s) > e.recurrenceUntil) break;
    const end = new Date(+s + dur);
    if (end > from && !ex.has(+s)) {
      out.push({ key: `${e.id}@${s.toISOString()}`, event: e, start: s, end, occurrence: s.toISOString(), recurring: true });
    }
  }
  return out;
}

export function occurrences(events: CalEvent[], from: Date, to: Date, filter?: string | null) {
  return events
    .filter((e) => !filter || e.people.includes(filter))
    .flatMap((e) => expand(e, from, to))
    .sort((a, b) => +a.start - +b.start || +b.end - +a.end);
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Montag der Woche */
export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const wd = (x.getDay() + 6) % 7;
  return addDays(x, -wd);
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
