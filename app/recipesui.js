// LIFESPAN OS Mobil – Nutrition → Gerichte & Planen → Vorlagen & Rezepte wie am PC (1.147.0,
// `RecipesTab.tsx`): Liste (archivierte auf Wunsch), anlegen und bearbeiten mit Zutaten und
// Supplementen, eintragen (Tag, Mahlzeit, Portionen – Supplemente anteilig als Einnahme zur
// Mahlzeit), löschen. Logik in recipes.js; geht mit „An den PC senden“ zurück.

import * as D from "./pcdomain.js";
import * as N from "./nutrition.js";
import * as RC from "./recipes.js";
import * as SP from "./supplements.js";
import * as PR from "./paritydata.js";
import { X, buildDb, today, nutritionTabs } from "./diary.js";
import { refreshCatalog } from "./appbase.js";

const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);
const kcal = (v) => `${F(Math.round(v ?? 0), 0)} kcal`;
const grams = (v) => `${F(v ?? 0, 1)} g`;
const amountText = (v, unit) => `${F(v, Number.isInteger(v) ? 0 : 1)} ${unit}`;

/** Lebensmittel (auch archivierte, soweit bekannt) und Supplemente für die Rechnung. */
function lookups(db) {
  const foods = new Map(db.foods);
  for (const [id, f] of N.allFoods(X.S.catalog, X.S.food.local)) foods.set(id, f);
  return { foods, supplements: db.supplements ?? new Map() };
}

function models(db = buildDb()) {
  const { foods, supplements } = lookups(db);
  return { db, foods, supplements, list: RC.recipeModels(db, foods, supplements, X.S.food.local) };
}

