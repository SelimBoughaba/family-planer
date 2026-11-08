// Service Worker des Familienplaners: Mitteilungen und App-Hülle für den Start ohne Netz.
// Daten (/api) gehen nie durch den Cache; den letzten Stand hält die App selbst.
const PAGES = "fp-pages-v1";
const STATIC = "fp-static-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const keep = [PAGES, STATIC];
      for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);

// Nachricht der App beim Abmelden: alles Zwischengespeicherte weg
self.addEventListener("message", (event) => {
  if (event.data === "fp-clear") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(STATIC)]));
});

async function trimStatic() {
  const c = await caches.open(STATIC);
  const keys = await c.keys();
  // alte Bauten nicht endlos sammeln
  for (const k of keys.slice(0, Math.max(0, keys.length - 250))) await c.delete(k);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/kalender/") || url.pathname.startsWith("/owner")) return;

  // Seiten: erst das Netz, ohne Netz die zuletzt geladene Fassung
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        try {
          const res = await fetch(req);
          if (res.ok && res.type === "basic") await cache.put(url.pathname, res.clone());
          return res;
        } catch {
          return (await cache.match(url.pathname)) || (await cache.match("/")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Bausteine der App tragen ihre Version im Namen: einmal geladen, dauerhaft gültig
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          void trimStatic();
        }
        return res;
      })(),
    );
    return;
  }

  // Symbole und Manifest: sofort aus dem Cache, im Hintergrund auffrischen
  if (/\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res.ok) void cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit || Response.error());
        return hit || net;
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Familienplaner", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Familienplaner";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
