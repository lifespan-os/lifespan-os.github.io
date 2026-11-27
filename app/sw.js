// Service Worker: hält die App offline verfügbar. Speichert nur die App-Dateien,
// niemals Trainingsdaten (die liegen in IndexedDB auf dem Gerät).
const VERSION = "lifespan-mobil-1.183.0";
const FILES = [
  "./",
  "index.html",
  "app.css",
  "fonts/barlow-condensed-latin-700-normal.woff2",
  "fonts/barlow-condensed-latin-800-normal.woff2",
  "fonts/barlow-condensed-latin-800-italic.woff2",
  // Alle Programmteile in einer Datei (1.158.0, schnellerer Start; erzeugt mit
  // scripts/tools/handy/handy-buendeln.cmd aus den Modulen in mobile/)
  "app.bundle.js",
  // „Eingabe für alles“ in der Schnellerfassung (1.141.0)
  "lifespan-logo-freigestellt.png",
  // Open Food Facts (1.59.0): Programmteile; der Katalog selbst (off/off-de-at.tsv.gz) nur bei Bedarf
  // Meine Gyms (1.60.0)
  "musclemap/male.webp",
  "musclemap/female.webp",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/figur.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  // Abbildung Wadenmuskulatur in Insights → Training (1.173.0)
  "icons/wade-anatomie.svg",
  // Klänge des Pausentimers wie am PC (1.44.0)
  "sounds/yeah-buddy.mp3",
  "sounds/light-weight-baby.mp3",
  "sounds/do-you-even-lift.mp3",
  "sounds/i-can-do-this-all-day.mp3",
  "sounds/skinny.mp3",
];

// Texterkennung (Tesseract.js mit deutschen Sprachdaten, ca. 6 MB): wird mitgespeichert, damit der
// Etikett-Scanner offline läuft. Fehlt eine Datei, bleibt die App trotzdem nutzbar.
const OCR_FILES = [
  "vendor/ocr/tesseract.min.js",
  "vendor/ocr/worker.min.js",
  "vendor/ocr/tesseract-core-lstm.wasm.js",
  "vendor/ocr/tesseract-core-simd-lstm.wasm.js",
  "vendor/ocr/deu.traineddata.gz",
  // Grunddaten für „Konto am Handy“ (1.25.0; seit 1.46.1 ohne Herstellerprodukte)
  "startpaket.json",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches
      .open(VERSION)
      .then(async (c) => {
        await c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })));
        await Promise.all(OCR_FILES.map((f) => c.add(new Request(f, { cache: "reload" })).catch(() => {})));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Schneller Start (1.158.0): App-Dateien kommen sofort aus dem Speicher des Geräts (cache first). Bisher
// wartete jeder Start bei jeder der über 100 Dateien auf das Netz. Neue Versionen kommen trotzdem an: Der
// Browser prüft sw.js bei jedem Öffnen; ändert sich VERSION, lädt der neue Service Worker alle Dateien
// frisch (cache: "reload") in einen neuen Speicher und übernimmt – ab dem nächsten Öffnen läuft die neue
// Version. Jeder Speicher enthält genau eine Version, Dateien verschiedener Versionen mischen sich nicht.
// Alles andere (Herstellerpakete, Studio-Pakete …): online zuerst aus dem Netz, nach 3 s oder offline aus
// dem Speicher. Schrift „Barlow Condensed“ liegt seit 1.52.0 in der App (fonts/) – keine Anfrage an Google.

const APP_PATHS = new Set(FILES.map((f) => new URL(f, self.location).pathname));

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  // Bilderpakete (1.67.0, bis 8 MB je Datei) nicht zusätzlich im Speicher des Service Workers ablegen –
  // die Bilder landen ohnehin in der IndexedDB „lifespan-bilder“
  if (path.includes("/bilder/")) return;
  if (APP_PATHS.has(path) || req.mode === "navigate") {
    ev.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        // Nicht im Speicher (z. B. Speicher vom System geleert): aus dem Netz holen und ablegen
        return fetch(req, { cache: "no-cache" })
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => new Response("Offline", { status: 503 }));
      }),
    );
    return;
  }
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
