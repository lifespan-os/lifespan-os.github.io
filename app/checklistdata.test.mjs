import { test } from "node:test";
import assert from "node:assert/strict";
import * as CD from "./checklistdata.js";
import * as T from "./todosdata.js";

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const now = new Date("2026-11-14T10:00:00Z");
const LIST = "11111111-1111-4111-8111-111111111111";

function catalog() {
  return {
    pc: {
      checklist: [{ id: LIST, name: "Packliste", source: "own", archived: 0, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z" }],
      checklist_item: [
        { id: "i1", checklist_id: LIST, position: 0, text: "Handtuch", done: 1, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z" },
        { id: "i2", checklist_id: LIST, position: 1, text: "Shaker", done: 0, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z" },
      ],
      training_day_status: [{ id: "s1", date: "2026-11-10", kind: "rest", notes: null, created_at: "2026-11-10T08:00:00Z", updated_at: "2026-11-10T08:00:00Z" }],
      todo: [],
    },
  };
}

test("Checklisten: anlegen, Name eindeutig, Import mit (2), Punkte behalten IDs", () => {
  const c = catalog();
  const l = CD.emptyChecklistLocal();
  assert.equal(CD.checklistsOf(c, l)[0].items.length, 2);
  assert.throws(() => CD.saveChecklist(c, l, { name: "packliste", items: [] }, false, { uuid, now }), /gibt es bereits/);
  const id = CD.saveChecklist(c, l, { name: "packliste", source: "notes", items: [{ text: "A" }, { text: "B", done: true }] }, true, { uuid, now });
  const saved = CD.checklistsOf(c, l).find((x) => x.id === id);
  assert.equal(saved.name, "packliste (2)");
  assert.equal(saved.source, "notes");
  assert.deepEqual(saved.items.map((i) => [i.text, i.done]), [["A", false], ["B", true]]);
  // Bearbeiten: Reihenfolge ändern, einen Punkt entfernen, einen neuen dazu
  CD.saveChecklist(c, l, { id: LIST, name: "Packliste", items: [{ id: "i2", text: "Shaker", done: false }, { text: "Gürtel" }] }, false, { uuid, now });
  const pack = CD.checklistsOf(c, l).find((x) => x.id === LIST);
  assert.deepEqual(pack.items.map((i) => i.text), ["Shaker", "Gürtel"]);
  assert.equal(pack.items[0].id, "i2");
  const t = CD.checklistTables(l);
  assert.ok(t.deleted_record.some((d) => d.id === "checklist_item:i1"));
  assert.deepEqual(Object.keys(t.checklist[0]), CD.CHECKLIST_COLUMNS);
  assert.throws(() => CD.saveChecklist(c, l, { name: "X", items: [{ text: " " }] }, false, { uuid, now }), /Punkt 1/);
});

test("Checklisten: abhaken, zurücksetzen, löschen, als To-dos übernehmen", () => {
  const c = catalog();
  const l = CD.emptyChecklistLocal();
  const todos = T.emptyTodosLocal();
  CD.setItemDone(c, l, "i2", true, now);
  assert.equal(CD.checklistsOf(c, l)[0].items.every((i) => i.done), true);
  CD.resetChecklist(c, l, LIST, now);
  assert.equal(CD.checklistsOf(c, l)[0].items.some((i) => i.done), false);
  const list = CD.checklistsOf(c, l)[0];
  assert.equal(T.addFromChecklist(c, todos, "2026-11-14", LIST, list.items, false, { uuid, now }), 2);
  assert.equal(T.addFromChecklist(c, todos, "2026-11-14", LIST, list.items, false, { uuid, now }), 0, "gleiche Texte übersprungen");
  assert.equal(T.todosFor(c, todos, "2026-11-14")[0].checklist_id, LIST);
  CD.deleteChecklist(c, l, LIST, now);
  assert.equal(CD.checklistsOf(c, l).length, 0);
  assert.deepEqual(CD.checklistTables(l).deleted_record.map((d) => d.table_name).sort(), ["checklist", "checklist_item", "checklist_item"]);
});

test("Tageshinweise: setzen, ändern, entfernen (höchstens einer je Tag)", () => {
  const c = catalog();
  const l = CD.emptyChecklistLocal();
  CD.setDayStatus(c, l, "2026-11-10", "sick", { uuid, now });
  let s = CD.dayStatusOf(c, l, "2026-11-09", "2026-11-15");
  assert.deepEqual(s.map((x) => [x.date, x.kind]), [["2026-11-10", "sick"]]);
  assert.equal(CD.checklistTables(l).training_day_status[0].id, "s1", "gleiche ID wie am PC");
  CD.setDayStatus(c, l, "2026-11-12", "rest", { uuid, now });
  CD.setDayStatus(c, l, "2026-11-10", null, { uuid, now });
  s = CD.dayStatusOf(c, l, "2026-11-09", "2026-11-15");
  assert.deepEqual(s.map((x) => x.date), ["2026-11-12"]);
  assert.throws(() => CD.setDayStatus(c, l, "2026-11-13", "vacation", { uuid, now }), /Unbekannte/);
  assert.equal(CD.unsentChecklists(l), 2);
});
