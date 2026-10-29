"use client";

import { useState } from "react";
import { useFamily } from "@/lib/client/family";
import { localDay, recurrenceLabel, type Task } from "@/lib/types";
import { Avatar, ContextMenu, type MenuAction } from "./ui";
import { SwipeRow } from "./SwipeRow";
import { IconCheck, IconClock, IconPencil, IconPerson, IconRepeat, IconTrash } from "./icons";

export function dueLabel(due: string | null, today: string) {
  if (!due) return null;
  if (due < today) return "Überfällig";
  if (due === today) return "Heute";
  const d = new Date(`${due}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const days = Math.round((+d - +t) / 86400000);
  if (days === 1) return "Morgen";
  if (days < 7) return d.toLocaleDateString("de-DE", { weekday: "long" });
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

/** Eine Aufgabe: Kreis zum Abhaken, Wischen rechts erledigt, links auf morgen, lange drücken für mehr */
export function TaskRow({
  task: t,
  first,
  today,
  onEdit,
  onMenu,
  showDue = false,
  showArea = true,
}: {
  task: Task;
  first: boolean;
  today: string;
  onEdit: (t: Task) => void;
  onMenu: (t: Task) => void;
  showDue?: boolean;
  showArea?: boolean;
}) {
  const { run, person, color } = useFamily();
  const c = color(t.personId);
  const overdue = !!t.due && t.due < today && !t.done;
  const toggle = () => run({ op: "task.toggle", id: t.id, done: !t.done, today });
  const plan = t.rotation.length >= 2;
  const nextName = plan ? person(t.rotation[(t.rotation.indexOf(t.personId ?? "") + 1) % t.rotation.length])?.name : null;

  const meta = [
    overdue ? null : showDue ? dueLabel(t.due, today) : null,
    showArea ? t.area : null,
  ].filter(Boolean);

  return (
    <SwipeRow
      leading={{ label: t.done ? "Öffnen" : "Erledigt", color: "var(--success)", icon: <IconCheck size={18} />, onTrigger: toggle }}
      trailing={t.done ? undefined : { label: "Morgen", color: "#FF9F0A", icon: <IconClock size={18} />, onTrigger: () => run({ op: "task.postpone", id: t.id, today }) }}
      onLongPress={() => onMenu(t)}
    >
      <div data-task-id={t.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: first ? "none" : "0.5px solid var(--separator)", transition: "background 150ms ease" }}>
        <button
          onClick={toggle}
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full"
          style={{ border: t.done ? "none" : `1.6px solid ${c}`, background: t.done ? c : "transparent", color: "white" }}
          aria-label={t.done ? "Als offen markieren" : "Als erledigt markieren"}
        >
          {t.done && <IconCheck size={14} className="check-pop" />}
        </button>
        <button onClick={() => onEdit(t)} className="min-w-0 flex-1 text-left">
          <p className="body truncate" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--label-3)" : "var(--label)" }}>
            {t.title}
          </p>
          <p className="footnote flex flex-wrap items-center gap-x-1.5" style={{ color: "var(--label-2)" }}>
            {overdue && <span style={{ color: "var(--danger)" }}>Überfällig</span>}
            {meta.length > 0 && <span>{meta.join(", ")}</span>}
            {t.recurring && (
              <span className="flex items-center gap-1">
                <IconRepeat /> {plan && !t.done && nextName ? `danach ${nextName}` : recurrenceLabel[t.recurring]}
              </span>
            )}
            {t.remindTime && !t.done && (
              <span className="flex items-center gap-1 tabular">
                <IconClock size={12} /> {t.remindTime}
              </span>
            )}
          </p>
        </button>
        <Avatar person={person(t.personId)} size={24} />
      </div>
    </SwipeRow>
  );
}

/** Menü bei langem Druck und Auswahl, wer übernimmt */
export function useTaskMenus(onEdit: (t: Task) => void) {
  const { state, run, person } = useFamily();
  const [menu, setMenu] = useState<Task | null>(null);
  const [assign, setAssign] = useState<Task | null>(null);
  const today = localDay();

  const actions = (t: Task): MenuAction[] => [
    { label: t.done ? "Wieder öffnen" : "Erledigt", icon: <IconCheck size={18} />, onSelect: () => run({ op: "task.toggle", id: t.id, done: !t.done, today }) },
    ...(t.done ? [] : [{ label: "Auf morgen", icon: <IconClock size={18} />, onSelect: () => run({ op: "task.postpone", id: t.id, today }) }]),
    { label: "Bearbeiten", icon: <IconPencil size={18} />, onSelect: () => setTimeout(() => onEdit(t), 50) },
    ...(t.rotation.length >= 2 ? [] : [{ label: "Jemand anderem geben", icon: <IconPerson size={18} />, onSelect: () => setTimeout(() => setAssign(t), 50) }]),
    { label: "Löschen", icon: <IconTrash size={18} />, destructive: true, onSelect: () => run({ op: "task.delete", id: t.id }) },
  ];

  const menus = (
    <>
      <ContextMenu
        open={!!menu}
        onClose={() => setMenu(null)}
        actions={menu ? actions(menu) : []}
        preview={
          menu && (
            <div className="flex items-center gap-3">
              <Avatar person={person(menu.personId)} size={36} />
              <div className="min-w-0">
                <p className="headline">{menu.title}</p>
                <p className="footnote" style={{ color: "var(--label-2)" }}>
                  {menu.area}
                  {menu.rotation.length >= 2
                    ? `, reihum: ${menu.rotation.map((id) => person(id)?.name).filter(Boolean).join(", ")}`
                    : person(menu.personId)
                      ? `, zuständig: ${person(menu.personId)!.name}`
                      : ", noch niemand zuständig"}
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
    </>
  );

  return { openMenu: setMenu, menus };
}

/** Profilbild auf eine Aufgabe fallen lassen: diese Person ist zuständig */
export function useAssignDrop() {
  const { state, run } = useFamily();
  return (personId: string, taskId: string) => {
    const t = state?.tasks.find((x) => x.id === taskId);
    if (!t || t.personId === personId) return;
    // im Dienstplan nur Personen, die mitmachen
    if (t.rotation.length >= 2 && !t.rotation.includes(personId)) return;
    void run({ op: "task.assign", id: taskId, personId });
  };
}
