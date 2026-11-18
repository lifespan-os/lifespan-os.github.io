// LIFESPAN OS Mobil 1.54.0 – Funktionen vom PC (1.0.149–1.0.152):
// - Quick Fill: fehlende Werte (ohne Import) und Schlaf gesammelt nachtragen (Ansicht „quickfill“),
// - Insights: Empfehlungen zu den Hauptzielen, Ziele mit Meilensteinen, Datenqualität mit „Erledigt“,
// - Health: Termine, Nutrition: Wochenplan.
// Gerechnet mit den Regeln aus pcdomain.js (= src/domain); Auswahl, Hauptziele und Einwilligung
// kommen aus den Einstellungen des PCs (Exportdatei). „Erledigt“ und „überspringen“ merkt sich das
// Handy zusätzlich je Gerät (localStorage).

import * as O from "./pcoverview.js";
import * as D from "./pcdomain.js";
import * as B from "./bodydata.js";
import * as L from "./logsdata.js";
import * as GLD from "./glucosedata.js";
import { buildDb, nutritionTabs, today } from "./diary.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go }

export function initExtras(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);
const Q = () => D.quickFill;
const SKIP_KEY = "lifespan.quickfill.skips";
const DQ_KEY = "lifespan.dq.confirmed";

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* privater Modus: nur für diese Sitzung */
  }
}

// ------------------------------------------------------------------ Quick Fill

/** Messgrößen mit letztem Wert (wie `listMetrics` am PC). */
function metricsWithLatest(db, measurements) {
  const last = new Map();
  for (const m of measurements) {
    const cur = last.get(m.metricId);
    if (!cur || m.date > cur.date) last.set(m.metricId, m);
  }
  return (X.S.catalog?.body?.metrics ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit ?? "",
    decimals: m.decimals ?? 1,
    minValue: m.min_value ?? 0,
    maxValue: m.max_value ?? 1e9,
    category: m.category,
    archived: !!m.archived,
    latestValue: last.get(m.id)?.value ?? null,
    latestDate: last.get(m.id)?.date ?? null,
  }));
}

/** Fehlende Werte wie am PC (Auswahl aus den PC-Einstellungen, Überspringen PC + Handy). */
export function missingAll(db = buildDb()) {
  if (!X.S.catalog?.body) return { values: [], sleep: [], sleepRows: [] };
  const t = today();
  const measurements = O.measurementsBetween(db, null, D.trends.shiftDays(t, -400), t);
  const metrics = metricsWithLatest(db, measurements);
  const raw = db.settings.get(Q().QUICK_FILL_KEY) ?? null;
  const skips = [...Q().parseSkips(db.settings.get(Q().QUICK_FILL_SKIP_KEY) ?? null), ...Q().parseSkips(JSON.stringify(readLocal(SKIP_KEY)))];
  const rules = Q().effectiveRules(Q().parseFillRules(raw), metrics);
  const values = Q().missingValues({ metrics, measurements: measurements.filter((m) => m.date >= D.trends.shiftDays(t, -31)), rules, skips, today: t });
  const from = D.trends.shiftDays(t, -1);
  const sleepRows = (db.sleep ?? []).filter((r) => r.date >= from && r.date <= t);
  const sleep = Q().missingSleep({
    sleep: sleepRows.map((r) => ({ id: r.id, date: r.date, quality: r.quality ?? null, sleepLatencyMin: r.sleep_latency_min ?? null, awakenings: r.awakenings ?? null, awakeMin: r.awake_min ?? null })),
    rule: Q().parseSleepRule(raw),
    skips,
    today: t,
  });
  return { values, sleep, sleepRows };
}

export function missingCount() {
  try {
    const m = missingAll();
    return m.values.length + m.sleep.length;
  } catch {
    return 0;
  }
}

/** Hinweis oben in der Overview, wenn Werte fehlen. */
export function quickFillBanner() {
  const n = missingCount();
  if (!n) return "";
  return `<section class="card qf-banner"><div><strong>${n} ${n === 1 ? "Wert fehlt" : "Werte fehlen"}</strong>
    <span class="muted small">Werte ohne Import und Schlaf der letzten Nacht – Auswahl am PC unter Settings → Quick Fill.</span></div>
    <button class="btn sm primary" data-go="quickfill">Nachtragen</button></section>`;
}

const sleepKey = (m) => (m.kind === "night" ? `sleep|night|${m.date}` : `sleep|${m.field}|${m.date}`);
const valueKey = (m) => `${m.metricId}|${m.date}`;

