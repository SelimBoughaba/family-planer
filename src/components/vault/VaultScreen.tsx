"use client";

import { haptic } from "@/lib/client/haptics";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { useFamily } from "@/lib/client/family";
import type { VaultGift, VaultMutation, VaultNote, VaultState } from "@/lib/types";
import { Avatar, Card, Segmented, Sheet } from "../ui";
import { NoteEditor, type NoteDraft } from "../board/NoteEditor";
import { HAND_FONT, InkSvg } from "../board/BoardItemView";
import { NOTE_COLORS } from "@/lib/client/ink";

type Phase = { kind: "checking" } | { kind: "pin"; configured: boolean } | { kind: "open"; data: VaultState };

const IDLE_MS = 10 * 60 * 1000;
const STATUS: { id: VaultGift["status"]; label: string; emoji: string }[] = [
  { id: "idee", label: "Idee", emoji: "💡" },
  { id: "gekauft", label: "Gekauft", emoji: "🛍️" },
  { id: "verpackt", label: "Verpackt", emoji: "🎁" },
];

/** Tresor: geheimer Bereich hinter einer sechsstelligen PIN */
export function VaultScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <AnimatePresence>{open && <Vault key="vault" onClose={onClose} />}</AnimatePresence>;
}

function lockNow() {
  void fetch("/api/vault/lock", { method: "POST", keepalive: true }).catch(() => {});
}

function Vault({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const reduce = useReducedMotion();

  const load = useCallback(async () => {
    const res = await fetch("/api/vault", { cache: "no-store" }).catch(() => null);
    if (!res) return toast.error("Keine Verbindung zum Tresor.");
    if (res.status === 403) {
      const b = await res.json().catch(() => ({}));
      return setPhase({ kind: "pin", configured: b.configured !== false });
    }
    if (res.status === 401) return window.location.reload();
    if (!res.ok) return toast.error("Der Tresor lässt sich gerade nicht öffnen.");
    setPhase({ kind: "open", data: await res.json() });
  }, []);

  useEffect(() => {
    // bewusst bei jedem Öffnen frisch fragen: offen ist nur, was der Server gerade erlaubt
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const close = useCallback(() => {
    lockNow();
    onClose();
  }, [onClose]);

  // App im Hintergrund oder zehn Minuten nichts getan: wieder zusperren
  useEffect(() => {
    let timer = setTimeout(close, IDLE_MS);
    const poke = () => {
      clearTimeout(timer);
      timer = setTimeout(close, IDLE_MS);
    };
    const hide = () => document.visibilityState === "hidden" && close();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pointerdown", poke);
    window.addEventListener("keydown", poke);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pointerdown", poke);
      window.removeEventListener("keydown", poke);
    };
  }, [close]);

  const send = async (m: VaultMutation) => {
    if (phase.kind !== "open") return false;
    // sofort anzeigen, der Server bestätigt danach mit dem echten Stand
    setPhase((p) => (p.kind === "open" ? { kind: "open", data: optimistic(p.data, m) } : p));
    const res = await fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) }).catch(() => null);
    if (!res) {
      toast.error("Keine Verbindung, nicht gespeichert.");
      return false;
    }
    if (res.status === 403) {
      toast("Der Tresor hat sich gesperrt. Bitte PIN erneut eingeben.");
      setPhase({ kind: "pin", configured: true });
      return false;
    }
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(b.message ? `Nicht gespeichert: ${b.message}.` : "Nicht gespeichert.");
      return false;
    }
    setPhase({ kind: "open", data: b });
    return true;
  };

  return (
    <motion.div
      className="fixed inset-0 z-[70]"
      style={{ background: "var(--bg)" }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.04, filter: "blur(6px)" }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, filter: "blur(4px)", transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
      transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
      role="dialog"
      aria-modal
      aria-label="Tresor"
    >
      {/* eigener Scrollbereich: Blätter darin richten sich am Tresor aus, nicht am gescrollten Inhalt */}
      <div className="absolute inset-0 overflow-y-auto overscroll-contain">
        {phase.kind === "checking" && <div className="min-h-dvh" />}
        {phase.kind === "pin" && <PinPad configured={phase.configured} onCancel={close} onUnlocked={() => void load()} />}
        {phase.kind === "open" && <VaultContent data={phase.data} send={send} onLock={close} />}
      </div>
    </motion.div>
  );
}

