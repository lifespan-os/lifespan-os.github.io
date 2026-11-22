// LIFESPAN OS Mobil – Einrichtung für Konten am Handy (1.93.0, wie der Einrichtungs-Assistent am PC,
// `SetupCard.tsx` / `domain/onboarding.ts`): erste Schritte mit Fortschritt in der Overview, nur für
// Konten ohne PC (Startpaket). Erledigt ist ein Schritt, wenn die App ihn erkennt oder er von Hand
// abgehakt wurde. Stand je Konto in den Geräte-Einstellungen (`S.prefs.setup`).

import { X, buildDb } from "./diary.js";

const esc = (v) => X.esc(v);

export const PHONE_SETUP_STEPS = [
  { id: "profile", title: "Profil vervollständigen", text: "Größe, Geburtsdatum und Geschlecht – Grundlage für Bedarf und Referenzwerte.", go: ["settings"], label: "Zu Settings", auto: true },
  { id: "goals", title: "Tagesziele festlegen", text: "Kalorien, Makros, Schlaf und Schritte als eigene Ziele (optional).", go: ["goals"], label: "Zu den Tageszielen", auto: true },
  { id: "workout", title: "Erste Trainingseinheit erfassen", text: "Unter Training eine Einheit starten, Maschinen oder Übungen wählen, Sätze eintragen.", go: ["training"], label: "Zum Training", auto: true },
  { id: "meal", title: "Erste Mahlzeit eintragen", text: "Unter Nutrition Lebensmittel suchen oder scannen und Mengen eintragen.", go: ["food"], label: "Zur Ernährung", auto: true },
  { id: "home", title: "Zum Home-Bildschirm hinzufügen", text: "Im Browser „Teilen“ bzw. Menü → „Zum Home-Bildschirm“: Dann startet LIFESPAN OS wie eine App und funktioniert auch ohne Netz.", go: ["help"], label: "Hilfe öffnen", auto: true },
  { id: "backup", title: "Konto sichern", text: "Unter Import/Export „Ganzes Konto an den PC“ eine Kontodatei erstellen und sicher ablegen – deine Daten liegen nur auf diesem Handy.", go: ["transfer"], label: "Zu Import/Export", auto: false },
];

const standalone = () => {
  try {
    return window.matchMedia?.("(display-mode: standalone)")?.matches === true || navigator.standalone === true;
  } catch {
    return false;
  }
};

/** Was die App selbst erkennt. */
export function setupStatus(db) {
  const p = db.profile ?? null;
  const done = (X.S.workouts ?? []).some((w) => w.status === "done") || (db.workouts ?? []).length > 0;
  const meals = [...(db.mealsByDate?.values() ?? [])].some((list) => list.length > 0);
  return {
    profile: Boolean(p && p.height_cm && (p.birth_date || p.birth_year) && p.sex),
    goals: (db.goals ?? []).length > 0,
    workout: done,
    meal: meals,
    home: standalone(),
    backup: false,
  };
}

const state = () => {
  const s = X.S.prefs.setup ?? {};
  return { dismissed: s.dismissed === true, manual: Array.isArray(s.manual) ? s.manual.filter((m) => PHONE_SETUP_STEPS.some((x) => x.id === m)) : [] };
};

export function setupProgress(status, st) {
  const steps = PHONE_SETUP_STEPS.map((s) => ({ ...s, detected: Boolean(status[s.id]), done: Boolean(status[s.id]) || st.manual.includes(s.id) }));
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length, visible: !st.dismissed && done < steps.length };
}

/** Karte für die Overview (nur Konten ohne PC). */
export function setupCardHtml() {
  if (!X.S.catalog?.startpaket) return "";
  let db;
  try {
    db = buildDb();
  } catch {
    return "";
  }
  const p = setupProgress(setupStatus(db), state());
  if (!p.visible) return "";
  const pct = Math.round((p.done / p.total) * 100);
  return `<section class="card setup-card" aria-labelledby="setup-title">
    <div class="wo-head"><h3 id="setup-title">Erste Schritte</h3><span class="tag">${p.done} von ${p.total}</span></div>
    <div class="goal-bar" role="img" aria-label="${p.done} von ${p.total} Schritten erledigt"><span class="goal-bar__fill" style="width:${pct}%;background:var(--orange)"></span></div>
    <ol class="plain-list setup-steps">${p.steps
      .map(
        (s) => `<li class="setup-step${s.done ? " is-done" : ""}">
        <button class="setup-step__check" data-act="setup-toggle" data-arg="${s.id}" ${s.detected ? "disabled" : ""} aria-pressed="${s.done}" aria-label="${esc(`${s.title}: ${s.done ? "erledigt" : "offen"}`)}">${s.done ? "✓" : ""}</button>
        <span class="setup-step__text"><strong>${esc(s.title)}</strong><span class="muted small">${esc(s.text)}</span>${s.done ? "" : `<button class="linkbtn small" data-act="setup-go" data-arg="${s.go[0]}">${esc(s.label)}</button>`}</span>
      </li>`,
      )
      .join("")}</ol>
    <p class="card__note">Automatisch erkannte Schritte haken sich selbst ab; die übrigen tippst du an, wenn sie erledigt sind oder du sie nicht brauchst. <button class="linkbtn small" data-act="setup-dismiss">Ausblenden</button></p>
  </section>`;
}

async function saveSetup(next) {
  X.S.prefs.setup = next;
  await X.store.set("prefs", X.S.prefs);
}

export const setupActions = {
  "setup-toggle": async (el) => {
    const st = state();
    const id = el.dataset.arg;
    const manual = st.manual.includes(id) ? st.manual.filter((m) => m !== id) : [...st.manual, id];
    await saveSetup({ ...st, manual });
    X.rerender();
  },
  "setup-dismiss": async () => {
    await saveSetup({ ...state(), dismissed: true });
    X.toast("Ausgeblendet – unter Settings → Hilfe lässt sich die Liste wieder einblenden.");
    X.rerender();
  },
  "setup-show": async () => {
    await saveSetup({ ...state(), dismissed: false });
    X.toast("„Erste Schritte“ steht wieder in der Overview.");
    X.rerender();
  },
  "setup-go": (el) => X.go(el.dataset.arg),
};
