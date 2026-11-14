// LIFESPAN OS Mobil – Health am Handy (1.10.0; ab 1.14.0 mit Parametern und Import), reine Logik.
//
// Daten vom PC: `lab_analyte`, `lab_draw`, `lab_result` und `lifetime_record` aus der Exportdatei
// (catalog.pc). Am Handy angelegte oder geänderte Einträge liegen in `local` (id → { row, sent }),
// Löschungen als Löschvermerk („tabelle:id“). Sie gehen mit „Körperwerte … senden“ an den PC
// (Abgleich: neuerer Stand gewinnt; Blutabnahmen über Datum + Uhrzeit, Werte über Abnahme +
// Parameter, Lifetime über Bereich + Bezeichnung).
// Prüfregeln wie im Rust-Kern (repo/lab.rs, repo/lifetime.rs). Ab 1.14.0 lassen sich auch die
// Parameter (Name, Einheit, Gruppe, eigener Bereich, Wirkstoffspiegel, archiviert) am Handy
// pflegen; der PC gleicht sie über die ID bzw. den Namen ab.

import * as D from "./pcdomain.js";

export const DRAW_COLUMNS = ["id", "date", "time", "lab", "fasting", "notes", "created_at", "updated_at"];
export const RESULT_COLUMNS = [
  "id",
  "draw_id",
  "analyte_id",
  "value",
  "comparator",
  "unit",
  "ref_low",
  "ref_high",
  "notes",
  "created_at",
  "updated_at",
];
export const LIFETIME_COLUMNS = ["id", "category", "name", "value", "date", "source", "notes", "created_at", "updated_at"];
export const ANALYTE_COLUMNS = ["id", "name", "unit", "category", "ref_low", "ref_high", "measurand", "position", "builtin", "archived", "created_at", "updated_at"];

const LIMIT = 1e9;
const TABLES = { analytes: "lab_analyte", draws: "lab_draw", results: "lab_result", lifetime: "lifetime_record" };
const COLUMNS = { analytes: ANALYTE_COLUMNS, draws: DRAW_COLUMNS, results: RESULT_COLUMNS, lifetime: LIFETIME_COLUMNS };

export const CATEGORIES = ["hormone", "blood", "lipid", "glucose", "liver", "kidney", "thyroid", "inflammation", "vitamin", "electrolyte", "other"];
export const MEASURANDS = ["testosterone", "estradiol", "progesterone", "hcg", "dheaS", "gh", "ft4", "ft3"];

export function emptyHealthLocal() {
  return { analytes: {}, draws: {}, results: {}, lifetime: {}, deleted: {} };
}

export function healthState(saved) {
  return { ...emptyHealthLocal(), ...(saved ?? {}) };
}

const pcRows = (catalog, table) => catalog?.pc?.[table] ?? [];

/** Zeilen einer Tabelle: PC und Handy zusammengeführt, Löschungen ausgeblendet. */
function merged(catalog, local, key) {
  const l = healthState(local);
  const table = TABLES[key];
  const m = new Map();
  for (const r of pcRows(catalog, table)) if (!l.deleted[`${table}:${r.id}`]) m.set(r.id, r);
  for (const e of Object.values(l[key] ?? {})) m.set(e.row.id, e.row);
  return [...m.values()];
}

const analyteRows = (catalog, local) => merged(catalog, local, "analytes");

// ------------------------------------------------------------------ Person und Parameter

/** Geschlecht und Alter laut Profil (für die Vorgabebereiche wie am PC). */
export function personOf(catalog, today) {
  const p = pcRows(catalog, "profile")[0];
  if (!p) return { sex: null, age: null };
  let age = null;
  if (p.birth_date) {
    const [y, m, d] = p.birth_date.split("-").map(Number);
    const [ty, tm, td] = today.split("-").map(Number);
    age = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  } else if (p.birth_year) age = Number(today.slice(0, 4)) - p.birth_year;
  return { sex: p.sex === "male" || p.sex === "female" ? p.sex : null, age };
}

