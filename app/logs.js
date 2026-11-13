// LIFESPAN OS Mobil – Sleep und Recovery wie am PC (1.7.0): Ansichten wie SleepPage.tsx und
// RecoveryPage.tsx – Schlafdauer je Nacht, Schlafphasen, Wochen- und Monatstrend, Einträge,
// Nacht und Nickerchen erfassen/bearbeiten/löschen; Selbsteinschätzung, Vergleich mit Schlaf und
// Training, ANS-Werte (Ruhepuls, HRV, Atemfrequenz, Schlag-zu-Schlag-Intervall, ANS-Status).
// Logik: logsdata.js (wie der Rust-Kern), Rechenregeln aus pcdomain.js (= src/domain).
// Änderungen gehen mit „Körperwerte senden“ an den PC.

import * as P from "./pcdb.js";
import * as O from "./pcoverview.js";
import * as D from "./pcdomain.js";
import * as L from "./logsdata.js";
import * as BD from "./bodydata.js";
import { barTrendSvg, COLOR, trendSvg } from "./pcview.js";
import { buildDb, today } from "./diary.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initLogs(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);
const dur = (m) => D.formatDuration(m);
const PHASE_COLOR = { light: "#A39BE3", deep: "#2E2580", rem: "#2F86B8" };
const PHASE_FIELD = { light: "lightMin", deep: "deepMin", rem: "remMin" };
const ANS_STATUS = "00000000-0000-7000-8000-000000000022";
const VITALS = [
  { id: "00000000-0000-7000-8000-000000000018", label: "Ruhepuls", unit: "bpm", decimals: 0, hint: "Morgens in Ruhe gemessen, z. B. vor dem Aufstehen." },
  { id: "00000000-0000-7000-8000-000000000019", label: "HRV (RMSSD)", unit: "ms", decimals: 1, hint: "Werte verschiedener Geräte oder Verfahren sind nicht direkt vergleichbar." },
  { id: "00000000-0000-7000-8000-000000000020", label: "Atemfrequenz", unit: "br/Min", decimals: 1, hint: "Atemzüge pro Minute (Breath per Minute)." },
  { id: "00000000-0000-7000-8000-000000000021", label: "Ø Schlag-zu-Schlag-Intervall", unit: "ms", decimals: 0, hint: "Mittlere Zeit zwischen zwei Herzschlägen (RR-Intervall)." },
  { id: ANS_STATUS, label: "ANS-Status", unit: "Punkte", decimals: 1, hint: "Wert von −10 bis +10, wie ihn dein Gerät oder deine App angibt." },
];
const signed = (v) => `${v > 0 ? "+" : ""}${F(v, 1)}`;

const shift = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function persist() {
  try {
    await X.store.set("logs", X.S.logs);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

function card(title, meta, body, area = "") {
  return `<section class="card ${area ? `ov-card card--${area}` : ""}"><div class="wo-head"><h3>${esc(title)}</h3>${meta ? `<span class="tag">${esc(meta)}</span>` : ""}</div>${body}</section>`;
}
const note = (t) => (t ? `<p class="card__note">${t}</p>` : "");

function select(attr, value, options, label) {
  return `<label class="field logs-select"><span>${esc(label)}</span><select data-logs="${attr}">${options
    .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`)
    .join("")}</select></label>`;
}

function phaseBar(shares, label = "") {
  const name = (k) => D.sleep.SLEEP_PHASES.find((p) => p.key === k)?.label ?? k;
  return `<div class="goal-bar goal-bar--energy phase-bar" role="img" aria-label="${esc(`${label ? `${label}: ` : ""}${shares.phases.map((p) => `${name(p.key)} ${Math.round(p.percent)} %`).join(", ")}`)}">${shares.phases
    .map((p) => `<span class="goal-bar__fill" style="width:${p.percent}%;background:${PHASE_COLOR[p.key]}" title="${esc(`${name(p.key)}: ${dur(p.minutes)} (${Math.round(p.percent)} %)`)}"></span>`)
    .join("")}</div>`;
}

function phaseSummary(shares) {
  return `<div class="phase-summary">${phaseBar(shares)}
    <ul class="legend phase-legend">${shares.phases
      .map((p) => {
        const info = D.sleep.SLEEP_PHASES.find((i) => i.key === p.key);
        return `<li><span class="swatch" style="background:${PHASE_COLOR[p.key]}"></span><span><strong>${esc(info.label)}</strong> ${dur(p.minutes)} · <strong>${Math.round(p.percent)} %</strong><span class="muted small"> (typisch ${info.typicalMin}–${info.typicalMax} %)</span></span></li>`;
      })
      .join("")}</ul>
    <p class="muted small">Gesamtschlaf aus den Phasen: ${dur(shares.totalMin)}. Die Anteile beziehen sich auf diese Summe.</p></div>`;
}

/** Senkrechte Balken je Woche bzw. Monat wie PeriodBars (Mittelwert, Zahl der Nächte darunter). */
function periodBars(bars, { color, format, label }) {
  const W = 340;
  const H = 200;
  const Lp = 38;
  const T = 10;
  const B = 34;
  const max = Math.max(720, ...bars.map((b) => b.value));
  const step = (W - Lp - 6) / Math.max(1, bars.length);
  const bw = Math.max(4, step * 0.62);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  return `<svg class="pc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${[0, 240, 480, 720].map((v) => `<line x1="${Lp}" x2="${W - 6}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${Lp - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v / 60} h</text>`).join("")}
    ${bars
      .map((b, i) => {
        const x = Lp + i * step + (step - bw) / 2;
        const top = y(b.value);
        return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - top).toFixed(1)}" rx="2" fill="${color}"><title>${esc(`${b.label} (${b.range}): ${format(b.value)} · ${b.count} ${b.count === 1 ? "Nacht" : "Nächte"}`)}</title></rect>
          <text x="${(x + bw / 2).toFixed(1)}" y="${H - 20}" text-anchor="middle">${esc(b.label.replace("KW ", ""))}</text>
          <text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${b.count}×</text>`;
      })
      .join("")}
  </svg>`;
}

// ------------------------------------------------------------------ Sleep

function sleepData(db, from, to) {
  const logs = db.sleep
    .filter((s) => s.date >= from && s.date <= to)
    .map(O.sleepLog)
    .sort((a, b) => b.date.localeCompare(a.date));
  const naps = db.naps
    .filter((n) => n.date >= from && n.date <= to)
    .map(O.sleepNap)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return { logs, naps };
}

const isLocal = (kind, id) => {
  const e = X.S.logs[kind][id];
  return e ? (e.sent ? "gesendet" : "noch nicht am PC") : "";
};

export function viewSleep() {
  const S = X.S;
  if (!S.catalog?.pc) return `${X.header("Sleep")}<main class="wrap"><section class="card"><p class="warn">Für Sleep wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Settings „Neue Exportdatei laden“.</p></section></main>`;
  const days = S.sleepDays ?? 30;
  const t = today();
  const from = shift(t, -(days - 1));
  const db = buildDb();
  const { logs, naps } = sleepData(db, from, t);
  const goal = P.goalFor(db, t);
  const napMin = D.sleep.napMinutesByDate(naps);
  const hasNaps = logs.some((l) => napMin.has(l.date));
  const chart = [...logs].reverse().map((l) => ({ date: l.date, value: D.sleep.sleepWithNaps(l, napMin) }));
  const avg = D.stats.mean(logs.map((l) => D.sleep.sleepWithNaps(l, napMin)));
  const open = L.unsentLogs(S.logs);

  let out = `${X.header("Sleep")}<main class="wrap">
    <p class="muted small">Schlafzeiten, Schlafdauer, Schlafphasen, Nickerchen und deine eigene Einschätzung der Schlafqualität.</p>
    <section class="card logs-toolbar">
      ${select("sleep-days", days, [
        [7, "7 Nächte"],
        [30, "30 Nächte"],
        [90, "90 Nächte"],
        [365, "1 Jahr"],
      ], "Zeitraum")}
      <div class="logs-actions">
        <button class="btn primary" data-act="sleep-new">Nacht erfassen</button>
        <button class="btn" data-act="nap-new">Nap erfassen</button>
      </div>
      ${open ? `<p class="muted small">${open} ${open === 1 ? "Änderung" : "Änderungen"} bei Schlaf/Regeneration noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    </section>`;
  if (!logs.length) {
    out += card("Keine Einträge in diesem Zeitraum", "", `<p class="muted">Erfasse eine Nacht mit „Nacht erfassen“. Als Datum gilt der Tag des Aufwachens.</p>`, "sleep");
  } else {
    out += card(
      "Schlafdauer je Nacht",
      `Mittel: ${avg !== null ? dur(avg) : "–"}${goal?.sleepMin != null ? ` · Ziel: ${dur(goal.sleepMin)}` : ""}`,
      `${barTrendSvg(chart, { color: COLOR.sleep, format: dur, height: 200, label: "Schlafdauer je Nacht im gewählten Zeitraum", ticks: [0, 240, 480, 720], tickFormat: (v) => `${v / 60} h` })}
      ${note(`Schlafdauer = Zeit im Bett minus Einschlafdauer und Wachzeit (soweit angegeben), plus Nickerchen desselben Tages.${hasNaps ? " Tage mit Nickerchen sind in der Liste aufgeschlüsselt." : ""}`)}`,
      "sleep",
    );
    out += phasesCard(logs);
    out += trendsCard(db, t, goal?.sleepMin ?? null);
  }
  if (logs.length || naps.length) out += entriesCard(logs, naps, napMin);
  return `${out}</main>`;
}

