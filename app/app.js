// LIFESPAN OS Mobil – Oberfläche. Logik in core.js, Speicher in store.js.
import * as C from "./core.js";
import * as store from "./store.js";
import * as N from "./nutrition.js";
import { foodActions, foodChange, foodInput, foodState, initFood, viewDish, viewFood, viewFoodReview } from "./food.js";
import { bodyActions, bodyChange, bodyInput, bodyLeave, bodyOpenEntry, bodyState, initBody, viewBody, viewBodyEntry, viewBodyMetric } from "./body.js";
import * as BD from "./bodydata.js";
import { QUICK, SECTIONS, barChoices, barSlots, drawerHtml, icon, pcOnlyHtml, quickSheetHtml, setHiddenSections, tabbarHtml } from "./nav.js";
import { focusInfo, machineNamesOf } from "./focusinfo.js";
import * as P from "./pcdb.js";
import * as PDOM from "./pcdomain.js";
import { buildDb, diaryActions, diaryChange, diaryInput, initDiary, today as todayIso, viewDiary, viewFastEntry, viewNutritionHistory, viewSuppIntake } from "./diary.js";
import * as FT from "./fastdata.js";
import * as SP from "./supplements.js";
import { initVendor, vendorActions, vendorChange, viewVendor } from "./vendorui.js";
import * as MI from "./machineimages.js";
import { catalogActions, catalogCard, catalogChange, initCatalog } from "./catalogui.js";
import { initGoals, goalActions, goalChange, viewGoals } from "./goalsui.js";
import * as GL from "./goals.js";
import * as AX from "./accountexport.js";
import { blsActions, blsBoot, blsCard, blsChange, blsInput, initBls, viewBls } from "./blsui.js";
import { initOff, offActions, offBoot, offCard } from "./offui.js";
import { initOverview, minutesSince, overviewActions, overviewCardsHtml, overviewChange, overviewHero, shiftOverviewDay } from "./overview.js";
import { initDaySwipe } from "./dayswipe.js";
import { initLogs, logsActions, logsChange, logsInput, viewLogEdit, viewRecovery, viewSleep } from "./logs.js";
import * as LG from "./logsdata.js";
import { initInsights, insightsActions, viewInsights } from "./insightsview.js";
import { initWeeklyReports, weeklyReportNoticeHtml, weeklyReportsActions } from "./weeklyreports.js";
import { initTodos, todoActions, todoChange, todoInput, viewChecklistEdit, viewTodos } from "./todos.js";
import * as TD from "./todosdata.js";
import { initHealth, healthActions, healthChange, healthInput, viewHealth, viewLabEdit } from "./health.js";
import * as HD from "./healthdata.js";
import { initSuper, superActions, superChange, superInput, viewSuper, viewHrtEdit, viewProtocolEdit, viewSubstanceEdit } from "./super.js";
import * as SD from "./superdata.js";
import * as CD from "./checklistdata.js";
import * as CF from "./caffeinedata.js";
import * as GLD from "./glucosedata.js";
import { caffeineSettings, icoachActions, icoachChange, icoachInput, initICoach, overviewCaffeine, viewICoach } from "./icoach.js";
import { initSettings, layoutActions, layoutChange, settingsActions, settingsChange, viewSettings } from "./settingsview.js";
import { LAYOUT_PAGES, layoutEditing, setLayoutEditing } from "./layoutedit.js";
import * as PS from "./pcsettings.js";
import * as DP from "./devprefs.js";
import { enhanceInfo, initInfoNotes, introPanel, proButton } from "./infonotes.js";
import { initTraining, trainingActions, trainingChange, trainingInput, viewTrainingSection, persistTrain, setNotice as trainSetNotice, failed as trainFailed } from "./training.js";
import { initTrainingStats } from "./trainingstats.js";
import { initTrainingDb, saveExerciseRow } from "./trainingdb.js";
import * as TR from "./trainingdata.js";
import * as PD from "./pending.js";
import * as HX from "./hyrox.js";
import * as GD from "./gymsdata.js";
import * as GY from "./gymsui.js";
import { extrasActions, initExtras, quickFillBanner, quickFillInput, viewMealPlan, viewQuickFill } from "./extras.js";

const app = document.getElementById("app");
// Maschinenbilder (1.67.0): Platzhalter <img data-mimg> nach jedem Zeichnen füllen
new MutationObserver(() => MI.hydrate(app)).observe(app, { childList: true, subtree: true });
initInfoNotes(app);
const restEl = document.getElementById("rest");
const toastEl = document.getElementById("toast");

const S = {
  catalog: null,
  accountId: "", // Konten (1.25.0): "" = Hauptkonto
  accounts: [],
  mainAccountName: null,
  accountForm: null,
  localExercises: [],
  workouts: [], // abgeschlossene Trainings vom Handy
  active: null, // laufendes Training
  prefs: DP.normPrefs({ onlyNumbered: true, keepUnticked: false }),
  pcsettings: PS.emptySync(), // Einstellungen für PC und Handy (1.48.0)
  view: "home",
  arg: null,
  query: "",
  rest: null, // { endsAt, total, label }
  pendingFinish: null,
  food: null, // Ernährung (siehe food.js)
};

// ------------------------------------------------------------------ Hilfen

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmtDate = (iso) => {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};
const fmtDateTime = (iso) => {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${fmtDate(C.localDate(d))}, ${C.localTime(d)} Uhr`;
};
const fmtSec = (s) => {
  const a = Math.max(0, Math.round(s));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
};

/** Meldung oben; mit `undo` (Funktion) zusätzlich ein Knopf „Rückgängig“ (1.55.0, 6 Sekunden). */
function toast(text, err = false, undo = null) {
  toastEl.textContent = text;
  toastEl.className = err ? "toast err" : "toast";
  if (typeof undo === "function") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast__undo";
    b.textContent = "Rückgängig";
    b.addEventListener("click", async () => {
      toastEl.hidden = true;
      clearTimeout(toast.t);
      try {
        await undo();
        toast("Rückgängig gemacht.");
      } catch (e) {
        toast(e.message || "Rückgängig ging nicht.", true);
      }
    });
    toastEl.append(" ", b);
  }
  toastEl.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (toastEl.hidden = true), err ? 5000 : undo ? 6000 : 2200);
}

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
async function saveNow() {
  clearTimeout(saveTimer);
  try {
    if (S.active) S.active.updatedAt = C.isoNow();
    await store.set("active", S.active);
    await store.set("workouts", S.workouts);
    await store.set("localExercises", S.localExercises);
    await store.set("prefs", S.prefs);
  } catch (e) {
    toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

/** Katalog vom PC plus Änderungen im Training am Handy (Pläne, Übungen, Sportarten, NEAT, Check-Ins). */
function refreshCatalog() {
  S.catalog = S.catalogRaw ? TR.overlayCatalog(S.catalogRaw, S.train, C.plansFromRows) : null;
}

const exById = () => new Map(C.allExercises(S.catalog, S.localExercises).map((e) => [e.id, e]));
const machineById = () => new Map(S.catalog.machines.map((m) => [m.id, m]));
const unsent = () => S.workouts.filter((w) => w.status === "done" && !w.exported);
const unsentFood = () => (S.food ? N.unsentCount(S.food.local) : 0) + P.unsentWater(S.water) + SP.unsentSupp(S.supp) + FT.unsentFast(S.fast);
// Körperwerte plus Schlaf und Regeneration (gehen zusammen in die Datei „Körperwerte“, 1.7.0)
const unsentBodyCount = () => (S.body ? BD.unsentBody(S.body.local) : 0) + LG.unsentLogs(S.logs) + TD.unsentTodos(S.todos) + HD.unsentHealth(S.health) + SD.unsentSuper(S.super) + CD.unsentChecklists(S.checklists) + CF.unsentCaffeine(S.caffeine) + GLD.unsentGlucose(S.glucose) + TR.unsentTrain(S.train) + GL.unsentGoals(S.goals) + PS.unsentSync(S.pcsettings) + GD.unsentGyms(S.gyms);

function go(view, arg = null) {
  // Seite anpassen (1.48.0): Bearbeiten endet, wenn eine andere Seite geöffnet wird
  const editing = layoutEditing();
  if (editing && LAYOUT_PAGES.find(([k]) => k === editing)?.[1] !== view) setLayoutEditing(null);
  // „Werte erfassen“ verlassen: Geändertes sofort sichern (1.40.0)
  if (S.view === "body-entry" && view !== "body-entry") bodyLeave();
  if (view === "food-review" && S.view !== "food-review") S.reviewFrom = S.view === "send" ? "send" : S.view === "pending" ? "pending" : S.view === "food" ? "food" : "home";
  if (view !== S.view && view !== "detail") S.trainNotice = null;
  S.view = view;
  S.arg = arg;
  render();
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ Ansichten

/** Knopf für das Menü (wie die linke Leiste am PC). */
const menuButton = () =>
  S.catalog ? `<button class="menu-btn" data-act="menu-open" aria-label="Menü öffnen" aria-expanded="${S.menuOpen ? "true" : "false"}">${icon("menu")}</button>` : "";

function header(title, { back = null, sub = "" } = {}) {
  return `<header class="top"><div class="wrap">
    ${menuButton()}
    ${back ? `<button class="back back--icon" data-go="${back}" aria-label="Zurück">‹</button>` : ""}
    <h1${title.length > 11 ? ' class="h1--long"' : ""}>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</h1>
  </div>${proButton(title)}${introPanel(title)}</header>`;
}

function brandHeader(hero = "") {
  return `<header class="top${hero ? " top--hero" : ""}"><div class="wrap">
    ${menuButton()}
    <div class="brand"><img src="icons/icon-192.png" alt=""><div><b>LIFESPAN OS</b><small class="brand__date">${esc(new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }))}</small></div></div>
    ${S.catalog ? "" : `<button class="back" data-go="help">Hilfe</button>`}
  </div>${hero ? `<div class="wrap top__hero">${hero}</div>${proButton("Overview", { hero: true })}${introPanel("Overview")}` : ""}</header>`;
}

function viewSetup() {
  return `${brandHeader()}<main class="wrap">
    <h2>Willkommen</h2>
    <p class="muted">Hier erfasst du dein Training im Studio. Alles bleibt auf diesem Gerät, ohne Konto und ohne Cloud. Zuerst brauchst du deine Daten vom PC: Trainingspläne, Maschinen und Übungen.</p>
    <section class="card">
      <h3>So holst du deine Daten aufs Handy</h3>
      <ol class="steps small">
        <li>Am PC in LIFESPAN OS unter <b>Settings</b> einen <b>Export</b> erstellen.</li>
        <li>Die Datei <b>performance-os-export.json</b> in deinen <b>Google-Drive</b>-Ordner kopieren.</li>
        <li>Hier auf <b>„Exportdatei laden“</b> tippen und die Datei in Google Drive auswählen.</li>
      </ol>
      ${fileButton("Exportdatei laden")}
    </section>
    <section class="card">
      <h3>Ohne PC starten</h3>
      <p class="muted small">Kein PC? Lege ein Konto direkt am Handy an. Maschinen (mit Muskelgruppen), Lebensmittel und Übungsbibliothek sind dabei; später kannst du alles an den PC übertragen.</p>
      <button class="btn blue block" data-go="account-new">Neues Konto anlegen</button>
    </section>
    <p class="muted small">Tipp fürs iPhone: Tippe in Safari auf „Teilen“ → „Zum Home-Bildschirm“. Nur so bleiben deine Daten dauerhaft gespeichert.</p>
  </main>`;
}

// Ohne `accept` (1.50.0): Google Drive meldet JSON-Dateien in der iPhone-App „Dateien“ nicht als JSON,
// iOS lehnt sie dann als „nicht unterstützter Dateityp“ ab. Den Inhalt prüft `C.parseExport`.
function fileButton(label) {
  return `<label class="btn primary block" for="file-in">${esc(label)}</label>
    <input id="file-in" type="file" hidden>`;
}

/**
 * Overview wie am PC (1.6.0): oben das Training am Handy (läuft bzw. starten), darunter die Karten der
 * Desktop-App in deren Anordnung. Seit 1.66.0 ohne „Daten vom PC“, „An den PC senden“ und Tageswahl –
 * beides unter Import/Export; der Tag wechselt per Wischen (dayswipe.js), „Heute“ im Kopf springt zurück.
 */
function viewHome() {
  const c = S.catalog;
  const a = S.active;
  const today = todayIso();
  const date = S.ovDate && S.ovDate < today ? S.ovDate : today;
  let cards;
  let hero = "";
  if (!c.pc) {
    cards = `<section class="card"><p class="warn">Für die Overview wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Import/Export „Neue Exportdatei laden“.</p></section>`;
  } else {
    try {
      const db = buildDb();
      // Quick Fill (1.54.0): Hinweis, wenn Werte fehlen
      let fill = "";
      try {
        fill = date === today ? quickFillBanner() : "";
      } catch (e) {
        console.error(e);
      }
      cards = `${fill}${overviewCardsHtml(db, c, date, today)}`;
      try {
        hero = overviewHero(db, c, date, today);
      } catch (e) {
        console.error(e);
      }
    } catch (e) {
      console.error(e);
      cards = `<section class="card"><p class="warn">Die Overview konnte nicht berechnet werden: ${esc(e.message)}</p></section>`;
    }
  }
  return `${brandHeader(hero)}<main class="wrap" data-day-swipe="ov" data-day="${esc(date)}">
    ${
      a
        ? a.editOf
          ? `<section class="card hl"><div class="wo-head"><h3>Bearbeitung: ${esc(a.title)}</h3><span class="tag">${fmtDate(a.date)}</span></div>
            <p class="muted small">${a.exercises.length} Übungen · Änderungen noch nicht gespeichert</p>
            <button class="btn primary block" data-go="workout">Weiter bearbeiten</button></section>`
          : `<section class="card hl"><div class="wo-head"><h3>Training läuft: ${esc(a.title)}</h3><span class="clock" data-clock>${fmtSec((Date.now() - new Date(a.startedAt)) / 1000)}</span></div>
            <p class="muted small">${a.exercises.length} Übungen · gestartet ${esc(C.localTime(new Date(a.startedAt)))} Uhr</p>
            <button class="btn primary block" data-go="workout">Weiter trainieren</button></section>`
        : ""
    }
    ${date === today ? remindersCardHtml() : ""}
    ${cards}
    <p class="muted small ov-source">Stand der Daten vom PC: ${fmtDateTime(c.exportedAt)} – plus alles, was du seitdem am Handy erfasst hast. Anordnung der Karten wie am PC (Overview → Übersicht anpassen).</p>
  </main>`;
}

/** Untere Leiste: welche zwei Bereiche neben dem „+“ stehen (Settings → Darstellung). */
function barSlotsHtml() {
  const slots = barSlots(S.prefs.barSlots);
  const opts = (sel) => barChoices().map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.label)}</option>`).join("");
  return `<div class="grid2">
      <div class="field"><label for="bar-left">Links vom „+“</label><select id="bar-left" data-bar="0">${opts(slots[0])}</select></div>
      <div class="field"><label for="bar-right">Rechts vom „+“</label><select id="bar-right" data-bar="1">${opts(slots[1])}</select></div>
    </div>
    <button class="btn sm ghost" data-act="bar-reset">Leiste: Standard (Training, Nutrition)</button>`;
}

/**
 * Import/Export (1.45.6): alles zum Datenaustausch an einer Stelle (vorher unter Settings) – An den PC
 * senden, Exportdatei vom PC laden, ganzes Konto an den PC, Herstellerpakete, BLS 4.0 und der Weg zu
 * den Blutzucker-Dateien. Erreichbar über den Knopf im Menükopf.
 */
function viewTransfer() {
  const c = S.catalog;
  if (!c) return `${header("Import/Export")}<main class="wrap"><section class="card"><h3>Daten vom PC</h3>${fileButton("Exportdatei laden")}</section></main>`;
  const total = unsent().length + unsentFood() + unsentBodyCount();
  // Reihenfolge und ausgeblendete Karten wie am PC (Import/Export → Seite anpassen, 1.47.0);
  // Karten ohne Gegenstück am PC folgen ihrem Vorgänger
  const cards = [
    { id: "import", node: `<section class="card">
      <div class="wo-head"><h3>An den PC senden</h3><span class="tag">${total} offen</span></div>
      <p class="muted small">Trainings, Lebensmittel und Körperwerte als Dateien für den Import am PC (Import/Export → Daten importieren → „Abgleichen“).</p>
      <button class="btn block" data-go="pending" ${total ? "" : "disabled"}>${total ? "Offene Daten ansehen und bearbeiten" : "Keine offenen Daten"}</button>
      <button class="btn primary block" data-go="send">An den PC senden</button>
    </section>` },
    { id: "phone", node: `<section class="card">
      <h3>${c.startpaket ? "Grunddaten" : "Daten vom PC"}</h3>
      <p class="muted small">Stand: ${fmtDateTime(c.exportedAt)} · ${c.machines.length.toLocaleString("de-DE")} Maschinen · ${c.exercises.length} Übungen · ${c.plans.length} Pläne</p>
      ${fileButton("Neue Exportdatei laden")}
      <p class="muted small">Am PC unter Import/Export entweder <b>„Für die Handy-App exportieren“</b> (kleiner, lädt schneller – keine Sicherung) oder den vollständigen Export „Daten exportieren“ wählen. Beide Dateien lassen sich hier laden.</p>
    </section>` },
    { id: "account", node: c.startpaket
        ? `<section class="card">
      <h3>Ganzes Konto an den PC</h3>
      <p class="muted small">Eine Datei mit allem, was in diesem Konto steht – am PC als neuer Benutzer („Ersetzen“) oder zum Abgleich mit einem bestehenden Benutzer.</p>
      <button class="btn primary block" data-act="account-export">Ganzes Konto an den PC</button>
      <div id="account-result"></div>
    </section>`
        : "" },
    { id: "vendor", node: `<section class="card">
      <h3>Herstellerpakete</h3>
      <p class="muted small">Lebensmittel und Supplements von Herstellern (PEAK, GymBeam, IronMaxx, #sinob, Proteini.si …) mit einem Tipp installieren – wie am PC.</p>
      <button class="btn block" data-act="vendor-open">Herstellerpakete</button>
    </section>` },
    { id: "mimages", node: `<section class="card">
      <h3>Maschinenbilder</h3>
      <p class="muted small">Alle Maschinenbilder (auch deine eigenen Fotos) in einem Paket von der Website laden – für Maschinensuche, Training, Verlauf und Datenbank. ${MI.imageCount() ? `${MI.imageCount().toLocaleString("de-DE")} Maschinen mit Bild auf diesem Gerät.` : "Noch keine Bilder auf diesem Gerät."}</p>
      <button class="btn block" data-act="mimg-open">Maschinenbilder</button>
    </section>` },
    { id: "catalog", node: catalogCard() },
    { id: "bls", node: blsCard() },
    { id: "off", node: offCard() },
    { id: "glucose", node: `<section class="card">
      <h3>Blutzucker-Dateien</h3>
      <p class="muted small">Dateien von LibreView, Dexcom Clarity oder eine eigene CSV liest du unter Health → Blutzucker ein. Die Werte gehen mit „Körperwerte … senden“ an den PC.</p>
      <button class="btn block" data-act="transfer-glucose">Zu Health → Blutzucker</button>
    </section>` },
  ];
  let arranged = cards;
  try {
    arranged = arrangeCards(buildDb(), "ui.transfer_layout", cards, { emptyLast: false });
  } catch {
    // ohne Daten vom PC: feste Reihenfolge
  }
  return `${header("Import/Export")}<main class="wrap">
    <p class="muted small">Alle Daten bleiben auf diesem Gerät. Dateien verlassen es nur, wenn du sie selbst weitergibst (z. B. über Google Drive an den PC).</p>
    ${arranged.map((x) => x.node).join("")}
  </main>`;
}

