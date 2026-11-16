// HYROX am Handy (1.46.0) – gleiche Werte wie in der Desktop-App (src/domain/hyrox.ts):
// Ablauf eines Rennens (8 × 1 km Laufen, jeweils gefolgt von einer Station), Wettkampfklassen
// (Divisions), Altersklassen und Stationsgewichte laut HYROX-Regelwerk 25/26.
// Wird eine der Vorlagen „Hyrox-Simulation (komplett)“ oder „Hyrox-Wettkampf (Frauen/Männer)“
// gewählt, legt das Training alle 16 Abschnitte an. Alle Werte bleiben änderbar.

export const HYROX_SIMULATION_ID = "1fd2d179-c76e-51ad-a9ab-9aac59cb6b59";
export const HYROX_RACE_WOMEN_ID = "92b41740-afed-55e8-bf0a-758474b52164";
export const HYROX_RACE_MEN_ID = "baa6c63c-d7d0-5d71-85e0-6a60034ed14d";

/** "simulation" | "women" | "men" | null */
export function hyroxTemplate(exerciseId) {
  if (exerciseId === HYROX_SIMULATION_ID) return "simulation";
  if (exerciseId === HYROX_RACE_WOMEN_ID) return "women";
  if (exerciseId === HYROX_RACE_MEN_ID) return "men";
  return null;
}

const st = (key, exerciseId, name, category, muscleGroup, equipment, distanceM, reps) => ({
  key,
  exerciseId,
  name,
  category,
  muscleGroup,
  equipment,
  distanceM,
  reps,
});

export const HYROX_STATIONS = {
  run: st("run", "a5bc13b4-8951-5bcb-92ca-771cc37e190f", "Hyrox: Laufen 1 km", "cardio", "Ausdauer", null, 1000, null),
  ski: st("ski", "52eaea1f-5409-5f3d-9d9e-f8f426ff0567", "SkiErg", "cardio", "Ganzkörper, Ausdauer", "SkiErg", 1000, null),
  sledPush: st("sledPush", "aa2e3e34-6b6d-57f7-91c5-3bc3db132564", "Sled Push (Schlitten schieben)", "cardio", "Beine, Gesäß", "Schlitten", 50, null),
  sledPull: st("sledPull", "b220b065-3864-527c-becc-d2d77a682af0", "Sled Pull (Schlitten ziehen)", "cardio", "Rücken, Beine", "Schlitten mit Seil", 50, null),
  burpeeBroadJump: st("burpeeBroadJump", "c6f4d757-ea9a-5b68-9f46-8c77456f5ec4", "Burpee Broad Jumps", "cardio", "Ganzkörper", "Körpergewicht", 80, null),
  row: st("row", "dc3a7048-87cb-5599-970a-8c77d3cc91d3", "Rudern (Rudergerät)", "cardio", "Ganzkörper, Ausdauer", "Rudergerät", 1000, null),
  farmersCarry: st("farmersCarry", "5a26b1e5-31a7-54b0-9df2-0f66c5232e8c", "Farmers Carry", "cardio", "Griffkraft, Rumpf", "Kettlebells", 200, null),
  sandbagLunges: st("sandbagLunges", "f26d8995-c6e6-525b-a183-b889290f368d", "Sandbag Lunges", "cardio", "Beine, Gesäß", "Sandsack", 100, null),
  wallBalls: st("wallBalls", "fe71b9c2-dc52-56c9-b852-4fab9f9af511", "Wall Balls", "strength", "Beine, Schultern", "Medizinball", null, 100),
};

/** Ablauf: vor jeder der acht Stationen 1 km Laufen (16 Abschnitte). */
export const HYROX_SEQUENCE = [
  "run", "ski", "run", "sledPush", "run", "sledPull", "run", "burpeeBroadJump",
  "run", "row", "run", "farmersCarry", "run", "sandbagLunges", "run", "wallBalls",
];

/** Übungs-IDs der Stationen mit Gewicht. */
export const HYROX_WEIGHTED = new Set(
  ["sledPush", "sledPull", "farmersCarry", "sandbagLunges", "wallBalls"].map((k) => HYROX_STATIONS[k].exerciseId),
);

/** Gewichte laut Regelwerk 25/26 (Sled inkl. Schlitten, Farmers Carry je Kettlebell). */
export const HYROX_WEIGHTS = {
  womenOpen: { sledPush: 102, sledPull: 78, farmersCarry: 16, sandbagLunges: 10, wallBall: 4, wallBallTargetM: 2.7 },
  womenPro: { sledPush: 152, sledPull: 103, farmersCarry: 24, sandbagLunges: 20, wallBall: 6, wallBallTargetM: 2.7 },
  menOpen: { sledPush: 152, sledPull: 103, farmersCarry: 24, sandbagLunges: 20, wallBall: 6, wallBallTargetM: 3 },
  menPro: { sledPush: 202, sledPull: 153, farmersCarry: 32, sandbagLunges: 30, wallBall: 9, wallBallTargetM: 3 },
};

