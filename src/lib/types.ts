// Gemeinsame Typen für Browser und Server

export type NotifyPrefs = { invited: boolean; assigned: boolean; weekly: boolean };

export type Person = {
  id: string;
  name: string;
  color: string | null;
  sort: number;
  notifyPrefs: NotifyPrefs;
  isParent: boolean;
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
  countdown: boolean; // Countdown oben in Heute
  countdownEmoji: string | null;
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
  countdown?: boolean;
  countdownEmoji?: string | null;
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
  rotation: string[]; // Dienstplan: Personen, die sich reihum abwechseln
  points: number;
};

/** Felder, die beim Anlegen und Bearbeiten einer Aufgabe gesendet werden */
export type TaskFields = {
  title: string;
  area: string;
  personId: string | null;
  due: string | null;
  recurring: Recurrence | null;
  remindTime: string | null;
  rotation: string[];
  points?: number;
};

/** Wer ist nach dieser Person im Dienstplan dran? */
export function nextInRotation(rotation: string[], current: string | null) {
  if (rotation.length < 2) return current;
  const i = current ? rotation.indexOf(current) : -1;
  return rotation[(i + 1) % rotation.length];
}

export type Item = {
  id: string;
  name: string;
  amount: string | null;
  category: string;
  addedBy: string | null;
  done: boolean;
  createdAt: string;
};

export type Recipe = {
  id: string;
  title: string;
  description: string | null;
  servings: number;
  minutes: number | null;
  ingredients: { amount: string | null; name: string }[];
  steps: string[];
  tags: string[];
  sourceUrl: string | null;
  images: string[]; // Speicherpfade der Originalfotos oder PDF-Seiten
  favorite: boolean;
  createdBy: string | null;
};

export type RecipeFields = Omit<Recipe, "id" | "createdBy" | "favorite">;

export type Meal = {
  id: string;
  day: string; // YYYY-MM-DD
  recipeId: string | null;
  title: string;
  cook: string | null;
  note: string | null;
};

export type Board = { id: string; name: string; sort: number; count: number; preview: BoardPreview[] };
export type BoardPreview = { kind: BoardItemKind; color: string | null; text: string | null; thumb: string | null };
export type BoardItemKind = "note" | "photo" | "pdf" | "ink";
/** Strich: Farbe, Stärke, Punkte als flache Liste x, y, Druck */
export type Stroke = { c: string; s: number; p: number[] };
export type BoardItem = {
  id: string;
  boardId: string;
  kind: BoardItemKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  z: number;
  color: string | null;
  text: string | null;
  ink: Stroke[] | null;
  file: string | null;
  thumb: string | null;
  fileName: string | null;
  expires: string | null;
  createdBy: string | null;
  updatedAt: string;
  deletedAt: string | null;
};
export type BoardItemPatch = Partial<Pick<BoardItem, "x" | "y" | "w" | "h" | "rot" | "z" | "color" | "text" | "ink" | "expires">>;

export type Reward = { id: string; title: string; emoji: string | null; cost: number; createdBy: string | null };
export type RewardClaim = {
  id: string;
  rewardId: string | null;
  title: string;
  personId: string;
  cost: number;
  status: "pending" | "approved" | "declined";
  decidedBy: string | null;
  createdAt: string;
};
/** Punktestand: Woche (ab Montag), Monat, Kontostand (verdient minus eingelöst und reserviert) */
export type PointsInfo = { week: Record<string, number>; month: Record<string, number>; balance: Record<string, number>; rewards: Reward[]; claims: RewardClaim[] };

/** Ausdrückliche Angabe, ob jemand an einem Tag zum Abendessen da ist; ohne Eintrag gilt „da“ */
export type Attendance = { day: string; personId: string; present: boolean };

export type AiInfo = { enabled: boolean; usedUsd: number; limitUsd: number };

export type AppState = {
  people: Person[];
  events: CalEvent[];
  tasks: Task[];
  items: Item[];
  lists: { categories: string[]; areas: string[] };
  recipes: Recipe[];
  meals: Meal[];
  attendance: Attendance[];
  boards: Board[];
  points: PointsInfo;
  ai: AiInfo;
};

export type Mutation =
  | { op: "person.setColor"; id: string; color: string }
  | { op: "person.setNotify"; id: string; prefs: NotifyPrefs }
  | ({ op: "task.create"; id?: string } & TaskFields)
  | ({ op: "task.update"; id: string } & TaskFields)
  | { op: "task.toggle"; id: string; done: boolean; today: string }
  | { op: "task.postpone"; id: string; today: string }
  | { op: "task.assign"; id: string; personId: string | null }
  | { op: "task.delete"; id: string }
  | { op: "item.create"; id?: string; name: string; amount: string | null; category: string }
  | { op: "item.toggle"; id: string; done: boolean }
  | { op: "item.move"; id: string; category: string }
  | { op: "item.setAmount"; id: string; amount: string | null }
  | { op: "item.delete"; id: string }
  | { op: "item.clearDone" }
  | { op: "item.createMany"; items: { name: string; amount: string | null; category: string }[] }
  | ({ op: "recipe.create"; id?: string } & RecipeFields)
  | ({ op: "recipe.update"; id: string } & RecipeFields)
  | { op: "recipe.favorite"; id: string; favorite: boolean }
  | { op: "recipe.delete"; id: string }
  | { op: "meal.set"; day: string; recipeId: string | null; title: string; cook: string | null; note: string | null }
  | { op: "meal.clear"; day: string }
  | { op: "meal.attend"; day: string; personId: string; present: boolean | null }
  | { op: "reward.create"; title: string; emoji: string | null; cost: number }
  | { op: "reward.delete"; id: string }
  | { op: "reward.claim"; rewardId: string }
  | { op: "claim.decide"; id: string; approve: boolean }
  | { op: "board.create"; id?: string; name: string }
  | { op: "board.rename"; id: string; name: string }
  | { op: "board.delete"; id: string }
  | ({ op: "bitem.create"; id: string; boardId: string; kind: BoardItemKind } & BoardItemPatch & { file?: string | null; thumb?: string | null; fileName?: string | null })
  | { op: "bitem.update"; id: string; patch: BoardItemPatch }
  | { op: "bitem.delete"; id: string }
  | { op: "bitem.restore"; id: string }
  | { op: "bitem.purge"; id: string }
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

export const personColors = ["#FF6B8B", "#FF453A", "#FF9F2E", "#E5B700", "#2BC48A", "#30B0C7", "#3E8BFF", "#5E5CE6", "#8E6CFF", "#A2845E"];

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

// --- Tresor (nur nach PIN, nie Teil von AppState) ---------------------------

export type VaultGift = {
  id: string;
  forPerson: string | null;
  title: string;
  price: string | null;
  link: string | null;
  note: string | null;
  status: "idee" | "gekauft" | "verpackt";
};
export type VaultNote = { id: string; text: string | null; ink: Stroke[] | null; color: string | null; updatedAt: string };
export type VaultState = { gifts: VaultGift[]; notes: VaultNote[] };
export type VaultMutation =
  | { op: "gift.save"; id?: string; title: string; forPerson: string | null; price: string | null; link: string | null; note: string | null; status: VaultGift["status"] }
  | { op: "gift.status"; id: string; status: VaultGift["status"] }
  | { op: "gift.delete"; id: string }
  | { op: "note.save"; id?: string; text: string | null; ink: Stroke[] | null; color: string | null }
  | { op: "note.delete"; id: string };
