// Gemeinsame Typen für Browser und Server

export type Person = {
  id: string;
  name: string;
  color: string | null;
  sort: number;
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
  | { op: "task.create"; title: string; area: string; personId: string | null; due: string | null; recurring: Recurrence | null }
  | { op: "task.toggle"; id: string; done: boolean; today: string }
  | { op: "task.postpone"; id: string; today: string }
  | { op: "task.assign"; id: string; personId: string | null }
  | { op: "task.delete"; id: string }
  | { op: "item.create"; name: string; amount: string | null; category: string }
  | { op: "item.toggle"; id: string; done: boolean }
  | { op: "item.move"; id: string; category: string }
  | { op: "item.delete"; id: string }
  | { op: "item.clearDone" }
  | { op: "event.create"; title: string; place: string | null; startsAt: string; endsAt: string; allDay: boolean; people: string[] }
  | { op: "event.delete"; id: string };

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
