// LIFESPAN OS Mobil – Mahlzeit erfassen wie am PC (Handy 1.125.0, Entwurf A+ / PC 1.0.200):
// „Wie immer?“, Suche über alle Datenbanken (Lebensmittel, BLS, Open Food Facts, Gerichte,
// Supplemente, Stacks, Koffein) oder Schnelleintrag (Nährwerte), dazu „Wird eingetragen“ mit
// Etikett je Spalte im Tagesverlauf, Summen und „Aus den Zutaten ein Gericht anlegen“.
// Speichern: Lebensmittel in die Mahlzeit, Schnelleintrag als Nährwerte der Mahlzeit, Supplemente
// als Einnahme zur Mahlzeit, Koffein zur Uhrzeit der Mahlzeit. Regeln: `mealBuilder` in pcdomain.js.

import * as D from "./pcdomain.js";
import * as N from "./nutrition.js";
import * as SP from "./supplements.js";
import * as FT from "./fastdata.js";
import * as CF from "./caffeinedata.js";
import * as QM from "./quickmeal.js";
import { buildDb, nutrientCatalog } from "./diary.js";

let H = null; // Helfer aus food.js: X, F, esc, today, trackDate, persist, quickData, startAmount, timeFieldHtml, mealOptions, foodResults

/** Wird einmal von food.js aufgerufen. */
export function initPlate(helpers) {
  H = helpers;
}

const MB = () => D.mealBuilder;
const C = () => D.caffeine;
const esc = (v) => H.esc(v);
const num = (t) => {
  const v = N.parseNum(String(t ?? ""));
  return Number.isFinite(v) && v > 0 ? v : 0;
};
const r1 = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
const r0 = (v) => Math.round(v).toLocaleString("de-DE");
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");

export function emptyPlate() {
  return { items: [], extras: [], quick: MB().emptyQuickForm(), quickValues: {}, quickNames: [], tab: "search", tried: false, taken: null, takenIds: {}, recipeOpen: false, recipeName: "", recipePortions: "1", recipeDone: "" };
}

const P = () => {
  const s = H.F();
  if (!s.plate) s.plate = emptyPlate();
  return s.plate;
};

/** Ist der Teller leer (nichts zum Eintragen)? */
const plateEmpty = (p) => !p.items.length && !p.extras.length && !Object.keys(p.quickValues).length;

// ------------------------------------------------------------------ Etiketten

const TAGS = { meal: "Mahlzeit", recipe: "Gericht · Mahlzeit", quick: "⚡ Schnelleintrag", supplement: "Supplement", stack: "Supplemente", caffeine: "Koffein" };
const tagCls = { meal: "meal", recipe: "meal", quick: "quick", supplement: "supplement", stack: "supplement", caffeine: "caffeine" };
export const tagHtml = (kind) => `<span class="plt-tag plt-tag--${tagCls[kind]}">${esc(TAGS[kind])}</span>`;

// ------------------------------------------------------------------ Weitere Treffer der Suche

/** Gerichte (PC und Handy), Supplemente, Stacks, Koffein – einmal je Anzeige. */
function extraIndex() {
  const s = H.F();
  if (s._pltIdx && s._pltIdx.at === s._pltRender) return s._pltIdx;
  const db = buildDb();
  const pc = db.pc ?? {};
  const recipes = [];
  for (const r of pc.recipe ?? []) {
    if (r.archived) continue;
    recipes.push({
      id: r.id,
      name: r.name,
      kind: r.kind,
      servings: r.servings,
      items: (pc.recipe_item ?? []).filter((i) => i.recipe_id === r.id).map((i) => ({ foodId: i.food_id, amount: i.amount })),
      supplements: (pc.recipe_supplement ?? []).filter((i) => i.recipe_id === r.id).map((i) => ({ supplementId: i.supplement_id, amount: i.amount })),
    });
  }
  for (const r of Object.values(s.local.recipes ?? {})) {
    if (recipes.some((x) => x.id === r.row.id)) continue;
    recipes.push({
      id: r.row.id,
      name: r.row.name,
      kind: r.row.kind,
      servings: r.row.servings,
      items: r.items.map((i) => ({ foodId: i.food_id, amount: i.amount })),
      supplements: (r.supplements ?? []).map((i) => ({ supplementId: i.supplement_id, amount: i.amount })),
    });
  }
  const idx = {
    at: s._pltRender,
    db,
    recipes,
    supplements: db.supplements ?? new Map(),
    stacks: SP.stackChoices(pc),
    drinks: C().CAFFEINE_DRINKS.filter((d) => d.portionMg !== null),
  };
  s._pltIdx = idx;
  return idx;
}

const hit = (words, text) => words.every((w) => norm(text).includes(w));

