// LIFESPAN OS Mobil – Exportdatei vom PC laden und übernehmen (aus app.js, 1.74.0).
import * as C from "./core.js";
import * as PR from "./paritydata.js";
import * as store from "./store.js";
import * as N from "./nutrition.js";
import * as BD from "./bodydata.js";
import * as P from "./pcdb.js";
import * as FT from "./fastdata.js";
import * as SP from "./supplements.js";
import * as GL from "./goals.js";
import * as LG from "./logsdata.js";
import * as TD from "./todosdata.js";
import * as HD from "./healthdata.js";
import * as SD from "./superdata.js";
import * as CD from "./checklistdata.js";
import * as CF from "./caffeinedata.js";
import * as GLD from "./glucosedata.js";
import * as PS from "./pcsettings.js";
import * as TR from "./trainingdata.js";
import * as GD from "./gymsdata.js";
import { fmtDateTime, go, refreshCatalog, S, saveNow, toast } from "./appbase.js";

export async function loadFile(file) {
  try {
    toast("Datei wird gelesen …");
    const text = await file.text();
    const catalog = C.parseExport(text);
    // 1.56.0: ältere Datei als der geladene Stand nicht übernehmen, gleicher Stand nur Hinweis
    const check = C.importCheck(S.catalog, catalog);
    if (check.action === "older") {
      return toast(`Diese Datei ist älter (Stand ${fmtDateTime(catalog.exportedAt)}) als die geladenen Daten (${fmtDateTime(S.catalog.exportedAt)}) – bitte die neueste „LIFESPAN-Handy-…“-Datei wählen.`, true);
    }
    if (check.action === "same") {
      toast(`Diese Datei ist schon geladen (Stand ${fmtDateTime(catalog.exportedAt)}). Eine neuere legt der PC ab, solange LIFESPAN OS läuft.`);
      return go("home");
    }
    await applyCatalog(catalog);
    toast(
      `Geladen: Stand ${fmtDateTime(catalog.exportedAt)} · ${catalog.machines.length.toLocaleString("de-DE")} Maschinen, ${catalog.plans.length} Pläne, ${catalog.nutrition.foods.length.toLocaleString("de-DE")} Lebensmittel${
        check.stale ? ". Hinweis: Der Stand ist älter als 3 Stunden – gibt es eine neuere Handy-Datei?" : ""
      }`,
    );
    go("home");
  } catch (e) {
    toast(e.message || "Die Datei konnte nicht gelesen werden.", true);
  }
}

/** Neue Grunddaten übernehmen (PC-Export oder Startpaket eines Kontos am Handy). */
export async function applyCatalog(catalog) {
  {
    S.localExercises = C.keepLocalExercises(catalog, S.localExercises, [...S.workouts, ...(S.active ? [S.active] : [])]);
    S.catalogRaw = catalog;
    await store.set("catalog", catalog);
    S.train = TR.pruneTrain(catalog, S.train);
    await store.set("train", S.train);
    S.gyms = GD.pruneGyms(catalog, S.gyms);
    await store.set("gyms", S.gyms);
    refreshCatalog();
    N.pruneLocal(catalog, S.food.local);
    await store.set("nutrition", S.food.local);
    BD.pruneBody(catalog, S.body.local);
    await store.set("body", S.body.local);
    S.water = P.pruneWater(catalog, S.water);
    await store.set("water", S.water);
    S.fast = FT.pruneFast(catalog, S.fast);
    await store.set("fast", S.fast);
    S.supp = SP.pruneSupp(catalog, S.supp);
    await store.set("supp", S.supp);
    S.goals = GL.pruneGoals(catalog, S.goals);
    await store.set("goals", S.goals);
    S.parity = PR.pruneParity(catalog, S.parity);
    await store.set("parity", S.parity);
    refreshCatalog();
    S.pcsettings = PS.pruneSync(catalog, S.pcsettings);
    await store.set("pcsettings", S.pcsettings);
    S.logs = LG.pruneLogs(catalog, S.logs);
    await store.set("logs", S.logs);
    S.todos = TD.pruneTodos(catalog, S.todos);
    await store.set("todos", S.todos);
    S.checklists = CD.pruneChecklists(catalog, S.checklists);
    await store.set("checklists", S.checklists);
    S.caffeine = CF.pruneCaffeine(catalog, S.caffeine);
    await store.set("caffeine", S.caffeine);
    S.glucose = GLD.pruneGlucose(catalog, S.glucose);
    await store.set("glucose", S.glucose);
    S.health = HD.pruneHealth(catalog, S.health);
    await store.set("health", S.health);
    S.super = SD.pruneSuper(catalog, S.super);
    await store.set("super", S.super);
    await saveNow();
  }
}
