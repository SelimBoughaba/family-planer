import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { callTool } from "./ai";
import { isoMinutes, parseIngredient } from "@/lib/recipes";
import type { RecipeFields } from "@/lib/types";
import { download, PATH_RE, typeOfPath } from "./storage";
import type { ContentBlock } from "./ai";

export class ImportError extends Error {}

/** Nur öffentliche Adressen abrufen, nichts im internen Netz */
async function assertPublicUrl(raw: string) {
  // nur für lokale Tests: interne Adressen erlauben
  const allowPrivate = process.env.IMPORT_ALLOW_PRIVATE === "1" && process.env.VERCEL !== "1";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ImportError("Das ist kein gültiger Link.");
  }
  if (!/^https?:$/.test(u.protocol)) throw new ImportError("Nur http- und https-Links sind möglich.");
  const host = u.hostname;
  if (allowPrivate) return u;
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new ImportError("Dieser Link ist nicht erlaubt.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new ImportError("Die Seite wurde nicht gefunden.");
  for (const { address } of addrs) {
    if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(address)) {
      throw new ImportError("Dieser Link ist nicht erlaubt.");
    }
  }
  return u;
}

async function fetchPage(start: URL) {
  // Weiterleitungen selbst verfolgen, damit auch deren Ziel geprüft wird
  let url = start;
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Familienplaner Rezeptimport)", accept: "text/html,application/xhtml+xml" },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (!res || res.status < 300 || res.status >= 400) break;
    const loc = res.headers.get("location");
    if (!loc) break;
    url = await assertPublicUrl(new URL(loc, url).toString());
  }
  if (!res || !res.ok) throw new ImportError("Die Seite konnte nicht geladen werden.");
  const reader = res.body?.getReader();
  if (!reader) throw new ImportError("Die Seite ist leer.");
  // höchstens 3 MB lesen
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 3_000_000) break;
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ")
    .trim();

type Json = Record<string, unknown>;

function findRecipe(node: unknown): Json | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  const o = node as Json;
  const t = o["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
  return findRecipe(o["@graph"]) ?? findRecipe(o.mainEntity) ?? null;
}

function steps(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") return v.split(/\n+|(?<=\.)\s{2,}/).map(decode).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(steps);
  const o = v as Json;
  if (o["@type"] === "HowToSection") return steps(o.itemListElement);
  if (typeof o.text === "string") return [decode(o.text)];
  if (typeof o.name === "string") return [decode(o.name)];
  return [];
}

function servingsOf(v: unknown) {
  const s = Array.isArray(v) ? v[0] : v;
  const n = parseInt(String(s ?? ""), 10);
  return n > 0 && n <= 50 ? n : 4;
}

/** Rezept aus den strukturierten Daten (schema.org) der Seite, ohne KI */
function fromJsonLd(html: string, url: string): RecipeFields | null {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const r = findRecipe(data);
    if (!r) continue;
    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : []).map((x) => parseIngredient(decode(String(x)))).filter((i) => i.name);
    if (!r.name || !ingredients.length) continue;
    return {
      title: decode(String(r.name)).slice(0, 140),
      description: r.description ? decode(String(r.description)).slice(0, 600) : null,
      servings: servingsOf(r.recipeYield),
      minutes: isoMinutes(r.totalTime) ?? isoMinutes(r.cookTime) ?? null,
      images: [],
      ingredients,
      steps: steps(r.recipeInstructions).slice(0, 60),
      tags: [],
      sourceUrl: url,
    };
  }
  return null;
}

const recipeTool = {
  name: "rezept",
  description: "Gibt das Rezept strukturiert zurück.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string", description: "Ein Satz, worum es geht" },
      servings: { type: "integer" },
      minutes: { type: "integer", description: "Gesamtzeit in Minuten" },
      ingredients: {
        type: "array",
        items: { type: "object", properties: { amount: { type: "string", description: "z. B. 200 g, 2 EL, leer wenn keine Menge" }, name: { type: "string" } }, required: ["name"] },
      },
      steps: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" }, description: "z. B. vegetarisch, schnell, Kinder" },
      found: { type: "boolean", description: "false, wenn der Text kein Rezept enthält" },
    },
    required: ["title", "servings", "ingredients", "steps", "found"],
  },
};

