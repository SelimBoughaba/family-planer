import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";

/** Fehler aus dem Browser ins Protokoll schreiben */
export async function POST(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  await logError("browser", String(b.message ?? "Unbekannter Fehler").slice(0, 300), String(b.detail ?? "").slice(0, 1500));
  return NextResponse.json({ ok: true });
}