function phasesCard(logs) {
  const nights = logs.map((l) => ({ log: l, shares: D.sleep.phaseShares(l) })).filter((n) => n.shares);
  if (!nights.length) {
    return card("Schlafphasen", "", `<p class="muted">Noch keine Nacht mit allen drei Schlafphasen im Zeitraum. Trage Light, Deep und REM beim Erfassen einer Nacht ein, dann erscheinen hier die Anteile.</p>`, "sleep");
  }
  const tot = { light: 0, deep: 0, rem: 0 };
  for (const n of nights) for (const ph of n.shares.phases) tot[ph.key] += ph.minutes;
  const avg = D.sleep.phaseShares({ lightMin: tot.light, deepMin: tot.deep, remMin: tot.rem });
  const shown = nights.slice(0, 14);
  return card(
    "Schlafphasen",
    `${nights.length} ${nights.length === 1 ? "Nacht" : "Nächte"} mit Phasen`,
    `${avg ? `<h4 class="logs-sub">Mittlere Anteile im Zeitraum</h4>${phaseSummary(avg)}` : ""}
    <h4 class="logs-sub">Je Nacht${nights.length > shown.length ? " (letzte 14)" : ""}</h4>
    <ul class="phase-nights">${shown
      .map(
        ({ log, shares }) =>
          `<li><span class="phase-nights__date">${esc(D.formatDate(log.date))}</span><span class="muted small">${shares.phases.map((p) => `${Math.round(p.percent)} %`).join(" · ")}</span>${phaseBar(shares, D.formatDate(log.date))}</li>`,
      )
      .join("")}</ul>
    ${note("Reihenfolge in jeder Leiste: Light, Deep, REM. Anteile an der Summe der drei Phasen. Typische Bereiche sind grobe Richtwerte, keine Bewertung.")}`,
    "sleep",
  );
}