/** Bereich, den es bisher nur am PC gibt. */
function viewPcOnly() {
  const sec = SECTIONS.find((x) => x.id === S.arg) ?? SECTIONS[0];
  return `${header(sec.label)}<main class="wrap">${pcOnlyHtml(sec.id, esc)}</main>`;
}

function viewPlans() {
  const plans = S.catalog.plans;
  return `${header("Plan starten", { back: "home" })}<main class="wrap">
    ${
      plans.length
        ? plans
            .map(
              (p) => `<section class="card"><h3>${esc(p.row.name)}</h3><div class="list">
              ${p.days
                .map(
                  (d) => `<button class="item" data-act="start-plan" data-arg="${d.row.id}"><span class="main"><b>${esc(d.row.name)}</b>
                    <span class="muted small">${d.exercises.length} Übungen</span></span><span class="chev">›</span></button>`,
                )
                .join("")}</div></section>`,
            )
            .join("")
        : `<p class="empty">Noch keine Trainingspläne. Lege sie am PC an und lade danach eine neue Exportdatei.</p>`
    }
  </main>`;
}

function exLabel(ex, machines) {
  const m = ex?.machine_id ? machines.get(ex.machine_id) : null;
  const nr = m?.own_number || m?.gym_number || ex?.equipment || null;
  return { name: ex?.name ?? "Unbekannte Übung", nr, m };
}

function lastText(last, cardio) {
  if (!last?.sets?.length) return "";
  const parts = last.sets
    .filter((s) => !s.isWarmup)
    .map((s) =>
      cardio
        ? [s.durationSeconds ? `${Math.round(s.durationSeconds / 60)} min` : "", s.distanceM ? `${C.fmtNum(s.distanceM / 1000)} km` : ""].filter(Boolean).join(" ")
        : `${s.reps ?? "–"}×${s.weightKg !== null ? C.fmtNum(s.weightKg) : "–"}${C.usedProfiles(s.rp).length ? ` (${C.describeProfiles(s.rp)})` : ""}`,
    );
  return `<p class="last">Letztes Mal (${fmtDate(last.date)}): <b>${esc(parts.join(" · ") || "–")}</b>${cardio ? "" : " kg"}</p>`;
}

function viewWorkout() {
  const w = S.active;
  if (!w) return viewHome();
  const exs = exById();
  const machines = machineById();
  const edit = !!w.editOf;
  const sub = w.backfill
    ? `${fmtDate(w.date)} · nachtragen`
    : edit
    ? `${fmtDate(w.date)} · bearbeiten`
    : `${fmtDate(w.date)} · seit ${C.localTime(new Date(w.startedAt))} Uhr`;
  return `${header(w.title, { back: "home", sub })}<main class="wrap">
    <div class="wo-head"><span class="muted small">${w.exercises.length} Übungen · ${C.fmtNum(C.volumeKg(w), 0)} kg Volumen</span>${
      edit ? `<span class="tag">${w.backfill ? "Nachtragen" : "Bearbeitung"}</span>` : `<span class="clock" data-clock>${fmtSec((Date.now() - new Date(w.startedAt)) / 1000)}</span>`
    }</div>
    ${GY.workoutGymSelectHtml(w)}
    ${w.competition ? competitionCard(w.competition) : ""}
    ${w.exercises.map((we, i) => exerciseCard(we, i, exs, machines)).join("")}
    <button class="btn block" data-go="picker">+ Übung oder Maschine hinzufügen</button>
    ${w.competition || !isHyroxWorkout(w) ? "" : `<button class="btn ghost block" data-act="comp-add">HYROX-Wettkampf-Angaben hinzufügen</button>`}
    <button class="btn danger block" data-act="discard">${w.backfill ? "Verwerfen" : edit ? "Änderungen verwerfen" : "Training verwerfen"}</button>
  </main>
  <div class="bottom"><div class="inner"><button class="btn primary" data-go="finish">${w.backfill ? "Weiter zum Speichern" : edit ? "Änderungen speichern" : "Training beenden"}</button></div></div>`;
}

/**
 * Nur die aktuelle Übung ist aufgeklappt (1.4.1): die erste mit offenen Sätzen bzw. die zuletzt
 * hinzugefügte; von Hand auf- oder zugeklappte Übungen bleiben so, bis die aktuelle wechselt.
 */
const exComplete = (e) => e.sets.length > 0 && e.sets.every((x) => x.isDone);
/** Wie am PC (domain/workoutFocus.ts): zuletzt begonnene offene Übung, sonst die nächste offene danach, sonst die erste offene. */
function focusExId(w) {
  if (w.focusEx && w.exercises.some((e) => e.id === w.focusEx)) return w.focusEx;
  const list = w.exercises;
  let started = -1;
  list.forEach((e, i) => {
    if (e.sets.some((x) => x.isDone)) started = i;
  });
  if (started >= 0 && !exComplete(list[started])) return list[started].id;
  return (list.slice(started + 1).find((e) => !exComplete(e)) ?? list.find((e) => !exComplete(e)))?.id ?? null;
}
function isOpen(w, we) {
  const manual = S.exOpen?.[we.id];
  return manual ?? we.id === focusExId(w);
}
function setFocus(w, id) {
  w.focusEx = id;
  S.exOpen = {};
}

/** HYROX-Einheit (1.54.0, wie am PC): „HYROX“ im Titel oder eine Übung, deren Name mit „Hyrox“ beginnt. */
function isHyroxWorkout(w) {
  if (/hyrox/i.test(w.title ?? "")) return true;
  const exs = exById();
  return w.exercises.some((e) => /^\s*hyrox/i.test(exs.get(e.exerciseId)?.name ?? e.exerciseName ?? ""));
}

/**
 * HYROX-Wettkampf (1.46.0): Frauen/Männer, Wettkampfklasse (Division), Ort, Altersklasse,
 * Endzeit und Platzierung gesamt und in der Altersklasse – wie am PC.
 */
function competitionCard(c) {
  const sex = c.sex ?? HX.divisionSex(c.division);
  const num = (v) => (v === null || v === undefined ? "" : String(v));
  const field = (id, label, value, attrs, cls = "field") =>
    `<div class="${cls}"><label for="${id}">${label}</label><input id="${id}" type="text" ${attrs} value="${esc(value)}"></div>`;
  return `<section class="card competition" aria-label="Wettkampf-Angaben">
    <h3>HYROX-Wettkampf</h3>
    <div class="chips" role="group" aria-label="Wettkampf">
      <button class="chip${sex === "women" ? " on" : ""}" data-act="comp-sex" data-arg="women" aria-pressed="${sex === "women"}">Wettkampf Frauen</button>
      <button class="chip${sex === "men" ? " on" : ""}" data-act="comp-sex" data-arg="men" aria-pressed="${sex === "men"}">Wettkampf Männer</button>
    </div>
    <div class="comp-grid">
      <div class="field wide"><label for="comp-division">Wettkampfklasse (Division)</label>
        <select id="comp-division" data-cfield="division">
          <option value="">–</option>
          ${HX.divisionsFor(sex).map((d) => `<option value="${d.value}"${c.division === d.value ? " selected" : ""}>${esc(d.label)}</option>`).join("")}
        </select></div>
      ${field("comp-location", "Ort", c.location ?? "", 'maxlength="120" placeholder="z. B. Wien" data-cfield="location"')}
      <div class="field"><label for="comp-age">Altersklasse</label>
        <select id="comp-age" data-cfield="ageGroup">
          <option value="">–</option>
          ${HX.HYROX_AGE_GROUPS.map((a) => `<option value="${a}"${c.ageGroup === a ? " selected" : ""}>${a}</option>`).join("")}
          ${c.ageGroup && !HX.HYROX_AGE_GROUPS.includes(c.ageGroup) ? `<option value="${esc(c.ageGroup)}" selected>${esc(c.ageGroup)}</option>` : ""}
        </select></div>
      ${field("comp-finish", "Endzeit", c.finishText ?? HX.formatFinishTime(c.finishSeconds), 'inputmode="numeric" placeholder="h:mm:ss" data-cfield="finish"', "field wide")}
      ${field("comp-rank", "Platz gesamt", num(c.rank), 'inputmode="numeric" placeholder="–" data-cfield="rank"')}
      ${field("comp-field", "von", num(c.field), 'inputmode="numeric" placeholder="–" data-cfield="field"')}
      ${field("comp-rank-age", "Platz AK", num(c.rankAge), 'inputmode="numeric" placeholder="–" data-cfield="rankAge"')}
      ${field("comp-field-age", "von", num(c.fieldAge), 'inputmode="numeric" placeholder="–" data-cfield="fieldAge"')}
    </div>
    <p class="muted small">Beim Wechsel der Klasse werden die Stationsgewichte laut Regelwerk eingetragen; sie bleiben änderbar.</p>
    <button class="btn sm ghost" data-act="comp-remove">Wettkampf-Angaben entfernen</button>
  </section>`;
}

/** Stationsgewichte und -notizen der Einheit an eine Klasse anpassen (ohne Gewichte: unverändert). */
function applyDivisionWeights(w, division) {
  if (!HX.weightsForDivision(division)) return;
  for (const we of w.exercises) {
    if (!HX.HYROX_WEIGHTED.has(we.exerciseId)) continue;
    const load = HX.loadFor(we.exerciseId, division);
    if (!load) continue;
    for (const s of we.sets) {
      s.weightKg = load.weightKg;
      if (load.notes) s.notes = load.notes;
    }
  }
}

/** Vorlage gewählt: alle 16 Abschnitte mit vorbelegten Werten anlegen. */
function addHyrox(template) {
  const w = S.active;
  const all = C.allExercises(S.catalog, S.localExercises);
  const { found, missing } = HX.matchStations(all);
  const iso = new Date().toISOString();
  for (const station of missing) {
    const id = all.some((e) => e.id === station.exerciseId) ? C.uuidv7() : station.exerciseId;
    const ex = HX.stationExercise(station, id, iso);
    S.localExercises.push(ex);
    found.set(station.key, ex);
  }
  const race = template !== "simulation";
  const division = race && !w.planDayId ? HX.defaultDivision(template) : null;
  let first = null;
  for (const seg of HX.hyroxSegments(division)) {
    const ex = found.get(seg.station.key);
    const we = C.workoutExercise({ exerciseId: ex.id });
    const set = C.newSet({ distanceM: seg.distanceM, reps: seg.reps, weightKg: seg.weightKg });
    set.notes = seg.notes;
    we.sets = [set];
    we.restSeconds = null;
    w.exercises.push(we);
    first ??= we;
  }
  if (!w.title.trim() || w.title === "Freies Training" || w.title === "Training") {
    w.title = race ? "HYROX-Wettkampf" : "HYROX-Simulation";
  }
  if (division && !w.competition) {
    w.competition = { ...HX.emptyCompetition(division), sex: template };
  }
  return first;
}

function exerciseCard(we, i, exs, machines) {
  const ex = exs.get(we.exerciseId);
  const { name, nr, m } = exLabel(ex, machines);
  const cardio = ex?.category === "cardio";
  const weighted = cardio && HX.HYROX_WEIGHTED.has(we.exerciseId);
  const last = C.lastSessionFor(S.catalog, S.workouts, we.exerciseId, S.active.id);
  const st = we.settings || C.emptySettings();
  const open = isOpen(S.active, we);
  const done = we.sets.filter((x) => x.isDone).length;
  const head = `<button class="ex-head ex-toggle" data-act="toggle-ex" data-we="${we.id}" aria-expanded="${open}">
      <span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span>${MI.thumb(m?.id)}
      <span class="main"><b>${esc(name)}</b><span class="muted small">${esc([m?.manufacturer, ex?.muscle_group].filter(Boolean).join(" · "))}</span></span>
      <span class="ex-progress${we.sets.length && done === we.sets.length ? " all" : ""}">${done}/${we.sets.length}</span>
      <span class="chev" aria-hidden="true">${open ? "▾" : "▸"}</span>
    </button>`;
  if (!open) {
    return `<section class="ex collapsed" id="ex-${we.id}">${head}${we.notes ? `<p class="ex-note-line muted small">📝 ${esc(we.notes)}</p>` : ""}</section>`;
  }
  return `<section class="ex" id="ex-${we.id}">
    ${head}
    ${lastText(last, cardio)}
    <details class="settings"${Object.values(st).some((v) => v) ? "" : ""}>
      <summary>Geräteeinstellungen${Object.values(st).some((v) => v) ? `: ${esc(Object.entries(C.SETTING_LABELS).filter(([k]) => st[k]).map(([k, l]) => `${l} ${st[k]}`).join(", "))}` : ""}</summary>
      <div class="settings-grid">
        ${Object.entries(C.SETTING_LABELS)
          .map(
            ([k, l]) => `<div class="field"><label for="st-${we.id}-${k}">${l}</label>
            <input id="st-${we.id}-${k}" type="text" maxlength="40" value="${esc(st[k] ?? "")}" data-we="${we.id}" data-setting="${k}"></div>`,
          )
          .join("")}
        <div class="field"><label for="st-${we.id}-grip">Griffstellung</label>
          <select id="st-${we.id}-grip" data-we="${we.id}" data-setting="gripPosition">
            <option value="">–</option>
            ${Object.entries(C.GRIP_LABELS).map(([k, l]) => `<option value="${k}"${st.gripPosition === k ? " selected" : ""}>${l}</option>`).join("")}
          </select></div>
        <div class="field"><label for="rest-${we.id}">Pause (Sekunden)</label>
          <input id="rest-${we.id}" type="text" inputmode="numeric" value="${we.restSeconds ?? ""}" data-we="${we.id}" data-field="restSeconds"></div>
      </div>
    </details>
    ${cardio ? "" : profilePicker(we, ex)}
    <details class="settings ex-notes"${we.notes ? " open" : ""}>
      <summary>Notiz zur Übung${we.notes ? "" : " (optional)"}</summary>
      <textarea id="note-${we.id}" rows="2" maxlength="500" placeholder="z. B. Sitz zu tief, nächstes Mal mehr Gewicht" data-we="${we.id}" data-field="notes">${esc(we.notes ?? "")}</textarea>
    </details>
    <div class="set-head${cardio ? " cardio" : ""}${weighted ? " kg" : ""}"><span>#</span>${cardio ? `<span>Minuten</span><span>km</span>${weighted ? "<span>kg</span>" : ""}` : "<span>kg</span><span>Wdh.</span><span>RPE</span>"}<span>✓</span></div>
    <div class="sets">
      ${we.sets.map((s, si) => setRow(we, s, si, cardio, cardio ? [] : C.visibleProfiles(we, ex), weighted)).join("")}
    </div>
    <div class="ex-foot">
      <button class="btn sm" data-act="add-set" data-we="${we.id}">+ Satz</button>
      <button class="btn sm ghost" data-act="move-up" data-we="${we.id}" ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="btn sm danger" data-act="remove-ex" data-we="${we.id}">Entfernen</button>
    </div>
  </section>`;
}

function profilePicker(we, ex) {
  const vis = C.visibleProfiles(we, ex);
  const locked = new Set(C.PROFILE_KEYS.filter((k) => we.sets.some((s) => s.rp?.[k] !== null && s.rp?.[k] !== undefined)));
  const both = vis.includes("conc") && vis.includes("ecc");
  return `<details class="settings resist"${vis.length ? " open" : ""}>
    <summary>Widerstand${vis.length ? `: ${esc(vis.map((k) => C.PROFILES.find((p) => p.key === k).short).join(", "))}` : ""}</summary>
    <div class="chips">${C.PROFILES.map(
      (p) => `<button class="chip${vis.includes(p.key) ? " on" : ""}" data-act="toggle-profile" data-we="${we.id}" data-arg="${p.key}" ${locked.has(p.key) ? 'data-locked="1"' : ""} title="${esc(p.label)}">${esc(p.short)}</button>`,
    ).join("")}</div>
    <p class="muted small">${vis.length ? "Sobald Profilgewichte eingetragen sind, ist das Gewicht ihre Summe." : "Profil wählen, um das Gewicht in Profile aufzuteilen."}${both ? " " + esc(C.CONC_ECC_RULE) : ""}</p>
  </details>`;
}

