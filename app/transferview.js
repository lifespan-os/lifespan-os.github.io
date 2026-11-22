// LIFESPAN OS Mobil – Import/Export: Übersicht, Senden an den PC, offene Einträge, Dateien bauen (aus app.js, 1.74.0).
import * as C from "./core.js";
import * as PR from "./paritydata.js";
import * as store from "./store.js";
import * as N from "./nutrition.js";
import * as BD from "./bodydata.js";
import * as P from "./pcdb.js";
import { buildDb } from "./diary.js";
import * as FT from "./fastdata.js";
import * as SP from "./supplements.js";
import * as MI from "./machineimages.js";
import { catalogCard } from "./catalogui.js";
import * as GL from "./goals.js";
import * as AX from "./accountexport.js";
import { blsCard } from "./blsui.js";
import { offCard } from "./offui.js";
import * as LG from "./logsdata.js";
import * as TD from "./todosdata.js";
import * as HD from "./healthdata.js";
import * as SD from "./superdata.js";
import * as CD from "./checklistdata.js";
import * as CF from "./caffeinedata.js";
import * as GLD from "./glucosedata.js";
import { arrangeCards } from "./layoutedit.js";
import * as PS from "./pcsettings.js";
import * as TR from "./trainingdata.js";
import * as PD from "./pending.js";
import * as GD from "./gymsdata.js";
import { esc, exById, fmtDate, fmtDateTime, header, S, saveNow, toast, unsent, unsentBodyCount, unsentFood } from "./appbase.js";
import { accountName, loadStartPackage } from "./accounts.js";
import { fileButton } from "./homeview.js";

/**
 * Import/Export (1.45.6): alles zum Datenaustausch an einer Stelle (vorher unter Settings) – An den PC
 * senden, Exportdatei vom PC laden, ganzes Konto an den PC, Herstellerpakete, BLS 4.0 und der Weg zu
 * den Blutzucker-Dateien. Erreichbar über den Knopf im Menükopf.
 */
