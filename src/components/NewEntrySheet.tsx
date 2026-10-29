"use client";

import { useEffect, useRef, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { areas, localDay, recurrenceLabel, type Recurrence } from "@/lib/types";
import { Avatar } from "./ui";

type Kind = "task" | "event";

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const idx = options.findIndex((o) => o.id === value);
  return (
    <div className="relative flex rounded-[10px] p-[2px]" style={{ background: "color-mix(in oklab, var(--label) 8%, transparent)" }}>
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



export function NewEntrySheet({ open, onClose, onEvent }: { open: boolean; onClose: () => void; onEvent: (title: string) => void }) {
  const { state, me, run } = useFamily();
  const kind: Kind = "task";
  const [title, setTitle] = useState("");
  const [who, setWho] = useState<string[]>([]);
  // Aufgabe
  const [area, setArea] = useState("Haushalt");
  const [when, setWhen] = useState<"today" | "tomorrow" | "none" | "date">("today");
  const [date, setDate] = useState(localDay());
  const [rec, setRec] = useState<"none" | Recurrence>("none");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(id);
  }, [open]);

  if (!open) return null;

  const people = state?.people ?? [];
  const chosen = who.length ? who : me ? [me.id] : [];

  const reset = () => {
    setTitle("");
    setWho([]);
    setWhen("today");
    setRec("none");
    setDate(localDay());
  };

  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const due = when === "today" ? localDay() : when === "tomorrow" ? localDay(tomorrow) : when === "date" ? date : null;
    const ok = await run({
      op: "task.create",
      title: title.trim(),
      area,
      personId: chosen[0] ?? null,
      due: rec !== "none" && !due ? localDay() : due,
      recurring: rec === "none" ? null : rec,
    });
    setBusy(false);
    if (ok) {
      reset();
      onClose();
    }
  };

  const toggleWho = (id: string) => setWho([id]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal aria-label="Neuer Eintrag">
      <button className="fade-in absolute inset-0" style={{ background: "rgba(0,0,0,.25)" }} onClick={onClose} aria-label="Abbrechen" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="sheet-in glass glass-strong relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] px-4 pt-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <span className="mx-auto mb-2 block h-[5px] w-9 rounded-full" style={{ background: "var(--label-3)" }} aria-hidden />
        <div className="flex items-center justify-between py-1">
          <button type="button" onClick={onClose} className="body" style={{ color: "var(--tint)" }}>
            Abbrechen
          </button>
          <span className="headline">Neue Aufgabe</span>
          <button type="submit" disabled={!title.trim() || busy} className="body font-semibold" style={{ color: title.trim() ? "var(--tint)" : "var(--label-3)" }}>
            Hinzufügen
          </button>
        </div>

        <div className="mt-3">
          <Segmented
            value={kind}
            onChange={(k) => {
              if (k === "event") {
                const t = title;
                reset();
                onClose();
                onEvent(t);
              }
            }}
            options={[
              { id: "task", label: "Aufgabe" },
              { id: "event", label: "Termin" },
            ]}
          />
        </div>

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Was ist zu tun?"
          className="title-2 mt-5 w-full bg-transparent outline-none placeholder:text-[var(--label-3)]"
          maxLength={140}
          aria-label="Titel"
        />

        <Label>Wer kümmert sich?</Label>
        <div className="flex gap-3">
          {people.map((p) => {
            const on = chosen.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggleWho(p.id)} className="press flex flex-col items-center gap-1" aria-pressed={on} style={{ opacity: on ? 1 : 0.4, transition: "opacity 160ms ease" }}>
                <Avatar person={p} size={40} />
                <span className="caption">{p.name}</span>
              </button>
            );
          })}
        </div>

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
            {when === "date" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="body glass mt-3 w-full rounded-[12px] px-3 py-2" aria-label="Datum" />}
            <Label>Bereich</Label>
            <Chips value={area} onChange={setArea} options={areas.map((a) => ({ id: a, label: a }))} />
            <Label>Wiederholen</Label>
            <Chips
              value={rec}
              onChange={setRec}
              options={[{ id: "none" as const, label: "Nie" }, ...(Object.keys(recurrenceLabel) as Recurrence[]).map((r) => ({ id: r, label: recurrenceLabel[r] }))]}
            />
          </>
      </form>
    </div>
  );
}
