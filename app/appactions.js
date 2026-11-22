// LIFESPAN OS Mobil – Aktionen der Knöpfe (`data-act`) der Handy-App (aus app.js, 1.74.0).
import * as C from "./core.js";
import { bodyParityActions } from "./bodyparity.js";
import { goalsParityActions } from "./goalsparity.js";
import * as store from "./store.js";
import { foodActions } from "./food.js";
import { bodyActions, bodyOpenEntry } from "./body.js";
import { SECTIONS } from "./nav.js";
import { diaryActions, today as todayIso } from "./diary.js";
import { vendorActions } from "./vendorui.js";
import * as MI from "./machineimages.js";
import { catalogActions } from "./catalogui.js";
import { goalActions } from "./goalsui.js";
import { blsActions } from "./blsui.js";
import { offActions } from "./offui.js";
import { overviewActions } from "./overview.js";
import { parityActions } from "./parity.js";
import { logsActions } from "./logs.js";
import { insightsActions } from "./insightsview.js";
import { weeklyReportsActions } from "./weeklyreports.js";
import { todoActions } from "./todos.js";
import { healthActions } from "./health.js";
import { longevityActions } from "./longevityview.js";
import { protocolsActions } from "./protocolsview.js";
import { superActions } from "./super.js";
import { icoachActions } from "./icoach.js";
import { layoutActions, settingsActions } from "./settingsview.js";
import { trainingActions } from "./training.js";
import * as TR from "./trainingdata.js";
import * as PD from "./pending.js";
import * as HX from "./hyrox.js";
import * as GY from "./gymsui.js";
import { extrasActions } from "./extras.js";
import { exById, go, refreshCatalog, render, S, saveNow, saveSoon, toast } from "./appbase.js";
import { foldTabs, jumpTargets } from "./sheets.js";
import { quickGo, renderNav, rerenderKeepScroll, setMenu } from "./navshell.js";
import { adjustRest, startRest, stopRest, wakeLock } from "./resttimer.js";
import { accountName, createAccount, switchAccount } from "./accounts.js";
import { addExercise, applyDivisionWeights, exComplete, findSet, findWe, focusExId, isOpen, pcWorkout, setFocus, startWorkout } from "./workoutview.js";
import { exportAccount, markSent, sendFile } from "./transferview.js";

