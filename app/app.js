// LIFESPAN OS Mobil – Einstieg: Ansichten-Tabelle, Eingaben, Start. Logik in core.js, Speicher in store.js;
// Oberfläche seit 1.74.0 auf Module verteilt (appbase, sheets, navshell, workoutview, transferview, appactions …).
import "./sheets.js";
import { bodyParityChange } from "./bodyparity.js";
import { goalsParityChange } from "./goalsparity.js";
import { initRowSwipe } from "./swiperow.js";
import * as PR from "./paritydata.js";
import { parityChangeB as parityChange } from "./parity.js";
import "./navshell.js";
import * as C from "./core.js";
import * as store from "./store.js";
import { foodChange, foodInput, foodState, initFood, viewDish, viewFood, viewFoodReview } from "./food.js";
import { bodyChange, bodyInput, bodyState, initBody, viewBody, viewBodyEntry, viewBodyMetric } from "./body.js";
import { barSlots } from "./nav.js";
import * as P from "./pcdb.js";
import { diaryChange, diaryInput, initDiary, today as todayIso, viewDiary, viewFastEntry, viewNutritionHistory, viewSuppIntake } from "./diary.js";
import * as FT from "./fastdata.js";
import * as SP from "./supplements.js";
import { initVendor, vendorChange, viewVendor } from "./vendorui.js";
import * as MI from "./machineimages.js";
import { catalogChange, initCatalog } from "./catalogui.js";
import { goalChange, initGoals, viewGoals } from "./goalsui.js";
import * as GL from "./goals.js";
import { blsBoot, blsChange, blsInput, initBls, viewBls } from "./blsui.js";
import { initOff, offBoot } from "./offui.js";
import { initOverview, minutesSince, overviewChange, shiftOverviewDay } from "./overview.js";
import { initDaySwipe } from "./dayswipe.js";
import { initLogs, logsChange, logsInput, viewLogEdit, viewRecovery, viewSleep } from "./logs.js";
import * as LG from "./logsdata.js";
import { initInsights, viewInsights } from "./insightsview.js";
import { initWeeklyReports } from "./weeklyreports.js";
import { initTodos, todoChange, todoInput, viewChecklistEdit, viewTodos } from "./todos.js";
import * as TD from "./todosdata.js";
import { healthChange, healthInput, initHealth, viewHealth, viewLabEdit } from "./health.js";
import { initLongevity } from "./longevityview.js";
import { initProtocols, protocolsChange } from "./protocolsview.js";
import * as HD from "./healthdata.js";
import { initSuper, superChange, superInput, viewHrtEdit, viewProtocolEdit, viewSubstanceEdit, viewSuper } from "./super.js";
import * as SD from "./superdata.js";
import * as CD from "./checklistdata.js";
import * as CF from "./caffeinedata.js";
import * as GLD from "./glucosedata.js";
import { icoachChange, icoachInput, initICoach, overviewCaffeine, viewICoach } from "./icoach.js";
import { initSettings, layoutChange, settingsChange, viewSettings } from "./settingsview.js";
import * as PS from "./pcsettings.js";
import * as DP from "./devprefs.js";
import { enhanceInfo, initInfoNotes } from "./infonotes.js";
import { failed as trainFailed, initTraining, persistTrain, setNotice as trainSetNotice, trainingChange, trainingInput, viewTrainingSection } from "./training.js";
import { initTrainingStats } from "./trainingstats.js";
import { initTrainingDb, saveExerciseRow } from "./trainingdb.js";
import * as TR from "./trainingdata.js";
import * as HX from "./hyrox.js";
import * as GY from "./gymsui.js";
import { initExtras, quickFillInput, quickFillUpload, viewQuickFill } from "./extras.js";
import { viewMealPlan } from "./planparity.js";
import { viewSearch, searchInput } from "./searchview.js";
import { reviewChange } from "./reviewparity.js";
import { pdfParityChange } from "./pdfparity.js";
import { watchParityChange } from "./watchparity.js";
import { app, esc, go, header, refreshCatalog, render, restEl, S, saveNow, saveSoon, setRender, toast } from "./appbase.js";
import { foldTabs, sheetRoot } from "./sheets.js";
import { measureHead, renderNav, rerenderKeepScroll } from "./navshell.js";
import { renderRest, unlockAudio, wakeLock } from "./resttimer.js";
import { applyPrefs, notify, startReminders, syncSections } from "./devsettings.js";
import { accountsCard, applyPendingRename, renameActiveAccount, viewAccountNew } from "./accounts.js";
import { loadFile } from "./catalogload.js";
import { barSlotsHtml, viewHelp, viewHome, viewPcOnly, viewPlans, viewSetup } from "./homeview.js";
import { applyDivisionWeights, findSet, findWe, pickerResults, startBackfill, startPlanDay, startWorkout, viewDetail, viewFinish, viewMachine, viewPicker, viewWorkout } from "./workoutview.js";
import { viewPending, viewSend, viewTransfer } from "./transferview.js";
import { actions, confirmTwice } from "./appactions.js";
import "./mapzoom.js";

