// LIFESPAN OS Mobil – Oberfläche „Ernährung“: Etikett scannen, Lebensmittel speichern und
// tracken, Gerichte zusammenstellen. Logik in nutrition.js und label.js, Texterkennung in ocr.js.
import { applyBlsLink, blsLinkHtml, blsResultsHtml } from "./blsui.js";
import { offReady, offResultsHtml, openOffForm } from "./offui.js";
import * as OFF from "./off.js";
import * as N from "./nutrition.js";
import * as D from "./pcdomain.js";
import * as L from "./label.js";
import { buildDb, nutritionTabs } from "./diary.js";
import * as QM from "./quickmeal.js";
import { extraResultsHtml, initPlate, plateActions, plateCardHtml, plateInput, saveWithoutTime, tagHtml } from "./mealplate.js";
import { autoAttrs, autoSaveHtml } from "./autosave.js";

let X = null; // Verbindung zur App (Zustand, Anzeige, Speichern)

/** Wird einmal von app.js aufgerufen. */
export function initFood(ctx) {
  X = ctx;
  // Mahlzeit erfassen wie am PC (1.125.0): Teller „Wird eingetragen“
  initPlate({ X, F, esc, today, trackDate, trackDayLabel, persist, quickData, startAmount, timeFieldHtml, timeHintHtml, mealOptions, foodResults, planItems, defaultTime, foodDupHtml });
  document.addEventListener("pointerdown", cropStart);
  document.addEventListener("pointermove", cropMove);
  document.addEventListener("pointerup", cropEnd);
  document.addEventListener("pointercancel", cropEnd);
  // Favoriten: lange drücken öffnet die Menge (1.55.0)
  document.addEventListener("pointerdown", holdStart);
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) document.addEventListener(t, holdEnd);
}

let hold = null;
function holdStart(ev) {
  const el = ev.target.closest?.("[data-hold]");
  if (!el) return;
  holdEnd();
  hold = setTimeout(() => {
    hold = null;
    el.dataset.held = "1";
    openFood(el.dataset.arg);
  }, 550);
}
function holdEnd() {
  clearTimeout(hold);
  hold = null;
}

/** iPhone/iPad: „Text scannen“ der Tastatur ist genauer als die Erkennung im Browser. */
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

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
    photo: null, // { img, rotate, preview, crop, done } – Foto vor der Texterkennung
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
  N.mealChoices(value).map((m) => `<option value="${esc(m.value)}" ${m.value === value ? "selected" : ""}>${esc(m.label)}</option>`).join("");

/** Aktuelle Uhrzeit „HH:MM“ */
const clockNow = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Uhrzeit, die eine neue Mahlzeit ohne Eingabe bekommt (1.100.0, wie PC 1.0.175): heute die
 * aktuelle Uhrzeit, an anderen Tagen keine (dort fragt die App wie bisher nach).
 */
const defaultTime = (date) => (date === today() ? clockNow() : "");

/**
 * Uhrzeit beim Eintragen (1.47.0, wie am PC). Seit 1.100.0 steht bei einer neuen Mahlzeit von
 * heute die aktuelle Uhrzeit schon im Feld. An anderen Tagen erscheint ohne Uhrzeit vor dem
 * Eintragen ein Hinweis mit Sprung ins Feld.
 */
function timeFieldHtml(kind, date, mealKey) {
  const s = F();
  const id = kind === "dish" ? "fd-time" : "ft-time";
  const known = N.mealTimeFor(X.S.catalog, s.local, date, mealKey);
  const value = (kind === "dish" ? s.dishTime : s.time) || (known ? "" : defaultTime(date));
  return `<div class="field"><label for="${id}">Uhrzeit</label><input id="${id}" type="time" data-${kind === "dish" ? "fd" : "ft"}="${kind === "dish" ? "dishTime" : "time"}" value="${esc(value ?? "")}">
      ${known ? `<span class="muted small">Die Mahlzeit hat schon ${esc(known)} Uhr.</span>` : `<button type="button" class="btn sm ghost" data-act="food-time-now" data-arg="${kind}">Jetzt</button>`}</div>`;
}

function timeHintHtml(kind) {
  if (F().askTime !== kind) return "";
  return `<div class="warn" role="alert"><p class="small">Noch keine Uhrzeit eingetragen. Mit Uhrzeit lässt sich die Mahlzeit im Tagesverlauf genauer auswerten.</p>
    <div class="row"><button class="btn sm primary" data-act="food-time-focus" data-arg="${kind}">Uhrzeit eintragen</button><button class="btn sm" data-act="food-time-skip" data-arg="${kind}">Ohne Uhrzeit eintragen</button></div></div>`;
}

// ------------------------------------------------------------------ Schnell eintragen (1.55.0)

/** Verlauf, aktive Lebensmittel und Nutzung – einmal je Anzeige. */
function quickData() {
  const db = buildDb();
  const history = QM.pastMeals(db);
  return { history, foods: N.allFoods(X.S.catalog, F().local), rank: QM.usageRank(history) };
}

/** Übliche Menge eines Lebensmittels (Median der Einträge der letzten 90 Tage) oder null. */
function usualFor(history, foodId) {
  const from = QM.Q.favoriteFoods(history, today(), { days: 90, limit: 500 }).find((x) => x.foodId === foodId);
  if (from) return from.amount;
  const once = history.flatMap((m) => m.items).filter((i) => i.foodId === foodId);
  return once.length ? QM.Q.usualAmount(once.map((i) => i.amount)) : null;
}

/** Startmenge: übliche Menge, sonst 1 Portion, sonst 100 g/ml (in g/ml). */
function startAmount(food, history) {
  return usualFor(history, food.id) ?? (food.portion_amount ? food.portion_amount : 100);
}

const amountText = (v) => String(Math.round(v * 10) / 10).replace(".", ",");

/** Freitext-Erfassung – steht seit 1.58.0 unter „Lebensmittel suchen“ (Wunsch des Nutzers). */
function freeTextCard() {
  const s = F();
  const { foods } = quickData();
  const parsed = s.qmParsed;
  return `<section class="card" id="quick-text">
    <h3>Freitext</h3>
    <div class="field"><label for="qm-text">Freitext – auch per Diktat</label>
      <textarea id="qm-text" rows="2" data-qm="text" placeholder="z. B. 200 g Hähnchen, 150 g Reis, 1 EL Olivenöl">${esc(s.qmText ?? "")}</textarea></div>
    <button class="btn block" data-act="qm-parse">Erkennen</button>
    ${parsed ? parsedHtml(parsed, foods) : ""}
  </section>`;
}

