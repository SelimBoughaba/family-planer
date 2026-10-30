"use client";

import { useMemo, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { localDay, type Task } from "@/lib/types";
import { addDays, occurrences, startOfDay, type Occurrence } from "@/lib/recurrence";
import { recipeEmoji } from "@/lib/recipes";
import { AnimatePresence, Avatar, AvatarStack, Card, ListItem, PersonFilter, SectionTitle, useLongPress } from "./ui";
import { TaskRow, useAssignDrop, useTaskMenus } from "./TaskRow";
import { BoardTile } from "./board/BoardTile";
import { CountdownStack } from "./CountdownStack";
import { AttendanceRow, MaybeHint, eatersLabel, usePresence } from "./food/Attendance";
import { IconPin, IconPlus } from "./icons";

const time = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

function untilLabel(now: Date, start: Date) {
  const min = Math.round((start.getTime() - now.getTime()) / 60000);
  if (min <= 0) return "läuft gerade";
  if (min < 60) return `in ${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 24) return `am ${start.toLocaleDateString("de-DE", { weekday: "long" })}`;
  return m ? `in ${h} Std. ${m} Min.` : `in ${h} Std.`;
}

/** Ring leert sich in den letzten zwei Stunden vor dem Termin */
function CountdownRing({ now, start, color }: { now: Date; start: Date; color: string }) {
  const min = Math.max(0, (start.getTime() - now.getTime()) / 60000);
  const frac = Math.min(min / 120, 1);
  const r = 25;
  const c = 2 * Math.PI * r;
  const big = min >= 60;
  return (
    <svg width="60" height="60" viewBox="2 2 60 60" className="shrink-0" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--fill)" strokeWidth="5" />
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
        style={{ transition: "stroke-dashoffset 400ms var(--ease-out)" }}
      />
      {min > 0 && min < 24 * 60 ? (
        <>
          <text x="32" y="36.5" textAnchor="middle" fontSize="13" fontWeight="700" fill={color} className="tabular">
            {big ? `${Math.floor(Math.round(min) / 60)}:${String(Math.round(min) % 60).padStart(2, "0")}` : `${Math.round(min)} m`}
          </text>
        </>
      ) : (
        <text x="32" y="37" textAnchor="middle" fontSize="11" fontWeight="600" fill={color}>
          {min <= 0 ? "jetzt" : "bald"}
        </text>
      )}
    </svg>
  );
}

export function TodayView({
  now,
  filter,
  setFilter,
  onNew,
  onQuick,
  onProfile,
  onOpenEvent,
  onOpenFood,
  onEditTask,
  onOpenBoard,
  onVault,
}: {
  now: Date;
  filter: string | null;
  setFilter: (id: string | null) => void;
  onNew: () => void;
  onQuick: () => void;
  onProfile: () => void;
  onOpenEvent: (o: Occurrence) => void;
  onOpenFood: () => void;
  onEditTask: (t: Task) => void;
  onOpenBoard: (boardId: string) => void;
  /** lang auf „Heute“ drücken öffnet den Tresor */
  onVault: () => void;
}) {
  const { state, person, color, me } = useFamily();
  const plusPress = useLongPress(onQuick, onNew);
  const titlePress = useLongPress(onVault, () => {}, 650);
  const assignDrop = useAssignDrop();
  const { openMenu, menus } = useTaskMenus(onEditTask);
  const today = localDay(now);

  const dayStart = +startOfDay(now);
  const occ = useMemo(() => occurrences(state?.events ?? [], new Date(dayStart), addDays(new Date(dayStart), 14), filter), [state?.events, dayStart, filter]);
  const next = occ.find((o) => o.end > now && !(o.event.allDay && o.start <= now));

  // Wochenstreifen: gewählter Tag (0 = heute)
  const [sel, setSel] = useState(0);
  const strip = useMemo(() => Array.from({ length: 14 }, (_, k) => addDays(new Date(dayStart), k)), [dayStart]);
  const selStart = strip[sel];
  const selEnd = addDays(selStart, 1);
  const selDay = localDay(selStart);
  const presence = usePresence(selDay);
  const todays = occ.filter((o) => o.start < selEnd && o.end > selStart && (sel > 0 || +o.start < dayStart + 86400000));

  // Heute: fällige und überfällige, dazu heute Erledigtes; „Irgendwann“ steht im Aufgaben-Tab. Andere Tage: was dann fällig ist
  const tasks = (state?.tasks ?? [])
    .filter((t) =>
      !filter || t.personId === filter || (!t.personId && !t.done)
        ? sel === 0
          ? t.done
            ? !!t.doneAt && localDay(new Date(t.doneAt)) === today
            : !!t.due && t.due <= today
          : !t.done && t.due === selDay
        : false,
    )
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? "").localeCompare(b.due ?? ""));
  const open = tasks.filter((t) => !t.done);
  const doneToday = tasks.filter((t) => t.done);
  const [showDone, setShowDone] = useState(false);
  // Erledigtes klappt zusammen, sonst wächst die Liste über den Tag
  const visible = showDone || doneToday.length <= 2 ? tasks : open;

  const dateLabel = now.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const nowIndex = sel === 0 ? todays.findIndex((o) => o.start > now) : -1;
  const selLabel = selStart.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-md px-4 safe-top safe-bottom">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="footnote font-medium" style={{ color: "var(--label-2)" }}>
            {dateLabel}
          </p>
          <h1 {...titlePress} className="large-title select-none" style={{ WebkitTouchCallout: "none" }}>
            Heute
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onProfile} className="press rounded-full" aria-label="Profil">
            <Avatar person={me ?? undefined} size={40} />
          </button>
          <button
            {...plusPress}
            className="press glass glass-strong flex h-10 w-10 items-center justify-center rounded-full select-none"
            aria-label="Neuer Eintrag"
            style={{ color: "var(--tint)" }}
          >
            <IconPlus size={20} />
          </button>
        </div>
      </header>

      <PersonFilter selected={filter} onToggle={(id) => setFilter(filter === id ? null : id)} onDrop={assignDrop} />

      <CountdownStack onOpen={onOpenEvent} />

      <div className="no-scrollbar -mx-4 mt-4 flex gap-1 overflow-x-auto px-4" role="tablist" aria-label="Tage">
        {strip.map((d, k) => {
          const on = k === sel;
          const end = addDays(d, 1);
          const ids = [...new Set(occ.filter((o) => o.start < end && o.end > d).flatMap((o) => (o.event.people.length ? o.event.people : [null])))].slice(0, 3);
          return (
            <button
              key={k}
              role="tab"
              aria-selected={on}
              onClick={() => setSel(k)}
              className="press flex w-[46px] shrink-0 flex-col items-center gap-1 rounded-[14px] py-2"
              style={{
                background: on ? "var(--label)" : "transparent",
                color: on ? "var(--bg)" : "var(--label)",
                transition: "background-color 180ms ease, color 180ms ease",
              }}
            >
              <span className="caption font-semibold" style={{ opacity: on ? 0.8 : 0.55 }}>
                {k === 0 ? "Heute" : d.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "")}
              </span>
              <span className="headline tabular leading-none">{d.getDate()}</span>
              <span className="flex h-1 items-center gap-[3px]">
                {ids.map((id, i) => (
                  <span key={i} className="h-1 w-1 rounded-full" style={{ background: on ? "var(--bg)" : color(id) }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {next ? (
        <Card className="mt-4 p-4">
          <span
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${color(next.event.people[0])} 14%, transparent), transparent 70%)` }}
            aria-hidden
          />
          <button onClick={() => onOpenEvent(next)} className="relative flex w-full items-center gap-3.5 text-left">
            <CountdownRing now={now} start={next.start} color={color(next.event.people[0])} />
            <div className="min-w-0 flex-1">
              <p className="footnote font-semibold" style={{ color: color(next.event.people[0]) }}>
                Als Nächstes, {untilLabel(now, next.start)}
              </p>
              <p className="mt-0.5 truncate text-[20px] leading-[25px] font-semibold tracking-[-0.015em]">{next.event.title}</p>
              <p className="subhead tabular mt-0.5" style={{ color: "var(--label-2)" }}>
                {next.event.allDay
                  ? "Ganztägig"
                  : `${next.start.toLocaleDateString("de-DE") === now.toLocaleDateString("de-DE") ? "" : `${next.start.toLocaleDateString("de-DE", { weekday: "short" })}, `}${time(next.start)} bis ${time(next.end)}`}
              </p>
            </div>
            <AvatarStack ids={next.event.people.slice(0, 3)} />
          </button>
          {next.event.place && (
            <p
              className="footnote relative mt-3 flex items-center gap-1.5 border-t pt-3"
              style={{
                color: "var(--label-2)",
                borderColor: "var(--separator)",
              }}
            >
              <IconPin /> {next.event.place}
            </p>
          )}
        </Card>
      ) : (
        <Card className="mt-4 p-4">
          <p className="headline">Keine anstehenden Termine.</p>
          <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
            Über das Plus oben legst du einen Termin oder eine Aufgabe an.
          </p>
        </Card>
      )}

      {sel > 0 && todays.length === 0 && (
        <>
          <SectionTitle>{selLabel}</SectionTitle>
          <Card className="p-4">
            <p className="subhead" style={{ color: "var(--label-2)" }}>
              Keine Termine an diesem Tag.
            </p>
          </Card>
        </>
      )}
      {todays.length > 0 && (
        <>
          <SectionTitle trailing={<span style={{ color: "var(--label-2)" }}>{todays.length === 1 ? "1 Termin" : `${todays.length} Termine`}</span>}>
            {sel === 0 ? "Tagesablauf" : selLabel}
          </SectionTitle>
          <Card className="px-4 py-1">
            {todays.map((o, i) => {
              const e = o.event;
              const past = o.end <= now;
              return (
                <div key={o.key}>
                  {i === nowIndex && (
                    <div className="relative my-1 flex items-center" aria-label="Jetzt">
                      <span className="h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />
                      <span className="h-px flex-1" style={{ background: "var(--danger)" }} />
                      <span className="caption tabular ml-2 font-semibold" style={{ color: "var(--danger)" }}>
                        {time(now)}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => onOpenEvent(o)}
                    className="row-press -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 px-4 py-3 text-left"
                    style={{
                      opacity: past ? 0.42 : 1,
                      borderTop: i && i !== nowIndex ? "0.5px solid var(--separator)" : "none",
                    }}
                  >
                    <span className="subhead tabular w-12 shrink-0 font-medium" style={{ color: "var(--label-2)" }}>
                      {e.allDay ? "Ganzt." : time(o.start)}
                    </span>
                    <span className="flex h-9 w-[3px] shrink-0 flex-col overflow-hidden rounded-full">
                      {(e.people.length ? e.people : [null]).map((id, k) => (
                        <span key={k} className="flex-1" style={{ background: color(id) }} />
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
                  </button>
                </div>
              );
            })}
          </Card>
        </>
      )}

      <SectionTitle
        trailing={
          <span className="subhead tabular" style={{ color: "var(--label-2)" }}>
            {open.length ? `${open.length} offen` : "alles erledigt"}
          </span>
        }
      >
        Aufgaben
      </SectionTitle>
      {tasks.length === 0 ? (
        <Card className="p-4">
          <p className="subhead" style={{ color: "var(--label-2)" }}>
            {sel === 0 ? "Für heute ist nichts zu tun." : "An diesem Tag ist nichts fällig."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <AnimatePresence initial={false}>
            {visible.map((t, i) => (
              <ListItem key={t.id}>
                <TaskRow task={t} first={i === 0} today={today} onEdit={onEditTask} onMenu={openMenu} />
              </ListItem>
            ))}
          </AnimatePresence>
          {doneToday.length > 2 && (
            <button
              onClick={() => setShowDone((v) => !v)}
              className="subhead flex w-full items-center justify-between px-4 py-3 text-left"
              style={{ borderTop: visible.length ? "0.5px solid var(--separator)" : "none", color: "var(--label-2)" }}
              aria-expanded={showDone}
            >
              <span>{doneToday.length} heute erledigt</span>
              <span style={{ color: "var(--tint)" }}>{showDone ? "Ausblenden" : "Zeigen"}</span>
            </button>
          )}
        </Card>
      )}
      <p className="caption mt-2 px-1" style={{ color: "var(--label-3)" }}>
        Nach rechts wischen erledigt, nach links auf morgen. Lange drücken zeigt mehr.
      </p>

      {(() => {
        const meal = state?.meals.find((m) => m.day === selDay);
        const recipe = meal?.recipeId ? state?.recipes.find((r) => r.id === meal.recipeId) : null;
        return (
          <>
            <SectionTitle>{sel === 0 ? "Heute gibt es" : sel === 1 ? "Morgen gibt es" : `Am ${selStart.toLocaleDateString("de-DE", { weekday: "long" })} gibt es`}</SectionTitle>
            <Card className="p-0">
              <button onClick={onOpenFood} className="flex w-full items-center gap-4 p-4 text-left">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-[26px]" style={{ background: "var(--fill)" }} aria-hidden>
                  {meal ? recipeEmoji(meal.title, recipe?.tags) : "🤔"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="headline block truncate">{meal ? meal.title : "Noch nichts geplant"}</span>
                  <span className="subhead block" style={{ color: "var(--label-2)" }}>
                    {meal
                      ? [recipe?.minutes ? `${recipe.minutes} Min.` : null, person(meal.cook) ? `kocht ${person(meal.cook)!.name}` : null].filter(Boolean).join(", ") ||
                        "Im Wochenplan ansehen"
                      : state?.ai.enabled
                        ? "Tippen für Vorschläge"
                        : "Tippen zum Planen"}
                  </span>
                </span>
              </button>
              <div className="border-t px-4 pt-3 pb-3.5" style={{ borderColor: "var(--separator)" }}>
                <div className="flex items-center justify-between gap-3">
                  <AttendanceRow day={selDay} size={30} />
                  <span className="footnote shrink-0 font-semibold" style={{ color: "var(--label-2)" }}>
                    {eatersLabel(presence)}
                  </span>
                </div>
                <MaybeHint day={selDay} />
              </div>
            </Card>
          </>
        );
      })()}

      <BoardTile onOpen={onOpenBoard} />

      {menus}
    </div>
  );
}
