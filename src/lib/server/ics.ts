import "server-only";
import type { CalEvent, Person } from "@/lib/types";

export const TZ = "Europe/Berlin";

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function local(d: Date) {
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}${p.month}${p.day}`, time: `${p.hour}${p.minute}${p.second}` };
}

const utc = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Ende des Kalendertags in Berlin als UTC, für UNTIL */
function endOfLocalDayUtc(day: string) {
  // 23:59:59 Ortszeit; Versatz über einen Mittagszeitpunkt desselben Tages bestimmen
  const noon = new Date(`${day}T12:00:00Z`);
  const l = local(noon);
  const offsetH = Number(l.time.slice(0, 2)) - 12;
  return new Date(Date.parse(`${day}T23:59:59Z`) - offsetH * 3600000);
}

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Zeilen nach RFC 5545 auf 75 Bytes falten */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const rrule: Record<NonNullable<CalEvent["recurrence"]>, string> = {
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  biweekly: "FREQ=WEEKLY;INTERVAL=2",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};

export function buildCalendar(opts: { name: string; color?: string | null; events: (CalEvent & { updatedAt?: string })[]; people: Person[] }) {
  const names = new Map(opts.people.map((p) => [p.id, p.name]));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Familienplaner//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
    ...(opts.color ? [`X-APPLE-CALENDAR-COLOR:${opts.color}`] : []),
    ...VTIMEZONE,
  ];

  for (const e of opts.events) {
    const start = new Date(e.startsAt);
    const end = new Date(e.endsAt);
    lines.push("BEGIN:VEVENT", `UID:${e.id}@familienplaner`, `DTSTAMP:${utc(new Date(e.updatedAt ?? Date.now()))}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${local(start).date}`, `DTEND;VALUE=DATE:${local(end).date}`);
    } else {
      const s = local(start);
      const en = local(end);
      lines.push(`DTSTART;TZID=${TZ}:${s.date}T${s.time}`, `DTEND;TZID=${TZ}:${en.date}T${en.time}`);
    }
    if (e.recurrence) {
      let rule = rrule[e.recurrence];
      if (e.recurrenceUntil) rule += e.allDay ? `;UNTIL=${e.recurrenceUntil.replace(/-/g, "")}` : `;UNTIL=${utc(endOfLocalDayUtc(e.recurrenceUntil))}`;
      lines.push(`RRULE:${rule}`);
      for (const x of e.exdates) {
        const l = local(new Date(x));
        lines.push(e.allDay ? `EXDATE;VALUE=DATE:${l.date}` : `EXDATE;TZID=${TZ}:${l.date}T${l.time}`);
      }
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.place) lines.push(`LOCATION:${esc(e.place)}`);
    const who = e.people.map((id) => names.get(id)).filter(Boolean);
    if (who.length) lines.push(`DESCRIPTION:${esc(`Mit: ${who.join(", ")}`)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
