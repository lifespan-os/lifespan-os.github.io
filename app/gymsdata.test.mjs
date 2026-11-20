import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "./gymsdata.js";

let n = 0;
const uuid = () => `01900000-0000-7000-8000-${String(++n).padStart(12, "0")}`;
const REF = "01900000-0000-8000-8000-000000000001";
const catalog = () => ({
  machines: [
    { id: "m1", name: "Beinpresse", display_name: "Beinpresse", own_number: null, gym_number: "12" },
    { id: "m2", name: "Brustpresse", display_name: "Brustpresse", own_number: "7", gym_number: null },
    { id: "m3", name: "Rudern", display_name: "Rudern", own_number: null, gym_number: null },
  ],
  pc: {
    gym: [{ id: REF, name: "dasGym Wien", package_id: G.REFERENCE_PACKAGE, archived: 0, created_at: "a", updated_at: "a" }],
    gym_machine: [{ id: "e1", gym_id: REF, machine_id: "m1", number: "12", note: null, created_at: "a", updated_at: "a" }],
  },
});

test("Meine Gyms am Handy: Liste, aktives Gym, Katalog fürs Training", () => {
  const c = catalog();
  const local = G.emptyGymsLocal();
  assert.equal(G.activeGymId(c, local), REF);
  const r = G.saveGym(c, local, { name: "Homegym", member_number: "A-1" }, uuid, new Date("2026-11-20T10:00:00Z"));
  assert.ok(r.row);
  assert.deepEqual(G.gymList(c, local).map((g) => g.name), ["dasGym Wien", "Homegym"]);
  assert.ok(G.setEntry(c, local, r.row.id, "m2", "3", "hinten", uuid).row);
  assert.match(G.setEntry(c, local, r.row.id, "m3", "3", null, uuid).error, /schon „Brustpresse“/);
  assert.equal(G.addMachines(c, local, r.row.id, ["m2", "m3"], uuid), 1);
  local.active = r.row.id;
  assert.equal(G.activeGymId(c, local), r.row.id);
  const entries = G.gymEntries(c, local, r.row.id);
  const only = G.gymCatalog(c, entries);
  assert.deepEqual(only.machines.map((m) => [m.id, m.gym_number]), [["m2", "3"], ["m3", null]]);
  const all = G.gymCatalog(c, entries, { all: true });
  assert.deepEqual(all.machines.map((m) => [m.id, m.gym_number]), [["m1", null], ["m2", "3"], ["m3", null]]);
  assert.equal(G.saveGym(c, local, { name: " " }, uuid).errors.name.length > 0, true);
  assert.ok(G.saveGym(c, local, { name: "X", photo: "kein Bild" }, uuid).errors.photo);
});

test("Rückgabe, Löschen und Abgleich", () => {
  const c = catalog();
  const local = G.emptyGymsLocal();
  // Nummer im Referenz-Gym ändern (Eintrag vom PC)
  assert.ok(G.setEntry(c, local, REF, "m1", "13", null, uuid, new Date("2026-11-20T10:00:00Z")).row);
  assert.equal(G.gymEntries(c, local, REF)[0].number, "13");
  assert.equal(G.gymEntries(c, local, REF)[0].id, "e1", "gleiche ID wie am PC");
  assert.match(G.removeGym(c, local, REF).error, /Referenz/);
  const g = G.saveGym(c, local, { name: "Zweit" }, uuid).row;
  G.setEntry(c, local, g.id, "m3", null, null, uuid);
  let out = G.gymTables(local);
  assert.deepEqual(Object.keys(out).sort(), ["gym", "gym_machine"]);
  assert.equal(out.gym_machine.length, 2);
  G.markGymsSent(local);
  assert.equal(G.unsentGyms(local), 0);
  G.removeGym(c, local, g.id);
  out = G.gymTables(local);
  assert.deepEqual(out.deleted_record.map((d) => d.table_name).sort(), ["gym", "gym_machine"]);
  // PC hat die Nummer übernommen: gesendeter Eintrag entfällt
  c.pc.gym_machine[0] = { ...c.pc.gym_machine[0], number: "13", updated_at: "2026-11-20T11:00:00Z" };
  G.pruneGyms(c, local);
  assert.equal(Object.keys(local.entries).length, 0);
  assert.equal(G.websiteHref("dasgym.at"), "https://dasgym.at");
  assert.equal(G.websiteHref("javascript:x"), null);
});

