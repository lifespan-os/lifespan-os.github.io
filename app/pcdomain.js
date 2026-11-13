var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/lib/format.ts
var LOCALE = "de-DE";
var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
function parseIsoDate(value) {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new Error(`Ung\xFCltiges Datum: "${value}" (erwartet JJJJ-MM-TT)`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(2e3, month - 1, day);
  date.setFullYear(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`Ung\xFCltiges Datum: "${value}"`);
  }
  return date;
}
function toIsoDate(date) {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
var dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});
function formatDate(value) {
  const date = typeof value === "string" ? parseIsoDate(value) : value;
  return dateFormatter.format(date);
}
function formatNumber(value, fractionDigits = 0) {
  if (!Number.isFinite(value)) {
    return "\u2013";
  }
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}
var DECIMAL = /^[-+−]?\d+(?:[.,]\d+)?$/;
var INTEGER = /^-?\d+$/;
function parseDecimal(input) {
  const value = input.trim();
  return DECIMAL.test(value) ? Number(value.replace(",", ".").replace("\u2212", "-")) : Number.NaN;
}
function parseInteger(input) {
  const value = input.trim();
  return INTEGER.test(value) ? Number(value) : Number.NaN;
}
function addDaysIso(iso, days) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}
function formatDuration(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return "\u2013";
  }
  const minutes = Math.round(totalMinutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
var longDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
});
function formatLongDate(date) {
  return longDateFormatter.format(date);
}
function formatSigned(value, fractionDigits = 1) {
  if (!Number.isFinite(value)) return "\u2013";
  const rounded = Number(value.toFixed(fractionDigits));
  const abs = formatNumber(Math.abs(rounded), fractionDigits);
  if (rounded > 0) return `+${abs}`;
  if (rounded < 0) return `\u2212${abs}`;
  return `\xB1${abs}`;
}

// src/domain/water.ts
var GLASS_SIZES_ML = [200, 330, 500, 1e3];
function formatLiters(ml) {
  const liters = Math.round(ml / 10) / 100;
  const decimals = Number.isInteger(liters) ? 1 : Number.isInteger(liters * 10) ? 1 : 2;
  return `${formatNumber(liters, decimals)} l`;
}
var glassOptions = () => GLASS_SIZES_ML.map((ml) => ({ value: String(ml), label: formatLiters(ml) }));
function goalGlasses(goalL, glassMl) {
  if (goalL === null || goalL === void 0 || goalL <= 0 || glassMl <= 0) return null;
  return Math.ceil(goalL * 1e3 / glassMl - 1e-9);
}
function waterGlasses(day, goalL) {
  const filled = day.glasses.map((g, index) => ({
    index,
    filled: true,
    amountMl: g.amountMl,
    time: g.time,
    next: false
  }));
  const goalMl = goalL ? goalL * 1e3 : 0;
  const missing = goalMl > day.totalMl ? Math.ceil((goalMl - day.totalMl) / day.glassMl - 1e-9) : 0;
  const empty = Math.max(missing, 1);
  const rest = Array.from({ length: empty }, (_, i) => ({
    index: filled.length + i,
    filled: false,
    amountMl: day.glassMl,
    time: null,
    next: i === 0
  }));
  return [...filled, ...rest];
}
function countAfterClick(index, filledCount) {
  return index < filledCount ? index : index + 1;
}
function waterPercent(totalMl, goalL) {
  if (!goalL || goalL <= 0) return null;
  return Math.min(100, Math.round(totalMl / (goalL * 1e3) * 100));
}
function drinksMl(day) {
  return day.drinks.reduce((sum, d) => sum + d.amountMl, 0);
}
function drinkText(drink) {
  return `${drink.amountMl} ml ${drink.label} (${drink.time})`;
}
function waterSummary(day) {
  const n = day.glasses.length;
  const glasses = `${n} ${n === 1 ? "Glas" : "Gl\xE4ser"}`;
  const ml = drinksMl(day);
  return ml > 0 ? `${glasses} + ${ml} ml aus Koffein-Getr\xE4nken` : glasses;
}

