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
var OVERVIEW_LAYOUT_KEY = "ui.overview_layout";
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
var NO_MUSCLE_GROUP = "Ohne Muskelgruppe";
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
function weeklyMuscleSets(log, exercises, today, count = 4) {
  const lastMonday = weekStart(today);
  const weeks = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = shiftDays(lastMonday, -7 * i);
    weeks.push({ start, end: shiftDays(start, 6), label: `KW ${isoWeek(start).week}` });
  }
  const groupOf = new Map(
    exercises.map((e) => [e.id, e.muscleGroup?.trim() ? e.muscleGroup.trim() : NO_MUSCLE_GROUP])
  );
  const rows = /* @__PURE__ */ new Map();
  for (const s of log) {
    if (s.isWarmup || s.exerciseCategory !== "strength") continue;
    const index = weeks.findIndex((w) => s.date >= w.start && s.date <= w.end);
    if (index < 0) continue;
    const group = groupOf.get(s.exerciseId) ?? NO_MUSCLE_GROUP;
    let row = rows.get(group);
    if (!row) {
      row = { group, sets: weeks.map(() => 0), volumeKg: weeks.map(() => 0) };
      rows.set(group, row);
    }
    row.sets[index] = (row.sets[index] ?? 0) + 1;
    row.volumeKg[index] = (row.volumeKg[index] ?? 0) + setVolumeKg(s);
  }
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const last = count - 1;
  return {
    weeks,
    rows: [...rows.values()].sort(
      (a, b) => (b.sets[last] ?? 0) - (a.sets[last] ?? 0) || sum(b.sets) - sum(a.sets) || a.group.localeCompare(b.group, "de")
    )
  };
}

// src/domain/planSchedule.ts
var WEEKDAY_LABELS = {
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
  7: "Sonntag"
};
function isoWeekday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return day === 0 ? 7 : day;
}
function germanDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
function daysBetween2(a, b) {
  const ms = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((ms(b) - ms(a)) / 864e5);
}
function describeScheduled(date, time, today) {
  const diff = daysBetween2(today, date);
  const day = diff === 0 ? "heute" : diff === 1 ? "morgen" : `${WEEKDAY_LABELS[isoWeekday(date)]}, ${germanDate(date)}`;
  return `${day}${time ? ` um ${time} Uhr` : ""}`;
}

// src/domain/backup.ts
var EXPORT_REMINDER_DAYS = 7;
var dayNumber = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
function exportReminderState(r2, today) {
  const daysSince = r2.lastExportAt ? Math.max(0, Math.round(dayNumber(today) - dayNumber(r2.lastExportAt))) : null;
  const old = daysSince === null || daysSince >= EXPORT_REMINDER_DAYS;
  const snoozed = r2.snoozedUntil !== null && today <= r2.snoozedUntil;
  const text = daysSince === null ? "Du hast deine Daten noch nie exportiert." : daysSince === 0 ? "Letzter Export: heute." : `Letzter Export vor ${daysSince} ${daysSince === 1 ? "Tag" : "Tagen"}.`;
  return { due: old && !snoozed, daysSince, text };
}

