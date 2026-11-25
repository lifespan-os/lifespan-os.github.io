// LIFESPAN OS Mobil – „Ganzes Konto an den PC“ (1.29.0). Reine Logik ohne Oberfläche.
//
// Für ein Konto am Handy (Startpaket) entsteht eine vollständige Exportdatei im Format der Desktop-App
// (performance-os-export): die Grunddaten des Startpakets, das Profil und alles, was am Handy erfasst
// wurde (Trainings, Ernährung, Supplements, Herstellerpakete, Körperwerte, Schlaf, Ziele …). Am PC:
// - neuer Benutzer: Settings → Benutzer → anlegen und wechseln, dann Daten importieren → „Ersetzen“,
// - bestehender Benutzer: Daten importieren → „Abgleichen (zweites Gerät)“.
// Löschvermerke werden auf die Zeilen angewendet (die Datei zeigt genau den Stand am Handy).

import { expandCompact } from "./core.js";
import { valueId } from "./supplements.js";

/** Tabellen, die die Desktop-App beim Import kennt (import.rs, DATA_TABLES). */
export const DATA_TABLES = ["profile", "settings", "machine", "sport", "exercise", "machine_muscle_focus", "exercise_muscle_focus", "gym", "gym_machine", "training_plan", "training_plan_day", "training_plan_exercise", "training_plan_set", "training_plan_slot", "workout", "workout_exercise", "workout_set", "food", "meal", "meal_item", "meal_value", "meal_day", "nutrition_day_entry", "nutrition_day_value", "recipe", "recipe_item", "sleep_log", "recovery_log", "body_metric", "body_measurement", "daily_goal", "lifestyle_note", "neat_day", "nutrient_field", "supplement", "supplement_value", "supplement_stack", "supplement_stack_item", "supplement_intake", "supplement_intake_item", "sleep_nap", "checklist", "checklist_item", "todo_list", "todo", "water_intake", "protocol_substance", "protocol_entry", "hrt_product", "hrt_entry", "training_day_status", "checkin_photo", "grip_strength_measurement", "vendor_package", "vendor_package_item", "lab_analyte", "lab_draw", "lab_result", "lifetime_record", "caffeine_intake", "deleted_record"];

const keyOf = (table, row) => (table === "settings" ? row.key : row.id);

/**
 * Vollständige Kontodatei. `startDoc` = startpaket.json, `profile` = Zeile `profile`,
 * `parts` = Tabellen-Objekte vom Handy (Rückgabetabellen mit `all`), spätere gewinnen bei gleicher ID.
 */
export function fullAccountDoc(startDoc, profile, parts, { now = new Date(), appVersion = "mobil" } = {}) {
  const { doc } = expandCompact(startDoc);
  const tables = new Map();
  const iso = now.toISOString();
  const suppById = new Map((doc.tables.supplement ?? []).map((r) => [r.id, r]));
  for (const name of DATA_TABLES) {
    if (name === "deleted_record") continue;
    let rows = doc.tables[name] ?? [];
    // Nährwerte im Startpaket ohne ID und Zeitstempel: ergänzen wie beim Senden
    if (name === "supplement_value") {
      rows = rows.map((v) => {
        if (v.id) return v;
        const s = suppById.get(v.supplement_id);
        return { id: valueId(v.supplement_id, v.nutrient), supplement_id: v.supplement_id, nutrient: v.nutrient, amount: v.amount, created_at: s?.created_at ?? iso, updated_at: s?.updated_at ?? iso };
      });
    }
    tables.set(name, new Map(rows.map((r) => [keyOf(name, r), { ...r }])));
  }
  tables.set("profile", new Map([[profile.id, { ...profile }]]));
  const tombstones = [];
  for (const part of parts) {
    for (const [name, rows] of Object.entries(part ?? {})) {
      if (name === "deleted_record") {
        tombstones.push(...rows);
        continue;
      }
      if (!tables.has(name)) continue;
      const m = tables.get(name);
      for (const r of rows) {
        const k = keyOf(name, r);
        m.set(k, { ...(m.get(k) ?? {}), ...r });
      }
    }
  }
  for (const t of tombstones) tables.get(t.table_name)?.delete(t.record_id);
  // Einträge, deren Eltern gelöscht wurden, entfallen mit (wie ON DELETE CASCADE)
  dropOrphans(tables);
  const out = {};
  for (const [name, m] of tables) if (m.size) out[name] = [...m.values()];
  return {
    format: "performance-os-export",
    formatVersion: 2,
    schemaVersion: doc.schemaVersion,
    appVersion,
    exportedAt: now.toISOString(),
    source: "LIFESPAN OS Mobil – ganzes Konto",
    tables: out,
  };
}

/** Kind → [Spalte, Elterntabelle] für die Einträge, die am Handy zusammen gelöscht werden. */
const CHILDREN = [
  ["meal_item", "meal_id", "meal"],
  ["supplement_intake_item", "intake_id", "supplement_intake"],
  ["workout_exercise", "workout_id", "workout"],
  ["workout_set", "workout_exercise_id", "workout_exercise"],
  ["recipe_item", "recipe_id", "recipe"],
  ["checklist_item", "checklist_id", "checklist"],
  ["lab_result", "draw_id", "lab_draw"],
  ["training_plan_day", "plan_id", "training_plan"],
  ["training_plan_exercise", "plan_day_id", "training_plan_day"],
  ["training_plan_set", "plan_exercise_id", "training_plan_exercise"],
  ["training_plan_slot", "plan_day_id", "training_plan_day"],
  ["vendor_package_item", "package_id", "vendor_package"],
  ["supplement_value", "supplement_id", "supplement"],
];

/** Nur Zuordnungen (wie `SOFT_REFERENCES` am PC): fehlt das Gym, bleibt der Eintrag ohne Gym. */
const SOFT = [
  ["workout", "gym_id", "gym"],
  ["training_plan", "gym_id", "gym"],
];

function dropOrphans(tables) {
  for (const [child, col, parent] of CHILDREN) {
    const p = tables.get(parent);
    const c = tables.get(child);
    if (!p || !c) continue;
    for (const [k, r] of [...c.entries()]) if (r[col] && !p.has(r[col])) c.delete(k);
  }
  for (const [child, col, parent] of SOFT) {
    const p = tables.get(parent);
    const c = tables.get(child);
    if (!c) continue;
    for (const r of c.values()) if (r[col] && !p?.has(r[col])) r[col] = null;
  }
}

/** Dateiname wie am PC, z. B. „LIFESPAN Konto Anna 2026-11-14 2310.json“. */
export function accountFileName(name, now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const safe = String(name ?? "Konto").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 40) || "Konto";
  return `LIFESPAN Konto ${safe} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}
