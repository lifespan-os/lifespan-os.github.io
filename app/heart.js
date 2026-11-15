// LIFESPAN OS Mobil – Health → Heart und Sleep → Gemessene Nächte (1.42.0), gleiche Inhalte und
// Rechnungen wie am PC (HeartTab.tsx, MeasuredSleepCard.tsx; Rechnungen in wearabledata.js aus
// src/domain/wearable.ts). Daten aus dem PC-Export: heart_rate_day, wearable_sleep,
// wearable_recovery, wearable_exercise (am PC über Settings → Polar synchronisiert).

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
  };
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

  return `<section class="card logs-toolbar">
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
            .map((r) => `<li class="meal-item"><span><b>${esc(D.formatDate(r.date))}</b><br><span class="muted small">Ø HF ${num(r.hrAvg)} /min · Atem ${num(r.breathingAvg, 1)} /min · ANS ${num(r.ansCharge, 1)}</span></span><strong>${r.hrvMs != null ? `${num(r.hrvMs)} ms` : "–"}</strong></li>`)
            .join("")}</ul>${note("ANS-Ladung ist ein Rechenwert von Polar, kein Messwert.")}</section>`
        : ""
    }
    ${
      exercises.length
        ? `<section class="card"><div class="wo-head"><h3>Trainings der Uhr</h3></div><ul class="list">${exercises
            .map((e) => `<li class="meal-item"><span><b>${esc(e.detailedSport ?? e.sport ?? "Training")}</b><br><span class="muted small">${esc(D.formatDate(e.date))}${e.startTime && e.startTime.length >= 16 ? `, ${esc(e.startTime.slice(11, 16))} Uhr` : ""} · ${dur(e.durationS != null ? e.durationS / 60 : null)}</span></span><span class="muted small">Ø ${num(e.hrAvg)} / max ${num(e.hrMax)}</span></li>`)
            .join("")}</ul></section>`
        : ""
    }
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
        return `<li class="meal-item"><span><b>${esc(D.formatDate(n.date))}</b><br><span class="muted small">Tief ${min(n.deepS)} · REM ${min(n.remS)} · Leicht ${min(n.lightS)} · Unterbr. ${min(n.interruptionS)}${low !== null ? ` · min. HF ${low}` : ""}</span></span><span><strong>${dur(W.measuredSleepMin(n))}</strong>${o && o.method !== n.source ? `<br><span class="muted small">eigene ${dur(o.sleepMin)}</span>` : ""}</span></li>`;
      })
      .join("")}</ul>
    ${note("Gemessen von der Uhr (Polar, am PC synchronisiert). Wearables erkennen Schlaf und Wach recht gut, Schlafphasen nur mäßig genau – aussagekräftig ist der Verlauf über viele Nächte. Schwankung der Einschlafzeit = Standardabweichung (ab 3 Nächten).")}
  </section>`;
}
