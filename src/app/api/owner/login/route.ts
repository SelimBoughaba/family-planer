import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { checkOwnerPassword, createOwnerSession, OWNER_COOKIE, OWNER_MAX_AGE, ownerConfigured } from "@/lib/server/session";
import { checkLock, clientIp, recordAttempt, remainingAfterFailure } from "@/lib/server/ratelimit";

export async function POST(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  if (!ownerConfigured()) return NextResponse.json({ error: "owner_missing" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const input = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const ip = clientIp(req);
  const lock = await checkLock(ip, "owner");
  if (lock.locked) return NextResponse.json({ error: lock.locked, minutes: lock.minutes }, { status: 429 });

  const ok = input.length > 0 && checkOwnerPassword(input);
  await recordAttempt(ip, "owner", ok);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 900));
    return NextResponse.json({ error: "wrong_password", remaining: remainingAfterFailure(lock.device) }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_COOKIE, createOwnerSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: OWNER_MAX_AGE,
  });
  return res;
}
