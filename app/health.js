// LIFESPAN OS Mobil – Health wie am PC (1.10.0, ab 1.14.0 vollständig): Blutabnahmen (Liste, Werte
// mit Referenzbereich und ↑/↓, erfassen, bearbeiten, löschen), Verlauf je Parameter (Diagramm mit
// Referenzband), Arztbericht (Vorschau, PDF), „Once in a Lifetime“ (Blutgruppe, Lp(a), Gentests
// usw.), Import aus CSV/Excel und Parameter wie HealthPage.tsx mit seinen Reitern.
// Logik: healthdata.js (wie repo/lab.rs, repo/lifetime.rs). Änderungen gehen mit der Datei
// „Körperwerte“ an den PC.

import * as H from "./healthdata.js";
import * as D from "./pcdomain.js";
import { buildDb, today } from "./diary.js";
import * as O from "./pcoverview.js";
import * as SD from "./superdata.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initHealth(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const L = () => D.lab;
const LT = () => D.lifetime;

const TABS = [
  ["draws", "Blutabnahmen"],
  ["trend", "Verlauf"],
  ["report", "Arztbericht"],
  ["lifetime", "Once in a Lifetime"],
  ["import", "Import"],
  ["analytes", "Parameter"],
];

async function persist() {
  try {
    await X.store.set("health", X.S.health);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

const opts = () => ({ uuid: X.uuid, now: new Date() });

function data() {
  const S = X.S;
  const analytes = H.analytesOf(S.catalog, S.health, today());
  const draws = H.drawsOf(S.catalog, S.health);
  return { analytes, byId: new Map(analytes.map((a) => [a.id, a])), draws };
}

function drawTitle(d) {
  return [D.formatDate(d.date), d.time, d.lab].filter(Boolean).join(" · ");
}

function flagMark(flag) {
  if (flag !== "low" && flag !== "high") return "";
  return `<span class="lab-flag lab-flag--${flag}" title="${esc(L().FLAG_LABELS[flag])}">${L().FLAG_MARKS[flag]}<span class="visually-hidden"> ${esc(L().FLAG_LABELS[flag])}</span></span>`;
}

/** Auswahl der Parameter, nach Gruppe geordnet (wie analyteOptions am PC). */
function analyteOptions(analytes, value, keepId = "") {
  return L()
    .LAB_CATEGORIES.map((c) => {
      const list = analytes.filter((a) => a.category === c && (!a.archived || a.id === keepId));
      if (!list.length) return "";
      return `<optgroup label="${esc(L().LAB_CATEGORY_LABELS[c])}">${list
        .map((a) => `<option value="${esc(a.id)}" ${a.id === value ? "selected" : ""}>${esc(a.unit ? `${a.name} (${a.unit})` : a.name)}</option>`)
        .join("")}</optgroup>`;
    })
    .join("");
}

// ------------------------------------------------------------------ Hauptansicht

export function viewHealth() {
  const S = X.S;
  if (!S.catalog?.pc?.lab_analyte?.length) {
    return `${X.header("Health")}<main class="wrap"><section class="card"><p class="warn">Für Health fehlen noch Daten: Bitte am PC (ab Version 1.0.121) einen neuen Export erstellen und hier unter Settings „Neue Exportdatei laden“.</p></section></main>`;
  }
  const tab = S.healthTab ?? "draws";
  const pending = H.unsentHealth(S.health);
  const d = data();
  const views = { trend: trendTab, report: reportTab, lifetime: lifetimeTab, import: importTab, analytes: analytesTab };
  const body = (views[tab] ?? drawsTab)(d);
  return `${X.header("Health")}<main class="wrap">
    <p class="muted small">Laborwerte mit Referenzbereichen: Blutabnahmen erfassen oder aus CSV/Excel übernehmen, Verläufe mit Normbereich und markierten Ausreißern, Bericht für den Arzttermin und einmalig bestimmte Angaben wie Blutgruppe oder Gentests.</p>
    <nav class="tabs" aria-label="Health">${TABS.map(
      ([v, l]) => `<button class="tab ${v === tab ? "active" : ""}" data-act="health-tab" data-arg="${v}" ${v === tab ? 'aria-current="page"' : ""}>${l}</button>`,
    ).join("")}</nav>
    ${pending ? `<p class="muted small">${pending} ${pending === 1 ? "Änderung" : "Änderungen"} in Health noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    ${body}
  </main>`;
}

function drawsTab({ draws, byId }) {
  const S = X.S;
  const selected = draws.find((x) => x.id === S.healthDraw) ?? draws[0] ?? null;
  const list = draws.length
    ? `<ul class="lab-list">${draws
        .map((x) => {
          const s = L().summarizeDraw(x, byId);
          const out = s.low + s.high;
          return `<li><button class="lab-list__item ${x.id === selected?.id ? "is-selected" : ""}" data-act="lab-select" data-arg="${esc(x.id)}">
            <span><strong>${esc(D.formatDate(x.date))}</strong>${x.time ? ` <span class="muted small">${esc(x.time)}</span>` : ""}${x.lab ? `<br><span class="muted small">${esc(x.lab)}</span>` : ""}</span>
            <span class="lab-list__nums"><span>${s.total} ${s.total === 1 ? "Wert" : "Werte"}</span>${out ? `<strong class="lab-flag lab-flag--high">${out} außerhalb</strong>` : `<span class="muted small">alle im Bereich${s.withoutRange ? ` · ${s.withoutRange} ohne Bereich` : ""}</span>`}</span>
          </button></li>`;
        })
        .join("")}</ul>`
    : `<p class="muted">Noch keine Laborwerte. Trage eine Blutabnahme ein – Referenzbereiche übernimmst du aus dem Befund.</p>`;
  return `<section class="card">
      <div class="wo-head"><h3>Blutabnahmen</h3><button class="btn sm primary" data-act="lab-new">+ Neue Blutabnahme</button></div>
      ${list}
    </section>
    ${selected ? drawDetails(selected, byId) : ""}`;
}

function drawDetails(draw, byId) {
  const groups = L()
    .LAB_CATEGORIES.map((c) => ({ c, results: draw.results.filter((r) => r.category === c) }))
    .filter((g) => g.results.length);
  return `<section class="card lab-draw">
    <div class="wo-head"><h3>Blutabnahme ${esc(drawTitle(draw))}</h3>
      ${draw.fasting === null ? "" : `<span class="tag">${draw.fasting ? "nüchtern" : "nicht nüchtern"}</span>`}</div>
    ${draw.notes ? `<p class="muted small">${esc(draw.notes)}</p>` : ""}
    ${groups
      .map(
        (g) => `<h4 class="lab-group__title">${esc(L().LAB_CATEGORY_LABELS[g.c])}</h4>
      <ul class="lab-values">${g.results
        .map((r) => {
          const range = L().rangeFor(r, byId.get(r.analyteId));
          const flag = L().flagOf(r.value, r.comparator, range);
          const rangeText = L().formatRange(range);
          return `<li class="${flag === "low" || flag === "high" ? "is-flagged" : ""}">
            <button class="lab-values__row" data-act="lab-trend" data-arg="${esc(r.analyteId)}" aria-label="Verlauf ${esc(r.analyteName)}">
              <span class="lab-values__name">${esc(r.analyteName)}${r.notes ? `<span class="muted small"> · ${esc(r.notes)}</span>` : ""}</span>
              <span class="lab-values__val"><strong>${esc(L().formatLabValue(r.value, r.comparator))}</strong> ${flagMark(flag)} <span class="muted small">${esc(r.unit)}</span></span>
              <span class="lab-values__ref muted small">${rangeText ? `Ref. ${esc(rangeText)}` : "ohne Bereich"}</span>
            </button></li>`;
        })
        .join("")}</ul>`,
      )
      .join("")}
    <div class="row-actions">
      <button class="btn" data-act="lab-edit" data-arg="${esc(draw.id)}">Bearbeiten</button>
      <button class="btn danger" data-act="lab-delete" data-arg="${esc(draw.id)}">Löschen</button>
    </div>
    <p class="muted small">↑/↓ = über bzw. unter dem Referenzbereich laut Befund (sonst dem eigenen Bereich des Parameters bzw. dem Vorgabebereich nach ${esc(D.REFERENCE_SOURCE)}). Keine Bewertung – die Einordnung bleibt ärztliche Aufgabe. Tippen auf einen Wert zeigt den Verlauf.</p>
  </section>`;
}

// ------------------------------------------------------------------ Verlauf

function labChart(points, range, label) {
  const W = 340;
  const Hh = 170;
  const Lf = 44;
  const R = 10;
  const T = 10;
  const B = 22;
  const vals = points.map((p) => p.value);
  if (range?.low !== null && range?.low !== undefined) vals.push(range.low);
  if (range?.high !== null && range?.high !== undefined) vals.push(range.high);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi === lo) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const t = (p) => Date.parse(`${p.date}T${p.time ?? "12:00"}:00Z`);
  const t0 = t(points[0]);
  const t1 = t(points[points.length - 1]);
  const x = (p) => Lf + (t1 === t0 ? (W - Lf - R) / 2 : ((t(p) - t0) / (t1 - t0)) * (W - Lf - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (Hh - T - B);
  const band = range && (range.low !== null || range.high !== null)
    ? (() => {
        const top = y(range.high ?? hi);
        const bottom = y(range.low ?? lo);
        return `<rect x="${Lf}" y="${top.toFixed(1)}" width="${W - Lf - R}" height="${Math.max(0, bottom - top).toFixed(1)}" class="lab-band"/>`;
      })()
    : "";
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad];
  const fmt = (v) => L().formatLabNumber(Math.round(v * 100) / 100);
  return `<svg class="pc-chart lab-chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(label)}">
    ${band}
    ${ticks.map((v) => `<line x1="${Lf}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${Lf - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${esc(fmt(v))}</text>`).join("")}
    <polyline points="${points.map((p) => `${x(p).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round"/>
    ${points
      .map((p) => {
        const out = p.flag === "low" || p.flag === "high";
        return `<circle cx="${x(p).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${out ? 4 : 3}" class="${out ? "lab-dot--out" : "lab-dot"}"><title>${esc(D.formatDate(p.date))}: ${esc(L().formatLabValue(p.value, p.comparator))}</title></circle>`;
      })
      .join("")}
    <text x="${Lf}" y="${Hh - 6}" text-anchor="start">${esc(D.formatDate(points[0].date))}</text>
    <text x="${W - R}" y="${Hh - 6}" text-anchor="end">${esc(D.formatDate(points[points.length - 1].date))}</text>
  </svg>`;
}

function trendTab({ analytes, draws }) {
  const S = X.S;
  const used = new Set(draws.flatMap((d) => d.results.map((r) => r.analyteId)));
  const withValues = analytes.filter((a) => used.has(a.id));
  const analyte = withValues.find((a) => a.id === S.healthTrend) ?? withValues[0] ?? null;
  if (!analyte) return `<section class="card"><h3>Noch kein Verlauf</h3><p class="muted">Sobald Laborwerte gespeichert sind, siehst du hier den Verlauf je Parameter.</p></section>`;
  const points = L().seriesFor(draws, analyte);
  const unit = L().mainUnit(points);
  const inUnit = points.filter((p) => p.unit === unit);
  const otherUnits = points.length - inUnit.length;
  const range = L().commonRange(inUnit);
  const outside = inUnit.filter((p) => p.flag === "low" || p.flag === "high").length;
  return `<section class="card lab-trend">
    <label class="field"><span class="muted small">Parameter</span><select data-health="trend">${analyteOptions(withValues, analyte.id, analyte.id)}</select></label>
    <h3>Verlauf ${esc(analyte.name)}</h3>
    <p class="muted small">${inUnit.length} ${inUnit.length === 1 ? "Wert" : "Werte"}${unit ? ` in ${esc(unit)}` : ""}${range ? ` · Referenzbereich ${esc(L().formatRange(range))}` : " · Bereich wechselt bzw. fehlt – je Wert in der Tabelle"}${outside ? ` · ${outside} außerhalb` : ""}</p>
    ${inUnit.length >= 2 ? labChart(inUnit, range, `Verlauf ${analyte.name}${unit ? ` in ${unit}` : ""}`) : `<p class="muted small">Ab zwei Werten erscheint hier das Diagramm.</p>`}
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Datum</th><th class="tnum">Wert</th><th>Einheit</th><th>Referenz</th></tr></thead><tbody>
      ${[...points]
        .reverse()
        .map((p) => `<tr class="${p.flag === "low" || p.flag === "high" ? "is-flagged" : ""}"><td>${esc(D.formatDate(p.date))}${p.time ? ` <span class="muted small">${esc(p.time)}</span>` : ""}</td>
          <td class="tnum"><strong>${esc(L().formatLabValue(p.value, p.comparator))}</strong> ${flagMark(p.flag)}</td><td>${esc(p.unit)}</td><td>${esc(L().formatRange(p.range) || "–")}</td></tr>`)
        .join("")}
    </tbody></table></div>
    ${otherUnits ? `<p class="muted small">${otherUnits} ${otherUnits === 1 ? "Wert hat" : "Werte haben"} eine andere Einheit und ${otherUnits === 1 ? "steht" : "stehen"} nur in der Tabelle – die App rechnet Einheiten nicht um.</p>` : ""}
    <p class="muted small">Grünes Band = Referenzbereich, rote Punkte = Werte außerhalb. Beobachtung ohne Bewertung.</p>
  </section>`;
}

// ------------------------------------------------------------------ Once in a Lifetime

function bloodSelect(name, label, choices, value) {
  return `<label class="field"><span class="muted small">${esc(label)}</span><select data-health="blood" data-name="${esc(name)}">
    <option value="">–</option>
    ${choices.map((c) => `<option value="${esc(c)}" ${c === value ? "selected" : ""}>${esc(c)}</option>`).join("")}
    ${value && !choices.includes(value) ? `<option value="${esc(value)}" selected>${esc(value)}</option>` : ""}
  </select></label>`;
}

function lifeForm(draft, errors) {
  const e = errors ?? {};
  const sugg = LT().LIFETIME_SUGGESTIONS[draft.category] ?? [];
  const f = (k, label, type = "text", extra = "") =>
    `<div class="field ${e[k] ? "has-error" : ""}"><label for="lt-${k}">${esc(label)}</label><input id="lt-${k}" type="${type}" data-life="${k}" value="${esc(draft[k])}" ${extra} autocomplete="off">${e[k] ? `<p class="field-error">${esc(e[k])}</p>` : ""}</div>`;
  return `<div class="lifetime-form">
    <h4>${draft.id ? `„${esc(draft.name)}“ bearbeiten` : "Neuer Eintrag"}</h4>
    ${f("name", "Bezeichnung", "text", `list="lt-sugg" maxlength="80"`)}
    <datalist id="lt-sugg">${sugg.map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
    <div class="field ${e.value ? "has-error" : ""}"><label for="lt-value">Befund</label><textarea id="lt-value" data-life="value" rows="2" maxlength="500">${esc(draft.value)}</textarea>${e.value ? `<p class="field-error">${esc(e.value)}</p>` : ""}</div>
    ${f("date", "Datum (optional)", "date")}
    ${f("source", "Labor / Praxis (optional)", "text", `maxlength="120"`)}
    <div class="field"><label for="lt-notes">Notiz (optional)</label><textarea id="lt-notes" data-life="notes" rows="2" maxlength="2000">${esc(draft.notes)}</textarea>${e.notes ? `<p class="field-error">${esc(e.notes)}</p>` : ""}</div>
    <div class="row-actions"><button class="btn primary" data-act="life-save">Speichern</button><button class="btn" data-act="life-cancel">Abbrechen</button></div>
  </div>`;
}

function lifetimeTab({ draws }) {
  const S = X.S;
  const records = H.lifetimeOf(S.catalog, S.health);
  const LTm = LT();
  const summary = LTm.bloodGroupSummary(records);
  const val = (name) => LTm.findRecord(records, "blood_group", name)?.value ?? "";
  const lpa = LTm.latestLpa(draws);
  const editing = S.lifeEdit;
  const groups = LTm.LIFETIME_CATEGORIES.map((c) => {
    const list = records.filter((r) => r.category === c && !(c === "blood_group" && LTm.BLOOD_GROUP_FIXED.includes(r.name)));
    const open = editing?.draft.category === c;
    return `<section class="card lifetime-group">
      <div class="wo-head"><h3>${esc(c === "blood_group" ? "Weitere Blutgruppenmerkmale" : LTm.LIFETIME_CATEGORY_LABELS[c])}</h3>
        ${open ? "" : `<button class="btn sm" data-act="life-new" data-arg="${c}">+ Eintrag</button>`}</div>
      <p class="muted small">${esc(LTm.LIFETIME_CATEGORY_HINTS[c])}</p>
      ${c === "lipoprotein" && lpa ? `<p class="small">Letzter Laborwert: <strong>${esc(L().formatLabValue(lpa.value, lpa.comparator))} ${esc(lpa.unit)}</strong> <span class="muted">(${esc(D.formatDate(lpa.date))}, aus den Blutabnahmen)</span></p>` : ""}
      ${list.length
        ? `<ul class="lifetime-list">${list
            .map((r) =>
              editing?.draft.id === r.id
                ? `<li>${lifeForm(editing.draft, editing.errors)}</li>`
                : `<li><div><strong>${esc(r.name)}</strong>: ${esc(r.value)}
                  <div class="muted small">${[r.date ? D.formatDate(r.date) : "", r.source ?? ""].filter(Boolean).map(esc).join(" · ")}${r.notes ? `<br>${esc(r.notes)}` : ""}</div></div>
                  <div class="row-actions"><button class="btn sm" data-act="life-edit" data-arg="${esc(r.id)}">Bearbeiten</button><button class="btn sm danger" data-act="life-delete" data-arg="${esc(r.id)}">Löschen</button></div></li>`,
            )
            .join("")}</ul>`
        : open ? "" : `<p class="muted small">Noch kein Eintrag.</p>`}
      ${open && !editing.draft.id ? lifeForm(editing.draft, editing.errors) : ""}
    </section>`;
  }).join("");
  return `<section class="card">
      <h3>Blutgruppe ${summary ? `<span class="tag">${esc(summary)}</span>` : ""}</h3>
      <div class="blood-grid">
        ${bloodSelect(LTm.AB0_NAME, "Blutgruppe (AB0)", LTm.AB0_OPTIONS, val(LTm.AB0_NAME))}
        ${bloodSelect(LTm.RHESUS_NAME, "Rhesusfaktor", LTm.RHESUS_OPTIONS, val(LTm.RHESUS_NAME))}
        ${bloodSelect(LTm.KELL_NAME, "Kell-System", LTm.KELL_OPTIONS, val(LTm.KELL_NAME))}
      </div>
      <p class="muted small">${esc(LTm.KELL_HINT)}</p>
    </section>
    ${groups}
    <p class="muted small">Angaben, die man meist nur einmal im Leben bestimmt. Die App bewertet nichts.</p>`;
}

// ------------------------------------------------------------------ Blutabnahme erfassen

export function viewLabEdit() {
  const S = X.S;
  const ed = S.labEdit;
  if (!ed) return viewHealth();
  const { analytes } = data();
  const d = ed.draft;
  const e = ed.errors ?? {};
  const field = (k, label, type = "text", extra = "") =>
    `<div class="field ${e[k] ? "has-error" : ""}"><label for="lab-${k}">${esc(label)}</label><input id="lab-${k}" type="${type}" data-lab="${k}" value="${esc(d[k])}" ${extra} autocomplete="off">${e[k] ? `<p class="field-error">${esc(e[k])}</p>` : ""}</div>`;
  const rows = d.results
    .map((r) => {
      const k = `results.${r.key}`;
      const err = (f) => (e[`${k}.${f}`] ? `<p class="field-error">${esc(e[`${k}.${f}`])}</p>` : "");
      const inp = (f, label, extra = "") =>
        `<div class="field ${e[`${k}.${f}`] ? "has-error" : ""}"><label>${esc(label)}</label><input type="text" data-labr="${esc(r.key)}" data-f="${f}" value="${esc(r[f])}" ${extra} autocomplete="off">${err(f)}</div>`;
      return `<div class="lab-row card-inner">
        <div class="field ${e[`${k}.analyteId`] ? "has-error" : ""}"><label>Parameter</label><select data-labr="${esc(r.key)}" data-f="analyteId"><option value="">Bitte wählen …</option>${analyteOptions(analytes, r.analyteId, r.analyteId)}</select>${err("analyteId")}</div>
        <div class="lab-row__grid">
          ${inp("value", "Wert", `inputmode="decimal" placeholder="6,2 oder < 0,5"`)}
          ${inp("unit", "Einheit", `maxlength="20"`)}
          ${inp("refLow", "Referenz von", `inputmode="decimal"`)}
          ${inp("refHigh", "bis", `inputmode="decimal"`)}
        </div>
        <button class="btn sm" data-act="lab-row-remove" data-arg="${esc(r.key)}">Wert entfernen</button>
      </div>`;
    })
    .join("");
  return `${X.header(d.id ? "Blutabnahme bearbeiten" : "Neue Blutabnahme", { back: "health" })}<main class="wrap">
    <section class="card">
      <div class="lab-row__grid">
        ${field("date", "Datum", "date")}
        ${field("time", "Uhrzeit (optional)", "time")}
      </div>
      ${field("lab", "Labor / Praxis (optional)", "text", `maxlength="80"`)}
      <div class="field"><label for="lab-fasting">Nüchtern</label><select id="lab-fasting" data-lab="fasting">
        ${[["", "keine Angabe"], ["yes", "ja"], ["no", "nein"]].map(([v, l]) => `<option value="${v}" ${d.fasting === v ? "selected" : ""}>${l}</option>`).join("")}
      </select></div>
    </section>
    <section class="card">
      <h3>Werte</h3>
      <p class="muted small">Den Referenzbereich so eintragen, wie er im Befund steht (leer = eigener bzw. Vorgabebereich des Parameters). Werte unter bzw. über der Messgrenze mit „&lt;“ bzw. „&gt;“ (z. B. „&lt; 0,5“).</p>
      ${rows}
      <div class="row-actions">
        <button class="btn" data-act="lab-row-add">+ Wert hinzufügen</button>
        <label class="field"><span class="muted small">Ganze Gruppe hinzufügen</span><select data-lab="group"><option value="">Gruppe wählen …</option>${L().LAB_CATEGORIES.map((c) => `<option value="${c}">${esc(L().LAB_CATEGORY_LABELS[c])}</option>`).join("")}</select></label>
      </div>
    </section>
    <section class="card">
      <div class="field ${e.notes ? "has-error" : ""}"><label for="lab-notes">Notiz (optional)</label><textarea id="lab-notes" data-lab="notes" rows="2" maxlength="1000">${esc(d.notes)}</textarea>${e.notes ? `<p class="field-error">${esc(e.notes)}</p>` : ""}</div>
      ${ed.message ? `<p class="field-error">${esc(ed.message)}</p>` : ""}
      <div class="row-actions"><button class="btn primary" data-act="lab-save">Speichern</button><button class="btn" data-go="health">Abbrechen</button></div>
    </section>
  </main>`;
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

function analyteById(id) {
  return H.analytesOf(X.S.catalog, X.S.health, today()).find((a) => a.id === id) ?? null;
}

// ------------------------------------------------------------------ Arztbericht

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function nowLabel() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())} Uhr`;
}

/** Schalter „Secret Protocols“ vom PC (Einstellung `secret_protocols`). */
const secretOn = () => (X.S.catalog?.pc?.settings ?? []).some((s) => s.key === "secret_protocols" && String(s.value) === "1");

function reportState() {
  const S = X.S;
  if (!S.docReport) {
    const t = today();
    S.docReport = { from: D.trends.shiftDays(t, -89), to: t, withHrt: secretOn(), report: null, message: null, pdf: null };
  }
  return S.docReport;
}

function profileOf() {
  const p = X.S.catalog?.pc?.profile?.[0];
  if (!p) return null;
  return { name: p.name ?? "", birthDate: p.birth_date ?? null, birthYear: p.birth_year ?? null, sex: p.sex ?? null, heightCm: p.height_cm ?? 0 };
}

function buildReport(analytes, draws) {
  const r = reportState();
  if (!ISO.test(r.from) || !ISO.test(r.to)) throw new Error("Bitte Beginn und Ende des Zeitraums angeben.");
  if (r.from > r.to) throw new Error("Der Beginn liegt nach dem Ende.");
  const data = O.doctorReportData(buildDb(), r.from, r.to);
  const hrt = r.withHrt && secretOn() ? SD.hrtEntriesOf(X.S.catalog, X.S.super) : null;
  return D.doctorReport.buildDoctorReport({ from: r.from, to: r.to, data, draws, analytes, hrt, profile: profileOf(), today: today() });
}

function reportTab({ analytes, draws }) {
  const r = reportState();
  const secret = secretOn();
  const rep = r.report;
  const quick = [30, 90, 180, 365].map((n) => `<button class="btn sm" data-act="doc-quick" data-arg="${n}">${n === 365 ? "12 Monate" : n === 180 ? "6 Monate" : `${n} Tage`}</button>`).join("");
  void analytes;
  void draws;
  return `<section class="card">
      <h3>Bericht für den Arzttermin</h3>
      <p class="muted small">Knapp und tabellarisch: Laborwerte mit Referenzbereich und Vorwert, Vitalwerte, Gewicht und Körper${secret ? ", auf Wunsch Hormontherapie mit Wirkstoffspiegel" : ""}, Training und Schlaf im gewählten Zeitraum. Das PDF entsteht hier auf dem Handy und verlässt es nur, wenn du es weitergibst.</p>
      <div class="lab-row__grid">
        <div class="field"><label for="doc-from">Von</label><input id="doc-from" type="date" data-doc="from" value="${esc(r.from)}"></div>
        <div class="field"><label for="doc-to">Bis</label><input id="doc-to" type="date" data-doc="to" value="${esc(r.to)}"></div>
      </div>
      <div class="row-actions">${quick}</div>
      ${secret ? `<label class="hrt-check__item"><input type="checkbox" data-doc="withHrt" ${r.withHrt ? "checked" : ""}><span>Hormontherapie und Wirkstoffspiegel einbeziehen</span></label>` : ""}
      <div class="row-actions"><button class="btn" data-act="doc-preview">Vorschau</button><button class="btn primary" data-act="doc-pdf">PDF erstellen</button></div>
      ${r.message ? `<p class="${r.message.tone === "error" ? "field-error" : "muted small"}">${esc(r.message.text)}</p>` : ""}
      <div id="doc-pdf-result">${r.pdf ? `<a class="btn blue block" href="${r.pdf.url}" download="${esc(r.pdf.name)}">${esc(r.pdf.name)}</a>` : ""}</div>
    </section>
    ${
      rep
        ? `<section class="card"><h3>Vorschau ${esc(D.formatDate(rep.from))} – ${esc(D.formatDate(rep.to))}</h3>
      <ul class="plain-list small">
        <li>${rep.drawCount} ${rep.drawCount === 1 ? "Blutabnahme" : "Blutabnahmen"}, ${rep.labs.length} Laborwerte, davon ${rep.flagged.length} außerhalb des Referenzbereichs</li>
        <li>${rep.vitals.length} Vitalwerte, ${rep.body.length} Körperwerte mit Messungen im Zeitraum</li>
        <li>Training: ${rep.training.sessions} Einheiten (${esc(D.formatNumber(rep.training.perWeek, 1))} je Woche) · Schlaf: ${rep.sleep.meanMinutes === null ? "keine Einträge" : `Ø ${esc(D.formatDuration(Math.round(rep.sleep.meanMinutes)))}`}</li>
        ${rep.hrt ? `<li>Hormontherapie: ${rep.hrt.rows.length} ${rep.hrt.rows.length === 1 ? "Präparat" : "Präparate"} mit Gaben im Zeitraum</li>` : ""}
      </ul>
      ${
        rep.flagged.length
          ? `<h4>Außerhalb des Referenzbereichs</h4><ul class="lab-results">${rep.flagged
              .map(
                (f) => `<li class="is-flagged"><span>${esc(f.name)}<br><span class="muted small">${esc(D.formatDate(f.date))} · Referenz ${esc(L().formatRange(f.range) || "–")}</span></span>
            <span class="tnum"><strong>${esc(L().formatLabValue(f.value, f.comparator))}</strong> ${esc(f.unit)} ${flagMark(f.flag)}</span></li>`,
              )
              .join("")}</ul>`
          : ""
      }</section>`
        : ""
    }
    <p class="muted small">Nur eigene Einträge – keine Diagnose, keine Bewertung. Der Wirkstoffspiegel ist eine Modellrechnung und als solche gekennzeichnet.</p>`;
}

async function makePdf() {
  const r = reportState();
  r.message = null;
  if (r.pdf) URL.revokeObjectURL(r.pdf.url);
  r.pdf = null;
  let rep;
  try {
    const d = data();
    rep = buildReport(d.analytes, d.draws);
    r.report = rep;
  } catch (e) {
    r.message = { tone: "error", text: e.message };
    X.rerender();
    return;
  }
  const name = D.doctorReportFileName(rep);
  const bytes = D.doctorReportToPdf(rep, nowLabel());
  const blob = new Blob([bytes], { type: "application/pdf" });
  const file = new File([blob], name, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      r.message = { tone: "ok", text: `„${name}“ weitergegeben.` };
      X.rerender();
      return;
    } catch (e) {
      if (e.name === "AbortError") {
        r.message = { tone: "ok", text: "Abgebrochen." };
        X.rerender();
        return;
      }
    }
  }
  r.pdf = { url: URL.createObjectURL(blob), name };
  r.message = { tone: "ok", text: "Das PDF ist bereit – zum Öffnen oder Sichern antippen:" };
  X.rerender();
}

// ------------------------------------------------------------------ Import

function importState() {
  if (!X.S.labImport) X.S.labImport = { fallbackDate: today(), file: null, error: null, done: null };
  return X.S.labImport;
}

function importPreview(analytes) {
  const st = importState();
  if (!st.file) return null;
  const parsed = D.labImport.parseLabTable(st.file.rows, st.fallbackDate || null);
  const preview = D.labImport.previewRows(parsed.rows, analytes);
  return { parsed, preview };
}

function importTab({ analytes }) {
  const st = importState();
  const p = importPreview(analytes);
  const newNames = p ? [...new Set(p.preview.filter((x) => !x.analyte).map((x) => x.name))] : [];
  return `<section class="card">
      <h3>Laborwerte importieren</h3>
      <div class="field"><label>Datei (CSV oder Excel .xlsx)</label>
        <label class="btn block">Datei auswählen …<input type="file" data-health="import-file" accept=".csv,.txt,.xlsx,.xlsm,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>
        <p class="muted small">${st.file ? esc(st.file.name) : "Noch keine Datei gewählt."}</p></div>
      <div class="field"><label for="imp-date">Datum, falls die Datei keins enthält</label><input id="imp-date" type="date" data-health="import-date" value="${esc(st.fallbackDate)}"></div>
      <p class="muted small">Eine Zeile je Wert mit Spalten wie „Datum“, „Parameter“, „Wert“, „Einheit“, „Referenzbereich“ (z. B. „2,5 - 8,4“ oder „&lt; 200“) – oder je Zeile eine Blutabnahme mit „Datum“ und einer Spalte je Parameter („Testosteron [ng/ml]“). Bekannte Schreibweisen (z. B. „HKT“, „Vitamin D“) werden zugeordnet. Gibt es die Blutabnahme schon, kommen die Werte dazu; vorhandene Werte desselben Parameters werden ersetzt.</p>
      ${st.error ? `<p class="field-error">${esc(st.error)}</p>` : ""}
      ${st.done ? `<p class="ok-note">${esc(st.done)}</p>` : ""}
    </section>
    ${
      p
        ? `<section class="card"><h3>Vorschau: ${esc(st.file.name)} <span class="muted small">(${p.parsed.format === "wide" ? "je Zeile eine Blutabnahme" : "je Zeile ein Wert"})</span></h3>
      ${
        p.preview.length
          ? `<ul class="lab-results">${p.preview
              .map(
                (x) => `<li><span>${esc(x.analyte ? x.analyte.name : x.name)}<br><span class="muted small">Zeile ${x.line} · ${esc(D.formatDate(x.date))}${x.time ? ` ${esc(x.time)}` : ""} · ${
                  x.analyte ? (x.analyte.name.toLowerCase() === x.name.toLowerCase() ? "vorhanden" : `aus „${esc(x.name)}“`) : "wird neu angelegt"
                }${L().formatRange({ low: x.refLow, high: x.refHigh }) ? ` · Referenz ${esc(L().formatRange({ low: x.refLow, high: x.refHigh }))}` : ""}</span>
            ${x.unitDiffers ? `<br><span class="lab-flag small">sonst ${esc(x.analyte?.unit ?? "")} – wird nicht umgerechnet</span>` : ""}</span>
            <span class="tnum">${esc(L().formatLabValue(x.value, x.comparator))} ${esc(x.unit || "")}</span></li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">In der Datei wurden keine Werte gefunden.</p>`
      }
      ${
        p.parsed.skipped.length
          ? `<details><summary>${p.parsed.skipped.length} ${p.parsed.skipped.length === 1 ? "Zeile" : "Zeilen"} übersprungen</summary><ul class="plain-list small">${p.parsed.skipped
              .map((s) => `<li>Zeile ${s.line}: ${esc(s.reason)}${s.text ? ` („${esc(s.text)}“)` : ""}</li>`)
              .join("")}</ul></details>`
          : ""
      }
      ${newNames.length ? `<p class="muted small">Neu angelegt werden: ${esc(newNames.join(", "))}. Gruppe, Einheit und eigenen Bereich kannst du danach unter „Parameter“ anpassen.</p>` : ""}
      <div class="row-actions"><button class="btn primary" data-act="imp-apply" ${p.preview.length ? "" : "disabled"}>${p.preview.length} ${p.preview.length === 1 ? "Wert" : "Werte"} übernehmen</button><button class="btn" data-act="imp-discard">Verwerfen</button></div>
    </section>`
        : ""
    }`;
}

async function readImportFile(f) {
  const st = importState();
  st.error = null;
  st.done = null;
  st.file = null;
  try {
    const name = f.name.toLowerCase();
    let rows;
    if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
      rows = (await D.readXlsx(new Uint8Array(await f.arrayBuffer()), D.browserInflateRaw)).rows;
    } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
      rows = D.parseCsv(await f.text());
    } else if (name.endsWith(".xls")) {
      throw new Error("Das alte Excel-Format (.xls) wird nicht unterstützt. Bitte als .xlsx oder .csv speichern.");
    } else {
      throw new Error("Bitte eine CSV-Datei oder eine Excel-Datei (.xlsx) wählen.");
    }
    st.file = { name: f.name, rows };
  } catch (e) {
    st.error = e.message;
  }
  X.rerender();
}