/** Gerichte, Supplemente, Stacks und Koffein zur Suche (unter den Lebensmitteln). */
export function extraResultsHtml(query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const planned = Boolean(H.F().planAt);
  const ix = extraIndex();
  const out = [];
  for (const r of ix.recipes) {
    if (!hit(words, r.name)) continue;
    const sups = r.supplements.length ? ` · + ${r.supplements.length} Supplement${r.supplements.length === 1 ? "" : "e"}` : "";
    out.push(row("r", r.id, "recipe", r.name, `${r.kind === "recipe" ? `Rezept · ${r1(r.servings)} Portionen` : "Gericht"}${sups}`));
  }
  if (!planned) {
    for (const sp of ix.supplements.values()) {
      if (sp.archived || !hit(words, `${sp.name} ${sp.manufacturer ?? ""}`)) continue;
      out.push(row("s", sp.id, "supplement", sp.name, [sp.manufacturer, sp.unit].filter(Boolean).join(" · ")));
    }
    for (const st of ix.stacks) {
      if (!hit(words, `stack ${st.name}`)) continue;
      const names = st.items.map((i) => ix.supplements.get(i.supplementId)?.name).filter(Boolean).join(", ");
      out.push(row("k", st.id, "stack", `Stack „${st.name}“`, names));
    }
    for (const d of ix.drinks) {
      if (!hit(words, `${d.label} koffein`)) continue;
      out.push(row("c", d.id, "caffeine", d.label, `${d.portionMg} mg Koffein je Portion${d.portionMl !== null ? ` (${d.portionMl} ml)` : ""}`));
    }
  }
  return out.length ? `<p class="list-head small"><b>Gerichte, Supplemente, Koffein</b></p>${out.slice(0, 20).join("")}` : "";
}

const row = (kind, id, tag, name, detail) =>
  `<button class="item plt-hit" data-act="plt-extra" data-arg="${kind}:${esc(id)}"><span class="main">${tagHtml(tag)}<b>${esc(name)}</b><span class="muted small">${esc(detail)}</span></span><span class="chev">+</span></button>`;

// ------------------------------------------------------------------ Karte

function quickFormHtml(p) {
  const check = MB().checkQuick(p.quick, p.tried);
  const names = { fat: "Fett", carbs: "Kohlenhydrate", protein: "Protein" };
  let hint = "Leere Energie wird aus Fett, Kohlenhydraten, Protein und Ballaststoffen berechnet.";
  if (check.missing.length) hint = `Noch eintragen: ${check.missing.map((f) => names[f] ?? f).join(", ")} (0 ist erlaubt).`;
  else if (Object.keys(check.errors).length) hint = "Bitte die markierten Felder prüfen.";
  const blocked = !check.ok;
  const fields = MB()
    .QUICK_FIELDS.map((d) => {
      const err = check.errors[d.field];
      let ph = d.required ? "Pflicht" : "optional";
      if (d.field === "kcal" && !p.quick.kcal.trim() && check.kcal !== null) ph = `≈ ${r0(check.kcal)} (berechnet)`;
      if (d.field === "kj" && !p.quick.kj.trim() && check.kj !== null) ph = `≈ ${r0(check.kj)} (berechnet)`;
      return `<div class="plt-q__field"><label for="pltq-${d.field}"><span>${esc(d.label)}${d.required ? `<span class="plt-q__star"> *</span>` : ""}</span>${err ? `<span class="plt-q__err">${esc(err)}</span>` : ""}</label>
        <div class="plt-q__box${d.required ? " is-req" : ""}${err ? " is-err" : ""}"><input id="pltq-${d.field}" type="text" inputmode="decimal" data-pltq="${d.field}" value="${esc(p.quick[d.field])}" placeholder="${esc(ph)}"><span>${esc(d.unit)}</span></div></div>`;
    })
    .join("");
  return `<p class="muted small">Werte wie auf der Packung oder vom Restaurant. Pflicht sind nur <b>Fett, Kohlenhydrate und Protein</b> – 0 ist erlaubt.</p>
    <div class="field"><label for="pltq-name">Bezeichnung (optional)</label><input id="pltq-name" type="text" data-pltq="name" maxlength="60" value="${esc(p.quick.name)}" placeholder="z. B. Pizza im Restaurant"></div>
    <div class="plt-q__grid">${fields}</div>
    <p class="small ${blocked ? "plt-q__warn" : "muted"}" id="plt-q-hint">${esc(hint)}</p>
    <button class="btn block ${blocked ? "" : "primary"}" data-act="plt-quick-add">Auf den Teller</button>`;
}

function stepper(i, kind, value, unit) {
  return `<div class="plt-step"><button type="button" data-act="plt-step" data-arg="${kind}|${i}|-1" aria-label="weniger">−</button><input type="text" inputmode="decimal" data-plta="${kind}|${i}" value="${esc(value)}" aria-label="Menge in ${esc(unit)}"><span>${esc(unit)}</span><button type="button" data-act="plt-step" data-arg="${kind}|${i}|1" aria-label="mehr">+</button></div>`;
}

