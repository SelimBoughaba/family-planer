import "server-only";
import { db } from "./db";
import { categories as defaultCategories } from "@/lib/shopping";
import { areas as defaultAreas } from "@/lib/types";

export type Lists = { categories: string[]; areas: string[] };

let cache: { value: Lists; at: number } | null = null;

export async function getLists(): Promise<Lists> {
  if (cache && Date.now() - cache.at < 15000) return cache.value;
  const [row] = await db()`select value from app_meta where key = 'lists'`;
  const v = (row?.value ?? {}) as Partial<Lists>;
  const value = {
    categories: Array.isArray(v.categories) && v.categories.length ? v.categories : defaultCategories,
    areas: Array.isArray(v.areas) && v.areas.length ? v.areas : defaultAreas,
  };
  cache = { value, at: Date.now() };
  return value;
}

export async function setLists(lists: Lists) {
  const clean = (xs: unknown, max: number) => [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x).trim()).filter((x) => x && x.length <= 40))].slice(0, max);
  const value = { categories: clean(lists.categories, 30), areas: clean(lists.areas, 30) };
  if (!value.categories.length || !value.areas.length) throw new Error("Listen dürfen nicht leer sein");
  await db()`insert into app_meta (key, value) values ('lists', ${db().json(value)})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  cache = { value, at: Date.now() };
  return value;
}
