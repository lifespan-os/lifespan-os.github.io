// LIFESPAN OS Mobil – allgemeine Ablage für Tabellen, die am Handy neu bearbeitet werden können
// (1.90.0, Angleichung an den PC): Lebensstil-Notizen, eigene Messgrößen, Ziele, Wochenplan.
// Reine Logik ohne Oberfläche. Geht mit „An den PC senden“ zurück (Zeilen + Löschvermerke
// `deleted_record`); am PC gewinnt beim Abgleich der neuere Stand (`updated_at`).
//
// Ablage (Speicher „parity“): { rows: { "tabelle:id": { table, row, sent } }, deleted: { "tabelle:id": { at, sent } } }

/** Tabellen, die diese Ablage führen darf (alle stehen in `import.rs::DATA_TABLES` am PC). */
export const PARITY_TABLES = ["lifestyle_note", "body_metric", "goal", "meal_plan_entry"];

export function emptyParity() {
  return { rows: {}, deleted: {} };
}

export function normParity(local) {
  const l = local && typeof local === "object" ? local : {};
  if (!l.rows || typeof l.rows !== "object") l.rows = {};
  if (!l.deleted || typeof l.deleted !== "object") l.deleted = {};
  return l;
}

const keyOf = (table, id) => `${table}:${id}`;

function check(table) {
  if (!PARITY_TABLES.includes(table)) throw new Error(`Die Tabelle „${table}“ lässt sich am Handy nicht bearbeiten.`);
}

/** Zeile anlegen oder ändern; setzt `created_at` (neu) und `updated_at`. */
export function putRow(local, table, row, now = new Date()) {
  check(table);
  const l = normParity(local);
  const at = now.toISOString();
  const k = keyOf(table, row.id);
  const prev = l.rows[k]?.row ?? null;
  const full = { ...row, created_at: row.created_at ?? prev?.created_at ?? at, updated_at: at };
  l.rows[k] = { table, row: full, sent: false };
  delete l.deleted[k];
  return full;
}

/** Zeile löschen (am PC über den Löschvermerk). */
export function deleteRow(local, table, id, now = new Date()) {
  check(table);
  const l = normParity(local);
  const k = keyOf(table, id);
  delete l.rows[k];
  l.deleted[k] = { at: now.toISOString(), sent: false };
}

/** Zeilen einer Tabelle wie gerade gültig: vom PC, ohne am Handy gelöschte, mit am Handy geänderten. */
export function mergeRows(pcRows, local, table) {
  const l = normParity(local);
  const m = new Map();
  for (const r of pcRows ?? []) if (!l.deleted[keyOf(table, r.id)]) m.set(r.id, r);
  for (const e of Object.values(l.rows)) if (e.table === table) m.set(e.row.id, e.row);
  return [...m.values()];
}

/** Katalog mit den Änderungen vom Handy (PC-Tabellen und Messgrößen unter `body.metrics`). */
export function overlayCatalog(catalog, local) {
  if (!catalog) return catalog;
  const l = normParity(local);
  if (!Object.keys(l.rows).length && !Object.keys(l.deleted).length) return catalog;
  const pc = { ...(catalog.pc ?? {}) };
  for (const t of ["lifestyle_note", "goal", "meal_plan_entry"]) pc[t] = mergeRows(pc[t] ?? [], l, t);
  const out = { ...catalog, pc };
  if (catalog.body) {
    const metrics = mergeRows(catalog.body.metrics ?? [], l, "body_metric")
      .filter((m) => !m.archived)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.name).localeCompare(String(b.name), "de"));
    out.body = { ...catalog.body, metrics };
  }
  return out;
}

export const unsentParity = (local) => {
  const l = normParity(local);
  return Object.values(l.rows).filter((e) => !e.sent).length + Object.values(l.deleted).filter((d) => !d.sent).length;
};

/** Tabellen für „An den PC senden“ (`all` = auch schon gesendete). */
export function parityTables(local, { all = false } = {}) {
  const l = normParity(local);
  const out = {};
  for (const e of Object.values(l.rows)) {
    if (!all && e.sent) continue;
    (out[e.table] ??= []).push(e.row);
  }
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([k, d]) => {
      const i = k.indexOf(":");
      return { id: k, table_name: k.slice(0, i), record_id: k.slice(i + 1), deleted_at: d.at };
    });
  if (del.length) out.deleted_record = del;
  return out;
}

export function markParitySent(local) {
  if (!local) return;
  for (const e of Object.values(local.rows ?? {})) e.sent = true;
  for (const d of Object.values(local.deleted ?? {})) d.sent = true;
}

/** Nach einem neuen PC-Export: gesendete Einträge, die der PC schon hat, aufräumen. */
export function pruneParity(catalog, local) {
  const l = normParity(local);
  const pcOf = (table) => {
    if (table === "body_metric") return catalog?.body?.metrics ?? [];
    return catalog?.pc?.[table] ?? [];
  };
  const cache = new Map();
  const has = (table) => {
    if (!cache.has(table)) cache.set(table, new Map(pcOf(table).map((r) => [r.id, r])));
    return cache.get(table);
  };
  for (const [k, e] of Object.entries(l.rows)) {
    const pc = has(e.table).get(e.row.id);
    if (e.sent && pc && String(pc.updated_at) >= String(e.row.updated_at)) delete l.rows[k];
  }
  for (const [k, d] of Object.entries(l.deleted)) {
    const i = k.indexOf(":");
    if (d.sent && !has(k.slice(0, i)).has(k.slice(i + 1))) delete l.deleted[k];
  }
  return l;
}
