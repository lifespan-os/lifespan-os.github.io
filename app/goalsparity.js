// LIFESPAN OS Mobil – Ziele, Wochenziele und Hauptziele am Handy bearbeiten (1.91.0, Angleichung
// an den PC, Paket D): Insights → Ziele wie `GoalsCard.tsx` (Ziel anlegen, bearbeiten, archivieren,
// löschen; Meilensteine, Verlauf), Settings → Wochenziele wie `WeekGoalsPanel.tsx`, Settings →
// Hauptziele mit Einwilligung wie `MainGoalsPanel.tsx`.
// Rechnung aus pcdomain.js (targetGoals, dashboard, goalAdvice). Ziele liegen in paritydata.js
// (Tabelle `goal`), Wochen-/Hauptziele und Einwilligung als Einstellungen (pcsettings.js); alles
// geht mit „An den PC senden“ zurück.

import * as D from "./pcdomain.js";
import * as O from "./pcoverview.js";
import * as PR from "./paritydata.js";
import * as PS from "./pcsettings.js";
import { X, buildDb, today } from "./diary.js";
import { trendSvg, COLOR } from "./pcview.js";
import { refreshCatalog } from "./appbase.js";
import { autoAttrs, autoSaveHtml } from "./autosave.js";

const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);
const T = () => D.targetGoals;
const errOf = (errors, k) => (errors?.[k] ? `<p class="field-error">${esc(errors[k])}</p>` : "");
const inv = (errors, k) => (errors?.[k] ? 'aria-invalid="true"' : "");

const num = (t) => {
  const s = String(t ?? "").trim().replace(",", ".");
  const n = Number(s);
  return s === "" || !Number.isFinite(n) ? null : n;
};
const inputNum = (v) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

// ------------------------------------------------------------------ Insights → Ziele

function toGoal(g) {
  let milestones = [];
  try {
    milestones = JSON.parse(g.milestones ?? "[]");
  } catch {
    milestones = [];
  }
  return {
    id: g.id,
    title: g.title,
    kind: g.kind,
    exerciseId: g.exercise_id ?? null,
    metricId: g.metric_id ?? null,
    startDate: g.start_date,
    startValue: g.start_value ?? null,
    targetValue: g.target_value,
    targetDate: g.target_date ?? null,
    milestones: Array.isArray(milestones) ? milestones.filter((m) => typeof m === "number") : [],
    archived: Boolean(g.archived),
    notes: g.notes ?? null,
    createdAt: g.created_at ?? null,
  };
}

const goalsOf = (db) => (db.pc.goal ?? []).map(toGoal);
const metricList = () => X.S.catalog?.body?.metrics ?? [];
const exerciseList = (db) =>
  [...db.exercises.values()].filter((e) => !e.archived && e.category !== "cardio").sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));

function unitOf(kind, metricId) {
  return kind === "body_metric" ? metricList().find((m) => m.id === metricId)?.unit ?? "" : "kg";
}
function decOf(kind, metricId) {
  return kind === "body_metric" ? metricList().find((m) => m.id === metricId)?.decimals ?? 1 : 1;
}

