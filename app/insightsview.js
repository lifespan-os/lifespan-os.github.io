// LIFESPAN OS Mobil – Insights wie am PC (1.8.0): Wochenrückblick mit Wochenwahl, Beobachtungen,
// Wochenanalyse und Datenprüfung, Bereiche der Woche, Lebensstil-Notizen, mögliche
// Zusammenhänge (12 Wochen) und „Welche Daten die Auswertung verbessern“ – wie InsightsPage.tsx,
// in der Anordnung vom PC (Settings `ui.insights_layout`). Nur Ansicht; gerechnet mit den
// Regeln aus pcdomain.js (= src/domain), Daten aus pcoverview.js (wie insights.rs).

import { arrangeCards } from "./layoutedit.js";
import * as PA from "./parity.js";
import * as CF from "./caffeinedata.js";
import * as SD from "./superdata.js";
import { associationsHtml, wearableOf } from "./heart.js";
import { contextHtml as glucoseContextHtml, readingsOf } from "./glucose.js";
import * as O from "./pcoverview.js";
import * as D from "./pcdomain.js";
import { buildDb, today } from "./diary.js";
import * as GL from "./goals.js";
import * as P from "./pcdb.js";
import { weeklyReportsCard } from "./weeklyreports.js";
import { dataQualityCard, goalAdviceCard } from "./extras.js";
import { targetGoalsCard } from "./goalsparity.js";
import { periodReviewCard } from "./reviewparity.js";
import { reportCard } from "./pdfparity.js";
import { connData, connectionsCard, verdictData, verdictLineHtml } from "./connections.js";
import { legacyHits, trainingAdviceHtml } from "./trainingadvice.js";

let X = null; // { S, esc, header, rerender }

export function initInsights(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);
const ASSOCIATION_WEEKS = 12;
const LOOKBACK_DAYS = 120;
const HRV = O.HRV_METRIC_ID;
const RHR = O.RESTING_HR_METRIC_ID;

function card(id, title, meta, body, { area = "", wide = false } = {}) {
  return `<section class="card ov-card ${area ? `card--${area}` : ""} ${wide ? "ov-card--wide" : ""}" data-card="${esc(id)}">
    <div class="wo-head"><h3>${esc(title)}</h3>${meta ? `<span class="tag">${esc(meta)}</span>` : ""}</div>${body}</section>`;
}
const note = (t) => (t ? `<p class="card__note">${t}</p>` : "");

