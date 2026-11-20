// LIFESPAN OS Mobil – Open Food Facts herunterladen, mit durchsuchen und Produkte übernehmen (1.58.0).
// Die Liste liegt einmal je Gerät (für alle Konten) im Speicher „global:off“, wie der BLS.
// Ein Treffer füllt das Formular „Neues Lebensmittel“ – der Nutzer prüft und ändert die Werte,
// erst „Als Lebensmittel speichern“ legt ein normales eigenes Lebensmittel an (mit Strichcode).

import * as O from "./off.js";
import * as N from "./nutrition.js";

let X = null; // { S, esc, header, toast, store, rerender, go, confirmTwice }

export function initOff(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const fmt = (v, d = 1) => (v === null || v === undefined ? "–" : Number(v).toLocaleString("de-DE", { maximumFractionDigits: d }));

/** Beim Start: nur die kleine Kennung lesen (die Daten selbst erst bei Bedarf). */
export async function offBoot() {
  X.S.offInfo = (await X.store.getGlobal("offInfo").catch(() => null)) ?? null;
}

let loading = null;
/** Liste aus dem Gerätespeicher holen und prüfen (einmal je Sitzung); danach neu zeichnen. */
export function ensureOff({ rerender = true } = {}) {
  const S = X.S;
  if (S.off || !S.offInfo) return S.off ?? null;
  if (!loading) {
    loading = X.store
      .getGlobal("off")
      .then((text) => {
        S.off = text ? O.prepare(text) : null;
        if (!text) S.offInfo = null;
      })
      .catch(() => {
        S.off = null;
      })
      .finally(() => {
        loading = null;
        if (rerender) X.rerender();
      });
  }
  return null;
}

/** Wartet, bis die Liste bereit ist (oder null, wenn sie nicht gespeichert ist). */
export async function offReady() {
  const S = X.S;
  if (!S.offInfo) return null;
  if (S.off) return S.off;
  ensureOff({ rerender: false });
  if (loading) await loading;
  return S.off ?? null;
}

const kcalNote = (p) => {
  const d = O.kcalDeviation(p);
  return d === null ? "" : ` · kcal ↔ Makros ${d > 0 ? "+" : ""}${d} %`;
};

function hitHtml(p, act) {
  const meta = [p.brand, p.quantity, `EAN ${p.code}`].filter(Boolean).map(esc).join(" · ");
  return `<button class="item" data-act="off-use" data-arg="${esc(p.code)}|${esc(act)}"><span class="main"><b>${esc(p.name)}</b>
      <span class="muted small">${meta}</span>
      <span class="muted small">${fmt(p.energyKcal, 0)} kcal · E ${fmt(p.proteinG)} g · KH ${fmt(p.carbsG)} g · F ${fmt(p.fatG)} g je 100 ${esc(p.basisUnit)}${kcalNote(p)}</span></span><span class="chev">›</span></button>`;
}

/**
 * Treffer aus Open Food Facts unter den eigenen Lebensmitteln (und BLS). Schon übernommene
 * Produkte (gleicher Strichcode bei den eigenen Lebensmitteln) werden nicht noch einmal gezeigt.
 */
export function offResultsHtml(query, act) {
  const q = String(query ?? "").trim();
  if (!X.S.offInfo || q.length < 2) return "";
  const c = ensureOff();
  if (!c) return `<p class="muted small">Open Food Facts wird geladen …</p>`;
  const own = (code) => N.foodByBarcode(X.S.catalog, X.S.food.local, code);
  const hits = O.searchOff(c, q, 15).filter((p) => !own(p.code));
  if (!hits.length) return "";
  return `<p class="list-head small"><b>Open Food Facts</b> <span class="muted">– Tippen öffnet das Formular: prüfen, ändern, speichern</span></p>${hits
    .map((p) => hitHtml(p, act))
    .join("")}`;
}

/** Settings-Karte (Import/Export, neben BLS 4.0). */
export function offCard() {
  const S = X.S;
  const info = S.offInfo;
  return `<section class="card">
    <h3>Open Food Facts</h3>
    <p class="small"><b>Markenprodukte</b> aus Supermärkten in Deutschland und Österreich</p>
    ${
      info
        ? `<p class="small">${fmt(info.products, 0)} geprüfte Produkte – auf diesem Gerät gespeichert (für alle Konten). Sie erscheinen bei der Lebensmittelsuche und beim Scannen (Strichcode).</p>
          <button class="btn block" data-act="off-download" ${S.offBusy ? "disabled" : ""}>${S.offBusy ? "Wird geladen …" : "Neu herunterladen"}</button>
          <button class="btn block ghost danger" data-act="off-remove">Vom Gerät entfernen</button>`
        : `<p class="muted small card-info">Optional: rund 240.000 Markenprodukte mit Nährwerten je 100 g/ml. Übernommen werden nur geprüfte Produkte (Pflichtwerte vorhanden, kcal höchstens 15 % neben der Rechnung aus den Makros). Download ca. 10 MB, auf dem Gerät ca. 25 MB. Vor dem Speichern lässt sich jedes Produkt bearbeiten; danach ist es ein normales eigenes Lebensmittel.</p>
          <button class="btn block" data-act="off-download" ${S.offBusy ? "disabled" : ""}>${S.offBusy ? "Wird geladen …" : "Open Food Facts herunterladen"}</button>`
    }
    <p class="card__note bls-source">${esc(O.OFF_LICENSE_NOTE)}, Inhalte Database Contents License (DbCL).</p>
  </section>`;
}

/** Datei laden: gepackt (gzip) oder – falls der Server schon entpackt hat – als Text. */
async function download() {
  const res = await fetch(O.OFF_FILE, { cache: "no-cache" });
  if (!res.ok) throw new Error("Open Food Facts ist gerade nicht erreichbar. Bitte mit Internet erneut versuchen.");
  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined") throw new Error("Dieses Gerät kann die gepackte Datei nicht entpacken (iOS 16.4 oder neuer nötig).");
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }
  return new TextDecoder("utf-8").decode(buf);
}

