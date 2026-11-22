// LIFESPAN OS Mobil – Nutrition → Planen wie am PC (`MealPlanTab.tsx`, 1.92.0, Paket E):
// Wochenplan mit Blättern, Gerichte einplanen und entfernen, geplante Nährwerte je Tag, Woche auf
// die nächste kopieren, Einkaufsliste (Zwischenablage, als To-dos). Rechnung aus pcdomain.js
// (`mealPlan`); Planeinträge liegen in paritydata.js (Tabelle `meal_plan_entry`) und gehen mit
// „An den PC senden“ zurück. Eingeplant werden Vorlagen und Rezepte vom PC.

import * as D from "./pcdomain.js";
import * as P from "./pcdb.js";
import * as N from "./nutrition.js";
import * as PR from "./paritydata.js";
import * as TD from "./todosdata.js";
import { X, buildDb, today, nutritionTabs } from "./diary.js";
import { refreshCatalog } from "./appbase.js";

const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);
const T = () => D.trends;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const num = (t) => {
  const s = String(t ?? "").trim().replace(",", ".");
  const n = Number(s);
  return s === "" || !Number.isFinite(n) ? null : n;
};

function foodsMap() {
  const S = X.S;
  if (S.food?.local) return N.allFoods(S.catalog, S.food.local);
  return new Map((S.catalog?.nutrition?.foods ?? []).map((f) => [f.id, f]));
}

/** Rezepte vom PC als Modell wie `Recipe` am PC (Summen aus den Zutaten je 100 g/ml). */
export function recipeModels(db, foods = foodsMap()) {
  const itemsBy = new Map();
  for (const it of db.pc.recipe_item ?? []) itemsBy.set(it.recipe_id, [...(itemsBy.get(it.recipe_id) ?? []), it]);
  return (db.pc.recipe ?? []).map((r) => {
    const items = (itemsBy.get(r.id) ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((it) => {
        const f = foods.get(it.food_id);
        const k = Number(it.amount) / 100;
        return {
          id: it.id,
          foodId: it.food_id,
          foodName: f?.name ?? "Lebensmittel",
          foodBrand: f?.brand ?? null,
          basisUnit: f?.basis_unit ?? "g",
          amount: Number(it.amount),
          energyKcal: (f?.energy_kcal ?? 0) * k,
          proteinG: (f?.protein_g ?? 0) * k,
          carbsG: (f?.carbs_g ?? 0) * k,
          fatG: (f?.fat_g ?? 0) * k,
        };
      });
    const sum = (key) => items.reduce((s, i) => s + i[key], 0);
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      servings: Number(r.servings) || 1,
      archived: Boolean(r.archived),
      items,
      energyKcal: sum("energyKcal"),
      proteinG: sum("proteinG"),
      carbsG: sum("carbsG"),
      fatG: sum("fatG"),
    };
  });
}

const toEntry = (e) => ({ id: e.id, date: e.date, slot: e.slot, recipeId: e.recipe_id, servings: Number(e.servings), notes: e.notes ?? null, createdAt: e.created_at, updatedAt: e.updated_at });

function foodModels(foods) {
  const out = new Map();
  for (const [id, f] of foods) out.set(id, { portionAmount: f.portion_amount ?? null, portionName: f.portion_name ?? null });
  return out;
}

