// LIFESPAN OS Mobil – Griffkraft erfassen (1.145.0, Wunsch des Nutzers 25.11.2026: wie am PC
// unter Body & Longevity → Erfassen → Fitness & Longevity, GripPanel.tsx). Eingabe beider Hände
// (bester Versuch), dominante Hand, Messmethode, Uhrzeit (Pflicht), Notiz; sofortige Einordnung
// nach Normwerten (D.grip aus src/domain/grip.ts), Verlauf mit Linien und Tabelle, Löschen.
// Gespeichert wird wie in Quick Fill über `logsdata.saveGrip` (geht mit „An den PC senden“ zurück).

import * as D from "./pcdomain.js";
import * as L from "./logsdata.js";
import * as PS from "./pcsettings.js";
import { buildDb } from "./diary.js";
import { appDay } from "./appday.js";
import { autoAttrs, autoSaveHtml } from "./autosave.js";

let X = null; // { S, esc, toast, store, uuid, rerender, confirmTwice }

const G = () => D.grip;
const esc = (v) => X.esc(v);
const pad = (n) => String(n).padStart(2, "0");
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmt = (n, d = 1) => Number(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const kg = (n) => `${fmt(n, 1)} kg`;
const fmtDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const fmtShort = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

export function initGrip(ctx) {
  X = ctx;
  // Eingaben merken (überstehen das Neuzeichnen); Auswertung nach dem Verlassen des Feldes
  document.addEventListener("input", (ev) => {
    const el = ev.target.closest?.("[data-grip]");
    if (!el || !X.S.body?.grip) return;
    X.S.body.grip[el.dataset.grip] = el.value;
    delete X.S.body.grip.errors?.[el.dataset.grip];
  });
}

/** Messungen im Format des PCs (camelCase), älteste zuerst. */
export function gripMeasurements(db) {
  return (db.grip ?? [])
    .map((g) => ({
      id: g.id,
      date: g.date,
      time: g.time ?? null,
      leftKg: Number(g.left_kg),
      rightKg: Number(g.right_kg),
      dominantHand: g.dominant_hand ?? null,
      sex: g.sex ?? null,
      ageYears: g.age_years ?? null,
      heightCm: g.height_cm ?? null,
      notes: g.notes ?? null,
      method: g.method ?? null,
      updatedAt: g.updated_at ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Profil im Format des PCs (für Alter und Körpergröße). */
export function gripProfile(db) {
  const p = db.profile;
  if (!p) return null;
  return { sex: p.sex ?? null, heightCm: p.height_cm ?? null, birthDate: p.birth_date ?? null, birthYear: p.birth_year ?? null };
}

/** Kommazahl lesen (1 bis 150 kg), sonst null. */
export function parseKg(text) {
  const t = String(text ?? "").trim();
  const n = Number(t.replace(",", "."));
  return t !== "" && Number.isFinite(n) && n > 0 && n <= G().GRIP_MAX_KG ? n : null;
}

const inputOf = (n) => (n === null || n === undefined ? "" : String(Math.round(n * 10) / 10).replace(".", ","));

/** Formular für einen Tag (vorhandene Messung oder neu wie am PC vorbelegt). */
function formFor(date, list) {
  const existing = list.find((m) => m.date === date) ?? null;
  const lastWith = (k) => [...list].reverse().find((m) => m[k])?.[k] ?? "";
  return {
    date,
    stamp: existing?.updatedAt ?? "neu",
    left: existing ? inputOf(existing.leftKg) : "",
    right: existing ? inputOf(existing.rightKg) : "",
    dominant: existing ? existing.dominantHand ?? "" : lastWith("dominantHand"),
    method: existing ? existing.method ?? "" : lastWith("method"),
    time: existing?.time ?? (!existing && date === appDay() ? nowTime() : ""),
    sex: existing?.sex ?? "",
    notes: existing?.notes ?? "",
    errors: {},
  };
}

function state(date, list) {
  const st = X.S.body;
  const existing = list.find((m) => m.date === date) ?? null;
  const stamp = existing?.updatedAt ?? "neu";
  if (!st.grip || st.grip.date !== date || (st.grip.stamp !== stamp && !st.grip.dirty)) st.grip = formFor(date, list);
  return st.grip;
}

function methodsList(db, current) {
  let list = [];
  try {
    list = PS.parseMethods(db.settings.get("measurement_methods") ?? null).grip ?? [];
  } catch {
    list = [];
  }
  return current && !list.includes(current) ? [...list, current] : list;
}

function select(id, field, value, options, label) {
  return `<label class="field"><span>${esc(label)}</span><select id="${id}" data-grip="${field}">${options
    .map((o) => `<option value="${esc(o.value)}" ${o.value === value ? "selected" : ""}>${esc(o.label)}</option>`)
    .join("")}</select></label>`;
}

/** Auswertung wie GripEvaluationView am PC. */
function evaluationHtml(ev, change, saved) {
  if (!ev) return `<div class="grip-eval grip-eval--empty"><p class="muted small">Trage für beide Hände den besten Versuch ein – die Auswertung erscheint sofort.</p></div>`;
  if (!ev.ok) return `<div class="grip-eval grip-eval--empty"><p class="err small">${esc(ev.reason)}</p></div>`;
  const { result, person } = ev;
  const level = G().levelOf(result.category);
  const idx = G().GRIP_LEVELS.indexOf(level);
  const next = G().nextLevelLabel(result.category);
  const limits = G().levelLimitsKg(result.norm);
  const seg = G()
    .GRIP_LEVELS.map((l, i) => `<span class="grip-scale__seg grip-lv--${i}${l.category === result.category ? " is-current" : ""}" style="flex-grow:${l.to - l.from}" title="${esc(`${l.label}: ${l.range}`)}"></span>`)
    .join("");
  const side =
    result.asymmetry.strongerHand === "equal"
      ? "Beide Hände gleich stark."
      : `${result.asymmetry.strongerHand === "left" ? "Links" : "Rechts"} ${fmt(result.asymmetry.percent, 1)} % stärker.`;
  return `<section class="grip-eval" aria-label="Auswertung der Griffkraft">
    <div class="grip-eval__head">
      <div><p class="muted small">Durchschnitt beider Hände</p><p class="grip-eval__value">${kg(result.averageKg)}</p>
        ${change && saved ? `<p class="muted small">${change.kg === 0 ? "unverändert" : `${change.kg > 0 ? "+" : "−"}${fmt(Math.abs(change.kg), 1)} kg`} seit ${fmtDate(change.previousDate)}</p>` : ""}</div>
      <div class="grip-eval__verdict"><span class="grip-lv grip-lv--${idx}">${esc(level.label)}</span>
        <p class="grip-eval__pct">${fmt(result.percentile, 1)}. Perzentil</p>
        <p class="muted small">stärker als ${fmt(result.percentile, 0)} % der Vergleichsgruppe</p></div>
    </div>
    <div class="grip-scale" aria-hidden="true">${seg}<span class="grip-scale__marker" style="left:${G().markerPosition(result.percentile)}%"></span></div>
    <div class="grip-scale__kg muted small" aria-hidden="true"><span style="left:10%">${fmt(limits.p10, 1)}</span><span style="left:50%">Ø ${fmt(result.norm.mean_kg, 1)}</span><span style="left:90%">${fmt(limits.p90, 1)} kg</span></div>
    <p class="small">${esc(level.text)}</p>
    <dl class="grip-eval__facts small">
      <div><dt>Vergleichsgruppe</dt><dd>${esc(G().describeNorm(result.norm))}${person.ageYears !== null && person.heightCm !== null ? ` <span class="muted">(du: ${person.ageYears} Jahre, ${fmt(person.heightCm, 0)} cm)</span>` : ""}</dd></div>
      <div><dt>Abstand zum Durchschnitt</dt><dd>${result.diffToMeanKg >= 0 ? "+" : "−"}${fmt(Math.abs(result.diffToMeanKg), 1)} kg (${result.percentOfMean} % von ${fmt(result.norm.mean_kg, 1)} kg)</dd></div>
      <div><dt>Bis zur nächsten Stufe</dt><dd>${result.kgToNextLevel === null || next === null ? "Höchste Stufe erreicht." : `${kg(Math.max(0.1, result.kgToNextLevel))} mehr für „${esc(next)}“`}</dd></div>
      <div><dt>Seitenvergleich</dt><dd>${side}${result.asymmetry.message ? ` <span class="grip-warn">${esc(result.asymmetry.message)}</span>` : ""}</dd></div>
    </dl>
    ${result.heightClamped ? `<p class="muted small">Für deine Körpergröße gibt es keine eigene Normgruppe; verglichen wird mit der nächstliegenden (${esc(G().describeNorm(result.norm))}).</p>` : ""}
    ${saved ? "" : `<p class="muted small">Vorschau – noch nicht gespeichert.</p>`}
  </section>`;
}

/** Verlauf als Linien (Durchschnitt, links, rechts) mit Normlinien der aktuellen Gruppe. */
function chartSvg(points, limits, mean) {
  if (points.length < 2) return "";
  const W = 340;
  const H = 150;
  const padL = 30;
  const padR = 8;
  const padT = 8;
  const padB = 20;
  const vals = points.flatMap((p) => [p.left, p.right]).concat(limits ? [limits.p10, limits.p90] : []);
  const lo = Math.max(0, Math.floor(Math.min(...vals) - 3));
  const hi = Math.ceil(Math.max(...vals) + 3);
  const x = (i) => padL + (i * (W - padL - padR)) / (points.length - 1);
  const y = (v) => padT + ((hi - v) * (H - padT - padB)) / (hi - lo || 1);
  const line = (k, cls) => `<polyline class="${cls}" fill="none" points="${points.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ")}"/>`;
  const ref = (v, cls, label) => `<line class="${cls}" x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="grip-chart__ref" x="${W - padR}" y="${(y(v) - 3).toFixed(1)}" text-anchor="end">${label}</text>`;
  const step = Math.max(1, Math.ceil(points.length / 5));
  const ticks = points.map((p, i) => (i % step === 0 || i === points.length - 1 ? `<text class="grip-chart__tick" x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="middle">${fmtShort(p.date)}</text>` : "")).join("");
  return `<svg class="grip-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf der Griffkraft, ${points.length} Messungen">
    <text class="grip-chart__tick" x="2" y="${y(hi) + 8}">${hi}</text><text class="grip-chart__tick" x="2" y="${y(lo)}">${lo}</text>
    ${limits ? ref(limits.p90, "grip-chart__p90", "Top 10 %") + ref(mean, "grip-chart__mean", "Ø Norm") + ref(limits.p10, "grip-chart__p10", "untere 10 %") : ""}
    ${line("left", "grip-chart__left")}${line("right", "grip-chart__right")}${line("average", "grip-chart__avg")}${ticks}
  </svg>
  <p class="muted small grip-chart__legend"><span class="grip-key grip-key--avg"></span> Durchschnitt <span class="grip-key grip-key--left"></span> Links <span class="grip-key grip-key--right"></span> Rechts</p>`;
}

function historyHtml(list, profile, selected) {
  if (!list.length) return `<div class="grip-history"><h4>Verlauf</h4><p class="muted small">Noch keine Griffkraft-Messung gespeichert.</p></div>`;
  const latest = list.at(-1);
  const latestEval = G().evaluateMeasurement(latest, profile);
  const limits = latestEval.ok ? G().levelLimitsKg(latestEval.result.norm) : null;
  const points = G().gripChartPoints(list, profile);
  const window90 = D.gripTiming.usualGripWindow(list.map((m) => m.time));
  const rows = [...list]
    .reverse()
    .map((m) => {
      const ev = G().evaluateMeasurement(m, profile);
      const lv = ev.ok ? G().levelOf(ev.result.category) : null;
      const outside = D.gripTiming.inGripWindow(m.time, window90) === false;
      return `<div class="grip-row${m.date === selected ? " is-selected" : ""}">
        <div class="grip-row__main"><b>${fmtDate(m.date)}</b>${m.time ? ` <span class="muted small">${esc(m.time)}</span>` : ` <span class="muted small">ohne Uhrzeit</span>`}
          ${outside ? `<span class="grip-warn small">außerhalb des Messfensters</span>` : ""}
          <span class="muted small">links ${kg(m.leftKg)}${m.dominantHand === "left" ? " (dom.)" : ""} · rechts ${kg(m.rightKg)}${m.dominantHand === "right" ? " (dom.)" : ""}${m.method ? ` · ${esc(m.method)}` : ""}</span>
          ${m.notes ? `<span class="muted small">${esc(m.notes)}</span>` : ""}</div>
        <div class="grip-row__right"><b>${kg(G().averageKg(m.leftKg, m.rightKg))}</b>
          ${lv ? `<span class="grip-lv grip-lv--${G().GRIP_LEVELS.indexOf(lv)}">${esc(lv.label)}</span><span class="muted small">${fmt(ev.result.percentile, 1)}. Perz.</span>` : `<span class="muted small">keine Einordnung</span>`}
          ${ev.ok && ev.result.asymmetry.flagged ? `<span class="grip-warn small">Seitenunterschied</span>` : ""}
          ${m.date !== selected ? `<button class="linkbtn small" data-act="grip-open" data-arg="${esc(m.date)}">Öffnen</button>` : ""}</div>
      </div>`;
    })
    .join("");
  return `<div class="grip-history"><h4>Verlauf</h4>
    ${chartSvg(points, limits, latestEval.ok ? latestEval.result.norm.mean_kg : null)}
    ${limits && latestEval.ok ? `<p class="muted small">Linien: Normwerte deiner aktuellen Vergleichsgruppe (${esc(G().describeNorm(latestEval.result.norm))}).</p>` : ""}
    <div class="grip-rows">${rows}</div>
    <p class="muted small">Dominante Hand: ${latest.dominantHand ? G().HAND_LABEL[latest.dominantHand] : "keine Angabe"}. ${esc(D.gripTiming.gripWindowText(window90))} „Öffnen“ springt zum Tag der Messung, dort kannst du sie ändern oder löschen.</p>
  </div>`;
}

/** Griffkraft für den Tag `date` (unter „Fitness & Longevity“ in „Werte erfassen“). */
/** Letzte Messung als kurzer Text für die Übersicht (1.150.0), sonst null. */
export function gripLatestText() {
  if (!G()) return null;
  const list = gripMeasurements(buildDb());
  const m = list[list.length - 1];
  if (!m) return null;
  return `Zuletzt links ${kg(m.leftKg)}, rechts ${kg(m.rightKg)} am ${fmtDate(m.date)}`;
}

export function gripPanelHtml(date) {
  if (!G()) return "";
  const db = buildDb();
  const list = gripMeasurements(db);
  const profile = gripProfile(db);
  const f = state(date, list);
  const existing = list.find((m) => m.date === date) ?? null;
  const isToday = date === appDay();
  const window90 = D.gripTiming.usualGripWindow(list.filter((m) => m.date !== date).map((m) => m.time));
  const outside = f.time !== "" && D.gripTiming.inGripWindow(f.time, window90) === false;
  const askSex = profile?.sex !== "male" && profile?.sex !== "female";
  const l = parseKg(f.left);
  const r = parseKg(f.right);
  const live =
    l !== null && r !== null
      ? G().evaluateFor(l, r, f.dominant || null, { sex: (f.sex || (askSex ? null : profile.sex)) ?? null, ageYears: G().profileAgeOn(profile, date), heightCm: profile?.heightCm ?? null, fromProfile: true })
      : null;
  const latestOther = [...list].reverse().find((m) => m.date !== date) ?? null;
  const methods = methodsList(db, f.method);
  const err = (k) => (f.errors?.[k] ? `<span class="err small">${esc(f.errors[k])}</span>` : "");
  const mark = isToday ? ' data-open="grip"' : "";
  return `<div class="grip" id="grip-panel">
    <h4 id="grip-title"${mark}>Griffkraft</h4>
    <div class="grip__entry" ${autoAttrs("grip")}>
      <div class="grid2">
        <label class="field"><span${mark}>Linke Hand (bester Versuch)</span><span class="entry-row__input"><input id="grip-left" type="text" inputmode="decimal" data-grip="left" value="${esc(f.left)}" ${f.errors?.leftKg ? 'aria-invalid="true"' : ""}><span class="unit">kg</span></span>${err("leftKg")}</label>
        <label class="field"><span${mark}>Rechte Hand (bester Versuch)</span><span class="entry-row__input"><input id="grip-right" type="text" inputmode="decimal" data-grip="right" value="${esc(f.right)}" ${f.errors?.rightKg ? 'aria-invalid="true"' : ""}><span class="unit">kg</span></span>${err("rightKg")}</label>
        ${select("grip-dominant", "dominant", f.dominant, G().HAND_OPTIONS, "Dominante Hand")}
        ${select("grip-method", "method", f.method, [{ value: "", label: "Keine Angabe" }, ...methods.map((m) => ({ value: m, label: m }))], "Messmethode Griffkraft")}
        <label class="field"><span>Uhrzeit</span><input id="grip-time" type="time" data-grip="time" value="${esc(f.time)}">${err("time")}
          <span class="muted small">${esc(outside ? `Außerhalb deines üblichen Messfensters (${window90?.start}–${window90?.end} Uhr) – nur eingeschränkt vergleichbar.` : D.gripTiming.gripWindowText(window90))}</span></label>
        ${askSex ? `${select("grip-sex", "sex", f.sex, [{ value: "", label: "Bitte wählen" }, { value: "female", label: "weiblich" }, { value: "male", label: "männlich" }], "Geschlecht (für die Normwerte)")}${err("date")}` : ""}
      </div>
      <label class="field"><span>Notiz zur Messung (optional)</span><textarea id="grip-notes" rows="2" data-grip="notes">${esc(f.notes)}</textarea>${err("notes")}</label>
      ${latestOther && !existing ? `<p class="muted small">Zuletzt: links ${kg(latestOther.leftKg)}, rechts ${kg(latestOther.rightKg)} am ${fmtDate(latestOther.date)}</p>` : ""}
      ${autoSaveHtml("grip-save", { note: `Gespeichert wird, sobald beide Hände und die Uhrzeit eingetragen sind. Werte von 1 bis ${G().GRIP_MAX_KG} kg, höchstens eine Messung je Tag.` })}
      ${existing ? `<div class="row-actions"><button class="btn sm danger" data-act="grip-delete">Messung löschen</button></div>` : ""}
    </div>
    ${evaluationHtml(live, existing ? G().changeToPrevious(list, date) : null, existing !== null && !f.dirty)}
    <details class="grip__protocol"><summary>So misst du richtig</summary><ul>${G().GRIP_PROTOCOL.map((x) => `<li class="small">${esc(x)}</li>`).join("")}</ul>
      <p class="muted small">Normwerte: ${esc(G().GRIP_SOURCE)} – ${esc(G().GRIP_DATASET)}. Die Stufen 10 % und 90 % stammen aus der Studie, 25 % und 75 % sind eine Feinabstufung (berechnet aus Mittelwert und Standardabweichung). Die Einordnung ist ein Orientierungswert, keine Diagnose.</p></details>
    ${historyHtml(list, profile, date)}
  </div>`;
}

export const gripActions = {
  "grip-save": async () => {
    const f = X.S.body?.grip;
    if (!f) return;
    f.dirty = true;
    const l = parseKg(f.left);
    const r = parseKg(f.right);
    const errors = {};
    if (String(f.left ?? "").trim() !== "" && l === null) errors.leftKg = `Bitte einen Wert von 1 bis ${G().GRIP_MAX_KG} kg eingeben.`;
    if (String(f.right ?? "").trim() !== "" && r === null) errors.rightKg = `Bitte einen Wert von 1 bis ${G().GRIP_MAX_KG} kg eingeben.`;
    if (Object.keys(errors).length) {
      f.errors = errors;
      return X.rerender();
    }
    // Noch nicht vollständig: nur die Auswertung zeigen, nichts speichern (wie Quick Fill)
    if (l === null || r === null || D.gripTiming.minutesOf(f.time) === null) {
      f.errors = l !== null && r !== null ? { time: "Bitte die Uhrzeit der Messung angeben – nur im selben Zeitfenster sind Messungen vergleichbar." } : {};
      return X.rerender();
    }
    const db = buildDb();
    const res = L.saveGrip(
      db,
      X.S.logs,
      { date: f.date, time: f.time, leftKg: l, rightKg: r, dominantHand: f.dominant || null, method: f.method || null, notes: f.notes ?? "", sex: f.sex || undefined },
      { uuid: X.uuid, now: new Date() },
    );
    if (res.errors) {
      f.errors = res.errors;
      X.rerender();
      return X.toast(Object.values(res.errors)[0], true);
    }
    await X.store.set("logs", X.S.logs);
    X.S.body.grip = null;
    X.toast("Griffkraft gespeichert – mit „An den PC senden“ übertragen.");
    X.rerender();
  },
  "grip-delete": async (el) => {
    const f = X.S.body?.grip;
    const db = buildDb();
    const m = gripMeasurements(db).find((x) => x.date === f?.date);
    if (!m) return;
    if (!X.confirmTwice(el, "Nochmal tippen: Messung löschen")) return;
    L.removeEntry(X.S.catalog, X.S.logs, "grip", m.id);
    await X.store.set("logs", X.S.logs);
    X.S.body.grip = null;
    X.toast("Messung gelöscht.");
    X.rerender();
  },
  "grip-open": (el) => {
    X.S.body.grip = null;
    X.openGripDay?.(el.dataset.arg);
  },
};