export function viewQuickFill() {
  const S = X.S;
  const f = (S.qf ??= { inputs: {}, errors: {} });
  const { values, sleep } = missingAll();
  const input = (key, attrs = "") =>
    `<input class="qf-input" data-qf="${esc(key)}" value="${esc(f.inputs[key] ?? "")}" ${attrs} autocomplete="off">`;
  const err = (key) => (f.errors[key] ? `<p class="err small">${esc(f.errors[key])}</p>` : "");
  const groups = new Map();
  for (const m of values) {
    const title = m.reason === "gap" ? `Fehlt in der Messung vom ${D.formatDate(m.date)}` : m.date === today() ? "Heute fällig" : `Fällig am ${D.formatDate(m.date)}`;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(m);
  }
  const sleepHtml = sleep.length
    ? `<section class="card"><div class="wo-head"><h3>Schlaf der Nacht auf ${esc(D.formatDate(sleep[0].date))}</h3><button class="linkbtn" data-act="qf-skip-sleep">überspringen</button></div>
      ${sleep
        .map((m) => {
          const k = sleepKey(m);
          if (m.kind === "night") {
            return `<div class="qf-row"><div><strong>Nacht fehlt</strong><span class="muted small">Zubettgehen und Aufstehen, z. B. 23:15 und 06:45</span></div>
              <div class="qf-times">${input(`${k}|bed`, 'inputmode="numeric" placeholder="Zubett" aria-label="Zubettgehen"')}${input(`${k}|wake`, 'inputmode="numeric" placeholder="Auf" aria-label="Aufstehen"')}</div>${err(k)}</div>`;
          }
          const def = Q().SLEEP_FILL_FIELDS.find((x) => x.key === m.field);
          return `<div class="qf-row"><div><strong>${esc(def.label)}</strong><span class="muted small">fehlt im Eintrag dieser Nacht</span></div>
            <div class="qf-value">${input(k, 'inputmode="numeric"')}<span class="muted small">${esc(def.unit)}</span></div>${err(k)}</div>`;
        })
        .join("")}</section>`
    : "";
  const valuesHtml = [...groups.entries()]
    .map(
      ([title, list]) => `<section class="card"><div class="wo-head"><h3>${esc(title)}</h3><button class="linkbtn" data-act="qf-skip-group" data-arg="${esc(list.map(valueKey).join(","))}">alle überspringen</button></div>
      ${list
        .map(
          (m) => `<div class="qf-row"><div><strong>${esc(m.name)}</strong><span class="muted small">${
            m.lastDate ? `zuletzt ${esc(F(m.lastValue ?? 0, m.decimals))} ${esc(m.unit)} am ${esc(D.formatDate(m.lastDate))}` : "noch kein Wert"
          }${m.reason === "due" ? ` · ${esc(Q().RHYTHM_LABELS[m.rhythm])}` : ""}</span></div>
          <div class="qf-value">${input(valueKey(m), 'inputmode="decimal"')}<span class="muted small">${esc(m.unit)}</span></div>${err(valueKey(m))}</div>`,
        )
        .join("")}</section>`,
    )
    .join("");
  const empty = !values.length && !sleep.length;
  return `${X.header("Werte nachtragen", { back: "home" })}<main class="wrap">
    <p class="muted small">Werte, die kein Import liefert – aus der letzten Messung, nach ihrem Rhythmus fällig oder aus der letzten Nacht. Leere Felder bleiben offen. Die Auswahl stellst du am PC unter Settings → Quick Fill ein.</p>
    ${empty ? `<section class="card"><p class="ok-note">Alles erfasst – es fehlt gerade kein Wert.</p></section>` : `${sleepHtml}${valuesHtml}`}
  </main>
  ${empty ? "" : `<div class="bottom"><div class="inner"><button class="btn primary" data-act="qf-save">Speichern</button></div></div>`}`;
}

/** Eingabe im Quick-Fill-Formular (ohne neu zu zeichnen). */
export function quickFillInput(el) {
  if (!el.dataset.qf) return false;
  const f = (X.S.qf ??= { inputs: {}, errors: {} });
  f.inputs[el.dataset.qf] = el.value;
  return true;
}

