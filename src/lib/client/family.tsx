"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import type { AppState, Item, Mutation, Person, Task, CalEvent } from "@/lib/types";
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
  syncing: boolean;
};

const FamilyCtx = createContext<Ctx | null>(null);

export function useFamily() {
  const c = useContext(FamilyCtx);
  if (!c) throw new Error("useFamily außerhalb des Providers");
  return c;
}

function range() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 1);
  const to = new Date(from);
  to.setDate(to.getDate() + 16);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Änderungen sofort lokal anzeigen, bevor der Server bestätigt */
function optimistic(s: AppState, m: Mutation, me: string | null): AppState {
  const tmp = `tmp-${Math.random().toString(36).slice(2)}`;
  switch (m.op) {
    case "person.setColor":
      return { ...s, people: s.people.map((p) => (p.id === m.id ? { ...p, color: m.color } : p)) };
    case "task.create": {
      const t: Task = { id: tmp, title: m.title, area: m.area, personId: m.personId, due: m.due, recurring: m.recurring, done: false, doneAt: null };
      return { ...s, tasks: [...s.tasks, t] };
    }
    case "task.toggle":
      return { ...s, tasks: s.tasks.map((t) => (t.id === m.id ? { ...t, done: m.done, doneAt: m.done ? new Date().toISOString() : null } : t)) };
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
      const it: Item = { id: tmp, name: m.name, amount: m.amount, category: m.category, addedBy: me, done: false, createdAt: new Date().toISOString() };
      return { ...s, items: [it, ...s.items] };
    }
    case "item.toggle":
      return { ...s, items: s.items.map((i) => (i.id === m.id ? { ...i, done: m.done } : i)) };
    case "item.move":
      return { ...s, items: s.items.map((i) => (i.id === m.id ? { ...i, category: m.category } : i)) };
    case "item.delete":
      return { ...s, items: s.items.filter((i) => i.id !== m.id) };
    case "item.clearDone":
      return { ...s, items: s.items.filter((i) => !i.done) };
    case "event.create": {
      const e: CalEvent = { id: tmp, title: m.title, place: m.place, notes: null, startsAt: m.startsAt, endsAt: m.endsAt, allDay: m.allDay, people: m.people, createdBy: me };
      return { ...s, events: [...s.events, e] };
    }
    case "event.delete":
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
  const pending = useRef(0);

  const refresh = useCallback(async () => {
    const { from, to } = range();
    try {
      const res = await fetch(`/api/state?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: "no-store" });
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
    async (m: Mutation) => {
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

  const value = useMemo(() => ({ state, error, me, setMe, person, color, run, refresh, syncing }), [state, error, me, setMe, person, color, run, refresh, syncing]);
  return <FamilyCtx.Provider value={value}>{children}</FamilyCtx.Provider>;
}
