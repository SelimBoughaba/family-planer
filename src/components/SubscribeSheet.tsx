"use client";

import { useEffect, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { Card } from "./ui";
import { IconCalendar, IconCheck, IconPerson } from "./icons";

export function SubscribeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useFamily();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !me || token) return;
    let cancel = false;
    fetch("/api/calendar-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: me.id }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => !cancel && setToken(b.token))
      .catch(() => !cancel && setError("Der Link konnte gerade nicht erzeugt werden. Bitte später erneut versuchen."));
    return () => {
      cancel = true;
    };
  }, [open, me, token]);

  if (!open || !me) return null;

  const host = typeof window !== "undefined" ? window.location.host : "";
  const url = (mine: boolean) => (token ? `${host}/kalender/${token}${mine ? "-meine" : ""}.ics` : "");

  const options = [
    { id: "all", mine: false, title: "Alle Familientermine", text: "Jeder Termin der Familie erscheint in deinem Kalender.", Icon: IconCalendar },
    { id: "mine", mine: true, title: "Nur meine Termine", text: `Nur Termine, bei denen ${me.name} eingetragen ist.`, Icon: IconPerson },
  ];

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(`https://${value}`);
      setCopied(id);
      setTimeout(() => setCopied(null), 1600);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal aria-label="Im Apple Kalender anzeigen">
      <button className="fade-in absolute inset-0" style={{ background: "rgba(0,0,0,.25)" }} onClick={onClose} aria-label="Schließen" />
      <div className="sheet-in glass glass-strong relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] px-4 pt-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
        <span className="mx-auto mb-2 block h-[5px] w-9 rounded-full" style={{ background: "var(--label-3)" }} aria-hidden />
        <div className="flex items-center justify-between py-1">
          <span className="w-16" />
          <span className="headline">Apple Kalender</span>
          <button onClick={onClose} className="body w-16 text-right font-semibold" style={{ color: "var(--tint)" }}>
            Fertig
          </button>
        </div>

        <p className="subhead mt-3" style={{ color: "var(--label-2)" }}>
          Tippe auf „Abonnieren“, dann öffnet sich der Kalender deines iPhones. Speichere das Abo dort unter iCloud, dann erscheint es auch auf deinen anderen Apple-Geräten.
        </p>

        {error && (
          <p className="footnote mt-4" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3">
          {options.map(({ id, mine, title, text, Icon }) => (
            <Card key={id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white" style={{ background: mine ? me.color ?? "var(--tint)" : "var(--tint)" }}>
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="headline">{title}</p>
                  <p className="footnote mt-0.5" style={{ color: "var(--label-2)" }}>
                    {text}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <a
                  href={token ? `webcal://${url(mine)}` : undefined}
                  aria-disabled={!token}
                  className="press subhead flex-1 rounded-[12px] py-2.5 text-center font-semibold text-white"
                  style={{ background: token ? "var(--tint)" : "var(--label-3)", pointerEvents: token ? "auto" : "none" }}
                >
                  Abonnieren
                </a>
                <button
                  onClick={() => token && copy(id, url(mine))}
                  disabled={!token}
                  className="press subhead flex items-center gap-1.5 rounded-[12px] px-3 py-2.5 font-semibold"
                  style={{ background: "color-mix(in oklab, var(--label) 7%, transparent)", color: "var(--label)" }}
                >
                  {copied === id ? (
                    <>
                      <IconCheck size={14} /> Kopiert
                    </>
                  ) : (
                    "Link kopieren"
                  )}
                </button>
              </div>
            </Card>
          ))}
        </div>

        <p className="caption mt-5" style={{ color: "var(--label-3)" }}>
          Das Abo ist nur zum Ansehen; neue Termine legst du hier in der App an. Der Apple Kalender holt Änderungen in Abständen ab, nicht sofort. Der Link ist persönlich, gib ihn nicht weiter.
        </p>
      </div>
    </div>
  );
}
