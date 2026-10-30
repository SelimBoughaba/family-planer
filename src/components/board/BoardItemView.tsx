"use client";

import { memo } from "react";
import { fileUrl } from "@/lib/client/upload";
import { hasPressure, strokePath } from "@/lib/client/ink";
import type { BoardItem, Stroke } from "@/lib/types";

export const HAND_FONT = '"Bradley Hand", "Marker Felt", "Segoe Print", "Comic Sans MS", cursive';

/** Striche als SVG; Koordinaten relativ zum Element */
export function InkSvg({ ink, width, height, overflow = false }: { ink: Stroke[]; width: number; height: number; overflow?: boolean }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute top-0 left-0"
      style={{ overflow: overflow ? "visible" : "hidden" }}
      aria-hidden
    >
      {ink.map((s, i) => (
        <path key={i} d={strokePath(s, hasPressure(s))} fill={s.c} />
      ))}
    </svg>
  );
}

function Pin({ color }: { color: string }) {
  return (
    <span
      className="absolute top-[-7px] left-1/2 h-[15px] w-[15px] -translate-x-1/2 rounded-full"
      style={{ background: `radial-gradient(circle at 35% 30%, white 0 12%, ${color} 40%, color-mix(in oklab, ${color} 60%, black))`, boxShadow: "0 3px 4px rgba(0,0,0,.35)" }}
      aria-hidden
    />
  );
}

/** Ein Element auf der Pinnwand: Zettel, Foto, PDF oder freie Zeichnung */
export const BoardItemView = memo(function BoardItemView({ item, selected }: { item: BoardItem; selected: boolean }) {
  const ring = selected ? "0 0 0 3px var(--tint), " : "";
  const base: React.CSSProperties = {
    position: "absolute",
    left: item.x,
    top: item.y,
    width: item.w,
    height: item.h,
    transform: `rotate(${item.rot}deg)`,
    zIndex: item.z,
  };

  if (item.kind === "ink") {
    // freie Zeichnung: unsichtbarer Rahmen, nur die Striche sind greifbar
    return (
      <div data-item={item.id} style={{ ...base, width: 1, height: 1, transform: undefined }}>
        <svg className="absolute top-0 left-0" width={1} height={1} style={{ overflow: "visible" }} aria-label="Zeichnung">
          {(item.ink ?? []).map((s, i) => (
            <path key={i} data-item={item.id} d={strokePath(s, hasPressure(s))} fill={s.c} style={{ filter: selected ? "drop-shadow(0 0 3px var(--tint))" : undefined }} />
          ))}
        </svg>
      </div>
    );
  }

  if (item.kind === "note") {
    return (
      <div
        data-item={item.id}
        style={{
          ...base,
          background: `linear-gradient(170deg, color-mix(in oklab, ${item.color ?? "#FFE27A"} 88%, white), ${item.color ?? "#FFE27A"})`,
          boxShadow: `${ring}0 14px 18px -10px rgba(0,0,0,.45), 0 2px 3px rgba(0,0,0,.18)`,
          borderRadius: 3,
        }}
        role="note"
        aria-label={item.text ? `Zettel: ${item.text}` : "Zettel"}
      >
        <Pin color="#FF3B30" />
        {item.text && (
          <p
            className="overflow-hidden px-3 pt-4 pb-2 break-words whitespace-pre-wrap"
            style={{ fontFamily: HAND_FONT, fontSize: item.text.length > 80 ? 15 : item.text.length > 30 ? 18 : 22, lineHeight: 1.25, color: "#1c1c1e", maxHeight: "100%" }}
          >
            {item.text}
          </p>
        )}
        {item.ink && <InkSvg ink={item.ink} width={item.w} height={item.h} />}
        {item.expires && (
          <span className="absolute right-1.5 bottom-1 text-[10px] font-semibold" style={{ color: "rgba(0,0,0,.45)" }}>
            bis {new Date(`${item.expires}T12:00`).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    );
  }

  const src = item.kind === "photo" ? item.file : item.thumb;
  return (
    <div
      data-item={item.id}
      style={{ ...base, background: "white", padding: "8px 8px 26px", boxShadow: `${ring}0 16px 20px -12px rgba(0,0,0,.5), 0 2px 4px rgba(0,0,0,.2)`, borderRadius: 2 }}
      aria-label={item.kind === "pdf" ? `PDF ${item.fileName ?? ""}` : "Foto"}
    >
      <Pin color={item.kind === "pdf" ? "#0A84FF" : "#34C759"} />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(src)} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" style={{ background: "#eee" }} loading="lazy" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1" style={{ background: "#f2f2f7" }}>
          <span className="text-4xl" aria-hidden>
            📄
          </span>
        </div>
      )}
      <span className="absolute right-2 bottom-1 left-2 truncate text-center text-[12px]" style={{ fontFamily: HAND_FONT, color: "#3a3a3c" }}>
        {item.kind === "pdf" ? (item.fileName ?? "PDF") : (item.text ?? "")}
      </span>
      {item.expires && (
        <span className="absolute right-1.5 bottom-[-16px] text-[10px] font-semibold" style={{ color: "rgba(255,255,255,.85)" }}>
          bis {new Date(`${item.expires}T12:00`).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
        </span>
      )}
    </div>
  );
});
