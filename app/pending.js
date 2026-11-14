// LIFESPAN OS Mobil – Offene Daten (1.18.0): alles, was am Handy erfasst oder geändert und noch
// nicht an den PC gesendet ist, ansehen, im passenden Bereich bearbeiten oder verwerfen.
//
// Reine Logik ohne Oberfläche. Grundlage sind die Ablagen der einzelnen Bereiche, so wie sie auch in
// die Rückgabedateien gehen (Zeilen `{ row, sent }` und Löschvermerke). Zusammengehörige Zeilen
// (z. B. ein Trainingsplan mit Tagen und Sätzen, eine Blutabnahme mit ihren Werten, eine Checkliste
// mit ihren Punkten) erscheinen als ein Eintrag und werden nur gemeinsam verworfen.
//
// Verwerfen heißt: Die Änderung am Handy entfällt, es gilt wieder der Stand vom PC. Ein am Handy
// neu angelegter Eintrag verschwindet; ein Löschvermerk entfällt, der Eintrag ist wieder da.

/** Ablagen der Bereiche: Teil im Zustand, Gruppen `{ schlüssel: tabelle }`, Tabelle der Löschvermerke ohne eigene Angabe. */
export const SOURCES = [
  { store: "logs", area: "sleep", maps: { sleep: "sleep_log", naps: "sleep_nap", recovery: "recovery_log" } },
  { store: "todos", area: "checklists", maps: { rows: "todo" }, delTable: "todo" },
  { store: "checklists", area: "checklists", maps: { lists: "checklist", items: "checklist_item", status: "training_day_status" } },
  { store: "train", area: "training", nested: true },
  { store: "water", area: "nutrition", maps: { rows: "water_intake" }, delTable: "water_intake" },
  { store: "body", area: "body", maps: { entries: "body_measurement" } },
  { store: "health", area: "health", maps: { analytes: "lab_analyte", draws: "lab_draw", results: "lab_result", lifetime: "lifetime_record" } },
  { store: "super", area: "superhuman", maps: { entries: "hrt_entry", products: "hrt_product", substances: "protocol_substance", protocol: "protocol_entry" } },
  { store: "caffeine", area: "icoach", maps: { rows: "caffeine_intake" }, delTable: "caffeine_intake" },
];

/** Bereiche in der Reihenfolge des Menüs. */
export const AREAS = [
  ["training", "Training"],
  ["nutrition", "Nutrition"],
  ["checklists", "Checklisten"],
  ["sleep", "Sleep & Recovery"],
  ["body", "Body & Longevity"],
  ["health", "Health"],
  ["superhuman", "Superhuman"],
  ["icoach", "iCoach.me – Koffein"],
];

export const TABLE_LABELS = {
  sleep_log: "Schlaf",
  sleep_nap: "Nickerchen",
  recovery_log: "Regeneration",
  todo: "To-do",
  checklist: "Checkliste",
  checklist_item: "Punkt",
  training_day_status: "Tageshinweis",
  exercise: "Übung",
  sport: "Sportart",
  neat_day: "NEAT",
  training_plan: "Trainingsplan",
  training_plan_day: "Trainingstag",
  training_plan_exercise: "Übung im Plan",
  training_plan_set: "Satz",
  training_plan_slot: "Termin",
  checkin_photo: "Check-In-Foto",
  water_intake: "Wasser",
  body_measurement: "Körperwert",
  lab_analyte: "Laborparameter",
  lab_draw: "Blutabnahme",
  lab_result: "Laborwert",
  lifetime_record: "Once in a Lifetime",
  hrt_entry: "HRT-Eintrag",
  hrt_product: "HRT-Präparat",
  protocol_substance: "Substanz",
  protocol_entry: "Protokolleintrag",
  caffeine_intake: "Koffein",
};

/** Mehrzahl für die Zusammenfassung einer Gruppe. */
const PLURAL = {
  training_plan_day: "Trainingstage",
  training_plan_exercise: "Übungen",
  training_plan_set: "Sätze",
  training_plan_slot: "Termine",
  checklist_item: "Punkte",
  lab_result: "Laborwerte",
};

