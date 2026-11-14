// LIFESPAN OS Mobil – Tagesziele am Handy (1.28.0). Reine Logik ohne Oberfläche.
//
// Wie Settings → Tagesziele am PC (GoalsPanel.tsx, `goals::save`): Zielstände mit „Gültig ab“,
// Kalorienziel fest oder dynamisch aus dem Gesamtverbrauch (Defizit/Überschuss in kcal oder %),
// Protein in g, g je kg oder %, Kohlenhydrate und Fett in g oder %, Schlaf, Zielgewicht, Schritte,
// Trinkziel, Kalibrierung. Prüfregeln wie im Rust-Kern und in den CHECK-Regeln der Tabelle
// `daily_goal`. Ablage am Handy (`S.goals`, Speicher „goals“): `rows` id → { row, sent },
// `deleted` id → { at, sent }. Gesendet wird mit den Körperwerten.

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

export function emptyGoals() {
  return { rows: {}, deleted: {} };
}

export function normGoals(local) {
  const l = local && typeof local === "object" ? local : {};
  return { rows: l.rows ?? {}, deleted: l.deleted ?? {} };
}

/** Teil für `makeDb`: Zeilen vom Handy und gelöschte IDs. */
export function phoneGoals(local) {
  const l = normGoals(local);
  return { rows: Object.values(l.rows).map((e) => e.row), deleted: Object.keys(l.deleted) };
}

const numText = (v, d = 2) => (v === null || v === undefined ? "" : String(Math.round(v * 10 ** d) / 10 ** d).replace(".", ","));

/** Formular für einen neuen Zielstand: übernimmt den zuletzt gültigen (wie am PC). */
export function toDraft(g, today) {
  if (!g) {
    return {
      id: null,
      validFrom: today,
      energyKcal: "",
      proteinG: "",
      carbsG: "",
      fatG: "",
      sleepHours: "",
      weightKg: "",
      steps: "",
      waterL: "",
      energyMode: "fixed",
      direction: "maintain",
      adjustAmount: "",
      adjustUnit: "kcal",
      calibrate: true,
      proteinUnit: "g",
      carbsUnit: "g",
      fatUnit: "g",
    };
  }
  const adjust = g.energyAdjustKcal ?? g.energyAdjustPercent ?? 0;
  const pctDefault = g.energyMode === "dynamic" && g.energyAdjustPercent !== null;
  const s = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    id: g.validFrom === today ? g.id : null,
    validFrom: today,
    energyKcal: s(g.energyKcal),
    proteinG: g.proteinPct != null ? numText(g.proteinPct, 1) : g.proteinGPerKg !== null ? numText(g.proteinGPerKg, 1) : s(g.proteinG),
    carbsG: g.carbsPct != null ? numText(g.carbsPct, 1) : s(g.carbsG),
    fatG: g.fatPct != null ? numText(g.fatPct, 1) : s(g.fatG),
    sleepHours: g.sleepMin === null ? "" : numText(g.sleepMin / 60, 2),
    weightKg: numText(g.weightKg, 1),
    steps: s(g.steps),
    waterL: numText(g.waterL ?? null, 2),
    energyMode: g.energyMode,
    direction: adjust < 0 ? "deficit" : adjust > 0 ? "surplus" : "maintain",
    adjustAmount: adjust === 0 ? "" : String(Math.abs(adjust)),
    adjustUnit: g.energyAdjustPercent !== null ? "percent" : "kcal",
    calibrate: g.calibrate,
    proteinUnit: g.proteinPct != null || (pctDefault && g.proteinG === null && g.proteinGPerKg === null) ? "pct" : g.proteinGPerKg !== null ? "perKg" : "g",
    carbsUnit: g.carbsPct != null || (pctDefault && g.carbsG === null) ? "pct" : "g",
    fatUnit: g.fatPct != null || (pctDefault && g.fatG === null) ? "pct" : "g",
  };
}

/** Formular für einen bestehenden Zielstand (Bearbeiten, gleiches Datum). */
export function editDraft(g) {
  return { ...toDraft(g, g.validFrom), id: g.id, validFrom: g.validFrom };
}

/** Prozentangabe in Gramm wie `goals::grams_from_percent`. */
export const gramsFromPercent = (kcal, pct, perG) => Math.round((kcal * pct) / 100 / perG);

class FieldError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

