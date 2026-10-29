import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { checkPassword, createSession, passwordConfigured, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/server/session";

const PER_DEVICE = 5; // Fehlversuche pro IP in 15 Minuten
const GLOBAL = 50; // Fehlversuche insgesamt pro Stunde

function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unbekannt").trim();
}

export async function POST(req: NextRequest) {
  if (!passwordConfigured()) {
    return NextResponse.json({ error: "password_missing" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const input = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const ip = clientIp(req);
  const sql = db();

  const [{ device, total }] = await sql<{ device: number; total: number }[]>`
    select
      count(*) filter (where ip = ${ip} and created_at > now() - interval '15 minutes')::int as device,
      count(*) filter (where created_at > now() - interval '1 hour')::int as total
    from login_attempts where success = false and created_at > now() - interval '1 hour'
  `;

  if (device >= PER_DEVICE) {
    return NextResponse.json({ error: "locked_device", minutes: 15 }, { status: 429 });
  }
  if (total >= GLOBAL) {
    return NextResponse.json({ error: "locked_global", minutes: 60 }, { status: 429 });
  }

  const ok = input.length > 0 && checkPassword(input);
  await sql`insert into login_attempts (ip, success) values (${ip}, ${ok})`;
  // gelegentlich aufräumen
  if (Math.random() < 0.05) await sql`delete from login_attempts where created_at < now() - interval '2 days'`;

  if (!ok) {
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: "wrong_password", remaining: Math.max(0, PER_DEVICE - device - 1) }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
