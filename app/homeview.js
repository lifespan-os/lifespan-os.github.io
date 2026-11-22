// LIFESPAN OS Mobil – Start, Overview-Grundgerüst, Pläne und Hilfe (aus app.js, 1.74.0).
import { setupCardHtml } from "./setupparity.js";
import * as C from "./core.js";
import { barChoices, barSlots, pcOnlyHtml, SECTIONS } from "./nav.js";
import { buildDb, today as todayIso } from "./diary.js";
import { overviewCardsHtml, overviewHero } from "./overview.js";
import { quickFillBanner } from "./extras.js";
import { brandHeader, esc, fmtDate, fmtDateTime, fmtSec, header, S } from "./appbase.js";
import { remindersCardHtml } from "./devsettings.js";

export function viewSetup() {
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
export function fileButton(label) {
  return `<label class="btn primary block" for="file-in">${esc(label)}</label>
    <input id="file-in" type="file" hidden>`;
}

/**
 * Overview wie am PC (1.6.0): oben das Training am Handy (läuft bzw. starten), darunter die Karten der
 * Desktop-App in deren Anordnung. Seit 1.66.0 ohne „Daten vom PC“, „An den PC senden“ und Tageswahl –
 * beides unter Import/Export; der Tag wechselt per Wischen (dayswipe.js), „Heute“ im Kopf springt zurück.
 */
export function viewHome() {
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
    ${date === today && c.pc ? setupCardHtml() : ""}
    ${cards}
    <p class="muted small ov-source">Stand der Daten vom PC: ${fmtDateTime(c.exportedAt)} – plus alles, was du seitdem am Handy erfasst hast. Anordnung der Karten wie am PC (Overview → Übersicht anpassen).</p>
  </main>`;
}

/** Untere Leiste: welche zwei Bereiche neben dem „+“ stehen (Settings → Darstellung). */
export function barSlotsHtml() {
  const slots = barSlots(S.prefs.barSlots);
  const opts = (sel) => barChoices().map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.label)}</option>`).join("");
  return `<div class="grid2">
      <div class="field"><label for="bar-left">Links vom „+“</label><select id="bar-left" data-bar="0">${opts(slots[0])}</select></div>
      <div class="field"><label for="bar-right">Rechts vom „+“</label><select id="bar-right" data-bar="1">${opts(slots[1])}</select></div>
    </div>
    <button class="btn sm ghost" data-act="bar-reset">Leiste: Standard (Training, Nutrition)</button>`;
}

/** Bereich, den es bisher nur am PC gibt. */
export function viewPcOnly() {
  const sec = SECTIONS.find((x) => x.id === S.arg) ?? SECTIONS[0];
  return `${header(sec.label)}<main class="wrap">${pcOnlyHtml(sec.id, esc)}</main>`;
}

export function viewPlans() {
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

export function viewHelp() {
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
