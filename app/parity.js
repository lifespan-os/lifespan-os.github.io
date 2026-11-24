// LIFESPAN OS Mobil – Angleichung an den PC (1.89.0, Paket A): Bausteine, die es am PC schon gibt.
// - Masterclass-Verweis am Messwert (PC `MasterclassLink.tsx`, `domain/masterclassLinks.ts`)
// - Superhuman → Wirkstoffspiegel: „Blutwerte und Hormongabe“ (PC `LabDoseContextCard.tsx`, `domain/labDoseContext.ts`)
// - Superhuman → Zeitachse (PC `TimelineTab.tsx`, `domain/superhumanTimeline.ts`)
// - Training → NEAT: „Schritte über 24 Stunden“ (PC `StepsTimelineCard.tsx`, `domain/stepsByTime.ts`)
// Rechnung immer aus pcdomain.js; hier nur Anzeige und Aktionen.

import * as D from "./pcdomain.js";
import * as H from "./healthdata.js";
import * as SD from "./superdata.js";
import * as B from "./bodydata.js";
import { X, today } from "./diary.js";
import { wearableOf } from "./heart.js";
import { autoAttrs, autoSaveHtml } from "./autosave.js";

const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);

// ------------------------------------------------------------------ Masterclass-Verweis

const BOOK_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>`;

/** Kleines Buch-Symbol, öffnet „Ask iCoach.me“ mit dem passenden Suchwort; ohne Zuordnung leer. */
export function masterclassLinkHtml(name, { withText = false } = {}) {
  const topic = D.masterclassLinks?.masterclassTopic(name) ?? null;
  if (!topic) return "";
  const label = `Masterclass: Fragen und Antworten zu ${topic}`;
  return `<button type="button" class="mc-link" data-act="mc-search" data-arg="${esc(topic)}" title="${esc(label)}" aria-label="${esc(label)}">${BOOK_ICON}${withText ? "<span>Masterclass</span>" : ""}</button>`;
}

// ------------------------------------------------------------------ Blutwerte und Hormongabe

const MAX_ANALYTES = 6;

function labValueText(r) {
  const L = D.lab;
  const mark = L.FLAG_MARKS[L.flagOf(r.value, r.comparator, L.rangeFor(r))];
  return `${L.formatLabValue(r.value, r.comparator)}${mark ? ` ${mark}` : ""}`;
}

/** Karte unter Superhuman → Wirkstoffspiegel (`entries` = HRT-Einträge, `events` = Gaben daraus). */
export function doseContextHtml(entries, events, measurand) {
  const S = X.S;
  if (!D.labDoseContext) return "";
  const draws = H.drawsOf(S.catalog, S.health);
  const ctx = D.labDoseContext.labDoseContext(draws, entries, events, measurand);
  if (ctx.rows.length === 0) {
    return `<section class="card"><div class="wo-head"><h3>Blutwerte und Hormongabe</h3><span class="tag">Health</span></div>
      <p class="muted small">Noch keine Blutabnahme eingetragen. <button class="linkbtn" data-act="menu-go" data-arg="health">Blutwerte unter Health eintragen</button></p></section>`;
  }
  const chosen = (S.doseCtxPick ?? D.labDoseContext.defaultAnalyteIds(ctx)).filter((id) => ctx.analytes.some((a) => a.id === id));
  const cols = ctx.analytes.filter((a) => chosen.includes(a.id));
  const label = D.hormoneLevel.MEASURAND_LABELS[measurand] ?? measurand;
  const sub = (t) => `<span class="muted small dose-ctx__sub">${esc(t)}</span>`;
  return `<section class="card">
    <div class="wo-head"><h3>Blutwerte und Hormongabe</h3><span class="tag">${esc(label)} · ${ctx.rows.length} ${ctx.rows.length === 1 ? "Abnahme" : "Abnahmen"}</span></div>
    <div class="chip-row" role="group" aria-label="Blutwerte in der Tabelle">${ctx.analytes
      .map((a) => `<button type="button" class="chip ${chosen.includes(a.id) ? "on" : ""}" aria-pressed="${chosen.includes(a.id)}" data-act="dose-ctx-pick" data-arg="${esc(a.id)}">${esc(a.name)}</button>`)
      .join("")}</div>
    <div class="table-scroll"><table class="data-table dose-ctx"><thead><tr><th>Blutabnahme</th><th>Letzte Gabe</th><th class="tnum">Abstand</th><th class="tnum">Ø Wochendosis</th><th class="tnum">Modellspiegel</th>${cols
      .map((a) => `<th class="tnum">${esc(a.name)}${sub(a.unit)}</th>`)
      .join("")}</tr></thead><tbody>${ctx.rows
      .map((r) => {
        const last = r.lastDose ? `${F(r.lastDose.amount, 2)} ${esc(r.lastDose.unit)} ${esc(r.lastDose.hormone)}${sub(D.formatDate(r.lastDose.date))}` : "–";
        const change = r.doseChange !== null ? sub(`${r.doseChange > 0 ? "▲ +" : "▼ −"}${F(Math.abs(r.doseChange), 1)} ${r.weeklyUnit ?? ""}`) : "";
        return `<tr><td>${esc(D.formatDate(r.date))}${r.time ? sub(`${r.time} Uhr`) : ""}</td><td>${last}</td>
          <td class="tnum">${r.daysSinceDose === null ? "–" : `${F(r.daysSinceDose, 1)} Tage`}</td>
          <td class="tnum">${r.weeklyDose === null ? "–" : `${F(r.weeklyDose, 1)} ${esc(r.weeklyUnit ?? "")}`}${change}</td>
          <td class="tnum">${r.levelPercent === null ? "–" : `${F(r.levelPercent)} %`}</td>
          ${cols
            .map((a) => {
              const res = r.results.get(a.id);
              return `<td class="tnum">${res ? esc(labValueText(res)) : "–"}${res && res.unit !== a.unit ? sub(res.unit) : ""}</td>`;
            })
            .join("")}</tr>`;
      })
      .join("")}</tbody></table></div>
    <details class="card-info"><summary class="muted small">So ist die Tabelle aufgebaut</summary><p class="muted small">Je Blutabnahme: letzte durchgeführte Gabe davor, Abstand in Tagen, mittlere Wochendosis der ${D.labDoseContext.WEEKLY_DOSE_DAYS} Tage davor (▲/▼ = mehr als 10 % anders als bei der Abnahme davor) und der Modellspiegel zum Zeitpunkt der Abnahme in Prozent vom Höchstwert. ↑/↓ = über bzw. unter dem Bereich laut Befund. Blutabnahmen ohne Uhrzeit gelten um 08:00. Nur Werte nebeneinander, keine Bewertung. Bis zu ${MAX_ANALYTES} Blutwerte wählbar.</p></details>
  </section>`;
}

// ------------------------------------------------------------------ Superhuman → Zeitachse

const TL_RANGES = [
  ["90", "90 Tage"],
  ["180", "6 Monate"],
  ["365", "1 Jahr"],
];

function bodyMeasurements() {
  const S = X.S;
  const metrics = new Map((S.catalog?.body?.metrics ?? []).map((m) => [m.id, m]));
  const out = [];
  for (const [metricId, list] of B.allValues(S.catalog, S.body?.local ?? { entries: {} })) {
    const m = metrics.get(metricId);
    if (!m) continue;
    for (const v of list) out.push({ metricId, metricName: m.name, unit: m.unit, value: Number(v.row.value), date: v.row.date, time: v.row.time ?? null });
  }
  return out;
}

function axis(values) {
  if (values.length === 0) return { lo: 0, hi: 1 };
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.1;
  return { lo: lo - pad, hi: hi + pad };
}

export function timelineTab(hrtEntries) {
  const S = X.S;
  const T = D.superhumanTimeline;
  if (!T) return `<section class="card"><p class="muted">Die Zeitachse kommt mit der nächsten Rechenregel-Datei.</p></section>`;
  const range = S.tlRange ?? "180";
  const to = today();
  const from = D.trends.shiftDays(to, -Number(range));
  const input = {
    from,
    to,
    hrt: hrtEntries,
    protocol: SD.protocolEntriesOf(S.catalog, S.super, from),
    draws: H.drawsOf(S.catalog, S.health),
    measurements: bodyMeasurements(),
  };
  const pre = T.superhumanTimeline({ ...input, analyteId: null, metricId: null });
  const aId = pre.analytes.some((a) => a.id === S.tlLab) ? S.tlLab : (pre.analytes[0]?.id ?? "");
  const mId = pre.metrics.some((m) => m.id === S.tlBody) ? S.tlBody : (pre.metrics.find((m) => m.name === "Gewicht")?.id ?? pre.metrics[0]?.id ?? "");
  const t = T.superhumanTimeline({ ...input, analyteId: aId || null, metricId: mId || null });
  const analyte = t.analytes.find((a) => a.id === aId);
  const metric = t.metrics.find((m) => m.id === mId);
  const Wd = 360;
  const Ht = 220;
  const PAD = { left: 40, right: 40, top: 14, bottom: 40 };
  const span = Math.max(1, D.trends.daysBetween(from, to) - 1);
  const plotW = Wd - PAD.left - PAD.right;
  const plotH = Ht - PAD.top - PAD.bottom;
  const x = (d) => PAD.left + ((D.trends.daysBetween(from, d) - 1) / span) * plotW;
  const la = axis(t.lab.map((p) => p.value));
  const ba = axis(t.body.map((p) => p.value));
  const y = (v, a) => PAD.top + plotH - ((v - a.lo) / (a.hi - a.lo)) * plotH;
  const line = t.body.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value, ba).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: 4 }, (_, i) => D.trends.shiftDays(from, Math.round((span * i) / 3)));
  const opts = (list, cur) => (list.length ? list.map((o) => `<option value="${esc(o.id)}" ${o.id === cur ? "selected" : ""}>${esc(`${o.name} (${o.unit})`)}</option>`).join("") : `<option value="">keiner im Zeitraum</option>`);
  const short = (d) => D.formatDateShort?.(d) ?? D.formatDate(d).slice(0, 6);
  const svg = `<svg class="tl-chart" viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Zeitachse">
    <line x1="${PAD.left}" x2="${Wd - PAD.right}" y1="${PAD.top + plotH}" y2="${PAD.top + plotH}" class="tl-chart__axis"/>
    ${ticks.map((d) => `<text x="${x(d).toFixed(1)}" y="${Ht - 24}" text-anchor="middle" class="tl-chart__tick">${esc(short(d))}</text>`).join("")}
    ${t.doses.map((d) => `<line x1="${x(d.date).toFixed(1)}" x2="${x(d.date).toFixed(1)}" y1="${Ht - 16}" y2="${Ht - 4}" class="tl-chart__dose"><title>${esc(`${short(d.date)}: ${d.label}`)}</title></line>`).join("")}
    ${t.body.length > 1 ? `<path d="${line}" class="tl-chart__body"/>` : ""}
    ${t.body.length ? `<text x="${PAD.left - 4}" y="${PAD.top + 9}" text-anchor="end" class="tl-chart__lbl tl-chart__lbl--body">${esc(F(ba.hi, 1))}</text><text x="${PAD.left - 4}" y="${PAD.top + plotH}" text-anchor="end" class="tl-chart__lbl tl-chart__lbl--body">${esc(F(ba.lo, 1))}</text>` : ""}
    ${t.lab.map((p) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.value, la).toFixed(1)}" r="4.5" class="tl-chart__lab"><title>${esc(`${short(p.date)}: ${F(p.value, 1)} ${analyte?.unit ?? ""}`)}</title></circle>`).join("")}
    ${t.lab.length ? `<text x="${Wd - PAD.right + 4}" y="${PAD.top + 9}" class="tl-chart__lbl tl-chart__lbl--lab">${esc(F(la.hi, 1))}</text><text x="${Wd - PAD.right + 4}" y="${PAD.top + plotH}" class="tl-chart__lbl tl-chart__lbl--lab">${esc(F(la.lo, 1))}</text>` : ""}
  </svg>`;
  return `<section class="card"><div class="wo-head"><h3>Zeitachse: Gaben, Labor und Körper</h3><span class="tag">nur Werte, keine Deutung</span></div>
    <div class="segmented" role="group" aria-label="Zeitraum">${TL_RANGES.map(([v, l]) => `<button class="${v === range ? "is-active" : ""}" aria-pressed="${v === range}" data-act="tl-range" data-arg="${v}">${l}</button>`).join("")}</div>
    <div class="tl-pick">
      <label class="field"><span class="muted small">Laborwert</span><select data-parity="tl-lab">${opts(t.analytes, aId)}</select></label>
      <label class="field"><span class="muted small">Körperwert</span><select data-parity="tl-body">${opts(t.metrics, mId)}</select></label>
    </div>
    ${svg}
    <p class="muted small"><span class="tl-key tl-key--body"></span> ${metric ? esc(`${metric.name} (${metric.unit}, Achse links)`) : "kein Körperwert"} · <span class="tl-key tl-key--lab"></span> ${analyte ? esc(`${analyte.name} (${analyte.unit}, Achse rechts)`) : "kein Laborwert"} · <span class="tl-key tl-key--dose"></span> ${t.doses.length} ${t.doses.length === 1 ? "Gabe" : "Gaben"} (HRT und Protokoll)</p>
    <p class="muted small">Die Werte stehen nur nebeneinander – das ist keine Bewertung.</p></section>`;
}

// ------------------------------------------------------------------ Schritte über 24 Stunden

const SIZE_KEY = "lifespan.neat.stepBucket";
const pad2 = (n) => String(n).padStart(2, "0");

function stepSize() {
  try {
    return localStorage.getItem(SIZE_KEY) === "15" ? 15 : 60;
  } catch {
    return 60;
  }
}

export function stepsDayHtml(date) {
  const SB = D.stepsByTime;
  if (!SB) return "";
  const size = stepSize();
  const day = wearableOf(X.S.catalog).days.find((d) => d.date === date);
  const r = SB.stepsByTime(day?.stepSamples ?? null, size);
  const seg = `<div class="segmented" role="radiogroup" aria-label="Auflösung">${[
    [60, "Stunden"],
    [15, "Viertelstunden"],
  ]
    .map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === size}" class="${v === size ? "is-active" : ""}" data-act="steps-size" data-arg="${v}">${l}</button>`)
    .join("")}</div>`;
  if (!r) {
    return `<section class="card card--training"><div class="wo-head"><h3>Schritte über 24 Stunden</h3></div>${seg}
      <p class="muted small">Für den ${esc(D.formatDate(date))} gibt es keinen Schrittverlauf der Uhr. Er kommt mit der Polar-Synchronisierung am PC und dem nächsten Export.</p></section>`;
  }
  const Wd = 360;
  const Ht = 170;
  const PAD = { left: 40, right: 6, top: 8, bottom: 22 };
  const plotW = Wd - PAD.left - PAD.right;
  const plotH = Ht - PAD.top - PAD.bottom;
  const max = Math.max(1, ...r.buckets.map((b) => b.steps));
  const bw = plotW / r.buckets.length;
  const bars = r.buckets
    .map((b, i) => {
      const h = (b.steps / max) * plotH;
      const peak = r.peak && b.start === r.peak.start;
      return `<rect x="${(PAD.left + i * bw + 0.5).toFixed(1)}" y="${(PAD.top + plotH - h).toFixed(1)}" width="${Math.max(0.5, bw - 1).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" class="steps24__bar${peak ? " is-peak" : ""}"><title>${esc(`${SB.bucketLabel(b.start, size)} Uhr: ${F(b.steps)} Schritte`)}</title></rect>`;
    })
    .join("");
  const ticks = [0, 360, 720, 1080, 1440].map((m) => `<text x="${(PAD.left + (m / 1440) * plotW).toFixed(1)}" y="${Ht - 6}" text-anchor="middle" class="steps24__tick">${m >= 1440 ? "24:00" : `${pad2(m / 60)}:00`}</text>`).join("");
  const yl = `<text x="${PAD.left - 4}" y="${PAD.top + 8}" text-anchor="end" class="steps24__tick">${esc(F(max))}</text><text x="${PAD.left - 4}" y="${PAD.top + plotH}" text-anchor="end" class="steps24__tick">0</text>`;
  return `<section class="card card--training"><div class="wo-head"><h3>Schritte über 24 Stunden</h3></div>${seg}
    <p class="muted small">${esc(F(r.total))} Schritte gemessen${r.peak ? ` · am meisten ${esc(SB.bucketLabel(r.peak.start, size))} Uhr (${esc(F(r.peak.steps))})` : ""} · in ${r.activeBuckets} von ${r.buckets.length} ${size === 60 ? "Stunden" : "Viertelstunden"} unterwegs</p>
    <svg class="steps24" viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="${esc(`Gemessene Schritte ${size === 60 ? "je Stunde" : "je Viertelstunde"} am ${D.formatDate(date)}`)}"><line x1="${PAD.left}" x2="${Wd - PAD.right}" y1="${PAD.top + plotH}" y2="${PAD.top + plotH}" class="steps24__axis"/>${bars}${ticks}${yl}</svg>
    <p class="muted small">Gemessene Schritte der Uhr (Polar); die Tageszahl oben kann davon abweichen, wenn du sie selbst eingetragen hast.</p></section>`;
}

// ------------------------------------------------------------------ Aktionen

export const parityActions = {
  "mc-search": async (el) => {
    const { openAskSearch } = await import("./icoach.js");
    openAskSearch(el.dataset.arg);
  },
  "dose-ctx-pick": (el) => {
    const S = X.S;
    const id = el.dataset.arg;
    const ctxIds = [...document.querySelectorAll('[data-act="dose-ctx-pick"]')].filter((b) => b.classList.contains("on")).map((b) => b.dataset.arg);
    const cur = S.doseCtxPick ?? ctxIds;
    S.doseCtxPick = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-MAX_ANALYTES);
    X.rerender();
  },
  "tl-range": (el) => {
    X.S.tlRange = el.dataset.arg;
    X.rerender();
  },
  "steps-size": (el) => {
    try {
      localStorage.setItem(SIZE_KEY, el.dataset.arg === "15" ? "15" : "60");
    } catch {
      // ohne Speicher gilt die Wahl bis zum Neuzeichnen
    }
    X.rerender();
  },
};

export function parityChange(el) {
  if (el.dataset?.parity === "tl-lab") {
    X.S.tlLab = el.value || null;
    X.rerender();
    return true;
  }
  if (el.dataset?.parity === "tl-body") {
    X.S.tlBody = el.value || null;
    X.rerender();
    return true;
  }
  return false;
}

// ================================================================== Paket B (1.89.0)
// Insights-Karten wie am PC: Ernährung rund ums Training, Supplemente und Schlaf, Koffein und Schlaf,
// Hormongaben und Erholung, Tag und folgende Nacht (Uhr), Blutzucker und Alltag.

const ASSOC_WEEKS = 12;
const note = (t) => `<p class="muted small">${t}</p>`;

function insightItems(items) {
  const g = D.groupInsights(items);
  const list = (l, muted = false) => `<ul class="plain-list insight-list ${muted ? "insight-list--muted" : ""}">${l.map((i) => `<li><strong>${esc(i.label)}:</strong> ${esc(i.text)}</li>`).join("")}</ul>`;
  return `${g.shown.length ? list(g.shown) : `<p class="muted small">Zurzeit keine deutliche Tendenz in deinen Daten.</p>`}
    ${g.none.length ? `<details class="ov-more"><summary>Kein deutlicher Zusammenhang erkennbar (${g.none.length})</summary>${list(g.none, true)}</details>` : ""}
    ${g.insufficient.length ? `<details class="ov-more"><summary>Noch zu wenige Daten für eine Aussage (${g.insufficient.length})</summary>${list(g.insufficient, true)}</details>` : ""}`;
}

/** Mahlzeiten mit Uhrzeit und Summen (PC `Meal`) aus der Handy-Datenbank. */
function mealsBetween(db, from, to) {
  const out = [];
  for (const [d, meals] of db.mealsByDate ?? []) {
    if (d < from || d > to) continue;
    for (const m of meals) {
      let kcal = 0;
      let protein = 0;
      let carbs = 0;
      for (const it of db.itemsByMeal?.get(m.id) ?? []) {
        const f = db.foods?.get(it.food_id);
        if (!f) continue;
        const k = (Number(it.amount) || 0) / 100;
        kcal += k * (f.energy_kcal ?? 0);
        protein += k * (f.protein_g ?? 0);
        carbs += k * (f.carbs_g ?? 0);
      }
      out.push({ id: m.id, date: d, time: m.time ? String(m.time).slice(0, 5) : null, energyKcal: kcal, proteinG: protein, carbsG: carbs });
    }
  }
  return out;
}

export function trainingNutritionCard(card, db, week, workouts) {
  const TN = D.trainingNutrition;
  if (!TN) return "";
  const weekEnd = D.trends.shiftDays(week, 6);
  const own = workouts.filter((w) => w.date >= week && w.date <= weekEnd);
  const r = TN.trainingNutrition(own, mealsBetween(db, D.trends.shiftDays(week, -1), D.trends.shiftDays(week, 7)));
  const sum = (w) => (w.meals === 0 ? "–" : `${F(w.proteinG)} g E · ${F(w.carbsG)} g KH`);
  const body = r.rows.length
    ? `<p>Nach <strong>${r.proteinAfter}</strong> von ${r.rows.length} Einheiten mindestens ${TN.PROTEIN_AFTER_G} g Eiweiß in den ${TN.AFTER_MIN / 60} Stunden danach.</p>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Einheit</th><th class="tnum">${TN.BEFORE_MIN / 60} h davor</th><th class="tnum">${TN.AFTER_MIN / 60} h danach</th></tr></thead><tbody>${r.rows
        .map((row) => `<tr><td>${esc(row.title)}<span class="muted small dose-ctx__sub">${esc(D.formatDate(row.date))}, ${esc(row.start)} Uhr</span></td><td class="tnum">${sum(row.before)}</td><td class="tnum">${sum(row.after)}</td></tr>`)
        .join("")}</tbody></table></div>
      ${note(`Gezählt werden Mahlzeiten mit Uhrzeit (E = Eiweiß, KH = Kohlenhydrate).${r.untimedMeals > 0 ? ` ${r.untimedMeals} ${r.untimedMeals === 1 ? "Mahlzeit" : "Mahlzeiten"} ohne Uhrzeit zählen nicht mit.` : ""}${r.withoutStart > 0 ? ` ${r.withoutStart} ${r.withoutStart === 1 ? "Einheit" : "Einheiten"} ohne Startzeit.` : ""}`)}`
    : `<p class="muted">Keine abgeschlossene Einheit mit Startzeit in dieser Woche.</p>`;
  return card("training-nutrition", "Ernährung rund ums Training", "diese Woche", body, { area: "nutrition" });
}

export function supplementSleepCard(card, db, data) {
  const SS = D.supplementSleep;
  if (!SS) return "";
  const days = new Map();
  for (const [d, list] of db.intakesByDate ?? []) {
    if (d < data.from || d > data.to) continue;
    const names = [];
    for (const i of list) for (const it of db.intakeItems?.get(i.id) ?? []) names.push(db.supplements?.get?.(it.supplement_id)?.name ?? it.name ?? "Supplement");
    days.set(d, { date: d, count: names.length, names: [...new Set(names)] });
  }
  const rows = SS.supplementSleep([...days.values()], data.sleep, data.measurements);
  const body = `${
    rows.length
      ? `<ul class="plain-list insight-list">${rows.map((r) => `<li>${esc(r.text)}</li>`).join("")}</ul>`
      : `<p class="muted">Noch zu wenige Daten: je Supplement mindestens ${SS.MIN_NIGHTS} Nächte nach Tagen mit und ${SS.MIN_NIGHTS} nach Tagen ohne Einnahme.</p>`
  }${note("Verglichen werden nur Tage mit erfassten Supplementen und erfasster Nacht danach. Das ist ein Vergleich deiner Einträge – keine Ursache und keine Empfehlung.")}`;
  return card("supplement-sleep", "Supplemente und Schlaf", "12 Wochen", body, { area: "sleep" });
}

export function caffeineSleepCard(card, data, caffeineOn) {
  const ID = D.insightsDaily;
  if (!ID?.caffeineAtBedtimeSeries) return "";
  const byDay = new Map();
  for (let d = D.trends.shiftDays(data.from, -1); d <= data.to; d = D.trends.shiftDays(d, 1)) byDay.set(d, caffeineOn(d));
  if (![...byDay.values()].some((l) => l.length > 0)) return "";
  const series = ID.caffeineAtBedtimeSeries(byDay, data.sleep, ID.diaryDays(data.nutrition));
  const items = ID.caffeineSleepAssociations(series, data.sleep).map((i) => D.associationItem(i.label, i.association));
  return card(
    "caffeine",
    "Koffein und Schlaf",
    `letzte ${ASSOC_WEEKS} Wochen`,
    `${insightItems(items)}${note("Koffein zur Einschlafzeit ist eine Modellrechnung wie im Koffein-Zeitstrahl: Einnahmen des Vortags, Bettzeit aus dem Schlafeintrag. Tage ohne Koffein zählen mit 0 mg nur, wenn an diesem Tag Ernährung erfasst ist. Eine Korrelation zeigt gemeinsames Schwanken, keine Ursache.")}`,
    { area: "sleep" },
  );
}

export function hrtRecoveryCard(card, data, hrtEntries) {
  const I = D.insights;
  const IL = D.insightsLoad;
  if (!IL?.doseDays) return "";
  const days = IL.doseDays(hrtEntries.filter((e) => e.date >= data.from && e.date <= data.to));
  if (days.size === 0) return "";
  const HRV = "00000000-0000-7000-8000-000000000019"; // HRV_METRIC_ID (models.ts)
  const cmp = (series, opt, fmt) => IL.describeDoseComparison(IL.afterDoseComparison(days, series, opt), fmt);
  const items = [
    { label: "Schlafdauer", text: cmp(I.sleepSeries(data.sleep), { label: "Schlafdauer", unit: "", decimals: 0 }, (v) => D.formatDuration(Math.round(v))) },
    { label: "Schlafqualität", text: cmp(I.sleepQualitySeries(data.sleep), { label: "Schlafqualität", unit: "/ 10", decimals: 1 }) },
    { label: "Erholungs-Einschätzung", text: cmp(I.recoverySeries(data.recovery, "readiness"), { label: "Erholung", unit: "/ 10", decimals: 1 }) },
    { label: "HRV", text: cmp(I.metricSeries(data.measurements, HRV), { label: "HRV", unit: "ms", decimals: 0 }) },
  ].map((i) => ({ ...i, kind: i.text.startsWith("Noch zu wenige") ? "insufficient" : "shown" }));
  return card(
    "hrt",
    "Hormongaben und Erholung",
    `letzte ${ASSOC_WEEKS} Wochen · ${days.size} Gabetage`,
    `${insightItems(items)}${note("Verglichen werden die Nacht und der Morgen nach einem Tag mit einer Gabe mit allen anderen Tagen, an denen ein Wert erfasst ist (je mindestens 3 Tage). Eine Beobachtung ohne Bewertung – Unterschiede können viele Ursachen haben.")}`,
  );
}

// ------------------------------------------------------------------ Settings → Cardio in der Körperkarte

const CARDIO_KEY = "ui.cardio_muscles";

export function cardioSettingsCard(db) {
  const CMs = D.cardioMuscles;
  if (!CMs) return "";
  const s = CMs.parseCardioMuscleSettings(db.settings.get(CARDIO_KEY) ?? null);
  const d = CMs.DEFAULT_CARDIO_MUSCLE_SETTINGS;
  const dr = X.S.cardioDraft ?? null;
  const err = X.S.cardioErrors ?? {};
  const v = (k, val) => (dr && dr[k] !== undefined ? dr[k] : D.formatNumber(val, val % 1 === 0 ? 0 : 2));
  const e = (k) => (err[k] ? `<p class="field-error">${esc(err[k])}</p>` : "");
  const isDefault = s.countInTargets === d.countInTargets && s.cap === d.cap && s.minutesPerSet === d.minutesPerSet && s.zoneFactors.every((z, i) => z === d.zoneFactors[i]);
  const ZL = ["Zone 1 · sehr leicht", "Zone 2 · leicht", "Zone 3 · moderat", "Zone 4 · hart", "Zone 5 · maximal"];
  return `<section class="card" id="set-cardio-map" ${autoAttrs("cm")}><h3>Cardio in der Körperkarte</h3>
    <div class="field"><label for="cm-count">Cardio anrechnen</label><select id="cm-count" data-parity="cm-count" data-autosave-skip><option value="map" ${s.countInTargets ? "" : "selected"}>Nur in der Körperkarte zeigen</option><option value="targets" ${s.countInTargets ? "selected" : ""}>Auch auf die Wochenziele je Muskel</option></select></div>
    <div class="tl-pick">
      <div class="field"><label for="cm-cap">Obergrenze je Einheit und Muskel</label><div class="input-unit"><input id="cm-cap" inputmode="decimal" data-cm="cap" value="${esc(v("cap", s.cap))}"><span class="unit">Sätze</span></div>${e("cap")}</div>
      <div class="field"><label for="cm-mps">Minuten je Satz</label><div class="input-unit"><input id="cm-mps" inputmode="decimal" data-cm="minutesPerSet" value="${esc(v("minutesPerSet", s.minutesPerSet))}"><span class="unit">min</span></div>${e("minutesPerSet")}</div>
    </div>
    <h4 class="logs-sub">Faktor je Intensität</h4>
    <div class="cm-zones">${s.zoneFactors
      .map((z, i) => `<div class="field"><label for="cm-z${i}">${ZL[i]}</label><input id="cm-z${i}" inputmode="decimal" data-cm="zone${i}" value="${esc(v(`zone${i}`, z))}">${e(`zone${i}`)}</div>`)
      .join("")}</div>
    ${autoSaveHtml("cm-save")}
    <div class="row-actions"><button class="btn" data-act="cm-reset" ${isDefault ? "disabled" : ""}>Standardwerte wiederherstellen</button></div>
    <details class="card-info"><summary class="muted small">So wird gerechnet</summary><p class="muted small">Satz-Äquivalente je Muskel = Minuten × Faktor ÷ Minuten je Satz × Anteil des Muskels an der Bewegung (Hauptmuskel = 100 %). Die Intensität kommt aus dem Ø Puls des Blocks und deinen Herzfrequenz-Zonen, ohne Puls aus der gefühlten Anstrengung (RPE bis 3 = Zone 1, 4–5 = Zone 2, 6 = Zone 3, 7–8 = Zone 4, 9–10 = Zone 5), ohne beides als Zone 2. Standard: nur Körperkarte · ${F(d.cap)} Sätze · ${F(d.minutesPerSet)} min je Satz · Faktoren ${d.zoneFactors.map((z) => D.formatNumber(z, 2)).join(" / ")}. Änderungen gehen mit „An den PC senden“ an den PC.</p></details>
  </section>`;
}

async function putCardioSettings(next) {
  const S = X.S;
  const { normSync, setSetting } = await import("./pcsettings.js");
  S.pcsettings = normSync(S.pcsettings);
  const db = (await import("./diary.js")).buildDb();
  const changed = setSetting(S.pcsettings, CARDIO_KEY, D.cardioMuscles.serializeCardioMuscleSettings(next), db.settings.get(CARDIO_KEY) ?? null);
  if (changed) await X.store.set("pcsettings", S.pcsettings);
  return changed;
}

const num = (t) => {
  const n = Number(String(t ?? "").trim().replace(",", "."));
  return String(t ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

Object.assign(parityActions, {
  "cm-save": async () => {
    const S = X.S;
    const { buildDb } = await import("./diary.js");
    const cur = D.cardioMuscles.parseCardioMuscleSettings(buildDb().settings.get(CARDIO_KEY) ?? null);
    const read = (k) => document.querySelector(`[data-cm="${k}"]`)?.value ?? "";
    const errs = {};
    const cap = num(read("cap"));
    if (cap === null || cap < 1 || cap > 100) errs.cap = "Bitte 1 bis 100 eingeben.";
    const mps = num(read("minutesPerSet"));
    if (mps === null || mps < 0.5 || mps > 60) errs.minutesPerSet = "Bitte 0,5 bis 60 eingeben.";
    const zones = [0, 1, 2, 3, 4].map((i) => {
      const z = num(read(`zone${i}`));
      if (z === null || z < 0 || z > 2) errs[`zone${i}`] = "Bitte 0 bis 2 eingeben.";
      return z ?? 0;
    });
    if (Object.keys(errs).length) {
      S.cardioErrors = errs;
      S.cardioDraft = { cap: read("cap"), minutesPerSet: read("minutesPerSet"), ...Object.fromEntries(zones.map((_, i) => [`zone${i}`, read(`zone${i}`)])) };
      return X.rerender();
    }
    S.cardioErrors = null;
    S.cardioDraft = null;
    const changed = await putCardioSettings({ ...cur, cap, minutesPerSet: mps, zoneFactors: zones });
    X.toast(changed ? "Cardio-Einstellungen gespeichert" : "Keine Änderung");
    X.rerender();
  },
  "cm-reset": async () => {
    const S = X.S;
    const { buildDb } = await import("./diary.js");
    const cur = D.cardioMuscles.parseCardioMuscleSettings(buildDb().settings.get(CARDIO_KEY) ?? null);
    const d = D.cardioMuscles.DEFAULT_CARDIO_MUSCLE_SETTINGS;
    S.cardioErrors = null;
    S.cardioDraft = null;
    await putCardioSettings({ ...d, show: cur.show });
    X.toast("Standardwerte wiederhergestellt");
    X.rerender();
  },
});

const baseChange = parityChange;
export function parityChangeB(el) {
  if (el.dataset?.parity === "cm-count") {
    void (async () => {
      const { buildDb } = await import("./diary.js");
      const cur = D.cardioMuscles.parseCardioMuscleSettings(buildDb().settings.get(CARDIO_KEY) ?? null);
      await putCardioSettings({ ...cur, countInTargets: el.value === "targets" });
      X.toast("Cardio-Einstellungen gespeichert");
      X.rerender();
    })();
    return true;
  }
  return baseChange(el);
}
