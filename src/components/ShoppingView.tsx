"use client";

import { useState } from "react";
import { categories, guessCategory, personById, type Item } from "@/lib/mock";
import { Avatar, Card, ContextMenu } from "./ui";
import { SwipeRow } from "./SwipeRow";
import { IconCheck, IconPlus, IconTrash, IconChevron } from "./icons";

export function ShoppingView({
  items,
  setItems,
  me,
}: {
  items: Item[];
  setItems: (fn: (i: Item[]) => Item[]) => void;
  me: string;
}) {
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState<Item | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  const toggle = (id: string) => setItems((is) => is.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => setItems((is) => is.filter((i) => i.id !== id));

  const add = () => {
    const raw = draft.trim();
    if (!raw) return;
    // "2 l Milch" oder "Milch 2 l" erkennen
    const m = raw.match(/^(\d+[.,]?\d*\s?(?:kg|g|l|ml|x|stk\.?|packungen?|pck\.?)?)\s+(.+)$/i);
    const name = m ? m[2] : raw;
    const amount = m ? m[1] : undefined;
    const id = `n${Date.now()}`;
    setItems((is) => [{ id, name, amount, category: guessCategory(name), by: me, done: false }, ...is]);
    setJustAdded(id);
    setDraft("");
    setTimeout(() => setJustAdded(null), 1200);
  };

  return (
    <div className="mx-auto max-w-md px-4 safe-top safe-bottom">
      <header className="mb-4">
        <p className="footnote font-medium tabular" style={{ color: "var(--label-2)" }}>
          {open.length === 0 ? "Alles erledigt" : `${open.length} Artikel offen`}
        </p>
        <h1 className="large-title">Einkauf</h1>
      </header>

      <form
        className="glass sticky z-20 flex items-center gap-2 rounded-[22px] py-1.5 pr-1.5 pl-4"
        style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Artikel hinzufügen, z. B. 2 l Milch"
          className="body min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-[var(--label-3)]"
          enterKeyHint="done"
          aria-label="Artikel hinzufügen"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="press flex h-9 w-9 items-center justify-center rounded-full text-white"
          style={{ background: draft.trim() ? "var(--tint)" : "var(--label-3)", transition: "background 200ms ease" }}
          aria-label="Hinzufügen"
        >
          <IconPlus size={18} strokeWidth={2.4} />
        </button>
      </form>

      {categories.map((cat) => {
        const list = open.filter((i) => i.category === cat);
        if (!list.length) return null;
        return (
          <div key={cat}>
            <h2 className="subhead mt-6 mb-2 px-1 font-semibold" style={{ color: "var(--label-2)" }}>
              {cat}
            </h2>
            <Card className="overflow-hidden">
              {list.map((it, idx) => (
                <SwipeRow
                  key={it.id}
                  leading={{ label: "Im Wagen", color: "var(--success)", icon: <IconCheck size={18} />, onTrigger: () => toggle(it.id) }}
                  trailing={{ label: "Löschen", color: "var(--danger)", icon: <IconTrash size={18} />, onTrigger: () => remove(it.id) }}
                  onLongPress={() => setMenu(it)}
                >
                  <div
                    className={`flex items-center gap-3 px-4 py-3 ${justAdded === it.id ? "sheet-in" : ""}`}
                    style={{ borderTop: idx ? "0.5px solid var(--separator)" : "none" }}
                  >
                    <button
                      onClick={() => toggle(it.id)}
                      className="h-[26px] w-[26px] shrink-0 rounded-full"
                      style={{ border: "1.6px solid var(--label-3)" }}
                      aria-label={`${it.name} abhaken`}
                    />
                    <p className="body min-w-0 flex-1 truncate">{it.name}</p>
                    {it.amount && (
                      <span className="subhead tabular" style={{ color: "var(--label-2)" }}>
                        {it.amount}
                      </span>
                    )}
                    <Avatar person={personById(it.by)} size={20} />
                  </div>
                </SwipeRow>
              ))}
            </Card>
          </div>
        );
      })}

      {open.length === 0 && (
        <Card className="mt-6 p-5 text-center">
          <p className="headline">Die Liste ist leer.</p>
          <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
            Oben eintippen, was fehlt. Die Abteilung wird automatisch erkannt.
          </p>
        </Card>
      )}

      {done.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowDone((s) => !s)} className="mb-2 flex w-full items-center justify-between px-1" aria-expanded={showDone}>
            <span className="subhead font-semibold" style={{ color: "var(--label-2)" }}>
              Im Wagen ({done.length})
            </span>
            <span style={{ color: "var(--label-2)", transform: `rotate(${showDone ? 90 : 0}deg)`, transition: "transform 220ms ease" }}>
              <IconChevron size={16} strokeWidth={2.2} />
            </span>
          </button>
          {showDone && (
            <Card className="fade-in overflow-hidden">
              {done.map((it, idx) => (
                <div key={it.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: idx ? "0.5px solid var(--separator)" : "none" }}>
                  <button
                    onClick={() => toggle(it.id)}
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: "var(--success)" }}
                    aria-label={`${it.name} zurück auf die Liste`}
                  >
                    <IconCheck size={14} className="check-pop" />
                  </button>
                  <p className="body flex-1 truncate line-through" style={{ color: "var(--label-3)" }}>
                    {it.name}
                  </p>
                </div>
              ))}
              <button
                onClick={() => setItems((is) => is.filter((i) => !i.done))}
                className="subhead w-full px-4 py-3 text-left font-medium"
                style={{ color: "var(--danger)", borderTop: "0.5px solid var(--separator)" }}
              >
                Erledigte entfernen
              </button>
            </Card>
          )}
        </div>
      )}

      <ContextMenu
        open={!!menu}
        onClose={() => setMenu(null)}
        actions={
          menu
            ? [
                { label: "Im Wagen", icon: <IconCheck size={18} />, onSelect: () => toggle(menu.id) },
                ...categories
                  .filter((c) => c !== menu.category)
                  .slice(0, 2)
                  .map((c) => ({
                    label: `Nach ${c}`,
                    onSelect: () => setItems((is) => is.map((i) => (i.id === menu.id ? { ...i, category: c } : i))),
                  })),
                { label: "Löschen", icon: <IconTrash size={18} />, destructive: true, onSelect: () => remove(menu.id) },
              ]
            : []
        }
        preview={
          menu && (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="headline">
                  {menu.name}
                  {menu.amount ? `, ${menu.amount}` : ""}
                </p>
                <p className="footnote" style={{ color: "var(--label-2)" }}>
                  {menu.category}, eingetragen von {personById(menu.by).name}
                </p>
              </div>
              <Avatar person={personById(menu.by)} size={32} />
            </div>
          )
        }
      />
    </div>
  );
}
