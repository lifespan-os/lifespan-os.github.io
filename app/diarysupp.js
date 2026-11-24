// LIFESPAN OS Mobil – Nutrition → Tagebuch: Supplements (Einnahmen erfassen) und Fasttracking (aus diary.js, 1.75.0).
import * as P from "./pcdb.js";
import * as D from "./pcdomain.js";
import * as N from "./nutrition.js";
import * as SP from "./supplements.js";
import * as FT from "./fastdata.js";
import { buildDb, esc, nutrientCatalog, nutritionTabs, today, viewDiary, WEEKDAYS, X } from "./diary.js";
import { autoAttrs, autoSaveHtml } from "./autosave.js";

// ---------------- Supplements (am Handy erfassbar seit 1.26.0)

export function supplementsCard(intakes, suppMacros, hasSuppMacros) {
  const groups = D.groupIntakes(intakes);
  const own = SP.normSupp(X.S.supp);
  const unsent = SP.unsentSupp(own);
  const hasChoices = buildDbCached().supplements.size > 0;
  return `<section class="card card--nutrition"><div class="card__head"><h3>Supplements</h3>
      <span class="card__meta">${hasSuppMacros ? `${esc(D.formatKcal(suppMacros.energyKcal))} · P ${esc(D.formatGrams(suppMacros.proteinG))}` : ""}</span></div>
    ${
      intakes.length
        ? groups
            .map(
              (g) => `<div class="supp-group"><p class="small"><b>${esc(g.label.charAt(0).toUpperCase() + g.label.slice(1))}</b></p>
          <ul class="supp-list">${g.intakes
            .map(
              (i) => `<li><button type="button" class="supp-entry" data-act="supp-edit" data-arg="${esc(i.id)}" aria-label="${esc(`${i.name} bearbeiten`)}">
                <span><b>${esc(i.name)}</b>${i.time ? ` <span class="muted small">${esc(i.time)}</span>` : ""}${own.intakes[i.id] && !own.intakes[i.id].sent ? ` <span class="tag">neu</span>` : ""}</span>
                <span class="muted small">${esc(D.describeSupplements(i.items))}</span>${i.notes ? `<span class="muted small">${esc(i.notes)}</span>` : ""}</button></li>`,
            )
            .join("")}</ul></div>`,
            )
            .join("")
        : `<p class="muted small">An diesem Tag sind keine Supplements eingetragen.</p>`
    }
    ${
      hasChoices
        ? `<button class="btn block" data-act="supp-new">Supplements eintragen</button>`
        : `<p class="card__note">Noch keine Supplements vorhanden. Sie kommen mit der Supplement-Datenbank (neue Exportdatei vom PC bzw. Grunddaten des Kontos).</p>`
    }
    ${unsent ? `<p class="card__note">${unsent} ${unsent === 1 ? "Änderung geht" : "Änderungen gehen"} mit „Lebensmittel senden“ an den PC.</p>` : ""}
  </section>`;
}

export let dbCache = null;

/** Daten für Supplement-Karte und Editor (innerhalb eines Zeichnens einmal berechnet). */
export function buildDbCached() {
  if (!dbCache) {
    dbCache = buildDb();
    queueMicrotask(() => (dbCache = null));
  }
  return dbCache;
}

export const suppLabel = (s) => (s.manufacturer ? `${s.name} (${s.manufacturer})` : s.name);

