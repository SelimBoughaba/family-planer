import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import { BoardInputError, loadBoard } from "@/lib/server/board";

export const maxDuration = 20;

export async function GET(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await loadBoard(req.nextUrl.searchParams.get("id") ?? ""), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BoardInputError) return NextResponse.json({ error: "invalid_input", message: err.message }, { status: 400 });
    throw err;
  }
}