/** Verweis auf den übergeordneten Eintrag: Spalte und Tabelle. */
export const PARENT = {
  training_plan_day: ["plan_id", "training_plan"],
  training_plan_exercise: ["plan_day_id", "training_plan_day"],
  training_plan_set: ["plan_exercise_id", "training_plan_exercise"],
  training_plan_slot: ["plan_day_id", "training_plan_day"],
  checklist_item: ["checklist_id", "checklist"],
  lab_result: ["draw_id", "lab_draw"],
};

const FIELD_LABELS = {
  date: "Datum",
  time: "Uhrzeit",
  name: "Name",
  text: "Text",
  notes: "Notiz",
  description: "Beschreibung",
  category: "Kategorie",
  value: "Wert",
  unit: "Einheit",
  method: "Methode",
  metric_id: "Messgröße",
  bed_time: "Ins Bett",
  wake_time: "Aufgestanden",
  sleep_min: "Schlaf (min)",
  start_time: "Beginn",
  end_time: "Ende",
  readiness: "Bereitschaft",
  fatigue: "Müdigkeit",
  soreness: "Muskelkater",
  stress: "Stress",
  done: "Erledigt",
  checklist_id: "Checkliste",
  kind: "Art",
  archived: "Archiviert",
  steps: "Schritte",
  standing_min: "Stehen (min)",
  cleaning_min: "Putzen (min)",
  gardening_min: "Gartenarbeit (min)",
  fidgeting_min: "Zappeln (min)",
  office_min: "Büro (min)",
  physical_min: "Körperliche Arbeit (min)",
  other_min: "Sonstiges (min)",
  other_label: "Sonstiges",
  plan_id: "Plan",
  plan_day_id: "Trainingstag",
  plan_exercise_id: "Übung im Plan",
  exercise_id: "Übung",
  machine_id: "Maschine",
  sport_id: "Sportart",
  target_sets: "Sätze",
  rest_seconds: "Pause (s)",
  reps: "Wiederholungen",
  weight_kg: "Gewicht (kg)",
  is_warmup: "Aufwärmsatz",
  weekday: "Wochentag",
  muscle_group: "Muskelgruppe",
  cardio_kind: "Cardio-Art",
  equipment: "Ausrüstung",
  discipline: "Disziplin",
  pose: "Pose",
  ml: "Menge (ml)",
  mg: "Koffein (mg)",
  label: "Bezeichnung",
  in_water: "Zählt als Wasser",
  drink_id: "Getränk",
  lab: "Labor",
  fasting: "Nüchtern",
  draw_id: "Blutabnahme",
  analyte_id: "Parameter",
  ref_low: "Referenz von",
  ref_high: "Referenz bis",
  measurand: "Messgröße",
  source: "Quelle",
  hormone: "Hormon",
  manufacturer: "Hersteller",
  batch: "Charge",
  expiry_date: "Haltbar bis",
  vial_volume_ml: "Ampulle (ml)",
  concentration_mg_ml: "Konzentration (mg/ml)",
  substance_id: "Substanz",
  amount: "Menge",
  route: "Gabe",
  site: "Stelle",
  default_route: "Übliche Gabe",
};

const HIDDEN = new Set(["id", "created_at", "updated_at", "position", "builtin", "image_data", "thumb_data", "image_key", "mime", "width", "height", "resistance_profiles"]);
const BOOLEAN = new Set(["done", "archived", "is_warmup", "fasting", "in_water"]);
const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const DAY_KINDS = { rest: "Restday", sick: "Krankheit" };

const fmtDate = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso ?? "")) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const fmtNum = (v) => (typeof v === "number" ? v.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : String(v));

// ------------------------------------------------------------------ Zugriff auf die Ablagen

/** Ablage eines Bereichs im Zustand der App (Körperwerte und Ernährung liegen eine Ebene tiefer). */
export function localOf(st, store) {
  if (store === "body") return st.body?.local ?? null;
  if (store === "nutrition") return st.food?.local ?? null;
  return st[store] ?? null;
}

