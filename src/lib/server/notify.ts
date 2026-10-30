import "server-only";
import { db } from "./db";
import { dayString, formatBerlin, wall } from "./berlin";
import { sendToPeople } from "./push";
import { nextInRotation, type Mutation } from "@/lib/types";

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

  // Belohnungen: Eltern erfahren von Wünschen, Kinder von der Entscheidung
  if (m.op === "reward.claim") {
    const [r] = await sql`select title, emoji, cost from rewards where id = ${m.rewardId}`;
    const parents = (await sql`select id from people where is_parent and id <> ${actor ?? "00000000-0000-0000-0000-000000000000"}`).map((p) => p.id as string);
    if (!r || !parents.length) return null;
    return async () => {
      await sendToPeople(parents, { title: "Belohnung einlösen?", body: `${name(actor)} möchte ${r.emoji ? `${r.emoji} ` : ""}„${r.title}“ für ${r.cost} Punkte`, url: "/" });
    };
  }
  if (m.op === "claim.decide") {
    const [c] = await sql`select person_id, title, status from reward_claims where id = ${m.id}`;
    if (!c || c.status !== "pending" || c.person_id === actor) return null;
    return async () => {
      await sendToPeople([c.person_id as string], { title: m.approve ? "Belohnung bestätigt 🎉" : "Belohnung abgelehnt", body: `${name(actor)} hat „${c.title}“ ${m.approve ? "bestätigt" : "abgelehnt, die Punkte sind wieder gutgeschrieben"}`, url: "/" });
    };
  }

  // Wer isst mit: nach 16 Uhr erfährt der Koch Änderungen für heute
  if (m.op === "meal.attend" && m.present !== null) {
    const now = Date.now();
    if (m.day !== dayString(now) || wall(now).h < 16) return null;
    const [meal] = await sql`select cook from meal_plan where day = ${m.day}`;
    const cook = (meal?.cook as string) ?? null;
    if (!cook || cook === actor || cook === m.personId) return null;
    const [before] = await sql`select present from meal_attendance where day = ${m.day} and person_id = ${m.personId}`;
    if (before && !!before.present === m.present) return null;
    const who = name(m.personId);
    return async () => {
      await sendToPeople([cook], { title: "Essen heute", body: m.present ? `${who} isst heute doch mit` : `${who} isst heute nicht mit`, url: "/", tag: `dinner-change:${m.day}:${m.personId}` });
    };
  }

  // Dienstplan: Wer eine Runde abhakt, gibt an die nächste Person weiter
  if (m.op === "task.toggle" && m.done) {
    const [t] = await sql`select title, person_id, recurring, rotation, done from tasks where id = ${m.id}`;
    if (!t || t.done || !t.recurring) return null;
    const next = nextInRotation((t.rotation as string[]) ?? [], (t.person_id as string) ?? null);
    if (!next || next === t.person_id || next === actor || !wants(next, "assigned")) return null;
    return async () => {
      await sendToPeople([next], { title: "Du bist dran", body: `${name(actor)} hat „${t.title}“ erledigt, die nächste Runde ist deine`, url: "/" });
    };
  }

  if (m.op === "task.create" || m.op === "task.assign" || m.op === "task.update") {
    let target = m.personId;
    if (m.op !== "task.assign" && (m.rotation?.length ?? 0) >= 2 && m.recurring && (!target || !m.rotation.includes(target))) target = m.rotation[0];
    if (!target || target === actor || !wants(target, "assigned")) return null;
    let title = m.op === "task.assign" ? "" : m.title;
    if (m.op === "task.assign" || m.op === "task.update") {
      const [row] = await sql`select title, person_id from tasks where id = ${m.id}`;
      if (!row || row.person_id === target) return null;
      if (m.op === "task.assign") title = row.title as string;
    }
    return async () => {
      await sendToPeople([target], { title: "Neue Aufgabe", body: `${name(actor)} hat dir „${title}“ gegeben`, url: "/" });
    };
  }

  return null;
}
