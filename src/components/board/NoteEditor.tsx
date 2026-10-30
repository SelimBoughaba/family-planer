"use client";

import { useRef, useState } from "react";
import { addPoint, hasPressure, INK_COLORS, INK_SIZES, NOTE_COLORS, strokePath } from "@/lib/client/ink";
import type { BoardItem, Stroke } from "@/lib/types";
import { Sheet } from "../ui";
import { HAND_FONT } from "./BoardItemView";

export type NoteDraft = { text: string | null; ink: Stroke[] | null; color: string; expires: string | null };

const NOTE = 180; // Seitenlänge eines Zettels auf der Wand

/** Zettel schreiben: tippen oder mit Apple Pencil (oder Finger) direkt auf den Zettel */
export function NoteEditor({
  note,
  onClose,
  onSave,
  onDelete,
  expiry = true,
  deleteLabel = "In den Papierkorb",
  z = 80,
}: {
  note: Pick<BoardItem, "w" | "color" | "text" | "ink" | "expires"> | null;
  onClose: () => void;
  onSave: (d: NoteDraft) => void;
  onDelete?: () => void;
  /** Ablaufdatum anbieten (Pinnwand ja, Tresor nein) */
  expiry?: boolean;
  deleteLabel?: string;
  z?: number;
}) {
  const [color, setColor] = useState(() => note?.color ?? NOTE_COLORS[Math.floor(Math.random() * 5)]);
  const [text, setText] = useState(note?.text ?? "");
  const [mode, setMode] = useState<"tippen" | "schreiben">(note?.ink?.length && !note.text ? "schreiben" : "tippen");
  // Größe der Schreibfläche einmal beim Öffnen festlegen, die Striche hängen daran
  const [pad] = useState(() => (typeof window === "undefined" ? 300 : Math.min(340, window.innerWidth - 48)));
  const scale = pad / (note?.w ?? NOTE);
  // Striche im Editor in Pad-Koordinaten
  const [strokes, setStrokes] = useState<Stroke[]>(() => (note?.ink ?? []).map((s) => ({ ...s, s: s.s * scale, p: s.p.map((v, i) => (i % 3 === 2 ? v : v * scale)) })));
  const [penColor, setPenColor] = useState(INK_COLORS[0]);
  const [penSize, setPenSize] = useState(1);
  const [expires, setExpires] = useState(note?.expires ?? "");
  const [withExpiry, setWithExpiry] = useState(!!note?.expires);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const live = useRef<{ id: number; s: Stroke } | null>(null);
  const livePath = useRef<SVGPathElement>(null);
  const penSeen = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pointerType === "pen" ? e.pressure || 0.5 : 0.5 };
  };

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "pen") penSeen.current = true;
    // mit Stift unterwegs: Finger und Handballen zeichnen nicht
    if (penSeen.current && e.pointerType !== "pen") return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y, p } = at(e);
    const s: Stroke = { c: penColor, s: INK_SIZES[penSize] * 1.4, p: [] };
    addPoint(s.p, x, y, p);
    live.current = { id: e.pointerId, s };
  };
  const move = (e: React.PointerEvent) => {
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    const r = box.current!.getBoundingClientRect();
    for (const ev of events.length ? events : [e.nativeEvent]) addPoint(l.s.p, ev.clientX - r.left, ev.clientY - r.top, ev.pointerType === "pen" ? ev.pressure || 0.5 : 0.5, 0.8);
    livePath.current?.setAttribute("d", strokePath(l.s, e.pointerType === "pen"));
  };
  const up = () => {
    const l = live.current;
    live.current = null;
    livePath.current?.setAttribute("d", "");
    if (l && l.s.p.length >= 3) setStrokes((s) => [...s, l.s]);
  };

  const save = () => {
    const back = 1 / scale;
    const ink = strokes.length
      ? strokes.map((s) => ({ ...s, s: Math.round(s.s * back * 10) / 10, p: s.p.map((v, i) => (i % 3 === 2 ? v : Math.round(v * back * 10) / 10)) }))
      : null;
    onSave({ text: text.trim() || null, ink, color, expires: withExpiry && expires ? expires : null });
  };

  const empty = !text.trim() && !strokes.length;

  return (
    <Sheet
      open
      onClose={onClose}
      title={note ? "Zettel" : "Neuer Zettel"}
      z={z}
      leading={
        <button onClick={onClose} className="body" style={{ color: "var(--tint)" }}>
          Abbrechen
        </button>
      }
      trailing={
        <button onClick={save} disabled={empty} className="body font-semibold" style={{ color: empty ? "var(--label-3)" : "var(--tint)" }}>
          {note ? "Fertig" : "Anpinnen"}
        </button>
      }
    >
      <div className="no-scrollbar -mx-4 mt-2 flex gap-2.5 overflow-x-auto px-4">
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="press h-9 w-9 shrink-0 rounded-[10px]"
            style={{ background: c, boxShadow: color === c ? "0 0 0 2.5px var(--bg), 0 0 0 4.5px var(--tint)" : "inset 0 0 0 1px rgba(0,0,0,.1)" }}
            aria-label={`Farbe ${c}`}
            aria-pressed={color === c}
          />
        ))}
      </div>

      <div className="relative mt-4 flex rounded-[10px] p-[2px]" style={{ background: "var(--fill)" }}>
        {(["tippen", "schreiben"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="footnote relative flex-1 rounded-[8px] py-1.5 font-semibold"
            style={{ background: mode === m ? "var(--glass-strong)" : "transparent" }}
            aria-pressed={mode === m}
          >
            {m === "tippen" ? "⌨️ Tippen" : "✏️ Mit Stift schreiben"}
          </button>
        ))}
      </div>

      <div className="mt-4 flex justify-center">
        <div
          ref={box}
          className="relative touch-none select-none"
          style={{ width: pad, height: pad, background: color, borderRadius: 4, boxShadow: "0 14px 24px -12px rgba(0,0,0,.4)" }}
          onPointerDown={mode === "schreiben" ? down : undefined}
          onPointerMove={mode === "schreiben" ? move : undefined}
          onPointerUp={mode === "schreiben" ? up : undefined}
          onPointerCancel={mode === "schreiben" ? up : undefined}
        >
          {mode === "tippen" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Was soll an die Wand?"
              maxLength={400}
              autoFocus={!note}
              className="h-full w-full resize-none bg-transparent p-4 outline-none placeholder:text-black/30"
              style={{ fontFamily: HAND_FONT, fontSize: 24 * scale * 0.75, lineHeight: 1.25, color: "#1c1c1e", touchAction: "auto" }}
              aria-label="Text des Zettels"
            />
          ) : (
            text && (
              <p className="pointer-events-none p-4 whitespace-pre-wrap" style={{ fontFamily: HAND_FONT, fontSize: 24 * scale * 0.75, color: "rgba(0,0,0,.35)" }}>
                {text}
              </p>
            )
          )}
          <svg width={pad} height={pad} className="pointer-events-none absolute top-0 left-0" aria-hidden>
            {strokes.map((s, i) => (
              <path key={i} d={strokePath(s, hasPressure(s))} fill={s.c} />
            ))}
            <path ref={livePath} fill={penColor} />
          </svg>
        </div>
      </div>

      {mode === "schreiben" && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {INK_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setPenColor(c)}
                className="press h-7 w-7 rounded-full"
                style={{ background: c, boxShadow: penColor === c ? "0 0 0 2px var(--bg), 0 0 0 4px var(--tint)" : "none" }}
                aria-label={`Stiftfarbe ${c}`}
              />
            ))}
          </div>
          <div className="flex gap-1">
            {INK_SIZES.map((s, i) => (
              <button
                key={s}
                onClick={() => setPenSize(i)}
                className="press flex h-8 w-8 items-center justify-center rounded-full"
                style={{ background: penSize === i ? "color-mix(in oklab, var(--tint) 16%, transparent)" : "transparent" }}
                aria-label={`Stärke ${i + 1}`}
              >
                <span className="rounded-full" style={{ width: s + 3, height: s + 3, background: "var(--label)" }} />
              </button>
            ))}
            <button
              onClick={() => setStrokes((s) => s.slice(0, -1))}
              disabled={!strokes.length}
              className="press subhead ml-1 rounded-full px-2.5 font-semibold"
              style={{ color: strokes.length ? "var(--tint)" : "var(--label-3)" }}
              aria-label="Letzten Strich zurücknehmen"
            >
              ↶
            </button>
          </div>
        </div>
      )}
      {mode === "schreiben" && (
        <p className="caption mt-2 text-center" style={{ color: "var(--label-3)" }}>
          Mit Apple Pencil schreibt nur der Stift, die Hand darf auf dem Bildschirm liegen.
        </p>
      )}

      {expiry && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <button role="switch" aria-checked={withExpiry} onClick={() => setWithExpiry((v) => !v)} className="body flex items-center gap-3">
            <span
              className="relative h-[31px] w-[51px] shrink-0 rounded-full"
              style={{ background: withExpiry ? "var(--success)" : "color-mix(in oklab, var(--label) 14%, transparent)", transition: "background 200ms ease" }}
            >
              <span
                className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white"
                style={{ left: withExpiry ? 22 : 2, boxShadow: "0 3px 8px rgba(0,0,0,.15)", transition: "left 220ms ease" }}
              />
            </span>
            Hängt sich selbst ab
          </button>
          {withExpiry && (
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="body glass rounded-[12px] px-3 py-1.5" aria-label="Ablaufdatum" />
          )}
        </div>
      )}

      {onDelete && (
        <button
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          className="press body mt-7 w-full rounded-[14px] py-3 font-semibold"
          style={{ background: "color-mix(in oklab, var(--danger) 10%, transparent)", color: "var(--danger)" }}
        >
          {confirmDelete ? "Wirklich?" : deleteLabel}
        </button>
      )}
    </Sheet>
  );
}
