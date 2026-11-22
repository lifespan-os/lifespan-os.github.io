// LIFESPAN OS Mobil – Angleichung an den PC, Paket E (1.92.0):
// - Insights → Monats- und Jahresrückblick wie `PeriodReviewCard.tsx` (Kennzahlen mit Vergleich zum
//   Vorzeitraum, Aufteilung nach Wochen bzw. Monaten, neue Rekorde, erfasste Tage),
// - Training → Datenbank → Maschinen: „Vermutlich doppelt“ wie `MachinesCard.tsx`.
// Rechnung aus pcdomain.js (`periodReview`, `duplicates`); PDF seit 1.93.0 (pdfparity.js).

import * as D from "./pcdomain.js";
import * as O from "./pcoverview.js";
import { X, today } from "./diary.js";
import { reviewPdfResult } from "./pdfparity.js";

const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);
const pad = (n) => String(n).padStart(2, "0");

/** „2026-11“ → „November 2026“ (wie `monthLabel` am PC). */
export function monthName(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 15).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

/** Die letzten 24 Monate (neueste zuerst) bzw. die letzten 5 Jahre (wie am PC). */
export function reviewChoices(kind, t) {
  const y = Number(t.slice(0, 4));
  if (kind === "year") return Array.from({ length: 5 }, (_, i) => String(y - i)).map((v) => [v, v]);
  const m = Number(t.slice(5, 7));
  return Array.from({ length: 24 }, (_, i) => {
    const total = y * 12 + (m - 1) - i;
    const key = `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
    return [key, monthName(key)];
  });
}

/** Rückblick für die gewählte Auswahl (auch für das PDF). */
export function periodReviewNow(db, t = today()) {
  const S = X.S;
  const R = D.periodReview;
  const kind = S.prKind === "year" ? "year" : "month";
  const key = S.prKey ?? (kind === "year" ? t.slice(0, 4) : t.slice(0, 7));
  const range = R.reviewRange(kind, key);
  const data = O.insightsFor(db, range.prevFrom, range.to);
  return R.periodReview({
    range,
    workouts: data.workouts,
    nutrition: data.nutrition,
    sleep: data.sleep,
    neat: data.neat ?? [],
    measurements: O.measurementsBetween(db, null, range.prevFrom, range.to),
    setLog: O.setLog(db),
  });
}

export function periodReviewCard(db, card, t = today()) {
  const S = X.S;
  const R = D.periodReview;
  const kind = S.prKind === "year" ? "year" : "month";
  const key = S.prKey ?? (kind === "year" ? t.slice(0, 4) : t.slice(0, 7));
  const range = R.reviewRange(kind, key);
  let review;
  try {
    review = periodReviewNow(db, t);
  } catch (e) {
    return card("period-review", "Monats- und Jahresrückblick", "", `<p class="warn small">${esc(e.message || "Der Rückblick konnte nicht berechnet werden.")}</p>`, { wide: true });
  }
  const sel = (k, label, options, cur) =>
    `<div class="field"><label for="pr-${k}">${esc(label)}</label><select id="pr-${k}" data-pr="${k}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
  const kpis = `<table class="data-table pr-kpis"><thead><tr><th scope="col">Kennzahl</th><th scope="col" class="num">Wert</th></tr></thead><tbody>${review.kpis
    .map((k) => `<tr><td>${esc(k.label)}<span class="sub">${esc(k.basis)}</span></td><td class="num"><strong>${esc(k.value)}</strong>${k.change ? `<span class="sub">${esc(k.change)}</span>` : ""}</td></tr>`)
    .join("")}</tbody></table>`;
  const v = (x, f) => (x === null || x === undefined ? "–" : f(x));
  const rows = review.rows.length
    ? `<details class="pr-more"><summary class="small">Aufteilung nach ${esc(review.rowLabel === "Woche" ? "Wochen" : review.rowLabel === "Monat" ? "Monaten" : review.rowLabel)}</summary><div class="table-scroll"><table class="data-table pr-rows"><thead><tr><th scope="col">${esc(review.rowLabel)}</th><th scope="col" class="num">Einh.</th><th scope="col" class="num">min</th><th scope="col" class="num">Ø kcal</th><th scope="col" class="num">Ø Schlaf</th><th scope="col" class="num">Ø Schritte</th><th scope="col" class="num">Ø kg</th></tr></thead><tbody>${review.rows
        .map(
          (r) =>
            `<tr><td>${esc(r.label)}</td><td class="num">${esc(F(r.trainings))}</td><td class="num">${esc(F(r.trainingMin))}</td><td class="num">${esc(v(r.kcal, (x) => F(x)))}</td><td class="num">${esc(v(r.sleepMin, (x) => D.formatDuration(x)))}</td><td class="num">${esc(v(r.steps, (x) => F(x)))}</td><td class="num">${esc(v(r.weight, (x) => F(x, 1)))}</td></tr>`,
        )
        .join("")}</tbody></table></div></details>`
    : "";
  const records = review.records.length
    ? `<details class="pr-more"><summary class="small">${review.records.length} neue ${review.records.length === 1 ? "Rekord" : "Rekorde"}</summary><ul class="plain-list small">${review.records
        .map((r) => `<li><strong>${esc(r.exerciseName)}</strong> · ${esc(r.label)}: ${esc(r.display)} <span class="muted">(${esc(D.formatDate(r.date))}${r.previousDisplay ? `, vorher ${esc(r.previousDisplay)}` : ""})</span></li>`)
        .join("")}</ul></details>`
    : "";
  const running = range.to >= t;
  return card(
    "period-review",
    "Monats- und Jahresrückblick",
    `${D.formatDate(range.from)} – ${D.formatDate(range.to)}`,
    `<div class="bp-tools pr-tools">${sel("kind", "Rückblick", [["month", "Monat"], ["year", "Jahr"]], kind)}${sel("key", kind === "year" ? "Jahr" : "Monat", reviewChoices(kind, t), key)}</div>
    ${running ? `<p class="muted small">Der Zeitraum läuft noch – der Rückblick zeigt den Stand bis heute.</p>` : ""}
    ${kpis}${rows}${records}
    <button class="btn primary block" data-act="pr-pdf" ${S.prPdf?.busy ? "disabled" : ""}>${S.prPdf?.busy ? "Erstellt PDF …" : "PDF erstellen"}</button>
    ${reviewPdfResult()}
    <p class="muted small">${review.records.length} neue ${review.records.length === 1 ? "Rekord" : "Rekorde"} · ${esc(review.coverage.join(" · "))}</p>
    <p class="card__note">Wie der Weekly Report, über einen Monat bzw. ein Jahr: nur erfasste Werte, Mittelwerte über die Tage mit Einträgen, Vergleich mit dem Vormonat bzw. Vorjahr (${esc(range.prevLabel)}). Das PDF enthält zusätzlich die Aufteilung nach Wochen bzw. Monaten und alle neuen Rekorde.</p>`,
    { wide: true },
  );
}

/** Auswahl Monat/Jahr; true = behandelt. */
export function reviewChange(el) {
  const k = el.dataset?.pr;
  if (!k) return false;
  const S = X.S;
  if (k === "kind") {
    S.prKind = el.value;
    S.prKey = null;
  } else S.prKey = el.value;
  if (S.prPdf) S.prPdf = { message: null, pdf: null, busy: false };
  X.rerender();
  return true;
}

// ------------------------------------------------------------------ Maschinen: vermutlich doppelt

/** Hinweis in der Maschinendatenbank; Tippen öffnet die Details (`train-machine-open`). */
export function machineDupHtml(machines) {
  const Dp = D.duplicates;
  if (!Dp?.machineDuplicateGroups) return "";
  const groups = Dp.machineDuplicateGroups(machines);
  if (!groups.length) return "";
  const M = D.machinesDomain;
  return `<details class="dup-list"><summary class="small">Vermutlich doppelt: ${esc(Dp.describeGroups(groups))}</summary>
    <p class="muted small">Gleicher Hersteller, gleiche Serie und gleicher Name (ohne Groß-/Kleinschreibung, Leer- und Satzzeichen; archivierte zählen nicht) und keine unterscheidende Nummer. Prüfen und am PC eine davon archivieren bzw. im Master-Editor bereinigen – automatisch geändert wird nichts.</p>
    <ul class="plain-list">${groups
      .slice(0, 50)
      .map(
        (g) =>
          `<li>${g
            .map(
              (m) =>
                `<button class="linkbtn small" data-act="train-machine-open" data-arg="${esc(m.id)}">${esc(m.displayName)}</button> <span class="muted small">(${esc([m.manufacturer, m.origin === "app" ? "eigene" : null, M?.numberLabel?.(m) || null].filter(Boolean).join(", "))})</span>`,
            )
            .join(" · ")}</li>`,
      )
      .join("")}</ul></details>`;
}