/** Summen des Tellers (Lebensmittel, Schnelleintrag, Supplemente; Koffein in mg). */
function totals(p, foods) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, sat: 0, sugar: 0, fiber: 0, mg: 0, supps: 0 };
  for (const it of p.items) {
    const f = foods.get(it.foodId);
    const a = num(it.amount);
    if (!f || !a) continue;
    t.kcal += (f.energy_kcal * a) / 100;
    t.protein += (f.protein_g * a) / 100;
    t.carbs += (f.carbs_g * a) / 100;
    t.fat += (f.fat_g * a) / 100;
    t.sat += ((f.saturated_fat_g ?? 0) * a) / 100;
    t.sugar += ((f.sugar_g ?? 0) * a) / 100;
    t.fiber += ((f.fiber_g ?? 0) * a) / 100;
    t.mg += foodMg(f, a);
  }
  const q = p.quickValues;
  t.kcal += q.energy ?? 0;
  t.protein += q.protein ?? 0;
  t.carbs += q.carbs ?? 0;
  t.fat += q.fat ?? 0;
  t.sat += q.saturated_fat ?? 0;
  t.sugar += q.sugar ?? 0;
  t.fiber += q.fiber ?? 0;
  for (const x of p.extras) {
    if (x.kind === "caffeine") t.mg += caffeineOf(x)?.mg ?? 0;
    else t.supps += 1;
  }
  return t;
}

/** Koffein einer Menge eines Lebensmittels (mg je 100 g/ml, 1.126.0) – 0 ohne Angabe. */
const foodMg = (f, a) => (f && Number(f.caffeine_mg) > 0 && a > 0 ? (Number(f.caffeine_mg) * a) / 100 : 0);

function caffeineOf(x) {
  const d = C().findDrink(x.drinkId);
  if (!d || d.portionMg === null) return null;
  const n = num(x.portions);
  return { label: d.label, mg: Math.round(d.portionMg * n), ml: d.portionMl !== null ? Math.round(d.portionMl * n) : null };
}

function plateHtml(p) {
  const { foods } = H.quickData();
  const ix = extraIndex();
  const rows = [];
  p.items.forEach((it, i) => {
    const f = foods.get(it.foodId);
    const a = num(it.amount);
    const kcal = f && a ? (f.energy_kcal * a) / 100 : null;
    const mg = foodMg(f, a);
    rows.push(`<li class="plt-row"><div class="plt-row__main"><b>${esc(f ? N.foodLabel(f) : "Unbekannt")}</b>${tagHtml("meal")}${mg > 0 ? tagHtml("caffeine") : ""}
      <span class="muted small">${f && a ? `E ${r1((f.protein_g * a) / 100)} g · KH ${r1((f.carbs_g * a) / 100)} g · F ${r1((f.fat_g * a) / 100)} g${mg > 0 ? ` · ${r0(mg)} mg Koffein` : ""}` : "Menge fehlt"}</span></div>
      ${stepper(i, "i", it.amount, f?.basis_unit ?? "g")}<span class="plt-row__right">${kcal === null ? "–" : `${r0(kcal)} kcal`}</span>
      <button class="plt-row__x" data-act="plt-del" data-arg="i|${i}" aria-label="Entfernen">✕</button></li>`);
  });
  if (Object.keys(p.quickValues).length) {
    const q = p.quickValues;
    rows.push(`<li class="plt-row"><div class="plt-row__main"><b>${esc(p.quickNames.join(", ") || "Schnelleintrag")}</b>${tagHtml("quick")}
      <span class="muted small">E ${r1(q.protein ?? 0)} g · KH ${r1(q.carbs ?? 0)} g · F ${r1(q.fat ?? 0)} g</span></div>
      <button class="btn sm plt-row__edit" data-act="plt-quick-edit">Bearbeiten</button><span class="plt-row__right">${r0(q.energy ?? 0)} kcal</span>
      <button class="plt-row__x" data-act="plt-del" data-arg="q|0" aria-label="Entfernen">✕</button></li>`);
  }
  p.extras.forEach((x, i) => {
    if (x.kind === "caffeine") {
      const c = caffeineOf(x);
      rows.push(`<li class="plt-row"><div class="plt-row__main"><b>${esc(c?.label ?? "Getränk")}</b>${tagHtml("caffeine")}
        <span class="muted small">${c ? `${c.mg} mg Koffein${c.ml !== null ? ` · ${c.ml} ml` : ""}` : "–"}</span></div>
        ${stepper(i, "c", x.portions, "Port.")}<span class="plt-row__right">${c ? `${c.mg} mg` : "–"}</span>
        <button class="plt-row__x" data-act="plt-del" data-arg="x|${i}" aria-label="Entfernen">✕</button></li>`);
      return;
    }
    const sp = ix.supplements.get(x.supplementId);
    rows.push(`<li class="plt-row"><div class="plt-row__main"><b>${esc(sp?.name ?? "Supplement")}</b>${tagHtml("supplement")}
      <span class="muted small">${esc(sp?.manufacturer ?? "")}</span></div>
      ${stepper(i, "s", x.amount, sp?.unit ?? "")}<span class="plt-row__right"></span>
      <button class="plt-row__x" data-act="plt-del" data-arg="x|${i}" aria-label="Entfernen">✕</button></li>`);
  });
  const t = totals(p, foods);
  const canDish = p.items.length > 0 || p.extras.some((x) => x.kind === "supplement");
  let dish = "";
  if (!H.F().planAt && canDish) {
    if (p.recipeDone && !p.recipeOpen) dish = `<p class="ok small">${esc(p.recipeDone)}</p>`;
    else if (!p.recipeOpen) dish = `<button class="btn block plt-dish-open" data-act="plt-dish-open">📖 Aus den Zutaten ein Gericht anlegen</button>`;
    else {
      const n = num(p.recipePortions) || 1;
      const sups = p.extras.filter((x) => x.kind === "supplement").length;
      const other = Object.keys(p.quickValues).length || p.extras.some((x) => x.kind === "caffeine");
      dish = `<div class="plt-dish"><div class="plt-dish__grid"><label for="plt-dish-name">Name des Gerichts</label><label for="plt-dish-port">Portionen</label>
        <input id="plt-dish-name" type="text" maxlength="80" data-pltd="recipeName" value="${esc(p.recipeName)}"><input id="plt-dish-port" type="text" inputmode="decimal" data-pltd="recipePortions" value="${esc(p.recipePortions)}"></div>
        <p class="muted small">${p.items.length} Zutat${p.items.length === 1 ? "" : "en"}${sups ? ` + ${sups} Supplement${sups === 1 ? "" : "e"}` : ""} · ${r0(t.kcal / n)} kcal je Portion${other ? " · Schnelleintrag und Koffein kommen nicht ins Gericht" : ""}</p>
        <div class="row"><button class="btn sm" data-act="plt-dish-cancel">Abbrechen</button><button class="btn sm primary" data-act="plt-dish-save">Unter Gerichte speichern</button></div></div>`;
    }
  }
  return `<ul class="plt-list">${rows.join("") || `<li class="muted small plt-empty">Noch leer – oben suchen, „Wie immer?“ oder einen Favoriten antippen oder den Schnelleintrag nutzen.</li>`}</ul>
    ${dish}
    <div class="plt-sum"><div><span>kcal</span><b>${r0(t.kcal)}</b></div><div><span>Protein</span><b>${r1(t.protein)} g</b></div><div><span>KH</span><b>${r1(t.carbs)} g</b></div><div><span>Fett</span><b>${r1(t.fat)} g</b></div></div>
    <p class="muted small">davon ges. Fettsäuren ${r1(t.sat)} g · Zucker ${r1(t.sugar)} g · Ballaststoffe ${r1(t.fiber)} g · ${r0(t.kcal * 4.184)} kJ${t.mg ? ` · Koffein ${r0(t.mg)} mg` : ""}${t.supps ? ` · ${t.supps} Supplement${t.supps === 1 ? "" : "e"}` : ""}</p>`;
}

