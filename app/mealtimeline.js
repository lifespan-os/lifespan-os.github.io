// LIFESPAN OS Mobil – Tagebuch → Mahlzeiten als Tagesverlauf (1.100.0, wie PC 1.0.175).
// Mahlzeiten, geplante Mahlzeiten, Koffein, Supplements und Wasser auf einer senkrechten Zeitachse.
// Der orange Knopf lässt sich mit dem Finger an jede Uhrzeit ziehen: davor = gegessen eintragen,
// danach = planen. Anordnung wie `src/domain/mealTimeline.ts` am PC.
// 1.102.0 (wie PC 1.0.176, Wunsch 22.11.2026): Achse immer vom Tageswechsel (Settings) bis eine
// Minute davor; Uhrzeiten vor dem Tageswechsel zählen über 24:00 hinaus (`axisMinute`). Der Knopf
// steht immer auf der aktuellen Uhrzeit (an anderen Tagen auf derselben Uhrzeit) und rastet
// minutengenau ein; über einer Karte bleibt die Uhrzeit stehen, dazwischen ist Platz für jede Minute.

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
export function stackLane(list, { pxPerMin = 1, gap = 6, dayStart = 0 } = {}) {
  const clamp = (m) => Math.max(dayStart, Math.min(dayStart + DAY - 1, m));
  const sorted = [...list].sort((a, b) => a.minute - b.minute || String(a.key).localeCompare(String(b.key)));
  let bottom = -Infinity;
  return sorted.map((e) => {
    const timeY = (clamp(e.minute) - dayStart) * pxPerMin;
    const y = Math.max(timeY, bottom);
    bottom = y + e.height + gap;
    return { ...e, y, timeY, shifted: y > timeY + 0.5 };
  });
}

