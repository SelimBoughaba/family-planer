import type { NextRequest } from "next/server";
import { feedForToken } from "@/lib/server/data";
import { buildCalendar } from "@/lib/server/ics";

/**
 * Kalender-Abo für den Apple Kalender. Zugriff über den persönlichen Schlüssel im Dateinamen:
 *   /kalender/<schlüssel>.ics        alle Familientermine
 *   /kalender/<schlüssel>-meine.ics  nur Termine dieser Person
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = file.match(/^([A-Za-z0-9_-]+?)(-meine)?\.ics$/);
  const feed = m ? await feedForToken(m[1]) : null;
  if (!feed) return new Response("Nicht gefunden", { status: 404 });

  const mine = !!m![2];
  const events = mine ? feed.events.filter((e) => e.people.includes(feed.owner.id)) : feed.events;
  const body = buildCalendar({
    name: mine ? `Familienplaner (${feed.owner.name})` : "Familienplaner",
    color: mine ? feed.owner.color : "#8E6CFF",
    events,
    people: feed.people,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="familienplaner${mine ? "-meine" : ""}.ics"`,
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
