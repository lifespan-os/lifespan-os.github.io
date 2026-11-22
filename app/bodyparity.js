// LIFESPAN OS Mobil – Body & Longevity: Verlauf, Zeiträume vergleichen, Lebensstil, Messgrößen
// (1.90.0, wie am PC `BodyHistoryTab.tsx`, `CompareTab.tsx`, `LifestyleTab.tsx`, `MetricsTab.tsx`).
// Rechnung aus pcdomain.js (historyRange, trends, stats, energy); Lebensstil-Notizen und eigene
// Messgrößen werden in paritydata.js abgelegt und gehen mit „An den PC senden“ zurück.

import * as D from "./pcdomain.js";
import * as B from "./bodydata.js";
import * as PR from "./paritydata.js";
import { X, today } from "./diary.js";
import { trendSvg, COLOR } from "./pcview.js";
import { refreshCatalog } from "./appbase.js";

const esc = (v) => X.esc(v);
const F = (v, d = 1) => D.formatNumber(v, d);
const L = () => D.labelsAll;
const WEIGHT_METRIC_ID = "00000000-0000-7000-8000-000000000001";
const signed = (v, d) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${F(Math.abs(v), d)}`;

const metrics = () => X.S.catalog?.body?.metrics ?? [];
const valuesOf = () => B.allValues(X.S.catalog, X.S.body?.local ?? { entries: {} });

async function saveParity() {
  await X.store.set("parity", X.S.parity);
  refreshCatalog();
}

const sel = (key, options, cur, label) => {
  // Optionen mit Gruppe (drittes Feld) als <optgroup>, damit die Auswahl kurz bleibt
  let html = "";
  let group = null;
  for (const [v, l, g] of options) {
    if ((g ?? null) !== group) {
      if (group !== null) html += "</optgroup>";
      group = g ?? null;
      if (group !== null) html += `<optgroup label="${esc(group)}">`;
    }
    html += `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`;
  }
  if (group !== null) html += "</optgroup>";
  return `<div class="field"><label for="bp-${key}">${esc(label)}</label><select id="bp-${key}" data-bp="${key}">${html}</select></div>`;
};

// ------------------------------------------------------------------ Verlauf

export function historyTab() {
  const S = X.S;
  const all = valuesOf();
  const withData = metrics().filter((m) => all.get(m.id)?.length);
  if (!withData.length) return `<section class="card"><h3>Verlauf</h3><p class="muted">Noch keine Werte. Erfasse sie unter „Erfassen“.</p></section>`;
  const metric = withData.find((m) => m.id === S.bpMetric) ?? withData.find((m) => m.id === WEIGHT_METRIC_ID) ?? withData[0];
  const preset = S.bpRange ?? "all";
  const range = D.historyRange.rangeFor(preset, today(), S.bpFrom ?? "", S.bpTo ?? "");
  const problem = D.historyRange.rangeError(range);
  const view = S.bpView ?? "values";
  const values = (all.get(metric.id) ?? [])
    .map((v) => ({ id: v.row.id, date: v.row.date, time: v.row.time ?? null, value: Number(v.row.value), method: v.row.method ?? null, notes: v.row.notes ?? null }))
    .filter((v) => !problem && D.historyRange.inRange(v.date, range))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time ?? "").localeCompare(String(b.time ?? "")));
  const d = metric.decimals ?? 1;
  const unit = metric.unit;
  const summary = D.historyRange.summarizeRange(values);
  const rangeActive = preset !== "all";
  const methods = new Set(values.map((v) => v.method ?? ""));
  const sections = B.metricSections(withData);
  const metricOpts = sections.flatMap((s) => s.groups.flatMap((g) => g.metrics.map((m) => [m.id, m.name, g.label ? `${s.label} – ${g.label}` : s.label])));
  const toolbar = `<div class="bp-tools">
    ${sel("metric", metricOpts, metric.id, "Messgröße")}
    ${sel("range", D.historyRange.RANGE_OPTIONS.map((o) => [o.value, o.label]), preset, "Zeitraum")}
    ${sel("view", [["values", "Einzelwerte"], ["month", "Monatsmittel (langfristig)"]], view, "Darstellung")}
    ${
      preset === "custom"
        ? `<div class="field"><label for="bp-from">Von</label><input id="bp-from" type="date" data-bp="from" value="${esc(S.bpFrom ?? "")}"></div>
           <div class="field"><label for="bp-to">Bis</label><input id="bp-to" type="date" data-bp="to" value="${esc(S.bpTo ?? "")}"></div>`
        : ""
    }
  </div>`;
  let body = "";
  if (problem) body = `<p class="warn">${esc(problem)}</p>`;
  else if (!values.length) body = `<p class="muted">Im gewählten Zeitraum gibt es keine Werte für ${esc(metric.name)}.</p>`;
  else {
    const facts = summary && (rangeActive || summary.count > 1)
      ? `<h4 class="logs-sub">${rangeActive ? `Vergleich ${esc(D.trends.formatRange(range.from ?? summary.first.date, range.to ?? summary.last.date))}` : "Vergleich über den gesamten Zeitraum"}</h4>
        <dl class="bp-facts">
          <div><dt>Erster Wert</dt><dd>${esc(F(summary.first.value, d))} ${esc(unit)}<span class="muted small">${esc(D.formatDate(summary.first.date))}</span></dd></div>
          <div><dt>Letzter Wert</dt><dd>${esc(F(summary.last.value, d))} ${esc(unit)}<span class="muted small">${esc(D.formatDate(summary.last.date))}</span></dd></div>
          <div><dt>Veränderung</dt><dd>${esc(signed(summary.change, d))} ${esc(unit)}${summary.changePercent !== null ? `<span class="muted small">${esc(signed(summary.changePercent, 1))} %</span>` : ""}</dd></div>
          <div><dt>Mittel</dt><dd>${esc(F(summary.mean, d))} ${esc(unit)}<span class="muted small">${summary.count} Messungen</span></dd></div>
          <div><dt>Kleinster Wert</dt><dd>${esc(F(summary.min.value, d))} ${esc(unit)}<span class="muted small">${esc(D.formatDate(summary.min.date))}</span></dd></div>
          <div><dt>Größter Wert</dt><dd>${esc(F(summary.max.value, d))} ${esc(unit)}<span class="muted small">${esc(D.formatDate(summary.max.date))}</span></dd></div>
        </dl>`
      : "";
    let chart = "";
    if (view === "month") {
      const months = D.trends.groupByPeriod(values.map((v) => ({ date: v.date, value: v.value })), "month");
      chart = months.length > 1
        ? `${trendSvg(months.map((p) => ({ date: p.start, value: p.mean })), { decimals: d, label: `Monatsmittel ${metric.name}` })}
          <div class="table-scroll"><table class="data-table"><thead><tr><th>Monat</th><th class="tnum">Mittel</th><th class="tnum">Messungen</th></tr></thead><tbody>${[...months]
            .reverse()
            .map((p) => `<tr><td>${esc(p.label)}</td><td class="tnum">${esc(F(p.mean, d))} ${esc(unit)}</td><td class="tnum">${p.count}</td></tr>`)
            .join("")}</tbody></table></div>
          <p class="muted small">Jeder Punkt ist das Mittel der Messungen eines Monats; Monate ohne Messung fehlen.</p>`
        : `<p class="muted">Für Monatsmittel werden Werte aus mindestens zwei Monaten benötigt.</p>`;
    } else if (values.length > 1) {
      const isWeight = metric.id === WEIGHT_METRIC_ID;
      const pts = values.map((v) => ({ date: v.date, value: v.value }));
      let trend = null;
      if (isWeight) trend = D.energy.weightTrendSeries(pts).filter((p) => p.average !== null).map((p) => ({ date: p.date, value: p.average }));
      else if (values.length >= 7) {
        const avg = D.stats.movingAverage(pts.map((p) => p.value), 7);
        trend = pts.map((p, i) => ({ date: p.date, value: avg[i] })).filter((p) => p.value !== null);
      }
      chart = `${trendSvg(pts, { color: COLOR.body, decimals: d, label: `Verlauf ${metric.name}`, trend })}
        ${trend ? `<p class="muted small">${isWeight ? "Die dunkle Linie zeigt den Gewichtstrend: das Mittel aller Messungen der jeweils letzten 7 Tage." : "Die dunkle Linie zeigt das Mittel der jeweils letzten 7 Messungen."}</p>` : ""}`;
    }
    const table = `<div class="table-scroll"><table class="data-table"><thead><tr><th>Datum</th><th class="tnum">Wert</th><th>Methode</th><th>Notiz</th></tr></thead><tbody>${[...values]
      .reverse()
      .map((v) => `<tr><td>${esc(D.formatDate(v.date))}${v.time ? `<span class="muted small dose-ctx__sub">${esc(v.time)} Uhr</span>` : ""}</td><td class="tnum">${esc(F(v.value, d))} ${esc(unit)}</td><td>${esc(v.method ?? "–")}</td><td>${esc(v.notes ?? "–")}</td></tr>`)
      .join("")}</tbody></table></div>
      <button class="btn block" data-go="body-metric" data-arg="${esc(metric.id)}">Werte von ${esc(metric.name)} bearbeiten</button>`;
    body = `${facts}${chart}${methods.size > 1 ? `<p class="muted small">Die Werte stammen aus unterschiedlichen Messmethoden (${esc([...methods].map((m) => m || "ohne Angabe").join(", "))}) und sind nur eingeschränkt miteinander vergleichbar.</p>` : ""}${table}`;
  }
  const hint = B.metricHint(metric);
  return `<section class="card"><h3>Verlauf</h3>${toolbar}${hint ? `<p class="muted small">${esc(hint)}</p>` : ""}${body}</section>`;
}

// ------------------------------------------------------------------ Zeiträume vergleichen

export function compareTab() {
  const S = X.S;
  const t = today();
  const choice = S.bpCmp ?? "4w";
  const initial = D.trends.presetRanges("4w", t);
  const custom = S.bpCmpCustom ?? { a: initial.previous, b: initial.current };
  const ranges = choice === "custom" ? custom : (() => { const p = D.trends.presetRanges(choice, t); return { a: p.previous, b: p.current }; })();
  const invalid = choice === "custom" && [ranges.a, ranges.b].some((r) => !r.from || !r.to || r.from > r.to) ? "Bitte für beide Zeiträume Beginn und Ende angeben; der Beginn muss vor dem Ende liegen." : null;
  const all = valuesOf();
  const rows = invalid
    ? []
    : metrics()
        .filter((m) => all.get(m.id)?.length)
        .map((m) => ({ m, cmp: D.trends.comparePeriods(all.get(m.id).map((v) => ({ date: v.row.date, value: Number(v.row.value) })), ranges.a, ranges.b) }))
        .filter((r) => r.cmp.a.count > 0 || r.cmp.b.count > 0);
  const opts = [...D.trends.RANGE_PRESETS.map((p) => [p.value, `Letzte ${p.label} gegenüber den ${p.label} davor`]), ["custom", "Eigene Zeiträume"]];
  const date = (which, key, label) => `<div class="field"><label for="bp-c${which}${key}">${label}</label><input id="bp-c${which}${key}" type="date" data-bp="c-${which}-${key}" value="${esc(custom[which][key] ?? "")}"></div>`;
  return `<section class="card"><h3>Zeiträume vergleichen</h3>
    ${sel("cmp", opts, choice, "Vergleich")}
    ${choice === "custom" ? `<div class="tl-pick">${date("a", "from", "Zeitraum A von")}${date("a", "to", "Zeitraum A bis")}${date("b", "from", "Zeitraum B von")}${date("b", "to", "Zeitraum B bis")}</div>` : ""}
    ${invalid ? `<p class="warn">${esc(invalid)}</p>` : `<p class="muted small">A: ${esc(D.trends.formatRange(ranges.a.from, ranges.a.to))} · B: ${esc(D.trends.formatRange(ranges.b.from, ranges.b.to))}</p>`}
    ${
      !invalid && !rows.length
        ? `<p class="muted">In beiden Zeiträumen gibt es keine Messwerte.</p>`
        : rows.length
          ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Messgröße</th><th class="tnum">Mittel A</th><th class="tnum">Mittel B</th><th class="tnum">B − A</th></tr></thead><tbody>${rows
              .map(({ m, cmp }) => {
                const f = (v, n) => (v === null ? "keine Werte" : `${F(v, m.decimals)} ${m.unit} (${n}×)`);
                return `<tr><td>${esc(m.name)}<span class="muted small dose-ctx__sub">${esc(L().metricCategoryLabel(m.category))}</span></td><td class="tnum">${esc(f(cmp.a.mean, cmp.a.count))}</td><td class="tnum">${esc(f(cmp.b.mean, cmp.b.count))}</td><td class="tnum">${cmp.difference !== null ? esc(`${signed(cmp.difference, m.decimals)} ${m.unit}`) : `<span class="muted small">${esc(cmp.reason)}</span>`}</td></tr>`;
              })
              .join("")}</tbody></table></div>`
          : ""
    }
    <p class="card__note">Verglichen werden die Mittelwerte der tatsächlich erfassten Messungen (Anzahl in Klammern). Ein Unterschied wird erst ab zwei Messungen je Zeitraum angegeben. Er beschreibt nur deine Werte und ist keine medizinische Bewertung.</p>
  </section>`;
}

