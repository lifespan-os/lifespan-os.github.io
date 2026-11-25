// LIFESPAN OS Mobil – To-dos am Handy (1.9.0), reine Logik ohne Oberfläche.
//
// Daten vom PC: Tabelle `todo` aus der Exportdatei (catalog.pc). Am Handy angelegte oder
// geänderte To-dos liegen in `local.rows` (id → { row, sent }), Löschungen als Löschvermerk.
// Sie gehen mit „Körperwerte … senden“ an den PC (Abgleich: neuerer Stand gewinnt).
// Regeln wie im Rust-Kern (checklist.rs): Text 1–300 Zeichen, neue To-dos ans Ende der Liste,
// gleiche Texte am selben Tag werden beim Eintragen auf mehrere Tage übersprungen.

export const TODO_COLUMNS = ["id", "date", "position", "text", "done", "checklist_id", "list_id", "created_at", "updated_at"];
// Eigene To-do-Listen (1.156.0, PC Schema 79): höchstens 3, offene Punkte wandern automatisch auf heute.
export const LIST_COLUMNS = ["id", "name", "position", "created_at", "updated_at"];
export const MAX_TODO_LISTS = 3;
export const LIST_NAME_MAX_CHARS = 40;
export const CARRY_FORWARD_DAYS = 7;
const LIST_DEL = (id) => `todo_list:${id}`;
export const TEXT_MAX_CHARS = 300;
export const MAX_TODO_DATES = 400;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function emptyTodosLocal() {
  return { rows: {}, lists: {}, deleted: {} };
}

export function todosState(saved) {
  return { ...emptyTodosLocal(), ...(saved ?? {}) };
}

/** Alle To-dos (PC und Handy zusammengeführt, Löschungen ausgeblendet). */
export function allTodos(catalog, local) {
  const l = todosState(local);
  const m = new Map();
  for (const r of catalog?.pc?.todo ?? []) if (!l.deleted[r.id]) m.set(r.id, r);
  for (const e of Object.values(l.rows)) m.set(e.row.id, e.row);
  return [...m.values()];
}

/** Gehört das To-do zu einer eigenen Liste (sonst: To-dos des Tages)? */
export const listOf = (t) => t.list_id ?? null;

/** Eigene Listen (PC und Handy) nach Reihenfolge wie `todo_lists`. */
export function todoLists(catalog, local) {
  const l = todosState(local);
  const m = new Map();
  for (const r of catalog?.pc?.todo_list ?? []) if (!l.deleted[LIST_DEL(r.id)]) m.set(r.id, r);
  for (const e of Object.values(l.lists)) m.set(e.row.id, e.row);
  return [...m.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || cmp(a.created_at, b.created_at) || cmp(a.name, b.name));
}

/** Liste anlegen (`id` leer, höchstens 3) oder umbenennen wie `save_todo_list`; Namen eindeutig. */
export function saveList(catalog, local, id, name, { uuid, now = new Date() }) {
  const n = String(name ?? "").trim();
  if (n === "") throw new Error("Bitte einen Namen für die Liste eingeben.");
  if ([...n].length > LIST_NAME_MAX_CHARS) throw new Error(`Höchstens ${LIST_NAME_MAX_CHARS} Zeichen.`);
  const lists = todoLists(catalog, local);
  if (lists.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) throw new Error("Eine Liste mit diesem Namen gibt es schon.");
  const iso = now.toISOString();
  if (id) {
    const old = lists.find((x) => x.id === id);
    if (!old) throw new Error("Diese Liste gibt es nicht mehr.");
    local.lists[id] = { row: { ...old, name: n, updated_at: iso }, sent: false };
    return id;
  }
  if (lists.length >= MAX_TODO_LISTS) throw new Error(`Es sind höchstens ${MAX_TODO_LISTS} Listen möglich.`);
  const position = lists.length ? Math.max(...lists.map((x) => (x.position ?? 0) + 1)) : 0;
  const row = { id: uuid(), name: n, position, created_at: iso, updated_at: iso };
  local.lists[row.id] = { row, sent: false };
  delete local.deleted[LIST_DEL(row.id)];
  return row.id;
}

