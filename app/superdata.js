// LIFESPAN OS Mobil – Superhuman am Handy (1.11.0, Protokoll/Substanzen ab 1.13.0), reine Logik.
//
// Daten vom PC: `hrt_entry`, `hrt_product`, `protocol_substance`, `protocol_entry` und die
// Einstellung `ui.hrt_checklist` aus der
// Exportdatei (catalog.pc). Am Handy angelegte oder geänderte Einträge liegen in `local`
// (id → { row, sent }), Löschungen als Löschvermerk („tabelle:id“), die Checkliste als eigene
// Einstellung. Alles geht mit „Körperwerte … senden“ an den PC (neuerer Stand gewinnt).
// Prüfregeln wie im Rust-Kern (repo/hrt.rs, repo/protocol.rs); Formularlogik aus src/domain/hrt.ts
// und src/domain/protocol.ts (pcdomain.js).

import * as D from "./pcdomain.js";

export const HRT_COLUMNS = [
  "id",
  "date",
  "time",
  "status",
  "hormone",
  "amount",
  "unit",
  "route",
  "site",
  "manufacturer",
  "batch",
  "expiry_date",
  "concentration_mg_ml",
  "volume_ml",
  "needle",
  "prescription",
  "reaction",
  "notes",
  "created_at",
  "updated_at",
  "vial_volume_ml",
];
export const PRODUCT_COLUMNS = ["id", "hormone", "manufacturer", "batch", "expiry_date", "vial_volume_ml", "concentration_mg_ml", "created_at", "updated_at"];

export const SUBSTANCE_COLUMNS = ["id", "name", "category", "unit", "default_route", "notes", "archived", "created_at", "updated_at"];
export const PROTOCOL_COLUMNS = ["id", "substance_id", "date", "time", "amount", "route", "site", "notes", "created_at", "updated_at"];

const TABLES = { entries: "hrt_entry", products: "hrt_product", substances: "protocol_substance", protocol: "protocol_entry" };
const COLUMNS = { entries: HRT_COLUMNS, products: PRODUCT_COLUMNS, substances: SUBSTANCE_COLUMNS, protocol: PROTOCOL_COLUMNS };
const CHECKLIST_KEY = "ui.hrt_checklist";

export function emptySuperLocal() {
  return { entries: {}, products: {}, substances: {}, protocol: {}, deleted: {}, checklist: null };
}

export function superState(saved) {
  return { ...emptySuperLocal(), ...(saved ?? {}) };
}

const pcRows = (catalog, table) => catalog?.pc?.[table] ?? [];

