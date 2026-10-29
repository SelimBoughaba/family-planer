import "server-only";
import { db } from "./db";
import { getLists, setLists } from "./lists";
import { bumpSessionEpoch, ownerConfigured, passwordConfigured, sessionEpoch } from "./session";
import { pushConfigured, sendToPeople } from "./push";
import { restore, saveBackup } from "./backup";
import { AI_MODEL, aiLimit, monthUsage, setAiLimit } from "./ai";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Kurzform des Geräts aus dem User-Agent, ohne Details */
function deviceLabel(ua: string | null) {
  if (!ua) return "Unbekanntes Gerät";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Browser";
}

const maskIp = (ip: string) => (ip.includes(".") ? ip.split(".").slice(0, 2).join(".") + ".x.x" : ip.split(":").slice(0, 3).join(":") + ":…");

export async function ownerStatus() {
  const sql = db();
  const [people, subs, counts, backups, errors, failed, lastOk, heartbeat] = await Promise.all([
    sql`select id, name, color, sort, calendar_token is not null as calendar_active from people order by sort, name`,
    sql`select id, person_id, user_agent, created_at, last_success from push_subscriptions order by created_at`,
    sql`select
      (select count(*) from events)::int as events,
      (select count(*) from tasks where done = false)::int as open_tasks,
      (select count(*) from tasks where done = true)::int as done_tasks,
      (select count(*) from shopping_items where done = false)::int as open_items,
      (select count(*) from shopping_items where done = true)::int as done_items,
      (select count(*) from error_log where created_at > now() - interval '24 hours')::int as errors_24h`,
    sql`select id, kind, size_bytes, created_at from backups order by created_at desc limit 40`,
    sql`select id, source, message, detail, created_at from error_log order by created_at desc limit 60`,
    sql`select ip, kind, created_at from login_attempts where success = false and created_at > now() - interval '7 days' order by created_at desc limit 30`,
    sql`select kind, max(created_at) as at from login_attempts where success = true group by kind`,
    sql`select updated_at, value from app_meta where key = 'reminders_last_run'`,
  ]);
  const last = heartbeat[0] ? new Date(heartbeat[0].updated_at as string) : null;
  return {
    system: {
      familyPassword: passwordConfigured(),
      ownerPassword: ownerConfigured(),
      push: pushConfigured(),
      scheduler: { lastRun: last?.toISOString() ?? null, healthy: !!last && Date.now() - +last < 5 * 60000 },
      sessionEpoch: await sessionEpoch(),
      lastLogin: Object.fromEntries(lastOk.map((r) => [r.kind, r.at])),
    },
    counts: counts[0],
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      sort: p.sort,
      calendarActive: p.calendar_active,
      devices: subs
        .filter((s) => s.person_id === p.id)
        .map((s) => ({ id: s.id, label: deviceLabel(s.user_agent as string | null), createdAt: s.created_at, lastSuccess: s.last_success })),
    })),
    backups,
    errors,
    failedLogins: failed.map((f) => ({ ip: maskIp(String(f.ip)), kind: f.kind, at: f.created_at })),
    lists: await getLists(),
    ai: { configured: !!process.env.ANTHROPIC_API_KEY, model: AI_MODEL, limitUsd: await aiLimit(), month: await monthUsage() },
  };
}

export type OwnerAction =
  | { op: "person.rename"; id: string; name: string }
  | { op: "person.resetColor"; id: string }
  | { op: "person.add"; name: string }
  | { op: "person.delete"; id: string }
  | { op: "person.move"; id: string; dir: -1 | 1 }
  | { op: "calendar.revoke"; personId: string }
  | { op: "device.delete"; id: string }
  | { op: "device.test"; personId: string }
  | { op: "sessions.logoutAll" }
  | { op: "lists.set"; categories: string[]; areas: string[] }
  | { op: "cleanup.doneTasks" }
  | { op: "cleanup.doneItems" }
  | { op: "cleanup.oldEvents" }
  | { op: "cleanup.errors" }
  | { op: "cleanup.logins" }
  | { op: "backup.create" }
  | { op: "backup.delete"; id: string }
  | { op: "backup.restore"; id: string }
  | { op: "ai.setLimit"; usd: number };

export class OwnerInputError extends Error {}

