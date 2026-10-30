import { NextResponse } from "next/server";
import { VAULT_COOKIE } from "@/lib/server/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VAULT_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