function editorHtml(db, d, errors) {
  const labels = T().TARGET_GOAL_KIND_LABELS;
  const unit = unitOf(d.kind, d.metricId);
  const subject =
    d.kind === "body_metric"
      ? `<div class="field"><label for="tg-metric">Messgröße</label><select id="tg-metric" data-tg="metricId" required ${inv(errors, "metricId")}><option value="">Bitte wählen …</option>${metricList()
          .map((m) => `<option value="${esc(m.id)}" ${m.id === d.metricId ? "selected" : ""}>${esc(`${m.name} (${m.unit})`)}</option>`)
          .join("")}</select>${errOf(errors, "metricId")}</div>`
      : `<div class="field"><label for="tg-exercise">Übung</label><select id="tg-exercise" data-tg="exerciseId" required ${inv(errors, "exerciseId")}><option value="">Bitte wählen …</option>${exerciseList(db)
          .map((x) => `<option value="${esc(x.id)}" ${x.id === d.exerciseId ? "selected" : ""}>${esc(x.name)}</option>`)
          .join("")}</select>${errOf(errors, "exerciseId")}</div>`;
  const text = (key, label, value, { type = "text", mode = "", ph = "", hint = "", u = "", req = false } = {}) =>
    `<div class="field"><label for="tg-${key}">${esc(label)}${u ? ` <span class="muted small">(${esc(u)})</span>` : ""}</label><input id="tg-${key}" data-tg="${key}" type="${type}" ${req ? "required" : ""} ${mode ? `inputmode="${mode}"` : ""} value="${esc(value)}" ${ph ? `placeholder="${esc(ph)}"` : ""} ${inv(errors, key)}>${hint ? `<p class="muted small">${esc(hint)}</p>` : ""}${errOf(errors, key)}</div>`;
  return `<div class="goal-form tg-form" ${autoAttrs("tg", d.isNew ? "new" : "edit")}>
    ${text("title", "Name", d.title, { ph: "z. B. Kniebeuge 140 kg", req: true })}
    <div class="grid2">
      <div class="field"><label for="tg-kind">Art</label><select id="tg-kind" data-tg="kind">${Object.keys(labels)
        .map((k) => `<option value="${k}" ${k === d.kind ? "selected" : ""}>${esc(labels[k])}</option>`)
        .join("")}</select></div>
      ${subject}
    </div>
    <div class="grid2">
      ${text("targetValue", "Zielwert", d.targetValue, { mode: "decimal", u: unit, req: true })}
      ${text("startValue", "Ausgangswert", d.startValue, { mode: "decimal", u: unit, ph: "optional" })}
    </div>
    <div class="grid2">
      ${text("startDate", "Beginn", d.startDate, { type: "date" })}
      ${text("targetDate", "Zieldatum", d.targetDate, { type: "date" })}
    </div>
    ${text("milestones", "Zwischenziele", d.milestones, { ph: "z. B. 120; 130", hint: "Leer: automatisch bei 25, 50 und 75 % des Wegs. Ausgangswert leer: letzter Wert bis zum Beginn." })}
    <div class="field"><label for="tg-notes">Notiz</label><textarea id="tg-notes" data-tg="notes" rows="2" maxlength="2000" placeholder="optional" ${inv(errors, "notes")}>${esc(d.notes)}</textarea>${errOf(errors, "notes")}</div>
    ${d.isNew ? "" : `<label class="toggle"><input type="checkbox" data-tg="archived" ${d.archived ? "checked" : ""}> <span>Archiviert (abgeschlossen oder aufgegeben)</span></label>`}
    ${errOf(errors, "_")}
    ${autoSaveHtml("tg-save", { mode: d.isNew ? "new" : "edit" })}
    <div class="row-actions"><button class="btn" data-act="tg-cancel">${d.isNew ? "Abbrechen" : "Fertig"}</button>${d.isNew ? "" : `<button class="btn danger" data-act="tg-delete">Löschen</button>`}</div>
  </div>`;
}

