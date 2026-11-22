// Cardio in der Muskel-Körperkarte (1.85.0, wie PC 1.0.172/1.0.173 `CardioMuscles.tsx`):
// Satz-Äquivalente aus Cardio-Blöcken (Minuten × Faktor der Zone ÷ Minuten je Satz × Muskelanteil),
// Schalter „Kraft | Kraft + Cardio“, Schraffur für den Cardio-Anteil und Kennzahlen unter der Karte.
// Rechnung und Festlegungen kommen aus `src/domain/cardioMuscles.ts` (pcdomain.js `D.cardioMuscles`).
// Die Einstellungen (Settings → Cardio in der Körperkarte) werden am PC gepflegt und kommen mit dem Export.

import * as D from "./pcdomain.js";
import { esc } from "./pcview.js";
import { heartOn } from "./trainingstats.js";

const CM = () => D.cardioMuscles;
const F = (v, d = 0) => D.formatNumber(v, d);
const SHOW_KEY = "lifespan.cardioMap.show";
/** Ab diesem Anteil wird eine Fläche schraffiert (wie `HATCH_FROM` in MuscleHeatmap.tsx) */
export const HATCH_FROM = 0.1;

/** Pflegt die Rechnung am Handy schon (ältere pcdomain.js ohne Cardio → Karte wie bisher). */
export const cardioAvailable = () => Boolean(D.cardioMuscles?.cardioMuscleLoad);

/** Einstellungen vom PC; der Schalter „Kraft + Cardio“ gilt je Gerät. */
export function cardioSettings(db) {
  const s = CM().parseCardioMuscleSettings(db.settings.get(CM().CARDIO_MUSCLE_SETTINGS_KEY) ?? null);
  let show = s.show;
  try {
    const v = localStorage.getItem(SHOW_KEY);
    if (v === "1" || v === "0") show = v === "1";
  } catch {
    // ohne Speicher gilt die Einstellung vom PC
  }
  return { ...s, show };
}

export function setCardioShow(show) {
  try {
    localStorage.setItem(SHOW_KEY, show ? "1" : "0");
  } catch {
    // ohne Speicher gilt die Wahl bis zum Schließen
  }
}

/** Rechen-Grundlage wie `useCardioMuscles().context(exercises)` am PC. */
export function cardioContext(db, date) {
  let zones = [];
  try {
    zones = heartOn(db, date).zones.map((z) => z.effective ?? null);
  } catch {
    zones = [];
  }
  return {
    exercises: [...db.exercises.values()].map((e) => ({ id: e.id, name: e.name, sportId: e.sport_id ?? null, cardioKind: e.cardio_kind ?? null })),
    sports: [...(db.sports?.values?.() ?? [])].map((s) => ({ id: s.id, name: s.name, category: s.category })),
    zones,
    settings: cardioSettings(db),
  };
}

/**
 * Kraft + Cardio zusammen: Werte je Muskel, Anteil aus Cardio und Text-Ergänzung.
 * `include` wählt die Blöcke (Zeitraum bzw. Einheiten).
 */
export function withCardio(db, log, strengthSets, include, date) {
  if (!cardioAvailable()) return { on: false, values: strengthSets, share: null, load: null, settings: null };
  const ctx = cardioContext(db, date);
  const load = CM().cardioMuscleLoad(log, ctx, include);
  const on = ctx.settings.show && load.blocks > 0;
  const values = on ? CM().addMuscleValues(strengthSets, load.sets) : strengthSets;
  const share = on ? Object.fromEntries(Object.keys(values).map((m) => [m, values[m] > 0 ? load.sets[m] / values[m] : 0])) : null;
  return { on, values, share, load, settings: ctx.settings };
}

/** „(davon Cardio 1,2)“ für die Beschreibung eines Muskels */
export function cardioPart(c, m) {
  return c.on && c.load.sets[m] >= 0.05 ? ` (davon Cardio ${F(c.load.sets[m], 1)})` : "";
}

/** Schalter „Kraft | Kraft + Cardio“ (`act` mit `data-arg` "0"/"1") */
export function cardioSwitchHtml(show, act) {
  return `<div class="segmented" role="radiogroup" aria-label="Cardio einbeziehen">${[
    ["0", "Kraft"],
    ["1", "Kraft + Cardio"],
  ]
    .map(([v, l]) => {
      const on = (v === "1") === show;
      return `<button type="button" role="radio" aria-checked="${on}" class="${on ? "is-active" : ""}" data-act="${act}" data-arg="${v}">${l}</button>`;
    })
    .join("")}</div>`;
}

const minutesText = (m) => `${F(m)} min`;

/** Kennzahlen unter der Karte wie `CardioSummary` am PC. */
export function cardioSummaryHtml(load, settings) {
  if (!load || (load.blocks === 0 && load.withoutProfile.length === 0)) return "";
  const notes = [];
  if (load.blocks > 0 && load.equivalents < 0.05) notes.push(`nur sehr leichte Intensität – unter Zone 1 zählt nicht, Zone 1 mit Faktor ${F(settings.zoneFactors[0], 2)}`);
  if (load.capped) notes.push(`Obergrenze von ${F(settings.cap, 1)} je Einheit und Muskel erreicht`);
  if (load.minutesBySource.assumed > 0) notes.push(`${minutesText(load.minutesBySource.assumed)} ohne Puls und Anstrengung als leicht gezählt`);
  if (load.withoutProfile.length > 0) notes.push(`zählt nicht: ${load.withoutProfile.map((w) => w.name).join(", ")}`);
  const zones =
    load.minutesByZone
      .map((m, zone) => (m > 0 ? `${zone === 0 ? "unter Z1" : `Z${zone}`} ${minutesText(m)}` : null))
      .filter(Boolean)
      .join(" · ") || "–";
  const sources =
    [
      load.minutesBySource.pulse > 0 ? `Puls ${minutesText(load.minutesBySource.pulse)}` : null,
      load.minutesBySource.rpe > 0 ? `Anstrengung ${minutesText(load.minutesBySource.rpe)}` : null,
      load.minutesBySource.assumed > 0 ? `geschätzt ${minutesText(load.minutesBySource.assumed)}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "–";
  const item = (t, v) => `<div><dt>${esc(t)}</dt><dd>${esc(v)}</dd></div>`;
  return `<div class="cardio-map"><dl class="cardio-map__values">${item("Cardio im Zeitraum", minutesText(load.minutes))}${item("Satz-Äquivalente (Hauptmuskel)", F(load.equivalents, 1))}${item("Minuten je Zone", zones)}${item("Intensität aus", sources)}</dl>${
    notes.length ? `<p class="cardio-map__notes">${esc(notes.join(" · "))}.</p>` : ""
  }</div>`;
}

/** Schraffur-Ebene für eine Ansicht der Karte (SVG), nur Flächen mit Farbe und genug Cardio-Anteil. */
export function hatchLayer(regions, levels, share, id) {
  if (!share) return "";
  const paths = regions
    .filter((r) => (share[r.muscle] ?? 0) >= HATCH_FROM && (levels[r.muscle] ?? 0) > 0)
    .map((r) => `<path d="${r.d}" fill="url(#${id})" fill-opacity="${(0.35 + 0.65 * Math.min(1, share[r.muscle])).toFixed(2)}"/>`)
    .join("");
  if (!paths) return "";
  return `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" class="muscle-map__hatch-line"/></pattern></defs><g class="muscle-map__hatch" aria-hidden="true">${paths}</g>`;
}

export function hasHatch(share) {
  return Boolean(share) && Object.values(share).some((v) => (v ?? 0) >= HATCH_FROM);
}
