// LIFESPAN OS Mobil 1.54.0 – Funktionen vom PC (1.0.149–1.0.152):
// - Quick Fill: fehlende Werte (ohne Import), Schlaf und seit 1.56.0 die Griffkraft gesammelt
//   nachtragen (Ansicht „quickfill“),
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
import { autoAttrs, autoSaveHtml } from "./autosave.js";

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
  if (!X.S.catalog?.body) return { values: [], sleep: [], sleepRows: [], grip: null };
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
  // Griffkraft (1.56.0): nach Rhythmus aus Settings → Quick Fill am PC
  const grip = Q().missingGrip({
    grip: (db.grip ?? []).map((g) => ({ date: g.date, leftKg: g.left_kg, rightKg: g.right_kg })),
    rule: Q().parseGripRule(raw),
    skips,
    today: t,
  });
  return { values, sleep, sleepRows, grip };
}

export function missingCount() {
  try {
    const m = missingAll();
    return m.values.length + m.sleep.length + (m.grip ? 1 : 0);
  } catch {
    return 0;
  }
}

/** Uhrzeit der Griffkraft: heute „jetzt“, sonst leer (1.126.0). */
function gripTimeDefault(grip) {
  if (grip?.date !== today()) return "";
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Übliches 90-Minuten-Messfenster aus den bisherigen Messungen (wie PC). */
function gripWindow() {
  try {
    const db = buildDb();
    return D.gripTiming.usualGripWindow(D.gripTiming.recentGripTimes(db.grip ?? [], today()));
  } catch {
    return null;
  }
}

/** Hinweis oben in der Overview, wenn Werte fehlen. */
export function quickFillBanner() {
  const n = missingCount();
  if (!n) return "";
  return `<section class="card qf-banner"><div><strong>${n} ${n === 1 ? "Wert fehlt" : "Werte fehlen"}</strong>
    <span class="muted small">Werte ohne Import, Schlaf der letzten Nacht und Griffkraft – Auswahl am PC unter Settings → Quick Fill.</span></div>
    <button class="btn sm primary" data-go="quickfill">Nachtragen</button></section>`;
}

const sleepKey = (m) => (m.kind === "night" ? `sleep|night|${m.date}` : `sleep|${m.field}|${m.date}`);
const valueKey = (m) => `${m.metricId}|${m.date}`;

export function viewQuickFill() {
  const S = X.S;
  const f = (S.qf ??= { inputs: {}, errors: {} });
  const { values, sleep, grip } = missingAll();
  const input = (key, attrs = "") =>
    `<input class="qf-input" id="qf-${esc(key.replace(/[^a-z0-9]/gi, "-"))}" data-qf="${esc(key)}" value="${esc(f.inputs[key] ?? "")}" ${attrs} autocomplete="off">`;
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
            return `<div class="qf-row qf-row--night"><div><strong>Nacht fehlt</strong><span class="muted small">Zubettgehen und Aufstehen, z. B. 23:15 und 06:45</span></div>
              <div class="qf-times">${input(`${k}|bed`, 'inputmode="numeric" placeholder="Zubettgehen" aria-label="Zubettgehen"')}${input(`${k}|wake`, 'inputmode="numeric" placeholder="Aufstehen" aria-label="Aufstehen"')}</div>${err(k)}</div>`;
          }
          const def = Q().SLEEP_FILL_FIELDS.find((x) => x.key === m.field);
          return `<div class="qf-row"><div class="qf-head"><strong class="qf-name">${esc(def.label)}</strong></div>
            <div class="qf-info muted small"><span>fehlt im Eintrag dieser Nacht</span></div>
            <div class="qf-value">${input(k, 'inputmode="numeric"')}<span class="qf-unit muted small">${esc(def.unit)}</span></div>${err(k)}</div>`;
        })
        .join("")}</section>`
    : "";
  const gripHtml = grip
    ? `<section class="card"><div class="wo-head"><h3>Griffkraft · ${esc(Q().RHYTHM_LABELS[grip.rhythm])}</h3><button class="linkbtn" data-act="qf-skip-grip">überspringen</button></div>
      <div class="qf-grip">
        <p class="qf-grip__last muted small">${
          grip.lastDate ? `Zuletzt: links ${esc(F(grip.lastLeftKg ?? 0, 1))} kg, rechts ${esc(F(grip.lastRightKg ?? 0, 1))} kg am ${esc(D.formatDate(grip.lastDate))}` : "Noch keine Messung"
        }</p>
        <div class="qf-grip__fields">
          <div class="field"><label for="qf-grip-left">Links <span class="muted">(kg)</span></label>${input("grip|left", 'inputmode="decimal" aria-label="Griffkraft links in kg"')}</div>
          <div class="field"><label for="qf-grip-right">Rechts <span class="muted">(kg)</span></label>${input("grip|right", 'inputmode="decimal" aria-label="Griffkraft rechts in kg"')}</div>
          <div class="field qf-grip__time"><label for="qf-grip-time">Uhrzeit</label><input id="qf-grip-time" class="qf-input" type="time" data-qf="grip|time" value="${esc(f.inputs["grip|time"] ?? gripTimeDefault(grip))}"></div>
        </div>
        <p class="muted small">${esc(D.gripTiming.gripWindowText(gripWindow()))}</p>${err("grip")}
      </div></section>`
    : "";
  const valuesHtml = [...groups.entries()]
    .map(
      ([title, list]) => `<section class="card"><div class="wo-head"><h3>${esc(title)}</h3><span class="qf-head-actions">${
        title === "Heute fällig"
          ? `<label class="btn sm ${f.reading ? "is-busy" : ""}">${f.reading ? "Liest …" : "Upload"}<input type="file" accept="image/*,application/pdf,.pdf" data-qf-upload="${esc(list.map(valueKey).join(","))}" data-autosave-skip hidden ${f.reading ? "disabled" : ""}></label>`
          : ""
      }<button class="linkbtn" data-act="qf-skip-group" data-arg="${esc(list.map(valueKey).join(","))}">alle überspringen</button></span></div>
      ${title === "Heute fällig" && (f.upload || f.reading) ? `<p class="${f.upload?.tone === "error" ? "warn" : "muted"} small" id="qf-upload-status" role="status">${esc(f.reading ? f.readStatus ?? "Datei wird gelesen …" : f.upload.text)}</p>` : ""}
      ${list
        .map(
          // Aufbau je Zeile (1.186.0): Name über die ganze Breite (rechts der Rhythmus), darunter links „zuletzt …“
          // in zwei kurzen Zeilen, rechts Eingabefeld und Einheit – in jeder Zeile an derselben Stelle.
          (m) => `<div class="qf-row"><div class="qf-head"><strong class="qf-name">${esc(m.name)}</strong>${
            m.reason === "due" ? `<span class="qf-rhythm muted small">${esc(Q().RHYTHM_LABELS[m.rhythm])}</span>` : ""
          }</div>
          <div class="qf-info muted small">${
            m.lastDate ? `<span>zuletzt ${esc(F(m.lastValue ?? 0, m.decimals))} ${esc(m.unit)}</span><span>am ${esc(D.formatDate(m.lastDate))}</span>` : "<span>noch kein Wert</span>"
          }</div>
          <div class="qf-value">${input(valueKey(m), 'inputmode="decimal"')}<span class="qf-unit muted small">${esc(m.unit)}</span></div>${err(valueKey(m))}</div>`,
        )
        .join("")}</section>`,
    )
    .join("");
  const extraHtml = f.extra?.length
    ? `<section class="card"><div class="wo-head"><h3>Weitere Werte aus der Datei · ${esc(D.formatDate(today()))}</h3><button class="linkbtn" data-act="qf-extra-drop">verwerfen</button></div>
      ${f.extra
        .map(
          (x, i) => `<div class="qf-row"><div class="qf-head"><strong class="qf-name">${esc(x.name)}</strong>
          <label class="qf-use"><input type="checkbox" data-qf-extra-use="${i}" ${x.use ? "checked" : ""}> speichern</label></div>
          <div class="qf-info muted small">${x.note ? `<span>${esc(x.note)}</span>` : ""}</div>
          <div class="qf-value"><input class="qf-input" data-qf-extra="${i}" value="${esc(x.text)}" inputmode="decimal" autocomplete="off" ${x.use ? "" : "disabled"}><span class="qf-unit muted small">${esc(x.unit)}</span></div>${err(`extra|${x.metricId}`)}</div>`,
        )
        .join("")}</section>`
    : "";
  const empty = !values.length && !sleep.length && !grip;
  return `${X.header("Werte nachtragen", { back: "home", intro: QF_INTRO })}<main class="wrap" ${autoAttrs("qf")}>
    ${empty ? `<section class="card"><p class="ok-note">Alles erfasst – es fehlt gerade kein Wert.</p></section>` : `${sleepHtml}${gripHtml}${valuesHtml}${extraHtml}${autoSaveHtml("qf-save", { note: "Jeder Wert wird beim Verlassen des Feldes gespeichert; Schlaf und Griffkraft, sobald beide Felder ausgefüllt sind." })}`}
  </main>`;
}

/**
 * Upload (1.94.0, wie am PC): Foto oder PDF der Waagen-Auswertung lesen (wie „Aus Bild übernehmen“)
 * und die erkannten Werte in die Felder der heute fälligen Messgrößen eintragen. Gespeichert wird
 * erst mit „Speichern“, nach Prüfung.
 */
export async function quickFillUpload(el) {
  if (el.dataset?.qfUpload === undefined || el.type !== "file") return false;
  const file = el.files?.[0];
  if (!file) return true;
  const f = (X.S.qf ??= { inputs: {}, errors: {} });
  const keys = new Set(String(el.dataset.qfUpload).split(","));
  const list = missingAll().values.filter((m) => keys.has(valueKey(m)));
  f.reading = true;
  f.readStatus = "Datei wird gelesen …";
  f.upload = null;
  X.rerender();
  try {
    const { readScaleFile } = await import("./body.js");
    // Seit 1.106.0 gegen alle Messgrößen lesen (wie Body → „PDF einfügen“): fällige Werte in ihre
    // Felder, alle weiteren darunter zum Prüfen
    const bounds = (X.S.catalog?.body?.metrics ?? []).map((m) => ({ id: m.id, name: m.name, unit: m.unit ?? "", minValue: m.min_value ?? null, maxValue: m.max_value ?? null, decimals: m.decimals ?? 1 }));
    const vals = await readScaleFile(file, bounds, (text) => {
      f.readStatus = text;
      const s = document.getElementById("qf-upload-status");
      if (s) s.textContent = text;
    });
    let n = 0;
    const check = [];
    const more = [];
    for (const v of vals) {
      if (!v.metric || v.value === null) continue;
      const m = list.find((x) => x.metricId === v.metric.id);
      if (!m) {
        if (!more.some((x) => x.metricId === v.metric.id))
          more.push({ metricId: v.metric.id, name: v.metric.name, unit: v.metric.unit, decimals: v.metric.decimals, minValue: v.metric.minValue, maxValue: v.metric.maxValue, text: String(Math.round(v.value * 10 ** v.metric.decimals) / 10 ** v.metric.decimals).replace(".", ","), use: !!v.ok, note: v.note ?? null });
        continue;
      }
      f.inputs[valueKey(m)] = String(Math.round(v.value * 10 ** m.decimals) / 10 ** m.decimals).replace(".", ",");
      n++;
      if (!v.ok) check.push(v.note ? `${m.name} (${v.note})` : m.name);
    }
    f.extra = more;
    const parts = [];
    if (n) parts.push(`${n} ${n === 1 ? "Wert" : "Werte"} in die Felder eingetragen`);
    if (more.length) parts.push(`${more.length} ${more.length === 1 ? "weiterer Wert" : "weitere Werte"} unten`);
    f.upload = parts.length
      ? { tone: "ok", text: `${parts.join(", ")} – bitte prüfen und speichern.${check.length ? ` Besonders prüfen: ${check.join(", ")}.` : ""}` }
      : { tone: "error", text: "In der Datei wurden keine Werte erkannt." };
  } catch (e) {
    f.upload = { tone: "error", text: e?.message || "Die Datei lässt sich nicht lesen." };
  } finally {
    f.reading = false;
    X.rerender();
  }
  return true;
}

/** Eingabe im Quick-Fill-Formular (ohne neu zu zeichnen). */
export function quickFillInput(el) {
  const f0 = (X.S.qf ??= { inputs: {}, errors: {} });
  if (el.dataset.qfExtra !== undefined) {
    const x = f0.extra?.[Number(el.dataset.qfExtra)];
    if (x) x.text = el.value;
    return true;
  }
  if (el.dataset.qfExtraUse !== undefined) {
    const x = f0.extra?.[Number(el.dataset.qfExtraUse)];
    if (x) x.use = el.checked;
    X.rerender();
    return true;
  }
  if (!el.dataset.qf) return false;
  const f = f0;
  f.inputs[el.dataset.qf] = el.value;
  return true;
}

function skip(values, sleep, grip = false) {
  const t = today();
  const list = [
    ...readLocal(SKIP_KEY),
    ...values.map((m) => ({ k: m.reason, m: m.metricId, d: m.reason === "gap" ? m.date : t })),
    ...sleep.map((m) => ({ k: "gap", m: Q().sleepSkipId(m), d: m.date })),
    ...(grip ? [{ k: "due", m: Q().GRIP_SKIP_ID, d: t }] : []),
  ];
  writeLocal(SKIP_KEY, JSON.parse(Q().serializeSkips(Q().parseSkips(JSON.stringify(list)), t)));
  const n = values.length + sleep.length + (grip ? 1 : 0);
  X.toast(n === 1 && grip ? "Griffkraft übersprungen." : n === 1 ? "Übersprungen." : `${n} Werte übersprungen.`);
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
  "qf-extra-drop": () => {
    if (X.S.qf) X.S.qf.extra = [];
    X.rerender();
  },
  "qf-skip-grip": () => skip([], [], true),
  "qf-save": async () => {
    const S = X.S;
    const f = (S.qf ??= { inputs: {}, errors: {} });
    const db = buildDb();
    const { values, sleep, sleepRows, grip } = missingAll(db);
    const errors = {};
    const bodyItems = [];
    for (const m of values) {
      const v = Q().parseFillInput(f.inputs[valueKey(m)] ?? "");
      const e = Q().fillInputError(v, m);
      if (e) errors[valueKey(m)] = e === "Bitte eine Zahl eingeben." ? e : `Erlaubt: ${F(m.minValue, m.decimals)}–${F(m.maxValue, m.decimals)} ${m.unit}`;
      else if (v !== null) bodyItems.push({ m, v });
    }
    // Weitere Werte aus der Datei (angehakt) als Messung von heute
    for (const x of f.extra ?? []) {
      if (!x.use) continue;
      const v = Q().parseFillInput(x.text ?? "");
      if (v === null) continue;
      if (Number.isNaN(v) || (x.minValue !== null && v < x.minValue) || (x.maxValue !== null && v > x.maxValue)) {
        errors[`extra|${x.metricId}`] = x.minValue !== null && x.maxValue !== null ? `Erlaubt: ${F(x.minValue, x.decimals)}–${F(x.maxValue, x.decimals)} ${x.unit}` : "Bitte eine Zahl eingeben.";
        continue;
      }
      if (bodyItems.some((b) => b.m.metricId === x.metricId)) continue;
      bodyItems.push({ m: { metricId: x.metricId, date: today() }, v });
    }
    const nights = [];
    const patches = new Map();
    for (const m of sleep) {
      const k = sleepKey(m);
      if (m.kind === "night") {
        const bed = Q().parseClock(f.inputs[`${k}|bed`] ?? "");
        const wake = Q().parseClock(f.inputs[`${k}|wake`] ?? "");
        if (bed === null && wake === null) continue;
        // Sofort speichern (1.131.0): halb ausgefüllte Nacht bleibt stehen, bis beide Zeiten da sind
        if ((!bed || !wake) && S.autosaving) continue;
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
    // Griffkraft: beide Hände oder keine (wie am PC)
    let gripDraft = null;
    if (grip) {
      const left = Q().parseFillInput(f.inputs["grip|left"] ?? "");
      const right = Q().parseFillInput(f.inputs["grip|right"] ?? "");
      const e = Q().gripInputError(left) ?? Q().gripInputError(right);
      if (e) errors.grip = e;
      else if ((left === null) !== (right === null)) {
        if (!S.autosaving) errors.grip = "Bitte beide Hände eintragen (oder beide leer lassen).";
      }
      else if (left !== null) {
        // Uhrzeit ist Pflicht (1.126.0, wie PC 1.0.201)
        const time = f.inputs["grip|time"] ?? gripTimeDefault(grip);
        if (D.gripTiming.minutesOf(time) === null) errors.grip = "Bitte die Uhrzeit der Messung angeben.";
        else gripDraft = { date: grip.date, time, leftKg: left, rightKg: right };
      }
    }
    f.errors = errors;
    if (Object.keys(errors).length) {
      X.rerender();
      return X.toast("Bitte die markierten Felder prüfen.", true);
    }
    const total = bodyItems.length + nights.length + patches.size + (gripDraft ? 1 : 0);
    if (!total) return S.autosaving ? undefined : X.toast("Noch kein Wert eingetragen.", true);
    try {
      for (const { m, v } of bodyItems) {
        B.saveValue(S.catalog, S.body.local, { metricId: m.metricId, date: m.date, time: "", value: v, method: "", notes: "", editId: null }, { uuid: X.uuid, now: new Date() });
      }
      for (const draft of [...nights, ...patches.values()]) {
        const res = L.saveSleep(db, S.logs, draft, { uuid: X.uuid, now: new Date() });
        if (res.errors) throw new Error(Object.values(res.errors)[0]);
      }
      if (gripDraft) {
        const res = L.saveGrip(db, S.logs, gripDraft, { uuid: X.uuid, now: new Date() });
        if (res.errors) throw new Error(Object.values(res.errors)[0]);
      }
      if (bodyItems.length) await X.store.set("body", S.body.local);
      if (nights.length || patches.size || gripDraft) await X.store.set("logs", S.logs);
    } catch (e) {
      X.rerender();
      return X.toast(e.message, true);
    }
    if (S.autosaving) {
      // gespeicherte Werte verschwinden aus der Liste; halb ausgefüllte (Nacht, Griffkraft) bleiben
      const done = new Set(bodyItems.filter((b) => b.m.metricId && !b.m.name).map((b) => `extra|${b.m.metricId}`));
      for (const { m } of bodyItems) if (m.name) delete f.inputs[valueKey(m)];
      for (const m of sleep) if (m.kind !== "night" && patches.has(m.logId)) delete f.inputs[sleepKey(m)];
      for (const n of nights) {
        const m = sleep.find((x) => x.kind === "night" && x.date === n.date);
        if (m) for (const s of ["bed", "wake"]) delete f.inputs[`${sleepKey(m)}|${s}`];
      }
      if (gripDraft) for (const k of ["grip|left", "grip|right", "grip|time"]) delete f.inputs[k];
      S.qf = { ...f, errors: {}, extra: (f.extra ?? []).filter((x) => !(x.use && done.has(`extra|${x.metricId}`))) };
    } else S.qf = { inputs: {}, errors: {} };
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
    return card("goal-advice", title, "", `<p class="muted">Noch keine Hauptziele gewählt – unter Settings → Hauptziele (z. B. Fettabbau, Muskelaufbau).</p>`, { wide: true });
  }
  const labels = goals.map((g) => G.MAIN_GOAL_LABELS[g]).join(", ");
  if (!consent) {
    return card(
      "goal-advice",
      title,
      labels,
      `<p class="muted small">Empfehlungen und Bewertungen deiner Werte gibt es erst mit Einwilligung unter Settings → Hauptziele. Bis dahin die passenden Stellen aus der Masterclass:</p>
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

// Insights → Ziele: seit 1.91.0 mit Bearbeiten in goalsparity.js

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

// Nutrition → Planen: seit 1.92.0 mit Bearbeiten in planparity.js

const QF_INTRO = "Werte, die kein Import liefert – aus der letzten Messung, nach ihrem Rhythmus fällig, aus der letzten Nacht oder die Griffkraft. Leere Felder bleiben offen. Die Auswahl stellst du am PC unter Settings → Quick Fill ein.";
