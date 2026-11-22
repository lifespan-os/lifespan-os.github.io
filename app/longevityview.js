// LIFESPAN OS Mobil – Body & Longevity → Überblick (1.77.0, wie am PC 1.0.163 `LongevityTab.tsx`).
// Wenige Leitwerte (VO2max, Griffkraft, Ruhepuls, HRV, Körperfett, Muskelmasse) mit Verlauf und Einordnung
// gegen Altersnormen, dazu die wichtigsten Laborwerte gegen ihren Referenzbereich. Rechnung und Quellen:
// `src/domain/longevity.ts` über pcdomain.js (D.longevity), Griffkraft wie am PC über `evaluateGrip`.
// Daten: buildDb() (PC + Handy), Laborwerte wie Health (healthdata.js).

import * as D from "./pcdomain.js";
import * as H from "./healthdata.js";
import { buildDb, today } from "./diary.js";
import { masterclassLinkHtml } from "./parity.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initLongevity(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const LG = () => D.longevity;
const fmt = (v, d = 1) => D.formatNumber(v, d);

const LEVEL_CLASS = { low: "is-low", below: "is-below", average: "is-average", good: "is-good", excellent: "is-excellent" };

/** Alter in vollen Jahren an einem Tag (Geburtsdatum, sonst Geburtsjahr) – wie `profileAgeOn` am PC. */
export function ageOn(profile, date) {
  if (!profile || !date) return null;
  if (profile.birth_date) {
    const [y, m, d] = profile.birth_date.split("-").map(Number);
    const [ty, tm, td] = date.split("-").map(Number);
    return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  }
  if (profile.birth_year) return Number(date.slice(0, 4)) - Number(profile.birth_year);
  return null;
}

const sexOf = (profile) => (profile?.sex === "male" || profile?.sex === "female" ? profile.sex : null);

/** Werte einer Messgröße als { date, value } (je Tag gemittelt, aufsteigend). */
function seriesOf(db, metricId) {
  const rows = db.bodyByMetric?.get(metricId) ?? [];
  return LG().dailyMeans(rows.filter((r) => typeof r.value === "number").map((r) => ({ date: r.date, value: r.value })));
}

function normTile(key, label, unit, decimals, table, series, current, currentNote, profile, flat, metricId) {
  const sex = sexOf(profile);
  const age = current ? ageOn(profile, current.date) : null;
  const r = current ? LG().assess(table, sex, age, current.value) : null;
  return {
    key,
    label,
    unit,
    decimals,
    current,
    currentNote,
    series,
    higherIsBetter: table.higherIsBetter,
    flat,
    rank: r && sex ? { betterThan: r.betterThan, level: r.level, text: LG().rankText(r, sex), median: `Median: ${fmt(r.median, decimals)} ${unit}` } : null,
    source: table.source,
    caveat: table.caveat,
    metricId,
  };
}

function gripTile(list, profile) {
  const sorted = [...(list ?? [])].sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  const series = sorted.map((g) => ({ date: g.date, value: (g.left_kg + g.right_kg) / 2 }));
  const last = sorted.at(-1) ?? null;
  let rank = null;
  if (last) {
    const sex = last.sex ?? sexOf(profile);
    const ageYears = last.age_years ?? ageOn(profile, last.date);
    const heightCm = last.height_cm ?? profile?.height_cm ?? null;
    const r = sex && ageYears !== null && heightCm ? D.evaluateGrip(D.GRIP_NORMS, { leftKg: last.left_kg, rightKg: last.right_kg, sex, ageYears, heightCm }) : null;
    if (r) {
      rank = {
        betterThan: r.percentile,
        level: LG().levelOfRank(r.percentile),
        text: `besser als ${Math.round(r.percentile)} % ${sex === "male" ? "der Männer" : "der Frauen"} gleichen Alters und gleicher Größe`,
        median: `Mittelwert: ${fmt(r.norm.mean_kg, 1)} kg`,
      };
    }
  }
  return {
    key: "grip",
    label: "Griffkraft",
    unit: "kg",
    decimals: 1,
    current: series.at(-1) ?? null,
    currentNote: "Mittel beider Hände",
    series,
    higherIsBetter: true,
    flat: 0.5,
    rank,
    source: D.GRIP_SOURCE,
    caveat: "Bewertet wird der Durchschnitt aus linker und rechter Hand, eingeordnet nach Geschlecht, Alter und Körpergröße.",
    metricId: null,
  };
}

