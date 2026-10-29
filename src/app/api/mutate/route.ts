import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { InvalidInput, mutate } from "@/lib/server/data";
import { broadcastChange } from "@/lib/server/sync";
import type { Mutation } from "@/lib/types";

export async function POST(req: NextRequest) {
  const denied = unauthorized(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as (Mutation & { by?: string }) | null;
  if (!body || typeof body.op !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const scope = await mutate(body, body.by ?? null);
    await broadcastChange(scope, body.by);
    return NextResponse.json({ ok: true, scope });
  } catch (err) {
    if (err instanceof InvalidInput) {
      return NextResponse.json({ error: "invalid_input", message: err.message }, { status: 400 });
    }
    console.error("[mutate]", body.op, err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