function trendsCard(db, t, goalMin) {
  const period = X.S.sleepPeriod ?? "week";
  const from = D.trends.periodStartBack(t, period, 12);
  const { logs, naps } = sleepData(db, from, t);
  const napMin = D.sleep.napMinutesByDate(naps);
  const duration = D.trends.groupByPeriod(
    logs.map((l) => ({ date: l.date, value: D.sleep.sleepWithNaps(l, napMin) })),
    period,
  );
  const quality = new Map(D.trends.groupByPeriod(D.insights.sleepQualitySeries(logs), period).map((q) => [q.key, q]));
  const bars = duration.map((p) => ({ key: p.key, label: p.label, range: D.trends.formatRange(p.start, p.end), value: p.mean, count: p.count }));
  const head = select("sleep-period", period, [
    ["week", "Wochen (letzte 12)"],
    ["month", "Monate (letzte 12)"],
  ], "Einteilung");
  if (!bars.length) return card("Wochen- und Monatstrend", "", `${head}<p class="muted">Keine Nächte in diesem Zeitraum.</p>`, "sleep");
  return card(
    "Wochen- und Monatstrend",
    "",
    `${head}${periodBars(bars, { color: COLOR.sleep, format: dur, label: period === "week" ? "Mittlere Schlafdauer je Woche" : "Mittlere Schlafdauer je Monat" })}
    <div class="table-scroll"><table class="data-table"><thead><tr><th>${period === "week" ? "Woche" : "Monat"}</th><th class="tnum">Erfasst</th><th class="tnum">Ø Schlaf</th><th class="tnum">Min – Max</th><th class="tnum">Ø Qualität</th></tr></thead><tbody>
    ${[...duration]
      .reverse()
      .map((p) => {
        const q = quality.get(p.key);
        return `<tr><td>${esc(p.label)}<span class="sub">${esc(D.trends.formatRange(p.start, p.end))}</span></td><td class="tnum">${p.count} von ${p.days}</td><td class="tnum">${dur(p.mean)}</td><td class="tnum">${dur(p.min)} – ${dur(p.max)}</td><td class="tnum">${q ? `${F(q.mean, 1)} / 10 (${q.count}×)` : "–"}</td></tr>`;
      })
      .join("")}</tbody></table></div>
    ${note(`Mittelwerte nur aus erfassten Nächten (inklusive Nickerchen desselben Tages); fehlende Nächte werden nicht geschätzt.${goalMin !== null ? ` Dein Schlafziel: ${dur(goalMin)}.` : ""}`)}`,
    "sleep",
  );
}

function entriesCard(logs, naps, napMin) {
  const rows = D.sleep.sleepEntryRows(logs, naps);
  return card(
    "Einträge",
    "",
    `<div class="list logs-list">${rows
      .map((row) => {
        if (row.kind === "nap") {
          const n = row.nap;
          const st = isLocal("naps", n.id);
          return `<button class="item nap-item" data-act="nap-edit" data-arg="${esc(n.id)}"><span class="main">
            <b>${row.alone ? `${esc(D.formatDate(n.date))} · ` : ""}Nickerchen</b>
            <span class="muted small">${esc(n.startTime)}–${esc(n.endTime)} Uhr · ${dur(n.durationMin)}${n.notes ? ` · ${esc(n.notes)}` : ""}</span></span>
            ${st ? `<span class="tag">${st}</span>` : `<span class="tag">Bearbeiten</span>`}</button>`;
        }
        const l = row.log;
        const nap = napMin.get(l.date);
        const sh = D.sleep.phaseShares(l);
        const st = isLocal("sleep", l.id);
        return `<button class="item" data-act="sleep-edit" data-arg="${esc(l.id)}"><span class="main">
          <b>${esc(D.formatDate(l.date))} · ${dur(D.sleep.sleepWithNaps(l, napMin))}</b>
          <span class="muted small">${esc(l.bedTime)}–${esc(l.wakeTime)} Uhr · im Bett ${dur(l.timeInBedMin)}${nap !== undefined ? ` · Nacht ${dur(l.sleepMin)} + Nickerchen ${dur(nap)}` : ""}</span>
          <span class="muted small">${[
            l.efficiencyPct !== null ? `Efficiency ${l.efficiencyPct} %` : "",
            l.awakenings !== null ? `${l.awakenings} Wachphasen` : "",
            l.quality !== null ? `Qualität ${l.quality} / 10` : "",
            l.method ?? "",
          ]
            .filter(Boolean)
            .map(esc)
            .join(" · ")}</span>
          ${sh ? phaseBar(sh, D.formatDate(l.date)) : ""}
          ${l.notes ? `<span class="muted small">${esc(l.notes)}</span>` : ""}</span>
          ${st ? `<span class="tag">${st}</span>` : `<span class="tag">Bearbeiten</span>`}</button>`;
      })
      .join("")}</div>
    ${note("Nickerchen stehen unter der Nacht desselben Tages und werden zur Schlafdauer des Tages addiert (Diagramm, Liste und Trend). Tippen zum Bearbeiten.")}`,
  );
}

// ------------------------------------------------------------------ Formulare (Nacht, Nap, Einschätzung)

const str = (v) => (v === null || v === undefined ? "" : String(v));

function sleepDraft(row) {
  return row
    ? {
        id: row.id,
        date: row.date,
        bedTime: row.bed_time,
        wakeTime: row.wake_time,
        sleepLatencyMin: str(row.sleep_latency_min),
        awakeMin: str(row.awake_min),
        awakenings: str(row.awakenings),
        quality: str(row.quality),
        notes: row.notes ?? "",
        efficiencyPct: str(row.efficiency_pct),
        lightMin: str(row.light_min),
        deepMin: str(row.deep_min),
        remMin: str(row.rem_min),
        method: row.method ?? "",
      }
    : null;
}

function field(name, label, value, { type = "text", unit = "", hint = "", mode = "", error = "", placeholder = "" } = {}) {
  return `<div class="field ${error ? "has-error" : ""}"><label for="lf-${name}">${esc(label)}</label>
    <div class="input-row"><input id="lf-${name}" type="${type}" data-lf="${name}" value="${esc(value)}" ${mode ? `inputmode="${mode}"` : ""} ${placeholder ? `placeholder="${esc(placeholder)}"` : ""} ${error ? 'aria-invalid="true"' : ""} autocomplete="off">${unit ? `<span class="unit">${esc(unit)}</span>` : ""}</div>
    ${error ? `<p class="field-error">${esc(error)}</p>` : hint ? `<p class="muted small">${esc(hint)}</p>` : ""}</div>`;
}

function selectField(name, label, value, options, { error = "", hint = "" } = {}) {
  return `<div class="field ${error ? "has-error" : ""}"><label for="lf-${name}">${esc(label)}</label>
    <select id="lf-${name}" data-lf="${name}" ${error ? 'aria-invalid="true"' : ""}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
    ${error ? `<p class="field-error">${esc(error)}</p>` : hint ? `<p class="muted small">${esc(hint)}</p>` : ""}</div>`;
}