/** Zeilen vom PC (Export) einer Tabelle. */
export function pcRows(st, table) {
  const raw = st.catalogRaw ?? st.catalog;
  if (table === "exercise") return raw?.exercises ?? [];
  if (table === "sport") return raw?.sports ?? [];
  if (table === "body_measurement") return raw?.body?.measurements ?? [];
  return raw?.pc?.[table] ?? [];
}

/** Löschvermerk → Tabelle und ID (die Bereiche legen ihn unterschiedlich ab). */
function delTarget(src, key, d) {
  if (d?.table && d?.id) return { table: d.table, id: d.id };
  const i = key.indexOf(":");
  if (i > 0) return { table: key.slice(0, i), id: key.slice(i + 1) };
  return { table: src.delTable, id: key };
}

/**
 * Alle offenen Teile (Zeilen und Löschvermerke) als flache Liste:
 * `{ store, area, op: "row"|"del", table, id, row, path }` – `path` zeigt auf den Eintrag in der Ablage.
 */
export function pendingUnits(st) {
  const out = [];
  for (const src of SOURCES) {
    const local = localOf(st, src.store);
    if (!local) continue;
    if (src.nested) {
      for (const [table, map] of Object.entries(local.rows ?? {}))
        for (const [id, e] of Object.entries(map ?? {})) if (!e.sent) out.push({ store: src.store, area: src.area, op: "row", table, id, row: e.row, path: ["rows", table, id] });
    } else {
      for (const [key, table] of Object.entries(src.maps))
        for (const [id, e] of Object.entries(local[key] ?? {})) if (e && !e.sent) out.push({ store: src.store, area: src.area, op: "row", table, id: e.row?.id ?? id, row: e.row, path: [key, id] });
    }
    for (const [key, d] of Object.entries(local.deleted ?? {})) {
      if (d.sent) continue;
      const t = delTarget(src, key, d);
      out.push({ store: src.store, area: src.area, op: "del", table: t.table, id: t.id, row: null, path: ["deleted", key] });
    }
  }
  return out;
}

// ------------------------------------------------------------------ Namen und Beschreibung

/** ID → Name aus allem, was die App kennt (für Verweise wie Übung, Messgröße, Substanz). */
export function nameIndex(st, units = pendingUnits(st)) {
  const m = new Map();
  const add = (r) => {
    if (!r?.id) return;
    const n = r.name ?? r.label ?? r.text ?? (r.hormone ? [r.hormone, r.manufacturer].filter(Boolean).join(" ") : null);
    if (n && !m.has(r.id)) m.set(r.id, String(n));
  };
  for (const u of units) add(u.row);
  const raw = st.catalogRaw ?? st.catalog;
  for (const list of Object.values(raw?.pc ?? {})) if (Array.isArray(list)) list.forEach(add);
  (raw?.exercises ?? []).forEach(add);
  (raw?.sports ?? []).forEach(add);
  (raw?.machines ?? []).forEach(add);
  (raw?.body?.metrics ?? []).forEach(add);
  (raw?.nutrition?.foods ?? []).forEach(add);
  for (const e of st.localExercises ?? []) add(e);
  return m;
}

/** Feld lesbar: Ja/Nein, Datum, Verweis als Name, Wochentag. */
export function fieldValue(col, v, names) {
  if (v === null || v === undefined || v === "") return "–";
  if (BOOLEAN.has(col)) return v === true || v === 1 || v === "1" ? "Ja" : "Nein";
  if (col === "weekday" && Number.isInteger(Number(v))) return WEEKDAYS[Number(v) % 7] ?? String(v);
  if (col === "kind" && DAY_KINDS[v]) return DAY_KINDS[v];
  if ((col === "date" || col.endsWith("_date")) && fmtDate(v)) return fmtDate(v);
  if (col.endsWith("_id") && names.has(v)) return names.get(v);
  if (col.endsWith("_id")) return "(Verweis)";
  return fmtNum(v);
}

