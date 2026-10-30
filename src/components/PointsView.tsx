"use client";

import { toast } from "sonner";
import { useState } from "react";
import { useFamily } from "@/lib/client/family";
import type { Person, Reward, RewardClaim } from "@/lib/types";
import { Avatar, Card, Chips, ContextMenu, FieldLabel, SectionTitle, Sheet } from "./ui";

type Range = "week" | "month";

const SUGGESTIONS: { emoji: string; title: string; cost: number }[] = [
  { emoji: "📺", title: "30 Minuten extra Bildschirmzeit", cost: 10 },
  { emoji: "🍕", title: "Abendessen aussuchen", cost: 15 },
  { emoji: "🌙", title: "Eine Stunde länger aufbleiben", cost: 20 },
  { emoji: "🎬", title: "Filmabend aussuchen", cost: 25 },
  { emoji: "🧹", title: "Einen Dienst abgeben", cost: 30 },
];

const EMOJIS = ["🎁", "📺", "🍕", "🍦", "🎮", "🎬", "🌙", "⚽️", "🛍️", "🧹", "📚", "🎢"];

const pts = (n: number) => `${n} ${n === 1 ? "Punkt" : "Punkte"}`;

function rankList(people: Person[], score: Record<string, number>) {
  const sorted = [...people].sort((a, b) => (score[b.id] ?? 0) - (score[a.id] ?? 0) || a.name.localeCompare(b.name));
  let rank = 0;
  let last = -1;
  return sorted.map((p, i) => {
    const n = score[p.id] ?? 0;
    if (n !== last) rank = i + 1;
    last = n;
    return { p, n, rank };
  });
}