function sleepPreview(d) {
  const T = /^\d{2}:\d{2}$/;
  if (!T.test(d.bedTime) || !T.test(d.wakeTime) || d.bedTime === d.wakeTime) return "";
  const inBed = D.sleep.sleepMinutes(d.bedTime, d.wakeTime);
  const asleep = Math.max(0, inBed - ((Number(d.sleepLatencyMin) || 0) + (Number(d.awakeMin) || 0)));
  return `Zeit im Bett: <strong>${dur(inBed)}</strong> · Schlafdauer: <strong>${dur(asleep)}</strong>`;
}

function phasePreview(d) {
  const v = (t) => {
    const x = L.parseDuration(t);
    return x === null || Number.isNaN(x) ? null : x;
  };
  const sh = D.sleep.phaseShares({ lightMin: v(d.lightMin), deepMin: v(d.deepMin), remMin: v(d.remMin) });
  return sh
    ? phaseSummary(sh)
    : `<p class="muted small">Dauer je Phase in Minuten oder Stunden:Minuten, z. B. von deiner Uhr. Sind alle drei ausgefüllt, siehst du hier ihren Anteil am Gesamtschlaf.</p>`;
}

function formButtons(isEdit, deleteLabel) {
  return `<div class="logs-form-actions">
    <button class="btn primary" data-act="log-save">Speichern</button>
    <button class="btn" data-act="log-cancel">Abbrechen</button>
    ${isEdit ? `<button class="btn danger" data-act="log-delete">${esc(deleteLabel)}</button>` : ""}
  </div>`;
}

function editSleepView(f) {
  const d = f.draft;
  const e = f.errors;
  const db = buildDb();
  const methods = D.methodChoices(L.methodsOf(db, "sleep"), d.method);
  return `${X.header(d.id ? "Nacht bearbeiten" : "Nacht erfassen", { back: "sleep" })}<main class="wrap">
    <section class="card card--sleep ov-card logs-form">
      ${field("date", "Aufgewacht am", d.date, { type: "date", error: e.date })}
      ${selectField("method", "Messmethode", d.method, [["", "Keine Angabe"], ...methods.map((m) => [m, m])], {
        error: e.method,
        hint: methods.length ? "" : "Messmethoden legst du am PC unter Settings → Messmethoden (Schlaf) an.",
      })}
      <div class="logs-grid">
        ${field("bedTime", "Zu Bett gegangen", d.bedTime, { type: "time", error: e.bedTime })}
        ${field("wakeTime", "Aufgestanden", d.wakeTime, { type: "time", error: e.wakeTime })}
        ${field("sleepLatencyMin", "Einschlafdauer (optional)", d.sleepLatencyMin, { unit: "min", mode: "numeric", error: e.sleepLatencyMin })}
        ${field("awakeMin", "Wach in der Nacht (optional)", d.awakeMin, { unit: "min", mode: "numeric", error: e.awakeMin })}
        ${field("awakenings", "Wachphasen (optional)", d.awakenings, { unit: "×", mode: "numeric", error: e.awakenings, hint: "Wie oft du nachts aufgewacht bist." })}
        ${field("quality", "Schlafqualität (optional)", d.quality, { unit: "/ 10", mode: "numeric", error: e.quality, hint: "1 = sehr schlecht, 10 = sehr gut." })}
        ${field("efficiencyPct", "Efficiency (optional)", d.efficiencyPct, { unit: "%", mode: "numeric", error: e.efficiencyPct, hint: "Anteil der Zeit im Bett, in der du geschlafen hast." })}
      </div>
      <p class="muted" id="lf-preview">${sleepPreview(d)}</p>
      <fieldset class="logs-phases"><legend>Schlafphasen (optional)</legend>
        <div class="logs-grid">${D.sleep.SLEEP_PHASES.map((ph) =>
          field(PHASE_FIELD[ph.key], ph.label, d[PHASE_FIELD[ph.key]], {
            unit: "min",
            mode: "numeric",
            placeholder: "z. B. 95 oder 1:35",
            error: e[PHASE_FIELD[ph.key]],
            hint: `${ph.title}: ${D.sleep.typicalShareText(ph)}`,
          }),
        ).join("")}</div>
        <div id="lf-phases">${phasePreview(d)}</div>
      </fieldset>
      <div class="field"><label for="lf-notes">Notizen (optional)</label><textarea id="lf-notes" data-lf="notes" rows="2">${esc(d.notes)}</textarea>${e.notes ? `<p class="field-error">${esc(e.notes)}</p>` : ""}</div>
      ${formButtons(Boolean(d.id), "Eintrag löschen")}
    </section></main>`;
}

function editNapView(f) {
  const d = f.draft;
  const e = f.errors;
  const T = /^\d{2}:\d{2}$/;
  const duration = T.test(d.startTime) && T.test(d.endTime) && d.startTime !== d.endTime ? D.sleep.sleepMinutes(d.startTime, d.endTime) : null;
  return `${X.header(d.id ? "Nap bearbeiten" : "Nap erfassen", { back: "sleep" })}<main class="wrap">
    <section class="card card--sleep ov-card logs-form">
      ${field("date", "Datum", d.date, { type: "date", error: e.date })}
      <div class="logs-grid">
        ${field("startTime", "Beginn", d.startTime, { type: "time", error: e.startTime })}
        ${field("endTime", "Ende", d.endTime, { type: "time", error: e.endTime })}
      </div>
      ${field("notes", "Notiz (optional)", d.notes, { placeholder: "z. B. Powernap", error: e.notes })}
      <p class="muted" id="lf-preview">${duration !== null ? `Dauer: <strong>${dur(duration)}</strong> – wird zur Schlafdauer dieses Tages addiert.` : ""}</p>
      ${formButtons(Boolean(d.id), "Nap löschen")}
    </section></main>`;
}

function scaleOptions(s) {
  return [
    ["", "– keine Angabe –"],
    ...Array.from({ length: s.max - s.min + 1 }, (_, i) => {
      const v = s.min + i;
      return [String(v), v === s.min ? `${v} – ${s.low}` : v === s.max ? `${v} – ${s.high}` : String(v)];
    }),
  ];
}

