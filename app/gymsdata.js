// LIFESPAN OS Mobil – Meine Gyms (1.60.0), reine Logik ohne Oberfläche.
//
// Daten vom PC: Tabellen `gym` und `gym_machine` aus der Exportdatei (catalog.pc), aktives Gym aus
// den Einstellungen (`training.active_gym`). Am Handy angelegte oder geänderte Einträge liegen in
// `local` (id → { row, sent }), Löschungen als Löschvermerk; sie gehen mit der Rückgabedatei an den
// PC. Prüfregeln wie im Rust-Kern (`repo/gym.rs`). Das gewählte Gym am Handy bleibt am Handy
// (`local.active`). Referenz-Studio „dasGym Wien“ (Paket-ID `dasgym-wien`) lässt sich nicht löschen.

export const GYM_COLUMNS = ["id", "name", "address", "contact", "member_number", "website", "photo", "package_id", "sort_order", "archived", "created_at", "updated_at"];
export const ENTRY_COLUMNS = ["id", "gym_id", "machine_id", "number", "note", "created_at", "updated_at"];
export const REFERENCE_PACKAGE = "dasgym-wien";
export const MAX_PHOTO_CHARS = 600000;
export const REFERENCE_NAME = "dasGym Wien";
/** Zeitstempel des Referenz-Studios, solange es nur am Handy besteht (der PC legt es selbst an). */
const REFERENCE_TS = "2026-11-20T00:00:00.000Z";

export function emptyGymsLocal() {
  return { gyms: {}, entries: {}, deleted: {}, active: null };
}

export function gymsState(saved) {
  return { ...emptyGymsLocal(), ...(saved ?? {}) };
}

const isGone = (local, table, id) => Boolean(local.deleted[`${table}:${id}`]);

// ------------------------------------------------------------------ Feste IDs (wie `gym::stable_id` am PC)

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 (synchron, für feste IDs) – Ergebnis als Bytes. */
export function sha256(text) {
  const msg = new TextEncoder().encode(text);
  const len = msg.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(total - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]);
  return out;
}

