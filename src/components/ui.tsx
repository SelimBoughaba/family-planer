"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { animate, AnimatePresence, motion, useDragControls, useIsPresent, useMotionValue, useReducedMotion } from "motion/react";
import { pushSheet } from "@/lib/client/sheets";
import { haptic } from "@/lib/client/haptics";
import type { Person } from "@/lib/types";
import { FALLBACK_COLOR } from "@/lib/types";
import { useFamily } from "@/lib/client/family";
import { IconCalendar, IconCart, IconChecklist, IconFork, IconToday } from "./icons";

export function Avatar({ person, size = 28, ring }: { person: Person | undefined; size?: number; ring?: boolean }) {
  if (!person) return null;
  const c = person.color ?? FALLBACK_COLOR;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(160deg, ${c}, color-mix(in oklab, ${c} 70%, black))`,
        boxShadow: ring ? "0 0 0 2px var(--bg)" : "inset 0 1px 0 rgba(255,255,255,.35)",
      }}
      aria-label={person.name}
      title={person.name}
    >
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ ids, size = 22 }: { ids: string[]; size?: number }) {
  const { person } = useFamily();
  return (
    <span className="flex -space-x-1.5">
      {ids.map((id) => (
        <Avatar key={id} person={person(id)} size={size} ring />
      ))}
    </span>
  );
}

/**
 * Hintergrundlicht: Die Farben der Personen, die gerade relevant sind,
 * fließen langsam hinter den Glasflächen.
 */
export function Ambient({ colors }: { colors: string[] }) {
  const c = colors.length ? colors : ["#8E6CFF", "#3E8BFF"];
  const spots = [
    { top: "-12%", left: "-18%", size: "70vmax", delay: "0s" },
    { top: "28%", left: "48%", size: "60vmax", delay: "-7s" },
    { top: "70%", left: "-10%", size: "55vmax", delay: "-14s" },
  ];
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {spots.map((s, i) => (
        <div
          key={i}
          className="blob"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            maxWidth: 900,
            maxHeight: 900,
            backgroundColor: c[i % c.length],
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}

export type Tab = "heute" | "kalender" | "einkauf" | "essen" | "aufgaben";

const tabs: { id: Tab; label: string; Icon: typeof IconToday }[] = [
  { id: "heute", label: "Heute", Icon: IconToday },
  { id: "kalender", label: "Kalender", Icon: IconCalendar },
  { id: "einkauf", label: "Einkauf", Icon: IconCart },
  { id: "essen", label: "Essen", Icon: IconFork },
  { id: "aufgaben", label: "Aufgaben", Icon: IconChecklist },
];

export function TabBar({ tab, onChange, badge }: { tab: Tab; onChange: (t: Tab) => void; badge?: Partial<Record<Tab, number>> }) {
  const index = tabs.findIndex((t) => t.id === tab);
  return (
    <nav className="tabbar fixed inset-x-0 z-30 px-3" aria-label="Bereiche">
      <div className="glass glass-strong relative mx-auto flex w-full max-w-md rounded-[30px] p-1.5">
        {/* Linse unter dem aktiven Tab, gleitet per transform */}
        <span
          className="absolute top-1.5 bottom-1.5 left-1.5 rounded-[24px]"
          style={{
            width: `calc((100% - 12px) / ${tabs.length})`,
            transform: `translateX(${index * 100}%)`,
            background: "color-mix(in oklab, var(--tint) 11%, transparent)",
            transition: "transform 260ms var(--ease-out)",
          }}
          aria-hidden
        />
        {tabs.map(({ id, label, Icon }) => {
          const active = id === tab;
          const count = badge?.[id];
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="press relative flex flex-1 flex-col items-center gap-0.5 rounded-[24px] py-1.5"
              style={{ color: active ? "var(--tint)" : "var(--label-2)", transition: "color 160ms ease" }}
              aria-current={active ? "page" : undefined}
            >
              <span className="relative">
                <Icon size={23} strokeWidth={active ? 2.1 : 1.7} />
                {!!count && (
                  <span
                    className="absolute -top-1.5 -right-2.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white tabular"
                    style={{ background: "var(--danger)", boxShadow: "0 0 0 2px var(--glass-strong)" }}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function PersonFilter({
  selected,
  onToggle,
  compact,
  onDrop,
}: {
  selected: string | null;
  onToggle: (id: string) => void;
  compact?: boolean;
  /** Profilbild lange drücken und auf ein Element mit data-task-id ziehen */
  onDrop?: (personId: string, taskId: string) => void;
}) {
  const { state } = useFamily();
  const [drag, setDrag] = useState<{ person: Person; x: number; y: number } | null>(null);
  const press = useRef<{ id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const hover = useRef<HTMLElement | null>(null);
  const suppress = useRef(false);

  // während des Ziehens darf die Seite nicht scrollen
  useEffect(() => {
    if (!drag) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, [drag]);

  const setHover = (el: HTMLElement | null) => {
    if (hover.current === el) return;
    hover.current?.classList.remove("drop-hover");
    el?.classList.add("drop-hover");
    hover.current = el;
  };

  const down = (p: Person) => (e: React.PointerEvent) => {
    if (!onDrop) return;
    const target = e.currentTarget as HTMLElement;
    const id = e.pointerId;
    const timer = setTimeout(() => {
      try {
        target.setPointerCapture(id);
      } catch {}
      suppress.current = true;
      setDrag({ person: p, x: press.current?.x ?? e.clientX, y: press.current?.y ?? e.clientY });
    }, 380);
    press.current = { id, x: e.clientX, y: e.clientY, timer };
  };
  const move = (e: React.PointerEvent) => {
    const pr = press.current;
    if (pr && !drag && (Math.abs(e.clientX - pr.x) > 8 || Math.abs(e.clientY - pr.y) > 8)) {
      clearTimeout(pr.timer);
      press.current = null;
      return;
    }
    if (pr) pr.x = e.clientX;
    if (pr) pr.y = e.clientY;
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-task-id]") ?? null;
    setHover(el);
  };
  const up = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    if (drag && hover.current && onDrop) onDrop(drag.person.id, hover.current.dataset.taskId!);
    setHover(null);
    setDrag(null);
    setTimeout(() => (suppress.current = false), 60);
  };

  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
      {(state?.people ?? []).map((p) => {
        const dim = selected && selected !== p.id;
        return (
          <button
            key={p.id}
            onClick={() => !suppress.current && onToggle(p.id)}
            onPointerDown={down(p)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onContextMenu={(e) => onDrop && e.preventDefault()}
            className="press flex flex-col items-center gap-1 select-none"
            style={{
              opacity: dim ? 0.35 : drag?.person.id === p.id ? 0.3 : 1,
              transition: "opacity 200ms ease",
              WebkitTouchCallout: "none",
            }}
            aria-pressed={selected === p.id}
          >
            <span
              className="rounded-full p-[2.5px]"
              style={{
                boxShadow: selected === p.id ? `0 0 0 2px ${p.color ?? FALLBACK_COLOR}` : "none",
                transition: "box-shadow 200ms ease",
              }}
            >
              <Avatar person={p} size={compact ? 32 : 44} />
            </span>
            {!compact && (
              <span className="caption block max-w-[60px] truncate" style={{ color: "var(--label-2)" }}>
                {p.name}
              </span>
            )}
          </button>
        );
      })}
      {drag && (
        <div
          className="pointer-events-none fixed z-[60]"
          style={{ left: drag.x - 28, top: drag.y - 64, filter: "drop-shadow(0 10px 18px rgba(0,0,0,.35))", transform: "scale(1.15)" }}
          aria-hidden
        >
          <Avatar person={drag.person} size={56} />
        </div>
      )}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-[22px] ${className}`}>{children}</section>;
}

