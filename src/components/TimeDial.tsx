"use client";

import { useRef, useState } from "react";

const SIZE = 270;
const C = SIZE / 2;
const R = 104; // Ring
const STEP = 5; // Minuten
const DAY = 1440;
const TURN = 720; // eine Umdrehung = 12 Stunden
const MAX_DUR = 720;

const fmt = (min: number) => {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export const durationLabel = (d: number) => {
  const h = Math.floor(d / 60);
  const m = d % 60;
  if (!h) return `${m} Min.`;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
};

const angleOf = (min: number) => ((min % TURN) / TURN) * 2 * Math.PI - Math.PI / 2;
const point = (min: number, r = R) => ({ x: C + r * Math.cos(angleOf(min)), y: C + r * Math.sin(angleOf(min)) });
const wrap = (m: number) => ((m % DAY) + DAY) % DAY;

function arcPath(start: number, dur: number) {
  const a = point(start);
  const b = point(start + dur);
  const large = dur > TURN / 2 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${R} ${R} 0 ${large} 1 ${b.x} ${b.y}`;
}

const dayPart = (min: number) => {
  const h = Math.floor(wrap(min) / 60);
  if (h < 5) return "nachts";
  if (h < 11) return "vormittags";
  if (h < 14) return "mittags";
  if (h < 18) return "nachmittags";
  return "abends";
};

type Drag = "start" | "end" | "move" | null;

/**
 * Drehrad wie ein Zifferblatt: eine Umdrehung sind 12 Stunden.
 * Dreht man über die 12, läuft die Zeit weiter in die andere Tageshälfte.
 * start: Minuten seit Mitternacht, duration: Minuten (bis 12 Std.).
 */
export function TimeDial({ start, duration, color, onChange }: { start: number; duration: number; color: string; onChange: (start: number, duration: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const last = useRef(0);

  // Winkel unter dem Finger in Minuten innerhalb einer Umdrehung
  const dialMinutes = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const x = clientX - r.left - r.width / 2;
    const y = clientY - r.top - r.height / 2;
    let a = Math.atan2(y, x) + Math.PI / 2;
    if (a < 0) a += 2 * Math.PI;
    return (a / (2 * Math.PI)) * TURN;
  };

  const down = (which: Drag, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    last.current = dialMinutes(e.clientX, e.clientY);
    setDrag(which);
  };

  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const now = dialMinutes(e.clientX, e.clientY);
    // kürzeste Drehung seit dem letzten Ereignis, damit 11 → 1 Uhr weiterläuft statt zurückspringt
    let delta = now - last.current;
    if (delta > TURN / 2) delta -= TURN;
    if (delta < -TURN / 2) delta += TURN;
    const snapped = Math.round(delta / STEP) * STEP;
    if (!snapped) return;
    last.current += snapped;

    if (drag === "move") onChange(wrap(start + snapped), duration);
    else if (drag === "end") onChange(start, Math.min(MAX_DUR, Math.max(STEP, duration + snapped)));
    else {
      const d = duration - snapped;
      if (d >= STEP && d <= MAX_DUR) onChange(wrap(start + snapped), d);
    }
  };

  const end = start + duration;
  const s = point(start);
  const en = point(end);

  return (
    <div className="flex flex-col items-center">
      <svg
        ref={ref}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="touch-none select-none"
        onPointerMove={move}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        role="group"
        aria-label={`Von ${fmt(start)} bis ${fmt(end)} Uhr`}
      >
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--separator)" strokeWidth="26" />
        {Array.from({ length: 60 }).map((_, i) => {
          const major = i % 5 === 0;
          const a = point(i * 12, R + 20);
          const b = point(i * 12, R + (major ? 15 : 17.5));
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--label-3)" strokeWidth={major ? 1.5 : 0.8} strokeLinecap="round" />;
        })}
        {[12, 3, 6, 9].map((h) => {
          const p = point((h % 12) * 60, R - 30);
          return (
            <text key={h} x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--label-3)" className="tabular">
              {h}
            </text>
          );
        })}
        <path
          d={arcPath(start, Math.min(duration, TURN - 0.01))}
          fill="none"
          style={{ stroke: color, cursor: "grab", opacity: drag === "move" ? 0.85 : 1 }}
          strokeWidth="26"
          strokeLinecap="round"
          onPointerDown={(e) => down("move", e)}
        />
        {(
          [
            ["start", s],
            ["end", en],
          ] as const
        ).map(([which, p]) => (
          <g key={which} onPointerDown={(e) => down(which, e)} style={{ cursor: "grab" }}>
            <circle cx={p.x} cy={p.y} r="22" fill="transparent" />
            <circle cx={p.x} cy={p.y} r={drag === which ? 11 : 9.5} fill="white" style={{ transition: "r 120ms ease", filter: "drop-shadow(0 1px 3px rgba(0,0,0,.3))" }} />
            {which === "start" ? (
              <circle cx={p.x} cy={p.y} r="3" style={{ fill: color }} />
            ) : (
              <rect x={p.x - 3} y={p.y - 3} width="6" height="6" rx="1.2" style={{ fill: color }} />
            )}
          </g>
        ))}
        <text x={C} y={C - 10} textAnchor="middle" fontSize="26" fontWeight="650" fill="var(--label)" className="tabular">
          {fmt(start)}
        </text>
        <text x={C} y={C + 12} textAnchor="middle" fontSize="13" fill="var(--label-2)" className="tabular">
          bis {fmt(end)}
          {end >= DAY ? " (+1)" : ""}
        </text>
        <text x={C} y={C + 32} textAnchor="middle" fontSize="12" fontWeight="600" style={{ fill: color }}>
          {durationLabel(duration)}, {dayPart(start)}
        </text>
      </svg>
      <p className="caption mt-1 text-center" style={{ color: "var(--label-3)" }}>
        Punkt dreht den Beginn, Quadrat das Ende, der Bogen verschiebt beides. Über die 12 drehen wechselt die Tageshälfte.
      </p>
    </div>
  );
}
