import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { PATH_RE, removeFiles } from "./storage";
import type { Board, BoardItem, BoardItemKind, BoardItemPatch, Mutation, Stroke } from "@/lib/types";

type Row = Record<string, unknown>;

export class BoardInputError extends Error {}

const KINDS: BoardItemKind[] = ["note", "photo", "pdf", "ink"];
const INK_LIMIT = 600_000; // Bytes JSON je Element
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const num = (v: unknown, min: number, max: number) => (typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));

export const toItem = (r: Row): BoardItem => ({
  id: r.id as string,
  boardId: r.board_id as string,
  kind: r.kind as BoardItemKind,
  x: Number(r.x),
  y: Number(r.y),
  w: Number(r.w),
  h: Number(r.h),
  rot: Number(r.rot),
  z: Number(r.z),
  color: (r.color as string) ?? null,
  text: (r.text as string) ?? null,
  ink: (r.ink as Stroke[]) ?? null,
  file: (r.file as string) ?? null,
  thumb: (r.thumb as string) ?? null,
  fileName: (r.file_name as string) ?? null,
  expires: r.expires ? String(r.expires instanceof Date ? r.expires.toISOString() : r.expires).slice(0, 10) : null,
  createdBy: (r.created_by as string) ?? null,
  updatedAt: iso(r.updated_at)!,
  deletedAt: iso(r.deleted_at),
});

/** Wände mit Anzahl und kleiner Vorschau für die Kachel in „Heute“ */
export async function loadBoards(): Promise<Board[]> {
  const sql = db();
  const boards = await sql`select id, name, sort from boards order by sort, created_at`;
  const counts = await sql`
    select board_id, count(*)::int as n from board_items
    where deleted_at is null and (expires is null or expires >= current_date) group by board_id`;
  const preview = await sql`
    select board_id, kind, color, left(text, 80) as text, coalesce(thumb, case when kind = 'photo' then file end) as thumb from (
      select *, row_number() over (partition by board_id order by updated_at desc) as rn from board_items
      where deleted_at is null and kind <> 'ink' and (expires is null or expires >= current_date)
    ) t where rn <= 4`;
  return boards.map((b) => ({
    id: b.id as string,
    name: b.name as string,
    sort: Number(b.sort),
    count: (counts.find((c) => c.board_id === b.id)?.n as number) ?? 0,
    preview: preview
      .filter((p) => p.board_id === b.id)
      .map((p) => ({ kind: p.kind as BoardItemKind, color: (p.color as string) ?? null, text: (p.text as string) ?? null, thumb: (p.thumb as string) ?? null })),
  }));
}

/** Inhalt einer Wand und ihr Papierkorb (30 Tage) */
export async function loadBoard(id: string) {
  if (!isId(id)) throw new BoardInputError("Unbekannte Pinnwand.");
  const sql = db();
  const rows = await sql`
    select * from board_items where board_id = ${id}
      and (deleted_at is null or deleted_at > now() - interval '30 days')
    order by z, created_at`;
  const all = rows.map(toItem);
  const today = new Date().toISOString().slice(0, 10);
  return {
    items: all.filter((i) => !i.deletedAt && !(i.expires && i.expires < today)),
    trash: all.filter((i) => i.deletedAt || (i.expires && i.expires < today)).sort((a, b) => (b.deletedAt ?? b.expires ?? "").localeCompare(a.deletedAt ?? a.expires ?? "")),
  };
}

