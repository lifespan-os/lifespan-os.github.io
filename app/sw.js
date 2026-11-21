// Service Worker: hält die App offline verfügbar. Speichert nur die App-Dateien,
// niemals Trainingsdaten (die liegen in IndexedDB auf dem Gerät).
const VERSION = "lifespan-mobil-1.82.0";
const FILES = [
  "./",
  "index.html",
  "app.css",
  "fonts/barlow-condensed-latin-700-normal.woff2",
  "fonts/barlow-condensed-latin-800-normal.woff2",
  "fonts/barlow-condensed-latin-800-italic.woff2",
  "app.js",
  "appbase.js",
  "sheets.js",
  "navshell.js",
  "resttimer.js",
  "devsettings.js",
  "accounts.js",
  "catalogload.js",
  "homeview.js",
  "workoutview.js",
  "transferview.js",
  "appactions.js",
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
  "extras.js",
  "diary.js",
  "diarysupp.js",
  "diaryactions.js",
  "fastdata.js",
  "quickmeal.js",
  "overview.js",
  "mapzoom.js",
  "longevityview.js",
  "protocolsview.js",
  "logs.js",
  "logsdata.js",
  "insightsview.js",
  "weeklyreports.js",
  "lifespan-logo-freigestellt.png",
  "todos.js",
  "todosdata.js",
  "checklistdata.js",
  "caffeinedata.js",
  "icoach.js",
  "health.js",
  "heart.js",
  "glucose.js",
  "glucosedata.js",
  "wearabledata.js",
  "healthdata.js",
  "super.js",
  "supertabs.js",
  "superactions.js",
  "superdata.js",
  "training.js",
  "trainingplans.js",
  "trainingactions.js",
  "trainingdata.js",
  "trainingstats.js",
  "trainingdb.js",
  "pending.js",
  "supplements.js",
  "vendor.js",
  "vendorui.js",
  "catalogfile.js",
  "catalogui.js",
  "hyrox.js",
  "goals.js",
  "goalsui.js",
  "accountexport.js",
  "bls.js",
  "blsui.js",
  // Open Food Facts (1.59.0): Programmteile; der Katalog selbst (off/off-de-at.tsv.gz) nur bei Bedarf
  "off.js",
  "offui.js",
  // Meine Gyms (1.60.0)
  "gymsdata.js",
  "gymsui.js",
  "photocrop.js",
  "infonotes.js",
  "dayswipe.js",
  "machineimages.js",
  "pcoverview.js",
  "settingsview.js",
  "pcsettings.js",
  "devprefs.js",
  "appday.js",
  "layoutedit.js",
  "musclemap/regions.js",
  "musclemap/male.webp",
  "musclemap/female.webp",
  "nutrientcatalog.js",
  "ocr.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/figur.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
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
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Online zuerst aus dem Netz (so kommen Updates sofort an), nach 3 s oder offline aus dem Speicher.
// Schrift „Barlow Condensed“ liegt seit 1.52.0 in der App (fonts/) – keine Anfrage an Google mehr.

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // Bilderpakete (1.67.0, bis 8 MB je Datei) nicht zusätzlich im Speicher des Service Workers ablegen –
  // die Bilder landen ohnehin in der IndexedDB „lifespan-bilder“
  if (new URL(req.url).pathname.includes("/bilder/")) return;
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
