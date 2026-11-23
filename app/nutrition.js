// LIFESPAN OS Mobil – Ernährung: Lebensmittel scannen, tracken, Gerichte. Reine Logik.
// Zeilen haben genau die Spalten der Desktop-Datenbank (Tabellen food, meal, meal_item, recipe,
// recipe_item, settings), Prüfregeln wie die CHECK-Regeln der Migrationen.

import { LABEL_KEYS, extrasNote, guessName, validBarcode } from "./label.js";
import { appDay } from "./appday.js";

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Spalte je Formularwert */
export const COLUMN = {
  energyKcal: "energy_kcal",
  fatG: "fat_g",
  saturatedFatG: "saturated_fat_g",
  carbsG: "carbs_g",
  sugarG: "sugar_g",
  fiberG: "fiber_g",
  proteinG: "protein_g",
  saltG: "salt_g",
};

export const MEAL_TYPES = [
  { value: "breakfast", label: "Frühstück" },
  { value: "lunch", label: "Mittagessen" },
  { value: "snack", label: "Snack" },
  { value: "dinner", label: "Abendessen" },
  { value: "other", label: "Sonstiges" },
];

// Mahlzeitenliste wie am PC (Settings → Mahlzeiten, 1.47.0): eigene Namen der Standardmahlzeiten,
// abgewählte Standardmahlzeiten und eigene Mahlzeiten. Eine eigene Mahlzeit hat den Schlüssel
// „x:<Name>“ (Mahlzeit `other` mit diesem Namen).
let mealConfig = { names: {}, hidden: [], extras: [], extraHidden: [], workout: [] };

// Workout-Mahlzeiten (1.107.0, wie PC 1.0.181): stehen immer zur Wahl; `meal_workout` nennt die,
// die jeden Tag als Platz erscheinen. Eigene Mahlzeiten in `meal_extra_hidden` stehen nur zur Wahl.
export const WORKOUT_MEALS = ["Pre-Workout", "Intra-Workout", "Post-Workout"];
const wnorm = (s) => String(s ?? "").toLowerCase().replace(/[\s_-]+/g, "");
/** Workout-Mahlzeit zu einem Namen („preworkout“ → „Pre-Workout“), sonst null. */
export const workoutMealName = (n) => WORKOUT_MEALS.find((w) => wnorm(w) === wnorm(n)) ?? null;

