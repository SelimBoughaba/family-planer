"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Ambient, Card } from "../ui";
import { IconChevron, IconTrash } from "../icons";

// --- Typen der Status-Antwort ----------------------------------------------

type Device = { id: string; label: string; createdAt: string; lastSuccess: string | null };
type OwnerPerson = { id: string; name: string; color: string | null; sort: number; calendarActive: boolean; devices: Device[] };
type Backup = { id: string; kind: "auto" | "manual" | "before-restore"; size_bytes: number; created_at: string };
type ErrorEntry = { id: number; source: string; message: string; detail: string | null; created_at: string };
type Status = {
  system: {
    familyPassword: boolean;
    ownerPassword: boolean;
    push: boolean;
    scheduler: { lastRun: string | null; healthy: boolean };
    sessionEpoch: number;
    lastLogin: Record<string, string>;
  };
  counts: { events: number; open_tasks: number; done_tasks: number; open_items: number; done_items: number; errors_24h: number };
  people: OwnerPerson[];
  backups: Backup[];
  errors: ErrorEntry[];
  failedLogins: { ip: string; kind: string; at: string }[];
  lists: { categories: string[]; areas: string[] };
  ai: { configured: boolean; model: string; limitUsd: number; month: { usd: number; calls: number; input: number; output: number } };
};

const fmt = (iso: string | null | undefined, withTime = true) =>
  iso ? new Date(iso).toLocaleString("de-DE", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }) : "nie";

const ago = (iso: string | null) => {
  if (!iso) return "noch nie";
  const s = Math.round((Date.now() - +new Date(iso)) / 1000);
  if (s < 90) return "gerade eben";
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return `vor ${Math.round(s / 86400)} Tagen`;
};

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const backupKind = { auto: "Automatisch", manual: "Manuell", "before-restore": "Vor einer Änderung" } as const;

// --- kleine Bausteine -------------------------------------------------------

function Row({ children, onClick, last }: { children: ReactNode; onClick?: () => void; last?: boolean }) {
  const cls = "flex w-full items-center gap-3 px-4 py-3 text-left";
  const style = { borderBottom: last ? "none" : "0.5px solid var(--separator)" };
  return onClick ? (
    <button className={`${cls} active:bg-black/5`} style={style} onClick={onClick}>
      {children}
    </button>
  ) : (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="mt-7">
      <h2 className="footnote mb-2 px-1 font-semibold" style={{ color: "var(--label-2)" }}>
        {title}
      </h2>
      <Card className="overflow-hidden">{children}</Card>
      {hint && (
        <p className="caption mt-2 px-1" style={{ color: "var(--label-3)" }}>
          {hint}
        </p>
      )}
    </section>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ok ? "var(--success)" : "var(--danger)" }} aria-label={ok ? "in Ordnung" : "Problem"} />;
}

