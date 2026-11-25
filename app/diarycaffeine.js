// LIFESPAN OS Mobil – Tagebuch → Mahlzeiten: unterste Zeile „Koffein“ (1.100.0, wie PC 1.0.175).
// Zeigt die Koffein-Portionen des Tages (am Handy, Koffein-Widget, PC-Schnellerfassung) und lässt
// sie hinzufügen, ändern und entfernen. Koffein aus Supplementen, Mahlzeiten oder Fasttracking
// steht nur zur Info da (wird dort bearbeitet). Logik: caffeinedata.js; Rechnung: pcdomain.js.

import * as D from "./pcdomain.js";
import * as CF from "./caffeinedata.js";
import { caffeineIntakesOn } from "./icoach.js";
import { X, backToNowIfFromTimeline, today } from "./diary.js";
import { autoAttrs, autoSaveHtml } from "./autosave.js";

const C = () => D.caffeine;
const nowClock = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const amountOf = (drinkId) => {
  const ml = C().findDrink(drinkId)?.portionMl;
  return ml === null || ml === undefined ? "" : String(ml);
};

async function persist() {
  try {
    await X.store.set("caffeine", X.S.caffeine);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

/** Zeile „Koffein“ unter den Mahlzeiten. `appDay`: „heute“ der App (für die vorgeschlagene Uhrzeit). */
export function caffeineSlotHtml(date, appDay = today()) {
  const esc = X.esc;
  let list = [];
  try {
    list = caffeineIntakesOn(date);
  } catch {
    list = [];
  }
  const f = X.S.diaryCf?.date === date ? X.S.diaryCf : null;
  const totalMg = list.reduce((s, i) => s + i.mg, 0);
  // Voreinstellung zugeklappt wie alle Mahlzeiten (1.150.0)
  const expanded = f !== null || (X.S.mealOpen?.["__caffeine"] ?? false);
  const editable = (i) => C().isEditableIntake(i) && !i.linked;
  const rows = list
    .map(
      (i) => `<li><span class="meal-items__name">${esc(i.timeEstimated ? `ca. ${i.time}` : i.time)} · ${esc(i.label)}
        <span class="muted small">${esc(
          [
            i.ml === null ? "" : `${D.formatNumber(i.ml, 0)} ml`,
            !C().isEditableIntake(i) ? `aus ${C().CAFFEINE_SOURCE_LABELS[i.source] ?? i.source}` : i.linked ? "PC-Schnellerfassung (am PC ändern)" : "",
          ]
            .filter(Boolean)
            .join(" · "),
        )}</span></span>
        <span class="meal-items__kcal">${esc(C().formatMg(i.mg))} mg${
          editable(i)
            ? ` <button class="btn sm ghost" data-act="dcf-edit" data-arg="${esc(i.id)}" aria-label="${esc(i.label)} um ${esc(i.time)} ändern">✎</button><button class="btn sm ghost" data-act="dcf-delete" data-arg="${esc(i.id)}" aria-label="${esc(i.label)} um ${esc(i.time)} entfernen">✕</button>`
            : ""
        }</span></li>`,
    )
    .join("");
  const form = f ? formHtml(f, esc) : "";
  return `<div class="meal-slot caffeine-slot ${list.length ? "" : "is-empty"} ${expanded ? "" : "meal-slot--collapsed"}" data-meal-key="__caffeine">
    <div class="meal-slot__head"><button type="button" class="meal-slot__toggle" data-act="meal-toggle" data-arg="__caffeine|${expanded ? 0 : 1}" aria-expanded="${expanded}" title="${expanded ? "Zuklappen" : "Aufklappen"}"><span class="meal-slot__chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span><b>Koffein</b></button>
      ${list.length ? `<span class="meal-slot__kcal">${esc(C().formatMg(totalMg))} mg</span>` : ""}</div>
    ${list.length ? `<p class="muted small">${list.length} ${list.length === 1 ? "Portion" : "Portionen"}</p>` : ""}
    ${expanded ? `${list.length ? `<ul class="meal-items">${rows}</ul>` : ""}${form || `<div class="meal-actions"><button class="btn sm" data-act="dcf-new" data-arg="${esc(date)}|${date === appDay ? "1" : "0"}">+ Koffein</button></div>`}` : ""}
  </div>`;
}

function formHtml(f, esc) {
  const drink = C().findDrink(f.drinkId);
  const free = drink?.portionMl === null;
  const e = f.errors ?? {};
  return `<div class="dcf-form" ${autoAttrs("dcf", f.id ? "edit" : "new")}>
    <div class="field ${e.drinkId ? "has-error" : ""}"><label for="dcf-drink">Getränk</label><select id="dcf-drink" data-diary="dcf-drink">${C()
      .CAFFEINE_DRINKS.map((d) => `<option value="${esc(d.id)}" ${d.id === f.drinkId ? "selected" : ""}>${esc(d.label)}</option>`)
      .join("")}</select></div>
    <div class="cf-pair">
      <div class="field ${e.amount ? "has-error" : ""}"><label for="dcf-amount">${free ? "Koffein (mg)" : "Menge (ml)"}</label><input id="dcf-amount" type="text" inputmode="decimal" data-dcf="amount" required value="${esc(f.amount)}">${e.amount ? `<p class="field-error">${esc(e.amount)}</p>` : ""}</div>
      <div class="field ${e.time ? "has-error" : ""}"><label for="dcf-time">Uhrzeit</label><input id="dcf-time" type="time" data-dcf="time" required value="${esc(f.time)}">${e.time ? `<p class="field-error">${esc(e.time)}</p>` : ""}</div>
    </div>
    ${autoSaveHtml("dcf-save", { mode: f.id ? "edit" : "new", note: f.id ? "Änderungen werden automatisch gespeichert." : "Wird beim Ändern eines Feldes automatisch eingetragen – oder gleich so:" })}
    <div class="row">${f.id ? "" : `<button class="btn sm primary" data-act="dcf-save">Eintragen</button>`}<button class="btn sm" data-act="dcf-cancel">${f.id ? "Fertig" : "Abbrechen"}</button></div>
  </div>`;
}

function readForm() {
  const f = X.S.diaryCf;
  if (!f) return null;
  for (const el of document.querySelectorAll("[data-dcf]")) f[el.dataset.dcf] = el.value;
  const sel = document.getElementById("dcf-drink");
  if (sel) f.drinkId = sel.value;
  return f;
}

/** Auswahl des Getränks: Menge auf die übliche Portion setzen; true = behandelt. */
export function diaryCaffeineChange(el) {
  if (el.dataset?.diary !== "dcf-drink") return false;
  const f = readForm();
  if (f) {
    f.drinkId = el.value;
    f.amount = amountOf(el.value);
    f.errors = {};
    X.rerender();
  }
  return true;
}

export const diaryCaffeineActions = {
  "dcf-new": (el) => {
    const [date, isToday] = String(el.dataset.arg).split("|");
    const drinkId = "espresso";
    X.S.diaryCf = { id: null, date, drinkId, amount: amountOf(drinkId), time: isToday === "1" ? nowClock() : "", errors: {} };
    X.rerender();
  },
  "dcf-edit": (el) => {
    const date = X.S.diaryDate ?? today();
    const i = caffeineIntakesOn(date).find((x) => x.id === el.dataset.arg);
    if (!i) return;
    const known = C().findDrink(i.drinkId);
    X.S.diaryCf = {
      id: i.id,
      date,
      drinkId: known ? i.drinkId : "espresso",
      amount: known?.portionMl === null || i.ml === null ? String(Math.round(i.mg)) : String(i.ml),
      time: i.time,
      errors: {},
    };
    X.rerender();
  },
  "dcf-cancel": () => {
    X.S.diaryCf = null;
    X.S.fromTimeline = false;
    X.rerender();
  },
  "dcf-save": async () => {
    const S = X.S;
    const f = readForm();
    if (!f) return;
    const r = C().buildIntake({ drinkId: f.drinkId, time: f.time, amount: D.parseDecimal(f.amount) });
    if (!r.ok) {
      f.errors = r.errors;
      return X.rerender();
    }
    const input = {
      date: f.date,
      time: r.intake.time,
      drinkId: r.intake.drinkId,
      label: C().findDrink(r.intake.drinkId)?.label ?? r.intake.drinkId,
      ml: r.intake.ml,
      mg: Math.round(r.intake.mg * 10) / 10,
    };
    try {
      const wasNew = !f.id;
      if (f.id) CF.updateIntake(S.catalog, S.caffeine, f.id, input, new Date());
      else f.newId = CF.addIntake(S.catalog, S.caffeine, input, { uuid: X.uuid, now: new Date() });
      await persist();
      // Sofort speichern (1.131.0): Formular bleibt offen und bearbeitet den Eintrag
      if (S.autosaving) {
        if (wasNew) f.id = f.newId;
        f.errors = {};
        S.mealOpen = { ...(S.mealOpen ?? {}), __caffeine: true };
        X.toast(`${input.label} ${wasNew ? "eingetragen" : "geändert"}: ${C().formatMg(input.mg)} mg um ${input.time} Uhr.`);
        return X.rerender();
      }
      S.diaryCf = null;
      S.mealOpen = { ...(S.mealOpen ?? {}), __caffeine: true };
      X.toast(`${input.label} ${f.id ? "geändert" : "eingetragen"}: ${C().formatMg(input.mg)} mg um ${input.time} Uhr.`);
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
    backToNowIfFromTimeline();
  },
  "dcf-delete": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: entfernen")) return;
    try {
      CF.deleteIntake(X.S.catalog, X.S.caffeine, el.dataset.arg);
      await persist();
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
};
