// LIFESPAN OS Mobil – Herstellerpakete installieren (1.27.0). Reine Logik ohne Oberfläche.
//
// Gleiche Paketdatei wie am PC (`vendor_package.rs`): JSON mit `format = "lifespan-os-paket"`,
// `version`, `package` (Schlüssel, Hersteller, Titel, Paketversion, Quelle), Nährstofffeldern,
// Lebensmitteln und Supplements. Ablauf wie am PC:
// - fehlende Einträge anlegen; vorhandene (gleiche ID, Lebensmittel: gleicher Name und gleiche Marke,
//   Supplements: gleicher Name) bleiben unverändert; eine neuere Paketversion ergänzt nur Neues,
// - Nährstofffelder abgleichen: gleiche Einheit → übernehmen, eigenes Feld mit gleichem Namen →
//   umschlüsseln, unbekanntes eigenes Feld → anlegen, andere Einheit → Werte dieses Felds auslassen,
// - fehlerhafte Einträge werden übersprungen und genannt.
// Am Handy landen Lebensmittel in `S.food.local.foods` (mit `pkg`), Supplements, eigene Felder und das
// Paket selbst in `S.supp` (`supplements`, `fields`, `packages`). Alles geht mit „Lebensmittel
// senden“ an den PC (dort `vendor_package` + `vendor_package_item`, Abgleich über den Paketschlüssel).

import { CATALOG, EDITABLE_GROUPS } from "./nutrientcatalog.js";

export const FORMAT = "lifespan-os-paket";
export const VERSION = 1;
export const MAX_ITEMS = 5000;
export const MAX_BYTES = 20 * 1024 * 1024;
export const SUPPLEMENT_UNITS = ["Kapsel(n)", "Tablette(n)", "Messlöffel", "Tropfen", "Portion(en)", "g", "mg", "µg", "IE", "ml"];
export const FIELD_UNITS = ["g", "mg", "µg", "IE", "KBE", "FCC", "ml"];
const CUSTOM_PREFIX = "custom_";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const norm = (s) => String(s ?? "").trim().toLowerCase();
const txt = (v) => (typeof v === "string" ? v.trim() : "");
const optTxt = (v, max) => {
  const t = txt(v);
  if (!t) return null;
  if ([...t].length > max) throw new Error(`höchstens ${max} Zeichen`);
  return t;
};
const reqTxt = (v, what, max) => {
  const t = txt(v);
  if (!t) throw new Error(`${what} fehlt`);
  if ([...t].length > max) throw new Error(`${what}: höchstens ${max} Zeichen`);
  return t;
};

// ------------------------------------------------------------------ Datei lesen

/** Dateiinhalt (Text oder Objekt) lesen und prüfen wie `vendor_package::parse`. */
export function parsePackage(content) {
  if (typeof content === "string" && content.length > MAX_BYTES) throw new Error("Die Datei ist zu groß.");
  const notOurs = new Error("Die Datei ist kein Hersteller-Paket für LIFESPAN OS. Bitte eine Paketdatei (.json) wählen.");
  let v = content;
  if (typeof content === "string") {
    try {
      v = JSON.parse(content);
    } catch {
      throw notOurs;
    }
  }
  if (!v || typeof v !== "object" || v.format !== FORMAT) throw notOurs;
  if (Number(v.version ?? 0) > VERSION) throw new Error("Das Paket ist für eine neuere Version von LIFESPAN OS. Bitte zuerst die App aktualisieren.");
  const p = v.package ?? {};
  const key = txt(p.key);
  if (!key || key.length > 80 || !/^[a-z0-9-]+$/.test(key)) throw new Error("Das Paket hat keinen gültigen Schlüssel.");
  let meta;
  try {
    meta = {
      key,
      manufacturer: reqTxt(p.manufacturer, "Hersteller", 80),
      title: reqTxt(p.title, "Titel", 120),
      version: reqTxt(p.version, "Version", 40),
      source: optTxt(p.source, 300),
      description: optTxt(p.description, 1000),
    };
  } catch {
    throw new Error("Die Angaben zum Paket (Hersteller, Titel, Version) fehlen.");
  }
  const foods = Array.isArray(v.foods) ? v.foods : [];
  const supplements = Array.isArray(v.supplements) ? v.supplements : [];
  const count = foods.length + supplements.length;
  if (!count) throw new Error("Das Paket enthält keine Einträge.");
  if (count > MAX_ITEMS) throw new Error(`Das Paket enthält mehr als ${MAX_ITEMS} Einträge.`);
  return { package: meta, fields: Array.isArray(v.fields) ? v.fields : [], foods, supplements };
}

// ------------------------------------------------------------------ Prüfregeln (wie die Datenbank)

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

