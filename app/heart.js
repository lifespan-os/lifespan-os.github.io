// LIFESPAN OS Mobil – Health → Heart und Sleep → Gemessene Nächte (1.42.0, erweitert 1.43.0 und 1.44.0), gleiche
// Inhalte und Rechnungen wie am PC (HeartTab.tsx, MeasuredSleepCard.tsx, RecoveryTodayCard.tsx,
// BiosensingCard.tsx, WatchLoadCard.tsx, WatchAssociationsCard.tsx; Rechnungen in wearabledata.js aus
// src/domain/wearable.ts und wearableMore.ts). Daten aus dem PC-Export: heart_rate_day, wearable_sleep,
// wearable_recovery, wearable_exercise, wearable_day, wearable_sleepwise, wearable_biosensing (am PC
// über Settings → Polar synchronisiert); Tageskontext aus caffeine_intake, meal, supplement_intake.

import * as D from "./pcdomain.js";
import * as W from "./wearabledata.js";
import { buildDb, today } from "./diary.js";
import { COLOR, esc, trendSvg } from "./pcview.js";
import { heartOn } from "./trainingstats.js";
import { watchAdoptHtml } from "./watchparity.js";

const DAY_MS = 86400000;
const shift = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const num = (v, d = 0) => (v === null || v === undefined ? "–" : D.formatNumber(v, d));
const dur = (min) => (min === null || min === undefined || !Number.isFinite(min) ? "–" : D.formatDuration(min));
const note = (t) => `<p class="card__note">${t}</p>`;

/** Zeilen aus dem PC-Export (snake_case) → Felder wie am PC (camelCase). */
const camel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));

function rows(catalog, table) {
  return (catalog?.pc?.[table] ?? []).map(camel);
}

/** Alles Gemessene aus dem Export (Herzfrequenz mit Einzelwerten). */
export function wearableOf(catalog) {
  const heart = rows(catalog, "heart_rate_day").map((h) => {
    let samples = [];
    try {
      samples = typeof h.samples === "string" ? JSON.parse(h.samples) : h.samples ?? [];
    } catch {
      samples = [];
    }
    return { ...h, samples };
  });
  const sort = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return {
    heart: heart.sort(sort),
    sleep: rows(catalog, "wearable_sleep").sort(sort),
    recovery: rows(catalog, "wearable_recovery").sort(sort),
    exercises: rows(catalog, "wearable_exercise").sort(sort),
    days: rows(catalog, "wearable_day").sort(sort),
    sleepwise: rows(catalog, "wearable_sleepwise").sort(sort),
    biosensing: rows(catalog, "wearable_biosensing").sort(sort),
    context: contextOf(catalog),
  };
}

