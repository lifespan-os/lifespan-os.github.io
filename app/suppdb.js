// LIFESPAN OS Mobil – Nutrition → Datenbanken → Supplementdatenbank wie am PC (1.147.0,
// `SupplementsTab.tsx`/`SupplementEditor`, Regeln wie `repo/supplement.rs`). Reine Logik.
//
// Ablage am Handy (`S.supp`, Speicher „supp“): `supplements` id → { row, values, valueIds, sent }
// (seit 1.27.0 für Herstellerpakete; seit 1.147.0 auch am Handy angelegt oder geändert, auch
// Supplemente vom PC mit derselben ID). `values` = Nährstoff → Menge je `serving_amount`
// Einheiten, `valueIds` = Nährstoff → ID der Zeile (vom PC übernommen, damit der Abgleich dieselbe
// Zeile trifft). Entfernte Werte: Löschvermerk in `deleted` ("supplement_value:<id>").

import { valueId } from "./supplements.js";

/** Erlaubte Einheiten (gleiche Liste wie `UNITS` in repo/supplement.rs). */
export const SUPPLEMENT_UNITS = ["Kapsel(n)", "Tablette(n)", "Messlöffel", "Tropfen", "Portion(en)", "g", "mg", "µg", "IE", "ml"];

const SINGULAR = { "Kapsel(n)": "je Kapsel", "Tablette(n)": "je Tablette", Messlöffel: "je Messlöffel", Tropfen: "je Tropfen", "Portion(en)": "je Portion" };
const FORMS = { "Kapsel(n)": ["Kapsel", "Kapseln"], "Tablette(n)": ["Tablette", "Tabletten"], Messlöffel: ["Messlöffel", "Messlöffel"], Tropfen: ["Tropfen", "Tropfen"], "Portion(en)": ["Portion", "Portionen"] };

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const numText = (v, d = 3) => (v === null || v === undefined ? "" : String(round(v, d)).replace(".", ","));

