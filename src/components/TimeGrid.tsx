"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { addDays, sameDay, startOfDay, type Occurrence } from "@/lib/recurrence";

export const HOUR = 52;
const SNAP = 15; // Minuten
const LONG_PRESS = 320;

type Placed = { occ: Occurrence; top: number; height: number; col: number; cols: number };

/** Überlappende Termine nebeneinander anordnen */
function layout(list: Occurrence[], day: Date): Placed[] {
  const d0 = +startOfDay(day);
  const items = list
    .map((occ) => {
      const s = Math.max(0, (+occ.start - d0) / 60000);
      const e = Math.min(1440, (+occ.end - d0) / 60000);
      return { occ, s, e: Math.max(e, s + 20) };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const out: Placed[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;
  const flush = () => {
    const colsEnd: number[] = [];
    const placed = cluster.map((it) => {
      let col = colsEnd.findIndex((end) => end <= it.s);
      if (col === -1) {
        col = colsEnd.length;
        colsEnd.push(it.e);
      } else colsEnd[col] = it.e;
      return { it, col };
    });
    for (const { it, col } of placed) {
      out.push({ occ: it.occ, top: (it.s / 60) * HOUR, height: Math.max(((it.e - it.s) / 60) * HOUR - 2, 20), col, cols: colsEnd.length });
    }
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

type DragState = {
  occ: Occurrence;
  kind: "move" | "resize";
  startX: number;
  startY: number;
  dayIndex: number;
  dMin: number;
  dDays: number;
};

const fmt = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export function TimeGrid({
  days,
  occurrences,
  now,
  onTapSlot,
  onTapEvent,
  onCommit,
  onSwipe,
}: {
  days: Date[];
  occurrences: Occurrence[];
  now: Date;
  onTapSlot: (start: Date) => void;
  onTapEvent: (occ: Occurrence) => void;
  onCommit: (occ: Occurrence, start: Date, end: Date) => void;
  onSwipe: (dir: 1 | -1) => void;
}) {
  const { color } = useFamily();
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ occ: Occurrence; kind: "move" | "resize"; x: number; y: number; dayIndex: number; id: number } | null>(null);
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const suppressClick = useRef(false);
  const compact = days.length > 3;

  // beim ersten Anzeigen zur aktuellen Uhrzeit bzw. 7 Uhr scrollen
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const h = days.some((d) => sameDay(d, now)) ? Math.max(0, now.getHours() - 1.5) : 7;
    el.scrollTop = h * HOUR;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timed = useMemo(() => occurrences.filter((o) => !o.event.allDay), [occurrences]);
  const allDay = useMemo(() => occurrences.filter((o) => o.event.allDay), [occurrences]);

  const perDay = useMemo(
    () =>
      days.map((d) => {
        const s = startOfDay(d);
        const e = addDays(s, 1);
        return layout(
          timed.filter((o) => o.end > s && o.start < e),
          d,
        );
      }),
    [days, timed],
  );

  const colWidth = () => (cols.current ? cols.current.getBoundingClientRect().width / days.length : 50);

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pending.current = null;
  };

  const onBlockDown = (occ: Occurrence, kind: "move" | "resize", dayIndex: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (occ.event.id.startsWith("tmp-")) return;
    const target = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    pending.current = { occ, kind, x: e.clientX, y: e.clientY, dayIndex, id: pointerId };
    pressTimer.current = setTimeout(() => {
      const p = pending.current;
      if (!p) return;
      try {
        target.setPointerCapture(pointerId);
      } catch {}
      navigator.vibrate?.(10);
      setDrag({ occ: p.occ, kind: p.kind, startX: p.x, startY: p.y, dayIndex: p.dayIndex, dMin: 0, dDays: 0 });
      suppressClick.current = true;
    }, kind === "resize" ? 180 : LONG_PRESS);
  };

  const onMove = (e: React.PointerEvent) => {
    if (pending.current && !drag) {
      if (Math.abs(e.clientX - pending.current.x) > 8 || Math.abs(e.clientY - pending.current.y) > 8) cancelPress();
      return;
    }
    if (!drag) return;
    e.preventDefault();
    const dMin = Math.round((((e.clientY - drag.startY) / HOUR) * 60) / SNAP) * SNAP;
    const dDays = drag.kind === "move" ? Math.max(-drag.dayIndex, Math.min(days.length - 1 - drag.dayIndex, Math.round((e.clientX - drag.startX) / colWidth()))) : 0;
    if (dMin !== drag.dMin || dDays !== drag.dDays) setDrag({ ...drag, dMin, dDays });
    // am Rand mitscrollen
    const el = scroller.current;
    if (el) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + 40) el.scrollTop -= 8;
      if (e.clientY > r.bottom - 40) el.scrollTop += 8;
    }
  };

  const preview = (d: DragState) => {
    const ms = d.dMin * 60000 + d.dDays * 86400000;
    if (d.kind === "move") return { start: new Date(+d.occ.start + ms), end: new Date(+d.occ.end + ms) };
    const end = new Date(Math.max(+d.occ.start + SNAP * 60000, +d.occ.end + d.dMin * 60000));
    return { start: d.occ.start, end };
  };

  const onUp = () => {
    cancelPress();
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.dMin === 0 && d.dDays === 0) return;
    const p = preview(d);
    onCommit(d.occ, p.start, p.end);
  };

  // iOS: während des Ziehens das native Scrollen unterdrücken
  const dragging = useRef(false);
  useEffect(() => {
    dragging.current = !!drag;
  }, [drag]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, []);

  useEffect(() => {
    const clear = () => setTimeout(() => (suppressClick.current = false), 50);
    window.addEventListener("pointerup", clear);
    return () => window.removeEventListener("pointerup", clear);
  }, []);

  // Wischen zum Blättern (nur ohne laufendes Ziehen)
  const onGridDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onGridUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || drag) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - s.t < 600) {
      suppressClick.current = true;
      onSwipe(dx < 0 ? 1 : -1);
    }
  };

  const slotClick = (dayIndex: number) => (e: React.MouseEvent) => {
    if (suppressClick.current) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const min = Math.floor((((e.clientY - r.top) / HOUR) * 60) / 30) * 30;
    const start = new Date(+startOfDay(days[dayIndex]) + min * 60000);
    onTapSlot(start);
  };

  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR;

  return (
    <div className="flex min-h-0 flex-1 select-none flex-col" style={{ WebkitUserSelect: "none" }}>
      {/* Kopfzeile mit Tagen */}
      <div className="flex pl-11" onPointerDown={onGridDown} onPointerUp={onGridUp}>
        {days.map((d) => {
          const today = sameDay(d, now);
          return (
            <div key={+d} className="flex flex-1 flex-col items-center pb-1.5">
              <span className="caption font-medium" style={{ color: today ? "var(--danger)" : "var(--label-2)" }}>
                {d.toLocaleDateString("de-DE", { weekday: compact ? "narrow" : "short" }).replace(".", "")}
              </span>
              <span
                className={`mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-full px-1 tabular ${compact ? "subhead" : "headline"}`}
                style={{ background: today ? "var(--danger)" : "transparent", color: today ? "white" : "var(--label)", fontWeight: today ? 650 : 500 }}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Ganztägig */}
      {allDay.length > 0 && (
        <div className="flex border-y pl-11" style={{ borderColor: "var(--separator)" }}>
          {days.map((d) => {
            const s = startOfDay(d);
            const list = allDay.filter((o) => o.end > s && o.start < addDays(s, 1));
            return (
              <div key={+d} className="flex min-w-0 flex-1 flex-col gap-0.5 px-[1px] py-1">
                {list.slice(0, 3).map((o) => (
                  <button
                    key={o.key}
                    onClick={() => onTapEvent(o)}
                    className="caption truncate rounded-[5px] px-1 py-[1px] text-left font-semibold text-white"
                    style={{ background: color(o.event.people[0]) }}
                  >
                    {o.event.title}
                  </button>
                ))}
                {list.length > 3 && (
                  <span className="caption px-1" style={{ color: "var(--label-2)" }}>
                    +{list.length - 3}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Raster */}
      <div
        ref={scroller}
        className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto"
        style={{ touchAction: drag ? "none" : "pan-y", overscrollBehavior: "contain" }}
        onPointerDown={onGridDown}
        onPointerMove={onMove}
        onPointerUp={(e) => {
          onUp();
          onGridUp(e);
        }}
        onPointerCancel={onUp}
      >
        <div className="relative flex" style={{ height: 24 * HOUR + 8 }}>
          <div className="w-11 shrink-0" aria-hidden>
            {Array.from({ length: 24 }).map((_, h) => (
              <span key={h} className="caption tabular absolute left-0 w-9 -translate-y-1/2 text-right" style={{ top: h * HOUR, color: "var(--label-3)" }}>
                {h ? `${String(h).padStart(2, "0")}:00` : ""}
              </span>
            ))}
          </div>
          <div ref={cols} className="relative flex flex-1">
            {Array.from({ length: 24 }).map((_, h) => (
              <span key={h} className="pointer-events-none absolute inset-x-0 h-px" style={{ top: h * HOUR, background: "var(--separator)" }} />
            ))}
            {days.map((d, di) => (
              <div
                key={+d}
                className="relative flex-1"
                style={{ borderLeft: di ? "0.5px solid var(--separator)" : "none" }}
                onClick={slotClick(di)}
                role="presentation"
              >
                {sameDay(d, now) && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: nowTop }}>
                    <span className="-ml-1 h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />
                    <span className="h-[1.5px] flex-1" style={{ background: "var(--danger)" }} />
                  </div>
                )}
                {perDay[di].map((p) => {
                  const isDragged = drag?.occ.key === p.occ.key;
                  const c = color(p.occ.event.people[0]);
                  return (
                    <div
                      key={p.occ.key}
                      className="absolute overflow-hidden rounded-[7px]"
                      style={{
                        top: p.top,
                        height: p.height,
                        left: `calc(${(p.col / p.cols) * 100}% + 1px)`,
                        width: `calc(${100 / p.cols}% - 2px)`,
                        background: `color-mix(in oklab, ${c} 22%, var(--row-solid))`,
                        borderLeft: `3px solid ${c}`,
                        opacity: isDragged ? 0.35 : 1,
                        zIndex: 5,
                      }}
                      onPointerDown={onBlockDown(p.occ, "move", di)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!suppressClick.current) onTapEvent(p.occ);
                      }}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <div className="px-1 py-0.5" style={{ WebkitTouchCallout: "none" }}>
                        <p className={`${compact ? "text-[10.5px] leading-[13px]" : "footnote"} line-clamp-3 font-semibold`} style={{ color: `color-mix(in oklab, ${c} 55%, var(--label))` }}>
                          {p.occ.event.title}
                        </p>
                        {!compact && p.height > 36 && (
                          <p className="caption tabular" style={{ color: "var(--label-2)" }}>
                            {fmt(p.occ.start)}
                            {p.occ.event.place ? `, ${p.occ.event.place}` : ""}
                          </p>
                        )}
                      </div>
                      <span
                        className="absolute inset-x-0 bottom-0 h-3 cursor-ns-resize"
                        onPointerDown={onBlockDown(p.occ, "resize", di)}
                        aria-hidden
                      />
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Vorschau beim Ziehen */}
            {drag &&
              (() => {
                const p = preview(drag);
                const di = drag.dayIndex + drag.dDays;
                const d0 = +startOfDay(days[di] ?? days[0]);
                const top = ((+p.start - d0) / 3600000) * HOUR;
                const height = Math.max(((+p.end - +p.start) / 3600000) * HOUR - 2, 20);
                const c = color(drag.occ.event.people[0]);
                return (
                  <div
                    className="pointer-events-none absolute z-30 rounded-[8px] px-1 py-0.5"
                    style={{
                      top,
                      height,
                      left: `calc(${(di / days.length) * 100}% + 1px)`,
                      width: `calc(${100 / days.length}% - 2px)`,
                      background: c,
                      boxShadow: "0 10px 30px -6px rgba(0,0,0,.35)",
                      transform: "scale(1.03)",
                    }}
                  >
                    <p className="caption font-semibold text-white">{drag.occ.event.title}</p>
                    <p className="caption tabular text-white/90">
                      {fmt(p.start)} bis {fmt(p.end)}
                    </p>
                  </div>
                );
              })()}
          </div>
        </div>
      </div>
    </div>
  );
}