/** Wettkampfklassen (gleiche Kürzel wie im Rust-Kern, COMPETITION_DIVISIONS). */
export const HYROX_DIVISIONS = [
  { value: "women_open", label: "Frauen Open", sex: "women", weights: "womenOpen" },
  { value: "women_pro", label: "Frauen Pro", sex: "women", weights: "womenPro" },
  { value: "men_open", label: "Männer Open", sex: "men", weights: "menOpen" },
  { value: "men_pro", label: "Männer Pro", sex: "men", weights: "menPro" },
  { value: "doubles_women", label: "Doubles Frauen", sex: "women", weights: "womenOpen" },
  { value: "doubles_women_pro", label: "Doubles Frauen Pro", sex: "women", weights: "womenPro" },
  { value: "doubles_men", label: "Doubles Männer", sex: "men", weights: "menOpen" },
  { value: "doubles_men_pro", label: "Doubles Männer Pro", sex: "men", weights: "menPro" },
  { value: "doubles_mixed", label: "Doubles Mixed", sex: "mixed", weights: null },
  { value: "relay_women", label: "Relay Frauen (4er-Team)", sex: "women", weights: "womenOpen" },
  { value: "relay_men", label: "Relay Männer (4er-Team)", sex: "men", weights: "menOpen" },
  { value: "relay_mixed", label: "Relay Mixed (4er-Team)", sex: "mixed", weights: null },
  { value: "adaptive", label: "Adaptive", sex: "mixed", weights: null },
  { value: "elite_women", label: "Elite 15 Frauen", sex: "women", weights: "womenPro" },
  { value: "elite_men", label: "Elite 15 Männer", sex: "men", weights: "menPro" },
];

export const HYROX_AGE_GROUPS = [
  "16-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54",
  "55-59", "60-64", "65-69", "70-74", "75-79", "80-84", "85-89",
];

export function divisionLabel(value) {
  return HYROX_DIVISIONS.find((d) => d.value === value)?.label ?? (value || "–");
}

/** Frauen/Männer einer gespeicherten Klasse; Mixed und Adaptive → Frauen-Liste. */
export function divisionSex(value) {
  return HYROX_DIVISIONS.find((d) => d.value === value)?.sex === "men" ? "men" : "women";
}

/** Klassen zur Auswahl (Mixed und Adaptive bei beiden). */
export function divisionsFor(sex) {
  return HYROX_DIVISIONS.filter((d) => d.sex === sex || d.sex === "mixed");
}

export function weightsForDivision(division) {
  const info = HYROX_DIVISIONS.find((d) => d.value === division);
  return info?.weights ? HYROX_WEIGHTS[info.weights] : null;
}

export function defaultDivision(template) {
  if (template === "women") return "women_open";
  if (template === "men") return "men_open";
  return null;
}

const height = (m) => m.toFixed(2).replace(".", ",");

/** Gewicht (kg oder null) und Satznotiz einer Station für eine Gewichtsklasse. */
function stationLoad(key, w) {
  if (!w) return { weightKg: null, notes: null };
  switch (key) {
    case "sledPush":
      return { weightKg: w.sledPush, notes: "inkl. Schlitten" };
    case "sledPull":
      return { weightKg: w.sledPull, notes: "inkl. Schlitten" };
    case "farmersCarry":
      return { weightKg: w.farmersCarry, notes: `2 × ${w.farmersCarry} kg (je Hand)` };
    case "sandbagLunges":
      return { weightKg: w.sandbagLunges, notes: null };
    case "wallBalls":
      return { weightKg: w.wallBall, notes: `Ziel ${height(w.wallBallTargetM)} m` };
    default:
      return { weightKg: null, notes: null };
  }
}

/** Die 16 Abschnitte: { station, index, distanceM, reps, weightKg, notes } (Handy-Satzform). */
export function hyroxSegments(division) {
  const w = weightsForDivision(division);
  let runs = 0;
  return HYROX_SEQUENCE.map((key, i) => {
    const station = HYROX_STATIONS[key];
    const load = stationLoad(key, w);
    if (key === "run") runs += 1;
    return {
      station,
      index: i + 1,
      distanceM: station.distanceM,
      reps: station.reps,
      weightKg: load.weightKg,
      notes: key === "run" ? `Lauf ${runs} von 8` : load.notes,
    };
  });
}

/** Gewicht und Notiz einer gewichteten Station für eine Klasse (Klassenwechsel). */
export function loadFor(exerciseId, division) {
  const key = Object.values(HYROX_STATIONS).find((s) => s.exerciseId === exerciseId)?.key;
  if (!key) return null;
  return stationLoad(key, weightsForDivision(division));
}

/**
 * Jeder Station eine vorhandene Übung zuordnen: feste ID, sonst Name (auch archivierte).
 * Rückgabe: { found: Map key → Übung, missing: Stationen }.
 */
export function matchStations(exercises) {
  const found = new Map();
  const missing = [];
  for (const station of Object.values(HYROX_STATIONS)) {
    const hit =
      exercises.find((e) => e.id === station.exerciseId) ??
      exercises.find((e) => String(e.name).trim().toLowerCase() === station.name.toLowerCase());
    if (hit) found.set(station.key, hit);
    else missing.push(station);
  }
  return { found, missing };
}

