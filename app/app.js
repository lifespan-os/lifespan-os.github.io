// LIFESPAN OS Mobil – Oberfläche. Logik in core.js, Speicher in store.js.
import * as C from "./core.js";
import * as store from "./store.js";
import * as N from "./nutrition.js";
import { foodActions, foodChange, foodInput, foodState, initFood, viewDish, viewFood, viewFoodReview } from "./food.js";
import { bodyActions, bodyChange, bodyInput, bodyState, initBody, viewBody, viewBodyEntry, viewBodyMetric } from "./body.js";
import * as BD from "./bodydata.js";
import { SECTIONS, drawerHtml, icon, pcOnlyHtml } from "./nav.js";
import { focusInfo, machineNamesOf } from "./focusinfo.js";
import * as P from "./pcdb.js";
import { buildDb, diaryActions, diaryChange, initDiary, today as todayIso, viewDiary, viewNutritionHistory } from "./diary.js";
import { initOverview, overviewActions, overviewCardsHtml, overviewChange, overviewDayNav } from "./overview.js";
import { initLogs, logsActions, logsChange, logsInput, viewLogEdit, viewRecovery, viewSleep } from "./logs.js";
import * as LG from "./logsdata.js";
import { initInsights, insightsActions, viewInsights } from "./insightsview.js";
import { initTodos, todoActions, todoChange, todoInput, viewTodos } from "./todos.js";
import * as TD from "./todosdata.js";
import { initHealth, healthActions, healthChange, healthInput, viewHealth, viewLabEdit } from "./health.js";
import * as HD from "./healthdata.js";
import { initSuper, superActions, superChange, superInput, viewSuper, viewHrtEdit, viewProtocolEdit, viewSubstanceEdit } from "./super.js";
import * as SD from "./superdata.js";

const app = document.getElementById("app");
const restEl = document.getElementById("rest");
const toastEl = document.getElementById("toast");

const S = {
  catalog: null,
  localExercises: [],
  workouts: [], // abgeschlossene Trainings vom Handy
  active: null, // laufendes Training
  prefs: { onlyNumbered: true, keepUnticked: false },
  view: "home",
  arg: null,
  query: "",
  rest: null, // { endsAt, total, label }
  pendingFinish: null,
  food: null, // Ernährung (siehe food.js)
};

