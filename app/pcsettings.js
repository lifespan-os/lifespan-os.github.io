// LIFESPAN OS Mobil – Einstellungen, die PC und Handy gemeinsam haben (1.48.0). Reine Logik ohne
// Oberfläche.
//
// Entscheidung des Nutzers vom 17.11.2026: Profil, Mahlzeiten, Messmethoden, Seiten anpassen,
// Secret Protocols und der Tageswechsel lassen sich am Handy ändern und gehen mit „An den PC senden“
// zurück (Tabellen `settings`, `profile`, Löschvermerke `deleted_record`); am PC gewinnt beim
// Abgleich der neuere Stand. Ablage am Handy (Speicher „pcsettings“):
//   settings: Schlüssel → { value (Text oder null = gelöscht), at, sent }
//   profile:  { row, sent } oder null

import { validateProfile as pcValidateProfile } from "./pcdomain.js";

/** Schlüssel, die das Handy ändern darf (alles andere bleibt Sache des PCs). */
export const MEAL_NAME_PREFIX = "meal_name.";
export const SYNC_KEYS = [
  "meal_hidden",
  "meal_extra",
  // Settings → Mahlzeiten: eigene nur zur Wahl, Workout-Mahlzeiten im Tagebuch (1.107.0)
  "meal_extra_hidden",
  "meal_workout",
  // Trainings im Tagesverlauf: ausgelassene Termine und Dauer geplanter Einheiten (1.107.0)
  "ui.training_skips",
  "ui.training_durations",
  "measurement_methods",
  "secret_protocols",
  "ui.day_start",
  // Verlauf des Tageswechsels: Änderungen gelten ab dem aktuellen Tag (1.102.0)
  "ui.day_start_history",
  // Tagesverlauf: Schlafzeit zusammenklappen (1.105.0, „all“ = alles anzeigen)
  "ui.meals_sleep_fold",
  "ui.overview_layout",
  "ui.diary_layout",
  "ui.sleep_layout",
  "ui.recovery_layout",
  "ui.transfer_layout",
  "ui.insights_layout",
  "ui.training_review_layout",
  "ui.training_db_layout",
  // Body & Longevity → Protocols (1.79.0): abgehakter 7-Wochen-Start, Tägliches Dutzend
  "ui.protocols",
  // Settings → Cardio in der Körperkarte (1.89.0)
  "ui.cardio_muscles",
  // Körperkarte „Individuell“: Zielwerte je Muskel (1.99.0)
  "ui.muscle_map",
  // Settings → Wochenziele, Hauptziele und Einwilligung (1.91.0)
  "ui.week_goals",
  "ui.main_goals",
  "ui.ai_consent",
];
export const DEFAULT_MEALS = ["breakfast", "lunch", "snack", "dinner"];
export const MEAL_LABELS = { breakfast: "Frühstück", lunch: "Mittagessen", snack: "Snacks", dinner: "Abendessen" };
export const MAX_MEALS = 10;

export const syncable = (key) => SYNC_KEYS.includes(key) || DEFAULT_MEALS.some((m) => key === MEAL_NAME_PREFIX + m);

export function emptySync() {
  return { settings: {}, profile: null };
}

/** Gespeicherten Stand prüfen; ergänzt fehlende Teile im selben Objekt (Änderungen bleiben dort). */
export function normSync(local) {
  const l = local && typeof local === "object" ? local : {};
  if (!l.settings || typeof l.settings !== "object") l.settings = {};
  if (l.profile === undefined) l.profile = null;
  return l;
}

/**
 * Einstellung setzen (`value` = Text) oder löschen (`null`). Gleicher Wert wie vorher → keine
 * Änderung. `current` = gültiger Wert vor der Änderung (vom PC oder schon am Handy geändert).
 */
export function setSetting(local, key, value, current, now = new Date()) {
  if (!syncable(key)) throw new Error(`Die Einstellung „${key}“ lässt sich am Handy nicht ändern.`);
  const v = value === null || value === undefined ? null : String(value);
  if (v === (current ?? null)) return false;
  local.settings[key] = { value: v, at: now.toISOString(), sent: false };
  return true;
}

