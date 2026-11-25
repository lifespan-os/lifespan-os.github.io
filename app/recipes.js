// LIFESPAN OS Mobil – Nutrition → Gerichte & Planen → Vorlagen & Rezepte wie am PC (1.147.0,
// `RecipesTab.tsx`, Regeln wie `repo/recipe.rs`). Reine Logik ohne Oberfläche.
//
// Ablage am Handy (`S.food.local`, Speicher „nutrition“):
// - `recipes` id → { row, items, supplements, removed, sent } – am Handy angelegt oder geändert
//   (auch Gerichte vom PC: dann mit derselben ID; `removed` = "tabelle:id" → Zeitpunkt für
//   entfernte Zutaten/Supplemente, gehen als Löschvermerk an den PC)
// - `recipesDeleted` id → { at, sent } – am Handy gelöschte Gerichte (Löschvermerk an den PC)
// Gesendet wird mit „An den PC senden“ (nutritionTables in nutrition.js).

export const KIND_MEAL = "meal";
export const KIND_RECIPE = "recipe";

export const KIND_OPTIONS = [
  { value: KIND_MEAL, label: "Gespeicherte Mahlzeit (1 Portion)" },
  { value: KIND_RECIPE, label: "Rezept (mehrere Portionen)" },
];

const norm = (s) =>
  String(s ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Zahl aus Formulartext („1,5“) – null bei leer, NaN bei ungültig. */
export function parseNum(text) {
  const s = String(text ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const toText = (v, d = 3) => (v === null || v === undefined ? "" : String(round(v, d)).replace(".", ","));

let keySeq = 0;
const newKey = () => `k${Date.now().toString(36)}${(++keySeq).toString(36)}`;

// ------------------------------------------------------------------ Zusammenführen (für makeDb)

/** Am Handy geänderte Gerichte und Löschvermerke in der Form für `makeDb` (pcdb.js). */
export function phoneRecipes(local) {
  const recipes = Object.values(local?.recipes ?? {});
  return {
    rows: recipes.map((r) => r.row),
    items: recipes.flatMap((r) => r.items ?? []),
    supplements: recipes.flatMap((r) => r.supplements ?? []),
    /** Gerichte, deren Zutaten das Handy vollständig kennt (ersetzen die vom PC) */
    owned: recipes.map((r) => r.row.id),
    deleted: Object.keys(local?.recipesDeleted ?? {}),
  };
}

// ------------------------------------------------------------------ Liste (wie recipe::list)

/**
 * Gerichte als Modell wie `Recipe` am PC: Summen aus den Zutaten (je 100 g/ml), Supplemente mit
 * Name und Einheit. `db` = makeDb-Ergebnis (db.pc mit den Änderungen vom Handy), `foods` = Map id →
 * Lebensmittelzeile, `supplements` = Map id → Supplementzeile, `local` = Ablage (Status „am Handy“).
 */
export function recipeModels(db, foods, supplements = new Map(), local = null) {
  const pc = db?.pc ?? {};
  const itemsBy = new Map();
  for (const it of pc.recipe_item ?? []) itemsBy.set(it.recipe_id, [...(itemsBy.get(it.recipe_id) ?? []), it]);
  const supsBy = new Map();
  for (const it of pc.recipe_supplement ?? []) supsBy.set(it.recipe_id, [...(supsBy.get(it.recipe_id) ?? []), it]);
  return (pc.recipe ?? []).map((r) => {
    const items = (itemsBy.get(r.id) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((it) => {
        const f = foods.get(it.food_id);
        const per = (col) => (f && f[col] !== null && f[col] !== undefined ? (it.amount / 100) * f[col] : null);
        return {
          id: it.id,
          foodId: it.food_id,
          foodName: f?.name ?? "Unbekanntes Lebensmittel",
          foodBrand: f?.brand ? f.brand : null,
          basisUnit: f?.basis_unit ?? "g",
          amount: it.amount,
          known: Boolean(f),
          energyKcal: per("energy_kcal") ?? 0,
          proteinG: per("protein_g") ?? 0,
          carbsG: per("carbs_g") ?? 0,
          fatG: per("fat_g") ?? 0,
          fiberG: per("fiber_g"),
        };
      });
    const sups = (supsBy.get(r.id) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((it) => {
        const s = supplements.get(it.supplement_id);
        return { id: it.id, supplementId: it.supplement_id, name: s?.name ?? "Unbekanntes Supplement", unit: s?.unit ?? "", amount: it.amount };
      });
    const sum = (k) => items.reduce((n, i) => n + (i[k] ?? 0), 0);
    const fibers = items.map((i) => i.fiberG).filter((v) => v !== null);
    const l = local?.recipes?.[r.id];
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      servings: Number(r.servings) || 1,
      notes: r.notes ?? null,
      archived: Boolean(r.archived),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      items,
      supplements: sups,
      energyKcal: sum("energyKcal"),
      proteinG: sum("proteinG"),
      carbsG: sum("carbsG"),
      fatG: sum("fatG"),
      // Ballaststoffe: nur aus Zutaten mit Angabe, mit Anzahl (wie `sumOptional` am PC)
      fiber: { value: fibers.reduce((n, v) => n + v, 0), known: fibers.length, total: items.length },
      onPhone: Boolean(l && !l.sent),
    };
  });
}

/** Liste wie am PC: alphabetisch, archivierte nur auf Wunsch und am Ende. */
export function sortedRecipes(models, { archived = false } = {}) {
  return models
    .filter((r) => archived || !r.archived)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
}

/** Werte je Portion (wie `perServing`). */
export function perServing(r, servings = r.servings) {
  const n = servings > 0 ? servings : 1;
  return { energyKcal: r.energyKcal / n, proteinG: r.proteinG / n, carbsG: r.carbsG / n, fatG: r.fatG / n };
}

// ------------------------------------------------------------------ Entwurf

export function emptyDraft(kind = KIND_MEAL) {
  return { id: null, name: "", kind, servings: kind === KIND_MEAL ? "1" : "2", archived: false, notes: "", items: [], supplements: [] };
}

export function draftFromModel(r) {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    servings: toText(r.servings, 1),
    archived: r.archived,
    notes: r.notes ?? "",
    items: r.items.map((i) => ({ key: newKey(), id: i.id, foodId: i.foodId, amount: toText(i.amount, 1), unit: "base" })),
    supplements: r.supplements.map((x) => ({ key: newKey(), id: x.id, supplementId: x.supplementId, amount: toText(x.amount, 3) })),
  };
}

export function draftItem(foodId, amountText = "") {
  return { key: newKey(), id: null, foodId, amount: amountText, unit: "base" };
}

export function draftSupplement(supplementId, amountText = "1") {
  return { key: newKey(), id: null, supplementId, amount: amountText };
}

/** Art wechseln wie am PC: Vorlage = 1 Portion, Rezept startet mit 2. */
export function setKind(draft, kind) {
  const servings = kind === KIND_MEAL ? "1" : draft.servings === "1" ? "2" : draft.servings;
  return { ...draft, kind, servings };
}

/** Menge einer Zutat in g/ml aus Text und Einheit („base“ oder „portion“). */
export function itemAmount(food, text, unit = "base") {
  const v = parseNum(text);
  if (v === null || Number.isNaN(v)) return v;
  if (unit === "portion" && food?.portion_amount) return v * food.portion_amount;
  return v;
}

/** Summe des Entwurfs (Vorschau im Formular). */
export function draftTotal(draft, foods) {
  const t = { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const it of draft.items) {
    const f = foods.get(it.foodId);
    const a = itemAmount(f, it.amount, it.unit);
    if (!f || !(a > 0)) continue;
    t.energyKcal += (a / 100) * (f.energy_kcal ?? 0);
    t.proteinG += (a / 100) * (f.protein_g ?? 0);
    t.carbsG += (a / 100) * (f.carbs_g ?? 0);
    t.fatG += (a / 100) * (f.fat_g ?? 0);
  }
  return t;
}

// ------------------------------------------------------------------ Prüfen und speichern (recipe::save)

/**
 * Entwurf prüfen wie `recipe::save` am PC. `names` = Liste { id, name, kind } aller Gerichte.
 * Rückgabe { ok: true, value } oder { ok: false, errors } (Schlüssel wie am PC: name, servings,
 * items, items.0.amount, supplements.0.amount …).
 */
export function checkDraft(draft, { foods, supplements = new Map(), names = [] }) {
  const errors = {};
  const name = String(draft.name ?? "").trim();
  if (!name) errors.name = "Bitte einen Namen eingeben.";
  else if (name.length > 80) errors.name = "Der Name darf höchstens 80 Zeichen haben.";
  const kind = draft.kind === KIND_RECIPE ? KIND_RECIPE : draft.kind === KIND_MEAL ? KIND_MEAL : null;
  if (!kind) errors.kind = "Bitte Vorlage oder Rezept wählen.";
  let servings = 1;
  if (kind === KIND_RECIPE) {
    const v = parseNum(draft.servings);
    if (v === null) errors.servings = "Bitte die Anzahl der Portionen angeben.";
    else if (Number.isNaN(v)) errors.servings = "Bitte eine Zahl eingeben, z. B. 4.";
    else if (v < 0.5 || v > 100) errors.servings = "Die Anzahl der Portionen muss zwischen 0,5 und 100 liegen.";
    else servings = round(v, 1);
  }
  const notes = String(draft.notes ?? "").trim();
  if (notes.length > 2000) errors.notes = "Höchstens 2000 Zeichen.";
  if (!draft.items.length && !draft.supplements.length) errors.items = "Bitte mindestens ein Lebensmittel hinzufügen.";
  if (draft.items.length > 60) errors.items = "Höchstens 60 Zutaten.";
  if (draft.supplements.length > 30) errors.supplements = "Höchstens 30 Supplemente.";
  const items = draft.items.map((it, i) => {
    const f = foods.get(it.foodId);
    if (!f) {
      errors[`items.${i}.foodId`] = "Bitte ein Lebensmittel wählen.";
      return null;
    }
    const a = itemAmount(f, it.amount, it.unit);
    if (a === null) errors[`items.${i}.amount`] = "Bitte eine Menge eingeben.";
    else if (Number.isNaN(a)) errors[`items.${i}.amount`] = "Bitte eine Zahl eingeben, z. B. 50.";
    else if (a < 0.1 || a > 20000) errors[`items.${i}.amount`] = "Die Menge muss zwischen 0,1 und 20.000 liegen.";
    else return { id: it.id ?? null, foodId: it.foodId, amount: round(a, 1) };
    return null;
  });
  const sups = draft.supplements.map((x, i) => {
    if (!supplements.get(x.supplementId)) {
      errors[`supplements.${i}.supplementId`] = "Bitte ein Supplement wählen.";
      return null;
    }
    const a = parseNum(x.amount);
    if (a === null) errors[`supplements.${i}.amount`] = "Bitte eine Menge eingeben.";
    else if (Number.isNaN(a)) errors[`supplements.${i}.amount`] = "Bitte eine Zahl eingeben, z. B. 1.";
    else if (a < 0.001 || a > 100000) errors[`supplements.${i}.amount`] = "Die Menge muss zwischen 0,001 und 100.000 liegen.";
    else return { id: x.id ?? null, supplementId: x.supplementId, amount: round(a, 3) };
    return null;
  });
  if (name && !errors.name) {
    const other = names.find((r) => r.id !== draft.id && norm(r.name) === norm(name));
    if (other) errors.name = `Es gibt bereits ${other.kind === KIND_MEAL ? "eine Vorlage" : "ein Rezept"} mit dem Namen „${name}“.`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { id: draft.id ?? null, name, kind, servings, notes: notes || null, archived: Boolean(draft.archived), items, supplements: sups } };
}

/**
 * Geprüftes Gericht am Handy speichern (neu oder geändert, auch vom PC). Vorhandene Zutaten und
 * Supplemente behalten ihre ID; entfernte bekommen einen Löschvermerk. `current` = bisheriges
 * Modell (recipeModels) oder null. Rückgabe: die Zeile des Gerichts.
 */
export function saveRecipe(local, value, current, { uuid, now = new Date(), onPc = false }) {
  if (!local.recipes) local.recipes = {};
  const iso = now.toISOString();
  const id = value.id ?? uuid();
  const prev = local.recipes[id];
  const row = {
    id,
    name: value.name,
    kind: value.kind,
    servings: value.servings,
    notes: value.notes,
    archived: value.archived ? 1 : 0,
    created_at: current?.createdAt ?? prev?.row.created_at ?? iso,
    updated_at: iso,
  };
  const oldItems = new Map((current?.items ?? []).map((i) => [i.id, i]));
  const oldSups = new Map((current?.supplements ?? []).map((i) => [i.id, i]));
  const items = value.items.map((it, position) => ({
    id: it.id && oldItems.has(it.id) ? it.id : uuid(),
    recipe_id: id,
    food_id: it.foodId,
    amount: it.amount,
    position,
    created_at: iso,
    updated_at: iso,
  }));
  const supplements = value.supplements.map((it, position) => ({
    id: it.id && oldSups.has(it.id) ? it.id : uuid(),
    recipe_id: id,
    supplement_id: it.supplementId,
    amount: it.amount,
    position,
    created_at: iso,
    updated_at: iso,
  }));
  // Löschvermerke nur, wenn der PC die Zeilen kennen kann (Gericht vom PC oder schon gesendet)
  const everSent = Boolean(prev?.sent || prev?.everSent);
  const known = onPc || everSent;
  const removed = { ...(prev?.removed ?? {}) };
  const keepItems = new Set(items.map((i) => i.id));
  const keepSups = new Set(supplements.map((i) => i.id));
  if (known) {
    for (const oldId of oldItems.keys()) if (!keepItems.has(oldId)) removed[`recipe_item:${oldId}`] = iso;
    for (const oldId of oldSups.keys()) if (!keepSups.has(oldId)) removed[`recipe_supplement:${oldId}`] = iso;
  }
  local.recipes[id] = { row, items, supplements, removed, everSent, sent: false };
  if (local.recipesDeleted?.[id]) delete local.recipesDeleted[id];
  return row;
}

/** Nur archivieren bzw. zurückholen (Knopf in der Liste). */
export function setArchived(local, current, archived, opts) {
  // opts: { uuid, now, onPc }
  const value = {
    id: current.id,
    name: current.name,
    kind: current.kind,
    servings: current.servings,
    notes: current.notes,
    archived,
    items: current.items.map((i) => ({ id: i.id, foodId: i.foodId, amount: i.amount })),
    supplements: current.supplements.map((x) => ({ id: x.id, supplementId: x.supplementId, amount: x.amount })),
  };
  return saveRecipe(local, value, current, opts);
}

/**
 * Gericht löschen wie `recipe::delete`: Eingetragene Mahlzeiten bleiben. Nur am Handy angelegt und
 * noch nicht gesendet → einfach weg; sonst Löschvermerk (`onPc` = der PC kennt das Gericht).
 */
export function deleteRecipe(local, id, { onPc, now = new Date() }) {
  const l = local.recipes?.[id];
  const wasSent = Boolean(l?.sent || l?.everSent);
  if (local.recipes) delete local.recipes[id];
  if (onPc || wasSent) {
    if (!local.recipesDeleted) local.recipesDeleted = {};
    local.recipesDeleted[id] = { at: now.toISOString(), sent: false };
  }
}

// ------------------------------------------------------------------ Eintragen

/**
 * Zutaten für `count` Portionen (anteilig wie `scaleRecipeItems`) und Supplemente mit demselben
 * Faktor. Rückgabe { items: [{ foodId, amount }], supplements: [{ supplementId, amount }] }.
 */
export function portionItems(r, countText) {
  const count = parseNum(countText);
  if (count === null || Number.isNaN(count) || !(count > 0)) throw new Error("Bitte eine Portionenzahl größer als 0 eingeben.");
  if (count > 100) throw new Error("Höchstens 100 Portionen.");
  const factor = count / (r.servings > 0 ? r.servings : 1);
  const items = r.items.filter((i) => i.known).map((i) => ({ foodId: i.foodId, amount: round(i.amount * factor, 1) })).filter((i) => i.amount > 0);
  const supplements = r.supplements.map((x) => ({ supplementId: x.supplementId, amount: round(x.amount * factor, 3) })).filter((x) => x.amount > 0);
  if (!items.length && !supplements.length) throw new Error("Zu diesem Gericht fehlen die Lebensmittel – bitte neue Daten vom PC laden.");
  return { count, items, supplements };
}

// ------------------------------------------------------------------ An den PC

/** Noch nicht gesendete Änderungen an Gerichten (Gerichte + Löschungen). */
export function unsentRecipes(local) {
  return Object.values(local?.recipes ?? {}).filter((r) => !r.sent).length + Object.values(local?.recipesDeleted ?? {}).filter((d) => !d.sent).length;
}

/** Löschvermerke für die Rückgabedatei. */
export function recipeDeletions(local, { all = false } = {}) {
  const out = [];
  for (const r of Object.values(local?.recipes ?? {})) {
    if (!all && r.sent) continue;
    for (const [key, at] of Object.entries(r.removed ?? {})) {
      const [table, recordId] = key.split(":");
      out.push({ id: key, table_name: table, record_id: recordId, deleted_at: at });
    }
  }
  for (const [id, d] of Object.entries(local?.recipesDeleted ?? {})) {
    if (!all && d.sent) continue;
    out.push({ id: `recipe:${id}`, table_name: "recipe", record_id: id, deleted_at: d.at });
  }
  return out;
}

/**
 * Nach neuen Daten vom PC: Übertragenes entfällt, sobald der PC es (mindestens so neu) mitbringt
 * bzw. gelöscht hat. Gerichte ohne PC-Gegenstück bleiben bis der PC sie kennt (gleiche ID oder
 * Name wie bisher).
 */
export function pruneRecipes(catalog, local) {
  const pcRows = catalog?.pc?.recipe ?? null;
  const pc = new Map((pcRows ?? []).map((r) => [r.id, r]));
  const names = new Set([...(catalog?.nutrition?.recipeNames ?? []), ...(pcRows ?? []).map((r) => r.name)].map(norm));
  for (const [id, r] of Object.entries(local?.recipes ?? {})) {
    if (!r.sent) continue;
    const p = pc.get(id);
    if (p ? String(p.updated_at) >= String(r.row.updated_at) : names.has(norm(r.row.name))) delete local.recipes[id];
  }
  for (const [id, d] of Object.entries(local?.recipesDeleted ?? {})) {
    if (d.sent && pcRows && !pc.has(id)) delete local.recipesDeleted[id];
  }
  return local;
}
