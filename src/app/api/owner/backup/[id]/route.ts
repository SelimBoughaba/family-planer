import type { NextRequest } from "next/server";
import { notOwner } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await notOwner(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const [row] = await db()`select data, created_at from backups where id = ${id}`;
  if (!row) return new Response("Nicht gefunden", { status: 404 });
  const day = new Date(row.created_at as string).toISOString().slice(0, 10);
  return new Response(JSON.stringify(row.data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="familienplaner-sicherung-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
