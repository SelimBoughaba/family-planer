// Schnelleingabe: „Zahnarzt Samir Dienstag 15 Uhr“, „Müll rausbringen morgen“, „Milch Eier Brot“
// Läuft komplett im Browser, ohne KI. Erkennt Art, Tag, Uhrzeit und Personen.

import { guessCategory, knownItem, parseItem } from "./shopping";

export type QuickKind = "event" | "task" | "items";

export type QuickParse = {
  kind: QuickKind;
  /** Art wurde ausdrücklich genannt („Termin:“, „kaufen“) */
  explicit: boolean;
  title: string;
  /** Tag als Datum (Mitternacht, Ortszeit) oder null */
  day: Date | null;
  time: { h: number; m: number } | null;
  end: { h: number; m: number } | null;
  people: string[];
  items: { name: string; amount: string | null; category: string }[];
};

type P = { id: string; name: string };

const WEEKDAYS = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
const SHORT = ["so", "mo", "di", "mi", "do", "fr", "sa"];
const MONTHS = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];

const EVENT_WORDS = [
  "termin", "arzt", "ärztin", "zahnarzt", "kinderarzt", "hausarzt", "frauenarzt", "augenarzt", "friseur", "frisör", "physio",
  "training", "probe", "spiel", "turnier", "geburtstag", "party", "feier", "treffen", "elternabend", "elterngespräch", "sprechstunde",
  "urlaub", "ferien", "ausflug", "konzert", "kino", "theater", "besuch", "flug", "reise", "prüfung", "klausur", "hochzeit", "taufe",
  "meeting", "schwimmen", "fußball", "kurs", "unterricht", "nachhilfe", "abholen", "vorstellung", "impfung", "untersuchung",
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseQuick(input: string, people: P[], me: string | null, now = new Date()): QuickParse {
  let t = ` ${input.replace(/\s+/g, " ").trim()} `;
  const today = startOfDay(now);
  let kind: QuickKind | null = null;
  let day: Date | null = null;
  let time: { h: number; m: number } | null = null;
  let end: { h: number; m: number } | null = null;
  let part: "am" | "pm" | null = null;
  const who: string[] = [];

  // Teil entfernen und Treffer zurückgeben
  const take = (re: RegExp) => {
    const m = t.match(re);
    if (m) t = t.replace(m[0], " ");
    return m;
  };

  // 1. ausdrücklich genannte Art
  if (take(/^\s*(?:einkauf(?:en)?|einkaufsliste|liste|kaufen)\s*:\s*/i)) kind = "items";
  else if (take(/^\s*termin\s*:\s*/i)) kind = "event";
  else if (take(/^\s*(?:aufgabe|todo|to-do)\s*:\s*/i)) kind = "task";
  if (!kind && take(/\s(?:kaufen|besorgen|einkaufen)\s*$/i)) kind = "items";

  // 2. Tageszeit-Hinweise
  if (take(/\s(?:morgens|früh|vormittags)(?=\s)/i)) part = "am";
  else if (take(/\s(?:nachmittags|abends|nachts|mittags)(?=\s)/i)) part = "pm";

  // 3. Uhrzeit, zuerst Zeiträume
  const hm = (h: string, m?: string) => ({ h: Number(h), m: m ? Number(m) : 0 });
  let r = take(/\s(?:von\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr\s*)?(?:-|–|bis)\s*(\d{1,2})(?:[:.](\d{2}))?\s*uhr(?=\s)/i);
  if (r) {
    time = hm(r[1], r[2]);
    end = hm(r[3], r[4]);
  } else if ((r = take(/\s(?:um\s+)?(\d{1,2})[:.](\d{2})(?:\s*uhr)?(?=\s)/i))) time = hm(r[1], r[2]);
  else if ((r = take(/\s(?:um\s+)?(\d{1,2})\s*uhr(?=\s)/i))) time = hm(r[1]);
  else if ((r = take(/\s(?:um\s+)?halb\s+(\d{1,2})(?=\s)/i))) time = { h: (Number(r[1]) + 23) % 24, m: 30 };
  else if ((r = take(/\sum\s+(\d{1,2})(?=\s)(?!\s*(?:kg|g|l|ml|stück|x)\b)/i))) time = hm(r[1]);
  const fix = (x: { h: number; m: number } | null) => {
    if (!x) return x;
    let h = x.h;
    // „um 3“ meint in einer Familie fast immer nachmittags
    if (part === "pm" && h < 12) h += 12;
    else if (part !== "am" && h >= 1 && h <= 7) h += 12;
    return h <= 23 && x.m <= 59 ? { h, m: x.m } : null;
  };
  time = fix(time);
  end = fix(end);
  if (time && end && end.h * 60 + end.m <= time.h * 60 + time.m) end = null;

  // 4. Tag
  if (take(/\sübermorgen(?=\s)/i)) day = addDays(today, 2);
  else if (take(/\smorgen(?=\s)/i)) day = addDays(today, 1);
  else if (take(/\sheute(?=\s)/i)) day = today;
  if (!day && (r = take(/\sin\s+(\d{1,2}|einem|einer|zwei|drei)\s+(tag(?:en)?|woche(?:n)?)(?=\s)/i))) {
    const n = { einem: 1, einer: 1, zwei: 2, drei: 3 }[r[1].toLowerCase() as "einem"] ?? Number(r[1]);
    day = addDays(today, /woche/i.test(r[2]) ? n * 7 : n);
  }
  if (!day && (r = take(/\s(?:am\s+)?(\d{1,2})\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+(\d{4}))?(?=\s)/i))) {
    day = dateFrom(Number(r[1]), MONTHS.indexOf(r[2].toLowerCase()) + 1, r[3] ? Number(r[3]) : null, today);
  }
  if (!day && (r = take(/\s(?:am\s+)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/))) {
    const y = r[3] ? Number(r[3].length === 2 ? `20${r[3]}` : r[3]) : null;
    day = dateFrom(Number(r[1]), Number(r[2]), y, today);
  }
  if (!day && (r = take(new RegExp(`\\s(?:am\\s+)?(nächsten|kommenden)?\\s*(${WEEKDAYS.join("|")})(?=\\s)`, "i")))) {
    day = nextWeekday(today, WEEKDAYS.indexOf(r[2].toLowerCase()), !!r[1]);
  }
  if (!day && (r = take(new RegExp(`\\s(?:am\\s+)?(${SHORT.join("|")})\\.(?=\\s)`, "i")))) {
    day = nextWeekday(today, SHORT.indexOf(r[1].toLowerCase()), false);
  }
  if (!day && take(/\snächste\s+woche(?=\s)/i)) day = nextWeekday(today, 1, true);

  // 5. Personen
  for (const p of people) {
    if (take(new RegExp(`\\s(?:mit\\s+|für\\s+)?${esc(p.name)}s?(?=[\\s,])`, "i"))) who.push(p.id);
  }
  if (take(/\s(?:mit\s+|für\s+)?(?:allen|alle|familie|der familie)(?=\s)/i)) for (const p of people) if (!who.includes(p.id)) who.push(p.id);
  if (me && take(/\s(?:für\s+)?(?:ich|mich|mir)(?=\s)/i) && !who.includes(me)) who.push(me);

  // 6. Rest aufräumen
  let rest = t
    .replace(/\s(?:und|mit|für|am|um|von|bis|an|im|zum|zur|beim|bei)\s*$/i, " ")
    .replace(/^\s*(?:am|um|für|mit)\s/i, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,;:.\s]+|[,;:\s]+$/g, "");

  // 7. Art bestimmen
  const lower = ` ${rest.toLowerCase()} `;
  const eventWord = EVENT_WORDS.some((w) => lower.includes(w));
  let items: QuickParse["items"] = [];
  const splitItems = () => {
    let parts = rest.split(/\s*(?:,|;|\bund\b|\n)\s*/i).filter(Boolean);
    // „Milch Eier Brot“: lauter bekannte Wörter ohne Mengen
    if (parts.length === 1 && !/\d/.test(parts[0])) {
      const words = parts[0].split(" ");
      if (words.length > 1 && words.every((w) => knownItem(w))) parts = words;
    }
    return parts.map((x) => {
      const it = parseItem(x);
      const name = it.name.charAt(0).toUpperCase() + it.name.slice(1);
      return { name, amount: it.amount, category: guessCategory(name) };
    });
  };
  const explicit = !!kind;
  if (!kind) {
    if (time || eventWord) kind = "event";
    else if (!day && !who.length && rest && looksLikeShopping(rest)) kind = "items";
    else kind = "task";
  }
  if (kind === "items") items = splitItems();
  if (rest) rest = rest.charAt(0).toUpperCase() + rest.slice(1);

  return { kind, explicit, title: rest, day, time, end, people: who, items };
}