/** Profil ändern (Zeile wie in der Tabelle `profile`, `updated_at` = jetzt). */
export function setProfile(local, row, now = new Date()) {
  local.profile = { row: { ...row, id: 1, updated_at: now.toISOString() }, sent: false };
  return local.profile.row;
}

/** Gültiger Wert einer Einstellung: am Handy geändert (auch gelöscht) vor dem Stand vom PC. */
export function effective(catalog, local, key) {
  const own = normSync(local).settings[key];
  if (own) return own.value;
  return (catalog?.pc?.settings ?? []).find((s) => s.key === key)?.value ?? null;
}

/** Teil für `makeDb`: geänderte und gelöschte Schlüssel, Profil. */
export function phoneSettings(local) {
  const l = normSync(local);
  const set = {};
  const deleted = [];
  for (const [k, e] of Object.entries(l.settings)) {
    if (e.value === null) deleted.push(k);
    else set[k] = e.value;
  }
  return { settings: set, deletedSettings: deleted, profile: l.profile?.row ?? null };
}

export function unsentSync(local) {
  const l = normSync(local);
  return Object.values(l.settings).filter((e) => !e.sent).length + (l.profile && !l.profile.sent ? 1 : 0);
}

/** Tabellen für die Rückgabedatei (`all` = auch schon gesendete). */
export function syncTables(local, { all = false } = {}) {
  const l = normSync(local);
  const out = {};
  const open = Object.entries(l.settings).filter(([, e]) => all || !e.sent);
  const rows = open.filter(([, e]) => e.value !== null).map(([key, e]) => ({ key, value: e.value, updated_at: e.at }));
  if (rows.length) out.settings = rows;
  const del = open
    .filter(([, e]) => e.value === null)
    .map(([key, e]) => ({ id: `settings:${key}`, table_name: "settings", record_id: key, deleted_at: e.at }));
  if (del.length) out.deleted_record = del;
  if (l.profile && (all || !l.profile.sent)) out.profile = [l.profile.row];
  return out;
}

export function markSyncSent(local) {
  if (!local) return;
  for (const e of Object.values(local.settings ?? {})) e.sent = true;
  if (local.profile) local.profile.sent = true;
}

/**
 * Neue Exportdatei vom PC: Gesendetes entfällt, sobald der PC denselben oder einen neueren Stand
 * hat (gelöscht: der Schlüssel fehlt am PC). Ungesendetes bleibt.
 */
export function pruneSync(catalog, local) {
  const l = normSync(local);
  const pc = new Map((catalog?.pc?.settings ?? []).map((s) => [s.key, s]));
  for (const [key, e] of Object.entries(l.settings)) {
    if (!e.sent) continue;
    const row = pc.get(key);
    if (e.value === null ? !row || String(row.updated_at) > e.at : row && (row.value === e.value || String(row.updated_at) >= e.at)) {
      delete l.settings[key];
    }
  }
  const p = catalog?.pc?.profile?.[0];
  if (l.profile?.sent && p && String(p.updated_at) >= l.profile.row.updated_at) l.profile = null;
  return l;
}

const LAYOUT_NAMES = {
  "ui.overview_layout": "Overview",
  "ui.diary_layout": "Nutrition → Tagebuch",
  "ui.sleep_layout": "Sleep",
  "ui.recovery_layout": "Recovery",
  "ui.insights_layout": "Insights",
  "ui.training_review_layout": "Training → Auswertung",
  "ui.training_db_layout": "Training → Datenbank",
  "ui.transfer_layout": "Import/Export",
};

/** Bezeichnung einer Einstellung (Offene Daten); Mahlzeiten-Schlüssel zählen zusammen. */
export function settingLabel(key) {
  if (key.startsWith(MEAL_NAME_PREFIX) || ["meal_hidden", "meal_extra", "meal_extra_hidden", "meal_workout"].includes(key)) return "Mahlzeiten";
  if (key === "ui.training_skips" || key === "ui.training_durations") return "Trainings im Tagesverlauf";
  if (key === "measurement_methods") return "Messmethoden";
  if (key === "secret_protocols") return "Secret Protocols";
  if (key === "ui.day_start" || key === "ui.day_start_history") return "Tageswechsel";
  if (key === "ui.protocols") return "Protocols (Fortschritt)";
  if (key === "ui.cardio_muscles") return "Cardio in der Körperkarte";
  if (key === "ui.week_goals") return "Wochenziele";
  if (key === "ui.main_goals") return "Hauptziele";
  if (key === "ui.ai_consent") return "Einwilligung (Empfehlungen)";
  return LAYOUT_NAMES[key] ? `Seite anpassen: ${LAYOUT_NAMES[key]}` : key;
}

