import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";

/** Öffentlicher Kurzstatus ohne persönliche Daten */
export async function GET() {
  try {
    const [row] = await db()`select updated_at from app_meta where key = 'reminders_last_run'`;
    const last = row ? new Date(row.updated_at as string) : null;
    return NextResponse.json(
      { ok: true, remindersLastRun: last?.toISOString() ?? null, remindersHealthy: !!last && Date.now() - +last < 5 * 60000 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
