// LIFESPAN OS Mobil – BLS 4.0 herunterladen, durchsuchen und Lebensmittel übernehmen (1.30.0).
// Die Daten liegen einmal je Gerät (für alle Konten) im Speicher „global:bls“.

import * as B from "./bls.js";
import * as N from "./nutrition.js";
import { foodActions } from "./food.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initBls(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const fmt = (v, d = 1) => (v === null ? "–" : Number(v).toLocaleString("de-DE", { maximumFractionDigits: d }));

/** Beim Start: nur die kleine Kennung lesen (die Daten selbst erst bei Bedarf). */
export async function blsBoot() {
  X.S.blsInfo = (await X.store.getGlobal("blsInfo").catch(() => null)) ?? null;
}

let loading = null;
/** Daten aus dem Gerätespeicher holen (einmal je Sitzung); danach neu zeichnen. */
export function ensureBls() {
  const S = X.S;
  if (S.bls || !S.blsInfo) return S.bls ?? null;
  if (!loading) {
    loading = X.store
      .getGlobal("bls")
      .then((data) => {
        S.bls = data ? B.prepare(data) : null;
        if (!data) S.blsInfo = null;
      })
      .catch(() => {
        S.bls = null;
      })
      .finally(() => {
        loading = null;
        X.rerender();
      });
  }
  return null;
}

/** BLS-Treffer unter den eigenen Lebensmitteln (Tracker, Gerichte). */
export function blsResultsHtml(query, act) {
  if (!X.S.blsInfo || !String(query ?? "").trim() || /^\d{8,14}$/.test(query.trim())) return "";
  const b = ensureBls();
  if (!b) return `<p class="muted small">BLS wird geladen …</p>`;
  const hits = B.searchBls(b, query, 12);
  if (!hits.length) return "";
  return `<p class="list-head small"><b>BLS 4.0</b> <span class="muted">– Tippen übernimmt das Lebensmittel (je 100 g)</span></p>${hits
    .map(
      (h) => `<button class="item" data-act="bls-use" data-arg="${esc(h.code)}|${esc(act)}"><span class="main"><b>${esc(h.name)}</b>
      <span class="muted small">${fmt(h.energyKcal, 0)} kcal · E ${fmt(h.proteinG)} g · KH ${fmt(h.carbsG)} g · F ${fmt(h.fatG)} g je 100 g</span></span><span class="chev">+</span></button>`,
    )
    .join("")}`;
}

/** Settings-Karte. */
export function blsCard() {
  const S = X.S;
  const info = S.blsInfo;
  return `<section class="card">
    <h3>BLS 4.0</h3>
    <p class="small"><b>Bundeslebensmittel­schlüssel</b> des Max Rubner-Instituts</p>
    ${
      info
        ? `<p class="small">${fmt(info.foods, 0)} Lebensmittel mit bis zu 138 Nährstoffen je 100 g – auf diesem Gerät gespeichert (für alle Konten). Sie erscheinen bei der Lebensmittelsuche.</p>
          <button class="btn block" data-act="bls-open">BLS durchsuchen</button>
          <button class="btn block ghost danger" data-act="bls-remove">Vom Gerät entfernen</button>`
        : `<p class="muted small card-info">Optional: rund 7.100 Lebensmittel des Max Rubner-Instituts mit allen Nährwerten (je 100 g). Download ca. 2 MB, auf dem Gerät ca. 8 MB. Übernommene Lebensmittel werden normale eigene Lebensmittel (Marke „BLS 4.0“) und gehen wie gewohnt an den PC.</p>
          <button class="btn block" data-act="bls-download" ${S.blsBusy ? "disabled" : ""}>${S.blsBusy ? "Wird geladen …" : "BLS herunterladen"}</button>`
    }
    <p class="card__note bls-source">Quelle: Max Rubner-Institut (2025), Bundeslebensmittelschlüssel (BLS), Version 4.0, Karlsruhe, DOI 10.25826/Data20251217-134202-0 – Lizenz CC BY 4.0.</p>
  </section>`;
}

export function viewBls() {
  const S = X.S;
  if (!S.blsInfo) return `${X.header("BLS 4.0", { back: "transfer" })}<main class="wrap"><section class="card"><p>Der BLS ist auf diesem Gerät nicht gespeichert.</p></section>${blsCard()}</main>`;
  return `${X.header("BLS 4.0", { back: "transfer" })}<main class="wrap">${blsSearchHtml()}</main>`;
}

/** Suche und Einzelansicht des BLS (Import/Export → BLS und Nutrition → Datenbanken, 1.147.0). */
export function blsSearchHtml() {
  const S = X.S;
  const b = ensureBls();
  const q = S.blsQuery ?? "";
  const f = b && S.blsCode ? B.foodByCode(b, S.blsCode) : null;
  return `<section class="card">
      <div class="field"><label for="bls-q">Lebensmittel suchen</label>
        <input id="bls-q" type="search" autocomplete="off" data-bls="q" value="${esc(q)}" placeholder="z. B. Haferflocken, Apfel, Lachs"></div>
      <div class="list" id="bls-results">${b ? resultsHtml(b, q) : `<p class="muted small">Wird geladen …</p>`}</div>
    </section>
    ${f ? detailHtml(b, f) : ""}`;
}