// ------------------------------------------------------------------ Prüfregeln wie am PC

/**
 * Profil mit den Prüfregeln des PCs (`domain/profile.ts::validateProfile`, in pcdomain.js).
 * `draft` = { name, height, birthDate, sex, lifePhase } als Text. Ergebnis { ok, value | errors };
 * `value` ist eine Zeile der Tabelle `profile` (ohne id/updated_at).
 */
export function validateProfile(draft, today) {
  const r = pcValidateProfile(
    {
      name: String(draft.name ?? ""),
      height: String(draft.height ?? ""),
      birthDate: String(draft.birthDate ?? ""),
      knownBirthYear: null,
      sex: draft.sex ?? "",
      lifePhase: draft.lifePhase ?? "",
    },
    today,
  );
  if (!r.ok) return r;
  const v = r.value;
  return {
    ok: true,
    value: { name: v.name, height_cm: v.heightCm, birth_year: v.birthYear, birth_date: v.birthDate ?? null, sex: v.sex ?? null, life_phase: v.lifePhase ?? null },
  };
}

/**
 * Mahlzeitenliste wie `meal::save_meal_list`: Namen der Standardmahlzeiten (höchstens 60 Zeichen,
 * Standardname = kein eigener), abgewählte, eigene Mahlzeiten (Name nötig, eindeutig über die ganze
 * Liste ohne Groß-/Kleinschreibung), mindestens eine und höchstens zehn im Tagebuch.
 * 1.107.0: `extraShow[i]` = eigene Mahlzeit i im Tagebuch (sonst nur zur Wahl), `workout` =
 * Workout-Mahlzeiten im Tagebuch; Workout-Namen sind als eigene Mahlzeit vergeben.
 * Ergebnis { ok, value: { names, hidden, extras, extraHidden, workout } | errors } (Fehler je Feld wie am PC).
 */
