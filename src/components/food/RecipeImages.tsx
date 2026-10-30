"use client";

import { useState } from "react";
import { fileUrl } from "@/lib/client/upload";

/** Originalfotos und PDFs eines Rezepts als Vorschau; antippen öffnet groß */
export function RecipeImages({ paths, onRemove }: { paths: string[]; onRemove?: (path: string) => void }) {
  const [big, setBig] = useState<string | null>(null);
  return (
    <>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {paths.map((p) => {
          const pdf = p.endsWith(".pdf");
          return (
            <span key={p} className="relative shrink-0">
              <button
                type="button"
                onClick={() => (pdf ? window.open(fileUrl(p), "_blank") : setBig(p))}
                className="press glass flex h-20 w-16 items-center justify-center overflow-hidden rounded-[12px]"
                aria-label={pdf ? "PDF öffnen" : "Foto groß ansehen"}
              >
                {pdf ? (
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-2xl" aria-hidden>
                      📄
                    </span>
                    <span className="caption font-semibold">PDF</span>
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(p)} alt="Originalrezept" className="h-full w-full object-cover" loading="lazy" />
                )}
              </button>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(p)}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: "var(--label-2)" }}
                  aria-label="Original entfernen"
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
      </div>
      {big && (
        <div
          className="fade-in fixed inset-0 z-[70] flex items-center justify-center p-3"
          style={{ background: "rgba(0,0,0,.85)" }}
          onClick={() => setBig(null)}
          role="dialog"
          aria-modal
          aria-label="Originalrezept"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(big)} alt="Originalrezept" className="max-h-full max-w-full rounded-[12px] object-contain" />
        </div>
      )}
    </>
  );
}
