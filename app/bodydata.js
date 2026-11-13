// LIFESPAN OS Mobil – Körperwerte (Body & Longevity → Verlauf), reine Logik ohne Oberfläche (1.3.0).
//
// Daten vom PC: Tabellen body_metric (Messgrößen) und body_measurement (Messwerte) aus der
// Exportdatei. Am Handy erfasste Werte liegen in `local.entries` (id → { row, sent }) und gehen als
// eigene Datei „LIFESPAN Körperwerte …“ an den PC. Am PC gilt je Messgröße und Tag ein Wert
// (natürlicher Schlüssel metric_id + date); der neuere (updated_at) gewinnt.

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Feste ID einer mitgelieferten Messgröße (…001 bis …041), wie am PC. */
export const builtinMetricId = (n) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
export const WEIGHT_METRIC_ID = builtinMetricId(1);

export const CATEGORIES = [
  { value: "weight", label: "Gewicht" },
  { value: "composition", label: "Körperzusammensetzung" },
  { value: "circumference", label: "Umfänge" },
  { value: "vital", label: "Vitalwerte" },
  { value: "fitness", label: "Fitness & Longevity" },
  { value: "other", label: "Gesundheitsmarker & Sonstiges" },
];

/** Bereiche mit „… – letzte Werte“ (wie am PC, dazu das Gewicht). */
export const SUMMARY_CATEGORIES = ["weight", "composition", "circumference", "vital", "fitness"];

const ANS_IDS = [18, 19, 20, 21, 22].map(builtinMetricId);

/** Teilüberschriften wie am PC (domain/bodyLayout.ts). */
export const SUBSECTIONS = {
  composition: [
    { label: "Kennzahlen", ids: [23, 37].map(builtinMetricId) },
    { label: "Fett", ids: [2, 25, 26, 27, 28, 38, 40, 41].map(builtinMetricId) },
    { label: "Muskulatur & Magermasse", ids: [3, 24, 39, 29, 30, 36].map(builtinMetricId) },
    { label: "Körperwasser", ids: [32, 33, 34].map(builtinMetricId) },
    { label: "Knochen & Mineralien", ids: [31, 35].map(builtinMetricId) },
  ],
  vital: [
    { label: "ANS - Autonomes Nervensystem Status", ids: ANS_IDS },
    { label: "Blutdruck", ids: [14, 15].map(builtinMetricId) },
  ],
};

/** Erklärungen für mitgelieferte Messgrößen ohne eigene Beschreibung (wie am PC). */
export const METRIC_HINTS = {
  [builtinMetricId(14)]:
    "Oberer Blutdruckwert: Druck in den Arterien, während sich das Herz zusammenzieht und Blut in den Körper pumpt.",
  [builtinMetricId(15)]:
    "Unterer Blutdruckwert: Druck in den Arterien, während sich das Herz entspannt und wieder mit Blut füllt.",
  [builtinMetricId(16)]:
    "Maximale Sauerstoffaufnahme: wie viele Milliliter Sauerstoff der Körper je Kilogramm Körpergewicht und Minute bei voller Belastung höchstens aufnehmen und verwerten kann – ein Maß für die Ausdauerleistungsfähigkeit.",
};

export function metricHint(m) {
  const own = typeof m.description === "string" ? m.description.trim() : "";
  return own || METRIC_HINTS[m.id] || null;
}

const MEASUREMENT_COLUMNS = ["id", "metric_id", "date", "value", "notes", "method", "time", "created_at", "updated_at"];

/** Aus der Exportdatei: Messgrößen (ohne archivierte) und alle Messwerte. */
export function bodyFromRows(rows) {
  const metrics = rows("body_metric")
    .filter((m) => !m.archived)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.name).localeCompare(String(b.name), "de"));
  return { metrics, measurements: rows("body_measurement") };
}

export function emptyBodyLocal() {
  return { entries: {} };
}

const keyOf = (r) => `${r.metric_id}|${r.date}`;

/**
 * Alle Messwerte (PC und Handy) je Messgröße, neueste zuerst. Gleiche Messgröße und gleicher Tag:
 * der neuere Eintrag gewinnt. Rückgabe Map metric_id → [{ row, local, sent }].
 */
export function allValues(catalog, local) {
  const byKey = new Map();
  for (const row of catalog?.body?.measurements ?? []) byKey.set(keyOf(row), { row, local: false, sent: true });
  for (const e of Object.values(local.entries)) {
    const old = byKey.get(keyOf(e.row));
    if (!old || !e.sent || String(e.row.updated_at) >= String(old.row.updated_at)) {
      byKey.set(keyOf(e.row), { row: e.row, local: true, sent: e.sent });
    }
  }
  const out = new Map();
  for (const v of byKey.values()) {
    if (!out.has(v.row.metric_id)) out.set(v.row.metric_id, []);
    out.get(v.row.metric_id).push(v);
  }
  for (const list of out.values()) {
    list.sort((a, b) => b.row.date.localeCompare(a.row.date) || String(b.row.time ?? "").localeCompare(String(a.row.time ?? "")));
  }
  return out;
}

/** Messgrößen nach Bereich und Teilüberschrift (nur `withData`: nur solche mit Werten). */
export function metricSections(metrics, { categories = CATEGORIES.map((c) => c.value) } = {}) {
  return CATEGORIES.filter((c) => categories.includes(c.value))
    .map((c) => {
      const inCat = metrics.filter((m) => m.category === c.value);
      const subs = SUBSECTIONS[c.value];
      if (!subs) return { category: c.value, label: c.label, groups: [{ label: null, metrics: inCat }] };
      const placed = new Set();
      const groups = subs.map((s) => {
        const list = s.ids.map((id) => inCat.find((m) => m.id === id)).filter(Boolean);
        for (const m of list) placed.add(m.id);
        return { label: s.label, metrics: list };
      });
      groups.push({ label: "Weitere", metrics: inCat.filter((m) => !placed.has(m.id)) });
      return { category: c.value, label: c.label, groups };
    })
    .map((s) => ({ ...s, groups: s.groups.filter((g) => g.metrics.length) }))
    .filter((s) => s.groups.length);
}