// ------------------------------------------------------------------ Parameter

const BAR_TEXT = {
  low: "unter dem internationalen Bereich",
  high: "über dem internationalen Bereich",
  normal: "im internationalen Bereich",
  none: "Lage zum Bereich unklar (Messgrenze)",
};

const numText = (n) => (n === null || n === undefined ? "" : L().formatLabNumber(n).replace(/\./g, ""));

function analyteDraft(a) {
  return a
    ? { id: a.id, name: a.name, unit: a.unit, category: a.category, refLow: numText(a.refLow), refHigh: numText(a.refHigh), measurand: a.measurand ?? "", archived: a.archived, builtin: a.builtin, title: a.name }
    : { id: null, name: "", unit: "", category: "other", refLow: "", refHigh: "", measurand: "", archived: false, builtin: false, title: "" };
}

function akhText(a) {
  const own = a.refLow !== null || a.refHigh !== null;
  const known = D.AKH_REFERENCES[a.id];
  if (own && known) return `<span class="muted">eigener Bereich gilt</span>`;
  const r = own ? null : a.defaultRange;
  if (!r) return `<span class="muted">${esc(known && known.unit !== a.unit ? `nur für ${known.unit}` : known ? (known.note ?? "für Profil (Geschlecht/Alter) nicht angegeben") : "–")}</span>`;
  return `${esc(L().formatRange(r))}${r.note ? ` <span class="muted">${esc(r.note)}</span>` : ""}`;
}

