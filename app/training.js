// LIFESPAN OS Mobil – Training wie am PC (1.17.0): dieselben Reiter wie TrainingPage.tsx –
// Einheiten, Auswertung, Cardio, NEAT, Pläne, Datenbank, Check-Ins, Verlauf. Die Erfassung im
// Studio (Plan starten, freies Training, Sätze abhaken, Pausentimer) bleibt in app.js.
// Hier: Rahmen, „Einheiten“ (WorkoutsTab.tsx), „Pläne“ (PlansTab.tsx) und „NEAT“ (NeatTab.tsx).
// Auswertung, Verlauf, Cardio: trainingstats.js. Datenbank, Check-Ins: trainingdb.js.
// Daten: trainingdata.js (Änderungen am Handy, gehen mit „Körperwerte … senden“ an den PC).

import * as D from "./pcdomain.js";
import * as P from "./pcdb.js";
import * as O from "./pcoverview.js";
import * as TR from "./trainingdata.js";
import * as CD from "./checklistdata.js";
import { buildDb, today } from "./diary.js";
import { barTrendSvg, COLOR } from "./pcview.js";
import { energyHtml, stepGoalBar } from "./overview.js";
import { statsActions, viewCardioTab, viewProgressTab, viewReviewTab, statsChange } from "./trainingstats.js";
import { dbActions, dbChange, dbInput, viewCheckinsTab, viewDatabaseTab } from "./trainingdb.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice, saveTrain, startPlanDay, startFree, startBackfill, startCardio, openWorkout, C }

export function initTraining(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);
const fmtDate = (d) => D.formatDate(d);

export const TRAINING_TABS = [
  ["workouts", "Einheiten"],
  ["review", "Auswertung"],
  ["cardio", "Cardio"],
  ["neat", "NEAT – Non-Exercise Activity"],
  ["plans", "Pläne"],
  ["exercises", "Datenbank"],
  ["checkins", "Check-Ins"],
  ["progress", "Verlauf"],
];

const KIND_LABELS = { rest: "Restday", sick: "Krankheit" };

/** Meldung oben im Reiter (wie FormMessage am PC). */
export function notice() {
  const n = X.S.trainNotice;
  return n ? `<p class="${n.tone === "error" ? "warn" : "ok-note"}" role="status">${esc(n.text)}</p>` : "";
}

export function setNotice(tone, text) {
  X.S.trainNotice = text ? { tone, text } : null;
}

