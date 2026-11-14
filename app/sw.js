// Service Worker: hält die App offline verfügbar. Speichert nur die App-Dateien,
// niemals Trainingsdaten (die liegen in IndexedDB auf dem Gerät).
const VERSION = "lifespan-mobil-1.32.0";
const FILES = [
  "./",
  "index.html",
  "app.css",
  "app.js",
  "core.js",
  "store.js",
  "label.js",
  "nutrition.js",
  "food.js",
  "body.js",
  "bodydata.js",
  "nav.js",
  "focusinfo.js",
  "focusdata.js",
  "pcdb.js",
  "pcdomain.js",
  "pcview.js",
  "diary.js",
  "overview.js",
  "logs.js",
  "logsdata.js",
  "insightsview.js",
  "todos.js",
  "todosdata.js",
  "checklistdata.js",
  "caffeinedata.js",
  "icoach.js",
  "health.js",
  "healthdata.js",
  "super.js",
  "superdata.js",
  "training.js",
  "trainingdata.js",
  "trainingstats.js",
  "trainingdb.js",
  "pending.js",
  "supplements.js",
  "vendor.js",
  "vendorui.js",
  "goals.js",
  "goalsui.js",
  "accountexport.js",
  "bls.js",
  "blsui.js",
  "pcoverview.js",
  "musclemap/regions.js",
  "musclemap/male.webp",
  "musclemap/female.webp",
  "nutrientcatalog.js",
  "ocr.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

// Texterkennung (Tesseract.js mit deutschen Sprachdaten, ca. 6 MB): wird mitgespeichert, damit der
// Etikett-Scanner offline läuft. Fehlt eine Datei, bleibt die App trotzdem nutzbar.
const OCR_FILES = [
  "vendor/ocr/tesseract.min.js",
  "vendor/ocr/worker.min.js",
  "vendor/ocr/tesseract-core-lstm.wasm.js",
  "vendor/ocr/tesseract-core-simd-lstm.wasm.js",
  "vendor/ocr/deu.traineddata.gz",
  // Grunddaten für „Konto am Handy“ (1.25.0, ca. 0,3 MB komprimiert)
  "startpaket.json",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches
      .open(VERSION)
      .then(async (c) => {
        await c.addAll(FILES);
        await Promise.all(OCR_FILES.map((f) => c.add(f).catch(() => {})));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Online zuerst aus dem Netz (so kommen Updates sofort an), nach 3 s oder offline aus dem Speicher.
// Schrift „Barlow Condensed“ (Design C, 1.21.0) von Google Fonts: einmal laden, dann offline aus dem Speicher.
const FONT_CACHE = "lifespan-fonts-1";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method === "GET" && FONT_HOSTS.includes(new URL(req.url).hostname)) {
    ev.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === "opaque") cache.put(req, res.clone());
          return res;
        } catch {
          return new Response("", { status: 503 });
        }
      }),
    );
    return;
  }
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
