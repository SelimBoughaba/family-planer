"use client";

import { useRef, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { recipeEmoji } from "@/lib/recipes";
import type { Recipe } from "@/lib/types";

const COLORS = ["#FF9F0A", "#FF453A", "#BF5AF2", "#0A84FF", "#30D158", "#FFD60A", "#64D2FF", "#FF375F", "#5E5CE6", "#AC8E68"];
const MAX = 10;

function shift(day: string, n: number) {
  const d = new Date(`${day}T12:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Favoriten, bei weniger als vier alle Rezepte; was in den sieben Tagen davor geplant war, fliegt raus */
function candidates(recipes: Recipe[], recentIds: Set<string>) {
  const favs = recipes.filter((r) => r.favorite);
  const base = favs.length >= 4 ? favs : recipes;
  const fresh = base.filter((r) => !recentIds.has(r.id));
  const pool = fresh.length >= 2 ? fresh : base;
  return [...pool].sort(() => Math.random() - 0.5).slice(0, MAX);
}

const short = (t: string) => (t.length > 12 ? `${t.slice(0, 11)}…` : t);

/** Glücksrad: mit dem Finger anschubsen oder „Drehen“ tippen, oben zeigt der Pfeil auf das Ergebnis */
export function MealWheel({ day, onPick }: { day: string; onPick: (r: Recipe) => void }) {
  const { state } = useFamily();
  const [list] = useState(() => {
    const recent = new Set((state?.meals ?? []).filter((m) => m.day >= shift(day, -7) && m.day < day && m.recipeId).map((m) => m.recipeId as string));
    return candidates(state?.recipes ?? [], recent);
  });
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Recipe | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ last: number; t: number; v: number } | null>(null);

  if (list.length < 2) {
    return (
      <p className="subhead mt-4 px-1" style={{ color: "var(--label-2)" }}>
        Für das Glücksrad braucht ihr mindestens zwei Rezepte. Markiert eure Lieblingsrezepte mit einem Stern, dann dreht das Rad über die Favoriten.
      </p>
    );
  }

  const seg = 360 / list.length;
  const R = 100;

  const spin = (extra = 0) => {
    if (spinning) return;
    setResult(null);
    setSpinning(true);
    setRot((r) => r + 360 * 5 + extra + Math.random() * 360);
  };

  const done = () => {
    setSpinning(false);
    const a = (((-rot % 360) + 360) % 360) as number;
    setResult(list[Math.floor(a / seg) % list.length]);
  };

  const angleAt = (x: number, y: number) => {
    const r = ref.current!.getBoundingClientRect();
    return (Math.atan2(y - (r.top + r.height / 2), x - (r.left + r.width / 2)) * 180) / Math.PI;
  };

  return (
    <div className="mt-4 flex flex-col items-center">
      <div
        ref={ref}
        className="relative h-72 w-72 touch-none select-none"
        onPointerDown={(e) => {
          if (spinning) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { last: angleAt(e.clientX, e.clientY), t: performance.now(), v: 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const a = angleAt(e.clientX, e.clientY);
          let delta = a - d.last;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          const now = performance.now();
          d.v = delta / Math.max(1, now - d.t);
          d.last = a;
          d.t = now;
          setRot((r) => r + delta);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          // kräftig angeschubst: drehen lassen
          if (d && Math.abs(d.v) > 0.25) spin(d.v > 0 ? 0 : -720);
        }}
        role="button"
        aria-label="Glücksrad drehen"
      >
        <svg
          viewBox="-104 -104 208 208"
          className="h-full w-full"
          style={{ transform: `rotate(${rot}deg)`, transition: spinning ? "transform 4.2s cubic-bezier(0.12, 0.6, 0.08, 1)" : "none" }}
          onTransitionEnd={done}
          aria-hidden
        >
          {list.map((r, i) => {
            const a0 = ((i * seg - 90) * Math.PI) / 180;
            const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
            const mid = (i + 0.5) * seg - 90;
            const large = seg > 180 ? 1 : 0;
            return (
              <g key={r.id}>
                <path
                  d={`M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 ${large} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`}
                  fill={COLORS[i % COLORS.length]}
                  stroke="white"
                  strokeWidth="1.5"
                />
                <g transform={`rotate(${mid}) translate(58 0)`}>
                  <text textAnchor="middle" dominantBaseline="central" fontSize="14" transform="translate(30 0) rotate(90)">
                    {recipeEmoji(r.title, r.tags)}
                  </text>
                  <text textAnchor="middle" dominantBaseline="central" fontSize={list.length > 7 ? 7 : 8.5} fontWeight="650" fill="white" transform="translate(-5 0)">
                    {short(r.title)}
                  </text>
                </g>
              </g>
            );
          })}
          <circle r="16" fill="white" />
          <circle r="16" fill="none" stroke="rgba(0,0,0,.08)" />
        </svg>
        {/* Zeiger oben */}
        <svg viewBox="0 0 24 20" className="absolute top-[-6px] left-1/2 h-6 w-7 -translate-x-1/2" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.3))" }} aria-hidden>
          <path d="M12 20 L2 2 Q12 -2 22 2 Z" fill="var(--label)" />
        </svg>
      </div>

      {result ? (
        <div className="fade-in mt-5 w-full text-center" role="status">
          <p className="subhead" style={{ color: "var(--label-2)" }}>
            Das Rad sagt
          </p>
          <p className="title-2 mt-0.5">
            {recipeEmoji(result.title, result.tags)} {result.title}
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => onPick(result)} className="press subhead flex-1 rounded-[12px] py-2.5 font-semibold text-white" style={{ background: "var(--tint)" }}>
              Einplanen
            </button>
            <button
              onClick={() => spin()}
              className="press subhead flex-1 rounded-[12px] py-2.5 font-semibold"
              style={{ background: "color-mix(in oklab, var(--tint) 12%, transparent)", color: "var(--tint)" }}
            >
              Nochmal
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => spin()}
          disabled={spinning}
          className="press subhead mt-5 w-full rounded-[12px] py-2.5 font-semibold text-white"
          style={{ background: spinning ? "var(--label-3)" : "var(--tint)" }}
        >
          {spinning ? "Dreht …" : "Drehen"}
        </button>
      )}
      <p className="caption mt-2 text-center" style={{ color: "var(--label-3)" }}>
        Oder mit dem Finger anschubsen. {(state?.recipes.filter((r) => r.favorite).length ?? 0) >= 4 ? "Es dreht über eure Favoriten" : "Es dreht über alle Rezepte"}, ohne was in
        der Woche davor schon dran war.
      </p>
    </div>
  );
}
