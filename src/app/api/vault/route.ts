import { NextResponse, type NextRequest } from "next/server";
import { notVault } from "@/lib/server/auth";
import { createVaultSession, VAULT_COOKIE, VAULT_MAX_AGE, vaultConfigured } from "@/lib/server/session";
import { loadVault, mutateVault, VaultInputError } from "@/lib/server/vault";
import { logError } from "@/lib/server/log";
import type { VaultMutation } from "@/lib/types";

export const maxDuration = 20;

/** jede Nutzung verlängert die offene Tresor-Sitzung um zehn Minuten */
function withFreshCookie(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(VAULT_COOKIE, createVaultSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: VAULT_MAX_AGE });
  return res;
}

export async function GET(req: NextRequest) {
  const denied = await notVault(req);
  if (denied) {
    if (denied.status === 403) return NextResponse.json({ error: "locked", configured: vaultConfigured() }, { status: 403 });
    return denied;
  }
  try {
    return withFreshCookie(NextResponse.json(await loadVault()));
  } catch (err) {
    await logError("vault", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await notVault(req);
  if (denied) return denied;
  const m = (await req.json().catch(() => null)) as VaultMutation | null;
  if (!m || typeof m.op !== "string") return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    await mutateVault(m);
    return withFreshCookie(NextResponse.json(await loadVault()));
  } catch (err) {
    if (err instanceof VaultInputError) return NextResponse.json({ error: "invalid_input", message: err.message }, { status: 400 });
    await logError("vault", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
