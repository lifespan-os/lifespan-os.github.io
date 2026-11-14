// LIFESPAN OS Mobil – Body & Longevity (1.3.0): letzte Werte je Bereich wie am PC
// (Verlauf → „… – letzte Werte“), Verlauf je Messgröße, Werte erfassen und an den PC senden.

import * as B from "./bodydata.js";
import * as D from "./pcdomain.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initBody(ctx) {
  X = ctx;
}

export function bodyState(local) {
  return { local: local || B.emptyBodyLocal(), form: null, day: null };
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
    <button class="btn primary block big-entry" data-act="body-day-open">Werte erfassen<small>Alle Messgrößen eines Tages auf einen Blick</small></button>
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
        : `<section class="card"><p class="empty">Noch keine Werte. Tippe auf „Werte erfassen“.</p></section>`
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

// ------------------------------------------------------------------ Ansicht „Werte erfassen“ (1.3.1)

function shiftDate(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// ------------------------------------------------------------------ Aus Bild übernehmen (1.12.0)

/** Karte „Aus Bild übernehmen“: Screenshot der Waagen-Auswertung (Hume) lesen und zuordnen. */
function scaleCard() {
  const sc = S().scale ?? null;
  const rows = sc?.rows ?? null;
  return `<section class="card scale-scan"><h3>Aus Bild übernehmen</h3>
    <p class="muted small">Screenshot der Waagen-Auswertung (Hume) wählen. Übernommen wird je Kachel der aktuelle (rechte) Wert für den oben gewählten Tag; Herzfrequenz bleibt außen vor. Gespeichert wird erst mit „Werte speichern“.</p>
    <label class="btn block ${sc?.busy ? "is-busy" : ""}">${sc?.busy ? "Wird gelesen …" : "Screenshot wählen"}<input type="file" accept="image/*" data-scale="file" hidden ${sc?.busy ? "disabled" : ""}></label>
    <p class="muted small" id="scale-status" role="status">${esc(sc?.status ?? "")}</p>
    ${
      rows
        ? `<ul class="scale-list">${rows
            .map(
              (r) => `<li class="${r.use ? "" : "is-muted"}">
          <label class="scale-list__check"><input type="checkbox" data-scale-use="${r.key}" ${r.use ? "checked" : ""} ${r.metricId ? "" : "disabled"}>
            <span><strong>${esc(r.label)}</strong>${r.name && r.name !== r.label ? `<br><span class="muted small">→ ${esc(r.name)}</span>` : ""}${r.note ? `<br><span class="muted small">${esc(r.note)}</span>` : ""}</span></label>
          ${r.metricId ? `<span class="entry-row__input"><input type="text" inputmode="decimal" data-scale-val="${r.key}" value="${esc(r.text)}" aria-label="Wert ${esc(r.name ?? r.label)}"><span class="unit">${esc(r.unit)}</span></span>` : `<span class="muted">–</span>`}
        </li>`,
            )
            .join("")}</ul>
      <div class="row-actions"><button class="btn primary" data-act="scale-apply">Ins Formular übernehmen</button><button class="btn" data-act="scale-discard">Verwerfen</button></div>`
        : ""
    }
  </section>`;
}

const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Screenshot lesen: Graustufen (dunkel umgekehrt), lange Bilder geteilt, Texterkennung. */
async function readScale(file) {
  const st = S();
  st.scale = { busy: true, status: "Bild wird vorbereitet …", rows: null };
  X.rerender();
  try {
    const { loadImage, recognizeRows } = await import("./ocr.js");
    const img = await loadImage(file);
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    const f = w0 < 1000 ? Math.min(3, 1400 / w0) : Math.min(1, 1600 / w0);
    const w = Math.round(w0 * f);
    const h = Math.round(h0 * f);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const gray = D.scaleScan.prepareGray(ctx.getImageData(0, 0, w, h).data);
    const canvases = D.scaleScan.sliceRanges(gray, w, h, 2000).map(([y0, y1]) => {
      const part = document.createElement("canvas");
      part.width = w;
      part.height = y1 - y0;
      const pctx = part.getContext("2d");
      const out = pctx.createImageData(w, y1 - y0);
      for (let i = 0, j = y0 * w; j < y1 * w; i += 4, j++) {
        out.data[i] = out.data[i + 1] = out.data[i + 2] = gray[j];
        out.data[i + 3] = 255;
      }
      pctx.putImageData(out, 0, 0);
      return part;
    });
    const rows = await recognizeRows(canvases, (text, p) => {
      const el = document.getElementById("scale-status");
      if (el) el.textContent = `${text} ${Math.round((p ?? 0) * 100)} %`;
    });
    const bounds = metrics().map((m) => ({ id: m.id, name: m.name, unit: m.unit, minValue: m.min_value ?? null, maxValue: m.max_value ?? null, decimals: m.decimals ?? 1 }));
    const vals = D.scaleScan.scaleValues(D.scaleScan.readScaleRows(rows), bounds);
    const found = vals.filter((v) => v.value !== null).length;
    st.scale = {
      busy: false,
      status: found ? `${found} Werte erkannt – bitte prüfen und übernehmen.` : "Im Bild wurden keine Werte erkannt. Bitte den Screenshot der Auswertung (Kacheln mit „vorher › aktuell“) wählen.",
      rows: found
        ? vals.map((v) => ({
            key: v.field.key,
            label: v.field.label,
            metricId: v.metric?.id ?? null,
            name: v.metric?.name ?? null,
            unit: v.metric?.unit ?? "",
            text: v.value === null ? "" : String(v.value).replace(".", ","),
            use: v.ok,
            note: v.note,
          }))
        : null,
    };
  } catch (e) {
    st.scale = { busy: false, status: e.message || "Das Bild lässt sich nicht lesen.", rows: null };
  }
  X.rerender();
}

/** Messmethode mit „Hume“ für einen Bereich: bisher verwendet, sonst aus den Settings vom PC. */
function humeMethod(category) {
  const used = B.methodsInCategory(X.S.catalog, S().local, category).find((m) => /hume/i.test(m));
  if (used) return used;
  try {
    const raw = (X.S.catalog?.pc?.settings ?? []).find((s) => s.key === "measurement_methods")?.value;
    const list = raw ? JSON.parse(raw)[category] ?? [] : [];
    return list.find((m) => /hume/i.test(m)) ?? null;
  } catch {
    return null;
  }
}

export function viewBodyEntry() {
  const st = S();
  if (!X.S.catalog?.body) return viewBody();
  if (!st.day) st.day = B.dayForm(X.S.catalog, st.local, today());
  const d = st.day;
  const all = B.allValues(X.S.catalog, st.local);
  const sections = B.metricSections(metrics());
  const wd = WEEKDAYS[new Date(`${d.date}T12:00:00`).getDay()];
  return `${X.header("Werte erfassen", { back: "body" })}<main class="wrap body-entry">
    <section class="card day-nav">
      <button class="btn sm" data-act="body-day-shift" data-arg="-1" aria-label="Vortag">‹</button>
      <label class="day-nav__date"><span class="muted small">${d.date === today() ? "Heute" : wd}</span>
        <input type="date" data-bd="date" value="${esc(d.date)}" max="${today()}" aria-label="Tag"></label>
      <button class="btn sm" data-act="body-day-shift" data-arg="1" aria-label="Folgetag" ${d.date >= today() ? "disabled" : ""}>›</button>
    </section>
    ${d.errors.date ? `<p class="err small">${esc(d.errors.date)}</p>` : ""}
    ${scaleCard()}
    <nav class="entry-jump">${sections.map((sec) => `<button type="button" data-act="body-jump" data-arg="be-${sec.category}">${esc(sec.label)}</button>`).join("")}</nav>
    ${sections
      .map((sec) => {
        const methods = B.methodsInCategory(X.S.catalog, st.local, sec.category);
        return `<section class="card" id="be-${sec.category}"><h3>${esc(sec.label)}</h3>
        <div class="grid2 entry-meta">
          <label class="field"><span>Messmethode</span>
            <input type="text" data-bd="method" data-cat="${sec.category}" list="bm-${sec.category}" value="${esc(d.methods[sec.category] ?? "")}" placeholder="optional"></label>
          <label class="field"><span>Uhrzeit</span>
            <input type="time" data-bd="time" data-cat="${sec.category}" value="${esc(d.times[sec.category] ?? "")}"></label>
        </div>
        ${d.errors[`time-${sec.category}`] ? `<p class="err small">${esc(d.errors[`time-${sec.category}`])}</p>` : ""}
        <datalist id="bm-${sec.category}">${methods.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
        ${sec.groups
          .map(
            (g) => `${g.label ? `<p class="body-sub">${esc(g.label)}</p>` : ""}${g.metrics
              .map((m) => {
                const last = (all.get(m.id) ?? []).find((v) => v.row.date < d.date);
                const hint = B.metricHint(m);
                return `<label class="entry-row" ${hint ? `title="${esc(hint)}"` : ""}>
                  <span class="entry-row__name">${esc(m.name)}${hint ? ` <span class="info" aria-hidden="true">ⓘ</span>` : ""}
                    ${last ? `<span class="muted small">zuletzt ${fmtNum(last.row.value, m.decimals)} (${fmtShort(last.row.date)})</span>` : ""}</span>
                  <span class="entry-row__input"><input type="text" inputmode="decimal" enterkeyhint="next" data-bd="value" data-id="${esc(m.id)}"
                    value="${esc(d.values[m.id] ?? "")}" ${d.errors[m.id] ? 'aria-invalid="true"' : ""} aria-label="${esc(m.name)}"><span class="unit">${esc(m.unit)}</span></span>
                  ${d.errors[m.id] ? `<span class="err small entry-row__err">${esc(d.errors[m.id])}</span>` : ""}
                </label>`;
              })
              .join("")}`,
          )
          .join("")}
      </section>`;
      })
      .join("")}
    <div class="entry-save"><button class="btn primary block" data-act="body-day-save">Werte speichern</button></div>
    <p class="muted small">Messmethode und Uhrzeit gelten für alle Werte ihres Bereichs. Ein geleertes Feld entfernt einen noch nicht gesendeten Wert dieses Tages; Werte vom PC bleiben bestehen.</p>
  </main>`;
}

// ------------------------------------------------------------------ Ereignisse

export const bodyActions = {
  "scale-discard": () => {
    S().scale = null;
    X.rerender();
  },
  "scale-apply": () => {
    const st = S();
    const d = st.day;
    const rows = st.scale?.rows ?? [];
    const picked = rows.filter((r) => r.use && r.metricId && r.text.trim() && metricById(r.metricId));
    for (const r of picked) {
      d.values[r.metricId] = r.text.trim();
      delete d.errors[r.metricId];
    }
    for (const cat of new Set(picked.map((r) => metricById(r.metricId).category))) {
      if (!d.methods[cat]) {
        const hume = humeMethod(cat);
        if (hume) d.methods[cat] = hume;
      }
      if (d.date === today() && !d.times[cat]) d.times[cat] = nowTime();
    }
    st.scale = { busy: false, status: `${picked.length} ${picked.length === 1 ? "Wert" : "Werte"} übernommen – bitte prüfen und mit „Werte speichern“ speichern.`, rows: null };
    X.rerender();
  },
  "body-jump": (el) => document.getElementById(el.dataset.arg)?.scrollIntoView({ block: "start", behavior: "smooth" }),
  "body-day-open": () => {
    S().day = B.dayForm(X.S.catalog, S().local, today());
    X.go("body-entry");
  },
  "body-day-shift": (el) => {
    const d = S().day;
    const next = shiftDate(d.date, Number(el.dataset.arg));
    if (next > today()) return;
    S().day = B.dayForm(X.S.catalog, S().local, next);
    X.rerender();
  },
  "body-day-save": async () => {
    const st = S();
    const d = st.day;
    const r = B.saveDay(X.S.catalog, st.local, d, { uuid: () => X.uuid(), now: new Date() });
    if (Object.keys(r.errors).length) {
      d.errors = r.errors;
      X.rerender();
      X.toast(`Bitte ${Object.keys(r.errors).length === 1 ? "einen Wert" : `${Object.keys(r.errors).length} Werte`} prüfen.`, true);
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"], .err')?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    await persist();
    const parts = [
      r.saved ? `${r.saved} ${r.saved === 1 ? "Wert" : "Werte"} gespeichert` : "",
      r.removed ? `${r.removed} entfernt` : "",
    ].filter(Boolean);
    X.toast(parts.length ? parts.join(", ") : "Keine Änderungen");
    if (r.kept) X.toast(`${parts.join(", ")}${parts.length ? ". " : ""}Werte vom PC lassen sich nur am PC löschen.`);
    st.day = B.dayForm(X.S.catalog, st.local, d.date);
    X.go("body");
  },
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
  if (el.dataset.scaleVal && S()?.scale?.rows) {
    const r = S().scale.rows.find((x) => x.key === el.dataset.scaleVal);
    if (r) {
      r.text = el.value;
      r.use = true;
    }
    return true;
  }
  if (el.dataset.scale || el.dataset.scaleUse) return true;
  const d = S()?.day;
  if (el.dataset.bd && d) {
    if (el.dataset.bd === "value") {
      d.values[el.dataset.id] = el.value;
      if (d.errors[el.dataset.id]) {
        delete d.errors[el.dataset.id];
        el.removeAttribute("aria-invalid");
      }
    } else if (el.dataset.bd === "method") d.methods[el.dataset.cat] = el.value;
    else if (el.dataset.bd === "time") d.times[el.dataset.cat] = el.value;
    return el.dataset.bd !== "date";
  }
  if (!el.dataset.bf || !S()?.form) return false;
  S().form[el.dataset.bf] = el.value;
  return true;
}

/** Messgröße gewechselt: Formular neu zeichnen (Einheit, Bereich, Messmethoden). */
export function bodyChange(el) {
  if (el.dataset.scale === "file") {
    const file = el.files?.[0];
    el.value = "";
    if (file) readScale(file);
    return true;
  }
  if (el.dataset.scaleUse && S()?.scale?.rows) {
    const r = S().scale.rows.find((x) => x.key === el.dataset.scaleUse);
    if (r) r.use = el.checked;
    X.rerender();
    return true;
  }
  if (el.dataset.scaleVal) return bodyInput(el);
  if (el.dataset.bd === "date") {
    if (el.value && el.value <= today()) S().day = B.dayForm(X.S.catalog, S().local, el.value);
    X.rerender();
    return true;
  }
  if (el.dataset.bf !== "metricId") return false;
  S().form.metricId = el.value;
  X.rerender();
  return true;
}
