// LIFESPAN OS Mobil – Nutrition wie am PC (1.5.0): Reiter „Tagebuch“ (Tagessumme gegen Ziele,
// Wasserhaushalt, Mahlzeiten, Supplements, Fasttracking, Mikronährstoffe – Anordnung wie am PC)
// und „Verlauf“ (Energie je Tag). Rechnung: pcdb.js (wie der Rust-Kern) und pcdomain.js (wie
// src/domain). Wasser kann am Handy bearbeitet werden und geht mit der Ernährung an den PC.
// Seit 1.75.0 aufgeteilt: Supplements und Fasttracking in diarysupp.js, Aktionen und Eingaben in diaryactions.js.
import * as P from "./pcdb.js";
import * as C from "./core.js";
import * as PS from "./pcsettings.js";
import { arrangeCards } from "./layoutedit.js";
import * as D from "./pcdomain.js";
import * as N from "./nutrition.js";
import * as RC from "./recipes.js";
import * as SP from "./supplements.js";
import * as GL from "./goals.js";
import { phoneLogs } from "./logsdata.js";
import { CATALOG, GROUPS } from "./nutrientcatalog.js";
import { barTrendSvg, COLOR, compareHtml, dayGoalHtml, macroBreakdownHtml } from "./pcview.js";
import * as FT from "./fastdata.js";
import * as QM from "./quickmeal.js";
import * as GLD from "./glucosedata.js";
import { fastCard, supplementsCard } from "./diarysupp.js";
import { caffeineSlotHtml } from "./diarycaffeine.js";
import { timelineHtml } from "./mealtimeline.js";
import { withCarbCycle } from "./carbcycle.js";
export { initTimelineDrag, timelineActions, timelineChange } from "./mealtimeline.js";
export { diaryCaffeineActions, diaryCaffeineChange } from "./diarycaffeine.js";
export { viewFastEntry, viewSuppIntake } from "./diarysupp.js";
export { diaryActions, diaryChange, diaryInput } from "./diaryactions.js";

import { diaryExportHtml } from "./pdfparity.js";
import { extrasCard } from "./diaryextras.js";
import * as BL from "./bls.js";
import { ensureBls } from "./blsui.js";
export let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice, buildReturnTables }

export function initDiary(ctx) {
  X = ctx;
}

export const esc = (v) => X.esc(v);

export const pad = (n) => String(n).padStart(2, "0");

/** „Heute“ mit dem Tageswechsel wie am PC (1.48.0). */
export const today = () => C.appDay();

/**
 * Nach Supplement bzw. Koffein aus dem Tagesverlauf (1.123.0, wie PC 1.0.199): Tagesverlauf auf die
 * aktuelle Uhrzeit (sonst den Griff) zentrieren – nur, wenn der Eintrag von dort kam.
 */
