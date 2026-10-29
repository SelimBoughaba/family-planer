"use client";

import { useEffect, useMemo, useState } from "react";
import { initialItems, initialTasks, makeEvents, personById, type CalEvent, type Item, type Task } from "@/lib/mock";
import { Ambient, Card, TabBar, useNow, type Tab } from "./ui";
import { TodayView } from "./TodayView";
import { ShoppingView } from "./ShoppingView";

const ME = "selim";

const upcoming: Record<Exclude<Tab, "heute" | "einkauf">, { title: string; text: string }> = {
  kalender: {
    title: "Kalender",
    text: "Tag, Woche, Monat und Jahr. Termine per Ziehen verschieben, Dauer mit dem Drehrad einstellen, Abo-Link für den Apple Kalender.",
  },
  essen: {
    title: "Essen",
    text: "Rezepte sammeln, die Woche planen und Vorschläge aus euren eigenen Rezepten oder per KI bekommen.",
  },
  aufgaben: {
    title: "Aufgaben",
    text: "Nach Bereichen und Personen, wiederkehrende Aufgaben und ein Dienstplan, der Hausarbeiten automatisch reihum verteilt.",
  },
};

export function AppShell() {
  const [tab, setTab] = useState<Tab>("heute");
  const [events] = useState<CalEvent[]>(makeEvents);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [filter, setFilter] = useState<string | null>(null);
  const [missingAdded, setMissingAdded] = useState(false);
  const now = useNow();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  const ambient = useMemo(() => {
    if (filter) return [personById(filter).color];
    if (tab === "einkauf") return [...new Set(items.filter((i) => !i.done).map((i) => personById(i.by).color))];
    const ids = events.filter((e) => e.end > now).flatMap((e) => e.people);
    return [...new Set(ids)].map((id) => personById(id).color);
  }, [filter, tab, items, events, now]);

  const openItems = items.filter((i) => !i.done).length;

  const addMissing = () => {
    if (missingAdded) return;
    setItems((is) => [
      { id: "m1", name: "Bio-Zitronen", amount: "2", category: "Obst & Gemüse", by: ME, done: false },
      { id: "m2", name: "Pecorino", category: "Kühlregal", by: ME, done: false },
      ...is,
    ]);
    setMissingAdded(true);
  };

  return (
    <main className="relative isolate min-h-dvh">
      <Ambient colors={ambient.slice(0, 3)} />

      {tab === "heute" && (
        <TodayView
          now={now}
          events={events}
          tasks={tasks}
          setTasks={setTasks}
          filter={filter}
          setFilter={setFilter}
          onAddMissing={addMissing}
          missingAdded={missingAdded}
        />
      )}
      {tab === "einkauf" && <ShoppingView items={items} setItems={setItems} me={ME} />}
      {(tab === "kalender" || tab === "essen" || tab === "aufgaben") && (
        <div className="mx-auto max-w-md px-4 safe-top safe-bottom">
          <h1 className="large-title mb-4">{upcoming[tab].title}</h1>
          <Card className="p-5">
            <p className="headline">Kommt in der nächsten Etappe</p>
            <p className="subhead mt-1.5" style={{ color: "var(--label-2)" }}>
              {upcoming[tab].text}
            </p>
          </Card>
        </div>
      )}

      <TabBar tab={tab} onChange={setTab} badge={{ einkauf: openItems }} />
    </main>
  );
}