function setRow(we, s, si, cardio, profiles = [], weighted = false) {
  const id = `${we.id}-${s.id}`;
  const warmIdx = we.sets.slice(0, si + 1).filter((x) => !x.isWarmup).length;
  const idx = s.isWarmup ? `<span class="idx w">W</span>` : `<span class="idx">${warmIdx}</span>`;
  const inputs = cardio
    ? `<input id="d-${id}" type="text" inputmode="decimal" placeholder="min" value="${s.durationSeconds ? C.fmtNum(s.durationSeconds / 60) : ""}" data-we="${we.id}" data-set="${s.id}" data-f="durationMin" aria-label="Dauer in Minuten">
       <input id="k-${id}" type="text" inputmode="decimal" placeholder="km" value="${s.distanceM !== null ? C.fmtNum(s.distanceM / 1000, 3) : ""}" data-we="${we.id}" data-set="${s.id}" data-f="distanceKm" aria-label="Strecke in km">${
         weighted
           ? `<input id="w-${id}" type="text" inputmode="decimal" placeholder="kg" value="${C.fmtNum(s.weightKg)}" data-we="${we.id}" data-set="${s.id}" data-f="weightKg" aria-label="Gewicht in kg">`
           : ""
       }`
    : `<input id="w-${id}" type="text" inputmode="decimal" placeholder="kg" value="${C.fmtNum(C.profileTotal(s.rp) ?? s.weightKg)}" data-we="${we.id}" data-set="${s.id}" data-f="weightKg" aria-label="Gewicht in kg"${C.profileTotal(s.rp) !== null ? ' readonly class="sum" title="Summe der Profilgewichte"' : ""}>
       <input id="r-${id}" type="text" inputmode="numeric" placeholder="Wdh." value="${s.reps ?? ""}" data-we="${we.id}" data-set="${s.id}" data-f="reps" aria-label="Wiederholungen">
       <input id="p-${id}" class="rpe" type="text" inputmode="decimal" placeholder="–" value="${C.fmtNum(s.rpe, 1)}" data-we="${we.id}" data-set="${s.id}" data-f="rpe" aria-label="RPE">`;
  return `<div class="set${cardio ? " cardio" : ""}${cardio && weighted ? " kg" : ""}${s.isDone ? " done" : ""}">${idx}${inputs}
      <button class="check${s.isDone ? " on" : ""}" data-act="toggle-done" data-we="${we.id}" data-set="${s.id}" aria-label="Satz abhaken" aria-pressed="${s.isDone}">✓</button>
    </div>
    ${s.notes ? `<p class="set-note muted small">${esc(s.notes)}</p>` : ""}
    ${
      profiles.length
        ? `<div class="rp-grid">${profiles
            .map((k) => {
              const p = C.PROFILES.find((x) => x.key === k);
              return `<label class="rp"><span>${esc(p.short)}</span><input id="rp-${id}-${k}" type="text" inputmode="decimal" placeholder="kg" value="${C.fmtNum(s.rp?.[k])}" data-we="${we.id}" data-set="${s.id}" data-f="rp:${k}" aria-label="${esc(p.label)} in kg"></label>`;
            })
            .join("")}</div>`
        : ""
    }
    <div class="set-opts">
      <button class="chip${s.isWarmup ? " on" : ""}" data-act="flag" data-flag="isWarmup" data-we="${we.id}" data-set="${s.id}">Aufwärmen</button>
      ${cardio ? "" : `<button class="chip${s.isFailure ? " on" : ""}" data-act="flag" data-flag="isFailure" data-we="${we.id}" data-set="${s.id}">Fail</button>
      <button class="chip${s.isUnilateral ? " on" : ""}" data-act="flag" data-flag="isUnilateral" data-we="${we.id}" data-set="${s.id}">Einseitig</button>`}
      <button class="chip del" data-act="del-set" data-we="${we.id}" data-set="${s.id}" aria-label="Satz löschen">✕</button>
    </div>`;
}

function viewPicker() {
  return `${header("Übung hinzufügen", { back: "workout" })}<main class="wrap">
    <div class="search">
      <input id="q" type="search" placeholder="Nummer oder Name, z. B. 47 oder Beinpresse" value="${esc(S.query)}" autocomplete="off" enterkeyhint="search">
      ${GY.pickerGymNote() || `<label class="toggle"><input id="only-nr" type="checkbox" ${S.prefs.onlyNumbered ? "checked" : ""}> Nur Maschinen mit Nummer (dein Studio)</label>`}
    </div>
    <div class="list" id="results">${pickerResults()}</div>
  </main>`;
}

/** „12× benutzt · zuletzt 03.11.2026“ bzw. „noch nicht benutzt“. */
function usageText(u) {
  return u.count ? `${u.count}× benutzt · zuletzt ${fmtDate(u.last)}` : "noch nicht benutzt";
}

function pickerResults() {
  // Meine Gyms (1.60.0): nur die Maschinen des aktiven Gyms mit dessen Nummer (zuschaltbar)
  const gymOn = Boolean(GY.pickerGymNote());
  const catalog = gymOn ? GY.pickerCatalog() : S.catalog;
  const anyNumbered = catalog.machines.some((m) => m.own_number || m.gym_number);
  const onlyNr = !gymOn && S.prefs.onlyNumbered && anyNumbered;
  const hits = C.search(catalog, S.localExercises, S.query, { onlyNumbered: onlyNr, smart: PDOM.smartFilter });
  if (!hits.length) {
    return `<p class="empty">Nichts gefunden.${gymOn && !S.gymAll ? " Tippe auf „Alle Maschinen zeigen“, um alle Maschinen zu durchsuchen." : onlyNr ? " Schalte „Nur Maschinen mit Nummer“ aus, um alle Maschinen zu durchsuchen." : ""}</p>`;
  }
  const similarFrom = hits.findIndex((h) => h.match === "related" || h.match === "typo");
  const typoOnly = similarFrom >= 0 && hits.slice(similarFrom).every((h) => h.match === "typo");
  return hits
    .map((h, i) => (i === similarFrom ? `<p class="pick-group">${typoOnly ? (i === 0 ? `Keine genauen Treffer – meintest du …?` : "Meintest du …?") : "Ähnlich"}</p>` : "") + hitHtml(h))
    .join("");
}

/** Ein Treffer der Übungsauswahl (Maschine oder freie Übung). */
function hitHtml(h) {
  const same = h.match === "synonym" ? ' <span class="tag">gleichbedeutend</span>' : "";
      if (h.kind === "machine") {
        const m = h.machine;
        const nr = m.own_number || m.gym_number;
        const key = `machine:${m.id}`;
        return `<div class="item-row"><button class="item" data-act="pick-machine" data-arg="${esc(m.id)}">
          <span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span>${MI.thumbButton(m.id, m.display_name, { inner: true })}
          <span class="main"><b>${esc(m.display_name)}</b>${same}<span class="muted small">${esc([m.manufacturer, m.series, C.machineMuscles(m).slice(0, 3).join(", ")].filter(Boolean).join(" · "))}</span>${
            h.exercises.length ? `<span class="small">Übungen: ${esc(h.exercises.map((e) => e.name).join(" · "))}</span>` : ""
          }<span class="usage small">${esc(usageText(C.usageOf(S.catalog, S.workouts, C.machineExercises(S.catalog, S.localExercises, m.id).map((e) => e.id))))}</span></span>
          <span class="chev">${h.exercises.length ? "›" : "+"}</span></button>
          <button class="info-btn" data-act="focus-info" data-arg="${esc(key)}" aria-expanded="${S.focusOpen === key}" aria-label="Muskelverteilung der Maschine ${esc(m.display_name)}">${icon("info")}</button>
          ${S.focusOpen === key ? focusPanelHtml(machineFocusInfo(m)) : ""}</div>`;
      }
      const e = h.exercise;
      return `<button class="item" data-act="pick-exercise" data-arg="${esc(e.id)}">
        <span class="num none">Übung</span>${e.machine_id ? MI.thumbButton(e.machine_id, e.name, { inner: true }) : ""}
        <span class="main"><b>${esc(e.name)}</b>${same}<span class="muted small">${esc([e.muscle_group, e.equipment].filter(Boolean).join(" · "))}</span>
          <span class="usage small">${esc(usageText(C.usageOf(S.catalog, S.workouts, [e.id])))}</span></span>
        <span class="chev">+</span></button>`;
}

/** Maschine mit Übungen: eine davon wählen oder eine weitere anlegen. */
/** Muskelverteilung einer Übung (Info-Symbol), gleiche Regeln wie am PC. */
function focusPanel(e, m) {
  return focusPanelHtml(
    focusInfo(
      {
        exerciseId: e.id,
        exerciseName: e.name,
        muscleGroup: e.muscle_group,
        machineId: m?.id ?? e.machine_id,
        machineMuscleGroups: m ? C.machineMuscles(m) : [],
        machineNames: machineNamesOf(m ?? S.catalog.machines.find((x) => x.id === e.machine_id)),
      },
      S.catalog.focus,
    ),
  );
}

/** Muskelverteilung der Maschine selbst (1.5.1): eigener Fokus der Maschine, sonst Standardverteilung, sonst Muskelgruppen. */
function machineFocusInfo(m) {
  return focusInfo(
    { exerciseId: `machine:${m.id}`, exerciseName: m.name, muscleGroup: null, machineId: m.id, machineMuscleGroups: C.machineMuscles(m), machineNames: machineNamesOf(m) },
    S.catalog.focus,
  );
}

/** Kurztext unter „Muskelverteilung der Maschine“. */
function machineFocusText(info) {
  if (info.source === "machine") return "Eigener Muskelfokus der Maschine";
  if (info.source === "pattern") return info.title;
  if (info.source === "text") return "Aus den Muskelgruppen der Maschine";
  return "Keine Verteilung hinterlegt";
}

function focusPanelHtml(info) {
  return `<div class="focus-panel">
    <b>${esc(info.title)}</b>
    ${info.groups
      .map(
        (g) => `<div class="fp-group"><div class="fp-head"><span>${esc(g.label)}</span><span>Anteil ${g.total} %</span></div>
        ${g.rows.map((r) => `<div class="fp-row"><span>${esc(r.label)}</span><span>${r.relative} %<small class="fp-share"> (Anteil ${r.percent} %)</small></span></div>`).join("")}</div>`,
      )
      .join("")}
    ${info.groups.length ? `<p class="muted small">Hauptmuskel = 100 %, so zählt die Körperkarte; in Klammern der eingetragene Anteil.</p>` : ""}
    ${info.terms.length ? `<div class="fp-group">${info.terms.map((t) => `<div class="fp-row"><span>${esc(t.label)}</span><span>${t.percent} %</span></div>`).join("")}</div>` : ""}
    ${info.note ? `<p class="muted small">${esc(info.note)}</p>` : ""}
    ${S.catalog.focus ? "" : `<p class="muted small">Für den eigenen Muskelfokus bitte eine neue Exportdatei vom PC laden.</p>`}
  </div>`;
}

function viewMachine() {
  const m = S.catalog.machines.find((x) => x.id === S.arg);
  if (!m) return viewPicker();
  const nr = m.own_number || m.gym_number;
  const list = C.machineExercises(S.catalog, S.localExercises, m.id);
  return `${header(m.display_name, { back: "picker", sub: [nr ? `Nr. ${nr}` : "", m.manufacturer].filter(Boolean).join(" · ") })}<main class="wrap">
    ${MI.photoButton(m.id, [m.manufacturer, m.display_name].filter(Boolean).join(" · "))}
    ${(() => {
      const info = machineFocusInfo(m);
      const key = `machine:${m.id}`;
      return `<div class="item-row machine-focus">
        <div class="item machine-focus__text"><span class="main"><b>Muskelverteilung der Maschine</b>
          <span class="muted small">${esc(machineFocusText(info))}</span></span></div>
        <button class="info-btn" data-act="focus-info" data-arg="${esc(key)}" aria-expanded="${S.focusOpen === key}" aria-label="Muskelverteilung der Maschine ${esc(m.display_name)}">${icon("info")}</button>
        ${S.focusOpen === key ? focusPanelHtml(info) : ""}
      </div>`;
    })()}
    <p class="muted small">Übungen an dieser Maschine – der Verlauf gehört jeweils zur Übung.</p>
    <div class="list">${list
      .map(
        (e) => `<div class="item-row">
        <button class="item" data-act="pick-exercise" data-arg="${esc(e.id)}">
        <span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span>
        <span class="main"><b>${esc(e.name)}</b><span class="muted small">${esc(e.muscle_group ?? "")}</span>
          <span class="usage small">${esc(usageText(C.usageOf(S.catalog, S.workouts, [e.id])))}</span></span>
        <span class="chev">+</span></button>
        <button class="info-btn" data-act="focus-info" data-arg="${esc(e.id)}" aria-expanded="${S.focusOpen === e.id}" aria-label="Muskelverteilung von ${esc(e.name)}">${icon("info")}</button>
        ${S.focusOpen === e.id ? focusPanel(e, m) : ""}
      </div>`,
      )
      .join("")}</div>
    <section class="card"><h3>Weitere Übung an dieser Maschine</h3>
      <p class="small muted">Zum Beispiel „Butterfly“ und „Rear Delt“ an derselben Maschine. Die Übung wird gespeichert, steht hier beim nächsten Mal zur Auswahl und kommt mit „An den PC senden“ auch in die Desktop-App.</p>
      <div class="new-ex"><input id="new-ex-name" type="text" placeholder="Name der Übung, z. B. Butterfly" autocomplete="off" enterkeyhint="done" maxlength="80">
      <button class="btn primary" data-act="new-machine-ex" data-arg="${esc(m.id)}">Übung anlegen und hinzufügen</button></div>
    </section>
  </main>`;
}

function viewFinish() {
  const w = S.active;
  if (!w) return viewHome();
  const unticked = C.untickedCount(w);
  const errors = C.checkWorkout(w, { keepUnticked: S.prefs.keepUnticked });
  const edit = !!w.editOf;
  if (edit && w.durationMin !== null && (!Number.isFinite(w.durationMin) || w.durationMin < 1 || w.durationMin > 1440)) {
    errors.push("Dauer: bitte 1 bis 1440 Minuten eintragen.");
  }
  return `${header(w.backfill ? "Einheit nachtragen" : edit ? "Änderungen speichern" : "Training beenden", { back: "workout" })}<main class="wrap">
    ${
      edit
        ? `<section class="card"><div class="field"><label for="wo-date">Datum</label><input id="wo-date" type="date" value="${esc(w.date ?? "")}" max="${esc(todayIso())}" data-wfield="date"></div>
           <div class="field"><label for="wo-start">Uhrzeit (optional)</label><input id="wo-start" type="time" value="${esc(w.startTime ?? "")}" data-wfield="startTime"></div>
           <div class="field"><label for="wo-duration">Dauer in Minuten${w.backfill ? " (optional)" : ""}</label><input id="wo-duration" type="text" inputmode="numeric" value="${w.durationMin ?? ""}" data-wfield="durationMin"></div>
           <p class="muted small">${w.exercises.length} ${w.exercises.length === 1 ? "Übung" : "Übungen"} · ${C.fmtNum(C.volumeKg(w), 0)} kg Volumen. ${
             w.backfill
               ? "Nach dem Speichern steht die Einheit unter Training → Einheiten; mit „An den PC senden“ und „Abgleichen (zweites Gerät)“ kommt sie an den PC."
               : "Nach dem Speichern zählt das Training wieder als „offen“ – mit „An den PC senden“ und „Abgleichen (zweites Gerät)“ übernimmt der PC die Änderungen, auch entfernte Sätze und Übungen."
           }</p></section>`
        : ""
    }
    <section class="card"${edit ? " hidden" : ""}>
      <div class="stat">
        <div><b>${fmtSec((Date.now() - new Date(w.startedAt)) / 1000)}</b><span>Dauer</span></div>
        <div><b>${w.exercises.length}</b><span>Übungen</span></div>
        <div><b>${C.fmtNum(C.volumeKg(w), 0)}</b><span>kg Volumen</span></div>
      </div>
    </section>
    <section class="card">
      <h3>Wie anstrengend war es? (1–10)</h3>
      <div class="rpe-row">${Array.from({ length: 10 }, (_, i) => i + 1)
        .map((n) => `<button data-act="exertion" data-arg="${n}" class="${w.perceivedExertion === n ? "on" : ""}">${n}</button>`)
        .join("")}</div>
      <div class="field"><label for="wo-notes">Notiz (optional)</label><textarea id="wo-notes" maxlength="2000" data-wfield="notes">${esc(w.notes ?? "")}</textarea></div>
      <div class="field"><label for="wo-title">Titel</label><input id="wo-title" type="text" maxlength="80" value="${esc(w.title)}" data-wfield="title"></div>
    </section>
    ${
      unticked
        ? `<section class="card"><p class="warn">${unticked === 1 ? "1 Satz ist" : `${unticked} Sätze sind`} eingetragen, aber nicht abgehakt.</p>
           <label class="toggle"><input id="keep-unticked" type="checkbox" ${S.prefs.keepUnticked ? "checked" : ""}> Nicht abgehakte Sätze trotzdem speichern</label></section>`
        : ""
    }
    ${errors.length ? `<div class="errors">${errors.map((e) => `<p>${esc(e)}</p>`).join("")}</div>` : ""}
  </main>
  <div class="bottom"><div class="inner"><button class="btn primary" data-act="finish" ${errors.length ? "disabled" : ""}>Speichern</button></div></div>`;
}

