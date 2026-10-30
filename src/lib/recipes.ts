// Rezepte: Zutaten zerlegen und umrechnen. Läuft im Browser und auf dem Server.

export type Ingredient = { amount: string | null; name: string };

const UNITS =
  "kg|g|mg|l|ml|cl|dl|el|tl|esslöffel|teelöffel|prise|prisen|msp\\.?|stk\\.?|stück|bund|dose|dosen|pck\\.?|packung|packungen|päckchen|becher|tasse|tassen|zehe|zehen|scheibe|scheiben|zweig|zweige|blatt|blätter|handvoll|glas|gläser|flasche|flaschen|cup|cups|oz|lb";

const FRACTIONS: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8" };

// Reihenfolge wichtig: gemischte Brüche vor einfachen Zahlen
const NUM = "(?:\\d+\\s+\\d/\\d|\\d/\\d|\\d+(?:[.,]\\d+)?(?:\\s*[-–]\\s*\\d+(?:[.,]\\d+)?)?)";

/** "200 g Mehl", "2 EL Olivenöl", "1 Prise Salz", "3 Eier", "Salz und Pfeffer" */
export function parseIngredient(raw: string): Ingredient {
  let t = raw.replace(/\s+/g, " ").trim();
  for (const [k, v] of Object.entries(FRACTIONS)) t = t.replaceAll(k, ` ${v}`).trim();
  t = t.replace(/^(\d+)\s+(\d\/\d)/, "$1 $2");
  const m = t.match(new RegExp(`^(${NUM}\\s*(?:(?:${UNITS})\\b\\.?)?)\\s*(.+)$`, "i"));
  if (m && m[2]) return { amount: m[1].trim(), name: m[2].replace(/^(?:von|vom)\s+/i, "").trim() };
  return { amount: null, name: t };
}

function toNumber(s: string) {
  s = s.trim();
  const mixed = s.match(/^(\d+)\s+(\d)\/(\d)$/);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const frac = s.match(/^(\d)\/(\d)$/);
  if (frac) return +frac[1] / +frac[2];
  return Number(s.replace(",", "."));
}

function pretty(n: number) {
  if (n >= 10) return String(Math.round(n));
  const r = Math.round(n * 4) / 4; // auf Viertel
  const whole = Math.floor(r);
  const rest = r - whole;
  const frac = rest === 0.25 ? "¼" : rest === 0.5 ? "½" : rest === 0.75 ? "¾" : "";
  if (!frac) return String(whole || Math.round(n * 10) / 10).replace(".", ",");
  return whole ? `${whole}${frac}` : frac;
}

/** Menge auf andere Portionenzahl umrechnen, z. B. "200 g" × 1,5 → "300 g" */
export function scaleAmount(amount: string | null, factor: number) {
  if (!amount || factor === 1) return amount;
  const m = amount.match(new RegExp(`^(${NUM})(.*)$`));
  if (!m) return amount;
  const range = m[1].split(/\s*[-–]\s*/);
  const nums = range.map(toNumber);
  if (nums.some((n) => !isFinite(n))) return amount;
  // Stückzahlen ohne Einheit (3 Eier) auf ganze Zahlen runden
  const countable = !m[2].trim();
  return `${nums.map((n) => (countable ? String(Math.max(1, Math.round(n * factor))) : pretty(n * factor))).join("–")}${m[2]}`;
}

/** ISO-8601-Dauer wie PT1H30M in Minuten */
export function isoMinutes(v: unknown) {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const total = +(m[1] ?? 0) * 1440 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0);
  return total || null;
}

export const recipeEmoji = (title: string, tags: string[] = []) => {
  const t = `${title} ${tags.join(" ")}`.toLowerCase();
  const map: [RegExp, string][] = [
    [/pasta|nudel|spaghetti|lasagne|penne/, "🍝"],
    [/pizza/, "🍕"],
    [/suppe|eintopf|brühe/, "🥣"],
    [/salat|bowl/, "🥗"],
    [/curry|reis|risotto/, "🍛"],
    [/burger/, "🍔"],
    [/fisch|lachs|thunfisch/, "🐟"],
    [/hähnchen|huhn|chicken|pute/, "🍗"],
    [/kuchen|torte|muffin|backen/, "🍰"],
    [/pfannkuchen|crêpe|waffel/, "🥞"],
    [/taco|burrito|wrap|tortilla/, "🌮"],
    [/ei|omelett|frühstück/, "🍳"],
    [/steak|rind|braten|gulasch/, "🥩"],
    [/gemüse|veggie|vegetar/, "🥦"],
  ];
  return map.find(([r]) => r.test(t))?.[1] ?? "🍽️";
};
