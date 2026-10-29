import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { importRecipe, ImportError, recipeFromText } from "@/lib/server/recipe-import";
import { AiUnavailable } from "@/lib/server/ai";
import { logError } from "@/lib/server/log";

/** Liefert ein Rezept zum Prüfen zurück; gespeichert wird erst im Editor */
export async function POST(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  try {
    if (typeof b.url === "string" && b.url.trim()) return NextResponse.json(await importRecipe(b.url));
    if (typeof b.text === "string" && b.text.trim().length > 30) return NextResponse.json({ recipe: await recipeFromText(b.text, null), via: "ai" });
    return NextResponse.json({ error: "invalid_input", message: "Bitte einen Link oder Rezepttext angeben." }, { status: 400 });
  } catch (err) {
    if (err instanceof ImportError || err instanceof AiUnavailable) return NextResponse.json({ error: "import_failed", message: err.message }, { status: 422 });
    await logError("import", err);
    return NextResponse.json({ error: "server_error", message: "Der Import hat nicht geklappt." }, { status: 500 });
  }
}
