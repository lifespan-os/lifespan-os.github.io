// LIFESPAN OS Mobil – Training → Pläne (PlansTab.tsx): Liste, Plan- und Tageseditor (aus training.js, 1.75.0).
import * as D from "./pcdomain.js";
import * as TR from "./trainingdata.js";
import { planGymSelectHtml } from "./gymsui.js";
import { planCalendarHtml, plansView } from "./plancalendar.js";
import * as GD from "./gymsdata.js";
import { actionBtn, esc, fieldError, notice, X } from "./training.js";
import { autoAttrs, autoSaveHtml } from "./autosave.js";
import { buildDb, today } from "./diary.js";
import { trainingHintsHtml } from "./trainingadvice.js";

/** Hinweise aus den Trainingsregeln für die Planung (1.186.0); ohne Treffer leer */
function planningHints() {
  try {
    return trainingHintsHtml(buildDb(), today(), "Planung", esc);
  } catch {
    return "";
  }
}

// ------------------------------------------------------------------ Pläne (PlansTab.tsx)

export const WEEKDAYS = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export function isCardioCheck() {
  const ids = new Set(X.S.catalog.exercises.filter((e) => (e.category ?? "strength") === "cardio").map((e) => e.id));
  return (id) => ids.has(id);
}

export function plansHaveData() {
  return TR.hasTable(X.S.catalogRaw, "training_plan");
}

export function plansTab() {
  const S = X.S;
  if (!plansHaveData()) {
    return `<section class="card"><p class="warn">Für die Pläne wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Import/Export „Neue Exportdatei laden“.</p></section>`;
  }
  if (S.trainPlanEdit) return planEditor();
  const plans = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises);
  const planGymNames = GD.gymNames(S.catalog, S.gyms);
  const cardio = isCardioCheck();
  const view = plansView();
  const head = `<section class="card card--training"><div class="wo-head"><h3>Trainingspläne</h3><button class="btn primary sm" data-act="plan-new">Neuer Plan</button></div>
      <p class="card__note">Pläne legen Trainingstage mit Übungen und Sätzen fest – auch Cardiopläne. Aus einem Tag startest du ein Training; die Sätze sind dann mit den Richtwerten vorbelegt. Termine (Wochentag oder Datum mit Uhrzeit) zeigen in der Übersicht das nächste Training.</p>
      <div class="segmented" role="group" aria-label="Darstellung der Pläne"><button class="${view === "list" ? "is-active" : ""}" data-act="plan-view" data-arg="list" aria-pressed="${view === "list"}">Liste</button><button class="${view === "calendar" ? "is-active" : ""}" data-act="plan-view" data-arg="calendar" aria-pressed="${view === "calendar"}">Kalender</button></div></section>
    ${notice()}
    ${planningHints()}`;
  if (view === "calendar") return `${head}<section class="card card--training">${planCalendarHtml()}</section>`;
  return `${head}
    ${plans.length ? "" : `<section class="card card--training"><div class="empty-state"><p><strong>Noch keine Trainingspläne</strong></p><p class="muted small">Ein Plan ist optional. Einheiten kannst du auch ohne Plan erfassen.</p></div></section>`}
    ${plans
      .map(
        (plan) => `<section class="card card--training">
        <div class="wo-head"><h3 class="plan-title"><span class="plan-icon" title="${esc(D.planIconLabel(D.planIconKey(plan)))}">${D.planIconSvg(D.planIconKey(plan), 30)}</span>${esc(plan.name)} ${plan.archived ? '<span class="pill">Archiviert</span>' : ""}</h3></div>
        <div class="row-actions icon-actions">${actionBtn("plan-edit", plan.id, "edit", `Plan „${plan.name}“ bearbeiten`)}${actionBtn("plan-copy", plan.id, "copy", `Plan „${plan.name}“ kopieren`)}${actionBtn("plan-delete", plan.id, "trash", `Plan „${plan.name}“ löschen`, "danger")}</div>
        ${plan.description ? `<p class="muted small">${esc(plan.description)}</p>` : ""}
        ${plan.gymId && planGymNames.get(plan.gymId) ? `<p class="muted small">Gym: ${esc(planGymNames.get(plan.gymId))}</p>` : ""}
        ${plan.days
          .map(
            (day) => `<div class="meal-block"><div class="wo-head"><h4>${esc(day.name)}</h4>${
              !plan.archived && day.exercises.length ? `<button class="btn sm" data-act="train-start-plan-day" data-arg="${esc(day.id)}" ${S.active ? "disabled" : ""}>▶ Training starten</button>` : ""
            }</div>
            ${(day.slots ?? []).length ? `<p class="muted small">🗓 ${esc(day.slots.map(describeSlot).join(" · "))}</p>` : ""}
            ${day.notes ? `<p class="muted small">${esc(day.notes)}</p>` : ""}
            ${
              day.exercises.length
                ? `<ul class="plan-ex-list">${day.exercises
                    .map((e) => `<li><span>${esc(e.exerciseName)}</span><span class="muted small">${esc(D.planDraft.describePlanSets(D.workoutDraft.planExerciseToDraft(e, cardio(e.exerciseId)).sets))}</span></li>`)
                    .join("")}</ul>`
                : `<p class="muted small">Noch keine Übungen.</p>`
            }</div>`,
          )
          .join("")}
      </section>`,
      )
      .join("")}`;
}