function editRecoveryView(f) {
  const d = f.draft;
  const e = f.errors;
  return `${X.header(d.id ? "Einschätzung bearbeiten" : "Tag einschätzen", { back: "recovery" })}<main class="wrap">
    <section class="card card--recovery ov-card logs-form">
      <p class="muted small">Alle Angaben sind deine eigene Einschätzung. Wähle nur aus, was du heute einschätzen möchtest – leere Felder bleiben leer und werden nicht geschätzt.</p>
      ${field("date", "Datum", d.date, { type: "date", error: e.date })}
      ${D.recovery.RECOVERY_SCALES.map((s) => selectField(s.key, `${s.question} (optional)`, d[s.key], scaleOptions(s), { error: e[s.key], hint: D.recovery.scaleHint(s.key) })).join("")}
      <div class="field"><label for="lf-notes">Notizen (optional)</label><textarea id="lf-notes" data-lf="notes" rows="2">${esc(d.notes)}</textarea>${e.notes ? `<p class="field-error">${esc(e.notes)}</p>` : ""}</div>
      ${formButtons(Boolean(d.id), "Eintrag löschen")}
    </section></main>`;
}

function ansBar(value, previous) {
  const ticks = [-10, -5, 0, 5, 10];
  return `<div class="ans-bar"><div class="ans-bar__track" role="img" aria-label="${esc(value === null ? "Noch kein Wert eingegeben" : `ANS-Status ${signed(value)}${previous ? `, Mittel der früheren Messungen ${signed(previous.mean)}` : ""}`)}">
      <span class="ans-bar__zero" style="left:50%"></span>
      ${previous ? `<span class="ans-bar__mean" style="left:${D.ansPercent(previous.mean)}%"></span>` : ""}
      ${value !== null ? `<span class="ans-bar__value" style="left:${D.ansPercent(value)}%"></span>` : ""}</div>
    <div class="ans-bar__ticks">${ticks.map((t) => `<span style="left:${D.ansPercent(t)}%">${t > 0 ? `+${t}` : t}</span>`).join("")}</div>
    <p class="ans-bar__legend"><span class="ans-bar__key ans-bar__key--value"></span> Aktuell: <strong>${value === null ? "–" : signed(value)}</strong>
      <span class="ans-bar__key ans-bar__key--mean"></span> Mittel der früheren Messungen: <strong>${previous ? signed(previous.mean) : "–"}</strong>
      ${previous ? `<span class="muted"> (${previous.count} ${previous.count === 1 ? "Messung" : "Messungen"}${value !== null ? `, Abstand ${signed(Math.round((value - previous.mean) * 10) / 10)}` : ""})</span>` : ""}</p></div>`;
}

function vitalsHistory(db) {
  return O.measurementsBetween(db, ANS_STATUS, null, null).map((m) => ({ date: m.date, value: m.value }));
}

function editVitalsView(f) {
  const S = X.S;
  const d = f.draft;
  const e = f.errors;
  const db = buildDb();
  const methods = D.methodChoices(L.methodsOf(db, "vital"), d.method);
  const ansText = d.values[ANS_STATUS] ?? "";
  const ansNum = ansText.trim() === "" ? null : Number(ansText.replace(",", "."));
  const prev = D.previousMean(vitalsHistory(db), d.date);
  const hasMetric = (id) => (S.catalog?.body?.metrics ?? []).some((m) => m.id === id);
  const vf = (v) =>
    hasMetric(v.id)
      ? field(`v-${v.id}`, `${v.label} (optional)`, d.values[v.id] ?? "", { unit: v.unit, mode: v.decimals === 0 ? "numeric" : "decimal", hint: v.hint, error: e[v.id] })
      : "";
  return `${X.header("ANS-Werte erfassen", { back: "recovery", sub: D.ANS_TITLE })}<main class="wrap">
    <section class="card card--recovery ov-card logs-form">
      <p class="muted small">Manuell übertragene Messwerte, z. B. von Uhr, Brustgurt oder App. Sie werden unter Body &amp; Longevity gespeichert. Werte vom PC entfernst du am PC; ein geleertes Feld entfernt einen hier erfassten, noch nicht gesendeten Wert.</p>
      ${field("date", "Messdatum", d.date, { type: "date", error: e.date })}
      ${selectField("method", "Messmethode", d.method, [["", "Keine Angabe"], ...methods.map((m) => [m, m])], {
        hint: methods.length ? "Gilt für alle Werte dieses Messdatums." : "Messmethoden legst du am PC unter Settings → Messmethoden (Vitalwerte) an.",
      })}
      <div class="logs-grid">${VITALS.filter((v) => v.id !== ANS_STATUS).map(vf).join("")}</div>
      <div class="ans-status"><h4 class="logs-sub">ANS-Status</h4><div id="lf-ans">${ansBar(ansNum !== null && Number.isFinite(ansNum) ? ansNum : null, prev)}</div>${vf(VITALS[4])}</div>
      <details class="ov-more"><summary>Was bedeuten die Werte?</summary><p class="muted small logs-help">${esc(D.ANS_INFO).replace(/\n/g, "<br>")}</p></details>
      <div class="logs-form-actions"><button class="btn primary" data-act="log-save">Speichern</button><button class="btn" data-act="log-cancel">Abbrechen</button></div>
    </section></main>`;
}

export function viewLogEdit() {
  const f = X.S.logEdit;
  if (!f) return viewSleep();
  if (f.kind === "sleep") return editSleepView(f);
  if (f.kind === "naps") return editNapView(f);
  if (f.kind === "recovery") return editRecoveryView(f);
  return editVitalsView(f);
}

// ------------------------------------------------------------------ Recovery

