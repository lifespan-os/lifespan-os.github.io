// LIFESPAN OS Mobil – Seiten anpassen (1.48.0): Karten einer Seite in der Anordnung wie am PC
// (`ui.*_layout`, `arrange` aus pcdomain.js); im Bearbeiten-Modus eine Liste zum Umsortieren und
// Ausblenden. Speichern übernimmt settingsview.js (`layout-move`, `layoutChange`).

import * as D from "./pcdomain.js";

/** Seiten mit „Seite anpassen“ (Einstellung, Ansicht am Handy, Name). */
export const LAYOUT_PAGES = [
  ["ui.overview_layout", "home", "Overview"],
  ["ui.diary_layout", "diary", "Nutrition → Tagebuch"],
  ["ui.sleep_layout", "sleep", "Sleep"],
  ["ui.recovery_layout", "recovery", "Recovery"],
  ["ui.insights_layout", "insights", "Insights"],
  ["ui.transfer_layout", "transfer", "Import/Export"],
];

let editing = null;

/** Seite im Bearbeiten-Modus (Schlüssel) oder `null`. */
export const layoutEditing = () => editing;
export function setLayoutEditing(key) {
  editing = key;
}

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Karten einer Seite anordnen. Im Bearbeiten-Modus (`setLayoutEditing`) erscheint
 * statt der Karten eine Liste zum Umsortieren und Ausblenden. Sonst wie `arrange` vom PC.
 * `cards` = [{ id, node, empty? }].
 */
export function arrangeCards(db, key, cards, { emptyLast } = {}) {
  const layout = D.parseLayout(db.settings.get(key) ?? null);
  if (editing === key) return [{ id: "__layout", node: layoutEditorHtml(key, cards, layout) }];
  return D.arrange(cards, emptyLast === undefined ? layout : { ...layout, emptyLast });
}

/** Überschrift einer Karte (erste h2/h3) als Text. */
function titleOf(node, id) {
  const m = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/.exec(String(node ?? ""));
  const t = m ? m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim() : "";
  return t || id;
}

function layoutEditorHtml(key, cards, layout) {
  const page = LAYOUT_PAGES.find(([k]) => k === key)?.[2] ?? "Seite";
  const ids = D.arrange(cards, { ...layout, hidden: [], emptyLast: false }).map((c) => c.id);
  const rows = ids
    .map((id, i) => {
      const c = cards.find((x) => x.id === id);
      const hidden = layout.hidden.includes(id);
      return `<li class="set-order ${hidden ? "is-hidden" : ""}">
        <label class="toggle"><input type="checkbox" data-layout-show="${esc(key)}|${esc(id)}" ${hidden ? "" : "checked"}> <span>${esc(titleOf(c?.node, id))}</span></label>
        <span class="row-actions"><button class="btn sm ghost" data-act="layout-move" data-arg="${esc(key)}|${esc(id)}|-1" ${i === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button><button class="btn sm ghost" data-act="layout-move" data-arg="${esc(key)}|${esc(id)}|1" ${i === ids.length - 1 ? "disabled" : ""} aria-label="Nach unten">↓</button></span>
      </li>`;
    })
    .join("");
  return `<section class="card hl" id="layout-editor">
    <div class="wo-head"><h3>${esc(page)} anpassen</h3><span class="tag">${ids.length} Karten</span></div>
    <p class="muted small">Haken = Karte wird angezeigt. Mit ↑ ↓ die Reihenfolge ändern. Gilt auch am PC (geht mit „An den PC senden“ zurück). Karten, die es nur am PC gibt, behalten dort ihren Platz.</p>
    <ul class="set-list">${rows}</ul>
    <div class="row-actions">
      <button class="btn primary" data-act="layout-done">Fertig</button>
      ${layout.order.length || layout.hidden.length ? `<button class="btn ghost" data-act="layout-reset" data-arg="${esc(key)}">Standard</button>` : ""}
    </div>
  </section>`;
}

