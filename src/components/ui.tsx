"use client";

import { useEffect, useState, type ReactNode } from "react";
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
    <nav
      className="fixed inset-x-0 z-30 mx-auto flex max-w-md justify-center px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
      aria-label="Bereiche"
    >
      <div className="glass glass-strong relative flex w-full rounded-[30px] p-1.5">
        {/* gleitende Linse unter dem aktiven Tab */}
        <span
          className="absolute top-1.5 bottom-1.5 rounded-[24px]"
          style={{
            left: `calc(6px + ${index} * (100% - 12px) / ${tabs.length})`,
            width: `calc((100% - 12px) / ${tabs.length})`,
            background: "var(--glass-strong)",
            boxShadow: "inset 0 1px 0 var(--glass-edge), 0 2px 10px rgba(0,0,0,.06)",
            transition: "left 380ms cubic-bezier(0.25, 1.2, 0.4, 1)",
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
              style={{ color: active ? "var(--tint)" : "var(--label-2)" }}
              aria-current={active ? "page" : undefined}
            >
              <span className="relative">
                <Icon size={24} strokeWidth={active ? 2.1 : 1.7} />
                {!!count && (
                  <span
                    className="absolute -top-1.5 -right-2.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white tabular"
                    style={{ background: "var(--danger)" }}
                  >
                    {count}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium tracking-[0.1px]">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function PersonFilter({ selected, onToggle, compact }: { selected: string | null; onToggle: (id: string) => void; compact?: boolean }) {
  const { state } = useFamily();
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
      {(state?.people ?? []).map((p) => {
        const dim = selected && selected !== p.id;
        return (
          <button
            key={p.id}
            onClick={() => onToggle(p.id)}
            className="press flex flex-col items-center gap-1"
            style={{ opacity: dim ? 0.35 : 1, transition: "opacity 200ms ease" }}
            aria-pressed={selected === p.id}
          >
            <span
              className="rounded-full p-[2.5px]"
              style={{ boxShadow: selected === p.id ? `0 0 0 2px ${p.color ?? FALLBACK_COLOR}` : "none", transition: "box-shadow 200ms ease" }}
            >
              <Avatar person={p} size={compact ? 32 : 44} />
            </span>
            {!compact && (
              <span className="caption" style={{ color: "var(--label-2)" }}>
                {p.name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-[26px] ${className}`}>{children}</section>;
}

export function SectionTitle({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mt-7 mb-2.5 flex items-end justify-between px-1">
      <h2 className="title-2">{children}</h2>
      {trailing}
    </div>
  );
}

export type MenuAction = { label: string; icon?: ReactNode; destructive?: boolean; onSelect: () => void };

/** Kontextmenü nach langem Drücken, mit Vorschau des Elements */
export function ContextMenu({
  open,
  onClose,
  preview,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  preview: ReactNode;
  actions: MenuAction[];
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6" role="dialog" aria-modal>
      <button
        className="fade-in absolute inset-0 cursor-default"
        style={{ background: "rgba(0,0,0,.18)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
        onClick={onClose}
        aria-label="Schließen"
      />
      <div className="sheet-in glass glass-strong relative w-full max-w-sm rounded-[22px] p-4">{preview}</div>
      <div className="sheet-in glass glass-strong relative max-h-[55dvh] w-full max-w-[260px] self-start overflow-y-auto rounded-[18px] sm:self-center" style={{ animationDelay: "40ms" }}>
        {actions.map((a, i) => (
          <button
            key={a.label}
            onClick={() => {
              a.onSelect();
              onClose();
            }}
            className="flex w-full items-center justify-between px-4 py-3 text-left body active:bg-black/5"
            style={{
              color: a.destructive ? "var(--danger)" : "var(--label)",
              borderTop: i ? "0.5px solid var(--separator)" : "none",
            }}
          >
            {a.label}
            <span style={{ color: a.destructive ? "var(--danger)" : "var(--label-2)" }}>{a.icon}</span>
          </button>
        ))}
      </div>
    </div>
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: z }} role="dialog" aria-modal aria-label={title}>
      <button className="fade-in absolute inset-0" style={{ background: "rgba(0,0,0,.25)" }} onClick={onClose} aria-label="Schließen" />
      <div
        className="sheet-in glass glass-strong relative max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] px-4 pt-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
      >
        <span className="mx-auto mb-2 block h-[5px] w-9 rounded-full" style={{ background: "var(--label-3)" }} aria-hidden />
        <div className="flex items-center justify-between gap-2 py-1">
          <div className="flex w-24 justify-start">
            {leading ?? (
              <button onClick={onClose} className="body" style={{ color: "var(--tint)" }}>
                Schließen
              </button>
            )}
          </div>
          <span className="headline truncate text-center">{title}</span>
          <div className="flex w-24 justify-end">{trailing}</div>
        </div>
        {children}
      </div>
    </div>
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
            background: o.id === value ? "var(--tint)" : "color-mix(in oklab, var(--label) 7%, transparent)",
            color: o.id === value ? "white" : "var(--label)",
            transition: "background 160ms ease",
          }}
          aria-pressed={o.id === value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="footnote mt-5 mb-2 font-semibold" style={{ color: "var(--label-2)" }}>
      {children}
    </p>
  );
}