export function backToNowIfFromTimeline() {
  if (!X.S.fromTimeline) return;
  X.S.fromTimeline = false;
  setTimeout(() => (document.querySelector(".mtl-now") ?? document.querySelector(".mtl-handle"))?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
}

export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// ------------------------------------------------------------------ Daten (PC + Handy)

/**
 * Zusammengeführte Daten für die Ansichten wie am PC: Export vom PC plus alles, was am Handy
 * erfasst und noch nicht wieder vom PC geladen wurde (Mahlzeiten, Lebensmittel, Wasser,
 * Körperwerte, Trainings).
 */
export function buildDb() {
  const S = X.S;
  const food = S.food?.local;
  const water = P.phoneWater(S.water);
  // Einstellungen und Profil, am Handy geändert (1.48.0)
  const pcs = PS.phoneSettings(S.pcsettings);
  let workouts = {};
  try {
    workouts = X.buildReturnTables();
  } catch {
    workouts = {};
  }
  const db = P.makeDb(S.catalog, {
    foods: food ? Object.values(food.foods).map((f) => [f.row.id, f.row]) : [],
    meals: food ? Object.values(food.meals) : [],
    water: water.water,
    settings: { ...water.settings, ...pcs.settings },
    deletedSettings: pcs.deletedSettings,
    profile: pcs.profile,
    body: Object.values(S.body?.local.entries ?? {}).map((e) => e.row),
    workouts,
    exercises: S.localExercises ?? [],
    logs: phoneLogs(S.logs),
    supp: SP.phoneSupp(S.supp),
    goals: GL.phoneGoals(S.goals),
    fast: FT.phoneFast(S.fast),
    // Vorlagen & Rezepte am Handy bearbeitet (1.147.0)
    recipes: food ? RC.phoneRecipes(food) : null,
  });
  // Mahlzeitenliste wie am PC (Settings → Mahlzeiten: meal_name.*, meal_hidden, meal_extra)
  D.setMealList(N.setMealConfig(db.settings));
  // Tageswechsel wie am PC (ui.day_start, 1.48.0)
  C.setDayStart(db.settings.get("ui.day_start") ?? null);
  C.setDayStartHistory(db.settings.get("ui.day_start_history") ?? null);
  return db;
}

/** Geplante Mahlzeiten eines Tages für die Tagessumme (nach Uhrzeit ab Tageswechsel, 1.102.0). */
function plannedMealsForSum(date) {
  const S = X.S;
  if (!S.food?.local || !S.catalog) return [];
  const start = C.dayStartMinutesOn(date);
  const ax = (t) => {
    const m = /^(\d{2}):(\d{2})$/.exec(t ?? "");
    const v = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
    return v < start ? v + 1440 : v;
  };
  try {
    return N.plannedOn(S.catalog, S.food.local, date).sort((a, b) => ax(a.time) - ax(b.time));
  } catch {
    return [];
  }
}

/** Nährstoffkatalog wie `fasttrack::catalog` (eingebaute Felder, eigene Felder je Gruppe am Ende). */
export function nutrientCatalog(db) {
  const stored = db.nutrientFields ?? [];
  const nutrients = [];
  for (const g of GROUPS) {
    for (const d of CATALOG.filter((x) => x.group === g.key)) {
      const over = g.key !== "macros" ? stored.find((s) => s.builtin && s.key === d.key) : null;
      nutrients.push({ key: d.key, label: over?.label ?? d.label, unit: over?.unit ?? d.unit, group: d.group, sub: d.sub, custom: false });
    }
    for (const s of stored.filter((x) => !x.builtin && x.group_key === g.key)) {
      const clash = CATALOG.some((d) => d.label.toLowerCase() === String(s.label).toLowerCase());
      nutrients.push({ key: s.key, label: clash ? `${s.label} (eigenes Feld)` : s.label, unit: s.unit, group: s.group_key, sub: "", custom: true });
    }
  }
  return { groups: GROUPS, nutrients };
}

// ------------------------------------------------------------------ Kopf mit Reitern

/**
 * Reiter wie am PC (`NutritionPage.tsx`, 1.147.0): fünf Gruppen, „Gerichte & Planen“ und
 * „Datenbanken“ mit Unterreitern. Jeder Unterreiter ist eine Ansicht (data-go).
 */
export const GROUPS_N = [
  ["diary", "Tagebuch", [["diary", "Tagebuch"]]],
  ["scanner", "Scanner & Tracken", [["food", "Scanner & Tracken"]]],
  ["recipes", "Gerichte & Planen", [["recipes", "Vorlagen & Rezepte"], ["meal-plan", "Planen"]]],
  ["history", "Verlauf", [["food-history", "Verlauf"]]],
  [
    "databases",
    "Datenbanken",
    [
      ["food-db", "Lebensmitteldatenbank"],
      ["bls-db", "BLS-Datenbank"],
      ["off-db", "Open Food Facts"],
      ["supp-db", "Supplementdatenbank"],
    ],
  ],
];

/** Bisherige Liste (Ansicht → Name) für Verweise. */
export const TABS = GROUPS_N.flatMap(([, , subs]) => subs);

/** Ansichten, die zu einem Unterreiter gehören (Bearbeiten-Formulare). */
const VIEW_OF = { "recipe-edit": "recipes", "supp-db-edit": "supp-db", "stack-edit": "supp-db" };

// Orange Punkte je Reiter (wie Training): app.js meldet die Quelle an – so bleibt diary.js ohne
// Abhängigkeit von der Oberfläche (Tests mit node)
let tabMarks = () => new Set();
export function setNutritionMarks(fn) {
  tabMarks = fn;
}
const dotHtml = () => `<i class="tab__dot" aria-label="offen"></i>`;

export function nutritionTabs(active) {
  const view = VIEW_OF[active] ?? active;
  const group = GROUPS_N.find(([, , subs]) => subs.some(([v]) => v === view)) ?? GROUPS_N[0];
  let marks = new Set();
  try {
    marks = tabMarks() ?? new Set();
  } catch {
    marks = new Set();
  }
  const marked = (subs) => subs.some(([v]) => marks.has(v));
  const subs = group[2];
  return `<nav class="tabs" aria-label="Nutrition">${GROUPS_N.map(
    ([g, l, list]) =>
      `<button class="tab ${g === group[0] ? "active" : ""}" data-go="${list[0][0]}" ${g === group[0] ? 'aria-current="page"' : ""}>${l}${marked(list) ? dotHtml() : ""}</button>`,
  ).join("")}</nav>${
    subs.length > 1
      ? `<div class="subtabs-row"><div class="segmented subtabs" role="radiogroup" aria-label="${group[1]}">${subs
          .map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === view}" class="${v === view ? "is-active" : ""}" data-go="${v}">${l}${marks.has(v) ? dotHtml() : ""}</button>`)
          .join("")}</div></div>`
      : ""
  }`;
}

export function dayNav(date, act) {
  const wd = WEEKDAYS[new Date(`${date}T12:00:00`).getDay()];
  return `<section class="card day-nav">
    <button class="btn sm" data-act="${act}" data-arg="-1" aria-label="Vortag">‹</button>
    <label class="day-nav__date"><span class="muted small">${date === today() ? "Heute" : `${wd} ${D.formatDate(date)}`}</span>
      <input type="date" data-diary="date" value="${esc(date)}" max="${today()}" aria-label="Tag"></label>
    <button class="btn sm" data-act="${act}" data-arg="1" aria-label="Folgetag" ${date >= today() ? "disabled" : ""}>›</button>
  </section>`;
}

// ------------------------------------------------------------------ Tagebuch

export const OPTIONALS = ["fiberG", "sugarG", "saturatedFatG", "saltG"];

export const withFast = (t, value) => (value === undefined ? t : { ...t, value: (t.value ?? 0) + value });

