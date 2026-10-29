"use client";

import { useMemo, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { localDay, recurrenceLabel, type Task } from "@/lib/types";
import { addDays, occurrences, startOfDay, type Occurrence } from "@/lib/recurrence";
import { recipeEmoji } from "@/lib/recipes";
import { Avatar, AvatarStack, Card, ContextMenu, PersonFilter, SectionTitle, type MenuAction } from "./ui";
import { SwipeRow } from "./SwipeRow";
import { IconCheck, IconClock, IconPin, IconPlus, IconRepeat, IconTrash, IconPerson } from "./icons";

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
  const r = 26;
  const c = 2 * Math.PI * r;
  const big = min >= 60;
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
      {min > 0 && min < 24 * 60 ? (
        <>
          <text x="32" y="33" textAnchor="middle" fontSize="16" fontWeight="650" fill="var(--label)" className="tabular">
            {big ? Math.round(min / 60) : Math.round(min)}
          </text>
          <text x="32" y="45" textAnchor="middle" fontSize="9.5" fontWeight="500" fill="var(--label-2)">
            {big ? "Std." : "Min."}
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
  onProfile,
  onOpenEvent,
  onOpenFood,
}: {
  now: Date;
  filter: string | null;
  setFilter: (id: string | null) => void;
  onNew: () => void;
  onProfile: () => void;
  onOpenEvent: (o: Occurrence) => void;
  onOpenFood: () => void;
}) {
  const { state, run, person, color, me } = useFamily();
  const [menu, setMenu] = useState<Task | null>(null);
  const [assign, setAssign] = useState<Task | null>(null);
  const today = localDay(now);

  const dayStart = +startOfDay(now);
  const occ = useMemo(() => occurrences(state?.events ?? [], new Date(dayStart), addDays(new Date(dayStart), 14), filter), [state?.events, dayStart, filter]);
  const todays = occ.filter((o) => +o.start < dayStart + 86400000);
  const next = occ.find((o) => o.end > now && !(o.event.allDay && o.start <= now));

  const tasks = (state?.tasks ?? []).filter(
    (t) => (!filter || t.personId === filter) && (t.done ? t.doneAt && localDay(new Date(t.doneAt)) === today : !t.due || t.due <= today),
  );
  const open = tasks.filter((t) => !t.done);

  const toggle = (t: Task) => run({ op: "task.toggle", id: t.id, done: !t.done, today });
  const postpone = (t: Task) => run({ op: "task.postpone", id: t.id, today });
  const remove = (t: Task) => run({ op: "task.delete", id: t.id });

  const dateLabel = now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  const nowIndex = todays.findIndex((o) => o.start > now);

  const taskActions = (t: Task): MenuAction[] => [
    { label: t.done ? "Wieder öffnen" : "Erledigt", icon: <IconCheck size={18} />, onSelect: () => toggle(t) },
    ...(t.done ? [] : [{ label: "Auf morgen", icon: <IconClock size={18} />, onSelect: () => postpone(t) }]),
    { label: "Jemand anderem geben", icon: <IconPerson size={18} />, onSelect: () => setTimeout(() => setAssign(t), 50) },
    { label: "Löschen", icon: <IconTrash size={18} />, destructive: true, onSelect: () => remove(t) },
  ];

  return (
    <div className="mx-auto max-w-md px-4 safe-top safe-bottom">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="footnote font-medium" style={{ color: "var(--label-2)" }}>
            {dateLabel}
          </p>
          <h1 className="large-title">Heute</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onProfile} className="press rounded-full" aria-label="Profil">
            <Avatar person={me ?? undefined} size={44} />
          </button>
          <button onClick={onNew} className="press glass flex h-11 w-11 items-center justify-center rounded-full" aria-label="Neuer Eintrag" style={{ color: "var(--tint)" }}>
            <IconPlus size={22} />
          </button>
        </div>
      </header>

      <PersonFilter selected={filter} onToggle={(id) => setFilter(filter === id ? null : id)} />

      {next ? (
        <Card className="mt-5 p-4">
          <button onClick={() => onOpenEvent(next)} className="flex w-full items-center gap-4 text-left">
            <CountdownRing now={now} start={next.start} color={color(next.event.people[0])} />
            <div className="min-w-0 flex-1">
              <p className="footnote font-semibold" style={{ color: color(next.event.people[0]) }}>
                Als Nächstes, {untilLabel(now, next.start)}
              </p>
              <p className="headline mt-0.5 truncate">{next.event.title}</p>
              <p className="subhead tabular mt-0.5" style={{ color: "var(--label-2)" }}>
                {next.event.allDay ? "Ganztägig" : `${next.start.toLocaleDateString("de-DE") === now.toLocaleDateString("de-DE") ? "" : `${next.start.toLocaleDateString("de-DE", { weekday: "short" })}, `}${time(next.start)} bis ${time(next.end)}`}
              </p>
            </div>
            <AvatarStack ids={next.event.people.slice(0, 3)} />
          </button>
          {next.event.place && (
            <p className="footnote mt-3 flex items-center gap-1.5 border-t pt-3" style={{ color: "var(--label-2)", borderColor: "var(--separator)" }}>
              <IconPin /> {next.event.place}
            </p>
          )}
        </Card>
      ) : (
        <Card className="mt-5 p-4">
          <p className="headline">Keine anstehenden Termine.</p>
          <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
            Über das Plus oben legst du einen Termin oder eine Aufgabe an.
          </p>
        </Card>
      )}

      {todays.length > 0 && (
        <>
          <SectionTitle>Tagesablauf</SectionTitle>
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
                    className="flex w-full items-center gap-3 py-3 text-left"
                    style={{ opacity: past ? 0.42 : 1, borderTop: i && i !== nowIndex ? "0.5px solid var(--separator)" : "none" }}
                  >
                    <span className="subhead tabular w-12 shrink-0 font-medium" style={{ color: "var(--label-2)" }}>
                      {e.allDay ? "Ganzt." : time(o.start)}
                    </span>
                    <span className="flex h-9 w-1 shrink-0 flex-col overflow-hidden rounded-full">
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
            Für heute ist nichts zu tun.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {tasks.map((t, i) => {
            const c = color(t.personId);
            return (
              <SwipeRow
                key={t.id}
                leading={{ label: t.done ? "Öffnen" : "Erledigt", color: "var(--success)", icon: <IconCheck size={18} />, onTrigger: () => toggle(t) }}
                trailing={t.done ? undefined : { label: "Morgen", color: "#FF9F0A", icon: <IconClock size={18} />, onTrigger: () => postpone(t) }}
                onLongPress={() => setMenu(t)}
              >
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? "0.5px solid var(--separator)" : "none" }}>
                  <button
                    onClick={() => toggle(t)}
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full"
                    style={{ border: t.done ? "none" : `1.6px solid ${c}`, background: t.done ? c : "transparent", color: "white" }}
                    aria-label={t.done ? "Als offen markieren" : "Als erledigt markieren"}
                  >
                    {t.done && <IconCheck size={14} className="check-pop" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="body truncate" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--label-3)" : "var(--label)" }}>
                      {t.title}
                    </p>
                    <p className="footnote flex items-center gap-1.5" style={{ color: t.due && t.due < today && !t.done ? "var(--danger)" : "var(--label-2)" }}>
                      {t.due && t.due < today && !t.done ? "Überfällig" : t.area}
                      {t.recurring && (
                        <span className="flex items-center gap-1" style={{ color: "var(--label-2)" }}>
                          <IconRepeat /> {recurrenceLabel[t.recurring]}
                        </span>
                      )}
                    </p>
                  </div>
                  <Avatar person={person(t.personId)} size={24} />
                </div>
              </SwipeRow>
            );
          })}
        </Card>
      )}
      <p className="caption mt-2 px-1" style={{ color: "var(--label-3)" }}>
        Nach rechts wischen erledigt, nach links verschiebt auf morgen, lange drücken zeigt mehr.
      </p>

      {(() => {
        const meal = state?.meals.find((m) => m.day === today);
        const recipe = meal?.recipeId ? state?.recipes.find((r) => r.id === meal.recipeId) : null;
        return (
          <>
            <SectionTitle>Heute gibt es</SectionTitle>
            <Card className="p-0">
              <button onClick={onOpenFood} className="flex w-full items-center gap-4 p-4 text-left">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] text-3xl"
                  style={{ background: "linear-gradient(150deg, #FFE08A, #FFB347)" }}
                  aria-hidden
                >
                  {meal ? recipeEmoji(meal.title, recipe?.tags) : "🤔"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="headline block truncate">{meal ? meal.title : "Noch nichts geplant"}</span>
                  <span className="subhead block" style={{ color: "var(--label-2)" }}>
                    {meal
                      ? [recipe?.minutes ? `${recipe.minutes} Min.` : null, person(meal.cook) ? `kocht ${person(meal.cook)!.name}` : null].filter(Boolean).join(", ") || "Im Wochenplan ansehen"
                      : state?.ai.enabled
                        ? "Tippen für Vorschläge"
                        : "Tippen zum Planen"}
                  </span>
                </span>
              </button>
            </Card>
          </>
        );
      })()}

      <ContextMenu
        open={!!menu}
        onClose={() => setMenu(null)}
        actions={menu ? taskActions(menu) : []}
        preview={
          menu && (
            <div className="flex items-center gap-3">
              <Avatar person={person(menu.personId)} size={36} />
              <div className="min-w-0">
                <p className="headline">{menu.title}</p>
                <p className="footnote" style={{ color: "var(--label-2)" }}>
                  {menu.area}
                  {person(menu.personId) ? `, zuständig: ${person(menu.personId)!.name}` : ", noch niemand zuständig"}
                </p>
              </div>
            </div>
          )
        }
      />
      <ContextMenu
        open={!!assign}
        onClose={() => setAssign(null)}
        preview={assign && <p className="headline">Wer übernimmt „{assign.title}“?</p>}
        actions={
          assign
            ? [
                ...(state?.people ?? []).map((p) => ({
                  label: p.name,
                  icon: <Avatar person={p} size={22} />,
                  onSelect: () => run({ op: "task.assign", id: assign.id, personId: p.id }),
                })),
                { label: "Niemand", onSelect: () => run({ op: "task.assign", id: assign.id, personId: null }) },
              ]
            : []
        }
      />
    </div>
  );
}
