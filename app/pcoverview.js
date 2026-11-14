// LIFESPAN OS Mobil – Daten der Overview wie am PC (1.6.0). Rechnet wie der Rust-Kern der
// Desktop-App: overview.rs (`for_date`), insights.rs (`data`), dashboard.rs (`data`),
// cardio_report.rs (Dauer der Cardio-Einheiten), workout.rs (`set_log`, Übersicht der Einheiten).
// Ergebnis in der Form der Desktop-App (src/domain/models.ts), damit die Rechenregeln aus
// pcdomain.js (= src/domain) unverändert darauf laufen. Reine Logik, mit Tests.

import * as P from "./pcdb.js";

export const RESTING_HR_METRIC_ID = "00000000-0000-7000-8000-000000000018";
export const HRV_METRIC_ID = "00000000-0000-7000-8000-000000000019";
export const WAIST_METRIC_ID = "00000000-0000-7000-8000-000000000004";
const VO2MAX_METRIC_ID = "00000000-0000-7000-8000-000000000016";
const GRIP_METRIC_ID = "00000000-0000-7000-8000-000000000017";
/** Zeitraum der Dashboard-Werte (Wasser, Supplements) und der Streaks in Tagen */
export const STREAK_DAYS = 90;
const EXTRAS_DAYS = 7;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const n = (v) => (v === undefined ? null : v);

/** Minuten zwischen zwei Uhrzeiten (HH:MM) über Mitternacht wie `sleep::minutes_between`. */
export function minutesBetween(start, end) {
  const m = (t) => {
    const x = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? ""));
    return x && +x[1] < 24 && +x[2] < 60 ? +x[1] * 60 + +x[2] : null;
  };
  const s = m(start);
  const e = m(end);
  if (s === null || e === null) return null;
  const d = e - s;
  return d < 0 ? d + 1440 : d;
}

// ------------------------------------------------------------------ Zeilen in der Form der Desktop-App