export function validateMealList(input) {
  const errors = {};
  const names = {};
  for (const slot of DEFAULT_MEALS) {
    const n = String(input.names?.[slot] ?? "").trim().replace(/\s+/g, " ");
    if ([...n].length > 60) errors[slot] = "Höchstens 60 Zeichen.";
    else if (n && n !== MEAL_LABELS[slot]) names[slot] = n;
  }
  const hidden = DEFAULT_MEALS.filter((s) => (input.hidden ?? []).includes(s));
  const extras = [];
  (input.extras ?? []).forEach((raw, i) => {
    const n = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (!n) errors[`extras.${i}`] = "Bitte einen Namen für die Mahlzeit eingeben.";
    else if ([...n].length > 60) errors[`extras.${i}`] = "Höchstens 60 Zeichen.";
    extras.push(n);
  });
  const seen = DEFAULT_MEALS.map((s) => (names[s] ?? MEAL_LABELS[s]).toLowerCase());
  extras.forEach((n, i) => {
    if (!n || errors[`extras.${i}`]) return;
    if (WORKOUT_NAMES.some((w) => wnorm(w) === wnorm(n))) errors[`extras.${i}`] = "Diese Mahlzeit gibt es schon unter den Workout-Mahlzeiten.";
    else if (seen.includes(n.toLowerCase())) errors[`extras.${i}`] = "Diesen Namen gibt es schon in der Liste.";
    seen.push(n.toLowerCase());
  });
  const extraHidden = extras.filter((n, i) => n && input.extraShow && input.extraShow[i] === false);
  const workout = WORKOUT_NAMES.filter((w) => (input.workout ?? []).includes(w));
  if (extras.length > 2 * MAX_MEALS) errors.extras = `Höchstens ${2 * MAX_MEALS} eigene Mahlzeiten.`;
  const active = DEFAULT_MEALS.length - hidden.length + extras.length - extraHidden.length + workout.length;
  if (active === 0) errors.hidden = "Mindestens eine Mahlzeit muss in der Liste bleiben.";
  if (active > MAX_MEALS) errors.extras = `Höchstens ${MAX_MEALS} Mahlzeiten im Tagebuch.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { names, hidden, extras, extraHidden, workout } };
}

const WORKOUT_NAMES = ["Pre-Workout", "Intra-Workout", "Post-Workout"];
const wnorm = (s) => String(s ?? "").toLowerCase().replace(/[\s_-]+/g, "");

/** Einstellungen für eine geprüfte Mahlzeitenliste (`null` = Schlüssel löschen, wie am PC). */
export function mealListSettings(list) {
  const out = {};
  for (const slot of DEFAULT_MEALS) out[MEAL_NAME_PREFIX + slot] = list.names[slot] ?? null;
  out.meal_hidden = list.hidden.length ? JSON.stringify(list.hidden) : null;
  out.meal_extra = list.extras.length ? JSON.stringify(list.extras) : null;
  out.meal_extra_hidden = list.extraHidden?.length ? JSON.stringify(list.extraHidden) : null;
  out.meal_workout = list.workout?.length ? JSON.stringify(list.workout) : null;
  return out;
}

export const METHOD_TOPICS = [
  ["weight", "Gewicht"],
  ["composition", "Körperzusammensetzung"],
  ["circumference", "Umfänge"],
  ["vital", "Vitalwerte"],
  ["fitness", "VO2max"],
  ["grip", "Griffkraft"],
  ["sleep", "Schlaf"],
];

/** Messmethoden lesen (fehlend oder unlesbar: leere Listen). */
export function parseMethods(raw) {
  let v = {};
  try {
    v = raw ? JSON.parse(raw) : {};
  } catch {
    v = {};
  }
  const out = {};
  for (const [k] of METHOD_TOPICS) out[k] = Array.isArray(v?.[k]) ? v[k].filter((x) => typeof x === "string") : [];
  return out;
}

/**
 * Messmethoden wie `methods::save`: je Thema höchstens 30, je Bezeichnung höchstens 40 Zeichen,
 * Leerzeichen bereinigt, keine Doppelten (ohne Groß-/Kleinschreibung). Ergebnis als JSON wie am PC.
 */
export function validateMethods(input) {
  const errors = {};
  const out = {};
  for (const [topic] of METHOD_TOPICS) {
    const list = input[topic] ?? [];
    if (list.length > 30) errors[topic] = "Höchstens 30 Messmethoden je Thema.";
    const clean = [];
    list.forEach((raw, i) => {
      const name = String(raw ?? "").split(/\s+/).filter(Boolean).join(" ");
      const field = `${topic}.${i}`;
      if (!name) errors[field] = "Bitte eine Bezeichnung eingeben.";
      else if ([...name].length > 40) errors[field] = "Höchstens 40 Zeichen.";
      else if (clean.some((x) => x.toLowerCase() === name.toLowerCase())) errors[field] = `„${name}“ ist bereits eingetragen.`;
      clean.push(name);
    });
    out[topic] = clean;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: out, json: JSON.stringify(out) };
}

/** Tageswechsel „HH:MM“ zwischen 00:00 und 12:00 (wie `lib/appDay.ts`), sonst `null`. */
export function validDayStart(time) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time ?? "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) <= 720 ? `${m[1]}:${m[2]}` : null;
}

// ------------------------------------------------------------------ Seiten anpassen

/**
 * Neue Anordnung einer Seite. `layout` = gelesene Anordnung (order, hidden, emptyLast, …),
 * `ids` = Karten der Seite in angezeigter Reihenfolge (am Handy bekannt). Karten, die nur der PC
 * kennt, bleiben in `order` hinter den bekannten erhalten, ebenso ihre Ausblendung.
 */
export function layoutWith(layout, ids, { move = null, toggle = null } = {}) {
  const order = [...ids];
  if (move) {
    const i = order.indexOf(move.id);
    const j = i + move.by;
    if (i >= 0 && j >= 0 && j < order.length) [order[i], order[j]] = [order[j], order[i]];
  }
  let hidden = [...(layout.hidden ?? [])];
  if (toggle) hidden = hidden.includes(toggle) ? hidden.filter((h) => h !== toggle) : [...hidden, toggle];
  const rest = (layout.order ?? []).filter((id) => !order.includes(id));
  return { ...layout, order: [...order, ...rest], hidden };
}
