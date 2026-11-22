// LIFESPAN OS Mobil – Superhuman wie am PC (1.11.0, ab 1.13.0 mit Protokoll, Auswertung und
// Substanzen wie SuperhumanPage.tsx): HRT (Hormongaben mit Präparat, Charge,
// Injektionsort und Kanüle erfassen, bearbeiten, löschen; Übersicht je Art), Wirkstoffspiegel
// (Modellrechnung mit Abgleich an Blutwerten aus Health), Wirkstoffrechner und Checkliste
// Injektion – wie HrtTab.tsx, HormoneLevelTab.tsx, DoseCalculatorTab.tsx und HrtChecklistTab.tsx.
// Logik: superdata.js (wie repo/hrt.rs und repo/protocol.rs). Änderungen gehen mit der Datei „Körperwerte“ an den PC.
// Seit 1.75.0 aufgeteilt: HRT, Wirkstoffspiegel, Rechner und Checkliste in supertabs.js, Aktionen und Eingaben in superactions.js.
import * as SD from "./superdata.js";
import * as D from "./pcdomain.js";
import { today } from "./diary.js";
import { barTrendSvg } from "./pcview.js";
import { calculatorTab, checklistTab, fromFor, hrtTab, levelsTab } from "./supertabs.js";
import { timelineTab } from "./parity.js";
export { viewHrtEdit } from "./supertabs.js";
export { superActions, superChange, superInput } from "./superactions.js";

export let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initSuper(ctx) {
  X = ctx;
}

export const esc = (v) => X.esc(v);

export const HR = () => D.hrt;

export const HL = () => D.hormoneLevel;

export const DC = () => D.doseCalc;

export const CL = () => D.hrtChecklist;

export const PR = () => D.protocol;

export const TABS = [
  ["log", "Protokoll"],
  ["analysis", "Auswertung"],
  ["timeline", "Zeitachse"],
  ["substances", "Substanzen"],
  ["hrt", "HRT"],
  ["levels", "Wirkstoffspiegel"],
  ["calculator", "Wirkstoffrechner"],
  ["checklist", "Checkliste"],
];

export const RANGES = [
  ["7", "Letzte 7 Tage"],
  ["30", "Letzte 30 Tage"],
  ["90", "Letzte 90 Tage"],
  ["365", "Letztes Jahr"],
  ["all", "Alle Einträge"],
];

export const CUSTOM = "__custom__";

/** Zahl ohne überflüssige Nachkommastellen (höchstens `max`), wie `fmt` am PC. */
export function fmt(v, max = 3) {
  for (let d = 0; d <= max; d += 1) if (Math.abs(v * 10 ** d - Math.round(v * 10 ** d)) < 1e-9) return D.formatNumber(v, d);
  return D.formatNumber(v, max);
}

export function numberToInput(value, maxDecimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const f = 10 ** maxDecimals;
  return String(Math.round(value * f) / f).replace(".", ",");
}

export const positive = (t) => DC().positive(String(t ?? ""));

