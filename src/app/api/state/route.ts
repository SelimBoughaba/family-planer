import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { loadState } from "@/lib/server/data";

export async function GET(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;

  const p = req.nextUrl.searchParams;
  const now = Date.now();
  const from = new Date(p.get("from") ?? now - 86400000);
  const to = new Date(p.get("to") ?? now + 14 * 86400000);
  if (isNaN(+from) || isNaN(+to) || +to - +from > 400 * 86400000) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const state = await loadState(from, to);
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
