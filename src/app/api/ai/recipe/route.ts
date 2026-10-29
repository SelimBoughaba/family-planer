import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { elaborateRecipe } from "@/lib/server/suggest";
import { AiUnavailable } from "@/lib/server/ai";
import { logError } from "@/lib/server/log";

export async function POST(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (typeof b.title !== "string" || !b.title.trim()) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    return NextResponse.json({ recipe: await elaborateRecipe(b.title, String(b.why ?? "")) });
  } catch (err) {
    if (err instanceof AiUnavailable) return NextResponse.json({ error: "ai_unavailable", message: err.message }, { status: 422 });
    await logError("ai-recipe", err);
    return NextResponse.json({ error: "server_error", message: "Rezept gerade nicht möglich." }, { status: 500 });
  }
}