export const actions = {
  ...foodActions,
  ...diaryActions,
  ...vendorActions,
  ...MI.machineImageActions,
  ...catalogActions,
  ...goalActions,
  ...settingsActions,
  ...layoutActions,
  "rem-go": (el) => {
    const k = el.dataset.arg;
    if (k === "weigh") return quickGo("body");
    if (k === "hrt") return go("super");
    S.diaryDate = todayIso();
    return go("diary");
  },
  ...blsActions,
  ...offActions,
  ...overviewActions,
  ...parityActions,
  ...bodyParityActions,
  ...goalsParityActions,
  ...logsActions,
  ...insightsActions,
  ...weeklyReportsActions,
  ...todoActions,
  ...icoachActions,
  ...healthActions,
  ...longevityActions,
  ...protocolsActions,
  ...superActions,
  ...bodyActions,
  ...extrasActions,
  ...trainingActions,
  ...GY.gymsActions,
  "start-free": () => startWorkout("Freies Training"),
  "comp-add": () => {
    S.active.competition = { ...HX.emptyCompetition(null), sex: "women" };
    saveSoon();
    rerenderKeepScroll();
  },
  "comp-remove": () => {
    S.active.competition = null;
    saveSoon();
    rerenderKeepScroll();
  },
  "comp-sex": (el) => {
    const c = S.active?.competition;
    if (!c) return;
    c.sex = el.dataset.arg;
    if (c.division && !HX.divisionsFor(c.sex).some((d) => d.value === c.division)) {
      c.division = HX.defaultDivision(c.sex);
      applyDivisionWeights(S.active, c.division);
    }
    saveSoon();
    rerenderKeepScroll();
  },
  "start-plan": (el) => {
    for (const p of S.catalog.plans) {
      const d = p.days.find((x) => x.row.id === el.dataset.arg);
      if (d) return startWorkout(d.row.name, d, p.row.gym_id ?? null);
    }
  },
  "pick-machine": (el) => {
    // Maschine mit Übungen: Auswahl zeigen (mehrere Übungen an einer Maschine sind möglich)
    if (C.machineExercises(S.catalog, S.localExercises, el.dataset.arg).length > 0) {
      go("machine", el.dataset.arg);
      return;
    }
    try {
      const { exercise, created } = C.exerciseForMachine(S.catalog, S.localExercises, el.dataset.arg);
      if (created) S.localExercises.push(exercise);
      addExercise(exercise.id);
    } catch (e) {
      toast(e.message, true);
    }
  },
  "pick-exercise": (el) => addExercise(el.dataset.arg),
  "new-machine-ex": (el) => {
    const name = document.getElementById("new-ex-name")?.value ?? "";
    try {
      const { exercise, created } = C.newMachineExercise(S.catalog, S.localExercises, el.dataset.arg, name);
      if (created) S.localExercises.push(exercise);
      addExercise(exercise.id);
    } catch (e) {
      toast(e.message, true);
    }
  },
  "toggle-done": (el) => {
    const we = findWe(el.dataset.we);
    const s = findSet(el.dataset.we, el.dataset.set);
    if (!s) return;
    s.isDone = !s.isDone;
    if (s.isDone && we.restSeconds) startRest(we.restSeconds);
    // Übung fertig: nächste offene Übung wird die aktuelle (aufgeklappt), diese klappt zu
    if (s.isDone && we.sets.every((x) => x.isDone)) {
      const list = S.active.exercises;
      const idx = list.findIndex((e) => e.id === we.id);
      const next = [...list.slice(idx + 1), ...list.slice(0, idx)].find((e) => !e.sets.length || e.sets.some((x) => !x.isDone));
      if (next) {
        setFocus(S.active, next.id);
        delete S.exOpen?.[we.id];
        saveSoon();
        render();
        requestAnimationFrame(() => document.getElementById(`ex-${next.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
        return;
      }
    }
    // abgehakte Übung wird die aktuelle (wie am PC)
    if (s.isDone && !exComplete(we) && focusExId(S.active) !== we.id) setFocus(S.active, we.id);
    saveSoon();
    rerenderKeepScroll();
  },
  flag: (el) => {
    const s = findSet(el.dataset.we, el.dataset.set);
    if (!s) return;
    s[el.dataset.flag] = !s[el.dataset.flag];
    saveSoon();
    rerenderKeepScroll();
  },
  "toggle-profile": (el) => {
    const we = findWe(el.dataset.we);
    const ex = exById().get(we.exerciseId);
    const vis = C.visibleProfiles(we, ex);
    const k = el.dataset.arg;
    if (vis.includes(k) && el.dataset.locked) return toast("Erst die Werte in dieser Spalte löschen.", true);
    we.profiles = vis.includes(k) ? vis.filter((x) => x !== k) : C.PROFILE_KEYS.filter((x) => x === k || vis.includes(x));
    saveSoon();
    rerenderKeepScroll();
  },
  "focus-info": (el) => {
    S.focusOpen = S.focusOpen === el.dataset.arg ? null : el.dataset.arg;
    rerenderKeepScroll();
  },
  "toggle-ex": (el) => {
    const we = findWe(el.dataset.we);
    if (!we) return;
    if (!S.exOpen) S.exOpen = {};
    S.exOpen[we.id] = !isOpen(S.active, we);
    rerenderKeepScroll();
  },
  "add-set": (el) => {
    const we = findWe(el.dataset.we);
    const prev = we.sets[we.sets.length - 1] || null;
    we.sets.push(C.newSet(prev ? { ...prev, isWarmup: false } : null));
    saveSoon();
    rerenderKeepScroll();
  },
  "del-set": (el) => {
    const we = findWe(el.dataset.we);
    we.sets = we.sets.filter((s) => s.id !== el.dataset.set);
    saveSoon();
    rerenderKeepScroll();
  },
  "remove-ex": (el) => {
    const we = findWe(el.dataset.we);
    if (we.sets.some((s) => s.isDone) && !confirmTwice(el, "Wirklich entfernen?")) return;
    S.active.exercises = S.active.exercises.filter((e) => e.id !== el.dataset.we);
    saveSoon();
    rerenderKeepScroll();
  },
  "move-up": (el) => {
    const list = S.active.exercises;
    const i = list.findIndex((e) => e.id === el.dataset.we);
    if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    saveSoon();
    rerenderKeepScroll();
  },
  discard: async (el) => {
    const editOf = S.active?.editOf ?? null;
    if (!confirmTwice(el, editOf ? "Nochmal tippen: Änderungen verwerfen" : "Nochmal tippen: Training wirklich verwerfen")) return;
    S.active = null;
    stopRest();
    wakeLock(false);
    await saveNow();
    toast(editOf ? "Änderungen verworfen" : "Training verworfen");
    if (editOf && (S.workouts.some((w) => w.id === editOf) || pcWorkout(editOf))) go("detail", editOf);
    else go("training");
  },
  exertion: (el) => {
    const n = Number(el.dataset.arg);
    S.active.perceivedExertion = S.active.perceivedExertion === n ? null : n;
    saveSoon();
    rerenderKeepScroll();
  },
  finish: async () => {
    const opts = { keepUnticked: S.prefs.keepUnticked };
    if (C.checkWorkout(S.active, opts).length) return render();
    if (S.active.editOf) {
      const d = S.active.durationMin;
      if (d !== null && (!Number.isFinite(d) || d < 1 || d > 1440)) return render();
      if (!S.active.date || !/^\d{4}-\d{2}-\d{2}$/.test(S.active.date)) return toast("Bitte ein gültiges Datum angeben.", true);
      if (S.active.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(S.active.startTime)) return toast("Uhrzeit als HH:MM eingeben.", true);
      const i = S.workouts.findIndex((x) => x.id === S.active.editOf);
      const original = i >= 0 ? S.workouts[i] : S.active.pcOriginal;
      if (!original) {
        toast("Das ursprüngliche Training gibt es nicht mehr.", true);
        return;
      }
      const { pcOriginal, backfill, ...edited } = S.active;
      void pcOriginal;
      if (backfill && !edited.exercises.some((e) => e.sets.length)) return toast("Bitte mindestens eine Übung mit Satz eintragen.", true);
      const saved = C.saveEdit(original, edited, new Date(), opts);
      if (i >= 0) S.workouts[i] = saved;
      else S.workouts.push(saved);
      S.active = null;
      stopRest();
      wakeLock(false);
      await saveNow();
      toast(backfill ? "Einheit gespeichert" : "Änderungen gespeichert");
      go("detail", saved.id);
      return;
    }
    const done = C.finishWorkout(S.active, new Date(), opts);
    S.workouts.push(done);
    // Aus einem Plan: Angebot, die Werte als Richtwerte in den Trainingstag zu übernehmen (wie am PC)
    S.trainAdopt = done.planDayId && TR.hasTable(S.catalogRaw, "training_plan") ? { id: done.id, title: done.title } : null;
    S.active = null;
    stopRest();
    wakeLock(false);
    await saveNow();
    toast("Training gespeichert");
    go("detail", done.id);
  },
  send: (el) => {
    const [kind, scope] = el.dataset.arg.split("|");
    sendFile(kind, scope === "all");
  },
  "mark-sent": async (el) => {
    await markSent(el.dataset.arg);
    toast("Als übertragen markiert");
    go("home");
  },
  // Nach dem Senden automatisch markieren (Settings → Import/Export, 1.48.0): Tipp auf die Datei
  "sent-auto": async (el) => {
    if (!S.prefs.transfer.autoMark) return;
    await markSent(el.dataset.arg);
    const note = document.getElementById("send-auto-note");
    if (note) note.textContent = "Als übertragen markiert.";
    toast("Als übertragen markiert");
  },
  "edit-workout": async (el) => {
    if (S.active) {
      toast(S.active.editOf ? "Erst die laufende Bearbeitung speichern oder verwerfen." : "Erst das laufende Training beenden.", true);
      return;
    }
    const own = S.workouts.find((x) => x.id === el.dataset.arg);
    const w = own ?? pcWorkout(el.dataset.arg);
    if (!w) return;
    S.active = own ? C.startEdit(w) : { ...C.startEdit(w), pcOriginal: w };
    await saveNow();
    go("workout");
  },
  "delete-workout": async (el) => {
    if (!confirmTwice(el, "Nochmal tippen: Training löschen")) return;
    S.workouts = S.workouts.filter((w) => w.id !== el.dataset.arg);
    await saveNow();
    go("home");
  },
  "pending-toggle": (el) => {
    S.pendingOpen = S.pendingOpen === el.dataset.arg ? null : el.dataset.arg;
    render();
  },
  "pending-edit": (el) => {
    const it = PD.pendingItems(S).find((x) => x.key === el.dataset.arg);
    if (!it?.edit) return;
    const t = it.edit;
    Object.assign(S, t.set ?? {});
    S.trainNotice = null;
    S.view = t.view;
    S.arg = t.viewArg ?? null;
    const fn = t.act ? actions[t.act] : null;
    if (fn) fn({ dataset: { arg: t.arg }, closest: () => null });
    render();
    window.scrollTo(0, 0);
  },
  "pending-discard": async (el) => {
    const all = PD.pendingItems(S);
    const it = all.find((x) => x.key === el.dataset.arg);
    if (!it) return;
    if (!confirmTwice(el, it.status === "Löschung" ? "Nochmal tippen: wiederherstellen" : "Nochmal tippen: verwerfen")) return;
    let stores;
    try {
      stores = PD.discardItem(S, it, all);
    } catch (e) {
      return toast(e.message, true);
    }
    for (const name of stores) await store.set(name, name === "body" ? S.body.local : S[name]);
    if (stores.includes("train")) refreshCatalog();
    S.pendingOpen = null;
    toast(it.status === "Löschung" ? `„${it.title}“ wiederhergestellt` : `„${it.title}“ verworfen`);
    render();
  },
  "pending-wo-discard": async (el) => {
    if (!confirmTwice(el, "Nochmal tippen: Training verwerfen")) return;
    S.workouts = S.workouts.filter((w) => w.id !== el.dataset.arg);
    await saveNow();
    toast("Training verworfen");
    render();
  },
  "account-new": () => {
    S.accountForm = null;
    go("account-new");
  },
  "account-create": async () => {
    const val = (id) => document.getElementById(id)?.value ?? "";
    const f = { name: val("acc-name"), sex: val("acc-sex"), birthDate: val("acc-birth"), heightCm: val("acc-height"), error: null, busy: true };
    S.accountForm = f;
    render();
    try {
      const reload = await createAccount(f);
      S.accountForm = null;
      if (reload) {
        toast(`Konto „${f.name.trim()}“ angelegt`);
        setTimeout(() => location.reload(), 600);
        return;
      }
      toast(`Konto „${f.name.trim()}“ angelegt`);
      go("home");
    } catch (e) {
      S.accountForm = { ...f, busy: false, error: e.message };
      render();
    }
  },
  "account-switch": (el) => switchAccount(el.dataset.arg),
  // Konto umbenennen (1.48.0): ein anderes Konto bekommt den Namen beim nächsten Wechsel auch im Profil
  "account-rename-cancel": () => {
    S.accRename = null;
    rerenderKeepScroll();
  },
  "account-rename": (el) => {
    S.accRename = el.dataset.arg;
    rerenderKeepScroll();
    setTimeout(() => document.getElementById("acc-rename")?.focus(), 0);
  },
  "account-rename-save": async (el) => {
    const id = el.dataset.arg;
    const name = (document.getElementById("acc-rename")?.value ?? "").trim();
    if (!name || [...name].length > 60) return toast("Bitte einen Namen mit höchstens 60 Zeichen eingeben.", true);
    if (id === "") {
      S.mainAccountName = name;
      await store.setGlobal("mainName", name);
      await store.setGlobal("mainRename", name);
    } else {
      S.accounts = S.accounts.map((a) => (a.id === id ? { ...a, name, rename: name } : a));
      await store.setGlobal("accounts", S.accounts);
    }
    S.accRename = null;
    toast(`Umbenannt in „${name}“`);
    render();
  },
  "account-export": (el) => exportAccount(el),
  "account-delete": async (el) => {
    const id = el.dataset.arg;
    const name = accountName(id);
    if (!confirmTwice(el, "Nochmal tippen: endgültig löschen")) return;
    await store.clearAccount(id);
    S.accounts = S.accounts.filter((a) => a.id !== id);
    await store.setGlobal("accounts", S.accounts);
    toast(`Konto „${name}“ mit allen Daten gelöscht`);
    render();
  },
  "transfer-glucose": () => {
    S.healthTab = "glucose";
    return go("health");
  },
  "bar-reset": async () => {
    delete S.prefs.barSlots;
    await saveNow();
    toast("Untere Leiste: Training und Nutrition");
    render();
  },
  // Untermenü „Abschnitte“: zur Überschrift springen (1.33.0)
  "sheet-jump": (el) => {
    const h = jumpTargets[Number(el.dataset.arg)];
    S.tabsOpen = { ...(S.tabsOpen ?? {}), page: false };
    foldTabs();
    renderNav();
    const card = h?.closest(".card") ?? h;
    // scroll-padding-top (Höhe des Kopfs) sorgt dafür, dass die Karte unter dem Kopf beginnt
    card?.scrollIntoView({ block: "start", behavior: "smooth" });
  },
  "tabs-fold": (el) => {
    const key = el.dataset.arg;
    S.tabsOpen = { ...(S.tabsOpen ?? {}), [key]: !S.tabsOpen?.[key] };
    rerenderKeepScroll();
  },
  "menu-open": () => setMenu(true),
  "menu-go": (el) => {
    S.menuOpen = false;
    // Links auf einen Reiter (wie #/training?tab=neat am PC); aus dem Menü immer der erste Reiter
    if (el.dataset.arg === "training") S.trainTab = el.dataset.tab ?? (el.closest(".drawer") ? "workouts" : S.trainTab ?? "workouts");
    // Schritte aus der Overview (1.87.0): Tag der Overview öffnen und zum Feld „Schritte am Tag“ springen
    if (el.dataset.neatDate) {
      S.trainNeatDate = el.dataset.neatDate === todayIso() ? null : el.dataset.neatDate;
      S.trainErrors = null;
    }
    const focusId = el.dataset.focus ?? null;
    if (focusId) {
      setTimeout(() => {
        const f = document.getElementById(focusId);
        if (!f) return;
        f.scrollIntoView({ block: "center" });
        f.focus({ preventScroll: true });
      }, 80);
    }
    // Body: direkt „Werte erfassen“, auf Wunsch beim Bereich (z. B. „entry:circumference“, 1.40.0)
    if (el.dataset.arg === "body" && el.dataset.tab?.startsWith("entry")) return bodyOpenEntry(el.dataset.tab.split(":")[1] ?? null);
    // Check-Ins liegen seit 1.60.0 unter Body & Longevity; aus dem Menü seit 1.77.0 immer „Überblick“ (wie am PC)
    if (el.dataset.arg === "body") S.bodyTab = el.dataset.tab ?? (el.closest(".drawer") ? "overview" : S.bodyTab ?? "overview");
    const sec = SECTIONS.find((x) => x.id === el.dataset.arg);
    return sec?.view ? go(sec.view) : go("pc-only", el.dataset.arg);
  },
  "rest-plus": () => adjustRest(15),
  "rest-minus": () => adjustRest(-15),
  "rest-stop": () => stopRest(),
};

/** Zweistufige Bestätigung im Knopf selbst (Browser-Dialoge sind auf dem Handy unpraktisch). */
export function confirmTwice(el, text) {
  if (el.dataset.armed === "1") return true;
  el.dataset.armed = "1";
  const old = el.textContent;
  el.textContent = text;
  setTimeout(() => {
    if (el.isConnected) {
      el.dataset.armed = "";
      el.textContent = old;
    }
  }, 3500);
  return false;
}