function looksLikeShopping(rest: string) {
  const parts = rest.split(/\s*(?:,|;|\bund\b)\s*/i).filter(Boolean);
  const words = parts.length > 1 ? parts : rest.split(" ");
  // überwiegend bekannte Lebensmittel oder Haushaltsartikel
  const known = words.filter((w) => knownItem(w)).length;
  return known > 0 && known >= Math.ceil(words.length * 0.6);
}

function dateFrom(d: number, m: number, y: number | null, today: Date) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  let date = new Date(y ?? today.getFullYear(), m - 1, d);
  if (date.getDate() !== d) return null;
  if (!y && date < today) date = new Date(today.getFullYear() + 1, m - 1, d);
  return date;
}

function nextWeekday(today: Date, wd: number, next: boolean) {
  let diff = (wd - today.getDay() + 7) % 7;
  if (next && diff === 0) diff = 7;
  return addDays(today, diff);
}

/** Kurzbeschreibung für die Vorschau, z. B. „Di, 4. Nov., 15:00 bis 16:00“ */
export function describeWhen(q: QuickParse, now = new Date()) {
  const parts: string[] = [];
  const today = startOfDay(now);
  if (q.day) {
    const diff = Math.round((+q.day - +today) / 86400000);
    parts.push(
      diff === 0 ? "heute" : diff === 1 ? "morgen" : diff === 2 ? "übermorgen" : q.day.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" }),
    );
  }
  const f = (x: { h: number; m: number }) => `${String(x.h).padStart(2, "0")}:${String(x.m).padStart(2, "0")}`;
  if (q.time) parts.push(q.end ? `${f(q.time)} bis ${f(q.end)}` : `${f(q.time)} Uhr`);
  return parts.join(", ");
}

/** Beginn eines erkannten Termins; ohne Tag heute, oder morgen, wenn die Uhrzeit schon vorbei ist */
export function quickStart(q: QuickParse, now = new Date()) {
  const base = q.day ?? startOfDay(now);
  if (!q.time) return { start: base, allDay: true, duration: 60 };
  let start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), q.time.h, q.time.m);
  if (!q.day && start < now) start = addDays(start, 1);
  const duration = q.end ? q.end.h * 60 + q.end.m - (q.time.h * 60 + q.time.m) : 60;
  return { start, allDay: false, duration };
}
