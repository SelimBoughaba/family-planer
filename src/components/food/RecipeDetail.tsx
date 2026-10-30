"use client";

import { useMemo, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { recipeEmoji, scaleAmount } from "@/lib/recipes";
import { guessCategory } from "@/lib/shopping";
import { localDay, type Recipe } from "@/lib/types";
import { eaters, presenceFor } from "@/lib/attendance";
import { RecipeImages } from "./RecipeImages";
import { addDays, startOfDay } from "@/lib/recurrence";
import { Card, ContextMenu, Sheet } from "../ui";
import { IconCheck, IconClock, IconTrash } from "../icons";

/** Zutaten mit Häkchen auf die Einkaufsliste setzen */
export function useAddToShopping() {
  const { state, run } = useFamily();
  return (ingredients: { amount: string | null; name: string }[]) => {
    const categories = state?.lists.categories ?? [];
    const fallback = categories.includes("Vorrat") ? "Vorrat" : categories[categories.length - 1];
    return run({
      op: "item.createMany",
      items: ingredients.map((i) => {
        const c = guessCategory(i.name);
        return { name: i.name, amount: i.amount, category: categories.includes(c) ? c : fallback };
      }),
    });
  };
}

export function RecipeDetail({ recipe, onClose, onEdit, forDay = null }: { recipe: Recipe | null; onClose: () => void; onEdit: (r: Recipe) => void; forDay?: string | null }) {
  if (!recipe) return null;
  return <Detail key={`${recipe.id}-${forDay}`} recipe={recipe} onClose={onClose} onEdit={onEdit} forDay={forDay} />;
}

function Detail({ recipe, onClose, onEdit, forDay }: { recipe: Recipe; onClose: () => void; onEdit: (r: Recipe) => void; forDay: string | null }) {
  const { state, run } = useFamily();
  const addToShopping = useAddToShopping();
  // aus dem Wochenplan geöffnet: so viele Portionen, wie an dem Tag mitessen
  const [eatersCount] = useState(() => (forDay ? eaters(presenceFor(forDay, state?.people ?? [], state?.attendance ?? [], state?.events ?? [])) : null));
  const [servings, setServings] = useState(eatersCount ?? recipe.servings);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState<string | null>(null);
  const [plan, setPlan] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const factor = servings / (recipe.servings || 1);

  const scaled = useMemo(() => recipe.ingredients.map((i) => ({ ...i, amount: scaleAmount(i.amount, factor) })), [recipe.ingredients, factor]);
  const chosen = scaled.filter((_, i) => !skip.has(i));
  const openNames = new Set((state?.items ?? []).filter((i) => !i.done).map((i) => i.name.toLowerCase()));

  const days = Array.from({ length: 7 }, (_, k) => addDays(startOfDay(new Date()), k));

  return (
    <Sheet
      open
      onClose={onClose}
      title=""
      trailing={
        <button onClick={() => onEdit(recipe)} className="body font-semibold" style={{ color: "var(--tint)" }}>
          Bearbeiten
        </button>
      }
    >
      <div className="mt-2 flex items-start gap-4">
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] text-3xl"
          style={{ background: "linear-gradient(150deg, color-mix(in oklab, var(--tint) 18%, white), color-mix(in oklab, var(--tint) 6%, white))" }}
          aria-hidden
        >
          {recipeEmoji(recipe.title, recipe.tags)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="title-2">{recipe.title}</h2>
          {recipe.description && (
            <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
              {recipe.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {recipe.minutes && (
              <span className="footnote flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "var(--fill)" }}>
                <IconClock size={13} /> {recipe.minutes} Min.
              </span>
            )}
            {recipe.tags.map((t) => (
              <span key={t} className="footnote rounded-full px-2 py-0.5" style={{ background: "var(--fill)" }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={() => setPlan(true)} className="press subhead flex-1 rounded-[12px] py-2.5 font-semibold text-white" style={{ background: "var(--tint)" }}>
          Einplanen
        </button>
        <button
          onClick={() => void run({ op: "recipe.favorite", id: recipe.id, favorite: !recipe.favorite })}
          className="press subhead rounded-[12px] px-4 py-2.5 font-semibold"
          style={{ background: "var(--fill)", color: recipe.favorite ? "#FF9F0A" : "var(--label)" }}
          aria-pressed={recipe.favorite}
        >
          {recipe.favorite ? "★ Favorit" : "☆ Favorit"}
        </button>
      </div>

      {recipe.images.length > 0 && <RecipeImages paths={recipe.images} />}

      <div className="mt-6 flex items-end justify-between">
        <h3 className="headline">Zutaten</h3>
        <span className="flex items-center gap-3">
          <button onClick={() => setServings(Math.max(1, servings - 1))} className="headline press glass h-8 w-8 rounded-full" aria-label="Weniger Portionen">
            −
          </button>
          <span className="subhead tabular min-w-[86px] text-center font-semibold">{servings} Portionen</span>
          <button onClick={() => setServings(Math.min(50, servings + 1))} className="headline press glass h-8 w-8 rounded-full" aria-label="Mehr Portionen">
            +
          </button>
        </span>
      </div>
      {eatersCount !== null && servings === eatersCount && (
        <p className="footnote mt-1.5 text-right" style={{ color: "var(--label-2)" }}>
          So viele essen {forDay === localDay() ? "heute" : "an dem Tag"} mit
        </p>
      )}
      <Card className="mt-3 overflow-hidden">
        {scaled.length === 0 && (
          <p className="subhead px-4 py-3" style={{ color: "var(--label-2)" }}>
            Keine Zutaten eingetragen.
          </p>
        )}
        {scaled.map((i, k) => {
          const on = !skip.has(k);
          const onList = openNames.has(i.name.toLowerCase());
          return (
            <button
              key={k}
              onClick={() =>
                setSkip((s) => {
                  const n = new Set(s);
                  if (n.has(k)) n.delete(k);
                  else n.add(k);
                  return n;
                })
              }
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
              style={{ borderTop: k ? "0.5px solid var(--separator)" : "none" }}
              aria-pressed={on}
            >
              <span
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: on ? "var(--tint)" : "transparent", border: on ? "none" : "1.5px solid var(--label-3)" }}
              >
                {on && <IconCheck size={12} />}
              </span>
              <span className="body min-w-0 flex-1" style={{ color: on ? "var(--label)" : "var(--label-3)" }}>
                {i.name}
                {onList && (
                  <span className="footnote ml-1.5" style={{ color: "var(--success)" }}>
                    steht auf der Liste
                  </span>
                )}
              </span>
              <span className="subhead tabular" style={{ color: "var(--label-2)" }}>
                {i.amount}
              </span>
            </button>
          );
        })}
      </Card>
      {scaled.length > 0 && (
        <button
          onClick={async () => {
            const n = chosen.filter((i) => !openNames.has(i.name.toLowerCase())).length;
            if (await addToShopping(chosen)) setAdded(n ? `${n} ${n === 1 ? "Zutat" : "Zutaten"} auf die Einkaufsliste gesetzt.` : "Alles steht schon auf der Liste.");
          }}
          disabled={!chosen.length}
          className="press subhead mt-3 w-full rounded-[12px] py-2.5 font-semibold"
          style={{ background: "color-mix(in oklab, var(--tint) 12%, transparent)", color: "var(--tint)" }}
        >
          {chosen.length === scaled.length ? "Alle Zutaten auf die Einkaufsliste" : `${chosen.length} Zutaten auf die Einkaufsliste`}
        </button>
      )}
      {added && (
        <p className="footnote mt-2 text-center" style={{ color: "var(--success)" }} role="status">
          {added}
        </p>
      )}

      {recipe.steps.length > 0 && (
        <>
          <h3 className="headline mt-7">Zubereitung</h3>
          <ol className="mt-3 flex flex-col gap-3">
            {recipe.steps.map((s, k) => (
              <li key={k} className="flex gap-3">
                <span className="subhead tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ background: "var(--tint)" }}>
                  {k + 1}
                </span>
                <p className="body">{s}</p>
              </li>
            ))}
          </ol>
        </>
      )}

      {recipe.sourceUrl && (
        <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="footnote mt-6 block truncate" style={{ color: "var(--tint)" }}>
          Quelle: {new URL(recipe.sourceUrl).hostname.replace(/^www\./, "")}
        </a>
      )}

      <button
        onClick={() => setConfirmDelete(true)}
        className="press body mt-8 flex w-full items-center justify-center gap-2 rounded-[14px] py-3 font-medium"
        style={{ color: "var(--danger)", background: "color-mix(in oklab, var(--danger) 10%, transparent)" }}
      >
        <IconTrash size={18} /> Rezept löschen
      </button>

      <ContextMenu
        open={plan}
        onClose={() => setPlan(false)}
        preview={<p className="headline">An welchem Tag gibt es {recipe.title}?</p>}
        actions={days.map((d, k) => {
          const day = localDay(d);
          const taken = state?.meals.find((m) => m.day === day);
          return {
            label: `${k === 0 ? "Heute" : k === 1 ? "Morgen" : d.toLocaleDateString("de-DE", { weekday: "long" })}${taken ? `, statt ${taken.title}` : ""}`,
            onSelect: () => void run({ op: "meal.set", day, recipeId: recipe.id, title: recipe.title, cook: taken?.cook ?? null, note: null }),
          };
        })}
      />
      <ContextMenu
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        preview={<p className="headline">{recipe.title} löschen?</p>}
        actions={[
          {
            label: "Rezept löschen",
            destructive: true,
            onSelect: () => {
              void run({ op: "recipe.delete", id: recipe.id });
              onClose();
            },
          },
        ]}
      />
    </Sheet>
  );
}