// ------------------------------------------------------------------ Hilfen

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmtDate = (iso) => {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};
const fmtDateTime = (iso) => {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${fmtDate(C.localDate(d))}, ${C.localTime(d)} Uhr`;
};
const fmtSec = (s) => {
  const a = Math.max(0, Math.round(s));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
};

function toast(text, err = false) {
  toastEl.textContent = text;
  toastEl.className = err ? "toast err" : "toast";
  toastEl.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (toastEl.hidden = true), err ? 5000 : 2200);
}

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
async function saveNow() {
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

const exById = () => new Map(C.allExercises(S.catalog, S.localExercises).map((e) => [e.id, e]));
const machineById = () => new Map(S.catalog.machines.map((m) => [m.id, m]));
const unsent = () => S.workouts.filter((w) => w.status === "done" && !w.exported);
const unsentFood = () => (S.food ? N.unsentCount(S.food.local) : 0) + P.unsentWater(S.water);
// Körperwerte plus Schlaf und Regeneration (gehen zusammen in die Datei „Körperwerte“, 1.7.0)
const unsentBodyCount = () => (S.body ? BD.unsentBody(S.body.local) : 0) + LG.unsentLogs(S.logs) + TD.unsentTodos(S.todos) + HD.unsentHealth(S.health) + SD.unsentSuper(S.super);

function go(view, arg = null) {
  if (view === "food-review" && S.view !== "food-review") S.reviewFrom = S.view === "send" ? "send" : S.view === "food" ? "food" : "home";
  S.view = view;
  S.arg = arg;
  render();
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ Ansichten

/** Knopf für das Menü (wie die linke Leiste am PC). */
const menuButton = () =>
  S.catalog ? `<button class="menu-btn" data-act="menu-open" aria-label="Menü öffnen" aria-expanded="${S.menuOpen ? "true" : "false"}">${icon("menu")}</button>` : "";

function header(title, { back = null, sub = "" } = {}) {
  return `<header class="top"><div class="wrap">
    ${menuButton()}
    ${back ? `<button class="back back--icon" data-go="${back}" aria-label="Zurück">‹</button>` : ""}
    <h1>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</h1>
  </div></header>`;
}

function brandHeader() {
  return `<header class="top"><div class="wrap">
    ${menuButton()}
    <div class="brand"><img src="icons/icon-192.png" alt=""><div><b>LIFESPAN OS</b> <small>Mobil</small></div></div>
    ${S.catalog ? "" : `<button class="back" data-go="help">Hilfe</button>`}
  </div></header>`;
}

function viewSetup() {
  return `${brandHeader()}<main class="wrap">
    <h2>Willkommen</h2>
    <p class="muted">Hier erfasst du dein Training im Studio. Alles bleibt auf diesem Gerät, ohne Konto und ohne Cloud. Zuerst brauchst du deine Daten vom PC: Trainingspläne, Maschinen und Übungen.</p>
    <section class="card">
      <h3>So holst du deine Daten aufs Handy</h3>
      <ol class="steps small">
        <li>Am PC in LIFESPAN OS unter <b>Settings</b> einen <b>Export</b> erstellen.</li>
        <li>Die Datei <b>performance-os-export.json</b> in deinen <b>Google-Drive</b>-Ordner kopieren.</li>
        <li>Hier auf <b>„Exportdatei laden“</b> tippen und die Datei in Google Drive auswählen.</li>
      </ol>
      ${fileButton("Exportdatei laden")}
    </section>
    <p class="muted small">Tipp fürs iPhone: Tippe in Safari auf „Teilen“ → „Zum Home-Bildschirm“. Nur so bleiben deine Daten dauerhaft gespeichert.</p>
  </main>`;
}

function fileButton(label) {
  return `<label class="btn primary block" for="file-in">${esc(label)}</label>
    <input id="file-in" type="file" accept=".json,application/json" hidden>`;
}

/**
 * Overview wie am PC (1.6.0): oben das Training am Handy (läuft bzw. starten) und offene
 * Einträge für den PC, darunter die Karten der Desktop-App in deren Anordnung.
 */
function viewHome() {
  const c = S.catalog;
  const open = unsent();
  const a = S.active;
  const offen = open.length + unsentFood() + unsentBodyCount();
  const today = todayIso();
  const date = S.ovDate && S.ovDate < today ? S.ovDate : today;
  let cards;
  if (!c.pc) {
    cards = `<section class="card"><p class="warn">Für die Overview wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Settings „Neue Exportdatei laden“.</p></section>`;
  } else {
    try {
      cards = `${overviewDayNav(date, today)}${overviewCardsHtml(buildDb(), c, date, today)}`;
    } catch (e) {
      console.error(e);
      cards = `<section class="card"><p class="warn">Die Overview konnte nicht berechnet werden: ${esc(e.message)}</p></section>`;
    }
  }
  return `${brandHeader()}<main class="wrap">
    ${
      a
        ? a.editOf
          ? `<section class="card hl"><div class="wo-head"><h3>Bearbeitung: ${esc(a.title)}</h3><span class="tag">${fmtDate(a.date)}</span></div>
            <p class="muted small">${a.exercises.length} Übungen · Änderungen noch nicht gespeichert</p>
            <button class="btn primary block" data-go="workout">Weiter bearbeiten</button></section>`
          : `<section class="card hl"><div class="wo-head"><h3>Training läuft: ${esc(a.title)}</h3><span class="clock" data-clock>${fmtSec((Date.now() - new Date(a.startedAt)) / 1000)}</span></div>
            <p class="muted small">${a.exercises.length} Übungen · gestartet ${esc(C.localTime(new Date(a.startedAt)))} Uhr</p>
            <button class="btn primary block" data-go="workout">Weiter trainieren</button></section>`
        : `<div class="big-actions">
            <button class="btn primary" data-go="plans">Plan starten<small>${c.plans.length ? `${c.plans.length} Trainingspläne` : "Noch keine Pläne am PC angelegt"}</small></button>
            <button class="btn blue" data-act="start-free">Freies Training<small>Maschinen spontan auswählen</small></button>
          </div>`
    }
    ${
      offen
        ? `<section class="card"><div class="wo-head"><h3>An den PC senden</h3><span class="tag">${offen} offen</span></div>
            <p class="muted small">${[
              open.length ? (open.length === 1 ? "1 Training" : `${open.length} Trainings`) : "",
              unsentFood() ? `${unsentFood()} Ernährungseinträge` : "",
              unsentBodyCount() ? `${unsentBodyCount()} Körperwerte, Schlaf-, Regenerations- und To-do-Einträge` : "",
            ]
              .filter(Boolean)
              .join(" und ")} noch nicht am PC.</p>
            <button class="btn block" data-go="send">An den PC senden</button></section>`
        : ""
    }
    ${cards}
    <p class="muted small ov-source">Stand der Daten vom PC: ${fmtDateTime(c.exportedAt)} – plus alles, was du seitdem am Handy erfasst hast. Anordnung der Karten wie am PC (Overview → Übersicht anpassen).</p>
  </main>`;
}

/** Training (wie der Bereich am PC): starten, laufendes Training, letzte Trainings. */
function viewTraining() {
  const c = S.catalog;
  const a = S.active;
  return `${header("Training")}<main class="wrap">
    ${
      a
        ? `<section class="card hl"><div class="wo-head"><h3>${a.editOf ? "Bearbeitung" : "Training läuft"}: ${esc(a.title)}</h3>${
            a.editOf ? `<span class="tag">${fmtDate(a.date)}</span>` : `<span class="clock" data-clock>${fmtSec((Date.now() - new Date(a.startedAt)) / 1000)}</span>`
          }</div>
          <p class="muted small">${a.exercises.length} Übungen</p>
          <button class="btn primary block" data-go="workout">${a.editOf ? "Weiter bearbeiten" : "Weiter trainieren"}</button></section>`
        : `<div class="big-actions">
            <button class="btn primary" data-go="plans">Plan starten<small>${c.plans.length ? `${c.plans.length} Trainingspläne` : "Noch keine Pläne am PC angelegt"}</small></button>
            <button class="btn blue" data-act="start-free">Freies Training<small>Maschinen spontan auswählen</small></button>
          </div>`
    }
    ${
      S.workouts.length
        ? `<section class="card"><h3>Letzte Trainings auf dem Handy</h3><div class="list">
            ${S.workouts
              .slice()
              .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
              .slice(0, 20)
              .map(
                (w) => `<button class="item" data-go="detail" data-arg="${w.id}"><span class="main"><b>${esc(w.title)}</b>
                  <span class="muted small">${fmtDate(w.date)} · ${w.exercises.length} Übungen · ${C.fmtNum(C.volumeKg(w), 0)} kg</span></span>
                  <span class="tag">${w.exported ? "am PC" : "offen"}</span></button>`,
              )
              .join("")}</div></section>`
        : ""
    }
    ${S.workouts.length ? "" : `<section class="card"><p class="empty">Noch keine Trainings auf dem Handy.</p></section>`}
  </main>`;
}

/** Settings (wie am PC): Daten vom PC, an den PC senden, Hilfe. */
function viewSettings() {
  const c = S.catalog;
  const total = unsent().length + unsentFood() + unsentBodyCount();
  return `${header("Settings")}<main class="wrap">
    <section class="card">
      <h3>Daten vom PC</h3>
      <p class="muted small">Stand: ${fmtDateTime(c.exportedAt)} · ${c.machines.length.toLocaleString("de-DE")} Maschinen · ${c.exercises.length} Übungen · ${c.plans.length} Pläne</p>
      ${fileButton("Neue Exportdatei laden")}
    </section>
    <section class="card">
      <div class="wo-head"><h3>An den PC senden</h3><span class="tag">${total} offen</span></div>
      <p class="muted small">Trainings, Lebensmittel und Körperwerte als Dateien für den Import am PC (Settings → Daten importieren → „Abgleichen“).</p>
      <button class="btn block" data-go="send">An den PC senden</button>
    </section>
    <section class="card">
      <h3>Hilfe</h3>
      <p class="muted small">Version ${esc(C.MOBILE_VERSION)} · Bedienung, Datenschutz und Datenaustausch.</p>
      <button class="btn block" data-go="help">Hilfe öffnen</button>
    </section>
  </main>`;
}

/** Bereich, den es bisher nur am PC gibt. */
function viewPcOnly() {
  const sec = SECTIONS.find((x) => x.id === S.arg) ?? SECTIONS[0];
  return `${header(sec.label)}<main class="wrap">${pcOnlyHtml(sec.id, esc)}</main>`;
}

function viewPlans() {
  const plans = S.catalog.plans;
  return `${header("Plan starten", { back: "home" })}<main class="wrap">
    ${
      plans.length
        ? plans
            .map(
              (p) => `<section class="card"><h3>${esc(p.row.name)}</h3><div class="list">
              ${p.days
                .map(
                  (d) => `<button class="item" data-act="start-plan" data-arg="${d.row.id}"><span class="main"><b>${esc(d.row.name)}</b>
                    <span class="muted small">${d.exercises.length} Übungen</span></span><span class="chev">›</span></button>`,
                )
                .join("")}</div></section>`,
            )
            .join("")
        : `<p class="empty">Noch keine Trainingspläne. Lege sie am PC an und lade danach eine neue Exportdatei.</p>`
    }
  </main>`;
}

function exLabel(ex, machines) {
  const m = ex?.machine_id ? machines.get(ex.machine_id) : null;
  const nr = m?.own_number || m?.gym_number || ex?.equipment || null;
  return { name: ex?.name ?? "Unbekannte Übung", nr, m };
}

function lastText(last, cardio) {
  if (!last?.sets?.length) return "";
  const parts = last.sets
    .filter((s) => !s.isWarmup)
    .map((s) =>
      cardio
        ? [s.durationSeconds ? `${Math.round(s.durationSeconds / 60)} min` : "", s.distanceM ? `${C.fmtNum(s.distanceM / 1000)} km` : ""].filter(Boolean).join(" ")
        : `${s.reps ?? "–"}×${s.weightKg !== null ? C.fmtNum(s.weightKg) : "–"}${C.usedProfiles(s.rp).length ? ` (${C.describeProfiles(s.rp)})` : ""}`,
    );
  return `<p class="last">Letztes Mal (${fmtDate(last.date)}): <b>${esc(parts.join(" · ") || "–")}</b>${cardio ? "" : " kg"}</p>`;
}

function viewWorkout() {
  const w = S.active;
  if (!w) return viewHome();
  const exs = exById();
  const machines = machineById();
  const edit = !!w.editOf;
  const sub = edit
    ? `${fmtDate(w.date)} · bearbeiten`
    : `${fmtDate(w.date)} · seit ${C.localTime(new Date(w.startedAt))} Uhr`;
  return `${header(w.title, { back: "home", sub })}<main class="wrap">
    <div class="wo-head"><span class="muted small">${w.exercises.length} Übungen · ${C.fmtNum(C.volumeKg(w), 0)} kg Volumen</span>${
      edit ? `<span class="tag">Bearbeitung</span>` : `<span class="clock" data-clock>${fmtSec((Date.now() - new Date(w.startedAt)) / 1000)}</span>`
    }</div>
    ${w.exercises.map((we, i) => exerciseCard(we, i, exs, machines)).join("")}
    <button class="btn block" data-go="picker">+ Übung oder Maschine hinzufügen</button>
    <button class="btn danger block" data-act="discard">${edit ? "Änderungen verwerfen" : "Training verwerfen"}</button>
  </main>
  <div class="bottom"><div class="inner"><button class="btn primary" data-go="finish">${edit ? "Änderungen speichern" : "Training beenden"}</button></div></div>`;
}

/**
 * Nur die aktuelle Übung ist aufgeklappt (1.4.1): die erste mit offenen Sätzen bzw. die zuletzt
 * hinzugefügte; von Hand auf- oder zugeklappte Übungen bleiben so, bis die aktuelle wechselt.
 */
const exComplete = (e) => e.sets.length > 0 && e.sets.every((x) => x.isDone);
/** Wie am PC (domain/workoutFocus.ts): zuletzt begonnene offene Übung, sonst die nächste offene danach, sonst die erste offene. */
function focusExId(w) {
  if (w.focusEx && w.exercises.some((e) => e.id === w.focusEx)) return w.focusEx;
  const list = w.exercises;
  let started = -1;
  list.forEach((e, i) => {
    if (e.sets.some((x) => x.isDone)) started = i;
  });
  if (started >= 0 && !exComplete(list[started])) return list[started].id;
  return (list.slice(started + 1).find((e) => !exComplete(e)) ?? list.find((e) => !exComplete(e)))?.id ?? null;
}
function isOpen(w, we) {
  const manual = S.exOpen?.[we.id];
  return manual ?? we.id === focusExId(w);
}
function setFocus(w, id) {
  w.focusEx = id;
  S.exOpen = {};
}

function exerciseCard(we, i, exs, machines) {
  const ex = exs.get(we.exerciseId);
  const { name, nr, m } = exLabel(ex, machines);
  const cardio = ex?.category === "cardio";
  const last = C.lastSessionFor(S.catalog, S.workouts, we.exerciseId, S.active.id);
  const st = we.settings || C.emptySettings();
  const open = isOpen(S.active, we);
  const done = we.sets.filter((x) => x.isDone).length;
  const head = `<button class="ex-head ex-toggle" data-act="toggle-ex" data-we="${we.id}" aria-expanded="${open}">
      <span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span>
      <span class="main"><b>${esc(name)}</b><span class="muted small">${esc([m?.manufacturer, ex?.muscle_group].filter(Boolean).join(" · "))}</span></span>
      <span class="ex-progress${we.sets.length && done === we.sets.length ? " all" : ""}">${done}/${we.sets.length}</span>
      <span class="chev" aria-hidden="true">${open ? "▾" : "▸"}</span>
    </button>`;
  if (!open) {
    return `<section class="ex collapsed" id="ex-${we.id}">${head}${we.notes ? `<p class="ex-note-line muted small">📝 ${esc(we.notes)}</p>` : ""}</section>`;
  }
  return `<section class="ex" id="ex-${we.id}">
    ${head}
    ${lastText(last, cardio)}
    <details class="settings"${Object.values(st).some((v) => v) ? "" : ""}>
      <summary>Geräteeinstellungen${Object.values(st).some((v) => v) ? `: ${esc(Object.entries(C.SETTING_LABELS).filter(([k]) => st[k]).map(([k, l]) => `${l} ${st[k]}`).join(", "))}` : ""}</summary>
      <div class="settings-grid">
        ${Object.entries(C.SETTING_LABELS)
          .map(
            ([k, l]) => `<div class="field"><label for="st-${we.id}-${k}">${l}</label>
            <input id="st-${we.id}-${k}" type="text" maxlength="40" value="${esc(st[k] ?? "")}" data-we="${we.id}" data-setting="${k}"></div>`,
          )
          .join("")}
        <div class="field"><label for="st-${we.id}-grip">Griffstellung</label>
          <select id="st-${we.id}-grip" data-we="${we.id}" data-setting="gripPosition">
            <option value="">–</option>
            ${Object.entries(C.GRIP_LABELS).map(([k, l]) => `<option value="${k}"${st.gripPosition === k ? " selected" : ""}>${l}</option>`).join("")}
          </select></div>
        <div class="field"><label for="rest-${we.id}">Pause (Sekunden)</label>
          <input id="rest-${we.id}" type="text" inputmode="numeric" value="${we.restSeconds ?? ""}" data-we="${we.id}" data-field="restSeconds"></div>
      </div>
    </details>
    ${cardio ? "" : profilePicker(we, ex)}
    <details class="settings ex-notes"${we.notes ? " open" : ""}>
      <summary>Notiz zur Übung${we.notes ? "" : " (optional)"}</summary>
      <textarea id="note-${we.id}" rows="2" maxlength="500" placeholder="z. B. Sitz zu tief, nächstes Mal mehr Gewicht" data-we="${we.id}" data-field="notes">${esc(we.notes ?? "")}</textarea>
    </details>
    <div class="set-head${cardio ? " cardio" : ""}"><span>#</span>${cardio ? "<span>Minuten</span><span>km</span>" : "<span>kg</span><span>Wdh.</span><span>RPE</span>"}<span>✓</span></div>
    <div class="sets">
      ${we.sets.map((s, si) => setRow(we, s, si, cardio, cardio ? [] : C.visibleProfiles(we, ex))).join("")}
    </div>
    <div class="ex-foot">
      <button class="btn sm" data-act="add-set" data-we="${we.id}">+ Satz</button>
      <button class="btn sm ghost" data-act="move-up" data-we="${we.id}" ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="btn sm danger" data-act="remove-ex" data-we="${we.id}">Entfernen</button>
    </div>
  </section>`;
}

function profilePicker(we, ex) {
  const vis = C.visibleProfiles(we, ex);
  const locked = new Set(C.PROFILE_KEYS.filter((k) => we.sets.some((s) => s.rp?.[k] !== null && s.rp?.[k] !== undefined)));
  const both = vis.includes("conc") && vis.includes("ecc");
  return `<details class="settings resist"${vis.length ? " open" : ""}>
    <summary>Widerstand${vis.length ? `: ${esc(vis.map((k) => C.PROFILES.find((p) => p.key === k).short).join(", "))}` : ""}</summary>
    <div class="chips">${C.PROFILES.map(
      (p) => `<button class="chip${vis.includes(p.key) ? " on" : ""}" data-act="toggle-profile" data-we="${we.id}" data-arg="${p.key}" ${locked.has(p.key) ? 'data-locked="1"' : ""} title="${esc(p.label)}">${esc(p.short)}</button>`,
    ).join("")}</div>
    <p class="muted small">${vis.length ? "Sobald Profilgewichte eingetragen sind, ist das Gewicht ihre Summe." : "Profil wählen, um das Gewicht in Profile aufzuteilen."}${both ? " " + esc(C.CONC_ECC_RULE) : ""}</p>
  </details>`;
}

function setRow(we, s, si, cardio, profiles = []) {
  const id = `${we.id}-${s.id}`;
  const warmIdx = we.sets.slice(0, si + 1).filter((x) => !x.isWarmup).length;
  const idx = s.isWarmup ? `<span class="idx w">W</span>` : `<span class="idx">${warmIdx}</span>`;
  const inputs = cardio
    ? `<input id="d-${id}" type="text" inputmode="decimal" placeholder="min" value="${s.durationSeconds ? C.fmtNum(s.durationSeconds / 60) : ""}" data-we="${we.id}" data-set="${s.id}" data-f="durationMin" aria-label="Dauer in Minuten">
       <input id="k-${id}" type="text" inputmode="decimal" placeholder="km" value="${s.distanceM !== null ? C.fmtNum(s.distanceM / 1000, 3) : ""}" data-we="${we.id}" data-set="${s.id}" data-f="distanceKm" aria-label="Strecke in km">`
    : `<input id="w-${id}" type="text" inputmode="decimal" placeholder="kg" value="${C.fmtNum(C.profileTotal(s.rp) ?? s.weightKg)}" data-we="${we.id}" data-set="${s.id}" data-f="weightKg" aria-label="Gewicht in kg"${C.profileTotal(s.rp) !== null ? ' readonly class="sum" title="Summe der Profilgewichte"' : ""}>
       <input id="r-${id}" type="text" inputmode="numeric" placeholder="Wdh." value="${s.reps ?? ""}" data-we="${we.id}" data-set="${s.id}" data-f="reps" aria-label="Wiederholungen">
       <input id="p-${id}" class="rpe" type="text" inputmode="decimal" placeholder="–" value="${C.fmtNum(s.rpe, 1)}" data-we="${we.id}" data-set="${s.id}" data-f="rpe" aria-label="RPE">`;
  return `<div class="set${cardio ? " cardio" : ""}${s.isDone ? " done" : ""}">${idx}${inputs}
      <button class="check${s.isDone ? " on" : ""}" data-act="toggle-done" data-we="${we.id}" data-set="${s.id}" aria-label="Satz abhaken" aria-pressed="${s.isDone}">✓</button>
    </div>
    ${
      profiles.length
        ? `<div class="rp-grid">${profiles
            .map((k) => {
              const p = C.PROFILES.find((x) => x.key === k);
              return `<label class="rp"><span>${esc(p.short)}</span><input id="rp-${id}-${k}" type="text" inputmode="decimal" placeholder="kg" value="${C.fmtNum(s.rp?.[k])}" data-we="${we.id}" data-set="${s.id}" data-f="rp:${k}" aria-label="${esc(p.label)} in kg"></label>`;
            })
            .join("")}</div>`
        : ""
    }
    <div class="set-opts">
      <button class="chip${s.isWarmup ? " on" : ""}" data-act="flag" data-flag="isWarmup" data-we="${we.id}" data-set="${s.id}">Aufwärmen</button>
      ${cardio ? "" : `<button class="chip${s.isFailure ? " on" : ""}" data-act="flag" data-flag="isFailure" data-we="${we.id}" data-set="${s.id}">Fail</button>
      <button class="chip${s.isUnilateral ? " on" : ""}" data-act="flag" data-flag="isUnilateral" data-we="${we.id}" data-set="${s.id}">Einseitig</button>`}
      <button class="chip del" data-act="del-set" data-we="${we.id}" data-set="${s.id}" aria-label="Satz löschen">✕</button>
    </div>`;
}

function viewPicker() {
  return `${header("Übung hinzufügen", { back: "workout" })}<main class="wrap">
    <div class="search">
      <input id="q" type="search" placeholder="Nummer oder Name, z. B. 47 oder Beinpresse" value="${esc(S.query)}" autocomplete="off" enterkeyhint="search">
      <label class="toggle"><input id="only-nr" type="checkbox" ${S.prefs.onlyNumbered ? "checked" : ""}> Nur Maschinen mit Nummer (dein Studio)</label>
    </div>
    <div class="list" id="results">${pickerResults()}</div>
  </main>`;
}

/** „12× benutzt · zuletzt 03.11.2026“ bzw. „noch nicht benutzt“. */
function usageText(u) {
  return u.count ? `${u.count}× benutzt · zuletzt ${fmtDate(u.last)}` : "noch nicht benutzt";
}

function pickerResults() {
  const anyNumbered = S.catalog.machines.some((m) => m.own_number || m.gym_number);
  const hits = C.search(S.catalog, S.localExercises, S.query, { onlyNumbered: S.prefs.onlyNumbered && anyNumbered });
  if (!hits.length) {
    return `<p class="empty">Nichts gefunden.${S.prefs.onlyNumbered ? " Schalte „Nur Maschinen mit Nummer“ aus, um alle Maschinen zu durchsuchen." : ""}</p>`;
  }
  return hits
    .map((h) => {
      if (h.kind === "machine") {
        const m = h.machine;
        const nr = m.own_number || m.gym_number;
        const key = `machine:${m.id}`;
        return `<div class="item-row"><button class="item" data-act="pick-machine" data-arg="${esc(m.id)}">
          <span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span>
          <span class="main"><b>${esc(m.display_name)}</b><span class="muted small">${esc([m.manufacturer, m.series, C.machineMuscles(m).slice(0, 3).join(", ")].filter(Boolean).join(" · "))}</span>${
            h.exercises.length ? `<span class="small">Übungen: ${esc(h.exercises.map((e) => e.name).join(" · "))}</span>` : ""
          }<span class="usage small">${esc(usageText(C.usageOf(S.catalog, S.workouts, C.machineExercises(S.catalog, S.localExercises, m.id).map((e) => e.id))))}</span></span>
          <span class="chev">${h.exercises.length ? "›" : "+"}</span></button>
          <button class="info-btn" data-act="focus-info" data-arg="${esc(key)}" aria-expanded="${S.focusOpen === key}" aria-label="Muskelverteilung der Maschine ${esc(m.display_name)}">${icon("info")}</button>
          ${S.focusOpen === key ? focusPanelHtml(machineFocusInfo(m)) : ""}</div>`;
      }
      const e = h.exercise;
      return `<button class="item" data-act="pick-exercise" data-arg="${esc(e.id)}">
        <span class="num none">Übung</span>
        <span class="main"><b>${esc(e.name)}</b><span class="muted small">${esc([e.muscle_group, e.equipment].filter(Boolean).join(" · "))}</span>
          <span class="usage small">${esc(usageText(C.usageOf(S.catalog, S.workouts, [e.id])))}</span></span>
        <span class="chev">+</span></button>`;
    })
    .join("");
}

/** Maschine mit Übungen: eine davon wählen oder eine weitere anlegen. */
/** Muskelverteilung einer Übung (Info-Symbol), gleiche Regeln wie am PC. */
function focusPanel(e, m) {
  return focusPanelHtml(
    focusInfo(
      {
        exerciseId: e.id,
        exerciseName: e.name,
        muscleGroup: e.muscle_group,
        machineId: m?.id ?? e.machine_id,
        machineMuscleGroups: m ? C.machineMuscles(m) : [],
        machineNames: machineNamesOf(m ?? S.catalog.machines.find((x) => x.id === e.machine_id)),
      },
      S.catalog.focus,
    ),
  );
}

/** Muskelverteilung der Maschine selbst (1.5.1): eigener Fokus der Maschine, sonst Standardverteilung, sonst Muskelgruppen. */
function machineFocusInfo(m) {
  return focusInfo(
    { exerciseId: `machine:${m.id}`, exerciseName: m.name, muscleGroup: null, machineId: m.id, machineMuscleGroups: C.machineMuscles(m), machineNames: machineNamesOf(m) },
    S.catalog.focus,
  );
}

/** Kurztext unter „Muskelverteilung der Maschine“. */
function machineFocusText(info) {
  if (info.source === "machine") return "Eigener Muskelfokus der Maschine";
  if (info.source === "pattern") return info.title;
  if (info.source === "text") return "Aus den Muskelgruppen der Maschine";
  return "Keine Verteilung hinterlegt";
}

function focusPanelHtml(info) {
  return `<div class="focus-panel">
    <b>${esc(info.title)}</b>
    ${info.groups
      .map(
        (g) => `<div class="fp-group"><div class="fp-head"><span>${esc(g.label)}</span><span>${g.total} %</span></div>
        ${g.rows.map((r) => `<div class="fp-row"><span>${esc(r.label)}</span><span>${r.percent} %</span></div>`).join("")}</div>`,
      )
      .join("")}
    ${info.terms.length ? `<div class="fp-group">${info.terms.map((t) => `<div class="fp-row"><span>${esc(t.label)}</span><span>${t.percent} %</span></div>`).join("")}</div>` : ""}
    ${info.note ? `<p class="muted small">${esc(info.note)}</p>` : ""}
    ${S.catalog.focus ? "" : `<p class="muted small">Für den eigenen Muskelfokus bitte eine neue Exportdatei vom PC laden.</p>`}
  </div>`;
}

function viewMachine() {
  const m = S.catalog.machines.find((x) => x.id === S.arg);
  if (!m) return viewPicker();
  const nr = m.own_number || m.gym_number;
  const list = C.machineExercises(S.catalog, S.localExercises, m.id);
  return `${header(m.display_name, { back: "picker", sub: [nr ? `Nr. ${nr}` : "", m.manufacturer].filter(Boolean).join(" · ") })}<main class="wrap">
    ${(() => {
      const info = machineFocusInfo(m);
      const key = `machine:${m.id}`;
      return `<div class="item-row machine-focus">
        <div class="item machine-focus__text"><span class="main"><b>Muskelverteilung der Maschine</b>
          <span class="muted small">${esc(machineFocusText(info))}</span></span></div>
        <button class="info-btn" data-act="focus-info" data-arg="${esc(key)}" aria-expanded="${S.focusOpen === key}" aria-label="Muskelverteilung der Maschine ${esc(m.display_name)}">${icon("info")}</button>
        ${S.focusOpen === key ? focusPanelHtml(info) : ""}
      </div>`;
    })()}
    <p class="muted small">Übungen an dieser Maschine – der Verlauf gehört jeweils zur Übung.</p>
    <div class="list">${list
      .map(
        (e) => `<div class="item-row">
        <button class="item" data-act="pick-exercise" data-arg="${esc(e.id)}">
        <span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span>
        <span class="main"><b>${esc(e.name)}</b><span class="muted small">${esc(e.muscle_group ?? "")}</span>
          <span class="usage small">${esc(usageText(C.usageOf(S.catalog, S.workouts, [e.id])))}</span></span>
        <span class="chev">+</span></button>
        <button class="info-btn" data-act="focus-info" data-arg="${esc(e.id)}" aria-expanded="${S.focusOpen === e.id}" aria-label="Muskelverteilung von ${esc(e.name)}">${icon("info")}</button>
        ${S.focusOpen === e.id ? focusPanel(e, m) : ""}
      </div>`,
      )
      .join("")}</div>
    <section class="card"><h3>Weitere Übung an dieser Maschine</h3>
      <p class="small muted">Zum Beispiel „Butterfly“ und „Rear Delt“ an derselben Maschine. Die Übung wird gespeichert, steht hier beim nächsten Mal zur Auswahl und kommt mit „An den PC senden“ auch in die Desktop-App.</p>
      <div class="new-ex"><input id="new-ex-name" type="text" placeholder="Name der Übung, z. B. Butterfly" autocomplete="off" enterkeyhint="done" maxlength="80">
      <button class="btn primary" data-act="new-machine-ex" data-arg="${esc(m.id)}">Übung anlegen und hinzufügen</button></div>
    </section>
  </main>`;
}

function viewFinish() {
  const w = S.active;
  if (!w) return viewHome();
  const unticked = C.untickedCount(w);
  const errors = C.checkWorkout(w, { keepUnticked: S.prefs.keepUnticked });
  const edit = !!w.editOf;
  if (edit && w.durationMin !== null && (!Number.isFinite(w.durationMin) || w.durationMin < 1 || w.durationMin > 1440)) {
    errors.push("Dauer: bitte 1 bis 1440 Minuten eintragen.");
  }
  return `${header(edit ? "Änderungen speichern" : "Training beenden", { back: "workout" })}<main class="wrap">
    ${
      edit
        ? `<section class="card"><div class="field"><label for="wo-duration">Dauer in Minuten</label><input id="wo-duration" type="text" inputmode="numeric" value="${w.durationMin ?? ""}" data-wfield="durationMin"></div>
           <p class="muted small">${w.exercises.length} Übungen · ${C.fmtNum(C.volumeKg(w), 0)} kg Volumen. Nach dem Speichern zählt das Training wieder als „offen“ – mit „An den PC senden“ und „Abgleichen (zweites Gerät)“ übernimmt der PC die Änderungen, auch entfernte Sätze und Übungen.</p></section>`
        : ""
    }
    <section class="card"${edit ? " hidden" : ""}>
      <div class="stat">
        <div><b>${fmtSec((Date.now() - new Date(w.startedAt)) / 1000)}</b><span>Dauer</span></div>
        <div><b>${w.exercises.length}</b><span>Übungen</span></div>
        <div><b>${C.fmtNum(C.volumeKg(w), 0)}</b><span>kg Volumen</span></div>
      </div>
    </section>
    <section class="card">
      <h3>Wie anstrengend war es? (1–10)</h3>
      <div class="rpe-row">${Array.from({ length: 10 }, (_, i) => i + 1)
        .map((n) => `<button data-act="exertion" data-arg="${n}" class="${w.perceivedExertion === n ? "on" : ""}">${n}</button>`)
        .join("")}</div>
      <div class="field"><label for="wo-notes">Notiz (optional)</label><textarea id="wo-notes" maxlength="2000" data-wfield="notes">${esc(w.notes ?? "")}</textarea></div>
      <div class="field"><label for="wo-title">Titel</label><input id="wo-title" type="text" maxlength="80" value="${esc(w.title)}" data-wfield="title"></div>
    </section>
    ${
      unticked
        ? `<section class="card"><p class="warn">${unticked === 1 ? "1 Satz ist" : `${unticked} Sätze sind`} eingetragen, aber nicht abgehakt.</p>
           <label class="toggle"><input id="keep-unticked" type="checkbox" ${S.prefs.keepUnticked ? "checked" : ""}> Nicht abgehakte Sätze trotzdem speichern</label></section>`
        : ""
    }
    ${errors.length ? `<div class="errors">${errors.map((e) => `<p>${esc(e)}</p>`).join("")}</div>` : ""}
  </main>
  <div class="bottom"><div class="inner"><button class="btn primary" data-act="finish" ${errors.length ? "disabled" : ""}>Speichern</button></div></div>`;
}

function viewSend() {
  const open = unsent();
  const all = S.workouts.filter((w) => w.status === "done");
  const food = unsentFood();
  const body = unsentBodyCount();
  const ready = [
    open.length ? `${open.length} ${open.length === 1 ? "Training" : "Trainings"}` : "",
    food ? `${food} Ernährungseinträge` : "",
    body ? `${body} Körperwerte, Schlaf-, Regenerations- und To-do-Einträge` : "",
  ].filter(Boolean);
  return `${header("An den PC senden", { back: "home" })}<main class="wrap">
    <section class="card">
      <h3>${ready.length ? `${ready.join(" und ")} bereit` : "Alles übertragen"}</h3>
      <ol class="steps small">
        <li>Auf <b>„Trainings senden“</b> bzw. <b>„Lebensmittel senden“</b> tippen und die Datei in <b>Google Drive</b> sichern („In Drive sichern“ bzw. „In Dateien sichern“ → Google Drive).</li>
        <li>Am PC in LIFESPAN OS: <b>Settings → Daten importieren → Exportdatei auswählen …</b> und die Datei aus Google Drive wählen.</li>
        <li>Als Art <b>„Abgleichen (zweites Gerät)“</b> wählen und bestätigen.</li>
      </ol>
      <p class="warn">Bitte nie „Ersetzen“ wählen: Dann würden am PC alle anderen Daten gelöscht. „Abgleichen“ ist sicher, vorher legt die App automatisch ein Backup an.</p>
      <p class="muted small">Trainings, Ernährung und Körperwerte kommen in getrennte Dateien: „LIFESPAN Smartphone-Training …“, „LIFESPAN Lebensmittel …“ und „LIFESPAN Körperwerte …“ (mit Schlaf, Nickerchen, Regeneration, To-dos, Health und Superhuman). Am PC alle gleich importieren.</p>
      <button class="btn primary block" data-act="send" data-arg="training" ${open.length ? "" : "disabled"}>${open.length ? `Trainings senden (${open.length})` : "Keine offenen Trainings"}</button>
      <button class="btn primary block" data-act="send" data-arg="food" ${food ? "" : "disabled"}>${food ? `Lebensmittel senden (${food} Einträge)` : "Keine offenen Ernährungseinträge"}</button>
      ${food ? `<button class="btn block" data-go="food-review">Vorher Ernährungseinträge prüfen und bearbeiten</button>` : ""}
      ${body ? `<button class="btn primary block" data-act="send" data-arg="body">Körperwerte, Schlaf, Regeneration, To-dos, Health &amp; Superhuman senden (${body})</button>` : ""}
    </section>
    ${
      all.length || Object.keys(S.food?.local.meals ?? {}).length || Object.keys(S.food?.local.foods ?? {}).length || Object.keys(S.body?.local.entries ?? {}).length || Object.keys(LG.logTables(S.logs, { all: true })).length || Object.keys(TD.todoTables(S.todos, { all: true })).length || Object.keys(HD.healthTables(S.health, { all: true })).length || Object.keys(SD.superTables(S.super, { all: true })).length
        ? `<section class="card"><h3>Alles vom Handy</h3>
            <p class="muted small">Falls eine Datei verloren ging: Du kannst alle ${all.length} Trainings und die Ernährungseinträge noch einmal senden. Am PC entstehen dabei keine doppelten Einträge.</p>
            ${all.length ? `<button class="btn block" data-act="send" data-arg="training|all">Alle Trainings erneut senden</button>` : ""}
            ${Object.keys(S.food?.local.meals ?? {}).length || Object.keys(S.food?.local.foods ?? {}).length ? `<button class="btn block" data-act="send" data-arg="food|all">Alle Ernährungseinträge erneut senden</button>` : ""}
            ${Object.keys(S.body?.local.entries ?? {}).length || Object.keys(LG.logTables(S.logs, { all: true })).length || Object.keys(TD.todoTables(S.todos, { all: true })).length || Object.keys(HD.healthTables(S.health, { all: true })).length || Object.keys(SD.superTables(S.super, { all: true })).length ? `<button class="btn block" data-act="send" data-arg="body|all">Alle Körperwerte, Schlaf, Regeneration, To-dos, Health &amp; Superhuman erneut senden</button>` : ""}</section>`
        : ""
    }
    <div id="send-result"></div>
  </main>`;
}

function viewDetail() {
  const w = S.workouts.find((x) => x.id === S.arg);
  if (!w) return viewHome();
  const exs = exById();
  const machines = machineById();
  return `${header(w.title, { back: "home", sub: `${fmtDate(w.date)} · ${w.startTime} Uhr` })}<main class="wrap">
    <section class="card"><div class="stat">
      <div><b>${w.durationMin ?? "–"}</b><span>Minuten</span></div>
      <div><b>${w.perceivedExertion ?? "–"}</b><span>Anstrengung</span></div>
      <div><b>${C.fmtNum(C.volumeKg(w), 0)}</b><span>kg Volumen</span></div>
    </div>${w.notes ? `<p class="small">${esc(w.notes)}</p>` : ""}
    <p class="muted small">${w.exported ? "An den PC gesendet." : "Noch nicht an den PC gesendet."}</p></section>
    ${w.exercises
      .map((we) => {
        const { name, nr } = exLabel(exs.get(we.exerciseId), machines);
        return `<section class="card"><div class="row"><span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span><h3 style="flex:1">${esc(name)}</h3></div>
          <p class="small">${we.sets
            .map((s) => `${s.isWarmup ? "W " : ""}${s.reps ?? "–"} × ${s.weightKg !== null ? C.fmtNum(s.weightKg) + " kg" : "–"}${s.rpe ? ` @${C.fmtNum(s.rpe, 1)}` : ""}${s.isFailure ? " (Fail)" : ""}`)
            .map(esc)
            .join("<br>")}</p></section>`;
      })
      .join("")}
    <button class="btn block" data-act="edit-workout" data-arg="${w.id}">Training bearbeiten</button>
    ${w.exported ? "" : `<button class="btn danger block" data-act="delete-workout" data-arg="${w.id}">Training löschen</button>`}
  </main>`;
}

function viewHelp() {
  return `${header("Hilfe", { back: S.catalog ? "home" : "setup" })}<main class="wrap">
    <section class="card"><h3>Wo sind meine Daten?</h3>
      <p class="small">Nur auf diesem Gerät, im Speicher des Browsers. Es gibt kein Konto und keinen Server. Die App selbst wird einmal von lifespan-os.github.io geladen und läuft danach auch offline.</p></section>
    <section class="card"><h3>iPhone: unbedingt zum Home-Bildschirm</h3>
      <p class="small">In Safari auf „Teilen“ → „Zum Home-Bildschirm“ tippen und LIFESPAN danach immer über das Symbol öffnen. Sonst darf Safari die gespeicherten Daten nach längerer Pause löschen. Sende deine Trainings regelmäßig an den PC.</p></section>
    <section class="card"><h3>Ablauf</h3>
      <ol class="steps small">
        <li>PC → Handy: Am PC exportieren, Datei in Google Drive legen, hier laden.</li>
        <li>Im Studio: Plan starten oder freies Training, Sätze eintragen und abhaken. Der Pausentimer startet beim Abhaken.</li>
        <li>Handy → PC: „An den PC senden“, Datei in Google Drive sichern, am PC mit „Abgleichen (zweites Gerät)“ importieren.</li>
      </ol></section>
    <section class="card"><h3>Gut zu wissen</h3>
      <p class="small">Neue Pläne oder Maschinen vom PC kommen erst mit einer neuen Exportdatei aufs Handy. Trainings auf dem Handy bleiben beim Laden neuer Daten erhalten.</p>
      <p class="small">LIFESPAN OS Mobil ${C.MOBILE_VERSION} · ein Non-Profit-Projekt</p></section>
  </main>`;
}

const VIEWS = {
  sleep: viewSleep,
  recovery: viewRecovery,
  "log-edit": viewLogEdit,
  insights: viewInsights,
  todos: viewTodos,
  health: viewHealth,
  "lab-edit": viewLabEdit,
  super: viewSuper,
  "hrt-edit": viewHrtEdit,
  "protocol-edit": viewProtocolEdit,
  "substance-edit": viewSubstanceEdit,
  diary: viewDiary,
  "food-history": viewNutritionHistory,
  food: viewFood,
  "food-review": viewFoodReview,
  body: viewBody,
  "body-metric": viewBodyMetric,
  "body-entry": viewBodyEntry,
  dish: viewDish,
  setup: viewSetup,
  home: viewHome,
  training: viewTraining,
  settings: viewSettings,
  "pc-only": viewPcOnly,
  plans: viewPlans,
  workout: viewWorkout,
  picker: viewPicker,
  machine: viewMachine,
  finish: viewFinish,
  send: viewSend,
  detail: viewDetail,
  help: viewHelp,
};

function render() {
  if (!S.catalog && S.view !== "help") S.view = "setup";
  app.innerHTML = (VIEWS[S.view] || viewHome)();
  renderNav();
  if (S.view === "picker") {
    const q = document.getElementById("q");
    q?.focus();
  }
  renderRest();
}

// ------------------------------------------------------------------ Aktionen

function findWe(id) {
  return S.active?.exercises.find((e) => e.id === id) || null;
}
function findSet(weId, setId) {
  return findWe(weId)?.sets.find((s) => s.id === setId) || null;
}

// ------------------------------------------------------------------ Menü (wie die linke Leiste am PC)

const navRoot = document.createElement("div");
navRoot.id = "nav-root";
document.body.appendChild(navRoot);

function renderNav() {
  navRoot.innerHTML = S.catalog ? drawerHtml({ view: S.view, arg: S.arg, open: S.menuOpen, esc, back: S.logEdit?.back ?? null }) : "";
  document.body.classList.toggle("menu-open", Boolean(S.menuOpen));
}

function setMenu(open) {
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
  if (el.dataset.act === "menu-go") {
    S.menuOpen = false;
    const sec = SECTIONS.find((x) => x.id === el.dataset.arg);
    return sec?.view ? go(sec.view) : go("pc-only", el.dataset.arg);
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && S.menuOpen) setMenu(false);
});

/**
 * iOS vergrößert beim Tippen in ein Feld und bleibt danach vergrößert. Nach dem Bestätigen eines
 * Wertes (Feld verlassen, Satz abhaken) wieder auf die optimale Breite zurück (1.4.1): kurz
 * „maximum-scale=1“ setzen, dann wieder freigeben (Zoomen mit zwei Fingern bleibt möglich).
 */
const viewportMeta = document.querySelector('meta[name="viewport"]');
const VIEWPORT = viewportMeta?.getAttribute("content") ?? "width=device-width, initial-scale=1, viewport-fit=cover";
function resetZoom() {
  if (!viewportMeta || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
  if ((window.visualViewport?.scale ?? 1) <= 1.01) return;
  viewportMeta.setAttribute("content", `${VIEWPORT}, maximum-scale=1`);
  setTimeout(() => viewportMeta.setAttribute("content", VIEWPORT), 350);
}
// Wert bestätigt (Feld verlassen bzw. „Fertig“): Zoom zurück, sofern kein anderes Feld folgt
document.addEventListener("focusout", (ev) => {
  if (!ev.target.matches?.("input, textarea, select")) return;
  setTimeout(() => {
    if (!document.activeElement?.matches?.("input, textarea, select")) resetZoom();
  }, 60);
});

function rerenderKeepScroll() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

async function startWorkout(title, planDay = null) {
  if (S.active) return go("workout");
  const w = C.newWorkout({ title, planDayId: planDay?.row.id ?? null });
  if (planDay) {
    for (const pe of planDay.exercises) {
      w.exercises.push(C.workoutExercise({ exerciseId: pe.exerciseId, planExercise: pe, last: C.lastSessionFor(S.catalog, S.workouts, pe.exerciseId) }));
    }
  }
  S.active = w;
  await saveNow();
  wakeLock(true);
  go(planDay ? "workout" : "picker");
}

function addExercise(exerciseId) {
  const last = C.lastSessionFor(S.catalog, S.workouts, exerciseId, S.active.id);
  const we = C.workoutExercise({ exerciseId, last });
  S.active.exercises.push(we);
  setFocus(S.active, we.id);
  saveSoon();
  S.query = "";
  go("workout");
  requestAnimationFrame(() => document.getElementById(`ex-${we.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
}

const actions = {
  ...foodActions,
  ...diaryActions,
  ...overviewActions,
  ...logsActions,
  ...insightsActions,
  ...todoActions,
  ...healthActions,
  ...superActions,
  ...bodyActions,
  "start-free": () => startWorkout("Freies Training"),
  "start-plan": (el) => {
    for (const p of S.catalog.plans) {
      const d = p.days.find((x) => x.row.id === el.dataset.arg);
      if (d) return startWorkout(d.row.name, d);
    }
  },
  "pick-machine": (el) => {
    // Maschine mit Übungen: Auswahl zeigen (mehrere Übungen an einer Maschine sind möglich)
    if (C.machineExercises(S.catalog, S.localExercises, el.dataset.arg).length > 0) {
      go("machine", el.dataset.arg);
      return;
    }
    try {
      const { exercise, created } = C.exerciseForMachine(S.catalog, S.localExercises, el.dataset.arg);
      if (created) S.localExercises.push(exercise);
      addExercise(exercise.id);
    } catch (e) {
      toast(e.message, true);
    }
  },
  "pick-exercise": (el) => addExercise(el.dataset.arg),
  "new-machine-ex": (el) => {
    const name = document.getElementById("new-ex-name")?.value ?? "";
    try {
      const { exercise, created } = C.newMachineExercise(S.catalog, S.localExercises, el.dataset.arg, name);
      if (created) S.localExercises.push(exercise);
      addExercise(exercise.id);
    } catch (e) {
      toast(e.message, true);
    }
  },
  "toggle-done": (el) => {
    const we = findWe(el.dataset.we);
    const s = findSet(el.dataset.we, el.dataset.set);
    if (!s) return;
    s.isDone = !s.isDone;
    if (s.isDone && we.restSeconds) startRest(we.restSeconds);
    // Übung fertig: nächste offene Übung wird die aktuelle (aufgeklappt), diese klappt zu
    if (s.isDone && we.sets.every((x) => x.isDone)) {
      const list = S.active.exercises;
      const idx = list.findIndex((e) => e.id === we.id);
      const next = [...list.slice(idx + 1), ...list.slice(0, idx)].find((e) => !e.sets.length || e.sets.some((x) => !x.isDone));
      if (next) {
        setFocus(S.active, next.id);
        delete S.exOpen?.[we.id];
        saveSoon();
        render();
        requestAnimationFrame(() => document.getElementById(`ex-${next.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
        resetZoom();
        return;
      }
    }
    // abgehakte Übung wird die aktuelle (wie am PC)
    if (s.isDone && !exComplete(we) && focusExId(S.active) !== we.id) setFocus(S.active, we.id);
    saveSoon();
    rerenderKeepScroll();
    resetZoom();
  },
  flag: (el) => {
    const s = findSet(el.dataset.we, el.dataset.set);
    if (!s) return;
    s[el.dataset.flag] = !s[el.dataset.flag];
    saveSoon();
    rerenderKeepScroll();
  },
  "toggle-profile": (el) => {
    const we = findWe(el.dataset.we);
    const ex = exById().get(we.exerciseId);
    const vis = C.visibleProfiles(we, ex);
    const k = el.dataset.arg;
    if (vis.includes(k) && el.dataset.locked) return toast("Erst die Werte in dieser Spalte löschen.", true);
    we.profiles = vis.includes(k) ? vis.filter((x) => x !== k) : C.PROFILE_KEYS.filter((x) => x === k || vis.includes(x));
    saveSoon();
    rerenderKeepScroll();
  },
  "focus-info": (el) => {
    S.focusOpen = S.focusOpen === el.dataset.arg ? null : el.dataset.arg;
    rerenderKeepScroll();
  },
  "toggle-ex": (el) => {
    const we = findWe(el.dataset.we);
    if (!we) return;
    if (!S.exOpen) S.exOpen = {};
    S.exOpen[we.id] = !isOpen(S.active, we);
    rerenderKeepScroll();
  },
  "add-set": (el) => {
    const we = findWe(el.dataset.we);
    const prev = we.sets[we.sets.length - 1] || null;
    we.sets.push(C.newSet(prev ? { ...prev, isWarmup: false } : null));
    saveSoon();
    rerenderKeepScroll();
  },
  "del-set": (el) => {
    const we = findWe(el.dataset.we);
    we.sets = we.sets.filter((s) => s.id !== el.dataset.set);
    saveSoon();
    rerenderKeepScroll();
  },
  "remove-ex": (el) => {
    const we = findWe(el.dataset.we);
    if (we.sets.some((s) => s.isDone) && !confirmTwice(el, "Wirklich entfernen?")) return;
    S.active.exercises = S.active.exercises.filter((e) => e.id !== el.dataset.we);
    saveSoon();
    rerenderKeepScroll();
  },
  "move-up": (el) => {
    const list = S.active.exercises;
    const i = list.findIndex((e) => e.id === el.dataset.we);
    if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    saveSoon();
    rerenderKeepScroll();
  },
  discard: async (el) => {
    const editOf = S.active?.editOf ?? null;
    if (!confirmTwice(el, editOf ? "Nochmal tippen: Änderungen verwerfen" : "Nochmal tippen: Training wirklich verwerfen")) return;
    S.active = null;
    stopRest();
    wakeLock(false);
    await saveNow();
    toast(editOf ? "Änderungen verworfen" : "Training verworfen");
    if (editOf) go("detail", editOf);
    else go("home");
  },
  exertion: (el) => {
    const n = Number(el.dataset.arg);
    S.active.perceivedExertion = S.active.perceivedExertion === n ? null : n;
    saveSoon();
    rerenderKeepScroll();
  },
  finish: async () => {
    const opts = { keepUnticked: S.prefs.keepUnticked };
    if (C.checkWorkout(S.active, opts).length) return render();
    if (S.active.editOf) {
      const d = S.active.durationMin;
      if (d !== null && (!Number.isFinite(d) || d < 1 || d > 1440)) return render();
      const i = S.workouts.findIndex((x) => x.id === S.active.editOf);
      if (i < 0) {
        toast("Das ursprüngliche Training gibt es nicht mehr.", true);
        return;
      }
      const saved = C.saveEdit(S.workouts[i], S.active, new Date(), opts);
      S.workouts[i] = saved;
      S.active = null;
      stopRest();
      wakeLock(false);
      await saveNow();
      toast("Änderungen gespeichert");
      go("detail", saved.id);
      return;
    }
    const done = C.finishWorkout(S.active, new Date(), opts);
    S.workouts.push(done);
    S.active = null;
    stopRest();
    wakeLock(false);
    await saveNow();
    toast("Training gespeichert");
    go("detail", done.id);
  },
  send: (el) => {
    const [kind, scope] = el.dataset.arg.split("|");
    sendFile(kind, scope === "all");
  },
  "mark-sent": async (el) => {
    const [kind, idList = ""] = el.dataset.arg.split("|");
    const ids = idList.split(",");
    if (kind === "training") for (const w of S.workouts) if (ids.includes(w.id)) w.exported = true;
    if (kind === "body" && S.body) {
      BD.markBodySent(S.body.local);
      await store.set("body", S.body.local);
      LG.markLogsSent(S.logs);
      await store.set("logs", S.logs);
      TD.markTodosSent(S.todos);
      await store.set("todos", S.todos);
      HD.markHealthSent(S.health);
      await store.set("health", S.health);
      SD.markSuperSent(S.super);
      await store.set("super", S.super);
    }
    if (kind === "food" && S.food) {
      N.markNutritionSent(S.food.local);
      await store.set("nutrition", S.food.local);
      P.markWaterSent(S.water);
      await store.set("water", S.water);
    }
    await saveNow();
    toast("Als übertragen markiert");
    go("home");
  },
  "edit-workout": async (el) => {
    if (S.active) {
      toast(S.active.editOf ? "Erst die laufende Bearbeitung speichern oder verwerfen." : "Erst das laufende Training beenden.", true);
      return;
    }
    const w = S.workouts.find((x) => x.id === el.dataset.arg);
    if (!w) return;
    S.active = C.startEdit(w);
    await saveNow();
    go("workout");
  },
  "delete-workout": async (el) => {
    if (!confirmTwice(el, "Nochmal tippen: Training löschen")) return;
    S.workouts = S.workouts.filter((w) => w.id !== el.dataset.arg);
    await saveNow();
    go("home");
  },
  "menu-open": () => setMenu(true),
  "menu-go": (el) => {
    S.menuOpen = false;
    const sec = SECTIONS.find((x) => x.id === el.dataset.arg);
    return sec?.view ? go(sec.view) : go("pc-only", el.dataset.arg);
  },
  "rest-plus": () => adjustRest(15),
  "rest-minus": () => adjustRest(-15),
  "rest-stop": () => stopRest(),
};

/** Zweistufige Bestätigung im Knopf selbst (Browser-Dialoge sind auf dem Handy unpraktisch). */
function confirmTwice(el, text) {
  if (el.dataset.armed === "1") return true;
  el.dataset.armed = "1";
  const old = el.textContent;
  el.textContent = text;
  setTimeout(() => {
    if (el.isConnected) {
      el.dataset.armed = "";
      el.textContent = old;
    }
  }, 3500);
  return false;
}

/** Tabellen zweier Teile zusammenlegen (z. B. `settings` aus Strichcodes und Glasgröße). */
function mergeTables(a, b) {
  const out = { ...a };
  for (const [name, list] of Object.entries(b)) out[name] = [...(out[name] ?? []), ...list];
  return out;
}

/**
 * Rückgabedatei erstellen (1.2.4): Trainings und Ernährung getrennt – `kind` „training“ oder „food“,
 * `all` = auch schon gesendete.
 */
async function sendFile(kind, all) {
  const list = kind === "training" ? S.workouts.filter((w) => w.status === "done" && (all || !w.exported)) : [];
  let doc;
  try {
    const food =
      kind === "food" && S.food
        ? mergeTables(N.nutritionTables(S.catalog, S.food.local, { all }), P.waterTables(S.water, { all }))
        : kind === "body" && S.body
          ? mergeTables(mergeTables(BD.bodyTables(S.catalog, S.body.local, { all }), LG.logTables(S.logs, { all })), mergeTables(TD.todoTables(S.todos, { all }), mergeTables(HD.healthTables(S.health, { all }), SD.superTables(S.super, { all }))))
          : {};
    if (kind === "food" && !Object.keys(food).length) return toast("Keine Ernährungseinträge zum Senden.", true);
    if (kind === "body" && !Object.keys(food).length) return toast("Keine Körperwerte, Schlaf-, Regenerations-, To-do-, Health- oder Superhuman-Einträge zum Senden.", true);
    if (kind === "training" && !list.length) return toast("Keine Trainings zum Senden.", true);
    doc = C.buildReturnFile(S.catalog, S.localExercises, list, new Date(), food);
  } catch (e) {
    return toast(e.message, true);
  }
  const name = C.returnFileName(new Date(), kind);
  const blob = new Blob([JSON.stringify(doc)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });
  const arg = kind === "training" ? `training|${list.map((w) => w.id).join(",")}` : kind;
  const result = document.getElementById("send-result");
  result.innerHTML = "";
  let shared = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      shared = true;
    } catch (e) {
      if (e.name === "AbortError") return toast("Abgebrochen");
    }
  }
  if (!shared) {
    const url = URL.createObjectURL(blob);
    result.innerHTML = `<section class="card"><p class="small">Die Datei ist bereit. Tippe darauf und sichere sie in Google Drive:</p>
      <a class="btn blue block" href="${url}" download="${esc(name)}">${esc(name)}</a></section>`;
  }
  result.insertAdjacentHTML(
    "beforeend",
    `<section class="card"><p class="small">${shared ? `„${esc(name)}“ weitergegeben.` : ""} Sobald die Datei in Google Drive liegt:</p>
     <button class="btn primary block" data-act="mark-sent" data-arg="${esc(arg)}">Als übertragen markieren</button></section>`,
  );
  result.scrollIntoView({ block: "start", behavior: "smooth" });
}

// ------------------------------------------------------------------ Eingaben

app.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act],[data-go]");
  if (!el || el.disabled) return;
  unlockAudio();
  if (el.dataset.go) {
    return go(el.dataset.go, el.dataset.arg ?? null);
  }
  const fn = actions[el.dataset.act];
  if (fn) fn(el);
});
restEl.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (el) actions[el.dataset.act]?.(el);
});

app.addEventListener("input", (ev) => {
  const el = ev.target;
  if (foodInput(el)) return;
  if (bodyInput(el)) return;
  if (logsInput(el)) return;
  if (todoInput(el)) return;
  if (healthInput(el)) return;
  if (superInput(el)) return;
  if (el.id === "q") {
    S.query = el.value;
    document.getElementById("results").innerHTML = pickerResults();
    return;
  }
  if (el.dataset.f) {
    const s = findSet(el.dataset.we, el.dataset.set);
    if (!s) return;
    const v = C.parseNum(el.value);
    const ok = v === null || !Number.isNaN(v);
    el.setAttribute("aria-invalid", ok ? "false" : "true");
    el.style.borderColor = ok ? "" : "var(--danger)";
    const f = el.dataset.f;
    if (f.startsWith("rp:")) {
      if (!s.rp) s.rp = C.emptyProfiles();
      s.rp[f.slice(3)] = v;
      const total = C.profileTotal(s.rp);
      if (total !== null) s.weightKg = total;
      const kg = document.getElementById(`w-${el.dataset.we}-${el.dataset.set}`);
      if (kg) {
        kg.value = C.fmtNum(s.weightKg);
        kg.readOnly = total !== null;
        kg.classList.toggle("sum", total !== null);
      }
      saveSoon();
      return;
    }
    if (f === "reps") s.reps = v === null ? null : Number.isNaN(v) ? NaN : Math.round(v);
    else if (f === "weightKg") s.weightKg = v;
    else if (f === "rpe") s.rpe = v;
    else if (f === "durationMin") s.durationSeconds = v === null ? null : Number.isNaN(v) ? NaN : Math.round(v * 60);
    else if (f === "distanceKm") s.distanceM = v === null ? null : Number.isNaN(v) ? NaN : Math.round(v * 1000);
    saveSoon();
    return;
  }
  if (el.dataset.setting) {
    const we = findWe(el.dataset.we);
    we.settings[el.dataset.setting] = el.value.trim() || null;
    saveSoon();
    return;
  }
  if (el.dataset.field === "notes") {
    const we = findWe(el.dataset.we);
    we.notes = el.value.slice(0, 500) || null;
    saveSoon();
    return;
  }
  if (el.dataset.field === "restSeconds") {
    const we = findWe(el.dataset.we);
    const v = C.parseNum(el.value);
    we.restSeconds = v === null || Number.isNaN(v) ? null : Math.min(3600, Math.max(0, Math.round(v)));
    saveSoon();
    return;
  }
  if (el.dataset.wfield) {
    const f = el.dataset.wfield;
    S.active[f] = f === "title" ? el.value : f === "durationMin" ? C.parseNum(el.value) : el.value.trim() || null;
    saveSoon();
  }
});

app.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (foodChange(el)) return;
  if (bodyChange(el)) return;
  if (diaryChange(el)) return;
  if (overviewChange(el)) return;
  if (logsChange(el)) return;
  if (todoChange(el)) return;
  if (healthChange(el)) return;
  if (superChange(el)) return;
  if (el.id === "only-nr") {
    S.prefs.onlyNumbered = el.checked;
    saveSoon();
    document.getElementById("results").innerHTML = pickerResults();
  } else if (el.id === "keep-unticked") {
    S.prefs.keepUnticked = el.checked;
    saveSoon();
    rerenderKeepScroll();
  } else if (el.id === "file-in" && el.files?.[0]) {
    await loadFile(el.files[0]);
  } else if (el.dataset.wfield === "title") {
    if (!S.active.title.trim()) S.active.title = "Training";
  }
});

// Satzfelder: beim Antippen alles markieren, damit man direkt überschreiben kann
app.addEventListener("focusin", (ev) => {
  if (ev.target.dataset?.f) setTimeout(() => ev.target.select?.(), 0);
});

async function loadFile(file) {
  try {
    toast("Datei wird gelesen …");
    const text = await file.text();
    const catalog = C.parseExport(text);
    S.localExercises = C.keepLocalExercises(catalog, S.localExercises, [...S.workouts, ...(S.active ? [S.active] : [])]);
    S.catalog = catalog;
    await store.set("catalog", catalog);
    N.pruneLocal(catalog, S.food.local);
    await store.set("nutrition", S.food.local);
    BD.pruneBody(catalog, S.body.local);
    await store.set("body", S.body.local);
    S.water = P.pruneWater(catalog, S.water);
    await store.set("water", S.water);
    S.logs = LG.pruneLogs(catalog, S.logs);
    await store.set("logs", S.logs);
    S.todos = TD.pruneTodos(catalog, S.todos);
    await store.set("todos", S.todos);
    S.health = HD.pruneHealth(catalog, S.health);
    await store.set("health", S.health);
    S.super = SD.pruneSuper(catalog, S.super);
    await store.set("super", S.super);
    await saveNow();
    toast(`Geladen: ${catalog.machines.length.toLocaleString("de-DE")} Maschinen, ${catalog.plans.length} Pläne, ${catalog.nutrition.foods.length.toLocaleString("de-DE")} Lebensmittel`);
    go("home");
  } catch (e) {
    toast(e.message || "Die Datei konnte nicht gelesen werden.", true);
  }
}

// ------------------------------------------------------------------ Pausentimer

let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    /* ohne Ton */
  }
}
function beep() {
  try {
    if (!audioCtx) return;
    for (const [t, f] of [[0, 880], [0.25, 880], [0.5, 1320]]) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.25, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.22);
    }
  } catch {
    /* ohne Ton */
  }
  navigator.vibrate?.([200, 100, 200]);
}

function startRest(seconds) {
  S.rest = { endsAt: Date.now() + seconds * 1000, total: seconds, beeped: false };
  renderRest();
}
function adjustRest(delta) {
  if (!S.rest) return;
  S.rest.endsAt += delta * 1000;
  S.rest.total = Math.max(1, S.rest.total + delta);
  S.rest.beeped = false;
  renderRest();
}
function stopRest() {
  S.rest = null;
  renderRest();
}
function renderRest() {
  if (!S.rest || S.view !== "workout") {
    restEl.hidden = true;
    return;
  }
  const left = (S.rest.endsAt - Date.now()) / 1000;
  const over = left <= 0;
  if (over && !S.rest.beeped) {
    S.rest.beeped = true;
    beep();
  }
  if (left < -60) return stopRest();
  restEl.hidden = false;
  restEl.className = over ? "rest over" : "rest";
  const pct = Math.max(0, Math.min(100, (left / S.rest.total) * 100));
  restEl.innerHTML = `<div class="box"><span class="t">${over ? "Los!" : fmtSec(left)}</span>
    <span class="lbl">${over ? "Pause vorbei" : "Pause"}</span>
    <button data-act="rest-minus" aria-label="15 Sekunden weniger">−15</button>
    <button data-act="rest-plus" aria-label="15 Sekunden mehr">+15</button>
    <button data-act="rest-stop">✕</button>
    <span class="bar" style="width:${pct}%"></span></div>`;
}

setInterval(() => {
  if (S.rest) renderRest();
  const clock = document.querySelector("[data-clock]");
  if (clock && S.active) clock.textContent = fmtSec((Date.now() - new Date(S.active.startedAt)) / 1000);
}, 500);

// ------------------------------------------------------------------ Bildschirm anlassen

let lock = null;
async function wakeLock(on) {
  try {
    if (on && "wakeLock" in navigator && !lock) {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => (lock = null));
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch {
    lock = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.active) wakeLock(true);
  if (document.visibilityState === "hidden") saveNow();
});

// ------------------------------------------------------------------ Start

/**
 * iPhone-Sicherheitsabstand: Manche iOS-Versionen melden env(safe-area-inset-top) = 0, obwohl die
 * App als Home-Bildschirm-App unter Statusleiste und Notch beginnt (z. B. wenn sie mit
 * durchsichtiger Statusleiste installiert wurde). Dann wird ein fester Abstand gesetzt.
 */
/**
 * Abstand der Kopfzeile zur Statusleiste (1.1.8, am iPhone des Nutzers abgestimmt): Sicherheitsabstand
 * von iOS minus 58 px (siehe app.css). Meldet iOS im Vollbild 0, gilt derselbe Abzug vom Ersatzwert
 * 46 px – also 0.
 */
function fixSafeTop() {
  const root = document.documentElement;
  root.style.removeProperty("--safe-top");
  try {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden";
    document.body.appendChild(probe);
    const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
    const fullScreen = window.innerHeight >= screen.height - 2; // Inhalt reicht bis unter die Statusleiste
    if (ios && standalone && inset < 20 && fullScreen) root.style.setProperty("--safe-top", "0px");
  } catch {
    /* Standardabstand */
  }
}

const moduleCtx = {
  get S() {
    return S;
  },
  esc,
  header,
  toast,
  store,
  uuid: () => C.uuidv7(),
  rerender: () => rerenderKeepScroll(),
  go: (view, arg) => go(view, arg),
  confirmTwice: (el, text) => confirmTwice(el, text),
  /** Trainings vom Handy als Tabellen (für die Rechnung wie am PC) */
  buildReturnTables: () =>
    C.buildReturnFile(S.catalog, S.localExercises, S.workouts.filter((w) => w.status === "done"), new Date()).tables,
};
initBody(moduleCtx);
initDiary(moduleCtx);
initOverview({ ...moduleCtx, S, today: todayIso });
initLogs(moduleCtx);
initInsights(moduleCtx);
initTodos(moduleCtx);
initHealth(moduleCtx);
initSuper(moduleCtx);

initFood({
  get S() {
    return S;
  },
  esc,
  header,
  toast,
  store,
  uuid: () => C.uuidv7(),
  rerender: () => rerenderKeepScroll(),
  go: (view, arg) => go(view, arg),
  confirmTwice: (el, text) => confirmTwice(el, text),
});

async function boot() {
  fixSafeTop();
  try {
    S.catalog = await store.get("catalog");
    S.localExercises = (await store.get("localExercises")) || [];
    S.workouts = (await store.get("workouts")) || [];
    S.active = await store.get("active");
    S.prefs = { ...S.prefs, ...((await store.get("prefs")) || {}) };
    S.food = foodState(await store.get("nutrition"));
    S.body = bodyState(await store.get("body"));
    S.water = (await store.get("water")) || P.emptyWaterLocal();
    S.logs = LG.logsState(await store.get("logs"));
    S.todos = TD.todosState(await store.get("todos"));
    S.health = HD.healthState(await store.get("health"));
    S.super = SD.superState(await store.get("super"));
    delete S.prefs.topOffset; // Einstellung aus 1.1.7 entfällt
  } catch (e) {
    app.innerHTML = `<p class="boot">Der Gerätespeicher ist nicht verfügbar (${esc(e.message)}). Im privaten Modus funktioniert LIFESPAN OS Mobil nicht.</p>`;
    return;
  }
  store.persist();
  S.view = S.catalog ? (S.active ? "workout" : "home") : "setup";
  render();
  if (S.active) wakeLock(true);
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
