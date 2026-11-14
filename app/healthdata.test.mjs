import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "./healthdata.js";

const TESTO = "00000000-0000-7000-8000-000000000101";
const HKT = "00000000-0000-7000-8000-000000000201";
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const now = new Date("2026-11-13T10:00:00Z");

function catalog() {
  return {
    pc: {
      profile: [{ id: 1, sex: "male", birth_date: "1987-12-19" }],
      lab_analyte: [
        { id: TESTO, name: "Testosteron (gesamt)", unit: "ng/ml", category: "hormone", ref_low: null, ref_high: null, measurand: "testosterone", position: 10, builtin: 1, archived: 0 },
        { id: HKT, name: "Hämatokrit", unit: "%", category: "blood", ref_low: null, ref_high: null, measurand: null, position: 10, builtin: 1, archived: 0 },
      ],
      lab_draw: [{ id: "d-pc", date: "2026-10-01", time: "08:00", lab: "Labor A", fasting: 1, notes: null, created_at: "2026-10-01T08:00:00Z", updated_at: "2026-10-01T08:00:00Z" }],
      lab_result: [
        { id: "r-pc", draw_id: "d-pc", analyte_id: TESTO, value: 6.2, comparator: null, unit: "ng/ml", ref_low: 2.5, ref_high: 8.4, notes: null, created_at: "2026-10-01T08:00:00Z", updated_at: "2026-10-01T08:00:00Z" },
      ],
      lifetime_record: [],
    },
  };
}

test("Person und Parameter mit Vorgabebereich", () => {
  const c = catalog();
  assert.deepEqual(H.personOf(c, "2026-11-13"), { sex: "male", age: 38 });
  const a = H.analytesOf(c, H.emptyHealthLocal(), "2026-11-13");
  assert.equal(a.length, 2);
  assert.equal(a.find((x) => x.id === TESTO).resultCount, 1);
});

test("Blutabnahme anlegen, ändern, Wert entfernen und senden", () => {
  const c = catalog();
  const l = H.emptyHealthLocal();
  const id = H.saveDraw(c, l, { id: null, date: "2026-11-12", time: "07:30", lab: "", fasting: true, notes: "", results: [
    { id: null, analyteId: TESTO, value: 5.1, comparator: null, unit: "ng/ml", refLow: null, refHigh: null, notes: null },
    { id: null, analyteId: HKT, value: 52, comparator: null, unit: "%", refLow: 40, refHigh: 50, notes: null },
  ] }, { uuid, now });
  let draws = H.drawsOf(c, l);
  assert.equal(draws[0].id, id);
  assert.equal(draws[0].results.length, 2);
  assert.equal(draws[0].fasting, true);
  assert.equal(H.unsentHealth(l), 3);
  const keep = draws[0].results.find((r) => r.analyteId === TESTO);
  H.saveDraw(c, l, { id, date: "2026-11-12", time: "07:30", lab: null, fasting: null, notes: null, results: [
    { id: keep.id, analyteId: TESTO, value: 5.3, comparator: null, unit: "ng/ml", refLow: null, refHigh: null, notes: null },
  ] }, { uuid, now });
  draws = H.drawsOf(c, l);
  assert.equal(draws[0].results.length, 1);
  assert.equal(draws[0].results[0].value, 5.3);
  // nie gesendeter Wert verschwindet ohne Löschvermerk
  assert.equal(Object.keys(l.deleted).length, 0);
  const t = H.healthTables(l);
  assert.equal(t.lab_draw.length, 1);
  assert.equal(t.lab_result.length, 1);
  assert.equal(t.lab_draw[0].fasting, null);
  H.markHealthSent(l);
  assert.equal(H.unsentHealth(l), 0);
});

test("Prüfungen wie im Rust-Kern", () => {
  const c = catalog();
  const l = H.emptyHealthLocal();
  const base = { id: null, date: "2026-11-12", time: null, lab: null, fasting: null, notes: null };
  assert.throws(() => H.saveDraw(c, l, { ...base, results: [] }, { uuid, now }), /mindestens einen Wert/);
  const r = { id: null, analyteId: TESTO, value: 1, comparator: null, unit: "ng/ml", refLow: null, refHigh: null, notes: null };
  assert.throws(() => H.saveDraw(c, l, { ...base, results: [r, r] }, { uuid, now }), /doppelt/);
  assert.throws(() => H.saveDraw(c, l, { ...base, results: [{ ...r, refLow: 5, refHigh: 2 }] }, { uuid, now }), /größer/);
  assert.throws(() => H.saveDraw(c, l, { ...base, time: "25:00", results: [r] }, { uuid, now }), /Uhrzeit/);
  assert.throws(() => H.saveDraw(c, l, { ...base, results: [{ ...r, analyteId: "x" }] }, { uuid, now }), /Parameter/);
});

test("PC-Abnahme löschen → Löschvermerke für Abnahme und Werte", () => {
  const c = catalog();
  const l = H.emptyHealthLocal();
  H.deleteDraw(c, l, "d-pc", now);
  assert.equal(H.drawsOf(c, l).length, 0);
  const t = H.healthTables(l);
  assert.deepEqual(t.deleted_record.map((d) => d.id).sort(), ["lab_draw:d-pc", "lab_result:r-pc"]);
  H.markHealthSent(l);
  c.pc.lab_draw = [];
  c.pc.lab_result = [];
  H.pruneHealth(c, l);
  assert.equal(Object.keys(l.deleted).length, 0);
});

