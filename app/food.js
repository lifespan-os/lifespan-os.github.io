// LIFESPAN OS Mobil – Oberfläche „Ernährung“: Etikett scannen, Lebensmittel speichern und
// tracken, Gerichte zusammenstellen. Logik in nutrition.js und label.js, Texterkennung in ocr.js.
import * as N from "./nutrition.js";
import * as L from "./label.js";

let X = null; // Verbindung zur App (Zustand, Anzeige, Speichern)

/** Wird einmal von app.js aufgerufen. */
export function initFood(ctx) {
  X = ctx;
}

export function foodState(local) {
  const hour = new Date().getHours();
  return {
    local: local || N.emptyLocal(),
    form: null, // Formular „Erkannte Nährwerte“
    errors: {},
    scan: null,
    text: "", // erkannter oder eingefügter Text
    selected: null, // gespeichertes Lebensmittel zum Tracken
    known: false,
    amount: "",
    unit: "base",
    mealType: N.suggestMealType(hour),
    query: "",
    dishQuery: "",
    eaten: "1",
    dishMeal: N.suggestMealType(hour),
    status: "",
    busy: false,
  };
}

const F = () => X.S.food;
const esc = (v) => X.esc(v);
const today = () => N.nutritionDate();
const num = (v, d = 1) => (v === null || v === undefined ? "–" : String(Math.round(v * 10 ** d) / 10 ** d).replace(".", ","));

