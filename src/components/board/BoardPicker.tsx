"use client";

import type { Board } from "@/lib/types";
import { fileUrl } from "@/lib/client/upload";
import { Card, Sheet, Switch } from "../ui";
import { HAND_FONT } from "./BoardItemView";

const CORK = {
  backgroundColor: "#c89a63",
  backgroundImage: "radial-gradient(rgba(90,55,20,.35) 1.2px, transparent 1.6px), radial-gradient(rgba(255,235,200,.28) 1px, transparent 1.5px)",
  backgroundSize: "9px 11px, 13px 7px",
} as const;

/** Alle Pinnwände als Kacheln, dazu Einstellungen der aktuellen Wand */
export function BoardPicker({
  open,
  onClose,
  boards,
  current,
  meId,
  trashCount,
  onPick,
  onNew,
  onRename,
  onTrash,
  onDelete,
  onPrivacy,
  allowDelete = true,
}: {
  open: boolean;
  onClose: () => void;
  boards: Board[];
  current: string;
  meId: string | null;
  trashCount: number;
  onPick: (id: string) => void;
  onNew: () => void;
  onRename: () => void;
  onTrash: () => void;
  onDelete: () => void;
  onPrivacy: (priv: boolean) => void;
  allowDelete?: boolean;
}) {
  const board = boards.find((b) => b.id === current);
  const shared = boards.filter((b) => !b.owner).length;
  const isPrivate = !!board?.owner;
  const canDelete = allowDelete && (isPrivate ? board?.owner === meId : shared > 1);
  const canPrivate = !!meId && (isPrivate || shared > 1);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pinnwände"
      z={80}
      leading={
        <button onClick={onClose} className="body" style={{ color: "var(--tint)" }}>
          Fertig
        </button>
      }
      trailing={
        <button
          onClick={onNew}
          className="press flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none font-medium"
          style={{ background: "var(--fill)", color: "var(--tint)" }}
          aria-label="Neue Pinnwand"
        >
          +
        </button>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-3">
        {boards.map((b, i) => {
          const on = b.id === current;
          return (
            <button key={b.id} onClick={() => onPick(b.id)} className="press text-left" aria-current={on ? "true" : undefined}>
              <span
                className="relative block h-[92px] overflow-hidden rounded-[16px]"
                style={{ ...CORK, boxShadow: on ? "0 0 0 2.5px var(--tint), 0 8px 18px -10px rgba(0,0,0,.5)" : "0 8px 18px -12px rgba(0,0,0,.45)" }}
              >
                {b.preview.slice(0, 3).map((p, k) => (
                  <span
                    key={k}
                    className="absolute top-3 block h-[52px] w-[46px] overflow-hidden p-1 text-[8px] leading-tight"
                    style={{
                      left: 10 + k * 40,
                      transform: `rotate(${[-5, 4, -2][k]}deg)`,
                      background: p.kind === "note" ? (p.color ?? "#FFE27A") : "#fff",
                      boxShadow: "0 5px 8px -5px rgba(0,0,0,.5)",
                      fontFamily: HAND_FONT,
                      color: "#1c1c1e",
                    }}
                  >
                    {p.kind === "note" ? (
                      p.text
                    ) : p.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(p.thumb)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      "📄"
                    )}
                  </span>
                ))}
                {b.preview.length === 0 && (
                  <span
                    className="absolute inset-0 flex items-center justify-center text-[13px] font-medium"
                    style={{ color: "rgba(255,255,255,.9)", textShadow: "0 1px 2px rgba(0,0,0,.35)" }}
                  >
                    leer
                  </span>
                )}
                {b.owner && (
                  <span className="caption absolute top-2 right-2 rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "rgba(0,0,0,.45)", color: "white" }}>
                    🔒 Privat
                  </span>
                )}
              </span>
              <span className="mt-1.5 flex items-baseline justify-between gap-2 px-0.5">
                <span className="subhead truncate font-semibold">{b.name}</span>
                <span className="caption shrink-0 tabular" style={{ color: "var(--label-2)" }}>
                  {b.count || ""}
                </span>
              </span>
              <span className="sr-only">{i === 0 ? "erste Pinnwand" : ""}</span>
            </button>
          );
        })}
        <button onClick={onNew} className="press text-left">
          <span className="flex h-[92px] items-center justify-center rounded-[16px] text-[30px] font-light" style={{ border: "1.5px dashed var(--label-3)", color: "var(--tint)" }}>
            +
          </span>
          <span className="subhead mt-1.5 block px-0.5 font-semibold" style={{ color: "var(--tint)" }}>
            Neue Pinnwand
          </span>
        </button>
      </div>

      {board && (
        <>
          <p className="footnote mt-6 mb-2 px-1 font-semibold" style={{ color: "var(--label-2)" }}>
            {board.name.toUpperCase()}
          </p>
          <Card className="overflow-hidden">
            <button onClick={onRename} className="row-press body flex w-full items-center justify-between px-4 py-3 text-left">
              Umbenennen <span style={{ color: "var(--label-3)" }}>›</span>
            </button>
            {canPrivate && (
              <button
                onClick={() => onPrivacy(!isPrivate)}
                className="row-press flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                style={{ borderTop: "0.5px solid var(--separator)" }}
                role="switch"
                aria-checked={isPrivate}
              >
                <span className="min-w-0">
                  <span className="body block">Nur für mich</span>
                  <span className="footnote block" style={{ color: "var(--label-2)" }}>
                    Andere Profile sehen diese Pinnwand nicht.
                  </span>
                </span>
                <Switch on={isPrivate} />
              </button>
            )}
            <button onClick={onTrash} className="row-press body flex w-full items-center justify-between px-4 py-3 text-left" style={{ borderTop: "0.5px solid var(--separator)" }}>
              Papierkorb
              <span style={{ color: "var(--label-3)" }}>{trashCount ? `${trashCount} ` : ""}›</span>
            </button>
            {canDelete && (
              <button
                onClick={onDelete}
                className="row-press body flex w-full items-center px-4 py-3 text-left"
                style={{ borderTop: "0.5px solid var(--separator)", color: "var(--danger)" }}
              >
                Pinnwand löschen
              </button>
            )}
          </Card>
        </>
      )}
    </Sheet>
  );
}
