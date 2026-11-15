// LIFESPAN OS Mobil – Health → Blutzucker (1.44.0), gleiche Inhalte und Rechnungen wie am PC
// (GlucoseTab.tsx; Rechnungen in wearabledata.js aus src/domain/glucose.ts). Daten aus dem PC-Export:
// glucose_reading (am PC aus LibreView, Dexcom Clarity, eigener CSV, Apple Health oder selbst
// eingetragen); Mahlzeiten des Tages aus meal. Nur Messwerte und Rechnungen, keine Bewertung.

import * as D from "./pcdomain.js";
import * as W from "./wearabledata.js";
import * as N from "./nutrition.js";
import { today } from "./diary.js";
import { COLOR, esc, trendSvg } from "./pcview.js";

const DAY_MS = 86400000;
const shift = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const num = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : D.formatNumber(v, d));
const note = (t) => `<p class="card__note">${t}</p>`;

/** Farben der Bereiche (wie am PC: tief/niedrig/Ziel/hoch/sehr hoch) */
const RANGE_COLOR = { veryLow: "#B3261E", low: "#E46962", inRange: "#2E7D32", high: "#E0A100", veryHigh: "#B36200" };
const KIND_LABEL = { cgm: "Sensor", scan: "Scan", manual: "Messung" };

export function readingsOf(catalog) {
  return (catalog?.pc?.glucose_reading ?? [])
    .filter((r) => typeof r.measured_at === "string" && typeof r.mg_dl === "number")
    .map((r) => ({ id: r.id, measuredAt: r.measured_at, mgDl: r.mg_dl, source: r.source, kind: r.kind, notes: r.notes ?? null }))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
}

export function hasGlucose(catalog) {
  return (catalog?.pc?.glucose_reading ?? []).length > 0;
}

