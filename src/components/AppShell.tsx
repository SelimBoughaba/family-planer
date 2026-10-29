"use client";

import { useEffect, useMemo, useState } from "react";
import { FamilyProvider, useFamily } from "@/lib/client/family";
import { Ambient, Avatar, ContextMenu, TabBar, useNow, type Tab } from "./ui";
import { TodayView } from "./TodayView";
import { ShoppingView } from "./ShoppingView";
import { NewEntrySheet } from "./NewEntrySheet";
import { CalendarView } from "./CalendarView";
import { FoodView } from "./food/FoodView";
import { TasksView } from "./TasksView";
import type { Task } from "@/lib/types";
import { EventEditor, type EditorTarget } from "./EventEditor";
import { SubscribeSheet } from "./SubscribeSheet";
import { NotifySheet } from "./NotifySheet";
import { registerWorker, syncPushOwner } from "@/lib/client/push";
import { ColorPicker, PersonPicker } from "./Onboarding";
import { IconBell, IconCalendar, IconCart, IconChecklist, IconFork, IconPerson } from "./icons";
import { localDay } from "@/lib/types";

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
  const [notify, setNotify] = useState(false);
  const [taskEdit, setTaskEdit] = useState<Task | null>(null);
  const [quickMenu, setQuickMenu] = useState(false);
  const [shopFocus, setShopFocus] = useState(false);
  const [foodDay, setFoodDay] = useState<string | null>(null);

  const newEvent = () => {
    const start = new Date();
    start.setMinutes(Math.ceil((start.getMinutes() + 1) / 15) * 15, 0, 0);
    setEditor({ mode: "new", start });
  };
  const now = useNow();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  // Verwaltung nur auf Geräten anbieten, auf denen der Owner schon einmal entsperrt hat
  const [ownerDevice] = useState(() => {
    try {
      return localStorage.getItem("fp_owner_device") === "1";
    } catch {
      return false;
    }
  });

  // Fehler im Browser ins Protokoll der Verwaltung schreiben
  useEffect(() => {
    let sent = 0;
    const report = (message: string, detail: string) => {
      if (sent++ > 5) return;
      void fetch("/api/log-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, detail }),
      }).catch(() => {});
    };
    const onError = (e: ErrorEvent) => report(e.message, `${e.filename}:${e.lineno}`);
    const onRejection = (e: PromiseRejectionEvent) => report(String(e.reason?.message ?? e.reason), "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Service Worker aktuell halten und Gerät der gewählten Person zuordnen
  const meId = me?.id;
  useEffect(() => {
    void registerWorker().then(() => (meId ? syncPushOwner(meId) : undefined));
  }, [meId]);

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
          onQuick={() => setQuickMenu(true)}
          onProfile={() => setProfileOpen(true)}
          onOpenEvent={(occ) => setEditor({ mode: "edit", occ })}
          onOpenFood={() => setTab("essen")}
          onEditTask={setTaskEdit}
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
      {tab === "einkauf" && <ShoppingView focus={shopFocus} />}
      {tab === "essen" && <FoodView key={foodDay ?? "plan"} initialDay={foodDay} />}
      {tab === "aufgaben" && <TasksView filter={filter} setFilter={setFilter} onNew={() => setNewOpen(true)} onQuick={() => setQuickMenu(true)} onEdit={setTaskEdit} />}

      <TabBar
        tab={tab}
        onChange={(t) => {
          setShopFocus(false);
          setFoodDay(null);
          setTab(t);
        }}
        badge={{ einkauf: openItems }}
      />
      <ContextMenu
        open={quickMenu}
        onClose={() => setQuickMenu(false)}
        preview={<p className="headline">Was möchtest du anlegen?</p>}
        actions={[
          {
            label: "Termin",
            icon: <IconCalendar size={18} />,
            onSelect: () => setTimeout(newEvent, 50),
          },
          {
            label: "Aufgabe",
            icon: <IconChecklist size={18} />,
            onSelect: () => setTimeout(() => setNewOpen(true), 50),
          },
          {
            label: "Etwas einkaufen",
            icon: <IconCart size={18} />,
            onSelect: () => {
              setShopFocus(true);
              setTab("einkauf");
            },
          },
          {
            label: "Essen für heute planen",
            icon: <IconFork size={18} />,
            onSelect: () => {
              setFoodDay(localDay());
              setTab("essen");
            },
          },
        ]}
      />
      <NewEntrySheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onEvent={(d) => {
          let start = d.start;
          if (!start) {
            start = new Date();
            start.setMinutes(Math.ceil((start.getMinutes() + 1) / 15) * 15, 0, 0);
          }
          setEditor({
            mode: "new",
            start,
            title: d.title,
            allDay: d.allDay,
            people: d.people,
            duration: d.duration,
          });
        }}
      />
      <NewEntrySheet open={!!taskEdit} task={taskEdit} onClose={() => setTaskEdit(null)} />
      <EventEditor target={editor} onClose={() => setEditor(null)} />
      <SubscribeSheet open={subscribe} onClose={() => setSubscribe(false)} />
      <NotifySheet open={notify} onClose={() => setNotify(false)} />
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
          {
            label: "Mitteilungen",
            icon: <IconBell size={18} />,
            onSelect: () => setTimeout(() => setNotify(true), 50),
          },
          {
            label: "Im Apple Kalender anzeigen",
            icon: <IconCalendar size={18} />,
            onSelect: () => setTimeout(() => setSubscribe(true), 50),
          },
          {
            label: "Profil wechseln",
            icon: <IconPerson size={18} />,
            onSelect: () => setMe(null),
          },
          ...(ownerDevice
            ? [
                {
                  label: "Verwaltung",
                  // bewusst ganzes Neuladen, damit der Server die Owner-Sitzung prüft
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  onSelect: () => window.location.assign("/owner"),
                },
              ]
            : []),
          {
            label: "Auf diesem Gerät abmelden",
            destructive: true,
            onSelect: () => void logout(),
          },
        ]}
      />
    </main>
  );
}
