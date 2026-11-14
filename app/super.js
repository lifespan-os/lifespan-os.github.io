// LIFESPAN OS Mobil – Superhuman wie am PC (1.11.0): HRT (Hormongaben mit Präparat, Charge,
// Injektionsort und Kanüle erfassen, bearbeiten, löschen; Übersicht je Art), Wirkstoffspiegel
// (Modellrechnung mit Abgleich an Blutwerten aus Health), Wirkstoffrechner und Checkliste
// Injektion – wie HrtTab.tsx, HormoneLevelTab.tsx, DoseCalculatorTab.tsx und HrtChecklistTab.tsx.
// Protokoll, Auswertung und Substanzen (PEDs, Medikamente, Peptide) bleiben am PC.
// Logik: superdata.js (wie repo/hrt.rs). Änderungen gehen mit der Datei „Körperwerte“ an den PC.

import * as SD from "./superdata.js";
import * as H from "./healthdata.js";
import * as D from "./pcdomain.js";
import { today } from "./diary.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initSuper(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const HR = () => D.hrt;
const HL = () => D.hormoneLevel;
const DC = () => D.doseCalc;
const CL = () => D.hrtChecklist;

const TABS = [
  ["hrt", "HRT"],
  ["levels", "Wirkstoffspiegel"],
  ["calculator", "Wirkstoffrechner"],
  ["checklist", "Checkliste"],
];

const RANGES = [
  ["30", "Letzte 30 Tage"],
  ["90", "Letzte 90 Tage"],
  ["365", "Letztes Jahr"],
  ["all", "Alle Einträge"],
];

const CUSTOM = "__custom__";

/** Zahl ohne überflüssige Nachkommastellen (höchstens `max`), wie `fmt` am PC. */
function fmt(v, max = 3) {
  for (let d = 0; d <= max; d += 1) if (Math.abs(v * 10 ** d - Math.round(v * 10 ** d)) < 1e-9) return D.formatNumber(v, d);
  return D.formatNumber(v, max);
}

function numberToInput(value, maxDecimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const f = 10 ** maxDecimals;
  return String(Math.round(value * f) / f).replace(".", ",");
}

const positive = (t) => DC().positive(String(t ?? ""));

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

