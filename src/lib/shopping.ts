export const categories = [
  "Obst & Gemüse",
  "Brot & Backwaren",
  "Kühlregal",
  "Fleisch & Fisch",
  "Tiefkühl",
  "Vorrat",
  "Getränke",
  "Drogerie",
  "Haushalt",
];

const hints: Record<string, string[]> = {
  "Obst & Gemüse": ["apfel", "äpfel", "banane", "birne", "traube", "orange", "mandarine", "tomate", "gurke", "salat", "zwiebel", "knoblauch", "kartoffel", "paprika", "zitrone", "limette", "karotte", "möhre", "zucchini", "aubergine", "brokkoli", "spinat", "pilz", "champignon", "avocado", "beeren", "erdbeer", "kräuter", "basilikum", "petersilie", "ingwer", "lauch", "obst", "gemüse"],
  "Brot & Backwaren": ["brot", "brötchen", "toast", "croissant", "brezel", "baguette", "wrap", "tortilla"],
  "Kühlregal": ["milch", "käse", "joghurt", "butter", "quark", "sahne", "eier", "ei ", "frischkäse", "mozzarella", "feta", "parmesan", "pecorino", "schmand", "skyr", "tofu", "aufschnitt"],
  "Fleisch & Fisch": ["hack", "hähnchen", "huhn", "pute", "rind", "steak", "lachs", "fisch", "thunfisch", "garnele", "wurst", "schinken", "salami", "lamm"],
  "Tiefkühl": ["tk ", "tiefkühl", "eis", "pizza", "pommes", "erbsen"],
  "Vorrat": ["nudeln", "spaghetti", "pasta", "reis", "mehl", "zucker", "salz", "öl", "essig", "tomatenmark", "dose", "linsen", "kichererbsen", "müsli", "haferflocken", "honig", "marmelade", "kaffee", "tee", "gewürz", "pfeffer", "brühe", "soße", "sauce"],
  "Getränke": ["wasser", "saft", "cola", "limo", "bier", "wein", "sprudel", "schorle"],
  "Drogerie": ["zahn", "shampoo", "seife", "duschgel", "deo", "creme", "rasier", "binden", "tampon", "pflaster", "taschentuch"],
  "Haushalt": ["klopapier", "toilettenpapier", "küchenrolle", "spülmittel", "waschmittel", "müllbeutel", "schwamm", "alufolie", "backpapier", "batterie", "reiniger", "spülmaschin", "tabs"],
};

export function guessCategory(name: string) {
  const n = ` ${name.toLowerCase()} `;
  for (const [cat, words] of Object.entries(hints)) {
    if (words.some((w) => n.includes(w))) return cat;
  }
  return "Vorrat";
}

/** "2 l Milch", "500g Hack", "Milch 2 l" */
export function parseItem(raw: string): { name: string; amount: string | null } {
  const t = raw.trim().replace(/\s+/g, " ");
  const unit = "(?:kg|g|l|ml|x|stk\\.?|stück|packungen?|pck\\.?|bund|dosen?|flaschen?|becher)";
  const front = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?\\s?${unit}?)\\s+(.+)$`, "i"));
  if (front) return { amount: front[1], name: front[2] };
  const back = t.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?\\s?${unit}?)$`, "i"));
  if (back) return { amount: back[2], name: back[1] };
  return { name: t, amount: null };
}
