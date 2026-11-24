// LIFESPAN OS Mobil – Import/Export → Lebensmittel- und Supplementdatenbank (1.46.0): als Datei
// exportieren (gleiches Format wie am PC) und eine Datei vom PC oder einem anderen Handy importieren
// (Vorschau; seit 1.127.0 wie am PC wahlweise vorhandene Einträge mit den Werten der Datei überschreiben).

import * as K from "./catalogfile.js";
import * as SP from "./supplements.js";
import { buildDb, nutrientCatalog } from "./diary.js";

let X = null; // { S, esc, toast, store, uuid, rerender }

export function initCatalog(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const n = (v) => Number(v ?? 0).toLocaleString("de-DE");
const ENTRY = { foods: "Lebensmittel", supplements: "Supplements" };

function previewHtml(plan) {
  const r = plan.kind === "foods" ? plan.foods : plan.supplements;
  const changed = plan.mode === "update" ? (plan.kind === "foods" ? plan.updatedFoods : plan.updatedSupps).length : 0;
  const same = plan.kind === "foods" ? "gleiche ID oder gleicher Name und Marke" : "gleiche ID oder gleicher Name";
  return `<div class="catalog-preview" role="status">
    <p class="small"><b>${n(r.inFile)} ${ENTRY[plan.kind]} in der Datei:</b> ${n(r.added)} neu, ${n(r.kept)} bereits vorhanden (${same}).${
      plan.exportedAt ? ` <span class="muted">Exportiert am ${esc(new Date(plan.exportedAt).toLocaleString("de-DE"))}.</span>` : ""
    }</p>
    ${plan.archivedSkipped ? `<p class="muted small">${n(plan.archivedSkipped)} archivierte Einträge werden nicht übernommen.</p>` : ""}
    ${plan.fieldsAdded.length ? `<p class="small">Neue Nährstofffelder: ${esc(plan.fieldsAdded.join(", "))}</p>` : ""}
    ${plan.fieldsSkipped.length ? `<p class="small warn">Werte ausgelassen (andere Einheit): ${esc(plan.fieldsSkipped.join(", "))}</p>` : ""}
    ${
      r.kept
        ? `<fieldset class="catalog-mode"><legend class="small">Was passiert mit den bereits vorhandenen Einträgen?</legend>
          <label class="catalog-mode__opt"><input type="radio" name="catalog-mode" value="add" data-catalog-mode ${plan.mode === "update" ? "" : "checked"}> Unverändert lassen</label>
          <label class="catalog-mode__opt"><input type="radio" name="catalog-mode" value="update" data-catalog-mode ${plan.mode === "update" ? "checked" : ""}> Mit den Werten aus der Datei überschreiben${
            plan.mode === "update" ? ` <span class="muted small">(${n(changed)} ${changed === 1 ? "Eintrag" : "Einträge"} mit anderen Werten)</span>` : ""
          }</label></fieldset>`
        : ""
    }
    ${
      plan.skipped.length
        ? `<details><summary class="small">${n(plan.skipped.length)} ${plan.skipped.length === 1 ? "Eintrag wird" : "Einträge werden"} übersprungen</summary>
          <ul class="small">${plan.skipped.slice(0, 50).map((s) => `<li>${esc(s)}</li>`).join("")}${plan.skipped.length > 50 ? `<li>… und ${n(plan.skipped.length - 50)} weitere</li>` : ""}</ul></details>`
        : ""
    }
    <div class="row-actions">
      <button class="btn sm primary" data-act="catalog-import" ${r.added + changed ? "" : "disabled"}>${
        r.added + changed ? `${n(r.added + changed)} ${ENTRY[plan.kind]} übernehmen` : "Nichts Neues"
      }</button>
      <button class="btn sm ghost" data-act="catalog-cancel">Abbrechen</button>
    </div>
  </div>`;
}

/** Karte auf der Seite Import/Export. */
export function catalogCard() {
  const S = X.S;
  const plan = S.catalogPlan;
  const block = (kind) => `<div class="catalog-block">
      <h4>${K.LABEL[kind]}</h4>
      <div class="row-actions">
        <button class="btn sm" data-act="catalog-export" data-arg="${kind}">Exportieren</button>
        <label class="btn sm" for="catalog-file-${kind}">Importieren …</label>
        <input id="catalog-file-${kind}" type="file" hidden>
      </div>
      ${plan?.kind === kind ? previewHtml(plan) : ""}
      <div id="catalog-result-${kind}"></div>
    </div>`;
  return `<section class="card">
    <h3>Lebensmittel- und Supplementdatenbank</h3>
    <p class="muted small card-info">Alle Lebensmittel bzw. Supplements als Datei – im gleichen Format wie am PC (Nutrition → Datenbanken). Beim Import kommen neue Einträge dazu; vorhandene lassen sich wie am PC mit den Werten der Datei überschreiben. Alles geht mit „Lebensmittel senden“ an den PC.</p>
    ${block("foods")}
    ${block("supplements")}
  </section>`;
}

async function exportFile(kind) {
  let doc;
  try {
    const db = buildDb();
    doc = K.buildCatalogFile(kind, db, nutrientCatalog(db).nutrients);
  } catch (e) {
    return X.toast(e.message, true);
  }
  const name = K.fileName(kind);
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return X.toast(`„${name}“ weitergegeben.`);
    } catch (e) {
      if (e.name === "AbortError") return X.toast("Abgebrochen");
    }
  }
  const box = document.getElementById(`catalog-result-${kind}`);
  if (box) {
    box.innerHTML = `<p class="small">Die Datei ist bereit – zum Öffnen oder Sichern antippen:</p>
      <a class="btn blue block" href="${URL.createObjectURL(blob)}" download="${esc(name)}">${esc(name)}</a>`;
  }
}

