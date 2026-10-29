import "server-only";
import { db } from "./db";
import { callTool } from "./ai";
import { normalizeAiRecipe, recipeTool, type AiRecipe } from "./recipe-import";

export type Suggestion = { title: string; why: string; minutes: number | null; recipeId: string | null };

const tool = {
  name: "vorschlaege",
  description: "Drei Essensvorschläge für die Familie.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            why: { type: "string", description: "Ein kurzer Satz, warum es passt" },
            minutes: { type: "integer" },
            recipe_id: { type: "string", description: "ID aus der Rezeptliste, wenn es ein vorhandenes Rezept ist, sonst leer" },
          },
          required: ["title", "why"],
        },
      },
    },
    required: ["suggestions"],
  },
};

/** Drei Vorschläge, bevorzugt aus den eigenen Rezepten, mit Blick auf die letzten Mahlzeiten */
export async function suggestMeals(hint: string, day: string | null): Promise<Suggestion[]> {
  const sql = db();
  const [recipes, recent, items] = await Promise.all([
    sql`select id, title, minutes, tags from recipes order by favorite desc, updated_at desc limit 80`,
    sql`select day::text as day, title from meal_plan where day between (now() - interval '14 days')::date and (now() + interval '7 days')::date order by day`,
    sql`select name from shopping_items where done = false limit 40`,
  ]);
  const list = recipes.map((r) => `- ${r.id}: ${r.title}${r.minutes ? ` (${r.minutes} Min.)` : ""}${(r.tags as string[])?.length ? ` [${(r.tags as string[]).join(", ")}]` : ""}`).join("\n");
  const user = [
    `Plane ein Abendessen${day ? ` für ${day}` : ""} für eine Familie mit fünf Personen (zwei davon 12 Jahre alt).`,
    hint ? `Wunsch: ${hint.slice(0, 300)}` : "",
    recent.length ? `Zuletzt oder schon geplant (nicht wiederholen):\n${recent.map((r) => `- ${r.day}: ${r.title}`).join("\n")}` : "",
    list ? `Eigene Rezepte der Familie (bevorzuge diese, gib dann die ID an):\n${list}` : "Die Familie hat noch keine eigenen Rezepte.",
    items.length ? `Steht schon auf der Einkaufsliste: ${items.map((i) => i.name).join(", ")}` : "",
    "Gib drei abwechslungsreiche Vorschläge. Mindestens einer soll ein eigenes Rezept sein, wenn passende vorhanden sind.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const out = await callTool<{ suggestions: { title: string; why: string; minutes?: number; recipe_id?: string }[] }>(
    "suggest",
    "Du bist ein praktischer Familienkoch in Deutschland. Antworte auf Deutsch, alltagstauglich, ohne Übertreibung.",
    user,
    tool,
    700,
  );
  const ids = new Set(recipes.map((r) => r.id as string));
  return (out.suggestions ?? []).slice(0, 3).map((s) => ({
    title: String(s.title).slice(0, 120),
    why: String(s.why ?? "").slice(0, 200),
    minutes: Number.isInteger(s.minutes) ? (s.minutes as number) : null,
    recipeId: s.recipe_id && ids.has(s.recipe_id) ? s.recipe_id : null,
  }));
}

/** Aus einer Idee ein vollständiges Rezept machen */
export async function elaborateRecipe(title: string, why: string) {
  const r = await callTool<AiRecipe>(
    "recipe",
    "Du schreibst alltagstaugliche Familienrezepte auf Deutsch mit genauen Mengen in Gramm, Millilitern, EL und TL.",
    `Schreibe ein Rezept für „${title.slice(0, 120)}“ für 5 Personen.${why ? ` Hintergrund: ${why.slice(0, 200)}` : ""} Kurze, klare Schritte.`,
    recipeTool,
    1600,
  );
  return normalizeAiRecipe({ ...r, found: true }, null);
}