/** Karte „Mahlzeit erfassen“ (ersetzt „Schnell eintragen“ und die Suche). */
export function plateCardHtml() {
  const s = H.F();
  s._pltRender = (s._pltRender ?? 0) + 1;
  const p = P();
  const planned = Boolean(s.planAt);
  const { history, foods } = H.quickData();
  const usual = MB().usualMeals(history, s.mealType, H.today());
  const favs = QM.Q.favoriteFoods(history, H.today(), { limit: 10, key: s.mealType }).filter((x) => foods.has(x.foodId));
  const usualHtml = usual.length
    ? `<div class="plt-usual"><h4>Wie immer?</h4>${usual
        .map((u) => {
          const names = u.items.map((i) => foods.get(i.foodId)).filter(Boolean).map((f) => QM.Q.shortFoodName(f.name, 18));
          const kcal = u.items.reduce((a, i) => a + ((foods.get(i.foodId)?.energy_kcal ?? 0) * i.amount) / 100, 0);
          const on = Boolean(p.takenIds?.[u.key]) || p.taken === u.key;
          return `<button class="plt-usual__card${on ? " is-taken" : ""}" data-act="plt-usual" data-arg="${esc(u.key)}"><span><b>${esc(u.label)}</b>${u.note ? ` <span class="muted">· ${esc(u.note)}</span>` : ""}<span class="muted small plt-usual__detail">${esc(names.join(", "))} · ${r0(kcal)} kcal</span></span><span class="plt-usual__act">${on ? "✓ Entfernen" : "+ Übernehmen"}</span></button>`;
        })
        .join("")}</div>`
    : "";
  const favHtml = favs.length
    ? `<div class="chip-row">${favs
        .map((x) => {
          const f = foods.get(x.foodId);
          return `<button type="button" class="chip quick-fav" data-act="plt-fav" data-arg="${esc(f.id)}" data-hold="1" title="${esc(f.name)}">+ ${esc(QM.Q.shortFoodName(f.name))} <span class="muted">${esc(r1(x.amount))} ${esc(f.basis_unit)}</span></button>`;
        })
        .join("")}</div>`
    : "";
  const tab = planned ? "search" : p.tab;
  const tabs = planned
    ? ""
    : `<div class="plt-tabs" role="group" aria-label="Hinzufügen über"><button type="button" class="${tab === "search" ? "is-active" : ""}" aria-pressed="${tab === "search"}" data-act="plt-tab" data-arg="search">🔍 Suche</button><button type="button" class="${tab === "quick" ? "is-active" : ""}" aria-pressed="${tab === "quick"}" data-act="plt-tab" data-arg="quick">⚡ Schnelleintrag</button></div>`;
  // Suche (1.182.0): Suchfeld mit „Fertig“ und Teller-Zeile in einer Leiste, die im Suchmodus
  // oben unter dem Kopf stehen bleibt; Favoriten nur ohne Suchbegriff.
  const search = `<div class="plt-searchbar"><div class="plt-searchbar__row"><input id="food-q" type="search" placeholder="${planned ? "Lebensmittel oder Gericht suchen" : "Lebensmittel, Gericht, Supplement, Koffein …"}" value="${esc(s.query)}" autocomplete="off" enterkeyhint="search"><button type="button" class="btn sm plt-searchbar__done" data-act="plt-search-done">Fertig</button></div>
      <div id="plt-mini" class="plt-mini">${miniHtml(p)}</div></div>
      <div id="plt-favs" ${String(s.query ?? "").trim() ? "hidden" : ""}>${favHtml}</div>
      <div class="list" id="food-results">${H.foodResults(s.query, "plt-add")}</div>
      <div class="plt-search-extra">${H.foodDupHtml()}</div>`;
  queueMicrotask(syncSearchMode);
  return `<section class="card hl" id="quick-meal">
    <h3>${planned ? "Mahlzeit planen" : "Mahlzeit erfassen"}</h3>
    <div class="nf-grid plt-when"><div class="field"><label for="qm-meal">Mahlzeit (${esc(H.trackDayLabel())})</label><select id="qm-meal" data-ft="mealType">${H.mealOptions(s.mealType)}</select></div>
      ${planned || s.selected ? "" : H.timeFieldHtml("track", H.trackDate(), s.mealType)}</div>
    ${tabs}
    <div id="food-search" class="food-search">${tab === "search" ? search : quickFormHtml(p)}</div>
    ${usualHtml}
    <div class="plt-head" id="plt-head"><h4>${planned ? "Wird geplant" : "Wird eingetragen"}</h4></div>
    <div id="plt-plate">${plateHtml(p)}</div>
    ${H.timeHintHtml("plate")}
    <button class="btn primary block" data-act="plt-save" ${plateEmpty(p) ? "disabled" : ""}>${planned ? "Planen" : "Speichern"}</button>
    ${plateEmpty(p) ? "" : `<button class="btn ghost block" data-act="plt-clear">Leeren</button>`}
  </section>`;
}