function parsedHtml(parsed, foods) {
  if (!parsed.length) return `<p class="muted small">Nichts erkannt. Beispiel: „200 g Hähnchen, 2 Eier“.</p>`;
  const on = parsed.filter((l) => l.on).length;
  return `<ul class="qm-parsed">${parsed
    .map((l, i) => {
      const opts = l.candidates.length
        ? l.candidates.map((id) => foods.get(id)).filter(Boolean).map((f) => `<option value="${esc(f.id)}" ${f.id === l.foodId ? "selected" : ""}>${esc(N.foodLabel(f))}</option>`).join("")
        : `<option value="">Kein Treffer – bitte suchen</option>`;
      const unit = foods.get(l.foodId)?.basis_unit ?? "g";
      return `<li class="qm-parsed__item${l.uncertain ? " is-uncertain" : ""}">
        <label class="qm-parsed__on"><input type="checkbox" data-qm="on" data-i="${i}" ${l.on ? "checked" : ""}> <span>${esc(l.text)}</span></label>
        <div class="row"><select data-qm="food" data-i="${i}" aria-label="Lebensmittel" ${l.candidates.length ? "" : "disabled"}>${opts}</select>
          <input type="text" inputmode="decimal" data-qm="amount" data-i="${i}" value="${esc(l.amount)}" aria-label="Menge in ${unit}" placeholder="Menge"><span class="muted small">${esc(unit)}</span></div>
        ${l.note ? `<p class="field-warn small">⚠ ${esc(l.note)}</p>` : ""}</li>`;
    })
    .join("")}</ul>
    <div class="row"><button class="btn primary" data-act="qm-parsed-save" ${on ? "" : "disabled"}>${on} ${on === 1 ? "Lebensmittel" : "Lebensmittel"} eintragen</button>
      <button class="btn ghost" data-act="qm-parsed-clear">Verwerfen</button></div>`;
}

/** Mehrere Einträge auf einmal in die gewählte Mahlzeit, mit „Rückgängig“. */
async function quickTrack(items, label) {
  const s = F();
  if (s.planAt) return planItems(items, s.mealType, label);
  const date = trackDate();
  let res;
  try {
    res = QM.addItems(X.S.catalog, s.local, { date, mealKey: s.mealType, items, today: today(), uuid: () => X.uuid() });
  } catch (e) {
    X.toast(e.message, true);
    return false;
  }
  await persist();
  X.toast(`Eingetragen: ${label} bei ${N.mealLabel(s.mealType)}${date === today() ? "" : ` (${trackDayLabel()})`}`, false, async () => {
    QM.undoItems(F().local, res.mealId, res.added);
    await persist();
    X.rerender();
  });
  return true;
}

/** Lebensmittel zum Tracken öffnen (mit üblicher Menge). */
function openFood(id) {
  const food = N.allFoods(X.S.catalog, F().local).get(id);
  if (!food) return;
  select(food);
  const usual = usualFor(quickData().history, food.id);
  if (usual) {
    F().unit = "base";
    F().amount = amountText(usual);
  }
  F().status = "";
  X.rerender();
  requestAnimationFrame(() => document.getElementById("food-track")?.scrollIntoView({ block: "start", behavior: "smooth" }));
}

// Seit 1.125.0 kommt jeder Treffer auf den Teller („Wird eingetragen“)
const resultAct = () => "plt-add";

function foodItem(f, act) {
  const portion = f.portion_amount ? ` · ${esc(f.portion_name)} ${num(f.portion_amount)} ${f.basis_unit}` : "";
  return `<button class="item${act === "plt-add" ? " plt-hit" : ""}" data-act="${act}" data-arg="${esc(f.id)}"><span class="main">${act === "plt-add" ? tagHtml("meal") : ""}<b>${esc(N.foodLabel(f))}</b>
    <span class="muted small">${Math.round(f.energy_kcal)} kcal · E ${num(f.protein_g)} g je 100 ${f.basis_unit}${portion}</span></span><span class="chev">+</span></button>`;
}

export function foodResults(query, act) {
  const list = N.searchFoods(X.S.catalog, F().local, query, 25);
  // BLS 4.0 (1.30.0): falls heruntergeladen, Treffer darunter
  // Open Food Facts (1.58.0): falls heruntergeladen, Treffer darunter (Tippen öffnet das Formular)
  const bls = blsResultsHtml(query, act) + offResultsHtml(query, act);
  // Gerichte, Supplemente, Stacks und Koffein in derselben Suche (1.125.0)
  const extra = act === "plt-add" ? extraResultsHtml(query) : "";
  if (!list.length) {
    if (extra) return extra + bls;
    return query.trim()
      ? `${bls ? "" : `<p class="empty">Nichts gefunden. Scanne das Etikett, um das Lebensmittel anzulegen.</p>`}${bls}`
      : `<p class="empty muted small">Name, Marke oder Strichcode eingeben.</p>`;
  }
  return list.map((f) => foodItem(f, act)).join("") + extra + bls;
}

// ------------------------------------------------------------------ Ansicht „Ernährung“

/** Hinweise zur Plausibilität der eingetragenen Werte (gelb, nur Hinweis). */
function formWarnings() {
  const s = F();
  const values = {};
  for (const k of L.LABEL_KEYS) {
    const v = N.parseNum(s.form.values[k]);
    if (v !== null && Number.isFinite(v)) values[k] = v;
  }
  return L.checkValues(values, !s.form.id && s.scan ? s.scan.energyKj : null);
}

function updateWarnings() {
  const w = formWarnings();
  for (const k of [...L.LABEL_KEYS, "sum"]) {
    const el = document.getElementById(`fw-${k}`);
    if (!el) continue;
    el.hidden = !w[k];
    el.textContent = w[k] ? `⚠ ${w[k]}` : "";
  }
}

// Vermutlich doppelte Lebensmittel (1.92.0, wie FoodsTab.tsx am PC: Name + Marke + Bezugsgröße)
function foodKeyRows() {
  const s = F();
  return [...N.allFoods(X.S.catalog, s.local).values()].map((r) => ({ id: r.id, name: r.name ?? "", brand: r.brand ?? null, basisUnit: r.basis_unit ?? "g", archived: Boolean(r.archived) }));
}

function dupHint() {
  const f = F().form;
  if (!f || !D.duplicates?.sameAs) return "";
  const Dp = D.duplicates;
  const same = Dp.sameAs(foodKeyRows(), Dp.foodKey, Dp.foodKey({ name: f.name ?? "", brand: f.brand || null, basisUnit: f.basis ?? "g", archived: false }), f.id ?? null);
  return same.length ? `⚠ Gibt es vermutlich schon: ${same.map((x) => (x.brand ? `${x.name} (${x.brand})` : x.name)).join(", ")}` : "";
}

function updateDupHint() {
  const el = document.getElementById("ff-dup");
  if (!el) return;
  const t = dupHint();
  el.hidden = !t;
  el.textContent = t;
}

/** Hinweis in der Suche: Gruppen vermutlich doppelter Lebensmittel; Tippen sucht nach dem Namen. */
function foodDupHtml() {
  if (!D.duplicates?.duplicateGroups) return "";
  const groups = D.duplicates.duplicateGroups(foodKeyRows(), D.duplicates.foodKey);
  if (!groups.length) return "";
  return `<details class="dup-list"><summary class="small">Vermutlich doppelt: ${esc(D.duplicates.describeGroups(groups))}</summary>
    <p class="muted small">Gleicher Name, gleiche Marke und gleiche Bezugsgröße (ohne Groß-/Kleinschreibung, Leer- und Satzzeichen; archivierte zählen nicht). Prüfen und eines davon am PC archivieren oder löschen – automatisch geändert wird nichts. Tippen sucht nach dem Eintrag.</p>
    <ul class="plain-list">${groups
      .slice(0, 50)
      .map((g) => `<li>${g.map((x) => `<button class="linkbtn small" data-act="food-dup-search" data-arg="${esc(x.name)}">${esc(x.brand ? `${x.name} (${x.brand})` : x.name)}</button>`).join(" · ")}</li>`)
      .join("")}</ul></details>`;
}