/** Zahl aus Formulartext („1,5“, „1.000“ nur als Tausenderpunkt mit Komma) – null leer, NaN ungültig. */
export function parseNum(text) {
  let s = String(text ?? "").trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** „1 Kapsel“, „2 Kapseln“, „2,5 g“ */
export function amountWithUnit(amount, unit) {
  const f = FORMS[unit];
  const n = numText(amount, 3);
  if (!f) return `${n} ${unit}`;
  return `${n} ${amount === 1 ? f[0] : f[1]}`;
}

/** Worauf sich die Werte beziehen: „je Kapsel“, „je 2 Kapseln“ (wie `perServingLabel`). */
export function perServingLabel(amount, unit) {
  if (amount === 1) return SINGULAR[unit] ?? `je 1 ${unit}`;
  return `je ${amountWithUnit(amount, unit)}`;
}

/** Höchstwert je Einheit wie `max_for` in repo/fasttrack.rs. */
export function maxFor(unit) {
  if (unit === "kcal") return 20000;
  if (unit === "g") return 5000;
  if (unit === "mg" || unit === "ml") return 1000000;
  return 10000000;
}

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .trim();

// ------------------------------------------------------------------ Liste

/**
 * Supplemente als Modell: Werte, Verwendung (Einnahmen, Stacks, Gerichte), Stand am Handy.
 * `db` = makeDb-Ergebnis, `local` = S.supp.
 */
export function supplementModels(db, local = null) {
  const pc = db.pc ?? {};
  const used = new Map();
  const count = (id) => used.set(id, (used.get(id) ?? 0) + 1);
  for (const list of db.intakeItems?.values?.() ?? []) for (const i of list) count(i.supplement_id);
  for (const i of pc.supplement_stack_item ?? []) count(i.supplement_id);
  for (const i of pc.recipe_supplement ?? []) count(i.supplement_id);
  const pcIds = new Set((pc.supplement ?? []).map((s) => s.id));
  return [...(db.supplements?.values?.() ?? [])].map((s) => {
    const values = {};
    for (const v of db.supValues?.get(s.id) ?? []) values[v.nutrient] = v.amount;
    const l = local?.supplements?.[s.id];
    return {
      id: s.id,
      name: s.name,
      manufacturer: s.manufacturer ?? null,
      unit: s.unit,
      servingAmount: Number(s.serving_amount) > 0 ? Number(s.serving_amount) : 1,
      dailyDose: Boolean(s.daily_dose),
      notes: s.notes ?? null,
      // Notiz bekannt? Ältere Exportdateien brachten sie nicht mit (dann am Handy nicht bearbeiten)
      notesKnown: Object.prototype.hasOwnProperty.call(s, "notes"),
      archived: Boolean(s.archived),
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      values,
      used: used.get(s.id) ?? 0,
      onPc: pcIds.has(s.id),
      onPhone: Boolean(l && !l.sent),
      sent: Boolean(l?.sent),
    };
  });
}

/** Suche nach Name und Hersteller; archivierte nur auf Wunsch (am Ende). */
export function filterSupplements(models, { query = "", archived = false } = {}) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return models
    .filter((s) => archived || !s.archived)
    .filter((s) => {
      if (!words.length) return true;
      const hay = `${norm(s.name)} ${norm(s.manufacturer)}`;
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => Number(a.archived) - Number(b.archived) || String(a.name).localeCompare(String(b.name), "de", { sensitivity: "base" }));
}

// ------------------------------------------------------------------ Entwurf

export function emptyDraft() {
  return { id: null, name: "", manufacturer: "", unit: "Kapsel(n)", servingAmount: "1", notes: "", archived: false, values: {} };
}

export function draftFromModel(s) {
  const values = {};
  for (const [k, v] of Object.entries(s.values)) values[k] = numText(v, 3);
  return {
    id: s.id,
    name: s.name,
    manufacturer: s.manufacturer ?? "",
    unit: s.unit,
    servingAmount: numText(s.servingAmount, 3),
    notes: s.notes ?? "",
    archived: s.archived,
    values,
    dailyDose: s.dailyDose,
  };
}

/**
 * Prüfen wie `write_supplement` am PC. `nutrients` = [{ key, label, unit }] (Katalog mit eigenen
 * Feldern), `names` = [{ id, name }]. Rückgabe { ok: true, value } oder { ok: false, errors }.
 */
export function checkDraft(draft, { nutrients, names = [] }) {
  const errors = {};
  const name = String(draft.name ?? "").trim();
  if (!name) errors.name = "Bitte einen Namen eingeben.";
  else if (name.length > 80) errors.name = "Der Name darf höchstens 80 Zeichen haben.";
  if (!SUPPLEMENT_UNITS.includes(draft.unit)) errors.unit = "Bitte eine Einheit wählen.";
  const manufacturer = String(draft.manufacturer ?? "").trim();
  if (manufacturer.length > 80) errors.manufacturer = "Höchstens 80 Zeichen.";
  const serving = parseNum(draft.servingAmount);
  if (serving === null) errors.servingAmount = "Bitte eine Menge angeben, z. B. 1.";
  else if (Number.isNaN(serving)) errors.servingAmount = "Bitte eine Zahl eingeben, z. B. 1.";
  else if (serving < 0.001 || serving > 100000) errors.servingAmount = "Die Menge muss zwischen 0,001 und 100.000 liegen.";
  const notes = String(draft.notes ?? "").trim();
  if (notes.length > 1000) errors.notes = "Höchstens 1000 Zeichen.";
  const values = {};
  for (const [key, text] of Object.entries(draft.values ?? {})) {
    const v = parseNum(text);
    if (v === null) continue;
    const def = nutrients.find((n) => n.key === key);
    const field = `values.${key}`;
    if (!def) errors[field] = `Unbekannter Nährstoff „${key}“.`;
    else if (Number.isNaN(v)) errors[field] = "Bitte eine Zahl eingeben, z. B. 4,5.";
    else if (v < 0 || v > maxFor(def.unit)) errors[field] = `${def.label}: bitte 0 bis ${maxFor(def.unit).toLocaleString("de-DE")} ${def.unit}.`;
    else values[key] = round(v, def.unit === "kcal" ? 1 : 3);
  }
  if (name && !errors.name && names.some((s) => s.id !== draft.id && norm(s.name) === norm(name))) {
    errors.name = `Es gibt bereits ein Supplement mit dem Namen „${name}“.`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: draft.id ?? null,
      name,
      manufacturer: manufacturer || null,
      unit: draft.unit,
      servingAmount: round(serving, 3),
      notes: notes || null,
      archived: Boolean(draft.archived),
      // „Tagesdosis“ wird am PC nicht mehr erfasst (seit 1.0.26) – vorhandener Wert bleibt
      dailyDose: Boolean(draft.dailyDose),
      values,
    },
  };
}

/**
 * Geprüftes Supplement am Handy speichern. `current` = Modell (supplementModels) oder null,
 * `pcValueIds` = Nährstoff → ID der Wertezeile (vom PC bzw. schon gesendet).
 */
