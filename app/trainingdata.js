// LIFESPAN OS Mobil – Training am Handy wie am PC (1.17.0), reine Logik.
//
// Am Handy bearbeitbar wie im Bereich Training der Desktop-App: Alltagsbewegung (NEAT, wie
// repo/neat.rs), Trainingspläne mit Tagen, Übungen, Sätzen und Terminen (repo/plan.rs), Übungen
// (repo/exercise.rs), Sportarten (repo/sport.rs) und Check-In-Fotos (repo/checkin.rs).
//
// Daten vom PC: die Tabellen der Exportdatei (catalog.exercises, catalog.sports, catalog.pc.*).
// Am Handy Geändertes liegt in `local.rows[table][id] = { row, sent }`, Gelöschtes als Löschvermerk
// `local.deleted["table:id"] = { at, sent }`. `overlayCatalog` legt beides über den Stand vom PC –
// so sehen alle Ansichten (auch Overview, Plan starten, Übungssuche) die Änderungen. Alles geht mit
// „Körperwerte … senden“ an den PC (Import „Abgleichen“: neuerer `updated_at` gewinnt).

export const TRAIN_TABLES = [
  "exercise",
  "sport",
  "neat_day",
  "training_plan",
  "training_plan_day",
  "training_plan_exercise",
  "training_plan_set",
  "training_plan_slot",
  "checkin_photo",
];

/** Reihenfolge in der Rückgabedatei (Verweise zuerst). */
const ORDER = ["sport", "exercise", "training_plan", "training_plan_day", "training_plan_exercise", "training_plan_set", "training_plan_slot", "neat_day", "checkin_photo"];

export function emptyTrainLocal() {
  return { rows: {}, deleted: {} };
}

export function trainState(saved) {
  const s = { ...emptyTrainLocal(), ...(saved ?? {}) };
  if (!s.rows || typeof s.rows !== "object") s.rows = {};
  if (!s.deleted || typeof s.deleted !== "object") s.deleted = {};
  return s;
}

const iso = (now) => now.toISOString();
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const chars = (s) => [...String(s ?? "")].length;

class FieldError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

function rawRows(raw, table) {
  if (table === "exercise") return raw?.exercises ?? [];
  if (table === "sport") return raw?.sports ?? [];
  return raw?.pc?.[table] ?? [];
}

/** Hat die Exportdatei die Tabelle überhaupt (ältere Exporte: Pläne und Check-Ins fehlen)? */
export function hasTable(raw, table) {
  if (table === "exercise" || table === "sport") return Array.isArray(raw?.[table === "exercise" ? "exercises" : "sports"]);
  return Array.isArray(raw?.pc?.[table]);
}

/** Zeilen einer Tabelle: Stand vom PC, darüber die Änderungen vom Handy. */
export function rowsOf(raw, local, table) {
  const l = trainState(local);
  const m = new Map();
  for (const r of rawRows(raw, table)) if (!l.deleted[`${table}:${r.id}`]) m.set(r.id, r);
  for (const e of Object.values(l.rows[table] ?? {})) m.set(e.row.id, e.row);
  return [...m.values()];
}

function put(local, table, row) {
  if (!local.rows[table]) local.rows[table] = {};
  local.rows[table][row.id] = { row, sent: false };
  delete local.deleted[`${table}:${row.id}`];
}

function remove(raw, local, table, id, now) {
  const own = local.rows[table]?.[id];
  if (local.rows[table]) delete local.rows[table][id];
  const onPc = rawRows(raw, table).some((r) => r.id === id);
  if (onPc || own?.sent) local.deleted[`${table}:${id}`] = { at: iso(now), sent: false };
}

/** Zeile mit allen Spalten, die der PC für die Tabelle kennt (fehlende = null). */
function withColumns(raw, table, row) {
  const cols = raw?.columns?.[table];
  if (!cols) return row;
  const out = Object.fromEntries(cols.map((c) => [c, null]));
  return { ...out, ...row };
}

// ------------------------------------------------------------------ Katalog mit Änderungen

const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);