function formCard() {
  const s = F();
  const f = s.form;
  const e = s.errors;
  const w = formWarnings();
  const fixed = (k) => (!f.id && s.scan?.corrected?.includes(k) ? `<p class="muted small">Lesefehler automatisch korrigiert – bitte prüfen.</p>` : "");
  const warn = (k) => `<p class="field-warn small" id="fw-${k}" ${w[k] ? "" : "hidden"}>${w[k] ? `⚠ ${esc(w[k])}` : ""}</p>`;
  const REQ = new Set(["name", "v.energyKcal", "v.proteinG", "v.carbsG", "v.fatG"]);
  const field = (key, label, value, { unit = "", mode = "decimal", wide = false } = {}) => `
    <div class="field${wide ? " wide" : ""}"><label for="ff-${key}">${esc(label)}${unit ? ` <span class="muted">(${esc(unit)})</span>` : ""}</label>
      <input id="ff-${key}" type="text" inputmode="${mode}" data-ff="${key}" value="${esc(value)}" ${REQ.has(key) ? "required" : ""} autocomplete="off" ${e[key] ? 'aria-invalid="true"' : ""}>
      ${e[key] ? `<p class="err small">${esc(e[key])}</p>` : ""}${key.startsWith("v.") ? warn(key.slice(2)) + fixed(key.slice(2)) : ""}</div>`;
  const hint = (k) => (s.scan?.lessThan.includes(k) ? " (<)" : "");
  return `<section class="card" id="food-form" ${autoAttrs("food", f.id ? "edit" : "new")}>
    <div class="wo-head"><h3>${s.known ? "Gespeichertes Lebensmittel" : s.offHint && !f.id ? "Aus Open Food Facts" : "Erkannte Nährwerte"}</h3>${
      s.scan ? `<span class="tag">${L.recognizedCount(s.scan)} von 8 erkannt</span>` : ""
    }</div>
    ${s.offHint && !f.id ? `<p class="small">Werte aus Open Food Facts (je 100 ${esc(f.basis)}). Bitte mit der Packung vergleichen und bei Bedarf ändern, dann speichern – danach ist es ein normales eigenes Lebensmittel und lässt sich jederzeit bearbeiten.</p>` : ""}
    <div class="nf-grid">
      ${field("name", "Name", f.name, { mode: "text", wide: true })}
      ${field("brand", "Marke (optional)", f.brand, { mode: "text" })}
      <p class="field-warn small wide" id="ff-dup" ${dupHint() ? "" : "hidden"}>${esc(dupHint())}</p>
      <div class="field"><label for="ff-basis">Werte je</label>
        <select id="ff-basis" data-ff="basis"><option value="g" ${f.basis === "g" ? "selected" : ""}>100 g</option><option value="ml" ${f.basis === "ml" ? "selected" : ""}>100 ml</option></select></div>
      ${L.LABEL_KEYS.map((k) => field(`v.${k}`, L.LABEL_NAMES[k] + hint(k), f.values[k], { unit: k === "energyKcal" ? "kcal" : "g" })).join("")}
      ${field("portionName", "Portion (optional)", f.portionName, { mode: "text" })}
      ${field("portionAmount", "Menge der Portion", f.portionAmount, { unit: f.basis })}
      ${field("caffeineMg", "Koffein (optional)", f.caffeineMg ?? "", { unit: "mg je 100 " + f.basis })}
      <p class="muted small wide" id="ff-caffeine-tip">${caffeineTipHtml(f)}</p>
      <details class="wide nf-details" ${N.DETAIL_KEYS.some((k) => (f.details?.[k] ?? "").trim() !== "" || e[`d.${k}`]) ? "open" : ""}>
        <summary>Weitere Angaben (optional): Fettsäuren, Stärke, Wasser</summary>
        <p class="muted small">Für die Details der Tagessumme und das Wasser aus Lebensmitteln, je 100 ${esc(f.basis)}. Leer = keine Angabe.</p>
        <div class="nf-grid">${N.DETAIL_KEYS.map((k) => field(`d.${k}`, N.DETAIL_NAMES[k], f.details?.[k] ?? "", { unit: "g" })).join("")}</div>
      </details>
      <details class="wide nf-details" ${N.AMINO_KEYS.some((k) => (f.aminos?.[k] ?? "").trim() !== "" || e[`a.${k}`]) || e.aminos ? "open" : ""}>
        <summary>Aminosäuren (optional)</summary>
        <p class="muted small">Aminogramm je 100 ${esc(f.basis)} (nicht je 100 g Protein). Aus dem BLS und den Herstellerpaketen übernommen, wenn bekannt. Leer = keine Angabe.</p>
        ${[true, false]
          .map(
            (ess) => `<p class="nf-amino-head small">${ess ? "Essenzielle Aminosäuren" : "Nicht essenzielle Aminosäuren"}</p>
        <div class="nf-grid">${N.AMINOS.filter((a) => a.essential === ess)
          .map((a) => field(`a.${a.key}`, a.label, f.aminos?.[a.key] ?? "", { unit: "g" }))
          .join("")}</div>`,
          )
          .join("")}
        ${e.aminos ? `<p class="err small">${esc(e.aminos)}</p>` : ""}
      </details>
      ${blsLinkHtml(f, D)}
      ${field("barcode", "Strichcode (EAN)", f.barcode, { mode: "numeric", wide: true })}
      <div class="field wide"><label for="ff-notes">Notiz (Vitamine, Mineralstoffe, Koffein …)</label>
        <textarea id="ff-notes" data-ff="notes" rows="2">${esc(f.notes)}</textarea>${e.notes ? `<p class="err small">${esc(e.notes)}</p>` : ""}</div>
    </div>
    ${warn("sum")}
    ${s.text ? `<details><summary class="muted small">Erkannter Text</summary><pre class="ocr-raw">${esc(s.text)}</pre></details>` : ""}
    ${autoSaveHtml("food-save", { mode: f.id ? "edit" : "new", note: f.id ? "Änderungen werden automatisch gespeichert." : "Wird automatisch gespeichert, sobald Name, kcal, Eiweiß, Kohlenhydrate und Fett eingetragen sind – erkannte Werte gleich so:" })}
    ${f.id ? `<button class="btn block" data-act="food-form-done">Fertig</button>` : `<button class="btn primary block" data-act="food-save">Als Lebensmittel speichern</button>`}
  </section>`;
}

