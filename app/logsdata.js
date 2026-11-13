// LIFESPAN OS Mobil – Schlaf und Regeneration am Handy (1.7.0), reine Logik ohne Oberfläche.
//
// Daten vom PC: Tabellen sleep_log, sleep_nap und recovery_log aus der Exportdatei (catalog.pc).
// Am Handy erfasste oder geänderte Einträge liegen in `local` (id → { row, sent }), Löschungen
// als Löschvermerk. Sie gehen mit „Körperwerte senden“ an den PC; beim Abgleich am PC gilt je
// Nacht bzw. Tag ein Eintrag (natürlicher Schlüssel: Datum), der neuere Stand gewinnt.
// Prüfregeln wie im Rust-Kern (sleep.rs, nap.rs, recovery.rs).

export const SLEEP_COLUMNS = [
  "id",
  "date",
  "bed_time",
  "wake_time",
  "sleep_latency_min",
  "awake_min",
  "quality",
  "notes",
  "created_at",
  "updated_at",
  "awakenings",
  "efficiency_pct",
  "light_min",
  "deep_min",
  "rem_min",
  "method",
];
export const NAP_COLUMNS = ["id", "date", "start_time", "end_time", "notes", "created_at", "updated_at"];
export const RECOVERY_COLUMNS = ["id", "date", "readiness", "fatigue", "soreness", "stress", "notes", "created_at", "updated_at"];
export const MAX_NAP_MIN = 360;

const TABLES = { sleep: "sleep_log", naps: "sleep_nap", recovery: "recovery_log" };
const KINDS = Object.keys(TABLES);

export function emptyLogsLocal() {
  return { sleep: {}, naps: {}, recovery: {}, deleted: {} };
}

/** Ablage aus dem Gerätespeicher (fehlende Teile ergänzt). */
export function logsState(saved) {
  return { ...emptyLogsLocal(), ...(saved ?? {}) };
}

/** Teil für `makeDb`: Einträge und Löschvermerke vom Handy. */
export function phoneLogs(local) {
  const l = logsState(local);
  return {
    sleep: Object.values(l.sleep).map((e) => e.row),
    naps: Object.values(l.naps).map((e) => e.row),
    recovery: Object.values(l.recovery).map((e) => e.row),
    deleted: Object.values(l.deleted).map((d) => ({ table: d.table, id: d.id })),
  };
}

// ------------------------------------------------------------------ Prüfen wie im Rust-Kern

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

function time(errors, field, value, message) {
  const m = TIME.exec(String(value ?? "").trim());
  if (!m || +m[1] > 23 || +m[2] > 59) {
    errors[field] = message ?? "Bitte eine Uhrzeit wie 22:30 angeben.";
    return null;
  }
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Minuten zwischen zwei Uhrzeiten über Mitternacht (gleiche Zeiten → 0). */
export function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const d = eh * 60 + em - (sh * 60 + sm);
  return d < 0 ? d + 1440 : d;
}

/** Ganze Zahl aus einem Feld (leer → null); Fehler mit Bereich wie `opt_int`. */
function int(errors, field, label, text, min, max) {
  const t = String(text ?? "")
    .trim()
    .replace("%", "")
    .trim();
  if (t === "") return null;
  if (!/^-?\d+$/.test(t)) {
    errors[field] = "Bitte eine ganze Zahl eingeben.";
    return null;
  }
  const v = Number(t);
  if (v < min || v > max) {
    errors[field] = `${label} muss zwischen ${min} und ${max} liegen.`;
    return null;
  }
  return v;
}

function text(errors, field, value, max) {
  const t = String(value ?? "").trim();
  if (t === "") return null;
  if ([...t].length > max) {
    errors[field] = `Höchstens ${max} Zeichen.`;
    return null;
  }
  return t;
}

/** Dauer „95“, „1:35“ oder „1 h 35“ in Minuten (wie `parseDurationInput`); leer → null, sonst NaN. */
export function parseDuration(textValue) {
  const t = String(textValue ?? "")
    .trim()
    .toLowerCase();
  if (t === "") return null;
  if (/^\d+$/.test(t)) return Number(t);
  const colon = /^(\d+):([0-5]\d)$/.exec(t);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const hm = /^(\d+)\s*h(?:\s*(\d+)\s*(?:m|min)?)?$/.exec(t);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  return Number.NaN;
}

/** Alle Einträge einer Art (PC und Handy zusammengeführt, Löschungen ausgeblendet). */
function listOf(db, kind) {
  return kind === "sleep" ? db.sleep : kind === "naps" ? db.naps : db.recovery;
}

/**
 * Nacht prüfen und speichern wie `sleep::save`. `draft` mit Textfeldern (wie im Formular).
 * Rückgabe { errors } oder { row }.
 */
