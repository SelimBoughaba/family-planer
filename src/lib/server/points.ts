import "server-only";
import { db } from "./db";
import type { Mutation, PointsInfo } from "@/lib/types";

export class PointsInputError extends Error {}

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

/** Woche beginnt montags, alles in Berliner Zeit */
export async function loadPoints(): Promise<PointsInfo> {
  const sql = db();
  const sums = await sql`
    select person_id,
      coalesce(sum(points) filter (where created_at >= date_trunc('week', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'), 0)::int as week,
      coalesce(sum(points) filter (where created_at >= date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'), 0)::int as month,
      coalesce(sum(points), 0)::int as earned
    from points_ledger group by person_id`;
  const spent = await sql`select person_id, coalesce(sum(cost), 0)::int as spent from reward_claims where status in ('pending', 'approved') group by person_id`;
  const rewards = await sql`select id, title, emoji, cost, created_by from rewards where active order by cost, title`;
  const claims = await sql`
    select id, reward_id, title, person_id, cost, status, decided_by, created_at from reward_claims
    where status = 'pending' or created_at > now() - interval '30 days' order by created_at desc limit 60`;
  const week: Record<string, number> = {};
  const month: Record<string, number> = {};
  const balance: Record<string, number> = {};
  for (const r of sums) {
    week[r.person_id as string] = Number(r.week);
    month[r.person_id as string] = Number(r.month);
    balance[r.person_id as string] = Number(r.earned);
  }
  for (const r of spent) balance[r.person_id as string] = (balance[r.person_id as string] ?? 0) - Number(r.spent);
  return {
    week,
    month,
    balance,
    rewards: rewards.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      emoji: (r.emoji as string) ?? null,
      cost: Number(r.cost),
      createdBy: (r.created_by as string) ?? null,
    })),
    claims: claims.map((c) => ({
      id: c.id as string,
      rewardId: (c.reward_id as string) ?? null,
      title: c.title as string,
      personId: c.person_id as string,
      cost: Number(c.cost),
      status: c.status as "pending" | "approved" | "declined",
      decidedBy: (c.decided_by as string) ?? null,
      createdAt: iso(c.created_at),
    })),
  };
}

/** Beim Abhaken gutschreiben, beim Wieder-Öffnen zurücknehmen. Gutgeschrieben wird, wer zuständig war, sonst wer abhakt. */
export async function bookTask(task: { id: string; title: string; person_id: string | null; points: number | null }, done: boolean, actor: string | null) {
  const sql = db();
  if (!done) {
    await sql`delete from points_ledger where task_id = ${task.id} and kind = 'task'`;
    return;
  }
  const person = task.person_id ?? actor;
  const pts = Math.max(0, Math.min(20, Number(task.points ?? 1)));
  if (!person || !pts) return;
  const [exists] = await sql`select 1 from points_ledger where task_id = ${task.id} and kind = 'task'`;
  if (!exists) await sql`insert into points_ledger (person_id, points, kind, task_id, reason) values (${person}, ${pts}, 'task', ${task.id}, ${String(task.title).slice(0, 140)})`;
}

async function isParent(id: string | null) {
  if (!id) return false;
  const [p] = await db()`select is_parent from people where id = ${id}`;
  return !!p?.is_parent;
}

/** Belohnung entfernen: Eltern, Selim als Verwalter oder wer sie angelegt hat */
async function mayRemove(id: string, actor: string | null) {
  if (!actor) return false;
  const [r] = await db()`select
      (select created_by from rewards where id = ${id}) as created_by,
      (select is_parent or name = 'Selim' from people where id = ${actor}) as admin`;
  return !!r?.admin || r?.created_by === actor;
}

export async function balanceOf(person: string) {
  const sql = db();
  const [e] = await sql`select coalesce(sum(points), 0)::int as n from points_ledger where person_id = ${person}`;
  const [s] = await sql`select coalesce(sum(cost), 0)::int as n from reward_claims where person_id = ${person} and status in ('pending', 'approved')`;
  return Number(e.n) - Number(s.n);
}

export async function mutatePoints(m: Mutation, actor: string | null): Promise<string> {
  const sql = db();
  switch (m.op) {
    case "reward.create": {
      const title = String(m.title ?? "")
        .trim()
        .slice(0, 60);
      const cost = Math.round(Number(m.cost));
      if (!title || !(cost >= 1 && cost <= 1000)) throw new PointsInputError("Bitte Namen und Punkte (1 bis 1000) angeben");
      const emoji = m.emoji ? String(m.emoji).slice(0, 8) : null;
      await sql`insert into rewards (title, emoji, cost, created_by) values (${title}, ${emoji}, ${cost}, ${actor})`;
      return "points";
    }
    case "reward.delete":
      if (!isId(m.id)) throw new PointsInputError("Unbekannte Belohnung");
      if (!(await mayRemove(m.id, actor))) throw new PointsInputError("Entfernen können Samir, Denise, Selim oder wer die Belohnung angelegt hat");
      await sql`update rewards set active = false where id = ${m.id}`;
      return "points";
    case "reward.claim": {
      if (!isId(m.rewardId) || !actor) throw new PointsInputError("Bitte zuerst ein Profil wählen");
      const [r] = await sql`select title, cost from rewards where id = ${m.rewardId} and active`;
      if (!r) throw new PointsInputError("Diese Belohnung gibt es nicht mehr");
      if ((await balanceOf(actor)) < Number(r.cost)) throw new PointsInputError("Dafür reichen die Punkte noch nicht");
      await sql`insert into reward_claims (reward_id, title, person_id, cost) values (${m.rewardId}, ${r.title}, ${actor}, ${r.cost})`;
      return "points";
    }
    case "claim.decide": {
      if (!isId(m.id)) throw new PointsInputError("Unbekannte Anfrage");
      if (!(await isParent(actor))) throw new PointsInputError("Bestätigen können nur Samir oder Denise");
      const [c] = await sql`select person_id, status from reward_claims where id = ${m.id}`;
      if (!c || c.status !== "pending") return "points";
      if (c.person_id === actor) throw new PointsInputError("Die eigene Belohnung bestätigt der andere Elternteil");
      await sql`update reward_claims set status = ${m.approve ? "approved" : "declined"}, decided_by = ${actor}, decided_at = now() where id = ${m.id}`;
      return "points";
    }
    default:
      return "none";
  }
}
