import "server-only";
import type { NextRequest } from "next/server";
import { db } from "./db";

const PER_DEVICE = 5; // Fehlversuche pro IP in 15 Minuten
const GLOBAL = 50; // Fehlversuche insgesamt pro Stunde

export function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unbekannt").trim();
}

/** Prüft die Sperre vor einem Anmeldeversuch */
export async function checkLock(ip: string, kind: "family" | "owner") {
  const [{ device, total }] = await db()<{ device: number; total: number }[]>`
    select
      count(*) filter (where ip = ${ip} and created_at > now() - interval '15 minutes')::int as device,
      count(*)::int as total
    from login_attempts where success = false and kind = ${kind} and created_at > now() - interval '1 hour'
  `;
  if (device >= PER_DEVICE) return { locked: "locked_device" as const, minutes: 15, device };
  if (total >= GLOBAL) return { locked: "locked_global" as const, minutes: 60, device };
  return { locked: null, minutes: 0, device };
}

export async function recordAttempt(ip: string, kind: "family" | "owner", success: boolean) {
  const sql = db();
  await sql`insert into login_attempts (ip, success, kind) values (${ip}, ${success}, ${kind})`;
  if (Math.random() < 0.05) await sql`delete from login_attempts where created_at < now() - interval '7 days'`;
}

export const remainingAfterFailure = (device: number) => Math.max(0, PER_DEVICE - device - 1);