function parseNum(field, text, { integer = false } = {}) {
  const t = String(text ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  if (integer) {
    if (!/^-?\d+$/.test(t)) throw new FieldError(field, "Bitte eine ganze Zahl ohne Komma eingeben.");
    return Number(t);
  }
  const v = Number(t.replace(",", "."));
  if (!Number.isFinite(v) || !/^-?\d+([.,]\d+)?$/.test(t)) throw new FieldError(field, "Bitte eine Zahl eingeben.");
  return v;
}

const optInt = (field, label, v, lo, hi) => {
  if (v === null) return null;
  if (v < lo || v > hi) throw new FieldError(field, `${label} muss zwischen ${lo.toLocaleString("de-DE")} und ${hi.toLocaleString("de-DE")} liegen.`);
  return v;
};
const optReal = (field, label, v, lo, hi, d) => {
  if (v === null) return null;
  const r = Math.round(v * 10 ** d) / 10 ** d;
  if (r < lo || r > hi) throw new FieldError(field, `${label} muss zwischen ${String(lo).replace(".", ",")} und ${String(hi).replace(".", ",")} liegen.`);
  return r;
};

/**
 * Formular prüfen und als Zeile `daily_goal` speichern. `goals` = alle Zielstände (zusammengeführt,
 * Zeilen der Tabelle). Fehler: Error mit `field` (Name des Formularfelds).
 */
export function saveGoal(local, goals, d, { uuid, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.validFrom ?? "")) throw new FieldError("validFrom", "Bitte ein Datum angeben.");
  const dynamic = d.energyMode === "dynamic";
  const sleepHours = parseNum("sleepHours", d.sleepHours);
  let signed = null;
  if (dynamic && d.direction !== "maintain") {
    if (String(d.adjustAmount ?? "").trim() === "") throw new FieldError("adjustAmount", "Bitte die Höhe des Defizits bzw. Überschusses angeben.");
    const amount = parseNum("adjustAmount", d.adjustAmount, { integer: true });
    if (amount < 0) throw new FieldError("adjustAmount", "Bitte ohne Vorzeichen eingeben – die Richtung wählst du unter „Ziel“.");
    signed = d.direction === "deficit" ? -amount : amount;
  }
  const pctMode = (m) => d[`${m}Unit`] === "pct";
  const energy = optInt("energyKcal", "Das Kalorienziel", dynamic ? null : parseNum("energyKcal", d.energyKcal, { integer: true }), 500, 10000);
  let protein = optInt("proteinG", "Das Proteinziel", d.proteinUnit === "g" ? parseNum("proteinG", d.proteinG, { integer: true }) : null, 0, 1000);
  let carbs = optInt("carbsG", "Das Kohlenhydratziel", d.carbsUnit === "g" ? parseNum("carbsG", d.carbsG, { integer: true }) : null, 0, 2000);
  let fat = optInt("fatG", "Das Fettziel", d.fatUnit === "g" ? parseNum("fatG", d.fatG, { integer: true }) : null, 0, 1000);
  const proteinPct = optReal("proteinG", "Der Proteinanteil", pctMode("protein") ? parseNum("proteinG", d.proteinG) : null, 1, 100, 1);
  const carbsPct = optReal("carbsG", "Der Kohlenhydratanteil", pctMode("carbs") ? parseNum("carbsG", d.carbsG) : null, 1, 100, 1);
  const fatPct = optReal("fatG", "Der Fettanteil", pctMode("fat") ? parseNum("fatG", d.fatG) : null, 1, 100, 1);
  const sleep = optInt("sleepHours", "Das Schlafziel", sleepHours === null ? null : Math.round(sleepHours * 60), 60, 1080);
  const water = optReal("waterL", "Das Trinkziel", parseNum("waterL", d.waterL), 0.1, 10, 2);
  const weight = optReal("weightKg", "Das Zielgewicht", parseNum("weightKg", d.weightKg), 20, 400, 1);
  const steps = optInt("steps", "Das Schrittziel", parseNum("steps", d.steps, { integer: true }), 100, 100000);
  const perKg = optReal("proteinG", "Das Proteinziel je kg", d.proteinUnit === "perKg" ? parseNum("proteinG", d.proteinG) : null, 0.5, 4, 1);
  let adjustKcal = null;
  let adjustPct = null;
  if (dynamic) {
    if (d.adjustUnit === "percent") adjustPct = optInt("adjustAmount", "Die Anpassung", signed, -50, 50);
    else adjustKcal = optInt("adjustAmount", "Die Anpassung", signed, -2000, 2000);
  }
  for (const [field, v] of [
    ["proteinG", proteinPct],
    ["carbsG", carbsPct],
    ["fatG", fatPct],
  ]) {
    if (v !== null && !dynamic && energy === null) throw new FieldError(field, "Prozentangaben brauchen einen festen Wert im Feld Energie.");
  }
  const sum = (proteinPct ?? 0) + (carbsPct ?? 0) + (fatPct ?? 0);
  if (sum > 100 + 1e-9) {
    throw new FieldError(fatPct !== null ? "fatG" : carbsPct !== null ? "carbsG" : "proteinG", `Protein, Kohlenhydrate und Fett ergeben zusammen ${Math.round(sum * 10) / 10} % – höchstens 100 %.`);
  }
  if (dynamic) {
    if (proteinPct !== null) protein = null;
    if (carbsPct !== null) carbs = null;
    if (fatPct !== null) fat = null;
  } else if (energy !== null) {
    if (proteinPct !== null) protein = gramsFromPercent(energy, proteinPct, KCAL_PER_G.protein);
    if (carbsPct !== null) carbs = gramsFromPercent(energy, carbsPct, KCAL_PER_G.carbs);
    if (fatPct !== null) fat = gramsFromPercent(energy, fatPct, KCAL_PER_G.fat);
  }
  if ([energy, protein, carbs, fat, sleep, steps, weight, water, perKg].every((v) => v === null) && !dynamic) {
    throw new FieldError("energyKcal", "Bitte mindestens ein Ziel angeben.");
  }
  const taken = goals.find((g) => g.valid_from === d.validFrom && g.id !== d.id);
  if (taken) throw new FieldError("validFrom", "Für diesen Tag gibt es bereits Ziele. Bitte diese bearbeiten.");

  const iso = now.toISOString();
  const old = d.id ? goals.find((g) => g.id === d.id) : null;
  const row = {
    id: d.id ?? uuid(),
    valid_from: d.validFrom,
    energy_kcal: energy,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    sleep_min: sleep,
    weight_kg: weight,
    notes: old?.notes ?? null,
    created_at: old?.created_at ?? iso,
    updated_at: iso,
    steps,
    energy_mode: dynamic ? "dynamic" : "fixed",
    energy_adjust_kcal: adjustKcal,
    energy_adjust_percent: adjustPct,
    calibrate: d.calibrate === false ? 0 : 1,
    protein_g_per_kg: perKg,
    protein_pct: proteinPct,
    carbs_pct: carbsPct,
    fat_pct: fatPct,
    water_l: water,
  };
  local.rows[row.id] = { row, sent: false };
  delete local.deleted[row.id];
  return row;
}