/** Richtwert fürs Koffein typischer Getränke (1.126.0, wie PC 1.0.201) – nur auf Klick übernommen. */
function caffeineTipHtml(f) {
  const tip = (f.caffeineMg ?? "").trim() === "" ? D.foodCaffeine.caffeineHint(f.name, f.basis) : null;
  if (!tip) return "Zählt im Tagesverlauf in der Spalte „Koffein“ – auch als Zutat einer Mahlzeit.";
  return `Richtwert ${esc(tip.label)}: etwa ${tip.mgPer100} mg je 100 ml (Schätzung – Packungsangabe geht vor). <button type="button" class="linkbtn" data-act="food-caffeine-tip" data-autosave-click data-arg="${tip.mgPer100}">Übernehmen</button>`;
}

function updateCaffeineTip() {
  const el = document.getElementById("ff-caffeine-tip");
  if (el) el.innerHTML = caffeineTipHtml(F().form);
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
      <div class="field wide"><label for="ft-meal">Mahlzeit (${esc(trackDayLabel())})</label><select id="ft-meal" data-ft="mealType">${mealOptions(s.mealType)}</select></div>
      ${timeFieldHtml("track", trackDate(), s.mealType)}
    </div>
    <p class="small" id="track-preview">${esc(trackPreview())}</p>
    ${timeHintHtml("track")}
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
        (d) => `<div class="meal-block"><p class="small"><b>${esc(d.meal.row.name || N.mealLabel(d.meal.row.meal_type))}</b> · ${esc(N.describeNutrients(d.total))}</p>
        ${d.items
          .map(
            (i) => `<div class="meal-item"><span>${esc(i.food ? i.food.name : "?")} <span class="muted">${num(i.amount)} ${i.food?.basis_unit ?? ""}</span></span>
            ${i.sent ? `<span class="tag">am PC</span>` : `<button class="btn sm ghost" data-act="food-remove" data-arg="${esc(d.meal.row.id)}|${esc(i.id)}" aria-label="Eintrag entfernen">✕</button>`}</div>`,
          )
          .join("")}</div>`,
      )
      .join("")}
    <p class="muted small">Gesamt: ${esc(N.describeNutrients(total))}. Am PC mit „An den PC senden“ übernehmen.</p>
    ${N.unsentCount(F().local) ? `<button class="btn block" data-go="food-review">Offene Einträge prüfen und bearbeiten</button>` : ""}</section>`;
}

function cropCard() {
  const p = F().photo;
  if (p.done) {
    return `<section class="card" id="food-crop"><div class="row">
      <button class="btn sm" data-act="crop-edit">Ausschnitt ändern und neu erkennen</button>
      <button class="btn sm ghost" data-act="crop-cancel">Foto verwerfen</button></div></section>`;
  }
  const r = p.crop;
  const style = r ? `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%` : "";
  return `<section class="card hl" id="food-crop">
    <h3>Ausschnitt wählen</h3>
    <p class="muted small">Mit dem Finger einen Rahmen <b>nur um die Nährwerttabelle</b> ziehen – dann liest die Erkennung keine anderen Texte mit. Steht das Etikett quer oder auf dem Kopf, zuerst drehen.</p>
    <div class="crop-area" id="crop-area"><img src="${p.preview}" alt="Foto des Etiketts" draggable="false">
      <div class="crop-rect" id="crop-rect" style="${style}" ${r ? "" : "hidden"}></div></div>
    <div class="row">
      <button class="btn sm" data-act="crop-rotate">Drehen ↻</button>
      <button class="btn sm" data-act="crop-reset" ${r ? "" : "disabled"}>Ganzes Bild</button>
    </div>
    <button class="btn primary block" data-act="crop-run" ${F().busy ? "disabled" : ""}>${r ? "Ausschnitt erkennen" : "Ganzes Bild erkennen"}</button>
    <button class="btn ghost block" data-act="crop-cancel">Abbrechen</button>
  </section>`;
}

function liveTextBlock(open) {
  const s = F();
  return `<details class="livetext" ${open ? "open" : ""}><summary>${IOS ? "„Text scannen“ des iPhones (am genauesten)" : "Text einfügen oder scannen"}</summary>
        <ol class="steps small"><li>In das Feld unten tippen, dann auf <b>„Text scannen“</b> (Symbol mit Klammern über der Tastatur bzw. im Menü).</li>
        <li>Die Kamera <b>nur auf die Nährwerttabelle</b> (und die Ziffern unter dem Strichcode) halten und <b>„Einsetzen“</b> tippen.</li>
        <li><b>„Text auswerten“</b> tippen.</li></ol>
        <textarea id="ocr-text" rows="5" placeholder="Hier tippen → „Text scannen“">${esc(s.text)}</textarea>
        <button class="btn ${IOS ? "primary" : ""} block" data-act="food-parse">Text auswerten</button>
      </details>`;
}

export function viewFood() {
  const s = F();
  const dish = s.local.dish;
  const oldExport = !X.S.catalog.nutrition;
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("food")}
    ${s.planAt ? `<p class="warn small">Wird geplant: ${esc(N.mealLabel(s.mealType))} um ${esc(s.planAt)} Uhr${s.trackDate && s.trackDate !== today() ? ` (${esc(trackDayLabel())})` : ""} – zählt erst nach „Gegessen“. <button class="btn sm ghost" data-act="food-plan-cancel">Doch jetzt eintragen</button></p>` : ""}
    ${!s.planAt && s.trackDate && s.trackDate !== today() ? `<p class="warn small">Einträge gehen in den ${esc(trackDayLabel())} (aus dem Tagebuch). <button class="btn sm ghost" data-act="food-track-today">Lieber heute</button></p>` : ""}
    ${oldExport ? `<p class="warn">Deine Lebensmittel vom PC fehlen noch: Bitte am PC neu exportieren und hier „Neue Exportdatei laden“. Scannen und Tracken geht trotzdem.</p>` : ""}
    ${s.selected && !s.form ? trackCard() : ""}
    ${plateCardHtml()}
    ${freeTextCard()}
    <section class="card">
      <h3>Etikett scannen</h3>
      <p class="card__note">Erkannt werden die Werte je 100 g/ml, die Packungsgröße und der Strichcode – offline auf dem Handy. Am besten gerade, scharf und ohne Spiegelung.</p>
      ${IOS ? liveTextBlock(true) + `<p class="muted small">Oder ein Foto in der App erkennen lassen:</p>` : ""}
      <label class="btn ${IOS ? "" : "primary"} block" for="ocr-cam">Etikett fotografieren</label>
      <input id="ocr-cam" type="file" accept="image/*" capture="environment" hidden>
      <label class="btn block" for="ocr-pick">Foto aus der Mediathek</label>
      <input id="ocr-pick" type="file" accept="image/*" hidden>
      <p class="small" id="ocr-status" ${s.status ? "" : "hidden"}>${esc(s.status)}</p>
      ${IOS ? "" : liveTextBlock(false)}
    </section>
    ${s.photo ? cropCard() : ""}
    ${s.form ? formCard() : ""}

    <section class="card">
      <div class="wo-head"><h3>Gericht zusammenstellen</h3><span class="tag">${dish.items.length} Zutaten</span></div>
      <p class="muted small">Mehrere Lebensmittel zu einem Gericht kombinieren, als Rezept speichern und/oder deine Portion eintragen.</p>
      <button class="btn block" data-go="dish">${dish.items.length ? "Gericht öffnen" : "Neues Gericht"}</button>
    </section>
    ${dayCard()}
  </main>`;
}