/** Aus den Einstellungen vom PC (`meal_name.*`, `meal_hidden`, `meal_extra`, `meal_extra_hidden`, `meal_workout`). */
export function setMealConfig(settings) {
  const list = (key) => {
    try {
      const v = JSON.parse(settings.get(key) ?? "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
    } catch {
      return [];
    }
  };
  const names = {};
  for (const t of ["breakfast", "lunch", "snack", "dinner"]) {
    const n = settings.get(`meal_name.${t}`);
    if (n) names[t] = n;
  }
  // ältere Listen: eigene Mahlzeit „Pre-Workout“ o. Ä. ist eine Workout-Mahlzeit (wie am PC)
  const shown = new Set(list("meal_workout").map(workoutMealName).filter(Boolean));
  const extras = [];
  for (const e of list("meal_extra")) {
    const w = workoutMealName(e);
    if (w) shown.add(w);
    else if (!extras.includes(e)) extras.push(e);
  }
  const extraHidden = list("meal_extra_hidden").filter((h) => extras.includes(h));
  mealConfig = { names, hidden: list("meal_hidden"), extras, extraHidden, workout: WORKOUT_MEALS.filter((w) => shown.has(w)) };
  return mealConfig;
}

export const getMealConfig = () => mealConfig;
const EXTRA = "x:";
export const extraKey = (name) => EXTRA + name;

/** Schlüssel → Mahlzeitart und Name (`null` = Standardmahlzeit ohne eigenen Namen). */
export function parseMealKey(key) {
  const k = String(key ?? "");
  if (k.startsWith(EXTRA) && k.length > EXTRA.length) return { type: "other", name: k.slice(EXTRA.length) };
  return { type: k, name: null };
}

/** Schlüssel einer gespeicherten Mahlzeit (eigene Mahlzeit der Liste → „x:<Name>“). */
export const mealKeyOf = (row) =>
  row.meal_type === "other" && row.name && (mealConfig.extras.includes(row.name) || WORKOUT_MEALS.includes(row.name)) ? extraKey(row.name) : row.meal_type;

export const mealLabel = (t) => {
  const { type, name } = parseMealKey(t);
  if (name) return name;
  return mealConfig.names[type] ?? MEAL_TYPES.find((m) => m.value === type)?.label ?? type;
};

/**
 * Auswahl der Mahlzeiten wie am PC: Standardmahlzeiten (ohne abgewählte), eigene Mahlzeiten der
 * Liste, „Sonstiges“. `current` bleibt immer wählbar.
 */
export function mealChoices(current) {
  const out = MEAL_TYPES.filter((m) => m.value !== "other" && (!mealConfig.hidden.includes(m.value) || m.value === current)).map((m) => m.value);
  for (const n of mealConfig.extras) out.push(extraKey(n));
  for (const n of WORKOUT_MEALS) out.push(extraKey(n));
  out.push("other");
  if (current && !out.includes(current)) out.push(current);
  return out.map((value) => ({ value, label: mealLabel(value) }));
}

const validKey = (key) => {
  const { type, name } = parseMealKey(key);
  return name !== null || MEAL_TYPES.some((m) => m.value === type);
};

/** Vorschlag nach Uhrzeit (wie die Desktop-App). */
export function suggestMealType(hour) {
  const t = hour < 10 ? "breakfast" : hour < 14 ? "lunch" : hour >= 17 && hour < 22 ? "dinner" : "snack";
  // Abgewählte Standardmahlzeit (Settings → Mahlzeiten): erste Mahlzeit der Liste
  return mealConfig.hidden.includes(t) ? mealChoices()[0].value : t;
}

export const BARCODE_PREFIX = "strichcode.";

// ------------------------------------------------------------------ Daten vom PC

/**
 * Ernährungsdaten aus den Tabellen einer Exportdatei: Lebensmittel (nicht archiviert),
 * Strichcodes, Mahlzeiten der letzten Tage (für das Anhängen an vorhandene Mahlzeiten) und
 * Rezeptnamen (eindeutige Namen).
 */
export function nutritionFromRows(rows, exportedAt = null) {
  const foods = rows("food").filter((f) => !f.archived);
  const barcodes = {};
  for (const s of rows("settings")) {
    if (typeof s.key === "string" && s.key.startsWith(BARCODE_PREFIX)) barcodes[s.key.slice(BARCODE_PREFIX.length)] = s.value;
  }
  const ref = exportedAt ? new Date(exportedAt) : new Date();
  const from = localDate(new Date(ref.getTime() - 3 * 86400000));
  const meals = rows("meal").filter((m) => m.date >= from);
  const recipeNames = rows("recipe").map((r) => String(r.name));
  return { foods, barcodes, meals, recipeNames };
}

export function emptyLocal() {
  return { foods: {}, barcodes: {}, meals: {}, recipes: {}, dish: emptyDish(), planned: {}, plannedDeleted: {} };
}

export function emptyDish() {
  return { name: "", servings: "1", items: [] };
}

/** Alle Lebensmittel: am Handy angelegte/geänderte ersetzen die vom PC. */
export function allFoods(catalog, local) {
  const map = new Map((catalog.nutrition?.foods ?? []).map((f) => [f.id, f]));
  for (const f of Object.values(local.foods)) map.set(f.row.id, f.row);
  return map;
}

export function foodByBarcode(catalog, local, code) {
  const id = local.barcodes[code]?.foodId ?? catalog.nutrition?.barcodes?.[code];
  return id ? (allFoods(catalog, local).get(id) ?? null) : null;
}

const norm = (s) => String(s ?? "").toLocaleLowerCase("de-DE").normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Suche nach Name, Marke oder Strichcode; zuletzt am Handy verwendete zuerst. */
export function searchFoods(catalog, local, query, limit = 30) {
  const q = norm(query).trim();
  const foods = [...allFoods(catalog, local).values()];
  if (/^\d{8,14}$/.test(q)) {
    const f = foodByBarcode(catalog, local, q);
    return f ? [f] : [];
  }
  if (!q) {
    const recent = new Set();
    for (const m of Object.values(local.meals).sort((a, b) => b.row.updated_at.localeCompare(a.row.updated_at))) {
      for (const it of m.items) recent.add(it.food_id);
    }
    const byId = allFoods(catalog, local);
    return [...recent].map((id) => byId.get(id)).filter(Boolean).slice(0, limit);
  }
  const words = q.split(/\s+/);
  return foods
    .map((f) => {
      const hay = norm(`${f.name} ${f.brand ?? ""}`);
      if (!words.every((w) => hay.includes(w))) return null;
      const name = norm(f.name);
      return { f, score: (name.startsWith(words[0]) ? 0 : 1) + (local.foods[f.id] ? -1 : 0) };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.f.name.localeCompare(b.f.name, "de"))
    .slice(0, limit)
    .map((x) => x.f);
}

export const foodLabel = (f) => (f.brand ? `${f.name} (${f.brand})` : f.name);

// ------------------------------------------------------------------ Formular

const num = (v, digits = 2) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return String(r).replace(".", ",");
};

export function parseNum(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (t === "") return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

export function emptyForm() {
  return {
    id: null,
    name: "",
    brand: "",
    basis: "g",
    values: Object.fromEntries(LABEL_KEYS.map((k) => [k, ""])),
    portionName: "",
    portionAmount: "",
    barcode: "",
    notes: "",
  };
}

/** Formular aus einem Scan vorbelegen. */
export function scanToForm(scan, text) {
  const basis = scan.basis ?? "g";
  const f = emptyForm();
  for (const k of LABEL_KEYS) f.values[k] = num(scan.values[k]);
  return {
    ...f,
    name: guessName(text),
    basis,
    portionName: scan.packageAmount !== null ? "Packung" : "",
    portionAmount: num(scan.packageAmount, 1),
    barcode: scan.barcode ?? "",
    notes: extrasNote(scan, basis),
  };
}

/** Formular eines gespeicherten Lebensmittels (Zeile der Datenbank). */
export function foodToForm(food, barcode = "") {
  const f = emptyForm();
  for (const k of LABEL_KEYS) f.values[k] = num(food[COLUMN[k]]);
  return {
    ...f,
    id: food.id,
    name: food.name,
    brand: food.brand ?? "",
    basis: food.basis_unit,
    portionName: food.portion_name ?? "",
    portionAmount: num(food.portion_amount, 1),
    barcode,
    notes: food.notes ?? "",
  };
}

/**
 * Formular prüfen (Regeln wie die Datenbank) → Werte für eine food-Zeile.
 * Rückgabe { ok, values, barcode } oder { ok: false, errors }.
 */
export function checkForm(f) {
  const errors = {};
  const name = f.name.trim();
  const brand = f.brand.trim();
  if (!name) errors.name = "Bitte einen Namen angeben.";
  else if (name.length > 100) errors.name = "Höchstens 100 Zeichen.";
  if (brand.length > 60) errors.brand = "Höchstens 60 Zeichen.";
  const v = {};
  for (const k of LABEL_KEYS) {
    const n = parseNum(f.values[k]);
    const required = ["energyKcal", "proteinG", "carbsG", "fatG"].includes(k);
    if (Number.isNaN(n)) errors[k] = "Bitte eine Zahl eingeben, z. B. 4,5.";
    else if (n === null && required) errors[k] = "Bitte angeben (0, wenn nicht enthalten).";
    else if (n !== null && k === "energyKcal" && n > 900) errors[k] = "Höchstens 900 kcal je 100.";
    else if (n !== null && k !== "energyKcal" && n > 100) errors[k] = "Höchstens 100 g je 100.";
    v[k] = Number.isNaN(n) ? null : n;
  }
  if (v.sugarG !== null && v.carbsG !== null && v.sugarG > v.carbsG) errors.sugarG = "Zucker kann nicht mehr sein als die Kohlenhydrate.";
  if (v.saturatedFatG !== null && v.fatG !== null && v.saturatedFatG > v.fatG) errors.saturatedFatG = "Kann nicht mehr sein als das Fett.";
  if (f.basis === "g" && (v.proteinG ?? 0) + (v.carbsG ?? 0) + (v.fatG ?? 0) > 100.5) {
    errors.proteinG = "Eiweiß, Kohlenhydrate und Fett zusammen höchstens 100 g je 100 g.";
  }
  const pName = f.portionName.trim();
  const pAmount = parseNum(f.portionAmount);
  if (Number.isNaN(pAmount) || (pAmount !== null && (pAmount <= 0 || pAmount > 5000))) {
    errors.portionAmount = "Bitte eine Menge zwischen 0 und 5000 angeben.";
  } else if (pAmount !== null && !pName) errors.portionName = "Bitte die Portion benennen, z. B. Packung.";
  else if (pAmount === null && pName) errors.portionAmount = "Bitte die Menge der Portion angeben.";
  if (pName.length > 40) errors.portionName = "Höchstens 40 Zeichen.";
  const notes = f.notes.trim();
  if (notes.length > 1000) errors.notes = "Höchstens 1000 Zeichen.";
  const code = f.barcode.replace(/[\s-]/g, "");
  if (code && !validBarcode(code)) errors.barcode = "Ungültiger Strichcode (8, 12, 13 oder 14 Ziffern mit Prüfziffer).";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    barcode: code || null,
    values: {
      name,
      brand,
      basis_unit: f.basis === "ml" ? "ml" : "g",
      energy_kcal: v.energyKcal,
      protein_g: v.proteinG,
      carbs_g: v.carbsG,
      fat_g: v.fatG,
      fiber_g: v.fiberG,
      sugar_g: v.sugarG,
      saturated_fat_g: v.saturatedFatG,
      salt_g: v.saltG,
      portion_name: pAmount !== null ? pName : null,
      portion_amount: pAmount,
      notes: notes || null,
    },
  };
}

/**
 * Lebensmittel speichern (neu oder geändert). Gibt es Name + Marke schon (am PC oder am Handy),
 * wird dieses Lebensmittel aktualisiert – so entsteht am PC kein zweites.
 */
export function saveFood(catalog, local, form, { uuid, now = new Date() }) {
  const checked = checkForm(form);
  if (!checked.ok) return checked;
  const foods = allFoods(catalog, local);
  const key = (f) => `${norm(f.name)}|${norm(f.brand ?? "")}`;
  const want = key(checked.values);
  const same = [...foods.values()].find((f) => key(f) === want && f.id !== form.id);
  const existing = form.id ? foods.get(form.id) : same;
  const iso = now.toISOString();
  const row = {
    id: existing?.id ?? uuid(),
    ...checked.values,
    archived: 0,
    created_at: existing?.created_at ?? iso,
    updated_at: iso,
  };
  local.foods[row.id] = { row, sent: false };
  if (checked.barcode) local.barcodes[checked.barcode] = { foodId: row.id, updatedAt: iso, sent: false };
  return { ok: true, food: row, merged: !form.id && Boolean(same) };
}

// ------------------------------------------------------------------ Mengen und Nährwerte

/** Menge in g/ml aus Eingabe und Einheit ("base" oder "portion"). */
export function amountOf(food, text, unit) {
  const v = parseNum(text);
  if (v === null || Number.isNaN(v) || v <= 0) return null;
  if (unit === "portion") return food.portion_amount ? Math.round(v * food.portion_amount * 10) / 10 : null;
  return v;
}

export function nutrientsFor(food, amount) {
  const f = amount / 100;
  return {
    kcal: food.energy_kcal * f,
    protein: food.protein_g * f,
    carbs: food.carbs_g * f,
    fat: food.fat_g * f,
  };
}

export function sumNutrients(list) {
  return list.reduce(
    (s, n) => ({ kcal: s.kcal + n.kcal, protein: s.protein + n.protein, carbs: s.carbs + n.carbs, fat: s.fat + n.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export const describeNutrients = (n) =>
  `${Math.round(n.kcal)} kcal · E ${num(n.protein, 1)} g · KH ${num(n.carbs, 1)} g · F ${num(n.fat, 1)} g`;

// ------------------------------------------------------------------ Tagebuch

/**
 * Einträge in eine Mahlzeit eintragen. Gibt es am Handy schon eine Mahlzeit dieses Platzes am
 * Tag, kommen sie dazu; sonst wird eine Mahlzeit vom PC (aus dem Export) weiterverwendet oder eine
 * neue angelegt. `items` = [{ foodId, amount }] in g/ml.
 */
export function addToMeal(catalog, local, { date, mealType, items, time }, { uuid, now = new Date() }) {
  if (!items.length) throw new Error("Keine Lebensmittel zum Eintragen.");
  if (!validKey(mealType)) throw new Error("Unbekannte Mahlzeit.");
  for (const it of items) {
    if (!(it.amount > 0 && it.amount <= 10000)) throw new Error("Menge muss zwischen 0 und 10.000 g/ml liegen.");
  }
  if (time !== undefined && time !== null && time !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Bitte eine gültige Uhrzeit eingeben (HH:MM).");
  const iso = now.toISOString();
  const meal = mealFor(catalog, local, date, mealType, { uuid, now, time });
  // Uhrzeit nur ergänzen, wenn die Mahlzeit noch keine hat (gespeicherte Uhrzeit bleibt)
  if (time && !meal.row.time) {
    meal.row.time = time;
    meal.row.updated_at = iso;
  }
  for (const it of items) {
    meal.items.push({
      id: uuid(),
      meal_id: meal.row.id,
      food_id: it.foodId,
      amount: Math.round(it.amount * 10) / 10,
      position: 1000 + meal.items.length,
      created_at: iso,
      updated_at: iso,
      sent: false,
    });
  }
  meal.sent = false;
  return meal;
}

/**
 * Mahlzeit am Handy für Tag und Platz (Schlüssel, siehe `parseMealKey`) finden oder anlegen.
 * `time`: Uhrzeit einer neuen Mahlzeit (`undefined` = jetzt, leer = ohne Uhrzeit).
 */
function mealFor(catalog, local, date, mealKey, { uuid, now, time }) {
  const { type, name } = parseMealKey(mealKey);
  const same = (t, n) => t === type && (n ?? null) === name;
  let meal = Object.values(local.meals).find((m) => m.row.date === date && same(m.row.meal_type, m.row.name));
  if (meal) return meal;
  const iso = now.toISOString();
  const pc = (catalog.nutrition?.meals ?? []).find((m) => m.date === date && same(m.meal_type, m.name));
  const row = pc
    ? { ...pc }
    : { id: uuid(), date, meal_type: type, time: time === undefined ? localTime(now) : time || null, notes: null, created_at: iso, updated_at: iso, name };
  meal = { row, items: [], fromPc: Boolean(pc) };
  local.meals[row.id] = meal;
  return meal;
}

/** Uhrzeit der vorhandenen Mahlzeit eines Platzes (am Handy oder vom PC), sonst null (1.47.0). */
export function mealTimeFor(catalog, local, date, mealKey) {
  const { type, name } = parseMealKey(mealKey);
  const same = (t, n) => t === type && (n ?? null) === name;
  const own = Object.values(local.meals).find((m) => m.row.date === date && same(m.row.meal_type, m.row.name));
  if (own) return own.row.time || null;
  const pc = (catalog.nutrition?.meals ?? []).find((m) => m.date === date && same(m.meal_type, m.name));
  return pc?.time || null;
}

/** Mahlzeit eines Tages (Standardart, ohne eigenen Namen) holen oder leer anlegen; gibt ihre ID zurück (1.26.0). */
export function ensureMeal(catalog, local, date, mealType, opts) {
  if (!validKey(mealType)) throw new Error("Unbekannte Mahlzeit.");
  return mealFor(catalog, local, date, mealType, { uuid: opts.uuid, now: opts.now ?? new Date() }).row.id;
}

/**
 * Noch nicht gesendete Einträge (1.2.2): alle Tage, neueste zuerst, je Mahlzeit in der Reihenfolge
 * des Tages. Rückgabe [{ date, meals: [{ meal, items: [{ ...item, food, n }], total }] }].
 */
export function unsentDays(catalog, local) {
  const foods = allFoods(catalog, local);
  const order = MEAL_TYPES.map((m) => m.value);
  const byDate = new Map();
  for (const m of Object.values(local.meals)) {
    const items = m.items
      .filter((i) => !i.sent)
      .map((it) => {
        const food = foods.get(it.food_id);
        return { ...it, food, n: food ? nutrientsFor(food, it.amount) : null };
      });
    if (!items.length) continue;
    if (!byDate.has(m.row.date)) byDate.set(m.row.date, []);
    byDate.get(m.row.date).push({ meal: m, items, total: sumNutrients(items.filter((i) => i.n).map((i) => i.n)) });
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, meals]) => ({ date, meals: meals.sort((a, b) => order.indexOf(a.meal.row.meal_type) - order.indexOf(b.meal.row.meal_type)) }));
}

/**
 * Noch nicht gesendeten Eintrag ändern (1.2.2): Menge in g/ml, Tag und Mahlzeit. Bei anderem Tag
 * oder anderer Mahlzeit wandert der Eintrag (gleiche ID) in die passende Mahlzeit; eine leer
 * gewordene, nie gesendete Mahlzeit entfällt.
 */
export function updateItem(catalog, local, mealId, itemId, { amount, date, mealType }, { uuid, now = new Date() }) {
  const meal = local.meals[mealId];
  const item = meal?.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Der Eintrag ist nicht mehr vorhanden.");
  if (item.sent) throw new Error("Dieser Eintrag ist schon am PC – dort bearbeiten.");
  const a = amount === undefined ? item.amount : amount;
  if (!(a > 0 && a <= 10000)) throw new Error("Menge muss zwischen 0 und 10.000 g/ml liegen.");
  const d = date ?? meal.row.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(new Date(`${d}T12:00:00`).getTime())) throw new Error("Bitte ein gültiges Datum wählen.");
  const t = mealType ?? mealKeyOf(meal.row);
  if (!validKey(t)) throw new Error("Unbekannte Mahlzeit.");
  const iso = now.toISOString();
  item.amount = Math.round(a * 10) / 10;
  item.updated_at = iso;
  if (d === meal.row.date && t === mealKeyOf(meal.row)) {
    meal.sent = false;
    return meal;
  }
  meal.items = meal.items.filter((i) => i.id !== itemId);
  if (!meal.items.length) delete local.meals[mealId];
  const target = mealFor(catalog, local, d, t, { uuid, now });
  item.meal_id = target.row.id;
  item.position = 1000 + target.items.length;
  target.items.push(item);
  target.sent = false;
  return target;
}

/** Am Handy angelegtes oder geändertes Lebensmittel verwerfen (nur ungesendet, nicht in Gebrauch). */
export function discardFood(local, foodId) {
  const f = local.foods[foodId];
  if (!f) return;
  if (f.sent) throw new Error("Das Lebensmittel ist schon am PC – dort bearbeiten.");
  const used =
    Object.values(local.meals).some((m) => m.items.some((i) => i.food_id === foodId)) ||
    Object.values(local.recipes).some((r) => r.items.some((i) => i.food_id === foodId)) ||
    local.dish.items.some((i) => i.foodId === foodId);
  if (used) throw new Error("Das Lebensmittel wird noch in Einträgen, Rezepten oder im Gericht verwendet.");
  delete local.foods[foodId];
  for (const [code, b] of Object.entries(local.barcodes)) if (b.foodId === foodId && !b.sent) delete local.barcodes[code];
}

/** Noch nicht gesendetes Rezept bzw. Strichcode verwerfen. */
export function discardRecipe(local, id) {
  if (local.recipes[id] && !local.recipes[id].sent) delete local.recipes[id];
}
export function discardBarcode(local, code) {
  if (local.barcodes[code] && !local.barcodes[code].sent) delete local.barcodes[code];
}

/**
 * Alles noch nicht Gesendete der Ernährung verwerfen (1.94.0, Offene Daten → Rubrik wischen):
 * Einträge, Rezepte, Strichcodes und eigene Lebensmittel, soweit sie nicht mehr verwendet werden.
 * Rückgabe: Zahl der verworfenen Teile.
 */
export function discardUnsentFood(local) {
  let n = 0;
  for (const [id, m] of Object.entries(local.meals)) {
    const before = m.items.length;
    m.items = m.items.filter((i) => i.sent);
    n += before - m.items.length;
    if (!m.items.length) delete local.meals[id];
  }
  for (const [id, r] of Object.entries(local.recipes)) if (!r.sent) (delete local.recipes[id], n++);
  for (const [code, c] of Object.entries(local.barcodes)) if (!c.sent) (delete local.barcodes[code], n++);
  for (const [id, f] of Object.entries(local.foods)) {
    if (f.sent || f.pkg) continue;
    try {
      discardFood(local, id);
      n++;
    } catch {
      // noch im Gericht verwendet – bleibt
    }
  }
  return n;
}

/** Noch nicht gesendeten Eintrag entfernen. */
export function removeItem(local, mealId, itemId) {
  const meal = local.meals[mealId];
  if (!meal) return;
  meal.items = meal.items.filter((i) => i.id !== itemId || i.sent);
  if (!meal.items.length) delete local.meals[mealId];
}

/** Mahlzeiten eines Tages am Handy mit Einträgen und Summen. */
export function dayOverview(catalog, local, date) {
  const foods = allFoods(catalog, local);
  const order = MEAL_TYPES.map((m) => m.value);
  return Object.values(local.meals)
    .filter((m) => m.row.date === date)
    .sort((a, b) => order.indexOf(a.row.meal_type) - order.indexOf(b.row.meal_type))
    .map((m) => {
      const items = m.items.map((it) => {
        const food = foods.get(it.food_id);
        return { ...it, food, n: food ? nutrientsFor(food, it.amount) : null };
      });
      return { meal: m, items, total: sumNutrients(items.filter((i) => i.n).map((i) => i.n)) };
    });
}

// ------------------------------------------------------------------ Gerichte

/** Freier Rezeptname wie am PC: „Name“, sonst „Name (2)“ … */
export function freeRecipeName(catalog, local, name, ownId = null) {
  const taken = new Set([
    ...(catalog.nutrition?.recipeNames ?? []).map(norm),
    ...Object.values(local.recipes).filter((r) => r.row.id !== ownId).map((r) => norm(r.row.name)),
  ]);
  if (!taken.has(norm(name))) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!taken.has(norm(candidate))) return candidate;
  }
}

/** Gericht → Mengen in g/ml je Zutat; Fehler je Zeile. */
export function dishAmounts(catalog, local, dish) {
  const foods = allFoods(catalog, local);
  const errors = {};
  const items = dish.items.map((it, i) => {
    const food = foods.get(it.foodId);
    const amount = food ? amountOf(food, it.amount, it.unit) : null;
    if (!food) errors[i] = "Lebensmittel fehlt.";
    else if (amount === null) errors[i] = "Bitte eine Menge eingeben.";
    return { food, amount };
  });
  return { items, errors };
}

export function dishTotal(catalog, local, dish) {
  const { items } = dishAmounts(catalog, local, dish);
  return sumNutrients(items.filter((i) => i.food && i.amount).map((i) => nutrientsFor(i.food, i.amount)));
}

/** Gericht als Vorlage (1 Portion) oder Rezept (mehrere Portionen) speichern. */
export function saveDishAsRecipe(catalog, local, dish, { uuid, now = new Date() }) {
  const name = dish.name.trim();
  if (!name) throw new Error("Bitte dem Gericht einen Namen geben.");
  if (name.length > 80) throw new Error("Der Name darf höchstens 80 Zeichen haben.");
  const servings = parseNum(dish.servings);
  if (!(servings > 0 && servings <= 100)) throw new Error("Portionen: bitte eine Zahl von 0 bis 100.");
  const { items, errors } = dishAmounts(catalog, local, dish);
  if (!items.length) throw new Error("Das Gericht hat noch keine Zutaten.");
  if (Object.keys(errors).length) throw new Error("Bitte bei allen Zutaten eine Menge eingeben.");
  if (items.some((i) => i.amount > 20000)) throw new Error("Eine Zutat hat mehr als 20 kg.");
  const iso = now.toISOString();
  const id = uuid();
  const row = {
    id,
    name: freeRecipeName(catalog, local, name),
    kind: servings === 1 ? "meal" : "recipe",
    servings,
    notes: null,
    archived: 0,
    created_at: iso,
    updated_at: iso,
  };
  local.recipes[id] = {
    row,
    items: items.map((it, position) => ({
      id: uuid(),
      recipe_id: id,
      food_id: it.food.id,
      amount: Math.round(it.amount * 10) / 10,
      position,
      created_at: iso,
      updated_at: iso,
    })),
    sent: false,
  };
  return row;
}

/**
 * Ausgewählte Lebensmittel einer Mahlzeit als Gericht speichern (1.19.0): Vorlage mit genau diesen
 * Mengen (1 Portion), wie „Als Vorlage speichern“ am PC. `items` = [{ foodId, amount }] in g/ml.
 */
export function saveItemsAsDish(catalog, local, name, items, opts) {
  if (!items.length) throw new Error("Bitte mindestens ein Lebensmittel auswählen.");
  const dish = { name: String(name ?? ""), servings: "1", items: items.map((i) => ({ foodId: i.foodId, amount: String(Math.round(i.amount * 10) / 10), unit: "base" })) };
  return saveDishAsRecipe(catalog, local, dish, opts);
}

/**
 * Ausgewählte Lebensmittel in eine Mahlzeit eines frei wählbaren Tages kopieren (1.19.0) – neue
 * Einträge mit denselben Mengen; vorhandene Einträge der Zielmahlzeit bleiben.
 */
export function copyItemsTo(catalog, local, { date, mealType, items }, opts) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? "")) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) throw new Error("Bitte ein gültiges Datum wählen.");
  if (!MEAL_TYPES.some((m) => m.value === mealType)) throw new Error("Bitte eine Mahlzeit wählen.");
  if (!items.length) throw new Error("Bitte mindestens ein Lebensmittel auswählen.");
  return addToMeal(catalog, local, { date, mealType, items: items.map((i) => ({ foodId: i.foodId, amount: i.amount })) }, opts);
}