/** Zielstand löschen (vom PC: Löschvermerk für den Abgleich). */
export function deleteGoal(local, id, pcIds, now = new Date()) {
  const own = local.rows[id];
  delete local.rows[id];
  if (pcIds.has(id) || own?.sent) local.deleted[id] = { at: now.toISOString(), sent: false };
  return local;
}

export const unsentGoals = (local) => {
  const l = normGoals(local);
  return Object.values(l.rows).filter((e) => !e.sent).length + Object.values(l.deleted).filter((d) => !d.sent).length;
};

export function goalTables(local, { all = false } = {}) {
  const l = normGoals(local);
  const out = {};
  const rows = Object.values(l.rows).filter((e) => all || !e.sent).map((e) => e.row);
  if (rows.length) out.daily_goal = rows;
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([id, d]) => ({ id: `daily_goal:${id}`, table_name: "daily_goal", record_id: id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

export function markGoalsSent(local) {
  if (!local) return;
  for (const e of Object.values(local.rows ?? {})) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
}

export function pruneGoals(catalog, local) {
  const l = normGoals(local);
  const pc = new Map((catalog?.pc?.daily_goal ?? []).map((r) => [r.id, r]));
  for (const [id, e] of Object.entries(l.rows)) if (e.sent && pc.has(id) && String(pc.get(id).updated_at) >= e.row.updated_at) delete l.rows[id];
  for (const [id, d] of Object.entries(l.deleted)) if (d.sent && !pc.has(id)) delete l.deleted[id];
  return l;
}