/** Nutrition → Planen. */
export function viewMealPlan() {
  const S = X.S;
  const db = buildDb();
  const t = today();
  const monday = S.mpWeek ?? T().weekStart(t);
  const days = Array.from({ length: 7 }, (_, i) => T().shiftDays(monday, i));
  const foods = foodsMap();
  const recipes = recipeModels(db, foods);
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const all = (db.pc.meal_plan_entry ?? []).map(toEntry);
  const week = all.filter((e) => e.date >= days[0] && e.date <= days[6]);
  const M = D.mealPlan;
  const planned = M.plannedDays(days, week, recipeMap);
  const shopping = M.shoppingList(week, recipeMap, foodModels(foods));
  const choices = recipes.filter((r) => !r.archived).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const goalKcal = P.goalFor(db, t)?.energyKcal ?? null;
  const adding = S.mpAdd ?? null;
  const err = S.mpErr ?? null;
  const fe = (k) => (err?.[k] ? `<p class="field-error">${esc(err[k])}</p>` : "");

  const dayHtml = (d, i) => {
    const entries = d.entries
      .map((e) => {
        const r = recipeMap.get(e.recipeId);
        return `<li class="mp-entry"><span><span class="muted small">${esc(e.slot)}</span> ${esc(r?.name ?? "(gelöscht)")}<span class="muted small"> · ${esc(F(e.servings, e.servings % 1 === 0 ? 0 : 1))} ${e.servings === 1 ? "Portion" : "Portionen"}${r ? ` · ${esc(F(r.energyKcal * M.share(e, r)))} kcal` : ""}</span></span><button class="btn sm ghost danger" data-act="mp-del" data-arg="${esc(e.id)}" aria-label="${esc(`${r?.name ?? "Eintrag"} entfernen`)}">✕</button></li>`;
      })
      .join("");
    const form =
      adding?.date === d.date
        ? `<div class="mp-add">
            <div class="field"><label for="mp-recipe">Gericht</label><select id="mp-recipe" data-mp="recipeId"><option value="">Bitte wählen …</option>${choices
              .map((r) => `<option value="${esc(r.id)}" ${r.id === adding.recipeId ? "selected" : ""}>${esc(`${r.name} (${F(r.energyKcal / r.servings)} kcal je Portion)`)}</option>`)
              .join("")}</select>${fe("recipeId")}</div>
            <div class="grid2"><div class="field"><label for="mp-slot">Mahlzeit</label><input id="mp-slot" data-mp="slot" list="mp-slots" maxlength="40" value="${esc(adding.slot)}">${fe("slot")}</div>
            <div class="field"><label for="mp-servings">Portionen</label><input id="mp-servings" data-mp="servings" inputmode="decimal" value="${esc(adding.servings)}">${fe("servings")}</div></div>
            <div class="row-actions"><button class="btn primary" data-act="mp-save">Einplanen</button><button class="btn" data-act="mp-cancel">Abbrechen</button></div>
          </div>`
        : `<button class="linkbtn small" data-act="mp-add" data-arg="${esc(d.date)}" ${choices.length ? "" : "disabled"}>+ Gericht einplanen</button>`;
    return `<li class="mp-day${d.date === t ? " is-today" : ""}"><div class="mp-day__head"><strong>${WEEKDAYS[i]} ${esc(D.formatDate(d.date))}</strong><span class="muted small tnum">${esc(F(d.energyKcal))} kcal${goalKcal ? ` von ${esc(F(goalKcal))}` : ""} · P ${esc(F(d.proteinG))} g · KH ${esc(F(d.carbsG))} g · F ${esc(F(d.fatG))} g</span></div>
      ${entries ? `<ul class="plain-list">${entries}</ul>` : ""}${form}</li>`;
  };

  const shoppingHtml = shopping.length
    ? `<table class="data-table mp-shop"><thead><tr><th scope="col">Zutat</th><th scope="col" class="num">Menge</th></tr></thead><tbody>${shopping
        .map((s) => `<tr><td>${esc(s.name)}${s.brand ? `<span class="sub">${esc(s.brand)}</span>` : ""}<span class="sub">${esc(s.usedIn.join(", "))}</span></td><td class="num">${esc(F(s.amount))} ${esc(s.unit)}${s.portions ? `<span class="sub">${esc(s.portions)}</span>` : ""}</td></tr>`)
        .join("")}</tbody></table>
      <div class="row-actions"><button class="btn" data-act="mp-copy-list">In die Zwischenablage</button><button class="btn" data-act="mp-todos">Als To-dos anlegen</button></div>`
    : `<p class="muted">Für diese Woche ist noch nichts geplant.</p>`;

  return `${X.header("Nutrition")}<main class="wrap">${nutritionTabs("meal-plan")}
    <section class="card">
      <div class="wo-head"><h3>Wochenplan</h3></div>
      <div class="mp-week"><button class="btn sm" data-act="mp-week" data-arg="-7" aria-label="Vorige Woche">‹</button><span class="small">${esc(T().formatRange(days[0], days[6]))}</span><button class="btn sm" data-act="mp-week" data-arg="7" aria-label="Nächste Woche">›</button></div>
      ${
        choices.length
          ? `<ol class="plain-list mp-days">${planned.map(dayHtml).join("")}</ol>`
          : `<p class="muted">Für den Wochenplan braucht es mindestens eine Vorlage oder ein Rezept vom PC – daraus entstehen die geplanten Nährwerte und die Einkaufsliste.</p>`
      }
      <datalist id="mp-slots">${D.PLAN_SLOTS.map((s) => `<option value="${esc(s)}"></option>`).join("")}</datalist>
      ${week.length ? `<button class="btn block" data-act="mp-copy-week">Auf nächste Woche kopieren</button>` : ""}
      <p class="card__note">Eingeplant werden Vorlagen und Rezepte vom PC. Neue und entfernte Einträge gehen mit „An den PC senden“ an den PC.</p>
    </section>
    <section class="card"><div class="wo-head"><h3>Einkaufsliste</h3><span class="tag">${shopping.length} ${shopping.length === 1 ? "Zutat" : "Zutaten"}</span></div>${shoppingHtml}</section>
  </main>`;
}

async function saveParity() {
  await X.store.set("parity", X.S.parity);
  refreshCatalog();
}

