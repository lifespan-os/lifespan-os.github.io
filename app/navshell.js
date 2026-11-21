// LIFESPAN OS Mobil – Menü, untere Leiste, Tastatur und Neuzeichnen mit Bildlauf (aus app.js, 1.74.0).
import * as N from "./nutrition.js";
import { bodyOpenEntry } from "./body.js";
import { drawerHtml, QUICK, quickSheetHtml, SECTIONS, tabbarHtml } from "./nav.js";
import { today as todayIso } from "./diary.js";
import * as DP from "./devprefs.js";
import { app, esc, go, render, S } from "./appbase.js";
import { actions } from "./appactions.js";

// ------------------------------------------------------------------ Menü (wie die linke Leiste am PC)

export const navRoot = document.createElement("div");

navRoot.id = "nav-root";

document.body.appendChild(navRoot);

/** Ansichten mit eigener Leiste unten (Training läuft, Speichern): dort keine Hauptleiste. */
export const NO_TABBAR = new Set(["setup", "workout", "picker", "machine", "finish", "supp-intake", "fast-entry", "account-new"]);

export function renderNav() {
  if (!S.catalog) {
    navRoot.innerHTML = "";
    document.body.classList.remove("has-tabbar");
    return;
  }
  const bar = !NO_TABBAR.has(S.view) && !app.querySelector(".bottom");
  navRoot.innerHTML =
    drawerHtml({ view: S.view, arg: S.arg, open: S.menuOpen, esc, back: S.logEdit?.back ?? null }) +
    (bar ? tabbarHtml({ view: S.view, arg: S.arg, back: S.logEdit?.back ?? null, quickOpen: Boolean(S.quickOpen), slots: S.prefs.barSlots, sub: S.subMenu }) + quickSheetHtml(Boolean(S.quickOpen), DP.quickItems(QUICK, S.prefs.quick)) : "");
  document.body.classList.toggle("has-tabbar", bar);
  // Mit Knopf unten entfällt der Reiter-Knopf oben links
  document.body.classList.toggle("has-submenu", Boolean(bar && S.subMenu));
  document.body.classList.toggle("menu-open", Boolean(S.menuOpen || (bar && S.quickOpen)));
}

/** Schnell erfassen (Design C): Ziel je Eintrag. */
export function quickGo(id) {
  S.quickOpen = false;
  S.menuOpen = false;
  const t = todayIso();
  if (id === "meal") {
    const f = S.food;
    if (f) {
      f.mealType = N.suggestMealType(new Date().getHours());
      f.trackDate = t;
      f.returnTo = "diary";
    }
    S.diaryDate = t;
    return go(f ? "food" : "diary");
  }
  if (id === "water") {
    S.diaryDate = t;
    return go("diary");
  }
  if (id === "training") S.trainTab = "workouts";
  if (id === "checkin") {
    S.bodyTab = "checkins";
    return go("body");
  }
  if (id === "body") return bodyOpenEntry(null);
  if (id === "caffeine") S.icTab = "widgets";
  if (id === "todo") S.todoDate = t;
  const view = { body: "body", training: "training", sleep: "sleep", recovery: "recovery", todo: "todos", caffeine: "icoach" }[id];
  return go(view ?? "home");
}

export function setMenu(open) {
  S.menuOpen = open;
  const drawer = navRoot.querySelector(".drawer");
  if (!drawer) renderNav();
  else {
    // Klassen umschalten statt neu zeichnen – so gleitet das Menü herein
    drawer.classList.toggle("open", open);
    navRoot.querySelector(".drawer-backdrop")?.classList.toggle("open", open);
    drawer.toggleAttribute("inert", !open);
    if (open) drawer.removeAttribute("aria-hidden");
    else drawer.setAttribute("aria-hidden", "true");
    document.body.classList.toggle("menu-open", open);
  }
  document.querySelector(".menu-btn")?.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) navRoot.querySelector(".drawer__item.active, .drawer__item")?.focus();
}

