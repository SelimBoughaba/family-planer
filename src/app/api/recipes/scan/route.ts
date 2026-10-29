import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { recipeFromFiles } from "@/lib/server/recipe-import";
import { AiUnavailable } from "@/lib/server/ai";
import { ImportError } from "@/lib/server/recipe-import";
import { StorageError } from "@/lib/server/storage";
import { logError } from "@/lib/server/log";

export const maxDuration = 60;

/** Liest ein Rezept aus hochgeladenen Fotos oder PDFs; gespeichert wird erst nach Prüfung im Editor */
export async function POST(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const paths = Array.isArray(b.paths) ? (b.paths as unknown[]).filter((p): p is string => typeof p === "string") : [];
  try {
    return NextResponse.json({ recipe: await recipeFromFiles(paths), via: "ai" });
  } catch (err) {
    if (err instanceof ImportError || err instanceof AiUnavailable || err instanceof StorageError) return NextResponse.json({ error: "scan_failed", message: err.message }, { status: 422 });
    await logError("scan", err);
    return NextResponse.json({ error: "server_error", message: "Das Rezept konnte nicht gelesen werden." }, { status: 500 });
  }
}