async function persist() {
  try {
    await X.store.set("nutrition", F().local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

const mealOptions = (value) =>
  N.MEAL_TYPES.map((m) => `<option value="${m.value}" ${m.value === value ? "selected" : ""}>${esc(m.label)}</option>`).join("");

function foodItem(f, act) {
  const portion = f.portion_amount ? ` · ${esc(f.portion_name)} ${num(f.portion_amount)} ${f.basis_unit}` : "";
  return `<button class="item" data-act="${act}" data-arg="${esc(f.id)}"><span class="main"><b>${esc(N.foodLabel(f))}</b>
    <span class="muted small">${Math.round(f.energy_kcal)} kcal · E ${num(f.protein_g)} g je 100 ${f.basis_unit}${portion}</span></span><span class="chev">+</span></button>`;
}

export function foodResults(query, act) {
  const list = N.searchFoods(X.S.catalog, F().local, query, 25);
  if (!list.length) {
    return query.trim()
      ? `<p class="empty">Nichts gefunden. Scanne das Etikett, um das Lebensmittel anzulegen.</p>`
      : `<p class="empty muted small">Name, Marke oder Strichcode eingeben.</p>`;
  }
  return list.map((f) => foodItem(f, act)).join("");
}

// ------------------------------------------------------------------ Ansicht „Ernährung“

function formCard() {
  const s = F();
  const f = s.form;
  const e = s.errors;
  const field = (key, label, value, { unit = "", mode = "decimal", wide = false } = {}) => `
    <div class="field${wide ? " wide" : ""}"><label for="ff-${key}">${esc(label)}${unit ? ` <span class="muted">(${esc(unit)})</span>` : ""}</label>
      <input id="ff-${key}" type="text" inputmode="${mode}" data-ff="${key}" value="${esc(value)}" autocomplete="off" ${e[key] ? 'aria-invalid="true"' : ""}>
      ${e[key] ? `<p class="err small">${esc(e[key])}</p>` : ""}</div>`;
  const hint = (k) => (s.scan?.lessThan.includes(k) ? " (<)" : "");
  return `<section class="card" id="food-form">
    <div class="wo-head"><h3>${s.known ? "Gespeichertes Lebensmittel" : "Erkannte Nährwerte"}</h3>${
      s.scan ? `<span class="tag">${L.recognizedCount(s.scan)} von 8 erkannt</span>` : ""
    }</div>
    <div class="nf-grid">
      ${field("name", "Name", f.name, { mode: "text", wide: true })}
      ${field("brand", "Marke (optional)", f.brand, { mode: "text" })}
      <div class="field"><label for="ff-basis">Werte je</label>
        <select id="ff-basis" data-ff="basis"><option value="g" ${f.basis === "g" ? "selected" : ""}>100 g</option><option value="ml" ${f.basis === "ml" ? "selected" : ""}>100 ml</option></select></div>
      ${L.LABEL_KEYS.map((k) => field(`v.${k}`, L.LABEL_NAMES[k] + hint(k), f.values[k], { unit: k === "energyKcal" ? "kcal" : "g" })).join("")}
      ${field("portionName", "Portion (optional)", f.portionName, { mode: "text" })}
      ${field("portionAmount", "Menge der Portion", f.portionAmount, { unit: f.basis })}
      ${field("barcode", "Strichcode (EAN)", f.barcode, { mode: "numeric", wide: true })}
      <div class="field wide"><label for="ff-notes">Notiz (Vitamine, Mineralstoffe, Koffein …)</label>
        <textarea id="ff-notes" data-ff="notes" rows="2">${esc(f.notes)}</textarea>${e.notes ? `<p class="err small">${esc(e.notes)}</p>` : ""}</div>
    </div>
    ${s.text ? `<details><summary class="muted small">Erkannter Text</summary><pre class="ocr-raw">${esc(s.text)}</pre></details>` : ""}
    <button class="btn primary block" data-act="food-save">${s.form.id ? "Änderungen speichern" : "Als Lebensmittel speichern"}</button>
  </section>`;
}

function trackPreview() {
  const s = F();
  if (!s.selected) return "";
  const amount = N.amountOf(s.selected, s.amount, s.unit);
  return amount ? `${num(amount)} ${s.selected.basis_unit} = ${N.describeNutrients(N.nutrientsFor(s.selected, amount))}` : "Menge eingeben";
}

function trackCard() {
  const s = F();
  const f = s.selected;
  const portion = f.portion_amount ? `<option value="portion" ${s.unit === "portion" ? "selected" : ""}>${esc(f.portion_name)} (${num(f.portion_amount)} ${f.basis_unit})</option>` : "";
  return `<section class="card hl" id="food-track">
    <div class="wo-head"><h3>${esc(N.foodLabel(f))}</h3><span class="tag">${Math.round(f.energy_kcal)} kcal / 100 ${f.basis_unit}</span></div>
    <div class="nf-grid">
      <div class="field"><label for="ft-amount">Menge</label><input id="ft-amount" type="text" inputmode="decimal" data-ft="amount" value="${esc(s.amount)}" autocomplete="off"></div>
      <div class="field"><label for="ft-unit">Einheit</label><select id="ft-unit" data-ft="unit"><option value="base" ${s.unit === "base" ? "selected" : ""}>${f.basis_unit}</option>${portion}</select></div>
      <div class="field wide"><label for="ft-meal">Mahlzeit (heute)</label><select id="ft-meal" data-ft="mealType">${mealOptions(s.mealType)}</select></div>
    </div>
    <p class="small" id="track-preview">${esc(trackPreview())}</p>
    <div class="row">
      <button class="btn primary" data-act="food-track">Eintragen</button>
      <button class="btn" data-act="food-to-dish">Zum Gericht</button>
    </div>
    <div class="row"><button class="btn sm ghost" data-act="food-edit">Nährwerte bearbeiten</button><button class="btn sm ghost" data-act="food-close">Schließen</button></div>
  </section>`;
}

function dayCard() {
  const day = N.dayOverview(X.S.catalog, F().local, today());
  if (!day.length) return "";
  const total = N.sumNutrients(day.map((d) => d.total));
  return `<section class="card"><div class="wo-head"><h3>Heute am Handy eingetragen</h3><span class="tag">${Math.round(total.kcal)} kcal</span></div>
    ${day
      .map(
        (d) => `<div class="meal-block"><p class="small"><b>${esc(N.mealLabel(d.meal.row.meal_type))}</b> · ${esc(N.describeNutrients(d.total))}</p>
        ${d.items
          .map(
            (i) => `<div class="meal-item"><span>${esc(i.food ? i.food.name : "?")} <span class="muted">${num(i.amount)} ${i.food?.basis_unit ?? ""}</span></span>
            ${i.sent ? `<span class="tag">am PC</span>` : `<button class="btn sm ghost" data-act="food-remove" data-arg="${esc(d.meal.row.id)}|${esc(i.id)}" aria-label="Eintrag entfernen">✕</button>`}</div>`,
          )
          .join("")}</div>`,
      )
      .join("")}
    <p class="muted small">Gesamt: ${esc(N.describeNutrients(total))}. Am PC mit „An den PC senden“ übernehmen.</p></section>`;
}

export function viewFood() {
  const s = F();
  const dish = s.local.dish;
  const oldExport = !X.S.catalog.nutrition;
  return `${X.header("Ernährung", { back: "home" })}<main class="wrap">
    ${oldExport ? `<p class="warn">Deine Lebensmittel vom PC fehlen noch: Bitte am PC neu exportieren und hier „Neue Exportdatei laden“. Scannen und Tracken geht trotzdem.</p>` : ""}
    <section class="card">
      <h3>Etikett scannen</h3>
      <p class="muted small">Fotografiere die Nährwerttabelle (gerade, scharf, bildfüllend). Erkannt werden die Werte je 100 g/ml, die Packungsgröße und der Strichcode – offline auf dem Handy.</p>
      <label class="btn primary block" for="ocr-cam">Etikett fotografieren</label>
      <input id="ocr-cam" type="file" accept="image/*" capture="environment" hidden>
      <label class="btn block" for="ocr-pick">Foto aus der Mediathek</label>
      <input id="ocr-pick" type="file" accept="image/*" hidden>
      <p class="small" id="ocr-status" ${s.status ? "" : "hidden"}>${esc(s.status)}</p>
      <details class="livetext"><summary>iPhone: „Text scannen“ (genauer)</summary>
        <ol class="steps small"><li>In das Feld unten tippen, dann auf <b>„Text scannen“</b> (Symbol mit Klammern über der Tastatur bzw. im Menü).</li>
        <li>Die Kamera auf die Nährwerttabelle (und die Ziffern unter dem Strichcode) halten und <b>„Einsetzen“</b> tippen.</li>
        <li><b>„Text auswerten“</b> tippen.</li></ol>
        <textarea id="ocr-text" rows="5" placeholder="Hier tippen → „Text scannen“">${esc(s.text)}</textarea>
        <button class="btn block" data-act="food-parse">Text auswerten</button>
      </details>
    </section>
    ${s.selected && !s.form ? trackCard() : ""}
    ${s.form ? formCard() : ""}
    <section class="card">
      <h3>Lebensmittel suchen</h3>
      <input id="food-q" type="search" placeholder="Name, Marke oder Strichcode" value="${esc(s.query)}" autocomplete="off" enterkeyhint="search">
      <div class="list" id="food-results">${foodResults(s.query, "food-pick")}</div>
    </section>
    <section class="card">
      <div class="wo-head"><h3>Gericht zusammenstellen</h3><span class="tag">${dish.items.length} Zutaten</span></div>
      <p class="muted small">Mehrere Lebensmittel zu einem Gericht kombinieren, als Rezept speichern und/oder deine Portion eintragen.</p>
      <button class="btn block" data-go="dish">${dish.items.length ? "Gericht öffnen" : "Neues Gericht"}</button>
    </section>
    ${dayCard()}
  </main>`;
}

// ------------------------------------------------------------------ Ansicht „Gericht“

function dishTotalText() {
  const s = F();
  const total = N.dishTotal(X.S.catalog, s.local, s.local.dish);
  const servings = N.parseNum(s.local.dish.servings);
  const per = servings > 0 && servings !== 1 ? ` · je Portion ${Math.round(total.kcal / servings)} kcal, E ${num(total.protein / servings)} g` : "";
  return `Gesamt: ${N.describeNutrients(total)}${per}`;
}

export function viewDish() {
  const s = F();
  const dish = s.local.dish;
  const foods = N.allFoods(X.S.catalog, s.local);
  return `${X.header("Gericht", { back: "food" })}<main class="wrap">
    <section class="card">
      <div class="nf-grid">
        <div class="field wide"><label for="fd-name">Name des Gerichts</label><input id="fd-name" type="text" data-fd="name" value="${esc(dish.name)}" placeholder="z. B. Skyr-Bowl" autocomplete="off"></div>
        <div class="field"><label for="fd-servings">Ergibt Portionen</label><input id="fd-servings" type="text" inputmode="decimal" data-fd="servings" value="${esc(dish.servings)}"></div>
      </div>
    </section>
    <section class="card">
      <h3>Zutaten</h3>
      ${
        dish.items.length
          ? dish.items
              .map((it, i) => {
                const f = foods.get(it.foodId);
                const portion = f?.portion_amount ? `<option value="portion" ${it.unit === "portion" ? "selected" : ""}>${esc(f.portion_name)}</option>` : "";
                return `<div class="dish-item"><b>${esc(f ? N.foodLabel(f) : "Unbekannt")}</b>
                  <div class="row"><input type="text" inputmode="decimal" data-di="${i}" value="${esc(it.amount)}" aria-label="Menge">
                  <select data-du="${i}" aria-label="Einheit"><option value="base" ${it.unit === "base" ? "selected" : ""}>${f?.basis_unit ?? "g"}</option>${portion}</select>
                  <button class="btn sm ghost" data-act="dish-remove" data-arg="${i}" aria-label="Zutat entfernen">✕</button></div></div>`;
              })
              .join("")
          : `<p class="muted small">Noch keine Zutaten. Unten suchen oder im Scanner „Zum Gericht“ tippen.</p>`
      }
      <p class="small"><b id="dish-total">${esc(dishTotalText())}</b></p>
    </section>
    <section class="card">
      <h3>Zutat hinzufügen</h3>
      <input id="dish-q" type="search" placeholder="Name, Marke oder Strichcode" value="${esc(s.dishQuery)}" autocomplete="off">
      <div class="list" id="dish-results">${foodResults(s.dishQuery, "dish-add")}</div>
    </section>
    <section class="card">
      <button class="btn primary block" data-act="dish-save" ${dish.items.length ? "" : "disabled"}>Als Rezept speichern</button>
      <div class="nf-grid">
        <div class="field"><label for="fd-eaten">Davon gegessen (Portionen)</label><input id="fd-eaten" type="text" inputmode="decimal" data-fd="eaten" value="${esc(s.eaten)}"></div>
        <div class="field"><label for="fd-meal">Mahlzeit (heute)</label><select id="fd-meal" data-fd="dishMeal">${mealOptions(s.dishMeal)}</select></div>
      </div>
      <button class="btn block" data-act="dish-track" ${dish.items.length ? "" : "disabled"}>Ins Tagebuch eintragen</button>
      <button class="btn danger block" data-act="dish-clear" ${dish.items.length || dish.name ? "" : "disabled"}>Gericht leeren</button>
    </section>
  </main>`;
}

// ------------------------------------------------------------------ Aktionen

function select(food, { known = false } = {}) {
  const s = F();
  s.selected = food;
  s.known = known;
  s.form = null;
  s.errors = {};
  s.unit = food.portion_amount ? "portion" : "base";
  s.amount = food.portion_amount ? "1" : "100";
}

/** Erkannten Text auswerten: bekannter Strichcode → direkt tracken, sonst Formular. */
function useText(text) {
  const s = F();
  s.text = text.trim();
  const scan = L.parseLabel(s.text);
  s.scan = scan;
  const known = scan.barcode ? N.foodByBarcode(X.S.catalog, s.local, scan.barcode) : null;
  if (known) {
    select(known, { known: true });
    s.status = `Strichcode erkannt: „${known.name}“ ist schon gespeichert.`;
  } else {
    s.selected = null;
    s.form = N.scanToForm(scan, s.text);
    s.errors = {};
    const count = L.recognizedCount(scan);
    s.status = s.text ? `${count} von 8 Nährwerten erkannt – bitte prüfen und ergänzen.` : "Kein Text erkannt.";
  }
  X.rerender();
  requestAnimationFrame(() => document.getElementById(known ? "food-track" : "food-form")?.scrollIntoView({ block: "start", behavior: "smooth" }));
}

async function recognizePhoto(file) {
  const s = F();
  if (s.busy) return;
  s.busy = true;
  const status = document.getElementById("ocr-status");
  const show = (t) => {
    s.status = t;
    if (status) {
      status.hidden = false;
      status.textContent = t;
    }
  };
  show("Foto wird vorbereitet …");
  try {
    const { recognize } = await import("./ocr.js");
    const text = await recognize(file, (t, p) => show(`${t} ${p ? Math.round(p * 100) + " %" : ""}`));
    useText(text);
  } catch (e) {
    show(e.message || "Die Texterkennung ist fehlgeschlagen.");
    X.toast(e.message || "Die Texterkennung ist fehlgeschlagen.", true);
  } finally {
    s.busy = false;
  }
}

function addToDish(food, amount, unit) {
  const dish = F().local.dish;
  dish.items.push({ foodId: food.id, amount, unit });
  persist();
}

async function track(items, mealType, label) {
  try {
    N.addToMeal(X.S.catalog, F().local, { date: today(), mealType, items }, { uuid: () => X.uuid(), now: new Date() });
    await persist();
    X.toast(`Eingetragen: ${label} bei ${N.mealLabel(mealType)}`);
    return true;
  } catch (e) {
    X.toast(e.message, true);
    return false;
  }
}

export const foodActions = {
  "food-parse": () => useText(document.getElementById("ocr-text")?.value ?? ""),
  "food-pick": (el) => {
    const food = N.allFoods(X.S.catalog, F().local).get(el.dataset.arg);
    if (!food) return;
    select(food);
    F().status = "";
    X.rerender();
    requestAnimationFrame(() => document.getElementById("food-track")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "food-save": async () => {
    const s = F();
    const r = N.saveFood(X.S.catalog, s.local, s.form, { uuid: () => X.uuid(), now: new Date() });
    if (!r.ok) {
      s.errors = r.errors;
      X.rerender();
      X.toast("Bitte die markierten Felder prüfen.", true);
      return;
    }
    await persist();
    select(r.food, { known: true });
    X.toast(r.merged ? "Vorhandenes Lebensmittel aktualisiert" : "Lebensmittel gespeichert");
    X.rerender();
    requestAnimationFrame(() => document.getElementById("food-track")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "food-edit": () => {
    const s = F();
    const code = Object.entries(s.local.barcodes).find(([, b]) => b.foodId === s.selected.id)?.[0] ??
      Object.entries(X.S.catalog.nutrition?.barcodes ?? {}).find(([, id]) => id === s.selected.id)?.[0] ?? "";
    s.form = N.foodToForm(s.selected, code);
    s.errors = {};
    X.rerender();
  },
  "food-close": () => {
    const s = F();
    s.selected = null;
    s.form = null;
    s.scan = null;
    s.status = "";
    X.rerender();
  },
  "food-track": async () => {
    const s = F();
    const amount = N.amountOf(s.selected, s.amount, s.unit);
    if (!amount) return X.toast("Bitte eine Menge eingeben.", true);
    if (await track([{ foodId: s.selected.id, amount }], s.mealType, `${num(amount)} ${s.selected.basis_unit} ${s.selected.name}`)) {
      s.selected = null;
      s.scan = null;
      s.text = "";
      s.status = "";
      X.rerender();
    }
  },
  "food-to-dish": () => {
    const s = F();
    addToDish(s.selected, s.amount || "100", s.amount ? s.unit : "base");
    X.toast(`„${s.selected.name}“ ist im Gericht`);
    s.selected = null;
    s.scan = null;
    s.text = "";
    s.status = "";
    X.rerender();
  },
  "food-remove": async (el) => {
    const [mealId, itemId] = el.dataset.arg.split("|");
    N.removeItem(F().local, mealId, itemId);
    await persist();
    X.rerender();
  },
  "dish-add": (el) => {
    const food = N.allFoods(X.S.catalog, F().local).get(el.dataset.arg);
    if (!food) return;
    addToDish(food, food.portion_amount ? "1" : "100", food.portion_amount ? "portion" : "base");
    F().dishQuery = "";
    X.rerender();
  },
  "dish-remove": async (el) => {
    F().local.dish.items.splice(Number(el.dataset.arg), 1);
    await persist();
    X.rerender();
  },
  "dish-save": async () => {
    const s = F();
    try {
      const row = N.saveDishAsRecipe(X.S.catalog, s.local, s.local.dish, { uuid: () => X.uuid(), now: new Date() });
      await persist();
      X.toast(`Rezept „${row.name}“ gespeichert – kommt mit „An den PC senden“ an den PC`);
    } catch (e) {
      X.toast(e.message, true);
    }
  },
  "dish-track": async () => {
    const s = F();
    try {
      const items = N.dishPortionItems(X.S.catalog, s.local, s.local.dish, s.eaten);
      await track(items, s.dishMeal, `${s.eaten} Portion(en) ${s.local.dish.name.trim() || "Gericht"}`);
    } catch (e) {
      X.toast(e.message, true);
    }
  },
  "dish-clear": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: Gericht leeren")) return;
    F().local.dish = N.emptyDish();
    await persist();
    X.rerender();
  },
};

/** Eingaben in den Ernährungsansichten; true = behandelt. */
export function foodInput(el) {
  const s = F();
  if (!s) return false;
  if (el.id === "food-q") {
    s.query = el.value;
    document.getElementById("food-results").innerHTML = foodResults(s.query, "food-pick");
    return true;
  }
  if (el.id === "dish-q") {
    s.dishQuery = el.value;
    document.getElementById("dish-results").innerHTML = foodResults(s.dishQuery, "dish-add");
    return true;
  }
  if (el.id === "ocr-text") {
    s.text = el.value;
    return true;
  }
  if (el.dataset.ff) {
    const k = el.dataset.ff;
    if (k.startsWith("v.")) s.form.values[k.slice(2)] = el.value;
    else s.form[k] = el.value;
    return true;
  }
  if (el.dataset.ft) {
    s[el.dataset.ft] = el.value;
    const p = document.getElementById("track-preview");
    if (p) p.textContent = trackPreview();
    return true;
  }
  if (el.dataset.fd) {
    const k = el.dataset.fd;
    if (k === "name" || k === "servings") {
      s.local.dish[k] = el.value;
      persist();
    } else s[k] = el.value;
    const t = document.getElementById("dish-total");
    if (t) t.textContent = dishTotalText();
    return true;
  }
  if (el.dataset.di !== undefined || el.dataset.du !== undefined) {
    const i = Number(el.dataset.di ?? el.dataset.du);
    const it = s.local.dish.items[i];
    if (!it) return true;
    if (el.dataset.di !== undefined) it.amount = el.value;
    else it.unit = el.value === "portion" ? "portion" : "base";
    persist();
    const t = document.getElementById("dish-total");
    if (t) t.textContent = dishTotalText();
    return true;
  }
  return false;
}

/** Auswahl von Fotos; true = behandelt. */
export function foodChange(el) {
  if ((el.id === "ocr-cam" || el.id === "ocr-pick") && el.files?.[0]) {
    const file = el.files[0];
    el.value = "";
    recognizePhoto(file);
    return true;
  }
  if (el.dataset.ff === "basis" || el.dataset.ft || el.dataset.fd || el.dataset.du !== undefined) return foodInput(el);
  return false;
}