/** Kleine Verlaufslinie (letztes Jahr) ohne Achsen. */
export function sparkline(points) {
  if (points.length < 2) return "";
  const w = 160;
  const h = 36;
  const xs = points.map((p) => Date.parse(`${p.date}T12:00:00Z`));
  const ys = points.map((p) => p.value);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const sx = (x) => (x1 === x0 ? w / 2 : ((x - x0) / (x1 - x0)) * (w - 4) + 2);
  const sy = (y) => (y1 === y0 ? h / 2 : h - 3 - ((y - y0) / (y1 - y0)) * (h - 6));
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(xs[i]).toFixed(1)},${sy(p.value).toFixed(1)}`).join(" ");
  return `<svg class="lng-tile__spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Verlauf im letzten Jahr"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${sx(xs.at(-1)).toFixed(1)}" cy="${sy(ys.at(-1)).toFixed(1)}" r="2.6" fill="currentColor"/></svg>`;
}

function trendHtml(tile) {
  const t = LG().trendOf(tile.series, tile.higherIsBetter, { days: 90, flat: tile.flat });
  if (!t || t.delta === null || !t.previous) return "";
  const sign = t.delta > 0 ? "+" : t.delta < 0 ? "−" : "±";
  const arrow = t.direction === "better" ? "▲" : t.direction === "worse" ? "▼" : "▶";
  const word = t.direction === "better" ? "besser" : t.direction === "worse" ? "schlechter" : "gleich";
  return `<p class="lng-tile__trend small lng-tile__trend--${t.direction ?? "flat"}">${arrow} ${sign}${esc(fmt(Math.abs(t.delta), tile.decimals))} ${esc(tile.unit)} seit ${esc(D.formatDate(t.previous.date))} (${word})</p>`;
}

/** „besser als 85 % der Männer 30–39 Jahre“ → Zahl fett, Vergleichsgruppe klein darunter (schmale Kacheln). */
export function rankHtml(text) {
  const m = /^(besser als (?:über )?\d+ %) (.+)$/.exec(text);
  return m
    ? `<p class="lng-tile__rank small"><b>${esc(m[1])}</b></p><p class="muted small">${esc(m[2])}</p>`
    : `<p class="lng-tile__rank small">${esc(text)}</p>`;
}