function goalHtml(db, g, t) {
  const series = g.kind === "body_metric" ? T().metricSeries(O.measurementsBetween(db, null, "1900-01-01", t), g.metricId) : T().exerciseSeries(O.setLog(db), g.exerciseId, g.kind);
  const unit = unitOf(g.kind, g.metricId);
  const dec = decOf(g.kind, g.metricId);
  const p = T().goalProgress(g, series, t, dec);
  const fmt = (v) => `${F(v, Number.isInteger(v) ? 0 : dec)} ${unit}`.trim();
  const pct = p.share === null ? null : Math.round(p.share * 100);
  const subject = g.kind === "body_metric" ? metricList().find((m) => m.id === g.metricId)?.name ?? "Messgröße" : db.exercises.get(g.exerciseId)?.name ?? "Übung";
  const facts = [
    p.reachedOn ? `<strong>Erreicht am ${esc(D.formatDate(p.reachedOn))}.</strong>` : pct === null ? "Noch keine Werte." : `${pct} % des Wegs.`,
    p.start !== null ? `Start ${esc(fmt(p.start))}${p.startSource === "measured" ? " (gemessen)" : ""} → Ziel ${esc(fmt(g.targetValue))}${g.targetDate ? ` bis ${esc(D.formatDate(g.targetDate))}` : ""}.` : "",
    p.best ? `Bester Wert ${esc(fmt(p.best.value))} (${esc(D.formatDate(p.best.date))})${p.current && p.current.date !== p.best.date ? `, zuletzt ${esc(fmt(p.current.value))} (${esc(D.formatDate(p.current.date))})` : ""}.` : "",
    p.remaining !== null && p.remaining > 0 ? `Es fehlen ${esc(fmt(p.remaining))}.` : "",
    p.perWeekNeeded !== null ? `Nötig je Woche: ${p.direction === "up" ? "+" : "−"}${esc(fmt(p.perWeekNeeded))} (${p.daysLeft} Tage).` : "",
    p.daysLeft !== null && p.daysLeft < 0 && !p.reachedOn ? "Zieldatum überschritten." : "",
  ]
    .filter(Boolean)
    .join(" ");
  const marks = p.milestones
    .filter((m) => !m.isTarget)
    .map((m) => `<span class="tg-mark${m.reachedOn ? " is-reached" : ""}" style="left:${Math.min(100, Math.max(0, m.share * 100))}%"></span>`)
    .join("");
  return `<li class="tg-goal${g.archived ? " is-archived" : ""}">
    <div class="goal-row__head"><span><strong>${esc(g.title)}</strong> <span class="muted small">· ${esc(subject)} · ${esc(T().TARGET_GOAL_KIND_LABELS[g.kind])}${g.archived ? " · archiviert" : ""}</span></span><button class="linkbtn small" data-act="tg-edit" data-arg="${esc(g.id)}">Bearbeiten</button></div>
    <div class="tg-track" role="progressbar" aria-label="${esc(`Fortschritt ${g.title}`)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct ?? 0}"><span class="tg-fill" style="width:${pct ?? 0}%"></span>${marks}</div>
    <p class="small">${facts}</p>
    <ul class="tg-milestones small">${p.milestones
      .map((m) => `<li class="${m.reachedOn ? "is-reached" : ""}"><span>${m.isTarget ? "Ziel" : "Meilenstein"} ${esc(fmt(m.value))}</span><span>${m.reachedOn ? `erreicht ${esc(D.formatDate(m.reachedOn))}` : "offen"}</span></li>`)
      .join("")}</ul>
    ${p.points.length > 1 ? trendSvg(p.points, { color: COLOR.training, decimals: dec, height: 130, label: `Verlauf zum Ziel ${g.title}` }) : ""}
    ${g.notes ? `<p class="muted small">${esc(g.notes)}</p>` : ""}
  </li>`;
}

/** Insights → Ziele (Karte mit Bearbeiten). */
export function targetGoalsCard(db, card, t = today()) {
  const S = X.S;
  const all = goalsOf(db);
  const shown = all.filter((g) => S.tgShowArchived || !g.archived);
  const archived = all.filter((g) => g.archived).length;
  const editing = S.tgEdit ?? null;
  const body = `${editing ? editorHtml(db, editing, S.tgErr) : `<button class="btn primary block" data-act="tg-new">Ziel anlegen</button>`}
    ${
      shown.length
        ? `<ul class="plain-list tg-list">${shown.map((g) => goalHtml(db, g, t)).join("")}</ul>`
        : editing
          ? ""
          : `<p class="muted">Noch kein Ziel. Lege z. B. „Kniebeuge 140 kg“ (geschätztes 1RM) oder „Körperfett unter 15 %“ an – der Fortschritt kommt automatisch aus deinen Einheiten und Messwerten.</p>`
    }
    ${editing ? "" : suggestionsHtml(db, all, t)}
    ${archived ? `<button class="linkbtn small" data-act="tg-archived">${S.tgShowArchived ? "Archivierte ausblenden" : `${archived} archivierte anzeigen`}</button>` : ""}
    <p class="card__note">Fortschritt = Weg vom Ausgangswert zum Ziel, gemessen am besten Wert seit Beginn (höchster bzw. bei sinkenden Zielen niedrigster). Geschätztes 1RM nach Epley aus dem besten Arbeitssatz je Einheit (1–12 Wdh.), höchstes Gewicht aus Arbeitssätzen. Neue und geänderte Ziele gehen mit „An den PC senden“ an den PC.</p>`;
  return card("goals", "Ziele", `${all.filter((g) => !g.archived).length}`, body, { wide: true });
}

