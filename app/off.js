// LIFESPAN OS Mobil – Open Food Facts als optionaler Download (1.58.0). Reine Logik ohne Oberfläche.
//
// Daten: Open Food Facts (world.openfoodfacts.org), Open Database License (ODbL), Inhalte
// Database Contents License (DbCL). Gleiche Liste wie am PC (Skript 56, `core/src/off.rs`):
// Markenprodukte aus Deutschland und Österreich, Tab-getrennt, gepackt als `off/off-de-at.tsv.gz`.
// Beim Einlesen gelten dieselben Prüfregeln wie am PC (Pflichtwerte, Bereiche, gesättigte
// Fettsäuren ≤ Fett, Zucker ≤ Kohlenhydrate, Makros zusammen ≤ 100,5 g bzw. 105 ml, kcal höchstens
// 15 % bzw. 20 kcal neben 9 × Fett + 4 × KH + 4 × Eiweiß + 2 × Ballaststoffe).
// Übernommen wird nie direkt: Das Produkt füllt das Formular „Neues Lebensmittel“, der Nutzer
// prüft und ändert, dann entsteht ein normales eigenes Lebensmittel.

export const OFF_FILE = "off/off-de-at.tsv.gz";
export const OFF_SOURCE = "Open Food Facts";
export const OFF_LICENSE_NOTE = "Daten: Open Food Facts (world.openfoodfacts.org), Open Database License (ODbL)";

const NEED = ["code", "name", "marke", "menge", "portion", "kcal", "fett", "gesaettigt", "kh", "zucker", "ballaststoffe", "eiweiss", "salz"];

/** Wie `normalize` in off.rs: Kleinbuchstaben, ohne Akzente/Umlautpunkte, „ß“ → „ss“. */
export const normalize = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** EAN/GTIN mit Prüfziffer (8, 12, 13 oder 14 Ziffern), wie `valid_code` im Rust-Kern. */
export function validCode(code) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const d = [...code].map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((a, x, i) => a + (i % 2 === 0 ? x * 3 : x), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export const macroKcal = (fat, carbs, protein, fiber) => 9 * fat + 4 * carbs + 4 * protein + 2 * (fiber ?? 0);

/** Bezug aus der Packungsgröße: „1,5 l“, „330ml“, „75 cl“ → ml, sonst g. */
export function basisOf(quantity) {
  return /\d[\s.,]*(ml|cl|dl|l|liter)(?![a-zäöüß])/i.test(String(quantity ?? "")) ? "ml" : "g";
}

/** Menge in g bzw. ml aus „30 g“, „1 Riegel (40 g)“, „250ml“, „0,25 l“ – sonst null. */
export function parseAmount(text, unit) {
  const re = /(?<![\p{L}\p{N}])(\d[\d.,]*)\s*(\p{L}*)/gu;
  const t = String(text ?? "").toLowerCase();
  for (const m of t.matchAll(re)) {
    const value = Number(m[1].replace(/,/g, ".").replace(/\.$/, ""));
    if (!Number.isFinite(value)) continue;
    const w = m[2];
    const factor =
      unit === "g" ? (["g", "gr", "gramm"].includes(w) ? 1 : null) : { ml: 1, cl: 10, dl: 100, l: 1000 }[w] ?? null;
    if (factor === null) continue;
    const amount = value * factor;
    if (amount > 0 && amount <= 10000) return Math.round(amount * 10) / 10;
  }
  return null;
}

const num = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};
const opt = (s) => {
  const t = String(s ?? "").trim();
  return t ? t : null;
};

/** Prüfregeln wie `plausible` in off.rs. */
export function plausible(p) {
  const inRange = (v, max) => v >= 0 && v <= max;
  if (!inRange(p.energyKcal, 900) || !inRange(p.fatG, 100) || !inRange(p.carbsG, 100) || !inRange(p.proteinG, 100)) return false;
  if (p.fatG + p.carbsG + p.proteinG > (p.basisUnit === "g" ? 100.5 : 105)) return false;
  if (p.saturatedFatG !== null && !(p.saturatedFatG >= 0 && p.saturatedFatG <= p.fatG)) return false;
  if (p.sugarG !== null && !(p.sugarG >= 0 && p.sugarG <= p.carbsG)) return false;
  if (p.fiberG !== null && !inRange(p.fiberG, 100)) return false;
  if (p.saltG !== null && !inRange(p.saltG, 100)) return false;
  return Math.abs(p.macroKcal - p.energyKcal) <= Math.max(0.15 * Math.max(p.macroKcal, p.energyKcal), 20);
}

