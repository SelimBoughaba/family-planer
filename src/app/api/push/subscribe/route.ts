import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const isUuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Gerät für Mitteilungen anmelden oder einer anderen Person zuordnen */
export async function POST(req: NextRequest) {
  const denied = unauthorized(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const sub = b.subscription;
  if (!isUuid(b.personId) || typeof sub?.endpoint !== "string" || !sub.endpoint.startsWith("https://") || typeof sub?.keys?.p256dh !== "string" || typeof sub?.keys?.auth !== "string") {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const sql = db();
  await sql`
    insert into push_subscriptions (person_id, endpoint, p256dh, auth, user_agent)
    values (${b.personId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${String(b.userAgent ?? "").slice(0, 200)})
    on conflict (endpoint) do update set person_id = excluded.person_id, p256dh = excluded.p256dh, auth = excluded.auth
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const denied = unauthorized(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (typeof b.endpoint !== "string") return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  await db()`delete from push_subscriptions where endpoint = ${b.endpoint}`;
  return NextResponse.json({ ok: true });
}