export function saveSupplement(local, value, current, { uuid, now = new Date(), pcValueIds = {} }) {
  if (!local.supplements) local.supplements = {};
  if (!local.deleted) local.deleted = {};
  const iso = now.toISOString();
  const id = value.id ?? uuid();
  const prev = local.supplements[id];
  const row = {
    id,
    name: value.name,
    unit: value.unit,
    notes: value.notes,
    archived: value.archived ? 1 : 0,
    created_at: current?.createdAt ?? prev?.row.created_at ?? iso,
    updated_at: iso,
    manufacturer: value.manufacturer,
    serving_amount: value.servingAmount,
    daily_dose: value.dailyDose ? 1 : 0,
  };
  const known = { ...pcValueIds, ...(prev?.valueIds ?? {}) };
  const valueIds = {};
  for (const k of Object.keys(value.values)) valueIds[k] = known[k] ?? valueId(id, k);
  // entfernte Werte: Löschvermerk (der PC kennt die Zeile unter ihrer ID)
  for (const k of Object.keys(current?.values ?? {})) {
    if (k in value.values) continue;
    const rid = known[k] ?? valueId(id, k);
    local.deleted[`supplement_value:${rid}`] = { table: "supplement_value", id: rid, at: iso, sent: false };
  }
  // ein Wert kommt wieder: Löschvermerk entfällt
  for (const rid of Object.values(valueIds)) delete local.deleted[`supplement_value:${rid}`];
  local.supplements[id] = { row, values: { ...value.values }, valueIds, edited: true, sent: false };
  return row;
}

/**
 * Löschen: nur am Handy angelegt, noch nicht am PC und nirgends verwendet (am PC ist ein
 * verwendetes Supplement nicht löschbar). Sonst Fehler mit Hinweis aufs Archivieren.
 */
export function deleteSupplement(local, model) {
  if (model.used) throw new Error("Das Supplement wird noch verwendet (Einnahmen, Stacks oder Gerichte) – bitte archivieren.");
  if (model.onPc || model.sent) throw new Error("Das Supplement ist schon am PC – bitte archivieren oder am PC löschen.");
  if (local.supplements) delete local.supplements[model.id];
}

/**
 * Stacks (vom PC und vom Handy, `db.pc` aus makeDb) mit Inhalt, in der Reihenfolge wie am PC
 * (archivierte am Ende). `local` = S.supp (Stand „noch nicht am PC“).
 */
export function stackModels(db, local = null) {
  const pc = db.pc ?? {};
  const items = pc.supplement_stack_item ?? [];
  const used = new Map();
  for (const list of db.intakesByDate?.values?.() ?? []) for (const i of list) if (i.stack_id) used.set(i.stack_id, (used.get(i.stack_id) ?? 0) + 1);
  return (pc.supplement_stack ?? [])
    .slice()
    .sort((a, b) => Number(Boolean(a.archived)) - Number(Boolean(b.archived)) || (a.position ?? 0) - (b.position ?? 0) || String(a.name).localeCompare(String(b.name), "de"))
    .map((s) => ({
      id: s.id,
      name: s.name,
      archived: Boolean(s.archived),
      notes: s.notes ?? null,
      position: s.position ?? 0,
      createdAt: s.created_at,
      used: used.get(s.id) ?? 0,
      onPhone: Boolean(local?.stacks?.[s.id] && !local.stacks[s.id].sent),
      items: items
        .filter((i) => i.stack_id === s.id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((i) => {
          const sup = db.supplements?.get(i.supplement_id);
          return { id: i.id, supplementId: i.supplement_id, name: sup?.name ?? "Unbekanntes Supplement", unit: sup?.unit ?? "", amount: i.amount };
        }),
    }));
}

// ------------------------------------------------------------------ Stacks bearbeiten (save_stack)

export const MAX_STACK_ITEMS = 40;

let keySeq = 0;
const newKey = () => `s${Date.now().toString(36)}${(++keySeq).toString(36)}`;

export function emptyStackDraft() {
  return { id: null, name: "", notes: "", archived: false, items: [] };
}

export function stackDraftFromModel(m) {
  return {
    id: m.id,
    name: m.name,
    notes: m.notes ?? "",
    archived: m.archived,
    items: m.items.map((i) => ({ key: newKey(), id: i.id, supplementId: i.supplementId, amount: numText(i.amount, 3) })),
  };
}

export function stackDraftItem(supplementId, amountText = "1") {
  return { key: newKey(), id: null, supplementId, amount: amountText };
}

/** Prüfen wie `save_stack` am PC. `names` = [{ id, name }] aller Stacks. */
export function checkStackDraft(draft, { supplements, names = [] }) {
  const errors = {};
  const name = String(draft.name ?? "").trim();
  if (!name) errors.name = "Bitte einen Namen für den Stack eingeben.";
  else if (name.length > 80) errors.name = "Der Name darf höchstens 80 Zeichen haben.";
  else if (names.some((s) => s.id !== draft.id && norm(s.name) === norm(name))) errors.name = `Es gibt bereits einen Stack mit dem Namen „${name}“.`;
  const notes = String(draft.notes ?? "").trim();
  if (notes.length > 1000) errors.notes = "Höchstens 1000 Zeichen.";
  if (!draft.items.length) errors.items = "Bitte mindestens ein Supplement hinzufügen.";
  else if (draft.items.length > MAX_STACK_ITEMS) errors.items = `Höchstens ${MAX_STACK_ITEMS} Supplements je Eintrag.`;
  const items = draft.items.map((it, i) => {
    if (!supplements.get(it.supplementId)) {
      errors[`items.${i}.supplementId`] = "Bitte ein Supplement wählen.";
      return null;
    }
    const a = parseNum(it.amount);
    if (a === null) errors[`items.${i}.amount`] = "Bitte eine Menge eingeben.";
    else if (Number.isNaN(a)) errors[`items.${i}.amount`] = "Bitte eine Zahl eingeben, z. B. 1.";
    else if (a < 0.001 || a > 100000) errors[`items.${i}.amount`] = "Die Menge muss zwischen 0,001 und 100.000 liegen.";
    else return { id: it.id ?? null, supplementId: it.supplementId, amount: round(a, 3) };
    return null;
  });
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { id: draft.id ?? null, name, notes: notes || null, archived: Boolean(draft.archived), items } };
}

