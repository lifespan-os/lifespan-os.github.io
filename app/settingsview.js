// LIFESPAN OS Mobil – Settings wie am PC (1.47.0): Bestandsaufnahme der PC-Einstellungen und Anzeige der
// Werte aus der Exportdatei. Bearbeitbar am Handy sind die Teile, deren Rückweg zum PC sauber geht
// (Tagesziele, Koffein-Widget, untere Leiste); die übrigen zeigt die App so, wie sie am PC gesetzt sind.

import * as D from "./pcdomain.js";
import * as N from "./nutrition.js";

const TOPIC_LABEL = {
  weight: "Gewicht",
  composition: "Körperzusammensetzung",
  circumference: "Umfänge",
  vital: "Vitalwerte",
  fitness: "Fitness & Longevity",
  grip: "Griffkraft",
  sleep: "Schlaf",
};

const LAYOUTS = [
  ["ui.overview_layout", "Overview"],
  ["ui.diary_layout", "Nutrition → Tagebuch"],
  ["ui.sleep_layout", "Sleep"],
  ["ui.recovery_layout", "Recovery"],
  ["ui.transfer_layout", "Import/Export"],
  ["ui.insights_layout", "Insights"],
];

/**
 * Bestandsaufnahme: PC-Bereich → am Handy. „bearbeiten“ = hier änderbar, „ansehen“ = Stand vom PC,
 * „nur PC“ = gehört zum PC (Dateien, Fenster, Verbindungen).
 */
export const INVENTORY = [
  ["Profil", "ansehen", "Name, Größe, Geburtsjahr, Geschlecht – Änderungen am PC (Settings → Profil)."],
  ["Benutzer", "nur PC", "Benutzer anlegen und wechseln betrifft die Datenbank am PC; am Handy gibt es Konten."],
  ["Tagesziele", "bearbeiten", "Wie am PC; geht mit „An den PC senden“ zurück."],
  ["Wochenziele", "ansehen", "Einheiten, Cardio, Protein-Tage, Schlaf je Woche."],
  ["Mahlzeiten", "ansehen", "Namen, abgewählte und eigene Mahlzeiten; das Tagebuch am Handy richtet sich danach."],
  ["Messmethoden", "ansehen", "Methoden je Thema (z. B. Waage, Polar)."],
  ["Darstellung, Tageswechsel", "nur PC", "Gilt je Gerät; das Handy folgt der Systemeinstellung."],
  ["Erinnerungen, Schnellerfassung", "nur PC", "Fenster und Tastenkürzel am PC."],
  ["Seiten anpassen", "ansehen", "Anordnung der Karten wie am PC (Overview, Tagebuch, Sleep, Recovery, Import/Export, Insights)."],
  ["Koffein-Widget", "bearbeiten", "Einschlafzeit und Halbwertszeit unter iCoach.me → Widgets."],
  ["Updates, Fehler melden, Systemstatus", "nur PC", "Programm und Logdateien am PC."],
  ["Secret Protocols", "ansehen", "Schalter vom PC (Bereich Superhuman)."],
  ["Import/Export, Polar, Speicherorte", "nur PC", "Am Handy unter Import/Export: senden, Exportdatei laden, Pakete."],
];

const json = (raw) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** Karte „Einstellungen vom PC“ für die Settings-Seite. `db` aus buildDb(), `esc` zum Maskieren. */
export function pcSettingsHtml(db, esc, caffeine) {
  const p = db.profile;
  const get = (k) => db.settings.get(k) ?? null;
  const meals = N.getMealConfig();
  const mealRows = ["breakfast", "lunch", "snack", "dinner"]
    .map((t) => `<li>${esc(N.mealLabel(t))}${meals.hidden.includes(t) ? ` <span class="muted small">(abgewählt)</span>` : ""}</li>`)
    .concat(meals.extras.map((n) => `<li>${esc(n)} <span class="muted small">(eigene)</span></li>`))
    .join("");
  const wg = D.dashboard.parseWeekGoals(get(D.dashboard.WEEK_GOALS_KEY));
  const wgRows = [
    ["Einheiten je Woche", wg.trainings, ""],
    ["Cardio je Woche", wg.cardioMin, " min"],
    ["Tage mit Proteinziel", wg.proteinDays, ""],
    ["Ø Schlaf je Nacht", wg.sleepMin === null ? null : D.formatDuration(wg.sleepMin), ""],
  ]
    .map(([l, v, u]) => `<li>${esc(l)}: <strong>${v === null ? "nicht eingetragen" : esc(`${v}${u}`)}</strong></li>`)
    .join("");
  const methods = json(get("measurement_methods")) ?? {};
  const methodRows = Object.entries(TOPIC_LABEL)
    .filter(([k]) => Array.isArray(methods[k]) && methods[k].length)
    .map(([k, l]) => `<li>${esc(l)}: ${esc(methods[k].join(", "))}</li>`)
    .join("");
  const layouts = LAYOUTS.filter(([k]) => get(k)).map(([, l]) => l);
  const secret = String(get("secret_protocols") ?? "") === "1";
  const tag = (s) => `<span class="tag ${s === "bearbeiten" ? "tag--ok" : ""}">${esc(s)}</span>`;
  return `<section class="card">
      <h3>Einstellungen vom PC</h3>
      <p class="muted small">Stand der Exportdatei vom PC. Was hier „ansehen“ heißt, änderst du am PC unter Settings – mit der nächsten Exportdatei ist es auch am Handy da.</p>
      <h4 class="logs-sub">Profil</h4>
      ${p ? `<ul class="plain-list small"><li>${esc(p.name)}</li><li>Größe ${esc(D.formatNumber(p.height_cm, 0))} cm · Geburtsjahr ${esc(String(p.birth_year))}${p.sex ? ` · ${p.sex === "female" ? "weiblich" : "männlich"}` : ""}</li></ul>` : `<p class="muted small">Kein Profil in der Exportdatei.</p>`}
      <h4 class="logs-sub">Mahlzeiten</h4>
      <ul class="plain-list small">${mealRows}</ul>
      <h4 class="logs-sub">Wochenziele</h4>
      <ul class="plain-list small">${wgRows}</ul>
      <h4 class="logs-sub">Messmethoden</h4>
      ${methodRows ? `<ul class="plain-list small">${methodRows}</ul>` : `<p class="muted small">Keine eigenen Methoden eingetragen.</p>`}
      <h4 class="logs-sub">Seiten angepasst</h4>
      <p class="small">${layouts.length ? esc(layouts.join(", ")) : "Keine – Standardanordnung."}</p>
      <h4 class="logs-sub">Koffein-Widget</h4>
      <p class="small">Einschlafzeit ${esc(caffeine.bedtime)} Uhr · Halbwertszeit ${esc(D.formatNumber(caffeine.halfLifeH, caffeine.halfLifeH % 1 === 0 ? 0 : 1))} h</p>
      <h4 class="logs-sub">Secret Protocols</h4>
      <p class="small">${secret ? "eingeschaltet" : "ausgeschaltet"}</p>
    </section>
    <section class="card">
      <h3>Was am Handy geht</h3>
      <ul class="list">${INVENTORY.map(([name, mode, note]) => `<li class="meal-item"><span><b>${esc(name)}</b><br><span class="muted small">${esc(note)}</span></span>${tag(mode)}</li>`).join("")}</ul>
    </section>`;
}