function between(v, lo, hi, label, { optional = false } = {}) {
  const n = num(v);
  if (n === null) {
    if (optional && (v === null || v === undefined)) return null;
    throw new Error(`${label} fehlt`);
  }
  if (n < lo || n > hi) throw new Error(`${label} muss zwischen ${lo} und ${hi} liegen`);
  return round(n, 2);
}

/** Lebensmittel aus dem Paket → Zeile `food` (Prüfregeln der Migrationen). */
export function foodRow(r, id, iso) {
  const name = reqTxt(r.name, "Name", 100);
  const brand = txt(r.brand);
  if ([...brand].length > 60) throw new Error("Marke: höchstens 60 Zeichen");
  const basis = r.basisUnit === "ml" ? "ml" : r.basisUnit === "g" ? "g" : null;
  if (!basis) throw new Error("Bezugsgröße muss g oder ml sein");
  const row = {
    id,
    name,
    brand,
    basis_unit: basis,
    energy_kcal: between(r.energyKcal, 0, 900, "Energie"),
    protein_g: between(r.proteinG, 0, 100, "Protein"),
    carbs_g: between(r.carbsG, 0, 100, "Kohlenhydrate"),
    fat_g: between(r.fatG, 0, 100, "Fett"),
    fiber_g: between(r.fiberG, 0, 100, "Ballaststoffe", { optional: true }),
    sugar_g: between(r.sugarG, 0, 100, "Zucker", { optional: true }),
    saturated_fat_g: between(r.saturatedFatG, 0, 100, "Gesättigte Fettsäuren", { optional: true }),
    salt_g: between(r.saltG, 0, 100, "Salz", { optional: true }),
    portion_name: optTxt(r.portionName, 40),
    portion_amount: r.portionAmount === null || r.portionAmount === undefined ? null : between(r.portionAmount, 0.01, 5000, "Portionsmenge"),
    notes: optTxt(r.notes, 1000),
    archived: 0,
    created_at: iso,
    updated_at: iso,
  };
  if ((row.portion_name === null) !== (row.portion_amount === null)) throw new Error("Portion braucht Name und Menge");
  if (row.sugar_g !== null && row.sugar_g > row.carbs_g) throw new Error("Zucker kann nicht mehr sein als Kohlenhydrate");
  if (row.saturated_fat_g !== null && row.saturated_fat_g > row.fat_g) throw new Error("Gesättigte Fettsäuren können nicht mehr sein als Fett");
  if (basis === "g" && row.protein_g + row.carbs_g + row.fat_g > 100.5) throw new Error("Protein, Kohlenhydrate und Fett zusammen über 100 g je 100 g");
  return row;
}

const maxFor = (unit) => (unit === "kcal" ? 20000 : unit === "g" ? 5000 : unit === "mg" || unit === "ml" ? 1000000 : 10000000);

/** Supplement aus dem Paket → Zeile `supplement` und Nährwerte (nur bekannte Felder). */
export function supplementRow(r, id, iso, nutrients) {
  const name = reqTxt(r.name, "Name", 80);
  if (!SUPPLEMENT_UNITS.includes(r.unit)) throw new Error("Bitte eine Einheit wählen");
  const serving = num(r.servingAmount ?? 1);
  if (serving === null || serving < 0.001 || serving > 100000) throw new Error("Die Menge muss zwischen 0,001 und 100.000 liegen");
  const values = {};
  for (const [key, value] of Object.entries(r.values ?? {})) {
    const def = nutrients.get(key);
    if (!def) throw new Error(`Unbekannter Nährstoff „${key}“`);
    const n = num(value);
    if (n === null || n < 0 || n > maxFor(def.unit)) throw new Error(`${def.label}: Wert außerhalb des erlaubten Bereichs`);
    values[key] = round(n, def.unit === "kcal" ? 1 : 3);
  }
  return {
    row: {
      id,
      name,
      unit: r.unit,
      notes: optTxt(r.notes, 1000),
      archived: 0,
      created_at: iso,
      updated_at: iso,
      manufacturer: optTxt(r.manufacturer, 80),
      serving_amount: round(serving, 3),
      daily_dose: r.dailyDose ? 1 : 0,
    },
    values,
  };
}

// ------------------------------------------------------------------ Installieren

/**
 * Nährstoffkatalog am Handy: eingebaute Felder (mit Änderungen vom PC) und eigene Felder (vom PC und
 * am Handy angelegt). `stored` = Zeilen `nutrient_field` (zusammengeführt).
 */
