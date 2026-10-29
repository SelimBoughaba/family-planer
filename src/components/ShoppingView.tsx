"use client";

import { useState } from "react";
import { useFamily } from "@/lib/client/family";
import { guessCategory, parseItem } from "@/lib/shopping";
import type { Item } from "@/lib/types";
import { Avatar, Card, ContextMenu } from "./ui";
import { SwipeRow } from "./SwipeRow";
import { IconCheck, IconPlus, IconTrash, IconChevron } from "./icons";

export function ShoppingView() {
  const { state, run, person } = useFamily();
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState<Item | null>(null);
  const [moveFor, setMoveFor] = useState<Item | null>(null);

  const items = state?.items ?? [];
  const categories = state?.lists.categories ?? [];
  // Abteilungen, die der Owner gelöscht hat, landen sichtbar unter der letzten
  const fallback = categories.includes("Vorrat") ? "Vorrat" : categories[categories.length - 1];
  const bucket = (c: string) => (categories.includes(c) ? c : fallback);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  const toggle = (it: Item) => run({ op: "item.toggle", id: it.id, done: !it.done });
  const remove = (it: Item) => run({ op: "item.delete", id: it.id });

  const add = () => {
    if (!draft.trim()) return;
    const { name, amount } = parseItem(draft);
    void run({ op: "item.create", name, amount, category: bucket(guessCategory(name)) });
    setDraft("");
  };

  return (
    <div className="mx-auto max-w-md px-4 safe-top safe-bottom">
      <header className="mb-4">
        <p className="footnote font-medium tabular" style={{ color: "var(--label-2)" }}>
          {open.length === 0 ? "Alles besorgt" : `${open.length} Artikel offen`}
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
          enterKeyHint="send"
          autoComplete="off"
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
        const list = open.filter((i) => bucket(i.category) === cat);
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
                  leading={{ label: "Im Wagen", color: "var(--success)", icon: <IconCheck size={18} />, onTrigger: () => toggle(it) }}
                  trailing={{ label: "Löschen", color: "var(--danger)", icon: <IconTrash size={18} />, onTrigger: () => remove(it) }}
                  onLongPress={() => setMenu(it)}
                >
                  <div
                    className={`flex items-center gap-3 px-4 py-3 ${it.id.startsWith("tmp-") ? "sheet-in" : ""}`}
                    style={{ borderTop: idx ? "0.5px solid var(--separator)" : "none" }}
                  >
                    <button
                      onClick={() => toggle(it)}
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
                    <Avatar person={person(it.addedBy)} size={20} />
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
                    onClick={() => toggle(it)}
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
                onClick={() => run({ op: "item.clearDone" })}
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
                { label: "Im Wagen", icon: <IconCheck size={18} />, onSelect: () => toggle(menu) },
                { label: "Andere Abteilung", onSelect: () => setTimeout(() => setMoveFor(menu), 50) },
                { label: "Löschen", icon: <IconTrash size={18} />, destructive: true, onSelect: () => remove(menu) },
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
                  {menu.category}
                  {person(menu.addedBy) ? `, eingetragen von ${person(menu.addedBy)!.name}` : ""}
                </p>
              </div>
              <Avatar person={person(menu.addedBy)} size={32} />
            </div>
          )
        }
      />
      <ContextMenu
        open={!!moveFor}
        onClose={() => setMoveFor(null)}
        preview={moveFor && <p className="headline">„{moveFor.name}“ verschieben nach</p>}
        actions={
          moveFor
            ? categories
                .filter((c) => c !== moveFor.category)
                .map((c) => ({ label: c, onSelect: () => run({ op: "item.move", id: moveFor.id, category: c }) }))
            : []
        }
      />
    </div>
  );
}