// Maschinenbilder (1.67.0): Platzhalter <img data-mimg> nach jedem Zeichnen füllen
new MutationObserver(() => MI.hydrate(app)).observe(app, { childList: true, subtree: true });

initInfoNotes(app);

const VIEWS = {
  sleep: viewSleep,
  recovery: viewRecovery,
  "log-edit": viewLogEdit,
  insights: viewInsights,
  todos: viewTodos,
  "checklist-edit": viewChecklistEdit,
  icoach: viewICoach,
  health: viewHealth,
  "lab-edit": viewLabEdit,
  super: viewSuper,
  "hrt-edit": viewHrtEdit,
  "protocol-edit": viewProtocolEdit,
  "substance-edit": viewSubstanceEdit,
  diary: viewDiary,
  "food-history": viewNutritionHistory,
  food: viewFood,
  "food-review": viewFoodReview,
  body: viewBody,
  "body-metric": viewBodyMetric,
  "body-entry": viewBodyEntry,
  dish: viewDish,
  setup: viewSetup,
  home: viewHome,
  training: viewTrainingSection,
  settings: viewSettings,
  transfer: viewTransfer,
  "pc-only": viewPcOnly,
  plans: viewPlans,
  workout: viewWorkout,
  picker: viewPicker,
  machine: viewMachine,
  finish: viewFinish,
  send: viewSend,
  pending: viewPending,
  "account-new": viewAccountNew,
  "supp-intake": viewSuppIntake,
  "fast-entry": viewFastEntry,
  vendor: viewVendor,
  mimages: MI.viewMachineImages,
  goals: viewGoals,
  bls: viewBls,
  detail: viewDetail,
  help: viewHelp,
  quickfill: viewQuickFill,
  "meal-plan": viewMealPlan,
  search: viewSearch,
};

function renderApp() {
  if (!S.catalog && S.view !== "help" && S.view !== "account-new") S.view = "setup";
  syncSections();
  app.innerHTML = (VIEWS[S.view] || viewHome)();
  // Kleingedrucktes hinter das Info-Symbol (1.64.0) – sofort, damit nichts aufblitzt
  enhanceInfo(app);
  foldTabs();
  renderNav();
  measureHead();
  if (S.view === "picker") {
    const q = document.getElementById("q");
    q?.focus();
  }
  renderRest();
}
setRender(renderApp);

// ------------------------------------------------------------------ Eingaben

app.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act],[data-go]");
  if (!el || el.disabled) return;
  unlockAudio();
  // Eintrag im Fach gewählt: Fach schließen
  if (el.dataset.sheetKey) S.tabsOpen = { ...(S.tabsOpen ?? {}), [el.dataset.sheetKey]: false };
  if (el.dataset.go) {
    return go(el.dataset.go, el.dataset.arg ?? null);
  }
  const fn = actions[el.dataset.act];
  if (fn) fn(el);
});