function optimistic(d: VaultState, m: VaultMutation): VaultState {
  switch (m.op) {
    case "gift.status":
      return { ...d, gifts: d.gifts.map((g) => (g.id === m.id ? { ...g, status: m.status } : g)) };
    case "gift.delete":
      return { ...d, gifts: d.gifts.filter((g) => g.id !== m.id) };
    case "gift.save": {
      const g: VaultGift = { id: m.id ?? `tmp-${d.gifts.length}`, title: m.title, forPerson: m.forPerson, price: m.price, link: m.link, note: m.note, status: m.status };
      return { ...d, gifts: m.id && d.gifts.some((x) => x.id === m.id) ? d.gifts.map((x) => (x.id === m.id ? g : x)) : [...d.gifts, g] };
    }
    case "note.delete":
      return { ...d, notes: d.notes.filter((n) => n.id !== m.id) };
    case "note.save": {
      const n: VaultNote = { id: m.id ?? `tmp-${d.notes.length}`, text: m.text, ink: m.ink, color: m.color, updatedAt: new Date().toISOString() };
      return { ...d, notes: m.id && d.notes.some((x) => x.id === m.id) ? d.notes.map((x) => (x.id === m.id ? n : x)) : [n, ...d.notes] };
    }
  }
}

// --- PIN ---------------------------------------------------------------------

