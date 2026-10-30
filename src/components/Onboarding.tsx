"use client";

import { useState } from "react";
import { useFamily } from "@/lib/client/family";
import { personColors, FALLBACK_COLOR, type Person } from "@/lib/types";
import { Ambient, Avatar, Card } from "./ui";
import { IconCheck } from "./icons";

/** Wer bist du? Einmal pro Gerät */
export function PersonPicker() {
  const { state, setMe } = useFamily();
  const people = state?.people ?? [];
  return (
    <main className="relative isolate flex min-h-dvh flex-col justify-center px-5 py-10">
      <Ambient
        colors={
          people
            .map((p) => p.color)
            .filter(Boolean)
            .slice(0, 3) as string[]
        }
      />
      <div className="mx-auto w-full max-w-sm">
        <h1 className="large-title">Wer bist du?</h1>
        <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
          Wird auf diesem Gerät gemerkt. Wechseln kannst du jederzeit über dein Profilbild.
        </p>
        <Card className="mt-6 overflow-hidden">
          {people.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setMe(p.id)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-black/5"
              style={{ borderTop: i ? "0.5px solid var(--separator)" : "none" }}
            >
              <Avatar person={p} size={40} />
              <span className="headline flex-1">{p.name}</span>
            </button>
          ))}
        </Card>
      </div>
    </main>
  );
}

/** Beim ersten Login eigene Farbe wählen */
export function ColorPicker({ me }: { me: Person }) {
  const { state, run } = useFamily();
  const [pick, setPick] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const taken = new Map((state?.people ?? []).filter((p) => p.color && p.id !== me.id).map((p) => [p.color!, p.name]));
  const preview = { ...me, color: pick };

  return (
    <main className="relative isolate flex min-h-dvh flex-col justify-center px-5 py-10">
      <Ambient colors={[pick ?? FALLBACK_COLOR]} />
      <div className="mx-auto w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Avatar person={preview} size={88} />
          <h1 className="large-title mt-4">Hallo {me.name}</h1>
          <p className="subhead mt-1" style={{ color: "var(--label-2)" }}>
            Such dir deine Farbe aus. Damit erkennt jeder deine Termine und Aufgaben auf einen Blick.
          </p>
        </div>
        <Card className="mt-7 grid grid-cols-5 gap-4 p-5">
          {personColors.map((c) => {
            const owner = taken.get(c);
            return (
              <button
                key={c}
                disabled={!!owner}
                onClick={() => setPick(c)}
                className="press relative flex aspect-square items-center justify-center rounded-full text-white"
                style={{
                  background: c,
                  opacity: owner ? 0.28 : 1,
                  boxShadow: pick === c ? `0 0 0 3px var(--bg), 0 0 0 5.5px ${c}` : "inset 0 1px 0 rgba(255,255,255,.35)",
                  transition: "box-shadow 180ms ease",
                }}
                aria-label={owner ? `Vergeben an ${owner}` : "Farbe wählen"}
                aria-pressed={pick === c}
              >
                {pick === c && <IconCheck size={18} className="check-pop" />}
                {owner && <span className="caption font-semibold">{owner.slice(0, 1)}</span>}
              </button>
            );
          })}
        </Card>
        <button
          disabled={!pick || saving}
          onClick={async () => {
            if (!pick) return;
            setSaving(true);
            await run({ op: "person.setColor", id: me.id, color: pick });
            setSaving(false);
          }}
          className="press headline mt-6 w-full rounded-[16px] py-3.5 text-white"
          style={{ background: pick ?? "var(--label-3)", transition: "background 250ms ease" }}
        >
          {saving ? "Wird gespeichert" : "Farbe übernehmen"}
        </button>
      </div>
    </main>
  );
}
