// LIFESPAN OS Mobil – Health → Heart → Trainings der Uhr: als Cardio-Einheit übernehmen
// (1.93.0, wie `WatchExercisesCard.tsx` + `repo/wearable_adopt.rs` am PC). Nur auf Tippen, damit
// nichts doppelt entsteht. Die Übung wird über die Sportart gefunden (Cardio-Art wie
// `cardio::infer_kind`, meistgenutzte zuerst) und lässt sich vor dem Speichern ändern. Die Einheit
// bekommt einen Block mit Dauer, Strecke, Ø/max Puls und den kcal der Uhr; die Verknüpfung
// (`wearable_exercise.workout_id`) geht über paritydata.js mit „An den PC senden“ zurück.

import * as C from "./core.js";
import * as P from "./pcdb.js";
import * as PR from "./paritydata.js";
import * as W from "./wearabledata.js";
import { X, buildDb } from "./diary.js";
import { refreshCatalog, saveNow } from "./appbase.js";
import * as D from "./pcdomain.js";

const esc = (v) => X.esc(v);

/** Gibt es die verknüpfte Einheit (am Handy oder vom PC)? */
function workoutExists(db, id) {
  if (!id) return false;
  return (X.S.workouts ?? []).some((w) => w.id === id) || (db.workouts ?? []).some((w) => w.id === id);
}

function cardioChoices(db) {
  const usage = new Map();
  for (const list of db.wexByWorkout?.values() ?? []) for (const we of list) usage.set(we.exercise_id, (usage.get(we.exercise_id) ?? 0) + 1);
  return C.allExercises(X.S.catalog, X.S.localExercises ?? [])
    .filter((e) => !e.archived && e.category === "cardio")
    .map((e) => ({ ...e, kind: P.effectiveKind(e.category, e.cardio_kind ?? null, e.name ?? "", e.equipment ?? null, null), usage: usage.get(e.id) ?? 0 }))
    .sort((a, b) => b.usage - a.usage || String(a.name).localeCompare(String(b.name), "de"));
}

/** Passende Cardio-Übung zur Sportart (wie `exercise_for` am PC, ohne Neuanlage). */
export function bestExercise(db, e) {
  const kind = P.inferKind(`${e.sport ?? ""} ${e.detailedSport ?? ""}`);
  const list = cardioChoices(db);
  return list.find((x) => x.kind === kind) ?? null;
}

