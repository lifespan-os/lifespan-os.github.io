// LIFESPAN OS Mobil – Texterkennung auf dem Handy (offline).
// Tesseract.js liegt mit deutschen Sprachdaten im Ordner vendor/ocr/ (einmalig mit
// scripts/48-handy-texterkennung-laden.cmd geholt) und wird erst beim ersten Scan geladen.
// Der Service Worker speichert die Dateien, danach läuft die Erkennung ohne Internet.

const BASE = new URL("vendor/ocr/", import.meta.url).href;

let libPromise = null;
let workerPromise = null;
let progressHandler = null; // Fortschritt des laufenden Durchgangs

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

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const T = await loadLib();
      const worker = await T.createWorker("deu", 1, {
        workerPath: BASE + "worker.min.js",
        corePath: BASE,
        langPath: BASE,
        workerBlobURL: false,
        logger: (m) => progressHandler?.(m),
      });
      await worker.setParameters({ preserve_interword_spaces: "1" });
      return worker;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** Foto laden (Ausrichtung des Handys beachtet). */
export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Das Bild lässt sich nicht öffnen (bitte JPEG oder PNG)."));
      i.src = url;
    });
  } finally {
    // erst nach dem Zeichnen freigeben
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

/** Bild um 0/90/180/270 Grad gedreht auf eine Leinwand (längste Seite höchstens `max`). */
export function rotated(img, rotate = 0, max = 3200) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const turn = ((rotate % 360) + 360) % 360;
  const c = document.createElement("canvas");
  c.width = turn % 180 ? h : w;
  c.height = turn % 180 ? w : h;
  const ctx = c.getContext("2d");
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}

/**
 * Ausschnitt (Anteile 0–1 von x, y, Breite, Höhe) vergrößern bzw. verkleinern, sodass die längere
 * Seite etwa 2200 px hat (kleine Schrift wird größer – die Texterkennung braucht ca. 20–30 px
 * Zeichenhöhe), dann in Graustufen. `mode`: „contrast“ (Helligkeit gestreckt) oder „binary“
 * (Schwarz-Weiß mit örtlicher Schwelle, gleicht Schatten und Spiegelungen aus).
 */
export function prepareCanvas(source, { crop = null, mode = "contrast" } = {}) {
  const sw = source.width;
  const sh = source.height;
  const r = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(r.x * sw);
  const sy = Math.round(r.y * sh);
  const cw = Math.max(1, Math.round(r.w * sw));
  const ch = Math.max(1, Math.round(r.h * sh));
  const scale = Math.min(3, TARGET_SIDE / Math.max(cw, ch));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cw * scale);
  canvas.height = Math.round(ch * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = toGray(data.data);
  const out = mode === "binary" ? adaptiveThreshold(gray, canvas.width, canvas.height) : stretch(gray);
  const p = data.data;
  for (let i = 0, j = 0; j < out.length; i += 4, j++) p[i] = p[i + 1] = p[i + 2] = out[j];
  ctx.putImageData(data, 0, 0);
  return canvas;
}

const TARGET_SIDE = 2200;

function toGray(p) {
  const g = new Uint8ClampedArray(p.length / 4);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
  return g;
}

/** Helligkeit strecken: 2 % dunkelste → schwarz, 2 % hellste → weiß. */
function stretch(g) {
  const hist = new Uint32Array(256);
  for (const v of g) hist[v]++;
  const cut = g.length * 0.02;
  let lo = 0;
  let hi = 255;
  for (let s = 0; lo < 255 && s + hist[lo] < cut; lo++) s += hist[lo];
  for (let s = 0; hi > 0 && s + hist[hi] < cut; hi--) s += hist[hi];
  if (hi - lo < 30) return g;
  const out = new Uint8ClampedArray(g.length);
  const f = 255 / (hi - lo);
  for (let i = 0; i < g.length; i++) out[i] = (g[i] - lo) * f;
  return out;
}

/** Örtliche Schwelle (Bradley): heller als 85 % der Umgebung → weiß, sonst schwarz. */
function adaptiveThreshold(g, w, h) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += g[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
    }
  }
  const half = Math.max(8, Math.round(Math.max(w, h) / 32));
  const out = new Uint8ClampedArray(g.length);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(w, x + half + 1);
      const sum = integral[y2 * (w + 1) + x2] - integral[y1 * (w + 1) + x2] - integral[y2 * (w + 1) + x1] + integral[y1 * (w + 1) + x1];
      const mean = sum / ((x2 - x1) * (y2 - y1));
      out[y * w + x] = g[y * w + x] < mean * 0.85 ? 0 : 255;
    }
  }
  return out;
}

/**
 * Durchgänge der Texterkennung (1.2.1): Graustufen als ein Textblock, Schwarz-Weiß als ein
 * Textblock, Graustufen spaltenweise. Gewählt wird der Text mit der besten Bewertung (`score`);
 * ist ein Durchgang schon gut genug (`goodEnough`), entfallen die übrigen.
 */
const PASSES = [
  { mode: "contrast", psm: "6" },
  { mode: "binary", psm: "6" },
  { mode: "contrast", psm: "4" },
];

/** Text eines Fotos; `onProgress(text, anteil 0–1)`. Rückgabe { text, pass }. */
export async function recognizeBest(source, { crop = null, score = () => 0, goodEnough = Infinity } = {}, onProgress) {
  let current = 0;
  progressHandler = (m) => {
    const step = PASSES.length > 1 ? ` (Durchgang ${current + 1} von ${PASSES.length})` : "";
    if (m.status === "recognizing text") onProgress?.(`Text wird erkannt${step} …`, m.progress);
    else if (/load|initializ/i.test(m.status)) onProgress?.("Texterkennung wird geladen …", m.progress);
  };
  const worker = await getWorker();
  let best = null;
  for (; current < PASSES.length; current++) {
    const pass = PASSES[current];
    const canvas = prepareCanvas(source, { crop, mode: pass.mode });
    await worker.setParameters({ tessedit_pageseg_mode: pass.psm });
    const { data } = await worker.recognize(canvas);
    const text = data.text || "";
    const value = score(text);
    if (!best || value > best.value) best = { text, value, pass: current + 1 };
    if (value >= goodEnough) break;
  }
  return best ?? { text: "", value: 0, pass: 0 };
}

/**
 * Zeilen eines Screenshots (1.12.0, Waagen-Auswertung): Bild als Graustufen-Leinwände je Abschnitt
 * (dunkler Hintergrund schon umgekehrt, siehe scaleScan.prepareGray/sliceRanges), Text als ein Block.
 * `onProgress(text, anteil 0–1)`. Rückgabe: erkannte Zeilen von oben nach unten.
 */
export async function recognizeRows(canvases, onProgress, psm = "6") {
  let current = 0;
  progressHandler = (m) => {
    const step = canvases.length > 1 ? ` (Abschnitt ${current + 1} von ${canvases.length})` : "";
    if (m.status === "recognizing text") onProgress?.(`Text wird erkannt${step} …`, m.progress);
    else if (/load|initializ/i.test(m.status)) onProgress?.("Texterkennung wird geladen …", m.progress);
  };
  const worker = await getWorker();
  await worker.setParameters({ tessedit_pageseg_mode: psm });
  const rows = [];
  for (; current < canvases.length; current++) {
    const { data } = await worker.recognize(canvases[current]);
    rows.push(...String(data.text || "").split(/\n+/).map((r) => r.trim()).filter(Boolean));
  }
  progressHandler = null;
  return rows;
}