function PinPad({ configured, onCancel, onUnlocked }: { configured: boolean; onCancel: () => void; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [scope, animate] = useAnimate();
  const reduce = useReducedMotion();

  const submit = async (value: string) => {
    setBusy(true);
    const res = await fetch("/api/vault/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: value }) }).catch(() => null);
    if (res?.ok) return onUnlocked();
    const b = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setWrong(true);
    haptic();
    if (!reduce && scope.current) void animate(scope.current, { x: [0, -14, 12, -8, 6, -2, 0] }, { duration: 0.42, ease: "easeOut" });
    setTimeout(() => {
      setPin("");
      setWrong(false);
    }, 450);
    if (!res) setMsg("Keine Verbindung.");
    else if (b.error === "wrong_pin") setMsg(b.remaining > 0 ? `Falsche PIN. Noch ${b.remaining} Versuche.` : "Falsche PIN. 15 Minuten Pause.");
    else if (b.error === "locked_device") setMsg("Zu viele Versuche. Bitte in 15 Minuten erneut.");
    else if (b.error === "locked_global") setMsg("Vorübergehend gesperrt. Bitte in einer Stunde erneut.");
    else if (b.error === "pin_missing") setMsg("Die PIN ist noch nicht eingerichtet.");
    else setMsg("Gerade nicht möglich.");
  };

  const press = (d: string) => {
    if (busy || wrong || pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setMsg(null);
    if (next.length === 6) void submit(next);
  };

  // Ziffern auch über die Tastatur (iPad mit Tastatur)
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pressRef.current(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center px-8 safe-top" style={{ paddingBottom: "calc(var(--safe-b) + 24px)" }}>
      <div className="flex w-full justify-start">
        <button onClick={onCancel} className="body py-2" style={{ color: "var(--tint)" }}>
          Abbrechen
        </button>
      </div>
      <div className="mt-6 flex h-14 w-14 items-center justify-center rounded-[18px] text-[28px] glass glass-strong" aria-hidden>
        🔒
      </div>
      <h1 className="title-2 mt-4">Tresor</h1>
      <p className="subhead mt-1 text-center" style={{ color: "var(--label-2)" }}>
        {configured ? "PIN eingeben" : "Die PIN ist noch nicht eingerichtet. Sie wird in Vercel als SECRET_PIN hinterlegt."}
      </p>
      <div ref={scope} className="mt-7 flex gap-4" aria-label={`${pin.length} von 6 Ziffern`} role="status">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className="h-3.5 w-3.5 rounded-full"
            style={{
              background: i < pin.length ? (wrong ? "var(--danger)" : "var(--label)") : "transparent",
              boxShadow: `inset 0 0 0 1.5px ${wrong ? "var(--danger)" : "var(--label-2)"}`,
              transform: i < pin.length ? "scale(1)" : "scale(0.9)",
              transition: "transform 140ms var(--ease-out), background-color 120ms ease",
            }}
          />
        ))}
      </div>
      <p className="footnote mt-4 h-5 text-center" style={{ color: "var(--danger)" }} aria-live="polite">
        {msg}
      </p>
      <div className="mt-auto grid w-full grid-cols-3 gap-x-6 gap-y-4 pt-6">
        {keys.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : k === "del" ? (
            <button
              key={i}
              onClick={() => setPin((p) => p.slice(0, -1))}
              className="body mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full"
              disabled={!configured || !pin.length}
              style={{ opacity: pin.length ? 1 : 0.35, transition: "opacity 150ms ease" }}
            >
              Löschen
            </button>
          ) : (
            <button
              key={i}
              onPointerDown={(e) => {
                // Antwort schon beim Aufsetzen, nicht erst beim Loslassen
                e.preventDefault();
                if (!configured) return;
                haptic();
                press(k);
              }}
              disabled={!configured}
              className="press glass mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full text-[32px] font-light tabular disabled:opacity-40"
              aria-label={k}
            >
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

// --- Inhalt ------------------------------------------------------------------

type GiftDraft = Omit<VaultGift, "id"> & { id?: string };

function VaultContent({ data, send, onLock }: { data: VaultState; send: (m: VaultMutation) => Promise<boolean>; onLock: () => void }) {
  const { state, person } = useFamily();
  const [tab, setTab] = useState<"geschenke" | "notizen">("geschenke");
  const [gift, setGift] = useState<GiftDraft | null>(null);
  const [note, setNote] = useState<{ item: VaultNote | null } | null>(null);
  const people = state?.people ?? [];

  const groups = [...people.map((p) => ({ id: p.id as string | null, name: p.name })), { id: null, name: "Ohne Person" }]
    .map((g) => ({ ...g, items: data.gifts.filter((x) => (x.forPerson ?? null) === g.id || (g.id === null && x.forPerson && !people.some((p) => p.id === x.forPerson))) }))
    .filter((g) => g.items.length);

  const cycle = (g: VaultGift) => {
    const next = STATUS[(STATUS.findIndex((s) => s.id === g.status) + 1) % STATUS.length].id;
    void send({ op: "gift.status", id: g.id, status: next });
  };

  const saveNote = async (d: NoteDraft) => {
    setNote(null);
    void send({ op: "note.save", id: note?.item?.id ?? crypto.randomUUID(), text: d.text, ink: d.ink, color: d.color });
  };

  return (
    <div className="mx-auto max-w-md px-4 safe-top" style={{ paddingBottom: "calc(var(--safe-b) + 40px)" }}>
      <header className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="footnote font-medium" style={{ color: "var(--label-2)" }}>
            Sperrt sich nach 10 Min. und beim App-Wechsel
          </p>
          <h1 className="large-title">Tresor</h1>
        </div>
        <button
          onClick={onLock}
          className="press glass glass-strong subhead flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 font-semibold whitespace-nowrap"
          style={{ color: "var(--tint)" }}
        >
          🔒 Sperren
        </button>
      </header>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: "geschenke", label: `Geschenkideen${data.gifts.length ? ` (${data.gifts.length})` : ""}` },
          { id: "notizen", label: `Notizen${data.notes.length ? ` (${data.notes.length})` : ""}` },
        ]}
      />

      {tab === "geschenke" ? (
        <>
          <button
            onClick={() => setGift({ title: "", forPerson: null, price: null, link: null, note: null, status: "idee" })}
            className="press glass glass-strong body mt-4 flex w-full items-center justify-center gap-2 rounded-[18px] py-3 font-semibold"
            style={{ color: "var(--tint)" }}
          >
            + Neue Idee
          </button>
          {groups.length === 0 && (
            <Card className="mt-4 p-5 text-center">
              <p className="text-[34px]" aria-hidden>
                🎁
              </p>
              <p className="headline mt-1">Noch keine Ideen</p>
              <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
                Ideen für Geburtstage und Weihnachten sammeln, mit Preis und Link. Tippe auf das Symbol, um sie als gekauft oder verpackt zu markieren.
              </p>
            </Card>
          )}
          {groups.map((g) => {
            const p = g.id ? person(g.id) : undefined;
            const open = g.items.filter((x) => x.status !== "verpackt").length;
            return (
              <section key={g.id ?? "none"}>
                <div className="mt-6 mb-2 flex items-center gap-2 px-1">
                  {p && <Avatar person={p} size={24} />}
                  <h2 className="headline flex-1">{g.name}</h2>
                  <span className="subhead" style={{ color: "var(--label-2)" }}>
                    {open ? `${open} offen` : "alles verpackt"}
                  </span>
                </div>
                <Card className="overflow-hidden">
                  {g.items.map((x, i) => {
                    const s = STATUS.find((y) => y.id === x.status)!;
                    return (
                      <div key={x.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? "0.5px solid var(--separator)" : "none" }}>
                        <button
                          onClick={() => cycle(x)}
                          className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-[20px]"
                          style={{ background: "var(--fill)" }}
                          aria-label={`Status ${s.label}, tippen für nächsten`}
                        >
                          {s.emoji}
                        </button>
                        <button onClick={() => setGift(x)} className="min-w-0 flex-1 text-left">
                          <p className="body truncate" style={{ color: x.status === "verpackt" ? "var(--label-2)" : "var(--label)" }}>
                            {x.title}
                          </p>
                          <p className="footnote truncate" style={{ color: "var(--label-2)" }}>
                            {[s.label, x.price, x.note].filter(Boolean).join(" · ")}
                          </p>
                        </button>
                        {x.link && (
                          <a href={x.link} target="_blank" rel="noreferrer" className="subhead shrink-0 font-semibold" style={{ color: "var(--tint)" }}>
                            Link
                          </a>
                        )}
                      </div>
                    );
                  })}
                </Card>
              </section>
            );
          })}
        </>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => setNote({ item: null })}
            className="press glass glass-strong flex aspect-square flex-col items-center justify-center gap-1 rounded-[18px]"
            style={{ color: "var(--tint)" }}
          >
            <span className="text-[30px] leading-none">+</span>
            <span className="subhead font-semibold">Neuer Zettel</span>
          </button>
          {data.notes.map((n, i) => (
            <button
              key={n.id}
              onClick={() => setNote({ item: n })}
              className="press relative aspect-square overflow-hidden rounded-[6px] p-3 text-left"
              style={{
                background: n.color ?? NOTE_COLORS[0],
                transform: `rotate(${[-1.5, 1, -0.5, 1.5][i % 4]}deg)`,
                boxShadow: "0 10px 18px -12px rgba(0,0,0,.5)",
                color: "#1c1c1e",
                fontFamily: HAND_FONT,
              }}
            >
              {n.ink?.length ? (
                <span className="pointer-events-none absolute inset-0">
                  <InkSvg ink={n.ink} width={180} height={180} />
                </span>
              ) : null}
              {n.text && <span className="relative line-clamp-6 text-[15px] leading-snug whitespace-pre-wrap">{n.text}</span>}
            </button>
          ))}
        </div>
      )}

      <GiftSheet
        draft={gift}
        onClose={() => setGift(null)}
        onSave={async (d) => {
          setGift(null);
          void send({ op: "gift.save", ...d, id: d.id ?? crypto.randomUUID() });
        }}
        onDelete={async (id) => {
          const g = data.gifts.find((x) => x.id === id);
          setGift(null);
          if (!(await send({ op: "gift.delete", id }))) return;
          if (g)
            toast(`${g.title} gelöscht`, {
              action: {
                label: "Rückgängig",
                onClick: () => void send({ op: "gift.save", title: g.title, forPerson: g.forPerson, price: g.price, link: g.link, note: g.note, status: g.status }),
              },
            });
        }}
      />
      {note && (
        <NoteEditor
          key={note.item?.id ?? "neu"}
          note={note.item ? { w: 180, color: note.item.color, text: note.item.text, ink: note.item.ink, expires: null } : null}
          expiry={false}
          deleteLabel="Zettel löschen"
          z={90}
          onClose={() => setNote(null)}
          onSave={(d) => void saveNote(d)}
          onDelete={
            note.item
              ? () => {
                  const id = note.item!.id;
                  setNote(null);
                  void send({ op: "note.delete", id });
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function GiftSheet({
  draft,
  onClose,
  onSave,
  onDelete,
}: {
  draft: GiftDraft | null;
  onClose: () => void;
  onSave: (d: GiftDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Sheet open={!!draft} onClose={onClose} title={draft?.id ? "Geschenkidee" : "Neue Idee"} z={85}>
      {draft && <GiftForm key={draft.id ?? "neu"} draft={draft} onSave={onSave} onDelete={onDelete} />}
    </Sheet>
  );
}

function GiftForm({ draft, onSave, onDelete }: { draft: GiftDraft; onSave: (d: GiftDraft) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const { state } = useFamily();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof GiftDraft>(k: K, v: GiftDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const field = "body glass mt-2 w-full rounded-[14px] px-4 py-3 outline-none";
  const label = "footnote mt-5 font-semibold";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.title.trim() || busy) return;
        setBusy(true);
        await onSave({ ...d, title: d.title.trim() });
        setBusy(false);
      }}
    >
      <input
        value={d.title}
        onChange={(e) => set("title", e.target.value)}
        placeholder="Was soll es sein?"
        maxLength={120}
        className={`${field} mt-3`}
        aria-label="Idee"
        autoFocus={!draft.id}
      />
      <p className={label} style={{ color: "var(--label-2)" }}>
        Für wen?
      </p>
      <div className="no-scrollbar -mx-4 mt-2 flex gap-3 overflow-x-auto px-4">
        {(state?.people ?? []).map((p) => {
          const on = d.forPerson === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => set("forPerson", on ? null : p.id)}
              className="press flex shrink-0 flex-col items-center gap-1"
              aria-pressed={on}
              style={{ opacity: on ? 1 : 0.4, transition: "opacity 160ms ease" }}
            >
              <Avatar person={p} size={40} />
              <span className="caption">{p.name}</span>
            </button>
          );
        })}
      </div>
      <p className={label} style={{ color: "var(--label-2)" }}>
        Stand
      </p>
      <div className="mt-2">
        <Segmented value={d.status} onChange={(v) => set("status", v)} options={STATUS.map((s) => ({ id: s.id, label: `${s.emoji} ${s.label}` }))} />
      </div>
      <div className="flex gap-3">
        <label className="flex-1">
          <span className={`${label} block`} style={{ color: "var(--label-2)" }}>
            Preis
          </span>
          <input value={d.price ?? ""} onChange={(e) => set("price", e.target.value || null)} placeholder="z. B. 35 €" maxLength={30} className={field} inputMode="decimal" />
        </label>
      </div>
      <label className="block">
        <span className={`${label} block`} style={{ color: "var(--label-2)" }}>
          Link
        </span>
        <input
          value={d.link ?? ""}
          onChange={(e) => set("link", e.target.value || null)}
          placeholder="https://"
          maxLength={500}
          className={field}
          inputMode="url"
          autoCapitalize="off"
        />
      </label>
      <label className="block">
        <span className={`${label} block`} style={{ color: "var(--label-2)" }}>
          Notiz
        </span>
        <input value={d.note ?? ""} onChange={(e) => set("note", e.target.value || null)} placeholder="Größe, Farbe, wo versteckt …" maxLength={500} className={field} />
      </label>
      <button
        type="submit"
        disabled={!d.title.trim() || busy}
        className="press body mt-6 w-full rounded-[14px] py-3 font-semibold text-white"
        style={{ background: d.title.trim() ? "var(--tint)" : "var(--label-3)", transition: "background-color 160ms ease" }}
      >
        {draft.id ? "Sichern" : "Hinzufügen"}
      </button>
      {draft.id && (
        <button
          type="button"
          onClick={() => (confirm ? void onDelete(draft.id!) : setConfirm(true))}
          className="press body mt-3 w-full rounded-[14px] py-3 font-semibold"
          style={{ background: "color-mix(in oklab, var(--danger) 10%, transparent)", color: "var(--danger)" }}
        >
          {confirm ? "Wirklich löschen?" : "Idee löschen"}
        </button>
      )}
    </form>
  );
}
