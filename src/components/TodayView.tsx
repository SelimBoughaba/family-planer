"use client";

import { useMemo, useState } from "react";
import { personById, todaysMeal, type CalEvent, type Task } from "@/lib/mock";
import { Avatar, AvatarStack, Card, ContextMenu, PersonFilter, SectionTitle, type MenuAction } from "./ui";
import { SwipeRow } from "./SwipeRow";
import { IconCheck, IconClock, IconPin, IconPlus, IconRepeat, IconTrash, IconPerson } from "./icons";

const time = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

function untilLabel(now: Date, start: Date) {
  const min = Math.round((start.getTime() - now.getTime()) / 60000);
  if (min <= 0) return "läuft";
  if (min < 60) return `in ${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `in ${h} Std. ${m} Min.` : `in ${h} Std.`;
}

/** Ring leert sich in den letzten zwei Stunden vor dem Termin */
function CountdownRing({ now, start, color }: { now: Date; start: Date; color: string }) {
  const window = 120;
  const min = Math.max(0, (start.getTime() - now.getTime()) / 60000);
  const frac = Math.min(min / window, 1);
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--separator)" strokeWidth="5" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform="rotate(-90 32 32)"
        style={{ transition: "stroke-dashoffset 800ms ease" }}
      />
      <text x="32" y="33" textAnchor="middle" fontSize="16" fontWeight="650" fill="var(--label)" className="tabular">
        {min < 60 ? Math.round(min) : Math.floor(min / 60)}
      </text>
      <text x="32" y="45" textAnchor="middle" fontSize="9.5" fontWeight="500" fill="var(--label-2)">
        {min < 60 ? "Min." : "Std."}
      </text>
    </svg>
  );
}

export function TodayView({
  now,
  events,
  tasks,
  setTasks,
  filter,
  setFilter,
  onAddMissing,
  missingAdded,
}: {
  now: Date;
  events: CalEvent[];
  tasks: Task[];
  setTasks: (fn: (t: Task[]) => Task[]) => void;
  filter: string | null;
  setFilter: (id: string | null) => void;
  onAddMissing: () => void;
  missingAdded: boolean;
}) {
  const [menu, setMenu] = useState<Task | null>(null);

  const visibleEvents = useMemo(
    () => events.filter((e) => !filter || e.people.includes(filter)).sort((a, b) => +a.start - +b.start),
    [events, filter],
  );
  const next = visibleEvents.find((e) => e.end > now);
  const visibleTasks = tasks.filter((t) => !filter || t.person === filter);
  const open = visibleTasks.filter((t) => !t.done);

  const toggle = (id: string) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id: string) => setTasks((ts) => ts.filter((t) => t.id !== id));
  const postpone = (id: string) => setTasks((ts) => ts.filter((t) => t.id !== id));

  const dateLabel = now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  const nowIndex = visibleEvents.findIndex((e) => e.start > now);

  const taskActions = (t: Task): MenuAction[] => [
    { label: t.done ? "Wieder öffnen" : "Erledigt", icon: <IconCheck size={18} />, onSelect: () => toggle(t.id) },
    { label: "Auf morgen", icon: <IconClock size={18} />, onSelect: () => postpone(t.id) },
    { label: "Jemand anderem geben", icon: <IconPerson size={18} />, onSelect: () => {} },
    { label: "Löschen", icon: <IconTrash size={18} />, destructive: true, onSelect: () => remove(t.id) },
  ];

  return (
    <div className="mx-auto max-w-md px-4 safe-top safe-bottom">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <p className="footnote font-medium" style={{ color: "var(--label-2)" }}>
            {dateLabel}
          </p>
          <h1 className="large-title">Heute</h1>
        </div>
        <button className="press glass flex h-11 w-11 items-center justify-center rounded-full" aria-label="Neuer Eintrag" style={{ color: "var(--tint)" }}>
          <IconPlus size={22} />
        </button>
      </header>

      <PersonFilter selected={filter} onToggle={(id) => setFilter(filter === id ? null : id)} />

      {next ? (
        <Card className="mt-5 p-4">
          <div className="flex items-center gap-4">
            <CountdownRing now={now} start={next.start} color={personById(next.people[0]).color} />
            <div className="min-w-0 flex-1">
              <p className="footnote font-semibold" style={{ color: personById(next.people[0]).color }}>
                Als Nächstes, {untilLabel(now, next.start)}
              </p>
              <p className="headline mt-0.5 truncate">{next.title}</p>
              <p className="subhead tabular mt-0.5" style={{ color: "var(--label-2)" }}>
                {time(next.start)} bis {time(next.end)}
              </p>
            </div>
            <AvatarStack ids={next.people} />
          </div>
          {next.place && (
            <p className="footnote mt-3 flex items-center gap-1.5 border-t pt-3" style={{ color: "var(--label-2)", borderColor: "var(--separator)" }}>
              <IconPin /> {next.place}
            </p>
          )}
        </Card>
      ) : (
        <Card className="mt-5 p-4">
          <p className="headline">Für heute steht nichts mehr an.</p>
          <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
            Neue Termine legst du über das Plus oben an.
          </p>
        </Card>
      )}

      <SectionTitle>Tagesablauf</SectionTitle>
      <Card className="px-4 py-1">
        {visibleEvents.length === 0 && (
          <p className="subhead py-4" style={{ color: "var(--label-2)" }}>
            Keine Termine für diese Person.
          </p>
        )}
        {visibleEvents.map((e, i) => {
          const past = e.end <= now;
          return (
            <div key={e.id}>
              {i === nowIndex && (
                <div className="relative my-1 flex items-center" aria-label="Jetzt">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />
                  <span className="h-px flex-1" style={{ background: "var(--danger)" }} />
                  <span className="caption tabular ml-2 font-semibold" style={{ color: "var(--danger)" }}>
                    {time(now)}
                  </span>
                </div>
              )}
              <div
                className="flex items-center gap-3 py-3"
                style={{ opacity: past ? 0.42 : 1, borderTop: i && i !== nowIndex ? "0.5px solid var(--separator)" : "none" }}
              >
                <span className="subhead tabular w-12 shrink-0 font-medium" style={{ color: "var(--label-2)" }}>
                  {time(e.start)}
                </span>
                <span className="flex h-9 w-1 shrink-0 flex-col overflow-hidden rounded-full">
                  {e.people.map((id) => (
                    <span key={id} className="flex-1" style={{ background: personById(id).color }} />
                  ))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="body truncate font-medium">{e.title}</p>
                  {e.place && (
                    <p className="footnote truncate" style={{ color: "var(--label-2)" }}>
                      {e.place}
                    </p>
                  )}
                </div>
                <AvatarStack ids={e.people.slice(0, 3)} size={20} />
              </div>
            </div>
          );
        })}
      </Card>

      <SectionTitle
        trailing={
          <span className="subhead tabular" style={{ color: "var(--label-2)" }}>
            {open.length} offen
          </span>
        }
      >
        Aufgaben
      </SectionTitle>
      <Card className="overflow-hidden">
        {visibleTasks.map((t, i) => (
          <SwipeRow
            key={t.id}
            leading={{ label: t.done ? "Öffnen" : "Erledigt", color: "var(--success)", icon: <IconCheck size={18} />, onTrigger: () => toggle(t.id) }}
            trailing={{ label: "Morgen", color: "#FF9F0A", icon: <IconClock size={18} />, onTrigger: () => postpone(t.id) }}
            onLongPress={() => setMenu(t)}
          >
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? "0.5px solid var(--separator)" : "none" }}>
              <button
                onClick={() => toggle(t.id)}
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full"
                style={{
                  border: t.done ? "none" : `1.6px solid ${personById(t.person).color}`,
                  background: t.done ? personById(t.person).color : "transparent",
                  color: "white",
                }}
                aria-label={t.done ? "Als offen markieren" : "Als erledigt markieren"}
              >
                {t.done && <IconCheck size={14} className="check-pop" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="body truncate" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--label-3)" : "var(--label)" }}>
                  {t.title}
                </p>
                <p className="footnote flex items-center gap-1.5" style={{ color: "var(--label-2)" }}>
                  {t.area}
                  {t.recurring && (
                    <span className="flex items-center gap-1">
                      <IconRepeat /> {t.recurring}
                    </span>
                  )}
                </p>
              </div>
              <Avatar person={personById(t.person)} size={24} />
            </div>
          </SwipeRow>
        ))}
      </Card>
      <p className="caption mt-2 px-1" style={{ color: "var(--label-3)" }}>
        Nach rechts wischen erledigt, nach links verschiebt auf morgen, lange drücken zeigt mehr.
      </p>

      <SectionTitle>Heute gibt es</SectionTitle>
      <Card className="flex items-center gap-4 p-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] text-3xl"
          style={{ background: "linear-gradient(150deg, #FFE08A, #FFB347)" }}
          aria-hidden
        >
          🍋
        </div>
        <div className="min-w-0 flex-1">
          <p className="headline truncate">{todaysMeal.title}</p>
          <p className="subhead" style={{ color: "var(--label-2)" }}>
            {todaysMeal.minutes} Min., kocht {personById(todaysMeal.cook).name}
          </p>
          <button
            onClick={onAddMissing}
            disabled={missingAdded}
            className="press subhead mt-2 rounded-full px-3 py-1 font-semibold"
            style={{
              background: missingAdded ? "transparent" : "color-mix(in oklab, var(--tint) 14%, transparent)",
              color: missingAdded ? "var(--success)" : "var(--tint)",
              paddingLeft: missingAdded ? 0 : undefined,
            }}
          >
            {missingAdded ? "Steht auf der Einkaufsliste" : `${todaysMeal.missing} fehlende Zutaten auf die Liste`}
          </button>
        </div>
      </Card>

      <ContextMenu
        open={!!menu}
        onClose={() => setMenu(null)}
        actions={menu ? taskActions(menu) : []}
        preview={
          menu && (
            <div className="flex items-center gap-3">
              <Avatar person={personById(menu.person)} size={36} />
              <div>
                <p className="headline">{menu.title}</p>
                <p className="footnote" style={{ color: "var(--label-2)" }}>
                  {menu.area}, zuständig: {personById(menu.person).name}
                </p>
              </div>
            </div>
          )
        }
      />
    </div>
  );
}