async function openFile(kind, f) {
  const S = X.S;
  try {
    if (f.size > K.MAX_BYTES) throw new Error("Die Datei ist zu groß.");
    S.catalogFile = K.parseCatalogFile(await f.text(), kind);
    S.catalogPlan = plan(S.catalogFile, "add");
  } catch (e) {
    S.catalogPlan = null;
    S.catalogFile = null;
    X.toast(e.message || "Die Datei konnte nicht gelesen werden.", true);
  }
  X.rerender();
}

function plan(file, mode) {
  const db = buildDb();
  return K.planCatalogImport(
    file,
    { foods: db.foods, supplements: db.supplements, supValues: db.supValues, fields: db.nutrientFields, uuid: X.uuid, now: new Date() },
    mode,
  );
}

export const catalogActions = {
  "catalog-export": (el) => exportFile(el.dataset.arg),
  "catalog-cancel": () => {
    X.S.catalogPlan = null;
    X.S.catalogFile = null;
    X.rerender();
  },
  "catalog-import": async () => {
    const S = X.S;
    const plan = S.catalogPlan;
    if (!plan) return;
    S.supp = SP.normSupp(S.supp);
    const r = K.applyCatalogImport(plan, S.food.local, S.supp);
    try {
      await X.store.set("supp", S.supp);
      await X.store.set("nutrition", S.food.local);
    } catch (e) {
      return X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
    }
    S.catalogPlan = null;
    S.catalogFile = null;
    const added = plan.kind === "foods" ? r.foods : r.supplements;
    const changed = plan.kind === "foods" ? r.updatedFoods : r.updatedSupps;
    X.toast(`${n(added)} ${ENTRY[plan.kind]} neu${changed ? `, ${n(changed)} überschrieben` : ""}.`);
    X.rerender();
  },
};

/** Dateiauswahl bzw. Wahl „Unverändert lassen / Überschreiben“; true = behandelt. */
export function catalogChange(el) {
  if (el.dataset?.catalogMode !== undefined) {
    const S = X.S;
    if (S.catalogFile) {
      try {
        S.catalogPlan = plan(S.catalogFile, el.value === "update" ? "update" : "add");
      } catch (e) {
        X.toast(e.message, true);
      }
      X.rerender();
    }
    return true;
  }
  const m = /^catalog-file-(foods|supplements)$/.exec(el.id ?? "");
  if (!m) return false;
  const f = el.files?.[0];
  if (f) openFile(m[1], f);
  el.value = "";
  return true;
}
