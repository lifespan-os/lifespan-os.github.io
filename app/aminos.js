// Aminosäuren bei Lebensmitteln (1.165.0, wie PC 1.0.230, Schema 81): Spalte `food.aminos` als
// JSON-Text, Werte in g je 100 g/ml. Gemeinsam für Formular (nutrition.js), Pakete (vendor.js) und
// BLS-Übernahme (bls.js).

/**
 * Aminosäuren in g je 100 g/ml (1.165.0, wie PC 1.0.230, Schema 81): Spalte `aminos` als JSON-Text.
 * Reihenfolge erst die 9 essenziellen, dann die 9 nicht essenziellen (wie `src/domain/aminos.ts`).
 */
export const AMINOS = [
  ["histidine", "Histidin", true, "HIS"],
  ["isoleucine", "Isoleucin", true, "ILE"],
  ["leucine", "Leucin", true, "LEU"],
  ["lysine", "Lysin", true, "LYS"],
  ["methionine", "Methionin", true, "MET"],
  ["phenylalanine", "Phenylalanin", true, "PHE"],
  ["threonine", "Threonin", true, "THR"],
  ["tryptophan", "Tryptophan", true, "TRP"],
  ["valine", "Valin", true, "VAL"],
  ["alanine", "Alanin", false, "ALA"],
  ["arginine", "Arginin", false, "ARG"],
  ["aspartic_acid", "Asparaginsäure", false, "ASP"],
  ["cysteine", "Cystein", false, "CYSTE"],
  ["glutamic_acid", "Glutaminsäure", false, "GLU"],
  ["glycine", "Glycin", false, "GLY"],
  ["proline", "Prolin", false, "PRO"],
  ["serine", "Serin", false, "SER"],
  ["tyrosine", "Tyrosin", false, "TYR"],
].map(([key, label, essential, bls]) => ({ key, label, essential, bls }));
export const AMINO_KEYS = AMINOS.map((a) => a.key);

/** Spalte `aminos` (JSON-Text oder Objekt) → Objekt mit bekannten Schlüsseln, sonst null. */
export function parseAminos(raw) {
  if (raw == null || raw === "") return null;
  let o = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const out = {};
  for (const k of AMINO_KEYS) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Objekt → Spaltentext (null ohne Werte); Schlüssel in fester Reihenfolge wie am PC (BTreeMap). */
export function aminosText(o) {
  const clean = parseAminos(o);
  if (!clean) return null;
  const sorted = Object.fromEntries(Object.keys(clean).sort().map((k) => [k, clean[k]]));
  return JSON.stringify(sorted);
}

/** Prüft Aminosäuren aus einer Datei (Paket, Katalog): je 0–100 g, zusammen ≤ 100,5 g. */
export function checkedAminosText(o) {
  const clean = parseAminos(o);
  if (!clean) return null;
  for (const [k, v] of Object.entries(clean)) {
    if (v > 100) throw new Error(`Aminosäure ${k}: höchstens 100 g je 100`);
  }
  const sum = Object.values(clean).reduce((a, b) => a + b, 0);
  if (sum > 100.5) throw new Error("Aminosäuren zusammen über 100 g je 100 g");
  return aminosText(Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, Math.round(v * 1000) / 1000])));
}
