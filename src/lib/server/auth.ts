import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./session";

export function unauthorized(req: NextRequest) {
  if (verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