// ------------------------------------------------------------------ Lebensstil

const notes = () => [...(X.S.catalog?.pc?.lifestyle_note ?? [])].sort((a, b) => b.date.localeCompare(a.date) || String(b.updated_at).localeCompare(String(a.updated_at)));

export function lifestyleTab() {
  const S = X.S;
  const ed = S.bpNote;
  const cats = L().LIFESTYLE_CATEGORIES;
  if (ed) {
    const e = S.bpNoteErr ?? {};
    return `<section class="card"><h3>${ed.id && notes().some((n) => n.id === ed.id) ? "Notiz bearbeiten" : "Neue Notiz"}</h3>
      <div class="tl-pick"><div class="field"><label for="bp-n-date">Datum</label><input id="bp-n-date" type="date" data-bpn="date" value="${esc(ed.date)}">${e.date ? `<p class="field-error">${esc(e.date)}</p>` : ""}</div>
      <div class="field"><label for="bp-n-cat">Thema</label><select id="bp-n-cat" data-bpn="category">${cats.map((c) => `<option value="${c.value}" ${c.value === ed.category ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select></div></div>
      <div class="field"><label for="bp-n-text">Notiz</label><textarea id="bp-n-text" rows="4" maxlength="5000" data-bpn="text" placeholder="z. B. Seit heute kein Kaffee nach 14 Uhr">${esc(ed.text)}</textarea>${e.text ? `<p class="field-error">${esc(e.text)}</p>` : ""}<p class="muted small">Höchstens 5.000 Zeichen.</p></div>
      <div class="row-actions"><button class="btn primary" data-act="bp-note-save">Speichern</button><button class="btn" data-act="bp-note-cancel">Abbrechen</button>${notes().some((n) => n.id === ed.id) ? `<button class="btn danger" data-act="bp-note-delete">Notiz löschen</button>` : ""}</div>
    </section>`;
  }
  const filter = S.bpNoteCat ?? "";
  const list = notes().filter((n) => !filter || n.category === filter);
  return `<section class="card"><h3>Gewohnheiten &amp; Lebensstil</h3>
    <div class="bp-tools">${sel("note-cat", [["", "Alle Themen"], ...cats.map((c) => [c.value, c.label])], filter, "Thema")}</div>
    <button class="btn primary block" data-act="bp-note-new">Neue Notiz</button>
    ${
      list.length
        ? `<ul class="plain-list note-list">${list
            .map((n) => `<li><button class="bp-note" data-act="bp-note-edit" data-arg="${esc(n.id)}"><span><strong>${esc(D.formatDate(n.date))}</strong> <span class="tag">${esc(L().lifestyleCategoryLabel(n.category))}</span></span><span class="bp-note__text">${esc(n.text)}</span></button></li>`)
            .join("")}</ul>`
        : `<p class="muted">${filter ? "Keine Notizen zu diesem Thema." : "Noch keine Notizen. Halte fest, was du an deinen Gewohnheiten änderst – Insights zeigt sie in der jeweiligen Woche."}</p>`
    }
    <p class="card__note">Freie Notizen zu Gewohnheiten und Lebensstil. Die App wertet die Texte nicht aus. Neue und geänderte Notizen gehen mit „An den PC senden“ an den PC.</p>
  </section>`;
}

// ------------------------------------------------------------------ Messgrößen

function allMetricRows() {
  const local = PR.normParity(X.S.parity);
  const m = new Map((X.S.catalogRaw?.body?.metrics ?? []).map((r) => [r.id, r]));
  for (const e of Object.values(local.rows)) if (e.table === "body_metric") m.set(e.row.id, e.row);
  for (const k of Object.keys(local.deleted)) if (k.startsWith("body_metric:")) m.delete(k.slice(12));
  return [...m.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.name).localeCompare(String(b.name), "de"));
}

export function metricsTab() {
  const S = X.S;
  const ed = S.bpMetricEdit;
  const cats = L().METRIC_CATEGORIES;
  if (ed) {
    const e = S.bpMetricErr ?? {};
    const f = (k, label, extra = "") => `<div class="field"><label for="bp-m-${k}">${label}</label><input id="bp-m-${k}" data-bpm="${k}" value="${esc(ed[k] ?? "")}" ${extra}>${e[k] ? `<p class="field-error">${esc(e[k])}</p>` : ""}</div>`;
    return `<section class="card"><h3>${ed.isNew ? "Neue Messgröße" : "Messgröße bearbeiten"}</h3>
      <div class="tl-pick">${f("name", "Name", 'placeholder="z. B. Nüchternblutzucker" maxlength="60"')}${f("unit", "Einheit", 'placeholder="z. B. mg/dl" maxlength="20"')}
      <div class="field"><label for="bp-m-cat">Kategorie</label><select id="bp-m-cat" data-bpm="category">${cats.map((c) => `<option value="${c.value}" ${c.value === ed.category ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select></div>
      <div class="field"><label for="bp-m-dec">Nachkommastellen</label><select id="bp-m-dec" data-bpm="decimals">${["0", "1", "2", "3"].map((v) => `<option ${v === String(ed.decimals) ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      ${f("min", "Kleinster erlaubter Wert", 'inputmode="decimal"')}${f("max", "Größter erlaubter Wert", 'inputmode="decimal"')}</div>
      <div class="field"><label for="bp-m-desc">Beschreibung (optional)</label><textarea id="bp-m-desc" rows="2" maxlength="500" data-bpm="description">${esc(ed.description ?? "")}</textarea></div>
      <p class="card__note">Der erlaubte Bereich schützt vor Tippfehlern, z. B. 840 statt 84,0. Er ist kein Referenz- oder Normbereich – die App bewertet deine Werte nicht.</p>
      <div class="row-actions"><button class="btn primary" data-act="bp-metric-save">Speichern</button><button class="btn" data-act="bp-metric-cancel">Abbrechen</button></div>
    </section>`;
  }
  const rows = allMetricRows();
  const counts = valuesOf();
  const byCat = cats.map((c) => ({ c, list: rows.filter((m) => m.category === c.value) })).filter((g) => g.list.length);
  return `<section class="card"><h3>Messgrößen</h3>
    <button class="btn primary block" data-act="bp-metric-new">Neue Messgröße</button>
    ${byCat
      .map(
        (g) => `<h4 class="logs-sub">${esc(g.c.label)}</h4><ul class="plain-list bp-metrics">${g.list
          .map((m) => {
            const n = counts.get(m.id)?.length ?? 0;
            return `<li class="${m.archived ? "is-archived" : ""}"><span><strong>${esc(m.name)}</strong> <span class="muted small">${esc(m.unit)} · ${esc(F(m.min_value, m.decimals))}–${esc(F(m.max_value, m.decimals))} · ${n} ${n === 1 ? "Wert" : "Werte"}${m.builtin ? " · vorgegeben" : ""}${m.archived ? " · archiviert" : ""}</span></span>
              <span class="row-actions">${m.builtin ? "" : `<button class="linkbtn" data-act="bp-metric-edit" data-arg="${esc(m.id)}">Bearbeiten</button>`}<button class="linkbtn" data-act="bp-metric-archive" data-arg="${esc(m.id)}">${m.archived ? "Wieder zeigen" : "Archivieren"}</button>${!m.builtin && n === 0 ? `<button class="linkbtn danger" data-act="bp-metric-delete" data-arg="${esc(m.id)}">Löschen</button>` : ""}</span></li>`;
          })
          .join("")}</ul>`,
      )
      .join("")}
    <p class="card__note">Vorgegebene Messgrößen lassen sich nur archivieren. Eigene Messgrößen ohne Werte lassen sich löschen. Archivierte Messgrößen vom PC erscheinen hier erst nach dem nächsten Export. Änderungen gehen mit „An den PC senden“ an den PC.</p>
  </section>`;
}

// ------------------------------------------------------------------ Aktionen

const num = (t) => {
  const s = String(t ?? "").trim().replace(",", ".");
  const n = Number(s);
  return s === "" || !Number.isFinite(n) ? null : n;
};

const readDraft = (attr) => {
  const out = {};
  for (const el of document.querySelectorAll(`[data-${attr}]`)) out[el.dataset[attr]] = el.value;
  return out;
};

export const bodyParityActions = {
  "bp-note-new": () => {
    X.S.bpNote = { id: X.uuid(), date: today(), category: "habit", text: "" };
    X.S.bpNoteErr = null;
    X.rerender();
  },
  "bp-note-edit": (el) => {
    const n = notes().find((x) => x.id === el.dataset.arg);
    if (!n) return;
    X.S.bpNote = { id: n.id, date: n.date, category: n.category, text: n.text, created_at: n.created_at };
    X.S.bpNoteErr = null;
    X.rerender();
  },
  "bp-note-cancel": () => {
    X.S.bpNote = null;
    X.rerender();
  },
  "bp-note-save": async () => {
    const S = X.S;
    const d = { ...S.bpNote, ...readDraft("bpn") };
    const err = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? "")) err.date = "Bitte ein Datum angeben.";
    if (!String(d.text ?? "").trim()) err.text = "Bitte eine Notiz eingeben.";
    if ([...String(d.text ?? "")].length > 5000) err.text = "Höchstens 5.000 Zeichen.";
    if (Object.keys(err).length) {
      S.bpNote = d;
      S.bpNoteErr = err;
      return X.rerender();
    }
    S.parity = PR.normParity(S.parity);
    PR.putRow(S.parity, "lifestyle_note", { id: d.id, date: d.date, category: d.category, text: String(d.text).trim(), created_at: d.created_at });
    await saveParity();
    S.bpNote = null;
    X.toast("Notiz gespeichert");
    X.rerender();
  },
  "bp-note-delete": async (el) => {
    const S = X.S;
    if (!X.confirmTwice(el, "Nochmal tippen: löschen")) return;
    S.parity = PR.normParity(S.parity);
    PR.deleteRow(S.parity, "lifestyle_note", S.bpNote.id);
    await saveParity();
    S.bpNote = null;
    X.toast("Notiz gelöscht");
    X.rerender();
  },
  "bp-metric-new": () => {
    X.S.bpMetricEdit = { isNew: true, id: X.uuid(), name: "", unit: "", category: "other", decimals: "1", min: "0", max: "1000", description: "" };
    X.S.bpMetricErr = null;
    X.rerender();
  },
  "bp-metric-edit": (el) => {
    const m = allMetricRows().find((x) => x.id === el.dataset.arg);
    if (!m) return;
    X.S.bpMetricEdit = { isNew: false, id: m.id, name: m.name, unit: m.unit, category: m.category, decimals: String(m.decimals ?? 1), min: D.formatNumber(m.min_value, m.decimals ?? 1), max: D.formatNumber(m.max_value, m.decimals ?? 1), description: m.description ?? "", row: m };
    X.S.bpMetricErr = null;
    X.rerender();
  },
  "bp-metric-cancel": () => {
    X.S.bpMetricEdit = null;
    X.rerender();
  },
  "bp-metric-save": async () => {
    const S = X.S;
    const d = { ...S.bpMetricEdit, ...readDraft("bpm") };
    const err = {};
    const name = String(d.name ?? "").trim();
    const unit = String(d.unit ?? "").trim();
    if (!name) err.name = "Bitte einen Namen angeben.";
    else if (allMetricRows().some((m) => m.id !== d.id && m.name.toLowerCase() === name.toLowerCase())) err.name = "Diesen Namen gibt es schon.";
    if (!unit) err.unit = "Bitte eine Einheit angeben.";
    const min = num(d.min);
    const max = num(d.max);
    if (min === null) err.min = "Bitte den kleinsten erlaubten Wert angeben.";
    if (max === null) err.max = "Bitte den größten erlaubten Wert angeben.";
    if (min !== null && max !== null && min >= max) err.max = "Der größte Wert muss über dem kleinsten liegen.";
    if (Object.keys(err).length) {
      S.bpMetricEdit = d;
      S.bpMetricErr = err;
      return X.rerender();
    }
    const base = d.row ?? { builtin: 0, archived: 0, position: 1000 + allMetricRows().length };
    S.parity = PR.normParity(S.parity);
    PR.putRow(S.parity, "body_metric", {
      ...base,
      id: d.id,
      name,
      unit,
      category: d.category,
      min_value: min,
      max_value: max,
      decimals: Number(d.decimals) || 0,
      description: String(d.description ?? "").trim() || null,
    });
    await saveParity();
    S.bpMetricEdit = null;
    X.toast(`„${name}“ gespeichert`);
    X.rerender();
  },
  "bp-metric-archive": async (el) => {
    const S = X.S;
    const m = allMetricRows().find((x) => x.id === el.dataset.arg);
    if (!m) return;
    S.parity = PR.normParity(S.parity);
    PR.putRow(S.parity, "body_metric", { ...m, archived: m.archived ? 0 : 1 });
    await saveParity();
    X.toast(m.archived ? `„${m.name}“ wird wieder gezeigt` : `„${m.name}“ archiviert`);
    X.rerender();
  },
  "bp-metric-delete": async (el) => {
    const S = X.S;
    const m = allMetricRows().find((x) => x.id === el.dataset.arg);
    if (!m || m.builtin || valuesOf().get(m.id)?.length) return;
    if (!X.confirmTwice(el, "Nochmal tippen: löschen")) return;
    S.parity = PR.normParity(S.parity);
    PR.deleteRow(S.parity, "body_metric", m.id);
    await saveParity();
    X.toast(`„${m.name}“ gelöscht`);
    X.rerender();
  },
};

export function bodyParityChange(el) {
  const k = el.dataset?.bp;
  if (!k) return false;
  const S = X.S;
  if (k === "metric") S.bpMetric = el.value;
  else if (k === "range") {
    if (el.value === "custom" && !S.bpFrom && !S.bpTo) {
      S.bpFrom = D.trends.shiftDays(today(), -89);
      S.bpTo = today();
    }
    S.bpRange = el.value;
  } else if (k === "view") S.bpView = el.value;
  else if (k === "from") S.bpFrom = el.value;
  else if (k === "to") S.bpTo = el.value;
  else if (k === "cmp") S.bpCmp = el.value;
  else if (k === "note-cat") S.bpNoteCat = el.value;
  else if (k.startsWith("c-")) {
    const [, which, key] = k.split("-");
    const p = D.trends.presetRanges("4w", today());
    S.bpCmpCustom = S.bpCmpCustom ?? { a: { ...p.previous }, b: { ...p.current } };
    S.bpCmpCustom[which][key] = el.value;
  } else return false;
  X.rerender();
  return true;
}