function rowsTable(rows, noteKey = "note") {
  return `<table class="data-table insights-table"><tbody>${rows
    .map(
      (r) => `<tr><td>${esc(r.label)}<span class="sub">${esc(r.basis ?? "")}</span></td>
      <td class="tnum"><strong>${esc(r.value)}</strong>${r[noteKey] ? `<span class="sub">${esc(r[noteKey])}</span>` : ""}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function insightList(items) {
  const g = D.groupInsights(items);
  const list = (l, muted = false) => `<ul class="plain-list insight-list ${muted ? "insight-list--muted" : ""}">${l.map((i) => `<li><strong>${esc(i.label)}:</strong> ${esc(i.text)}</li>`).join("")}</ul>`;
  return `${g.shown.length ? list(g.shown) : `<p class="muted small">Zurzeit keine deutliche Tendenz in deinen Daten.</p>`}
    ${g.none.length ? `<details class="ov-more"><summary>Kein deutlicher Zusammenhang erkennbar (${g.none.length})</summary>${list(g.none, true)}</details>` : ""}
    ${g.insufficient.length ? `<details class="ov-more"><summary>Noch zu wenige Daten für eine Aussage (${g.insufficient.length})</summary>${list(g.insufficient, true)}</details>` : ""}`;
}

function associationsCard(data, t) {
  const I = D.insights;
  const sleep = I.sleepSeries(data.sleep);
  const readiness = I.recoverySeries(data.recovery, "readiness");
  const fatigue = I.recoverySeries(data.recovery, "fatigue");
  const soreness = I.recoverySeries(data.recovery, "soreness");
  const stress = I.recoverySeries(data.recovery, "stress");
  const quality = I.sleepQualitySeries(data.sleep);
  const loads = I.trainingLoadByDay(data.workouts);
  const items = [
    D.associationItem(
      "Schlafdauer und Erholung",
      I.describeAssociation(I.pairByDate(sleep, readiness), {
        x: "Längerer Schlaf",
        pair: "Schlafdauer und deiner Erholungs-Einschätzung am selben Morgen",
        higher: "einer höheren Erholungs-Einschätzung am selben Morgen",
        lower: "einer niedrigeren Erholungs-Einschätzung am selben Morgen",
      }),
    ),
    D.associationItem(
      "Schlafdauer und Müdigkeit",
      I.describeAssociation(I.pairByDate(sleep, fatigue), {
        x: "Längerer Schlaf",
        pair: "Schlafdauer und deiner Müdigkeit am selben Tag",
        higher: "mehr Müdigkeit am selben Tag",
        lower: "weniger Müdigkeit am selben Tag",
      }),
    ),
    D.associationItem(
      "Stress und folgende Nacht",
      I.describeAssociation(I.pairByDate(stress, quality, 1), {
        x: "Mehr Stress an einem Tag",
        pair: "deinem Stress und der Schlafqualität in der folgenden Nacht",
        higher: "einer besser eingeschätzten folgenden Nacht",
        lower: "einer schlechter eingeschätzten folgenden Nacht",
      }),
    ),
  ];
  const after = I.afterTrainingComparison(loads, soreness);
  const ok = after.withCount >= 3 && after.withoutCount >= 3 && after.withMean !== null && after.withoutMean !== null;
  items.push({
    label: "Training und Muskelkater am Folgetag",
    kind: ok ? "shown" : "insufficient",
    text: ok
      ? `Muskelkater lag an Tagen nach einem Training im Mittel bei ${F(after.withMean, 1)} / 10, an anderen Tagen bei ${F(after.withoutMean, 1)} / 10 (${after.withCount} bzw. ${after.withoutCount} Tage).`
      : `Für den Vergleich „Muskelkater nach Trainingstagen / an anderen Tagen“ fehlen noch Angaben (je mindestens 3 Tage, vorhanden: ${after.withCount} bzw. ${after.withoutCount}).`,
  });
  const a = D.acwr(data.workouts, t);
  items.push(
    D.associationItem(
      "Trainingsbelastung und HRV am Folgetag",
      D.loadVsNextDay(data.workouts, I.metricSeries(data.measurements, HRV), data.from, data.to, {
        pair: "deiner Trainingsbelastung und der HRV am Folgetag",
        higher: "einer höheren HRV am Folgetag",
        lower: "einer niedrigeren HRV am Folgetag",
      }),
    ),
    D.associationItem(
      "Trainingsbelastung und Ruhepuls am Folgetag",
      D.loadVsNextDay(data.workouts, I.metricSeries(data.measurements, RHR), data.from, data.to, {
        pair: "deiner Trainingsbelastung und dem Ruhepuls am Folgetag",
        higher: "einem höheren Ruhepuls am Folgetag",
        lower: "einem niedrigeren Ruhepuls am Folgetag",
      }),
    ),
    { label: "Akute zu chronischer Belastung (ACWR)", text: D.describeAcwr(a), kind: a.ratio === null ? "insufficient" : "shown" },
    ...D.dailyAssociations(data).map((x) => D.associationItem(x.label, x.association)),
  );
  return card(
    "associations",
    "Mögliche Zusammenhänge",
    `letzte ${ASSOCIATION_WEEKS} Wochen`,
    `${insightList(items)}${note(
      "Grundlage sind nur Tage, an denen beide Angaben erfasst sind (Korrelation r, ab 10 Tagen; als Tendenz beschrieben ab |r| ≥ 0,3). Eine Korrelation zeigt, dass Werte gemeinsam schwanken – nicht, dass das eine das andere verursacht. Trainingsbelastung = Dauer × Anstrengung (RPE); Tage ohne Training zählen mit 0, Tage mit einer Einheit ohne Dauer oder Anstrengung werden ausgelassen. ACWR = Belastung der letzten 7 Tage geteilt durch die mittlere Woche der letzten 28 Tage; der genannte Bereich dient nur der Einordnung. Trainingsleistung = Volumen einer Einheit im Verhältnis zu deinen anderen Einheiten mit gleichem Titel (ab 2 Einheiten); Eiweiß zählt nur an Tagen mit erfasster Ernährung.",
    )}`,
    { wide: true },
  );
}

function gripOf(db) {
  return (db.grip ?? db.pc.grip_strength_measurement ?? []).map((g) => ({
    id: g.id,
    date: g.date,
    time: g.time ?? null,
    leftKg: g.left_kg,
    rightKg: g.right_kg,
    dominantHand: g.dominant_hand ?? null,
    sex: g.sex ?? null,
    ageYears: g.age_years ?? null,
    heightCm: g.height_cm ?? null,
    notes: g.notes ?? null,
    method: g.method ?? null,
    condition: g.condition ?? null,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  }));
}

function weeklyAnalysisCards(db, week, weekEnd, data) {
  const setLog = O.setLog(db);
  const measurements = O.measurementsBetween(db, null, D.trends.shiftDays(week, -LOOKBACK_DAYS), weekEnd);
  const range = { from: week, to: weekEnd };
  const a = D.weeklyAnalysis({ week: range, sleep: data.sleep, measurements, grip: gripOf(db), setLog, workouts: data.workouts, nutrition: data.nutrition, goal: data.goal, energy: data.energy ?? [] });
  const categories = new Map((db.pc.body_metric ?? []).map((m) => [m.id, m.category]));
  const issues = D.dataCheck({ week: range, setLog, workouts: data.workouts, measurements, categoryOf: (id) => categories.get(id), hrt: null });
  return (
    card(
      "weekly-analysis",
      "Wochenanalyse",
      "automatisch berechnet",
      `<h4 class="logs-sub">Schlaf und Erholung</h4>${rowsTable(a.sleep)}
      <h4 class="logs-sub">Training</h4>${rowsTable(a.training)}
      <h4 class="logs-sub">Kraft und Ernährung</h4>${rowsTable(a.body)}
      ${a.observations.length ? `<ul class="plain-list insight-list">${a.observations.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}
      ${note("Mittelwerte nur aus erfassten Werten; Vorwochenvergleich ab 3 Werten je Woche (Griffkraft ab 2). HRV wird mit dem Mittel der 7 Vortage verglichen (ab 3 Messungen) – das ist eine Rechnung, keine Bewertung.")}`,
      { wide: true },
    ) +
    card(
      "weekly-analysis-check",
      "Datenprüfung",
      `${issues.length} ${issues.length === 1 ? "Hinweis" : "Hinweise"}`,
      `${
        issues.length
          ? `<ul class="plain-list insight-list">${issues.map((i) => `<li><strong>${esc(i.area)} · ${esc(D.formatDate(i.date))}:</strong> ${esc(i.text)}</li>`).join("")}</ul>`
          : `<p class="muted">Keine Auffälligkeiten in den Einträgen dieser Woche.</p>`
      }
      ${note("Geprüft werden Sätze mit mehr als 50 Wiederholungen, vermutlich vertauschte Werte, Sprünge des höchsten Arbeitsgewichts um mehr als 20 % zur vorigen Einheit derselben Übung, gleiche Einheiten am selben Tag, Sprünge um mehr als 20 % bei Gewicht, Körperzusammensetzung und Umfängen. Ein Hinweis heißt nicht, dass der Eintrag falsch ist – bitte am PC prüfen und bei Bedarf korrigieren.")}`,
      { wide: true },
    )
  );
}

function coverageCard(data, t) {
  const items = D.coverage(data, t);
  const missing = items.filter((i) => !i.ok).length;
  return card(
    "coverage",
    "Welche Daten die Auswertung verbessern",
    `letzte ${D.COVERAGE_DAYS} Tage`,
    `<p class="muted small">${
      missing === 0
        ? "Für alle Auswertungen auf dieser Seite liegen genug Einträge vor."
        : `${missing} ${missing === 1 ? "Angabe" : "Angaben"} würden weitere oder genauere Auswertungen und Hinweise ermöglichen – je regelmäßiger erfasst, desto aussagekräftiger.`
    }</p>
    <ul class="plain-list coverage-list">${items
      .map(
        (i) => `<li class="${i.ok ? "is-ok" : ""}"><span class="coverage-list__icon" aria-label="${i.ok ? "ausreichend" : "mehr erfassen"}">${i.ok ? "✓" : "+"}</span>
        <div><strong>${esc(i.label)}</strong> <span class="muted small">· ${esc(i.status)}</span>${i.ok ? "" : `<p class="muted small">${esc(i.benefit)}</p>`}</div></li>`,
      )
      .join("")}</ul>
    ${note("Gezählt werden nur tatsächlich erfasste Tage. Es werden keine Werte geschätzt oder ergänzt; die Hinweise bewerten die Werte nicht.")}`,
  );
}

const AREA_TITLES = { sleep: "Schlaf", recovery: "Regeneration", training: "Training", nutrition: "Ernährung", body: "Körper" };

/** „Als Kalorienziel übernehmen“ (1.141.0, wie PC `AdaptiveTdeeCard`): ab heute festes Kalorienziel,
 *  übrige Ziele bleiben; ein eingestelltes Defizit bzw. Überschuss in kcal wird mitgerechnet. */
/** Persönlicher Normalbereich (1.172.0, wie NormalRangeCard am PC 1.0.237) */
function normalRangeCard(db, t) {
  const NR = D.normalRange;
  const C = D.conditions;
  const data = O.insightsFor(db, D.trends.shiftDays(t, -(NR.NORMAL_DAYS - 1)), t);
  const metric = (id) => data.measurements.filter((m) => m.metricId === id).map((m) => ({ date: m.date, value: m.value, condition: m.condition ?? null }));
  const profileRow = (db.pc.profile ?? [])[0];
  const bmi = profileRow?.height_cm ? NR.bmiWeightRange(profileRow.height_cm) : null;
  const rows = [
    { key: "hrv", label: "HRV", unit: "ms", d: 0, points: metric(HRV) },
    { key: "restingHr", label: "Ruhepuls", unit: "/min", d: 0, points: metric(RHR) },
    { key: "sleep", label: "Schlafdauer", unit: "h", d: 1, points: data.sleep.filter((s) => s.sleepMin > 0).map((s) => ({ date: s.date, value: s.sleepMin / 60, condition: "night" })) },
    { key: "weight", label: "Körpergewicht", unit: "kg", d: 1, points: metric(P.WEIGHT_METRIC_ID), extra: bmi ? `Bei ${F(profileRow.height_cm)} cm entspricht das ${F(bmi.min, 1)}–${F(bmi.max, 1)} kg.` : "" },
    { key: "grip", label: "Griffkraft (stärkere Hand)", unit: "kg", d: 1, points: gripOf(db).map((g) => ({ date: g.date, value: Math.max(g.leftKg, g.rightKg), condition: g.condition })) },
  ];
  const side = { below: "unter", above: "über" };
  const body = rows
    .map((row) => {
      const r = NR.normalRange(row.points, t);
      const norm = NR.NORM_REFERENCES[row.key];
      const v = r ? `${F(r.latest.value, row.d)} ${row.unit} am ${D.formatDate(r.latest.date)}` : "";
      const status = !r
        ? ""
        : r.latestOther
          ? `Zuletzt ${v} – andere Messbedingung (${C.conditionLabel(r.latest.condition, true)}), nur eingeschränkt vergleichbar.`
          : r.run >= NR.NORMAL_RUN && r.runSide
            ? `Zuletzt ${v} – die letzten ${r.run} Werte liegen ${side[r.runSide]} deinem Bereich.`
            : r.position === "within"
              ? `Zuletzt ${v} – innerhalb deines Bereichs.`
              : `Zuletzt ${v} – ${side[r.position]} deinem Bereich.`;
      return `<tr><td>${esc(row.label)}<span class="sub">${esc(
        r ? `${r.n} Werte ${D.formatDate(r.from)}–${D.formatDate(r.to)}${r.condition ? ` · ${C.conditionLabel(r.condition, true)}` : ""}` : `noch zu wenige Werte (mindestens ${NR.NORMAL_MIN_N} in ${NR.NORMAL_DAYS} Tagen)`,
      )}</span></td><td>${
        r
          ? `<strong>${F(r.low, row.d)}–${F(r.high, row.d)} ${esc(row.unit)}</strong><span class="sub">Median ${F(r.median, row.d)} ${esc(row.unit)}</span><span class="sub${r.position !== "within" || r.latestOther ? " is-other" : ""}">${esc(status)}</span>`
          : "–"
      }<span class="sub">Allgemein: ${esc(norm.text)} ${esc(row.extra ?? "")} (Quelle: ${esc(norm.source)})</span></td></tr>`;
    })
    .join("");
  return card(
    "normal-range",
    "Persönlicher Normalbereich",
    `letzte ${NR.NORMAL_DAYS} Tage`,
    `<table class="data-table insights-table normal-range"><tbody>${body}</tbody></table>${note(`Dein Bereich = Median ± eine Standardabweichung deiner Werte der letzten ${NR.NORMAL_DAYS} Tage, nur mit derselben Messbedingung (Werte ohne Angabe zählen mit). Das ist eine Beschreibung deiner Werte, keine Bewertung.`)}`,
    { wide: true },
  );
}

/** Insights → Training (1.173.0, wie TrainingInsightsCard am PC 1.0.238; Trainingsregeln seit 1.186.0) */
function trainingInsightsCard(db, t) {
  const TI = D.trainingInsights;
  const log = O.setLog(db);
  const sessions = TI.sessionSplits(log, O.exercisesOf(db)).filter((s) => s.date <= t);
  if (!sessions.length) return card("training-insights", "Training", "letzte 4 Wochen", `<p class="muted">Noch keine abgeschlossenen Krafteinheiten.</p>`, { area: "training", wide: true });
  const recent = sessions.slice(-12);
  const model = TI.splitModel(recent);
  const freq = TI.areaFrequency(sessions, t, 4);
  const trends = TI.strengthTrends(log, t).slice(0, 8);
  const cardio = TI.cardioWeeks(log, t, 4);
  const rest = TI.restStats(log, t, 4);
  const RC = D.trainingRecovery;
  const idata = O.insightsFor(db, D.trends.shiftDays(t, -60), t);
  const nextDay = RC
    ? RC.nextDayRecovery(
        idata.workouts,
        {
          hrv: D.insights.metricSeries(idata.measurements, HRV),
          readiness: D.insights.recoverySeries(idata.recovery, "readiness"),
          soreness: D.insights.recoverySeries(idata.recovery, "soreness"),
        },
        t,
      )
    : [];
  // Regeln von 1.173.0, die der freigegebene Katalog (1.186.0) nicht abdeckt
  const hits = legacyHits(log, t);
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
  const head = (x) => `<p class="list-head small"><b>${esc(x)}</b></p>`;
  const body = `${head("Split")}<p>${model ? `Trainingsmodell der letzten ${recent.length} Einheiten: <b>${esc(TI.SPLIT_MODEL_LABELS[model])}</b>` : "Für ein Trainingsmodell braucht es mindestens drei eingeordnete Einheiten."}</p>
    <p class="muted small">${recent.map((s) => `${esc(D.formatDate(s.date).slice(0, 6))} ${esc(TI.SESSION_TYPE_LABELS[s.type])}`).join(" · ")}</p>
    ${head("Häufigkeit je Bereich")}<table class="data-table insights-table"><tbody>${freq
      .map((f) => `<tr><td>${esc(TI.SPLIT_AREA_LABELS[f.area])}</td><td class="tnum"><strong>${F(f.perWeek, 1)}× je Woche</strong><span class="sub">${f.sessions} Einheiten mit mindestens 2 Sätzen</span></td></tr>`)
      .join("")}</tbody></table>
    ${head("Kraftverlauf (geschätztes 1RM, letzte 8 Wochen)")}${
      trends.length
        ? `<table class="data-table insights-table"><tbody>${trends
            .map(
              (x) => `<tr><td>${esc(x.name)}<span class="sub">${x.sessions} Einheiten</span></td><td class="tnum"><strong>${x.changePct > 0 ? "+" : ""}${F(x.changePct, 1)} %</strong><span class="sub">${F(x.first.value, 1)} kg (${esc(D.formatDate(x.first.date))}) → ${F(x.last.value, 1)} kg (${esc(D.formatDate(x.last.date))})</span></td></tr>`,
            )
            .join("")}</tbody></table>`
        : `<p class="muted small">Ab drei Einheiten einer Übung mit 1–12 Wiederholungen erscheint der Verlauf.</p>`
    }
    ${head("Cardio je Woche")}<p>${cardio.map((w) => `KW ${D.trends.isoWeek(w.start).week}: ${F(w.minutes)} min`).join(" · ")}</p>
    ${head("Satzpausen")}<p>${rest.medianSeconds === null ? "Noch keine Satz-Zeitpunkte – sie entstehen seit 1.169.0 beim Abhaken im laufenden Training." : `Median ${clock(rest.medianSeconds)} aus ${rest.n} Pausen in ${rest.sessions} Einheiten (ohne Unterbrechungen über 15 min).`}</p>
    ${head("Erholung am Folgetag")}${
      nextDay.length
        ? `<table class="data-table insights-table"><tbody>${nextDay
            .map((r) => `<tr><td>${esc(D.formatDate(r.date))}<span class="sub">${esc(r.titles.join(", "))}${r.volumeKg > 0 ? ` · ${F(r.volumeKg)} kg` : ""}</span></td><td class="tnum"><strong>${r.hrv === null ? "HRV –" : `HRV ${F(r.hrv)} ms`}</strong><span class="sub">${r.hrvDiffPct !== null ? `${r.hrvDiffPct > 0 ? "+" : ""}${F(r.hrvDiffPct)} % zum eigenen Median · ` : ""}Erholung ${r.readiness ?? "–"}/10 · Muskelkater ${r.soreness ?? "–"}/10</span></td></tr>`)
            .join("")}</tbody></table>`
        : `<p class="muted small">Noch keine abgeschlossenen Einheiten mit Folgetag.</p>`
    }
    ${trainingAdviceHtml(db, t, { esc, note, head })}
    ${
      hits.length
        ? `${head("Abwechslung")}<ul class="plain-list training-rules">${hits
            .map((h) => `<li><strong>${esc(h.text)}</strong><span class="sub">${esc(h.exercises.join(", "))} · ${esc(D.formatDate(h.from))}–${esc(D.formatDate(h.to))}</span>${h.rule.image === "calf" ? `<img class="training-rules__img" src="icons/wade-anatomie.svg" alt="Wadenmuskulatur von hinten und von der Seite: Musculus gastrocnemius (rot) und Musculus soleus (orange)">` : ""}<p class="small">${esc(h.rule.reason)}</p><p class="muted small">Quelle: ${esc(h.rule.source)}</p></li>`)
            .join("")}</ul>`
        : ""
    }
    ${note("Einordnung je Einheit nach den Arbeitssätzen (Muskelgruppe der Übung): Beine ab 70 % → Beine, Drücken bzw. Ziehen ab 70 % → Push bzw. Pull, sonst Oberkörper; gemischt → Ganzkörper. 1RM nach Epley (Schätzung). Folgetag: Werte des nächsten Tages, HRV gegen den Median der 28 Tage vor der Einheit. „Abwechslung“: Gegenrichtung einer Übung ohne belegten Vorteil, ab drei Einheiten mit der Muskelgruppe.")}`;
  return card("training-insights", "Training", "letzte 4 Wochen", body, { area: "training", wide: true });
}

function adoptTdeeHtml(tdee, t) {
  const g = P.goalFor(buildDb(), t);
  if (!g) return `<p class="muted small">Zum Übernehmen zuerst Tagesziele anlegen (Settings → Tagesziele).</p>`;
  const kcal = Math.round(tdee + (g.energyAdjustKcal ?? 0));
  return `<button class="btn sm" data-act="ins-tdee-adopt" data-arg="${kcal}">Als Kalorienziel übernehmen (${D.formatNumber(kcal, 0)} kcal)</button>`;
}

function adaptiveTdeeCard(data, today) {
  const A = D.adaptiveTdee;
  const r = A.adaptiveTdee(data.nutrition, data.measurements.filter((m) => m.metricId === "00000000-0000-7000-8000-000000000001"), today);
  const F = (v, d = 0) => D.formatNumber(v, d);
  const body =
    r.kind === "insufficient"
      ? `<p class="muted">Dafür braucht es mindestens ${A.TDEE_MIN_SPAN} Tage mit ${A.TDEE_MIN_FOOD_DAYS} vollständig erfassten Ernährungstagen und ${A.TDEE_MIN_WEIGHINS} Wiegungen (bisher ${r.spanDays} Tage, ${r.foodDays} Ernährungstage, ${r.weighIns} Wiegungen).</p>`
      : `<p><strong>${F(r.tdee)} kcal</strong> je Tag – Aufnahme Ø ${F(r.intakeAvg)} kcal, Gewicht ${r.trendKgPerWeek >= 0 ? "+" : "−"}${F(Math.abs(r.trendKgPerWeek), 2)} kg je Woche.</p>${adoptTdeeHtml(r.tdee, today)}`;
  return card(
    "adaptive-tdee",
    "Echter Verbrauch",
    "aus dem Gewichtsverlauf",
    `${body}<p class="card__note">Mittlere Aufnahme der vollständig erfassten Tage minus Energie aus der Trendgeraden deiner Wiegungen (7.700 kcal je kg), letzte 28 Tage. Nur ein Vorschlag.</p>`,
    { area: "nutrition" },
  );
}

function lateTrainingCard(data) {
  const L = D.lateTraining;
  const r = L.lateTraining(data.workouts, data.sleep);
  const body =
    r.kind === "insufficient"
      ? `<p class="muted">Noch zu wenige Trainingstage mit Uhrzeit, Dauer und Schlaf in der Nacht danach (bisher ${r.late} späte und ${r.early} frühere, nötig sind je ${L.LATE_MIN_DAYS}).</p>`
      : r.notable
        ? `<p>${esc(r.text)}</p>`
        : `<p class="muted">Kein deutlicher Unterschied (unter ${L.LATE_MIN_DIFF} Minuten) zwischen Nächten nach spätem und früherem Training (${r.late} späte, ${r.early} frühere Trainingstage).</p>`;
  return card(
    "late-training",
    "Spätes Training und Schlaf",
    `letzte ${ASSOCIATION_WEEKS} Wochen`,
    `${body}<p class="card__note">Spät = Ende des Trainings weniger als 3 Stunden vor deiner üblichen Zubettgehzeit (Median der Schlafeinträge). Verglichen werden Schlafdauer und Einschlafzeit der Nacht danach. Nur Beschreibung deiner Daten, keine Ursache.</p>`,
    { area: "sleep" },
  );
}

export function viewInsights() {
  const S = X.S;
  if (!S.catalog?.pc) return `${X.header("Insights")}<main class="wrap"><section class="card"><p class="warn">Für Insights wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Import/Export „Neue Exportdatei laden“.</p></section></main>`;
  const t = today();
  const currentWeek = D.trends.weekStart(t);
  // Voreinstellung: letzte vollständige Woche (1.118.0, wie PC 1.0.194)
  const week = S.insightsWeek && S.insightsWeek <= currentWeek ? S.insightsWeek : D.trends.shiftDays(currentWeek, -7);
  const weekEnd = D.trends.shiftDays(week, 6);
  const db = buildDb();
  const weekData = O.insightsFor(db, D.trends.shiftDays(week, -7), weekEnd);
  const s = D.insights.weeklySummary(weekData, week);
  const hasAny = weekData.sleep.length + weekData.recovery.length + weekData.workouts.length + weekData.nutrition.length + weekData.measurements.length + weekData.lifestyle.length > 0;
  const kw = D.trends.isoWeek(week).week;

  const cards = [];
  // Weekly Reports (1.49.0): standardmäßig ganz oben, wie am PC
  cards.push({ id: "weekly-reports", node: weeklyReportsCard(card) });
  // 1.54.0 wie am PC: Ziele, Empfehlungen zu den Hauptzielen, Datenqualität
  cards.push({ id: "goals", node: targetGoalsCard(db, card, t) });
  cards.push({ id: "period-review", node: periodReviewCard(db, card, t) });
  cards.push({ id: "goal-advice", node: goalAdviceCard(db, card, t) });
  cards.push({ id: "normal-range", node: normalRangeCard(db, t) });
  cards.push({ id: "training-insights", node: trainingInsightsCard(db, t) });
  // Verbindungen (1.185.0, wie PC 1.0.254): Diät und Körper, Training, Schlaf, Gesundheit
  const conn = connData(db, t);
  for (const area of D.connections.CONN_AREAS) cards.push({ id: `connections-${area}`, node: connectionsCard(card, area, conn, t) });
  cards.push({ id: "data-quality", node: dataQualityCard(db, card, t) });
  if (hasAny) {
    cards.push({
      id: "observations",
      empty: s.observations.length === 0,
      node: card(
        "observations",
        "Beobachtungen dieser Woche",
        week === currentWeek ? "laufende Woche" : D.trends.formatRange(s.from, s.to),
        `${
          s.observations.length
            ? `<ul class="plain-list insight-list">${s.observations.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`
            : `<p class="muted">Keine deutlichen Veränderungen gegenüber der Vorwoche – oder noch zu wenige Werte für einen Vergleich.</p>`
        }
        ${s.gaps.length ? `<details class="ov-more"><summary>Datenlage (${s.gaps.length})</summary><ul class="plain-list insight-list insight-list--muted">${s.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></details>` : ""}
        ${week === currentWeek ? note(`Die Woche läuft noch; Werte bis heute (${esc(D.formatDate(t))}).`) : ""}`,
        { wide: true },
      ),
    });
    cards.push({ id: "weekly-analysis", node: weeklyAnalysisCards(db, week, weekEnd, weekData) });
    for (const sec of s.sections) {
      cards.push({
        id: `section-${sec.area}`,
        empty: sec.values.length === 0,
        node: card(`section-${sec.area}`, sec.title || AREA_TITLES[sec.area] || sec.area, "", rowsTable(sec.values, "change"), { area: sec.area }),
      });
    }
    cards.push({
      id: "lifestyle",
      empty: s.lifestyleNotes.length === 0,
      node: card(
        "lifestyle",
        "Lebensstil-Notizen",
        "diese Woche",
        s.lifestyleNotes.length
          ? `<ul class="plain-list note-list">${s.lifestyleNotes.map((n) => `<li><strong>${esc(D.formatDate(n.date))}</strong> <span class="tag">${esc(D.lifestyleCategoryLabel(n.category))}</span><br>${esc(n.text)}</li>`).join("")}</ul>`
          : `<p class="muted">Keine Notizen in dieser Woche. Notizen legst du am PC unter Body &amp; Longevity → Lebensstil an.</p>`,
        { area: "body" },
      ),
    });
  }
  const longData = O.insightsFor(db, D.trends.shiftDays(currentWeek, -7 * (ASSOCIATION_WEEKS - 1)), t);
  cards.push({ id: "associations", node: associationsCard(longData, t) });
  cards.push({ id: "coverage", node: coverageCard(longData, t) });
  // 1.89.0 wie am PC: weitere Auswertungen (parity.js)
  cards.push({ id: "training-nutrition", node: PA.trainingNutritionCard(card, db, week, weekData.workouts) });
  cards.push({ id: "supplement-sleep", node: PA.supplementSleepCard(card, db, O.insightsFor(db, D.trends.shiftDays(t, -84), t)) });
  const caffeineNode = PA.caffeineSleepCard(card, longData, (d) => CF.intakesOn(S.catalog, S.caffeine, d));
  if (caffeineNode) cards.push({ id: "caffeine", node: caffeineNode });
  // Spätes Training und Schlaf (1.119.0, wie PC 1.0.195)
  cards.push({ id: "late-training", node: lateTrainingCard(longData) });
  // Echter Verbrauch aus dem Gewichtsverlauf (1.119.0, wie PC 1.0.195) – nur mit Einstellung am PC
  const tdeeMode = D.adaptiveTdee.parseTdeeMode(db.settings.get(D.adaptiveTdee.TDEE_MODE_KEY) ?? null);
  if (tdeeMode !== "calculated") cards.push({ id: "adaptive-tdee", node: adaptiveTdeeCard(longData, t) });
  if (db.settings.get("secret_protocols") === "1") {
    const hrtNode = PA.hrtRecoveryCard(card, longData, SD.hrtEntriesOf(S.catalog, S.super));
    if (hrtNode) cards.push({ id: "hrt", node: hrtNode });
  }
  const watchNode = associationsHtml(wearableOf(S.catalog));
  if (watchNode) cards.push({ id: "watch", node: watchNode });
  const readings = readingsOf(S.catalog, S.glucose);
  const glucoseNode = readings.length ? glucoseContextHtml(S.catalog, readings) : "";
  if (glucoseNode) cards.push({ id: "glucose", node: glucoseNode });
  // Datenauszug mit PDF (1.93.0, wie ReportCard.tsx am PC)
  cards.push({ id: "report", node: reportCard(db, card) });

  const arranged = arrangeCards(db, D.INSIGHTS_LAYOUT_KEY, cards);
  const layout = D.parseLayout(db.settings.get(D.INSIGHTS_LAYOUT_KEY) ?? null);
  return `${X.header("Insights")}<main class="wrap">
    <section class="card day-nav">
      <button class="btn sm" data-act="ins-week" data-arg="-7" aria-label="Vorherige Woche">‹</button>
      <div class="day-nav__date"><strong>KW ${kw}</strong><span class="muted small">${esc(D.trends.formatRange(week, weekEnd))}</span>
        ${week !== currentWeek ? `<button class="linkbtn" data-act="ins-week" data-arg="0">Diese Woche</button>` : ""}</div>
      <button class="btn sm" data-act="ins-week" data-arg="7" aria-label="Nächste Woche" ${week >= currentWeek ? "disabled" : ""}>›</button>
    </section>
    ${verdictLineHtml(verdictData(db, t))}
    <div class="ov-grid">${arranged.map((c) => (c.empty && layout.emptyLast ? `<div class="overview-card--empty">${c.node}</div>` : c.node)).join("")}</div>
    ${hasAny ? "" : `<section class="card"><h3>Keine Daten in dieser und der Vorwoche</h3><p class="muted">Sobald du Schlaf, Regeneration, Training, Ernährung oder Körperwerte erfasst, entsteht hier ein Wochenrückblick. Es werden keine Werte geschätzt oder ergänzt.</p></section>`}
  </main>`;
}

export const insightsActions = {
  "ins-tdee-adopt": async (el) => {
    const t = today();
    const db = buildDb();
    const g = P.goalFor(db, t);
    if (!g) return;
    const draft = { ...GL.toDraft(g, t), energyMode: "fixed", energyKcal: String(Number(el.dataset.arg)), direction: "maintain", adjustAmount: "" };
    X.S.goals = GL.normGoals(X.S.goals);
    try {
      GL.saveGoal(X.S.goals, db.goals, draft, { uuid: X.uuid, now: new Date() });
      await X.store.set("goals", X.S.goals);
    } catch (e) {
      return X.toast(e.message, true);
    }
    X.toast(`Ab heute gilt ${D.formatNumber(Number(el.dataset.arg), 0)} kcal als Kalorienziel (Settings → Tagesziele).`);
    X.rerender();
  },
  "ins-week": (el) => {
    const S = X.S;
    const t = today();
    const current = D.trends.weekStart(t);
    const n = Number(el.dataset.arg);
    const week = n === 0 ? current : D.trends.shiftDays(S.insightsWeek ?? D.trends.shiftDays(current, -7), n);
    S.insightsWeek = week > current ? current : week;
    X.rerender();
  },
};
