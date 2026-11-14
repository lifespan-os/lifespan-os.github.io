// LIFESPAN OS Mobil – Supplements erfassen (1.26.0). Reine Logik ohne Oberfläche.
//
// Einnahmen eines Tages wie am PC (Nutrition → Tagebuch → Supplements, `supplement::save_intake`):
// Tabelle `supplement_intake` (Datum, Uhrzeit, Einnahme: zu einer Mahlzeit / nüchtern / unabhängig,
// Name = Stack-Name oder Bezeichnung der Einnahme) mit Einträgen `supplement_intake_item`
// (Supplement, Menge in seiner Einheit, Reihenfolge). Prüfregeln wie die CHECK-Regeln der Migrationen.
//
// Ablage am Handy (`S.supp`, Speicher „supp“): `intakes` id → { row, sent }, `items` id → { row, sent },
// `deleted` "tabelle:id" → { table, id, at, sent } (Einträge vom PC, die am Handy entfernt wurden).
// Gesendet wird mit „Lebensmittel senden“. Beim Konto am Handy gehen die verwendeten Supplements
// (mit Nährwerten) mit, damit der PC sie kennt.

const pad = (n) => String(n).padStart(2, "0");
const localTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const FASTED_LABEL = "Nüchtern";
export const INDEPENDENT_LABEL = "Unabhängig";
export const MAX_AMOUNT = 100000;

export function emptySupp() {
  return { intakes: {}, items: {}, deleted: {}, supplements: {}, fields: {}, packages: {} };
}

/** Ältere oder fehlende Ablage vervollständigen. */
export function normSupp(local) {
  const l = local && typeof local === "object" ? local : {};
  return { intakes: l.intakes ?? {}, items: l.items ?? {}, deleted: l.deleted ?? {}, supplements: l.supplements ?? {}, fields: l.fields ?? {}, packages: l.packages ?? {} };
}

// ------------------------------------------------------------------ Zusammenführen (für makeDb)

/** Zeilen vom Handy und gelöschte IDs für die Ansichten wie am PC. */
export function phoneSupp(local) {
  const l = normSupp(local);
  const gone = (table) => Object.values(l.deleted).filter((d) => d.table === table).map((d) => d.id);
  return {
    intakes: Object.values(l.intakes).map((e) => e.row),
    items: Object.values(l.items).map((e) => e.row),
    deletedIntakes: gone("supplement_intake"),
    deletedItems: gone("supplement_intake_item"),
    // Herstellerpakete (1.27.0): am Handy angelegte Supplements mit Nährwerten und eigene Felder
    supplements: Object.values(l.supplements).map((e) => e.row),
    values: Object.values(l.supplements).flatMap((e) => Object.entries(e.values ?? {}).map(([nutrient, amount]) => ({ supplement_id: e.row.id, nutrient, amount }))),
    fields: Object.values(l.fields).map((e) => e.row),
  };
}

// ------------------------------------------------------------------ Auswahl

/** Supplements zur Auswahl (nicht archiviert), sortiert nach Name. */
export function supplementChoices(db) {
  return [...db.supplements.values()].filter((s) => !s.archived).sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
}

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");

/** Suche nach Name und Hersteller (alle Wörter müssen vorkommen); Treffer am Namensanfang zuerst. */
export function searchSupplements(db, query, limit = 30) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const s of db.supplements.values()) {
    if (s.archived) continue;
    const name = norm(s.name);
    const text = `${name} ${norm(s.manufacturer)}`;
    if (!words.every((w) => text.includes(w))) continue;
    hits.push({ s, rank: name.startsWith(words[0]) ? 0 : name.includes(words[0]) ? 1 : 2 });
  }
  return hits
    .sort((a, b) => a.rank - b.rank || String(a.s.name).localeCompare(String(b.s.name), "de"))
    .slice(0, limit)
    .map((h) => h.s);
}

/** Startmenge beim Hinzufügen: die Tagesdosis (Portion), falls so markiert, sonst 1 (wie am PC). */
export function startAmount(s) {
  return s?.daily_dose && s.serving_amount > 0 ? s.serving_amount : 1;
}

/** Stacks zur Auswahl (nicht archiviert) mit ihren Einträgen. */
export function stackChoices(pc) {
  const items = pc?.supplement_stack_item ?? [];
  return (pc?.supplement_stack ?? [])
    .filter((s) => !s.archived)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.name).localeCompare(String(b.name), "de"))
    .map((s) => ({
      id: s.id,
      name: s.name,
      items: items
        .filter((i) => i.stack_id === s.id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((i) => ({ supplementId: i.supplement_id, amount: i.amount })),
    }));
}

/**
 * Optionen für „Einnahme“: die Mahlzeiten des Tages (wie im Tagebuch; `slot:<art>` = noch leere
 * Standardmahlzeit), dann „Nüchtern“ und „Unabhängig“. `slots` aus `daySlots`.
 */