// ------------------------------------------------------------------ Ansicht „Vor dem Senden prüfen“ (1.2.2)

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function dayTitle(iso) {
  const [y, m, d] = iso.split("-");
  const wd = WEEKDAYS[new Date(`${iso}T12:00:00`).getDay()];
  return `${iso === today() ? "Heute, " : ""}${wd} ${d}.${m}.${y}`;
}

/** Am Handy installierte, noch nicht gesendete Herstellerpakete (1.27.0). */
const openPackages = () => Object.values(X.S.supp?.packages ?? {}).filter((p) => !p.sent);

export function viewFoodReview() {
  const s = F();
  const local = s.local;
  const days = N.unsentDays(X.S.catalog, local);
  // Lebensmittel aus Herstellerpaketen stehen beim Paket (Settings → Herstellerpakete), nicht einzeln
  const foods = Object.values(local.foods).filter((f) => !f.sent && !f.pkg);
  const recipes = Object.values(local.recipes).filter((r) => !r.sent);
  // am Handy gelöschte Gerichte (1.147.0); Name aus dem Stand vom PC
  const pcRecipes = new Map((X.S.catalog?.pc?.recipe ?? []).map((r) => [r.id, r]));
  const goneRecipes = Object.entries(local.recipesDeleted ?? {}).filter(([, d]) => !d.sent);
  const allCodes = Object.entries(local.barcodes).filter(([, b]) => !b.sent);
  // Strichcodes neuer Lebensmittel stehen beim Lebensmittel, nur die übrigen (z. B. für ein Lebensmittel vom PC) einzeln
  const newIds = new Set(foods.map((f) => f.row.id));
  const codesOf = (id) => allCodes.filter(([, b]) => b.foodId === id).map(([c]) => c);
  const codes = allCodes.filter(([, b]) => !newIds.has(b.foodId));
  const all = N.allFoods(X.S.catalog, local);
  const empty = !days.length && !foods.length && !recipes.length && !goneRecipes.length && !codes.length;
  const itemRow = (m, it) => `<div class="rv-item">
      <div class="rv-name"><b>${esc(it.food ? N.foodLabel(it.food) : "Unbekanntes Lebensmittel")}</b>
        <span class="muted small">${it.n ? esc(N.describeNutrients(it.n)) : ""}</span></div>
      <div class="rv-edit">
        <label class="rv-f"><span class="muted small">Menge (${it.food?.basis_unit ?? "g"})</span>
          <input type="text" inputmode="decimal" data-rv="amount" data-meal="${esc(m.row.id)}" data-item="${esc(it.id)}" value="${esc(num(it.amount))}" aria-label="Menge"></label>
        <label class="rv-f"><span class="muted small">Mahlzeit</span>
          <select data-rv="mealType" data-meal="${esc(m.row.id)}" data-item="${esc(it.id)}" aria-label="Mahlzeit">${mealOptions(N.mealKeyOf(m.row))}</select></label>
        <label class="rv-f"><span class="muted small">Tag</span>
          <input type="date" data-rv="date" data-meal="${esc(m.row.id)}" data-item="${esc(it.id)}" value="${esc(m.row.date)}" max="${today()}" aria-label="Tag"></label>
        <button class="btn sm ghost" data-act="rv-remove" data-arg="${esc(m.row.id)}|${esc(it.id)}" >Löschen</button>
      </div></div>`;
  return `${X.header("Vor dem Senden prüfen", { back: X.S.reviewFrom || "home", intro: "Hier siehst du alles, was noch nicht am PC ist. Änderungen gelten sofort; gesendet wird erst mit „An den PC senden“." })}<main class="wrap">
    ${empty && !openPackages().length ? `<section class="card"><p class="empty">Keine offenen Ernährungseinträge.</p></section>` : ""}
    ${
      openPackages().length
        ? `<section class="card"><h3>Herstellerpakete</h3>${openPackages()
            .map((p) => `<p class="small"><b>${esc(p.row.manufacturer)}</b> · Version ${esc(p.row.version)} · ${p.added?.foods ?? 0} Lebensmittel, ${p.added?.supplements ?? 0} Supplements neu</p>`)
            .join("")}<button class="btn block" data-act="vendor-open">Herstellerpakete ansehen</button></section>`
        : ""
    }
    ${days
      .map(
        (d) => `<section class="card"><div class="wo-head"><h3>${esc(dayTitle(d.date))}</h3>
          <span class="tag">${Math.round(N.sumNutrients(d.meals.map((m) => m.total)).kcal)} kcal</span></div>
          ${d.meals
            .map(
              (m) => `<div class="meal-block"><p class="small"><b>${esc(m.meal.row.name || N.mealLabel(m.meal.row.meal_type))}</b> · ${esc(N.describeNutrients(m.total))}</p>
              ${m.items.map((it) => itemRow(m.meal, it)).join("")}</div>`,
            )
            .join("")}</section>`,
      )
      .join("")}
    ${
      foods.length
        ? `<section class="card"><h3>Neue oder geänderte Lebensmittel</h3>
          ${foods
            .map(
              (f) => `<div class="meal-item"><span><b>${esc(N.foodLabel(f.row))}</b> <span class="muted small">${Math.round(f.row.energy_kcal)} kcal · E ${num(f.row.protein_g)} g je 100 ${f.row.basis_unit}${
                codesOf(f.row.id).length ? ` · Strichcode ${codesOf(f.row.id).map(esc).join(", ")}` : ""
              }</span></span>
              <span class="row"><button class="btn sm" data-act="rv-food-edit" data-arg="${esc(f.row.id)}">Bearbeiten</button>
              <button class="btn sm ghost" data-act="rv-food-discard" data-arg="${esc(f.row.id)}" aria-label="Lebensmittel verwerfen">✕</button></span></div>`,
            )
            .join("")}</section>`
        : ""
    }
    ${
      recipes.length
        ? `<section class="card"><h3>Neue und geänderte Gerichte</h3>
          ${recipes
            .map(
              (r) => `<div class="meal-item"><span><b>${esc(r.row.name)}</b> <span class="muted small">${num(r.row.servings)} Portion(en) · ${r.items
                .map((i) => `${esc(all.get(i.food_id)?.name ?? "?")} ${num(i.amount)}`)
                .join(", ")}</span></span>
              <button class="btn sm ghost" data-act="rv-recipe-discard" data-arg="${esc(r.row.id)}" aria-label="Rezept verwerfen">✕</button></div>`,
            )
            .join("")}</section>`
        : ""
    }
    ${
      goneRecipes.length
        ? `<section class="card"><h3>Gelöschte Gerichte</h3>
          ${goneRecipes
            .map(
              ([id]) => `<div class="meal-item"><span><b>${esc(pcRecipes.get(id)?.name ?? "Gericht")}</b> <span class="muted small">wird am PC gelöscht</span></span>
              <button class="btn sm ghost" data-act="rv-recipe-discard" data-arg="${esc(id)}" aria-label="Löschen zurücknehmen">✕</button></div>`,
            )
            .join("")}</section>`
        : ""
    }
    ${
      codes.length
        ? `<section class="card"><h3>Neue Strichcodes für Lebensmittel vom PC</h3>
          ${codes
            .map(
              ([code, b]) => `<div class="meal-item"><span>${esc(code)} → <b>${esc(all.get(b.foodId)?.name ?? "?")}</b></span>
              <button class="btn sm ghost" data-act="rv-code-discard" data-arg="${esc(code)}" aria-label="Strichcode verwerfen">✕</button></div>`,
            )
            .join("")}</section>`
        : ""
    }
    ${empty ? "" : `<button class="btn primary block" data-go="send">Weiter zu „An den PC senden“</button>`}
  </main>`;
}

