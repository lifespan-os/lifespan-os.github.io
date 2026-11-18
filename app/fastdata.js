// LIFESPAN OS Mobil – Fasttracking am Handy (1.55.0). Reine Logik ohne Oberfläche.
//
// Wie Fasttracking am PC (FasttrackEditor.tsx, `fasttrack::save` bzw. `meal::save` mit Werten):
// Nährwerte direkt eintragen – für den ganzen Tag (Tabellen `nutrition_day_entry` und
// `nutrition_day_value`, höchstens ein Eintrag je Tag) oder an einer Mahlzeit (`meal_value`).
// Speichern ersetzt alle Werte des Ziels (wie am PC); leer gelassene Werte, die es schon gab,
// werden gelöscht (Löschvermerk `deleted_record` für den Abgleich am PC).
//
// Ablage am Handy (`S.fast`, Speicher „fast“): `entries` id → { row, sent },
// `values` id → { table, row, sent }, `deleted` id → { table, at, sent }. Gesendet wird mit
// „Lebensmittel senden“.

export const MAX_VALUE = 10000000;
const DAY_VALUE = "nutrition_day_value";
const MEAL_VALUE = "meal_value";
const ENTRY = "nutrition_day_entry";

export function emptyFast() {
  return { entries: {}, values: {}, deleted: {} };
}

export function normFast(local) {
  const l = local && typeof local === "object" ? local : {};
  return { entries: l.entries ?? {}, values: l.values ?? {}, deleted: l.deleted ?? {} };
}

/** Teil für `makeDb`: Zeilen vom Handy und gelöschte IDs. */
export function phoneFast(local) {
  const l = normFast(local);
  const vals = Object.values(l.values);
  return {
    entries: Object.values(l.entries).map((e) => e.row),
    dayValues: vals.filter((v) => v.table === DAY_VALUE).map((v) => v.row),
    mealValues: vals.filter((v) => v.table === MEAL_VALUE).map((v) => v.row),
    deleted: Object.keys(l.deleted),
  };
}

/** Werte eines Ziels als Nährstoff → Zeile (aus den zusammengeführten Daten). */
function currentRows(db, target) {
  if (target.kind === "meal") return db.valuesByMeal.get(target.mealId) ?? [];
  const entry = (db.fastByDate.get(target.date) ?? [])[0];
  return entry ? (db.fastValues.get(entry.id) ?? []) : [];
}

/** Vorhandene Werte und Notiz eines Ziels (für das Formular). */
export function currentValues(db, target) {
  const values = {};
  for (const r of currentRows(db, target)) values[r.nutrient] = (values[r.nutrient] ?? 0) + r.amount;
  const entry = target.kind === "day" ? ((db.fastByDate.get(target.date) ?? [])[0] ?? null) : null;
  return { values, notes: entry?.notes ?? "", exists: Object.keys(values).length > 0 || Boolean(entry) };
}

/** Werte prüfen: bekannte Nährstoffe, Zahl zwischen 0 und 10.000.000. */
export function checkValues(values, knownKeys) {
  for (const [key, v] of Object.entries(values)) {
    if (!knownKeys.has(key)) throw new Error(`Unbekannter Nährstoff „${key}“.`);
    if (!(typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_VALUE)) throw new Error("Werte müssen zwischen 0 und 10.000.000 liegen.");
  }
}

function forget(local, pcIds, table, id, at) {
  const own = local.values[id] ?? local.entries[id];
  delete local.values[id];
  delete local.entries[id];
  // Vom PC oder schon gesendet: Löschvermerk, sonst einfach weg
  if (pcIds.has(id) || own?.sent) local.deleted[id] = { table, at, sent: false };
}

/**
 * Werte für ein Ziel speichern. `target` = { kind: "day", date } oder { kind: "meal", mealId };
 * `values` = Nährstoff → Zahl (leer = alles entfernen), `notes` nur beim Tag (bis 500 Zeichen).
 * `pcIds` = IDs der Zeilen, die der PC schon hat. Gibt die Anzahl der Werte zurück.
 */
