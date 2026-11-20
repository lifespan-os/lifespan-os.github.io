/**
 * Muskel-Körperkarte vergrößern (1.73.0, Wunsch des Nutzers): Lupe an jeder Karte öffnet sie bildschirmfüllend.
 * Zoomen mit zwei Fingern, Doppeltippen oder − / +; verschieben durch Wischen. Muskel antippen zeigt den Wert
 * (Text aus dem `<title>` der Fläche). Die Ansicht ist eine Kopie der Karte und liegt direkt im Body, damit
 * das Neuzeichnen der Seite sie nicht schließt.
 */

const MIN = 1;
const MAX = 4;
const STEP = 1.5;

let root = null;
let scale = 1;

const clamp = (v) => Math.min(MAX, Math.max(MIN, v));

function els() {
  return { scroller: root.querySelector(".mapzoom__scroll"), inner: root.querySelector(".mapzoom__inner"), level: root.querySelector(".mapzoom__level") };
}

/** Maßstab setzen; der Punkt unter (cx, cy) bleibt an seiner Stelle. */
function setScale(next, cx, cy) {
  const { scroller, inner, level } = els();
  const s = clamp(next);
  const rect = scroller.getBoundingClientRect();
  const x = (cx ?? rect.left + rect.width / 2) - rect.left;
  const y = (cy ?? rect.top + rect.height / 2) - rect.top;
  const ratio = s / scale;
  const px = (scroller.scrollLeft + x) * ratio - x;
  const py = (scroller.scrollTop + y) * ratio - y;
  scale = s;
  inner.style.width = `${s * 100}%`;
  scroller.scrollLeft = px;
  scroller.scrollTop = py;
  level.textContent = `${Math.round(s * 100)} %`;
}

function close() {
  if (!root) return;
  root.remove();
  root = null;
  document.body.classList.remove("mapzoom-open");
  document.removeEventListener("keydown", onKey);
}

function onKey(e) {
  if (e.key === "Escape") close();
}

function showMuscle(path) {
  root.querySelectorAll(".mapzoom__inner path.is-picked").forEach((p) => p.classList.remove("is-picked"));
  path.classList.add("is-picked");
  root.querySelector(".mapzoom__info").textContent = path.querySelector("title")?.textContent ?? "";
}

function attachGestures(scroller) {
  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  scroller.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) pinch = { d: dist(e.touches), s: scale };
    },
    { passive: true },
  );
  scroller.addEventListener(
    "touchmove",
    (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setScale(pinch.s * (dist(e.touches) / pinch.d), cx, cy);
    },
    { passive: false },
  );
  scroller.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) pinch = null;
  });
  // Safari: eigenes Seiten-Zoomen unterdrücken
  root.addEventListener("gesturestart", (e) => e.preventDefault());
  scroller.addEventListener("dblclick", (e) => {
    e.preventDefault();
    setScale(scale > 1.5 ? 1 : 2.5, e.clientX, e.clientY);
  });
}

export function openMapZoom(map) {
  close();
  const views = map?.querySelector(".muscle-map__views");
  if (!views) return;
  const title = map.closest("section")?.querySelector("h3")?.textContent.replace(/^\s*\/\s*/, "").trim() || "Muskel-Körperkarte";
  const legend = map.querySelector(".muscle-map__legend")?.outerHTML ?? "";
  root = document.createElement("div");
  root.className = "mapzoom";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", `${title} vergrößert`);
  root.innerHTML = `<div class="mapzoom__bar"><b class="mapzoom__title"></b>
      <div class="mapzoom__btns"><button type="button" class="mapzoom__btn" data-z="out" aria-label="Verkleinern">−</button><span class="mapzoom__level" aria-live="polite">100 %</span><button type="button" class="mapzoom__btn" data-z="in" aria-label="Vergrößern">+</button><button type="button" class="mapzoom__btn mapzoom__close" data-z="close" aria-label="Schließen">✕</button></div></div>
    <div class="mapzoom__scroll"><div class="mapzoom__inner">${views.innerHTML}</div></div>
    <p class="mapzoom__info" aria-live="polite">Muskel antippen · mit zwei Fingern oder Doppeltippen zoomen</p>${legend}`;
  root.querySelector(".mapzoom__title").textContent = title;
  // Kopie: keine Aktionen der Seite auslösen, Auswahl der Seite nicht mitnehmen
  root.querySelectorAll(".mapzoom__inner [data-act]").forEach((el) => {
    el.removeAttribute("data-act");
    el.removeAttribute("stroke");
  });
  scale = 1;
  document.body.appendChild(root);
  document.body.classList.add("mapzoom-open");
  document.addEventListener("keydown", onKey);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-z]");
    if (b) {
      if (b.dataset.z === "close") close();
      else setScale(b.dataset.z === "in" ? scale * STEP : scale / STEP);
      return;
    }
    const path = e.target.closest(".mapzoom__inner path");
    if (path) showMuscle(path);
  });
  attachGestures(root.querySelector(".mapzoom__scroll"));
  root.querySelector(".mapzoom__close").focus();
}

// Lupe an der Karte (`heatmapHtml`): eigener Klick-Abgriff, unabhängig von den `data-act`-Aktionen
document.addEventListener(
  "click",
  (e) => {
    const b = e.target.closest?.("[data-map-zoom]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    openMapZoom(b.closest(".muscle-map"));
  },
  true,
);
