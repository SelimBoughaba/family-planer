import "server-only";
import { db } from "./db";
import { formatBerlin } from "./berlin";
import { sendToPeople } from "./push";
import type { Mutation } from "@/lib/types";

type Plan = () => Promise<void>;

/**
 * Wird vor einer Änderung aufgerufen, liest bei Bedarf den alten Stand
 * und liefert eine Funktion, die nach erfolgreicher Änderung die Mitteilungen verschickt.
 */
export async function planNotifications(m: Mutation, actor: string | null): Promise<Plan | null> {
  const sql = db();
  const people = await sql`select id, name, notify_prefs from people`;
  const name = (id: string | null) => (people.find((p) => p.id === id)?.name as string) ?? "Jemand";
  const wants = (id: string, kind: "invited" | "assigned") => {
    const p = people.find((x) => x.id === id);
    const prefs = { invited: true, assigned: true, ...((p?.notify_prefs as object) ?? {}) } as Record<string, boolean>;
    return !!p && prefs[kind];
  };

  if (m.op === "event.create" || m.op === "event.update" || m.op === "event.detach") {
    let before: string[] = [];
    if (m.op !== "event.create") {
      const [row] = await sql`select people from events where id = ${m.id}`;
      before = (row?.people as string[]) ?? [];
    }
    const added = (m.people ?? []).filter((id) => id !== actor && !before.includes(id) && wants(id, "invited"));
    if (!added.length) return null;
    const start = new Date(m.startsAt);
    const when = m.allDay
      ? formatBerlin(start, { weekday: "short", day: "numeric", month: "short" })
      : formatBerlin(start, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return async () => {
      await sendToPeople(added, { title: "Neuer Termin", body: `${name(actor)} hat dich eingetragen: ${m.title}, ${when}`, url: "/" });
    };
  }

  if (m.op === "task.create" || m.op === "task.assign") {
    const target = m.personId;
    if (!target || target === actor || !wants(target, "assigned")) return null;
    let title = m.op === "task.create" ? m.title : "";
    if (m.op === "task.assign") {
      const [row] = await sql`select title, person_id from tasks where id = ${m.id}`;
      if (!row || row.person_id === target) return null;
      title = row.title as string;
    }
    return async () => {
      await sendToPeople([target], { title: "Neue Aufgabe", body: `${name(actor)} hat dir „${title}“ gegeben`, url: "/" });
    };
  }

  return null;
}