async function persist() {
  try {
    await X.store.set("super", X.S.super);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

const opts = () => ({ uuid: X.uuid, now: new Date() });
const entries = () => SD.hrtEntriesOf(X.S.catalog, X.S.super);
const products = () => SD.productsOf(X.S.catalog, X.S.super);

// ------------------------------------------------------------------ Hauptansicht

export function viewSuper() {
  const S = X.S;
  if (!S.catalog?.pc) {
    return `${X.header("Superhuman")}<main class="wrap"><section class="card"><p class="warn">Für Superhuman fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Settings „Neue Exportdatei laden“.</p></section></main>`;
  }
  const tab = S.superTab ?? "hrt";
  const pending = SD.unsentSuper(S.super);
  const body = tab === "levels" ? levelsTab() : tab === "calculator" ? calculatorTab() : tab === "checklist" ? checklistTab() : hrtTab();
  return `${X.header("Superhuman")}<main class="wrap">
    <p class="muted small">Hormongaben (HRT) mit Charge, Injektionsort und Präparat dokumentieren, den geschätzten Wirkstoffspiegel ansehen und umrechnen. Nur deine Einträge – ohne Bewertung und ohne Dosierungsempfehlung.</p>
    <nav class="tabs" aria-label="Superhuman">${TABS.map(
      ([v, l]) => `<button class="tab ${v === tab ? "active" : ""}" data-act="sh-tab" data-arg="${v}" ${v === tab ? 'aria-current="page"' : ""}>${l}</button>`,
    ).join("")}</nav>
    ${pending ? `<p class="muted small">${pending} ${pending === 1 ? "Änderung" : "Änderungen"} in Superhuman noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    ${body}
    <p class="muted small">Protokoll, Auswertung und Substanzen (PEDs, Medikamente, Peptide) gibt es bisher nur am PC.</p>
  </main>`;
}

// ------------------------------------------------------------------ HRT

function fromFor(range, t) {
  if (range === "all") return null;
  return D.trends.shiftDays(t, -(Number(range) - 1));
}

function hrtTab() {
  const S = X.S;
  const t = today();
  const all = entries();
  const range = S.hrtRange ?? "90";
  const from = fromFor(range, t);
  const shown = from ? all.filter((e) => e.date >= from) : all;
  const summary = HR().summarizeHrt(all, t);
  const sites = HR().recentSites(all);
  const routeLabel = (r) => (r ? D.ROUTE_LABELS[r] ?? r : "–");
  return `<section class="card">
      <div class="wo-head"><h3>HRT</h3><button class="btn sm primary" data-act="hrt-new">+ Hormongabe erfassen</button></div>
      ${all.length ? "" : `<p class="muted">Noch keine HRT-Einträge.</p>`}
    </section>
    ${
      summary.length
        ? `<section class="card"><h3>Übersicht je Art</h3>
      <ul class="hrt-summary">${summary
        .map(
          (s) => `<li><strong>${esc(s.hormone)}</strong>${s.first ? ` <span class="muted small">seit ${esc(D.formatDate(s.first))}</span>` : ""}
        <dl>
          <div><dt>Gaben</dt><dd>${s.taken}${s.missed ? ` · ${s.missed} ausgelassen` : ""}</dd></div>
          <div><dt>Summe</dt><dd>${s.totals.length ? s.totals.map(([u, v]) => `${esc(fmt(v))} ${esc(u)}`).join(" · ") : "–"}</dd></div>
          <div><dt>Letzte Gabe</dt><dd>${s.daysSinceLast === null ? "–" : s.daysSinceLast === 0 ? "heute" : `vor ${s.daysSinceLast} ${s.daysSinceLast === 1 ? "Tag" : "Tagen"}`}</dd></div>
          <div><dt>Ø Abstand</dt><dd>${s.meanIntervalDays === null ? "–" : `${esc(D.formatNumber(s.meanIntervalDays, 1))} Tage`}</dd></div>
          <div><dt>Letzte Charge</dt><dd>${esc(s.lastBatch ?? "–")}</dd></div>
        </dl></li>`,
        )
        .join("")}</ul>
      ${sites.length ? `<p class="muted small">Zuletzt verwendete Orte: ${sites.map((s) => `${esc(s.site)} (${esc(D.formatDate(s.date))})`).join(" · ")}</p>` : ""}
      <p class="muted small">Zählungen und Summen deiner durchgeführten Gaben; Ø Abstand = mittlerer Abstand zwischen aufeinanderfolgenden Gabetagen. Keine Bewertung.</p>
    </section>`
        : ""
    }
    ${
      all.length
        ? `<section class="card">
      <div class="wo-head"><h3>HRT-Protokoll</h3>
        <select data-super="range" aria-label="Zeitraum">${RANGES.map(([v, l]) => `<option value="${v}" ${v === range ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      ${
        shown.length
          ? `<ul class="hrt-log">${shown
              .map(
                (e) => `<li class="${e.status === "missed" ? "is-missed" : ""}">
          <div class="hrt-log__head"><strong>${esc(D.formatDate(e.date))}${e.time ? ` · ${esc(e.time)} Uhr` : ""}</strong>
            <span>${esc(fmt(e.amount))} ${esc(e.unit)}${e.status === "missed" ? ` <span class="tag">ausgelassen</span>` : ""}</span></div>
          <div>${esc(e.hormone)}${e.concentrationMgMl !== null ? ` <span class="muted small">· ${esc(fmt(e.concentrationMgMl))} mg/ml</span>` : ""}${e.volumeMl !== null ? ` <span class="muted small">· ${esc(D.formatNumber(e.volumeMl, 2))} ml injiziert</span>` : ""}</div>
          <div class="muted small">${[routeLabel(e.route), e.site, e.needle ? `Kanüle ${e.needle}` : null].filter((x) => x && x !== "–").map(esc).join(" · ") || "–"}</div>
          <div class="muted small">${[e.manufacturer, e.batch ? `Ch.-B. ${e.batch}` : null, e.expiryDate ? `verw. bis ${D.formatDate(e.expiryDate)}` : null].filter(Boolean).map(esc).join(" · ")}</div>
          ${e.notes ? `<div class="small">${esc(e.notes)}</div>` : ""}
          ${e.reaction ? `<div class="muted small">Beobachtung: ${esc(e.reaction)}</div>` : ""}
          ${e.prescription ? `<div class="muted small">Verordnung: ${esc(e.prescription)}</div>` : ""}
          <div class="row-actions"><button class="btn sm" data-act="hrt-edit" data-arg="${esc(e.id)}">Bearbeiten</button><button class="btn sm danger" data-act="hrt-delete" data-arg="${esc(e.id)}">Löschen</button></div>
        </li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">In diesem Zeitraum gibt es keine Einträge.</p>`
      }
    </section>`
        : ""
    }`;
}

// ------------------------------------------------------------------ HRT-Formular

function field(k, label, value, { type = "text", unit = "", hint = "", mode = "", list = "", placeholder = "", disabled = false, error = "" } = {}) {
  return `<div class="field ${error ? "has-error" : ""}"><label for="hf-${k}">${esc(label)}</label>
    <div class="input-row"><input id="hf-${k}" type="${type}" data-hrt="${k}" value="${esc(value)}" ${mode ? `inputmode="${mode}"` : ""} ${list ? `list="${list}"` : ""} ${placeholder ? `placeholder="${esc(placeholder)}"` : ""} ${disabled ? "disabled" : ""} autocomplete="off">${unit ? `<span class="unit">${esc(unit)}</span>` : ""}</div>
    ${error ? `<p class="field-error">${esc(error)}</p>` : hint ? `<p class="muted small">${esc(hint)}</p>` : ""}</div>`;
}

function select(k, label, value, options, error = "") {
  return `<div class="field ${error ? "has-error" : ""}"><label for="hf-${k}">${esc(label)}</label>
    <select id="hf-${k}" data-hrt="${k}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
    ${error ? `<p class="field-error">${esc(error)}</p>` : ""}</div>`;
}

function textarea(k, label, value, hint = "", error = "") {
  return `<div class="field ${error ? "has-error" : ""}"><label for="hf-${k}">${esc(label)}</label><textarea id="hf-${k}" data-hrt="${k}" rows="2">${esc(value)}</textarea>
    ${error ? `<p class="field-error">${esc(error)}</p>` : hint ? `<p class="muted small">${esc(hint)}</p>` : ""}</div>`;
}

function newForm(draft) {
  const all = entries();
  const siteOptions = [...new Set([...all.flatMap((e) => (e.site ? [e.site.trim()] : [])), ...HR().SITE_SUGGESTIONS])];
  const needles = HR().needleOptions(all);
  return {
    draft,
    errors: {},
    message: "",
    productNote: null,
    dupes: null,
    customSite: draft.site.trim() !== "" && !siteOptions.includes(draft.site.trim()),
    customNeedle: needles.length === 0 || (draft.needle.trim() !== "" && !needles.includes(draft.needle.trim())),
  };
}

export function viewHrtEdit() {
  const f = X.S.hrtEdit;
  if (!f) return viewSuper();
  const d = f.draft;
  const e = f.errors ?? {};
  const all = entries();
  const prods = products();
  const match = HR().matchingProduct(d, prods);
  const computed = HR().computedAmount(d);
  const expiry = HR().expiryNote(d.date, d.expiryDate);
  const canPrefill = !d.id && HR().prefillFromLast(d, all) !== d;
  const vialMg = HR().doseFromVolume(positive(d.concentrationMgMl), positive(d.vialVolumeMl));
  const siteOptions = [...new Set([...all.flatMap((x) => (x.site ? [x.site.trim()] : [])), ...HR().SITE_SUGGESTIONS])];
  const needles = HR().needleOptions(all);
  const hormones = [...new Set([...prods.map((p) => p.hormone), ...all.map((x) => x.hormone), ...HR().HORMONE_SUGGESTIONS])];
  const makers = [...new Set([...prods.flatMap((p) => (p.manufacturer ? [p.manufacturer] : [])), ...all.flatMap((x) => (x.manufacturer ? [x.manufacturer] : []))])];
  const routeOpts = [["", "Keine Angabe"], ...Object.entries(D.ROUTE_LABELS)];
  return `${X.header(d.id ? "HRT-Eintrag bearbeiten" : "Hormongabe erfassen", { back: "super" })}<main class="wrap">
    <datalist id="hrt-hormones">${hormones.map((h) => `<option value="${esc(h)}">`).join("")}</datalist>
    <datalist id="hrt-makers">${makers.map((m) => `<option value="${esc(m)}">`).join("")}</datalist>
    <section class="card">
      <h3>Präparat und Nachweis</h3>
      <div class="field"><label for="hf-product">Gespeichertes Präparat</label>
        <select id="hf-product" data-hrt="product"><option value="">${prods.length ? "Präparat wählen …" : "Noch keine Präparate gespeichert"}</option>${prods
          .map((p) => `<option value="${esc(p.id)}" ${match?.id === p.id ? "selected" : ""}>${esc(HR().productLabel(p))}</option>`)
          .join("")}</select></div>
      <div class="row-actions">
        <button class="btn sm" data-act="hrt-product-save">${match ? "Präparat aktualisieren" : "Als Präparat speichern"}</button>
        ${match ? `<button class="btn sm danger" data-act="hrt-product-delete" data-arg="${esc(match.id)}">Präparat löschen</button>` : ""}
      </div>
      ${f.productNote ? `<p class="${f.productNote.tone === "error" ? "field-error" : "muted small"}">${esc(f.productNote.text)}</p>` : ""}
      ${field("manufacturer", "Hersteller (optional)", d.manufacturer, { list: "hrt-makers", error: e.manufacturer })}
      ${field("hormone", "Art (Hormon bzw. Präparat)", d.hormone, { list: "hrt-hormones", placeholder: "z. B. Testosteron Enantat", error: e.hormone })}
      ${field("batch", "Charge (optional)", d.batch, { placeholder: "Ch.-B. laut Packung", error: e.batch })}
      <div class="lab-row__grid">
        ${field("vialVolumeMl", "Ampullenvolumen (optional)", d.vialVolumeMl, { unit: "ml", mode: "decimal", error: e.vialVolumeMl })}
        ${field("concentrationMgMl", "Wirkstoffkonzentration", d.concentrationMgMl, { unit: "mg/ml", mode: "decimal", error: e.concentrationMgMl })}
      </div>
      ${field("expiryDate", "Verfallsdatum (optional)", d.expiryDate, { type: "date", hint: expiry ?? "", error: e.expiryDate })}
      ${field("prescription", "Verordnung (optional)", d.prescription, { placeholder: "z. B. Praxis, Rezept vom …", error: e.prescription })}
      ${vialMg !== null ? `<p class="muted small">Inhalt der Ampulle: ${esc(D.formatNumber(positive(d.vialVolumeMl) ?? 0, 2))} ml × ${esc(fmt(positive(d.concentrationMgMl) ?? 0))} mg/ml = ${esc(fmt(vialMg))} mg Wirkstoff.</p>` : ""}
      ${canPrefill ? `<p class="small"><button class="linkbtn" data-act="hrt-prefill">Angaben der letzten Gabe „${esc(d.hormone.trim())}“ übernehmen</button> <span class="muted">(Präparat, Injektionsvolumen, Anwendung, Kanüle, Verordnung)</span></p>` : ""}
    </section>
    <section class="card">
      <h3>Gabe</h3>
      <div class="lab-row__grid">
        ${field("date", "Datum", d.date, { type: "date", error: e.date })}
        ${field("time", "Uhrzeit (optional)", d.time, { type: "time", error: e.time })}
      </div>
      ${select("status", "Status", d.status, Object.entries(HR().STATUS_LABELS), e.status)}
      <div class="lab-row__grid">
        ${field("volumeMl", "Injektionsvolumen", d.volumeMl, { unit: "ml", mode: "decimal", placeholder: "0,00", hint: "2 Stellen, z. B. 0,45", error: e.volumeMl })}
        ${field("amount", "Wirkstoffmenge", computed !== null ? numberToInput(computed, 3) : d.amount, { unit: d.unit, mode: "decimal", disabled: computed !== null, error: e.amount })}
      </div>
      <p class="muted small">${
        computed !== null
          ? `Wirkstoffmenge berechnet: ${esc(D.formatNumber(positive(d.volumeMl) ?? 0, 2))} ml × ${esc(fmt(positive(d.concentrationMgMl) ?? 0))} mg/ml.`
          : d.unit === "mg"
            ? "Die Wirkstoffmenge wird berechnet, sobald Injektionsvolumen und Wirkstoffkonzentration eingetragen sind – sonst von Hand."
            : ""
      }</p>
    </section>
    <section class="card">
      <h3>Anwendung</h3>
      ${select("route", "Anwendung (optional)", d.route, routeOpts, e.route)}
      ${select("siteSelect", "Injektionsort (optional)", f.customSite ? CUSTOM : d.site, [["", "Keine Angabe"], ...siteOptions.map((o) => [o, o]), [CUSTOM, "Anderer Ort …"]], f.customSite ? "" : e.site)}
      ${f.customSite ? field("site", "Anderer Injektionsort", d.site, { placeholder: "z. B. Gesäß links", error: e.site }) : ""}
      ${needles.length ? select("needleSelect", "Kanüle (optional)", f.customNeedle ? CUSTOM : d.needle.trim(), [["", "Keine Angabe"], ...needles.map((n) => [n, n]), [CUSTOM, "Andere Kanüle …"]], f.customNeedle ? "" : e.needle) : ""}
      ${f.customNeedle ? field("needle", needles.length ? "Andere Kanüle" : "Kanüle (optional)", d.needle, { placeholder: "z. B. 25G 1″", hint: "Wird mit der Gabe gespeichert und steht beim nächsten Mal zur Auswahl.", error: e.needle }) : ""}
      ${textarea("reaction", "Beobachtungen (optional)", d.reaction, "Frei beschrieben, z. B. an der Einstichstelle – die App bewertet nichts.", e.reaction)}
      ${textarea("notes", "Notiz (optional)", d.notes, "", e.notes)}
      ${f.message ? `<p class="field-error">${esc(f.message)}</p>` : ""}
      ${
        f.dupes
          ? `<div class="warn">${esc(f.dupes)}<div class="row-actions"><button class="btn primary" data-act="hrt-save" data-arg="confirmed">Trotzdem speichern</button><button class="btn" data-act="hrt-dupe-cancel">Zurück</button></div></div>`
          : `<div class="row-actions"><button class="btn primary" data-act="hrt-save">${d.id ? "Änderung speichern" : "Eintrag speichern"}</button><button class="btn" data-go="super">Abbrechen</button></div>`
      }
    </section>
  </main>`;
}

// ------------------------------------------------------------------ Wirkstoffspiegel

const DAY = 86400000;

function sinceText(fromMs, nowMs) {
  const days = (nowMs - fromMs) / DAY;
  if (days < 1) return `vor ${D.formatNumber(days * 24, 0)} Std.`;
  return `vor ${D.formatNumber(days, 1)} Tagen`;
}

function durationText(days) {
  return days < 1 ? `${D.formatNumber(days * 24, 0)} Std.` : `${D.formatNumber(days, 1)} Tage`;
}

function ignoredText(ignored) {
  const counts = new Map();
  for (const i of ignored) counts.set(i.reason, (counts.get(i.reason) ?? 0) + 1);
  return [...counts.entries()].map(([r, n]) => `${n} × ${HL().IGNORE_LABELS[r]}`).join(", ");
}

function levelChart(series) {
  const W = 340;
  const Hh = 180;
  const L = 34;
  const R = 8;
  const T = 10;
  const B = 22;
  const x = (ms) => L + ((ms - series.fromMs) / (series.toMs - series.fromMs)) * (W - L - R);
  const y = (p) => T + (1 - p / 100) * (Hh - T - B);
  const past = series.points.filter((p) => p.atMs <= series.nowMs);
  const future = series.points.filter((p) => p.atMs >= series.nowMs);
  const line = (list) => list.map((p) => `${x(p.atMs).toFixed(1)},${y(p.percent).toFixed(1)}`).join(" ");
  const short = (ms) => D.formatDate(new Date(ms).toISOString().slice(0, 10)).slice(0, 6);
  return `<svg class="pc-chart level-chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Verlauf Wirkstoffspiegel in Prozent vom Höchstwert">
    ${[0, 50, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v} %</text>`).join("")}
    <line x1="${x(series.nowMs).toFixed(1)}" x2="${x(series.nowMs).toFixed(1)}" y1="${T}" y2="${Hh - B}" class="level-now"/>
    <text x="${x(series.nowMs).toFixed(1)}" y="${T + 8}" text-anchor="middle" class="level-now__label">jetzt</text>
    ${past.length > 1 ? `<polyline points="${line(past)}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round"/>` : ""}
    ${future.length > 1 ? `<polyline points="${line(future)}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-dasharray="4 4" stroke-opacity=".6"/>` : ""}
    ${series.doses.map((d) => `<circle cx="${x(d.event.atMs).toFixed(1)}" cy="${y(d.percent).toFixed(1)}" r="3.5" fill="var(--orange)"><title>Gabe ${esc(D.formatDate(new Date(d.event.atMs).toISOString().slice(0, 10)))}</title></circle>`).join("")}
    <text x="${L}" y="${Hh - 6}" text-anchor="start">${esc(short(series.fromMs))}</text>
    <text x="${W - R}" y="${Hh - 6}" text-anchor="end">${esc(short(series.toMs))}</text>
  </svg>`;
}

function levelsTab() {
  const S = X.S;
  const { events, ignored } = HL().dosesFromHrt(entries());
  const available = HL().measurandsOf(events);
  const measurand = available.includes(S.levelMeasurand) ? S.levelMeasurand : (available[0] ?? null);
  const rangeDays = S.levelRange ?? 90;
  if (!measurand) {
    return `<section class="card"><h3>Noch kein Verlauf</h3><p class="muted">Der Wirkstoffspiegel wird aus deinen durchgeführten Gaben im Reiter „HRT“ gerechnet. Trage dort eine Gabe ein, z. B. Testosteron Enantat in mg.</p>
      ${ignored.length ? `<p class="muted small">Nicht berücksichtigt: ${esc(ignoredText(ignored))}.</p>` : ""}</section>`;
  }
  const nowMs = HL().nowWallClockMs();
  const series = HL().levelSeries(events, measurand, nowMs, rangeDays);
  const draws = H.drawsOf(S.catalog, S.health);
  const cal = D.lab.calibrateLevel(events, measurand, draws, nowMs);
  const last = HL().lastDose(events, measurand, nowMs);
  const subs = HL().substancesIn(events, measurand);
  const seg = (items, cur, act) =>
    `<div class="segmented" role="group">${items.map(([v, l]) => `<button class="${String(v) === String(cur) ? "is-active" : ""}" aria-pressed="${String(v) === String(cur)}" data-act="${act}" data-arg="${v}">${esc(l)}</button>`).join("")}</div>`;
  const label = HL().MEASURAND_LABELS[measurand];
  return `<section class="card">
      <div class="wo-head"><h3>Wirkstoffspiegel</h3><span class="tag">Modellrechnung</span></div>
      ${available.length > 1 ? seg(available.map((m) => [m, HL().MEASURAND_LABELS[m]]), measurand, "level-measurand") : ""}
      ${seg([[14, "2 Wochen"], [90, "3 Monate"], [365, "1 Jahr"]], rangeDays, "level-range")}
      <div class="level-metrics">
        <div><span class="muted small">${esc(label)} jetzt, vom Höchstwert im Zeitraum</span><strong class="level-big">${series.nowPercent === null ? "–" : esc(D.formatNumber(series.nowPercent, 0))} %</strong></div>
        ${last ? `<div><span class="muted small">Letzte Gabe · ${esc(D.formatDate(new Date(last.atMs).toISOString().slice(0, 10)))}</span><strong>${esc(sinceText(last.atMs, nowMs))}</strong></div>` : ""}
        <div><span class="muted small">Gaben im Zeitraum</span><strong>${series.doses.length}</strong></div>
        ${cal ? `<div><span class="muted small">geschätzt jetzt, angepasst an ${cal.rows.length} ${cal.rows.length === 1 ? "Blutwert" : "Blutwerte"}</span><strong>${esc(D.lab.formatLabNumber(Math.round(cal.nowEstimate * 100) / 100))} ${esc(cal.unit)}</strong></div>` : ""}
      </div>
      ${levelChart(series)}
      <p class="muted small"><span class="level-key level-key--line"></span> bisher · <span class="level-key level-key--forecast"></span> Fortsetzung ohne weitere Gaben · <span class="level-key level-key--dot"></span> Gabe</p>
      <p class="muted small">Modellrechnung aus deinen Einträgen im Reiter „HRT“ – keine Messung, keine Bewertung. Ohne Blutwerte zeigt der Verlauf nur das Verhältnis zum Höchstwert im gewählten Zeitraum.${cal ? " Mit Blutwerten aus Health wird zusätzlich ein Schätzwert in deren Einheit gezeigt (Grundspiegel + Faktor × Modell)." : " Blutwerte aus Health (Parameter mit Verknüpfung zum Wirkstoffspiegel) ergänzen einen Schätzwert in echten Einheiten."}${ignored.length ? ` Nicht berücksichtigt: ${esc(ignoredText(ignored))}.` : ""}</p>
    </section>
    ${
      cal
        ? `<section class="card"><div class="wo-head"><h3>Abgleich mit Blutwerten</h3><span class="tag">Health · ${esc(cal.unit)}</span></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Blutabnahme</th><th class="tnum">gemessen</th><th class="tnum">Modell (angepasst)</th></tr></thead><tbody>
      ${cal.rows.map((r) => `<tr><td>${esc(D.formatDate(r.date))}${r.time ? ` <span class="muted small">${esc(r.time)}</span>` : ""}</td><td class="tnum">${esc(D.lab.formatLabNumber(r.measured))}</td><td class="tnum">${esc(D.lab.formatLabNumber(Math.round(r.estimated * 100) / 100))}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted small">Das Modell wird an die gemessenen Werte angepasst (ein Wert: nur Faktor; ab zwei Werten zusätzlich ein Grundspiegel). Trotzdem eine Schätzung, keine Messung.</p></section>`
        : ""
    }
    <section class="card"><div class="wo-head"><h3>Gerechnet mit</h3><span class="tag">Richtwerte</span></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Art</th><th class="tnum">Wirkstoffanteil</th><th class="tnum">Höchstwert nach</th><th class="tnum">Halbwertszeit</th></tr></thead><tbody>
      ${subs.map((s) => `<tr><td>${esc(s.name)}${s.note ? `<br><span class="muted small">${esc(s.note)}</span>` : ""}</td><td class="tnum">${esc(D.formatNumber(s.esterFraction * s.bioavailability * 100, 0))} %</td><td class="tnum">${esc(durationText(s.tmaxDays))}</td><td class="tnum">${esc(durationText(s.halfLifeDays))}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted small">Werte aus Fachinformationen und Literatur; sie schwanken von Person zu Person deutlich. Der Wirkstoffanteil berücksichtigt den Ester und, wo nötig, die Aufnahme ins Blut.</p>
    </section>`;
}

// ------------------------------------------------------------------ Wirkstoffrechner

let rowCounter = 0;
const newRow = (name = "", mgPerMl = "") => ({ key: `c${(rowCounter += 1)}`, name, mgPerMl });

function calcState() {
  const S = X.S;
  if (!S.calc) S.calc = { rows: [newRow()], volume: "", target: "", weekMode: "weekly", perInjection: "", weeklyTarget: "", intervalDays: "", vial: "", powderMg: "", solventMl: "" };
  return S.calc;
}

function intervalText(days) {
  const hours = Math.round(days * 24 * 10) / 10;
  return `${fmt(days, 2)} ${days === 1 ? "Tag" : "Tage"}${Number.isInteger(days) ? "" : ` (${fmt(hours, 1)} Stunden)`}`;
}

function calcInput(k, label, value, unit, placeholder = "") {
  return `<div class="field"><label for="calc-${k}">${esc(label)}</label><div class="input-row"><input id="calc-${k}" type="text" inputmode="decimal" data-calc="${k}" value="${esc(value)}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ""} autocomplete="off"><span class="unit">${esc(unit)}</span></div></div>`;
}

function calculatorTab() {
  const c = calcState();
  const prods = products();
  const ingredients = c.rows.flatMap((r) => {
    const v = positive(r.mgPerMl);
    return v === null ? [] : [{ name: r.name.trim() || "Wirkstoff", mgPerMl: v }];
  });
  const total = DC().totalConcentration(ingredients);
  const volumeMl = positive(c.volume);
  const amounts = ingredients.length && volumeMl !== null ? DC().amountsForVolume(ingredients, volumeMl) : null;
  const targetMg = positive(c.target);
  const neededMl = ingredients.length && targetMg !== null ? DC().volumeForAmount(ingredients, targetMg) : null;
  const vialMl = positive(c.vial);
  const vialContent = ingredients.length && vialMl !== null ? DC().amountsForVolume(ingredients, vialMl) : null;
  const perVial = vialMl !== null && volumeMl !== null ? DC().dosesPerVial(vialMl, volumeMl) : null;
  const perInj = positive(c.perInjection);
  const interval = positive(c.intervalDays);
  const weeklyMg = positive(c.weeklyTarget);
  const wm = c.weekMode;
  const week =
    wm === "weekly"
      ? perInj !== null && interval !== null ? { weekly: DC().weeklyDose(perInj, interval), perInj, interval } : null
      : wm === "interval"
        ? perInj !== null && weeklyMg !== null ? { weekly: weeklyMg, perInj, interval: DC().intervalForWeeklyDose(perInj, weeklyMg) } : null
        : weeklyMg !== null && interval !== null ? { weekly: weeklyMg, perInj: DC().perInjectionForWeeklyDose(weeklyMg, interval), interval } : null;
  const mlFor = (mg) => (mg !== null && total > 0 ? mg / total : null);
  const pm = positive(c.powderMg);
  const sm = positive(c.solventMl);
  const powderConc = pm !== null && sm !== null ? DC().concentrationFromPowder(pm, sm) : null;
  const modes = [
    ["weekly", "Wochendosis aus Intervall"],
    ["interval", "Intervall aus Wochendosis"],
    ["perInjection", "Menge je Injektion"],
  ];
  return `<section class="card">
      <h3>Wirkstoffe der Lösung</h3>
      <p class="muted small">Konzentration je Wirkstoff in mg je ml – bei Mischungen mehrere Zeilen. Ein gespeichertes Präparat aus dem Reiter „HRT“ lässt sich übernehmen.</p>
      ${prods.length ? `<div class="field"><label for="calc-product">Gespeichertes Präparat übernehmen</label><select id="calc-product" data-calc="product"><option value="">Präparat wählen …</option>${prods.map((p) => `<option value="${esc(p.id)}">${esc(HR().productLabel(p) + (p.concentrationMgMl !== null ? ` – ${fmt(p.concentrationMgMl)} mg/ml` : " – ohne Konzentration"))}</option>`).join("")}</select></div>` : ""}
      ${c.rows
        .map(
          (r, i) => `<div class="calc-row">
        <div class="field"><label>Wirkstoff ${i + 1} (optional)</label><input id="calc-${r.key}-name" type="text" data-calcrow="${r.key}" data-f="name" value="${esc(r.name)}" placeholder="z. B. Testosteron Enantat" autocomplete="off"></div>
        <div class="field"><label>Konzentration</label><div class="input-row"><input id="calc-${r.key}-conc" type="text" inputmode="decimal" data-calcrow="${r.key}" data-f="mgPerMl" value="${esc(r.mgPerMl)}" autocomplete="off"><span class="unit">mg/ml</span></div></div>
        <button class="btn sm" data-act="calc-row-remove" data-arg="${r.key}" aria-label="Wirkstoff ${i + 1} entfernen">✕</button>
      </div>`,
        )
        .join("")}
      <div class="row-actions"><button class="btn sm" data-act="calc-row-add">+ Wirkstoff hinzufügen</button></div>
      ${ingredients.length > 1 ? `<p class="muted small">Gesamtkonzentration: ${esc(fmt(total))} mg je ml.</p>` : ""}
    </section>
    <section class="card"><h3>Wirkstoffmenge aus Volumen</h3>
      ${calcInput("volume", "Menge der Lösung", c.volume, "ml", "z. B. 0,5")}
      ${
        amounts
          ? `<table class="data-table"><tbody>
        ${amounts.items.length > 1 ? amounts.items.map((it) => `<tr><td>${esc(it.name)}</td><td class="tnum">${esc(fmt(it.mg))} mg</td></tr>`).join("") : ""}
        <tr class="calc-total"><td>${esc(amounts.items.length > 1 ? "Summe Wirkstoff" : (amounts.items[0]?.name ?? "Wirkstoff"))}</td><td class="tnum">${esc(fmt(amounts.totalMg))} mg</td></tr>
        <tr><td>U-100-Insulinspritze</td><td class="tnum">${esc(fmt(DC().insulinUnits(volumeMl ?? 0), 1))} Einheiten</td></tr></tbody></table>`
          : `<p class="muted small">Konzentration oben und Menge der Lösung eintragen.</p>`
      }
    </section>
    <section class="card"><h3>Volumen für eine Wirkstoffmenge</h3>
      ${calcInput("target", ingredients.length > 1 ? "Gewünschte Wirkstoffmenge (Summe)" : "Gewünschte Wirkstoffmenge", c.target, "mg")}
      ${neededMl !== null ? `<p>${esc(fmt(targetMg ?? 0))} mg ÷ ${esc(fmt(total))} mg/ml = <strong>${esc(D.formatNumber(neededMl, 2))} ml</strong> <span class="muted small">(${esc(fmt(neededMl))} ml · ${esc(fmt(DC().insulinUnits(neededMl), 1))} Einheiten auf einer U-100-Insulinspritze)</span></p>` : `<p class="muted small">Konzentration oben und gewünschte Wirkstoffmenge eintragen.</p>`}
    </section>
    <section class="card"><h3>Wochendosis und Injektionsintervall</h3>
      <p class="muted small">Wochendosis = Wirkstoffmenge je Injektion × 7 ÷ Intervall (alle X Tage). Mit einer Konzentration oben wird zusätzlich das Volumen angezeigt.</p>
      <div class="segmented" role="radiogroup">${modes.map(([v, l]) => `<button role="radio" aria-checked="${v === wm}" class="${v === wm ? "is-active" : ""}" data-act="calc-mode" data-arg="${v}">${l}</button>`).join("")}</div>
      ${wm !== "perInjection" ? calcInput("perInjection", "Wirkstoffmenge je Injektion", c.perInjection, "mg") : ""}
      ${wm !== "weekly" ? calcInput("weeklyTarget", "Gewünschte Wochendosis", c.weeklyTarget, "mg") : ""}
      ${wm !== "interval" ? calcInput("intervalDays", "Injektion alle", c.intervalDays, "Tage", "z. B. 3,5") : ""}
      ${wm !== "perInjection" && amounts ? `<p class="small"><button class="linkbtn" data-act="calc-take" data-arg="${esc(numberToInput(amounts.totalMg, 3))}">${esc(fmt(amounts.totalMg))} mg aus „Wirkstoffmenge aus Volumen“ übernehmen</button></p>` : ""}
      ${
        week && week.weekly !== null && week.perInj !== null && week.interval !== null
          ? `<table class="data-table"><tbody>
        <tr class="${wm === "weekly" ? "calc-total" : ""}"><td>Wochendosis</td><td class="tnum">${esc(fmt(week.weekly))} mg${mlFor(week.weekly) !== null ? `<br><span class="muted small">${esc(D.formatNumber(mlFor(week.weekly), 2))} ml je Woche</span>` : ""}</td></tr>
        <tr class="${wm === "perInjection" ? "calc-total" : ""}"><td>Je Injektion</td><td class="tnum">${esc(fmt(week.perInj))} mg${mlFor(week.perInj) !== null ? `<br><span class="muted small">${esc(D.formatNumber(mlFor(week.perInj), 2))} ml · ${esc(fmt(DC().insulinUnits(mlFor(week.perInj)), 1))} Einheiten U-100</span>` : ""}</td></tr>
        <tr class="${wm === "interval" ? "calc-total" : ""}"><td>Intervall</td><td class="tnum">alle ${esc(intervalText(week.interval))}</td></tr>
        <tr><td>Injektionen je Woche</td><td class="tnum">${esc(fmt(DC().injectionsPerWeek(week.interval) ?? 0, 2))}</td></tr></tbody></table>`
          : `<p class="muted small">${wm === "weekly" ? "Wirkstoffmenge je Injektion und Intervall eintragen." : wm === "interval" ? "Gewünschte Wochendosis und Wirkstoffmenge je Injektion eintragen." : "Gewünschte Wochendosis und Intervall eintragen."}</p>`
      }
    </section>
    <section class="card"><h3>Inhalt einer Ampulle</h3>
      ${calcInput("vial", "Ampullenvolumen", c.vial, "ml")}
      ${
        vialContent
          ? `<p>Wirkstoff in der Ampulle: <strong>${esc(fmt(vialContent.totalMg))} mg</strong>${vialContent.items.length > 1 ? ` <span class="muted small">(${vialContent.items.map((it) => `${esc(it.name)} ${esc(fmt(it.mg))} mg`).join(" · ")})</span>` : ""}
        ${perVial ? `<br>Bei ${esc(fmt(volumeMl ?? 0))} ml je Gabe: ${perVial.doses} ${perVial.doses === 1 ? "ganze Gabe" : "ganze Gaben"}${perVial.restMl > 0 ? `, Rest ${esc(fmt(perVial.restMl))} ml` : ""}.` : ""}</p>`
          : `<p class="muted small">Konzentration oben und Ampullenvolumen eintragen.</p>`
      }
    </section>
    <section class="card"><h3>Pulver auflösen</h3>
      <p class="muted small">Konzentration nach dem Auflösen = Pulvermenge ÷ Lösungsmittel.</p>
      <div class="lab-row__grid">${calcInput("powderMg", "Pulvermenge (Wirkstoff)", c.powderMg, "mg")}${calcInput("solventMl", "Lösungsmittel", c.solventMl, "ml")}</div>
      ${powderConc !== null ? `<p>Konzentration: <strong>${esc(fmt(powderConc))} mg je ml</strong> <button class="linkbtn" data-act="calc-powder-take" data-arg="${esc(numberToInput(powderConc, 3))}">Als Konzentration oben übernehmen</button></p>` : ""}
    </section>
    <p class="muted small">Reiner Rechner: Es wird nichts gespeichert und nichts empfohlen. Ergebnisse auf 0,001 gerundet (Volumen zusätzlich auf 0,01 ml); U-100: 100 Einheiten = 1 ml.</p>`;
}

// ------------------------------------------------------------------ Checkliste

function checklistTab() {
  const S = X.S;
  const list = SD.checklistOf(S.catalog, S.super);
  const anyDone = CL().CHECKLIST_SECTIONS.some((s) => list[s.id].some((i) => i.done));
  const editing = S.chkEdit ?? null;
  const item = S.chkItem ?? null;
  const sections = CL()
    .CHECKLIST_SECTIONS.map((s) => {
      const items = list[s.id];
      const p = CL().progress(items);
      const isEdit = editing === s.id;
      return `<section class="card hrt-check">
      <div class="wo-head"><h3>${esc(s.title)}</h3><span class="tag">${p.done}/${p.total}</span></div>
      <p class="muted small">${esc(s.intro)}</p>
      ${items.length ? "" : `<p class="muted small">Keine Punkte. Über „Bearbeiten“ hinzufügen.</p>`}
      <ul class="hrt-check__list">${items
        .map((it, i) => {
          if (item && item.section === s.id && item.id === it.id) {
            return `<li class="is-editing"><input type="text" data-chk="edit" value="${esc(item.text)}" maxlength="${CL().ITEM_MAX_LENGTH}" aria-label="Punkt bearbeiten">
            <div class="row-actions"><button class="btn sm primary" data-act="chk-edit-save">Speichern</button><button class="btn sm" data-act="chk-edit-cancel">Abbrechen</button></div></li>`;
          }
          return `<li class="${it.done ? "is-done" : ""}"><label class="hrt-check__item"><input type="checkbox" data-chk="toggle" data-section="${s.id}" data-id="${esc(it.id)}" ${it.done ? "checked" : ""}><span>${esc(it.text)}</span></label>
          ${
            isEdit
              ? `<div class="row-actions">
            <button class="btn sm" data-act="chk-edit" data-arg="${s.id}|${esc(it.id)}">Bearbeiten</button>
            <button class="btn sm" data-act="chk-move" data-arg="${s.id}|${esc(it.id)}|-1" ${i === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button>
            <button class="btn sm" data-act="chk-move" data-arg="${s.id}|${esc(it.id)}|1" ${i === items.length - 1 ? "disabled" : ""} aria-label="Nach unten">↓</button>
            <button class="btn sm danger" data-act="chk-remove" data-arg="${s.id}|${esc(it.id)}">Löschen</button></div>`
              : ""
          }</li>`;
        })
        .join("")}</ul>
      ${isEdit ? `<div class="row-actions"><input type="text" data-chk="new" value="${esc(S.chkNew ?? "")}" maxlength="${CL().ITEM_MAX_LENGTH}" placeholder="Neuer Punkt" aria-label="Neuer Punkt in ${esc(s.title)}"><button class="btn sm" data-act="chk-add" data-arg="${s.id}">+ Hinzufügen</button></div>` : ""}
      <div class="row-actions">
        <button class="linkbtn" data-act="chk-editmode" data-arg="${s.id}">${isEdit ? "Bearbeiten beenden" : "Bearbeiten"}</button>
        ${p.done ? `<button class="linkbtn" data-act="chk-reset" data-arg="${s.id}">Häkchen zurücksetzen</button>` : ""}
        ${isEdit ? `<button class="linkbtn danger" data-act="chk-template" data-arg="${s.id}">Vorlage wiederherstellen</button>` : ""}
      </div>
    </section>`;
    })
    .join("");
  return `<section class="card">
      <div class="wo-head"><h3>Checkliste Injektion</h3>${anyDone ? `<button class="btn sm" data-act="chk-reset" data-arg="">Alle Häkchen zurücksetzen</button>` : ""}</div>
      <p class="muted small">Allgemeine Punkte zu Hygiene und Sicherheit – keine ärztliche Anleitung und keine Dosierungsangaben. Maßgeblich sind die Anweisungen deiner Ärztin bzw. deines Arztes und die Packungsbeilage. Alle Punkte lassen sich über „Bearbeiten“ ändern, ergänzen, sortieren und löschen; Häkchen bleiben gespeichert, bis du sie zurücksetzt. Im Notfall: 112.</p>
    </section>${sections}`;
}

// ------------------------------------------------------------------ Aktionen

async function change(fn, ok) {
  try {
    const r = fn();
    await persist();
    if (ok) X.toast(typeof ok === "function" ? ok(r) : ok);
  } catch (e) {
    X.toast(e.message, true);
  }
  X.rerender();
}

function setList(fn) {
  const S = X.S;
  change(() => SD.setChecklist(S.super, fn(SD.checklistOf(S.catalog, S.super))));
}

export const superActions = {
  "sh-tab": (el) => {
    X.S.superTab = el.dataset.arg;
    X.rerender();
  },
  "hrt-new": () => {
    X.S.hrtEdit = newForm(HR().emptyHrtDraft(today(), nowTime()));
    X.go("hrt-edit");
  },
  "hrt-edit": (el) => {
    const e = entries().find((x) => x.id === el.dataset.arg);
    if (!e) return;
    X.S.hrtEdit = newForm(HR().hrtToDraft(e));
    X.go("hrt-edit");
  },
  "hrt-delete": (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: Eintrag löschen")) return;
    const e = entries().find((x) => x.id === el.dataset.arg);
    change(() => SD.deleteHrtEntry(X.S.catalog, X.S.super, el.dataset.arg), e ? `Eintrag vom ${D.formatDate(e.date)} gelöscht.` : "Gelöscht.");
  },
  "hrt-prefill": () => {
    const f = X.S.hrtEdit;
    f.draft = HR().prefillFromLast(f.draft, entries());
    const fresh = newForm(f.draft);
    f.customSite = fresh.customSite;
    f.customNeedle = fresh.customNeedle;
    X.rerender();
  },
  "hrt-dupe-cancel": () => {
    X.S.hrtEdit.dupes = null;
    X.rerender();
  },
  "hrt-save": async (el) => {
    const S = X.S;
    const f = S.hrtEdit;
    f.message = "";
    const r = HR().hrtDraftToInput(f.draft);
    if (!r.ok) {
      f.errors = r.errors;
      f.dupes = null;
      X.rerender();
      return;
    }
    if (el.dataset.arg !== "confirmed") {
      const hint = D.hrtDuplicateHint(D.duplicateHrtEntries(r.input, entries()));
      if (hint) {
        f.dupes = hint.text;
        X.rerender();
        return;
      }
    }
    try {
      const saved = SD.saveHrtEntry(S.catalog, S.super, r.input, opts());
      await persist();
      S.hrtEdit = null;
      S.superTab = "hrt";
      X.toast(`${saved.hormone}: ${fmt(saved.amount)} ${saved.unit} am ${D.formatDate(saved.date)} (${HR().STATUS_LABELS[saved.status]}) gespeichert.`);
      X.go("super");
    } catch (e) {
      f.dupes = null;
      if (e.field) f.errors = { [e.field]: e.message };
      else f.message = e.message;
      X.rerender();
    }
  },
  "hrt-product-save": async () => {
    const S = X.S;
    const f = S.hrtEdit;
    const match = HR().matchingProduct(f.draft, products());
    const r = HR().productFromDraft(f.draft, match?.id ?? null);
    if (!r.ok) {
      f.errors = { ...f.errors, ...r.errors };
      X.rerender();
      return;
    }
    try {
      const saved = SD.saveProduct(S.catalog, S.super, r.input, opts());
      await persist();
      f.productNote = { tone: "ok", text: `Präparat „${HR().productLabel(saved)}“ ${match ? "aktualisiert" : "gespeichert"} – bei weiteren Gaben auswählbar.` };
    } catch (e) {
      f.productNote = { tone: "error", text: e.message };
    }
    X.rerender();
  },
  "hrt-product-delete": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: Präparat löschen")) return;
    const S = X.S;
    const p = products().find((x) => x.id === el.dataset.arg);
    SD.deleteProduct(S.catalog, S.super, el.dataset.arg);
    await persist();
    S.hrtEdit.productNote = { tone: "ok", text: `Präparat „${p ? HR().productLabel(p) : ""}“ gelöscht. Erfasste Gaben bleiben unverändert.` };
    X.rerender();
  },
  "level-measurand": (el) => {
    X.S.levelMeasurand = el.dataset.arg;
    X.rerender();
  },
  "level-range": (el) => {
    X.S.levelRange = Number(el.dataset.arg);
    X.rerender();
  },
  "calc-row-add": () => {
    calcState().rows.push(newRow());
    X.rerender();
  },
  "calc-row-remove": (el) => {
    const c = calcState();
    c.rows = c.rows.length > 1 ? c.rows.filter((r) => r.key !== el.dataset.arg) : [newRow()];
    X.rerender();
  },
  "calc-mode": (el) => {
    calcState().weekMode = el.dataset.arg;
    X.rerender();
  },
  "calc-take": (el) => {
    calcState().perInjection = el.dataset.arg;
    X.rerender();
  },
  "calc-powder-take": (el) => {
    calcState().rows = [newRow("", el.dataset.arg)];
    X.rerender();
  },
  "chk-editmode": (el) => {
    X.S.chkEdit = X.S.chkEdit === el.dataset.arg ? null : el.dataset.arg;
    X.S.chkItem = null;
    X.S.chkNew = "";
    X.rerender();
  },
  "chk-edit": (el) => {
    const [section, id] = el.dataset.arg.split("|");
    const it = SD.checklistOf(X.S.catalog, X.S.super)[section].find((i) => i.id === id);
    if (it) X.S.chkItem = { section, id, text: it.text };
    X.rerender();
  },
  "chk-edit-cancel": () => {
    X.S.chkItem = null;
    X.rerender();
  },
  "chk-edit-save": () => {
    const it = X.S.chkItem;
    X.S.chkItem = null;
    if (it) setList((l) => CL().editItem(l, it.section, it.id, it.text));
  },
  "chk-move": (el) => {
    const [section, id, dir] = el.dataset.arg.split("|");
    setList((l) => CL().moveItem(l, section, id, Number(dir)));
  },
  "chk-remove": (el) => {
    if (!X.confirmTwice(el, "Löschen?")) return;
    const [section, id] = el.dataset.arg.split("|");
    setList((l) => CL().removeItem(l, section, id));
  },
  "chk-add": (el) => {
    const text = (X.S.chkNew ?? "").trim();
    if (!text) return;
    X.S.chkNew = "";
    setList((l) => CL().addItem(l, el.dataset.arg, text, `u${Date.now().toString(36)}`));
  },
  "chk-reset": (el) => {
    setList((l) => CL().resetTicks(l, el.dataset.arg || undefined));
  },
  "chk-template": (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: eigene Punkte verwerfen")) return;
    setList((l) => CL().restoreTemplate(l, el.dataset.arg));
  },
};

/** Eingaben (ohne neu zu zeichnen); true = behandelt. */
export function superInput(el) {
  const S = X.S;
  const k = el.dataset ?? {};
  if (k.hrt && S.hrtEdit && !["product", "siteSelect", "needleSelect"].includes(k.hrt)) {
    S.hrtEdit.draft[k.hrt] = el.value;
    if (S.hrtEdit.errors?.[k.hrt]) S.hrtEdit.errors[k.hrt] = "";
    return true;
  }
  if (k.calc && k.calc !== "product") {
    calcState()[k.calc] = el.value;
    return true;
  }
  if (k.calcrow) {
    const r = calcState().rows.find((x) => x.key === k.calcrow);
    if (r) r[k.f] = el.value;
    return true;
  }
  if (k.chk === "edit" && S.chkItem) {
    S.chkItem.text = el.value;
    return true;
  }
  if (k.chk === "new") {
    S.chkNew = el.value;
    return true;
  }
  return false;
}

/** Nach dem Verlassen eines Textfelds neu zeichnen, ohne den Fokus des nächsten Felds zu verlieren. */
function rerenderLater() {
  setTimeout(() => {
    const id = document.activeElement?.id;
    X.rerender();
    if (id) document.getElementById(id)?.focus();
  }, 0);
}

/** Auswahlfelder und verlassene Textfelder; true = behandelt. */
export function superChange(el) {
  const S = X.S;
  const k = el.dataset ?? {};
  if (k.super === "range") {
    S.hrtRange = el.value;
    X.rerender();
    return true;
  }
  if (k.chk === "toggle") {
    setList((l) => CL().toggleItem(l, k.section, k.id));
    return true;
  }
  if (k.hrt && S.hrtEdit) {
    const f = S.hrtEdit;
    if (k.hrt === "product") {
      const p = products().find((x) => x.id === el.value);
      if (p) f.draft = HR().applyProduct(f.draft, p);
      f.productNote = null;
    } else if (k.hrt === "siteSelect") {
      f.customSite = el.value === CUSTOM;
      f.draft.site = el.value === CUSTOM ? "" : el.value;
    } else if (k.hrt === "needleSelect") {
      f.customNeedle = el.value === CUSTOM;
      f.draft.needle = el.value === CUSTOM ? "" : el.value;
    } else {
      superInput(el);
      rerenderLater();
      return true;
    }
    X.rerender();
    return true;
  }
  if (k.calc === "product") {
    const p = products().find((x) => x.id === el.value);
    const c = calcState();
    if (p?.concentrationMgMl != null) c.rows = [newRow(p.hormone, numberToInput(p.concentrationMgMl, 3))];
    if (p?.vialVolumeMl != null) c.vial = numberToInput(p.vialVolumeMl, 2);
    X.rerender();
    return true;
  }
  if (k.calc || k.calcrow) {
    superInput(el);
    rerenderLater();
    return true;
  }
  return superInput(el);
}
