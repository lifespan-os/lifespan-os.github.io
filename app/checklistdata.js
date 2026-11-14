// LIFESPAN OS Mobil – Checklisten-Bibliothek und Tageshinweise (Restday/Krank) am Handy (1.15.0),
// reine Logik ohne Oberfläche.
//
// Daten vom PC: `checklist`, `checklist_item` und `training_day_status` aus der Exportdatei
// (catalog.pc). Am Handy angelegte oder geänderte Einträge liegen in `local` (id → { row, sent }),
// Löschungen als Löschvermerk („tabelle:id“). Alles geht mit „Körperwerte … senden“ an den PC
// (Abgleich: neuerer Stand gewinnt; Checklisten über den Namen, Tageshinweise über das Datum).
// Regeln wie im Rust-Kern (repo/checklist.rs, repo/day_status.rs).

export const CHECKLIST_COLUMNS = ["id", "name", "source", "archived", "created_at", "updated_at"];
export const ITEM_COLUMNS = ["id", "checklist_id", "position", "text", "done", "created_at", "updated_at"];
export const STATUS_COLUMNS = ["id", "date", "kind", "notes", "created_at", "updated_at"];

export const NAME_MAX = 80;
export const TEXT_MAX = 300;
export const MAX_ITEMS = 500;
export const SOURCES = ["own", "excel", "notes", "text"];
export const STATUS_KINDS = ["rest", "sick"];

const TABLES = { lists: "checklist", items: "checklist_item", status: "training_day_status" };
const COLUMNS = { lists: CHECKLIST_COLUMNS, items: ITEM_COLUMNS, status: STATUS_COLUMNS };

export function emptyChecklistLocal() {
  return { lists: {}, items: {}, status: {}, deleted: {} };
}

export function checklistState(saved) {
  return { ...emptyChecklistLocal(), ...(saved ?? {}) };
}

const pcRows = (catalog, table) => catalog?.pc?.[table] ?? [];
const lower = (s) => String(s).toLocaleLowerCase("de");

function merged(catalog, local, key) {
  const l = checklistState(local);
  const table = TABLES[key];
  const m = new Map();
  for (const r of pcRows(catalog, table)) if (!l.deleted[`${table}:${r.id}`]) m.set(r.id, r);
  for (const e of Object.values(l[key] ?? {})) m.set(e.row.id, e.row);
  return [...m.values()];
}

function put(local, key, row) {
  local[key] ??= {};
  local[key][row.id] = { row: Object.fromEntries(COLUMNS[key].map((c) => [c, row[c] ?? null])), sent: false };
  delete local.deleted[`${TABLES[key]}:${row.id}`];
}

/** Löschen: vom PC oder schon gesendet → Löschvermerk; sonst einfach weg. */
function remove(catalog, local, key, id, iso) {
  local[key] ??= {};
  const own = local[key][id];
  delete local[key][id];
  const table = TABLES[key];
  const onPc = pcRows(catalog, table).some((r) => r.id === id);
  if (onPc || own?.sent) local.deleted[`${table}:${id}`] = { table, id, at: iso, sent: false };
}

function fieldError(field, message) {
  const e = new Error(message);
  e.field = field;
  return e;
}

// ------------------------------------------------------------------ Checklisten