function intlText(a, person) {
  const r = D.labIntl.intlRange(a, person);
  if (!r) return `<span class="muted">${esc(D.labIntl.intlMissingText(a))}</span>`;
  return `${esc(L().formatRange(r))}${r.note ? ` <span class="muted">${esc(r.note)}</span>` : ""}`;
}

function rangeBar(a, person, latest) {
  if (!latest) return `<span class="muted small">kein Wert</span>`;
  const { draw, result } = latest;
  const unit = result.unit || a.unit;
  const valueText = `${L().formatLabValue(result.value, result.comparator)} ${unit}`.trim();
  const range = D.labIntl.intlRange(a, person);
  const sameUnit = !result.unit || result.unit === a.unit;
  const p = range && sameUnit ? D.labIntl.placeOnBar(result.value, result.comparator, range) : null;
  if (!p) return `<span class="muted small">${esc(valueText)}${range && !sameUnit ? " (andere Einheit)" : ""}</span>`;
  const text = `${valueText} vom ${D.formatDate(draw.date)}: ${BAR_TEXT[p.flag]}`;
  return `<div class="lab-bar" title="${esc(text)}"><span class="lab-bar__value lab-bar__value--${p.flag}">${esc(valueText)}</span>
    <span class="lab-bar__track" role="img" aria-label="${esc(text)}"><span class="lab-bar__range"></span><span class="lab-bar__marker lab-bar__marker--${p.flag}" style="left:${p.position}%"></span></span></div>`;
}

