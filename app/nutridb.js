// LIFESPAN OS Mobil – Nutrition → Datenbanken wie am PC (1.147.0, `NutritionPage.tsx`):
// Lebensmitteldatenbank (Suche, Sortierung, archivieren, bearbeiten), BLS-Datenbank, Open Food
// Facts und Supplementdatenbank (anlegen, bearbeiten, archivieren; Stacks zur Ansicht).
// Logik in nutrition.js (Lebensmittel) und suppdb.js (Supplemente).

import * as D from "./pcdomain.js";
import * as N from "./nutrition.js";
import * as SB from "./suppdb.js";
import { X, buildDb, nutrientCatalog, nutritionTabs } from "./diary.js";
import { blsCard, blsSearchHtml } from "./blsui.js";
import { offCard, offSearchHtml } from "./offui.js";
import { foodActions } from "./food.js";
import * as SP from "./supplements.js";

const esc = (v) => X.esc(v);
const F = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : D.formatNumber(v, d));
const PAGE = 150;
const entries = (n) => `${F(n, 0)} ${n === 1 ? "Eintrag" : "Einträge"}`;

const norm = (s) =>
  String(s ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");

// ------------------------------------------------------------------ Lebensmitteldatenbank


function foodsAll(db) {
  const foods = new Map(db.foods);
  for (const [id, f] of N.allFoods(X.S.catalog, X.S.food.local)) foods.set(id, f);
  return foods;
}

function usedByFood(db) {
  const out = new Map();
  for (const list of db.itemsByMeal?.values?.() ?? []) for (const i of list) out.set(i.food_id, (out.get(i.food_id) ?? 0) + 1);
  for (const i of db.pc?.recipe_item ?? []) out.set(i.food_id, (out.get(i.food_id) ?? 0) + 1);
  return out;
}

function foodRowHtml(r) {
  const f = r.f;
  const portion = f.portion_amount ? ` · ${esc(f.portion_name)} ${F(f.portion_amount, 1)} ${esc(f.basis_unit)}` : "";
  return `<div class="fdb-row${f.archived ? " is-archived" : ""}">
    <button class="item fdb-row__main" data-act="fdb-edit" data-arg="${esc(f.id)}"><span class="main"><b>${esc(f.name)}</b>${f.brand ? ` <span class="muted small">${esc(f.brand)}</span>` : ""}
      <span class="muted small">${F(f.energy_kcal, 0)} kcal · P ${F(f.protein_g, 1)} g · KH ${F(f.carbs_g, 1)} g · F ${F(f.fat_g, 1)} g je 100 ${esc(f.basis_unit)}${portion}</span>
      <span class="fdb-tags">${r.used ? `<span class="tag">${r.used}× benutzt</span>` : ""}${f.archived ? `<span class="tag">Archiviert</span>` : ""}${r.unsent ? `<span class="tag tag--phone">noch nicht am PC</span>` : ""}</span></span><span class="chev">›</span></button>
    <button class="btn sm ghost fdb-row__arch" data-act="fdb-archive" data-arg="${esc(f.id)}" aria-label="${f.archived ? "Zurückholen" : "Archivieren"}">${f.archived ? "Zurückholen" : "Archivieren"}</button>
  </div>`;
}

/** Nutrition → Datenbanken → Lebensmitteldatenbank. */
export function viewFoodDb() {
  const S = X.S;
  const st = (S.foodDb ??= { query: "", archived: false, sort: "name", shown: PAGE });
  const db = buildDb();
  const foods = foodsAll(db);
  const unsent = new Set(Object.values(S.food.local.foods).filter((x) => !x.sent).map((x) => x.row.id));
  const rows = N.foodRows(foods, { query: st.query, archived: st.archived, sort: st.sort, usedBy: usedByFood(db), unsent });
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("food-db")}
    <section class="card">
      <div class="wo-head"><h3>Lebensmitteldatenbank</h3><span class="tag" id="fdb-count">${entries(rows.length)}</span></div>
      <div class="field"><label for="fdb-q">Suchen</label><input id="fdb-q" type="search" data-fdb="query" value="${esc(st.query)}" placeholder="Name oder Marke" autocomplete="off"></div>
      <div class="field"><label for="fdb-sort">Sortieren</label><select id="fdb-sort" data-fdb="sort">${N.FOOD_SORTS.map(([v, l]) => `<option value="${v}" ${v === st.sort ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
      <label class="goal-check"><input type="checkbox" data-fdb="archived" ${st.archived ? "checked" : ""}> Archivierte anzeigen</label>
      <p class="muted small">Archivierte vom PC kennt das Handy nur, soweit Mahlzeiten sie verwenden. Neue Lebensmittel: Etikett scannen oder Werte selbst eintragen.</p>
      <div class="row"><button class="btn primary" data-act="fdb-new">Neues Lebensmittel</button><button class="btn" data-go="food">Etikett scannen</button></div>
    </section>
    <section class="card">
      <div class="list" id="fdb-list">${foodListHtml(rows, st)}</div>
    </section>
  </main>`;
}

function foodListHtml(rows, st) {
  if (!rows.length) return `<p class="empty">${st.query.trim() ? "Nichts gefunden." : "Noch keine Lebensmittel."}</p>`;
  const more = rows.length > st.shown ? `<button class="btn block" data-act="fdb-more">Weitere ${F(Math.min(PAGE, rows.length - st.shown), 0)} anzeigen (${F(rows.length - st.shown, 0)} übrig)</button>` : "";
  return rows.slice(0, st.shown).map(foodRowHtml).join("") + more;
}

function refreshFoodList() {
  const box = document.getElementById("fdb-list");
  const st = X.S.foodDb;
  if (!box || !st) return false;
  const db = buildDb();
  const unsent = new Set(Object.values(X.S.food.local.foods).filter((x) => !x.sent).map((x) => x.row.id));
  const rows = N.foodRows(foodsAll(db), { query: st.query, archived: st.archived, sort: st.sort, usedBy: usedByFood(db), unsent });
  box.innerHTML = foodListHtml(rows, st);
  const tag = document.getElementById("fdb-count");
  if (tag) tag.textContent = entries(rows.length);
  return true;
}

// ------------------------------------------------------------------ BLS und Open Food Facts

/** Nutrition → Datenbanken → BLS-Datenbank. */
export function viewBlsDb() {
  const S = X.S;
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("bls-db")}
    ${S.blsInfo ? blsSearchHtml() : `<section class="card"><p class="small">Der BLS ist auf diesem Gerät noch nicht gespeichert. Einmal herunterladen – danach geht die Suche offline.</p></section>`}
    ${blsCard().replace('data-act="bls-open"', 'data-act="bls-open" hidden')}
  </main>`;
}

/** Nutrition → Datenbanken → Open Food Facts. */
export function viewOffDb() {
  const S = X.S;
  const q = S.offDbQuery ?? "";
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("off-db")}
    ${
      S.offInfo
        ? `<section class="card">
      <div class="field"><label for="offdb-q">Produkt suchen</label><input id="offdb-q" type="search" data-offdb="q" value="${esc(q)}" placeholder="z. B. Skyr, Haferdrink, 4011800…" autocomplete="off"></div>
      <p class="muted small">Tippen öffnet das Formular „Neues Lebensmittel“ mit den Werten – prüfen, ändern, speichern.</p>
      <div class="list" id="offdb-results">${offSearchHtml(q)}</div>
    </section>`
        : ""
    }
    ${offCard()}
  </main>`;
}

// ------------------------------------------------------------------ Supplementdatenbank

function suppLookup() {
  const db = buildDb();
  return { db, list: SB.supplementModels(db, X.S.supp) };
}

function macroLine(s) {
  const v = s.values;
  const parts = [];
  if (v.energy !== undefined) parts.push(`${F(v.energy, 1)} kcal`);
  if (v.protein !== undefined) parts.push(`P ${F(v.protein, 1)} g`);
  if (v.carbs !== undefined) parts.push(`KH ${F(v.carbs, 1)} g`);
  if (v.fat !== undefined) parts.push(`F ${F(v.fat, 1)} g`);
  const n = Object.keys(v).length;
  const rest = n - parts.length;
  return [...parts, rest > 0 ? `${rest} weitere ${rest === 1 ? "Wert" : "Werte"}` : ""].filter(Boolean).join(" · ") || "keine Nährwerte";
}

function suppRowHtml(s) {
  return `<button class="item" data-act="sdb-edit" data-arg="${esc(s.id)}"><span class="main"><b>${esc(s.name)}</b>${s.manufacturer ? ` <span class="muted small">${esc(s.manufacturer)}</span>` : ""}
    <span class="muted small">${esc(SB.perServingLabel(s.servingAmount, s.unit))}: ${esc(macroLine(s))}</span>
    <span class="fdb-tags">${s.used ? `<span class="tag">${s.used}× verwendet</span>` : ""}${s.archived ? `<span class="tag">Archiviert</span>` : ""}${s.onPhone ? `<span class="tag tag--phone">noch nicht am PC</span>` : ""}</span></span><span class="chev">›</span></button>`;
}

/** Nutrition → Datenbanken → Supplementdatenbank. */
export function viewSuppDb() {
  const S = X.S;
  const st = (S.suppDb ??= { query: "", archived: false });
  const { db, list } = suppLookup();
  const shown = SB.filterSupplements(list, st);
  const stacks = SB.stackModels(db, S.supp).filter((s) => st.archived || !s.archived);
  const notice = S.suppNotice ?? null;
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("supp-db")}
    ${notice ? `<p class="${notice.tone === "error" ? "warn" : "ok"} small" role="status">${esc(notice.text)}</p>` : ""}
    <section class="card">
      <div class="wo-head"><h3>Supplementdatenbank</h3><span class="tag" id="sdb-count">${entries(shown.length)}</span></div>
      <div class="field"><label for="sdb-q">Suchen</label><input id="sdb-q" type="search" data-sdb="query" value="${esc(st.query)}" placeholder="Name oder Hersteller" autocomplete="off"></div>
      <label class="goal-check"><input type="checkbox" data-sdb="archived" ${st.archived ? "checked" : ""}> Archivierte anzeigen</label>
      <button class="btn primary block" data-act="sdb-new">Neues Supplement</button>
      <div class="list" id="sdb-list">${shown.length ? shown.map(suppRowHtml).join("") : `<p class="empty">${st.query.trim() ? "Nichts gefunden." : "Noch keine Supplemente."}</p>`}</div>
      <p class="muted small">Archivierte vom PC kennt das Handy nur, soweit Einnahmen oder Stacks sie verwenden.</p>
    </section>
    <section class="card" id="sdb-stacks">
      <div class="wo-head"><h3>Supplement-Stacks</h3><button class="btn sm primary" data-act="stk-new">Neuer Stack</button></div>
      <div class="list">${
        stacks.length
          ? stacks
              .map(
                (s) => `<button class="item" data-act="stk-edit" data-arg="${esc(s.id)}"><span class="main"><b>${esc(s.name)}</b>
              <span class="muted small">${s.items.length ? s.items.map((i) => `${esc(i.name)} (${esc(SB.amountWithUnit(i.amount, i.unit))})`).join(", ") : "leer"}</span>
              <span class="fdb-tags">${s.used ? `<span class="tag">${s.used}× eingetragen</span>` : ""}${s.archived ? `<span class="tag">Archiviert</span>` : ""}${s.onPhone ? `<span class="tag tag--phone">noch nicht am PC</span>` : ""}</span></span><span class="chev">›</span></button>`,
              )
              .join("")
          : `<p class="muted small">Noch keine Stacks.</p>`
      }</div>
      <p class="muted small">Ein Stack fasst Supplements zusammen, die du oft gemeinsam nimmst – im Tagebuch trägst du ihn mit einem Tipp ein.</p>
    </section>
  </main>`;
}

function valueFieldsHtml(ed, nutrients, groups) {
  const d = ed.draft;
  const e = ed.errors ?? {};
  const serving = SB.parseNum(d.servingAmount);
  const per = SB.perServingLabel(serving > 0 ? serving : 1, d.unit);
  return groups
    .map((g) => {
      const list = nutrients.filter((n) => n.group === g.key);
      if (!list.length) return "";
      const filled = list.filter((n) => String(d.values[n.key] ?? "").trim() !== "").length;
      const hasErr = list.some((n) => e[`values.${n.key}`]);
      return `<details class="sdb-group" ${g.key === "macros" || filled || hasErr ? "open" : ""}><summary><b>${esc(g.label)}</b>${filled ? ` <span class="tag">${filled}</span>` : ""}</summary>
        <div class="nf-grid">${list
          .map((n) => {
            const err = e[`values.${n.key}`];
            return `<div class="field"><label for="sv-${esc(n.key)}">${esc(n.label)} <span class="muted">(${esc(n.unit)} ${esc(per)})</span></label>
            <input id="sv-${esc(n.key)}" type="text" inputmode="decimal" data-sv="${esc(n.key)}" value="${esc(d.values[n.key] ?? "")}" autocomplete="off" ${err ? 'aria-invalid="true"' : ""}>${err ? `<p class="err small">${esc(err)}</p>` : ""}</div>`;
          })
          .join("")}</div></details>`;
    })
    .join("");
}

/** Supplement anlegen oder bearbeiten. */
export function viewSuppEdit() {
  const S = X.S;
  const ed = S.suppEditDb;
  if (!ed) {
    S.view = "supp-db";
    return viewSuppDb();
  }
  const db = buildDb();
  const { groups, nutrients } = nutrientCatalog(db);
  const d = ed.draft;
  const e = ed.errors ?? {};
  const err = (k) => (e[k] ? `<p class="err small">${esc(e[k])}</p>` : "");
  const serving = SB.parseNum(d.servingAmount);
  const per = SB.perServingLabel(serving > 0 ? serving : 1, d.unit);
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("supp-db-edit")}
    <section class="card" id="sdb-editor">
      <h3>${d.id ? "Supplement bearbeiten" : "Neues Supplement"}</h3>
      <p class="muted small">Nährwerte ${esc(per)} eintragen, z. B. von der Packung. Leere Felder gelten als keine Angabe. Energie, Protein, Kohlenhydrate und Fett zählen zur Tagessumme.</p>
      <div class="nf-grid">
        <div class="field wide"><label for="sdb-name">Name</label><input id="sdb-name" type="text" maxlength="80" data-sdbf="name" value="${esc(d.name)}" placeholder="z. B. Vitamin D3 2000 IE" autocomplete="off" ${e.name ? 'aria-invalid="true"' : ""}>${err("name")}</div>
        <div class="field wide"><label for="sdb-man">Hersteller (optional)</label><input id="sdb-man" type="text" maxlength="80" data-sdbf="manufacturer" value="${esc(d.manufacturer)}" placeholder="z. B. Muster GmbH" autocomplete="off">${err("manufacturer")}</div>
        <div class="field"><label for="sdb-unit">Einheit</label><select id="sdb-unit" data-sdbf="unit">${SB.SUPPLEMENT_UNITS.map((u) => `<option value="${esc(u)}" ${u === d.unit ? "selected" : ""}>${esc(u)}</option>`).join("")}</select>${err("unit")}</div>
        <div class="field"><label for="sdb-serving">Menge <span class="muted">(${esc(d.unit)})</span></label><input id="sdb-serving" type="text" inputmode="decimal" data-sdbf="servingAmount" value="${esc(d.servingAmount)}" ${e.servingAmount ? 'aria-invalid="true"' : ""}>${err("servingAmount")}</div>
      </div>
      <p class="muted small" id="sdb-per">Wie viele davon den unten eingetragenen Werten entsprechen – die Werte gelten ${esc(per)}.</p>
    </section>
    <section class="card">
      <h3>Nährwerte</h3>
      <div class="field"><label for="sdb-find">Inhaltsstoff suchen</label><input id="sdb-find" type="search" placeholder="z. B. Magnesium, Kreatin" value="${esc(ed.find ?? "")}" autocomplete="off"></div>
      <div class="list" id="sdb-find-hits">${findHits(ed, nutrients)}</div>
      <div id="sdb-values">${valueFieldsHtml(ed, nutrients, groups)}</div>
    </section>
    <section class="card">
      <div class="field"><label for="sdb-notes">Notizen (optional)</label><textarea id="sdb-notes" rows="2" maxlength="1000" data-sdbf="notes">${esc(d.notes)}</textarea>${err("notes")}</div>
      ${d.id ? `<label class="goal-check"><input type="checkbox" data-sdbf="archived" ${d.archived ? "checked" : ""}> Archiviert (bei der Auswahl ausblenden)</label>` : ""}
      ${ed.message ? `<p class="warn small" role="alert">${esc(ed.message)}</p>` : ""}
      <div class="row"><button class="btn primary" data-act="sdb-save">Speichern</button><button class="btn ghost" data-act="sdb-cancel">Abbrechen</button></div>
      ${ed.deletable ? `<button class="btn ghost danger block" data-act="sdb-delete" data-arg="${esc(d.id)}">Supplement löschen</button>` : ""}
    </section>
  </main>`;
}

