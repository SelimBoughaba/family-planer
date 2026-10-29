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

function addMinutes(hhmm: string, min: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (h * 60 + m + min + 24 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function roundedNow() {
  const d = new Date();
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function NewEntrySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, me, run } = useFamily();
  const [kind, setKind] = useState<Kind>("task");
  const [title, setTitle] = useState("");
  const [who, setWho] = useState<string[]>([]);
  // Aufgabe
  const [area, setArea] = useState("Haushalt");
  const [when, setWhen] = useState<"today" | "tomorrow" | "none" | "date">("today");
  const [date, setDate] = useState(localDay());
  const [rec, setRec] = useState<"none" | Recurrence>("none");
  // Termin
  const [place, setPlace] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState(roundedNow);
  const [duration, setDuration] = useState(60);
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
    setPlace("");
    setWho([]);
    setWhen("today");
    setRec("none");
    setDate(localDay());
    setStart(roundedNow());
    setDuration(60);
    setAllDay(false);
  };

  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    let ok: boolean;
    if (kind === "task") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const due = when === "today" ? localDay() : when === "tomorrow" ? localDay(tomorrow) : when === "date" ? date : null;
      ok = await run({
        op: "task.create",
        title: title.trim(),
        area,
        personId: chosen[0] ?? null,
        due: rec !== "none" && !due ? localDay() : due,
        recurring: rec === "none" ? null : rec,
      });
    } else {
      const s = allDay ? new Date(`${date}T00:00`) : new Date(`${date}T${start}`);
      const e = allDay ? new Date(new Date(`${date}T00:00`).getTime() + 86400000) : new Date(s.getTime() + duration * 60000);
      ok = await run({
        op: "event.create",
        title: title.trim(),
        place: place.trim() || null,
        startsAt: s.toISOString(),
        endsAt: e.toISOString(),
        allDay,
        people: chosen,
      });
    }
    setBusy(false);
    if (ok) {
      reset();
      onClose();
    }
  };

  const toggleWho = (id: string) => {
    if (kind === "task") return setWho([id]);
    setWho((w) => {
      const base = w.length ? w : chosen;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  };

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
          <span className="headline">{kind === "task" ? "Neue Aufgabe" : "Neuer Termin"}</span>
          <button type="submit" disabled={!title.trim() || busy} className="body font-semibold" style={{ color: title.trim() ? "var(--tint)" : "var(--label-3)" }}>
            Hinzufügen
          </button>
        </div>

        <div className="mt-3">
          <Segmented
            value={kind}
            onChange={setKind}
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
          placeholder={kind === "task" ? "Was ist zu tun?" : "Was steht an?"}
          className="title-2 mt-5 w-full bg-transparent outline-none placeholder:text-[var(--label-3)]"
          maxLength={140}
          aria-label="Titel"
        />
        {kind === "event" && (
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Ort (optional)"
            className="body mt-2 w-full bg-transparent outline-none placeholder:text-[var(--label-3)]"
            maxLength={140}
            aria-label="Ort"
          />
        )}

        <Label>{kind === "task" ? "Wer kümmert sich?" : "Wer ist dabei?"}</Label>
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

        {kind === "task" ? (
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
        ) : (
          <>
            <Label>Wann?</Label>
            <div className="flex items-center gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="body glass flex-1 rounded-[12px] px-3 py-2" aria-label="Datum" />
              {!allDay && <input type="time" value={start} onChange={(e) => setStart(e.target.value)} step={300} className="body glass tabular rounded-[12px] px-3 py-2" aria-label="Beginn" />}
            </div>
            <label className="mt-3 flex items-center justify-between">
              <span className="body">Ganztägig</span>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="peer sr-only" />
              <span
                className="relative h-[31px] w-[51px] rounded-full"
                style={{ background: allDay ? "var(--success)" : "color-mix(in oklab, var(--label) 14%, transparent)", transition: "background 200ms ease" }}
                aria-hidden
              >
                <span
                  className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white"
                  style={{ left: allDay ? 22 : 2, boxShadow: "0 3px 8px rgba(0,0,0,.15)", transition: "left 220ms cubic-bezier(0.3, 1.3, 0.5, 1)" }}
                />
              </span>
            </label>
            {!allDay && (
              <>
                <Label>Dauer</Label>
                <Chips
                  value={String(duration)}
                  onChange={(v) => setDuration(Number(v))}
                  options={[30, 60, 90, 120, 180].map((m) => ({ id: String(m), label: m < 60 ? `${m} Min.` : `${m / 60} Std.`.replace(".5 Std.", ",5 Std.") }))}
                />
                <p className="footnote tabular mt-2" style={{ color: "var(--label-2)" }}>
                  {start} bis {addMinutes(start, duration)} Uhr
                </p>
              </>
            )}
          </>
        )}
      </form>
    </div>
  );
}