/** Eine Zeile → Produkt (oder null, wenn eine Prüfung nicht besteht). */
function product(line, idx) {
  const f = line.split("\t");
  const get = (i) => f[idx[i]] ?? "";
  const code = get(0).trim();
  const name = [...get(1).trim()].slice(0, 100).join("");
  const kcal = num(get(5));
  const fat = num(get(6));
  const carbs = num(get(8));
  const protein = num(get(11));
  if (kcal === null || fat === null || carbs === null || protein === null) return null;
  if (!validCode(code) || [...name].length < 2) return null;
  const quantity = opt(get(3));
  const serving = opt(get(4));
  const basisUnit = basisOf(quantity);
  const fiber = num(get(10));
  const brand = opt([...String(get(2).split(",")[0] ?? "").trim()].slice(0, 60).join(""));
  const p = {
    code,
    name,
    brand,
    basisUnit,
    quantity,
    serving,
    portionAmount: serving ? parseAmount(serving, basisUnit) : null,
    energyKcal: kcal,
    fatG: fat,
    saturatedFatG: num(get(7)),
    carbsG: carbs,
    sugarG: num(get(9)),
    fiberG: fiber,
    proteinG: protein,
    saltG: num(get(12)),
    macroKcal: Math.round(macroKcal(fat, carbs, protein, fiber) * 10) / 10,
  };
  return plausible(p) ? p : null;
}

/**
 * Text der Datei prüfen und für die Suche vorbereiten. Gespeichert wird nur, was die Prüfung
 * besteht; Produkte selbst werden erst bei Treffern erzeugt (spart Speicher am Handy).
 */
export function prepare(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const cols = (lines[0] ?? "").replace(/^﻿/, "").split("\t");
  const idx = NEED.map((n) => cols.indexOf(n));
  if (idx.some((i) => i < 0)) throw new Error("Die Open-Food-Facts-Datei ist unvollständig.");
  const rows = [];
  const keys = [];
  const byCode = new Map();
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const p = product(line, idx);
    if (!p || byCode.has(p.code)) {
      skipped++;
      continue;
    }
    byCode.set(p.code, rows.length);
    keys.push(normalize(`${p.name} ${p.brand ?? ""}`));
    rows.push(line);
  }
  return { idx, rows, keys, byCode, skipped };
}

export const count = (c) => c?.rows.length ?? 0;

export function byCode(c, code) {
  const i = c?.byCode.get(String(code ?? "").trim());
  return i === undefined ? null : product(c.rows[i], c.idx);
}

/** Suche wie am PC: Strichcode genau, sonst alle Wörter in Name/Marke; Anfang zuerst, dann kurz. */
export function searchOff(c, query, limit = 20) {
  if (!c) return [];
  const compact = String(query ?? "").replace(/[\s-]/g, "");
  if (compact && /^\d+$/.test(compact)) {
    const p = byCode(c, compact);
    return p ? [p] : [];
  }
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length || words.join("").length < 2) return [];
  const first = words[0];
  const hits = [];
  for (let i = 0; i < c.keys.length; i++) {
    const k = c.keys[i];
    if (!words.every((w) => k.includes(w))) continue;
    hits.push({ i, rank: k.startsWith(first) ? 0 : k.includes(` ${first}`) ? 1 : 2, len: k.length });
  }
  hits.sort((a, b) => a.rank - b.rank || a.len - b.len || a.i - b.i);
  return hits.slice(0, limit).map((h) => product(c.rows[h.i], c.idx));
}

/** Abweichung der angegebenen kcal von der Rechnung aus den Makros in Prozent (gerundet). */
export const kcalDeviation = (p) => (p.macroKcal > 0 ? Math.round(((p.energyKcal - p.macroKcal) / p.macroKcal) * 100) : null);

const short = (t, max = 80) => (t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : null);

/** Notiz wie am PC (`offNotes`). */
export function offNotes(p) {
  const parts = [`Quelle: ${OFF_SOURCE} (ODbL)`, `Strichcode ${p.code}`];
  if (p.quantity) parts.push(`Packung ${short(p.quantity)}`);
  if (p.serving) parts.push(`Portion laut Packung ${short(p.serving)}`);
  return parts.join(" · ");
}

const txt = (v) => (v === null || v === undefined ? "" : String(Math.round(v * 100) / 100).replace(".", ","));

/**
 * Produkt → Formular „Neues Lebensmittel“ (Felder wie `scanToForm`; alles bleibt bearbeitbar).
 * `form` ist ein leeres Formular aus `nutrition.js` (`emptyForm`).
 */
export function offToForm(p, form) {
  const values = { ...form.values };
  const map = { energyKcal: Math.round(p.energyKcal), fatG: p.fatG, saturatedFatG: p.saturatedFatG, carbsG: p.carbsG, sugarG: p.sugarG, fiberG: p.fiberG, proteinG: p.proteinG, saltG: p.saltG };
  for (const k of Object.keys(values)) if (k in map) values[k] = txt(map[k]);
  return {
    ...form,
    values,
    name: p.name,
    brand: p.brand ?? "",
    basis: p.basisUnit,
    portionName: p.portionAmount !== null ? "Portion" : "",
    portionAmount: txt(p.portionAmount),
    barcode: p.code,
    notes: offNotes(p),
  };
}
