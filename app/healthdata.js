// LIFESPAN OS Mobil – Health am Handy (1.10.0), reine Logik ohne Oberfläche.
//
// Daten vom PC: `lab_analyte`, `lab_draw`, `lab_result` und `lifetime_record` aus der Exportdatei
// (catalog.pc). Am Handy angelegte oder geänderte Einträge liegen in `local` (id → { row, sent }),
// Löschungen als Löschvermerk („tabelle:id“). Sie gehen mit „Körperwerte … senden“ an den PC
// (Abgleich: neuerer Stand gewinnt; Blutabnahmen über Datum + Uhrzeit, Werte über Abnahme +
// Parameter, Lifetime über Bereich + Bezeichnung).
// Prüfregeln wie im Rust-Kern (repo/lab.rs, repo/lifetime.rs). Parameter selbst (Namen,
// Einheiten, eigene Bereiche) werden weiterhin am PC gepflegt.

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

const LIMIT = 1e9;
const TABLES = { draws: "lab_draw", results: "lab_result", lifetime: "lifetime_record" };

export function emptyHealthLocal() {
  return { draws: {}, results: {}, lifetime: {}, deleted: {} };
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
  for (const e of Object.values(l[key])) m.set(e.row.id, e.row);
  return [...m.values()];
}

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
  const list = pcRows(catalog, "lab_analyte")
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
  const analytes = new Map(pcRows(catalog, "lab_analyte").map((a) => [a.id, a]));
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
  local[key][row.id] = { row, sent: false };
  delete local.deleted[`${TABLES[key]}:${row.id}`];
}

/** Löschen: vom PC oder schon gesendet → Löschvermerk; sonst einfach weg. */
function remove(catalog, local, key, id, iso) {
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
  const analytes = new Map(pcRows(catalog, "lab_analyte").map((a) => [a.id, a]));
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

// ------------------------------------------------------------------ Übertragung an den PC

export function unsentHealth(local) {
  if (!local) return 0;
  const l = healthState(local);
  let n = 0;
  for (const key of Object.keys(TABLES)) n += Object.values(l[key]).filter((e) => !e.sent).length;
  return n + Object.values(l.deleted).filter((d) => !d.sent).length;
}

/** Tabellen für die Rückgabedatei: Abnahmen, Werte, Lifetime und Löschvermerke. */
export function healthTables(local, { all = false } = {}) {
  if (!local) return {};
  const l = healthState(local);
  const out = {};
  const cols = { draws: DRAW_COLUMNS, results: RESULT_COLUMNS, lifetime: LIFETIME_COLUMNS };
  for (const [key, table] of Object.entries(TABLES)) {
    const rows = Object.values(l[key])
      .filter((e) => all || !e.sent)
      .map((e) => Object.fromEntries(cols[key].map((c) => [c, e.row[c] ?? null])));
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
    for (const [id, e] of Object.entries(l[key])) {
      const r = pc.get(id);
      if (e.sent && r && String(r.updated_at) >= String(e.row.updated_at)) delete l[key][id];
    }
  }
  for (const [k, d] of Object.entries(l.deleted)) {
    if (d.sent && !pcRows(catalog, d.table).some((r) => r.id === d.id)) delete l.deleted[k];
  }
  return l;
}