/** Kurzzeile „Auf dem Teller“ in der Suchleiste (ohne Neuzeichnen aktualisiert). */
function miniHtml(p) {
  const { foods } = H.quickData();
  const n = p.items.length + p.extras.length + (Object.keys(p.quickValues).length ? 1 : 0);
  if (!n) return `<span class="muted small">Teller leer – Treffer antippen legt sie auf den Teller.</span>`;
  const t = totals(p, foods);
  const last = p.items.length ? p.items[p.items.length - 1] : null;
  const lf = last ? foods.get(last.foodId) : null;
  return `<span class="plt-mini__count">🍽 ${n}</span><span class="small plt-mini__text">${lf ? `${esc(QM.Q.shortFoodName(lf.name, 22))} ${esc(r1(num(last.amount)))} ${esc(lf.basis_unit)} · ` : ""}<b>${r0(t.kcal)} kcal</b> · E ${r1(t.protein)} g</span>`;
}

/** Suchmodus (body.is-searching) nur, solange gesucht wird. */
function syncSearchMode() {
  const q = document.getElementById("food-q");
  if (!q || (document.activeElement !== q && !q.value.trim())) document.body.classList.remove("is-searching");
}

/** Suche beenden: Feld leeren, Tastatur zu, zum Teller. */
function endSearch() {
  const s = H.F();
  s.query = "";
  document.getElementById("food-q")?.blur();
  document.body.classList.remove("is-searching", "is-typing");
  H.X.rerender();
  requestAnimationFrame(() => document.getElementById("plt-head")?.scrollIntoView({ block: "start", behavior: "smooth" }));
}

// Antippen in der Suche lässt das Suchfeld (und die Tastatur) offen und markiert den Treffer kurz.
// Unter Node (Tests) gibt es kein Dokument – dann werden keine Ereignisse angemeldet (1.185.0)
const DOC = typeof document !== "undefined" ? document : null;
const KEEP_FOCUS = "#quick-meal .plt-searchbar button, #quick-meal #food-results .item, #quick-meal #plt-favs .chip";
for (const type of ["mousedown", "pointerdown"]) {
  DOC?.addEventListener(type, (ev) => {
    if (document.activeElement?.id === "food-q" && ev.target.closest?.(KEEP_FOCUS)) ev.preventDefault();
  });
}
// „Suchen“ auf der Tastatur: Tastatur zu, die Treffer bekommen den ganzen Bildschirm
DOC?.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target?.id === "food-q" && ev.target.closest("#quick-meal")) {
    ev.preventDefault();
    ev.target.blur();
  }
});
DOC?.addEventListener(
  "click",
  (ev) => {
    const hit = ev.target.closest?.("#quick-meal #food-results .item, #quick-meal #plt-favs .chip");
    if (!hit) return;
    hit.classList.add("is-added");
    setTimeout(() => hit.classList.remove("is-added"), 900);
  },
  true,
);