export async function ownerAction(a: OwnerAction): Promise<Record<string, unknown>> {
  const sql = db();
  switch (a.op) {
    case "person.rename": {
      const name = String(a.name ?? "").trim();
      if (!isId(a.id) || !name || name.length > 30) throw new OwnerInputError("Name fehlt oder ist zu lang.");
      try {
        await sql`update people set name = ${name} where id = ${a.id}`;
      } catch {
        throw new OwnerInputError("Diesen Namen gibt es schon.");
      }
      return {};
    }
    case "person.resetColor":
      if (!isId(a.id)) throw new OwnerInputError("Unbekannte Person.");
      await sql`update people set color = null where id = ${a.id}`;
      return {};
    case "person.add": {
      const name = String(a.name ?? "").trim();
      if (!name || name.length > 30) throw new OwnerInputError("Name fehlt oder ist zu lang.");
      const [{ n }] = await sql`select count(*)::int as n from people`;
      if (n >= 12) throw new OwnerInputError("Mehr als 12 Personen sind nicht vorgesehen.");
      try {
        await sql`insert into people (name, sort) values (${name}, (select coalesce(max(sort), 0) + 1 from people))`;
      } catch {
        throw new OwnerInputError("Diesen Namen gibt es schon.");
      }
      return {};
    }
    case "person.delete": {
      if (!isId(a.id)) throw new OwnerInputError("Unbekannte Person.");
      const [{ n }] = await sql`select count(*)::int as n from people`;
      if (n <= 1) throw new OwnerInputError("Die letzte Person kann nicht gelöscht werden.");
      await saveBackup("before-restore");
      await sql.begin(async (tx) => {
        await tx`update events set people = array_remove(people, ${a.id}::uuid) where ${a.id}::uuid = any(people)`;
        await tx`delete from people where id = ${a.id}`;
      });
      return {};
    }
    case "person.move": {
      if (!isId(a.id)) throw new OwnerInputError("Unbekannte Person.");
      const list = await sql`select id from people order by sort, name`;
      const ids = list.map((r) => r.id as string);
      const i = ids.indexOf(a.id);
      const j = i + (a.dir === -1 ? -1 : 1);
      if (i < 0 || j < 0 || j >= ids.length) return {};
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await sql.begin(async (tx) => {
        for (let k = 0; k < ids.length; k++) await tx`update people set sort = ${k + 1} where id = ${ids[k]}`;
      });
      return {};
    }
    case "calendar.revoke":
      if (!isId(a.personId)) throw new OwnerInputError("Unbekannte Person.");
      await sql`update people set calendar_token = null where id = ${a.personId}`;
      return {};
    case "device.delete":
      if (!isId(a.id)) throw new OwnerInputError("Unbekanntes Gerät.");
      await sql`delete from push_subscriptions where id = ${a.id}`;
      return {};
    case "device.test": {
      if (!isId(a.personId)) throw new OwnerInputError("Unbekannte Person.");
      const delivered = await sendToPeople([a.personId], { title: "Familienplaner", body: "Testnachricht aus dem Owner-Bereich.", tag: "owner-test" });
      return { delivered };
    }
    case "sessions.logoutAll":
      return { epoch: await bumpSessionEpoch() };
    case "lists.set":
      try {
        return { lists: await setLists({ categories: a.categories, areas: a.areas }) };
      } catch (err) {
        throw new OwnerInputError((err as Error).message);
      }
    case "cleanup.doneTasks": {
      const r = await sql`delete from tasks where done = true and done_at < now() - interval '30 days'`;
      return { deleted: r.count };
    }
    case "cleanup.doneItems": {
      const r = await sql`delete from shopping_items where done = true`;
      return { deleted: r.count };
    }
    case "cleanup.oldEvents": {
      const r = await sql`delete from events where recurrence is null and ends_at < now() - interval '365 days'`;
      return { deleted: r.count };
    }
    case "cleanup.errors": {
      const r = await sql`delete from error_log`;
      return { deleted: r.count };
    }
    case "cleanup.logins": {
      const r = await sql`delete from login_attempts where success = false`;
      return { deleted: r.count };
    }
    case "backup.create":
      return { backup: await saveBackup("manual") };
    case "backup.delete":
      if (!isId(a.id)) throw new OwnerInputError("Unbekannte Sicherung.");
      await sql`delete from backups where id = ${a.id}`;
      return {};
    case "backup.restore": {
      if (!isId(a.id)) throw new OwnerInputError("Unbekannte Sicherung.");
      const [row] = await sql`select data from backups where id = ${a.id}`;
      if (!row) throw new OwnerInputError("Unbekannte Sicherung.");
      try {
        return await restore(row.data);
      } catch (err) {
        throw new OwnerInputError((err as Error).message);
      }
    }
    case "ai.setLimit": {
      const v = Number(a.usd);
      if (!isFinite(v) || v < 0 || v > 20) throw new OwnerInputError("Das Limit muss zwischen 0 und 20 Dollar liegen.");
      return { limitUsd: await setAiLimit(v) };
    }
    default:
      throw new OwnerInputError("Unbekannte Aktion.");
  }
}