function skip(values, sleep) {
  const t = today();
  const list = [
    ...readLocal(SKIP_KEY),
    ...values.map((m) => ({ k: m.reason, m: m.metricId, d: m.reason === "gap" ? m.date : t })),
    ...sleep.map((m) => ({ k: "gap", m: Q().sleepSkipId(m), d: m.date })),
  ];
  writeLocal(SKIP_KEY, JSON.parse(Q().serializeSkips(Q().parseSkips(JSON.stringify(list)), t)));
  X.toast(values.length + sleep.length === 1 ? "Übersprungen." : `${values.length + sleep.length} Werte übersprungen.`);
  X.rerender();
}

function sleepDraftOf(r) {
  const s = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    id: r.id,
    date: r.date,
    bedTime: r.bed_time,
    wakeTime: r.wake_time,
    sleepLatencyMin: s(r.sleep_latency_min),
    awakeMin: s(r.awake_min),
    awakenings: s(r.awakenings),
    quality: s(r.quality),
    notes: r.notes ?? "",
    efficiencyPct: s(r.efficiency_pct),
    lightMin: s(r.light_min),
    deepMin: s(r.deep_min),
    remMin: s(r.rem_min),
    method: r.method ?? "",
  };
}

export const extrasActions = {
  "qf-skip-group": (el) => {
    const keys = new Set(String(el.dataset.arg).split(","));
    skip(missingAll().values.filter((m) => keys.has(valueKey(m))), []);
  },
  "qf-skip-sleep": () => skip([], missingAll().sleep),
  "qf-save": async () => {
    const S = X.S;
    const f = (S.qf ??= { inputs: {}, errors: {} });
    const db = buildDb();
    const { values, sleep, sleepRows } = missingAll(db);
    const errors = {};
    const bodyItems = [];
    for (const m of values) {
      const v = Q().parseFillInput(f.inputs[valueKey(m)] ?? "");
      const e = Q().fillInputError(v, m);
      if (e) errors[valueKey(m)] = e === "Bitte eine Zahl eingeben." ? e : `Erlaubt: ${F(m.minValue, m.decimals)}–${F(m.maxValue, m.decimals)} ${m.unit}`;
      else if (v !== null) bodyItems.push({ m, v });
    }
    const nights = [];
    const patches = new Map();
    for (const m of sleep) {
      const k = sleepKey(m);
      if (m.kind === "night") {
        const bed = Q().parseClock(f.inputs[`${k}|bed`] ?? "");
        const wake = Q().parseClock(f.inputs[`${k}|wake`] ?? "");
        if (bed === null && wake === null) continue;
        if (!bed || !wake) {
          errors[k] = "Bitte Zubettgehen und Aufstehen als Uhrzeit eingeben, z. B. 23:15.";
          continue;
        }
        nights.push({ id: null, date: m.date, bedTime: bed, wakeTime: wake, sleepLatencyMin: "", awakeMin: "", awakenings: "", quality: "", notes: "", efficiencyPct: "", lightMin: "", deepMin: "", remMin: "", method: "" });
        continue;
      }
      const v = Q().parseFillInput(f.inputs[k] ?? "");
      const e = Q().sleepInputError(v, m.field);
      if (e) {
        errors[k] = e;
        continue;
      }
      if (v === null) continue;
      const row = sleepRows.find((r) => r.id === m.logId);
      if (!row) continue;
      const draft = patches.get(row.id) ?? sleepDraftOf(row);
      draft[m.field] = String(v);
      patches.set(row.id, draft);
    }
    f.errors = errors;
    if (Object.keys(errors).length) {
      X.rerender();
      return X.toast("Bitte die markierten Felder prüfen.", true);
    }
    const total = bodyItems.length + nights.length + patches.size;
    if (!total) return X.toast("Noch kein Wert eingetragen.", true);
    try {
      for (const { m, v } of bodyItems) {
        B.saveValue(S.catalog, S.body.local, { metricId: m.metricId, date: m.date, time: "", value: v, method: "", notes: "", editId: null }, { uuid: X.uuid, now: new Date() });
      }
      for (const draft of [...nights, ...patches.values()]) {
        const res = L.saveSleep(db, S.logs, draft, { uuid: X.uuid, now: new Date() });
        if (res.errors) throw new Error(Object.values(res.errors)[0]);
      }
      if (bodyItems.length) await X.store.set("body", S.body.local);
      if (nights.length || patches.size) await X.store.set("logs", S.logs);
    } catch (e) {
      X.rerender();
      return X.toast(e.message, true);
    }
    S.qf = { inputs: {}, errors: {} };
    X.toast(total === 1 ? "1 Wert gespeichert – mit „An den PC senden“ übertragen." : `${total} Werte gespeichert – mit „An den PC senden“ übertragen.`);
    X.rerender();
  },
  "dq-ok": (el) => confirmDq(String(el.dataset.arg).split("\u0001")),
  "dq-reset": () => {
    writeLocal(DQ_KEY, []);
    X.toast("Bestätigungen auf diesem Handy zurückgesetzt.");
    X.rerender();
  },
};