export function viewTransfer() {
  const c = S.catalog;
  if (!c) return `${header("Import/Export")}<main class="wrap"><section class="card"><h3>Daten vom PC</h3>${fileButton("Exportdatei laden")}</section></main>`;
  const total = unsent().length + unsentFood() + unsentBodyCount();
  // Reihenfolge und ausgeblendete Karten wie am PC (Import/Export → Seite anpassen, 1.47.0);
  // Karten ohne Gegenstück am PC folgen ihrem Vorgänger
  const cards = [
    { id: "import", node: `<section class="card">
      <div class="wo-head"><h3>An den PC senden</h3><span class="tag">${total} offen</span></div>
      <p class="muted small card-info">Trainings, Lebensmittel und Körperwerte als Dateien für den Import am PC (Import/Export → Daten importieren → „Abgleichen“).</p>
      <button class="btn block" data-go="pending" ${total ? "" : "disabled"}>${total ? "Offene Daten ansehen und bearbeiten" : "Keine offenen Daten"}</button>
      <button class="btn primary block" data-go="send">An den PC senden</button>
    </section>` },
    { id: "phone", node: `<section class="card">
      <h3>${c.startpaket ? "Grunddaten" : "Daten vom PC"}</h3>
      <p class="muted small">Stand: ${fmtDateTime(c.exportedAt)} · ${c.machines.length.toLocaleString("de-DE")} Maschinen · ${c.exercises.length} Übungen · ${c.plans.length} Pläne</p>
      ${fileButton("Neue Exportdatei laden")}
      <p class="muted small card-info">Am PC unter Import/Export entweder <b>„Für die Handy-App exportieren“</b> (kleiner, lädt schneller – keine Sicherung) oder den vollständigen Export „Daten exportieren“ wählen. Beide Dateien lassen sich hier laden.</p>
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
      <p class="muted small card-info">Lebensmittel und Supplements von Herstellern (PEAK, GymBeam, IronMaxx, #sinob, Proteini.si …) mit einem Tipp installieren – wie am PC.</p>
      <button class="btn block" data-act="vendor-open">Herstellerpakete</button>
    </section>` },
    { id: "mimages", node: `<section class="card">
      <h3>Maschinenbilder</h3>
      <p class="muted small card-info">Alle Maschinenbilder (auch deine eigenen Fotos) in einem Paket von der Website laden – für Maschinensuche, Training, Verlauf und Datenbank. ${MI.imageCount() ? `${MI.imageCount().toLocaleString("de-DE")} Maschinen mit Bild auf diesem Gerät.` : "Noch keine Bilder auf diesem Gerät."}</p>
      <button class="btn block" data-act="mimg-open">Maschinenbilder</button>
    </section>` },
    { id: "catalog", node: catalogCard() },
    { id: "bls", node: blsCard() },
    { id: "off", node: offCard() },
    { id: "glucose", node: `<section class="card">
      <h3>Blutzucker-Dateien</h3>
      <p class="muted small card-info">Dateien von LibreView, Dexcom Clarity oder eine eigene CSV liest du unter Health → Blutzucker ein. Die Werte gehen mit „Körperwerte … senden“ an den PC.</p>
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

export function viewSend() {
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
export function viewPending() {
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

/** Tabellen zweier Teile zusammenlegen (z. B. `settings` aus Strichcodes und Glasgröße). */
export function mergeTables(a, b) {
  const out = { ...a };
  for (const [name, list] of Object.entries(b)) out[name] = [...(out[name] ?? []), ...list];
  return out;
}

/**
 * Tabellen für „Lebensmittel senden“: Ernährung, Wasser und Supplement-Einnahmen (1.26.0). Eine
 * Einnahme nimmt ihre Mahlzeit und ihren Stack mit, wenn sie sonst fehlen würden.
 */
export function foodTables(all) {
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
export function bodyPartTables(all) {
  // Verweise mitnehmen (1.68.1): sonst lehnt der PC z. B. eine geänderte Übung ab, deren Maschine nicht in der Datei steht
  return TR.withReferences(bodyPartTablesRaw(all), referencedRow);
}

/** Zeile vom Stand des Handys (PC-Daten plus Änderungen am Handy) für `TR.withReferences`. */
export function referencedRow(table, id) {
  if (table === "machine") return S.catalog?.machines?.find((m) => m.id === id) ?? null;
  if (table === "gym") return GD.gymRowsFor(S.catalog, S.gyms, [id])[0] ?? null;
  if (table === "exercise") return TR.rowsOf(S.catalog, S.train, "exercise").find((r) => r.id === id) ?? (S.localExercises ?? []).find((r) => r.id === id) ?? null;
  return TR.rowsOf(S.catalog, S.train, table).find((r) => r.id === id) ?? null;
}

export function bodyPartTablesRaw(all) {
  return mergeTables(mergeTables(BD.bodyTables(S.catalog, S.body.local, { all }), LG.logTables(S.logs, { all })), mergeTables(TD.todoTables(S.todos, { all }), mergeTables(HD.healthTables(S.health, { all }), mergeTables(SD.superTables(S.super, { all }), mergeTables(mergeTables(CD.checklistTables(S.checklists, { all }), mergeTables(CF.caffeineTables(S.caffeine, { all }), GLD.glucoseTables(S.glucose, { all }))), mergeTables(TR.trainTables(S.train, { all }), mergeTables(GL.goalTables(S.goals, { all }), mergeTables(PS.syncTables(S.pcsettings, { all }), mergeTables(GD.gymTables(S.gyms, { all }), PR.parityTables(S.parity, { all }))))))))));
}

/**
 * Ganzes Konto am Handy als Exportdatei für den PC (1.29.0): Startpaket + Profil + alles Erfasste.
 * Am PC: neuer Benutzer → „Ersetzen“, bestehender Benutzer → „Abgleichen (zweites Gerät)“.
 */
export async function exportAccount(el) {
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
export async function markSent(arg) {
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
    PR.markParitySent(S.parity);
    await store.set("parity", S.parity);
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
export async function sendFile(kind, all) {
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