export function SectionTitle({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mt-7 mb-2 flex items-baseline justify-between gap-3 px-1">
      <h2 className="title-2 min-w-0 truncate">{children}</h2>
      {trailing && <span className="subhead shrink-0">{trailing}</span>}
    </div>
  );
}

/** Eintrag in einer Liste: blendet beim Hinzufügen ein und klappt beim Entfernen zu */
export function ListItem({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout={false}
      initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      style={{ overflow: "hidden" }}
    >
      {children}
    </motion.div>
  );
}

export { AnimatePresence };

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}

export type MenuAction = {
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
};

/** Kontextmenü nach langem Drücken, mit Vorschau des Elements */
export function ContextMenu({ open, onClose, preview, actions }: { open: boolean; onClose: () => void; preview: ReactNode; actions: MenuAction[] }) {
  useEscape(open, onClose);
  const reduce = useReducedMotion();
  const pop = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.96)" },
    animate: reduce ? { opacity: 1 } : { opacity: 1, transform: "scale(1)" },
    exit: reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.97)", transition: { duration: 0.14, ease: [0.23, 1, 0.32, 1] as const } },
    transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const, delay },
  });
  if (typeof document === "undefined") return null;
  // im body, damit ein nach hinten gerückter Inhalt das Menü nicht mitnimmt
  return createPortal(
    <AnimatePresence>
      {open && (
        <div key="menu" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6" role="dialog" aria-modal>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 cursor-default"
            style={{ background: "var(--scrim)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
            onClick={onClose}
            aria-label="Schließen"
          />
          <motion.div {...pop(0)} className="glass glass-strong w-full max-w-sm rounded-[22px] p-4" style={{ transformOrigin: "center bottom" }}>
            {preview}
          </motion.div>
          <motion.div
            {...pop(0.03)}
            className="glass glass-strong max-h-[55dvh] w-full max-w-[260px] self-start overflow-y-auto rounded-[18px] sm:self-center"
            style={{ transformOrigin: "left top" }}
          >
            {actions.map((a, i) => (
              <button
                key={a.label}
                onClick={() => {
                  a.onSelect();
                  onClose();
                }}
                className="body flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-100 active:bg-[var(--fill)]"
                style={{
                  color: a.destructive ? "var(--danger)" : "var(--label)",
                  borderTop: i ? "0.5px solid var(--separator)" : "none",
                }}
              >
                {a.label}
                <span style={{ color: a.destructive ? "var(--danger)" : "var(--label-2)" }}>{a.icon}</span>
              </button>
            ))}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Rahmen für alle Blätter von unten, gebaut wie ein iOS-Blatt:
 * gleitet herein, schiebt den Hintergrund nach hinten, folgt dem Finger 1:1 beim Herunterziehen
 * (am Kopf oder am Inhalt, wenn dieser ganz oben steht), schließt bei Schwung oder Strecke,
 * und bleibt bei offener Tastatur im sichtbaren Bereich.
 * Liegt per Portal direkt im body, damit der nach hinten gerückte Inhalt es nicht mitnimmt.
 * Für Ausblenden muss der Aufrufer es in AnimatePresence setzen, Sheet macht das selbst.
 */
export function SheetFrame({
  label,
  onClose,
  header,
  children,
  onSubmit,
  z = 40,
}: {
  label: string;
  onClose: () => void;
  header: ReactNode;
  children: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  z?: number;
}) {
  useEscape(true, onClose);
  const reduce = useReducedMotion();
  const present = useIsPresent();
  const controls = useDragControls();
  const dragY = useMotionValue(0);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Hintergrund nach hinten, solange das Blatt da ist; beim Schließen sofort zurück
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    release.current = pushSheet();
    return () => release.current?.();
  }, []);
  useEffect(() => {
    if (!present) release.current?.();
  }, [present]);

  // Herunterziehen mit dem Finger, auch am Inhalt, wenn er ganz oben steht
  useEffect(() => {
    const el = panel.current;
    const scroller = body.current;
    if (!el || !scroller || reduce) return;
    type G = { y: number; x: number; active: boolean; grip: boolean; samples: { y: number; t: number }[] } | null;
    let g: G = null;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return (g = null);
      const target = e.target as HTMLElement;
      const grip = !!target.closest("[data-sheet-grip]");
      // Zeichenflächen, Drehregler und Eingaben behalten ihre Gesten
      if (!grip && target.closest(".touch-none, input, textarea, select, [contenteditable], [data-no-sheet-drag]")) return (g = null);
      const t = e.touches[0];
      g = { y: t.clientY, x: t.clientX, active: false, grip, samples: [] };
    };
    const move = (e: TouchEvent) => {
      if (!g) return;
      const t = e.touches[0];
      const dy = t.clientY - g.y;
      const dx = t.clientX - g.x;
      if (!g.active) {
        if (Math.abs(dx) > Math.abs(dy) + 2) return (g = null); // waagerecht: Chips dürfen scrollen
        if (dy > 4 && (g.grip || scroller.scrollTop <= 0)) {
          g.active = true;
          g.y = t.clientY;
        } else if (dy < -4 || (!g.grip && scroller.scrollTop > 0)) return (g = null);
        else return;
      }
      e.preventDefault();
      const off = t.clientY - g.y;
      // nach oben nur mit Widerstand, nach unten 1:1
      dragY.set(off > 0 ? off : -Math.sqrt(-off) * 2);
      g.samples.push({ y: t.clientY, t: performance.now() });
      if (g.samples.length > 5) g.samples.shift();
    };
    const end = () => {
      if (!g?.active) return (g = null);
      const s = g.samples;
      const v = s.length > 1 ? (s[s.length - 1].y - s[0].y) / Math.max(1, s[s.length - 1].t - s[0].t) : 0; // px/ms
      g = null;
      const off = dragY.get();
      if (off > 120 || (v > 0.45 && off > 20)) {
        haptic();
        closeRef.current();
      } else void animate(dragY, 0, { type: "spring", bounce: 0.18, duration: 0.45, velocity: v * 1000 });
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [dragY, reduce]);

  const Panel = onSubmit ? motion.form : motion.div;
  const ease = [0.32, 0.72, 0, 1] as const;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-x-0 flex items-end justify-center"
      // folgt dem sichtbaren Bereich über der Tastatur
      style={{ zIndex: z, top: "var(--vvt, 0px)", height: "var(--vvh, 100dvh)" }}
      role="dialog"
      aria-modal
      aria-label={label}
    >
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.25 } }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 cursor-default"
        style={{ background: "var(--scrim)" }}
        onClick={onClose}
        aria-label="Schließen"
        tabIndex={-1}
      />
      <motion.div
        className="relative flex max-h-[calc(100%-40px)] w-full max-w-md flex-col"
        initial={reduce ? { opacity: 0 } : { y: "100%" }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: "105%", transition: { duration: 0.32, ease } }}
        transition={{ duration: 0.46, ease }}
      >
        <Panel
          ref={panel as never}
          onSubmit={onSubmit as never}
          style={{ y: dragY }}
          drag={reduce ? false : "y"}
          dragControls={controls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.04, bottom: 0.9 }}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            if (info.offset.y > 110 || info.velocity.y > 500) onClose();
          }}
          className="glass glass-strong flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-t-[30px]"
        >
          <div
            data-sheet-grip
            className="shrink-0 cursor-grab px-4 pt-2 pb-1 active:cursor-grabbing"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              // Maus zieht über motion, Finger über die eigenen Touch-Gesten
              if (e.pointerType !== "mouse" || (e.target as HTMLElement).closest("button, input, a")) return;
              controls.start(e);
            }}
          >
            <span className="mx-auto mb-2 block h-[5px] w-9 rounded-full" style={{ background: "var(--label-3)" }} aria-hidden />
            {header}
          </div>
          <div
            ref={body}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4"
            style={{ paddingBottom: "calc(var(--safe-b) + 24px)" }}
            onFocus={(e) => {
              // Feld nach dem Einblenden der Tastatur in die Mitte holen
              const el = e.target as HTMLElement;
              if (!el.matches("input, textarea, select")) return;
              setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 320);
            }}
          >
            {children}
          </div>
        </Panel>
      </motion.div>
    </div>,
    document.body,
  );
}

