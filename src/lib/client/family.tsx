"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import type { AppState, Item, Mutation, Person, Task, CalEvent, Recipe, Meal } from "@/lib/types";
import { FALLBACK_COLOR, localDay } from "@/lib/types";

const SYNC_TOPIC = "familienplaner-sync";
const ME_KEY = "fp_person";

type Ctx = {
  state: AppState | null;
  error: string | null;
  me: Person | null;
  setMe: (id: string | null) => void;
  person: (id: string | null | undefined) => Person | undefined;
  color: (id: string | null | undefined) => string;
  run: (m: Mutation) => Promise<boolean>;
  refresh: () => Promise<void>;
  /** Kalender meldet, welcher Zeitraum gebraucht wird; lädt bei Bedarf nach */
  ensureRange: (from: Date, to: Date) => void;
  syncing: boolean;
  /** zählt bei jeder Änderung von anderswo hoch; die Pinnwand lädt daraufhin nach */
  tick: number;
};

const FamilyCtx = createContext<Ctx | null>(null);

export function useFamily() {
  const c = useContext(FamilyCtx);
  if (!c) throw new Error("useFamily außerhalb des Providers");
  return c;
}

function initialWindow() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 42);
  const to = new Date(from);
  to.setDate(to.getDate() + 42 + 120);
  return { from, to };
}

