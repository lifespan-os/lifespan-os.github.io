// LIFESPAN OS Mobil – Mahlzeiten schneller eintragen (1.55.0): Daten für die Regeln aus
// `pcdomain.js` (src/domain/mealQuick.ts) und Eintragen mit „Rückgängig“. Ohne Oberfläche.

import * as N from "./nutrition.js";
import * as D from "./pcdomain.js";

export const Q = D.mealQuick;

/** Gegessene Mahlzeiten (PC und Handy) als `PastMeal`: Tag, Platz-Schlüssel, Lebensmittel. */
export function pastMeals(db) {
  const out = [];
  for (const row of db.meals) {
    const items = (db.itemsByMeal.get(row.id) ?? []).filter((it) => it.amount > 0).map((it) => ({ foodId: it.food_id, amount: it.amount }));
    if (items.length) out.push({ date: row.date, key: N.mealKeyOf(row), items });
  }
  return out;
}

/** Lebensmittel-Zeile → `QuickFood`. */
export const quickFood = (f) => ({
  id: f.id,
  name: f.name,
  brand: f.brand || null,
  basisUnit: f.basis_unit === "ml" ? "ml" : "g",
  portionName: f.portion_name ?? null,
  portionAmount: f.portion_amount ?? null,
});

/** Wie oft jedes Lebensmittel eingetragen wurde (für die Reihenfolge der Treffer). */
export function usageRank(history) {
  const m = new Map();
  for (const meal of history) for (const i of meal.items) m.set(i.foodId, (m.get(i.foodId) ?? 0) + 1);
  return m;
}

/** Nur Lebensmittel, die es (nicht archiviert) gibt. */
export function onlyKnown(items, foods) {
  return items.filter((i) => foods.has(i.foodId));
}

/** Energie einer Liste von Einträgen (kcal). */
export function itemsKcal(items, foods) {
  return items.reduce((s, i) => {
    const f = foods.get(i.foodId);
    return s + (f ? (f.energy_kcal * i.amount) / 100 : 0);
  }, 0);
}

/** Kurzname einer Zusammenstellung: „Haferflocken + Milch“ (höchstens drei Namen). */
export function itemsName(items, foods) {
  const names = items.map((i) => foods.get(i.foodId)?.name ?? "?");
  return names.length > 3 ? `${names.slice(0, 3).join(" + ")} + ${names.length - 3} weitere` : names.join(" + ");
}

/**
 * Einträge in eine Mahlzeit schreiben und die neuen Einträge zurückgeben (für „Rückgängig“).
 * Ohne Uhrzeit der Mahlzeit: heute die aktuelle Uhrzeit, an anderen Tagen keine.
 */
export function addItems(catalog, local, { date, mealKey, items, today, now = new Date(), uuid }) {
  const known = N.mealTimeFor(catalog, local, date, mealKey);
  const pad = (n) => String(n).padStart(2, "0");
  const time = known ? null : date === today ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "";
  const meal = N.addToMeal(catalog, local, { date, mealType: mealKey, items, time }, { uuid, now });
  const added = meal.items.slice(meal.items.length - items.length).map((i) => i.id);
  return { mealId: meal.row.id, added };
}

/** „Rückgängig“: die eben eingetragenen Einträge wieder entfernen. */
export function undoItems(local, mealId, ids) {
  for (const id of ids) N.removeItem(local, mealId, id);
}