async function persistFood() {
  try {
    await X.store.set("nutrition", X.S.food.local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

// ------------------------------------------------------------------ Liste

function sumLine(r) {
  const each = RC.perServing(r);
  const fiber = r.fiber.known ? `${grams(r.fiber.value)}${r.fiber.known < r.fiber.total ? ` (${r.fiber.known} von ${r.fiber.total} Zutaten mit Angabe)` : ""}` : "keine Angabe";
  return `<p class="sum-line small">${r.kind === "recipe" ? "Je Portion: " : ""}<b>${kcal(each.energyKcal)}</b> · Protein ${grams(each.proteinG)} · KH ${grams(each.carbsG)} · Fett ${grams(each.fatG)}${
    r.kind === "recipe" ? ` <span class="muted">(gesamt ${kcal(r.energyKcal)})</span>` : ""
  } <span class="muted">· Ballaststoffe gesamt: ${esc(fiber)}</span></p>`;
}

function logFormHtml(r) {
  const l = X.S.recipeLog ?? {};
  const e = l.errors ?? {};
  return `<div class="rcp-log" id="rcp-log">
    <div class="nf-grid">
      <div class="field"><label for="rcp-log-date">Datum</label><input id="rcp-log-date" type="date" data-rcplog="date" value="${esc(l.date)}" max="${esc(today())}">${e.date ? `<p class="err small">${esc(e.date)}</p>` : ""}</div>
      <div class="field"><label for="rcp-log-meal">Mahlzeit</label><select id="rcp-log-meal" data-rcplog="mealType">${N.mealChoices(l.mealType)
        .map((m) => `<option value="${esc(m.value)}" ${m.value === l.mealType ? "selected" : ""}>${esc(m.label)}</option>`)
        .join("")}</select></div>
      <div class="field"><label for="rcp-log-servings">Portionen</label><input id="rcp-log-servings" type="text" inputmode="decimal" data-rcplog="servings" value="${esc(l.servings)}" autocomplete="off">${e.servings ? `<p class="err small">${esc(e.servings)}</p>` : ""}</div>
    </div>
    <div class="row"><button class="btn primary" data-act="rcp-log-save" data-arg="${esc(r.id)}">Eintragen</button><button class="btn ghost" data-act="rcp-log-cancel">Abbrechen</button></div>
  </div>`;
}

function recipeCard(r) {
  const logging = X.S.recipeLog?.id === r.id;
  const rows = [
    ...r.items.map(
      (i) => `<tr><td>${esc(i.foodName)}${i.foodBrand ? ` <span class="muted small">${esc(i.foodBrand)}</span>` : ""}</td><td class="num">${esc(amountText(i.amount, i.basisUnit))}</td><td class="num">${esc(kcal(i.energyKcal))}</td></tr>`,
    ),
    ...r.supplements.map((x) => `<tr><td>${esc(x.name)} <span class="tag">Supplement</span></td><td class="num">${esc(`${F(x.amount, Number.isInteger(x.amount) ? 0 : 3)} ${x.unit}`)}</td><td></td></tr>`),
  ];
  return `<section class="card rcp-card" id="rcp-${esc(r.id)}">
    <div class="wo-head"><h3>${esc(r.name)}</h3><span class="tag">${r.kind === "meal" ? "Vorlage" : `Rezept · ${F(r.servings, Number.isInteger(r.servings) ? 0 : 1)} Portionen`}</span>${r.archived ? `<span class="tag">Archiviert</span>` : ""}${
      r.onPhone ? `<span class="tag tag--phone">noch nicht am PC</span>` : ""
    }</div>
    ${sumLine(r)}
    ${rows.length ? `<div class="table-scroll"><table class="data-table rcp-table"><tbody>${rows.join("")}</tbody></table></div>` : ""}
    ${r.notes ? `<p class="card__note">${esc(r.notes)}</p>` : ""}
    ${
      logging
        ? logFormHtml(r)
        : `<div class="row rcp-actions">${r.archived ? "" : `<button class="btn sm" data-act="rcp-log" data-arg="${esc(r.id)}">Eintragen …</button>`}<button class="btn sm ghost" data-act="rcp-edit" data-arg="${esc(r.id)}">Bearbeiten</button><button class="btn sm ghost danger" data-act="rcp-delete" data-arg="${esc(r.id)}">Löschen</button></div>`
    }
  </section>`;
}

/** Nutrition → Gerichte & Planen → Vorlagen & Rezepte. */
export function viewRecipes() {
  const S = X.S;
  const { list } = models();
  const archived = Boolean(S.recipesArchived);
  const shown = RC.sortedRecipes(list, { archived });
  const notice = S.recipeNotice ?? null;
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("recipes")}
    <section class="card">
      <p class="small">Vorlagen und Rezepte sparen Tipparbeit. Beim Eintragen werden die Zutaten anteilig in die Mahlzeit übernommen.</p>
      <label class="goal-check"><input type="checkbox" data-rcp-list="archived" ${archived ? "checked" : ""}> Archivierte anzeigen</label>
      <div class="row"><button class="btn" data-act="rcp-new" data-arg="meal">Neue Vorlage</button><button class="btn primary" data-act="rcp-new" data-arg="recipe">Neues Rezept</button></div>
    </section>
    ${notice ? `<p class="${notice.tone === "error" ? "warn" : "ok"} small" role="status">${esc(notice.text)}</p>` : ""}
    ${
      shown.length
        ? shown.map(recipeCard).join("")
        : `<section class="card"><h3>Noch keine Vorlagen oder Rezepte</h3><p class="muted small">Lege eine Vorlage oder ein Rezept an – oder speichere im Tagebuch eine gegessene Mahlzeit als Gericht.</p></section>`
    }
  </main>`;
}

// ------------------------------------------------------------------ Bearbeiten

function itemRowsHtml(ed, foods) {
  const e = ed.errors ?? {};
  if (!ed.draft.items.length) return `<p class="muted small">Noch keine Zutaten. Unten suchen und antippen.</p>`;
  return ed.draft.items
    .map((it, i) => {
      const f = foods.get(it.foodId);
      const portion = f?.portion_amount ? `<option value="portion" ${it.unit === "portion" ? "selected" : ""}>${esc(f.portion_name)} (${F(f.portion_amount, 1)} ${esc(f.basis_unit)})</option>` : "";
      const err = e[`items.${i}.amount`] || e[`items.${i}.foodId`];
      return `<div class="dish-item"><b>${esc(f ? N.foodLabel(f) : "Unbekanntes Lebensmittel")}</b>
        <div class="row"><input type="text" inputmode="decimal" data-rcp-item="${i}" value="${esc(it.amount)}" aria-label="Menge" ${err ? 'aria-invalid="true"' : ""}>
        <select data-rcp-unit="${i}" aria-label="Einheit"><option value="base" ${it.unit !== "portion" ? "selected" : ""}>${esc(f?.basis_unit ?? "g")}</option>${portion}</select>
        <button class="btn sm ghost" data-act="rcp-item-remove" data-arg="${i}" aria-label="Zutat entfernen">✕</button></div>${err ? `<p class="err small">${esc(err)}</p>` : ""}</div>`;
    })
    .join("");
}

function supRowsHtml(ed, supplements) {
  const e = ed.errors ?? {};
  if (!ed.draft.supplements.length) return "";
  return ed.draft.supplements
    .map((x, i) => {
      const s = supplements.get(x.supplementId);
      const err = e[`supplements.${i}.amount`] || e[`supplements.${i}.supplementId`];
      return `<div class="dish-item"><b>${esc(s?.name ?? "Unbekanntes Supplement")}</b>
        <div class="row"><input type="text" inputmode="decimal" data-rcp-sup="${i}" value="${esc(x.amount)}" aria-label="Menge ${esc(s?.name ?? "")} in ${esc(s?.unit ?? "")}" ${err ? 'aria-invalid="true"' : ""}><span class="unit">${esc(s?.unit ?? "")}</span>
        <button class="btn sm ghost" data-act="rcp-sup-remove" data-arg="${i}" aria-label="Supplement entfernen">✕</button></div>${err ? `<p class="err small">${esc(err)}</p>` : ""}</div>`;
    })
    .join("");
}

function foodHits(query) {
  const q = String(query ?? "");
  if (!q.trim()) return `<p class="muted small">Name, Marke oder Strichcode eingeben.</p>`;
  const list = N.searchFoods(X.S.catalog, X.S.food.local, q, 30);
  if (!list.length) return `<p class="empty">Nichts gefunden. Neue Lebensmittel legst du im Scanner oder unter Datenbanken an.</p>`;
  return list
    .map(
      (f) => `<button class="item" data-act="rcp-add-food" data-arg="${esc(f.id)}"><span class="main"><b>${esc(N.foodLabel(f))}</b>
      <span class="muted small">${F(f.energy_kcal, 0)} kcal · E ${F(f.protein_g, 1)} g je 100 ${esc(f.basis_unit)}${f.portion_amount ? ` · ${esc(f.portion_name)} ${F(f.portion_amount, 1)} ${esc(f.basis_unit)}` : ""}</span></span><span class="chev">+</span></button>`,
    )
    .join("");
}

function supHits(db, query) {
  const q = String(query ?? "");
  if (!q.trim()) return "";
  const list = SP.searchSupplements(db, q, 30);
  if (!list.length) return `<p class="empty">Kein Supplement gefunden. Supplemente legst du unter Datenbanken → Supplementdatenbank an.</p>`;
  return list
    .map(
      (s) => `<button class="item" data-act="rcp-add-sup" data-arg="${esc(s.id)}"><span class="main"><b>${esc(s.name)}</b>
      <span class="muted small">${esc([s.manufacturer, s.unit].filter(Boolean).join(" · "))}</span></span><span class="chev">+</span></button>`,
    )
    .join("");
}

function totalHtml(ed, foods) {
  const d = ed.draft;
  if (!d.items.length) return "";
  const t = RC.draftTotal(d, foods);
  const n = d.kind === "recipe" ? RC.parseNum(d.servings) : 1;
  const each = n > 0 ? { energyKcal: t.energyKcal / n, proteinG: t.proteinG / n, carbsG: t.carbsG / n, fatG: t.fatG / n } : null;
  return `Gesamt: <b>${kcal(t.energyKcal)}</b> · Protein ${grams(t.proteinG)} · KH ${grams(t.carbsG)} · Fett ${grams(t.fatG)}${
    d.kind === "recipe" && each ? `<br>Je Portion (${esc(d.servings)} Portionen): <b>${kcal(each.energyKcal)}</b> · Protein ${grams(each.proteinG)} · KH ${grams(each.carbsG)} · Fett ${grams(each.fatG)}` : ""
  }`;
}

/** Vorlage bzw. Rezept anlegen oder bearbeiten. */
export function viewRecipeEdit() {
  const S = X.S;
  const ed = S.recipeEdit;
  if (!ed) {
    S.view = "recipes";
    return viewRecipes();
  }
  const db = buildDb();
  const { foods, supplements } = lookups(db);
  const d = ed.draft;
  const e = ed.errors ?? {};
  const err = (k) => (e[k] ? `<p class="err small">${esc(e[k])}</p>` : "");
  const title = d.id ? "Bearbeiten" : d.kind === "meal" ? "Neue Vorlage" : "Neues Rezept";
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("recipe-edit")}
    <section class="card" id="rcp-editor">
      <h3>${esc(title)}</h3>
      <div class="nf-grid">
        <div class="field wide"><label for="rcp-name">Name</label><input id="rcp-name" type="text" maxlength="80" data-rcp="name" value="${esc(d.name)}" placeholder="z. B. Porridge mit Beeren" autocomplete="off" ${e.name ? 'aria-invalid="true"' : ""}>${err("name")}</div>
        <div class="field wide"><label for="rcp-kind">Art</label><select id="rcp-kind" data-rcp="kind">${RC.KIND_OPTIONS.map((o) => `<option value="${o.value}" ${o.value === d.kind ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>${err("kind")}</div>
        ${
          d.kind === "recipe"
            ? `<div class="field"><label for="rcp-servings">Ergibt Portionen</label><input id="rcp-servings" type="text" inputmode="decimal" data-rcp="servings" value="${esc(d.servings)}" ${e.servings ? 'aria-invalid="true"' : ""}><p class="muted small">Mengen unten gelten für das ganze Rezept.</p>${err("servings")}</div>`
            : ""
        }
      </div>
      <label class="goal-check"><input type="checkbox" data-rcp="archived" ${d.archived ? "checked" : ""}> Archiviert</label>
      <p class="muted small">Archivierte erscheinen nicht mehr in der Auswahl beim Erfassen.</p>
    </section>
    <section class="card">
      <h3>Zutaten</h3>
      ${err("items")}
      <div id="rcp-items">${itemRowsHtml(ed, foods)}</div>
      <p class="small" id="rcp-total">${totalHtml(ed, foods)}</p>
      <div class="field"><label for="rcp-q">Zutat hinzufügen</label><input id="rcp-q" type="search" placeholder="Name, Marke oder Strichcode" value="${esc(ed.query ?? "")}" autocomplete="off"></div>
      <div class="list" id="rcp-food-hits">${foodHits(ed.query)}</div>
    </section>
    <section class="card">
      <h3>Supplemente (optional)</h3>
      <p class="muted small">Kommen beim Eintragen anteilig als Einnahme zur Mahlzeit dazu. Mengen gelten wie die Zutaten für das ganze Gericht.</p>
      ${err("supplements")}
      <div id="rcp-sups">${supRowsHtml(ed, supplements)}</div>
      <div class="field"><label for="rcp-sq">Supplement hinzufügen</label><input id="rcp-sq" type="search" placeholder="Supplement suchen, z. B. Vitamin D3 …" value="${esc(ed.supQuery ?? "")}" autocomplete="off"></div>
      <div class="list" id="rcp-sup-hits">${supHits(db, ed.supQuery)}</div>
    </section>
    <section class="card">
      <div class="field"><label for="rcp-notes">Notizen / Zubereitung (optional)</label><textarea id="rcp-notes" rows="3" maxlength="2000" data-rcp="notes">${esc(d.notes)}</textarea>${err("notes")}</div>
      ${ed.message ? `<p class="warn small" role="alert">${esc(ed.message)}</p>` : ""}
      <div class="row"><button class="btn primary" data-act="rcp-save">Speichern</button><button class="btn ghost" data-act="rcp-cancel">Abbrechen</button></div>
      ${d.id ? `<button class="btn ghost danger block" data-act="rcp-delete" data-arg="${esc(d.id)}">Löschen</button>` : ""}
    </section>
  </main>`;
}

function refreshTotal() {
  const ed = X.S.recipeEdit;
  const el = document.getElementById("rcp-total");
  if (!ed || !el) return;
  const { foods } = lookups(buildDb());
  el.innerHTML = totalHtml(ed, foods);
}

// ------------------------------------------------------------------ Aktionen

function openEditor(draft) {
  X.S.recipeEdit = { draft, errors: {}, message: null, query: "", supQuery: "" };
  X.S.recipeNotice = null;
  X.go("recipe-edit");
}

async function saveEditor() {
  const S = X.S;
  const ed = S.recipeEdit;
  if (!ed) return;
  const { list, foods, supplements } = models();
  const checked = RC.checkDraft(ed.draft, { foods, supplements, names: list.map((r) => ({ id: r.id, name: r.name, kind: r.kind })) });
  if (!checked.ok) {
    ed.errors = checked.errors;
    ed.message = "Bitte die markierten Felder prüfen.";
    X.rerender();
    return;
  }
  const current = ed.draft.id ? list.find((r) => r.id === ed.draft.id) ?? null : null;
  const onPc = Boolean(ed.draft.id && (S.catalog?.pc?.recipe ?? []).some((x) => x.id === ed.draft.id));
  const row = RC.saveRecipe(S.food.local, checked.value, current, { uuid: () => X.uuid(), now: new Date(), onPc });
  await persistFood();
  S.recipeEdit = null;
  S.recipeNotice = { tone: "ok", text: `${row.kind === "meal" ? "Vorlage" : "Rezept"} „${row.name}“ gespeichert – geht mit „An den PC senden“ an den PC.` };
  X.go("recipes");
}

async function removeRecipe(id) {
  const S = X.S;
  const db = buildDb();
  const r = (db.pc.recipe ?? []).find((x) => x.id === id);
  if (!r) return X.toast("Gericht nicht gefunden.", true);
  const onPc = (S.catalog?.pc?.recipe ?? []).some((x) => x.id === id);
  RC.deleteRecipe(S.food.local, id, { onPc, now: new Date() });
  // Einträge im Wochenplan mit diesem Gericht entfallen (am PC löscht sie die Datenbank mit)
  const plans = (db.pc.meal_plan_entry ?? []).filter((e) => e.recipe_id === id);
  if (plans.length && S.parity) {
    for (const e of plans) PR.deleteRow(S.parity, "meal_plan_entry", e.id);
    await X.store.set("parity", S.parity);
    refreshCatalog();
  }
  await persistFood();
  S.recipeEdit = null;
  S.recipeLog = null;
  S.recipeNotice = { tone: "ok", text: `„${r.name}“ gelöscht. Bereits eingetragene Mahlzeiten bleiben unverändert.` };
  X.go("recipes");
}

async function logRecipe(id) {
  const S = X.S;
  const l = S.recipeLog;
  const { list } = models();
  const r = list.find((x) => x.id === id);
  if (!r || !l) return;
  const errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date ?? "")) errors.date = "Bitte ein Datum wählen.";
  else if (l.date > today()) errors.date = "Das Datum liegt in der Zukunft.";
  let portion = null;
  try {
    portion = RC.portionItems(r, l.servings);
  } catch (e) {
    errors.servings = e.message;
  }
  if (Object.keys(errors).length) {
    l.errors = errors;
    return X.rerender();
  }
  const opts = { uuid: () => X.uuid(), now: new Date() };
  try {
    let mealId = null;
    if (portion.items.length) {
      const meal = N.addToMeal(S.catalog, S.food.local, { date: l.date, mealType: l.mealType, items: portion.items }, opts);
      mealId = meal.row.id;
    } else {
      mealId = N.ensureMeal(S.catalog, S.food.local, l.date, l.mealType, opts);
    }
    await persistFood();
    // Supplemente des Gerichts als Einnahme zur Mahlzeit (wie PC 1.0.200)
    let withSupps = false;
    if (portion.supplements.length && mealId) {
      const draft = { ...SP.emptyDraft(l.date, `meal:${mealId}`, ""), items: portion.supplements.map((x) => ({ id: null, supplementId: x.supplementId, amount: x.amount })) };
      SP.saveIntake(buildDb(), S.supp, draft, { ...opts, timingLabel: N.mealLabel(l.mealType), ensureMeal: (d, t) => N.ensureMeal(S.catalog, S.food.local, d, t, opts) });
      await X.store.set("supp", S.supp);
      withSupps = true;
    }
    const n = portion.count;
    S.recipeLog = null;
    S.recipeNotice = {
      tone: "ok",
      text: `„${r.name}“ (${F(n, Number.isInteger(n) ? 0 : 1)} ${n === 1 ? "Portion" : "Portionen"}) am ${D.formatDate ? D.formatDate(l.date) : l.date} eingetragen: ${kcal(RC.perServing(r).energyKcal * n)}${withSupps ? " – mit Supplementen" : ""}.`,
    };
    X.rerender();
  } catch (e) {
    l.errors = { servings: e.message };
    X.rerender();
  }
}

export const recipeActions = {
  "rcp-new": (el) => openEditor(RC.emptyDraft(el.dataset.arg === "recipe" ? "recipe" : "meal")),
  "rcp-edit": (el) => {
    const r = models().list.find((x) => x.id === el.dataset.arg);
    if (!r) return X.toast("Gericht nicht gefunden.", true);
    openEditor(RC.draftFromModel(r));
  },
  "rcp-cancel": () => {
    X.S.recipeEdit = null;
    X.go("recipes");
  },
  "rcp-save": () => saveEditor(),
  "rcp-delete": (el) => {
    const r = models().list.find((x) => x.id === el.dataset.arg);
    if (!X.confirmTwice(el, `Nochmal tippen: „${r?.name ?? "Gericht"}“ löschen`)) return;
    return removeRecipe(el.dataset.arg);
  },
  "rcp-add-food": (el) => {
    const ed = X.S.recipeEdit;
    const f = N.allFoods(X.S.catalog, X.S.food.local).get(el.dataset.arg);
    if (!ed || !f) return;
    const portion = Boolean(f.portion_amount);
    ed.draft.items.push({ ...RC.draftItem(f.id, portion ? "1" : "100"), unit: portion ? "portion" : "base" });
    ed.query = "";
    X.rerender();
    requestAnimationFrame(() => document.getElementById("rcp-q")?.focus());
  },
  "rcp-item-remove": (el) => {
    const ed = X.S.recipeEdit;
    if (!ed) return;
    ed.draft.items.splice(Number(el.dataset.arg), 1);
    ed.errors = {};
    X.rerender();
  },
  "rcp-add-sup": (el) => {
    const ed = X.S.recipeEdit;
    const s = buildDb().supplements?.get(el.dataset.arg);
    if (!ed || !s) return;
    const start = SP.startAmount(s);
    ed.draft.supplements.push(RC.draftSupplement(s.id, String(start).replace(".", ",")));
    ed.supQuery = "";
    X.rerender();
  },
  "rcp-sup-remove": (el) => {
    const ed = X.S.recipeEdit;
    if (!ed) return;
    ed.draft.supplements.splice(Number(el.dataset.arg), 1);
    ed.errors = {};
    X.rerender();
  },
  "rcp-log": (el) => {
    X.S.recipeLog = { id: el.dataset.arg, date: today(), mealType: N.suggestMealType(new Date().getHours()), servings: "1", errors: {} };
    X.S.recipeNotice = null;
    X.rerender();
    requestAnimationFrame(() => document.getElementById("rcp-log")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  },
  "rcp-log-cancel": () => {
    X.S.recipeLog = null;
    X.rerender();
  },
  "rcp-log-save": (el) => logRecipe(el.dataset.arg),
};

/** Eingaben (input-Ereignis). Rückgabe true = behandelt. */
export function recipeInput(el) {
  const S = X.S;
  if (el.dataset?.rcplog && S.recipeLog) {
    S.recipeLog[el.dataset.rcplog] = el.value;
    return true;
  }
  const ed = S.recipeEdit;
  if (!ed) return false;
  if (el.id === "rcp-q") {
    ed.query = el.value;
    const box = document.getElementById("rcp-food-hits");
    if (box) box.innerHTML = foodHits(ed.query);
    return true;
  }
  if (el.id === "rcp-sq") {
    ed.supQuery = el.value;
    const box = document.getElementById("rcp-sup-hits");
    if (box) box.innerHTML = supHits(buildDb(), ed.supQuery);
    return true;
  }
  const f = el.dataset?.rcp;
  if (f === "name" || f === "servings" || f === "notes") {
    ed.draft[f] = el.value;
    if (f === "servings") refreshTotal();
    return true;
  }
  if (el.dataset?.rcpItem !== undefined) {
    const it = ed.draft.items[Number(el.dataset.rcpItem)];
    if (it) it.amount = el.value;
    refreshTotal();
    return true;
  }
  if (el.dataset?.rcpSup !== undefined) {
    const it = ed.draft.supplements[Number(el.dataset.rcpSup)];
    if (it) it.amount = el.value;
    return true;
  }
  return false;
}

/** Auswahlfelder (change-Ereignis). Rückgabe true = behandelt. */
export function recipeChange(el) {
  const S = X.S;
  if (el.dataset?.rcpList === "archived") {
    S.recipesArchived = el.checked;
    X.rerender();
    return true;
  }
  if (el.dataset?.rcplog && S.recipeLog) {
    S.recipeLog[el.dataset.rcplog] = el.value;
    return true;
  }
  const ed = S.recipeEdit;
  if (!ed) return false;
  if (el.dataset?.rcp === "kind") {
    ed.draft = RC.setKind(ed.draft, el.value);
    X.rerender();
    return true;
  }
  if (el.dataset?.rcp === "archived") {
    ed.draft.archived = el.checked;
    return true;
  }
  if (el.dataset?.rcpUnit !== undefined) {
    const it = ed.draft.items[Number(el.dataset.rcpUnit)];
    if (it) it.unit = el.value === "portion" ? "portion" : "base";
    refreshTotal();
    return true;
  }
  return false;
}