/** Änderung in „Vor dem Senden prüfen“ übernehmen (beim Verlassen eines Feldes). */
async function reviewChange(el) {
  const s = F();
  const field = el.dataset.rv;
  const patch = {};
  if (field === "amount") {
    const v = N.parseNum(el.value);
    if (v === null || Number.isNaN(v)) {
      X.toast("Bitte eine Menge eingeben, z. B. 150 oder 12,5.", true);
      X.rerender();
      return;
    }
    patch.amount = v;
  } else patch[field] = el.value;
  try {
    N.updateItem(X.S.catalog, s.local, el.dataset.meal, el.dataset.item, patch, { uuid: () => X.uuid(), now: new Date() });
    await persist();
    if (field !== "amount") X.toast(field === "date" ? "Eintrag auf den Tag verschoben" : "Eintrag verschoben");
  } catch (e) {
    X.toast(e.message, true);
  }
  X.rerender();
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
    <section class="card food-search">
      <h3>Zutat hinzufügen</h3>
      <input id="dish-q" type="search" placeholder="Name, Marke oder Strichcode" value="${esc(s.dishQuery)}" autocomplete="off">
      <div class="list" id="dish-results">${foodResults(s.dishQuery, "dish-add")}</div>
    </section>
    <section class="card">
      <button class="btn primary block" data-act="dish-save" ${dish.items.length ? "" : "disabled"}>Als Rezept speichern</button>
      <div class="nf-grid">
        <div class="field"><label for="fd-eaten">Davon gegessen (Portionen)</label><input id="fd-eaten" type="text" inputmode="decimal" data-fd="eaten" value="${esc(s.eaten)}"></div>
        <div class="field"><label for="fd-meal">Mahlzeit (heute)</label><select id="fd-meal" data-fd="dishMeal">${mealOptions(s.dishMeal)}</select></div>
        ${timeFieldHtml("dish", trackDate(), s.dishMeal)}
      </div>
      ${timeHintHtml("dish")}
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
  s.offHint = false;
  s.errors = {};
  s.unit = food.portion_amount ? "portion" : "base";
  s.amount = food.portion_amount ? "1" : "100";
}

const offStatus = (p) => `Strichcode ${p.code} in Open Food Facts gefunden: „${p.name}“. Bitte mit der Packung vergleichen und speichern.`;

/**
 * Open Food Facts erst noch laden (1.58.0): Ist der Katalog gespeichert, aber in dieser Sitzung
 * noch nicht gelesen, wird nach dem Laden nachgesehen – solange das Formular noch unverändert ist.
 */
async function offLater(code, form) {
  const before = JSON.stringify(form);
  const c = await offReady();
  const p = c ? OFF.byCode(c, code) : null;
  const s = F();
  if (!p || s.form !== form || JSON.stringify(s.form) !== before) return;
  openOffForm(p, offStatus(p));
  X.rerender();
}

