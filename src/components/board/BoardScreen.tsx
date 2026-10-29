"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFamily } from "@/lib/client/family";
import { addPoint, hitsStroke, INK_COLORS, INK_SIZES, strokePath } from "@/lib/client/ink";
import { fileUrl, prepareFile, uploadFile } from "@/lib/client/upload";
import { pdfThumbnail } from "@/lib/client/pdf-thumb";
import type { BoardItem, BoardItemPatch, Stroke } from "@/lib/types";
import { ContextMenu, Sheet, type MenuAction } from "../ui";
import { BoardItemView } from "./BoardItemView";
import { NoteEditor, type NoteDraft } from "./NoteEditor";

type Mode = "hand" | "pen" | "eraser";
type View = { x: number; y: number; k: number };
type Pt = { x: number; y: number; type: string };

type Action =
  | { kind: "pan"; sx: number; sy: number; view: View; moved: boolean }
  | { kind: "item"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean; timer: ReturnType<typeof setTimeout> | null; longPressed: boolean }
  | { kind: "draw"; pointer: number; stroke: Stroke; ax: number; ay: number; pen: boolean }
  | { kind: "erase"; pointer: number }
  | { kind: "pinch"; dist: number; mid: { x: number; y: number }; view: View };

const MIN_K = 0.2;
const MAX_K = 3;
const uuid = () => crypto.randomUUID();
const rnd = (a: number) => Math.round((Math.random() * 2 - 1) * a * 10) / 10;

/** Pinnwand als großes Korkbrett: verschieben und zoomen, Zettel, Fotos, PDFs und freie Zeichnungen */
export function BoardScreen({ boardId, onClose }: { boardId: string | null; onClose: () => void }) {
  if (!boardId) return null;
  return <Board initial={boardId} onClose={onClose} />;
}

