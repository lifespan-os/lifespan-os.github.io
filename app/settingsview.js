// LIFESPAN OS Mobil – Settings wie am PC (1.48.0). Bearbeitbar am Handy (Entscheidung des Nutzers vom
// 17.11.2026):
// - mit dem PC abgeglichen (pcsettings.js, geht mit „An den PC senden“ zurück): Profil, Mahlzeiten,
//   Messmethoden, Tageswechsel, Seiten anpassen, Secret Protocols
// - nur für dieses Handy (devprefs.js): Darstellung, Erinnerungen, Schnellerfassung, Import/Export
// - Konten am Handy (anlegen, umbenennen, wechseln, löschen) stehen in app.js (`accountsCard`).
// Tagesziele haben eine eigene Ansicht (goalsui.js); Wochen- und Hauptziele: goalsparity.js (1.91.0).

import * as N from "./nutrition.js";
import * as PS from "./pcsettings.js";
import * as C from "./core.js";
import { cardioSettingsCard } from "./parity.js";
import { mainGoalsCard, weekGoalsCard } from "./goalsparity.js";
import * as DP from "./devprefs.js";
import * as D from "./pcdomain.js";
import { buildDb, today } from "./diary.js";
import { cropPhoto } from "./photocrop.js";
import { QUICK } from "./nav.js";
import { LAYOUT_PAGES, setLayoutEditing } from "./layoutedit.js";
import { faqCardHtml } from "./searchview.js";

let X = null; // { S, esc, header, toast, store, rerender, go, saveNow, accountsCard, applyPrefs, pageTitle }

export function initSettings(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);

const json = (raw) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const list = (raw) => (Array.isArray(json(raw)) ? json(raw).filter((x) => typeof x === "string") : []);

/** Gültige Einstellung (PC, mit Änderungen am Handy). */
const setting = (db, key) => db.settings.get(key) ?? null;

/** Mahlzeitenliste wie sie gerade gilt. */
function currentMeals(db) {
  const names = {};
  for (const s of PS.DEFAULT_MEALS) {
    const n = setting(db, PS.MEAL_NAME_PREFIX + s);
    if (n) names[s] = n;
  }
  // wie am PC: eigene Mahlzeit „Pre-Workout“ o. Ä. ist eine Workout-Mahlzeit (1.107.0)
  const cfg = N.setMealConfig(db.settings);
  return {
    names,
    hidden: list(setting(db, "meal_hidden")).filter((h) => PS.DEFAULT_MEALS.includes(h)),
    extras: [...cfg.extras],
    extraShow: cfg.extras.map((x) => !cfg.extraHidden.includes(x)),
    workout: [...cfg.workout],
  };
}
const mealForm = (cur) => ({ names: { ...cur.names }, hidden: [...cur.hidden], extras: [...cur.extras], extraShow: [...cur.extraShow], workout: [...cur.workout], errors: null });
const shownCount = (f) => PS.DEFAULT_MEALS.length - f.hidden.length + f.extraShow.filter(Boolean).length + f.workout.length;

/** Einstellung ändern und speichern (mit dem PC abgeglichen). */
async function putSetting(key, value) {
  const S = X.S;
  S.pcsettings = PS.normSync(S.pcsettings);
  const changed = PS.setSetting(S.pcsettings, key, value, setting(buildDb(), key));
  if (changed) await X.store.set("pcsettings", S.pcsettings);
  return changed;
}

/**
 * Tageswechsel ändern: gilt ab dem aktuellen Tag, vergangene Tage behalten ihren (1.102.0,
 * `ui.day_start_history` wie am PC). `true` = geändert.
 */
async function saveDayStart(v) {
  const db = buildDb();
  const previous = PS.validDayStart(setting(db, "ui.day_start")) ?? "00:00";
  if (previous === v) return false;
  const history = C.recordDayStartChange(C.dayStartHistory(), today(), previous, v);
  await putSetting("ui.day_start_history", JSON.stringify(history));
  const changed = await putSetting("ui.day_start", v === "00:00" ? null : v);
  buildDb();
  return changed;
}

