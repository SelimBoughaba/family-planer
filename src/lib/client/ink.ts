// Handschrift mit Apple Pencil oder Finger: Punkte mit Druck werden zu weichen, unterschiedlich breiten Strichen

import { getStroke } from "perfect-freehand";
import type { Stroke } from "@/lib/types";

export const INK_COLORS = ["#1c1c1e", "#0A84FF", "#FF3B30", "#34C759", "#FF9F0A", "#AF52DE"];
export const INK_SIZES = [2.5, 5, 10];

/** Umriss eines Strichs als SVG-Pfad */
export function strokePath(s: Stroke, pressure: boolean) {
  const pts: number[][] = [];
  for (let i = 0; i + 2 < s.p.length; i += 3) pts.push([s.p[i], s.p[i + 1], s.p[i + 2]]);
  const outline = getStroke(pts, { size: s.s, thinning: pressure ? 0.62 : 0.5, smoothing: 0.5, streamline: 0.45, simulatePressure: !pressure, last: true });
  if (!outline.length) return "";
  // Quadratische Kurven durch die Mittelpunkte: glatter Rand
  const d: (string | number)[] = ["M", outline[0][0].toFixed(1), outline[0][1].toFixed(1), "Q"];
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    d.push(x0.toFixed(1), y0.toFixed(1), ((x0 + x1) / 2).toFixed(1), ((y0 + y1) / 2).toFixed(1));
  }
  d.push("Z");
  return d.join(" ");
}

/** Hat der Strich echte Druckwerte (Apple Pencil) oder nur den Standardwert 0,5? */
export const hasPressure = (s: Stroke) => {
  for (let i = 2; i < s.p.length; i += 3) if (s.p[i] !== 0.5) return true;
  return false;
};

/** Punkte eines Strichs ausdünnen, damit gespeicherte Zeichnungen klein bleiben */
export function addPoint(p: number[], x: number, y: number, pressure: number, minDist = 1.2) {
  const n = p.length;
  if (n >= 3) {
    const dx = x - p[n - 3];
    const dy = y - p[n - 2];
    if (dx * dx + dy * dy < minDist * minDist) return false;
  }
  p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pressure * 100) / 100);
  return true;
}

/** Berührt ein Punkt (relativ) einen Strich im Radius r? Für den Radierer */
export function hitsStroke(s: Stroke, x: number, y: number, r: number) {
  const rr = (r + s.s / 2) ** 2;
  for (let i = 0; i + 1 < s.p.length; i += 3) {
    const dx = s.p[i] - x;
    const dy = s.p[i + 1] - y;
    if (dx * dx + dy * dy <= rr) return true;
  }
  return false;
}

/** Begrenzungsrahmen aller Striche (relativ) */
export function inkBounds(ink: Stroke[]) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const s of ink)
    for (let i = 0; i + 1 < s.p.length; i += 3) {
      x0 = Math.min(x0, s.p[i] - s.s);
      y0 = Math.min(y0, s.p[i + 1] - s.s);
      x1 = Math.max(x1, s.p[i] + s.s);
      y1 = Math.max(y1, s.p[i + 1] + s.s);
    }
  return isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
}

export const NOTE_COLORS = ["#FFE27A", "#FFB3C7", "#A8D8FF", "#B8F0B0", "#FFC98A", "#E2C6FF", "#FFFFFF"];