export function viewDiary() {
  const S = X.S;
  if (!S.catalog?.pc) {
    return `${X.header("Nutrition")}<main class="wrap">${nutritionTabs("diary")}
      <section class="card"><p class="warn">Für das Tagebuch wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Import/Export „Neue Exportdatei laden“.</p></section></main>`;
  }
  if (!S.diaryDate) S.diaryDate = today();
  const date = S.diaryDate;
  const db = buildDb();
  const day = P.mealDay(db, date);
  const meals = day.meals;
  const slots = D.daySlots(day);
  const fast = P.fastDay(db, date);
  const intakes = P.intakesOn(db, date);
  const energy = P.energyFor(db, date);
  const catalog = nutrientCatalog(db);
  const profile = db.profile;

  const supps = D.addNutrientValues(intakes.map((i) => i.nutrients));
  const suppMacros = D.macrosOf(supps);
  const mealValues = D.addNutrientValues(meals.map((m) => m.values ?? {}));
  const hasMealValues = Object.keys(mealValues).length > 0;
  // Stoffe aus Lebensmitteln des BLS (1.119.0, wie PC 1.0.195): nur wenn der BLS auf dem Handy liegt
  const fromFoods = blsFoodMicro(db, meals);
  const micro = D.microValues(catalog, [fromFoods.values, supps, fast?.values ?? {}, mealValues]);
  const microGroups = D.groupedValues(catalog, { values: micro });
  const refGroup = D.referenceGroup(
    profile ? { sex: profile.sex, birthDate: profile.birth_date, birthYear: profile.birth_year, lifePhase: profile.life_phase } : null,
    date,
  );
  const hasSuppMacros = Object.values(suppMacros).some((v) => v > 0);
  const totals = D.sumNutrients([...meals, D.fastNutrients(fast), suppMacros]);
  // Geplante Mahlzeiten hellgrau hinter der Tagessumme, nach Uhrzeit (1.102.0)
  const plannedForSum = plannedMealsForSum(date);
  const weightKg = energy.step.weightKg;
  // Carb-Cycling (1.119.0, wie PC 1.0.195): KH-Ziel nach Trainings- bzw. Ruhetag
  const rawGoal = withCarbCycle(P.goalFor(db, date), db, X.S.catalog, date, energy.trainings?.length ?? 0);
  const goal = rawGoal ? D.withProteinFromWeight(rawGoal, weightKg) : null;
  const proteinNote = D.describeProteinPerKg(goal?.proteinGPerKg, weightKg);
  const dayMacros = goal ? D.dayMacroGoals(goal, D.dailyNeed(goal, energy.step.kcal, energy), energy) : null;
  const goalBased =
    goal !== null &&
    (goal.energyMode === "dynamic" || goal.proteinGPerKg !== null || [goal.energyKcal, goal.proteinG, goal.carbsG, goal.fatG].some((v) => v !== null));
  const energyWithoutGoal = goal !== null && (goal.energyMode === "dynamic" ? energy.totalKcal === null : goal.energyKcal === null);
  const allItems = meals.flatMap((m) => m.items);
  const optional = (key) =>
    key === "saltG"
      ? D.sumOptional(allItems, key)
      : withFast(withFast(withFast(D.sumOptional(allItems, key), fast?.values[D.OPTIONAL_KEYS[key]]), D.optionalOf(supps, key)), mealValues[D.OPTIONAL_KEYS[key]]);

  // ---------------- Karten
  const totalsCard = `<section class="card card--nutrition"><div class="card__head"><h3>Tagessumme</h3>
      <span class="card__meta">${goal ? `Ziele gültig ab ${esc(D.formatDate(goal.validFrom))}` : `<button class="linkbtn" data-act="goals-open">Tagesziele festlegen</button>`}</span></div>
    ${
      goalBased && goal
        ? `${dayGoalHtml({ totals, goal, stepKcal: energy.step.kcal, expenditure: energy, planned: plannedForSum })}
          ${proteinNote ? `<p class="muted small">${esc(proteinNote)}</p>` : ""}
          ${
            energyWithoutGoal || dayMacros?.proteinG == null || dayMacros.carbsG === null || dayMacros.fatG === null
              ? `<dl class="compare-list">${energyWithoutGoal ? compareHtml("Energie", totals.energyKcal, null, "kcal") : ""}${
                  dayMacros?.proteinG == null ? compareHtml("Protein", totals.proteinG, null, "g") : ""
                }${dayMacros?.carbsG == null ? compareHtml("Kohlenhydrate", totals.carbsG, null, "g") : ""}${dayMacros?.fatG == null ? compareHtml("Fett", totals.fatG, null, "g") : ""}</dl>`
              : ""
          }`
        : `<dl class="compare-list">${compareHtml("Energie", totals.energyKcal, null, "kcal")}${compareHtml("Protein", totals.proteinG, null, "g")}${compareHtml("Kohlenhydrate", totals.carbsG, null, "g")}${compareHtml("Fett", totals.fatG, null, "g")}</dl>
          ${totals.energyKcal > 0 ? macroBreakdownHtml(totals, "shares") : ""}
          ${plannedForSum.length ? `<p class="muted small">Geplant: ${esc(D.formatKcal(plannedForSum.reduce((x, p) => x + p.energyKcal, 0)))} (${plannedForSum.length === 1 ? "1 Mahlzeit" : `${plannedForSum.length} Mahlzeiten`}, zählt erst nach „Gegessen“)</p>` : ""}
          <p class="card__note">Mit Tageszielen für Energie und Makronährstoffe (Settings → Tagesziele) zeigt die Tagessumme, wie viel noch offen ist (Defizit) oder darüber liegt (Überschuss).</p>`
    }
    ${
      allItems.length > 0 || fast || hasSuppMacros || hasMealValues
        ? `<details class="optional-nutrients"><summary>Weitere Nährwerte</summary><dl>${OPTIONALS.map(
            (k) => `<div><dt>${esc(D.OPTIONAL_LABELS[k])}</dt><dd>${esc(D.describeOptional(optional(k)))}</dd></div>`,
          ).join("")}</dl><p class="card__note">Fehlende Angaben werden nicht als 0 g gezählt.</p></details>`
        : ""
    }
    <p class="card__note">Summen aus ungerundeten Werten; angezeigt auf ganze kcal und 0,1 g gerundet.${fast || hasMealValues ? " Enthält die Fasttracking-Werte dieses Tages." : ""}${hasSuppMacros ? " Enthält Energie und Makronährstoffe aus Supplements." : ""}</p>
  </section>`;

  const cards = [
    { id: "totals", node: totalsCard },
    { id: "water", node: waterCard(db, date, goal) },
    { id: "extras", node: extrasCard(db, date, Boolean(S.extrasOpen)) },
    { id: "micro", node: microCard(catalog, microGroups, micro, refGroup, fast || hasMealValues, fromFoods, db) },
    { id: "fasttrack", empty: !fast, node: fast ? fastCard(catalog, fast, date) : "" },
    { id: "meals", node: mealsCard(slots, fast, date, db) },
    { id: "supplements", node: supplementsCard(intakes, suppMacros, hasSuppMacros) },
  ];
  const ordered = arrangeCards(db, "ui.diary_layout", cards).filter((c) => c.node);

  return `${X.header("Nutrition")}<main class="wrap diary">
    ${nutritionTabs("diary")}
    ${dayNav(date, "diary-shift")}
    ${ordered.map((c) => c.node).join("")}
    ${diaryExportHtml(date)}
    <p class="muted small">Stand vom PC: Export vom ${esc(S.catalog.exportedAt ? D.formatDate(S.catalog.exportedAt.slice(0, 10)) : "–")}. Am Handy Erfasstes ist schon eingerechnet; Anordnung der Karten wie am PC (Tagebuch anpassen).</p>
  </main>`;
}

