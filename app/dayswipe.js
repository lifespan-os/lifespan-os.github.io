/**
 * Tag wechseln per Wischen (1.66.0, zuerst in der Overview): Nach links wischen = nächster Tag, nach
 * rechts = voriger Tag. Der Inhalt folgt dem Finger, gleitet hinaus und der neue Tag gleitet von der
 * anderen Seite herein. Die Scrollhöhe bleibt erhalten (`rerender` hält sie), man sieht also den neuen
 * Tag an derselben Stelle.
 *
 * Eine Seite macht mit, indem ihr `<main>` `data-day-swipe="<schlüssel>"` trägt; zu jedem Schlüssel
 * gehört ein Eintrag in `handlers` mit `canShift(delta)` (false z. B. bei „vor“ am heutigen Tag – dann
 * federt der Inhalt nur zurück) und `shift(delta)`.
 *
 * Kein Wischen, wenn die Berührung in einem Eingabefeld, einem waagrecht scrollbaren Bereich (Tabellen,
 * Reiter, Diagramme mit Scroll) oder einem Element mit `data-no-swipe` beginnt, und nicht am Rand
 * (Systemgeste „zurück“).
 */

const EDGE = 18; // px am Bildschirmrand frei lassen
const LOCK = 12; // px Bewegung, bis die Richtung feststeht
const DISTANCE = 0.22; // Anteil der Breite, ab dem gewechselt wird
const FLICK = 0.45; // px/ms: kurzer schneller Wisch reicht auch
const DURATION = 180; // ms

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function blocked(target, main) {
  for (let el = target; el && el !== main; el = el.parentElement) {
    if (el.matches?.("input, textarea, select, [contenteditable], [data-no-swipe]")) return true;
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
  }
  return false;
}

/**
 * @param {Record<string, { canShift: (delta: number) => boolean, shift: (delta: number) => void }>} handlers
 * @param {() => void} rerender – neu zeichnen und Scrollhöhe halten
 */
export function initDaySwipe(handlers, rerender) {
  let g = null; // laufende Geste

  const mainOf = (t) => t?.closest?.("main[data-day-swipe]");

  document.addEventListener(
    "touchstart",
    (ev) => {
      g = null;
      if (ev.touches.length !== 1) return;
      const main = mainOf(ev.target);
      if (!main || !handlers[main.dataset.daySwipe]) return;
      const t = ev.touches[0];
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
      if (blocked(ev.target, main)) return;
      g = { main, key: main.dataset.daySwipe, x: t.clientX, y: t.clientY, t: performance.now(), dx: 0, mode: null };
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (ev) => {
      if (!g || ev.touches.length !== 1) return;
      const t = ev.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.mode) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
        g.mode = Math.abs(dx) > Math.abs(dy) * 1.4 ? "x" : "y";
        if (g.mode === "x") g.main.style.transition = "none";
      }
      if (g.mode !== "x") return;
      ev.preventDefault(); // nicht gleichzeitig senkrecht scrollen
      g.dx = dx;
      const ok = handlers[g.key].canShift(dx < 0 ? 1 : -1);
      if (!reduceMotion()) {
        g.main.style.transform = `translateX(${dx * (ok ? 0.85 : 0.2)}px)`;
        g.main.style.opacity = String(1 - Math.min(0.35, Math.abs(dx) / window.innerWidth));
      }
    },
    { passive: false },
  );

  const reset = (main, animate) => {
    main.style.transition = animate && !reduceMotion() ? `transform ${DURATION}ms ease-out, opacity ${DURATION}ms ease-out` : "none";
    main.style.transform = "";
    main.style.opacity = "";
  };

  document.addEventListener("touchend", () => {
    const cur = g;
    g = null;
    if (!cur || cur.mode !== "x") return;
    const w = window.innerWidth;
    const speed = Math.abs(cur.dx) / Math.max(1, performance.now() - cur.t);
    if (Math.abs(cur.dx) < w * DISTANCE && !(speed > FLICK && Math.abs(cur.dx) > 40)) return reset(cur.main, true);
    const delta = cur.dx < 0 ? 1 : -1; // nach links = nächster Tag
    if (!handlers[cur.key].canShift(delta)) return reset(cur.main, true);
    const finish = () => {
      handlers[cur.key].shift(delta);
      rerender();
      const next = document.querySelector("main[data-day-swipe]");
      if (!next || reduceMotion()) return;
      // neuer Tag kommt von der Seite, zu der gewischt wurde
      next.style.transition = "none";
      next.style.transform = `translateX(${delta > 0 ? w * 0.35 : -w * 0.35}px)`;
      next.style.opacity = "0.4";
      void next.offsetWidth;
      reset(next, true);
    };
    if (reduceMotion()) return finish();
    cur.main.style.transition = `transform ${DURATION * 0.7}ms ease-in, opacity ${DURATION * 0.7}ms ease-in`;
    cur.main.style.transform = `translateX(${delta > 0 ? -w : w}px)`;
    cur.main.style.opacity = "0";
    setTimeout(finish, DURATION * 0.7);
  });

  document.addEventListener("touchcancel", () => {
    if (g?.mode === "x") reset(g.main, true);
    g = null;
  });
}
