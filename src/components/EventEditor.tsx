"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { allDayReminderOptions, eventRecurrenceLabel, FALLBACK_COLOR, localDay, timedReminderOptions, type EventFields, type EventRecurrence } from "@/lib/types";
import type { Occurrence } from "@/lib/recurrence";
import { AnimatePresence, Avatar, Chips, ContextMenu, SheetFrame, Switch, type MenuAction } from "./ui";
import { TimeDial, durationLabel } from "./TimeDial";
import { IconRepeat, IconTrash } from "./icons";

export type EditorTarget = { mode: "new"; start: Date; allDay?: boolean; title?: string; people?: string[]; duration?: number } | { mode: "edit"; occ: Occurrence };

const Label = ({ children }: { children: string }) => (
  <p className="footnote mt-5 mb-2 font-semibold" style={{ color: "var(--label-2)" }}>
    {children}
  </p>
);

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="mt-4 flex w-full items-center justify-between" role="switch" aria-checked={on}>
      <span className="body">{label}</span>
      <Switch on={on} />
    </button>
  );
}

const reminderValid = (r: string, allDay: boolean) => r !== "none" && (allDay ? allDayReminderOptions : timedReminderOptions).some((o) => String(o.minutes) === r);

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

function initial(target: EditorTarget, me: string | null) {
  if (target.mode === "edit") {
    const { occ } = target;
    const e = occ.event;
    return {
      title: e.title,
      place: e.place ?? "",
      people: e.people,
      date: localDay(occ.start),
      allDay: e.allDay,
      start: minutesOf(occ.start),
      duration: Math.max(5, Math.round((+occ.end - +occ.start) / 60000)),
      days: e.allDay ? Math.max(1, Math.round((+occ.end - +occ.start) / 86400000)) : 1,
      recurrence: (e.recurrence ?? "none") as EventRecurrence | "none",
      until: e.recurrenceUntil ?? "",
      reminder: e.reminders.length ? String(e.reminders[0]) : "none",
    };
  }
  return {
    title: target.title ?? "",
    place: "",
    people: target.people?.length ? target.people : me ? [me] : [],
    date: localDay(target.start),
    allDay: !!target.allDay,
    start: minutesOf(target.start),
    duration: target.duration ?? 60,
    days: 1,
    recurrence: "none" as EventRecurrence | "none",
    until: "",
    reminder: "none",
  };
}

export function EventEditor({ target, onClose }: { target: EditorTarget | null; onClose: () => void }) {
  // Schlüssel sorgt dafür, dass jeder Aufruf mit frischem Formular startet
  const key = !target ? "none" : target.mode === "edit" ? target.occ.key : `new-${+target.start}`;
  return <AnimatePresence>{target && <Editor key={key} target={target} onClose={onClose} />}</AnimatePresence>;
}

