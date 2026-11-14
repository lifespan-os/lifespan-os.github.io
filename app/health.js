// LIFESPAN OS Mobil – Health wie am PC (1.10.0): Blutabnahmen (Liste, Werte mit Referenzbereich
// und ↑/↓, erfassen, bearbeiten, löschen), Verlauf je Parameter (Diagramm mit Referenzband) und
// „Once in a Lifetime“ (Blutgruppe, Lp(a), Gentests usw.) wie HealthPage.tsx, LabDrawsTab.tsx,
// LabTrendTab.tsx und LifetimeTab.tsx. Arztbericht, Import und Parameterpflege bleiben am PC.
// Logik: healthdata.js (wie repo/lab.rs, repo/lifetime.rs). Änderungen gehen mit der Datei
// „Körperwerte“ an den PC.

import * as H from "./healthdata.js";
import * as D from "./pcdomain.js";
import { today } from "./diary.js";

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
  ["lifetime", "Once in a Lifetime"],
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
  const body = tab === "trend" ? trendTab(d) : tab === "lifetime" ? lifetimeTab(d) : drawsTab(d);
  return `${X.header("Health")}<main class="wrap">
    <p class="muted small">Laborwerte mit Referenzbereichen: Blutabnahmen erfassen, Verläufe mit Normbereich und markierten Ausreißern sowie einmalig bestimmte Angaben wie Blutgruppe oder Gentests.</p>
    <nav class="tabs" aria-label="Health">${TABS.map(
      ([v, l]) => `<button class="tab ${v === tab ? "active" : ""}" data-act="health-tab" data-arg="${v}" ${v === tab ? 'aria-current="page"' : ""}>${l}</button>`,
    ).join("")}</nav>
    ${pending ? `<p class="muted small">${pending} ${pending === 1 ? "Änderung" : "Änderungen"} in Health noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    ${body}
    <p class="muted small">Arztbericht (PDF), Import aus CSV/Excel und die Pflege der Parameter gibt es am PC.</p>
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

export const healthActions = {
  "health-tab": (el) => {
    X.S.healthTab = el.dataset.arg;
    X.S.lifeEdit = null;
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
  return false;
}

/** Auswahlfelder; true = behandelt. */
export function healthChange(el) {
  const S = X.S;
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