/** Gegessene Portionen eines Gerichts als Einträge (Mengen anteilig). */
export function dishPortionItems(catalog, local, dish, eatenText) {
  const servings = parseNum(dish.servings);
  const eaten = parseNum(eatenText);
  if (!(servings > 0)) throw new Error("Portionen: bitte eine Zahl größer als 0.");
  if (!(eaten > 0)) throw new Error("Gegessene Portionen: bitte eine Zahl größer als 0.");
  const { items, errors } = dishAmounts(catalog, local, dish);
  if (!items.length) throw new Error("Das Gericht hat noch keine Zutaten.");
  if (Object.keys(errors).length) throw new Error("Bitte bei allen Zutaten eine Menge eingeben.");
  return items.map((it) => ({ foodId: it.food.id, amount: (it.amount * eaten) / servings }));
}

// ------------------------------------------------------------------ An den PC

/** Anzahl noch nicht gesendeter Einträge (Lebensmittel, Strichcodes, Mahlzeiten, Rezepte). */
export function unsentCount(local) {
  return (
    Object.values(local.planned ?? {}).filter((p) => !p.sent).length +
    Object.values(local.plannedDeleted ?? {}).filter((d) => !d.sent).length +
    Object.values(local.foods).filter((f) => !f.sent && !f.pkg).length +
    Object.values(local.barcodes).filter((b) => !b.sent).length +
    Object.values(local.meals).reduce((n, m) => n + m.items.filter((i) => !i.sent).length, 0) +
    Object.values(local.recipes).filter((r) => !r.sent).length
  );
}