function Board({ initial, onClose }: { initial: string; onClose: () => void }) {
  const { state, run, tick } = useFamily();
  const [boardId, setBoardId] = useState(initial);
  const board = state?.boards.find((b) => b.id === boardId) ?? state?.boards[0] ?? null;
  const [items, setItems] = useState<BoardItem[]>([]);
  const [trash, setTrash] = useState<BoardItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setModeState] = useState<Mode>("hand");
  const [penColor, setPenColor] = useState(INK_COLORS[0]);
  const [penSize, setPenSize] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<BoardItem | null>(null);
  const [colorFor, setColorFor] = useState<BoardItem | null>(null);
  const [note, setNote] = useState<{ item: BoardItem | null } | null>(null);
  const [viewer, setViewer] = useState<BoardItem | null>(null);
  const [boardMenu, setBoardMenu] = useState(false);
  const [nameSheet, setNameSheet] = useState<{ mode: "new" | "rename"; value: string } | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmBoardDelete, setConfirmBoardDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const livePath = useRef<SVGPathElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 0.7 });
  const pointers = useRef(new Map<number, Pt>());
  const action = useRef<Action | null>(null);
  const penSeen = useRef(false);
  const session = useRef<string | null>(null); // freie Zeichnung, an die neue Striche angehängt werden
  const inkSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const erased = useRef(new Set<string>());
  const creating = useRef(new Map<string, Promise<boolean>>());
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const applyView = () => {
    const v = view.current;
    if (world.current) world.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  };

  // Inhalt laden; bei Änderungen von anderen Geräten nachladen, aber nicht mitten in einer Geste
  const load = useCallback(async () => {
    // nicht mitten in einer Geste oder solange eine Zeichnung noch gespeichert wird
    if (action.current || inkSave.current) return;
    const res = await fetch(`/api/board?id=${boardId}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as { items: BoardItem[]; trash: BoardItem[] };
    setItems(d.items);
    setTrash(d.trash);
    setLoaded(true);
  }, [boardId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, tick]);

  // beim ersten Laden alles in den Blick nehmen
  const fitted = useRef<string | null>(null);
  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    const list = itemsRef.current;
    const r = el.getBoundingClientRect();
    if (!list.length) {
      view.current = { x: r.width / 2 - 450 * 0.7, y: r.height / 2 - 300 * 0.7, k: 0.7 };
    } else {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const i of list) {
        const w = i.kind === "ink" ? 60 : i.w;
        const h = i.kind === "ink" ? 60 : i.h;
        x0 = Math.min(x0, i.x);
        y0 = Math.min(y0, i.y);
        x1 = Math.max(x1, i.x + w);
        y1 = Math.max(y1, i.y + h);
      }
      const k = Math.min(1.1, Math.max(MIN_K, Math.min((r.width - 40) / (x1 - x0 + 80), (r.height - 200) / (y1 - y0 + 80))));
      view.current = { k, x: r.width / 2 - ((x0 + x1) / 2) * k, y: (r.height - 60) / 2 - ((y0 + y1) / 2) * k };
    }
    applyView();
  }, []);
  useEffect(() => {
    if (loaded && fitted.current !== boardId) {
      fitted.current = boardId;
      fit();
    }
  }, [loaded, boardId, fit]);

  const setMode = (m: Mode) => {
    session.current = null;
    setSelected(null);
    setModeState(m);
  };

  const toWorld = (cx: number, cy: number) => {
    const r = viewport.current!.getBoundingClientRect();
    const v = view.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };
  const center = () => {
    const r = viewport.current!.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2 - 40);
  };

  /** Freien Platz nahe der Bildschirmmitte suchen, damit Neues nicht genau auf Altem landet */
  const freeSpot = (w: number, h: number) => {
    const c = center();
    const boxes = itemsRef.current.filter((i) => i.kind !== "ink").map((i) => ({ x0: i.x - 14, y0: i.y - 14, x1: i.x + i.w + 14, y1: i.y + i.h + 14 }));
    const fits = (x: number, y: number) => !boxes.some((b) => x < b.x1 && x + w > b.x0 && y < b.y1 && y + h > b.y0);
    for (let r = 0; r <= 900; r += 40) {
      const steps = Math.max(1, Math.round((2 * Math.PI * r) / 60));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * 2 * Math.PI;
        const x = Math.round(c.x - w / 2 + r * Math.cos(a));
        const y = Math.round(c.y - h / 2 + r * Math.sin(a));
        if (fits(x, y)) return { x, y };
      }
    }
    return { x: Math.round(c.x - w / 2 + rnd(40)), y: Math.round(c.y - h / 2 + rnd(40)) };
  };

  const patchLocal = (id: string, patch: Partial<BoardItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const update = (id: string, patch: BoardItemPatch) => {
    patchLocal(id, patch);
    void run({ op: "bitem.update", id, patch });
  };
  const topZ = () => Math.max(0, ...itemsRef.current.map((i) => i.z)) + 1;

  const remove = (it: BoardItem) => {
    setItems((l) => l.filter((i) => i.id !== it.id));
    setTrash((t) => [{ ...it, deletedAt: new Date().toISOString() }, ...t]);
    void run({ op: "bitem.delete", id: it.id });
  };

  // ---------- Zeichnen ----------
  const saveInk = (id: string) => {
    if (inkSave.current) clearTimeout(inkSave.current);
    inkSave.current = setTimeout(async () => {
      // erst speichern, wenn das Anlegen der Zeichnung durch ist
      await creating.current.get(id);
      inkSave.current = null;
      const it = itemsRef.current.find((i) => i.id === id);
      if (it) void run({ op: "bitem.update", id, patch: { ink: it.ink } });
    }, 500);
  };

  const finishStroke = (a: Extract<Action, { kind: "draw" }>) => {
    if (livePath.current) livePath.current.setAttribute("d", "");
    if (a.stroke.p.length < 3) return;
    const sid = session.current;
    const existing = sid ? itemsRef.current.find((i) => i.id === sid) : null;
    if (existing) {
      // Punkte relativ zum Anker der laufenden Zeichnung
      const s = { ...a.stroke, p: a.stroke.p.map((v, i) => (i % 3 === 0 ? v + a.ax - existing.x : i % 3 === 1 ? v + a.ay - existing.y : v)) };
      const ink = [...(existing.ink ?? []), s];
      patchLocal(existing.id, { ink });
      itemsRef.current = itemsRef.current.map((i) => (i.id === existing.id ? { ...i, ink } : i));
      saveInk(existing.id);
    } else {
      const id = uuid();
      session.current = id;
      const it: BoardItem = { id, boardId, kind: "ink", x: a.ax, y: a.ay, w: 1, h: 1, rot: 0, z: topZ(), color: null, text: null, ink: [a.stroke], file: null, thumb: null, fileName: null, expires: null, createdBy: null, updatedAt: new Date().toISOString(), deletedAt: null };
      setItems((l) => [...l, it]);
      itemsRef.current = [...itemsRef.current, it];
      creating.current.set(id, run({ op: "bitem.create", id, boardId, kind: "ink", x: a.ax, y: a.ay, w: 1, h: 1, ink: [a.stroke] }));
    }
  };

  const eraseAt = (cx: number, cy: number) => {
    const p = toWorld(cx, cy);
    const r = 10 / view.current.k;
    let changed = false;
    const next = itemsRef.current.map((it) => {
      if (it.kind !== "ink" || !it.ink) return it;
      const keep = it.ink.filter((s) => !hitsStroke(s, p.x - it.x, p.y - it.y, r));
      if (keep.length === it.ink.length) return it;
      changed = true;
      erased.current.add(it.id);
      return { ...it, ink: keep };
    });
    if (changed) {
      itemsRef.current = next;
      setItems(next);
    }
  };
  const commitErase = () => {
    for (const id of erased.current) {
      const it = itemsRef.current.find((i) => i.id === id);
      if (!it) continue;
      if (!it.ink?.length) {
        setItems((l) => l.filter((i) => i.id !== id));
        void run({ op: "bitem.purge", id });
      } else void run({ op: "bitem.update", id, patch: { ink: it.ink } });
    }
    erased.current.clear();
  };

  // ---------- Gesten ----------
  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const cur = action.current;
    if (cur?.kind === "draw" && livePath.current) livePath.current.setAttribute("d", "");
    if (cur?.kind === "item" && cur.timer) clearTimeout(cur.timer);
    action.current = { kind: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...view.current } };
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    viewport.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === "pen") penSeen.current = true;
    const cur = action.current;
    // Während der Stift schreibt, zählen Handballen und Finger nicht
    if (cur && (cur.kind === "draw" || cur.kind === "erase") && e.pointerType !== "pen" && penSeen.current) return;
    const touches = [...pointers.current.values()].filter((p) => p.type !== "pen");
    // zwei Finger: zoomen und verschieben (auch wenn ein Finger gerade gezeichnet hat)
    if (touches.length === 2) return startPinch();
    if (pointers.current.size > 1) return;
    // Stift-Modus mit Apple Pencil: einzelne Berührungen der Hand bewegen nichts
    if (mode !== "hand" && penSeen.current && e.pointerType !== "pen") return;

    const drawing = mode !== "hand" && (e.pointerType === "pen" || !penSeen.current);
    if (drawing && mode === "pen") {
      const w = toWorld(e.clientX, e.clientY);
      const stroke: Stroke = { c: penColor, s: INK_SIZES[penSize], p: [] };
      addPoint(stroke.p, 0, 0, e.pointerType === "pen" ? e.pressure || 0.5 : 0.5);
      action.current = { kind: "draw", pointer: e.pointerId, stroke, ax: w.x, ay: w.y, pen: e.pointerType === "pen" };
      return;
    }
    if (drawing && mode === "eraser") {
      action.current = { kind: "erase", pointer: e.pointerId };
      eraseAt(e.clientX, e.clientY);
      return;
    }
    const id = mode === "hand" ? ((e.target as Element).closest?.("[data-item]") as HTMLElement | null)?.dataset.item : undefined;
    const it = id ? itemsRef.current.find((i) => i.id === id) : null;
    if (it) {
      const a: Action = { kind: "item", id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, moved: false, timer: null, longPressed: false };
      a.timer = setTimeout(() => {
        if (action.current !== a || a.moved) return;
        a.longPressed = true;
        setSelected(it.id);
        setMenu(itemsRef.current.find((i) => i.id === it.id) ?? null);
      }, 480);
      action.current = a;
      return;
    }
    action.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view: { ...view.current }, moved: false };
  };

  const onMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const a = action.current;
    if (!a) return;
    if (a.kind === "pinch") {
      const touches = [...pointers.current.values()].filter((q) => q.type !== "pen");
      if (touches.length < 2) return;
      const [t1, t2] = touches;
      const dist = Math.hypot(t1.x - t2.x, t1.y - t2.y);
      const mid = { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 };
      const r = viewport.current!.getBoundingClientRect();
      const k = Math.min(MAX_K, Math.max(MIN_K, (a.view.k * dist) / a.dist));
      // Punkt unter den Fingern bleibt stehen, dazu mitwandern
      const wx = (a.mid.x - r.left - a.view.x) / a.view.k;
      const wy = (a.mid.y - r.top - a.view.y) / a.view.k;
      view.current = { k, x: mid.x - r.left - wx * k, y: mid.y - r.top - wy * k };
      applyView();
      return;
    }
    if (a.kind === "pan") {
      const dx = e.clientX - a.sx;
      const dy = e.clientY - a.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) a.moved = true;
      view.current = { ...a.view, x: a.view.x + dx, y: a.view.y + dy };
      applyView();
      return;
    }
    if (a.kind === "item") {
      const dx = (e.clientX - a.sx) / view.current.k;
      const dy = (e.clientY - a.sy) / view.current.k;
      if (!a.moved && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) > 6) {
        a.moved = true;
        if (a.timer) clearTimeout(a.timer);
        setSelected(a.id);
        patchLocal(a.id, { z: topZ() });
      }
      if (a.moved) patchLocal(a.id, { x: Math.round(a.ox + dx), y: Math.round(a.oy + dy) });
      return;
    }
    if (a.kind === "draw" && a.pointer === e.pointerId) {
      const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
      for (const ev of events.length ? events : [e.nativeEvent]) {
        const w = toWorld(ev.clientX, ev.clientY);
        addPoint(a.stroke.p, w.x - a.ax, w.y - a.ay, ev.pointerType === "pen" ? ev.pressure || 0.5 : 0.5, 0.9 / view.current.k);
      }
      if (livePath.current) {
        livePath.current.setAttribute("d", strokePath(a.stroke, e.pointerType === "pen"));
        livePath.current.setAttribute("transform", `translate(${a.ax} ${a.ay})`);
      }
      return;
    }
    if (a.kind === "erase" && a.pointer === e.pointerId) eraseAt(e.clientX, e.clientY);
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const a = action.current;
    if (!a) return;
    if (a.kind === "pinch") {
      if (pointers.current.size === 0) action.current = null;
      return;
    }
    action.current = null;
    if (a.kind === "draw") {
      if (e.type === "pointercancel") livePath.current?.setAttribute("d", "");
      else finishStroke(a);
      return;
    }
    if (a.kind === "erase") return commitErase();
    if (a.kind === "pan") {
      if (!a.moved) setSelected(null);
      return;
    }
    if (a.kind === "item") {
      if (a.timer) clearTimeout(a.timer);
      const it = itemsRef.current.find((i) => i.id === a.id);
      if (!it) return;
      if (a.moved) {
        setSelected(null);
        void run({ op: "bitem.update", id: it.id, patch: { x: it.x, y: it.y, z: it.z } });
        return;
      }
      if (a.longPressed || e.type === "pointercancel") return;
      // Antippen öffnet
      if (it.kind === "note") setNote({ item: it });
      else if (it.kind === "photo") setViewer(it);
      else if (it.kind === "pdf" && it.file) window.open(fileUrl(it.file), "_blank");
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = viewport.current!.getBoundingClientRect();
    const v = view.current;
    if (e.ctrlKey || e.metaKey) {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * Math.exp(-e.deltaY / 300)));
      const wx = (e.clientX - r.left - v.x) / v.k;
      const wy = (e.clientY - r.top - v.y) / v.k;
      view.current = { k, x: e.clientX - r.left - wx * k, y: e.clientY - r.top - wy * k };
    } else view.current = { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
    applyView();
  };

  // Safari: Seiten-Zoom auf der Fläche unterbinden
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener("gesturestart", stop);
    el.addEventListener("gesturechange", stop);
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("gesturestart", stop);
      el.removeEventListener("gesturechange", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, []);

  // ---------- Neue Elemente ----------
  const saveNote = (d: NoteDraft) => {
    const target = note?.item;
    setNote(null);
    if (target) {
      update(target.id, { text: d.text, ink: d.ink, color: d.color, expires: d.expires });
      return;
    }
    const spot = freeSpot(180, 180);
    const id = uuid();
    const it: BoardItem = { id, boardId, kind: "note", x: spot.x, y: spot.y, w: 180, h: 180, rot: rnd(4), z: topZ(), color: d.color, text: d.text, ink: d.ink, file: null, thumb: null, fileName: null, expires: d.expires, createdBy: null, updatedAt: new Date().toISOString(), deletedAt: null };
    setItems((l) => [...l, it]);
    itemsRef.current = [...itemsRef.current, it];
    void run({ op: "bitem.create", id, boardId, kind: "note", x: it.x, y: it.y, w: 180, h: 180, rot: it.rot, color: d.color, text: d.text, ink: d.ink, expires: d.expires });
  };

  const addFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, 8);
    if (!list.length) return;
    setMessage(null);
    let n = 0;
    for (const f of list) {
      n++;
      setBusy(list.length > 1 ? `Lädt hoch, ${n} von ${list.length}` : "Lädt hoch");
      try {
        const id = uuid();
        if (f.type === "application/pdf") {
          const thumb = await pdfThumbnail(f);
          const file = await uploadFile(f, "board");
          const thumbPath = thumb ? await uploadFile(thumb.blob, "board") : null;
          const w = 200;
          const h = Math.round((w - 16) * (thumb?.ratio ?? 1.41) + 34);
          const spot = freeSpot(w, h);
          const it: BoardItem = { id, boardId, kind: "pdf", x: spot.x, y: spot.y, w, h, rot: rnd(3), z: topZ(), color: null, text: null, ink: null, file, thumb: thumbPath, fileName: f.name.slice(0, 120), expires: null, createdBy: null, updatedAt: new Date().toISOString(), deletedAt: null };
          setItems((l) => [...l, it]);
          itemsRef.current = [...itemsRef.current, it];
          await run({ op: "bitem.create", id, boardId, kind: "pdf", x: it.x, y: it.y, w, h, rot: it.rot, file, thumb: thumbPath, fileName: it.fileName });
        } else {
          const blob = await prepareFile(f);
          const bmp = await createImageBitmap(blob);
          const ratio = bmp.height / bmp.width;
          bmp.close();
          const file = await uploadFile(blob, "board");
          const w = 230;
          const h = Math.round((w - 16) * ratio + 34);
          const spot = freeSpot(w, h);
          const it: BoardItem = { id, boardId, kind: "photo", x: spot.x, y: spot.y, w, h, rot: rnd(5), z: topZ(), color: null, text: null, ink: null, file, thumb: null, fileName: null, expires: null, createdBy: null, updatedAt: new Date().toISOString(), deletedAt: null };
          setItems((l) => [...l, it]);
          itemsRef.current = [...itemsRef.current, it];
          await run({ op: "bitem.create", id, boardId, kind: "photo", x: it.x, y: it.y, w, h, rot: it.rot, file });
        }
      } catch (err) {
        setMessage((err as Error).message);
      }
    }
    setBusy(null);
  };

  // ---------- Menüs ----------
  const frontZ = Math.max(0, ...items.map((i) => i.z)) + 1;
  const scaleItem = (it: BoardItem, f: number) => update(it.id, { w: Math.round(Math.min(900, Math.max(80, it.w * f))), h: Math.round(Math.min(1200, Math.max(80, it.h * f))) });
  const itemActions = (it: BoardItem): MenuAction[] => [
    ...(it.kind === "note" ? [{ label: "Bearbeiten", onSelect: () => setTimeout(() => setNote({ item: it }), 50) }] : []),
    ...(it.kind === "photo" ? [{ label: "Groß ansehen", onSelect: () => setTimeout(() => setViewer(it), 50) }] : []),
    ...(it.kind === "pdf" && it.file ? [{ label: "PDF öffnen", onSelect: () => window.open(fileUrl(it.file!), "_blank") }] : []),
    { label: "Nach vorne", onSelect: () => update(it.id, { z: frontZ }) },
    ...(it.kind !== "ink" ? [{ label: "Größer", onSelect: () => scaleItem(it, 1.25) }, { label: "Kleiner", onSelect: () => scaleItem(it, 0.8) }] : []),
    ...(it.kind !== "ink" ? [{ label: it.rot ? "Gerade hängen" : "Schräg hängen", onSelect: () => update(it.id, { rot: it.rot ? 0 : rnd(5) || 3 }) }] : []),
    ...(it.kind === "note" ? [{ label: "Farbe", onSelect: () => setTimeout(() => setColorFor(it), 50) }] : []),
    { label: "In den Papierkorb", destructive: true, onSelect: () => remove(it) },
  ];

  const boards = state?.boards ?? [];
  const cursor = mode === "hand" ? "grab" : "crosshair";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "#7b5a36" }} role="dialog" aria-modal aria-label={`Pinnwand ${board?.name ?? ""}`}>
      {/* Fläche */}
      <div
        ref={viewport}
        className="relative flex-1 touch-none overflow-hidden select-none"
        style={{ cursor, WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div ref={world} className="absolute top-0 left-0 origin-top-left" style={{ willChange: "transform" }}>
          {/* Kork */}
          <div
            className="pointer-events-none absolute"
            style={{
              left: -4000,
              top: -4000,
              width: 12000,
              height: 12000,
              backgroundColor: "#c89a63",
              backgroundImage:
                "radial-gradient(rgba(90,55,20,.35) 1.2px, transparent 1.6px), radial-gradient(rgba(255,235,200,.28) 1px, transparent 1.5px), radial-gradient(rgba(120,75,30,.22) 2px, transparent 2.6px)",
              backgroundSize: "9px 11px, 13px 7px, 23px 19px",
              backgroundPosition: "0 0, 4px 3px, 7px 9px",
            }}
          />
          {items
            .slice()
            .sort((a, b) => a.z - b.z)
            .map((it) => (
              <BoardItemView key={it.id} item={it} selected={selected === it.id} />
            ))}
          <svg className="pointer-events-none absolute top-0 left-0" width={1} height={1} style={{ overflow: "visible", zIndex: 1_000_000 }} aria-hidden>
            <path ref={livePath} fill={penColor} />
          </svg>
        </div>

        {loaded && items.length === 0 && (
          <div className="pointer-events-none absolute inset-x-6 top-1/3 text-center" style={{ color: "rgba(255,255,255,.9)", textShadow: "0 1px 3px rgba(0,0,0,.4)" }}>
            <p className="title-2">Die Wand ist noch leer</p>
            <p className="subhead mt-1">Unten einen Zettel anpinnen, ein Foto oder PDF aufhängen oder mit dem Stift direkt auf die Wand schreiben.</p>
          </div>
        )}
      </div>

      {/* Kopfzeile */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}>
        <button onClick={onClose} className="press glass glass-strong pointer-events-auto rounded-full px-4 py-2 font-semibold" style={{ color: "var(--tint)" }}>
          Fertig
        </button>
        <button onClick={() => setBoardMenu(true)} className="press glass glass-strong headline pointer-events-auto max-w-[50%] truncate rounded-full px-4 py-2">
          {board?.name ?? "Pinnwand"} ▾
        </button>
        <button onClick={fit} className="press glass glass-strong pointer-events-auto rounded-full px-3.5 py-2 font-semibold" aria-label="Alles zeigen">
          ⤢
        </button>
      </div>

      {/* Werkzeuge */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-3" style={{ paddingBottom: "calc(var(--safe-b) + 10px)" }}>
        {(busy || message) && (
          <p className="glass glass-strong footnote rounded-full px-3 py-1.5" style={{ color: message ? "var(--danger)" : "var(--label)" }} role="status">
            {busy ?? message}
          </p>
        )}
        {mode === "pen" && (
          <div className="glass glass-strong flex items-center gap-2 rounded-full px-3 py-2">
            {INK_COLORS.map((c) => (
              <button key={c} onClick={() => setPenColor(c)} className="press h-7 w-7 rounded-full" style={{ background: c, boxShadow: penColor === c ? "0 0 0 2px var(--glass-strong), 0 0 0 4px var(--tint)" : "none" }} aria-label={`Stiftfarbe ${c}`} aria-pressed={penColor === c} />
            ))}
            <span className="mx-1 h-6 w-px" style={{ background: "var(--separator)" }} />
            {INK_SIZES.map((s, i) => (
              <button key={s} onClick={() => setPenSize(i)} className="press flex h-8 w-8 items-center justify-center rounded-full" style={{ background: penSize === i ? "color-mix(in oklab, var(--tint) 18%, transparent)" : "transparent" }} aria-label={`Stärke ${i + 1}`} aria-pressed={penSize === i}>
                <span className="rounded-full" style={{ width: s + 3, height: s + 3, background: "var(--label)" }} />
              </button>
            ))}
          </div>
        )}
        <div className="glass glass-strong flex items-center gap-1 rounded-[22px] p-1.5">
          {(
            [
              ["hand", "✋", "Verschieben"],
              ["pen", "✏️", "Stift"],
              ["eraser", "🧽", "Radierer"],
            ] as const
          ).map(([m, icon, label]) => (
            <button key={m} onClick={() => setMode(m)} className="press flex h-12 w-14 flex-col items-center justify-center rounded-[16px]" style={{ background: mode === m ? "color-mix(in oklab, var(--tint) 18%, transparent)" : "transparent", color: mode === m ? "var(--tint)" : "var(--label)" }} aria-pressed={mode === m}>
              <span className="text-lg leading-none" aria-hidden>
                {icon}
              </span>
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
          <span className="mx-1 h-8 w-px" style={{ background: "var(--separator)" }} />
          <button onClick={() => setNote({ item: null })} className="press flex h-12 w-14 flex-col items-center justify-center rounded-[16px]" aria-label="Zettel anpinnen">
            <span className="text-lg leading-none" aria-hidden>
              🗒️
            </span>
            <span className="text-[10px] font-semibold">Zettel</span>
          </button>
          <label className="press flex h-12 w-14 cursor-pointer flex-col items-center justify-center rounded-[16px]">
            <span className="text-lg leading-none" aria-hidden>
              🖼️
            </span>
            <span className="text-[10px] font-semibold">Foto, PDF</span>
            <input type="file" accept="image/*,application/pdf" multiple className="sr-only" disabled={!!busy} onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ""))} aria-label="Foto oder PDF anpinnen" />
          </label>
        </div>
      </div>

      <ContextMenu
        open={!!menu}
        onClose={() => {
          setMenu(null);
          setSelected(null);
        }}
        preview={
          menu && (
            <p className="headline">
              {menu.kind === "note" ? (menu.text ? `„${menu.text.slice(0, 60)}“` : "Zettel") : menu.kind === "photo" ? "Foto" : menu.kind === "pdf" ? (menu.fileName ?? "PDF") : "Zeichnung"}
            </p>
          )
        }
        actions={menu ? itemActions(menu) : []}
      />
      <ContextMenu
        open={!!colorFor}
        onClose={() => setColorFor(null)}
        preview={<p className="headline">Farbe des Zettels</p>}
        actions={
          colorFor
            ? ["#FFE27A", "#FFB3C7", "#A8D8FF", "#B8F0B0", "#FFC98A", "#E2C6FF", "#FFFFFF"].map((c, i) => ({
                label: ["Gelb", "Rosa", "Blau", "Grün", "Orange", "Lila", "Weiß"][i],
                icon: <span className="block h-5 w-5 rounded-[5px]" style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }} />,
                onSelect: () => update(colorFor.id, { color: c }),
              }))
            : []
        }
      />

      {note && <NoteEditor key={note.item?.id ?? "neu"} note={note.item} onClose={() => setNote(null)} onSave={saveNote} onDelete={note.item ? () => (remove(note.item!), setNote(null)) : undefined} />}

      {viewer?.file && (
        <div className="fade-in fixed inset-0 z-[90] flex items-center justify-center p-3" style={{ background: "rgba(0,0,0,.9)" }} onClick={() => setViewer(null)} role="dialog" aria-modal aria-label="Foto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(viewer.file)} alt="" className="max-h-full max-w-full rounded-[10px] object-contain" />
        </div>
      )}

      <ContextMenu
        open={boardMenu}
        onClose={() => setBoardMenu(false)}
        preview={<p className="headline">Pinnwände</p>}
        actions={[
          ...boards.map((b) => ({
            label: `${b.id === boardId ? "✓ " : ""}${b.name}${b.count ? ` (${b.count})` : ""}`,
            onSelect: () => {
              if (b.id === boardId) return;
              setLoaded(false);
              setItems([]);
              session.current = null;
              setBoardId(b.id);
            },
          })),
          { label: "Neue Pinnwand", onSelect: () => setTimeout(() => setNameSheet({ mode: "new", value: "" }), 50) },
          { label: "Umbenennen", onSelect: () => setTimeout(() => setNameSheet({ mode: "rename", value: board?.name ?? "" }), 50) },
          { label: `Papierkorb${trash.length ? ` (${trash.length})` : ""}`, onSelect: () => setTimeout(() => setShowTrash(true), 50) },
          ...(boards.length > 1 ? [{ label: "Diese Pinnwand löschen", destructive: true, onSelect: () => setTimeout(() => setConfirmBoardDelete(true), 50) }] : []),
        ]}
      />

      {nameSheet && (
        <Sheet
          open
          z={80}
          onClose={() => setNameSheet(null)}
          title={nameSheet.mode === "new" ? "Neue Pinnwand" : "Umbenennen"}
          trailing={
            <button
              disabled={!nameSheet.value.trim()}
              onClick={() => {
                const name = nameSheet.value.trim();
                setNameSheet(null);
                if (nameSheet.mode === "rename") return void run({ op: "board.rename", id: boardId, name });
                const id = uuid();
                void run({ op: "board.create", id, name }).then((ok) => {
                  if (!ok) return;
                  setLoaded(false);
                  setItems([]);
                  setBoardId(id);
                });
              }}
              className="body font-semibold"
              style={{ color: nameSheet.value.trim() ? "var(--tint)" : "var(--label-3)" }}
            >
              Fertig
            </button>
          }
        >
          <input value={nameSheet.value} onChange={(e) => setNameSheet({ ...nameSheet, value: e.target.value })} placeholder="z. B. Schule, Notfall, Urlaub" maxLength={40} autoFocus className="body glass mt-3 w-full rounded-[14px] px-3 py-2.5" aria-label="Name" />
        </Sheet>
      )}

      {showTrash && (
        <Sheet open z={80} onClose={() => setShowTrash(false)} title="Papierkorb">
          <p className="footnote mt-1" style={{ color: "var(--label-2)" }}>
            Gelöschtes und Abgelaufenes bleibt 30 Tage hier, danach ist es endgültig weg.
          </p>
          {trash.length === 0 && (
            <p className="subhead mt-4" style={{ color: "var(--label-2)" }}>
              Der Papierkorb ist leer.
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {trash.map((t) => (
              <div key={t.id} className="glass flex items-center gap-3 rounded-[16px] px-3 py-2.5">
                <span className="text-2xl" aria-hidden>
                  {t.kind === "note" ? "🗒️" : t.kind === "photo" ? "🖼️" : t.kind === "pdf" ? "📄" : "✏️"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="body block truncate">{t.kind === "note" ? (t.text ?? "Handschriftlicher Zettel") : t.kind === "pdf" ? (t.fileName ?? "PDF") : t.kind === "photo" ? "Foto" : "Zeichnung"}</span>
                  <span className="footnote" style={{ color: "var(--label-2)" }}>
                    {t.deletedAt ? `gelöscht am ${new Date(t.deletedAt).toLocaleDateString("de-DE")}` : `abgelaufen am ${new Date(`${t.expires}T12:00`).toLocaleDateString("de-DE")}`}
                  </span>
                </span>
                <button
                  onClick={() => {
                    setTrash((l) => l.filter((x) => x.id !== t.id));
                    setItems((l) => [...l, { ...t, deletedAt: null, expires: t.expires && t.expires < new Date().toISOString().slice(0, 10) ? null : t.expires }]);
                    void run({ op: "bitem.restore", id: t.id });
                  }}
                  className="press footnote rounded-full px-3 py-1.5 font-semibold"
                  style={{ background: "color-mix(in oklab, var(--tint) 14%, transparent)", color: "var(--tint)" }}
                >
                  Zurückholen
                </button>
                <button
                  onClick={() => {
                    setTrash((l) => l.filter((x) => x.id !== t.id));
                    void run({ op: "bitem.purge", id: t.id });
                  }}
                  className="press footnote rounded-full px-2.5 py-1.5 font-semibold"
                  style={{ color: "var(--danger)" }}
                  aria-label="Endgültig löschen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Sheet>
      )}

      <ContextMenu
        open={confirmBoardDelete}
        onClose={() => setConfirmBoardDelete(false)}
        preview={
          <div>
            <p className="headline">„{board?.name}“ löschen?</p>
            <p className="footnote mt-1" style={{ color: "var(--label-2)" }}>
              Alles darauf wird endgültig gelöscht, auch Fotos und PDFs. Das lässt sich nicht rückgängig machen.
            </p>
          </div>
        }
        actions={[
          {
            label: "Endgültig löschen",
            destructive: true,
            onSelect: () => {
              const other = boards.find((b) => b.id !== boardId);
              void run({ op: "board.delete", id: boardId });
              if (other) {
                setLoaded(false);
                setItems([]);
                setBoardId(other.id);
              }
            },
          },
        ]}
      />
    </div>
  );
}
