// LIFESPAN OS Mobil – Import/Export → Herstellerpakete (1.27.0, seit 1.45.6 unter Import/Export): Pakete aus der Liste der App oder als
// Datei installieren (Vorschau wie am PC), installierte Pakete ansehen, noch nicht gesendete zurücknehmen.

import * as V from "./vendor.js";
import * as SP from "./supplements.js";
import { buildDb } from "./diary.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initVendor(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const n = (v) => Number(v ?? 0).toLocaleString("de-DE");

/** Liste der mitgelieferten Pakete (pakete/index.json) einmal laden. */
async function loadIndex() {
  const S = X.S;
  if (S.vendorIndex || S.vendorIndexLoading) return;
  S.vendorIndexLoading = true;
  try {
    const res = await fetch("pakete/index.json", { cache: "no-cache" });
    if (!res.ok) throw new Error();
    S.vendorIndex = (await res.json()).packages ?? [];
  } catch {
    S.vendorIndex = [];
    S.vendorIndexError = "Die Paketliste ist gerade nicht erreichbar (offline?). Eine Paketdatei kannst du trotzdem wählen.";
  }
  S.vendorIndexLoading = false;
  if (S.view === "vendor") X.rerender();
}

function installedList() {
  const S = X.S;
  return V.installedPackages(S.catalog?.pc?.vendor_package, SP.normSupp(S.supp));
}

export function viewVendor() {
  const S = X.S;
  loadIndex();
  const plan = S.vendorPlan;
  const installed = installedList();
  const byKey = new Map(installed.map((p) => [p.key, p]));
  return `${X.header("Pakete", { back: "transfer" })}<main class="wrap">
    ${plan ? previewCard(plan) : ""}
    <section class="card">
      <h3>Paket installieren</h3>
      <p class="muted small">Lebensmittel und Supplements eines Herstellers – dieselben Pakete wie am PC. Vorhandene Einträge bleiben unverändert, eine neuere Paketversion ergänzt nur Neues.</p>
      ${
        S.vendorIndex === undefined
          ? `<p class="muted small">Paketliste wird geladen …</p>`
          : S.vendorIndex.length
            ? `<ul class="vendor-list">${S.vendorIndex
                .map((p) => {
                  const have = byKey.get(p.key);
                  const state = !have ? "" : have.version === p.version ? `installiert (${esc(have.version)})` : `installiert: ${esc(have.version)} · neu: ${esc(p.version)}`;
                  return `<li><span><b>${esc(p.manufacturer)}</b><small class="muted">${esc(p.title)}</small>
                    <small class="muted">${n(p.foods)} Lebensmittel · ${n(p.supplements)} Supplements · Stand ${esc(p.version)}${state ? ` · ${state}` : ""}</small></span>
                    <button class="btn sm" data-act="vendor-pick" data-arg="${esc(p.file)}" ${S.vendorBusy ? "disabled" : ""}>${have && have.version === p.version ? "Prüfen" : "Ansehen"}</button></li>`;
                })
                .join("")}</ul>`
            : `<p class="muted small">${esc(S.vendorIndexError ?? "Keine Pakete in der Liste.")}</p>`
      }
      <label class="btn block" for="vendor-file">Paketdatei wählen …</label>
      <input id="vendor-file" type="file" accept=".json,application/json" hidden>
    </section>
    <section class="card">
      <h3>Installiert</h3>
      ${
        installed.length
          ? `<ul class="vendor-list">${installed
              .map(
                (p) => `<li><span><b>${esc(p.manufacturer)}</b><small class="muted">${esc(p.title)}</small>
                  <small class="muted">Version ${esc(p.version)} · ${p.where === "PC" ? "am PC installiert" : p.sent ? "am Handy installiert, an den PC gesendet" : `am Handy installiert (${n(p.added?.foods)} Lebensmittel, ${n(p.added?.supplements)} Supplements neu) – geht mit „Lebensmittel senden“ an den PC`}</small></span>
                  ${p.where === "Handy" && !p.sent ? `<button class="btn sm ghost danger" data-act="vendor-remove" data-arg="${esc(p.key)}">Zurücknehmen</button>` : ""}</li>`,
              )
              .join("")}</ul>`
          : `<p class="muted small">Noch keine Herstellerpakete installiert.</p>`
      }
      <p class="card__note">Ein am PC installiertes Paket kommt mit der nächsten Exportdatei vom PC. Entfernen geht am PC (Import/Export → Hersteller-Pakete).</p>
    </section>
  </main>`;
}

function report(label, r) {
  return `<p class="small"><b>${esc(label)}:</b> ${n(r.added)} neu${r.kept ? `, ${n(r.kept)} schon vorhanden` : ""} <span class="muted">(${n(r.inFile)} im Paket)</span></p>`;
}

