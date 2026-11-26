// Speicher auf dem Gerät (IndexedDB). Nichts verlässt das Handy.

const DB_NAME = "lifespan-mobil";
const STORE = "kv";
let dbPromise = null;

// Konten (1.25.0): Jedes Konto hat eigene Schlüssel mit Vorsatz „<id>:“. Das Hauptkonto (vom PC,
// id "") nutzt die Schlüssel ohne Vorsatz wie bisher. Liste und aktives Konto liegen global.
let ns = "";
export const GLOBAL = "global:";
export function useAccount(id) {
  ns = id ? `${id}:` : "";
}
export const accountPrefix = () => ns;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function get(key) {
  return getRaw(ns + key);
}

export async function set(key, value) {
  if (watch) await watch(key);
  return setRaw(ns + key, value);
}

let watch = null;
/** Sofort speichern (1.131.0): vor jedem Schreiben `fn(key)` aufrufen (für „Rückgängig“); null = aus. */
export function watchWrites(fn) {
  watch = fn;
}

/** Globale Werte (Kontenliste, aktives Konto) – unabhängig vom Konto. */
export const getGlobal = (key) => getRaw(GLOBAL + key);
export const setGlobal = (key, value) => setRaw(GLOBAL + key, value);

/** Alle Daten eines Kontos löschen (nur Konten am Handy, nie das Hauptkonto). */
export async function clearAccount(id) {
  if (!id) throw new Error("Das Hauptkonto wird nicht gelöscht.");
  const db = await open();
  const prefix = `${id}:`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const req = os.getAllKeys();
    req.onsuccess = () => {
      for (const k of req.result) if (typeof k === "string" && k.startsWith(prefix)) os.delete(k);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Gehört der Schlüssel zum aktuellen Konto? Hauptkonto: Schlüssel ohne Konto-Vorsatz. */
function ownKey(k) {
  if (typeof k !== "string" || k.startsWith(GLOBAL)) return false;
  if (ns) return k.startsWith(ns);
  return !/^[^:]+:/.test(k);
}

/** Alle Werte des aktuellen Kontos (Datensicherung, 1.99.0): { Schlüssel ohne Vorsatz: Wert }. */
export async function exportAccount() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE);
    const os = tx.objectStore(STORE);
    const keysReq = os.getAllKeys();
    const valsReq = os.getAll();
    tx.oncomplete = () => {
      const out = {};
      keysReq.result.forEach((k, i) => {
        if (ownKey(k)) out[ns ? k.slice(ns.length) : k] = valsReq.result[i];
      });
      resolve(out);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Alle Werte des aktuellen Kontos durch `values` ersetzen (Wiederherstellung, in einem Schritt). */
export async function replaceAccount(values) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const req = os.getAllKeys();
    req.onsuccess = () => {
      for (const k of req.result) if (ownKey(k)) os.delete(k);
      for (const [k, v] of Object.entries(values)) os.put(v, ns + k);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Mehrere Werte in einem Lesevorgang (1.158.0, schnellerer Start): `{ Schlüssel: Wert|null }`.
 * `keys` ohne Konto-Vorsatz; Schlüssel mit „global:“ werden unverändert gelesen.
 */
export async function getMany(keys) {
  const db = await open();
  const full = keys.map((k) => (k.startsWith(GLOBAL) ? k : ns + k));
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE);
    const os = tx.objectStore(STORE);
    const out = {};
    full.forEach((fk, i) => {
      const req = os.get(fk);
      req.onsuccess = () => {
        out[keys[i]] = req.result ?? null;
      };
    });
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getRaw(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function setRaw(key, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
export async function persist() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* nicht unterstützt */
  }
  return false;
}
