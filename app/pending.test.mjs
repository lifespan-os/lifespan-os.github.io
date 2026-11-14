// Tests: node --test pending.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as PD from "./pending.js";
import * as TR from "./trainingdata.js";
import * as LG from "./logsdata.js";

let n = 0;
const uuid = () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`;
const now = new Date("2026-11-14T10:00:00Z");

function state() {
  const raw = {
    columns: {},
    exercises: [{ id: "ex-1", name: "Bankdrücken", category: "strength", archived: 0, created_at: "a", updated_at: "a" }],
    sports: [],
    plans: [],
    body: { metrics: [{ id: "m-1", name: "Gewicht" }], measurements: [{ id: "bm-1", metric_id: "m-1", date: "2026-11-13", value: 80 }] },
    pc: {
      training_plan: [{ id: "p-1", name: "Push", archived: 0, created_at: "a", updated_at: "a" }],
      training_plan_day: [{ id: "d-1", plan_id: "p-1", name: "Tag A", position: 0, created_at: "a", updated_at: "a" }],
      training_plan_exercise: [{ id: "pe-1", plan_day_id: "d-1", exercise_id: "ex-1", position: 0, target_sets: 2, rest_seconds: 90, created_at: "a", updated_at: "a" }],
      training_plan_set: [
        { id: "ps-1", plan_exercise_id: "pe-1", position: 0, reps: 10, weight_kg: 60, is_warmup: 0, created_at: "a", updated_at: "a" },
        { id: "ps-2", plan_exercise_id: "pe-1", position: 1, reps: 8, weight_kg: 70, is_warmup: 0, created_at: "a", updated_at: "a" },
      ],
      training_plan_slot: [],
      sleep_log: [{ id: "s-1", date: "2026-11-12", bed_time: "23:00", wake_time: "07:00", created_at: "a", updated_at: "a" }],
    },
  };
  return { catalogRaw: raw, catalog: raw, train: TR.emptyTrainLocal(), logs: LG.emptyLogsLocal(), body: { local: { entries: {} } }, workouts: [], super: null, water: null };
}

test("Plan mit Sätzen erscheint als ein Eintrag und lässt sich verwerfen", () => {
  const st = state();
  const [plan] = TR.plansOf(st.catalogRaw, st.train, st.catalogRaw.exercises);
  const input = { ...plan, name: "Push neu", days: [{ ...plan.days[0], slots: [], exercises: [{ ...plan.days[0].exercises[0], sets: [plan.days[0].exercises[0].sets[0]] }] }] };
  TR.savePlan(st.catalogRaw, st.train, input, { uuid, now, exercises: st.catalogRaw.exercises });
  const items = PD.pendingItems(st);
  assert.equal(items.length, 1, "Plan, Tag, Übung, Satz und Löschvermerke gehören zusammen");
  const it = items[0];
  assert.equal(it.table, "training_plan");
  assert.equal(it.title, "Push neu");
  assert.equal(it.status, "Geändert");
  assert.equal(it.edit.act, "plan-edit");
  assert.ok(it.parts.some((p) => p.startsWith("entfernt:") && p.includes("Sätze")), it.parts.join(" | "));
  assert.deepEqual(PD.discardItem(st, it), ["train"]);
  assert.equal(TR.unsentTrain(st.train), 0);
  assert.equal(TR.plansOf(st.catalogRaw, st.train, st.catalogRaw.exercises)[0].name, "Push", "Stand vom PC gilt wieder");
});

test("Neue Übung, die ein offener Plan verwendet, bleibt bis der Plan verworfen ist", () => {
  const st = state();
  const ex = TR.saveExercise(st.catalogRaw, st.train, { id: null, name: "Dips", category: "strength" }, { uuid, now, all: st.catalogRaw.exercises });
  const exercises = [...st.catalogRaw.exercises, ex];
  const [plan] = TR.plansOf(st.catalogRaw, st.train, exercises);
  const pe = { ...plan.days[0].exercises[0], id: null, exerciseId: ex.id, sets: [{ id: null, reps: 10, weightKg: null, isWarmup: false }] };
  TR.savePlan(st.catalogRaw, st.train, { ...plan, days: [{ ...plan.days[0], slots: [], exercises: [...plan.days[0].exercises, pe] }] }, { uuid, now, exercises });
  const items = PD.pendingItems(st);
  const exItem = items.find((i) => i.table === "exercise");
  assert.equal(exItem.status, "Neu");
  assert.throws(() => PD.discardItem(st, exItem), /zuerst das verwerfen/);
  PD.discardItem(st, items.find((i) => i.table === "training_plan"));
  PD.discardItem(st, PD.pendingItems(st).find((i) => i.table === "exercise"));
  assert.equal(PD.pendingItems(st).length, 0);
});

test("Löschvermerk verwerfen stellt den Eintrag wieder her; Felder lesbar", () => {
  const st = state();
  LG.removeEntry(st.catalogRaw, st.logs, "sleep", "s-1", now);
  st.body.local.entries["bm-2"] = { row: { id: "bm-2", metric_id: "m-1", date: "2026-11-14", value: 79.5, time: "07:30", created_at: "a", updated_at: "b" }, sent: false };
  const items = PD.pendingItems(st);
  const del = items.find((i) => i.table === "sleep_log");
  assert.equal(del.status, "Löschung");
  assert.equal(del.edit, null);
  const body = items.find((i) => i.table === "body_measurement");
  assert.equal(body.title, "Gewicht: 79,5");
  assert.equal(body.status, "Neu");
  assert.deepEqual(body.fields.find(([l]) => l === "Messgröße"), ["Messgröße", "Gewicht"]);
  assert.equal(body.edit.view, "body-metric");
  PD.discardItem(st, del);
  assert.equal(LG.unsentLogs(st.logs), 0);
  assert.equal(PD.pendingItems(st).length, 1);
});