const clean = ({ sent: _sent, ...row }) => row;

/**
 * Tabellen für die Rückgabedatei. `all` = auch schon gesendete. Mitgeschickt wird jedes
 * Lebensmittel, auf das ein Eintrag verweist, damit die Desktop-App die Datei vollständig prüfen
 * kann (unverändert aus dem Export ändert es am PC nichts).
 */
export function nutritionTables(catalog, local, { all = false } = {}) {
  const foods = allFoods(catalog, local);
  const out = { food: new Map(), meal: [], meal_item: [], recipe: [], recipe_item: [], settings: [], planned_meal: [], planned_meal_item: [], deleted_record: [] };
  const needFood = (id) => {
    const f = foods.get(id);
    if (!f) throw new Error("Ein Lebensmittel fehlt. Bitte neue Daten vom PC laden.");
    out.food.set(id, f);
  };
  for (const f of Object.values(local.foods)) if (all || !f.sent) out.food.set(f.row.id, f.row);
  for (const [code, b] of Object.entries(local.barcodes)) {
    if (!all && b.sent) continue;
    needFood(b.foodId);
    out.settings.push({ key: BARCODE_PREFIX + code, value: b.foodId, updated_at: b.updatedAt });
  }
  for (const m of Object.values(local.meals)) {
    const items = m.items.filter((i) => all || !i.sent);
    if (!items.length) continue;
    out.meal.push({ ...m.row });
    for (const it of items) {
      needFood(it.food_id);
      out.meal_item.push(clean(it));
    }
  }
  for (const r of Object.values(local.recipes)) {
    if (!all && r.sent) continue;
    out.recipe.push({ ...r.row });
    for (const it of r.items) {
      needFood(it.food_id);
      out.recipe_item.push({ ...it });
    }
  }
  // Geplante Mahlzeiten (1.100.0, Schema 74): die ganze Mahlzeit mit allen Lebensmitteln; am PC
  // entfallene Lebensmittel löscht der Abgleich über die Löschvermerke der Einträge
  for (const p of Object.values(local.planned ?? {})) {
    if (!all && p.sent) continue;
    out.planned_meal.push({ ...p.row });
    for (const it of p.items) {
      needFood(it.food_id);
      out.planned_meal_item.push({ ...it });
    }
    for (const [id, at] of Object.entries(p.removedItems ?? {})) {
      out.deleted_record.push({ id: `planned_meal_item:${id}`, table_name: "planned_meal_item", record_id: id, deleted_at: at });
    }
  }
  for (const [id, d] of Object.entries(local.plannedDeleted ?? {})) {
    if (!all && d.sent) continue;
    out.deleted_record.push({ id: `planned_meal:${id}`, table_name: "planned_meal", record_id: id, deleted_at: d.at });
  }
  const tables = {};
  for (const [name, val] of Object.entries(out)) {
    const list = Array.isArray(val) ? val : [...val.values()];
    if (list.length) tables[name] = list;
  }
  return tables;
}