/** Editor „Supplements eintragen / bearbeiten“ (wie IntakeEditor am PC). */
export function viewSuppIntake() {
  const S = X.S;
  const st = S.suppEdit;
  if (!st) return viewDiary();
  const db = buildDbCached();
  const d = st.draft;
  const slots = D.daySlots(P.mealDay(db, d.date));
  const options = SP.timingOptions(slots);
  if (d.timing && !options.some((o) => o.value === d.timing)) options.unshift({ value: d.timing, label: "Bisherige Mahlzeit" });
  const stacks = SP.stackChoices(S.catalog?.pc);
  const hits = st.query ? SP.searchSupplements(db, st.query, 25) : [];
  const chosen = new Set(d.items.map((i) => i.supplementId));
  const title = "Einnahme";
  return `${X.header(title, { back: "diary" })}<main class="wrap" ${autoAttrs("supp", d.id ? "edit" : "new")} data-autosave-ready="${d.items.length ? 1 : 0}">
    <section class="card">
      <p class="small"><b>${d.id ? "Bearbeiten" : "Eintragen"}</b> · ${esc(D.formatDate(d.date))}${d.stackId ? ` · Stack „${esc(d.name)}“` : ""}</p>
      <div class="grid2">
        <div class="field"><label for="supp-timing">Einnahme</label>
          <select id="supp-timing" data-diary="supp-timing">${options.map((o) => `<option value="${esc(o.value)}" ${o.value === d.timing ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>
        <div class="field"><label for="supp-time">Uhrzeit (optional)</label>
          <input id="supp-time" type="time" data-diary="supp-time" value="${esc(d.time)}"></div>
      </div>
      <p class="muted small">Zu einer Mahlzeit dieses Tages, nüchtern oder unabhängig von Mahlzeiten.</p>
      ${
        stacks.length
          ? `<div class="field"><label for="supp-stack">Stack übernehmen</label>
            <select id="supp-stack" data-diary="supp-stack"><option value="">${d.stackId ? "Stack behalten" : "– kein Stack –"}</option>${stacks
              .map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${s.items.length})</option>`)
              .join("")}</select></div>`
          : ""
      }
      ${d.stackId ? `<p class="muted small">Änderungen gelten nur für diesen Tag – der Stack bleibt unverändert.</p>` : ""}
    </section>
    <section class="card">
      <h3>Supplements</h3>
      ${
        d.items.length
          ? `<ul class="supp-items">${d.items
              .map((it, i) => {
                const s = db.supplements.get(it.supplementId);
                return `<li><span class="supp-items__name">${esc(s ? suppLabel(s) : "Unbekanntes Supplement")}</span>
                  <span class="supp-items__amount"><input type="text" inputmode="decimal" aria-label="${esc(`Menge von ${s?.name ?? "Eintrag"}`)}" data-diary="supp-amt" data-arg="${i}" value="${esc(it.amount)}">
                  <span class="muted small">${esc(s?.unit ?? "")}</span></span>
                  <button class="btn sm ghost danger" data-act="supp-item-del" data-autosave-click data-arg="${i}" aria-label="${esc(`${s?.name ?? "Eintrag"} entfernen`)}">✕</button></li>`;
              })
              .join("")}</ul>`
          : `<p class="muted small">Noch keine Supplements gewählt.</p>`
      }
      <div class="field"><label for="supp-q">Supplement hinzufügen</label>
        <input id="supp-q" type="search" data-diary="supp-q" data-autosave-skip autocomplete="off" placeholder="Supplement suchen, z. B. Vitamin D …" value="${esc(st.query)}"></div>
      <ul class="supp-hits" id="supp-hits">${suppHits(hits, chosen)}</ul>
    </section>
    <section class="card">
      <div class="field"><label for="supp-notes">Notizen (optional)</label>
        <textarea id="supp-notes" rows="2" maxlength="1000" data-diary="supp-notes">${esc(d.notes)}</textarea></div>
      ${st.error ? `<p class="field-error">${esc(st.error)}</p>` : ""}
      ${autoSaveHtml("supp-save", { mode: d.id ? "edit" : "new", note: d.id ? "Änderungen werden automatisch gespeichert." : "Wird automatisch gespeichert, sobald ein Supplement gewählt ist." })}
      ${d.id ? `<button class="btn block ghost danger" data-act="supp-delete">Vom Tag entfernen</button>` : ""}
    </section>
  </main>`;
}

export function suppHits(hits, chosen) {
  const st = X.S.suppEdit;
  if (!st?.query) return "";
  if (!hits.length) return `<li class="muted small">Kein Supplement gefunden.</li>`;
  return hits
    .map(
      (s) => `<li><button type="button" class="supp-hit" data-act="supp-add" data-autosave-click data-arg="${esc(s.id)}">
        <span>${esc(s.name)}${s.manufacturer ? ` <span class="muted small">${esc(s.manufacturer)}</span>` : ""}</span>
        <span class="muted small">${chosen.has(s.id) ? "schon gewählt" : `${esc(SP.fmtAmount(SP.startAmount(s)))} ${esc(s.unit)}`}</span></button></li>`,
    )
    .join("");
}

