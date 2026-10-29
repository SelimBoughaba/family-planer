import { NextResponse, type NextRequest } from "next/server";
import { notOwner } from "@/lib/server/auth";
import { ownerStatus } from "@/lib/server/owner";

export async function GET(req: NextRequest) {
  const denied = await notOwner(req);
  if (denied) return denied;
  return NextResponse.json(await ownerStatus(), { headers: { "Cache-Control": "no-store" } });
}