/** Produkt ins Formular „Neues Lebensmittel“ übernehmen (alle Felder bearbeitbar). */
export function openOffForm(p, status) {
  const s = X.S.food;
  s.selected = null;
  s.known = false;
  s.scan = null;
  s.form = O.offToForm(p, N.emptyForm());
  s.offHint = true;
  s.errors = {};
  s.status = status ?? `Aus Open Food Facts: „${p.name}“. Bitte mit der Packung vergleichen, bei Bedarf ändern und speichern.`;
}

export const offActions = {
  "off-download": async () => {
    const S = X.S;
    if (S.offBusy) return;
    S.offBusy = true;
    X.rerender();
    try {
      const text = await download();
      const c = O.prepare(text);
      if (!O.count(c)) throw new Error("Die Datei enthält keine gültigen Produkte.");
      await X.store.setGlobal("off", text);
      S.offInfo = { products: O.count(c), skipped: c.skipped, at: new Date().toISOString() };
      await X.store.setGlobal("offInfo", S.offInfo);
      S.off = c;
      X.toast(`Open Food Facts gespeichert: ${fmt(O.count(c), 0)} Produkte.`);
    } catch (e) {
      X.toast(e.message || "Download fehlgeschlagen.", true);
    }
    S.offBusy = false;
    X.rerender();
  },
  "off-remove": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: entfernen")) return;
    const S = X.S;
    await X.store.setGlobal("off", null);
    await X.store.setGlobal("offInfo", null);
    S.off = null;
    S.offInfo = null;
    X.toast("Open Food Facts vom Gerät entfernt. Schon übernommene Lebensmittel bleiben.");
    X.rerender();
  },
  "off-use": async (el) => {
    const [code] = el.dataset.arg.split("|");
    const c = await offReady();
    const p = c ? O.byCode(c, code) : null;
    if (!p) return X.toast("Produkt nicht gefunden.", true);
    X.S.food.query = "";
    openOffForm(p);
    if (X.S.view !== "food") X.go("food");
    else X.rerender();
    requestAnimationFrame(() => document.getElementById("food-form")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
};
