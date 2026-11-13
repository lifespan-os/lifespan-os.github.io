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
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  menu: svg('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'),
};

/**
 * Bereiche wie am PC (src/ui/routes.ts). `view`: Startansicht am Handy; `views`: Ansichten, die zum
 * Bereich gehören (für die Markierung im Menü); ohne `view` → Hinweis „nur am PC“ mit `pc`.
 */
export const SECTIONS = [
  { id: "overview", label: "Overview", view: "home", views: ["home"] },
  { id: "checklists", label: "Checklisten", pc: "Tagesplan, Checklisten, Erinnerungen und To-dos." },
  {
    id: "training",
    label: "Training",
    view: "training",
    views: ["training", "plans", "workout", "picker", "machine", "finish", "detail"],
  },
  { id: "nutrition", label: "Nutrition", view: "diary", views: ["diary", "food-history", "food", "food-review", "dish"] },
  { id: "sleep", label: "Sleep", pc: "Schlaf erfassen, Schlafphasen, Verlauf und Auswertung." },
  { id: "recovery", label: "Recovery", pc: "Regeneration, HRV, Ruhepuls und Erholungsmaßnahmen." },
  { id: "body", label: "Body & Longevity", view: "body", views: ["body", "body-metric", "body-entry"] },
  { id: "health", label: "Health", pc: "Blutwerte, Laborimport, Verläufe, Arztbericht und Lebenszeit." },
  { id: "superhuman", label: "Superhuman", pc: "HRT, Hormonspiegel, Dosisrechner und Checklisten." },
  { id: "insights", label: "Insights", pc: "Beobachtungen, Wochenanalyse, mögliche Zusammenhänge und Bericht." },
  { id: "icoach", label: "iCoach.me", pc: "Fragen, Evolve, Magazin, Downloads und Widgets." },
  { id: "settings", label: "Settings", view: "settings", views: ["settings", "send", "help"] },
];

export const icon = (name) => ICONS[name] ?? "";

/** Bereich einer Ansicht (für die Markierung im Menü). */
export function sectionOf(view, arg) {
  if (view === "pc-only") return arg;
  return SECTIONS.find((s) => s.views?.includes(view))?.id ?? "overview";
}

/** Menü (Schublade von links). */
export function drawerHtml({ view, arg, open, esc }) {
  const current = sectionOf(view, arg);
  return `<div class="drawer-backdrop ${open ? "open" : ""}" data-act="menu-close"></div>
  <nav class="drawer ${open ? "open" : ""}" aria-label="Hauptmenü" ${open ? "" : 'aria-hidden="true" inert'}>
    <div class="drawer__brand"><img src="icons/icon-192.png" alt=""><div><b>LIFESPAN OS</b><small>Mobil</small></div></div>
    <ul>
      ${SECTIONS.map(
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
