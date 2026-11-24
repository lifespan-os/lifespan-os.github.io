// LIFESPAN OS Mobil – Carb-Cycling (1.119.0, wie PC 1.0.195 / Verbesserung 27): an Trainingstagen
// mehr, an Ruhetagen weniger Kohlenhydrate, Fett gleicht die Energie aus. Einstellung
// `ui.carb_cycling` kommt vom PC (Settings → Ziele, Standard aus); Rechnung in pcdomain.js.
import * as D from "./pcdomain.js";

/** Pläne in der Form `TrainingPlan` (Tage mit Terminen) für `plannedTrainings`. */
function plansWithSlots(db, catalog) {
  const slots = db.pc?.training_plan_slot ?? [];
  return (catalog?.plans ?? []).map((p) => ({
    id: p.row.id,
    name: p.row.name,
    archived: !!p.row.archived,
    days: p.days.map((d) => ({
      id: d.row.id,
      name: d.row.name,
      slots: slots
        .filter((s) => s.plan_day_id === d.row.id)
        .map((s) => ({ weekday: s.weekday ?? null, date: s.date ?? null, time: s.time ?? null })),
    })),
  }));
}

/** Tagesziel mit Carb-Cycling des Tages (unverändert, wenn aus oder ohne Ziel). */
export function withCarbCycle(goal, db, catalog, date, workouts) {
  if (!goal) return goal;
  const C = D.carbCycle;
  const cfg = C.parseCarbCycle(db.settings.get(C.CARB_CYCLE_KEY) ?? null);
  if (!cfg.on) return goal;
  const planned = D.schedule.plannedTrainings(plansWithSlots(db, catalog), [date]).length;
  return { ...goal, carbCycle: C.carbCycleFor(cfg, { workouts, planned }) };
}