/** Eingaben des Editors in den Entwurf übernehmen (vor Speichern und vor jedem Neuzeichnen). */
export function readSuppForm() {
  const st = X.S.suppEdit;
  if (!st) return;
  const d = st.draft;
  const v = (id) => document.getElementById(id);
  if (v("supp-timing")) d.timing = v("supp-timing").value;
  if (v("supp-time")) d.time = v("supp-time").value;
  if (v("supp-notes")) d.notes = v("supp-notes").value;
  document.querySelectorAll("[data-diary=supp-amt]").forEach((el) => {
    const it = d.items[Number(el.dataset.arg)];
    if (it) it.amount = el.value;
  });
}

export async function persistSupp() {
  try {
    await X.store.set("supp", X.S.supp);
    await X.store.set("nutrition", X.S.food.local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

// ---------------- Fasttracking und Mikronährstoffe

export function fastCard(catalog, fast, date) {
  return `<section class="card card--nutrition"><div class="card__head"><h3>Fasttracking</h3>
      <span class="card__meta"><button class="linkbtn" data-act="fast-open" data-arg="" data-date="${esc(date)}">Bearbeiten</button></span></div>
    ${D.groupedValues(catalog, fast)
      .map(
        (g) => `<div class="fast-values"><p class="fast-values__title">${esc(g.label)}</p><dl>${g.items
          .map(({ def, value }) => `<div><dt>${esc(def.label)}</dt><dd>${esc(D.formatNutrient(value, def.unit))}</dd></div>`)
          .join("")}</dl></div>`,
      )
      .join("")}
    ${fast.notes ? `<p class="card__note card__note--keep">${esc(fast.notes)}</p>` : ""}
  </section>`;
}

// ---------------- Fasttracking eintragen (am Handy seit 1.55.0, wie FasttrackEditor.tsx)

export const FAST_DAY = "";

/** Mahlzeiten des Tages als Ziel (Schlüssel wie im Tagebuch). */
export function fastTargets(db, date) {
  return D.daySlots(P.mealDay(db, date)).map((slot) => ({ key: slot.ref.name ? N.extraKey(slot.ref.name) : slot.ref.mealType, title: slot.title, meal: slot.meal }));
}

export function fastTargetOf(db, st) {
  if (st.target === FAST_DAY) return { kind: "day", date: st.date };
  const t = fastTargets(db, st.date).find((x) => x.key === st.target);
  return t?.meal ? { kind: "meal", mealId: t.meal.id } : null;
}

export const numText = (v) => String(Math.round(v * 1000) / 1000).replace(".", ",");

/** Formular mit den vorhandenen Werten des Ziels füllen. */
export function loadFast(st) {
  const db = buildDb();
  const target = fastTargetOf(db, st);
  const cur = target ? FT.currentValues(db, target) : { values: {}, notes: "", exists: false };
  st.values = Object.fromEntries(Object.entries(cur.values).map(([k, v]) => [k, numText(v)]));
  st.notes = cur.notes ?? "";
  st.exists = cur.exists;
  st.errors = {};
  st.error = null;
}

export function viewFastEntry() {
  const st = X.S.fastEdit;
  if (!st) return viewDiary();
  const db = buildDb();
  const catalog = nutrientCatalog(db);
  const targets = fastTargets(db, st.date);
  const field = (n) => {
    const err = st.errors[`values.${n.key}`];
    return `<div class="field"><label for="fe-${esc(n.key)}">${esc(n.label)} <span class="muted">(${esc(n.unit)})</span></label>
      <input id="fe-${esc(n.key)}" type="text" inputmode="decimal" autocomplete="off" data-fast="${esc(n.key)}" value="${esc(st.values[n.key] ?? "")}" ${err ? 'aria-invalid="true"' : ""}>
      ${err ? `<p class="err small">${esc(err)}</p>` : ""}</div>`;
  };
  const groups = catalog.groups.map((g) => ({ g, list: catalog.nutrients.filter((n) => n.group === g.key) })).filter((x) => x.list.length);
  return `${X.header("Nutrition")}<main class="wrap">
    ${nutritionTabs("diary")}
    <section class="card hl" ${autoAttrs("fast")}>
      <h3>Fasttracking</h3>
      <p class="muted small">${st.date === today() ? "Heute" : `${WEEKDAYS[new Date(`${st.date}T12:00:00`).getDay()]} ${esc(D.formatDate(st.date))}`} – Nährwerte direkt eintragen, z. B. im Restaurant oder aus einer anderen App. Leere Felder = nicht erfasst.</p>
      <div class="field"><label for="fe-target">Für</label><select id="fe-target" data-diary="fast-target" data-autosave-skip>
        <option value="" ${st.target === FAST_DAY ? "selected" : ""}>Ganzer Tag (Tageswerte)</option>
        ${targets.map((t) => `<option value="${esc(t.key)}" ${t.key === st.target ? "selected" : ""}>${esc(t.title)}</option>`).join("")}
      </select></div>
      ${groups
        .map(({ g, list }) =>
          g.key === "macros"
            ? `<div class="nf-grid">${list.map(field).join("")}</div>`
            : `<details class="fast-group" ${list.some((n) => st.values[n.key]) ? "open" : ""}><summary>${esc(g.label)}${
                list.filter((n) => st.values[n.key]).length ? ` · ${list.filter((n) => st.values[n.key]).length}` : ""
              }</summary><div class="nf-grid">${list.map(field).join("")}</div></details>`,
        )
        .join("")}
      ${
        st.target === FAST_DAY
          ? `<div class="field"><label for="fe-notes">Notiz (optional)</label><textarea id="fe-notes" rows="2" maxlength="500" data-fast-notes="1">${esc(st.notes)}</textarea></div>`
          : ""
      }
      ${st.error ? `<p class="field-error">${esc(st.error)}</p>` : ""}
      ${autoSaveHtml("fast-save")}
      ${st.exists ? `<button class="btn ghost danger block" data-act="fast-clear">Alle Werte entfernen</button>` : ""}
      <button class="btn ghost block" data-act="fast-cancel">Fertig</button>
      <p class="card__note">Gespeichert werden alle Werte dieses Ziels. Geht mit „Lebensmittel senden“ an den PC.</p>
    </section>
  </main>`;
}

export function readFastForm(st) {
  for (const el of document.querySelectorAll("[data-fast]")) st.values[el.dataset.fast] = el.value;
  const n = document.querySelector("[data-fast-notes]");
  if (n) st.notes = n.value;
}

export async function persistFast() {
  try {
    await X.store.set("fast", X.S.fast);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

export async function saveFastForm(clear) {
  const st = X.S.fastEdit;
  if (!st) return;
  if (!clear) readFastForm(st);
  let db = buildDb();
  const catalog = nutrientCatalog(db);
  const parsed = clear ? { ok: true, input: { values: {} } } : D.fastDraftToInput({ date: st.date, exists: st.exists, notes: st.notes, values: st.values });
  if (!parsed.ok) {
    st.errors = parsed.errors;
    st.error = parsed.errors.values ?? "Bitte die markierten Felder prüfen.";
    return X.rerender();
  }
  let target = fastTargetOf(db, st);
  if (!target && st.target !== FAST_DAY) {
    // Leere Mahlzeit: erst anlegen (ohne Lebensmittel)
    const id = N.ensureMeal(X.S.catalog, X.S.food.local, st.date, st.target, { uuid: X.uuid, now: new Date() });
    const row = X.S.food.local.meals[id]?.row;
    if (row && st.date !== today()) row.time = null;
    await X.store.set("nutrition", X.S.food.local);
    db = buildDb();
    target = { kind: "meal", mealId: id };
  }
  try {
    X.S.fast = FT.normFast(X.S.fast);
    FT.saveFast(db, X.S.fast, target, parsed.input.values, st.notes, {
      uuid: X.uuid,
      now: new Date(),
      knownKeys: new Set(catalog.nutrients.map((n) => n.key)),
      pcIds: FT.pcFastIds(X.S.catalog),
    });
  } catch (e) {
    st.error = e.message;
    return X.rerender();
  }
  await persistFast();
  // Sofort speichern (1.131.0): Formular bleibt offen
  if (X.S.autosaving && !clear) {
    Object.assign(st, { exists: true, error: null, errors: null });
    X.toast("Fasttracking gespeichert.");
    return X.rerender();
  }
  X.S.fastEdit = null;
  X.S.diaryDate = st.date;
  X.toast(clear ? "Fasttracking-Werte entfernt." : "Fasttracking gespeichert.");
  X.go("diary");
}
