import { test } from "node:test";
import assert from "node:assert/strict";
import * as CF from "./caffeinedata.js";

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const now = new Date("2026-11-14T10:00:00Z");
const catalog = () => ({
  pc: {
    caffeine_intake: [
      { id: "c-pc", date: "2026-11-14", time: "07:30", drink_id: "espresso", label: "Espresso", ml: 30, mg: 63, in_water: 0, supplement_intake_id: null, created_at: "2026-11-14T07:30:00Z", updated_at: "2026-11-14T07:30:00Z" },
      { id: "c-link", date: "2026-11-14", time: "09:00", drink_id: "monster", label: "Monster Energy", ml: 500, mg: 160, in_water: 1, supplement_intake_id: "s1", created_at: "2026-11-14T09:00:00Z", updated_at: "2026-11-14T09:00:00Z" },
    ],
  },
});

test("Koffein: eintragen, Prüfungen wie caffeine.rs, löschen und senden", () => {
  const c = catalog();
  const l = CF.emptyCaffeineLocal();
  CF.addIntake(c, l, { date: "2026-11-14", time: "08:15", drinkId: "filter", label: "Filterkaffee", ml: 200, mg: 90 }, { uuid, now });
  assert.deepEqual(CF.intakesOn(c, l, "2026-11-14").map((i) => i.time), ["07:30", "08:15", "09:00"]);
  assert.throws(() => CF.addIntake(c, l, { date: "2026-11-14", time: "8 Uhr", drinkId: "filter", label: "x", ml: 200, mg: 90 }, { uuid, now }), /HH:MM/);
  assert.throws(() => CF.addIntake(c, l, { date: "2026-11-14", time: "08:00", drinkId: "pre", label: "Pre", ml: null, mg: 1200 }, { uuid, now }), /1000 mg/);
  assert.throws(() => CF.deleteIntake(c, l, "c-link"), /am PC löschen/);
  CF.deleteIntake(c, l, "c-pc", now);
  const t = CF.caffeineTables(l);
  assert.equal(t.caffeine_intake.length, 1);
  assert.deepEqual(Object.keys(t.caffeine_intake[0]), CF.CAFFEINE_COLUMNS);
  assert.equal(t.deleted_record[0].id, "caffeine_intake:c-pc");
  assert.equal(CF.unsentCaffeine(l), 2);
  CF.markCaffeineSent(l);
  assert.equal(CF.unsentCaffeine(l), 0);
});