/** Parameter wie `list_lab_analytes(true)` mit Vorgabebereichen nach Profil. */
export function analytesOf(catalog, local, today) {
  const results = merged(catalog, local, "results");
  const count = new Map();
  for (const r of results) count.set(r.analyte_id, (count.get(r.analyte_id) ?? 0) + 1);
  const list = analyteRows(catalog, local)
    .map((a) => ({
      id: a.id,
      name: a.name,
      unit: a.unit ?? "",
      category: a.category,
      refLow: a.ref_low ?? null,
      refHigh: a.ref_high ?? null,
      measurand: a.measurand ?? null,
      position: a.position ?? 0,
      builtin: !!a.builtin,
      archived: !!a.archived,
      resultCount: count.get(a.id) ?? 0,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "de"));
  return D.withDefaultRanges(list, personOf(catalog, today));
}

// ------------------------------------------------------------------ Blutabnahmen

/** Blutabnahmen mit Werten wie `list_lab_draws` (neueste zuerst). */
export function drawsOf(catalog, local) {
  const analytes = new Map(analyteRows(catalog, local).map((a) => [a.id, a]));
  const byDraw = new Map();
  for (const r of merged(catalog, local, "results")) {
    const a = analytes.get(r.analyte_id);
    if (!a) continue;
    const list = byDraw.get(r.draw_id) ?? [];
    list.push({
      id: r.id,
      drawId: r.draw_id,
      analyteId: r.analyte_id,
      analyteName: a.name,
      category: a.category,
      measurand: a.measurand ?? null,
      position: a.position ?? 0,
      value: Number(r.value),
      comparator: r.comparator ?? null,
      unit: r.unit ?? "",
      refLow: r.ref_low ?? null,
      refHigh: r.ref_high ?? null,
      notes: r.notes ?? null,
    });
    byDraw.set(r.draw_id, list);
  }
  return merged(catalog, local, "draws")
    .map((d) => ({
      id: d.id,
      date: d.date,
      time: d.time ?? null,
      lab: d.lab ?? null,
      fasting: d.fasting === null || d.fasting === undefined ? null : !!d.fasting,
      notes: d.notes ?? null,
      results: (byDraw.get(d.id) ?? []).sort((a, b) => a.position - b.position || a.analyteName.localeCompare(b.analyteName, "de")),
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }))
    .sort((a, b) => (b.date + (b.time ?? "")).localeCompare(a.date + (a.time ?? "")) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function fieldError(field, message) {
  const e = new Error(message);
  e.field = field;
  return e;
}

function optText(field, value, max) {
  const t = String(value ?? "").trim();
  if (t === "") return null;
  if ([...t].length > max) throw fieldError(field, `Höchstens ${max} Zeichen.`);
  return t;
}

function checkNumber(field, label, v) {
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v) || v <= -LIMIT || v >= LIMIT) throw fieldError(field, `${label} liegt außerhalb des erlaubten Bereichs.`);
  return Math.round(v * 1e4) / 1e4;
}

function put(local, key, row) {
  local[key] ??= {};
  local[key][row.id] = { row, sent: false };
  delete local.deleted[`${TABLES[key]}:${row.id}`];
}

/** Löschen: vom PC oder schon gesendet → Löschvermerk; sonst einfach weg. */
function remove(catalog, local, key, id, iso) {
  local[key] ??= {};
  const own = local[key][id];
  delete local[key][id];
  const table = TABLES[key];
  const onPc = pcRows(catalog, table).some((r) => r.id === id);
  if (onPc || own?.sent) local.deleted[`${table}:${id}`] = { table, id, at: iso, sent: false };
}

/**
 * Speichert eine Blutabnahme mit allen Werten wie `save_draw` (Eingabe wie `draftToInput` am PC).
 * Werte der Abnahme, die in der Eingabe fehlen, werden entfernt. Rückgabe: ID der Abnahme.
 */
export function saveDraw(catalog, local, input, { uuid, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) throw fieldError("date", "Bitte ein Datum wählen.");
  const time = input.time ? String(input.time).trim() : null;
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw fieldError("time", "Bitte eine Uhrzeit wie 07:30 eingeben.");
  const lab = optText("lab", input.lab, 80);
  const notes = optText("notes", input.notes, 1000);
  if (!input.results?.length) throw new Error("Bitte mindestens einen Wert eintragen.");
  const analytes = new Map(analyteRows(catalog, local).map((a) => [a.id, a]));
  const seen = new Set();
  const checked = input.results.map((r) => {
    const a = analytes.get(r.analyteId);
    if (!a) throw fieldError("analyteId", "Bitte einen Parameter aus der Liste wählen.");
    if (seen.has(a.id)) throw new Error(`„${a.name}“ ist in dieser Blutabnahme doppelt eingetragen.`);
    seen.add(a.id);
    const value = checkNumber("value", "Der Wert", r.value);
    if (value === null) throw fieldError("value", "Bitte einen Wert eintragen.");
    if (r.comparator !== null && r.comparator !== undefined && r.comparator !== "<" && r.comparator !== ">") {
      throw fieldError("comparator", "Bitte „<“ oder „>“ wählen.");
    }
    const unit = String(r.unit ?? "").trim();
    if ([...unit].length > 20) throw fieldError("unit", "Die Einheit darf höchstens 20 Zeichen lang sein.");
    const low = checkNumber("refLow", "Der untere Referenzwert", r.refLow);
    const high = checkNumber("refHigh", "Der obere Referenzwert", r.refHigh);
    if (low !== null && high !== null && low >= high) throw fieldError("refHigh", "Der obere Referenzwert muss größer als der untere sein.");
    return { ...r, value, unit, refLow: low, refHigh: high, notes: optText("notes", r.notes, 500), comparator: r.comparator ?? null };
  });

  const iso = now.toISOString();
  const draws = merged(catalog, local, "draws");
  let draw;
  if (input.id) {
    const old = draws.find((d) => d.id === input.id);
    if (!old) throw new Error("Diese Blutabnahme gibt es nicht mehr.");
    draw = { ...old, date: input.date, time, lab, fasting: input.fasting === null || input.fasting === undefined ? null : input.fasting ? 1 : 0, notes, updated_at: iso };
  } else {
    draw = { id: uuid(), date: input.date, time, lab, fasting: input.fasting === null || input.fasting === undefined ? null : input.fasting ? 1 : 0, notes, created_at: iso, updated_at: iso };
  }
  put(local, "draws", Object.fromEntries(DRAW_COLUMNS.map((c) => [c, draw[c] ?? null])));

  const existing = merged(catalog, local, "results").filter((r) => r.draw_id === draw.id);
  const byId = new Map(existing.map((r) => [r.id, r]));
  const keep = new Set();
  for (const r of checked) {
    const old = r.id ? byId.get(r.id) : null;
    const row = {
      id: old ? old.id : uuid(),
      draw_id: draw.id,
      analyte_id: r.analyteId,
      value: r.value,
      comparator: r.comparator,
      unit: r.unit,
      ref_low: r.refLow,
      ref_high: r.refHigh,
      notes: r.notes,
      created_at: old ? old.created_at : iso,
      updated_at: iso,
    };
    keep.add(row.id);
    const same = old && RESULT_COLUMNS.every((c) => c === "updated_at" || (old[c] ?? null) === (row[c] ?? null));
    if (!same) put(local, "results", row);
  }
  for (const r of existing) if (!keep.has(r.id)) remove(catalog, local, "results", r.id, iso);
  return draw.id;
}

/** Blutabnahme mit allen Werten löschen. */
export function deleteDraw(catalog, local, id, now = new Date()) {
  const iso = now.toISOString();
  for (const r of merged(catalog, local, "results")) if (r.draw_id === id) remove(catalog, local, "results", r.id, iso);
  remove(catalog, local, "draws", id, iso);
}

// ------------------------------------------------------------------ Once in a Lifetime

/** Einträge wie `list_lifetime_records` (nach Bereich, dann Bezeichnung). */
export function lifetimeOf(catalog, local) {
  const order = new Map(D.lifetime.LIFETIME_CATEGORIES.map((c, i) => [c, i]));
  return merged(catalog, local, "lifetime")
    .map((r) => ({
      id: r.id,
      category: r.category,
      name: r.name,
      value: r.value,
      date: r.date ?? null,
      source: r.source ?? null,
      notes: r.notes ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
    .sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.name.localeCompare(b.name, "de"));
}

/** Speichern wie `lifetime::save` (Eingabe wie `lifetimeDraftToInput`). */
export function saveLifetime(catalog, local, input, { uuid, now = new Date() }) {
  if (!D.lifetime.LIFETIME_CATEGORIES.includes(input.category)) throw fieldError("category", "Bitte einen Bereich wählen.");
  const all = lifetimeOf(catalog, local);
  const draft = {
    id: input.id ?? null,
    category: input.category,
    name: input.name ?? "",
    value: input.value ?? "",
    date: input.date ?? "",
    source: input.source ?? "",
    notes: input.notes ?? "",
  };
  const res = D.lifetime.lifetimeDraftToInput(draft, all);
  if (!res.ok) {
    const [field, message] = Object.entries(res.errors)[0];
    throw fieldError(field, message);
  }
  const v = res.input;
  const iso = now.toISOString();
  const old = v.id ? merged(catalog, local, "lifetime").find((r) => r.id === v.id) : null;
  if (v.id && !old) throw new Error("Diesen Eintrag gibt es nicht mehr.");
  const row = {
    id: old ? old.id : uuid(),
    category: v.category,
    name: v.name,
    value: v.value,
    date: v.date,
    source: v.source,
    notes: v.notes,
    created_at: old ? old.created_at : iso,
    updated_at: iso,
  };
  put(local, "lifetime", row);
  return row.id;
}

/** Fester Eintrag der Blutgruppe (AB0, Rhesus, Kell): leerer Wert = löschen. */
export function setBloodGroupField(catalog, local, name, value, opts) {
  const rec = D.lifetime.findRecord(lifetimeOf(catalog, local), "blood_group", name);
  if (!value) {
    if (rec) deleteLifetime(catalog, local, rec.id, opts.now);
    return;
  }
  saveLifetime(catalog, local, { ...(rec ?? {}), id: rec?.id ?? null, category: "blood_group", name, value }, opts);
}

export function deleteLifetime(catalog, local, id, now = new Date()) {
  remove(catalog, local, "lifetime", id, now.toISOString());
}

// ------------------------------------------------------------------ Parameter pflegen (wie lab.rs)

const sameName = (a, b) => String(a).toLocaleLowerCase("de") === String(b).toLocaleLowerCase("de");

function checkUnit(field, value) {
  const unit = String(value ?? "").trim();
  if ([...unit].length > 20) throw fieldError(field, "Die Einheit darf höchstens 20 Zeichen lang sein.");
  return unit;
}

function checkRange(low, high) {
  const l = checkNumber("refLow", "Der untere Referenzwert", low);
  const h = checkNumber("refHigh", "Der obere Referenzwert", high);
  if (l !== null && h !== null && l >= h) throw fieldError("refHigh", "Der obere Referenzwert muss größer als der untere sein.");
  return [l, h];
}

function nextPosition(catalog, local) {
  return analyteRows(catalog, local).reduce((m, a) => Math.max(m, Number(a.position) || 0), 0) + 10;
}

/** Parameter speichern wie `save_analyte` (Name eindeutig ohne Groß-/Kleinschreibung). Rückgabe: ID. */
export function saveAnalyte(catalog, local, input, { uuid, now = new Date() }) {
  const name = String(input.name ?? "").trim();
  if (name === "") throw fieldError("name", "Bitte den Namen eingeben.");
  if ([...name].length > 80) throw fieldError("name", "Höchstens 80 Zeichen.");
  const unit = checkUnit("unit", input.unit);
  if (!CATEGORIES.includes(input.category)) throw fieldError("category", "Bitte eine Gruppe wählen.");
  const measurand = input.measurand ? String(input.measurand) : null;
  if (measurand && !MEASURANDS.includes(measurand)) throw fieldError("measurand", "Bitte eine Messgröße aus der Liste wählen.");
  const [refLow, refHigh] = checkRange(input.refLow, input.refHigh);
  const all = analyteRows(catalog, local);
  const other = all.find((a) => sameName(a.name, name));
  if (other && other.id !== input.id) throw fieldError("name", "Diesen Parameter gibt es schon.");
  const iso = now.toISOString();
  const old = input.id ? all.find((a) => a.id === input.id) : null;
  if (input.id && !old) throw new Error("Diesen Parameter gibt es nicht mehr.");
  const row = old
    ? { ...old, name, unit, category: input.category, ref_low: refLow, ref_high: refHigh, measurand, archived: input.archived ? 1 : 0, updated_at: iso }
    : { id: uuid(), name, unit, category: input.category, ref_low: refLow, ref_high: refHigh, measurand, position: nextPosition(catalog, local), builtin: 0, archived: input.archived ? 1 : 0, created_at: iso, updated_at: iso };
  put(local, "analytes", Object.fromEntries(ANALYTE_COLUMNS.map((c) => [c, row[c] ?? null])));
  return row.id;
}

/** Eigenen Parameter ohne Werte löschen wie `delete_analyte`. */
export function deleteAnalyte(catalog, local, id, now = new Date()) {
  const a = analyteRows(catalog, local).find((x) => x.id === id);
  if (!a) throw new Error("Diesen Parameter gibt es nicht mehr.");
  if (a.builtin) throw new Error("Mitgelieferte Parameter können nicht gelöscht, aber archiviert werden.");
  if (merged(catalog, local, "results").some((r) => r.analyte_id === id)) {
    throw new Error(`„${a.name}“ hat noch gespeicherte Werte. Statt zu löschen kannst du den Parameter archivieren.`);
  }
  remove(catalog, local, "analytes", id, now.toISOString());
}

// ------------------------------------------------------------------ Import (wie lab.rs import_rows)

/**
 * Übernimmt Zeilen aus `toImportRows` – alles oder nichts. Je Datum (und Uhrzeit) eine Blutabnahme:
 * gibt es sie schon, kommen die Werte dazu; ein vorhandener Wert desselben Parameters wird ersetzt.
 * Rückgabe: Zählung wie `LabImportReport`.
 */
export function importLabRows(catalog, local, rows, { uuid, now = new Date() }) {
  if (!rows?.length) throw new Error("Die Datei enthält keine Werte.");
  // Auf einer Kopie arbeiten, damit bei einem Fehler nichts übernommen wird
  const work = structuredClone(healthState(local));
  const iso = now.toISOString();
  const report = { drawsCreated: 0, drawsExtended: 0, resultsAdded: 0, resultsUpdated: 0, analytesCreated: 0 };
  const draws = new Map();
  const touched = new Set();
  rows.forEach((row, i) => {
    const line = i + 1;
    const fail = (e) => {
      throw new Error(`Zeile ${line}: ${e.message}`);
    };
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? "")) throw new Error("Bitte ein gültiges Datum angeben.");
      const time = row.time ? String(row.time).trim() : null;
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Bitte eine gültige Uhrzeit angeben.");
      const lab = optText("lab", row.lab, 80);
      const unit = checkUnit("unit", row.unit);
      // Parameter: per ID, per Name oder neu
      let analyteId;
      const list = analyteRows(catalog, work);
      if (row.analyteId) {
        if (!list.some((a) => a.id === row.analyteId)) throw new Error("Der Parameter wurde nicht gefunden.");
        analyteId = row.analyteId;
      } else {
        const name = String(row.analyteName ?? "").trim();
        if (name === "") throw new Error("Bitte den Parameter eingeben.");
        if ([...name].length > 80) throw new Error("Höchstens 80 Zeichen.");
        const found = list.find((a) => sameName(a.name, name));
        if (found) analyteId = found.id;
        else {
          const category = row.category ?? "other";
          if (!CATEGORIES.includes(category)) throw new Error("Bitte eine Gruppe wählen.");
          analyteId = uuid();
          put(work, "analytes", { id: analyteId, name, unit, category, ref_low: null, ref_high: null, measurand: null, position: nextPosition(catalog, work), builtin: 0, archived: 0, created_at: iso, updated_at: iso });
          report.analytesCreated += 1;
        }
      }
      // Blutabnahme: gleiche Datei-Zeilen mit gleichem Datum und gleicher Uhrzeit gehören zusammen
      const key = `${row.date}|${time ?? ""}`;
      let drawId = draws.get(key);
      if (!drawId) {
        const existing = merged(catalog, work, "draws")
          .filter((d) => d.date === row.date && (d.time ?? "") === (time ?? ""))
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
        if (existing) {
          drawId = existing.id;
          report.drawsExtended += 1;
        } else {
          drawId = uuid();
          put(work, "draws", { id: drawId, date: row.date, time, lab, fasting: null, notes: null, created_at: iso, updated_at: iso });
          report.drawsCreated += 1;
        }
        draws.set(key, drawId);
      }
      const value = checkNumber("value", "Der Wert", row.value);
      if (value === null) throw new Error("Bitte einen Wert eintragen.");
      const comparator = row.comparator ?? null;
      if (comparator !== null && comparator !== "<" && comparator !== ">") throw new Error("Bitte „<“ oder „>“ wählen.");
      const [refLow, refHigh] = checkRange(row.refLow ?? null, row.refHigh ?? null);
      if (touched.has(`${drawId}|${analyteId}`)) throw new Error("Derselbe Parameter steht für diese Blutabnahme mehrfach in der Datei.");
      touched.add(`${drawId}|${analyteId}`);
      const old = merged(catalog, work, "results").find((r) => r.draw_id === drawId && r.analyte_id === analyteId);
      const result = { id: old ? old.id : uuid(), draw_id: drawId, analyte_id: analyteId, value, comparator, unit, ref_low: refLow, ref_high: refHigh, notes: old ? (old.notes ?? null) : null, created_at: old ? old.created_at : iso, updated_at: iso };
      put(work, "results", result);
      if (old) report.resultsUpdated += 1;
      else report.resultsAdded += 1;
    } catch (e) {
      fail(e);
    }
  });
  Object.assign(local, work);
  return report;
}

