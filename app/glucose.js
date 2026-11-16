// LIFESPAN OS Mobil – Health → Blutzucker (1.44.0, Import am Handy seit 1.45.0), wie am PC
// (GlucoseTab.tsx; Rechnungen in wearabledata.js aus src/domain/glucose.ts). Daten aus dem PC-Export:
// glucose_reading (am PC aus LibreView, Dexcom Clarity, eigener CSV, Apple Health oder selbst
// eingetragen); Mahlzeiten des Tages aus meal. Nur Messwerte und Rechnungen, keine Bewertung.

import * as D from "./pcdomain.js";
import * as W from "./wearabledata.js";
import * as N from "./nutrition.js";
import { today } from "./diary.js";
import { minutesBetween } from "./logsdata.js";
import * as GLD from "./glucosedata.js";
import { COLOR, esc, trendSvg } from "./pcview.js";

const DAY_MS = 86400000;
const shift = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const num = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : D.formatNumber(v, d));
const note = (t) => `<p class="card__note">${t}</p>`;

/** Farben der Bereiche (wie am PC: tief/niedrig/Ziel/hoch/sehr hoch) */
const RANGE_COLOR = { veryLow: "#B3261E", low: "#E46962", inRange: "#2E7D32", high: "#E0A100", veryHigh: "#B36200" };
const KIND_LABEL = { cgm: "Sensor", scan: "Scan", manual: "Messung" };

/** Werte vom PC und vom Handy (`local` = Ablage aus glucosedata.js). */
export function readingsOf(catalog, local = null) {
  return GLD.allReadings(catalog, local);
}

export function hasGlucose(catalog, local = null) {
  return readingsOf(catalog, local).length > 0;
}