/** Nach dem Senden: alles als übertragen markieren. */
export function markNutritionSent(local) {
  for (const f of Object.values(local.foods)) f.sent = true;
  for (const b of Object.values(local.barcodes)) b.sent = true;
  for (const m of Object.values(local.meals)) {
    m.sent = true;
    for (const i of m.items) i.sent = true;
  }
  for (const r of Object.values(local.recipes)) r.sent = true;
  for (const p of Object.values(local.planned ?? {})) p.sent = true;
  for (const d of Object.values(local.plannedDeleted ?? {})) d.sent = true;
}

/**
 * Aufräumen nach dem Laden neuer Daten vom PC: übertragene Mahlzeiten älter als 14 Tage und
 * übertragene Lebensmittel/Strichcodes, die der PC jetzt selbst mitbringt, entfernen.
 */
export function pruneLocal(catalog, local, today = localDate()) {
  const pcFoods = new Map((catalog.nutrition?.foods ?? []).map((f) => [f.id, f]));
  const pcCodes = catalog.nutrition?.barcodes ?? {};
  const limit = localDate(new Date(new Date(`${today}T12:00:00`).getTime() - 14 * 86400000));
  for (const [id, m] of Object.entries(local.meals)) {
    if (m.row.date < limit && m.items.every((i) => i.sent)) delete local.meals[id];
  }
  for (const [id, f] of Object.entries(local.foods)) {
    const pc = pcFoods.get(id);
    if (f.sent && pc && pc.updated_at >= f.row.updated_at) delete local.foods[id];
  }
  for (const [code, b] of Object.entries(local.barcodes)) {
    if (b.sent && pcCodes[code] === b.foodId) delete local.barcodes[code];
  }
  for (const [id, r] of Object.entries(local.recipes)) {
    if (r.sent && (catalog.nutrition?.recipeNames ?? []).some((n) => norm(n) === norm(r.row.name))) delete local.recipes[id];
  }
  // Geplante Mahlzeiten: Übertragenes, das der PC (mindestens so neu) hat bzw. gelöscht hat, entfällt
  const pcPlanned = new Map((catalog.pc?.planned_meal ?? []).map((r) => [r.id, r]));
  for (const [id, p] of Object.entries(local.planned ?? {})) {
    const pc = pcPlanned.get(id);
    if (p.sent && (!pc || String(pc.updated_at) >= String(p.row.updated_at))) delete local.planned[id];
  }
  for (const [id, d] of Object.entries(local.plannedDeleted ?? {})) if (d.sent && !pcPlanned.has(id)) delete local.plannedDeleted[id];
  return local;
}