// ---------------- Wasserhaushalt (WaterCard.tsx)

export function glassSvg(g) {
  const cup = "M4 6 L36 6 L32.5 44 Q32.2 46 30 46 L10 46 Q7.8 46 7.5 44 Z";
  const id = `wc${g.index}`;
  return `<svg viewBox="0 0 40 50" class="water-glass__svg" aria-hidden="true" focusable="false">
    <defs><clipPath id="${id}"><path d="${cup}"/></clipPath></defs>
    <path d="${cup}" class="water-glass__body"/>
    ${g.filled ? `<g clip-path="url(#${id})"><rect x="0" y="15" width="40" height="35" class="water-glass__water"/><ellipse cx="20" cy="15" rx="15.2" ry="2.2" class="water-glass__surface"/></g>` : ""}
    <ellipse cx="20" cy="6" rx="16" ry="2.6" class="water-glass__rim"/>
    ${g.next ? `<path d="M20 21 V33 M14 27 H26" class="water-glass__plus" stroke-linecap="round"/>` : ""}
  </svg>`;
}

export function glassLabel(g, filledCount) {
  const amount = D.formatLiters(g.amountMl);
  if (g.filled) {
    const at = g.time ? ` um ${g.time} Uhr` : "";
    return g.index === filledCount - 1
      ? `Glas ${g.index + 1} (${amount}${at}) getrunken – tippen zum Entfernen`
      : `Glas ${g.index + 1} (${amount}${at}) getrunken – tippen entfernt dieses und alle späteren`;
  }
  const add = g.index - filledCount + 1;
  return add === 1 ? `Ein Glas (${amount}) als getrunken eintragen` : `${add} Gläser (je ${amount}) als getrunken eintragen`;
}

export function waterCard(db, date, goal) {
  const day = P.waterDay(db, date);
  const goalL = goal?.waterL ?? null;
  const glasses = D.waterGlasses(day, goalL);
  const percent = D.waterPercent(day.totalMl, goalL);
  const target = D.goalGlasses(goalL, day.glassMl);
  const unsent = P.unsentWater(X.S.water);
  return `<section class="card card--nutrition water-card"><div class="card__head"><h3>Wasserhaushalt</h3>
      <span class="card__meta">${goalL !== null ? `Ziel ${esc(D.formatLiters(goalL * 1000))}` : `<button class="linkbtn" data-act="goals-open">Trinkziel festlegen</button>`}</span></div>
    <div class="water-card__summary">
      <p class="water-card__amount"><strong>${esc(D.formatLiters(day.totalMl))}</strong>${goalL !== null ? `<span class="of">von ${esc(D.formatLiters(goalL * 1000))}</span>` : ""}
        <span class="muted small">${esc(D.waterSummary(day))}${target !== null ? ` · Ziel ≈ ${target} ${target === 1 ? "Glas" : "Gläser"} à ${esc(D.formatLiters(day.glassMl))}` : ""}</span></p>
      <label class="field water-card__size"><span>Menge je Glas</span>
        <select data-diary="glass">${D.GLASS_SIZES_ML.map((ml) => `<option value="${ml}" ${ml === day.glassMl ? "selected" : ""}>${esc(D.formatLiters(ml))}</option>`).join("")}</select></label>
    </div>
    ${percent !== null ? `<div class="water-card__bar" role="progressbar" aria-label="Trinkziel" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>` : ""}
    <ul class="water-glasses" aria-label="Gläser des Tages">${glasses
      .map(
        (g) => `<li><button type="button" class="water-glass ${g.filled ? "is-filled" : ""} ${g.next ? "is-next" : ""}" data-act="water-glass" data-arg="${g.index}"
          aria-pressed="${g.filled}" aria-label="${esc(glassLabel(g, day.glasses.length))}">${glassSvg(g)}<span class="water-glass__amount">${esc(D.formatLiters(g.amountMl))}</span></button></li>`,
      )
      .join("")}</ul>
    ${day.drinks.length ? `<p class="muted small">Aus der Koffein-Erfassung: ${esc(day.drinks.map(D.drinkText).join(", "))}</p>` : ""}
    <p class="card__note">Tippen auf ein leeres Glas trägt es als getrunken ein, Tippen auf ein volles Glas nimmt es wieder heraus.${
      unsent ? ` ${unsent} ${unsent === 1 ? "Änderung geht" : "Änderungen gehen"} mit „Lebensmittel senden“ an den PC.` : ""
    }</p>
  </section>`;
}

// ---------------- Mahlzeiten

/** Schlüssel einer Mahlzeit für Auswahl und Aktionen: gespeicherte Mahlzeit oder leerer Platz. */
export const pickKey = (slot) => slot.meal?.id ?? `slot-${slot.ref.mealType}`;

/**
 * Leiste unter den Lebensmitteln (1.19.0): „Eintragen zu Datum“ (ganze Mahlzeit oder Auswahl),
 * bei Auswahl zusätzlich „Als Gericht speichern“ und „In andere Mahlzeit kopieren“.
 */
