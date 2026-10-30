import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { OWNER_COOKIE, SESSION_COOKIE, VAULT_COOKIE, verifyOwnerSession, verifySession, verifyVaultSession } from "./session";

export async function unauthorized(req: NextRequest) {
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/** Owner-Bereich: Familienanmeldung und Owner-Sitzung nötig */
export async function notOwner(req: NextRequest) {
  const family = await unauthorized(req);
  if (family) return family;
  if (verifyOwnerSession(req.cookies.get(OWNER_COOKIE)?.value)) return null;
  return NextResponse.json({ error: "owner_required" }, { status: 403 });
}

/** Tresor: Familienanmeldung und frisch eingegebene PIN nötig */
export async function notVault(req: NextRequest) {
  const family = await unauthorized(req);
  if (family) return family;
  if (verifyVaultSession(req.cookies.get(VAULT_COOKIE)?.value)) return null;
  return NextResponse.json({ error: "locked" }, { status: 403 });
}