function stackSupHits(db, query) {
  const q = String(query ?? "").trim();
  if (!q) return "";
  const list = SP.searchSupplements(db, q, 30);
  if (!list.length) return `<p class="empty">Kein Supplement gefunden – oben unter „Neues Supplement“ anlegen.</p>`;
  return list
    .map((s) => `<button class="item" data-act="stk-add" data-arg="${esc(s.id)}"><span class="main"><b>${esc(s.name)}</b><span class="muted small">${esc([s.manufacturer, s.unit].filter(Boolean).join(" · "))}</span></span><span class="chev">+</span></button>`)
    .join("");
}

/** Supplement-Stack anlegen oder bearbeiten (wie `StackEditor` am PC). */
export function viewStackEdit() {
  const S = X.S;
  const ed = S.stackEdit;
  if (!ed) {
    S.view = "supp-db";
    return viewSuppDb();
  }
  const db = buildDb();
  const d = ed.draft;
  const e = ed.errors ?? {};
  const err = (k) => (e[k] ? `<p class="err small">${esc(e[k])}</p>` : "");
  const rows = d.items
    .map((it, i) => {
      const s = db.supplements?.get(it.supplementId);
      const ie = e[`items.${i}.amount`] || e[`items.${i}.supplementId`];
      return `<div class="dish-item"><b>${esc(s?.name ?? "Unbekanntes Supplement")}</b>
        <div class="row"><input type="text" inputmode="decimal" data-stk-item="${i}" value="${esc(it.amount)}" aria-label="Menge ${esc(s?.name ?? "")} in ${esc(s?.unit ?? "")}" ${ie ? 'aria-invalid="true"' : ""}><span class="unit">${esc(s?.unit ?? "")}</span>
        <button class="btn sm ghost" data-act="stk-move" data-arg="${i}|-1" ${i === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button>
        <button class="btn sm ghost" data-act="stk-move" data-arg="${i}|1" ${i === d.items.length - 1 ? "disabled" : ""} aria-label="Nach unten">↓</button>
        <button class="btn sm ghost" data-act="stk-remove" data-arg="${i}" aria-label="Supplement entfernen">✕</button></div>${ie ? `<p class="err small">${esc(ie)}</p>` : ""}</div>`;
    })
    .join("");
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("stack-edit")}
    <section class="card" id="stk-editor">
      <h3>${d.id ? "Stack bearbeiten" : "Neuer Supplement-Stack"}</h3>
      <div class="field"><label for="stk-name">Name</label><input id="stk-name" type="text" maxlength="80" data-stkf="name" value="${esc(d.name)}" placeholder="z. B. Morgens" autocomplete="off" ${e.name ? 'aria-invalid="true"' : ""}>${err("name")}</div>
    </section>
    <section class="card">
      <h3>Supplements</h3>
      ${err("items")}
      ${rows || `<p class="muted small">Noch keine Supplements. Unten suchen und antippen.</p>`}
      <div class="field"><label for="stk-q">Supplement hinzufügen</label><input id="stk-q" type="search" placeholder="Supplement suchen, z. B. Magnesium" value="${esc(ed.query ?? "")}" autocomplete="off"></div>
      <div class="list" id="stk-hits">${stackSupHits(db, ed.query)}</div>
    </section>
    <section class="card">
      <div class="field"><label for="stk-notes">Notizen (optional)</label><textarea id="stk-notes" rows="2" maxlength="1000" data-stkf="notes">${esc(d.notes)}</textarea>${err("notes")}</div>
      <label class="goal-check"><input type="checkbox" data-stkf="archived" ${d.archived ? "checked" : ""}> Archiviert (beim Hinzufügen im Tagebuch ausblenden)</label>
      ${ed.message ? `<p class="warn small" role="alert">${esc(ed.message)}</p>` : ""}
      <div class="row"><button class="btn primary" data-act="stk-save">Speichern</button><button class="btn ghost" data-act="stk-cancel">Abbrechen</button></div>
      ${d.id ? `<button class="btn ghost danger block" data-act="stk-delete" data-arg="${esc(d.id)}">Stack löschen</button>` : ""}
    </section>
  </main>`;
}

function findHits(ed, nutrients) {
  const q = norm(ed.find ?? "").trim();
  if (q.length < 2) return "";
  const hits = nutrients.filter((n) => norm(n.label).includes(q)).slice(0, 12);
  if (!hits.length) return `<p class="empty">Kein Feld gefunden.</p>`;
  return hits.map((n) => `<button class="item" data-act="sdb-jump" data-arg="${esc(n.key)}"><span class="main"><b>${esc(n.label)}</b> <span class="muted small">${esc(n.unit)}</span></span><span class="chev">›</span></button>`).join("");
}

// ------------------------------------------------------------------ Aktionen

async function persistFood() {
  try {
    await X.store.set("nutrition", X.S.food.local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

async function persistSupp() {
  try {
    await X.store.set("supp", X.S.supp);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

function pcValueIds(id) {
  const out = {};
  for (const v of X.S.catalog?.pc?.supplement_value ?? []) if (v.supplement_id === id && v.id) out[v.nutrient] = v.id;
  return out;
}

function openSuppEditor(model) {
  const S = X.S;
  if (model && model.onPc && !model.notesKnown) {
    S.suppNotice = { tone: "error", text: "Dieses Supplement kommt vom PC. Bitte am PC neu exportieren und hier „Neue Exportdatei laden“ – dann lässt es sich am Handy bearbeiten, ohne die Notiz am PC zu verlieren." };
    return X.rerender();
  }
  S.suppNotice = null;
  S.suppEditDb = {
    draft: model ? SB.draftFromModel(model) : SB.emptyDraft(),
    errors: {},
    message: null,
    find: "",
    deletable: Boolean(model && !model.used && !model.onPc && !model.sent),
  };
  X.go("supp-db-edit");
}

function stackLookup() {
  const db = buildDb();
  return { db, list: SB.stackModels(db, X.S.supp) };
}

function openStackEditor(model) {
  X.S.suppNotice = null;
  X.S.stackEdit = { draft: model ? SB.stackDraftFromModel(model) : SB.emptyStackDraft(), errors: {}, message: null, query: "" };
  X.go("stack-edit");
}

export const nutriDbActions = {
  // ---------------- Stacks (1.149.0)
  "stk-new": () => openStackEditor(null),
  "stk-edit": (el) => {
    const m = stackLookup().list.find((s) => s.id === el.dataset.arg);
    if (!m) return X.toast("Stack nicht gefunden.", true);
    openStackEditor(m);
  },
  "stk-cancel": () => {
    X.S.stackEdit = null;
    X.go("supp-db");
  },
  "stk-add": (el) => {
    const ed = X.S.stackEdit;
    const s = buildDb().supplements?.get(el.dataset.arg);
    if (!ed || !s) return;
    ed.draft.items.push(SB.stackDraftItem(s.id, String(SP.startAmount(s)).replace(".", ",")));
    ed.query = "";
    X.rerender();
    requestAnimationFrame(() => document.getElementById("stk-q")?.focus());
  },
  "stk-remove": (el) => {
    const ed = X.S.stackEdit;
    if (!ed) return;
    ed.draft.items.splice(Number(el.dataset.arg), 1);
    ed.errors = {};
    X.rerender();
  },
  "stk-move": (el) => {
    const ed = X.S.stackEdit;
    if (!ed) return;
    const [i, dir] = el.dataset.arg.split("|").map(Number);
    const j = i + dir;
    const list = ed.draft.items;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    X.rerender();
  },
  "stk-save": async () => {
    const S = X.S;
    const ed = S.stackEdit;
    if (!ed) return;
    const { db, list } = stackLookup();
    const checked = SB.checkStackDraft(ed.draft, { supplements: db.supplements ?? new Map(), names: list.map((s) => ({ id: s.id, name: s.name })) });
    if (!checked.ok) {
      ed.errors = checked.errors;
      ed.message = "Bitte die markierten Felder prüfen.";
      return X.rerender();
    }
    const current = ed.draft.id ? list.find((s) => s.id === ed.draft.id) ?? null : null;
    const onPc = Boolean(ed.draft.id && (S.catalog?.pc?.supplement_stack ?? []).some((s) => s.id === ed.draft.id));
    const row = SB.saveStack(S.supp, checked.value, current, { uuid: () => X.uuid(), now: new Date(), positions: list.map((s) => s.position), onPc });
    await persistSupp();
    S.stackEdit = null;
    S.suppNotice = { tone: "ok", text: `Stack „${row.name}“ gespeichert – geht mit „An den PC senden“ an den PC.` };
    X.go("supp-db");
  },
  "stk-delete": async (el) => {
    const S = X.S;
    if (!X.confirmTwice(el, "Nochmal tippen: Stack löschen")) return;
    const id = el.dataset.arg;
    const onPc = (S.catalog?.pc?.supplement_stack ?? []).some((s) => s.id === id);
    SB.deleteStack(S.supp, id, { onPc, now: new Date() });
    await persistSupp();
    S.stackEdit = null;
    S.suppNotice = { tone: "ok", text: "Stack gelöscht. Bereits eingetragene Tage bleiben unverändert." };
    X.go("supp-db");
  },
  // ---------------- Lebensmittel
  "fdb-edit": (el) => {
    const id = el.dataset.arg;
    const food = N.allFoods(X.S.catalog, X.S.food.local).get(id);
    if (!food) return X.toast("Archivierte Lebensmittel vom PC bitte zuerst zurückholen.", true);
    foodActions["rv-food-edit"]({ dataset: { arg: id } });
  },
  "fdb-new": () => {
    const s = X.S.food;
    s.selected = null;
    s.known = false;
    s.scan = null;
    s.photo = null;
    s.offHint = false;
    s.errors = {};
    s.form = N.emptyForm();
    s.status = "Neues Lebensmittel: Werte je 100 g bzw. ml von der Packung eintragen.";
    X.go("food");
    requestAnimationFrame(() => document.getElementById("food-form")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "fdb-archive": async (el) => {
    const db = buildDb();
    const food = foodsAll(db).get(el.dataset.arg);
    if (!food) return;
    N.setFoodArchived(X.S.food.local, food, !food.archived, new Date());
    await persistFood();
    X.toast(food.archived ? `„${food.name}“ zurückgeholt.` : `„${food.name}“ archiviert – erscheint nicht mehr bei der Auswahl.`);
    X.rerender();
  },
  "fdb-more": () => {
    X.S.foodDb.shown += PAGE;
    refreshFoodList();
  },
  // ---------------- Supplemente
  "sdb-new": () => openSuppEditor(null),
  "sdb-edit": (el) => {
    const m = suppLookup().list.find((s) => s.id === el.dataset.arg);
    if (!m) return X.toast("Supplement nicht gefunden.", true);
    openSuppEditor(m);
  },
  "sdb-cancel": () => {
    X.S.suppEditDb = null;
    X.go("supp-db");
  },
  "sdb-jump": (el) => {
    const input = document.getElementById(`sv-${el.dataset.arg}`);
    const box = input?.closest("details");
    if (box) box.open = true;
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus();
  },
  "sdb-save": async () => {
    const S = X.S;
    const ed = S.suppEditDb;
    if (!ed) return;
    const { db, list } = suppLookup();
    const { nutrients } = nutrientCatalog(db);
    const checked = SB.checkDraft(ed.draft, { nutrients, names: list.map((s) => ({ id: s.id, name: s.name })) });
    if (!checked.ok) {
      ed.errors = checked.errors;
      ed.message = "Bitte die markierten Felder prüfen.";
      return X.rerender();
    }
    const current = ed.draft.id ? list.find((s) => s.id === ed.draft.id) ?? null : null;
    const row = SB.saveSupplement(S.supp, checked.value, current, { uuid: () => X.uuid(), now: new Date(), pcValueIds: current ? pcValueIds(current.id) : {} });
    await persistSupp();
    S.suppEditDb = null;
    S.suppNotice = { tone: "ok", text: `Supplement „${row.name}“ gespeichert – geht mit „An den PC senden“ an den PC.` };
    X.go("supp-db");
  },
  "sdb-delete": async (el) => {
    const S = X.S;
    if (!X.confirmTwice(el, "Nochmal tippen: Supplement löschen")) return;
    const m = suppLookup().list.find((s) => s.id === el.dataset.arg);
    if (!m) return;
    try {
      SB.deleteSupplement(S.supp, m);
    } catch (e) {
      return X.toast(e.message, true);
    }
    await persistSupp();
    S.suppEditDb = null;
    S.suppNotice = { tone: "ok", text: "Supplement gelöscht." };
    X.go("supp-db");
  },
};

/** Eingaben (input-Ereignis). true = behandelt. */
export function nutriDbInput(el) {
  const S = X.S;
  if (el.dataset?.fdb === "query" && S.foodDb) {
    S.foodDb.query = el.value;
    S.foodDb.shown = PAGE;
    refreshFoodList();
    return true;
  }
  if (el.dataset?.offdb === "q") {
    S.offDbQuery = el.value;
    const box = document.getElementById("offdb-results");
    if (box) box.innerHTML = offSearchHtml(el.value);
    return true;
  }
  if (el.dataset?.sdb === "query" && S.suppDb) {
    S.suppDb.query = el.value;
    const box = document.getElementById("sdb-list");
    if (box) {
      const shown = SB.filterSupplements(suppLookup().list, S.suppDb);
      box.innerHTML = shown.length ? shown.map(suppRowHtml).join("") : `<p class="empty">Nichts gefunden.</p>`;
      const tag = document.getElementById("sdb-count");
      if (tag) tag.textContent = entries(shown.length);
    }
    return true;
  }
  const sk = S.stackEdit;
  if (sk) {
    if (el.id === "stk-q") {
      sk.query = el.value;
      const box = document.getElementById("stk-hits");
      if (box) box.innerHTML = stackSupHits(buildDb(), sk.query);
      return true;
    }
    if (el.dataset?.stkf === "name" || el.dataset?.stkf === "notes") {
      sk.draft[el.dataset.stkf] = el.value;
      return true;
    }
    if (el.dataset?.stkItem !== undefined) {
      const it = sk.draft.items[Number(el.dataset.stkItem)];
      if (it) it.amount = el.value;
      return true;
    }
  }
  const ed = S.suppEditDb;
  if (!ed) return false;
  if (el.id === "sdb-find") {
    ed.find = el.value;
    const box = document.getElementById("sdb-find-hits");
    if (box) box.innerHTML = findHits(ed, nutrientCatalog(buildDb()).nutrients);
    return true;
  }
  if (el.dataset?.sv) {
    ed.draft.values[el.dataset.sv] = el.value;
    return true;
  }
  const f = el.dataset?.sdbf;
  if (f === "name" || f === "manufacturer" || f === "servingAmount" || f === "notes") {
    ed.draft[f] = el.value;
    if (f === "servingAmount") {
      const p = document.getElementById("sdb-per");
      const v = SB.parseNum(el.value);
      if (p) p.textContent = `Wie viele davon den unten eingetragenen Werten entsprechen – die Werte gelten ${SB.perServingLabel(v > 0 ? v : 1, ed.draft.unit)}.`;
    }
    return true;
  }
  return false;
}

/** Auswahlfelder (change-Ereignis). true = behandelt. */
export function nutriDbChange(el) {
  const S = X.S;
  if (el.dataset?.fdb && S.foodDb) {
    if (el.dataset.fdb === "archived") S.foodDb.archived = el.checked;
    else if (el.dataset.fdb === "sort") S.foodDb.sort = el.value;
    else return el.dataset.fdb === "query";
    S.foodDb.shown = PAGE;
    X.rerender();
    return true;
  }
  if (el.dataset?.sdb === "archived" && S.suppDb) {
    S.suppDb.archived = el.checked;
    X.rerender();
    return true;
  }
  if (el.dataset?.sdb === "query" || el.dataset?.offdb === "q") return true;
  if (S.stackEdit && el.dataset?.stkf === "archived") {
    S.stackEdit.draft.archived = el.checked;
    return true;
  }
  if (S.stackEdit && (el.dataset?.stkf || el.dataset?.stkItem !== undefined || el.id === "stk-q")) return true;
  const ed = S.suppEditDb;
  if (!ed) return false;
  if (el.dataset?.sdbf === "unit") {
    ed.draft.unit = el.value;
    X.rerender();
    return true;
  }
  if (el.dataset?.sdbf === "archived") {
    ed.draft.archived = el.checked;
    return true;
  }
  return Boolean(el.dataset?.sdbf || el.dataset?.sv);
}