export function pickBarHtml(pk, count, act) {
  if (act) return actFormHtml(act, count);
  return `<div class="meal-pick-bar">
    ${count ? `<span class="muted small"><b>${count}</b> ausgewählt</span>` : ""}
    ${count ? `<button class="linkbtn" data-act="meal-act-open" data-arg="${esc(pk)}|dish">Als Gericht speichern</button>` : ""}
    ${count ? `<button class="linkbtn" data-act="meal-act-open" data-arg="${esc(pk)}|copy">In andere Mahlzeit kopieren</button>` : ""}
    <button class="linkbtn" data-act="meal-act-open" data-arg="${esc(pk)}|date">Eintragen zu Datum</button>
    ${count ? `<button class="linkbtn muted" data-act="meal-pick-clear" data-arg="${esc(pk)}">Auswahl aufheben</button>` : ""}
  </div>`;
}

export function actFormHtml(a, count) {
  const what = a.ids ? `${a.ids.length} ${a.ids.length === 1 ? "Lebensmittel" : "Lebensmittel"}` : "alle Lebensmittel";
  const title = a.kind === "dish" ? `Gericht aus ${what}` : a.kind === "copy" ? `${what} kopieren` : `Mahlzeit eintragen zu Datum (${what})`;
  return `<div class="meal-act" role="group" aria-label="${esc(title)}">
    <p class="small"><b>${esc(title)}</b></p>
    ${
      a.kind === "dish"
        ? `<div class="field"><label for="meal-act-name">Name des Gerichts</label><input id="meal-act-name" type="text" data-diary="act-name" value="${esc(a.name)}" maxlength="80" placeholder="z. B. Skyr-Bowl" autocomplete="off"></div>
           <p class="muted small">Wird als Vorlage gespeichert (Mengen wie eingetragen) und geht mit „Lebensmittel senden“ an den PC – dort unter „Aus Vorlage einfügen“.</p>`
        : `<div class="meal-act__row"><div class="field"><label for="meal-act-date">Tag</label><input id="meal-act-date" type="date" data-diary="act-date" value="${esc(a.date)}"></div>
           <div class="field"><label for="meal-act-meal">Mahlzeit</label><select id="meal-act-meal" data-diary="act-meal">${N.MEAL_TYPES.map(
             (t) => `<option value="${t.value}" ${t.value === a.mealType ? "selected" : ""}>${esc(D.mealTypeLabel(t.value))}</option>`,
           ).join("")}</select></div></div>`
    }
    ${a.error ? `<p class="field-error">${esc(a.error)}</p>` : ""}
    <div class="row-actions"><button class="btn sm primary" data-act="meal-act-save">${a.kind === "dish" ? "Gericht speichern" : "Eintragen"}</button>
      <button class="btn sm" data-act="meal-act-cancel">Abbrechen</button></div>
  </div>`;
}

/** Lebensmittel der Mahlzeit `pk` am Tag des Tagebuchs (nur die ausgewählten, falls `ids`). */
export function itemsOf(pk, ids) {
  const db = buildDb();
  const slot = D.daySlots(P.mealDay(db, X.S.diaryDate ?? today())).find((s) => pickKey(s) === pk);
  const items = slot?.meal?.items ?? [];
  return { slot, items: ids ? items.filter((i) => ids.includes(i.id)) : items };
}

/**
 * Schnell eintragen an einer Mahlzeit (1.55.0): „Wie gestern“ / „Wie letzten <Wochentag>“ (nur
 * solange die Mahlzeit leer ist) und Vorschläge – je ein Tipp trägt ein, danach „Rückgängig“.
 */
export function quickSlotHtml(quick, key, filled, current) {
  const { history, foods, date } = quick;
  const repeat = filled ? [] : QM.Q.repeatChoices(history, date, key).map((c) => ({ ...c, items: QM.onlyKnown(c.items, foods) })).filter((c) => c.items.length);
  const have = new Set(current.map((i) => i.foodId));
  const sugg = QM.Q.mealSuggestions(history, key, date, { limit: 5 })
    .map((x, i) => ({ ...x, i, items: QM.onlyKnown(x.items, foods) }))
    .filter((x) => x.items.length && !x.items.every((it) => have.has(it.foodId)));
  if (!repeat.length && !sugg.length) return "";
  return `<div class="quick-meal">
    ${repeat
      .map(
        (c) => `<button type="button" class="btn sm quick-meal__repeat" data-act="qm-repeat" data-arg="${esc(key)}|${c.kind}" title="${esc(QM.itemsName(c.items, foods))}">${esc(c.label)} <span class="muted">· ${c.items.length} Lebensmittel, ${esc(D.formatKcal(QM.itemsKcal(c.items, foods)))}</span></button>`,
      )
      .join("")}
    ${
      sugg.length
        ? `<p class="quick-meal__label muted small">Vorschläge (oft gegessen):</p><div class="chip-row">${sugg
            .map(
              (x) => `<button type="button" class="chip" data-act="qm-suggest" data-arg="${esc(key)}|${x.i}">+ ${esc(QM.itemsName(x.items, foods))} <span class="muted">· ${esc(D.formatKcal(QM.itemsKcal(x.items, foods)))}</span></button>`,
            )
            .join("")}</div>`
        : ""
    }
  </div>`;
}

/** Wochenplan (Nutrition → Planen am PC): geplante Gerichte des Tages mit „Gegessen“ (1.55.0). */
export function planCardHtml(db, date, slots) {
  const entries = (db.pc.meal_plan_entry ?? []).filter((e) => e.date === date);
  if (!entries.length) return "";
  const recipes = new Map((db.pc.recipe ?? []).map((r) => [r.id, r]));
  const itemsBy = new Map();
  for (const it of db.pc.recipe_item ?? []) itemsBy.set(it.recipe_id, [...(itemsBy.get(it.recipe_id) ?? []), it]);
  const withItems = (db.pc.recipe_item ?? null) !== null;
  const dayMeals = slots.filter((s) => s.meal).map((s) => s.meal);
  return `<div class="plan-today"><p class="small"><b>Geplant</b></p><ul class="plain-list">${entries
    .map((e) => {
      const r = recipes.get(e.recipe_id);
      const items = itemsBy.get(e.recipe_id) ?? [];
      const eaten = QM.Q.planEaten(items.map((i) => i.food_id), dayMeals);
      const portions = `${String(e.servings).replace(".", ",")} ${e.servings === 1 ? "Portion" : "Portionen"}`;
      return `<li class="plan-today__item"><span><span class="muted small">${esc(e.slot)}</span> ${esc(r?.name ?? "Rezept")} · ${esc(portions)}</span>
        ${
          eaten
            ? `<span class="tag">✓ eingetragen</span>`
            : withItems && items.length
              ? `<button type="button" class="btn sm" data-act="qm-plan" data-arg="${esc(e.id)}">✓ Gegessen</button>`
              : ""
        }</li>`;
    })
    .join("")}</ul>${withItems ? "" : `<p class="muted small">Zum Eintragen am Handy bitte am PC neu exportieren und hier laden.</p>`}</div>`;
}