function viewSend() {
  const open = unsent();
  const all = S.workouts.filter((w) => w.status === "done");
  const food = unsentFood();
  const body = unsentBodyCount();
  const ready = [
    open.length ? `${open.length} ${open.length === 1 ? "Training" : "Trainings"}` : "",
    food ? `${food} Ernährungseinträge` : "",
    body ? `${body} Körperwerte, Schlaf-, Regenerations-, To-do- und Trainingseinträge` : "",
  ].filter(Boolean);
  return `${header("An den PC senden", { back: "transfer" })}<main class="wrap">
    <section class="card">
      <h3>${ready.length ? `${ready.join(" und ")} bereit` : "Alles übertragen"}</h3>
      ${ready.length ? `<button class="btn block" data-go="pending">Vorher offene Daten ansehen und bearbeiten</button>` : ""}
      <ol class="steps small">
        <li>Auf <b>„Trainings senden“</b> bzw. <b>„Lebensmittel senden“</b> tippen und die Datei in <b>Google Drive</b> sichern („In Drive sichern“ bzw. „In Dateien sichern“ → Google Drive).</li>
        <li>Am PC in LIFESPAN OS: <b>Import/Export → Daten importieren → Exportdatei auswählen …</b> und die Datei aus Google Drive wählen.</li>
        <li>Als Art <b>„Abgleichen (zweites Gerät)“</b> wählen und bestätigen.</li>
      </ol>
      <p class="warn">Bitte nie „Ersetzen“ wählen: Dann würden am PC alle anderen Daten gelöscht. „Abgleichen“ ist sicher, vorher legt die App automatisch ein Backup an.</p>
      <p class="muted small">Trainings, Ernährung und Körperwerte kommen in getrennte Dateien: „LIFESPAN Smartphone-Training …“, „LIFESPAN Lebensmittel …“ und „LIFESPAN Körperwerte …“ (mit Schlaf, Nickerchen, Regeneration, To-dos, Health, Superhuman und den Änderungen im Training wie Plänen, NEAT, Übungen und Check-Ins). Am PC alle gleich importieren.</p>
      <button class="btn primary block" data-act="send" data-arg="training" ${open.length ? "" : "disabled"}>${open.length ? `Trainings senden (${open.length})` : "Keine offenen Trainings"}</button>
      <button class="btn primary block" data-act="send" data-arg="food" ${food ? "" : "disabled"}>${food ? `Lebensmittel senden (${food} Einträge)` : "Keine offenen Ernährungseinträge"}</button>
      ${food ? `<button class="btn block" data-go="food-review">Vorher Ernährungseinträge prüfen und bearbeiten</button>` : ""}
      ${body ? `<button class="btn primary block" data-act="send" data-arg="body">Körperwerte, Schlaf, Regeneration, To-dos, Training, Health, Superhuman &amp; Tagesziele senden (${body})</button>` : ""}
    </section>
    ${
      all.length || Object.keys(S.food?.local.meals ?? {}).length || Object.keys(S.food?.local.foods ?? {}).length || Object.keys(S.body?.local.entries ?? {}).length || Object.keys(LG.logTables(S.logs, { all: true })).length || Object.keys(TD.todoTables(S.todos, { all: true })).length || Object.keys(HD.healthTables(S.health, { all: true })).length || Object.keys(SD.superTables(S.super, { all: true })).length || Object.keys(CD.checklistTables(S.checklists, { all: true })).length || (Object.keys(CF.caffeineTables(S.caffeine, { all: true })).length || Object.keys(GLD.glucoseTables(S.glucose, { all: true })).length || Object.keys(TR.trainTables(S.train, { all: true })).length || Object.keys(GD.gymTables(S.gyms, { all: true })).length)
        ? `<section class="card"><h3>Alles vom Handy</h3>
            <p class="muted small">Falls eine Datei verloren ging: Du kannst alle ${all.length} Trainings und die Ernährungseinträge noch einmal senden. Am PC entstehen dabei keine doppelten Einträge.</p>
            ${all.length ? `<button class="btn block" data-act="send" data-arg="training|all">Alle Trainings erneut senden</button>` : ""}
            ${Object.keys(S.food?.local.meals ?? {}).length || Object.keys(S.food?.local.foods ?? {}).length ? `<button class="btn block" data-act="send" data-arg="food|all">Alle Ernährungseinträge erneut senden</button>` : ""}
            ${Object.keys(S.body?.local.entries ?? {}).length || Object.keys(LG.logTables(S.logs, { all: true })).length || Object.keys(TD.todoTables(S.todos, { all: true })).length || Object.keys(HD.healthTables(S.health, { all: true })).length || Object.keys(SD.superTables(S.super, { all: true })).length || Object.keys(CD.checklistTables(S.checklists, { all: true })).length || (Object.keys(CF.caffeineTables(S.caffeine, { all: true })).length || Object.keys(GLD.glucoseTables(S.glucose, { all: true })).length || Object.keys(TR.trainTables(S.train, { all: true })).length || Object.keys(GD.gymTables(S.gyms, { all: true })).length) ? `<button class="btn block" data-act="send" data-arg="body|all">Alle Körperwerte, Schlaf, Regeneration, To-dos, Checklisten, Health, Superhuman &amp; Koffein erneut senden</button>` : ""}</section>`
        : ""
    }
    <div id="send-result"></div>
  </main>`;
}

/**
 * Offene Daten (1.18.0): alles, was noch nicht am PC ist – je Bereich, mit Details, Sprung zum
 * Bearbeiten im jeweiligen Bereich und „Verwerfen“ (dann gilt wieder der Stand vom PC).
 */
