"use client";

import { useFamily } from "@/lib/client/family";
import { fileUrl } from "@/lib/client/upload";
import { Card, SectionTitle } from "../ui";
import { HAND_FONT } from "./BoardItemView";

/** Kachel in „Heute“: kleine Vorschau der Familienwand, antippen öffnet sie */
export function BoardTile({ onOpen }: { onOpen: (boardId: string) => void }) {
  const { state } = useFamily();
  const boards = state?.boards ?? [];
  const main = boards[0];
  if (!main) return null;
  const rots = [-4, 3, -2, 5];
  return (
    <>
      <SectionTitle
        trailing={
          boards.length > 1 ? (
            <span className="subhead" style={{ color: "var(--label-2)" }}>
              {boards.length} Wände
            </span>
          ) : undefined
        }
      >
        Pinnwand
      </SectionTitle>
      <Card className="overflow-hidden p-0">
        <button onClick={() => onOpen(main.id)} className="block w-full text-left" aria-label={`Pinnwand ${main.name} öffnen`}>
          <div
            className="relative flex h-[132px] items-center gap-3 overflow-hidden px-4"
            style={{
              backgroundColor: "#c89a63",
              backgroundImage: "radial-gradient(rgba(90,55,20,.35) 1.2px, transparent 1.6px), radial-gradient(rgba(255,235,200,.28) 1px, transparent 1.5px)",
              backgroundSize: "9px 11px, 13px 7px",
            }}
          >
            {main.preview.length === 0 && (
              <p className="subhead w-full text-center font-medium" style={{ color: "rgba(255,255,255,.95)", textShadow: "0 1px 2px rgba(0,0,0,.35)" }}>
                Noch leer. Tippen, um den ersten Zettel anzupinnen.
              </p>
            )}
            {main.preview.map((p, i) =>
              p.kind === "note" ? (
                <span
                  key={i}
                  className="flex h-[78px] w-[78px] shrink-0 items-start overflow-hidden p-1.5 text-[11px] leading-tight"
                  style={{
                    background: p.color ?? "#FFE27A",
                    transform: `rotate(${rots[i]}deg)`,
                    boxShadow: "0 8px 10px -6px rgba(0,0,0,.45)",
                    fontFamily: HAND_FONT,
                    color: "#1c1c1e",
                  }}
                >
                  {p.text ?? "✏️"}
                </span>
              ) : (
                <span key={i} className="h-[86px] w-[70px] shrink-0 bg-white p-1 pb-3" style={{ transform: `rotate(${rots[i]}deg)`, boxShadow: "0 8px 10px -6px rgba(0,0,0,.45)" }}>
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(p.thumb)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl">📄</span>
                  )}
                </span>
              ),
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="headline">{main.name}</span>
            <span className="subhead" style={{ color: "var(--label-2)" }}>
              {main.count ? `${main.count} ${main.count === 1 ? "Sache" : "Sachen"}` : "leer"}
            </span>
          </div>
        </button>
      </Card>
    </>
  );
}
