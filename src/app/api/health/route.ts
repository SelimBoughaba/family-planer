import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";

export const maxDuration = 10;

/** Öffentlicher Kurzstatus ohne persönliche Daten */
export async function GET() {
  try {
    const [row] = await Promise.race([
      db()`select updated_at from app_meta where key = 'reminders_last_run'`,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    const last = row ? new Date(row.updated_at as string) : null;
    return NextResponse.json(
      { ok: true, remindersLastRun: last?.toISOString() ?? null, remindersHealthy: !!last && Date.now() - +last < 5 * 60000 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
