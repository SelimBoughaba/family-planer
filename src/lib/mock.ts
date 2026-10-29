// Beispieldaten für den Look-Prototyp. Namen sind Platzhalter.

export type Person = {
  id: string;
  name: string;
  initial: string;
  color: string;
};

export const people: Person[] = [
  { id: "mama", name: "Mama", initial: "M", color: "#FF6B8B" },
  { id: "papa", name: "Papa", initial: "P", color: "#3E8BFF" },
  { id: "selim", name: "Selim", initial: "S", color: "#8E6CFF" },
  { id: "lina", name: "Lina", initial: "L", color: "#FF9F2E" },
  { id: "noah", name: "Noah", initial: "N", color: "#2BC48A" },
];

export const personById = (id: string) => people.find((p) => p.id === id)!;

export type CalEvent = {
  id: string;
  title: string;
  place?: string;
  start: Date;
  end: Date;
  people: string[];
};

function todayAt(offsetMinutes: number) {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(Math.round((d.getMinutes() + offsetMinutes) / 5) * 5);
  return d;
}

export function makeEvents(): CalEvent[] {
  const list: [string, string | undefined, number, number, string[]][] = [
    ["Zahnarzt", "Praxis Dr. Huber", -150, 45, ["lina"]],
    ["Fußballtraining", "Sportplatz", 35, 90, ["noah"]],
    ["Elternabend 7b", "Schule, Raum 204", 110, 60, ["mama", "papa"]],
    ["Lerngruppe Zivilrecht", undefined, 190, 120, ["selim"]],
    ["Abendessen bei Oma", undefined, 330, 120, ["mama", "papa", "selim", "lina", "noah"]],
  ];
  return list.map(([title, place, off, dur, ppl], i) => {
    const start = todayAt(off);
    const end = new Date(start.getTime() + dur * 60000);
    return { id: `e${i}`, title, place, start, end, people: ppl };
  });
}

export type Task = {
  id: string;
  title: string;
  area: string;
  person: string;
  done: boolean;
  recurring?: string;
};

export const initialTasks: Task[] = [
  { id: "t1", title: "Müll rausbringen", area: "Haushalt", person: "noah", done: false, recurring: "Jeden Do" },
  { id: "t2", title: "Kfz-Versicherung kündigen", area: "Verträge", person: "papa", done: false },
  { id: "t3", title: "Mathe-Hausaufgaben", area: "Schule", person: "lina", done: false },
  { id: "t4", title: "Blumen gießen", area: "Haushalt", person: "mama", done: true, recurring: "Alle 3 Tage" },
];

export type Item = {
  id: string;
  name: string;
  amount?: string;
  category: string;
  by: string;
  done: boolean;
};

export const categories = [
  "Obst & Gemüse",
  "Brot & Backwaren",
  "Kühlregal",
  "Vorrat",
  "Drogerie",
];

export const initialItems: Item[] = [
  { id: "i1", name: "Äpfel", amount: "1 kg", category: "Obst & Gemüse", by: "mama", done: false },
  { id: "i2", name: "Zucchini", amount: "2", category: "Obst & Gemüse", by: "selim", done: false },
  { id: "i3", name: "Basilikum", category: "Obst & Gemüse", by: "selim", done: false },
  { id: "i4", name: "Vollkornbrot", category: "Brot & Backwaren", by: "papa", done: false },
  { id: "i5", name: "Milch", amount: "2 l", category: "Kühlregal", by: "lina", done: false },
  { id: "i6", name: "Parmesan", category: "Kühlregal", by: "selim", done: false },
  { id: "i7", name: "Joghurt", amount: "4", category: "Kühlregal", by: "noah", done: true },
  { id: "i8", name: "Spaghetti", amount: "500 g", category: "Vorrat", by: "mama", done: false },
  { id: "i9", name: "Zahnpasta", category: "Drogerie", by: "noah", done: false },
];

export const todaysMeal = {
  title: "Zucchini-Pasta mit Zitrone",
  minutes: 25,
  cook: "selim",
  missing: 2,
};

// Einfache Kategorie-Erkennung für neue Einträge
const hints: Record<string, string[]> = {
  "Obst & Gemüse": ["apfel", "äpfel", "banane", "tomate", "gurke", "salat", "zwiebel", "kartoffel", "paprika", "zitrone", "karotte", "möhre", "obst", "beeren", "kräuter"],
  "Brot & Backwaren": ["brot", "brötchen", "toast", "croissant", "brezel"],
  "Kühlregal": ["milch", "käse", "joghurt", "butter", "quark", "sahne", "eier", "wurst", "schinken"],
  "Drogerie": ["zahn", "shampoo", "seife", "duschgel", "deo", "papier", "creme", "waschmittel"],
};

export function guessCategory(name: string) {
  const n = name.toLowerCase();
  for (const [cat, words] of Object.entries(hints)) {
    if (words.some((w) => n.includes(w))) return cat;
  }
  return "Vorrat";
}