function viewPending() {
  const items = PD.pendingItems(S);
  const wos = unsent();
  const foodN = S.food ? N.unsentCount(S.food.local) : 0;
  const total = wos.length + foodN + items.length;
  const ex = exById();
  const open = S.pendingOpen;
  const detailsHtml = (it) =>
    `<div class="pending-details">
      ${it.fields.length ? `<dl class="pending-fields">${it.fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      ${
        it.details.length
          ? `<ul class="pending-parts">${it.details
              .map(
                (d) => `<li><b>${esc(d.label)}${d.op === "del" ? " – wird gelöscht" : ""}:</b> ${esc(d.title)}${
                  d.fields.length ? `<span class="muted small"> · ${d.fields.map(([k, v]) => `${esc(k)} ${esc(v)}`).join(" · ")}</span>` : ""
                }</li>`,
              )
              .join("")}</ul>`
          : ""
      }
      ${!it.fields.length && !it.details.length ? `<p class="muted small">${it.status === "Löschung" ? "Wird am PC gelöscht." : "Keine weiteren Angaben."}</p>` : ""}
    </div>`;
  const itemHtml = (it) => `<li class="pending-item">
      <div class="pending-item__head">
        <span class="pending-item__main"><b>${esc(it.title)}</b>
          <span class="muted small">${esc([it.label, it.date ? fmtDate(it.date) : "", ...it.parts].filter(Boolean).join(" · "))}</span></span>
        <span class="tag ${it.status === "Löschung" ? "tag--del" : it.status === "Neu" ? "tag--new" : ""}">${esc(it.status)}</span>
      </div>
      ${open === it.key ? detailsHtml(it) : ""}
      <div class="row-actions">
        <button class="linkbtn" data-act="pending-toggle" data-arg="${esc(it.key)}" aria-expanded="${open === it.key}">${open === it.key ? "Weniger" : "Ansehen"}</button>
        ${it.edit ? `<button class="linkbtn" data-act="pending-edit" data-arg="${esc(it.key)}">Bearbeiten</button>` : ""}
        <button class="linkbtn danger" data-act="pending-discard" data-arg="${esc(it.key)}">${it.status === "Löschung" ? "Löschen zurücknehmen" : "Verwerfen"}</button>
      </div></li>`;
  const byArea = new Map();
  for (const it of items) {
    if (!byArea.has(it.area)) byArea.set(it.area, []);
    byArea.get(it.area).push(it);
  }
  const woHtml = (w) => {
    const sets = w.exercises.reduce((a, e) => a + e.sets.length, 0);
    const names = w.exercises.map((e) => ex.get(e.exerciseId)?.name).filter(Boolean);
    return `<li class="pending-item">
      <div class="pending-item__head">
        <span class="pending-item__main"><b>${esc(w.title)}</b>
          <span class="muted small">${esc([`Training`, fmtDate(w.date), `${w.exercises.length} Übungen`, `${sets} Sätze`, w.durationMin ? `${w.durationMin} min` : ""].filter(Boolean).join(" · "))}</span>
          ${names.length ? `<span class="muted small">${esc(names.slice(0, 6).join(", "))}${names.length > 6 ? " …" : ""}</span>` : ""}</span>
        <span class="tag ${w.extra ? "" : "tag--new"}">${w.extra ? "Geändert" : "Neu"}</span>
      </div>
      <div class="row-actions">
        <button class="linkbtn" data-go="detail" data-arg="${esc(w.id)}">Ansehen und bearbeiten</button>
        <button class="linkbtn danger" data-act="pending-wo-discard" data-arg="${esc(w.id)}">Verwerfen</button>
      </div></li>`;
  };
  const areaCards = PD.AREAS.map(([area, label]) => {
    const list = byArea.get(area) ?? [];
    const extraWo = area === "training" ? wos : [];
    const extraFood = area === "nutrition" ? foodN : 0;
    if (!list.length && !extraWo.length && !extraFood) return "";
    const count = list.length + extraWo.length + extraFood;
    return `<section class="card"><div class="wo-head"><h3>${esc(label)}</h3><span class="tag">${count} offen</span></div>
      ${
        extraFood
          ? `<p class="muted small">${extraFood} ${extraFood === 1 ? "Ernährungseintrag" : "Ernährungseinträge"} (Mahlzeiten, Lebensmittel, Rezepte, Strichcodes).</p>
             <button class="btn block" data-go="food-review">Ernährung prüfen und bearbeiten</button>`
          : ""
      }
      ${extraWo.length || list.length ? `<ul class="pending-list">${extraWo.map(woHtml).join("")}${list.map(itemHtml).join("")}</ul>` : ""}
    </section>`;
  }).join("");
  return `${header("Offene Daten", { back: "transfer" })}<main class="wrap">
    <section class="card">
      <p class="small">Alles, was du am Handy erfasst oder geändert hast und noch nicht an den PC gesendet ist. <b>Bearbeiten</b> öffnet den Eintrag im jeweiligen Bereich. <b>Verwerfen</b> nimmt die Änderung am Handy zurück – dann gilt wieder der Stand vom PC.</p>
      ${total ? `<button class="btn primary block" data-go="send">An den PC senden</button>` : `<p class="empty">Alles übertragen – keine offenen Daten.</p>`}
    </section>
    ${areaCards}
  </main>`;
}

/** „HYROX · Männer Open · Wien · AK 30-34 · 1:28:12 · Platz 120. von 1.500 · AK 12. von 210“ */
function competitionText(c) {
  return [
    "HYROX",
    c.division ? HX.divisionLabel(c.division) : null,
    c.location,
    c.ageGroup ? `AK ${c.ageGroup}` : null,
    c.finishSeconds ? HX.formatFinishTime(c.finishSeconds) : null,
    c.rank ? `Platz ${HX.placementText(c.rank, c.field)}` : null,
    c.rankAge ? `AK ${HX.placementText(c.rankAge, c.fieldAge)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function viewDetail() {
  const own = S.workouts.find((x) => x.id === S.arg);
  const w = own ?? pcWorkout(S.arg);
  if (!w) return viewHome();
  const exs = exById();
  const machines = machineById();
  const adopt = S.trainAdopt?.id === w.id;
  return `${header(w.title, { back: "training", sub: `${fmtDate(w.date)}${w.startTime ? ` · ${w.startTime} Uhr` : ""}` })}<main class="wrap">
    ${S.trainNotice ? `<p class="${S.trainNotice.tone === "error" ? "warn" : "ok-note"}" role="status">${esc(S.trainNotice.text)}</p>` : ""}
    ${
      adopt
        ? `<div class="adopt-offer" role="group" aria-label="Richtwerte übernehmen"><span class="small">Sätze, Gewichte und Einstellungen von „${esc(w.title)}“ als neue Richtwerte in den Trainingstag übernehmen? Beim nächsten Start sind die Sätze damit vorbelegt.</span>
          <div class="row-actions"><button class="btn sm primary" data-act="train-adopt">In den Plan übernehmen</button><button class="btn sm" data-act="train-adopt-no">Nein danke</button></div></div>`
        : ""
    }
    <section class="card"><div class="stat">
      <div><b>${w.durationMin ?? "–"}</b><span>Minuten</span></div>
      <div><b>${w.perceivedExertion ?? "–"}</b><span>Anstrengung</span></div>
      <div><b>${C.fmtNum(C.volumeKg(w), 0)}</b><span>kg Volumen</span></div>
    </div>${w.competition ? `<p class="small"><b>${esc(competitionText(w.competition))}</b></p>` : ""}${w.notes ? `<p class="small">${esc(w.notes)}</p>` : ""}
    <p class="muted small">${!own ? "Einheit vom PC." : w.exported ? "An den PC gesendet." : "Noch nicht an den PC gesendet."}</p></section>
    ${w.exercises
      .map((we) => {
        const { name, nr } = exLabel(exs.get(we.exerciseId), machines);
        return `<section class="card"><div class="row"><span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span><h3 style="flex:1">${esc(name)}</h3></div>
          <p class="small">${we.sets
            .map((s) =>
              s.durationSeconds !== null || s.distanceM !== null
                ? `${s.isWarmup ? "W " : ""}${s.durationSeconds !== null ? `${Math.round(s.durationSeconds / 60)} min` : "–"}${s.distanceM !== null ? ` · ${C.fmtNum(s.distanceM / 1000)} km` : ""}${s.weightKg !== null ? ` · ${C.fmtNum(s.weightKg)} kg` : ""}${s.rpe ? ` @${C.fmtNum(s.rpe, 1)}` : ""}`
                : `${s.isWarmup ? "W " : ""}${s.reps ?? "–"} × ${s.weightKg !== null ? C.fmtNum(s.weightKg) + " kg" : "–"}${s.rpe ? ` @${C.fmtNum(s.rpe, 1)}` : ""}${s.isFailure ? " (Fail)" : ""}`,
            )
            .map(esc)
            .join("<br>")}</p></section>`;
      })
      .join("")}
    <button class="btn block" data-act="edit-workout" data-arg="${w.id}">Training bearbeiten</button>
    ${!own || w.exported || w.fromPc ? "" : `<button class="btn danger block" data-act="delete-workout" data-arg="${w.id}">Training löschen</button>`}
  </main>`;
}

function viewHelp() {
  return `${header("Hilfe", { back: S.catalog ? "home" : "setup" })}<main class="wrap">
    <section class="card"><h3>Wo sind meine Daten?</h3>
      <p class="small">Nur auf diesem Gerät, im Speicher des Browsers. Es gibt kein Konto und keinen Server. Die App selbst wird einmal von lifespan-os.github.io geladen und läuft danach auch offline.</p></section>
    <section class="card"><h3>iPhone: unbedingt zum Home-Bildschirm</h3>
      <p class="small">In Safari auf „Teilen“ → „Zum Home-Bildschirm“ tippen und LIFESPAN danach immer über das Symbol öffnen. Sonst darf Safari die gespeicherten Daten nach längerer Pause löschen. Sende deine Trainings regelmäßig an den PC.</p></section>
    <section class="card"><h3>Ablauf</h3>
      <ol class="steps small">
        <li>PC → Handy: Am PC exportieren, Datei in Google Drive legen, hier laden.</li>
        <li>Im Studio: Plan starten oder freies Training, Sätze eintragen und abhaken. Der Pausentimer startet beim Abhaken.</li>
        <li>Handy → PC: „An den PC senden“, Datei in Google Drive sichern, am PC mit „Abgleichen (zweites Gerät)“ importieren.</li>
      </ol></section>
    <section class="card"><h3>Gut zu wissen</h3>
      <p class="small">Neue Pläne oder Maschinen vom PC kommen erst mit einer neuen Exportdatei aufs Handy. Trainings auf dem Handy bleiben beim Laden neuer Daten erhalten.</p>
      <p class="small">LIFESPAN OS Mobil ${C.MOBILE_VERSION} · ein Non-Profit-Projekt</p></section>
  </main>`;
}

const VIEWS = {
  sleep: viewSleep,
  recovery: viewRecovery,
  "log-edit": viewLogEdit,
  insights: viewInsights,
  todos: viewTodos,
  "checklist-edit": viewChecklistEdit,
  icoach: viewICoach,
  health: viewHealth,
  "lab-edit": viewLabEdit,
  super: viewSuper,
  "hrt-edit": viewHrtEdit,
  "protocol-edit": viewProtocolEdit,
  "substance-edit": viewSubstanceEdit,
  diary: viewDiary,
  "food-history": viewNutritionHistory,
  food: viewFood,
  "food-review": viewFoodReview,
  body: viewBody,
  "body-metric": viewBodyMetric,
  "body-entry": viewBodyEntry,
  dish: viewDish,
  setup: viewSetup,
  home: viewHome,
  training: viewTrainingSection,
  settings: viewSettings,
  transfer: viewTransfer,
  "pc-only": viewPcOnly,
  plans: viewPlans,
  workout: viewWorkout,
  picker: viewPicker,
  machine: viewMachine,
  finish: viewFinish,
  send: viewSend,
  pending: viewPending,
  "account-new": viewAccountNew,
  "supp-intake": viewSuppIntake,
  "fast-entry": viewFastEntry,
  vendor: viewVendor,
  mimages: MI.viewMachineImages,
  goals: viewGoals,
  bls: viewBls,
  detail: viewDetail,
  help: viewHelp,
  quickfill: viewQuickFill,
  "meal-plan": viewMealPlan,
};

function render() {
  if (!S.catalog && S.view !== "help" && S.view !== "account-new") S.view = "setup";
  syncSections();
  app.innerHTML = (VIEWS[S.view] || viewHome)();
  // Kleingedrucktes hinter das Info-Symbol (1.64.0) – sofort, damit nichts aufblitzt
  enhanceInfo(app);
  foldTabs();
  renderNav();
  measureHead();
  if (S.view === "picker") {
    const q = document.getElementById("q");
    q?.focus();
  }
  renderRest();
}

/**
 * Alle Auswahlmenüs öffnen sich als Fach von unten (1.23.0, überall seit 1.31.0):
 * - Reiter eines Bereichs (`nav.tabs`): oranger Knopf mit dem gewählten Reiter, Fach mit allen Reitern,
 * - Auswahlgruppen mit `data-sheet="Titel"` (z. B. Kategorien, Checklisten): gleich wie Reiter,
 * - Inhalte mit `data-sheet-panel="Titel"` und `data-close="aktion|arg"` (z. B. ein geöffnetes Modul).
 * Das Fach liegt in `#sheet-root` direkt im Body – kein Eltern-Element (Kopf mit Schrägschnitt,
 * Karten, Scrollbereiche) kann es abschneiden oder überdecken. Offen/zu je Schlüssel in `S.tabsOpen`.
 */
const sheetRoot = document.createElement("div");
sheetRoot.id = "sheet-root";
document.body.appendChild(sheetRoot);

const CLOSE_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>`;

function sheetToggle(key, label) {
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
function showSheet(title, body, closeAct, { grid = true } = {}) {
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

const ACTIVE_SEL = ".active,.on,.is-active,[aria-pressed=true],[aria-selected=true],[aria-current=page]";
let jumpTargets = [];

/** Überschrift einer Karte ohne das orange „/“. */
const headingText = (h) => h.textContent.replace(/^\s*\/\s*/, "").replace(/\s+/g, " ").trim();

function foldTabs() {
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
    S.subMenu = { key: "page", label: first.jump ? "Abschnitte" : first.active?.textContent.trim() || first.title, open: Boolean(S.tabsOpen?.page) };
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

// ------------------------------------------------------------------ Aktionen

function findWe(id) {
  return S.active?.exercises.find((e) => e.id === id) || null;
}
function findSet(weId, setId) {
  return findWe(weId)?.sets.find((s) => s.id === setId) || null;
}

// ------------------------------------------------------------------ Menü (wie die linke Leiste am PC)

const navRoot = document.createElement("div");
navRoot.id = "nav-root";
document.body.appendChild(navRoot);

/** Ansichten mit eigener Leiste unten (Training läuft, Speichern): dort keine Hauptleiste. */
const NO_TABBAR = new Set(["setup", "workout", "picker", "machine", "finish", "supp-intake", "fast-entry", "account-new"]);

function renderNav() {
  if (!S.catalog) {
    navRoot.innerHTML = "";
    document.body.classList.remove("has-tabbar");
    return;
  }
  const bar = !NO_TABBAR.has(S.view) && !app.querySelector(".bottom");
  navRoot.innerHTML =
    drawerHtml({ view: S.view, arg: S.arg, open: S.menuOpen, esc, back: S.logEdit?.back ?? null }) +
    (bar ? tabbarHtml({ view: S.view, arg: S.arg, back: S.logEdit?.back ?? null, quickOpen: Boolean(S.quickOpen), slots: S.prefs.barSlots, sub: S.subMenu }) + quickSheetHtml(Boolean(S.quickOpen), DP.quickItems(QUICK, S.prefs.quick)) : "");
  document.body.classList.toggle("has-tabbar", bar);
  // Mit Knopf unten entfällt der Reiter-Knopf oben links
  document.body.classList.toggle("has-submenu", Boolean(bar && S.subMenu));
  document.body.classList.toggle("menu-open", Boolean(S.menuOpen || (bar && S.quickOpen)));
}

/** Schnell erfassen (Design C): Ziel je Eintrag. */
function quickGo(id) {
  S.quickOpen = false;
  S.menuOpen = false;
  const t = todayIso();
  if (id === "meal") {
    const f = S.food;
    if (f) {
      f.mealType = N.suggestMealType(new Date().getHours());
      f.trackDate = t;
      f.returnTo = "diary";
    }
    S.diaryDate = t;
    return go(f ? "food" : "diary");
  }
  if (id === "water") {
    S.diaryDate = t;
    return go("diary");
  }
  if (id === "training") S.trainTab = "workouts";
  if (id === "checkin") {
    S.bodyTab = "checkins";
    return go("body");
  }
  if (id === "body") return bodyOpenEntry(null);
  if (id === "caffeine") S.icTab = "widgets";
  if (id === "todo") S.todoDate = t;
  const view = { body: "body", training: "training", sleep: "sleep", recovery: "recovery", todo: "todos", caffeine: "icoach" }[id];
  return go(view ?? "home");
}

function setMenu(open) {
  S.menuOpen = open;
  const drawer = navRoot.querySelector(".drawer");
  if (!drawer) renderNav();
  else {
    // Klassen umschalten statt neu zeichnen – so gleitet das Menü herein
    drawer.classList.toggle("open", open);
    navRoot.querySelector(".drawer-backdrop")?.classList.toggle("open", open);
    drawer.toggleAttribute("inert", !open);
    if (open) drawer.removeAttribute("aria-hidden");
    else drawer.setAttribute("aria-hidden", "true");
    document.body.classList.toggle("menu-open", open);
  }
  document.querySelector(".menu-btn")?.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) navRoot.querySelector(".drawer__item.active, .drawer__item")?.focus();
}

navRoot.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  if (el.dataset.act === "menu-close") return setMenu(false);
  if (el.dataset.act === "menu-open-bar") {
    S.quickOpen = false;
    return setMenu(true);
  }
  if (el.dataset.act === "quick-open" || el.dataset.act === "quick-close") {
    S.quickOpen = el.dataset.act === "quick-open" ? !S.quickOpen : false;
    return renderNav();
  }
  if (el.dataset.act === "quick-go") return quickGo(el.dataset.arg);
  // Untermenü-Knopf (1.32.0): Fach mit den Reitern der Seite
  if (el.dataset.act === "tabs-fold") {
    S.quickOpen = false;
    return actions["tabs-fold"](el);
  }
  if (el.dataset.act === "tabbar-go") {
    S.menuOpen = false;
    S.quickOpen = false;
    const id = el.dataset.arg;
    if (id === "training") S.trainTab = "workouts";
    if (id === "nutrition") S.diaryDate = S.diaryDate ?? todayIso();
    const sec = SECTIONS.find((x) => x.id === id);
    return go(sec?.view ?? "home");
  }
  if (el.dataset.act === "menu-go") {
    S.menuOpen = false;
    const sec = SECTIONS.find((x) => x.id === el.dataset.arg);
    return sec?.view ? go(sec.view) : go("pc-only", el.dataset.arg);
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && S.menuOpen) setMenu(false);
  if (ev.key === "Escape" && S.quickOpen) {
    S.quickOpen = false;
    renderNav();
  }
});

/**
 * Grundansicht (1.40.0): Die App vergrößert nie (index.html: „maximum-scale=1“ – iOS zoomt beim
 * Antippen eines Felds nicht mehr hinein, das nächste Feld ist direkt antippbar). Nach dem Schließen
 * der Tastatur bzw. dem Verlassen eines Felds rastet die Ansicht wieder ein: keine seitliche
 * Verschiebung, Kopf und untere Leiste an ihrem Platz (iOS lässt sonst manchmal einen Versatz stehen).
 */
const isField = (el) => el?.matches?.("input, textarea, select");
function settleViewport() {
  if (isField(document.activeElement)) return;
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo(0, Math.min(window.scrollY, max));
}
document.addEventListener("focusout", (ev) => {
  if (!isField(ev.target)) return;
  setTimeout(settleViewport, 80);
});
{
  // Tastatur zu: sichtbare Höhe wächst wieder auf die volle Höhe
  let lastH = window.visualViewport?.height ?? window.innerHeight;
  window.visualViewport?.addEventListener("resize", () => {
    const h = window.visualViewport.height;
    if (h > lastH + 80) setTimeout(settleViewport, 50);
    lastH = h;
  });
}

/**
 * Tastatur offen (1.59.0, Wunsch des Nutzers): Solange ein Eingabefeld den Fokus hat, bleibt die
 * untere Menüleiste ausgeblendet – sie würde sonst über der Tastatur stehen und der Auswahl Platz
 * nehmen. Die Lebensmittelsuche springt beim Antippen ganz nach oben (unter den Kopf), darunter ist
 * genug Platz, damit das auch am Seitenende geht.
 */
const TYPING = /^(text|search|number|email|tel|url|password)$/;
const typingField = (el) => el?.matches?.("textarea") || (el?.matches?.("input") && TYPING.test(el.type || "text"));
document.addEventListener("focusin", (ev) => {
  if (!typingField(ev.target)) return;
  document.body.classList.add("is-typing");
  const search = ev.target.id === "food-q" || ev.target.id === "dish-q" ? ev.target.closest(".card") : null;
  if (search) {
    document.body.classList.add("is-searching");
    // nach dem Aufgehen der Tastatur (Ansicht wird kleiner) ausrichten
    const align = () => search.scrollIntoView({ block: "start" });
    requestAnimationFrame(align);
    setTimeout(align, 320);
  }
});
document.addEventListener("focusout", (ev) => {
  if (!typingField(ev.target)) return;
  setTimeout(() => {
    if (typingField(document.activeElement)) return;
    document.body.classList.remove("is-typing");
    if (!(ev.target.value ?? "").trim()) document.body.classList.remove("is-searching");
  }, 60);
});

/** Höhe des Kopfs als CSS-Variable – Sprungziele landen darunter statt dahinter (1.40.0). */
function measureHead() {
  const h = document.querySelector(".top")?.offsetHeight ?? 0;
  document.documentElement.style.setProperty("--head-h", `${h}px`);
}
window.addEventListener("resize", measureHead);

function rerenderKeepScroll() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

/** Trainingstag (ID) aus einem Plan starten (wie „Tag starten“ am PC). */
function startPlanDay(dayId) {
  for (const p of S.catalog.plans) {
    const d = p.days.find((x) => x.row.id === dayId);
    if (d) return startWorkout(d.row.name, d, p.row.gym_id ?? null);
  }
  toast("Den Trainingstag gibt es nicht mehr.", true);
}

/**
 * Einheit nachtragen bzw. Cardio erfassen (wie „Nachtragen“ und „Cardio erfassen“ am PC): ein
 * Eintrag mit Datum, Uhrzeit und Dauer, kein laufendes Training. Intern eine Bearbeitung ohne
 * Vorlage (`pcOriginal` leer), gespeichert wird mit „Speichern“.
 */
async function startBackfill(date, exerciseId = null) {
  if (S.active) return go("workout");
  const ex = exerciseId ? C.allExercises(S.catalog, S.localExercises).find((e) => e.id === exerciseId) : null;
  const w = C.newWorkout({ title: ex ? ex.name : "Training", gymId: GY.activeGymIdNow() });
  w.date = date;
  w.startTime = null;
  w.status = "done";
  w.durationMin = null;
  w.exported = false;
  const original = { ...w, exercises: [] };
  if (ex) w.exercises.push(C.workoutExercise({ exerciseId: ex.id, last: C.lastSessionFor(S.catalog, S.workouts, ex.id) }));
  S.active = { ...C.startEdit(w), pcOriginal: original, backfill: true };
  await saveNow();
  go(ex ? "workout" : "picker");
}

/** Einheit vom PC (Zeilen der Exportdatei) als Handy-Training. */
function pcWorkout(id) {
  const db = buildDb();
  const w = db.workouts.find((x) => x.id === id);
  if (!w) return null;
  const wex = db.wexByWorkout.get(id) ?? [];
  return C.workoutFromPc(w, wex, db.setsByWex);
}

async function startWorkout(title, planDay = null, planGymId = null) {
  if (S.active) return go("workout");
  // Gym (1.65.0): das des Plans, sonst das aktive Gym
  const w = C.newWorkout({ title, planDayId: planDay?.row.id ?? null, gymId: planGymId || GY.activeGymIdNow() });
  if (planDay) {
    for (const pe of planDay.exercises) {
      w.exercises.push(C.workoutExercise({ exerciseId: pe.exerciseId, planExercise: pe, last: C.lastSessionFor(S.catalog, S.workouts, pe.exerciseId) }));
    }
  }
  S.active = w;
  await saveNow();
  wakeLock(true);
  go(planDay ? "workout" : "picker");
}

function addExercise(exerciseId) {
  const template = HX.hyroxTemplate(exerciseId);
  if (template) {
    const first = addHyrox(template);
    setFocus(S.active, first.id);
    saveSoon();
    S.query = "";
    go("workout");
    requestAnimationFrame(() => document.getElementById(`ex-${first.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    return;
  }
  const last = C.lastSessionFor(S.catalog, S.workouts, exerciseId, S.active.id);
  const we = C.workoutExercise({ exerciseId, last });
  S.active.exercises.push(we);
  setFocus(S.active, we.id);
  saveSoon();
  S.query = "";
  go("workout");
  requestAnimationFrame(() => document.getElementById(`ex-${we.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
}

const actions = {
  ...foodActions,
  ...diaryActions,
  ...vendorActions,
  ...MI.machineImageActions,
  ...catalogActions,
  ...goalActions,
  ...settingsActions,
  ...layoutActions,
  "rem-go": (el) => {
    const k = el.dataset.arg;
    if (k === "weigh") return quickGo("body");
    if (k === "hrt") return go("super");
    S.diaryDate = todayIso();
    return go("diary");
  },
  ...blsActions,
  ...offActions,
  ...overviewActions,
  ...logsActions,
  ...insightsActions,
  ...weeklyReportsActions,
  ...todoActions,
  ...icoachActions,
  ...healthActions,
  ...superActions,
  ...bodyActions,
  ...extrasActions,
  ...trainingActions,
  ...GY.gymsActions,
  "start-free": () => startWorkout("Freies Training"),
  "comp-add": () => {
    S.active.competition = { ...HX.emptyCompetition(null), sex: "women" };
    saveSoon();
    rerenderKeepScroll();
  },
  "comp-remove": () => {
    S.active.competition = null;
    saveSoon();
    rerenderKeepScroll();
  },
  "comp-sex": (el) => {
    const c = S.active?.competition;
    if (!c) return;
    c.sex = el.dataset.arg;
    if (c.division && !HX.divisionsFor(c.sex).some((d) => d.value === c.division)) {
      c.division = HX.defaultDivision(c.sex);
      applyDivisionWeights(S.active, c.division);
    }
    saveSoon();
    rerenderKeepScroll();
  },
  "start-plan": (el) => {
    for (const p of S.catalog.plans) {
      const d = p.days.find((x) => x.row.id === el.dataset.arg);
      if (d) return startWorkout(d.row.name, d, p.row.gym_id ?? null);
    }
  },
  "pick-machine": (el) => {
    // Maschine mit Übungen: Auswahl zeigen (mehrere Übungen an einer Maschine sind möglich)
    if (C.machineExercises(S.catalog, S.localExercises, el.dataset.arg).length > 0) {
      go("machine", el.dataset.arg);
      return;
    }
    try {
      const { exercise, created } = C.exerciseForMachine(S.catalog, S.localExercises, el.dataset.arg);
      if (created) S.localExercises.push(exercise);
      addExercise(exercise.id);
    } catch (e) {
      toast(e.message, true);
    }
  },
  "pick-exercise": (el) => addExercise(el.dataset.arg),
  "new-machine-ex": (el) => {
    const name = document.getElementById("new-ex-name")?.value ?? "";
    try {
      const { exercise, created } = C.newMachineExercise(S.catalog, S.localExercises, el.dataset.arg, name);
      if (created) S.localExercises.push(exercise);
      addExercise(exercise.id);
    } catch (e) {
      toast(e.message, true);
    }
  },
  "toggle-done": (el) => {
    const we = findWe(el.dataset.we);
    const s = findSet(el.dataset.we, el.dataset.set);
    if (!s) return;
    s.isDone = !s.isDone;
    if (s.isDone && we.restSeconds) startRest(we.restSeconds);
    // Übung fertig: nächste offene Übung wird die aktuelle (aufgeklappt), diese klappt zu
    if (s.isDone && we.sets.every((x) => x.isDone)) {
      const list = S.active.exercises;
      const idx = list.findIndex((e) => e.id === we.id);
      const next = [...list.slice(idx + 1), ...list.slice(0, idx)].find((e) => !e.sets.length || e.sets.some((x) => !x.isDone));
      if (next) {
        setFocus(S.active, next.id);
        delete S.exOpen?.[we.id];
        saveSoon();
        render();
        requestAnimationFrame(() => document.getElementById(`ex-${next.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
        return;
      }
    }
    // abgehakte Übung wird die aktuelle (wie am PC)
    if (s.isDone && !exComplete(we) && focusExId(S.active) !== we.id) setFocus(S.active, we.id);
    saveSoon();
    rerenderKeepScroll();
  },
  flag: (el) => {
    const s = findSet(el.dataset.we, el.dataset.set);
    if (!s) return;
    s[el.dataset.flag] = !s[el.dataset.flag];
    saveSoon();
    rerenderKeepScroll();
  },
  "toggle-profile": (el) => {
    const we = findWe(el.dataset.we);
    const ex = exById().get(we.exerciseId);
    const vis = C.visibleProfiles(we, ex);
    const k = el.dataset.arg;
    if (vis.includes(k) && el.dataset.locked) return toast("Erst die Werte in dieser Spalte löschen.", true);
    we.profiles = vis.includes(k) ? vis.filter((x) => x !== k) : C.PROFILE_KEYS.filter((x) => x === k || vis.includes(x));
    saveSoon();
    rerenderKeepScroll();
  },
  "focus-info": (el) => {
    S.focusOpen = S.focusOpen === el.dataset.arg ? null : el.dataset.arg;
    rerenderKeepScroll();
  },
  "toggle-ex": (el) => {
    const we = findWe(el.dataset.we);
    if (!we) return;
    if (!S.exOpen) S.exOpen = {};
    S.exOpen[we.id] = !isOpen(S.active, we);
    rerenderKeepScroll();
  },
  "add-set": (el) => {
    const we = findWe(el.dataset.we);
    const prev = we.sets[we.sets.length - 1] || null;
    we.sets.push(C.newSet(prev ? { ...prev, isWarmup: false } : null));
    saveSoon();
    rerenderKeepScroll();
  },
  "del-set": (el) => {
    const we = findWe(el.dataset.we);
    we.sets = we.sets.filter((s) => s.id !== el.dataset.set);
    saveSoon();
    rerenderKeepScroll();
  },
  "remove-ex": (el) => {
    const we = findWe(el.dataset.we);
    if (we.sets.some((s) => s.isDone) && !confirmTwice(el, "Wirklich entfernen?")) return;
    S.active.exercises = S.active.exercises.filter((e) => e.id !== el.dataset.we);
    saveSoon();
    rerenderKeepScroll();
  },
  "move-up": (el) => {
    const list = S.active.exercises;
    const i = list.findIndex((e) => e.id === el.dataset.we);
    if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    saveSoon();
    rerenderKeepScroll();
  },
  discard: async (el) => {
    const editOf = S.active?.editOf ?? null;
    if (!confirmTwice(el, editOf ? "Nochmal tippen: Änderungen verwerfen" : "Nochmal tippen: Training wirklich verwerfen")) return;
    S.active = null;
    stopRest();
    wakeLock(false);
    await saveNow();
    toast(editOf ? "Änderungen verworfen" : "Training verworfen");
    if (editOf && (S.workouts.some((w) => w.id === editOf) || pcWorkout(editOf))) go("detail", editOf);
    else go("training");
  },
  exertion: (el) => {
    const n = Number(el.dataset.arg);
    S.active.perceivedExertion = S.active.perceivedExertion === n ? null : n;
    saveSoon();
    rerenderKeepScroll();
  },
  finish: async () => {
    const opts = { keepUnticked: S.prefs.keepUnticked };
    if (C.checkWorkout(S.active, opts).length) return render();
    if (S.active.editOf) {
      const d = S.active.durationMin;
      if (d !== null && (!Number.isFinite(d) || d < 1 || d > 1440)) return render();
      if (!S.active.date || !/^\d{4}-\d{2}-\d{2}$/.test(S.active.date)) return toast("Bitte ein gültiges Datum angeben.", true);
      if (S.active.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(S.active.startTime)) return toast("Uhrzeit als HH:MM eingeben.", true);
      const i = S.workouts.findIndex((x) => x.id === S.active.editOf);
      const original = i >= 0 ? S.workouts[i] : S.active.pcOriginal;
      if (!original) {
        toast("Das ursprüngliche Training gibt es nicht mehr.", true);
        return;
      }
      const { pcOriginal, backfill, ...edited } = S.active;
      void pcOriginal;
      if (backfill && !edited.exercises.some((e) => e.sets.length)) return toast("Bitte mindestens eine Übung mit Satz eintragen.", true);
      const saved = C.saveEdit(original, edited, new Date(), opts);
      if (i >= 0) S.workouts[i] = saved;
      else S.workouts.push(saved);
      S.active = null;
      stopRest();
      wakeLock(false);
      await saveNow();
      toast(backfill ? "Einheit gespeichert" : "Änderungen gespeichert");
      go("detail", saved.id);
      return;
    }
    const done = C.finishWorkout(S.active, new Date(), opts);
    S.workouts.push(done);
    // Aus einem Plan: Angebot, die Werte als Richtwerte in den Trainingstag zu übernehmen (wie am PC)
    S.trainAdopt = done.planDayId && TR.hasTable(S.catalogRaw, "training_plan") ? { id: done.id, title: done.title } : null;
    S.active = null;
    stopRest();
    wakeLock(false);
    await saveNow();
    toast("Training gespeichert");
    go("detail", done.id);
  },
  send: (el) => {
    const [kind, scope] = el.dataset.arg.split("|");
    sendFile(kind, scope === "all");
  },
  "mark-sent": async (el) => {
    await markSent(el.dataset.arg);
    toast("Als übertragen markiert");
    go("home");
  },
  // Nach dem Senden automatisch markieren (Settings → Import/Export, 1.48.0): Tipp auf die Datei
  "sent-auto": async (el) => {
    if (!S.prefs.transfer.autoMark) return;
    await markSent(el.dataset.arg);
    const note = document.getElementById("send-auto-note");
    if (note) note.textContent = "Als übertragen markiert.";
    toast("Als übertragen markiert");
  },
  "edit-workout": async (el) => {
    if (S.active) {
      toast(S.active.editOf ? "Erst die laufende Bearbeitung speichern oder verwerfen." : "Erst das laufende Training beenden.", true);
      return;
    }
    const own = S.workouts.find((x) => x.id === el.dataset.arg);
    const w = own ?? pcWorkout(el.dataset.arg);
    if (!w) return;
    S.active = own ? C.startEdit(w) : { ...C.startEdit(w), pcOriginal: w };
    await saveNow();
    go("workout");
  },
  "delete-workout": async (el) => {
    if (!confirmTwice(el, "Nochmal tippen: Training löschen")) return;
    S.workouts = S.workouts.filter((w) => w.id !== el.dataset.arg);
    await saveNow();
    go("home");
  },
  "pending-toggle": (el) => {
    S.pendingOpen = S.pendingOpen === el.dataset.arg ? null : el.dataset.arg;
    render();
  },
  "pending-edit": (el) => {
    const it = PD.pendingItems(S).find((x) => x.key === el.dataset.arg);
    if (!it?.edit) return;
    const t = it.edit;
    Object.assign(S, t.set ?? {});
    S.trainNotice = null;
    S.view = t.view;
    S.arg = t.viewArg ?? null;
    const fn = t.act ? actions[t.act] : null;
    if (fn) fn({ dataset: { arg: t.arg }, closest: () => null });
    render();
    window.scrollTo(0, 0);
  },
  "pending-discard": async (el) => {
    const all = PD.pendingItems(S);
    const it = all.find((x) => x.key === el.dataset.arg);
    if (!it) return;
    if (!confirmTwice(el, it.status === "Löschung" ? "Nochmal tippen: wiederherstellen" : "Nochmal tippen: verwerfen")) return;
    let stores;
    try {
      stores = PD.discardItem(S, it, all);
    } catch (e) {
      return toast(e.message, true);
    }
    for (const name of stores) await store.set(name, name === "body" ? S.body.local : S[name]);
    if (stores.includes("train")) refreshCatalog();
    S.pendingOpen = null;
    toast(it.status === "Löschung" ? `„${it.title}“ wiederhergestellt` : `„${it.title}“ verworfen`);
    render();
  },
  "pending-wo-discard": async (el) => {
    if (!confirmTwice(el, "Nochmal tippen: Training verwerfen")) return;
    S.workouts = S.workouts.filter((w) => w.id !== el.dataset.arg);
    await saveNow();
    toast("Training verworfen");
    render();
  },
  "account-new": () => {
    S.accountForm = null;
    go("account-new");
  },
  "account-create": async () => {
    const val = (id) => document.getElementById(id)?.value ?? "";
    const f = { name: val("acc-name"), sex: val("acc-sex"), birthDate: val("acc-birth"), heightCm: val("acc-height"), error: null, busy: true };
    S.accountForm = f;
    render();
    try {
      const reload = await createAccount(f);
      S.accountForm = null;
      if (reload) {
        toast(`Konto „${f.name.trim()}“ angelegt`);
        setTimeout(() => location.reload(), 600);
        return;
      }
      toast(`Konto „${f.name.trim()}“ angelegt`);
      go("home");
    } catch (e) {
      S.accountForm = { ...f, busy: false, error: e.message };
      render();
    }
  },
  "account-switch": (el) => switchAccount(el.dataset.arg),
  // Konto umbenennen (1.48.0): ein anderes Konto bekommt den Namen beim nächsten Wechsel auch im Profil
  "account-rename-cancel": () => {
    S.accRename = null;
    rerenderKeepScroll();
  },
  "account-rename": (el) => {
    S.accRename = el.dataset.arg;
    rerenderKeepScroll();
    setTimeout(() => document.getElementById("acc-rename")?.focus(), 0);
  },
  "account-rename-save": async (el) => {
    const id = el.dataset.arg;
    const name = (document.getElementById("acc-rename")?.value ?? "").trim();
    if (!name || [...name].length > 60) return toast("Bitte einen Namen mit höchstens 60 Zeichen eingeben.", true);
    if (id === "") {
      S.mainAccountName = name;
      await store.setGlobal("mainName", name);
      await store.setGlobal("mainRename", name);
    } else {
      S.accounts = S.accounts.map((a) => (a.id === id ? { ...a, name, rename: name } : a));
      await store.setGlobal("accounts", S.accounts);
    }
    S.accRename = null;
    toast(`Umbenannt in „${name}“`);
    render();
  },
  "account-export": (el) => exportAccount(el),
  "account-delete": async (el) => {
    const id = el.dataset.arg;
    const name = accountName(id);
    if (!confirmTwice(el, "Nochmal tippen: endgültig löschen")) return;
    await store.clearAccount(id);
    S.accounts = S.accounts.filter((a) => a.id !== id);
    await store.setGlobal("accounts", S.accounts);
    toast(`Konto „${name}“ mit allen Daten gelöscht`);
    render();
  },
  "transfer-glucose": () => {
    S.healthTab = "glucose";
    return go("health");
  },
  "bar-reset": async () => {
    delete S.prefs.barSlots;
    await saveNow();
    toast("Untere Leiste: Training und Nutrition");
    render();
  },
  // Untermenü „Abschnitte“: zur Überschrift springen (1.33.0)
  "sheet-jump": (el) => {
    const h = jumpTargets[Number(el.dataset.arg)];
    S.tabsOpen = { ...(S.tabsOpen ?? {}), page: false };
    foldTabs();
    renderNav();
    const card = h?.closest(".card") ?? h;
    // scroll-padding-top (Höhe des Kopfs) sorgt dafür, dass die Karte unter dem Kopf beginnt
    card?.scrollIntoView({ block: "start", behavior: "smooth" });
  },
  "tabs-fold": (el) => {
    const key = el.dataset.arg;
    S.tabsOpen = { ...(S.tabsOpen ?? {}), [key]: !S.tabsOpen?.[key] };
    rerenderKeepScroll();
  },
  "menu-open": () => setMenu(true),
  "menu-go": (el) => {
    S.menuOpen = false;
    // Links auf einen Reiter (wie #/training?tab=neat am PC); aus dem Menü immer der erste Reiter
    if (el.dataset.arg === "training") S.trainTab = el.dataset.tab ?? (el.closest(".drawer") ? "workouts" : S.trainTab ?? "workouts");
    // Body: direkt „Werte erfassen“, auf Wunsch beim Bereich (z. B. „entry:circumference“, 1.40.0)
    if (el.dataset.arg === "body" && el.dataset.tab?.startsWith("entry")) return bodyOpenEntry(el.dataset.tab.split(":")[1] ?? null);
    // Check-Ins liegen seit 1.60.0 unter Body & Longevity; aus dem Menü immer „Erfassen“
    if (el.dataset.arg === "body") S.bodyTab = el.dataset.tab ?? (el.closest(".drawer") ? "entry" : S.bodyTab ?? "entry");
    const sec = SECTIONS.find((x) => x.id === el.dataset.arg);
    return sec?.view ? go(sec.view) : go("pc-only", el.dataset.arg);
  },
  "rest-plus": () => adjustRest(15),
  "rest-minus": () => adjustRest(-15),
  "rest-stop": () => stopRest(),
};

/** Zweistufige Bestätigung im Knopf selbst (Browser-Dialoge sind auf dem Handy unpraktisch). */
function confirmTwice(el, text) {
  if (el.dataset.armed === "1") return true;
  el.dataset.armed = "1";
  const old = el.textContent;
  el.textContent = text;
  setTimeout(() => {
    if (el.isConnected) {
      el.dataset.armed = "";
      el.textContent = old;
    }
  }, 3500);
  return false;
}

/** Tabellen zweier Teile zusammenlegen (z. B. `settings` aus Strichcodes und Glasgröße). */
function mergeTables(a, b) {
  const out = { ...a };
  for (const [name, list] of Object.entries(b)) out[name] = [...(out[name] ?? []), ...list];
  return out;
}

/**
 * Tabellen für „Lebensmittel senden“: Ernährung, Wasser und Supplement-Einnahmen (1.26.0). Eine
 * Einnahme nimmt ihre Mahlzeit und ihren Stack mit, wenn sie sonst fehlen würden.
 */
function foodTables(all) {
  const out = mergeTables(mergeTables(N.nutritionTables(S.catalog, S.food.local, { all }), P.waterTables(S.water, { all })), SP.suppTables(S.supp, buildDb(), { all, withSupplements: Boolean(S.catalog?.startpaket) }));
  // Verwendeter Stack (vom PC) und Mahlzeit gehen mit – sonst lehnt der PC die Datei ab (1.45.1)
  const pcMeals = S.catalog?.pc?.meal ?? [];
  // Fasttracking (1.55.0): Werte an einer Mahlzeit nehmen ihre Mahlzeit mit, wenn sie sonst fehlt
  const fast = FT.fastTables(S.fast, {
    all,
    have: new Set((out.meal ?? []).map((m) => m.id)),
    mealOf: (id) => S.food.local.meals[id]?.row ?? pcMeals.find((m) => m.id === id) ?? null,
  });
  Object.assign(out, mergeTables(out, fast));
  return SP.withIntakeParents(out, {
    stacks: S.catalog?.pc?.supplement_stack ?? [],
    mealOf: (id) => S.food.local.meals[id]?.row ?? pcMeals.find((m) => m.id === id) ?? null,
  });
}

/** Tabellen für „Körperwerte … senden“: Körperwerte, Schlaf, To-dos, Health, Superhuman, Checklisten, Koffein, Training am Handy, Ziele. */
function bodyPartTables(all) {
  // Verweise mitnehmen (1.68.1): sonst lehnt der PC z. B. eine geänderte Übung ab, deren Maschine nicht in der Datei steht
  return TR.withReferences(bodyPartTablesRaw(all), referencedRow);
}

/** Zeile vom Stand des Handys (PC-Daten plus Änderungen am Handy) für `TR.withReferences`. */
function referencedRow(table, id) {
  if (table === "machine") return S.catalog?.machines?.find((m) => m.id === id) ?? null;
  if (table === "gym") return GD.gymRowsFor(S.catalog, S.gyms, [id])[0] ?? null;
  if (table === "exercise") return TR.rowsOf(S.catalog, S.train, "exercise").find((r) => r.id === id) ?? (S.localExercises ?? []).find((r) => r.id === id) ?? null;
  return TR.rowsOf(S.catalog, S.train, table).find((r) => r.id === id) ?? null;
}

function bodyPartTablesRaw(all) {
  return mergeTables(mergeTables(BD.bodyTables(S.catalog, S.body.local, { all }), LG.logTables(S.logs, { all })), mergeTables(TD.todoTables(S.todos, { all }), mergeTables(HD.healthTables(S.health, { all }), mergeTables(SD.superTables(S.super, { all }), mergeTables(mergeTables(CD.checklistTables(S.checklists, { all }), mergeTables(CF.caffeineTables(S.caffeine, { all }), GLD.glucoseTables(S.glucose, { all }))), mergeTables(TR.trainTables(S.train, { all }), mergeTables(GL.goalTables(S.goals, { all }), mergeTables(PS.syncTables(S.pcsettings, { all }), GD.gymTables(S.gyms, { all })))))))));
}

/**
 * Ganzes Konto am Handy als Exportdatei für den PC (1.29.0): Startpaket + Profil + alles Erfasste.
 * Am PC: neuer Benutzer → „Ersetzen“, bestehender Benutzer → „Abgleichen (zweites Gerät)“.
 */
async function exportAccount(el) {
  const result = document.getElementById("account-result");
  if (!S.catalog?.startpaket) return toast("Nur für ein Konto am Handy – Daten vom PC gehen über „An den PC senden“.", true);
  if (S.active) return toast("Erst das laufende Training beenden.", true);
  el.disabled = true;
  let doc;
  try {
    await saveNow();
    const start = await loadStartPackage();
    const now = new Date();
    let training = {};
    const done = S.workouts.filter((w) => w.status === "done");
    if (done.length) training = C.buildReturnFile(S.catalog, S.localExercises, done, now, { gym: GD.gymRowsFor(S.catalog, S.gyms, done.map((w) => w.gymId)) }).tables;
    const parts = [training, S.food ? foodTables(true) : {}, S.body ? bodyPartTables(true) : {}];
    doc = AX.fullAccountDoc(start, S.catalog.pc.profile[0], parts, { now, appVersion: `mobil ${C.MOBILE_VERSION}` });
  } catch (e) {
    el.disabled = false;
    return toast(e.message || "Die Kontodatei konnte nicht erstellt werden.", true);
  }
  el.disabled = false;
  const name = AX.accountFileName(accountName());
  const blob = new Blob([JSON.stringify(doc)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });
  result.innerHTML = "";
  let shared = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      shared = true;
    } catch (e) {
      if (e.name === "AbortError") return toast("Abgebrochen");
    }
  }
  const rows = Object.values(doc.tables).reduce((n, l) => n + l.length, 0);
  result.innerHTML = `<section class="card">
    ${shared ? `<p class="small">„${esc(name)}“ weitergegeben (${rows.toLocaleString("de-DE")} Einträge).</p>` : `<p class="small">Die Datei ist bereit (${rows.toLocaleString("de-DE")} Einträge). Tippe darauf und sichere sie in Google Drive:</p>
      <a class="btn blue block" href="${URL.createObjectURL(blob)}" download="${esc(name)}">${esc(name)}</a>`}
    <ol class="steps small">
      <li><b>Neuer Benutzer am PC:</b> LIFESPAN OS → Settings → Benutzer → neuen Benutzer anlegen und zu ihm wechseln. Dann Import/Export → Daten importieren → die Datei wählen → <b>„Ersetzen“</b>.</li>
      <li><b>Bestehender Benutzer:</b> Import/Export → Daten importieren → die Datei wählen → <b>„Abgleichen (zweites Gerät)“</b>.</li>
    </ol>
    <p class="small">Danach kannst du alles als übertragen markieren – die Daten bleiben am Handy, „An den PC senden“ zeigt dann nur noch Neues.</p>
    <button class="btn primary block" data-act="mark-sent" data-arg="all">Alles als übertragen markieren</button>
  </section>`;
  result.scrollIntoView({ block: "start", behavior: "smooth" });
}

