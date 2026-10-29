"use client";

import { useEffect, useMemo, useState } from "react";
import { FamilyProvider, useFamily } from "@/lib/client/family";
import { Ambient, Avatar, Card, ContextMenu, TabBar, useNow, type Tab } from "./ui";
import { TodayView } from "./TodayView";
import { ShoppingView } from "./ShoppingView";
import { NewEntrySheet } from "./NewEntrySheet";
import { CalendarView } from "./CalendarView";
import { EventEditor, type EditorTarget } from "./EventEditor";
import { SubscribeSheet } from "./SubscribeSheet";
import { ColorPicker, PersonPicker } from "./Onboarding";
import { IconCalendar, IconPerson } from "./icons";

const upcoming: Record<"essen" | "aufgaben", { title: string; text: string }> = {
  essen: {
    title: "Essen",
    text: "Rezepte sammeln, die Woche planen und Vorschläge aus euren eigenen Rezepten oder per KI bekommen.",
  },
  aufgaben: {
    title: "Aufgaben",
    text: "Alle Aufgaben nach Bereichen und Personen, mit Dienstplan, der Hausarbeiten automatisch reihum verteilt. Heute siehst du bereits die fälligen.",
  },
};

export function AppShell() {
  return (
    <FamilyProvider>
      <Gate />
    </FamilyProvider>
  );
}

function Gate() {
  const { state, error, me } = useFamily();
  if (!state) {
    return (
      <main className="relative isolate flex min-h-dvh items-center justify-center px-6">
        <Ambient colors={["#8E6CFF", "#3E8BFF"]} />
        <p className="subhead text-center" style={{ color: error ? "var(--danger)" : "var(--label-2)" }}>
          {error ?? "Wird geladen"}
        </p>
      </main>
    );
  }
  if (!me) return <PersonPicker />;
  if (!me.color) return <ColorPicker me={me} />;
  return <Main />;
}

function Main() {
  const { state, error, me, setMe, color } = useFamily();
  const [tab, setTab] = useState<Tab>("heute");
  const [filter, setFilter] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [subscribe, setSubscribe] = useState(false);
  const now = useNow();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  const ambient = useMemo(() => {
    if (filter) return [color(filter)];
    if (tab === "einkauf") return [...new Set((state?.items ?? []).filter((i) => !i.done).map((i) => color(i.addedBy)))];
    const ids = (state?.events ?? []).filter((e) => new Date(e.endsAt) > now).flatMap((e) => e.people);
    const list = [...new Set(ids)].map((id) => color(id));
    return list.length ? list : [color(me?.id)];
  }, [filter, tab, state, now, color, me]);

  const openItems = (state?.items ?? []).filter((i) => !i.done).length;

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setMe(null);
    window.location.reload();
  };

  return (
    <main className="relative isolate min-h-dvh">
      <Ambient colors={ambient.slice(0, 3)} />

      {error && (
        <div className="fixed inset-x-0 z-30 mx-auto max-w-md px-4" style={{ top: "calc(env(safe-area-inset-top) + 6px)" }}>
          <div className="glass glass-strong footnote fade-in rounded-[14px] px-3 py-2 text-center" style={{ color: "var(--danger)" }} role="status">
            {error}
          </div>
        </div>
      )}

      {tab === "heute" && (
        <TodayView
          now={now}
          filter={filter}
          setFilter={setFilter}
          onNew={() => setNewOpen(true)}
          onProfile={() => setProfileOpen(true)}
          onOpenEvent={(occ) => setEditor({ mode: "edit", occ })}
        />
      )}
      {tab === "kalender" && (
        <CalendarView
          now={now}
          filter={filter}
          setFilter={setFilter}
          onOpen={(occ) => setEditor({ mode: "edit", occ })}
          onNew={(start, allDay) => setEditor({ mode: "new", start, allDay })}
        />
      )}
      {tab === "einkauf" && <ShoppingView />}
      {(tab === "essen" || tab === "aufgaben") && (
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
      <NewEntrySheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onEvent={(title) => {
          const s = new Date();
          s.setMinutes(Math.ceil((s.getMinutes() + 1) / 15) * 15, 0, 0);
          setEditor({ mode: "new", start: s, title });
        }}
      />
      <EventEditor target={editor} onClose={() => setEditor(null)} />
      <SubscribeSheet open={subscribe} onClose={() => setSubscribe(false)} />
      <ContextMenu
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        preview={
          me && (
            <div className="flex items-center gap-3">
              <Avatar person={me} size={44} />
              <div>
                <p className="headline">{me.name}</p>
                <p className="footnote" style={{ color: "var(--label-2)" }}>
                  Auf diesem Gerät angemeldet
                </p>
              </div>
            </div>
          )
        }
        actions={[
          { label: "Im Apple Kalender anzeigen", icon: <IconCalendar size={18} />, onSelect: () => setTimeout(() => setSubscribe(true), 50) },
          { label: "Profil wechseln", icon: <IconPerson size={18} />, onSelect: () => setMe(null) },
          { label: "Auf diesem Gerät abmelden", destructive: true, onSelect: () => void logout() },
        ]}
      />
    </main>
  );
}