/** Tageskontext wie `wearable_data::day_context` am PC (Koffein, letzte Mahlzeit, Supplements). */
function contextOf(catalog) {
  const pc = catalog?.pc ?? {};
  const days = new Map();
  const day = (date) => {
    if (!days.has(date)) days.set(date, { date, caffeineMg: null, caffeineLast: null, mealLast: null, supplements: [] });
    return days.get(date);
  };
  for (const c of pc.caffeine_intake ?? []) {
    if (!c.date || typeof c.mg !== "number") continue;
    const d = day(c.date);
    d.caffeineMg = (d.caffeineMg ?? 0) + c.mg;
    if (c.time && (!d.caffeineLast || c.time > d.caffeineLast)) d.caffeineLast = c.time;
  }
  for (const m of pc.meal ?? []) {
    if (!m.date || !m.time) continue;
    const d = day(m.date);
    if (!d.mealLast || m.time > d.mealLast) d.mealLast = m.time;
  }
  for (const i of pc.supplement_intake ?? []) {
    const name = (i.name ?? "").trim();
    if (!i.date || !name) continue;
    const d = day(i.date);
    if (!d.supplements.includes(name)) d.supplements.push(name);
  }
  for (const d of days.values()) d.supplements.sort();
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Seit 1.44.0 „±0“ statt „−0“, wenn der gerundete Unterschied null ist
const signed = (v, d = 0) => (v === null || v === undefined ? "–" : W.signedText(v, d));

/** Gemessene Erholung der letzten Nacht gegen den eigenen Durchschnitt (wie RecoveryTodayCard). */
export function recoveryTodayHtml(w, day) {
  const rows_ = W.recoveryToday(w, day);
  const labels = W.polarDayLabels(w, day);
  if (rows_.every((r) => r.today === null) && !labels.length) return "";
  // Heute noch ohne Messung der Nacht: nicht „–“ oder 0 zeigen (wie PC 1.0.192)
  const pending = day === today();
  return `<section class="card"><div class="wo-head"><h3>Gemessene Erholung heute</h3></div>
    <ul class="list">${rows_
      .map((r) => {
        const diff =
          r.today === null
            ? ""
            : r.difference === null
            ? r.baselineCount < 5
              ? `Vergleich ab 5 Tagen (bisher ${r.baselineCount})`
              : ""
            : `${signed(r.difference, r.digits)} ${r.unit}${r.baseline ? ` (${signed((r.difference / r.baseline) * 100)} %)` : ""}`;
        return `<li class="meal-item"><span>${esc(r.label)}<br><span class="muted small">Ø 28 Tage davor: ${r.baseline !== null ? `${num(r.baseline, r.digits)} ${r.unit}` : "–"}${diff ? ` · ${diff}` : ""}</span></span><strong>${r.today !== null ? `${num(r.today, r.digits)} ${r.unit}` : pending ? '<span class="muted small">noch nicht synchronisiert</span>' : "–"}</strong></li>`;
      })
      .join("")}</ul>
    ${labels.length ? `<p class="muted small">${labels.map((l) => `${esc(l.label)}: <strong>${esc(l.value)}</strong>`).join(" · ")}</p>` : ""}
    ${note("Nur Messwerte deiner Uhr und der Vergleich mit deinem eigenen Durchschnitt – keine Bewertung durch LIFESPAN OS. Einstufungen in Worten stammen von Polar.")}
  </section>`;
}

/** Herzfrequenz eines Trainings (Sekunde, bpm) als kleine Linie. */
function exerciseSvg(points) {
  if (points.length < 2) return "";
  const Wd = 340;
  const H = 120;
  const L = 34;
  const R = 6;
  const T = 8;
  const B = 18;
  const lo = Math.min(...points.map((p) => p.bpm)) - 5;
  let hi = Math.max(...points.map((p) => p.bpm)) + 5;
  if (hi === lo) hi += 1;
  const end = points[points.length - 1].second || 1;
  const x = (sec) => L + (sec / end) * (Wd - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = points.map((p) => `${x(p.second).toFixed(1)},${y(p.bpm).toFixed(1)}`).join(" ");
  return `<svg class="pc-chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Herzfrequenz im Training">
    ${[lo + 5, hi - 5].map((v) => `<line x1="${L}" x2="${Wd - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${num(v)}</text>`).join("")}
    <polyline points="${line}" fill="none" stroke="${COLOR.training}" stroke-width="1.5" stroke-linejoin="round"/>
    <text x="${L}" y="${H - 4}">0 min</text><text x="${Wd - R}" y="${H - 4}" text-anchor="end">${num(end / 60)} min</text>
  </svg>`;
}

const ZONE_COLOR = ["#6fa8dc", "#57bb8a", "#f1c232", "#e69138", "#cc4125"];

function exerciseItem(e) {
  const zones = W.exerciseZones(e.zones);
  const hr = W.exerciseHr(e.hrSamples);
  const total = zones.reduce((a, z) => a + z.seconds, 0);
  const facts = [
    e.device && `Gerät: ${e.device}`,
    e.trainingLoad != null && `Trainingsbelastung ${num(e.trainingLoad)}`,
    e.cardioLoad != null && `Cardio Load ${num(e.cardioLoad)}`,
    e.muscleLoad != null && `Muskelbelastung ${num(e.muscleLoad)}`,
    e.distanceM != null && e.distanceM > 0 && `${num(e.distanceM / 1000, 2)} km`,
    e.calories != null && `${num(e.calories)} kcal`,
    e.rrRmssd != null && `HRV im Training (RMSSD) ${num(e.rrRmssd)} ms`,
    e.workoutId && "als Trainingseinheit übernommen",
  ].filter(Boolean);
  return `<li><details class="watch-ex"><summary class="meal-item"><span><b>${esc(W.sportLabel(e.sport, e.detailedSport))}</b><br><span class="muted small">${esc(D.formatDate(e.date))}${e.startTime && e.startTime.length >= 16 ? `, ${esc(e.startTime.slice(11, 16))} Uhr` : ""} · ${dur(e.durationS != null ? e.durationS / 60 : null)}</span></span><span class="muted small">Ø ${num(e.hrAvg)} / max ${num(e.hrMax)}</span></summary>
    ${exerciseSvg(hr)}
    ${
      zones.length && total > 0
        ? `<div class="goal-bar goal-bar--energy" role="img" aria-label="Zeit in den Zonen">${zones
            .map((z) => `<span class="goal-bar__fill" style="width:${((z.seconds / total) * 100).toFixed(1)}%;background:${ZONE_COLOR[Math.min(5, Math.max(1, z.zone)) - 1]}"></span>`)
            .join("")}</div><p class="muted small">${zones
            .map((z) => `Zone ${z.zone}: ${Math.floor(z.seconds / 60)}:${String(Math.round(z.seconds % 60)).padStart(2, "0")} min (${num((z.seconds / total) * 100)} %)`)
            .join(" · ")}</p>`
        : ""
    }
    <p class="muted small">${facts.length ? esc(facts.join(" · ")) : "Keine weiteren Angaben der Uhr."}</p>
    ${watchAdoptHtml(e)}
  </details></li>`;
}

/** Belastung laut Uhr (wie WatchLoadCard am PC). */
function loadHtml(w, from) {
  const points = W.loadSeries(w.days).filter((p) => p.date >= from);
  if (!points.length) return "";
  const last = points[points.length - 1];
  const loads = points.filter((p) => p.load !== null).map((p) => ({ date: p.date, value: p.load }));
  return `<section class="card"><div class="wo-head"><h3>Belastung laut Uhr</h3></div>
    <div class="stat">
      <div><b>${num(last.strain, 1)}</b><span>kurzfristige Belastung</span></div>
      <div><b>${num(last.tolerance, 1)}</b><span>Belastbarkeit</span></div>
      <div><b>${num(last.ratio, 2)}</b><span>Verhältnis</span></div>
    </div>
    ${last.status && last.status !== "LOAD_STATUS_NOT_AVAILABLE" ? `<p class="muted small">Status laut Polar (${esc(D.formatDate(last.date))}): <strong>${esc(W.polarLabel(last.status))}</strong></p>` : ""}
    ${loads.length > 1 ? trendSvg(loads, { color: COLOR.training, decimals: 0, height: 150, label: "Cardio Load je Tag" }) : ""}
    ${note("Rechenwerte von Polar aus der Herzfrequenz deiner Trainings. Verhältnis = kurzfristige Belastung ÷ Belastbarkeit.")}
  </section>`;
}

/** Temperatur, SpO2 und EKG (wie BiosensingCard am PC). */
function biosensingHtml(list) {
  if (!list.length) {
    return `<section class="card"><div class="wo-head"><h3>Temperatur, SpO2 und EKG</h3></div><p class="muted small">Noch keine Messungen. Diese Werte liefern nur Polar-Uhren mit Elixir-Sensoren (z. B. Grit X2 Pro, Vantage V3); sie erscheinen nach dem Synchronisieren am PC und dem nächsten Export.</p></section>`;
  }
  const when = (b) => `${D.formatDate(b.date)}${b.measuredAt && b.measuredAt.length >= 16 ? `, ${b.measuredAt.slice(11, 16)} Uhr` : ""}`;
  const skin = W.biosensingOf(list, "skin_temp");
  const items = [
    ...[...skin].reverse().map((b) => [`Hauttemperatur im Schlaf`, when(b), `${num(b.value, 1)} °C${b.value2 !== null ? ` (${signed(b.value2, 1)} °C)` : ""}`]),
    ...W.biosensingOf(list, "body_temp").reverse().map((b) => [`Temperaturverlauf (${W.polarLabel(b.status) ?? "–"})`, when(b), `Ø ${num(b.value, 2)} °C`]),
    ...W.biosensingOf(list, "spo2").reverse().map((b) => [`SpO2-Test${b.status ? ` · ${W.polarLabel(b.status)}` : ""}`, when(b), `${num(b.value)} %`]),
    ...W.biosensingOf(list, "ecg").reverse().map((b) => [`EKG-Test · HRV ${num(b.value2)} ms${b.status ? ` (${W.polarLabel(b.status)})` : ""}`, when(b), `${num(b.value)} /min`]),
  ];
  const dev = skin.filter((s) => s.value2 !== null).map((s) => ({ date: s.date, value: s.value2 }));
  return `<section class="card"><div class="wo-head"><h3>Temperatur, SpO2 und EKG</h3></div>
    ${dev.length > 1 ? trendSvg(dev, { color: COLOR.body, decimals: 1, height: 150, label: "Abweichung der Hauttemperatur vom Ausgangswert" }) : ""}
    <ul class="list">${items.slice(0, 40).map(([a, b, c]) => `<li class="meal-item"><span>${esc(a)}<br><span class="muted small">${esc(b)}</span></span><strong>${esc(c)}</strong></li>`).join("")}</ul>
    ${note("Messungen der Elixir-Sensoren der Uhr; Einstufungen stammen von Polar. Keine Diagnose.")}
  </section>`;
}

/** Tag und folgende Nacht (wie WatchAssociationsCard am PC, ohne Trainings- und Ernährungssummen). */
export function associationsHtml(w) {
  const targets = W.nightTargets(w);
  const nights = targets.reduce((a, t) => Math.max(a, t.series.length), 0);
  if (!nights) return "";
  const findings = W.nightAssociations(W.daySources(w.context, w.days), targets);
  const clear = findings.filter((f) => f.association.r !== null && Math.abs(f.association.r) >= 0.3);
  const supp = W.supplementComparisons(w.context, targets).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  return `<section class="card"><div class="wo-head"><h3>Tag und folgende Nacht</h3></div>
    ${
      !findings.length
        ? `<p class="muted small">Noch zu wenige gemeinsame Tage (mindestens 10 Tage mit eigener Angabe und gemessener Nacht danach).</p>`
        : clear.length
          ? `<ul class="list">${clear.slice(0, 6).map((f) => `<li class="muted small">${esc(f.association.text)}</li>`).join("")}</ul>`
          : `<p class="muted small">Bisher kein deutlicher Zusammenhang erkennbar (${findings.length} Vergleiche geprüft).</p>`
    }
    ${
      supp.length
        ? `<h4 class="logs-sub">Nächte nach Tagen mit und ohne Supplement</h4><ul class="list">${supp
            .slice(0, 8)
            .map((s) => `<li class="meal-item"><span>${esc(s.name)}<br><span class="muted small">${esc(s.target)}: mit ${num(s.withMean, 1)} (${s.withCount}) · ohne ${num(s.withoutMean, 1)} (${s.withoutCount})</span></span><strong>${signed(s.difference, 1)}</strong></li>`)
            .join("")}</ul>`
        : ""
    }
    ${note("Angaben eines Tages neben den Messungen der Uhr in der Nacht danach. Beobachtungen, keine Ursachen. Am PC zusätzlich mit Trainingsdauer und gegessener Energie.")}
  </section>`;
}

export function hasWearable(catalog) {
  const w = wearableOf(catalog);
  return w.heart.length + w.sleep.length + w.recovery.length > 0;
}

function compare(r, unit, digits = 0) {
  if (r.recent === null) return `<p class="muted small">In den letzten 7 Tagen keine Werte.</p>`;
  return `<p class="muted small">Letzte 7 Tage: Ø ${num(r.recent, digits)} ${unit} (${r.recentCount} Werte)${
    r.baseline !== null ? ` · 28 Tage davor: Ø ${num(r.baseline, digits)} ${unit} (${r.baselineCount} Werte)` : ""
  }${r.difference !== null ? ` · Unterschied ${signed(r.difference, digits)} ${unit}` : ""}. Vergleich nur mit deinem eigenen Verlauf (ab 3 Werten je Zeitraum).</p>`;
}

/**
 * Herzfrequenz und Schritte eines Tages auf einem 24-Stunden-Zeitstrahl (wie DayTimelineChart am PC,
 * seit 1.44.0): Schritte als Säulen je 5 Minuten (rechte Achse), Herzfrequenz als Linie (linke Achse).
 * `hide` = { hr, steps } blendet Ebenen aus.
 */
function timelineSvg(samples, stepSamples, hide = {}) {
  const rows_ = W.dayTimeline(samples ?? [], W.stepSeries(stepSamples ?? null));
  const hrPts = rows_.filter((p) => p.hr !== null);
  const stepPts = rows_.filter((p) => p.steps !== null && p.steps > 0);
  const showHr = !hide.hr && hrPts.length >= 2;
  const showSteps = !hide.steps && stepPts.length > 0;
  if (!showHr && !showSteps) return "";
  const Wd = 340;
  const H = 180;
  const L = 34;
  const R = showSteps ? 34 : 6;
  const T = 8;
  const B = 20;
  const x = (m) => L + (m / 1440) * (Wd - L - R);
  let lo = showHr ? Math.min(...hrPts.map((p) => p.hr)) - 5 : 0;
  let hi = showHr ? Math.max(...hrPts.map((p) => p.hr)) + 5 : 1;
  if (hi === lo) hi += 1;
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const maxSteps = Math.max(1, ...stepPts.map((p) => p.steps));
  const ys = (v) => T + (1 - v / maxSteps) * (H - T - B);
  const barW = Math.max(1, ((Wd - L - R) / 288) * 0.8);
  const bars = showSteps
    ? stepPts
        .map((p) => `<rect x="${x(p.minute).toFixed(1)}" y="${ys(p.steps).toFixed(1)}" width="${barW.toFixed(2)}" height="${(H - B - ys(p.steps)).toFixed(1)}" fill="${COLOR.nutrition}" fill-opacity="0.6"><title>${W.clockOf(p.minute)} · ${num(p.steps)} Schritte</title></rect>`)
        .join("")
    : "";
  // Linie mit Lücken, wo länger als 15 Minuten kein Wert vorliegt
  const parts = [];
  let cur = [];
  let prev = null;
  for (const p of hrPts) {
    if (prev !== null && p.minute - prev > 15 && cur.length) {
      parts.push(cur);
      cur = [];
    }
    cur.push(`${x(p.minute).toFixed(1)},${y(p.hr).toFixed(1)}`);
    prev = p.minute;
  }
  if (cur.length) parts.push(cur);
  const line = showHr
    ? parts.map((pp) => `<polyline points="${pp.join(" ")}" fill="none" stroke="${COLOR.body}" stroke-width="1.5" stroke-linejoin="round"/>`).join("")
    : "";
  const ticks = showHr ? [lo + 5, Math.round((lo + hi) / 2), hi - 5] : [];
  const stepTicks = showSteps ? [0, Math.round(maxSteps / 2), maxSteps] : [];
  return `<svg class="pc-chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Herzfrequenz und Schritte über den Tag">
    ${ticks.map((v) => `<line x1="${L}" x2="${Wd - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${num(v)}</text>`).join("")}
    ${stepTicks.map((v) => `<text x="${Wd - R + 4}" y="${(ys(v) + 3).toFixed(1)}" text-anchor="start">${num(v)}</text>`).join("")}
    ${bars}${line}
    ${[0, 360, 720, 1080, 1440].map((m) => `<text x="${x(m).toFixed(1)}" y="${H - 5}" text-anchor="${m === 0 ? "start" : m === 1440 ? "end" : "middle"}">${String(m / 60).padStart(2, "0")}:00</text>`).join("")}
  </svg>`;
}

/**
 * Übersicht → „Schritte über den Tag“ (1.45.5, wie StepsDayCard am PC): bis zu jeder Uhrzeit
 * gesammelte Schritte neben dem Median derselben Uhrzeit an den bisherigen Tagen mit Schrittverlauf
 * (bis 28 Tage zurück). `nowMinute` = jetzt (heute) bzw. 1440. Ohne Schrittverlauf leer.
 */
export function stepsDayHtml(catalog, day, nowMinute = 1440) {
  const w = wearableOf(catalog);
  const from = D.addDaysIso(day, -28);
  const todayRow = w.days.find((d) => d.date === day && d.stepSamples);
  const past = w.days.filter((d) => d.date < day && d.date >= from).map((d) => d.stepSamples);
  const c = W.stepDayCompare(todayRow?.stepSamples, past, nowMinute);
  if (!c) return "";
  const isToday = nowMinute < 1440;
  const until = c.nowMinute >= 1440 ? "bis 24:00 Uhr" : `bis ${W.clockOf(c.nowMinute)} Uhr`;
  const Wd = 340;
  const H = 170;
  const L = 40;
  const R = 8;
  const T = 8;
  const B = 20;
  const max = Math.max(100, ...c.points.map((p) => Math.max(p.today ?? 0, p.median ?? 0)));
  const nice = [500, 1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000].find((v) => v >= max) ?? Math.ceil(max / 10000) * 10000;
  const x = (m) => L + (m / 1440) * (Wd - L - R);
  const y = (v) => T + (1 - v / nice) * (H - T - B);
  const path = (key) =>
    c.points
      .filter((p) => p[key] !== null)
      .map((p, k) => `${k ? "L" : "M"}${x(p.minute).toFixed(1)},${y(p[key]).toFixed(1)}`)
      .join(" ");
  const med = path("median");
  const tod = path("today");
  const diff = c.todayNow !== null && c.medianNow !== null && c.medianNow > 0 ? c.todayNow - c.medianNow : null;
  const label = isToday ? "Heute" : "An diesem Tag";
  return `<section class="card ov-card card--training" data-card="wearable-steps"><div class="wo-head"><h3>Schritte über den Tag</h3><span class="tag">${isToday ? "Heute" : esc(D.formatDate(day))}</span></div>
    <div class="level-metrics">
      <div><span class="muted small">${label} ${until}</span><strong class="level-big">${num(c.todayNow)}</strong></div>
      <div><span class="muted small">Median ${until} (${c.days} Tage)</span><strong>${num(c.medianNow)}</strong></div>
      ${diff !== null ? `<div><span class="muted small">Unterschied zum Median</span><strong>${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${num(Math.abs(diff))}</strong></div>` : ""}
    </div>
    <svg class="pc-chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Gesammelte Schritte ${until} neben dem Median der bisherigen Tage">
      ${[0, nice / 2, nice].map((v) => `<line x1="${L}" x2="${Wd - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${num(v)}</text>`).join("")}
      ${isToday ? `<line x1="${x(c.nowMinute).toFixed(1)}" x2="${x(c.nowMinute).toFixed(1)}" y1="${T}" y2="${H - B}" class="steps-now"/>` : ""}
      ${med ? `<path d="${med}" fill="none" stroke="${COLOR.ink}" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="5 4"/>` : ""}
      ${tod ? `<path d="${tod}" fill="none" stroke="${COLOR.training}" stroke-width="2.5" stroke-linejoin="round"/>` : ""}
      ${[0, 360, 720, 1080, 1440].map((m) => `<text x="${x(m).toFixed(1)}" y="${H - 5}" text-anchor="${m === 0 ? "start" : m === 1440 ? "end" : "middle"}">${String(m / 60).padStart(2, "0")}:00</text>`).join("")}
    </svg>
    <ul class="legend"><li><span class="swatch" style="background:${COLOR.training}"></span>${label} gesammelt</li><li><span class="swatch" style="background:${COLOR.ink};opacity:.55"></span>Median derselben Uhrzeit</li></ul>
    <p class="muted small card-info">Gemessene Schritte deiner Uhr im 5-Minuten-Raster. Median = mittlerer Wert der bisherigen Tage mit Schrittverlauf (bis 28 Tage zurück, ab ${W.MIN_STEP_DAYS} Tagen) zur selben Uhrzeit – Vergleich mit dir selbst, keine Bewertung.</p>
  </section>`;
}

/** Health → Heart. `state` = { days, day } aus dem App-Zustand. */
export function heartTabHtml(catalog, state = {}) {
  const t = today();
  const days = state.days ?? 28;
  const from = shift(t, -(days - 1));
  const w = wearableOf(catalog);
  if (w.heart.length + w.sleep.length + w.recovery.length === 0) {
    return `<section class="card"><div class="empty-state"><p><strong>Noch keine Herzdaten</strong></p><p class="muted small">Verbinde deine Polar-Uhr am PC unter Import/Export → Polar und synchronisiere. Nach dem nächsten Export erscheinen hier Tagesverlauf, Ruhepuls, HRV und die Zeit in deinen Trainingszonen.</p></div></section>`;
  }
  const inPeriod = (list) => list.filter((x) => x.date >= from && x.date <= t);
  const lastDay = [w.heart.at(-1)?.date, w.days.filter((d) => d.stepSamples).at(-1)?.date].filter(Boolean).sort().at(-1) ?? t;
  const day = state.day ?? lastDay;
  const hd = w.heart.find((h) => h.date === day) ?? null;
  let zones = [];
  try {
    zones = heartOn(buildDb(), t)
      .zones.filter((z) => z.effective)
      .map((z) => ({ zone: z.zone, from: z.effective.from, to: z.effective.to }));
  } catch {
    zones = [];
  }
  const zm = hd ? W.zoneMinutes(hd.samples, zones) : null;
  const nightLow = w.sleep.map((s) => ({ date: s.date, value: W.nightLowestHr(s) }));
  const hrv = w.recovery.map((r) => ({ date: r.date, value: r.hrvMs }));
  const lowSeries = inPeriod(nightLow).filter((p) => p.value !== null);
  const hrvSeries = inPeriod(hrv).filter((p) => p.value !== null);
  const breath = w.recovery.map((r) => ({ date: r.date, value: r.breathingAvg ?? null }));
  const breathSeries = inPeriod(breath).filter((p) => p.value !== null);
  const recovery = [...inPeriod(w.recovery)].reverse();
  const exercises = [...inPeriod(w.exercises)].reverse();
  const stepDays = w.days.filter((d) => d.stepSamples);
  const dayOptions = [
    ...new Set([...w.heart.map((h) => h.date), ...stepDays.map((d) => d.date)]),
  ]
    .sort()
    .reverse()
    .slice(0, 60);
  const stepSamples = stepDays.find((d) => d.date === day)?.stepSamples ?? null;
  const hide = { hr: !!state.hideHr, steps: !!state.hideSteps };
  const hasSteps = W.stepSeries(stepSamples).length > 0;

  return `${recoveryTodayHtml(w, t)}<section class="card logs-toolbar">
      <label class="field logs-select"><span>Zeitraum</span><select data-heart="days">${[
        [7, "7 Tage"],
        [28, "28 Tage"],
        [90, "90 Tage"],
        [365, "1 Jahr"],
      ].map(([v, l]) => `<option value="${v}" ${v === days ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    </section>
    <section class="card"><div class="wo-head"><h3>Herzfrequenz und Schritte am Tag</h3></div>
      ${dayOptions.length ? `<label class="field"><span>Tag</span><select data-heart="day">${dayOptions.map((d) => `<option value="${d}" ${d === day ? "selected" : ""}>${esc(D.formatDate(d))}</option>`).join("")}</select></label>` : ""}
      ${
        hd
          ? `<div class="stat"><div><b>${num(hd.minBpm)} /min</b><span>Minimum</span></div><div><b>${num(hd.avgBpm)} /min</b><span>Mittel</span></div><div><b>${num(hd.maxBpm)} /min</b><span>Maximum</span></div><div><b>${num(hd.sampleCount)}</b><span>Messwerte</span></div></div>`
          : `<p class="muted">Für diesen Tag gibt es keine Herzfrequenz-Werte.</p>`
      }
      ${
        hd || hasSteps
          ? `<div class="heart-layers">
          <label class="toggle"><input type="checkbox" data-heart="hideHr" ${hide.hr ? "" : "checked"} ${hd ? "" : "disabled"}> <span style="color:${COLOR.body}">━</span> Herzfrequenz</label>
          <label class="toggle"><input type="checkbox" data-heart="hideSteps" ${hide.steps ? "" : "checked"} ${hasSteps ? "" : "disabled"}> <span style="color:${COLOR.nutrition}">■</span> Schritte je 5 Minuten</label>
        </div>
        <div class="chart-zoomable" data-chart-zoom="${esc(`Herzfrequenz und Schritte · ${D.formatDate(day)}`)}" role="button" tabindex="0" aria-label="Grafik groß im Querformat anzeigen">${timelineSvg(hd?.samples ?? [], stepSamples, hide)}<span class="chart-zoomable__hint muted small">Antippen: groß im Querformat</span></div>
        ${hasSteps ? "" : `<p class="muted small">Schritte über den Tag gibt es ab der Synchronisierung mit PC-Version 1.0.130 (Polar) oder aus dem Apple-Health-Export.</p>`}`
          : ""
      }
      ${
        zm
          ? zones.length
            ? `<h4 class="logs-sub">Zeit in den Trainingszonen an diesem Tag</h4><ul class="list">${zones
                .map((z) => `<li class="meal-item"><span>Zone ${z.zone} <span class="muted small">${z.from}–${z.to} /min</span></span><strong>${dur(zm.byZone[z.zone - 1] ?? 0)}</strong></li>`)
                .join("")}<li class="meal-item"><span>unter Zone 1</span><strong>${dur(zm.below)}</strong></li></ul>`
            : `<p class="muted small">Für die Zonen fehlen maximale Herzfrequenz oder Ruhepuls (Body &amp; Longevity → Vitalwerte am PC).</p>`
          : ""
      }
      ${note("Jeder Messwert der Uhr steht für die Zeit bis zum nächsten (Polar: 5 Minuten). Schritte: Summe je 5 Minuten. Optische Messung am Handgelenk – geeignet für Verläufe, nicht für einzelne Werte.")}
    </section>
    <section class="card"><div class="wo-head"><h3>Niedrigste Herzfrequenz der Nacht</h3></div>
      ${lowSeries.length > 1 ? trendSvg(lowSeries, { color: COLOR.body, decimals: 0, height: 160, label: "Niedrigste Herzfrequenz je Nacht" }) : `<p class="muted small">Für einen Verlauf werden mindestens zwei Nächte benötigt.</p>`}
      ${compare(W.recentVsBaseline(nightLow, t), "/min")}
    </section>
    <section class="card"><div class="wo-head"><h3>HRV (RMSSD) der Nacht</h3></div>
      ${hrvSeries.length > 1 ? trendSvg(hrvSeries, { color: COLOR.recovery, decimals: 0, height: 160, label: "HRV je Nacht" }) : `<p class="muted small">Für einen Verlauf werden mindestens zwei Nächte benötigt.</p>`}
      ${compare(W.recentVsBaseline(hrv, t), "ms")}
      ${note("HRV aus Polar Nightly Recharge. Werte verschiedener Geräte sind nicht direkt vergleichbar – aussagekräftig ist dein eigener Verlauf.")}
    </section>
    ${
      breathSeries.length
        ? `<section class="card"><div class="wo-head"><h3>Atemfrequenz in der Nacht</h3></div>
      ${breathSeries.length > 1 ? trendSvg(breathSeries, { color: COLOR.sleep, decimals: 1, height: 160, label: "Atemfrequenz je Nacht" }) : `<p class="muted small">Für einen Verlauf werden mindestens zwei Nächte benötigt.</p>`}
      ${compare(W.recentVsBaseline(breath, t), "/min", 1)}
      ${note("Atemzüge pro Minute aus Polar Nightly Recharge. Den Verlauf einer Nacht zeigt Sleep → Gemessene Nächte.")}
    </section>`
        : ""
    }
    ${
      recovery.length
        ? `<section class="card"><div class="wo-head"><h3>Nächtliche Erholung</h3></div><ul class="list">${recovery
            .map((r) => `<li class="meal-item"><span><b>${esc(D.formatDate(r.date))}</b><br><span class="muted small">Ø HF ${num(r.hrAvg)} /min · Atem ${num(r.breathingAvg, 1)} /min · ANS ${num(r.ansCharge, 1)}${W.rechargeStatusLabel(r.rechargeStatus) ? ` · Recharge ${esc(W.rechargeStatusLabel(r.rechargeStatus))}` : ""}</span></span><strong>${r.hrvMs != null ? `${num(r.hrvMs)} ms` : "–"}</strong></li>`)
            .join("")}</ul>${note("ANS-Ladung und Nightly Recharge sind Rechenwerte und Einstufungen von Polar, keine Messwerte.")}</section>`
        : ""
    }
    ${
      exercises.length
        ? `<section class="card"><div class="wo-head"><h3>Trainings der Uhr</h3></div><ul class="list">${exercises
            .map(exerciseItem)
            .join("")}</ul>${note("Antippen für Herzfrequenz-Verlauf und Zonen. „Ins Training übernehmen“ legt eine Cardio-Einheit an (nur auf Tippen, damit nichts doppelt entsteht); sie geht mit „An den PC senden“ an den PC.")}</section>`
        : ""
    }
    ${loadHtml(w, from)}
    ${biosensingHtml(inPeriod(w.biosensing))}
    ${associationsHtml(w)}
    <p class="muted small">Quelle: Polar (am PC unter Import/Export → Polar). Nur Messwerte und Rechnungen, keine medizinische Bewertung.</p>`;
}

/** Sleep → Gemessene Nächte (nur wenn im Zeitraum vorhanden). `logs` = eigene Nächte wie am PC. */
export function measuredSleepHtml(catalog, from, to, logs, caffeine = null) {
  const nights = wearableOf(catalog)
    .sleep.filter((s) => s.date >= from && s.date <= to)
    .reverse();
  if (!nights.length) return "";
  const own = new Map(logs.map((l) => [l.date, l]));
  const measured = nights.map(W.measuredSleepMin);
  const diffs = nights
    .map((n) => {
      const m = W.measuredSleepMin(n);
      const o = own.get(n.date);
      return m !== null && o && o.method !== n.source ? o.sleepMin - m : null;
    })
    .filter((d) => d !== null);
  const shares = nights.map(W.phaseShares).filter(Boolean);
  const bedSpread = W.spread(nights.map(W.bedMinute).filter((m) => m !== null));
  const lowest = W.mean(nights.map(W.nightLowestHr));
  const avgDiff = W.mean(diffs);
  const min = (s) => (s === null || s === undefined ? "–" : dur(s / 60));
  return `<section class="card ov-card card--sleep"><div class="wo-head"><h3>Gemessene Nächte (Uhr)</h3><span class="tag">${nights.length} ${nights.length === 1 ? "Nacht" : "Nächte"}</span></div>
    <div class="stat">
      <div><b>${dur(W.mean(measured))}</b><span>Ø Schlaf gemessen</span></div>
      <div><b>${shares.length ? `${num(W.mean(shares.map((s) => s.deep)))} %` : "–"}</b><span>Ø Tiefschlaf-Anteil</span></div>
      <div><b>${shares.length ? `${num(W.mean(shares.map((s) => s.rem)))} %` : "–"}</b><span>Ø REM-Anteil</span></div>
      <div><b>${bedSpread !== null ? `± ${num(bedSpread)} min` : "–"}</b><span>Schwankung Einschlafzeit</span></div>
      <div><b>${lowest !== null ? `${num(lowest)} /min` : "–"}</b><span>Ø niedrigste HF</span></div>
    </div>
    ${avgDiff !== null ? `<p class="muted small">Deine eigene Angabe liegt im Mittel <strong>${dur(Math.abs(avgDiff))} ${avgDiff >= 0 ? "über" : "unter"}</strong> der gemessenen Schlafdauer (${diffs.length} ${diffs.length === 1 ? "Nacht" : "Nächte"} mit beidem).</p>` : ""}
    <ul class="list">${nights
      .map((n) => {
        const o = own.get(n.date);
        const low = W.nightLowestHr(n);
        return `<li class="meal-item"><span><b>${esc(D.formatDate(n.date))}</b><br><span class="muted small">Tief ${min(n.deepS)} · REM ${min(n.remS)} · Leicht ${min(n.lightS)} · Unterbr. ${min(n.interruptionS)}${low !== null ? ` · min. HF ${low}` : ""}${n.sleepScore != null ? ` · Schlafwert ${num(n.sleepScore)}` : ""}</span></span><span><strong>${dur(W.measuredSleepMin(n))}</strong>${o && o.method !== n.source ? `<br><span class="muted small">eigene ${dur(o.sleepMin)}</span>` : ""}</span></li>`;
      })
      .join("")}</ul>
    ${nightDetailHtml(nights[0], wearableOf(catalog), caffeine)}
    ${note("Gemessen von der Uhr (Polar, am PC synchronisiert). Wearables erkennen Schlaf und Wach recht gut, Schlafphasen nur mäßig genau – aussagekräftig ist der Verlauf über viele Nächte. Schwankung der Einschlafzeit = Standardabweichung (ab 3 Nächten).")}
  </section>`;
}

const STAGE_COLOR = { wake: "#7A889D", rem: "#2F86B8", light: "#A39BE3", deep: "#2E2580", unknown: "#DCE3EC" };
const evening = (m) => ((m % 1440) + 1440) % 1440;

/** Letzte Nacht im Detail: Schlafverlauf, Werte von Polar, SleepWise (wie MeasuredSleepCard am PC). */
/** Verlauf eines Werts über die Nacht ({"HH:MM": Wert}), wie NightLine am PC (1.45.0). */
/**
 * `overlay` (1.47.0): zweite Linie mit eigener Skala rechts, z. B. Koffein – { values (zu den
 * Zeitpunkten der Werte), color, unit, label }. Werte erscheinen beim Antippen/Überfahren.
 */
export function nightLineSvg(json, { color, label, unit, digits = 0, overlay = null }) {
  const pts = W.nightSeries(json ?? null).map((p) => ({ t: p.minute >= 720 ? p.minute - 1440 : p.minute, v: p.value }));
  if (pts.length < 2) return "";
  const Wd = 340;
  const H = 130;
  const L = 34;
  const R = overlay ? 34 : 6;
  const T = 8;
  const B = 20;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (Wd - L - R);
  const lo = Math.min(...pts.map((p) => p.v)) - (digits ? 1 : 3);
  const hi = Math.max(...pts.map((p) => p.v)) + (digits ? 1 : 3);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  const clock = (t) => W.clockOf(evening(t) % 1440);
  const ov = overlay ? overlay.values.map((v) => (Number.isFinite(v) ? v : 0)) : null;
  const ovHi = ov ? Math.max(10, Math.ceil(Math.max(...ov) / 10) * 10) : 1;
  const yo = (v) => T + (1 - v / ovHi) * (H - T - B);
  // Werte fürs Antippen: Minute|Wert|Koffein je Punkt (siehe logs.js nightHover)
  const data = pts.map((p, i) => `${p.t}|${p.v}${ov ? `|${Math.round(ov[i] * 10) / 10}` : ""}`).join(";");
  const meta = `${esc(label)}|${esc(unit)}|${digits}${overlay ? `|${esc(overlay.label)}|${esc(overlay.unit)}` : ""}`;
  return `<p class="small"><b>${esc(label)}</b> <span class="muted">(${unit}) · ${num(Math.min(...pts.map((p) => p.v)), digits)}–${num(Math.max(...pts.map((p) => p.v)), digits)}</span>${
    overlay ? ` <span style="color:${overlay.color}">┅</span> <span class="muted">${esc(overlay.label)} (${esc(overlay.unit)}, Skala rechts)</span>` : ""
  }</p><svg class="pc-chart night-hover" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${esc(label)}" data-l="${L}" data-r="${Wd - R}" data-w="${Wd}" data-t0="${t0}" data-t1="${t1}" data-pts="${data}" data-meta="${meta}">
    ${ticks.map((v) => `<line x1="${L}" x2="${Wd - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${num(v)}</text>`).join("")}
    ${ov ? [0, ovHi / 2, ovHi].map((v) => `<text x="${Wd - R + 4}" y="${(yo(v) + 3).toFixed(1)}" text-anchor="start" style="fill:${overlay.color}">${num(v)}</text>`).join("") : ""}
    <polyline points="${pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"><title>${esc(label)} (${unit})</title></polyline>
    ${ov ? `<polyline points="${pts.map((p, i) => `${x(p.t).toFixed(1)},${yo(ov[i]).toFixed(1)}`).join(" ")}" fill="none" stroke="${overlay.color}" stroke-width="1.5" stroke-dasharray="6 4" stroke-linejoin="round"><title>${esc(overlay.label)} (${esc(overlay.unit)})</title></polyline>` : ""}
    <line class="night-hover__cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <text x="${L}" y="${H - 5}" text-anchor="start">${clock(t0)}</text>
    <text x="${Wd - R}" y="${H - 5}" text-anchor="end">${clock(t1)}</text>
  </svg><p class="muted small night-hover__readout" aria-live="polite">Für Werte auf die Linie tippen.</p>`;
}

/**
 * `caffeine` (1.47.0): { show, levels(n, ts) → mg je Zeitpunkt oder null ohne Koffein } –
 * Koffein über der Nacht in der Herzfrequenz-Grafik (wie am PC, gleiche Rechnung wie „Koffein vor
 * dem Schlafen“).
 */
function nightDetailHtml(n, w, caffeine = null) {
  if (!n) return "";
  const rec = w.recovery.find((r) => r.date === n.date && r.source === n.source);
  const segs = W.hypnogramSegments(n);
  const total = segs.reduce((a, x) => a + (x.to - x.from), 0);
  const sw = w.sleepwise.find((x) => x.date === n.date);
  const skin = w.biosensing.find((b) => b.kind === "skin_temp" && b.date === n.date);
  const start = n.sleepStart?.split("T")[1]?.slice(0, 5) ?? null;
  const off = sw?.tzOffsetMin ?? null;
  const prefStart = W.localClock(sw?.preferredStart ?? null, off);
  const prefEnd = W.localClock(sw?.preferredEnd ?? null, off);
  const gateStart = W.localClock(sw?.gateStart ?? null, off);
  const gateEnd = W.localClock(sw?.gateEnd ?? null, off);
  const offset = W.bedtimeOffset(start, prefStart);
  const charge = W.usualLabel(n.sleepCharge ?? null);
  const eff = W.sleepEfficiencyPct(n);
  const recharge = rec ? W.rechargeStatusLabel(rec.rechargeStatus ?? null) : null;
  const ansStatus = rec ? W.usualLabel(rec.ansChargeStatus ?? null) : null;
  const rechargeHtml = rec
    ? `<h4 class="logs-sub">Nightly Recharge (Polar)</h4>
    <div class="stat">
      <div><b>${num(rec.hrAvg)}</b><span>Ø Puls /min (→ Ruhepuls)</span></div>
      <div><b>${num(rec.hrvMs)}</b><span>Ø HRV ms</span></div>
      <div><b>${num(rec.breathingAvg, 1)}</b><span>Ø Atemfrequenz /min</span></div>
    </div>
    <div class="stat">
      <div><b>${num(rec.rrAvgMs)}</b><span>Ø Schlag-zu-Schlag ms</span></div>
      <div><b>${num(rec.ansCharge, 1)}</b><span>ANS Charge (−10…+10)</span></div>
      <div><b>${recharge ? esc(recharge) : "–"}</b><span>Nightly Recharge</span></div>
    </div>
    ${ansStatus ? `<p class="muted small">ANS Charge: ${esc(ansStatus)}</p>` : ""}
    <p class="muted small">Der Ø Puls stammt aus den ersten Stunden des Schlafs. Am PC wird er als Ruhepuls (nachts, Methode Polar) in Body &amp; Longevity eingetragen, wenn für den Tag noch keiner erfasst ist.</p>`
    : "";
  const swLines = sw
    ? [
        sw.grade !== null && sw.grade !== undefined && `Wachheit am Tag: <strong>${num(sw.grade, 1)}</strong> von 10${sw.gradeClass ? ` (${esc(W.polarLabel(sw.gradeClass))})` : ""}`,
        sw.sleepInertia && `Schlafträgheit: ${esc(W.polarLabel(sw.sleepInertia))}`,
        prefStart && prefEnd && `Bevorzugtes Schlaffenster laut Polar: ${prefStart}–${prefEnd} Uhr${gateStart && gateEnd ? ` (Einschlafzeitraum ${gateStart}–${gateEnd} Uhr)` : ""}`,
        offset !== null && start && `Eingeschlafen um ${start} Uhr – ${offset === 0 ? "genau zum bevorzugten Beginn" : `${dur(Math.abs(offset))} ${offset > 0 ? "nach" : "vor"} dem bevorzugten Beginn`}`,
      ].filter(Boolean)
    : [];
  return `<h4 class="logs-sub">Letzte Nacht im Detail (${esc(D.formatDate(n.date))})</h4>
    <div class="stat">
      <div><b>${num(n.sleepScore)}</b><span>Schlafwert (Polar)</span></div>
      <div><b>${num(n.continuity, 1)}</b><span>Kontinuität (1–5)</span></div>
      <div><b>${n.cycles ?? "–"}</b><span>Schlafzyklen</span></div>
      <div><b>${eff !== null ? `${eff} %` : "–"}</b><span>Schlafeffizienz</span></div>
    </div>
    ${
      n.groupDurationScore != null || n.groupSolidityScore != null || n.groupRegenerationScore != null
        ? `<div class="stat">
      <div><b>${num(n.groupDurationScore)}</b><span>Schlafmenge (Teilwert)</span></div>
      <div><b>${num(n.groupSolidityScore)}</b><span>Stabilität (Teilwert)</span></div>
      <div><b>${num(n.groupRegenerationScore)}</b><span>Erholung (Teilwert)</span></div>
    </div>`
        : ""
    }
    ${(() => {
      const sleptMin = W.measuredSleepMin(n);
      const lines = [
        (n.shortInterruptionS != null || n.longInterruptionS != null) &&
          `Unterbrechungen: kurz (unter 90 s) ${n.shortInterruptionS != null ? dur(n.shortInterruptionS / 60) : "–"}, lang ${n.longInterruptionS != null ? dur(n.longInterruptionS / 60) : "–"}`,
        n.sleepGoalS > 0 &&
          `Schlafziel bei Polar ${dur(n.sleepGoalS / 60)}${sleptMin !== null ? ` – gemessen ${dur(sleptMin)} (${num((sleptMin * 60 * 100) / n.sleepGoalS)} % des Ziels)` : ""}`,
        W.continuityClassLabel(n.continuityClass) && `Kontinuität laut Polar: ${esc(W.continuityClassLabel(n.continuityClass))}`,
        W.sleepRatingLabel(n.sleepRating) && `Deine Bewertung der Nacht bei Polar: ${esc(W.sleepRatingLabel(n.sleepRating))}`,
        n.sleepRating >= 1 && n.sleepRating <= 5 && `Polar-Bewertung ${n.sleepRating}/5 → Schlafqualität ${n.sleepRating * 2}/10 im Schlafprotokoll (nur wenn dort noch keine steht)`,
        n.unrecognizedS > 0 && `Nicht erkannte Schlafphase: ${dur(n.unrecognizedS / 60)}`,
        eff !== null && `Schlafeffizienz = geschlafene Zeit ÷ Zeit von Einschlafen bis Aufwachen (${eff} %)`,
        n.deviceId && `Gerät: ${esc(n.deviceId)}`,
      ].filter(Boolean);
      return lines.length ? `<ul class="list">${lines.map((l) => `<li class="muted small">${l}</li>`).join("")}</ul>` : "";
    })()}
    ${rechargeHtml}
    ${charge ? `<p class="muted small">Sleep Charge laut Polar: <strong>${esc(charge)}</strong>${skin?.value != null ? ` · Hauttemperatur ${num(skin.value, 1)} °C` : ""}</p>` : skin?.value != null ? `<p class="muted small">Hauttemperatur ${num(skin.value, 1)} °C</p>` : ""}
    ${
      segs.length && total > 0
        ? `<div class="goal-bar goal-bar--energy" role="img" aria-label="Schlafverlauf">${segs
            .map((x) => `<span class="goal-bar__fill" style="width:${(((x.to - x.from) / total) * 100).toFixed(2)}%;background:${STAGE_COLOR[x.stage]}" title="${W.STAGE_LABEL[x.stage]} ${W.clockOf(evening(Math.round(x.from)))}–${W.clockOf(evening(Math.round(x.to)))}"></span>`)
            .join("")}</div><p class="muted small">${["deep", "light", "rem", "wake"].map((k) => `<span style="color:${STAGE_COLOR[k]}">■</span> ${W.STAGE_LABEL[k]}`).join(" · ")} · ${W.clockOf(evening(Math.round(segs[0].from)))}–${W.clockOf(evening(Math.round(segs[segs.length - 1].to)))} Uhr</p>`
        : ""
    }
    ${(() => {
      if (!caffeine) return nightLineSvg(n.hrSamples, { color: COLOR.sleep, label: "Herzfrequenz in der Nacht", unit: "/min" });
      const ts = W.nightSeries(n.hrSamples ?? null).map((p) => (p.minute >= 720 ? p.minute - 1440 : p.minute));
      if (ts.length < 2) return "";
      const values = caffeine.levels(n, ts);
      const toggle = `<div class="row"><button class="btn sm ${caffeine.show ? "primary" : ""}" data-act="night-caffeine" aria-pressed="${caffeine.show}">${caffeine.show ? "Koffein ausblenden" : "Koffein anzeigen"}</button>${
        values === null ? `<span class="muted small">Am Vorabend und in der Nacht ist kein Koffein eingetragen.</span>` : ""
      }</div>`;
      return `${toggle}${nightLineSvg(n.hrSamples, {
        color: COLOR.sleep,
        label: "Herzfrequenz in der Nacht",
        unit: "/min",
        overlay: caffeine.show && values ? { values, color: COLOR.caffeine, unit: "mg", label: "Koffein (Modellrechnung)" } : null,
      })}`;
    })()}
    ${nightLineSvg(rec?.hrvSamples, { color: COLOR.recovery, label: "HRV in der Nacht", unit: "ms" })}
    ${nightLineSvg(rec?.breathingSamples, { color: COLOR.body, label: "Atemfrequenz in der Nacht", unit: "/min", digits: 1 })}
    ${swLines.length ? `<h4 class="logs-sub">SleepWise (Polar)</h4><ul class="list">${swLines.map((l) => `<li class="muted small">${l}</li>`).join("")}</ul>` : ""}`;
}

// ------------------------------------------------------------------ Herzfrequenz einer Trainingseinheit (1.44.0)

const minuteOfClock = (t) => {
  const m = /^(\d{2}):(\d{2})/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** UTC-Zeitstempel → { date, minute } in Ortszeit */
function localOf(ts) {
  const d = new Date(ts ?? "");
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, minute: d.getHours() * 60 + d.getMinutes() };
}

/**
 * Herzfrequenz einer Einheit wie `repo/workout_heart.rs` am PC: zuerst ein Training der Uhr, das in
 * diese Einheit übernommen wurde oder zur selben Zeit begann (± 20 Minuten), sonst der Ausschnitt der
 * ganztägigen Herzfrequenz. `w` = { id, date, startTime, durationMin }; Beginn/Ende der Aufzeichnung
 * kommen aus `workout` des PC-Exports.
 */
export function workoutHeartOf(catalog, w) {
  const row = (catalog?.pc?.workout ?? []).find((x) => x.id === w.id) ?? {};
  let date = w.date;
  let start = null;
  let end = null;
  const s = localOf(row.started_at);
  const e = localOf(row.finished_at);
  if (s && e && s.date === e.date && e.minute > s.minute) {
    date = s.date;
    start = s.minute;
    end = e.minute;
  } else {
    start = minuteOfClock(w.startTime ?? row.start_time);
    const d = w.durationMin ?? row.duration_min;
    if (start === null || d == null) return null;
    end = Math.min(1440, start + d);
  }
  const clock = (m) => W.clockOf(m);
  const data = wearableOf(catalog);
  const exercises = data.exercises.filter((x) => x.date === date);
  const exStart = (x) => minuteOfClock(x.startTime?.split("T")[1]);
  const linked = exercises.find((x) => x.workoutId === w.id) ?? exercises.find((x) => exStart(x) !== null && Math.abs(exStart(x) - start) <= 20);
  if (linked) {
    const points = W.exerciseHr(linked.hrSamples);
    if (points.length || linked.hrAvg != null) {
      return { kind: "exercise", label: `Training der Uhr (${linked.source})`, start: clock(exStart(linked) ?? start), points, hrAvg: linked.hrAvg, hrMax: linked.hrMax, rrRmssd: linked.rrRmssd ?? null, zones: linked.zones ?? null };
    }
  }
  const byMin = new Map();
  const sources = [];
  for (const d of data.heart.filter((h) => h.date === date)) {
    let used = false;
    for (const [m, bpm] of d.samples) {
      if (m >= start && m <= end) {
        const v = byMin.get(m) ?? [0, 0];
        byMin.set(m, [v[0] + bpm, v[1] + 1]);
        used = true;
      }
    }
    if (used) sources.push(d.source);
  }
  if (!byMin.size) return null;
  const points = [...byMin.entries()].sort((a, b) => a[0] - b[0]).map(([m, [sum, n]]) => ({ second: (m - start) * 60, bpm: Math.round(sum / n) }));
  const avg = points.reduce((a, p) => a + p.bpm, 0) / points.length;
  return { kind: "day", label: `Ganztägige Herzfrequenz (${sources.join(", ")})`, start: clock(start), points, hrAvg: Math.round(avg * 10) / 10, hrMax: Math.max(...points.map((p) => p.bpm)), rrRmssd: null, zones: null };
}

/** Zeit je Zone: Zonen der Uhr, sonst Rechnung mit den eigenen Zonen (1.45.0, wie am PC). */
function workoutZonesLine(h) {
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  const watch = W.exerciseZones(h.zones ?? null);
  if (watch.length) {
    const total = watch.reduce((a, z) => a + z.seconds, 0);
    return total > 0 ? `<p class="muted small">Zonen laut Uhr: ${watch.map((z) => `Zone ${z.zone} ${mmss(z.seconds)}`).join(" · ")}</p>` : "";
  }
  let own = [];
  try {
    own = heartOn(buildDb(), today())
      .zones.filter((z) => z.effective)
      .map((z) => ({ zone: z.zone, from: z.effective.from }));
  } catch {
    own = [];
  }
  if (!own.length || h.points.length < 2) return "";
  const c = W.secondsInZones(h.points.map((p) => [p.second, p.bpm]), own, h.kind === "day" ? 900 : 15);
  if (!c.total) return "";
  const parts = c.byZone.map((sec, i) => ({ zone: i + 1, sec })).filter((z) => z.sec > 0);
  return `<p class="muted small">Zonen nach deinen Einstellungen: ${parts.length ? parts.map((z) => `Zone ${z.zone} ${mmss(z.sec)} (${num((z.sec / c.total) * 100)} %)`).join(" · ") : "keine Zeit in den Zonen"}${c.below > 0 ? ` · unter Zone 1 ${mmss(c.below)}` : ""}</p>`;
}

export function workoutHeartHtml(h) {
  if (!h) return `<p class="muted small">Für diese Einheit gibt es keine Herzfrequenz der Uhr (Startzeit und Dauer nötig).</p>`;
  return `<div class="workout-heart">
    <p class="small"><b>Herzfrequenz</b> · ${esc(h.label)} · ab ${esc(h.start)} Uhr</p>
    ${exerciseSvg(h.points)}
    <p class="muted small">Ø ${num(h.hrAvg)} /min · max ${num(h.hrMax)} /min${h.rrRmssd != null ? ` · HRV im Training (RMSSD) ${num(h.rrRmssd)} ms` : ""}</p>
    ${workoutZonesLine(h)}
    ${h.kind === "day" ? `<p class="muted small">Aus den ganztägigen Werten der Uhr (Polar: alle 5 Minuten) – für einen genauen Verlauf das Training auf der Uhr starten.</p>` : ""}
  </div>`;
}