function weekData() {
  const S = X.S;
  const db = buildDb();
  const monday = S.mpWeek ?? T().weekStart(today());
  const days = Array.from({ length: 7 }, (_, i) => T().shiftDays(monday, i));
  const foods = foodsMap();
  const recipeMap = new Map(recipeModels(db, foods).map((r) => [r.id, r]));
  const week = (db.pc.meal_plan_entry ?? []).filter((e) => e.date >= days[0] && e.date <= days[6]);
  return { db, monday, days, week, shopping: D.mealPlan.shoppingList(week.map(toEntry), recipeMap, foodModels(foods)) };
}

/** Prüfregeln wie Migration 0064 und das Formular am PC. */
export function validatePlanEntry(d) {
  const e = {};
  if (!d.recipeId) e.recipeId = "Bitte ein Gericht wählen.";
  const slot = String(d.slot ?? "").trim();
  if (slot.length < 1 || slot.length > 40) e.slot = "Bitte die Mahlzeit angeben (bis 40 Zeichen).";
  const servings = num(d.servings);
  if (servings === null) e.servings = "Bitte eine Zahl eingeben.";
  else if (servings <= 0 || servings > 50) e.servings = "Bitte mehr als 0 und höchstens 50 Portionen.";
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, slot, servings };
}

export const planParityActions = {
  "mp-week": (el) => {
    const S = X.S;
    S.mpWeek = T().shiftDays(S.mpWeek ?? T().weekStart(today()), Number(el.dataset.arg));
    S.mpAdd = null;
    X.rerender();
  },
  "mp-add": (el) => {
    const S = X.S;
    const count = (buildDb().pc.meal_plan_entry ?? []).filter((e) => e.date === el.dataset.arg).length;
    S.mpAdd = { date: el.dataset.arg, slot: D.PLAN_SLOTS[Math.min(count, D.PLAN_SLOTS.length - 1)] ?? "", recipeId: "", servings: "1" };
    S.mpErr = null;
    X.rerender();
  },
  "mp-cancel": () => {
    X.S.mpAdd = null;
    X.S.mpErr = null;
    X.rerender();
  },
  "mp-save": async () => {
    const S = X.S;
    const d = { ...S.mpAdd };
    for (const el of document.querySelectorAll("[data-mp]")) d[el.dataset.mp] = el.value;
    const r = validatePlanEntry(d);
    if (!r.ok) {
      S.mpAdd = d;
      S.mpErr = r.errors;
      return X.rerender();
    }
    S.parity = PR.normParity(S.parity);
    PR.putRow(S.parity, "meal_plan_entry", { id: X.uuid(), date: d.date, slot: r.slot, recipe_id: d.recipeId, servings: r.servings, notes: null });
    await saveParity();
    S.mpAdd = null;
    S.mpErr = null;
    X.toast("Eingeplant");
    X.rerender();
  },
  "mp-del": async (el) => {
    const S = X.S;
    S.parity = PR.normParity(S.parity);
    PR.deleteRow(S.parity, "meal_plan_entry", el.dataset.arg);
    await saveParity();
    X.toast("Entfernt");
    X.rerender();
  },
  "mp-copy-week": async (el) => {
    const S = X.S;
    const { week, monday } = weekData();
    if (!week.length) return;
    if (!X.confirmTwice(el, `Nochmal tippen: ${week.length} ${week.length === 1 ? "Eintrag" : "Einträge"} kopieren`)) return;
    S.parity = PR.normParity(S.parity);
    for (const e of week) PR.putRow(S.parity, "meal_plan_entry", { id: X.uuid(), date: T().shiftDays(e.date, 7), slot: e.slot, recipe_id: e.recipe_id, servings: Number(e.servings), notes: e.notes ?? null });
    await saveParity();
    S.mpWeek = T().shiftDays(monday, 7);
    X.toast(`Woche auf ${D.formatDate(T().shiftDays(monday, 7))} – ${D.formatDate(T().shiftDays(monday, 13))} kopiert`);
    X.rerender();
  },
  "mp-copy-list": async () => {
    const text = weekData().shopping.map(D.mealPlan.shoppingLine).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      X.toast("Einkaufsliste in die Zwischenablage kopiert");
    } catch {
      X.toast("Kopieren war nicht möglich.", true);
    }
  },
  "mp-todos": async (el) => {
    const S = X.S;
    const { shopping, monday } = weekData();
    if (!shopping.length) return;
    if (!X.confirmTwice(el, `Nochmal tippen: ${shopping.length} To-dos anlegen`)) return;
    const date = monday < today() ? today() : monday;
    try {
      for (const s of shopping) TD.addTodo(S.catalog, S.todos, date, `Einkauf: ${D.mealPlan.shoppingLine(s)}`, { uuid: X.uuid });
    } catch (e) {
      return X.toast(e.message || "Die To-dos konnten nicht angelegt werden.", true);
    }
    await X.store.set("todos", S.todos);
    X.toast(`${shopping.length} To-dos am ${D.formatDate(date)} angelegt (Checklisten)`);
  },
};
