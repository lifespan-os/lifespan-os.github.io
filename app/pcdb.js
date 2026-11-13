// LIFESPAN OS Mobil – Rechenkern wie am PC (1.5.0). Liest die Tabellen der Exportdatei und die
// Einträge vom Handy und rechnet wie der Rust-Kern der Desktop-App (src-tauri/core/src/repo):
// Tagesziele (goals.rs), Mahlzeiten und Tagessummen (meal.rs), Fasttracking (fasttrack.rs),
// Supplements (supplement.rs), Wasser (water.rs), Schritte (neat.rs), Energieverbrauch mit
// Training, Cardio und Kalibrierung (energy.rs, cardio.rs). Reine Logik, mit Tests.

// ------------------------------------------------------------------ Hilfen

/** Rundung wie Rust `f64::round` (halbe Werte von der Null weg). */
export const rround = (x) => Math.sign(x) * Math.round(Math.abs(x));
const DAY_MS = 86400000;
const toUtc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso, n) => fromUtc(toUtc(iso) + n * DAY_MS);
export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
const groupBy = (list, key) => {
  const m = new Map();
  for (const r of list) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const WEIGHT_METRIC_ID = "00000000-0000-7000-8000-000000000001";
export const BODY_FAT_METRIC_ID = "00000000-0000-7000-8000-000000000002";

// ------------------------------------------------------------------ Daten aus dem Export

/** Tabellen, die die Handy-App für die Ansichten wie am PC aufhebt (vollständig). */
export const KEEP_TABLES = [
  "meal",
  "meal_item",
  "meal_value",
  "meal_day",
  "nutrition_day_entry",
  "nutrition_day_value",
  "supplement_intake",
  "supplement_intake_item",
  "supplement_stack",
  "water_intake",
  "caffeine_intake",
  "daily_goal",
  "profile",
  "neat_day",
  "workout",
  "workout_exercise",
  "workout_set",
  "sleep_log",
  "sleep_nap",
  "recovery_log",
  "lifestyle_note",
  "training_day_status",
  "hrt_entry",
  "hrt_product",
  "grip_strength_measurement",
  "training_plan_slot",
];

/** Einstellungen, die die Ansichten brauchen (keine Strichcodes). */
const KEEP_SETTINGS = (key) => !String(key).startsWith("strichcode.");

/**
 * Teil der Exportdatei für die Ansichten wie am PC. Supplements und ihre Nährwerte nur, soweit sie
 * in Einnahmen oder Stacks vorkommen; archivierte Lebensmittel nur, soweit Mahlzeiten sie nutzen.
 */
export function pcFromRows(rows) {
  const pc = {};
  for (const name of KEEP_TABLES) pc[name] = rows(name);
  pc.settings = rows("settings").filter((s) => KEEP_SETTINGS(s.key));
  const used = new Set([
    ...rows("supplement_intake_item").map((i) => i.supplement_id),
    ...rows("supplement_stack_item").map((i) => i.supplement_id),
  ]);
  pc.supplement_stack_item = rows("supplement_stack_item");
  pc.supplement = rows("supplement")
    .filter((s) => used.has(s.id))
    .map(({ id, name, manufacturer, unit, serving_amount, daily_dose, archived }) => ({
      id,
      name,
      manufacturer,
      unit,
      serving_amount,
      daily_dose,
      archived,
    }));
  pc.supplement_value = rows("supplement_value")
    .filter((v) => used.has(v.supplement_id))
    .map(({ supplement_id, nutrient, amount }) => ({ supplement_id, nutrient, amount }));
  pc.nutrient_field = rows("nutrient_field").map(({ key, label, unit, category, position }) => ({ key, label, unit, category, position }));
  const mealFoods = new Set(rows("meal_item").map((i) => i.food_id));
  pc.archived_food = rows("food").filter((f) => f.archived && mealFoods.has(f.id));
  // Overview (1.6.0): Messgrößen auch archiviert (Einheit, Nachkommastellen, Kategorie) und nur
  // das Datum der Check-In-Fotos (für die Erinnerungen), ohne Bilder
  pc.body_metric = rows("body_metric").map(({ id, name, unit, decimals, category, position }) => ({ id, name, unit, decimals, category, position }));
  pc.checkin_date = [...new Set(rows("checkin_photo").map((c) => c.date))].map((date) => ({ date }));
  return pc;
}

// ------------------------------------------------------------------ Zusammengeführte Daten

/**
 * Daten vom PC und vom Handy zusammenführen (gleiche ID: der Stand vom Handy gilt).
 * `phone` = { foods: Map, meals: [{row, items}], water: {rows, deleted}, body: [row],
 *   workouts: {workout, workout_exercise, workout_set}, exercises: [row],
 *   logs: {sleep: [row], naps: [row], recovery: [row], deleted: [{table, id}]} }
 */
export function makeDb(catalog, phone = {}) {
  const pc = catalog?.pc ?? {};
  const t = (name) => pc[name] ?? [];
  const byId = (list) => new Map(list.map((r) => [r.id, r]));
  const merge = (pcList, phoneList = [], removed = new Set()) => {
    const m = byId(pcList.filter((r) => !removed.has(r.id)));
    for (const r of phoneList) m.set(r.id, r);
    return [...m.values()];
  };

  // Lebensmittel
  const foods = new Map();
  for (const f of t("archived_food")) foods.set(f.id, f);
  for (const f of catalog?.nutrition?.foods ?? []) foods.set(f.id, f);
  for (const [id, f] of phone.foods ?? []) foods.set(id, f);

  // Mahlzeiten
  const phoneMeals = phone.meals ?? [];
  const meals = merge(t("meal"), phoneMeals.map((m) => m.row));
  const mealItems = merge(t("meal_item"), phoneMeals.flatMap((m) => m.items));

  // Wasser
  const water = phone.water ?? {};
  const waterRows = merge(t("water_intake"), water.rows ?? [], new Set(water.deleted ?? []));

  // Training
  const pw = phone.workouts ?? {};
  const workouts = merge(t("workout"), pw.workout ?? []);
  const wex = merge(t("workout_exercise"), pw.workout_exercise ?? []);
  const wset = merge(t("workout_set"), pw.workout_set ?? []);
  const exercises = new Map([...(catalog?.exercises ?? []), ...(phone.exercises ?? [])].map((e) => [e.id, e]));
  const sports = new Map((catalog?.sports ?? []).map((s) => [s.id, s]));

  // Körperwerte: je Messgröße und Tag ein Wert, neuerer Stand gewinnt
  const bodyByKey = new Map();
  for (const r of [...(catalog?.body?.measurements ?? []), ...(phone.body ?? [])]) {
    const k = `${r.metric_id}|${r.date}`;
    const old = bodyByKey.get(k);
    if (!old || String(r.updated_at) >= String(old.updated_at)) bodyByKey.set(k, r);
  }
  const body = [...bodyByKey.values()];

  // Schlaf und Regeneration (1.7.0): Einträge vom Handy ersetzen die vom PC (gleiche ID),
  // Löschvermerke vom Handy blenden Einträge vom PC aus
  const logs = phone.logs ?? {};
  const gone = (table) => new Set((logs.deleted ?? []).filter((d) => d.table === table).map((d) => d.id));
  const sleep = merge(t("sleep_log"), logs.sleep ?? [], gone("sleep_log"));
  const naps = merge(t("sleep_nap"), logs.naps ?? [], gone("sleep_nap"));
  const recovery = merge(t("recovery_log"), logs.recovery ?? [], gone("recovery_log"));

  const settings = new Map(t("settings").map((s) => [s.key, s.value]));
  for (const [k, v] of Object.entries(phone.settings ?? {})) settings.set(k, v);

  return {
    foods,
    meals,
    mealsByDate: groupBy(meals, "date"),
    itemsByMeal: groupBy(mealItems, "meal_id"),
    valuesByMeal: groupBy(t("meal_value"), "meal_id"),
    mealDays: new Set(t("meal_day").map((d) => d.date)),
    fastByDate: groupBy(t("nutrition_day_entry"), "date"),
    fastValues: groupBy(t("nutrition_day_value"), "entry_id"),
    intakesByDate: groupBy(t("supplement_intake"), "date"),
    intakeItems: groupBy(t("supplement_intake_item"), "intake_id"),
    supplements: byId(t("supplement")),
    supValues: groupBy(t("supplement_value"), "supplement_id"),
    nutrientFields: t("nutrient_field"),
    water: waterRows,
    waterByDate: groupBy(waterRows, "date"),
    caffeine: t("caffeine_intake"),
    goals: [...t("daily_goal")].sort((a, b) => cmp(b.valid_from, a.valid_from)),
    profile: t("profile")[0] ?? null,
    neatByDate: new Map(t("neat_day").map((d) => [d.date, d])),
    workouts,
    wexByWorkout: groupBy(wex, "workout_id"),
    setsByWex: groupBy(wset, "workout_exercise_id"),
    exercises,
    sports,
    body,
    bodyByMetric: groupBy(body, "metric_id"),
    settings,
    sleep,
    naps,
    recovery,
    pc,
  };
}

// ------------------------------------------------------------------ Tagesziele (goals.rs)

/** Ziele, die an einem Tag gelten (wie `goals::for_date`), in der Form der Desktop-App. */
export function goalFor(db, date) {
  const r = db.goals.find((g) => g.valid_from <= date);
  if (!r) return null;
  return {
    id: r.id,
    validFrom: r.valid_from,
    energyKcal: r.energy_kcal ?? null,
    proteinG: r.protein_g ?? null,
    carbsG: r.carbs_g ?? null,
    fatG: r.fat_g ?? null,
    sleepMin: r.sleep_min ?? null,
    weightKg: r.weight_kg ?? null,
    steps: r.steps ?? null,
    notes: r.notes ?? null,
    energyMode: r.energy_mode ?? "fixed",
    energyAdjustKcal: r.energy_adjust_kcal ?? null,
    energyAdjustPercent: r.energy_adjust_percent ?? null,
    calibrate: Boolean(r.calibrate),
    proteinGPerKg: r.protein_g_per_kg ?? null,
    proteinPct: r.protein_pct ?? null,
    carbsPct: r.carbs_pct ?? null,
    fatPct: r.fat_pct ?? null,
    waterL: r.water_l ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ------------------------------------------------------------------ Mahlzeiten (meal.rs)

const MEAL_ORDER = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };
const mealRank = (m) => MEAL_ORDER[m.meal_type] ?? 4;

function mealItem(db, it) {
  const f = db.foods.get(it.food_id);
  const per = (col) => (f && f[col] !== null && f[col] !== undefined ? (it.amount / 100) * f[col] : null);
  return {
    id: it.id,
    foodId: it.food_id,
    foodName: f?.name ?? "Unbekanntes Lebensmittel",
    foodBrand: f?.brand ? f.brand : null,
    basisUnit: f?.basis_unit ?? "g",
    amount: it.amount,
    energyKcal: per("energy_kcal") ?? 0,
    proteinG: per("protein_g") ?? 0,
    carbsG: per("carbs_g") ?? 0,
    fatG: per("fat_g") ?? 0,
    fiberG: per("fiber_g"),
    sugarG: per("sugar_g"),
    saturatedFatG: per("saturated_fat_g"),
    saltG: per("salt_g"),
    portionName: f?.portion_name ?? null,
    portionAmount: f?.portion_amount ?? null,
    position: it.position ?? 0,
    known: Boolean(f),
  };
}

/** Eine Mahlzeit wie `meal::get` (Lebensmittel nur, wenn bekannt – wie der JOIN am PC). */
export function mealOf(db, row) {
  const items = (db.itemsByMeal.get(row.id) ?? [])
    .map((it) => mealItem(db, it))
    .filter((i) => i.known)
    .sort((a, b) => a.position - b.position);
  const values = {};
  for (const v of db.valuesByMeal.get(row.id) ?? []) values[v.nutrient] = v.amount;
  const sum = (key, field) => items.reduce((s, i) => s + i[field], 0) + (values[key] ?? 0);
  return {
    id: row.id,
    date: row.date,
    mealType: row.meal_type,
    name: row.name ?? null,
    time: row.time ?? null,
    notes: row.notes ?? null,
    items,
    values,
    energyKcal: sum("energy", "energyKcal"),
    proteinG: sum("protein", "proteinG"),
    carbsG: sum("carbs", "carbsG"),
    fatG: sum("fat", "fatG"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Mahlzeiten eines Tages wie `meal::get_day`. */
export function mealDay(db, date) {
  const rows = [...(db.mealsByDate.get(date) ?? [])].sort(
    (a, b) => mealRank(a) - mealRank(b) || cmp(a.created_at, b.created_at) || cmp(a.id, b.id),
  );
  return { date, customized: db.mealDays.has(date), meals: rows.map((r) => mealOf(db, r)) };
}

/** Fasttracking-Eintrag eines Tages (Tageswerte) oder null. */
export function fastDay(db, date) {
  const e = (db.fastByDate.get(date) ?? [])[0];
  if (!e) return null;
  const values = {};
  for (const v of db.fastValues.get(e.id) ?? []) values[v.nutrient] = (values[v.nutrient] ?? 0) + v.amount;
  return { id: e.id, date, notes: e.notes ?? null, values };
}

/** Supplement-Einnahmen eines Tages wie `supplement::list_intakes` (mit Nährwerten). */
export function intakesOn(db, date) {
  const meals = new Map((db.mealsByDate.get(date) ?? []).map((m) => [m.id, m]));
  return [...(db.intakesByDate.get(date) ?? [])]
    .sort((a, b) => (a.time === null) - (b.time === null) || cmp(a.time ?? "", b.time ?? "") || cmp(a.created_at, b.created_at) || cmp(a.id, b.id))
    .map((i) => {
      const items = [...(db.intakeItems.get(i.id) ?? [])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .flatMap((it) => {
          const s = db.supplements.get(it.supplement_id);
          if (!s) return [];
          const factor = it.amount / s.serving_amount;
          const nutrients = {};
          for (const v of db.supValues.get(s.id) ?? []) nutrients[v.nutrient] = v.amount * factor;
          return [{ id: it.id, supplementId: s.id, name: s.name, unit: s.unit, amount: it.amount, nutrients }];
        });
      const nutrients = {};
      for (const it of items) for (const [k, v] of Object.entries(it.nutrients)) nutrients[k] = (nutrients[k] ?? 0) + v;
      const meal = i.meal_id ? meals.get(i.meal_id) : null;
      return {
        id: i.id,
        date: i.date,
        stackId: i.stack_id ?? null,
        name: i.name,
        timing: i.timing ?? "independent",
        mealId: meal ? i.meal_id : null,
        mealType: meal?.meal_type ?? null,
        mealName: meal?.name ?? null,
        time: i.time ?? null,
        notes: i.notes ?? null,
        items,
        nutrients,
      };
    });
}

const MACRO_KEYS = { energy: "energyKcal", protein: "proteinG", carbs: "carbsG", fat: "fatG" };

/**
 * Tagessummen im Zeitraum wie `meal::daily_totals`: Mahlzeiten (nur mit Inhalt), Fasttracking und
 * Supplements. Tage ohne Einträge fehlen.
 */
export function dailyTotals(db, from, to) {
  const days = new Map();
  const day = (date) => {
    if (!days.has(date)) days.set(date, { date, energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, mealCount: 0, fasttracking: false, supplements: false });
    return days.get(date);
  };
  for (const [date, rows] of db.mealsByDate) {
    if (date < from || date > to) continue;
    for (const row of rows) {
      const items = (db.itemsByMeal.get(row.id) ?? []).filter((it) => db.foods.has(it.food_id));
      const values = db.valuesByMeal.get(row.id) ?? [];
      if (!items.length && !values.length) continue;
      const d = day(date);
      d.mealCount += 1;
      for (const it of items) {
        const f = db.foods.get(it.food_id);
        d.energyKcal += (it.amount / 100) * f.energy_kcal;
        d.proteinG += (it.amount / 100) * f.protein_g;
        d.carbsG += (it.amount / 100) * f.carbs_g;
        d.fatG += (it.amount / 100) * f.fat_g;
      }
      for (const v of values) if (MACRO_KEYS[v.nutrient]) d[MACRO_KEYS[v.nutrient]] += v.amount;
    }
  }
  for (const [date, entries] of db.fastByDate) {
    if (date < from || date > to) continue;
    const d = day(date);
    d.fasttracking = true;
    for (const e of entries) for (const v of db.fastValues.get(e.id) ?? []) if (MACRO_KEYS[v.nutrient]) d[MACRO_KEYS[v.nutrient]] += v.amount;
  }
  for (const [date, intakes] of db.intakesByDate) {
    if (date < from || date > to) continue;
    let any = false;
    const sums = { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    for (const i of intakes) {
      for (const it of db.intakeItems.get(i.id) ?? []) {
        const s = db.supplements.get(it.supplement_id);
        if (!s) continue;
        for (const v of db.supValues.get(s.id) ?? []) {
          if (!MACRO_KEYS[v.nutrient]) continue;
          any = true;
          sums[MACRO_KEYS[v.nutrient]] += (v.amount * it.amount) / s.serving_amount;
        }
      }
    }
    if (!any) continue;
    const d = day(date);
    d.supplements = true;
    for (const k of Object.keys(sums)) d[k] += sums[k];
  }
  return [...days.values()].sort((a, b) => cmp(a.date, b.date));
}

// ------------------------------------------------------------------ Wasser (water.rs)

export const GLASS_SIZES_ML = [200, 330, 500, 1000];
export const DEFAULT_GLASS_ML = 200;
export const MAX_GLASSES = 60;

export function glassMl(db) {
  const v = Number.parseInt(db.settings.get("water_glass_ml") ?? "", 10);
  return GLASS_SIZES_ML.includes(v) ? v : DEFAULT_GLASS_ML;
}

/** Wasser eines Tages wie `water::get_day`. */
export function waterDay(db, date) {
  const glasses = [...(db.waterByDate.get(date) ?? [])]
    .sort((a, b) => cmp(a.created_at, b.created_at) || cmp(a.id, b.id))
    .map((g) => ({ id: g.id, amountMl: g.amount_ml, time: g.time ?? null }));
  const drinks = db.caffeine
    .filter((c) => c.date === date && c.in_water && c.ml !== null && c.ml !== undefined)
    .sort((a, b) => cmp(a.time, b.time) || cmp(a.created_at, b.created_at))
    .map((c) => ({ id: c.id, label: c.label, amountMl: rround(c.ml), time: c.time }));
  return {
    date,
    glassMl: glassMl(db),
    glasses,
    drinks,
    totalMl: glasses.reduce((s, g) => s + g.amountMl, 0) + drinks.reduce((s, d) => s + d.amountMl, 0),
  };
}

// ------------------------------------------------------------------ Körperwerte, Schritte (body.rs, neat.rs)

/** Letzter Messwert einer Messgröße bis einschließlich `to` (ab `from`), sonst null. */
export function latestMeasurement(db, metricId, to, from = null) {
  let best = null;
  for (const r of db.bodyByMetric.get(metricId) ?? []) {
    if (r.date > to || (from && r.date < from)) continue;
    if (!best || r.date > best.date) best = r;
  }
  return best;
}

export const KCAL_PER_STEP_AND_KG = 0.0004;
export const stepKcal = (steps, kg) => rround(steps * kg * KCAL_PER_STEP_AND_KG);

/** Schritt-Energie eines Tages wie `neat::step_energy`. */
export function stepEnergy(db, date) {
  const steps = db.neatByDate.get(date)?.steps ?? null;
  const w = latestMeasurement(db, WEIGHT_METRIC_ID, date);
  const weightKg = w ? w.value : null;
  return {
    date,
    steps,
    weightKg,
    weightDate: w ? w.date : null,
    weighedOnDate: w ? w.date === date : false,
    kcal: steps !== null && weightKg !== null ? stepKcal(steps, weightKg) : null,
  };
}

// ------------------------------------------------------------------ Cardio (cardio.rs)

const KINDS = ["run", "walk", "cycle", "row", "ski", "swim", "elliptical", "stairs", "other"];
const KEYWORDS = [
  ["swim", ["schwimm", "kraul", "swim", "aquafit"]],
  ["row", ["ruder", "rowing", "row erg", "kanu", "kajak", "paddel"]],
  ["ski", ["skierg", "ski-erg", "ski erg", "langlauf"]],
  ["cycle", ["radfahr", "fahrrad", "rennrad", "radsport", "radtour", "bahnrad", "ergometer", "bike", "biken", "cycling", "spinning", "velo", "bmx", "gravel"]],
  ["elliptical", ["crosstrainer", "cross-trainer", "ellip"]],
  ["stairs", ["stepper", "treppe", "stair"]],
  ["walk", ["gehen", "walking", "wander", "nordic", "spazier"]],
  ["run", ["lauf", "läuf", "jogg", "run", "sprint", "trail"]],
];
export function inferKind(text) {
  const t = String(text).toLowerCase();
  for (const [kind, words] of KEYWORDS) if (words.some((w) => t.includes(w))) return kind;
  return "other";
}
export function effectiveKind(category, stored, name, equipment, sportCategory) {
  if (category !== "cardio") return null;
  if (stored && KINDS.includes(stored)) return stored;
  return inferKind(`${name} ${equipment ?? ""} ${sportCategory ?? ""}`);
}

const REST_VO2 = 3.5;
const ROW_EFFICIENCY = 0.2;
const HR_MIN_FOR_FORMULA = 90;
const RUN_MIN_SPEED = 100;
const KIND_METS = {
  walk: [3.0, 4.3, 5.3],
  run: [7.0, 9.8, 11.8],
  cycle: [4.0, 7.0, 10.0],
  row: [4.8, 7.0, 8.5],
  ski: [6.8, 9.0, 12.5],
  swim: [5.8, 8.3, 9.8],
  elliptical: [4.0, 5.0, 7.5],
  stairs: [6.0, 9.0, 11.0],
};
const kindMets = (k) => KIND_METS[k] ?? [3.5, 5.0, 8.0];
const intensity = (rpe) => (rpe === null || rpe === undefined ? 1 : rpe < 4.5 ? 0 : rpe < 7.5 ? 1 : 2);
const cycleSpeedMet = (v) => (v < 16 ? 4.0 : v < 19.3 ? 6.8 : v < 22.5 ? 8.0 : v < 25.7 ? 10.0 : v < 30.6 ? 12.0 : 15.8);
const swimSpeedMet = (v) => (v < 30 ? 5.8 : v < 45 ? 8.3 : 9.8);
const netFromMet = (met, kg, minutes) => (Math.max(met - 1, 0) * kg * minutes) / 60;
function grade(m, distance) {
  if (m.incline_pct !== null && m.incline_pct !== undefined) return Math.max(m.incline_pct / 100, 0);
  if (m.elevation_m !== null && m.elevation_m !== undefined && distance && distance > 0) return Math.min(Math.max(m.elevation_m / distance, 0), 0.4);
  return 0;
}
const walkRunNetVo2 = (running, v, g) => (running ? 0.2 * v + 0.9 * v * g : 0.1 * v + 1.8 * v * g);
function keytel(sex, hr, kg, age) {
  const kj = sex === "female" ? -20.4022 + 0.4472 * hr - 0.1263 * kg + 0.074 * age : -55.0969 + 0.6309 * hr + 0.1988 * kg + 0.2017 * age;
  return kj / 4.184;
}

/** Verbrauch eines Blocks wie `cardio::block_energy`; `set` = Zeile von workout_set. */
export function blockEnergy(kind, set, sessionRpe, person) {
  const kg = person.weightKg;
  const distance = set.distance_m > 0 ? set.distance_m : null;
  const minutes = set.duration_seconds > 0 ? set.duration_seconds / 60 : null;
  const fromMet = (method, met, min) => ({ method, met, kcal: netFromMet(met, kg, min) });
  if (minutes === null) {
    if (distance !== null && (kind === "run" || kind === "walk")) {
      const perM = walkRunNetVo2(kind === "run", 1, grade(set, distance));
      return { method: "distance", met: 0, kcal: ((perM * distance * kg) / 1000) * 5 };
    }
    return null;
  }
  const min = minutes;
  let power = set.power_w > 0 ? set.power_w : null;
  if (power === null && (kind === "row" || kind === "ski") && distance !== null) power = 2.8 / ((min * 60) / distance) ** 3;
  if (power !== null && ["cycle", "row", "ski", "elliptical", "stairs", "other"].includes(kind)) {
    const met = kind === "cycle" ? ((10.8 * power) / kg + 7) / REST_VO2 : ((power / ROW_EFFICIENCY) * 60) / 4184 / (kg / 60);
    return fromMet("power", met, min);
  }
  if (distance !== null && (kind === "run" || kind === "walk")) {
    const v = distance / min;
    const running = kind === "run" && v >= RUN_MIN_SPEED;
    return fromMet("pace", (walkRunNetVo2(running, v, grade(set, distance)) + REST_VO2) / REST_VO2, min);
  }
  if (set.hr_avg !== null && set.hr_avg !== undefined && person.sex && person.age !== null && set.hr_avg >= HR_MIN_FOR_FORMULA) {
    const met = keytel(person.sex, set.hr_avg, kg, person.age) / (kg / 60);
    if (met > 1) return fromMet("heartRate", met, min);
  }
  if (distance !== null) {
    if (kind === "cycle") return fromMet("speed", cycleSpeedMet((distance / min) * 0.06), min);
    if (kind === "swim") return fromMet("speed", swimSpeedMet(distance / min), min);
  }
  return fromMet("kind", kindMets(kind)[intensity(set.rpe ?? sessionRpe)], min);
}

// ------------------------------------------------------------------ Training (workout.rs)

/** Einheit mit Übungen und Sätzen (für Energie und Übersicht). */
export function workoutOf(db, w) {
  const exercises = [...(db.wexByWorkout.get(w.id) ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((we) => {
      const ex = db.exercises.get(we.exercise_id);
      const sport = ex?.sport_id ? db.sports.get(ex.sport_id) : null;
      const category = ex?.category ?? "strength";
      return {
        id: we.id,
        exerciseId: we.exercise_id,
        exerciseName: ex?.name ?? "Übung",
        exerciseCategory: category,
        muscleGroup: ex?.muscle_group ?? null,
        machineId: ex?.machine_id ?? null,
        cardioKind: effectiveKind(category, ex?.cardio_kind ?? null, ex?.name ?? "", ex?.equipment ?? null, sport?.category ?? null),
        gripWidth: we.grip_width ?? null,
        gripPosition: we.grip_position ?? null,
        sets: [...(db.setsByWex.get(we.id) ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      };
    });
  return {
    id: w.id,
    date: w.date,
    startTime: w.start_time ?? null,
    title: w.title,
    durationMin: w.duration_min ?? null,
    perceivedExertion: w.perceived_exertion ?? null,
    status: w.status ?? "done",
    notes: w.notes ?? null,
    createdAt: w.created_at,
    exercises,
  };
}

/** Einheiten eines Zeitraums wie `workout::list` (neueste zuerst). */
export function workoutsBetween(db, from, to) {
  return db.workouts
    .filter((w) => (!from || w.date >= from) && (!to || w.date <= to))
    .sort((a, b) => cmp(b.date, a.date) || cmp(b.start_time ?? "", a.start_time ?? "") || cmp(b.created_at, a.created_at));
}

// ------------------------------------------------------------------ Energieverbrauch (energy.rs)

export const BASELINE_FACTOR = 1.2;
export const KCAL_PER_KG_BODY_MASS = 7700;
export const BODY_FAT_MAX_AGE_DAYS = 60;
export const CALIBRATION_WINDOW_DAYS = 28;
export const CALIBRATION_MIN_DAYS = 14;
export const CALIBRATION_MIN_SPAN_DAYS = 14;
export const CALIBRATION_MIN_INTAKE_SHARE = 0.5;
export const TREND_WINDOW_DAYS = 7;
export const STRENGTH_FACTOR = 0.4;
const MINUTE_ACTIVITIES = [
  ["standingMin", "standing_min", "Stehen", 1.5],
  ["cleaningMin", "cleaning_min", "Reinigungsarbeiten", 3.3],
  ["gardeningMin", "gardening_min", "Gartenarbeit", 3.8],
  ["fidgetingMin", "fidgeting_min", "Zappeln (Fidgeting)", 1.4],
  ["officeMin", "office_min", "Arbeit (Büro)", 1.0],
  ["physicalMin", "physical_min", "Arbeit (Physisch)", 3.5],
  ["otherMin", "other_min", "Sonstiges", 3.0],
];
export const trainingMet = (rpe) => (rpe === null || rpe === undefined ? 3.5 : rpe <= 3 ? 3.0 : rpe <= 5 ? 3.5 : rpe <= 7 ? 5.0 : 6.0);
export const netKcal = (met, kg, minutes) => (Math.max(met - 1, 0) * kg * minutes) / 60;
export const mifflin = (sex, kg, cm, age) => 10 * kg + 6.25 * cm - 5 * age + (sex === "female" ? -161 : 5);
export const katch = (kg, fat) => 370 + 21.6 * kg * (1 - fat / 100);

export function ageOn(profile, date) {
  if (profile.birth_date) {
    let years = +date.slice(0, 4) - +profile.birth_date.slice(0, 4);
    if (date.slice(5) < profile.birth_date.slice(5)) years -= 1;
    return years;
  }
  return +date.slice(0, 4) - profile.birth_year;
}

/** Mehrverbrauch einer Einheit wie `energy::training_energy` (null ohne Dauer und Cardio). */
export function trainingEnergy(w, person) {
  const sessionRpe = w.perceivedExertion;
  const cardio = [];
  let cardioSeconds = 0;
  let cardioKcal = 0;
  let hasOther = w.exercises.length === 0;
  let strength = false;
  for (const ex of w.exercises) {
    if (!ex.cardioKind) {
      hasOther = true;
      strength = strength || ex.exerciseCategory === "strength";
      continue;
    }
    const c = { exerciseName: ex.exerciseName, kind: ex.cardioKind, blocks: 0, durationSeconds: 0, distanceM: 0, methods: [], kcal: 0, deviceKcal: null };
    let kcal = 0;
    for (const s of ex.sets) {
      if (s.device_kcal !== null && s.device_kcal !== undefined) c.deviceKcal = (c.deviceKcal ?? 0) + s.device_kcal;
      const e = blockEnergy(ex.cardioKind, s, sessionRpe, person);
      if (!e) continue;
      c.blocks += 1;
      c.durationSeconds += s.duration_seconds ?? 0;
      c.distanceM += s.distance_m ?? 0;
      if (!c.methods.includes(e.method)) c.methods.push(e.method);
      kcal += e.kcal;
    }
    if (c.blocks > 0) {
      c.kcal = rround(kcal);
      cardioSeconds += c.durationSeconds;
      cardioKcal += kcal;
      cardio.push(c);
    }
  }
  if (!cardio.length) hasOther = true;
  if (!cardio.length && w.durationMin === null) return null;
  const met = trainingMet(w.perceivedExertion);
  const factor = strength ? STRENGTH_FACTOR : 1;
  const otherMinutes = w.durationMin !== null && hasOther ? rround(Math.max(w.durationMin * 60 - cardioSeconds, 0) / 60) : 0;
  const other = netKcal(met, person.weightKg, otherMinutes) * factor;
  return {
    workoutId: w.id,
    title: w.title,
    durationMin: w.durationMin,
    perceivedExertion: w.perceivedExertion,
    met,
    strength,
    factor,
    otherMinutes,
    otherKcal: rround(other),
    cardio,
    kcal: rround(other + cardioKcal),
  };
}

function formula(db, date) {
  const profile = db.profile;
  const step = stepEnergy(db, date);
  const weight = step.weightKg;
  const missing = [];
  const fat = latestMeasurement(db, BODY_FAT_METRIC_ID, date, addDays(date, -BODY_FAT_MAX_AGE_DAYS));
  const sex = profile?.sex ?? null;
  const age = profile ? ageOn(profile, date) : null;
  const heightCm = profile ? profile.height_cm : null;
  if (!profile) missing.push("Profil mit Körpergröße und Geburtsdatum (Settings → Profil)");
  if (weight === null) missing.push("Körpergewicht (Body & Longevity)");
  let bmrMethod = null;
  let bmr = null;
  if (weight !== null && fat) {
    bmrMethod = "katch";
    bmr = katch(weight, fat.value);
  } else if (weight !== null && profile) {
    if (profile.sex) {
      bmrMethod = "mifflin";
      bmr = mifflin(profile.sex, weight, profile.height_cm, ageOn(profile, date));
    } else missing.push("Geschlecht im Profil (oder ein Körperfettanteil)");
  }
  bmr = bmr === null ? null : rround(bmr);
  const baseline = bmr === null ? null : rround(bmr * BASELINE_FACTOR);
  const activities = [];
  const neat = db.neatByDate.get(date);
  if (neat && weight !== null) {
    for (const [key, col, label, met] of MINUTE_ACTIVITIES) {
      const min = neat[col];
      if (min && min > 0) activities.push({ key, label, minutes: min, met, kcal: rround(netKcal(met, weight, min)) });
    }
  }
  const activityKcal = activities.reduce((s, a) => s + a.kcal, 0);
  const trainings = [];
  let withoutDuration = 0;
  for (const row of [...workoutsBetween(db, date, date)].reverse()) {
    const w = workoutOf(db, row);
    if (weight === null) {
      if (w.durationMin === null) withoutDuration += 1;
      continue;
    }
    const t = trainingEnergy(w, { weightKg: weight, sex, age });
    if (t) trainings.push(t);
    else withoutDuration += 1;
  }
  const trainingKcal = trainings.reduce((s, t) => s + t.kcal, 0);
  const total = baseline === null ? null : baseline + (step.kcal ?? 0) + activityKcal + trainingKcal;
  return { sex, age, heightCm, fat, bmrMethod, bmr, baseline, step, activities, activityKcal, trainings, trainingKcal, withoutDuration, total, missing };
}

/** Gewichtstrend an einem Tag: Mittel der Wiegungen der letzten 7 Kalendertage. */
export function trendAt(weights, date) {
  const start = addDays(date, -(TREND_WINDOW_DAYS - 1));
  const values = weights.filter((w) => w.date >= start && w.date <= date).map((w) => w.value);
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function calibrate(db, date, cache) {
  const to = addDays(date, -1);
  const from = addDays(date, -CALIBRATION_WINDOW_DAYS);
  let intakeSum = 0;
  let formulaSum = 0;
  let used = 0;
  for (const d of dailyTotals(db, from, to)) {
    if (!cache.has(d.date)) cache.set(d.date, formula(db, d.date).total);
    const total = cache.get(d.date);
    if (total === null) continue;
    if (total > 0 && d.energyKcal >= total * CALIBRATION_MIN_INTAKE_SHARE) {
      intakeSum += d.energyKcal;
      formulaSum += total;
      used += 1;
    }
  }
  if (used < CALIBRATION_MIN_DAYS) {
    return { error: `Für die Kalibrierung werden mindestens ${CALIBRATION_MIN_DAYS} vollständig erfasste Ernährungstage in den letzten ${CALIBRATION_WINDOW_DAYS} Tagen benötigt (bisher ${used}).` };
  }
  const weights = (db.bodyByMetric.get(WEIGHT_METRIC_ID) ?? [])
    .filter((m) => m.date >= addDays(from, -(TREND_WINDOW_DAYS - 1)) && m.date <= to)
    .map((m) => ({ date: m.date, value: m.value }))
    .sort((a, b) => cmp(a.date, b.date));
  const inWindow = weights.map((w) => w.date).filter((d) => d >= from && d <= to);
  if (!inWindow.length) return { error: "Für die Kalibrierung werden Wiegungen in den letzten 28 Tagen benötigt." };
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const span = daysBetween(first, last);
  if (span < CALIBRATION_MIN_SPAN_DAYS) {
    return { error: `Für die Kalibrierung werden Wiegungen über mindestens ${CALIBRATION_MIN_SPAN_DAYS} Tage benötigt (bisher ${span}).` };
  }
  const startKg = trendAt(weights, first);
  const endKg = trendAt(weights, last);
  if (startKg === null || endKg === null) return { error: "Kein Gewichtstrend verfügbar." };
  const avgIntake = intakeSum / used;
  const avgFormula = formulaSum / used;
  const measured = avgIntake - ((endKg - startKg) * KCAL_PER_KG_BODY_MASS) / span;
  const rawFactor = measured / avgFormula;
  const factor = Math.min(Math.max(rawFactor, 0.75), 1.25);
  return {
    value: {
      from,
      to,
      daysUsed: used,
      avgIntakeKcal: rround(avgIntake),
      avgFormulaKcal: rround(avgFormula),
      trendStartDate: first,
      trendStartKg: rround(startKg * 10) / 10,
      trendEndDate: last,
      trendEndKg: rround(endKg * 10) / 10,
      measuredKcal: rround(measured),
      rawFactor,
      factor: rround(factor * 1000) / 1000,
      limited: Math.abs(rawFactor - factor) > Number.EPSILON,
    },
  };
}

const pal = (total, bmr) => (total !== null && bmr !== null && bmr > 0 ? rround((total / bmr) * 100) / 100 : null);

/** Energieverbrauch eines Tages wie `energy::for_date` (Form `EnergyDay` der Desktop-App). */
export function energyFor(db, date, cache = new Map()) {
  const f = formula(db, date);
  let calibration = null;
  let calibrationNote = null;
  if (f.total !== null) {
    const c = calibrate(db, date, cache);
    if (c.value) calibration = c.value;
    else calibrationNote = c.error;
  }
  const calibratedTotal = f.total !== null && calibration ? rround(f.total * calibration.factor) : null;
  return {
    date,
    sex: f.sex,
    age: f.age,
    heightCm: f.heightCm,
    bodyFatPercent: f.fat ? f.fat.value : null,
    bodyFatDate: f.fat ? f.fat.date : null,
    bmrMethod: f.bmrMethod,
    bmrKcal: f.bmr,
    baselineKcal: f.baseline,
    step: f.step,
    activities: f.activities,
    activityKcal: f.activityKcal,
    trainings: f.trainings,
    trainingKcal: f.trainingKcal,
    workoutsWithoutDuration: f.withoutDuration,
    totalKcal: f.total,
    pal: pal(f.total, f.bmr),
    calibration,
    calibrationNote,
    calibratedTotalKcal: calibratedTotal,
    calibratedPal: pal(calibratedTotal, f.bmr),
    missing: f.missing,
  };
}

/** Berechneter Gesamtverbrauch je Tag (ohne Kalibrierung) wie `energy::daily_points`. */
export function dailyPoints(db, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const f = formula(db, d);
    if (f.total !== null) out.push({ date: d, totalKcal: f.total, pal: pal(f.total, f.bmr) });
  }
  return out;
}

// ------------------------------------------------------------------ Wasser am Handy (1.5.0)

/**
 * Am Handy erfasste Gläser: `rows` id → { row, sent }, `deleted` id → { at, sent } (Gläser vom PC,
 * die am Handy herausgenommen wurden), `glass` = { ml, updatedAt, sent } (gewählte Glasgröße).
 */
export function emptyWaterLocal() {
  return { rows: {}, deleted: {}, glass: null };
}

/** Teil für `makeDb`: Zeilen, Löschungen und Einstellung der Glasgröße. */
export function phoneWater(local) {
  const l = local ?? emptyWaterLocal();
  return {
    water: { rows: Object.values(l.rows).map((r) => r.row), deleted: Object.keys(l.deleted) },
    settings: l.glass ? { water_glass_ml: String(l.glass.ml) } : {},
  };
}

/** Gläser eines Tages auf `count` setzen wie `water::set_count` (neue Gläser mit Uhrzeit `time`). */
export function setWaterCount(db, local, date, count, time, { uuid, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Bitte ein gültiges Datum wählen.");
  if (!(Number.isInteger(count) && count >= 0)) throw new Error("Ungültige Zahl der Gläser.");
  if (count > MAX_GLASSES) throw new Error(`Höchstens ${MAX_GLASSES} Gläser je Tag.`);
  const current = waterDay(db, date).glasses;
  const iso = now.toISOString();
  if (count < current.length) {
    for (const g of current.slice(count)) {
      const own = local.rows[g.id];
      delete local.rows[g.id];
      // Glas vom PC oder schon gesendet: Löschvermerk für den Abgleich am PC
      if (!own || own.sent) local.deleted[g.id] = { at: iso, sent: false };
    }
  } else {
    const ml = glassMl(db);
    for (let i = current.length; i < count; i++) {
      // Reihenfolge über created_at: je Glas eine Millisekunde später
      const at = new Date(now.getTime() + (i - current.length)).toISOString();
      const id = uuid();
      local.rows[id] = { row: { id, date, amount_ml: ml, time: time ?? null, created_at: at, updated_at: at }, sent: false };
    }
  }
  return local;
}

/** Glasgröße für neue Gläser (wie `water::save_glass_ml`). */
export function setGlassMl(local, ml, now = new Date()) {
  if (!GLASS_SIZES_ML.includes(ml)) throw new Error("Bitte eine Glasgröße wählen: 0,2 l, 0,33 l, 0,5 l oder 1,0 l.");
  local.glass = { ml, updatedAt: now.toISOString(), sent: false };
  return local;
}

export const unsentWater = (local) =>
  local
    ? Object.values(local.rows).filter((r) => !r.sent).length +
      Object.values(local.deleted).filter((d) => !d.sent).length +
      (local.glass && !local.glass.sent ? 1 : 0)
    : 0;

/** Tabellen für die Rückgabedatei (zusammen mit der Ernährung). */
export function waterTables(local, { all = false } = {}) {
  if (!local) return {};
  const out = {};
  const rows = Object.values(local.rows).filter((r) => all || !r.sent).map((r) => r.row);
  if (rows.length) out.water_intake = rows;
  const del = Object.entries(local.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([id, d]) => ({ id: `water_intake:${id}`, table_name: "water_intake", record_id: id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  if (local.glass && (all || !local.glass.sent)) {
    out.settings = [{ key: "water_glass_ml", value: String(local.glass.ml), updated_at: local.glass.updatedAt }];
  }
  return out;
}

export function markWaterSent(local) {
  if (!local) return;
  for (const r of Object.values(local.rows)) r.sent = true;
  for (const d of Object.values(local.deleted)) d.sent = true;
  if (local.glass) local.glass.sent = true;
}

/** Nach neuen Daten vom PC: Übertragenes, das der PC jetzt selbst hat, entfernen. */
export function pruneWater(catalog, local) {
  if (!local) return emptyWaterLocal();
  const pcIds = new Set((catalog?.pc?.water_intake ?? []).map((r) => r.id));
  for (const [id, r] of Object.entries(local.rows)) if (r.sent && pcIds.has(id)) delete local.rows[id];
  for (const [id, d] of Object.entries(local.deleted)) if (d.sent && !pcIds.has(id)) delete local.deleted[id];
  const pcGlass = (catalog?.pc?.settings ?? []).find((s) => s.key === "water_glass_ml");
  if (local.glass?.sent && pcGlass && String(pcGlass.updated_at) >= local.glass.updatedAt) local.glass = null;
  return local;
}
