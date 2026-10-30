"use client";

import { useState } from "react";
import { prepareFile, uploadFile } from "@/lib/client/upload";
import { RecipeImages } from "./RecipeImages";
import { useFamily } from "@/lib/client/family";
import { parseIngredient } from "@/lib/recipes";
import type { Recipe, RecipeFields } from "@/lib/types";
import { FieldLabel, Sheet } from "../ui";

export type EditorTarget = { mode: "new"; initial?: Partial<RecipeFields>; planDay?: string } | { mode: "edit"; recipe: Recipe };

const ingredientsText = (xs: RecipeFields["ingredients"] = []) => xs.map((i) => (i.amount ? `${i.amount} ${i.name}` : i.name)).join("\n");
const stepsText = (xs: string[] = []) => xs.join("\n\n");

function fromTarget(t: EditorTarget) {
  const r: Partial<RecipeFields> = t.mode === "edit" ? t.recipe : (t.initial ?? {});
  return {
    title: r.title ?? "",
    description: r.description ?? "",
    servings: r.servings ?? 4,
    minutes: r.minutes ? String(r.minutes) : "",
    ingredients: ingredientsText(r.ingredients),
    steps: stepsText(r.steps),
    tags: (r.tags ?? []).join(", "),
    sourceUrl: r.sourceUrl ?? "",
    images: r.images ?? [],
  };
}

export function RecipeEditor({ target, onClose, onSaved }: { target: EditorTarget | null; onClose: () => void; onSaved?: (id: string, title: string) => void }) {
  if (!target) return null;
  const key = target.mode === "edit" ? target.recipe.id : `new-${target.initial?.title ?? ""}-${target.initial?.sourceUrl ?? ""}`;
  return <Editor key={key} target={target} onClose={onClose} onSaved={onSaved} />;
}

