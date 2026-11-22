// LIFESPAN OS Mobil – PDFs am Handy (1.93.0, Angleichung an den PC, Paket F):
// - Insights → Datenauszug wie `ReportCard.tsx` (Zeitraum, Bereiche, Tageswerte, Veränderungen, PDF),
// - Nutrition → Tagebuch → „Tagebuch exportieren“ wie `DiaryExportPanel.tsx` (PDF je Tag),
// - Insights → Monats- und Jahresrückblick als PDF wie `PeriodReviewCard.tsx`.
// Rechnung und PDF aus pcdomain.js (report, reportPdf, nutritionExport, nutritionExportPdf,
// periodReviewPdf); die Daten setzt das Handy wie `report_data` bzw. die Tagesabfragen am PC zusammen.
// Das PDF wird über „Teilen“ weitergegeben oder als Link zum Öffnen/Sichern angeboten.

import * as D from "./pcdomain.js";
import * as O from "./pcoverview.js";
import * as P from "./pcdb.js";
import * as PS from "./pcsettings.js";
import * as CD from "./checklistdata.js";
import * as SD from "./superdata.js";
import { X, buildDb, today, nutrientCatalog } from "./diary.js";

const esc = (v) => X.esc(v);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const shift = (d, n) => D.trends.shiftDays(d, n);