/**
 * Stack am Handy speichern (neu oder geändert, auch vom PC). Einträge behalten ihre ID; entfernte
 * bekommen einen Löschvermerk, wenn der PC sie kennen kann. `current` = Modell oder null,
 * `positions` = Positionen aller Stacks (neue Stacks kommen ans Ende), `onPc` = vom PC.
 */
export function saveStack(local, value, current, { uuid, now = new Date(), positions = [], onPc = false }) {
  if (!local.stacks) local.stacks = {};
  if (!local.deleted) local.deleted = {};
  const iso = now.toISOString();
  const id = value.id ?? uuid();
  const prev = local.stacks[id];
  const row = {
    id,
    name: value.name,
    notes: value.notes,
    archived: value.archived ? 1 : 0,
    position: current ? current.position : positions.length ? Math.max(...positions) + 1 : 0,
    created_at: current?.createdAt ?? prev?.row.created_at ?? iso,
    updated_at: iso,
  };
  const old = new Set((current?.items ?? []).map((i) => i.id));
  const items = value.items.map((it, position) => ({
    id: it.id && old.has(it.id) ? it.id : uuid(),
    stack_id: id,
    supplement_id: it.supplementId,
    amount: it.amount,
    position,
    created_at: iso,
    updated_at: iso,
  }));
  const everSent = Boolean(prev?.sent || prev?.everSent);
  if (onPc || everSent) {
    const keep = new Set(items.map((i) => i.id));
    for (const oldId of old) {
      if (!keep.has(oldId)) local.deleted[`supplement_stack_item:${oldId}`] = { table: "supplement_stack_item", id: oldId, at: iso, sent: false };
    }
  }
  for (const it of items) delete local.deleted[`supplement_stack_item:${it.id}`];
  delete local.deleted[`supplement_stack:${id}`];
  local.stacks[id] = { row, items, everSent, sent: false };
  return row;
}

/**
 * Stack löschen wie `delete_stack`: eingetragene Tage bleiben (ihre Einnahmen verlieren nur den
 * Verweis). Neu am Handy und ungesendet → einfach weg; sonst Löschvermerk.
 */
export function deleteStack(local, id, { onPc = false, now = new Date() } = {}) {
  if (!local.deleted) local.deleted = {};
  const e = local.stacks?.[id];
  const known = onPc || Boolean(e?.sent || e?.everSent);
  if (local.stacks) delete local.stacks[id];
  if (known) local.deleted[`supplement_stack:${id}`] = { table: "supplement_stack", id, at: now.toISOString(), sent: false };
  // Einnahmen am Handy, die auf den Stack verweisen: Verweis entfernen (am PC macht das die Datenbank)
  for (const it of Object.values(local.intakes ?? {})) {
    if (it.row.stack_id === id) {
      it.row = { ...it.row, stack_id: null, updated_at: now.toISOString() };
      it.sent = false;
    }
  }
}