// Fächer von unten liegen außerhalb von #app: Klicks dort genauso behandeln
sheetRoot.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act],[data-go]");
  if (!el || el.disabled) return;
  if (el.dataset.sheetKey) S.tabsOpen = { ...(S.tabsOpen ?? {}), [el.dataset.sheetKey]: false };
  if (el.dataset.go) return go(el.dataset.go, el.dataset.arg ?? null);
  actions[el.dataset.act]?.(el);
});

restEl.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (el) actions[el.dataset.act]?.(el);
});

app.addEventListener("input", (ev) => {
  const el = ev.target;
  if (searchInput(el)) return;
  if (foodInput(el)) return;
  if (diaryInput(el)) return;
  if (blsInput(el)) return;
  if (quickFillInput(el)) return;
  if (bodyInput(el)) return;
  if (logsInput(el)) return;
  if (todoInput(el)) return;
  if (icoachInput(el)) return;
  if (healthInput(el)) return;
  if (superInput(el)) return;
  if (GY.gymsInput(el)) return;
  if (trainingInput(el)) return;
  if (el.id === "q") {
    S.query = el.value;
    document.getElementById("results").innerHTML = pickerResults();
    return;
  }
  if (el.dataset.f) {
    const s = findSet(el.dataset.we, el.dataset.set);
    if (!s) return;
    const v = C.parseNum(el.value);
    const ok = v === null || !Number.isNaN(v);
    el.setAttribute("aria-invalid", ok ? "false" : "true");
    el.style.borderColor = ok ? "" : "var(--danger)";
    const f = el.dataset.f;
    if (f.startsWith("rp:")) {
      if (!s.rp) s.rp = C.emptyProfiles();
      s.rp[f.slice(3)] = v;
      const total = C.profileTotal(s.rp);
      if (total !== null) s.weightKg = total;
      const kg = document.getElementById(`w-${el.dataset.we}-${el.dataset.set}`);
      if (kg) {
        kg.value = C.fmtNum(s.weightKg);
        kg.readOnly = total !== null;
        kg.classList.toggle("sum", total !== null);
      }
      saveSoon();
      return;
    }
    if (f === "reps") s.reps = v === null ? null : Number.isNaN(v) ? NaN : Math.round(v);
    else if (f === "weightKg") s.weightKg = v;
    else if (f === "rpe") s.rpe = v;
    else if (f === "durationMin") s.durationSeconds = v === null ? null : Number.isNaN(v) ? NaN : Math.round(v * 60);
    else if (f === "distanceKm") s.distanceM = v === null ? null : Number.isNaN(v) ? NaN : Math.round(v * 1000);
    saveSoon();
    return;
  }
  if (el.dataset.setting) {
    const we = findWe(el.dataset.we);
    we.settings[el.dataset.setting] = el.value.trim() || null;
    saveSoon();
    return;
  }
  if (el.dataset.field === "notes") {
    const we = findWe(el.dataset.we);
    we.notes = el.value.slice(0, 500) || null;
    saveSoon();
    return;
  }
  if (el.dataset.field === "machineId") {
    // Gerät einer Cardio-Übung (1.96.0): Körperkarte nach dessen Muskelgruppen
    const we = findWe(el.dataset.we);
    we.machineId = el.value || null;
    saveSoon();
    rerenderKeepScroll();
    return;
  }
  if (el.dataset.field === "restSeconds") {
    const we = findWe(el.dataset.we);
    const v = C.parseNum(el.value);
    we.restSeconds = v === null || Number.isNaN(v) ? null : Math.min(3600, Math.max(0, Math.round(v)));
    saveSoon();
    return;
  }
  if (el.dataset.cfield && S.active?.competition) {
    const c = S.active.competition;
    const f = el.dataset.cfield;
    if (f === "location") c.location = el.value.trim() || null;
    else if (f === "finish") {
      c.finishText = el.value;
      c.finishSeconds = HX.parseFinishTime(el.value);
      el.setAttribute("aria-invalid", Number.isNaN(c.finishSeconds) ? "true" : "false");
    } else if (["rank", "field", "rankAge", "fieldAge"].includes(f)) {
      const v = C.parseNum(el.value.replace(/\./g, ""));
      c[f] = v === null ? null : Number.isNaN(v) ? NaN : v;
      el.setAttribute("aria-invalid", Number.isNaN(c[f]) ? "true" : "false");
    }
    saveSoon();
    return;
  }
  if (el.dataset.wfield) {
    const f = el.dataset.wfield;
    S.active[f] = f === "title" ? el.value : f === "durationMin" ? C.parseNum(el.value) : el.value.trim() || null;
    saveSoon();
  }
});