function tileHtml(tile) {
  const cls = tile.rank ? LEVEL_CLASS[tile.rank.level] : "is-none";
  // Tippen auf die Kachel öffnet den Verlauf der Messgröße (Griffkraft: Werte erfassen → Fitness)
  const open = tile.metricId ? `data-go="body-metric" data-arg="${esc(tile.metricId)}"` : `data-act="lng-grip"`;
  const body = tile.current
    ? `<p class="lng-tile__value">${esc(fmt(tile.current.value, tile.decimals))}<span class="lng-tile__unit"> ${esc(tile.unit)}</span></p>
      <p class="muted small">${tile.currentNote ? `${esc(tile.currentNote)} · ` : ""}${esc(D.formatDate(tile.current.date))}</p>
      ${
        tile.rank
          ? `<div class="lng-tile__bar" role="img" aria-label="${Math.round(tile.rank.betterThan)} von 100"><span class="lng-tile__marker" style="left:${Math.min(98, Math.max(2, tile.rank.betterThan))}%"></span></div>
        ${rankHtml(tile.rank.text)}`
          : `<p class="muted small">${
              tile.key === "muscle"
                ? "Für Waagenwerte gibt es keine vergleichbare Altersnorm – entscheidend ist, dass sie hält oder steigt."
                : "Für die Einordnung fehlen Geschlecht oder Geburtsdatum im Profil."
            }</p>`
      }
      ${trendHtml(tile)}${sparkline(LG().recentValues(tile.series, 365))}`
    : `<p class="muted small">Noch kein Wert – antippen zum Erfassen.</p>`;
  return `<article class="lng-tile ${cls}">
    <button class="lng-tile__open" ${open} aria-label="${esc(tile.label)}: Verlauf und Erfassen">
      <span class="lng-tile__head"><span class="lng-tile__title">${esc(tile.label)}</span>${tile.rank ? `<span class="lng-tile__level">${esc(LG().NORM_LEVEL_LABELS[tile.rank.level])}</span>` : ""}</span>
      ${body}
    </button>
    ${masterclassLinkHtml(tile.label, { withText: true }) ? `<div class="lng-tile__mc">${masterclassLinkHtml(tile.label, { withText: true })}</div>` : ""}
    <details class="lng-tile__src"><summary>Quelle</summary><p class="small">${tile.rank?.median ? `${esc(tile.rank.median)}. ` : ""}${tile.source ? `Quelle: ${esc(tile.source)}. ` : ""}${esc(tile.caveat)}</p></details>
  </article>`;
}

/** Kacheln und Laborzeilen aus den zusammengeführten Daten (für Ansicht und Tests). */
export function longevityData(db, analytes, draws, day) {
  const L = LG();
  const M = L.LONGEVITY_METRICS;
  const profile = db.profile ?? null;
  const vo2 = seriesOf(db, M.vo2max);
  const rhr = seriesOf(db, M.restingHr);
  const hrv = seriesOf(db, M.hrv);
  const fat = seriesOf(db, M.bodyFat);
  const muscle = seriesOf(db, M.muscleMass);
  const tiles = [
    normTile("vo2max", "VO2max", "ml/kg/min", 1, L.VO2MAX_NORMS, vo2, vo2.at(-1) ?? null, null, profile, 0.5, M.vo2max),
    gripTile(db.grip, profile),
    normTile("rhr", "Ruhepuls", "bpm", 0, L.RESTING_HR_NORMS, rhr, L.recentMean(rhr, 7), "Mittel der letzten 7 Messtage", profile, 1, M.restingHr),
    normTile("hrv", "HRV (RMSSD)", "ms", 0, L.HRV_NORMS, hrv, L.recentMean(hrv, 7), "Mittel der letzten 7 Messtage", profile, 2, M.hrv),
    normTile("fat", "Körperfett", "%", 1, L.BODY_FAT_NORMS, fat, fat.at(-1) ?? null, null, profile, 0.5, M.bodyFat),
    {
      key: "muscle",
      label: "Skelettmuskelmasse",
      unit: "kg",
      decimals: 1,
      current: muscle.at(-1) ?? null,
      currentNote: null,
      series: muscle,
      higherIsBetter: true,
      flat: 0.3,
      rank: null,
      source: null,
      caveat: "Muskelmasse von Körperfettwaagen (BIA) eignet sich für den eigenen Verlauf, nicht für den Vergleich mit Studiendaten.",
      metricId: M.muscleMass,
    },
  ];
  const labRows = L.LONGEVITY_LABS.map(({ id, why }) => {
    const analyte = analytes.find((a) => a.id === id);
    if (!analyte) return null;
    const points = D.lab.seriesFor(draws, analyte);
    return { analyte, why, last: points.at(-1) ?? null, prev: points.length > 1 ? points.at(-2) : null };
  }).filter(Boolean);
  return { tiles, labRows, day };
}

