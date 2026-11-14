// LIFESPAN OS Mobil – Nutrition wie am PC (1.5.0): Reiter „Tagebuch“ (Tagessumme gegen Ziele,
// Wasserhaushalt, Mahlzeiten, Supplements, Fasttracking, Mikronährstoffe – Anordnung wie am PC)
// und „Verlauf“ (Energie je Tag). Rechnung: pcdb.js (wie der Rust-Kern) und pcdomain.js (wie
// src/domain). Wasser kann am Handy bearbeitet werden und geht mit der Ernährung an den PC.

import * as P from "./pcdb.js";
import * as D from "./pcdomain.js";
import * as N from "./nutrition.js";
import { phoneLogs } from "./logsdata.js";
import { CATALOG, GROUPS } from "./nutrientcatalog.js";
import { barTrendSvg, compareHtml, COLOR, dayGoalHtml, macroBreakdownHtml } from "./pcview.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice, buildReturnTables }

export function initDiary(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const pad = (n) => String(n).padStart(2, "0");
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

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
    settings: water.settings,
    body: Object.values(S.body?.local.entries ?? {}).map((e) => e.row),
    workouts,
    exercises: S.localExercises ?? [],
    logs: phoneLogs(S.logs),
  });
  // Eigene Namen der Standardmahlzeiten wie am PC (Settings → meal_name.*)
  const names = {};
  for (const t of ["breakfast", "lunch", "snack", "dinner"]) {
    const n = db.settings.get(`meal_name.${t}`);
    if (n) names[t] = n;
  }
  D.setMealNames(names);
  return db;
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

const TABS = [
  ["diary", "Tagebuch"],
  ["food", "Scanner & Tracken"],
  ["food-history", "Verlauf"],
];

export function nutritionTabs(active) {
  return `<nav class="tabs" aria-label="Nutrition">${TABS.map(
    ([v, l]) => `<button class="tab ${v === active ? "active" : ""}" data-go="${v}" ${v === active ? 'aria-current="page"' : ""}>${l}</button>`,
  ).join("")}</nav>`;
}

function dayNav(date, act) {
  const wd = WEEKDAYS[new Date(`${date}T12:00:00`).getDay()];
  return `<section class="card day-nav">
    <button class="btn sm" data-act="${act}" data-arg="-1" aria-label="Vortag">‹</button>
    <label class="day-nav__date"><span class="muted small">${date === today() ? "Heute" : `${wd} ${D.formatDate(date)}`}</span>
      <input type="date" data-diary="date" value="${esc(date)}" max="${today()}" aria-label="Tag"></label>
    <button class="btn sm" data-act="${act}" data-arg="1" aria-label="Folgetag" ${date >= today() ? "disabled" : ""}>›</button>
  </section>`;
}

// ------------------------------------------------------------------ Tagebuch

const OPTIONALS = ["fiberG", "sugarG", "saturatedFatG", "saltG"];
const withFast = (t, value) => (value === undefined ? t : { ...t, value: (t.value ?? 0) + value });