/** Sichtbare Felder einer Zeile mit deutscher Bezeichnung. */
export function fieldsOf(row, names) {
  if (!row) return [];
  const out = [];
  for (const [col, v] of Object.entries(row)) {
    if (HIDDEN.has(col)) continue;
    if (v === null || v === undefined || v === "") continue;
    out.push([FIELD_LABELS[col] ?? col.replace(/_/g, " "), fieldValue(col, v, names)]);
  }
  if (row.image_data || row.thumb_data) out.push(["Bild", "vorhanden"]);
  return out;
}

/** Überschrift eines Eintrags. */
export function titleOf(table, row, names) {
  const label = TABLE_LABELS[table] ?? table;
  if (!row) return label;
  const n = (id) => names.get(id) ?? "";
  switch (table) {
    case "todo":
    case "checklist_item":
      return row.text ?? label;
    case "training_day_status":
      return DAY_KINDS[row.kind] ?? label;
    case "lab_result":
      return `${n(row.analyte_id) || label}: ${fmtNum(row.value ?? "")}`.trim();
    case "protocol_entry":
      return `${n(row.substance_id) || "Substanz"} ${row.amount !== null && row.amount !== undefined ? fmtNum(row.amount) : ""}`.trim();
    case "body_measurement":
      return `${n(row.metric_id) || label}: ${fmtNum(row.value ?? "")}`;
    case "water_intake":
      return `Wasser ${row.ml ? `${fmtNum(row.ml)} ml` : ""}`.trim();
    case "caffeine_intake":
      return `${row.label ?? "Koffein"}${row.mg ? ` · ${fmtNum(row.mg)} mg` : ""}`;
    case "hrt_product":
      return [row.hormone, row.manufacturer].filter(Boolean).join(" ") || label;
    case "neat_day":
      return `NEAT${row.steps ? ` · ${fmtNum(row.steps)} Schritte` : ""}`;
    case "checkin_photo":
      return `Check-In${row.pose ? ` (${row.pose})` : ""}`;
    case "training_plan_set":
      return `Satz: ${row.reps ?? "–"} × ${row.weight_kg ?? "–"} kg`;
    default:
      return row.name ?? label;
  }
}

// ------------------------------------------------------------------ Gruppen

/** Wohin „Bearbeiten“ führt: Ansicht, Zustand, vorhandene Aktion des Bereichs. */
export function editTarget(table, row) {
  if (!row) return null;
  const id = row.id;
  switch (table) {
    case "sleep_log":
      return { view: "sleep", act: "sleep-edit", arg: id };
    case "sleep_nap":
      return { view: "sleep", act: "nap-edit", arg: id };
    case "recovery_log":
      return { view: "recovery", act: "rec-edit", arg: id };
    case "todo":
      return { view: "todos", set: { todoDate: row.date }, act: "todo-edit", arg: id };
    case "checklist":
      return { view: "todos", act: "cl-edit", arg: id };
    case "training_day_status":
      return { view: "training", set: { trainTab: "workouts" } };
    case "exercise":
      return { view: "training", set: { trainTab: "exercises" }, act: "train-ex-edit", arg: id };
    case "sport":
      return { view: "training", set: { trainTab: "exercises" }, act: "train-sport-edit", arg: id };
    case "neat_day":
      return { view: "training", set: { trainTab: "neat", trainNeatDate: row.date, trainNeatDraft: null } };
    case "training_plan":
      return { view: "training", set: { trainTab: "plans" }, act: "plan-edit", arg: id };
    case "checkin_photo":
      return { view: "training", set: { trainTab: "checkins" }, act: "train-checkin-edit", arg: id };
    case "water_intake":
      return { view: "diary", set: { diaryDate: row.date } };
    case "body_measurement":
      return { view: "body-metric", viewArg: row.metric_id, act: "body-edit", arg: id };
    case "lab_draw":
      return { view: "health", set: { healthTab: "draws" }, act: "lab-edit", arg: id };
    case "lab_analyte":
      return { view: "health", set: { healthTab: "analytes" }, act: "an-edit", arg: id };
    case "lifetime_record":
      return { view: "health", set: { healthTab: "lifetime" }, act: "life-edit", arg: id };
    case "hrt_entry":
      return { view: "super", set: { superTab: "hrt" }, act: "hrt-edit", arg: id };
    case "hrt_product":
      return { view: "super", set: { superTab: "hrt" } };
    case "protocol_substance":
      return { view: "super", set: { superTab: "substances" }, act: "sub-edit", arg: id };
    case "protocol_entry":
      return { view: "super", set: { superTab: "log" }, act: "proto-edit", arg: id };
    case "caffeine_intake":
      return { view: "icoach", set: { icTab: "widgets" } };
    default:
      return null;
  }
}

