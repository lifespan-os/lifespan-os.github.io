// LIFESPAN OS Mobil – Zusatzinfos hinter dem Info-Symbol und Einleitung über „Pro“ (1.64.0).
// Gleiche Regeln wie am PC (`src/ui/cardInfo.ts`): Kleingedrucktes einer Karte (`.card__note`, Blöcke mit
// `.card-info`) wird ausgeblendet; neben der Überschrift steht ein kleines ⓘ. Antippen klappt die Texte
// an ihrer Stelle auf (Knöpfe und Links darin funktionieren wie bisher), erneutes Antippen schließt sie.
// Sichtbar bleiben `.card__note--keep` (echte Werte, eigene Notizen), Hinweise mit Eingabefeldern,
// Hinweise in aufklappbaren Unterbereichen (`<details>` in der Karte) und Karten ohne Überschrift.
// Einleitung: Antippen der Figur „Pro“ im Kopf zeigt bzw. verbirgt den Text zur Seite (`PAGE_INTROS`).

const NOTE_SELECTOR = ".card__note:not(.card__note--keep), .card-info";
const HEADING_SELECTOR = [
  ":scope > summary h3",
  ":scope > summary h2",
  ":scope > .wo-head h3",
  ":scope > .card__head h3",
  ":scope > header h3",
  ":scope > h2",
  ":scope > h3",
].join(", ");
const SKIP_SELECTOR = "details, dialog, [role='dialog']";
const INTERACTIVE = "input, select, textarea";
const HIDDEN = "is-in-info";
const BTN = "card-info__btn";

const ICON = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

/** Einleitung je Seite (Titel im Kopf), sinngemäß wie am PC. */
export const PAGE_INTROS = {
  Overview: "Der Tag auf einen Blick: Training, Ernährung, Schlaf, Regeneration, Körperwerte und deine Ziele – nur aus deinen erfassten Daten.",
  Checklisten: "To-dos für den Tag und deine Checklisten vom PC – dazu ein Überblick, welche Werte heute noch einzutragen sind.",
  Training: "Einheiten mit Übungen und Sätzen, Alltagsbewegung (NEAT), Trainingspläne sowie deine Übungs-, Maschinen- und Sportarten-Datenbank.",
  Nutrition: "Mahlzeiten, Lebensmittel mit Nährwerten, Supplements und deine Tagessummen.",
  Sleep: "Schlafzeiten, Schlafdauer, Schlafphasen, Nickerchen und deine eigene Einschätzung der Schlafqualität – ergänzt um die gemessenen Nächte deiner Uhr.",
  Recovery: "Deine tägliche Selbsteinschätzung (Erholung, Müdigkeit, Muskelkater, Stress) sowie die ANS-Werte (Ruhepuls, HRV, Atemfrequenz) – im Vergleich mit Schlaf und Trainingsbelastung.",
  "Body & Longevity": "Körpergewicht, Umfänge, Körperfett mit Messmethode, Vitalwerte und eigene Gesundheitsmarker – dazu langfristige Trends und Check-Ins.",
  Health: "Laborwerte mit Referenzbereichen, Verläufe mit Normbereich und markierten Ausreißern, Termine, dazu unter „Heart“ die Herzdaten deiner Uhr und unter „Blutzucker“ die Werte deines Sensors – alles lokal auf diesem Gerät.",
  Superhuman: "PEDs (Performance Enhancing Drugs), Medikamente und Peptide erfassen, protokollieren und auswerten; Hormongaben (HRT) mit Charge, Injektionsort und Präparat dokumentieren.",
  Insights: "Wochenrückblick und vorsichtige Beobachtungen – ausschließlich aus deinen tatsächlich erfassten Daten.",
  "iCoach.me": "Wissen für Training, Ernährung und Gesundheit: Module, Antworten auf deine Fragen und die Bücher „Die Masterclass“.",
  "Import/Export": "Daten vom PC laden und deine Einträge an den PC senden – der Austausch läuft nur über Dateien, die du selbst weitergibst.",
  Settings: "Profil, Tagesziele, Darstellung, Erinnerungen und weitere Einstellungen dieses Geräts.",
};

/** Figur „Pro“ als Knopf für den Kopf; leer, wenn es zur Seite keinen Text gibt. */
export function proButton(title, { hero = false } = {}) {
  const text = PAGE_INTROS[title];
  if (!text) return "";
  return `<button type="button" class="top__pro${hero ? " top__pro--hero" : ""}" data-pro aria-expanded="false" aria-controls="page-intro" aria-label="Pro: Worum geht es auf dieser Seite?"></button>`;
}

/** Einleitungstext unter dem Kopf (zunächst verborgen). */
export function introPanel(title) {
  const text = PAGE_INTROS[title];
  if (!text) return "";
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<div class="top__intro" id="page-intro" hidden><div class="wrap">${esc(text)}</div></div>`;
}

/** Hinweise einer Karte, die hinter das Info-Symbol wandern. */
export function infoNotesOf(card) {
  const result = [];
  card.querySelectorAll(NOTE_SELECTOR).forEach((el) => {
    if (el.closest(".card") !== card) return;
    const skip = el.closest(SKIP_SELECTOR);
    if (skip && skip !== card && card.contains(skip)) return;
    if (el.querySelector(INTERACTIVE)) return;
    if (result.some((r) => r.contains(el))) return;
    result.push(el);
  });
  return result;
}

/** Karten unter `root` mit Info-Symbol versehen (nach jedem Neuzeichnen aufrufen). */
export function enhanceInfo(root) {
  if (!root) return;
  const keep = new Set();
  root.querySelectorAll(".card").forEach((card) => {
    const heading = card.querySelector(HEADING_SELECTOR);
    const notes = heading ? infoNotesOf(card) : [];
    let button = heading?.querySelector(`:scope > .${BTN}`) ?? null;
    if (!heading || notes.length === 0) {
      button?.remove();
      return;
    }
    notes.forEach((n) => {
      keep.add(n);
      if (!n.classList.contains(HIDDEN)) n.classList.add(HIDDEN);
    });
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = BTN;
      button.setAttribute("aria-expanded", String(card.classList.contains("info-open")));
      button.setAttribute("aria-label", `Zusatzinformationen zu ${heading.textContent.trim()}`);
      button.innerHTML = ICON;
      heading.append(button);
    }
  });
  root.querySelectorAll(`.${HIDDEN}`).forEach((el) => {
    if (!keep.has(el)) el.classList.remove(HIDDEN);
  });
}

let started = false;

/** Beobachtet `root` (Neuzeichnen) und bedient Info-Symbole und „Pro“. Einmal beim Start aufrufen. */
export function initInfoNotes(root) {
  if (started || !root) return;
  started = true;
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      enhanceInfo(root);
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  enhanceInfo(root);

  // Vor den übrigen Klick-Handlern der App: Info-Symbol in einer <summary> soll die Karte nicht zuklappen
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const btn = target?.closest(`.${BTN}`);
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const card = btn.closest(".card");
        const open = !card.classList.contains("info-open");
        card.classList.toggle("info-open", open);
        btn.setAttribute("aria-expanded", String(open));
        if (open && card.tagName === "DETAILS" && !card.open) card.open = true;
        return;
      }
      const pro = target?.closest("[data-pro]");
      if (pro) {
        e.preventDefault();
        e.stopPropagation();
        const panel = document.getElementById("page-intro");
        if (!panel) return;
        const open = panel.hidden;
        panel.hidden = !open;
        pro.setAttribute("aria-expanded", String(open));
      }
    },
    true,
  );
}