function cleanInk(v: unknown): Stroke[] | null {
  if (v == null) return null;
  if (!Array.isArray(v)) throw new BoardInputError("Ungültige Zeichnung.");
  const strokes = v.slice(0, 2000).map((s) => {
    const p = Array.isArray(s?.p) ? (s.p as unknown[]).slice(0, 9000).map((n) => (typeof n === "number" && isFinite(n) ? Math.round(n * 10) / 10 : 0)) : [];
    return { c: typeof s?.c === "string" && /^#[0-9a-f]{3,8}$/i.test(s.c) ? s.c : "#1c1c1e", s: num(s?.s, 0.5, 60) ?? 3, p };
  });
  if (JSON.stringify(strokes).length > INK_LIMIT) throw new BoardInputError("Die Zeichnung ist zu groß. Bitte auf mehrere Zettel verteilen.");
  return strokes;
}

function cleanPatch(p: BoardItemPatch) {
  const out: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => v !== undefined && (out[k] = v);
  set("x", num(p.x, -2000, 12000));
  set("y", num(p.y, -2000, 12000));
  set("w", num(p.w, 20, 4000));
  set("h", num(p.h, 20, 4000));
  set("rot", num(p.rot, -45, 45));
  set("z", typeof p.z === "number" ? Math.round(num(p.z, 0, 1_000_000)!) : undefined);
  if (p.color !== undefined) out.color = p.color && /^#[0-9a-f]{3,8}$/i.test(p.color) ? p.color : null;
  if (p.text !== undefined) out.text = p.text ? String(p.text).slice(0, 2000) : null;
  if (p.ink !== undefined) out.ink = cleanInk(p.ink);
  if (p.expires !== undefined) out.expires = p.expires && /^\d{4}-\d{2}-\d{2}$/.test(p.expires) ? p.expires : null;
  return out;
}

/** Änderungen an Wänden und Elementen; gibt den Bereich für die Synchronisierung zurück */
export async function mutateBoard(m: Mutation, actor: string | null): Promise<string> {
  const sql = db();
  switch (m.op) {
    case "board.create": {
      const name = String(m.name ?? "").trim().slice(0, 40);
      if (!name) throw new BoardInputError("Bitte einen Namen angeben.");
      const id = isId(m.id) ? m.id : randomUUID();
      await sql`insert into boards (id, name, sort) values (${id}, ${name}, (select coalesce(max(sort), 0) + 1 from boards)) on conflict (id) do nothing`;
      return "boards";
    }
    case "board.rename": {
      const name = String(m.name ?? "").trim().slice(0, 40);
      if (!isId(m.id) || !name) throw new BoardInputError("Bitte einen Namen angeben.");
      await sql`update boards set name = ${name} where id = ${m.id}`;
      return "boards";
    }
    case "board.delete": {
      if (!isId(m.id)) throw new BoardInputError("Unbekannte Pinnwand.");
      const [{ n }] = await sql`select count(*)::int as n from boards`;
      if (n <= 1) throw new BoardInputError("Die letzte Pinnwand bleibt erhalten.");
      const files = await sql`select file, thumb from board_items where board_id = ${m.id}`;
      await sql`delete from boards where id = ${m.id}`;
      await removeFiles(files.flatMap((f) => [f.file as string, f.thumb as string]).filter(Boolean)).catch(() => {});
      return "boards";
    }
    case "bitem.create": {
      if (!isId(m.id) || !isId(m.boardId) || !KINDS.includes(m.kind)) throw new BoardInputError("Ungültiges Element.");
      const p = cleanPatch(m);
      const file = m.file && PATH_RE.test(m.file) && m.file.startsWith("boards/") ? m.file : null;
      const thumb = m.thumb && PATH_RE.test(m.thumb) && m.thumb.startsWith("boards/") ? m.thumb : null;
      if ((m.kind === "photo" || m.kind === "pdf") && !file) throw new BoardInputError("Die Datei fehlt.");
      const [top] = await sql`select coalesce(max(z), 0) + 1 as z from board_items where board_id = ${m.boardId}`;
      await sql`insert into board_items (id, board_id, kind, x, y, w, h, rot, z, color, text, ink, file, thumb, file_name, expires, created_by)
        values (${m.id}, ${m.boardId}, ${m.kind}, ${(p.x as number) ?? 0}, ${(p.y as number) ?? 0}, ${(p.w as number) ?? 200}, ${(p.h as number) ?? 200}, ${(p.rot as number) ?? 0},
          ${Number(top.z)}, ${(p.color as string) ?? null}, ${(p.text as string) ?? null}, ${p.ink ? sql.json(p.ink as never) : null}, ${file}, ${thumb},
          ${m.fileName ? String(m.fileName).slice(0, 120) : null}, ${(p.expires as string) ?? null}, ${actor})
        on conflict (id) do nothing`;
      return "board";
    }
    case "bitem.update": {
      if (!isId(m.id)) throw new BoardInputError("Ungültiges Element.");
      const p = cleanPatch(m.patch ?? {});
      if (p.ink !== undefined) p.ink = p.ink ? sql.json(p.ink as never) : null;
      const keys = Object.keys(p);
      if (!keys.length) return "none";
      await sql`update board_items set ${sql(p as Record<string, never>, ...(keys as never[]))}, updated_at = now() where id = ${m.id}`;
      return "board";
    }
    case "bitem.delete":
      if (!isId(m.id)) throw new BoardInputError("Ungültiges Element.");
      await sql`update board_items set deleted_at = now() where id = ${m.id}`;
      return "board";
    case "bitem.restore":
      if (!isId(m.id)) throw new BoardInputError("Ungültiges Element.");
      // abgelaufene Zettel kommen ohne Ablaufdatum zurück
      await sql`update board_items set deleted_at = null, expires = case when expires < current_date then null else expires end, updated_at = now() where id = ${m.id}`;
      return "board";
    case "bitem.purge": {
      if (!isId(m.id)) throw new BoardInputError("Ungültiges Element.");
      const [gone] = await sql`delete from board_items where id = ${m.id} returning file, thumb`;
      if (gone) await removeFiles([gone.file as string, gone.thumb as string].filter(Boolean)).catch(() => {});
      return "board";
    }
    default:
      return "none";
  }
}

/** Stündlich: endgültig löschen, was länger als 30 Tage im Papierkorb liegt */
export async function boardCleanup() {
  const sql = db();
  const gone = await sql`
    delete from board_items
    where deleted_at < now() - interval '30 days' or (deleted_at is null and expires < current_date - 30)
    returning file, thumb`;
  if (gone.length) await removeFiles(gone.flatMap((g) => [g.file as string, g.thumb as string]).filter(Boolean)).catch(() => {});
  return gone.length;
}