test("Once in a Lifetime: Blutgruppe und eigener Eintrag", () => {
  const c = catalog();
  const l = H.emptyHealthLocal();
  H.setBloodGroupField(c, l, "Blutgruppe (AB0)", "A", { uuid, now });
  H.setBloodGroupField(c, l, "Rhesusfaktor", "positiv", { uuid, now });
  H.saveLifetime(c, l, { category: "pharmacogenetic", name: "CYP2D6", value: "*1/*4" }, { uuid, now });
  assert.throws(() => H.saveLifetime(c, l, { category: "pharmacogenetic", name: "cyp2d6", value: "x" }, { uuid, now }), /gibt es in diesem Bereich schon/);
  const all = H.lifetimeOf(c, l);
  assert.equal(all.length, 3);
  assert.equal(all[0].category, "blood_group");
  H.setBloodGroupField(c, l, "Rhesusfaktor", "", { uuid, now });
  assert.equal(H.lifetimeOf(c, l).length, 2);
  assert.equal(H.healthTables(l).lifetime_record.length, 2);
});

test("Parameter anlegen, ändern, archivieren, löschen (wie lab.rs)", async () => {
  const c = catalog();
  const l = H.emptyHealthLocal();
  assert.throws(() => H.saveAnalyte(c, l, { name: "hämatokrit", unit: "%", category: "blood" }, { uuid, now }), /gibt es schon/);
  assert.throws(() => H.saveAnalyte(c, l, { name: "X", unit: "", category: "nope" }, { uuid, now }), /Gruppe/);
  assert.throws(() => H.saveAnalyte(c, l, { name: "X", unit: "", category: "other", refLow: 5, refHigh: 2 }, { uuid, now }), /größer/);
  const id = H.saveAnalyte(c, l, { name: "Omega-3-Index", unit: "%", category: "other", refLow: 8, refHigh: 12 }, { uuid, now });
  let a = H.analytesOf(c, l, "2026-11-13").find((x) => x.id === id);
  assert.equal(a.builtin, false);
  assert.equal(a.position, 20);
  H.saveAnalyte(c, l, { id: TESTO, name: "Testosteron (gesamt)", unit: "ng/ml", category: "hormone", refLow: 3, refHigh: 9, measurand: "testosterone", archived: false }, { uuid, now });
  a = H.analytesOf(c, l, "2026-11-13").find((x) => x.id === TESTO);
  assert.equal(a.refLow, 3);
  assert.throws(() => H.deleteAnalyte(c, l, TESTO), /Mitgelieferte/);
  H.deleteAnalyte(c, l, id, now);
  assert.equal(H.analytesOf(c, l, "2026-11-13").some((x) => x.id === id), false);
  const t = H.healthTables(l);
  assert.equal(t.lab_analyte.length, 1);
  assert.deepEqual(Object.keys(t.lab_analyte[0]), H.ANALYTE_COLUMNS);
  assert.equal(t.deleted_record, undefined, "nur am Handy angelegt → kein Löschvermerk");
});

test("Import: neue und vorhandene Abnahme, neuer Parameter, alles oder nichts", async () => {
  const D = await import("./pcdomain.js");
  const c = catalog();
  const l = H.emptyHealthLocal();
  const rows = D.parseCsv("Datum;Uhrzeit;Parameter;Wert;Einheit;Referenzbereich\n01.10.2026;08:00;Testosteron;7,1;ng/ml;2,5 - 8,4\n01.10.2026;08:00;HKT;49;%;40 - 50\n12.11.2026;;Omega-3-Index;9,5;%;\n");
  const parsed = D.labImport.parseLabTable(rows, "2026-11-13");
  const preview = D.labImport.previewRows(parsed.rows, H.analytesOf(c, l, "2026-11-13"));
  assert.equal(preview.length, 3);
  const r = H.importLabRows(c, l, D.labImport.toImportRows(preview), { uuid, now });
  assert.deepEqual(r, { drawsCreated: 1, drawsExtended: 1, resultsAdded: 2, resultsUpdated: 1, analytesCreated: 1 });
  const pcDraw = H.drawsOf(c, l).find((d) => d.id === "d-pc");
  assert.equal(pcDraw.results.find((x) => x.analyteId === TESTO).value, 7.1);
  assert.equal(pcDraw.results.find((x) => x.analyteId === TESTO).id, "r-pc", "vorhandener Wert ersetzt, gleiche ID");
  // Fehler in einer Zeile: nichts übernommen
  const before = JSON.stringify(l);
  assert.throws(() => H.importLabRows(c, l, [
    { date: "2026-11-20", time: null, analyteId: TESTO, analyteName: "Testosteron (gesamt)", value: 5, comparator: null, unit: "ng/ml", refLow: null, refHigh: null },
    { date: "2026-11-20", time: null, analyteId: TESTO, analyteName: "Testosteron (gesamt)", value: 6, comparator: null, unit: "ng/ml", refLow: null, refHigh: null },
  ], { uuid, now }), /Zeile 2: Derselbe Parameter/);
  assert.equal(JSON.stringify(l), before);
});