function ActionButton({ children, onClick, destructive, disabled }: { children: ReactNode; onClick: () => void; destructive?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="press subhead shrink-0 rounded-full px-3 py-1.5 font-semibold"
      style={{
        background: destructive ? "color-mix(in oklab, var(--danger) 12%, transparent)" : "color-mix(in oklab, var(--tint) 12%, transparent)",
        color: destructive ? "var(--danger)" : "var(--tint)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

type Confirm = { title: string; text: string; action: string; destructive?: boolean; typed?: string; run: () => Promise<void> };

function ConfirmDialog({ c, onClose }: { c: Confirm | null; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  if (!c) return null;
  const ok = !c.typed || typed.trim().toUpperCase() === c.typed;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" role="alertdialog" aria-modal>
      <button
        className="fade-in absolute inset-0"
        style={{ background: "rgba(0,0,0,.3)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
        onClick={onClose}
        aria-label="Abbrechen"
      />
      <div className="rise glass glass-strong relative w-full max-w-sm rounded-[22px] p-5">
        <p className="headline">{c.title}</p>
        <p className="subhead mt-1.5" style={{ color: "var(--label-2)" }}>
          {c.text}
        </p>
        {c.typed && (
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`${c.typed} eingeben`}
            className="body glass mt-4 w-full rounded-[12px] px-3 py-2"
            autoCapitalize="characters"
            aria-label="Bestätigung"
          />
        )}
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="press body flex-1 rounded-[12px] py-2.5 font-medium" style={{ background: "var(--fill)" }}>
            Abbrechen
          </button>
          <button
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true);
              await c.run();
              setBusy(false);
              setTyped("");
              onClose();
            }}
            className="press body flex-1 rounded-[12px] py-2.5 font-semibold text-white"
            style={{ background: c.destructive ? "var(--danger)" : "var(--tint)", opacity: ok ? 1 : 0.4 }}
          >
            {busy ? "Läuft" : c.action}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Anmeldung --------------------------------------------------------------

export function OwnerGate({ state }: { state: "family" | "missing" | "login" }) {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pw || busy) return;
    setBusy(true);
    const res = await fetch("/api/owner/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (res.ok) {
      try {
        localStorage.setItem("fp_owner_device", "1");
      } catch {}
      window.location.reload();
      return;
    }
    const b = await res.json().catch(() => ({}));
    setPw("");
    setBusy(false);
    if (b.error === "wrong_password")
      setMsg(b.remaining > 0 ? `Falsches Passwort. Noch ${b.remaining} Versuche, dann 15 Minuten Pause.` : "Falsches Passwort. Dieses Gerät ist jetzt 15 Minuten gesperrt.");
    else if (b.error === "locked_device") setMsg("Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.");
    else if (b.error === "locked_global") setMsg("Vorübergehend gesperrt. Bitte in einer Stunde erneut versuchen.");
    else setMsg("Anmeldung gerade nicht möglich.");
  };

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <Ambient colors={["#5E5CE6", "#30B0C7"]} />
      <div className="w-full max-w-sm">
        <h1 className="large-title text-center">Verwaltung</h1>
        {state === "family" && (
          <p className="subhead mt-3 text-center" style={{ color: "var(--label-2)" }}>
            Melde dich zuerst in der App mit dem Familienpasswort an.{" "}
            <Link href="/" style={{ color: "var(--tint)" }}>
              Zur App
            </Link>
          </p>
        )}
        {state === "missing" && (
          <p className="subhead mt-3 text-center" style={{ color: "var(--danger)" }}>
            Das Owner-Passwort ist noch nicht eingerichtet. Es wird in Vercel als Umgebungsvariable OWNER_PASSWORD hinterlegt, mindestens 10 Zeichen.
          </p>
        )}
        {state === "login" && (
          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input type="text" name="username" autoComplete="username" value="Owner" readOnly hidden />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Owner-Passwort"
              className="body glass w-full rounded-[18px] px-4 py-3.5"
              autoFocus
              aria-label="Owner-Passwort"
            />
            <p className="footnote mt-3 min-h-[36px] text-center" style={{ color: "var(--danger)" }} aria-live="polite">
              {msg}
            </p>
            <button
              type="submit"
              disabled={!pw || busy}
              className="press headline mt-1 w-full rounded-[16px] py-3.5 text-white"
              style={{ background: pw ? "var(--tint)" : "var(--label-3)" }}
            >
              {busy ? "Wird geprüft" : "Entsperren"}
            </button>
            <Link href="/" className="subhead mt-5 block text-center" style={{ color: "var(--tint)" }}>
              Zurück zur App
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}

// --- Owner-Bereich ------------------------------------------------------------

type Tab = "status" | "personen" | "daten" | "listen" | "protokoll";
const tabs: { id: Tab; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "personen", label: "Personen" },
  { id: "daten", label: "Daten" },
  { id: "listen", label: "Listen" },
  { id: "protokoll", label: "Protokoll" },
];

export function OwnerApp() {
  const [tab, setTab] = useState<Tab>("status");
  const [s, setS] = useState<Status | null>(null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/owner/status", { cache: "no-store" });
    if (res.status === 401 || res.status === 403) return window.location.reload();
    if (res.ok) setS(await res.json());
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const say = (text: string, bad = false) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), 2600);
  };

  const act = async (body: Record<string, unknown>, success?: string | ((r: Record<string, unknown>) => string)) => {
    const res = await fetch("/api/owner/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) say(r.message ?? "Das hat nicht geklappt.", true);
    else if (success) say(typeof success === "function" ? success(r) : success);
    await load();
    return res.ok;
  };

  const lock = async () => {
    await fetch("/api/owner/logout", { method: "POST" });
    window.location.replace("/");
  };

  return (
    <main className="relative isolate min-h-dvh">
      <Ambient colors={["#5E5CE6", "#30B0C7"]} />
      <div className="mx-auto max-w-md px-4 pb-16 safe-top">
        <header className="flex items-end justify-between">
          <div>
            <Link href="/" className="footnote flex items-center gap-0.5 font-semibold" style={{ color: "var(--tint)" }}>
              <IconChevron size={14} className="rotate-180" /> App
            </Link>
            <h1 className="large-title">Verwaltung</h1>
          </div>
          <button onClick={() => void lock()} className="press subhead glass rounded-full px-3.5 py-2 font-semibold">
            Sperren
          </button>
        </header>

        <nav className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4" aria-label="Bereiche">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="press subhead shrink-0 rounded-full px-3.5 py-1.5 font-semibold"
              style={{ background: tab === t.id ? "var(--label)" : "var(--glass)", color: tab === t.id ? "var(--bg)" : "var(--label)" }}
              aria-current={tab === t.id ? "page" : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {!s ? (
          <p className="subhead mt-10 text-center" style={{ color: "var(--label-2)" }}>
            Wird geladen
          </p>
        ) : (
          <>
            {tab === "status" && <StatusTab s={s} act={act} setConfirm={setConfirm} />}
            {tab === "personen" && <PeopleTab s={s} act={act} setConfirm={setConfirm} />}
            {tab === "daten" && <DataTab s={s} act={act} setConfirm={setConfirm} say={say} reload={load} />}
            {tab === "listen" && <ListsTab s={s} act={act} />}
            {tab === "protokoll" && <LogTab s={s} act={act} setConfirm={setConfirm} />}
          </>
        )}
      </div>

      {toast && (
        <div className="fixed inset-x-0 z-50 mx-auto max-w-md px-4" style={{ bottom: "calc(var(--safe-b) + 20px)" }}>
          <div
            className="rise glass glass-strong subhead rounded-[16px] px-4 py-3 text-center font-medium"
            style={{ color: toast.bad ? "var(--danger)" : "var(--label)" }}
            role="status"
          >
            {toast.text}
          </div>
        </div>
      )}
      <ConfirmDialog c={confirm} onClose={() => setConfirm(null)} />
    </main>
  );
}

type TabProps = {
  s: Status;
  act: (body: Record<string, unknown>, success?: string | ((r: Record<string, unknown>) => string)) => Promise<boolean>;
  setConfirm: (c: Confirm) => void;
};

function StatusTab({ s, act, setConfirm }: TabProps) {
  const sys = s.system;
  const devices = s.people.reduce((n, p) => n + p.devices.length, 0);
  return (
    <>
      <Section title="System">
        <Row>
          <Dot ok={sys.scheduler.healthy} />
          <span className="body flex-1">Zeitplaner für Erinnerungen</span>
          <span className="subhead" style={{ color: "var(--label-2)" }}>
            {ago(sys.scheduler.lastRun)}
          </span>
        </Row>
        <Row>
          <Dot ok={sys.push} />
          <span className="body flex-1">Push-Schlüssel</span>
          <span className="subhead" style={{ color: "var(--label-2)" }}>
            {sys.push ? "eingerichtet" : "fehlen"}
          </span>
        </Row>
        <Row>
          <Dot ok={sys.familyPassword} />
          <span className="body flex-1">Familienpasswort</span>
          <span className="subhead" style={{ color: "var(--label-2)" }}>
            {sys.lastLogin.family ? `zuletzt genutzt ${ago(sys.lastLogin.family)}` : "gesetzt"}
          </span>
        </Row>
        <Row last>
          <Dot ok={s.counts.errors_24h === 0} />
          <span className="body flex-1">Fehler in 24 Stunden</span>
          <span className="subhead tabular" style={{ color: "var(--label-2)" }}>
            {s.counts.errors_24h}
          </span>
        </Row>
      </Section>

      <Section title="Inhalt">
        {(
          [
            ["Termine", s.counts.events],
            ["Offene Aufgaben", s.counts.open_tasks],
            ["Erledigte Aufgaben", s.counts.done_tasks],
            ["Einkauf offen", s.counts.open_items],
            ["Geräte mit Mitteilungen", devices],
            ["Sicherungen", s.backups.length],
          ] as const
        ).map(([k, v], i, a) => (
          <Row key={k} last={i === a.length - 1}>
            <span className="body flex-1">{k}</span>
            <span className="subhead tabular" style={{ color: "var(--label-2)" }}>
              {v}
            </span>
          </Row>
        ))}
      </Section>

      <AiSection s={s} act={act} />

      <Section title="Anmeldungen" hint="Meldet alle Geräte der Familie ab. Jeder muss danach das Familienpasswort neu eingeben. Dieses Gerät bleibt angemeldet.">
        <Row>
          <span className="body flex-1">Fehlversuche in 7 Tagen</span>
          <span className="subhead tabular" style={{ color: s.failedLogins.length ? "var(--danger)" : "var(--label-2)" }}>
            {s.failedLogins.length}
          </span>
        </Row>
        <Row last>
          <span className="body flex-1">Alle Geräte abmelden</span>
          <ActionButton
            destructive
            onClick={() =>
              setConfirm({
                title: "Alle Geräte abmelden?",
                text: "Jedes Familienmitglied muss sich danach mit dem Familienpasswort neu anmelden.",
                action: "Abmelden",
                destructive: true,
                run: async () => void (await act({ op: "sessions.logoutAll" }, "Alle anderen Geräte sind abgemeldet.")),
              })
            }
          >
            Abmelden
          </ActionButton>
        </Row>
      </Section>
    </>
  );
}

function PeopleTab({ s, act, setConfirm }: TabProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [newName, setNewName] = useState("");

  return (
    <>
      {s.people.map((p, idx) => (
        <section key={p.id} className="mt-6">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "0.5px solid var(--separator)" }}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full font-semibold text-white" style={{ background: p.color ?? "#8E8E93" }}>
                {p.name.slice(0, 1)}
              </span>
              {editing === p.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await act({ op: "person.rename", id: p.id, name }, "Name geändert.")) setEditing(null);
                  }}
                >
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="body glass min-w-0 flex-1 rounded-[10px] px-2.5 py-1.5"
                    autoFocus
                    maxLength={30}
                    aria-label="Neuer Name"
                  />
                  <ActionButton onClick={() => {}}>Sichern</ActionButton>
                </form>
              ) : (
                <>
                  <span className="headline flex-1">{p.name}</span>
                  <button
                    onClick={() => void act({ op: "person.move", id: p.id, dir: -1 })}
                    disabled={idx === 0}
                    className="p-1.5"
                    aria-label="Nach oben"
                    style={{ opacity: idx === 0 ? 0.25 : 1 }}
                  >
                    <IconChevron size={16} className="-rotate-90" />
                  </button>
                  <button
                    onClick={() => void act({ op: "person.move", id: p.id, dir: 1 })}
                    disabled={idx === s.people.length - 1}
                    className="p-1.5"
                    aria-label="Nach unten"
                    style={{ opacity: idx === s.people.length - 1 ? 0.25 : 1 }}
                  >
                    <IconChevron size={16} className="rotate-90" />
                  </button>
                </>
              )}
            </div>
            <Row
              onClick={() => {
                setEditing(p.id);
                setName(p.name);
              }}
            >
              <span className="body flex-1">Umbenennen</span>
              <IconChevron size={14} />
            </Row>
            <Row>
              <span className="body flex-1">Farbe</span>
              {p.color ? (
                <ActionButton onClick={() => void act({ op: "person.resetColor", id: p.id }, `${p.name} wählt beim nächsten Öffnen eine neue Farbe.`)}>Zurücksetzen</ActionButton>
              ) : (
                <span className="subhead" style={{ color: "var(--label-2)" }}>
                  noch nicht gewählt
                </span>
              )}
            </Row>
            <Row>
              <span className="body flex-1">Kalender-Abo</span>
              {p.calendarActive ? (
                <ActionButton
                  destructive
                  onClick={() =>
                    setConfirm({
                      title: `Abo-Link von ${p.name} sperren?`,
                      text: "Der bisherige Link funktioniert dann nicht mehr. Ein neuer entsteht, wenn die Person das Abo erneut einrichtet.",
                      action: "Sperren",
                      destructive: true,
                      run: async () => void (await act({ op: "calendar.revoke", personId: p.id }, "Abo-Link gesperrt.")),
                    })
                  }
                >
                  Link sperren
                </ActionButton>
              ) : (
                <span className="subhead" style={{ color: "var(--label-2)" }}>
                  nicht eingerichtet
                </span>
              )}
            </Row>
            {p.devices.map((d) => (
              <Row key={d.id}>
                <div className="min-w-0 flex-1">
                  <p className="body">{d.label}</p>
                  <p className="footnote" style={{ color: "var(--label-2)" }}>
                    Mitteilungen seit {fmt(d.createdAt, false)}, zuletzt zugestellt {ago(d.lastSuccess)}
                  </p>
                </div>
                <button
                  onClick={() => void act({ op: "device.delete", id: d.id }, "Gerät entfernt.")}
                  className="p-1.5"
                  aria-label="Gerät entfernen"
                  style={{ color: "var(--danger)" }}
                >
                  <IconTrash size={18} />
                </button>
              </Row>
            ))}
            <Row>
              <span className="body flex-1">{p.devices.length ? "Testnachricht an alle Geräte" : "Keine Geräte mit Mitteilungen"}</span>
              {p.devices.length > 0 && (
                <ActionButton onClick={() => void act({ op: "device.test", personId: p.id }, (r) => (r.delivered ? "Testnachricht verschickt." : "Kein Gerät erreicht."))}>
                  Senden
                </ActionButton>
              )}
            </Row>
            <Row last>
              <span className="body flex-1" style={{ color: "var(--danger)" }}>
                Person entfernen
              </span>
              <ActionButton
                destructive
                onClick={() =>
                  setConfirm({
                    title: `${p.name} entfernen?`,
                    text: "Die Person verschwindet aus allen Terminen, ihre Aufgaben bleiben ohne Zuständigkeit. Vorher wird automatisch gesichert.",
                    action: "Entfernen",
                    destructive: true,
                    typed: "ENTFERNEN",
                    run: async () => void (await act({ op: "person.delete", id: p.id }, `${p.name} wurde entfernt.`)),
                  })
                }
              >
                Entfernen
              </ActionButton>
            </Row>
          </Card>
        </section>
      ))}

      <Section title="Person hinzufügen">
        <form
          className="flex items-center gap-2 px-4 py-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (newName.trim() && (await act({ op: "person.add", name: newName }, `${newName.trim()} wurde hinzugefügt.`))) setNewName("");
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            maxLength={30}
            className="body min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--label-3)]"
            aria-label="Name der neuen Person"
          />
          <ActionButton onClick={() => {}} disabled={!newName.trim()}>
            Hinzufügen
          </ActionButton>
        </form>
      </Section>
    </>
  );
}

