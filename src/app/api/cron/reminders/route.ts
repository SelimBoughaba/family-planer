import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runReminders } from "@/lib/server/reminders";
import { maybeAutoBackup } from "@/lib/server/backup";
import { logError } from "@/lib/server/log";
import { healStuckQueries } from "@/lib/server/heal";
import { dinnerHeadsUp } from "@/lib/server/dinner";
import { boardCleanup } from "@/lib/server/board";
import { weeklyPreview } from "@/lib/server/weekly";

export const maxDuration = 55;

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
  try {
    const now = isNaN(at) ? Date.now() : at;
    const result = await runReminders(now);
    const dinner = await dinnerHeadsUp(now).catch(async (err) => {
      await logError("dinner", err);
      return 0;
    });
    const weekly = await weeklyPreview(now).catch(async (err) => (await logError("weekly", err), 0));
    const backup = await maybeAutoBackup().catch(async (err) => {
      await logError("backup", err);
      return null;
    });
    // alle zehn Minuten verwaiste Datenbank-Befehle abräumen
    const healed = new Date().getUTCMinutes() % 10 === 0 ? await healStuckQueries().catch(() => 0) : 0;
    // einmal pro Stunde den Papierkorb der Pinnwand leeren
    const purged = new Date().getUTCMinutes() === 37 ? await boardCleanup().catch(async (err) => (await logError("board", err), 0)) : 0;
    return NextResponse.json({ ok: true, ...result, dinner, weekly, backup, healed, purged });
  } catch (err) {
    await logError("reminders", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
