// LIFESPAN OS Mobil – Settings → Tagesziele (1.28.0), Aufbau wie GoalsPanel.tsx am PC.

import * as GL from "./goals.js";
import * as P from "./pcdb.js";
import * as D from "./pcdomain.js";
import { buildDb, today } from "./diary.js";
import { autoAttrs, autoSaveHtml } from "./autosave.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initGoals(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const fmt = (v, d = 0) => Number(v).toLocaleString("de-DE", { maximumFractionDigits: d });

/** Formular öffnen: neuer Zielstand ab heute (übernimmt den zuletzt gültigen) oder bestehender. */
function openDraft(id = null) {
  const db = buildDb();
  if (id) {
    const r = db.goals.find((g) => g.id === id);
    if (r) {
      X.S.goalForm = { draft: GL.editDraft(P.goalFor({ goals: [r] }, r.valid_from)), error: null, field: null };
      return;
    }
  }
  const t = today();
  X.S.goalForm = { draft: GL.toDraft(P.goalFor(db, t), t), error: null, field: null };
}

const pctLabel = (mode) => (mode === "fixed" ? "% der Energie" : "% des Tagesbedarfs");

function field(id, label, value, { hint = "", type = "text", mode = "decimal", placeholder = "", err } = {}) {
  return `<div class="field"><label for="goal-${id}">${esc(label)}</label>
    <input id="goal-${id}" type="${type}" ${type === "text" ? `inputmode="${mode}"` : ""} data-goal="${id}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${err ? 'aria-invalid="true"' : ""}>
    ${err ? `<p class="field-error">${esc(err)}</p>` : hint ? `<p class="muted small">${esc(hint)}</p>` : ""}</div>`;
}

