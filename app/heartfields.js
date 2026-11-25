// LIFESPAN OS Mobil – Maximale Herzfrequenz & Trainingszonen (1.145.0, wie HeartFields in
// BodyEntryTab.tsx am PC): unter „Werte erfassen“ → Vitalwerte. Berechnet nach Tanaka bzw. Gulati
// und Karvonen (D.heart aus src/domain/heart.ts); eigene Werte ersetzen die berechneten, ein
// geleertes Feld nutzt wieder den berechneten. Gespeichert in den Einstellungen `heart.max` und
// `heart.zones` (wie `heart::save`), geht mit „An den PC senden“ zurück (pcsettings.js).

import * as D from "./pcdomain.js";
import * as P from "./pcdb.js";
import * as PS from "./pcsettings.js";
import { buildDb } from "./diary.js";

let X = null; // { S, esc, toast, store, rerender }

const H = () => D.heart;
const esc = (v) => X.esc(v);
const RESTING_HR_METRIC_ID = "00000000-0000-7000-8000-000000000018";
const HR_MIN = 30;
const HR_MAX = 250;
const fmtDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export function initHeartFields(ctx) {
  X = ctx;
  document.addEventListener("input", (ev) => {
    const el = ev.target.closest?.("[data-heart]");
    const f = X.S.body?.heart;
    if (!el || !f) return;
    const k = el.dataset.heart;
    if (k === "max") f.max = el.value;
    else f.zones[Number(k)] = el.value;
  });
}

/** Wie `heart::get` am PC (Alter und Ruhepuls zum Tag). */
export function heartProfile(db, date) {
  const profile = db.profile ?? null;
  const age = profile ? P.ageOn(profile, date) : null;
  const sex = profile?.sex ?? null;
  const formula = sex === "male" && age !== null ? "tanaka" : sex === "female" && age !== null ? "gulati" : null;
  const maxCalculated = formula === "tanaka" ? Math.round(208 - 0.7 * age) : formula === "gulati" ? Math.round(206 - 0.88 * age) : null;
  const ownMax = Number.parseInt(String(db.settings.get("heart.max") ?? "").trim(), 10);
  const maxCustom = Number.isFinite(ownMax) ? ownMax : null;
  const resting = P.latestMeasurement(db, RESTING_HR_METRIC_ID, date);
  let custom = [null, null, null, null, null];
  try {
    const list = JSON.parse(db.settings.get("heart.zones") ?? "null");
    if (Array.isArray(list)) custom = [0, 1, 2, 3, 4].map((i) => list[i] ?? null);
  } catch {
    /* ohne eigene Zonen */
  }
  return {
    age,
    sex,
    formula,
    maxCalculated,
    maxCustom,
    maxEffective: maxCustom ?? maxCalculated,
    resting: resting ? Math.round(resting.value) : null,
    restingDate: resting?.date ?? null,
    zones: custom.map((c) => ({ custom: c })),
  };
}

/** Eingabe prüfen wie `heart::save`; Rückgabe { errors } oder { max, zones }. */
export function checkHeart(draft) {
  const r = H().heartInput(draft);
  if (!r.ok) return { errors: r.errors };
  const errors = {};
  const { max, zones } = r.input;
  if (max !== null && (max < HR_MIN || max > HR_MAX)) errors.heartMax = `Die maximale Herzfrequenz muss zwischen ${HR_MIN} und ${HR_MAX} liegen.`;
  zones.forEach((z, i) => {
    if (z && (z.from < HR_MIN || z.from > HR_MAX || z.to < HR_MIN || z.to > HR_MAX)) errors[`heartZone${i + 1}`] = `Bitte Werte zwischen ${HR_MIN} und ${HR_MAX} eingeben.`;
  });
  return Object.keys(errors).length ? { errors } : { max, zones };
}

