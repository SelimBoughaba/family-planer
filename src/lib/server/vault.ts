import "server-only";
import { db } from "./db";
import type { Stroke, VaultGift, VaultMutation, VaultNote, VaultState } from "@/lib/types";

export class VaultInputError extends Error {}

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const text = (v: unknown, max: number) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const STATUS = ["idee", "gekauft", "verpackt"] as const;

/** nur http(s)-Links, damit nichts anderes als Link gespeichert wird */
function link(v: unknown) {
  const s = text(v, 500);
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function ink(v: unknown): Stroke[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const strokes = v.slice(0, 400).filter((s) => s && typeof s.c === "string" && typeof s.s === "number" && Array.isArray(s.p));
  const size = JSON.stringify(strokes).length;
  if (size > 400_000) throw new VaultInputError("Die Zeichnung ist zu groß");
  return strokes.length ? strokes : null;
}

export async function loadVault(): Promise<VaultState> {
  const sql = db();
  const gifts = await sql`select * from vault_gifts order by status = 'verpackt', created_at`;
  const notes = await sql`select * from vault_notes order by updated_at desc`;
  return {
    gifts: gifts.map((g): VaultGift => ({
      id: g.id as string,
      forPerson: (g.for_person as string) ?? null,
      title: g.title as string,
      price: (g.price as string) ?? null,
      link: (g.link as string) ?? null,
      note: (g.note as string) ?? null,
      status: STATUS.includes(g.status as never) ? (g.status as VaultGift["status"]) : "idee",
    })),
    notes: notes.map((n): VaultNote => ({
      id: n.id as string,
      text: (n.text as string) ?? null,
      ink: (n.ink as Stroke[]) ?? null,
      color: (n.color as string) ?? null,
      updatedAt: iso(n.updated_at),
    })),
  };
}

export async function mutateVault(m: VaultMutation) {
  const sql = db();
  switch (m.op) {
    case "gift.save": {
      const title = text(m.title, 120);
      if (!title) throw new VaultInputError("Bitte einen Namen für die Idee eingeben");
      const status = STATUS.includes(m.status as never) ? m.status : "idee";
      const forPerson = isId(m.forPerson) ? m.forPerson : null;
      const fields = { title, price: text(m.price, 30), link: link(m.link), note: text(m.note, 500), status, forPerson };
      if (isId(m.id)) {
        await sql`update vault_gifts set title = ${fields.title}, price = ${fields.price}, link = ${fields.link}, note = ${fields.note},
          status = ${fields.status}, for_person = ${fields.forPerson}, updated_at = now() where id = ${m.id}`;
        const [exists] = await sql`select 1 from vault_gifts where id = ${m.id}`;
        if (exists) return;
      }
      await sql`insert into vault_gifts (id, title, price, link, note, status, for_person)
        values (coalesce(${isId(m.id) ? m.id : null}::uuid, gen_random_uuid()), ${fields.title}, ${fields.price}, ${fields.link}, ${fields.note}, ${fields.status}, ${fields.forPerson})`;
      return;
    }
    case "gift.status":
      if (!isId(m.id) || !STATUS.includes(m.status as never)) throw new VaultInputError("Unbekannte Idee");
      await sql`update vault_gifts set status = ${m.status}, updated_at = now() where id = ${m.id}`;
      return;
    case "gift.delete":
      if (!isId(m.id)) throw new VaultInputError("Unbekannte Idee");
      await sql`delete from vault_gifts where id = ${m.id}`;
      return;
    case "note.save": {
      const t = text(m.text, 1000);
      const strokes = ink(m.ink);
      if (!t && !strokes) throw new VaultInputError("Der Zettel ist leer");
      const color = text(m.color, 20);
      if (isId(m.id)) {
        const [row] = await sql`update vault_notes set text = ${t}, ink = ${strokes ? sql.json(strokes as never) : null}, color = ${color}, updated_at = now()
          where id = ${m.id} returning id`;
        if (row) return;
      }
      await sql`insert into vault_notes (id, text, ink, color) values (coalesce(${isId(m.id) ? m.id : null}::uuid, gen_random_uuid()), ${t}, ${strokes ? sql.json(strokes as never) : null}, ${color})`;
      return;
    }
    case "note.delete":
      if (!isId(m.id)) throw new VaultInputError("Unbekannter Zettel");
      await sql`delete from vault_notes where id = ${m.id}`;
      return;
    default:
      throw new VaultInputError("Unbekannte Aktion");
  }
}