navRoot.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  if (el.dataset.act === "menu-close") return setMenu(false);
  if (el.dataset.act === "menu-open-bar") {
    S.quickOpen = false;
    return setMenu(true);
  }
  if (el.dataset.act === "quick-open" || el.dataset.act === "quick-close") {
    S.quickOpen = el.dataset.act === "quick-open" ? !S.quickOpen : false;
    return renderNav();
  }
  if (el.dataset.act === "quick-go") return quickGo(el.dataset.arg);
  // Untermenü-Knopf (1.32.0): Fach mit den Reitern der Seite
  if (el.dataset.act === "tabs-fold") {
    S.quickOpen = false;
    return actions["tabs-fold"](el);
  }
  if (el.dataset.act === "tabbar-go") {
    S.menuOpen = false;
    S.quickOpen = false;
    const id = el.dataset.arg;
    if (id === "training") S.trainTab = "workouts";
    if (id === "nutrition") S.diaryDate = S.diaryDate ?? todayIso();
    const sec = SECTIONS.find((x) => x.id === id);
    return go(sec?.view ?? "home");
  }
  if (el.dataset.act === "menu-go") {
    S.menuOpen = false;
    const sec = SECTIONS.find((x) => x.id === el.dataset.arg);
    return sec?.view ? go(sec.view) : go("pc-only", el.dataset.arg);
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && S.menuOpen) setMenu(false);
  if (ev.key === "Escape" && S.quickOpen) {
    S.quickOpen = false;
    renderNav();
  }
});

/**
 * Grundansicht (1.40.0): Die App vergrößert nie (index.html: „maximum-scale=1“ – iOS zoomt beim
 * Antippen eines Felds nicht mehr hinein, das nächste Feld ist direkt antippbar). Nach dem Schließen
 * der Tastatur bzw. dem Verlassen eines Felds rastet die Ansicht wieder ein: keine seitliche
 * Verschiebung, Kopf und untere Leiste an ihrem Platz (iOS lässt sonst manchmal einen Versatz stehen).
 */
export const isField = (el) => el?.matches?.("input, textarea, select");

export function settleViewport() {
  if (isField(document.activeElement)) return;
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo(0, Math.min(window.scrollY, max));
}

document.addEventListener("focusout", (ev) => {
  if (!isField(ev.target)) return;
  setTimeout(settleViewport, 80);
});

{
  // Tastatur zu: sichtbare Höhe wächst wieder auf die volle Höhe
  let lastH = window.visualViewport?.height ?? window.innerHeight;
  window.visualViewport?.addEventListener("resize", () => {
    const h = window.visualViewport.height;
    if (h > lastH + 80) setTimeout(settleViewport, 50);
    lastH = h;
  });
}

/**
 * Tastatur offen (1.59.0, Wunsch des Nutzers): Solange ein Eingabefeld den Fokus hat, bleibt die
 * untere Menüleiste ausgeblendet – sie würde sonst über der Tastatur stehen und der Auswahl Platz
 * nehmen. Die Lebensmittelsuche springt beim Antippen ganz nach oben (unter den Kopf), darunter ist
 * genug Platz, damit das auch am Seitenende geht.
 */
export const TYPING = /^(text|search|number|email|tel|url|password)$/;

export const typingField = (el) => el?.matches?.("textarea") || (el?.matches?.("input") && TYPING.test(el.type || "text"));

document.addEventListener("focusin", (ev) => {
  if (!typingField(ev.target)) return;
  document.body.classList.add("is-typing");
  const search = ev.target.id === "food-q" || ev.target.id === "dish-q" ? ev.target.closest(".card") : null;
  if (search) {
    document.body.classList.add("is-searching");
    // nach dem Aufgehen der Tastatur (Ansicht wird kleiner) ausrichten
    const align = () => search.scrollIntoView({ block: "start" });
    requestAnimationFrame(align);
    setTimeout(align, 320);
  }
});

document.addEventListener("focusout", (ev) => {
  if (!typingField(ev.target)) return;
  setTimeout(() => {
    if (typingField(document.activeElement)) return;
    document.body.classList.remove("is-typing");
    if (!(ev.target.value ?? "").trim()) document.body.classList.remove("is-searching");
  }, 60);
});

/** Höhe des Kopfs als CSS-Variable – Sprungziele landen darunter statt dahinter (1.40.0). */
export function measureHead() {
  const h = document.querySelector(".top")?.offsetHeight ?? 0;
  document.documentElement.style.setProperty("--head-h", `${h}px`);
}

window.addEventListener("resize", measureHead);

export function rerenderKeepScroll() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}