export function mealsCard(slots, fast, date, db) {
  const local = X.S.food?.local;
  const foodsActive = local ? N.allFoods(X.S.catalog, local) : new Map();
  const quick = { history: QM.pastMeals(db), foods: foodsActive, date };
  const unsentItems = new Set(Object.values(local?.meals ?? {}).flatMap((m) => m.items.filter((i) => !i.sent).map((i) => i.id)));
  const sentItems = new Set(Object.values(local?.meals ?? {}).flatMap((m) => m.items.filter((i) => i.sent).map((i) => i.id)));
  const itemMeal = new Map(Object.values(local?.meals ?? {}).flatMap((m) => m.items.map((i) => [i.id, m.row.id])));
  const slotHtml = (slot) => {
    const m = slot.meal;
    const has = m && D.mealHasContent(m);
    // Auswahl der Lebensmittel (1.19.0): Schlüssel der Mahlzeit, angehakte Einträge, offene Aktion
    const pk = pickKey(slot);
    const picked = new Set(X.S.mealPick?.[pk] ?? []);
    const act = X.S.mealAct?.pk === pk ? X.S.mealAct : null;
    // Wie am PC: gefüllte Mahlzeiten anfangs zugeklappt, leere aufgeklappt; Wahl bleibt je Mahlzeit
    const key = slot.ref.name ? N.extraKey(slot.ref.name) : slot.ref.mealType;
    const expanded = X.S.mealOpen?.[key] ?? !has;
    return `<div class="meal-slot ${has ? "" : "is-empty"} ${expanded ? "" : "meal-slot--collapsed"}" data-meal-key="${esc(key)}">
      <div class="meal-slot__head"><button type="button" class="meal-slot__toggle" data-act="meal-toggle" data-arg="${esc(key)}|${expanded ? 0 : 1}" aria-expanded="${expanded}" title="${expanded ? "Zuklappen" : "Aufklappen"}"><span class="meal-slot__chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span><b>${esc(slot.title)}</b>${m?.time ? ` <span class="muted small">${esc(m.time)}</span>` : ""}</button>
        ${has ? `<span class="meal-slot__kcal">${esc(D.formatKcal(m.energyKcal))}</span>` : ""}</div>
      ${has ? `<p class="muted small">Protein ${esc(D.formatGrams(m.proteinG))} · KH ${esc(D.formatGrams(m.carbsG))} · Fett ${esc(D.formatGrams(m.fatG))}</p>` : ""}
      ${has && m.time && D.glucoseMeal ? (() => { const g = D.glucoseMeal.mealGlucose(date, m.time, GLD.allReadings(X.S.catalog, X.S.glucose)); return g ? `<p class="muted small meal-glucose">${esc(g.text)}</p>` : ""; })() : ""}
      ${
        !expanded
          ? ""
          : `${
        m && m.items.length
          ? `${m.items.length > 1 ? `<label class="meal-pick-all"><input type="checkbox" data-diary="pickall" data-arg="${esc(pk)}" ${picked.size === m.items.length ? "checked" : ""}> Alle auswählen</label>` : ""}
            <ul class="meal-items">${m.items
              .map((i) => {
                const phone = unsentItems.has(i.id);
                return `<li class="${picked.has(i.id) ? "is-picked" : ""}"><input type="checkbox" class="meal-pick" data-diary="pick" data-arg="${esc(pk)}|${esc(i.id)}" ${picked.has(i.id) ? "checked" : ""} aria-label="${esc(i.foodName)} auswählen"><span class="meal-items__name">${esc(i.foodName)}${i.foodBrand ? ` <span class="muted">(${esc(i.foodBrand)})</span>` : ""}
                  <span class="muted small">${esc(D.formatAmount(i.amount, i.basisUnit))}${phone ? " · am Handy" : sentItems.has(i.id) ? " · gesendet" : ""}</span></span>
                  <span class="meal-items__kcal">${esc(D.formatKcal(i.energyKcal))}${
                    phone ? ` <button class="btn sm ghost" data-act="diary-remove" data-arg="${esc(itemMeal.get(i.id))}|${esc(i.id)}" aria-label="Eintrag entfernen">✕</button>` : ""
                  }</span></li>`;
              })
              .join("")}</ul>`
          : ""
      }
      ${m && Object.keys(m.values ?? {}).length ? `<p class="muted small">Mit Fasttracking-Werten an dieser Mahlzeit.</p>` : ""}
      ${m && m.items.length ? pickBarHtml(pk, picked.size, act) : ""}
      ${local ? quickSlotHtml(quick, key, has, m?.items ?? []) : ""}
      <div class="meal-actions"><button class="btn sm" data-act="diary-add" data-arg="${esc(key)}" aria-label="Lebensmittel eintragen">+ Lebensmittel</button>
        <button class="btn sm ghost" data-act="fast-open" data-arg="${esc(key)}">Fasttracking</button></div>`
      }
    </div>`;
  };
  const anyContent = slots.some((s) => s.meal && D.mealHasContent(s.meal));
  if (!X.S.mealsView) {
    try {
      X.S.mealsView = localStorage.getItem("lifespan.mealsView") === "list" ? "list" : "timeline";
    } catch {
      X.S.mealsView = "timeline";
    }
  }
  const timeline = X.S.mealsView !== "list";
  const glucoseText = (m) => {
    if (!m.time || !D.glucoseMeal) return "";
    const g = D.glucoseMeal.mealGlucose(date, m.time, GLD.allReadings(X.S.catalog, X.S.glucose));
    return g ? g.text : "";
  };
  return `<section class="card card--nutrition meals-card"><div class="card__head"><h3>Mahlzeiten</h3>
      <span class="segmented" role="group" aria-label="Darstellung"><button class="${timeline ? "is-active" : ""}" data-act="meals-view" data-arg="timeline" aria-pressed="${timeline}">Tagesverlauf (beta)</button><button class="${timeline ? "" : "is-active"}" data-act="meals-view" data-arg="list" aria-pressed="${!timeline}">Liste</button></span></div>
    ${!anyContent && fast ? `<p class="muted">Keine einzelnen Mahlzeiten – die Tageswerte stehen unter „Fasttracking“.</p>` : ""}
    ${planCardHtml(db, date, slots)}
    ${timeline ? timelineHtml(db, date, slots, glucoseText) : slots.map(slotHtml).join("")}
    ${!timeline && slots.length === 0 ? `<p class="muted small">An diesem Tag sind keine Mahlzeiten angelegt.</p>` : ""}
    ${caffeineSlotHtml(date, today())}
    ${fast ? "" : `<button class="btn sm ghost" data-act="fast-open" data-arg="">Fasttracking für den ganzen Tag</button>`}
    <p class="card__note">Einträge vom PC bearbeitest du am PC; am Handy Eingetragenes kannst du hier entfernen oder unter „Vor dem Senden prüfen“ ändern.${
      date !== today() ? " „+ Lebensmittel“ trägt in diesen Tag ein." : ""
    }</p>
  </section>`;
}

