// LIFESPAN OS Mobil – reine Logik (ohne Oberfläche, ohne Speicher).
// Läuft im Browser und unter Node (Tests). Format und Prüfregeln folgen
// docs/EXPORTFORMAT.md und den Migrationen der Desktop-App.

import { nutritionFromRows } from "./nutrition.js";
import { bodyFromRows } from "./bodydata.js";
import { focusFromRows } from "./focusinfo.js";
import { pcFromRows } from "./pcdb.js";

export const FORMAT_NAME = "performance-os-export";
export const FORMAT_VERSION = 2;
export const MOBILE_VERSION = "1.6.0";

// ------------------------------------------------------------------ IDs und Zeit

/** UUID Version 7 (zeitlich sortierbar), wie in der Desktop-App. */
export function uuidv7(now = Date.now(), rand = cryptoRandom) {
  const b = rand(16);
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function cryptoRandom(n) {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return a;
}

/** UTC, ISO 8601 mit Millisekunden, z. B. 2026-11-12T08:15:02.123Z */
export const isoNow = (d = new Date()) => d.toISOString();

/** Kalendertag in Ortszeit: JJJJ-MM-TT */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Uhrzeit in Ortszeit: HH:MM */
export function localTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ------------------------------------------------------------------ Zahlen

/** "62,5" / "62.5" / "" → 62.5 / null; ungültig → NaN */
export function parseNum(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).trim().replace(",", ".");
  if (t === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

export function fmtNum(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return String(r).replace(".", ",");
}

// ------------------------------------------------------------------ Export einlesen

const SETTING_KEYS = [
  ["seat_height", "seatHeight"],
  ["seat_depth", "seatDepth"],
  ["chest_pad_height", "chestPadHeight"],
  ["chest_pad_angle", "chestPadAngle"],
  ["grip_width", "gripWidth"],
  ["backrest", "backrest"],
  ["footrest", "footrest"],
  ["grip_position", "gripPosition"],
];

export const SETTING_LABELS = {
  seatHeight: "Sitzhöhe",
  seatDepth: "Sitztiefe",
  chestPadHeight: "Brustpolster Höhe",
  chestPadAngle: "Brustpolster Winkel",
  gripWidth: "Griffbreite",
  backrest: "Rückenlehne",
  footrest: "Fußstütze",
};

export const GRIP_LABELS = { supinated: "Untergriff", neutral: "Neutral", pronated: "Obergriff" };

// Widerstandsprofil wie in der Desktop-App (src/domain/resistance.ts), feste Reihenfolge Feld 1–9
export const PROFILES = [
  { key: "mid", col: "rp_mid_kg", label: "Middle Range", short: "Middle" },
  { key: "end", col: "rp_end_kg", label: "End Range (Kontraktion)", short: "End" },
  { key: "begin", col: "rp_begin_kg", label: "Beginning Range (Dehnung)", short: "Beginning" },
  { key: "mid_end", col: "rp_mid_end_kg", label: "Middle + End Range", short: "Middle + End" },
  { key: "mid_begin", col: "rp_mid_begin_kg", label: "Middle + Beginning Range", short: "Middle + Beginning" },
  { key: "isokin", col: "rp_isokinetic_kg", label: "Isokinetisch", short: "Isokinetisch" },
  { key: "ecc", col: "rp_eccentric_kg", label: "Exzentrisch", short: "Exzentrisch" },
  { key: "conc", col: "rp_concentric_kg", label: "Konzentrisch", short: "Konzentrisch" },
  { key: "isom", col: "rp_isometric_kg", label: "Isometrisch", short: "Isometrisch" },
];
export const PROFILE_KEYS = PROFILES.map((p) => p.key);
export const CONC_ECC_RULE =
  "Sind Konzentrisch und Exzentrisch beide eingetragen, zählt für das Gewicht nur der konzentrische Wert.";

export function emptyProfiles() {
  return Object.fromEntries(PROFILE_KEYS.map((k) => [k, null]));
}

function profilesFromRow(row) {
  const rp = emptyProfiles();
  if (!row) return rp;
  for (const p of PROFILES) rp[p.key] = row[p.col] ?? null;
  return rp;
}

const filled = (v) => v !== null && v !== undefined && !Number.isNaN(v);

/** Eingetragene Profile (feste Reihenfolge). */
export function usedProfiles(rp) {
  return PROFILE_KEYS.filter((k) => filled(rp?.[k]));
}

/**
 * Gesamtgewicht aus den Profilgewichten (null, wenn keins eingetragen ist), auf 2 Nachkommastellen.
 * Alle Profile werden addiert; sind Konzentrisch und Exzentrisch beide eingetragen, zählt nur Konzentrisch.
 */
export function profileTotal(rp) {
  const entered = usedProfiles(rp);
  if (!entered.length) return null;
  const counted = entered.includes("conc") && entered.includes("ecc") ? entered.filter((k) => k !== "ecc") : entered;
  return Math.round(counted.reduce((a, k) => a + rp[k], 0) * 100) / 100;
}

/** Standardprofile einer Übung aus exercise.resistance_profiles („mid,end“). */
export function defaultProfiles(exercise) {
  const keys = String(exercise?.resistance_profiles ?? "").split(",").map((k) => k.trim());
  return PROFILE_KEYS.filter((k) => keys.includes(k));
}

/** Sichtbare Profilspalten: gewählte (sonst Standard der Übung) plus alle mit Werten. */
export function visibleProfiles(we, exercise) {
  const base = we.profiles ?? defaultProfiles(exercise);
  return PROFILE_KEYS.filter((k) => base.includes(k) || we.sets.some((s) => filled(s.rp?.[k])));
}

/** Kurztext wie „Middle 40 + End 20“. */
export function describeProfiles(rp) {
  return usedProfiles(rp)
    .map((k) => `${PROFILES.find((p) => p.key === k).short} ${fmtNum(rp[k])}`)
    .join(" + ");
}

export function emptySettings() {
  return Object.fromEntries(SETTING_KEYS.map(([, k]) => [k, null]));
}

function settingsFromRow(row) {
  const s = emptySettings();
  if (!row) return s;
  for (const [col, key] of SETTING_KEYS) s[key] = row[col] ?? null;
  return s;
}

function parseJsonList(text) {
  try {
    const v = JSON.parse(text ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);

/**
 * Liest eine Exportdatei der Desktop-App und behält nur, was die Handy-App braucht.
 * Wirft Error mit deutscher Meldung, wenn die Datei nicht passt.
 */
export function parseExport(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error("Die Datei ist keine gültige JSON-Datei.");
  }
  if (!doc || doc.format !== FORMAT_NAME) {
    throw new Error("Das ist keine Exportdatei von LIFESPAN OS (performance-os-export.json).");
  }
  if (!Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 38) {
    throw new Error(
      "Die Exportdatei ist zu alt. Bitte die Desktop-App aktualisieren und neu exportieren.",
    );
  }
  const t = doc.tables || {};
  const rows = (name) => (Array.isArray(t[name]) ? t[name] : []);

  // Spalten je Tabelle merken: die Rückgabedatei darf nur bekannte Spalten enthalten
  const columns = {};
  for (const [name, list] of Object.entries(t)) {
    if (Array.isArray(list) && list.length) columns[name] = Object.keys(list[0]);
  }

  const machines = rows("machine");
  const exercises = rows("exercise");
  const sports = rows("sport");

  // Trainingspläne (nicht archiviert) mit Tagen, Übungen und Sätzen
  const planRows = rows("training_plan").filter((p) => !p.archived);
  const dayRows = rows("training_plan_day");
  const pexRows = rows("training_plan_exercise");
  const psetRows = rows("training_plan_set");
  const plans = planRows
    .map((p) => ({
      row: p,
      days: dayRows
        .filter((d) => d.plan_id === p.id)
        .sort(byPosition)
        .map((d) => ({
          row: d,
          exercises: pexRows
            .filter((e) => e.plan_day_id === d.id)
            .sort(byPosition)
            .map((e) => ({
              exerciseId: e.exercise_id,
              restSeconds: e.rest_seconds ?? null,
              notes: e.notes ?? null,
              settings: settingsFromRow(e),
              targetSets: e.target_sets ?? null,
              targetRepsMax: e.target_reps_max ?? null,
              targetRepsMin: e.target_reps_min ?? null,
              targetWeightKg: e.target_weight_kg ?? null,
              rp: profilesFromRow(e),
              sets: psetRows
                .filter((s) => s.plan_exercise_id === e.id)
                .sort(byPosition)
                .map((s) => ({
                  reps: s.reps ?? null,
                  weightKg: s.weight_kg ?? null,
                  durationSeconds: s.duration_seconds ?? null,
                  distanceM: s.distance_m ?? null,
                  rpe: s.rpe ?? null,
                  isWarmup: !!s.is_warmup,
                  isUnilateral: !!s.is_unilateral,
                  rp: profilesFromRow(s),
                })),
            })),
        })),
    }))
    .filter((p) => p.days.length)
    .sort((a, b) => String(a.row.name).localeCompare(String(b.row.name), "de"));

  const last = lastSessionsFromRows(rows("workout"), rows("workout_exercise"), rows("workout_set"));
  const usage = usageFromRows(rows("workout"), rows("workout_exercise"));

  return {
    schemaVersion: doc.schemaVersion,
    appVersion: doc.appVersion ?? null,
    exportedAt: doc.exportedAt ?? null,
    loadedAt: isoNow(),
    columns,
    machines,
    exercises,
    sports,
    plans,
    last,
    usage,
    nutrition: nutritionFromRows(rows, doc.exportedAt ?? null),
    body: bodyFromRows(rows),
    focus: focusFromRows(rows),
    /** Tabellen für die Ansichten wie am PC (Overview, Nutrition; seit 1.5.0) */
    pc: pcFromRows(rows),
  };
}

/** Je Übung die zuletzt abgeschlossene Einheit (Datum, Sätze, Einstellungen). */
export function lastSessionsFromRows(workouts, wexRows, wsetRows) {
  const done = new Map(workouts.filter((w) => w.status !== "active").map((w) => [w.id, w]));
  const setsByWex = new Map();
  for (const s of wsetRows) {
    if (!setsByWex.has(s.workout_exercise_id)) setsByWex.set(s.workout_exercise_id, []);
    setsByWex.get(s.workout_exercise_id).push(s);
  }
  const last = {};
  for (const we of wexRows) {
    const w = done.get(we.workout_id);
    if (!w) continue;
    const key = `${w.date} ${w.start_time ?? "00:00"} ${w.created_at ?? ""}`;
    const prev = last[we.exercise_id];
    if (prev && prev.key >= key) continue;
    last[we.exercise_id] = {
      key,
      date: w.date,
      settings: settingsFromRow(we),
      restSeconds: we.rest_seconds ?? null,
      sets: (setsByWex.get(we.id) || []).sort(byPosition).map((s) => ({
        reps: s.reps ?? null,
        weightKg: s.weight_kg ?? null,
        durationSeconds: s.duration_seconds ?? null,
        distanceM: s.distance_m ?? null,
        rpe: s.rpe ?? null,
        isWarmup: !!s.is_warmup,
        isUnilateral: !!s.is_unilateral,
        isFailure: !!s.is_failure,
        rp: profilesFromRow(s),
      })),
    };
  }
  return last;
}

/**
 * Nutzung je Übung (1.4.1): IDs der abgeschlossenen Trainings mit dieser Übung und das letzte
 * Datum – für „wie oft benutzt, wann zuletzt“ bei der Maschinensuche.
 */
export function usageFromRows(workouts, wexRows) {
  const done = new Map(workouts.filter((w) => w.status !== "active").map((w) => [w.id, w]));
  const usage = {};
  for (const we of wexRows) {
    const w = done.get(we.workout_id);
    if (!w) continue;
    const u = (usage[we.exercise_id] ??= { workouts: [], last: null });
    if (!u.workouts.includes(w.id)) u.workouts.push(w.id);
    if (!u.last || w.date > u.last) u.last = w.date;
  }
  return usage;
}

/**
 * Wie oft eine Maschine (alle ihre Übungen) bzw. eine Übung benutzt wurde und wann zuletzt –
 * Trainings vom PC und abgeschlossene Trainings auf dem Handy, jedes Training einmal gezählt.
 */
export function usageOf(catalog, localWorkouts, exerciseIds) {
  const ids = new Set();
  let last = null;
  for (const id of exerciseIds) {
    const u = catalog.usage?.[id];
    if (!u) continue;
    for (const w of u.workouts) ids.add(w);
    if (u.last && (!last || u.last > last)) last = u.last;
  }
  for (const w of localWorkouts) {
    if (w.status !== "done" || !w.exercises.some((e) => exerciseIds.includes(e.exerciseId))) continue;
    ids.add(w.editOf ?? w.id);
    if (!last || w.date > last) last = w.date;
  }
  return { count: ids.size, last };
}

/** Letzte Einheit je Übung aus Export und den auf dem Handy erfassten Trainings. */
export function lastSessionFor(catalog, localWorkouts, exerciseId, excludeWorkoutId = null) {
  let best = catalog.last[exerciseId] || null;
  for (const w of localWorkouts) {
    if (w.status !== "done" || w.id === excludeWorkoutId) continue;
    const we = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!we) continue;
    const key = `${w.date} ${w.startTime ?? "00:00"} ${w.createdAt}`;
    if (best && best.key >= key) continue;
    best = { key, date: w.date, settings: we.settings, restSeconds: we.restSeconds, sets: we.sets };
  }
  return best;
}

// ------------------------------------------------------------------ Maschinen und Übungen

export function machineMuscles(m) {
  return parseJsonList(m.muscle_groups);
}

/** Alle Übungen: aus dem Export plus auf dem Handy angelegte (noch nicht am PC). */
export function allExercises(catalog, localExercises) {
  const ids = new Set(catalog.exercises.map((e) => e.id));
  return [...catalog.exercises, ...localExercises.filter((e) => !ids.has(e.id))];
}

/**
 * Alle nicht archivierten Übungen an einer Maschine (vom PC und auf dem Handy angelegt), älteste
 * zuerst. An einer Maschine kann es mehrere geben, z. B. „Butterfly“ und „Rear Delt“.
 */
export function machineExercises(catalog, localExercises, machineId) {
  return allExercises(catalog, localExercises)
    .filter((e) => e.machine_id === machineId && !e.archived)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function buildMachineExercise(m, name, now) {
  const muscles = machineMuscles(m);
  const ts = isoNow(now);
  return {
    id: uuidv7(now.getTime()),
    name,
    category: "strength",
    muscle_group: muscles.length ? [...muscles.join(", ")].slice(0, 60).join("") : null,
    equipment: m.gym_number || m.own_number || null,
    notes: null,
    archived: 0,
    created_at: ts,
    updated_at: ts,
    machine_id: m.id,
  };
}

/**
 * Übung zu einer Maschine – wie in der Desktop-App (repo/machine_merge.rs,
 * exercise_for_machine): vorhandene nicht archivierte Übung, sonst neue mit freiem Namen.
 */
export function exerciseForMachine(catalog, localExercises, machineId, now = new Date()) {
  const all = allExercises(catalog, localExercises);
  const existing = machineExercises(catalog, localExercises, machineId)[0];
  if (existing) return { exercise: existing, created: false };
  const m = catalog.machines.find((x) => x.id === machineId);
  if (!m) throw new Error("Maschine nicht gefunden.");
  const cut = (s) => [...s].slice(0, 80).join("").trim();
  const taken = new Set(all.map((e) => String(e.name).toLowerCase()));
  const candidates = [cut(m.display_name), cut(`${m.manufacturer} ${m.display_name}`)];
  for (let n = 2; n < 100; n++) {
    const suffix = ` (${n})`;
    const base = [...m.display_name].slice(0, 80 - suffix.length).join("");
    candidates.push(`${base.trimEnd()}${suffix}`);
  }
  const name = candidates.find((c) => c && !taken.has(c.toLowerCase()));
  if (!name) throw new Error("Kein freier Übungsname für diese Maschine.");
  return { exercise: buildMachineExercise(m, name, now), created: true };
}

/**
 * Weitere Übung an einer Maschine mit eigenem Namen. Gibt es den Namen an dieser Maschine schon,
 * wird diese Übung genommen; gehört er zu einer anderen Übung, gibt es einen Fehler (Übungsnamen
 * sind in der Desktop-App eindeutig).
 */
export function newMachineExercise(catalog, localExercises, machineId, name, now = new Date()) {
  const m = catalog.machines.find((x) => x.id === machineId);
  if (!m) throw new Error("Maschine nicht gefunden.");
  const clean = [...String(name ?? "").trim().replace(/\s+/g, " ")].slice(0, 80).join("").trim();
  if (!clean) throw new Error("Bitte einen Namen für die Übung eingeben.");
  const same = allExercises(catalog, localExercises).find(
    (e) => String(e.name).toLowerCase() === clean.toLowerCase(),
  );
  if (same) {
    if (same.machine_id === machineId && !same.archived) return { exercise: same, created: false };
    throw new Error(`Den Namen „${same.name}“ hat schon eine andere Übung. Bitte einen anderen wählen.`);
  }
  return { exercise: buildMachineExercise(m, clean, now), created: true };
}

/** Suche über Maschinen (Nummern, Name, Hersteller) und freie Übungen. */
export function search(catalog, localExercises, query, { onlyNumbered = false, limit = 60 } = {}) {
  const q = query.trim().toLowerCase();
  const byMachine = new Map();
  for (const e of allExercises(catalog, localExercises)) {
    if (!e.machine_id || e.archived) continue;
    byMachine.set(e.machine_id, [...(byMachine.get(e.machine_id) ?? []), e]);
  }
  const machineHits = [];
  for (const m of catalog.machines) {
    if (m.archived) continue;
    const numbered = !!(m.own_number || m.gym_number);
    if (onlyNumbered && !numbered) continue;
    let score = -1;
    if (!q) score = numbered ? 1 : 0;
    else if (m.own_number && String(m.own_number).toLowerCase() === q) score = 100;
    else if (m.gym_number && String(m.gym_number).toLowerCase() === q) score = 95;
    else if (m.own_number && String(m.own_number).toLowerCase().startsWith(q)) score = 60;
    else if (m.gym_number && String(m.gym_number).toLowerCase().startsWith(q)) score = 55;
    else {
      const names = (byMachine.get(m.id) ?? []).map((e) => e.name).join(" ");
      const hay = `${m.display_name} ${m.name} ${m.manufacturer} ${m.series} ${m.muscle_groups} ${names}`.toLowerCase();
      if (q.split(/\s+/).every((w) => hay.includes(w))) score = 20;
    }
    if (score >= 0) machineHits.push({ kind: "machine", score, machine: m, exercises: byMachine.get(m.id) ?? [] });
  }
  const exHits = [];
  for (const e of allExercises(catalog, localExercises)) {
    if (e.archived || e.machine_id) continue; // Maschinenübungen erscheinen über die Maschine
    const hay = `${e.name} ${e.muscle_group ?? ""} ${e.equipment ?? ""}`.toLowerCase();
    if (!q || q.split(/\s+/).every((w) => hay.includes(w))) {
      exHits.push({ kind: "exercise", score: q && e.name.toLowerCase().startsWith(q) ? 30 : 10, exercise: e });
    }
  }
  const sortKey = (h) =>
    h.kind === "machine"
      ? `${h.machine.own_number ?? h.machine.gym_number ?? "~"} ${h.machine.display_name}`
      : h.exercise.name;
  const all = [...machineHits, ...exHits].sort(
    (a, b) => b.score - a.score || numCompare(sortKey(a), sortKey(b)),
  );
  return all.slice(0, limit);
}

function numCompare(a, b) {
  return String(a).localeCompare(String(b), "de", { numeric: true, sensitivity: "base" });
}

// ------------------------------------------------------------------ Training

export function newSet(from = null) {
  return {
    id: uuidv7(),
    reps: from?.reps ?? null,
    weightKg: from?.weightKg ?? null,
    durationSeconds: from?.durationSeconds ?? null,
    distanceM: from?.distanceM ?? null,
    rpe: null,
    isWarmup: !!from?.isWarmup,
    isUnilateral: !!from?.isUnilateral,
    isDone: false,
    isFailure: false,
    notes: null,
    rp: { ...emptyProfiles(), ...(from?.rp ?? {}) },
  };
}

export function newWorkout({ title, planDayId = null, now = new Date() }) {
  const ts = isoNow(now);
  return {
    id: uuidv7(now.getTime()),
    date: localDate(now),
    startTime: localTime(now),
    title: [...title].slice(0, 80).join("").trim() || "Training",
    planDayId,
    perceivedExertion: null,
    notes: null,
    status: "active",
    startedAt: ts,
    finishedAt: null,
    durationMin: null,
    createdAt: ts,
    updatedAt: ts,
    exported: false,
    exercises: [],
  };
}

/** Übung in die Einheit aufnehmen; Sätze aus Plan oder letzter Einheit vorbelegen. */
export function workoutExercise({ exerciseId, planExercise = null, last = null }) {
  let sets = [];
  if (planExercise?.sets?.length) sets = planExercise.sets.map((s) => newSet(s));
  else if (planExercise?.targetSets) {
    for (let i = 0; i < planExercise.targetSets; i++) {
      sets.push(newSet({ reps: planExercise.targetRepsMax ?? planExercise.targetRepsMin, weightKg: planExercise.targetWeightKg, rp: planExercise.rp }));
    }
  } else if (last?.sets?.length) {
    sets = last.sets.map((s) => newSet(s));
  } else sets = [newSet()];
  const fromPlan = planExercise?.settings && Object.values(planExercise.settings).some((v) => v);
  return {
    id: uuidv7(),
    exerciseId,
    notes: null,
    settings: { ...emptySettings(), ...(fromPlan ? planExercise.settings : last?.settings ?? {}) },
    restSeconds: planExercise?.restSeconds ?? last?.restSeconds ?? 90,
    profiles: null, // null = Standardprofile der Übung
    sets,
  };
}

const hasValue = (s) =>
  (s.reps !== null && s.reps !== undefined) ||
  (s.durationSeconds !== null && s.durationSeconds !== undefined) ||
  (s.distanceM !== null && s.distanceM !== undefined);

/** Prüft eine Einheit vor dem Abschließen. Liefert Fehlertexte (leer = in Ordnung). */
export function checkWorkout(w, { keepUnticked = false } = {}) {
  const errors = [];
  const kept = w.exercises.filter((e) => e.sets.some((s) => hasValue(s) && (keepUnticked || s.isDone)));
  if (!kept.length) {
    errors.push(
      keepUnticked
        ? "Trage mindestens einen Satz mit Wiederholungen ein."
        : "Hake mindestens einen Satz mit Wiederholungen ab.",
    );
  }
  for (const e of w.exercises) {
    for (const s of e.sets) {
      for (const [v, lo, hi, label] of [
        [s.reps, 0, 1000, "Wiederholungen"],
        [s.weightKg, 0, 1000, "Gewicht"],
        [s.rpe, 1, 10, "RPE"],
        [s.durationSeconds, 1, 86400, "Dauer"],
        [s.distanceM, 0, 1000000, "Strecke"],
        ...PROFILES.map((p) => [s.rp?.[p.key] ?? null, 0, 1000, p.short]),
      ]) {
        if (v === null || v === undefined) continue;
        if (Number.isNaN(v) || v < lo || v > hi) errors.push(`${label}: Wert ${fmtNum(v)} ist ungültig.`);
      }
    }
  }
  if (w.perceivedExertion !== null && (w.perceivedExertion < 1 || w.perceivedExertion > 10)) {
    errors.push("Anstrengung muss zwischen 1 und 10 liegen.");
  }
  return [...new Set(errors)];
}

/** Sätze mit Werten, die nicht abgehakt sind (z. B. aus dem Plan vorbelegt). */
export function untickedCount(w) {
  return w.exercises.reduce((n, e) => n + e.sets.filter((s) => hasValue(s) && !s.isDone).length, 0);
}

/**
 * Abschließen: leere Sätze, nicht abgehakte Sätze (außer keepUnticked) und Übungen
 * ohne Sätze entfernen, Dauer berechnen.
 */
export function finishWorkout(w, now = new Date(), { keepUnticked = false } = {}) {
  const ts = isoNow(now);
  const exercises = w.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((s) => hasValue(s) && (keepUnticked || s.isDone)) }))
    .filter((e) => e.sets.length);
  const minutes = Math.round((now.getTime() - new Date(w.startedAt).getTime()) / 60000);
  return {
    ...w,
    exercises,
    status: "done",
    finishedAt: ts,
    updatedAt: ts,
    durationMin: Math.min(1440, Math.max(1, minutes)),
  };
}

