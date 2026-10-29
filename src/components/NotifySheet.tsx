"use client";

import { useEffect, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { disablePush, enablePush, pushStatus, type PushStatus } from "@/lib/client/push";
import { Card } from "./ui";

function Toggle({ label, hint, on, onChange, disabled }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <span className="min-w-0">
        <span className="body block">{label}</span>
        <span className="footnote block" style={{ color: "var(--label-2)" }}>
          {hint}
        </span>
      </span>
      <span className="relative h-[31px] w-[51px] shrink-0 rounded-full" style={{ background: on ? "var(--success)" : "color-mix(in oklab, var(--label) 14%, transparent)", transition: "background 200ms ease" }}>
        <span
          className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white"
          style={{ left: on ? 22 : 2, boxShadow: "0 3px 8px rgba(0,0,0,.15)", transition: "left 220ms cubic-bezier(0.3, 1.3, 0.5, 1)" }}
        />
      </span>
    </button>
  );
}

const statusText: Record<PushStatus, string> = {
  unsupported: "Dieser Browser unterstützt keine Mitteilungen für Web-Apps.",
  "needs-install": "Auf dem iPhone gehen Mitteilungen nur, wenn die App auf dem Home-Bildschirm liegt: In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“. Danach die App von dort öffnen und hier einschalten.",
  denied: "Mitteilungen sind für diese App gesperrt. Du kannst sie in den Einstellungen deines Geräts unter Mitteilungen wieder erlauben.",
  off: "Auf diesem Gerät sind Mitteilungen aus.",
  on: "Auf diesem Gerät sind Mitteilungen an.",
};

export function NotifySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, run } = useFamily();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    void pushStatus().then((s) => !cancel && setStatus(s));
    return () => {
      cancel = true;
    };
  }, [open]);

  if (!open || !me) return null;
  const prefs = me.notifyPrefs;

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    const r = await enablePush(me.id);
    setStatus(await pushStatus());
    if (!r.ok) setMessage(r.message ?? null);
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    await disablePush();
    setStatus(await pushStatus());
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    const res = await fetch("/api/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: me.id }) });
    const b = await res.json().catch(() => ({}));
    setMessage(b.delivered ? "Testnachricht ist unterwegs." : "Es wurde kein Gerät erreicht. Schalte Mitteilungen auf diesem Gerät erneut ein.");
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal aria-label="Mitteilungen">
      <button className="fade-in absolute inset-0" style={{ background: "rgba(0,0,0,.25)" }} onClick={onClose} aria-label="Schließen" />
      <div className="sheet-in glass glass-strong relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] px-4 pt-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
        <span className="mx-auto mb-2 block h-[5px] w-9 rounded-full" style={{ background: "var(--label-3)" }} aria-hidden />
        <div className="flex items-center justify-between py-1">
          <span className="w-16" />
          <span className="headline">Mitteilungen</span>
          <button onClick={onClose} className="body w-16 text-right font-semibold" style={{ color: "var(--tint)" }}>
            Fertig
          </button>
        </div>

        <Card className="mt-4 p-4">
          <p className="headline">Dieses Gerät</p>
          <p className="subhead mt-1" style={{ color: status === "denied" || status === "needs-install" ? "var(--danger)" : "var(--label-2)" }}>
            {status ? statusText[status] : "Wird geprüft"}
          </p>
          {(status === "off" || status === "on") && (
            <div className="mt-3 flex gap-2">
              {status === "off" ? (
                <button onClick={() => void enable()} disabled={busy} className="press subhead flex-1 rounded-[12px] py-2.5 font-semibold text-white" style={{ background: "var(--tint)" }}>
                  Mitteilungen einschalten
                </button>
              ) : (
                <>
                  <button onClick={() => void test()} disabled={busy} className="press subhead flex-1 rounded-[12px] py-2.5 font-semibold text-white" style={{ background: "var(--tint)" }}>
                    Testnachricht senden
                  </button>
                  <button onClick={() => void disable()} disabled={busy} className="press subhead rounded-[12px] px-3 py-2.5 font-semibold" style={{ background: "color-mix(in oklab, var(--label) 7%, transparent)" }}>
                    Ausschalten
                  </button>
                </>
              )}
            </div>
          )}
          {message && (
            <p className="footnote mt-3" style={{ color: "var(--label-2)" }} role="status">
              {message}
            </p>
          )}
        </Card>

        <p className="footnote mt-6 mb-2 px-1 font-semibold" style={{ color: "var(--label-2)" }}>
          Benachrichtige mich, wenn
        </p>
        <Card className="overflow-hidden">
          <Toggle
            label="ich zu einem Termin eingetragen werde"
            hint="Wenn jemand anderes dich bei einem Termin dazunimmt"
            on={prefs.invited}
            onChange={(v) => void run({ op: "person.setNotify", id: me.id, prefs: { ...prefs, invited: v } })}
          />
          <div className="mx-4 h-px" style={{ background: "var(--separator)" }} />
          <Toggle
            label="mir eine Aufgabe gegeben wird"
            hint="Wenn jemand dir eine Aufgabe zuweist"
            on={prefs.assigned}
            onChange={(v) => void run({ op: "person.setNotify", id: me.id, prefs: { ...prefs, assigned: v } })}
          />
        </Card>
        <p className="caption mt-3 px-1" style={{ color: "var(--label-3)" }}>
          Erinnerungen an Termine und Aufgaben stellst du direkt beim Termin bzw. bei der Aufgabe ein. Die Einstellungen gelten für {me.name} auf allen Geräten.
        </p>
      </div>
    </div>
  );
}