export function nutrientMap(stored) {
  const m = new Map();
  for (const d of CATALOG) {
    const over = stored.find((s) => s.builtin && s.key === d.key);
    m.set(d.key, { key: d.key, label: over?.label ?? d.label, unit: over?.unit ?? d.unit, custom: false });
  }
  for (const s of stored) if (!s.builtin) m.set(s.key, { key: s.key, label: s.label, unit: s.unit, custom: true });
  return m;
}

const isCustomKey = (k) => typeof k === "string" && k.length <= 60 && k.startsWith(CUSTOM_PREFIX) && /^[a-z0-9]+$/i.test(k.slice(CUSTOM_PREFIX.length));

/**
 * Installation berechnen (ändert nichts). `ctx` = { foods: Map id → Zeile (alle bekannten),
 * supplements: Map id → Zeile, fields: Zeilen `nutrient_field`, installed: { version } | null, uuid, now }.
 * Ergebnis: Bericht wie am PC plus die neuen Zeilen.
 */
export function planInstall(pkg, ctx) {
  const iso = (ctx.now ?? new Date()).toISOString();
  const skipped = [];
  const fieldsSkipped = [];
  const fieldsAdded = [];
  const newFields = [];
  const nutrients = nutrientMap(ctx.fields);

  // Lebensmittel
  const foodKey = (name, brand) => `${norm(name)}|${norm(brand)}`;
  const foodIndex = new Map([...ctx.foods.values()].map((f) => [foodKey(f.name, f.brand), f.id]));
  const foods = { inFile: pkg.foods.length, added: 0, kept: 0 };
  const newFoods = [];
  const keptFoods = [];
  for (const r of pkg.foods) {
    const ownId = UUID.test(String(r.id ?? "")) ? String(r.id).toLowerCase() : null;
    const existing = (ownId && ctx.foods.has(ownId) ? ownId : null) ?? foodIndex.get(foodKey(r.name, r.brand));
    if (existing) {
      foods.kept += 1;
      if (existing === ownId) keptFoods.push(ownId);
      continue;
    }
    try {
      const row = foodRow(r, ownId ?? ctx.uuid(), iso);
      newFoods.push(row);
      foodIndex.set(foodKey(row.name, row.brand), row.id);
      foods.added += 1;
    } catch (e) {
      skipped.push(`„${txt(r.name) || "Ohne Namen"}“: ${e.message}`);
    }
  }

  // Nährstofffelder (nur wenn Supplements dabei sind)
  const remap = new Map();
  if (pkg.supplements.length) {
    for (const f of pkg.fields) {
      const label = txt(f.label);
      if (!label || [...label].length > 80) {
        remap.set(f.key, null);
        continue;
      }
      const here = nutrients.get(f.key);
      let target;
      if (here) target = here.unit === f.unit ? { ok: f.key } : { err: here.unit };
      else if (!isCustomKey(f.key)) target = { err: "unbekannt" };
      else {
        const same = [...nutrients.values()].find((n) => n.label.toLowerCase() === label.toLowerCase());
        if (same) target = same.unit === f.unit ? { ok: same.key } : { err: same.unit };
        else if (FIELD_UNITS.includes(f.unit) && EDITABLE_GROUPS.includes(f.group)) {
          const row = { id: ctx.uuid(), key: f.key, group_key: f.group, label, unit: f.unit, builtin: 0, created_at: iso, updated_at: iso };
          newFields.push(row);
          nutrients.set(f.key, { key: f.key, label, unit: f.unit, custom: true });
          fieldsAdded.push(label);
          target = { ok: f.key };
        } else target = { err: "unbekannt" };
      }
      if (target.err) {
        fieldsSkipped.push(`${label} (hier ${target.err}, im Paket ${f.unit})`);
        remap.set(f.key, null);
      } else if (target.ok !== f.key) remap.set(f.key, target.ok);
    }
  }

  // Supplements
  const suppIndex = new Map([...ctx.supplements.values()].map((s) => [norm(s.name), s.id]));
  const supplements = { inFile: pkg.supplements.length, added: 0, kept: 0 };
  const newSupps = [];
  const keptSupps = [];
  for (const r of pkg.supplements) {
    const ownId = UUID.test(String(r.id ?? "")) ? String(r.id).toLowerCase() : null;
    const existing = (ownId && ctx.supplements.has(ownId) ? ownId : null) ?? suppIndex.get(norm(r.name));
    if (existing) {
      supplements.kept += 1;
      if (existing === ownId) keptSupps.push(ownId);
      continue;
    }
    const values = {};
    for (const [k, v] of Object.entries(r.values ?? {})) {
      if (!remap.has(k)) values[k] = v;
      else if (remap.get(k)) values[remap.get(k)] = v;
    }
    try {
      const s = supplementRow({ ...r, values }, ownId ?? ctx.uuid(), iso, nutrients);
      newSupps.push(s);
      suppIndex.set(norm(s.row.name), s.row.id);
      supplements.added += 1;
    } catch (e) {
      skipped.push(`„${txt(r.name) || "Ohne Namen"}“: ${e.message}`);
    }
  }

  return {
    package: pkg.package,
    installedVersion: ctx.installed?.version ?? null,
    foods,
    supplements,
    fieldsAdded,
    fieldsSkipped,
    skipped,
    newFoods,
    newSupps,
    newFields,
    keptFoods,
    keptSupps,
  };
}

