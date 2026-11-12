// LIFESPAN OS Mobil – Etikett-Scanner: Nährwerte aus erkanntem Text lesen.
// Gleiche Regeln wie die Desktop-App (src/domain/labelScan.ts). Läuft im Browser und unter Node.
//
// Eingabe sind Textzeilen (Texterkennung in der App oder „Text scannen“ des iPhones). Bezeichnung
// und Wert stehen meist in einer Zeile; steht der Wert in der nächsten Zeile, wird er dort
// gesucht. Kommen erst alle Bezeichnungen und danach alle Werte (spaltenweise gelesen, typisch
// für „Text scannen“), werden sie der Reihe nach zugeordnet.

export const LABEL_KEYS = [
  "energyKcal",
  "fatG",
  "saturatedFatG",
  "carbsG",
  "sugarG",
  "fiberG",
  "proteinG",
  "saltG",
];

export const LABEL_NAMES = {
  energyKcal: "Brennwert",
  fatG: "Fett",
  saturatedFatG: "davon gesättigte Fettsäuren",
  carbsG: "Kohlenhydrate",
  sugarG: "davon Zucker",
  fiberG: "Ballaststoffe",
  proteinG: "Eiweiß",
  saltG: "Salz",
};

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const KJ_PER_KCAL = 4.184;