export function nowLabel() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())} Uhr`;
}

/** Name aus dem Profil (für den Kopf der PDFs). */
export const personOf = (db) => db.profile?.name ?? null;

/**
 * PDF weitergeben: „Teilen“ am Handy, sonst ein Link zum Öffnen/Sichern. `st` bekommt
 * `message` und ggf. `pdf` ({ url, name }) für die Anzeige.
 */
export async function sharePdf(bytes, name, st, info = "") {
  if (st.pdf) URL.revokeObjectURL(st.pdf.url);
  st.pdf = null;
  const file = `${name}.pdf`.replace(/\.pdf\.pdf$/, ".pdf");
  const blob = new Blob([bytes], { type: "application/pdf" });
  const f = new File([blob], file, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [f] })) {
    try {
      await navigator.share({ files: [f], title: file });
      st.message = { tone: "ok", text: `„${file}“ weitergegeben${info ? ` ${info}` : ""}.` };
      return;
    } catch (e) {
      if (e?.name === "AbortError") {
        st.message = { tone: "ok", text: "Abgebrochen." };
        return;
      }
    }
  }
  st.pdf = { url: URL.createObjectURL(blob), name: file };
  st.message = { tone: "ok", text: `Das PDF ist bereit${info ? ` ${info}` : ""} – zum Öffnen oder Sichern antippen:` };
}

const pdfResult = (st) =>
  `${st.message ? `<p class="${st.message.tone === "error" ? "warn" : "muted small"}" role="status">${esc(st.message.text)}</p>` : ""}${
    st.pdf ? `<a class="btn blue block" href="${st.pdf.url}" download="${esc(st.pdf.name)}">${esc(st.pdf.name)}</a>` : ""
  }`;

// ------------------------------------------------------------------ Daten wie `report_data`

const secretOn = () => String(PS.effective(X.S.catalog, X.S.pcsettings, "secret_protocols")) === "1";

/** Zusammenstellung wie `repo::report::data` am PC. */
export function reportData(db, from, to) {
  const base = O.insightsFor(db, from, to);
  const water = new Map();
  for (const w of db.water ?? []) {
    if (w.date < from || w.date > to) continue;
    const cur = water.get(w.date) ?? { date: w.date, ml: 0, glasses: 0 };
    cur.ml += Number(w.amount_ml ?? 0);
    cur.glasses += 1;
    water.set(w.date, cur);
  }
  const supplements = [];
  for (const [date, list] of [...(db.intakesByDate?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b))) {
    if (date < from || date > to) continue;
    const names = P.intakesOn(db, date).flatMap((i) => i.items.map((it) => it.name));
    if (names.length) supplements.push({ date, count: names.length, names });
    void list;
  }
  const grip = (db.grip ?? db.pc.grip_strength_measurement ?? [])
    .filter((g) => g.date >= from && g.date <= to)
    .map((g) => ({ id: g.id, date: g.date, time: g.time ?? null, leftKg: g.left_kg, rightKg: g.right_kg, dominantHand: g.dominant_hand ?? null, sex: g.sex ?? null, ageYears: g.age_years ?? null, heightCm: g.height_cm ?? null, notes: g.notes ?? null, method: g.method ?? null, createdAt: g.created_at, updatedAt: g.updated_at }));
  const naps = (db.naps ?? []).filter((n) => n.date >= from && n.date <= to).map(O.sleepNap);
  const dayStatus = X.S.checklists ? CD.dayStatusOf(X.S.catalog, X.S.checklists, from, to) : [];
  const enabled = secretOn();
  const protocol = enabled && X.S.super ? SD.protocolEntriesOf(X.S.catalog, X.S.super, from).filter((e) => e.date <= to) : [];
  const metrics = (db.pc.body_metric ?? []).map((m) => ({ id: m.id, name: m.name, unit: m.unit, decimals: m.decimals ?? 1, position: m.position ?? 0, category: m.category ?? "other", archived: Boolean(m.archived) }));
  return { ...base, metrics, water: [...water.values()].sort((a, b) => a.date.localeCompare(b.date)), supplements, grip, naps, dayStatus, protocol, protocolEnabled: enabled };
}

// ------------------------------------------------------------------ Insights → Datenauszug

const reportState = () =>
  (X.S.repState ??= { from: shift(today(), -29), to: today(), areas: null, report: null, message: null, pdf: null, busy: false });

function reportChoices() {
  return D.report.REPORT_AREAS.filter((a) => a.key !== "superhuman" || secretOn());
}

function rangeError(st) {
  if (!ISO.test(st.from) || !ISO.test(st.to)) return "Bitte Beginn und Ende des Zeitraums angeben.";
  if (st.from > st.to) return "Der Beginn liegt nach dem Ende.";
  return null;
}

export function reportCard(db, card) {
  const st = reportState();
  const R = D.report;
  const choices = reportChoices();
  const areas = st.areas ?? choices.map((a) => a.key);
  const err = rangeError(st) ?? (areas.length ? null : "Bitte mindestens einen Bereich wählen.");
  const t = today();
  const quick = [
    ...[7, 30, 90, 365].map((n) => [n === 365 ? "12 Monate" : `${n} Tage`, shift(t, -(n - 1)), t]),
    ["Letzte Woche", D.reportRanges.previousWeek(t).from, D.reportRanges.previousWeek(t).to],
    ["Letzter Monat", D.reportRanges.previousMonth(t).from, D.reportRanges.previousMonth(t).to],
  ];
  const r = st.report;
  const color = (a) => D.reportPdf.AREA_COLORS[a];
  const result = r
    ? `<div class="rep-result">
        <p class="small"><strong>${esc(D.formatDate(r.from))} – ${esc(D.formatDate(r.to))}</strong> · ${r.dayCount} ${r.dayCount === 1 ? "Tag" : "Tage"}, davon ${r.days.length} mit Einträgen</p>
        <div class="rep-facts">${r.areas
          .map(
            (a) => `<div class="rep-fact" style="border-color:${color(a)}"><h4 style="color:${color(a)}">${esc(R.areaLabel(a))}</h4>${r.facts
              .filter((f) => f.area === a)
              .map((f) => `<p><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong></p>`)
              .join("")}${r.notes[a] ? `<p class="muted small">${esc(r.notes[a])}</p>` : ""}</div>`,
          )
          .join("")}</div>
        <details class="pr-more"><summary class="small">Tageswerte (${r.days.length})</summary>${
          r.days.length
            ? `<ul class="plain-list rep-days">${r.days
                .map(
                  (d) => `<li><strong>${esc(R.dayLabel(d.date))}</strong>${d.entries
                    .map((e) => `<div class="rep-day"><span class="small" style="color:${color(e.area)}">${esc(R.areaLabel(e.area))}</span><span class="small">${e.lines.map((l) => esc(l)).join("<br>")}</span></div>`)
                    .join("")}</li>`,
                )
                .join("")}</ul>`
            : `<p class="muted">Keine Einträge im gewählten Zeitraum.</p>`
        }</details>
        <details class="pr-more"><summary class="small">Veränderungen im Zeitraum (${r.changes.length})</summary>
          <p class="muted small">Messwerte: letzter gegenüber erstem Wert. Tagessummen (z. B. kcal, Volumen): Mittel der zweiten gegenüber der ersten Hälfte der Tage mit Wert.</p>
          ${r.areas
            .map((a) => {
              const list = r.changes.filter((c) => c.series.area === a);
              return `<h4 class="logs-sub" style="color:${color(a)}">${esc(R.areaLabel(a))}</h4>${
                list.length
                  ? `<table class="data-table rep-changes"><tbody>${list
                      .map(
                        (c) =>
                          `<tr><td>${esc(c.series.label)}<span class="sub">${esc(`${R.formatValue(c.series, c.first.value)} → ${R.formatValue(c.series, c.last.value)} · Ø ${R.formatValue(c.series, c.mean)} · ${c.count} Werte`)}</span></td><td class="num"><strong>${esc(R.formatChange(c))}</strong></td></tr>`,
                      )
                      .join("")}</tbody></table>`
                  : `<p class="muted small">${esc(r.notes[a] ?? "Keine Verläufe im Zeitraum.")}</p>`
              }`;
            })
            .join("")}
        </details>
      </div>`
    : "";
  return card(
    "report",
    "Datenauszug",
    "eigener Zeitraum · PDF",
    `<p class="muted small card-info">Wähle Zeitraum und Bereiche: Die Werte erscheinen Tag für Tag, am Ende stehen die Veränderungen im Zeitraum. „PDF erstellen“ gibt den Bericht über „Teilen“ weiter oder bietet ihn zum Sichern an – erstellt wird er auf dem Handy.</p>
    <div class="grid2 rep-range"><div class="field"><label for="rep-from">Von</label><input id="rep-from" type="date" data-rep="from" value="${esc(st.from)}"></div><div class="field"><label for="rep-to">Bis</label><input id="rep-to" type="date" data-rep="to" value="${esc(st.to)}"></div></div>
    <div class="chips rep-quick">${quick.map(([l, f, to]) => `<button class="chip ${st.from === f && st.to === to ? "on" : ""}" data-act="rep-quick" data-arg="${f}|${to}">${esc(l)}</button>`).join("")}</div>
    <fieldset class="rep-areas"><legend class="small">Bereiche</legend>${choices
      .map((a) => `<label class="mg-item"><input type="checkbox" data-rep-area="${a.key}" ${areas.includes(a.key) ? "checked" : ""}><span><strong>${esc(a.label)}</strong><span class="muted small">${esc(a.hint)}</span></span></label>`)
      .join("")}<div class="row-actions"><button class="linkbtn small" data-act="rep-all">Alle wählen</button><button class="linkbtn small" data-act="rep-none">Keine</button></div></fieldset>
    ${err ? `<p class="warn small">${esc(err)}</p>` : ""}
    <div class="row-actions"><button class="btn" data-act="rep-show" ${err || st.busy ? "disabled" : ""}>Auszug anzeigen</button><button class="btn primary" data-act="rep-pdf" ${err || st.busy ? "disabled" : ""}>${st.busy ? "Erstellt PDF …" : "PDF erstellen"}</button></div>
    ${pdfResult(st)}
    ${result}`,
    { wide: true },
  );
}

function buildReport() {
  const st = reportState();
  const areas = st.areas ?? reportChoices().map((a) => a.key);
  const db = buildDb();
  st.report = D.report.buildReport(reportData(db, st.from, st.to), areas);
  return { db, report: st.report };
}

// ------------------------------------------------------------------ Nutrition → Tagebuch exportieren

const diaryState = () => (X.S.dxState ??= { open: false, from: null, to: null, message: null, pdf: null, busy: false, progress: null });

export function diaryExportHtml(date) {
  const st = diaryState();
  if (!st.open) return `<section class="card dx-card"><button class="btn block" data-act="dx-open">Tagebuch exportieren (PDF)</button></section>`;
  const from = st.from ?? shift(date, -6);
  const to = st.to ?? date;
  return `<section class="card dx-card" id="dx-card">
    <div class="wo-head"><h3>Tagebuch exportieren</h3><button class="linkbtn" data-act="dx-close" ${st.busy ? "disabled" : ""}>Schließen</button></div>
    <p class="muted small card-info">Je Tag: Tagessumme mit Tagesbedarf im Vergleich, weitere Nährwerte, Wasserhaushalt, Mikronährstoffe und weitere Stoffe, Mahlzeiten mit allen Lebensmitteln sowie Supplements. Vorne steht eine Übersicht aller Tage mit Bilanz (Defizit bzw. Überschuss zum Tagesbedarf) und Summe. Wie am PC, nur ohne das Wasserzeichen.</p>
    <div class="grid2 rep-range"><div class="field"><label for="dx-from">Von</label><input id="dx-from" type="date" data-dx="from" value="${esc(from)}"></div><div class="field"><label for="dx-to">Bis</label><input id="dx-to" type="date" data-dx="to" value="${esc(to)}"></div></div>
    <div class="chips rep-quick">${[
      ["Dieser Tag", 0],
      ["7 Tage", 6],
      ["30 Tage", 29],
    ]
      .map(([l, n]) => `<button class="chip ${from === shift(date, -n) && to === date ? "on" : ""}" data-act="dx-quick" data-arg="${shift(date, -n)}|${date}">${esc(l)}</button>`)
      .join("")}</div>
    <button class="btn primary block" data-act="dx-pdf" ${st.busy ? "disabled" : ""}>${st.busy ? esc(st.progress ?? "Erstellt …") : "PDF erstellen"}</button>
    ${pdfResult(st)}
  </section>`;
}

export function diaryDays(from, to) {
  const range = D.nutritionExport.exportDates(from, to);
  if (!range.ok) throw new Error(range.error);
  const db = buildDb();
  const catalog = nutrientCatalog(db);
  const p = db.profile;
  const profile = p ? { name: p.name ?? null, sex: p.sex ?? null, birthDate: p.birth_date ?? null, birthYear: p.birth_year ?? null, lifePhase: p.life_phase ?? null } : null;
  const cache = new Map();
  const days = range.dates.map((d) => {
    let energy = null;
    try {
      energy = P.energyFor(db, d, cache);
    } catch {
      energy = null;
    }
    let water = null;
    try {
      water = P.waterDay(db, d);
    } catch {
      water = null;
    }
    return D.nutritionExport.buildDiaryExportDay(
      { date: d, day: P.mealDay(db, d), fast: P.fastDay(db, d), intakes: P.intakesOn(db, d), water, goal: P.goalFor(db, d), energy },
      catalog,
      profile,
    );
  });
  return { db, days };
}

// ------------------------------------------------------------------ Aktionen

export const pdfParityActions = {
  "rep-quick": (el) => {
    const st = reportState();
    [st.from, st.to] = el.dataset.arg.split("|");
    st.report = null;
    X.rerender();
  },
  "rep-all": () => {
    reportState().areas = reportChoices().map((a) => a.key);
    X.rerender();
  },
  "rep-none": () => {
    reportState().areas = [];
    X.rerender();
  },
  "rep-show": () => {
    const st = reportState();
    st.message = null;
    try {
      buildReport();
    } catch (e) {
      st.message = { tone: "error", text: e?.message ?? String(e) };
    }
    X.rerender();
  },
  "rep-pdf": async () => {
    const st = reportState();
    st.message = null;
    st.busy = true;
    X.rerender();
    try {
      const { db, report } = buildReport();
      const bytes = D.reportPdf.reportToPdf(report, { person: personOf(db), createdAt: nowLabel() });
      await sharePdf(bytes, D.reportPdf.reportFileName(report), st);
    } catch (e) {
      st.message = { tone: "error", text: e?.message ?? String(e) };
    } finally {
      st.busy = false;
      X.rerender();
    }
  },
  "dx-open": () => {
    diaryState().open = true;
    X.rerender();
    document.getElementById("dx-card")?.scrollIntoView({ block: "start" });
  },
  "dx-close": () => {
    const st = diaryState();
    st.open = false;
    st.message = null;
    X.rerender();
  },
  "dx-quick": (el) => {
    const st = diaryState();
    [st.from, st.to] = el.dataset.arg.split("|");
    X.rerender();
  },
  "dx-pdf": async () => {
    const st = diaryState();
    const date = X.S.diaryDate ?? today();
    const from = document.querySelector('[data-dx="from"]')?.value || st.from || shift(date, -6);
    const to = document.querySelector('[data-dx="to"]')?.value || st.to || date;
    st.from = from;
    st.to = to;
    st.message = null;
    st.busy = true;
    st.progress = "PDF wird erstellt …";
    X.rerender();
    // kurz warten, damit der Hinweis sichtbar ist, bevor die Rechnung den Ablauf blockiert
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { db, days } = diaryDays(from, to);
      const bytes = D.nutritionExportPdf.nutritionExportPdf(days, { from, to, person: personOf(db), createdAt: nowLabel(), watermark: null });
      const used = days.filter((d) => d.hasEntries).length;
      await sharePdf(bytes, D.nutritionExport.exportFileName(from, to), st, `(${days.length} ${days.length === 1 ? "Tag" : "Tage"}, ${used} mit Einträgen)`);
    } catch (e) {
      st.message = { tone: "error", text: e?.message ?? String(e) };
    } finally {
      st.busy = false;
      st.progress = null;
      X.rerender();
    }
  },
  "pr-pdf": async () => {
    const S = X.S;
    const st = (S.prPdf ??= { message: null, pdf: null, busy: false });
    st.message = null;
    st.busy = true;
    X.rerender();
    try {
      const { periodReviewNow } = await import("./reviewparity.js");
      const db = buildDb();
      const review = periodReviewNow(db);
      const bytes = D.periodReviewPdf.periodReviewToPdf(review, { person: personOf(db), createdAt: nowLabel() });
      await sharePdf(bytes, D.periodReviewPdf.periodReviewFileName(review), st);
    } catch (e) {
      st.message = { tone: "error", text: e?.message ?? String(e) };
    } finally {
      st.busy = false;
      X.rerender();
    }
  },
};

/** Eingaben (Zeitraum, Bereiche); true = behandelt. */
export function pdfParityChange(el) {
  if (el.dataset?.rep) {
    const st = reportState();
    st[el.dataset.rep] = el.value;
    st.report = null;
    X.rerender();
    return true;
  }
  if (el.dataset?.repArea) {
    const st = reportState();
    const cur = st.areas ?? reportChoices().map((a) => a.key);
    const k = el.dataset.repArea;
    st.areas = el.checked ? [...new Set([...cur, k])] : cur.filter((x) => x !== k);
    st.report = null;
    X.rerender();
    return true;
  }
  if (el.dataset?.dx) {
    diaryState()[el.dataset.dx] = el.value;
    X.rerender();
    return true;
  }
  return false;
}

/** Ergebnis-Anzeige für den Rückblick (Meldung/Link). */
export const reviewPdfResult = () => pdfResult(X.S.prPdf ?? { message: null, pdf: null });
