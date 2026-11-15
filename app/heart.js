// LIFESPAN OS Mobil – Health → Heart und Sleep → Gemessene Nächte (1.42.0, erweitert 1.43.0), gleiche
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

const signed = (v, d = 0) => (v === null || v === undefined ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${D.formatNumber(Math.abs(v), d)}`);

/** Gemessene Erholung der letzten Nacht gegen den eigenen Durchschnitt (wie RecoveryTodayCard). */
export function recoveryTodayHtml(w, day) {
  const rows_ = W.recoveryToday(w, day);
  const labels = W.polarDayLabels(w, day);
  if (rows_.every((r) => r.today === null) && !labels.length) return "";
  return `<section class="card"><div class="wo-head"><h3>Gemessene Erholung heute</h3></div>
    <ul class="list">${rows_
      .map((r) => {
        const diff =
          r.difference === null
            ? r.baselineCount < 5
              ? `Vergleich ab 5 Tagen (bisher ${r.baselineCount})`
              : ""
            : `${signed(r.difference, r.digits)} ${r.unit}${r.baseline ? ` (${signed((r.difference / r.baseline) * 100)} %)` : ""}`;
        return `<li class="meal-item"><span>${esc(r.label)}<br><span class="muted small">Ø 28 Tage davor: ${r.baseline !== null ? `${num(r.baseline, r.digits)} ${r.unit}` : "–"}${diff ? ` · ${diff}` : ""}</span></span><strong>${r.today !== null ? `${num(r.today, r.digits)} ${r.unit}` : "–"}</strong></li>`;
      })
      .join("")}</ul>
    ${labels.length ? `<p class="muted small">${labels.map((l) => `${esc(l.label)} laut Polar: <strong>${esc(l.value)}</strong>`).join(" · ")}</p>` : ""}
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
function associationsHtml(w) {
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
  const sign = r.difference > 0 ? "+" : r.difference < 0 ? "−" : "±";
  return `<p class="muted small">Letzte 7 Tage: Ø ${num(r.recent, digits)} ${unit} (${r.recentCount} Werte)${
    r.baseline !== null ? ` · 28 Tage davor: Ø ${num(r.baseline, digits)} ${unit} (${r.baselineCount} Werte)` : ""
  }${r.difference !== null ? ` · Unterschied ${sign}${num(Math.abs(r.difference), digits)} ${unit}` : ""}. Vergleich nur mit deinem eigenen Verlauf (ab 3 Werten je Zeitraum).</p>`;
}

/** Herzfrequenz eines Tages als Linie über 24 Stunden. */
function daySvg(samples) {
  const pts = [...samples].sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return "";
  const Wd = 340;
  const H = 170;
  const L = 34;
  const R = 6;
  const T = 8;
  const B = 20;
  let lo = Math.min(...pts.map((p) => p[1])) - 5;
  let hi = Math.max(...pts.map((p) => p[1])) + 5;
  if (hi === lo) hi += 1;
  const x = (m) => L + (m / 1440) * (Wd - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = pts.map(([m, v]) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = [lo + 5, Math.round((lo + hi) / 2), hi - 5];
  return `<svg class="pc-chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Herzfrequenz über den Tag">
    ${ticks.map((v) => `<line x1="${L}" x2="${Wd - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${num(v)}</text>`).join("")}
    <polyline points="${line}" fill="none" stroke="${COLOR.body}" stroke-width="1.5" stroke-linejoin="round"/>
    ${[0, 360, 720, 1080, 1440].map((m) => `<text x="${x(m).toFixed(1)}" y="${H - 5}" text-anchor="${m === 0 ? "start" : m === 1440 ? "end" : "middle"}">${String(m / 60).padStart(2, "0")}:00</text>`).join("")}
  </svg>`;
}

/** Health → Heart. `state` = { days, day } aus dem App-Zustand. */
export function heartTabHtml(catalog, state = {}) {
  const t = today();
  const days = state.days ?? 28;
  const from = shift(t, -(days - 1));
  const w = wearableOf(catalog);
  if (w.heart.length + w.sleep.length + w.recovery.length === 0) {
    return `<section class="card"><div class="empty-state"><p><strong>Noch keine Herzdaten</strong></p><p class="muted small">Verbinde deine Polar-Uhr am PC unter Settings → Polar und synchronisiere. Nach dem nächsten Export erscheinen hier Tagesverlauf, Ruhepuls, HRV und die Zeit in deinen Trainingszonen.</p></div></section>`;
  }
  const inPeriod = (list) => list.filter((x) => x.date >= from && x.date <= t);
  const lastDay = w.heart.length ? w.heart[w.heart.length - 1].date : t;
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
  const recovery = [...inPeriod(w.recovery)].reverse();
  const exercises = [...inPeriod(w.exercises)].reverse();
  const dayOptions = [...w.heart].reverse().slice(0, 60);

  return `${recoveryTodayHtml(w, t)}<section class="card logs-toolbar">
      <label class="field logs-select"><span>Zeitraum</span><select data-heart="days">${[
        [7, "7 Tage"],
        [28, "28 Tage"],
        [90, "90 Tage"],
        [365, "1 Jahr"],
      ].map(([v, l]) => `<option value="${v}" ${v === days ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    </section>
    <section class="card"><div class="wo-head"><h3>Herzfrequenz am Tag</h3></div>
      ${dayOptions.length ? `<label class="field"><span>Tag</span><select data-heart="day">${dayOptions.map((h) => `<option value="${h.date}" ${h.date === day ? "selected" : ""}>${esc(D.formatDate(h.date))}</option>`).join("")}</select></label>` : ""}
      ${
        hd
          ? `<div class="stat"><div><b>${num(hd.minBpm)} /min</b><span>Minimum</span></div><div><b>${num(hd.avgBpm)} /min</b><span>Mittel</span></div><div><b>${num(hd.maxBpm)} /min</b><span>Maximum</span></div><div><b>${num(hd.sampleCount)}</b><span>Messwerte</span></div></div>
        ${daySvg(hd.samples)}`
          : `<p class="muted">Für diesen Tag gibt es keine Herzfrequenz-Werte.</p>`
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
      ${note("Jeder Messwert der Uhr steht für die Zeit bis zum nächsten (Polar: 5 Minuten). Optische Messung am Handgelenk – geeignet für Verläufe, nicht für einzelne Werte.")}
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
            .join("")}</ul>${note("Antippen für Herzfrequenz-Verlauf und Zonen. Ins Training übernehmen geht am PC (Health → Heart).")}</section>`
        : ""
    }
    ${loadHtml(w, from)}
    ${biosensingHtml(inPeriod(w.biosensing))}
    ${associationsHtml(w)}
    <p class="muted small">Quelle: Polar (am PC unter Settings → Polar). Nur Messwerte und Rechnungen, keine medizinische Bewertung.</p>`;
}

/** Sleep → Gemessene Nächte (nur wenn im Zeitraum vorhanden). `logs` = eigene Nächte wie am PC. */
export function measuredSleepHtml(catalog, from, to, logs) {
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
    ${nightDetailHtml(nights[0], wearableOf(catalog))}
    ${note("Gemessen von der Uhr (Polar, am PC synchronisiert). Wearables erkennen Schlaf und Wach recht gut, Schlafphasen nur mäßig genau – aussagekräftig ist der Verlauf über viele Nächte. Schwankung der Einschlafzeit = Standardabweichung (ab 3 Nächten).")}
  </section>`;
}

const STAGE_COLOR = { wake: "#7A889D", rem: "#2F86B8", light: "#A39BE3", deep: "#2E2580", unknown: "#DCE3EC" };
const evening = (m) => ((m % 1440) + 1440) % 1440;

/** Letzte Nacht im Detail: Schlafverlauf, Werte von Polar, SleepWise (wie MeasuredSleepCard am PC). */
function nightDetailHtml(n, w) {
  if (!n) return "";
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
    </div>
    ${charge ? `<p class="muted small">Sleep Charge laut Polar: <strong>${esc(charge)}</strong>${skin?.value != null ? ` · Hauttemperatur ${num(skin.value, 1)} °C` : ""}</p>` : skin?.value != null ? `<p class="muted small">Hauttemperatur ${num(skin.value, 1)} °C</p>` : ""}
    ${
      segs.length && total > 0
        ? `<div class="goal-bar goal-bar--energy" role="img" aria-label="Schlafverlauf">${segs
            .map((x) => `<span class="goal-bar__fill" style="width:${(((x.to - x.from) / total) * 100).toFixed(2)}%;background:${STAGE_COLOR[x.stage]}" title="${W.STAGE_LABEL[x.stage]} ${W.clockOf(evening(Math.round(x.from)))}–${W.clockOf(evening(Math.round(x.to)))}"></span>`)
            .join("")}</div><p class="muted small">${["deep", "light", "rem", "wake"].map((k) => `<span style="color:${STAGE_COLOR[k]}">■</span> ${W.STAGE_LABEL[k]}`).join(" · ")} · ${W.clockOf(evening(Math.round(segs[0].from)))}–${W.clockOf(evening(Math.round(segs[segs.length - 1].to)))} Uhr</p>`
        : ""
    }
    ${swLines.length ? `<h4 class="logs-sub">SleepWise (Polar)</h4><ul class="list">${swLines.map((l) => `<li class="muted small">${l}</li>`).join("")}</ul>` : ""}`;
}