/** Letzter Wert, vorheriger Wert und Veränderung (gerundet auf die Nachkommastellen der Messgröße). */
export function latestOf(metric, values) {
  const [last, prev] = values ?? [];
  if (!last) return null;
  const f = 10 ** (metric.decimals ?? 1);
  return {
    value: last.row.value,
    date: last.row.date,
    change: prev ? { delta: Math.round((last.row.value - prev.row.value) * f) / f, since: prev.row.date } : null,
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Wert erfassen oder ändern. Gibt es für Messgröße und Tag schon einen Wert (Handy oder PC), wird
 * dieser ersetzt (gleiche ID) – wie am PC, wo je Tag ein Wert gilt.
 */
export function saveValue(catalog, local, input, { uuid, now = new Date() }) {
  const metric = (catalog?.body?.metrics ?? []).find((m) => m.id === input.metricId);
  if (!metric) throw new Error("Bitte eine Messgröße wählen.");
  const date = input.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) {
    throw new Error("Bitte ein gültiges Datum wählen.");
  }
  if (date > localDate(now)) throw new Error("Das Datum liegt in der Zukunft.");
  const value = input.value;
  if (value === null || !Number.isFinite(value)) throw new Error(`Bitte einen Wert für ${metric.name} eingeben.`);
  const min = metric.min_value ?? -Infinity;
  const max = metric.max_value ?? Infinity;
  if (value < min || value > max) {
    throw new Error(`${metric.name}: erlaubt sind ${fmt(min)} bis ${fmt(max)} ${metric.unit}.`);
  }
  const time = (input.time || "").trim() || null;
  if (time && !TIME.test(time)) throw new Error("Uhrzeit bitte als HH:MM.");
  const notes = (input.notes || "").trim() || null;
  if (notes && notes.length > 500) throw new Error("Die Notiz ist zu lang (höchstens 500 Zeichen).");
  const method = (input.method || "").trim() || null;
  if (method && method.length > 100) throw new Error("Die Messmethode ist zu lang (höchstens 100 Zeichen).");

  const iso = now.toISOString();
  const f = 10 ** (metric.decimals ?? 1);
  const key = `${metric.id}|${date}`;
  const own = input.editId ? local.entries[input.editId] : Object.values(local.entries).find((e) => keyOf(e.row) === key);
  const pc = (catalog.body.measurements ?? []).find((r) => keyOf(r) === key);
  // beim Ändern auf einen anderen Tag/eine andere Messgröße: alten Handy-Eintrag ersetzen
  if (own && keyOf(own.row) !== key) {
    if (own.sent) throw new Error("Dieser Wert ist schon am PC – Tag und Messgröße dort ändern.");
    delete local.entries[own.row.id];
  }
  const base = own && keyOf(own.row) === key ? own.row : pc;
  const row = {
    id: base?.id ?? uuid(),
    metric_id: metric.id,
    date,
    value: Math.round(value * f) / f,
    notes,
    method,
    time,
    created_at: base?.created_at ?? iso,
    updated_at: iso,
  };
  local.entries[row.id] = { row, sent: false };
  return { row, replaced: Boolean(base) };
}

/** Noch nicht gesendeten Handy-Wert verwerfen (ein Wert vom PC bleibt dann bestehen). */
export function removeValue(local, id) {
  const e = local.entries[id];
  if (!e) return;
  if (e.sent) throw new Error("Dieser Wert ist schon am PC – dort löschen.");
  delete local.entries[id];
}

export const unsentBody = (local) => Object.values(local?.entries ?? {}).filter((e) => !e.sent).length;

/** Tabellen der Rückgabedatei „LIFESPAN Körperwerte …“ (nur bekannte Spalten). */
export function bodyTables(catalog, local, { all = false } = {}) {
  const entries = Object.values(local.entries).filter((e) => all || !e.sent);
  if (!entries.length) return {};
  const cols = catalog.columns?.body_measurement ?? MEASUREMENT_COLUMNS;
  const pick = (row) => Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]]));
  const metricIds = new Set(entries.map((e) => e.row.metric_id));
  return {
    body_metric: (catalog.body?.metrics ?? []).filter((m) => metricIds.has(m.id)),
    body_measurement: entries.map((e) => pick(e.row)),
  };
}

export function markBodySent(local) {
  for (const e of Object.values(local.entries)) e.sent = true;
}

/** Nach dem Laden neuer PC-Daten: gesendete Werte, die der PC schon (gleich oder neuer) hat, entfallen. */
export function pruneBody(catalog, local) {
  const pc = new Map((catalog?.body?.measurements ?? []).map((r) => [keyOf(r), r]));
  for (const [id, e] of Object.entries(local.entries)) {
    const r = pc.get(keyOf(e.row));
    if (e.sent && r && String(r.updated_at) >= String(e.row.updated_at)) delete local.entries[id];
  }
}

/** Zuletzt verwendete Messmethoden einer Messgröße (für die Auswahl). */
export function methodsFor(values) {
  return [...new Set((values ?? []).map((v) => v.row.method).filter(Boolean))].slice(0, 8);
}

function fmt(v) {
  return Number.isFinite(v) ? String(v).replace(".", ",") : String(v);
}
