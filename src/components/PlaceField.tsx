"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useFamily } from "@/lib/client/family";
import { haptic } from "@/lib/client/haptics";
import { mapsUrl, type PlaceHit } from "@/lib/types";
import { IconPin } from "./icons";

export type PlaceValue = { place: string; lat: number | null; lon: number | null };

/** Knopf, der den Ort in Apple Karten öffnet */
export function MapsLink({ place, lat, lon, compact = false }: { place: string; lat: number | null; lon: number | null; compact?: boolean }) {
  return (
    <a
      href={mapsUrl(place, lat, lon)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.stopPropagation();
        haptic();
      }}
      className={`press inline-flex shrink-0 items-center gap-1 rounded-full font-semibold ${compact ? "caption px-2 py-0.5" : "footnote px-3 py-1.5"}`}
      style={{ background: "color-mix(in oklab, var(--tint) 14%, transparent)", color: "var(--tint)" }}
      aria-label={`${place} in Karten öffnen`}
    >
      <IconPin size={compact ? 11 : 13} strokeWidth={2.1} /> Karten
    </a>
  );
}

/**
 * Ort eingeben mit Adressvorschlägen. Ein gewählter Vorschlag bringt Koordinaten mit,
 * frei getippter Text bleibt ohne und öffnet in Karten eine Suche.
 */
export function PlaceField({ value, onChange, inline = false }: { value: PlaceValue; onChange: (v: PlaceValue) => void; inline?: boolean }) {
  const { state } = useFamily();
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [focused, setFocused] = useState(false);
  // nur nach eigenem Tippen suchen, nicht beim Öffnen eines gespeicherten Orts
  const [typed, setTyped] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  // Suche in der Nähe der zuletzt benutzten Orte gewichten
  const bias = useMemo(() => {
    const all = [...(state?.events ?? []), ...(state?.tasks ?? [])].filter((x) => x.placeLat != null && x.placeLon != null);
    const last = all.at(-1);
    return last ? `&lat=${last.placeLat}&lon=${last.placeLon}` : "";
  }, [state?.events, state?.tasks]);

  const q = value.place.trim();
  const searching = typed && q.length >= 3 && value.lat == null;

  useEffect(() => {
    if (!searching) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}${bias}`, { signal: ctrl.signal, cache: "no-store" });
        const data = (await res.json()) as { hits?: PlaceHit[] };
        setHits(data.hits ?? []);
        setFailed(!res.ok);
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 320);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, bias, searching]);

  const pick = (h: PlaceHit) => {
    haptic();
    onChange({ place: h.detail ? `${h.label}, ${h.detail}` : h.label, lat: h.lat, lon: h.lon });
    setTyped(false);
    setHits([]);
    inputRef.current?.blur();
  };

  const show = searching && focused && (hits.length > 0 || loading || failed);
  const pinned = value.lat != null && value.lon != null;

  return (
    <div className={inline ? "mt-2" : ""}>
      <div className={`flex items-center gap-2 ${inline ? "" : "glass rounded-[14px] px-3 py-2"}`}>
        <span className="shrink-0" style={{ color: pinned ? "var(--tint)" : "var(--label-3)" }} aria-hidden>
          <IconPin size={17} />
        </span>
        <input
          ref={inputRef}
          value={value.place}
          onChange={(e) => {
            setTyped(true);
            // wer den Text ändert, löst den Ort von der Karte
            onChange({ place: e.target.value, lat: null, lon: null });
          }}
          onFocus={() => setFocused(true)}
          // kurz warten, damit ein Tipp auf einen Vorschlag noch ankommt
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={inline ? "Ort oder Adresse (optional)" : "Ort oder Adresse suchen"}
          className="body min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--label-3)]"
          maxLength={200}
          enterKeyHint="done"
          autoComplete="off"
          aria-label="Ort"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={show}
          aria-controls={listId}
        />
        {q && <MapsLink place={q} lat={value.lat} lon={value.lon} compact />}
        {q && (
          <button
            type="button"
            onClick={() => {
              onChange({ place: "", lat: null, lon: null });
              setHits([]);
              inputRef.current?.focus();
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px]"
            style={{ background: "var(--fill)", color: "var(--label-2)" }}
            aria-label="Ort entfernen"
          >
            ✕
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {show && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.28 }}
            className="overflow-hidden"
            // Vorschläge über der Tastatur sichtbar halten
            onAnimationComplete={() => listRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })}
          >
            <div ref={listRef} className="glass mt-2 overflow-hidden rounded-[16px]" id={listId} role="listbox" aria-label="Vorschläge">
              {hits.map((h, i) => (
                <button
                  key={`${h.lat},${h.lon},${i}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  // vor dem Blur greifen, sonst verschwindet die Liste unter dem Finger
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(h)}
                  className="row-press flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  style={{ borderTop: i ? "0.5px solid var(--separator)" : "none" }}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "color-mix(in oklab, var(--danger) 85%, transparent)", color: "white" }}
                    aria-hidden
                  >
                    <IconPin size={14} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="subhead block truncate font-semibold">{h.label}</span>
                    {h.detail && (
                      <span className="footnote block truncate" style={{ color: "var(--label-2)" }}>
                        {h.detail}
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {!hits.length && (
                <p className="footnote px-3 py-2.5" style={{ color: "var(--label-2)" }}>
                  {loading ? "Suche …" : failed ? "Kartensuche gerade nicht erreichbar. Der Ort wird als Text gespeichert." : "Nichts gefunden."}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