function select(id, label, value, options) {
  return `<div class="field"><label for="goal-${id}">${esc(label)}</label>
    <select id="goal-${id}" data-goal="${id}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
}

function pctHint(d, m) {
  if (d[`${m}Unit`] !== "pct") return "";
  if (d.energyMode === "dynamic") return `Anteil am Tagesbedarf (Verbrauch ± Ziel), täglich in g umgerechnet – ${GL.KCAL_PER_G[m]} kcal je g`;
  const energy = Number(String(d.energyKcal).replace(",", "."));
  const pct = Number(String(d[`${m}G`]).replace(",", "."));
  if (!(energy > 0)) return "Bitte zuerst Energie (kcal) eintragen.";
  if (!(pct > 0)) return `${GL.KCAL_PER_G[m]} kcal je g`;
  return `= ${fmt(GL.gramsFromPercent(energy, pct, GL.KCAL_PER_G[m]))} g (${fmt(pct, 1)} % von ${fmt(energy)} kcal)`;
}

function macroCell(g, pct) {
  if (pct != null) return g !== null ? `${g} g (${fmt(pct)} %)` : `${fmt(pct)} %`;
  return g !== null ? `${g} g` : "–";
}

function energyCell(r) {
  if (r.energy_mode !== "dynamic") return r.energy_kcal !== null ? `${fmt(r.energy_kcal)} kcal` : "–";
  const k = r.energy_adjust_kcal;
  const p = r.energy_adjust_percent;
  const adj = k ? ` ${k < 0 ? "−" : "+"} ${fmt(Math.abs(k))} kcal` : p ? ` ${p < 0 ? "−" : "+"} ${Math.abs(p)} %` : "";
  return `Verbrauch${adj}`;
}

export function viewGoals() {
  const S = X.S;
  if (!S.goalForm) openDraft();
  const { draft: d, error, field: errField } = S.goalForm;
  const err = (f) => (errField === f ? error : null);
  const dynamic = d.energyMode === "dynamic";
  const db = buildDb();
  const own = GL.normGoals(S.goals);
  const list = db.goals;
  return `${X.header("Tagesziele", { back: "settings" })}<main class="wrap">
    <section class="card goal-form" ${autoAttrs("goal")}>
      <h3>${d.id ? `Ziele ab ${esc(D.formatDate(d.validFrom))} bearbeiten` : "Neue Ziele"}</h3>
      ${field("validFrom", "Gültig ab", d.validFrom, { type: "date", err: err("validFrom") })}
      ${select("energyMode", "Kalorienziel", d.energyMode, [
        ["fixed", "Fester Wert"],
        ["dynamic", "Dynamisch aus Gesamtverbrauch"],
      ])}
      ${
        dynamic
          ? `<div class="grid2">${select("direction", "Ziel", d.direction, [
              ["deficit", "Defizit (abnehmen)"],
              ["maintain", "Halten"],
              ["surplus", "Überschuss (zunehmen)"],
            ])}${select("adjustUnit", "Einheit", d.adjustUnit, [
              ["kcal", "kcal"],
              ["percent", "% des Verbrauchs"],
            ])}</div>
            ${d.direction !== "maintain" ? field("adjustAmount", d.direction === "deficit" ? "Defizit" : "Überschuss", d.adjustAmount, { mode: "numeric", placeholder: d.adjustUnit === "kcal" ? "z. B. 500" : "z. B. 15", err: err("adjustAmount") }) : ""}`
          : field("energyKcal", "Energie (kcal)", d.energyKcal, { mode: "numeric", hint: "Der Verbrauch durch Schritte kommt im Tagesbedarf dazu.", err: err("energyKcal") })
      }
      <div class="grid2">
        ${field("proteinG", "Protein", d.proteinG, { hint: pctHint(d, "protein"), err: err("proteinG") })}
        ${select("proteinUnit", "Protein angeben in", d.proteinUnit, [
          ["g", "g je Tag"],
          ["perKg", "g je kg Körpergewicht"],
          ["pct", pctLabel(d.energyMode)],
        ])}
        ${field("carbsG", "Kohlenhydrate", d.carbsG, { hint: pctHint(d, "carbs"), err: err("carbsG") })}
        ${select("carbsUnit", "Kohlenhydrate in", d.carbsUnit, [
          ["g", "g je Tag"],
          ["pct", pctLabel(d.energyMode)],
        ])}
        ${field("fatG", "Fett", d.fatG, { hint: pctHint(d, "fat"), err: err("fatG") })}
        ${select("fatUnit", "Fett in", d.fatUnit, [
          ["g", "g je Tag"],
          ["pct", pctLabel(d.energyMode)],
        ])}
      </div>
      <div class="grid2">
        ${field("sleepHours", "Schlaf (Stunden)", d.sleepHours, { placeholder: "z. B. 7,5", err: err("sleepHours") })}
        ${field("weightKg", "Zielgewicht (kg)", d.weightKg, { err: err("weightKg") })}
        ${field("steps", "Tagesschrittziel", d.steps, { mode: "numeric", placeholder: "z. B. 10000", err: err("steps") })}
        ${field("waterL", "Trinkziel (Liter)", d.waterL, { placeholder: "z. B. 2,5", err: err("waterL") })}
      </div>
      ${
        dynamic
          ? `<label class="goal-check"><input type="checkbox" data-goal="calibrate" ${d.calibrate ? "checked" : ""}> Gesamtverbrauch über den Gewichtsverlauf kalibrieren</label>
            <p class="muted small">Nach mindestens 14 erfassten Ernährungstagen und Wiegungen über 14 Tage vergleicht die App deine Aufnahme mit deinem Gewichtstrend und passt die Berechnung an dich an.</p>`
          : ""
      }
      <p class="muted small">Alle Ziele sind optional. Sie werden nur als Vergleichswert neben deinen Einträgen angezeigt.</p>
      ${error && !errField ? `<p class="field-error">${esc(error)}</p>` : ""}
      ${autoSaveHtml("goal-save")}
      ${d.id ? `<button class="btn block ghost" data-act="goal-new">Fertig</button>` : ""}
    </section>
    <section class="card">
      <h3>Bisherige Zielstände</h3>
      ${
        list.length
          ? `<ul class="goal-list">${list
              .map(
                (r) => `<li><div><b>ab ${esc(D.formatDate(r.valid_from))}</b>${own.rows[r.id] && !own.rows[r.id].sent ? ` <span class="tag">neu</span>` : ""}
                  <small class="muted">${esc(energyCell(r))} · P ${esc(r.protein_g_per_kg !== null ? `${fmt(r.protein_g_per_kg, 1)} g/kg` : macroCell(r.protein_g, r.protein_pct))} · KH ${esc(macroCell(r.carbs_g, r.carbs_pct))} · F ${esc(macroCell(r.fat_g, r.fat_pct))}</small>
                  <small class="muted">${[
                    r.sleep_min !== null ? `Schlaf ${fmt(r.sleep_min / 60, 2)} h` : "",
                    r.weight_kg !== null ? `Gewicht ${fmt(r.weight_kg, 1)} kg` : "",
                    r.steps !== null ? `${fmt(r.steps)} Schritte` : "",
                    r.water_l !== null ? `Wasser ${fmt(r.water_l, 2)} l` : "",
                  ]
                    .filter(Boolean)
                    .map(esc)
                    .join(" · ")}</small></div>
                  <span class="row-actions"><button class="btn sm" data-act="goal-edit" data-arg="${esc(r.id)}">Bearbeiten</button>
                  <button class="btn sm ghost danger" data-act="goal-delete" data-arg="${esc(r.id)}" aria-label="Zielstand löschen">✕</button></span></li>`,
              )
              .join("")}</ul>`
          : `<p class="muted small">Noch keine Tagesziele.</p>`
      }
      ${GL.unsentGoals(own) ? `<p class="card__note">Änderungen gehen mit „Körperwerte … senden“ an den PC.</p>` : ""}
    </section>
  </main>`;
}

/** Eingaben ins Formular übernehmen. */
function readForm() {
  const f = X.S.goalForm;
  if (!f) return;
  for (const el of document.querySelectorAll("[data-goal]")) {
    const k = el.dataset.goal;
    f.draft[k] = el.type === "checkbox" ? el.checked : el.value;
  }
}

async function persist() {
  try {
    await X.store.set("goals", X.S.goals);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

export const goalActions = {
  "goals-open": () => {
    X.S.goalForm = null;
    X.go("goals");
  },
  "goal-new": () => {
    X.S.goalForm = null;
    X.rerender();
  },
  "goal-edit": (el) => {
    openDraft(el.dataset.arg);
    if (X.S.view !== "goals") X.go("goals");
    else X.rerender();
    window.scrollTo(0, 0);
  },
  "goal-save": async () => {
    readForm();
    const f = X.S.goalForm;
    X.S.goals = GL.normGoals(X.S.goals);
    try {
      const row = GL.saveGoal(X.S.goals, buildDb().goals, f.draft, { uuid: X.uuid, now: new Date() });
      f.draft.id = row.id;
    } catch (e) {
      f.error = e.message;
      f.field = e.field ?? null;
      X.rerender();
      return;
    }
    await persist();
    // Sofort speichern (1.131.0): Formular bleibt offen und bearbeitet den gespeicherten Zielstand
    if (X.S.autosaving) Object.assign(f, { error: null, field: null });
    else X.S.goalForm = null;
    X.toast("Ziele gespeichert.");
    X.rerender();
  },
  "goal-delete": async (el) => {
    if (!X.confirmTwice(el, "Nochmal: löschen")) return;
    X.S.goals = GL.normGoals(X.S.goals);
    const pcIds = new Set((X.S.catalog?.pc?.daily_goal ?? []).map((r) => r.id));
    GL.deleteGoal(X.S.goals, el.dataset.arg, pcIds);
    await persist();
    if (X.S.goalForm?.draft.id === el.dataset.arg) X.S.goalForm = null;
    X.toast("Zielstand gelöscht.");
    X.rerender();
  },
};

/** Auswahlfelder, die das Formular verändern (Modus, Einheiten); true = behandelt. */
export function goalChange(el) {
  if (!el.dataset?.goal) return false;
  readForm();
  const f = X.S.goalForm;
  const k = el.dataset.goal;
  if (k === "adjustUnit" && el.value === "percent" && f.draft.energyMode === "dynamic") {
    // wie am PC: Anpassung in % → Makros auf Prozent (Werte mit anderer Einheit leeren)
    for (const m of ["protein", "carbs", "fat"]) {
      if (f.draft[`${m}Unit`] !== "pct") f.draft[`${m}G`] = "";
      f.draft[`${m}Unit`] = "pct";
    }
  }
  if (/Unit$/.test(k) && k !== "adjustUnit") f.draft[k.replace("Unit", "G")] = "";
  // Nur Auswahlfelder zeichnen neu – bei Zahlenfeldern ginge sonst der Fokus des nächsten Felds verloren
  if (["energyMode", "direction", "adjustUnit", "proteinUnit", "carbsUnit", "fatUnit"].includes(k)) {
    if (f.field === k) f.error = f.field = null;
    X.rerender();
  }
  return true;
}