function DataTab({ s, act, setConfirm, say, reload }: TabProps & { say: (t: string, bad?: boolean) => void; reload: () => Promise<void> }) {
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    const text = await f.text();
    setConfirm({
      title: "Aus Datei wiederherstellen?",
      text: `Alle aktuellen Termine, Aufgaben und Einkäufe werden durch den Inhalt von „${f.name}“ ersetzt. Der jetzige Stand wird vorher gesichert.`,
      action: "Wiederherstellen",
      destructive: true,
      typed: "WIEDERHERSTELLEN",
      run: async () => {
        const res = await fetch("/api/owner/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
        const r = await res.json().catch(() => ({}));
        if (res.ok) say(`Wiederhergestellt: ${r.counts.events} Termine, ${r.counts.tasks} Aufgaben, ${r.counts.items} Einkäufe.`);
        else say(r.message ?? "Wiederherstellen fehlgeschlagen.", true);
        await reload();
      },
    });
  };

  return (
    <>
      <Section title="Sichern" hint="Automatisch wird einmal am Tag gesichert, die letzten 14 Tage bleiben erhalten. Abo-Links und Geräte sind bewusst nicht enthalten.">
        {/* Download einer Datei, keine Seite */}
        {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
        <Row onClick={() => window.location.assign("/api/owner/export")}>
          <span className="body flex-1">Jetzt als Datei herunterladen</span>
          <IconChevron size={14} />
        </Row>
        <Row last>
          <span className="body flex-1">Sicherung hier anlegen</span>
          <ActionButton onClick={() => void act({ op: "backup.create" }, "Sicherung angelegt.")}>Anlegen</ActionButton>
        </Row>
      </Section>

      <Section title="Wiederherstellen">
        <Row last onClick={() => file.current?.click()}>
          <span className="body flex-1">Aus Datei wiederherstellen</span>
          <IconChevron size={14} />
        </Row>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </Section>

      <Section title="Vorhandene Sicherungen">
        {s.backups.length === 0 && (
          <Row last>
            <span className="subhead" style={{ color: "var(--label-2)" }}>
              Noch keine Sicherung. Die erste automatische entsteht innerhalb der nächsten Minuten.
            </span>
          </Row>
        )}
        {s.backups.map((b, i) => (
          <Row key={b.id} last={i === s.backups.length - 1}>
            <div className="min-w-0 flex-1">
              <p className="body">{fmt(b.created_at)}</p>
              <p className="footnote" style={{ color: "var(--label-2)" }}>
                {backupKind[b.kind] ?? b.kind}, {kb(b.size_bytes)}
              </p>
            </div>
            <a href={`/api/owner/backup/${b.id}`} className="subhead px-1.5 font-semibold" style={{ color: "var(--tint)" }}>
              Laden
            </a>
            <ActionButton
              onClick={() =>
                setConfirm({
                  title: "Diese Sicherung wiederherstellen?",
                  text: `Der Stand vom ${fmt(b.created_at)} ersetzt alle aktuellen Daten. Der jetzige Stand wird vorher gesichert.`,
                  action: "Wiederherstellen",
                  destructive: true,
                  typed: "WIEDERHERSTELLEN",
                  run: async () => void (await act({ op: "backup.restore", id: b.id }, "Sicherung wiederhergestellt.")),
                })
              }
            >
              Zurück
            </ActionButton>
            {b.kind !== "auto" && (
              <button
                onClick={() => void act({ op: "backup.delete", id: b.id }, "Sicherung gelöscht.")}
                className="p-1"
                aria-label="Sicherung löschen"
                style={{ color: "var(--danger)" }}
              >
                <IconTrash size={17} />
              </button>
            )}
          </Row>
        ))}
      </Section>

      <Section title="Aufräumen">
        {(
          [
            ["cleanup.doneTasks", "Erledigte Aufgaben älter als 30 Tage", `${s.counts.done_tasks} erledigt insgesamt`],
            ["cleanup.doneItems", "Abgehakte Einkäufe entfernen", `${s.counts.done_items} im Wagen`],
            ["cleanup.oldEvents", "Einzeltermine älter als ein Jahr", "Serien bleiben erhalten"],
          ] as const
        ).map(([op, label, hint], i, a) => (
          <Row key={op} last={i === a.length - 1}>
            <div className="min-w-0 flex-1">
              <p className="body">{label}</p>
              <p className="footnote" style={{ color: "var(--label-2)" }}>
                {hint}
              </p>
            </div>
            <ActionButton
              destructive
              onClick={() =>
                setConfirm({
                  title: `${label}?`,
                  text: "Das lässt sich nur über eine Sicherung rückgängig machen.",
                  action: "Löschen",
                  destructive: true,
                  run: async () => void (await act({ op }, (r) => `${r.deleted ?? 0} Einträge gelöscht.`)),
                })
              }
            >
              Löschen
            </ActionButton>
          </Row>
        ))}
      </Section>
    </>
  );
}

function ListEditor({ title, items, onSave, hint }: { title: string; items: string[]; onSave: (xs: string[]) => Promise<boolean>; hint: string }) {
  const [list, setList] = useState(items);
  const [draft, setDraft] = useState("");
  const dirty = JSON.stringify(list) !== JSON.stringify(items);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const n = [...list];
    [n[i], n[j]] = [n[j], n[i]];
    setList(n);
  };
  return (
    <Section title={title} hint={hint}>
      {list.map((x, i) => (
        <Row key={`${x}-${i}`}>
          <input
            value={x}
            onChange={(e) => setList(list.map((y, k) => (k === i ? e.target.value : y)))}
            className="body min-w-0 flex-1 bg-transparent outline-none"
            maxLength={40}
            aria-label={`${title} ${i + 1}`}
          />
          <button onClick={() => move(i, -1)} className="p-1" aria-label="Nach oben" style={{ opacity: i === 0 ? 0.25 : 1 }}>
            <IconChevron size={15} className="-rotate-90" />
          </button>
          <button onClick={() => move(i, 1)} className="p-1" aria-label="Nach unten" style={{ opacity: i === list.length - 1 ? 0.25 : 1 }}>
            <IconChevron size={15} className="rotate-90" />
          </button>
          <button onClick={() => setList(list.filter((_, k) => k !== i))} className="p-1" aria-label="Entfernen" style={{ color: "var(--danger)" }}>
            <IconTrash size={17} />
          </button>
        </Row>
      ))}
      <form
        className="flex items-center gap-2 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) setList([...list, draft.trim()]);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Neuer Eintrag"
          maxLength={40}
          className="body min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--label-3)]"
          aria-label={`${title} hinzufügen`}
        />
        <ActionButton onClick={() => {}} disabled={!draft.trim()}>
          Dazu
        </ActionButton>
      </form>
      {dirty && (
        <div className="flex gap-2 px-4 pb-3">
          <button onClick={() => setList(items)} className="press subhead flex-1 rounded-[12px] py-2 font-semibold" style={{ background: "var(--fill)" }}>
            Verwerfen
          </button>
          <button
            onClick={() => void onSave(list.map((x) => x.trim()).filter(Boolean))}
            className="press subhead flex-1 rounded-[12px] py-2 font-semibold text-white"
            style={{ background: "var(--tint)" }}
          >
            Speichern
          </button>
        </div>
      )}
    </Section>
  );
}