test("Referenz-Studio ohne PC-Daten (Startpaket): aus den dasGym-Nummern, feste IDs wie am PC", () => {
  const c = { machines: catalog().machines };
  const local = G.emptyGymsLocal();
  // gleiche ID wie `package_gym_id("dasgym-wien")` im Rust-Kern
  assert.equal(G.REFERENCE_ID, G.stableId("gym:dasgym-wien"));
  assert.match(G.REFERENCE_ID, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(Buffer.from(G.sha256("abc")).toString("hex"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.deepEqual(G.gymList(c, local).map((g) => g.name), ["dasGym Wien"]);
  assert.equal(G.activeGymId(c, local), G.REFERENCE_ID);
  assert.deepEqual(G.gymEntries(c, local, G.REFERENCE_ID).map((e) => [e.machine_id, e.number]), [["m1", "12"]]);
  assert.equal(G.unsentGyms(local), 0, "nichts zu senden, solange unverändert");
  // Änderung: Studio und Eintrag gehen an den PC (der Eintrag braucht das Studio)
  G.setEntry(c, local, G.REFERENCE_ID, "m3", "5", "neu", uuid);
  const out = G.gymTables(local);
  assert.deepEqual(out.gym.map((g) => g.id), [G.REFERENCE_ID]);
  assert.equal(out.gym_machine[0].id, G.entryId(G.REFERENCE_ID, "m3"));
  // Maschine aus dem Referenz-Studio nehmen: Löschvermerk, kommt nicht wieder
  G.removeMachine(c, local, G.REFERENCE_ID, "m1");
  assert.deepEqual(G.gymEntries(c, local, G.REFERENCE_ID).map((e) => e.machine_id), ["m3"]);
  assert.equal(G.gymTables(local).deleted_record[0].record_id, G.entryId(G.REFERENCE_ID, "m1"));
});

test("Studio-Paket installieren: feste ID, Nummern ergänzen, eigene Angaben bleiben, fehlende Maschinen genannt", () => {
  const c = { machines: catalog().machines };
  const local = G.emptyGymsLocal();
  assert.match(G.parsePackage("kein json").error, /keine JSON-Datei/);
  assert.match(G.parsePackage(JSON.stringify({ format: "x" })).error, /kein Studio-Paket/);
  assert.match(G.parsePackage(JSON.stringify({ format: "lifespan-studio", version: 2, id: "a", name: "A", machines: [] })).error, /neuer/);
  assert.match(G.parsePackage(JSON.stringify({ format: "lifespan-studio", version: 1, id: "A B", name: "A", machines: [] })).error, /Ungültige Paket-ID/);
  const pkg = G.parsePackage(
    JSON.stringify({
      format: "lifespan-studio",
      version: 1,
      id: "studio-x",
      name: "Studio X",
      address: "Hauptstraße 1",
      machines: [
        { machine: "m1", number: "4", name: "Beinpresse" },
        { machine: "m2", number: "5", name: "Brustpresse" },
        { machine: "m1", number: "9" },
        { machine: "fehlt", number: "6", name: "Unbekannt" },
      ],
    }),
  ).pkg;
  const r1 = G.installPackage(c, local, pkg, new Date("2026-11-20T10:00:00Z"));
  assert.equal(r1.gymId, G.stableId("gym:studio-x"));
  assert.deepEqual([r1.added, r1.updated, r1.unchanged, r1.missing], [2, 0, 0, ["Unbekannt"]]);
  assert.match(G.describeInstall(r1), /„Studio X“: 2 Maschinen aufgenommen\. 1 Maschinen fehlen .*\(Unbekannt\)/);
  // eigene Angaben ergänzen, dann neuere Paketfassung installieren
  G.saveGym(c, local, { id: r1.gymId, name: "Studio X", address: "Hauptstraße 1", member_number: "M-7" }, () => "x");
  G.setEntry(c, local, r1.gymId, "m1", "4", "Sitz 3", () => "x");
  pkg.machines[0].number = "40";
  const r2 = G.installPackage(c, local, pkg, new Date("2026-11-21T10:00:00Z"));
  assert.deepEqual([r2.added, r2.updated, r2.unchanged], [0, 1, 1]);
  const gym = G.gymList(c, local).find((g) => g.id === r1.gymId);
  assert.equal(gym.member_number, "M-7");
  assert.equal(gym.package_id, "studio-x");
  const e = G.gymEntries(c, local, r1.gymId).find((x) => x.machine_id === "m1");
  assert.deepEqual([e.number, e.note, e.id], ["40", "Sitz 3", G.entryId(r1.gymId, "m1")]);
  // das dasGym-Paket landet im Referenz-Studio
  const ref = G.installPackage(c, local, { ...pkg, id: "dasgym-wien", name: "dasGym Wien", machines: [{ machine: "m3", number: "77" }] });
  assert.equal(ref.gymId, G.REFERENCE_ID);
  assert.equal(G.gymList(c, local).filter((g) => g.name === "dasGym Wien").length, 1);
  assert.deepEqual(
    G.gymEntries(c, local, G.REFERENCE_ID).map((x) => [x.machine_id, x.number]).sort(),
    [["m1", "12"], ["m3", "77"]],
  );
});

test("Mitgeliefertes Studio-Paket dasGym Wien ist gültig", async () => {
  const fs = await import("node:fs");
  const idx = JSON.parse(fs.readFileSync(new URL("./studios/index.json", import.meta.url), "utf8"));
  for (const s of idx.studios) {
    const r = G.parsePackage(fs.readFileSync(new URL(`./studios/${s.file}`, import.meta.url), "utf8"));
    assert.ok(r.pkg, r.error);
    assert.equal(r.pkg.id, s.id);
    assert.equal(r.pkg.machines.length, s.machines);
  }
});
