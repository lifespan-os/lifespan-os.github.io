// LIFESPAN OS Mobil – Datensicherung und Wiederherstellung (1.99.0, Wunsch 22.11.2026).
// Unter Import/Export ganz unten: alles, was im aktuellen Konto auf dem Handy gespeichert ist, als
// eine Datei sichern und daraus wiederherstellen. Vor dem Wiederherstellen wird der bisherige Stand
// auf dem Gerät gemerkt („Wiederherstellung rückgängig machen“). Maschinenbilder gehören nicht dazu
// (eigener Speicher, kommen aus den Bilderpaketen).

import * as store from "./store.js";

export const BACKUP_FORMAT = "lifespan-mobil-sicherung";
export const BACKUP_VERSION = 1;
/** Merkt den Stand vor der letzten Wiederherstellung (je Konto) */
const UNDO_KEY = (accountId) => `undo-restore:${accountId || "main"}`;

// ------------------------------------------------------------------ Kodieren (Map, Set, Datum, Binärdaten)

const TAG = "__lifespan";

async function encode(v) {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date) return { [TAG]: "date", v: v.toISOString() };
  if (v instanceof Map) return { [TAG]: "map", v: await Promise.all([...v.entries()].map(async ([k, x]) => [await encode(k), await encode(x)])) };
  if (v instanceof Set) return { [TAG]: "set", v: await Promise.all([...v].map(encode)) };
  if (typeof Blob !== "undefined" && v instanceof Blob) return { [TAG]: "blob", type: v.type, v: toBase64(new Uint8Array(await v.arrayBuffer())) };
  if (v instanceof ArrayBuffer) return { [TAG]: "bytes", v: toBase64(new Uint8Array(v)) };
  if (ArrayBuffer.isView(v)) return { [TAG]: "bytes", v: toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  if (Array.isArray(v)) return Promise.all(v.map(encode));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = await encode(x);
  return out;
}

function decode(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(decode);
  switch (v[TAG]) {
    case "date":
      return new Date(v.v);
    case "map":
      return new Map(v.v.map(([k, x]) => [decode(k), decode(x)]));
    case "set":
      return new Set(v.v.map(decode));
    case "blob":
      return new Blob([fromBase64(v.v)], { type: v.type || "" });
    case "bytes":
      return fromBase64(v.v);
    default: {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = decode(x);
      return out;
    }
  }
}

function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ------------------------------------------------------------------ Datei

/** Sicherungsdatei aus den Werten des Kontos. */
export async function buildBackup(values, { accountId = "", accountName = "", appVersion = "", now = new Date() } = {}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    appVersion,
    account: { id: accountId, name: accountName },
    values: await encode(values),
  };
}

/** Dateiname: „LIFESPAN Sicherung Name 2026-11-22 1710.json“ */
export function backupFileName(name, now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const safe = String(name || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `LIFESPAN Sicherung ${safe ? `${safe} ` : ""}${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}${p(now.getMinutes())}.json`;
}

/** Sicherungsdatei prüfen; Ergebnis { backup, values, summary } oder { error }. */
export function parseBackup(text) {
  let d;
  try {
    d = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    return { error: "Die Datei ist keine gültige Sicherung (kein JSON)." };
  }
  if (!d || d.format !== BACKUP_FORMAT) return { error: "Das ist keine Datensicherung der Handy-App von LIFESPAN OS." };
  if (!(d.version >= 1)) return { error: "Unbekannte Version der Sicherung." };
  if (d.version > BACKUP_VERSION) return { error: "Die Sicherung ist neuer als diese App – bitte die App aktualisieren." };
  if (!d.values || typeof d.values !== "object" || Array.isArray(d.values)) return { error: "Die Sicherung enthält keine Daten." };
  const values = decode(d.values);
  return { backup: d, values, summary: summarize(values) };
}

/** Kurzübersicht für die Rückfrage: Trainings am Handy, Stand der Daten vom PC, Zahl der Bereiche. */
export function summarize(values) {
  return {
    keys: Object.keys(values).length,
    workouts: Array.isArray(values.workouts) ? values.workouts.length : 0,
    pcExportedAt: values.catalog?.exportedAt ?? null,
    startpaket: Boolean(values.catalog?.startpaket),
  };
}

// ------------------------------------------------------------------ Ablauf

/** Aktuellen Stand des Kontos als Sicherungsdatei. */
export async function createBackup(meta) {
  const values = await store.exportAccount();
  return buildBackup(values, meta);
}

/** Wiederherstellen: vorher den bisherigen Stand merken, dann ersetzen. */
export async function restoreBackup(values, accountId = "") {
  const before = await store.exportAccount();
  await store.setGlobal(UNDO_KEY(accountId), { at: new Date().toISOString(), values: before });
  await store.replaceAccount(values);
}

/** Stand vor der letzten Wiederherstellung (oder null). */
export async function undoInfo(accountId = "") {
  const u = await store.getGlobal(UNDO_KEY(accountId)).catch(() => null);
  return u?.values ? { at: u.at } : null;
}

/** Letzte Wiederherstellung rückgängig machen. */
export async function undoRestore(accountId = "") {
  const u = await store.getGlobal(UNDO_KEY(accountId));
  if (!u?.values) return false;
  await store.replaceAccount(u.values);
  await store.setGlobal(UNDO_KEY(accountId), null);
  return true;
}
