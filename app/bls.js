// LIFESPAN OS Mobil – Bundeslebensmittelschlüssel (BLS) 4.0 als optionaler Download (1.30.0).
//
// Quelle: Max Rubner-Institut (2025), Bundeslebensmittelschlüssel (BLS), Version 4.0, Karlsruhe,
// DOI: 10.25826/Data20251217-134202-0 – Lizenz CC BY 4.0.
//
// Gleiche Datei wie am PC (`src-tauri/core/data/bls_4_0.json`, bls.rs): Referenz, nicht Teil der
// persönlichen Daten. Wird ein BLS-Lebensmittel übernommen, entsteht ein normales eigenes
// Lebensmittel (Marke „BLS 4.0“, Werte je 100 g) wie `blsFoodInput` in src/domain/bls.ts:
// keine Angabe bleibt leer, Kennzeichen (Spuren, < Nachweis-/Bestimmungsgrenze) werden 0 und stehen
// in der Notiz; fehlen Energie, Protein, Kohlenhydrate oder Fett, ist keine Übernahme möglich.

import { foodRow } from "./vendor.js";
import { AMINOS } from "./aminos.js";

export const BLS_FILE = "bls/bls_4_0.json";
export const BLS_BRAND = "BLS 4.0";
export const CITATION_SHORT = "BLS 4.0, Max Rubner-Institut (2025)";

export const FOOD_FIELDS = {
  energyKcal: { code: "ENERCC", label: "Brennwert" },
  proteinG: { code: "PROT625", label: "Protein" },
  carbsG: { code: "CHO", label: "Kohlenhydrate" },
  fatG: { code: "FAT", label: "Fett" },
  fiberG: { code: "FIBT", label: "Ballaststoffe" },
  sugarG: { code: "SUGAR", label: "Zucker" },
  saturatedFatG: { code: "FASAT", label: "gesättigte Fettsäuren" },
  saltG: { code: "NACL", label: "Salz" },
};
const REQUIRED = ["energyKcal", "proteinG", "carbsG", "fatG"];

const FLAG_LABELS = {
  TR: "Spuren",
  "<LOD": "unter Nachweisgrenze",
  "<LOQ": "unter Bestimmungsgrenze",
  "<LOD or <LOQ": "unter Nachweis-/Bestimmungsgrenze",
};
export const flagLabel = (f) => FLAG_LABELS[f] ?? f;

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");

/** Datei prüfen und für die Suche vorbereiten. */
export function prepare(data) {
  if (!data || !Array.isArray(data.nutrients) || !Array.isArray(data.foods) || !data.citation) throw new Error("Die BLS-Datei ist unvollständig.");
  const pos = Object.fromEntries(data.nutrients.map((n, i) => [n.code, i]));
  // Auch ohne Leerzeichen: „haferflocken“ findet „Hafer Flocken“
  const search = data.foods.map((f) => `${norm(f[1])} ${norm(f[2])} ${norm(f[1]).replace(/[\s-]/g, "")}`);
  return { data, pos, search };
}

const num = (v) => (typeof v === "number" ? v : null);

/** Kurzwerte eines Lebensmittels (für Trefferlisten). */
export function short(b, f) {
  const v = f[4];
  return {
    code: f[0],
    name: f[1],
    nameEn: f[2],
    energyKcal: num(v[b.pos.ENERCC]),
    proteinG: num(v[b.pos.PROT625]),
    carbsG: num(v[b.pos.CHO]),
    fatG: num(v[b.pos.FAT]),
  };
}

/** Suche wie am PC: alle Wörter in deutschem oder englischem Namen; Namensanfang zuerst. */
export function searchBls(b, query, limit = 25) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!b || !words.length) return [];
  const hits = [];
  b.data.foods.forEach((f, i) => {
    const hay = b.search[i];
    if (!words.every((w) => hay.includes(w))) return;
    const name = norm(f[1]);
    const compact = name.replace(/[\s-]/g, "");
    hits.push({ i, rank: name.startsWith(words[0]) || compact.startsWith(words[0]) ? 0 : name.includes(words[0]) ? 1 : 2, len: name.length });
  });
  return hits
    .sort((a, b2) => a.rank - b2.rank || a.len - b2.len)
    .slice(0, limit)
    .map((h) => short(b, b.data.foods[h.i]));
}

export function foodByCode(b, code) {
  return b?.data.foods.find((f) => f[0] === code) ?? null;
}

