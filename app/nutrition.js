// LIFESPAN OS Mobil – Ernährung: Lebensmittel scannen, tracken, Gerichte. Reine Logik.
// Zeilen haben genau die Spalten der Desktop-Datenbank (Tabellen food, meal, meal_item, recipe,
// recipe_item, settings), Prüfregeln wie die CHECK-Regeln der Migrationen.

import { LABEL_KEYS, extrasNote, guessName, validBarcode } from "./label.js";

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
export const mealLabel = (t) => MEAL_TYPES.find((m) => m.value === t)?.label ?? t;

/** Vorschlag nach Uhrzeit (wie die Desktop-App). */
export function suggestMealType(hour) {
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour >= 17 && hour < 22) return "dinner";
  return "snack";
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
  return { foods: {}, barcodes: {}, meals: {}, recipes: {}, dish: emptyDish() };
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
export function addToMeal(catalog, local, { date, mealType, items }, { uuid, now = new Date() }) {
  if (!items.length) throw new Error("Keine Lebensmittel zum Eintragen.");
  for (const it of items) {
    if (!(it.amount > 0 && it.amount <= 10000)) throw new Error("Menge muss zwischen 0 und 10.000 g/ml liegen.");
  }
  const iso = now.toISOString();
  let meal = Object.values(local.meals).find((m) => m.row.date === date && m.row.meal_type === mealType && m.row.name === null);
  if (!meal) {
    const pc = (catalog.nutrition?.meals ?? []).find((m) => m.date === date && m.meal_type === mealType && (m.name ?? null) === null);
    const row = pc
      ? { ...pc }
      : { id: uuid(), date, meal_type: mealType, time: localTime(now), notes: null, created_at: iso, updated_at: iso, name: null };
    meal = { row, items: [], fromPc: Boolean(pc) };
    local.meals[row.id] = meal;
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

/** Mahlzeit am Handy für Tag und Platz finden oder anlegen (wie `addToMeal`). */
function mealFor(catalog, local, date, mealType, { uuid, now }) {
  let meal = Object.values(local.meals).find((m) => m.row.date === date && m.row.meal_type === mealType && m.row.name === null);
  if (meal) return meal;
  const iso = now.toISOString();
  const pc = (catalog.nutrition?.meals ?? []).find((m) => m.date === date && m.meal_type === mealType && (m.name ?? null) === null);
  const row = pc
    ? { ...pc }
    : { id: uuid(), date, meal_type: mealType, time: localTime(now), notes: null, created_at: iso, updated_at: iso, name: null };
  meal = { row, items: [], fromPc: Boolean(pc) };
  local.meals[row.id] = meal;
  return meal;
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
  const t = mealType ?? meal.row.meal_type;
  if (!MEAL_TYPES.some((m) => m.value === t)) throw new Error("Unbekannte Mahlzeit.");
  const iso = now.toISOString();
  item.amount = Math.round(a * 10) / 10;
  item.updated_at = iso;
  if (d === meal.row.date && t === meal.row.meal_type) {
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
    Object.values(local.foods).filter((f) => !f.sent).length +
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
  const out = { food: new Map(), meal: [], meal_item: [], recipe: [], recipe_item: [], settings: [] };
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
  return local;
}

export { localDate as nutritionDate };