function merged(catalog, local, key) {
  const l = superState(local);
  l[key] ??= {};
  const table = TABLES[key];
  const m = new Map();
  for (const r of pcRows(catalog, table)) if (!l.deleted[`${table}:${r.id}`]) m.set(r.id, r);
  for (const e of Object.values(l[key])) m.set(e.row.id, e.row);
  return [...m.values()];
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

const toEntry = (r) => ({
  id: r.id,
  date: r.date,
  time: r.time ?? null,
  status: r.status ?? "taken",
  hormone: r.hormone,
  amount: Number(r.amount),
  unit: r.unit,
  route: r.route ?? null,
  site: r.site ?? null,
  manufacturer: r.manufacturer ?? null,
  batch: r.batch ?? null,
  expiryDate: r.expiry_date ?? null,
  vialVolumeMl: num(r.vial_volume_ml),
  concentrationMgMl: num(r.concentration_mg_ml),
  volumeMl: num(r.volume_ml),
  needle: r.needle ?? null,
  prescription: r.prescription ?? null,
  reaction: r.reaction ?? null,
  notes: r.notes ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toProduct = (r) => ({
  id: r.id,
  hormone: r.hormone,
  manufacturer: r.manufacturer ?? null,
  batch: r.batch ?? null,
  expiryDate: r.expiry_date ?? null,
  vialVolumeMl: num(r.vial_volume_ml),
  concentrationMgMl: num(r.concentration_mg_ml),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const newestFirst = (a, b) => (b.date + (b.time ?? "")).localeCompare(a.date + (a.time ?? "")) || String(b.createdAt).localeCompare(String(a.createdAt));

/** HRT-Einträge wie `hrt::list` (neueste zuerst). */
export function hrtEntriesOf(catalog, local) {
  return merged(catalog, local, "entries").map(toEntry).sort(newestFirst);
}

/** Präparate wie `hrt::list_products` (nach Art, Hersteller, Charge). */
export function productsOf(catalog, local) {
  return merged(catalog, local, "products")
    .map(toProduct)
    .sort((a, b) => a.hormone.localeCompare(b.hormone, "de") || (a.manufacturer ?? "").localeCompare(b.manufacturer ?? "", "de") || (a.batch ?? "").localeCompare(b.batch ?? "", "de"));
}

// ------------------------------------------------------------------ Prüfungen wie hrt.rs

function fieldError(field, message) {
  const e = new Error(message);
  e.field = field;
  return e;
}

const fmtNum = (v) => String(v).replace(".", ",");

function realIn(field, label, v, min, max, decimals) {
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v)) throw fieldError(field, `${label} muss eine Zahl sein.`);
  const f = 10 ** decimals;
  const r = Math.round(v * f) / f;
  if (r < min || r > max) throw fieldError(field, `${label} muss zwischen ${fmtNum(min)} und ${fmtNum(max)} liegen.`);
  return r;
}

function optText(field, value, max) {
  const t = String(value ?? "").trim();
  if (t === "") return null;
  if ([...t].length > max) throw fieldError(field, `Höchstens ${max} Zeichen erlaubt.`);
  return t;
}

function reqText(field, label, value, max) {
  const t = optText(field, value, max);
  if (t === null) throw fieldError(field, `Bitte ${label} eingeben.`);
  return t;
}

function checkDate(field, value) {
  const v = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    throw fieldError(field, "Bitte ein gültiges Datum angeben.");
  }
  const y = Number(v.slice(0, 4));
  if (y < 1900 || y > 2100) throw fieldError(field, "Das Datum muss zwischen 1900 und 2100 liegen.");
  return v;
}

function put(local, key, row) {
  local[key] ??= {};
  local[key][row.id] = { row, sent: false };
  delete local.deleted[`${TABLES[key]}:${row.id}`];
}

function remove(catalog, local, key, id, iso) {
  local[key] ??= {};
  const own = local[key][id];
  delete local[key][id];
  const table = TABLES[key];
  const onPc = pcRows(catalog, table).some((r) => r.id === id);
  if (onPc || own?.sent) local.deleted[`${table}:${id}`] = { table, id, at: iso, sent: false };
}

/** Speichert eine Gabe wie `hrt::save` (Eingabe wie `hrtDraftToInput`). Rückgabe: Eintrag. */
export function saveHrtEntry(catalog, local, input, { uuid, now = new Date() }) {
  const date = checkDate("date", input.date);
  const time = input.time ? String(input.time).trim() : null;
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw fieldError("time", "Bitte eine gültige Uhrzeit angeben.");
  const status = input.status || "taken";
  if (!["taken", "missed"].includes(status)) throw fieldError("status", "Bitte „durchgeführt“ oder „ausgelassen“ wählen.");
  const hormone = reqText("hormone", "die Art (Hormon bzw. Präparat)", input.hormone, 80);
  const amount = realIn("amount", "Die Menge", input.amount, 0.001, 100000, 3);
  if (amount === null || amount <= 0) throw fieldError("amount", "Die Menge muss größer als 0 sein.");
  if (!D.hrt.HRT_UNITS.includes(input.unit)) throw fieldError("unit", "Bitte eine Einheit wählen.");
  const route = input.route || null;
  if (route && !Object.keys(D.ROUTE_LABELS).includes(route)) throw fieldError("route", "Bitte eine Anwendung wählen.");
  const expiry = input.expiryDate && String(input.expiryDate).trim() ? checkDate("expiryDate", input.expiryDate) : null;
  const row = {
    date,
    time,
    status,
    hormone,
    amount,
    unit: input.unit,
    route,
    site: optText("site", input.site, 60),
    manufacturer: optText("manufacturer", input.manufacturer, 80),
    batch: optText("batch", input.batch, 60),
    expiry_date: expiry,
    concentration_mg_ml: realIn("concentrationMgMl", "Die Wirkstoffkonzentration", input.concentrationMgMl, 0.001, 10000, 3),
    vial_volume_ml: realIn("vialVolumeMl", "Das Ampullenvolumen", input.vialVolumeMl, 0.01, 1000, 2),
    volume_ml: realIn("volumeMl", "Das Injektionsvolumen", input.volumeMl, 0.01, 100, 2),
    needle: optText("needle", input.needle, 40),
    prescription: optText("prescription", input.prescription, 80),
    reaction: optText("reaction", input.reaction, 500),
    notes: optText("notes", input.notes, 1000),
  };
  const iso = now.toISOString();
  let full;
  if (input.id) {
    const old = merged(catalog, local, "entries").find((r) => r.id === input.id);
    if (!old) throw new Error("Diesen Eintrag gibt es nicht mehr.");
    full = { ...old, ...row, updated_at: iso };
  } else {
    full = { id: uuid(), ...row, created_at: iso, updated_at: iso };
  }
  put(local, "entries", Object.fromEntries(HRT_COLUMNS.map((c) => [c, full[c] ?? null])));
  return toEntry(full);
}

export function deleteHrtEntry(catalog, local, id, now = new Date()) {
  remove(catalog, local, "entries", id, now.toISOString());
}

/** Präparat speichern wie `hrt::save_product`. Rückgabe: Präparat. */
export function saveProduct(catalog, local, input, { uuid, now = new Date() }) {
  const row = {
    hormone: reqText("hormone", "die Art (Hormon bzw. Präparat)", input.hormone, 80),
    manufacturer: optText("manufacturer", input.manufacturer, 80),
    batch: optText("batch", input.batch, 60),
    expiry_date: input.expiryDate && String(input.expiryDate).trim() ? checkDate("expiryDate", input.expiryDate) : null,
    vial_volume_ml: realIn("vialVolumeMl", "Das Ampullenvolumen", input.vialVolumeMl, 0.01, 1000, 2),
    concentration_mg_ml: realIn("concentrationMgMl", "Die Wirkstoffkonzentration", input.concentrationMgMl, 0.001, 10000, 3),
  };
  const iso = now.toISOString();
  const old = input.id ? merged(catalog, local, "products").find((r) => r.id === input.id) : null;
  if (input.id && !old) throw new Error("Dieses Präparat gibt es nicht mehr.");
  const full = old ? { ...old, ...row, updated_at: iso } : { id: uuid(), ...row, created_at: iso, updated_at: iso };
  put(local, "products", Object.fromEntries(PRODUCT_COLUMNS.map((c) => [c, full[c] ?? null])));
  return toProduct(full);
}

export function deleteProduct(catalog, local, id, now = new Date()) {
  remove(catalog, local, "products", id, now.toISOString());
}

// ------------------------------------------------------------------ Protokoll (PEDs, Medikamente, Peptide)

export const CATEGORIES = ["ped", "medication", "peptide"];
export const UNITS = ["mg", "µg", "IE", "ml", "Tablette(n)", "Kapsel(n)", "Tropfen", "Hub", "Einheit(en)"];
const ROUTES = ["oral", "sc", "im", "iv", "topical", "nasal", "sublingual", "other"];

const byNameDe = (a, b) => a.localeCompare(b, "de", { sensitivity: "base" });

/** Substanzen wie `protocol::list_substances` (mit Zahl der Einträge und letztem Datum). */
export function substancesOf(catalog, local, includeArchived = true) {
  const rows = merged(catalog, local, "protocol");
  return merged(catalog, local, "substances")
    .map((r) => {
      const own = rows.filter((e) => e.substance_id === r.id);
      return {
        id: r.id,
        name: r.name,
        category: r.category,
        unit: r.unit,
        defaultRoute: r.default_route ?? null,
        notes: r.notes ?? null,
        archived: Number(r.archived) === 1 || r.archived === true,
        entryCount: own.length,
        lastDate: own.reduce((m, e) => (m === null || e.date > m ? e.date : m), null),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    })
    .filter((s) => includeArchived || !s.archived)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || byNameDe(a.name, b.name));
}

/** Protokolleinträge wie `protocol::list_entries` (neueste zuerst, optional ab `from`). */
export function protocolEntriesOf(catalog, local, from = null) {
  const subs = new Map(merged(catalog, local, "substances").map((s) => [s.id, s]));
  return merged(catalog, local, "protocol")
    .filter((r) => subs.has(r.substance_id) && (from === null || r.date >= from))
    .map((r) => {
      const s = subs.get(r.substance_id);
      return {
        id: r.id,
        substanceId: r.substance_id,
        substanceName: s.name,
        category: s.category,
        unit: s.unit,
        date: r.date,
        time: r.time ?? null,
        amount: Number(r.amount),
        route: r.route ?? null,
        site: r.site ?? null,
        notes: r.notes ?? null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    })
    .sort(newestFirst);
}

function checkRoute(field, route) {
  const r = String(route ?? "").trim();
  if (r === "") return null;
  if (!ROUTES.includes(r)) throw fieldError(field, "Bitte eine Anwendung wählen.");
  return r;
}

/** Substanz speichern wie `protocol::save_substance` (Name eindeutig, ohne Groß-/Kleinschreibung). */
export function saveSubstance(catalog, local, input, { uuid, now = new Date() }) {
  const name = reqText("name", "einen Namen", input.name, 80);
  if (!CATEGORIES.includes(input.category)) throw fieldError("category", "Bitte eine Art wählen.");
  if (!UNITS.includes(input.unit)) throw fieldError("unit", "Bitte eine Einheit wählen.");
  const row = {
    name,
    category: input.category,
    unit: input.unit,
    default_route: checkRoute("defaultRoute", input.defaultRoute),
    notes: optText("notes", input.notes, 1000),
    archived: input.archived ? 1 : 0,
  };
  const all = merged(catalog, local, "substances");
  if (all.some((s) => s.id !== input.id && String(s.name).toLocaleLowerCase("de") === name.toLocaleLowerCase("de"))) {
    throw fieldError("name", "Eine Substanz mit diesem Namen gibt es bereits.");
  }
  const iso = now.toISOString();
  const old = input.id ? all.find((r) => r.id === input.id) : null;
  if (input.id && !old) throw new Error("Diese Substanz gibt es nicht mehr.");
  const full = old ? { ...old, ...row, updated_at: iso } : { id: uuid(), ...row, created_at: iso, updated_at: iso };
  put(local, "substances", Object.fromEntries(SUBSTANCE_COLUMNS.map((c) => [c, full[c] ?? null])));
  return substancesOf(catalog, local).find((s) => s.id === full.id);
}

/** Substanz löschen wie `protocol::delete_substance` – nur ohne Protokolleinträge. */
export function deleteSubstance(catalog, local, id, now = new Date()) {
  const used = merged(catalog, local, "protocol").filter((e) => e.substance_id === id).length;
  if (used > 0) {
    throw new Error(`Zu dieser Substanz gibt es ${used} Protokolleinträge. Lösche diese zuerst oder archiviere die Substanz.`);
  }
  remove(catalog, local, "substances", id, now.toISOString());
}

/** Einnahme speichern wie `protocol::save_entry` (Eingabe wie `entryDraftToInput`). */
export function saveProtocolEntry(catalog, local, input, { uuid, now = new Date() }) {
  if (!merged(catalog, local, "substances").some((s) => s.id === input.substanceId)) {
    throw fieldError("substanceId", "Bitte eine Substanz wählen.");
  }
  const date = checkDate("date", input.date);
  const time = input.time ? String(input.time).trim() : null;
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw fieldError("time", "Bitte eine gültige Uhrzeit angeben.");
  const amount = realIn("amount", "Die Menge", input.amount, 0.001, 100000, 3);
  if (amount === null || amount <= 0) throw fieldError("amount", "Die Menge muss größer als 0 sein.");
  const row = {
    substance_id: input.substanceId,
    date,
    time,
    amount,
    route: checkRoute("route", input.route),
    site: optText("site", input.site, 60),
    notes: optText("notes", input.notes, 1000),
  };
  const iso = now.toISOString();
  const old = input.id ? merged(catalog, local, "protocol").find((r) => r.id === input.id) : null;
  if (input.id && !old) throw new Error("Diesen Eintrag gibt es nicht mehr.");
  const full = old ? { ...old, ...row, updated_at: iso } : { id: uuid(), ...row, created_at: iso, updated_at: iso };
  put(local, "protocol", Object.fromEntries(PROTOCOL_COLUMNS.map((c) => [c, full[c] ?? null])));
  return protocolEntriesOf(catalog, local).find((e) => e.id === full.id);
}

export function deleteProtocolEntry(catalog, local, id, now = new Date()) {
  remove(catalog, local, "protocol", id, now.toISOString());
}

// ------------------------------------------------------------------ Checkliste

function pcChecklist(catalog) {
  return pcRows(catalog, "settings").find((s) => s.key === CHECKLIST_KEY) ?? null;
}

/** Checkliste: eigener Stand vom Handy, sonst der vom PC, sonst die Vorlage. */
export function checklistOf(catalog, local) {
  const l = superState(local);
  const raw = l.checklist?.value ?? pcChecklist(catalog)?.value ?? null;
  return D.hrtChecklist.parseChecklist(raw);
}

/** Neue Checkliste merken (wie `ui_setting_set`, höchstens 8000 Zeichen). */
export function setChecklist(local, list, now = new Date()) {
  const raw = D.hrtChecklist.serializeChecklist(list);
  if (raw.length > D.hrtChecklist.CHECKLIST_STORAGE_MAX) {
    throw new Error("Nicht gespeichert: Die Checkliste ist zu umfangreich. Bitte Punkte kürzen oder entfernen.");
  }
  local.checklist = { value: raw, at: now.toISOString(), sent: false };
}

// ------------------------------------------------------------------ Übertragung an den PC

export function unsentSuper(local) {
  if (!local) return 0;
  const l = superState(local);
  let n = 0;
  for (const key of Object.keys(TABLES)) n += Object.values(l[key] ?? {}).filter((e) => !e.sent).length;
  n += Object.values(l.deleted).filter((d) => !d.sent).length;
  if (l.checklist && !l.checklist.sent) n += 1;
  return n;
}

/** Tabellen für die Rückgabedatei: Gaben, Präparate, Substanzen, Protokoll, Checkliste (settings), Löschvermerke. */
export function superTables(local, { all = false } = {}) {
  if (!local) return {};
  const l = superState(local);
  const out = {};
  for (const [key, table] of Object.entries(TABLES)) {
    const rows = Object.values(l[key] ?? {})
      .filter((e) => all || !e.sent)
      .map((e) => Object.fromEntries(COLUMNS[key].map((c) => [c, e.row[c] ?? null])));
    if (rows.length) out[table] = rows;
  }
  if (l.checklist && (all || !l.checklist.sent)) out.settings = [{ key: CHECKLIST_KEY, value: l.checklist.value, updated_at: l.checklist.at }];
  const del = Object.values(l.deleted)
    .filter((d) => all || !d.sent)
    .map((d) => ({ id: `${d.table}:${d.id}`, table_name: d.table, record_id: d.id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

export function markSuperSent(local) {
  if (!local) return;
  for (const key of Object.keys(TABLES)) for (const e of Object.values(local[key] ?? {})) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
  if (local.checklist) local.checklist.sent = true;
}

/** Nach neuen Daten vom PC: Übertragenes, das der PC (mindestens so neu) hat, entfällt. */
export function pruneSuper(catalog, local) {
  const l = superState(local);
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
  const pcc = pcChecklist(catalog);
  if (l.checklist?.sent && pcc && String(pcc.updated_at) >= String(l.checklist.at)) l.checklist = null;
  return l;
}