function ListsTab({ s, act }: Omit<TabProps, "setConfirm">) {
  const key = JSON.stringify(s.lists);
  return (
    <div key={key}>
      <ListEditor
        title="Einkaufsabteilungen"
        items={s.lists.categories}
        hint="Reihenfolge wie im Laden. Artikel aus einer gelöschten Abteilung erscheinen unter „Vorrat“ bzw. der letzten Abteilung."
        onSave={(categories) => act({ op: "lists.set", categories, areas: s.lists.areas }, "Abteilungen gespeichert.")}
      />
      <ListEditor
        title="Aufgabenbereiche"
        items={s.lists.areas}
        hint="Bestehende Aufgaben behalten ihren Bereich, auch wenn er hier entfernt wird."
        onSave={(areas) => act({ op: "lists.set", categories: s.lists.categories, areas }, "Bereiche gespeichert.")}
      />
    </div>
  );
}

function LogTab({ s, act, setConfirm }: TabProps) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <Section title="Fehler">
        {s.errors.length === 0 && (
          <Row last>
            <span className="subhead" style={{ color: "var(--label-2)" }}>
              Keine Fehler aufgezeichnet.
            </span>
          </Row>
        )}
        {s.errors.map((e, i) => (
          <Row key={e.id} last={i === s.errors.length - 1} onClick={() => setOpen(open === e.id ? null : e.id)}>
            <div className="min-w-0 flex-1">
              <p className="footnote font-semibold" style={{ color: "var(--danger)" }}>
                {e.source}, {fmt(e.created_at)}
              </p>
              <p className="subhead break-words">{e.message}</p>
              {open === e.id && e.detail && (
                <p className="caption mt-1 break-words" style={{ color: "var(--label-2)" }}>
                  {e.detail}
                </p>
              )}
            </div>
          </Row>
        ))}
      </Section>
      {s.errors.length > 0 && (
        <div className="mt-3 flex justify-end">
          <ActionButton
            destructive
            onClick={() =>
              setConfirm({
                title: "Protokoll leeren?",
                text: "Alle aufgezeichneten Fehler werden gelöscht.",
                action: "Leeren",
                destructive: true,
                run: async () => void (await act({ op: "cleanup.errors" }, "Protokoll geleert.")),
              })
            }
          >
            Protokoll leeren
          </ActionButton>
        </div>
      )}

      <Section
        title="Fehlgeschlagene Anmeldungen, 7 Tage"
        hint="IP-Adressen sind gekürzt. Viele Versuche von einer fremden Adresse deuten auf jemanden hin, der das Passwort errät."
      >
        {s.failedLogins.length === 0 && (
          <Row last>
            <span className="subhead" style={{ color: "var(--label-2)" }}>
              Keine.
            </span>
          </Row>
        )}
        {s.failedLogins.map((f, i) => (
          <Row key={i} last={i === s.failedLogins.length - 1}>
            <span className="body flex-1 tabular">{f.ip}</span>
            <span className="footnote" style={{ color: "var(--label-2)" }}>
              {f.kind === "owner" ? "Verwaltung" : "Familie"}, {fmt(f.at)}
            </span>
          </Row>
        ))}
      </Section>
      {s.failedLogins.length > 0 && (
        <div className="mt-3 flex justify-end">
          <ActionButton onClick={() => void act({ op: "cleanup.logins" }, "Sperren aufgehoben.")}>Sperren aufheben</ActionButton>
        </div>
      )}
    </>
  );
}

