import { NextResponse, type NextRequest } from "next/server";
import { notOwner } from "@/lib/server/auth";
import { ownerAction, OwnerInputError, type OwnerAction } from "@/lib/server/owner";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/server/session";
import { broadcastChange } from "@/lib/server/sync";
import { logError } from "@/lib/server/log";

export async function POST(req: NextRequest) {
  const denied = await notOwner(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as OwnerAction | null;
  if (!body || typeof body.op !== "string") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    const result = await ownerAction(body);
    await broadcastChange("all");
    const res = NextResponse.json({ ok: true, ...result });
    // wer alle abmeldet, bleibt selbst angemeldet
    if (body.op === "sessions.logoutAll") {
      res.cookies.set(SESSION_COOKIE, await createSession(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE,
      });
    }
    return res;
  } catch (err) {
    if (err instanceof OwnerInputError) return NextResponse.json({ error: "invalid_input", message: err.message }, { status: 400 });
    await logError("owner", err, body.op);
    return NextResponse.json({ error: "server_error", message: "Das hat nicht geklappt. Details stehen im Protokoll." }, { status: 500 });
  }
}