export const describeSlot = (s) => D.planSchedule.describeSlot(s);

/** Symbol des Plans wählen (1.63.0): „Automatisch“ nach dem Namen oder ein festes Symbol. */
export function planIconPickerHtml(draft) {
  const auto = D.detectPlanIcon(draft.name ?? "", draft.description ?? "");
  const current = draft.icon || D.AUTO_ICON;
  const opts = [{ key: D.AUTO_ICON, label: `Automatisch (${D.planIconLabel(auto)})`, icon: auto }, ...D.PLAN_ICONS.map((i) => ({ key: i.key, label: i.label, icon: i.key }))];
  return `<div class="field"><span class="label">Symbol</span><div class="plan-icon-grid" role="radiogroup" aria-label="Symbol des Plans">${opts
    .map(
      (o) => `<button class="plan-icon-choice ${current === o.key ? "is-selected" : ""}" role="radio" aria-checked="${current === o.key}" data-act="plan-icon" data-autosave-click data-arg="${esc(o.key)}"><span class="plan-icon">${D.planIconSvg(o.icon, 28)}</span><span>${esc(o.label)}</span></button>`,
    )
    .join("")}</div></div>`;
}

export function planEditor() {
  const S = X.S;
  const draft = S.trainPlanEdit;
  const errors = S.trainErrors ?? {};
  if (S.trainPlanDayIdx !== null && S.trainPlanDayIdx !== undefined && draft.days[S.trainPlanDayIdx]) return planDayEditor(draft, S.trainPlanDayIdx, errors);
  const byId = new Map(S.catalog.exercises.map((e) => [e.id, e]));
  for (const e of S.localExercises ?? []) byId.set(e.id, e);
  return `<section class="card card--training" ${autoAttrs("plan", draft.id ? "edit" : "new")} data-autosave-ready="${draft.days.length ? 1 : 0}"><h3>${draft.id ? "Plan bearbeiten" : "Neuer Plan"}</h3>
    ${notice()}
    <div class="field"><label for="plan-name">Name</label><input id="plan-name" type="text" maxlength="80" required placeholder="z. B. Push/Pull/Beine oder Cardio" value="${esc(draft.name)}" data-plan="name">${fieldError(errors, "name")}</div>
    <label class="toggle"><input type="checkbox" data-plan="archived" ${draft.archived ? "checked" : ""}> Archiviert</label>
    <div class="field"><label for="plan-description">Beschreibung (optional)</label><textarea id="plan-description" rows="2" maxlength="2000" data-plan="description">${esc(draft.description)}</textarea>${fieldError(errors, "description")}</div>
    ${planGymSelectHtml(draft)}${fieldError(errors, "gymId")}
    ${planIconPickerHtml(draft)}${fieldError(errors, "icon")}
    <h4>Trainingstage</h4>
    <p class="muted small">Übungen fügst du wie in einem normalen Training hinzu (Sätze, Pause, Notiz). Für einen Cardioplan wählst du Cardio-Übungen wie Laufband oder Rad.</p>
    ${fieldError(errors, "days")}
    ${draft.days
      .map((day, di) => {
        const exErr = Object.keys(errors).some((k) => k.startsWith(`days.${di}.exercises`));
        return `<div class="exercise-block">
          <div class="field"><label for="plan-day-${di}">Tag ${di + 1}</label><input id="plan-day-${di}" type="text" maxlength="80" value="${esc(day.name)}" data-plan-day="${di}" data-pf="name">${fieldError(errors, `days.${di}.name`)}</div>
          <div class="row-actions"><button class="btn sm" data-act="plan-day-move" data-autosave-click data-arg="${di}|-1" ${di === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button>
            <button class="btn sm" data-act="plan-day-move" data-autosave-click data-arg="${di}|1" ${di === draft.days.length - 1 ? "disabled" : ""} aria-label="Nach unten">↓</button>
            <button class="btn sm danger" data-act="plan-day-remove" data-autosave-click data-arg="${di}" aria-label="Tag entfernen">✕ Tag entfernen</button></div>
          ${
            day.exercises.length
              ? `<ul class="plan-ex-list">${day.exercises.map((ex) => `<li><span>${esc(byId.get(ex.exerciseId)?.name ?? "Unbekannte Übung")}</span><span class="muted small">${esc(D.planDraft.describePlanSets(ex.sets))}</span></li>`).join("")}</ul>`
              : `<p class="muted small">Noch keine Übungen.</p>`
          }
          ${exErr ? `<p class="field-error">Bei den Übungen dieses Tages sind Felder zu prüfen – bitte „Übungen bearbeiten“ öffnen.</p>` : ""}
          ${fieldError(errors, `days.${di}.exercises`)}
          <button class="btn" data-act="plan-day-open" data-arg="${di}">🏋 ${day.exercises.length ? "Übungen bearbeiten" : "Übungen hinzufügen"}</button>
          ${slotEditor(day, di, errors)}
        </div>`;
      })
      .join("")}
    <button class="btn" data-act="plan-day-add" data-autosave-click>+ Trainingstag hinzufügen</button>
    ${autoSaveHtml("plan-save", { mode: draft.id ? "edit" : "new", note: draft.id ? "Änderungen werden automatisch gespeichert." : "Wird automatisch gespeichert, sobald Name und ein Trainingstag da sind." })}
    <div class="row-actions"><button class="btn" data-act="plan-cancel">${draft.id ? "Fertig" : "Abbrechen"}</button></div>
  </section>`;
}

export function slotEditor(day, di, errors) {
  const err = (si, n) => fieldError(errors, `days.${di}.slots.${si}.${n}`);
  return `<div class="plan-slots"><p class="small"><strong>🗓 Termine</strong> <span class="muted">– optional; der nächste Termin erscheint in der Übersicht unter „Nächstes Training“.</span></p>
    ${day.slots.length ? "" : `<p class="muted small">Noch kein Termin.</p>`}
    ${day.slots
      .map(
        (s, si) => `<div class="plan-slot">
        <div class="field"><label>Wiederholung</label><select data-slot="${di}|${si}" data-pf="kind"><option value="weekday" ${s.kind === "weekday" ? "selected" : ""}>Jede Woche</option><option value="date" ${s.kind === "date" ? "selected" : ""}>An einem Datum</option></select></div>
        ${
          s.kind === "weekday"
            ? `<div class="field"><label>Wochentag</label><select data-slot="${di}|${si}" data-pf="weekday">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}" ${String(d) === s.weekday ? "selected" : ""}>${WEEKDAYS[d]}</option>`).join("")}</select>${err(si, "weekday")}</div>`
            : `<div class="field"><label>Datum</label><input type="date" value="${esc(s.date)}" data-slot="${di}|${si}" data-pf="date">${err(si, "date")}${err(si, "weekday")}</div>`
        }
        <div class="field"><label>Uhrzeit (optional)</label><input type="time" value="${esc(s.time)}" data-slot="${di}|${si}" data-pf="time">${err(si, "time")}</div>
        <button class="btn sm" data-act="plan-slot-remove" data-autosave-click data-arg="${di}|${si}" aria-label="Termin ${si + 1} entfernen">✕</button>
      </div>`,
      )
      .join("")}
    ${day.slots.length < D.planDraft.MAX_SLOTS ? `<button class="btn sm" data-act="plan-slot-add" data-autosave-click data-arg="${di}">+ Termin hinzufügen</button>` : ""}
  </div>`;
}

/** Übungen eines Trainingstags bearbeiten (am PC: Trainingseditor im Planmodus). */
export function planDayEditor(draft, di, errors) {
  const S = X.S;
  const day = draft.days[di];
  const cardio = isCardioCheck();
  const all = [...S.catalog.exercises, ...(S.localExercises ?? [])];
  const byId = new Map(all.map((e) => [e.id, e]));
  const machines = new Map(S.catalog.machines.map((m) => [m.id, m]));
  const e = (n) => fieldError(errors, `days.${di}.${n}`);
  const q = S.trainPlanQuery ?? "";
  return `<section class="card card--training"><h3>${esc(draft.name || "Plan")} – Übungen</h3>
    ${notice()}
    <div class="field"><label for="pday-name">Name des Trainingstags</label><input id="pday-name" type="text" maxlength="80" value="${esc(day.name)}" data-plan-day="${di}" data-pf="name">${e("name")}</div>
    <div class="field"><label for="pday-notes">Notiz (optional)</label><textarea id="pday-notes" rows="2" maxlength="1000" data-plan-day="${di}" data-pf="notes">${esc(day.notes)}</textarea></div>
    ${day.exercises
      .map((ex, ei) => {
        const exr = byId.get(ex.exerciseId);
        const m = exr?.machine_id ? machines.get(exr.machine_id) : null;
        const nr = m?.own_number || m?.gym_number || exr?.equipment || "";
        const isC = cardio(ex.exerciseId);
        const pe = (n) => fieldError(errors, `days.${di}.exercises.${ei}.${n}`);
        return `<div class="exercise-block">
          <div class="wo-head"><h4>${nr ? `<span class="num">${esc(nr)}</span> ` : ""}${esc(exr?.name ?? "Unbekannte Übung")}</h4></div>
          <div class="row-actions"><button class="btn sm" data-act="pday-ex-move" data-arg="${ei}|-1" ${ei === 0 ? "disabled" : ""}>↑</button><button class="btn sm" data-act="pday-ex-move" data-arg="${ei}|1" ${ei === day.exercises.length - 1 ? "disabled" : ""}>↓</button><button class="btn sm danger" data-act="pday-ex-remove" data-arg="${ei}">Entfernen</button></div>
          <table class="plan-sets"><thead><tr><th>Satz</th>${isC ? "<th>Dauer (min)</th><th>Strecke (km)</th>" : "<th>Wdh.</th><th>kg</th>"}<th>W</th><th></th></tr></thead><tbody>
          ${ex.sets
            .map(
              (s, si) => `<tr><td>${si + 1}</td>
              ${
                isC
                  ? `<td><input type="text" inputmode="decimal" value="${esc(s.duration)}" data-pset="${ei}|${si}" data-pf="duration"></td><td><input type="text" inputmode="decimal" value="${esc(s.distance)}" data-pset="${ei}|${si}" data-pf="distance"></td>`
                  : `<td><input type="text" inputmode="numeric" value="${esc(s.reps)}" data-pset="${ei}|${si}" data-pf="reps"></td><td><input type="text" inputmode="decimal" value="${esc(s.weightKg)}" data-pset="${ei}|${si}" data-pf="weightKg"></td>`
              }
              <td><input type="checkbox" ${s.isWarmup ? "checked" : ""} data-pset="${ei}|${si}" data-pf="isWarmup" aria-label="Aufwärmsatz"></td>
              <td><button class="btn sm" data-act="pday-set-remove" data-arg="${ei}|${si}" aria-label="Satz entfernen">✕</button></td></tr>
              ${Object.entries(errors).filter(([k]) => k.startsWith(`days.${di}.exercises.${ei}.sets.${si}.`)).map(([, v]) => `<tr><td colspan="5"><p class="field-error">${esc(v)}</p></td></tr>`).join("")}`,
            )
            .join("")}</tbody></table>
          <button class="btn sm" data-act="pday-set-add" data-arg="${ei}">+ Satz</button>
          <div class="field"><label>Pause (Sekunden)</label><input type="text" inputmode="numeric" value="${esc(ex.restSeconds)}" data-pex="${ei}" data-pf="restSeconds">${pe("restSeconds")}</div>
          <div class="field"><label>Notiz (optional)</label><input type="text" maxlength="500" value="${esc(ex.notes)}" data-pex="${ei}" data-pf="notes">${pe("notes")}</div>
        </div>`;
      })
      .join("")}
    <div class="field"><label for="pday-q">Übung hinzufügen</label><input id="pday-q" type="search" placeholder="Übung oder Maschine suchen, z. B. Beinpresse, 82, Latissimus …" value="${esc(q)}" data-tinput="planQuery" autocomplete="off"></div>
    <div id="pday-results">${planPickerResults(q)}</div>
    <div class="row-actions"><button class="btn primary" data-act="pday-done">Übernehmen</button></div>
  </section>`;
}

export function planPickerResults(q) {
  const S = X.S;
  const query = String(q ?? "").trim().toLowerCase();
  if (!query) return `<p class="muted small">Sucht in Übungen (Name, Muskelgruppe, Gerät) und Maschinen (Name, Hersteller, Nummer).</p>`;
  const exs = [...S.catalog.exercises, ...(S.localExercises ?? [])].filter((e) => !e.archived);
  const hit = (txt) => query.split(/\s+/).every((w) => txt.includes(w));
  const exHits = exs
    .filter((e) => hit(`${e.name} ${e.muscle_group ?? ""} ${e.equipment ?? ""}`.toLowerCase()))
    .slice(0, 12)
    .map((e) => `<button class="item" data-act="pday-ex-add" data-arg="${esc(e.id)}"><span class="main"><b>${esc(e.name)}</b><span class="muted small">${esc([e.muscle_group, e.equipment].filter(Boolean).join(" · ") || "Übung")}</span></span><span class="chev">+</span></button>`);
  const exact = (m) => [m.own_number, m.gym_number].some((n) => n && String(n).toLowerCase() === query);
  const mHits = S.catalog.machines
    .filter((m) => !m.archived && (exact(m) || hit(`${m.display_name ?? m.name} ${m.manufacturer ?? ""} ${m.own_number ?? ""} ${m.gym_number ?? ""}`.toLowerCase())))
    .sort((a, b) => Number(exact(b)) - Number(exact(a)))
    .slice(0, 12)
    .map((m) => `<button class="item" data-act="pday-machine-add" data-arg="${esc(m.id)}"><span class="main"><b>${esc(m.display_name ?? m.name)}</b><span class="muted small">${esc([m.manufacturer, m.own_number ? `Nr. ${m.own_number}` : "", m.gym_number ? `dasGym ${m.gym_number}` : ""].filter(Boolean).join(" · "))}</span></span><span class="chev">+</span></button>`);
  const all = [...exHits, ...mHits];
  return all.length ? `<div class="list">${all.join("")}</div>` : `<p class="muted small">Keine Treffer für „${esc(q)}“.</p>`;
}

/** Eingaben im Planeditor in den Entwurf übernehmen (vor jedem Neuaufbau). */
export function syncPlanInputs() {
  const d = X.S.trainPlanEdit;
  if (!d) return;
  for (const el of document.querySelectorAll("[data-plan]")) {
    const k = el.dataset.plan;
    d[k] = el.type === "checkbox" ? el.checked : el.value;
  }
  for (const el of document.querySelectorAll("[data-plan-day]")) d.days[+el.dataset.planDay][el.dataset.pf] = el.value;
  for (const el of document.querySelectorAll("[data-slot]")) {
    const [di, si] = el.dataset.slot.split("|").map(Number);
    const slot = d.days[di]?.slots[si];
    if (slot) slot[el.dataset.pf] = el.value;
  }
  const di = X.S.trainPlanDayIdx;
  if (di !== null && di !== undefined && d.days[di]) {
    const day = d.days[di];
    for (const el of document.querySelectorAll("[data-pex]")) {
      const ex = day.exercises[+el.dataset.pex];
      if (ex) ex[el.dataset.pf] = el.value;
    }
    for (const el of document.querySelectorAll("[data-pset]")) {
      const [ei, si] = el.dataset.pset.split("|").map(Number);
      const s = day.exercises[ei]?.sets[si];
      if (s) s[el.dataset.pf] = el.type === "checkbox" ? el.checked : el.value;
    }
  }
}

export function addPlanExercise(exerciseId) {
  const S = X.S;
  syncPlanInputs();
  const day = S.trainPlanEdit.days[S.trainPlanDayIdx];
  const ex = D.workoutDraft.emptyExercise(exerciseId);
  // Vorbelegung aus der letzten Einheit (wie im Trainingseditor)
  const last = S.catalog.last?.[exerciseId];
  if (last?.sets?.length) {
    ex.sets = last.sets.map((s) => ({ ...D.workoutDraft.emptySet(), reps: s.reps === null ? "" : String(s.reps), weightKg: s.weightKg === null ? "" : String(s.weightKg).replace(".", ","), isWarmup: !!s.isWarmup }));
    if (last.restSeconds) ex.restSeconds = String(last.restSeconds);
  }
  day.exercises.push(ex);
  S.trainPlanQuery = "";
  X.rerender();
}