function previewCard(plan) {
  const p = plan.package;
  const nothing = !plan.foods.added && !plan.supplements.added;
  return `<section class="card vendor-preview">
    <h3>${esc(p.manufacturer)}</h3>
    <p class="small"><b>${esc(p.title)}</b><br><span class="muted">Version ${esc(p.version)}${plan.installedVersion ? ` · installiert: ${esc(plan.installedVersion)}` : ""}</span></p>
    ${p.description ? `<p class="muted small">${esc(p.description)}</p>` : ""}
    ${p.source ? `<p class="muted small">Quelle: ${esc(p.source)}</p>` : ""}
    ${report("Lebensmittel", plan.foods)}${report("Supplements", plan.supplements)}
    ${plan.fieldsAdded.length ? `<p class="small">Neue Nährstofffelder: ${esc(plan.fieldsAdded.join(", "))}</p>` : ""}
    ${plan.fieldsSkipped.length ? `<p class="small warn">Werte ausgelassen (andere Einheit): ${esc(plan.fieldsSkipped.join(", "))}</p>` : ""}
    ${
      plan.skipped.length
        ? `<details><summary class="small">${n(plan.skipped.length)} ${plan.skipped.length === 1 ? "Eintrag wird" : "Einträge werden"} übersprungen</summary>
          <ul class="small">${plan.skipped.slice(0, 50).map((s) => `<li>${esc(s)}</li>`).join("")}${plan.skipped.length > 50 ? `<li>… und ${n(plan.skipped.length - 50)} weitere</li>` : ""}</ul></details>`
        : ""
    }
    <button class="btn primary block" data-act="vendor-install" ${X.S.vendorBusy ? "disabled" : ""}>${nothing ? "Paket vermerken (nichts Neues)" : "Installieren"}</button>
    <button class="btn block ghost" data-act="vendor-cancel">Abbrechen</button>
  </section>`;
}

/** Installation für die Vorschau berechnen. */
function plan(pkg) {
  const S = X.S;
  const db = buildDb();
  const local = SP.normSupp(S.supp).packages[pkg.package.key];
  const pcRow = (S.catalog?.pc?.vendor_package ?? []).find((r) => r.package_key === pkg.package.key);
  return V.planInstall(pkg, {
    foods: db.foods,
    supplements: db.supplements,
    fields: db.nutrientFields,
    installed: local?.row ?? pcRow ?? null,
    uuid: X.uuid,
    now: new Date(),
  });
}

async function openPackage(source) {
  const S = X.S;
  S.vendorBusy = true;
  X.rerender();
  try {
    const content = typeof source === "string" ? await fetchPackage(source) : await source.text();
    const pkg = V.parsePackage(content);
    S.vendorPlan = plan(pkg);
  } catch (e) {
    X.toast(e.message || "Das Paket konnte nicht gelesen werden.", true);
  }
  S.vendorBusy = false;
  X.rerender();
  window.scrollTo(0, 0);
}

async function fetchPackage(file) {
  if (!/^[A-Za-z0-9._-]+\.json$/.test(file)) throw new Error("Ungültiger Paketname.");
  const res = await fetch(`pakete/${file}`);
  if (!res.ok) throw new Error("Das Paket ist gerade nicht erreichbar. Bitte mit Internet erneut versuchen.");
  return res.text();
}

/** Wird ein Eintrag schon verwendet (Mahlzeiten, Rezepte, Supplement-Einnahmen am Handy)? */
function usedOnPhone(kind, id) {
  const S = X.S;
  if (kind === "food") {
    const local = S.food.local;
    return (
      Object.values(local.meals).some((m) => m.items.some((i) => i.food_id === id)) ||
      Object.values(local.recipes).some((r) => r.items.some((i) => i.food_id === id))
    );
  }
  return Object.values(SP.normSupp(S.supp).items).some((e) => e.row.supplement_id === id);
}

async function persist() {
  try {
    await X.store.set("supp", X.S.supp);
    await X.store.set("nutrition", X.S.food.local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

export const vendorActions = {
  "vendor-open": () => {
    X.S.vendorPlan = null;
    X.go("vendor");
  },
  "vendor-pick": (el) => openPackage(el.dataset.arg),
  "vendor-cancel": () => {
    X.S.vendorPlan = null;
    X.rerender();
  },
  "vendor-install": async () => {
    const S = X.S;
    const p = S.vendorPlan;
    if (!p) return;
    S.supp = SP.normSupp(S.supp);
    const pcRow = (S.catalog?.pc?.vendor_package ?? []).find((r) => r.package_key === p.package.key);
    V.applyInstall(p, S.food.local, S.supp, { uuid: X.uuid, now: new Date(), pcPackage: pcRow ?? null });
    await persist();
    S.vendorPlan = null;
    X.toast(`${p.package.manufacturer}: ${n(p.foods.added)} Lebensmittel und ${n(p.supplements.added)} Supplements installiert.`);
    X.rerender();
  },
  "vendor-remove": async (el) => {
    const S = X.S;
    const key = el.dataset.arg;
    if (!X.confirmTwice(el, "Nochmal tippen: zurücknehmen")) return;
    S.supp = SP.normSupp(S.supp);
    const r = V.removeLocalPackage(key, S.food.local, S.supp, usedOnPhone);
    await persist();
    X.toast(r.kept ? `Zurückgenommen – ${n(r.kept)} schon verwendete Einträge bleiben.` : "Paket zurückgenommen.");
    X.rerender();
  },
};

/** Dateiauswahl; true = behandelt. */
export function vendorChange(el) {
  if (el.id !== "vendor-file") return false;
  const f = el.files?.[0];
  if (f) {
    if (f.size > V.MAX_BYTES) X.toast("Die Datei ist zu groß.", true);
    else openPackage(f);
  }
  el.value = "";
  return true;
}

