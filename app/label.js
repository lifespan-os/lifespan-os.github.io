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

/**
 * Lesefehler in Zahlen (1.2.1): Buchstaben, die die Texterkennung oft statt Ziffern liest, werden
 * in Zahlen ersetzt – „l2,S g“ → „12,5 g“, „O,4 g“ → „0,4 g“, „8,2 9“ → „8,2 g“ (g als 9 gelesen),
 * „3,1 q“ → „3,1 g“. Nur in Zahlen, die mit einer Ziffer beginnen (so bleibt „Vitamin B12“ erhalten).
 */
export function fixDigits(row) {
  return String(row)
    .replace(/(?<![A-Za-zÄÖÜäöüß\d])[Oo](?=[,.]\d)/g, "0")
    .replace(/(?<![A-Za-zÄÖÜäöüß\d])(?:\d|[lI|](?=\d))[\dOoIl|SB]*(?:[,.][\dOoIl|SB]+)?/g, (t) =>
      t
        .replace(/[Oo]/g, "0")
        .replace(/[I|]/g, "1")
        .replace(/l(?=[\d,.]|$)/g, (m, i) => (i === 0 || i + 1 < t.length ? "1" : m))
        .replace(/S/g, "5")
        .replace(/B/g, "8"),
    )
    .replace(/(\d)\s*q\b/g, "$1 g")
    .replace(/(\d[,.]\d+)\s+9(?=\s*(?:[\d(%*]|$))/g, "$1 g");
}

/** Typische Lesefehler in Zahlen glätten: „4,O g“ → „4,0 g“, „0.4g“ → „0,4 g“. */
export function normalizeRow(row) {
  return fixDigits(row)
    .replace(/(\d\s*[,.]\s*)[oO](?![a-zäöüß])/gi, (_, a) => `${a}0`)
    .replace(/(?<=\d)[oO](?=\s*(?:g|mg|µg|ug|kcal|kj|%)\b)/g, "0")
    .replace(/(\d)\s*[,.]\s*(\d)/g, "$1,$2")
    .replace(/(?<=[\s<(]|^)[oO](?=[,.]\d)/g, "0")
    .replace(/(\d)(g|mg|µg|ug|kj|kJ|KJ|kcal|ml)\b/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

const toNumber = (text) => Number(String(text).replace(",", "."));

/**
 * Erste Mengenangabe in Gramm einer Zeile (auch „< 0,5 g“); null, wenn keine.
 * Die Texterkennung liest „g“ oft als „9“ und hängt es an die Zahl (1.2.1): „12,59“ ohne Einheit
 * → 12,5 g, „649g“ (über 100 g je 100 g unmöglich) → 64 g. Eine Zahl ohne Einheit gilt als Gramm.
 */
function gramsIn(row) {
  const m = new RegExp(String.raw`(<|unter|weniger als)?\s*${NUM}\s*(g|mg)\b`, "i").exec(row);
  if (m) {
    let text = m[2];
    const mg = m[3].toLowerCase() === "mg";
    if (!mg && toNumber(text) > 100 && /\d9$/.test(text)) text = text.slice(0, -1);
    return { value: toNumber(text) / (mg ? 1000 : 1), lessThan: Boolean(m[1]) };
  }
  const n = new RegExp(String.raw`(<|unter|weniger als)?\s*(?<![\d,A-Za-zÄÖÜäöüß])${NUM}(?![\d,]|\s*(%|kj|kcal|ml|l)\b)`, "i").exec(row);
  if (!n) return null;
  let text = n[2];
  if (/,\d*9$/.test(text) || (toNumber(text) > 100 && /\d9$/.test(text))) text = text.slice(0, -1);
  text = text.replace(/,$/, "");
  return { value: toNumber(text), lessThan: Boolean(n[1]) };
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

/**
 * Unscharfe Bezeichnungen (1.2.1): „Eiwelß“, „Kohlenhyd rate“, „Ba1laststoffe“ … werden über den
 * Abstand der Buchstaben (Levenshtein) erkannt, wenn die genaue Schreibweise nicht passt.
 */
const FUZZY = [
  { key: "saturatedFatG", words: ["gesättigte", "gesattigte", "gesaettigte", "saturates", "saturated"] },
  { key: "sugarG", words: ["zucker", "sugars"] },
  { key: "fiberG", words: ["ballaststoffe", "fibre"] },
  { key: "proteinG", words: ["eiweiß", "eiweiss", "protein"] },
  { key: "saltG", words: ["salz"] },
  { key: "carbsG", words: ["kohlenhydrate", "carbohydrate"] },
  { key: "fatG", words: ["fett"], first: true },
];

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Wörter einer Zeile in Kleinbuchstaben; Ziffern mitten im Wort als Buchstaben gelesen. */
function wordsOf(row) {
  const map = { 0: "o", 1: "l", 3: "e", 5: "s", 8: "b", "|": "l" };
  const words = String(row)
    .toLowerCase()
    .split(/[^a-zäöüß0-9|]+/)
    .filter((w) => /[a-zäöüß]{2}/.test(w))
    .map((w) => w.replace(/[0-9|]/g, (c) => map[c] ?? c).replace(/[^a-zäöüß]/g, ""));
  // getrennt gelesene Wörter („Kohlenhyd rate“) zusätzlich zusammengesetzt prüfen
  const joined = words.slice(0, -1).map((w, i) => w + words[i + 1]);
  return { words, joined };
}

const allowed = (word) => (word.length <= 4 ? 1 : word.length <= 7 ? 1 : word.length <= 10 ? 2 : 3);

function fuzzyRule(row) {
  const { words, joined } = wordsOf(row);
  if (!words.length) return null;
  for (const r of FUZZY) {
    const candidates = r.first ? [words[0] === "davon" ? words[1] : words[0]].filter(Boolean) : [...words, ...joined];
    for (const w of candidates) {
      for (const k of r.words) {
        if (Math.abs(w.length - k.length) > allowed(k)) continue;
        if (distance(w, k) <= allowed(k)) return r;
        // abgeschnittene Wörter („Kohlenhydr.“): Anfang genügt bei langen Wörtern
        if (k.length >= 9 && w.length >= 7 && distance(w, k.slice(0, w.length)) <= 1) return r;
      }
    }
  }
  return null;
}

/** Nährstoff einer Zeile: zuerst genaue Schreibweise, sonst unscharf. */
export function ruleFor(row) {
  return NUTRIENT_RULES.find((r) => r.test.test(row)) ?? fuzzyRule(row);
}

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
    if (ruleFor(row) || EXTRA_RULE.test(row) || ENERGY.test(row)) continue;
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
    const rule = ruleFor(row);
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

// ------------------------------------------------------------------ Prüfen und reparieren (1.2.1)

const GRAM_KEYS = ["fatG", "saturatedFatG", "carbsG", "sugarG", "fiberG", "proteinG", "saltG"];
const round1 = (v) => Math.round(v * 10) / 10;
/** Brennwert aus den Hauptnährstoffen (kcal je g: Fett 9, Kohlenhydrate und Eiweiß 4, Ballaststoffe 2). */
export function macroKcal(v) {
  if (v.fatG === undefined || v.carbsG === undefined || v.proteinG === undefined) return null;
  return 9 * v.fatG + 4 * v.carbsG + 4 * v.proteinG + 2 * (v.fiberG ?? 0);
}
const kcalFits = (kcal, macro) => Math.abs(kcal - macro) <= Math.max(15, macro * 0.15);

/**
 * Offensichtliche Lesefehler beheben: Werte über 100 g je 100 g (Komma nicht erkannt: „125“ statt
 * „12,5“) werden durch 10 bzw. 100 geteilt; ein Brennwert, der nicht zu den kJ passt, wird aus den kJ
 * gerechnet, wenn das zu Fett, Kohlenhydraten und Eiweiß passt. `scan.corrected` nennt die Felder.
 */
export function repairScan(scan) {
  const values = { ...scan.values };
  const corrected = [];
  for (const k of GRAM_KEYS) {
    let v = values[k];
    if (v === undefined || v <= 100) continue;
    while (v > 100) v /= 10;
    values[k] = round1(v);
    corrected.push(k);
  }
  const macro = macroKcal(values);
  const fromKj = scan.energyKj !== null && scan.energyKj > 0 ? Math.round(scan.energyKj / KJ_PER_KCAL) : null;
  const kcal = values.energyKcal;
  if (kcal !== undefined && fromKj !== null && Math.abs(kcal - fromKj) > Math.max(5, fromKj * 0.06)) {
    const kcalOk = macro !== null && kcalFits(kcal, macro);
    const kjOk = macro !== null && kcalFits(fromKj, macro);
    if ((kjOk && !kcalOk) || (macro === null && kcal > 900)) {
      values.energyKcal = fromKj;
      corrected.push("energyKcal");
    }
  } else if (kcal !== undefined && kcal > 900 && macro !== null) {
    // kJ als kcal gelesen
    const asKj = Math.round(kcal / KJ_PER_KCAL);
    if (kcalFits(asKj, macro)) {
      values.energyKcal = asKj;
      corrected.push("energyKcal");
    }
  }
  return { ...scan, values, corrected };
}

/**
 * Plausibilität der Werte je 100 g/ml → Hinweise je Feld (nur Hinweise, nichts wird geändert):
 * gesättigte Fettsäuren ≤ Fett, Zucker ≤ Kohlenhydrate, Summe ≤ 100 g, Brennwert passend zu den
 * Hauptnährstoffen (± 15 %, mind. 15 kcal) und zu den kJ.
 */
export function checkValues(values, energyKj = null) {
  const w = {};
  const has = (k) => values[k] !== undefined && values[k] !== null && Number.isFinite(values[k]);
  if (has("saturatedFatG") && has("fatG") && values.saturatedFatG > values.fatG + 0.05) {
    w.saturatedFatG = "Mehr als das Fett – bitte prüfen.";
  }
  if (has("sugarG") && has("carbsG") && values.sugarG > values.carbsG + 0.05) {
    w.sugarG = "Mehr als die Kohlenhydrate – bitte prüfen.";
  }
  for (const k of GRAM_KEYS) if (has(k) && values[k] > 100) w[k] = "Mehr als 100 g je 100 g – Komma vergessen?";
  const sum = ["fatG", "carbsG", "proteinG", "fiberG", "saltG"].reduce((s, k) => s + (has(k) ? values[k] : 0), 0);
  if (sum > 102 && !Object.keys(w).length) w.sum = `Zusammen ${String(round1(sum)).replace(".", ",")} g je 100 g – ein Wert ist zu hoch.`;
  const macro = ["fatG", "carbsG", "proteinG"].every(has) ? macroKcal(values) : null;
  if (has("energyKcal")) {
    if (macro !== null && !kcalFits(values.energyKcal, macro)) {
      w.energyKcal = `Passt nicht zu Fett, Kohlenhydraten und Eiweiß (gerechnet etwa ${Math.round(macro)} kcal) – bitte prüfen.`;
    } else if (energyKj && Math.abs(values.energyKcal - energyKj / KJ_PER_KCAL) > Math.max(5, energyKj / KJ_PER_KCAL * 0.06)) {
      w.energyKcal = `Passt nicht zu ${Math.round(energyKj)} kJ (= ${Math.round(energyKj / KJ_PER_KCAL)} kcal) – bitte prüfen.`;
    }
  }
  return w;
}

/** Güte eines Scans zum Vergleich mehrerer Durchgänge der Texterkennung. */
export function scanScore(scan) {
  const warnings = Object.keys(checkValues(scan.values, scan.energyKj)).length;
  return recognizedCount(scan) * 10 - warnings * 6 + (scan.barcode ? 3 : 0) + (scan.basis ? 2 : 0);
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
