// Tests: node --test trainingdata.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as TR from "./trainingdata.js";
import { plansFromRows } from "./core.js";

let n = 0;
const uuid = () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`;
const now = new Date("2026-11-14T10:00:00Z");

function raw() {
  return {
    columns: { neat_day: ["id", "date", "steps", "standing_min", "cleaning_min", "gardening_min", "fidgeting_min", "office_min", "physical_min", "other_min", "other_label", "notes", "created_at", "updated_at"] },
    exercises: [
      { id: "ex-1", name: "Bankdrücken", category: "strength", muscle_group: "Brust", archived: 0, machine_id: null, sport_id: null, created_at: "a", updated_at: "2026-01-01" },
      { id: "ex-2", name: "Laufband", category: "cardio", muscle_group: null, archived: 0, machine_id: null, sport_id: null, created_at: "a", updated_at: "2026-01-01" },
    ],
    sports: [{ id: "sp-1", name: "Fußball", category: "Mannschaftssport", archived: 0, created_at: "a", updated_at: "a" }],
    plans: [],
    pc: {
      neat_day: [{ id: "n-1", date: "2026-11-13", steps: 5000, created_at: "a", updated_at: "2026-11-13T10:00:00Z" }],
      training_plan: [{ id: "p-1", name: "Push", description: null, archived: 0, created_at: "a", updated_at: "a" }],
      training_plan_day: [{ id: "d-1", plan_id: "p-1", name: "Tag A", position: 0, notes: null, created_at: "a", updated_at: "a" }],
      training_plan_exercise: [{ id: "pe-1", plan_day_id: "d-1", exercise_id: "ex-1", position: 0, target_sets: 2, rest_seconds: 90, created_at: "a", updated_at: "a" }],
      training_plan_set: [
        { id: "ps-1", plan_exercise_id: "pe-1", position: 0, reps: 10, weight_kg: 60, is_warmup: 0, created_at: "a", updated_at: "a" },
        { id: "ps-2", plan_exercise_id: "pe-1", position: 1, reps: 8, weight_kg: 70, is_warmup: 0, created_at: "a", updated_at: "a" },
      ],
      training_plan_slot: [],
      checkin_photo: [],
    },
  };
}

test("NEAT: Regeln wie neat::save, Eintrag je Tag", () => {
  const r = raw();
  const l = TR.emptyTrainLocal();
  assert.throws(() => TR.saveNeat(r, l, { date: "2026-11-14", steps: null }, { uuid, now }), /Schritte oder mindestens eine Tätigkeit/);
  assert.throws(() => TR.saveNeat(r, l, { date: "2026-11-14", standingMin: 1000, officeMin: 600 }, { uuid, now }), /1.440 Minuten/);
  const row = TR.saveNeat(r, l, { date: "2026-11-13", steps: 8000, standingMin: 30 }, { uuid, now });
  assert.equal(row.id, "n-1", "vorhandener Tag behält seine ID");
  assert.equal(row.standing_min, 30);
  assert.ok("office_min" in row, "alle bekannten Spalten");
  assert.equal(TR.rowsOf(r, l, "neat_day").length, 1);
  TR.deleteNeat(r, l, "2026-11-13", now);
  assert.equal(TR.rowsOf(r, l, "neat_day").length, 0);
  assert.equal(TR.trainTables(l).deleted_record[0].record_id, "n-1");
});

test("Plan: speichern wie plan::save mit Löschvermerken für ersetzte Sätze", () => {
  const r = raw();
  const l = TR.emptyTrainLocal();
  const [plan] = TR.plansOf(r, l, r.exercises);
  assert.equal(plan.days[0].exercises[0].sets.length, 2);
  const input = {
    id: plan.id,
    name: "Push neu",
    description: null,
    archived: false,
    days: [{ id: "d-1", name: "Tag A", notes: null, slots: [{ weekday: 1, date: null, time: "18:00" }], exercises: [{ ...plan.days[0].exercises[0], sets: [plan.days[0].exercises[0].sets[0]] }] }],
  };
  TR.savePlan(r, l, input, { uuid, now, exercises: r.exercises });
  const [after] = TR.plansOf(r, l, r.exercises);
  assert.equal(after.name, "Push neu");
  assert.equal(after.days[0].exercises[0].id, "pe-1", "Übung behält ihre ID");
  assert.equal(after.days[0].exercises[0].sets.length, 1);
  assert.deepEqual(after.days[0].slots, [{ weekday: 1, date: null, time: "18:00" }]);
  const del = TR.trainTables(l).deleted_record.map((d) => d.id).sort();
  assert.deepEqual(del, ["training_plan_set:ps-1", "training_plan_set:ps-2"]);
  // Katalog zum Starten am Handy
  const cat = TR.overlayCatalog(r, l, plansFromRows);
  assert.equal(cat.plans[0].row.name, "Push neu");
  assert.equal(cat.plans[0].days[0].exercises[0].sets.length, 1);
});

test("Plan: Name eindeutig, Kopie und Löschen mit allen Teilen", () => {
  const r = raw();
  const l = TR.emptyTrainLocal();
  const [plan] = TR.plansOf(r, l, r.exercises);
  assert.throws(() => TR.savePlan(r, l, { ...plan, id: null, days: [] }, { uuid, now, exercises: r.exercises }), /gibt es bereits/);
  const id = TR.copyPlan(r, l, plan, { uuid, now, exercises: r.exercises });
  const copy = TR.plansOf(r, l, r.exercises).find((p) => p.id === id);
  assert.equal(copy.name, "Push (Kopie)");
  assert.equal(copy.days[0].exercises[0].sets.length, 2);
  TR.deletePlan(r, l, id, now);
  assert.equal(TR.plansOf(r, l, r.exercises).length, 1);
  assert.equal(TR.unsentTrain(l), 0, "nie gesendete Kopie hinterlässt nichts");
  TR.deletePlan(r, l, "p-1", now);
  const del = TR.trainTables(l).deleted_record.map((d) => d.table_name);
  assert.deepEqual([...new Set(del)].sort(), ["training_plan", "training_plan_day", "training_plan_exercise", "training_plan_set"]);
});

test("Übung und Sportart: Regeln wie exercise.rs und sport.rs", () => {
  const r = raw();
  const l = TR.emptyTrainLocal();
  assert.throws(() => TR.saveExercise(r, l, { id: null, name: "Bankdrücken", category: "strength" }, { uuid, now, all: r.exercises }), /gibt es bereits/);
  const row = TR.saveExercise(r, l, { id: "ex-2", name: "Laufband", category: "cardio", cardioKind: "run", muscleGroup: "" }, { uuid, now, all: r.exercises });
  assert.equal(row.cardio_kind, "run");
  assert.throws(() => TR.saveExercise(r, l, { id: "ex-2", name: "Laufband", category: "cardio", cardioKind: "bike" }, { uuid, now, all: r.exercises }), /Cardio-Art/);
  assert.throws(() => TR.deleteExercise(r, l, "ex-1", { usedInWorkouts: 0, now }), /1× in Plänen/);
  assert.throws(() => TR.saveSport(r, l, { name: "Fußball", category: "X" }, { uuid, now }), /gibt es bereits/);
  assert.throws(() => TR.saveSport(r, l, { name: "Tennis", category: "Rückschlag", image: "http://x" }, { uuid, now }), /JPEG/);
  const s = TR.saveSport(r, l, { name: "Tennis", category: "Rückschlag" }, { uuid, now });
  assert.equal(TR.overlayCatalog(r, l, plansFromRows).sports.find((x) => x.id === s.id).name, "Tennis");
});

test("Check-In: Pflichtbild, Pose, Abgleich nach neuem Export", () => {
  const r = raw();
  const l = TR.emptyTrainLocal();
  assert.throws(() => TR.saveCheckin(r, l, { date: "2026-11-14", pose: "front_relaxed" }, { uuid, now }), /Bild/);
  assert.throws(() => TR.saveCheckin(r, l, { date: "2026-11-14", pose: "x", mime: "image/jpeg", imageData: "QUJD", thumbData: "QUJD", width: 10, height: 10 }, { uuid, now }), /Pose/);
  const row = TR.saveCheckin(r, l, { date: "2026-11-14", time: "07:30", pose: "front_relaxed", mime: "image/jpeg", imageData: "QUJD", thumbData: "QUJD", width: 10, height: 10 }, { uuid, now });
  assert.equal(TR.checkinsOf(r, l).length, 1);
  TR.markTrainSent(l);
  const r2 = raw();
  r2.pc.checkin_photo = [{ ...row }];
  const pruned = TR.pruneTrain(r2, l);
  assert.equal(TR.unsentTrain(pruned), 0);
  assert.equal(Object.keys(pruned.rows).length, 0, "der PC hat das Foto – am Handy nichts mehr offen");
});