/** Datei einlesen und eigene Messung eintragen (1.45.0). */
function ownHtml(catalog, local, state) {
  const mine = Object.values(GLD.glucoseState(local).rows)
    .map((e) => e.row)
    .sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  const manual = mine.filter((r) => r.kind === "manual").slice(0, 10);
  const fromFiles = mine.length - mine.filter((r) => r.kind === "manual").length;
  const msg = state.message;
  return `<section class="card"><div class="wo-head"><h3>Werte erfassen</h3></div>
    <label class="btn block">Datei einlesen (LibreView, Dexcom Clarity, CSV) …<input type="file" data-glucose-file="1" accept=".csv,.txt,text/csv,text/plain" hidden></label>
    ${msg ? `<p class="${msg.error ? "field-error" : "small"}">${esc(msg.text)}</p>` : ""}
    <label class="field"><span>Zeitpunkt der Messung</span><input type="datetime-local" id="gl-at" value="${esc(state.at ?? `${today()}T${new Date().toTimeString().slice(0, 5)}`)}"></label>
    <label class="field"><span>Blutzucker in mg/dl</span><input type="number" id="gl-mg" inputmode="decimal" min="10" max="700" step="1" value=""></label>
    <button class="btn primary block" data-act="glucose-add">Messung speichern</button>
    ${
      manual.length
        ? `<ul class="list">${manual.map((r) => `<li class="meal-item"><span><b>${esc(D.formatDate(r.date))}, ${esc(r.measured_at.slice(11))}</b><br><span class="muted small">${esc(r.source)}</span></span><span><strong>${num(Number(r.mg_dl))}</strong> <button class="linkbtn" data-act="glucose-del" data-arg="${esc(r.id)}">Löschen</button></span></li>`).join("")}</ul>`
        : ""
    }
    <p class="muted small">${fromFiles ? `${num(fromFiles)} Werte aus Dateien am Handy. ` : ""}${GLD.unsentGlucose(local) ? `${num(GLD.unsentGlucose(local))} noch nicht an den PC gesendet – mit „Körperwerte … senden“.` : "Alles am Handy Erfasste ist beim PC."}</p>
  </section>`;
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

/**
 * Blutzucker und Alltag (1.45.0, wie GlucoseInsightsCard am PC): Anstieg nach Mahlzeiten nach
 * Kohlenhydraten (aus meal + meal_item + Lebensmitteln des Exports), Training und Schlaf.
 */
function contextHtml(catalog, readings) {
  const pc = catalog?.pc ?? {};
  const days = new Set(readings.map((r) => r.measuredAt.slice(0, 10)));
  const foods = N.allFoods(catalog, N.emptyLocal());
  const items = new Map();
  for (const it of pc.meal_item ?? []) items.set(it.meal_id, [...(items.get(it.meal_id) ?? []), it]);
  const meals = (pc.meal ?? [])
    .filter((m) => days.has(m.date) && m.time && items.has(m.id))
    .map((m) => {
      const n = N.sumNutrients(
        (items.get(m.id) ?? []).map((it) => foods.get(it.food_id)).map((f, i) => (f ? N.nutrientsFor(f, items.get(m.id)[i].amount) : null)).filter(Boolean),
      );
      return { date: m.date, time: String(m.time).slice(0, 5), label: m.name || N.mealLabel(m.meal_type), carbsG: n.carbs, energyKcal: n.kcal };
    });
  const mealRows = W.mealGlucoseRows(readings, meals);
  const workouts = W.workoutGlucoseRows(
    readings,
    (pc.workout ?? [])
      .filter((w) => w.status === "done" && w.start_time && w.duration_min && days.has(w.date))
      .map((w) => ({ date: w.date, startTime: String(w.start_time).slice(0, 5), durationMin: w.duration_min, title: w.title ?? "Training" })),
  );
  const sleep = W.sleepGlucoseRows(
    readings,
    (pc.sleep_log ?? [])
      .filter((s) => days.has(s.date) && s.bed_time && s.wake_time)
      .map((s) => ({ date: s.date, durationMin: Math.max(0, (minutesBetween(s.bed_time, s.wake_time) ?? 0) - (s.sleep_latency_min ?? 0) - (s.awake_min ?? 0)) })),
  );
  if (!mealRows.length && !workouts.length && !sleep.length) return "";
  const mg = (v) => (v === null || v === undefined ? "–" : num(v));
  const groups = (list, unit, signed) =>
    `<ul class="list">${list.map((g) => `<li class="muted small">${esc(g.label)}: ${g.mean !== null ? `<strong>Ø ${signed ? W.signedText(g.mean, 0) : num(g.mean)} ${unit}</strong>` : "zu wenige Werte"} (${g.count})</li>`).join("")}</ul>`;
  return `<section class="card"><div class="wo-head"><h3>Blutzucker und Alltag</h3></div>
    ${mealRows.length ? `<h4 class="logs-sub">Anstieg nach Mahlzeiten nach Kohlenhydraten</h4>${groups(W.riseByCarbs(mealRows), "mg/dl", true)}` : ""}
    ${
      workouts.length
        ? `<h4 class="logs-sub">Training</h4><ul class="list">${[...workouts].reverse().slice(0, 8).map((w) => `<li class="meal-item"><span><b>${esc(D.formatDate(w.date))}, ${esc(w.startTime)} · ${esc(w.title)}</b><br><span class="muted small">vorher ${mg(w.before)} · während ${mg(w.during)} · danach ${mg(w.after)} mg/dl</span></span><strong class="glucose-rise">min ${mg(w.min)}</strong></li>`).join("")}</ul>`
        : ""
    }
    ${sleep.length ? `<h4 class="logs-sub">Schlaf und Blutzucker</h4>${groups(W.dayMeanBySleep(sleep), "mg/dl am Tag", false)}` : ""}
    ${note(`Mahlzeiten mit Uhrzeit (vorher = bis 20 min davor, höchster Wert in 3 Std.), Training mit Startzeit und Dauer (1 Std. vorher, während, 2 Std. danach), Schlaf mit Tagesmittel 06–24 Uhr. Gruppenmittel ab ${W.MIN_GROUP} Werten, in Klammern die Anzahl. Gegenüberstellungen, keine Ursachen.`)}
  </section>`;
}

/** Health → Blutzucker. `state` = { days, day } aus dem App-Zustand. */
export function glucoseTabHtml(catalog, state = {}, local = null) {
  const all = readingsOf(catalog, local);
  if (!all.length) {
    return `<section class="card"><div class="empty-state"><p><strong>Noch keine Blutzuckerwerte</strong></p><p class="muted small">Lies hier eine Datei aus LibreView (FreeStyle Libre), Dexcom Clarity oder eine eigene Tabelle ein oder trage eine Messung ein. Am PC geht das unter Health → Blutzucker, auch mit dem Apple-Health-Export.</p></div></section>${ownHtml(catalog, local, state)}`;
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
    ${contextHtml(catalog, period)}
    ${ownHtml(catalog, local, state)}
    <p class="muted small">Quellen: ${esc([...new Set(all.map((r) => r.source))].join(", "))}.</p>`;
}
