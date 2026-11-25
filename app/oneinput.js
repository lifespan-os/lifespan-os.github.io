// LIFESPAN OS Mobil – „Eingabe für alles“ in der Schnellerfassung (1.141.0, wie PC 1.0.196
// `QuickEntry.tsx`): eine Zeile Text statt einzelner Formulare, z. B. „82,4 kg“, „2 Glas Wasser“,
// „Espresso“, „Kaffee 250 ml“, „Protein 30“ oder der Name eines Supplement-Stacks. Erkannt wird mit
// derselben Regel wie am PC (`oneInput.parseOneInput` aus pcdomain.js); die Vorschau zeigt vor dem
// Speichern, was eingetragen wird. Alles geht wie gewohnt mit „An den PC senden“ zurück.

import * as D from "./pcdomain.js";
import * as P from "./pcdb.js";
import * as B from "./bodydata.js";
import * as CF from "./caffeinedata.js";
import * as FT from "./fastdata.js";
import * as SP from "./supplements.js";
import * as N from "./nutrition.js";
import { buildDb, nutrientCatalog, nowTime, today } from "./diary.js";

let X = null; // { S, esc, toast, store, uuid, rerender }

export function initOneInput(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);

function context(db) {
  return {
    glassMl: P.glassMl(db),
    stacks: SP.stackChoices(SP.withPhoneStacks(X.S.catalog?.pc, X.S.supp)).map((s) => ({ stackId: s.id, name: s.name })),
    nutrients: nutrientCatalog(db).nutrients.map((n) => ({ key: n.key, label: n.label, unit: n.unit })),
  };
}

function parse(text) {
  const t = String(text ?? "");
  if (!t.trim() || !X?.S?.catalog) return null;
  const db = buildDb();
  return { db, r: D.oneInput.parseOneInput(t, context(db)) };
}

/** Vorschau-Text für eine erkannte Eingabe. */
function describe(it, db) {
  if (it.kind === "weight") return `Gewicht ${F(it.kg, 1)} kg für heute`;
  if (it.kind === "water") return `+ ${it.glasses === 1 ? "1 Glas" : `${it.glasses} Gläser`} Wasser (je ${F(P.glassMl(db))} ml)`;
  if (it.kind === "caffeine") {
    const c = D.quickEntry.caffeineEntry(it.drinkId, nowTime(), it.amount);
    return c.ok ? `${c.entry.label}: ${F(c.entry.mg)} mg Koffein um ${c.entry.time} Uhr` : it.label;
  }
  if (it.kind === "fast") return `${it.label}: + ${D.formatNutrient(it.amount, it.unit)} im Fasttracking von heute`;
  return `Stack „${it.name}“ heute einnehmen`;
}

export function oneInputHtml() {
  if (!X) return "";
  const text = X?.S?.oneText ?? "";
  const p = parse(text);
  const preview = !p ? "" : p.r.ok ? `→ ${describe(p.r.intent, p.db)}` : p.r.error;
  return `<div class="one-input">
    <label for="one-q" class="one-input__label">Eingabe für alles</label>
    <div class="one-input__row">
      <input id="one-q" type="text" data-one="text" value="${esc(text)}" placeholder="z. B. 82,4 kg · 2 Glas Wasser · Espresso" autocomplete="off" enterkeyhint="done">
      <button class="btn primary" data-act="one-save" ${p?.r.ok ? "" : "disabled"}>Eintragen</button>
    </div>
    <p class="muted small one-input__preview ${p && !p.r.ok ? "is-error" : ""}" id="one-preview" aria-live="polite">${esc(preview)}</p>
  </div>`;
}

/** Tippen: Vorschau und Knopf aktualisieren, ohne das Blatt neu zu zeichnen (Fokus bleibt). */
export function oneInputInput(el) {
  if (el.dataset?.one !== "text") return false;
  X.S.oneText = el.value;
  const p = parse(el.value);
  const box = document.getElementById("one-preview");
  if (box) {
    box.textContent = !p ? "" : p.r.ok ? `→ ${describe(p.r.intent, p.db)}` : p.r.error;
    box.classList.toggle("is-error", Boolean(p && !p.r.ok));
  }
  const btn = document.querySelector('[data-act="one-save"]');
  if (btn) btn.disabled = !p?.r.ok;
  return true;
}

async function save(it, db) {
  const S = X.S;
  const t = today();
  const time = nowTime();
  const opts = { uuid: () => X.uuid(), now: new Date() };
  if (it.kind === "weight") {
    B.saveValue(S.catalog, S.body.local, { metricId: B.WEIGHT_METRIC_ID, date: t, time, value: it.kg, method: "", notes: "", editId: null }, opts);
    await X.store.set("body", S.body.local);
    return `Gewicht ${F(it.kg, 1)} kg gespeichert.`;
  }
  if (it.kind === "water") {
    const day = P.waterDay(db, t);
    P.setWaterCount(db, S.water, t, day.glasses.length + it.glasses, time, opts);
    await X.store.set("water", S.water);
    return `${it.glasses === 1 ? "1 Glas" : `${it.glasses} Gläser`} Wasser eingetragen.`;
  }
  if (it.kind === "caffeine") {
    const c = D.quickEntry.caffeineEntry(it.drinkId, time, it.amount);
    if (!c.ok) throw new Error(Object.values(c.errors).filter(Boolean).join(" ") || "Koffein ungültig.");
    CF.addIntake(S.catalog, S.caffeine, { date: t, time: c.entry.time, drinkId: c.entry.drinkId, label: c.entry.label, ml: c.entry.ml, mg: c.entry.mg }, opts);
    await X.store.set("caffeine", S.caffeine);
    return `${c.entry.label} eingetragen: ${F(c.entry.mg)} mg Koffein.`;
  }
  if (it.kind === "fast") {
    const target = { kind: "day", date: t };
    const cur = FT.currentValues(db, target);
    const values = { ...cur.values, [it.key]: Math.round(((cur.values[it.key] ?? 0) + it.amount) * 1000) / 1000 };
    S.fast = FT.normFast(S.fast);
    FT.saveFast(db, S.fast, target, values, cur.notes ?? "", { ...opts, knownKeys: new Set(nutrientCatalog(db).nutrients.map((n) => n.key)), pcIds: FT.pcFastIds(S.catalog) });
    await X.store.set("fast", S.fast);
    return `${it.label}: heute ${D.formatNutrient(values[it.key], it.unit)} im Fasttracking.`;
  }
  const stack = SP.stackChoices(SP.withPhoneStacks(S.catalog?.pc, S.supp)).find((s) => s.id === it.stackId);
  if (!stack) throw new Error("Stack nicht gefunden.");
  const draft = SP.applyStack(SP.emptyDraft(t, "independent", time), stack);
  SP.saveIntake(db, S.supp, draft, { ...opts, timingLabel: "Unabhängig", ensureMeal: (d, type) => N.ensureMeal(S.catalog, S.food.local, d, type, opts) });
  await X.store.set("supp", S.supp);
  return `${stack.name} eingetragen.`;
}

export const oneInputActions = {
  "one-save": async () => {
    const p = parse(X.S.oneText);
    if (!p) return;
    if (!p.r.ok) return X.toast(p.r.error, true);
    try {
      const msg = await save(p.r.intent, p.db);
      X.S.oneText = "";
      X.toast(msg);
    } catch (e) {
      return X.toast(e.message, true);
    }
    X.rerender();
  },
};
