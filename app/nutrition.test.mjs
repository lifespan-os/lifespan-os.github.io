// Tests Etikett-Scanner und Ernährung am Handy: node --test nutrition.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "./label.js";
import * as N from "./nutrition.js";
import * as C from "./core.js";

const SKYR = [
  "NÖM Skyr Drink Heidelbeere",
  "Durchschnittliche Nährwerte pro 100 ml",
  "Brennwert 228 kJ / 54 kcal",
  "Fett <0,5 g",
  "davon gesättigte Fettsäuren 0,2 g",
  "Kohlenhydrate 4,O g",
  "davon Zucker 3,6 g",
  "Ballaststoffe 0,4g",
  "Eiweiß",
  "8,4 g",
  "Salz 0,11 g",
  "Magnesium 38 mg (10%*)",
  "350 g e (330 ml)",
  "4 069366 486145",
];
const SKYR_VALUES = { energyKcal: 54, fatG: 0.5, saturatedFatG: 0.2, carbsG: 4, sugarG: 3.6, fiberG: 0.4, proteinG: 8.4, saltG: 0.11 };

test("Etikett: Nährwerttabelle je 100 ml, Packung, Strichcode, Magnesium", () => {
  const scan = L.parseLabel(SKYR.join("\n"));
  assert.equal(scan.basis, "ml");
  assert.deepEqual(scan.values, SKYR_VALUES);
  assert.deepEqual(scan.lessThan, ["fatG"]);
  assert.equal(scan.packageAmount, 330);
  assert.equal(scan.barcode, "4069366486145");
  assert.equal(L.extrasNote(scan, "ml"), "Je 100 ml: Magnesium 38 mg");
  assert.equal(L.guessName(SKYR), "NÖM Skyr Drink Heidelbeere");
});

test("Etikett: spaltenweise gelesen (iPhone „Text scannen“)", () => {
  const text = [
    "Nährwerte je 100 ml",
    "Brennwert",
    "Fett",
    "davon gesättigte Fettsäuren",
    "Kohlenhydrate",
    "davon Zucker",
    "Ballaststoffe",
    "Eiweiß",
    "Salz",
    "228 kJ / 54 kcal",
    "<0,5 g",
    "0,2 g",
    "4,0 g",
    "3,6 g",
    "0,4 g",
    "8,4 g",
    "0,11 g",
  ].join("\n");
  const scan = L.parseLabel(text);
  assert.deepEqual(scan.values, SKYR_VALUES);
  assert.equal(scan.packageAmount, null);
});

test("Etikett: kJ → kcal, Natrium → Salz, Prüfziffer", () => {
  const scan = L.parseLabel(["je 100 g", "Energie 1046 kJ", "Fett 12 g", "Kohlenhydrate 30 g", "Eiweiß 5 g", "Natrium 400 mg", "Inhalt 1 kg"]);
  assert.equal(scan.values.energyKcal, 250);
  assert.equal(scan.values.saltG, 1);
  assert.equal(scan.packageAmount, 1000);
  assert.equal(L.validBarcode("40170725"), true);
  assert.equal(L.validBarcode("4069366486146"), false);
  assert.equal(L.normalizeRow("Kohlenhydrate 4 , O g"), "Kohlenhydrate 4,0 g");
});

const T0 = "2026-11-12T08:00:00.000Z";
const pcFood = { id: "f-pc", name: "Haferflocken", brand: "", basis_unit: "g", energy_kcal: 372, protein_g: 13.5, carbs_g: 58.7, fat_g: 7, fiber_g: 10, sugar_g: 0.7, saturated_fat_g: 1.3, salt_g: 0.01, portion_name: null, portion_amount: null, notes: null, archived: 0, created_at: T0, updated_at: T0 };
const exportText = (extra = {}) =>
  JSON.stringify({
    format: "performance-os-export", formatVersion: 2, schemaVersion: 54, appVersion: "1.0.120", exportedAt: "2026-11-12T09:00:00.000Z",
    tables: {
      food: [pcFood, { ...pcFood, id: "f-arch", name: "Alt", archived: 1 }],
      settings: [{ key: "strichcode.40170725", value: "f-pc", updated_at: T0 }, { key: "water_glass_ml", value: "500", updated_at: T0 }],
      meal: [
        { id: "m-pc", date: "2026-11-12", meal_type: "breakfast", time: "07:30", notes: null, created_at: T0, updated_at: T0, name: null },
        { id: "m-old", date: "2026-10-01", meal_type: "lunch", time: null, notes: null, created_at: T0, updated_at: T0, name: null },
      ],
      recipe: [{ id: "r1", name: "Bowl", kind: "meal", servings: 1, notes: null, archived: 0, created_at: T0, updated_at: T0 }],
      ...extra,
    },
  });

