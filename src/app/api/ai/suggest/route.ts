import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { suggestMeals } from "@/lib/server/suggest";
import { AiUnavailable } from "@/lib/server/ai";
import { logError } from "@/lib/server/log";

export async function POST(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  try {
    const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null;
    return NextResponse.json({ suggestions: await suggestMeals(String(b.hint ?? ""), day) });
  } catch (err) {
    if (err instanceof AiUnavailable) return NextResponse.json({ error: "ai_unavailable", message: err.message }, { status: 422 });
    await logError("suggest", err);
    return NextResponse.json({ error: "server_error", message: "Vorschläge gerade nicht möglich." }, { status: 500 });
  }
}