/** Änderungen sofort lokal anzeigen, bevor der Server bestätigt */
function optimistic(s: AppState, m: Mutation, me: string | null): AppState {
  const tmp = `tmp-${Math.random().toString(36).slice(2)}`;
  switch (m.op) {
    case "person.setColor":
      return { ...s, people: s.people.map((p) => (p.id === m.id ? { ...p, color: m.color } : p)) };
    case "person.setNotify":
      return { ...s, people: s.people.map((p) => (p.id === m.id ? { ...p, notifyPrefs: m.prefs } : p)) };
    case "task.create": {
      const id = m.id ?? tmp;
      const personId = m.rotation.length >= 2 && (!m.personId || !m.rotation.includes(m.personId)) ? m.rotation[0] : m.personId;
      const t: Task = {
        id,
        title: m.title,
        area: m.area,
        personId,
        due: m.due,
        recurring: m.recurring,
        done: false,
        doneAt: null,
        remindTime: m.remindTime,
        rotation: m.rotation,
        points: m.points ?? (m.rotation.length >= 2 ? 2 : 1),
      };
      return { ...s, tasks: [...s.tasks, t] };
    }
    case "task.update": {
      const personId = m.rotation.length >= 2 && (!m.personId || !m.rotation.includes(m.personId)) ? m.rotation[0] : m.personId;
      return {
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === m.id
            ? { ...t, title: m.title, area: m.area, personId, due: m.due, recurring: m.recurring, remindTime: m.remindTime, rotation: m.rotation, points: m.points ?? t.points }
            : t,
        ),
      };
    }
    case "task.toggle": {
      const task = s.tasks.find((t) => t.id === m.id);
      const who = task?.personId ?? me;
      let points = s.points;
      // Punkte sofort mitzählen, der Server bestätigt beim nächsten Laden
      if (task && who && task.done !== m.done && task.points > 0) {
        const d = m.done ? task.points : -task.points;
        const add = (r: Record<string, number>) => ({ ...r, [who]: Math.max(0, (r[who] ?? 0) + d) });
        points = { ...points, week: add(points.week), month: add(points.month), balance: { ...points.balance, [who]: (points.balance[who] ?? 0) + d } };
      }
      return { ...s, points, tasks: s.tasks.map((t) => (t.id === m.id ? { ...t, done: m.done, doneAt: m.done ? new Date().toISOString() : null } : t)) };
    }
    case "task.postpone": {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return { ...s, tasks: s.tasks.map((t) => (t.id === m.id ? { ...t, due: localDay(d) } : t)) };
    }
    case "task.assign":
      return { ...s, tasks: s.tasks.map((t) => (t.id === m.id ? { ...t, personId: m.personId } : t)) };
    case "task.delete":
      return { ...s, tasks: s.tasks.filter((t) => t.id !== m.id) };
    case "item.create": {
      const it: Item = { id: m.id ?? tmp, name: m.name, amount: m.amount, category: m.category, addedBy: me, done: false, createdAt: new Date().toISOString() };
      return { ...s, items: [it, ...s.items] };
    }
    case "item.toggle":
      return { ...s, items: s.items.map((i) => (i.id === m.id ? { ...i, done: m.done } : i)) };
    case "item.setAmount":
      return { ...s, items: s.items.map((i) => (i.id === m.id ? { ...i, amount: m.amount } : i)) };
    case "item.move":
      return { ...s, items: s.items.map((i) => (i.id === m.id ? { ...i, category: m.category } : i)) };
    case "item.delete":
      return { ...s, items: s.items.filter((i) => i.id !== m.id) };
    case "item.clearDone":
      return { ...s, items: s.items.filter((i) => !i.done) };
    case "item.createMany": {
      const open = new Set(s.items.filter((i) => !i.done).map((i) => i.name.toLowerCase()));
      const add: Item[] = [];
      for (const it of m.items) {
        if (open.has(it.name.toLowerCase())) continue;
        open.add(it.name.toLowerCase());
        add.push({
          id: `tmp-${Math.random().toString(36).slice(2)}`,
          name: it.name,
          amount: it.amount,
          category: it.category,
          addedBy: me,
          done: false,
          createdAt: new Date().toISOString(),
        });
      }
      return { ...s, items: [...add, ...s.items] };
    }
    case "recipe.create": {
      const r: Recipe = {
        id: m.id ?? tmp,
        title: m.title,
        description: m.description,
        servings: m.servings,
        minutes: m.minutes,
        ingredients: m.ingredients,
        steps: m.steps,
        tags: m.tags,
        sourceUrl: m.sourceUrl,
        images: m.images ?? [],
        favorite: false,
        createdBy: me,
      };
      return { ...s, recipes: [...s.recipes, r] };
    }
    case "recipe.update":
      return {
        ...s,
        recipes: s.recipes.map((r) =>
          r.id === m.id
            ? {
                ...r,
                title: m.title,
                description: m.description,
                servings: m.servings,
                minutes: m.minutes,
                ingredients: m.ingredients,
                steps: m.steps,
                tags: m.tags,
                sourceUrl: m.sourceUrl,
                images: m.images ?? r.images,
              }
            : r,
        ),
      };
    case "recipe.favorite":
      return { ...s, recipes: s.recipes.map((r) => (r.id === m.id ? { ...r, favorite: m.favorite } : r)) };
    case "recipe.delete":
      return { ...s, recipes: s.recipes.filter((r) => r.id !== m.id), meals: s.meals.map((x) => (x.recipeId === m.id ? { ...x, recipeId: null } : x)) };
    case "meal.set": {
      const meal: Meal = { id: tmp, day: m.day, recipeId: m.recipeId, title: m.title, cook: m.cook, note: m.note };
      return { ...s, meals: [...s.meals.filter((x) => x.day !== m.day), meal].sort((a, b) => a.day.localeCompare(b.day)) };
    }
    case "meal.attend": {
      const rest = s.attendance.filter((a) => !(a.day === m.day && a.personId === m.personId));
      return { ...s, attendance: m.present === null ? rest : [...rest, { day: m.day, personId: m.personId, present: m.present }] };
    }
    case "reward.create":
      return { ...s, points: { ...s.points, rewards: [...s.points.rewards, { id: tmp, title: m.title, emoji: m.emoji ?? null, cost: m.cost }].sort((a, b) => a.cost - b.cost) } };
    case "reward.delete":
      return { ...s, points: { ...s.points, rewards: s.points.rewards.filter((r) => r.id !== m.id) } };
    case "reward.claim": {
      const r = s.points.rewards.find((x) => x.id === m.rewardId);
      if (!r || !me) return s;
      const claim = { id: tmp, rewardId: r.id, title: r.title, personId: me, cost: r.cost, status: "pending" as const, decidedBy: null, createdAt: new Date().toISOString() };
      return { ...s, points: { ...s.points, claims: [claim, ...s.points.claims], balance: { ...s.points.balance, [me]: (s.points.balance[me] ?? 0) - r.cost } } };
    }
    case "claim.decide": {
      const c = s.points.claims.find((x) => x.id === m.id);
      if (!c) return s;
      const balance = m.approve ? s.points.balance : { ...s.points.balance, [c.personId]: (s.points.balance[c.personId] ?? 0) + c.cost };
      return {
        ...s,
        points: {
          ...s.points,
          balance,
          claims: s.points.claims.map((x) => (x.id === m.id ? { ...x, status: m.approve ? ("approved" as const) : ("declined" as const), decidedBy: me } : x)),
        },
      };
    }
    case "board.create":
      return { ...s, boards: [...s.boards, { id: m.id ?? tmp, name: m.name, sort: s.boards.length + 1, count: 0, preview: [] }] };
    case "board.rename":
      return { ...s, boards: s.boards.map((b) => (b.id === m.id ? { ...b, name: m.name } : b)) };
    case "board.delete":
      return { ...s, boards: s.boards.filter((b) => b.id !== m.id) };
    case "bitem.create":
    case "bitem.update":
    case "bitem.delete":
    case "bitem.restore":
    case "bitem.purge":
      return s;
    case "meal.clear":
      return { ...s, meals: s.meals.filter((x) => x.day !== m.day) };
    case "event.create": {
      const e: CalEvent = {
        id: tmp,
        title: m.title,
        place: m.place,
        notes: null,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        allDay: m.allDay,
        people: m.people,
        createdBy: me,
        recurrence: m.recurrence,
        recurrenceUntil: m.recurrenceUntil,
        exdates: [],
        reminders: m.reminders,
      };
      return { ...s, events: [...s.events, e] };
    }
    case "event.update":
      return {
        ...s,
        events: s.events.map((e) =>
          e.id === m.id
            ? {
                ...e,
                title: m.title,
                place: m.place,
                startsAt: m.startsAt,
                endsAt: m.endsAt,
                allDay: m.allDay,
                people: m.people,
                recurrence: m.recurrence,
                recurrenceUntil: m.recurrenceUntil,
                exdates: m.recurrence ? e.exdates : [],
                reminders: m.reminders,
              }
            : e,
        ),
      };
    case "event.move":
      return {
        ...s,
        events: s.events.map((e) => {
          if (e.id !== m.id) return e;
          const delta = +new Date(m.startsAt) - +new Date(e.startsAt);
          return { ...e, startsAt: m.startsAt, endsAt: m.endsAt, exdates: e.exdates.map((x) => new Date(+new Date(x) + delta).toISOString()) };
        }),
      };
    case "event.detach": {
      const copy: CalEvent = {
        id: tmp,
        title: m.title,
        place: m.place,
        notes: null,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        allDay: m.allDay,
        people: m.people,
        createdBy: me,
        recurrence: null,
        recurrenceUntil: null,
        exdates: [],
        reminders: m.reminders,
      };
      return { ...s, events: [...s.events.map((e) => (e.id === m.id ? { ...e, exdates: [...e.exdates, m.occurrence] } : e)), copy] };
    }
    case "event.delete":
      if (m.mode === "one" && m.occurrence) return { ...s, events: s.events.map((e) => (e.id === m.id ? { ...e, exdates: [...e.exdates, m.occurrence!] } : e)) };
      if (m.mode === "following" && m.occurrence) {
        const d = new Date(m.occurrence);
        d.setDate(d.getDate() - 1);
        return { ...s, events: s.events.map((e) => (e.id === m.id ? { ...e, recurrenceUntil: localDay(d) } : e)) };
      }
      return { ...s, events: s.events.filter((e) => e.id !== m.id) };
  }
}

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ME_KEY);
    } catch {
      return null;
    }
  });
  const [syncing, setSyncing] = useState(false);
  const [tick, setTick] = useState(0);
  const pending = useRef(0);
  const win = useRef(initialWindow());

  const refresh = useCallback(async () => {
    const { from, to } = win.current;
    try {
      const res = await fetch(`/api/state?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as AppState;
      // während eigene Änderungen unterwegs sind, nicht mit älterem Stand überschreiben
      if (pending.current === 0) setState(data);
      setError(null);
    } catch {
      setError("Keine Verbindung. Änderungen werden angezeigt, sobald das Netz wieder da ist.");
    }
  }, []);

  useEffect(() => {
    // erster Abruf beim Start
    const first = setTimeout(refresh, 0);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    const poll = setInterval(() => document.visibilityState === "visible" && refresh(), 30000);

    // Live-Signal: andere Geräte melden Änderungen, wir laden nach
    let cleanup = () => {};
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      let t: ReturnType<typeof setTimeout> | null = null;
      const ch = sb
        .channel(SYNC_TOPIC)
        .on("broadcast", { event: "changed" }, () => {
          setTick((n) => n + 1);
          if (t) clearTimeout(t);
          t = setTimeout(refresh, 150);
        })
        .subscribe();
      cleanup = () => {
        void sb.removeChannel(ch);
      };
    }
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      clearInterval(poll);
      cleanup();
    };
  }, [refresh]);

  const ensureRange = useCallback(
    (from: Date, to: Date) => {
      const w = win.current;
      if (from >= w.from && to <= w.to) return;
      const nf = new Date(Math.min(+w.from, +from - 30 * 86400000));
      const nt = new Date(Math.max(+w.to, +to + 60 * 86400000));
      // Server erlaubt höchstens rund 13 Monate am Stück
      const span = 395 * 86400000;
      win.current = +nt - +nf > span ? (from < w.from ? { from: nf, to: new Date(+nf + span) } : { from: new Date(+nt - span), to: nt }) : { from: nf, to: nt };
      void refresh();
    },
    [refresh],
  );

  const people = state?.people;
  const person = useCallback((id: string | null | undefined) => people?.find((p) => p.id === id), [people]);
  const color = useCallback((id: string | null | undefined) => person(id)?.color ?? FALLBACK_COLOR, [person]);
  const me = (meId && person(meId)) || null;

  const setMe = useCallback((id: string | null) => {
    setMeId(id);
    try {
      if (id) localStorage.setItem(ME_KEY, id);
      else localStorage.removeItem(ME_KEY);
    } catch {}
  }, []);

  const run = useCallback(
    async (input: Mutation) => {
      // neue Aufgaben und Artikel bekommen ihre ID schon hier, so bleibt die Zeile beim Nachladen dieselbe
      const m = (input.op === "task.create" || input.op === "item.create") && !input.id && typeof crypto?.randomUUID === "function" ? { ...input, id: crypto.randomUUID() } : input;
      setState((s) => (s ? optimistic(s, m, meId) : s));
      pending.current++;
      setSyncing(true);
      try {
        const res = await fetch("/api/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...m, by: meId }),
        });
        if (res.status === 401) {
          window.location.reload();
          return false;
        }
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          setError(b.message ? `Nicht gespeichert: ${b.message}.` : "Nicht gespeichert. Bitte noch einmal versuchen.");
          return false;
        }
        return true;
      } catch {
        setError("Keine Verbindung, die Änderung wurde nicht gespeichert.");
        return false;
      } finally {
        pending.current--;
        if (pending.current === 0) {
          setSyncing(false);
          await refresh();
        }
      }
    },
    [meId, refresh],
  );

  const value = useMemo(
    () => ({ state, error, me, setMe, person, color, run, refresh, ensureRange, syncing, tick }),
    [state, error, me, setMe, person, color, run, refresh, ensureRange, syncing, tick],
  );
  return <FamilyCtx.Provider value={value}>{children}</FamilyCtx.Provider>;
}