function analyteEditor(f) {
  const d = f.draft;
  const e = f.errors ?? {};
  const HL = D.hormoneLevel;
  const fld = (k, label, mode = "") =>
    `<div class="field ${e[k] ? "has-error" : ""}"><label for="an-${k}">${esc(label)}</label><input id="an-${k}" type="text" data-an="${k}" value="${esc(d[k])}" ${mode ? `inputmode="${mode}"` : ""} autocomplete="off">${e[k] ? `<p class="field-error">${esc(e[k])}</p>` : ""}</div>`;
  return `<section class="card">
    <h3>${d.id ? `„${esc(d.title)}“ bearbeiten` : "Neuer Parameter"}</h3>
    ${fld("name", "Name")}
    ${fld("unit", "Einheit")}
    <div class="field"><label for="an-category">Gruppe</label><select id="an-category" data-an="category">${L()
      .LAB_CATEGORIES.map((c) => `<option value="${c}" ${c === d.category ? "selected" : ""}>${esc(L().LAB_CATEGORY_LABELS[c])}</option>`)
      .join("")}</select></div>
    <div class="lab-row__grid">${fld("refLow", "Eigener Referenzbereich von", "decimal")}${fld("refHigh", "bis", "decimal")}</div>
    <div class="field"><label for="an-measurand">Wirkstoffspiegel (Superhuman)</label><select id="an-measurand" data-an="measurand"><option value="">nicht verknüpft</option>${HL.MEASURAND_ORDER.map(
      (m) => `<option value="${m}" ${m === d.measurand ? "selected" : ""}>${esc(HL.MEASURAND_LABELS[m])}</option>`,
    ).join("")}</select></div>
    <p class="muted small">Der eigene Bereich gilt nur für Werte, deren Befund keinen Bereich nennt; ohne eigenen Bereich gilt der Bereich des AKH Wien (nach Geschlecht und Alter laut Profil). Mit dem Wirkstoffspiegel verknüpfte Werte stellen den geschätzten Verlauf in echten Einheiten dar.</p>
    ${d.id ? `<label class="hrt-check__item"><input type="checkbox" data-an="archived" ${d.archived ? "checked" : ""}><span>Archiviert (bei neuen Werten nicht mehr zur Auswahl)</span></label>` : ""}
    ${f.message ? `<p class="field-error">${esc(f.message)}</p>` : ""}
    <div class="row-actions"><button class="btn primary" data-act="an-save">Speichern</button><button class="btn" data-act="an-cancel">Abbrechen</button></div>
  </section>`;
}

