// LIFESPAN OS Mobil – Body & Longevity → Protocols (1.79.0, wie am PC 1.0.165 `ProtocolsTab.tsx`).
// Longevity-Protokolle (Huberman, Attia, Strunz, Sinclair, Greger, Darm-Diät) mit Kernidee, Tagesablauf,
// Leitwerten, Fundament / Ergänzung / Optional, 7-Wochen-Start zum Abhaken, Einordnung und Laborwerten;
// dazu Gemeinsamkeiten, Widersprüche, Tägliches Dutzend und Genetik-Grundlagen. Inhalte und Regeln:
// `src/domain/protocols.ts` über pcdomain.js (D.protocols). Fortschritt in der Einstellung
// `ui.protocols` – geht mit „An den PC senden“ an den PC und kommt mit der Exportdatei zurück.

import * as D from "./pcdomain.js";
import * as PS from "./pcsettings.js";
import { today } from "./diary.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initProtocols(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const P = () => D.protocols;

function readState() {
  return P().parseProtocolState(PS.effective(X.S.catalog, X.S.pcsettings, P().PROTOCOLS_SETTING));
}

async function writeState(next) {
  const S = X.S;
  const key = P().PROTOCOLS_SETTING;
  const current = PS.effective(S.catalog, S.pcsettings, key);
  const changed = PS.setSetting(S.pcsettings, key, P().serializeProtocolState(next, today()), current);
  if (changed) {
    try {
      await X.store.set("pcsettings", S.pcsettings);
    } catch (e) {
      X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
    }
  }
  X.rerender();
}

