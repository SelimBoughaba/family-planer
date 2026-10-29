import { NextResponse, type NextRequest } from "next/server";
import { notOwner } from "@/lib/server/auth";
import { restore } from "@/lib/server/backup";
import { broadcastChange } from "@/lib/server/sync";
import { logError } from "@/lib/server/log";

/** Wiederherstellen aus einer hochgeladenen Sicherungsdatei */
export async function POST(req: NextRequest) {
  const denied = await notOwner(req);
  if (denied) return denied;
  const text = await req.text();
  if (text.length > 15_000_000) return NextResponse.json({ error: "too_large", message: "Die Datei ist zu groß." }, { status: 413 });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Die Datei ist keine gültige Sicherung." }, { status: 400 });
  }
  try {
    const result = await restore(data);
    await broadcastChange("all");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await logError("restore", err);
    return NextResponse.json({ error: "restore_failed", message: (err as Error).message }, { status: 400 });
  }
}