/** Gesendetes als übertragen markieren (`arg` „training|ids“, „food“, „body“ oder „all“). */
async function markSent(arg) {
  const [kind, idList = ""] = arg.split("|");
  const ids = idList.split(",");
  // „all“ (ganzes Konto, 1.29.0): alle Trainings und alle Bereiche
  if (kind === "training") for (const w of S.workouts) if (ids.includes(w.id)) w.exported = true;
  if (kind === "all") for (const w of S.workouts) if (w.status === "done") w.exported = true;
  if ((kind === "body" || kind === "all") && S.body) {
    BD.markBodySent(S.body.local);
    await store.set("body", S.body.local);
    LG.markLogsSent(S.logs);
    await store.set("logs", S.logs);
    TD.markTodosSent(S.todos);
    await store.set("todos", S.todos);
    CD.markChecklistsSent(S.checklists);
    await store.set("checklists", S.checklists);
    CF.markCaffeineSent(S.caffeine);
    await store.set("caffeine", S.caffeine);
    GLD.markGlucoseSent(S.glucose);
    await store.set("glucose", S.glucose);
    HD.markHealthSent(S.health);
    await store.set("health", S.health);
    SD.markSuperSent(S.super);
    await store.set("super", S.super);
    TR.markTrainSent(S.train);
    await store.set("train", S.train);
    GD.markGymsSent(S.gyms);
    await store.set("gyms", S.gyms);
    GL.markGoalsSent(S.goals);
    await store.set("goals", S.goals);
    PS.markSyncSent(S.pcsettings);
    await store.set("pcsettings", S.pcsettings);
  }
  if ((kind === "food" || kind === "all") && S.food) {
    N.markNutritionSent(S.food.local);
    await store.set("nutrition", S.food.local);
    P.markWaterSent(S.water);
    await store.set("water", S.water);
    FT.markFastSent(S.fast);
    await store.set("fast", S.fast);
    SP.markSuppSent(S.supp);
    await store.set("supp", S.supp);
  }
  S.prefs.lastSentAt = new Date().toISOString();
  await saveNow();
}

/**
 * Rückgabedatei erstellen (1.2.4): Trainings und Ernährung getrennt – `kind` „training“ oder „food“,
 * `all` = auch schon gesendete.
 */