/** Teil der Zeile „Trainings der Uhr“: Knopf, Auswahl oder Hinweis. */
export function watchAdoptHtml(e) {
  const db = buildDb();
  if (e.workoutId && workoutExists(db, e.workoutId)) return `<p class="small"><button class="linkbtn" data-act="wx-open" data-arg="${esc(e.workoutId)}">Trainingseinheit öffnen</button></p>`;
  if (!e.id) return "";
  const st = X.S.wxPick;
  if (st?.id !== e.id) return `<p><button class="btn sm" data-act="wx-pick" data-arg="${esc(e.id)}">Ins Training übernehmen</button></p>`;
  const list = cardioChoices(db);
  if (!list.length) return `<p class="warn small">Es gibt noch keine Cardio-Übung. Lege unter Training → Datenbank eine an (z. B. „Laufen“) und übernimm das Training dann.</p>`;
  const best = bestExercise(db, e);
  const cur = st.exerciseId ?? best?.id ?? list[0].id;
  return `<div class="wx-pick">
    <div class="field"><label for="wx-ex">Übung</label><select id="wx-ex" data-wx="exerciseId">${list
      .map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? "selected" : ""}>${esc(x.name)}</option>`)
      .join("")}</select></div>
    <div class="row-actions"><button class="btn primary sm" data-act="wx-adopt" data-arg="${esc(e.id)}">Als Einheit speichern</button><button class="btn sm" data-act="wx-cancel">Abbrechen</button></div>
  </div>`;
}

const round = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));

/** Neue Einheit aus einem Training der Uhr (Felder wie `to_workout` am PC). */
export function workoutFromWatch(e, exerciseId, now = new Date()) {
  const ts = C.isoNow(now);
  const label = W.sportLabel(e.sport, e.detailedSport);
  const start = e.startTime && e.startTime.includes("T") ? e.startTime.split("T")[1].slice(0, 5) : null;
  const notes = [`Von der Uhr übernommen (${e.source})`];
  const load = e.trainingLoad ?? e.cardioLoad ?? null;
  if (load !== null && load !== undefined) notes.push(`Trainingsbelastung ${Math.round(load)}`);
  const set = {
    ...C.newSet(),
    durationSeconds: e.durationS ?? null,
    distanceM: e.distanceM && e.distanceM > 0 ? e.distanceM : null,
    isDone: true,
    extra: { hr_avg: round(e.hrAvg), hr_max: round(e.hrMax), device_kcal: round(e.calories) },
  };
  return {
    id: C.uuidv7(now.getTime()),
    date: e.date,
    startTime: start,
    title: [...`${label} (${e.source})`].slice(0, 80).join(""),
    planDayId: null,
    gymId: null,
    perceivedExertion: null,
    notes: notes.join(" · "),
    status: "done",
    startedAt: ts,
    finishedAt: ts,
    durationMin: e.durationS != null ? Math.min(1440, Math.max(1, Math.round(e.durationS / 60))) : null,
    createdAt: ts,
    updatedAt: ts,
    exported: false,
    exercises: [{ id: C.uuidv7(), exerciseId, notes: null, settings: C.emptySettings(), restSeconds: null, profiles: null, sets: [set] }],
  };
}

export const watchParityActions = {
  "wx-pick": (el) => {
    X.S.wxPick = { id: el.dataset.arg, exerciseId: null };
    X.rerender();
  },
  "wx-cancel": () => {
    X.S.wxPick = null;
    X.rerender();
  },
  "wx-open": (el) => X.go("detail", el.dataset.arg),
  "wx-adopt": async (el) => {
    const S = X.S;
    const db = buildDb();
    const raw = (S.catalog?.pc?.wearable_exercise ?? []).find((r) => r.id === el.dataset.arg);
    if (!raw) return X.toast("Dieses Training der Uhr gibt es nicht mehr.", true);
    if (raw.workout_id && workoutExists(db, raw.workout_id)) return X.toast("Dieses Training ist schon als Trainingseinheit übernommen.", true);
    const model = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
    const exerciseId = document.querySelector('[data-wx="exerciseId"]')?.value || S.wxPick?.exerciseId || bestExercise(db, model)?.id;
    if (!exerciseId) return X.toast("Bitte eine Cardio-Übung wählen.", true);
    const w = workoutFromWatch(model, exerciseId);
    S.workouts.push(w);
    await saveNow();
    S.parity = PR.normParity(S.parity);
    PR.putRow(S.parity, "wearable_exercise", { ...raw, workout_id: w.id });
    await X.store.set("parity", S.parity);
    refreshCatalog();
    S.wxPick = null;
    X.toast(`${W.sportLabel(model.sport, model.detailedSport)} vom ${new Date(`${model.date}T12:00:00`).toLocaleDateString("de-DE")} ist jetzt eine Trainingseinheit`);
    X.rerender();
  },
};

/** Auswahl der Übung; true = behandelt. */
export function watchParityChange(el) {
  if (el.dataset?.wx !== "exerciseId") return false;
  X.S.wxPick = { ...(X.S.wxPick ?? {}), exerciseId: el.value };
  return true;
}

// ------------------------------------------------------------------ FIT/TCX (1.176.0, wie PC 1.0.241)

/** Karte unter Import/Export: Aktivitäten aus FIT- oder TCX-Dateien (Vorschau, dann speichern). */
export function activityImportHtml() {
  const items = X.S.actImport ?? [];
  const open = items.filter((i) => i.activity && !i.duplicate && !i.saved).length;
  const F = (v, d = 0) => Number(v).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const rows = items
    .map((it) => {
      const a = it.activity;
      if (!a) return `<tr><td>${esc(it.name)}</td><td class="tnum"><span class="sub">nicht lesbar (keine Aktivität gefunden)</span></td></tr>`;
      const ls = D.activityFile.localStart(a.start);
      const parts = [
        a.distanceM !== null ? `${F(a.distanceM / 1000, 2)} km` : null,
        a.hrAvg !== null ? `Ø ${a.hrAvg} /min` : null,
        a.kcal !== null ? `${a.kcal} kcal` : null,
        it.saved ? "gespeichert" : it.duplicate ? "schon vorhanden" : null,
      ].filter(Boolean);
      return `<tr><td>${esc(D.activityFile.KIND_TITLES[a.kind])} · ${esc(new Date(`${ls.date}T12:00:00`).toLocaleDateString("de-DE"))} ${esc(ls.time)}<span class="sub">${esc(it.name)}</span></td><td class="tnum"><strong>${Math.floor(a.durationSeconds / 60)}:${String(a.durationSeconds % 60).padStart(2, "0")} min</strong><span class="sub">${esc(parts.join(" · "))}</span></td></tr>`;
    })
    .join("");
  return `<section class="card">
    <h3>Aktivitäten aus FIT- oder TCX-Dateien</h3>
    <p class="muted small card-info">Einheiten von Garmin, Polar, Wahoo, Suunto, Zwift usw. als abgeschlossene Cardio-Einheit übernehmen (Dauer, Strecke, Puls, kcal laut Gerät). Die Dateien werden nur auf dem Handy gelesen. Einheiten mit gleichem Tag und gleicher Startzeit werden übersprungen.</p>
    <label class="btn block" for="activity-in">Dateien wählen (FIT oder TCX) …</label>
    <input id="activity-in" type="file" accept=".fit,.tcx" multiple hidden>
    ${rows ? `<table class="data-table insights-table"><tbody>${rows}</tbody></table>` : ""}
    ${open ? `<button class="btn primary block" data-act="act-save">${open === 1 ? "1 Einheit speichern" : `${open} Einheiten speichern`}</button>` : ""}
  </section>`;
}

/** Dateien lesen und als Vorschau merken. */
export async function readActivityFiles(files) {
  const db = buildDb();
  const all = [...(X.S.workouts ?? []), ...(db.workouts ?? [])];
  const items = [];
  for (const f of files) {
    const activity = D.activityFile.parseActivityFile(new Uint8Array(await f.arrayBuffer()));
    let duplicate = false;
    if (activity) {
      const ls = D.activityFile.localStart(activity.start);
      duplicate = all.some((w) => w.date === ls.date && (w.startTime ?? w.start_time) === ls.time);
    }
    items.push({ name: f.name, activity, duplicate, saved: false });
  }
  X.S.actImport = items;
  X.rerender();
}

/** Neue Einheit aus einer Datei (Felder wie workoutFromWatch). */
export function workoutFromActivity(a, exerciseId, fileName, now = new Date()) {
  const ts = C.isoNow(now);
  const ls = D.activityFile.localStart(a.start);
  const set = {
    ...C.newSet(),
    durationSeconds: a.durationSeconds,
    distanceM: a.distanceM && a.distanceM > 0 ? a.distanceM : null,
    isDone: true,
    extra: {
      hr_avg: round(a.hrAvg),
      hr_max: round(a.hrMax),
      device_kcal: round(a.kcal),
      power_w: round(a.powerW),
      power_max_w: round(a.powerMaxW),
      cadence: round(a.cadence),
      cadence_max: round(a.cadenceMax),
      elevation_m: round(a.elevationM),
    },
  };
  return {
    id: C.uuidv7(now.getTime()),
    date: ls.date,
    startTime: ls.time,
    title: D.activityFile.KIND_TITLES[a.kind],
    planDayId: null,
    gymId: null,
    perceivedExertion: null,
    notes: `Importiert aus ${a.format.toUpperCase()}-Datei „${fileName}“.`,
    status: "done",
    startedAt: ts,
    finishedAt: ts,
    durationMin: Math.min(1440, Math.max(1, Math.round(a.durationSeconds / 60))),
    createdAt: ts,
    updatedAt: ts,
    exported: false,
    exercises: [{ id: C.uuidv7(), exerciseId, notes: null, settings: C.emptySettings(), restSeconds: null, profiles: null, sets: [set] }],
  };
}

export const activityImportActions = {
  "act-save": async () => {
    const S = X.S;
    const list = cardioChoices(buildDb());
    if (!list.length) return X.toast("Es gibt noch keine Cardio-Übung. Lege unter Training → Datenbank eine an (z. B. „Laufen“).", true);
    let n = 0;
    for (const it of S.actImport ?? []) {
      if (!it.activity || it.duplicate || it.saved) continue;
      const ex = list.find((x) => x.kind === it.activity.kind) ?? list.find((x) => x.kind === "other") ?? list[0];
      S.workouts.push(workoutFromActivity(it.activity, ex.id, it.name));
      it.saved = true;
      n += 1;
    }
    await saveNow();
    X.toast(n === 1 ? "1 Einheit gespeichert" : `${n} Einheiten gespeichert`);
    X.rerender();
  },
};