export function PointsView() {
  const { state, me, person, run } = useFamily();
  const [range, setRange] = useState<Range>("week");
  const [newOpen, setNewOpen] = useState(false);
  const [claimFor, setClaimFor] = useState<Reward | null>(null);
  const [manage, setManage] = useState<Reward | null>(null);
  const [editing, setEditing] = useState(false);
  const info = state?.points;
  const people = state?.people ?? [];
  if (!info || !me) return null;

  const ranked = rankList(people, info[range]);
  const anyPoints = ranked.some((r) => r.n > 0);
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const balance = info.balance[me.id] ?? 0;
  const pending = info.claims.filter((c) => c.status === "pending");
  const history = info.claims.filter((c) => c.status !== "pending").slice(0, 12);
  const isParent = me.isParent;
  const parents = people.filter((p) => p.isParent).map((p) => p.name);
  const canRemove = (r: Reward) => isParent || me.name === "Selim" || r.createdBy === me.id;
  const removable = info.rewards.some(canRemove);
  const inEdit = editing && removable;
  const remove = (r: Reward) => {
    void run({ op: "reward.delete", id: r.id });
    toast(`${r.title} entfernt`, { action: { label: "Rückgängig", onClick: () => void run({ op: "reward.create", title: r.title, emoji: r.emoji, cost: r.cost }) } });
  };

  return (
    <>
      <div className="mt-5">
        <Chips
          value={range}
          onChange={setRange}
          options={[
            { id: "week", label: "Diese Woche" },
            { id: "month", label: "Dieser Monat" },
          ]}
        />
      </div>

      <Card className="mt-4 overflow-hidden px-3 pt-5 pb-0">
        <Podium entries={podium} dim={!anyPoints} />
        {!anyPoints && (
          <p className="footnote pb-3 text-center" style={{ color: "var(--label-2)" }}>
            {range === "week" ? "Diese Woche" : "Diesen Monat"} hat noch niemand Punkte. Aufgaben abhaken bringt welche.
          </p>
        )}
      </Card>
      {rest.length > 0 && (
        <Card className="mt-3 overflow-hidden">
          {rest.map(({ p, n, rank }, i) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: i ? "0.5px solid var(--separator)" : undefined }}>
              <span className="subhead tabular w-5 text-center font-semibold" style={{ color: "var(--label-2)" }}>
                {rank}
              </span>
              <Avatar person={p} size={30} />
              <span className="body flex-1 truncate">{p.name}</span>
              <span className="subhead tabular font-semibold">{pts(n)}</span>
            </div>
          ))}
        </Card>
      )}

      <SectionTitle>Dein Punktekonto</SectionTitle>
      <Card className="flex items-center gap-4 p-4">
        <Avatar person={me} size={44} />
        <div className="min-w-0 flex-1">
          <p className="title-2 tabular">{pts(balance)}</p>
          <p className="footnote" style={{ color: "var(--label-2)" }}>
            zum Einlösen, {pts(info.week[me.id] ?? 0)} diese Woche verdient
          </p>
        </div>
      </Card>

      {pending.length > 0 && (
        <>
          <SectionTitle>Wartet auf Bestätigung</SectionTitle>
          <Card className="overflow-hidden">
            {pending.map((c, i) => (
              <PendingRow
                key={c.id}
                claim={c}
                first={i === 0}
                canDecide={isParent && c.personId !== me.id}
                who={person(c.personId)}
                onDecide={(approve) => void run({ op: "claim.decide", id: c.id, approve })}
              />
            ))}
          </Card>
          {!isParent && (
            <p className="caption mt-2 px-1" style={{ color: "var(--label-3)" }}>
              {parents.length ? `${parents.join(" oder ")} bestätigt` : "Ein Elternteil bestätigt"} die Einlösung. Bis dahin sind die Punkte reserviert.
            </p>
          )}
        </>
      )}

      <SectionTitle
        trailing={
          <span className="flex items-center gap-4">
            {removable && (
              <button onClick={() => setEditing((v) => !v)} className="subhead font-semibold" style={{ color: "var(--tint)" }} aria-pressed={inEdit}>
                {inEdit ? "Fertig" : "Bearbeiten"}
              </button>
            )}
            {!inEdit && (
              <button onClick={() => setNewOpen(true)} className="subhead font-semibold" style={{ color: "var(--tint)" }}>
                Neue
              </button>
            )}
          </span>
        }
      >
        Belohnungen
      </SectionTitle>
      {info.rewards.length === 0 ? (
        <Card className="p-4">
          <p className="subhead" style={{ color: "var(--label-2)" }}>
            Noch keine Belohnungen. Tippe einen Vorschlag an oder lege über „Neue“ eine eigene an.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                onClick={() => void run({ op: "reward.create", title: s.title, emoji: s.emoji, cost: s.cost })}
                className="press footnote rounded-full px-3 py-1.5 font-medium"
                style={{ background: "var(--fill)" }}
              >
                {s.emoji} {s.title} · {s.cost}
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {info.rewards.map((r, i) => {
            const enough = balance >= r.cost;
            return (
              <div
                key={r.id}
                className="row-press flex items-center gap-3 px-4 py-3"
                style={{ borderTop: i ? "0.5px solid var(--separator)" : undefined }}
                onContextMenu={(e) => {
                  if (!canRemove(r)) return;
                  e.preventDefault();
                  setManage(r);
                }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-xl" style={{ background: "var(--fill)" }}>
                  {r.emoji ?? "🎁"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="body truncate">{r.title}</p>
                  <p className="footnote tabular" style={{ color: "var(--label-2)" }}>
                    {pts(r.cost)}
                    {!enough && ` · noch ${r.cost - balance}`}
                  </p>
                </div>
                {inEdit ? (
                  canRemove(r) ? (
                    <button
                      onClick={() => remove(r)}
                      className="press subhead shrink-0 rounded-full px-3.5 py-1.5 font-semibold"
                      style={{ background: "color-mix(in oklab, var(--danger) 12%, transparent)", color: "var(--danger)" }}
                      aria-label={`${r.title} entfernen`}
                    >
                      Entfernen
                    </button>
                  ) : (
                    <span className="caption shrink-0" style={{ color: "var(--label-3)" }}>
                      nicht deine
                    </span>
                  )
                ) : (
                  <button
                    onClick={() => setClaimFor(r)}
                    disabled={!enough}
                    className="press subhead shrink-0 rounded-full px-3.5 py-1.5 font-semibold"
                    style={{
                      background: enough ? "var(--tint)" : "var(--fill)",
                      color: enough ? "white" : "var(--label-3)",
                    }}
                  >
                    Einlösen
                  </button>
                )}
              </div>
            );
          })}
        </Card>
      )}
      <p className="caption mt-2 px-1" style={{ color: "var(--label-3)" }}>
        Punkte gibt es beim Abhaken, für die Person, die zuständig war. Wie viele, steht in der Aufgabe. {removable ? "Über „Bearbeiten“ entfernst du Belohnungen." : ""}
      </p>

      {history.length > 0 && (
        <>
          <SectionTitle>Eingelöst</SectionTitle>
          <Card className="overflow-hidden">
            {history.map((c, i) => (
              <div
                key={c.id}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderTop: i ? "0.5px solid var(--separator)" : undefined, opacity: c.status === "declined" ? 0.55 : 1 }}
              >
                <Avatar person={person(c.personId)} size={26} />
                <span className="subhead min-w-0 flex-1 truncate">{c.title}</span>
                <span className="footnote shrink-0" style={{ color: c.status === "approved" ? "var(--success)" : "var(--label-2)" }}>
                  {c.status === "approved" ? `−${c.cost}` : "abgelehnt"}
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

      <ContextMenu
        open={!!claimFor}
        onClose={() => setClaimFor(null)}
        preview={
          claimFor && (
            <div>
              <p className="headline">
                {claimFor.emoji ?? "🎁"} {claimFor.title}
              </p>
              <p className="footnote mt-1" style={{ color: "var(--label-2)" }}>
                Kostet {pts(claimFor.cost)}. {isParent ? "Der andere Elternteil" : parents.length ? parents.join(" oder ") : "Ein Elternteil"} bestätigt.
              </p>
            </div>
          )
        }
        actions={[
          {
            label: "Einlösen",
            onSelect: () => {
              if (claimFor) void run({ op: "reward.claim", rewardId: claimFor.id });
            },
          },
        ]}
      />
      <ContextMenu
        open={!!manage}
        onClose={() => setManage(null)}
        preview={manage && <p className="headline">{manage.title}</p>}
        actions={[
          {
            label: "Belohnung entfernen",
            destructive: true,
            onSelect: () => {
              if (manage) remove(manage);
            },
          },
        ]}
      />
      <NewRewardSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}

function Podium({ entries, dim }: { entries: { p: Person; n: number; rank: number }[]; dim: boolean }) {
  // Reihenfolge auf dem Treppchen: Zweiter, Erster, Dritter
  const slots = [entries[1], entries[0], entries[2]];
  const heights = [62, 88, 44];
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="flex items-end justify-center gap-2" style={{ opacity: dim ? 0.55 : 1 }}>
      {slots.map((e, i) =>
        e ? (
          <div key={e.p.id} className="flex w-[30%] max-w-[110px] flex-col items-center">
            <Avatar person={e.p} size={i === 1 ? 56 : 44} ring={i === 1 && !dim} />
            <p className="subhead mt-1.5 max-w-full truncate font-semibold">{e.p.name}</p>
            <p className="footnote tabular mb-2" style={{ color: "var(--label-2)" }}>
              {pts(e.n)}
            </p>
            <div
              className="flex w-full items-start justify-center rounded-t-[12px] pt-2 text-2xl"
              style={{
                height: heights[i],
                background: `linear-gradient(180deg, color-mix(in oklab, ${e.p.color ?? "var(--tint)"} 55%, transparent), color-mix(in oklab, ${e.p.color ?? "var(--tint)"} 20%, transparent))`,
                transition: "height 400ms ease",
              }}
            >
              <span aria-label={`Platz ${e.rank}`}>{dim ? "" : (medal[e.rank - 1] ?? e.rank)}</span>
            </div>
          </div>
        ) : (
          <div key={i} className="w-[30%] max-w-[110px]" />
        ),
      )}
    </div>
  );
}

function PendingRow({
  claim,
  first,
  canDecide,
  who,
  onDecide,
}: {
  claim: RewardClaim;
  first: boolean;
  canDecide: boolean;
  who: Person | undefined;
  onDecide: (approve: boolean) => void;
}) {
  return (
    <div className="px-4 py-3" style={{ borderTop: first ? undefined : "0.5px solid var(--separator)" }}>
      <div className="flex items-center gap-3">
        <Avatar person={who} size={32} />
        <div className="min-w-0 flex-1">
          <p className="subhead truncate font-medium">{claim.title}</p>
          <p className="footnote" style={{ color: "var(--label-2)" }}>
            {who?.name} · {pts(claim.cost)}
          </p>
        </div>
        {!canDecide && (
          <span className="caption shrink-0" style={{ color: "var(--label-3)" }}>
            offen
          </span>
        )}
      </div>
      {canDecide && (
        <div className="mt-2.5 flex gap-2 pl-11">
          <button onClick={() => onDecide(false)} className="press subhead flex-1 rounded-full py-1.5 font-semibold" style={{ background: "var(--fill)" }}>
            Ablehnen
          </button>
          <button onClick={() => onDecide(true)} className="press subhead flex-1 rounded-full py-1.5 font-semibold text-white" style={{ background: "var(--success)" }}>
            Bestätigen
          </button>
        </div>
      )}
    </div>
  );
}

function NewRewardSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run } = useFamily();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🎁");
  const [cost, setCost] = useState("20");
  const [busy, setBusy] = useState(false);
  const n = Math.round(Number(cost));
  const valid = !!title.trim() && n >= 1 && n <= 1000;

  const save = async () => {
    if (!valid || busy) return;
    void run({ op: "reward.create", title: title.trim(), emoji, cost: n });
    setTitle("");
    setCost("20");
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Neue Belohnung"
      z={45}
      trailing={
        <button onClick={() => void save()} disabled={!valid || busy} className="body font-semibold" style={{ color: valid ? "var(--tint)" : "var(--label-3)" }}>
          Sichern
        </button>
      }
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Zum Beispiel: Pizza aussuchen"
        maxLength={60}
        className="body glass mt-3 w-full rounded-[14px] px-4 py-3"
        aria-label="Name der Belohnung"
      />
      <FieldLabel>Symbol</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEmoji(e)}
            className="press flex h-10 w-10 items-center justify-center rounded-[12px] text-xl"
            style={{ background: e === emoji ? "color-mix(in oklab, var(--tint) 22%, transparent)" : "var(--fill)" }}
            aria-pressed={e === emoji}
          >
            {e}
          </button>
        ))}
      </div>
      <FieldLabel>Kostet</FieldLabel>
      <Chips
        value={["5", "10", "20", "30", "50", "100"].includes(cost) ? cost : ""}
        onChange={setCost}
        options={["5", "10", "20", "30", "50", "100"].map((c) => ({ id: c, label: `${c} Punkte` }))}
      />
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={1000}
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        className="body glass tabular mt-3 w-32 rounded-[12px] px-3 py-2"
        aria-label="Punkte"
      />
    </Sheet>
  );
}
