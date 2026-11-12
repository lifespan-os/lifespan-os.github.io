// Service Worker: hält die App offline verfügbar. Speichert nur die App-Dateien,
// niemals Trainingsdaten (die liegen in IndexedDB auf dem Gerät).
const VERSION = "lifespan-mobil-1.0.0";
const FILES = [
  "./",
  "index.html",
  "app.css",
  "app.js",
  "core.js",
  "store.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Zuerst aus dem Speicher (schnell, offline); im Hintergrund aktualisieren.
self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  ev.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return hit || (await net) || new Response("Offline", { status: 503 });
    }),
  );
});
