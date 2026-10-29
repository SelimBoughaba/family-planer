// Gemeinsame Typen für Browser und Server

export type NotifyPrefs = { invited: boolean; assigned: boolean };

export type Person = {
  id: string;
  name: string;
  color: string | null;
  sort: number;
  notifyPrefs: NotifyPrefs;
};

export type CalEvent = {
  id: string;
  title: string;
  place: string | null;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  people: string[];
  createdBy: string | null;
  recurrence: EventRecurrence | null;
  recurrenceUntil: string | null; // YYYY-MM-DD, einschließlich
  exdates: string[]; // ISO-Beginn ausgelassener Vorkommen
  reminders: number[]; // Minuten vor Beginn
};

export type EventRecurrence = "daily" | "weekly" | "biweekly" | "monthly" | "yearly";

export const eventRecurrenceLabel: Record<EventRecurrence, string> = {
  daily: "Täglich",
  weekly: "Jede Woche",
  biweekly: "Alle 2 Wochen",
  monthly: "Jeden Monat",
  yearly: "Jedes Jahr",
};

/** Felder, die beim Anlegen und Bearbeiten eines Termins gesendet werden */
export type EventFields = {
  title: string;
  place: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  people: string[];
  recurrence: EventRecurrence | null;
  recurrenceUntil: string | null;
  reminders: number[];
};

export type Recurrence = "daily" | "weekly" | "biweekly" | "monthly";

export type Task = {
  id: string;
  title: string;
  area: string;
  personId: string | null;
  due: string | null; // YYYY-MM-DD
  recurring: Recurrence | null;
  done: boolean;
  doneAt: string | null;
  remindTime: string | null; // HH:MM am Fälligkeitstag
};

export type Item = {
  id: string;
  name: string;
  amount: string | null;
  category: string;
  addedBy: string | null;
  done: boolean;
  createdAt: string;
};

export type AppState = {
  people: Person[];
  events: CalEvent[];
  tasks: Task[];
  items: Item[];
};

export type Mutation =
  | { op: "person.setColor"; id: string; color: string }
  | { op: "person.setNotify"; id: string; prefs: NotifyPrefs }
  | { op: "task.create"; title: string; area: string; personId: string | null; due: string | null; recurring: Recurrence | null; remindTime: string | null }
  | { op: "task.toggle"; id: string; done: boolean; today: string }
  | { op: "task.postpone"; id: string; today: string }
  | { op: "task.assign"; id: string; personId: string | null }
  | { op: "task.delete"; id: string }
  | { op: "item.create"; name: string; amount: string | null; category: string }
  | { op: "item.toggle"; id: string; done: boolean }
  | { op: "item.move"; id: string; category: string }
  | { op: "item.delete"; id: string }
  | { op: "item.clearDone" }
  | ({ op: "event.create" } & EventFields)
  | ({ op: "event.update"; id: string } & EventFields)
  | { op: "event.move"; id: string; startsAt: string; endsAt: string }
  | ({ op: "event.detach"; id: string; occurrence: string } & EventFields)
  | { op: "event.delete"; id: string; mode: "all" | "one" | "following"; occurrence?: string };

export const recurrenceLabel: Record<Recurrence, string> = {
  daily: "Täglich",
  weekly: "Jede Woche",
  biweekly: "Alle 2 Wochen",
  monthly: "Jeden Monat",
};

export const areas = ["Haushalt", "Schule", "Uni", "Arbeit", "Garten", "Verträge", "Einkauf", "Sonstiges"];

export const personColors = [
  "#FF6B8B",
  "#FF453A",
  "#FF9F2E",
  "#E5B700",
  "#2BC48A",
  "#30B0C7",
  "#3E8BFF",
  "#5E5CE6",
  "#8E6CFF",
  "#A2845E",
];

export const FALLBACK_COLOR = "#8E8E93";

export function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Auswahl für Termin-Erinnerungen in Minuten vor Beginn */
export const timedReminderOptions = [
  { minutes: 0, label: "Zur Startzeit" },
  { minutes: 5, label: "5 Min. vorher" },
  { minutes: 15, label: "15 Min. vorher" },
  { minutes: 30, label: "30 Min. vorher" },
  { minutes: 60, label: "1 Std. vorher" },
  { minutes: 120, label: "2 Std. vorher" },
  { minutes: 1440, label: "1 Tag vorher" },
];

/** Ganztägig: Beginn ist Mitternacht, also 300 = Vortag 19 Uhr, -480 = am Tag 8 Uhr */
export const allDayReminderOptions = [
  { minutes: 300, label: "Am Vortag, 19 Uhr" },
  { minutes: -480, label: "Am Tag, 8 Uhr" },
];