/** Zeile einer Tabelle: zuerst die Fassung am Handy, sonst die vom PC. */
function rowFinder(st, units) {
  const local = new Map(units.filter((u) => u.op === "row").map((u) => [`${u.table}:${u.id}`, u.row]));
  const cache = new Map();
  return (table, id) => {
    const k = `${table}:${id}`;
    if (local.has(k)) return local.get(k);
    if (!cache.has(table)) cache.set(table, new Map(pcRows(st, table).map((r) => [r.id, r])));
    return cache.get(table).get(id) ?? null;
  };
}

/** Ist die Zeile schon am PC? (Körperwerte: gleiche Messgröße und gleicher Tag.) */
function onPc(st, table, row, id) {
  if (table === "body_measurement" && row) return pcRows(st, table).some((r) => r.metric_id === row.metric_id && r.date === row.date);
  return pcRows(st, table).some((r) => r.id === id);
}

/**
 * Offene Einträge, je Wurzel zusammengefasst:
 * `{ key, area, table, id, title, date, status, parts, units, edit, names }`.
 * `status`: „Neu“, „Geändert“ oder „Löschung“.
 */
export function pendingItems(st) {
  const units = pendingUnits(st);
  const names = nameIndex(st, units);
  const find = rowFinder(st, units);
  const groups = new Map();
  for (const u of units) {
    let table = u.table;
    let id = u.id;
    for (let guard = 0; guard < 6 && PARENT[table]; guard += 1) {
      const row = find(table, id);
      const [col, parent] = PARENT[table];
      if (!row?.[col]) break;
      table = parent;
      id = row[col];
    }
    const key = `${u.store}|${table}|${id}`;
    // Restday/Krankheit liegen bei den Checklisten, gehören aber zum Training (wie am PC)
    const area = table === "training_day_status" ? "training" : u.area;
    if (!groups.has(key)) groups.set(key, { key, store: u.store, area, table, id, units: [] });
    groups.get(key).units.push(u);
  }
  const items = [];
  for (const g of groups.values()) {
    const rootUnit = g.units.find((u) => u.table === g.table && u.id === g.id) ?? null;
    const row = rootUnit?.row ?? find(g.table, g.id);
    const status = rootUnit?.op === "del" ? "Löschung" : rootUnit && !onPc(st, g.table, rootUnit.row, g.id) ? "Neu" : "Geändert";
    const counts = new Map();
    for (const u of g.units) {
      if (u === rootUnit) continue;
      const k = `${u.table}|${u.op}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const listOf = (op) =>
      [...counts.entries()]
        .filter(([k]) => k.endsWith(`|${op}`))
        .map(([k, n]) => {
          const t = k.split("|")[0];
          return `${n} ${n === 1 ? TABLE_LABELS[t] ?? t : PLURAL[t] ?? TABLE_LABELS[t] ?? t}`;
        })
        .join(", ");
    const parts = [listOf("row") ? `geändert: ${listOf("row")}` : "", listOf("del") ? `entfernt: ${listOf("del")}` : ""].filter(Boolean);
    const date = row?.date ?? null;
    items.push({
      key: g.key,
      store: g.store,
      area: g.area,
      table: g.table,
      id: g.id,
      title: titleOf(g.table, row, names),
      label: TABLE_LABELS[g.table] ?? g.table,
      date,
      status,
      parts,
      units: g.units,
      row,
      edit: status === "Löschung" ? null : editTarget(g.table, row),
      fields: fieldsOf(row, names),
      details: g.units
        .filter((u) => u !== rootUnit)
        .map((u) => ({ label: TABLE_LABELS[u.table] ?? u.table, title: u.op === "del" ? titleOf(u.table, find(u.table, u.id), names) : titleOf(u.table, u.row, names), op: u.op, fields: u.op === "del" ? [] : fieldsOf(u.row, names) })),
    });
  }
  // Einzelne Einstellungen ohne Zeile
  const sup = localOf(st, "super");
  if (sup?.checklist && !sup.checklist.sent)
    items.push({ key: "super|settings|checklist", store: "super", area: "superhuman", table: "settings", id: "checklist", title: "Checkliste Injektion", label: "Einstellung", date: null, status: "Geändert", parts: [], units: [], special: "super-checklist", edit: { view: "super", set: { superTab: "checklist" } }, fields: [], details: [] });
  const water = localOf(st, "water");
  if (water?.glass && !water.glass.sent)
    items.push({ key: "water|settings|glass", store: "water", area: "nutrition", table: "settings", id: "glass", title: `Glasgröße ${fmtNum(water.glass.ml / 1000)} l`, label: "Einstellung", date: null, status: "Geändert", parts: [], units: [], special: "water-glass", edit: { view: "diary" }, fields: [], details: [] });
  return items.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || a.title.localeCompare(b.title, "de"));
}

// ------------------------------------------------------------------ Verwerfen

const getIn = (obj, path) => path.reduce((o, k) => (o == null ? o : o[k]), obj);

/**
 * Wird eine am Handy neu angelegte Zeile noch von etwas anderem Offenen verwendet? Dann darf sie
 * nicht allein verworfen werden (der PC könnte die Datei sonst nicht übernehmen).
 */
export function usedElsewhere(st, item, allItems = pendingItems(st)) {
  const newIds = item.units.filter((u) => u.op === "row" && !onPc(st, u.table, u.row, u.id)).map((u) => u.id);
  if (!newIds.length) return null;
  for (const other of allItems) {
    if (other.key === item.key) continue;
    const text = JSON.stringify(other.units.map((u) => u.row));
    if (newIds.some((id) => text.includes(`"${id}"`))) return other;
  }
  const workouts = JSON.stringify((st.workouts ?? []).filter((w) => w.status === "done" && !w.exported));
  if (newIds.some((id) => workouts.includes(`"${id}"`))) return { title: "einem offenen Training", label: "Training" };
  const food = localOf(st, "nutrition");
  if (food && newIds.some((id) => JSON.stringify(food).includes(`"${id}"`))) return { title: "einem Ernährungseintrag", label: "Nutrition" };
  return null;
}

/**
 * Eintrag verwerfen (alle Teile der Gruppe). Gibt die Namen der geänderten Ablagen zurück.
 * Wirft einen Fehler, wenn eine neue Zeile noch anderswo verwendet wird.
 */
export function discardItem(st, item, allItems = pendingItems(st)) {
  if (item.special === "super-checklist") {
    localOf(st, "super").checklist = null;
    return ["super"];
  }
  if (item.special === "water-glass") {
    localOf(st, "water").glass = null;
    return ["water"];
  }
  const user = usedElsewhere(st, item, allItems);
  if (user) throw new Error(`„${item.title}“ wird noch in ${user.label === "Training" || user.label === "Nutrition" ? user.title : `„${user.title}“ (${user.label})`} verwendet – zuerst das verwerfen.`);
  const stores = new Set();
  for (const u of item.units) {
    const local = localOf(st, u.store);
    const parent = getIn(local, u.path.slice(0, -1));
    if (parent && u.path.at(-1) in parent) delete parent[u.path.at(-1)];
    if (u.store === "train" && parent && !Object.keys(parent).length) delete local.rows[u.table];
    stores.add(u.store);
  }
  return [...stores];
}

/** Anzahl offener Einträge je Bereich (Gruppen, nicht einzelne Zeilen). */
export function countByArea(items) {
  const m = new Map();
  for (const it of items) m.set(it.area, (m.get(it.area) ?? 0) + 1);
  return m;
}