/** Liste samt ihrer Punkte (an allen Tagen) löschen wie `delete_todo_list`. */
export function deleteList(catalog, local, id, now = new Date()) {
  for (const t of allTodos(catalog, local).filter((x) => listOf(x) === id)) deleteTodo(catalog, local, t.id, now);
  const own = local.lists[id];
  delete local.lists[id];
  const onPc = (catalog?.pc?.todo_list ?? []).some((r) => r.id === id);
  if (onPc || (own && own.sent)) local.deleted[LIST_DEL(id)] = { at: now.toISOString(), sent: false, table: "todo_list", id };
}

/** To-dos eines Tages wie `todos_for_date` (nach Reihenfolge, dann Anlegezeit). */
/** Erledigt (0/1, true/false) als Zahl für die Sortierung */
const doneRank = (t) => (t.done && Number(t.done) !== 0 ? 1 : 0);

/** To-dos eines Tages: offene zuerst, Erledigte unten (1.145.0, wie checklist.rs ORDER BY done, position). */
export function todosFor(catalog, local, date, listId) {
  return allTodos(catalog, local)
    .filter((t) => t.date === date && (listId === undefined || listOf(t) === listId))
    .sort((a, b) => doneRank(a) - doneRank(b) || (a.position ?? 0) - (b.position ?? 0) || cmp(a.created_at, b.created_at));
}

/** Offene und alle To-dos je Tag im Zeitraum wie `open_counts`. */
export function openCounts(catalog, local, from, to) {
  const m = new Map();
  for (const t of allTodos(catalog, local)) {
    if (t.date < from || t.date > to) continue;
    const c = m.get(t.date) ?? { date: t.date, open: 0, total: 0 };
    c.total += 1;
    if (!t.done) c.open += 1;
    m.set(t.date, c);
  }
  return [...m.values()].sort((a, b) => cmp(a.date, b.date));
}

function checkText(text) {
  const t = String(text ?? "").trim();
  if (t === "") throw new Error("Bitte eine Aufgabe eingeben.");
  if ([...t].length > TEXT_MAX_CHARS) throw new Error(`Höchstens ${TEXT_MAX_CHARS} Zeichen.`);
  return t;
}

function put(local, row) {
  local.rows[row.id] = { row, sent: false };
  delete local.deleted[row.id];
}

const nextPosition = (catalog, local, date) => {
  const day = todosFor(catalog, local, date);
  return day.length ? Math.max(...day.map((t) => t.position ?? 0)) + 1 : 0;
};

function insert(catalog, local, date, text, { uuid, now, checklistId = null, listId = null }) {
  const position = nextPosition(catalog, local, date);
  const iso = now.toISOString();
  put(local, { id: uuid(), date, position, text, done: 0, checklist_id: checklistId, list_id: listId, created_at: iso, updated_at: iso });
}