app.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.dataset?.qfUpload !== undefined) return void quickFillUpload(el);
  if (foodChange(el)) return;
  if (protocolsChange(el)) return;
  if (bodyChange(el)) return;
  if (diaryChange(el)) return;
  if (vendorChange(el)) return;
  if (MI.machineImageChange(el)) return;
  if (catalogChange(el)) return;
  if (goalChange(el)) return;
  if (settingsChange(el)) return;
  if (layoutChange(el)) return;
  if (blsChange(el)) return;
  if (overviewChange(el)) return;
  if (parityChange(el)) return;
  if (bodyParityChange(el)) return;
  if (goalsParityChange(el)) return;
  if (reviewChange(el)) return;
  if (pdfParityChange(el)) return;
  if (watchParityChange(el)) return;
  if (logsChange(el)) return;
  if (todoChange(el)) return;
  if (icoachChange(el)) return;
  if (healthChange(el)) return;
  if (superChange(el)) return;
  if (GY.gymsChange(el)) return;
  if (trainingChange(el)) return;
  if (el.dataset?.cfield && S.active?.competition) {
    const c = S.active.competition;
    if (el.dataset.cfield === "division") {
      c.division = el.value || null;
      applyDivisionWeights(S.active, c.division);
      saveSoon();
      return rerenderKeepScroll();
    }
    if (el.dataset.cfield === "ageGroup") {
      c.ageGroup = el.value || null;
      return saveSoon();
    }
  }
  if (el.dataset?.bar !== undefined && el.dataset?.bar !== null && el.matches?.("[data-bar]")) {
    const slots = [...barSlots(S.prefs.barSlots)];
    slots[Number(el.dataset.bar)] = el.value;
    S.prefs.barSlots = slots;
    await saveNow();
    renderNav();
    return toast("Untere Leiste angepasst");
  }
  if (el.id === "only-nr") {
    S.prefs.onlyNumbered = el.checked;
    saveSoon();
    document.getElementById("results").innerHTML = pickerResults();
  } else if (el.id === "keep-unticked") {
    S.prefs.keepUnticked = el.checked;
    saveSoon();
    rerenderKeepScroll();
  } else if (el.id === "file-in" && el.files?.[0]) {
    await loadFile(el.files[0]);
  } else if (el.dataset.wfield === "title") {
    if (!S.active.title.trim()) S.active.title = "Training";
  }
});

// Satzfelder: beim Antippen alles markieren, damit man direkt überschreiben kann
app.addEventListener("focusin", (ev) => {
  if (ev.target.dataset?.f) setTimeout(() => ev.target.select?.(), 0);
});

// Overview: Koffein-Linie „jetzt“ jede Minute nachziehen (1.69.0) – nur die Kachel, ohne neu zu zeichnen
setInterval(() => {
  if (S.view !== "home" || document.hidden) return;
  const cardEl = document.querySelector('[data-card="caffeine-status"]');
  const day = cardEl?.closest("main")?.dataset.day;
  if (!cardEl || !day || day !== todayIso()) return;
  try {
    const { body } = overviewCaffeine(day, minutesSince(day, new Date()));
    const summary = cardEl.querySelector("summary");
    cardEl.replaceChildren(...(summary ? [summary] : []));
    cardEl.insertAdjacentHTML("beforeend", body);
  } catch {
    // beim nächsten Neuzeichnen
  }
}, 60_000);

