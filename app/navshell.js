// LIFESPAN OS Mobil – Menü, untere Leiste, Tastatur und Neuzeichnen mit Bildlauf (aus app.js, 1.74.0).
import * as N from "./nutrition.js";
import { bodyOpenEntry } from "./body.js";
import { drawerHtml, QUICK, quickSheetHtml, SECTIONS, tabbarHtml } from "./nav.js";
import { oneInputHtml, oneInputInput } from "./oneinput.js";
import { today as todayIso } from "./diary.js";
import * as DP from "./devprefs.js";
import { app, esc, go, render, S } from "./appbase.js";
import { actions } from "./appactions.js";
import { applyPageMarks, hrtAlarmHtml, hrtStateNow, openHrtAlarms, markTitle, marksOf, openItemsNow, phoneTab, resetOpenItems } from "./openitems.js";

// ------------------------------------------------------------------ Menü (wie die linke Leiste am PC)

export const navRoot = document.createElement("div");

navRoot.id = "nav-root";

document.body.appendChild(navRoot);

/** Ansichten mit eigener Leiste unten (Training läuft, Speichern): dort keine Hauptleiste. */
export const NO_TABBAR = new Set(["setup", "workout", "picker", "machine", "finish", "supp-intake", "fast-entry", "account-new"]);

/**
 * Offene Punkte des Tages je Bereich (1.109.0): Map Bereich → { count, title, tab } für die orangen
 * Punkte in Menü und unterer Leiste.
 */
function navMarks() {
  const items = openItemsNow();
  const out = new Map();
  for (const id of new Set(items.map((i) => i.section))) {
    const list = marksOf(items, id);
    if (list.length) out.set(id, { count: list.length, title: markTitle(list), tab: phoneTab(list[0]) });
  }
  // Hormongabe seit 6 Stunden überfällig: „Superhuman“ leuchtet orange (1.113.0)
  const stage = hrtStateNow().stage;
  const sh = out.get("superhuman");
  if (sh && (stage === "glow" || stage === "alarm")) sh.alert = true;
  return out;
}

let lastMarks = "";
const marksKey = (m) => `${[...m.entries()].map(([id, x]) => `${id}:${x.count}${x.alert ? "!" : ""}`).join("|")}#${openHrtAlarms().length}`;

export function renderNav() {
  if (!S.catalog) {
    navRoot.innerHTML = "";
    document.body.classList.remove("has-tabbar");
    return;
  }
  const bar = !NO_TABBAR.has(S.view) && !app.querySelector(".bottom");
  // Nach jeder Änderung (Neuzeichnen) neu berechnen
  resetOpenItems();
  const marks = navMarks();
  lastMarks = marksKey(marks);
  navRoot.innerHTML =
    drawerHtml({ view: S.view, arg: S.arg, open: S.menuOpen, esc, back: S.logEdit?.back ?? null, marks }) +
    (bar ? tabbarHtml({ view: S.view, arg: S.arg, back: S.logEdit?.back ?? null, quickOpen: Boolean(S.quickOpen), slots: S.prefs.barSlots, sub: S.subMenu, marks }) + quickSheetHtml(Boolean(S.quickOpen), DP.quickItems(QUICK, S.prefs.quick), oneInputHtml()) : "") +
    // Warnung: Hormongabe seit 12 Stunden überfällig (1.113.0)
    hrtAlarmHtml(esc);
  document.body.classList.toggle("has-tabbar", bar);
  // Mit Knopf unten entfällt der Reiter-Knopf oben links
  document.body.classList.toggle("has-submenu", Boolean(bar && S.subMenu));
  document.body.classList.toggle("menu-open", Boolean(S.menuOpen || (bar && S.quickOpen)));
  // Orange Punkte auch auf der Seite (1.143.0): Knöpfe/Überschriften, wo heute noch etwas fehlt
  applyPageMarks(app, openItemsNow());
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
  if (id === "todo") {
    // To-do (1.145.0): Checklisten mit der To-do-Liste oben, Feld „Neue Aufgabe“ im Blick
    S.todoDate = t;
    go("todos");
    requestAnimationFrame(() => document.getElementById("todos-card")?.scrollIntoView({ block: "start" }));
    return;
  }
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
  // „Eingabe für alles“ in der Schnellerfassung (1.141.0)
  if (el.dataset.act === "one-save") return actions["one-save"](el);
  // Untermenü-Knopf (1.32.0): Fach mit den Reitern der Seite
  if (el.dataset.act === "tabs-fold") {
    S.quickOpen = false;
    return actions["tabs-fold"](el);
  }
  if (el.dataset.act === "tabbar-go") {
    S.menuOpen = false;
    S.quickOpen = false;
    // Mit orangem Punkt direkt zum Reiter zum Eintragen (wie im Menü)
    if (el.dataset.tab) return actions["menu-go"](el);
    const id = el.dataset.arg;
    if (id === "training") S.trainTab = "workouts";
    if (id === "nutrition") S.diaryDate = S.diaryDate ?? todayIso();
    const sec = SECTIONS.find((x) => x.id === id);
    return go(sec?.view ?? "home");
  }
  // Warnung „Hormongabe überfällig“ (1.113.0)
  if (el.dataset.act === "hrt-alarm-ok" || el.dataset.act === "hrt-alarm-go") return actions[el.dataset.act](el);
  if (el.dataset.act === "menu-go") {
    S.menuOpen = false;
    // Mit orangem Punkt direkt zum Reiter zum Eintragen (z. B. Superhuman → HRT)
    if (el.dataset.tab) return actions["menu-go"](el);
    const sec = SECTIONS.find((x) => x.id === el.dataset.arg);
    return sec?.view ? go(sec.view) : go("pc-only", el.dataset.arg);
  }
});

navRoot.addEventListener("input", (ev) => oneInputInput(ev.target));
navRoot.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target?.dataset?.one === "text") {
    ev.preventDefault();
    if (!navRoot.querySelector('[data-act="one-save"]')?.disabled) void actions["one-save"]();
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
  // Mahlzeit erfassen (1.182.0): das Suchfeld selbst nach oben (Kopf der Karte wird im Suchmodus ausgeblendet)
  const search = ev.target.id === "food-q" || ev.target.id === "dish-q" ? (ev.target.closest(".plt-searchbar") ?? ev.target.closest(".card")) : null;
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

// Offene Punkte (1.109.0): auch ohne Neuzeichnen (z. B. Uhrzeit, Daten vom PC) alle 30 Sekunden
// prüfen; die Leisten werden nur neu gezeichnet, wenn sich etwas geändert hat.
setInterval(() => {
  if (document.hidden || !S.catalog || S.menuOpen || S.quickOpen) return;
  resetOpenItems();
  if (marksKey(navMarks()) !== lastMarks) renderNav();
  else applyPageMarks(app, openItemsNow());
}, 30_000);
