// LIFESPAN OS Mobil – Texterkennung auf dem Handy (offline).
// Tesseract.js liegt mit deutschen Sprachdaten im Ordner vendor/ocr/ (einmalig mit
// scripts/48-handy-texterkennung-laden.cmd geholt) und wird erst beim ersten Scan geladen.
// Der Service Worker speichert die Dateien, danach läuft die Erkennung ohne Internet.

const BASE = new URL("vendor/ocr/", import.meta.url).href;
const MAX_SIDE = 2000;

let libPromise = null;
let workerPromise = null;

function loadLib() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = BASE + "tesseract.min.js";
      s.onload = () => (globalThis.Tesseract ? resolve(globalThis.Tesseract) : reject(new Error("Texterkennung fehlt.")));
      s.onerror = () => {
        libPromise = null;
        reject(new Error("Die Texterkennung ist auf diesem Gerät noch nicht geladen. Bitte einmal mit Internet öffnen – oder „Text scannen“ verwenden."));
      };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

/** Ist die Texterkennung verfügbar (Dateien vorhanden bzw. schon gespeichert)? */
export async function ocrAvailable() {
  try {
    const res = await fetch(BASE + "tesseract.min.js", { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const T = await loadLib();
      const worker = await T.createWorker("deu", 1, {
        workerPath: BASE + "worker.min.js",
        corePath: BASE,
        langPath: BASE,
        workerBlobURL: false,
        logger: (m) => onProgress?.(m),
      });
      // Tabellen zeilenweise lesen (ein Textblock)
      await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
      return worker;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** Foto laden (Ausrichtung des Handys beachtet), verkleinern, in Graustufen mit mehr Kontrast. */
export async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Das Bild lässt sich nicht öffnen (bitte JPEG oder PNG)."));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      const c = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128));
      p[i] = p[i + 1] = p[i + 2] = c;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Text eines Fotos; `onProgress(text, anteil 0–1)`. */
export async function recognize(file, onProgress) {
  const canvas = await prepareImage(file);
  const worker = await getWorker((m) => {
    if (m.status === "recognizing text") onProgress?.("Text wird erkannt …", m.progress);
    else if (/load|initializ/i.test(m.status)) onProgress?.("Texterkennung wird geladen …", m.progress);
  });
  const { data } = await worker.recognize(canvas);
  return data.text || "";
}