export function viewRecovery() {
  const S = X.S;
  if (!S.catalog?.pc) return `${X.header("Recovery")}<main class="wrap"><section class="card"><p class="warn">Für Recovery wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Settings „Neue Exportdatei laden“.</p></section></main>`;
  const days = S.recoveryDays ?? 30;
  const scale = S.recoveryScale ?? "readiness";
  const t = today();
  const from = shift(t, -(days - 1));
  const db = buildDb();
  const data = O.insightsFor(db, from, t);
  const logs = [...data.recovery].reverse();
  const todayLog = logs.find((l) => l.date === t);
  const s = D.recovery.recoveryScale(scale);
  const chart = D.insights.recoverySeries(data.recovery, scale);
  const open = L.unsentLogs(S.logs) + BD.unsentBody(S.body.local);

  let out = `${X.header("Recovery")}<main class="wrap">
    <p class="muted small">Deine tägliche Selbsteinschätzung (Erholung, Müdigkeit, Muskelkater, Stress) sowie optional die ANS-Werte (Ruhepuls, HRV, Atemfrequenz, Schlag-zu-Schlag-Intervall, ANS-Status) – im Vergleich mit Schlaf und Trainingsbelastung.</p>
    <section class="card logs-toolbar">
      ${select("recovery-days", days, [
        [14, "14 Tage"],
        [30, "30 Tage"],
        [90, "90 Tage"],
        [365, "1 Jahr"],
      ], "Zeitraum")}
      <div class="logs-actions">
        <button class="btn primary" data-act="rec-today">${todayLog ? "Heute bearbeiten" : "Heute einschätzen"}</button>
        ${todayLog ? `<button class="btn" data-act="rec-other">Anderen Tag erfassen</button>` : ""}
        <button class="btn" data-act="vitals-new">ANS-Werte erfassen</button>
      </div>
      ${open ? `<p class="muted small">${open} ${open === 1 ? "Änderung" : "Änderungen"} noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    </section>`;
  if (!logs.length) {
    out += card("Keine Einschätzungen in diesem Zeitraum", "", `<p class="muted">Schätze täglich ein, wie erholt, müde, verkatert oder gestresst du dich fühlst. Es wird nichts berechnet oder bewertet.</p>`, "recovery");
  } else {
    out += card(
      "Selbsteinschätzung",
      "",
      `${select("recovery-scale", scale, D.recovery.RECOVERY_SCALES.map((x) => [x.key, x.label]), "Skala")}
      ${chart.length > 1 ? trendSvg(chart, { color: COLOR.recovery, decimals: 0, height: 180, label: `Verlauf ${s.label}`, domain: [s.min, s.max] }) : `<p class="muted">Für „${esc(s.label)}“ ${chart.length === 1 ? "gibt es erst einen Wert" : "gibt es keine Werte"} in diesem Zeitraum.</p>`}
      ${note(`Skala ${s.min} bis ${s.max}: ${esc(D.recovery.scaleHint(scale))}`)}`,
      "recovery",
    );
    out += comparisonCard(data, scale, days);
  }
  out += vitalsCard(data);
  if (logs.length) out += recoveryListCard(logs, data);
  return `${out}</main>`;
}

function comparisonCard(data, scale, days) {
  const s = D.recovery.recoveryScale(scale);
  const values = D.insights.recoverySeries(data.recovery, scale);
  const sleep = D.insights.sleepSeries(data.sleep);
  const loads = D.insights.trainingLoadByDay(data.workouts);
  const loadPoints = loads.map((l) => ({ date: l.date, value: l.load }));
  const incomplete = loads.reduce((a, l) => a + l.incomplete, 0);
  const assoc = D.insights.describeAssociation(D.insights.pairByDate(sleep, values), {
    x: "Längerer Schlaf",
    pair: `Schlafdauer und deiner Einschätzung „${s.label}“ am selben Morgen`,
    higher: `einer höheren Einschätzung „${s.label}“`,
    lower: `einer niedrigeren Einschätzung „${s.label}“`,
  });
  const after = D.insights.afterTrainingComparison(loads, values);
  const daily = (pts) => D.trends.dailySeries(pts, data.from, data.to).map((p) => ({ date: p.date, value: p.value ?? 0 }));
  return card(
    "Zeitlicher Vergleich mit Schlaf und Training",
    `${days} Tage`,
    `<h4 class="logs-sub">${esc(s.label)} (${s.min}–${s.max})</h4>
    ${values.length ? trendSvg(values, { color: COLOR.recovery, decimals: 0, height: 120, label: s.label, from: data.from, to: data.to, domain: [s.min, s.max] }) : `<p class="muted small">Keine Werte.</p>`}
    <h4 class="logs-sub">Schlafdauer</h4>
    ${barTrendSvg(daily(sleep), { color: COLOR.sleep, format: dur, height: 120, label: "Schlafdauer", ticks: [0, 360, 720], tickFormat: (v) => `${F(v / 60)} h` })}
    <h4 class="logs-sub">Trainingsbelastung (Dauer × Anstrengung)</h4>
    ${barTrendSvg(daily(loadPoints), { color: COLOR.training, height: 120, label: "Trainingsbelastung" })}
    <ul class="plain-list insight-list">
      <li><strong>Schlafdauer und ${esc(s.label)}:</strong> ${esc(assoc.text)}</li>
      <li><strong>Training und ${esc(s.label)} am Folgetag:</strong> ${esc(
        after.withCount >= 3 && after.withoutCount >= 3 && after.withMean !== null && after.withoutMean !== null
          ? `An Tagen nach einem Training lag „${s.label}“ im Mittel bei ${F(after.withMean, 1)}, an anderen Tagen bei ${F(after.withoutMean, 1)} (${after.withCount} bzw. ${after.withoutCount} Tage). Das ist eine Beobachtung, kein Nachweis einer Ursache.`
          : `Für einen Vergleich „nach Trainingstagen / an anderen Tagen“ werden je mindestens 3 Tage mit Angabe „${s.label}“ benötigt (vorhanden: ${after.withCount} bzw. ${after.withoutCount}).`,
      )}</li>
    </ul>
    ${note(`Trainingsbelastung = Dauer in Minuten × deine Anstrengung (1–10) je abgeschlossener Einheit.${incomplete > 0 ? ` ${incomplete} ${incomplete === 1 ? "Einheit ist" : "Einheiten sind"} ohne Dauer oder Anstrengung erfasst und nicht enthalten.` : ""} Tage ohne Eintrag bleiben leer.`)}`,
    "recovery",
  );
}

function vitalsCard(data) {
  const ids = new Set(VITALS.map((v) => v.id));
  const rows = data.measurements.filter((m) => ids.has(m.metricId)).slice().reverse();
  const latestAns = rows.find((m) => m.metricId === ANS_STATUS) ?? null;
  const ansAll = D.insights.metricSeries(data.measurements, ANS_STATUS);
  let body;
  if (!rows.length) body = `<p class="muted">In diesem Zeitraum keine Werte erfasst. Alle Angaben sind optional.</p>`;
  else {
    body = `${latestAns ? `<h4 class="logs-sub">ANS-Status am ${esc(D.formatDate(latestAns.date))}</h4>${ansBar(latestAns.value, D.previousMean(ansAll, latestAns.date))}` : ""}
      ${VITALS.map((v) => {
        const series = D.insights.metricSeries(data.measurements, v.id);
        if (series.length < 2) return "";
        return `<h4 class="logs-sub">${esc(v.label)}</h4>${trendSvg(series, { color: COLOR.recovery, decimals: v.decimals, height: 150, label: `Verlauf ${v.label}`, ...(v.id === ANS_STATUS ? { domain: [D.ANS_MIN, D.ANS_MAX] } : {}) })}`;
      }).join("")}
      <div class="list logs-list">${rows
        .map(
          (m) => `<button class="item" data-act="vitals-edit" data-arg="${esc(m.date)}"><span class="main"><b>${esc(m.metricName)}: ${esc(m.metricId === ANS_STATUS ? signed(m.value) : `${F(m.value, m.decimals)} ${m.unit}`)}</b>
            <span class="muted small">${esc(D.formatDate(m.date))}${m.method ? ` · ${esc(m.method)}` : ""}</span></span><span class="tag">Bearbeiten</span></button>`,
        )
        .join("")}</div>`;
  }
  return card(D.ANS_TITLE, "manuell erfasste Messwerte", `${body}${note("Einzelne Messwerte schwanken stark und werden nicht bewertet. Die App stellt keine Diagnosen und gibt keine medizinischen Empfehlungen.")}`, "recovery");
}

function recoveryListCard(logs, data) {
  const vital = (date, id) => data.measurements.find((m) => m.date === date && m.metricId === id);
  return card(
    "Einschätzungen",
    "",
    `<div class="list logs-list">${logs
      .map((l) => {
        const hr = vital(l.date, VITALS[0].id);
        const hrv = vital(l.date, VITALS[1].id);
        const ans = vital(l.date, ANS_STATUS);
        const st = isLocal("recovery", l.id);
        return `<button class="item" data-act="rec-edit" data-arg="${esc(l.id)}"><span class="main"><b>${esc(D.formatDate(l.date))}</b>
          <span class="muted small">${D.recovery.RECOVERY_SCALES.map((x) => `${x.label} ${esc(D.recovery.formatScale(x.key, l[x.key]))}`).join(" · ")}</span>
          ${hr || hrv || ans ? `<span class="muted small">${[hr ? `Ruhepuls ${F(hr.value)} bpm` : "", hrv ? `HRV ${F(hrv.value, 1)} ms` : "", ans ? `ANS ${signed(ans.value)}` : ""].filter(Boolean).join(" · ")}</span>` : ""}
          ${l.notes ? `<span class="muted small">${esc(l.notes)}</span>` : ""}</span>
          <span class="tag">${st || "Bearbeiten"}</span></button>`;
      })
      .join("")}</div>`,
  );
}

// ------------------------------------------------------------------ Aktionen

function openEdit(kind, draft, back) {
  X.S.logEdit = { kind, draft, errors: {}, back };
  X.go("log-edit");
}

function rowOf(kind, id) {
  const db = buildDb();
  const list = kind === "sleep" ? db.sleep : kind === "naps" ? db.naps : db.recovery;
  return list.find((r) => r.id === id) ?? null;
}

function vitalsDraft(date) {
  const S = X.S;
  const form = BD.dayForm(S.catalog, S.body.local, date);
  const values = Object.fromEntries(VITALS.map((v) => [v.id, form.values[v.id] ?? ""]));
  // Uhrzeit der Messung (wie in Body & Longevity) bleibt erhalten
  return { date, values, method: form.methods.vital ?? "", time: form.times.vital ?? "" };
}

export const logsActions = {
  "sleep-new": () => {
    const db = buildDb();
    const t = today();
    const hasToday = db.sleep.some((s) => s.date === t);
    const last = [...db.sleep].sort((a, b) => b.date.localeCompare(a.date)).find((s) => s.method);
    openEdit(
      "sleep",
      {
        id: null,
        date: hasToday ? shift(t, -1) : t,
        bedTime: "",
        wakeTime: "",
        sleepLatencyMin: "",
        awakeMin: "",
        awakenings: "",
        quality: "",
        notes: "",
        efficiencyPct: "",
        lightMin: "",
        deepMin: "",
        remMin: "",
        // vorbelegt mit der Methode der letzten erfassten Nacht
        method: last?.method ?? "",
      },
      "sleep",
    );
  },
  "sleep-edit": (el) => {
    const r = rowOf("sleep", el.dataset.arg);
    if (r) openEdit("sleep", sleepDraft(r), "sleep");
  },
  "nap-new": () => openEdit("naps", { id: null, date: today(), startTime: "", endTime: "", notes: "" }, "sleep"),
  "nap-edit": (el) => {
    const r = rowOf("naps", el.dataset.arg);
    if (r) openEdit("naps", { id: r.id, date: r.date, startTime: r.start_time, endTime: r.end_time, notes: r.notes ?? "" }, "sleep");
  },
  "rec-today": () => {
    const t = today();
    const r = buildDb().recovery.find((x) => x.date === t);
    openEdit("recovery", recDraft(r, t), "recovery");
  },
  "rec-other": () => openEdit("recovery", recDraft(null, shift(today(), -1)), "recovery"),
  "rec-edit": (el) => {
    const r = rowOf("recovery", el.dataset.arg);
    if (r) openEdit("recovery", recDraft(r, r.date), "recovery");
  },
  "vitals-new": () => openEdit("vitals", vitalsDraft(today()), "recovery"),
  "vitals-edit": (el) => openEdit("vitals", vitalsDraft(el.dataset.arg), "recovery"),
  "log-cancel": () => {
    const back = X.S.logEdit?.back ?? "sleep";
    X.S.logEdit = null;
    X.go(back);
  },
  "log-save": async () => {
    const S = X.S;
    const f = S.logEdit;
    if (!f) return;
    if (f.kind === "vitals") return saveVitals(f);
    const db = buildDb();
    const fn = f.kind === "sleep" ? L.saveSleep : f.kind === "naps" ? L.saveNap : L.saveRecovery;
    const res = fn(db, S.logs, f.draft, { uuid: X.uuid, now: new Date() });
    if (res.errors) {
      f.errors = res.errors;
      X.rerender();
      return X.toast("Bitte die markierten Felder prüfen.", true);
    }
    await persist();
    S.logEdit = null;
    X.toast(f.kind === "sleep" ? "Nacht gespeichert." : f.kind === "naps" ? "Nap gespeichert." : "Einschätzung gespeichert.");
    X.go(f.back);
  },
  "log-delete": async (el) => {
    const S = X.S;
    const f = S.logEdit;
    if (!f?.draft.id) return;
    if (!X.confirmTwice(el, "Nochmal tippen: löschen")) return;
    L.removeEntry(S.catalog, S.logs, f.kind, f.draft.id);
    await persist();
    S.logEdit = null;
    X.toast(f.kind === "naps" ? "Nap gelöscht." : "Eintrag gelöscht.");
    X.go(f.back);
  },
};

function recDraft(r, date) {
  return r
    ? { id: r.id, date: r.date, readiness: str(r.readiness), fatigue: str(r.fatigue), soreness: str(r.soreness), stress: str(r.stress), notes: r.notes ?? "" }
    : { id: null, date, readiness: "", fatigue: "", soreness: "", stress: "", notes: "" };
}

async function saveVitals(f) {
  const S = X.S;
  const d = f.draft;
  const values = Object.fromEntries(VITALS.filter((v) => (S.catalog?.body?.metrics ?? []).some((m) => m.id === v.id)).map((v) => [v.id, d.values[v.id] ?? ""]));
  const res = BD.saveDay(S.catalog, S.body.local, { date: d.date, values, methods: { vital: d.method }, times: { vital: d.time ?? "" } }, { uuid: X.uuid, now: new Date() });
  if (Object.keys(res.errors).length) {
    f.errors = res.errors;
    X.rerender();
    return X.toast("Bitte die markierten Felder prüfen.", true);
  }
  if (!res.saved && !res.removed && !res.kept && Object.values(values).every((v) => !String(v).trim())) {
    f.errors = { [VITALS[0].id]: "Bitte mindestens einen Wert eingeben." };
    X.rerender();
    return;
  }
  try {
    await X.store.set("body", S.body.local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
  S.logEdit = null;
  X.toast(
    res.saved || res.removed
      ? `${res.saved ? `${res.saved === 1 ? "1 Messwert" : `${res.saved} Messwerte`} gespeichert` : ""}${res.saved && res.removed ? ", " : ""}${res.removed ? `${res.removed} entfernt` : ""}.${res.kept ? " Werte vom PC bitte am PC löschen." : ""}`
      : res.kept
        ? "Werte vom PC bitte am PC löschen."
        : "Keine Änderung.",
  );
  X.go("recovery");
}

/** Eingaben in den Formularen (ohne neu zu zeichnen); true = behandelt. */
export function logsInput(el) {
  const f = X.S.logEdit;
  const k = el.dataset?.lf;
  if (!f || !k) return false;
  if (f.kind === "vitals" && k.startsWith("v-")) f.draft.values[k.slice(2)] = el.value;
  else f.draft[k] = el.value;
  if (f.errors[k] || f.errors[k.slice(2)]) {
    delete f.errors[k];
    delete f.errors[k.slice(2)];
    el.removeAttribute("aria-invalid");
  }
  // Vorschau aktualisieren
  if (f.kind === "sleep") {
    const p = document.getElementById("lf-preview");
    if (p) p.innerHTML = sleepPreview(f.draft);
    const ph = document.getElementById("lf-phases");
    if (ph && PHASE_FIELD_SET.has(k)) ph.innerHTML = phasePreview(f.draft);
  } else if (f.kind === "naps") {
    const p = document.getElementById("lf-preview");
    const d = f.draft;
    const T = /^\d{2}:\d{2}$/;
    if (p) p.innerHTML = T.test(d.startTime) && T.test(d.endTime) && d.startTime !== d.endTime ? `Dauer: <strong>${dur(D.sleep.sleepMinutes(d.startTime, d.endTime))}</strong> – wird zur Schlafdauer dieses Tages addiert.` : "";
  } else if (f.kind === "vitals" && k === `v-${ANS_STATUS}`) {
    const a = document.getElementById("lf-ans");
    const n = el.value.trim() === "" ? null : Number(el.value.replace(",", "."));
    if (a) a.innerHTML = ansBar(n !== null && Number.isFinite(n) ? n : null, D.previousMean(vitalsHistory(buildDb()), f.draft.date));
  }
  return true;
}
const PHASE_FIELD_SET = new Set(Object.values(PHASE_FIELD));

/** Auswahlfelder (Zeitraum, Skala, Datum der ANS-Werte); true = behandelt. */
export function logsChange(el) {
  const S = X.S;
  const k = el.dataset?.logs;
  if (k) {
    if (k === "sleep-days") S.sleepDays = Number(el.value);
    else if (k === "sleep-period") S.sleepPeriod = el.value;
    else if (k === "recovery-days") S.recoveryDays = Number(el.value);
    else if (k === "recovery-scale") S.recoveryScale = el.value;
    X.rerender();
    return true;
  }
  const f = S.logEdit;
  if (f && el.dataset?.lf === "date" && f.kind === "vitals") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(el.value) && el.value <= today()) {
      S.logEdit = { ...f, draft: vitalsDraft(el.value), errors: {} };
      X.rerender();
    }
    return true;
  }
  if (f && el.dataset?.lf) {
    logsInput(el);
    return true;
  }
  return false;
}