async function sendFile(kind, all) {
  const list = kind === "training" ? S.workouts.filter((w) => w.status === "done" && (all || !w.exported)) : [];
  let doc;
  try {
    const food =
      kind === "food" && S.food
        ? foodTables(all)
        : kind === "body" && S.body
          ? bodyPartTables(all)
          : {};
    if (kind === "food" && !Object.keys(food).length) return toast("Keine Ernährungseinträge zum Senden.", true);
    if (kind === "body" && !Object.keys(food).length) return toast("Keine Körperwerte, Schlaf-, Regenerations-, To-do-, Training-, Health- oder Superhuman-Einträge zum Senden.", true);
    if (kind === "training" && !list.length) return toast("Keine Trainings zum Senden.", true);
    // Gyms, auf die die Trainings verweisen, gehen mit (der PC braucht sie für die Zuordnung, 1.65.0)
    if (kind === "training") food.gym = GD.gymRowsFor(S.catalog, S.gyms, list.map((w) => w.gymId));
    doc = C.buildReturnFile(S.catalog, S.localExercises, list, new Date(), food);
  } catch (e) {
    return toast(e.message, true);
  }
  const name = C.returnFileName(new Date(), kind);
  const blob = new Blob([JSON.stringify(doc)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });
  const arg = kind === "training" ? `training|${list.map((w) => w.id).join(",")}` : kind;
  const result = document.getElementById("send-result");
  result.innerHTML = "";
  let shared = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      shared = true;
    } catch (e) {
      if (e.name === "AbortError") return toast("Abgebrochen");
    }
  }
  const auto = S.prefs.transfer.autoMark;
  if (!shared) {
    const url = URL.createObjectURL(blob);
    result.innerHTML = `<section class="card"><p class="small">Die Datei ist bereit. Tippe darauf und sichere sie in Google Drive:</p>
      <a class="btn blue block" href="${url}" download="${esc(name)}" ${auto ? `data-act="sent-auto" data-arg="${esc(arg)}"` : ""}>${esc(name)}</a>
      ${auto ? `<p class="muted small" id="send-auto-note">Wird beim Tippen auf die Datei als übertragen markiert (Settings → Import/Export).</p>` : ""}</section>`;
  } else if (auto) {
    await markSent(arg);
  }
  if (!auto)
    result.insertAdjacentHTML(
      "beforeend",
      `<section class="card"><p class="small">${shared ? `„${esc(name)}“ weitergegeben.` : ""} Sobald die Datei in Google Drive liegt:</p>
       <button class="btn primary block" data-act="mark-sent" data-arg="${esc(arg)}">Als übertragen markieren</button></section>`,
    );
  else if (shared) result.innerHTML = `<section class="card"><p class="small">„${esc(name)}“ weitergegeben und als übertragen markiert.</p></section>`;
  result.scrollIntoView({ block: "start", behavior: "smooth" });
}

// ------------------------------------------------------------------ Eingaben

app.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act],[data-go]");
  if (!el || el.disabled) return;
  unlockAudio();
  // Eintrag im Fach gewählt: Fach schließen
  if (el.dataset.sheetKey) S.tabsOpen = { ...(S.tabsOpen ?? {}), [el.dataset.sheetKey]: false };
  if (el.dataset.go) {
    return go(el.dataset.go, el.dataset.arg ?? null);
  }
  const fn = actions[el.dataset.act];
  if (fn) fn(el);
});
// Fächer von unten liegen außerhalb von #app: Klicks dort genauso behandeln
sheetRoot.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act],[data-go]");
  if (!el || el.disabled) return;
  if (el.dataset.sheetKey) S.tabsOpen = { ...(S.tabsOpen ?? {}), [el.dataset.sheetKey]: false };
  if (el.dataset.go) return go(el.dataset.go, el.dataset.arg ?? null);
  actions[el.dataset.act]?.(el);
});
restEl.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (el) actions[el.dataset.act]?.(el);
});

app.addEventListener("input", (ev) => {
  const el = ev.target;
  if (foodInput(el)) return;
  if (diaryInput(el)) return;
  if (blsInput(el)) return;
  if (quickFillInput(el)) return;
  if (bodyInput(el)) return;
  if (logsInput(el)) return;
  if (todoInput(el)) return;
  if (icoachInput(el)) return;
  if (healthInput(el)) return;
  if (superInput(el)) return;
  if (GY.gymsInput(el)) return;
  if (trainingInput(el)) return;
  if (el.id === "q") {
    S.query = el.value;
    document.getElementById("results").innerHTML = pickerResults();
    return;
  }
  if (el.dataset.f) {
    const s = findSet(el.dataset.we, el.dataset.set);
    if (!s) return;
    const v = C.parseNum(el.value);
    const ok = v === null || !Number.isNaN(v);
    el.setAttribute("aria-invalid", ok ? "false" : "true");
    el.style.borderColor = ok ? "" : "var(--danger)";
    const f = el.dataset.f;
    if (f.startsWith("rp:")) {
      if (!s.rp) s.rp = C.emptyProfiles();
      s.rp[f.slice(3)] = v;
      const total = C.profileTotal(s.rp);
      if (total !== null) s.weightKg = total;
      const kg = document.getElementById(`w-${el.dataset.we}-${el.dataset.set}`);
      if (kg) {
        kg.value = C.fmtNum(s.weightKg);
        kg.readOnly = total !== null;
        kg.classList.toggle("sum", total !== null);
      }
      saveSoon();
      return;
    }
    if (f === "reps") s.reps = v === null ? null : Number.isNaN(v) ? NaN : Math.round(v);
    else if (f === "weightKg") s.weightKg = v;
    else if (f === "rpe") s.rpe = v;
    else if (f === "durationMin") s.durationSeconds = v === null ? null : Number.isNaN(v) ? NaN : Math.round(v * 60);
    else if (f === "distanceKm") s.distanceM = v === null ? null : Number.isNaN(v) ? NaN : Math.round(v * 1000);
    saveSoon();
    return;
  }
  if (el.dataset.setting) {
    const we = findWe(el.dataset.we);
    we.settings[el.dataset.setting] = el.value.trim() || null;
    saveSoon();
    return;
  }
  if (el.dataset.field === "notes") {
    const we = findWe(el.dataset.we);
    we.notes = el.value.slice(0, 500) || null;
    saveSoon();
    return;
  }
  if (el.dataset.field === "restSeconds") {
    const we = findWe(el.dataset.we);
    const v = C.parseNum(el.value);
    we.restSeconds = v === null || Number.isNaN(v) ? null : Math.min(3600, Math.max(0, Math.round(v)));
    saveSoon();
    return;
  }
  if (el.dataset.cfield && S.active?.competition) {
    const c = S.active.competition;
    const f = el.dataset.cfield;
    if (f === "location") c.location = el.value.trim() || null;
    else if (f === "finish") {
      c.finishText = el.value;
      c.finishSeconds = HX.parseFinishTime(el.value);
      el.setAttribute("aria-invalid", Number.isNaN(c.finishSeconds) ? "true" : "false");
    } else if (["rank", "field", "rankAge", "fieldAge"].includes(f)) {
      const v = C.parseNum(el.value.replace(/\./g, ""));
      c[f] = v === null ? null : Number.isNaN(v) ? NaN : v;
      el.setAttribute("aria-invalid", Number.isNaN(c[f]) ? "true" : "false");
    }
    saveSoon();
    return;
  }
  if (el.dataset.wfield) {
    const f = el.dataset.wfield;
    S.active[f] = f === "title" ? el.value : f === "durationMin" ? C.parseNum(el.value) : el.value.trim() || null;
    saveSoon();
  }
});

app.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (foodChange(el)) return;
  if (bodyChange(el)) return;
  if (diaryChange(el)) return;
  if (vendorChange(el)) return;
  if (MI.machineImageChange(el)) return;
  if (catalogChange(el)) return;
  if (goalChange(el)) return;
  if (settingsChange(el)) return;
  if (layoutChange(el)) return;
  if (blsChange(el)) return;
  if (overviewChange(el)) return;
  if (logsChange(el)) return;
  if (todoChange(el)) return;
  if (icoachChange(el)) return;
  if (healthChange(el)) return;
  if (superChange(el)) return;
  if (GY.gymsChange(el)) return;
  if (trainingChange(el)) return;
  if (el.dataset?.cfield && S.active?.competition) {
    const c = S.active.competition;
    if (el.dataset.cfield === "division") {
      c.division = el.value || null;
      applyDivisionWeights(S.active, c.division);
      saveSoon();
      return rerenderKeepScroll();
    }
    if (el.dataset.cfield === "ageGroup") {
      c.ageGroup = el.value || null;
      return saveSoon();
    }
  }
  if (el.dataset?.bar !== undefined && el.dataset?.bar !== null && el.matches?.("[data-bar]")) {
    const slots = [...barSlots(S.prefs.barSlots)];
    slots[Number(el.dataset.bar)] = el.value;
    S.prefs.barSlots = slots;
    await saveNow();
    renderNav();
    return toast("Untere Leiste angepasst");
  }
  if (el.id === "only-nr") {
    S.prefs.onlyNumbered = el.checked;
    saveSoon();
    document.getElementById("results").innerHTML = pickerResults();
  } else if (el.id === "keep-unticked") {
    S.prefs.keepUnticked = el.checked;
    saveSoon();
    rerenderKeepScroll();
  } else if (el.id === "file-in" && el.files?.[0]) {
    await loadFile(el.files[0]);
  } else if (el.dataset.wfield === "title") {
    if (!S.active.title.trim()) S.active.title = "Training";
  }
});

// Satzfelder: beim Antippen alles markieren, damit man direkt überschreiben kann
app.addEventListener("focusin", (ev) => {
  if (ev.target.dataset?.f) setTimeout(() => ev.target.select?.(), 0);
});

async function loadFile(file) {
  try {
    toast("Datei wird gelesen …");
    const text = await file.text();
    const catalog = C.parseExport(text);
    // 1.56.0: ältere Datei als der geladene Stand nicht übernehmen, gleicher Stand nur Hinweis
    const check = C.importCheck(S.catalog, catalog);
    if (check.action === "older") {
      return toast(`Diese Datei ist älter (Stand ${fmtDateTime(catalog.exportedAt)}) als die geladenen Daten (${fmtDateTime(S.catalog.exportedAt)}) – bitte die neueste „LIFESPAN-Handy-…“-Datei wählen.`, true);
    }
    if (check.action === "same") {
      toast(`Diese Datei ist schon geladen (Stand ${fmtDateTime(catalog.exportedAt)}). Eine neuere legt der PC ab, solange LIFESPAN OS läuft.`);
      return go("home");
    }
    await applyCatalog(catalog);
    toast(
      `Geladen: Stand ${fmtDateTime(catalog.exportedAt)} · ${catalog.machines.length.toLocaleString("de-DE")} Maschinen, ${catalog.plans.length} Pläne, ${catalog.nutrition.foods.length.toLocaleString("de-DE")} Lebensmittel${
        check.stale ? ". Hinweis: Der Stand ist älter als 3 Stunden – gibt es eine neuere Handy-Datei?" : ""
      }`,
    );
    go("home");
  } catch (e) {
    toast(e.message || "Die Datei konnte nicht gelesen werden.", true);
  }
}

/** Neue Grunddaten übernehmen (PC-Export oder Startpaket eines Kontos am Handy). */
async function applyCatalog(catalog) {
  {
    S.localExercises = C.keepLocalExercises(catalog, S.localExercises, [...S.workouts, ...(S.active ? [S.active] : [])]);
    S.catalogRaw = catalog;
    await store.set("catalog", catalog);
    S.train = TR.pruneTrain(catalog, S.train);
    await store.set("train", S.train);
    S.gyms = GD.pruneGyms(catalog, S.gyms);
    await store.set("gyms", S.gyms);
    refreshCatalog();
    N.pruneLocal(catalog, S.food.local);
    await store.set("nutrition", S.food.local);
    BD.pruneBody(catalog, S.body.local);
    await store.set("body", S.body.local);
    S.water = P.pruneWater(catalog, S.water);
    await store.set("water", S.water);
    S.fast = FT.pruneFast(catalog, S.fast);
    await store.set("fast", S.fast);
    S.supp = SP.pruneSupp(catalog, S.supp);
    await store.set("supp", S.supp);
    S.goals = GL.pruneGoals(catalog, S.goals);
    await store.set("goals", S.goals);
    S.pcsettings = PS.pruneSync(catalog, S.pcsettings);
    await store.set("pcsettings", S.pcsettings);
    S.logs = LG.pruneLogs(catalog, S.logs);
    await store.set("logs", S.logs);
    S.todos = TD.pruneTodos(catalog, S.todos);
    await store.set("todos", S.todos);
    S.checklists = CD.pruneChecklists(catalog, S.checklists);
    await store.set("checklists", S.checklists);
    S.caffeine = CF.pruneCaffeine(catalog, S.caffeine);
    await store.set("caffeine", S.caffeine);
    S.glucose = GLD.pruneGlucose(catalog, S.glucose);
    await store.set("glucose", S.glucose);
    S.health = HD.pruneHealth(catalog, S.health);
    await store.set("health", S.health);
    S.super = SD.pruneSuper(catalog, S.super);
    await store.set("super", S.super);
    await saveNow();
  }
}

// ------------------------------------------------------------------ Einstellungen je Gerät (1.48.0)

/** Design, Beschriftung der unteren Leiste und sichtbare Bereiche anwenden. */
function applyPrefs() {
  const sysDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  document.documentElement.dataset.theme = DP.resolvedTheme(S.prefs.theme, sysDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", document.documentElement.dataset.theme === "dark" ? "#0b1622" : "#0b2a4a");
  document.body.classList.toggle("bar-icons", S.prefs.barLabels === "icons");
  syncSections();
  if (S.catalog) renderNav();
}

/** „Superhuman“ nur mit Secret Protocols (wie am PC). */
function syncSections() {
  const secret = !S.catalog || String(PS.effective(S.catalog, S.pcsettings, "secret_protocols")) === "1";
  setHiddenSections(secret ? [] : ["superhuman"]);
}
window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
  if (S.prefs.theme === "system") applyPrefs();
});

/** Benachrichtigung zeigen (wenn erlaubt), sonst Hinweis in der App. */
async function notify(title, body) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg?.showNotification) await reg.showNotification(title, { body, icon: "icons/icon-192.png", tag: title });
      else new Notification(title, { body, icon: "icons/icon-192.png" });
      return true;
    }
  } catch {
    // weiter mit dem Hinweis in der App
  }
  toast(`${title}: ${body}`);
  return false;
}

/** Fällige Erinnerungen (Settings → Erinnerungen) mit dem Stand der Daten. */
function reminderState() {
  if (!S.catalog) return { due: [], fresh: [] };
  const db = buildDb();
  const t = todayIso();
  const secret = db.settings.get("secret_protocols") === "1";
  let hrt = [];
  if (secret && S.prefs.reminders.hrt.on) {
    try {
      hrt = SD.hrtEntriesOf(S.catalog, S.super);
    } catch {
      hrt = [];
    }
  }
  return DP.remindersDue(S.prefs, t, C.localTime(new Date()), DP.reminderStatus(db, t, P.WEIGHT_METRIC_ID, hrt), secret);
}

async function checkReminders() {
  let fresh = [];
  try {
    fresh = reminderState().fresh;
  } catch {
    return;
  }
  if (!fresh.length) return;
  DP.markShown(S.prefs, fresh.map((n) => n.key), todayIso());
  saveSoon();
  for (const n of fresh) await notify(n.title, n.body);
  if (S.view === "home") rerenderKeepScroll();
}

let reminderTimer = null;
function startReminders() {
  if (reminderTimer) return;
  void checkReminders();
  reminderTimer = setInterval(() => void checkReminders(), 60_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void checkReminders();
  });
}

/** Overview: fällige Erinnerungen und Erinnerung ans Senden. */
function remindersCardHtml() {
  let due = [];
  try {
    due = reminderState().due;
  } catch {
    due = [];
  }
  const open = unsent().length + unsentFood() + unsentBodyCount();
  const sendDays = DP.sendReminder(S.prefs, open, S.prefs.lastSentAt ?? null, S.catalog?.exportedAt ?? null);
  // Neuer Weekly Report vom PC (1.51.0)
  const wr = weeklyReportNoticeHtml();
  if (!due.length && sendDays === null && !wr) return "";
  const label = { weigh: "Gewicht eintragen", supplements: "Supplements eintragen", hrt: "Zu Superhuman" };
  return `<section class="card hl ov-reminders"><h3>Erinnerungen</h3><ul class="list">${wr}${due
    .map((n) => `<li class="meal-item"><span><b>${esc(n.title)}</b><br><span class="muted small">${esc(n.body)}</span></span><button class="btn sm" data-act="rem-go" data-arg="${esc(n.kind)}">${esc(label[n.kind] ?? "Öffnen")}</button></li>`)
    .join("")}${
    sendDays !== null
      ? `<li class="meal-item"><span><b>An den PC senden</b><br><span class="muted small">Seit ${sendDays === 1 ? "1 Tag" : `${sendDays} Tagen`} nichts gesendet – ${open === 1 ? "1 Eintrag ist" : `${open} Einträge sind`} offen.</span></span><button class="btn sm" data-go="send">Senden</button></li>`
      : ""
  }</ul></section>`;
}

// ------------------------------------------------------------------ Konten (1.25.0)

/** Name des aktiven Kontos: Profil (vom PC oder am Handy angelegt), sonst „Hauptkonto“. */
function accountName(id = S.accountId) {
  // Aktives Konto: Profilname (am Handy geändert gilt vor dem Stand vom PC, 1.48.0)
  const own = id === S.accountId ? (PS.normSync(S.pcsettings).profile?.row?.name ?? S.catalog?.pc?.profile?.[0]?.name) : null;
  if (own) return own;
  if (!id) return S.mainAccountName || "Hauptkonto";
  return S.accounts.find((a) => a.id === id)?.name ?? "Konto";
}

/** Startpaket laden (Maschinen, Lebensmittel, Übungsbibliothek – wie ein neuer Benutzer am PC). */
async function loadStartPackage() {
  const res = await fetch("startpaket.json");
  if (!res.ok) throw new Error("Die Grunddaten konnten nicht geladen werden. Bitte mit Internet erneut versuchen.");
  return res.json();
}

/**
 * Konto am Handy anlegen. Ohne Daten auf diesem Gerät (Startbildschirm) wird das aktuelle Konto
 * eingerichtet; sonst entsteht ein weiteres Konto mit eigenem Speicher und die App startet neu.
 */
async function createAccount(input) {
  const start = await loadStartPackage();
  const catalog = C.parseExport(C.accountDoc(start, input));
  const iso = new Date().toISOString();
  if (!S.catalog) {
    await applyCatalog(catalog);
    if (S.accountId) {
      S.accounts = S.accounts.map((a) => (a.id === S.accountId ? { ...a, name: catalog.pc.profile[0].name } : a));
      await store.setGlobal("accounts", S.accounts);
    } else {
      S.mainAccountName = catalog.pc.profile[0].name;
      await store.setGlobal("mainName", S.mainAccountName);
    }
    await store.persist();
    refreshCatalog();
    return false;
  }
  const id = `k${Date.now().toString(36)}`;
  S.accounts = [...S.accounts, { id, name: catalog.pc.profile[0].name, createdAt: iso }];
  await store.setGlobal("accounts", S.accounts);
  if (!S.mainAccountName && !S.accountId) {
    S.mainAccountName = accountName("");
    await store.setGlobal("mainName", S.mainAccountName);
  }
  store.useAccount(id);
  await store.set("catalog", catalog);
  await store.setGlobal("activeAccount", id);
  await store.persist();
  return true;
}

