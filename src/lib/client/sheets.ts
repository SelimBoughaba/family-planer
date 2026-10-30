"use client";

import { useSyncExternalStore } from "react";

/** Wie viele Blätter gerade offen sind; der Hintergrund rückt dann wie in iOS nach hinten */
let depth = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushSheet() {
  depth += 1;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    depth = Math.max(0, depth - 1);
    emit();
  };
}

export function useSheetDepth() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => depth,
    () => 0,
  );
}

/** sichtbarer Bereich über der Tastatur als CSS-Variablen (--vvh, --vvt) */
export function trackVisualViewport() {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return () => {};
  const root = document.documentElement;
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vvt", `${vv.offsetTop}px`);
    });
  };
  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  return () => {
    cancelAnimationFrame(frame);
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
  };
}