// ---------------- Schnell eintragen (1.55.0)

export async function quickAdd(key, items, label) {
  const date = X.S.diaryDate ?? today();
  const local = X.S.food.local;
  let res;
  try {
    res = QM.addItems(X.S.catalog, local, { date, mealKey: key, items, today: today(), uuid: X.uuid });
  } catch (e) {
    return X.toast(e.message, true);
  }
  try {
    await X.store.set("nutrition", local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
  // Die Mahlzeit bleibt aufgeklappt, damit das Eingetragene zu sehen ist (1.70.1)
  X.S.mealOpen = { ...(X.S.mealOpen ?? {}), [key]: true };
  X.rerender();
  X.toast(`Eingetragen: ${label} bei ${N.mealLabel(key)}`, false, async () => {
    QM.undoItems(X.S.food.local, res.mealId, res.added);
    await X.store.set("nutrition", X.S.food.local);
    X.rerender();
  });  return res;
}

/** BLS-Einträge der Lebensmittel eines Tages als `BlsFood` (wie am PC `bls_food`) */
function blsFoodMicro(db, meals) {
  const empty = { values: {}, extra: {}, withData: 0, without: [], missing: {}, noBls: true };
  const items = meals.flatMap((m) => m.items.map((i) => ({ foodId: i.foodId, amount: i.amount })));
  if (!items.length) return empty;
  const foods = new Map([...db.foods.values()].map((f) => [f.id, { name: f.name, brand: f.brand, notes: f.notes }]));
  const b = ensureBls();
  const bls = new Map();
  if (b) {
    for (const it of items) {
      const f = foods.get(it.foodId);
      const code = f ? D.blsMicro.blsCodeOf(f) : null;
      if (!code || bls.has(code)) continue;
      const row = BL.foodByCode(b, code);
      if (!row) continue;
      bls.set(code, {
        code,
        name: row[1],
        nameEn: row[2],
        hint: row[3],
        values: b.data.nutrients.map((n, i) => {
          const raw = row[4][i];
          return { code: n.code, amount: typeof raw === "number" ? raw : null, flag: typeof raw === "string" ? raw : null, origin: null };
        }),
      });
    }
  }
  return { ...D.blsMicro.foodMicro(items, foods, bls), noBls: !b };
}

const suppList = (db) =>
  [...db.supplements.values()].map((s) => ({
    name: s.name,
    archived: !!s.archived,
    values: Object.fromEntries((db.supValues.get(s.id) ?? []).map((v) => [v.nutrient, v.amount])),
  }));

export function microCard(catalog, groups, micro, refGroup, withFast, fromFoods = null, db = null) {
  const n = Object.keys(micro).length;
  const supps = db ? suppList(db) : [];
  const names = new Map((ensureBls()?.data.nutrients ?? []).map((x) => [x.code, x]));
  return `<section class="card card--nutrition micro-card"><div class="card__head"><h3>Mikronährstoffe und weitere Stoffe</h3>
      <span class="card__meta">${groups.length ? `${n} ${n === 1 ? "Stoff" : "Stoffe"} aufgenommen` : "aus Supplements und Fasttracking"}</span></div>
    ${
      groups.length
        ? groups
            .map(
              (g) => `<div class="fast-values"><p class="fast-values__title">${esc(g.label)}</p>
          <div class="table-scroll"><table class="data-table micro-table"><thead><tr><th>Stoff</th><th class="tnum">Menge</th><th class="tnum">% Ref. DGE</th><th class="tnum">% Max. EFSA</th></tr></thead>
          <tbody>${g.items
            .map(({ def, value }) => {
              const p = D.nutrientPercents(def.key, value, def.unit, refGroup);
              const miss = fromFoods?.missing?.[def.key] ?? 0;
              const low = D.blsMicro.lowReferenceHint(p.reference.percent, D.blsMicro.supplementsWith(def.key, supps));
              return `<tr><td>${esc(def.label)}${miss ? `<span class="sub">${miss} Lebensmittel ohne Angabe</span>` : ""}${low ? `<span class="sub micro-low">${esc(low)}</span>` : ""}</td><td class="tnum">${esc(D.formatNutrient(value, def.unit))}</td>
                <td class="tnum" title="${esc(p.reference.title)}">${esc(D.formatPercent(p.reference.percent))}</td>
                <td class="tnum" title="${esc(p.limit.title)}">${esc(D.formatPercent(p.limit.percent))}</td></tr>`;
            })
            .join("")}</tbody></table></div></div>`,
            )
            .join("")
        : `<p class="muted small">An diesem Tag noch keine Vitamine, Mineralstoffe oder weitere Stoffe erfasst. Sie kommen aus den eingetragenen Supplements und dem Fasttracking.</p>`
    }
    ${
      groups.length
        ? `<p class="card__note">${esc(refGroup.ok ? `Referenzwerte für: ${D.GROUP_LABELS[refGroup.group]} (aus dem Profil am PC). ` : `${refGroup.reason} `)}„% Ref. DGE“ = Anteil am Referenzwert der DGE/ÖGE, „% Max. EFSA“ = Anteil an der tolerierbaren Höchstmenge der EFSA. „-“ = kein Wert festgelegt.</p>`
        : ""
    }
    ${
      fromFoods && Object.keys(fromFoods.extra).length
        ? `<details class="micro-extra"><summary>Weitere Stoffe aus dem BLS (${Object.keys(fromFoods.extra).length})</summary>
          <table class="data-table micro-table"><tbody>${Object.entries(fromFoods.extra)
            .map(([code, v]) => `<tr><td>${esc(names.get(code)?.name ?? code)}</td><td class="tnum">${esc(`${D.formatNumber(v, v < 10 ? 2 : 0)} ${names.get(code)?.unit ?? ""}`)}</td></tr>`)
            .join("")}</tbody></table></details>`
        : ""
    }
    ${
      fromFoods
        ? `<p class="card__note card__note--keep">${
            fromFoods.noBls
              ? "Für Stoffe aus Lebensmitteln den BLS auf dem Handy laden (Nutrition → BLS)."
              : fromFoods.withData
                ? `Aus ${fromFoods.withData} ${fromFoods.withData === 1 ? "Lebensmittel" : "Lebensmitteln"} des BLS (alle Stoffe je Menge)`
                : "Noch kein Lebensmittel aus dem BLS an diesem Tag"
          }${!fromFoods.noBls && fromFoods.without.length ? ` · ohne Angabe (zählt nicht als 0): ${esc(fromFoods.without.join(", "))}` : ""}</p>`
        : ""
    }
    <p class="card__note">Summe aus Lebensmitteln des BLS, Supplements${withFast ? " und Fasttracking" : ""} dieses Tages. Andere Lebensmittel liefern nur Makronährstoffe, Ballaststoffe, Zucker und Salz. Unter 70 % des Referenzwerts steht ein Hinweis – mit deinen eigenen Supplements, die den Stoff enthalten.</p>
  </section>`;
}

// ------------------------------------------------------------------ Verlauf (NutritionHistoryTab.tsx)

export function viewNutritionHistory() {
  const S = X.S;
  if (!S.catalog?.pc) return viewDiary();
  const days = S.historyDays ?? 14;
  const end = today();
  const from = P.addDays(end, -(days - 1));
  const db = buildDb();
  const totals = P.dailyTotals(db, from, end);
  const series = Array.from({ length: days }, (_, i) => {
    const date = P.addDays(from, i);
    return { date, value: totals.find((t) => t.date === date)?.energyKcal ?? 0 };
  });
  const logged = totals.filter((t) => t.energyKcal > 0);
  const avg = logged.length ? logged.reduce((s, t) => s + t.energyKcal, 0) / logged.length : null;
  // Spalte „Ziel kcal“ nur mit festem kcal-Ziel im Zeitraum (1.52.0)
  const hasGoal = totals.some((t) => P.goalFor(db, t.date)?.energyKcal != null);
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("food-history")}
    <section class="card card--nutrition">
      <div class="wo-head"><h3>Energie je Tag</h3>
        <select data-diary="days" aria-label="Zeitraum">${[7, 14, 30].map((d) => `<option value="${d}" ${d === days ? "selected" : ""}>${d} Tage</option>`).join("")}</select></div>
      ${
        logged.length === 0
          ? `<p class="muted">In diesem Zeitraum gibt es keine erfassten Mahlzeiten.</p>`
          : `${barTrendSvg(series, { color: COLOR.nutrition, format: (v) => `${D.formatNumber(v, 0)} kcal`, height: 200, label: `Energie je Tag der letzten ${days} Tage` })}
        <p class="card__note">Mittel über ${logged.length} Tage mit Einträgen: ${avg !== null ? `${esc(D.formatNumber(avg, 0))} kcal` : "–"}. Tage ohne Einträge zählen nicht mit.</p>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>Datum</th><th class="tnum">kcal</th>${hasGoal ? `<th class="tnum">Ziel kcal</th>` : ""}<th class="tnum">Protein</th><th class="tnum">KH</th><th class="tnum">Fett</th></tr></thead>
        <tbody>${[...totals]
          .reverse()
          .map((t) => {
            const g = P.goalFor(db, t.date);
            return `<tr><td>${esc(D.formatDate(t.date))}</td><td class="tnum">${esc(D.formatNumber(t.energyKcal, 0))}</td>
              ${hasGoal ? `<td class="tnum">${g?.energyKcal != null ? esc(D.formatNumber(g.energyKcal, 0)) : "–"}</td>` : ""}
              <td class="tnum">${esc(D.formatNumber(t.proteinG, 0))} g</td><td class="tnum">${esc(D.formatNumber(t.carbsG, 0))} g</td><td class="tnum">${esc(D.formatNumber(t.fatG, 0))} g</td></tr>`;
          })
          .join("")}</tbody></table></div>`
      }
    </section>
  </main>`;
}