/** Inhalt des Reiters „Überblick“. */
export function longevityTabHtml() {
  const S = X.S;
  if (!S.catalog?.body) {
    return `<section class="card"><p class="small">Für den Überblick bitte einmal eine neue Exportdatei vom PC laden (am PC Import/Export → „Für die Handy-App exportieren“, dann hier unter Import/Export „Neue Exportdatei laden“).</p></section>`;
  }
  const day = today();
  const db = buildDb();
  const { tiles, labRows } = longevityData(db, H.analytesOf(S.catalog, S.health, day), H.drawsOf(S.catalog, S.health), day);
  const rated = tiles.filter((t) => t.rank);
  const good = rated.filter((t) => t.rank.betterThan >= 60).length;
  const measured = labRows.filter((r) => r.last);
  const missing = labRows.filter((r) => !r.last);
  const L = D.lab;
  return `<section class="card lng">
      <div class="wo-head"><h3>Lifespan-Kern</h3><span class="muted small">Stand ${esc(D.formatDate(day))}</span></div>
      <p class="lng__summary">${
        rated.length === 0
          ? "Noch keine Leitwerte mit Altersnorm erfasst."
          : `${good} von ${rated.length} eingeordneten Leitwerten mindestens „gut“ (besser als 60 % deiner Altersgruppe).`
      }</p>
      <p class="muted small card-info">Eingeordnet wird jeweils gegen Menschen gleichen Geschlechts und Alters aus großen Studien (Quelle in jeder Kachel). Normen stammen aus Labor- bzw. Praxismessungen; Uhr und Waage messen anders – entscheidend ist dein eigener Verlauf. Die Leiste zeigt „besser als x %“: links ungünstig, rechts günstig.</p>
      <div class="lng__grid">${tiles.map(tileHtml).join("")}</div>
    </section>
    <section class="card lng-labs">
      <h3>Laborwerte für die Lebensspanne</h3>
      <p class="muted small card-info">Letzter Wert gegen den Referenzbereich (laut Befund, eigener Bereich oder Vorgabe AKH Wien nach Geschlecht und Alter). Eintragen und Verläufe unter Health → Blutabnahmen.</p>
      ${
        measured.length
          ? `<ul class="lng-labs__list">${measured
              .map(
                ({ analyte, why, last, prev }) => `<li><button class="lng-labs__row" data-act="lng-lab" data-arg="${esc(analyte.id)}">
                <span class="lng-labs__name"><b>${esc(analyte.name)}</b><span class="muted small">${esc(why)}</span></span>
                <span class="lng-labs__val"><b>${esc(L.formatLabValue(last.value, last.comparator))}</b> <span class="muted small">${esc(last.unit)}</span>
                  <span class="lab-flag lab-flag--${last.flag}">${esc(L.FLAG_MARKS[last.flag])} ${esc(L.FLAG_LABELS[last.flag])}</span></span>
                <span class="muted small">${esc(D.formatDate(last.date))} · Ref. ${esc(L.formatRange(last.range))}${prev ? ` · vorher ${esc(L.formatLabValue(prev.value, prev.comparator))} (${esc(D.formatDate(prev.date))})` : ""}</span>
              </button>${masterclassLinkHtml(analyte.name)}</li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">Noch keine dieser Laborwerte eingetragen.</p><button class="btn block" data-act="lng-labs">Zu den Laborwerten</button>`
      }
      ${missing.length ? `<p class="muted small">Noch nicht gemessen: ${esc(missing.map((m) => m.analyte.name).join(", "))}.</p>` : ""}
    </section>`;
}

export const longevityActions = {
  "lng-lab": (el) => {
    X.S.healthTrend = el.dataset.arg;
    X.S.healthTab = "trend";
    X.go("health");
  },
  "lng-labs": () => {
    X.S.healthTab = "draws";
    X.go("health");
  },
  // Griffkraft hat keinen Messgrößen-Verlauf: Werte erfassen öffnen
  "lng-grip": () => X.go("quickfill"),
};
