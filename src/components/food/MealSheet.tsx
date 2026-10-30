"use client";

import { useState } from "react";
import { useFamily } from "@/lib/client/family";
import { recipeEmoji } from "@/lib/recipes";
import type { RecipeFields } from "@/lib/types";
import { Avatar, Chips, FieldLabel, Sheet } from "../ui";
import { IconClock } from "../icons";
import { AttendanceRow, MaybeHint } from "./Attendance";
import { MealWheel } from "./MealWheel";

type Suggestion = { title: string; why: string; minutes: number | null; recipeId: string | null };

const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((+d - +today) / 86400000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
};

/** Essen für einen Tag festlegen: eigenes Rezept, freier Text oder KI-Vorschlag */
export function MealSheet({ day, onClose, onNewRecipe }: { day: string | null; onClose: () => void; onNewRecipe: (initial: Partial<RecipeFields>, day: string) => void }) {
  if (!day) return null;
  return <Inner key={day} day={day} onClose={onClose} onNewRecipe={onNewRecipe} />;
}

function Inner({ day, onClose, onNewRecipe }: { day: string; onClose: () => void; onNewRecipe: (initial: Partial<RecipeFields>, day: string) => void }) {
  const { state, run, me } = useFamily();
  const current = state?.meals.find((m) => m.day === day) ?? null;
  const [mode, setMode] = useState<"rezept" | "rad" | "frei" | "ki">("rezept");
  const [q, setQ] = useState("");
  const [free, setFree] = useState(current && !current.recipeId ? current.title : "");
  const [cook, setCook] = useState<string | null>(current?.cook ?? me?.id ?? null);
  const [hint, setHint] = useState("");
  const [ideas, setIdeas] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ai = state?.ai;

  const recipes = (state?.recipes ?? []).filter(
    (r) => !q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase()) || r.tags.some((t) => t.toLowerCase().includes(q.trim().toLowerCase())),
  );

  const choose = async (title: string, recipeId: string | null) => {
    void run({ op: "meal.set", day, recipeId, title, cook, note: null });
    onClose();
  };

  const ask = async () => {
    setBusy("ask");
    setMsg(null);
    const res = await fetch("/api/ai/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hint, day }) });
    const r = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMsg(r.message ?? "Vorschläge gerade nicht möglich.");
    setIdeas(r.suggestions);
  };

  const elaborate = async (s: Suggestion) => {
    setBusy(s.title);
    setMsg(null);
    const res = await fetch("/api/ai/recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: s.title, why: s.why }) });
    const r = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMsg(r.message ?? "Rezept gerade nicht möglich.");
    onNewRecipe(r.recipe, day);
  };

  return (
    <Sheet open onClose={onClose} title={dayLabel(day)}>
      <FieldLabel>Wer kocht?</FieldLabel>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
        {(state?.people ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setCook(cook === p.id ? null : p.id)}
            className="press flex flex-col items-center gap-1"
            aria-pressed={cook === p.id}
            style={{ opacity: cook === p.id ? 1 : 0.4 }}
          >
            <Avatar person={p} size={38} />
            <span className="caption">{p.name}</span>
          </button>
        ))}
      </div>

      <FieldLabel>Wer isst mit?</FieldLabel>
      <AttendanceRow day={day} size={38} names />
      <MaybeHint day={day} />

      <div className="mt-5">
        <Chips
          value={mode}
          onChange={setMode}
          options={[
            { id: "rezept", label: "Aus Rezepten" },
            { id: "rad", label: "🎡 Glücksrad" },
            { id: "frei", label: "Freier Text" },
            ...(ai?.enabled ? [{ id: "ki" as const, label: "Vorschlag" }] : []),
          ]}
        />
      </div>

      {mode === "rezept" && (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rezept suchen"
            className="body glass mt-4 w-full rounded-[14px] px-3 py-2.5"
            aria-label="Rezept suchen"
          />
          <div className="mt-3 flex flex-col gap-2">
            {recipes.length === 0 && (
              <p className="subhead px-1 py-2" style={{ color: "var(--label-2)" }}>
                {state?.recipes.length ? "Kein Rezept passt zur Suche." : "Noch keine Rezepte. Leg unter Rezepte das erste an oder trag das Essen als freien Text ein."}
              </p>
            )}
            {recipes.slice(0, 40).map((r) => (
              <button key={r.id} onClick={() => void choose(r.title, r.id)} className="press glass flex items-center gap-3 rounded-[16px] px-3 py-2.5 text-left">
                <span className="text-2xl" aria-hidden>
                  {recipeEmoji(r.title, r.tags)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="body block truncate font-medium">
                    {r.favorite ? "★ " : ""}
                    {r.title}
                  </span>
                  {r.minutes && (
                    <span className="footnote flex items-center gap-1" style={{ color: "var(--label-2)" }}>
                      <IconClock size={12} /> {r.minutes} Min.
                    </span>
                  )}
                </span>
                {current?.recipeId === r.id && (
                  <span className="footnote font-semibold" style={{ color: "var(--success)" }}>
                    geplant
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {mode === "rad" && <MealWheel day={day} onPick={(r) => void choose(r.title, r.id)} />}

      {mode === "frei" && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (free.trim()) void choose(free.trim(), null);
          }}
        >
          <input
            value={free}
            onChange={(e) => setFree(e.target.value)}
            placeholder="z. B. Pizza bestellen, Reste, Grillen"
            className="body glass w-full rounded-[14px] px-3 py-2.5"
            maxLength={140}
            aria-label="Essen"
            autoFocus
          />
          <button
            type="submit"
            disabled={!free.trim()}
            className="press subhead mt-3 w-full rounded-[12px] py-2.5 font-semibold text-white"
            style={{ background: free.trim() ? "var(--tint)" : "var(--label-3)" }}
          >
            Eintragen
          </button>
        </form>
      )}

      {mode === "ki" && (
        <div className="mt-4">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Wunsch, z. B. schnell, vegetarisch, mit Zucchini"
              className="body glass min-w-0 flex-1 rounded-[14px] px-3 py-2.5"
              maxLength={200}
              aria-label="Wunsch"
            />
            <button type="submit" disabled={busy === "ask"} className="press subhead rounded-[12px] px-3.5 py-2.5 font-semibold text-white" style={{ background: "var(--tint)" }}>
              {busy === "ask" ? "Denkt" : ideas ? "Neu" : "Fragen"}
            </button>
          </form>
          <p className="caption mt-2 px-1" style={{ color: "var(--label-3)" }}>
            Berücksichtigt eure Rezepte und was zuletzt gegessen wurde.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {(ideas ?? []).map((s) => (
              <div key={s.title} className="glass rounded-[16px] p-3">
                <p className="body font-semibold">{s.title}</p>
                <p className="footnote mt-0.5" style={{ color: "var(--label-2)" }}>
                  {s.why}
                  {s.minutes ? `, etwa ${s.minutes} Min.` : ""}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => void choose(s.title, s.recipeId)}
                    className="press subhead flex-1 rounded-[10px] py-2 font-semibold text-white"
                    style={{ background: "var(--tint)" }}
                  >
                    Eintragen
                  </button>
                  {!s.recipeId && (
                    <button
                      onClick={() => void elaborate(s)}
                      disabled={!!busy}
                      className="press subhead flex-1 rounded-[10px] py-2 font-semibold"
                      style={{ background: "color-mix(in oklab, var(--tint) 12%, transparent)", color: "var(--tint)" }}
                    >
                      {busy === s.title ? "Schreibt Rezept" : "Als Rezept"}
                    </button>
                  )}
                  {s.recipeId && (
                    <span className="footnote self-center px-1 font-semibold" style={{ color: "var(--success)" }}>
                      eigenes Rezept
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {ai && (
            <p className="caption mt-3 px-1 tabular" style={{ color: "var(--label-3)" }}>
              Diesen Monat {ai.usedUsd.toLocaleString("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 3 })} von{" "}
              {ai.limitUsd.toLocaleString("de-DE", { style: "currency", currency: "USD" })} verbraucht.
            </p>
          )}
        </div>
      )}

      {msg && (
        <p className="footnote mt-3" style={{ color: "var(--danger)" }} role="status">
          {msg}
        </p>
      )}

      {current && (
        <button
          onClick={() => {
            void run({ op: "meal.clear", day });
            onClose();
          }}
          className="press body mt-7 w-full rounded-[14px] py-3 font-medium"
          style={{ color: "var(--danger)", background: "color-mix(in oklab, var(--danger) 10%, transparent)" }}
        >
          „{current.title}“ austragen
        </button>
      )}
    </Sheet>
  );
}