// ------------------------------------------------------------------ Insights: Empfehlungen

export function goalAdviceCard(db, card, t = today()) {
  const G = D.goalAdvice;
  const goals = G.parseMainGoals(db.settings.get(G.MAIN_GOALS_KEY) ?? null);
  const consent = G.parseConsent(db.settings.get(G.AI_CONSENT_KEY) ?? null);
  const title = "Empfehlungen zu deinen Hauptzielen";
  const link = (s) =>
    `<button class="linkbtn small" data-act="icoach-ask" data-arg="${esc(`masterclass|${s.question}`)}">Masterclass: „${esc(s.title)}“ · ${esc(D.describePages ? D.describePages(s.pages) : `S. ${s.pages.join(", ")}`)}</button>`;
  if (!goals.length) {
    return card("goal-advice", title, "", `<p class="muted">Noch keine Hauptziele gewählt – am PC unter Settings → Hauptziele (z. B. Fettabbau, Muskelaufbau).</p>`, { wide: true });
  }
  const labels = goals.map((g) => G.MAIN_GOAL_LABELS[g]).join(", ");
  if (!consent) {
    return card(
      "goal-advice",
      title,
      labels,
      `<p class="muted small">Empfehlungen und Bewertungen deiner Werte gibt es erst mit Einwilligung am PC unter Settings → Hauptziele. Bis dahin die passenden Stellen aus der Masterclass:</p>
      ${G.goalReading(goals)
        .map((r) => `<h4 class="logs-sub">${esc(G.MAIN_GOAL_LABELS[r.goal])}</h4><ul class="plain-list">${r.sources.map((s) => `<li>${link(s)}</li>`).join("")}</ul>`)
        .join("")}`,
      { wide: true },
    );
  }
  const data = O.insightsFor(db, D.trends.shiftDays(t, -(G.ADVICE_DAYS - 1)), t);
  const advice = G.goalAdvice({
    goals,
    to: t,
    nutrition: data.nutrition,
    energy: data.energy ?? [],
    sleep: data.sleep,
    measurements: data.measurements,
    neat: data.neat ?? [],
    setLog: O.setLog(db),
  });
  const LABEL = { act: "Handlungsbedarf", info: "Hinweis", ok: "im Rahmen", nodata: "zu wenige Werte" };
  const act = advice.filter((a) => a.status === "act").length;
  return card(
    "goal-advice",
    title,
    `${D.formatDate(D.trends.shiftDays(t, -(G.ADVICE_DAYS - 1)))} – ${D.formatDate(t)}`,
    `<p class="muted small">Ziele: ${esc(labels)}. ${act ? `${act}× Handlungsbedarf.` : "Kein Handlungsbedarf erkannt."}</p>
    <div class="advice-list">${advice
      .map(
        (a) => `<div class="advice advice--${a.status}"><div class="advice__head"><strong>${esc(a.title)}</strong><span class="advice__status">${LABEL[a.status]}</span></div>
        <p>${esc(a.text)}</p><p class="muted small">Deine Werte: ${esc(a.basis)}</p>${link(a.source)}</div>`,
      )
      .join("")}</div>
    <p class="card__note">Feste Regeln mit Grenzwerten aus „iCoach.Me – Die Masterclass“, gerechnet aus deinen Werten der letzten ${G.ADVICE_DAYS} Tage (mind. 4 Tage je Regel), wie am PC. Ersetzt keine ärztliche Beratung. Einwilligung vom ${esc(D.formatDate(consent.acceptedAt.slice(0, 10)))}.</p>`,
    { wide: true },
  );
}

// ------------------------------------------------------------------ Insights: Ziele

function goalRows(db) {
  return (db.pc.goal ?? [])
    .filter((g) => !g.archived)
    .map((g) => {
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
        milestones,
      };
    });
}

