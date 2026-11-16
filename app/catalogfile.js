// LIFESPAN OS Mobil – Lebensmittel- und Supplementdatenbank als Datei (1.46.0). Reine Logik.
//
// Gleiches Dateiformat wie am PC (`repo/catalog_transfer.rs`): JSON mit
// `format = "lifespan-os-katalog"`, `version`, `kind` („foods“ oder „supplements“), `exportedAt`,
// Nährstofffeldern (`fields`, nur Supplements) und den Einträgen (`foods` bzw. `supplements`).
// Eine am Handy exportierte Datei lässt sich am PC unter Import/Export → Lebensmittel- und
// Supplementdatenbank importieren und umgekehrt.
// Import am Handy wie „nur neue Einträge“ am PC: vorhandene (gleiche ID, Lebensmittel: gleicher Name
// und gleiche Marke, Supplements: gleicher Name) bleiben unverändert, fehlerhafte Einträge werden
// übersprungen und genannt. Prüfregeln und Felderabgleich kommen aus vendor.js (Herstellerpakete).

import { planInstall } from "./vendor.js";

export const FORMAT = "lifespan-os-katalog";
export const VERSION = 1;
export const MAX_ITEMS = 20000;
export const MAX_BYTES = 50 * 1024 * 1024;

export const LABEL = { foods: "Lebensmitteldatenbank", supplements: "Supplementdatenbank" };

const opt = (v) => (v === undefined ? null : v);

/** Datei aus den Daten am Handy (vom PC geladen und am Handy angelegt). `db` = buildDb(). */
export function buildCatalogFile(kind, db, nutrients, now = new Date()) {
  const file = { format: FORMAT, version: VERSION, kind, exportedAt: now.toISOString() };
  if (kind === "foods") {
    file.foods = [...db.foods.values()]
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "de"))
      .map((f) => ({
        id: f.id,
        name: f.name,
        brand: f.brand ? f.brand : null,
        basisUnit: f.basis_unit,
        energyKcal: f.energy_kcal,
        proteinG: f.protein_g,
        carbsG: f.carbs_g,
        fatG: f.fat_g,
        fiberG: opt(f.fiber_g),
        sugarG: opt(f.sugar_g),
        saturatedFatG: opt(f.saturated_fat_g),
        saltG: opt(f.salt_g),
        portionName: opt(f.portion_name),
        portionAmount: opt(f.portion_amount),
        notes: opt(f.notes),
        archived: !!f.archived,
      }));
    if (!file.foods.length) throw new Error("Die Lebensmitteldatenbank enthält noch keine Einträge.");
  } else {
    const values = db.supValues ?? new Map();
    const used = new Set();
    file.supplements = [...db.supplements.values()]
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "de"))
      .map((s) => {
        const v = {};
        for (const r of values.get(s.id) ?? []) {
          v[r.nutrient] = r.amount;
          used.add(r.nutrient);
        }
        return {
          id: s.id,
          name: s.name,
          manufacturer: opt(s.manufacturer),
          unit: s.unit,
          servingAmount: s.serving_amount ?? 1,
          dailyDose: !!s.daily_dose,
          notes: opt(s.notes),
          archived: !!s.archived,
          values: v,
        };
      });
    if (!file.supplements.length) throw new Error("Die Supplementdatenbank enthält noch keine Einträge.");
    file.fields = nutrients.filter((n) => used.has(n.key)).map((n) => ({ key: n.key, group: n.group, label: n.label, unit: n.unit }));
  }
  return file;
}

/** Dateiname wie am PC, z. B. „Lebensmitteldatenbank 2026-11-16.json“. */
export function fileName(kind, now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${LABEL[kind]} ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/** Dateiinhalt lesen und prüfen wie `catalog_transfer::parse`. */
export function parseCatalogFile(content, kind) {
  if (typeof content === "string" && content.length > MAX_BYTES) throw new Error("Die Datei ist zu groß.");
  const notOurs = new Error(`Die Datei ist keine ${LABEL[kind]} aus LIFESPAN OS. Bitte eine Datei wählen, die mit „Exportieren“ erstellt wurde.`);
  let v = content;
  if (typeof content === "string") {
    try {
      v = JSON.parse(content);
    } catch {
      throw notOurs;
    }
  }
  if (!v || typeof v !== "object" || v.format !== FORMAT) throw notOurs;
  if (Number(v.version ?? 0) > VERSION) throw new Error("Die Datei stammt aus einer neueren Version von LIFESPAN OS. Bitte zuerst die App aktualisieren.");
  if (v.kind !== "foods" && v.kind !== "supplements") throw new Error("Die Datei ist unvollständig oder beschädigt.");
  if (v.kind !== kind) throw new Error(`Die Datei enthält die ${LABEL[v.kind]}. Bitte dort importieren.`);
  const list = kind === "foods" ? v.foods : v.supplements;
  if (!Array.isArray(list) || !list.length) throw new Error("Die Datei enthält keine Einträge.");
  if (list.length > MAX_ITEMS) throw new Error(`Die Datei enthält mehr als ${MAX_ITEMS.toLocaleString("de-DE")} Einträge.`);
  return {
    kind,
    exportedAt: typeof v.exportedAt === "string" ? v.exportedAt : null,
    fields: Array.isArray(v.fields) ? v.fields : [],
    foods: kind === "foods" ? list : [],
    supplements: kind === "supplements" ? list : [],
  };
}

/**
 * Import berechnen (ändert nichts). Archivierte Einträge der Datei werden nicht übernommen.
 * `ctx` wie bei `planInstall` (foods, supplements, fields, uuid, now).
 */
export function planCatalogImport(file, ctx) {
  const active = (r) => !r.archived;
  const foods = file.foods.filter(active);
  const supplements = file.supplements.filter(active);
  const plan = planInstall(
    { package: { key: "katalog", manufacturer: LABEL[file.kind], title: LABEL[file.kind], version: "1", source: null, description: null }, fields: file.fields, foods, supplements },
    { ...ctx, installed: null },
  );
  return {
    ...plan,
    kind: file.kind,
    exportedAt: file.exportedAt,
    archivedSkipped: file.foods.length + file.supplements.length - foods.length - supplements.length,
  };
}

/**
 * Berechneten Import übernehmen: neue Lebensmittel in `food.foods`, Supplements und Felder in `supp`
 * (ohne Paketvermerk). Alles geht mit „Lebensmittel senden“ an den PC.
 */
export function applyCatalogImport(plan, food, supp) {
  supp.supplements ??= {};
  supp.fields ??= {};
  for (const row of plan.newFoods) food.foods[row.id] = { row, sent: false };
  for (const s of plan.newSupps) supp.supplements[s.row.id] = { row: s.row, values: s.values, sent: false };
  for (const row of plan.newFields) supp.fields[row.key] = { row, sent: false };
  return { foods: plan.newFoods.length, supplements: plan.newSupps.length, fields: plan.newFields.length };
}