const refreshPlate = () => {
  const box = document.getElementById("plt-plate");
  if (!box) return H.X.rerender();
  box.innerHTML = plateHtml(P());
  const mini = document.getElementById("plt-mini");
  if (mini) mini.innerHTML = miniHtml(P());
  const btn = document.querySelector('[data-act="plt-save"]');
  if (btn) btn.disabled = plateEmpty(P());
};

// ------------------------------------------------------------------ Teller füllen

/** Lebensmittel mit Startmenge (übliche Menge) hinzufügen bzw. erhöhen. */
export function addFood(foodId, amount = null) {
  const { history, foods } = H.quickData();
  const f = foods.get(foodId);
  if (!f) return;
  const p = P();
  const a = amount ?? H.startAmount(f, history);
  const same = p.items.find((i) => i.foodId === foodId);
  if (same) same.amount = r1(num(same.amount) + a);
  else p.items.push({ foodId, amount: r1(a) });
  p.recipeDone = "";
}

function addExtras(list) {
  const p = P();
  for (const x of list) {
    const same = p.extras.find((y) => y.kind === x.kind && (x.kind === "supplement" ? y.supplementId === x.supplementId : y.drinkId === x.drinkId));
    if (same && x.kind === "supplement") same.amount = r1(num(same.amount) + num(x.amount));
    else if (same) same.portions = r1(num(same.portions) + num(x.portions));
    else p.extras.push(x);
  }
}

function addRecipe(r) {
  const factor = r.servings > 0 ? 1 / r.servings : 1;
  const { foods } = H.quickData();
  for (const i of r.items) if (foods.has(i.foodId)) addFood(i.foodId, i.amount * factor);
  if (!H.F().planAt) addExtras(r.supplements.map((x) => ({ kind: "supplement", supplementId: x.supplementId, amount: r1(x.amount * factor) })));
  H.X.toast(`„${r.name}“ (1 Portion) auf den Teller gelegt.`);
}

/** Schnelleintrag übernehmen; false = Pflichtfelder fehlen. */
function takeQuick() {
  const p = P();
  const c = MB().checkQuick(p.quick, true);
  if (!c.ok) {
    p.tried = true;
    return false;
  }
  for (const [k, v] of Object.entries(c.values)) p.quickValues[k] = Math.round(((p.quickValues[k] ?? 0) + v) * 1000) / 1000;
  if (p.quick.name.trim()) p.quickNames.push(p.quick.name.trim());
  p.quick = MB().emptyQuickForm();
  p.tried = false;
  return true;
}

// ------------------------------------------------------------------ Speichern