// ------------------------------------------------------------------ Start

/**
 * iPhone-Sicherheitsabstand: Manche iOS-Versionen melden env(safe-area-inset-top) = 0, obwohl die
 * App als Home-Bildschirm-App unter Statusleiste und Notch beginnt (z. B. wenn sie mit
 * durchsichtiger Statusleiste installiert wurde). Dann wird ein fester Abstand gesetzt.
 */
/**
 * Abstand der Kopfzeile zur Statusleiste (1.1.8, am iPhone des Nutzers abgestimmt): Sicherheitsabstand
 * von iOS minus 58 px (siehe app.css). Meldet iOS im Vollbild 0, gilt derselbe Abzug vom Ersatzwert
 * 46 px – also 0.
 */
function fixSafeTop() {
  const root = document.documentElement;
  root.style.removeProperty("--safe-top");
  try {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden";
    document.body.appendChild(probe);
    const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
    const fullScreen = window.innerHeight >= screen.height - 2; // Inhalt reicht bis unter die Statusleiste
    if (ios && standalone && inset < 20 && fullScreen) root.style.setProperty("--safe-top", "0px");
  } catch {
    /* Standardabstand */
  }
}

const moduleCtx = {
  get S() {
    return S;
  },
  esc,
  header,
  toast,
  store,
  uuid: () => C.uuidv7(),
  rerender: () => rerenderKeepScroll(),
  go: (view, arg) => go(view, arg),
  confirmTwice: (el, text) => confirmTwice(el, text),
  /** Trainings vom Handy als Tabellen (für die Rechnung wie am PC) */
  buildReturnTables: () =>
    C.buildReturnFile(S.catalog, S.localExercises, S.workouts.filter((w) => w.status === "done"), new Date()).tables,
};

initBody(moduleCtx);
initLongevity(moduleCtx);
initProtocols(moduleCtx);

GY.initGyms(moduleCtx);

initDiary(moduleCtx);

initVendor(moduleCtx);

MI.initMachineImages(moduleCtx);

MI.loadIds(() => rerenderKeepScroll());

initCatalog(moduleCtx);

initGoals(moduleCtx);

initSettings({
  ...moduleCtx,
  saveNow,
  accountsCard,
  applyPrefs,
  notify,
  renameActiveAccount,
  barSlotsHtml,
  version: C.MOBILE_VERSION,
});

initBls(moduleCtx);

initOff(moduleCtx);

initOverview({ ...moduleCtx, S, today: todayIso });

