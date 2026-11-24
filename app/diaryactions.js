// LIFESPAN OS Mobil – Nutrition → Tagebuch: Aktionen, Eingaben und Auswahlfelder (aus diary.js, 1.75.0).
import * as P from "./pcdb.js";
import * as D from "./pcdomain.js";
import * as N from "./nutrition.js";
import * as SP from "./supplements.js";
import * as QM from "./quickmeal.js";
import { backToNowIfFromTimeline, buildDb, itemsOf, nowTime, pad, quickAdd, today, X } from "./diary.js";
import { buildDbCached, FAST_DAY, fastTargets, loadFast, persistSupp, readSuppForm, saveFastForm, suppHits } from "./diarysupp.js";

// ------------------------------------------------------------------ Ereignisse

export async function persistWater() {
  try {
    await X.store.set("water", X.S.water);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

export const shift = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const diaryActions = {
  // Ballaststoffe, Zucker, Salz: Details auf- und zuklappen (1.114.0)
  "extras-toggle": () => {
    X.S.extrasOpen = !X.S.extrasOpen;
    X.rerender();
  },
  "qm-repeat": (el) => {
    const [key, kind] = el.dataset.arg.split("|");
    const db = buildDb();
    const foods = N.allFoods(X.S.catalog, X.S.food.local);
    const c = QM.Q.repeatChoices(QM.pastMeals(db), X.S.diaryDate ?? today(), key).find((x) => x.kind === kind);
    const items = c ? QM.onlyKnown(c.items, foods) : [];
    if (!items.length) return X.toast("Nichts zum Übernehmen gefunden.", true);
    return quickAdd(key, items, `${c.label} (${items.length} Lebensmittel)`);
  },
  "qm-suggest": (el) => {
    const [key, i] = el.dataset.arg.split("|");
    const db = buildDb();
    const foods = N.allFoods(X.S.catalog, X.S.food.local);
    const x = QM.Q.mealSuggestions(QM.pastMeals(db), key, X.S.diaryDate ?? today(), { limit: 5 })[Number(i)];
    const items = x ? QM.onlyKnown(x.items, foods) : [];
    if (!items.length) return X.toast("Vorschlag nicht mehr vorhanden.", true);
    return quickAdd(key, items, QM.itemsName(items, foods));
  },
  "qm-plan": async (el) => {
    const db = buildDb();
    const date = X.S.diaryDate ?? today();
    const e = (db.pc.meal_plan_entry ?? []).find((x) => x.id === el.dataset.arg);
    const r = e ? (db.pc.recipe ?? []).find((x) => x.id === e.recipe_id) : null;
    if (!e || !r) return X.toast("Planeintrag nicht gefunden.", true);
    const foods = N.allFoods(X.S.catalog, X.S.food.local);
    const recipeItems = (db.pc.recipe_item ?? []).filter((i) => i.recipe_id === r.id).map((i) => ({ foodId: i.food_id, amount: i.amount }));
    const items = QM.onlyKnown(QM.Q.planItems({ servings: r.servings, items: recipeItems }, e.servings), foods);
    if (!items.length) return X.toast("Zu diesem Rezept fehlen die Lebensmittel – bitte am PC neu exportieren.", true);
    const choices = fastTargets(db, date).map((t) => ({ key: t.key, label: t.title }));
    const key = QM.Q.planSlotKey(e.slot, choices);
    const res = await quickAdd(key, items, r.name);
    // Supplemente des Gerichts als Einnahme zur Mahlzeit (1.125.0, wie PC 1.0.200)
    const sups = (db.pc.recipe_supplement ?? []).filter((i) => i.recipe_id === r.id);
    if (!res?.mealId || !sups.length) return;
    const factor = r.servings > 0 ? e.servings / r.servings : e.servings;
    const opts = { uuid: X.uuid, now: new Date() };
    try {
      const draft = { ...SP.emptyDraft(date, `meal:${res.mealId}`, ""), items: sups.map((i) => ({ id: null, supplementId: i.supplement_id, amount: Math.round(i.amount * factor * 1000) / 1000 })) };
      SP.saveIntake(buildDb(), X.S.supp, draft, { ...opts, timingLabel: N.mealLabel(key), ensureMeal: (d, t) => N.ensureMeal(X.S.catalog, X.S.food.local, d, t, opts) });
      await persistSupp();
      X.rerender();
    } catch (err) {
      X.toast(err.message, true);
    }
  },
  "fast-open": (el) => {
    const date = el.dataset.date || X.S.diaryDate || today();
    X.S.fastEdit = { date, target: el.dataset.arg ?? FAST_DAY, values: {}, notes: "", exists: false, errors: {}, error: null };
    loadFast(X.S.fastEdit);
    X.go("fast-entry");
  },
  "fast-save": () => saveFastForm(false),
  "fast-clear": (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: alle Werte entfernen")) return;
    return saveFastForm(true);
  },
  "fast-cancel": () => {
    X.S.fastEdit = null;
    X.go("diary");
  },
  "supp-new": () => {
    const db = buildDb();
    const date = X.S.diaryDate ?? today();
    const slots = D.daySlots(P.mealDay(db, date));
    const now = new Date();
    const isToday = date === today();
    const timing = SP.suggestTiming(slots, isToday ? now.getHours() : 8);
    const time = SP.mealTimeForTiming(timing, slots) ?? (isToday ? nowTime() : "");
    X.S.suppEdit = { draft: SP.emptyDraft(date, timing, time), query: "", error: null };
    X.go("supp-intake");
  },
  "supp-edit": (el) => {
    const db = buildDb();
    const date = X.S.diaryDate ?? today();
    const i = P.intakesOn(db, date).find((x) => x.id === el.dataset.arg);
    if (!i) return X.toast("Eintrag nicht gefunden.", true);
    X.S.suppEdit = { draft: SP.draftFromIntake(i), query: "", error: null };
    X.go("supp-intake");
  },
  "supp-add": (el) => {
    readSuppForm();
    const st = X.S.suppEdit;
    const s = buildDb().supplements.get(el.dataset.arg);
    if (!st || !s) return;
    if (!st.draft.items.some((i) => i.supplementId === s.id)) st.draft.items.push({ id: null, supplementId: s.id, amount: SP.fmtAmount(SP.startAmount(s)) });
    st.query = "";
    st.error = null;
    X.rerender();
    requestAnimationFrame(() => document.getElementById("supp-q")?.focus());
  },
  "supp-item-del": (el) => {
    readSuppForm();
    const st = X.S.suppEdit;
    if (!st) return;
    st.draft.items.splice(Number(el.dataset.arg), 1);
    X.rerender();
  },
  "supp-save": async () => {
    readSuppForm();
    const st = X.S.suppEdit;
    if (!st) return;
    const db = buildDb();
    const d = st.draft;
    const slots = D.daySlots(P.mealDay(db, d.date));
    const label = SP.timingOptions(slots).find((o) => o.value === d.timing)?.label;
    // Ohne eigene Uhrzeit gilt die Uhrzeit der Mahlzeit (wie am PC)
    if (!String(d.time ?? "").trim()) d.time = SP.mealTimeForTiming(d.timing, slots) ?? "";
    const opts = { uuid: X.uuid, now: new Date() };
    try {
      SP.saveIntake(db, X.S.supp, d, {
        ...opts,
        timingLabel: label,
        ensureMeal: (date, type) => N.ensureMeal(X.S.catalog, X.S.food.local, date, type, opts),
      });
    } catch (e) {
      st.error = e.message;
      X.rerender();
      return;
    }
    await persistSupp();
    X.S.suppEdit = null;
    X.S.diaryDate = d.date;
    X.toast(d.stackId ? `Supplements „${d.name}“ gespeichert.` : `Supplements (${label ?? "Einnahme"}) gespeichert.`);
    X.go("diary");
    backToNowIfFromTimeline();
  },
  "supp-delete": async (el) => {
    const st = X.S.suppEdit;
    if (!st?.draft.id) return;
    if (!X.confirmTwice(el, "Nochmal tippen: vom Tag entfernen")) return;
    SP.deleteIntake(buildDb(), X.S.supp, st.draft.id);
    await persistSupp();
    X.S.suppEdit = null;
    X.toast("Supplements entfernt.");
    X.go("diary");
  },
  "meal-act-open": (el) => {
    const [pk, kind] = el.dataset.arg.split("|");
    const ids = X.S.mealPick?.[pk] ?? [];
    const { slot } = itemsOf(pk, null);
    const day = X.S.diaryDate ?? today();
    const type = N.MEAL_TYPES.some((t) => t.value === slot?.ref.mealType) ? slot.ref.mealType : "snack";
    X.S.mealAct = {
      pk,
      kind,
      // „Eintragen zu Datum“ nimmt die Auswahl, sonst die ganze Mahlzeit
      ids: kind === "date" && !ids.length ? null : [...ids],
      date: kind === "copy" ? day : day === today() ? shift(day, 1) : today(),
      mealType: type,
      name: "",
      error: null,
    };
    X.rerender();
    requestAnimationFrame(() => document.getElementById(kind === "dish" ? "meal-act-name" : "meal-act-date")?.focus());
  },
  "meal-act-cancel": () => {
    X.S.mealAct = null;
    X.rerender();
  },
  "meal-pick-clear": (el) => {
    X.S.mealPick = { ...(X.S.mealPick ?? {}), [el.dataset.arg]: [] };
    X.rerender();
  },
  "meal-act-save": async () => {
    const a = X.S.mealAct;
    if (!a) return;
    // Eingaben direkt lesen (der letzte Wert kommt sonst erst mit dem Verlassen des Feldes)
    a.name = document.getElementById("meal-act-name")?.value ?? a.name;
    a.date = document.getElementById("meal-act-date")?.value ?? a.date;
    a.mealType = document.getElementById("meal-act-meal")?.value ?? a.mealType;
    const { items } = itemsOf(a.pk, a.ids);
    const list = items.map((i) => ({ foodId: i.foodId, amount: i.amount }));
    const opts = { uuid: X.uuid, now: new Date() };
    let message;
    try {
      if (a.kind === "dish") {
        const row = N.saveItemsAsDish(X.S.catalog, X.S.food.local, a.name, list, opts);
        message = `Gericht „${row.name}“ gespeichert (${list.length} Lebensmittel).`;
      } else {
        N.copyItemsTo(X.S.catalog, X.S.food.local, { date: a.date, mealType: a.mealType, items: list }, opts);
        message = `${list.length} ${list.length === 1 ? "Lebensmittel" : "Lebensmittel"} in „${D.mealTypeLabel(a.mealType)}“ am ${D.formatDate(a.date)} eingetragen.`;
      }
    } catch (e) {
      a.error = e.message;
      X.rerender();
      return;
    }
    try {
      await X.store.set("nutrition", X.S.food.local);
    } catch (e) {
      X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
    }
    X.S.mealAct = null;
    X.S.mealPick = { ...(X.S.mealPick ?? {}), [a.pk]: [] };
    X.toast(message);
    X.rerender();
  },
  "meal-toggle": (el) => {
    const [key, open] = el.dataset.arg.split("|");
    X.S.mealOpen = { ...(X.S.mealOpen ?? {}), [key]: open === "1" };
    X.rerender();
  },
  "diary-shift": (el) => {
    const next = shift(X.S.diaryDate ?? today(), Number(el.dataset.arg));
    X.S.diaryDate = next > today() ? today() : next;
    X.rerender();
  },
  "water-glass": async (el) => {
    const date = X.S.diaryDate ?? today();
    const db = buildDb();
    const day = P.waterDay(db, date);
    const count = D.countAfterClick(Number(el.dataset.arg), day.glasses.length);
    try {
      P.setWaterCount(db, X.S.water, date, count, date === today() ? nowTime() : null, { uuid: X.uuid, now: new Date() });
    } catch (e) {
      return X.toast(e.message, true);
    }
    await persistWater();
    X.rerender();
  },
  "diary-add": (el) => {
    const f = X.S.food;
    f.mealType = el.dataset.arg;
    f.trackDate = X.S.diaryDate ?? today();
    f.returnTo = "diary";
    X.go("food");
  },
  "diary-remove": async (el) => {
    // Sofort entfernen, danach „Rückgängig“ (1.55.0, statt zweimal tippen)
    const [mealId, itemId] = el.dataset.arg.split("|");
    const local = X.S.food.local;
    const meal = local.meals[mealId];
    const item = meal?.items.find((i) => i.id === itemId);
    if (!meal || !item) return;
    const snapshot = { row: { ...meal.row }, items: meal.items.map((i) => ({ ...i })), fromPc: meal.fromPc, sent: meal.sent };
    N.removeItem(local, mealId, itemId);
    try {
      await X.store.set("nutrition", local);
    } catch (e) {
      X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
    }
    X.rerender();
    const name = N.allFoods(X.S.catalog, local).get(item.food_id)?.name ?? "Eintrag";
    X.toast(`„${name}“ entfernt.`, false, async () => {
      X.S.food.local.meals[mealId] = snapshot;
      await X.store.set("nutrition", X.S.food.local);
      X.rerender();
    });
  },
};

/** Eingaben während des Tippens (Supplement-Suche); true = behandelt. */
export function diaryInput(el) {
  if (el.dataset?.diary !== "supp-q") return false;
  const st = X.S.suppEdit;
  if (!st) return true;
  st.query = el.value;
  const db = buildDbCached();
  const list = document.getElementById("supp-hits");
  if (list) list.innerHTML = suppHits(SP.searchSupplements(db, st.query, 25), new Set(st.draft.items.map((i) => i.supplementId)));
  return true;
}

/** Änderungen an Auswahlfeldern; true = behandelt. */
export function diaryChange(el) {
  const k = el.dataset?.diary;
  if (!k) return false;
  if (k === "fast-target") {
    const st = X.S.fastEdit;
    if (st) {
      st.target = el.value;
      loadFast(st);
      X.rerender();
    }
    return true;
  }
  if (k === "supp-stack") {
    readSuppForm();
    const st = X.S.suppEdit;
    const stack = SP.stackChoices(X.S.catalog?.pc).find((s) => s.id === el.value);
    if (st && stack) {
      st.draft = SP.applyStack(st.draft, stack);
      X.rerender();
    }
    return true;
  }
  if (k === "supp-timing") {
    readSuppForm();
    // Zu einer Mahlzeit: deren Uhrzeit übernehmen (1.96.0)
    const st = X.S.suppEdit;
    if (st) {
      const slots = D.daySlots(P.mealDay(buildDb(), st.draft.date));
      const t = SP.mealTimeForTiming(st.draft.timing, slots);
      if (t) st.draft.time = t;
    }
    X.rerender();
    return true;
  }
  if (k.startsWith("supp-")) {
    readSuppForm();
    return true;
  }
  if (k === "pick" || k === "pickall") {
    const [pk, id] = el.dataset.arg.split("|");
    const cur = new Set(X.S.mealPick?.[pk] ?? []);
    if (k === "pickall") {
      cur.clear();
      if (el.checked) for (const i of itemsOf(pk, null).items) cur.add(i.id);
    } else if (el.checked) cur.add(id);
    else cur.delete(id);
    X.S.mealPick = { ...(X.S.mealPick ?? {}), [pk]: [...cur] };
    if (X.S.mealAct?.pk === pk && X.S.mealAct.kind !== "date") X.S.mealAct.ids = [...cur];
    X.rerender();
    return true;
  }
  if (k === "act-name" || k === "act-date" || k === "act-meal") {
    // Nur merken, nicht neu zeichnen – sonst ginge ein Tipp auf „Eintragen“ verloren
    const a = X.S.mealAct;
    if (a) a[k === "act-name" ? "name" : k === "act-date" ? "date" : "mealType"] = el.value;
    return true;
  }
  if (k === "date") {
    const v = el.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) X.S.diaryDate = v > today() ? today() : v;
    X.rerender();
    return true;
  }
  if (k === "glass") {
    try {
      P.setGlassMl(X.S.water, Number(el.value));
    } catch (e) {
      X.toast(e.message, true);
      return true;
    }
    persistWater().then(() => X.rerender());
    return true;
  }
  if (k === "days") {
    X.S.historyDays = Number(el.value);
    X.rerender();
    return true;
  }
  return false;
}
