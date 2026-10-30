"use client";

import { useEffect, useMemo, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { addDays, occurrences, sameDay, startOfDay, startOfWeek, type Occurrence } from "@/lib/recurrence";
import { AvatarStack, Card, ContextMenu, PersonFilter } from "./ui";
import { TimeGrid } from "./TimeGrid";
import { IconChevron, IconPlus, IconRepeat } from "./icons";

type Mode = "tag" | "woche" | "monat";

const modes: { id: Mode; label: string }[] = [
  { id: "tag", label: "Tag" },
  { id: "woche", label: "Woche" },
  { id: "monat", label: "Monat" },
];

const fmtTime = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

function monthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function CalendarView({
  now,
  filter,
  setFilter,
  onOpen,
  onNew,
}: {
  now: Date;
  filter: string | null;
  setFilter: (id: string | null) => void;
  onOpen: (occ: Occurrence) => void;
  onNew: (start: Date, allDay?: boolean) => void;
}) {
  const { state, color, run, ensureRange } = useFamily();
  const [mode, setMode] = useState<Mode>("woche");
  const [anchor, setAnchor] = useState(() => startOfDay(now));
  const [selected, setSelected] = useState(() => startOfDay(now));
  const [confirm, setConfirm] = useState<{ occ: Occurrence; start: Date; end: Date } | null>(null);

  const days = useMemo(() => {
    if (mode === "tag") return [anchor];
    const s = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [mode, anchor]);
  const grid = useMemo(() => monthGrid(anchor), [anchor]);

  const range = useMemo(() => {
    if (mode === "monat") return { from: grid[0], to: addDays(grid[41], 1) };
    return { from: days[0], to: addDays(days[days.length - 1], 1) };
  }, [mode, grid, days]);

  useEffect(() => {
    ensureRange(range.from, range.to);
  }, [range, ensureRange]);

  const occ = useMemo(() => occurrences(state?.events ?? [], range.from, range.to, filter), [state?.events, range, filter]);

  const step = (dir: 1 | -1) => {
    if (mode === "tag") setAnchor((a) => addDays(a, dir));
    else if (mode === "woche") setAnchor((a) => addDays(a, 7 * dir));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  };

  const goToday = () => {
    setAnchor(startOfDay(now));
    setSelected(startOfDay(now));
  };

  const title =
    mode === "monat"
      ? anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })
      : mode === "woche"
        ? (() => {
            const a = days[0];
            const b = days[6];
            const kw = isoWeek(a);
            const span = a.getMonth() !== b.getMonth();
            const m = (d: Date) => d.toLocaleDateString("de-DE", { month: span ? "short" : "long" });
            return `${m(a)}${span ? ` bis ${m(b)}` : ""}, KW ${kw}`;
          })()
        : anchor.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" });

  const commit = (o: Occurrence, start: Date, end: Date) => {
    if (o.recurring) return setConfirm({ occ: o, start, end });
    void run({ op: "event.move", id: o.event.id, startsAt: start.toISOString(), endsAt: end.toISOString() });
  };

  const fieldsOf = (o: Occurrence, start: Date, end: Date) => ({
    title: o.event.title,
    place: o.event.place,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    allDay: o.event.allDay,
    people: o.event.people,
    recurrence: o.event.recurrence,
    recurrenceUntil: o.event.recurrenceUntil,
    reminders: o.event.reminders,
  });

  const dayList = occ.filter((o) => o.end > selected && o.start < addDays(selected, 1));

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 safe-top" style={{ height: "100dvh", paddingBottom: "var(--clear)" }}>
      <header className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <button onClick={goToday} className="footnote font-semibold" style={{ color: "var(--danger)" }}>
            Heute
          </button>
          <h1 className="title-2 truncate">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => step(-1)} className="press glass flex h-10 w-10 items-center justify-center rounded-full" aria-label="Zurück">
            <IconChevron size={18} className="rotate-180" />
          </button>
          <button onClick={() => step(1)} className="press glass flex h-10 w-10 items-center justify-center rounded-full" aria-label="Weiter">
            <IconChevron size={18} />
          </button>
          <button
            onClick={() => {
              const base = mode === "monat" ? selected : sameDay(anchor, now) ? now : anchor;
              const s = new Date(base);
              if (mode === "monat" || !sameDay(base, now)) s.setHours(9, 0, 0, 0);
              else s.setMinutes(Math.ceil((s.getMinutes() + 1) / 15) * 15, 0, 0);
              onNew(s);
            }}
            className="press glass flex h-10 w-10 items-center justify-center rounded-full"
            style={{ color: "var(--tint)" }}
            aria-label="Neuer Termin"
          >
            <IconPlus size={20} />
          </button>
        </div>
      </header>

      <div className="mt-3 relative flex rounded-[10px] p-[2px]" style={{ background: "var(--fill)" }}>
        <span
          className="absolute top-[2px] bottom-[2px] rounded-[8px]"
          style={{
            left: `calc(2px + ${modes.findIndex((m) => m.id === mode)} * (100% - 4px) / 3)`,
            width: "calc((100% - 4px) / 3)",
            background: "var(--glass-strong)",
            boxShadow: "0 3px 8px rgba(0,0,0,.12)",
            transition: "left 300ms cubic-bezier(0.25, 1.1, 0.4, 1)",
          }}
          aria-hidden
        />
        {modes.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} className="footnote relative flex-1 py-1.5 font-semibold" aria-pressed={m.id === mode}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <PersonFilter selected={filter} onToggle={(id) => setFilter(filter === id ? null : id)} compact />
      </div>

      {mode === "monat" ? (
        <MonthGrid
          grid={grid}
          anchor={anchor}
          now={now}
          selected={selected}
          occ={occ}
          color={color}
          onSelect={(d) => setSelected(d)}
          onSwipe={step}
          list={dayList}
          onOpen={onOpen}
          onNew={() => {
            const s = new Date(selected);
            s.setHours(9, 0, 0, 0);
            onNew(s);
          }}
        />
      ) : (
        <Card className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
          <TimeGrid key={`${mode}-${+days[0]}`} days={days} occurrences={occ} now={now} onTapSlot={onNew} onTapEvent={onOpen} onCommit={commit} onSwipe={step} />
        </Card>
      )}

      <ContextMenu
        open={!!confirm}
        onClose={() => setConfirm(null)}
        preview={
          confirm && (
            <div>
              <p className="headline">{confirm.occ.event.title} verschieben</p>
              <p className="footnote tabular" style={{ color: "var(--label-2)" }}>
                {confirm.start.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}, {fmtTime(confirm.start)} bis {fmtTime(confirm.end)}
              </p>
            </div>
          )
        }
        actions={
          confirm
            ? [
                {
                  label: "Nur diesen Termin",
                  onSelect: () =>
                    void run({ op: "event.detach", id: confirm.occ.event.id, occurrence: confirm.occ.occurrence, ...fieldsOf(confirm.occ, confirm.start, confirm.end) }),
                },
                {
                  label: "Alle Termine der Serie",
                  onSelect: () => {
                    const o = confirm.occ;
                    const base = new Date(+new Date(o.event.startsAt) + (+confirm.start - +o.start));
                    const end = new Date(+base + (+confirm.end - +confirm.start));
                    void run({ op: "event.move", id: o.event.id, startsAt: base.toISOString(), endsAt: end.toISOString() });
                  },
                },
              ]
            : []
        }
      />
    </div>
  );
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +y) / 86400000 + 1) / 7);
}

