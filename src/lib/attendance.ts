// Wer isst am Abend mit? Ohne Angabe gilt „da“. Ein Termin zwischen 18 und 20 Uhr oder ein
// ganztägiger Termin macht daraus „wahrscheinlich nicht“, bis die Person es selbst festlegt.

import { occurrences } from "./recurrence";
import type { Attendance, CalEvent, Person } from "./types";

export type PresenceState = "yes" | "no" | "maybe";
export type Presence = { state: PresenceState; reason?: string };

const hm = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export function presenceFor(day: string, people: Person[], attendance: Attendance[], events: CalEvent[]): Record<string, Presence> {
  const d0 = new Date(`${day}T00:00:00`);
  const d1 = new Date(`${day}T23:59:59`);
  const eveningFrom = new Date(`${day}T18:00:00`);
  const eveningTo = new Date(`${day}T20:00:00`);
  const occ = occurrences(events, d0, d1);
  const out: Record<string, Presence> = {};
  for (const p of people) {
    const explicit = attendance.find((a) => a.day === day && a.personId === p.id);
    if (explicit) {
      out[p.id] = { state: explicit.present ? "yes" : "no" };
      continue;
    }
    const clash = occ.find((o) => o.event.people.includes(p.id) && (o.event.allDay ? o.start <= d0 && o.end > d0 : o.start < eveningTo && o.end > eveningFrom));
    out[p.id] = clash ? { state: "maybe", reason: clash.event.allDay ? clash.event.title : `${clash.event.title} ${hm(clash.start)}` } : { state: "yes" };
  }
  return out;
}

/** Zahl der Personen, die sicher mitessen (mindestens 1) */
export function eaters(presence: Record<string, Presence>) {
  return Math.max(1, Object.values(presence).filter((p) => p.state === "yes").length);
}

/** Nächster Zustand beim Antippen: da → nicht da → da; „wahrscheinlich nicht“ wird zu „nicht da“ bestätigt */
export function nextPresence(state: PresenceState): boolean {
  return state === "no";
}
