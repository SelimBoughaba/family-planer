"use client";

import { useMemo } from "react";
import { useFamily } from "@/lib/client/family";
import { eaters, nextPresence, presenceFor, type Presence } from "@/lib/attendance";
import { Avatar, Sheet } from "../ui";

export function usePresence(day: string) {
  const { state } = useFamily();
  return useMemo(() => presenceFor(day, state?.people ?? [], state?.attendance ?? [], state?.events ?? []), [day, state?.people, state?.attendance, state?.events]);
}

export function eatersLabel(presence: Record<string, Presence>) {
  const n = eaters(presence);
  const allNo = Object.values(presence).every((p) => p.state !== "yes");
  return allNo ? "niemand isst mit" : n === 1 ? "1 isst mit" : `${n} essen mit`;
}

/** Profilbilder: farbig = isst mit, grau durchgestrichen = nicht da, blass mit ? = wahrscheinlich nicht */
export function AttendanceRow({ day, size = 32, interactive = true, names = false }: { day: string; size?: number; interactive?: boolean; names?: boolean }) {
  const { state, run } = useFamily();
  const presence = usePresence(day);
  const people = state?.people ?? [];
  return (
    <div className="flex items-start gap-2.5">
      {people.map((p) => {
        const s = presence[p.id]?.state ?? "yes";
        const label = `${p.name}: ${s === "yes" ? "isst mit" : s === "no" ? "nicht da" : `wahrscheinlich nicht (${presence[p.id]?.reason})`}`;
        const face = (
          <span
            className="relative block"
            style={{ opacity: s === "yes" ? 1 : s === "maybe" ? 0.5 : 0.28, filter: s === "no" ? "grayscale(1)" : "none", transition: "opacity 200ms ease, filter 200ms ease" }}
          >
            <Avatar person={p} size={size} />
            {s === "no" && (
              <span className="absolute top-1/2 left-[-8%] h-[2.5px] w-[116%] -translate-y-1/2 -rotate-45 rounded-full" style={{ background: "var(--label)" }} aria-hidden />
            )}
            {s === "maybe" && (
              <span
                className="caption absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full font-bold text-white"
                style={{ background: "#FF9F0A", fontSize: 10 }}
                aria-hidden
              >
                ?
              </span>
            )}
          </span>
        );
        return interactive ? (
          <button
            key={p.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void run({ op: "meal.attend", day, personId: p.id, present: nextPresence(s) });
            }}
            className="press flex flex-col items-center gap-1"
            aria-label={label}
            title={label}
          >
            {face}
            {names && <span className="caption">{p.name}</span>}
          </button>
        ) : (
          <span key={p.id} className="flex flex-col items-center gap-1" aria-label={label} title={label}>
            {face}
            {names && <span className="caption">{p.name}</span>}
          </span>
        );
      })}
    </div>
  );
}

/** Gründe für „wahrscheinlich nicht“ als kurze Zeile */
export function MaybeHint({ day }: { day: string }) {
  const { person } = useFamily();
  const presence = usePresence(day);
  const maybe = Object.entries(presence).filter(([, p]) => p.state === "maybe");
  if (!maybe.length) return null;
  return (
    <p className="footnote mt-2" style={{ color: "var(--label-2)" }}>
      Wahrscheinlich nicht da: {maybe.map(([id, p]) => `${person(id)?.name} (${p.reason})`).join(", ")}. Antippen bestätigt.
    </p>
  );
}

export function AttendanceSheet({ day, onClose }: { day: string | null; onClose: () => void }) {
  if (!day) return null;
  return <SheetInner day={day} onClose={onClose} />;
}

function SheetInner({ day, onClose }: { day: string; onClose: () => void }) {
  const presence = usePresence(day);
  const d = new Date(`${day}T12:00`);
  return (
    <Sheet open onClose={onClose} title={`Wer isst ${d.toLocaleDateString("de-DE", { weekday: "long" })} mit?`}>
      <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
        Antippen schaltet zwischen „isst mit“ und „nicht da“. Ohne Angabe sind alle da.
      </p>
      <div className="mt-5 flex justify-center">
        <AttendanceRow day={day} size={48} names />
      </div>
      <MaybeHint day={day} />
      <p className="headline mt-5 text-center">{eatersLabel(presence)}</p>
    </Sheet>
  );
}