function Editor({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const { state, me, run, color } = useFamily();
  const [f, setF] = useState(() => initial(target, me?.id ?? null));
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<null | "save" | "delete">(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const editing = target.mode === "edit";
  const recurringSource = editing && target.occ.recurring;

  useEffect(() => {
    if (editing) return;
    const id = setTimeout(() => titleRef.current?.focus(), 250);
    return () => clearTimeout(id);
  }, [editing]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const people = state?.people ?? [];
  // ohne gewählte Farbe die Systemfarbe nehmen, sonst wäre der Bogen grau auf grau
  const accent = f.people[0] && color(f.people[0]) !== FALLBACK_COLOR ? color(f.people[0]) : "#0A84FF";

  const fields = useMemo((): EventFields => {
    const day0 = new Date(`${f.date}T00:00`);
    const start = f.allDay ? day0 : new Date(+day0 + f.start * 60000);
    const end = f.allDay ? new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + f.days) : new Date(+start + f.duration * 60000);
    const recurrence = f.recurrence === "none" ? null : f.recurrence;
    return {
      title: f.title.trim(),
      place: f.place.trim() || null,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      allDay: f.allDay,
      people: f.people,
      recurrence,
      recurrenceUntil: recurrence && f.until ? f.until : null,
      reminders: reminderValid(f.reminder, f.allDay) ? [Number(f.reminder)] : [],
    };
  }, [f]);

  const finish = (ok: boolean) => {
    setBusy(false);
    if (ok) onClose();
  };

  const save = async (mode?: "one" | "all") => {
    if (!fields.title || busy) return;
    if (recurringSource && !mode) return setScope("save");
    setBusy(true);
    if (target.mode === "new") return finish(await run({ op: "event.create", ...fields }));
    const { occ } = target;
    if (mode === "one") return finish(await run({ op: "event.detach", id: occ.event.id, occurrence: occ.occurrence, ...fields }));
    if (occ.recurring) {
      // ganze Serie: Änderung am Vorkommen auf den Serienbeginn übertragen
      const delta = +new Date(fields.startsAt) - +occ.start;
      const base = new Date(+new Date(occ.event.startsAt) + delta);
      const dur = +new Date(fields.endsAt) - +new Date(fields.startsAt);
      return finish(await run({ op: "event.update", id: occ.event.id, ...fields, startsAt: base.toISOString(), endsAt: new Date(+base + dur).toISOString() }));
    }
    finish(await run({ op: "event.update", id: occ.event.id, ...fields }));
  };

  const remove = async (mode: "all" | "one" | "following") => {
    if (target.mode !== "edit") return;
    setBusy(true);
    finish(await run({ op: "event.delete", id: target.occ.event.id, mode, occurrence: target.occ.occurrence }));
  };

  const togglePerson = (id: string) => set("people", f.people.includes(id) ? f.people.filter((x) => x !== id) : [...f.people, id]);

  const scopeActions: MenuAction[] =
    scope === "save"
      ? [
          { label: "Nur diesen Termin", onSelect: () => void save("one") },
          { label: "Alle Termine der Serie", onSelect: () => void save("all") },
        ]
      : scope === "delete"
        ? [
            { label: "Nur diesen Termin", destructive: true, onSelect: () => void remove("one") },
            { label: "Diesen und alle folgenden", destructive: true, onSelect: () => void remove("following") },
            { label: "Alle Termine der Serie", destructive: true, onSelect: () => void remove("all") },
          ]
        : [];

  return (
    <>
      <SheetFrame
        label={editing ? "Termin bearbeiten" : "Neuer Termin"}
        onClose={onClose}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        header={
          <div className="flex items-center justify-between py-1">
            <button type="button" onClick={onClose} className="body" style={{ color: "var(--tint)" }}>
              Abbrechen
            </button>
            <span className="headline">{editing ? "Termin" : "Neuer Termin"}</span>
            <button type="submit" disabled={!fields.title || busy} className="body font-semibold" style={{ color: fields.title ? "var(--tint)" : "var(--label-3)" }}>
              {editing ? "Sichern" : "Hinzufügen"}
            </button>
          </div>
        }
      >
        <input
          ref={titleRef}
          value={f.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Was steht an?"
          className="title-2 mt-4 w-full bg-transparent outline-none placeholder:text-[var(--label-3)]"
          maxLength={140}
          aria-label="Titel"
        />
        <input
          value={f.place}
          onChange={(e) => set("place", e.target.value)}
          placeholder="Ort (optional)"
          className="body mt-2 w-full bg-transparent outline-none placeholder:text-[var(--label-3)]"
          maxLength={140}
          aria-label="Ort"
        />
        {recurringSource && (
          <p className="footnote mt-2 flex items-center gap-1.5" style={{ color: "var(--label-2)" }}>
            <IconRepeat /> Teil einer Serie: {eventRecurrenceLabel[target.occ.event.recurrence!]}
          </p>
        )}

        <Label>Wer ist dabei?</Label>
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
          {people.map((p) => {
            const on = f.people.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePerson(p.id)}
                className="press flex flex-col items-center gap-1"
                aria-pressed={on}
                style={{ opacity: on ? 1 : 0.4, transition: "opacity 160ms ease" }}
              >
                <Avatar person={p} size={40} />
                <span className="caption">{p.name}</span>
              </button>
            );
          })}
        </div>

        <Label>Datum</Label>
        <input
          type="date"
          value={f.date}
          onChange={(e) => e.target.value && set("date", e.target.value)}
          className="body glass w-full rounded-[12px] px-3 py-2"
          aria-label="Datum"
        />
        <Toggle on={f.allDay} onChange={(v) => set("allDay", v)} label="Ganztägig" />

        {f.allDay ? (
          <>
            <Label>Dauer</Label>
            <Chips
              value={String(f.days)}
              onChange={(v) => set("days", Number(v))}
              options={[1, 2, 3, 7, 14].map((d) => ({ id: String(d), label: d === 1 ? "1 Tag" : d === 7 ? "1 Woche" : d === 14 ? "2 Wochen" : `${d} Tage` }))}
            />
          </>
        ) : (
          <>
            <Label>Uhrzeit</Label>
            <TimeDial start={f.start} duration={f.duration} color={accent} onChange={(s, d) => setF((x) => ({ ...x, start: s, duration: d }))} />
            <div className="mt-3">
              <Chips
                value={String(f.duration)}
                onChange={(v) => set("duration", Number(v))}
                options={[30, 60, 90, 120, 180].concat([30, 60, 90, 120, 180].includes(f.duration) ? [] : [f.duration]).map((m) => ({ id: String(m), label: durationLabel(m) }))}
              />
            </div>
          </>
        )}

        <Label>Erinnerung</Label>
        <Chips
          value={reminderValid(f.reminder, f.allDay) ? f.reminder : "none"}
          onChange={(v) => set("reminder", v)}
          options={[{ id: "none", label: "Keine" }, ...(f.allDay ? allDayReminderOptions : timedReminderOptions).map((o) => ({ id: String(o.minutes), label: o.label }))]}
        />
        {f.reminder !== "none" && reminderValid(f.reminder, f.allDay) && (
          <p className="caption mt-1.5" style={{ color: "var(--label-3)" }}>
            Geht an alle, die beim Termin dabei sind und Mitteilungen eingeschaltet haben.
          </p>
        )}

        <Label>Wiederholen</Label>
        <Chips
          value={f.recurrence}
          onChange={(v) => set("recurrence", v)}
          options={[{ id: "none" as const, label: "Nie" }, ...(Object.keys(eventRecurrenceLabel) as EventRecurrence[]).map((r) => ({ id: r, label: eventRecurrenceLabel[r] }))]}
        />
        {f.recurrence !== "none" && (
          <label className="mt-3 flex items-center justify-between gap-3">
            <span className="body">Endet am</span>
            <input
              type="date"
              value={f.until}
              min={f.date}
              onChange={(e) => set("until", e.target.value)}
              className="body glass rounded-[12px] px-3 py-2"
              aria-label="Wiederholung endet am"
            />
          </label>
        )}
        {f.recurrence !== "none" && !f.until && (
          <p className="caption mt-1" style={{ color: "var(--label-3)" }}>
            Ohne Enddatum läuft die Serie unbegrenzt.
          </p>
        )}

        {editing && (
          <button
            type="button"
            onClick={() => (recurringSource ? setScope("delete") : void remove("all"))}
            className="press body mt-8 flex w-full items-center justify-center gap-2 rounded-[14px] py-3 font-medium"
            style={{ color: "var(--danger)", background: "color-mix(in oklab, var(--danger) 10%, transparent)" }}
          >
            <IconTrash size={18} /> Termin löschen
          </button>
        )}
      </SheetFrame>

      <ContextMenu
        open={!!scope}
        onClose={() => setScope(null)}
        preview={<p className="headline">{scope === "delete" ? "Welche Termine löschen?" : "Änderung übernehmen für"}</p>}
        actions={scopeActions}
      />
    </>
  );
}