export function targetGoalsCard(db, card, t = today()) {
  const goals = goalRows(db);
  if (!goals.length) return card("goals", "Ziele", "", `<p class="muted">Noch keine Ziele. Ziele legst du am PC unter Insights → Ziele an (z. B. „Kniebeuge 140 kg“).</p>`, { wide: true });
  const T = D.targetGoals;
  const log = O.setLog(db);
  const measurements = O.measurementsBetween(db, null, "1900-01-01", t);
  const metrics = new Map((X.S.catalog?.body?.metrics ?? []).map((m) => [m.id, m]));
  return card(
    "goals",
    "Ziele",
    `${goals.length}`,
    goals
      .map((g) => {
        const series = g.kind === "body_metric" ? T.metricSeries(measurements, g.metricId) : T.exerciseSeries(log, g.exerciseId, g.kind);
        const unit = g.kind === "body_metric" ? metrics.get(g.metricId)?.unit ?? "" : "kg";
        const dec = g.kind === "body_metric" ? metrics.get(g.metricId)?.decimals ?? 1 : 1;
        const p = T.goalProgress(g, series, t, dec);
        const pct = p.share === null ? null : Math.round(p.share * 100);
        const cur = p.current ? `${F(p.current.value, dec)} ${unit}` : "–";
        return `<div class="goal-row"><div class="goal-row__head"><strong>${esc(g.title)}</strong><span class="muted small">${pct === null ? "noch kein Wert" : `${pct} %`}</span></div>
          <div class="goal-bar"><span class="goal-bar__fill" style="width:${pct ?? 0}%;background:var(--orange)"></span></div>
          <p class="muted small">Aktuell ${esc(cur)} · Ziel ${esc(F(g.targetValue, dec))} ${esc(unit)}${p.reachedOn ? ` · erreicht am ${esc(D.formatDate(p.reachedOn))}` : ""}${p.perWeekNeeded ? ` · nötig ${esc(F(p.perWeekNeeded, 2))} ${esc(unit)} pro Woche` : ""}${g.targetDate ? ` · bis ${esc(D.formatDate(g.targetDate))}` : ""}</p></div>`;
      })
      .join(""),
    { wide: true },
  );
}

// ------------------------------------------------------------------ Insights: Datenqualität

function confirmedKeys(db) {
  return [...D.dataQuality.parseConfirmed(db.settings.get(D.dataQuality.DQ_CONFIRMED_KEY) ?? null), ...readLocal(DQ_KEY)];
}

function confirmDq(keys) {
  writeLocal(DQ_KEY, D.dataQuality.addConfirmed(readLocal(DQ_KEY), keys));
  X.toast(keys.length === 1 ? "Als erledigt bestätigt." : `${keys.length} Hinweise als erledigt bestätigt.`);
  X.rerender();
}

export function dataQualityCard(db, card, t = today()) {
  const Qd = D.dataQuality;
  const from = D.trends.shiftDays(t, -29);
  const data = O.insightsFor(db, from, t);
  const categories = new Map((db.pc.body_metric ?? []).map((m) => [m.id, m.category]));
  const all = Qd.dataQuality({
    from,
    to: t,
    gapTo: D.trends.shiftDays(t, -1),
    setLog: O.setLog(db),
    workouts: data.workouts,
    measurements: O.measurementsBetween(db, null, D.trends.shiftDays(from, -60), t),
    categoryOf: (id) => categories.get(id),
    hrt: null,
    sleep: data.sleep,
    nutrition: data.nutrition,
    neat: data.neat ?? [],
    glucose: GLD.allReadings(X.S.catalog, X.S.glucose).filter((g) => g.measuredAt.slice(0, 10) >= from),
  });
  const confirmed = confirmedKeys(db);
  const open = Qd.withoutConfirmed(all, confirmed);
  const hidden = all.length - open.length;
  const shown = open.slice(0, 30);
  return card(
    "data-quality",
    "Datenqualität",
    `${open.length} offen`,
    `${
      open.length
        ? `<ul class="plain-list insight-list">${shown
            .map((i) => `<li><span class="tag">${esc(Qd.QUALITY_KIND_LABELS[i.kind])}</span> <strong>${esc(i.area)}:</strong> ${esc(i.text)} <button class="linkbtn small" data-act="dq-ok" data-arg="${esc(i.key)}">Erledigt</button></li>`)
            .join("")}</ul>
          ${open.length > 1 ? `<button class="linkbtn small" data-act="dq-ok" data-arg="${esc(open.map((i) => i.key).join("\u0001"))}">Alle ${open.length} als erledigt bestätigen</button>` : ""}
          ${open.length > shown.length ? `<p class="muted small">… und ${open.length - shown.length} weitere.</p>` : ""}`
        : `<p class="muted">Keine offenen Lücken, Ausreißer oder Doppelten seit ${esc(D.formatDate(from))}.</p>`
    }
    ${hidden ? `<p class="muted small">${hidden} als erledigt bestätigt und ausgeblendet. <button class="linkbtn small" data-act="dq-reset">Bestätigungen dieses Handys zurücksetzen</button></p>` : ""}
    <p class="card__note">Letzte 30 Tage, Regeln wie am PC (Insights → Datenqualität). Gibt es keine Daten (z. B. Uhr nicht getragen), „Erledigt“ tippen – der Hinweis bleibt dann auf diesem Handy ausgeblendet; am PC bestätigte Hinweise sind hier ebenfalls ausgeblendet.</p>`,
    { wide: true },
  );
}

