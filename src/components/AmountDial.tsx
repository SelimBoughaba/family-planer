"use client";

import { useRef, useState } from "react";
import { Chips, Sheet } from "./ui";

type Unit = "Stück" | "g" | "kg" | "ml" | "l" | "Packung" | "Bund" | "Dose" | "Flasche";
const UNITS: Unit[] = ["Stück", "g", "kg", "ml", "l", "Packung", "Bund", "Dose", "Flasche"];

/** Schrittweite pro Rasterpunkt des Rads */
function step(unit: Unit, value: number) {
  if (unit === "g" || unit === "ml") return value >= 1000 ? 250 : value >= 200 ? 50 : 25;
  if (unit === "kg" || unit === "l") return 0.25;
  return 1;
}

const UNIT_ALIASES: Record<string, Unit> = {
  stück: "Stück", stk: "Stück", "stk.": "Stück", x: "Stück", g: "g", gr: "g", kg: "kg", ml: "ml", l: "l", liter: "l",
  packung: "Packung", packungen: "Packung", pck: "Packung", "pck.": "Packung", bund: "Bund", dose: "Dose", dosen: "Dose", flasche: "Flasche", flaschen: "Flasche",
};

export function parseAmount(a: string | null): { value: number; unit: Unit } {
  const m = (a ?? "").trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { value: 1, unit: "Stück" };
  const unit = UNIT_ALIASES[m[2].toLowerCase()] ?? "Stück";
  return { value: Number(m[1].replace(",", ".")), unit };
}

export function formatAmount(value: number, unit: Unit) {
  const v = Number.isInteger(value) ? String(value) : value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  if (unit === "Stück") return v;
  if (unit === "Packung" || unit === "Dose" || unit === "Flasche") return `${v} ${value === 1 ? unit : unit === "Packung" ? "Packungen" : `${unit}n`}`;
  return `${v} ${unit}`;
}

/**
 * Mengen-Rad: im Kreis drehen ändert die Menge, wie ein Lautstärkeregler.
 * Ein Rasterpunkt alle 24 Grad, also 15 pro Umdrehung.
 */
export function AmountDial({ name, amount, onClose, onSave }: { name: string; amount: string | null; onClose: () => void; onSave: (a: string | null) => void }) {
  const init = parseAmount(amount);
  const [unit, setUnit] = useState<Unit>(init.unit);
  const [value, setValue] = useState(init.value);
  const [angle, setAngle] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ last: number; acc: number } | null>(null);

  const angleAt = (x: number, y: number) => {
    const r = ref.current!.getBoundingClientRect();
    return (Math.atan2(y - (r.top + r.height / 2), x - (r.left + r.width / 2)) * 180) / Math.PI;
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { last: angleAt(e.clientX, e.clientY), acc: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const a = angleAt(e.clientX, e.clientY);
    let delta = a - d.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    d.last = a;
    d.acc += delta;
    setAngle((x) => x + delta);
    while (Math.abs(d.acc) >= 24) {
      const dir = Math.sign(d.acc);
      d.acc -= dir * 24;
      setValue((v) => {
        const s = step(unit, dir > 0 ? v : v - 0.001);
        const next = Math.round((v + dir * s) / s) * s;
        return Math.max(unit === "Stück" || unit === "Packung" || unit === "Bund" || unit === "Dose" || unit === "Flasche" ? 1 : s, Number(next.toFixed(2)));
      });
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  const changeUnit = (u: Unit) => {
    // sinnvoller Startwert beim Wechsel der Einheit
    const start: Record<Unit, number> = { Stück: 1, g: 250, kg: 1, ml: 500, l: 1, Packung: 1, Bund: 1, Dose: 1, Flasche: 1 };
    setUnit(u);
    setValue(start[u]);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Menge für ${name}`}
      leading={
        <button onClick={() => onSave(null)} className="body whitespace-nowrap" style={{ color: "var(--danger)" }}>
          Leeren
        </button>
      }
      trailing={
        <button onClick={() => onSave(formatAmount(value, unit))} className="body font-semibold" style={{ color: "var(--tint)" }}>
          Fertig
        </button>
      }
    >
      <p className="subhead mt-1 text-center" style={{ color: "var(--label-2)" }}>
        Im Kreis drehen: rechts herum mehr, links herum weniger
      </p>
      <div className="mt-5 flex justify-center">
        <div
          ref={ref}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="glass relative h-64 w-64 touch-none select-none rounded-full"
          role="slider"
          aria-label={`Menge für ${name}`}
          aria-valuenow={value}
          aria-valuetext={formatAmount(value, unit)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowRight") setValue((v) => Number((v + step(unit, v)).toFixed(2)));
            if (e.key === "ArrowDown" || e.key === "ArrowLeft") setValue((v) => Math.max(step(unit, v), Number((v - step(unit, v)).toFixed(2))));
          }}
        >
          {/* Rasterstriche */}
          <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" style={{ transform: `rotate(${angle}deg)` }} aria-hidden>
            {Array.from({ length: 15 }, (_, i) => {
              const a = (i * 24 * Math.PI) / 180;
              return (
                <line
                  key={i}
                  x1={100 + Math.cos(a) * 86}
                  y1={100 + Math.sin(a) * 86}
                  x2={100 + Math.cos(a) * 94}
                  y2={100 + Math.sin(a) * 94}
                  stroke={i === 0 ? "var(--tint)" : "var(--label-3)"}
                  strokeWidth={i === 0 ? 5 : 2.5}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full" style={{ background: "var(--glass-strong)", boxShadow: "inset 0 1px 0 var(--glass-edge)" }}>
            <span className="tabular text-[44px] leading-none font-bold">{Number.isInteger(value) ? value : value.toLocaleString("de-DE")}</span>
            <span className="subhead mt-1" style={{ color: "var(--label-2)" }}>
              {unit}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <Chips value={unit} onChange={changeUnit} options={UNITS.map((u) => ({ id: u, label: u }))} />
      </div>
    </Sheet>
  );
}