/**
 * Berechnete Installation übernehmen: Lebensmittel in `food` (Ablage der Ernährung), Supplements,
 * Felder und Paket in `supp`. `pcPackage` = Zeile `vendor_package` vom PC (falls dort installiert).
 */
export function applyInstall(plan, food, supp, { uuid, now = new Date(), pcPackage = null }) {
  const iso = now.toISOString();
  const key = plan.package.key;
  supp.supplements ??= {};
  supp.fields ??= {};
  supp.packages ??= {};
  for (const row of plan.newFoods) food.foods[row.id] = { row, sent: false, pkg: key };
  for (const s of plan.newSupps) supp.supplements[s.row.id] = { row: s.row, values: s.values, sent: false, pkg: key };
  for (const row of plan.newFields) supp.fields[row.key] = { row, sent: false, pkg: key };
  const old = supp.packages[key];
  const pkgId = old?.row.id ?? pcPackage?.id ?? uuid();
  const items = [...(old?.items ?? [])];
  const have = new Set(items.map((i) => `${i.kind}|${i.item_id}`));
  const link = (kind, id) => {
    if (have.has(`${kind}|${id}`)) return;
    have.add(`${kind}|${id}`);
    items.push({ id: uuid(), package_id: pkgId, kind, item_id: id, created_at: iso, updated_at: iso });
  };
  for (const row of plan.newFoods) link("food", row.id);
  for (const id of plan.keptFoods) link("food", id);
  for (const s of plan.newSupps) link("supplement", s.row.id);
  for (const id of plan.keptSupps) link("supplement", id);
  const p = plan.package;
  supp.packages[key] = {
    row: {
      id: pkgId,
      package_key: key,
      manufacturer: p.manufacturer,
      title: p.title,
      version: p.version,
      source: p.source,
      installed_at: old?.row.installed_at ?? pcPackage?.installed_at ?? iso,
      created_at: old?.row.created_at ?? pcPackage?.created_at ?? iso,
      updated_at: iso,
    },
    items,
    description: p.description,
    added: { foods: plan.foods.added, supplements: plan.supplements.added },
    sent: false,
  };
  return supp.packages[key];
}

/**
 * Am Handy installiertes, noch nicht gesendetes Paket zurücknehmen: seine neuen Lebensmittel,
 * Supplements und Felder entfernen – außer sie werden schon verwendet (`used(kind, id)`), dann
 * bleiben sie. Rückgabe: { removed, kept }.
 */
export function removeLocalPackage(key, food, supp, used) {
  let removed = 0;
  let kept = 0;
  for (const [id, f] of Object.entries(food.foods)) {
    if (f.pkg !== key || f.sent) continue;
    if (used("food", id)) {
      kept += 1;
      continue;
    }
    delete food.foods[id];
    removed += 1;
  }
  for (const [id, s] of Object.entries(supp.supplements ?? {})) {
    if (s.pkg !== key || s.sent) continue;
    if (used("supplement", id)) {
      kept += 1;
      continue;
    }
    delete supp.supplements[id];
    removed += 1;
  }
  const stillUsed = new Set(Object.values(supp.supplements ?? {}).flatMap((s) => Object.keys(s.values ?? {})));
  for (const [k, f] of Object.entries(supp.fields ?? {})) if (f.pkg === key && !f.sent && !stillUsed.has(k)) delete supp.fields[k];
  if (supp.packages?.[key] && !supp.packages[key].sent) delete supp.packages[key];
  return { removed, kept };
}

/** Installierte Pakete (PC und Handy) für die Anzeige, nach Hersteller sortiert. */
export function installedPackages(pcRows, supp) {
  const m = new Map();
  for (const r of pcRows ?? []) m.set(r.package_key, { key: r.package_key, manufacturer: r.manufacturer, title: r.title, version: r.version, where: "PC", sent: true });
  for (const [key, p] of Object.entries(supp?.packages ?? {})) {
    m.set(key, { key, manufacturer: p.row.manufacturer, title: p.row.title, version: p.row.version, where: "Handy", sent: p.sent, added: p.added });
  }
  return [...m.values()].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer, "de") || a.title.localeCompare(b.title, "de"));
}