export function sleepLog(r) {
  const inBed = minutesBetween(r.bed_time, r.wake_time) ?? 0;
  return {
    id: r.id,
    date: r.date,
    bedTime: r.bed_time,
    wakeTime: r.wake_time,
    sleepLatencyMin: n(r.sleep_latency_min),
    awakeMin: n(r.awake_min),
    awakenings: n(r.awakenings),
    quality: n(r.quality),
    notes: n(r.notes),
    efficiencyPct: n(r.efficiency_pct),
    lightMin: n(r.light_min),
    deepMin: n(r.deep_min),
    remMin: n(r.rem_min),
    method: n(r.method),
    timeInBedMin: inBed,
    sleepMin: Math.max(0, inBed - (r.sleep_latency_min ?? 0) - (r.awake_min ?? 0)),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function sleepNap(r) {
  return {
    id: r.id,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    notes: n(r.notes),
    durationMin: minutesBetween(r.start_time, r.end_time) ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function recoveryLog(r) {
  return {
    id: r.id,
    date: r.date,
    readiness: n(r.readiness),
    fatigue: n(r.fatigue),
    soreness: n(r.soreness),
    stress: n(r.stress),
    notes: n(r.notes),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const NEAT_MINUTES = ["standing_min", "cleaning_min", "gardening_min", "fidgeting_min", "office_min", "physical_min", "other_min"];
export function neatDay(r) {
  return {
    id: r.id,
    date: r.date,
    steps: n(r.steps),
    standingMin: n(r.standing_min),
    cleaningMin: n(r.cleaning_min),
    gardeningMin: n(r.gardening_min),
    fidgetingMin: n(r.fidgeting_min),
    officeMin: n(r.office_min),
    physicalMin: n(r.physical_min),
    otherMin: n(r.other_min),
    otherLabel: n(r.other_label),
    notes: n(r.notes),
    totalMin: NEAT_MINUTES.reduce((a, k) => a + (r[k] ?? 0), 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function metricsOf(db) {
  return new Map((db.pc.body_metric ?? []).map((m) => [m.id, m]));
}

export function measurement(r, metrics) {
  const m = metrics.get(r.metric_id);
  return {
    id: r.id,
    metricId: r.metric_id,
    metricName: m?.name ?? "",
    unit: m?.unit ?? "",
    decimals: m?.decimals ?? 1,
    date: r.date,
    value: r.value,
    notes: n(r.notes),
    method: n(r.method),
    time: n(r.time),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Messwerte wie `body::list_measurements` (älteste zuerst). */
export function measurementsBetween(db, metricId, from, to) {
  const metrics = metricsOf(db);
  const pos = (id) => metrics.get(id)?.position ?? 0;
  return db.body
    .filter((r) => (!metricId || r.metric_id === metricId) && (!from || r.date >= from) && (!to || r.date <= to) && metrics.has(r.metric_id))
    .sort((a, b) => cmp(a.date, b.date) || pos(b.metric_id) - pos(a.metric_id))
    .map((r) => measurement(r, metrics));
}

/** Satz in der Form der Desktop-App (`WorkoutSet`). */
export function workoutSet(s) {
  return {
    id: s.id,
    position: s.position ?? 0,
    reps: n(s.reps),
    weightKg: n(s.weight_kg),
    durationSeconds: n(s.duration_seconds),
    distanceM: n(s.distance_m),
    rpe: n(s.rpe),
    isWarmup: Boolean(s.is_warmup),
    isFailure: Boolean(s.is_failure),
    isUnilateral: Boolean(s.is_unilateral),
    notes: n(s.notes),
  };
}

/** Einheit mit Übungen und Sätzen wie `workout::get`. */
export function workoutFull(db, w) {
  const o = P.workoutOf(db, w);
  return { ...o, planDayId: w.plan_day_id ?? null, exercises: o.exercises.map((e) => ({ ...e, sets: e.sets.map(workoutSet) })) };
}

const failReps = (s) => Math.max((s.reps ?? 0) - 0.5 * (s.is_failure ? 1 : 0), 0);

/** Übersicht einer Einheit wie `workout::list` (`WorkoutSummary`). */
export function workoutSummary(db, w) {
  const wex = db.wexByWorkout.get(w.id) ?? [];
  let sets = 0;
  let volume = 0;
  for (const we of wex) {
    for (const s of db.setsByWex.get(we.id) ?? []) {
      if (s.is_warmup) continue;
      sets += 1;
      if (s.reps !== null && s.reps !== undefined && s.weight_kg !== null && s.weight_kg !== undefined) volume += failReps(s) * s.weight_kg;
    }
  }
  return {
    id: w.id,
    date: w.date,
    startTime: w.start_time ?? null,
    title: w.title,
    durationMin: w.duration_min ?? null,
    perceivedExertion: w.perceived_exertion ?? null,
    status: w.status ?? "done",
    exerciseCount: wex.length,
    setCount: sets,
    volumeKg: volume,
  };
}

// ------------------------------------------------------------------ Overview (overview.rs)

const listSleep = (db, from, to) => db.sleep.filter((s) => s.date >= from && s.date <= to).sort((a, b) => cmp(a.date, b.date)).map(sleepLog);
const listRecovery = (db, from, to) => db.recovery.filter((s) => s.date >= from && s.date <= to).sort((a, b) => cmp(a.date, b.date)).map(recoveryLog);
const listNeat = (db, from, to) => [...db.neatByDate.values()].filter((d) => d.date >= from && d.date <= to).sort((a, b) => cmp(a.date, b.date)).map(neatDay);

/** Übersicht eines Tages wie `overview::for_date`. */
export function overviewFor(db, date) {
  const weekStart = P.addDays(date, -6);
  const monthStart = P.addDays(date, -29);
  const t = (name) => db.pc[name] ?? [];
  const hasAnyData =
    db.workouts.length > 0 ||
    [...db.itemsByMeal.values()].some((l) => l.length) ||
    t("meal_value").length > 0 ||
    db.water.length > 0 ||
    t("nutrition_day_entry").length > 0 ||
    t("supplement_intake").length > 0 ||
    db.sleep.length > 0 ||
    db.recovery.length > 0 ||
    db.body.length > 0 ||
    t("lifestyle_note").length > 0 ||
    db.neatByDate.size > 0;

  // Einheiten des Tages (älteste zuerst) und die letzte abgeschlossene (aus den letzten zwei)
  const today = P.workoutsBetween(db, date, date);
  const workoutsToday = today
    .slice()
    .reverse()
    .map((w) => workoutFull(db, w));
  const lastWorkout =
    P.workoutsBetween(db, null, date)
      .slice(0, 2)
      .map((w) => workoutSummary(db, w))
      .find((w) => w.status === "done") ?? null;

  const nutritionLast7Days = P.dailyTotals(db, weekStart, date);
  const sleepLast7Days = listSleep(db, weekStart, date);
  const recoveryLast7Days = listRecovery(db, weekStart, date);
  const vitals = [...measurementsBetween(db, RESTING_HR_METRIC_ID, weekStart, date), ...measurementsBetween(db, HRV_METRIC_ID, weekStart, date)].sort(
    (a, b) => cmp(a.date, b.date) || cmp(a.metricId, b.metricId),
  );
  const neatLast7Days = listNeat(db, weekStart, date);
  return {
    date,
    hasAnyData,
    workoutsToday,
    lastWorkout,
    nutritionToday: nutritionLast7Days.find((d) => d.date === date) ?? null,
    nutritionLast7Days,
    goal: P.goalFor(db, date),
    sleepToday: sleepLast7Days.find((s) => s.date === date) ?? null,
    sleepLast7Days,
    napsLast7Days: db.naps
      .filter((x) => x.date >= weekStart && x.date <= date)
      .sort((a, b) => cmp(a.date, b.date) || cmp(a.start_time, b.start_time))
      .map(sleepNap),
    recoveryToday: recoveryLast7Days.find((r) => r.date === date) ?? null,
    recoveryLast7Days,
    weightLast30Days: measurementsBetween(db, P.WEIGHT_METRIC_ID, monthStart, date),
    vitalsLast7Days: vitals,
    neatToday: neatLast7Days.find((d) => d.date === date) ?? null,
    neatLast7Days,
    stepEnergyToday: P.stepEnergy(db, date),
    energyToday: P.energyFor(db, date),
  };
}

// ------------------------------------------------------------------ Auswertungen (insights.rs)

/** Daten eines Zeitraums wie `insights::data`. */
export function insightsFor(db, from, to) {
  return {
    from,
    to,
    sleep: listSleep(db, from, to),
    recovery: listRecovery(db, from, to),
    workouts: P.workoutsBetween(db, from, to)
      .filter((w) => (w.status ?? "done") === "done")
      .reverse()
      .map((w) => workoutSummary(db, w)),
    nutrition: P.dailyTotals(db, from, to),
    measurements: measurementsBetween(db, null, from, to),
    lifestyle: (db.pc.lifestyle_note ?? [])
      .filter((l) => l.date >= from && l.date <= to)
      .sort((a, b) => cmp(a.date, b.date))
      .map((l) => ({ id: l.id, date: l.date, category: l.category, text: l.text, createdAt: l.created_at, updatedAt: l.updated_at })),
    goal: P.goalFor(db, to),
    neat: listNeat(db, from, to),
    energy: P.dailyPoints(db, from, to),
  };
}

/**
 * Teil von `report_data` für den Arztbericht (Health): Einheiten, Schlaf, Messwerte und Messgrößen
 * im Zeitraum – ohne Ernährung und Energie, die der Bericht nicht braucht.
 */
export function doctorReportData(db, from, to) {
  return {
    from,
    to,
    sleep: listSleep(db, from, to),
    workouts: P.workoutsBetween(db, from, to)
      .reverse()
      .map((w) => workoutSummary(db, w)),
    measurements: measurementsBetween(db, null, from, to),
    metrics: (db.pc.body_metric ?? []).map((m) => ({ id: m.id, name: m.name, unit: m.unit ?? "", category: m.category, decimals: m.decimals ?? 1, position: m.position ?? 0, archived: !!m.archived })),
  };
}

// ------------------------------------------------------------------ Dashboard (dashboard.rs)

const ISO_WEEKDAY = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

function lastMetric(db, metricId, to) {
  return P.latestMeasurement(db, metricId, to)?.date ?? null;
}

const later = (a, b) => (a && b ? (a >= b ? a : b) : (a ?? b));

/** Nächster Termin eines Trainingstags wie `next_slot`. */
function nextSlot(db, plans, to) {
  const days = new Map();
  for (const p of plans) for (const d of p.days) days.set(d.row.id, { plan: p.row, day: d.row });
  const doneOn = (dayId, date) => db.workouts.some((w) => w.plan_day_id === dayId && w.date === date && (w.status ?? "done") === "done");
  let best = null;
  for (const s of db.pc.training_plan_slot ?? []) {
    const pd = days.get(s.plan_day_id);
    if (!pd) continue;
    let when;
    if (s.weekday !== null && s.weekday !== undefined) {
      const diff = (((s.weekday - ISO_WEEKDAY(to)) % 7) + 7) % 7;
      when = P.addDays(to, diff);
      if (doneOn(pd.day.id, when)) when = P.addDays(when, 7);
    } else if (s.date) {
      if (s.date < to || doneOn(pd.day.id, s.date)) continue;
      when = s.date;
    } else continue;
    const key = `${when} ${s.time ?? "99:99"}`;
    if (best && best.key <= key) continue;
    best = { key, plan: pd.plan, day: pd.day, date: when, time: s.time ?? null };
  }
  return best;
}

/** Nächster Trainingstag aus einem Plan wie `next_plan_day`. */
export function nextPlanDay(db, plans, to) {
  const planOfDay = new Map();
  for (const p of plans) for (const d of p.days) planOfDay.set(d.row.id, { plan: p, day: d.row });
  const last =
    db.workouts
      .filter((w) => (w.status ?? "done") === "done" && w.date <= to && planOfDay.has(w.plan_day_id))
      .sort((a, b) => cmp(b.date, a.date) || cmp(b.start_time ?? "", a.start_time ?? "") || cmp(b.created_at, a.created_at))[0] ?? null;
  let planId;
  let planName;
  let dayId;
  let dayName;
  let scheduledDate = null;
  let scheduledTime = null;
  const slot = nextSlot(db, plans, to);
  if (slot) {
    [planId, planName, dayId, dayName, scheduledDate, scheduledTime] = [slot.plan.id, slot.plan.name, slot.day.id, slot.day.name, slot.date, slot.time];
  } else {
    if (!last) return null;
    const { plan, day } = planOfDay.get(last.plan_day_id);
    const sorted = plan.days.map((d) => d.row).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const next = sorted.find((d) => (d.position ?? 0) > (day.position ?? 0)) ?? sorted[0];
    if (!next) return null;
    [planId, planName, dayId, dayName] = [plan.row.id, plan.row.name, next.id, next.name];
  }
  const plan = plans.find((p) => p.row.id === planId);
  const lastPlan = last ? planOfDay.get(last.plan_day_id) : null;
  const sameLast = last && lastPlan.plan.row.id === planId;
  const lastOfDay =
    db.workouts
      .filter((w) => w.plan_day_id === dayId && (w.status ?? "done") === "done" && w.date <= to)
      .sort((a, b) => cmp(b.date, a.date) || cmp(b.start_time ?? "", a.start_time ?? "") || cmp(b.created_at, a.created_at))[0] ?? null;
  let lastVolume = null;
  if (lastOfDay) {
    for (const we of db.wexByWorkout.get(lastOfDay.id) ?? []) {
      for (const s of db.setsByWex.get(we.id) ?? []) {
        if (s.is_warmup || s.reps === null || s.reps === undefined || s.weight_kg === null || s.weight_kg === undefined) continue;
        lastVolume = (lastVolume ?? 0) + failReps(s) * s.weight_kg;
      }
    }
  }
  const day = plan?.days.find((d) => d.row.id === dayId);
  return {
    planId,
    planName,
    dayId,
    dayName,
    lastDate: lastOfDay?.date ?? null,
    lastVolumeKg: lastVolume,
    previousDayName: sameLast ? lastPlan.day.name : null,
    previousDate: sameLast ? last.date : null,
    scheduledDate,
    scheduledTime,
    exercises: (day?.exercises ?? []).map((e) => db.exercises.get(e.exerciseId)?.name).filter(Boolean),
    planDayCount: plan?.days.length ?? 0,
  };
}

/** Werte der Overview-Widgets wie `dashboard::data`. */
export function dashboardFor(db, date, plans = []) {
  const from = P.addDays(date, -(STREAK_DAYS - 1));
  const water = new Map();
  for (const w of db.water) if (w.date >= from && w.date <= date) water.set(w.date, (water.get(w.date) ?? 0) + (w.amount_ml ?? 0));
  const supplementDays = [...db.intakesByDate.entries()]
    .filter(([d, list]) => d >= from && d <= date && list.some((i) => (db.intakeItems.get(i.id) ?? []).length > 0))
    .map(([d]) => d)
    .sort();
  const metrics = metricsOf(db);
  const maxDate = (list) => list.reduce((a, d) => (d <= date && (!a || d > a) ? d : a), null);
  const lastDates = [
    { key: "weight", date: lastMetric(db, P.WEIGHT_METRIC_ID, date) },
    { key: "circumference", date: maxDate(db.body.filter((m) => metrics.get(m.metric_id)?.category === "circumference").map((m) => m.date)) },
    { key: "checkin", date: maxDate((db.pc.checkin_date ?? []).map((c) => c.date)) },
    { key: "grip", date: later(maxDate((db.pc.grip_strength_measurement ?? []).map((g) => g.date)), lastMetric(db, GRIP_METRIC_ID, date)) },
    { key: "vo2max", date: lastMetric(db, VO2MAX_METRIC_ID, date) },
    { key: "hrv", date: lastMetric(db, HRV_METRIC_ID, date) },
  ];
  // Ballaststoffe, Zucker, gesättigte Fette, Salz aus den Lebensmitteln der Mahlzeiten (7 Tage)
  const extrasFrom = P.addDays(date, -(EXTRAS_DAYS - 1));
  const extras = new Map();
  for (const [d, meals] of db.mealsByDate) {
    if (d < extrasFrom || d > date) continue;
    for (const m of meals) {
      for (const it of db.itemsByMeal.get(m.id) ?? []) {
        const f = db.foods.get(it.food_id);
        if (!f) continue;
        if (!extras.has(d)) extras.set(d, { date: d, energyKcal: 0, fiberG: 0, sugarG: 0, saturatedFatG: 0, saltG: 0, items: 0, fiberMissing: 0, sugarMissing: 0, saturatedFatMissing: 0, saltMissing: 0 });
        const e = extras.get(d);
        const k = it.amount / 100;
        e.energyKcal += k * f.energy_kcal;
        for (const [col, key] of [
          ["fiber_g", "fiber"],
          ["sugar_g", "sugar"],
          ["saturated_fat_g", "saturatedFat"],
          ["salt_g", "salt"],
        ]) {
          const v = f[col];
          if (v === null || v === undefined) e[`${key}Missing`] += 1;
          else e[`${key}G`] += k * v;
        }
        e.items += 1;
      }
    }
  }
  return {
    date,
    water: [...water.entries()].sort((a, b) => cmp(a[0], b[0])).map(([d, value]) => ({ date: d, value })),
    supplementDays,
    lastDates,
    nextPlanDay: nextPlanDay(db, plans, date),
    extras: [...extras.values()].sort((a, b) => cmp(a.date, b.date)),
  };
}

// ------------------------------------------------------------------ Cardio, Satzprotokoll, Lebensmittel

/** Cardio-Einheiten (nur Datum und Dauer, für die Wochenziele) wie `cardio_report::sessions`. */
export function cardioSessions(db) {
  const out = [];
  for (const w of db.workouts) {
    if ((w.status ?? "done") !== "done") continue;
    const o = P.workoutOf(db, w);
    if (!o.exercises.some((e) => e.exerciseCategory === "cardio")) continue;
    for (const e of o.exercises) {
      if (!e.cardioKind) continue;
      out.push({
        workoutId: w.id,
        date: w.date,
        title: w.title,
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        kind: e.cardioKind,
        blocks: e.sets.length,
        durationSeconds: e.sets.reduce((a, s) => a + (s.duration_seconds ?? 0), 0),
        distanceM: e.sets.reduce((a, s) => a + (s.distance_m ?? 0), 0),
      });
    }
  }
  return out.sort((a, b) => cmp(a.date, b.date));
}

/** Alle Sätze abgeschlossener Einheiten wie `workout::set_log` (älteste zuerst). */
export function setLog(db) {
  const out = [];
  const done = db.workouts
    .filter((w) => (w.status ?? "done") === "done")
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.start_time ?? "", b.start_time ?? "") || cmp(a.created_at, b.created_at));
  for (const w of done) {
    for (const e of P.workoutOf(db, w).exercises) {
      for (const s of e.sets) {
        out.push({
          workoutId: w.id,
          date: w.date,
          workoutTitle: w.title,
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName,
          exerciseCategory: e.exerciseCategory,
          setIndex: s.position ?? 0,
          reps: n(s.reps),
          weightKg: n(s.weight_kg),
          durationSeconds: n(s.duration_seconds),
          distanceM: n(s.distance_m),
          rpe: n(s.rpe),
          isWarmup: Boolean(s.is_warmup),
          notes: n(s.notes),
          isFailure: Boolean(s.is_failure),
          cardioKind: e.cardioKind,
          gripWidth: e.gripWidth,
          gripPosition: e.gripPosition,
        });
      }
    }
  }
  return out;
}

/** Übungen in der Form der Desktop-App (nur, was die Overview braucht). */
export function exercisesOf(db) {
  return [...db.exercises.values()].map((e) => ({ id: e.id, name: e.name, category: e.category ?? "strength", muscleGroup: e.muscle_group ?? null, machineId: e.machine_id ?? null }));
}

/** Eigene Lebensmittel mit Nutzung (Anzahl in Mahlzeiten) wie `food::list`. */
export function foodsWithUsage(db) {
  const usage = new Map();
  for (const items of db.itemsByMeal.values()) for (const it of items) usage.set(it.food_id, (usage.get(it.food_id) ?? 0) + 1);
  return [...db.foods.values()].map((f) => ({
    id: f.id,
    name: f.name,
    brand: f.brand ? f.brand : null,
    basisUnit: f.basis_unit ?? "g",
    energyKcal: f.energy_kcal ?? 0,
    proteinG: f.protein_g ?? 0,
    portionName: f.portion_name ?? null,
    portionAmount: f.portion_amount ?? null,
    archived: Boolean(f.archived),
    usageCount: usage.get(f.id) ?? 0,
  }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "de", { sensitivity: "base" }) || String(a.brand ?? "").localeCompare(String(b.brand ?? ""), "de", { sensitivity: "base" }));
}