/** Kopfzeile eines Blatts: links Abbrechen, Mitte Titel, rechts Aktion */
export function SheetHeader({ title, leading, trailing }: { title: ReactNode; leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1">
      <div className="flex justify-start">{leading}</div>
      <span className="headline truncate text-center">{title}</span>
      <div className="flex justify-end">{trailing}</div>
    </div>
  );
}

/** Aufschiebbares Blatt von unten, wie in iOS */
export function Sheet({
  open,
  onClose,
  title,
  leading,
  trailing,
  children,
  z = 40,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  z?: number;
}) {
  return (
    <AnimatePresence>
      {open && (
        <SheetFrame
          key="sheet"
          label={title}
          onClose={onClose}
          z={z}
          header={
            <SheetHeader
              title={title}
              leading={
                leading ?? (
                  <button onClick={onClose} className="body" style={{ color: "var(--tint)" }}>
                    Schließen
                  </button>
                )
              }
              trailing={trailing}
            />
          }
        >
          {children}
        </SheetFrame>
      )}
    </AnimatePresence>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className="press subhead shrink-0 rounded-full px-3.5 py-1.5 font-medium"
          style={{
            background: o.id === value ? "var(--tint)" : "var(--fill)",
            color: o.id === value ? "white" : "var(--label)",
            transition: "background-color 160ms ease, color 160ms ease",
          }}
          aria-pressed={o.id === value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Segmentschalter wie in iOS: Linse gleitet per transform, kurz und ohne Überschwingen */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  return (
    <div className="relative flex rounded-[11px] p-[2px]" style={{ background: "var(--fill)" }}>
      <span
        className="absolute top-[2px] bottom-[2px] left-[2px] rounded-[9px]"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
          background: "var(--row-solid)",
          boxShadow: "0 3px 8px rgba(0,0,0,.1), 0 1px 1px rgba(0,0,0,.04)",
          transition: "transform 240ms var(--ease-out)",
        }}
        aria-hidden
      />
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className="footnote relative flex-1 py-1.5 font-semibold" aria-pressed={o.id === value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Schalter-Optik wie in iOS; der umgebende Knopf trägt role="switch" */
export function Switch({ on }: { on: boolean }) {
  return (
    <span className="relative h-[31px] w-[51px] shrink-0 rounded-full" style={{ background: on ? "var(--success)" : "var(--fill)", transition: "background-color 200ms ease" }}>
      <span
        className="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white"
        style={{ transform: `translateX(${on ? 20 : 0}px)`, boxShadow: "0 3px 8px rgba(0,0,0,.15), 0 0 0 0.5px rgba(0,0,0,.04)", transition: "transform 240ms var(--ease-out)" }}
      />
    </span>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="footnote mt-5 mb-2 font-semibold" style={{ color: "var(--label-2)" }}>
      {children}
    </p>
  );
}

/** Kurz tippen oder lange drücken auf demselben Knopf */
export function useLongPress(onLong: () => void, onTap: () => void, ms = 420) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: () => {
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLong();
      }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    onClick: () => {
      if (fired.current) return;
      onTap();
    },
  };
}