/** Checklisten mit Punkten wie `checklist::list` (nicht archiviert, nach Name). */
export function checklistsOf(catalog, local) {
  const items = merged(catalog, local, "items");
  return merged(catalog, local, "lists")
    .filter((c) => !Number(c.archived))
    .map((c) => ({
      id: c.id,
      name: c.name,
      source: c.source ?? "own",
      items: items
        .filter((i) => i.checklist_id === c.id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((i) => ({ id: i.id, position: i.position ?? 0, text: i.text, done: !!Number(i.done) })),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
}

/** Freier Name wie `unique_name`: „Name“, sonst „Name (2)“ … */
export function uniqueName(catalog, local, base, exceptId = null) {
  let b = [...String(base ?? "").trim()].slice(0, NAME_MAX - 5).join("");
  if (b === "") b = "Checkliste";
  const taken = new Set(merged(catalog, local, "lists").filter((c) => c.id !== exceptId).map((c) => lower(c.name)));
  if (!taken.has(lower(b))) return b;
  for (let n = 2; n < 1000; n += 1) {
    const c = `${b} (${n})`;
    if (!taken.has(lower(c))) return c;
  }
  throw fieldError("name", "Bitte einen anderen Namen wählen.");
}

/**
 * Legt eine Checkliste an oder ersetzt Name und Punkte wie `checklist::save` (vorhandene Punkte
 * behalten ihre ID). Bei `unique = true` (Import) wird ein belegter Name um „(2)“ usw. ergänzt.
 * Rückgabe: ID der Checkliste.
 */
export function saveChecklist(catalog, local, input, unique, { uuid, now = new Date() }) {
  let name = String(input.name ?? "").trim();
  if (name === "") throw fieldError("name", "Bitte einen Namen eingeben.");
  if ([...name].length > NAME_MAX) throw fieldError("name", `Höchstens ${NAME_MAX} Zeichen.`);
  const source = input.source ? String(input.source).trim() || "own" : "own";
  if (!SOURCES.includes(source)) throw fieldError("source", "Unbekannte Herkunft der Checkliste.");
  const list = input.items ?? [];
  if (list.length > MAX_ITEMS) throw fieldError("items", `Eine Checkliste darf höchstens ${MAX_ITEMS} Punkte haben.`);
  const items = list.map((it, i) => {
    const text = String(it.text ?? "").trim();
    if (text === "") throw fieldError(`items.${i}.text`, `Punkt ${i + 1}: Bitte einen Text eingeben.`);
    if ([...text].length > TEXT_MAX) throw fieldError(`items.${i}.text`, `Punkt ${i + 1}: Höchstens ${TEXT_MAX} Zeichen.`);
    return { id: it.id ?? null, text, done: !!it.done };
  });
  const all = merged(catalog, local, "lists");
  if (unique) name = uniqueName(catalog, local, name, input.id ?? null);
  else if (all.some((c) => c.id !== input.id && lower(c.name) === lower(name))) {
    throw fieldError("name", "Eine Checkliste mit diesem Namen gibt es bereits.");
  }
  const iso = now.toISOString();
  let id = input.id;
  if (id) {
    const old = all.find((c) => c.id === id);
    if (!old) throw new Error("Diese Checkliste gibt es nicht mehr.");
    put(local, "lists", { ...old, name, updated_at: iso });
  } else {
    id = uuid();
    put(local, "lists", { id, name, source, archived: 0, created_at: iso, updated_at: iso });
  }
  // Punkte, die nicht mehr vorkommen, entfernen; übrige aktualisieren oder neu anlegen
  const existing = merged(catalog, local, "items").filter((i) => i.checklist_id === id);
  const byId = new Map(existing.map((i) => [i.id, i]));
  const keep = new Set(items.map((i) => i.id).filter(Boolean));
  for (const old of existing) if (!keep.has(old.id)) remove(catalog, local, "items", old.id, iso);
  items.forEach((it, pos) => {
    const old = it.id ? byId.get(it.id) : null;
    if (old) {
      if (old.position !== pos || old.text !== it.text || !!Number(old.done) !== it.done) {
        put(local, "items", { ...old, position: pos, text: it.text, done: it.done ? 1 : 0, updated_at: iso });
      }
    } else {
      put(local, "items", { id: uuid(), checklist_id: id, position: pos, text: it.text, done: it.done ? 1 : 0, created_at: iso, updated_at: iso });
    }
  });
  return id;
}

/** Punkt abhaken oder Haken entfernen wie `set_item_done`. */
export function setItemDone(catalog, local, itemId, done, now = new Date()) {
  const it = merged(catalog, local, "items").find((i) => i.id === itemId);
  if (!it) throw new Error("Diesen Punkt gibt es nicht mehr.");
  put(local, "items", { ...it, done: done ? 1 : 0, updated_at: now.toISOString() });
}

/** Alle Haken einer Checkliste entfernen wie `reset`. */
export function resetChecklist(catalog, local, id, now = new Date()) {
  const iso = now.toISOString();
  for (const it of merged(catalog, local, "items")) {
    if (it.checklist_id === id && Number(it.done)) put(local, "items", { ...it, done: 0, updated_at: iso });
  }
}

/** Checkliste mit ihren Punkten löschen (am PC: Punkte über ON DELETE CASCADE). */
export function deleteChecklist(catalog, local, id, now = new Date()) {
  const iso = now.toISOString();
  for (const it of merged(catalog, local, "items")) if (it.checklist_id === id) remove(catalog, local, "items", it.id, iso);
  remove(catalog, local, "lists", id, iso);
}

// ------------------------------------------------------------------ Tageshinweise (Restday/Krank)

/** Tageshinweise im Zeitraum wie `day_status::list` (nach Datum). */
export function dayStatusOf(catalog, local, from, to) {
  return merged(catalog, local, "status")
    .filter((s) => s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, kind: s.kind, createdAt: s.created_at, updatedAt: s.updated_at }));
}

/** Hinweis setzen (`rest`/`sick`) oder entfernen (`null`) wie `day_status::set` – höchstens einer je Tag. */
export function setDayStatus(catalog, local, date, kind, { uuid, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("Bitte ein gültiges Datum wählen.");
  const iso = now.toISOString();
  const old = merged(catalog, local, "status").find((s) => s.date === date);
  if (!kind) {
    if (old) remove(catalog, local, "status", old.id, iso);
    return;
  }
  if (!STATUS_KINDS.includes(kind)) throw new Error("Unbekannte Angabe für den Tag.");
  put(local, "status", old ? { ...old, kind, updated_at: iso } : { id: uuid(), date, kind, notes: null, created_at: iso, updated_at: iso });
}

// ------------------------------------------------------------------ Übertragung an den PC

export function unsentChecklists(local) {
  if (!local) return 0;
  const l = checklistState(local);
  let n = 0;
  for (const key of Object.keys(TABLES)) n += Object.values(l[key] ?? {}).filter((e) => !e.sent).length;
  return n + Object.values(l.deleted).filter((d) => !d.sent).length;
}

/** Tabellen für die Rückgabedatei: Checklisten, Punkte, Tageshinweise und Löschvermerke. */
export function checklistTables(local, { all = false } = {}) {
  if (!local) return {};
  const l = checklistState(local);
  const out = {};
  for (const [key, table] of Object.entries(TABLES)) {
    const rows = Object.values(l[key] ?? {})
      .filter((e) => all || !e.sent)
      .map((e) => Object.fromEntries(COLUMNS[key].map((c) => [c, e.row[c] ?? null])));
    if (rows.length) out[table] = rows;
  }
  const del = Object.values(l.deleted)
    .filter((d) => all || !d.sent)
    .map((d) => ({ id: `${d.table}:${d.id}`, table_name: d.table, record_id: d.id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

export function markChecklistsSent(local) {
  if (!local) return;
  for (const key of Object.keys(TABLES)) for (const e of Object.values(local[key] ?? {})) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
}

/** Nach neuen Daten vom PC: Übertragenes, das der PC (mindestens so neu) hat, entfällt. */
export function pruneChecklists(catalog, local) {
  const l = checklistState(local);
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
  return l;
}