// ------------------------------------------------------------------ Health: Termine

export function appointmentsHtml(db, t = today()) {
  const A = D.appointments;
  const list = (db.pc.appointment ?? [])
    .filter((a) => !a.done && a.date >= t)
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  if (!list.length) return `<p class="muted">Keine anstehenden Termine. Termine legst du am PC unter Health → Termine an.</p>`;
  return `<ul class="plain-list appt-list">${list
    .map((a) => {
      const detail = A.appointmentDetail({ kind: a.kind, location: a.location ?? null, fasting: !!a.fasting });
      return `<li><strong>${esc(a.title)}</strong> <span class="tag">${esc(A.whenText(a.date, t))}</span><br>
        <span class="muted small">${esc(D.formatDate(a.date))}${a.time ? ` · ${esc(a.time)} Uhr` : ""}${detail ? ` · ${esc(detail)}` : ""}</span>${a.notes ? `<p class="small">${esc(a.notes)}</p>` : ""}</li>`;
    })
    .join("")}</ul>`;
}

// ------------------------------------------------------------------ Nutrition: Wochenplan

export function mealPlanHtml(db, t = today()) {
  const week = D.trends.weekStart(t);
  const days = Array.from({ length: 7 }, (_, i) => D.trends.shiftDays(week, i));
  const recipes = new Map((X.S.catalog?.pc?.recipe ?? db.pc.recipe ?? []).map((r) => [r.id, r]));
  const entries = (db.pc.meal_plan_entry ?? []).filter((e) => e.date >= days[0] && e.date <= days[6]);
  if (!entries.length) return `<p class="muted">Für diese Woche ist nichts geplant. Den Wochenplan legst du am PC unter Nutrition → Planen an.</p>`;
  const slotIndex = (s) => {
    const i = D.PLAN_SLOTS.indexOf(s);
    return i < 0 ? 99 : i;
  };
  return days
    .map((d) => {
      const own = entries.filter((e) => e.date === d).sort((a, b) => slotIndex(a.slot) - slotIndex(b.slot));
      if (!own.length) return "";
      const wd = new Date(`${d}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short" });
      return `<h4 class="logs-sub${d === t ? " is-today" : ""}">${esc(wd)} ${esc(D.formatDate(d))}</h4><ul class="plain-list">${own
        .map((e) => `<li><span class="muted small">${esc(e.slot)}</span> ${esc(recipes.get(e.recipe_id)?.name ?? "Rezept")} · ${esc(F(e.servings, e.servings % 1 ? 1 : 0))} ${e.servings === 1 ? "Portion" : "Portionen"}</li>`)
        .join("")}</ul>`;
    })
    .join("");
}

/** Nutrition → Planen (1.54.0): Wochenplan vom PC, nur Ansicht. */
export function viewMealPlan() {
  const db = buildDb();
  return `${X.header("Nutrition")}<main class="wrap">${nutritionTabs("meal-plan")}
    <section class="card"><h3>Wochenplan</h3><p class="muted small">${esc(D.trends.formatRange(D.trends.weekStart(today()), D.trends.shiftDays(D.trends.weekStart(today()), 6)))}</p>
    ${mealPlanHtml(db)}
    <p class="card__note">Geplante Gerichte aus Vorlagen und Rezepten vom PC. Planen, kopieren und die Einkaufsliste gibt es am PC unter Nutrition → Planen.</p></section></main>`;
}
