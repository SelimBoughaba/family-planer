"use client";

import { useState } from "react";
import { Ambient } from "./ui";

export function LoginScreen({ ready }: { ready: boolean }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | "wrong">("idle");
  const [message, setMessage] = useState<string | null>(
    ready ? null : "Das Familienpasswort ist noch nicht eingerichtet. Es wird in Vercel als Umgebungsvariable FAMILY_PASSWORD hinterlegt.",
  );

  const submit = async () => {
    if (!password || status === "checking" || !ready) return;
    setStatus("checking");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const b = await res.json().catch(() => ({}));
      setStatus("wrong");
      navigator.vibrate?.([30, 40, 30]);
      if (b.error === "wrong_password")
        setMessage(
          b.remaining > 0
            ? `Falsches Passwort. Noch ${b.remaining} ${b.remaining === 1 ? "Versuch" : "Versuche"}, dann 15 Minuten Pause.`
            : "Falsches Passwort. Dieses Gerät ist jetzt 15 Minuten gesperrt.",
        );
      else if (b.error === "locked_device") setMessage("Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.");
      else if (b.error === "locked_global") setMessage("Anmeldung vorübergehend gesperrt, weil es zu viele Fehlversuche gab. Bitte in einer Stunde erneut versuchen.");
      else if (b.error === "password_missing") setMessage("Das Familienpasswort ist noch nicht eingerichtet.");
      else setMessage("Anmeldung gerade nicht möglich. Bitte gleich noch einmal versuchen.");
      setTimeout(() => setStatus("idle"), 500);
    } catch {
      setStatus("idle");
      setMessage("Keine Verbindung zum Server.");
    }
  };

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <Ambient colors={["#8E6CFF", "#FF6B8B", "#3E8BFF"]} />
      <form
        className="flex w-full max-w-sm flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className="large-title text-center">Familienplaner</h1>
        <p className="subhead mt-1 text-center" style={{ color: "var(--label-2)" }}>
          Einmal anmelden, dann bleibt dieses Gerät ein Jahr angemeldet.
        </p>

        {/* verstecktes Benutzerfeld, damit der iPhone-Schlüsselbund das Passwort speichern kann */}
        <input type="text" name="username" autoComplete="username" value="Familie" readOnly hidden />

        <div
          className="glass mt-8 flex items-center gap-2 rounded-[18px] py-1.5 pr-1.5 pl-4"
          style={{ animation: status === "wrong" ? "shake 420ms cubic-bezier(.36,.07,.19,.97)" : undefined }}
        >
          <input
            type={show ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Familienpasswort"
            className="body min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-[var(--label-3)]"
            autoFocus
            disabled={!ready}
            aria-label="Familienpasswort"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="footnote px-2 font-medium" style={{ color: "var(--tint)" }} disabled={!ready}>
            {show ? "Verbergen" : "Zeigen"}
          </button>
        </div>

        <p className="footnote mt-3 min-h-[36px] text-center" style={{ color: "var(--danger)" }} aria-live="polite">
          {message}
        </p>

        <button
          type="submit"
          disabled={!password || status === "checking" || !ready}
          className="press headline mt-2 rounded-[16px] py-3.5 text-white"
          style={{ background: password && ready ? "var(--tint)" : "var(--label-3)", transition: "background 200ms ease" }}
        >
          {status === "checking" ? "Wird geprüft" : "Anmelden"}
        </button>
      </form>
    </main>
  );
}
