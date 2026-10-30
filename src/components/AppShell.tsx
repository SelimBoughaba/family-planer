"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { trackVisualViewport, useSheetDepth } from "@/lib/client/sheets";
import { Toaster, toast } from "sonner";
import { FamilyProvider, useFamily } from "@/lib/client/family";
import { Ambient, Avatar, ContextMenu, TabBar, useNow, type Tab } from "./ui";
import { TodayView } from "./TodayView";
import { ShoppingView } from "./ShoppingView";
import { NewEntrySheet } from "./NewEntrySheet";
import { CalendarView } from "./CalendarView";
import { FoodView } from "./food/FoodView";
import { TasksView } from "./TasksView";
import { BoardScreen } from "./board/BoardScreen";
import { VaultScreen } from "./vault/VaultScreen";
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
  const [boardOpen, setBoardOpen] = useState<string | null>(null);
  const [vault, setVault] = useState(false);

  const newEvent = () => {
    const start = new Date();
    start.setMinutes(Math.ceil((start.getMinutes() + 1) / 15) * 15, 0, 0);
    setEditor({ mode: "new", start });
  };
  const now = useNow();

  // jeder Tab merkt sich, wie weit gescrollt war (wie in iOS)
  const scrollPos = useRef<Partial<Record<Tab, number>>>({});
  const tabRef = useRef(tab);
  useEffect(() => {
    const save = () => (scrollPos.current[tabRef.current] = window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, []);
  useLayoutEffect(() => {
    tabRef.current = tab;
    window.scrollTo({ top: scrollPos.current[tab] ?? 0 });
  }, [tab]);

  // Tastatur: sichtbaren Bereich verfolgen; :active auch auf dem iPhone sofort
  useEffect(() => {
    const stop = trackVisualViewport();
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => {
      stop();
      document.removeEventListener("touchstart", noop);
    };
  }, []);

  const content = useRef<HTMLElement>(null);
  usePushBack(content);

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

  // Fehler als Meldung statt Banner; verschwindet, sobald wieder alles geladen ist
  useEffect(() => {
    if (error) toast.error(error, { id: "fp-error", duration: 6000 });
    else toast.dismiss("fp-error");
  }, [error]);

  const openItems = (state?.items ?? []).filter((i) => !i.done).length;

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setMe(null);
    window.location.reload();
  };

  return (
    <>
      <main ref={content} className="relative isolate min-h-dvh" style={{ background: "var(--bg)" }}>
        <Ambient colors={ambient.slice(0, 3)} />

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
            onOpenBoard={setBoardOpen}
            onVault={() => setVault(true)}
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
      </main>
      <CompactTitle title={tabTitles[tab]} />

      <Toaster
        position="bottom-center"
        offset={{ bottom: "calc(var(--safe-b) + 96px)" }}
        mobileOffset={{ bottom: "calc(var(--safe-b) + 96px)", left: "12px", right: "12px" }}
        gap={8}
        toastOptions={{ className: "fp-toast", duration: 4000 }}
      />
      <TabBar
        tab={tab}
        onChange={(t) => {
          // nochmal auf den aktiven Tab: weich nach oben
          if (t === tab) return window.scrollTo({ top: 0, behavior: "smooth" });
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
            label: "Zettel an die Pinnwand",
            onSelect: () => {
              const first = state?.boards[0];
              if (first) setBoardOpen(first.id);
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
      <BoardScreen boardId={boardOpen} onClose={() => setBoardOpen(null)} />
      <VaultScreen open={vault} onClose={() => setVault(false)} />
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
          // Verwaltung für Selims Profil und für Geräte, auf denen der Owner schon entsperrt hat; hinein nur mit Owner-Passwort
          ...(ownerDevice || me?.name === "Selim"
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
    </>
  );
}

const tabTitles: Record<Tab, string> = { heute: "Heute", kalender: "Kalender", einkauf: "Einkauf", essen: "Essen", aufgaben: "Aufgaben" };

/** Kleine Titelzeile, die erscheint, sobald der große Titel nach oben weggescrollt ist */
function CompactTitle({ title }: { title: string }) {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [34, 64], [0, 1]);
  const y = useTransform(scrollY, [34, 64], [6, 0]);
  return (
    <motion.div className="pointer-events-none fixed inset-x-0 top-0 z-20" style={{ opacity }} aria-hidden>
      <div
        style={{
          paddingTop: "env(safe-area-inset-top)",
          background: "var(--glass-strong)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          backdropFilter: "blur(24px) saturate(180%)",
          boxShadow: "0 0.5px 0 var(--separator)",
        }}
      >
        <motion.p className="headline flex h-11 items-center justify-center" style={{ y }}>
          {title}
        </motion.p>
      </div>
    </motion.div>
  );
}

/**
 * Solange ein Blatt offen ist, rückt der Inhalt wie in iOS als Karte nach hinten:
 * etwas kleiner, oben abgerundet, dahinter Schwarz. Die Tab-Leiste rückt mit.
 */
function usePushBack(content: React.RefObject<HTMLElement | null>) {
  const depth = useSheetDepth();
  const open = depth > 0;
  useEffect(() => {
    applyPushBack(content.current, open);
  }, [open, content]);
}

function applyPushBack(el: HTMLElement | null, open: boolean) {
  const bar = document.querySelector<HTMLElement>("nav.tabbar");
  if (!el) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  const ease = "cubic-bezier(0.32, 0.72, 0, 1)";
  if (open) {
    const sy = window.scrollY;
    const scale = 0.93;
    el.style.transformOrigin = `50% ${sy}px`;
    el.style.willChange = "transform";
    root.classList.add("sheet-open");
    el.animate(
      [
        { transform: "none", clipPath: `inset(${sy}px 0px 0px 0px round 0px)` },
        { transform: `translateY(14px) scale(${scale})`, clipPath: `inset(${sy}px 0px 0px 0px round 18px)` },
      ],
      { duration: 460, easing: ease, fill: "forwards" },
    );
    if (bar) {
      const top = bar.getBoundingClientRect().top;
      bar.style.transformOrigin = `50% ${-top}px`;
      bar.animate([{ transform: "none" }, { transform: `translateY(14px) scale(${scale})` }], { duration: 460, easing: ease, fill: "forwards" });
    }
    return;
  }
  // zurück: Animation umkehren und danach alle Stile entfernen, damit fixierte Kinder wieder normal stehen
  const back = (node: HTMLElement | null) => {
    if (!node) return;
    const anims = node.getAnimations();
    if (!anims.length) return;
    const a = anims[anims.length - 1];
    a.updatePlaybackRate(1.35);
    a.reverse();
    void a.finished.then(() => {
      node.getAnimations().forEach((x) => x.cancel());
      node.style.transformOrigin = "";
      node.style.willChange = "";
    });
  };
  back(el);
  back(bar);
  root.classList.remove("sheet-open");
}
