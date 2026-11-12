// Service Worker: hält die App offline verfügbar. Speichert nur die App-Dateien,
// niemals Trainingsdaten (die liegen in IndexedDB auf dem Gerät).
const VERSION = "lifespan-mobil-1.1.2";
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

// Online zuerst aus dem Netz (so kommen Updates sofort an), nach 3 s oder offline aus dem Speicher.
self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  ev.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const net = fetch(req, { cache: "no-cache" }).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      });
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
      try {
        const res = await Promise.race([net, timeout]);
        if (res) return res;
      } catch {
        /* offline */
      }
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      return net.catch(() => new Response("Offline", { status: 503 }));
    }),
  );
});
