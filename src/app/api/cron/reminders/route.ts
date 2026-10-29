import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runReminders } from "@/lib/server/reminders";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

/** Aufruf jede Minute durch den Zeitplaner in Supabase */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Testuhr nur, wenn ausdrücklich lokal freigeschaltet
  const at = process.env.ALLOW_TEST_CLOCK === "1" ? Date.parse(req.nextUrl.searchParams.get("now") ?? "") : NaN;
  const result = await runReminders(isNaN(at) ? Date.now() : at);
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
