// LIFESPAN OS Mobil – Training: Aktionen, Eingaben und Auswahlfelder (aus training.js, 1.75.0).
import * as D from "./pcdomain.js";
import * as P from "./pcdb.js";
import * as TR from "./trainingdata.js";
import { today } from "./diary.js";
import { statsActions, statsChange } from "./trainingstats.js";
import { dbActions, dbChange, dbInput } from "./trainingdb.js";
import { planCalActions } from "./plancalendar.js";
import { adoptWorkout, applyDay, failed, fmtDate, groupOfTab, neatDraftNow, persistTrain, setNotice, TRAINING_GROUPS, updateNeatLive, X } from "./training.js";
import { addPlanExercise, isCardioCheck, planPickerResults, syncPlanInputs } from "./trainingplans.js";
import { autosaveNow } from "./autosave.js";

// ------------------------------------------------------------------ Aktionen

export const trainingActions = {
  ...statsActions,
  ...dbActions,
  ...planCalActions,
  // Gruppe der Reiterleiste: zuletzt gewählter Unterreiter dieser Gruppe, sonst der erste (1.72.0)
  "train-group": (el) => {
    const S = X.S;
    const group = TRAINING_GROUPS.find(([g]) => g === el.dataset.arg);
    if (!group) return;
    const last = S.trainSub?.[group[0]];
    trainingActions["train-tab"]({ dataset: { arg: group[2].some(([v]) => v === last) ? last : group[2][0][0] } });
  },
  "train-tab": (el) => {
    const S = X.S;
    syncPlanInputs();
    S.trainTab = el.dataset.arg;
    S.trainSub = { ...(S.trainSub ?? {}), [groupOfTab(S.trainTab)[0]]: S.trainTab };
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
  },
  "train-start-day": () => X.startPlanDay(X.S.trainPlanDay),
  "train-sort-dir": () => {
    const S = X.S;
    const cur = S.trainSort ?? D.workoutList.DEFAULT_WORKOUT_SORT;
    S.trainSort = { key: cur.key, direction: cur.direction === "asc" ? "desc" : "asc" };
    X.rerender();
  },
  "train-start-plan-day": (el) => X.startPlanDay(el.dataset.arg),
  "train-backfill": () => X.startBackfill(today()),
  // Kalender der Einheiten (1.103.0)
  "train-backfill-on": (el) => X.startBackfill(el.dataset.arg || today()),
  "train-view": (el) => {
    X.S.trainView = el.dataset.arg === "calendar" ? "calendar" : "list";
    try {
      localStorage.setItem("lifespan.workoutsView", X.S.trainView);
    } catch {
      // nur für diese Sitzung
    }
    X.rerender();
  },
  "train-cal-month": (el) => {
    const t = today();
    const cur = X.S.trainMonth ?? { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) };
    const n = cur.year * 12 + cur.month - 1 + Number(el.dataset.arg || 0);
    X.S.trainMonth = { year: Math.floor(n / 12), month: (n % 12) + 1 };
    X.S.trainCalDay = null;
    X.rerender();
  },
  "train-cal-day": (el) => {
    X.S.trainCalDay = X.S.trainCalDay === el.dataset.arg ? null : el.dataset.arg;
    X.rerender();
  },
  "train-cardio": () => X.startCardio(X.S.trainCardio),
  "train-open": (el) => X.openWorkout(el.dataset.arg),
  // Herzfrequenz der Einheit ein-/ausklappen (1.44.0)
  "train-heart": (el) => {
    X.S.trainHeart = X.S.trainHeart === el.dataset.arg ? null : el.dataset.arg;
    X.rerender();
  },
  "train-day": async (el) => {
    try {
      await applyDay(today(), el.dataset.arg || null);
    } catch (e) {
      setNotice("error", e.message);
    }
    X.rerender();
  },
  "train-day-clear": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: entfernen")) return;
    try {
      await applyDay(el.dataset.arg, null);
    } catch (e) {
      setNotice("error", e.message);
    }
    X.rerender();
  },
  "train-dialog-close": () => {
    X.S.trainDialog = null;
    X.rerender();
  },
  "train-adopt": async () => {
    const S = X.S;
    const w = S.workouts.find((x) => x.id === S.trainAdopt?.id);
    try {
      if (!w) throw new Error("Die Einheit gibt es nicht mehr.");
      const r = adoptWorkout(w);
      await persistTrain();
      setNotice(
        "ok",
        r.updated > 0
          ? `Plan „${r.planName}“, Tag „${r.dayName}“: ${r.updated} ${r.updated === 1 ? "Übung hat" : "Übungen haben"} neue Richtwerte.${r.notInPlan.length ? ` Nicht im Plan (unverändert): ${r.notInPlan.join(", ")}.` : ""}`
          : "Keine Übung dieser Einheit steht im Trainingstag – der Plan bleibt unverändert.",
      );
      S.trainAdopt = null;
    } catch (e) {
      setNotice("error", e.message);
    }
    X.rerender();
  },
  "train-adopt-no": () => {
    X.S.trainAdopt = null;
    X.rerender();
  },
  // NEAT
  "train-neat-day": (el) => {
    const S = X.S;
    const d = P.addDays(S.trainNeatDate ?? today(), Number(el.dataset.arg));
    if (d > today()) return;
    S.trainNeatDate = d;
    S.trainNeatDraft = null;
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
  },
  "train-neat-pick": (el) => {
    const S = X.S;
    S.trainNeatDate = el.dataset.arg;
    S.trainNeatDraft = null;
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
    requestAnimationFrame(() => document.getElementById("neat-title")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "train-weigh-ok": (el) => {
    const S = X.S;
    S.trainWeighDismissed = [...(S.trainWeighDismissed ?? []), el.dataset.arg];
    X.rerender();
  },
  "train-neat-save": async () => {
    const S = X.S;
    const d = neatDraftNow();
    S.trainNeatDraft = d;
    const r = D.neat.neatDraftToInput({
      date: d.date,
      exists: false,
      steps: d.steps ?? "",
      minutes: Object.fromEntries(TR.MINUTE_FIELDS.map(([k]) => [k, d[k] ?? ""])),
      otherLabel: d.otherLabel ?? "",
      notes: d.notes ?? "",
    });
    if (!r.ok) {
      S.trainErrors = r.errors;
      setNotice("error", "Bitte die markierten Felder prüfen.");
      return X.rerender();
    }
    try {
      TR.saveNeat(S.catalogRaw, S.train, r.input, { uuid: X.uuid, now: new Date() });
      await persistTrain();
      S.trainErrors = {};
      S.trainNeatDraft = null;
      // Sofort speichern (1.131.0): Meldung kommt oben mit „Rückgängig“
      if (S.autosaving) X.toast(`Alltagsbewegung für ${fmtDate(d.date)} gespeichert`);
      else setNotice("ok", `Alltagsbewegung für ${fmtDate(d.date)} gespeichert.`);
    } catch (e) {
      failed(e);
    }
    X.rerender();
  },
  "train-neat-delete": async (el) => {
    const S = X.S;
    if (!X.confirmTwice(el, "Nochmal tippen: Alltagsbewegung dieses Tages löschen")) return;
    const date = S.trainNeatDate ?? today();
    TR.deleteNeat(S.catalogRaw, S.train, date, new Date());
    await persistTrain();
    S.trainNeatDraft = null;
    setNotice("ok", `Eintrag für ${fmtDate(date)} gelöscht.`);
    X.rerender();
  },
  // Pläne
  "plan-new": () => {
    const S = X.S;
    S.trainPlanEdit = D.planDraft.emptyPlanDraft();
    S.trainPlanDayIdx = null;
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
  },
  "plan-icon": (el) => {
    const S = X.S;
    if (!S.trainPlanEdit) return;
    S.trainPlanEdit.icon = el.dataset.arg;
    X.rerender();
  },
  "plan-edit": (el) => {
    const S = X.S;
    const plan = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises).find((p) => p.id === el.dataset.arg);
    if (!plan) return;
    S.trainPlanEdit = D.planDraft.planToDraft(plan, isCardioCheck());
    S.trainPlanDayIdx = null;
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
    window.scrollTo(0, 0);
  },
  "plan-copy": async (el) => {
    const S = X.S;
    const plan = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises).find((p) => p.id === el.dataset.arg);
    if (!plan) return;
    try {
      const id = TR.copyPlan(S.catalogRaw, S.train, plan, { uuid: X.uuid, now: new Date(), exercises: [...S.catalog.exercises, ...(S.localExercises ?? [])] });
      await persistTrain();
      const copy = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises).find((p) => p.id === id);
      setNotice("ok", `Kopie „${copy?.name ?? ""}“ angelegt. Du kannst sie jetzt unabhängig vom Original bearbeiten.`);
      if (copy) S.trainPlanEdit = D.planDraft.planToDraft(copy, isCardioCheck());
      S.trainPlanDayIdx = null;
    } catch (e) {
      setNotice("error", e.message);
    }
    X.rerender();
  },
  "plan-delete": async (el) => {
    const S = X.S;
    const plan = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises).find((p) => p.id === el.dataset.arg);
    if (!plan || !X.confirmTwice(el, `Nochmal tippen: Plan „${plan.name}“ löschen`)) return;
    TR.deletePlan(S.catalogRaw, S.train, plan.id, new Date());
    await persistTrain();
    setNotice("ok", `Plan „${plan.name}“ gelöscht. Durchgeführte Einheiten bleiben erhalten.`);
    X.rerender();
  },
  "plan-cancel": () => {
    const S = X.S;
    S.trainPlanEdit = null;
    S.trainPlanDayIdx = null;
    S.trainErrors = {};
    S.trainNotice = null;
    X.rerender();
  },
  "plan-day-add": () => {
    const S = X.S;
    syncPlanInputs();
    const d = S.trainPlanEdit;
    d.days.push(D.planDraft.emptyPlanDay(`Tag ${String.fromCharCode(65 + d.days.length)}`));
    X.rerender();
  },
  "plan-day-move": (el) => {
    const S = X.S;
    syncPlanInputs();
    const [i, dir] = el.dataset.arg.split("|").map(Number);
    S.trainPlanEdit.days = D.planDraft.move(S.trainPlanEdit.days, i, dir);
    X.rerender();
  },
  "plan-day-remove": (el) => {
    const S = X.S;
    syncPlanInputs();
    if (!X.confirmTwice(el, "Nochmal tippen: Tag entfernen")) return;
    S.trainPlanEdit.days = S.trainPlanEdit.days.filter((_, i) => i !== Number(el.dataset.arg));
    X.rerender();
  },
  "plan-day-open": (el) => {
    const S = X.S;
    syncPlanInputs();
    S.trainPlanDayIdx = Number(el.dataset.arg);
    S.trainPlanQuery = "";
    X.rerender();
    window.scrollTo(0, 0);
  },
  "plan-slot-add": (el) => {
    syncPlanInputs();
    X.S.trainPlanEdit.days[Number(el.dataset.arg)].slots.push(D.planDraft.emptySlot());
    X.rerender();
  },
  "plan-slot-remove": (el) => {
    syncPlanInputs();
    const [di, si] = el.dataset.arg.split("|").map(Number);
    const day = X.S.trainPlanEdit.days[di];
    day.slots = day.slots.filter((_, i) => i !== si);
    X.rerender();
  },
  "plan-save": async () => {
    const S = X.S;
    syncPlanInputs();
    const all = [...S.catalog.exercises, ...(S.localExercises ?? [])];
    const defaults = (id) => {
      const e = all.find((x) => x.id === id);
      try {
        return e?.resistance_profiles ? JSON.parse(e.resistance_profiles) : [];
      } catch {
        return [];
      }
    };
    const r = D.planDraft.planDraftToInput(S.trainPlanEdit, defaults);
    if (!r.ok) {
      S.trainErrors = r.errors;
      setNotice("error", "Bitte die markierten Felder prüfen.");
      return X.rerender();
    }
    try {
      // Übungen, die nur am Handy angelegt wurden, gehen mit dem Plan an den PC
      for (const day of r.input.days) for (const ex of day.exercises) {
        const local = (S.localExercises ?? []).find((e) => e.id === ex.exerciseId);
        if (local) TR.addExerciseRow(S.catalogRaw, S.train, local);
      }
      const planId = TR.savePlan(S.catalogRaw, S.train, r.input, { uuid: X.uuid, now: new Date(), exercises: all });
      await persistTrain();
      S.trainErrors = {};
      // Sofort speichern (1.131.0): Editor bleibt offen und bearbeitet den gespeicherten Plan
      const saved = S.autosaving ? TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises).find((p) => p.id === planId) : null;
      if (saved) {
        S.trainPlanEdit = D.planDraft.planToDraft(saved, isCardioCheck());
        X.toast(`Plan „${r.input.name.trim()}“ gespeichert`);
        return X.rerender();
      }
      setNotice("ok", `Plan „${r.input.name.trim()}“ gespeichert.`);
      S.trainPlanEdit = null;
      S.trainPlanDayIdx = null;
    } catch (e) {
      failed(e);
    }
    X.rerender();
    window.scrollTo(0, 0);
  },
  "pday-done": () => {
    const S = X.S;
    syncPlanInputs();
    const di = S.trainPlanDayIdx;
    const day = S.trainPlanEdit.days[di];
    const r = D.planDraft.checkPlanDay(day);
    if (!r.ok) {
      S.trainErrors = Object.fromEntries(Object.entries(r.errors).map(([k, v]) => [`days.${di}.${k}`, v]));
      setNotice("error", "Bitte die markierten Felder prüfen.");
      return X.rerender();
    }
    S.trainErrors = Object.fromEntries(Object.entries(S.trainErrors ?? {}).filter(([k]) => !k.startsWith(`days.${di}.`)));
    S.trainNotice = null;
    S.trainPlanDayIdx = null;
    X.rerender();
    window.scrollTo(0, 0);
    // Sofort speichern (1.131.0): geänderte Übungen des Tages gleich im Plan speichern
    autosaveNow("plan");
  },
  "pday-ex-add": (el) => addPlanExercise(el.dataset.arg),
  "pday-machine-add": (el) => {
    const S = X.S;
    try {
      const { exercise, created } = X.C.exerciseForMachine(S.catalog, S.localExercises, el.dataset.arg);
      if (created) S.localExercises.push(exercise);
      addPlanExercise(exercise.id);
    } catch (e) {
      X.toast(e.message, true);
    }
  },
  "pday-ex-remove": (el) => {
    const S = X.S;
    syncPlanInputs();
    const day = S.trainPlanEdit.days[S.trainPlanDayIdx];
    day.exercises = day.exercises.filter((_, i) => i !== Number(el.dataset.arg));
    X.rerender();
  },
  "pday-ex-move": (el) => {
    const S = X.S;
    syncPlanInputs();
    const [i, dir] = el.dataset.arg.split("|").map(Number);
    const day = S.trainPlanEdit.days[S.trainPlanDayIdx];
    day.exercises = D.planDraft.move(day.exercises, i, dir);
    X.rerender();
  },
  "pday-set-add": (el) => {
    const S = X.S;
    syncPlanInputs();
    const ex = S.trainPlanEdit.days[S.trainPlanDayIdx].exercises[Number(el.dataset.arg)];
    const prev = ex.sets[ex.sets.length - 1];
    ex.sets.push(prev ? { ...D.workoutDraft.copySet(prev), isWarmup: false } : D.workoutDraft.emptySet());
    X.rerender();
  },
  "pday-set-remove": (el) => {
    const S = X.S;
    syncPlanInputs();
    const [ei, si] = el.dataset.arg.split("|").map(Number);
    const ex = S.trainPlanEdit.days[S.trainPlanDayIdx].exercises[ei];
    ex.sets = ex.sets.filter((_, i) => i !== si);
    X.rerender();
  },
};