const errOf = (errors, k) => (errors?.[k] ? `<p class="field-error">${esc(errors[k])}</p>` : "");
const segmented = (act, options, current) =>
  `<div class="segmented" role="radiogroup">${options
    .map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === current}" class="${v === current ? "is-active" : ""}" data-act="${act}" data-arg="${esc(v)}">${esc(l)}</button>`)
    .join("")}</div>`;
const syncNote = `<p class="muted small card-info">Gilt für PC und Handy: geht mit „An den PC senden“ an den PC; dort gewinnt beim Abgleich der neuere Stand.</p>`;
const deviceNote = `<p class="muted small card-info">Gilt nur auf diesem Handy (am PC gibt es eine eigene Einstellung).</p>`;

// ------------------------------------------------------------------ Automatisch speichern (1.117.0, wie PC 1.0.193)
// Profil, Mahlzeiten, Workout-Richtwerte und Messmethoden speichern beim Verlassen eines Feldes bzw.
// sofort bei Auswahl und Haken. Ungültige Eingaben: rot, nicht gespeichert. Danach „Gespeichert“ mit
// „Rückgängig“ (stellt den Stand davor wieder her).

/** Hinweis unter dem Formular einer Karte */
function autoNote(card, invalid) {
  const n = X.S.autoNote;
  if (invalid) return `<p class="field-error autosave-note">Nicht gespeichert – bitte die markierten Felder prüfen.</p>`;
  if (n?.card === card) {
    return `<p class="autosave-note autosave-note--ok small" role="status">✓ ${n.undone ? "Rückgängig gemacht" : "Gespeichert"}${
      n.undo ? ` <button class="linkbtn" data-act="autosave-undo">Rückgängig</button>` : ""
    }</p>`;
  }
  return `<p class="autosave-note muted small">Änderungen werden automatisch gespeichert.</p>`;
}

/** Neu zeichnen, nachdem der Fokus zum nächsten Feld gewandert ist, und ihn dort lassen */
function rerenderKeepFocus() {
  setTimeout(() => {
    const id = document.activeElement?.id;
    X.rerender();
    if (id) document.getElementById(id)?.focus({ preventScroll: true });
  }, 0);
}

/** Gespeichert: Hinweis mit „Rückgängig“ merken */
function saved(card, undo) {
  X.S.autoNote = { card, undo, undone: false };
  rerenderKeepFocus();
}

/** Einstellungen speichern und den Stand davor für „Rückgängig“ merken */
async function saveSettings(card, entries) {
  const db = buildDb();
  const before = entries.map(([k]) => [k, setting(db, k)]);
  let n = 0;
  for (const [k, v] of entries) if (await putSetting(k, v)) n++;
  buildDb();
  if (!n) return rerenderKeepFocus();
  saved(card, async () => {
    for (const [k, v] of before) await putSetting(k, v);
    buildDb();
  });
}

async function autoProfile() {
  const S = X.S;
  const f = readProfile();
  const r = PS.validateProfile(f, today());
  if (!r.ok) {
    f.errors = r.errors;
    S.autoNote = null;
    return rerenderKeepFocus();
  }
  f.errors = null;
  const prev = buildDb()?.profile ?? null;
  // Nichts geändert (z. B. Feld nur betreten und verlassen): nicht speichern
  if (prev && Object.entries(r.value).every(([k, v]) => (prev[k] ?? null) === (v ?? null))) {
    S.setProfile = null;
    return rerenderKeepFocus();
  }
  S.pcsettings = PS.normSync(S.pcsettings);
  PS.setProfile(S.pcsettings, { ...r.value, photo: prev?.photo ?? null });
  await X.store.set("pcsettings", S.pcsettings);
  S.setProfile = null;
  await X.renameActiveAccount(r.value.name);
  saved(
    "profile",
    prev
      ? async () => {
          const { id: _id, updated_at: _u, ...row } = prev;
          S.pcsettings = PS.normSync(S.pcsettings);
          PS.setProfile(S.pcsettings, row);
          await X.store.set("pcsettings", S.pcsettings);
          await X.renameActiveAccount(prev.name ?? "");
        }
      : null,
  );
}

async function autoMeals() {
  const f = readMeals();
  // Neue eigene Mahlzeit ohne Namen: warten, bis der Name eingetragen ist
  if (f.extras.some((n) => !String(n ?? "").trim())) return;
  const r = PS.validateMealList(f);
  if (!r.ok) {
    f.errors = r.errors;
    X.S.autoNote = null;
    return rerenderKeepFocus();
  }
  X.S.setMeals = null;
  await saveSettings("meals", Object.entries(PS.mealListSettings(r.value)));
}

async function autoWt() {
  const f = readWt();
  const r = WTL().validateWorkoutTargets(f.draft);
  if (!r.ok) {
    f.errors = r.errors;
    X.S.autoNote = null;
    return rerenderKeepFocus();
  }
  X.S.setWt = null;
  await saveSettings("meals", [[WTL().WORKOUT_TARGETS_SETTING, JSON.stringify(r.value)]]);
}

async function autoMethods() {
  const f = readMethods();
  // Neue Methode ohne Bezeichnung: warten
  if (Object.values(f.list).some((l) => l.some((m) => !String(m ?? "").trim()))) return;
  const r = PS.validateMethods(f.list);
  if (!r.ok) {
    f.errors = r.errors;
    X.S.autoNote = null;
    return rerenderKeepFocus();
  }
  const empty = Object.values(r.value).every((l) => !l.length);
  X.S.setMethods = null;
  await saveSettings("methods", [["measurement_methods", empty && !setting(buildDb(), "measurement_methods") ? null : r.json]]);
}

// ------------------------------------------------------------------ Karten

function profileCard(db) {
  const S = X.S;
  const p = db.profile;
  if (!p) return `<section class="card" id="set-profile"><h3>Profil</h3><p class="muted small">Noch kein Profil – Exportdatei vom PC laden oder ein Konto am Handy anlegen.</p></section>`;
  const f = S.setProfile ?? { name: p.name ?? "", height: p.height_cm === null || p.height_cm === undefined ? "" : String(p.height_cm).replace(".", ","), birthDate: p.birth_date ?? "", sex: p.sex ?? "", lifePhase: p.sex === "female" ? (p.life_phase ?? "") : "", errors: null };
  const e = f.errors;
  const opt = (opts, cur) => opts.map((o) => `<option value="${esc(o.value)}" ${o.value === cur ? "selected" : ""}>${esc(o.label)}</option>`).join("");
  return `<section class="card" id="set-profile">
    <h3>Profil</h3>
    <div class="prof-photo"><span class="prof-photo__img">${p.photo ? `<img src="${esc(p.photo)}" alt="Profilbild">` : "👤"}</span><div>
      <button class="btn sm" data-act="prof-photo-pick">${p.photo ? "Anderes Bild" : "Profilbild aufnehmen oder wählen"}</button>
      ${p.photo ? '<button class="linkbtn" data-act="prof-photo-crop">Ausschnitt ändern</button> <button class="linkbtn danger" data-act="prof-photo-remove">Entfernen</button>' : ""}
    </div></div>
    <div class="field"><label for="prof-name">Name</label><input id="prof-name" data-prof="name" type="text" maxlength="60" autocomplete="off" value="${esc(f.name)}" ${e?.name ? 'aria-invalid="true"' : ""}>${errOf(e, "name")}</div>
    <div class="grid2">
      <div class="field"><label for="prof-height">Größe (cm)</label><input id="prof-height" data-prof="height" type="text" inputmode="decimal" value="${esc(f.height)}" ${e?.height ? 'aria-invalid="true"' : ""}>${errOf(e, "height")}</div>
      <div class="field"><label for="prof-sex">Geschlecht</label><select id="prof-sex" data-prof="sex">${opt(D.SEX_OPTIONS, f.sex)}</select>${errOf(e, "sex")}</div>
    </div>
    <div class="field"><label for="prof-birth">Geburtsdatum</label><input id="prof-birth" data-prof="birthDate" type="date" max="${esc(today())}" value="${esc(f.birthDate)}" ${e?.birthDate ? 'aria-invalid="true"' : ""}>${
      e?.birthDate ? errOf(e, "birthDate") : !f.birthDate && p.birth_year ? `<p class="muted small">Bisher nur das Geburtsjahr ${esc(String(p.birth_year))} eingetragen.</p>` : ""
    }</div>
    ${f.sex === "female" ? `<div class="field"><label for="prof-phase">Schwangerschaft/Stillzeit</label><select id="prof-phase" data-prof="lifePhase">${opt(D.LIFE_PHASE_OPTIONS, f.lifePhase)}</select>${errOf(e, "lifePhase")}</div>` : ""}
    <p class="muted small card-info">Geschlecht, Alter und Größe braucht die App für Energiebedarf und Referenzwerte – wie am PC.</p>
    ${autoNote("profile", Boolean(e && Object.values(e).some(Boolean)))}
    ${syncNote}
  </section>`;
}

function mealsCard(db) {
  const S = X.S;
  const cur = currentMeals(db);
  const f = S.setMeals ?? mealForm(cur);
  const e = f.errors;
  const active = shownCount(f);
  const rows = PS.DEFAULT_MEALS.map(
    (s) => `<li class="set-meal">
      <label class="toggle"><input type="checkbox" data-meal-show="${s}" ${f.hidden.includes(s) ? "" : "checked"}> <span class="sr-only">In der Liste</span></label>
      <div class="field"><label for="meal-${s}" class="small muted">${esc(PS.MEAL_LABELS[s])}</label><input id="meal-${s}" data-meal-name="${s}" type="text" maxlength="60" placeholder="${esc(PS.MEAL_LABELS[s])}" value="${esc(f.names[s] ?? "")}" ${e?.[s] ? 'aria-invalid="true"' : ""}>${errOf(e, s)}</div>
    </li>`,
  ).join("");
  const workout = N.WORKOUT_MEALS.map(
    (w) => `<li class="set-meal">
      <label class="toggle"><input type="checkbox" data-meal-wshow="${esc(w)}" ${f.workout.includes(w) ? "checked" : ""}> <span class="sr-only">Im Tagebuch anzeigen</span></label>
      <div class="field"><span class="small muted">Workout-Mahlzeit · immer zur Wahl</span><b>${esc(w)}</b></div>
    </li>`,
  ).join("");
  const extras = f.extras
    .map(
      (n, i) => `<li class="set-meal">
      <label class="toggle"><input type="checkbox" data-meal-xshow="${i}" ${f.extraShow[i] === false ? "" : "checked"}> <span class="sr-only">Im Tagebuch anzeigen</span></label>
      <div class="field"><label for="meal-x${i}" class="small muted">Eigene Mahlzeit ${i + 1}</label><input id="meal-x${i}" data-meal-extra="${i}" type="text" maxlength="60" value="${esc(n)}" ${e?.[`extras.${i}`] ? 'aria-invalid="true"' : ""}>${errOf(e, `extras.${i}`)}</div>
      <button class="btn sm ghost danger" data-act="meal-extra-del" data-arg="${i}" aria-label="Mahlzeit entfernen">✕</button>
    </li>`,
    )
    .join("");
  return `<section class="card" id="set-meals">
    <div class="wo-head"><h3>Mahlzeiten</h3><span class="tag">${active} von ${PS.MAX_MEALS}</span></div>
    <p class="muted small card-info">Haken = erscheint jeden Tag im Tagebuch; ohne Haken steht eine eigene oder Workout-Mahlzeit nur zur Wahl (z. B. im Tagesverlauf). Standardmahlzeiten umbenennen (leer = Standardname), eigene Mahlzeiten hinten anhängen. Gilt nur für künftige Einträge.</p>
    <ul class="set-list">${rows}${extras}${workout}</ul>
    ${errOf(e, "hidden")}${errOf(e, "extras")}
    <div class="row-actions">
      <button class="btn sm" data-act="meal-extra-add" ${f.extras.length >= 2 * PS.MAX_MEALS ? "disabled" : ""}>+ Eigene Mahlzeit</button>
      ${e ? `<button class="btn sm ghost" data-act="meal-discard">Verwerfen</button>` : ""}
    </div>
    ${autoNote("meals", Boolean(e && Object.values(e).some(Boolean)))}
    ${workoutTargetsHtml(db)}
    ${syncNote}
  </section>`;
}

// ------------------------------------------------------------------ Workout-Richtwerte (1.110.0, wie PC 1.0.184)

const WTL = () => D.workoutTimeline;
const WT_FIELDS = [
  ["postCarbsG", "Kohlenhydrate ab", "g", "fest"],
  ["postProteinG", "Protein ab", "g", "fest"],
  ["postCarbsPerKg", "Kohlenhydrate ab", "g/kg", "pro kg"],
  ["postProteinPerKg", "Protein ab", "g/kg", "pro kg"],
  ["postWindowMin", "Post-Workout innerhalb von", "min", "nach dem Training"],
  ["preLightFrom", "Pre-Workout ab", "min", "vor dem Training"],
  ["preLightTo", "Pre-Workout bis", "min", "vor dem Training"],
  ["preMealKcal", "Mahlzeit 1–3 Stunden vorher ab", "kcal", ""],
];

/** Richtwerte für die Hinweise im Tagesverlauf (Einstellung `ui.workout_targets`, mit dem PC abgeglichen). */
function workoutTargetsHtml(db) {
  const S = X.S;
  const f = S.setWt ?? { draft: WTL().workoutTargetsDraft(WTL().parseWorkoutTargets(setting(db, WTL().WORKOUT_TARGETS_SETTING))), errors: null };
  const d = f.draft;
  const fields = WT_FIELDS.filter(([k]) => (d.mode === "perKg" ? k !== "postCarbsG" && k !== "postProteinG" : k !== "postCarbsPerKg" && k !== "postProteinPerKg"))
    .map(
      ([k, label, unit, note]) => `<div class="field"><label for="wt-${k}" class="small muted">${esc(label)} (${esc(unit)})${note && note !== "fest" && note !== "pro kg" ? ` · ${esc(note)}` : ""}</label>
        <input id="wt-${k}" data-wt="${k}" type="text" inputmode="${unit === "g/kg" ? "decimal" : "numeric"}" value="${esc(d[k])}" ${f.errors?.[k] ? 'aria-invalid="true"' : ""}>${errOf(f.errors, k)}</div>`,
    )
    .join("");
  return `<div class="set-wt" id="set-workout-targets">
    <h4 class="set-wt__title">Workout-Richtwerte</h4>
    <p class="muted small">Richtwerte für die Hinweise im Tagesverlauf bei Krafttraining und intensivem Cardio. Pro kg rechnet mit deinem letzten Gewicht; ohne Gewicht gelten die festen Gramm.</p>
    <div class="segmented set-wt__mode" role="radiogroup" aria-label="Post-Workout bemessen">
      <button type="button" role="radio" aria-checked="${d.mode === "fixed"}" class="${d.mode === "fixed" ? "is-active" : ""}" data-act="wt-mode" data-arg="fixed">Feste Gramm</button>
      <button type="button" role="radio" aria-checked="${d.mode === "perKg"}" class="${d.mode === "perKg" ? "is-active" : ""}" data-act="wt-mode" data-arg="perKg">Pro kg Körpergewicht</button>
    </div>
    <div class="set-wt__grid">${fields}</div>
    ${f.errors ? `<p class="field-error">Nicht gespeichert – bitte die markierten Felder prüfen.</p>` : ""}
    <div class="row-actions">
      <button class="btn sm ghost" data-act="wt-default">Standardwerte wiederherstellen</button>
      ${f.errors ? `<button class="btn sm ghost" data-act="wt-discard">Verwerfen</button>` : ""}
    </div>
  </div>`;
}

function readWt() {
  const S = X.S;
  const f = S.setWt ?? { draft: WTL().workoutTargetsDraft(WTL().parseWorkoutTargets(setting(buildDb(), WTL().WORKOUT_TARGETS_SETTING))), errors: null };
  for (const el of document.querySelectorAll("[data-wt]")) f.draft[el.dataset.wt] = el.value;
  S.setWt = f;
  return f;
}

function methodsCard(db) {
  const S = X.S;
  const cur = PS.parseMethods(setting(db, "measurement_methods"));
  const f = S.setMethods ?? { list: cur, errors: null };
  const e = f.errors;
  const topics = PS.METHOD_TOPICS.map(([k, label]) => {
    const items = f.list[k] ?? [];
    return `<details class="set-topic" ${S.setMethodsOpen === k || (e && Object.keys(e).some((x) => x === k || x.startsWith(`${k}.`))) ? "open" : ""}>
      <summary><b>${esc(label)}</b> <span class="muted small">${items.length ? esc(items.join(", ")) : "keine"}</span></summary>
      <ul class="set-list">${items
        .map(
          (m, i) => `<li class="set-meal"><button class="btn sm ghost danger" data-act="method-del" data-arg="${k}.${i}" aria-label="Methode entfernen">✕</button>
          <div class="field"><input data-method="${k}.${i}" type="text" maxlength="40" value="${esc(m)}" aria-label="${esc(label)} ${i + 1}" ${e?.[`${k}.${i}`] ? 'aria-invalid="true"' : ""}>${errOf(e, `${k}.${i}`)}</div></li>`,
        )
        .join("")}</ul>${errOf(e, k)}
      <button class="btn sm" data-act="method-add" data-arg="${k}" ${items.length >= 30 ? "disabled" : ""}>+ Methode</button>
    </details>`;
  }).join("");
  return `<section class="card" id="set-methods">
    <h3>Messmethoden</h3>
    <p class="muted small card-info">Je Thema die Methoden, die du beim Erfassen wählst (z. B. Waage, Maßband, Polar) – höchstens 30, je bis 40 Zeichen.</p>
    ${topics}
    ${e ? `<div class="row-actions"><button class="btn sm ghost" data-act="method-discard">Verwerfen</button></div>` : ""}
    ${autoNote("methods", Boolean(e && Object.values(e).some(Boolean)))}
    ${syncNote}
  </section>`;
}

function appearanceCard() {
  const p = X.S.prefs;
  return `<section class="card" id="set-appearance">
    <h3>Darstellung</h3>
    <div class="field"><span class="field-label">Design</span>${segmented("pref-theme", DP.THEMES, p.theme)}</div>
    <div class="field"><span class="field-label">Untere Leiste zeigt</span>${segmented("pref-barlabels", DP.BAR_LABELS, p.barLabels)}</div>
    <div class="field"><span class="field-label">Overview</span>${segmented("pref-ovmode", [["reduced", "Reduziert"], ["full", "Ausführlich"]], p.overviewMode ?? "reduced")}
      <p class="muted small card-info">Reduziert: oben „Heute“ (Erholung, Kalorien und Protein, Training, offene Punkte, Wasser und Schritte), die übrigen Karten zugeklappt mit einer Kennzahl.</p></div>
    ${X.barSlotsHtml()}
    ${deviceNote}
  </section>`;
}

function dayStartCard(db) {
  const v = PS.validDayStart(setting(db, "ui.day_start")) ?? "00:00";
  return `<section class="card" id="set-daystart">
    <h3>Tageswechsel</h3>
    <div class="field"><label for="day-start">Neuer Tag beginnt um</label><input id="day-start" type="time" value="${esc(v)}" data-daystart="1">
      ${X.S.dayStartError ? `<p class="field-error">${esc(X.S.dayStartError)}</p>` : ""}
      <p class="muted small card-info">Bis zu dieser Uhrzeit zählt alles noch zum Vortag (Voreinstellung 00:00 Uhr, spätestens 12:00 Uhr). „Heute“ ist gerade der ${esc(D.formatDate(today()))}.</p></div>
    ${v !== "00:00" ? `<button class="btn sm ghost" data-act="daystart-reset">Auf 00:00 Uhr zurücksetzen</button>` : ""}
    <div class="field"><span class="field-label">Tagesverlauf der Mahlzeiten</span>${segmented("mtl-foldset", [["sleep", "Optimiert (Schlafdaten)"], ["all", "Alles anzeigen"]], setting(db, "ui.meals_sleep_fold") === "all" ? "all" : "sleep")}
      <p class="muted small card-info">Optimiert: Die Schlafzeit aus dem Schlafprotokoll wird zusammengeklappt, solange dort nichts eingetragen ist.</p></div>
    ${syncNote}
  </section>`;
}

function remindersCard(db) {
  const p = X.S.prefs;
  const secret = setting(db, "secret_protocols") === "1";
  const hints = { weigh: "wenn für heute noch kein Gewicht eingetragen ist", supplements: "wenn für heute noch keine Einnahme eingetragen ist", hrt: "am Tag der nächsten Gabe laut bisherigem Abstand, solange sie fehlt" };
  const kinds = D.REMINDER_KINDS.filter((k) => k !== "hrt" || secret);
  const perm = typeof Notification === "undefined" ? "none" : Notification.permission;
  return `<section class="card" id="set-reminders">
    <h3>Erinnerungen</h3>
    <p class="muted small card-info">Höchstens einmal am Tag ab der gewählten Uhrzeit – als Hinweis oben in der Overview und, wenn erlaubt, als Benachrichtigung. Ohne Server meldet sich die App nur, solange sie geöffnet ist (auch kurz im Hintergrund), nicht bei geschlossener App.</p>
    <ul class="set-list">${kinds
      .map(
        (k) => `<li class="set-rem">
        <label class="toggle"><input type="checkbox" data-rem-on="${k}" ${p.reminders[k].on ? "checked" : ""}> <span><b>${esc(D.REMINDER_LABELS[k])}</b><br><span class="small">${esc(hints[k])}</span></span></label>
        <input type="time" data-rem-time="${k}" value="${esc(p.reminders[k].time)}" aria-label="Uhrzeit ${esc(D.REMINDER_LABELS[k])}" ${p.reminders[k].on ? "" : "disabled"}>
      </li>`,
      )
      .join("")}</ul>
    ${
      perm === "default"
        ? `<button class="btn block" data-act="notify-permit">Benachrichtigungen erlauben</button>`
        : perm === "denied"
          ? `<p class="muted small">Benachrichtigungen sind für die App ausgeschaltet (Einstellungen des Handys). Die Hinweise erscheinen trotzdem in der Overview.</p>`
          : perm === "none"
            ? `<p class="muted small">Dieses Handy bietet der App keine Benachrichtigungen an (auf dem iPhone erst, wenn die App zum Home-Bildschirm hinzugefügt ist). Die Hinweise erscheinen in der Overview.</p>`
            : `<button class="btn sm ghost" data-act="notify-test">Probe-Benachrichtigung</button>`
    }
    ${deviceNote}
  </section>`;
}

function quickCard() {
  const p = X.S.prefs;
  const items = DP.quickItems(QUICK, p.quick, { all: true });
  return `<section class="card" id="set-quick">
    <h3>Schnellerfassung</h3>
    <p class="muted small">Was das „+“ in der unteren Leiste anbietet und in welcher Reihenfolge.</p>
    <ul class="set-list">${items
      .map(
        (q, i) => `<li class="set-order">
        <label class="toggle"><input type="checkbox" data-quick-show="${q.id}" ${p.quick.hidden.includes(q.id) ? "" : "checked"}> <span>${esc(q.label)}</span></label>
        <span class="row-actions"><button class="btn sm ghost" data-act="quick-move" data-arg="${q.id}|-1" ${i === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button><button class="btn sm ghost" data-act="quick-move" data-arg="${q.id}|1" ${i === items.length - 1 ? "disabled" : ""} aria-label="Nach unten">↓</button></span>
      </li>`,
      )
      .join("")}</ul>
    ${p.quick.order.length || p.quick.hidden.length ? `<button class="btn sm ghost" data-act="quick-reset">Standard</button>` : ""}
    ${deviceNote}
  </section>`;
}

function layoutsCard(db) {
  return `<section class="card" id="set-layouts">
    <h3>Seiten anpassen</h3>
    <p class="muted small card-info">Karten einer Seite umsortieren oder ausblenden – „Anpassen“ öffnet die Seite im Bearbeiten-Modus.</p>
    <ul class="list">${LAYOUT_PAGES.filter(([key]) => key !== "ui.transfer_layout")
      .map(([key, view, label]) => {
        const l = D.parseLayout(setting(db, key));
        const info = l.order.length || l.hidden.length ? `angepasst${l.hidden.length ? ` · ${l.hidden.length} ausgeblendet` : ""}` : "Standard";
        return `<li class="meal-item"><span><b>${esc(label)}</b><br><span class="muted small">${esc(info)}</span></span><button class="btn sm" data-act="layout-edit" data-arg="${esc(key)}|${esc(view)}">Anpassen</button></li>`;
      })
      .join("")}</ul>
    ${syncNote}
  </section>`;
}

function secretCard(db) {
  const on = setting(db, "secret_protocols") === "1";
  return `<section class="card" id="set-secret">
    <h3>Secret Protocols</h3>
    <label class="toggle"><input type="checkbox" data-secret="1" ${on ? "checked" : ""}> <span>Bereich „Superhuman“ (Hormontherapie, Einnahme-Protokoll) anzeigen</span></label>
    <p class="muted small card-info">Ausgeschaltet verschwindet der Bereich aus dem Menü; gespeicherte Einträge bleiben erhalten.</p>
    ${syncNote}
  </section>`;
}

function transferCard(db) {
  const p = X.S.prefs;
  const l = D.parseLayout(setting(db, "ui.transfer_layout"));
  return `<section class="card" id="set-transfer">
    <h3>Import/Export</h3>
    <div class="field"><label for="send-remind">Erinnerung ans Senden</label>
      <select id="send-remind" data-transfer="remindDays">${DP.SEND_REMIND_DAYS.map((d) => `<option value="${d}" ${d === p.transfer.remindDays ? "selected" : ""}>${d === 0 ? "aus" : d === 1 ? "nach 1 Tag" : `nach ${d} Tagen`}</option>`).join("")}</select>
      <p class="muted small card-info">Hinweis in der Overview, wenn Daten offen sind und so lange nichts an den PC gesendet wurde.</p></div>
    <label class="toggle"><input type="checkbox" data-transfer="autoMark" ${p.transfer.autoMark ? "checked" : ""}> <span>Nach dem Senden automatisch als übertragen markieren (sobald die Datei weitergegeben oder gesichert ist)</span></label>
    <div class="meal-item"><span><b>Karten der Seite</b><br><span class="muted small">${l.order.length || l.hidden.length ? "angepasst" : "Standard"}</span></span><button class="btn sm" data-act="layout-edit" data-arg="ui.transfer_layout|transfer">Anordnen</button></div>
    ${deviceNote.replace("(am PC gibt es eine eigene Einstellung)", "– bis auf die Anordnung der Karten, die gilt wie am PC")}
  </section>`;
}

/**
 * Gruppen der Settings (1.117.0, Verbesserung 12): zuklappbar, mit Suche über alle Karten.
 * Offene Gruppen merkt sich die Sitzung (`S.setGroupsOpen`), damit sie nach dem Speichern offen bleiben.
 */
const SET_GROUPS = [
  ["profil", "Profil und Konten"],
  ["ziele", "Ziele"],
  ["ernaehrung", "Training und Ernährung"],
  ["anzeige", "Darstellung und Bedienung"],
  ["daten", "Daten und Datenschutz"],
  ["hilfe", "Hilfe und FAQ"],
];

/** Überschriften der Karten einer Gruppe (für die Zeile unter dem Gruppennamen) */
const cardTitles = (html) => [...html.matchAll(/<h3[^>]*>([^<]+)/g)].map((m) => m[1].trim());

function groupHtml(id, title, cards, open) {
  const body = cards.filter(Boolean).join("");
  if (!body) return "";
  const names = cardTitles(body);
  return `<section class="set-group${open ? " is-open" : ""}" data-set-group="${id}">
    <button class="set-group__head" data-act="set-group" data-arg="${id}" aria-expanded="${open}">
      <span><b>${esc(title)}</b><span class="muted small set-group__names">${esc(names.join(" · "))}</span></span>
      <span class="chev" aria-hidden="true">${open ? "▾" : "▸"}</span>
    </button>
    <div class="set-group__body"${open ? "" : " hidden"}>${body}</div>
  </section>`;
}

/** Ganze Settings-Seite. */
export function viewSettings() {
  const S = X.S;
  let db = null;
  try {
    db = S.catalog ? buildDb() : null;
  } catch {
    db = null;
  }
  const open = PS.unsentSync(S.pcsettings);
  const isOpen = new Set(S.setGroupsOpen ?? []);
  const goalsCard = `<section class="card">
      <h3>Tagesziele</h3>
      <p class="muted small card-info">Energie (fest oder dynamisch aus dem Verbrauch), Makros, Schlaf, Gewicht, Schritte und Wasser – wie am PC.</p>
      <button class="btn block" data-act="goals-open">Tagesziele festlegen</button>
    </section>`;
  const helpCard = `<section class="card">
      <h3>Hilfe</h3>
      <p class="muted small">Version ${esc(X.version)} · Bedienung, Datenschutz und Datenaustausch.</p>
      <button class="btn block" data-go="help">Hilfe öffnen</button>
      ${S.catalog?.startpaket && S.prefs.setup?.dismissed ? `<button class="linkbtn small" data-act="setup-show">„Erste Schritte“ wieder in der Overview zeigen</button>` : ""}
    </section>`;
  const groups = {
    profil: [db ? profileCard(db) : "", X.accountsCard()],
    ziele: [goalsCard, db ? weekGoalsCard(db) : "", db ? mainGoalsCard(db) : ""],
    ernaehrung: [db ? mealsCard(db) : "", db ? cardioSettingsCard(db) : "", db ? methodsCard(db) : ""],
    anzeige: [appearanceCard(), db ? dayStartCard(db) : "", db ? remindersCard(db) : "", quickCard(), db ? layoutsCard(db) : ""],
    daten: [db ? transferCard(db) : "", db ? secretCard(db) : ""],
    hilfe: [faqCardHtml(), helpCard],
  };
  // Suche bleibt nach dem Neuzeichnen aktiv
  if (String(S.setQuery ?? "").trim()) queueMicrotask(applySettingsSearch);
  return `${X.header("Settings")}<main class="wrap">
    <div class="set-search"><label for="set-q" class="sr-only">Settings durchsuchen</label>
      <input id="set-q" type="search" data-set-search="1" placeholder="Settings durchsuchen …" autocomplete="off" value="${esc(S.setQuery ?? "")}"></div>
    ${open ? `<section class="card hl"><p class="small">${open === 1 ? "1 Änderung" : `${open} Änderungen`} an den Einstellungen noch nicht am PC.</p><button class="btn block" data-go="send">An den PC senden</button></section>` : ""}
    ${SET_GROUPS.map(([id, title]) => groupHtml(id, title, groups[id], isOpen.has(id))).join("")}
    <p class="muted small set-search__none" hidden>Nichts gefunden.</p>
  </main>`;
}

/** Suche in den Settings: Karten mit Treffer zeigen, ihre Gruppen aufklappen (ohne neu zu zeichnen) */
export function applySettingsSearch() {
  const q = String(X.S.setQuery ?? "").trim().toLowerCase();
  let any = false;
  for (const g of document.querySelectorAll(".set-group")) {
    const body = g.querySelector(".set-group__body");
    const head = g.querySelector(".set-group__head");
    let hits = 0;
    for (const card of body.children) {
      const hit = !q || card.textContent.toLowerCase().includes(q);
      card.hidden = !hit;
      if (hit) hits++;
    }
    // Gruppenname passt, aber keine Karte: ganze Gruppe zeigen
    const titleHit = Boolean(q) && !hits && head.textContent.toLowerCase().includes(q);
    if (titleHit) for (const card of body.children) card.hidden = false;
    g.hidden = Boolean(q) && !hits && !titleHit;
    const open = q ? hits > 0 || titleHit : g.classList.contains("is-open");
    body.hidden = !open;
    head.setAttribute("aria-expanded", String(open));
    if (!g.hidden) any = true;
  }
  const none = document.querySelector(".set-search__none");
  if (none) none.hidden = any;
}

/** Eingabe im Suchfeld der Settings. `true` = behandelt. */
export function settingsInput(el) {
  if (!el.dataset?.setSearch) return false;
  X.S.setQuery = el.value;
  applySettingsSearch();
  return true;
}

// ------------------------------------------------------------------ Eingaben

/** Profilformular aus den Feldern lesen. */
function readProfile() {
  const S = X.S;
  const db = buildDb();
  const p = db.profile ?? {};
  const f = S.setProfile ?? { name: p.name ?? "", height: "", birthDate: p.birth_date ?? "", sex: p.sex ?? "", lifePhase: p.life_phase ?? "", errors: null };
  for (const el of document.querySelectorAll("[data-prof]")) f[el.dataset.prof] = el.value;
  S.setProfile = f;
  return f;
}

function readMeals() {
  const S = X.S;
  const cur = currentMeals(buildDb());
  const f = S.setMeals ?? mealForm(cur);
  for (const el of document.querySelectorAll("[data-meal-name]")) f.names[el.dataset.mealName] = el.value;
  for (const el of document.querySelectorAll("[data-meal-xshow]")) f.extraShow[Number(el.dataset.mealXshow)] = el.checked;
  for (const el of document.querySelectorAll("[data-meal-wshow]")) {
    const w = el.dataset.mealWshow;
    f.workout = el.checked ? [...new Set([...f.workout, w])] : f.workout.filter((x) => x !== w);
  }
  for (const el of document.querySelectorAll("[data-meal-show]")) {
    const s = el.dataset.mealShow;
    f.hidden = el.checked ? f.hidden.filter((h) => h !== s) : [...new Set([...f.hidden, s])];
  }
  for (const el of document.querySelectorAll("[data-meal-extra]")) f.extras[Number(el.dataset.mealExtra)] = el.value;
  S.setMeals = f;
  return f;
}

function readMethods() {
  const S = X.S;
  const f = S.setMethods ?? { list: PS.parseMethods(setting(buildDb(), "measurement_methods")), errors: null };
  for (const el of document.querySelectorAll("[data-method]")) {
    const [k, i] = el.dataset.method.split(".");
    if (f.list[k]) f.list[k][Number(i)] = el.value;
  }
  S.setMethods = f;
  return f;
}

async function savePrefs() {
  X.S.prefs = DP.normPrefs(X.S.prefs);
  await X.saveNow();
  X.applyPrefs();
}

/** Profilbild in die Profilzeile schreiben (geht wie das Profil mit „An den PC senden“ an den PC). */
async function saveProfilePhoto(photo) {
  const S = X.S;
  const cur = buildDb()?.profile;
  if (!cur) return X.toast("Bitte zuerst das Profil anlegen.", true);
  const { id: _id, updated_at: _u, ...row } = cur;
  S.pcsettings = PS.normSync(S.pcsettings);
  PS.setProfile(S.pcsettings, { ...row, photo });
  await X.store.set("pcsettings", S.pcsettings);
  X.toast(photo ? "Profilbild gespeichert" : "Profilbild entfernt");
  X.rerender();
}

async function chooseProfilePhoto(source) {
  try {
    const url = await cropPhoto(source, { title: "Ausschnitt für das Profilbild", maxSide: 512 });
    if (url) await saveProfilePhoto(url);
  } catch {
    X.toast("Das Bild konnte nicht gelesen werden.", true);
  }
}

export const settingsActions = {
  // Profilbild (1.63.0): Kamera oder Fotomediathek, quadratischer Ausschnitt, wie am PC
  "prof-photo-pick": () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void chooseProfilePhoto(file);
    });
    input.click();
  },
  "prof-photo-crop": () => {
    const photo = buildDb()?.profile?.photo;
    if (photo) void chooseProfilePhoto(photo);
  },
  "prof-photo-remove": () => saveProfilePhoto(null),
  "set-group": (el) => {
    const S = X.S;
    const id = el.dataset.arg;
    const open = new Set(S.setGroupsOpen ?? []);
    if (open.has(id)) open.delete(id);
    else open.add(id);
    S.setGroupsOpen = [...open];
    X.rerender();
  },
  "autosave-undo": async () => {
    const S = X.S;
    const n = S.autoNote;
    if (!n?.undo) return;
    await n.undo();
    S.setProfile = S.setMeals = S.setWt = S.setMethods = null;
    S.autoNote = { card: n.card, undo: null, undone: true };
    buildDb();
    X.rerender();
  },
  "meal-extra-add": () => {
    const f = readMeals();
    f.extras.push("");
    f.extraShow.push(shownCount(f) < PS.MAX_MEALS);
    X.rerender();
    setTimeout(() => document.getElementById(`meal-x${f.extras.length - 1}`)?.focus(), 0);
  },
  "meal-extra-del": (el) => {
    const f = readMeals();
    f.extras.splice(Number(el.dataset.arg), 1);
    f.extraShow.splice(Number(el.dataset.arg), 1);
    f.errors = null;
    void autoMeals();
  },
  "wt-mode": (el) => {
    const f = readWt();
    f.draft.mode = el.dataset.arg === "perKg" ? "perKg" : "fixed";
    f.errors = null;
    void autoWt();
  },
  "wt-discard": () => {
    X.S.setWt = null;
    X.rerender();
  },
  "wt-default": async () => {
    X.S.setWt = null;
    await saveSettings("meals", [[WTL().WORKOUT_TARGETS_SETTING, JSON.stringify(WTL().DEFAULT_WORKOUT_TARGETS)]]);
  },
  "meal-discard": () => {
    X.S.setMeals = null;
    X.rerender();
  },
  "method-add": (el) => {
    const f = readMethods();
    f.list[el.dataset.arg].push("");
    X.S.setMethodsOpen = el.dataset.arg;
    X.rerender();
  },
  "method-del": (el) => {
    const f = readMethods();
    const [k, i] = el.dataset.arg.split(".");
    f.list[k].splice(Number(i), 1);
    f.errors = null;
    X.S.setMethodsOpen = k;
    void autoMethods();
  },
  "method-discard": () => {
    X.S.setMethods = null;
    X.rerender();
  },
  "pref-theme": async (el) => {
    X.S.prefs.theme = el.dataset.arg;
    await savePrefs();
    X.rerender();
  },
  "pref-ovmode": async (el) => {
    X.S.prefs.overviewMode = el.dataset.arg === "full" ? "full" : "reduced";
    await savePrefs();
    X.rerender();
  },
  "pref-barlabels": async (el) => {
    X.S.prefs.barLabels = el.dataset.arg;
    await savePrefs();
    X.rerender();
  },
  "mtl-foldset": async (el) => {
    await putSetting("ui.meals_sleep_fold", el.dataset.arg === "all" ? "all" : null);
    buildDb();
    X.rerender();
  },
  "daystart-reset": async () => {
    X.S.dayStartError = null;
    await saveDayStart("00:00");
    X.toast("Tageswechsel 00:00 Uhr");
    X.rerender();
  },
  "notify-permit": async () => {
    try {
      const r = await Notification.requestPermission();
      X.toast(r === "granted" ? "Benachrichtigungen erlaubt" : "Nicht erlaubt – Hinweise erscheinen in der Overview", r !== "granted");
    } catch {
      X.toast("Benachrichtigungen sind hier nicht möglich.", true);
    }
    X.rerender();
  },
  "notify-test": async () => {
    await X.notify("LIFESPAN OS", "So sehen die Erinnerungen aus.");
  },
  "quick-move": async (el) => {
    const [id, by] = el.dataset.arg.split("|");
    X.S.prefs.quick = DP.changeQuick(QUICK, X.S.prefs.quick, { move: { id, by: Number(by) } });
    await savePrefs();
    X.rerender();
  },
  "quick-reset": async () => {
    X.S.prefs.quick = { order: [], hidden: [] };
    await savePrefs();
    X.rerender();
  },
  "layout-edit": (el) => {
    const [key, view] = el.dataset.arg.split("|");
    setLayoutEditing(key);
    X.go(view);
    window.scrollTo(0, 0);
  },
};

/** Änderungen an Feldern, die sofort gelten. `true` = behandelt. */
export function settingsChange(el) {
  const S = X.S;
  if (el.dataset?.prof) {
    void autoProfile();
    return true;
  }
  if (el.dataset?.mealName !== undefined || el.dataset?.mealShow !== undefined || el.dataset?.mealXshow !== undefined || el.dataset?.mealWshow !== undefined || el.dataset?.mealExtra !== undefined) {
    void autoMeals();
    return true;
  }
  if (el.dataset?.wt) {
    void autoWt();
    return true;
  }
  if (el.dataset?.method) {
    void autoMethods();
    return true;
  }
  if (el.dataset?.daystart) {
    const v = PS.validDayStart(el.value);
    if (!v) {
      S.dayStartError = "Bitte eine Uhrzeit zwischen 00:00 und 12:00 Uhr wählen.";
      X.rerender();
      return true;
    }
    S.dayStartError = null;
    void saveDayStart(v).then((changed) => {
      if (changed) X.toast(`Neuer Tag ab ${v} Uhr`);
      X.rerender();
    });
    return true;
  }
  if (el.dataset?.remOn) {
    DP.setReminder(S.prefs, el.dataset.remOn, { on: el.checked });
    void savePrefs().then(() => X.rerender());
    return true;
  }
  if (el.dataset?.remTime) {
    if (!DP.setReminder(S.prefs, el.dataset.remTime, { time: el.value })) X.toast("Bitte eine Uhrzeit angeben.", true);
    void savePrefs();
    return true;
  }
  if (el.dataset?.quickShow) {
    const next = DP.changeQuick(QUICK, S.prefs.quick, { toggle: el.dataset.quickShow });
    if (next === S.prefs.quick) {
      X.toast("Mindestens ein Eintrag bleibt in der Schnellerfassung.", true);
      el.checked = true;
      return true;
    }
    S.prefs.quick = next;
    void savePrefs().then(() => X.rerender());
    return true;
  }
  if (el.dataset?.transfer === "remindDays") {
    S.prefs.transfer = { ...S.prefs.transfer, remindDays: Number(el.value) };
    void savePrefs();
    return true;
  }
  if (el.dataset?.transfer === "autoMark") {
    S.prefs.transfer = { ...S.prefs.transfer, autoMark: el.checked };
    void savePrefs();
    return true;
  }
  if (el.dataset?.secret) {
    void putSetting("secret_protocols", el.checked ? "1" : "0").then(() => {
      X.applyPrefs();
      X.toast(el.checked ? "Superhuman wird angezeigt" : "Superhuman ausgeblendet");
      X.rerender();
    });
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ Seiten anpassen

/** Karten-IDs der Seite im Bearbeiten-Modus (aus den Feldern der Liste). */
const editorIds = () => [...document.querySelectorAll("[data-layout-show]")].map((el) => el.dataset.layoutShow.split("|")[1]);

async function saveLayout(key, layout) {
  const plain = { order: layout.order, hidden: layout.hidden, emptyLast: layout.emptyLast !== false };
  if (Array.isArray(layout.introduced)) plain.introduced = layout.introduced;
  await putSetting(key, JSON.stringify(plain));
}

export const layoutActions = {
  "layout-move": async (el) => {
    const [key, id, by] = el.dataset.arg.split("|");
    const layout = D.parseLayout(setting(buildDb(), key));
    await saveLayout(key, PS.layoutWith(layout, editorIds(), { move: { id, by: Number(by) } }));
    X.rerender();
  },
  "layout-reset": async (el) => {
    await putSetting(el.dataset.arg, null);
    X.toast("Standardanordnung");
    X.rerender();
  },
  "layout-done": () => {
    setLayoutEditing(null);
    X.rerender();
  },
};

/** Ausblenden im Bearbeiten-Modus. */
export function layoutChange(el) {
  if (!el.dataset?.layoutShow) return false;
  const [key, id] = el.dataset.layoutShow.split("|");
  const layout = D.parseLayout(setting(buildDb(), key));
  void saveLayout(key, PS.layoutWith(layout, editorIds(), { toggle: id })).then(() => X.rerender());
  return true;
}
