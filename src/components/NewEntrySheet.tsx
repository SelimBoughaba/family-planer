"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { describeWhen, parseQuick, quickStart } from "@/lib/quick";
import { useFamily } from "@/lib/client/family";
import { localDay, recurrenceLabel, type Recurrence, type Task } from "@/lib/types";
import { Avatar } from "./ui";
import { IconTrash } from "./icons";

type Kind = "task" | "event";

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const idx = options.findIndex((o) => o.id === value);
  return (
    <div
      className="relative flex rounded-[10px] p-[2px]"
      style={{
        background: "color-mix(in oklab, var(--label) 8%, transparent)",
      }}
    >
      <span
        className="absolute top-[2px] bottom-[2px] rounded-[8px]"
        style={{
          left: `calc(2px + ${idx} * (100% - 4px) / ${options.length})`,
          width: `calc((100% - 4px) / ${options.length})`,
          background: "var(--glass-strong)",
          boxShadow: "0 3px 8px rgba(0,0,0,.12), 0 1px 1px rgba(0,0,0,.04)",
          transition: "left 300ms cubic-bezier(0.25, 1.1, 0.4, 1)",
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

function Chips<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
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
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Label = ({ children }: { children: string }) => (
  <p className="footnote mt-5 mb-2 font-semibold" style={{ color: "var(--label-2)" }}>
    {children}
  </p>
);

type When = "today" | "tomorrow" | "none" | "date";

function tomorrowDay() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDay(d);
}

export type EventDraft = {
  title: string;
  start?: Date;
  allDay?: boolean;
  people?: string[];
  duration?: number;
};

/** Neue Aufgabe anlegen oder bestehende bearbeiten (mit task). Neue Einträge erkennen Termine und Einkäufe selbst. */
export function NewEntrySheet({ open, onClose, onEvent, task }: { open: boolean; onClose: () => void; onEvent?: (d: EventDraft) => void; task?: Task | null }) {
  if (!open) return null;
  return <TaskForm key={task?.id ?? "new"} onClose={onClose} onEvent={onEvent} task={task ?? null} />;
}

function TaskForm({ onClose, onEvent, task }: { onClose: () => void; onEvent?: (d: EventDraft) => void; task: Task | null }) {
  const { state, me, run } = useFamily();
  const kind: Kind = "task";
  const editing = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [who, setWho] = useState<string | null>(task ? task.personId : (me?.id ?? null));
  const [area, setArea] = useState(task?.area ?? "Haushalt");
  const [when, setWhen] = useState<When>(() => {
    if (!task) return "today";
    if (!task.due) return "none";
    if (task.due === localDay()) return "today";
    if (task.due === tomorrowDay()) return "tomorrow";
    return "date";
  });
  const [date, setDate] = useState(task?.due ?? localDay());
  const [rec, setRec] = useState<"none" | Recurrence>(task?.recurring ?? "none");
  const [remind, setRemind] = useState(!!task?.remindTime);
  const [remindTime, setRemindTime] = useState(task?.remindTime ?? "08:00");
  const [rotating, setRotating] = useState((task?.rotation.length ?? 0) >= 2);
  const [rotation, setRotation] = useState<string[]>(task?.rotation ?? []);
  const [points, setPoints] = useState<number | null>(task ? task.points : null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ignoreQuick, setIgnoreQuick] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) return;
    const id = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(id);
  }, [editing]);

  const people = useMemo(() => state?.people ?? [], [state?.people]);
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "";
  const plan = rec !== "none" && rotating;
  // im Dienstplan ist die gewählte Person nur gültig, wenn sie mitmacht
  const current = plan ? (who && rotation.includes(who) ? who : (rotation[0] ?? null)) : who;

  // Schnelleingabe: nur bei neuen Einträgen, abschaltbar über das Kreuz an der Vorschau
  const quick = useMemo(() => (editing || !title.trim() ? null : parseQuick(title, people, me?.id ?? null)), [editing, title, people, me?.id]);
  const detected = !!quick && !ignoreQuick && (quick.kind !== "task" || !!quick.day || quick.people.length > 0);
  const quickLabel = (() => {
    if (!quick || !detected) return null;
    const names = quick.people.map(name).filter(Boolean).join(", ");
    if (quick.kind === "items")
      return {
        icon: "🛒",
        text: quick.items.length === 1 ? `„${quick.items[0].name}“ auf die Einkaufsliste` : `${quick.items.length} Artikel auf die Einkaufsliste`,
        sub: quick.items.map((i) => (i.amount ? `${i.amount} ${i.name}` : i.name)).join(", "),
      };
    if (quick.kind === "event")
      return {
        icon: "📅",
        text: `Termin „${quick.title || title.trim()}“`,
        sub: [describeWhen(quick) || "ganztägig, heute", names].filter(Boolean).join(" · "),
      };
    return {
      icon: "✓",
      text: `Aufgabe „${quick.title || title.trim()}“`,
      sub: [describeWhen(quick), names].filter(Boolean).join(" · "),
    };
  })();

  const tapPerson = (id: string) => {
    if (!plan) return setWho((w) => (w === id ? null : id));
    setRotation((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  };

  const save = async () => {
    if (!title.trim() || busy) return;
    if (plan && rotation.length < 2) return;
    // erkannte Termine und Einkäufe direkt dorthin
    if (quick && detected && quick.kind === "event" && onEvent) {
      const { start, allDay, duration } = quickStart(quick);
      onClose();
      onEvent({
        title: quick.title || title.trim(),
        start,
        allDay,
        duration,
        people: quick.people,
      });
      return;
    }
    if (quick && detected && quick.kind === "items") {
      setBusy(true);
      const ok = await run({ op: "item.createMany", items: quick.items });
      setBusy(false);
      if (ok) onClose();
      return;
    }
    setBusy(true);
    let due = when === "today" ? localDay() : when === "tomorrow" ? tomorrowDay() : when === "date" ? date : null;
    let person = current;
    let text = title.trim();
    let reminder = remind && (due || rec !== "none") ? remindTime : null;
    if (quick && detected && quick.kind === "task") {
      if (quick.day) due = localDay(quick.day);
      if (quick.people[0] && !plan) person = quick.people[0];
      if (quick.title) text = quick.title;
      if (quick.time && due) reminder = `${String(quick.time.h).padStart(2, "0")}:${String(quick.time.m).padStart(2, "0")}`;
    }
    const fields = {
      title: text,
      area,
      personId: person,
      due: rec !== "none" && !due ? localDay() : due,
      recurring: rec === "none" ? null : rec,
      remindTime: reminder,
      rotation: plan ? rotation : [],
      points: points ?? (plan ? 2 : 1),
    };
    const ok = await run(task ? { op: "task.update", id: task.id, ...fields } : { op: "task.create", ...fields });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!task) return;
    if (!confirmDelete) return setConfirmDelete(true);
    if (await run({ op: "task.delete", id: task.id })) onClose();
  };

  const canSave = !!title.trim() && !(plan && rotation.length < 2);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal aria-label={editing ? "Aufgabe bearbeiten" : "Neuer Eintrag"}>
      <button className="fade-in absolute inset-0" style={{ background: "rgba(0,0,0,.25)" }} onClick={onClose} aria-label="Abbrechen" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="sheet-in glass glass-strong relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] px-4 pt-2"
        style={{ paddingBottom: "calc(var(--safe-b) + 20px)" }}
      >
        <span className="mx-auto mb-2 block h-[5px] w-9 rounded-full" style={{ background: "var(--label-3)" }} aria-hidden />
        <div className="flex items-center justify-between py-1">
          <button type="button" onClick={onClose} className="body" style={{ color: "var(--tint)" }}>
            Abbrechen
          </button>
          <span className="headline">{editing ? "Aufgabe" : "Neuer Eintrag"}</span>
          <button type="submit" disabled={!canSave || busy} className="body font-semibold" style={{ color: canSave ? "var(--tint)" : "var(--label-3)" }}>
            {editing ? "Fertig" : "Hinzufügen"}
          </button>
        </div>

        {!editing && onEvent && (
          <div className="mt-3">
            <Segmented
              value={kind}
              onChange={(k) => {
                if (k === "event") {
                  const t = quick?.title || title;
                  onClose();
                  if (quick && (quick.day || quick.time)) {
                    const { start, allDay, duration } = quickStart(quick);
                    onEvent({
                      title: t,
                      start,
                      allDay,
                      duration,
                      people: quick.people,
                    });
                  } else onEvent({ title: t, people: quick?.people });
                }
              }}
              options={[
                { id: "task", label: "Aufgabe" },
                { id: "event", label: "Termin" },
              ]}
            />
          </div>
        )}

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!e.target.value.trim()) setIgnoreQuick(false);
          }}
          placeholder={editing ? "Was ist zu tun?" : "Einfach lostippen …"}
          className="title-2 mt-5 w-full bg-transparent outline-none placeholder:text-[var(--label-3)]"
          maxLength={140}
          aria-label="Titel"
        />

        {!editing && !title.trim() && (
          <p className="footnote mt-1" style={{ color: "var(--label-3)" }}>
            Zum Beispiel „Zahnarzt Samir Dienstag 15 Uhr“, „Müll rausbringen morgen“ oder „Milch, Eier, Brot“. Die App erkennt selbst, was es ist.
          </p>
        )}
        {quickLabel && (
          <div
            className="fade-in mt-3 flex items-center gap-3 rounded-[16px] px-3 py-2.5"
            style={{
              background: "color-mix(in oklab, var(--tint) 12%, transparent)",
            }}
            role="status"
          >
            <span className="text-xl" aria-hidden>
              {quickLabel.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="subhead block truncate font-semibold" style={{ color: "var(--tint)" }}>
                {quickLabel.text}
              </span>
              {quickLabel.sub && (
                <span className="footnote block truncate" style={{ color: "var(--label-2)" }}>
                  {quickLabel.sub}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setIgnoreQuick(true)}
              className="footnote shrink-0 rounded-full px-2.5 py-1 font-semibold"
              style={{
                background: "color-mix(in oklab, var(--label) 8%, transparent)",
              }}
              aria-label="Erkennung ignorieren"
            >
              Nur Aufgabe
            </button>
          </div>
        )}

        {(!detected || quick?.kind === "task") && (
          <>
            <Label>Wann?</Label>
            <Chips
              value={when}
              onChange={setWhen}
              options={[
                { id: "today", label: "Heute" },
                { id: "tomorrow", label: "Morgen" },
                { id: "date", label: "Datum" },
                { id: "none", label: "Irgendwann" },
              ]}
            />
            {when === "date" && (
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="body glass mt-3 w-full rounded-[12px] px-3 py-2" aria-label="Datum" />
            )}

            <Label>Wiederholen</Label>
            <Chips
              value={rec}
              onChange={setRec}
              options={[
                { id: "none" as const, label: "Nie" },
                ...(Object.keys(recurrenceLabel) as Recurrence[]).map((r) => ({
                  id: r,
                  label: recurrenceLabel[r],
                })),
              ]}
            />

            <div className="mt-5 mb-2 flex items-center justify-between">
              <p className="footnote font-semibold" style={{ color: "var(--label-2)" }}>
                {plan ? "Wer wechselt sich ab?" : "Wer kümmert sich?"}
              </p>
              {rec !== "none" && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={rotating}
                  onClick={() => {
                    // neuer Dienst: dran ist, wer in der Reihe vorne steht
                    if (!rotating && !editing) setWho(null);
                    setRotating(!rotating);
                  }}
                  className="flex items-center gap-2"
                >
                  <span className="footnote font-medium">Reihum</span>
                  <Switch on={rotating} />
                </button>
              )}
            </div>
            <div className="flex gap-3">
              {people.map((p) => {
                const pos = rotation.indexOf(p.id);
                const on = plan ? pos >= 0 : who === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => tapPerson(p.id)}
                    className="press relative flex flex-col items-center gap-1"
                    aria-pressed={on}
                    style={{
                      opacity: on ? 1 : 0.4,
                      transition: "opacity 160ms ease",
                    }}
                  >
                    <Avatar person={p} size={40} />
                    {plan && pos >= 0 && (
                      <span
                        className="caption tabular absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-bold text-white"
                        style={{ background: "var(--tint)" }}
                      >
                        {pos + 1}
                      </span>
                    )}
                    <span className="caption">{p.name}</span>
                  </button>
                );
              })}
            </div>
            {plan && (
              <div className="mt-3">
                {rotation.length < 2 ? (
                  <p className="footnote" style={{ color: "var(--label-3)" }}>
                    Tippe mindestens zwei Personen in der Reihenfolge an, in der sie sich abwechseln.
                  </p>
                ) : (
                  <>
                    <p className="footnote" style={{ color: "var(--label-2)" }}>
                      {rotation.map(name).join(" → ")}, dann wieder von vorn. Wer abhakt, gibt an die nächste Person weiter.
                    </p>
                    <p className="footnote mt-3 mb-2 font-semibold" style={{ color: "var(--label-2)" }}>
                      Jetzt dran
                    </p>
                    <Chips value={current ?? ""} onChange={setWho} options={rotation.map((id) => ({ id, label: name(id) }))} />
                  </>
                )}
              </div>
            )}

            <Label>Bereich</Label>
            <Chips value={area} onChange={setArea} options={[...new Set([...(state?.lists.areas ?? []), area])].map((a) => ({ id: a, label: a }))} />

            <Label>Punkte fürs Erledigen</Label>
            <Chips
              value={String(points ?? (plan ? 2 : 1))}
              onChange={(v) => setPoints(Number(v))}
              options={[0, 1, 2, 3, 5, 10].map((n) => ({ id: String(n), label: n === 0 ? "Keine" : `${n} ${n === 1 ? "Punkt" : "Punkte"}` }))}
            />

            <Label>Erinnerung</Label>
            {when === "none" && rec === "none" ? (
              <p className="footnote" style={{ color: "var(--label-3)" }}>
                Für eine Erinnerung braucht die Aufgabe einen Tag.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <button type="button" role="switch" aria-checked={remind} onClick={() => setRemind((r) => !r)} className="flex flex-1 items-center justify-between">
                  <span className="body">Erinnern um</span>
                  <Switch on={remind} />
                </button>
                {remind && (
                  <input
                    type="time"
                    value={remindTime}
                    onChange={(e) => e.target.value && setRemindTime(e.target.value)}
                    step={300}
                    className="body glass tabular rounded-[12px] px-3 py-1.5"
                    aria-label="Uhrzeit der Erinnerung"
                  />
                )}
              </div>
            )}
          </>
        )}

        {editing && (
          <button
            type="button"
            onClick={() => void remove()}
            className="press body mt-8 flex w-full items-center justify-center gap-2 rounded-[14px] py-3 font-semibold"
            style={{
              background: "color-mix(in oklab, var(--danger) 12%, transparent)",
              color: "var(--danger)",
            }}
          >
            <IconTrash size={18} /> {confirmDelete ? "Wirklich löschen?" : "Aufgabe löschen"}
          </button>
        )}
      </form>
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className="relative h-[31px] w-[51px] shrink-0 rounded-full"
      style={{
        background: on ? "var(--success)" : "color-mix(in oklab, var(--label) 14%, transparent)",
        transition: "background 200ms ease",
      }}
    >
      <span
        className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white"
        style={{
          left: on ? 22 : 2,
          boxShadow: "0 3px 8px rgba(0,0,0,.15)",
          transition: "left 220ms cubic-bezier(0.3, 1.3, 0.5, 1)",
        }}
      />
    </span>
  );
}
