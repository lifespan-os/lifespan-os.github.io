// LIFESPAN OS Mobil – Verbindungen (1.185.0, wie PC 1.0.254): Auswertungen, die Werte aus
// mehreren Bereichen zusammenführen – Diät und Körper, Training, Schlaf, Gesundheit – als Karten
// in Insights und Sleep, dazu „Was passt noch?“ in der Tagessumme. Gerechnet wird mit den Regeln
// aus pcdomain.js (src/domain/conn*.ts); hier nur Daten sammeln und anzeigen.
// Beobachtung und Werte stehen immer da, Bewertung und Empfehlung nur mit Einwilligung.

import * as D from "./pcdomain.js";
import * as P from "./pcdb.js";
import * as O from "./pcoverview.js";
import * as CF from "./caffeinedata.js";
import * as N from "./nutrition.js";
import * as QM from "./quickmeal.js";
import { CATALOG } from "./nutrientcatalog.js";
import { buildDb, connMicro, today } from "./diary.js";

let X = null; // { S, esc, machinesOf, focusIndex }

export function initConnections(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const C = () => D.connections;

function gripOf(db) {
  return (db.grip ?? db.pc.grip_strength_measurement ?? []).map((g) => ({ id: g.id, date: g.date, time: g.time ?? null, leftKg: g.left_kg, rightKg: g.right_kg }));
}

/** Eingaben wie `connectionsLoader.ts` am PC. */
export function connInput(db, t) {
  const S = X.S;
  const K = C();
  const sh = D.trends.shiftDays;
  const long = O.insightsFor(db, sh(t, -(K.CONN_DAYS - 1)), t);
  const intakeFrom = sh(t, -(K.CONN_INTAKE_DAYS - 1));
  const dates = K.daysOf(intakeFrom, t);
  const intake = [];
  const caffeine = [];
  for (const date of dates) {
    const one = D.connIntake.dayIntake(date, P.mealDay(db, date).meals, P.waterDay(db, date));
    if (one) intake.push(one);
    for (const c of CF.intakesOn(S.catalog, S.caffeine, date)) {
      const min = K.minutesOf(c.time);
      if (min !== null && c.mg > 0) caffeine.push({ date, min, mg: c.mg });
    }
  }
  const { micro, ownFoods } = connMicro(db, dates);
  const profile = db.profile ? { sex: db.profile.sex ?? null, birthDate: db.profile.birth_date ?? null, birthYear: db.profile.birth_year ?? null, lifePhase: db.profile.life_phase ?? null } : null;
  return {
    today: t,
    sleep: long.sleep,
    recovery: long.recovery,
    workouts: long.workouts,
    nutrition: long.nutrition,
    measurements: long.measurements,
    neat: long.neat ?? [],
    energy: (long.energy ?? []).filter((e) => e.date >= intakeFrom),
    goal: long.goal,
    setLog: O.setLog(db),
    exercises: O.exercisesOf(db),
    // Sätze je Muskelgruppe wie in der Körperkarte (Maschinen, Muskelfokus)
    machines: X.machinesOf?.() ?? [],
    focus: X.focusIndex?.(),
    intake,
    grip: gripOf(db),
    caffeine,
    micro,
    nutrients: Object.fromEntries(CATALOG.map((n) => [n.key, { label: n.label, unit: n.unit }])),
    profile,
    ownFoods,
  };
}

/** Eingaben und Einwilligung; je Tag und Datenstand höchstens einmal je Minute gerechnet. */
export function connData(db = buildDb(), t = today(), stamp = null) {
  const S = X.S;
  const now = Date.now();
  const hit = S.connCache;
  // `stamp` (1.186.0): Kennzeichen des Datenstands, z. B. der letzten Wiegungen – ändert es sich, wird neu gerechnet
  if (hit && hit.today === t && hit.catalog === S.catalog && now - hit.at < 60000 && (stamp === null || hit.stamp === stamp)) return hit.data;
  const G = D.goalAdvice;
  const data = { input: connInput(db, t), consent: G.parseConsent(db.settings.get(G.AI_CONSENT_KEY) ?? null) };
  S.connCache = { today: t, catalog: S.catalog, at: now, data, stamp };
  return data;
}

/**
 * Hinweis direkt beim Wiegen (1.186.0, wie PC 1.0.255): Ist die letzte Wiegung (heute oder gestern) ein Sprung,
 * steht hier in einer Zeile die Abweichung mit den Auffälligkeiten des Vortags; Beobachtung und Werte zum
 * Aufklappen, Rechenweg und Fundstelle in Insights. Sonst leer. `stamp` = Kennzeichen der letzten Wiegungen.
 */
export function weightJumpNoteHtml(stamp = null, db = buildDb(), t = today()) {
  const W = D.connWeightJump;
  const data = connData(db, t, stamp);
  const f = W.weightJump(data.input);
  if (!W.isWeightJump(f)) return "";
  const consent = data.consent !== null;
  return `<div class="weight-jump" role="status"><p class="weight-jump__line"><strong>Gewichtssprung:</strong> ${esc(f.short ?? f.summary)}</p>
    <details class="ov-more weight-jump__more"><summary>Einzelheiten</summary><p>${esc(f.summary)}</p>
    ${consent && f.advice ? `<p class="conn-item__advice">${esc(f.advice)}</p>` : ""}
    ${
      f.rows.length
        ? `<table class="data-table insights-table conn-item__rows"><tbody>${f.rows
            .map((r) => `<tr><td>${esc(r.label)}</td><td class="tnum"><strong>${esc(r.value)}</strong>${r.note ? `<span class="sub">${esc(r.note)}</span>` : ""}</td></tr>`)
            .join("")}</tbody></table>`
        : ""
    }
    <p class="muted small">Rechenweg und Fundstelle unter Insights → Verbindungen: Diät und Körper.</p></details></div>`;
}

const link = (s) => {
  const K = C();
  return `<button class="linkbtn small" data-act="icoach-ask" data-arg="${esc(`${s.book}|${s.question}`)}">${esc(K.CONN_BOOK_LABELS[s.book])}: „${esc(s.title)}“ · ${esc(D.describePages ? D.describePages(s.pages) : `S. ${s.pages.join(", ")}`)}</button>`;
};

function findingHtml(f, consent) {
  const K = C();
  const status = consent ? f.status : f.status === "nodata" ? "nodata" : "info";
  return `<div class="advice advice--${status} conn-item"><div class="advice__head"><strong>${esc(f.title)}</strong>${consent || f.status === "nodata" ? `<span class="advice__status">${K.FINDING_STATUS_LABELS[f.status]}</span>` : ""}</div>
    <p>${esc(f.summary)}</p>
    ${consent && f.advice ? `<p class="conn-item__advice">${esc(f.advice)}</p>` : ""}
    ${
      f.rows.length || f.sources.length
        ? `<details class="ov-more conn-item__more"${consent && f.status === "act" ? " open" : ""}><summary>Werte und Fundstellen</summary>
    ${
      f.rows.length
        ? `<table class="data-table insights-table conn-item__rows"><tbody>${f.rows
            .map((r) => `<tr><td>${esc(r.label)}</td><td class="tnum"><strong>${esc(r.value)}</strong>${r.note ? `<span class="sub">${esc(r.note)}</span>` : ""}</td></tr>`)
            .join("")}</tbody></table>`
        : ""
    }
    ${f.sources.map(link).join("")}
    ${f.literature ? `<p class="muted small">Quelle: ${esc(f.literature)}</p>` : ""}</details>`
        : ""
    }</div>`;
}

const AREA_OF = { diet: "nutrition", training: "training", sleep: "sleep", health: "body" };

/** Karte einer Gruppe (`card` = Kartenfunktion der Seite, z. B. aus insightsview.js). */
export function connectionsCard(card, area, data, t = today()) {
  const K = C();
  const list = K.sortFindings(K.findingsFor(area, data.input));
  const consent = data.consent !== null;
  const act = list.filter((f) => f.status === "act").length;
  const body = `<p class="muted small">${consent ? (act ? `${act}× Handlungsbedarf.` : "Kein Handlungsbedarf erkannt.") : "Beobachtungen und Werte. Empfehlungen und Bewertungen gibt es mit Einwilligung unter Settings → Hauptziele."}</p>
    <div class="advice-list">${list.map((f) => findingHtml(f, consent)).join("")}</div>
    <div class="card-info"><p>Jede Verbindung rechnet nur mit erfassten Werten und nennt eine Aussage erst ab genug Tagen. Beobachtungen sind keine Ursachen. Ersetzt keine ärztliche Beratung.</p>
      <ul>${list.map((f) => `<li><strong>${esc(f.title)}:</strong> ${esc(f.method)}</li>`).join("")}</ul></div>`;
  return card(`connections-${area}`, K.CONN_AREA_TITLES[area], `bis ${D.formatDate(t)}`, body, { area: AREA_OF[area], wide: true });
}

// ------------------------------------------------------------------ „Was passt noch?“ (Tagessumme)

const fitFoods = (foods) => new Map([...foods.values()].map((f) => [f.id, { id: f.id, name: f.name, energyKcal: f.energy_kcal ?? 0, proteinG: f.protein_g ?? 0, carbsG: f.carbs_g ?? 0, fatG: f.fat_g ?? 0, archived: Boolean(f.archived) }]));

/** Vorschläge für den Rest des Tages; `slots` = Mahlzeiten des Tages (`D.daySlots`). */
export function fitList(db, date, slots, dayMacros, totals) {
  const FI = D.connFit;
  const rest = FI.restOfDay({ energyKcal: dayMacros?.needKcal ?? null, proteinG: dayMacros?.proteinG ?? null, carbsG: dayMacros?.carbsG ?? null, fatG: dayMacros?.fatG ?? null }, totals);
  if (date !== today()) return { rest, list: [] };
  const foods = N.allFoods(X.S.catalog, X.S.food.local);
  const keys = slots.map((s) => ({ key: N.mealKeyOf(s.meal ? { meal_type: s.meal.mealType, name: s.meal.name } : { meal_type: s.ref.mealType, name: s.ref.name ?? null }), title: s.title }));
  return { rest, list: FI.fitSuggestions(rest, FI.fitCandidates(QM.pastMeals(db), date, fitFoods(foods), keys)) };
}

/** Mahlzeit für einen Vorschlag: die leere gleicher Art, sonst die erste leere, sonst die letzte. */
export function fitSlotKey(slots, f) {
  const keyOf = (s) => N.mealKeyOf(s.meal ? { meal_type: s.meal.mealType, name: s.meal.name } : { meal_type: s.ref.mealType, name: s.ref.name ?? null });
  const open = slots.filter((s) => !s.meal || !D.mealHasContent(s.meal));
  const slot = (f.candidate.mealKey ? open.find((s) => keyOf(s) === f.candidate.mealKey) : null) ?? open[0] ?? slots[slots.length - 1] ?? null;
  return slot ? { key: keyOf(slot), title: slot.title } : null;
}

/** Zuletzt gezeigte Vorschläge (für die Taste „Eintragen“) */
let shown = [];

/** Vorschlag Nr. `i` der zuletzt gezeigten Liste mit seiner Mahlzeit, sonst null. */
export function fitPicked(i) {
  return shown[i] ?? null;
}

export function fitRestHtml(slots, fit) {
  const FI = D.connFit;
  const { rest, list } = fit;
  shown = list.flatMap((s) => {
    const slot = fitSlotKey(slots, s);
    return slot ? [{ suggestion: s, slot }] : [];
  });
  if (!list.length || rest.energyKcal === null) return "";
  const g = (v) => `${D.formatNumber(Math.round(v))} g`;
  const restText = [`${D.formatNumber(Math.round(rest.energyKcal))} kcal`, rest.proteinG > 0 ? `${g(rest.proteinG)} Eiweiß` : null, rest.carbsG > 0 ? `${g(rest.carbsG)} Kohlenhydrate` : null, rest.fatG > 0 ? `${g(rest.fatG)} Fett` : null]
    .filter(Boolean)
    .map((t) => t.replaceAll(" ", "\u00a0")) // Zahl und Einheit nie getrennt umbrechen
    .join("\u00a0· ");
  // eingeklappt (Wunsch des Nutzers 28.11.2026); nach „Eintragen“ bleibt es für diesen Tag offen
  return `<div class="fit-rest"><details class="ov-more fit-rest__box"${X.S.fitOpen === (X.S.diaryDate ?? today()) ? " open" : ""}><summary>Was passt noch? <span class="muted small fit-rest__open">Noch offen: ${esc(restText)}</span></summary>
    <ul class="plain-list fit-rest__list">${list
      .map((s) => {
        const slot = fitSlotKey(slots, s);
        const i = shown.findIndex((x) => x.suggestion === s);
        const nb = (t) => t.replaceAll(" ", "\u00a0");
        return `<li><strong class="fit-rest__name">${esc(s.candidate.label)}</strong>
          <span class="fit-rest__main">
          <span class="muted small">${esc(FI.portionText(s.factor))}${slot ? ` · in „${esc(slot.title)}“` : ""}</span>
          <span class="small"><b>${nb(`${D.formatNumber(Math.round(s.nutrients.energyKcal))} kcal`)}</b><span class="muted">\u00a0· ${nb(`${g(s.nutrients.proteinG)} E`)}\u00a0· ${nb(`${g(s.nutrients.carbsG)} KH`)}\u00a0· ${nb(`${g(s.nutrients.fatG)} F`)}</span></span>
          <span class="muted small">${s.after.energyKcal >= 0 ? "danach offen" : "danach über dem Ziel"} <b>${nb(`${D.formatNumber(Math.round(Math.abs(s.after.energyKcal)))} kcal`)}</b>${rest.proteinG !== null ? `\u00a0· ${nb(g(Math.max(0, s.after.proteinG)))}\u00a0Eiweiß offen` : ""}</span></span>
          <button class="btn sm" data-act="fit-add" data-arg="${i}" ${slot ? "" : "disabled"} aria-label="${esc(s.candidate.label)} eintragen">+ Eintragen</button></li>`;
      })
      .join("")}</ul></details>
    <p class="card__note">„Was passt noch?“: Rest = Tagesziel − bisher gegessen. Vorschläge kommen aus deinen häufigen Zusammenstellungen je Mahlzeit und deinen häufigsten Lebensmitteln (übliche Menge), skaliert in Stufen von ½ bis 2 Portionen. Energie über dem Rest zählt dreifach, fehlendes Eiweiß doppelt. „Rückgängig“ stellt den Stand davor wieder her.</p></div>`;
}

// ------------------------------------------------------------------ Tagesaussage (1.185.0, wie PC 1.0.254)

/** Uhr-Zeilen aus dem PC-Export (snake_case → Felder wie am PC), nach Datum sortiert – wie `wearableOf` in heart.js. */
function watchRows(catalog, table) {
  const camel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
  return (catalog?.pc?.[table] ?? []).map(camel).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Eine Aussage zum Tag für Overview, Recovery und Insights: Erholungswert (wie Recovery am PC),
 * Bremsen (HRV-Regel, Belastung, Griffkraft) und Dauerthemen aus den Hauptziel-Regeln.
 */
export function verdictData(db = buildDb(), date = today()) {
  const S = X.S;
  const sh = D.trends.shiftDays;
  const data = O.insightsFor(db, sh(date, -41), date);
  const w = { recovery: watchRows(S.catalog, "wearable_recovery"), sleep: watchRows(S.catalog, "wearable_sleep") };
  const G = D.goalAdvice;
  const consent = G.parseConsent(db.settings.get(G.AI_CONSENT_KEY) ?? null);
  const goals = G.parseMainGoals(db.settings.get(G.MAIN_GOALS_KEY) ?? null);
  const day =
    D.recoveryCockpit.recoveryDays(
      { measurements: data.measurements, recoveryLogs: data.recovery, sleepLogs: data.sleep, wearableRecovery: w.recovery ?? [], wearableSleep: w.sleep ?? [], sleepTargetMin: data.goal?.sleepMin ?? null },
      date,
      date,
    )[0] ?? null;
  const advice = consent && goals.length ? G.goalAdvice({ goals, to: date, nutrition: data.nutrition, energy: data.energy ?? [], sleep: data.sleep, measurements: data.measurements, neat: data.neat ?? [], setLog: [] }) : [];
  const grip = gripOf(db).filter((g) => g.date <= date);
  return {
    verdict: D.dayVerdict.dayVerdict({ date, day, readiness: D.dashboard.readiness(data, date, data.goal?.sleepMin ?? null, grip), hrvRule: D.hrvRuleToday(data.measurements, date), advice }),
    consent,
  };
}

const BAND_CLASS = { high: "verdict--high", normal: "verdict--normal", low: "verdict--low" };

/** Stufe, Empfehlung, Bremsen und Dauerthemen (derselbe Block auf allen Seiten). */
export function verdictBlockHtml({ verdict: v, consent }) {
  const ok = consent !== null;
  return `<div class="verdict ${v.band ? BAND_CLASS[v.band] : ""}"><div class="verdict__head">
      <span class="verdict__score" role="img" aria-label="${v.score !== null ? `Erholungswert ${v.score} von 100` : "Kein Erholungswert"}">${v.score ?? "–"}</span>
      <div class="verdict__text"><p class="verdict__label">${esc(v.band ? v.label : "Noch keine Tagesaussage")}</p>
        ${v.band && ok && v.action ? `<p class="verdict__action">${esc(v.action)}</p>` : ""}
        ${v.band ? "" : `<p class="muted small">${esc(v.headline)}</p>`}</div></div>
    ${v.brakes.length ? `<p class="muted small"><strong>Gebremst durch:</strong> ${esc(v.brakes.join("; "))}.</p>` : ""}
    ${ok && v.ongoing.length ? `<p class="muted small"><strong>Dauerthemen (14 Tage):</strong> ${esc(v.ongoing.map((o) => `${o.title} – ${o.basis}`).join("; "))}.</p>` : ""}</div>`;
}

/** Inhalt der Karte „Tagesaussage“ (Overview und Recovery). */
export function verdictCardBody(data) {
  const { verdict: v, consent } = data;
  const DV = D.dayVerdict;
  return `${verdictBlockHtml(data)}
    ${
      v.factors.length
        ? `<ul class="readiness__factors">${v.factors.map((f) => `<li><span class="readiness__dot readiness__dot--${f.level}" aria-hidden="true"></span><strong>${esc(f.label)}:</strong> ${esc(f.text)}</li>`).join("")}</ul>`
        : ""
    }
    ${v.missing.length ? `<p class="card__note card__note--keep">Ohne Wert: ${esc(v.missing.join(", "))}.</p>` : ""}
    ${consent ? "" : `<p class="muted small">Die Empfehlung fürs Training gibt es mit Einwilligung unter Settings → Hauptziele.</p>`}
    <div class="card-info"><p>${esc(DV.VERDICT_METHOD)}</p>
      <p>${v.sources.map(link).join(" ")}</p>
      <p>Studienlage: ${esc(DV.VERDICT_LITERATURE)}. Orientierung, keine ärztliche Beratung.</p></div>`;
}

/** Eine Zeile für Insights. */
export function verdictLineHtml(data) {
  const { verdict: v, consent } = data;
  return `<p class="verdict-line"><strong>Tagesaussage heute:</strong> ${esc(D.dayVerdict.verdictShort(v))}${v.band && consent && v.action ? ` – ${esc(v.action)}` : ""}${consent && v.ongoing.length ? ` Dauerthemen: ${esc(v.ongoing.map((o) => o.title).join(", "))}.` : ""}</p>`;
}

