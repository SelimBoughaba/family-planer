"use client";

import { useState } from "react";
import { useFamily } from "@/lib/client/family";
import { localDay, recurrenceLabel, type Task } from "@/lib/types";
import { Avatar, Card, PersonFilter, SectionTitle, useLongPress } from "./ui";
import { TaskRow, dueLabel, useAssignDrop, useTaskMenus } from "./TaskRow";
import { IconPlus } from "./icons";

type Mode = "zeit" | "bereich" | "dienstplan";

const modes: { id: Mode; label: string }[] = [
  { id: "zeit", label: "Nach Zeit" },
  { id: "bereich", label: "Nach Bereich" },
  { id: "dienstplan", label: "Dienstplan" },
];

function addDaysStr(day: string, n: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

export function TasksView({
  filter,
  setFilter,
  onNew,
  onQuick,
  onEdit,
}: {
  filter: string | null;
  setFilter: (id: string | null) => void;
  onNew: () => void;
  onQuick: () => void;
  onEdit: (t: Task) => void;
}) {
  const { state, person, color } = useFamily();
  const plusPress = useLongPress(onQuick, onNew);
  const assignDrop = useAssignDrop();
  const [mode, setMode] = useState<Mode>("zeit");
  const [showDone, setShowDone] = useState(false);
  const { openMenu, menus } = useTaskMenus(onEdit);
  const today = localDay();

  const all = state?.tasks ?? [];
  const mine = all.filter((t) => !filter || t.personId === filter);
  const open = mine.filter((t) => !t.done).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title));
  const done = mine.filter((t) => t.done).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));

  const groups = (() => {
    if (mode === "bereich") {
      const order = [...(state?.lists.areas ?? []), ...new Set(open.map((t) => t.area))];
      return [...new Set(order)].map((a) => ({ title: a, items: open.filter((t) => t.area === a) })).filter((g) => g.items.length);
    }
    const tomorrow = addDaysStr(today, 1);
    const week = addDaysStr(today, 7);
    const buckets: { title: string; test: (t: Task) => boolean }[] = [
      { title: "Überfällig", test: (t) => !!t.due && t.due < today },
      { title: "Heute", test: (t) => t.due === today },
      { title: "Morgen", test: (t) => t.due === tomorrow },
      {
        title: "Nächste 7 Tage",
        test: (t) => !!t.due && t.due > tomorrow && t.due <= week,
      },
      { title: "Später", test: (t) => !!t.due && t.due > week },
      { title: "Irgendwann", test: (t) => !t.due },
    ];
    return buckets.map((b) => ({ title: b.title, items: open.filter(b.test) })).filter((g) => g.items.length);
  })();

  const rotations = open.filter((t) => t.rotation.length >= 2 && t.recurring);
  // erledigte Aufgaben der letzten sieben Tage pro Person, als kleine Balken
  const tally = (() => {
    const people = state?.people ?? [];
    const counts = people.map((p) => ({
      p,
      n: all.filter((t) => t.done && t.personId === p.id).length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.n));
    return { counts, max };
  })();

  const overdue = open.filter((t) => t.due && t.due < today).length;

  return (
    <div className="mx-auto max-w-md px-4 safe-top safe-bottom">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="footnote font-medium" style={{ color: overdue ? "var(--danger)" : "var(--label-2)" }}>
            {open.length ? `${open.length} offen${overdue ? `, ${overdue} überfällig` : ""}` : "Alles erledigt"}
          </p>
          <h1 className="large-title">Aufgaben</h1>
        </div>
        <button
          {...plusPress}
          className="press glass flex h-11 w-11 items-center justify-center rounded-full select-none"
          aria-label="Neue Aufgabe"
          style={{ color: "var(--tint)" }}
        >
          <IconPlus size={22} />
        </button>
      </header>

      <PersonFilter selected={filter} onToggle={(id) => setFilter(filter === id ? null : id)} onDrop={assignDrop} />

      <div
        className="relative mt-4 flex rounded-[10px] p-[2px]"
        style={{
          background: "color-mix(in oklab, var(--label) 8%, transparent)",
        }}
      >
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
          <button key={m.id} onClick={() => setMode(m.id)} className="footnote relative flex-1 py-1.5 font-semibold" aria-pressed={mode === m.id}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === "dienstplan" ? (
        <>
          {rotations.length === 0 ? (
            <Card className="mt-5 p-5 text-center">
              <p className="headline">Noch kein Dienstplan</p>
              <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
                Leg eine wiederkehrende Aufgabe an, etwa Müll rausbringen jede Woche, und schalte „Reihum“ ein. Wer abhakt, gibt an die nächste Person weiter.
              </p>
              <button onClick={onNew} className="press subhead mt-4 rounded-full px-4 py-2 font-semibold text-white" style={{ background: "var(--tint)" }}>
                Dienst anlegen
              </button>
            </Card>
          ) : (
            <div className="mt-5 flex flex-col gap-3">
              {rotations.map((t) => {
                const k = t.rotation.indexOf(t.personId ?? "");
                const order = t.rotation.map((_, i) => t.rotation[(Math.max(k, 0) + i) % t.rotation.length]);
                return (
                  <button
                    key={t.id}
                    onClick={() => onEdit(t)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openMenu(t);
                    }}
                    className="press glass rounded-[20px] p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="headline truncate">{t.title}</p>
                        <p
                          className="footnote"
                          style={{
                            color: t.due && t.due < today ? "var(--danger)" : "var(--label-2)",
                          }}
                        >
                          {[dueLabel(t.due, today), t.recurring ? recurrenceLabel[t.recurring] : null, t.area].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      <span
                        className="caption shrink-0 rounded-full px-2 py-0.5 font-semibold"
                        style={{
                          background: `color-mix(in oklab, ${color(t.personId)} 18%, transparent)`,
                          color: color(t.personId),
                        }}
                      >
                        {person(t.personId)?.name ?? "?"} ist dran
                      </span>
                    </div>
                    <div className="mt-3 flex items-start gap-1">
                      {order.map((id, i) => (
                        <span key={id} className="flex items-start gap-1">
                          {i > 0 && <span className="mt-[14px] h-px w-3" style={{ background: "var(--separator)" }} aria-hidden />}
                          <span className="flex w-[60px] flex-col items-center gap-1" style={{ opacity: i === 0 ? 1 : 0.6 }}>
                            <Avatar person={person(id)} size={i === 0 ? 30 : 26} />
                            <span
                              className="caption max-w-full truncate"
                              style={{
                                color: i === 0 ? "var(--label)" : "var(--label-2)",
                                fontWeight: i === 0 ? 600 : 400,
                              }}
                            >
                              {person(id)?.name}
                            </span>
                          </span>
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <SectionTitle>Letzte 7 Tage</SectionTitle>
          <Card className="p-4">
            <div className="flex items-end justify-between gap-2" style={{ height: 96 }}>
              {tally.counts.map(({ p, n }) => (
                <div key={p.id} className="flex flex-1 flex-col items-center justify-end gap-1.5" style={{ height: "100%" }}>
                  <span className="caption tabular font-semibold">{n}</span>
                  <span
                    className="w-full max-w-[28px] rounded-[7px]"
                    style={{
                      height: `${Math.max(6, (n / tally.max) * 56)}px`,
                      background: color(p.id),
                      opacity: n ? 1 : 0.25,
                      transition: "height 400ms ease",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between gap-2">
              {tally.counts.map(({ p }) => (
                <span key={p.id} className="caption flex-1 truncate text-center" style={{ color: "var(--label-2)" }}>
                  {p.name}
                </span>
              ))}
            </div>
          </Card>
          <p className="caption mt-2 px-1" style={{ color: "var(--label-3)" }}>
            Erledigte Aufgaben pro Person, gezählt bei der Person, die zuständig war.
          </p>
        </>
      ) : (
        <>
          {groups.length === 0 && (
            <Card className="mt-5 p-5 text-center">
              <p className="headline">{filter ? `${person(filter)?.name ?? "Hier"} hat nichts offen` : "Nichts offen"}</p>
              <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
                Über das Plus legst du eine Aufgabe an.
              </p>
            </Card>
          )}
          {groups.map((g) => (
            <section key={g.title}>
              <SectionTitle
                trailing={
                  <span className="subhead tabular" style={{ color: "var(--label-2)" }}>
                    {g.items.length}
                  </span>
                }
              >
                <span
                  style={{
                    color: g.title === "Überfällig" ? "var(--danger)" : undefined,
                  }}
                >
                  {g.title}
                </span>
              </SectionTitle>
              <Card className="overflow-hidden">
                {g.items.map((t, i) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    first={i === 0}
                    today={today}
                    onEdit={onEdit}
                    onMenu={openMenu}
                    showDue={mode === "bereich" || g.title === "Nächste 7 Tage" || g.title === "Später"}
                    showArea={mode !== "bereich"}
                  />
                ))}
              </Card>
            </section>
          ))}

          {done.length > 0 && (
            <>
              <button onClick={() => setShowDone((v) => !v)} className="mt-7 mb-2.5 flex w-full items-end justify-between px-1" aria-expanded={showDone}>
                <span className="title-2">Erledigt</span>
                <span className="subhead" style={{ color: "var(--tint)" }}>
                  {showDone ? "Ausblenden" : `${done.length} zeigen`}
                </span>
              </button>
              {showDone && (
                <Card className="overflow-hidden">
                  {done.map((t, i) => (
                    <TaskRow key={t.id} task={t} first={i === 0} today={today} onEdit={onEdit} onMenu={openMenu} />
                  ))}
                </Card>
              )}
            </>
          )}
          <p className="caption mt-2 px-1" style={{ color: "var(--label-3)" }}>
            Nach rechts wischen erledigt, nach links verschiebt auf morgen, antippen bearbeitet, lange drücken zeigt mehr. Ein Profilbild oben lange drücken und auf eine Aufgabe ziehen gibt sie dieser Person.
          </p>
        </>
      )}
      {menus}
    </div>
  );
}
