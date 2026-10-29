import type { NextRequest } from "next/server";
import { notOwner } from "@/lib/server/auth";
import { snapshot } from "@/lib/server/backup";

export async function GET(req: NextRequest) {
  const denied = await notOwner(req);
  if (denied) return denied;
  const data = await snapshot();
  const day = data.createdAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="familienplaner-sicherung-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
