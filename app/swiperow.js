// LIFESPAN OS Mobil – Zeilen wischen (1.94.0, zuerst in „Offene Daten“):
// Nach links wischen führt die Aktion der Zeile aus (`data-swipe-left` + `data-swipe-arg`, z. B.
// Verwerfen); dabei erscheint rot die Beschriftung (`data-swipe-label`). Nach rechts wischen meldet
// die Rubrik (`data-swipe-area` am umgebenden Element) – dort folgt eine Rückfrage. Die Zeile folgt
// dem Finger und federt zurück, wenn der Weg nicht reicht. Senkrechtes Scrollen bleibt möglich.

const LOCK = 10; // px, bis die Richtung feststeht
const DISTANCE = 0.33; // Anteil der Zeilenbreite, ab dem ausgelöst wird
const FLICK = 0.5; // px/ms

/**
 * @param {{ left: (action: string, arg: string, row: HTMLElement) => void, right: (area: string, row: HTMLElement) => void }} on
 */
export function initRowSwipe(on) {
  let g = null;

  document.addEventListener(
    "touchstart",
    (ev) => {
      g = null;
      if (ev.touches.length !== 1) return;
      const row = ev.target.closest?.(".swipe-row");
      if (!row || ev.target.closest("input, textarea, select, a, button.btn")) return;
      const t = ev.touches[0];
      if (t.clientX < 18 || t.clientX > window.innerWidth - 18) return; // Systemgeste „zurück“
      g = { row, body: row.querySelector(".swipe-row__body") ?? row, x: t.clientX, y: t.clientY, t: performance.now(), dx: 0, mode: null };
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (ev) => {
      if (!g) return;
      const t = ev.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.mode) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
        g.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
        if (g.mode === "x") g.row.classList.add("is-swiping");
      }
      if (g.mode !== "x") return;
      ev.preventDefault();
      g.dx = dx;
      g.row.dataset.swipeDir = dx < 0 ? "left" : "right";
      g.body.style.transform = `translateX(${dx}px)`;
    },
    { passive: false },
  );

  const end = () => {
    if (!g) return;
    const { row, body, dx, mode, t } = g;
    g = null;
    if (mode !== "x") return;
    const w = row.getBoundingClientRect().width || 1;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - t);
    const hit = Math.abs(dx) > w * DISTANCE || (speed > FLICK && Math.abs(dx) > 40);
    row.classList.remove("is-swiping");
    body.style.transition = "transform .18s ease";
    if (hit && dx < 0 && row.dataset.swipeLeft) {
      body.style.transform = `translateX(${-w}px)`;
      setTimeout(() => on.left(row.dataset.swipeLeft, row.dataset.swipeArg ?? "", row), 170);
    } else if (hit && dx > 0 && row.closest("[data-swipe-area]")) {
      body.style.transform = "translateX(0)";
      on.right(row.closest("[data-swipe-area]").dataset.swipeArea, row);
    } else body.style.transform = "translateX(0)";
    setTimeout(() => {
      body.style.transition = "";
      delete row.dataset.swipeDir;
    }, 200);
    // Tipp nach dem Wischen nicht als Antippen werten
    const stop = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener("click", stop, { capture: true }), 350);
  };
  document.addEventListener("touchend", end, { passive: true });
  document.addEventListener("touchcancel", end, { passive: true });
}