/**
 * Katalog wie vom PC, darüber die Änderungen vom Handy: Übungen, Sportarten, Pläne (auch die
 * aufbereitete Liste `plans` zum Starten), NEAT und Check-Ins. `plansFromRows` kommt aus core.js.
 */
export function overlayCatalog(raw, local, plansFromRows) {
  if (!raw) return raw;
  const l = trainState(local);
  if (!Object.keys(l.rows).length && !Object.keys(l.deleted).length) return raw;
  const pc = { ...(raw.pc ?? {}) };
  for (const t of TRAIN_TABLES) {
    if (t === "exercise" || t === "sport") continue;
    if (hasTable(raw, t) || l.rows[t]) pc[t] = rowsOf(raw, l, t);
  }
  if (pc.checkin_photo) pc.checkin_date = [...new Set(pc.checkin_photo.map((c) => c.date))].map((date) => ({ date }));
  const out = { ...raw, exercises: rowsOf(raw, l, "exercise"), sports: rowsOf(raw, l, "sport"), pc };
  if (hasTable(raw, "training_plan")) out.plans = plansFromRows((name) => pc[name] ?? []);
  return out;
}

// ------------------------------------------------------------------ Pläne (wie plan::get)

const settingsOf = (r) => ({
  seatHeight: r.seat_height ?? null,
  seatDepth: r.seat_depth ?? null,
  chestPadHeight: r.chest_pad_height ?? null,
  chestPadAngle: r.chest_pad_angle ?? null,
  gripWidth: r.grip_width ?? null,
  backrest: r.backrest ?? null,
  footrest: r.footrest ?? null,
  gripPosition: r.grip_position ?? null,
});

const RP = [
  ["rpMidKg", "rp_mid_kg"],
  ["rpEndKg", "rp_end_kg"],
  ["rpBeginKg", "rp_begin_kg"],
  ["rpMidEndKg", "rp_mid_end_kg"],
  ["rpMidBeginKg", "rp_mid_begin_kg"],
  ["rpIsokineticKg", "rp_isokinetic_kg"],
  ["rpEccentricKg", "rp_eccentric_kg"],
  ["rpConcentricKg", "rp_concentric_kg"],
  ["rpIsometricKg", "rp_isometric_kg"],
];
const CARDIO = [
  ["hrAvg", "hr_avg"],
  ["hrMax", "hr_max"],
  ["powerW", "power_w"],
  ["inclinePct", "incline_pct"],
  ["elevationM", "elevation_m"],
  ["cadence", "cadence"],
  ["level", "level"],
  ["deviceKcal", "device_kcal"],
  ["powerMaxW", "power_max_w"],
  ["cadenceMax", "cadence_max"],
];
const rpOf = (r) => Object.fromEntries(RP.map(([k, c]) => [k, r[c] ?? null]));
const cardioOf = (r) => Object.fromEntries(CARDIO.map(([k, c]) => [k, r[c] ?? null]));

