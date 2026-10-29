import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { ensureCalendarToken, InvalidInput } from "@/lib/server/data";

export async function POST(req: NextRequest) {
  const denied = unauthorized(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  try {
    const token = await ensureCalendarToken(body.personId);
    return NextResponse.json({ token });
  } catch (err) {
    if (err instanceof InvalidInput) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    throw err;
  }
}