/**
 * Vorschläge aus den Hauptzielen (1.141.0, wie PC 1.0.195 `GoalsCard`): meistgenutzte Kraftübung der
 * letzten 12 Wochen und letzte Messwerte; „Übernehmen“ legt das Ziel an.
 */
function suggestionList(db, goals, t) {
  const G = D.goalAdvice;
  const mainGoals = G.parseMainGoals(PS.effective(X.S.catalog, X.S.pcsettings, G.MAIN_GOALS_KEY));
  if (!mainGoals.length) return [];
  const since = D.trends.shiftDays(t, -84);
  const log = O.setLog(db);
  const count = new Map();
  for (const e of log) if (!e.isWarmup && e.exerciseCategory === "strength" && e.date >= since) count.set(e.exerciseId, (count.get(e.exerciseId) ?? 0) + 1);
  const topId = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const topLog = topId ? log.filter((e) => e.exerciseId === topId && e.date >= since) : [];
  const best = D.trainingVolume.bestE1RM(topLog);
  const measured = O.measurementsBetween(db, null, "1900-01-01", t);
  const latest = (id) => measured.filter((m) => m.metricId === id).at(-1)?.value ?? null;
  return D.goalSuggestions.goalSuggestions({
    today: t,
    mainGoals,
    latest,
    topExercise: topId && best ? { id: topId, name: topLog[0]?.exerciseName ?? "Übung", e1rm: Math.round(best.value * 10) / 10 } : null,
    existing: goals,
  });
}

function suggestionsHtml(db, goals, t) {
  const list = suggestionList(db, goals, t);
  if (!list.length) return "";
  X.S.tgSuggest = Object.fromEntries(list.map((s) => [s.key, s.input]));
  return `<div class="goal-suggest"><h4>Vorschläge aus deinen Hauptzielen</h4><ul class="plain-list">${list
    .map(
      (s) => `<li class="goal-suggest__row"><span><span class="muted small">${esc(D.goalAdvice.MAIN_GOAL_LABELS[s.mainGoal] ?? "")}</span><br>${esc(s.text)}</span>${
        s.input ? `<button class="btn sm" data-act="tg-adopt" data-arg="${esc(s.key)}">Übernehmen</button>` : ""
      }</li>`,
    )
    .join("")}</ul></div>`;
}

function readTg() {
  const d = { ...(X.S.tgEdit ?? {}) };
  for (const el of document.querySelectorAll("[data-tg]")) d[el.dataset.tg] = el.type === "checkbox" ? el.checked : el.value;
  return d;
}