/** Erkannten Text auswerten: bekannter Strichcode → direkt tracken, sonst Formular. */
function useText(text) {
  const s = F();
  s.text = text.trim();
  const scan = L.repairScan(L.parseLabel(s.text));
  s.scan = scan;
  const known = scan.barcode ? N.foodByBarcode(X.S.catalog, s.local, scan.barcode) : null;
  // Open Food Facts (1.58.0): unbekannter Strichcode, aber im Katalog → Formular mit dessen Werten
  const offHit = !known && scan.barcode && X.S.off ? OFF.byCode(X.S.off, scan.barcode) : null;
  if (known) {
    select(known, { known: true });
    s.status = `Strichcode erkannt: „${known.name}“ ist schon gespeichert.`;
  } else if (offHit) {
    openOffForm(offHit, offStatus(offHit));
  } else {
    s.offHint = false;
    s.selected = null;
    s.form = N.scanToForm(scan, s.text);
    s.errors = {};
    const count = L.recognizedCount(scan);
    const fixedNote = scan.corrected.length ? ` ${scan.corrected.length} Lesefehler korrigiert.` : "";
    s.status = s.text ? `${count} von 8 Nährwerten erkannt.${fixedNote} Bitte prüfen und ergänzen.` : "Kein Text erkannt.";
  }
  X.rerender();
  requestAnimationFrame(() => document.getElementById(known ? "food-track" : "food-form")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  if (!known && !offHit && scan.barcode && X.S.offInfo && !X.S.off) offLater(scan.barcode, s.form);
}

/** Foto übernehmen: Vorschau zum Wählen des Ausschnitts. */
async function startPhoto(file) {
  const s = F();
  try {
    const { loadImage, rotated } = await import("./ocr.js");
    const img = await loadImage(file);
    s.photo = { img, rotate: 0, crop: null, done: false, preview: rotated(img, 0, 1000).toDataURL("image/jpeg", 0.8) };
    s.status = "";
    X.rerender();
    requestAnimationFrame(() => document.getElementById("food-crop")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  } catch (e) {
    X.toast(e.message || "Das Foto lässt sich nicht öffnen.", true);
  }
}

/** Texterkennung des gewählten Ausschnitts (mehrere Durchgänge, der beste zählt). */
async function recognizePhoto() {
  const s = F();
  if (s.busy || !s.photo) return;
  s.busy = true;
  const show = (t) => {
    s.status = t;
    const status = document.getElementById("ocr-status");
    if (status) {
      status.hidden = false;
      status.textContent = t;
    }
  };
  show("Foto wird vorbereitet …");
  document.querySelector('[data-act="crop-run"]')?.setAttribute("disabled", "");
  document.getElementById("ocr-status")?.scrollIntoView({ block: "center", behavior: "smooth" });
  try {
    const { recognizeBest, rotated } = await import("./ocr.js");
    const source = rotated(s.photo.img, s.photo.rotate);
    const best = await recognizeBest(
      source,
      { crop: s.photo.crop, score: (text) => L.scanScore(L.repairScan(L.parseLabel(text))), goodEnough: 72 },
      (t, p) => show(`${t} ${p ? Math.round(p * 100) + " %" : ""}`),
    );
    s.photo.done = true;
    s.busy = false;
    useText(best.text);
  } catch (e) {
    show(e.message || "Die Texterkennung ist fehlgeschlagen.");
    X.toast(e.message || "Die Texterkennung ist fehlgeschlagen.", true);
  } finally {
    s.busy = false;
    document.querySelector('[data-act="crop-run"]')?.removeAttribute("disabled");
  }
}

// Rahmen ziehen (Zeiger-Ereignisse auf dem Foto)
let drag = null;
function cropPoint(ev) {
  const img = document.querySelector("#crop-area img");
  const r = img.getBoundingClientRect();
  return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
}
function cropStart(ev) {
  if (!ev.target.closest?.("#crop-area") || !F()?.photo) return;
  ev.preventDefault();
  drag = { start: cropPoint(ev), id: ev.pointerId };
  ev.target.setPointerCapture?.(ev.pointerId);
}
function cropRect(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
function cropMove(ev) {
  if (!drag || ev.pointerId !== drag.id) return;
  const r = cropRect(drag.start, cropPoint(ev));
  const el = document.getElementById("crop-rect");
  if (!el) return;
  el.hidden = false;
  Object.assign(el.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
}
function cropEnd(ev) {
  if (!drag || ev.pointerId !== drag.id) return;
  const r = cropRect(drag.start, cropPoint(ev));
  drag = null;
  const p = F().photo;
  if (!p) return;
  p.crop = r.w > 0.05 && r.h > 0.03 ? r : null;
  X.rerender();
}

function addToDish(food, amount, unit) {
  const dish = F().local.dish;
  dish.items.push({ foodId: food.id, amount, unit });
  persist();
}

/** Tag für „Eintragen“: aus dem Tagebuch gewählter Tag, sonst heute (1.5.0). */
const trackDate = () => F().trackDate ?? today();
function trackDayLabel() {
  const d = trackDate();
  return d === today() ? "heute" : `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
}

/**
 * Aus dem Tagesverlauf geplant (1.100.0): Lebensmittel kommen in eine geplante Mahlzeit statt ins
 * Tagebuch; danach zurück zum Tagesverlauf.
 */
async function planItems(items, mealType, label) {
  const s = F();
  try {
    const p = N.savePlanned(X.S.catalog, s.local, { id: s.planId, date: trackDate(), mealKey: mealType, time: s.planAt, items }, { uuid: () => X.uuid(), now: new Date() });
    await persist();
    X.toast(`Geplant: ${label} – ${N.mealLabel(mealType)} um ${p.row.time} Uhr`);
  } catch (e) {
    X.toast(e.message, true);
    return false;
  }
  s.planAt = null;
  s.planId = null;
  s.trackDate = null;
  s.selected = null;
  const to = s.returnTo ?? "diary";
  s.returnTo = null;
  X.go(to);
  return false;
}

async function track(items, mealType, label, { time = "", kind = "track", skipTime = false, date = trackDate() } = {}) {
  const s = F();
  if (s.planAt) return planItems(items, mealType, label);
  const known = N.mealTimeFor(X.S.catalog, s.local, date, mealType);
  if (!time && !skipTime && !known) time = defaultTime(date);
  if (!time && !skipTime && !known) {
    s.askTime = kind;
    X.rerender();
    return false;
  }
  s.askTime = null;
  try {
    const meal = N.addToMeal(X.S.catalog, F().local, { date, mealType, items, time: time || null }, { uuid: () => X.uuid(), now: new Date() });
    const added = meal.items.slice(meal.items.length - items.length).map((i) => i.id);
    await persist();
    X.toast(`Eingetragen: ${label} bei ${N.mealLabel(mealType)}${trackDate() === today() ? "" : ` (${trackDayLabel()})`}`, false, async () => {
      QM.undoItems(F().local, meal.row.id, added);
      await persist();
      X.rerender();
    });
    // Aus dem Tagebuch gekommen: zurück zum Tag – und zwar zur Mahlzeit, nicht an den Seitenanfang (1.70.1)
    if (F().returnTo) {
      const to = F().returnTo;
      if (to === "diary") {
        X.S.diaryFocus = mealType;
        X.S.mealOpen = { ...(X.S.mealOpen ?? {}), [mealType]: true };
      }
      F().returnTo = null;
      F().trackDate = null;
      F().selected = null;
      X.go(to);
      return false;
    }
    return true;
  } catch (e) {
    X.toast(e.message, true);
    return false;
  }
}

export const foodActions = {
  ...plateActions,
  "food-dup-search": (el) => {
    const s = F();
    s.query = el.dataset.arg ?? "";
    X.rerender();
    document.getElementById("food-search")?.scrollIntoView({ block: "start" });
  },
  "food-plan-cancel": () => {
    F().planAt = null;
    F().planId = null;
    X.rerender();
  },
  "food-track-today": () => {
    F().trackDate = null;
    F().returnTo = null;
    X.rerender();
  },
  "rv-remove": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: löschen")) return;
    const [mealId, itemId] = el.dataset.arg.split("|");
    N.removeItem(F().local, mealId, itemId);
    await persist();
    X.rerender();
  },
  "rv-food-edit": (el) => {
    const s = F();
    const food = N.allFoods(X.S.catalog, s.local).get(el.dataset.arg);
    if (!food) return;
    select(food, { known: true });
    foodActions["food-edit"]();
    X.go("food");
    requestAnimationFrame(() => document.getElementById("food-form")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "rv-food-discard": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: verwerfen")) return;
    try {
      N.discardFood(F().local, el.dataset.arg);
      await persist();
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
  "rv-recipe-discard": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: verwerfen")) return;
    N.discardRecipe(F().local, el.dataset.arg);
    await persist();
    X.rerender();
  },
  "rv-code-discard": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: verwerfen")) return;
    N.discardBarcode(F().local, el.dataset.arg);
    await persist();
    X.rerender();
  },
  "crop-rotate": async () => {
    const p = F().photo;
    const { rotated } = await import("./ocr.js");
    p.rotate = (p.rotate + 90) % 360;
    p.crop = null;
    p.preview = rotated(p.img, p.rotate, 1000).toDataURL("image/jpeg", 0.8);
    X.rerender();
  },
  "crop-reset": () => {
    F().photo.crop = null;
    X.rerender();
  },
  "crop-run": () => recognizePhoto(),
  "crop-edit": () => {
    F().photo.done = false;
    X.rerender();
    requestAnimationFrame(() => document.getElementById("food-crop")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "crop-cancel": () => {
    F().photo = null;
    F().status = "";
    X.rerender();
  },
  "food-parse": () => useText(document.getElementById("ocr-text")?.value ?? ""),
  "food-pick": (el) => openFood(el.dataset.arg),
  // ---------------- Schnell eintragen (1.55.0)
  "qm-fav": async (el) => {
    if (el.dataset.held) {
      delete el.dataset.held; // lange gedrückt: Menge ist schon geöffnet
      return;
    }
    const { history, foods } = quickData();
    const f = foods.get(el.dataset.arg);
    if (!f) return;
    const amount = startAmount(f, history);
    await quickTrack([{ foodId: f.id, amount }], `${amountText(amount)} ${f.basis_unit} ${f.name}`);
  },
  "qm-parse": () => {
    const s = F();
    s.qmText = document.getElementById("qm-text")?.value ?? s.qmText ?? "";
    const { foods, rank } = quickData();
    const list = [...foods.values()].map(QM.quickFood);
    s.qmParsed = QM.Q.parseFreeText(s.qmText, list, rank).map((l) => ({
      ...l,
      amount: l.amount === null ? "" : amountText(l.amount),
      on: Boolean(l.foodId && l.amount !== null),
    }));
    X.rerender();
  },
  "qm-parsed-clear": () => {
    F().qmParsed = null;
    X.rerender();
  },
  "qm-parsed-save": async () => {
    const s = F();
    const chosen = (s.qmParsed ?? []).filter((l) => l.on);
    const items = [];
    for (const l of chosen) {
      const amount = N.parseNum(l.amount);
      if (!l.foodId) return X.toast(`„${l.text}“: bitte ein Lebensmittel wählen oder abwählen.`, true);
      if (!(amount > 0 && amount <= 10000)) return X.toast(`„${l.text}“: bitte eine Menge zwischen 0 und 10.000 eingeben.`, true);
      items.push({ foodId: l.foodId, amount });
    }
    if (!items.length) return X.toast("Bitte mindestens ein Lebensmittel auswählen.", true);
    // Seit 1.125.0 auf den Teller („Wird eingetragen“) statt sofort eintragen
    for (const it of items) foodActions["plt-add"]({ dataset: { arg: it.foodId } }, it.amount);
    s.qmParsed = null;
    s.qmText = "";
    X.toast(`${items.length} Lebensmittel auf den Teller gelegt – oben „Speichern“.`);
    X.rerender();
    document.getElementById("quick-meal")?.scrollIntoView({ block: "start", behavior: "smooth" });
  },
  "food-caffeine-tip": (el) => {
    const s = F();
    s.form.caffeineMg = String(el.dataset.arg ?? "");
    X.rerender();
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
    // Sofort speichern (1.131.0): Formular bleibt offen und bearbeitet das gespeicherte Lebensmittel
    if (X.S.autosaving) {
      s.form.id = r.food.id;
      s.errors = {};
      X.toast(r.merged ? "Vorhandenes Lebensmittel aktualisiert" : "Lebensmittel gespeichert");
      return X.rerender();
    }
    select(r.food, { known: true });
    X.toast(r.merged ? "Vorhandenes Lebensmittel aktualisiert" : "Lebensmittel gespeichert");
    X.rerender();
    requestAnimationFrame(() => document.getElementById("food-track")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  // Passender BLS-Eintrag (1.170.0): auf- und zuklappen, leere Felder füllen
  "bls-link-toggle": () => {
    X.S.blsLinkOpen = !X.S.blsLinkOpen;
    X.rerender();
  },
  "bls-link-use": (el) => {
    const s = F();
    if (!s.form) return;
    const r = applyBlsLink(s.form, el.dataset.arg, D);
    if (!r) return X.toast("Der BLS-Eintrag ist nicht geladen.", true);
    X.toast(r.labels.length ? `Aus dem BLS ergänzt: ${r.labels.join(", ")} – bitte prüfen.` : "BLS-Bezug gesetzt (keine leeren Felder).");
    X.rerender();
  },
  "food-form-done": () => {
    const s = F();
    const food = s.form?.id ? N.allFoods(X.S.catalog, s.local).get(s.form.id) : null;
    if (food) select(food, { known: true });
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
    s.photo = null;
    s.status = "";
    X.rerender();
  },
  "food-time-now": (el) => {
    const d = new Date();
    const t = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (el.dataset.arg === "dish") F().dishTime = t;
    else F().time = t;
    F().askTime = null;
    X.rerender();
  },
  "food-time-focus": (el) => {
    F().askTime = null;
    X.rerender();
    document.getElementById(el.dataset.arg === "dish" ? "fd-time" : "ft-time")?.focus();
  },
  "food-time-skip": (el) =>
    el.dataset.arg === "plate" ? saveWithoutTime() : el.dataset.arg === "dish" ? foodActions["dish-track"](el, true) : foodActions["food-track"](el, true),
  "food-track": async (_el, skipTime = false) => {
    const s = F();
    const amount = N.amountOf(s.selected, s.amount, s.unit);
    if (!amount) return X.toast("Bitte eine Menge eingeben.", true);
    if (await track([{ foodId: s.selected.id, amount }], s.mealType, `${num(amount)} ${s.selected.basis_unit} ${s.selected.name}`, { time: s.time, skipTime })) {
      s.time = "";
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
  "dish-track": async (_el, skipTime = false) => {
    const s = F();
    try {
      const items = N.dishPortionItems(X.S.catalog, s.local, s.local.dish, s.eaten);
      if (await track(items, s.dishMeal, `${s.eaten} Portion(en) ${s.local.dish.name.trim() || "Gericht"}`, { time: s.dishTime, kind: "dish", skipTime })) s.dishTime = "";
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
  if (plateInput(el)) return true;
  if (el.id === "food-q") {
    s.query = el.value;
    document.getElementById("food-results").innerHTML = foodResults(s.query, resultAct());
    // Favoriten nur ohne Suchbegriff – Treffer stehen direkt unter dem Feld (1.182.0)
    const favs = document.getElementById("plt-favs");
    if (favs) favs.hidden = Boolean(s.query.trim());
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
  if (el.dataset.qm) {
    const k = el.dataset.qm;
    const i = Number(el.dataset.i);
    if (k === "text") s.qmText = el.value;
    else if (k === "amount" && s.qmParsed?.[i]) s.qmParsed[i].amount = el.value;
    else if (k === "multi-amount" && s.multi?.[i]) s.multi[i].amount = el.value;
    else if (k === "on" && s.qmParsed?.[i]) {
      s.qmParsed[i].on = el.checked;
      X.rerender();
    } else if (k === "food" && s.qmParsed?.[i]) {
      s.qmParsed[i].foodId = el.value || null;
      X.rerender();
    }
    return true;
  }
  if (el.dataset.ff) {
    const k = el.dataset.ff;
    if (k.startsWith("v.")) {
      s.form.values[k.slice(2)] = el.value;
      updateWarnings();
    } else if (k.startsWith("d.")) {
      s.form.details = { ...(s.form.details ?? {}), [k.slice(2)]: el.value };
    } else if (k.startsWith("a.")) {
      s.form.aminos = { ...(s.form.aminos ?? {}), [k.slice(2)]: el.value };
    } else {
      s.form[k] = el.value;
      if (k === "name" || k === "brand" || k === "basis") updateDupHint();
      if (k === "name" || k === "basis" || k === "caffeineMg") updateCaffeineTip();
    }
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
    startPhoto(file);
    return true;
  }
  if (el.dataset.rv) {
    reviewChange(el);
    return true;
  }
  if (el.dataset.qm === "on" || el.dataset.qm === "food") return foodInput(el);
  if (el.dataset.ff === "basis" || el.dataset.ft || el.dataset.fd || el.dataset.du !== undefined) return foodInput(el);
  return false;
}
