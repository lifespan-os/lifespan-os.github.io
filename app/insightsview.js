// LIFESPAN OS Mobil – Insights wie am PC (1.8.0): Wochenrückblick mit Wochenwahl, Beobachtungen,
// Wochenanalyse und Datenprüfung, Bereiche der Woche, Lebensstil-Notizen, mögliche
// Zusammenhänge (12 Wochen) und „Welche Daten die Auswertung verbessern“ – wie InsightsPage.tsx,
// in der Anordnung vom PC (Settings `ui.insights_layout`). Nur Ansicht; gerechnet mit den
// Regeln aus pcdomain.js (= src/domain), Daten aus pcoverview.js (wie insights.rs).

import * as O from "./pcoverview.js";
import * as D from "./pcdomain.js";
import { buildDb, today } from "./diary.js";

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
  return (db.pc.grip_strength_measurement ?? []).map((g) => ({
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
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  }));
}

function weeklyAnalysisCards(db, week, weekEnd, data) {
  const setLog = O.setLog(db);
  const measurements = O.measurementsBetween(db, null, D.trends.shiftDays(week, -LOOKBACK_DAYS), weekEnd);
  const range = { from: week, to: weekEnd };
  const a = D.weeklyAnalysis({ week: range, sleep: data.sleep, measurements, grip: gripOf(db), setLog, workouts: data.workouts, nutrition: data.nutrition, goal: data.goal });
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

export function viewInsights() {
  const S = X.S;
  if (!S.catalog?.pc) return `${X.header("Insights")}<main class="wrap"><section class="card"><p class="warn">Für Insights wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Settings „Neue Exportdatei laden“.</p></section></main>`;
  const t = today();
  const currentWeek = D.trends.weekStart(t);
  const week = S.insightsWeek && S.insightsWeek <= currentWeek ? S.insightsWeek : currentWeek;
  const weekEnd = D.trends.shiftDays(week, 6);
  const db = buildDb();
  const weekData = O.insightsFor(db, D.trends.shiftDays(week, -7), weekEnd);
  const s = D.insights.weeklySummary(weekData, week);
  const hasAny = weekData.sleep.length + weekData.recovery.length + weekData.workouts.length + weekData.nutrition.length + weekData.measurements.length + weekData.lifestyle.length > 0;
  const kw = D.trends.isoWeek(week).week;

  const cards = [];
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

  const layout = D.parseLayout(db.settings.get(D.INSIGHTS_LAYOUT_KEY) ?? null);
  const arranged = D.arrange(cards, layout);
  return `${X.header("Insights")}<main class="wrap">
    <p class="muted small">Wochenrückblick und vorsichtige Beobachtungen – ausschließlich aus deinen tatsächlich erfassten Daten. Die Auswertungen beschreiben nur deine Einträge. Sie sind keine Diagnose, treffen keine Aussagen über biologisches Alter und ersetzen keine ärztliche Beratung.</p>
    <section class="card day-nav">
      <button class="btn sm" data-act="ins-week" data-arg="-7" aria-label="Vorherige Woche">‹</button>
      <div class="day-nav__date"><strong>KW ${kw}</strong><span class="muted small">${esc(D.trends.formatRange(week, weekEnd))}</span>
        ${week !== currentWeek ? `<button class="linkbtn" data-act="ins-week" data-arg="0">Diese Woche</button>` : ""}</div>
      <button class="btn sm" data-act="ins-week" data-arg="7" aria-label="Nächste Woche" ${week >= currentWeek ? "disabled" : ""}>›</button>
    </section>
    ${hasAny ? "" : `<section class="card"><h3>Keine Daten in dieser und der Vorwoche</h3><p class="muted">Sobald du Schlaf, Regeneration, Training, Ernährung oder Körperwerte erfasst, entsteht hier ein Wochenrückblick. Es werden keine Werte geschätzt oder ergänzt.</p></section>`}
    <div class="ov-grid">${arranged.map((c) => (c.empty && layout.emptyLast ? `<div class="overview-card--empty">${c.node}</div>` : c.node)).join("")}</div>
    <p class="muted small ov-source">Koffein und Schlaf, Hormongaben und der Datenauszug (PDF) gibt es bisher nur am PC.</p>
  </main>`;
}

export const insightsActions = {
  "ins-week": (el) => {
    const S = X.S;
    const t = today();
    const current = D.trends.weekStart(t);
    const n = Number(el.dataset.arg);
    const week = n === 0 ? current : D.trends.shiftDays(S.insightsWeek ?? current, n);
    S.insightsWeek = week > current ? current : week;
    X.rerender();
  },
};