async function save(skipTime = false) {
  const s = H.F();
  const X = H.X;
  const p = P();
  if (!s.planAt && !MB().quickIsEmpty(p.quick) && !takeQuick()) {
    p.tab = "quick";
    X.toast("Schnelleintrag: bitte Fett, Kohlenhydrate und Protein eintragen (0 ist erlaubt) oder die Felder leeren.", true);
    return X.rerender();
  }
  const { foods } = H.quickData();
  const items = [];
  for (const it of p.items) {
    const a = num(it.amount);
    if (!(a > 0 && a <= 10000)) return X.toast(`${foods.get(it.foodId)?.name ?? "Eintrag"}: bitte eine Menge zwischen 0 und 10.000 eingeben.`, true);
    items.push({ foodId: it.foodId, amount: a });
  }
  if (s.planAt) {
    if (!items.length) return X.toast("Bitte mindestens ein Lebensmittel wählen.", true);
    const ok = await H.planItems(items, s.mealType, `${items.length} Lebensmittel`);
    s.plate = emptyPlate();
    return ok;
  }
  const date = H.trackDate();
  const known = N.mealTimeFor(X.S.catalog, s.local, date, s.mealType);
  let time = String(s.time ?? "").trim() || known || H.defaultTime(date);
  const caffeine = p.extras.filter((x) => x.kind === "caffeine");
  if (!time && !skipTime) {
    s.askTime = "plate";
    return X.rerender();
  }
  if (!time && caffeine.length) return X.toast("Für Koffein bitte eine Uhrzeit angeben.", true);
  s.askTime = null;
  const opts = { uuid: () => X.uuid(), now: new Date() };
  let mealId;
  try {
    if (items.length) {
      const meal = N.addToMeal(X.S.catalog, s.local, { date, mealType: s.mealType, items, time: time || null }, opts);
      mealId = meal.row.id;
    } else {
      mealId = N.ensureMeal(X.S.catalog, s.local, date, s.mealType, opts);
      const row = s.local.meals[mealId]?.row;
      if (row && time && !row.time) row.time = time;
    }
    await H.persist();
    let db = buildDb();
    const parts = [];
    // Schnelleintrag: Nährwerte der Mahlzeit (zu vorhandenen addiert)
    if (Object.keys(p.quickValues).length) {
      const target = { kind: "meal", mealId };
      const values = { ...FT.currentValues(db, target).values };
      for (const [k, v] of Object.entries(p.quickValues)) values[k] = Math.round(((values[k] ?? 0) + v) * 1000) / 1000;
      X.S.fast = FT.normFast(X.S.fast);
      FT.saveFast(db, X.S.fast, target, values, "", { ...opts, knownKeys: new Set(nutrientCatalog(db).nutrients.map((n) => n.key)), pcIds: FT.pcFastIds(X.S.catalog) });
      await X.store.set("fast", X.S.fast);
      parts.push("Schnelleintrag");
    }
    // Supplemente als Einnahme zur Mahlzeit
    const supps = p.extras.filter((x) => x.kind === "supplement");
    if (supps.length) {
      db = buildDb();
      const draft = { ...SP.emptyDraft(date, `meal:${mealId}`, time), items: supps.map((x) => ({ id: null, supplementId: x.supplementId, amount: x.amount })) };
      SP.saveIntake(db, X.S.supp, draft, { ...opts, timingLabel: N.mealLabel(s.mealType), ensureMeal: (d, t) => N.ensureMeal(X.S.catalog, s.local, d, t, opts) });
      await X.store.set("supp", X.S.supp);
      parts.push(`${supps.length} Supplement${supps.length === 1 ? "" : "e"}`);
    }
    // Koffein zur Uhrzeit der Mahlzeit
    let mg = 0;
    for (const x of caffeine) {
      const c = caffeineOf(x);
      if (!c || c.mg < 1) continue;
      CF.addIntake(X.S.catalog, X.S.caffeine, { date, time, drinkId: x.drinkId, label: c.label, ml: c.ml, mg: c.mg }, opts);
      mg += c.mg;
    }
    if (mg) {
      await X.store.set("caffeine", X.S.caffeine);
      parts.push(`${mg} mg Koffein`);
    }
    await H.persist();
    const label = [items.length ? `${items.length} Lebensmittel` : "", ...parts].filter(Boolean).join(" · ");
    X.toast(`Eingetragen bei ${N.mealLabel(s.mealType)}: ${label}`);
  } catch (e) {
    X.toast(e.message, true);
    return X.rerender();
  }
  s.plate = emptyPlate();
  s.query = "";
  if (s.returnTo) {
    const to = s.returnTo;
    if (to === "diary") {
      X.S.diaryFocus = s.mealType;
      X.S.mealOpen = { ...(X.S.mealOpen ?? {}), [s.mealType]: true };
    }
    s.returnTo = null;
    s.trackDate = null;
    return X.go(to);
  }
  X.rerender();
}

// ------------------------------------------------------------------ Aktionen und Eingaben