export const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export async function persist() {
  try {
    await X.store.set("super", X.S.super);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

export const opts = () => ({ uuid: X.uuid, now: new Date() });

export const entries = () => SD.hrtEntriesOf(X.S.catalog, X.S.super);

export const products = () => SD.productsOf(X.S.catalog, X.S.super);

// ------------------------------------------------------------------ Hauptansicht

export function viewSuper() {
  const S = X.S;
  if (!S.catalog?.pc) {
    return `${X.header("Superhuman")}<main class="wrap"><section class="card"><p class="warn">Für Superhuman fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Import/Export „Neue Exportdatei laden“.</p></section></main>`;
  }
  const tab = S.superTab ?? "log";
  const pending = SD.unsentSuper(S.super);
  const views = { log: logTab, analysis: analysisTab, timeline: () => timelineTab(entries()), substances: substancesTab, levels: levelsTab, calculator: calculatorTab, checklist: checklistTab };
  const body = (views[tab] ?? hrtTab)();
  return `${X.header("Superhuman")}<main class="wrap">
    <nav class="tabs" aria-label="Superhuman">${TABS.map(
      ([v, l]) => `<button class="tab ${v === tab ? "active" : ""}" data-act="sh-tab" data-arg="${v}" ${v === tab ? 'aria-current="page"' : ""}>${l}</button>`,
    ).join("")}</nav>
    ${pending ? `<p class="muted small">${pending} ${pending === 1 ? "Änderung" : "Änderungen"} in Superhuman noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    ${body}
  </main>`;
}

// ------------------------------------------------------------------ Protokoll, Auswertung, Substanzen

export const substances = (includeArchived = true) => SD.substancesOf(X.S.catalog, X.S.super, includeArchived);

export const protocolEntries = (from = null) => SD.protocolEntriesOf(X.S.catalog, X.S.super, from);

/** Menge mit 0, 1 oder 3 Nachkommastellen wie `fmtAmount` am PC. */
export const fmtAmount = (v, unit) => `${D.formatNumber(v, Number.isInteger(v) ? 0 : v * 10 === Math.round(v * 10) ? 1 : 3)} ${unit}`;

export const rangeSelect = (key, value) =>
  `<select data-super="${key}" aria-label="Zeitraum">${RANGES.map(([v, l]) => `<option value="${v}" ${v === value ? "selected" : ""}>${l}</option>`).join("")}</select>`;

export function logTab() {
  const S = X.S;
  const t = today();
  const range = S.protoRange ?? "30";
  const subs = substances(false);
  const shown = protocolEntries(fromFor(range, t));
  return `<section class="card">
      <div class="wo-head"><h3>Einnahme erfassen</h3><button class="linkbtn" data-act="sh-tab" data-arg="substances">Substanzen verwalten</button></div>
      ${
        subs.length
          ? `<div class="row-actions"><button class="btn primary block" data-act="proto-new">+ Einnahme erfassen</button></div>`
          : `<p class="muted">Lege zuerst unter <button class="linkbtn" data-act="sh-tab" data-arg="substances">Substanzen</button> an, was du protokollieren möchtest (PED, Medikament oder Peptid).</p>`
      }
    </section>
    <section class="card">
      <div class="wo-head"><h3>Protokoll</h3>${rangeSelect("protoRange", range)}</div>
      ${
        shown.length
          ? `<ul class="hrt-log">${shown
              .map(
                (e) => `<li>
          <div class="hrt-log__head"><strong>${esc(D.formatDate(e.date))}${e.time ? ` · ${esc(e.time)} Uhr` : ""}</strong><span>${esc(fmtAmount(e.amount, e.unit))}</span></div>
          <div>${esc(e.substanceName)} <span class="muted small">· ${esc(PR().CATEGORY_SHORT[e.category] ?? e.category)}</span></div>
          ${e.route || e.site ? `<div class="muted small">${[e.route ? D.ROUTE_LABELS[e.route] ?? e.route : null, e.site].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
          ${e.notes ? `<div class="small">${esc(e.notes)}</div>` : ""}
          <div class="row-actions"><button class="btn sm" data-act="proto-edit" data-arg="${esc(e.id)}">Bearbeiten</button><button class="btn sm danger" data-act="proto-delete" data-arg="${esc(e.id)}">Löschen</button></div>
        </li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">In diesem Zeitraum gibt es keine Einträge.</p>`
      }
    </section>`;
}

export function analysisTab() {
  const S = X.S;
  const t = today();
  const range = S.anaRange ?? "90";
  const all = protocolEntries();
  const from = fromFor(range, t);
  const rows = PR().summarize(from ? all.filter((e) => e.date >= from) : all);
  const selected = rows.some((r) => r.substanceId === S.anaSubstance) ? S.anaSubstance : (rows[0]?.substanceId ?? "");
  const row = rows.find((r) => r.substanceId === selected);
  const weeks = selected ? PR().weeklyTotals(all, selected, t, 12) : [];
  const ago = (d) => {
    const n = PR().daysBetween(d, t);
    return n === 0 ? "heute" : `vor ${n} ${n === 1 ? "Tag" : "Tagen"}`;
  };
  return `<section class="card">
      <div class="wo-head"><h3>Je Substanz</h3>${rangeSelect("anaRange", range)}</div>
      ${
        rows.length
          ? `<ul class="hrt-summary">${rows
              .map(
                (r) => `<li class="${r.substanceId === selected ? "is-selected" : ""}"><button class="linkbtn" data-act="ana-pick" data-arg="${esc(r.substanceId)}"><strong>${esc(r.name)}</strong></button> <span class="muted small">${esc(PR().CATEGORY_SHORT[r.category] ?? r.category)}</span>
        <dl>
          <div><dt>Einträge</dt><dd>${r.count}</dd></div>
          <div><dt>Tage</dt><dd>${r.days}</dd></div>
          <div><dt>Summe</dt><dd>${esc(fmtAmount(r.total, r.unit))}</dd></div>
          <div><dt>Ø je Eintrag</dt><dd>${esc(fmtAmount(Math.round((r.total / r.count) * 1000) / 1000, r.unit))}</dd></div>
          <div><dt>Erster</dt><dd>${r.first ? esc(D.formatDate(r.first)) : "–"}</dd></div>
          <div><dt>Letzter</dt><dd>${r.last ? `${esc(D.formatDate(r.last))} <span class="muted small">${ago(r.last)}</span>` : "–"}</dd></div>
        </dl></li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">In diesem Zeitraum gibt es keine Einträge.</p>`
      }
      <p class="muted small">Summen und Zählungen deiner Einträge – ohne Bewertung und ohne Empfehlung.</p>
    </section>
    ${
      row
        ? `<section class="card"><div class="wo-head"><h3>${esc(row.name)} – Summe je Woche</h3><span class="muted small">letzte 12 Kalenderwochen</span></div>
      ${barTrendSvg(
        weeks.map((w) => ({ date: w.week, value: w.total })),
        { color: "var(--blue)", format: (v) => fmtAmount(v, row.unit), label: `Wochensummen ${row.name}` },
      )}
      <p class="muted small">Jede Säule beginnt mit dem Montag der Woche.</p></section>`
        : ""
    }`;
}

export function substancesTab() {
  const list = substances(true);
  return `<section class="card">
      <div class="wo-head"><h3>Substanzen</h3><button class="btn sm primary" data-act="sub-new">+ Neue Substanz</button></div>
      ${
        list.length
          ? `<ul class="hrt-log">${list
              .map(
                (s) => `<li class="${s.archived ? "is-missed" : ""}">
          <div class="hrt-log__head"><strong>${esc(s.name)}</strong><span class="muted small">${esc(PR().CATEGORY_SHORT[s.category] ?? s.category)} · ${esc(s.unit)}</span></div>
          <div class="muted small">${[s.defaultRoute ? `üblich ${D.ROUTE_LABELS[s.defaultRoute] ?? s.defaultRoute}` : null, `${s.entryCount} ${s.entryCount === 1 ? "Eintrag" : "Einträge"}`, s.lastDate ? `zuletzt ${D.formatDate(s.lastDate)}` : null, s.archived ? "archiviert" : null].filter(Boolean).map(esc).join(" · ")}</div>
          ${s.notes ? `<div class="small">${esc(s.notes)}</div>` : ""}
          <div class="row-actions"><button class="btn sm" data-act="sub-edit" data-arg="${esc(s.id)}">Bearbeiten</button></div>
        </li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">Noch keine Substanzen angelegt.</p>`
      }
    </section>`;
}

export function pfield(attr, k, label, value, { type = "text", unit = "", mode = "", placeholder = "", error = "" } = {}) {
  return `<div class="field ${error ? "has-error" : ""}"><label for="${attr}-${k}">${esc(label)}</label>
    <div class="input-row"><input id="${attr}-${k}" type="${type}" data-${attr}="${k}" value="${esc(value)}" ${mode ? `inputmode="${mode}"` : ""} ${placeholder ? `placeholder="${esc(placeholder)}"` : ""} autocomplete="off">${unit ? `<span class="unit">${esc(unit)}</span>` : ""}</div>
    ${error ? `<p class="field-error">${esc(error)}</p>` : ""}</div>`;
}

export function pselect(attr, k, label, value, options, error = "") {
  return `<div class="field ${error ? "has-error" : ""}"><label for="${attr}-${k}">${esc(label)}</label>
    <select id="${attr}-${k}" data-${attr}="${k}">${options.map(([v, l, g]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(g ? `${l} (${g})` : l)}</option>`).join("")}</select>
    ${error ? `<p class="field-error">${esc(error)}</p>` : ""}</div>`;
}

export function ptextarea(attr, k, label, value, error = "") {
  return `<div class="field ${error ? "has-error" : ""}"><label for="${attr}-${k}">${esc(label)}</label><textarea id="${attr}-${k}" data-${attr}="${k}" rows="2">${esc(value)}</textarea>
    ${error ? `<p class="field-error">${esc(error)}</p>` : ""}</div>`;
}

export const routeOptions = () => [["", "Keine Angabe"], ...Object.entries(D.ROUTE_LABELS)];

export function viewProtocolEdit() {
  const f = X.S.protoEdit;
  if (!f) return viewSuper();
  const d = f.draft;
  const e = f.errors ?? {};
  const subs = substances(false);
  // Beim Bearbeiten bleibt eine inzwischen archivierte Substanz wählbar
  const current = d.substanceId && !subs.some((s) => s.id === d.substanceId) ? substances(true).find((s) => s.id === d.substanceId) : null;
  const options = [...subs, ...(current ? [current] : [])];
  const chosen = options.find((s) => s.id === d.substanceId);
  return `${X.header(d.id ? "Eintrag bearbeiten" : "Einnahme erfassen", { back: "super" })}<main class="wrap">
    <section class="card">
      ${pselect("pf", "substanceId", "Substanz", d.substanceId, [["", "Bitte wählen …"], ...options.map((s) => [s.id, s.name, PR().CATEGORY_SHORT[s.category]])], e.substanceId)}
      ${pfield("pf", "amount", "Menge", d.amount, { unit: chosen?.unit ?? "", mode: "decimal", error: e.amount })}
      <div class="lab-row__grid">
        ${pfield("pf", "date", "Datum", d.date, { type: "date", error: e.date })}
        ${pfield("pf", "time", "Uhrzeit (optional)", d.time, { type: "time", error: e.time })}
      </div>
      ${pselect("pf", "route", "Anwendung (optional)", d.route, routeOptions(), e.route)}
      ${pfield("pf", "site", "Stelle (optional)", d.site, { placeholder: "z. B. Bauch links", error: e.site })}
      ${ptextarea("pf", "notes", "Notiz (optional)", d.notes, e.notes)}
      ${f.message ? `<p class="field-error">${esc(f.message)}</p>` : ""}
      <div class="row-actions"><button class="btn primary" data-act="proto-save">${d.id ? "Änderung speichern" : "Eintrag speichern"}</button><button class="btn" data-go="super">Abbrechen</button></div>
    </section>
  </main>`;
}

export function viewSubstanceEdit() {
  const f = X.S.subEdit;
  if (!f) return viewSuper();
  const d = f.draft;
  const e = f.errors ?? {};
  return `${X.header(d.id ? "Substanz bearbeiten" : "Neue Substanz", { back: "super" })}<main class="wrap">
    <section class="card">
      ${pfield("sf", "name", "Name", d.name, { error: e.name })}
      ${pselect("sf", "category", "Art", d.category, Object.entries(PR().CATEGORY_LABELS), e.category)}
      ${pselect("sf", "unit", "Einheit", d.unit, PR().UNITS.map((u) => [u, u]), e.unit)}
      ${pselect("sf", "defaultRoute", "Übliche Anwendung (optional)", d.defaultRoute, routeOptions(), e.defaultRoute)}
      ${ptextarea("sf", "notes", "Notiz (optional)", d.notes, e.notes)}
      ${d.id ? `<label class="hrt-check__item"><input type="checkbox" data-sf="archived" ${d.archived ? "checked" : ""}><span>Archiviert (nicht mehr zur Auswahl beim Erfassen)</span></label>` : ""}
      ${f.message ? `<p class="field-error">${esc(f.message)}</p>` : ""}
      <div class="row-actions"><button class="btn primary" data-act="sub-save">Speichern</button><button class="btn" data-go="super">Abbrechen</button>
        ${d.id ? `<button class="btn danger" data-act="sub-delete" data-arg="${esc(d.id)}">Löschen</button>` : ""}</div>
      ${d.id ? `<p class="muted small">Löschen geht nur ohne Protokolleinträge – sonst archivieren.</p>` : ""}
    </section>
  </main>`;
}