export function timingOptions(slots) {
  return [
    ...slots.map((s) => ({ value: s.meal ? `meal:${s.meal.id}` : `slot:${s.ref.mealType}`, label: s.title })),
    { value: "fasted", label: FASTED_LABEL },
    { value: "independent", label: INDEPENDENT_LABEL },
  ];
}

/** Auswahlwert eines gespeicherten Eintrags. */
export function timingValue(i) {
  if (i.timing === "meal") return i.mealId ? `meal:${i.mealId}` : "";
  return i.timing ?? "independent";
}

/** Vorschlag nach Uhrzeit: die passende Mahlzeit des Tages, sonst „Unabhängig“. */
export function suggestTiming(slots, hour) {
  const type = hour < 10 ? "breakfast" : hour < 14 ? "lunch" : hour >= 17 && hour < 22 ? "dinner" : "snack";
  const s = slots.find((x) => (x.meal?.mealType ?? x.ref.mealType) === type);
  if (!s) return "independent";
  return s.meal ? `meal:${s.meal.id}` : `slot:${type}`;
}

// ------------------------------------------------------------------ Entwurf

/** Neuer Entwurf für einen Tag. */
export function emptyDraft(date, timing = "independent", time = "") {
  return { id: null, date, stackId: null, name: "", timing, time, notes: "", items: [] };
}

/** Entwurf aus einem Eintrag von `intakesOn`. */
export function draftFromIntake(i) {
  return {
    id: i.id,
    date: i.date,
    stackId: i.stackId ?? null,
    name: i.name,
    timing: timingValue(i),
    time: i.time ?? "",
    notes: i.notes ?? "",
    items: i.items.map((x) => ({ id: x.id, supplementId: x.supplementId, amount: fmtAmount(x.amount) })),
  };
}

/** Stack übernehmen: Name, Stack-Bezug und Einträge (ersetzt die bisherigen Einträge). */
export function applyStack(draft, stack) {
  return { ...draft, stackId: stack.id, name: stack.name, items: stack.items.map((i) => ({ id: null, supplementId: i.supplementId, amount: fmtAmount(i.amount) })) };
}

export const fmtAmount = (v) => (typeof v === "number" ? String(Math.round(v * 1000) / 1000).replace(".", ",") : String(v ?? ""));