function analytesTab({ analytes, draws }) {
  const S = X.S;
  const person = H.personOf(S.catalog, today());
  const latest = L().latestResults(draws);
  const groups = L().LAB_CATEGORIES.filter((c) => analytes.some((a) => a.category === c));
  // Am Handy anfangs alle Gruppen zugeklappt (die Liste ist sonst sehr lang)
  const collapsed = new Set(S.anCollapsed ?? groups);
  const allCollapsed = groups.length > 0 && groups.every((c) => collapsed.has(c));
  return `<section class="card">
      <div class="wo-head"><h3>Laborparameter</h3><button class="btn sm primary" data-act="an-new">+ Neuer Parameter</button></div>
      <p class="muted small">Normbereiche hängen von Labor, Methode, Geschlecht und Alter ab. Es gilt der Bereich aus dem Befund, sonst dein eigener Bereich, sonst der Bereich des AKH Wien für dein Geschlecht und Alter laut Profil.</p>
      <div class="row-actions"><button class="btn sm" data-act="an-all">${allCollapsed ? "Alle aufklappen" : "Alle zuklappen"}</button></div>
      ${S.anError ? `<p class="field-error">${esc(S.anError)}</p>` : ""}
    </section>
    ${S.anEdit ? analyteEditor(S.anEdit) : ""}
    ${groups
      .map((c) => {
        const list = analytes.filter((a) => a.category === c);
        const open = !collapsed.has(c);
        const withValues = list.filter((a) => latest.has(a.id)).length;
        return `<section class="card lab-group">
        <button class="lab-group__toggle" data-act="an-toggle" data-arg="${c}" aria-expanded="${open}"><strong>${esc(L().LAB_CATEGORY_LABELS[c])}</strong><span class="muted small">${list.length} Parameter${withValues ? ` · ${withValues} mit Wert` : ""} ${open ? "▴" : "▾"}</span></button>
        ${
          open
            ? `<ul class="lab-analytes">${list
                .map(
                  (a) => `<li class="${a.archived ? "is-archived" : ""}">
            <div class="wo-head"><strong>${esc(a.name)}</strong><span class="muted small">${esc(a.unit || "–")}</span></div>
            <div class="muted small">${a.archived ? "archiviert · " : !a.builtin ? "eigener Parameter · " : ""}${a.resultCount} ${a.resultCount === 1 ? "Wert" : "Werte"}${a.measurand ? ` · Wirkstoffspiegel: ${esc(D.hormoneLevel.MEASURAND_LABELS[a.measurand])}` : ""}</div>
            <dl class="lab-analytes__refs">
              <div><dt>Eigener Bereich</dt><dd>${esc(L().formatRange({ low: a.refLow, high: a.refHigh })) || `<span class="muted">–</span>`}</dd></div>
              <div><dt>Referenz AKH Wien</dt><dd>${akhText(a)}</dd></div>
              <div><dt>Int. Referenzwerte</dt><dd>${intlText(a, person)}</dd></div>
            </dl>
            ${rangeBar(a, person, latest.get(a.id) ?? null)}
            <div class="row-actions"><button class="btn sm" data-act="an-edit" data-arg="${esc(a.id)}">Bearbeiten</button>${!a.builtin && a.resultCount === 0 ? `<button class="btn sm danger" data-act="an-delete" data-arg="${esc(a.id)}">Löschen</button>` : ""}</div>
          </li>`,
                )
                .join("")}</ul>`
            : ""
        }
      </section>`;
      })
      .join("")}
    <p class="muted small">Referenz AKH Wien: Klinisches Institut für Labormedizin, Referenzwerte-Katalog (${esc(D.REFERENCE_URL)}), Stand 10.11.2026 – Erwachsene, nach Geschlecht und Alter laut Profil. Bereiche hängen von Labor und Methode ab – der Bereich auf deinem Befund geht immer vor.</p>
    <p class="muted small">Int. Referenzwerte: ${esc(D.labIntl.INTL_SOURCE)} – niedrigste Untergrenze und höchste Obergrenze aus Laborkatalogen in Österreich, Deutschland, Großbritannien, den USA, Japan und China. Die Spanne ist kein Referenzintervall eines einzelnen Labors und dient nur der Einordnung. Der Balken ordnet den letzten Wert ein: der helle Abschnitt ist der internationale Bereich, links davon liegt darunter, rechts darüber.</p>`;
}

