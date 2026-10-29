import { NextResponse, type NextRequest } from "next/server";
import { checkPassword, createSession, passwordConfigured, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/server/session";
import { checkLock, clientIp, recordAttempt, remainingAfterFailure } from "@/lib/server/ratelimit";

export const maxDuration = 20;

export async function POST(req: NextRequest) {
  if (!passwordConfigured()) {
    return NextResponse.json({ error: "password_missing" }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const input = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const ip = clientIp(req);

  const lock = await checkLock(ip, "family");
  if (lock.locked) return NextResponse.json({ error: lock.locked, minutes: lock.minutes }, { status: 429 });

  const ok = input.length > 0 && checkPassword(input);
  await recordAttempt(ip, "family", ok);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: "wrong_password", remaining: remainingAfterFailure(lock.device) }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
