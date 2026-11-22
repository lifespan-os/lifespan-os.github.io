// LIFESPAN OS Mobil – Gemeinsamer Zustand und Grundfunktionen der Handy-App (aus app.js, 1.74.0): Zustand `S`, Formatierung, Meldungen, Speichern, Seitenwechsel `go`, Kopfzeilen.
import * as C from "./core.js";
import * as PR from "./paritydata.js";
import * as store from "./store.js";
import * as N from "./nutrition.js";
import { bodyLeave } from "./body.js";
import * as BD from "./bodydata.js";
import { icon } from "./nav.js";
import * as P from "./pcdb.js";
import * as FT from "./fastdata.js";
import * as SP from "./supplements.js";
import * as GL from "./goals.js";
import * as LG from "./logsdata.js";
import * as TD from "./todosdata.js";
import * as HD from "./healthdata.js";
import * as SD from "./superdata.js";
import * as CD from "./checklistdata.js";
import * as CF from "./caffeinedata.js";
import * as GLD from "./glucosedata.js";
import { LAYOUT_PAGES, layoutEditing, setLayoutEditing } from "./layoutedit.js";
import * as PS from "./pcsettings.js";
import * as DP from "./devprefs.js";
import { introPanel, proButton } from "./infonotes.js";
import * as TR from "./trainingdata.js";
import * as GD from "./gymsdata.js";

export const app = document.getElementById("app");

export const restEl = document.getElementById("rest");

export const toastEl = document.getElementById("toast");

export const S = {
  catalog: null,
  accountId: "", // Konten (1.25.0): "" = Hauptkonto
  accounts: [],
  mainAccountName: null,
  accountForm: null,
  localExercises: [],
  workouts: [], // abgeschlossene Trainings vom Handy
  active: null, // laufendes Training
  prefs: DP.normPrefs({ onlyNumbered: true, keepUnticked: false }),
  pcsettings: PS.emptySync(), // Einstellungen für PC und Handy (1.48.0)
  view: "home",
  arg: null,
  query: "",
  rest: null, // { endsAt, total, label }
  pendingFinish: null,
  food: null, // Ernährung (siehe food.js)
};

// ------------------------------------------------------------------ Hilfen

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const fmtDate = (iso) => {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};

