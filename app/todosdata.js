// LIFESPAN OS Mobil – To-dos am Handy (1.9.0), reine Logik ohne Oberfläche.
//
// Daten vom PC: Tabelle `todo` aus der Exportdatei (catalog.pc). Am Handy angelegte oder
// geänderte To-dos liegen in `local.rows` (id → { row, sent }), Löschungen als Löschvermerk.
// Sie gehen mit „Körperwerte … senden“ an den PC (Abgleich: neuerer Stand gewinnt).
// Regeln wie im Rust-Kern (checklist.rs): Text 1–300 Zeichen, neue To-dos ans Ende der Liste,
// gleiche Texte am selben Tag werden beim Eintragen auf mehrere Tage übersprungen.

export const TODO_COLUMNS = ["id", "date", "position", "text", "done", "checklist_id", "created_at", "updated_at"];
export const TEXT_MAX_CHARS = 300;
export const MAX_TODO_DATES = 400;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function emptyTodosLocal() {
  return { rows: {}, deleted: {} };
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

/** To-dos eines Tages wie `todos_for_date` (nach Reihenfolge, dann Anlegezeit). */
export function todosFor(catalog, local, date) {
  return allTodos(catalog, local)
    .filter((t) => t.date === date)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || cmp(a.created_at, b.created_at));
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

function insert(catalog, local, date, text, { uuid, now, checklistId = null }) {
  const day = todosFor(catalog, local, date);
  const position = day.length ? Math.max(...day.map((t) => t.position ?? 0)) + 1 : 0;
  const iso = now.toISOString();
  put(local, { id: uuid(), date, position, text, done: 0, checklist_id: checklistId, created_at: iso, updated_at: iso });
}

/** Neues To-do am Ende der Liste des Tages wie `add_todo`. */
export function addTodo(catalog, local, date, text, { uuid, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("Bitte ein gültiges Datum wählen.");
  insert(catalog, local, date, checkText(text), { uuid, now });
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
    if (todosFor(catalog, local, d).some((x) => x.text.toLowerCase() === t.toLowerCase())) skipped += 1;
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
  const list = todosFor(catalog, local, t.date);
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
export function clearDone(catalog, local, date, now = new Date()) {
  const done = todosFor(catalog, local, date).filter((t) => t.done);
  for (const t of done) deleteTodo(catalog, local, t.id, now);
  return done.length;
}

/** Offene To-dos von `from` nach `to` kopieren wie `carry_over` (gleiche Texte übersprungen). */
export function carryOver(catalog, local, from, to, { uuid, now = new Date() }) {
  const existing = new Set(todosFor(catalog, local, to).map((t) => t.text.toLowerCase()));
  let added = 0;
  for (const t of todosFor(catalog, local, from).filter((x) => !x.done)) {
    if (existing.has(t.text.toLowerCase())) continue;
    insert(catalog, local, to, t.text, { uuid, now, checklistId: t.checklist_id ?? null });
    existing.add(t.text.toLowerCase());
    added += 1;
  }
  return added;
}

/**
 * Punkte einer Checkliste als To-dos eines Tages wie `add_from_checklist` (Texte, die es an dem
 * Tag schon gibt, werden übersprungen). `items` = Punkte der Checkliste. Rückgabe: Anzahl neu.
 */
export function addFromChecklist(catalog, local, date, checklistId, items, onlyOpen, { uuid, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("Bitte ein gültiges Datum wählen.");
  const existing = new Set(todosFor(catalog, local, date).map((t) => t.text.toLowerCase()));
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
  return Object.values(l.rows).filter((e) => !e.sent).length + Object.values(l.deleted).filter((d) => !d.sent).length;
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
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([id, d]) => ({ id: `todo:${id}`, table_name: "todo", record_id: id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

export function markTodosSent(local) {
  if (!local) return;
  for (const e of Object.values(local.rows ?? {})) e.sent = true;
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
  for (const [id, d] of Object.entries(l.deleted)) if (d.sent && !pc.has(id)) delete l.deleted[id];
  return l;
}