export function saveSleep(db, local, draft, { uuid, now = new Date() }) {
  const errors = {};
  const date = DATE.test(draft.date ?? "") ? draft.date : ((errors.date = "Bitte ein Datum angeben."), null);
  const bed = time(errors, "bedTime", draft.bedTime, draft.bedTime ? undefined : "Bitte die Zubettgehzeit angeben.");
  const wake = time(errors, "wakeTime", draft.wakeTime, draft.wakeTime ? undefined : "Bitte die Aufstehzeit angeben.");
  if (bed && wake && bed === wake) errors.wakeTime = "Aufstehzeit und Zubettgehzeit dürfen nicht gleich sein.";
  const latency = int(errors, "sleepLatencyMin", "Die Einschlafdauer", draft.sleepLatencyMin, 0, 300);
  const awake = int(errors, "awakeMin", "Die Wachzeit", draft.awakeMin, 0, 600);
  const inBed = bed && wake ? minutesBetween(bed, wake) : 0;
  if (bed && wake && !errors.wakeTime && (latency ?? 0) + (awake ?? 0) >= inBed) {
    errors.awakeMin = "Einschlafdauer und Wachzeit sind zusammen länger als die Zeit im Bett.";
  }
  const awakenings = int(errors, "awakenings", "Die Anzahl der Wachphasen", draft.awakenings, 0, 50);
  const quality = int(errors, "quality", "Die Schlafqualität", draft.quality, 1, 10);
  const notes = text(errors, "notes", draft.notes, 1000);
  const method = text(errors, "method", draft.method, 40);
  const efficiency = int(errors, "efficiencyPct", "Die Schlafeffizienz", draft.efficiencyPct, 1, 100);
  const phases = {};
  for (const [field, label] of [
    ["lightMin", "Der Leichtschlaf"],
    ["deepMin", "Der Tiefschlaf"],
    ["remMin", "Der REM-Schlaf"],
  ]) {
    const v = parseDuration(draft[field]);
    if (v !== null && Number.isNaN(v)) errors[field] = "Bitte Minuten (z. B. 95) oder Stunden:Minuten (z. B. 1:35) eingeben.";
    else if (v !== null && (v < 0 || v > 1440)) errors[field] = `${label} muss zwischen 0 und 1440 liegen.`;
    else phases[field] = v;
  }
  if (inBed && !errors.lightMin && (phases.lightMin ?? 0) + (phases.deepMin ?? 0) + (phases.remMin ?? 0) > inBed) {
    errors.lightMin = "Die Schlafphasen sind zusammen länger als die Zeit im Bett.";
  }
  if (date && listOf(db, "sleep").some((s) => s.date === date && s.id !== draft.id)) {
    errors.date = "Für diese Nacht gibt es bereits einen Eintrag. Bitte diesen bearbeiten.";
  }
  if (Object.keys(errors).length) return { errors };
  const iso = now.toISOString();
  const old = draft.id ? listOf(db, "sleep").find((s) => s.id === draft.id) : null;
  const id = draft.id ?? uuid();
  const row = {
    id,
    date,
    bed_time: bed,
    wake_time: wake,
    sleep_latency_min: latency,
    awake_min: awake,
    quality,
    notes,
    created_at: old?.created_at ?? iso,
    updated_at: iso,
    awakenings,
    efficiency_pct: efficiency,
    light_min: phases.lightMin ?? null,
    deep_min: phases.deepMin ?? null,
    rem_min: phases.remMin ?? null,
    method,
  };
  local.sleep[id] = { row, sent: false };
  delete local.deleted[`sleep_log:${id}`];
  return { row };
}

/** Nickerchen prüfen und speichern wie `nap::save`. */
export function saveNap(db, local, draft, { uuid, now = new Date() }) {
  const errors = {};
  const date = DATE.test(draft.date ?? "") ? draft.date : ((errors.date = "Bitte ein Datum angeben."), null);
  const start = time(errors, "startTime", draft.startTime, draft.startTime ? undefined : "Bitte den Beginn angeben.");
  const end = time(errors, "endTime", draft.endTime, draft.endTime ? undefined : "Bitte das Ende angeben.");
  if (start && end) {
    const d = minutesBetween(start, end);
    if (d === 0) errors.endTime = "Beginn und Ende dürfen nicht gleich sein.";
    else if (d > MAX_NAP_MIN) errors.endTime = "Ein Nickerchen darf höchstens 6 Stunden dauern. Längeren Schlaf bitte als Nacht erfassen.";
  }
  const notes = text(errors, "notes", draft.notes, 500);
  if (Object.keys(errors).length) return { errors };
  const iso = now.toISOString();
  const old = draft.id ? listOf(db, "naps").find((s) => s.id === draft.id) : null;
  const id = draft.id ?? uuid();
  const row = { id, date, start_time: start, end_time: end, notes, created_at: old?.created_at ?? iso, updated_at: iso };
  local.naps[id] = { row, sent: false };
  delete local.deleted[`sleep_nap:${id}`];
  return { row };
}

