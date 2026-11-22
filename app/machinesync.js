// LIFESPAN OS Mobil – Maschinendatenbank ohne PC (1.99.0, Wunsch 22.11.2026)
//  1. „Maschinen aktualisieren“: die aktuelle Liste aus dem Startpaket der Website übernehmen
//     (bei jedem Release neu erzeugt), für Konten am Handy ohne PC.
//  2. „maschinen_master.json importieren“: dieselbe Datei wie am PC (Regeln wie `machine::import_master`).
// Eigene Nummer, Notiz, Schlagworte und eigenes Foto am Handy bleiben dabei erhalten; Maschinen,
// die in der Quelle fehlen, werden nur beim Master-Import archiviert (wie am PC).

/** Spalten einer Maschine wie in der PC-Tabelle `machine` (Schema 73) */
export const MACHINE_COLUMNS = [
  "id", "manufacturer", "folder", "article_number", "category", "series", "name", "display_name",
  "machine_type", "muscle_groups", "features", "images", "product_url", "own_number", "gym_number",
  "notes", "archived", "created_at", "updated_at", "origin", "own_photo", "tags",
];
/** Felder, die am Handy gepflegt werden und beim Aktualisieren erhalten bleiben */
const KEEP = ["own_number", "notes", "tags", "own_photo"];
/** Felder, die beim Vergleich „geändert?“ zählen */
const COMPARE = ["manufacturer", "folder", "article_number", "category", "series", "name", "display_name", "machine_type", "muscle_groups", "features", "images", "product_url", "gym_number", "archived"];

const blank = (v) => v === null || v === undefined || String(v).trim() === "" || v === "[]";

/**
 * Neue Liste aus `current` und `incoming` (Zeilen wie `machine`). Ergebnis
 * { machines, added, updated, unchanged, archived }.
 */
export function mergeMachines(current, incoming, { archiveMissing = false, now = new Date() } = {}) {
  const iso = now.toISOString();
  const byId = new Map(current.map((m) => [m.id, m]));
  const seen = new Set();
  const out = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const m of incoming) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    const old = byId.get(m.id);
    if (!old) {
      out.push({ ...m, tags: m.tags ?? "[]", created_at: m.created_at ?? iso, updated_at: m.updated_at ?? iso });
      added += 1;
      continue;
    }
    const next = { ...old, ...m };
    for (const k of KEEP) if (!blank(old[k])) next[k] = old[k];
    if (COMPARE.some((k) => String(next[k] ?? "") !== String(old[k] ?? ""))) {
      next.updated_at = iso;
      updated += 1;
    } else {
      next.updated_at = old.updated_at;
      unchanged += 1;
    }
    out.push(next);
  }
  let archived = 0;
  for (const old of current) {
    if (seen.has(old.id)) continue;
    // eigene (am Handy bzw. in der App angelegte) Maschinen bleiben immer
    if (archiveMissing && old.origin !== "app" && !old.archived) {
      out.push({ ...old, archived: 1, updated_at: iso });
      archived += 1;
    } else out.push(old);
  }
  return { machines: out, added, updated, unchanged, archived };
}

/** Maschinen aus dem Startpaket (kompaktes Format: Spalten + Zeilen). */
export function machinesFromStartpaket(doc) {
  const t = doc?.tables?.machine;
  if (!t) return [];
  if (Array.isArray(t)) return t;
  return t.r.map((row) => Object.fromEntries(t.c.map((c, i) => [c, row[i]])));
}

const clean = (v) => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? null : s;
};
const list = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean))];
/** Bildpfade wie am PC: relativ, ohne „..“, mit Bild-Endung */
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
const imagePath = (p) => {
  const s = String(p ?? "").trim().replace(/\\/g, "/");
  return s && !s.startsWith("/") && !/^[a-z]:/i.test(s) && !s.split("/").includes("..") && IMAGE_EXT.test(s) ? s : null;
};

/**
 * `maschinen_master.json` lesen (wie `MasterMachine` in `repo/machine.rs`). Ergebnis
 * { machines, skipped } oder { error }.
 */
export function parseMaster(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    return { error: "Die Datei ist keine gültige maschinen_master.json (kein JSON)." };
  }
  if (!Array.isArray(d?.maschinen)) return { error: "Die Datei ist keine gültige maschinen_master.json (Liste „maschinen“ fehlt)." };
  const machines = [];
  const skipped = [];
  const ids = new Set();
  for (const m of d.maschinen) {
    const id = clean(m?.id);
    const name = clean(m?.name);
    if (!id || id.length > 120) {
      skipped.push(`${name ?? "?"}: ohne gültige ID`);
      continue;
    }
    if (ids.has(id)) {
      skipped.push(`${name ?? id}: doppelte ID`);
      continue;
    }
    if (!name || !clean(m.hersteller) || !clean(m.kategorie)) {
      skipped.push(`${name ?? id}: Name, Hersteller oder Kategorie fehlt`);
      continue;
    }
    ids.add(id);
    const series = clean(m.serie) ?? "";
    machines.push({
      id,
      manufacturer: clean(m.hersteller),
      folder: clean(m.ordner) ?? clean(m.hersteller),
      article_number: clean(m.artikelnummer),
      category: clean(m.kategorie),
      series,
      name,
      display_name: clean(m.anzeigename) ?? name,
      machine_type: clean(m.typ) ?? "",
      muscle_groups: JSON.stringify(list(m.muskelgruppen)),
      features: JSON.stringify(list(m.besonderheiten)),
      images: JSON.stringify(list(m.bilder).map(imagePath).filter(Boolean)),
      product_url: clean(m.produkt_url),
      own_number: clean(m.eigene_nummer),
      gym_number: clean(m.dasgym_nummer),
      notes: clean(m.notiz),
      archived: 0,
      origin: "import",
    });
  }
  return { machines, skipped };
}

/** „12 neu, 3 geändert, 2 archiviert“ */
export function describeMerge(r, skipped = []) {
  const parts = [`${r.added} neu`, `${r.updated} geändert`, `${r.unchanged} unverändert`];
  if (r.archived) parts.push(`${r.archived} archiviert`);
  return `Maschinen: ${parts.join(", ")}${skipped.length ? ` · ${skipped.length} übersprungen` : ""}.`;
}