// ------------------------------------------------------------------ Übertragung an den PC

export function unsentHealth(local) {
  if (!local) return 0;
  const l = healthState(local);
  let n = 0;
  for (const key of Object.keys(TABLES)) n += Object.values(l[key] ?? {}).filter((e) => !e.sent).length;
  return n + Object.values(l.deleted).filter((d) => !d.sent).length;
}

/** Tabellen für die Rückgabedatei: Parameter, Abnahmen, Werte, Lifetime und Löschvermerke. */
export function healthTables(local, { all = false } = {}) {
  if (!local) return {};
  const l = healthState(local);
  const out = {};
  for (const [key, table] of Object.entries(TABLES)) {
    const rows = Object.values(l[key] ?? {})
      .filter((e) => all || !e.sent)
      .map((e) => Object.fromEntries(COLUMNS[key].map((c) => [c, e.row[c] ?? null])));
    if (rows.length) out[table] = rows;
  }
  const del = Object.values(l.deleted)
    .filter((d) => all || !d.sent)
    .map((d) => ({ id: `${d.table}:${d.id}`, table_name: d.table, record_id: d.id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

export function markHealthSent(local) {
  if (!local) return;
  for (const key of Object.keys(TABLES)) for (const e of Object.values(local[key] ?? {})) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
}

/** Nach neuen Daten vom PC: Übertragenes, das der PC (mindestens so neu) hat, entfällt. */
export function pruneHealth(catalog, local) {
  const l = healthState(local);
  for (const [key, table] of Object.entries(TABLES)) {
    const pc = new Map(pcRows(catalog, table).map((r) => [r.id, r]));
    for (const [id, e] of Object.entries(l[key] ?? {})) {
      const r = pc.get(id);
      if (e.sent && r && String(r.updated_at) >= String(e.row.updated_at)) delete l[key][id];
    }
  }
  for (const [k, d] of Object.entries(l.deleted)) {
    if (d.sent && !pcRows(catalog, d.table).some((r) => r.id === d.id)) delete l.deleted[k];
  }
  return l;
}