export function trainingInput(el) {
  if (dbInput(el)) return true;
  if (el.dataset.tinput === "planQuery") {
    X.S.trainPlanQuery = el.value;
    const box = document.getElementById("pday-results");
    if (box) box.innerHTML = planPickerResults(el.value);
    return true;
  }
  if (el.dataset.neat) {
    // Kalorien, Zielbalken und Summe live wie am PC – ohne Neuaufbau (sonst ginge der Fokus verloren)
    X.S.trainNeatDraft = neatDraftNow();
    updateNeatLive();
    return true;
  }
  return false;
}

export function trainingChange(el) {
  const S = X.S;
  if (statsChange(el)) return true;
  if (dbChange(el)) return true;
  const k = el.dataset.tchange;
  if (k === "sort") {
    S.trainSort = D.workoutList.nextWorkoutSort(S.trainSort ?? D.workoutList.DEFAULT_WORKOUT_SORT, el.value);
    X.rerender();
    return true;
  }
  if (k === "planDay") {
    S.trainPlanDay = el.value;
    X.rerender();
    return true;
  }
  if (k === "cardio") {
    S.trainCardio = el.value;
    X.rerender();
    return true;
  }
  if (k === "neatDate") {
    if (el.value && el.value <= today()) {
      S.trainNeatDate = el.value;
      S.trainNeatDraft = null;
      S.trainNotice = null;
      S.trainErrors = {};
    }
    X.rerender();
    return true;
  }
  if (el.dataset.neat) {
    S.trainNeatDraft = neatDraftNow();
    return true;
  }
  if (el.dataset.slot && el.dataset.pf === "kind") {
    syncPlanInputs();
    X.rerender();
    return true;
  }
  return false;
}
