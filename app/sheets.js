// LIFESPAN OS Mobil – Fächer von unten (Reiter, Auswahlgruppen, Module) in `#sheet-root` (aus app.js, 1.74.0).
import { app, esc, S } from "./appbase.js";

/**
 * Alle Auswahlmenüs öffnen sich als Fach von unten (1.23.0, überall seit 1.31.0):
 * - Reiter eines Bereichs (`nav.tabs`): oranger Knopf mit dem gewählten Reiter, Fach mit allen Reitern,
 * - Auswahlgruppen mit `data-sheet="Titel"` (z. B. Kategorien, Checklisten): gleich wie Reiter,
 * - Inhalte mit `data-sheet-panel="Titel"` und `data-close="aktion|arg"` (z. B. ein geöffnetes Modul).
 * Das Fach liegt in `#sheet-root` direkt im Body – kein Eltern-Element (Kopf mit Schrägschnitt,
 * Karten, Scrollbereiche) kann es abschneiden oder überdecken. Offen/zu je Schlüssel in `S.tabsOpen`.
 */
export const sheetRoot = document.createElement("div");

sheetRoot.id = "sheet-root";

document.body.appendChild(sheetRoot);

export const CLOSE_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>`;

export function sheetToggle(key, label) {
  const open = Boolean(S.tabsOpen?.[key]);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "tabs__toggle";
  toggle.dataset.act = "tabs-fold";
  toggle.dataset.arg = key;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-haspopup", "dialog");
  toggle.title = "Auswahl öffnen";
  toggle.innerHTML = `<span class="tabs__chevron" aria-hidden="true">${open ? "▴" : "▸"}</span><span class="tabs__current">${esc(label)}</span>`;
  return toggle;
}

/** Fach mit Kopf (Titel, ✕) und Inhalt in `#sheet-root` zeigen. `closeAct` = "aktion|arg". */
export function showSheet(title, body, closeAct, { grid = true } = {}) {
  const [act, arg = ""] = closeAct.split("|");
  const backdrop = document.createElement("div");
  backdrop.className = "bsheet__backdrop";
  backdrop.dataset.act = act;
  backdrop.dataset.arg = arg;
  const panel = document.createElement("div");
  panel.className = `bsheet__panel${grid ? " bsheet__panel--grid" : ""}`;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", title);
  const head = document.createElement("div");
  head.className = "tabs__sheet-head";
  head.innerHTML = `<b>${esc(title)}</b><button type="button" class="tabs__close" data-act="${esc(act)}" data-arg="${esc(arg)}" aria-label="Schließen">${CLOSE_ICON}</button>`;
  panel.append(head, ...(Array.isArray(body) ? body : [body]));
  sheetRoot.replaceChildren(backdrop, panel);
  document.body.classList.add("sheet-open");
}

export const ACTIVE_SEL = ".active,.on,.is-active,[aria-pressed=true],[aria-selected=true],[aria-current=page]";

export let jumpTargets = [];

/** Überschrift einer Karte ohne das orange „/“. */
export const headingText = (h) => h.textContent.replace(/^\s*\/\s*/, "").replace(/\s+/g, " ").trim();

export function foldTabs() {
  document.body.classList.remove("sheet-open");
  sheetRoot.replaceChildren();
  S.subMenu = null;
  let shown = false;
  const groups = [];
  const menu = (host, key, title, items) => {
    if (!items.length) return;
    const active = items.find((b) => b.matches(ACTIVE_SEL)) ?? null;
    groups.push({ key, title, items, active });
    const toggle = sheetToggle(key, active ? active.textContent.trim() : title);
    host.classList.add("tabs--fold");
    host.replaceChildren(toggle);
    if (!S.tabsOpen?.[key] || shown) return;
    shown = true;
    for (const b of items) {
      b.classList.add("tab");
      b.classList.toggle("active", b === active);
      b.dataset.sheetKey = key;
    }
    showSheet(title, items, `tabs-fold|${key}`);
  };
  for (const nav of app.querySelectorAll("nav.tabs")) {
    const key = nav.getAttribute("aria-label") || "tabs";
    menu(nav, key, key, [...nav.querySelectorAll(".tab")]);
  }
  for (const group of app.querySelectorAll("[data-sheet]")) {
    const title = group.dataset.sheet;
    menu(group, `sheet:${title}`, title, [...group.querySelectorAll("button")]);
  }

  // Untermenü der Seite (1.32.0, für alle Seiten seit 1.33.0): Knopf mit zwei Punkten unten in der Leiste.
  // Enthält alle Auswahlmenüs der Seite (Reiter, Kategorien, Checklisten …); ohne solche die Abschnitte
  // der Seite zum Hinspringen.
  jumpTargets = [];
  if (!groups.length) {
    const heads = [...app.querySelectorAll("main .card h3, main .card h2, main > h2")].filter((h) => headingText(h) && h.offsetParent !== null);
    if (heads.length >= 2) {
      jumpTargets = heads;
      const items = heads.map((h, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.act = "sheet-jump";
        b.dataset.arg = String(i);
        b.textContent = headingText(h);
        return b;
      });
      groups.push({ key: "page", title: "Abschnitte", items, active: null, jump: true });
    }
  }
  if (groups.length) {
    const first = groups[0];
    // Oranger Punkt am Knopf (1.109.0), wenn ein Reiter darin offene Punkte für heute hat
    const mark = groups.some((g) => g.items.some((b) => b.querySelector(".tab__dot")));
    S.subMenu = { key: "page", label: first.jump ? "Abschnitte" : first.active?.textContent.trim() || first.title, open: Boolean(S.tabsOpen?.page), mark };
  }
  if (S.tabsOpen?.page && !shown && groups.length) {
    shown = true;
    const body = [];
    for (const g of groups) {
      if (groups.length > 1) {
        const h = document.createElement("p");
        h.className = "bsheet__group";
        h.textContent = g.title;
        body.push(h);
      }
      const grid = document.createElement("div");
      grid.className = "bsheet__grid";
      for (const b of g.items) {
        b.classList.add("tab");
        b.classList.toggle("active", b === g.active);
        b.dataset.sheetKey = "page";
        grid.append(b);
      }
      body.push(grid);
    }
    const title = groups[0].jump ? "Abschnitte" : groups[0].title;
    showSheet(title.startsWith("sheet:") ? title.slice(6) : title, body, "tabs-fold|page", { grid: false });
  }

  // Geöffnete Inhalte (z. B. ein Modul) als Fach von unten
  const panel = app.querySelector("[data-sheet-panel]");
  if (panel && !shown) {
    const title = panel.dataset.sheetPanel;
    panel.removeAttribute("data-sheet-panel");
    panel.remove();
    panel.classList.add("bsheet__content");
    showSheet(title, panel, panel.dataset.close || "tabs-fold|", { grid: false });
  }
}