let n = 0;
const uuid = () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`;
const now = new Date("2026-11-12T10:00:00.000Z");

test("Export: Lebensmittel, Strichcodes, letzte Mahlzeiten, Rezeptnamen", () => {
  const cat = C.parseExport(exportText());
  assert.deepEqual(cat.nutrition.foods.map((f) => f.id), ["f-pc"]);
  assert.deepEqual(cat.nutrition.barcodes, { "40170725": "f-pc" });
  assert.deepEqual(cat.nutrition.meals.map((m) => m.id), ["m-pc"]);
  assert.deepEqual(cat.nutrition.recipeNames, ["Bowl"]);
  const local = N.emptyLocal();
  assert.equal(N.foodByBarcode(cat, local, "40170725").name, "Haferflocken");
  assert.equal(N.searchFoods(cat, local, "hafer")[0].id, "f-pc");
});

test("Scan speichern, tracken, an vorhandene PC-Mahlzeit anhängen, Rückgabedatei", () => {
  const cat = C.parseExport(exportText());
  const local = N.emptyLocal();
  const form = N.scanToForm(L.parseLabel(SKYR), SKYR);
  assert.equal(form.portionAmount, "330");
  const saved = N.saveFood(cat, local, form, { uuid, now });
  assert.equal(saved.ok, true);
  assert.equal(saved.food.basis_unit, "ml");
  assert.equal(saved.food.brand, "");
  assert.equal(N.foodByBarcode(cat, local, "4069366486145").id, saved.food.id);

  // 1 Packung zum Frühstück: PC-Mahlzeit des Tages wird weiterverwendet
  const amount = N.amountOf(saved.food, "1", "portion");
  assert.equal(amount, 330);
  const meal = N.addToMeal(cat, local, { date: "2026-11-12", mealType: "breakfast", items: [{ foodId: saved.food.id, amount }] }, { uuid, now });
  assert.equal(meal.row.id, "m-pc");
  // Abendessen: neue Mahlzeit
  const dinner = N.addToMeal(cat, local, { date: "2026-11-12", mealType: "dinner", items: [{ foodId: "f-pc", amount: 80 }] }, { uuid, now });
  assert.notEqual(dinner.row.id, "m-pc");
  const day = N.dayOverview(cat, local, "2026-11-12");
  assert.equal(day.length, 2);
  assert.equal(Math.round(day[0].total.kcal), 178);

  assert.equal(N.unsentCount(local), 4); // Lebensmittel, Strichcode, 2 Einträge
  const doc = C.buildReturnFile(cat, [], [], now, N.nutritionTables(cat, local));
  const t = doc.tables;
  assert.deepEqual(t.food.map((f) => f.id).sort(), [saved.food.id, "f-pc"].sort());
  assert.deepEqual(t.settings, [{ key: "strichcode.4069366486145", value: saved.food.id, updated_at: now.toISOString() }]);
  assert.equal(t.meal.find((m) => m.id === "m-pc").updated_at, T0, "PC-Mahlzeit unverändert");
  assert.equal(t.meal_item.length, 2);
  assert.ok(t.meal_item.every((i) => !("sent" in i) && i.position >= 1000));
  assert.deepEqual(Object.keys(t.food[0]), Object.keys(pcFood), "Spalten wie die Datenbank");

  N.markNutritionSent(local);
  assert.equal(N.unsentCount(local), 0);
  assert.throws(() => C.buildReturnFile(cat, [], [], now, N.nutritionTables(cat, local)), /nichts zu senden/);
  assert.equal(N.nutritionTables(cat, local, { all: true }).meal_item.length, 2);
});

test("Gleicher Name + Marke: vorhandenes Lebensmittel wird aktualisiert, kein zweites", () => {
  const cat = C.parseExport(exportText());
  const local = N.emptyLocal();
  const form = { ...N.foodToForm(pcFood), id: null };
  form.values.energyKcal = "370";
  const r = N.saveFood(cat, local, form, { uuid, now });
  assert.equal(r.food.id, "f-pc");
  assert.equal(r.merged, true);
  assert.equal(r.food.energy_kcal, 370);
  assert.equal(r.food.created_at, T0);
});

test("Formular: Grenzen wie die Datenbank", () => {
  const f = N.emptyForm();
  f.name = "X";
  f.values = { energyKcal: "950", fatG: "1", saturatedFatG: "2", carbsG: "60", sugarG: "70", fiberG: "", proteinG: "50", saltG: "abc" };
  f.portionName = "Riegel";
  f.barcode = "123";
  const r = N.checkForm(f);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["barcode", "energyKcal", "portionAmount", "proteinG", "saltG", "saturatedFatG", "sugarG"].sort());
});

test("Gericht: Rezept mit freiem Namen, Portionen anteilig eintragen", () => {
  const cat = C.parseExport(exportText());
  const local = N.emptyLocal();
  const dish = { name: "Bowl", servings: "2", items: [{ foodId: "f-pc", amount: "100", unit: "base" }] };
  assert.equal(Math.round(N.dishTotal(cat, local, dish).kcal), 372);
  const recipe = N.saveDishAsRecipe(cat, local, dish, { uuid, now });
  assert.equal(recipe.name, "Bowl (2)");
  assert.equal(recipe.kind, "recipe");
  const items = N.dishPortionItems(cat, local, dish, "1");
  assert.deepEqual(items, [{ foodId: "f-pc", amount: 50 }]);
  const t = N.nutritionTables(cat, local);
  assert.equal(t.recipe_item[0].amount, 100);
  assert.equal(t.food[0].id, "f-pc");
  assert.throws(() => N.saveDishAsRecipe(cat, local, { ...dish, items: [{ foodId: "f-pc", amount: "", unit: "base" }] }, { uuid, now }), /Menge/);
});

test("Aufräumen: alte übertragene Mahlzeiten und vom PC übernommene Lebensmittel", () => {
  const cat = C.parseExport(exportText());
  const local = N.emptyLocal();
  N.addToMeal(cat, local, { date: "2026-10-20", mealType: "lunch", items: [{ foodId: "f-pc", amount: 50 }] }, { uuid, now });
  N.addToMeal(cat, local, { date: "2026-11-11", mealType: "lunch", items: [{ foodId: "f-pc", amount: 50 }] }, { uuid, now });
  N.markNutritionSent(local);
  N.pruneLocal(cat, local, "2026-11-12");
  assert.deepEqual(Object.values(local.meals).map((m) => m.row.date), ["2026-11-11"]);
});

// ------------------------------------------------------------------ 1.2.1: Lesefehler, Plausibilität

test("Lesefehler in Zahlen werden korrigiert, Vitamin B12 bleibt", () => {
  assert.equal(L.normalizeRow("Fett l2,S g"), "Fett 12,5 g");
  assert.equal(L.normalizeRow("Eiweiß 1O,2 g"), "Eiweiß 10,2 g");
  assert.equal(L.normalizeRow("Eiweiß 8,2 9"), "Eiweiß 8,2 g");
  assert.equal(L.normalizeRow("Ballaststoffe 3,1 q"), "Ballaststoffe 3,1 g");
  assert.equal(L.normalizeRow("Brennwert 1S20 kJ"), "Brennwert 1520 kJ");
  assert.equal(L.normalizeRow("Vitamin B12 2,5 µg"), "Vitamin B12 2,5 µg");
  assert.equal(L.normalizeRow("Inhalt 1l"), "Inhalt 1l");
});

test("unscharf gelesene Bezeichnungen werden erkannt", () => {
  const scan = L.parseLabel([
    "Nährwerte je 100 g",
    "Brennwert 1520 kJ / 363 kcal",
    "Fet 12,5 g",
    "davon gesattigte Fettsauren 3,1 g",
    "Kohlenhyd rate 45,0 g",
    "davon Zuckor 4,0 g",
    "Ba1laststoffe 3,1",
    "Eiwelß 8,2 g",
    "Saiz 0,9 g",
  ]);
  assert.deepEqual(scan.values, {
    energyKcal: 363, fatG: 12.5, saturatedFatG: 3.1, carbsG: 45, sugarG: 4, fiberG: 3.1, proteinG: 8.2, saltG: 0.9,
  });
});

test("fehlendes Komma und falscher Brennwert werden repariert", () => {
  const scan = L.repairScan(L.parseLabel(["Brennwert 1520 kJ / 860 kcal", "Fett 125 g", "Kohlenhydrate 45 g", "Eiweiß 8,2 g"]));
  assert.equal(scan.values.fatG, 12.5);
  assert.equal(scan.values.energyKcal, 363);
  assert.deepEqual(scan.corrected, ["fatG", "energyKcal"]);
  assert.deepEqual(L.checkValues(scan.values, scan.energyKj), {});
});

test("Plausibilität: Hinweise je Feld", () => {
  const w = L.checkValues({ energyKcal: 500, fatG: 2, saturatedFatG: 3, carbsG: 10, sugarG: 12, proteinG: 5 });
  assert.ok(w.saturatedFatG && w.sugarG && w.energyKcal);
  assert.deepEqual(L.checkValues({ energyKcal: 54, fatG: 0.5, carbsG: 4, sugarG: 3.6, proteinG: 8.4, saltG: 0.11 }, 228), {});
});

test("Bewertung bevorzugt vollständige, stimmige Scans", () => {
  const good = L.repairScan(L.parseLabel(["Nährwerte je 100 g", "Brennwert 363 kcal", "Fett 12,5 g", "Kohlenhydrate 45 g", "Eiweiß 8,2 g"]));
  const bad = L.repairScan(L.parseLabel(["Brennwert 363 kcal", "Fett 2 g"]));
  assert.ok(L.scanScore(good) > L.scanScore(bad));
});

// ------------------------------------------------------------------ 1.2.2: vor dem Senden bearbeiten

test("offene Einträge ändern, verschieben und verwerfen", () => {
  let n = 0;
  const uuid = () => `id-${++n}`;
  const now = new Date("2026-11-12T12:00:00");
  const food = { id: "f1", name: "Skyr", brand: null, basis_unit: "g", energy_kcal: 60, protein_g: 11, carbs_g: 4, fat_g: 0.2, portion_amount: null };
  const catalog = { nutrition: { foods: [food], barcodes: {}, meals: [], recipeNames: [] } };
  const local = N.emptyLocal();
  const meal = N.addToMeal(catalog, local, { date: "2026-11-12", mealType: "breakfast", items: [{ foodId: "f1", amount: 150 }, { foodId: "f1", amount: 50 }] }, { uuid, now });
  const [a, b] = meal.items;
  // Menge
  N.updateItem(catalog, local, meal.row.id, a.id, { amount: 200 }, { uuid, now });
  assert.equal(local.meals[meal.row.id].items[0].amount, 200);
  // andere Mahlzeit und anderer Tag: gleiche ID, neue Mahlzeit
  const target = N.updateItem(catalog, local, meal.row.id, b.id, { mealType: "dinner", date: "2026-11-11" }, { uuid, now });
  assert.equal(target.row.meal_type, "dinner");
  assert.equal(target.row.date, "2026-11-11");
  assert.equal(target.items[0].id, b.id);
  assert.equal(target.items[0].meal_id, target.row.id);
  const days = N.unsentDays(catalog, local);
  assert.deepEqual(days.map((d) => d.date), ["2026-11-12", "2026-11-11"]);
  // letzter Eintrag weg → leere Mahlzeit entfällt
  N.updateItem(catalog, local, meal.row.id, a.id, { mealType: "dinner", date: "2026-11-11" }, { uuid, now });
  assert.equal(local.meals[meal.row.id], undefined);
  assert.equal(target.items.length, 2);
  assert.throws(() => N.updateItem(catalog, local, target.row.id, a.id, { amount: 0 }, { uuid, now }), /Menge/);
  assert.throws(() => N.updateItem(catalog, local, target.row.id, a.id, { date: "12.11.2026" }, { uuid, now }), /Datum/);
  // gesendete Einträge bleiben gesperrt
  N.markNutritionSent(local);
  assert.throws(() => N.updateItem(catalog, local, target.row.id, a.id, { amount: 10 }, { uuid, now }), /schon am PC/);
  assert.equal(N.unsentDays(catalog, local).length, 0);
});

test("Lebensmittel verwerfen nur, wenn nicht in Gebrauch", () => {
  const local = N.emptyLocal();
  local.foods.f2 = { row: { id: "f2", name: "Neu" }, sent: false };
  local.barcodes["4006381333931"] = { foodId: "f2", updatedAt: "x", sent: false };
  local.dish.items.push({ foodId: "f2", amount: "100", unit: "base" });
  assert.throws(() => N.discardFood(local, "f2"), /verwendet/);
  local.dish.items = [];
  N.discardFood(local, "f2");
  assert.equal(local.foods.f2, undefined);
  assert.deepEqual(local.barcodes, {});
});

test("Auswahl einer Mahlzeit: als Gericht speichern und in einen anderen Tag kopieren (1.19.0)", () => {
  let k = 0;
  const id = () => `id-${++k}`;
  const now = new Date("2026-11-14T18:00:00Z");
  const food = { id: "f1", name: "Skyr", brand: "Billa", basis_unit: "g", energy_kcal: 58, protein_g: 9.5, carbs_g: 4, fat_g: 0.5 };
  const chia = { id: "f2", name: "Chia-Samen", brand: null, basis_unit: "g", energy_kcal: 480, protein_g: 20, carbs_g: 5, fat_g: 33 };
  const catalog = { nutrition: { foods: [food, chia], barcodes: {}, meals: [], recipeNames: ["Skyr-Bowl"] } };
  const local = N.emptyLocal();
  const row = N.saveItemsAsDish(catalog, local, "Skyr-Bowl", [{ foodId: "f1", amount: 500 }, { foodId: "f2", amount: 2 }], { uuid: id, now });
  assert.equal(row.kind, "meal", "1 Portion = Vorlage wie am PC");
  assert.equal(row.name, "Skyr-Bowl (2)", "Name wird eindeutig");
  assert.deepEqual(local.recipes[row.id].items.map((i) => [i.food_id, i.amount]), [["f1", 500], ["f2", 2]]);
  assert.throws(() => N.saveItemsAsDish(catalog, local, "", [{ foodId: "f1", amount: 5 }], { uuid: id, now }), /Namen/);
  assert.throws(() => N.saveItemsAsDish(catalog, local, "X", [], { uuid: id, now }), /mindestens ein/);
  const meal = N.copyItemsTo(catalog, local, { date: "2026-11-20", mealType: "dinner", items: [{ foodId: "f2", amount: 2 }] }, { uuid: id, now });
  assert.equal(meal.row.date, "2026-11-20");
  assert.equal(meal.row.meal_type, "dinner");
  assert.equal(meal.items.length, 1);
  assert.equal(meal.items[0].amount, 2);
  assert.throws(() => N.copyItemsTo(catalog, local, { date: "20.11.", mealType: "dinner", items: [{ foodId: "f2", amount: 2 }] }, { uuid: id, now }), /Datum/);
  assert.throws(() => N.copyItemsTo(catalog, local, { date: "2026-11-20", mealType: "x", items: [{ foodId: "f2", amount: 2 }] }, { uuid: id, now }), /Mahlzeit/);
});