/** Typische Lesefehler in Zahlen glätten: „4,O g“ → „4,0 g“, „0.4g“ → „0,4 g“. */
export function normalizeRow(row) {
  return String(row)
    .replace(/(\d\s*[,.]\s*)[oO](?![a-zäöüß])/gi, (_, a) => `${a}0`)
    .replace(/(?<=\d)[oO](?=\s*(?:g|mg|µg|ug|kcal|kj|%)\b)/g, "0")
    .replace(/(\d)\s*[,.]\s*(\d)/g, "$1,$2")
    .replace(/(?<=[\s<(]|^)[oO](?=[,.]\d)/g, "0")
    .replace(/(\d)(g|mg|µg|ug|kj|kJ|KJ|kcal|ml)\b/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

const toNumber = (text) => Number(String(text).replace(",", "."));

/** Erste Mengenangabe in Gramm einer Zeile (auch „< 0,5 g“); null, wenn keine. */
function gramsIn(row) {
  const m = new RegExp(String.raw`(<|unter|weniger als)?\s*${NUM}\s*(g|mg)\b`, "i").exec(row);
  if (!m) return null;
  const value = toNumber(m[2]) / (m[3].toLowerCase() === "mg" ? 1000 : 1);
  return { value, lessThan: Boolean(m[1]) };
}

const NUTRIENT_RULES = [
  { key: "saturatedFatG", test: /gesättigt|gesattigt|saturat/i },
  { key: "sugarG", test: /zucker|sugar/i },
  { key: "fiberG", test: /ballast|fib(re|er)/i },
  { key: "proteinG", test: /eiwei|protein/i },
  { key: "saltG", test: /\bsalz|\bsalt/i },
  { key: "carbsG", test: /kohlenhydrat|carbohydrate/i },
  { key: "fatG", test: /^\W*(davon\s+)?(fett|fat)\b/i },
];

const SKIP = /ungesättigt|ungesattigt|mehrwertige|polyole|stärke|starke/i;
const ENERGY = /brennwert|energie|energy|kcal|\bkj\b/i;

/** Weitere Angaben, die nicht in der Nährwerttabelle des Lebensmittels gespeichert werden. */
const EXTRA_RULE =
  /^\W*(vitamin\s*[a-z]\d*|magnesium|calcium|kalzium|kalium|eisen|zink|jod|selen|folsäure|biotin|niacin|pantothensäure|riboflavin|thiamin|koffein|coffein|caffeine?|taurin|phosphor|omega-?3|natrium|chlorid|kupfer|mangan)\b/i;

/** Zeile ohne eigene Bezeichnung (nur Zahlen, Einheiten, Prozent). */
const valueOnly = (row) => !/[a-zäöüß]{3,}/i.test(row.replace(/\b(g|mg|µg|unter|kcal|kj)\b/gi, ""));

/** Gültige Prüfziffer eines Strichcodes (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function validBarcode(code) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((s, d, i) => s + (i % 2 === 0 ? d * 3 : d), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function findBarcode(rows) {
  for (const row of rows) {
    const compact = String(row).replace(/[\s-]/g, "");
    for (const m of compact.matchAll(/\d{8,14}/g)) {
      if ([13, 8, 12, 14].includes(m[0].length) && validBarcode(m[0])) return m[0];
    }
  }
  return null;
}

function findBasis(text) {
  if (/100\s*ml\b/i.test(text)) return "ml";
  if (/100\s*g\b/i.test(text)) return "g";
  return null;
}

function findPackage(rows, basis, consumed) {
  const amounts = [];
  for (const [i, row] of rows.entries()) {
    if (consumed.has(i)) continue;
    if (NUTRIENT_RULES.some((r) => r.test.test(row)) || EXTRA_RULE.test(row) || ENERGY.test(row)) continue;
    for (const m of row.matchAll(new RegExp(String.raw`${NUM}\s*(ml|l|g|kg)\b`, "gi"))) {
      const n = toNumber(m[1]);
      const unit = m[2].toLowerCase();
      const amount = unit === "l" || unit === "kg" ? n * 1000 : n;
      if (amount === 100 || amount <= 0 || amount > 5000) continue;
      amounts.push({ amount, unit: unit === "l" || unit === "ml" ? "ml" : "g" });
    }
  }
  const wanted = amounts.filter((a) => a.unit === (basis ?? "g"));
  const list = wanted.length > 0 ? wanted : amounts;
  return list.length > 0 ? Math.max(...list.map((a) => a.amount)) : null;
}

/** Text (mehrzeilig) oder Zeilen → erkannte Werte je 100 g/ml. */
export function parseLabel(input) {
  const rawRows = Array.isArray(input) ? input : String(input ?? "").split(/\r?\n/);
  const rows = rawRows.map(normalizeRow).filter((r) => r !== "");
  const text = rows.join("\n");
  const scan = {
    basis: findBasis(text),
    values: {},
    lessThan: [],
    energyKj: null,
    packageAmount: null,
    extras: [],
    barcode: findBarcode(rawRows),
  };

  const kcal = new RegExp(String.raw`${NUM}\s*kcal`, "i").exec(text);
  const kj = new RegExp(String.raw`${NUM}\s*kj`, "i").exec(text);
  if (kj) scan.energyKj = toNumber(kj[1]);
  if (kcal) scan.values.energyKcal = toNumber(kcal[1]);
  else if (scan.energyKj !== null) scan.values.energyKcal = Math.round(scan.energyKj / KJ_PER_KCAL);

  const used = new Set(); // Zeilen, deren Wert schon zugeordnet ist
  const open = []; // Bezeichnungen ohne Wert (spaltenweise gelesen)
  rows.forEach((row, i) => {
    if (ENERGY.test(row) && !/zucker/i.test(row)) return;
    const extra = EXTRA_RULE.exec(row);
    if (extra) {
      const m = new RegExp(String.raw`${NUM}\s*(mg|µg|ug|g)\b`, "i").exec(row);
      if (m) {
        const label = extra[1].replace(/\s+/g, " ");
        scan.extras.push({
          label: label.charAt(0).toUpperCase() + label.slice(1),
          amount: toNumber(m[1]),
          unit: m[2].replace("ug", "µg"),
        });
      }
      return;
    }
    if (SKIP.test(row)) return;
    const rule = NUTRIENT_RULES.find((r) => r.test.test(row));
    if (!rule || scan.values[rule.key] !== undefined) return;
    let found = gramsIn(row);
    const next = rows[i + 1];
    if (!found && next && valueOnly(next) && !ENERGY.test(next) && !used.has(i + 1)) {
      found = gramsIn(next);
      if (found) used.add(i + 1);
    }
    if (!found) {
      open.push(rule.key);
      return;
    }
    scan.values[rule.key] = found.value;
    if (found.lessThan) scan.lessThan.push(rule.key);
  });

  // Spaltenweise: offene Bezeichnungen der Reihe nach mit den übrigen reinen Wertzeilen füllen
  if (open.length > 0) {
    const values = rows
      .map((row, i) => ({ row, i }))
      .filter(({ row, i }) => !used.has(i) && valueOnly(row) && !ENERGY.test(row) && gramsIn(row));
    if (values.length >= open.length) {
      open.forEach((key, n) => {
        const found = gramsIn(values[n].row);
        used.add(values[n].i);
        scan.values[key] = found.value;
        if (found.lessThan) scan.lessThan.push(key);
      });
    }
  }

  const sodium = scan.extras.find((e) => /natrium/i.test(e.label));
  if (scan.values.saltG === undefined && sodium) {
    const grams = sodium.unit === "g" ? sodium.amount : sodium.amount / 1000;
    scan.values.saltG = Math.round(grams * 2.5 * 100) / 100;
  }

  scan.packageAmount = findPackage(rows, scan.basis, used);
  return scan;
}

export const recognizedCount = (scan) => LABEL_KEYS.filter((k) => scan.values[k] !== undefined).length;

/** Weitere Angaben als Notiz: „Je 100 ml: Magnesium 38 mg · Koffein 32 mg“. */
export function extrasNote(scan, basis) {
  if (!scan.extras.length) return "";
  return `Je 100 ${basis}: ${scan.extras.map((e) => `${e.label} ${String(e.amount).replace(".", ",")} ${e.unit}`).join(" · ")}`;
}

const NAME_SKIP =
  /nährwert|nahrwert|durchschnitt|brennwert|energie|zutaten|ingredients|haltbar|mindestens|gekühlt|lagern|hergestellt|\d/i;

/** Vorschlag für den Namen: die erste Textzeile vor der Nährwerttabelle. */
export function guessName(input) {
  const rows = Array.isArray(input) ? input : String(input ?? "").split(/\r?\n/);
  for (const row of rows) {
    const clean = String(row).replace(/\s+/g, " ").trim();
    if (/nährwert|nahrwert|brennwert|energie/i.test(clean)) break;
    if (clean.length >= 3 && clean.length <= 60 && !NAME_SKIP.test(clean)) return clean;
  }
  return "";
}