function MonthGrid({
  grid,
  anchor,
  now,
  selected,
  occ,
  color,
  onSelect,
  onSwipe,
  list,
  onOpen,
  onNew,
}: {
  grid: Date[];
  anchor: Date;
  now: Date;
  selected: Date;
  occ: Occurrence[];
  color: (id: string | null | undefined) => string;
  onSelect: (d: Date) => void;
  onSwipe: (dir: 1 | -1) => void;
  list: Occurrence[];
  onOpen: (o: Occurrence) => void;
  onNew: () => void;
}) {
  const [sw, setSw] = useState<{ x: number; y: number } | null>(null);
  const dots = (d: Date) => {
    const s = startOfDay(d);
    const e = addDays(s, 1);
    return occ.filter((o) => o.end > s && o.start < e).slice(0, 4);
  };

  return (
    <div className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto">
      <Card className="p-2">
        <div
          onPointerDown={(e) => setSw({ x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => {
            if (!sw) return;
            const dx = e.clientX - sw.x;
            if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(e.clientY - sw.y)) onSwipe(dx < 0 ? 1 : -1);
            setSw(null);
          }}
          style={{ touchAction: "pan-y" }}
        >
          <div className="grid grid-cols-7 pb-1">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => (
              <span key={w} className="caption text-center font-medium" style={{ color: "var(--label-3)" }}>
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {grid.map((d) => {
              const inMonth = d.getMonth() === anchor.getMonth();
              const today = sameDay(d, now);
              const sel = sameDay(d, selected);
              return (
                <button
                  key={+d}
                  onClick={() => onSelect(d)}
                  className="flex flex-col items-center gap-1 py-1"
                  aria-pressed={sel}
                  aria-label={d.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}
                >
                  <span
                    className="subhead tabular flex h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      background: sel ? (today ? "var(--danger)" : "var(--label)") : "transparent",
                      color: sel ? "var(--bg)" : today ? "var(--danger)" : inMonth ? "var(--label)" : "var(--label-3)",
                      fontWeight: today || sel ? 650 : 400,
                      transition: "background 150ms ease",
                    }}
                  >
                    {d.getDate()}
                  </span>
                  <span className="flex h-1.5 gap-[3px]">
                    {dots(d).map((o) => (
                      <span key={o.key} className="h-1.5 w-1.5 rounded-full" style={{ background: color(o.event.people[0]), opacity: inMonth ? 1 : 0.4 }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="mt-5 mb-2 flex items-end justify-between px-1">
        <h2 className="headline">{selected.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</h2>
        <button onClick={onNew} className="subhead font-semibold" style={{ color: "var(--tint)" }}>
          Termin hinzufügen
        </button>
      </div>
      <Card className="overflow-hidden">
        {list.length === 0 && (
          <p className="subhead px-4 py-4" style={{ color: "var(--label-2)" }}>
            Keine Termine an diesem Tag.
          </p>
        )}
        {list.map((o, i) => (
          <button
            key={o.key}
            onClick={() => onOpen(o)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
            style={{ borderTop: i ? "0.5px solid var(--separator)" : "none" }}
          >
            <span className="subhead tabular w-12 shrink-0 font-medium" style={{ color: "var(--label-2)" }}>
              {o.event.allDay ? "Ganzt." : fmtTime(o.start)}
            </span>
            <span className="flex h-9 w-1 shrink-0 flex-col overflow-hidden rounded-full">
              {(o.event.people.length ? o.event.people : [null]).map((id, k) => (
                <span key={k} className="flex-1" style={{ background: color(id) }} />
              ))}
            </span>
            <div className="min-w-0 flex-1">
              <p className="body truncate font-medium">{o.event.title}</p>
              <p className="footnote flex items-center gap-1.5 truncate" style={{ color: "var(--label-2)" }}>
                {o.event.allDay ? "Ganztägig" : `bis ${fmtTime(o.end)}`}
                {o.event.place ? `, ${o.event.place}` : ""}
                {o.recurring && <IconRepeat />}
              </p>
            </div>
            <AvatarStack ids={o.event.people.slice(0, 3)} size={20} />
          </button>
        ))}
      </Card>
    </div>
  );
}