function Editor({ target, onClose, onSaved }: { target: EditorTarget; onClose: () => void; onSaved?: (id: string, title: string) => void }) {
  const { run, state } = useFamily();
  const [f, setF] = useState(() => fromTarget(target));
  const [importUrl, setImportUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "import" | "scan">(null);
  const [scanStep, setScanStep] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const ai = state?.ai.enabled;

  const fields = (): RecipeFields => ({
    title: f.title.trim(),
    description: f.description.trim() || null,
    servings: Math.max(1, Math.min(50, Number(f.servings) || 4)),
    minutes: Number(f.minutes) > 0 ? Math.round(Number(f.minutes)) : null,
    ingredients: f.ingredients
      .split("\n")
      .map((l) => l.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean)
      .map(parseIngredient),
    steps: f.steps
      .split(/\n\s*\n|\n(?=\d+[.)]\s)/)
      .map((s) =>
        s
          .replace(/^\d+[.)]\s*/, "")
          .replace(/\s*\n\s*/g, " ")
          .trim(),
      )
      .filter(Boolean),
    tags: f.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    sourceUrl: f.sourceUrl.trim() || null,
    images: f.images,
  });

  const save = async () => {
    const data = fields();
    if (!data.title || busy) return;
    setBusy("save");
    if (target.mode === "edit") {
      void run({ op: "recipe.update", id: target.recipe.id, ...data });
      setBusy(null);
      onClose();
      return;
    }
    const id = crypto.randomUUID();
    void run({ op: "recipe.create", id, ...data });
    setBusy(null);
    onSaved?.(id, data.title);
    onClose();
  };

  const doImport = async (body: Record<string, string>) => {
    setBusy("import");
    setMsg(null);
    const res = await fetch("/api/recipes/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const r = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMsg(r.message ?? "Der Import hat nicht geklappt.");
    setF(fromTarget({ mode: "new", initial: r.recipe }));
    setShowPaste(false);
    setMsg(r.via === "structured" ? "Übernommen. Bitte kurz prüfen und sichern." : "Von der KI ausgelesen. Bitte Mengen prüfen und sichern.");
  };

  // Fotos oder PDF hochladen und von der KI auslesen lassen
  const scan = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, 5);
    if (!list.length) return;
    setBusy("scan");
    setMsg(null);
    try {
      const paths: string[] = [];
      for (let i = 0; i < list.length; i++) {
        setScanStep(list.length > 1 ? `Lädt hoch, ${i + 1} von ${list.length}` : "Lädt hoch");
        paths.push(await uploadFile(await prepareFile(list[i]), "recipe"));
      }
      setScanStep("KI liest das Rezept");
      const res = await fetch("/api/recipes/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r.message ?? "Das Rezept konnte nicht gelesen werden.");
      setF(fromTarget({ mode: "new", initial: r.recipe }));
      setMsg("Ausgelesen. Bitte Mengen und Schritte prüfen, dann sichern. Das Original bleibt beim Rezept.");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(null);
      setScanStep(null);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={target.mode === "edit" ? "Rezept bearbeiten" : "Neues Rezept"}
      leading={
        <button onClick={onClose} className="body" style={{ color: "var(--tint)" }}>
          Abbrechen
        </button>
      }
      trailing={
        <button
          onClick={() => void save()}
          disabled={!f.title.trim() || !!busy}
          className="body font-semibold"
          style={{ color: f.title.trim() ? "var(--tint)" : "var(--label-3)" }}
        >
          Sichern
        </button>
      }
      z={45}
    >
      {target.mode === "new" && (
        <div className="mt-3 rounded-[18px] p-3" style={{ background: "color-mix(in oklab, var(--tint) 8%, transparent)" }}>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (importUrl.trim()) void doImport({ url: importUrl.trim() });
            }}
          >
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Link zu einem Rezept einfügen"
              inputMode="url"
              autoComplete="off"
              className="body min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--label-3)]"
              aria-label="Link zu einem Rezept"
            />
            <button
              type="submit"
              disabled={!importUrl.trim() || !!busy}
              className="press subhead rounded-full px-3 py-1.5 font-semibold text-white"
              style={{ background: importUrl.trim() ? "var(--tint)" : "var(--label-3)" }}
            >
              {busy === "import" ? "Lädt" : "Holen"}
            </button>
          </form>
          {ai && (
            <div className="mt-3 flex gap-2">
              <label
                className="press subhead flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[12px] py-2 font-semibold"
                style={{ background: "var(--glass-strong)", color: "var(--tint)" }}
              >
                📷 Foto machen
                <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={!!busy} onChange={(e) => void scan(e.target.files)} />
              </label>
              <label
                className="press subhead flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[12px] py-2 font-semibold"
                style={{ background: "var(--glass-strong)", color: "var(--tint)" }}
              >
                📄 Foto oder PDF
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="sr-only"
                  disabled={!!busy}
                  onChange={(e) => void scan(e.target.files)}
                  aria-label="Fotos oder PDF auswählen"
                />
              </label>
            </div>
          )}
          {scanStep && (
            <p className="footnote mt-2 flex items-center gap-2" style={{ color: "var(--tint)" }} role="status">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> {scanStep}
            </p>
          )}
          {ai && (
            <button onClick={() => setShowPaste((v) => !v)} className="footnote mt-2 font-semibold" style={{ color: "var(--tint)" }}>
              {showPaste ? "Doch nicht" : "Oder Rezepttext einfügen"}
            </button>
          )}
          {showPaste && (
            <div className="mt-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                placeholder="Rezept aus einer Nachricht, einem Foto-Text oder einer Seite hier einfügen"
                className="subhead glass w-full rounded-[12px] px-3 py-2"
                aria-label="Rezepttext"
              />
              <button
                onClick={() => void doImport({ text: pasteText })}
                disabled={pasteText.trim().length < 30 || !!busy}
                className="press subhead mt-2 w-full rounded-[12px] py-2 font-semibold text-white"
                style={{ background: pasteText.trim().length >= 30 ? "var(--tint)" : "var(--label-3)" }}
              >
                {busy === "import" ? "KI liest das Rezept" : "Mit KI auslesen"}
              </button>
            </div>
          )}
          {msg && (
            <p className="footnote mt-2" style={{ color: "var(--label-2)" }} role="status">
              {msg}
            </p>
          )}
        </div>
      )}

      <input
        value={f.title}
        onChange={(e) => set("title", e.target.value)}
        placeholder="Name des Gerichts"
        className="title-2 mt-4 w-full bg-transparent outline-none placeholder:text-[var(--label-3)]"
        maxLength={140}
        aria-label="Name des Gerichts"
      />
      {f.images.length > 0 && (
        <RecipeImages
          paths={f.images}
          onRemove={(p) =>
            set(
              "images",
              f.images.filter((x) => x !== p),
            )
          }
        />
      )}
      <input
        value={f.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Kurze Beschreibung (optional)"
        className="body mt-2 w-full bg-transparent outline-none placeholder:text-[var(--label-3)]"
        maxLength={600}
        aria-label="Beschreibung"
      />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="glass flex items-center justify-between rounded-[14px] px-3 py-2">
          <span className="subhead" style={{ color: "var(--label-2)" }}>
            Portionen
          </span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => set("servings", Math.max(1, f.servings - 1))} className="headline w-6" aria-label="Weniger Portionen">
              −
            </button>
            <span className="headline tabular w-5 text-center">{f.servings}</span>
            <button type="button" onClick={() => set("servings", Math.min(50, f.servings + 1))} className="headline w-6" aria-label="Mehr Portionen">
              +
            </button>
          </span>
        </label>
        <label className="glass flex items-center justify-between rounded-[14px] px-3 py-2">
          <span className="subhead" style={{ color: "var(--label-2)" }}>
            Minuten
          </span>
          <input
            value={f.minutes}
            onChange={(e) => set("minutes", e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className="headline tabular w-12 bg-transparent text-right outline-none"
            aria-label="Zubereitungszeit in Minuten"
          />
        </label>
      </div>

      <FieldLabel>Zutaten, eine pro Zeile</FieldLabel>
      <textarea
        value={f.ingredients}
        onChange={(e) => set("ingredients", e.target.value)}
        rows={7}
        placeholder={"400 g Spaghetti\n2 Zucchini\n1 Bio-Zitrone\nSalz und Pfeffer"}
        className="body glass w-full rounded-[14px] px-3 py-2.5"
        aria-label="Zutaten"
      />

      <FieldLabel>Zubereitung, Schritte mit Leerzeile trennen</FieldLabel>
      <textarea
        value={f.steps}
        onChange={(e) => set("steps", e.target.value)}
        rows={7}
        placeholder={"Nudeln in Salzwasser kochen.\n\nZucchini raspeln und in Olivenöl anbraten."}
        className="body glass w-full rounded-[14px] px-3 py-2.5"
        aria-label="Zubereitung"
      />

      <FieldLabel>Schlagworte, mit Komma getrennt</FieldLabel>
      <input
        value={f.tags}
        onChange={(e) => set("tags", e.target.value)}
        placeholder="vegetarisch, schnell, Kinder mögen es"
        className="body glass w-full rounded-[14px] px-3 py-2.5"
        aria-label="Schlagworte"
      />

      <FieldLabel>Quelle (optional)</FieldLabel>
      <input
        value={f.sourceUrl}
        onChange={(e) => set("sourceUrl", e.target.value)}
        placeholder="https://"
        inputMode="url"
        className="body glass w-full rounded-[14px] px-3 py-2.5"
        aria-label="Quelle"
      />
    </Sheet>
  );
}