export function viewDiary() {
  const S = X.S;
  if (!S.catalog?.pc) {
    return `${X.header("Nutrition")}<main class="wrap">${nutritionTabs("diary")}
      <section class="card"><p class="warn">Für das Tagebuch wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Settings „Neue Exportdatei laden“.</p></section></main>`;
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
  const micro = D.microValues(catalog, [supps, fast?.values ?? {}, mealValues]);
  const microGroups = D.groupedValues(catalog, { values: micro });
  const refGroup = D.referenceGroup(
    profile ? { sex: profile.sex, birthDate: profile.birth_date, birthYear: profile.birth_year, lifePhase: profile.life_phase } : null,
    date,
  );
  const hasSuppMacros = Object.values(suppMacros).some((v) => v > 0);
  const totals = D.sumNutrients([...meals, D.fastNutrients(fast), suppMacros]);
  const weightKg = energy.step.weightKg;
  const rawGoal = P.goalFor(db, date);
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
      <span class="card__meta">${goal ? `Ziele gültig ab ${esc(D.formatDate(goal.validFrom))}` : "Tagesziele am PC festlegen"}</span></div>
    ${
      goalBased && goal
        ? `${dayGoalHtml({ totals, goal, stepKcal: energy.step.kcal, expenditure: energy })}
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
          <p class="card__note">Mit Tageszielen für Energie und Makronährstoffe (am PC: Settings → Tagesziele) zeigt die Tagessumme, wie viel noch offen ist (Defizit) oder darüber liegt (Überschuss).</p>`
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
    { id: "micro", node: microCard(catalog, microGroups, micro, refGroup, fast || hasMealValues) },
    { id: "fasttrack", empty: !fast, node: fast ? fastCard(catalog, fast) : "" },
    { id: "meals", node: mealsCard(slots, fast, date) },
    { id: "supplements", node: supplementsCard(intakes, suppMacros, hasSuppMacros) },
  ];
  const layout = D.parseLayout(db.settings.get("ui.diary_layout"));
  const ordered = D.arrange(cards, layout).filter((c) => c.node);

  return `${X.header("Nutrition")}<main class="wrap diary">
    ${nutritionTabs("diary")}
    ${dayNav(date, "diary-shift")}
    ${ordered.map((c) => c.node).join("")}
    <p class="muted small">Stand vom PC: Export vom ${esc(S.catalog.exportedAt ? D.formatDate(S.catalog.exportedAt.slice(0, 10)) : "–")}. Am Handy Erfasstes ist schon eingerechnet; Anordnung der Karten wie am PC (Tagebuch anpassen).</p>
  </main>`;
}

// ---------------- Wasserhaushalt (WaterCard.tsx)

function glassSvg(g) {
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

function glassLabel(g, filledCount) {
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

function waterCard(db, date, goal) {
  const day = P.waterDay(db, date);
  const goalL = goal?.waterL ?? null;
  const glasses = D.waterGlasses(day, goalL);
  const percent = D.waterPercent(day.totalMl, goalL);
  const target = D.goalGlasses(goalL, day.glassMl);
  const unsent = P.unsentWater(X.S.water);
  return `<section class="card card--nutrition water-card"><div class="card__head"><h3>Wasserhaushalt</h3>
      <span class="card__meta">${goalL !== null ? `Ziel ${esc(D.formatLiters(goalL * 1000))}` : "Trinkziel am PC festlegen"}</span></div>
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
const pickKey = (slot) => slot.meal?.id ?? `slot-${slot.ref.mealType}`;

/**
 * Leiste unter den Lebensmitteln (1.19.0): „Eintragen zu Datum“ (ganze Mahlzeit oder Auswahl),
 * bei Auswahl zusätzlich „Als Gericht speichern“ und „In andere Mahlzeit kopieren“.
 */
function pickBarHtml(pk, count, act) {
  if (act) return actFormHtml(act, count);
  return `<div class="meal-pick-bar">
    ${count ? `<span class="muted small"><b>${count}</b> ausgewählt</span>` : ""}
    ${count ? `<button class="linkbtn" data-act="meal-act-open" data-arg="${esc(pk)}|dish">Als Gericht speichern</button>` : ""}
    ${count ? `<button class="linkbtn" data-act="meal-act-open" data-arg="${esc(pk)}|copy">In andere Mahlzeit kopieren</button>` : ""}
    <button class="linkbtn" data-act="meal-act-open" data-arg="${esc(pk)}|date">Eintragen zu Datum</button>
    ${count ? `<button class="linkbtn muted" data-act="meal-pick-clear" data-arg="${esc(pk)}">Auswahl aufheben</button>` : ""}
  </div>`;
}

function actFormHtml(a, count) {
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
function itemsOf(pk, ids) {
  const db = buildDb();
  const slot = D.daySlots(P.mealDay(db, X.S.diaryDate ?? today())).find((s) => pickKey(s) === pk);
  const items = slot?.meal?.items ?? [];
  return { slot, items: ids ? items.filter((i) => ids.includes(i.id)) : items };
}

function mealsCard(slots, fast, date) {
  const local = X.S.food?.local;
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
    const key = slot.ref.mealType;
    const expanded = X.S.mealOpen?.[key] ?? !has;
    return `<div class="meal-slot ${has ? "" : "is-empty"} ${expanded ? "" : "meal-slot--collapsed"}">
      <div class="meal-slot__head"><button type="button" class="meal-slot__toggle" data-act="meal-toggle" data-arg="${esc(key)}|${expanded ? 0 : 1}" aria-expanded="${expanded}" title="${expanded ? "Zuklappen" : "Aufklappen"}"><span class="meal-slot__chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span><b>${esc(slot.title)}</b>${m?.time ? ` <span class="muted small">${esc(m.time)}</span>` : ""}</button>
        ${has ? `<span class="meal-slot__kcal">${esc(D.formatKcal(m.energyKcal))}</span>` : ""}</div>
      ${has ? `<p class="muted small">Protein ${esc(D.formatGrams(m.proteinG))} · KH ${esc(D.formatGrams(m.carbsG))} · Fett ${esc(D.formatGrams(m.fatG))}</p>` : ""}
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
      <button class="btn sm" data-act="diary-add" data-arg="${esc(slot.ref.mealType)}">+ Lebensmittel eintragen</button>`
      }
    </div>`;
  };
  const anyContent = slots.some((s) => s.meal && D.mealHasContent(s.meal));
  return `<section class="card card--nutrition meals-card"><h3>Mahlzeiten</h3>
    ${!anyContent && fast ? `<p class="muted">Keine einzelnen Mahlzeiten – die Tageswerte stehen unter „Fasttracking“.</p>` : ""}
    ${slots.map(slotHtml).join("")}
    ${slots.length === 0 ? `<p class="muted small">An diesem Tag sind keine Mahlzeiten angelegt.</p>` : ""}
    <p class="card__note">Einträge vom PC bearbeitest du am PC; am Handy Eingetragenes kannst du hier entfernen oder unter „Vor dem Senden prüfen“ ändern.${
      date !== today() ? " „+ Lebensmittel eintragen“ trägt in diesen Tag ein." : ""
    }</p>
  </section>`;
}

// ---------------- Supplements

function supplementsCard(intakes, suppMacros, hasSuppMacros) {
  const groups = D.groupIntakes(intakes);
  return `<section class="card card--nutrition"><div class="card__head"><h3>Supplements</h3>
      <span class="card__meta">${hasSuppMacros ? `${esc(D.formatKcal(suppMacros.energyKcal))} · P ${esc(D.formatGrams(suppMacros.proteinG))}` : ""}</span></div>
    ${
      intakes.length
        ? groups
            .map(
              (g) => `<div class="supp-group"><p class="small"><b>${esc(g.label.charAt(0).toUpperCase() + g.label.slice(1))}</b></p>
          <ul class="supp-list">${g.intakes
            .map(
              (i) => `<li><span><b>${esc(i.name)}</b>${i.time ? ` <span class="muted small">${esc(i.time)}</span>` : ""}</span>
              <span class="muted small">${esc(D.describeSupplements(i.items))}</span>${i.notes ? `<span class="muted small">${esc(i.notes)}</span>` : ""}</li>`,
            )
            .join("")}</ul></div>`,
            )
            .join("")
        : `<p class="muted small">An diesem Tag sind keine Supplements eingetragen.</p>`
    }
    <p class="card__note">Supplements trägst du bisher am PC ein (Nutrition → Tagebuch).</p>
  </section>`;
}

// ---------------- Fasttracking und Mikronährstoffe

function fastCard(catalog, fast) {
  return `<section class="card card--nutrition"><h3>Fasttracking</h3>
    ${D.groupedValues(catalog, fast)
      .map(
        (g) => `<div class="fast-values"><p class="fast-values__title">${esc(g.label)}</p><dl>${g.items
          .map(({ def, value }) => `<div><dt>${esc(def.label)}</dt><dd>${esc(D.formatNutrient(value, def.unit))}</dd></div>`)
          .join("")}</dl></div>`,
      )
      .join("")}
    ${fast.notes ? `<p class="card__note">${esc(fast.notes)}</p>` : ""}
  </section>`;
}

function microCard(catalog, groups, micro, refGroup, withFast) {
  const n = Object.keys(micro).length;
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
              return `<tr><td>${esc(def.label)}</td><td class="tnum">${esc(D.formatNutrient(value, def.unit))}</td>
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
    <p class="card__note">Summe aus Supplements${withFast ? " und Fasttracking" : ""} dieses Tages. Lebensmittel aus Mahlzeiten liefern hier nur Makronährstoffe, Ballaststoffe, Zucker und Salz.</p>
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
        <div class="table-scroll"><table class="data-table"><thead><tr><th>Datum</th><th class="tnum">kcal</th><th class="tnum">Ziel kcal</th><th class="tnum">Protein</th><th class="tnum">KH</th><th class="tnum">Fett</th></tr></thead>
        <tbody>${[...totals]
          .reverse()
          .map((t) => {
            const g = P.goalFor(db, t.date);
            return `<tr><td>${esc(D.formatDate(t.date))}</td><td class="tnum">${esc(D.formatNumber(t.energyKcal, 0))}</td>
              <td class="tnum">${g?.energyKcal != null ? esc(D.formatNumber(g.energyKcal, 0)) : "–"}</td>
              <td class="tnum">${esc(D.formatNumber(t.proteinG, 0))} g</td><td class="tnum">${esc(D.formatNumber(t.carbsG, 0))} g</td><td class="tnum">${esc(D.formatNumber(t.fatG, 0))} g</td></tr>`;
          })
          .join("")}</tbody></table></div>`
      }
    </section>
  </main>`;
}

// ------------------------------------------------------------------ Ereignisse

async function persistWater() {
  try {
    await X.store.set("water", X.S.water);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

const shift = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const diaryActions = {
  "meal-act-open": (el) => {
    const [pk, kind] = el.dataset.arg.split("|");
    const ids = X.S.mealPick?.[pk] ?? [];
    const { slot } = itemsOf(pk, null);
    const day = X.S.diaryDate ?? today();
    const type = N.MEAL_TYPES.some((t) => t.value === slot?.ref.mealType) ? slot.ref.mealType : "snack";
    X.S.mealAct = {
      pk,
      kind,
      // „Eintragen zu Datum“ nimmt die Auswahl, sonst die ganze Mahlzeit
      ids: kind === "date" && !ids.length ? null : [...ids],
      date: kind === "copy" ? day : day === today() ? shift(day, 1) : today(),
      mealType: type,
      name: "",
      error: null,
    };
    X.rerender();
    requestAnimationFrame(() => document.getElementById(kind === "dish" ? "meal-act-name" : "meal-act-date")?.focus());
  },
  "meal-act-cancel": () => {
    X.S.mealAct = null;
    X.rerender();
  },
  "meal-pick-clear": (el) => {
    X.S.mealPick = { ...(X.S.mealPick ?? {}), [el.dataset.arg]: [] };
    X.rerender();
  },
  "meal-act-save": async () => {
    const a = X.S.mealAct;
    if (!a) return;
    // Eingaben direkt lesen (der letzte Wert kommt sonst erst mit dem Verlassen des Feldes)
    a.name = document.getElementById("meal-act-name")?.value ?? a.name;
    a.date = document.getElementById("meal-act-date")?.value ?? a.date;
    a.mealType = document.getElementById("meal-act-meal")?.value ?? a.mealType;
    const { items } = itemsOf(a.pk, a.ids);
    const list = items.map((i) => ({ foodId: i.foodId, amount: i.amount }));
    const opts = { uuid: X.uuid, now: new Date() };
    let message;
    try {
      if (a.kind === "dish") {
        const row = N.saveItemsAsDish(X.S.catalog, X.S.food.local, a.name, list, opts);
        message = `Gericht „${row.name}“ gespeichert (${list.length} Lebensmittel).`;
      } else {
        N.copyItemsTo(X.S.catalog, X.S.food.local, { date: a.date, mealType: a.mealType, items: list }, opts);
        message = `${list.length} ${list.length === 1 ? "Lebensmittel" : "Lebensmittel"} in „${D.mealTypeLabel(a.mealType)}“ am ${D.formatDate(a.date)} eingetragen.`;
      }
    } catch (e) {
      a.error = e.message;
      X.rerender();
      return;
    }
    try {
      await X.store.set("nutrition", X.S.food.local);
    } catch (e) {
      X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
    }
    X.S.mealAct = null;
    X.S.mealPick = { ...(X.S.mealPick ?? {}), [a.pk]: [] };
    X.toast(message);
    X.rerender();
  },
  "meal-toggle": (el) => {
    const [key, open] = el.dataset.arg.split("|");
    X.S.mealOpen = { ...(X.S.mealOpen ?? {}), [key]: open === "1" };
    X.rerender();
  },
  "diary-shift": (el) => {
    const next = shift(X.S.diaryDate ?? today(), Number(el.dataset.arg));
    X.S.diaryDate = next > today() ? today() : next;
    X.rerender();
  },
  "water-glass": async (el) => {
    const date = X.S.diaryDate ?? today();
    const db = buildDb();
    const day = P.waterDay(db, date);
    const count = D.countAfterClick(Number(el.dataset.arg), day.glasses.length);
    try {
      P.setWaterCount(db, X.S.water, date, count, date === today() ? nowTime() : null, { uuid: X.uuid, now: new Date() });
    } catch (e) {
      return X.toast(e.message, true);
    }
    await persistWater();
    X.rerender();
  },
  "diary-add": (el) => {
    const f = X.S.food;
    f.mealType = el.dataset.arg;
    f.trackDate = X.S.diaryDate ?? today();
    f.returnTo = "diary";
    X.go("food");
  },
  "diary-remove": async (el) => {
    if (!X.confirmTwice(el, "Nochmal: entfernen")) return;
    const [mealId, itemId] = el.dataset.arg.split("|");
    N.removeItem(X.S.food.local, mealId, itemId);
    try {
      await X.store.set("nutrition", X.S.food.local);
    } catch (e) {
      X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
    }
    X.rerender();
  },
};

/** Änderungen an Auswahlfeldern; true = behandelt. */
export function diaryChange(el) {
  const k = el.dataset?.diary;
  if (!k) return false;
  if (k === "pick" || k === "pickall") {
    const [pk, id] = el.dataset.arg.split("|");
    const cur = new Set(X.S.mealPick?.[pk] ?? []);
    if (k === "pickall") {
      cur.clear();
      if (el.checked) for (const i of itemsOf(pk, null).items) cur.add(i.id);
    } else if (el.checked) cur.add(id);
    else cur.delete(id);
    X.S.mealPick = { ...(X.S.mealPick ?? {}), [pk]: [...cur] };
    if (X.S.mealAct?.pk === pk && X.S.mealAct.kind !== "date") X.S.mealAct.ids = [...cur];
    X.rerender();
    return true;
  }
  if (k === "act-name" || k === "act-date" || k === "act-meal") {
    // Nur merken, nicht neu zeichnen – sonst ginge ein Tipp auf „Eintragen“ verloren
    const a = X.S.mealAct;
    if (a) a[k === "act-name" ? "name" : k === "act-date" ? "date" : "mealType"] = el.value;
    return true;
  }
  if (k === "date") {
    const v = el.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) X.S.diaryDate = v > today() ? today() : v;
    X.rerender();
    return true;
  }
  if (k === "glass") {
    try {
      P.setGlassMl(X.S.water, Number(el.value));
    } catch (e) {
      X.toast(e.message, true);
      return true;
    }
    persistWater().then(() => X.rerender());
    return true;
  }
  if (k === "days") {
    X.S.historyDays = Number(el.value);
    X.rerender();
    return true;
  }
  return false;
}