type AiRecipe = { title: string; description?: string; servings: number; minutes?: number; ingredients: { amount?: string; name: string }[]; steps: string[]; tags?: string[]; found: boolean };

function normalize(r: AiRecipe, url: string | null): RecipeFields {
  return {
    images: [],
    title: String(r.title ?? "Rezept").slice(0, 140),
    description: r.description ? String(r.description).slice(0, 600) : null,
    servings: Number.isInteger(r.servings) && r.servings > 0 ? r.servings : 4,
    minutes: Number.isInteger(r.minutes) && (r.minutes as number) > 0 ? (r.minutes as number) : null,
    ingredients: (r.ingredients ?? []).filter((i) => i?.name).map((i) => ({ amount: i.amount?.trim() || null, name: String(i.name).trim() })),
    steps: (r.steps ?? []).map((s) => String(s).trim()).filter(Boolean),
    tags: (r.tags ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 8),
    sourceUrl: url,
  };
}

/** Text einer Seite oder eingefügter Text: KI liest das Rezept heraus */
export async function recipeFromText(text: string, url: string | null) {
  const clipped = text.slice(0, 24000);
  const r = await callTool<AiRecipe>(
    "import",
    "Du liest Rezepte aus Texten aus. Antworte auf Deutsch. Übernimm Mengen und Zutaten genau, erfinde nichts. Fasse Schritte knapp in eigenen Worten zusammen.",
    `Lies das Rezept aus diesem Text aus:\n\n${clipped}`,
    recipeTool,
    1800,
  );
  if (!r.found || !r.ingredients?.length) throw new ImportError("In diesem Text wurde kein Rezept gefunden.");
  return normalize(r, url);
}

export async function importRecipe(rawUrl: string): Promise<{ recipe: RecipeFields; via: "structured" | "ai" }> {
  const url = await assertPublicUrl(rawUrl.trim());
  const html = await fetchPage(url);
  const structured = fromJsonLd(html, url.toString());
  if (structured) return { recipe: structured, via: "structured" };
  // Rückfall: lesbaren Text an die KI geben
  const text = decode(html.replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, " "));
  return { recipe: await recipeFromText(text, url.toString()), via: "ai" };
}

export { normalize as normalizeAiRecipe, recipeTool };
export type { AiRecipe };

/** Fotos oder PDF-Seiten eines Rezepts (Kochbuch, handgeschriebener Zettel): KI liest es aus */
export async function recipeFromFiles(paths: string[]): Promise<RecipeFields> {
  const list = [...new Set(paths)].filter((p) => PATH_RE.test(p) && p.startsWith("recipes/")).slice(0, 5);
  if (!list.length) throw new ImportError("Bitte mindestens ein Foto oder PDF auswählen.");
  const blocks: ContentBlock[] = [];
  for (const p of list) {
    const type = typeOfPath(p);
    const data = (await download(p)).toString("base64");
    if (type === "application/pdf") blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    else blocks.push({ type: "image", source: { type: "base64", media_type: type as "image/jpeg", data } });
  }
  blocks.push({
    type: "text",
    text: `Lies das Rezept aus ${list.length > 1 ? "diesen Seiten" : "dieser Vorlage"} aus. Es kann gedruckt oder handgeschrieben sein. Mehrere Seiten gehören zum selben Rezept.`,
  });
  const r = await callTool<AiRecipe>(
    "scan",
    "Du liest Rezepte aus Fotos und PDFs aus. Antworte auf Deutsch. Übernimm Mengen und Zutaten genau so, wie sie dastehen, auch bei Handschrift. Was du nicht sicher lesen kannst, lässt du weg statt zu raten. Fasse Schritte knapp in eigenen Worten zusammen.",
    blocks,
    recipeTool,
    2000,
    55000,
  );
  if (!r.found || !r.ingredients?.length) throw new ImportError("Auf den Bildern wurde kein Rezept erkannt. Ein schärferes Foto bei gutem Licht hilft meistens.");
  return { ...normalize(r, null), images: list };
}