/** Symbolspalte: Einträge weniger als `span` px nach dem ersten einer Gruppe bilden ein Symbol. */
export function clusterLane(list, { pxPerMin = 1, span = 30, dayStart = 0 } = {}) {
  const sorted = [...list].sort((a, b) => a.minute - b.minute || String(a.key).localeCompare(String(b.key)));
  const out = [];
  for (const e of sorted) {
    const y = (Math.max(dayStart, e.minute) - dayStart) * pxPerMin;
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
  const zoom = zoomNow();
  const px = PX * zoom;
  // Breite der Achse: gemessen an der bisherigen Ansicht, sonst geschätzt
  const measured = document.querySelector(".mtl")?.clientWidth ?? 0;
  const width = Math.max(280, measured > 0 ? measured : Math.min(window.innerWidth || 390, 760) - 40);
  const mealsW = Math.max(130, Math.min(560, width - MEALS_LEFT - 2 * ICON_W - CAF_W - 3 * LANE_GAP));
  const laneLeft = {
    supplement: MEALS_LEFT + mealsW + LANE_GAP,
    water: MEALS_LEFT + mealsW + 2 * LANE_GAP + ICON_W,
    caffeine: MEALS_LEFT + mealsW + 3 * LANE_GAP + 2 * ICON_W,
  };
  const laneW = { supplement: ICON_W, water: ICON_W, caffeine: CAF_W };
  const right = laneLeft.caffeine + CAF_W;
  const stacked = stackLane(meals, { pxPerMin: px, gap: 6, dayStart });
  const clusters = Object.fromEntries(LANES.map((l) => [l, clusterLane(icons[l], { pxPerMin: px, span: MARK_H + 4, dayStart })]));
  const hours = hourMarks(dayStart, px);
  const endY = (DAY - 1) * px;
  const hy = (hMinute - dayStart) * px;
  const handlePlanned = plannedAt(date, hMinute);
  const handleClock = clockOf(hMinute);
  const height = Math.ceil(Math.max(endY, ...stacked.map((x) => x.y + x.height)) + 16);
  // Stützpunkte für das Ziehen (linear: Anfang und Ende)
  const anchors = [
    [dayStart, 0],
    [dayStart + DAY - 1, Math.round(endY * 10) / 10],
  ];
  // Mahlzeit, in die der Knopf einträgt: Vorschlag nach Uhrzeit, änderbar
  const options = slots.map((s) => ({ key: s.ref.name ? N.extraKey(s.ref.name) : s.ref.mealType, title: s.title, type: s.ref.mealType }));
  const suggested = options.find((o) => o.type === mealTypeAt(hMinute))?.key ?? options[0]?.key ?? "";
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
        return `<button type="button" class="mtl-mark mtl-mark--${lane}" style="top:${Math.max(0, c.y - MARK_H / 2).toFixed(1)}px;left:${laneLeft[lane] + 2}px;max-width:${laneW[lane] - 4}px" data-act="mtl-menu" data-arg="${esc(c.items.map((e) => swipeKey(e)).join("\n"))}" aria-label="${esc(label)}"><span aria-hidden="true">${LANE_ICON[lane]}</span>${lane === "caffeine" ? `<span class="mtl-mg">${Math.round(mg)}</span>` : ""}${count > 1 ? `<span class="mtl-badge">${count}</span>` : ""}</button>`;
      })
      .join(""),
  ).join("");
  const ask = S.mtlAsk && S.mtlAsk.date === date ? S.mtlAsk : null;
  const menu = S.mtlMenu && S.mtlMenu.date === date ? S.mtlMenu : null;

  const panel =
    h.panel && options.length
      ? `<div class="mtl-panel" style="top:${(hy + GRIP_H / 2 + 6).toFixed(1)}px" role="dialog" aria-label="Neuer Eintrag">
      <b>${esc(chosenTitle)} · ${handleClock} Uhr · ${handlePlanned ? "geplant" : "gegessen"}</b>
      <label class="field"><span>Mahlzeit</span><select data-diary="mtl-key">${options.map((o) => `<option value="${esc(o.key)}" ${o.key === chosen ? "selected" : ""}>${esc(o.title)}</option>`).join("")}</select></label>
      <span class="muted small">${handlePlanned ? "Zählt erst, wenn du sie mit „Gegessen“ bestätigst." : "Wird mit dieser Uhrzeit ins Tagebuch eingetragen."}</span>
      <div class="row"><button class="btn sm primary" data-act="mtl-add" data-arg="${esc(chosen)}">+ Lebensmittel</button>${
        handlePlanned ? "" : `<button class="btn sm" data-act="mtl-caffeine">Koffein</button>`
      }<button class="btn sm ghost" data-act="mtl-close">Abbrechen</button></div></div>`
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
    <div class="mtl-tools"><button class="btn sm primary" data-act="mtl-now">＋ ${future ? "Planen" : "Jetzt eintragen"}</button><span class="spacer"></span><span class="muted small">${Math.round(zoom * 100)} %</span><button class="btn sm ghost" data-act="mtl-zoom" data-arg="0.8" aria-label="Verkleinern">−</button><button class="btn sm ghost" data-act="mtl-zoom" data-arg="1.25" aria-label="Vergrößern">+</button></div>
    ${
      ask
        ? `<div class="mtl-ask" role="alertdialog" aria-label="Löschen bestätigen"><b>„${esc(ask.label)}“ löschen?</b>${ask.note ? `<span class="muted small">${esc(ask.note)}</span>` : ""}<div class="row"><button class="btn sm danger" data-act="mtl-ask-yes">Löschen</button><button class="btn sm ghost" data-act="mtl-ask-no">Abbrechen</button></div></div>`
        : ""
    }
    <div class="mtl-heads" style="width:${right}px"><span class="mtl-head" style="left:${MEALS_LEFT}px">Mahlzeiten</span>${LANES.map((l) => `<span class="mtl-head mtl-head--icon" style="left:${laneLeft[l]}px;width:${laneW[l]}px" aria-label="${LANE_LABEL[l]}">${LANE_ICON[l]}</span>`).join("")}</div>
    <div class="mtl" style="height:${height}px" data-anchors="${esc(JSON.stringify(anchors))}" data-now="${now ?? ""}" data-future="${future ? 1 : 0}" data-start="${dayStart}" data-minute="${hMinute}" data-pinned="${h.pinned === null ? "" : 1}" data-zoom="${zoom}">
      ${LANES.map((l) => `<span class="mtl-lane" style="left:${laneLeft[l]}px;width:${laneW[l]}px" aria-hidden="true"></span>`).join("")}
      ${hours.map((x) => `<span class="mtl-hourline" style="top:${x.y.toFixed(1)}px;width:${right - AXIS_X}px" aria-hidden="true"></span>`).join("")}
      <span class="mtl-axis" aria-hidden="true"></span>
      ${hours.filter((x) => Math.abs(x.y - hy) >= 16).map((x) => `<span class="mtl-hour" style="top:${x.y.toFixed(1)}px" aria-hidden="true">${x.label}</span>`).join("")}
      ${now !== null ? `<span class="mtl-now" style="top:${((now - dayStart) * px).toFixed(1)}px;width:${right - AXIS_X}px" aria-hidden="true"></span>` : ""}
      <svg class="mtl-links" aria-hidden="true">${links}</svg>
      ${stacked.map((x) => `<span class="mtl-dot mtl-dot--${x.kind}" style="top:${x.timeY.toFixed(1)}px" aria-hidden="true"></span>`).join("")}
      ${stacked.map((x) => `<div class="mtl-slot" style="top:${x.y.toFixed(1)}px;left:${MEALS_LEFT}px;width:${mealsW}px" data-swipe="${esc(swipeKey(x))}">${cardHtml(x)}</div>`).join("")}
      ${marks}
      <div class="mtl-handle ${handlePlanned ? "is-planned" : ""}" style="top:${(hy - GRIP_H / 2).toFixed(1)}px;width:${right}px">
        <button type="button" class="mtl-grip" aria-label="Neuer Eintrag um ${handleClock} Uhr – zum Verschieben ziehen"><span class="mtl-time--handle">${handleClock}</span></button>
        <span class="mtl-handle-line" aria-hidden="true"></span>
      </div>
      ${panel}
    </div>
    ${sheet}
    <p class="muted small">Den orangen Knopf an der Achse antippen oder an die passende Uhrzeit ziehen: davor = gegessen, danach = geplant. Mahlzeit nach rechts wischen = bearbeiten, nach links = löschen; Symbol antippen = bearbeiten oder löschen. Mit zwei Fingern zoomen.</p>
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
  "mtl-now": () => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    S.mtl = { date, pinned: null, panel: true, key: null };
    S.mtlMenu = null;
    X.rerender();
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
  "mtl-caffeine": () => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const time = clockOf(handleMinute(date));
    releaseHandle();
    S.diaryCf = { id: null, date, drinkId: "espresso", amount: "30", time, errors: {} };
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
  if (el.dataset?.diary !== "mtl-key") return false;
  if (X.S.mtl) X.S.mtl.key = el.value;
  X.rerender();
  return true;
}