/**
 * Abgeschlossenes Training bearbeiten (1.1.5): Kopie als laufendes Training mit `editOf`.
 * Alle Sätze bleiben abgehakt; Dauer, Datum und Startzeit bleiben, bis sie geändert werden.
 */
export function startEdit(w) {
  const copy = JSON.parse(JSON.stringify(w));
  delete copy.exported;
  return { ...copy, status: "active", editOf: w.id };
}

/**
 * Bearbeitung übernehmen: Sätze wie beim Abschließen filtern, `updatedAt` neu (gewinnt beim
 * Abgleich am PC), Dauer aus `durationMin`. Entfernte Übungen und Sätze werden als
 * Löschvermerk (`deleted_record` der Rückgabedatei) gemerkt, damit sie auch am PC verschwinden.
 * Das Training gilt danach wieder als „noch nicht an den PC gesendet“.
 */
export function saveEdit(original, edited, now = new Date(), { keepUnticked = false } = {}) {
  const ts = isoNow(now);
  const exercises = edited.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((s) => hasValue(s) && (keepUnticked || s.isDone)) }))
    .filter((e) => e.sets.length);
  const keptWe = new Set(exercises.map((e) => e.id));
  const keptSets = new Set(exercises.flatMap((e) => e.sets.map((x) => x.id)));
  const tombstones = [...(original.tombstones || [])];
  const known = new Set(tombstones.map((t) => `${t.table}:${t.id}`));
  const add = (table, id) => {
    const key = `${table}:${id}`;
    if (known.has(key)) return;
    known.add(key);
    tombstones.push({ table, id, at: ts });
  };
  for (const e of original.exercises) {
    for (const x of e.sets) if (!keptSets.has(x.id)) add("workout_set", x.id);
    if (!keptWe.has(e.id)) add("workout_exercise", e.id);
  }
  const minutes = Number.isFinite(edited.durationMin) ? Math.round(edited.durationMin) : original.durationMin;
  const { editOf, ...rest } = edited;
  void editOf;
  return {
    ...rest,
    exercises,
    status: "done",
    startedAt: original.startedAt,
    finishedAt: original.finishedAt,
    updatedAt: ts,
    durationMin: Math.min(1440, Math.max(1, minutes ?? 1)),
    tombstones,
    exported: false,
  };
}