// Overview: Tag per Wischen wechseln (1.66.0); nie in die Zukunft
// Zeilen wischen (1.94.0, Offene Daten): links = Aktion der Zeile, rechts = ganze Rubrik mit Rückfrage
initRowSwipe({
  left: (act, arg) => actions[act]?.({ dataset: { arg, swiped: "1" }, closest: () => null }),
  right: (area) => {
    S.pendingAreaConfirm = area;
    render();
    requestAnimationFrame(() => document.querySelector(`[data-swipe-area="${area}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
});

initDaySwipe(
  {
    ov: {
      canShift: (delta) => delta < 0 || Boolean(S.ovDate && S.ovDate < todayIso()),
      shift: (delta) => shiftOverviewDay(delta),
    },
  },
  rerenderKeepScroll,
);

initLogs(moduleCtx);

initInsights(moduleCtx);

initExtras(moduleCtx);

initWeeklyReports({ ...moduleCtx, saveSoon: () => saveSoon() });

initTodos(moduleCtx);

initICoach(moduleCtx);

initHealth(moduleCtx);

initSuper(moduleCtx);

const trainingCtx = {
  get S() {
    return S;
  },
  esc,
  header,
  toast,
  store,
  C,
  uuid: () => C.uuidv7(),
  rerender: () => rerenderKeepScroll(),
  go: (view, arg) => go(view, arg),
  confirmTwice: (el, text) => confirmTwice(el, text),
  refreshCatalog: () => refreshCatalog(),
  persistTrain: () => persistTrain(),
  saveNow: () => saveNow(),
  setNotice: (tone, text) => trainSetNotice(tone, text),
  failed: (e) => trainFailed(e),
  saveExerciseRow: (row, patch) => saveExerciseRow(row, patch),
  startPlanDay: (id) => startPlanDay(id),
  startFree: () => startWorkout("Freies Training"),
  startBackfill: (date) => startBackfill(date),
  startCardio: (id) => startBackfill(todayIso(), id),
  openWorkout: (id) => go("detail", id),
};

initTraining(trainingCtx);

initTrainingStats(trainingCtx);

initTrainingDb(trainingCtx);

initFood({
  get S() {
    return S;
  },
  esc,
  header,
  toast,
  store,
  uuid: () => C.uuidv7(),
  rerender: () => rerenderKeepScroll(),
  go: (view, arg) => go(view, arg),
  confirmTwice: (el, text) => confirmTwice(el, text),
});

async function boot() {
  fixSafeTop();
  try {
    // Konten (1.25.0): aktives Konto wählt den Speicherbereich
    S.accounts = (await store.getGlobal("accounts")) || [];
    S.mainAccountName = (await store.getGlobal("mainName")) || null;
    const activeId = (await store.getGlobal("activeAccount")) || "";
    S.accountId = activeId && S.accounts.some((a) => a.id === activeId) ? activeId : "";
    store.useAccount(S.accountId);
    S.catalogRaw = await store.get("catalog");
    S.train = TR.trainState(await store.get("train"));
    S.localExercises = (await store.get("localExercises")) || [];
    S.workouts = (await store.get("workouts")) || [];
    S.active = await store.get("active");
    S.prefs = DP.normPrefs({ ...S.prefs, ...((await store.get("prefs")) || {}) });
    S.food = foodState(await store.get("nutrition"));
    S.body = bodyState(await store.get("body"));
    S.water = (await store.get("water")) || P.emptyWaterLocal();
    S.fast = FT.normFast(await store.get("fast"));
    S.supp = SP.normSupp(await store.get("supp"));
    S.goals = GL.normGoals(await store.get("goals"));
    S.parity = PR.normParity(await store.get("parity"));
    S.pcsettings = PS.normSync(await store.get("pcsettings"));
    await blsBoot();
    await offBoot();
    await GY.gymsBoot();
    S.logs = LG.logsState(await store.get("logs"));
    S.todos = TD.todosState(await store.get("todos"));
    S.checklists = CD.checklistState(await store.get("checklists"));
    S.caffeine = CF.caffeineState(await store.get("caffeine"));
    S.caffeineSettings = (await store.get("caffeineSettings")) ?? null; // 1.47.0: Einschlafzeit, Halbwertszeit
    S.weekAck = (await store.get("weekReview")) ?? null; // 1.47.0: quittierte To-dos im Wochenabschluss
    S.glucose = GLD.glucoseState(await store.get("glucose"));
    S.health = HD.healthState(await store.get("health"));
    S.super = SD.superState(await store.get("super"));
    delete S.prefs.topOffset; // Einstellung aus 1.1.7 entfällt
    refreshCatalog();
  } catch (e) {
    app.innerHTML = `<p class="boot">Der Gerätespeicher ist nicht verfügbar (${esc(e.message)}). Im privaten Modus funktioniert LIFESPAN OS Mobil nicht.</p>`;
    return;
  }
  store.persist().then(async () => {
    const ok = await navigator.storage?.persisted?.().catch(() => false);
    S.persisted = Boolean(ok);
  });
  if (S.catalog) await applyPendingRename();
  applyPrefs();
  S.view = S.catalog ? (S.active ? "workout" : "home") : "setup";
  render();
  startReminders();
  if (S.active) wakeLock(true);
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
