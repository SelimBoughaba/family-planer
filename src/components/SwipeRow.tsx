"use client";

import { useRef, useState, type ReactNode } from "react";

type Action = {
  label: string;
  color: string;
  icon: ReactNode;
  onTrigger: () => void;
};

type Props = {
  children: ReactNode;
  /** nach rechts wischen */
  leading?: Action;
  /** nach links wischen */
  trailing?: Action;
  onLongPress?: () => void;
  className?: string;
};

const THRESHOLD = 88;
const LONG_PRESS_MS = 450;

/**
 * Zeile mit iOS-artigen Gesten: horizontales Wischen löst Aktionen aus,
 * langes Drücken öffnet ein Kontextmenü. Vertikales Scrollen bleibt frei.
 */
export function SwipeRow({ children, leading, trailing, onLongPress, className }: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pressed, setPressed] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPressed(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    longFired.current = false;
    if (onLongPress) {
      setPressed(true);
      timer.current = setTimeout(() => {
        longFired.current = true;
        setPressed(false);
        navigator.vibrate?.(10);
        onLongPress();
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    if (!axis.current && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      axis.current = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      clearTimer();
      if (axis.current === "x") {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (axis.current === "x") {
      let next = mx;
      if (next > 0 && !leading) next = 0;
      if (next < 0 && !trailing) next = 0;
      // Widerstand jenseits der Schwelle
      if (Math.abs(next) > THRESHOLD) next = Math.sign(next) * (THRESHOLD + (Math.abs(next) - THRESHOLD) * 0.35);
      setDx(next);
    }
  };

  const end = () => {
    clearTimer();
    if (axis.current === "x") {
      if (dx > THRESHOLD * 0.9 && leading) leading.onTrigger();
      else if (dx < -THRESHOLD * 0.9 && trailing) trailing.onTrigger();
    }
    start.current = null;
    axis.current = null;
    setDragging(false);
    setDx(0);
  };

  const progress = Math.min(Math.abs(dx) / THRESHOLD, 1);
  const active = dx > 0 ? leading : dx < 0 ? trailing : undefined;
  const armed = progress >= 0.9;

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      {active && (
        <div
          className="absolute inset-0 flex items-center px-5 text-white"
          style={{
            background: active.color,
            justifyContent: dx > 0 ? "flex-start" : "flex-end",
            opacity: 0.35 + progress * 0.65,
          }}
          aria-hidden
        >
          <span
            className="flex items-center gap-2 subhead font-semibold"
            style={{ transform: `scale(${armed ? 1.08 : 0.9})`, transition: "transform 160ms ease" }}
          >
            {active.icon}
            {active.label}
          </span>
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          if (longFired.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onContextMenu={(e) => onLongPress && e.preventDefault()}
        className="relative select-none"
        style={{
          transform: `translate3d(${dx}px,0,0) scale(${pressed ? 0.985 : 1})`,
          transition: dragging ? "none" : "transform 320ms cubic-bezier(0.2, 0.9, 0.3, 1)",
          touchAction: "pan-y",
          WebkitTouchCallout: "none",
          background: dx !== 0 ? "var(--row-solid)" : "transparent",
        }}
      >
        {children}
      </div>
    </div>
  );
}