/** Fehlende Station als Handy-Übung (Spalten wie die Tabelle `exercise`). */
export function stationExercise(station, id, iso) {
  return {
    id,
    name: station.name,
    category: station.category,
    muscle_group: station.muscleGroup,
    equipment: station.equipment,
    notes: null,
    archived: 0,
    created_at: iso,
    updated_at: iso,
    machine_id: null,
    discipline: "Hyrox",
  };
}

/** Endzeit „h:mm:ss“ bzw. „mm:ss“ → Sekunden (null = leer, NaN = ungültig). */
export function parseFinishTime(text) {
  const t = String(text ?? "").trim();
  if (t === "") return null;
  const parts = t.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,2}$/.test(p))) return NaN;
  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (m > 59 || s > 59) return NaN;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : NaN;
}

export function formatFinishTime(seconds) {
  if (seconds === null || seconds === undefined) return "";
  const h = Math.floor(seconds / 3600);
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function placementText(rank, field) {
  if (rank === null || rank === undefined) return null;
  const f = (n) => n.toLocaleString("de-DE");
  return field === null || field === undefined ? `${f(rank)}.` : `${f(rank)}. von ${f(field)}`;
}

/** Kurzbeschreibung für Listen wie `describeCompetition` am PC (1.47.0), z. B. „HYROX · Männer Open · Wien · 1:28:12“. */
export function describeCompetition(c) {
  if (!c) return null;
  return [
    "HYROX",
    c.division ? divisionLabel(c.division) : null,
    c.location,
    c.finishSeconds ? formatFinishTime(c.finishSeconds) : null,
    c.rank ? `Platz ${placementText(c.rank, c.field)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Neue, leere Wettkampf-Angaben. */
export function emptyCompetition(division) {
  return { kind: "hyrox", division, location: null, ageGroup: null, rank: null, field: null, rankAge: null, fieldAge: null, finishSeconds: null };
}

/** Prüfung wie im Rust-Kern (repo/workout.rs, validate_competition). Liefert Fehlertexte. */
export function checkCompetition(c) {
  if (!c) return [];
  const errors = [];
  if (c.kind !== "hyrox") errors.push("Wettkampf: unbekannte Art.");
  if (c.division !== null && !HYROX_DIVISIONS.some((d) => d.value === c.division)) errors.push("Wettkampf: unbekannte Klasse.");
  if (c.location !== null && [...c.location].length > 120) errors.push("Ort: höchstens 120 Zeichen.");
  if (c.ageGroup !== null && [...c.ageGroup].length > 20) errors.push("Altersklasse: höchstens 20 Zeichen.");
  const int = (v, label) => {
    if (v === null) return;
    if (!Number.isInteger(v) || v < 1 || v > 1000000) errors.push(`${label}: bitte eine ganze Zahl von 1 bis 1.000.000.`);
  };
  int(c.rank, "Platz gesamt");
  int(c.field, "Teilnehmende gesamt");
  int(c.rankAge, "Platz Altersklasse");
  int(c.fieldAge, "Teilnehmende Altersklasse");
  if (c.rank !== null && c.field !== null && c.rank > c.field) errors.push("Platz gesamt kann nicht größer sein als die Zahl der Teilnehmenden.");
  if (c.rankAge !== null && c.fieldAge !== null && c.rankAge > c.fieldAge) errors.push("Platz in der Altersklasse kann nicht größer sein als die Zahl der Teilnehmenden.");
  if (c.finishSeconds !== null && (Number.isNaN(c.finishSeconds) || c.finishSeconds < 1 || c.finishSeconds > 172800)) errors.push("Endzeit: bitte als h:mm:ss oder mm:ss eingeben.");
  return errors;
}

/** Zeile `workout` vom PC → Wettkampf-Angaben (oder null). */
export function competitionFromRow(w) {
  if (!w || !w.competition) return null;
  const n = (v) => (v === undefined ? null : v);
  return {
    kind: w.competition,
    division: n(w.comp_division),
    location: n(w.comp_location),
    ageGroup: n(w.comp_age_group),
    rank: n(w.comp_rank),
    field: n(w.comp_field),
    rankAge: n(w.comp_rank_age),
    fieldAge: n(w.comp_field_age),
    finishSeconds: n(w.comp_finish_s),
  };
}

const cut = (v, max) => {
  if (v === null || v === undefined) return null;
  const t = [...String(v).trim()].slice(0, max).join("");
  return t === "" ? null : t;
};

/** Wettkampf-Angaben → Spalten der Tabelle `workout` (alle null, wenn keine). */
export function competitionColumns(c) {
  return {
    competition: c ? c.kind : null,
    comp_division: c ? c.division : null,
    comp_location: c ? cut(c.location, 120) : null,
    comp_age_group: c ? cut(c.ageGroup, 20) : null,
    comp_rank: c ? c.rank : null,
    comp_field: c ? c.field : null,
    comp_rank_age: c ? c.rankAge : null,
    comp_field_age: c ? c.fieldAge : null,
    comp_finish_s: c ? c.finishSeconds : null,
  };
}