/** Neues To-do am Ende der Liste des Tages wie `add_todo`. */
export function addTodo(catalog, local, date, text, { uuid, now = new Date(), listId = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("Bitte ein gültiges Datum wählen.");
  if (listId && !todoLists(catalog, local).some((x) => x.id === listId)) throw new Error("Diese Liste gibt es nicht mehr.");
  insert(catalog, local, date, checkText(text), { uuid, now, listId });
}

/** Dieselbe Aufgabe an mehreren Tagen wie `add_todo_dates`; gleiche Texte werden übersprungen. */
export function addTodoDates(catalog, local, dates, text, { uuid, now = new Date() }) {
  const t = checkText(text);
  const list = [...new Set(dates)];
  if (!list.length) throw new Error("Bitte mindestens einen Tag wählen.");
  if (list.length > MAX_TODO_DATES) throw new Error(`Bitte höchstens ${MAX_TODO_DATES} Tage auf einmal wählen.`);
  let added = 0;
  let skipped = 0;
  for (const d of list) {
    if (todosFor(catalog, local, d, null).some((x) => x.text.toLowerCase() === t.toLowerCase())) skipped += 1;
    else {
      insert(catalog, local, d, t, { uuid, now });
      added += 1;
    }
  }
  return { added, skipped };
}

function find(catalog, local, id) {
  const t = allTodos(catalog, local).find((x) => x.id === id);
  if (!t) throw new Error("Dieses To-do gibt es nicht mehr.");
  return t;
}

/** Text und/oder Haken ändern wie `update_todo`. */
export function updateTodo(catalog, local, id, { text, done }, now = new Date()) {
  const t = { ...find(catalog, local, id) };
  if (text !== undefined) t.text = checkText(text);
  if (done !== undefined) t.done = done ? 1 : 0;
  t.updated_at = now.toISOString();
  put(local, t);
}

/** Um eine Stelle nach oben (−1) oder unten (1) wie `move_todo` (Positionen neu durchgezählt). */
export function moveTodo(catalog, local, id, step, now = new Date()) {
  const t = find(catalog, local, id);
  const list = todosFor(catalog, local, t.date, listOf(t));
  const i = list.findIndex((x) => x.id === id);
  const j = i + Math.sign(step);
  if (!step || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const iso = now.toISOString();
  list.forEach((x, pos) => {
    if ((x.position ?? 0) !== pos) put(local, { ...x, position: pos, updated_at: iso });
  });
}

/** Löschen: vom PC oder schon gesendet → Löschvermerk; sonst einfach weg. */
export function deleteTodo(catalog, local, id, now = new Date()) {
  const own = local.rows[id];
  delete local.rows[id];
  const onPc = (catalog?.pc?.todo ?? []).some((r) => r.id === id);
  if (onPc || (own && own.sent)) local.deleted[id] = { at: now.toISOString(), sent: false };
}

/** Alle erledigten To-dos eines Tages entfernen wie `clear_done`. */
export function clearDone(catalog, local, date, now = new Date(), listId = null) {
  const done = todosFor(catalog, local, date, listId).filter((t) => Number(t.done));
  for (const t of done) deleteTodo(catalog, local, t.id, now);
  return done.length;
}

/** Offene To-dos von `from` nach `to` kopieren wie `carry_over` (gleiche Texte übersprungen). */
export function carryOver(catalog, local, from, to, { uuid, now = new Date() }) {
  const existing = new Set(todosFor(catalog, local, to, null).map((t) => t.text.toLowerCase()));
  let added = 0;
  for (const t of todosFor(catalog, local, from, null).filter((x) => !x.done)) {
    if (existing.has(t.text.toLowerCase())) continue;
    insert(catalog, local, to, t.text, { uuid, now, checklistId: t.checklist_id ?? null });
    existing.add(t.text.toLowerCase());
    added += 1;
  }
  return added;
}

/** Datum `iso` (JJJJ-MM-TT) um `days` Tage verschieben (UTC-Rechnung, nur Kalendertage). */
function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Offene To-dos der letzten 7 Tage wandern auf `today` wie `carry_forward` (Tag und Listen).
 * Steht dieselbe Aufgabe (Text, Liste) heute schon da, entfällt der alte Eintrag.
 * Rückgabe: Anzahl geänderter Einträge (verschoben + entfallen), 0 = nichts zu speichern.
 */
export function carryForward(catalog, local, today, now = new Date()) {
  if (!local || !/^\d{4}-\d{2}-\d{2}$/.test(today ?? "")) return 0;
  const from = shiftDate(today, -CARRY_FORWARD_DAYS);
  const open = allTodos(catalog, local)
    .filter((t) => !Number(t.done) && t.date < today && t.date >= from)
    .sort((a, b) => cmp(a.date, b.date) || (a.position ?? 0) - (b.position ?? 0) || cmp(a.created_at, b.created_at));
  if (!open.length) return 0;
  const iso = now.toISOString();
  for (const t of open) {
    const dup = todosFor(catalog, local, today).some((x) => x.text.toLowerCase() === t.text.toLowerCase() && listOf(x) === listOf(t));
    if (dup) deleteTodo(catalog, local, t.id, now);
    else put(local, { ...t, date: today, position: nextPosition(catalog, local, today), updated_at: iso });
  }
  return open.length;
}

/**
 * Punkte einer Checkliste als To-dos eines Tages wie `add_from_checklist` (Texte, die es an dem
 * Tag schon gibt, werden übersprungen). `items` = Punkte der Checkliste. Rückgabe: Anzahl neu.
 */
export function addFromChecklist(catalog, local, date, checklistId, items, onlyOpen, { uuid, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("Bitte ein gültiges Datum wählen.");
  const existing = new Set(todosFor(catalog, local, date, null).map((t) => t.text.toLowerCase()));
  let added = 0;
  for (const it of items) {
    if (onlyOpen && it.done) continue;
    if (existing.has(it.text.toLowerCase())) continue;
    insert(catalog, local, date, it.text, { uuid, now, checklistId });
    added += 1;
  }
  return added;
}

export function unsentTodos(local) {
  if (!local) return 0;
  const l = todosState(local);
  return Object.values(l.rows).filter((e) => !e.sent).length + Object.values(l.lists).filter((e) => !e.sent).length + Object.values(l.deleted).filter((d) => !d.sent).length;
}

/** Tabellen für die Rückgabedatei: `todo` und Löschvermerke. */
export function todoTables(local, { all = false } = {}) {
  if (!local) return {};
  const l = todosState(local);
  const out = {};
  const rows = Object.values(l.rows)
    .filter((e) => all || !e.sent)
    .map((e) => Object.fromEntries(TODO_COLUMNS.map((c) => [c, e.row[c] ?? null])));
  if (rows.length) out.todo = rows;
  const lists = Object.values(l.lists)
    .filter((e) => all || !e.sent)
    .map((e) => Object.fromEntries(LIST_COLUMNS.map((c) => [c, e.row[c] ?? null])));
  if (lists.length) out.todo_list = lists;
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([key, d]) => {
      const table = d.table ?? "todo";
      const id = d.id ?? key;
      return { id: `${table}:${id}`, table_name: table, record_id: id, deleted_at: d.at };
    });
  if (del.length) out.deleted_record = del;
  return out;
}

export function markTodosSent(local) {
  if (!local) return;
  for (const e of Object.values(local.rows ?? {})) e.sent = true;
  for (const e of Object.values(local.lists ?? {})) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
}

/** Nach neuen Daten vom PC: Übertragenes, das der PC (mindestens so neu) hat, entfällt. */
export function pruneTodos(catalog, local) {
  const l = todosState(local);
  const pc = new Map((catalog?.pc?.todo ?? []).map((r) => [r.id, r]));
  for (const [id, e] of Object.entries(l.rows)) {
    const r = pc.get(id);
    if (e.sent && r && String(r.updated_at) >= String(e.row.updated_at)) delete l.rows[id];
  }
  const pcLists = new Map((catalog?.pc?.todo_list ?? []).map((r) => [r.id, r]));
  for (const [id, e] of Object.entries(l.lists)) {
    const r = pcLists.get(id);
    if (e.sent && r && String(r.updated_at) >= String(e.row.updated_at)) delete l.lists[id];
  }
  for (const [key, d] of Object.entries(l.deleted)) {
    const onPc = d.table === "todo_list" ? pcLists.has(d.id) : pc.has(d.id ?? key);
    if (d.sent && !onPc) delete l.deleted[key];
  }
  return l;
}
