// LIFESPAN OS Mobil – Tagebuch → Mahlzeiten als Tagesverlauf (1.100.0, wie PC 1.0.175).
// Mahlzeiten, geplante Mahlzeiten, Koffein, Supplements und Wasser auf einer senkrechten Zeitachse.
// Der orange Knopf lässt sich mit dem Finger an jede Uhrzeit ziehen: davor = gegessen eintragen,
// danach = planen. Anordnung wie `src/domain/mealTimeline.ts` am PC.
// 1.102.0 (wie PC 1.0.176, Wunsch 22.11.2026): Achse immer vom Tageswechsel (Settings) bis eine
// Minute davor; Uhrzeiten vor dem Tageswechsel zählen über 24:00 hinaus (`axisMinute`). Der Knopf
// steht immer auf der aktuellen Uhrzeit (an anderen Tagen auf derselben Uhrzeit) und rastet
// minutengenau ein; über einer Karte bleibt die Uhrzeit stehen, dazwischen ist Platz für jede Minute.
// 1.107.0 (wie PC 1.0.181): Trainings als hellgrauer Balken, Hinweise zu Pre-/Post-Workout,
// zweimal auf eine geplante Einheit tippen = verschieben, Dauer ändern, löschen. Spalten richten
// sich nach rechts aus und ragen nicht mehr über den Rand.

import * as P from "./pcdb.js";
import * as N from "./nutrition.js";
import { X, today, buildDb } from "./diary.js";
import { caffeineIntakesOn } from "./icoach.js";
import { dayStartMinutesOn } from "./appday.js";
import * as SP from "./supplements.js";
import * as CF from "./caffeinedata.js";
import { persistSupp } from "./diarysupp.js";
import { diaryCaffeineActions } from "./diarycaffeine.js";
import { diaryActions } from "./diaryactions.js";
import * as D from "./pcdomain.js";
import * as TR from "./trainingdata.js";
import * as CD from "./checklistdata.js";
import * as PS from "./pcsettings.js";
import * as O from "./pcoverview.js";

