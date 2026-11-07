"use client";

import { useFamily } from "@/lib/client/family";
import { haptic } from "@/lib/client/haptics";
import { localDay, type Task } from "@/lib/types";
import { toggleTask } from "./TaskRow";
import { Avatar } from "./ui";

/** Aufgaben, die im Kalender stehen sollen, für einen Tag */
export function tasksOn(tasks: Task[], day: Date) {
  const key = localDay(day);
  return tasks.filter((t) => t.due === key);
}

function Check({ task, size }: { task: Task; size: number }) {
  const { run, color } = useFamily();
  const c = task.personId ? color(task.personId) : "var(--label-2)";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        haptic();
        toggleTask(run, task, localDay());
      }}
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        border: task.done ? "none" : `1.5px solid ${c}`,
        background: task.done ? c : "transparent",
        transition: "background-color 160ms ease",
      }}
      aria-label={task.done ? `${task.title} wieder öffnen` : `${task.title} abhaken`}
    >
      {task.done && (
        <svg viewBox="0 0 14 14" width={size * 0.6} height={size * 0.6} className="check-pop" aria-hidden>
          <path d="M2.5 7.4l2.9 2.8 6-6.4" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/** schmale Zeile in der Ganztägig-Spur von Tag und Woche */
export function CalTaskChip({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(task)}
      className="row-press caption flex min-w-0 items-center gap-1 rounded-[5px] px-1 py-[2px]"
      style={{ background: "var(--fill)" }}
    >
      <Check task={task} size={12} />
      <span className="truncate font-semibold" style={{ color: task.done ? "var(--label-3)" : "var(--label)", textDecoration: task.done ? "line-through" : "none" }}>
        {task.title}
      </span>
    </div>
  );
}

/** Zeile in der Tagesliste der Monatsansicht */
export function CalTaskRow({ task, first, onOpen }: { task: Task; first: boolean; onOpen: (t: Task) => void }) {
  const { person } = useFamily();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(task)}
      className="row-press flex w-full items-center gap-3 px-4 py-3 text-left"
      style={{ borderTop: first ? "none" : "0.5px solid var(--separator)" }}
    >
      <span className="flex w-12 shrink-0 justify-start">
        <Check task={task} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="body truncate font-medium" style={{ color: task.done ? "var(--label-3)" : "var(--label)", textDecoration: task.done ? "line-through" : "none" }}>
          {task.title}
        </p>
        <p className="footnote truncate" style={{ color: "var(--label-2)" }}>
          Aufgabe{task.remindTime ? `, ${task.remindTime} Uhr` : ""}
          {task.points > 0 ? ` · ★ ${task.points}` : ""}
        </p>
      </div>
      {task.personId ? (
        <Avatar person={person(task.personId)} size={20} />
      ) : (
        <span className="caption rounded-full px-2 py-0.5 font-semibold" style={{ background: "var(--fill)", color: "var(--label-2)" }}>
          Alle
        </span>
      )}
    </div>
  );
}
