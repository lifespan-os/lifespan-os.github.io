// LIFESPAN OS Mobil – Bildausschnitt wählen (1.62.0, Meine Gyms). Gleiche Rechnung wie am PC
// (`src/domain/photoCrop.ts`): quadratischer Rahmen, Bild füllt ihn („cover“), mit dem Finger
// verschieben, mit dem Regler vergrößern. Ergebnis: verkleinertes JPEG als data-URL.
// Der Dialog liegt als eigenes Element über der App, damit ein Neuzeichnen der Seite ihn nicht stört.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

const clampZoom = (zoom) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(zoom) ? zoom : 1));

/** Größe des Ausschnitts für Seitenverhältnis `aspect` (Breite : Höhe; 1 = quadratisch). */
export function cropBox(width, height, zoom, aspect = 1) {
  const w = Math.min(width, height * aspect) / clampZoom(zoom);
  return { w, h: w / aspect };
}

export const cropSize = (width, height, zoom) => cropBox(width, height, zoom, 1).w;

export function clampView(width, height, view, aspect = 1) {
  const zoom = clampZoom(view.zoom);
  const { w, h } = cropBox(width, height, zoom, aspect);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  return {
    zoom,
    cx: clamp(Number.isFinite(view.cx) ? view.cx : width / 2, w / 2, width - w / 2),
    cy: clamp(Number.isFinite(view.cy) ? view.cy : height / 2, h / 2, height - h / 2),
  };
}

export const initialView = (width, height) => ({ zoom: 1, cx: width / 2, cy: height / 2 });

export function cropRect(width, height, view, aspect = 1) {
  const v = clampView(width, height, view, aspect);
  const { w, h } = cropBox(width, height, v.zoom, aspect);
  return { sx: v.cx - w / 2, sy: v.cy - h / 2, sw: w, sh: h, size: w };
}

export function panView(width, height, view, dx, dy, frame, aspect = 1) {
  const scale = cropBox(width, height, view.zoom, aspect).w / frame;
  return clampView(width, height, { ...view, cx: view.cx - dx * scale, cy: view.cy - dy * scale }, aspect);
}

export const zoomView = (width, height, view, zoom, aspect = 1) => clampView(width, height, { ...view, zoom }, aspect);

/** Ausschnitt auf ein Canvas; die längere Seite höchstens `maxSide` Pixel. */
function cropCanvas(image, view, maxSide, aspect) {
  const { sx, sy, sw, sh } = cropRect(image.width, image.height, view, aspect);
  const f = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * f));
  canvas.height = Math.max(1, Math.round(sh * f));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Ausschnitt als JPEG; wird so lange verkleinert, bis er in `maxChars` passt. */
export function renderCrop(image, view, maxSide = 800, maxChars = 550000, aspect = 1) {
  let scale = 1;
  let quality = 0.85;
  for (;;) {
    const url = cropCanvas(image, view, Math.round(maxSide * scale), aspect).toDataURL("image/jpeg", quality);
    if (url.length <= maxChars || maxSide * scale <= 240) return url;
    scale *= 0.8;
    quality = 0.75;
  }
}

async function loadImage(source) {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // ältere Safari: unten über <img>
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, img, draw: img };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Dialog zeigen. `source` ist eine Datei oder eine data-URL. Liefert die data-URL des
 * Ausschnitts (mit `blob: true` eine JPEG-Datei) oder null (abgebrochen). Wirft, wenn das Bild
 * nicht lesbar ist. `aspect`: Breite : Höhe des Rahmens (1 = quadratisch, 0,75 = hochkant 3 : 4).
 */
export async function cropPhoto(source, { title = "Ausschnitt wählen", maxSide = 800, maxChars = 550000, aspect = 1, blob = false } = {}) {
  const loaded = await loadImage(source);
  const image = loaded.img ?? loaded; // ImageBitmap oder <img>
  const W = loaded.width;
  const H = loaded.height;
  let view = initialView(W, H);
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const root = document.createElement("div");
  root.className = "crop-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", title);
  root.innerHTML = `<div class="crop-box card">
    <h3>${esc(title)}</h3>
    <p class="muted small">Bild mit dem Finger verschieben, mit dem Regler vergrößern.</p>
    <canvas class="crop-frame" aria-label="Bildausschnitt"></canvas>
    <label class="crop-zoom"><span aria-hidden="true">−</span><span class="visually-hidden">Vergrößerung</span>
      <input type="range" min="${MIN_ZOOM}" max="${MAX_ZOOM}" step="0.01" value="1"><span aria-hidden="true">+</span></label>
    <div class="row-actions"><button class="btn primary" data-crop="ok">Übernehmen</button><button class="btn" data-crop="cancel">Abbrechen</button></div>
  </div>`;
  document.body.appendChild(root);
  const canvas = root.querySelector("canvas");
  canvas.style.aspectRatio = String(aspect);
  const range = root.querySelector("input[type=range]");

  const draw = () => {
    const css = canvas.clientWidth || 280;
    const px = Math.round(css * (window.devicePixelRatio || 1));
    const py = Math.round(px / aspect);
    if (canvas.width !== px || canvas.height !== py) {
      canvas.width = px;
      canvas.height = py;
    }
    const { sx, sy, sw, sh } = cropRect(W, H, view, aspect);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, px, py);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, px, py);
  };
  draw();

  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    view = panView(W, H, view, e.clientX - drag.x, e.clientY - drag.y, canvas.clientWidth || 280, aspect);
    drag = { id: drag.id, x: e.clientX, y: e.clientY };
    draw();
  });
  const end = () => (drag = null);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  range.addEventListener("input", () => {
    view = zoomView(W, H, view, Number(range.value), aspect);
    draw();
  });

  return new Promise((resolve) => {
    const finish = (result) => {
      root.remove();
      if (typeof loaded.close === "function") loaded.close();
      resolve(result);
    };
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-crop]");
      if (!b) return;
      if (b.dataset.crop !== "ok") return finish(null);
      if (!blob) return finish(renderCrop(image, view, maxSide, maxChars, aspect));
      // als Bilddatei für die bisherige Verarbeitung (Check-In-Foto, Sportbild)
      cropCanvas(image, view, maxSide, aspect).toBlob((b2) => finish(b2), "image/jpeg", 0.92);
    });
  });
}
