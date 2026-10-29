import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { sendToPeople } from "@/lib/server/push";

export async function POST(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (typeof b.personId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.personId)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const delivered = await sendToPeople([b.personId], { title: "Familienplaner", body: "Mitteilungen funktionieren auf diesem Gerät.", tag: "test" });
  return NextResponse.json({ delivered });
}