/** Name des angemeldeten Kontos in der Kontenliste nachziehen (nach dem Speichern des Profils). */
async function renameActiveAccount(name) {
  if (S.accountId) {
    S.accounts = S.accounts.map((a) => (a.id === S.accountId ? { ...a, name } : a));
    await store.setGlobal("accounts", S.accounts);
  } else {
    S.mainAccountName = name;
    await store.setGlobal("mainName", name);
  }
}

/**
 * Beim Start: Wurde dieses Konto umbenannt, während ein anderes angemeldet war, gilt der Name jetzt
 * auch im Profil (geht mit „An den PC senden“ zum PC).
 */
async function applyPendingRename() {
  const pending = S.accountId ? S.accounts.find((a) => a.id === S.accountId)?.rename : await store.getGlobal("mainRename");
  if (!pending) return;
  try {
    const db = buildDb();
    if (db.profile && db.profile.name !== pending) {
      PS.setProfile(S.pcsettings, { ...db.profile, name: pending });
      await store.set("pcsettings", S.pcsettings);
    }
  } catch {
    // ohne Profil: nur der Name in der Liste
  }
  if (S.accountId) {
    S.accounts = S.accounts.map((a) => (a.id === S.accountId ? { ...a, rename: undefined } : a));
    await store.setGlobal("accounts", S.accounts);
  } else {
    await store.setGlobal("mainRename", null);
  }
}

async function switchAccount(id) {
  if (S.active) return toast("Erst das laufende Training beenden.", true);
  await saveNow();
  await store.setGlobal("activeAccount", id);
  location.reload();
}

function viewAccountNew() {
  const f = S.accountForm ?? { name: "", sex: "", birthDate: "", heightCm: "", error: null, busy: false };
  return `${header("Neues Konto", { back: S.catalog ? "settings" : "setup" })}<main class="wrap">
    <section class="card">
      <h3>Konto am Handy</h3>
      <p class="muted small">Für jemanden ohne PC: Alles bleibt auf diesem Gerät. Mit dabei sind die Maschinendatenbank (mit Muskelgruppen, ohne Bilder), die Lebensmitteldatenbank und die Übungsbibliothek – wie bei einem neuen Benutzer am PC. Später überträgst du alles mit „An den PC senden“.</p>
      <div class="field"><label for="acc-name">Name</label><input id="acc-name" type="text" autocomplete="off" maxlength="80" value="${esc(f.name)}"></div>
      <div class="grid2">
        <div class="field"><label for="acc-sex">Geschlecht</label><select id="acc-sex"><option value="">wählen …</option>
          <option value="female" ${f.sex === "female" ? "selected" : ""}>weiblich</option><option value="male" ${f.sex === "male" ? "selected" : ""}>männlich</option></select></div>
        <div class="field"><label for="acc-height">Größe (cm)</label><input id="acc-height" type="text" inputmode="decimal" value="${esc(f.heightCm)}" placeholder="z. B. 172"></div>
      </div>
      <div class="field"><label for="acc-birth">Geburtsdatum</label><input id="acc-birth" type="date" value="${esc(f.birthDate)}"></div>
      <p class="muted small">Geschlecht, Alter und Größe braucht die App für Energiebedarf und Referenzwerte.</p>
      ${f.error ? `<p class="field-error">${esc(f.error)}</p>` : ""}
      <button class="btn primary block" data-act="account-create" ${f.busy ? "disabled" : ""}>${f.busy ? "Wird eingerichtet …" : "Konto anlegen"}</button>
    </section>
    ${S.catalog ? `<p class="muted small">Das neue Konto bekommt einen eigenen Speicher. Dein bisheriges Konto bleibt unverändert; wechseln kannst du jederzeit unter Settings → Konten.</p>` : ""}
  </main>`;
}

/** Settings-Karte „Konten“. */
function accountsCard() {
  const list = [{ id: "", name: accountName("") }, ...S.accounts];
  return `<section class="card">
    <div class="wo-head"><h3>Konten</h3><span class="tag">${list.length}</span></div>
    <p class="small">Angemeldet: <b>${esc(accountName())}</b> · ${S.catalog?.startpaket ? "Konto am Handy" : "Daten vom PC"}</p>
    <p class="muted small">Den Namen des angemeldeten Kontos änderst du oben im Profil; andere Konten hier mit „Umbenennen“. Benutzer am PC sind eigene Datenbanken am PC.</p>
    ${
      list.length > 1
        ? `<ul class="account-list">${list
            .filter((a) => a.id !== S.accountId)
            .map(
              (a) =>
                S.accRename === a.id
                  ? `<li class="account-rename"><div class="field"><label for="acc-rename">Neuer Name</label><input id="acc-rename" type="text" maxlength="80" autocomplete="off" value="${esc(a.id === "" ? accountName("") : a.name)}"></div>
                <span class="row-actions"><button class="btn sm primary" data-act="account-rename-save" data-arg="${esc(a.id)}">Speichern</button><button class="btn sm ghost" data-act="account-rename-cancel">Abbrechen</button></span></li>`
                  : `<li><span>${esc(a.id === "" ? accountName("") : a.name)}<small class="muted">${a.id === "" ? "Hauptkonto" : "Konto am Handy"}</small></span>
                <span class="row-actions"><button class="btn sm" data-act="account-switch" data-arg="${esc(a.id)}">Wechseln</button><button class="btn sm ghost" data-act="account-rename" data-arg="${esc(a.id)}">Umbenennen</button>${
                  a.id ? `<button class="btn sm ghost danger" data-act="account-delete" data-arg="${esc(a.id)}">Löschen</button>` : ""
                }</span></li>`,
            )
            .join("")}</ul>`
        : ""
    }
    ${S.catalog?.startpaket ? `<p class="muted small">Das ganze Konto an den PC bringen: Import/Export → „Ganzes Konto an den PC“.</p>` : ""}
    <button class="btn block" data-act="account-new">Neues Konto anlegen</button>
    <p class="muted small" id="persist-note">Alle Daten liegen nur auf diesem Gerät.</p>
  </section>`;
}

// ------------------------------------------------------------------ Pausentimer

let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    loadRestSounds();
  } catch {
    /* ohne Ton */
  }
}

// Klänge wie am PC (RestTimerBar.tsx, seit 1.44.0 auch am Handy): reihum, gemerkt im Gerät. Über
// Web Audio abgespielt, damit sie auf dem iPhone nach dem ersten Antippen auch ohne Tippen am Ende
// der Pause laufen – nur solange die App geöffnet ist (Web-Apps dürfen im Hintergrund keinen Ton
// abspielen). Fehlt ein Klang, kommt der Signalton.
const REST_SOUNDS = ["yeah-buddy", "light-weight-baby", "do-you-even-lift", "i-can-do-this-all-day", "skinny"].map((n) => `sounds/${n}.mp3`);
const REST_SOUND_KEY = "lifespan.restTimer.lastSound";
let restBuffers = null;
function loadRestSounds() {
  if (restBuffers || !audioCtx) return;
  restBuffers = REST_SOUNDS.map(() => null);
  REST_SOUNDS.forEach((src, i) => {
    fetch(src)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => new Promise((ok, fail) => audioCtx.decodeAudioData(data, ok, fail)))
      .then((buffer) => {
        restBuffers[i] = buffer;
      })
      .catch(() => {
        /* dieser Klang fehlt – dann Signalton */
      });
  });
}
function nextSoundIndex(last, count) {
  if (count <= 0) return -1;
  if (last === null || !Number.isInteger(last) || last < 0 || last >= count) return 0;
  return (last + 1) % count;
}
function restSignal() {
  let last = null;
  try {
    const raw = localStorage.getItem(REST_SOUND_KEY);
    last = raw === null ? null : Number(raw);
  } catch {
    last = null;
  }
  const index = nextSoundIndex(last, REST_SOUNDS.length);
  try {
    localStorage.setItem(REST_SOUND_KEY, String(index));
  } catch {
    /* ohne Merken */
  }
  const buffer = restBuffers?.[index] ?? null;
  if (!buffer || !audioCtx) return beep();
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(audioCtx.destination);
    src.start();
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    beep();
  }
}
function beep() {
  try {
    if (!audioCtx) return;
    for (const [t, f] of [[0, 880], [0.25, 880], [0.5, 1320]]) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.25, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.22);
    }
  } catch {
    /* ohne Ton */
  }
  navigator.vibrate?.([200, 100, 200]);
}

function startRest(seconds) {
  S.rest = { endsAt: Date.now() + seconds * 1000, total: seconds, beeped: false };
  renderRest();
}
function adjustRest(delta) {
  if (!S.rest) return;
  S.rest.endsAt += delta * 1000;
  S.rest.total = Math.max(1, S.rest.total + delta);
  S.rest.beeped = false;
  renderRest();
}
function stopRest() {
  S.rest = null;
  renderRest();
}
function renderRest() {
  if (!S.rest || S.view !== "workout") {
    restEl.hidden = true;
    return;
  }
  const left = (S.rest.endsAt - Date.now()) / 1000;
  const over = left <= 0;
  if (over && !S.rest.beeped) {
    S.rest.beeped = true;
    restSignal();
  }
  if (left < -60) return stopRest();
  restEl.hidden = false;
  restEl.className = over ? "rest over" : "rest";
  const pct = Math.max(0, Math.min(100, (left / S.rest.total) * 100));
  restEl.innerHTML = `<div class="box"><span class="t">${over ? "Los!" : fmtSec(left)}</span>
    <span class="lbl">${over ? "Pause vorbei" : "Pause"}</span>
    <button data-act="rest-minus" aria-label="15 Sekunden weniger">−15</button>
    <button data-act="rest-plus" aria-label="15 Sekunden mehr">+15</button>
    <button data-act="rest-stop">✕</button>
    <span class="bar" style="width:${pct}%"></span></div>`;
}

setInterval(() => {
  if (S.rest) renderRest();
  const clock = document.querySelector("[data-clock]");
  if (clock && S.active) clock.textContent = fmtSec((Date.now() - new Date(S.active.startedAt)) / 1000);
}, 500);

// Overview: Koffein-Linie „jetzt“ jede Minute nachziehen (1.69.0) – nur die Kachel, ohne neu zu zeichnen
setInterval(() => {
  if (S.view !== "home" || document.hidden) return;
  const cardEl = document.querySelector('[data-card="caffeine-status"]');
  const day = cardEl?.closest("main")?.dataset.day;
  if (!cardEl || !day || day !== todayIso()) return;
  try {
    const { body } = overviewCaffeine(day, minutesSince(day, new Date()));
    const summary = cardEl.querySelector("summary");
    cardEl.replaceChildren(...(summary ? [summary] : []));
    cardEl.insertAdjacentHTML("beforeend", body);
  } catch {
    // beim nächsten Neuzeichnen
  }
}, 60_000);

// ------------------------------------------------------------------ Bildschirm anlassen

let lock = null;
async function wakeLock(on) {
  try {
    if (on && "wakeLock" in navigator && !lock) {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => (lock = null));
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch {
    lock = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.active) wakeLock(true);
  if (document.visibilityState === "hidden") {
    // App in den Hintergrund: offene Körperwerte sichern (1.40.0)
    if (S.view === "body-entry") bodyLeave();
    saveNow();
  }
});

// ------------------------------------------------------------------ Start

/**
 * iPhone-Sicherheitsabstand: Manche iOS-Versionen melden env(safe-area-inset-top) = 0, obwohl die
 * App als Home-Bildschirm-App unter Statusleiste und Notch beginnt (z. B. wenn sie mit
 * durchsichtiger Statusleiste installiert wurde). Dann wird ein fester Abstand gesetzt.
 */
/**
 * Abstand der Kopfzeile zur Statusleiste (1.1.8, am iPhone des Nutzers abgestimmt): Sicherheitsabstand
 * von iOS minus 58 px (siehe app.css). Meldet iOS im Vollbild 0, gilt derselbe Abzug vom Ersatzwert
 * 46 px – also 0.
 */
function fixSafeTop() {
  const root = document.documentElement;
  root.style.removeProperty("--safe-top");
  try {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden";
    document.body.appendChild(probe);
    const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
    const fullScreen = window.innerHeight >= screen.height - 2; // Inhalt reicht bis unter die Statusleiste
    if (ios && standalone && inset < 20 && fullScreen) root.style.setProperty("--safe-top", "0px");
  } catch {
    /* Standardabstand */
  }
}

const moduleCtx = {
  get S() {
    return S;
  },
  esc,
  header,
  toast,
  store,
  uuid: () => C.uuidv7(),
  rerender: () => rerenderKeepScroll(),
  go: (view, arg) => go(view, arg),
  confirmTwice: (el, text) => confirmTwice(el, text),
  /** Trainings vom Handy als Tabellen (für die Rechnung wie am PC) */
  buildReturnTables: () =>
    C.buildReturnFile(S.catalog, S.localExercises, S.workouts.filter((w) => w.status === "done"), new Date()).tables,
};
initBody(moduleCtx);
GY.initGyms(moduleCtx);
initDiary(moduleCtx);
initVendor(moduleCtx);
MI.initMachineImages(moduleCtx);
MI.loadIds(() => rerenderKeepScroll());
initCatalog(moduleCtx);
initGoals(moduleCtx);
initSettings({
  ...moduleCtx,
  saveNow,
  accountsCard,
  applyPrefs,
  notify,
  renameActiveAccount,
  barSlotsHtml,
  version: C.MOBILE_VERSION,
});
initBls(moduleCtx);
initOff(moduleCtx);
initOverview({ ...moduleCtx, S, today: todayIso });
// Overview: Tag per Wischen wechseln (1.66.0); nie in die Zukunft
initDaySwipe(
  {
    ov: {
      canShift: (delta) => delta < 0 || Boolean(S.ovDate && S.ovDate < todayIso()),
      shift: (delta) => shiftOverviewDay(delta),
    },
  },
  rerenderKeepScroll,
);
initLogs(moduleCtx);
initInsights(moduleCtx);
initExtras(moduleCtx);
initWeeklyReports({ ...moduleCtx, saveSoon: () => saveSoon() });
initTodos(moduleCtx);
initICoach(moduleCtx);
initHealth(moduleCtx);
initSuper(moduleCtx);
const trainingCtx = {
  get S() {
    return S;
  },
  esc,
  header,
  toast,
  store,
  C,
  uuid: () => C.uuidv7(),
  rerender: () => rerenderKeepScroll(),
  go: (view, arg) => go(view, arg),
  confirmTwice: (el, text) => confirmTwice(el, text),
  refreshCatalog: () => refreshCatalog(),
  persistTrain: () => persistTrain(),
  saveNow: () => saveNow(),
  setNotice: (tone, text) => trainSetNotice(tone, text),
  failed: (e) => trainFailed(e),
  saveExerciseRow: (row, patch) => saveExerciseRow(row, patch),
  startPlanDay: (id) => startPlanDay(id),
  startFree: () => startWorkout("Freies Training"),
  startBackfill: (date) => startBackfill(date),
  startCardio: (id) => startBackfill(todayIso(), id),
  openWorkout: (id) => go("detail", id),
};
initTraining(trainingCtx);
initTrainingStats(trainingCtx);
initTrainingDb(trainingCtx);

initFood({
  get S() {
    return S;
  },
  esc,
  header,
  toast,
  store,
  uuid: () => C.uuidv7(),
  rerender: () => rerenderKeepScroll(),
  go: (view, arg) => go(view, arg),
  confirmTwice: (el, text) => confirmTwice(el, text),
});

async function boot() {
  fixSafeTop();
  try {
    // Konten (1.25.0): aktives Konto wählt den Speicherbereich
    S.accounts = (await store.getGlobal("accounts")) || [];
    S.mainAccountName = (await store.getGlobal("mainName")) || null;
    const activeId = (await store.getGlobal("activeAccount")) || "";
    S.accountId = activeId && S.accounts.some((a) => a.id === activeId) ? activeId : "";
    store.useAccount(S.accountId);
    S.catalogRaw = await store.get("catalog");
    S.train = TR.trainState(await store.get("train"));
    S.localExercises = (await store.get("localExercises")) || [];
    S.workouts = (await store.get("workouts")) || [];
    S.active = await store.get("active");
    S.prefs = DP.normPrefs({ ...S.prefs, ...((await store.get("prefs")) || {}) });
    S.food = foodState(await store.get("nutrition"));
    S.body = bodyState(await store.get("body"));
    S.water = (await store.get("water")) || P.emptyWaterLocal();
    S.fast = FT.normFast(await store.get("fast"));
    S.supp = SP.normSupp(await store.get("supp"));
    S.goals = GL.normGoals(await store.get("goals"));
    S.pcsettings = PS.normSync(await store.get("pcsettings"));
    await blsBoot();
    await offBoot();
    await GY.gymsBoot();
    S.logs = LG.logsState(await store.get("logs"));
    S.todos = TD.todosState(await store.get("todos"));
    S.checklists = CD.checklistState(await store.get("checklists"));
    S.caffeine = CF.caffeineState(await store.get("caffeine"));
    S.caffeineSettings = (await store.get("caffeineSettings")) ?? null; // 1.47.0: Einschlafzeit, Halbwertszeit
    S.weekAck = (await store.get("weekReview")) ?? null; // 1.47.0: quittierte To-dos im Wochenabschluss
    S.glucose = GLD.glucoseState(await store.get("glucose"));
    S.health = HD.healthState(await store.get("health"));
    S.super = SD.superState(await store.get("super"));
    delete S.prefs.topOffset; // Einstellung aus 1.1.7 entfällt
    refreshCatalog();
  } catch (e) {
    app.innerHTML = `<p class="boot">Der Gerätespeicher ist nicht verfügbar (${esc(e.message)}). Im privaten Modus funktioniert LIFESPAN OS Mobil nicht.</p>`;
    return;
  }
  store.persist().then(async () => {
    const ok = await navigator.storage?.persisted?.().catch(() => false);
    S.persisted = Boolean(ok);
  });
  if (S.catalog) await applyPendingRename();
  applyPrefs();
  S.view = S.catalog ? (S.active ? "workout" : "home") : "setup";
  render();
  startReminders();
  if (S.active) wakeLock(true);
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