// src/domain/gripFocus.ts
var DEFAULT_GRIP_POSITION = {
  narrow: "neutral",
  wide: "pronated"
};
var DEFAULT_POSITION = {
  biceps_curl: "supinated",
  forearm: "supinated"
};
var DEFAULT_WIDTH = {
  row: "narrow",
  pulldown: "narrow",
  press_flat: "wide",
  press_incline: "wide",
  press_decline: "wide",
  shoulder_press: "wide",
  dip: "narrow"
};
var P1 = [
  { muscle: "lats", percent: 35 },
  { muscle: "traps_middle", percent: 16 },
  { muscle: "biceps", percent: 11 },
  { muscle: "teres", percent: 10 },
  { muscle: "brachialis", percent: 6 },
  { muscle: "lower_back", percent: 6 },
  { muscle: "traps_lower", percent: 5 },
  { muscle: "rear_delts", percent: 3 },
  { muscle: "infraspinatus", percent: 2 },
  { muscle: "traps_upper", percent: 2 },
  { muscle: "brachioradialis", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P2 = [
  { muscle: "lats", percent: 33 },
  { muscle: "traps_middle", percent: 18 },
  { muscle: "teres", percent: 10 },
  { muscle: "biceps", percent: 8 },
  { muscle: "brachialis", percent: 6 },
  { muscle: "lower_back", percent: 6 },
  { muscle: "rear_delts", percent: 5 },
  { muscle: "traps_lower", percent: 5 },
  { muscle: "infraspinatus", percent: 3 },
  { muscle: "traps_upper", percent: 2 },
  { muscle: "brachioradialis", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P3 = [
  { muscle: "lats", percent: 30 },
  { muscle: "traps_middle", percent: 20 },
  { muscle: "teres", percent: 9 },
  { muscle: "rear_delts", percent: 8 },
  { muscle: "brachialis", percent: 7 },
  { muscle: "lower_back", percent: 6 },
  { muscle: "biceps", percent: 5 },
  { muscle: "traps_lower", percent: 5 },
  { muscle: "infraspinatus", percent: 3 },
  { muscle: "brachioradialis", percent: 3 },
  { muscle: "traps_upper", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P4 = [
  { muscle: "traps_middle", percent: 25 },
  { muscle: "lats", percent: 18 },
  { muscle: "rear_delts", percent: 15 },
  { muscle: "traps_lower", percent: 8 },
  { muscle: "biceps", percent: 8 },
  { muscle: "teres", percent: 6 },
  { muscle: "brachialis", percent: 5 },
  { muscle: "infraspinatus", percent: 4 },
  { muscle: "lower_back", percent: 4 },
  { muscle: "traps_upper", percent: 3 },
  { muscle: "brachioradialis", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P5 = [
  { muscle: "traps_middle", percent: 27 },
  { muscle: "rear_delts", percent: 18 },
  { muscle: "lats", percent: 15 },
  { muscle: "traps_lower", percent: 8 },
  { muscle: "teres", percent: 6 },
  { muscle: "infraspinatus", percent: 5 },
  { muscle: "brachialis", percent: 5 },
  { muscle: "traps_upper", percent: 4 },
  { muscle: "biceps", percent: 4 },
  { muscle: "brachioradialis", percent: 3 },
  { muscle: "lower_back", percent: 3 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P6 = [
  { muscle: "traps_middle", percent: 28 },
  { muscle: "rear_delts", percent: 20 },
  { muscle: "lats", percent: 13 },
  { muscle: "traps_lower", percent: 8 },
  { muscle: "teres", percent: 6 },
  { muscle: "infraspinatus", percent: 5 },
  { muscle: "brachialis", percent: 5 },
  { muscle: "traps_upper", percent: 4 },
  { muscle: "biceps", percent: 3 },
  { muscle: "brachioradialis", percent: 3 },
  { muscle: "lower_back", percent: 3 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P7 = [
  { muscle: "lats", percent: 39 },
  { muscle: "biceps", percent: 14 },
  { muscle: "teres", percent: 11 },
  { muscle: "brachialis", percent: 9 },
  { muscle: "traps_lower", percent: 8 },
  { muscle: "traps_middle", percent: 6 },
  { muscle: "chest_lower", percent: 4 },
  { muscle: "forearm_flexors", percent: 3 },
  { muscle: "infraspinatus", percent: 2 },
  { muscle: "rear_delts", percent: 2 },
  { muscle: "brachioradialis", percent: 2 }
];
var P8 = [
  { muscle: "lats", percent: 40 },
  { muscle: "teres", percent: 11 },
  { muscle: "biceps", percent: 11 },
  { muscle: "brachialis", percent: 9 },
  { muscle: "traps_lower", percent: 8 },
  { muscle: "traps_middle", percent: 7 },
  { muscle: "brachioradialis", percent: 4 },
  { muscle: "rear_delts", percent: 3 },
  { muscle: "forearm_flexors", percent: 3 },
  { muscle: "infraspinatus", percent: 2 },
  { muscle: "chest_lower", percent: 2 }
];
var P9 = [
  { muscle: "lats", percent: 40 },
  { muscle: "teres", percent: 11 },
  { muscle: "traps_lower", percent: 9 },
  { muscle: "brachialis", percent: 9 },
  { muscle: "traps_middle", percent: 8 },
  { muscle: "biceps", percent: 7 },
  { muscle: "brachioradialis", percent: 6 },
  { muscle: "rear_delts", percent: 4 },
  { muscle: "infraspinatus", percent: 3 },
  { muscle: "forearm_flexors", percent: 3 }
];
var P10 = [
  { muscle: "lats", percent: 38 },
  { muscle: "biceps", percent: 12 },
  { muscle: "teres", percent: 11 },
  { muscle: "traps_lower", percent: 9 },
  { muscle: "traps_middle", percent: 8 },
  { muscle: "brachialis", percent: 8 },
  { muscle: "rear_delts", percent: 4 },
  { muscle: "infraspinatus", percent: 3 },
  { muscle: "forearm_flexors", percent: 3 },
  { muscle: "brachioradialis", percent: 2 },
  { muscle: "chest_lower", percent: 2 }
];
var P11 = [
  { muscle: "lats", percent: 39 },
  { muscle: "teres", percent: 12 },
  { muscle: "traps_lower", percent: 10 },
  { muscle: "traps_middle", percent: 9 },
  { muscle: "brachialis", percent: 7 },
  { muscle: "biceps", percent: 6 },
  { muscle: "rear_delts", percent: 5 },
  { muscle: "brachioradialis", percent: 5 },
  { muscle: "infraspinatus", percent: 4 },
  { muscle: "forearm_flexors", percent: 3 }
];
var P12 = [
  { muscle: "lats", percent: 40 },
  { muscle: "teres", percent: 12 },
  { muscle: "traps_lower", percent: 10 },
  { muscle: "traps_middle", percent: 9 },
  { muscle: "brachialis", percent: 7 },
  { muscle: "rear_delts", percent: 6 },
  { muscle: "biceps", percent: 5 },
  { muscle: "infraspinatus", percent: 4 },
  { muscle: "brachioradialis", percent: 4 },
  { muscle: "forearm_flexors", percent: 3 }
];
var P13 = [
  { muscle: "chest_lower", percent: 32 },
  { muscle: "chest_upper", percent: 20 },
  { muscle: "front_delts", percent: 16 },
  { muscle: "triceps_lateral", percent: 11 },
  { muscle: "triceps_medial", percent: 10 },
  { muscle: "triceps_long", percent: 4 },
  { muscle: "serratus", percent: 4 },
  { muscle: "forearm_flexors", percent: 2 },
  { muscle: "side_delts", percent: 1 }
];
var P14 = [
  { muscle: "chest_lower", percent: 30 },
  { muscle: "front_delts", percent: 18 },
  { muscle: "chest_upper", percent: 14 },
  { muscle: "triceps_lateral", percent: 13 },
  { muscle: "triceps_medial", percent: 12 },
  { muscle: "triceps_long", percent: 5 },
  { muscle: "serratus", percent: 5 },
  { muscle: "forearm_flexors", percent: 2 },
  { muscle: "side_delts", percent: 1 }
];
var P15 = [
  { muscle: "chest_lower", percent: 32 },
  { muscle: "front_delts", percent: 17 },
  { muscle: "chest_upper", percent: 13 },
  { muscle: "triceps_lateral", percent: 13 },
  { muscle: "triceps_medial", percent: 11 },
  { muscle: "triceps_long", percent: 5 },
  { muscle: "serratus", percent: 5 },
  { muscle: "side_delts", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P16 = [
  { muscle: "chest_lower", percent: 38 },
  { muscle: "front_delts", percent: 17 },
  { muscle: "chest_upper", percent: 15 },
  { muscle: "triceps_lateral", percent: 9 },
  { muscle: "triceps_medial", percent: 8 },
  { muscle: "serratus", percent: 5 },
  { muscle: "triceps_long", percent: 4 },
  { muscle: "side_delts", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P17 = [
  { muscle: "chest_lower", percent: 40 },
  { muscle: "front_delts", percent: 16 },
  { muscle: "chest_upper", percent: 14 },
  { muscle: "triceps_lateral", percent: 9 },
  { muscle: "triceps_medial", percent: 8 },
  { muscle: "serratus", percent: 5 },
  { muscle: "triceps_long", percent: 4 },
  { muscle: "side_delts", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P18 = [
  { muscle: "chest_upper", percent: 36 },
  { muscle: "front_delts", percent: 22 },
  { muscle: "chest_lower", percent: 10 },
  { muscle: "triceps_lateral", percent: 10 },
  { muscle: "triceps_medial", percent: 9 },
  { muscle: "serratus", percent: 6 },
  { muscle: "triceps_long", percent: 3 },
  { muscle: "side_delts", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P19 = [
  { muscle: "chest_upper", percent: 30 },
  { muscle: "front_delts", percent: 24 },
  { muscle: "triceps_lateral", percent: 12 },
  { muscle: "triceps_medial", percent: 11 },
  { muscle: "chest_lower", percent: 8 },
  { muscle: "serratus", percent: 7 },
  { muscle: "triceps_long", percent: 4 },
  { muscle: "side_delts", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P20 = [
  { muscle: "chest_upper", percent: 29 },
  { muscle: "front_delts", percent: 23 },
  { muscle: "triceps_lateral", percent: 12 },
  { muscle: "chest_lower", percent: 10 },
  { muscle: "triceps_medial", percent: 10 },
  { muscle: "serratus", percent: 7 },
  { muscle: "triceps_long", percent: 4 },
  { muscle: "side_delts", percent: 3 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P21 = [
  { muscle: "chest_upper", percent: 31 },
  { muscle: "front_delts", percent: 23 },
  { muscle: "chest_lower", percent: 16 },
  { muscle: "triceps_lateral", percent: 8 },
  { muscle: "triceps_medial", percent: 7 },
  { muscle: "serratus", percent: 7 },
  { muscle: "side_delts", percent: 3 },
  { muscle: "triceps_long", percent: 3 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P22 = [
  { muscle: "chest_upper", percent: 30 },
  { muscle: "front_delts", percent: 22 },
  { muscle: "chest_lower", percent: 18 },
  { muscle: "triceps_lateral", percent: 8 },
  { muscle: "triceps_medial", percent: 7 },
  { muscle: "serratus", percent: 7 },
  { muscle: "side_delts", percent: 3 },
  { muscle: "triceps_long", percent: 3 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P23 = [
  { muscle: "chest_lower", percent: 39 },
  { muscle: "chest_upper", percent: 14 },
  { muscle: "triceps_lateral", percent: 13 },
  { muscle: "triceps_medial", percent: 12 },
  { muscle: "front_delts", percent: 10 },
  { muscle: "triceps_long", percent: 7 },
  { muscle: "serratus", percent: 3 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P24 = [
  { muscle: "chest_lower", percent: 37 },
  { muscle: "triceps_lateral", percent: 15 },
  { muscle: "triceps_medial", percent: 14 },
  { muscle: "front_delts", percent: 12 },
  { muscle: "chest_upper", percent: 8 },
  { muscle: "triceps_long", percent: 8 },
  { muscle: "serratus", percent: 4 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P25 = [
  { muscle: "chest_lower", percent: 39 },
  { muscle: "triceps_lateral", percent: 15 },
  { muscle: "triceps_medial", percent: 13 },
  { muscle: "front_delts", percent: 11 },
  { muscle: "triceps_long", percent: 8 },
  { muscle: "chest_upper", percent: 7 },
  { muscle: "serratus", percent: 4 },
  { muscle: "forearm_flexors", percent: 2 },
  { muscle: "side_delts", percent: 1 }
];
var P26 = [
  { muscle: "chest_lower", percent: 45 },
  { muscle: "front_delts", percent: 11 },
  { muscle: "triceps_lateral", percent: 11 },
  { muscle: "triceps_medial", percent: 10 },
  { muscle: "chest_upper", percent: 9 },
  { muscle: "triceps_long", percent: 7 },
  { muscle: "serratus", percent: 4 },
  { muscle: "forearm_flexors", percent: 2 },
  { muscle: "side_delts", percent: 1 }
];
var P27 = [
  { muscle: "chest_lower", percent: 47 },
  { muscle: "triceps_lateral", percent: 11 },
  { muscle: "front_delts", percent: 10 },
  { muscle: "triceps_medial", percent: 10 },
  { muscle: "chest_upper", percent: 8 },
  { muscle: "triceps_long", percent: 7 },
  { muscle: "serratus", percent: 4 },
  { muscle: "forearm_flexors", percent: 2 },
  { muscle: "side_delts", percent: 1 }
];
var P28 = [
  { muscle: "front_delts", percent: 36 },
  { muscle: "side_delts", percent: 12 },
  { muscle: "triceps_lateral", percent: 12 },
  { muscle: "triceps_medial", percent: 11 },
  { muscle: "chest_upper", percent: 10 },
  { muscle: "traps_upper", percent: 6 },
  { muscle: "triceps_long", percent: 5 },
  { muscle: "serratus", percent: 5 },
  { muscle: "forearm_flexors", percent: 2 },
  { muscle: "rear_delts", percent: 1 }
];
var P29 = [
  { muscle: "front_delts", percent: 34 },
  { muscle: "side_delts", percent: 15 },
  { muscle: "triceps_lateral", percent: 12 },
  { muscle: "triceps_medial", percent: 10 },
  { muscle: "chest_upper", percent: 8 },
  { muscle: "traps_upper", percent: 7 },
  { muscle: "triceps_long", percent: 5 },
  { muscle: "serratus", percent: 5 },
  { muscle: "rear_delts", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P30 = [
  { muscle: "front_delts", percent: 35 },
  { muscle: "side_delts", percent: 16 },
  { muscle: "triceps_lateral", percent: 10 },
  { muscle: "triceps_medial", percent: 9 },
  { muscle: "chest_upper", percent: 9 },
  { muscle: "traps_upper", percent: 7 },
  { muscle: "serratus", percent: 6 },
  { muscle: "triceps_long", percent: 4 },
  { muscle: "rear_delts", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P31 = [
  { muscle: "front_delts", percent: 34 },
  { muscle: "side_delts", percent: 18 },
  { muscle: "triceps_lateral", percent: 10 },
  { muscle: "triceps_medial", percent: 9 },
  { muscle: "chest_upper", percent: 8 },
  { muscle: "traps_upper", percent: 7 },
  { muscle: "serratus", percent: 6 },
  { muscle: "triceps_long", percent: 4 },
  { muscle: "rear_delts", percent: 2 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P32 = [
  { muscle: "chest_lower", percent: 24 },
  { muscle: "triceps_lateral", percent: 20 },
  { muscle: "triceps_medial", percent: 18 },
  { muscle: "triceps_long", percent: 12 },
  { muscle: "front_delts", percent: 12 },
  { muscle: "chest_upper", percent: 4 },
  { muscle: "traps_lower", percent: 4 },
  { muscle: "lats", percent: 3 },
  { muscle: "forearm_flexors", percent: 3 }
];
var P33 = [
  { muscle: "chest_lower", percent: 34 },
  { muscle: "triceps_lateral", percent: 15 },
  { muscle: "front_delts", percent: 14 },
  { muscle: "triceps_medial", percent: 13 },
  { muscle: "triceps_long", percent: 8 },
  { muscle: "chest_upper", percent: 5 },
  { muscle: "traps_lower", percent: 4 },
  { muscle: "lats", percent: 4 },
  { muscle: "forearm_flexors", percent: 3 }
];
var P34 = [
  { muscle: "chest_lower", percent: 53 },
  { muscle: "chest_upper", percent: 23 },
  { muscle: "front_delts", percent: 15 },
  { muscle: "serratus", percent: 4 },
  { muscle: "biceps", percent: 3 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P35 = [
  { muscle: "rear_delts", percent: 42 },
  { muscle: "traps_middle", percent: 22 },
  { muscle: "traps_lower", percent: 10 },
  { muscle: "infraspinatus", percent: 10 },
  { muscle: "teres", percent: 6 },
  { muscle: "side_delts", percent: 5 },
  { muscle: "traps_upper", percent: 3 },
  { muscle: "forearm_flexors", percent: 2 }
];
var P36 = [
  { muscle: "vastus_lateralis", percent: 25 },
  { muscle: "vastus_medialis", percent: 23 },
  { muscle: "glutes", percent: 18 },
  { muscle: "rectus_femoris", percent: 12 },
  { muscle: "adductors", percent: 8 },
  { muscle: "soleus", percent: 4 },
  { muscle: "hamstrings_lateral", percent: 3 },
  { muscle: "hamstrings_medial", percent: 3 },
  { muscle: "gastrocnemius", percent: 3 },
  { muscle: "glute_medius", percent: 1 }
];
var P37 = [
  { muscle: "glutes", percent: 30 },
  { muscle: "vastus_lateralis", percent: 18 },
  { muscle: "vastus_medialis", percent: 17 },
  { muscle: "adductors", percent: 16 },
  { muscle: "rectus_femoris", percent: 8 },
  { muscle: "glute_medius", percent: 3 },
  { muscle: "hamstrings_lateral", percent: 3 },
  { muscle: "hamstrings_medial", percent: 3 },
  { muscle: "gastrocnemius", percent: 1 },
  { muscle: "soleus", percent: 1 }
];
var P38 = [
  { muscle: "glutes", percent: 24 },
  { muscle: "vastus_lateralis", percent: 22 },
  { muscle: "vastus_medialis", percent: 20 },
  { muscle: "adductors", percent: 12 },
  { muscle: "rectus_femoris", percent: 10 },
  { muscle: "hamstrings_lateral", percent: 3 },
  { muscle: "hamstrings_medial", percent: 3 },
  { muscle: "glute_medius", percent: 2 },
  { muscle: "gastrocnemius", percent: 2 },
  { muscle: "soleus", percent: 2 }
];
var P39 = [
  { muscle: "vastus_lateralis", percent: 28 },
  { muscle: "vastus_medialis", percent: 26 },
  { muscle: "glutes", percent: 16 },
  { muscle: "rectus_femoris", percent: 12 },
  { muscle: "adductors", percent: 9 },
  { muscle: "hamstrings_lateral", percent: 2 },
  { muscle: "hamstrings_medial", percent: 2 },
  { muscle: "lower_back", percent: 2 },
  { muscle: "soleus", percent: 2 },
  { muscle: "glute_medius", percent: 1 }
];
var P40 = [
  { muscle: "glutes", percent: 25 },
  { muscle: "vastus_lateralis", percent: 21 },
  { muscle: "vastus_medialis", percent: 20 },
  { muscle: "adductors", percent: 16 },
  { muscle: "rectus_femoris", percent: 8 },
  { muscle: "glute_medius", percent: 3 },
  { muscle: "hamstrings_lateral", percent: 2 },
  { muscle: "hamstrings_medial", percent: 2 },
  { muscle: "lower_back", percent: 2 },
  { muscle: "soleus", percent: 1 }
];
var P41 = [
  { muscle: "vastus_lateralis", percent: 25 },
  { muscle: "vastus_medialis", percent: 23 },
  { muscle: "glutes", percent: 20 },
  { muscle: "adductors", percent: 12 },
  { muscle: "rectus_femoris", percent: 10 },
  { muscle: "glute_medius", percent: 2 },
  { muscle: "hamstrings_lateral", percent: 2 },
  { muscle: "hamstrings_medial", percent: 2 },
  { muscle: "lower_back", percent: 2 },
  { muscle: "soleus", percent: 2 }
];
var P42 = [
  { muscle: "vastus_lateralis", percent: 24 },
  { muscle: "vastus_medialis", percent: 22 },
  { muscle: "glutes", percent: 20 },
  { muscle: "rectus_femoris", percent: 11 },
  { muscle: "adductors", percent: 10 },
  { muscle: "hamstrings_lateral", percent: 3 },
  { muscle: "hamstrings_medial", percent: 3 },
  { muscle: "soleus", percent: 3 },
  { muscle: "glute_medius", percent: 2 },
  { muscle: "lower_back", percent: 2 }
];
var P43 = [
  { muscle: "glutes", percent: 28 },
  { muscle: "vastus_lateralis", percent: 18 },
  { muscle: "adductors", percent: 18 },
  { muscle: "vastus_medialis", percent: 16 },
  { muscle: "rectus_femoris", percent: 7 },
  { muscle: "glute_medius", percent: 4 },
  { muscle: "hamstrings_lateral", percent: 3 },
  { muscle: "hamstrings_medial", percent: 3 },
  { muscle: "lower_back", percent: 2 },
  { muscle: "soleus", percent: 1 }
];
var P44 = [
  { muscle: "glutes", percent: 24 },
  { muscle: "vastus_lateralis", percent: 21 },
  { muscle: "vastus_medialis", percent: 19 },
  { muscle: "adductors", percent: 14 },
  { muscle: "rectus_femoris", percent: 9 },
  { muscle: "glute_medius", percent: 3 },
  { muscle: "hamstrings_lateral", percent: 3 },
  { muscle: "hamstrings_medial", percent: 3 },
  { muscle: "lower_back", percent: 2 },
  { muscle: "soleus", percent: 2 }
];
var P45 = [
  { muscle: "vastus_lateralis", percent: 36 },
  { muscle: "vastus_medialis", percent: 34 },
  { muscle: "rectus_femoris", percent: 30 }
];
var P46 = [
  { muscle: "hamstrings_medial", percent: 47 },
  { muscle: "hamstrings_lateral", percent: 42 },
  { muscle: "sartorius", percent: 6 },
  { muscle: "gastrocnemius", percent: 5 }
];
var P47 = [
  { muscle: "hamstrings_lateral", percent: 41 },
  { muscle: "hamstrings_medial", percent: 41 },
  { muscle: "gastrocnemius", percent: 13 },
  { muscle: "sartorius", percent: 5 }
];
var P48 = [
  { muscle: "adductors", percent: 90 },
  { muscle: "hamstrings_medial", percent: 6 },
  { muscle: "glutes", percent: 4 }
];
var P49 = [
  { muscle: "glute_medius", percent: 50 },
  { muscle: "glutes", percent: 25 },
  { muscle: "tfl", percent: 20 },
  { muscle: "sartorius", percent: 5 }
];
var P50 = [
  { muscle: "glutes", percent: 60 },
  { muscle: "hamstrings_lateral", percent: 12 },
  { muscle: "hamstrings_medial", percent: 12 },
  { muscle: "glute_medius", percent: 8 },
  { muscle: "lower_back", percent: 8 }
];
var P51 = [
  { muscle: "glutes", percent: 62 },
  { muscle: "hamstrings_lateral", percent: 8 },
  { muscle: "hamstrings_medial", percent: 8 },
  { muscle: "glute_medius", percent: 6 },
  { muscle: "adductors", percent: 6 },
  { muscle: "vastus_lateralis", percent: 4 },
  { muscle: "vastus_medialis", percent: 3 },
  { muscle: "lower_back", percent: 2 },
  { muscle: "rectus_femoris", percent: 1 }
];
var P52 = [
  { muscle: "glutes", percent: 40 },
  { muscle: "lower_back", percent: 30 },
  { muscle: "hamstrings_lateral", percent: 15 },
  { muscle: "hamstrings_medial", percent: 15 }
];
var P53 = [
  { muscle: "lower_back", percent: 70 },
  { muscle: "glutes", percent: 18 },
  { muscle: "hamstrings_lateral", percent: 6 },
  { muscle: "hamstrings_medial", percent: 6 }
];
var P54 = [
  { muscle: "gastrocnemius", percent: 65 },
  { muscle: "soleus", percent: 35 }
];
var P55 = [
  { muscle: "soleus", percent: 75 },
  { muscle: "gastrocnemius", percent: 25 }
];
var P56 = [{ muscle: "tibialis", percent: 100 }];
var P57 = [
  { muscle: "biceps", percent: 60 },
  { muscle: "brachialis", percent: 25 },
  { muscle: "brachioradialis", percent: 10 },
  { muscle: "forearm_flexors", percent: 5 }
];
var P58 = [
  { muscle: "biceps", percent: 35 },
  { muscle: "brachialis", percent: 35 },
  { muscle: "brachioradialis", percent: 25 },
  { muscle: "forearm_flexors", percent: 5 }
];
var P59 = [
  { muscle: "brachioradialis", percent: 40 },
  { muscle: "brachialis", percent: 35 },
  { muscle: "biceps", percent: 15 },
  { muscle: "forearm_extensors", percent: 10 }
];
var P60 = [
  { muscle: "triceps_lateral", percent: 35 },
  { muscle: "triceps_medial", percent: 33 },
  { muscle: "triceps_long", percent: 32 }
];
var P61 = [
  { muscle: "triceps_long", percent: 45 },
  { muscle: "triceps_lateral", percent: 28 },
  { muscle: "triceps_medial", percent: 27 }
];
var P62 = [
  { muscle: "forearm_flexors", percent: 85 },
  { muscle: "forearm_extensors", percent: 10 },
  { muscle: "brachioradialis", percent: 5 }
];
var P63 = [
  { muscle: "brachioradialis", percent: 50 },
  { muscle: "forearm_flexors", percent: 25 },
  { muscle: "forearm_extensors", percent: 25 }
];
var P64 = [
  { muscle: "forearm_extensors", percent: 80 },
  { muscle: "brachioradialis", percent: 15 },
  { muscle: "forearm_flexors", percent: 5 }
];
var P65 = [
  { muscle: "abs_upper", percent: 45 },
  { muscle: "abs_lower", percent: 30 },
  { muscle: "obliques", percent: 20 },
  { muscle: "rectus_femoris", percent: 3 },
  { muscle: "sartorius", percent: 2 }
];
var P66 = [
  { muscle: "obliques", percent: 70 },
  { muscle: "abs_upper", percent: 10 },
  { muscle: "abs_lower", percent: 10 },
  { muscle: "lower_back", percent: 10 }
];
var P67 = [
  { muscle: "side_delts", percent: 60 },
  { muscle: "front_delts", percent: 12 },
  { muscle: "traps_upper", percent: 12 },
  { muscle: "rear_delts", percent: 8 },
  { muscle: "serratus", percent: 4 },
  { muscle: "traps_middle", percent: 4 }
];
var P68 = [
  { muscle: "lats", percent: 48 },
  { muscle: "teres", percent: 14 },
  { muscle: "chest_lower", percent: 14 },
  { muscle: "triceps_long", percent: 8 },
  { muscle: "serratus", percent: 8 },
  { muscle: "traps_lower", percent: 4 },
  { muscle: "abs_upper", percent: 4 }
];
var P70 = [
  { muscle: "rectus_femoris", percent: 35 },
  { muscle: "sartorius", percent: 25 },
  { muscle: "abs_lower", percent: 20 },
  { muscle: "tfl", percent: 10 },
  { muscle: "abs_upper", percent: 5 },
  { muscle: "obliques", percent: 5 }
];
var P69 = [
  { muscle: "traps_upper", percent: 70 },
  { muscle: "traps_middle", percent: 15 },
  { muscle: "forearm_flexors", percent: 10 },
  { muscle: "neck", percent: 5 }
];
var ROW_PROFILES = {
  narrow: { supinated: P1, neutral: P2, pronated: P3 },
  wide: { supinated: P4, neutral: P5, pronated: P6 }
};
var PULLDOWN_PROFILES = {
  narrow: { supinated: P7, neutral: P8, pronated: P9 },
  wide: { supinated: P10, neutral: P11, pronated: P12 }
};
var PRESS_FLAT_PROFILES = {
  narrow: { supinated: P13, neutral: P14, pronated: P15 },
  wide: { supinated: P13, neutral: P16, pronated: P17 }
};
var PRESS_INCLINE_PROFILES = {
  narrow: { supinated: P18, neutral: P19, pronated: P20 },
  wide: { supinated: P18, neutral: P21, pronated: P22 }
};
var PRESS_DECLINE_PROFILES = {
  narrow: { supinated: P23, neutral: P24, pronated: P25 },
  wide: { supinated: P23, neutral: P26, pronated: P27 }
};
var SHOULDER_PRESS_PROFILES = {
  narrow: { supinated: P28, neutral: P28, pronated: P29 },
  wide: { supinated: P30, neutral: P30, pronated: P31 }
};
var DIP_PROFILES = {
  narrow: { supinated: P32, neutral: P32, pronated: P32 },
  wide: { supinated: P33, neutral: P33, pronated: P33 }
};
var FLY_PROFILES = {
  narrow: { supinated: P34, neutral: P34, pronated: P34 },
  wide: { supinated: P34, neutral: P34, pronated: P34 }
};
var REVERSE_FLY_PROFILES = {
  narrow: { supinated: P35, neutral: P35, pronated: P35 },
  wide: { supinated: P35, neutral: P35, pronated: P35 }
};
var LEG_PRESS_PROFILES = {
  narrow: { supinated: P36, neutral: P36, pronated: P36 },
  wide: { supinated: P37, neutral: P37, pronated: P37 },
  standard: P38
};
var HACK_SQUAT_PROFILES = {
  narrow: { supinated: P39, neutral: P39, pronated: P39 },
  wide: { supinated: P40, neutral: P40, pronated: P40 },
  standard: P41
};
var BELT_SQUAT_PROFILES = {
  narrow: { supinated: P42, neutral: P42, pronated: P42 },
  wide: { supinated: P43, neutral: P43, pronated: P43 },
  standard: P44
};
var LEG_EXTENSION_PROFILES = {
  narrow: { supinated: P45, neutral: P45, pronated: P45 },
  wide: { supinated: P45, neutral: P45, pronated: P45 }
};
var LEG_CURL_SEATED_PROFILES = {
  narrow: { supinated: P46, neutral: P46, pronated: P46 },
  wide: { supinated: P46, neutral: P46, pronated: P46 }
};
var LEG_CURL_LYING_PROFILES = {
  narrow: { supinated: P47, neutral: P47, pronated: P47 },
  wide: { supinated: P47, neutral: P47, pronated: P47 }
};
var ADDUCTION_PROFILES = {
  narrow: { supinated: P48, neutral: P48, pronated: P48 },
  wide: { supinated: P48, neutral: P48, pronated: P48 }
};
var ABDUCTION_PROFILES = {
  narrow: { supinated: P49, neutral: P49, pronated: P49 },
  wide: { supinated: P49, neutral: P49, pronated: P49 }
};
var GLUTE_KICK_PROFILES = {
  narrow: { supinated: P50, neutral: P50, pronated: P50 },
  wide: { supinated: P50, neutral: P50, pronated: P50 }
};
var HIP_THRUST_PROFILES = {
  narrow: { supinated: P51, neutral: P51, pronated: P51 },
  wide: { supinated: P51, neutral: P51, pronated: P51 }
};
var REVERSE_HYPER_PROFILES = {
  narrow: { supinated: P52, neutral: P52, pronated: P52 },
  wide: { supinated: P52, neutral: P52, pronated: P52 }
};
var BACK_EXTENSION_PROFILES = {
  narrow: { supinated: P53, neutral: P53, pronated: P53 },
  wide: { supinated: P53, neutral: P53, pronated: P53 }
};
var CALF_STANDING_PROFILES = {
  narrow: { supinated: P54, neutral: P54, pronated: P54 },
  wide: { supinated: P54, neutral: P54, pronated: P54 }
};
var CALF_SEATED_PROFILES = {
  narrow: { supinated: P55, neutral: P55, pronated: P55 },
  wide: { supinated: P55, neutral: P55, pronated: P55 }
};
var TIBIALIS_PROFILES = {
  narrow: { supinated: P56, neutral: P56, pronated: P56 },
  wide: { supinated: P56, neutral: P56, pronated: P56 }
};
var BICEPS_CURL_PROFILES = {
  narrow: { supinated: P57, neutral: P58, pronated: P59 },
  wide: { supinated: P57, neutral: P58, pronated: P59 }
};
var TRICEPS_PROFILES = {
  narrow: { supinated: P60, neutral: P60, pronated: P60 },
  wide: { supinated: P60, neutral: P60, pronated: P60 }
};
var TRICEPS_OVERHEAD_PROFILES = {
  narrow: { supinated: P61, neutral: P61, pronated: P61 },
  wide: { supinated: P61, neutral: P61, pronated: P61 }
};
var FOREARM_PROFILES = {
  narrow: { supinated: P62, neutral: P63, pronated: P64 },
  wide: { supinated: P62, neutral: P63, pronated: P64 }
};
var CRUNCH_PROFILES = {
  narrow: { supinated: P65, neutral: P65, pronated: P65 },
  wide: { supinated: P65, neutral: P65, pronated: P65 }
};
var ROTATION_PROFILES = {
  narrow: { supinated: P66, neutral: P66, pronated: P66 },
  wide: { supinated: P66, neutral: P66, pronated: P66 }
};
var LATERAL_RAISE_PROFILES = {
  narrow: { supinated: P67, neutral: P67, pronated: P67 },
  wide: { supinated: P67, neutral: P67, pronated: P67 }
};
var PULLOVER_PROFILES = {
  narrow: { supinated: P68, neutral: P68, pronated: P68 },
  wide: { supinated: P68, neutral: P68, pronated: P68 }
};
var SHRUG_PROFILES = {
  narrow: { supinated: P69, neutral: P69, pronated: P69 },
  wide: { supinated: P69, neutral: P69, pronated: P69 }
};
var HIP_FLEXION_PROFILES = {
  narrow: { supinated: P70, neutral: P70, pronated: P70 },
  wide: { supinated: P70, neutral: P70, pronated: P70 }
};
var P_DEADLIFT = [
  { muscle: "glutes", percent: 24 },
  { muscle: "lower_back", percent: 18 },
  { muscle: "hamstrings_lateral", percent: 13 },
  { muscle: "hamstrings_medial", percent: 13 },
  { muscle: "adductors", percent: 7 },
  { muscle: "vastus_lateralis", percent: 6 },
  { muscle: "vastus_medialis", percent: 5 },
  { muscle: "traps_upper", percent: 4 },
  { muscle: "traps_middle", percent: 3 },
  { muscle: "forearm_flexors", percent: 3 },
  { muscle: "rectus_femoris", percent: 2 },
  { muscle: "lats", percent: 2 }
];
var DEADLIFT_PROFILES = {
  narrow: { supinated: P_DEADLIFT, neutral: P_DEADLIFT, pronated: P_DEADLIFT },
  wide: { supinated: P_DEADLIFT, neutral: P_DEADLIFT, pronated: P_DEADLIFT },
  standard: P_DEADLIFT
};
var P_SISSY_SQUAT = [
  { muscle: "vastus_lateralis", percent: 30 },
  { muscle: "rectus_femoris", percent: 30 },
  { muscle: "vastus_medialis", percent: 28 },
  { muscle: "abs_lower", percent: 4 },
  { muscle: "glutes", percent: 4 },
  { muscle: "adductors", percent: 4 }
];
var SISSY_SQUAT_PROFILES = {
  narrow: { supinated: P_SISSY_SQUAT, neutral: P_SISSY_SQUAT, pronated: P_SISSY_SQUAT },
  wide: { supinated: P_SISSY_SQUAT, neutral: P_SISSY_SQUAT, pronated: P_SISSY_SQUAT },
  standard: P_SISSY_SQUAT
};
var P_ROTATOR_CUFF = [
  { muscle: "infraspinatus", percent: 55 },
  { muscle: "rear_delts", percent: 20 },
  { muscle: "teres", percent: 15 },
  { muscle: "traps_middle", percent: 5 },
  { muscle: "traps_lower", percent: 5 }
];
var ROTATOR_CUFF_PROFILES = {
  narrow: { supinated: P_ROTATOR_CUFF, neutral: P_ROTATOR_CUFF, pronated: P_ROTATOR_CUFF },
  wide: { supinated: P_ROTATOR_CUFF, neutral: P_ROTATOR_CUFF, pronated: P_ROTATOR_CUFF },
  standard: P_ROTATOR_CUFF
};
var P_NECK = [
  { muscle: "neck", percent: 75 },
  { muscle: "traps_upper", percent: 25 }
];
var NECK_PROFILES = {
  narrow: { supinated: P_NECK, neutral: P_NECK, pronated: P_NECK },
  wide: { supinated: P_NECK, neutral: P_NECK, pronated: P_NECK },
  standard: P_NECK
};
var P_STEP_UP = [
  { muscle: "glutes", percent: 30 },
  { muscle: "vastus_lateralis", percent: 18 },
  { muscle: "vastus_medialis", percent: 17 },
  { muscle: "glute_medius", percent: 8 },
  { muscle: "rectus_femoris", percent: 7 },
  { muscle: "adductors", percent: 6 },
  { muscle: "hamstrings_lateral", percent: 4 },
  { muscle: "hamstrings_medial", percent: 4 },
  { muscle: "gastrocnemius", percent: 3 },
  { muscle: "soleus", percent: 3 }
];
var STEP_UP_PROFILES = {
  narrow: { supinated: P_STEP_UP, neutral: P_STEP_UP, pronated: P_STEP_UP },
  wide: { supinated: P_STEP_UP, neutral: P_STEP_UP, pronated: P_STEP_UP },
  standard: P_STEP_UP
};
var P_UPRIGHT_ROW = [
  { muscle: "side_delts", percent: 40 },
  { muscle: "traps_upper", percent: 25 },
  { muscle: "front_delts", percent: 12 },
  { muscle: "traps_middle", percent: 6 },
  { muscle: "biceps", percent: 5 },
  { muscle: "brachialis", percent: 4 },
  { muscle: "brachioradialis", percent: 4 },
  { muscle: "rear_delts", percent: 4 }
];
var UPRIGHT_ROW_PROFILES = {
  narrow: { supinated: P_UPRIGHT_ROW, neutral: P_UPRIGHT_ROW, pronated: P_UPRIGHT_ROW },
  wide: { supinated: P_UPRIGHT_ROW, neutral: P_UPRIGHT_ROW, pronated: P_UPRIGHT_ROW },
  standard: P_UPRIGHT_ROW
};
var GRIP_PROFILES = {
  row: ROW_PROFILES,
  pulldown: PULLDOWN_PROFILES,
  press_flat: PRESS_FLAT_PROFILES,
  press_incline: PRESS_INCLINE_PROFILES,
  press_decline: PRESS_DECLINE_PROFILES,
  shoulder_press: SHOULDER_PRESS_PROFILES,
  dip: DIP_PROFILES,
  fly: FLY_PROFILES,
  reverse_fly: REVERSE_FLY_PROFILES,
  leg_press: LEG_PRESS_PROFILES,
  hack_squat: HACK_SQUAT_PROFILES,
  belt_squat: BELT_SQUAT_PROFILES,
  leg_extension: LEG_EXTENSION_PROFILES,
  leg_curl_seated: LEG_CURL_SEATED_PROFILES,
  leg_curl_lying: LEG_CURL_LYING_PROFILES,
  adduction: ADDUCTION_PROFILES,
  abduction: ABDUCTION_PROFILES,
  glute_kick: GLUTE_KICK_PROFILES,
  hip_thrust: HIP_THRUST_PROFILES,
  reverse_hyper: REVERSE_HYPER_PROFILES,
  back_extension: BACK_EXTENSION_PROFILES,
  calf_standing: CALF_STANDING_PROFILES,
  calf_seated: CALF_SEATED_PROFILES,
  tibialis: TIBIALIS_PROFILES,
  biceps_curl: BICEPS_CURL_PROFILES,
  triceps: TRICEPS_PROFILES,
  triceps_overhead: TRICEPS_OVERHEAD_PROFILES,
  forearm: FOREARM_PROFILES,
  crunch: CRUNCH_PROFILES,
  rotation: ROTATION_PROFILES,
  lateral_raise: LATERAL_RAISE_PROFILES,
  pullover: PULLOVER_PROFILES,
  shrug: SHRUG_PROFILES,
  hip_flexion: HIP_FLEXION_PROFILES,
  deadlift: DEADLIFT_PROFILES,
  sissy_squat: SISSY_SQUAT_PROFILES,
  rotator_cuff: ROTATOR_CUFF_PROFILES,
  neck: NECK_PROFILES,
  step_up: STEP_UP_PROFILES,
  upright_row: UPRIGHT_ROW_PROFILES
};
var PATTERN_MACHINE_IDS = {
  row: /* @__PURE__ */ new Set([
    "prime-evolution-seated-row",
    // PRIME Fitness – Evolution | Seated Row
    "prime-hybrid-seated-row",
    // PRIME Fitness – Hybrid | Seated Row
    "prime-plate-loaded-extreme-row",
    // PRIME Fitness – Plate Loaded | Extreme Row
    "prime-plate-loaded-seated-row",
    // PRIME Fitness – Plate Loaded | Seated Row
    "gym80-3039",
    // gym80 – 3039 Rudermaschine ohne Brustpolster
    "gym80-3040",
    // gym80 – 3040 Rudermaschine
    "gym80-3045",
    // gym80 – 3045 Rudermaschine Dual
    "gym80-4016",
    // gym80 – 4016 Ruderstation
    "gym80-4900",
    // gym80 – 4900 Incline Row Combo
    "gym80-4018",
    // gym80 – 4018 Rudermaschine T-Bar
    "gym80-4318",
    // gym80 – 4318 Bodenhantel Multi-Grip
    "gym80-4319",
    // gym80 – 4319 Low Row Dual
    "gym80-4322",
    // gym80 – 4322 Rudermaschine Sitzend Dual
    "gym80-4327",
    // gym80 – 4327 Power Row Dual
    "gym80-4383",
    // gym80 – 4383 55 Grad Rudermaschine
    "gym80-5907",
    // gym80 – 5907 Rudermaschine Stehend
    "technogym-mk80eh",
    // Technogym – Artis Low Row
    "technogym-mk46eh",
    // Technogym – Artis Rear Delt Row
    "technogym-mnhc",
    // Technogym – Selection 700 Low Row
    "technogym-mnhp",
    // Technogym – Selection 900 Low Row
    "technogym-c98000-anvk",
    // Technogym – Selection Low Row Med
    "technogym-mg25",
    // Technogym – Pure Strength Low Row
    "technogym-mg30",
    // Technogym – Pure Strength Row
    "technogym-pg12",
    // Technogym – T Bar Row
    "lifefitness-axiom-series-seated-row",
    // Life Fitness – Axiom Series - Seated Row
    "lifefitness-hammer-strength-mts-iso-lateral-row",
    // Life Fitness – MTS Iso-Lateral Row
    "lifefitness-hammer-strength-select-seated-row",
    // Life Fitness – Hammer Strength Select Seated Row
    "lifefitness-insignia-series-row",
    // Life Fitness – Insignia Series Row
    "lifefitness-plate-loaded-iso-lateral-low-row",
    // Life Fitness – Iso-Lateral Low Row
    "lifefitness-iso-lateral-t-bar-row",
    // Life Fitness – Iso-Lateral T-Bar Row
    "lifefitness-plate-loaded-iso-lateral-d-y-row",
    // Life Fitness – Plate Loaded Iso-Lateral D.Y. Row
    "lifefitness-plate-loaded-iso-lateral-row",
    // Life Fitness – Plate Loaded Iso-Lateral Row
    "lifefitness-hammer-strength-plate-loaded-t-bar-row",
    // Life Fitness – T-Bar Row
    "lifefitness-life-fitness-row",
    // Life Fitness – Plate Loaded Row
    "atlantis-ms13a",
    // Atlantis – MS13A Unilateral Low Row (NM510 Model) A
    "atlantis-ms13b",
    // Atlantis – MS13B Unilateral Low Row (NM510 Model) B
    "atlantis-ms7a",
    // Atlantis – MS7A Low Row (D124 Model) A
    "atlantis-ms7b",
    // Atlantis – MS7B Low Row (D124 Model) B
    "atlantis-ms8a",
    // Atlantis – MS8A Incline Row (D132 Model) A
    "atlantis-ms8b",
    // Atlantis – MS8B Incline Row (D132 Model) B
    "atlantis-d124",
    // Atlantis – D124 Low row
    "atlantis-d132",
    // Atlantis – D132 Incline row
    "atlantis-d337",
    // Atlantis – D337 Diverging row
    "atlantis-d433",
    // Atlantis – D433 Vertical row
    "atlantis-pw437",
    // Atlantis – PW437 Row
    "atlantis-pw625",
    // Atlantis – PW625 Incline T-Bar Row
    "atlantis-pw637",
    // Atlantis – PW637 Low row
    "newtech-seated-row",
    // Newtech – OnHim Seated Row
    "newtech-seated-row-inward",
    // Newtech – OnHim Seated Row (Inward)
    "newtech-seated-row-outward",
    // Newtech – OnHim Seated Row (Outward)
    "newtech-two-way-row",
    // Newtech – Torture 2 Way Row
    "newtech-front-row",
    // Newtech – Torture Front Row
    "newtech-torture-linear-t-bar-row",
    // Newtech – Torture Linear T-Bar Row
    "newtech-low-row-2-r",
    // Newtech – Torture Low Row (Rotary)
    "newtech-torture-low-row-2",
    // Newtech – Torture Low Row 2
    "newtech-seated-row-2",
    // Newtech – Torture Seated Row
    "newtech-standing-seated-low-combo",
    // Newtech – Torture Standing & Seated Row Combo
    "newtech-torture-twist-row",
    // Newtech – Torture Twist Row
    "newtech-t-bar-row",
    // Newtech – T-Bar Row
    "watson-animal-dual-stack-high-pulley-row",
    // Watson – DS Animal High Pulley Row
    "watson-animal-dual-stack-mid-to-low-row",
    // Watson – DS Animal Mid to Low Row
    "watson-single-stack-dual-cable-low-pulley-row",
    // Watson – SS Dual Cable Low Pulley Row
    "watson-single-stack-low-pulley-row",
    // Watson – SS Low Pulley Row
    "watson-total-access-seated-row",
    // Watson – Total Access Seated Row
    "watson-animal-chest-supported-t-bar-row",
    // Watson – PL Animal Chest Supported T-Bar Row
    "watson-animal-plate-load-lateral-row",
    // Watson – PL Animal Lateral Row
    "watson-plate-load-lateral-row",
    // Watson – PL Lateral Row
    "watson-plate-load-low-row",
    // Watson – PL Low Row
    "watson-plate-load-perfect-row",
    // Watson – PL Perfect Row
    "watson-plate-load-t-bar-row",
    // Watson – PL T-Bar Row
    "gymleco-210-seated-row-cable-machine",
    // Gymleco – 210 Seated Row
    "gymleco-214-lateral-pulldown-seated-row",
    // Gymleco – 214 Lateral Pulldown/Seated Row
    "gymleco-310-seated-row",
    // Gymleco – 310 Seated Row
    "gymleco-312-iso-lateral-low-row",
    // Gymleco – 312 Iso Lateral Low Row
    "gymleco-010-seated-row",
    // Gymleco – 010 Seated Row
    "gymleco-012-iso-lateral-low-row",
    // Gymleco – 012 Iso Lateral Low Row
    "gymleco-017-d-y-row",
    // Gymleco – 017 D.Y. Row
    "gymleco-115-t-bar-row",
    // Gymleco – 115 T-Bar Row
    "gymleco-116-incline-t-bar-row",
    // Gymleco – 116 Incline T-Bar Row
    "nautilus-nautilus-impact-low-row",
    // Nautilus – Impact Low Row
    "nautilus-nautilus-impact-vertical-row",
    // Nautilus – Impact Vertikale Rudermaschine
    "nautilus-nautilus-inspiration-vertical-row",
    // Nautilus – Inspiration Vertical Row
    "nautilus-nautilus-instinct-dual-lat-pull-down-vertical-row",
    // Nautilus – Instinct Dual Lat-Zug/Vertikal-Rudern
    "nautilus-nautilus-instinct-vertical-row",
    // Nautilus – Instinct Vertikal-Rudern
    "nautilus-nautilus-leverage-low-row",
    // Nautilus – Leverage Low Row
    "nautilus-nautilus-plate-loaded-incline-lever-row",
    // Nautilus – Leverage Rowing
    "crossaxes-b-4000c",
    // CrossAxes – B-4000c Cross Axes Vertical Row
    "milon-pump-row",
    // milon – 05 Row
    "panatta-pulley-row",
    // Panatta – 1FE003 Pulley row
    "panatta-rowing-machine-circular",
    // Panatta – 1FE004A Rowing machine circular
    "panatta-total-back",
    // Panatta – 1FE008 Total Back
    "panatta-pulley-row-double",
    // Panatta – 1FE103 Pulley row double Stack
    "panatta-pulley-row-2",
    // Panatta – 1MTH003 Pulley row
    "panatta-rowing-machine-circular-2",
    // Panatta – 1MTH004A Rowing machine circular
    "panatta-high-row-convergent-2",
    // Panatta – 1MTH006 High row convergent
    "panatta-pulley-row-3",
    // Panatta – 1SC003 Pulley row
    "panatta-rowing-machine-2",
    // Panatta – 1SC004 Rowing machine
    "panatta-dual-lat-machine-pulley-row",
    // Panatta – 1SCD010 Dual lat machine | pulley row
    "panatta-low-row-2",
    // Panatta – 1FO002 Low row
    "panatta-rowing-machine-3",
    // Panatta – 1FO004 Rowing machine
    "panatta-power-row-copia",
    // Panatta – 1FO102 Power row
    "panatta-adjustable-row-45",
    // Panatta – 1FO304 Adjustable Row 45°
    "panatta-super-low-row",
    // Panatta – 1FW002 Super low row
    "panatta-t-bar-row",
    // Panatta – 1FW007 T-bar row
    "panatta-super-power-row",
    // Panatta – 1FW102 Super power row
    "panatta-super-rowing",
    // Panatta – 1FW104 Super Rowing
    "panatta-super-rowing-machine-circular",
    // Panatta – 1FW204 Super rowing circular
    "granite-leverage-row-3-0",
    // Granite – Leverage Row 3.0
    "granite-xpload-compound-row-2-0",
    // Granite – Xpload Compound Row 2.0
    "granite-xpload-compound-row-3-0",
    // Granite – Xpload Compound Row 3.0
    "citadel-t-bar-row",
    // Citadel Strength – T-Bar Row
    "eigen-mvzdskz9-2o3p1",
    // Fusio Strenght Engineering – Leverage middle row
    "eigen-mw165upg-yaa1i",
    // gym80 – Low Row
    "eigen-mw16cb9y-5152z",
    // gym80 – 55 Grad Rudermaschine
    "eigen-mw16ut6c-imxnz",
    // Panatta – Fantastic Line | Row
    "eigen-mw1b5zv4-w4kof",
    // Cybex – Galileo Seated Row
    "eigen-mw1b8das-7p8by",
    // Galaxy Sport – Row
    "eigen-mw1ba6ii-poz0x",
    // gym80 – Seated Row
    "eigen-mw1bd69p-bcx8b",
    // L+K – Seated Row
    "eigen-mw1bgko8-z25w4",
    // Nautilus – Seated Row
    "eigen-mw1bjw39-qaipd",
    // Paramount – DRP 600 Low Row
    "gym80-5003",
    // gym80 – Innovation Rudermaschine (zugeordnet 13.11.2026)
    "technogym-mn1p",
    // Technogym – Selection 900 Upper Back (zugeordnet 13.11.2026)
    "technogym-c94600-anvk",
    // Technogym – Selection Upper Back Med (zugeordnet 13.11.2026)
    "eigen-01a18e87-b438-7056-ab2a-7283cb421cdf",
    // Eigene – Citadel High Row (zugeordnet 13.11.2026)
    "panatta-dorsy-bar",
    // Panatta – Dorsy Bar (zugeordnet 13.11.2026)
    "panatta-super-dorsy-bar",
    // Panatta – Super dorsy bar (zugeordnet 13.11.2026)
    "panatta-front-dorsy-bar",
    // Panatta – Front dorsy bar (zugeordnet 13.11.2026)
    "eigen-mw4viggu-r24n7",
    // Cybex – Eagle Row (zugeordnet 13.11.2026)
    "eigen-mw4w0rj6-3demt",
    // Hammer Strenght – Iso Lateral D.Y. Row (zugeordnet 13.11.2026)
    "eigen-mw4w3hk1-w9kz7",
    // EliteFTS – T-Bar Row (zugeordnet 13.11.2026)
    "eigen-mw4w5fpj-mdyyl",
    // Gym80 – T-Bar Row (zugeordnet 13.11.2026)
    "eigen-mw55dwh8-u5chs"
    // ZKC – Bench row (zugeordnet 13.11.2026)
  ]),
  pulldown: /* @__PURE__ */ new Set([
    "prime-evolution-lat-pulldown",
    // PRIME Fitness – Evolution | Lat Pulldown
    "prime-hybrid-lat-pulldown",
    // PRIME Fitness – Hybrid | Lat Pulldown
    "prime-plate-loaded-lat-pulldown",
    // PRIME Fitness – Plate Loaded | Lat Pulldown
    "prime-plate-loaded-pulldown",
    // PRIME Fitness – Plate Loaded | Pulldown
    "gym80-3020",
    // gym80 – 3020 Rückenzugmaschine
    "gym80-3044",
    // gym80 – 3044 Rückenzugmaschine Dual
    "gym80-4116",
    // gym80 – 4116 Rückenzugstation
    "gym80-4311",
    // gym80 – 4311 Rückenzugmaschine Dual
    "gym80-5908",
    // gym80 – 5908 Rückenzug
    "technogym-mk12eh",
    // Technogym – Artis Lat Machine
    "technogym-mk71eh",
    // Technogym – Artis Vertical Traction
    "technogym-mnlc",
    // Technogym – Selection 700 Lat Machine
    "technogym-mngc",
    // Technogym – Selection 700 Vertical Traction
    "technogym-mnlp",
    // Technogym – Selection 900 Lat Machine
    "technogym-mnvp",
    // Technogym – Selection 900 Pulldown
    "technogym-mngp",
    // Technogym – Selection 900 Vertical Traction
    "technogym-c91200-anvk",
    // Technogym – Selection Lat Machine Med
    "technogym-c97100-anvk",
    // Technogym – Selection Vertical Traction Med
    "technogym-mg20",
    // Technogym – Pure Strength Pulldown
    "lifefitness-axiom-series-lat-pulldown",
    // Life Fitness – Axiom Series - Lat Pulldown
    "lifefitness-hammer-strength-mts-iso-lateral-front-pulldown",
    // Life Fitness – MTS Iso-Lateral Front Pulldown
    "lifefitness-hammer-strength-select-fixed-pulldown",
    // Life Fitness – Hammer Strength Select Fixed Pulldown
    "lifefitness-hammer-strength-select-lat-pulldown",
    // Life Fitness – Hammer Strength Select Lat Pulldown
    "lifefitness-insignia-series-pulldown",
    // Life Fitness – Insignia Series Pulldown
    "lifefitness-insignia-series-dual-axis-pulldown",
    // Life Fitness – Insignia Series Pulldown - Dual Axis
    "lifefitness-plate-loaded-iso-lateral-wide-pulldown",
    // Life Fitness – Iso-Lateral Wide Pulldown
    "lifefitness-plate-loaded-iso-lateral-front-lat-pulldown",
    // Life Fitness – Plate Loaded Iso-Lateral Front Lat Pulldown
    "lifefitness-life-fitness-front-pulldown",
    // Life Fitness – Plate Loaded Front Pulldown
    "atlantis-ms12a",
    // Atlantis – MS12A Unilateral Lat Pulldown (NM500 Model) A
    "atlantis-ms12b",
    // Atlantis – MS12B Unilateral Lat Pulldown (NM500 Model) B
    "atlantis-ms6a",
    // Atlantis – MS6A Lat Pulldown (D123 Model) A
    "atlantis-ms6b",
    // Atlantis – MS6B Lat Pulldown (D123 Model) A
    "atlantis-d123",
    // Atlantis – D123 Lat pulldown
    "atlantis-pw423",
    // Atlantis – PW423 Front pulldown
    "atlantis-pw623",
    // Atlantis – PW623 Unilateral Lat Pulldown
    "newtech-advance-pro-lat-pulldown",
    // Newtech – OnHim Advance Pro Lat Pulldown
    "newtech-lat-pulldown-high-pulley",
    // Newtech – OnHim Lat Pulldown (High Pulley)
    "newtech-vertical-pull-down",
    // Newtech – Torture Vertical Pull Down
    "newtech-wide-pulldown-front",
    // Newtech – Torture Wide Pulldown Front
    "newtech-wide-pulldown-rear-2",
    // Newtech – Torture Wide Pulldown Rear 2
    "watson-animal-dual-stack-front-pulldown",
    // Watson – DS Animal Front Pulldown
    "watson-animal-dual-stack-lat-pulldown",
    // Watson – DS Animal Lat Pulldown
    "watson-single-stack-dual-cable-lat-pulldown",
    // Watson – SS Dual Cable Lat Pulldown
    "watson-single-stack-lat-pulldown",
    // Watson – SS Lat Pulldown
    "watson-total-access-lat-pulldown",
    // Watson – Total Access Lat Pulldown
    "watson-plate-load-front-pulldown",
    // Watson – PL Front Pulldown
    "gymleco-211-lateral-pulldown",
    // Gymleco – 211 Lateral Pulldown
    "gymleco-211r-lateral-pulldown-rehab",
    // Gymleco – 211R Lateral Pulldown, Adjustable
    "gymleco-311-iso-lateral-pulldown",
    // Gymleco – 311 Iso Lateral Pulldown
    "gymleco-011-iso-lateral-pulldown",
    // Gymleco – 011 Iso Lateral Pulldown
    "nautilus-nautilus-humansport-lat-pulley",
    // Nautilus – HumanSport Lat Pulley
    "nautilus-nautilus-impact-fixed-lat-pull-down",
    // Nautilus – Impact Fixed Lat Pull Down
    "nautilus-nautilus-impact-lat-pull-down",
    // Nautilus – Impact Latzug
    "nautilus-nautilus-inspiration-lat-pull-down",
    // Nautilus – Inspiration Latzug
    "nautilus-nautilus-instinct-lat-pull-down",
    // Nautilus – Instinct Lat-Zug
    "nautilus-nautilus-leverage-lat-pull-down",
    // Nautilus – Leverage Pull Down
    "eigen-mw1b17h1-4eqyr",
    // Nautilus – Lat Pulldown
    "panatta-fantastic-lat-machine",
    // Panatta – 1FT001 Lat Machine
    "panatta-lat-pulldown",
    // Panatta – 1FE001 Lat pulldown
    "panatta-lat-pulldown-2",
    // Panatta – 1MTH001 Lat pulldown
    "panatta-lat-pulldown-3",
    // Panatta – 1SC001 Lat pulldown
    "panatta-lat-pulldown-circular",
    // Panatta – 1FE002 Lat pulldown circular
    "panatta-lat-pulldown-circular-2",
    // Panatta – 1MTH002 Lat pulldown circular
    "panatta-lat-pulldown-circular-3",
    // Panatta – 1FO101 Lat pulldown circular
    "panatta-lat-pulldown-convergent",
    // Panatta – 1FE007 Lat pulldown convergent
    "panatta-lat-pulldown-convergent-2",
    // Panatta – 1MTH007 Lat pulldown convergent
    "panatta-lat-pulldown-double",
    // Panatta – 1FE101 Lat pulldown double Stack
    "panatta-lat-machine-convergent-2",
    // Panatta – 1FO001 Lat machine convergent
    "panatta-super-lat-pulldown-circular",
    // Panatta – 1FW101 Super lat pulldown circular
    "granite-leverage-pulldown",
    // Granite – Leverage Pulldown
    "granite-leverage-pulldown-2-0",
    // Granite – Leverage Pulldown 2.0
    "granite-xpload-pulldown-2-0",
    // Granite – Xpload Pulldown 2.0
    "citadel-lat-pulldown",
    // Citadel Strength – Lat Pulldown
    "citadel-vertical-pulldown",
    // Citadel Strength – Vertical Pulldown
    "crossaxes-b-2000c",
    // CrossAxes – B-2000c Cross Axes Pulldown
    "milon-pump-pull-down",
    // milon – 09 Pull Down
    "gym80-4340",
    // gym80 – 4340 High Row Dual
    "gym80-4382",
    // gym80 – 4382 High Row mit Beweglichen Griffen
    "lifefitness-plate-loaded-iso-lateral-high-row",
    // Life Fitness – Iso-Lateral High Row
    "lifefitness-hammer-strength-mts-iso-lateral-high-row",
    // Life Fitness – MTS Iso-Lateral High Row
    "lifefitness-life-fitness-high-row",
    // Life Fitness – Plate Loaded High Row
    "newtech-high-row",
    // Newtech – Torture High Row
    "gymleco-013-iso-lateral-high-row",
    // Gymleco – 013 Iso Lateral High Row
    "nautilus-nautilus-leverage-high-row",
    // Nautilus – Leverage Row
    "panatta-high-row-convergent",
    // Panatta – 1FE006 High row convergent
    "panatta-high-row-2",
    // Panatta – 1FO003 High row
    "panatta-super-high-row",
    // Panatta – 1FW003 Super high row
    "lifefitness-axiom-series-lat-pulldown-low-row",
    // Life Fitness – Axiom Series - Lat Pulldown/Low Row
    "lifefitness-hd-elite-dual-pulldown-row",
    // Life Fitness – Pulldown / Row
    "atlantis-d438",
    // Atlantis – D438 Lat pulldown/ Low row combo (heavy stack)
    "watson-lat-pulldown-low-pulley",
    // Watson – SS Lat Pulldown / Low Pulley Row
    "gym80-5015",
    // gym80 – 5015 Schulter und Latzug Combo
    "gymleco-911-pulldown-shoulder-press",
    // Gymleco – 911 Pulldown/Shoulder Press
    "panatta-lat-pulley-module",
    // Panatta – 4GRDFC51 Lat/ pulley module
    "gym80-3047",
    // gym80 – Iso Lat (zugeordnet 13.11.2026)
    "atlantis-ms10",
    // Atlantis – Chin-up beam (zugeordnet 13.11.2026)
    "eigen-01a18e87-b44b-77d4-bbf2-25bf7ca52e93",
    // Eigene – Klimmzüge (zugeordnet 13.11.2026)
    "panatta-pang-machine",
    // Panatta – Pang machine (zugeordnet 13.11.2026)
    "eigen-mvwxzejn-g00rq"
    // gym80 – Assisted Standing Pull Up Machine (zugeordnet 13.11.2026)
  ]),
  press_flat: /* @__PURE__ */ new Set([
    "prime-evolution-chest-press",
    // PRIME Fitness – Evolution | Chest Press
    "prime-hybrid-chest-press",
    // PRIME Fitness – Hybrid | Chest Press
    "prime-plate-loaded-chest-press",
    // PRIME Fitness – Plate Loaded | Chest Press
    "gym80-3016",
    // gym80 – 3016 Brustpresse
    "gym80-3097",
    // gym80 – 3097 Inner Chest Press
    "gym80-3041",
    // gym80 – 3041 Brustpresse Dual
    "gym80-4328",
    // gym80 – 4328 Bankdrückmaschine Sitzend Dual
    "gym80-4331",
    // gym80 – 4331 Drückbank Liegend Dual
    "gym80-4376",
    // gym80 – 4376 Inner Chest Liegend Dual
    "gym80-4364",
    // gym80 – 4364 Drückbank Dual
    "gym80-5901",
    // gym80 – 5901 Brustpresse Stehend
    "gym80-80a00009",
    // gym80 – 80A00009 Verstellbare Drückbank
    "gym80-80a00014",
    // gym80 – 80A00014 Stehende Brustpresse
    "technogym-mk70eh",
    // Technogym – Artis Chest Press
    "technogym-mnfc",
    // Technogym – Selection 700 Chest Press
    "technogym-mnfp",
    // Technogym – Selection 900 Chest Press
    "technogym-c97000-anvk",
    // Technogym – Selection Chest Press Med
    "technogym-mg05",
    // Technogym – Pure Strength Chest Press
    "technogym-mg10",
    // Technogym – Pure Strength Wide Chest Press
    "lifefitness-axiom-series-chest-press",
    // Life Fitness – Axiom Series - Chest Press
    "lifefitness-axiom-series-multi-press",
    // Life Fitness – Axiom Series - Multi-Press
    "lifefitness-hammer-strength-mts-iso-lateral-chest-press",
    // Life Fitness – MTS Iso-Lateral Chest Press
    "lifefitness-hammer-strength-select-chest-press",
    // Life Fitness – Hammer Strength Select Chest Press
    "lifefitness-insignia-series-chest-press",
    // Life Fitness – Insignia Series Chest Press
    "lifefitness-insignia-series-dual-axis-chest-press",
    // Life Fitness – Insignia Series Chest Press - Dual Axis
    "lifefitness-plate-loaded-iso-lateral-horizontal-bench-press",
    // Life Fitness – Iso-Lateral Horizontal Bench Press
    "lifefitness-plate-loaded-iso-lateral-wide-chest",
    // Life Fitness – Iso-Lateral Wide Chest
    "lifefitness-plate-loaded-iso-lateral-bench-press",
    // Life Fitness – Plate Loaded Iso-Lateral Bench Press
    "lifefitness-plate-loaded-iso-lateral-chest-back",
    // Life Fitness – Plate Loaded Iso-Lateral Chest/Back
    "atlantis-p140",
    // Atlantis – P140 Seated converging chest press
    "atlantis-p439",
    // Atlantis – P439 Decline / Flat converging bench press
    "atlantis-p441",
    // Atlantis – P441 Lying converging bench press
    "atlantis-pw737",
    // Atlantis – PW737 Vertical chest press
    "newtech-seated-chest-press-1",
    // Newtech – OnHim Chest Press (Rotary)
    "newtech-chest-decline-combo",
    // Newtech – Torture Chest & Decline Combo
    "newtech-torture-chest-decline-combo-2",
    // Newtech – Torture Chest & Decline Combo 2
    "newtech-seated-chest-press-2",
    // Newtech – Torture Seated Chest Press (Rotary)
    "newtech-wide-chest-press",
    // Newtech – Torture Wide Chest Press
    "newtech-torture-wide-chest-press-2",
    // Newtech – Torture Wide Chest Press 2
    "newtech-plate-flat-press",
    // Newtech – Plate Flat Press
    "watson-animal-dual-stack-chest-press",
    // Watson – DS Animal Chest Press
    "watson-total-access-chest-press",
    // Watson – Total Access Chest Press
    "watson-single-stack-chest-press",
    // Watson – SS Chest Press
    "watson-single-stack-multi-press",
    // Watson – SS Multi-Press
    "watson-animal-converging-standing-chest-press",
    // Watson – PL Animal Converging Standing Chest Press
    "watson-plate-load-free-motion-chest-press",
    // Watson – PL Free Motion Chest Press
    "watson-standing-chest-press",
    // Watson – PL Standing Chest Press
    "gymleco-921-chest-press-back",
    // Gymleco – 921 Chest Press/Back
    "gymleco-321-seated-wide-chest-press",
    // Gymleco – 321 Seated Wide Chest Press
    "gymleco-021-seated-chest-press",
    // Gymleco – 021 Seated Chest Press
    "gymleco-022-iso-lateral-bench-press-horizontal",
    // Gymleco – 022 ISO Lateral Bench Press, Horizontal
    "gymleco-028-standing-chest-press",
    // Gymleco – 028 Standing Chest Press
    "nautilus-nautilus-impact-chest-press",
    // Nautilus – Impact Chest Press
    "nautilus-nautilus-inspiration-chest-press",
    // Nautilus – Inspiration Brustpresse
    "nautilus-nautilus-instinct-chest-press",
    // Nautilus – Instinct Brustpresse
    "nautilus-nautilus-instinct-dual-multi-press",
    // Nautilus – Instinct Dual Multi-Presse
    "nautilus-nautilus-leverage-chest-press",
    // Nautilus – Leverage Chest Press
    "crossaxes-c-2000c",
    // CrossAxes – C-2000c Cross Axes Chest Press
    "milon-pump-dual-chest-press",
    // milon – 06 Dual Chest Press
    "panatta-vertical-multi-press",
    // Panatta – 1FT045 Vertical Multi Press
    "panatta-total-press",
    // Panatta – 1FE032 Total Press
    "panatta-vertical-chest-press-circular",
    // Panatta – 1FE033 Vertical chest press circular
    "panatta-vertical-chest-press",
    // Panatta – 1FE036 Vertical chest press
    "panatta-multipurpose-press",
    // Panatta – 1FE118A Multipurpose press
    "panatta-vertical-chest-press-circular-2",
    // Panatta – 1MTH033 Vertical chest press circular
    "panatta-vertical-chest-convergent",
    // Panatta – 1SC034 Vertical chest convergent
    "panatta-certical-chest-press",
    // Panatta – 1FO036 Vertical chest press
    "panatta-super-vertical-chest-press",
    // Panatta – 1FW036 Super vertical chest press
    "panatta-super-horizontal-bench-press",
    // Panatta – 1FW037 Super Horizontal Bench Press
    "panatta-super-horizontal-multi-press",
    // Panatta – 1FW042 Super horizontal multi press
    "panatta-super-vertical-multi-press",
    // Panatta – 1FW045 Super vertical multi press
    "granite-leverage-chest-press-3-0",
    // Granite – Leverage Chest Press 3.0
    "granite-xpload-chest-press-2-0",
    // Granite – Xpload Chest Press 2.0
    "eigen-mw0xujbr-gmbq3",
    // Flex – Leverage Chest Press
    "eigen-mw2e5r3b-p9jvy",
    // Schnell – Standig Chest Press
    "eigen-mw2ej86w-bhbcc",
    // Gym80 – Flat Chest Press
    "eigen-mw2eqjgk-k9u0v",
    // Galaxy Sport – Seated Chest Press
    "eigen-mw2exhw2-5cp3y",
    // Nautilus – XPload Chest Press
    "eigen-mw2f33y3-n5ani",
    // Galaxy Sport – Flat Chest Press
    "eigen-mw2f8zz4-zskih",
    // Rogers – Pendulum Chest Press
    "gym80-3014",
    // gym80 – Brustmaschine (zugeordnet 13.11.2026)
    "gym80-3121",
    // gym80 – Brustmaschine Stehend (zugeordnet 13.11.2026)
    "gym80-4326",
    // gym80 – Brustmaschine Dual (zugeordnet 13.11.2026)
    "panatta-kito-machine"
    // Panatta – Kito machine (zugeordnet 13.11.2026)
  ]),
  press_incline: /* @__PURE__ */ new Set([
    "prime-hybrid-incline-press",
    // PRIME Fitness – Hybrid | Incline Press
    "prime-plate-loaded-incline-press",
    // PRIME Fitness – Plate Loaded | Incline Press
    "gym80-3023n",
    // gym80 – 3023N Schrägbank
    "gym80-3042",
    // gym80 – 3042 Schrägbank Dual
    "gym80-4329n",
    // gym80 – 4329N Schrägbank Dual
    "gym80-4365",
    // gym80 – 4365 Schrägbank Dual
    "technogym-mg15",
    // Technogym – Pure Strength Incline Chest Press
    "lifefitness-hammer-strength-mts-iso-lateral-incline-press",
    // Life Fitness – MTS Iso-Lateral Incline Press
    "lifefitness-plate-loaded-iso-lateral-incline-press",
    // Life Fitness – Iso-Lateral Incline Press
    "lifefitness-plate-loaded-iso-lateral-super-incline-press",
    // Life Fitness – Plate Loaded Iso-Lateral Super Incline Press
    "lifefitness-life-fitness-incline-press",
    // Life Fitness – Plate Loaded Incline Press
    "atlantis-p143",
    // Atlantis – P143 Incline Converging Chest Press
    "atlantis-p443",
    // Atlantis – P443 Converging incline bench press
    "newtech-incline-chest-press-1",
    // Newtech – Torture Incline Chest Press
    "newtech-torture-incline-chest-press-2",
    // Newtech – Torture Incline Chest Press 2
    "newtech-plate-incline-press",
    // Newtech – Plate Incline Press
    "watson-plate-load-super-incline-chest-press",
    // Watson – PL Super Incline Chest Press
    "gymleco-320-incline-chest-press",
    // Gymleco – 320 Incline Chest Press
    "gymleco-020-lateral-incline-bench-press",
    // Gymleco – 020 Lateral Incline Bench Press
    "nautilus-nautilus-impact-incline-press",
    // Nautilus – Impact Incline Press
    "nautilus-nautilus-leverage-incline-press",
    // Nautilus – Leverage Incline Press
    "panatta-inclined-chest-press-circular",
    // Panatta – 1FE034 Inclined chest press circular
    "panatta-inclined-chest-press",
    // Panatta – 1FE037 Inclined chest press
    "panatta-inclined-chest-press-circular-2",
    // Panatta – 1MTH034 Inclined chest press circular
    "panatta-inclined-chest-press-3",
    // Panatta – 1SC037 Inclined chest press
    "panatta-inclined-chest-press-4",
    // Panatta – 1FO035 Inclined chest press
    "panatta-super-inclined-bench-press",
    // Panatta – 1FW033 Super inclined bench press
    "panatta-super-inclined-chest-press",
    // Panatta – 1FW035 Super inclined chest press
    "granite-xpload-incline-chest-press",
    // Granite – Xpload Incline Chest Press
    "eigen-mw2dveah-lykc1",
    // CrossAxes – Incline Chest Press
    "eigen-mw2eugog-08mqb",
    // Revive – Incline Chest Press
    "eigen-mw2f5qtw-wmdn8",
    // Galaxy Sport – Incline Chest Press
    "gymleco-029-incline-press-chest-flyes"
    // Gymleco – 029 Incline Press / Chest Flyes
  ]),
  press_decline: /* @__PURE__ */ new Set([
    "gym80-4346",
    // gym80 – 4346 Negativdrückbank Dual
    "gym80-4362",
    // gym80 – 4362 Negativdrückbank Dual
    "lifefitness-hammer-strength-mts-iso-lateral-decline-press",
    // Life Fitness – MTS Iso-Lateral Decline Press
    "lifefitness-plate-loaded-iso-lateral-decline-chest-press",
    // Life Fitness – Plate Loaded Iso-Lateral Decline Chest Press
    "lifefitness-life-fitness-decline-chest-press",
    // Life Fitness – Plate Loaded Decline Chest Press
    "atlantis-pw739",
    // Atlantis – PW739 Decline vertical chest press
    "newtech-plate-decline-press",
    // Newtech – Plate Decline Press
    "watson-animal-dual-stack-decline-chest-press",
    // Watson – DS Animal Decline Chest Press
    "watson-plate-load-decline-chest-press",
    // Watson – PL Decline Chest Press
    "gymleco-027-decline-chest-press",
    // Gymleco – 027 Decline Chest Press
    "nautilus-nautilus-leverage-decline-press",
    // Nautilus – Leverage Decline Press
    "panatta-declined-chest-press",
    // Panatta – 1FO041 Declined chest press
    "panatta-super-declined-chest-press"
    // Panatta – 1FW041 Super declined chest press
  ]),
  shoulder_press: /* @__PURE__ */ new Set([
    "prime-evolution-shoulder-press",
    // PRIME Fitness – Evolution | Shoulder Press
    "prime-hybrid-shoulder-press",
    // PRIME Fitness – Hybrid | Shoulder Press
    "prime-plate-loaded-shoulder-press",
    // PRIME Fitness – Plate Loaded | Shoulder Press
    "gym80-3032",
    // gym80 – 3032 Schulterpresse
    "gym80-3043",
    // gym80 – 3043 Schulterpresse Dual
    "gym80-4363",
    // gym80 – 4363 Schulterdrückmaschine Dual
    "gym80-5902",
    // gym80 – 5902 Schulterpresse Stehend
    "gym80-3096",
    // gym80 – 3096 Nackendrückmaschine
    "gym80-4371",
    // gym80 – 4371 Nackendrückmaschine
    "technogym-mk69eh",
    // Technogym – Artis Shoulder Press
    "technogym-mnec",
    // Technogym – Selection 700 Shoulder Press
    "technogym-mnep",
    // Technogym – Selection 900 Shoulder Press
    "technogym-c96900-anvk",
    // Technogym – Selection Shoulder Press Med
    "technogym-mg35",
    // Technogym – Pure Strength Shoulder Press
    "lifefitness-axiom-series-shoulder-press",
    // Life Fitness – Axiom Series - Shoulder Press
    "lifefitness-mts-iso-lateral-shoulder-press",
    // Life Fitness – MTS Iso-Lateral Shoulder Press
    "lifefitness-hammer-strength-select-shoulder-press",
    // Life Fitness – Hammer Strength Select Shoulder Press
    "lifefitness-insignia-series-shoulder-press",
    // Life Fitness – Insignia Series Shoulder Press
    "lifefitness-plate-loaded-iso-lateral-shoulder-press",
    // Life Fitness – Iso-Lateral Shoulder Press
    "lifefitness-life-fitness-shoulder-press",
    // Life Fitness – Plate Loaded Shoulder Press
    "panatta-deltoid-press",
    // Panatta – 1FE025 Deltoid press
    "panatta-deltoid-press-3",
    // Panatta – 1FO025 Deltoid press
    "panatta-deltoid-press-circular",
    // Panatta – 1FE024 Deltoid press circular
    "panatta-deltoid-press-circular-2",
    // Panatta – 1MTH024 Deltoid press circular
    "panatta-deltoid-press-convergent",
    // Panatta – 1SC024 Deltoid press convergent
    "panatta-super-deltoid-press",
    // Panatta – 1FW025 Super deltoid press
    "atlantis-e149",
    // Atlantis – E149 Converging shoulder press
    "atlantis-e449",
    // Atlantis – E449 Converging shoulder press
    "newtech-shoulder-press",
    // Newtech – OnHim Shoulder Press
    "newtech-shoulder-press-2",
    // Newtech – Torture Shoulder Press
    "newtech-torture-shoulder-press-2",
    // Newtech – Torture Shoulder Press 2
    "newtech-plate-shouldwe-press",
    // Newtech – Plate Shoulder Press
    "watson-animal-dual-stack-shoulder-press",
    // Watson – DS Animal Shoulder Press
    "watson-single-stack-shoulder-press",
    // Watson – SS Shoulder Press
    "watson-plate-load-shoulder-press",
    // Watson – PL Shoulder Press
    "watson-plate-load-free-motion-shoulder-press",
    // Watson – PL Free Motion Shoulder Press
    "gymleco-330-shoulder-press",
    // Gymleco – 330 Shoulder Press
    "gymleco-030-shoulder-press",
    // Gymleco – 030 Shoulder Press
    "nautilus-nautilus-impact-shoulder-press",
    // Nautilus – Impact Schulterpresse
    "nautilus-nautilus-inspiration-shoulder-press",
    // Nautilus – Inspiration Shoulder Press
    "nautilus-nautilus-instinct-shoulder-press",
    // Nautilus – Instinct Schulterpresse
    "nautilus-nautilus-leverage-shoulder-press",
    // Nautilus – Leverage Shoulder Press
    "crossaxes-s-1000c",
    // CrossAxes – S-1000c Cross Axes Shoulder Press
    "milon-pump-shoulder-press",
    // milon – 10 Shoulder Press
    "granite-double-barrel-shoulder-press",
    // Granite – Double Barrel Shoulder Press
    "granite-xpload-shoulder-press-2-0",
    // Granite – Xpload Shoulder Press 2.0
    "gym80-4388",
    // gym80 – 4388 Viking Press
    "atlantis-pw549",
    // Atlantis – PW549 Viking press
    "watson-animal-viking-press",
    // Watson – PL Animal Viking Press
    "watson-viking-press",
    // Watson – PL Viking Press
    "gymleco-038-viking-press",
    // Gymleco – 038 Viking Press
    "panatta-viking-press",
    // Panatta – 1FO029 Viking Press
    "panatta-viking-press-and-calf",
    // Panatta – 1FW029 Viking press and calf
    "watson-plate-loaded-incline-shoulder-press",
    // Watson – PL Incline Shoulder Press
    "gym80-4320",
    // gym80 – Schultermaschine Dual (zugeordnet 13.11.2026)
    "gymleco-336-shoulder-front-press",
    // Gymleco – Shoulder Front Press (zugeordnet 13.11.2026)
    "panatta-max-machine",
    // Panatta – Max machine (zugeordnet 13.11.2026)
    "eigen-mwai6lum-i58bo",
    // Atlantis – Converging Shoulder Press E-149 (zugeordnet 13.11.2026)
    "eigen-mwaiadif-154hi"
    // Nautilus – XPload ISO Lateral Plate Loaded Overhead Shoulder Press (zugeordnet 13.11.2026)
  ]),
  dip: /* @__PURE__ */ new Set([
    "gym80-3036",
    // gym80 – 3036 Dipmaschine
    "gym80-4335",
    // gym80 – 4335 Trizeps Dip Maschine Dual
    "gym80-5904",
    // gym80 – 5904 Trizeps Dip Stehend
    "gym80-80a00015",
    // gym80 – 80A00015 Trizeps Dip
    "panatta-dips-press",
    // Panatta – 1FE038 Dips press
    "panatta-dips-press-3",
    // Panatta – 1MTH138 Dips press
    "panatta-dips-press-4",
    // Panatta – 1FO140 Dips Press
    "panatta-dips-press-2",
    // Panatta – 1FW140 Dips press
    "panatta-dips-press-dual-system",
    // Panatta – 1FW040 Dips press dual system
    "technogym-mg55",
    // Technogym – Pure Strength Seated Dip
    "lifefitness-plate-loaded-seated-dip",
    // Life Fitness – Plate Loaded Seated Dip
    "lifefitness-life-fitness-seated-dip",
    // Life Fitness – Plate Loaded Seated Dip
    "newtech-seated-dip",
    // Newtech – OnHim Seated Dip
    "watson-seated-single-stack-tricep-dip",
    // Watson – SS Tricep Dip
    "watson-total-access-tricep-dip",
    // Watson – Total Access Tricep Dip
    "watson-seated-plate-loaded-dip",
    // Watson – PL Seated Dip
    "watson-standing-iso-dip",
    // Watson – PL Standing ISO Dip
    "gymleco-055-dip-press",
    // Gymleco – 055 Dip Press
    "nautilus-nautilus-impact-dip-machine",
    // Nautilus – Impact Dip
    "nautilus-nautilus-inspiration-tricep-dip",
    // Nautilus – Inspiration Tricep Dip
    "nautilus-tricep-dip",
    // Nautilus – Trizeps-Dip
    "gymleco-954-shoulder-lift-dips",
    // Gymleco – 954 Shoulder Lift/Dips
    "gymleco-354-dips-press-shoulder-pull"
    // Gymleco – 354 Dips Press/Shoulder Pull
  ]),
  fly: /* @__PURE__ */ new Set([
    "gym80-3021",
    // gym80 – 3021 Butterfly mit Pads
    "gym80-3022",
    // gym80 – 3022 Butterfly
    "gym80-4341",
    // gym80 – 4341 Butterfly Dual
    "gym80-4390",
    // gym80 – 4390 Butterfly 50 Grad
    "gym80-5909",
    // gym80 – 5909 Butterfly Stehend
    "panatta-pectoral-machine",
    // Panatta – 1FE035 Pectoral machine
    "panatta-pectoral-machine-2",
    // Panatta – 1mth035 Pectoral machine
    "panatta-pectoral-machine-3",
    // Panatta – 1SC035 Pectoral machine
    "panatta-fantastic-vertical-pek-dek",
    // Panatta – 1FT036 Vertical Pek Dek
    "panatta-upper-chest-flight-machine",
    // Panatta – 1FO038 Upper Chest Flight Machine
    "panatta-super-upper-chest-flight-machine",
    // Panatta – 1FW038 Super upper chest flight machine
    "panatta-super-middle-chest-flight-machine-copia",
    // Panatta – 1FO043 Middle chest flight machine
    "panatta-super-middle-chest-flight-machine",
    // Panatta – 1FW043 Super middle chest flight machine
    "panatta-super-lower-chest-flight-machine",
    // Panatta – 1FW044 Super lower chest flight machine
    "prime-hybrid-pec-fly",
    // PRIME Fitness – Hybrid | Pec Fly
    "technogym-mk13eh",
    // Technogym – Artis Pectoral
    "technogym-mntp",
    // Technogym – Selection 900 Pectoral
    "lifefitness-hammer-strength-select-pectoral-fly",
    // Life Fitness – Hammer Strength Select Pectoral Fly
    "lifefitness-super-fly",
    // Life Fitness – Super Fly
    "atlantis-p356",
    // Atlantis – P356 Vertical pec fly
    "atlantis-pw256",
    // Atlantis – PW256 Incline pec fly
    "newtech-onhim-seated-chest-fly-new",
    // Newtech – OnHim Seated Chest Fly
    "newtech-pec-dec-fly",
    // Newtech – Torture Pec Dec Fly
    "watson-plate-load-pec-fly",
    // Watson – PL Pec Fly
    "watson-pl-arched-incline-pec-fly",
    // Watson – PL Arched Incline Pec Fly
    "gymleco-323-seated-pec-deck",
    // Gymleco – 323 Seated Pec Deck
    "gymleco-326-standing-pec-fly",
    // Gymleco – 326 Standing Pec Fly
    "gymleco-023-incline-pec-fly",
    // Gymleco – 023 Incline Pec Fly
    "milon-pump-chest-squeezer",
    // milon – 07 Chest Squeezer
    "eigen-mw4v4fyj-baelv",
    // Schnell – Chest Fly (zugeordnet 13.11.2026)
    "eigen-mw4v78cr-v5c17",
    // EliteFTS – Chest Fly (zugeordnet 13.11.2026)
    "eigen-mw4v8rmb-5vj8m",
    // Atlantis – Chest Fly (zugeordnet 13.11.2026)
    "eigen-mw4vcgwg-y0us0",
    // Gym80 – Chest Fly (zugeordnet 13.11.2026)
    "eigen-mw4veh6i-uqzbd"
    // Gym80 – Chest Fly 2.0 (zugeordnet 13.11.2026)
  ]),
  reverse_fly: /* @__PURE__ */ new Set([
    "gym80-3025",
    // gym80 – 3025 Butterfly Reverse
    "gym80-4344",
    // gym80 – 4344 Butterfly Reverse Dual
    "technogym-mnxp",
    // Technogym – Selection 900 Reverse Fly
    "gymleco-333-rear-deltoid-shoulder",
    // Gymleco – 333 Rear Deltoid Shoulder
    "gym80-80a00016",
    // gym80 – 80A00016 Seithebemaschine Vorgebeugt
    "nautilus-nautilus-impact-deltoid-fly",
    // Nautilus – Impact Deltoid Fly
    "panatta-back-deltoids-3",
    // Panatta – Back deltoids (zugeordnet 13.11.2026)
    "panatta-back-deltoids"
    // Panatta – Back deltoids (zugeordnet 13.11.2026)
  ]),
  leg_press: /* @__PURE__ */ new Set([
    "prime-evolution-leg-press",
    // PRIME Fitness – Evolution | Leg Press
    "prime-hybrid-leg-press",
    // PRIME Fitness – Hybrid | Leg Press
    "prime-plate-loaded-leg-press",
    // PRIME Fitness – Plate Loaded | Leg Press
    "gym80-3030",
    // gym80 – 3030 Beinpresse Sitzend
    "gym80-3031",
    // gym80 – 3031 Beinpresse Liegend
    "gym80-5001",
    // gym80 – 5001 Innovation Beinpresse
    "gym80-3046",
    // gym80 – 3046 Beinpresse Dual
    "gym80-4023",
    // gym80 – 4023 45 Grad Beinpresse
    "gym80-4314",
    // gym80 – 4314 Beinpresse Sitzend Dual
    "gym80-4324",
    // gym80 – 4324 45 Grad Pivot Beinpresse
    "gym80-4354",
    // gym80 – 4354 Vertikale Beinpresse
    "gym80-4361",
    // gym80 – 4361 Beinpresse Dual
    "technogym-mk51eh",
    // Technogym – Artis Leg Press
    "technogym-mnac",
    // Technogym – Selection 700 Leg Press
    "technogym-mnap",
    // Technogym – Selection 900 Leg Press
    "technogym-c99400-anvk",
    // Technogym – Selection Leg Press Med
    "technogym-mg50",
    // Technogym – Pure Strength Leg Press
    "technogym-mg75",
    // Technogym – Pure Strength Linear Leg Press
    "lifefitness-axiom-series-leg-press",
    // Life Fitness – Axiom Series - Leg Press
    "lifefitness-hammer-strength-select-seated-leg-press",
    // Life Fitness – Hammer Strength Select Seated Leg Press
    "lifefitness-insignia-series-arc-leg-press",
    // Life Fitness – Insignia Series Arc Leg Press
    "lifefitness-plate-loaded-linear-leg-press",
    // Life Fitness – Plate Loaded Linear Leg Press
    "lifefitness-super-squat-press",
    // Life Fitness – Super Squat Press
    "lifefitness-life-fitness-linear-leg-press",
    // Life Fitness – Plate Loaded Linear Leg Press
    "bootybuilder-booty-builder-multi-leg-press-hack-squat",
    // Booty Builder – Selectorized Multi Leg Press/Hack Squat
    "atlantis-c403",
    // Atlantis – C403 Horizontal leg press
    "atlantis-c401",
    // Atlantis – C401 40 Degree leg press
    "atlantis-pw419",
    // Atlantis – PW419 Unilateral leg press pro
    "newtech-seated-leg-press",
    // Newtech – OnHim Seated Leg Press (Thomson)
    "newtech-onhim-super-leg-press-new",
    // Newtech – OnHim Super Leg Press (Thomson)
    "newtech-power-leg-press",
    // Newtech – Torture Power Leg Press (Thomson)
    "newtech-toture-power-leg-press-premium-thomsonnew",
    // Newtech – Torture Power Leg Press Premium (Thomson)
    "watson-seated-single-stack-leg-press",
    // Watson – SS Leg Press
    "watson-45-leg-press",
    // Watson – PL 45° Leg Press
    "watson-animal-horizontal-leg-press",
    // Watson – PL Animal Horizontal Leg Press
    "watson-animal-plate-load-leg-press",
    // Watson – PL Animal Leg Press
    "watson-animal-vertical-leg-press",
    // Watson – PL Animal Vertical Leg Press
    "watson-plate-load-pivot-leg-press",
    // Watson – PL Pivot Leg Press
    "watson-rear-pivot-plate-loaded-leg-press",
    // Watson – PL Rear Pivot Leg Press
    "watson-vertical-plate-load-leg-press",
    // Watson – PL Vertical Leg Press
    "gymleco-343-seated-leg-press",
    // Gymleco – 343 Seated Leg Press
    "gymleco-344-horizontal-lying-leg-press",
    // Gymleco – 344 Horizontal Lying Leg Press
    "gymleco-243-leg-press-45",
    // Gymleco – 243 Leg Press 45°
    "nautilus-nautilus-impact-seated-leg-press",
    // Nautilus – Impact Seated Leg Press
    "nautilus-nautilus-inspiration-leg-press",
    // Nautilus – Inspiration Beinpresse
    "nautilus-nautilus-plate-loaded-angled-leg-press",
    // Nautilus – Angled Leg Press
    "nautilus-angled-leg-press-pro",
    // Nautilus – Angled Leg Press Pro
    "crossaxes-l-4000c",
    // CrossAxes – L-4000c Seated Leg Press
    "panatta-leg-press-45-3",
    // Panatta – 1FT086 Leg Press 45
    "panatta-horizontal-leg-press",
    // Panatta – 1FE085 Horizontal leg press
    "panatta-dual-system-horizontal-leg-press",
    // Panatta – 1FE095 Dual system horizontal leg press
    "panatta-horizontal-leg-press-2",
    // Panatta – 1MTH085 Horizontal Adjustable leg press
    "panatta-horizontal-leg-press-3",
    // Panatta – 1SC085 Horizontal leg press
    "panatta-horizontal-leg-press-medical",
    // Panatta – 1SC085M Horizontal leg press medical
    "panatta-leg-press-bridge-2",
    // Panatta – 1FO085 Leg press bridge
    "panatta-leg-press-45-2",
    // Panatta – 1FO086 Leg press 45°
    "panatta-super-leg-press-bridge",
    // Panatta – 1FW085 Super leg press bridge
    "panatta-super-leg-press-45",
    // Panatta – 1FW086 Super leg press 45°
    "panatta-super-leg-press-45-dual-system",
    // Panatta – 1FW090 Super leg press 45° dual system
    "panatta-super-vertical-leg-press",
    // Panatta – 1FW093 Super vertical leg press
    "panatta-super-horizontal-leg-press-dual-system",
    // Panatta – 1FW100 Super Horizontal Leg Press Dual System
    "panatta-vertical-leg-press",
    // Panatta – 1FW193 Vertical leg press
    "eigen-mw0xh345-967q6",
    // EliteFTS – Monster Mondo Leg Press
    "eigen-mw0xr41h-9wo3x",
    // EliteFTS – Leg Press
    "eigen-mw0y0u36-cs9e6",
    // Nautilus – Duo Squat
    "eigen-mw1a6mne-acwzp",
    // EliteFTS – Monster Mondo Leg Press
    "atlantis-c201",
    // Atlantis – Pivot press (zugeordnet 13.11.2026)
    "panatta-luiz-machine"
    // Panatta – Luiz machine (zugeordnet 13.11.2026)
  ]),
  hack_squat: /* @__PURE__ */ new Set([
    "prime-plate-loaded-hack-squat",
    // PRIME Fitness – Plate Loaded | Hack Squat
    "prime-plate-loaded-pendulum-squat",
    // PRIME Fitness – Plate Loaded | Pendulum Squat
    "gym80-4038n",
    // gym80 – 4038N Kniebeugemaschine
    "gym80-4159n",
    // gym80 – 4159N Hackenschmidt
    "gym80-4353n",
    // gym80 – 4353N Pendulum Squat
    "gym80-5906",
    // gym80 – 5906 Kniebeugemaschine
    "technogym-mg85",
    // Technogym – Pure Strength Hack Squat
    "lifefitness-pendulum-x-squat",
    // Life Fitness – Pendulum-X Squat
    "lifefitness-hack-squat",
    // Life Fitness – Plate Loaded Hack Squat
    "lifefitness-reverse-v-squat",
    // Life Fitness – Plate Loaded Reverse V-Squat
    "glutebuilder-glute-hack-squat",
    // Glute Builder – Glute Hack Squat
    "glutebuilder-pendulum-squat-pro",
    // Glute Builder – Pendulum Squat Pro
    "atlantis-c412",
    // Atlantis – C412 Hack squat
    "atlantis-pw212",
    // Atlantis – PW212 Pendulum Squat Pro
    "atlantis-pw412",
    // Atlantis – PW412 Hack squat pro
    "atlantis-pw611",
    // Atlantis – PW611 Power Squat Pro
    "newtech-hack-press",
    // Newtech – Torture Hack Press (Thomson)
    "newtech-hack-squat",
    // Newtech – Torture Hack Squat (Thomson)
    "newtech-torture-hack-squat-premium-thomsonnew",
    // Newtech – Torture Hack Squat Premium Moving (Thomson)
    "watson-30-degree-hack-squat",
    // Watson – PL 30 Degree Hack Squat
    "watson-adjustable-hack-squat",
    // Watson – PL Animal Adjustable Hack Squat
    "watson-plate-loaded-hack-squat",
    // Watson – PL Hack Squat
    "watson-linear-hack-squat",
    // Watson – PL Linear Hack Squat
    "watson-power-squat",
    // Watson – PL Power Squat
    "gymleco-044-v-squat-plate-loaded",
    // Gymleco – 044 V-Squat, Plate Loaded
    "gymleco-045-pendulum-squat",
    // Gymleco – 045 Pendulum Squat
    "gymleco-082-belt-squat-machine",
    // Gymleco – 082 Belt Squat Machine
    "nautilus-nautilus-plate-loaded-hack-squat",
    // Nautilus – Hack Squat
    "nautilus-pendulum-squat-1",
    // Nautilus – Pendel-Kniebeuge
    "nautilus-power-squat-1",
    // Nautilus – Power-Kniebeuge
    "panatta-pendulum-squat",
    // Panatta – 1FO080 Pendulum squat
    "panatta-hack-squat",
    // Panatta – 1FO087 Hack Squat
    "panatta-super-pendulum-squat",
    // Panatta – 1FW080 Super pendulum squat
    "panatta-super-power-squat",
    // Panatta – 1FW084 Super power squat
    "panatta-super-hack-squat",
    // Panatta – 1FW087 Super hack squat
    "panatta-super-squat-machine",
    // Panatta – 1FW091 Super squat machine
    "granite-dual-hack",
    // Granite – Dual Hack
    "citadel-3n1-hack-squat",
    // Citadel Strength – 3n1 Hack Squat
    "citadel-linear-hack-squat",
    // Citadel Strength – Linear Hack Squat
    "citadel-pendulum-squat",
    // Citadel Strength – Pendulum Squat
    "eigen-mw0xdfum-pzmgk",
    // EliteFTS – Monster Hack Squat
    "eigen-mw0y45kk-ib3wo",
    // Predator Strenght – Pendulum Squat
    "eigen-mw1acalz-0q31v",
    // EliteFTS – Monster Hack Squat
    "eigen-mw1akbdo-q1puv",
    // Charged – Hack Squat
    "eigen-mw1anesf-i4e0q",
    // Cybex – Hack Squat
    "eigen-mw2dl0xb-oi7u4",
    // Icarian – Hack Squat
    "eigen-mw2dnqvl-f0bub",
    // Revive – Hack Squat
    "glutebuilder-glute-squat",
    // Glute Builder – Glute Squat
    "lifefitness-plate-loaded-squat-lunge",
    // Life Fitness – Plate Loaded Squat Lunge
    "bootybuilder-booty-builder-reverse-lunge-machine",
    // Booty Builder – Reverse Lunge Machine
    "glutebuilder-glute-lunge",
    // Glute Builder – Glute Lunge
    "watson-plate-loaded-lunge-machine",
    // Watson – PL Lunge Machine
    "panatta-squat-lunge-module",
    // Panatta – 4GRDFC3 Squat lunge module
    "panatta-squat-lunge",
    // Panatta – 1HP590 Squat lunge
    "panatta-super-lunge-machine",
    // Panatta – 1FW079 Super Lunge Machine
    "gym80-4389",
    // gym80 – Leverage Squat (zugeordnet 13.11.2026)
    "technogym-mk16eh",
    // Technogym – Artis Squat (zugeordnet 13.11.2026)
    "bootybuilder-booty-builder-v-squat",
    // Booty Builder – V Squat (zugeordnet 13.11.2026)
    "newtech-drop-squat",
    // Newtech – Torture Drop Squat (zugeordnet 13.11.2026)
    "watson-leverage-squat",
    // Watson – PL Leverage Squat (zugeordnet 13.11.2026)
    "watson-trusquat",
    // Watson – PL Tru Squat (zugeordnet 13.11.2026)
    "gymleco-944-squats-hacklift",
    // Gymleco – Squats/Hacklift (zugeordnet 13.11.2026)
    "gymleco-244-hacklift"
    // Gymleco – Hacklift (zugeordnet 13.11.2026)
  ]),
  hip_thrust: /* @__PURE__ */ new Set([
    "bootybuilder-booty-builder-pendulum-hip-press",
    // Booty Builder – Selectorized Pendulum Hip Press
    "gym80-4416",
    // gym80 – 4416 Bootymizer
    "gym80-4352",
    // gym80 – 4352 Booty Booster
    "gym80-4386n",
    // gym80 – 4386N Booty Booster Special
    "technogym-mn2p",
    // Technogym – Selection 900 Hip Thrust
    "technogym-mg80",
    // Technogym – Pure Strength Hip Thrust
    "lifefitness-insignia-series-glute-bridge",
    // Life Fitness – Insignia Series Glute Bridge
    "lifefitness-hammer-strength-plate-loaded-glute-drive",
    // Life Fitness – Plate Loaded Glute Drive
    "bootybuilder-booty-builder-selectorized-standing-hip-thrust",
    // Booty Builder – Selectorized Standing Hip Thrust
    "bootybuilder-booty-builder-selectorized-hip-thrust-machine",
    // Booty Builder – V8
    "bootybuilder-booty-builder-dual-hip-thrust",
    // Booty Builder – Dual Hip Thrust
    "bootybuilder-booty-builder-platinum",
    // Booty Builder – Platinum V4
    "bootybuilder-booty-builder-standing-hip-thrust",
    // Booty Builder – Standing Hip Thrust
    "glutebuilder-selectorized-hip-thrust-elite",
    // Glute Builder – Selectorized Hip Thrust Elite
    "glutebuilder-hip-thrust-elite",
    // Glute Builder – Hip Thrust Elite
    "atlantis-pw702",
    // Atlantis – PW702 Hip Thruster Pro
    "newtech-onhim-kneeling-hip-raise",
    // Newtech – OnHim Kneeling Hip Raise
    "newtech-hip-thrust",
    // Newtech – Torture Hip Thrust
    "newtech-hip-thrust-1",
    // Newtech – Torture Hip Thrust (Rotary)
    "watson-pl-standing-hip-thrust",
    // Watson – PL Standing Hip Thrust
    "gymleco-043-hip-press",
    // Gymleco – 043 Hip Press
    "gymleco-066-hip-thrust",
    // Gymleco – 066 Hip Thrust
    "nautilus-nautilus-plate-loaded-glute-drive",
    // Nautilus – Glute Drive
    "milon-pump-hip-thrust",
    // milon – 04 Hip Thrust
    "panatta-hip-thrust",
    // Panatta – 1FE097 Hip thrust
    "panatta-standing-hip-thrust-2",
    // Panatta – 1FE197 Standing Hip Thrust
    "panatta-hip-thrust-3",
    // Panatta – 1MTH097 Hip thrust
    "panatta-hip-thrust-4",
    // Panatta – 1FO097 Hip thrust
    "panatta-standing-hip-thrust",
    // Panatta – 1FO197 Standing Hip Thrust
    "panatta-hip-thrust-2",
    // Panatta – 1FW097 Hip thrust
    "citadel-2n1-hip-press",
    // Citadel Strength – 2n1 Hip Press
    "citadel-hip-thrust",
    // Citadel Strength – Hip Thrust
    "eigen-mw0xxofg-2ukx2",
    // Matrix – Magnum Glute Trainer
    "eigen-mw0y25o7-6izcw",
    // Nautilus – Glute Drive
    "eigen-01a18e87-b441-7776-bbf5-aa101617ead3"
    // gym80 – Gym80 Sliding Hip Extension (zugeordnet 13.11.2026)
  ]),
  glute_kick: /* @__PURE__ */ new Set([
    "glutebuilder-selectorized-pendulum-kick-back",
    // Glute Builder – Selectorized Pendulum Kick Back
    "glutebuilder-pendulum-kick-back",
    // Glute Builder – Pendulum Kick Back
    "gym80-3004",
    // gym80 – 3004 Gluteus Kick Kniend
    "gym80-3005",
    // gym80 – 3005 Gluteus Kick Radial
    "gym80-3006",
    // gym80 – 3006 Kickmaschine
    "gym80-5002",
    // gym80 – 5002 Innovation Gluteusmaschine
    "gym80-4321",
    // gym80 – 4321 Gluteus Kick Maschine
    "technogym-mn4p",
    // Technogym – Selection 900 Glute Press
    "technogym-mg40",
    // Technogym – Pure Strength Rear Kick
    "lifefitness-insignia-series-glute",
    // Life Fitness – Insignia Series Glute
    "bootybuilder-booty-builder-selectorized-kick-back",
    // Booty Builder – Selectorized Kick Back
    "bootybuilder-booty-builder-multi-angle-glute-press",
    // Booty Builder – Selectorized Multi-Angle Glute Press
    "glutebuilder-selectorized-kneeling-glute-isolator",
    // Glute Builder – Selectorized Kneeling Glute Isolator
    "glutebuilder-glute-press",
    // Glute Builder – Glute Press
    "glutebuilder-kneeling-glute-isolator",
    // Glute Builder – Kneeling Glute Isolator
    "atlantis-c122",
    // Atlantis – C122 Glute machine
    "newtech-glute-kick-back",
    // Newtech – OnHim Glute Kick-Back
    "newtech-glute-kick-back-2",
    // Newtech – Torture Glute Kick-Back
    "watson-plate-load-glute-blaster",
    // Watson – PL Glute Blaster
    "gymleco-360-gluteus-one-leg-kick",
    // Gymleco – 360 Gluteus, One Leg kick
    "gymleco-060-glute-kickback",
    // Gymleco – 060 Glute Kickback
    "nautilus-nautilus-inspiration-glute-press",
    // Nautilus – Inspiration Gesäßpresse
    "nautilus-nautilus-instinct-glute-press",
    // Nautilus – Instinct Gesäßpresse
    "panatta-gluteus-machine",
    // Panatta – 1FE088 Gluteus machine
    "panatta-master-gluteus-plus",
    // Panatta – 1FE094A Master gluteus plus
    "panatta-gluteus-machine-2",
    // Panatta – 1MTH088 Gluteus machine
    "panatta-master-gluteus-plus-2",
    // Panatta – 1MTH094A Master gluteus plus
    "lifefitness-hammer-strength-select-hip-and-glute"
    // Life Fitness – Hammer Strength Select Hip and Glute
  ]),
  reverse_hyper: /* @__PURE__ */ new Set([
    "gymleco-063-reverse-hyper-pendulum",
    // Gymleco – 063 Reverse Hyper Pendulum
    "gym80-80a00033",
    // gym80 – 80A00033 Sliding Hip Extension
    "glutebuilder-selectorized-dual-45-hip-extension",
    // Glute Builder – Selectorized Dual 45 Hip Extension
    "glutebuilder-dual-45-hip-extension",
    // Glute Builder – Dual 45 Hip Extension
    "gymleco-067-gymleco-hip-and-back-extension",
    // Gymleco – 067 Gymleco Hip & Back Extension
    "gym80-80a00013",
    // gym80 – 80A00013 Reverse Hyper Extension Machine
    "atlantis-d215",
    // Atlantis – D215 Reverse hyper extension
    "newtech-onhim-reverse-hyper-new",
    // Newtech – OnHim Reverse Hyper
    "watson-deluxe-reverse-hyper-extension",
    // Watson – PL Deluxe Reverse Hyper Extension
    "watson-westside-ultra-supreme-reverse-hyper",
    // Watson – PL Westside Ultra Supreme Reverse Hyper
    "gymleco-061-reverse-hyper",
    // Gymleco – 061 Reverse Hyper
    "panatta-reverse-hyperextension"
    // Panatta – 1FW096 Reverse hyperextension
  ]),
  calf_standing: /* @__PURE__ */ new Set([
    "panatta-calf-hack-machine-2",
    // Panatta – 1MTH092 Calf hack machine
    "panatta-super-calf-hack",
    // Panatta – 1FW092 Super calf hack
    "prime-hybrid-seated-calf-press",
    // PRIME Fitness – Hybrid | Seated Calf Press
    "gym80-3018",
    // gym80 – 3018 Wadenmaschine Stehend
    "gym80-3027",
    // gym80 – 3027 Wadenpresse Sitzend
    "gym80-3094",
    // gym80 – 3094 Donkey Calf Raise
    "gym80-4345",
    // gym80 – 4345 55 Grad Wadenmaschine Stehend
    "gym80-4380",
    // gym80 – 4380 Donkey Calf
    "technogym-mn5p",
    // Technogym – Selection 900 Standing Calf
    "technogym-mg45",
    // Technogym – Pure Strength Calf
    "technogym-mg46",
    // Technogym – Pure Strength Seated Calf
    "lifefitness-hammer-strength-select-horizontal-calf",
    // Life Fitness – Hammer Strength Select Horizontal Calf
    "lifefitness-hammer-strength-select-standing-calf",
    // Life Fitness – Hammer Strength Select Standing Calf
    "lifefitness-insignia-series-calf-extension",
    // Life Fitness – Insignia Series Calf Extension
    "lifefitness-life-fitness-calf-raise",
    // Life Fitness – Plate Loaded Calf Raise
    "atlantis-m118",
    // Atlantis – M118 Standing calf Raise
    "atlantis-m318",
    // Atlantis – M318 Incline calf raise
    "atlantis-m219",
    // Atlantis – M219 Seated calf
    "atlantis-pw319",
    // Atlantis – PW319 Seated Calf Press
    "newtech-onhim-standing-calf-raise-new",
    // Newtech – OnHim Standing Calf Raise
    "watson-standing-single-stack-calf-raise",
    // Watson – SS Calf Raise
    "watson-45-calf-raise",
    // Watson – PL 45º Calf Raise
    "watson-plate-load-donkey-calf-raise",
    // Watson – PL Donkey Calf Raise
    "gymleco-345-seated-calf-press",
    // Gymleco – 345 Seated Calf Press
    "gymleco-347-standing-calf-press",
    // Gymleco – 347 Standing Calf Press
    "gymleco-348-seated-calf-press-45",
    // Gymleco – 348 Seated Calf Press 45°
    "gymleco-046-donkey-raise",
    // Gymleco – 046 Donkey Raise
    "gymleco-145-seated-calf-press",
    // Gymleco – 145 Seated Calf Press
    "nautilus-nautilus-impact-standing-calf",
    // Nautilus – Impact Standing Calf
    "nautilus-nautilus-instinct-dual-leg-press-calf-raise",
    // Nautilus – Instinct Wadenheben
    "nautilus-standing-calf",
    // Nautilus – Standing Calf
    "panatta-calf-machine",
    // Panatta – 1FE089 Calf machine
    "panatta-calf-machine-2",
    // Panatta – 1SC089 Calf machine
    "panatta-seated-calf",
    // Panatta – 1FO088 Seated Calf
    "panatta-donkey-calf",
    // Panatta – 1FW089 Donkey calf
    "eigen-mw0xpnf8-lquzo"
    // gym80 – Donkey Calve Raises
  ]),
  belt_squat: /* @__PURE__ */ new Set([
    "gym80-4360",
    // gym80 – 4360 Belt Squat
    "technogym-mg86",
    // Technogym – Pure Strength Belt Squat
    "lifefitness-hammer-strength-plate-loaded-belt-squat",
    // Life Fitness – Plate Loaded Belt Squat
    "glutebuilder-belt-squat-step-up",
    // Glute Builder – Belt Squat / Step Up
    "atlantis-pw511",
    // Atlantis – PW511 Belt squat
    "newtech-torture-belt-squat-new",
    // Newtech – Torture Belt Squat
    "watson-hip-belt-squat",
    // Watson – PL Hip Belt Squat
    "nautilus-nautilus-belt-squat",
    // Nautilus – Belt Squat
    "panatta-belt-squat",
    // Panatta – 1FW095 Belt squat
    "eigen-mw0xmvj3-ljstv",
    // Pit Shark – Belt Squat
    "bootybuilder-booty-builder-belt-squat"
    // Booty Builder – Belt Squat
  ]),
  leg_extension: /* @__PURE__ */ new Set([
    "prime-evolution-leg-extension",
    // PRIME Fitness – Evolution | Leg Extension
    "prime-hybrid-leg-extension",
    // PRIME Fitness – Hybrid | Leg Extension
    "prime-plate-loaded-leg-extension",
    // PRIME Fitness – Plate Loaded | Leg Extension
    "gym80-3001",
    // gym80 – 3001 Beinstrecker
    "gym80-3123",
    // gym80 – 3123 Beinstrecker Liegend mit verstellbarer Rückenlehne
    "gym80-4336n",
    // gym80 – 4336N Beinstrecker
    "gym80-4392",
    // gym80 – 4392 Beinstrecker Stehend
    "gym80-80a00029",
    // gym80 – 80A00029 Beinstrecker
    "technogym-mk91eh",
    // Technogym – Artis Leg Extension
    "technogym-mnjc",
    // Technogym – Selection 700 Leg Extension
    "technogym-mnjp",
    // Technogym – Selection 900 Leg Extension
    "technogym-c99600-anvk",
    // Technogym – Selection Leg Extension Med
    "technogym-mg65",
    // Technogym – Pure Strength Leg Extension
    "lifefitness-axiom-series-leg-extension",
    // Life Fitness – Axiom Series - Leg Extension
    "lifefitness-hammer-strength-mts-iso-lateral-leg-extension",
    // Life Fitness – MTS Iso-Lateral Leg Extension
    "lifefitness-hammer-strength-select-leg-extension",
    // Life Fitness – Hammer Strength Select Leg Extension
    "lifefitness-insignia-series-leg-extension",
    // Life Fitness – Insignia Series Leg Extension
    "lifefitness-hammer-strength-plate-loaded-iso-lateral-leg-extension",
    // Life Fitness – Iso-Lateral Leg Extension
    "lifefitness-life-fitness-leg-extension",
    // Life Fitness – Plate Loaded Leg Extension
    "atlantis-c105",
    // Atlantis – C105 Leg Extension
    "newtech-leg-extension",
    // Newtech – OnHim Leg Extension
    "newtech-leg-extension-2",
    // Newtech – Torture Leg Extension
    "watson-single-stack-leg-extension",
    // Watson – SS Leg Extension
    "watson-plate-load-leg-extension",
    // Watson – PL Leg Extension
    "gymleco-340-leg-extension",
    // Gymleco – 340 Leg Extension
    "gymleco-340r-leg-extension-rehab",
    // Gymleco – 340R Leg Extension, Adjustable
    "gymleco-040-leg-extension",
    // Gymleco – 040 Leg Extension
    "nautilus-nautilus-impact-leg-extension",
    // Nautilus – Impact Leg Extension
    "nautilus-nautilus-inspiration-leg-extension",
    // Nautilus – Inspiration Beinstrecker
    "nautilus-nautilus-instinct-leg-extension",
    // Nautilus – Instinct Leg Extension
    "nautilus-leg-extension",
    // Nautilus – Beinstrecker
    "milon-pump-leg-extension",
    // milon – 01 Leg Extension
    "panatta-fantastic-leg-extension",
    // Panatta – 1FT081 Leg Extension
    "panatta-leg-extension",
    // Panatta – 1FE081 Leg extension
    "panatta-leg-extension-3",
    // Panatta – 1MTH081 Leg extension
    "panatta-leg-extension-4",
    // Panatta – 1SC081 Leg extension
    "panatta-leg-extension-5",
    // Panatta – 1FO181 Leg extension
    "panatta-leg-extension-2",
    // Panatta – 1FW181 Leg extension
    "panatta-alternate-leg-extension-copia",
    // Panatta – 1FW281 Alternate leg extension
    "watson-westside-hip-quad-developer-pro",
    // Watson – PL Westside Hip & Quad Developer Pro
    "eigen-mw58ufod-xdptg"
    // Schnell – Goliath Beinstrecker dual (zugeordnet 13.11.2026)
  ]),
  leg_curl_lying: /* @__PURE__ */ new Set([
    "prime-evolution-prone-leg-curl",
    // PRIME Fitness – Evolution | Prone Leg Curl
    "prime-hybrid-prone-leg-curl",
    // PRIME Fitness – Hybrid | Prone Leg Curl
    "prime-plate-loaded-prone-leg-curl",
    // PRIME Fitness – Plate Loaded | Prone Leg Curl
    "gym80-3002",
    // gym80 – 3002 Beinbeuger Liegend
    "gym80-3013",
    // gym80 – 3013 Beinbeuger Stehend
    "gym80-4373",
    // gym80 – 4373 Beinbeuger Stehend
    "gym80-4375",
    // gym80 – 4375 Inverse Leg Curl
    "technogym-mnup",
    // Technogym – Selection 900 Prone Leg Curl
    "technogym-mg70",
    // Technogym – Pure Strength Standing Leg Curl
    "lifefitness-hammer-strength-mts-kneeling-leg-curl",
    // Life Fitness – MTS Iso-Lateral Kneeling Leg Curl
    "lifefitness-plate-loaded-iso-lateral-kneeling-leg-curl",
    // Life Fitness – Plate Loaded Iso-Lateral Kneeling Leg Curl
    "lifefitness-life-fitness-kneeling-leg-curl",
    // Life Fitness – Plate Loaded Kneeling Leg Curl
    "atlantis-c106",
    // Atlantis – C106 Lying leg curl
    "atlantis-c107",
    // Atlantis – C107 Standing leg curl
    "atlantis-c118",
    // Atlantis – C118 Kneeling leg curl
    "newtech-kneeling-leg-curl",
    // Newtech – Torture Kneeling Leg Curl
    "watson-lying-leg-curl",
    // Watson – SS Lying Leg Curl
    "watson-plate-loaded-standing-leg-curl",
    // Watson – PL Standing Leg Curl
    "gymleco-342-lying-leg-curl",
    // Gymleco – 342 Lying Leg Curl
    "gymleco-342r-lying-leg-curl-adjustable",
    // Gymleco – 342R Lying Leg Curl, Adjustable
    "gymleco-042-standing-leg-curl",
    // Gymleco – 042 Standing Leg Curl
    "nautilus-nautilus-impact-kneeling-leg-curl",
    // Nautilus – Impact Kneeling Leg Curl
    "nautilus-lying-leg-curl-1",
    // Nautilus – Beinbeuger im Liegen
    "milon-pump-prone-leg-curl",
    // milon – 02 Prone Leg Curl
    "panatta-standing-leg-curling",
    // Panatta – 1FE084 Standing leg curling
    "panatta-kneeling-leg-curling-copia",
    // Panatta – 1FO094 Kneeling leg curling
    "panatta-kneeling-leg-curling",
    // Panatta – 1FW094 Kneeling leg curling
    "watson-westside-inverse-curl-pro",
    // Watson – PL Westside Inverse Curl Pro
    "gym80-4337n",
    // gym80 – 4337N Beinbeuger
    "gym80-80a00030",
    // gym80 – 80A00030 Beinbeuger
    "lifefitness-axiom-series-leg-curl",
    // Life Fitness – Axiom Series - Leg Curl
    "lifefitness-hammer-strength-select-leg-curl",
    // Life Fitness – Hammer Strength Select Leg Curl
    "lifefitness-insignia-series-leg-curl",
    // Life Fitness – Insignia Series Leg Curl
    "lifefitness-plate-loaded-iso-lateral-leg-curl",
    // Life Fitness – Iso-Lateral Leg Curl
    "newtech-leg-curl",
    // Newtech – OnHim Leg Curl
    "newtech-leg-curl-2",
    // Newtech – Torture Leg Curl
    "nautilus-nautilus-impact-leg-curl",
    // Nautilus – Impact Leg Curl
    "nautilus-nautilus-inspiration-leg-curl",
    // Nautilus – Inspiration Beinbeuger
    "nautilus-nautilus-instinct-leg-curl",
    // Nautilus – Instinct Leg Curl
    "panatta-leg-curling",
    // Panatta – 1FE082 Leg curling
    "panatta-leg-curling-3",
    // Panatta – 1MTH082 Leg curling
    "panatta-leg-curling-4",
    // Panatta – 1SC082 Leg curling
    "panatta-alternate-leg-curling",
    // Panatta – 1FW082 Alternate leg curling
    "panatta-leg-curling-2",
    // Panatta – 1FW182 Leg curling
    "gym80-4434",
    // gym80 – 4434 Glute Ham Developer
    "lifefitness-glute-ham-reverse-hyper-combo",
    // Life Fitness – Glute Ham / Reverse Hyper
    "atlantis-pw322",
    // Atlantis – PW322 Assisted glute and ham developer
    "lifefitness-plate-loaded-assisted-nordic-ham"
    // Life Fitness – Plate Loaded Assisted Nordic Ham (zugeordnet 13.11.2026)
  ]),
  leg_curl_seated: /* @__PURE__ */ new Set([
    "prime-evolution-seated-leg-curl",
    // PRIME Fitness – Evolution | Seated Leg Curl
    "prime-hybrid-seated-leg-curl",
    // PRIME Fitness – Hybrid | Seated Leg Curl
    "gym80-3003",
    // gym80 – 3003 Beinbeuger Sitzend
    "lifefitness-hammer-strength-select-seated-leg-curl",
    // Life Fitness – Hammer Strength Select Seated Leg Curl
    "lifefitness-insignia-series-seated-leg-curl",
    // Life Fitness – Insignia Series Seated Leg Curl
    "atlantis-c108",
    // Atlantis – C108 Seated leg curl
    "newtech-onhim-seated-leg-curl-new",
    // Newtech – OnHim Seated Leg Curl
    "watson-seated-leg-curl",
    // Watson – SS Seated Leg Curl
    "gymleco-341-seated-leg-curl",
    // Gymleco – 341 Seated Leg Curl
    "gymleco-041-leg-curl-seated",
    // Gymleco – 041 Leg Curl, Seated
    "nautilus-nautilus-impact-seated-leg-curl",
    // Nautilus – Impact Seated Leg Curl
    "panatta-seated-leg-curling",
    // Panatta – 1FE083 Seated leg curling
    "panatta-seated-leg-curling-3",
    // Panatta – 1MTH083 Seated leg curling
    "panatta-seated-leg-curling-4",
    // Panatta – 1SC083 Seated leg curling
    "panatta-seated-leg-curling-5",
    // Panatta – 1FO183 Seated leg curling
    "panatta-seated-leg-curling-2",
    // Panatta – 1FW183 Seated leg curling
    "technogym-mk90eh",
    // Technogym – Artis Leg Curl
    "technogym-mnic",
    // Technogym – Selection 700 Leg Curl
    "technogym-mnip",
    // Technogym – Selection 900 Leg Curl
    "technogym-c99500-anvk",
    // Technogym – Selection Leg Curl Med
    "eigen-mw4wccvs-7pyn0"
    // Cybex – Eagle Leg Curl (zugeordnet 13.11.2026)
  ]),
  adduction: /* @__PURE__ */ new Set([
    "prime-hybrid-inner-thigh",
    // PRIME Fitness – Hybrid | Inner Thigh
    "gym80-3029",
    // gym80 – 3029 Adduktionsmaschine
    "technogym-mk17eh",
    // Technogym – Artis Adductor
    "technogym-mnqp",
    // Technogym – Selection 900 Adductor
    "technogym-c91700-anvk",
    // Technogym – Selection Adductor Med
    "lifefitness-hammer-strength-select-hip-adduction",
    // Life Fitness – Hammer Strength Select Hip Adduction
    "lifefitness-insignia-series-hip-adduction",
    // Life Fitness – Insignia Series Hip Adduction
    "watson-single-stack-hip-adductor",
    // Watson – SS Hip Adductor
    "watson-pl-hip-adductor",
    // Watson – PL Hip Adductor
    "nautilus-nautilus-impact-adductor",
    // Nautilus – Impact Adduktor
    "panatta-adductor-machine",
    // Panatta – 1FE087 Adductor machine
    "panatta-adductor-machine-2",
    // Panatta – 1MTH087 Adductor machine
    "panatta-adductor-machine-3",
    // Panatta – 1SC087 Adductor machine
    "bootybuilder-booty-builder-selectorized-standing-hip-adduction",
    // Booty Builder – Selectorized Standing Hip Adduction
    "bootybuilder-booty-builder-standing-hip-adduction",
    // Booty Builder – Standing Hip Adduction
    "eigen-01a18e87-b445-7251-9016-c95f1ee27d6a",
    // Eigene – Hammer Adduktion (zugeordnet 13.11.2026)
    "eigen-mwcn0mty-q8in0"
    // Hammer Strength – Adduktion (zugeordnet 13.11.2026)
  ]),
  abduction: /* @__PURE__ */ new Set([
    "prime-hybrid-outer-thigh",
    // PRIME Fitness – Hybrid | Outer Thigh
    "gym80-3028",
    // gym80 – 3028 Abduktionsmaschine
    "gym80-3069",
    // gym80 – 3069 Stehende Abduktion
    "gym80-4374",
    // gym80 – 4374 Stehende Abduktion
    "gym80-4384",
    // gym80 – 4384 Abduktion 3D
    "technogym-mk18eh",
    // Technogym – Artis Abductor
    "technogym-mnpp",
    // Technogym – Selection 900 Abductor
    "technogym-c91800-anvk",
    // Technogym – Selection Abductor Med
    "technogym-mg95",
    // Technogym – Pure Strength Standing Abductor
    "lifefitness-hammer-strength-select-hip-abduction",
    // Life Fitness – Hammer Strength Select Hip Abduction
    "lifefitness-insignia-series-sit-stand-hip-abductor",
    // Life Fitness – Insignia Series Sit / Stand Hip Abductor
    "glutebuilder-selectorized-3d-multi-abductor-pro",
    // Glute Builder – Selectorized 3D Multi Abductor Pro
    "glutebuilder-3d-multi-abductor",
    // Glute Builder – 3D Multi Abductor
    "atlantis-pw429",
    // Atlantis – PW429 Glute Abductor
    "newtech-hip-abduction-single-move",
    // Newtech – OnHim Hip Abduction (Single Move)
    "watson-single-stack-hip-abductor",
    // Watson – SS Hip Abductor
    "watson-single-stack-standing-hip-abductor",
    // Watson – SS Standing Hip Abductor
    "watson-pl-hip-abductor",
    // Watson – PL Hip Abductor
    "gymleco-362-standing-abductor",
    // Gymleco – 362 Standing Abductor
    "gymleco-062-standing-abductor-plate-loaded",
    // Gymleco – 062 Standing Abductor, Plate Loaded
    "nautilus-nautilus-impact-abductor",
    // Nautilus – Impact Abduktor
    "milon-pump-abductor-upright",
    // milon – 03 Abductor Upright
    "panatta-abductor-machine",
    // Panatta – 1FE086 Abductor machine
    "panatta-standing-abductor-machine",
    // Panatta – 1FE096 Standing abductor machine
    "panatta-abductor-machine-2",
    // Panatta – 1MTH086 Abductor machine
    "panatta-standing-abductor-2",
    // Panatta – 1MTH096 Standing abductor
    "panatta-abductor-machine-3",
    // Panatta – 1SC086 Abductor machine
    "panatta-standing-abductor",
    // Panatta – 1FW099 Standing abductor
    "panatta-3d-abductor",
    // Panatta – 1FW199 3D Abductor
    "bootybuilder-booty-builder-3d-multi-abductor",
    // Booty Builder – Selectorized 3D Multi-Abductor
    "bootybuilder-booty-builder-selectorized-standing-abductor",
    // Booty Builder – Selectorized Standing Abductor
    "bootybuilder-booty-builder-standing-abductor",
    // Booty Builder – Standing Abductor
    "granite-glutinator",
    // Granite – Glutinator (zugeordnet 13.11.2026)
    "eigen-mw54fps7-77iv4",
    // Hammer Strenght – Abduktion Maschine (zugeordnet 13.11.2026)
    "eigen-mwcmyaka-ocp34"
    // Schnell – Abduktor (zugeordnet 13.11.2026)
  ]),
  calf_seated: /* @__PURE__ */ new Set([
    "gym80-4026",
    // gym80 – 4026 Wadenmaschine Sitzend
    "lifefitness-plate-loaded-seated-calf-raise",
    // Life Fitness – Plate Loaded Seated Calf Raise
    "newtech-torture-seated-calf-raise",
    // Newtech – Torture Seated Calf Raise
    "newtech-seated-calf-raise",
    // Newtech – Seated Calf Raise
    "nautilus-nautilus-plate-loaded-tilt-seat-calf",
    // Nautilus – Tilt Seat Calf
    "panatta-super-seated-calf"
    // Panatta – 1FW088 Super seated calf
  ]),
  tibialis: /* @__PURE__ */ new Set([
    "gym80-4348",
    // gym80 – 4348 Tibialismaschine Sitzend
    "lifefitness-plate-loaded-tibia-dorsi-flexion",
    // Life Fitness – Plate Loaded Tibia Dorsi-Flexion
    "atlantis-m126",
    // Atlantis – M126 Tibia dorsi flexion
    "watson-tibialis-trainer",
    // Watson – PL Tibialis Trainer
    "gymleco-047-tibia-dorsi-flexion"
    // Gymleco – 047 Tibia Dorsi Flexion
  ]),
  back_extension: /* @__PURE__ */ new Set([
    "prime-evolution-low-back-extension",
    // PRIME Fitness – Evolution | Low Back Extension
    "prime-hybrid-low-back-extension",
    // PRIME Fitness – Hybrid | Low Back Extension
    "prime-plate-loaded-low-back-extension",
    // PRIME Fitness – Plate Loaded | Low Back Extension
    "gym80-3007",
    // gym80 – 3007 Rückenstrecker
    "gym80-3038",
    // gym80 – 3038 Rückenstrecker
    "technogym-mk58eh",
    // Technogym – Artis Lower Back
    "technogym-mncc",
    // Technogym – Selection 700 Lower Back
    "technogym-mncp",
    // Technogym – Selection 900 Lower Back
    "technogym-c95800-anvk",
    // Technogym – Selection Lower Back Med
    "lifefitness-hammer-strength-select-back-extension",
    // Life Fitness – Hammer Strength Select Back Extension
    "lifefitness-insignia-series-back-extension",
    // Life Fitness – Insignia Series Back Extension
    "bootybuilder-booty-builder-selectorized-back-extension",
    // Booty Builder – Selectorized Back Extension
    "watson-single-stack-back-extension",
    // Watson – SS Back Extension
    "nautilus-nautilus-impact-low-back",
    // Nautilus – Impact Lower Back
    "nautilus-nautilus-inspiration-back-extension",
    // Nautilus – Inspiration Back Extension
    "panatta-lower-back",
    // Panatta – 1FE005 Lower back
    "panatta-lower-back-2",
    // Panatta – 1MTH005 Lower back
    "panatta-lower-back-3",
    // Panatta – 1SC005 Lower back
    "watson-single-stack-hyper-extension",
    // Watson – SS Hyper Extension
    "eigen-mw54m4na-m97lg"
    // Granite – Hyperextension (TbJP) (zugeordnet 13.11.2026)
  ]),
  biceps_curl: /* @__PURE__ */ new Set([
    "prime-evolution-arm-curl",
    // PRIME Fitness – Evolution | Arm Curl
    "prime-hybrid-arm-curl",
    // PRIME Fitness – Hybrid | Arm Curl
    "prime-plate-loaded-arm-curl",
    // PRIME Fitness – Plate Loaded | Arm Curl
    "prime-specialty-double-sided-preacher",
    // PRIME Fitness – Specialty | Double-Sided Preacher
    "gym80-3010",
    // gym80 – 3010 Bizepsmaschine
    "gym80-3098",
    // gym80 – 3098 Bizeps Horizontal
    "gym80-5004",
    // gym80 – 5004 Innovation Curler Maschine
    "gym80-4338n",
    // gym80 – 4338N Bizepsmaschine
    "gym80-4355",
    // gym80 – 4355 Bizepsmaschine Dual
    "gym80-4366",
    // gym80 – 4366 Bizeps Überkopf
    "gym80-5903",
    // gym80 – 5903 Bizepscurl Stehend
    "technogym-mk92eh",
    // Technogym – Artis Arm Curl
    "technogym-mnrp",
    // Technogym – Selection 900 Arm Curl
    "technogym-mg60",
    // Technogym – Pure Strength Biceps
    "lifefitness-axiom-series-biceps-curl",
    // Life Fitness – Axiom Series - Biceps Curl
    "lifefitness-hammer-strength-mts-iso-lateral-biceps-curl",
    // Life Fitness – MTS Iso-Lateral Biceps Curl
    "lifefitness-hammer-strength-select-biceps-curl",
    // Life Fitness – Hammer Strength Select Biceps-Curl
    "lifefitness-insignia-series-biceps-curl",
    // Life Fitness – Insignia Series Biceps Curl
    "lifefitness-insignia-series-biceps-curl-dependent",
    // Life Fitness – Insignia Series Biceps Curl - Dependent
    "lifefitness-plate-loaded-seated-biceps",
    // Life Fitness – Plate Loaded Seated Biceps
    "atlantis-b157",
    // Atlantis – B157 Biceps curl
    "atlantis-b158",
    // Atlantis – B158 Horizontal curl
    "atlantis-b160",
    // Atlantis – B160 Biceps isolator
    "atlantis-b257",
    // Atlantis – B257 Standing Bicep Curl
    "atlantis-b260",
    // Atlantis – B260 Horizontal biceps isolator
    "atlantis-pw357",
    // Atlantis – PW357 Preacher curl
    "newtech-arm-curl",
    // Newtech – OnHim Arm Curl
    "newtech-arm-curl-2",
    // Newtech – Torture Arm Curl
    "watson-animal-dual-stack-bicep-curl",
    // Watson – DS Animal Bicep Curl
    "watson-single-stack-bicep-curl",
    // Watson – SS Bicep Curl
    "watson-plate-loaded-bicep-curl",
    // Watson – PL Bicep Curl
    "gymleco-350-biceps-curl-machine",
    // Gymleco – 350 Biceps Curl Machine
    "gymleco-050-biceps-curl-machine",
    // Gymleco – 050 Biceps Curl Machine
    "nautilus-nautilus-impact-biceps-curl",
    // Nautilus – Impact Bizeps-Curl
    "nautilus-nautilus-inspiration-biceps-curl",
    // Nautilus – Inspiration Biceps Curl
    "nautilus-nautilus-inspiration-bilateral-arm-curl",
    // Nautilus – Inspiration Bilateral Arm Curl
    "nautilus-nautilus-instinct-dual-biceps-curl-triceps-extension",
    // Nautilus – Instinct Dual Bizeps-Curl/Trizeps-Extension
    "nautilus-nautilus-leverage-biceps-curl",
    // Nautilus – Leverage Curl
    "nautilus-biceps-curl",
    // Nautilus – Bizeps-Curl
    "panatta-fantastic-biceps-machine",
    // Panatta – 1FT051 Biceps Machine
    "panatta-curling-machine",
    // Panatta – 1FE051 Curling machine
    "panatta-alternate-preacher-curl-machine",
    // Panatta – 1FE052 Alternate preacher curl machine
    "panatta-alternate-arm-curl",
    // Panatta – 1FE056 Alternate arm curl
    "panatta-alternate-arm-curl-120",
    // Panatta – 1FE356 Alternate arm curl 120
    "panatta-alternate-arm-curl-45",
    // Panatta – 1FE456 Alternate arm curl -45
    "panatta-alternate-supinating-biceps",
    // Panatta – 1FE556 Alternate Supinating Biceps
    "panatta-curling-machine-3",
    // Panatta – 1MTH051 Curling machine
    "panatta-alternate-arm-curl-2",
    // Panatta – 1MTH056 Alternate arm curl
    "panatta-curling-machine-4",
    // Panatta – 1SC051 Curling machine
    "panatta-curling-machine-5",
    // Panatta – 1FO151 Curling machine
    "panatta-alternate-preacher-curl-machine-2",
    // Panatta – 1FW054 Alternate Preacher Curl Machine
    "panatta-alternate-arm-curl-120-2",
    // Panatta – 1FW055 Alternate Arm Curl 120
    "panatta-alternate-arm-curl-45-2",
    // Panatta – 1FW056 Alternate Arm Curl – 45
    "panatta-alternate-curling-machine",
    // Panatta – 1FW251 Alternate curling machine
    "panatta-curling-machine-2",
    // Panatta – 1FW351 Curling machine
    "panatta-three-angles-bicep-machine",
    // Panatta – 1FW451 Three Angles Biceps Machine
    "panatta-four-angle-biceps-machines",
    // Panatta – 1FW551 Four Angle Biceps Machines
    "eigen-01a18e87-b446-7192-8043-aa7e15016a0c",
    // Eigene – Hammer Curls Cable (zugeordnet 13.11.2026)
    "eigen-01a18e87-b44e-758f-89b7-b9b95de29c92",
    // Milon – Bizeps Curl (zugeordnet 13.11.2026)
    "eigen-mw54sj42-o26sk",
    // Schnell – Biceps Curl (zugeordnet 13.11.2026)
    "eigen-mwahsytn-36s22",
    // Icarian – Cable Biceps Curl (zugeordnet 13.11.2026)
    "eigen-mwahwsy9-w7v6s",
    // Nautilus – Multi Biceps (zugeordnet 13.11.2026)
    "eigen-mwaynche-e9oxg"
    // Galaxy Sport – Biceps Curl (zugeordnet 13.11.2026)
  ]),
  forearm: /* @__PURE__ */ new Set([
    "gymleco-357-forearm-curl",
    // Gymleco – 357 Forearm Curl
    "gym80-3071",
    // gym80 – 3071 Unterarmmaschine
    "atlantis-a201",
    // Atlantis – A201 Multi-forearm
    "gymleco-356-forearm-machine-3-exercises",
    // Gymleco – 356 Forearm Machine, 3 Exercises
    "gym80-80a00032",
    // gym80 – Gripper (zugeordnet 13.11.2026)
    "lifefitness-plate-loaded-gripper",
    // Life Fitness – Plate Loaded Gripper (zugeordnet 13.11.2026)
    "watson-seated-plate-load-hand-gripper",
    // Watson – PL Seated Hand Gripper (zugeordnet 13.11.2026)
    "watson-standing-plate-load-hand-gripper",
    // Watson – PL Standing Hand Gripper (zugeordnet 13.11.2026)
    "eigen-mwahoir7-3v7rv"
    // Nautilus – Superforearm (zugeordnet 13.11.2026)
  ]),
  triceps: /* @__PURE__ */ new Set([
    "prime-evolution-tricep-extension",
    // PRIME Fitness – Evolution | Tricep Extension
    "prime-hybrid-seated-pushdown",
    // PRIME Fitness – Hybrid | Seated Pushdown
    "prime-hybrid-tricep-extension",
    // PRIME Fitness – Hybrid | Tricep Extension
    "prime-plate-loaded-tricep-extension",
    // PRIME Fitness – Plate Loaded | Tricep Extension
    "gym80-3011",
    // gym80 – 3011 Trizepsmaschine
    "gym80-4339n",
    // gym80 – 4339N Trizepsmaschine
    "technogym-mk45eh",
    // Technogym – Artis Arm Extension
    "technogym-mnsp",
    // Technogym – Selection 900 Arm Extension
    "lifefitness-axiom-series-triceps-extension",
    // Life Fitness – Axiom Series - Triceps Extension
    "lifefitness-mts-iso-lateral-triceps-extension",
    // Life Fitness – MTS Iso-Lateral Triceps Extension
    "lifefitness-hammer-strength-select-triceps-extension",
    // Life Fitness – Hammer Strength Select Triceps Extension
    "lifefitness-insignia-series-triceps-extension",
    // Life Fitness – Insignia Series Triceps Extension
    "lifefitness-insignia-series-triceps-press",
    // Life Fitness – Insignia Series Triceps Press
    "atlantis-t163",
    // Atlantis – T163 Triceps pushdown
    "atlantis-t164",
    // Atlantis – T164 Triceps extension
    "atlantis-t215",
    // Atlantis – T215 Incline triceps pushdown
    "atlantis-t262",
    // Atlantis – T262 Selectorized French press
    "watson-single-stack-tricep-extension",
    // Watson – SS Tricep Extension
    "gymleco-351-triceps-extension",
    // Gymleco – 351 Triceps Extension
    "gymleco-051-iso-lateral-triceps",
    // Gymleco – 051 Iso Lateral Triceps
    "nautilus-nautilus-impact-triceps-extension",
    // Nautilus – Impact Trizeps-Extension
    "nautilus-nautilus-inspiration-triceps-extension",
    // Nautilus – Inspiration Triceps Extension
    "panatta-triceps-machine-5",
    // Panatta – 1FT053 Triceps Machine
    "panatta-triceps-machine",
    // Panatta – 1FE053 Triceps machine
    "panatta-alternate-arm-extension",
    // Panatta – 1FE057 Alternate arm extension
    "panatta-french-press-machine",
    // Panatta – 1FE153 French press machine
    "panatta-alternate-arm-extension-90",
    // Panatta – 1FE357 Alternate arm extension 90
    "panatta-alternate-pronating-triceps",
    // Panatta – 1FE557 Alternate Pronating Triceps
    "panatta-triceps-machine-3",
    // Panatta – 1MTH053 Triceps machine
    "panatta-alternate-arm-extension-2",
    // Panatta – 1MTH057 Alternate arm extension
    "panatta-french-press-machine-2",
    // Panatta – 1MTH153 French press machine
    "panatta-triceps-machine-4",
    // Panatta – 1SC053 Triceps machine
    "panatta-french-press-machine-3",
    // Panatta – 1FO053 French press machine
    "panatta-super-french-press-machine",
    // Panatta – 1FW053 Super french press machine
    "panatta-alternate-triceps-machine",
    // Panatta – 1FW252 Alternate triceps machine
    "panatta-triceps-machine-2",
    // Panatta – 1FW352 Triceps machine
    "panatta-three-angles-triceps-machine",
    // Panatta – 1FW452 Three Angles Triceps Machine
    "gymleco-251-gymleco-triceps-pushdown",
    // Gymleco – Triceps Pushdown (zugeordnet 13.11.2026)
    "eigen-01a18e87-b455-7796-ba99-6f8ce86df17a",
    // Eigene – PushnPull Triceps Press (zugeordnet 13.11.2026)
    "eigen-01a18e87-b457-75ae-b197-d85db3a68c35",
    // Eigene – Trizeps Press cable Seil (zugeordnet 13.11.2026)
    "eigen-mw54ppq4-qbmqg",
    // Atlantis – Seated Triceps Extension (zugeordnet 13.11.2026)
    "eigen-mw5588yd-sb7mz",
    // Push n Pull – Trimotion ft. Tim Budesheim (zugeordnet 13.11.2026)
    "eigen-mwahuvvw-bamcd"
    // MedX – Triceps Extension (zugeordnet 13.11.2026)
  ]),
  triceps_overhead: /* @__PURE__ */ new Set([
    "gym80-3095",
    // gym80 – 3095 Trizeps Überkopf
    "gym80-4379",
    // gym80 – 4379 Trizeps Überkopf
    "atlantis-t162",
    // Atlantis – T162 Overhead triceps
    "newtech-over-head-extension",
    // Newtech – Torture Overhead Extension
    "watson-single-stack-overhead-tricep-extension",
    // Watson – SS Overhead Tricep Extension
    "eigen-mvwq46xb-cnfte",
    // Panatta – Fantastic Line | Overhead Triceps Extension
    "atlantis-t161",
    // Atlantis – Overhead triceps (cable motion) (zugeordnet 13.11.2026)
    "eigen-01a18e87-b449-7020-bb8e-8a2996a3e83f",
    // Eigene – Katana Extension Cable (zugeordnet 13.11.2026)
    "eigen-mw54tyl0-joncq"
    // Gym80 – Overhead Triceps Extension (zugeordnet 13.11.2026)
  ]),
  crunch: /* @__PURE__ */ new Set([
    "prime-evolution-abdominal-crunch",
    // PRIME Fitness – Evolution | Abdominal Crunch
    "prime-hybrid-abdominal-crunch",
    // PRIME Fitness – Hybrid | Abdominal Crunch
    "prime-plate-loaded-abdominal-crunch",
    // PRIME Fitness – Plate Loaded | Abdominal Crunch
    "gym80-3037",
    // gym80 – 3037 Bauchmuskelmaschine
    "gym80-3124",
    // gym80 – 3124 Crunchmaschine
    "gym80-4307",
    // gym80 – 4307 Bauchmuskelbank Liegend
    "gym80-4317",
    // gym80 – 4317 Bauchmuskelmaschine AB Swing
    "gym80-4342n",
    // gym80 – 4342N Bauchmuskelmaschine Klappsitz
    "gym80-4343",
    // gym80 – 4343 Bauchmuskelmaschine Crunch
    "technogym-mk83eh",
    // Technogym – Artis Total Abdominal
    "technogym-mnbc",
    // Technogym – Selection 700 Abdominal Crunch
    "technogym-mnbp",
    // Technogym – Selection 900 Abdominal Crunch
    "technogym-mnzp",
    // Technogym – Selection 900 Total Abdominal
    "technogym-c95700-anvk",
    // Technogym – Selection Abdominal Crunch Med
    "lifefitness-axiom-series-abdominal",
    // Life Fitness – Axiom Series - Abdominal
    "lifefitness-hammer-strength-mts-abdominal-crunch",
    // Life Fitness – MTS Abdominal Crunch
    "lifefitness-hammer-strength-select-abdominal-crunch",
    // Life Fitness – Hammer Strength Select Abdominal Crunch
    "lifefitness-insignia-series-abdominal",
    // Life Fitness – Insignia Series Abdominal
    "lifefitness-insignia-series-abdominal-advanced",
    // Life Fitness – Insignia Series Abdominal Advanced
    "lifefitness-plate-loaded-abdominal-oblique-crunch",
    // Life Fitness – Abdominal / Oblique Crunch
    "atlantis-a301",
    // Atlantis – A301 Dual seated crunch
    "watson-abdominal-crunch",
    // Watson – SS Abdominal Crunch
    "gymleco-370-seated-abs-machine",
    // Gymleco – 370 Seated Abs Machine
    "gymleco-376-knee-standing-abdominal",
    // Gymleco – 376 Knee standing Abdominal
    "gymleco-070-seated-abs-machine",
    // Gymleco – 070 Seated Abs Machine
    "gymleco-072-ab-roll-up",
    // Gymleco – 072 Ab Roll Up
    "nautilus-nautilus-humansport-arm-crunch",
    // Nautilus – HumanSport Arm Crunch
    "nautilus-nautilus-impact-abdominal",
    // Nautilus – Impact Abdominal
    "nautilus-nautilus-inspiration-abdominal-crunch",
    // Nautilus – Inspiration Abdominal Crunch
    "nautilus-nautilus-leverage-abdominal-crunch",
    // Nautilus – Leverage Abdominal Crunch
    "panatta-upper-abdominal",
    // Panatta – 1FE065 Upper abdominal
    "panatta-abdominal-crunch",
    // Panatta – 1FE067 Abdominal crunch
    "panatta-abdominal-crunch-3",
    // Panatta – 1MTH067 Abdominal crunch
    "panatta-upper-abdominal-2",
    // Panatta – 1SC065 Upper abdominal
    "panatta-abdominal-crunch-2",
    // Panatta – 1FO065 Abdominal Crunch
    "panatta-total-core-crunch-machine",
    // Panatta – 1FW065 Total core crunch machine
    "eigen-01a18e87-b43b-73f6-bd30-e91d028d16ae",
    // Eigene – Cybex Bauchmaschine (zugeordnet 13.11.2026)
    "eigen-mwahpx70-1g9ky"
    // Gym80 – Abdominal Crunch (zugeordnet 13.11.2026)
  ]),
  rotation: /* @__PURE__ */ new Set([
    "prime-hybrid-rotary-torso",
    // PRIME Fitness – Hybrid | Rotary Torso
    "gym80-3225",
    // gym80 – 3225 Rotationsmaschine
    "technogym-mk50eh",
    // Technogym – Artis Rotary Torso
    "technogym-mnyp",
    // Technogym – Selection 900 Rotary Torso
    "technogym-c95000-anvk",
    // Technogym – Selection Rotary Torso Med
    "lifefitness-insignia-series-torso-rotation",
    // Life Fitness – Insignia Series Torso Rotation
    "lifefitness-plate-loaded-combo-twist",
    // Life Fitness – Ground Base Combo Twist
    "newtech-rotary-torso",
    // Newtech – OnHim Rotary Torso
    "watson-ss-torso-twist",
    // Watson – SS Torso Twist
    "watson-plate-load-total-torso",
    // Watson – PL Total Torso
    "gymleco-375-torso-rotation",
    // Gymleco – 375 Torso Rotation
    "nautilus-inspiration-rotary-torso",
    // Nautilus – Inspiration Rotary Torso
    "nautilus-nautilus-instinct-rotary-torso",
    // Nautilus – Instinct Rotary Torso
    "panatta-combo-twist-module",
    // Panatta – 4GRDFC5 Combo twist module
    "panatta-combo-twist",
    // Panatta – 1HP506 Combo twist
    "gymleco-975-waist-rotator",
    // Gymleco – Waist Rotator (zugeordnet 13.11.2026)
    "panatta-torsion-machine"
    // Panatta – Torsion machine (zugeordnet 13.11.2026)
  ]),
  lateral_raise: /* @__PURE__ */ new Set([
    "prime-hybrid-lateral-raise",
    // PRIME Fitness – Hybrid | Lateral Raise
    "gym80-3050",
    // gym80 – 3050 Seithebemaschine
    "gym80-3099",
    // gym80 – 3099 Seithebemaschine Stehend
    "gym80-4325",
    // gym80 – 4325 Seithebemaschine Dual
    "gym80-4385",
    // gym80 – 4385 Seithebemaschine Stehend
    "technogym-mnkc",
    // Technogym – Selection 700 Delts Machine
    "technogym-mnkp",
    // Technogym – Selection 900 Delts Machine
    "lifefitness-hammer-strength-select-lateral-raise",
    // Life Fitness – Hammer Strength Select Lateral Raise
    "lifefitness-insignia-series-lateral-raise",
    // Life Fitness – Insignia Series Lateral Raise
    "lifefitness-plate-loaded-lateral-raise",
    // Life Fitness – Plate Loaded Lateral Raise
    "atlantis-e252",
    // Atlantis – E252 Standing lateral raise
    "newtech-lateral-raise",
    // Newtech – OnHim Seated Lateral Raise
    "newtech-single-lateral-raise",
    // Newtech – OnHim Single Lateral Raise
    "newtech-standing-lateral-raise",
    // Newtech – OnHim Standing Lateral Raise
    "newtech-lateral-raise-1",
    // Newtech – Torture Lateral Raise
    "newtech-multi-lateral-raise",
    // Newtech – Multi Lateral Raise
    "watson-seated-lateral-raise",
    // Watson – SS Seated Lateral Raise
    "watson-single-stack-standing-lateral-raise",
    // Watson – SS Standing Lateral Raise
    "watson-plate-load-standing-lateral-raise",
    // Watson – PL Standing Lateral Raise
    "milon-pump-side-raise",
    // milon – 08 Side Raise
    "panatta-lateral-deltoids",
    // Panatta – 1FE026 Lateral deltoids
    "panatta-lateral-deltoid",
    // Panatta – 1MTH026 Lateral deltoid
    "panatta-lateral-deltoids-3",
    // Panatta – 1FO027 Lateral deltoids
    "panatta-lateral-deltoids-2",
    // Panatta – 1FW027 Lateral deltoids
    "watson-plate-loaded-delt-builder",
    // Watson – PL Delt Builder (zugeordnet 13.11.2026)
    "gymleco-334-standing-side-lateral",
    // Gymleco – Standing Side Lateral (zugeordnet 13.11.2026)
    "nautilus-nautilus-impact-deltoid-raise",
    // Nautilus – Impact Deltoid Raise (zugeordnet 13.11.2026)
    "nautilus-nautilus-inspiration-deltoid-raise",
    // Nautilus – Inspiration Deltoid Raise (zugeordnet 13.11.2026)
    "eigen-01a18e87-b453-704d-aac4-dc59b88dc82f",
    // PRIME Fitness – Prime Seitheben Maschine (zugeordnet 13.11.2026)
    "eigen-01a18e87-b454-7000-8fc4-a0d8ffa303fd",
    // PRIME Fitness – Prime Side raise cable (zugeordnet 13.11.2026)
    "eigen-mwai0qx5-sthlv",
    // MedX – Lateral Raise (zugeordnet 13.11.2026)
    "eigen-mwai25cv-ezhva",
    // Icarian – Standing Lateral Raise (zugeordnet 13.11.2026)
    "eigen-mwai4ggz-dpa42"
    // Atlantis – Standing Shoulder Lateral Raise E-252 (zugeordnet 13.11.2026)
  ]),
  pullover: /* @__PURE__ */ new Set([
    "prime-hybrid-pullover",
    // PRIME Fitness – Hybrid | Pullover
    "gym80-3012n",
    // gym80 – 3012N Überzugmaschine
    "gym80-4350n",
    // gym80 – 4350N Überzugmaschine
    "technogym-mg90",
    // Technogym – Pure Strength Pullover
    "lifefitness-plate-loaded-pullover",
    // Life Fitness – Plate Loaded Pullover
    "atlantis-p144",
    // Atlantis – P144 Pullover
    "watson-pullover",
    // Watson – SS Pullover
    "watson-plate-load-independent-pullover",
    // Watson – PL Independent Pullover
    "gymleco-324-pullover",
    // Gymleco – 324 Pullover
    "panatta-pullover-machine-5",
    // Panatta – 1FT039 Pullover Machine
    "panatta-pullover-machine",
    // Panatta – 1FE039 Pullover machine
    "panatta-pullover-machine-3",
    // Panatta – 1MTH039 Pullover machine
    "panatta-pullover-machine-copia",
    // Panatta – 1FO039 Pullover machine
    "panatta-super-pullover-machine",
    // Panatta – 1FW039 Super pullover machine
    "panatta-pullover-machine-2",
    // Panatta – 1FW139 Pullover machine
    "nautilus-nautilus-inspiration-pull-over",
    // Nautilus – Inspiration Pull Over (zugeordnet 13.11.2026)
    "eigen-mwahz1fg-jtskc",
    // MedX – Pullover (zugeordnet 13.11.2026)
    "eigen-mwayk3xt-vn0km",
    // Nautilus – Chain Driven SPO-3 Pullover (zugeordnet 13.11.2026)
    "eigen-mwcmwuad-0n2h8"
    // Eisenhauer Training – C1 Dual Pullover (zugeordnet 13.11.2026)
  ]),
  shrug: /* @__PURE__ */ new Set([
    "lifefitness-plate-loaded-seated-standing-shrug",
    // Life Fitness – Seated / Standing Shrug
    "atlantis-pw335",
    // Atlantis – PW335 Shrug and Deadlift Machine Pro
    "watson-seated-standing-plate-load-shrug-machine",
    // Watson – PL Seated / Standing Shrug Machine
    "nautilus-nautilus-leverage-deadlift-shrug",
    // Nautilus – Leverage Shrug
    "panatta-shrug-machine",
    // Panatta – 1FO010 Shrug Machine
    "panatta-super-shrug-machine"
    // Panatta – 1FW010 Super Shrug Machine
  ]),
  // Hüftbeugen nur über Kombigeräte und den Übungsnamen (`NAME_PATTERNS`)
  hip_flexion: /* @__PURE__ */ new Set(),
  deadlift: /* @__PURE__ */ new Set([
    "gym80-4401",
    // gym80 – FTM Deadlift Maschine (zugeordnet 13.11.2026)
    "gym80-4332",
    // gym80 – Deadlift Drehgriffe Dual (zugeordnet 13.11.2026)
    "gym80-4333",
    // gym80 – Deadlift Doppelgriffe Dual (zugeordnet 13.11.2026)
    "technogym-mg87",
    // Technogym – Pure Strength Deadlift (zugeordnet 13.11.2026)
    "bootybuilder-booty-builder-deadlift",
    // Booty Builder – Selectorized Deadlift (zugeordnet 13.11.2026)
    "watson-plate-loaded-deadlift"
    // Watson – PL Deadlift (zugeordnet 13.11.2026)
  ]),
  sissy_squat: /* @__PURE__ */ new Set([
    "gym80-4347",
    // gym80 – Sissy Squat (zugeordnet 13.11.2026)
    "gym80-4381",
    // gym80 – Sissy Squat Special (zugeordnet 13.11.2026)
    "glutebuilder-bulgarian-sissy-squat-roller"
    // Glute Builder – Bulgarian Sissy Squat Roller (zugeordnet 13.11.2026)
  ]),
  rotator_cuff: /* @__PURE__ */ new Set([
    "watson-ss-rotator-cuff",
    // Watson – SS Rotator Cuff (zugeordnet 13.11.2026)
    "gymleco-331-shoulder-rotation",
    // Gymleco – Shoulder Rotation (zugeordnet 13.11.2026)
    "gymleco-031-shoulder-rotation",
    // Gymleco – Shoulder Rotation (zugeordnet 13.11.2026)
    "panatta-rotary-cuff"
    // Panatta – Rotary cuff (zugeordnet 13.11.2026)
  ]),
  neck: /* @__PURE__ */ new Set([
    "lifefitness-4-way-neck",
    // Life Fitness – Plate Loaded 4-Way Neck (zugeordnet 13.11.2026)
    "atlantis-pw120"
    // Atlantis – Total neck (zugeordnet 13.11.2026)
  ]),
  step_up: /* @__PURE__ */ new Set([
    "bootybuilder-booty-builder-step-up"
    // Booty Builder – Selectorized Step-Up (zugeordnet 13.11.2026)
  ]),
  upright_row: /* @__PURE__ */ new Set([
    "gymleco-032-upright-row"
    // Gymleco – Upright Row (zugeordnet 13.11.2026)
  ])
};
var COMBO_MACHINES = [
  {
    label: "Butterfly / Reverse Butterfly",
    machines: /* @__PURE__ */ new Map([
      [
        "lifefitness-axiom-series-pectoral-fly-rear-deltoid",
        "Axiom Series - Pectoral Fly/Rear Deltoid"
      ],
      // Life Fitness
      [
        "lifefitness-hammer-strength-select-pectoral-fly-rear-deltoid",
        "Hammer Strength Select Pectoral Fly/Rear Deltoid"
      ],
      // Life Fitness
      [
        "lifefitness-insignia-series-pectoral-fly-rear-deltoid",
        "Insignia Series Pectoral Fly/Rear Deltoid"
      ],
      // Life Fitness
      ["panatta-peck-back-4", "1FT117 Peck Back"],
      // Panatta
      ["panatta-peck-back", "1FE117 Peck back"],
      // Panatta
      ["panatta-peck-back-2", "1MTH117 Peck back"],
      // Panatta
      ["panatta-super-peck-back", "1FW117 Super Peck Back"],
      // Panatta
      ["prime-hybrid-pec-rear-delt", "Hybrid | Pec/Rear Delt"],
      // PRIME Fitness
      ["gym80-5014", "5014 Butterfly und Butterfly Reverse Combo"],
      // gym80
      ["technogym-mnnc", "Selection 700 Dual Pectoral / Reverse Fly"],
      // Technogym
      ["atlantis-p156", "P156 Pec / Rear delt fly combo"],
      // Atlantis
      ["newtech-pec-dec-fly-with-reverse", "OnHim Pec Dec Fly (With Reverse)"],
      // Newtech
      ["newtech-standing-fly-chest-back", "OnHim Standing Fly Chest & Back"],
      // Newtech
      ["watson-single-stack-pec-fly-rear-delt", "SS Pec Fly / Rear Delt"],
      // Watson
      ["gymleco-935-pec-deck-rear-deltoid-shoulder", "935 Pec Deck/Rear Deltoid Shoulder"],
      // Gymleco
      ["gymleco-335-rear-deltoid-pec-deck", "335 Rear Deltoid/Pec Deck"],
      // Gymleco
      ["nautilus-nautilus-inspiration-pec-fly-rear-deltoid", "Inspiration Pec Fly/Rear Deltoid"],
      // Nautilus
      [
        "nautilus-nautilus-instinct-dual-pectoral-fly-rear-deltoid",
        "Instinct Dual Butterfly/Hintere Schulter"
      ],
      // Nautilus
      ["technogym-mn3p", "Selection 900 Multi Flight"],
      // Technogym
      ["panatta-standing-multi-flight", "1FE028 Standing multi flight"],
      // Panatta
      ["panatta-standing-multi-flight-2", "1MTH028 Standing multi flight"],
      // Panatta
      ["watson-single-stack-multi-pec-delt", "SS Multi Pec / Delt"]
      // Watson
    ]),
    rules: [[/reverse|rear|hintere/i, "reverse_fly"]],
    fallback: "fly"
  },
  {
    label: "Brustpresse / Butterfly",
    machines: /* @__PURE__ */ new Map([
      ["eigen-mw1bol46-s7z4y", "Double Chest"]
      // Nautilus
    ]),
    rules: [[/fly|flye|butterfly|pec ?d[eu]c?k/i, "fly"]],
    fallback: "press_flat"
  },
  {
    label: "Beinstrecker / Beinbeuger sitzend",
    machines: /* @__PURE__ */ new Map([
      ["prime-hybrid-leg-extension-leg-curl-combo", "Hybrid | Leg Extension/Leg Curl Combo"],
      // PRIME Fitness
      [
        "prime-plate-loaded-leg-extension-leg-curl-combo",
        "Plate Loaded | Leg Extension/Leg Curl Combo"
      ],
      // PRIME Fitness
      ["gym80-5013", "5013 Beinbeuger und Beinstrecker Combo"],
      // gym80
      ["lifefitness-axiom-series-leg-extension-leg-curl", "Axiom Series - Leg Extension/Leg Curl"],
      // Life Fitness
      ["atlantis-c230", "C230 Leg extension/Leg curl combo"],
      // Atlantis
      ["watson-single-stack-seated-leg-extension-leg-curl", "SS Leg Extension / Seated Leg Curl"],
      // Watson
      ["gymleco-949-leg-extension-leg-curl", "949 Leg Extension/Leg Curl"],
      // Gymleco
      ["gymleco-349-leg-extension-leg-curl", "349 Leg Extension/Leg Curl"],
      // Gymleco
      [
        "nautilus-nautilus-instinct-dual-leg-extension-leg-curl",
        "Instinct Dual Beinstrecker/Beinbeuger"
      ],
      // Nautilus
      ["technogym-mnmc", "Selection 700 Dual Leg Curl / Extension"],
      // Technogym
      [
        "lifefitness-axiom-series-seated-leg-curl-extension",
        "Axiom Series - Seated Leg Curl/Extension"
      ]
      // Life Fitness
    ]),
    rules: [[/curl|beuger/i, "leg_curl_seated"]],
    fallback: "leg_extension"
  },
  {
    label: "Beinstrecker / Beinbeuger liegend",
    machines: /* @__PURE__ */ new Map([
      ["watson-single-stack-leg-extension-leg-curl", "SS Leg Extension / Lying Leg Curl"]
      // Watson
    ]),
    rules: [[/curl|beuger/i, "leg_curl_lying"]],
    fallback: "leg_extension"
  },
  {
    label: "Adduktion / Abduktion",
    machines: /* @__PURE__ */ new Map([
      ["gym80-5011", "5011 Abduktion und Adduktion Combo"],
      // gym80
      ["technogym-mnoc", "Selection 700 Dual Abductor / Adductor"],
      // Technogym
      ["lifefitness-axiom-series-hip-abductor-adductor", "Axiom Series - Hip Abductor/Adductor"],
      // Life Fitness
      [
        "lifefitness-insignia-series-hip-abductor-adductor",
        "Insignia Series Hip Abductor / Adductor"
      ],
      // Life Fitness
      ["atlantis-c329", "C329 Adductor / Abductor combo"],
      // Atlantis
      ["newtech-hip-adduction-abduction-combo", "OnHim Hip Adduction/Abduction Combo"],
      // Newtech
      ["watson-dual-hip-adductor-abductor", "SS Dual Hip Adductor / Abductor"],
      // Watson
      ["gymleco-964-abductor-adductor", "964 Abductor/Adductor"],
      // Gymleco
      ["gymleco-364-adductor-abductor", "364 Adductor/Abductor"],
      // Gymleco
      ["nautilus-nautilus-inspiration-abduction-adduction", "Inspiration Abduktion/Adduktion"],
      // Nautilus
      ["nautilus-nautilus-instinct-dual-inner-outer-thigh", "Instinct Dual Adduktoren/Abduktoren"],
      // Nautilus
      ["panatta-adductor-abductor-machine", "1FE093 Adductor/ abductor machine"],
      // Panatta
      ["panatta-adductor-abductor-machine-2", "1MTH093 Dual Adductor Abductor machine"],
      // Panatta
      ["prime-hybrid-inner-outer-thigh", "Hybrid | Inner/Outer Thigh"]
      // PRIME Fitness
    ]),
    rules: [[/abd|outer|außen/i, "abduction"]],
    fallback: "adduction"
  },
  {
    label: "Multi-Hip",
    machines: /* @__PURE__ */ new Map([
      ["prime-hybrid-multi-hip", "Hybrid | Multi-Hip"],
      // PRIME Fitness
      ["technogym-mk67eh", "Artis Multi Hip"],
      // Technogym
      ["technogym-mndc", "Selection 700 Multi Hip"],
      // Technogym
      ["technogym-mndp", "Selection 900 Multi Hip"],
      // Technogym
      ["technogym-c96700-anvk", "Selection Multi Hip Med"],
      // Technogym
      ["watson-single-stack-multi-hip", "SS Multi-Hip"],
      // Watson
      ["gymleco-369-multihip-machine", "369 Multihip"],
      // Gymleco
      ["panatta-multi-hip", "1FE090 Multi hip"],
      // Panatta
      ["panatta-multi-hip-2", "1MTH090 Multi hip"]
      // Panatta
    ]),
    rules: [
      [/abd|outer|außen|seitlich/i, "abduction"],
      [/add|inner|innen/i, "adduction"]
    ],
    fallback: "glute_kick"
  },
  {
    label: "Bauch / R\xFCckenstrecker",
    machines: /* @__PURE__ */ new Map([
      [
        "lifefitness-axiom-series-abdominal-back-extension",
        "Axiom Series - Abdominal/Back Extension"
      ],
      // Life Fitness
      ["gymleco-965-abs-lower-back", "965 Abs/Lower Back"],
      // Gymleco
      ["gym80-5012", "5012 Bauch und R\xFCcken Combo"],
      // gym80
      ["gymleco-365a-lumbar-abdominal", "365A Lumbar/Abdominal"],
      // Gymleco
      ["gymleco-365b-lumbar-abdominal-with-armrest", "365B Lumbar/Abdominal (with Armrest)"],
      // Gymleco
      [
        "nautilus-nautilus-instinct-dual-abdominal-lower-back",
        "Instinct Dual Bauchmuskel/Unterer R\xFCcken"
      ]
      // Nautilus
    ]),
    rules: [[/back|rücken|lumbar|extension|strecker/i, "back_extension"]],
    fallback: "crunch"
  },
  {
    label: "Bizeps / Trizeps",
    machines: /* @__PURE__ */ new Map([
      ["lifefitness-axiom-series-biceps-triceps", "Axiom Series - Biceps/Triceps"],
      // Life Fitness
      ["watson-single-stack-bicep-tricep-machine", "SS Bicep Tricep Machine"],
      // Watson
      ["gymleco-955-biceps-triceps", "955 Biceps/Triceps"],
      // Gymleco
      ["gymleco-355-biceps-triceps", "355 Biceps/Triceps"],
      // Gymleco
      ["panatta-dual-curling-triceps-machine", "1SCD050 Dual curling | triceps machine"],
      // Panatta
      ["gymleco-255-biceps-curl-triceps-extension", "Biceps Curl/Triceps Extension"],
      // Gymleco
      ["panatta-standing-total-arms", "Standing Total Arms"],
      // Panatta
      ["panatta-alternate-standing-total-arms", "Alternate standing total arms"],
      // Panatta
      ["panatta-standing-total-arms-2", "Standing total arms"]
      // Panatta
    ]),
    rules: [[/tri|extension|strecker|drücken/i, "triceps"]],
    fallback: "biceps_curl"
  },
  {
    label: "Squat / Wade",
    machines: /* @__PURE__ */ new Map([
      ["newtech-squat-calf-raise", "Torture Squat & Calf Raise"],
      // Newtech
      ["panatta-squat-and-calf-machine", "1FT091 Squat and Calf Machine"],
      // Panatta
      ["panatta-squat-machine-and-calf", "1FO091 Squat and Calf Machine"]
      // Panatta
    ]),
    rules: [[/calf|wade/i, "calf_standing"]],
    fallback: "hack_squat"
  },
  {
    label: "Wade / Tibialis",
    machines: /* @__PURE__ */ new Map([
      ["watson-total-calf-tibialis-developer", "PL Total Calf / Tibialis Developer"]
      // Watson
    ]),
    rules: [[/tib/i, "tibialis"]],
    fallback: "calf_standing"
  },
  {
    label: "Seitheben / hintere Schulter",
    machines: /* @__PURE__ */ new Map([
      ["atlantis-e352", "E352 Seated side / Rear deltoid"]
      // Atlantis
    ]),
    rules: [[/rear|hintere|reverse/i, "reverse_fly"]],
    fallback: "lateral_raise"
  },
  {
    label: "H\xFCftbeugen / Dips",
    machines: /* @__PURE__ */ new Map([
      ["technogym-pa11", "Leg Raise Dip"]
      // Technogym
    ]),
    rules: [[/leg|bein|knie|knee|hüft|hip|captain/i, "hip_flexion"]],
    fallback: "dip"
  },
  {
    label: "Klimmzug / Dips",
    machines: /* @__PURE__ */ new Map([
      ["prime-specialty-chin-dip-assist", "Chin/Dip Assist"],
      // PRIME Fitness
      ["gym80-3017", "Klimmzug-Barrenmaschine"],
      // gym80
      ["technogym-mb91", "Kneeling Easy Chin Dip"],
      // Technogym
      ["lifefitness-hammer-strength-select-assist-dip-chin", "Hammer Strength Select Assist Dip Chin"],
      // Life Fitness
      ["lifefitness-insignia-series-assist-dip-chin", "Insignia Series Assist Dip Chin"],
      // Life Fitness
      ["atlantis-d131", "Assisted chin/dip"],
      // Atlantis
      ["newtech-chin-up-dip-assist", "OnHim Chin-Up, Dip Assist (Thomson)"],
      // Newtech
      ["watson-assisted-chin-dip", "SS Assisted Chin / Dip"],
      // Watson
      ["gymleco-314-chins-dips", "Chins/Dips"],
      // Gymleco
      ["nautilus-nautilus-impact-chin-dip-assist", "Impact Assisted Chin/Dip"],
      // Nautilus
      ["panatta-chin-and-dip-counterbalanced", "Chin and dip counterbalanced"]
      // Panatta
    ]),
    rules: [[/dip|barren/i, "dip"]],
    fallback: "pulldown"
  },
  {
    label: "Brustpresse / Schulterpresse",
    machines: /* @__PURE__ */ new Map([
      ["gym80-4402", "FTM Schulter und Brustpresse"],
      // gym80
      ["nautilus-nautilus-humansport-shoulder-chest", "HumanSport Shoulder Chest"]
      // Nautilus
    ]),
    rules: [[/schulter|shoulder|overhead|überkopf|military/i, "shoulder_press"]],
    fallback: "press_flat"
  },
  {
    label: "Beinpresse / Hack-Squat",
    machines: /* @__PURE__ */ new Map([
      ["gymleco-245-leg-press-hacklift", "Leg Press/Hacklift"]
      // Gymleco
    ]),
    rules: [[/hack|squat|kniebeuge/i, "hack_squat"]],
    fallback: "leg_press"
  },
  {
    label: "Kreuzheben / Split Squat",
    machines: /* @__PURE__ */ new Map([
      ["bootybuilder-booty-builder-split-squat-deadlift", "Selectorized Deadlift/Split Squat"],
      // Booty Builder
      ["glutebuilder-deadlift-elite", "Deadlift / Bulgarian Squat Pro"]
      // Glute Builder
    ]),
    rules: [[/split|bulgar|ausfall|lunge/i, "step_up"]],
    fallback: "deadlift"
  },
  {
    label: "Kreuzheben / Kniebeuge",
    machines: /* @__PURE__ */ new Map([
      ["gymleco-083-deadlift-squat-machine", "Deadlift / Squat Machine"]
      // Gymleco
    ]),
    rules: [[/squat|kniebeuge/i, "hack_squat"]],
    fallback: "deadlift"
  }
];
var NAME_PATTERNS = [
  [
    /beinheben|knieheben|leg[- ]?raise|knee[- ]?raise|knee[- ]?up|captain|toes[- ]to[- ]bar|hüftbeug|hip[- ]?flex/i,
    "hip_flexion"
  ],
  // Ergänzt 13.11.2026: freie Übungen, Körpergewicht und Übungen an Mehrzweckgeräten (Rack, Kabelzug …).
  // Reihenfolge: genauere Begriffe zuerst (z. B. „Aufrechtes Rudern“ vor „Rudern“, „Beincurl“ vor „Curl“).
  [/sissy/i, "sissy_squat"],
  [/aufrecht\w* rudern|upright[- ]?row/i, "upright_row"],
  [/rotator|außenrotation|aussenrotation|external[- ]?rotation|rotatorenmanschette/i, "rotator_cuff"],
  [/nackendrücken/i, "shoulder_press"],
  [/nacken|\bneck\b/i, "neck"],
  [/nordic|glute[- ]?ham/i, "leg_curl_lying"],
  [/(beincurl|leg[- ]?curl|beinbeuger).*(sitzend|seated)|(sitzend|seated).*(beincurl|leg[- ]?curl|beinbeuger)/i, "leg_curl_seated"],
  [/beincurl|leg[- ]?curl|beinbeuger/i, "leg_curl_lying"],
  [/beinstreck|leg[- ]?extension/i, "leg_extension"],
  [/wadenheben sitzend|seated calf/i, "calf_seated"],
  [/wadenheben|calf[- ]?raise|\bwade/i, "calf_standing"],
  [/hip[- ]?thrust|glute[- ]?bridge|beckenheben|hüftheben/i, "hip_thrust"],
  [/rumänisch|romanian|\brdl\b|kreuzheben|deadlift|good[- ]?morning/i, "deadlift"],
  [/ausfallschritt|lunge|split[- ]?squat|bulgar|step[- ]?up|aufsteiger|pistol|shrimp/i, "step_up"],
  [/hack|kniebeuge|squat/i, "hack_squat"],
  [/beinpresse|leg[- ]?press/i, "leg_press"],
  [/face[- ]?pull/i, "reverse_fly"],
  [/australian|ring[- ]?rudern|inverted row|rudern|\brow\b/i, "row"],
  [/klimmzug|chin[- ]?up|pull[- ]?up|latzug|lat[- ]?pull/i, "pulldown"],
  [/pull[- ]?over|überzug/i, "pullover"],
  [/reverse[- ]?(fly|butterfly)|rear[- ]?delt|vorgebeugt\w* seitheben|reverse[- ]?flye/i, "reverse_fly"],
  [/seitheben|lateral[- ]?raise|side[- ]?raise/i, "lateral_raise"],
  [/butterfly|\bfly\b|flye|fliegende|cable[- ]?cross|crossover/i, "fly"],
  [/shrug|schulterheben/i, "shrug"],
  [/\bdips?\b|barren/i, "dip"],
  [/überkopf\w*.*trizeps|trizeps.*überkopf|overhead[- ]?(triceps|extension)|french[- ]?press/i, "triceps_overhead"],
  [/trizeps|triceps|pushdown|skull ?crusher|kickback/i, "triceps"],
  [/handgelenk|wrist|unterarm|forearm|reverse[- ]?curl/i, "forearm"],
  [/curl|bizeps|biceps/i, "biceps_curl"],
  [/pike|handstand|schulterdrücken|shoulder[- ]?press|military|overhead[- ]?press|arnold/i, "shoulder_press"],
  [/schrägbank|incline[- ]?(bench|press)|decline[- ]?liegest|decline[- ]?push/i, "press_incline"],
  [/negativ\w* bank|decline[- ]?(bench|press)|liegestütz erhöht|incline[- ]?push/i, "press_decline"],
  [/bankdrücken|bench[- ]?press|brustpresse|chest[- ]?press|liegestütz|push[- ]?up/i, "press_flat"],
  [/russian twist|holzhacker|woodchop|rotation|pallof/i, "rotation"],
  [/rückenstreck|hyperextension|back[- ]?extension|superman/i, "back_extension"],
  [/crunch|sit[- ]?up|bauch|dragon flag/i, "crunch"]
];
var ROW_GRIP_MACHINE_IDS = PATTERN_MACHINE_IDS.row;
var PULLDOWN_GRIP_MACHINE_IDS = PATTERN_MACHINE_IDS.pulldown;
var PRESS_FLAT_MACHINE_IDS = PATTERN_MACHINE_IDS.press_flat;
var PRESS_INCLINE_MACHINE_IDS = PATTERN_MACHINE_IDS.press_incline;
var PRESS_DECLINE_MACHINE_IDS = PATTERN_MACHINE_IDS.press_decline;
var SHOULDER_PRESS_MACHINE_IDS = PATTERN_MACHINE_IDS.shoulder_press;
var DIP_MACHINE_IDS = PATTERN_MACHINE_IDS.dip;
var FLY_MACHINE_IDS = PATTERN_MACHINE_IDS.fly;
var REVERSE_FLY_MACHINE_IDS = PATTERN_MACHINE_IDS.reverse_fly;
var FLY_PROFILE = FLY_PROFILES.wide.pronated;
var REVERSE_FLY_PROFILE = REVERSE_FLY_PROFILES.wide.pronated;
var PATTERN_OF = new Map(
  Object.entries(PATTERN_MACHINE_IDS).flatMap(
    ([pattern, ids]) => [...ids].map((id) => [id, pattern])
  )
);
function comboHint(exerciseName, machineName) {
  const name = (exerciseName ?? "").toLowerCase();
  const machine = machineName.trim().toLowerCase();
  return machine ? name.split(machine).join(" ") : name;
}
function nameHint(exerciseName, machineNames = []) {
  let name = (exerciseName ?? "").toLowerCase();
  const names = machineNames.map((n) => n.trim().toLowerCase()).filter((n) => n.length > 0).sort((a, b) => b.length - a.length);
  for (const n of names) name = name.split(n).join(" ");
  return name.trim();
}
function machineNamesOf(m) {
  if (!m) return [];
  const out = [];
  if (m.displayName) {
    out.push(m.displayName);
    if (m.manufacturer) out.push(`${m.manufacturer} ${m.displayName}`);
  }
  if (m.name) out.push(m.name);
  return out;
}
function gripPatternOf(machineId, exerciseName, machineNames = []) {
  if (machineId) {
    for (const combo of COMBO_MACHINES) {
      const machineName = combo.machines.get(machineId);
      if (machineName === void 0) continue;
      const hint = comboHint(exerciseName, machineName);
      for (const [rule, pattern2] of combo.rules) if (rule.test(hint)) return pattern2;
      return combo.fallback;
    }
    const pattern = PATTERN_OF.get(machineId);
    if (pattern) return pattern;
  }
  const name = nameHint(exerciseName, machineId ? machineNames : []);
  for (const [rule, pattern] of NAME_PATTERNS) if (rule.test(name)) return pattern;
  return null;
}
var MACHINE_DEFAULT_WIDTH = /* @__PURE__ */ new Map([
  ["technogym-mn1p", "wide"],
  ["technogym-c94600-anvk", "wide"]
]);
function gripWidthChoice(text) {
  const t = (text ?? "").trim().toLowerCase();
  if (t === "eng") return "narrow";
  if (t === "weit" || t === "breit") return "wide";
  return null;
}
function isGripPosition(v) {
  return v === "supinated" || v === "neutral" || v === "pronated";
}
function gripFocusFor(machineId, exerciseName, gripWidth, gripPosition, machineNames = []) {
  const pattern = gripPatternOf(machineId, exerciseName, machineNames);
  if (!pattern) return null;
  const profiles = GRIP_PROFILES[pattern];
  const chosen = gripWidthChoice(gripWidth);
  if (chosen === null && profiles.standard)
    return { pattern, focus: profiles.standard, explicit: false };
  const width = chosen ?? (machineId ? MACHINE_DEFAULT_WIDTH.get(machineId) : void 0) ?? DEFAULT_WIDTH[pattern] ?? "wide";
  const position = isGripPosition(gripPosition) ? gripPosition : DEFAULT_POSITION[pattern] ?? DEFAULT_GRIP_POSITION[width];
  return { pattern, focus: profiles[width][position], explicit: chosen !== null };
}

// src/domain/muscleMap.ts
var MUSCLE_IDS = [
  "chest_upper",
  "chest_lower",
  "front_delts",
  "side_delts",
  "rear_delts",
  "biceps",
  "brachialis",
  "triceps_long",
  "triceps_lateral",
  "triceps_medial",
  "brachioradialis",
  "forearm_flexors",
  "forearm_extensors",
  "abs_upper",
  "abs_lower",
  "obliques",
  "serratus",
  "neck",
  "traps_upper",
  "traps_middle",
  "traps_lower",
  "infraspinatus",
  "teres",
  "lats",
  "lower_back",
  "glutes",
  "glute_medius",
  "tfl",
  "adductors",
  "rectus_femoris",
  "vastus_lateralis",
  "vastus_medialis",
  "sartorius",
  "hamstrings_lateral",
  "hamstrings_medial",
  "gastrocnemius",
  "soleus",
  "tibialis"
];
var MUSCLE_LABELS = {
  chest_upper: "Obere Brust (Pars clavicularis)",
  chest_lower: "Mittlere / untere Brust (Pars sternocostalis)",
  front_delts: "Vordere Schulter",
  side_delts: "Seitliche Schulter",
  rear_delts: "Hintere Schulter",
  biceps: "Bizeps",
  brachialis: "Oberarmmuskel (Brachialis)",
  triceps_long: "Trizeps: langer Kopf",
  triceps_lateral: "Trizeps: seitlicher Kopf",
  triceps_medial: "Trizeps: mittlerer Kopf",
  brachioradialis: "Oberarmspeichenmuskel (Brachioradialis)",
  forearm_flexors: "Unterarmbeuger",
  forearm_extensors: "Unterarmstrecker",
  abs_upper: "Gerader Bauchmuskel oberhalb des Nabels",
  abs_lower: "Gerader Bauchmuskel unterhalb des Nabels",
  obliques: "Schr\xE4ge Bauchmuskeln",
  serratus: "S\xE4gemuskel (Serratus anterior)",
  neck: "Nacken / Hals",
  traps_upper: "Oberer Trapez",
  traps_middle: "Mittlerer Trapez",
  traps_lower: "Unterer Trapez",
  infraspinatus: "Untergr\xE4tenmuskel (Infraspinatus)",
  teres: "Rundmuskeln (Teres)",
  lats: "Latissimus",
  lower_back: "Unterer R\xFCcken (R\xFCckenstrecker)",
  glutes: "Gro\xDFer Ges\xE4\xDFmuskel (Gluteus maximus)",
  glute_medius: "Mittlerer Ges\xE4\xDFmuskel (Gluteus medius)",
  tfl: "Schenkelbindenspanner (TFL)",
  adductors: "Adduktoren",
  rectus_femoris: "Quadrizeps: Rectus femoris",
  vastus_lateralis: "Quadrizeps: Vastus lateralis",
  vastus_medialis: "Quadrizeps: Vastus medialis",
  sartorius: "Schneidermuskel (H\xFCftbeuger)",
  hamstrings_lateral: "Beinbeuger au\xDFen (Biceps femoris)",
  hamstrings_medial: "Beinbeuger innen (Semitendinosus / Semimembranosus)",
  gastrocnemius: "Zwillingswadenmuskel (Gastrocnemius)",
  soleus: "Schollenmuskel (Soleus)",
  tibialis: "Schienbeinmuskel"
};
var CHEST = ["chest_upper", "chest_lower"];
var DELTS = ["front_delts", "side_delts", "rear_delts"];
var ABS = ["abs_upper", "abs_lower"];
var TRAPS = ["traps_upper", "traps_middle", "traps_lower"];
var UPPER_BACK = ["infraspinatus", "teres", "traps_middle", "traps_lower"];
var QUADS = ["rectus_femoris", "vastus_lateralis", "vastus_medialis"];
var HAMS = ["hamstrings_lateral", "hamstrings_medial"];
var CALVES = ["gastrocnemius", "soleus"];
var ABDUCTORS = ["glute_medius", "tfl"];
var TRICEPS = ["triceps_long", "triceps_lateral", "triceps_medial"];
var FOREARMS = ["brachioradialis", "forearm_flexors", "forearm_extensors"];
var ARM_FLEXORS = ["biceps", "brachialis", "brachioradialis"];
var TERMS = {
  brust: CHEST,
  brustmuskel: CHEST,
  "obere brust": ["chest_upper"],
  "untere brust": ["chest_lower"],
  "mittlere brust": ["chest_lower"],
  latissimus: ["lats"],
  lat: ["lats"],
  r\u00FCcken: ["lats", ...UPPER_BACK, "traps_upper"],
  "oberer r\xFCcken": [...UPPER_BACK, "traps_upper"],
  rhomboiden: ["traps_middle", "traps_lower"],
  trapez: TRAPS,
  "oberer trapez": ["traps_upper"],
  "mittlerer trapez": ["traps_middle"],
  "unterer trapez": ["traps_lower"],
  nacken: ["neck", "traps_upper"],
  r\u00FCckenstrecker: ["lower_back"],
  "unterer r\xFCcken": ["lower_back"],
  infraspinatus: ["infraspinatus"],
  rotatorenmanschette: ["infraspinatus", "teres"],
  teres: ["teres"],
  schulter: DELTS,
  schultern: DELTS,
  "vordere schulter": ["front_delts"],
  "seitliche schulter": ["side_delts"],
  "hintere schulter": ["rear_delts"],
  bizeps: ["biceps"],
  armbeuger: ARM_FLEXORS,
  brachialis: ["brachialis"],
  oberarmmuskel: ["brachialis"],
  trizeps: TRICEPS,
  "trizeps langer kopf": ["triceps_long"],
  "trizeps seitlicher kopf": ["triceps_lateral"],
  "trizeps mittlerer kopf": ["triceps_medial"],
  "langer trizepskopf": ["triceps_long"],
  "seitlicher trizepskopf": ["triceps_lateral"],
  "mittlerer trizepskopf": ["triceps_medial"],
  unterarme: FOREARMS,
  unterarm: FOREARMS,
  brachioradialis: ["brachioradialis"],
  oberarmspeichenmuskel: ["brachioradialis"],
  unterarmbeuger: ["forearm_flexors"],
  unterarmstrecker: ["forearm_extensors"],
  handgelenksbeuger: ["forearm_flexors"],
  handgelenksstrecker: ["forearm_extensors"],
  griffkraft: ["forearm_flexors"],
  arme: ["biceps", "brachialis", ...TRICEPS],
  bauch: [...ABS, "obliques"],
  "gerade bauchmuskulatur": ABS,
  "obere bauchmuskulatur": ["abs_upper"],
  "untere bauchmuskulatur": ["abs_lower"],
  "seitliche bauchmuskulatur": ["obliques"],
  "seitlicher rumpf": ["obliques"],
  "schr\xE4ge bauchmuskulatur": ["obliques"],
  s\u00E4gemuskel: ["serratus"],
  serratus: ["serratus"],
  core: [...ABS, "obliques", "lower_back"],
  rumpf: [...ABS, "obliques", "lower_back"],
  quadrizeps: QUADS,
  oberschenkel: QUADS,
  beinstrecker: QUADS,
  "rectus femoris": ["rectus_femoris"],
  "vastus lateralis": ["vastus_lateralis"],
  "vastus medialis": ["vastus_medialis"],
  beinbeuger: HAMS,
  "biceps femoris": ["hamstrings_lateral"],
  semitendinosus: ["hamstrings_medial"],
  semimembranosus: ["hamstrings_medial"],
  gluteus: ["glutes"],
  "gluteus maximus": ["glutes"],
  "gluteus medius": ["glute_medius"],
  ges\u00E4\u00DF: ["glutes"],
  po: ["glutes"],
  abduktoren: ABDUCTORS,
  adduktoren: ["adductors"],
  h\u00FCftbeuger: ["sartorius", "rectus_femoris"],
  waden: CALVES,
  wade: CALVES,
  gastrocnemius: ["gastrocnemius"],
  soleus: ["soleus"],
  tibialis: ["tibialis"],
  schienbein: ["tibialis"],
  beine: [...QUADS, ...HAMS, "glutes"],
  // Englische Bezeichnungen
  chest: CHEST,
  pecs: CHEST,
  "upper chest": ["chest_upper"],
  "lower chest": ["chest_lower"],
  back: ["lats", ...UPPER_BACK, "traps_upper"],
  lats: ["lats"],
  "upper back": [...UPPER_BACK, "traps_upper"],
  "lower back": ["lower_back"],
  traps: TRAPS,
  neck: ["neck", "traps_upper"],
  shoulders: DELTS,
  shoulder: DELTS,
  delts: DELTS,
  "front delts": ["front_delts"],
  "side delts": ["side_delts"],
  "lateral delts": ["side_delts"],
  "rear delts": ["rear_delts"],
  biceps: ["biceps"],
  triceps: TRICEPS,
  "triceps long head": ["triceps_long"],
  "triceps lateral head": ["triceps_lateral"],
  "triceps medial head": ["triceps_medial"],
  forearms: FOREARMS,
  "wrist flexors": ["forearm_flexors"],
  "wrist extensors": ["forearm_extensors"],
  grip: ["forearm_flexors"],
  arms: ["biceps", "brachialis", ...TRICEPS],
  abs: [...ABS, "obliques"],
  obliques: ["obliques"],
  quads: QUADS,
  quadriceps: QUADS,
  hamstrings: HAMS,
  glutes: ["glutes"],
  abductors: ABDUCTORS,
  adductors: ["adductors"],
  "hip flexors": ["sartorius", "rectus_femoris"],
  calves: CALVES,
  legs: [...QUADS, ...HAMS, "glutes"]
};
var LEGACY_MUSCLES = {
  chest: CHEST,
  abs: ABS,
  traps: TRAPS,
  upper_back: ["infraspinatus", "teres"],
  abductors: ABDUCTORS,
  quads: QUADS,
  hamstrings: HAMS,
  calves: CALVES,
  triceps: TRICEPS,
  forearms: FOREARMS
};
var SECONDARY_FACTOR = 0.5;
function splitMuscleText(text) {
  if (!text) return [];
  return text.split(/[,;/+]|\s+und\s+/i).map((t) => t.trim()).filter((t) => t.length > 0);
}
function muscleIdsForTerm(term) {
  return TERMS[term.trim().toLowerCase()] ?? null;
}
function isMuscleId(v) {
  return MUSCLE_IDS.includes(v);
}
function focusFactors(focus) {
  if (!focus || focus.length === 0) return null;
  const factors = {};
  for (const f of focus) {
    if (f.percent > 0) factors[f.muscle] = Math.min(100, f.percent) / 100;
  }
  return Object.keys(factors).length > 0 ? { factors, unmapped: [] } : null;
}
function exerciseMuscles(muscleGroup, machineMuscleGroups = [], exerciseFocus, machineFocus) {
  const focused = focusFactors(exerciseFocus) ?? focusFactors(machineFocus);
  if (focused) return focused;
  const own = splitMuscleText(muscleGroup);
  const terms = own.length > 0 ? own : machineMuscleGroups.flatMap((t) => splitMuscleText(t));
  const factors = {};
  const unmapped = [];
  terms.forEach((term, i) => {
    const ids = muscleIdsForTerm(term);
    if (!ids) {
      unmapped.push(term);
      return;
    }
    const factor = i === 0 ? 1 : SECONDARY_FACTOR;
    for (const id of ids) factors[id] = Math.max(factors[id] ?? 0, factor);
  });
  return { factors, unmapped };
}
function emptyMuscleValues() {
  return Object.fromEntries(MUSCLE_IDS.map((m) => [m, 0]));
}
var NO_FOCUS = { machines: /* @__PURE__ */ new Map(), exercises: /* @__PURE__ */ new Map() };
function buildFocusIndex(rows) {
  const machines = /* @__PURE__ */ new Map();
  const exercises = /* @__PURE__ */ new Map();
  for (const r2 of rows.machines) {
    if (!isMuscleId(r2.muscle)) continue;
    machines.set(r2.machineId, [
      ...machines.get(r2.machineId) ?? [],
      { muscle: r2.muscle, percent: r2.percent }
    ]);
  }
  for (const r2 of rows.exercises) {
    if (!isMuscleId(r2.muscle)) continue;
    exercises.set(r2.exerciseId, [
      ...exercises.get(r2.exerciseId) ?? [],
      { muscle: r2.muscle, percent: r2.percent }
    ]);
  }
  return { machines, exercises };
}
function muscleMapData(log, exercises, machines, include, focus = NO_FOCUS) {
  const machineGroups = new Map(machines.map((m) => [m.id, m.muscleGroups]));
  const machineNames = new Map(machines.map((m) => [m.id, machineNamesOf(m)]));
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const ownFocus = new Set(
    exercises.filter(
      (e) => focusFactors(focus.exercises.get(e.id)) !== null || e.machineId !== null && focusFactors(focus.machines.get(e.machineId)) !== null
    ).map((e) => e.id)
  );
  const byExercise = new Map(
    exercises.map((e) => [
      e.id,
      exerciseMuscles(
        e.muscleGroup,
        e.machineId ? machineGroups.get(e.machineId) ?? [] : [],
        focus.exercises.get(e.id),
        e.machineId ? focus.machines.get(e.machineId) : void 0
      )
    ])
  );
  const sets = emptyMuscleValues();
  const volumeKg = emptyMuscleValues();
  const unmapped = /* @__PURE__ */ new Map();
  let totalSets = 0;
  let setsWithoutMuscle = 0;
  for (const s of log) {
    if (s.isWarmup || s.exerciseCategory !== "strength" || !include(s)) continue;
    totalSets += 1;
    const ex = exerciseById.get(s.exerciseId);
    const grip = gripFocusFor(
      ex?.machineId,
      ex?.name,
      s.gripWidth,
      s.gripPosition,
      ex?.machineId ? machineNames.get(ex.machineId) ?? [] : []
    );
    const gripMuscles = grip && (grip.explicit || !ownFocus.has(s.exerciseId)) ? focusFactors(grip.focus) : null;
    const m = gripMuscles ?? byExercise.get(s.exerciseId) ?? { factors: {}, unmapped: [] };
    for (const term of m.unmapped) unmapped.set(term, (unmapped.get(term) ?? 0) + 1);
    const entries = Object.entries(m.factors);
    if (entries.length === 0) {
      setsWithoutMuscle += 1;
      continue;
    }
    const volume = setVolumeKg(s);
    for (const [id, factor] of entries) {
      sets[id] += factor;
      volumeKg[id] += volume * factor;
    }
  }
  return {
    sets,
    volumeKg,
    totalSets,
    setsWithoutMuscle,
    unmapped: [...unmapped.entries()].map(([term, n]) => ({ term, sets: n })).sort((a, b) => b.sets - a.sets || a.term.localeCompare(b.term, "de"))
  };
}
function muscleMapForRange(log, exercises, machines, from, to, focus = NO_FOCUS) {
  return muscleMapData(log, exercises, machines, (s) => s.date >= from && s.date <= to, focus);
}
var SCALE_MODE_LABELS = {
  standard: "Standard",
  individual: "Individuell",
  relative: "Relativ"
};
var LEVEL_NAMES = ["wenig", "moderat", "Aufbau", "hoch", "sehr hoch"];
var STANDARD_TARGET = { moderate: 6, build: 10, high: 15, veryHigh: 21 };
var RELATIVE_TARGET = {
  moderate: 0.2,
  build: 0.4,
  high: 0.6,
  veryHigh: 0.8
};
var DEFAULT_TARGETS = (() => {
  const t = (moderate, build, high, veryHigh) => ({
    moderate,
    build,
    high,
    veryHigh
  });
  const chest = t(6, 10, 16, 22);
  const abs = t(3, 8, 16, 22);
  const traps = t(3, 8, 16, 22);
  const upperBack = t(6, 10, 16, 22);
  const quads = t(6, 9, 16, 20);
  const hams = t(4, 7, 13, 18);
  const calves = t(6, 10, 16, 22);
  const small = t(3, 6, 12, 18);
  return {
    chest_upper: chest,
    chest_lower: chest,
    front_delts: t(3, 6, 10, 14),
    side_delts: t(8, 12, 20, 26),
    rear_delts: t(6, 10, 18, 24),
    biceps: t(6, 10, 16, 22),
    brachialis: t(6, 10, 16, 22),
    triceps_long: t(5, 8, 14, 20),
    triceps_lateral: t(5, 8, 14, 20),
    triceps_medial: t(5, 8, 14, 20),
    brachioradialis: small,
    forearm_flexors: small,
    forearm_extensors: small,
    abs_upper: abs,
    abs_lower: abs,
    obliques: small,
    serratus: small,
    neck: t(2, 4, 8, 12),
    traps_upper: traps,
    traps_middle: traps,
    traps_lower: traps,
    infraspinatus: upperBack,
    teres: upperBack,
    lats: t(6, 10, 18, 24),
    lower_back: t(2, 4, 8, 12),
    glutes: small,
    glute_medius: small,
    tfl: small,
    adductors: small,
    rectus_femoris: quads,
    vastus_lateralis: quads,
    vastus_medialis: quads,
    sartorius: small,
    hamstrings_lateral: hams,
    hamstrings_medial: hams,
    gastrocnemius: calves,
    soleus: calves,
    tibialis: t(2, 4, 8, 12)
  };
})();
function levelFor(value, t) {
  if (!(value > 0)) return 0;
  if (value >= t.veryHigh) return 5;
  if (value >= t.high) return 4;
  if (value >= t.build) return 3;
  if (value >= t.moderate) return 2;
  return 1;
}
function targetFor(m, mode, targets) {
  if (mode === "relative") return RELATIVE_TARGET;
  if (mode === "individual") return targets[m];
  return STANDARD_TARGET;
}
function relativeValues(values) {
  const max = Math.max(0, ...MUSCLE_IDS.map((m) => values[m]));
  const out = emptyMuscleValues();
  if (max > 0) for (const m of MUSCLE_IDS) out[m] = values[m] / max;
  return out;
}
function muscleLevels(values, mode, targets = DEFAULT_TARGETS) {
  const v = mode === "relative" ? relativeValues(values) : values;
  return Object.fromEntries(
    MUSCLE_IDS.map((m) => [m, levelFor(v[m], targetFor(m, mode, targets))])
  );
}
function legendLabels(mode) {
  if (mode === "individual") return [...LEVEL_NAMES];
  if (mode === "relative") {
    return ["unter 20 %", "20\u201340 %", "40\u201360 %", "60\u201380 %", "ab 80 %"].map(
      (r2, i) => `${r2} \xB7 ${LEVEL_NAMES[i]}`
    );
  }
  const t = STANDARD_TARGET;
  const ranges = [
    `1\u2013${t.moderate - 1}`,
    `${t.moderate}\u2013${t.build - 1}`,
    `${t.build}\u2013${t.high - 1}`,
    `${t.high}\u2013${t.veryHigh - 1}`,
    `ab ${t.veryHigh}`
  ];
  return ranges.map((r2, i) => `${r2} \xB7 ${LEVEL_NAMES[i]}`);
}
function validateTarget(t) {
  const v = [t.moderate, t.build, t.high, t.veryHigh];
  if (v.some((x) => !Number.isFinite(x) || x < 0)) return "Nur Zahlen ab 0";
  for (let i = 1; i < v.length; i++) {
    if (v[i] <= v[i - 1]) return "Die Werte m\xFCssen aufsteigen";
  }
  return null;
}
var MUSCLE_MAP_SETTINGS_KEY = "ui.muscle_map";
var DEFAULT_MUSCLE_MAP_SETTINGS = {
  mode: "standard",
  targets: DEFAULT_TARGETS
};
function parseMuscleMapSettings(json) {
  if (!json) return DEFAULT_MUSCLE_MAP_SETTINGS;
  try {
    const v = JSON.parse(json);
    const mode = v.mode === "individual" || v.mode === "relative" || v.mode === "standard" ? v.mode : "standard";
    const targets = { ...DEFAULT_TARGETS };
    const legacy = /* @__PURE__ */ new Map();
    for (const [old, parts] of Object.entries(LEGACY_MUSCLES)) {
      const t = v.targets?.[old];
      if (t) for (const p of parts) legacy.set(p, t);
    }
    for (const m of MUSCLE_IDS) {
      const t = v.targets?.[m] ?? legacy.get(m);
      if (!t) continue;
      const candidate = {
        moderate: Number(t.moderate),
        build: Number(t.build),
        high: Number(t.high),
        veryHigh: Number(t.veryHigh)
      };
      if (validateTarget(candidate) === null) targets[m] = candidate;
    }
    return { mode, targets };
  } catch {
    return DEFAULT_MUSCLE_MAP_SETTINGS;
  }
}

// src/domain/models.ts
var WEIGHT_METRIC_ID = "00000000-0000-7000-8000-000000000001";
var BODY_FAT_METRIC_ID = "00000000-0000-7000-8000-000000000002";
var RESTING_HR_METRIC_ID = "00000000-0000-7000-8000-000000000018";
var HRV_METRIC_ID = "00000000-0000-7000-8000-000000000019";
var BREATHING_RATE_METRIC_ID = "00000000-0000-7000-8000-000000000020";
var BEAT_INTERVAL_METRIC_ID = "00000000-0000-7000-8000-000000000021";
var ANS_STATUS_METRIC_ID = "00000000-0000-7000-8000-000000000022";

// src/domain/bodyLayout.ts
var builtinMetricId = (n) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
var ANS_METRIC_IDS = [
  RESTING_HR_METRIC_ID,
  HRV_METRIC_ID,
  BREATHING_RATE_METRIC_ID,
  BEAT_INTERVAL_METRIC_ID,
  ANS_STATUS_METRIC_ID
];
var ANS_TITLE = "ANS - Autonomes Nervensystem Status";
var METRIC_HINTS = {
  [builtinMetricId(14)]: "Oberer Blutdruckwert: Druck in den Arterien, w\xE4hrend sich das Herz zusammenzieht und Blut in den K\xF6rper pumpt.",
  [builtinMetricId(15)]: "Unterer Blutdruckwert: Druck in den Arterien, w\xE4hrend sich das Herz entspannt und wieder mit Blut f\xFCllt.",
  [builtinMetricId(16)]: "Maximale Sauerstoffaufnahme: wie viele Milliliter Sauerstoff der K\xF6rper je Kilogramm K\xF6rpergewicht und Minute bei voller Belastung h\xF6chstens aufnehmen und verwerten kann \u2013 ein Ma\xDF f\xFCr die Ausdauerleistungsf\xE4higkeit."
};
var METRIC_SUBSECTIONS = {
  composition: [
    { label: "Kennzahlen", ids: [builtinMetricId(23), builtinMetricId(37)] },
    {
      label: "Fett",
      ids: [
        BODY_FAT_METRIC_ID,
        builtinMetricId(25),
        builtinMetricId(26),
        builtinMetricId(27),
        builtinMetricId(28),
        builtinMetricId(38),
        builtinMetricId(40),
        builtinMetricId(41)
      ]
    },
    {
      label: "Muskulatur & Magermasse",
      ids: [
        builtinMetricId(3),
        builtinMetricId(24),
        builtinMetricId(39),
        builtinMetricId(29),
        builtinMetricId(30),
        builtinMetricId(36)
      ]
    },
    {
      label: "K\xF6rperwasser",
      ids: [builtinMetricId(32), builtinMetricId(33), builtinMetricId(34)]
    },
    { label: "Knochen & Mineralien", ids: [builtinMetricId(31), builtinMetricId(35)] }
  ],
  vital: [
    { label: ANS_TITLE, ids: ANS_METRIC_IDS },
    { label: "Blutdruck", ids: [builtinMetricId(14), builtinMetricId(15)] }
  ]
};
var ANS_MIN = -10;
var ANS_MAX = 10;
function ansPercent(value) {
  const clamped = Math.min(ANS_MAX, Math.max(ANS_MIN, value));
  return (clamped - ANS_MIN) / (ANS_MAX - ANS_MIN) * 100;
}
function previousMean(values, date) {
  const before = values.filter((v) => v.date < date);
  if (before.length === 0) return null;
  const mean2 = before.reduce((s, v) => s + v.value, 0) / before.length;
  return { mean: Math.round(mean2 * 10) / 10, count: before.length };
}

// src/domain/helpTexts.ts
var ANS_INFO = `Messmethoden : RMSSD (Root Mean Square of Successive Differences):
* Berechnung: Die quadratische Wurzel aus dem Mittelwert der quadrierten Differenzen aufeinanderfolgender Herzschlagintervalle.
* Bedeutung: Gilt als der wichtigste Indikator f\xFCr die Aktivit\xE4t des Parasympathikus (Ruhe- und Erholungsnerv bzw. Vagusnerv).
SDNN (Standard Deviation of Normal-to-Normal Intervals):
* Berechnung: Die Standardabweichung aller normalen Herzschlagintervalle \xFCber den gesamten Messzeitraum.
* Bedeutung: Spiegelt die gesamt-autonome Variabilit\xE4t wider und reagiert sowohl auf sympathische als auch auf parasympathische Einfl\xFCsse \xFCber l\xE4ngere Zeitfenster (z. B. 5 Minuten oder 24 Stunden).`;
var AG_RATIO_INFO = `Das Android/Gynoid-Verh\xE4ltnis (A/G-Ratio) bei Waagen.
* Android-Fett (Apfeltyp): Fett, das sich bevorzugt im Bauchraum (viszeral) ansammelt.
* Gynoid-Fett (Birnentyp): Fett, das sich an den H\xFCften und Oberschenkeln ansammelt.
* Bedeutung: Ein hohes Android/Gynoid-Verh\xE4ltnis bedeutet, dass mehr Fett im Bauchbereich gespeichert wird, was medizinisch oft mit einem h\xF6heren Risiko f\xFCr Stoffwechselprobleme einhergeht. Ein niedrigeres Verh\xE4ltnis weist auf eine gleichm\xE4\xDFigere oder unterk\xF6rperbetonte Verteilung hin.`;
var AG_RATIO_METRIC_ID = "00000000-0000-7000-8000-000000000038";
var METRIC_INFO = {
  [AG_RATIO_METRIC_ID]: AG_RATIO_INFO
};

// src/domain/methods.ts
function methodChoices(list, current) {
  const c = current?.trim() ?? "";
  if (c === "" || list.some((m) => m.toLowerCase() === c.toLowerCase())) return [...list];
  return [...list, c];
}
function dominantMethod(values) {
  const counts = /* @__PURE__ */ new Map();
  for (const v of values) {
    const t = v?.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best = null;
  let max = 0;
  for (const [k, n] of counts) {
    if (n > max) {
      best = k;
      max = n;
    }
  }
  return best;
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
  ANS_INFO,
  ANS_MAX,
  ANS_MIN,
  ANS_TITLE,
  DEFAULT_LAYOUT,
  DISPLAY_DECIMALS,
  FASTED_LABEL,
  GLASS_SIZES_ML,
  GROUP_LABELS,
  INDEPENDENT_LABEL,
  KCAL_PER_GRAM,
  LEVEL_NAMES,
  MACRO_KEYS,
  MUSCLE_LABELS,
  MUSCLE_MAP_SETTINGS_KEY,
  OPTIONAL_KEYS,
  OPTIONAL_LABELS,
  OVERVIEW_LAYOUT_KEY,
  SCALE_MODE_LABELS,
  ZERO,
  addDaysIso,
  addNutrientValues,
  addNutrients,
  amountFromPortions,
  ansPercent,
  arrange,
  buildFocusIndex,
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
  describeScheduled,
  describeSupplements,
  describeTiming,
  dominantMethod,
  drinkText,
  drinksMl,
  energy_exports as energy,
  energyGoalView,
  exportReminderState,
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
  legendLabels,
  macroBaseKcal,
  macroEnergyShares,
  macroGoalRows,
  macrosOf,
  mealDisplayName,
  mealHasContent,
  mealTypeLabel,
  methodChoices,
  microValues,
  muscleLevels,
  muscleMapForRange,
  neat_exports as neat,
  nutrientPercents,
  nutrientsFor,
  optionalOf,
  parseIsoDate,
  parseLayout,
  parseMuscleMapSettings,
  perServing,
  percentText,
  portionsFromAmount,
  previousMean,
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
  targetFor,
  trainingCalc_exports as trainingCalc,
  trends_exports as trends,
  waterGlasses,
  waterPercent,
  waterSummary,
  weeklyMuscleSets,
  withDayMacros,
  withProteinFromWeight
};