function parseAmount(text) {
  const t = String(text ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

// ------------------------------------------------------------------ Speichern

/**
 * Entwurf prüfen und speichern wie `supplement::save_intake`. `db` = zusammengeführte Daten (für
 * Supplements und die Einträge vom PC), `timingLabel` = Text der gewählten Einnahme (Name ohne Stack),
 * `ensureMeal(date, mealType)` legt eine noch leere Standardmahlzeit an und gibt ihre ID zurück.
 * Rückgabe: die gespeicherte Zeile `supplement_intake`.
 */
export function saveIntake(db, local, draft, { timingLabel, ensureMeal, uuid, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date ?? "")) throw new Error("Bitte ein gültiges Datum wählen.");
  const time = String(draft.time ?? "").trim();
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Bitte eine gültige Uhrzeit wählen (hh:mm).");
  const notes = String(draft.notes ?? "").trim();
  if (notes.length > 1000) throw new Error("Notizen: höchstens 1000 Zeichen.");
  if (!draft.items.length) throw new Error("Bitte mindestens ein Supplement hinzufügen.");
  const items = draft.items.map((it, i) => {
    const s = db.supplements.get(it.supplementId);
    if (!s) throw new Error(`Eintrag ${i + 1}: Bitte ein Supplement wählen.`);
    const amount = parseAmount(it.amount);
    if (!(amount > 0 && amount <= MAX_AMOUNT)) throw new Error(`„${s.name}“: Bitte eine Menge größer 0 (bis ${MAX_AMOUNT.toLocaleString("de-DE")}) eingeben.`);
    return { ...it, amount };
  });

  // Einnahme
  const t = String(draft.timing ?? "");
  let timing;
  let mealId = null;
  if (t === "fasted" || t === "independent") timing = t;
  else if (t.startsWith("meal:")) {
    timing = "meal";
    mealId = t.slice(5);
  } else if (t.startsWith("slot:")) {
    timing = "meal";
    mealId = ensureMeal(draft.date, t.slice(5));
  } else throw new Error("Bitte wählen, wann die Supplements eingenommen werden.");

  const name = String(draft.stackId ? draft.name : (timingLabel ?? draft.name) || "").trim();
  if (!name || name.length > 80) throw new Error("Die Einnahme braucht eine Bezeichnung (1–80 Zeichen).");

  const l = local;
  const iso = now.toISOString();
  const pcIntake = draft.id ? (db.intakesByDate.get(draft.date) ?? []).find((r) => r.id === draft.id) ?? findIntake(db, draft.id) : null;
  const own = draft.id ? l.intakes[draft.id] : null;
  const id = draft.id ?? uuid();
  const created = own?.row.created_at ?? pcIntake?.created_at ?? iso;
  const row = {
    id,
    date: draft.date,
    stack_id: draft.stackId ?? null,
    name,
    time: time || null,
    notes: notes || null,
    created_at: created,
    updated_at: iso,
    timing,
    meal_id: mealId,
  };
  l.intakes[id] = { row, sent: false };
  delete l.deleted[`supplement_intake:${id}`];

  // Einträge: bisherige IDs weiterverwenden, übrige als gelöscht vermerken
  const before = draft.id ? itemsOf(db, l, id) : [];
  const reuse = new Set(items.map((x) => x.id).filter(Boolean));
  const free = before.filter((b) => !reuse.has(b.id)).map((b) => b.id);
  const keep = new Set();
  items.forEach((it, position) => {
    const itemId = it.id && before.some((b) => b.id === it.id) ? it.id : free.shift() ?? uuid();
    keep.add(itemId);
    const old = before.find((b) => b.id === itemId);
    l.items[itemId] = {
      row: { id: itemId, intake_id: id, supplement_id: it.supplementId, amount: it.amount, position, created_at: old?.created_at ?? iso, updated_at: iso },
      sent: false,
    };
    delete l.deleted[`supplement_intake_item:${itemId}`];
  });
  for (const b of before) {
    if (keep.has(b.id)) continue;
    removeItemRow(db, l, b.id, iso);
  }
  return row;
}

function findIntake(db, id) {
  for (const list of db.intakesByDate.values()) {
    const r = list.find((x) => x.id === id);
    if (r) return r;
  }
  return null;
}

/** Einträge einer Einnahme (PC und Handy zusammengeführt). */
function itemsOf(db, local, intakeId) {
  return [...(db.intakeItems.get(intakeId) ?? [])];
}

const onPc = (db, table, id) => (db.pcIds?.[table] ?? new Set()).has(id);

function removeItemRow(db, local, itemId, iso) {
  const own = local.items[itemId];
  delete local.items[itemId];
  if (onPc(db, "supplement_intake_item", itemId) || own?.sent) {
    local.deleted[`supplement_intake_item:${itemId}`] = { table: "supplement_intake_item", id: itemId, at: iso, sent: false };
  }
}

/** Einnahme vom Tag entfernen (mit ihren Einträgen; am PC per Löschvermerk). */
export function deleteIntake(db, local, id, now = new Date()) {
  const iso = now.toISOString();
  const own = local.intakes[id];
  for (const it of itemsOf(db, local, id)) {
    const o = local.items[it.id];
    delete local.items[it.id];
    // Einträge vom PC gehen mit der Einnahme (ON DELETE CASCADE); nur schon gesendete vom Handy vermerken
    if (o?.sent && !onPc(db, "supplement_intake_item", it.id)) local.deleted[`supplement_intake_item:${it.id}`] = { table: "supplement_intake_item", id: it.id, at: iso, sent: false };
  }
  delete local.intakes[id];
  if (onPc(db, "supplement_intake", id) || own?.sent) {
    local.deleted[`supplement_intake:${id}`] = { table: "supplement_intake", id, at: iso, sent: false };
  }
  return local;
}

// ------------------------------------------------------------------ Senden

export const unsentSupp = (local) => {
  const l = normSupp(local);
  return (
    Object.values(l.intakes).filter((e) => !e.sent).length +
    Object.values(l.deleted).filter((d) => !d.sent && d.table === "supplement_intake").length +
    Object.values(l.packages).filter((p) => !p.sent).length
  );
};

/**
 * Tabellen für die Rückgabedatei (mit „Lebensmittel senden“). `withSupplements` = verwendete
 * Supplements mitsenden (Konto am Handy: der PC kennt sie vielleicht noch nicht).
 */
export function suppTables(local, db, { all = false, withSupplements = false, now = new Date() } = {}) {
  const l = normSupp(local);
  const out = {};
  const intakes = Object.values(l.intakes).filter((e) => all || !e.sent).map((e) => e.row);
  const ids = new Set(intakes.map((r) => r.id));
  // Mit einer Einnahme gehen immer alle ihre Einträge (der PC prüft die Datei vollständig)
  const items = Object.values(l.items)
    .filter((e) => all || !e.sent || ids.has(e.row.intake_id))
    .map((e) => e.row);
  for (const it of items) {
    if (ids.has(it.intake_id) || onPc(db, "supplement_intake", it.intake_id)) continue;
    const parent = l.intakes[it.intake_id];
    if (parent && !ids.has(parent.row.id)) {
      intakes.push(parent.row);
      ids.add(parent.row.id);
    }
  }
  if (intakes.length) out.supplement_intake = intakes;
  if (items.length) out.supplement_intake_item = items;
  // Herstellerpakete (1.27.0): neue Supplements, eigene Felder, Paket mit seinen Einträgen
  const ownSupps = Object.values(l.supplements).filter((e) => all || !e.sent);
  const fields = Object.values(l.fields).filter((e) => all || !e.sent).map((e) => e.row);
  if (fields.length) out.nutrient_field = fields;
  const packs = Object.values(l.packages).filter((p) => all || !p.sent);
  if (packs.length) {
    out.vendor_package = packs.map((p) => ({ ...p.row }));
    const links = packs.flatMap((p) => p.items);
    if (links.length) out.vendor_package_item = links;
  }
  const sendIds = new Set(ownSupps.map((e) => e.row.id));
  if (withSupplements && items.length) for (const i of items) if (db.supplements.has(i.supplement_id)) sendIds.add(i.supplement_id);
  if (sendIds.size) {
    const iso = now.toISOString();
    const used = [...sendIds].map((id) => db.supplements.get(id)).filter(Boolean);
    out.supplement = used.map((s) => ({
      id: s.id,
      name: s.name,
      unit: s.unit,
      notes: s.notes ?? null,
      archived: s.archived ? 1 : 0,
      created_at: s.created_at ?? iso,
      updated_at: s.updated_at ?? iso,
      manufacturer: s.manufacturer ?? null,
      serving_amount: s.serving_amount,
      daily_dose: s.daily_dose ? 1 : 0,
    }));
    const values = [];
    for (const s of used) {
      for (const v of db.supValues.get(s.id) ?? []) {
        values.push({ id: v.id ?? valueId(s.id, v.nutrient), supplement_id: s.id, nutrient: v.nutrient, amount: v.amount, created_at: s.created_at ?? iso, updated_at: s.updated_at ?? iso });
      }
    }
    if (values.length) out.supplement_value = values;
  }
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([key, d]) => ({ id: key, table_name: d.table, record_id: d.id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

/** Feste ID je Supplement und Nährstoff (der PC gleicht ohnehin über Supplement + Nährstoff ab). */
export function valueId(supplementId, nutrient) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = `${supplementId}|${nutrient}`;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, "0");
  const a = hex(h1);
  const b = hex(h2);
  const c = hex(Math.imul(h1 ^ h2, 3266489917) >>> 0);
  const d = hex(Math.imul(h2 ^ 0x9e3779b9, 668265263) >>> 0);
  return `${a}-${b.slice(0, 4)}-5${b.slice(5, 8)}-a${c.slice(1, 4)}-${c.slice(4)}${d}`;
}

export function markSuppSent(local) {
  if (!local) return;
  for (const e of Object.values(local.intakes ?? {})) e.sent = true;
  for (const e of Object.values(local.items ?? {})) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
  for (const k of ["supplements", "fields", "packages"]) for (const e of Object.values(local[k] ?? {})) e.sent = true;
}

/** Nach neuen Daten vom PC: Übertragenes, das der PC jetzt selbst hat, entfernen. */
export function pruneSupp(catalog, local) {
  const l = normSupp(local);
  const pc = catalog?.pc ?? {};
  const has = (table) => new Set((pc[table] ?? []).map((r) => r.id));
  const intakes = has("supplement_intake");
  const items = has("supplement_intake_item");
  for (const [id, e] of Object.entries(l.intakes)) if (e.sent && intakes.has(id)) delete l.intakes[id];
  for (const [id, e] of Object.entries(l.items)) if (e.sent && items.has(id)) delete l.items[id];
  for (const [key, d] of Object.entries(l.deleted)) {
    const set = d.table === "supplement_intake" ? intakes : items;
    if (d.sent && !set.has(d.id)) delete l.deleted[key];
  }
  // Herstellerpakete: was der PC jetzt selbst mitbringt, entfällt am Handy
  const supps = has("supplement");
  const suppNames = new Set((pc.supplement ?? []).map((s) => String(s.name).toLowerCase()));
  for (const [id, e] of Object.entries(l.supplements)) if (e.sent && (supps.has(id) || suppNames.has(String(e.row.name).toLowerCase()))) delete l.supplements[id];
  const fieldKeys = new Set((pc.nutrient_field ?? []).map((f) => f.key));
  for (const [k, e] of Object.entries(l.fields)) if (e.sent && fieldKeys.has(k)) delete l.fields[k];
  const packs = new Map((pc.vendor_package ?? []).map((p) => [p.package_key, p]));
  for (const [k, p] of Object.entries(l.packages)) if (p.sent && packs.get(k)?.version === p.row.version) delete l.packages[k];
  return l;
}

export { localTime as suppTime };
