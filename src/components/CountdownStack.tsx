"use client";

import { haptic } from "@/lib/client/haptics";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useFamily } from "@/lib/client/family";
import { occurrences, type Occurrence } from "@/lib/recurrence";
import { countdownParts, suggestEmoji } from "@/lib/countdown";
import { FALLBACK_COLOR } from "@/lib/types";

const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Countdowns oben in Heute: ein Stapel festlicher Karten.
 * Links und rechts wischen blättert, der Schwung entscheidet (nicht nur die Strecke).
 */
export function CountdownStack({ onOpen }: { onOpen: (o: Occurrence) => void }) {
  const { state, color } = useFamily();
  const [now, setNow] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  const minute = Math.floor(now / 60000);
  const list = useMemo(() => {
    const now = minute * 60000;
    const events = (state?.events ?? []).filter((e) => e.countdown);
    if (!events.length) return [];
    const from = new Date(now - 2 * DAY);
    const occ = occurrences(events, from, new Date(now + 800 * DAY));
    // je Termin nur das nächste Vorkommen, das noch nicht vorbei ist
    const seen = new Set<string>();
    return occ.filter((o) => {
      if (+o.end <= now || seen.has(o.event.id)) return false;
      seen.add(o.event.id);
      return true;
    });
    // Minutentakt reicht für die Auswahl; die Anzeige tickt separat
  }, [state?.events, minute]);

  const live = list.some((o) => +o.start - now < DAY && +o.start > now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), live ? 1000 : 30000);
    return () => clearInterval(id);
  }, [live]);

  const count = list.length;
  const current = count ? ((index % count) + count) % count : 0;

  const x = useMotionValue(0);
  const width = useRef(340);
  // nach dem Wischen kein Antippen auslösen
  const dragged = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const rotate = useTransform(x, [-300, 0, 300], [-6, 0, 6]);

  const go = (dir: 1 | -1, velocity = 0) => {
    if (count > 1) haptic();
    if (count < 2) {
      void animate(x, 0, { type: "spring", bounce: 0.3, duration: 0.4, velocity });
      return;
    }
    if (reduce) {
      setIndex((i) => i + dir);
      return;
    }
    // Karte fliegt mit dem Schwung des Fingers hinaus, danach rückt die nächste nach vorn
    void animate(x, -dir * (width.current + 60), { type: "spring", bounce: 0, duration: 0.3, velocity }).then(() => {
      setIndex((i) => i + dir);
      x.jump(0);
    });
  };

  if (!count) return null;

  const layers = Math.min(count, 3);
  return (
    <section className="mt-4" aria-roledescription="Karussell" aria-label="Countdowns">
      <div ref={box} className="relative" style={{ height: 156 + (layers - 1) * 8 }}>
        {Array.from({ length: layers })
          .map((_, depth) => depth)
          .reverse()
          .map((depth) => {
            const o = list[(current + depth) % count];
            const tint = color(o.event.people[0]) === FALLBACK_COLOR ? "var(--tint)" : color(o.event.people[0]);
            const front = depth === 0;
            return (
              <motion.div
                key={`${o.key}-${depth === 0 ? "front" : depth}`}
                className="absolute inset-x-0 top-0"
                initial={false}
                animate={{ y: depth * 8, scale: 1 - depth * 0.045, opacity: depth === 2 ? 0.5 : 1 }}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                style={front ? { x, rotate, zIndex: 3, touchAction: "pan-y" } : { zIndex: 3 - depth, pointerEvents: "none" }}
                drag={front && count > 1 ? "x" : false}
                dragElastic={0.9}
                dragConstraints={{ left: 0, right: 0 }}
                dragMomentum={false}
                onDragStart={() => {
                  dragged.current = true;
                  width.current = box.current?.offsetWidth ?? 340;
                }}
                onDragEnd={(_, info) => {
                  setTimeout(() => (dragged.current = false), 80);
                  // Richtung aus dem Schwung, sonst aus der Strecke
                  const v = info.velocity.x;
                  if (v < -350 || info.offset.x < -90) go(1, v);
                  else if (v > 350 || info.offset.x > 90) go(-1, v);
                  else void animate(x, 0, { type: "spring", bounce: 0.25, duration: 0.4, velocity: v });
                }}
              >
                <CountdownCard occ={o} now={now} tint={tint} dim={!front} onOpen={() => !dragged.current && onOpen(o)} />
              </motion.div>
            );
          })}
      </div>
      {count > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5" role="tablist" aria-label="Countdown wählen">
          {list.map((o, i) => (
            <button
              key={o.key}
              role="tab"
              aria-selected={i === current}
              aria-label={o.event.title}
              onClick={() => setIndex(i)}
              className="h-1.5 rounded-full"
              style={{
                width: i === current ? 16 : 6,
                background: i === current ? "var(--label)" : "var(--label-3)",
                transition: "width 220ms var(--ease-out), background-color 220ms ease",
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CountdownCard({ occ, now, tint, dim, onOpen }: { occ: Occurrence; now: number; tint: string; dim: boolean; onOpen: () => void }) {
  const e = occ.event;
  const emoji = e.countdownEmoji ?? suggestEmoji(e.title);
  const p = countdownParts(now, +occ.start);
  const dateLabel = occ.start.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: occ.start.getFullYear() !== new Date(now).getFullYear() ? "numeric" : undefined,
  });
  const timeLabel = e.allDay ? "" : `, ${occ.start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;

  return (
    <button
      onClick={onOpen}
      className="glass glass-strong flex h-[156px] w-full items-center gap-4 overflow-hidden rounded-[26px] p-4 text-left"
      aria-label={`Countdown ${e.title}`}
      tabIndex={dim ? -1 : 0}
    >
      {/* festliche Tönung in der Personenfarbe, ruhig gehalten */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, ${tint} 26%, transparent), transparent 60%), radial-gradient(80% 70% at 100% 100%, color-mix(in oklab, ${tint} 12%, transparent), transparent 70%)`,
        }}
        aria-hidden
      />
      <span
        className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-[24px] text-[42px]"
        // hintere Karten zeigen nur ihre Fläche, sonst scheint Text durchs Glas
        hidden={dim}
        style={{
          background: `linear-gradient(155deg, color-mix(in oklab, ${tint} 30%, var(--row-solid)), color-mix(in oklab, ${tint} 10%, var(--row-solid)))`,
          boxShadow: `0 10px 24px -12px color-mix(in oklab, ${tint} 70%, transparent), inset 0 1px 0 rgba(255,255,255,.6)`,
        }}
        aria-hidden
      >
        {emoji}
      </span>
      <span className="relative min-w-0 flex-1" style={{ visibility: dim ? "hidden" : undefined }}>
        <span className="footnote block truncate font-semibold" style={{ color: tint }}>
          {p.done ? "Es ist so weit" : "Noch"}
        </span>
        {p.done ? (
          <span className="block text-[26px] leading-[30px] font-bold tracking-[-0.02em]">Heute! 🎉</span>
        ) : p.live ? (
          <span className="tabular block text-[34px] leading-[38px] font-bold tracking-[-0.03em]">
            {p.hours}:{pad(p.minutes)}
            <span style={{ color: "var(--label-2)" }}>:{pad(p.seconds)}</span>
          </span>
        ) : (
          <span className="block leading-[38px]">
            <span className="tabular text-[38px] font-bold tracking-[-0.03em]">{p.days}</span>
            <span className="ml-1.5 text-[17px] font-semibold" style={{ color: "var(--label-2)" }}>
              {p.days === 1 ? "Tag" : "Tage"}
            </span>
          </span>
        )}
        <span className="headline mt-1 block truncate">{e.title}</span>
        <span className="footnote block truncate" style={{ color: "var(--label-2)" }}>
          {dateLabel}
          {timeLabel}
        </span>
      </span>
      {p.done && !dim && <Confetti id={occ.key} />}
    </button>
  );
}

/** Einmal Konfetti pro Ereignis und Gerät, wenn es so weit ist */
function Confetti({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || !ref.current) return;
    const key = `fp_confetti_${id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {}
    const host = ref.current;
    const colors = ["#FF453A", "#FF9F0A", "#FFD60A", "#30D158", "#0A84FF", "#BF5AF2"];
    const pieces: HTMLSpanElement[] = [];
    for (let i = 0; i < 26; i++) {
      const s = document.createElement("span");
      const size = 6 + (i % 3) * 2;
      Object.assign(s.style, {
        position: "absolute",
        left: "60px",
        top: "70px",
        width: `${size}px`,
        height: `${size * 0.6}px`,
        background: colors[i % colors.length],
        borderRadius: "2px",
        pointerEvents: "none",
      });
      host.appendChild(s);
      pieces.push(s);
      const angle = (i / 26) * Math.PI * 2;
      const dist = 70 + ((i * 37) % 60);
      s.animate(
        [
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist * 0.7 - 20}px) rotate(${i * 47}deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${Math.cos(angle) * dist * 1.1}px, ${Math.sin(angle) * dist * 0.7 + 50}px) rotate(${i * 90}deg)`, opacity: 0 },
        ],
        { duration: 1300, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" },
      );
    }
    const t = setTimeout(() => pieces.forEach((p) => p.remove()), 1500);
    return () => clearTimeout(t);
  }, [id, reduce]);
  return <span ref={ref} className="pointer-events-none absolute inset-0" aria-hidden />;
}