export function heartFieldsHtml(date) {
  if (!H()) return "";
  const db = buildDb();
  const p = heartProfile(db, date);
  const st = X.S.body;
  const stamp = `${p.maxCustom ?? ""}|${JSON.stringify(p.zones.map((z) => z.custom))}`;
  if (!st.heart || (st.heart.stamp !== stamp && !st.heart.dirty)) st.heart = { ...H().heartToDraft(p), stamp, errors: {} };
  const f = st.heart;
  const preview = H().heartPreview(p, f);
  const formula = H().describeMaxFormula(p);
  const calc = (text, value) => (String(text).trim() === "" && value !== null ? " heart-field--calc" : "");
  const err = (k) => (f.errors?.[k] ? `<span class="err small">${esc(f.errors[k])}</span>` : "");
  const zones = H()
    .ZONE_TITLES.map((title, i) => {
      const lo = 50 + i * 10;
      const name = title.split(" – ")[1] ?? title;
      const z = preview.zones[i];
      return `<label class="field heart-field${calc(f.zones[i], z)}" title="${esc(`${title}: ${lo}–${lo + 10} % der Herzfrequenzreserve (HFmax − HF Ruhe) + HF Ruhe.`)}">
        <span>Zone ${i + 1}</span>
        <span class="entry-row__input"><input type="text" inputmode="numeric" data-heart="${i}" value="${esc(f.zones[i] ?? "")}" placeholder="${esc(H().formatZone(z))}" aria-label="Zone ${i + 1} in bpm"><span class="unit">bpm</span></span>
        <span class="muted small">${esc(name)} · ${lo}–${lo + 10} % HFR</span>${err(`heartZone${i + 1}`)}</label>`;
    })
    .join("");
  return `<div class="heart-fields" id="heart-zones" data-autosave="heart" data-autosave-mode="edit">
    <h4>Maximale Herzfrequenz &amp; Trainingszonen</h4>
    <p class="muted small">${
      p.resting !== null
        ? `Ruhepuls: <b>${p.resting} bpm</b>${p.restingDate ? ` (${fmtDate(p.restingDate)})` : ""} – erfasst unter Recovery → ANS-Werte erfassen.`
        : "Für die Trainingszonen fehlt der Ruhepuls – bitte unter Recovery → ANS-Werte erfassen eintragen."
    } Zonen nach Karvonen: HF Ruhe + Anteil × (HFmax − HF Ruhe). Mit * markierte Werte sind berechnet; ein eigener Wert ersetzt sie, ein geleertes Feld nutzt wieder den berechneten.</p>
    <div class="grid2">
      <label class="field heart-field${calc(f.max, preview.max)}"><span>max. Herzfrequenz</span>
        <span class="entry-row__input"><input type="text" inputmode="numeric" data-heart="max" value="${esc(f.max)}" placeholder="${preview.maxIsCalculated && preview.max !== null ? preview.max : ""}" aria-label="maximale Herzfrequenz in bpm"><span class="unit">bpm</span></span>
        <span class="muted small">${formula ? `* berechnet nach ${esc(formula)}` : "Für den Standardwert fehlen Geschlecht oder Geburtsdatum im Profil (Settings)."}</span>${err("heartMax")}</label>
      ${zones}
    </div>
    <button type="button" hidden data-autosave-btn data-act="heart-save"></button>
  </div>`;
}

export const heartActions = {
  "heart-save": async () => {
    const f = X.S.body?.heart;
    if (!f) return;
    f.dirty = true;
    const r = checkHeart(f);
    if (r.errors) {
      f.errors = r.errors;
      return X.rerender();
    }
    const db = buildDb();
    X.S.pcsettings = PS.normSync(X.S.pcsettings);
    const maxText = r.max === null ? null : String(r.max);
    const zonesText = r.zones.some((z) => z !== null) ? JSON.stringify(r.zones) : null;
    const a = PS.setSetting(X.S.pcsettings, "heart.max", maxText, db.settings.get("heart.max") ?? null);
    const b = PS.setSetting(X.S.pcsettings, "heart.zones", zonesText, db.settings.get("heart.zones") ?? null);
    if (a || b) {
      await X.store.set("pcsettings", X.S.pcsettings);
      X.toast("Herzfrequenz gespeichert – mit „An den PC senden“ übertragen.");
    }
    X.S.body.heart = null;
    X.rerender();
  },
};
