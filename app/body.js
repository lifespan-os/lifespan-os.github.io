// LIFESPAN OS Mobil – Body & Longevity (1.3.0): letzte Werte je Bereich wie am PC
// (Verlauf → „… – letzte Werte“), Verlauf je Messgröße, Werte erfassen und an den PC senden.

import * as B from "./bodydata.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initBody(ctx) {
  X = ctx;
}

export function bodyState(local) {
  return { local: local || B.emptyBodyLocal(), form: null };
}

const S = () => X.S.body;
const esc = (v) => X.esc(v);
const pad = (n) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtNum = (v, d = 1) =>
  v === null || v === undefined ? "–" : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("de-DE", { maximumFractionDigits: d });
const fmtDate = (iso) => {
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
};
const fmtShort = (iso) => {
  const [, m, d] = String(iso).split("-");
  return `${d}.${m}.`;
};
const metrics = () => X.S.catalog?.body?.metrics ?? [];
const metricById = (id) => metrics().find((m) => m.id === id);

async function persist() {
  try {
    await X.store.set("body", S().local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

function blankForm(metricId) {
  return { metricId: metricId ?? metrics()[0]?.id ?? "", date: today(), time: "", value: "", method: "", notes: "", editId: null };
}

// ------------------------------------------------------------------ Formular „Wert erfassen“

function metricOptions(selected) {
  return B.metricSections(metrics())
    .flatMap((s) =>
      s.groups.map(
        (g) => `<optgroup label="${esc(g.label ? `${s.label} – ${g.label}` : s.label)}">${g.metrics
          .map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? "selected" : ""}>${esc(m.name)} (${esc(m.unit)})</option>`)
          .join("")}</optgroup>`,
      ),
    )
    .join("");
}

function formCard({ fixed = false } = {}) {
  const st = S();
  if (!st.form) st.form = blankForm(fixed ? X.S.arg : undefined);
  const f = st.form;
  const m = metricById(f.metricId);
  const values = m ? B.allValues(X.S.catalog, st.local).get(m.id) : [];
  const methods = B.methodsFor(values);
  return `<section class="card" id="body-form"><h3>${f.editId ? "Wert ändern" : "Wert erfassen"}</h3>
    ${
      fixed
        ? ""
        : `<label class="field"><span>Messgröße</span><select data-bf="metricId">${metricOptions(f.metricId)}</select></label>`
    }
    <div class="grid2">
      <label class="field"><span>Datum</span><input type="date" data-bf="date" value="${esc(f.date)}" max="${today()}"></label>
      <label class="field"><span>Uhrzeit (optional)</span><input type="time" data-bf="time" value="${esc(f.time)}"></label>
    </div>
    <label class="field"><span>${esc(m?.name ?? "Wert")}${m ? ` (${esc(m.unit)})` : ""}</span>
      <input type="text" inputmode="decimal" data-bf="value" value="${esc(f.value)}" placeholder="${m ? `${fmtNum(m.min_value, m.decimals)} – ${fmtNum(m.max_value, m.decimals)}` : ""}"></label>
    <label class="field"><span>Messmethode (optional)</span>
      <input type="text" data-bf="method" list="body-methods" value="${esc(f.method)}" placeholder="z. B. Waage, InBody, Labor"></label>
    <datalist id="body-methods">${methods.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
    <label class="field"><span>Notiz (optional)</span><input type="text" data-bf="notes" value="${esc(f.notes)}"></label>
    <p class="muted small">Je Messgröße und Tag gilt ein Wert – ein vorhandener Wert dieses Tages wird ersetzt.</p>
    <button class="btn primary block" data-act="body-save">${f.editId ? "Änderung speichern" : "Wert speichern"}</button>
    ${f.editId ? `<button class="btn ghost block" data-act="body-cancel">Abbrechen</button>` : ""}
  </section>`;
}

// ------------------------------------------------------------------ Ansicht „Body & Longevity“

export function viewBody() {
  const st = S();
  const head = X.header("Body & Longevity", { back: "home" });
  if (!X.S.catalog?.body) {
    return `${head}<main class="wrap"><section class="card"><p class="small">Für die Körperwerte bitte einmal eine neue Exportdatei vom PC laden (Settings → Export am PC, dann hier „Neue Exportdatei laden“).</p></section></main>`;
  }
  const all = B.allValues(X.S.catalog, st.local);
  const withData = metrics().filter((m) => all.get(m.id)?.length);
  const sections = B.metricSections(withData, { categories: B.SUMMARY_CATEGORIES });
  const open = B.unsentBody(st.local);
  return `${head}<main class="wrap">
    ${
      open
        ? `<section class="card hl"><div class="wo-head"><h3>${open} ${open === 1 ? "Wert" : "Werte"} noch nicht am PC</h3></div>
          <button class="btn block" data-go="send">An den PC senden</button></section>`
        : ""
    }
    ${formCard()}
    ${
      sections.length
        ? sections
            .map(
              (sec) => `<section class="card"><h3>${esc(sec.label)} – letzte Werte</h3>
            ${sec.groups
              .map(
                (g) => `${g.label ? `<p class="body-sub">${esc(g.label)}</p>` : ""}<div class="latest">
                ${g.metrics.map((m) => latestRow(m, all.get(m.id))).join("")}</div>`,
              )
              .join("")}
          </section>`,
            )
            .join("")
        : `<section class="card"><p class="empty">Noch keine Werte. Erfasse oben den ersten Wert.</p></section>`
    }
    <p class="muted small">Tippe auf eine Messgröße für ihren Verlauf. Je Messgröße: letzter Wert, Veränderung zum vorherigen Wert und Datum.</p>
  </main>`;
}

function latestRow(m, values) {
  const l = B.latestOf(m, values);
  const hint = B.metricHint(m);
  const open = values?.some((v) => v.local && !v.sent);
  const sign = (d) => (d > 0 ? "+" : d < 0 ? "−" : "±");
  return `<button class="latest-row" data-go="body-metric" data-arg="${esc(m.id)}" ${hint ? `title="${esc(hint)}"` : ""}>
    <span class="latest-row__name">${esc(m.name)}${hint ? ` <span class="info" aria-hidden="true">ⓘ</span>` : ""}${open ? ` <span class="tag">offen</span>` : ""}</span>
    <span class="latest-row__value">${l ? `${fmtNum(l.value, m.decimals)} ${esc(m.unit)}` : "–"}</span>
    <span class="latest-row__meta muted small">${l?.change ? `${sign(l.change.delta)}${fmtNum(Math.abs(l.change.delta), m.decimals)} · ` : ""}${l ? fmtShort(l.date) : ""}</span>
  </button>`;
}

// ------------------------------------------------------------------ Ansicht „Verlauf“ einer Messgröße

export function viewBodyMetric() {
  const st = S();
  const m = metricById(X.S.arg);
  if (!m) return viewBody();
  if (st.form && st.form.metricId !== m.id) st.form = null;
  const values = B.allValues(X.S.catalog, st.local).get(m.id) ?? [];
  const hint = B.metricHint(m);
  const l = B.latestOf(m, values);
  return `${X.header(m.name, { back: "body" })}<main class="wrap">
    ${hint ? `<section class="card"><p class="small">${esc(hint)}</p></section>` : ""}
    <section class="card"><div class="wo-head"><h3>Verlauf</h3>${l ? `<span class="tag">${fmtNum(l.value, m.decimals)} ${esc(m.unit)}</span>` : ""}</div>
      ${values.length > 1 ? chart(m, values) : `<p class="muted small">Für einen Verlauf werden mindestens zwei Werte benötigt.</p>`}
      ${values.length > 1 ? facts(m, values) : ""}
    </section>
    ${formCard({ fixed: true })}
    <section class="card"><h3>Werte</h3>
      ${
        values.length
          ? `<div class="list">${values
              .map(
                (v) => `<div class="meal-item body-value"><span><b>${fmtNum(v.row.value, m.decimals)} ${esc(m.unit)}</b>
                  <span class="muted small">${fmtDate(v.row.date)}${v.row.time ? `, ${esc(v.row.time)} Uhr` : ""}${v.row.method ? ` · ${esc(v.row.method)}` : ""}${v.row.notes ? ` · ${esc(v.row.notes)}` : ""}</span></span>
                  ${
                    v.local && !v.sent
                      ? `<span class="row"><span class="tag">offen</span><button class="btn sm" data-act="body-edit" data-arg="${esc(v.row.id)}">Ändern</button>
                        <button class="btn sm ghost" data-act="body-remove" data-arg="${esc(v.row.id)}">Löschen</button></span>`
                      : `<span class="tag">${v.local ? "gesendet" : "PC"}</span>`
                  }</div>`,
              )
              .join("")}</div>`
          : `<p class="empty">Noch keine Werte.</p>`
      }
    </section>
  </main>`;
}

function facts(m, values) {
  const asc = [...values].reverse();
  const first = asc[0].row;
  const last = asc[asc.length - 1].row;
  const nums = asc.map((v) => v.row.value);
  const d = Math.round((last.value - first.value) * 10 ** m.decimals) / 10 ** m.decimals;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  return `<div class="body-facts small">
    <span>Seit ${fmtDate(first.date)}: <b>${sign}${fmtNum(Math.abs(d), m.decimals)} ${esc(m.unit)}</b></span>
    <span>Min ${fmtNum(Math.min(...nums), m.decimals)} · Max ${fmtNum(Math.max(...nums), m.decimals)} · ${values.length} Messungen</span>
  </div>`;
}

/** Einfaches Liniendiagramm (die letzten 60 Werte), ohne Bibliothek. */
function chart(m, values) {
  const pts = [...values].reverse().slice(-60).map((v) => v.row);
  const W = 320;
  const H = 140;
  const L = 34;
  const R = 8;
  const T = 10;
  const Bm = 22;
  const nums = pts.map((p) => p.value);
  let lo = Math.min(...nums);
  let hi = Math.max(...nums);
  if (hi === lo) {
    lo -= 1;
    hi += 1;
  }
  const padv = (hi - lo) * 0.12;
  lo -= padv;
  hi += padv;
  const t0 = new Date(`${pts[0].date}T12:00:00`).getTime();
  const t1 = new Date(`${pts[pts.length - 1].date}T12:00:00`).getTime();
  const x = (p) => L + (t1 === t0 ? (W - L - R) / 2 : ((new Date(`${p.date}T12:00:00`).getTime() - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - Bm);
  const line = pts.map((p) => `${x(p).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [hi - padv, (hi + lo) / 2, lo + padv];
  return `<svg class="body-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf ${esc(m.name)}">
    ${ticks
      .map(
        (v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/>
      <text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${fmtNum(v, m.decimals)}</text>`,
      )
      .join("")}
    <polyline points="${line}" class="line"/>
    ${pts.map((p) => `<circle cx="${x(p).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.6" class="dot"/>`).join("")}
    <text x="${L}" y="${H - 6}" text-anchor="start">${fmtShort(pts[0].date)}${pts[0].date.slice(0, 4)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${fmtShort(pts[pts.length - 1].date)}${pts[pts.length - 1].date.slice(0, 4)}</text>
  </svg>`;
}

// ------------------------------------------------------------------ Ereignisse

export const bodyActions = {
  "body-save": async () => {
    const st = S();
    const f = st.form;
    const raw = String(f.value).trim().replace(/\s/g, "").replace(",", ".");
    const value = raw === "" ? null : Number(raw);
    try {
      const { replaced } = B.saveValue(
        X.S.catalog,
        st.local,
        { ...f, value: Number.isFinite(value) ? value : null },
        { uuid: () => X.uuid(), now: new Date() },
      );
      await persist();
      const m = metricById(f.metricId);
      X.toast(replaced ? `${m.name}: Wert vom ${fmtDate(f.date)} ersetzt` : `${m.name} gespeichert`);
      st.form = blankForm(f.metricId);
      X.rerender();
    } catch (e) {
      X.toast(e.message, true);
    }
  },
  "body-cancel": () => {
    S().form = blankForm(S().form?.metricId);
    X.rerender();
  },
  "body-edit": (el) => {
    const e = S().local.entries[el.dataset.arg];
    if (!e) return;
    const r = e.row;
    const m = metricById(r.metric_id);
    S().form = {
      metricId: r.metric_id,
      date: r.date,
      time: r.time ?? "",
      value: fmtNum(r.value, m?.decimals ?? 1).replace(/\./g, ""),
      method: r.method ?? "",
      notes: r.notes ?? "",
      editId: r.id,
    };
    X.rerender();
    requestAnimationFrame(() => document.getElementById("body-form")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "body-remove": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: löschen")) return;
    try {
      B.removeValue(S().local, el.dataset.arg);
      await persist();
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
};

/** Eingaben im Formular (ohne neu zu zeichnen). */
export function bodyInput(el) {
  if (!el.dataset.bf || !S()?.form) return false;
  S().form[el.dataset.bf] = el.value;
  return true;
}

/** Messgröße gewechselt: Formular neu zeichnen (Einheit, Bereich, Messmethoden). */
export function bodyChange(el) {
  if (el.dataset.bf !== "metricId") return false;
  S().form.metricId = el.value;
  X.rerender();
  return true;
}