// ------------------------------------------------------------------ Anordnung (wie mealTimeline.ts)

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const minuteOf = (t) => {
  const m = TIME.exec(String(t ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const DAY = 1440;
export const clockOf = (minute) => {
  const m = ((Math.round(minute) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
/** Uhrzeit vor dem Tageswechsel gehört zur Nacht danach (zählt über 24:00 hinaus). */
export const axisMinute = (minute, dayStart = 0) => (minute < dayStart ? minute + DAY : minute);
export const axisMinuteOf = (t, dayStart = 0) => {
  const m = minuteOf(t);
  return m === null ? null : axisMinute(m, dayStart);
};
export const snapMinute = (minute, step = 1, dayStart = 0) =>
  Math.max(dayStart, Math.min(dayStart + DAY - 1, Math.round(minute / step) * step));

/** Zoom (zwei Finger): kleinster und größter Faktor wie am PC */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const clampZoom = (z) => (Number.isFinite(z) ? Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) * 100) / 100 : 1);

/**
 * Anordnung wie `layoutTimeline` am PC (1.103.0): maßstabsgetreu; überdeckte Einträge rücken in die
 * nächste Spalte (Verbindungslinie zur Uhrzeit), der Knopf hat zuerst die erste Spalte. Sind alle
 * Spalten belegt, rutscht ein Eintrag in der freiesten nach unten (`shifted`).
 */
export function layoutTimeline(list, { pxPerMin = 1, gap = 8, dayStart = 0, maxCols = 3, firstKey = null } = {}) {
  const start = dayStart;
  const end = start + DAY - 1;
  const cols = Math.max(1, Math.floor(maxCols));
  const clamp = (m) => Math.max(start, Math.min(end, m));
  const timeY = (m) => (clamp(m) - start) * pxPerMin;
  const sorted = [...list].map((i) => ({ ...i, minute: clamp(i.minute) })).sort((a, b) => a.minute - b.minute || String(a.key).localeCompare(String(b.key)));
  const order = [...sorted.filter((i) => i.key === firstKey), ...sorted.filter((i) => i.key !== firstKey)];
  const taken = Array.from({ length: cols }, () => []);
  const free = (c, y, h) => taken[c].every(([a, b]) => y + h + gap <= a || y >= b);
  const placed = [];
  for (const item of order) {
    const ty = timeY(item.minute);
    let col = -1;
    for (let c = 0; c < cols; c++) {
      if (free(c, ty, item.height)) {
        col = c;
        break;
      }
    }
    let y = ty;
    let shifted = false;
    if (col < 0) {
      let best = { col: 0, y: Infinity };
      for (let c = 0; c < cols; c++) {
        let cy = ty;
        while (!free(c, cy, item.height)) cy = Math.max(...taken[c].filter(([a, b]) => !(cy + item.height + gap <= a || cy >= b)).map(([, b]) => b));
        if (cy < best.y) best = { col: c, y: cy };
      }
      col = best.col;
      y = best.y;
      shifted = true;
    }
    taken[col].push([y, y + item.height + gap]);
    placed.push({ ...item, y, timeY: ty, col, shifted });
  }
  placed.sort((a, b) => a.minute - b.minute || a.col - b.col || String(a.key).localeCompare(String(b.key)));
  const endY = (end - start) * pxPerMin;
  const height = Math.max(endY, ...placed.map((x) => x.y + x.height));
  const anchors = [
    { minute: start, y: 0 },
    { minute: end, y: endY },
  ];
  const hours = [];
  for (let h = Math.ceil(start / 60); h * 60 <= end; h++) hours.push({ label: clockOf(h * 60), y: timeY(h * 60) });
  const used = placed.length ? Math.max(...placed.map((x) => x.col)) + 1 : 1;
  return { start, end, height, items: placed, anchors, hours, cols: used };
}

export function yAt(anchors, minute) {
  if (!anchors.length) return 0;
  if (minute <= anchors[0].minute) return anchors[0].y;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (minute <= b.minute) return b.minute - a.minute <= 0 ? b.y : a.y + ((minute - a.minute) / (b.minute - a.minute)) * (b.y - a.y);
  }
  return anchors[anchors.length - 1].y;
}

export function minuteAt(anchors, y) {
  if (!anchors.length) return 0;
  if (y <= anchors[0].y) return anchors[0].minute;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (y <= b.y) return b.y - a.y <= 0 ? b.minute : a.minute + ((y - a.y) / (b.y - a.y)) * (b.minute - a.minute);
  }
  return anchors[anchors.length - 1].minute;
}

export function mealTypeAt(minute) {
  const h = Math.floor((((minute % DAY) + DAY) % DAY) / 60);
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

export function groupWater(glasses, dayStart = 0, withinMin = 45) {
  const timed = glasses
    .map((g) => ({ minute: axisMinuteOf(g.time, dayStart), ml: g.amountMl }))
    .filter((g) => g.minute !== null)
    .sort((a, b) => a.minute - b.minute);
  const out = [];
  for (const g of timed) {
    const last = out[out.length - 1];
    if (last && g.minute - last.minute <= withinMin) {
      last.count += 1;
      last.ml += g.ml;
    } else out.push({ minute: g.minute, count: 1, ml: g.ml });
  }
  return out;
}

/**
 * Feste Spalten (1.104.0, wie PC 1.0.178): eine Spalte untereinander – überdeckte Karten rutschen
 * nach unten (`shifted`, Verbindung zur Uhrzeit).
 */
export function stackLane(list, { pxPerMin = 1, gap = 6, dayStart = 0, yOf = null } = {}) {
  const clamp = (m) => Math.max(dayStart, Math.min(dayStart + DAY - 1, m));
  const toY = yOf ?? ((m) => (m - dayStart) * pxPerMin);
  const sorted = [...list].sort((a, b) => a.minute - b.minute || String(a.key).localeCompare(String(b.key)));
  let bottom = -Infinity;
  return sorted.map((e) => {
    const timeY = toY(clamp(e.minute));
    const y = Math.max(timeY, bottom);
    bottom = y + e.height + gap;
    return { ...e, y, timeY, shifted: y > timeY + 0.5 };
  });
}

/** Symbolspalte: Einträge weniger als `span` px nach dem ersten einer Gruppe bilden ein Symbol. */
export function clusterLane(list, { pxPerMin = 1, span = 30, dayStart = 0, yOf = null } = {}) {
  const toY = yOf ?? ((m) => (m - dayStart) * pxPerMin);
  const sorted = [...list].sort((a, b) => a.minute - b.minute || String(a.key).localeCompare(String(b.key)));
  const out = [];
  for (const e of sorted) {
    const y = toY(Math.max(dayStart, e.minute));
    const last = out[out.length - 1];
    if (last && y - last.y < span) last.items.push(e);
    else out.push({ key: e.key, minute: e.minute, y, items: [e] });
  }
  return out;
}

/** Volle Stunden der Achse mit ihrer Höhe. */
export function hourMarks(dayStart, pxPerMin) {
  const out = [];
  for (let h = Math.ceil(dayStart / 60); h * 60 <= dayStart + DAY - 1; h++) out.push({ label: clockOf(h * 60), y: (h * 60 - dayStart) * pxPerMin });
  return out;
}

/** Freie Abschnitte von [a, b] ohne die Minuten `busy` (± `margin`). */
function freeParts(a, b, busy, margin) {
  const out = [];
  let start = a;
  for (const m of [...busy].sort((x, y) => x - y)) {
    if (m + margin <= start || m - margin >= b) continue;
    if (m - margin > start) out.push([start, m - margin]);
    start = Math.max(start, m + margin);
  }
  if (start < b) out.push([start, b]);
  return out;
}

/**
 * Schlafzeit zusammenklappen (1.105.0, wie `sleepFolds` am PC 1.0.179): Nacht bis zum Morgen
 * (Schlafprotokoll mit Datum = Aufwachtag) und Nacht ab dem Abend (Protokoll des Folgetags).
 */
export function sleepFolds(date, nextDate, logs, dayStart, busy = [], { margin = 20, minLen = 90 } = {}) {
  const end = dayStart + DAY - 1;
  const raw = [];
  const morning = logs.find((l) => l.date === date);
  if (morning) {
    const wake = minuteOf(morning.wakeTime);
    const bed = minuteOf(morning.bedTime);
    if (wake !== null && wake >= dayStart) raw.push({ from: bed !== null && bed >= dayStart && bed < wake ? bed : dayStart, to: wake, bed: morning.bedTime, wake: morning.wakeTime });
  }
  const evening = logs.find((l) => l.date === nextDate);
  if (evening) {
    const bed = minuteOf(evening.bedTime);
    const wake = minuteOf(evening.wakeTime);
    if (bed !== null) {
      const from = axisMinute(bed, dayStart);
      const to = wake !== null && wake < dayStart ? wake + DAY : end;
      if (from < to && from > dayStart + 6 * 60) raw.push({ from, to: Math.min(end, to), bed: evening.bedTime, wake: evening.wakeTime });
    }
  }
  const out = [];
  for (const f of raw) for (const [a, b] of freeParts(f.from, f.to, busy, margin)) if (b - a >= minLen) out.push({ ...f, from: a, to: b });
  return out.sort((a, b) => a.from - b.from);
}

/** Achse mit zusammengeklappten Abschnitten (je `foldPx` hoch), wie `axisScale` am PC. */
export function axisScale(dayStart, pxPerMin, folds = [], foldPx = 32) {
  const placed = [];
  let saved = 0;
  for (const f of [...folds].sort((a, b) => a.from - b.from)) {
    placed.push({ ...f, y: (f.from - dayStart) * pxPerMin - saved, h: foldPx });
    saved += (f.to - f.from) * pxPerMin - foldPx;
  }
  const y = (m) => {
    let cut = 0;
    for (const f of placed) {
      if (m >= f.to) cut += (f.to - f.from) * pxPerMin - f.h;
      else if (m > f.from) return f.y + ((m - f.from) / (f.to - f.from)) * f.h;
    }
    return (m - dayStart) * pxPerMin - cut;
  };
  const minute = (yy) => {
    let cut = 0;
    for (const f of placed) {
      if (yy < f.y) break;
      if (yy <= f.y + f.h) return f.from + ((yy - f.y) / f.h) * (f.to - f.from);
      cut += (f.to - f.from) * pxPerMin - f.h;
    }
    return dayStart + (yy + cut) / pxPerMin;
  };
  return { y, minute, endY: y(dayStart + DAY - 1), folds: placed };
}

// ------------------------------------------------------------------ Ansicht

const PX = 0.9;
/** Achse (Mitte), linker Rand der Mahlzeiten, Symbolspalten (1.104.0) */
const AXIS_X = 42;
const MEALS_LEFT = 52;
const ICON_W = 32;
const CAF_W = 52;
const LANE_GAP = 3;
const MARK_H = 28;
const GRIP_H = 30;
const ZOOM_KEY = "lifespan.mealsZoom";
const LANES = ["supplement", "water", "caffeine"];
const LANE_ICON = { supplement: "💊", water: "💧", caffeine: "☕" };
const LANE_LABEL = { supplement: "Supplements", water: "Wasser", caffeine: "Koffein" };
/** Zoom dieses Handys (zwei Finger), gemerkt im Browser */
function zoomNow() {
  const S = X.S;
  if (typeof S.mtlZoom !== "number") {
    try {
      S.mtlZoom = clampZoom(Number(localStorage.getItem(ZOOM_KEY) ?? "1"));
    } catch {
      S.mtlZoom = 1;
    }
  }
  return S.mtlZoom;
}
function setZoom(z) {
  X.S.mtlZoom = clampZoom(z);
  try {
    localStorage.setItem(ZOOM_KEY, String(X.S.mtlZoom));
  } catch {
    // ohne Speicher gilt der Zoom bis zum Neustart
  }
}
const clockMinute = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
/** Aktuelle Uhrzeit auf der Achse des Tages (an anderen Tagen dieselbe Uhrzeit). */
export const axisNow = (date) => axisMinute(clockMinute(), dayStartMinutesOn(date));
/** Uhrzeit liegt nach „jetzt“ (heute) bzw. der Tag in der Zukunft → planen */
export function plannedAt(date, minute) {
  const t = today();
  if (date > t) return true;
  return date === t && minute > axisNow(date);
}

/**
 * Zustand des Knopfes für den Tag. `pinned` = vom Nutzer gewählte Minute (beim Ziehen, solange
 * das Fenster offen ist), sonst steht der Knopf auf der aktuellen Uhrzeit.
 */
function handleState(date) {
  const S = X.S;
  if (!S.mtl || S.mtl.date !== date) S.mtl = { date, pinned: null, panel: false, key: null };
  return S.mtl;
}
/** Minute des Knopfes (gewählt oder jetzt). */
export const handleMinute = (date) => {
  const h = handleState(date);
  return h.pinned ?? axisNow(date);
};

function macroBar(m) {
  const p = m.proteinG * 4;
  const c = m.carbsG * 4;
  const f = m.fatG * 9;
  const sum = p + c + f;
  if (sum <= 0) return "";
  const w = (v) => ((v / sum) * 100).toFixed(1);
  return `<span class="mtl-macros" aria-hidden="true"><span class="mtl-macro mtl-macro--p" style="width:${w(p)}%"></span><span class="mtl-macro mtl-macro--c" style="width:${w(c)}%"></span><span class="mtl-macro mtl-macro--f" style="width:${w(f)}%"></span></span>`;
}

const foodsLine = (items) => {
  const names = items.map((i) => i.foodName);
  return names.length > 3 ? `${names.slice(0, 3).join(" · ")} · +${names.length - 3}` : names.join(" · ");
};

const liters = (ml) => `${String(Math.round(ml / 10) / 100).replace(".", ",")} l`;

/** Schlüssel für Wischen und Menü: Art|ID|Name */
function swipeKey(it) {
  if (it.kind === "meal") return `meal|${it.slot.ref.name ? N.extraKey(it.slot.ref.name) : it.slot.ref.mealType}|${it.slot.title}`;
  if (it.kind === "planned") return `planned|${it.plan.id}|${N.mealLabel(it.plan.key)} (geplant)`;
  return `${it.kind}|${it.id}|${it.label}`;
}

// ------------------------------------------------------------------ Trainings (1.107.0)

const WT = () => D.workoutTimeline;

/** Pläne, Einheiten des Tages (PC + Handy, laufende), ausgelassene Termine, Dauer, Restday. */
function trainingOf(db, date) {
  const S = X.S;
  let plans = [];
  try {
    plans = TR.plansOf(S.catalogRaw, S.train, S.catalog?.exercises ?? []);
  } catch {
    plans = [];
  }
  const cat = new Map([...(S.catalog?.exercises ?? []), ...(S.localExercises ?? [])].map((e) => [e.id, e.category ?? "strength"]));
  let workouts = [];
  try {
    workouts = P.workoutsBetween(db, date, date).map((r) => ({
      ...P.workoutOf(db, r),
      startedAt: r.started_at ?? null,
      finishedAt: r.finished_at ?? null,
      planDayId: r.plan_day_id ?? null,
    }));
  } catch {
    workouts = [];
  }
  const a = S.active;
  if (a && a.date === date && !workouts.some((w) => w.id === a.id)) {
    workouts.push({
      id: a.id,
      title: a.title,
      startTime: a.startTime ?? null,
      durationMin: null,
      status: "active",
      startedAt: a.startedAt ?? null,
      finishedAt: null,
      perceivedExertion: null,
      planDayId: a.planDayId ?? null,
      exercises: (a.exercises ?? []).map((e) => ({ exerciseCategory: cat.get(e.exerciseId) ?? "strength" })),
    });
  }
  let off = false;
  try {
    off = S.checklists ? CD.dayStatusOf(S.catalog, S.checklists, date, date).length > 0 : false;
  } catch {
    off = false;
  }
  return {
    plans,
    workouts,
    skips: WT().parseSkips(db.settings?.get?.(WT().TRAINING_SKIPS_SETTING) ?? null),
    durations: WT().parseDurations(db.settings?.get?.(WT().TRAINING_DURATIONS_SETTING) ?? null),
    off,
    targets: targetsOf(db, date),
    // ausgeblendete Hinweise je Training (1.110.0)
    hintsOff: WT().parseSkips(db.settings?.get?.(WT().HINTS_OFF_SETTING) ?? null),
  };
}

/** Workout-Richtwerte (Settings → Mahlzeiten, 1.110.0) mit dem letzten Gewicht bis zu diesem Tag */
function targetsOf(db, date) {
  const t = WT().parseWorkoutTargets(db.settings?.get?.(WT().WORKOUT_TARGETS_SETTING) ?? null);
  let weight = null;
  if (t.mode === "perKg") {
    try {
      const list = O.measurementsBetween(db, P.WEIGHT_METRIC_ID, null, date);
      weight = list.length ? list[list.length - 1].value : null;
    } catch {
      weight = null;
    }
  }
  return WT().resolveWorkoutTargets(t, weight);
}

function barsOf(tr, date, dayStart, now) {
  const tracked = WT().trackedBars(tr.workouts, dayStart, now);
  const doneDayIds = tr.workouts.map((w) => w.planDayId).filter(Boolean);
  const planned = WT().plannedBars(tr.plans, date, dayStart, { skips: tr.skips, durations: tr.durations, doneDayIds, off: tr.off });
  return [...tracked, ...planned].sort((x, y) => x.from - y.from);
}

/** Bearbeiten einer geplanten Einheit (zweimal tippen) für diesen Tag */
const trainEdit = (date) => (X.S.mtlTrain && X.S.mtlTrain.date === date ? X.S.mtlTrain : null);

const germanDay = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const WEEKDAY_NAMES = { 1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag", 6: "Samstag", 7: "Sonntag" };

/**
 * Tagesverlauf als HTML. `slots` = Mahlzeiten des Tages wie im Tagebuch (D.daySlots),
 * `glucoseOf(meal)` = Text zum Blutzucker nach der Mahlzeit oder "".
 */
export function timelineHtml(db, date, slots, glucoseOf = () => "") {
  const esc = X.esc;
  const S = X.S;
  const local = S.food?.local;
  const h = handleState(date);
  const dayStart = dayStartMinutesOn(date);
  const ax = (t) => axisMinuteOf(t, dayStart);
  const isToday = date === today();
  const now = isToday ? axisNow(date) : null;
  const future = date > today();
  const hMinute = h.pinned ?? axisNow(date);
  const meals = [];
  const icons = { supplement: [], water: [], caffeine: [] };
  const untimed = [];
  for (const slot of slots) {
    const m = slot.meal;
    if (!m || (m.items.length === 0 && Object.keys(m.values ?? {}).length === 0)) continue;
    const minute = ax(m.time);
    if (minute === null) {
      untimed.push(slot);
      continue;
    }
    meals.push({ key: `meal:${slot.key}`, kind: "meal", minute, time: m.time, height: 78 + (glucoseOf(m) ? 18 : 0), slot, meal: m });
  }
  const planned = local ? N.plannedOn(S.catalog, local, date) : [];
  for (const p of planned) {
    const minute = ax(p.time);
    if (minute !== null) meals.push({ key: `plan:${p.id}`, kind: "planned", minute, time: p.time, height: 104, plan: p });
  }
  let caffeine = [];
  try {
    caffeine = caffeineIntakesOn(date).filter((c) => (c.source ?? "calculator") === "calculator");
  } catch {
    caffeine = [];
  }
  for (const c of caffeine) {
    const minute = ax(c.time);
    if (minute !== null) icons.caffeine.push({ key: `caf:${c.id}`, kind: "caffeine", id: c.id, label: c.label, mg: c.mg, minute, time: c.time, text: `${c.label} · ${Math.round(c.mg)} mg Koffein` });
  }
  const mealTimes = new Map(slots.filter((s) => s.meal).map((s) => [s.meal.id, s.meal.time]));
  // Supplement-Einträge der Koffein-Erfassung stehen schon als Koffein da
  const fromCaffeine = new Set(caffeine.map((c) => c.supplementIntakeId).filter(Boolean));
  for (const i of P.intakesOn(db, date)) {
    if (fromCaffeine.has(i.id)) continue;
    const t = i.time ?? (i.mealId ? mealTimes.get(i.mealId) : null) ?? null;
    const minute = ax(t);
    if (minute !== null) icons.supplement.push({ key: `sup:${i.id}`, kind: "supplement", id: i.id, label: i.name, count: i.items.length, minute, time: t, text: `${i.name}${i.items.length > 1 ? ` · ${i.items.length} Supplements` : ""}` });
  }
  for (const g of P.waterDay(db, date).glasses) {
    const minute = ax(g.time);
    if (minute !== null) icons.water.push({ key: `water:${g.id}`, kind: "water", id: g.id, label: `Wasser ${liters(g.amountMl)}`, ml: g.amountMl, minute, time: g.time, text: `Wasser · ${liters(g.amountMl)}` });
  }
  // Trainings (1.107.0)
  let bars = [];
  let tr = null;
  try {
    tr = trainingOf(db, date);
    bars = barsOf(tr, date, dayStart, now);
  } catch {
    bars = [];
  }
  const te = trainEdit(date);
  const shown = bars.map((b) => (te && te.key === b.key ? { ...b, from: te.from, to: te.from + te.dur } : b));
  const fuel = [
    ...meals.map((m) =>
      m.kind === "meal"
        ? { key: m.key, minute: m.minute, kind: "meal", kcal: m.meal.energyKcal, carbsG: m.meal.carbsG, proteinG: m.meal.proteinG, role: WT().workoutRole(m.meal.name ?? m.slot.title) }
        : { key: m.key, minute: m.minute, kind: "planned", kcal: m.plan.energyKcal, carbsG: m.plan.carbsG ?? 0, proteinG: m.plan.proteinG ?? 0, role: WT().workoutRole(m.plan.name), planId: m.plan.id, time: m.plan.time },
    ),
    ...icons.supplement.map((i) => ({ key: i.key, minute: i.minute, kind: "supplement", kcal: 0, carbsG: 0, proteinG: 0, role: null })),
  ];
  try {
    // Koffein zählt als Pre-Workout – auch aus Supplementen und Mahlzeiten
    for (const c of caffeineIntakesOn(date)) {
      const minute = ax(c.time);
      if (minute !== null) fuel.push({ key: `caf:${c.id}`, minute, kind: "caffeine", kcal: 0, carbsG: 0, proteinG: 0, role: null });
    }
  } catch {
    // ohne Koffeindaten
  }
  const hints = shown.length ? WT().visibleHints(WT().trainingHints(shown, fuel, now, future, tr?.targets), shown, date, tr?.hintsOff ?? []) : [];
  S.mtlBars = { date, bars, fuel };
  const hintText = date >= today();
  const zoom = zoomNow();
  const px = PX * zoom;
  // Breite der Achse: gemessen an der bisherigen Ansicht, sonst geschätzt
  const measured = document.querySelector(".mtl")?.clientWidth ?? 0;
  const width = Math.max(280, measured > 0 ? measured : Math.min(window.innerWidth || 390, 760) - 40);
  const mealsW = Math.max(130, Math.min(560, width - MEALS_LEFT - 2 * ICON_W - CAF_W - 3 * LANE_GAP));
  // Spalten von rechts (1.107.0): ragen bei keiner Breite über den Rand
  const laneW = { supplement: ICON_W, water: ICON_W, caffeine: CAF_W };
  const laneRight = { caffeine: 0, water: CAF_W + LANE_GAP, supplement: CAF_W + ICON_W + 2 * LANE_GAP };
  const lanesW = CAF_W + 2 * ICON_W + 3 * LANE_GAP;
  const laneLeftCss = (l) => `left:calc(100% - ${laneRight[l] + laneW[l]}px);width:${laneW[l]}px`;
  // Schlafzeit zusammenklappen (Einstellung „ui.meals_sleep_fold“, Voreinstellung optimiert)
  const foldAll = (db.settings?.get?.("ui.meals_sleep_fold") ?? null) === "all";
  const showAll = S.mtlShowAll === date;
  let folds = [];
  if (!foldAll && !showAll) {
    const nd = new Date(`${date}T12:00:00`);
    nd.setDate(nd.getDate() + 1);
    const next = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`;
    const logs = (db.sleep ?? []).filter((r) => r.date === date || r.date === next).map((r) => ({ date: r.date, bedTime: r.bed_time, wakeTime: r.wake_time }));
    const busy = [...meals, ...icons.supplement, ...icons.water, ...icons.caffeine].map((e) => e.minute);
    // Trainings bleiben sichtbar (alle 30 Minuten ein Punkt)
    for (const b of shown) {
      for (let m = b.from; m < b.to; m += 30) busy.push(m);
      busy.push(b.to);
    }
    if (now !== null) busy.push(now);
    if (h.pinned !== null) busy.push(h.pinned);
    folds = sleepFolds(date, next, logs, dayStart, busy);
  }
  const scale = axisScale(dayStart, px, folds, 32);
  const stacked = stackLane(meals, { pxPerMin: px, gap: 6, dayStart, yOf: scale.y });
  const clusters = Object.fromEntries(LANES.map((l) => [l, clusterLane(icons[l], { pxPerMin: px, span: MARK_H + 4, dayStart, yOf: scale.y })]));
  const h0 = Math.ceil(dayStart / 60) * 60;
  const hours = hourMarks(dayStart, px)
    .map((x, i) => ({ ...x, minute: h0 + i * 60 }))
    .filter((x) => !scale.folds.some((f) => x.minute > f.from - 10 && x.minute < f.to + 10))
    .map((x) => ({ ...x, y: scale.y(x.minute) }));
  const endY = scale.endY;
  const hy = scale.y(hMinute);
  const handlePlanned = plannedAt(date, hMinute);
  const handleClock = clockOf(hMinute);
  const editBar = te ? bars.find((b) => b.key === te.key) ?? null : null;
  const editTop = te ? scale.y(te.from + te.dur) + 8 : 0;
  const height = Math.ceil(Math.max(endY, ...stacked.map((x) => x.y + x.height), te ? editTop + 470 : 0) + 16);
  // Stützpunkte für das Ziehen (linear: Anfang und Ende)
  const anchors = [[dayStart, 0]];
  for (const f of scale.folds) {
    anchors.push([f.from, Math.round(f.y * 10) / 10], [f.to, Math.round((f.y + f.h) * 10) / 10]);
  }
  anchors.push([dayStart + DAY - 1, Math.round(endY * 10) / 10]);
  // Mahlzeit, in die der Knopf einträgt: Vorschlag nach Uhrzeit, änderbar
  const options = slots.map((s) => ({ key: s.ref.name ? N.extraKey(s.ref.name) : s.ref.mealType, title: s.title, type: s.ref.mealType }));
  // nur zur Wahl: Workout-Mahlzeiten und eigene ohne Platz im Tagebuch (1.107.0)
  let choice = [];
  try {
    choice = D.getChoiceOnlyMealNames();
  } catch {
    choice = N.WORKOUT_MEALS;
  }
  for (const name of choice) if (!options.some((o) => o.title === name)) options.push({ key: N.extraKey(name), title: name, type: "other" });
  const wm = shown.length ? WT().workoutMealAt(shown, hMinute, tr?.targets) : null;
  const suggested = (wm ? options.find((o) => o.title === wm)?.key : undefined) ?? options.find((o) => o.type === mealTypeAt(hMinute))?.key ?? options[0]?.key ?? "";
  // grüner Punkt = frei, roter = schon Lebensmittel eingetragen oder geplant (1.112.0, wie PC 1.0.188)
  const usedKeys = new Set();
  for (const s of slots) {
    const m = s.meal;
    if (m && (m.items.length > 0 || Number(m.energyKcal) > 0 || Object.values(m.values ?? {}).some((v) => v > 0))) {
      usedKeys.add(s.ref.name ? N.extraKey(s.ref.name) : s.ref.mealType);
    }
  }
  for (const p of planned) if (p.items.length > 0) usedKeys.add(p.key);
  for (const o of options) o.used = usedKeys.has(o.key);
  const chosen = h.key && options.some((o) => o.key === h.key) ? h.key : suggested;
  const chosenTitle = options.find((o) => o.key === chosen)?.title ?? "Mahlzeit";

  // schmale Spalte: geplante Karten nur mit „Gegessen“ (Rest per Wischen)
  const narrow = mealsW < 220;
  const cardHtml = (it) => {
    if (it.kind === "meal") {
      const m = it.meal;
      const key = it.slot.ref.name ? N.extraKey(it.slot.ref.name) : it.slot.ref.mealType;
      const g = glucoseOf(m);
      return `<button type="button" class="mtl-card" data-act="mtl-open" data-arg="${esc(key)}"><span class="mtl-card__head"><span class="mtl-card__time">${esc(m.time)}</span><b>${esc(it.slot.title)}</b></span>
        ${macroBar(m)}<span class="muted small mtl-foods"><span class="mtl-kcal">${Math.round(m.energyKcal)} kcal</span> · ${esc(m.items.length ? foodsLine(m.items) : "Fasttracking-Werte")}</span>${g ? `<span class="muted small">${esc(g)}</span>` : ""}</button>`;
    }
    const p = it.plan;
    return `<div class="mtl-card mtl-card--planned"><span class="mtl-card__head"><span class="mtl-card__time">${esc(p.time)}</span><b>${esc(N.mealLabel(p.key))} · geplant</b></span>
      <span class="muted small mtl-foods"><span class="mtl-kcal">${Math.round(p.energyKcal)} kcal</span> · ${esc(foodsLine(p.items))}</span>
      ${narrow ? `<span class="mtl-card__actions"><button class="btn sm primary" data-act="mtl-confirm" data-arg="${esc(p.id)}">✓ Gegessen</button></span>` : `<span class="mtl-card__actions"><button class="btn sm primary" data-act="mtl-confirm" data-arg="${esc(p.id)}">✓ Gegessen</button><button class="btn sm" data-act="mtl-plan-add" data-arg="${esc(p.id)}">+ Lebensmittel</button>${
        handleClock !== p.time ? `<button class="btn sm ghost" data-act="mtl-plan-move" data-arg="${esc(p.id)}">Auf ${handleClock}</button>` : ""
      }<button class="btn sm ghost" data-act="mtl-plan-del" data-arg="${esc(p.id)}" aria-label="Geplante Mahlzeit löschen">✕</button></span>`}</div>`;
  };
  const links = stacked
    .filter((x) => x.shifted)
    .map((x) => `<polyline points="${AXIS_X},${x.timeY.toFixed(1)} ${MEALS_LEFT - 5},${x.timeY.toFixed(1)} ${MEALS_LEFT - 5},${(x.y + 12).toFixed(1)} ${MEALS_LEFT},${(x.y + 12).toFixed(1)}"/>`)
    .join("");
  const marks = LANES.map((lane) =>
    clusters[lane]
      .map((c) => {
        const count = lane === "supplement" ? c.items.reduce((n, e) => n + (e.count || 1), 0) : c.items.length;
        const mg = c.items.reduce((n, e) => n + (e.mg || 0), 0);
        const label = `${LANE_LABEL[lane]}: ${c.items.map((e) => `${e.time} ${e.text}`).join(" · ")}`;
        return `<button type="button" class="mtl-mark mtl-mark--${lane}" style="top:${Math.max(0, c.y - MARK_H / 2).toFixed(1)}px;left:calc(100% - ${laneRight[lane] + laneW[lane] - 2}px);max-width:${laneW[lane] - 4}px" data-act="mtl-menu" data-arg="${esc(c.items.map((e) => swipeKey(e)).join("\n"))}" aria-label="${esc(label)}"><span aria-hidden="true">${LANE_ICON[lane]}</span>${lane === "caffeine" ? `<span class="mtl-mg">${Math.round(mg)}</span>` : ""}${count > 1 ? `<span class="mtl-badge">${count}</span>` : ""}</button>`;
      })
      .join(""),
  ).join("");
  const covered = (y) => stacked.some((c) => y + 18 > c.y && y < c.y + c.height);
  const barsHtml = shown
    .map((b) => {
      const top = scale.y(b.from);
      const hh = Math.max(20, scale.y(b.to) - top);
      const editing = te && te.key === b.key;
      const bh = hints.filter((x) => x.barKey === b.key);
      const state = b.kind === "planned" ? "geplant" : b.running ? "läuft" : "getrackt";
      const ly = !covered(top + 2) ? top + 2 : hh >= 40 && !covered(top + hh - 20) ? top + hh - 20 : top + 2;
      const tip = `${b.title} · ${clockOf(b.from)}–${clockOf(b.to)} · ${state}${b.kind === "planned" ? " – zweimal tippen: verschieben, Dauer, löschen" : ""}`;
      return `<div class="mtl-train mtl-train--${b.kind}${editing ? " is-editing" : ""}" style="top:${top.toFixed(1)}px;height:${hh.toFixed(1)}px;left:${AXIS_X + 3}px" ${b.kind === "planned" ? `data-train="${esc(b.key)}"` : ""} aria-label="${esc(tip)}">${
        editing ? `<span class="mtl-train-size" aria-label="Dauer ändern"></span>` : ""
      }</div><span class="mtl-train-label${covered(ly) ? " is-over" : ""}" style="top:${ly.toFixed(1)}px;left:${MEALS_LEFT + 2}px" ${b.kind === "planned" ? `data-train="${esc(b.key)}"` : ""}>🏋️ ${esc(b.title)} · ${clockOf(b.from)}–${clockOf(b.to)}${b.kind === "planned" ? " · geplant" : b.running ? " · läuft" : ""}${bh.length ? ` <span class="mtl-train-warn" aria-label="${esc(bh.map((x) => x.text).join(" "))}">⚠</span>` : ""}</span>`;
    })
    .join("");
  const hintsHtml =
    hintText && hints.length
      ? `<ul class="mtl-hints">${hints
          .map((h) => {
            const b = shown.find((x) => x.key === h.barKey);
            const name = h.type === "pre" ? "Pre-Workout" : "Post-Workout";
            return `<li class="mtl-hint"><span aria-hidden="true">⚠</span><span class="small"><b>${esc(b?.title ?? "")} ${b ? clockOf(b.from) : ""}:</b> ${esc(h.text)}</span><button class="btn sm" data-act="mtl-hint" data-arg="${Math.round(h.minute)}|${esc(name)}">＋ ${esc(name)}</button>${b ? `<button class="btn sm ghost mtl-hint__close" data-act="mtl-hint-off" data-arg="${esc(b.key)}" aria-label="Hinweise zu ${esc(b.title)} ausblenden" title="Hinweise zu diesem Training ausblenden (beim nächsten Training wieder)">✕</button>` : ""}</li>`;
          })
          .join("")}</ul>`
      : "";
  let editHtml = "";
  if (te && editBar?.plan) {
    const ref = editBar.plan;
    const weekly = ref.slot.weekday !== null;
    const linked = WT().linkedEntries(editBar, fuel).filter((x) => x.kind === "planned");
    editHtml = `<div class="mtl-panel mtl-panel--train" style="top:${editTop.toFixed(1)}px" role="dialog" aria-label="Geplantes Training bearbeiten">
      <b>${esc(editBar.title)} · geplant · ${clockOf(te.from)}–${clockOf(te.from + te.dur)} Uhr</b>
      <span class="muted small">Balken ziehen = verschieben, unteren Rand ziehen = Dauer.</span>
      <div class="row"><label class="field"><span>Beginn</span><input type="time" id="mtl-tr-from" data-diary="mtl-tr" value="${clockOf(te.from)}"></label><label class="field"><span>Dauer (Min.)</span><input type="number" id="mtl-tr-dur" data-diary="mtl-tr" min="10" max="600" step="5" inputmode="numeric" value="${te.dur}"></label></div>
      ${weekly ? `<div class="row mtl-train-scope"><label><input type="radio" name="mtl-tr-scope" data-diary="mtl-tr" value="day" ${te.scope === "day" ? "checked" : ""}> Nur am ${germanDay(date)}</label><label><input type="radio" name="mtl-tr-scope" data-diary="mtl-tr" value="series" ${te.scope === "series" ? "checked" : ""}> Jeden ${WEEKDAY_NAMES[ref.slot.weekday] ?? ""}</label></div>` : ""}
      ${linked.length ? `<label class="mtl-train-shift"><input type="checkbox" id="mtl-tr-shift" data-diary="mtl-tr" ${te.shift ? "checked" : ""}> Workout-Mahlzeiten mitverschieben (${esc(linked.map((x) => `${N.mealLabel(N.extraKey(x.role === "pre" ? "Pre-Workout" : x.role === "post" ? "Post-Workout" : "Intra-Workout"))} ${x.time}`).join(", "))})</label>` : ""}
      ${
        te.ask
          ? `<div class="row"><span class="small">${weekly && te.scope === "day" ? `Training am ${germanDay(date)} auslassen?` : "Termin aus dem Trainingsplan entfernen?"}</span><button class="btn sm danger" data-act="mtl-tr-del">Ja</button><button class="btn sm ghost" data-act="mtl-tr-ask" data-arg="0">Nein</button></div>`
          : `<div class="row"><button class="btn sm primary" data-act="mtl-tr-save">✓ Speichern</button><button class="btn sm" data-act="mtl-tr-ask" data-arg="1">🗑 Löschen</button><button class="btn sm ghost" data-act="mtl-tr-cancel">Abbrechen</button></div>`
      }</div>`;
  }
  const ask = S.mtlAsk && S.mtlAsk.date === date ? S.mtlAsk : null;
  const menu = S.mtlMenu && S.mtlMenu.date === date ? S.mtlMenu : null;

  const panel =
    h.panel && options.length
      ? `<div class="mtl-panel" style="top:${(hy + GRIP_H / 2 + 6).toFixed(1)}px" role="dialog" aria-label="Neuer Eintrag">
      <b>${esc(chosenTitle)} · ${handleClock} Uhr · ${handlePlanned ? "geplant" : "gegessen"}</b>
      <div class="field"><span>Mahlzeit</span><div class="mtl-picks" role="radiogroup" aria-label="Mahlzeit">${options
        .map(
          (o) =>
            `<button type="button" class="mtl-pick${o.key === chosen ? " is-on" : ""}" role="radio" aria-checked="${o.key === chosen}" data-act="mtl-key" data-arg="${esc(o.key)}" aria-label="${esc(o.title)} (${o.used ? "belegt" : "frei"})"><i class="slot-dot${o.used ? " is-used" : ""}" aria-hidden="true"></i>${esc(o.title)}</button>`,
        )
        .join("")}</div><span class="mtl-picks__legend muted small" aria-hidden="true"><i class="slot-dot"></i> frei <i class="slot-dot is-used"></i> schon belegt</span></div>
      <span class="muted small">${handlePlanned ? "Zählt erst, wenn du sie mit „Gegessen“ bestätigst." : "Wird mit dieser Uhrzeit ins Tagebuch eingetragen."}</span>
      <div class="row mtl-adds" role="group" aria-label="Eintragen">${[
        ["mtl-add", "🍽", `Lebensmittel wählen (${chosenTitle})`, " primary", ` data-arg="${esc(chosen)}"`],
        ["mtl-supp", "💊", `Supplement um ${handleClock} Uhr eintragen`, "", ""],
        ["mtl-caffeine", "☕", `Koffein um ${handleClock} Uhr eintragen`, "", ""],
      ]
        .map(([act, icon, label, cls, arg]) => `<button class="btn sm mtl-add${cls}" data-act="${act}"${arg} title="${esc(label)}" aria-label="${esc(label)}"><span aria-hidden="true">${icon}</span></button>`)
        .join("")}<button class="btn sm ghost" data-act="mtl-close">Abbrechen</button></div></div>`
      : "";

  const sheet = menu
    ? `<div class="mtl-sheet" role="dialog" aria-label="Einträge bearbeiten">${menu.items
        .map((k) => {
          const [kind, id, ...rest] = k.split("|");
          const it = [...icons.supplement, ...icons.water, ...icons.caffeine].find((e) => e.kind === kind && e.id === id);
          if (!it) return "";
          const edit = menu.edit === id && kind === "water";
          return `<div class="mtl-sheet__row"><span class="mtl-sheet__name"><span class="muted">${esc(it.time)}</span> ${esc(it.text)}</span>${
            edit
              ? `<span class="row"><input type="time" id="mtl-water-time" value="${esc(it.time)}" aria-label="Uhrzeit"><button class="btn sm primary" data-act="mtl-water-save" data-arg="${esc(id)}">Speichern</button><button class="btn sm ghost" data-act="mtl-menu-edit" data-arg="">Abbrechen</button></span>`
              : `<span class="row"><button class="btn sm" data-act="${kind === "water" ? "mtl-menu-edit" : "mtl-menu-go"}" data-arg="${esc(kind === "water" ? id : k)}">✎ ${kind === "water" ? "Uhrzeit" : "Bearbeiten"}</button><button class="btn sm ghost" data-act="mtl-menu-del" data-arg="${esc(`${kind}|${id}|${rest.join("|")}`)}">🗑 Löschen</button></span>`
          }</div>`;
        })
        .join("")}<button class="btn sm ghost" data-act="mtl-menu-close">Schließen</button></div>`
    : "";

  return `<div class="mtl-wrap">
    ${untimed.length ? `<p class="muted small">Ohne Uhrzeit: ${untimed.map((s) => `<button class="linkbtn" data-act="mtl-open" data-arg="${esc(s.ref.name ? N.extraKey(s.ref.name) : s.ref.mealType)}">${esc(s.title)} · ${Math.round(s.meal.energyKcal)} kcal</button>`).join(" ")}</p>` : ""}
    <div class="mtl-tools"><button class="btn sm primary" data-act="mtl-now">＋ ${future ? "Planen" : "Jetzt eintragen"}</button><span class="spacer"></span>${showAll && !foldAll ? `<button class="linkbtn" data-act="mtl-hidesleep">☾ ausblenden</button>` : ""}<span class="muted small">${Math.round(zoom * 100)} %</span><button class="btn sm ghost" data-act="mtl-zoom" data-arg="0.8" aria-label="Verkleinern">−</button><button class="btn sm ghost" data-act="mtl-zoom" data-arg="1.25" aria-label="Vergrößern">+</button></div>
    ${
      ask
        ? `<div class="mtl-ask" role="alertdialog" aria-label="Löschen bestätigen"><b>„${esc(ask.label)}“ löschen?</b>${ask.note ? `<span class="muted small">${esc(ask.note)}</span>` : ""}<div class="row"><button class="btn sm danger" data-act="mtl-ask-yes">Löschen</button><button class="btn sm ghost" data-act="mtl-ask-no">Abbrechen</button></div></div>`
        : ""
    }
    ${hintsHtml}
    <div class="mtl-heads"><span class="mtl-head" style="left:${MEALS_LEFT}px">Mahlzeiten</span>${LANES.map((l) => `<span class="mtl-head mtl-head--icon" style="${laneLeftCss(l)}" aria-label="${LANE_LABEL[l]}">${LANE_ICON[l]}</span>`).join("")}</div>
    <div class="mtl" style="height:${height}px" data-anchors="${esc(JSON.stringify(anchors))}" data-now="${now ?? ""}" data-future="${future ? 1 : 0}" data-start="${dayStart}" data-minute="${hMinute}" data-pinned="${h.pinned === null ? "" : 1}" data-zoom="${zoom}">
      ${LANES.map((l) => `<span class="mtl-lane" style="${laneLeftCss(l)}" aria-hidden="true"></span>`).join("")}
      ${hours.map((x) => `<span class="mtl-hourline" style="top:${x.y.toFixed(1)}px;right:0" aria-hidden="true"></span>`).join("")}
      <span class="mtl-axis" aria-hidden="true"></span>
      ${hours.filter((x) => Math.abs(x.y - hy) >= 24).map((x) => `<span class="mtl-hour" style="top:${x.y.toFixed(1)}px" aria-hidden="true">${x.label}</span>`).join("")}
      ${scale.folds.map((f) => `<div class="mtl-fold" style="top:${f.y.toFixed(1)}px;height:${f.h}px;right:0"><span aria-hidden="true">☾</span><span>Schlaf ${esc(f.bed)}–${esc(f.wake)}</span><button class="linkbtn" data-act="mtl-showall">Einblenden</button></div>`).join("")}
      ${now !== null ? `<span class="mtl-now" style="top:${scale.y(now).toFixed(1)}px;right:0" aria-hidden="true"></span>` : ""}
      ${barsHtml}
      <svg class="mtl-links" aria-hidden="true">${links}</svg>
      ${stacked.map((x) => `<span class="mtl-dot mtl-dot--${x.kind}" style="top:${x.timeY.toFixed(1)}px" aria-hidden="true"></span>`).join("")}
      ${stacked.map((x) => `<div class="mtl-slot" style="top:${x.y.toFixed(1)}px;left:${MEALS_LEFT}px;right:${lanesW}px" data-swipe="${esc(swipeKey(x))}">${cardHtml(x)}</div>`).join("")}
      ${marks}
      <div class="mtl-handle ${handlePlanned ? "is-planned" : ""}" style="top:${(hy - GRIP_H / 2).toFixed(1)}px;right:0">
        <button type="button" class="mtl-grip" aria-label="Neuer Eintrag um ${handleClock} Uhr – zum Verschieben ziehen"><span class="mtl-time--handle">${handleClock}</span></button>
        <span class="mtl-handle-line" aria-hidden="true"></span>
      </div>
      ${panel}
      ${editHtml}
    </div>
    ${sheet}
    <p class="muted small">Den orangen Knopf an der Achse antippen oder an die passende Uhrzeit ziehen: davor = gegessen, danach = geplant. Mahlzeit nach rechts wischen = bearbeiten, nach links = löschen; Symbol antippen = bearbeiten oder löschen. Grauer Balken = Training; zweimal auf ein geplantes tippen = verschieben, Dauer ändern, löschen. Mit zwei Fingern zoomen.</p>
  </div>`;
}

// ------------------------------------------------------------------ Ziehen mit dem Finger (oder der Maus)

/**
 * Einmal beim Start: Ziehen des Knopfes auf der Zeitachse (während des Ziehens wird nur der Knopf
 * bewegt) und jede halbe Minute den Knopf auf die aktuelle Uhrzeit nachziehen.
 */
export function initTimelineDrag() {
  let g = null;
  const setLabel = (el, minute) => {
    const planned = el.future || (el.now !== null && minute > el.now);
    el.handle.style.top = `${(yAt(el.anchors, minute) - GRIP_H / 2).toFixed(1)}px`;
    el.time.textContent = clockOf(minute);
    el.handle.classList.toggle("is-planned", planned);
  };
  document.addEventListener("pointerdown", (ev) => {
    const grip = ev.target.closest?.(".mtl-grip");
    if (!grip || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    const box = grip.closest(".mtl");
    let anchors = [];
    try {
      anchors = JSON.parse(box.dataset.anchors || "[]").map(([minute, y]) => ({ minute, y }));
    } catch {
      return;
    }
    const handle = grip.closest(".mtl-handle");
    g = {
      grip,
      box,
      anchors,
      handle,
      time: handle.querySelector(".mtl-time--handle"),
      startY: ev.clientY,
      moved: false,
      minute: Number(box.dataset.minute) || 720,
      start: Number(box.dataset.start) || 0,
      now: box.dataset.now === "" ? null : Number(box.dataset.now),
      future: box.dataset.future === "1",
    };
    g.lastY = ev.clientY;
    g.frame = requestAnimationFrame(edgeScroll);
    grip.setPointerCapture?.(ev.pointerId);
    handle.classList.add("is-dragging");
    ev.preventDefault();
  });
  // Knopf an die Höhe des Fingers setzen (auch nach dem Mitscrollen)
  const follow = () => {
    if (!g) return;
    const rect = g.box.getBoundingClientRect();
    const minute = snapMinute(minuteAt(g.anchors, g.lastY - rect.top), 1, g.start);
    if (minute !== g.minute) {
      g.minute = minute;
      setLabel(g, minute);
      if (navigator.vibrate) {
        try {
          navigator.vibrate(5);
        } catch {
          // Vibration nicht verfügbar (z. B. iPhone)
        }
      }
    }
  };
  // am Bildschirmrand läuft die Seite mit, solange der Finger dort bleibt (1.103.0)
  const edgeScroll = () => {
    if (!g) return;
    if (g.moved) {
      const lower = window.innerHeight - 90;
      const upper = 130;
      let dy = 0;
      if (g.lastY > lower) dy = Math.min(22, Math.ceil((g.lastY - lower) / 5) + 3);
      else if (g.lastY < upper) dy = -Math.min(22, Math.ceil((upper - g.lastY) / 5) + 3);
      if (dy) {
        window.scrollBy(0, dy);
        follow();
      }
    }
    g.frame = requestAnimationFrame(edgeScroll);
  };
  document.addEventListener("pointermove", (ev) => {
    if (!g) return;
    g.lastY = ev.clientY;
    if (!g.moved && Math.abs(ev.clientY - g.startY) < 4) return;
    g.moved = true;
    follow();
    ev.preventDefault();
  });
  const end = () => {
    if (!g) return;
    cancelAnimationFrame(g.frame);
    const S = X.S;
    S.mtl = { ...(S.mtl ?? {}), pinned: g.minute, panel: true, key: null };
    g.handle.classList.remove("is-dragging");
    g = null;
    X.rerender();
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  initTrainBars();
  initSwipe();
  initPinch();
  // Knopf folgt der Uhr, solange er nicht gewählt ist und niemand gerade tippt
  setInterval(() => {
    if (g || document.hidden) return;
    const box = document.querySelector(".mtl");
    if (!box || box.dataset.pinned === "1" || X.S.mtl?.panel) return;
    const date = X.S.diaryDate ?? today();
    if (axisNow(date) === Number(box.dataset.minute)) return;
    const a = document.activeElement;
    if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    X.rerender();
  }, 30000);
}

/**
 * Trainingsbalken (1.107.0): zweimal tippen (bzw. Doppelklick) auf eine geplante Einheit öffnet
 * das Bearbeiten; dann zieht der Finger den Balken (verschieben) bzw. seinen unteren Rand (Dauer).
 */
function initTrainBars() {
  let last = null;
  let td = null;
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest?.(".mtl [data-train]");
    if (!el || el.classList.contains("is-editing")) return;
    const key = el.dataset.train;
    const t = Date.now();
    if (last && last.key === key && t - last.t < 450) {
      last = null;
      startTrainEdit(key);
    } else last = { key, t };
  });
  document.addEventListener("pointerdown", (ev) => {
    const bar = ev.target.closest?.(".mtl-train.is-editing");
    const te = X.S.mtlTrain;
    if (!bar || !te || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    const box = bar.closest(".mtl");
    let anchors;
    try {
      anchors = JSON.parse(box.dataset.anchors || "[]").map(([minute, y]) => ({ minute, y }));
    } catch {
      return;
    }
    td = { bar, box, anchors, mode: ev.target.closest(".mtl-train-size") ? "size" : "move", y0: ev.clientY, from: te.from, dur: te.dur, start: Number(box.dataset.start) || 0 };
    try {
      bar.setPointerCapture?.(ev.pointerId);
    } catch {
      // Zeiger schon weg
    }
    ev.preventDefault();
  });
  document.addEventListener("pointermove", (ev) => {
    if (!td) return;
    const te = X.S.mtlTrain;
    if (!te) return;
    const rect = td.box.getBoundingClientRect();
    const delta = minuteAt(td.anchors, ev.clientY - rect.top) - minuteAt(td.anchors, td.y0 - rect.top);
    const step = (m) => Math.round(m / 5) * 5;
    if (td.mode === "move") te.from = Math.max(td.start, Math.min(td.start + DAY - 1 - td.dur, step(td.from + delta)));
    else te.dur = Math.max(10, Math.min(600, step(td.dur + delta)));
    const top = yAt(td.anchors, te.from);
    td.bar.style.top = `${top.toFixed(1)}px`;
    td.bar.style.height = `${Math.max(20, yAt(td.anchors, te.from + te.dur) - top).toFixed(1)}px`;
    ev.preventDefault();
  });
  const end = () => {
    if (!td) return;
    td = null;
    X.rerender();
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}

function startTrainEdit(key) {
  const S = X.S;
  const date = S.diaryDate ?? today();
  const b = (S.mtlBars?.date === date ? S.mtlBars.bars : []).find((x) => x.key === key);
  if (!b || b.kind !== "planned") return;
  releaseHandle();
  S.mtlMenu = null;
  S.mtlTrain = { date, key, from: b.from, dur: b.to - b.from, scope: "day", shift: true, ask: false };
  X.rerender();
  requestAnimationFrame(() => document.querySelector(".mtl-panel--train")?.scrollIntoView({ block: "center", behavior: "smooth" }));
}

/** Formular des Bearbeitens lesen (Uhrzeit, Dauer, Geltung, Mitverschieben). */
function readTrainForm() {
  const S = X.S;
  const te = S.mtlTrain;
  if (!te) return null;
  const start = dayStartMinutesOn(te.date);
  const from = axisMinuteOf(document.getElementById("mtl-tr-from")?.value ?? "", start);
  if (from !== null) te.from = from;
  const dur = Number(document.getElementById("mtl-tr-dur")?.value);
  if (Number.isFinite(dur) && dur > 0) te.dur = Math.max(10, Math.min(600, Math.round(dur)));
  const scope = document.querySelector('input[name="mtl-tr-scope"]:checked')?.value;
  if (scope === "day" || scope === "series") te.scope = scope;
  const shift = document.getElementById("mtl-tr-shift");
  if (shift) te.shift = shift.checked;
  return te;
}

/** Einstellung ändern (mit dem PC abgeglichen), wie Settings am Handy. */
async function putSetting(key, value) {
  const S = X.S;
  S.pcsettings = PS.normSync(S.pcsettings);
  const changed = PS.setSetting(S.pcsettings, key, value, buildDb().settings.get(key) ?? null);
  if (changed) await X.store.set("pcsettings", S.pcsettings);
}

async function persistTrainLocal() {
  await X.store.set("train", X.S.train);
  X.refreshCatalog?.();
}

const isoMinus = (iso, days) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Geplante Einheit speichern bzw. löschen (`del`). */
async function saveTrain(del) {
  const S = X.S;
  const te = readTrainForm();
  if (!te) return;
  const date = te.date;
  const b = (S.mtlBars?.date === date ? S.mtlBars.bars : []).find((x) => x.key === te.key);
  if (!b?.plan) return;
  const db = buildDb();
  const tr = trainingOf(db, date);
  const plan = tr.plans.find((p) => p.id === b.plan.planId);
  const day = plan?.days.find((d) => d.id === b.plan.dayId);
  if (!plan || !day) return X.toast("Der Trainingstag ist nicht mehr im Plan.", true);
  const weekly = b.plan.slot.weekday !== null;
  const keepFrom = isoMinus(today(), 30);
  const all = [...(S.catalog?.exercises ?? []), ...(S.localExercises ?? [])];
  const withSlots = (slots) => ({
    ...plan,
    days: plan.days.map((d) => ({ ...d, slots: d.id === day.id ? slots : d.slots.map((x) => ({ ...x })), exercises: d.exercises.map((e) => ({ ...e })) })),
  });
  const skip = () => putSetting(WT().TRAINING_SKIPS_SETTING, JSON.stringify(WT().addSkip(tr.skips, WT().skipKey(day.id, b.plan.slot, date), keepFrom)));
  try {
    if (del) {
      if (weekly && te.scope === "day") await skip();
      else {
        const next = WT().changedSlots(day.slots, b.plan.slotIndex, date, null, "series");
        TR.savePlan(S.catalogRaw, S.train, withSlots(next.slots), { uuid: X.uuid, now: new Date(), exercises: all });
        await persistTrainLocal();
      }
      S.mtlTrain = null;
      X.toast(weekly && te.scope === "day" ? `Training „${b.title}“ am ${germanDay(date)} ausgelassen.` : `Termin „${b.title}“ aus dem Plan entfernt.`);
      return X.rerender();
    }
    const time = clockOf(te.from);
    if (time !== b.plan.slot.time) {
      const next = WT().changedSlots(day.slots, b.plan.slotIndex, date, time, te.scope);
      TR.savePlan(S.catalogRaw, S.train, withSlots(next.slots), { uuid: X.uuid, now: new Date(), exercises: all });
      await persistTrainLocal();
      if (next.skip) await skip();
    }
    if (te.dur !== b.to - b.from) {
      await putSetting(WT().TRAINING_DURATIONS_SETTING, JSON.stringify(WT().setDuration(tr.durations, day.id, te.dur, !weekly || te.scope === "day" ? date : null, keepFrom)));
    }
    let moved = 0;
    const delta = te.from - b.from;
    if (te.shift && delta) {
      for (const e of WT().linkedEntries(b, S.mtlBars.fuel)) {
        if (e.kind !== "planned" || !e.planId) continue;
        N.movePlanned(S.catalog, S.food.local, e.planId, clockOf(e.minute + delta), new Date());
        moved++;
      }
      if (moved) await persistFood();
    }
    S.mtlTrain = null;
    X.toast(`Training „${b.title}“: ${time}–${clockOf(te.from + te.dur)} Uhr${weekly && te.scope === "series" ? ` (jeden ${WEEKDAY_NAMES[b.plan.slot.weekday]})` : ""}${moved ? ` · ${moved} Workout-Mahlzeit${moved === 1 ? "" : "en"} mitverschoben` : ""}.`);
  } catch (e) {
    X.toast(e.message, true);
  }
  X.rerender();
}

/**
 * Wischen auf einem Eintrag (1.103.0): nach rechts = bearbeiten, nach links = löschen (mit Rückfrage).
 * Waagrecht ab 70 px; senkrechtes Scrollen bleibt unberührt.
 */
function initSwipe() {
  let w = null;
  document.addEventListener("pointerdown", (ev) => {
    const row = ev.target.closest?.(".mtl [data-swipe], [data-mswipe]");
    if (!row || ev.target.closest(".mtl-grip") || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    w = { row, x: ev.clientX, y: ev.clientY, dx: 0, active: false, id: ev.pointerId };
  });
  document.addEventListener("pointermove", (ev) => {
    if (!w || ev.pointerId !== w.id) return;
    const dx = ev.clientX - w.x;
    const dy = ev.clientY - w.y;
    if (!w.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        w = null;
        return;
      }
      if (Math.abs(dx) < 12) return;
      w.active = true;
      try {
        w.row.setPointerCapture?.(ev.pointerId);
      } catch {
        // Zeiger schon weg (z. B. simulierte Eingabe)
      }
      w.row.classList.add("is-swiping");
    }
    w.dx = dx;
    w.row.style.transform = `translateX(${Math.max(-120, Math.min(120, dx))}px)`;
    w.row.classList.toggle("swipe-edit", dx > 70);
    w.row.classList.toggle("swipe-delete", dx < -70);
    ev.preventDefault();
  });
  const end = () => {
    if (!w) return;
    const { row, dx, active } = w;
    w = null;
    if (!active) return;
    row.style.transform = "";
    row.classList.remove("is-swiping", "swipe-edit", "swipe-delete");
    // der Klick nach dem Wischen öffnet nichts
    const stop = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener("click", stop, { capture: true }), 350);
    // Maschine in der Übungsauswahl (1.103.0): nach links oder rechts = ihre Übungen ansehen/anlegen
    if (row.dataset.mswipe) {
      if (Math.abs(dx) > 70) X.go("machine", row.dataset.mswipe);
      return;
    }
    const [kind, id, ...rest] = String(row.dataset.swipe).split("|");
    const label = rest.join("|");
    if (dx > 70) void swipeEdit(kind, id);
    else if (dx < -70) askDelete(kind, id, label);
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}

/** Zoom mit zwei Fingern auf der Zeitachse: Vorschau als Streckung, beim Loslassen neu anordnen. */
function initPinch() {
  let p = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  document.addEventListener(
    "touchstart",
    (ev) => {
      if (ev.touches.length !== 2) return;
      const box = ev.target.closest?.(".mtl");
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const midY = (ev.touches[0].clientY + ev.touches[1].clientY) / 2;
      p = { box, d0: dist(ev.touches), z0: Number(box.dataset.zoom) || 1, ratio: 1, origin: midY - rect.top, mid: midY };
      box.style.transformOrigin = `0 ${p.origin}px`;
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (ev) => {
      if (!p || ev.touches.length !== 2) return;
      ev.preventDefault();
      const z = clampZoom(p.z0 * (dist(ev.touches) / p.d0));
      p.ratio = z / p.z0;
      p.box.style.transform = `scaleY(${p.ratio})`;
    },
    { passive: false },
  );
  const end = () => {
    if (!p) return;
    const { box, z0, ratio, origin, mid } = p;
    p = null;
    box.style.transform = "";
    if (Math.abs(ratio - 1) < 0.02) return;
    setZoom(z0 * ratio);
    X.rerender();
    // die Stelle zwischen den Fingern bleibt stehen
    requestAnimationFrame(() => {
      const nb = document.querySelector(".mtl");
      if (!nb) return;
      const top = nb.getBoundingClientRect().top;
      window.scrollBy(0, top + origin * (X.S.mtlZoom / z0) - mid);
    });
  };
  document.addEventListener("touchend", end);
  document.addEventListener("touchcancel", end);
}

/** Bearbeiten nach Wischen nach rechts. */
async function swipeEdit(kind, id) {
  const fake = { dataset: { arg: id } };
  if (kind === "meal") timelineActions["mtl-open"](fake);
  else if (kind === "planned") timelineActions["mtl-plan-add"](fake);
  else if (kind === "caffeine") {
    diaryCaffeineActions["dcf-edit"](fake);
    requestAnimationFrame(() => document.getElementById("dcf-drink")?.scrollIntoView({ block: "center" }));
  } else if (kind === "supplement") diaryActions["supp-edit"](fake);
  else if (kind === "water") {
    const S = X.S;
    S.mtlMenu = { date: S.diaryDate ?? today(), items: [`water|${id}|Wasser`], edit: id };
    X.rerender();
  }
}

/** Nach Wischen nach links: Rückfrage im Tagesverlauf. */
function askDelete(kind, id, label) {
  const S = X.S;
  let note = "";
  if (kind === "meal") note = "Entfernt die noch nicht an den PC gesendeten Lebensmittel dieser Mahlzeit. Was schon am PC ist, löschst du am PC.";
  S.mtlAsk = { date: S.diaryDate ?? today(), kind, id, label, note };
  X.rerender();
  requestAnimationFrame(() => document.querySelector(".mtl-ask")?.scrollIntoView({ block: "center", behavior: "smooth" }));
}

async function doDelete(a) {
  const S = X.S;
  const date = S.diaryDate ?? today();
  try {
    if (a.kind === "planned") {
      N.deletePlanned(S.catalog, S.food.local, a.id, new Date());
      await persistFood();
    } else if (a.kind === "caffeine") {
      CF.deleteIntake(S.catalog, S.caffeine, a.id);
      await X.store.set("caffeine", S.caffeine);
    } else if (a.kind === "supplement") {
      SP.deleteIntake(buildDb(), S.supp, a.id, new Date());
      await persistSupp();
    } else if (a.kind === "water") {
      P.deleteWaterGlass(buildDb(), S.water, a.id, new Date());
      await X.store.set("water", S.water);
    } else if (a.kind === "meal") {
      const local = S.food.local;
      let removed = 0;
      let kept = 0;
      for (const m of Object.values(local.meals)) {
        if (m.row.date !== date) continue;
        const key = m.row.name ? N.extraKey(m.row.name) : m.row.meal_type;
        if (key !== a.id) continue;
        for (const it of [...m.items]) {
          if (it.sent) kept++;
          else {
            N.removeItem(local, m.row.id, it.id);
            removed++;
          }
        }
      }
      await persistFood();
      if (!removed) {
        X.toast("Diese Mahlzeit ist schon am PC – dort löschen.", true);
        return;
      }
      if (kept) {
        X.toast(`${removed} Lebensmittel entfernt; ${kept} schon gesendete bleiben (am PC löschen).`);
        return;
      }
    }
    X.toast(`„${a.label}“ gelöscht.`);
  } catch (e) {
    X.toast(e.message, true);
  }
}

/** Fenster schließen: Knopf springt zurück auf die aktuelle Uhrzeit. */
function releaseHandle() {
  const S = X.S;
  if (S.mtl) {
    S.mtl.panel = false;
    S.mtl.pinned = null;
  }
}

// ------------------------------------------------------------------ Aktionen

async function persistFood() {
  try {
    await X.store.set("nutrition", X.S.food.local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

export const timelineActions = {
  "mtl-hint": (el) => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const [m, ...name] = String(el.dataset.arg).split("|");
    S.mtlTrain = null;
    S.mtlMenu = null;
    S.mtl = { date, pinned: snapMinute(Number(m), 1, dayStartMinutesOn(date)), panel: true, key: N.extraKey(name.join("|")) };
    X.rerender();
    requestAnimationFrame(() => document.querySelector(".mtl-panel")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  },
  // Hinweise zu einem Training ausblenden; beim nächsten Training wieder (1.110.0)
  "mtl-hint-off": async (el) => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const b = (S.mtlBars?.date === date ? S.mtlBars.bars : []).find((x) => x.key === el.dataset.arg);
    if (!b) return;
    const db = buildDb();
    const list = WT().parseSkips(db.settings?.get?.(WT().HINTS_OFF_SETTING) ?? null);
    await putSetting(WT().HINTS_OFF_SETTING, JSON.stringify(WT().addHintOff(list, WT().hintOffKey(date, b), isoMinus(date, 60))));
    X.toast(`Hinweise zu „${b.title}“ ausgeblendet`);
    X.rerender();
  },
  "mtl-tr-cancel": () => {
    X.S.mtlTrain = null;
    X.rerender();
  },
  "mtl-tr-ask": (el) => {
    const te = readTrainForm();
    if (te) te.ask = el.dataset.arg === "1";
    X.rerender();
  },
  "mtl-tr-save": () => saveTrain(false),
  "mtl-tr-del": () => saveTrain(true),
  "mtl-showall": () => {
    X.S.mtlShowAll = X.S.diaryDate ?? today();
    X.rerender();
  },
  "mtl-hidesleep": () => {
    X.S.mtlShowAll = null;
    X.rerender();
  },
  "mtl-now": () => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    S.mtl = { date, pinned: null, panel: true, key: null };
    S.mtlMenu = null;
    X.rerender();
    // „Jetzt eintragen“ (1.129.0, wie PC 1.0.203): Tagesverlauf auf die aktuelle Uhrzeit (sonst den Griff) zentrieren
    requestAnimationFrame(() => (document.querySelector(".mtl .mtl-now") ?? document.querySelector(".mtl .mtl-handle"))?.scrollIntoView({ block: "center", behavior: "smooth" }));
  },
  "mtl-menu": (el) => {
    const S = X.S;
    S.mtlMenu = { date: S.diaryDate ?? today(), items: String(el.dataset.arg || "").split("\n").filter(Boolean), edit: null };
    X.rerender();
  },
  "mtl-menu-close": () => {
    X.S.mtlMenu = null;
    X.rerender();
  },
  "mtl-menu-edit": (el) => {
    if (X.S.mtlMenu) X.S.mtlMenu.edit = el.dataset.arg || null;
    X.rerender();
    requestAnimationFrame(() => document.getElementById("mtl-water-time")?.focus());
  },
  "mtl-menu-go": (el) => {
    const [kind, id] = String(el.dataset.arg).split("|");
    X.S.mtlMenu = null;
    void swipeEdit(kind, id);
  },
  "mtl-menu-del": (el) => {
    const [kind, id, ...rest] = String(el.dataset.arg).split("|");
    X.S.mtlMenu = null;
    askDelete(kind, id, rest.join("|"));
  },
  "mtl-water-save": async (el) => {
    const S = X.S;
    const time = document.getElementById("mtl-water-time")?.value ?? "";
    try {
      P.moveWaterGlass(buildDb(), S.water, el.dataset.arg, time, new Date());
      await X.store.set("water", S.water);
      S.mtlMenu = null;
      X.toast(`Glas Wasser auf ${time} Uhr verschoben.`);
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
  "mtl-zoom": (el) => {
    setZoom(zoomNow() * Number(el.dataset.arg || 1));
    X.rerender();
  },
  "mtl-ask-no": () => {
    X.S.mtlAsk = null;
    X.rerender();
  },
  "mtl-ask-yes": async () => {
    const a = X.S.mtlAsk;
    X.S.mtlAsk = null;
    if (a) await doDelete(a);
    X.rerender();
  },
  "meals-view": (el) => {
    X.S.mealsView = el.dataset.arg === "list" ? "list" : "timeline";
    try {
      localStorage.setItem("lifespan.mealsView", X.S.mealsView);
    } catch {
      // ohne Speicher gilt die Wahl bis zum Neustart
    }
    X.rerender();
  },
  "mtl-close": () => {
    releaseHandle();
    X.rerender();
  },
  "mtl-open": (el) => {
    const key = el.dataset.arg;
    X.S.mealsView = "list";
    X.S.mealOpen = { ...(X.S.mealOpen ?? {}), [key]: true };
    X.S.diaryFocus = key;
    X.rerender();
    requestAnimationFrame(() => document.querySelector(`[data-meal-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "start" }));
  },
  "mtl-key": (el) => {
    if (X.S.mtl) X.S.mtl.key = el.dataset.arg;
    X.rerender();
  },
  "mtl-add": (el) => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const minute = handleMinute(date);
    const planned = plannedAt(date, minute);
    const f = S.food;
    f.mealType = el.dataset.arg;
    f.trackDate = date;
    f.returnTo = "diary";
    f.planAt = planned ? clockOf(minute) : null;
    f.planId = null;
    f.time = planned ? "" : clockOf(minute);
    f.dishTime = f.time;
    releaseHandle();
    X.go("food");
  },
  // Supplement zu dieser Uhrzeit (1.122.0, wie PC 1.0.198): Einnahme „unabhängig“ mit Uhrzeit
  "mtl-supp": () => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const time = clockOf(handleMinute(date));
    releaseHandle();
    S.suppEdit = { draft: SP.emptyDraft(date, "independent", time), query: "", error: null };
    S.fromTimeline = true;
    X.go("supp-intake");
  },
  "mtl-caffeine": () => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const time = clockOf(handleMinute(date));
    releaseHandle();
    S.diaryCf = { id: null, date, drinkId: "espresso", amount: "30", time, errors: {} };
    S.fromTimeline = true;
    X.rerender();
    requestAnimationFrame(() => document.getElementById("dcf-drink")?.scrollIntoView({ block: "center" }));
  },
  "mtl-confirm": async (el) => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const plan = N.plannedOn(S.catalog, S.food.local, date).find((p) => p.id === el.dataset.arg);
    if (!plan) return;
    const now = date === today() ? axisNow(date) : null;
    // früher gegessen als geplant: Uhrzeit = jetzt
    const time = now !== null && now < (axisMinuteOf(plan.time, dayStartMinutesOn(date)) ?? 0) ? clockOf(now) : plan.time;
    try {
      N.confirmPlanned(S.catalog, S.food.local, plan.id, { time, uuid: () => X.uuid(), now: new Date() });
      await persistFood();
      X.toast(`${N.mealLabel(plan.key)} als gegessen eingetragen (${time} Uhr).`);
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
  "mtl-plan-add": (el) => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const plan = N.plannedOn(S.catalog, S.food.local, date).find((p) => p.id === el.dataset.arg);
    if (!plan) return;
    const f = S.food;
    f.mealType = plan.key;
    f.trackDate = date;
    f.returnTo = "diary";
    f.planAt = plan.time;
    f.planId = plan.id;
    X.go("food");
  },
  "mtl-plan-move": async (el) => {
    const S = X.S;
    try {
      N.movePlanned(S.catalog, S.food.local, el.dataset.arg, clockOf(handleMinute(S.diaryDate ?? today())), new Date());
      releaseHandle();
      await persistFood();
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
  "mtl-plan-del": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: löschen")) return;
    N.deletePlanned(X.S.catalog, X.S.food.local, el.dataset.arg, new Date());
    await persistFood();
    X.rerender();
  },
};

/** Auswahl der Mahlzeit im Fenster des Knopfes; true = behandelt. */
export function timelineChange(el) {
  if (el.dataset?.diary === "mtl-tr") {
    readTrainForm();
    X.rerender();
    return true;
  }
  if (el.dataset?.diary !== "mtl-key") return false;
  if (X.S.mtl) X.S.mtl.key = el.value;
  X.rerender();
  return true;
}