// src/domain/nutrition.ts
var KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 };
function macroEnergyShares(m) {
  const parts = {
    protein: m.proteinG * KCAL_PER_GRAM.protein,
    carbs: m.carbsG * KCAL_PER_GRAM.carbs,
    fat: m.fatG * KCAL_PER_GRAM.fat
  };
  const total = parts.protein + parts.carbs + parts.fat;
  if (total <= 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }
  const keys = ["protein", "carbs", "fat"];
  const raw = keys.map((k) => parts[k] / total * 100);
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((value, index) => ({ index, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac);
  for (const { index } of order) {
    if (rest <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    rest -= 1;
  }
  return { protein: floors[0] ?? 0, carbs: floors[1] ?? 0, fat: floors[2] ?? 0 };
}

// src/domain/dayGoal.ts
function energyGoalView(totals, goalKcal) {
  const consumed = Math.max(0, totals.energyKcal);
  const macroKcal = {
    protein: totals.proteinG * KCAL_PER_GRAM.protein,
    carbs: totals.carbsG * KCAL_PER_GRAM.carbs,
    fat: totals.fatG * KCAL_PER_GRAM.fat
  };
  const macroSum = macroKcal.protein + macroKcal.carbs + macroKcal.fat;
  const scale = macroSum > consumed && macroSum > 0 ? consumed / macroSum : 1;
  const parts = [
    { key: "protein", kcal: macroKcal.protein * scale },
    { key: "carbs", kcal: macroKcal.carbs * scale },
    { key: "fat", kcal: macroKcal.fat * scale }
  ];
  const other = consumed - parts.reduce((s, p) => s + p.kcal, 0);
  if (other > 0.5) parts.push({ key: "other", kcal: other });
  const base = Math.max(goalKcal, consumed);
  const segments = parts.filter((p) => p.kcal > 0).map((p) => ({ ...p, percent: base > 0 ? p.kcal / base * 100 : 0 }));
  const diff = Math.round(goalKcal - consumed);
  const balance = diff > 0 ? { kind: "deficit", kcal: diff } : diff < 0 ? { kind: "surplus", kcal: -diff } : { kind: "exact" };
  return {
    goal: goalKcal,
    consumed,
    percentOfGoal: goalKcal > 0 ? consumed / goalKcal * 100 : 0,
    balance,
    segments,
    goalMarkerPercent: base > 0 ? goalKcal / base * 100 : 100
  };
}
var MACROS = [
  { key: "protein", label: "Protein", actual: (n) => n.proteinG },
  { key: "carbs", label: "Kohlenhydrate", actual: (n) => n.carbsG },
  { key: "fat", label: "Fett", actual: (n) => n.fatG }
];
function macroGoalRows(totals, goals) {
  const goalOf = {
    protein: goals.proteinG,
    carbs: goals.carbsG,
    fat: goals.fatG
  };
  return MACROS.flatMap((m) => {
    const goal = goalOf[m.key];
    if (goal === null || goal <= 0) return [];
    const actual = m.actual(totals);
    const remaining = Math.round((goal - actual) * 10) / 10;
    return [
      {
        key: m.key,
        label: m.label,
        actual,
        goal,
        percent: actual / goal * 100,
        reached: remaining <= 0,
        remaining
      }
    ];
  });
}
function percentText(percent) {
  return `${Math.round(percent)} %`;
}
function dailyNeed(goal, stepKcal2, energy = null) {
  if (!goal) return null;
  if (goal.energyMode === "dynamic") {
    if (!energy || energy.totalKcal === null) return null;
    const useCalibrated = (goal.calibrate ?? true) && energy.calibratedTotalKcal !== null;
    const expenditure = useCalibrated ? energy.calibratedTotalKcal : energy.totalKcal;
    const percent = goal.energyAdjustPercent ?? null;
    const adjustKcal = goal.energyAdjustKcal ?? (percent !== null ? Math.round(expenditure * percent / 100) : 0);
    return {
      mode: "dynamic",
      expenditure,
      calibrated: useCalibrated,
      adjustKcal,
      adjustPercent: goal.energyAdjustKcal == null ? percent : null,
      total: Math.max(0, expenditure + adjustKcal)
    };
  }
  if (goal.energyKcal === null) return null;
  const steps = stepKcal2 !== null && stepKcal2 > 0 ? stepKcal2 : 0;
  return { mode: "fixed", goal: goal.energyKcal, steps, total: goal.energyKcal + steps };
}
var kcal = (v) => `${formatNumber(Math.round(v), 0)} kcal`;
function describeNeed(need) {
  if (!need) return null;
  if (need.mode === "fixed") {
    return need.steps > 0 ? `Tagesbedarf: ${kcal(need.goal)} Ziel + ${kcal(need.steps)} durch Schritte = ${kcal(need.total)}` : null;
  }
  const base = `${kcal(need.expenditure)} Gesamtverbrauch${need.calibrated ? " (kalibriert)" : ""}`;
  if (need.adjustKcal === 0) return `Tagesbedarf: ${base}`;
  const sign = need.adjustKcal < 0 ? "\u2212" : "+";
  const pct = need.adjustPercent !== null ? ` (${sign}${Math.abs(need.adjustPercent)} %)` : "";
  return `Tagesbedarf: ${base} ${sign} ${kcal(Math.abs(need.adjustKcal))}${pct} = ${kcal(need.total)}`;
}
function withProteinFromWeight(goal, weightKg) {
  const perKg = goal.proteinGPerKg ?? null;
  if (perKg === null) return goal;
  return { ...goal, proteinG: weightKg !== null ? Math.round(perKg * weightKg) : null };
}
function describeProteinPerKg(perKg, weightKg) {
  if (perKg == null) return null;
  if (weightKg === null) {
    return `Proteinziel ${formatNumber(perKg, 1)} g je kg \u2013 daf\xFCr bitte ein K\xF6rpergewicht erfassen.`;
  }
  return `Proteinziel: ${formatNumber(perKg, 1)} g je kg \xD7 ${formatNumber(weightKg, 1)} kg = ${formatNumber(Math.round(perKg * weightKg), 0)} g`;
}
function gramsFromPercent(energyKcal, percent, kcalPerGram) {
  return Math.round(energyKcal * percent / 100 / kcalPerGram);
}
function macroBaseKcal(goal, energy) {
  if (goal.energyMode !== "dynamic")
    return goal.energyKcal !== null && goal.energyKcal > 0 ? goal.energyKcal : null;
  if (!energy || energy.baselineKcal === null || energy.totalKcal === null) return null;
  const calibrated = (goal.calibrate ?? true) && energy.calibratedTotalKcal !== null;
  const calibration = calibrated && energy.totalKcal > 0 ? energy.calibratedTotalKcal / energy.totalKcal : 1;
  const base = energy.baselineKcal * calibration;
  const percent = goal.energyAdjustPercent ?? null;
  const adjust = goal.energyAdjustKcal ?? (percent !== null ? base * percent / 100 : 0);
  const total = base + adjust;
  return total > 0 ? total : null;
}
function dayMacroGoals(goal, need, energy = null) {
  const needKcal = need ? need.total : null;
  const baseKcal = macroBaseKcal(goal, energy);
  const factor = needKcal !== null && baseKcal !== null ? Math.max(1, needKcal / baseKcal) : 1;
  const spec = [
    {
      key: "protein",
      g: goal.proteinG,
      pct: goal.proteinPct ?? null,
      perKg: (goal.proteinGPerKg ?? null) !== null
    },
    { key: "carbs", g: goal.carbsG, pct: goal.carbsPct ?? null, perKg: false },
    { key: "fat", g: goal.fatG, pct: goal.fatPct ?? null, perKg: false }
  ];
  const rows = spec.flatMap((s) => {
    if (s.pct !== null) {
      return [
        {
          key: s.key,
          set: s.pct,
          unit: "pct",
          grams: needKcal !== null ? gramsFromPercent(needKcal, s.pct, KCAL_PER_GRAM[s.key]) : null
        }
      ];
    }
    if (s.perKg) return [{ key: s.key, set: s.g ?? 0, unit: "perKg", grams: s.g }];
    if (s.g === null) return [];
    return [{ key: s.key, set: s.g, unit: "g", grams: Math.round(s.g * factor) }];
  });
  const gramsOf = (key) => rows.find((r2) => r2.key === key)?.grams ?? null;
  return {
    proteinG: gramsOf("protein"),
    carbsG: gramsOf("carbs"),
    fatG: gramsOf("fat"),
    baseKcal,
    needKcal,
    factor,
    rows
  };
}
function withDayMacros(goal, macros) {
  return { ...goal, proteinG: macros.proteinG, carbsG: macros.carbsG, fatG: macros.fatG };
}
var MACRO_SHORT = { protein: "Protein", carbs: "KH", fat: "Fett" };
function describeMacroGoals(m) {
  const parts = [];
  const pct = m.rows.filter((r2) => r2.unit === "pct" && r2.grams !== null);
  if (pct.length > 0 && m.needKcal !== null) {
    parts.push(
      `${pct.map((r2) => `${MACRO_SHORT[r2.key]} ${formatNumber(r2.set, r2.set % 1 === 0 ? 0 : 1)} % = ${formatNumber(r2.grams, 0)} g`).join(" \xB7 ")} (vom Tagesbedarf ${kcal(m.needKcal)})`
    );
  }
  const grown = m.rows.filter((r2) => r2.unit === "g" && r2.grams !== null && r2.grams !== r2.set);
  if (grown.length > 0 && m.baseKcal !== null && m.needKcal !== null) {
    const plus = Math.round((m.factor - 1) * 100);
    parts.push(
      `${grown.map((r2) => `${MACRO_SHORT[r2.key]} ${formatNumber(r2.set, 0)} \u2192 ${formatNumber(r2.grams, 0)} g`).join(" \xB7 ")} (+${plus} % Mehrverbrauch: ${kcal(m.needKcal)} statt ${kcal(m.baseKcal)})`
    );
  }
  return parts.length > 0 ? `Makroziele heute: ${parts.join(" \xB7 ")}` : null;
}

// src/domain/nutritionDay.ts
var LABELS = { protein: "Protein", carbs: "Kohlenhydrate", fat: "Fett" };
var validGoal = (g) => g !== null && g !== void 0 && Number.isFinite(g) && g > 0 ? g : null;
function dayChart(totals, targets) {
  const t = totals ?? { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const shares = macroEnergyShares(t);
  const energyGoal = validGoal(targets.energyKcal);
  const energyPercent = energyGoal === null ? null : t.energyKcal / energyGoal * 100;
  const grams = { protein: t.proteinG, carbs: t.carbsG, fat: t.fatG };
  const goals = {
    protein: validGoal(targets.proteinG),
    carbs: validGoal(targets.carbsG),
    fat: validGoal(targets.fatG)
  };
  const largest = Math.max(1, grams.protein, grams.carbs, grams.fat);
  const bars = ["protein", "carbs", "fat"].map((key) => {
    const actual = grams[key];
    const goal = goals[key];
    const percent = goal === null ? null : actual / goal * 100;
    return {
      key,
      label: LABELS[key],
      actual,
      goal,
      percent,
      width: Math.min(100, Math.max(0, percent ?? actual / largest * 100)),
      energyShare: shares[key],
      over: percent !== null && percent > 100
    };
  });
  return {
    energy: {
      actual: t.energyKcal,
      goal: energyGoal,
      percent: energyPercent,
      fraction: energyPercent === null ? t.energyKcal > 0 ? 1 : 0 : Math.min(1, energyPercent / 100),
      over: energyPercent !== null && energyPercent > 100
    },
    bars
  };
}

// src/domain/nutritionCalc.ts
var ZERO = { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
var DISPLAY_DECIMALS = { kcal: 0, grams: 1, amount: 1 };
function roundKcal(value) {
  return roundHalfAway(value, 0);
}
function roundHalfAway(value, decimals) {
  const factor = 10 ** decimals;
  return Math.sign(value) * Math.round(Math.abs(value) * factor) / factor;
}
function roundGrams(value) {
  return roundHalfAway(value, 1);
}
function roundAmount(value) {
  return roundHalfAway(value, 1);
}
function formatKcal(value) {
  return `${formatNumber(roundKcal(value), 0)} kcal`;
}
function formatGrams(value) {
  return `${formatNumber(roundGrams(value), 1)} g`;
}
function formatAmount(value, unit) {
  const r2 = roundAmount(value);
  return `${formatNumber(r2, Number.isInteger(r2) ? 0 : 1)} ${unit}`;
}
function nutrientsFor(per100, amount) {
  const f = amount / 100;
  return {
    energyKcal: per100.energyKcal * f,
    proteinG: per100.proteinG * f,
    carbsG: per100.carbsG * f,
    fatG: per100.fatG * f
  };
}
function addNutrients(a, b) {
  return {
    energyKcal: a.energyKcal + b.energyKcal,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG
  };
}
function sumNutrients(list) {
  return list.reduce(addNutrients, ZERO);
}
function scaleNutrients(n, factor) {
  return {
    energyKcal: n.energyKcal * factor,
    proteinG: n.proteinG * factor,
    carbsG: n.carbsG * factor,
    fatG: n.fatG * factor
  };
}
function amountFromPortions(portions, portionAmount) {
  if (!Number.isFinite(portions) || portions <= 0 || !(portionAmount > 0)) return Number.NaN;
  return roundAmount(portions * portionAmount);
}
function portionsFromAmount(amount, portionAmount) {
  if (!(portionAmount > 0) || !Number.isFinite(amount)) return Number.NaN;
  return Math.round(amount / portionAmount * 100) / 100;
}
function scaleRecipeItems(items, recipeServings, servings) {
  if (!(recipeServings > 0)) throw new Error("Das Rezept braucht mindestens eine Portion.");
  if (!Number.isFinite(servings) || servings <= 0) {
    throw new Error("Bitte eine Portionenzahl gr\xF6\xDFer als 0 angeben.");
  }
  const factor = servings / recipeServings;
  return items.map((i) => ({ ...i, amount: Math.max(0.1, roundAmount(i.amount * factor)) }));
}
function perServing(total, servings) {
  if (!(servings > 0)) return ZERO;
  return scaleNutrients(total, 1 / servings);
}
var OPTIONAL_LABELS = {
  fiberG: "Ballaststoffe",
  sugarG: "davon Zucker",
  saturatedFatG: "ges\xE4ttigte Fetts\xE4uren",
  saltG: "Salz"
};
function sumOptional(items, key) {
  let value = 0;
  let known = 0;
  let missing = 0;
  for (const item of items) {
    const v = item[key];
    if (v === null || v === void 0) missing += 1;
    else {
      value += v;
      known += 1;
    }
  }
  return { value: known === 0 ? null : value, known, missing };
}
function describeOptional(t) {
  if (t.value === null) return "keine Angaben";
  if (t.missing === 0) return formatGrams(t.value);
  const total = t.known + t.missing;
  return `mind. ${formatGrams(t.value)} (bei ${t.missing} von ${total} Lebensmitteln keine Angabe)`;
}
function goalProgress(goal, actual, decimals) {
  if (goal === null) return { kind: "none" };
  const factor = 10 ** decimals;
  const raw = goal - actual;
  const diff = Math.sign(raw) * Math.round(Math.abs(raw) * factor) / factor;
  if (diff > 0) return { kind: "remaining", value: diff };
  if (diff === 0) return { kind: "reached" };
  return { kind: "over", value: -diff };
}
function describeGoalProgress(p, unit) {
  const fmt2 = (v) => unit === "kcal" ? formatKcal(v) : formatGrams(v);
  switch (p.kind) {
    case "none":
      return "";
    case "remaining":
      return `noch ${fmt2(p.value)}`;
    case "reached":
      return "Ziel erreicht";
    case "over":
      return `${fmt2(p.value)} \xFCber dem Ziel`;
  }
}

// src/domain/forms.ts
function textOrNull(value) {
  const clean = value.trim();
  return clean === "" ? null : clean;
}
var FormParser = class {
  constructor() {
    __publicField(this, "errors", {});
  }
  get ok() {
    return Object.keys(this.errors).length === 0;
  }
  fail(field, message) {
    if (!(field in this.errors)) this.errors[field] = message;
  }
  /** Eigener Fehler für ein Feld (z. B. aus einer Umrechnung). */
  error(field, message) {
    this.fail(field, message);
  }
  /** Optionale Kommazahl. */
  decimal(field, text) {
    if (text.trim() === "") return null;
    const value = parseDecimal(text);
    if (Number.isNaN(value)) {
      this.fail(field, "Bitte eine Zahl eingeben, z. B. 80 oder 80,5.");
      return null;
    }
    return value;
  }
  /** Pflicht-Kommazahl. */
  requiredDecimal(field, text, label) {
    if (text.trim() === "") {
      this.fail(field, `Bitte ${label} eingeben.`);
      return 0;
    }
    return this.decimal(field, text) ?? 0;
  }
  /** Optionale ganze Zahl. */
  integer(field, text) {
    if (text.trim() === "") return null;
    const value = parseInteger(text);
    if (Number.isNaN(value)) {
      this.fail(field, "Bitte eine ganze Zahl eingeben.");
      return null;
    }
    return value;
  }
  requiredInteger(field, text, label) {
    if (text.trim() === "") {
      this.fail(field, `Bitte ${label} eingeben.`);
      return 0;
    }
    return this.integer(field, text) ?? 0;
  }
  /** Pflichtauswahl (z. B. Übung, Lebensmittel). */
  required(field, value, message) {
    if (value.trim() === "") this.fail(field, message);
    return value;
  }
  /** Dauer in Minuten (Kommazahl) → Sekunden. */
  minutesToSeconds(field, text) {
    const minutes = this.decimal(field, text);
    return minutes === null ? null : Math.round(minutes * 60);
  }
  /** Strecke in km (Kommazahl) → Meter. */
  kmToMeters(field, text) {
    const km = this.decimal(field, text);
    return km === null ? null : Math.round(km * 1e3 * 10) / 10;
  }
};

// src/domain/bls.ts
function neededDecimals(value) {
  for (let d = 0; d < 3; d += 1) {
    const f = 10 ** d;
    if (Math.abs(Math.round(value * f) / f - value) < 1e-9) return d;
  }
  return 3;
}

// src/domain/fasttrack.ts
var MACRO_GROUP = "macros";
var MACRO_KEYS = {
  energyKcal: "energy",
  proteinG: "protein",
  carbsG: "carbs",
  fatG: "fat"
};
var OPTIONAL_KEYS = {
  fiberG: "fiber",
  sugarG: "sugar",
  saturatedFatG: "saturated_fat"
};
function fastNutrients(entry) {
  const v = (key) => entry?.values[key] ?? 0;
  return {
    energyKcal: v(MACRO_KEYS.energyKcal),
    proteinG: v(MACRO_KEYS.proteinG),
    carbsG: v(MACRO_KEYS.carbsG),
    fatG: v(MACRO_KEYS.fatG)
  };
}
function formatNutrient(value, unit) {
  const rounded = Math.round(value * 1e3) / 1e3;
  return `${formatNumber(rounded, neededDecimals(rounded))} ${unit}`;
}
function groupedValues(catalog, entry) {
  return catalog.groups.map((g) => ({
    key: g.key,
    label: g.label,
    items: catalog.nutrients.filter((n) => n.group === g.key && entry.values[n.key] !== void 0).map((def) => ({ def, value: entry.values[def.key] }))
  })).filter((g) => g.items.length > 0);
}
function microValues(catalog, sources) {
  const macros = new Set(
    catalog.nutrients.filter((n) => n.group === MACRO_GROUP).map((n) => n.key)
  );
  const out = {};
  for (const values of sources) {
    for (const [key, v] of Object.entries(values)) {
      if (macros.has(key) || !Number.isFinite(v)) continue;
      out[key] = (out[key] ?? 0) + v;
    }
  }
  for (const [key, v] of Object.entries(out)) if (v <= 0) delete out[key];
  return out;
}

// src/domain/labels.ts
var MEAL_TYPES = [
  { value: "breakfast", label: "Fr\xFChst\xFCck" },
  { value: "lunch", label: "Mittagessen" },
  { value: "dinner", label: "Abendessen" },
  { value: "snack", label: "Snacks" },
  { value: "other", label: "Sonstiges" }
];
function labelOf(list, value) {
  return list.find((item) => item.value === value)?.label ?? value;
}
var customMealNames = {};
var listeners = /* @__PURE__ */ new Set();
function setMealNames(names) {
  customMealNames = { ...names };
  listeners.forEach((l) => l());
}
var mealTypeLabel = (v) => customMealNames[v] ?? labelOf(MEAL_TYPES, v);

// src/domain/resistance.ts
var PROFILE_KEYS = [
  "mid",
  "end",
  "begin",
  "mid_end",
  "mid_begin",
  "isokin",
  "ecc",
  "conc",
  "isom"
];
var PROFILE_LABELS = {
  mid: "Middle Range",
  end: "End Range (Kontraktion)",
  begin: "Beginning Range (Dehnung)",
  mid_end: "Middle + End Range",
  mid_begin: "Middle + Beginning Range",
  isokin: "Isokinetisch",
  ecc: "Exzentrisch",
  conc: "Konzentrisch",
  isom: "Isometrisch"
};
var PROFILE_SHORT = {
  mid: "Middle",
  end: "End",
  begin: "Beginning",
  mid_end: "Middle + End",
  mid_begin: "Middle + Beginning",
  isokin: "Isokinetisch",
  ecc: "Exzentrisch",
  conc: "Konzentrisch",
  isom: "Isometrisch"
};
var PROFILE_FIELDS = {
  mid: "rpMidKg",
  end: "rpEndKg",
  begin: "rpBeginKg",
  mid_end: "rpMidEndKg",
  mid_begin: "rpMidBeginKg",
  isokin: "rpIsokineticKg",
  ecc: "rpEccentricKg",
  conc: "rpConcentricKg",
  isom: "rpIsometricKg"
};
function profileWeight(set, key) {
  return set[PROFILE_FIELDS[key]] ?? null;
}
function usedProfiles(set) {
  return PROFILE_KEYS.filter((k) => profileWeight(set, k) !== null);
}

// src/domain/trainingCalc.ts
var trainingCalc_exports = {};
__export(trainingCalc_exports, {
  FAIL_LAST_REP_SHARE: () => FAIL_LAST_REP_SHARE,
  describeNewRecord: () => describeNewRecord,
  describeProfiles: () => describeProfiles,
  describeSet: () => describeSet,
  describeSets: () => describeSets,
  formatKg: () => formatKg,
  formatVolume: () => formatVolume,
  newRecordsInWorkout: () => newRecordsInWorkout,
  personalRecords: () => personalRecords,
  profileRecords: () => profileRecords,
  setVolumeKg: () => setVolumeKg,
  summarizeSessions: () => summarizeSessions,
  volumeBreakdown: () => volumeBreakdown,
  volumeFormula: () => volumeFormula,
  volumeReps: () => volumeReps
});
var FAIL_LAST_REP_SHARE = 0.5;
function volumeReps(set) {
  if (set.reps === null) return 0;
  return set.isFailure === true ? Math.max(set.reps - (1 - FAIL_LAST_REP_SHARE), 0) : set.reps;
}
function setVolumeKg(set) {
  if (set.isWarmup || set.reps === null || set.weightKg === null) return 0;
  return volumeReps(set) * set.weightKg;
}
function volumeBreakdown(sets) {
  const result = {
    volumeKg: 0,
    countedSets: 0,
    setsWithoutWeight: 0,
    warmupSets: 0,
    totalReps: 0
  };
  for (const s of sets) {
    if (s.isWarmup) {
      result.warmupSets += 1;
      continue;
    }
    if (s.reps === null && s.weightKg === null) continue;
    result.totalReps += s.reps ?? 0;
    if (s.reps !== null && s.weightKg !== null) {
      result.countedSets += 1;
      result.volumeKg += setVolumeKg(s);
    } else {
      result.setsWithoutWeight += 1;
    }
  }
  return result;
}
function formatKg(kg) {
  const rounded = Math.round(kg * 100) / 100;
  const decimals = Math.min(2, neededDecimals(rounded));
  return `${formatNumber(rounded, decimals)} kg`;
}
function formatVolume(kg) {
  return `${formatNumber(kg, Number.isInteger(kg) || kg >= 1e3 ? 0 : 1)} kg`;
}
function volumeFormula(sets) {
  const b = volumeBreakdown(sets);
  const terms = sets.filter((s) => !s.isWarmup && s.reps !== null && s.weightKg !== null).map(
    (s) => s.isFailure === true ? `${formatNumber(volumeReps(s), 1)} \xD7 ${formatKg(s.weightKg ?? 0)} (Fail)` : `${s.reps} \xD7 ${formatKg(s.weightKg ?? 0)}`
  );
  const notes = [];
  if (b.setsWithoutWeight > 0) {
    notes.push(
      `${b.setsWithoutWeight} ${b.setsWithoutWeight === 1 ? "Satz" : "S\xE4tze"} ohne Zusatzgewicht z\xE4hlt 0 kg`
    );
  }
  if (b.warmupSets > 0) {
    notes.push(
      `${b.warmupSets} ${b.warmupSets === 1 ? "Aufw\xE4rmsatz" : "Aufw\xE4rms\xE4tze"} nicht enthalten`
    );
  }
  const sum = terms.length === 0 ? "0 kg" : `${terms.join(" + ")} = ${formatVolume(b.volumeKg)}`;
  return notes.length === 0 ? sum : `${sum} (${notes.join("; ")})`;
}
function describeProfiles(set) {
  return usedProfiles(set).map((k) => `${PROFILE_SHORT[k]} ${formatKg(profileWeight(set, k) ?? 0)}`).join(" \xB7 ");
}
function describeSet(set) {
  const parts = [];
  if (set.weightKg !== null && set.reps !== null)
    parts.push(`${formatKg(set.weightKg)} \xD7 ${set.reps}`);
  else if (set.reps !== null) parts.push(`${set.reps} Wdh.`);
  else if (set.weightKg !== null) parts.push(formatKg(set.weightKg));
  if (set.distanceM !== null) parts.push(`${formatNumber(set.distanceM / 1e3, 2)} km`);
  if (set.durationSeconds !== null) {
    const min = set.durationSeconds / 60;
    parts.push(`${formatNumber(min, Number.isInteger(min) ? 0 : 1)} min`);
  }
  if (set.inclinePct !== null && set.inclinePct !== void 0) {
    parts.push(`${formatNumber(set.inclinePct, 1)} % Steigung`);
  }
  if (set.powerW !== null && set.powerW !== void 0)
    parts.push(`${formatNumber(set.powerW, 0)} W`);
  if (set.hrAvg !== null && set.hrAvg !== void 0) parts.push(`\xD8 Puls ${set.hrAvg}`);
  const profiles = describeProfiles(set);
  let text = parts.join(" \xB7 ");
  if (profiles) text = text ? `${text} (${profiles})` : profiles;
  if (set.isUnilateral === true) text = `${text} \xB7 unilateral`;
  if (set.isFailure === true) text = `${text} \xB7 Fail`;
  return set.isWarmup ? `Aufw. ${text}` : text;
}
function describeSets(sets) {
  return sets.map(describeSet).join("  |  ");
}
function summarizeSessions(log) {
  const byWorkout = /* @__PURE__ */ new Map();
  for (const s of log) {
    let row = byWorkout.get(s.workoutId);
    if (!row) {
      row = {
        workoutId: s.workoutId,
        date: s.date,
        title: s.workoutTitle,
        workingSets: 0,
        totalReps: 0,
        maxWeightKg: null,
        repsAtMaxWeight: null,
        volumeKg: 0,
        totalDistanceM: 0,
        totalDurationSeconds: 0
      };
      byWorkout.set(s.workoutId, row);
    }
    if (s.isWarmup) continue;
    row.workingSets += 1;
    row.totalReps += s.reps ?? 0;
    row.volumeKg += setVolumeKg(s);
    row.totalDistanceM += s.distanceM ?? 0;
    row.totalDurationSeconds += s.durationSeconds ?? 0;
    if (s.weightKg !== null && s.reps !== null && s.reps > 0) {
      if (row.maxWeightKg === null || s.weightKg > row.maxWeightKg) {
        row.maxWeightKg = s.weightKg;
        row.repsAtMaxWeight = s.reps;
      } else if (s.weightKg === row.maxWeightKg && s.reps > (row.repsAtMaxWeight ?? 0)) {
        row.repsAtMaxWeight = s.reps;
      }
    }
  }
  return [...byWorkout.values()].filter((r2) => r2.workingSets > 0);
}
var LABELS2 = {
  heaviest: "H\xF6chstes Gewicht",
  mostReps: "Meiste Wiederholungen in einem Satz",
  bestSetVolume: "Gr\xF6\xDFtes Satzvolumen",
  bestSessionVolume: "Gr\xF6\xDFtes Volumen in einer Einheit",
  longestDistance: "L\xE4ngste Strecke in einer Einheit",
  longestDuration: "L\xE4ngste Dauer in einer Einheit",
  profileHeaviest: "H\xF6chstes Gewicht"
};
function better(current, next) {
  return current === null || next.value > current.value ? next : current;
}
function personalRecords(log, category) {
  let heaviest = null;
  let heaviestReps = 0;
  let mostReps = null;
  let bestSet = null;
  for (const s of log) {
    if (s.isWarmup) continue;
    if (s.weightKg !== null && s.weightKg > 0 && s.reps !== null && s.reps > 0) {
      const improves = heaviest === null || s.weightKg > heaviest.value || s.weightKg === heaviest.value && s.reps > heaviestReps;
      if (improves) {
        heaviestReps = s.reps;
        heaviest = {
          value: s.weightKg,
          display: `${formatKg(s.weightKg)} \xD7 ${s.reps}`,
          date: s.date,
          workoutId: s.workoutId
        };
      }
      bestSet = better(bestSet, {
        value: setVolumeKg(s),
        display: `${formatVolume(setVolumeKg(s))} (${formatKg(s.weightKg)} \xD7 ${s.reps}${s.isFailure === true ? ", Fail" : ""})`,
        date: s.date,
        workoutId: s.workoutId
      });
    }
    if (s.reps !== null && s.reps > 0) {
      mostReps = better(mostReps, {
        value: s.reps,
        display: s.weightKg !== null && s.weightKg > 0 ? `${s.reps} Wdh. mit ${formatKg(s.weightKg)}` : `${s.reps} Wdh.`,
        date: s.date,
        workoutId: s.workoutId
      });
    }
  }
  let bestSession = null;
  let longestDistance = null;
  let longestDuration = null;
  for (const row of summarizeSessions(log)) {
    if (row.volumeKg > 0) {
      bestSession = better(bestSession, {
        value: row.volumeKg,
        display: formatVolume(row.volumeKg),
        date: row.date,
        workoutId: row.workoutId
      });
    }
    if (row.totalDistanceM > 0) {
      longestDistance = better(longestDistance, {
        value: row.totalDistanceM,
        display: `${formatNumber(row.totalDistanceM / 1e3, 2)} km`,
        date: row.date,
        workoutId: row.workoutId
      });
    }
    if (row.totalDurationSeconds > 0) {
      const min = row.totalDurationSeconds / 60;
      longestDuration = better(longestDuration, {
        value: row.totalDurationSeconds,
        display: `${formatNumber(min, Number.isInteger(min) ? 0 : 1)} min`,
        date: row.date,
        workoutId: row.workoutId
      });
    }
  }
  const order = category === "cardio" ? [
    ["longestDistance", longestDistance],
    ["longestDuration", longestDuration]
  ] : [
    ["heaviest", heaviest],
    ["mostReps", mostReps],
    ["bestSetVolume", bestSet],
    ["bestSessionVolume", bestSession],
    ["longestDistance", longestDistance],
    ["longestDuration", longestDuration]
  ];
  const base = order.filter((entry) => entry[1] !== null).map(([kind, c]) => ({ id: kind, kind, label: LABELS2[kind], ...c }));
  return category === "cardio" ? base : [...base, ...profileRecords(log)];
}
function profileRecords(log) {
  const result = [];
  for (const key of PROFILE_KEYS) {
    let best = null;
    for (const s of log) {
      const kg = profileWeight(s, key);
      if (s.isWarmup || kg === null || kg <= 0 || s.reps === null || s.reps <= 0) continue;
      if (best === null || kg > best.value || kg === best.value && s.reps > best.reps) {
        best = {
          value: kg,
          reps: s.reps,
          display: `${formatKg(kg)} \xD7 ${s.reps}`,
          date: s.date,
          workoutId: s.workoutId
        };
      }
    }
    if (best) {
      result.push({
        id: `profileHeaviest:${key}`,
        kind: "profileHeaviest",
        profile: key,
        label: `H\xF6chstes Gewicht \u2013 ${PROFILE_LABELS[key]}`,
        value: best.value,
        display: best.display,
        date: best.date,
        workoutId: best.workoutId
      });
    }
  }
  return result;
}
function newRecordsInWorkout(workoutId, fullLog) {
  const byExercise = /* @__PURE__ */ new Map();
  for (const s of fullLog) {
    const list = byExercise.get(s.exerciseId) ?? [];
    list.push(s);
    byExercise.set(s.exerciseId, list);
  }
  const result = [];
  for (const [exerciseId, entries] of byExercise) {
    if (!entries.some((e) => e.workoutId === workoutId)) continue;
    const category = entries[0]?.exerciseCategory;
    const before = personalRecords(
      entries.filter((e) => e.workoutId !== workoutId),
      category
    );
    const after = personalRecords(entries, category);
    for (const rec of after) {
      const prev = before.find((b) => b.id === rec.id);
      if (prev && rec.workoutId === workoutId && rec.value > prev.value) {
        result.push({
          exerciseId,
          exerciseName: entries[0]?.exerciseName ?? "",
          record: rec,
          previous: prev
        });
      }
    }
  }
  return result;
}
function describeNewRecord(r2) {
  return `${r2.exerciseName} \u2013 ${r2.record.label}: ${r2.record.display} (vorher ${r2.previous.display} am ${formatDate(r2.previous.date)})`;
}

// src/domain/cardio.ts
function formatDuration2(seconds) {
  if (seconds === null || seconds === void 0 || !Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}
function cardioPace(kind, durationSeconds, distanceM) {
  if (!durationSeconds || !distanceM || durationSeconds <= 0 || distanceM <= 0) return null;
  const kmh = distanceM / 1e3 / (durationSeconds / 3600);
  const per = (meters) => formatDuration2(durationSeconds * meters / distanceM);
  switch (kind) {
    case "run":
    case "walk":
      return `${per(1e3)} /km \xB7 ${formatNumber(kmh, 1)} km/h`;
    case "row":
    case "ski":
      return `${per(500)} /500 m`;
    case "swim":
      return `${per(100)} /100 m`;
    default:
      return `${formatNumber(kmh, 1)} km/h`;
  }
}
function cardioMethodLabel(method) {
  switch (method) {
    case "power":
      return "aus der Leistung (Watt)";
    case "pace":
      return "aus Tempo und Steigung";
    case "distance":
      return "aus der Strecke";
    case "heartRate":
      return "aus dem Puls";
    case "speed":
      return "aus der Geschwindigkeit";
    default:
      return "aus Art und Anstrengung";
  }
}

// src/domain/supplements.ts
var FASTED_LABEL = "N\xFCchtern";
var INDEPENDENT_LABEL = "Unabh\xE4ngig";
function describeTiming(i) {
  if (i.timing === "fasted") return "n\xFCchtern";
  if (i.timing === "independent") return "unabh\xE4ngig von Mahlzeiten";
  if (!i.mealId || !i.mealType) return "zu einer gel\xF6schten Mahlzeit";
  return `zu \u201E${i.mealName ?? mealTypeLabel(i.mealType)}\u201C`;
}
function groupIntakes(intakes) {
  const groups = /* @__PURE__ */ new Map();
  for (const i of intakes) {
    const key = i.timing === "meal" ? `meal:${i.mealId ?? "geloescht"}` : i.timing;
    const group = groups.get(key);
    if (group) group.intakes.push(i);
    else groups.set(key, { key, label: describeTiming(i), intakes: [i] });
  }
  return [...groups.values()];
}
function addNutrientValues(sets) {
  const out = {};
  for (const set of sets) {
    for (const [k, v] of Object.entries(set)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
function macrosOf(values) {
  return {
    energyKcal: values[MACRO_KEYS.energyKcal] ?? 0,
    proteinG: values[MACRO_KEYS.proteinG] ?? 0,
    carbsG: values[MACRO_KEYS.carbsG] ?? 0,
    fatG: values[MACRO_KEYS.fatG] ?? 0
  };
}
function optionalOf(values, key) {
  return values[OPTIONAL_KEYS[key]];
}
function formatSupplementAmount(amount, unit) {
  return `${formatNumber(amount, neededDecimals(amount))} ${unit}`;
}
function describeSupplements(items) {
  return items.map((i) => `${i.name} (${formatSupplementAmount(i.amount, i.unit)})`).join(", ");
}

// src/domain/profile.ts
var ISO_DATE2 = /^(\d{4})-(\d{2})-(\d{2})$/;
function isRealDate(text) {
  const m = ISO_DATE2.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
function ageOn(birthDate, today) {
  if (!isRealDate(birthDate) || !isRealDate(today) || birthDate > today) return null;
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  const reached = today.slice(5) >= birthDate.slice(5);
  return reached ? years : years - 1;
}

// src/domain/nutrientReferences.ts
function byGroup(...v) {
  const keys = [
    "m19",
    "m25",
    "m51",
    "m65",
    "f19",
    "f25",
    "f51",
    "f65",
    "pregnant_1",
    "pregnant_2",
    "pregnant_3",
    "lactating"
  ];
  if (v.length !== keys.length) throw new Error("byGroup: 12 Werte erwartet");
  return Object.fromEntries(keys.map((k, i) => [k, v[i]]));
}
var r = (min, max) => ({ min, max });
var DGE = {
  vit_a: {
    type: "Empfohlene Zufuhr",
    unit: "\xB5g",
    value: byGroup(850, 850, 850, 800, 700, 700, 700, 700, 800, 800, 800, 1300),
    note: "\xB5g Retinol-Aktivit\xE4ts\xE4quivalente"
  },
  vit_d: {
    type: "Sch\xE4tzwert",
    unit: "\xB5g",
    value: 20,
    note: "bei fehlender k\xF6rpereigener Bildung"
  },
  vit_e: {
    type: "Sch\xE4tzwert",
    unit: "mg",
    value: byGroup(8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 13)
  },
  vit_k: {
    type: "Sch\xE4tzwert",
    unit: "\xB5g",
    value: byGroup(70, 70, 80, 80, 60, 60, 65, 65, 60, 60, 60, 60)
  },
  vit_b1: {
    type: "Empfohlene Zufuhr",
    unit: "mg",
    value: byGroup(1.3, 1.2, 1.2, 1.1, 1, 1, 1, 1, 1, 1.2, 1.3, 1.3)
  },
  vit_b2: {
    type: "Empfohlene Zufuhr",
    unit: "mg",
    value: byGroup(1.4, 1.4, 1.3, 1.3, 1.1, 1.1, 1, 1, 1.1, 1.3, 1.4, 1.4)
  },
  vit_b3: {
    type: "Empfohlene Zufuhr",
    unit: "mg",
    value: byGroup(16, 15, 15, 14, 13, 12, 11, 11, 13, 14, 16, 16),
    note: "mg Niacin-\xC4quivalente"
  },
  vit_b5: {
    type: "Sch\xE4tzwert",
    unit: "mg",
    value: byGroup(5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 7)
  },
  vit_b6: {
    type: "Empfohlene Zufuhr",
    unit: "mg",
    value: byGroup(1.6, 1.6, 1.6, 1.6, 1.4, 1.4, 1.4, 1.4, 1.5, 1.8, 1.8, 1.6)
  },
  vit_b7: {
    type: "Sch\xE4tzwert",
    unit: "\xB5g",
    value: byGroup(40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 45)
  },
  vit_b9: {
    type: "Empfohlene Zufuhr",
    unit: "\xB5g",
    value: byGroup(300, 300, 300, 300, 300, 300, 300, 300, 550, 550, 550, 450),
    note: "\xB5g Folat-\xC4quivalente"
  },
  vit_b12: {
    type: "Sch\xE4tzwert",
    unit: "\xB5g",
    value: byGroup(4, 4, 4, 4, 4, 4, 4, 4, 4.5, 4.5, 4.5, 5.5)
  },
  vit_c: {
    type: "Empfohlene Zufuhr",
    unit: "mg",
    value: byGroup(110, 110, 110, 110, 95, 95, 95, 95, 95, 105, 105, 125)
  },
  calcium: { type: "Empfohlene Zufuhr", unit: "mg", value: 1e3 },
  magnesium: {
    type: "Sch\xE4tzwert",
    unit: "mg",
    value: byGroup(350, 350, 350, 350, 300, 300, 300, 300, 300, 300, 300, 300)
  },
  potassium: {
    type: "Sch\xE4tzwert",
    unit: "mg",
    value: byGroup(4e3, 4e3, 4e3, 4e3, 4e3, 4e3, 4e3, 4e3, 4e3, 4e3, 4e3, 4400)
  },
  sodium: { type: "Sch\xE4tzwert", unit: "mg", value: 1500 },
  chloride: { type: "Sch\xE4tzwert", unit: "mg", value: 2300 },
  phosphorus: { type: "Sch\xE4tzwert", unit: "mg", value: 550 },
  iron: {
    type: "Empfohlene Zufuhr",
    unit: "mg",
    value: byGroup(11, 11, 11, 11, 16, 16, 14, 14, 27, 27, 27, 16)
  },
  zinc: {
    type: "Empfohlene Zufuhr",
    unit: "mg",
    value: byGroup(14, 14, 14, 14, 8, 8, 8, 8, 9, 11, 11, 13)
  },
  copper: { type: "Sch\xE4tzwert", unit: "mg", value: r(1, 1.5) },
  manganese: { type: "Sch\xE4tzwert", unit: "mg", value: r(2, 5) },
  iodine: {
    type: "Empfohlene Zufuhr",
    unit: "\xB5g",
    value: byGroup(150, 150, 150, 150, 150, 150, 150, 150, 220, 220, 220, 230)
  },
  selenium: {
    type: "Sch\xE4tzwert",
    unit: "\xB5g",
    value: byGroup(70, 70, 70, 70, 60, 60, 60, 60, 60, 60, 60, 75)
  },
  molybdenum: { type: "Sch\xE4tzwert", unit: "\xB5g", value: r(50, 100) },
  chromium: { type: "Sch\xE4tzwert", unit: "\xB5g", value: r(30, 100) },
  fluoride: {
    type: "Richtwert",
    unit: "mg",
    value: byGroup(3.5, 3.5, 3.5, 3.5, 3, 3, 3, 3, 3, 3, 3, 3)
  }
};
var ZINC_BY_PHYTATE = {
  m19: [11, 14, 16],
  m25: [11, 14, 16],
  m51: [11, 14, 16],
  m65: [11, 14, 16],
  f19: [7, 8, 10],
  f25: [7, 8, 10],
  f51: [7, 8, 10],
  f65: [7, 8, 10],
  pregnant_1: [7, 9, 11],
  pregnant_2: [9, 11, 13],
  pregnant_3: [9, 11, 13],
  lactating: [11, 13, 14]
};
var EFSA = {
  vit_a: {
    unit: "\xB5g",
    adult: 3e3,
    pregnancy: 3e3,
    lactation: 3e3,
    kind: "UL",
    note: "gilt nur f\xFCr vorgeformtes Vitamin A (Retinol, Retinylester)"
  },
  vit_d: { unit: "\xB5g", adult: 100, pregnancy: 100, lactation: 100, kind: "UL" },
  vit_e: { unit: "mg", adult: 300, pregnancy: 300, lactation: 300, kind: "UL" },
  vit_b6: { unit: "mg", adult: 12, pregnancy: 12, lactation: 12, kind: "UL" },
  vit_b9: {
    unit: "\xB5g",
    adult: 1e3,
    pregnancy: 1e3,
    lactation: 1e3,
    kind: "UL",
    note: "gilt nur f\xFCr zugesetzte Fols\xE4ure bzw. Methylfolat, nicht f\xFCr nat\xFCrliches Folat"
  },
  calcium: { unit: "mg", adult: 2500, pregnancy: 2500, lactation: 2500, kind: "UL" },
  magnesium: {
    unit: "mg",
    adult: 250,
    pregnancy: 250,
    lactation: 250,
    kind: "UL",
    note: "gilt nur f\xFCr zugesetztes Magnesium (Salze, Supplemente), nicht f\xFCr Magnesium aus Lebensmitteln"
  },
  zinc: { unit: "mg", adult: 25, pregnancy: 25, lactation: 25, kind: "UL" },
  copper: {
    unit: "mg",
    adult: 5,
    pregnancy: null,
    lactation: null,
    kind: "UL",
    note: "in Schwangerschaft und Stillzeit nicht festgelegt"
  },
  iodine: { unit: "\xB5g", adult: 600, pregnancy: 600, lactation: 600, kind: "UL" },
  selenium: { unit: "\xB5g", adult: 255, pregnancy: 255, lactation: 255, kind: "UL" },
  molybdenum: { unit: "\xB5g", adult: 600, pregnancy: 600, lactation: 600, kind: "UL" },
  boron: { unit: "mg", adult: 10, pregnancy: 10, lactation: 10, kind: "UL" },
  iron: { unit: "mg", adult: 40, pregnancy: 40, lactation: 40, kind: "safe" },
  manganese: { unit: "mg", adult: 8, pregnancy: 8, lactation: 8, kind: "safe" },
  fluoride: { unit: "mg", adult: 3.3, pregnancy: 3.3, lactation: 3.3, kind: "safe" }
};
var NIACIN_UL_NOTE = "EFSA: Nicotinamid 900 mg, Nicotins\xE4ure 10 mg pro Tag \u2013 das Tagebuch unterscheidet die Formen nicht, darum ohne Prozentwert.";
var GROUP_LABELS = {
  m19: "M\xE4nner 19 bis unter 25 Jahre",
  m25: "M\xE4nner 25 bis unter 51 Jahre",
  m51: "M\xE4nner 51 bis unter 65 Jahre",
  m65: "M\xE4nner ab 65 Jahre",
  f19: "Frauen 19 bis unter 25 Jahre",
  f25: "Frauen 25 bis unter 51 Jahre",
  f51: "Frauen 51 bis unter 65 Jahre",
  f65: "Frauen ab 65 Jahre",
  pregnant_1: "Schwangere, 1. Trimester",
  pregnant_2: "Schwangere, 2. Trimester",
  pregnant_3: "Schwangere, 3. Trimester",
  lactating: "Stillende"
};
function ageAt(profile, date) {
  if (profile.birthDate) return ageOn(profile.birthDate, date);
  if (profile.birthYear) return Number(date.slice(0, 4)) - profile.birthYear;
  return null;
}
function referenceGroup(profile, date) {
  if (!profile || !profile.sex) {
    return {
      ok: false,
      reason: "F\xFCr Referenzwerte bitte unter Settings \u2192 Profil das Geschlecht angeben."
    };
  }
  const age = ageAt(profile, date);
  if (profile.sex === "female" && profile.lifePhase) {
    return { ok: true, group: profile.lifePhase, age };
  }
  if (age === null) {
    return { ok: false, reason: "F\xFCr Referenzwerte bitte im Profil das Geburtsdatum angeben." };
  }
  if (age < 19) {
    return {
      ok: false,
      reason: "Hinterlegt sind die Referenzwerte f\xFCr Erwachsene ab 19 Jahren."
    };
  }
  const band = age < 25 ? "19" : age < 51 ? "25" : age < 65 ? "51" : "65";
  return { ok: true, group: `${profile.sex === "male" ? "m" : "f"}${band}`, age };
}
var UNIT_FACTOR = { g: 1e6, mg: 1e3, \u00B5g: 1, mcg: 1 };
function convertAmount(value, from, to) {
  const f = UNIT_FACTOR[from.trim()];
  const t = UNIT_FACTOR[to];
  if (f === void 0 || t === void 0) return null;
  return value * f / t;
}
function isRange(v) {
  return typeof v === "object";
}
function isGroupValues(v) {
  return typeof v === "object" && !("min" in v);
}
function fmt(n) {
  return String(n).replace(".", ",");
}
function dgeReference(key, group, age = null) {
  const entry = DGE[key];
  if (!entry) return null;
  let value = isGroupValues(entry.value) ? entry.value[group] : entry.value;
  const notes = [];
  const isPhase = group.startsWith("pregnant") || group === "lactating";
  if (isPhase && age !== null && age < 19) {
    if (key === "calcium") value = 1200;
    if (key === "phosphorus") value = 660;
    if (key === "calcium" || key === "phosphorus") notes.push("Wert f\xFCr unter 19-J\xE4hrige");
  }
  if (entry.note) notes.push(entry.note);
  if (key === "zinc") {
    const [low, , high] = ZINC_BY_PHYTATE[group];
    notes.push(`bei mittlerer Phytatzufuhr; niedrige ${fmt(low)} mg, hohe ${fmt(high)} mg`);
  }
  if (key === "iron" && group === "f25") {
    notes.push("vor der Menopause; nach der Menopause 14 mg");
  }
  const base = isRange(value) ? value.min : value;
  const shown = isRange(value) ? `${fmt(value.min)}\u2013${fmt(value.max)} ${entry.unit}` : `${fmt(value)} ${entry.unit}`;
  const range = isRange(value) ? `; Prozent bezogen auf den unteren Wert` : "";
  const title = `DGE ${entry.type}, ${GROUP_LABELS[group]}: ${shown} pro Tag${notes.length ? ` (${notes.join("; ")})` : ""}${range}`;
  return isRange(value) ? { base, unit: entry.unit, range: value, title } : { base, unit: entry.unit, title };
}
function efsaLimit(key, group) {
  const entry = EFSA[key];
  if (!entry) return null;
  const value = group.startsWith("pregnant") ? entry.pregnancy : group === "lactating" ? entry.lactation : entry.adult;
  if (value === null) return null;
  const phase = group.startsWith("pregnant") ? "Schwangerschaft" : group === "lactating" ? "Stillzeit" : "Erwachsene";
  const kind = entry.kind === "UL" ? "tolerierbare H\xF6chstmenge (UL)" : "sichere Aufnahmemenge (safe level, kein UL abgeleitet)";
  const title = `EFSA ${kind}, ${phase}: ${fmt(value)} ${entry.unit} pro Tag${entry.note ? ` \u2013 ${entry.note}` : ""}`;
  return { base: value, unit: entry.unit, title };
}
var DASH = { percent: null, title: "Kein Referenzwert vorhanden" };
function cell(value, unit, ref) {
  if (!ref) return DASH;
  const amount = convertAmount(value, unit, ref.unit);
  if (amount === null) {
    return { percent: null, title: `Einheit \u201E${unit}\u201C l\xE4sst sich nicht umrechnen. ${ref.title}` };
  }
  return { percent: amount / ref.base * 100, title: ref.title };
}
function nutrientPercents(key, value, unit, group) {
  if (!group.ok) {
    return {
      reference: { percent: null, title: group.reason },
      limit: { percent: null, title: group.reason }
    };
  }
  const limit = key === "vit_b3" ? { percent: null, title: NIACIN_UL_NOTE } : cell(value, unit, efsaLimit(key, group.group));
  return { reference: cell(value, unit, dgeReference(key, group.group, group.age)), limit };
}
function formatPercent(percent) {
  if (percent === null || !Number.isFinite(percent)) return "-";
  if (percent > 0 && percent < 1) return "< 1 %";
  return `${Math.round(percent).toLocaleString("de-DE")} %`;
}

// src/domain/mealDraft.ts
function mealHasContent(m) {
  return m !== null && (m.items.length > 0 || Object.keys(m.values ?? {}).length > 0);
}
var DEFAULT_SLOTS = ["breakfast", "lunch", "snack", "dinner"];
function mealDisplayName(meal) {
  return meal.name ?? mealTypeLabel(meal.mealType);
}
function daySlots(day) {
  const fromMeal = (m) => ({
    key: m.id,
    meal: m,
    ref: { id: m.id, date: m.date, mealType: m.mealType },
    title: mealDisplayName(m)
  });
  const rank = (t) => {
    const i = DEFAULT_SLOTS.indexOf(t);
    return i < 0 ? DEFAULT_SLOTS.length : i;
  };
  const slots = day.meals.map((m, order) => ({
    ...fromMeal(m),
    rank: rank(m.mealType),
    order
  }));
  if (!day.customized) {
    for (const type of DEFAULT_SLOTS) {
      if (!day.meals.some((m) => m.mealType === type)) {
        slots.push({
          key: `slot-${type}`,
          meal: null,
          ref: { id: null, date: day.date, mealType: type },
          title: mealTypeLabel(type),
          rank: rank(type),
          order: -1
        });
      }
    }
  }
  return slots.sort((a, b) => a.rank - b.rank || a.order - b.order).map(({ key, meal, ref, title }) => ({ key, meal, ref, title }));
}

// src/domain/overviewLayout.ts
var DEFAULT_LAYOUT = { order: [], hidden: [], emptyLast: true };
function parseLayout(json) {
  if (!json) return DEFAULT_LAYOUT;
  try {
    const v = JSON.parse(json);
    const ids = (a) => Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
    const layout = {
      order: ids(v.order),
      hidden: ids(v.hidden),
      emptyLast: v.emptyLast !== false
    };
    if (Array.isArray(v.introduced)) layout.introduced = ids(v.introduced);
    return layout;
  } catch {
    return DEFAULT_LAYOUT;
  }
}
function orderedIds(defaults, layout) {
  const known = layout.order.filter((id) => defaults.includes(id));
  const result = [...known];
  defaults.forEach((id, i) => {
    if (result.includes(id)) return;
    const before = defaults.slice(0, i).reverse().find((x) => result.includes(x));
    result.splice(before ? result.indexOf(before) + 1 : 0, 0, id);
  });
  return result;
}
function arrange(cards, layout) {
  const order = orderedIds(
    cards.map((c) => c.id),
    layout
  );
  const sorted = [...cards].filter((c) => !layout.hidden.includes(c.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  if (!layout.emptyLast) return sorted;
  return [...sorted.filter((c) => !c.empty), ...sorted.filter((c) => c.empty)];
}

// src/domain/energy.ts
var energy_exports = {};
__export(energy_exports, {
  BASELINE_FACTOR: () => BASELINE_FACTOR,
  TREND_WINDOW_DAYS: () => TREND_WINDOW_DAYS,
  bmrMethodLabel: () => bmrMethodLabel,
  describeCalibration: () => describeCalibration,
  describeCardioEnergy: () => describeCardioEnergy,
  describeTraining: () => describeTraining,
  energyRows: () => energyRows,
  formatPal: () => formatPal,
  palLabel: () => palLabel,
  weightTrendSeries: () => weightTrendSeries
});

// src/domain/stats.ts
var stats_exports = {};
__export(stats_exports, {
  mean: () => mean,
  movingAverage: () => movingAverage,
  roundTo: () => roundTo,
  windowMean: () => windowMean
});
function mean(values) {
  if (values.length === 0) return Number.NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function movingAverage(values, window) {
  if (window < 1 || !Number.isInteger(window)) {
    throw new Error("Das Fenster muss eine positive ganze Zahl sein.");
  }
  return values.map((_, i) => i + 1 < window ? null : mean(values.slice(i + 1 - window, i + 1)));
}
function roundTo(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
function windowMean(points, endDate, days) {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const start = end - (days - 1) * 864e5;
  const inside = points.filter((p) => {
    const t = Date.parse(`${p.date}T00:00:00Z`);
    return t >= start && t <= end;
  });
  if (inside.length === 0) return null;
  return { mean: mean(inside.map((p) => p.value)), count: inside.length };
}

// src/domain/energy.ts
var BASELINE_FACTOR = 1.2;
var TREND_WINDOW_DAYS = 7;
var PAL_LEVELS = [
  { below: 1.4, label: "\xFCberwiegend sitzend" },
  { below: 1.7, label: "leicht aktiv" },
  { below: 2, label: "aktiv" },
  { below: Number.POSITIVE_INFINITY, label: "sehr aktiv" }
];
function palLabel(pal) {
  return (PAL_LEVELS.find((l) => pal < l.below) ?? PAL_LEVELS[PAL_LEVELS.length - 1]).label;
}
function formatPal(pal) {
  return formatNumber(pal, 2);
}
function bmrMethodLabel(e) {
  if (e.bmrMethod === "katch") {
    return `Katch-McArdle (K\xF6rperfett ${formatNumber(e.bodyFatPercent ?? 0, 1)} %)`;
  }
  if (e.bmrMethod === "mifflin") return "Mifflin-St Jeor";
  return "\u2013";
}
function energyRows(e) {
  if (e.baselineKcal === null || e.bmrKcal === null) return [];
  const rows = [
    {
      key: "baseline",
      label: "Grundbedarf im Alltag",
      detail: `Grundumsatz ${formatNumber(e.bmrKcal, 0)} kcal (${bmrMethodLabel(e)}) \xD7 1,2`,
      kcal: e.baselineKcal
    }
  ];
  if (e.step.kcal !== null && e.step.kcal > 0) {
    rows.push({
      key: "steps",
      label: "Schritte",
      detail: `${formatNumber(e.step.steps ?? 0, 0)} Schritte`,
      kcal: e.step.kcal
    });
  }
  for (const a of e.activities) {
    if (a.kcal <= 0) continue;
    rows.push({
      key: `activity-${a.key}`,
      label: a.label,
      detail: `${formatNumber(a.minutes, 0)} min \xB7 MET ${formatNumber(a.met, 1)}`,
      kcal: a.kcal
    });
  }
  for (const t of e.trainings) {
    rows.push({
      key: `training-${t.workoutId}`,
      label: `Training: ${t.title}`,
      detail: describeTraining(t),
      kcal: t.kcal
    });
  }
  return rows;
}
function describeCardioEnergy(c) {
  const parts = [c.exerciseName];
  if (c.durationSeconds > 0) parts.push(formatDuration2(c.durationSeconds));
  if (c.distanceM > 0) parts.push(`${formatNumber(c.distanceM / 1e3, 2)} km`);
  const pace = cardioPace(c.kind, c.durationSeconds, c.distanceM);
  if (pace) parts.push(pace);
  parts.push(c.methods.map(cardioMethodLabel).join(" bzw. "));
  let text = `${parts.join(" \xB7 ")}: ${formatNumber(c.kcal, 0)} kcal`;
  if (c.deviceKcal !== null) text += ` (Ger\xE4t: ${formatNumber(c.deviceKcal, 0)} kcal brutto)`;
  return text;
}
function describeTraining(t) {
  const effort = t.perceivedExertion !== null ? `Anstrengung ${t.perceivedExertion}/10` : "ohne Anstrengung";
  const cardio = t.cardio ?? [];
  const strength = t.strength ? ` \xB7 Krafttraining \xD7 ${formatNumber(t.factor, 1)}` : "";
  if (cardio.length === 0) {
    return `${formatNumber(t.durationMin ?? 0, 0)} min \xB7 ${effort} \xB7 MET ${formatNumber(t.met, 1)}${strength}`;
  }
  const parts = cardio.map(describeCardioEnergy);
  const otherMinutes = t.otherMinutes ?? 0;
  if (otherMinutes > 0) {
    parts.push(
      `\xFCbrige ${formatNumber(otherMinutes, 0)} min \xB7 ${effort} \xB7 MET ${formatNumber(t.met, 1)}${strength}: ${formatNumber(t.otherKcal ?? 0, 0)} kcal`
    );
  }
  return parts.join(" | ");
}
function describeCalibration(e) {
  const c = e.calibration;
  if (!c) return e.calibrationNote;
  const change = c.trendEndKg - c.trendStartKg;
  const sign = change > 0 ? "+" : change < 0 ? "\u2212" : "\xB1";
  return `Kalibriert mit Faktor ${formatNumber(c.factor, 2)} aus ${c.daysUsed} Tagen: \xD8 ${formatNumber(c.avgIntakeKcal, 0)} kcal gegessen, Gewichtstrend ${sign}${formatNumber(Math.abs(change), 1)} kg \u2192 tats\xE4chlich ca. ${formatNumber(c.measuredKcal, 0)} kcal statt berechnet ${formatNumber(c.avgFormulaKcal, 0)} kcal je Tag.` + (c.limited ? " Der Faktor wurde auf 0,75\u20131,25 begrenzt \u2013 bitte Erfassung pr\xFCfen." : "");
}
function weightTrendSeries(points, days = TREND_WINDOW_DAYS) {
  return points.map((p) => ({
    date: p.date,
    value: p.value,
    average: windowMean(points, p.date, days)?.mean ?? null
  }));
}

// src/domain/dashboard.ts
var dashboard_exports = {};
__export(dashboard_exports, {
  BASELINE_DAYS: () => BASELINE_DAYS,
  CARDIO_WEEK_MINUTES: () => CARDIO_WEEK_MINUTES,
  DEFAULT_WEEK_TRAININGS: () => DEFAULT_WEEK_TRAININGS,
  LEVEL_LABELS: () => LEVEL_LABELS,
  MEAL_PROTEIN: () => MEAL_PROTEIN,
  MIN_EXTRA_DAYS: () => MIN_EXTRA_DAYS,
  MIN_OPEN_PROTEIN: () => MIN_OPEN_PROTEIN,
  MIN_REGULARITY_NIGHTS: () => MIN_REGULARITY_NIGHTS,
  NO_WEEK_GOALS: () => NO_WEEK_GOALS,
  RECENT_VITAL_DAYS: () => RECENT_VITAL_DAYS,
  REMINDER_RULES: () => REMINDER_RULES,
  WEEK_CARDIO_MAX_MIN: () => WEEK_CARDIO_MAX_MIN,
  WEEK_GOALS_KEY: () => WEEK_GOALS_KEY,
  WEEK_PROTEIN_DAYS_MAX: () => WEEK_PROTEIN_DAYS_MAX,
  WEEK_SLEEP_MAX_MIN: () => WEEK_SLEEP_MAX_MIN,
  WEEK_SLEEP_MIN_MIN: () => WEEK_SLEEP_MIN_MIN,
  WEEK_TRAININGS_MAX: () => WEEK_TRAININGS_MAX,
  dueReminders: () => dueReminders,
  exerciseProgress: () => exerciseProgress,
  extrasCheck: () => extrasCheck,
  metricChange: () => metricChange,
  parseWeekGoals: () => parseWeekGoals,
  progressExercises: () => progressExercises,
  proteinSuggestions: () => proteinSuggestions,
  proteinTarget: () => proteinTarget,
  readiness: () => readiness,
  sleepRegularity: () => sleepRegularity,
  streakOf: () => streakOf,
  streaks: () => streaks,
  weekGoalsFromInput: () => weekGoalsFromInput,
  weeklyGoals: () => weeklyGoals
});

// src/domain/trends.ts
var trends_exports = {};
__export(trends_exports, {
  RANGE_PRESETS: () => RANGE_PRESETS,
  comparePeriods: () => comparePeriods,
  dailySeries: () => dailySeries,
  daysBetween: () => daysBetween,
  formatRange: () => formatRange,
  groupByPeriod: () => groupByPeriod,
  isoFromUtc: () => isoFromUtc,
  isoWeek: () => isoWeek,
  periodStartBack: () => periodStartBack,
  presetRanges: () => presetRanges,
  rangeStats: () => rangeStats,
  shiftDays: () => shiftDays,
  utcDay: () => utcDay,
  weekStart: () => weekStart
});
var DAY_MS = 864e5;
var ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
var MONTHS = [
  "Jan.",
  "Feb.",
  "M\xE4rz",
  "Apr.",
  "Mai",
  "Juni",
  "Juli",
  "Aug.",
  "Sept.",
  "Okt.",
  "Nov.",
  "Dez."
];
function utcDay(iso) {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Ung\xFCltiges Datum: "${iso}" (erwartet JJJJ-MM-TT)`);
  const d = /* @__PURE__ */ new Date(0);
  d.setUTCFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getUTCDate() !== Number(m[3]) || d.getUTCMonth() !== Number(m[2]) - 1) {
    throw new Error(`Ung\xFCltiges Datum: "${iso}"`);
  }
  return d.getTime();
}
function isoFromUtc(t) {
  return new Date(t).toISOString().slice(0, 10);
}
function shiftDays(iso, days) {
  return isoFromUtc(utcDay(iso) + days * DAY_MS);
}
function daysBetween(from, to) {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS) + 1;
}
function weekStart(iso) {
  const t = utcDay(iso);
  const weekday = (new Date(t).getUTCDay() + 6) % 7;
  return isoFromUtc(t - weekday * DAY_MS);
}
function isoWeek(iso) {
  const monday = utcDay(weekStart(iso));
  const thursday = new Date(monday + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
  return { year, week };
}
function periodOf(iso, period) {
  if (period === "week") {
    const start2 = weekStart(iso);
    const { year, week } = isoWeek(iso);
    return {
      key: `${year}-W${String(week).padStart(2, "0")}`,
      start: start2,
      end: shiftDays(start2, 6),
      label: `KW ${week}`
    };
  }
  const [y, m] = iso.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = isoFromUtc(Date.UTC(y, m, 0));
  return { key: start.slice(0, 7), start, end, label: `${MONTHS[m - 1]} ${y}` };
}
function stats(values) {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { count: values.length, mean: sum / values.length, min, max };
}
function groupByPeriod(points, period) {
  const groups = /* @__PURE__ */ new Map();
  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    const info = periodOf(p.date, period);
    const g = groups.get(info.key) ?? { info, values: [] };
    g.values.push(p.value);
    groups.set(info.key, g);
  }
  return [...groups.values()].sort((a, b) => a.info.start.localeCompare(b.info.start)).map(({ info, values }) => ({
    ...info,
    ...stats(values),
    days: daysBetween(info.start, info.end)
  }));
}
function rangeStats(points, from, to) {
  if (from > to) throw new Error("Der Beginn des Zeitraums muss vor dem Ende liegen.");
  const inside = points.filter((p) => p.date >= from && p.date <= to && Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  const days = daysBetween(from, to);
  if (inside.length === 0) {
    return { from, to, days, count: 0, mean: null, min: null, max: null, first: null, last: null };
  }
  const s = stats(inside.map((p) => p.value));
  return {
    from,
    to,
    days,
    count: s.count,
    mean: s.mean,
    min: s.min,
    max: s.max,
    first: inside[0] ?? null,
    last: inside.at(-1) ?? null
  };
}
function comparePeriods(points, a, b, minCount = 2) {
  const sa = rangeStats(points, a.from, a.to);
  const sb = rangeStats(points, b.from, b.to);
  if (sa.count < minCount || sb.count < minCount) {
    const few = sa.count < minCount ? "im ersten Zeitraum" : "im zweiten Zeitraum";
    const n = Math.min(sa.count, sb.count);
    return {
      a: sa,
      b: sb,
      difference: null,
      reason: n === 0 ? `Kein Vergleich m\xF6glich: ${few} gibt es keine Werte.` : `Kein Vergleich m\xF6glich: ${few} gibt es nur ${n} ${n === 1 ? "Wert" : "Werte"} (mindestens ${minCount} n\xF6tig).`
    };
  }
  return { a: sa, b: sb, difference: sb.mean - sa.mean, reason: null };
}
var RANGE_PRESETS = [
  { value: "4w", label: "4 Wochen", days: 28 },
  { value: "12w", label: "12 Wochen", days: 84 },
  { value: "6m", label: "6 Monate", days: 182 },
  { value: "12m", label: "12 Monate", days: 364 }
];
function presetRanges(preset, today) {
  const p = RANGE_PRESETS.find((r2) => r2.value === preset);
  if (!p) throw new Error(`Unbekannter Zeitraum: ${preset}`);
  const from = shiftDays(today, -(p.days - 1));
  return {
    current: { from, to: today },
    previous: { from: shiftDays(from, -p.days), to: shiftDays(from, -1) }
  };
}
function dailySeries(points, from, to) {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  const n = daysBetween(from, to);
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = shiftDays(from, i);
    out.push({ date, value: byDate.get(date) ?? null });
  }
  return out;
}
function formatRange(from, to) {
  const [fy, fm, fd] = from.split("-");
  const [ty, tm, td] = to.split("-");
  const end = `${td}.${tm}.${ty}`;
  if (from === to) return end;
  return fy === ty ? `${fd}.${fm}.\u2013${end}` : `${fd}.${fm}.${fy}\u2013${end}`;
}
function periodStartBack(today, period, count) {
  if (period === "week") return shiftDays(weekStart(today), -7 * (count - 1));
  const [y, m] = today.split("-").map(Number);
  const index = y * 12 + (m - 1) - (count - 1);
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}-01`;
}

// src/domain/trainingVolume.ts
var E1RM_MAX_REPS = 12;
function epley1RM(weightKg, reps) {
  if (weightKg === null || reps === null || weightKg <= 0 || reps < 1 || reps > E1RM_MAX_REPS) {
    return null;
  }
  const value = reps === 1 ? weightKg : weightKg * (1 + reps / 30);
  return Math.round(value * 10) / 10;
}
function e1rmBySession(log) {
  const best = /* @__PURE__ */ new Map();
  for (const s of log) {
    if (s.isWarmup) continue;
    const value = epley1RM(s.weightKg, s.reps);
    if (value === null) continue;
    const current = best.get(s.workoutId);
    if (!current || value > current.value) {
      best.set(s.workoutId, {
        date: s.date,
        workoutId: s.workoutId,
        value,
        weightKg: s.weightKg,
        reps: s.reps
      });
    }
  }
  return [...best.values()];
}
function bestE1RM(log) {
  return e1rmBySession(log).reduce(
    (best, p) => best === null || p.value > best.value ? p : best,
    null
  );
}

// src/domain/models.ts
var WEIGHT_METRIC_ID = "00000000-0000-7000-8000-000000000001";
var RESTING_HR_METRIC_ID = "00000000-0000-7000-8000-000000000018";
var HRV_METRIC_ID = "00000000-0000-7000-8000-000000000019";

// src/domain/insights.ts
var insights_exports = {};
__export(insights_exports, {
  MIN_ABS_R: () => MIN_ABS_R,
  MIN_PAIRS: () => MIN_PAIRS,
  MIN_WEEK_VALUES: () => MIN_WEEK_VALUES,
  afterTrainingComparison: () => afterTrainingComparison,
  describeAssociation: () => describeAssociation,
  metricSeries: () => metricSeries,
  pairByDate: () => pairByDate,
  pearson: () => pearson,
  recoverySeries: () => recoverySeries,
  sessionLoad: () => sessionLoad,
  sleepQualitySeries: () => sleepQualitySeries,
  sleepSeries: () => sleepSeries,
  trainingLoadByDay: () => trainingLoadByDay,
  weeklySummary: () => weeklySummary
});
var MIN_WEEK_VALUES = 3;
var MIN_PAIRS = 10;
var MIN_ABS_R = 0.3;
function sessionLoad(w) {
  if (w.durationMin === null || w.perceivedExertion === null) return null;
  return w.durationMin * w.perceivedExertion;
}
function trainingLoadByDay(workouts) {
  const days = /* @__PURE__ */ new Map();
  for (const w of workouts) {
    if (w.status !== "done") continue;
    const d = days.get(w.date) ?? {
      date: w.date,
      sessions: 0,
      durationMin: 0,
      volumeKg: 0,
      load: 0,
      incomplete: 0
    };
    d.sessions += 1;
    d.durationMin += w.durationMin ?? 0;
    d.volumeKg += w.volumeKg;
    const l = sessionLoad(w);
    if (l === null) d.incomplete += 1;
    else d.load += l;
    days.set(w.date, d);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function sleepSeries(sleep) {
  return sleep.map((s) => ({ date: s.date, value: s.sleepMin }));
}
function sleepQualitySeries(sleep) {
  return sleep.flatMap((s) => s.quality === null ? [] : [{ date: s.date, value: s.quality }]);
}
function recoverySeries(recovery, key) {
  return recovery.flatMap((r2) => {
    const v = r2[key];
    return v === null ? [] : [{ date: r2.date, value: v }];
  });
}
function metricSeries(measurements, metricId) {
  return measurements.filter((m) => m.metricId === metricId).map((m) => ({ date: m.date, value: m.value }));
}
function pearson(xs, ys) {
  if (xs.length !== ys.length) throw new Error("Beide Reihen m\xFCssen gleich lang sein.");
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
function pairByDate(x, y, lagDays = 0) {
  const xs = new Map(x.map((p) => [p.date, p.value]));
  return y.flatMap((p) => {
    const v = xs.get(shiftDays(p.date, -lagDays));
    return v === void 0 ? [] : [{ date: p.date, x: v, y: p.value }];
  });
}
function describeAssociation(pairs, wording) {
  const n = pairs.length;
  if (n < MIN_PAIRS) {
    return {
      n,
      r: null,
      text: `Noch zu wenige gemeinsame Tage f\xFCr eine Aussage (${n} von mindestens ${MIN_PAIRS}).`
    };
  }
  const r2 = pearson(
    pairs.map((p) => p.x),
    pairs.map((p) => p.y)
  );
  if (r2 === null) {
    return { n, r: r2, text: `Die Werte schwanken zu wenig f\xFCr eine Aussage (${n} Tage).` };
  }
  const rText = `r = ${formatNumber(r2, 2)}, ${n} Tage`;
  if (Math.abs(r2) < MIN_ABS_R) {
    return {
      n,
      r: r2,
      text: `Zwischen ${wording.pair} ist in deinen Daten kein deutlicher Zusammenhang erkennbar (${rText}).`
    };
  }
  const direction = r2 > 0 ? wording.higher : wording.lower;
  return {
    n,
    r: r2,
    text: `${wording.x} ging in deinen Daten tendenziell mit ${direction} einher (${rText}). Das ist eine Beobachtung, kein Nachweis einer Ursache.`
  };
}
function afterTrainingComparison(loads, values) {
  const trained = new Set(loads.map((l) => l.date));
  const after = [];
  const notAfter = [];
  for (const v of values) {
    (trained.has(shiftDays(v.date, -1)) ? after : notAfter).push(v.value);
  }
  const avg = (xs) => xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  return {
    withCount: after.length,
    withoutCount: notAfter.length,
    withMean: avg(after),
    withoutMean: avg(notAfter)
  };
}
var inRange = (date, from, to) => date >= from && date <= to;
function countLabel(n, total, one, many) {
  return `${n} von ${total} ${total === 1 ? one : many}`;
}
function weekValue(label, points, week, prev, opts) {
  const min = opts.minCount ?? MIN_WEEK_VALUES;
  const cur = rangeStats(points, week.from, week.to);
  const before = rangeStats(points, prev.from, prev.to);
  let change = null;
  let diff = null;
  if (cur.count > 0) {
    if (cur.count >= min && before.count >= min) {
      diff = cur.mean - before.mean;
      change = `${opts.formatDiff(diff)} zur Vorwoche`;
    } else if (before.count === 0) {
      change = "Vorwoche ohne Werte";
    } else {
      change = `Kein Vorwochenvergleich (mind. ${min} Werte je Woche n\xF6tig)`;
    }
  }
  return {
    item: {
      label,
      value: cur.mean === null ? "\u2013" : opts.format(cur.mean),
      basis: opts.basis(cur.count),
      change
    },
    mean: cur.mean,
    prevMean: before.mean,
    diff,
    count: cur.count
  };
}
var signedMinutes = (d) => {
  const rounded = Math.round(d);
  if (rounded === 0) return "\xB10 min";
  return `${rounded > 0 ? "+" : "\u2212"}${formatDuration(Math.abs(rounded))}`;
};
var signedPoints = (d) => `${formatSigned(d, 1)} Punkte`;
function weeklySummary(data, weekFrom) {
  const week = { from: weekFrom, to: shiftDays(weekFrom, 6) };
  const prev = { from: shiftDays(weekFrom, -7), to: shiftDays(weekFrom, -1) };
  const sections = [];
  const observations = [];
  const gaps = [];
  const nights = weekValue("Schlafdauer (Mittel)", sleepSeries(data.sleep), week, prev, {
    format: formatDuration,
    formatDiff: signedMinutes,
    basis: (n) => countLabel(n, 7, "Nacht", "N\xE4chten") + " erfasst"
  });
  const quality = weekValue("Schlafqualit\xE4t (Mittel)", sleepQualitySeries(data.sleep), week, prev, {
    format: (v) => `${formatNumber(v, 1)} / 10`,
    formatDiff: signedPoints,
    basis: (n) => `${n} ${n === 1 ? "Angabe" : "Angaben"}`
  });
  sections.push({ area: "sleep", title: "Schlaf", values: [nights.item, quality.item] });
  if (nights.count === 0) gaps.push("Schlaf: in dieser Woche keine Nacht erfasst.");
  if (nights.diff !== null && Math.abs(nights.diff) >= 20) {
    observations.push(
      `Du hast in dieser Woche im Mittel ${formatDuration(Math.abs(nights.diff))} ${nights.diff > 0 ? "l\xE4nger" : "k\xFCrzer"} geschlafen als in der Vorwoche (${nights.count} N\xE4chte erfasst).`
    );
  }
  const readiness2 = weekValue(
    "Erholung (Mittel)",
    recoverySeries(data.recovery, "readiness"),
    week,
    prev,
    {
      format: (v) => `${formatNumber(v, 1)} / 10`,
      formatDiff: signedPoints,
      basis: (n) => countLabel(n, 7, "Tag", "Tagen")
    }
  );
  const fatigue = weekValue(
    "M\xFCdigkeit (Mittel)",
    recoverySeries(data.recovery, "fatigue"),
    week,
    prev,
    {
      format: (v) => `${formatNumber(v, 1)} / 10`,
      formatDiff: signedPoints,
      basis: (n) => countLabel(n, 7, "Tag", "Tagen")
    }
  );
  const soreness = weekValue(
    "Muskelkater (Mittel)",
    recoverySeries(data.recovery, "soreness"),
    week,
    prev,
    {
      format: (v) => `${formatNumber(v, 1)} / 10`,
      formatDiff: signedPoints,
      basis: (n) => countLabel(n, 7, "Tag", "Tagen")
    }
  );
  const stress = weekValue("Stress (Mittel)", recoverySeries(data.recovery, "stress"), week, prev, {
    format: (v) => `${formatNumber(v, 1)} / 10`,
    formatDiff: signedPoints,
    basis: (n) => countLabel(n, 7, "Tag", "Tagen")
  });
  const hr = weekValue(
    "Ruhepuls (Mittel)",
    metricSeries(data.measurements, RESTING_HR_METRIC_ID),
    week,
    prev,
    {
      format: (v) => `${formatNumber(v, 0)} bpm`,
      formatDiff: (d) => `${formatSigned(d, 1)} bpm`,
      basis: (n) => `${n} ${n === 1 ? "Messung" : "Messungen"}`
    }
  );
  const hrv = weekValue(
    "HRV (RMSSD, Mittel)",
    metricSeries(data.measurements, HRV_METRIC_ID),
    week,
    prev,
    {
      format: (v) => `${formatNumber(v, 1)} ms`,
      formatDiff: (d) => `${formatSigned(d, 1)} ms`,
      basis: (n) => `${n} ${n === 1 ? "Messung" : "Messungen"}`
    }
  );
  sections.push({
    area: "recovery",
    title: "Regeneration",
    values: [readiness2, fatigue, soreness, stress, hr, hrv].filter((v) => v.count > 0 || v === readiness2).map((v) => v.item)
  });
  if (readiness2.count + fatigue.count + soreness.count + stress.count === 0) {
    gaps.push("Regeneration: in dieser Woche keine Selbsteinsch\xE4tzung erfasst.");
  }
  if (readiness2.diff !== null && Math.abs(readiness2.diff) >= 1) {
    observations.push(
      `Deine Erholungs-Einsch\xE4tzung lag im Mittel ${formatNumber(Math.abs(readiness2.diff), 1)} Punkte ${readiness2.diff > 0 ? "h\xF6her" : "niedriger"} als in der Vorwoche.`
    );
  }
  const loads = trainingLoadByDay(data.workouts);
  const weekLoads = loads.filter((l) => inRange(l.date, week.from, week.to));
  const prevLoads = loads.filter((l) => inRange(l.date, prev.from, prev.to));
  const sum = (ls, k) => ls.reduce((a, l) => a + l[k], 0);
  const sessions = sum(weekLoads, "sessions");
  const prevSessions = sum(prevLoads, "sessions");
  const load = sum(weekLoads, "load");
  const prevLoad = sum(prevLoads, "load");
  const incomplete = sum(weekLoads, "incomplete");
  const prevIncomplete = sum(prevLoads, "incomplete");
  const volume = sum(weekLoads, "volumeKg");
  const loadComparable = incomplete === 0 && prevIncomplete === 0 && sessions > 0 && prevSessions > 0 && prevLoad > 0;
  sections.push({
    area: "training",
    title: "Training",
    values: [
      {
        label: "Einheiten",
        value: String(sessions),
        basis: `an ${weekLoads.length} ${weekLoads.length === 1 ? "Tag" : "Tagen"}`,
        change: `Vorwoche: ${prevSessions}`
      },
      {
        label: "Trainingszeit",
        value: sessions > 0 ? formatDuration(sum(weekLoads, "durationMin")) : "\u2013",
        basis: "Summe der erfassten Dauern",
        change: null
      },
      {
        label: "Volumen (Wdh. \xD7 kg)",
        value: volume > 0 ? `${formatNumber(volume, 0)} kg` : "\u2013",
        basis: "Arbeitss\xE4tze",
        change: null
      },
      {
        label: "Belastung (Dauer \xD7 Anstrengung)",
        value: load > 0 ? formatNumber(load, 0) : "\u2013",
        basis: sessions === 0 ? "keine abgeschlossene Einheit" : incomplete > 0 ? `${incomplete} ${incomplete === 1 ? "Einheit" : "Einheiten"} ohne Dauer oder Anstrengung nicht enthalten` : "alle Einheiten enthalten",
        change: loadComparable ? `${formatSigned((load - prevLoad) / prevLoad * 100, 0)} % zur Vorwoche` : sessions > 0 ? "Kein Vorwochenvergleich (Angaben unvollst\xE4ndig oder Vorwoche ohne Training)" : null
      }
    ]
  });
  const kcalDays = data.nutrition.filter(
    (d) => d.mealCount > 0 || d.fasttracking && d.energyKcal > 0
  );
  const proteinDays = data.nutrition.filter(
    (d) => d.mealCount > 0 || d.fasttracking && d.proteinG > 0
  );
  const kcal2 = weekValue(
    "Energie (Mittel der erfassten Tage)",
    kcalDays.map((d) => ({ date: d.date, value: d.energyKcal })),
    week,
    prev,
    {
      format: (v) => `${formatNumber(v, 0)} kcal`,
      formatDiff: (d) => `${formatSigned(d, 0)} kcal`,
      basis: (n) => countLabel(n, 7, "Tag", "Tagen") + " erfasst"
    }
  );
  const protein = weekValue(
    "Protein (Mittel der erfassten Tage)",
    proteinDays.map((d) => ({ date: d.date, value: d.proteinG })),
    week,
    prev,
    {
      format: (v) => `${formatNumber(v, 1)} g`,
      formatDiff: (d) => `${formatSigned(d, 1)} g`,
      basis: (n) => countLabel(n, 7, "Tag", "Tagen") + " erfasst"
    }
  );
  if (data.goal?.energyKcal != null && kcal2.mean !== null) {
    kcal2.item.change = `${kcal2.item.change ? `${kcal2.item.change} \xB7 ` : ""}Tagesziel ${formatNumber(data.goal.energyKcal, 0)} kcal`;
  }
  const energyPoints = data.energy ?? [];
  const expenditure = weekValue(
    "Gesamtverbrauch (Mittel, berechnet)",
    energyPoints.map((e) => ({ date: e.date, value: e.totalKcal })),
    week,
    prev,
    {
      format: (v) => `${formatNumber(v, 0)} kcal`,
      formatDiff: (d) => `${formatSigned(d, 0)} kcal`,
      basis: (n) => countLabel(n, 7, "Tag", "Tagen") + " berechenbar"
    }
  );
  const intakeByDate = new Map(kcalDays.map((d) => [d.date, d.energyKcal]));
  const balancePoints = energyPoints.filter((e) => intakeByDate.has(e.date)).map((e) => ({ date: e.date, value: (intakeByDate.get(e.date) ?? 0) - e.totalKcal }));
  const balance = weekValue("Bilanz (Aufnahme \u2212 Verbrauch, Mittel)", balancePoints, week, prev, {
    format: (v) => `${formatSigned(v, 0)} kcal`,
    formatDiff: (d) => `${formatSigned(d, 0)} kcal`,
    basis: (n) => countLabel(n, 7, "Tag", "Tagen") + " mit Ern\xE4hrung und Verbrauch"
  });
  const palValue = weekValue(
    "PAL (Mittel)",
    energyPoints.filter((e) => e.pal !== null).map((e) => ({ date: e.date, value: e.pal })),
    week,
    prev,
    {
      format: (v) => formatNumber(v, 2),
      formatDiff: (d) => formatSigned(d, 2),
      basis: (n) => countLabel(n, 7, "Tag", "Tagen")
    }
  );
  sections.push({
    area: "nutrition",
    title: "Ern\xE4hrung",
    values: [
      kcal2.item,
      protein.item,
      ...[expenditure, balance, palValue].filter((v) => v.count > 0).map((v) => v.item)
    ]
  });
  if (balance.mean !== null && balance.count >= MIN_WEEK_VALUES) {
    observations.push(
      balance.mean < 0 ? `Du hast an den erfassten Tagen im Mittel ${formatNumber(-balance.mean, 0)} kcal weniger gegessen als berechnet verbraucht (${balance.count} Tage). Der Verbrauch ist eine Sch\xE4tzung.` : `Du hast an den erfassten Tagen im Mittel ${formatNumber(balance.mean, 0)} kcal mehr gegessen als berechnet verbraucht (${balance.count} Tage). Der Verbrauch ist eine Sch\xE4tzung.`
    );
  }
  const neatDays = data.neat ?? [];
  const steps = weekValue(
    "Schritte (Mittel der erfassten Tage)",
    neatDays.filter((d) => d.steps !== null).map((d) => ({ date: d.date, value: d.steps })),
    week,
    prev,
    {
      format: (v) => formatNumber(v, 0),
      formatDiff: (d) => formatSigned(d, 0),
      basis: (n) => countLabel(n, 7, "Tag", "Tagen") + " erfasst"
    }
  );
  const neatMinutes = weekValue(
    "Weitere Alltagsbewegung (Mittel)",
    neatDays.filter((d) => d.totalMin > 0).map((d) => ({ date: d.date, value: d.totalMin })),
    week,
    prev,
    {
      format: formatDuration,
      formatDiff: signedMinutes,
      basis: (n) => countLabel(n, 7, "Tag", "Tagen") + " erfasst"
    }
  );
  if (data.goal?.steps != null && steps.mean !== null) {
    steps.item.change = `${steps.item.change ? `${steps.item.change} \xB7 ` : ""}Ziel ${formatNumber(data.goal.steps, 0)}`;
  }
  if (steps.count + neatMinutes.count > 0) {
    sections.push({
      area: "training",
      title: "Alltagsbewegung",
      values: [steps, neatMinutes].filter((v) => v.count > 0).map((v) => v.item)
    });
  }
  if (kcal2.count > 0 && kcal2.count < 7) {
    gaps.push(
      `Ern\xE4hrung: nur an ${kcal2.count} von 7 Tagen erfasst \u2013 das Mittel gilt nur f\xFCr diese Tage.`
    );
  }
  const weight = weekValue(
    "K\xF6rpergewicht (Mittel)",
    metricSeries(data.measurements, WEIGHT_METRIC_ID),
    week,
    prev,
    {
      format: (v) => `${formatNumber(v, 1)} kg`,
      formatDiff: (d) => `${formatSigned(d, 1)} kg`,
      basis: (n) => `${n} ${n === 1 ? "Messung" : "Messungen"}`,
      minCount: 2
    }
  );
  sections.push({ area: "body", title: "K\xF6rper", values: [weight.item] });
  if (loadComparable && readiness2.diff !== null) {
    const loadUp = load > prevLoad * 1.2;
    const loadDown = load < prevLoad * 0.8;
    if (loadUp && readiness2.diff <= -1) {
      observations.push(
        "In dieser Woche war deine Trainingsbelastung deutlich h\xF6her als in der Vorwoche, gleichzeitig lag deine Erholungs-Einsch\xE4tzung niedriger. Das kann zusammenh\xE4ngen, muss es aber nicht \u2013 auch Schlaf, Stress und Alltag spielen eine Rolle."
      );
    } else if (loadDown && readiness2.diff >= 1) {
      observations.push(
        "In dieser Woche war deine Trainingsbelastung niedriger als in der Vorwoche, und deine Erholungs-Einsch\xE4tzung lag h\xF6her. Ob das eine mit dem anderen zusammenh\xE4ngt, l\xE4sst sich aus einer Woche nicht ableiten."
      );
    }
  }
  if (nights.diff !== null && readiness2.diff !== null && Math.abs(nights.diff) >= 20 && Math.abs(readiness2.diff) >= 1) {
    const same = Math.sign(nights.diff) === Math.sign(readiness2.diff);
    observations.push(
      same ? "Schlafdauer und Erholungs-Einsch\xE4tzung haben sich gegen\xFCber der Vorwoche in dieselbe Richtung ver\xE4ndert. Eine einzelne Woche reicht nicht, um daraus einen Zusammenhang abzuleiten." : "Schlafdauer und Erholungs-Einsch\xE4tzung haben sich gegen\xFCber der Vorwoche in entgegengesetzte Richtungen ver\xE4ndert."
    );
  }
  if (hr.count === 1 || hrv.count === 1) {
    observations.push(
      "F\xFCr Ruhepuls bzw. HRV liegt in dieser Woche nur eine Messung vor. Einzelne Werte schwanken stark und werden hier nicht bewertet."
    );
  }
  return {
    ...week,
    sections,
    observations,
    gaps,
    lifestyleNotes: data.lifestyle.filter((n) => inRange(n.date, week.from, week.to))
  };
}

// src/domain/dashboard.ts
var BASELINE_DAYS = 28;
var RECENT_VITAL_DAYS = 3;
var HEADLINES = {
  good: "Gute Voraussetzungen \u2013 normales Training ist gut m\xF6glich.",
  caution: "Etwas ged\xE4mpft \u2013 die Intensit\xE4t heute eher moderat halten.",
  low: "Deutlich unter deinem Normalbereich \u2013 eher locker trainieren oder einen Ruhetag einplanen."
};
var LEVEL_LABELS = {
  good: "Gr\xFCn",
  caution: "Gelb",
  low: "Rot"
};
function inRange2(date, from, to) {
  return date >= from && date <= to;
}
function vitalFactor(data, today, metricId) {
  const from = shiftDays(today, -BASELINE_DAYS);
  const list = data.measurements.filter((m) => m.metricId === metricId && m.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const recent = list.filter((m) => m.date >= shiftDays(today, -RECENT_VITAL_DAYS)).at(-1);
  if (!recent)
    return { ok: false, reason: `keine Messung in den letzten ${RECENT_VITAL_DAYS} Tagen` };
  const base = list.filter((m) => inRange2(m.date, from, shiftDays(today, -1)) && m !== recent).map((m) => m.value);
  if (base.length < 3) return { ok: false, reason: "weniger als 3 fr\xFChere Werte in 28 Tagen" };
  return { ok: true, value: recent.value, base: mean(base), date: recent.date };
}
function fromDay(date, today) {
  if (date === today) return "";
  const [, m, d] = date.split("-");
  return ` (vom ${d}.${m}.)`;
}
function readiness(data, today, sleepGoalMin) {
  const factors = [];
  const missing = [];
  const hrv = vitalFactor(data, today, HRV_METRIC_ID);
  if (hrv.ok) {
    const pct = (hrv.value - hrv.base) / hrv.base * 100;
    factors.push({
      key: "hrv",
      label: "HRV",
      level: pct >= -5 ? "good" : pct >= -15 ? "caution" : "low",
      text: `${formatNumber(hrv.value, 1)} ms${fromDay(hrv.date, today)} \xB7 ${formatSigned(pct, 0)} % zu deinem Schnitt (${formatNumber(hrv.base, 1)} ms)`
    });
  } else missing.push(`HRV (${hrv.reason})`);
  const hr = vitalFactor(data, today, RESTING_HR_METRIC_ID);
  if (hr.ok) {
    const diff = hr.value - hr.base;
    factors.push({
      key: "restingHr",
      label: "Ruhepuls",
      level: diff <= 2 ? "good" : diff <= 5 ? "caution" : "low",
      text: `${formatNumber(hr.value, 0)} bpm${fromDay(hr.date, today)} \xB7 ${formatSigned(diff, 0)} zu deinem Schnitt (${formatNumber(hr.base, 0)} bpm)`
    });
  } else missing.push(`Ruhepuls (${hr.reason})`);
  const night = data.sleep.find((s) => s.date === today);
  const from = shiftDays(today, -BASELINE_DAYS);
  const earlier = data.sleep.filter((s) => inRange2(s.date, from, shiftDays(today, -1))).map((s) => s.sleepMin);
  const sleepTarget = sleepGoalMin ?? (earlier.length >= 3 ? mean(earlier) : null);
  if (night && sleepTarget) {
    const ratio = night.sleepMin / sleepTarget;
    factors.push({
      key: "sleep",
      label: "Schlaf",
      level: ratio >= 0.9 ? "good" : ratio >= 0.75 ? "caution" : "low",
      text: `${formatDuration(night.sleepMin)} \xB7 ${formatNumber(ratio * 100, 0)} % ${sleepGoalMin ? "deines Schlafziels" : "deines Schnitts"} (${formatDuration(Math.round(sleepTarget))})`
    });
  } else missing.push("Schlaf der letzten Nacht");
  const loads = trainingLoadByDay(data.workouts);
  const window = loads.filter((d) => inRange2(d.date, from, shiftDays(today, -1)));
  const withLoad = data.workouts.filter(
    (w) => w.status === "done" && inRange2(w.date, from, today) && w.durationMin !== null && w.perceivedExertion !== null
  ).length;
  const chronic3 = window.reduce((a, d) => a + d.load, 0) / BASELINE_DAYS * 3;
  if (withLoad >= 4 && chronic3 > 0) {
    const acute = loads.filter((d) => inRange2(d.date, shiftDays(today, -2), today)).reduce((a, d) => a + d.load, 0);
    const ratio = acute / chronic3;
    factors.push({
      key: "load",
      label: "Belastung (3 Tage)",
      level: ratio <= 1.3 ? "good" : ratio <= 1.6 ? "caution" : "low",
      text: acute === 0 ? "keine Einheit in den letzten 3 Tagen" : `${formatNumber(ratio * 100, 0)} % deines 3-Tage-Schnitts (Dauer \xD7 Anstrengung)`
    });
  } else missing.push("Belastung (Dauer und Anstrengung der Einheiten)");
  if (factors.length < 2) {
    return {
      level: null,
      headline: "F\xFCr eine Einsch\xE4tzung fehlen noch Werte (mindestens zwei der vier Bereiche).",
      factors,
      missing
    };
  }
  const lows = factors.filter((f) => f.level === "low").length;
  const cautions = factors.filter((f) => f.level === "caution").length;
  const level = lows >= 2 || lows >= 1 && cautions >= 1 ? "low" : lows === 1 || cautions >= 1 ? "caution" : "good";
  return { level, headline: HEADLINES[level], factors, missing };
}
var CARDIO_WEEK_MINUTES = 150;
var DEFAULT_WEEK_TRAININGS = 3;
var WEEK_GOALS_KEY = "ui.week_goals";
var WEEK_TRAININGS_MAX = 14;
var WEEK_CARDIO_MAX_MIN = 3e3;
var WEEK_PROTEIN_DAYS_MAX = 7;
var WEEK_SLEEP_MIN_MIN = 180;
var WEEK_SLEEP_MAX_MIN = 960;
var NO_WEEK_GOALS = {
  trainings: null,
  cardioMin: null,
  proteinDays: null,
  sleepMin: null
};
function limitedInt(v, max, min = 1) {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}
function parseWeekGoals(raw) {
  if (!raw) return NO_WEEK_GOALS;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return NO_WEEK_GOALS;
    return {
      trainings: limitedInt(v.trainings, WEEK_TRAININGS_MAX),
      cardioMin: limitedInt(v.cardioMin, WEEK_CARDIO_MAX_MIN),
      proteinDays: limitedInt(v.proteinDays, WEEK_PROTEIN_DAYS_MAX),
      sleepMin: limitedInt(v.sleepMin, WEEK_SLEEP_MAX_MIN, WEEK_SLEEP_MIN_MIN)
    };
  } catch {
    return NO_WEEK_GOALS;
  }
}
function weekGoalsFromInput(input) {
  const errors = {};
  const read = (key, max, text) => {
    const t = (input[key] ?? "").trim();
    if (t === "") return null;
    const n = Number(t);
    if (!/^\d+$/.test(t) || n < 1 || n > max) {
      errors[key] = `Bitte eine ganze Zahl von 1 bis ${max} ${text} angeben.`;
      return null;
    }
    return n;
  };
  const sleepText = (input.sleepHours ?? "").trim();
  let sleepMin = null;
  if (sleepText !== "") {
    const hours = Number(sleepText.replace(",", "."));
    const min = Math.round(hours * 60);
    if (!/^\d+([.,]\d{1,2})?$/.test(sleepText) || min < WEEK_SLEEP_MIN_MIN || min > WEEK_SLEEP_MAX_MIN) {
      errors.sleepHours = `Bitte Stunden von ${WEEK_SLEEP_MIN_MIN / 60} bis ${WEEK_SLEEP_MAX_MIN / 60} angeben, z. B. 7,5.`;
    } else sleepMin = min;
  }
  const value = {
    trainings: read("trainings", WEEK_TRAININGS_MAX, "Einheiten"),
    cardioMin: read("cardioMin", WEEK_CARDIO_MAX_MIN, "Minuten"),
    proteinDays: read("proteinDays", WEEK_PROTEIN_DAYS_MAX, "Tage"),
    sleepMin
  };
  return Object.keys(errors).length === 0 ? { ok: true, value } : { ok: false, errors };
}
function proteinTarget(goal, weightKg) {
  if (!goal) return null;
  if (goal.proteinGPerKg != null)
    return weightKg !== null ? Math.round(goal.proteinGPerKg * weightKg) : null;
  return goal.proteinG;
}
function weeklyGoals(input) {
  const own = input.settings ?? NO_WEEK_GOALS;
  const { today, data } = input;
  const monday = weekStart(today);
  const elapsed = daysBetween(monday, today);
  const inWeek = (d) => inRange2(d, monday, today);
  const out = [];
  const fromPlan = own.trainings === null && !!input.planDays && input.planDays > 0;
  const target = own.trainings ?? (fromPlan && input.planDays ? input.planDays : DEFAULT_WEEK_TRAININGS);
  const done = new Set(
    data.workouts.filter((w) => w.status === "done" && inWeek(w.date)).map((w) => w.id)
  ).size;
  out.push({
    key: "trainings",
    label: "Einheiten",
    share: Math.min(1, done / target),
    value: `${done} von ${target}`,
    note: own.trainings !== null ? `Eigenes Ziel: ${target} ${target === 1 ? "Einheit" : "Einheiten"} je Woche` : fromPlan ? `Ziel: ${target} Tage deines Plans \u201E${input.planName ?? ""}\u201C` : `Ziel: ${target} Einheiten (ohne Plan)`
  });
  const minutes = Math.round(
    input.cardio.filter((s) => inWeek(s.date)).reduce((a, s) => a + s.durationSeconds, 0) / 60
  );
  const cardioTarget = own.cardioMin ?? CARDIO_WEEK_MINUTES;
  out.push({
    key: "cardio",
    label: "Cardio",
    share: Math.min(1, minutes / cardioTarget),
    value: `${minutes} von ${cardioTarget} min`,
    note: own.cardioMin !== null ? `Eigenes Ziel: ${cardioTarget} min je Woche (WHO: mindestens ${CARDIO_WEEK_MINUTES} min)` : `WHO-Empfehlung: mindestens ${CARDIO_WEEK_MINUTES} Minuten je Woche`
  });
  const protein = proteinTarget(data.goal, input.weightKg);
  if (protein !== null && protein > 0) {
    const met = data.nutrition.filter((n) => inWeek(n.date) && n.proteinG >= protein).length;
    const proteinDays = own.proteinDays ?? elapsed;
    out.push({
      key: "protein",
      label: "Protein",
      share: Math.min(1, met / proteinDays),
      value: `${met} von ${proteinDays} ${proteinDays === 1 ? "Tag" : "Tagen"}`,
      note: own.proteinDays !== null ? `Eigenes Ziel: ${proteinDays} ${proteinDays === 1 ? "Tag" : "Tage"} je Woche mit mindestens ${formatNumber(protein, 0)} g` : `Tage mit mindestens ${formatNumber(protein, 0)} g Protein`
    });
  }
  const sleepGoal = own.sleepMin ?? data.goal?.sleepMin ?? null;
  const nights = data.sleep.filter((s) => inWeek(s.date));
  if (sleepGoal) {
    const avg = nights.length > 0 ? mean(nights.map((s) => s.sleepMin)) : 0;
    out.push({
      key: "sleep",
      label: "Schlaf",
      share: Math.min(1, avg / sleepGoal),
      value: nights.length > 0 ? `\xD8 ${formatDuration(Math.round(avg))}` : "noch keine Nacht",
      note: `${own.sleepMin !== null ? "Eigenes Ziel" : "Ziel"} ${formatDuration(sleepGoal)} \xB7 ${nights.length} ${nights.length === 1 ? "Nacht" : "N\xE4chte"}`
    });
  }
  return out;
}
function streakOf(met, today, days) {
  const first = shiftDays(today, -(days - 1));
  const todayMet = met(today);
  let current = 0;
  let day = todayMet ? today : shiftDays(today, -1);
  while (day >= first && met(day)) {
    current += 1;
    day = shiftDays(day, -1);
  }
  let best = 0;
  let run = 0;
  for (let d = first; d <= today; d = shiftDays(d, 1)) {
    run = met(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best, today: todayMet, atLimit: current > 0 && day < first };
}
function streaks(input) {
  const { today, days, data, dashboard } = input;
  const goal = data.goal;
  const out = [];
  const add = (key, label, goalText, value, target, show) => {
    const now = value(today);
    out.push({
      key,
      label,
      goal: goalText,
      ...streakOf((d) => value(d) >= target, today, days),
      todayShare: Math.max(0, Math.min(1, now / target)),
      todayText: `heute ${show(now)} von ${show(target)}`
    });
  };
  const protein = proteinTarget(goal, input.weightKg);
  if (protein !== null && protein > 0) {
    const byDate = new Map(data.nutrition.map((n) => [n.date, n.proteinG]));
    add(
      "protein",
      "Proteinziel",
      `mindestens ${formatNumber(protein, 0)} g`,
      (d) => byDate.get(d) ?? 0,
      protein,
      (v) => `${formatNumber(v, 0)} g`
    );
  }
  const waterL = goal?.waterL ?? null;
  if (waterL !== null && waterL > 0) {
    const byDate = new Map(dashboard.water.map((w) => [w.date, w.value]));
    add(
      "water",
      "Trinkziel",
      `mindestens ${formatNumber(waterL, 1)} l`,
      (d) => (byDate.get(d) ?? 0) / 1e3,
      waterL,
      (v) => `${formatNumber(v, 1)} l`
    );
  }
  if (dashboard.supplementDays.length > 0) {
    const set = new Set(dashboard.supplementDays);
    add(
      "supplements",
      "Supplements",
      "mindestens ein Eintrag am Tag",
      (d) => set.has(d) ? 1 : 0,
      1,
      (v) => `${formatNumber(v, 0)}`
    );
  }
  const steps = goal?.steps ?? null;
  if (steps !== null && steps > 0) {
    const byDate = new Map((data.neat ?? []).map((n) => [n.date, n.steps ?? 0]));
    add(
      "steps",
      "Schrittziel",
      `mindestens ${formatNumber(steps, 0)} Schritte`,
      (d) => byDate.get(d) ?? 0,
      steps,
      (v) => formatNumber(v, 0)
    );
  }
  const sleepGoal = goal?.sleepMin ?? null;
  if (sleepGoal !== null && sleepGoal > 0) {
    const byDate = new Map(data.sleep.map((s) => [s.date, s.sleepMin]));
    add(
      "sleep",
      "Schlafziel",
      `mindestens ${formatDuration(sleepGoal)}`,
      (d) => byDate.get(d) ?? 0,
      sleepGoal,
      (v) => formatDuration(Math.round(v))
    );
  }
  return out;
}
var REMINDER_RULES = [
  { key: "weight", label: "Gewicht", days: 7, evenIfNever: true, where: "body" },
  { key: "circumference", label: "K\xF6rperumf\xE4nge", days: 7, evenIfNever: true, where: "body" },
  { key: "checkin", label: "Check-In-Fotos", days: 28, evenIfNever: true, where: "training" },
  {
    key: "hrv",
    label: "HRV / Ruhepuls (ANS-Werte)",
    days: 7,
    evenIfNever: false,
    where: "recovery"
  },
  { key: "grip", label: "Griffkraft", days: 30, evenIfNever: false, where: "body" },
  { key: "vo2max", label: "VO2max", days: 90, evenIfNever: false, where: "body" }
];
function dueReminders(dashboard, today) {
  const byKey = new Map(dashboard.lastDates.map((l) => [l.key, l.date]));
  const out = [];
  for (const rule of REMINDER_RULES) {
    const last = byKey.get(rule.key) ?? null;
    if (last === null) {
      if (rule.evenIfNever)
        out.push({
          key: rule.key,
          label: rule.label,
          text: "noch nie erfasst",
          where: rule.where,
          daysSince: null
        });
      continue;
    }
    const since = daysBetween(last, today) - 1;
    if (since >= rule.days) {
      out.push({
        key: rule.key,
        label: rule.label,
        text: `zuletzt vor ${since} ${since === 1 ? "Tag" : "Tagen"} (empfohlen alle ${rule.days} Tage)`,
        where: rule.where,
        daysSince: since
      });
    }
  }
  return out.sort((a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1));
}
var MIN_REGULARITY_NIGHTS = 5;
function clockMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function formatClock(minutes) {
  const t = (Math.round(minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function sd(values) {
  const avg = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - avg) ** 2)));
}
function sleepRegularity(sleep, today, days = 14) {
  const from = shiftDays(today, -(days - 1));
  const beds = [];
  const wakes = [];
  for (const s of sleep) {
    if (!inRange2(s.date, from, today)) continue;
    const b = clockMinutes(s.bedTime);
    const w = clockMinutes(s.wakeTime);
    if (b === null || w === null) continue;
    beds.push(b < 12 * 60 ? b + 1440 : b);
    wakes.push(w);
  }
  if (beds.length < MIN_REGULARITY_NIGHTS) return null;
  const bedSd = sd(beds);
  const wakeSd = sd(wakes);
  const worst = Math.max(bedSd, wakeSd);
  const level = worst <= 30 ? "good" : worst <= 60 ? "caution" : "low";
  const text = level === "good" ? "Regelm\xE4\xDFig \u2013 dein Schlafrhythmus ist stabil." : level === "caution" ? "Mittel \u2013 die Zeiten schwanken sp\xFCrbar." : "Unregelm\xE4\xDFig \u2013 feste Zeiten (auch am Wochenende) helfen oft mehr als l\xE4ngerer Schlaf.";
  return {
    nights: beds.length,
    bedMean: formatClock(mean(beds)),
    wakeMean: formatClock(mean(wakes)),
    bedSd,
    wakeSd,
    level,
    text
  };
}
function metricChange(measurements, metricId, today, days = 30) {
  const from = shiftDays(today, -(days - 1));
  const list = measurements.filter((m) => m.metricId === metricId && inRange2(m.date, from, today)).sort((a, b) => a.date.localeCompare(b.date));
  const last = list.at(-1);
  if (!last) return null;
  const first = list[0];
  const change = first && first !== last ? last.value - first.value : null;
  return {
    latest: last.value,
    latestDate: last.date,
    change,
    since: change !== null && first ? first.date : null,
    unit: last.unit,
    decimals: last.decimals
  };
}
function progressExercises(log, today, days = 90) {
  const from = shiftDays(today, -(days - 1));
  const byExercise = /* @__PURE__ */ new Map();
  for (const s of log) {
    if (s.isWarmup || s.exerciseCategory === "cardio" || !inRange2(s.date, from, today)) continue;
    if (s.weightKg === null || s.reps === null || s.reps < 1 || s.reps > 12) continue;
    const e = byExercise.get(s.exerciseId) ?? { name: s.exerciseName, workouts: /* @__PURE__ */ new Set() };
    e.workouts.add(s.workoutId);
    byExercise.set(s.exerciseId, e);
  }
  return [...byExercise.entries()].map(([exerciseId, e]) => ({ exerciseId, name: e.name, sessions: e.workouts.size })).sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, "de"));
}
function exerciseProgress(log, exerciseId, today, days = 180) {
  const from = shiftDays(today, -(days - 1));
  const points = e1rmBySession(
    log.filter((s) => s.exerciseId === exerciseId && inRange2(s.date, from, today))
  ).sort((a, b) => a.date.localeCompare(b.date));
  const first = points[0];
  const last = points.at(-1);
  return {
    points,
    best: bestE1RM(log.filter((s) => s.exerciseId === exerciseId)),
    changePercent: first && last && points.length >= 2 ? (last.value - first.value) / first.value * 100 : null
  };
}
var MIN_EXTRA_DAYS = 3;
function extrasCheck(extras) {
  const days = extras.filter((d) => d.items > 0);
  if (days.length < MIN_EXTRA_DAYS) return { days: days.length, checks: [] };
  const items = days.reduce((a, d) => a + d.items, 0);
  const avg = (f) => mean(days.map(f));
  const kcal2 = avg((d) => d.energyKcal);
  const share = (missing) => days.reduce((a, d) => a + missing(d), 0) / items;
  const fiber = avg((d) => d.fiberG);
  const salt = avg((d) => d.saltG);
  const sugarPct = kcal2 > 0 ? avg((d) => d.sugarG) * 4 / kcal2 * 100 : 0;
  const satPct = kcal2 > 0 ? avg((d) => d.saturatedFatG) * 9 / kcal2 * 100 : 0;
  return {
    days: days.length,
    checks: [
      {
        key: "fiber",
        label: "Ballaststoffe",
        level: fiber >= 30 ? "good" : fiber >= 20 ? "caution" : "low",
        value: `\xD8 ${formatNumber(fiber, 0)} g am Tag`,
        reference: "mindestens 30 g (DGE)",
        missingShare: share((d) => d.fiberMissing)
      },
      {
        key: "sugar",
        label: "Zucker",
        level: sugarPct <= 10 ? "good" : sugarPct <= 15 ? "caution" : "low",
        value: `\xD8 ${formatNumber(
          avg((d) => d.sugarG),
          0
        )} g \xB7 ${formatNumber(sugarPct, 0)} % der Energie`,
        reference: "unter 10 % der Energie (WHO, freie Zucker)",
        missingShare: share((d) => d.sugarMissing)
      },
      {
        key: "saturatedFat",
        label: "Ges\xE4ttigte Fetts\xE4uren",
        level: satPct <= 10 ? "good" : satPct <= 13 ? "caution" : "low",
        value: `\xD8 ${formatNumber(
          avg((d) => d.saturatedFatG),
          0
        )} g \xB7 ${formatNumber(satPct, 0)} % der Energie`,
        reference: "unter 10 % der Energie (WHO)",
        missingShare: share((d) => d.saturatedFatMissing)
      },
      {
        key: "salt",
        label: "Salz",
        level: salt <= 6 ? "good" : salt <= 8 ? "caution" : "low",
        value: `\xD8 ${formatNumber(salt, 1)} g am Tag`,
        reference: "h\xF6chstens 6 g (DGE)",
        missingShare: share((d) => d.saltMissing)
      }
    ]
  };
}
var MIN_OPEN_PROTEIN = 10;
var MEAL_PROTEIN = 40;
function proteinSuggestions(foods, openProteinG, openKcal, limit = 3) {
  if (openProteinG < MIN_OPEN_PROTEIN) return [];
  const candidates = foods.filter((f) => !f.archived && f.usageCount > 0 && f.proteinG > 0 && f.energyKcal > 0).filter((f) => f.proteinG * 4 / f.energyKcal >= 0.3).sort(
    (a, b) => b.usageCount - a.usageCount || b.proteinG / b.energyKcal - a.proteinG / a.energyKcal
  );
  const out = [];
  const want = Math.min(openProteinG, MEAL_PROTEIN);
  for (const f of candidates) {
    let grams = want / f.proteinG * 100;
    let amount;
    if (f.portionName && f.portionAmount) {
      const portions = Math.min(3, Math.max(1, Math.round(grams / f.portionAmount)));
      grams = portions * f.portionAmount;
      amount = `${portions} \xD7 ${f.portionName}`;
    } else {
      grams = Math.min(500, Math.max(10, Math.round(grams / 10) * 10));
      amount = `${formatNumber(grams, 0)} ${f.basisUnit}`;
    }
    const kcal2 = f.energyKcal * grams / 100;
    if (openKcal !== null && kcal2 > Math.max(openKcal, 0) + 50) continue;
    out.push({
      foodId: f.id,
      name: f.brand ? `${f.name} (${f.brand})` : f.name,
      amount,
      proteinG: f.proteinG * grams / 100,
      energyKcal: kcal2
    });
    if (out.length >= limit) break;
  }
  return out;
}

// src/domain/sleep.ts
var sleep_exports = {};
__export(sleep_exports, {
  SLEEP_PHASES: () => SLEEP_PHASES,
  napMinutesByDate: () => napMinutesByDate,
  parseDurationInput: () => parseDurationInput,
  phaseShares: () => phaseShares,
  sleepEntryRows: () => sleepEntryRows,
  sleepMinutes: () => sleepMinutes,
  sleepWithNaps: () => sleepWithNaps,
  totalSleepWithNaps: () => totalSleepWithNaps,
  typicalShareText: () => typicalShareText
});
var TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
function toMinutes(time) {
  const m = TIME.exec(time);
  if (!m) {
    throw new Error(`Ung\xFCltige Uhrzeit: "${time}" (erwartet HH:MM)`);
  }
  return Number(m[1]) * 60 + Number(m[2]);
}
function sleepMinutes(bedTime, wakeTime) {
  const start = toMinutes(bedTime);
  const end = toMinutes(wakeTime);
  return end > start ? end - start : end + 24 * 60 - start;
}
var SLEEP_PHASES = [
  {
    key: "light",
    label: "Light",
    title: "Light Sleep \u2013 Leichtschlaf",
    typicalMin: 45,
    typicalMax: 55,
    text: "Der K\xF6rper entspannt sich, Herzschlag und Atmung werden langsamer. Das Gehirn verarbeitet Informationen und unterst\xFCtzt die Ged\xE4chtnisbildung. Man ist noch relativ leicht aufzuwecken."
  },
  {
    key: "deep",
    label: "Deep",
    title: "Deep Sleep \u2013 Tiefschlaf",
    typicalMin: 10,
    typicalMax: 20,
    text: "Die wichtigste Phase f\xFCr die k\xF6rperliche Regeneration. Wachstumshormone werden ausgesch\xFCttet, Gewebe wird repariert und das Immunsystem unterst\xFCtzt. Das Aufwachen f\xE4llt besonders schwer."
  },
  {
    key: "rem",
    label: "REM",
    title: "REM Sleep \u2013 Traumschlaf",
    typicalMin: 20,
    typicalMax: 25,
    text: "Das Gehirn ist besonders aktiv, lebhafte Tr\xE4ume treten h\xE4ufig auf. Diese Phase ist wichtig f\xFCr die Verarbeitung von Emotionen, das Lernen und die Ged\xE4chtnisfestigung. Ein Schlafzyklus dauert ungef\xE4hr 90 Minuten, wobei die Dauer variiert. In der ersten Nachth\xE4lfte \xFCberwiegt der Tiefschlaf, gegen Morgen werden die REM-Phasen l\xE4nger."
  }
];
function typicalShareText(info) {
  return `Ca. ${info.typicalMin}\u2013${info.typicalMax} % der Schlafzeit`;
}
function phaseShares(values) {
  const minutes = {
    light: values.lightMin,
    deep: values.deepMin,
    rem: values.remMin
  };
  if (SLEEP_PHASES.some((p) => minutes[p.key] == null || Number.isNaN(minutes[p.key]))) {
    return null;
  }
  const totalMin = SLEEP_PHASES.reduce((s, p) => s + minutes[p.key], 0);
  if (totalMin <= 0) return null;
  return {
    totalMin,
    phases: SLEEP_PHASES.map((p) => {
      const m = minutes[p.key];
      const percent = m / totalMin * 100;
      const rounded = Math.round(percent);
      return {
        key: p.key,
        minutes: m,
        percent,
        typical: rounded >= p.typicalMin && rounded <= p.typicalMax
      };
    })
  };
}
function totalSleepWithNaps(nightMin, napMinutes) {
  return (nightMin ?? 0) + napMinutes.reduce((a, b) => a + b, 0);
}
function parseDurationInput(text) {
  const t = text.trim().toLowerCase();
  if (t === "") return null;
  if (/^\d+$/.test(t)) return Number(t);
  const colon = /^(\d+):([0-5]\d)$/.exec(t);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const hm = /^(\d+)\s*h(?:\s*(\d+)\s*(?:m|min)?)?$/.exec(t);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  return Number.NaN;
}
function napMinutesByDate(naps) {
  const map = /* @__PURE__ */ new Map();
  for (const n of naps) map.set(n.date, (map.get(n.date) ?? 0) + n.durationMin);
  return map;
}
function sleepWithNaps(log, napsByDate) {
  return log.sleepMin + (napsByDate.get(log.date) ?? 0);
}
function sleepEntryRows(logs, naps) {
  const nights = /* @__PURE__ */ new Map();
  for (const l of logs) if (!nights.has(l.date)) nights.set(l.date, l);
  const napsByDate = /* @__PURE__ */ new Map();
  for (const n of naps) napsByDate.set(n.date, [...napsByDate.get(n.date) ?? [], n]);
  const dates = [.../* @__PURE__ */ new Set([...nights.keys(), ...napsByDate.keys()])].sort(
    (a, b) => b.localeCompare(a)
  );
  const rows = [];
  for (const date of dates) {
    const log = nights.get(date);
    if (log) rows.push({ kind: "night", date, log });
    const dayNaps = [...napsByDate.get(date) ?? []].sort(
      (a, b) => a.startTime.localeCompare(b.startTime)
    );
    for (const nap of dayNaps) rows.push({ kind: "nap", date, nap, alone: !log });
  }
  return rows;
}

// src/domain/neat.ts
var neat_exports = {};
__export(neat_exports, {
  KCAL_PER_STEP_AND_KG: () => KCAL_PER_STEP_AND_KG,
  MINUTE_ACTIVITIES: () => MINUTE_ACTIVITIES,
  emptyNeatDraft: () => emptyNeatDraft,
  minuteRows: () => minuteRows,
  neatDraftToInput: () => neatDraftToInput,
  neatToDraft: () => neatToDraft,
  stepKcal: () => stepKcal,
  stepProgress: () => stepProgress
});
var MINUTE_ACTIVITIES = [
  { key: "standingMin", label: "Stehen" },
  { key: "cleaningMin", label: "Reinigungsarbeiten" },
  { key: "gardeningMin", label: "Gartenarbeit" },
  { key: "fidgetingMin", label: "Zappeln (Fidgeting)" },
  { key: "officeMin", label: "Arbeit (B\xFCro)" },
  { key: "physicalMin", label: "Arbeit (Physisch)" },
  { key: "otherMin", label: "Sonstiges" }
];
var emptyMinutes = () => Object.fromEntries(MINUTE_ACTIVITIES.map((a) => [a.key, ""]));
function emptyNeatDraft(date) {
  return { date, exists: false, steps: "", minutes: emptyMinutes(), otherLabel: "", notes: "" };
}
var str = (v) => v === null ? "" : String(v);
function neatToDraft(d) {
  const minutes = emptyMinutes();
  for (const a of MINUTE_ACTIVITIES) minutes[a.key] = str(d[a.key]);
  return {
    date: d.date,
    exists: true,
    steps: str(d.steps),
    minutes,
    otherLabel: d.otherLabel ?? "",
    notes: d.notes ?? ""
  };
}
function neatDraftToInput(d) {
  const p = new FormParser();
  const steps = p.integer("steps", d.steps.replace(/\./g, ""));
  const minutes = {};
  for (const a of MINUTE_ACTIVITIES) minutes[a.key] = p.integer(a.key, d.minutes[a.key]);
  if (p.ok && steps === null && Object.values(minutes).every((m) => m === null)) {
    p.error("steps", "Bitte Schritte oder mindestens eine T\xE4tigkeit eintragen.");
  }
  const total = Object.values(minutes).reduce((s, m) => s + (m ?? 0), 0);
  if (p.ok && total > 1440) {
    p.error("standingMin", "Zusammen h\xF6chstens 1.440 Minuten (24 Stunden) je Tag.");
  }
  if (!p.ok) return { ok: false, errors: p.errors };
  return {
    ok: true,
    input: {
      date: d.date,
      steps,
      ...minutes,
      otherLabel: minutes.otherMin === null ? null : textOrNull(d.otherLabel),
      notes: textOrNull(d.notes)
    }
  };
}
function stepProgress(steps, goal) {
  const s = steps ?? 0;
  if (goal === null || goal <= 0) {
    return { steps: s, goal: null, percent: null, remaining: null, reached: false };
  }
  return {
    steps: s,
    goal,
    percent: s / goal * 100,
    remaining: Math.max(0, goal - s),
    reached: s >= goal
  };
}
function minuteRows(d) {
  return MINUTE_ACTIVITIES.flatMap((a) => {
    const v = d[a.key];
    if (v === null || v === 0) return [];
    const label = a.key === "otherMin" && d.otherLabel ? `Sonstiges: ${d.otherLabel}` : a.label;
    return [{ key: a.key, label, minutes: v }];
  });
}
var KCAL_PER_STEP_AND_KG = 4e-4;
function stepKcal(steps, weightKg) {
  return Math.round(steps * weightKg * KCAL_PER_STEP_AND_KG);
}

// src/domain/recovery.ts
var recovery_exports = {};
__export(recovery_exports, {
  RECOVERY_SCALES: () => RECOVERY_SCALES,
  formatScale: () => formatScale,
  recoveryScale: () => recoveryScale,
  scaleHint: () => scaleHint
});
var RECOVERY_SCALES = [
  {
    key: "readiness",
    label: "Erholung",
    question: "Wie erholt f\xFChlst du dich?",
    min: 1,
    max: 10,
    low: "gar nicht erholt",
    high: "vollst\xE4ndig erholt"
  },
  {
    key: "fatigue",
    label: "M\xFCdigkeit",
    question: "Wie m\xFCde bist du?",
    min: 0,
    max: 10,
    low: "keine M\xFCdigkeit",
    high: "extrem m\xFCde"
  },
  {
    key: "soreness",
    label: "Muskelkater",
    question: "Wie stark ist dein Muskelkater?",
    min: 0,
    max: 10,
    low: "kein Muskelkater",
    high: "sehr starker Muskelkater"
  },
  {
    key: "stress",
    label: "Stress",
    question: "Wie gestresst f\xFChlst du dich?",
    min: 0,
    max: 10,
    low: "kein Stress",
    high: "sehr hoher Stress"
  }
];
function recoveryScale(key) {
  const s = RECOVERY_SCALES.find((x) => x.key === key);
  if (!s) throw new Error(`Unbekannte Skala: ${key}`);
  return s;
}
function scaleHint(key) {
  const s = recoveryScale(key);
  return `${s.min} = ${s.low}, ${s.max} = ${s.high}.`;
}
function formatScale(key, value) {
  if (value === null) return "\u2013";
  return `${value} / ${recoveryScale(key).max}`;
}
export {
  DEFAULT_LAYOUT,
  DISPLAY_DECIMALS,
  FASTED_LABEL,
  GLASS_SIZES_ML,
  GROUP_LABELS,
  INDEPENDENT_LABEL,
  KCAL_PER_GRAM,
  MACRO_KEYS,
  OPTIONAL_KEYS,
  OPTIONAL_LABELS,
  ZERO,
  addDaysIso,
  addNutrientValues,
  addNutrients,
  amountFromPortions,
  arrange,
  countAfterClick,
  dailyNeed,
  dashboard_exports as dashboard,
  dayChart,
  dayMacroGoals,
  daySlots,
  describeGoalProgress,
  describeMacroGoals,
  describeNeed,
  describeOptional,
  describeProteinPerKg,
  describeSupplements,
  describeTiming,
  drinkText,
  drinksMl,
  energy_exports as energy,
  energyGoalView,
  fastNutrients,
  formatAmount,
  formatDate,
  formatDuration,
  formatGrams,
  formatKcal,
  formatLiters,
  formatLongDate,
  formatNumber,
  formatNutrient,
  formatPercent,
  formatSigned,
  formatSupplementAmount,
  glassOptions,
  goalGlasses,
  goalProgress,
  gramsFromPercent,
  groupIntakes,
  groupedValues,
  insights_exports as insights,
  macroBaseKcal,
  macroEnergyShares,
  macroGoalRows,
  macrosOf,
  mealDisplayName,
  mealHasContent,
  mealTypeLabel,
  microValues,
  neat_exports as neat,
  nutrientPercents,
  nutrientsFor,
  optionalOf,
  parseIsoDate,
  parseLayout,
  perServing,
  percentText,
  portionsFromAmount,
  recovery_exports as recovery,
  referenceGroup,
  roundAmount,
  roundGrams,
  roundKcal,
  scaleNutrients,
  scaleRecipeItems,
  setMealNames,
  sleep_exports as sleep,
  stats_exports as stats,
  sumNutrients,
  sumOptional,
  trainingCalc_exports as trainingCalc,
  trends_exports as trends,
  waterGlasses,
  waterPercent,
  waterSummary,
  withDayMacros,
  withProteinFromWeight
};
