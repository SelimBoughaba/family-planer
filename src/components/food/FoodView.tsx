"use client";

import { useMemo, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { recipeEmoji, scaleAmount } from "@/lib/recipes";
import { eaters, presenceFor } from "@/lib/attendance";
import { AttendanceRow, AttendanceSheet } from "./Attendance";
import { addDays, startOfDay, startOfWeek } from "@/lib/recurrence";
import { localDay, type Recipe, type RecipeFields } from "@/lib/types";
import { Card } from "../ui";
import { IconChevron, IconPlus } from "../icons";
import { RecipeDetail, useAddToShopping } from "./RecipeDetail";
import { RecipeEditor, type EditorTarget } from "./RecipeEditor";
import { MealSheet } from "./MealSheet";

type Mode = "woche" | "rezepte";

export function FoodView({ initialDay }: { initialDay?: string | null }) {
  const { state, run, person } = useFamily();
  const [mode, setMode] = useState<Mode>("woche");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [mealDay, setMealDay] = useState<string | null>(initialDay ?? null);
  const [detail, setDetail] = useState<{ recipe: Recipe; day: string | null } | null>(null);
  const [attendDay, setAttendDay] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const addToShopping = useAddToShopping();

  const today = localDay(startOfDay(new Date()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, k) => addDays(weekStart, k)), [weekStart]);
  const recipes = state?.recipes ?? [];
  const byId = (id: string | null) => recipes.find((r) => r.id === id) ?? null;
  // aktuelle Fassung des geöffneten Rezepts nach Änderungen
  const liveDetail = detail ? (recipes.find((r) => r.id === detail.recipe.id) ?? null) : null;

  const shopWeek = async () => {
    // Mengen pro Tag auf die Zahl der Mitesser umrechnen
    const list = days.flatMap((d) => {
      const day = localDay(d);
      const r = byId(state?.meals.find((m) => m.day === day)?.recipeId ?? null);
      if (!r) return [];
      const n = eaters(presenceFor(day, state?.people ?? [], state?.attendance ?? [], state?.events ?? []));
      const factor = n / (r.servings || 1);
      return r.ingredients.map((i) => ({ ...i, amount: scaleAmount(i.amount, factor) }));
    });
    if (!list.length) return setNote("Für diese Woche sind keine Rezepte mit Zutaten eingeplant.");
    // gleiche Zutat aus mehreren Rezepten nur einmal
    const seen = new Set<string>();
    const unique = list.filter((i) => !seen.has(i.name.toLowerCase()) && !!seen.add(i.name.toLowerCase()));
    if (await addToShopping(unique)) setNote(`Zutaten der Woche stehen auf der Einkaufsliste. Mengen bitte kurz prüfen, gleiche Zutaten sind zusammengefasst.`);
  };

  const filtered = recipes.filter((r) => {
    const t = q.trim().toLowerCase();
    return !t || r.title.toLowerCase().includes(t) || r.tags.some((x) => x.toLowerCase().includes(t)) || r.ingredients.some((i) => i.name.toLowerCase().includes(t));
  });

  const kw = (() => {
    const d = new Date(Date.UTC(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 3));
    const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((+d - +y) / 86400000 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
  })();

  return (
    <div className="mx-auto max-w-md px-4 safe-top safe-bottom">
      <header className="mb-4 flex items-end justify-between">
        <h1 className="large-title">Essen</h1>
        <button
          onClick={() => (mode === "rezepte" ? setEditor({ mode: "new" }) : setMealDay(today))}
          className="press glass flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: "var(--tint)" }}
          aria-label={mode === "rezepte" ? "Neues Rezept" : "Essen planen"}
        >
          <IconPlus size={22} />
        </button>
      </header>

      <div className="relative flex rounded-[10px] p-[2px]" style={{ background: "color-mix(in oklab, var(--label) 8%, transparent)" }}>
        <span
          className="absolute top-[2px] bottom-[2px] rounded-[8px]"
          style={{
            left: mode === "woche" ? 2 : "calc(50% + 0px)",
            width: "calc(50% - 2px)",
            background: "var(--glass-strong)",
            boxShadow: "0 3px 8px rgba(0,0,0,.12)",
            transition: "left 300ms cubic-bezier(0.25, 1.1, 0.4, 1)",
          }}
          aria-hidden
        />
        {(["woche", "rezepte"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className="footnote relative flex-1 py-1.5 font-semibold" aria-pressed={mode === m}>
            {m === "woche" ? "Wochenplan" : `Rezepte${recipes.length ? ` (${recipes.length})` : ""}`}
          </button>
        ))}
      </div>

      {mode === "woche" ? (
        <>
          <div className="mt-5 flex items-center justify-between">
            <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="press glass flex h-9 w-9 items-center justify-center rounded-full" aria-label="Vorherige Woche">
              <IconChevron size={16} className="rotate-180" />
            </button>
            <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="headline">
              KW {kw}
            </button>
            <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="press glass flex h-9 w-9 items-center justify-center rounded-full" aria-label="Nächste Woche">
              <IconChevron size={16} />
            </button>
          </div>

          <Card className="mt-3 overflow-hidden">
            {days.map((d, k) => {
              const day = localDay(d);
              const meal = state?.meals.find((m) => m.day === day);
              const r = byId(meal?.recipeId ?? null);
              const isToday = day === today;
              const past = day < today;
              return (
                <button
                  key={day}
                  onClick={() => (r ? setDetail({ recipe: r, day }) : setMealDay(day))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  style={{ borderTop: k ? "0.5px solid var(--separator)" : "none", opacity: past ? 0.5 : 1 }}
                >
                  <span className="flex w-10 shrink-0 flex-col items-center">
                    <span className="caption font-semibold" style={{ color: isToday ? "var(--danger)" : "var(--label-2)" }}>
                      {d.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "")}
                    </span>
                    <span className="headline tabular" style={{ color: isToday ? "var(--danger)" : "var(--label)" }}>
                      {d.getDate()}
                    </span>
                  </span>
                  {meal ? (
                    <>
                      <span className="text-2xl" aria-hidden>
                        {recipeEmoji(meal.title, r?.tags)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="body block truncate font-medium">{meal.title}</span>
                        <span className="footnote block truncate" style={{ color: "var(--label-2)" }}>
                          {[person(meal.cook) ? `kocht ${person(meal.cook)!.name}` : "noch niemand kocht", r?.minutes ? `${r.minutes} Min.` : null].filter(Boolean).join(", ")}
                        </span>
                        {!past && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAttendDay(day);
                            }}
                            className="mt-1 inline-flex rounded-full px-1.5 py-1"
                            style={{ background: "color-mix(in oklab, var(--label) 5%, transparent)" }}
                            aria-label="Wer isst mit"
                          >
                            <span className="pointer-events-none flex [&>div]:gap-[3px]">
                              <AttendanceRow day={day} size={14} interactive={false} />
                            </span>
                          </span>
                        )}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMealDay(day);
                        }}
                        className="footnote rounded-full px-2.5 py-1 font-semibold"
                        style={{ background: "color-mix(in oklab, var(--label) 7%, transparent)" }}
                      >
                        Ändern
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="subhead flex-1" style={{ color: "var(--label-3)" }}>
                        {past ? "Nichts eingetragen" : "Essen planen"}
                      </span>
                      {!past && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAttendDay(day);
                          }}
                          className="inline-flex shrink-0 rounded-full px-1.5 py-1"
                          style={{ background: "color-mix(in oklab, var(--label) 5%, transparent)" }}
                          aria-label="Wer isst mit"
                        >
                          <span className="pointer-events-none flex [&>div]:gap-[3px]">
                            <AttendanceRow day={day} size={14} interactive={false} />
                          </span>
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </Card>

          <button
            onClick={() => void shopWeek()}
            className="press subhead mt-4 w-full rounded-[14px] py-3 font-semibold"
            style={{ background: "color-mix(in oklab, var(--tint) 12%, transparent)", color: "var(--tint)" }}
          >
            Zutaten der Woche auf die Einkaufsliste
          </button>
          {note && (
            <p className="footnote mt-2 px-1 text-center" style={{ color: "var(--label-2)" }} role="status">
              {note}
            </p>
          )}
        </>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen nach Name, Zutat oder Schlagwort"
            className="body glass mt-5 w-full rounded-[14px] px-3 py-2.5"
            aria-label="Rezepte suchen"
          />
          {recipes.length === 0 ? (
            <Card className="mt-4 p-5 text-center">
              <p className="headline">Noch keine Rezepte</p>
              <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
                Füge ein Lieblingsrezept hinzu oder hol eins per Link von einer Rezeptseite.
              </p>
              <button
                onClick={() => setEditor({ mode: "new" })}
                className="press subhead mt-4 rounded-full px-4 py-2 font-semibold text-white"
                style={{ background: "var(--tint)" }}
              >
                Rezept hinzufügen
              </button>
            </Card>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {filtered.map((r) => (
                <button key={r.id} onClick={() => setDetail({ recipe: r, day: null })} className="press glass flex flex-col items-start rounded-[20px] p-3 text-left">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-[14px] text-2xl"
                    style={{ background: "color-mix(in oklab, var(--tint) 10%, transparent)" }}
                    aria-hidden
                  >
                    {recipeEmoji(r.title, r.tags)}
                  </span>
                  <span className="subhead mt-2.5 line-clamp-2 font-semibold">{r.title}</span>
                  <span className="footnote mt-0.5 flex items-center gap-1" style={{ color: "var(--label-2)" }}>
                    {r.favorite && <span style={{ color: "#FF9F0A" }}>★</span>}
                    {r.minutes ? `${r.minutes} Min.` : `${r.ingredients.length} Zutaten`}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="subhead col-span-2 px-1" style={{ color: "var(--label-2)" }}>
                  Nichts gefunden.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <MealSheet
        day={mealDay}
        onClose={() => setMealDay(null)}
        onNewRecipe={(initial: Partial<RecipeFields>, day: string) => {
          setMealDay(null);
          setEditor({ mode: "new", initial, planDay: day });
        }}
      />
      <AttendanceSheet day={attendDay} onClose={() => setAttendDay(null)} />
      <RecipeDetail
        recipe={liveDetail}
        forDay={detail?.day ?? null}
        onClose={() => setDetail(null)}
        onEdit={(r) => {
          setDetail(null);
          setEditor({ mode: "edit", recipe: r });
        }}
      />
      <RecipeEditor
        target={editor}
        onClose={() => setEditor(null)}
        onSaved={(id, title) => {
          if (editor?.mode === "new" && editor.planDay) {
            const existing = state?.meals.find((m) => m.day === editor.planDay);
            void run({ op: "meal.set", day: editor.planDay, recipeId: id, title, cook: existing?.cook ?? null, note: null });
          }
        }}
      />
    </div>
  );
}