function resultsHtml(b, q) {
  if (!q.trim()) return `<p class="muted small">${fmt(b.data.foods.length, 0)} Lebensmittel, Werte je 100 g essbarer Anteil.</p>`;
  const hits = B.searchBls(b, q, 30);
  if (!hits.length) return `<p class="empty">Nichts gefunden.</p>`;
  return hits
    .map(
      (h) => `<button class="item" data-act="bls-show" data-arg="${esc(h.code)}"><span class="main"><b>${esc(h.name)}</b>
      <span class="muted small">${fmt(h.energyKcal, 0)} kcal · E ${fmt(h.proteinG)} g · KH ${fmt(h.carbsG)} g · F ${fmt(h.fatG)} g</span></span><span class="chev">›</span></button>`,
    )
    .join("");
}

function detailHtml(b, f) {
  const S = X.S;
  const all = Boolean(S.blsAll);
  return `<section class="card" id="bls-detail">
    <h3>${esc(f[1])}</h3>
    <p class="muted small">${esc(f[2])} · Code ${esc(f[0])} · je 100 g essbarer Anteil</p>
    ${f[3] ? `<p class="small">${esc(f[3])}</p>` : ""}
    <button class="btn primary block" data-act="bls-use" data-arg="${esc(f[0])}|food-pick">Als Lebensmittel übernehmen und eintragen</button>
    ${B.groups(b, f, all)
      .map(
        (g) => `<div class="fast-values"><p class="fast-values__title">${esc(g.group)}</p><dl>${g.items
          .map((it) => `<div><dt>${esc(it.nutrient.name)}</dt><dd>${esc(B.describe(it))}</dd></div>`)
          .join("")}</dl></div>`,
      )
      .join("")}
    <label class="goal-check"><input type="checkbox" data-bls="all" ${all ? "checked" : ""}> Auch Nährstoffe ohne Angabe zeigen</label>
  </section>`;
}

/** BLS-Lebensmittel als eigenes Lebensmittel anlegen (oder das schon übernommene nehmen). */
async function useFood(code) {
  const S = X.S;
  const b = ensureBls();
  const f = b ? B.foodByCode(b, code) : null;
  if (!f) return null;
  const local = S.food.local;
  const same = [...N.allFoods(S.catalog, local).values()].find((x) => x.brand === B.BLS_BRAND && String(x.notes ?? "").includes(`Code ${code}.`));
  if (same) return same.id;
  const r = B.takeover(b, f, { id: X.uuid(), now: new Date() });
  if (!r.ok) {
    X.toast(r.message, true);
    return null;
  }
  local.foods[r.row.id] = { row: r.row, sent: false };
  try {
    await X.store.set("nutrition", local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
  if (r.zeroed.length) X.toast(`Übernommen. Als 0 eingetragen: ${r.zeroed.join(", ")}.`);
  return r.row.id;
}

export const blsActions = {
  "bls-download": async () => {
    const S = X.S;
    S.blsBusy = true;
    X.rerender();
    try {
      const res = await fetch(B.BLS_FILE);
      if (!res.ok) throw new Error("Der BLS ist gerade nicht erreichbar. Bitte mit Internet erneut versuchen.");
      const data = await res.json();
      const b = B.prepare(data);
      await X.store.setGlobal("bls", data);
      S.blsInfo = { foods: data.foods.length, at: new Date().toISOString() };
      await X.store.setGlobal("blsInfo", S.blsInfo);
      S.bls = b;
      X.toast(`BLS gespeichert: ${fmt(data.foods.length, 0)} Lebensmittel.`);
    } catch (e) {
      X.toast(e.message || "Download fehlgeschlagen.", true);
    }
    S.blsBusy = false;
    X.rerender();
  },
  "bls-remove": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: entfernen")) return;
    const S = X.S;
    await X.store.setGlobal("bls", null);
    await X.store.setGlobal("blsInfo", null);
    S.bls = null;
    S.blsInfo = null;
    X.toast("BLS vom Gerät entfernt. Schon übernommene Lebensmittel bleiben.");
    if (S.view === "bls") X.go("transfer");
    else X.rerender();
  },
  "bls-open": () => X.go("bls"),
  "bls-show": (el) => {
    X.S.blsCode = el.dataset.arg;
    X.S.blsAll = false;
    X.rerender();
    requestAnimationFrame(() => document.getElementById("bls-detail")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "bls-use": async (el) => {
    const [code, act] = el.dataset.arg.split("|");
    const id = await useFood(code);
    if (!id) return;
    if (act === "food-pick" && X.S.view !== "food") {
      X.S.food.query = "";
      X.go("food");
    }
    const fn = foodActions[act];
    if (fn) fn({ dataset: { arg: id } });
  },
};

/** Eingaben (Suche, Haken); true = behandelt. */
export function blsInput(el) {
  if (el.dataset?.bls === "q") {
    X.S.blsQuery = el.value;
    const list = document.getElementById("bls-results");
    if (list && X.S.bls) list.innerHTML = resultsHtml(X.S.bls, el.value);
    return true;
  }
  return false;
}

export function blsChange(el) {
  if (el.dataset?.bls === "all") {
    X.S.blsAll = el.checked;
    X.rerender();
    return true;
  }
  return el.dataset?.bls === "q";
}