/** Pläne in der Form der Desktop-App (`TrainingPlan`), auch archivierte, nach Name. */
export function plansOf(raw, local, exercises) {
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const days = rowsOf(raw, local, "training_plan_day");
  const pex = rowsOf(raw, local, "training_plan_exercise");
  const psets = rowsOf(raw, local, "training_plan_set");
  const slots = rowsOf(raw, local, "training_plan_slot");
  return rowsOf(raw, local, "training_plan")
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      archived: Boolean(p.archived),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      days: days
        .filter((d) => d.plan_id === p.id)
        .sort(byPosition)
        .map((d) => ({
          id: d.id,
          name: d.name,
          notes: d.notes ?? null,
          slots: slots
            .filter((s) => s.plan_day_id === d.id)
            .sort(byPosition)
            .map((s) => ({ weekday: s.weekday ?? null, date: s.date ?? null, time: s.time ?? null })),
          exercises: pex
            .filter((e) => e.plan_day_id === d.id)
            .sort(byPosition)
            .map((e) => {
              const ex = exById.get(e.exercise_id);
              return {
                id: e.id,
                exerciseId: e.exercise_id,
                exerciseName: ex?.name ?? "Unbekannte Übung",
                exerciseCategory: ex?.category ?? "strength",
                targetSets: e.target_sets ?? null,
                targetRepsMin: e.target_reps_min ?? null,
                targetRepsMax: e.target_reps_max ?? null,
                targetWeightKg: e.target_weight_kg ?? null,
                restSeconds: e.rest_seconds ?? null,
                notes: e.notes ?? null,
                ...rpOf(e),
                settings: settingsOf(e),
                sets: psets
                  .filter((s) => s.plan_exercise_id === e.id)
                  .sort(byPosition)
                  .map((s) => ({
                    reps: s.reps ?? null,
                    weightKg: s.weight_kg ?? null,
                    durationSeconds: s.duration_seconds ?? null,
                    distanceM: s.distance_m ?? null,
                    rpe: s.rpe ?? null,
                    isWarmup: Boolean(s.is_warmup),
                    isUnilateral: Boolean(s.is_unilateral),
                    ...rpOf(s),
                    ...cardioOf(s),
                  })),
              };
            }),
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function reqText(field, what, value, max) {
  const t = String(value ?? "").trim();
  if (t === "") throw new FieldError(field, `Bitte ${what} eingeben.`);
  if (chars(t) > max) throw new FieldError(field, `Höchstens ${max} Zeichen.`);
  return t;
}
function optText(field, value, max) {
  const t = String(value ?? "").trim();
  if (t === "") return null;
  if (chars(t) > max) throw new FieldError(field, `Höchstens ${max} Zeichen.`);
  return t;
}

/** Plan speichern wie `plan::save` (Eingabe = `planDraftToInput` der Desktop-App). */
export function savePlan(raw, local, input, { uuid, now = new Date(), exercises }) {
  const name = reqText("name", "einen Namen", input.name, 80);
  const description = optText("description", input.description, 2000);
  const known = new Set(exercises.map((e) => e.id));
  if (rowsOf(raw, local, "training_plan").some((p) => p.name === name && p.id !== input.id)) {
    throw new FieldError("name", `Einen Plan „${name}“ gibt es bereits.`);
  }
  input.days.forEach((day, di) => {
    reqText(`days.${di}.name`, "einen Namen für den Trainingstag", day.name, 80);
    optText(`days.${di}.notes`, day.notes, 1000);
    if (day.slots.length > 100) throw new FieldError(`days.${di}.slots`, "Höchstens 100 Termine je Trainingstag.");
    day.slots.forEach((s, si) => {
      const f = (n) => `days.${di}.slots.${si}.${n}`;
      if (s.time !== null && !TIME_RE.test(s.time)) throw new FieldError(f("time"), "Bitte eine Uhrzeit wie 18:30 angeben.");
      if ((s.weekday === null) === (s.date === null)) throw new FieldError(f("weekday"), "Bitte Wochentag oder Datum wählen.");
      if (s.weekday !== null && !(s.weekday >= 1 && s.weekday <= 7)) throw new FieldError(f("weekday"), "Bitte einen Wochentag wählen.");
      if (s.date !== null && !DATE_RE.test(s.date)) throw new FieldError(f("date"), "Bitte ein Datum wählen.");
    });
    day.exercises.forEach((ex, ei) => {
      const f = (n) => `days.${di}.exercises.${ei}.${n}`;
      if (!known.has(ex.exerciseId)) throw new FieldError(f("exerciseId"), "Bitte eine Übung wählen.");
      if (ex.sets.length > 50) throw new FieldError(f("sets"), "Höchstens 50 Sätze je Übung.");
      if (ex.restSeconds !== null && !(ex.restSeconds >= 0 && ex.restSeconds <= 1800)) throw new FieldError(f("restSeconds"), "Pause: 0 bis 1800 Sekunden.");
      optText(f("notes"), ex.notes, 500);
    });
  });

  const ts = iso(now);
  const oldPlan = rowsOf(raw, local, "training_plan").find((p) => p.id === input.id) ?? null;
  const planId = oldPlan?.id ?? uuid();
  put(local, "training_plan", withColumns(raw, "training_plan", { ...(oldPlan ?? {}), id: planId, name, description, archived: input.archived ? 1 : 0, created_at: oldPlan?.created_at ?? ts, updated_at: ts }));

  const oldDays = rowsOf(raw, local, "training_plan_day").filter((d) => d.plan_id === planId);
  const oldPex = rowsOf(raw, local, "training_plan_exercise");
  const keepDays = new Set();
  const keepPex = new Set();
  input.days.forEach((day, di) => {
    const old = oldDays.find((d) => d.id === day.id) ?? null;
    const dayId = old?.id ?? uuid();
    keepDays.add(dayId);
    put(local, "training_plan_day", withColumns(raw, "training_plan_day", { ...(old ?? {}), id: dayId, plan_id: planId, name: day.name.trim(), position: di, notes: optText("", day.notes, 1000), created_at: old?.created_at ?? ts, updated_at: ts }));
    // Termine: alte entfernen, neu anlegen (wie plan::save)
    for (const s of rowsOf(raw, local, "training_plan_slot").filter((x) => x.plan_day_id === dayId)) remove(raw, local, "training_plan_slot", s.id, now);
    day.slots.forEach((s, si) => {
      put(local, "training_plan_slot", withColumns(raw, "training_plan_slot", { id: uuid(), plan_day_id: dayId, position: si, weekday: s.weekday, date: s.date, time: s.time, created_at: ts, updated_at: ts }));
    });
    day.exercises.forEach((ex, ei) => {
      const oldEx = oldPex.find((e) => e.id === ex.id && oldDays.some((d) => d.id === e.plan_day_id)) ?? null;
      const pexId = oldEx?.id ?? uuid();
      keepPex.add(pexId);
      const st = ex.settings ?? {};
      put(local, "training_plan_exercise", withColumns(raw, "training_plan_exercise", {
        ...(oldEx ?? {}),
        id: pexId,
        plan_day_id: dayId,
        exercise_id: ex.exerciseId,
        position: ei,
        target_sets: ex.targetSets,
        target_reps_min: ex.targetRepsMin,
        target_reps_max: ex.targetRepsMax,
        target_weight_kg: ex.targetWeightKg,
        rest_seconds: ex.restSeconds,
        notes: optText("", ex.notes, 500),
        ...Object.fromEntries(RP.map(([k, c]) => [c, ex[k] ?? null])),
        seat_height: st.seatHeight ?? null,
        seat_depth: st.seatDepth ?? null,
        chest_pad_height: st.chestPadHeight ?? null,
        chest_pad_angle: st.chestPadAngle ?? null,
        grip_width: st.gripWidth ?? null,
        backrest: st.backrest ?? null,
        footrest: st.footrest ?? null,
        grip_position: st.gripPosition ?? null,
        created_at: oldEx?.created_at ?? ts,
        updated_at: ts,
      }));
      for (const s of rowsOf(raw, local, "training_plan_set").filter((x) => x.plan_exercise_id === pexId)) remove(raw, local, "training_plan_set", s.id, now);
      ex.sets.forEach((s, si) => {
        put(local, "training_plan_set", withColumns(raw, "training_plan_set", {
          id: uuid(),
          plan_exercise_id: pexId,
          position: si,
          reps: s.reps,
          weight_kg: s.weightKg,
          duration_seconds: s.durationSeconds,
          distance_m: s.distanceM,
          rpe: s.rpe,
          is_warmup: s.isWarmup ? 1 : 0,
          is_unilateral: s.isUnilateral ? 1 : 0,
          ...Object.fromEntries(RP.map(([k, c]) => [c, s[k] ?? null])),
          ...Object.fromEntries(CARDIO.map(([k, c]) => [c, s[k] ?? null])),
          created_at: ts,
          updated_at: ts,
        }));
      });
    });
  });
  // Nicht mehr mitgeschickte Tage und Übungen entfernen
  for (const d of oldDays) if (!keepDays.has(d.id)) removeDay(raw, local, d.id, now);
  for (const e of oldPex) if (oldDays.some((d) => d.id === e.plan_day_id) && keepDays.has(e.plan_day_id) && !keepPex.has(e.id)) removePlanExercise(raw, local, e.id, now);
  return planId;
}

function removePlanExercise(raw, local, id, now) {
  for (const s of rowsOf(raw, local, "training_plan_set").filter((x) => x.plan_exercise_id === id)) remove(raw, local, "training_plan_set", s.id, now);
  remove(raw, local, "training_plan_exercise", id, now);
}

function removeDay(raw, local, id, now) {
  for (const e of rowsOf(raw, local, "training_plan_exercise").filter((x) => x.plan_day_id === id)) removePlanExercise(raw, local, e.id, now);
  for (const s of rowsOf(raw, local, "training_plan_slot").filter((x) => x.plan_day_id === id)) remove(raw, local, "training_plan_slot", s.id, now);
  remove(raw, local, "training_plan_day", id, now);
}

/** Plan löschen (mit Tagen, Übungen, Sätzen, Terminen); Einheiten bleiben. */
export function deletePlan(raw, local, id, now = new Date()) {
  for (const d of rowsOf(raw, local, "training_plan_day").filter((x) => x.plan_id === id)) removeDay(raw, local, d.id, now);
  remove(raw, local, "training_plan", id, now);
}

/** Name der Kopie wie `plan::copy_name`. */
export function copyName(raw, local, name) {
  const taken = new Set(rowsOf(raw, local, "training_plan").map((p) => p.name));
  for (let n = 1; n <= 99; n++) {
    const suffix = n === 1 ? " (Kopie)" : ` (Kopie ${n})`;
    const base = [...name].slice(0, 80 - [...suffix].length).join("").trimEnd();
    if (!taken.has(`${base}${suffix}`)) return `${base}${suffix}`;
  }
  throw new Error("Es gibt bereits zu viele Kopien dieses Plans.");
}

/** Plan kopieren wie `plan::copy` (neue IDs, eigener Name, nicht archiviert). */
export function copyPlan(raw, local, plan, opts) {
  const input = {
    id: null,
    name: copyName(raw, local, plan.name),
    description: plan.description,
    archived: false,
    days: plan.days.map((d) => ({
      id: null,
      name: d.name,
      notes: d.notes,
      slots: d.slots ?? [],
      exercises: d.exercises.map((e) => ({ ...e, id: null })),
    })),
  };
  return savePlan(raw, local, input, opts);
}

// ------------------------------------------------------------------ NEAT (wie neat::save)

export const MINUTE_FIELDS = [
  ["standingMin", "standing_min", "Stehen"],
  ["cleaningMin", "cleaning_min", "Reinigungsarbeiten"],
  ["gardeningMin", "gardening_min", "Gartenarbeit"],
  ["fidgetingMin", "fidgeting_min", "Zappeln (Fidgeting)"],
  ["officeMin", "office_min", "Arbeit (Büro)"],
  ["physicalMin", "physical_min", "Arbeit (Physisch)"],
  ["otherMin", "other_min", "Sonstiges"],
];

function optInt(field, label, value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new FieldError(field, `${label} muss eine ganze Zahl zwischen ${min.toLocaleString("de-DE")} und ${max.toLocaleString("de-DE")} sein.`);
  }
  return n;
}

/** NEAT-Eintrag eines Tages speichern (Eingabe = `neatDraftToInput` der Desktop-App). */
export function saveNeat(raw, local, input, { uuid, now = new Date() }) {
  if (!DATE_RE.test(input.date ?? "")) throw new FieldError("date", "Bitte ein gültiges Datum angeben.");
  const steps = optInt("steps", "Die Schrittzahl", input.steps, 0, 200000);
  const minutes = MINUTE_FIELDS.map(([k, , label]) => optInt(k, `${label} (Minuten)`, input[k], 0, 1440));
  const total = minutes.reduce((a, v) => a + (v ?? 0), 0);
  if (total > 1440) throw new FieldError("standingMin", "Zusammen höchstens 1.440 Minuten (24 Stunden) je Tag.");
  const otherLabel = minutes[6] !== null ? optText("otherLabel", input.otherLabel, 80) : null;
  const notes = optText("notes", input.notes, 1000);
  if (steps === null && minutes.every((v) => v === null)) throw new FieldError("steps", "Bitte Schritte oder mindestens eine Tätigkeit eintragen.");
  const ts = iso(now);
  const old = rowsOf(raw, local, "neat_day").find((d) => d.date === input.date) ?? null;
  const row = {
    ...(old ?? {}),
    id: old?.id ?? uuid(),
    date: input.date,
    steps,
    ...Object.fromEntries(MINUTE_FIELDS.map(([, c], i) => [c, minutes[i]])),
    other_label: otherLabel,
    notes,
    created_at: old?.created_at ?? ts,
    updated_at: ts,
  };
  put(local, "neat_day", withColumns(raw, "neat_day", row));
  return row;
}

export function deleteNeat(raw, local, date, now = new Date()) {
  const old = rowsOf(raw, local, "neat_day").find((d) => d.date === date);
  if (old) remove(raw, local, "neat_day", old.id, now);
}

/** NEAT-Tag in der Form der Desktop-App (`NeatDay`). */
export function neatDayOf(r) {
  const totalMin = MINUTE_FIELDS.reduce((a, [, c]) => a + (r[c] ?? 0), 0);
  return {
    id: r.id,
    date: r.date,
    steps: r.steps ?? null,
    ...Object.fromEntries(MINUTE_FIELDS.map(([k, c]) => [k, r[c] ?? null])),
    otherLabel: r.other_label ?? null,
    notes: r.notes ?? null,
    totalMin,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ------------------------------------------------------------------ Übungen (wie exercise::save)

export const EXERCISE_CATEGORIES = ["strength", "cardio", "mobility", "other"];
export const CARDIO_KINDS = ["run", "walk", "cycle", "row", "ski", "swim", "elliptical", "stairs", "other"];

/**
 * Übung speichern. `all` = alle bekannten Übungen (PC, Handy-Übungen aus Trainings), für den
 * eindeutigen Namen. Übungen, die nur am Handy angelegt wurden, ändert app.js direkt.
 */
export function saveExercise(raw, local, input, { uuid, now = new Date(), all }) {
  const name = reqText("name", "einen Namen", input.name, 80);
  if (!EXERCISE_CATEGORIES.includes(input.category)) throw new FieldError("category", "Bitte eine Kategorie wählen.");
  const muscleGroup = optText("muscleGroup", input.muscleGroup, 60);
  const equipment = optText("equipment", input.equipment, 60);
  const notes = optText("notes", input.notes, 2000);
  const discipline = optText("discipline", input.discipline, 60);
  let cardioKind = String(input.cardioKind ?? "").trim() || null;
  if (input.category !== "cardio") cardioKind = null;
  else if (cardioKind !== null && !CARDIO_KINDS.includes(cardioKind)) throw new FieldError("cardioKind", "Bitte eine Cardio-Art wählen.");
  if (all.some((e) => e.name === name && e.id !== input.id)) throw new FieldError("name", `Eine Übung „${name}“ gibt es bereits.`);
  const profiles = Array.isArray(input.resistanceProfiles) && input.resistanceProfiles.length ? JSON.stringify(input.resistanceProfiles) : null;
  const ts = iso(now);
  const old = input.id ? rowsOf(raw, local, "exercise").find((e) => e.id === input.id) ?? null : null;
  if (input.id && !old) throw new Error("Die Übung gibt es nicht mehr.");
  const row = withColumns(raw, "exercise", {
    ...(old ?? { machine_id: null, sport_id: null }),
    id: old?.id ?? uuid(),
    name,
    category: input.category,
    muscle_group: muscleGroup,
    equipment,
    notes,
    archived: input.archived ? 1 : 0,
    resistance_profiles: profiles,
    discipline,
    cardio_kind: cardioKind,
    created_at: old?.created_at ?? ts,
    updated_at: ts,
  });
  put(local, "exercise", row);
  return row;
}

/** Übung, die nur am Handy existiert (z. B. an einer Maschine angelegt), mit an den PC geben. */
export function addExerciseRow(raw, local, row) {
  if (rowsOf(raw, local, "exercise").some((e) => e.id === row.id)) return;
  put(local, "exercise", withColumns(raw, "exercise", row));
}

/** Löschen wie `exercise::delete`: verwendete Übungen nur archivieren. */
export function deleteExercise(raw, local, id, { usedInWorkouts, now = new Date() }) {
  const inPlans = rowsOf(raw, local, "training_plan_exercise").filter((e) => e.exercise_id === id).length;
  if (usedInWorkouts > 0 || inPlans > 0) {
    throw new Error(`Die Übung wird noch verwendet (${usedInWorkouts}× in Trainingseinheiten, ${inPlans}× in Plänen) und kann nicht gelöscht werden. Du kannst sie stattdessen archivieren.`);
  }
  remove(raw, local, "exercise", id, now);
}

// ------------------------------------------------------------------ Sportarten (wie sport::save)

const IMAGE_PREFIXES = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"];

export function saveSport(raw, local, input, { uuid, now = new Date() }) {
  const name = reqText("name", "einen Namen", input.name, 80);
  const category = reqText("category", "eine Kategorie", input.category, 60);
  const description = optText("description", input.description, 2000);
  let image = String(input.image ?? "").trim() || null;
  if (image) {
    const prefix = IMAGE_PREFIXES.find((p) => image.startsWith(p));
    if (!prefix) throw new FieldError("image", "Das Bild muss ein JPEG-, PNG- oder WebP-Bild sein.");
    if (image.length > 1000000) throw new FieldError("image", "Das Bild ist zu groß. Bitte ein kleineres Bild wählen.");
    if (!/^[A-Za-z0-9+/=]+$/.test(image.slice(prefix.length))) throw new FieldError("image", "Das Bild ist beschädigt.");
  }
  if (rowsOf(raw, local, "sport").some((s) => s.name === name && s.id !== input.id)) throw new FieldError("name", `Eine Sportart „${name}“ gibt es bereits.`);
  const ts = iso(now);
  const old = input.id ? rowsOf(raw, local, "sport").find((s) => s.id === input.id) ?? null : null;
  const row = withColumns(raw, "sport", {
    ...(old ?? { image_key: null }),
    id: old?.id ?? uuid(),
    name,
    category,
    description,
    image_key: input.imageKey === undefined ? (old?.image_key ?? null) : input.imageKey,
    image,
    archived: input.archived ? 1 : 0,
    created_at: old?.created_at ?? ts,
    updated_at: ts,
  });
  put(local, "sport", row);
  return row;
}

/** Löschen wie `sport::delete`: unbenutzte Übungen der Sportart gehen mit. */
export function deleteSport(raw, local, id, { usedInWorkouts, now = new Date() }) {
  const exIds = new Set(rowsOf(raw, local, "exercise").filter((e) => e.sport_id === id).map((e) => e.id));
  const inPlans = rowsOf(raw, local, "training_plan_exercise").filter((e) => exIds.has(e.exercise_id)).length;
  if (usedInWorkouts > 0 || inPlans > 0) {
    throw new Error(`Die Sportart wird noch verwendet (${usedInWorkouts}× in Trainingseinheiten, ${inPlans}× in Plänen) und kann nicht gelöscht werden. Du kannst sie stattdessen archivieren.`);
  }
  for (const eid of exIds) remove(raw, local, "exercise", eid, now);
  remove(raw, local, "sport", id, now);
}

// ------------------------------------------------------------------ Check-Ins (wie checkin::save)

export const POSE_KEYS = [
  "front_relaxed",
  "front_double_biceps",
  "side_chest_left",
  "side_chest_right",
  "side_triceps_left",
  "side_triceps_right",
  "back_relaxed",
  "rear_double_biceps",
  "abs_thighs",
  "most_muscular",
  "side_relaxed",
  "back_lat_spread",
  "front",
  "side",
  "back",
  "other",
];
const MIMES = ["image/jpeg", "image/png", "image/webp"];
const B64 = /^[A-Za-z0-9+/=]+$/;

export function saveCheckin(raw, local, input, { uuid, now = new Date() }) {
  if (!DATE_RE.test(input.date ?? "")) throw new FieldError("date", "Bitte ein Datum angeben.");
  const time = String(input.time ?? "").trim() || null;
  if (time !== null && !TIME_RE.test(time)) throw new FieldError("time", "Bitte eine Uhrzeit wie 07:30 angeben.");
  if (!POSE_KEYS.includes(input.pose)) throw new FieldError("pose", "Bitte eine Pose wählen.");
  const notes = optText("notes", input.notes, 500);
  const old = input.id ? rowsOf(raw, local, "checkin_photo").find((c) => c.id === input.id) ?? null : null;
  let image = null;
  if (input.imageData && input.thumbData) {
    if (!MIMES.includes(input.mime)) throw new FieldError("image", "Bitte ein JPEG-, PNG- oder WebP-Bild wählen.");
    const okData = (d, max) => d.length > 0 && d.length <= max && B64.test(d);
    if (!okData(input.imageData, 8000000) || !okData(input.thumbData, 600000)) throw new FieldError("image", "Das Bild ist ungültig oder zu groß. Bitte ein anderes Bild wählen.");
    if (!(input.width >= 1 && input.width <= 10000 && input.height >= 1 && input.height <= 10000)) throw new FieldError("image", "Die Bildgröße ist ungültig.");
    image = { mime: input.mime, image_data: input.imageData, thumb_data: input.thumbData, width: input.width, height: input.height };
  }
  if (!old && !image) throw new FieldError("image", "Bitte ein Bild wählen.");
  const ts = iso(now);
  const row = withColumns(raw, "checkin_photo", {
    ...(old ?? {}),
    ...(image ?? {}),
    id: old?.id ?? uuid(),
    date: input.date,
    time,
    pose: input.pose,
    notes,
    created_at: old?.created_at ?? ts,
    updated_at: ts,
  });
  put(local, "checkin_photo", row);
  return row;
}

export function deleteCheckin(raw, local, id, now = new Date()) {
  remove(raw, local, "checkin_photo", id, now);
}

/** Check-Ins in der Form der Desktop-App (`Checkin`), nach Datum und Uhrzeit. */
export function checkinsOf(raw, local) {
  return rowsOf(raw, local, "checkin_photo")
    .map((r) => ({ id: r.id, date: r.date, time: r.time ?? null, pose: r.pose, notes: r.notes ?? null, mime: r.mime, width: r.width, height: r.height, thumbData: r.thumb_data, imageData: r.image_data, createdAt: r.created_at, updatedAt: r.updated_at }))
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.time ?? "", b.time ?? "") || cmp(a.createdAt, b.createdAt));
}

// ------------------------------------------------------------------ Senden, Abgleich

export function unsentTrain(local) {
  if (!local) return 0;
  const l = trainState(local);
  let n = 0;
  for (const t of Object.values(l.rows)) n += Object.values(t).filter((e) => !e.sent).length;
  n += Object.values(l.deleted).filter((d) => !d.sent).length;
  return n;
}

/** Tabellen für die Rückgabedatei (Zeilen und Löschvermerke). */
export function trainTables(local, { all = false } = {}) {
  if (!local) return {};
  const l = trainState(local);
  const out = {};
  for (const t of ORDER) {
    const rows = Object.values(l.rows[t] ?? {})
      .filter((e) => all || !e.sent)
      .map((e) => e.row);
    if (rows.length) out[t] = rows;
  }
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([key, d]) => {
      const [table, id] = key.split(":");
      return { id: key, table_name: table, record_id: id, deleted_at: d.at };
    });
  if (del.length) out.deleted_record = del;
  return out;
}

export function markTrainSent(local) {
  if (!local) return;
  for (const t of Object.values(local.rows ?? {})) for (const e of Object.values(t)) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
}

/** Nach neuen Daten vom PC: Übertragenes, das der PC (mindestens so neu) hat, entfällt. */
export function pruneTrain(raw, local) {
  const l = trainState(local);
  for (const [t, map] of Object.entries(l.rows)) {
    const pc = new Map(rawRows(raw, t).map((r) => [r.id, r]));
    for (const [id, e] of Object.entries(map)) {
      const r = pc.get(id);
      if (e.sent && r && String(r.updated_at) >= String(e.row.updated_at)) delete map[id];
    }
    if (!Object.keys(map).length) delete l.rows[t];
  }
  for (const [key, d] of Object.entries(l.deleted)) {
    const [t, id] = key.split(":");
    if (d.sent && !rawRows(raw, t).some((r) => r.id === id)) delete l.deleted[key];
  }
  return l;
}