/** UUID v8 aus einem Text (wie `stable_id` im Rust-Kern). */
export function stableId(seed) {
  const b = sha256(seed).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x80;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export const entryId = (gymId, machineId) => stableId(`gym_machine:${gymId}:${machineId}`);

export const REFERENCE_ID = stableId(`gym:${REFERENCE_PACKAGE}`);

/** Liefert der PC das Referenz-Studio schon? Sonst entsteht es am Handy aus den dasGym-Nummern. */
const pcHasReference = (catalog) => (catalog?.pc?.gym ?? []).some((r) => r.id === REFERENCE_ID || r.package_id === REFERENCE_PACKAGE);

function virtualReference(catalog) {
  if (pcHasReference(catalog)) return null;
  return { id: REFERENCE_ID, name: REFERENCE_NAME, address: null, contact: null, member_number: null, website: null, photo: null, package_id: REFERENCE_PACKAGE, sort_order: -1, archived: 0, created_at: REFERENCE_TS, updated_at: REFERENCE_TS };
}

function virtualEntries(catalog) {
  if (pcHasReference(catalog)) return [];
  return (catalog?.machines ?? [])
    .filter((m) => !m.archived && String(m.gym_number ?? "").trim())
    .map((m) => ({ id: entryId(REFERENCE_ID, m.id), gym_id: REFERENCE_ID, machine_id: m.id, number: String(m.gym_number).trim(), note: null, created_at: REFERENCE_TS, updated_at: REFERENCE_TS }));
}

/** Das Referenz-Studio, das bisher nur am Handy besteht, für eine Änderung in die eigene Ablage übernehmen. */
function materialize(catalog, local, gymId) {
  if (gymId !== REFERENCE_ID || local.gyms[gymId]) return;
  const v = virtualReference(catalog);
  if (v) local.gyms[gymId] = { row: v, sent: false };
}

/** Alle Gyms (PC + Handy, Handy gewinnt), Referenz zuerst, dann nach Name. */
export function gymList(catalog, local) {
  const l = gymsState(local);
  const map = new Map((catalog?.pc?.gym ?? []).map((r) => [r.id, r]));
  const ref = virtualReference(catalog);
  if (ref) map.set(ref.id, ref);
  for (const e of Object.values(l.gyms)) map.set(e.row.id, e.row);
  return [...map.values()]
    .filter((g) => !isGone(l, "gym", g.id) && !g.archived)
    .sort((a, b) => Number(b.package_id === REFERENCE_PACKAGE) - Number(a.package_id === REFERENCE_PACKAGE) || String(a.name).localeCompare(String(b.name), "de"));
}

/** Maschinenliste eines Gyms (PC + Handy). */
export function gymEntries(catalog, local, gymId) {
  const l = gymsState(local);
  const map = new Map();
  if (gymId === REFERENCE_ID) for (const r of virtualEntries(catalog)) map.set(`${r.gym_id}|${r.machine_id}`, r);
  for (const r of catalog?.pc?.gym_machine ?? []) if (r.gym_id === gymId) map.set(`${r.gym_id}|${r.machine_id}`, r);
  for (const e of Object.values(l.entries)) if (e.row.gym_id === gymId) map.set(`${e.row.gym_id}|${e.row.machine_id}`, e.row);
  return [...map.values()].filter((r) => !isGone(l, "gym_machine", r.id));
}

/** Aktives Gym: Wahl am Handy, sonst die vom PC, sonst das Referenz-Studio, sonst das erste. */
export function activeGymId(catalog, local, pcActive = null) {
  const list = gymList(catalog, local);
  const l = gymsState(local);
  for (const id of [l.active, pcActive]) if (id && list.some((g) => g.id === id)) return id;
  return (list.find((g) => g.package_id === REFERENCE_PACKAGE) ?? list[0])?.id ?? null;
}

export const numberCompare = (a, b) => {
  if (a && !b) return -1;
  if (!a && b) return 1;
  if (!a || !b) return 0;
  return String(a).localeCompare(String(b), "de", { numeric: true, sensitivity: "base" });
};

/**
 * Katalog für die Maschinenauswahl im Training: nur die Maschinen des Gyms (bzw. mit `all` alle),
 * die Studionummer steht als `gym_number` (so zeigen Suche und Liste sie wie gewohnt), die eigene
 * Nummer bleibt. Ohne Einträge: Katalog unverändert.
 */
export function gymCatalog(catalog, entries, { all = false } = {}) {
  if (!entries?.length) return catalog;
  const nr = new Map(entries.map((e) => [e.machine_id, e.number?.trim() || null]));
  const machines = catalog.machines
    .filter((m) => all || nr.has(m.id))
    // im Gym: nur dessen Nummer (die eigene Nummer gilt fürs eigene Studio); sonst die eigene Nummer
    .map((m) => (nr.has(m.id) ? { ...m, own_number: null, gym_number: nr.get(m.id) } : { ...m, gym_number: null }));
  return { ...catalog, machines };
}

function text(errors, field, value, max) {
  const t = String(value ?? "").trim();
  if (t === "") return null;
  if ([...t].length > max) {
    errors[field] = `Höchstens ${max} Zeichen erlaubt.`;
    return null;
  }
  return t;
}

/** Website als Link (wie `websiteHref` am PC). */
export function websiteHref(website) {
  const w = String(website ?? "").trim();
  if (!w) return null;
  const url = /^[a-z][a-z0-9+.-]*:/i.test(w) ? w : `https://${w}`;
  return /^https?:\/\/[^\s/]+\.[^\s]+/i.test(url) ? url : null;
}

/** Gym speichern (neu oder ändern) wie `gym::save`. Ergebnis `{ row }` oder `{ errors }`. */
export function saveGym(catalog, local, input, uuid, now = new Date()) {
  const errors = {};
  const name = String(input.name ?? "").trim();
  if (!name || [...name].length > 120) errors.name = "Bitte einen Namen mit höchstens 120 Zeichen eingeben.";
  const address = text(errors, "address", input.address, 300);
  const contact = text(errors, "contact", input.contact, 300);
  const member = text(errors, "member_number", input.member_number, 60);
  const website = text(errors, "website", input.website, 300);
  const photo = input.photo ? String(input.photo) : null;
  if (photo && !photo.startsWith("data:image/")) errors.photo = "Das Foto muss ein Bild sein.";
  if (photo && photo.length > MAX_PHOTO_CHARS) errors.photo = "Das Foto ist zu groß – bitte ein kleineres Bild wählen.";
  if (Object.keys(errors).length) return { errors };
  const iso = now.toISOString();
  const prev = input.id ? gymList(catalog, local).find((g) => g.id === input.id) : null;
  if (input.id && !prev) return { errors: { name: "Das Gym gibt es nicht mehr." } };
  const row = {
    id: prev?.id ?? uuid(),
    name,
    address,
    contact,
    member_number: member,
    website,
    photo,
    package_id: prev?.package_id ?? null,
    sort_order: prev?.sort_order ?? 0,
    archived: 0,
    created_at: prev?.created_at ?? iso,
    updated_at: iso,
  };
  local.gyms[row.id] = { row, sent: false };
  delete local.deleted[`gym:${row.id}`];
  return { row };
}

/** Gym löschen (mit Maschinenliste); das Referenz-Studio bleibt. */
export function removeGym(catalog, local, id, now = new Date()) {
  const g = gymList(catalog, local).find((x) => x.id === id);
  if (!g) return { error: "Das Gym gibt es nicht mehr." };
  if (g.package_id === REFERENCE_PACKAGE) return { error: "dasGym Wien ist das Referenz-Studio und bleibt immer angelegt." };
  const at = now.toISOString();
  for (const e of gymEntries(catalog, local, id)) removeEntryRow(catalog, local, e, at);
  const own = local.gyms[id];
  delete local.gyms[id];
  const onPc = (catalog?.pc?.gym ?? []).some((r) => r.id === id);
  if (onPc || own?.sent) local.deleted[`gym:${id}`] = { table: "gym", id, at, sent: false };
  if (local.active === id) local.active = null;
  return {};
}

function removeEntryRow(catalog, local, row, at) {
  const own = local.entries[row.id];
  delete local.entries[row.id];
  const onPc = (catalog?.pc?.gym_machine ?? []).some((r) => r.id === row.id) || (row.gym_id === REFERENCE_ID && virtualEntries(catalog).some((r) => r.id === row.id));
  if (onPc || own?.sent) local.deleted[`gym_machine:${row.id}`] = { table: "gym_machine", id: row.id, at, sent: false };
}

/**
 * Maschine aufnehmen bzw. Nummer und Notiz setzen (wie `gym::set_machine`). Die Nummer ist je Gym
 * eindeutig. Ergebnis `{ row }` oder `{ error }`.
 */
export function setEntry(catalog, local, gymId, machineId, number, note, uuid, now = new Date()) {
  if (!gymList(catalog, local).some((g) => g.id === gymId)) return { error: "Das Gym gibt es nicht mehr." };
  const m = catalog.machines.find((x) => x.id === machineId);
  if (!m) return { error: "Die Maschine gibt es nicht." };
  const errors = {};
  const nr = text(errors, "number", number, 40);
  const nt = text(errors, "note", note, 500);
  if (errors.number || errors.note) return { error: errors.number ?? errors.note };
  const entries = gymEntries(catalog, local, gymId);
  if (nr) {
    const other = entries.find((e) => e.machine_id !== machineId && String(e.number ?? "").trim().toLowerCase() === nr.toLowerCase());
    const om = other ? catalog.machines.find((x) => x.id === other.machine_id) : null;
    if (other && om && !om.archived) return { error: `Die Nummer ${nr} hat in diesem Gym schon „${om.display_name ?? om.name}“.` };
  }
  const prev = entries.find((e) => e.machine_id === machineId);
  const iso = now.toISOString();
  materialize(catalog, local, gymId);
  const row = {
    id: prev?.id ?? entryId(gymId, machineId),
    gym_id: gymId,
    machine_id: machineId,
    number: nr,
    note: nt,
    created_at: prev?.created_at ?? iso,
    updated_at: iso,
  };
  local.entries[row.id] = { row, sent: false };
  delete local.deleted[`gym_machine:${row.id}`];
  return { row };
}

/** Mehrere Maschinen aufnehmen (vorhandene bleiben). Ergebnis: Anzahl neu. */
export function addMachines(catalog, local, gymId, machineIds, uuid, now = new Date()) {
  const have = new Set(gymEntries(catalog, local, gymId).map((e) => e.machine_id));
  let n = 0;
  for (const id of machineIds) {
    if (have.has(id)) continue;
    const r = setEntry(catalog, local, gymId, id, null, null, uuid, now);
    if (r.row) {
      have.add(id);
      n++;
    }
  }
  return n;
}

export function removeMachine(catalog, local, gymId, machineId, now = new Date()) {
  const e = gymEntries(catalog, local, gymId).find((x) => x.machine_id === machineId);
  if (e) removeEntryRow(catalog, local, e, now.toISOString());
}

export function unsentGyms(local) {
  if (!local) return 0;
  const l = gymsState(local);
  return [...Object.values(l.gyms), ...Object.values(l.entries), ...Object.values(l.deleted)].filter((e) => !e.sent).length;
}

const pick = (row, cols) => Object.fromEntries(cols.map((c) => [c, row[c] ?? null]));

/** Tabellen für die Rückgabedatei. */
export function gymTables(local, { all = false } = {}) {
  if (!local) return {};
  const l = gymsState(local);
  const out = {};
  const gyms = Object.values(l.gyms).filter((e) => all || !e.sent).map((e) => pick(e.row, GYM_COLUMNS));
  const entries = Object.values(l.entries).filter((e) => all || !e.sent).map((e) => pick(e.row, ENTRY_COLUMNS));
  if (gyms.length) out.gym = gyms;
  if (entries.length) out.gym_machine = entries;
  const del = Object.entries(l.deleted)
    .filter(([, d]) => all || !d.sent)
    .map(([key, d]) => ({ id: key, table_name: d.table, record_id: d.id, deleted_at: d.at }));
  if (del.length) out.deleted_record = del;
  return out;
}

export function markGymsSent(local) {
  if (!local) return;
  for (const part of ["gyms", "entries", "deleted"]) for (const e of Object.values(local[part] ?? {})) e.sent = true;
}

/** Nach neuen Daten vom PC: Gesendetes, das der PC mindestens so neu hat, entfällt. */
export function pruneGyms(catalog, local) {
  const l = gymsState(local);
  const parts = [
    ["gyms", "gym", (r) => r.id],
    ["entries", "gym_machine", (r) => `${r.gym_id}|${r.machine_id}`],
  ];
  for (const [part, table, key] of parts) {
    const pc = new Map((catalog?.pc?.[table] ?? []).map((r) => [key(r), r]));
    for (const [id, e] of Object.entries(l[part])) {
      if (!e.sent) continue;
      const r = pc.get(key(e.row));
      if (r && String(r.updated_at) >= String(e.row.updated_at)) delete l[part][id];
    }
  }
  for (const [k, d] of Object.entries(l.deleted)) {
    if (!d.sent) continue;
    if (!(catalog?.pc?.[d.table] ?? []).some((r) => r.id === d.id)) delete l.deleted[k];
  }
  return l;
}