function AiSection({ s, act }: Omit<TabProps, "setConfirm">) {
  const [limit, setLimit] = useState(String(s.ai.limitUsd).replace(".", ","));
  const used = s.ai.month.usd;
  const pct = s.ai.limitUsd > 0 ? Math.min(100, (used / s.ai.limitUsd) * 100) : 100;
  return (
    <Section
      title="KI für Rezepte und Vorschläge"
      hint={
        s.ai.configured
          ? `Modell ${s.ai.model}. Ist das Limit erreicht, sind die KI-Knöpfe bis zum Monatsende aus; alles andere funktioniert weiter.`
          : "Für KI-Funktionen wird in Vercel ein ANTHROPIC_API_KEY hinterlegt. Ohne Schlüssel funktionieren Rezepte, Import über strukturierte Daten und der Wochenplan trotzdem."
      }
    >
      <Row>
        <Dot ok={s.ai.configured} />
        <span className="body flex-1">Schlüssel</span>
        <span className="subhead" style={{ color: "var(--label-2)" }}>
          {s.ai.configured ? "eingerichtet" : "fehlt"}
        </span>
      </Row>
      <Row>
        <div className="min-w-0 flex-1">
          <p className="body">Diesen Monat</p>
          <p className="footnote tabular" style={{ color: "var(--label-2)" }}>
            {s.ai.month.calls} Anfragen, {(s.ai.month.input + s.ai.month.output).toLocaleString("de-DE")} Tokens
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--separator)" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--danger)" : "var(--tint)" }} />
          </div>
        </div>
        <span className="subhead tabular" style={{ color: "var(--label-2)" }}>
          {used.toLocaleString("de-DE", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 })}
        </span>
      </Row>
      <form
        className="flex items-center gap-3 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ op: "ai.setLimit", usd: Number(limit.replace(",", ".")) }, "Limit gespeichert.");
        }}
      >
        <span className="body flex-1">Monatslimit in US-Dollar</span>
        <input
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          inputMode="decimal"
          className="body glass tabular w-20 rounded-[10px] px-2.5 py-1.5 text-right"
          aria-label="Monatslimit in US-Dollar"
        />
        <ActionButton onClick={() => {}}>Sichern</ActionButton>
      </form>
    </Section>
  );
}