export const healthActions = {
  "health-tab": (el) => {
    X.S.healthTab = el.dataset.arg;
    X.S.lifeEdit = null;
    X.rerender();
  },
  "doc-quick": (el) => {
    const r = reportState();
    r.from = D.trends.shiftDays(today(), -(Number(el.dataset.arg) - 1));
    r.to = today();
    X.rerender();
  },
  "doc-preview": () => {
    const r = reportState();
    r.message = null;
    try {
      const d = data();
      r.report = buildReport(d.analytes, d.draws);
    } catch (e) {
      r.message = { tone: "error", text: e.message };
    }
    X.rerender();
  },
  "doc-pdf": () => makePdf(),
  "imp-discard": () => {
    importState().file = null;
    X.rerender();
  },
  "imp-apply": async () => {
    const S = X.S;
    const st = importState();
    const p = importPreview(data().analytes);
    if (!p?.preview.length) return;
    st.error = null;
    try {
      const r = H.importLabRows(S.catalog, S.health, D.labImport.toImportRows(p.preview), opts());
      await persist();
      st.done = `Übernommen: ${r.resultsAdded} neue und ${r.resultsUpdated} ersetzte Werte in ${r.drawsCreated} neuen und ${r.drawsExtended} vorhandenen Blutabnahmen${r.analytesCreated > 0 ? `, ${r.analytesCreated} neue Parameter (Gruppe „Sonstige“).` : "."}`;
      st.file = null;
    } catch (e) {
      st.error = e.message;
    }
    X.rerender();
  },
  "an-new": () => {
    X.S.anEdit = { draft: analyteDraft(null), errors: {}, message: "" };
    X.S.anError = null;
    X.rerender();
    window.scrollTo(0, 0);
  },
  "an-edit": (el) => {
    const a = data().byId.get(el.dataset.arg);
    if (!a) return;
    X.S.anEdit = { draft: analyteDraft(a), errors: {}, message: "" };
    X.S.anError = null;
    X.rerender();
    window.scrollTo(0, 0);
  },
  "an-cancel": () => {
    X.S.anEdit = null;
    X.rerender();
  },
  "an-save": async () => {
    const S = X.S;
    const f = S.anEdit;
    const d = f.draft;
    const errors = {};
    const parse = (t) => (String(t).trim() === "" ? null : D.parseDecimal(t));
    const low = parse(d.refLow);
    const high = parse(d.refHigh);
    if (low !== null && !Number.isFinite(low)) errors.refLow = "Bitte eine Zahl eintragen.";
    if (high !== null && !Number.isFinite(high)) errors.refHigh = "Bitte eine Zahl eintragen.";
    if (d.name.trim() === "") errors.name = "Bitte einen Namen eintragen.";
    f.errors = errors;
    f.message = "";
    if (Object.keys(errors).length) return X.rerender();
    try {
      H.saveAnalyte(S.catalog, S.health, { id: d.id, name: d.name, unit: d.unit, category: d.category, refLow: low, refHigh: high, measurand: d.measurand || null, archived: d.archived }, opts());
      await persist();
      S.anEdit = null;
      X.toast(`„${d.name.trim()}“ gespeichert.`);
    } catch (e) {
      if (e.field) f.errors = { [e.field]: e.message };
      else f.message = e.message;
    }
    X.rerender();
  },
  "an-delete": (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: Parameter löschen")) return;
    const S = X.S;
    S.anError = null;
    try {
      H.deleteAnalyte(S.catalog, S.health, el.dataset.arg);
    } catch (e) {
      S.anError = e.message;
      return X.rerender();
    }
    change(() => null, "Parameter gelöscht.");
  },
  "an-toggle": (el) => {
    const set = new Set(X.S.anCollapsed ?? L().LAB_CATEGORIES);
    if (set.has(el.dataset.arg)) set.delete(el.dataset.arg);
    else set.add(el.dataset.arg);
    X.S.anCollapsed = [...set];
    X.rerender();
  },
  "an-all": () => {
    const groups = L().LAB_CATEGORIES.filter((c) => data().analytes.some((a) => a.category === c));
    X.S.anCollapsed = groups.every((c) => (X.S.anCollapsed ?? groups).includes(c)) ? [] : groups;
    X.rerender();
  },
  "lab-select": (el) => {
    X.S.healthDraw = el.dataset.arg;
    X.rerender();
  },
  "lab-trend": (el) => {
    X.S.healthTrend = el.dataset.arg;
    X.S.healthTab = "trend";
    X.rerender();
    window.scrollTo(0, 0);
  },
  "lab-new": () => {
    const d = L().emptyDrawDraft(today());
    d.results = [L().emptyResultDraft()];
    X.S.labEdit = { draft: d, errors: {}, message: "" };
    X.go("lab-edit");
  },
  "lab-edit": (el) => {
    const draw = H.drawsOf(X.S.catalog, X.S.health).find((d) => d.id === el.dataset.arg);
    if (!draw) return;
    X.S.labEdit = { draft: L().drawToDraft(draw), errors: {}, message: "" };
    X.go("lab-edit");
  },
  "lab-delete": (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: Blutabnahme mit allen Werten löschen")) return;
    change(() => {
      H.deleteDraw(X.S.catalog, X.S.health, el.dataset.arg);
      X.S.healthDraw = null;
    }, "Blutabnahme gelöscht.");
  },
  "lab-row-add": () => {
    X.S.labEdit.draft.results.push(L().emptyResultDraft());
    X.rerender();
  },
  "lab-row-remove": (el) => {
    const d = X.S.labEdit.draft;
    d.results = d.results.filter((r) => r.key !== el.dataset.arg);
    X.rerender();
  },
  "lab-save": async () => {
    const S = X.S;
    const ed = S.labEdit;
    const { input, errors } = L().draftToInput(ed.draft);
    ed.errors = errors;
    ed.message = "";
    if (!input) {
      ed.message = errors.results ?? "Bitte die markierten Felder prüfen.";
      X.rerender();
      return;
    }
    try {
      const id = H.saveDraw(S.catalog, S.health, input, opts());
      await persist();
      S.labEdit = null;
      S.healthDraw = id;
      S.healthTab = "draws";
      X.toast("Blutabnahme gespeichert.");
      X.go("health");
    } catch (e) {
      ed.message = e.message;
      X.rerender();
    }
  },
  "life-new": (el) => {
    X.S.lifeEdit = { draft: LT().emptyLifetimeDraft(el.dataset.arg), errors: {} };
    X.rerender();
  },
  "life-edit": (el) => {
    const r = H.lifetimeOf(X.S.catalog, X.S.health).find((x) => x.id === el.dataset.arg);
    if (r) X.S.lifeEdit = { draft: LT().lifetimeToDraft(r), errors: {} };
    X.rerender();
  },
  "life-cancel": () => {
    X.S.lifeEdit = null;
    X.rerender();
  },
  "life-save": async () => {
    const S = X.S;
    const ed = S.lifeEdit;
    try {
      H.saveLifetime(S.catalog, S.health, ed.draft, opts());
      await persist();
      S.lifeEdit = null;
      X.toast("Gespeichert.");
    } catch (e) {
      ed.errors = e.field ? { [e.field]: e.message } : {};
      if (!e.field) X.toast(e.message, true);
    }
    X.rerender();
  },
  "life-delete": (el) => {
    if (!X.confirmTwice(el, "Löschen?")) return;
    change(() => H.deleteLifetime(X.S.catalog, X.S.health, el.dataset.arg), "Eintrag gelöscht.");
  },
};