/** Volumen wie in der Desktop-App: Wdh. × kg der Arbeitssätze, „Fail“ mit 50 %. */
export function volumeKg(w) {
  let v = 0;
  for (const e of w.exercises) {
    for (const s of e.sets) {
      if (s.isWarmup || !s.reps || !s.weightKg) continue;
      v += s.isFailure ? (s.reps - 1) * s.weightKg + 0.5 * s.weightKg : s.reps * s.weightKg;
    }
  }
  return v;
}

// ------------------------------------------------------------------ Rückgabedatei

const nn = (v) => (v === undefined || (typeof v === "number" && Number.isNaN(v)) ? null : v);
const txt = (v, max) => {
  if (v === null || v === undefined) return null;
  const t = [...String(v).trim()].slice(0, max).join("");
  return t === "" ? null : t;
};

/**
 * Baut eine Teil-Exportdatei mit den abgeschlossenen Trainings vom Handy.
 * Enthält alle Einträge, auf die die Trainings verweisen (Übungen, Maschinen,
 * Sportarten, Planttage), damit die Desktop-App sie vollständig prüfen kann.
 * Am PC mit „Abgleichen (zweites Gerät)“ importieren.
 */
export function buildReturnFile(catalog, localExercises, workouts, now = new Date(), extraTables = {}) {
  const done = workouts.filter((w) => w.status === "done");
  const exById = new Map(allExercises(catalog, localExercises).map((e) => [e.id, e]));
  const machineById = new Map(catalog.machines.map((m) => [m.id, m]));
  const sportById = new Map(catalog.sports.map((s) => [s.id, s]));
  const dayById = new Map();
  const planById = new Map();
  for (const p of catalog.plans) {
    planById.set(p.row.id, p.row);
    for (const d of p.days) dayById.set(d.row.id, d.row);
  }

  const out = {
    machine: new Map(),
    sport: new Map(),
    exercise: new Map(),
    training_plan: new Map(),
    training_plan_day: new Map(),
    workout: [],
    workout_exercise: [],
    workout_set: [],
    /** Löschvermerke aus bearbeiteten Trainings (entfernte Übungen und Sätze) */
    deleted_record: [],
  };

  for (const w of done) {
    let planDayId = w.planDayId;
    if (planDayId && dayById.has(planDayId)) {
      const day = dayById.get(planDayId);
      out.training_plan_day.set(day.id, day);
      if (planById.has(day.plan_id)) out.training_plan.set(day.plan_id, planById.get(day.plan_id));
      else planDayId = null;
    } else planDayId = null;

    out.workout.push({
      id: w.id,
      date: w.date,
      start_time: w.startTime,
      duration_min: w.durationMin,
      title: txt(w.title, 80) ?? "Training",
      plan_day_id: planDayId,
      perceived_exertion: nn(w.perceivedExertion),
      notes: txt(w.notes, 2000),
      created_at: w.createdAt,
      updated_at: w.updatedAt,
      status: "done",
      started_at: w.startedAt,
      finished_at: w.finishedAt,
    });

    w.exercises.forEach((we, wi) => {
      const ex = exById.get(we.exerciseId);
      if (!ex) throw new Error(`Übung fehlt (${we.exerciseId}). Bitte neue Daten vom PC laden.`);
      out.exercise.set(ex.id, ex);
      if (ex.machine_id && machineById.has(ex.machine_id)) out.machine.set(ex.machine_id, machineById.get(ex.machine_id));
      if (ex.sport_id && sportById.has(ex.sport_id)) out.sport.set(ex.sport_id, sportById.get(ex.sport_id));
      const st = we.settings || {};
      out.workout_exercise.push({
        id: we.id,
        workout_id: w.id,
        exercise_id: ex.id,
        position: wi,
        notes: txt(we.notes, 500),
        created_at: w.createdAt,
        updated_at: w.updatedAt,
        seat_height: txt(st.seatHeight, 40),
        seat_depth: txt(st.seatDepth, 40),
        chest_pad_height: txt(st.chestPadHeight, 40),
        chest_pad_angle: txt(st.chestPadAngle, 40),
        grip_width: txt(st.gripWidth, 40),
        backrest: txt(st.backrest, 40),
        footrest: txt(st.footrest, 40),
        rest_seconds: nn(we.restSeconds),
        grip_position: st.gripPosition || null,
      });
      we.sets.forEach((s, si) => {
        const total = profileTotal(s.rp);
        const rpCols = Object.fromEntries(PROFILES.map((p) => [p.col, filled(s.rp?.[p.key]) ? s.rp[p.key] : null]));
        out.workout_set.push({
          id: s.id,
          workout_exercise_id: we.id,
          position: si,
          reps: nn(s.reps),
          weight_kg: total !== null ? total : nn(s.weightKg),
          duration_seconds: nn(s.durationSeconds),
          distance_m: nn(s.distanceM),
          rpe: nn(s.rpe),
          is_warmup: s.isWarmup ? 1 : 0,
          notes: txt(s.notes, 200),
          created_at: w.createdAt,
          updated_at: w.updatedAt,
          is_unilateral: s.isUnilateral ? 1 : 0,
          is_done: s.isDone ? 1 : 0,
          is_failure: s.isFailure ? 1 : 0,
          ...rpCols,
        });
      });
    });
    for (const t of w.tombstones || []) {
      out.deleted_record.push({
        id: `${t.table}:${t.id}`,
        table_name: t.table,
        record_id: t.id,
        deleted_at: t.at,
      });
    }
  }

  // Nur Spalten, die die Desktop-App beim Export kannte (passend zum Schemastand)
  const fit = (table, row) => {
    const cols = catalog.columns[table];
    if (!cols) return row;
    return Object.fromEntries(Object.entries(row).filter(([k]) => cols.includes(k)));
  };

  const tables = {};
  for (const [name, val] of Object.entries(out)) {
    const list = Array.isArray(val) ? val : [...val.values()];
    if (list.length) tables[name] = list.map((r) => fit(name, r));
  }
  // Ernährung vom Handy (Lebensmittel, Strichcodes, Mahlzeiten, Rezepte; siehe nutrition.js)
  for (const [name, list] of Object.entries(extraTables)) {
    if (list.length) tables[name] = [...(tables[name] ?? []), ...list.map((r) => fit(name, r))];
  }
  if (!Object.keys(tables).length) throw new Error("Es gibt nichts zu senden.");

  return {
    format: FORMAT_NAME,
    formatVersion: FORMAT_VERSION,
    schemaVersion: catalog.schemaVersion,
    appVersion: catalog.appVersion ?? "mobil",
    exportedAt: now.toISOString(),
    source: `LIFESPAN OS Mobil ${MOBILE_VERSION}`,
    tables,
  };
}

/**
 * Dateiname der Rückgabedatei (1.2.4): Trainings „LIFESPAN Smartphone-Training 2026-11-12 1810.json“,
 * Ernährung „LIFESPAN Lebensmittel 2026-11-12 1810.json“.
 */
export function returnFileName(now = new Date(), kind = "training") {
  const label = kind === "food" ? "Lebensmittel" : kind === "body" ? "Körperwerte" : "Smartphone-Training";
  return `LIFESPAN ${label} ${localDate(now)} ${localTime(now).replace(":", "")}.json`;
}

/** Beim Laden neuer Daten: Handy-Übungen behalten, die noch von offenen Trainings gebraucht werden. */
export function keepLocalExercises(catalog, localExercises, workouts) {
  const inCatalog = new Set(catalog.exercises.map((e) => e.id));
  const needed = new Set();
  for (const w of workouts) for (const e of w.exercises) needed.add(e.exerciseId);
  return localExercises.filter((e) => !inCatalog.has(e.id) && needed.has(e.id));
}
