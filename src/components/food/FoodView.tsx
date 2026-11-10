"use client";

import { useMemo, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { recipeEmoji, scaleAmount } from "@/lib/recipes";
import { eaters, presenceFor } from "@/lib/attendance";
import { AttendanceRow, AttendanceSheet } from "./Attendance";
import { addDays, startOfDay, startOfWeek } from "@/lib/recurrence";
import { MAIN_SLOT, MEAL_SLOTS, localDay, mainMeal, type MealSlot, type Recipe, type RecipeFields } from "@/lib/types";
import { Card } from "../ui";
import { IconChevron, IconPlus } from "../icons";
import { RecipeDetail, useAddToShopping } from "./RecipeDetail";
import { RecipeEditor, type EditorTarget } from "./RecipeEditor";
import { MealSheet, type MealTarget } from "./MealSheet";

type Mode = "woche" | "rezepte";

export function FoodView({ initialDay }: { initialDay?: string | null }) {
  const { state, run, person } = useFamily();
  const [mode, setMode] = useState<Mode>("woche");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [mealFor, setMealFor] = useState<MealTarget | null>(initialDay ? { day: initialDay, slot: MAIN_SLOT } : null);
  const plan = (day: string, slot: MealSlot = MAIN_SLOT) => setMealFor({ day, slot });
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
    // alle Mahlzeiten der Woche mit Rezept, nicht nur das Abendessen
    const list = days.flatMap((d) => {
      const day = localDay(d);
      const n = eaters(presenceFor(day, state?.people ?? [], state?.attendance ?? [], state?.events ?? []));
      return (state?.meals ?? [])
        .filter((m) => m.day === day)
        .flatMap((m) => {
          const r = byId(m.recipeId);
          if (!r) return [];
          const factor = n / (r.servings || 1);
          return r.ingredients.map((i) => ({ ...i, amount: scaleAmount(i.amount, factor) }));
        });
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
          onClick={() => (mode === "rezepte" ? setEditor({ mode: "new" }) : plan(today))}
          className="press glass flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: "var(--tint)" }}
          aria-label={mode === "rezepte" ? "Neues Rezept" : "Essen planen"}
        >
          <IconPlus size={22} />
        </button>
      </header>

      <div className="relative flex rounded-[10px] p-[2px]" style={{ background: "var(--fill)" }}>
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
              const meal = mainMeal(state?.meals, day);
              const sides = MEAL_SLOTS.filter((sl) => sl.id !== MAIN_SLOT)
                .map((sl) => ({ sl, m: state?.meals.find((x) => x.day === day && x.slot === sl.id) }))
                .filter((x) => !!x.m);
              const r = byId(meal?.recipeId ?? null);
              const isToday = day === today;
              const past = day < today;
              return (
                <div key={day} style={{ borderTop: k ? "0.5px solid var(--separator)" : "none", opacity: past ? 0.5 : 1 }}>
                  <button onClick={() => (r ? setDetail({ recipe: r, day }) : plan(day))} className="flex w-full items-center gap-3 px-4 py-3 text-left">
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
                            plan(day);
                          }}
                          className="footnote rounded-full px-2.5 py-1 font-semibold"
                          style={{ background: "var(--fill)" }}
                        >
                          Ändern
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="subhead flex-1" style={{ color: "var(--label-3)" }}>
                          {past ? (sides.length ? "Kein Abendessen eingetragen" : "Nichts eingetragen") : sides.length ? "Abendessen planen" : "Essen planen"}
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
                  {/* Frühstück, Mittag und Sonstiges nur, wenn etwas geplant ist */}
                  {sides.length > 0 && (
                    <div className="-mt-1.5 pb-2.5 pl-[68px] pr-4">
                      {sides.map(({ sl, m }) => (
                        <button
                          key={sl.id}
                          onClick={() => {
                            const rr = byId(m!.recipeId);
                            if (rr) setDetail({ recipe: rr, day });
                            else plan(day, sl.id);
                          }}
                          className="footnote flex w-full items-center gap-1.5 py-0.5 text-left"
                          style={{ color: "var(--label-2)" }}
                        >
                          <span aria-hidden>{sl.emoji}</span>
                          <span className="shrink-0 font-semibold">{sl.label}</span>
                          <span className="min-w-0 truncate" style={{ color: "var(--label)" }}>
                            {m!.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
        target={mealFor}
        onClose={() => setMealFor(null)}
        onNewRecipe={(initial: Partial<RecipeFields>, day: string, slot: MealSlot) => {
          setMealFor(null);
          setEditor({ mode: "new", initial, planDay: day, planSlot: slot });
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
            const slot = editor.planSlot ?? MAIN_SLOT;
            const existing = state?.meals.find((m) => m.day === editor.planDay && m.slot === slot);
            void run({ op: "meal.set", day: editor.planDay, slot, recipeId: id, title, cook: existing?.cook ?? null, note: null });
          }
        }}
      />
    </div>
  );
}
