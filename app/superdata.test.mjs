import { test } from "node:test";
import assert from "node:assert/strict";
import * as SD from "./superdata.js";
import * as D from "./pcdomain.js";

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const now = new Date("2026-11-14T08:00:00Z");

function catalog() {
  return {
    pc: {
      hrt_entry: [
        { id: "e-pc", date: "2026-11-06", time: "11:00", status: "taken", hormone: "Testosteron Enantat", amount: 52.5, unit: "mg", route: "im", site: "Oberschenkel links (vastus lateralis)", manufacturer: "Panpharma", batch: "60172", expiry_date: "2031-03-31", concentration_mg_ml: 250, volume_ml: 0.21, vial_volume_ml: 1, needle: "27G", prescription: null, reaction: null, notes: null, created_at: "2026-11-06T18:33:49.015Z", updated_at: "2026-11-06T18:33:49.015Z" },
      ],
      hrt_product: [{ id: "p-pc", hormone: "Testosteron Enantat", manufacturer: "Panpharma", batch: "60172", expiry_date: "2031-03-31", vial_volume_ml: 1, concentration_mg_ml: 250, created_at: "2026-11-08T11:52:22.428Z", updated_at: "2026-11-08T11:52:22.428Z" }],
      settings: [],
    },
  };
}

test("Gabe aus dem Formular speichern (Menge aus Volumen × Konzentration)", () => {
  const c = catalog();
  const l = SD.emptySuperLocal();
  const entries = SD.hrtEntriesOf(c, l);
  let d = D.hrt.emptyHrtDraft("2026-11-13", "10:30");
  d.hormone = "Testosteron Enantat";
  d = D.hrt.prefillFromLast(d, entries);
  assert.equal(d.batch, "60172");
  d.volumeMl = "0,2";
  const r = D.hrt.hrtDraftToInput(d);
  assert.equal(r.ok, true);
  assert.equal(r.input.amount, 50);
  const e = SD.saveHrtEntry(c, l, r.input, { uuid, now });
  assert.equal(e.amount, 50);
  const all = SD.hrtEntriesOf(c, l);
  assert.equal(all.length, 2);
  assert.equal(all[0].id, e.id);
  assert.equal(D.duplicateHrtEntries({ ...r.input, id: null }, all).length, 1);
  const t = SD.superTables(l);
  assert.equal(t.hrt_entry.length, 1);
  assert.equal(t.hrt_entry[0].concentration_mg_ml, 250);
  assert.equal(SD.unsentSuper(l), 1);
});

test("Prüfungen wie hrt.rs", () => {
  const c = catalog();
  const l = SD.emptySuperLocal();
  const base = { id: null, date: "2026-11-13", time: null, status: "taken", hormone: "Test", amount: 10, unit: "mg", route: null };
  assert.throws(() => SD.saveHrtEntry(c, l, { ...base, unit: "kg" }, { uuid, now }), /Einheit/);
  assert.throws(() => SD.saveHrtEntry(c, l, { ...base, hormone: " " }, { uuid, now }), /Art/);
  assert.throws(() => SD.saveHrtEntry(c, l, { ...base, volumeMl: 200 }, { uuid, now }), /Injektionsvolumen/);
  assert.throws(() => SD.saveHrtEntry(c, l, { ...base, route: "xx" }, { uuid, now }), /Anwendung/);
  assert.throws(() => SD.saveHrtEntry(c, l, { ...base, date: "2026-02-30" }, { uuid, now }), /Datum/);
});

test("PC-Gabe ändern und löschen, Präparate", () => {
  const c = catalog();
  const l = SD.emptySuperLocal();
  const e = SD.hrtEntriesOf(c, l)[0];
  SD.saveHrtEntry(c, l, { ...e, notes: "ok" }, { uuid, now });
  assert.equal(SD.hrtEntriesOf(c, l)[0].notes, "ok");
  assert.equal(SD.hrtEntriesOf(c, l)[0].createdAt, "2026-11-06T18:33:49.015Z");
  SD.deleteHrtEntry(c, l, "e-pc", now);
  assert.equal(SD.hrtEntriesOf(c, l).length, 0);
  assert.deepEqual(SD.superTables(l).deleted_record.map((d) => d.id), ["hrt_entry:e-pc"]);
  const p = SD.saveProduct(c, l, { id: null, hormone: "hCG", manufacturer: null, batch: "X1", expiryDate: null, vialVolumeMl: 5, concentrationMgMl: null }, { uuid, now });
  assert.equal(SD.productsOf(c, l).length, 2);
  SD.deleteProduct(c, l, p.id, now);
  assert.equal(SD.productsOf(c, l).length, 1);
  SD.markSuperSent(l);
  c.pc.hrt_entry = [];
  SD.pruneSuper(c, l);
  assert.equal(Object.keys(l.deleted).length, 0);
});

test("Checkliste: Vorlage, abhaken, senden", () => {
  const c = catalog();
  const l = SD.emptySuperLocal();
  let list = SD.checklistOf(c, l);
  const first = list.materials[0];
  list = D.hrtChecklist.toggleItem(list, "materials", first.id);
  SD.setChecklist(l, list, now);
  assert.equal(SD.checklistOf(c, l).materials[0].done, true);
  const t = SD.superTables(l);
  assert.equal(t.settings[0].key, "ui.hrt_checklist");
  SD.markSuperSent(l);
  c.pc.settings = [{ key: "ui.hrt_checklist", value: t.settings[0].value, updated_at: "2026-11-14T09:00:00Z" }];
  const l2 = SD.pruneSuper(c, l);
  assert.equal(l2.checklist, null);
  assert.equal(SD.checklistOf(c, l2).materials[0].done, true);
});