// ------------------------------------------------------------------ Geplante Mahlzeiten (1.100.0)
// Wie `repo/planned_meal.rs` am PC: im Tagesverlauf zu einer späteren Uhrzeit geplant, zählt nicht
// zu den gegessenen Nährwerten. „Gegessen“ trägt die Lebensmittel in die Mahlzeit ein.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Geplante Mahlzeiten eines Tages (vom PC und vom Handy), nach Uhrzeit, mit Nährwerten. */
export function plannedOn(catalog, local, date) {
  const foods = allFoods(catalog, local);
  for (const f of catalog.pc?.archived_food ?? []) if (!foods.has(f.id)) foods.set(f.id, f);
  const gone = local.plannedDeleted ?? {};
  const mine = local.planned ?? {};
  const pcItems = new Map();
  for (const it of catalog.pc?.planned_meal_item ?? []) {
    if (!pcItems.has(it.planned_meal_id)) pcItems.set(it.planned_meal_id, []);
    pcItems.get(it.planned_meal_id).push(it);
  }
  const list = [];
  for (const r of catalog.pc?.planned_meal ?? []) {
    if (r.date !== date || gone[r.id] || mine[r.id]) continue;
    list.push({ row: r, items: pcItems.get(r.id) ?? [], phone: false });
  }
  for (const p of Object.values(mine)) if (p.row.date === date) list.push({ row: p.row, items: p.items, phone: true });
  return list
    .map(({ row, items, phone }) => {
      const its = [...items]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .flatMap((it) => {
          const f = foods.get(it.food_id);
          if (!f) return [];
          const n = nutrientsFor(f, it.amount);
          return [{ id: it.id, foodId: it.food_id, foodName: f.name, basisUnit: f.basis_unit ?? "g", amount: it.amount, energyKcal: n.kcal, proteinG: n.protein, carbsG: n.carbs, fatG: n.fat }];
        });
      const sum = (k) => its.reduce((s, i) => s + i[k], 0);
      return {
        id: row.id,
        date: row.date,
        mealType: row.meal_type,
        name: row.name ?? null,
        key: mealKeyOf(row),
        time: row.time,
        notes: row.notes ?? null,
        items: its,
        energyKcal: sum("energyKcal"),
        proteinG: sum("proteinG"),
        carbsG: sum("carbsG"),
        fatG: sum("fatG"),
        phone,
      };
    })
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

/** Aktuellen Stand einer geplanten Mahlzeit als Handy-Eintrag holen (vom PC übernehmen). */
function plannedEntry(catalog, local, id) {
  local.planned ??= {};
  if (local.planned[id]) return local.planned[id];
  const row = (catalog.pc?.planned_meal ?? []).find((r) => r.id === id);
  if (!row || local.plannedDeleted?.[id]) return null;
  const items = (catalog.pc?.planned_meal_item ?? []).filter((it) => it.planned_meal_id === id).map((it) => ({ ...it }));
  local.planned[id] = { row: { ...row }, items, sent: false, removedItems: {} };
  return local.planned[id];
}

/**
 * Speichern: neue geplante Mahlzeit oder Lebensmittel ergänzen. `input` = { id?, date, mealKey,
 * time, items: [{ foodId, amount }] } (Mengen in g/ml).
 */
export function savePlanned(catalog, local, input, { uuid, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) throw new Error("Bitte einen gültigen Tag angeben.");
  if (!validKey(input.mealKey)) throw new Error("Unbekannte Mahlzeit.");
  const time = String(input.time ?? "").trim();
  if (!TIME_RE.test(time)) throw new Error("Bitte eine Uhrzeit für die geplante Mahlzeit angeben (HH:MM).");
  const items = input.items ?? [];
  for (const it of items) {
    if (!(it.amount >= 0.1 && it.amount <= 10000)) throw new Error("Menge muss zwischen 0,1 und 10.000 g/ml liegen.");
  }
  const iso = now.toISOString();
  const { type, name } = parseMealKey(input.mealKey);
  let p = input.id ? plannedEntry(catalog, local, input.id) : null;
  if (!p) {
    if (!items.length) throw new Error("Bitte mindestens ein Lebensmittel für die geplante Mahlzeit wählen.");
    const id = input.id ?? uuid();
    p = { row: { id, date: input.date, meal_type: type, name, time, notes: null, created_at: iso, updated_at: iso }, items: [], sent: false, removedItems: {} };
    local.planned ??= {};
    local.planned[id] = p;
  }
  p.row = { ...p.row, date: input.date, meal_type: type, name, time, updated_at: iso };
  for (const it of items) {
    p.items.push({ id: uuid(), planned_meal_id: p.row.id, food_id: it.foodId, amount: Math.round(it.amount * 10) / 10, position: p.items.length, created_at: iso, updated_at: iso });
  }
  p.sent = false;
  return p;
}

/** Ein Lebensmittel aus einer geplanten Mahlzeit entfernen (die letzte bleibt; dann ganz löschen). */
export function removePlannedItem(catalog, local, id, itemId, now = new Date()) {
  const p = plannedEntry(catalog, local, id);
  if (!p) return;
  if (p.items.length <= 1) return deletePlanned(catalog, local, id, now);
  p.items = p.items.filter((it) => it.id !== itemId);
  p.removedItems = { ...(p.removedItems ?? {}), [itemId]: now.toISOString() };
  p.row = { ...p.row, updated_at: now.toISOString() };
  p.sent = false;
}

/** Verschieben im Tagesverlauf. */
export function movePlanned(catalog, local, id, time, now = new Date()) {
  if (!TIME_RE.test(String(time ?? ""))) throw new Error("Bitte eine gültige Uhrzeit eingeben (HH:MM).");
  const p = plannedEntry(catalog, local, id);
  if (!p) throw new Error("Die geplante Mahlzeit gibt es nicht mehr.");
  p.row = { ...p.row, time, updated_at: now.toISOString() };
  p.sent = false;
}

/** Löschen; vom PC oder schon gesendet → Löschvermerk. */
export function deletePlanned(catalog, local, id, now = new Date()) {
  const own = local.planned?.[id];
  if (own) delete local.planned[id];
  const onPc = (catalog.pc?.planned_meal ?? []).some((r) => r.id === id);
  if (onPc || own?.sent) {
    local.plannedDeleted ??= {};
    local.plannedDeleted[id] = { at: now.toISOString(), sent: false };
  }
}

/** Als gegessen bestätigen: Lebensmittel in die Mahlzeit eintragen, Plan löschen. */
export function confirmPlanned(catalog, local, id, { time = null, uuid, now = new Date() }) {
  const plan = plannedOn(catalog, local, plannedEntry(catalog, local, id)?.row.date ?? "").find((p) => p.id === id);
  if (!plan) throw new Error("Die geplante Mahlzeit gibt es nicht mehr.");
  const meal = addToMeal(catalog, local, { date: plan.date, mealType: plan.key, items: plan.items.map((i) => ({ foodId: i.foodId, amount: i.amount })), time: time || plan.time }, { uuid, now });
  deletePlanned(catalog, local, id, now);
  return meal;
}

/** „Heute“ für die Ernährung: mit dem Tageswechsel wie am PC (1.48.0). */
export const nutritionDate = () => appDay();
