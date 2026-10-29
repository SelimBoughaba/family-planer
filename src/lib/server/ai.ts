import "server-only";
import { db } from "./db";
import { logError } from "./log";
import type { AiInfo } from "@/lib/types";

/**
 * KI über die Anthropic-API mit Claude Haiku 5.5.
 * Preise laut Anthropic-Dokumentation (Stand Oktober 2026, Prompts bis 100K Tokens):
 * 0,10 USD je Million Eingabe-Tokens, 0,50 USD je Million Ausgabe-Tokens.
 */
export const AI_MODEL = process.env.AI_MODEL || "claude-haiku-5-5";
const PRICE_IN = 0.1 / 1_000_000;
const PRICE_OUT = 0.5 / 1_000_000;
export const DEFAULT_LIMIT_USD = 1;

export class AiUnavailable extends Error {}

export async function aiLimit() {
  const [row] = await db()`select value from app_meta where key = 'ai_limit'`;
  const v = Number((row?.value as { monthlyUsd?: number } | undefined)?.monthlyUsd);
  return isFinite(v) && v >= 0 ? v : DEFAULT_LIMIT_USD;
}

export async function setAiLimit(usd: number) {
  const v = Math.max(0, Math.min(20, Math.round(usd * 100) / 100));
  await db()`insert into app_meta (key, value) values ('ai_limit', ${db().json({ monthlyUsd: v })})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return v;
}

export async function monthUsage() {
  const [row] = await db()`
    select coalesce(sum(cost_usd), 0)::float as usd, count(*)::int as calls,
      coalesce(sum(input_tokens), 0)::int as input, coalesce(sum(output_tokens), 0)::int as output
    from ai_usage where created_at >= date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'`;
  return row as { usd: number; calls: number; input: number; output: number };
}

export async function aiInfo(): Promise<AiInfo> {
  const enabled = !!process.env.ANTHROPIC_API_KEY;
  if (!enabled) return { enabled: false, usedUsd: 0, limitUsd: DEFAULT_LIMIT_USD };
  const [usage, limit] = await Promise.all([monthUsage(), aiLimit()]);
  return { enabled: usage.usd < limit, usedUsd: Math.round(usage.usd * 10000) / 10000, limitUsd: limit };
}

type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

/** Inhalt einer Nachricht: Text oder Bausteine mit Bildern und PDFs */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

/**
 * Ruft Claude mit genau einem Werkzeug auf und gibt dessen Eingabe als strukturiertes Ergebnis zurück.
 * So kommt immer gültiges JSON zurück statt freiem Text.
 */
export async function callTool<T>(kind: string, system: string, user: string | ContentBlock[], tool: Tool, maxTokens = 1200, timeoutMs = 45000): Promise<T> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiUnavailable("Die KI ist noch nicht eingerichtet.");
  const [usage, limit] = await Promise.all([monthUsage(), aiLimit()]);
  if (usage.usd >= limit) throw new AiUnavailable("Das KI-Budget für diesen Monat ist aufgebraucht.");

  const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  let res: Response;
  try {
    res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: maxTokens,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    await logError("ai", err, kind);
    throw new AiUnavailable("Die KI ist gerade nicht erreichbar.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    await logError("ai", `HTTP ${res.status}`, `${kind}: ${JSON.stringify(body).slice(0, 500)}`);
    throw new AiUnavailable(res.status === 401 ? "Der KI-Schlüssel ist ungültig." : "Die KI hat gerade nicht geantwortet.");
  }
  const inTok = Number(body.usage?.input_tokens ?? 0);
  const outTok = Number(body.usage?.output_tokens ?? 0);
  await db()`insert into ai_usage (kind, input_tokens, output_tokens, cost_usd) values (${kind}, ${inTok}, ${outTok}, ${inTok * PRICE_IN + outTok * PRICE_OUT})`;
  const block = (body.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!block) throw new AiUnavailable("Die KI hat keine verwertbare Antwort geliefert.");
  return block.input as T;
}