export const fmtDateTime = (iso) => {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${fmtDate(C.localDate(d))}, ${C.localTime(d)} Uhr`;
};

export const fmtSec = (s) => {
  const a = Math.max(0, Math.round(s));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
};

/** Meldung oben; mit `undo` (Funktion) zusätzlich ein Knopf „Rückgängig“ (1.55.0, 6 Sekunden). */
export function toast(text, err = false, undo = null) {
  toastEl.textContent = text;
  toastEl.className = err ? "toast err" : "toast";
  if (typeof undo === "function") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast__undo";
    b.textContent = "Rückgängig";
    b.addEventListener("click", async () => {
      toastEl.hidden = true;
      clearTimeout(toast.t);
      try {
        await undo();
        toast("Rückgängig gemacht.");
      } catch (e) {
        toast(e.message || "Rückgängig ging nicht.", true);
      }
    });
    toastEl.append(" ", b);
  }
  toastEl.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (toastEl.hidden = true), err ? 5000 : undo ? 6000 : 2200);
}

export let saveTimer = null;

export function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}

export async function saveNow() {
  clearTimeout(saveTimer);
  try {
    if (S.active) S.active.updatedAt = C.isoNow();
    await store.set("active", S.active);
    await store.set("workouts", S.workouts);
    await store.set("localExercises", S.localExercises);
    await store.set("prefs", S.prefs);
  } catch (e) {
    toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

/** Katalog vom PC plus Änderungen im Training am Handy (Pläne, Übungen, Sportarten, NEAT, Check-Ins). */
export function refreshCatalog() {
  // 1.90.0: dazu Lebensstil, Messgrößen, Ziele und Wochenplan vom Handy (paritydata.js)
  S.catalog = S.catalogRaw ? PR.overlayCatalog(TR.overlayCatalog(S.catalogRaw, S.train, C.plansFromRows), S.parity) : null;
}

export const exById = () => new Map(C.allExercises(S.catalog, S.localExercises).map((e) => [e.id, e]));

export const machineById = () => new Map(S.catalog.machines.map((m) => [m.id, m]));

export const unsent = () => S.workouts.filter((w) => w.status === "done" && !w.exported);

export const unsentFood = () => (S.food ? N.unsentCount(S.food.local) : 0) + P.unsentWater(S.water) + SP.unsentSupp(S.supp) + FT.unsentFast(S.fast);

// Körperwerte plus Schlaf und Regeneration (gehen zusammen in die Datei „Körperwerte“, 1.7.0)
export const unsentBodyCount = () => (S.body ? BD.unsentBody(S.body.local) : 0) + LG.unsentLogs(S.logs) + TD.unsentTodos(S.todos) + HD.unsentHealth(S.health) + SD.unsentSuper(S.super) + CD.unsentChecklists(S.checklists) + CF.unsentCaffeine(S.caffeine) + GLD.unsentGlucose(S.glucose) + TR.unsentTrain(S.train) + GL.unsentGoals(S.goals) + PS.unsentSync(S.pcsettings) + GD.unsentGyms(S.gyms) + PR.unsentParity(S.parity);

export function go(view, arg = null) {
  // Seite anpassen (1.48.0): Bearbeiten endet, wenn eine andere Seite geöffnet wird
  const editing = layoutEditing();
  if (editing && LAYOUT_PAGES.find(([k]) => k === editing)?.[1] !== view) setLayoutEditing(null);
  // „Werte erfassen“ verlassen: Geändertes sofort sichern (1.40.0)
  if (S.view === "body-entry" && view !== "body-entry") bodyLeave();
  if (view === "food-review" && S.view !== "food-review") S.reviewFrom = S.view === "send" ? "send" : S.view === "pending" ? "pending" : S.view === "food" ? "food" : "home";
  if (view !== S.view && view !== "detail") S.trainNotice = null;
  S.view = view;
  S.arg = arg;
  render();
  // Nach dem Eintragen aus dem Tagebuch: zur Mahlzeit springen statt an den Anfang (1.70.1)
  const mealKey = view === "diary" ? S.diaryFocus : null;
  S.diaryFocus = null;
  const slot = mealKey ? [...document.querySelectorAll(".meal-slot[data-meal-key]")].find((el) => el.dataset.mealKey === mealKey) : null;
  if (slot) slot.scrollIntoView({ block: "start" });
  else window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ Ansichten

/** Knopf für das Menü (wie die linke Leiste am PC). */
export const menuButton = () =>
  S.catalog ? `<button class="menu-btn" data-act="menu-open" aria-label="Menü öffnen" aria-expanded="${S.menuOpen ? "true" : "false"}">${icon("menu")}</button>` : "";

export function header(title, { back = null, sub = "" } = {}) {
  return `<header class="top"><div class="wrap">
    ${menuButton()}
    ${back ? `<button class="back back--icon" data-go="${back}" aria-label="Zurück">‹</button>` : ""}
    <h1${title.length > 11 ? ' class="h1--long"' : ""}>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</h1>
  </div>${proButton(title)}${introPanel(title)}</header>`;
}

export function brandHeader(hero = "") {
  return `<header class="top${hero ? " top--hero" : ""}"><div class="wrap">
    ${menuButton()}
    <div class="brand"><img src="icons/icon-192.png" alt=""><div><b>LIFESPAN OS</b><small class="brand__date">${esc(new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }))}</small></div></div>
    ${S.catalog ? `<button class="top__search" data-act="gs-open" aria-label="Suchen">${icon("search")}</button>` : `<button class="back" data-go="help">Hilfe</button>`}
  </div>${hero ? `<div class="wrap top__hero">${hero}</div>${proButton("Overview", { hero: true })}${introPanel("Overview")}` : ""}</header>`;
}

let renderView = () => {};
/** Aktuelle Ansicht zeichnen – app.js meldet seine Funktion mit `setRender` an (1.74.0). */
export function render() {
  renderView();
}
export function setRender(fn) {
  renderView = fn;
}
