import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { PATH_RE, readUrl } from "@/lib/server/storage";

export const maxDuration = 15;

/** Leitet auf einen kurzlebigen Link zur Datei um; nur für angemeldete Geräte */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  const path = (await params).path.join("/");
  if (!PATH_RE.test(path)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    return NextResponse.redirect(await readUrl(path), { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
