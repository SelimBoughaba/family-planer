import "server-only";

/**
 * Rechnen in Berliner Ortszeit, unabhängig von der Zeitzone des Servers (Vercel läuft in UTC).
 * Wichtig für Serien und Erinnerungen über die Zeitumstellung hinweg.
 */
export const TZ = "Europe/Berlin";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type Wall = { y: number; m: number; d: number; h: number; mi: number };

export function wall(t: Date | number): Wall {
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

function offsetAt(t: number) {
  const w = wall(t);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi) - Math.floor(t / 60000) * 60000;
}

/** Ortszeit in Berlin als Zeitpunkt; Monat 1 bis 12, Überlauf von Tagen/Monaten erlaubt */
export function fromWall(y: number, m: number, d: number, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const t1 = guess - offsetAt(guess);
  return new Date(guess - offsetAt(t1));
}

export function dayString(t: Date | number) {
  const w = wall(t);
  return `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

export function formatBerlin(t: Date, opts: Intl.DateTimeFormatOptions) {
  return t.toLocaleString("de-DE", { timeZone: TZ, ...opts });
}
