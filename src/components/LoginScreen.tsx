"use client";

import { useCallback, useEffect, useState } from "react";
import { Ambient } from "./ui";

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
const letters: Record<string, string> = { "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ" };

export function LoginScreen({ pinReady }: { pinReady: boolean }) {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "wrong" | "ok">("idle");
  const [message, setMessage] = useState<string | null>(pinReady ? null : "Die PIN ist noch nicht eingerichtet. Sie wird in Vercel als Umgebungsvariable FAMILY_PIN hinterlegt.");

  const submit = useCallback(async (value: string) => {
    setStatus("checking");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      if (res.ok) {
        setStatus("ok");
        window.location.reload();
        return;
      }
      const b = await res.json().catch(() => ({}));
      setStatus("wrong");
      setPin("");
      navigator.vibrate?.([30, 40, 30]);
      if (b.error === "wrong_pin") setMessage(b.remaining > 0 ? `Falsche PIN. Noch ${b.remaining} ${b.remaining === 1 ? "Versuch" : "Versuche"}, dann 15 Minuten Pause.` : "Falsche PIN. Dieses Gerät ist jetzt 15 Minuten gesperrt.");
      else if (b.error === "locked_device") setMessage("Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.");
      else if (b.error === "locked_global") setMessage("Anmeldung vorübergehend gesperrt, weil es zu viele Fehlversuche gab. Bitte in einer Stunde erneut versuchen.");
      else if (b.error === "pin_missing") setMessage("Die PIN ist noch nicht eingerichtet.");
      else setMessage("Anmeldung gerade nicht möglich. Bitte gleich noch einmal versuchen.");
      setTimeout(() => setStatus("idle"), 500);
    } catch {
      setStatus("idle");
      setPin("");
      setMessage("Keine Verbindung zum Server.");
    }
  }, []);

  const press = useCallback(
    (k: string) => {
      if (status === "checking" || status === "ok" || !pinReady) return;
      if (k === "del") return setPin((p) => p.slice(0, -1));
      setPin((p) => {
        if (p.length >= 6) return p;
        const next = p + k;
        if (next.length === 6) void submit(next);
        return next;
      });
    },
    [status, pinReady, submit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <Ambient colors={["#8E6CFF", "#FF6B8B", "#3E8BFF"]} />
      <div className="flex w-full max-w-xs flex-col items-center">
        <h1 className="title-2">Familienplaner</h1>
        <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
          Familien-PIN eingeben
        </p>

        <div
          className="mt-8 flex gap-4"
          style={{ animation: status === "wrong" ? "shake 420ms cubic-bezier(.36,.07,.19,.97)" : undefined }}
          aria-live="polite"
          aria-label={`${pin.length} von 6 Ziffern eingegeben`}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="h-3.5 w-3.5 rounded-full"
              style={{
                border: "1.5px solid var(--label)",
                background: i < pin.length ? "var(--label)" : "transparent",
                transition: "background 120ms ease",
              }}
            />
          ))}
        </div>

        <p className="footnote mt-5 min-h-[36px] text-center" style={{ color: status === "wrong" || !pinReady ? "var(--danger)" : "var(--label-2)" }}>
          {message}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-4">
          {keys.map((k, i) =>
            k === "" ? (
              <span key={i} />
            ) : k === "del" ? (
              <button key={i} onClick={() => press("del")} className="press body h-[78px] w-[78px] font-medium" aria-label="Löschen" disabled={!pin.length}>
                {pin.length ? "Löschen" : ""}
              </button>
            ) : (
              <button
                key={i}
                onClick={() => press(k)}
                className="press glass flex h-[78px] w-[78px] flex-col items-center justify-center rounded-full"
                aria-label={k}
              >
                <span className="text-[34px] leading-none font-normal tabular">{k}</span>
                {letters[k] && <span className="mt-0.5 text-[10px] font-semibold tracking-[2px]" style={{ color: "var(--label-2)" }}>{letters[k]}</span>}
              </button>
            ),
          )}
        </div>
      </div>
    </main>
  );
}