export async function persistTrain() {
  try {
    await X.store.set("train", X.S.train);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
  X.refreshCatalog();
}

/** Fehler einer Speicherfunktion: Feldfehler merken (für die Markierung) und Meldung zeigen. */
export function failed(e, key = "trainErrors") {
  X.S[key] = e?.field ? { [e.field]: e.message } : {};
  setNotice("error", e?.message ?? String(e));
}

export const fieldError = (errors, name) => (errors?.[name] ? `<p class="field-error">${esc(errors[name])}</p>` : "");

// ------------------------------------------------------------------ Rahmen

export function viewTrainingSection() {
  const S = X.S;
  const tab = S.trainTab ?? "workouts";
  const views = {
    review: viewReviewTab,
    cardio: viewCardioTab,
    neat: neatTab,
    plans: plansTab,
    exercises: viewDatabaseTab,
    checkins: viewCheckinsTab,
    progress: viewProgressTab,
  };
  let body;
  try {
    body = (views[tab] ?? workoutsTab)();
  } catch (e) {
    console.error(e);
    body = `<section class="card"><p class="warn">Dieser Reiter konnte nicht berechnet werden: ${esc(e.message)}</p></section>`;
  }
  const pending = TR.unsentTrain(S.train);
  return `${X.header("Training")}<main class="wrap">
    <nav class="tabs" aria-label="Training">${TRAINING_TABS.map(
      ([v, l]) => `<button class="tab ${v === tab ? "active" : ""}" data-act="train-tab" data-arg="${v}" ${v === tab ? 'aria-current="page"' : ""}>${esc(l)}</button>`,
    ).join("")}</nav>
    ${pending ? `<p class="muted small">${pending} ${pending === 1 ? "Änderung" : "Änderungen"} im Training noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    ${body}
  </main>`;
}

// ------------------------------------------------------------------ Einheiten (WorkoutsTab.tsx)

/** Restdays in Folge bis einschließlich `date` (wie `day_status::get`). */
export function restStreak(statuses, date) {
  const byDate = new Map(statuses.map((s) => [s.date, s.kind]));
  let n = 0;
  let d = date;
  while (byDate.get(d) === "rest") {
    n += 1;
    d = P.addDays(d, -1);
  }
  return n;
}

function workoutsTab() {
  const S = X.S;
  const db = buildDb();
  const day0 = today();
  const statuses = CD.dayStatusOf(S.catalog, S.checklists, "2000-01-01", "2099-12-31");
  const todayStatus = statuses.find((s) => s.date === day0) ?? null;
  const streak = restStreak(statuses, day0);
  const summaries = db.workouts.map((w) => O.workoutSummary(db, w));
  const rows = D.checkin.trainingRows(summaries, statuses);
  const finished = summaries.filter((w) => w.status === "done");
  const weeks = D.workoutDraft.weeklyTotals(finished, day0, 8);
  const plans = S.catalog.plans ?? [];
  const dayOptions = plans.flatMap((p) => p.days.map((d) => ({ value: d.row.id, label: `${p.row.name} – ${d.row.name}` })));
  const a = S.active;
  const blocked = Boolean(a);
  const exercises = O.exercisesOf(db).map((e) => ({ ...e, archived: Boolean(db.exercises.get(e.id)?.archived), usageCount: S.catalog.usage?.[e.id] ?? 0 }));
  const cardioOptions = D.workoutDraft.cardioChoices(
    [...db.exercises.values()]
      .filter((e) => (e.category ?? "strength") === "cardio")
      .map((e) => ({ id: e.id, name: e.name, category: "cardio", archived: Boolean(e.archived), usageCount: S.catalog.usage?.[e.id] ?? 0 })),
  );
  void exercises;
  const planSel = S.trainPlanDay && dayOptions.some((o) => o.value === S.trainPlanDay) ? S.trainPlanDay : "";
  const cardioSel = S.trainCardio && cardioOptions.some((o) => o.id === S.trainCardio) ? S.trainCardio : "";
  const actions = `<div class="workouts-actions">
      ${
        dayOptions.length
          ? `<div class="field"><label for="w-from-plan">Trainingstag aus Plan</label>
          <select id="w-from-plan" data-tchange="planDay" ${blocked ? "disabled" : ""}><option value="">Trainingstag wählen …</option>${dayOptions
            .map((o) => `<option value="${esc(o.value)}" ${o.value === planSel ? "selected" : ""}>${esc(o.label)}</option>`)
            .join("")}</select></div>
          <button class="btn" data-act="train-start-day" ${!planSel || blocked ? "disabled" : ""}>▶ Tag starten</button>`
          : ""
      }
      <div class="row-actions">
        <button class="btn primary" data-act="start-free" ${blocked ? "disabled" : ""}>▶ Training starten</button>
        <button class="btn" data-act="train-backfill" ${blocked ? "disabled" : ""}>Nachtragen</button>
        <button class="btn ${todayStatus?.kind === "rest" ? "primary" : ""}" data-act="train-day" data-arg="${todayStatus?.kind === "rest" ? "" : "rest"}" aria-pressed="${todayStatus?.kind === "rest"}" title="Heute kein Training – Regeneration">🛏 Restday</button>
        <button class="btn ${todayStatus?.kind === "sick" ? "primary" : ""}" data-act="train-day" data-arg="${todayStatus?.kind === "sick" ? "" : "sick"}" aria-pressed="${todayStatus?.kind === "sick"}" title="Heute kein Training wegen Krankheit">🌡 Krankheit</button>
      </div>
      ${
        cardioOptions.length
          ? `<div class="field"><label for="w-cardio">Cardio erfassen</label>
          <select id="w-cardio" data-tchange="cardio" ${blocked ? "disabled" : ""}><option value="">wählen …</option>${cardioOptions
            .map((e) => `<option value="${esc(e.id)}" ${e.id === cardioSel ? "selected" : ""}>${esc(e.name)}</option>`)
            .join("")}</select></div>
          <button class="btn" data-act="train-cardio" ${!cardioSel || blocked ? "disabled" : ""}>Cardio erfassen</button>`
          : ""
      }
    </div>`;
  const banner = todayStatus
    ? `<div class="day-status-banner day-status-banner--${todayStatus.kind}" role="status"><span><strong>Heute: ${KIND_LABELS[todayStatus.kind]}</strong>${
        todayStatus.kind === "rest" ? ` – kein Training, Regeneration${streak > 1 ? ` · ${streak}. Restday in Folge` : ""}` : " – kein Training wegen Krankheit"
      }</span> <button class="linkbtn" data-act="train-day" data-arg="">Rückgängig</button></div>`
    : "";
  const activeBanner = a
    ? `<div class="active-banner" role="status"><span><strong>${a.editOf ? "Bearbeitung" : "Training läuft"}:</strong> ${esc(a.title)}${a.startTime && !a.editOf ? ` · seit ${esc(a.startTime)} Uhr` : ""} · ${a.exercises.length} ${a.exercises.length === 1 ? "Übung" : "Übungen"}</span>
        <button class="btn sm primary" data-go="workout">${a.editOf ? "Weiter bearbeiten" : "Fortsetzen"}</button></div>`
    : "";
  const list = rows.length
    ? `<ul class="train-list">${rows
        .map((row) => {
          if (row.kind === "day") {
            const s = row.status;
            return `<li class="train-row train-row--day"><span class="train-row__date">${fmtDate(s.date)}</span>
              <span class="train-row__main"><span class="day-pill day-pill--${s.kind}">${s.kind === "rest" ? "🛏" : "🌡"} ${KIND_LABELS[s.kind]}</span>
              <span class="muted small">${s.kind === "rest" ? "kein Training – Regeneration" : "kein Training wegen Krankheit"}</span></span>
              <button class="linkbtn" data-act="train-day-clear" data-arg="${esc(s.date)}">Entfernen</button></li>`;
          }
          const w = row.workout;
          return `<li class="train-row"><span class="train-row__date">${fmtDate(w.date)}${w.startTime ? `<span class="muted small">${esc(w.startTime)} Uhr</span>` : ""}</span>
            <span class="train-row__main"><strong>${esc(w.title)}</strong>${w.status === "active" ? ' <span class="status-pill status-pill--active">läuft</span>' : ""}
              <span class="muted small">${w.exerciseCount} ${w.exerciseCount === 1 ? "Übung" : "Übungen"} · ${w.setCount} Arbeitssätze · ${w.volumeKg > 0 ? `${F(w.volumeKg)} kg` : "–"} · ${w.durationMin !== null ? `${w.durationMin} min` : "–"}</span></span>
            <button class="linkbtn" data-act="train-open" data-arg="${esc(w.id)}">Öffnen</button></li>`;
        })
        .join("")}</ul>`
    : `<div class="empty-state"><p><strong>Noch keine Einheiten</strong></p><p class="muted small">Starte dein erstes Training mit „Training starten“${dayOptions.length ? ", starte einen Trainingstag aus deinem Plan" : ""} oder trage eine frühere Einheit mit „Nachtragen“ ein.</p></div>`;
  const volume = finished.length
    ? `<section class="card card--training"><div class="wo-head"><h3 id="volume-title">Trainingsvolumen je Woche</h3><span class="tag">letzte 8 Wochen</span></div>
        ${barTrendSvg(weeks, { color: COLOR.training, format: (v) => `${F(v)} kg`, label: "Trainingsvolumen je Woche der letzten 8 Wochen" })}
        <p class="muted small">Volumen = Wiederholungen × Gewicht in kg aller Arbeitssätze abgeschlossener Einheiten (ohne Aufwärmsätze; Sätze ohne Zusatzgewicht zählen 0 kg). Die Beschriftung zeigt den Montag der Woche.</p></section>`
    : "";
  return `<section class="card card--training" id="workouts-title">
      <h3>Trainingseinheiten</h3>
      ${actions}
      ${banner}
      ${activeBanner}
      ${notice()}
      ${S.trainAdopt ? adoptOffer() : ""}
      ${list}
    </section>
    ${S.trainDialog ? `<section class="card dialog-card" role="alertdialog"><h3>${esc(S.trainDialog.title)}</h3><p class="small">${esc(S.trainDialog.message)}</p><button class="btn block" data-act="train-dialog-close">Verstanden</button></section>` : ""}
    ${volume}`;
}

function adoptOffer() {
  const a = X.S.trainAdopt;
  return `<div class="adopt-offer" role="group" aria-label="Richtwerte übernehmen"><span class="small">Sätze, Gewichte und Einstellungen von „${esc(a.title)}“ als neue Richtwerte in den Trainingstag übernehmen? Beim nächsten Start sind die Sätze damit vorbelegt.</span>
    <div class="row-actions"><button class="btn sm primary" data-act="train-adopt">In den Plan übernehmen</button><button class="btn sm" data-act="train-adopt-no">Nein danke</button></div></div>`;
}

/** Restday/Krankheit für einen Tag setzen oder entfernen, mit den Meldungen wie am PC. */
async function applyDay(date, kind) {
  const S = X.S;
  CD.setDayStatus(S.catalog, S.checklists, date, kind || null, { uuid: X.uuid, now: new Date() });
  await X.store.set("checklists", S.checklists);
  const statuses = CD.dayStatusOf(S.catalog, S.checklists, "2000-01-01", "2099-12-31");
  const streak = restStreak(statuses, date);
  if (kind === "sick") S.trainDialog = { title: "Krankheitstag eingetragen", message: D.checkin.SICK_MESSAGE };
  else if (kind === "rest" && streak > D.checkin.REST_LIMIT) S.trainDialog = { title: `${streak}. Restday in Folge`, message: D.checkin.REST_MESSAGE };
  const isToday = date === today();
  const day = isToday ? "heute" : `den ${fmtDate(date)}`;
  const st = streak > 1 ? ` (${streak}. in Folge)` : "";
  setNotice(
    "ok",
    !kind ? `Angabe für ${day} entfernt.` : kind === "rest" ? (isToday ? `Heute ist Restday – Regeneration${st}.` : `${fmtDate(date)} als Restday eingetragen${st}.`) : `${isToday ? "Heute" : fmtDate(date)} als Krankheitstag eingetragen.`,
  );
}

/**
 * Richtwerte aus einer abgeschlossenen Einheit in ihren Trainingstag übernehmen wie
 * `plan::adopt_workout`: je Übung in der Reihenfolge des Plans; Übungen ohne Gegenstück bleiben.
 */
function adoptWorkout(w) {
  const S = X.S;
  const raw = S.catalogRaw;
  const plans = TR.plansOf(raw, S.train, S.catalog.exercises);
  for (const p of plans) {
    const day = p.days.find((d) => d.id === w.planDayId);
    if (!day) continue;
    const used = new Set();
    let updated = 0;
    const notInPlan = [];
    const exName = (id) => S.catalog.exercises.find((e) => e.id === id)?.name ?? "Übung";
    const nextFor = (exerciseId) => day.exercises.findIndex((e, i) => !used.has(i) && e.exerciseId === exerciseId);
    for (const we of w.exercises) {
      const i = nextFor(we.exerciseId);
      if (i < 0) {
        notInPlan.push(exName(we.exerciseId));
        continue;
      }
      used.add(i);
      const pe = day.exercises[i];
      pe.restSeconds = we.restSeconds ?? pe.restSeconds;
      pe.settings = { ...(pe.settings ?? {}), ...Object.fromEntries(Object.entries(we.settings ?? {}).map(([k, v]) => [k, v ?? null])) };
      pe.sets = we.sets.map((s) => ({
        reps: s.reps ?? null,
        weightKg: s.weightKg ?? null,
        durationSeconds: s.durationSeconds ?? null,
        distanceM: s.distanceM ?? null,
        rpe: s.rpe ?? null,
        isWarmup: !!s.isWarmup,
        isUnilateral: !!s.isUnilateral,
        ...X.C.profileWeights(s.rp),
      }));
      pe.targetSets = pe.sets.length || null;
      pe.targetRepsMin = null;
      pe.targetRepsMax = null;
      pe.targetWeightKg = null;
      updated += 1;
    }
    if (updated > 0) {
      TR.savePlan(raw, S.train, { ...p, days: p.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e })) })) }, { uuid: X.uuid, now: new Date(), exercises: S.catalog.exercises });
    }
    return { planName: p.name, dayName: day.name, updated, notInPlan };
  }
  throw new Error("Der Trainingstag dieser Einheit ist nicht mehr im Plan.");
}

// ------------------------------------------------------------------ NEAT (NeatTab.tsx)

const HISTORY_DAYS = 14;

function neatTab() {
  const S = X.S;
  const day0 = today();
  const date = S.trainNeatDate ?? day0;
  const db = buildDb();
  const row = db.neatByDate.get(date) ?? null;
  const goal = P.goalFor(db, date)?.steps ?? null;
  const step = P.stepEnergy(db, date);
  const errors = S.trainErrors ?? {};
  const v = (k) => (row ? row[k] : null);
  const draft = S.trainNeatDraft?.date === date ? S.trainNeatDraft : null;
  const val = (key, col) => (draft ? draft[key] ?? "" : v(col) ?? "");
  const stepsNow = Number.parseInt(String(val("steps", "steps")).replace(/\./g, ""), 10);
  const kcalNow = Number.isFinite(stepsNow) && step.weightKg !== null ? D.neat.stepKcal(stepsNow, step.weightKg) : null;
  const weightNote =
    step.weightKg === null
      ? "Noch kein Gewicht erfasst – ohne Gewicht keine Berechnung."
      : `${F(step.weightKg, 1)} kg × 0,00040 je Schritt · Gewicht ${step.weighedOnDate ? "vom selben Tag" : `vom ${fmtDate(step.weightDate ?? "")} (zuletzt eingetragen)`}`;
  const minutesNow = TR.MINUTE_FIELDS.reduce((a, [k, c]) => a + (Number.parseInt(val(k, c), 10) || 0), 0);
  const askToWeigh = date === day0 && !step.weighedOnDate && !(S.trainWeighDismissed ?? []).includes(date);
  const history = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const d = P.addDays(day0, -i);
    const r = db.neatByDate.get(d);
    if (r) history.push(TR.neatDayOf(r));
  }
  let energy = null;
  try {
    energy = P.energyFor(db, date);
  } catch {
    energy = null;
  }
  const field = (id, label, key, col, extra = "") =>
    `<div class="field"><label for="neat-${id}">${esc(label)}</label><div class="input-unit"><input id="neat-${id}" type="text" inputmode="numeric" data-neat="${key}" value="${esc(val(key, col))}" ${extra}><span class="unit">${key === "steps" ? "Schritte" : "min"}</span></div>${fieldError(errors, key)}</div>`;
  return `<div class="date-nav"><button class="btn sm" data-act="train-neat-day" data-arg="-1" aria-label="Vorheriger Tag">‹</button>
      <input type="date" id="neat-date" value="${esc(date)}" max="${esc(day0)}" data-tchange="neatDate">
      <button class="btn sm" data-act="train-neat-day" data-arg="1" ${date >= day0 ? "disabled" : ""} aria-label="Nächster Tag">›</button></div>
    ${notice()}
    ${
      askToWeigh
        ? `<section class="card dialog-card" role="alertdialog"><h3>Bitte heute noch wiegen</h3><p class="small">Für den Kalorienverbrauch durch Schritte wird dein heutiges Gewicht genutzt. Du hast dich heute noch nicht gewogen – trage dein Gewicht unter Body &amp; Longevity ein, um möglichst genaue Werte zu erhalten.</p>
          <p class="muted small">${step.weightKg !== null && step.weightDate ? `Bis dahin wird dein zuletzt eingetragenes Gewicht verwendet: ${F(step.weightKg, 1)} kg vom ${fmtDate(step.weightDate)}.` : "Es ist noch kein Gewicht erfasst – ohne Gewicht kann der Kalorienverbrauch nicht berechnet werden."}</p>
          <div class="row-actions"><button class="btn sm primary" data-act="menu-go" data-arg="body">Gewicht erfassen</button><button class="btn sm" data-act="train-weigh-ok" data-arg="${esc(date)}">Verstanden</button></div></section>`
        : ""
    }
    <section class="card card--training" id="neat-title">
      <div class="wo-head"><h3>Alltagsbewegung am ${fmtDate(date)}</h3><span class="tag">Non-Exercise Activity (NEAT)</span></div>
      <p class="muted small">Jede Bewegung, die kein geplantes Training ist. Gehen in Schritten, alles andere in Minuten. Leere Felder gelten als nicht erfasst.</p>
      <fieldset class="fast-group"><legend>Gehen</legend>
        ${field("steps", "Schritte am Tag", "steps", "steps")}
        <p class="muted small">Gesamtzahl des Tages, z. B. vom Handy oder der Uhr</p>
        <div class="field"><label>Kalorienverbrauch/Schritte</label><div class="input-unit"><input id="neat-kcal" type="text" value="${kcalNow !== null ? F(kcalNow) : "–"}" disabled><span class="unit">kcal</span></div><p class="muted small">${esc(weightNote)}</p></div>
        ${step.weightKg !== null && !step.weighedOnDate ? `<p class="warn small">An diesem Tag ist kein Gewicht eingetragen. Für genaue Werte bitte unter Body &amp; Longevity wiegen – bis dahin gilt ${F(step.weightKg, 1)} kg vom ${fmtDate(step.weightDate ?? "")}.</p>` : ""}
        <div id="neat-goal">${stepGoalBar(Number.isFinite(stepsNow) ? stepsNow : null, goal)}</div>
      </fieldset>
      <fieldset class="fast-group"><legend>Weitere Alltagsbewegung (Minuten)</legend>
        ${TR.MINUTE_FIELDS.map(([k, c, label]) => field(k, label, k, c)).join("")}
        <div class="field"><label for="neat-other-label">Sonstiges – was?</label><input id="neat-other-label" type="text" maxlength="80" placeholder="z. B. Einkaufen, Treppen" data-neat="otherLabel" value="${esc(val("otherLabel", "other_label"))}">${fieldError(errors, "otherLabel")}</div>
        <p class="sum-line" id="neat-sum">${minutesNow > 0 ? `Zusammen: ${esc(D.formatDuration(minutesNow))}` : ""}</p>
      </fieldset>
      <div class="field"><label for="neat-notes">Notizen (optional)</label><textarea id="neat-notes" rows="2" maxlength="1000" data-neat="notes">${esc(val("notes", "notes"))}</textarea>${fieldError(errors, "notes")}</div>
      <div class="row-actions"><button class="btn primary" data-act="train-neat-save">Speichern</button>${row ? `<button class="btn danger" data-act="train-neat-delete">Eintrag löschen</button>` : ""}</div>
    </section>
    ${
      energy
        ? `<section class="card card--training"><div class="wo-head"><h3>Energieverbrauch am ${fmtDate(date)}</h3><span class="tag">Grundumsatz, NEAT, Training und PAL</span></div>${energyHtml(energy)}</section>`
        : ""
    }
    <section class="card card--training"><h3>Letzte ${HISTORY_DAYS} Tage</h3>
      ${
        history.length
          ? `<ul class="train-list">${history
              .map((d) => {
                const p = D.neat.stepProgress(d.steps, P.goalFor(db, d.date)?.steps ?? null);
                const acts = D.neat.minuteRows(d).map((r) => r.label).join(", ");
                return `<li class="train-row ${d.date === date ? "is-selected" : ""}"><span class="train-row__date">${fmtDate(d.date)}</span>
                  <span class="train-row__main"><strong>${d.steps !== null ? `${F(d.steps)} Schritte` : "– Schritte"}</strong>${p.percent !== null && d.steps !== null ? ` <span class="muted small">${Math.round(p.percent)} % vom Ziel</span>` : ""}
                  <span class="muted small">${d.totalMin > 0 ? esc(D.formatDuration(d.totalMin)) : "–"}${acts ? ` · ${esc(acts)}` : ""}</span></span>
                  <button class="linkbtn" data-act="train-neat-pick" data-arg="${esc(d.date)}">Bearbeiten</button></li>`;
              })
              .join("")}</ul>`
          : `<div class="empty-state"><p><strong>Noch keine Alltagsbewegung erfasst</strong></p><p class="muted small">Trage oben deine Schritte und Minuten für heute ein.</p></div>`
      }
    </section>`;
}

function updateNeatLive() {
  const S = X.S;
  const d = S.trainNeatDraft;
  const date = d.date;
  const db = buildDb();
  const step = P.stepEnergy(db, date);
  const steps = Number.parseInt(String(d.steps ?? "").replace(/\./g, ""), 10);
  const kcal = Number.isFinite(steps) && step.weightKg !== null ? D.neat.stepKcal(steps, step.weightKg) : null;
  const kEl = document.getElementById("neat-kcal");
  if (kEl) kEl.value = kcal !== null ? F(kcal) : "–";
  const g = document.getElementById("neat-goal");
  if (g) g.innerHTML = stepGoalBar(Number.isFinite(steps) ? steps : null, P.goalFor(db, date)?.steps ?? null);
  const min = TR.MINUTE_FIELDS.reduce((a, [k]) => a + (Number.parseInt(d[k] ?? "", 10) || 0), 0);
  const sEl = document.getElementById("neat-sum");
  if (sEl) sEl.textContent = min > 0 ? `Zusammen: ${D.formatDuration(min)}` : "";
}

function neatDraftNow() {
  const S = X.S;
  const date = S.trainNeatDate ?? today();
  const d = { date };
  for (const el of document.querySelectorAll("[data-neat]")) d[el.dataset.neat] = el.value;
  return d;
}

// ------------------------------------------------------------------ Pläne (PlansTab.tsx)

const WEEKDAYS = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function isCardioCheck() {
  const ids = new Set(X.S.catalog.exercises.filter((e) => (e.category ?? "strength") === "cardio").map((e) => e.id));
  return (id) => ids.has(id);
}

function plansHaveData() {
  return TR.hasTable(X.S.catalogRaw, "training_plan");
}

function plansTab() {
  const S = X.S;
  if (!plansHaveData()) {
    return `<section class="card"><p class="warn">Für die Pläne wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Settings „Neue Exportdatei laden“.</p></section>`;
  }
  if (S.trainPlanEdit) return planEditor();
  const plans = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises);
  const cardio = isCardioCheck();
  return `<div class="toolbar"><p class="muted small">Pläne legen Trainingstage mit Übungen und Sätzen fest – auch Cardiopläne. Aus einem Tag startest du ein Training; die Sätze sind dann mit den Richtwerten vorbelegt. Termine (Wochentag oder Datum mit Uhrzeit) zeigen in der Übersicht das nächste Training.</p>
      <button class="btn primary" data-act="plan-new">Neuer Plan</button></div>
    ${notice()}
    ${plans.length ? "" : `<section class="card card--training"><div class="empty-state"><p><strong>Noch keine Trainingspläne</strong></p><p class="muted small">Ein Plan ist optional. Einheiten kannst du auch ohne Plan erfassen.</p></div></section>`}
    ${plans
      .map(
        (plan) => `<section class="card card--training">
        <div class="wo-head"><h3>📅 ${esc(plan.name)} ${plan.archived ? '<span class="pill">Archiviert</span>' : ""}</h3></div>
        <div class="row-actions"><button class="linkbtn" data-act="plan-edit" data-arg="${esc(plan.id)}">Bearbeiten</button>
          <button class="linkbtn" data-act="plan-copy" data-arg="${esc(plan.id)}">Kopieren</button>
          <button class="linkbtn danger" data-act="plan-delete" data-arg="${esc(plan.id)}">Löschen</button></div>
        ${plan.description ? `<p class="muted small">${esc(plan.description)}</p>` : ""}
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

const describeSlot = (s) => D.planSchedule.describeSlot(s);

function planEditor() {
  const S = X.S;
  const draft = S.trainPlanEdit;
  const errors = S.trainErrors ?? {};
  if (S.trainPlanDayIdx !== null && S.trainPlanDayIdx !== undefined && draft.days[S.trainPlanDayIdx]) return planDayEditor(draft, S.trainPlanDayIdx, errors);
  const byId = new Map(S.catalog.exercises.map((e) => [e.id, e]));
  for (const e of S.localExercises ?? []) byId.set(e.id, e);
  return `<section class="card card--training"><h3>${draft.id ? "Plan bearbeiten" : "Neuer Plan"}</h3>
    ${notice()}
    <div class="field"><label for="plan-name">Name</label><input id="plan-name" type="text" maxlength="80" placeholder="z. B. Push/Pull/Beine oder Cardio" value="${esc(draft.name)}" data-plan="name">${fieldError(errors, "name")}</div>
    <label class="toggle"><input type="checkbox" data-plan="archived" ${draft.archived ? "checked" : ""}> Archiviert</label>
    <div class="field"><label for="plan-description">Beschreibung (optional)</label><textarea id="plan-description" rows="2" maxlength="2000" data-plan="description">${esc(draft.description)}</textarea>${fieldError(errors, "description")}</div>
    <h4>Trainingstage</h4>
    <p class="muted small">Übungen fügst du wie in einem normalen Training hinzu (Sätze, Pause, Notiz). Für einen Cardioplan wählst du Cardio-Übungen wie Laufband oder Rad.</p>
    ${fieldError(errors, "days")}
    ${draft.days
      .map((day, di) => {
        const exErr = Object.keys(errors).some((k) => k.startsWith(`days.${di}.exercises`));
        return `<div class="exercise-block">
          <div class="field"><label for="plan-day-${di}">Tag ${di + 1}</label><input id="plan-day-${di}" type="text" maxlength="80" value="${esc(day.name)}" data-plan-day="${di}" data-pf="name">${fieldError(errors, `days.${di}.name`)}</div>
          <div class="row-actions"><button class="btn sm" data-act="plan-day-move" data-arg="${di}|-1" ${di === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button>
            <button class="btn sm" data-act="plan-day-move" data-arg="${di}|1" ${di === draft.days.length - 1 ? "disabled" : ""} aria-label="Nach unten">↓</button>
            <button class="btn sm danger" data-act="plan-day-remove" data-arg="${di}" aria-label="Tag entfernen">✕ Tag entfernen</button></div>
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
    <button class="btn" data-act="plan-day-add">+ Trainingstag hinzufügen</button>
    <div class="row-actions"><button class="btn primary" data-act="plan-save">Speichern</button><button class="btn" data-act="plan-cancel">Abbrechen</button></div>
  </section>`;
}

function slotEditor(day, di, errors) {
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
        <button class="btn sm" data-act="plan-slot-remove" data-arg="${di}|${si}" aria-label="Termin ${si + 1} entfernen">✕</button>
      </div>`,
      )
      .join("")}
    ${day.slots.length < D.planDraft.MAX_SLOTS ? `<button class="btn sm" data-act="plan-slot-add" data-arg="${di}">+ Termin hinzufügen</button>` : ""}
  </div>`;
}

/** Übungen eines Trainingstags bearbeiten (am PC: Trainingseditor im Planmodus). */
function planDayEditor(draft, di, errors) {
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
function syncPlanInputs() {
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

function addPlanExercise(exerciseId) {
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

// ------------------------------------------------------------------ Aktionen

export const trainingActions = {
  ...statsActions,
  ...dbActions,
  "train-tab": (el) => {
    const S = X.S;
    syncPlanInputs();
    S.trainTab = el.dataset.arg;
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
  },
  "train-start-day": () => X.startPlanDay(X.S.trainPlanDay),
  "train-start-plan-day": (el) => X.startPlanDay(el.dataset.arg),
  "train-backfill": () => X.startBackfill(today()),
  "train-cardio": () => X.startCardio(X.S.trainCardio),
  "train-open": (el) => X.openWorkout(el.dataset.arg),
  "train-day": async (el) => {
    try {
      await applyDay(today(), el.dataset.arg || null);
    } catch (e) {
      setNotice("error", e.message);
    }
    X.rerender();
  },
  "train-day-clear": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: entfernen")) return;
    try {
      await applyDay(el.dataset.arg, null);
    } catch (e) {
      setNotice("error", e.message);
    }
    X.rerender();
  },
  "train-dialog-close": () => {
    X.S.trainDialog = null;
    X.rerender();
  },
  "train-adopt": async () => {
    const S = X.S;
    const w = S.workouts.find((x) => x.id === S.trainAdopt?.id);
    try {
      if (!w) throw new Error("Die Einheit gibt es nicht mehr.");
      const r = adoptWorkout(w);
      await persistTrain();
      setNotice(
        "ok",
        r.updated > 0
          ? `Plan „${r.planName}“, Tag „${r.dayName}“: ${r.updated} ${r.updated === 1 ? "Übung hat" : "Übungen haben"} neue Richtwerte.${r.notInPlan.length ? ` Nicht im Plan (unverändert): ${r.notInPlan.join(", ")}.` : ""}`
          : "Keine Übung dieser Einheit steht im Trainingstag – der Plan bleibt unverändert.",
      );
      S.trainAdopt = null;
    } catch (e) {
      setNotice("error", e.message);
    }
    X.rerender();
  },
  "train-adopt-no": () => {
    X.S.trainAdopt = null;
    X.rerender();
  },
  // NEAT
  "train-neat-day": (el) => {
    const S = X.S;
    const d = P.addDays(S.trainNeatDate ?? today(), Number(el.dataset.arg));
    if (d > today()) return;
    S.trainNeatDate = d;
    S.trainNeatDraft = null;
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
  },
  "train-neat-pick": (el) => {
    const S = X.S;
    S.trainNeatDate = el.dataset.arg;
    S.trainNeatDraft = null;
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
    requestAnimationFrame(() => document.getElementById("neat-title")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "train-weigh-ok": (el) => {
    const S = X.S;
    S.trainWeighDismissed = [...(S.trainWeighDismissed ?? []), el.dataset.arg];
    X.rerender();
  },
  "train-neat-save": async () => {
    const S = X.S;
    const d = neatDraftNow();
    S.trainNeatDraft = d;
    const r = D.neat.neatDraftToInput({
      date: d.date,
      exists: false,
      steps: d.steps ?? "",
      minutes: Object.fromEntries(TR.MINUTE_FIELDS.map(([k]) => [k, d[k] ?? ""])),
      otherLabel: d.otherLabel ?? "",
      notes: d.notes ?? "",
    });
    if (!r.ok) {
      S.trainErrors = r.errors;
      setNotice("error", "Bitte die markierten Felder prüfen.");
      return X.rerender();
    }
    try {
      TR.saveNeat(S.catalogRaw, S.train, r.input, { uuid: X.uuid, now: new Date() });
      await persistTrain();
      S.trainErrors = {};
      S.trainNeatDraft = null;
      setNotice("ok", `Alltagsbewegung für ${fmtDate(d.date)} gespeichert.`);
    } catch (e) {
      failed(e);
    }
    X.rerender();
  },
  "train-neat-delete": async (el) => {
    const S = X.S;
    if (!X.confirmTwice(el, "Nochmal tippen: Alltagsbewegung dieses Tages löschen")) return;
    const date = S.trainNeatDate ?? today();
    TR.deleteNeat(S.catalogRaw, S.train, date, new Date());
    await persistTrain();
    S.trainNeatDraft = null;
    setNotice("ok", `Eintrag für ${fmtDate(date)} gelöscht.`);
    X.rerender();
  },
  // Pläne
  "plan-new": () => {
    const S = X.S;
    S.trainPlanEdit = D.planDraft.emptyPlanDraft();
    S.trainPlanDayIdx = null;
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
  },
  "plan-edit": (el) => {
    const S = X.S;
    const plan = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises).find((p) => p.id === el.dataset.arg);
    if (!plan) return;
    S.trainPlanEdit = D.planDraft.planToDraft(plan, isCardioCheck());
    S.trainPlanDayIdx = null;
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
    window.scrollTo(0, 0);
  },
  "plan-copy": async (el) => {
    const S = X.S;
    const plan = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises).find((p) => p.id === el.dataset.arg);
    if (!plan) return;
    try {
      const id = TR.copyPlan(S.catalogRaw, S.train, plan, { uuid: X.uuid, now: new Date(), exercises: [...S.catalog.exercises, ...(S.localExercises ?? [])] });
      await persistTrain();
      const copy = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises).find((p) => p.id === id);
      setNotice("ok", `Kopie „${copy?.name ?? ""}“ angelegt. Du kannst sie jetzt unabhängig vom Original bearbeiten.`);
      if (copy) S.trainPlanEdit = D.planDraft.planToDraft(copy, isCardioCheck());
      S.trainPlanDayIdx = null;
    } catch (e) {
      setNotice("error", e.message);
    }
    X.rerender();
  },
  "plan-delete": async (el) => {
    const S = X.S;
    const plan = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises).find((p) => p.id === el.dataset.arg);
    if (!plan || !X.confirmTwice(el, `Nochmal tippen: Plan „${plan.name}“ löschen`)) return;
    TR.deletePlan(S.catalogRaw, S.train, plan.id, new Date());
    await persistTrain();
    setNotice("ok", `Plan „${plan.name}“ gelöscht. Durchgeführte Einheiten bleiben erhalten.`);
    X.rerender();
  },
  "plan-cancel": () => {
    const S = X.S;
    S.trainPlanEdit = null;
    S.trainPlanDayIdx = null;
    S.trainErrors = {};
    S.trainNotice = null;
    X.rerender();
  },
  "plan-day-add": () => {
    const S = X.S;
    syncPlanInputs();
    const d = S.trainPlanEdit;
    d.days.push(D.planDraft.emptyPlanDay(`Tag ${String.fromCharCode(65 + d.days.length)}`));
    X.rerender();
  },
  "plan-day-move": (el) => {
    const S = X.S;
    syncPlanInputs();
    const [i, dir] = el.dataset.arg.split("|").map(Number);
    S.trainPlanEdit.days = D.planDraft.move(S.trainPlanEdit.days, i, dir);
    X.rerender();
  },
  "plan-day-remove": (el) => {
    const S = X.S;
    syncPlanInputs();
    if (!X.confirmTwice(el, "Nochmal tippen: Tag entfernen")) return;
    S.trainPlanEdit.days = S.trainPlanEdit.days.filter((_, i) => i !== Number(el.dataset.arg));
    X.rerender();
  },
  "plan-day-open": (el) => {
    const S = X.S;
    syncPlanInputs();
    S.trainPlanDayIdx = Number(el.dataset.arg);
    S.trainPlanQuery = "";
    X.rerender();
    window.scrollTo(0, 0);
  },
  "plan-slot-add": (el) => {
    syncPlanInputs();
    X.S.trainPlanEdit.days[Number(el.dataset.arg)].slots.push(D.planDraft.emptySlot());
    X.rerender();
  },
  "plan-slot-remove": (el) => {
    syncPlanInputs();
    const [di, si] = el.dataset.arg.split("|").map(Number);
    const day = X.S.trainPlanEdit.days[di];
    day.slots = day.slots.filter((_, i) => i !== si);
    X.rerender();
  },
  "plan-save": async () => {
    const S = X.S;
    syncPlanInputs();
    const all = [...S.catalog.exercises, ...(S.localExercises ?? [])];
    const defaults = (id) => {
      const e = all.find((x) => x.id === id);
      try {
        return e?.resistance_profiles ? JSON.parse(e.resistance_profiles) : [];
      } catch {
        return [];
      }
    };
    const r = D.planDraft.planDraftToInput(S.trainPlanEdit, defaults);
    if (!r.ok) {
      S.trainErrors = r.errors;
      setNotice("error", "Bitte die markierten Felder prüfen.");
      return X.rerender();
    }
    try {
      // Übungen, die nur am Handy angelegt wurden, gehen mit dem Plan an den PC
      for (const day of r.input.days) for (const ex of day.exercises) {
        const local = (S.localExercises ?? []).find((e) => e.id === ex.exerciseId);
        if (local) TR.addExerciseRow(S.catalogRaw, S.train, local);
      }
      TR.savePlan(S.catalogRaw, S.train, r.input, { uuid: X.uuid, now: new Date(), exercises: all });
      await persistTrain();
      setNotice("ok", `Plan „${r.input.name.trim()}“ gespeichert.`);
      S.trainPlanEdit = null;
      S.trainPlanDayIdx = null;
      S.trainErrors = {};
    } catch (e) {
      failed(e);
    }
    X.rerender();
    window.scrollTo(0, 0);
  },
  "pday-done": () => {
    const S = X.S;
    syncPlanInputs();
    const di = S.trainPlanDayIdx;
    const day = S.trainPlanEdit.days[di];
    const r = D.planDraft.checkPlanDay(day);
    if (!r.ok) {
      S.trainErrors = Object.fromEntries(Object.entries(r.errors).map(([k, v]) => [`days.${di}.${k}`, v]));
      setNotice("error", "Bitte die markierten Felder prüfen.");
      return X.rerender();
    }
    S.trainErrors = Object.fromEntries(Object.entries(S.trainErrors ?? {}).filter(([k]) => !k.startsWith(`days.${di}.`)));
    S.trainNotice = null;
    S.trainPlanDayIdx = null;
    X.rerender();
    window.scrollTo(0, 0);
  },
  "pday-ex-add": (el) => addPlanExercise(el.dataset.arg),
  "pday-machine-add": (el) => {
    const S = X.S;
    try {
      const { exercise, created } = X.C.exerciseForMachine(S.catalog, S.localExercises, el.dataset.arg);
      if (created) S.localExercises.push(exercise);
      addPlanExercise(exercise.id);
    } catch (e) {
      X.toast(e.message, true);
    }
  },
  "pday-ex-remove": (el) => {
    const S = X.S;
    syncPlanInputs();
    const day = S.trainPlanEdit.days[S.trainPlanDayIdx];
    day.exercises = day.exercises.filter((_, i) => i !== Number(el.dataset.arg));
    X.rerender();
  },
  "pday-ex-move": (el) => {
    const S = X.S;
    syncPlanInputs();
    const [i, dir] = el.dataset.arg.split("|").map(Number);
    const day = S.trainPlanEdit.days[S.trainPlanDayIdx];
    day.exercises = D.planDraft.move(day.exercises, i, dir);
    X.rerender();
  },
  "pday-set-add": (el) => {
    const S = X.S;
    syncPlanInputs();
    const ex = S.trainPlanEdit.days[S.trainPlanDayIdx].exercises[Number(el.dataset.arg)];
    const prev = ex.sets[ex.sets.length - 1];
    ex.sets.push(prev ? { ...D.workoutDraft.copySet(prev), isWarmup: false } : D.workoutDraft.emptySet());
    X.rerender();
  },
  "pday-set-remove": (el) => {
    const S = X.S;
    syncPlanInputs();
    const [ei, si] = el.dataset.arg.split("|").map(Number);
    const ex = S.trainPlanEdit.days[S.trainPlanDayIdx].exercises[ei];
    ex.sets = ex.sets.filter((_, i) => i !== si);
    X.rerender();
  },
};

export function trainingInput(el) {
  if (dbInput(el)) return true;
  if (el.dataset.tinput === "planQuery") {
    X.S.trainPlanQuery = el.value;
    const box = document.getElementById("pday-results");
    if (box) box.innerHTML = planPickerResults(el.value);
    return true;
  }
  if (el.dataset.neat) {
    // Kalorien, Zielbalken und Summe live wie am PC – ohne Neuaufbau (sonst ginge der Fokus verloren)
    X.S.trainNeatDraft = neatDraftNow();
    updateNeatLive();
    return true;
  }
  return false;
}

export function trainingChange(el) {
  const S = X.S;
  if (statsChange(el)) return true;
  if (dbChange(el)) return true;
  const k = el.dataset.tchange;
  if (k === "planDay") {
    S.trainPlanDay = el.value;
    X.rerender();
    return true;
  }
  if (k === "cardio") {
    S.trainCardio = el.value;
    X.rerender();
    return true;
  }
  if (k === "neatDate") {
    if (el.value && el.value <= today()) {
      S.trainNeatDate = el.value;
      S.trainNeatDraft = null;
      S.trainNotice = null;
      S.trainErrors = {};
    }
    X.rerender();
    return true;
  }
  if (el.dataset.neat) {
    S.trainNeatDraft = neatDraftNow();
    return true;
  }
  if (el.dataset.slot && el.dataset.pf === "kind") {
    syncPlanInputs();
    X.rerender();
    return true;
  }
  return false;
}
