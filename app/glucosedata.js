// LIFESPAN OS Mobil – Blutzucker am Handy (1.45.0), reine Logik.
//
// Daten vom PC: Tabelle `glucose_reading` aus der Exportdatei (catalog.pc). Am Handy eingelesene
// Dateien (LibreView, Dexcom Clarity, eigene CSV – gelesen mit `parseGlucoseFile` aus
// wearabledata.js) und eigene Messungen liegen in `local.rows` (id → { row, sent }), Löschungen als
// Löschvermerk. Sie gehen mit „Körperwerte … senden“ an den PC; dort gilt derselbe Messwert über
// Quelle + Zeitpunkt + Art (NATURAL_KEYS in import.rs), es entstehen keine doppelten Werte.
// Regeln wie im Rust-Kern (repo/glucose.rs `check`).

export const GLUCOSE_COLUMNS = ["id", "measured_at", "date", "mg_dl", "source", "kind", "notes", "created_at", "updated_at"];
const TABLE = "glucose_reading";
const KINDS = ["cgm", "scan", "manual"];

export function emptyGlucoseLocal() {
  return { rows: {}, deleted: {} };
}

export function glucoseState(saved) {
  return { ...emptyGlucoseLocal(), ...(saved ?? {}) };
}

const key = (r) => `${r.source}|${r.measured_at}|${r.kind}`;

function merged(catalog, local) {
  const l = glucoseState(local);
  const m = new Map();
  for (const r of catalog?.pc?.[TABLE] ?? []) if (!l.deleted[r.id]) m.set(key(r), r);
  for (const e of Object.values(l.rows)) m.set(key(e.row), e.row);
  return [...m.values()];
}

/** Alle Werte (PC + Handy) im Format von src/domain/glucose.ts, nach Zeit. */
export function allReadings(catalog, local) {
  return merged(catalog, local)
    .map((r) => ({ id: r.id, measuredAt: r.measured_at, mgDl: Number(r.mg_dl), source: r.source, kind: r.kind, notes: r.notes ?? null }))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
}

/** Prüfung wie `glucose::check`; gibt die bereinigte Zeile zurück oder wirft. */
export function checkReading(r) {
  const at = String(r.measuredAt ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(at) || Number.isNaN(Date.parse(`${at.slice(0, 10)}T00:00:00Z`))) {
    throw new Error("Bitte Datum und Uhrzeit des Messwerts angeben.");
  }
  const mg = Number(r.mgDl);
  if (!Number.isFinite(mg) || mg < 10 || mg > 700) throw new Error("Der Blutzucker muss zwischen 10 und 700 mg/dl liegen.");
  const source = String(r.source ?? "").trim();
  if (source === "" || [...source].length > 40) throw new Error("Bitte eine Herkunft mit höchstens 40 Zeichen angeben.");
  if (!KINDS.includes(r.kind)) throw new Error("Unbekannte Art des Messwerts.");
  const notes = r.notes ? String(r.notes).trim() : "";
  if ([...notes].length > 500) throw new Error("Die Notiz darf höchstens 500 Zeichen haben.");
  return { measured_at: at, date: at.slice(0, 10), mg_dl: Math.round(mg * 10) / 10, source, kind: r.kind, notes: notes || null };
}

/**
 * Viele Werte aus einer Datei übernehmen: neu, geändert (gleiche Quelle, Zeit und Art, anderer
 * Wert) oder übersprungen (gleich bzw. ungültig). Gibt { new, updated, skipped, problems } zurück.
 */
export function importReadings(catalog, local, readings, { uuid, now = new Date() }) {
  const existing = new Map(merged(catalog, local).map((r) => [key(r), r]));
  const rep = { new: 0, updated: 0, skipped: 0, problems: [] };
  const iso = now.toISOString();
  for (const r of readings) {
    let c;
    try {
      c = checkReading(r);
    } catch (e) {
      rep.skipped += 1;
      if (rep.problems.length < 20) rep.problems.push(`${r.measuredAt}: ${e.message}`);
      continue;
    }
    const old = existing.get(key(c));
    if (old && Math.abs(Number(old.mg_dl) - c.mg_dl) < 1e-9) {
      rep.skipped += 1;
      continue;
    }
    const row = { id: old?.id ?? uuid(), ...c, notes: c.notes ?? old?.notes ?? null, created_at: old?.created_at ?? iso, updated_at: iso };
    local.rows[row.id] = { row, sent: false };
    existing.set(key(row), row);
    if (old) rep.updated += 1;
    else rep.new += 1;
  }
  return rep;
}

/** Einzelne eigene Messung (Stechmessung). */
export function addManual(catalog, local, input, opts) {
  const rep = importReadings(catalog, local, [{ ...input, kind: "manual", source: input.source || "Stechmessung" }], opts);
  if (rep.problems.length) throw new Error(rep.problems[0].replace(/^[^:]*: /, ""));
  if (!rep.new && !rep.updated) throw new Error("Zu diesem Zeitpunkt gibt es schon einen Messwert dieser Art.");
}

/** Wert löschen; vom PC oder schon gesendet → Löschvermerk. */
export function deleteReading(catalog, local, id, now = new Date()) {
  const own = local.rows[id];
  delete local.rows[id];
  const onPc = (catalog?.pc?.[TABLE] ?? []).some((x) => x.id === id);
  if (onPc || own?.sent) local.deleted[id] = { at: now.toISOString(), sent: false };
}

export function unsentGlucose(local) {
  if (!local) return 0;
  const l = glucoseState(local);
  return Object.values(l.rows).filter((e) => !e.sent).length + Object.values(l.deleted).filter((d) => !d.sent).length;
}

/** Tabellen für die Rückgabedatei: `glucose_reading` und Löschvermerke. */
export function glucoseTables(local, { all = false } = {}) {
  if (!local) return {};
  const l = glucoseState(local);
  const out = {};
  const rows = Object.values(l.rows)
    .filter((e) => all || !e.sent)
    .map((e) => Object.fromEntries(GLUCOSE_COLUMNS.map((c) => [c, e.row[c] ?? null])));
  if (rows.length) out[TABLE] = rows;
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([id, d]) => ({ id: `${TABLE}:${id}`, table_name: TABLE, record_id: id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

export function markGlucoseSent(local) {
  if (!local) return;
  for (const e of Object.values(local.rows ?? {})) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
}

/** Nach neuen Daten vom PC: Übertragenes, das der PC hat, entfällt. */
export function pruneGlucose(catalog, local) {
  const l = glucoseState(local);
  const pc = new Map((catalog?.pc?.[TABLE] ?? []).map((r) => [key(r), r]));
  const pcIds = new Set((catalog?.pc?.[TABLE] ?? []).map((r) => r.id));
  for (const [id, e] of Object.entries(l.rows)) {
    const r = pc.get(key(e.row));
    if (e.sent && r && Math.abs(Number(r.mg_dl) - Number(e.row.mg_dl)) < 1e-9) delete l.rows[id];
  }
  for (const [id, d] of Object.entries(l.deleted)) if (d.sent && !pcIds.has(id)) delete l.deleted[id];
  return l;
}