/** Werte eines Tages über 24 Stunden mit Zielbereich 70–180 und Mahlzeiten. */
function daySvg(values, meals) {
  if (!values.length) return "";
  const Wd = 340;
  const H = 180;
  const L = 34;
  const R = 6;
  const T = 8;
  const B = 20;
  const x = (m) => L + (m / 1440) * (Wd - L - R);
  const lo = Math.min(40, ...values.map((v) => v.mgDl)) - 5;
  const hi = Math.max(200, ...values.map((v) => v.mgDl)) + 10;
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = values.map((v) => [W.minuteOfReading(v), v]);
  const cgm = pts.filter(([, v]) => v.kind === "cgm");
  const line = cgm.length > 1 ? `<polyline points="${cgm.map(([m, v]) => `${x(m).toFixed(1)},${y(v.mgDl).toFixed(1)}`).join(" ")}" fill="none" stroke="${COLOR.body}" stroke-width="1.5" stroke-linejoin="round"/>` : "";
  const dots = pts
    .filter(([, v]) => v.kind !== "cgm" || cgm.length < 2)
    .map(([m, v]) => `<circle cx="${x(m).toFixed(1)}" cy="${y(v.mgDl).toFixed(1)}" r="3" fill="${COLOR.body}"><title>${W.clockOf(m)} · ${num(v.mgDl)} mg/dl (${KIND_LABEL[v.kind] ?? ""})</title></circle>`)
    .join("");
  const mealLines = meals
    .map((m) => {
      const mm = Number(m.time.slice(0, 2)) * 60 + Number(m.time.slice(3, 5));
      return `<line x1="${x(mm).toFixed(1)}" x2="${x(mm).toFixed(1)}" y1="${T}" y2="${H - B}" stroke="${COLOR.nutrition}" stroke-dasharray="3 3"><title>${esc(m.time)} · ${esc(m.label)}</title></line>`;
    })
    .join("");
  return `<svg class="pc-chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Blutzucker über den Tag">
    <rect x="${L}" y="${y(180).toFixed(1)}" width="${Wd - L - R}" height="${(y(70) - y(180)).toFixed(1)}" fill="${RANGE_COLOR.inRange}" fill-opacity="0.08"/>
    ${[70, 180].map((v) => `<line x1="${L}" x2="${Wd - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`).join("")}
    ${mealLines}${line}${dots}
    ${[0, 360, 720, 1080, 1440].map((m) => `<text x="${x(m).toFixed(1)}" y="${H - 5}" text-anchor="${m === 0 ? "start" : m === 1440 ? "end" : "middle"}">${String(m / 60).padStart(2, "0")}:00</text>`).join("")}
  </svg>`;
}

/** Tagesprofil: Median mit Bändern 25–75 % und 10–90 % je Stunde. */
function profileSvg(profile) {
  if (profile.length < 3) return "";
  const Wd = 340;
  const H = 170;
  const L = 34;
  const R = 6;
  const T = 8;
  const B = 20;
  const x = (m) => L + ((m + 30) / 1440) * (Wd - L - R);
  const lo = Math.min(60, ...profile.map((p) => p.p10)) - 5;
  const hi = Math.max(190, ...profile.map((p) => p.p90)) + 5;
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const band = (a, b) => `${profile.map((p) => `${x(p.minute).toFixed(1)},${y(p[b]).toFixed(1)}`).join(" ")} ${[...profile].reverse().map((p) => `${x(p.minute).toFixed(1)},${y(p[a]).toFixed(1)}`).join(" ")}`;
  return `<svg class="pc-chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Tagesprofil des Blutzuckers">
    ${[70, 180].map((v) => `<line x1="${L}" x2="${Wd - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`).join("")}
    <polygon points="${band("p10", "p90")}" fill="${COLOR.body}" fill-opacity="0.12"/>
    <polygon points="${band("p25", "p75")}" fill="${COLOR.body}" fill-opacity="0.22"/>
    <polyline points="${profile.map((p) => `${x(p.minute).toFixed(1)},${y(p.median).toFixed(1)}`).join(" ")}" fill="none" stroke="${COLOR.body}" stroke-width="1.8"/>
    ${[0, 360, 720, 1080, 1440].map((m) => `<text x="${(L + (m / 1440) * (Wd - L - R)).toFixed(1)}" y="${H - 5}" text-anchor="${m === 0 ? "start" : m === 1440 ? "end" : "middle"}">${String(m / 60).padStart(2, "0")}:00</text>`).join("")}
  </svg>`;
}

function mealsOf(catalog, day) {
  return (catalog?.pc?.meal ?? [])
    .filter((m) => m.date === day && m.time)
    .map((m) => ({ time: String(m.time).slice(0, 5), label: m.name || N.mealLabel(m.meal_type) }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Health → Blutzucker. `state` = { days, day } aus dem App-Zustand. */
export function glucoseTabHtml(catalog, state = {}) {
  const all = readingsOf(catalog);
  if (!all.length) {
    return `<section class="card"><div class="empty-state"><p><strong>Noch keine Blutzuckerwerte</strong></p><p class="muted small">Am PC unter Health → Blutzucker eine Datei aus LibreView (FreeStyle Libre), Dexcom Clarity oder eine eigene Tabelle importieren – oder den Apple-Health-Export unter Settings → Geräte-Import wählen. Nach dem nächsten Export erscheinen die Werte hier.</p></div></section>`;
  }
  const t = today();
  const days = state.days ?? 14;
  const lastDate = all[all.length - 1].measuredAt.slice(0, 10);
  const to = lastDate < t ? lastDate : t;
  const from = shift(to, -(days - 1));
  const period = all.filter((r) => r.measuredAt.slice(0, 10) >= from && r.measuredAt.slice(0, 10) <= to);
  const st = W.glucoseStats(period);
  const dayOptions = [...new Set(all.map((r) => r.measuredAt.slice(0, 10)))].sort().reverse().slice(0, 90);
  const day = state.day && dayOptions.includes(state.day) ? state.day : dayOptions[0];
  const values = W.dayReadings(all, day);
  const meals = mealsOf(catalog, day);
  const responses = meals.map((m) => W.mealResponse(values, m));
  const profile = W.dailyProfile(period);
  const means = W.dailyMeans(period);
  const nights = W.nightStats(period).reverse();

  return `<section class="card logs-toolbar">
      <label class="field logs-select"><span>Zeitraum</span><select data-glucose="days">${[
        [7, "7 Tage"],
        [14, "14 Tage"],
        [30, "30 Tage"],
        [90, "90 Tage"],
      ].map(([v, l]) => `<option value="${v}" ${v === days ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    </section>
    <section class="card"><div class="wo-head"><h3>Überblick</h3></div>
      ${
        st.count
          ? `<div class="stat">
        <div><b>${num(st.mean)} mg/dl</b><span>Mittelwert</span></div>
        <div><b>${num(st.ranges.inRange)} %</b><span>im Bereich 70–180</span></div>
        <div><b>${num(st.cv)} %</b><span>Schwankung (CV)</span></div>
        <div><b>${st.gmi !== null ? `${num(st.gmi, 1)} %` : "–"}</b><span>GMI${st.gmi === null ? " (ab 10 Tagen)" : ""}</span></div>
      </div>
      <div class="goal-bar goal-bar--energy" role="img" aria-label="Anteile je Bereich">${W.RANGES.map((r) => (st.ranges[r.key] > 0 ? `<span class="goal-bar__fill" style="width:${st.ranges[r.key].toFixed(2)}%;background:${RANGE_COLOR[r.key]}" title="${r.label}: ${num(st.ranges[r.key])} %"></span>` : "")).join("")}</div>
      <p class="muted small">${W.RANGES.map((r) => `<span style="color:${RANGE_COLOR[r.key]}">■</span> ${r.label}: ${num(st.ranges[r.key])} %`).join(" · ")} (mg/dl)</p>
      <p class="muted small">${num(st.count)} Werte an ${num(st.days)} Tagen · niedrigster ${num(st.min)} · höchster ${num(st.max)} mg/dl${st.mean !== null ? ` · Mittel ${num(W.mmol(st.mean), 1)} mmol/l` : ""}</p>`
          : `<p class="muted">Im gewählten Zeitraum gibt es keine Werte.</p>`
      }
      ${note("Bereiche nach dem internationalen Konsens für Sensorwerte (unter 54, 54–69, 70–180, 181–250, über 250 mg/dl). GMI = 3,31 + 0,02392 × Mittelwert. Nur Messwerte und Rechnungen, keine Diagnose.")}
    </section>
    <section class="card"><div class="wo-head"><h3>Blutzucker am Tag</h3></div>
      <label class="field"><span>Tag</span><select data-glucose="day">${dayOptions.map((d) => `<option value="${d}" ${d === day ? "selected" : ""}>${esc(D.formatDate(d))}</option>`).join("")}</select></label>
      ${daySvg(values, meals)}
      ${meals.length ? `<p class="muted small"><span style="color:${COLOR.nutrition}">┊</span> Mahlzeiten aus dem Tagebuch</p>` : ""}
      ${
        responses.length
          ? `<h4 class="logs-sub">Nach den Mahlzeiten</h4><ul class="list">${responses
              .map((r) => `<li class="meal-item"><span><b>${esc(r.time)} Uhr · ${esc(r.label)}</b><br><span class="muted small">vorher ${num(r.before)} · höchster ${num(r.peak)}${r.peakAfterMin !== null ? ` nach ${num(r.peakAfterMin)} min` : ""} · nach 2 Std. ${num(r.after2h)} mg/dl</span></span><strong class="glucose-rise">${r.rise !== null ? `${W.signedText(r.rise, 0)} mg/dl` : "–"}</strong></li>`)
              .join("")}</ul>${note("Vorher = letzter Wert bis 20 Minuten vor der Mahlzeit, höchster Wert in den 3 Stunden danach, „nach 2 Std.“ = Wert 110–130 Minuten danach. Rechts der Anstieg.")}`
          : `<p class="muted small">Für den Verlauf nach dem Essen Mahlzeiten mit Uhrzeit im Tagebuch eintragen.</p>`
      }
    </section>
    ${
      profile.length >= 3
        ? `<section class="card"><div class="wo-head"><h3>Tagesprofil</h3></div>${profileSvg(profile)}${note("Je Stunde über den Zeitraum: Linie = Median, dunkles Band = mittlere Hälfte (25–75 %), helles Band = 10–90 %. Stunden mit weniger als 3 Werten fehlen.")}</section>`
        : ""
    }
    ${
      means.length > 1
        ? `<section class="card"><div class="wo-head"><h3>Mittelwert je Tag</h3></div>${trendSvg(means, { color: COLOR.body, decimals: 0, height: 160, label: "Blutzucker-Mittelwert je Tag" })}</section>`
        : ""
    }
    ${
      nights.length
        ? `<section class="card"><div class="wo-head"><h3>Nächte (00–06 Uhr)</h3></div><ul class="list">${nights
            .map((n) => `<li class="meal-item"><span><b>${esc(D.formatDate(n.date))}</b><br><span class="muted small">niedrigster ${num(n.min)} mg/dl · ${num(n.count)} Werte</span></span><strong>Ø ${num(n.mean)}</strong></li>`)
            .join("")}</ul>${note("Nur Nächte mit mindestens 6 Werten.")}</section>`
        : ""
    }
    <p class="muted small">Quellen: ${esc([...new Set(all.map((r) => r.source))].join(", "))}. Import und eigene Messungen am PC (Health → Blutzucker).</p>`;
}