export const plateActions = {
  "plt-add": (el, amount) => {
    addFood(el.dataset.arg, typeof amount === "number" ? amount : null);
    refreshPlate();
  },
  "plt-fav": (el) => {
    if (el.dataset.held) {
      delete el.dataset.held; // lange gedrückt: Menge ist schon geöffnet
      return;
    }
    addFood(el.dataset.arg);
    refreshPlate();
  },
  "plt-extra": (el) => {
    const [kind, ...rest] = el.dataset.arg.split(":");
    const id = rest.join(":");
    const ix = extraIndex();
    if (kind === "r") {
      const r = ix.recipes.find((x) => x.id === id);
      if (r) addRecipe(r);
    } else if (kind === "s") {
      const sp = ix.supplements.get(id);
      if (sp) addExtras([{ kind: "supplement", supplementId: sp.id, amount: r1(SP.startAmount(sp)) }]);
    } else if (kind === "k") {
      const st = ix.stacks.find((x) => x.id === id);
      if (st) addExtras(st.items.map((i) => ({ kind: "supplement", supplementId: i.supplementId, amount: r1(i.amount) })));
    } else if (kind === "c") addExtras([{ kind: "caffeine", drinkId: id, portions: "1" }]);
    refreshPlate();
  },
  "plt-tab": (el) => {
    P().tab = el.dataset.arg === "quick" ? "quick" : "search";
    H.X.rerender();
  },
  "plt-usual": (el) => {
    const p = P();
    const key = el.dataset.arg;
    p.takenIds = p.takenIds ?? {};
    // Nochmal antippen nimmt den Vorschlag wieder vom Teller (1.182.0)
    if (p.taken === key || p.takenIds[key]) {
      const ids = new Set(p.takenIds[key] ?? []);
      p.items = p.items.filter((x) => !ids.has(x.foodId));
      delete p.takenIds[key];
      if (p.taken === key) p.taken = null;
    } else {
      const { history, foods } = H.quickData();
      const u = MB().usualMeals(history, H.F().mealType, H.today()).find((x) => x.key === key);
      if (!u) return;
      const added = [];
      for (const i of u.items)
        if (foods.has(i.foodId) && !p.items.some((x) => x.foodId === i.foodId)) {
          p.items.push({ foodId: i.foodId, amount: r1(i.amount) });
          added.push(i.foodId);
        }
      p.takenIds[key] = added;
      p.taken = key;
    }
    // ohne Neuzeichnen: Seite springt nicht
    for (const card of document.querySelectorAll(".plt-usual__card")) {
      const on = Boolean(p.takenIds[card.dataset.arg]);
      card.classList.toggle("is-taken", on);
      const act = card.querySelector(".plt-usual__act");
      if (act) act.textContent = on ? "✓ Entfernen" : "+ Übernehmen";
    }
    refreshPlate();
  },
  "plt-search-done": () => endSearch(),
  "plt-step": (el) => {
    const [kind, i, d] = el.dataset.arg.split("|");
    const p = P();
    const dir = Number(d);
    if (kind === "i") {
      const it = p.items[Number(i)];
      if (it) it.amount = r1(QM.Q.stepAmount(num(it.amount), dir * 10));
    } else {
      const x = p.extras[Number(i)];
      if (x?.kind === "caffeine") x.portions = r1(Math.max(1, num(x.portions) + dir));
      else if (x) x.amount = r1(Math.max(1, num(x.amount) + dir));
    }
    refreshPlate();
  },
  "plt-del": (el) => {
    const [kind, i] = el.dataset.arg.split("|");
    const p = P();
    if (kind === "i") p.items.splice(Number(i), 1);
    else if (kind === "x") p.extras.splice(Number(i), 1);
    else {
      p.quickValues = {};
      p.quickNames = [];
    }
    refreshPlate();
  },
  "plt-quick-add": () => {
    if (!takeQuick()) H.X.toast("Bitte Fett, Kohlenhydrate und Protein eintragen (0 ist erlaubt).", true);
    H.X.rerender();
  },
  "plt-quick-edit": () => {
    const p = P();
    const form = MB().emptyQuickForm();
    for (const d of MB().QUICK_FIELDS) if (d.key && p.quickValues[d.key] !== undefined) form[d.field] = r1(p.quickValues[d.key]);
    form.name = p.quickNames.join(", ");
    p.quick = form;
    p.quickValues = {};
    p.quickNames = [];
    p.tab = "quick";
    H.X.rerender();
  },
  "plt-dish-open": () => {
    const p = P();
    p.recipeOpen = true;
    if (!p.recipeName) p.recipeName = N.mealLabel(H.F().mealType);
    H.X.rerender();
  },
  "plt-dish-cancel": () => {
    P().recipeOpen = false;
    H.X.rerender();
  },
  "plt-dish-save": async () => {
    const p = P();
    const s = H.F();
    const X = H.X;
    try {
      const dish = {
        name: p.recipeName,
        servings: p.recipePortions,
        items: p.items.map((i) => ({ foodId: i.foodId, amount: i.amount, unit: "base" })),
        supplements: p.extras.filter((x) => x.kind === "supplement").map((x) => ({ supplementId: x.supplementId, amount: num(x.amount) })),
      };
      const row = N.saveDishAsRecipe(X.S.catalog, s.local, dish, { uuid: () => X.uuid(), now: new Date() });
      await H.persist();
      p.recipeOpen = false;
      p.recipeDone = `„${row.name}“ unter Gerichte gespeichert – findest du ab jetzt in der Suche.`;
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
  "plt-save": () => save(false),
  "plt-clear": (el) => {
    if (!H.X.confirmTwice(el, "Nochmal tippen: Teller leeren")) return;
    H.F().plate = emptyPlate();
    H.X.rerender();
  },
};

/** Eingaben der Karte; true = behandelt. */
export function plateInput(el) {
  const p = H.F()?.plate;
  if (!p) return false;
  if (el.dataset.pltq) {
    p.quick[el.dataset.pltq] = el.value;
    const hint = document.getElementById("plt-q-hint");
    if (hint) {
      const c = MB().checkQuick(p.quick, p.tried);
      hint.textContent = c.missing.length ? `Noch eintragen: ${c.missing.map((f) => ({ fat: "Fett", carbs: "Kohlenhydrate", protein: "Protein" })[f]).join(", ")} (0 ist erlaubt).` : Object.keys(c.errors).length ? "Bitte die markierten Felder prüfen." : "Leere Energie wird aus Fett, Kohlenhydraten, Protein und Ballaststoffen berechnet.";
    }
    return true;
  }
  if (el.dataset.plta) {
    const [kind, i] = el.dataset.plta.split("|");
    if (kind === "i" && p.items[Number(i)]) p.items[Number(i)].amount = el.value;
    else if (kind === "c" && p.extras[Number(i)]) p.extras[Number(i)].portions = el.value;
    else if (kind === "s" && p.extras[Number(i)]) p.extras[Number(i)].amount = el.value;
    return true;
  }
  if (el.dataset.pltd) {
    p[el.dataset.pltd] = el.value;
    return true;
  }
  return false;
}

/** Uhrzeit-Hinweis „Ohne Uhrzeit eintragen“ für den Teller. */
export const saveWithoutTime = () => save(true);
