// LIFESPAN OS Mobil – Muskelverteilung einer Übung (1.4.1, Stand 1.5.2), gleiche Regeln wie am PC
// (src/domain/focusInfo.ts): 1. eigener Muskelfokus der Übung, 2. Muskelfokus der Maschine,
// 3. Standardverteilung des Bewegungsmusters der Maschine, 4. Muskelgruppe als Text (erste
// Angabe 100 %, weitere 50 %), 5. nichts hinterlegt.

import { FOCUS_DATA as D } from "./focusdata.js";

const COMBOS = D.combos.map((c) => ({
  machines: new Map(Object.entries(c.machines)),
  rules: c.rules.map(([src, flags, p]) => [new RegExp(src, flags), p]),
  fallback: c.fallback,
}));
const NAMES = D.names.map(([src, flags, p]) => [new RegExp(src, flags), p]);
const MUSCLE_ORDER = D.muscleGroups.flatMap((g) => g.parts);

function comboHint(exerciseName, machineName) {
  const name = (exerciseName ?? "").toLowerCase();
  const machine = machineName.trim().toLowerCase();
  return machine ? name.split(machine).join(" ") : name;
}

/** Bewegungsmuster: Maschine (Kombigeräte nach Übungsname), sonst Übungsname; null = keins. */
export function patternOf(machineId, exerciseName) {
  if (machineId) {
    for (const c of COMBOS) {
      const machineName = c.machines.get(machineId);
      if (machineName === undefined) continue;
      const hint = comboHint(exerciseName, machineName);
      for (const [rule, p] of c.rules) if (rule.test(hint)) return p;
      return c.fallback;
    }
    if (D.patternOf[machineId]) return D.patternOf[machineId];
  }
  for (const [rule, p] of NAMES) if (rule.test(exerciseName ?? "")) return p;
  return null;
}

function grouped(entries) {
  return D.muscleGroups
    .map((g) => {
      const rows = entries
        .filter(([m, pct]) => g.parts.includes(m) && pct > 0)
        .map(([m, pct]) => ({ muscle: m, label: D.muscleLabels[m] ?? m, percent: pct }))
        .sort((a, b) => b.percent - a.percent || MUSCLE_ORDER.indexOf(a.muscle) - MUSCLE_ORDER.indexOf(b.muscle));
      return { label: g.label, total: rows.reduce((s, r) => s + r.percent, 0), rows };
    })
    .filter((g) => g.rows.length);
}

const splitText = (t) =>
  (t ?? "")
    .split(/[,;/+]|\s+und\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Verteilung für eine Übung. `focus`: { machines: {id: [[muskel, %]]}, exercises: {...} } aus der
 * Exportdatei. Rückgabe { source, title, note, groups, terms } – `terms` bei der Text-Variante.
 */
export function focusInfo({ exerciseId, exerciseName, muscleGroup, machineId, machineMuscleGroups = [] }, focus) {
  const pattern = patternOf(machineId, exerciseName);
  const gripNote = pattern
    ? `Mit Griffbreite/Fußstellung „eng“ oder „weit“ gilt im Training das passende Profil „${D.labels[pattern]}“.`
    : null;
  const own = focus?.exercises?.[exerciseId];
  if (own?.length) return { source: "exercise", title: "Eigener Muskelfokus der Übung", note: gripNote, groups: grouped(own), terms: [] };
  const mach = machineId ? focus?.machines?.[machineId] : null;
  if (mach?.length) return { source: "machine", title: "Muskelfokus der Maschine", note: gripNote, groups: grouped(mach), terms: [] };
  // Maschine mit eigener Griffbreite ohne Angabe (z. B. Rudern mit hohen Ellbogen, 1.5.2)
  const machineStd = machineId && D.patternOf[machineId] === pattern ? D.machineStandard?.[machineId] : null;
  if (pattern && (machineStd || D.standard[pattern])) {
    return {
      source: "pattern",
      title: `Standardverteilung „${D.labels[pattern]}“${machineStd ? " mit hohen Ellbogen" : ""}`,
      note: `Kein eigener Muskelfokus hinterlegt – diese Standardverteilung des Bewegungsmusters wird genommen. ${gripNote}`,
      groups: grouped(machineStd ?? D.standard[pattern]),
      terms: [],
    };
  }
  const own2 = splitText(muscleGroup);
  const terms = own2.length ? own2 : machineMuscleGroups.flatMap(splitText);
  if (terms.length) {
    return {
      source: "text",
      title: "Standardverteilung aus der Muskelgruppe",
      note: "Kein Muskelfokus hinterlegt – die erste Muskelgruppe zählt 100 %, jede weitere 50 %.",
      groups: [],
      terms: terms.map((t, i) => ({ label: t, percent: i === 0 ? 100 : 50 })),
    };
  }
  return { source: "none", title: "Keine Verteilung hinterlegt", note: "Weder Muskelfokus noch Muskelgruppe – am PC unter Training → Datenbank eintragen.", groups: [], terms: [] };
}

/** Muskelfokus aus der Exportdatei: { machines: {id: [[muskel, %]]}, exercises: {...} }. */
export function focusFromRows(rows) {
  const out = { machines: {}, exercises: {} };
  for (const r of rows("machine_muscle_focus")) (out.machines[r.machine_id] ??= []).push([r.muscle, r.percent]);
  for (const r of rows("exercise_muscle_focus")) (out.exercises[r.exercise_id] ??= []).push([r.muscle, r.percent]);
  return out;
}