/** „120; 130,5“ → [120, 130.5]; ungültig → null (wie `parseList` am PC). */
function parseList(text) {
  const parts = String(text ?? "")
    .split(/[;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const values = parts.map(num);
  return values.some((v) => v === null) ? null : values;
}

/** Prüfregeln wie die CHECK-Regeln der Tabelle `goal` (Migration 0063) und das Formular am PC. */
export function validateGoal(d) {
  const e = {};
  const title = String(d.title ?? "").trim();
  if (title.length < 1 || title.length > 120) e.title = "Bitte einen Namen mit 1 bis 120 Zeichen eingeben.";
  if (d.kind === "body_metric" && !d.metricId) e.metricId = "Bitte eine Messgröße wählen.";
  if (d.kind !== "body_metric" && !d.exerciseId) e.exerciseId = "Bitte eine Übung wählen.";
  const target = num(d.targetValue);
  if (target === null || target < 0) e.targetValue = "Bitte einen Zielwert (0 oder mehr) eingeben.";
  const start = String(d.startValue ?? "").trim() === "" ? null : num(d.startValue);
  if (String(d.startValue ?? "").trim() !== "" && (start === null || start < 0)) e.startValue = "Bitte eine Zahl (0 oder mehr) eingeben.";
  if (!validDate(d.startDate)) e.startDate = "Bitte ein Datum wählen.";
  const targetDate = String(d.targetDate ?? "").trim() || null;
  if (targetDate && !validDate(targetDate)) e.targetDate = "Bitte ein gültiges Datum wählen.";
  else if (targetDate && validDate(d.startDate) && targetDate < d.startDate) e.targetDate = "Das Zieldatum liegt vor dem Beginn.";
  const milestones = parseList(d.milestones);
  if (milestones === null) e.milestones = "Zahlen mit Semikolon trennen, z. B. 120; 130.";
  else if (milestones.some((m) => m < 0)) e.milestones = "Zwischenziele dürfen nicht negativ sein.";
  const notes = String(d.notes ?? "").trim();
  if (notes.length > 2000) e.notes = "Höchstens 2.000 Zeichen.";
  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    row: {
      id: d.id,
      title,
      kind: d.kind,
      exercise_id: d.kind === "body_metric" ? null : d.exerciseId,
      metric_id: d.kind === "body_metric" ? d.metricId : null,
      start_date: d.startDate,
      start_value: start,
      target_value: target,
      target_date: targetDate,
      milestones: JSON.stringify(milestones),
      archived: d.archived ? 1 : 0,
      notes: notes || null,
    },
  };
}

async function saveParity() {
  await X.store.set("parity", X.S.parity);
  refreshCatalog();
}

// ------------------------------------------------------------------ Settings → Wochenziele

const setting = (db, key) => db.settings.get(key) ?? null;
const syncNote = `<p class="muted small card-info">Gilt für PC und Handy: geht mit „An den PC senden“ an den PC; dort gewinnt beim Abgleich der neuere Stand.</p>`;

export function weekGoalsCard(db) {
  const S = X.S;
  const Db = D.dashboard;
  const wg = Db.parseWeekGoals(setting(db, Db.WEEK_GOALS_KEY));
  const f = S.wgEdit ?? {
    trainings: wg.trainings === null ? "" : String(wg.trainings),
    cardioMin: wg.cardioMin === null ? "" : String(wg.cardioMin),
    proteinDays: wg.proteinDays === null ? "" : String(wg.proteinDays),
    sleepHours: wg.sleepMin === null ? "" : inputNum(Math.round((wg.sleepMin / 60) * 100) / 100),
  };
  const e = S.wgErr ?? null;
  const field = (key, label, ph, mode = "numeric", u = "") =>
    `<div class="field"><label for="wg-${key}">${esc(label)}${u ? ` <span class="muted small">(${u})</span>` : ""}</label><input id="wg-${key}" data-wg="${key}" inputmode="${mode}" value="${esc(f[key])}" placeholder="${esc(ph)}" ${inv(e, key)}>${errOf(e, key)}</div>`;
  return `<section class="card" id="set-week-goals" ${autoAttrs("wg")}>
    <h3>Wochenziele</h3>
    <p class="muted small card-info">Alle Ziele der Karte „Wochenziele“ in der Overview (Woche ab Montag). Leer lassen = Ziel aus deinem aktuellen Trainingsplan bzw. ${Db.DEFAULT_WEEK_TRAININGS} Einheiten, für Cardio der WHO-Richtwert von ${Db.CARDIO_WEEK_MINUTES} Minuten moderater Ausdauer je Woche, für Protein jeder Tag der Woche und für Schlaf das Schlafziel aus den Tageszielen.</p>
    <div class="grid2">
      ${field("trainings", "Einheiten je Woche", `Plan bzw. ${Db.DEFAULT_WEEK_TRAININGS}`)}
      ${field("cardioMin", "Cardio je Woche", String(Db.CARDIO_WEEK_MINUTES), "numeric", "min")}
      ${field("proteinDays", "Protein-Tage je Woche", "jeder Tag")}
      ${field("sleepHours", "Schlaf: Ø je Nacht", "aus Tageszielen", "decimal", "h")}
    </div>
    ${autoSaveHtml("wg-save")}
    ${syncNote}
  </section>`;
}

// ------------------------------------------------------------------ Settings → Hauptziele

export function mainGoalsCard(db) {
  const G = D.goalAdvice;
  const goals = G.parseMainGoals(setting(db, G.MAIN_GOALS_KEY));
  const consent = G.parseConsent(setting(db, G.AI_CONSENT_KEY));
  // Die Auswertung läuft auch am Handy nur auf dem Gerät – Text sonst wie am PC
  const text = G.CONSENT_TEXT.map((p) => p.replace("nur auf diesem PC", "nur auf dem jeweiligen Gerät (PC oder Handy)"));
  return `<section class="card" id="set-main-goals">
    <h3>Hauptziele</h3>
    <p class="muted small card-info">Wähle, worauf du hinarbeitest. Insights zeigt dazu unter „Empfehlungen zu deinen Hauptzielen“ passende Regeln und Buchstellen aus „iCoach.Me – Die Masterclass“.</p>
    <div class="mg-list" role="group" aria-label="Hauptziele">${G.MAIN_GOALS.map(
      (g) => `<label class="mg-item"><input type="checkbox" data-mg="${esc(g.id)}" ${goals.includes(g.id) ? "checked" : ""}><span><strong>${esc(g.label)}</strong><span class="muted small">${esc(g.hint)}</span></span></label>`,
    ).join("")}</div>
    <h4 class="logs-sub">Einwilligung für Empfehlungen und Bewertungen</h4>
    <details class="mg-consent" ${consent ? "" : "open"}><summary class="muted small">Text der Einwilligung</summary>${text.map((p) => `<p class="small">${esc(p)}</p>`).join("")}</details>
    ${
      consent
        ? `<p class="notice ok small" role="status">Eingewilligt am ${esc(D.formatDate(consent.acceptedAt.slice(0, 10)))} (Version ${esc(consent.version)}).</p><button class="btn block" data-act="mg-revoke">Einwilligung widerrufen</button>`
        : `<button class="btn primary block" data-act="mg-accept">Ich willige ein</button>`
    }
    ${syncNote}
  </section>`;
}

async function putSetting(key, value) {
  const S = X.S;
  S.pcsettings = PS.normSync(S.pcsettings);
  const changed = PS.setSetting(S.pcsettings, key, value, buildDb().settings.get(key) ?? null);
  if (changed) await X.store.set("pcsettings", S.pcsettings);
  return changed;
}

// ------------------------------------------------------------------ Aktionen

export const goalsParityActions = {
  "tg-new": () => {
    X.S.tgEdit = { isNew: true, id: X.uuid(), title: "", kind: "exercise_e1rm", exerciseId: "", metricId: "", startDate: today(), startValue: "", targetValue: "", targetDate: "", milestones: "", archived: false, notes: "" };
    X.S.tgErr = null;
    X.rerender();
  },
  "tg-edit": (el) => {
    const g = goalsOf(buildDb()).find((x) => x.id === el.dataset.arg);
    if (!g) return;
    X.S.tgEdit = {
      isNew: false,
      id: g.id,
      title: g.title,
      kind: g.kind,
      exerciseId: g.exerciseId ?? "",
      metricId: g.metricId ?? "",
      startDate: g.startDate,
      startValue: inputNum(g.startValue),
      targetValue: inputNum(g.targetValue),
      targetDate: g.targetDate ?? "",
      milestones: g.milestones.map(inputNum).join("; "),
      archived: g.archived,
      notes: g.notes ?? "",
      createdAt: g.createdAt,
    };
    X.S.tgErr = null;
    X.rerender();
    document.querySelector(".tg-form")?.scrollIntoView({ block: "start" });
  },
  "tg-cancel": () => {
    X.S.tgEdit = null;
    X.S.tgErr = null;
    X.rerender();
  },
  "tg-archived": () => {
    X.S.tgShowArchived = !X.S.tgShowArchived;
    X.rerender();
  },
  // Vorschlag aus den Hauptzielen übernehmen (1.141.0)
  "tg-adopt": async (el) => {
    const S = X.S;
    const input = S.tgSuggest?.[el.dataset.arg];
    if (!input) return;
    const r = validateGoal({
      id: X.uuid(),
      title: input.title,
      kind: input.kind,
      exerciseId: input.exerciseId ?? "",
      metricId: input.metricId ?? "",
      startDate: input.startDate,
      startValue: input.startValue === null ? "" : String(input.startValue),
      targetValue: String(input.targetValue),
      targetDate: input.targetDate ?? "",
      milestones: (input.milestones ?? []).join("; "),
      archived: false,
      notes: input.notes ?? "",
    });
    if (!r.ok) return X.toast(Object.values(r.errors)[0] ?? "Ziel ungültig", true);
    S.parity = PR.normParity(S.parity);
    PR.putRow(S.parity, "goal", r.row);
    await saveParity();
    X.toast(`Ziel „${input.title}“ angelegt`);
    X.rerender();
  },
  "tg-save": async () => {
    const S = X.S;
    const d = readTg();
    const r = validateGoal(d);
    if (!r.ok) {
      S.tgEdit = d;
      S.tgErr = r.errors;
      return X.rerender();
    }
    S.parity = PR.normParity(S.parity);
    PR.putRow(S.parity, "goal", { ...r.row, ...(d.createdAt ? { created_at: d.createdAt } : {}) });
    await saveParity();
    // Sofort speichern (1.131.0): Formular bleibt offen und bearbeitet das gespeicherte Ziel
    S.tgEdit = S.autosaving ? { ...d, isNew: false } : null;
    S.tgErr = null;
    X.toast("Ziel gespeichert");
    X.rerender();
  },
  "tg-delete": async (el) => {
    const S = X.S;
    if (!S.tgEdit || !X.confirmTwice(el, "Nochmal tippen: löschen")) return;
    S.parity = PR.normParity(S.parity);
    PR.deleteRow(S.parity, "goal", S.tgEdit.id);
    await saveParity();
    S.tgEdit = null;
    X.toast("Ziel gelöscht");
    X.rerender();
  },
  "wg-save": async () => {
    const S = X.S;
    const f = {};
    for (const el of document.querySelectorAll("[data-wg]")) f[el.dataset.wg] = el.value;
    const r = D.dashboard.weekGoalsFromInput(f);
    if (!r.ok) {
      S.wgEdit = f;
      S.wgErr = r.errors;
      X.toast("Bitte die markierten Felder prüfen.", true);
      return X.rerender();
    }
    const empty = Object.values(r.value).every((v) => v === null);
    const changed = await putSetting(D.dashboard.WEEK_GOALS_KEY, empty ? null : JSON.stringify(r.value));
    S.wgEdit = null;
    S.wgErr = null;
    X.toast(changed ? "Wochenziele gespeichert" : "Keine Änderung");
    X.rerender();
  },
  "mg-accept": async () => {
    await putSetting(D.goalAdvice.AI_CONSENT_KEY, D.goalAdvice.serializeConsent(new Date().toISOString()));
    X.toast("Einwilligung gespeichert");
    X.rerender();
  },
  "mg-revoke": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: widerrufen")) return;
    await putSetting(D.goalAdvice.AI_CONSENT_KEY, null);
    X.toast("Einwilligung widerrufen");
    X.rerender();
  },
};

/** Änderungen in Formularen: Art des Ziels wechselt die Auswahl, Hauptziele speichern sofort. */
export function goalsParityChange(el) {
  if (el.dataset?.tg === "kind") {
    X.S.tgEdit = readTg();
    X.rerender();
    return true;
  }
  if (el.dataset?.mg !== undefined) {
    const G = D.goalAdvice;
    const list = [...document.querySelectorAll("[data-mg]")].filter((x) => x.checked).map((x) => x.dataset.mg);
    void putSetting(G.MAIN_GOALS_KEY, G.serializeMainGoals(list)).then((changed) => {
      if (changed) X.toast("Hauptziele gespeichert");
    });
    return true;
  }
  return false;
}