const list = (items) => `<ul class="prot-ul">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const dl = (items) => `<dl class="prot-dl">${items.map((i) => `<div><dt>${esc(i.label)}</dt><dd>${esc(i.text)}</dd></div>`).join("")}</dl>`;

function dozenHtml(state) {
  const L = P();
  const day = today();
  const row = state.dozen[day] ?? {};
  const total = L.dozenDone(state, day);
  return `<section class="card prot-dozen">
    <div class="wo-head"><h3>Tägliches Dutzend</h3><span class="muted small">${total} von ${L.DAILY_DOZEN_TOTAL}</span></div>
    <div class="dozen-bar" role="img" aria-label="${total} von ${L.DAILY_DOZEN_TOTAL}"><span style="width:${(total / L.DAILY_DOZEN_TOTAL) * 100}%"></span></div>
    <ul class="dozen-list">${L.DAILY_DOZEN.map((d) => {
      const n = row[d.key] ?? 0;
      return `<li class="dozen-row ${n >= d.servings ? "is-full" : ""}"><span class="dozen-row__name"><b>${esc(d.label)}</b><span class="muted small">${esc(d.example)}</span></span>
        <span class="dozen-row__count"><button class="btn sm" data-act="prot-dozen" data-arg="${d.key}" data-delta="-1" ${n <= 0 ? "disabled" : ""} aria-label="${esc(d.label)} eine Portion weniger">−</button>
        <b>${n}/${d.servings}</b>
        <button class="btn sm" data-act="prot-dozen" data-arg="${d.key}" data-delta="1" ${n >= d.servings ? "disabled" : ""} aria-label="${esc(d.label)} eine Portion mehr">+</button></span></li>`;
    }).join("")}</ul>
    <p class="muted small card-info">Zwölf Lebensmittelgruppen, zusammen ${L.DAILY_DOZEN_TOTAL} Portionen am Tag. Quelle: ${esc(L.DAILY_DOZEN_SOURCE)}. Die letzten 14 Tage bleiben gespeichert.</p>
  </section>`;
}

function detailHtml(p, state) {
  const L = P();
  const done = new Set(state.done[p.id] ?? []);
  const pr = L.startProgress(p, state);
  return `<section class="card prot">
      <div class="wo-head"><h3>${esc(p.book)}</h3></div>
      <p class="muted small">${esc(p.author)}</p>
      <p class="prot__tagline">${esc(p.tagline)}</p>
      <div class="prot__figure"><b>${esc(p.keyFigure.value)}</b><span class="small">${esc(p.keyFigure.text)}</span></div>
      <ul class="prot__pillars">${p.pillars.map((x) => `<li><b>${esc(x.title)}</b><span class="small">${esc(x.text)}</span></li>`).join("")}</ul>
      <p class="muted small card-info">Quelle: ${esc(p.source)}. Grundlage: ${esc(p.basis)}. Keine individuelle Therapieempfehlung.</p>
    </section>
    <details class="card ov-card prot-more" open><summary class="wo-head ov-card__head"><h3>Tagesablauf</h3></summary>
      <table class="data-table prot-day"><tbody>${p.day.map((d) => `<tr><th scope="row">${esc(d.time)}</th><td>${esc(d.text)}</td></tr>`).join("")}</tbody></table>
      <p class="muted small">Beispiel für Aufstehen um 7 und Schlafen um 23 Uhr – bei anderem Rhythmus verschieben.</p>
    </details>
    <details class="card ov-card prot-more" open><summary class="wo-head ov-card__head"><h3>Leitwerte</h3></summary>
      <ul class="prot-rules">${p.rules.map((r) => `<li><b class="prot-rules__v">${esc(r.value)}</b><span><b>${esc(r.label)}</b> – ${esc(r.text)}</span></li>`).join("")}</ul>
    </details>
    ${p.sections.map((s) => `<details class="card ov-card prot-more"><summary class="wo-head ov-card__head"><h3>${esc(s.title)}</h3></summary>${dl(s.items)}</details>`).join("")}
    <details class="card ov-card prot-more"><summary class="wo-head ov-card__head"><h3>Fundament, Ergänzung, Optional</h3></summary>
      <p class="prot-tier">A · Fundament</p>${list(p.tiers.foundation)}
      <p class="prot-tier">B · Ergänzung</p>${list(p.tiers.addOn)}
      <p class="prot-tier">C · Optional</p>${list(p.tiers.optional)}
    </details>
    <section class="card prot-start">
      <div class="wo-head"><h3>Dein 7-Wochen-Start</h3><span class="muted small">${pr.done} von ${pr.total}</span></div>
      ${p.start
        .map(
          (s) => `<p class="prot-tier">${esc(s.title)}</p>${s.items
            .map(
              (i) => `<label class="prot-check"><input type="checkbox" data-prot-check="${esc(p.id)}" value="${esc(i.id)}" ${done.has(i.id) ? "checked" : ""}><span>${esc(i.text)}</span></label>`,
            )
            .join("")}`,
        )
        .join("")}
      <p class="muted small card-info">Abgehakte Punkte gehen mit „An den PC senden“ an den PC. Immer nur eine Sache neu beginnen.</p>
    </section>
    <section class="card">
      <div class="wo-head"><h3>Einordnung und Laborwerte</h3></div>
      <p class="small">${esc(p.assessment)}</p>
      <p class="small prot-caution">${esc(p.caution)}</p>
      <p class="small"><b>Laborwerte:</b> ${esc(p.labs.join(", "))}.</p>
      <button class="btn block" data-act="lng-labs">Zu den Laborwerten</button>
      <p class="muted small">${esc(p.tracking)}</p>
    </section>
    ${p.id === "greger" ? dozenHtml(state) : ""}`;
}

/** Inhalt des Reiters „Protocols“. */
export function protocolsTabHtml() {
  const L = P();
  const state = readState();
  const active = L.PROTOCOLS.find((p) => p.id === state.active) ?? L.PROTOCOLS[0];
  return `<section class="card">
      <div class="wo-head"><h3>Longevity-Protokolle</h3></div>
      <p class="muted small card-info">Bekannte Protokolle für ein langes, gesundes Leben – in eigenen Worten zusammengefasst, mit Quelle und ehrlicher Einordnung nach Studienlage am Menschen. Wähle eins, hake deinen Start ab und miss mit LIFESPAN OS, was es bei dir bewirkt.</p>
      <div class="prot-pick" role="tablist" aria-label="Protokoll wählen">${L.PROTOCOLS.map((p) => {
        const pr = L.startProgress(p, state);
        return `<button role="tab" aria-selected="${p.id === active.id}" class="prot-pick__btn ${p.id === active.id ? "is-active" : ""}" data-act="prot-pick" data-arg="${esc(p.id)}"><b>${esc(p.name)}</b><span class="small">${esc(p.book)}</span>${pr.done ? `<span class="muted small">✓ ${pr.done}/${pr.total}</span>` : ""}</button>`;
      }).join("")}</div>
    </section>
    ${detailHtml(active, state)}
    <details class="card ov-card prot-more"><summary class="wo-head ov-card__head"><h3>Gemeinsamer Nenner</h3></summary>${list(L.COMMON_GROUND)}</details>
    <details class="card ov-card prot-more"><summary class="wo-head ov-card__head"><h3>Wo sich die Protokolle widersprechen</h3></summary>
      ${L.DISAGREEMENTS.map((d) => `<p class="prot-tier">${esc(d.topic)}</p><dl class="prot-dl">${L.PROTOCOLS.map((p) => `<div><dt>${esc(p.name)}</dt><dd>${esc(d.views[p.id] ?? "–")}</dd></div>`).join("")}</dl>`).join("")}
      <p class="muted small">Einordnung beim Protein: ohne Trainingsziel reichen 0,8 g/kg; wer Muskeln aufbaut oder über 65 ist, liegt mit 1,2–1,6 g/kg auf der sicheren Seite.</p>
    </details>
    <details class="card ov-card prot-more"><summary class="wo-head ov-card__head"><h3>${esc(L.GENETICS_BASICS.title)}</h3></summary>${dl(L.GENETICS_BASICS.items)}<p class="muted small">Quelle: ${esc(L.GENETICS_BASICS.source)}.</p></details>`;
}

export const protocolsActions = {
  "prot-pick": (el) => {
    const s = readState();
    void writeState({ ...s, active: el.dataset.arg });
    window.scrollTo(0, 0);
  },
  "prot-dozen": (el) => {
    const s = readState();
    const day = today();
    const n = (s.dozen[day]?.[el.dataset.arg] ?? 0) + Number(el.dataset.delta);
    void writeState(P().setDozen(s, day, el.dataset.arg, n));
  },
};

/** Häkchen im 7-Wochen-Start. true = behandelt. */
export function protocolsChange(el) {
  const pid = el.dataset?.protCheck;
  if (!pid) return false;
  const s = readState();
  void writeState(P().toggleStartItem(s, pid, el.value));
  return true;
}