/** Eingaben (ohne neu zu zeichnen); true = behandelt. */
export function healthInput(el) {
  const S = X.S;
  if (el.dataset?.lab && S.labEdit && el.dataset.lab !== "group") {
    S.labEdit.draft[el.dataset.lab] = el.value;
    return true;
  }
  if (el.dataset?.labr && S.labEdit) {
    const row = S.labEdit.draft.results.find((r) => r.key === el.dataset.labr);
    if (row && el.dataset.f !== "analyteId") row[el.dataset.f] = el.value;
    return true;
  }
  if (el.dataset?.life && S.lifeEdit) {
    S.lifeEdit.draft[el.dataset.life] = el.value;
    return true;
  }
  if (el.dataset?.an && S.anEdit) {
    S.anEdit.draft[el.dataset.an] = el.dataset.an === "archived" ? el.checked : el.value;
    if (S.anEdit.errors?.[el.dataset.an]) S.anEdit.errors[el.dataset.an] = "";
    return true;
  }
  if (el.dataset?.doc && el.dataset.doc !== "withHrt") {
    reportState()[el.dataset.doc] = el.value;
    return true;
  }
  return false;
}

/** Auswahlfelder; true = behandelt. */
export function healthChange(el) {
  const S = X.S;
  if (el.dataset?.health === "import-file") {
    const file = el.files?.[0];
    el.value = "";
    if (file) readImportFile(file);
    return true;
  }
  if (el.dataset?.health === "import-date") {
    importState().fallbackDate = el.value;
    X.rerender();
    return true;
  }
  if (el.dataset?.doc === "withHrt") {
    reportState().withHrt = el.checked;
    return true;
  }
  if (el.dataset?.doc) {
    reportState()[el.dataset.doc] = el.value;
    return true;
  }
  if (el.dataset?.an && S.anEdit) {
    healthInput(el);
    return true;
  }
  if (el.dataset?.health === "trend") {
    S.healthTrend = el.value;
    X.rerender();
    return true;
  }
  if (el.dataset?.health === "blood") {
    change(() => H.setBloodGroupField(S.catalog, S.health, el.dataset.name, el.value, opts()), "Gespeichert.");
    return true;
  }
  if (el.dataset?.lab === "group" && S.labEdit) {
    const d = S.labEdit.draft;
    const present = new Set(d.results.map((r) => r.analyteId));
    const fresh = H.analytesOf(S.catalog, S.health, today())
      .filter((a) => a.category === el.value && !a.archived && !present.has(a.id))
      .map((a) => L().emptyResultDraft(a));
    d.results = [...d.results.filter((r) => r.analyteId !== "" || r.value.trim() !== ""), ...fresh];
    X.rerender();
    return true;
  }
  if (el.dataset?.labr && el.dataset.f === "analyteId" && S.labEdit) {
    const row = S.labEdit.draft.results.find((r) => r.key === el.dataset.labr);
    if (row) {
      const fresh = L().emptyResultDraft(analyteById(el.value));
      Object.assign(row, {
        analyteId: el.value,
        unit: row.unit || fresh.unit,
        refLow: row.refLow || fresh.refLow,
        refHigh: row.refHigh || fresh.refHigh,
      });
    }
    X.rerender();
    return true;
  }
  return healthInput(el);
}