/** Selbsteinschätzung prüfen und speichern wie `recovery::save`. */
export function saveRecovery(db, local, draft, { uuid, now = new Date() }) {
  const errors = {};
  const date = DATE.test(draft.date ?? "") ? draft.date : ((errors.date = "Bitte ein Datum angeben."), null);
  const readiness = int(errors, "readiness", "Die Erholung", draft.readiness, 1, 10);
  const fatigue = int(errors, "fatigue", "Die Müdigkeit", draft.fatigue, 0, 10);
  const soreness = int(errors, "soreness", "Der Muskelkater", draft.soreness, 0, 10);
  const stress = int(errors, "stress", "Der Stress", draft.stress, 0, 10);
  const notes = text(errors, "notes", draft.notes, 1000);
  if (!Object.keys(errors).length && readiness === null && fatigue === null && soreness === null && stress === null) {
    errors.readiness = "Bitte mindestens eine Einschätzung wählen.";
  }
  if (date && listOf(db, "recovery").some((r) => r.date === date && r.id !== draft.id)) {
    errors.date = "Für diesen Tag gibt es bereits einen Eintrag. Bitte diesen bearbeiten.";
  }
  if (Object.keys(errors).length) return { errors };
  const iso = now.toISOString();
  const old = draft.id ? listOf(db, "recovery").find((s) => s.id === draft.id) : null;
  const id = draft.id ?? uuid();
  const row = { id, date, readiness, fatigue, soreness, stress, notes, created_at: old?.created_at ?? iso, updated_at: iso };
  local.recovery[id] = { row, sent: false };
  delete local.deleted[`recovery_log:${id}`];
  return { row };
}

/**
 * Eintrag löschen. Nur am Handy und noch nicht gesendet: einfach weg. Vom PC oder schon gesendet:
 * Löschvermerk für den Abgleich am PC.
 */
export function removeEntry(catalog, local, kind, id, now = new Date()) {
  const table = TABLES[kind];
  const own = local[kind][id];
  delete local[kind][id];
  const onPc = (catalog?.pc?.[table] ?? []).some((r) => r.id === id);
  if (onPc || (own && own.sent)) local.deleted[`${table}:${id}`] = { table, id, at: now.toISOString(), sent: false };
  return local;
}

export function unsentLogs(local) {
  if (!local) return 0;
  const l = logsState(local);
  return KINDS.reduce((a, k) => a + Object.values(l[k]).filter((e) => !e.sent).length, 0) + Object.values(l.deleted).filter((d) => !d.sent).length;
}

const pick = (row, cols) => Object.fromEntries(cols.map((c) => [c, row[c] ?? null]));

/** Tabellen für die Rückgabedatei (zusammen mit den Körperwerten). */
export function logTables(local, { all = false } = {}) {
  if (!local) return {};
  const l = logsState(local);
  const out = {};
  const rows = (kind, cols) =>
    Object.values(l[kind])
      .filter((e) => all || !e.sent)
      .map((e) => pick(e.row, cols));
  const sleep = rows("sleep", SLEEP_COLUMNS);
  const naps = rows("naps", NAP_COLUMNS);
  const recovery = rows("recovery", RECOVERY_COLUMNS);
  if (sleep.length) out.sleep_log = sleep;
  if (naps.length) out.sleep_nap = naps;
  if (recovery.length) out.recovery_log = recovery;
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([key, d]) => ({ id: key, table_name: d.table, record_id: d.id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

export function markLogsSent(local) {
  if (!local) return;
  for (const k of KINDS) for (const e of Object.values(local[k] ?? {})) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
}

/**
 * Nach neuen Daten vom PC: Gesendetes, das der PC jetzt selbst hat (gleiche ID oder – bei Nacht
 * und Tageseinschätzung – gleiches Datum, mindestens so neu), entfällt; ebenso erledigte
 * Löschvermerke.
 */
export function pruneLogs(catalog, local) {
  const l = logsState(local);
  for (const kind of KINDS) {
    const pc = catalog?.pc?.[TABLES[kind]] ?? [];
    const byId = new Map(pc.map((r) => [r.id, r]));
    const byDate = kind === "naps" ? new Map() : new Map(pc.map((r) => [r.date, r]));
    for (const [id, e] of Object.entries(l[kind])) {
      if (!e.sent) continue;
      const r = byId.get(id) ?? byDate.get(e.row.date);
      if (r && String(r.updated_at) >= String(e.row.updated_at)) delete l[kind][id];
    }
  }
  for (const [key, d] of Object.entries(l.deleted)) {
    if (!d.sent) continue;
    const still = (catalog?.pc?.[d.table] ?? []).some((r) => r.id === d.id);
    if (!still) delete l.deleted[key];
  }
  return l;
}

/** Messmethoden aus Settings (`measurement_methods`) eines Themas, z. B. „sleep“ oder „vital“. */
export function methodsOf(db, topic) {
  try {
    const v = JSON.parse(db.settings.get("measurement_methods") ?? "{}");
    return Array.isArray(v[topic]) ? v[topic].filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