/** Alle Werte eines Lebensmittels nach BLS-Gruppen (nur mit Angabe, außer `all`). */
export function groups(b, f, all = false) {
  const out = [];
  b.data.nutrients.forEach((n, i) => {
    const raw = f[4][i];
    if (!all && (raw === null || raw === undefined)) return;
    let g = out.find((x) => x.group === n.group);
    if (!g) out.push((g = { group: n.group, items: [] }));
    g.items.push({
      nutrient: n,
      amount: typeof raw === "number" ? raw : null,
      flag: typeof raw === "string" ? raw : null,
      origin: b.data.origins[f[5]?.[i]] ?? null,
    });
  });
  return out;
}

/** Anzeige eines Werts: „13,22 g“, „Spuren“ oder „keine Angabe“. */
export function describe(item) {
  if (item.amount !== null) return `${(Math.round(item.amount * 1000) / 1000).toLocaleString("de-DE", { maximumFractionDigits: 3 })} ${item.nutrient.unit}`;
  if (item.flag) return flagLabel(item.flag);
  return "keine Angabe";
}

/**
 * Als eigenes Lebensmittel übernehmen (wie `blsFoodInput`). Ergebnis { ok, row, zeroed } bzw.
 * { ok: false, message } (Pflichtangabe fehlt oder Werte passen nicht zu den Prüfregeln).
 */
const DETAIL_FIELDS = [
  { code: "FAMS", label: "einfach ungesättigte Fettsäuren" },
  { code: "FAPU", label: "mehrfach ungesättigte Fettsäuren" },
  { code: "STARCH", label: "Stärke" },
  { code: "WATER", label: "Wasser" },
];

export function takeover(b, f, { id, now = new Date() }) {
  const v = (field) => {
    const raw = f[4][b.pos[FOOD_FIELDS[field].code]];
    if (typeof raw === "number") return Math.round(raw * 100) / 100;
    return typeof raw === "string" ? 0 : null;
  };
  // Weitere Angaben (1.163.0, wie `BLS_DETAIL_FIELDS` am PC); Werte über 100 g auf 100 begrenzt
  const d = (code) => {
    const raw = b.pos[code] === undefined ? undefined : f[4][b.pos[code]];
    if (typeof raw === "number") return Math.min(100, Math.round(raw * 100) / 100);
    return typeof raw === "string" ? 0 : null;
  };
  const zeroed = [...Object.values(FOOD_FIELDS), ...DETAIL_FIELDS]
    .filter((x) => b.pos[x.code] !== undefined && typeof f[4][b.pos[x.code]] === "string")
    .map((x) => `${x.label} (${flagLabel(f[4][b.pos[x.code]])})`);
  const missing = REQUIRED.filter((k) => v(k) === null).map((k) => FOOD_FIELDS[k].label);
  if (missing.length) return { ok: false, message: `Im BLS fehlt: ${missing.join(", ")}. Bitte das Lebensmittel selbst anlegen.` };
  const parts = [`Quelle: ${CITATION_SHORT}, Code ${f[0]}. Werte je 100 g essbarer Anteil.`];
  if (zeroed.length) parts.push(`Als 0 übernommen: ${zeroed.join(", ")}.`);
  if (f[3]) parts.push(f[3]);
  try {
    const row = foodRow(
      {
        name: f[1].slice(0, 100),
        brand: BLS_BRAND,
        basisUnit: "g",
        energyKcal: v("energyKcal"),
        proteinG: v("proteinG"),
        carbsG: v("carbsG"),
        fatG: v("fatG"),
        fiberG: v("fiberG"),
        sugarG: v("sugarG"),
        saturatedFatG: v("saturatedFatG"),
        saltG: v("saltG"),
        monoFatG: d("FAMS"),
        polyFatG: d("FAPU"),
        transFatG: null,
        starchG: d("STARCH"),
        waterG: d("WATER"),
        // Aminosäuren (1.165.0, wie `blsAminos` am PC): nur Zahlen, Kennzeichen bleiben leer
        aminos: Object.fromEntries(
          AMINOS.map((a) => [a.key, b.pos[a.bls] === undefined ? undefined : f[4][b.pos[a.bls]]])
            .filter(([, x]) => typeof x === "number")
            .map(([k, x]) => [k, Math.min(100, Math.round(x * 1000) / 1000)]),
        ),
        portionName: null,
        portionAmount: null,
        notes: parts.join(" ").slice(0, 1000),
      },
      id,
      now.toISOString(),
    );
    return { ok: true, row, zeroed };
  } catch (e) {
    return { ok: false, message: `Übernahme nicht möglich: ${e.message}.` };
  }
}
