import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { checkVaultPin, createVaultSession, VAULT_COOKIE, VAULT_MAX_AGE, vaultConfigured } from "@/lib/server/session";
import { checkLock, clientIp, recordAttempt, remainingAfterFailure } from "@/lib/server/ratelimit";

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  if (!vaultConfigured()) return NextResponse.json({ error: "pin_missing" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const pin = typeof body.pin === "string" ? body.pin.slice(0, 12) : "";
  const ip = clientIp(req);
  const lock = await checkLock(ip, "vault");
  if (lock.locked) return NextResponse.json({ error: lock.locked, minutes: lock.minutes }, { status: 429 });

  const ok = checkVaultPin(pin);
  await recordAttempt(ip, "vault", ok);
  if (!ok) {
    // gleichmäßig verzögern, damit Durchprobieren keinen Spaß macht
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: "wrong_pin", remaining: remainingAfterFailure(lock.device) }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VAULT_COOKIE, createVaultSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: VAULT_MAX_AGE });
  return res;
}
