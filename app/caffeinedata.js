// LIFESPAN OS Mobil – Koffein-Einnahmen (iCoach.me → Widgets) am Handy (1.16.0), reine Logik.
//
// Daten vom PC: Tabelle `caffeine_intake` aus der Exportdatei (catalog.pc). Am Handy eingetragene
// Portionen liegen in `local.rows` (id → { row, sent }), Löschungen als Löschvermerk. Sie gehen mit
// „Körperwerte … senden“ an den PC. Regeln wie im Rust-Kern (repo/caffeine.rs `save`): Uhrzeit
// HH:MM, Getränk und Bezeichnung, Menge 1–3000 ml (ganz), Koffein 1–1000 mg (eine Stelle).
// Einträge der PC-Schnellerfassung mit Supplement-Eintrag (Nutrition) werden am PC gelöscht, damit
// der verknüpfte Supplement-Eintrag mitgeht.

export const CAFFEINE_COLUMNS = ["id", "date", "time", "drink_id", "label", "ml", "mg", "in_water", "supplement_intake_id", "created_at", "updated_at"];
const TABLE = "caffeine_intake";

export function emptyCaffeineLocal() {
  return { rows: {}, deleted: {} };
}

export function caffeineState(saved) {
  return { ...emptyCaffeineLocal(), ...(saved ?? {}) };
}

function merged(catalog, local) {
  const l = caffeineState(local);
  const m = new Map();
  for (const r of catalog?.pc?.[TABLE] ?? []) if (!l.deleted[r.id]) m.set(r.id, r);
  for (const e of Object.values(l.rows)) m.set(e.row.id, e.row);
  return [...m.values()];
}

/** Einnahmen eines Tages wie `caffeine::list` (nach Uhrzeit, dann Anlegezeit). */
export function intakesOn(catalog, local, date) {
  return merged(catalog, local)
    .filter((r) => r.date === date)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)) || String(a.created_at).localeCompare(String(b.created_at)))
    .map((r) => ({
      id: r.id,
      date: r.date,
      time: r.time,
      drinkId: r.drink_id,
      label: r.label,
      ml: r.ml === null || r.ml === undefined ? null : Number(r.ml),
      mg: Number(r.mg),
      linked: !!r.supplement_intake_id,
    }));
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/** Neue Einnahme speichern wie `caffeine::save` (ohne Wasserhaushalt und Supplement-Eintrag). */
export function addIntake(catalog, local, input, { uuid, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) throw new Error("Bitte ein gültiges Datum angeben.");
  const time = String(input.time ?? "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Uhrzeit als HH:MM eingeben.");
  const drink = String(input.drinkId ?? "").trim();
  if (drink === "" || [...drink].length > 40) throw new Error("Bitte ein Getränk wählen.");
  const label = String(input.label ?? "").trim();
  if (label === "" || [...label].length > 80) throw new Error("Bitte eine Bezeichnung eingeben.");
  let ml = input.ml === null || input.ml === undefined ? null : round(Number(input.ml), 0);
  if (ml !== null && (!Number.isFinite(ml) || ml < 1 || ml > 3000)) throw new Error("Die Menge muss zwischen 1 und 3000 ml liegen.");
  const mg = round(Number(input.mg), 1);
  if (!Number.isFinite(mg) || mg < 1 || mg > 1000) throw new Error("Das Koffein muss zwischen 1 und 1000 mg liegen.");
  const iso = now.toISOString();
  const row = { id: uuid(), date: input.date, time, drink_id: drink, label, ml, mg, in_water: 0, supplement_intake_id: null, created_at: iso, updated_at: iso };
  local.rows[row.id] = { row, sent: false };
  return row.id;
}

/** Einnahme löschen; vom PC oder schon gesendet → Löschvermerk. */
export function deleteIntake(catalog, local, id, now = new Date()) {
  const r = merged(catalog, local).find((x) => x.id === id);
  if (!r) return;
  if (r.supplement_intake_id) {
    throw new Error("Dieser Eintrag stammt aus der Schnellerfassung am PC und steht auch unter Nutrition → Supplemente. Bitte am PC löschen.");
  }
  const own = local.rows[id];
  delete local.rows[id];
  const onPc = (catalog?.pc?.[TABLE] ?? []).some((x) => x.id === id);
  if (onPc || own?.sent) local.deleted[id] = { at: now.toISOString(), sent: false };
}

export function unsentCaffeine(local) {
  if (!local) return 0;
  const l = caffeineState(local);
  return Object.values(l.rows).filter((e) => !e.sent).length + Object.values(l.deleted).filter((d) => !d.sent).length;
}

/** Tabellen für die Rückgabedatei: `caffeine_intake` und Löschvermerke. */
export function caffeineTables(local, { all = false } = {}) {
  if (!local) return {};
  const l = caffeineState(local);
  const out = {};
  const rows = Object.values(l.rows)
    .filter((e) => all || !e.sent)
    .map((e) => Object.fromEntries(CAFFEINE_COLUMNS.map((c) => [c, e.row[c] ?? null])));
  if (rows.length) out[TABLE] = rows;
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([id, d]) => ({ id: `${TABLE}:${id}`, table_name: TABLE, record_id: id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

export function markCaffeineSent(local) {
  if (!local) return;
  for (const e of Object.values(local.rows ?? {})) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
}

/** Nach neuen Daten vom PC: Übertragenes, das der PC (mindestens so neu) hat, entfällt. */
export function pruneCaffeine(catalog, local) {
  const l = caffeineState(local);
  const pc = new Map((catalog?.pc?.[TABLE] ?? []).map((r) => [r.id, r]));
  for (const [id, e] of Object.entries(l.rows)) {
    const r = pc.get(id);
    if (e.sent && r && String(r.updated_at) >= String(e.row.updated_at)) delete l.rows[id];
  }
  for (const [id, d] of Object.entries(l.deleted)) if (d.sent && !pc.has(id)) delete l.deleted[id];
  return l;
}