export function saveFast(db, local, target, values, notes, { uuid, now = new Date(), knownKeys, pcIds = new Set() }) {
  checkValues(values, knownKeys);
  const iso = now.toISOString();
  const keys = Object.keys(values);
  let parentId;
  if (target.kind === "day") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(target.date ?? ""))) throw new Error("Bitte einen gültigen Tag wählen.");
    const text = String(notes ?? "").trim();
    if (text.length > 500) throw new Error("Notiz: höchstens 500 Zeichen.");
    const entry = (db.fastByDate.get(target.date) ?? [])[0] ?? null;
    if (!keys.length) {
      // Alles entfernt: Tageseintrag mit allen Werten löschen
      if (entry) {
        for (const r of currentRows(db, target)) forget(local, pcIds, DAY_VALUE, r.id, iso);
        forget(local, pcIds, ENTRY, entry.id, iso);
      }
      return 0;
    }
    const row = entry
      ? { ...entry, notes: text || null, updated_at: iso }
      : { id: uuid(), date: target.date, notes: text || null, created_at: iso, updated_at: iso };
    local.entries[row.id] = { row, sent: false };
    delete local.deleted[row.id];
    parentId = row.id;
  } else {
    if (!target.mealId) throw new Error("Bitte eine Mahlzeit wählen.");
    parentId = target.mealId;
  }
  const table = target.kind === "day" ? DAY_VALUE : MEAL_VALUE;
  const parentCol = target.kind === "day" ? "entry_id" : "meal_id";
  const existing = new Map(currentRows(db, target).map((r) => [r.nutrient, r]));
  for (const [nutrient, r] of existing) {
    if (!(nutrient in values)) forget(local, pcIds, table, r.id, iso);
  }
  for (const key of keys) {
    const old = existing.get(key);
    const row = old
      ? { ...old, amount: values[key], updated_at: iso }
      : { id: uuid(), [parentCol]: parentId, nutrient: key, amount: values[key], created_at: iso, updated_at: iso };
    if (old && old.amount === values[key] && !local.values[old.id]) continue; // unverändert vom PC
    local.values[row.id] = { table, row, sent: false };
    delete local.deleted[row.id];
  }
  return keys.length;
}

export const unsentFast = (local) => {
  const l = normFast(local);
  return (
    Object.values(l.entries).filter((e) => !e.sent).length +
    Object.values(l.values).filter((e) => !e.sent).length +
    Object.values(l.deleted).filter((e) => !e.sent).length
  );
};

/**
 * Tabellen für die Rückgabedatei. Ein Wert an einer Mahlzeit nimmt seine Mahlzeit mit, wenn sie
 * sonst fehlen würde (`mealOf(id)` → Zeile der Mahlzeit oder null).
 */
export function fastTables(local, { all = false, mealOf = () => null, have = new Set() } = {}) {
  const l = normFast(local);
  const out = {};
  const pick = (list) => list.filter((e) => all || !e.sent);
  const entries = pick(Object.values(l.entries)).map((e) => e.row);
  const dayValues = pick(Object.values(l.values).filter((v) => v.table === DAY_VALUE)).map((v) => v.row);
  const mealValues = pick(Object.values(l.values).filter((v) => v.table === MEAL_VALUE)).map((v) => v.row);
  // Tageseintrag eines geänderten Werts immer mitschicken (Abgleich prüft den Elterneintrag)
  for (const v of dayValues) {
    if (!entries.some((e) => e.id === v.entry_id) && l.entries[v.entry_id]) entries.push(l.entries[v.entry_id].row);
  }
  if (entries.length) out[ENTRY] = entries;
  if (dayValues.length) out[DAY_VALUE] = dayValues;
  if (mealValues.length) {
    out[MEAL_VALUE] = mealValues;
    const meals = [];
    for (const id of new Set(mealValues.map((v) => v.meal_id))) {
      if (have.has(id)) continue;
      const m = mealOf(id);
      if (m) meals.push(m);
    }
    if (meals.length) out.meal = meals;
  }
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([id, d]) => ({ id: `${d.table}:${id}`, table_name: d.table, record_id: id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

export function markFastSent(local) {
  const l = normFast(local);
  for (const e of Object.values(l.entries)) e.sent = true;
  for (const e of Object.values(l.values)) e.sent = true;
  for (const d of Object.values(l.deleted)) d.sent = true;
  return l;
}

/** Nach neuen Daten vom PC: Übertragenes, das der PC jetzt selbst hat, entfernen. */
export function pruneFast(catalog, local) {
  const l = normFast(local);
  const pc = catalog?.pc ?? {};
  const rows = new Map([...(pc[ENTRY] ?? []), ...(pc[DAY_VALUE] ?? []), ...(pc[MEAL_VALUE] ?? [])].map((r) => [r.id, r]));
  const done = (id, e) => e.sent && rows.has(id) && String(rows.get(id).updated_at) >= e.row.updated_at;
  for (const [id, e] of Object.entries(l.entries)) if (done(id, e)) delete l.entries[id];
  for (const [id, e] of Object.entries(l.values)) if (done(id, e)) delete l.values[id];
  for (const [id, d] of Object.entries(l.deleted)) if (d.sent && !rows.has(id)) delete l.deleted[id];
  return l;
}

/** IDs der Fasttracking-Zeilen, die der PC hat (für Löschvermerke). */
export function pcFastIds(catalog) {
  const pc = catalog?.pc ?? {};
  return new Set([...(pc[ENTRY] ?? []), ...(pc[DAY_VALUE] ?? []), ...(pc[MEAL_VALUE] ?? [])].map((r) => r.id));
}
