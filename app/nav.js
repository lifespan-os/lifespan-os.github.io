// LIFESPAN OS Mobil – Menü wie in der Desktop-App (1.4.0): gleiche Bereiche in gleicher
// Reihenfolge, am Handy als Menü, das von links hereinkommt. Bereiche ohne Handy-Funktion zeigen
// einen Hinweis („nur am PC“).

const svg = (paths) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  overview: svg('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
  checklists: svg('<path d="M3 6l2 2 4-4"/><path d="M3 14l2 2 4-4"/><path d="M13 6h8"/><path d="M13 14h8"/><path d="M13 20h8"/>'),
  training: svg('<path d="M6 7v10"/><path d="M18 7v10"/><path d="M3 9v6"/><path d="M21 9v6"/><path d="M6 12h12"/>'),
  nutrition: svg('<path d="M12 7c-1-3-4-4-6-3 0 3 2 5 6 5"/><path d="M12 9c4-1 7 2 7 6s-3 7-7 7-7-3-7-7 3-7 7-6"/>'),
  sleep: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  recovery: svg('<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><path d="M11 9l-2 3h4l-2 3"/>'),
  body: svg('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  health: svg('<path d="M6 3v6a6 6 0 0 0 12 0V3"/><path d="M12 15v2a4 4 0 0 0 8 0v-3"/><circle cx="20" cy="12" r="2"/>'),
  superhuman: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  insights: svg('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/>'),
  icoach: svg('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>'),
  transfer: svg('<path d="M7 4l-4 4 4 4"/><path d="M3 8h13"/><path d="M17 12l4 4-4 4"/><path d="M21 16H8"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  menu: svg('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'),
  more: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  // Untermenü (1.32.0): zwei Punkte
  sub: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="12" cy="7" r="2.6"/><circle cx="12" cy="17" r="2.6"/></svg>',
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
  water: svg('<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>'),
  coffee: svg('<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v3M12 3v3"/>'),
};

/**
 * Bereiche wie am PC (src/ui/routes.ts). `view`: Startansicht am Handy; `views`: Ansichten, die zum
 * Bereich gehören (für die Markierung im Menü); ohne `view` → Hinweis „nur am PC“ mit `pc`.
 */
export const SECTIONS = [
  { id: "overview", label: "Overview", view: "home", views: ["home"] },
  { id: "checklists", label: "Checklisten", view: "todos", views: ["todos", "checklist-edit"] },
  {
    id: "training",
    label: "Training",
    view: "training",
    views: ["training", "plans", "workout", "picker", "machine", "finish", "detail"],
  },
  { id: "nutrition", label: "Nutrition", view: "diary", views: ["diary", "food-history", "food", "food-review", "dish", "fast-entry", "meal-plan"] },
  { id: "sleep", label: "Sleep", view: "sleep", views: ["sleep"] },
  { id: "recovery", label: "Recovery", view: "recovery", views: ["recovery"] },
  { id: "body", label: "Body & Longevity", view: "body", views: ["body", "body-metric", "body-entry"] },
  { id: "health", label: "Health", view: "health", views: ["health", "lab-edit"] },
  { id: "superhuman", label: "Superhuman", view: "super", views: ["super", "hrt-edit", "protocol-edit", "substance-edit"] },
  { id: "insights", label: "Insights", view: "insights", views: ["insights"] },
  { id: "icoach", label: "iCoach.me", view: "icoach", views: ["icoach"] },
  { id: "settings", label: "Settings", view: "settings", views: ["settings", "help"] },
  // Import/Export (1.45.6): Knopf im Menükopf, nicht in der Liste der Bereiche
  { id: "transfer", label: "Import/Export", view: "transfer", views: ["transfer", "send", "pending", "vendor", "bls"], header: true },
];

export const icon = (name) => ICONS[name] ?? "";

// Ausgeblendete Bereiche (1.48.0): „Superhuman“ nur mit Secret Protocols, wie am PC
let hiddenSections = new Set();
export function setHiddenSections(ids) {
  hiddenSections = new Set(ids);
}
const shown = (s) => !hiddenSections.has(s.id);

/** Bereich einer Ansicht (für die Markierung im Menü). */
export function sectionOf(view, arg, back = null) {
  if (view === "pc-only") return arg;
  if (view === "log-edit") return back === "recovery" ? "recovery" : "sleep";
  return SECTIONS.find((s) => s.views?.includes(view))?.id ?? "overview";
}

/** Menü (Schublade von links). */
export function drawerHtml({ view, arg, open, esc, back = null }) {
  const current = sectionOf(view, arg, back);
  return `<div class="drawer-backdrop ${open ? "open" : ""}" data-act="menu-close"></div>
  <nav class="drawer ${open ? "open" : ""}" aria-label="Hauptmenü" ${open ? "" : 'aria-hidden="true" inert'}>
    <div class="drawer__brand"><img src="icons/icon-192.png" alt=""><div><b>LIFESPAN OS</b><small>Alle Bereiche</small></div>
      <button class="drawer__transfer ${current === "transfer" ? "active" : ""}" data-act="menu-go" data-arg="transfer" ${current === "transfer" ? 'aria-current="page"' : ""}>${icon("transfer")}<span>Import/Export</span></button>
      <button class="drawer__close" data-act="menu-close" aria-label="Menü schließen">${svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>')}</button></div>
    <ul>
      ${SECTIONS.filter((s) => !s.header && shown(s)).map(
        (s) => `<li><button class="drawer__item ${s.id === current ? "active" : ""} ${s.view ? "" : "pc-only"}" data-act="menu-go" data-arg="${s.id}" ${s.id === current ? 'aria-current="page"' : ""}>
          ${icon(s.id)}<span>${esc(s.label)}</span>${s.view ? "" : `<small>PC</small>`}</button></li>`,
      ).join("")}
    </ul>
  </nav>`;
}

/** Hinweis für Bereiche, die es bisher nur in der Desktop-App gibt. */
export function pcOnlyHtml(id, esc) {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) return "";
  return `<section class="card pc-only-card">
      <div class="pc-only-card__icon">${icon(s.id)}</div>
      <h3>${esc(s.label)} – nur am PC</h3>
      <p class="muted small">Diesen Bereich gibt es bisher nur in der Desktop-App: ${esc(s.pc)}</p>
      <p class="muted small">Er kommt nach und nach auch in die Handy-App. Deine Daten dazu bleiben am PC.</p>
      <button class="btn block" data-act="menu-go" data-arg="overview">Zur Overview</button>
    </section>`;
}

/** Untere Leiste (Design C, 1.21.0): Hauptbereiche mit einem Tipp, in der Mitte „+“ zum schnellen Erfassen. */
/** Plätze links und rechts vom „+“ (1.24.0): unter Settings frei wählbar, Standard Training und Nutrition. */
export const DEFAULT_BAR_SLOTS = ["training", "nutrition"];

/** Bereiche, die auf einen Platz der Leiste passen (alle mit Handy-Ansicht). */
export const barChoices = () => SECTIONS.filter((s) => s.view && !s.header && shown(s)).map((s) => ({ id: s.id, label: s.label }));

/** Gespeicherte Wahl prüfen: unbekannte Bereiche fallen auf den Standard zurück. */
export function barSlots(pref) {
  const ok = new Set(barChoices().map((c) => c.id));
  return DEFAULT_BAR_SLOTS.map((d, i) => (Array.isArray(pref) && ok.has(pref[i]) ? pref[i] : d));
}

const SHORT = { "Body & Longevity": "Body", "iCoach.me": "iCoach", Checklisten: "Checklisten" };

/**
 * Untere Leiste (1.34.0): vier Hauptpunkte gleich breit (Overview, zwei frei wählbare Bereiche, Mehr).
 * Die runden Knöpfe schweben mit ihrer Mitte auf der Oberkante der Leiste: „+“ (Schnell erfassen) zwischen
 * Punkt 1 und 2, „:“ (Untermenü der Seite, `sub` = { key, label, open }) zwischen Punkt 3 und 4.
 */
export function tabbarHtml({ view, arg, back = null, quickOpen = false, slots = DEFAULT_BAR_SLOTS, sub = null }) {
  const current = sectionOf(view, arg, back);
  const [left, right] = barSlots(slots);
  const sec = (id) => SECTIONS.find((s) => s.id === id);
  const items = [
    { id: "overview", label: "Overview", icon: "overview" },
    { id: left, label: SHORT[sec(left).label] ?? sec(left).label, icon: left },
    { id: right, label: SHORT[sec(right).label] ?? sec(right).label, icon: right },
    { id: "more", label: "Mehr", icon: "more" },
  ];
  const main = ["overview", left, right];
  let marked = false;
  const buttons = items
    .map((b) => {
      // Gleicher Bereich auf zwei Plätzen: nur der erste wird markiert
      const active = !marked && (b.id === "more" ? !main.includes(current) : b.id === current);
      if (active) marked = true;
      const act = b.id === "more" ? `data-act="menu-open-bar"` : `data-act="tabbar-go" data-arg="${b.id}"`;
      return `<button class="tabbar__item ${active ? "active" : ""}" ${act} ${active ? 'aria-current="page"' : ""}>${ICONS[b.icon] ?? ""}<span>${b.label}</span></button>`;
    })
    .join("");
  const quick = `<button class="tabbar__quick tabbar__fab tabbar__fab--a" data-act="quick-open" aria-label="Schnell erfassen" aria-expanded="${quickOpen}">${ICONS.plus}</button>`;
  const subBtn = sub
    ? `<button class="tabbar__quick tabbar__sub tabbar__fab tabbar__fab--b" data-act="tabs-fold" data-arg="${escAttr(sub.key)}" aria-label="Untermenü: ${escAttr(sub.label)}" aria-haspopup="dialog" aria-expanded="${Boolean(sub.open)}">${ICONS.sub}</button>`
    : "";
  return `<nav class="tabbar tabbar--float${sub ? " tabbar--sub" : ""}" aria-label="Hauptbereiche"><div class="tabbar__grid">${buttons}${quick}${subBtn}</div></nav>`;
}

const escAttr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Schnell erfassen: die häufigsten Einträge mit einem Tipp. */
export const QUICK = [
  { id: "meal", label: "Mahlzeit", icon: "nutrition" },
  { id: "water", label: "Wasser", icon: "water" },
  { id: "body", label: "Gewicht & Körperwerte", icon: "body" },
  { id: "checkin", label: "Check-In-Foto", icon: "camera" },
  { id: "training", label: "Training", icon: "training" },
  { id: "sleep", label: "Schlaf", icon: "sleep" },
  { id: "recovery", label: "Recovery", icon: "recovery" },
  { id: "todo", label: "To-do", icon: "checklists" },
  { id: "caffeine", label: "Koffein", icon: "coffee" },
];

/** `items` = Einträge in gewählter Reihenfolge (Settings → Schnellerfassung, 1.48.0). */
export function quickSheetHtml(open, items = QUICK) {
  return `<div class="quick-backdrop ${open ? "open" : ""}" data-act="quick-close"></div>
  <section class="quick-sheet ${open ? "open" : ""}" aria-label="Schnell erfassen" ${open ? "" : 'aria-hidden="true" inert'}>
    <h2 class="quick-sheet__title">Schnell erfassen</h2>
    <div class="quick-sheet__grid">${items.map(
      (q) => `<button class="quick-sheet__item" data-act="quick-go" data-arg="${q.id}">${ICONS[q.icon]}<span>${q.label}</span></button>`,
    ).join("")}</div>
    <button class="btn block" data-act="quick-close">Schließen</button>
  </section>`;
}
