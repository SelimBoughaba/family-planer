"use client";

export type PushStatus = "unsupported" | "needs-install" | "denied" | "off" | "on";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function pushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  // iPhone erlaubt Mitteilungen nur für Apps auf dem Home-Bildschirm
  if (isIos() && !standalone()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function save(personId: string, sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personId, subscription: sub.toJSON(), userAgent: navigator.userAgent }),
  });
  return res.ok;
}

/** Muss direkt aus einem Tipp heraus aufgerufen werden, sonst blockiert iOS die Abfrage */
export async function enablePush(personId: string): Promise<{ ok: boolean; message?: string }> {
  if (!pushSupported()) return { ok: false, message: "Dieses Gerät unterstützt keine Mitteilungen für Web-Apps." };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, message: "Mitteilungen wurden nicht erlaubt. Das lässt sich in den Einstellungen des iPhones unter Mitteilungen ändern." };
  const reg = (await registerWorker()) ?? (await navigator.serviceWorker.ready);
  const keyRes = await fetch("/api/push/key");
  if (!keyRes.ok) return { ok: false, message: "Mitteilungen sind auf dem Server noch nicht eingerichtet." };
  const { key } = await keyRes.json();
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  return (await save(personId, sub)) ? { ok: true } : { ok: false, message: "Das Gerät konnte nicht gespeichert werden." };
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe();
}

/** Nach Profilwechsel das Gerät der neuen Person zuordnen */
export async function syncPushOwner(personId: string) {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await save(personId, sub);
}
