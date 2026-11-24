// LIFESPAN OS Mobil – Training wie am PC (1.17.0): dieselben Reiter wie TrainingPage.tsx –
// Einheiten, Auswertung, Cardio, NEAT, Pläne, Datenbank, Check-Ins, Verlauf. Die Erfassung im
// Studio (Plan starten, freies Training, Sätze abhaken, Pausentimer) bleibt in app.js.
// Hier: Rahmen, „Einheiten“ (WorkoutsTab.tsx), „Pläne“ (PlansTab.tsx) und „NEAT“ (NeatTab.tsx).
// Auswertung, Verlauf, Cardio: trainingstats.js. Datenbank, Check-Ins: trainingdb.js.
// Daten: trainingdata.js (Änderungen am Handy, gehen mit „Körperwerte … senden“ an den PC).
// Seit 1.75.0 aufgeteilt: Pläne in trainingplans.js, Aktionen und Eingaben in trainingactions.js.
import * as D from "./pcdomain.js";
import { stepsDayHtml } from "./parity.js";
import * as P from "./pcdb.js";
import * as O from "./pcoverview.js";
import * as TR from "./trainingdata.js";
import * as HX from "./hyrox.js";
import * as CD from "./checklistdata.js";
import { buildDb, today } from "./diary.js";
import { hasWearable, workoutHeartHtml, workoutHeartOf } from "./heart.js";
import { energyHtml, stepGoalBar } from "./overview.js";
import { REVIEW_LAYOUT_KEY, viewCardioTab, viewProgressTab, viewReviewTab } from "./trainingstats.js";
import { DB_LAYOUT_KEY, viewDatabaseTab } from "./trainingdb.js";
import { layoutEditing } from "./layoutedit.js";
import { activeGymSelectHtml, viewGymsTab } from "./gymsui.js";
import * as GD from "./gymsdata.js";
import { icon } from "./nav.js";
import { plansTab } from "./trainingplans.js";
import { workoutKind } from "./plancalendar.js";
import { dotHtml, openTabsOf } from "./openitems.js";
export { planPickerResults } from "./trainingplans.js";
export { trainingActions, trainingChange, trainingInput } from "./trainingactions.js";

export let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice, saveTrain, startPlanDay, startFree, startBackfill, startCardio, openWorkout, C }

/** Aktion nur als Symbol (1.63.0); der Text steht im Hinweis und für Vorleseprogramme bereit. */
export const actionBtn = (act, id, name, label, tone = "") =>
  `<button class="icon-act ${tone}" data-act="${act}" data-arg="${esc(id)}" aria-label="${esc(label)}" title="${esc(label)}">${icon(name)}</button>`;

export function initTraining(ctx) {
  X = ctx;
}

export const esc = (v) => X.esc(v);

export const F = (v, d = 0) => D.formatNumber(v, d);

export const fmtDate = (d) => D.formatDate(d);

/**
 * Fünf Reiter statt acht (1.72.0, wie PC 1.0.162): Gruppe → Unterreiter. Die Unterreiter behalten
 * ihre Kennungen (`S.trainTab`), Verweise wie „gyms“ oder „neat“ funktionieren weiter.
 */
export const TRAINING_GROUPS = [
  ["workouts", "Einheiten", [["workouts", "Einheiten"]]],
  ["plans", "Pläne", [["plans", "Pläne"]]],
  ["review", "Auswertung", [["review", "Auswertung"], ["progress", "Verlauf"]]],
  ["cardio", "Cardio & NEAT", [["cardio", "Cardio"], ["neat", "NEAT"]]],
  ["database", "Datenbank", [["exercises", "Übungen & Maschinen"], ["gyms", "Meine Gyms"]]],
];

/** Alle Unterreiter mit Beschriftung (früher `TRAINING_TABS`). */
export const TRAINING_TABS = TRAINING_GROUPS.flatMap(([, , subs]) => subs);

export const groupOfTab = (tab) => TRAINING_GROUPS.find(([, , subs]) => subs.some(([v]) => v === tab)) ?? TRAINING_GROUPS[0];

export const KIND_LABELS = { rest: "Restday", sick: "Krankheit" };

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

/** Link rechts in der Zeile des Umschalters (1.74.0): Seite anpassen; im Bearbeiten-Modus ausgeblendet */
export function subAside(tab) {
  if (tab === "review" && layoutEditing() !== REVIEW_LAYOUT_KEY) return `<button class="linkbtn small subtabs-row__aside" data-act="train-review-layout">Auswertung anpassen</button>`;
  if (tab === "exercises" && !X.S.trainExEdit && !X.S.trainSportEdit && !X.S.trainMachine && layoutEditing() !== DB_LAYOUT_KEY)
    // als Symbol (Raster wie „Übersicht anpassen“ am PC): mit Text passt es neben den Umschalter nicht in eine Zeile
    return `<button class="subtabs-row__aside subtabs-row__icon" data-act="train-db-layout" aria-label="Datenbank anpassen" title="Datenbank anpassen"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></button>`;
  return "";
}

export function viewTrainingSection() {
  const S = X.S;
  const tab = S.trainTab ?? "workouts";
  const views = {
    review: viewReviewTab,
    cardio: viewCardioTab,
    neat: neatTab,
    plans: plansTab,
    exercises: viewDatabaseTab,
    gyms: viewGymsTab,
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
    ${(() => {
      const [gid, glabel, subs] = groupOfTab(tab);
      // Orange Punkte (1.109.0): Gruppe bzw. Unterreiter mit offenen Punkten für heute
      const marks = openTabsOf("training");
      const groupMarked = (g) => TRAINING_GROUPS.find(([x]) => x === g)?.[2].some(([v]) => marks.has(v));
      return `<nav class="tabs" aria-label="Training">${TRAINING_GROUPS.map(
        ([g, l]) => `<button class="tab ${g === gid ? "active" : ""}" data-act="train-group" data-arg="${g}" ${g === gid ? 'aria-current="page"' : ""}>${esc(l)}${groupMarked(g) ? dotHtml() : ""}</button>`,
      ).join("")}</nav>${
        subs.length > 1
          ? `<div class="subtabs-row"><div class="segmented subtabs" role="radiogroup" aria-label="${esc(glabel)}">${subs
              .map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === tab}" class="${v === tab ? "is-active" : ""}" data-act="train-tab" data-arg="${v}">${esc(l)}${marks.has(v) ? dotHtml() : ""}</button>`)
              .join("")}</div>${subAside(tab)}</div>`
          : ""
      }`;
    })()}
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

export function workoutsTab() {
  const S = X.S;
  const db = buildDb();
  const day0 = today();
  const statuses = CD.dayStatusOf(S.catalog, S.checklists, "2000-01-01", "2099-12-31");
  const todayStatus = statuses.find((s) => s.date === day0) ?? null;
  const streak = restStreak(statuses, day0);
  // Gym der Einheit (1.65.0): vom PC (`gym_id`) bzw. am Handy gewählt
  const gymNames = GD.gymNames(S.catalog, S.gyms);
  const gymOf = new Map(db.workouts.map((w) => [w.id, w.gym_id ?? null]));
  for (const w of S.workouts ?? []) gymOf.set(w.id, w.gymId ?? null);
  const summaries = db.workouts.map((w) => {
    const sum = O.workoutSummary(db, w);
    const gymId = gymOf.get(w.id) ?? null;
    return { ...sum, gymId, gymName: gymId ? (gymNames.get(gymId) ?? null) : null };
  });
  const sort = S.trainSort ?? D.workoutList.DEFAULT_WORKOUT_SORT;
  const rows = D.workoutList.sortTrainingRows(D.checkin.trainingRows(summaries, statuses), sort.key, sort.direction);
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
          ? `<div class="pick-row"><div class="field"><label for="w-from-plan">Trainingstag aus Plan</label>
          <select id="w-from-plan" data-tchange="planDay" ${blocked ? "disabled" : ""}><option value="">wählen …</option>${dayOptions
            .map((o) => `<option value="${esc(o.value)}" ${o.value === planSel ? "selected" : ""}>${esc(o.label)}</option>`)
            .join("")}</select></div>
          <button class="btn" data-act="train-start-day" ${!planSel || blocked ? "disabled" : ""}>▶ Starten</button></div>`
          : ""
      }
      ${activeGymSelectHtml(blocked)}
      <div class="start-grid">
        <button class="btn primary" data-act="start-free" ${blocked ? "disabled" : ""}>▶ Freies Training</button>
        <button class="btn" data-act="train-backfill" ${blocked ? "disabled" : ""}>Nachtragen</button>
        <button class="btn ${todayStatus?.kind === "rest" ? "primary" : ""}" data-act="train-day" data-arg="${todayStatus?.kind === "rest" ? "" : "rest"}" aria-pressed="${todayStatus?.kind === "rest"}" title="Heute kein Training – Regeneration">🛏 Restday</button>
        <button class="btn ${todayStatus?.kind === "sick" ? "primary" : ""}" data-act="train-day" data-arg="${todayStatus?.kind === "sick" ? "" : "sick"}" aria-pressed="${todayStatus?.kind === "sick"}" title="Heute kein Training wegen Krankheit">🌡 Krankheit</button>
      </div>
      ${
        cardioOptions.length
          ? `<div class="pick-row"><div class="field"><label for="w-cardio">Cardio erfassen</label>
          <select id="w-cardio" data-tchange="cardio" ${blocked ? "disabled" : ""}><option value="">wählen …</option>${cardioOptions
            .map((e) => `<option value="${esc(e.id)}" ${e.id === cardioSel ? "selected" : ""}>${esc(e.name)}</option>`)
            .join("")}</select></div>
          <button class="btn" data-act="train-cardio" ${!cardioSel || blocked ? "disabled" : ""}>Erfassen</button></div>`
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
  const sortBar = rows.length
    ? `<div class="train-sort"><label for="train-sort" class="small">Sortieren</label>
        <select id="train-sort" data-tchange="sort">${Object.entries(D.workoutList.WORKOUT_SORT_LABELS)
          .map(([k, l]) => `<option value="${k}" ${k === sort.key ? "selected" : ""}>${esc(l)}</option>`)
          .join("")}</select>
        <button class="btn sm" data-act="train-sort-dir" aria-label="${sort.direction === "asc" ? "Aufsteigend – umkehren" : "Absteigend – umkehren"}" title="Reihenfolge umkehren">${sort.direction === "asc" ? "↑" : "↓"}</button></div>`
    : "";
  const list = rows.length
    ? `${sortBar}<ul class="train-list" data-limit-rows="${D.workoutList.VISIBLE_WORKOUTS}">${rows
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
            <span class="train-row__main"><strong>${esc(w.title)}</strong>${w.status === "active" ? ' <span class="status-pill status-pill--active">läuft</span>' : ""}${w.competition ? `<span class="small train-row__comp">${esc(HX.describeCompetition(w.competition))}</span>` : ""}
              ${w.gymName ? `<span class="small train-row__gym">🏋️ ${esc(w.gymName)}</span>` : ""}
              <span class="muted small">${[
                `${w.exerciseCount} ${w.exerciseCount === 1 ? "Übung" : "Übungen"}`,
                `${w.setCount} ${w.setCount === 1 ? "Arbeitssatz" : "Arbeitssätze"}`,
                w.volumeKg > 0 ? `${F(w.volumeKg)} kg` : null,
                w.durationMin !== null ? `${w.durationMin} min` : null,
              ]
                .filter(Boolean)
                .join(" · ")}</span></span>
            <span class="train-row__acts">${w.status === "done" && hasWearable(S.catalog) ? `<button class="linkbtn" data-act="train-heart" data-arg="${esc(w.id)}" aria-expanded="${S.trainHeart === w.id}" aria-label="Herzfrequenz der Einheit" title="Herzfrequenz">♥ HF</button>` : ""}<button class="linkbtn" data-act="train-open" data-arg="${esc(w.id)}" aria-label="Einheit öffnen">Öffnen</button></span></li>${
              S.trainHeart === w.id ? `<li class="train-heart">${workoutHeartHtml(workoutHeartOf(S.catalog, w))}</li>` : ""
            }`;
        })
        .join("")}</ul>`
    : `<div class="empty-state"><p><strong>Noch keine Einheiten</strong></p><p class="muted small">Starte dein erstes Training mit „Freies Training“${dayOptions.length ? ", starte einen Trainingstag aus deinem Plan" : ""} oder trage eine frühere Einheit mit „Nachtragen“ ein.</p></div>`;
  const view = trainView();
  return `<section class="card card--training" id="workouts-title">
      <div class="card__head"><h3>Trainingseinheiten</h3><div class="segmented" role="group" aria-label="Darstellung der Einheiten"><button type="button" class="${view === "list" ? "is-active" : ""}" data-act="train-view" data-arg="list" aria-pressed="${view === "list"}">Liste</button><button type="button" class="${view === "calendar" ? "is-active" : ""}" data-act="train-view" data-arg="calendar" aria-pressed="${view === "calendar"}">Kalender</button></div></div>
      ${actions}
      ${banner}
      ${activeBanner}
      ${notice()}
      ${S.trainAdopt ? adoptOffer() : ""}
      ${view === "calendar" ? calendarHtml(summaries, statuses, blocked) : list}
    </section>
    ${S.trainDialog ? `<section class="card dialog-card" role="alertdialog"><h3>${esc(S.trainDialog.title)}</h3><p class="small">${esc(S.trainDialog.message)}</p><button class="btn block" data-act="train-dialog-close">Verstanden</button></section>` : ""}`;
}

/** Liste oder Kalender (1.103.0, wie PC 1.0.177), gemerkt auf diesem Handy */
export function trainView() {
  const S = X.S;
  if (!S.trainView) {
    try {
      S.trainView = localStorage.getItem("lifespan.workoutsView") === "calendar" ? "calendar" : "list";
    } catch {
      S.trainView = "list";
    }
  }
  return S.trainView;
}

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const pad2 = (n) => String(n).padStart(2, "0");

/** Monatsraster ab Montag wie `domain/monthGrid.ts`. */
export function monthGrid(year, month) {
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const d = new Date(year, month - 1, 1 - lead);
  const weeks = [];
  do {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, day: d.getDate(), inMonth: d.getMonth() === month - 1 });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  } while (d.getMonth() === month - 1);
  return weeks;
}

/** Kalender der Einheiten: Monat, Tag antippen zeigt seine Einheiten darunter. */
function calendarHtml(summaries, statuses, blocked) {
  const S = X.S;
  const t = today();
  const ym = S.trainMonth ?? { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) };
  const byDate = new Map();
  for (const w of summaries) {
    if (!byDate.has(w.date)) byDate.set(w.date, []);
    byDate.get(w.date).push(w);
  }
  const statusOf = new Map(statuses.map((s) => [s.date, s]));
  const prefix = `${ym.year}-${pad2(ym.month)}`;
  const count = summaries.filter((w) => w.date.startsWith(prefix)).length;
  const sel = S.trainCalDay && S.trainCalDay.startsWith(prefix) ? S.trainCalDay : null;
  // Rubrik-Farben wie im Pläne-Kalender (1.116.0 wie PC 1.0.192): Ergometer = Cardio
  const db = buildDb();
  const kindOf = (w) => workoutKind(db, w);
  const cells = monthGrid(ym.year, ym.month)
    .flat()
    .map((c) => {
      const list = byDate.get(c.date) ?? [];
      const st = statusOf.get(c.date);
      const marks = list.length ? `<span class="tcal__dots">${list.map((w) => `<i class="pcal-dot is-done pcal--${kindOf(w)} ${w.status === "active" ? "is-active" : ""}"></i>`).join("")}</span>` : st ? `<span class="tcal__st">${st.kind === "rest" ? "🛏" : "🌡"}</span>` : "";
      return `<button type="button" class="tcal__day ${c.inMonth ? "" : "is-outside"} ${c.date === t ? "is-today" : ""} ${c.date === sel ? "is-selected" : ""} ${st && !list.length ? `is-${st.kind}` : ""}" data-act="train-cal-day" data-arg="${c.date}" aria-label="${fmtDate(c.date)}${list.length ? `: ${list.length} ${list.length === 1 ? "Einheit" : "Einheiten"}` : ""}"><span>${c.day}</span>${marks}</button>`;
    })
    .join("");
  let detail = "";
  if (sel) {
    const list = byDate.get(sel) ?? [];
    const st = statusOf.get(sel);
    detail = `<div class="tcal__detail"><b>${fmtDate(sel)}</b>${list
      .map((w) => `<button class="train-row tcal__entry pcal--${kindOf(w)}" data-act="train-open" data-arg="${esc(w.id)}"><span class="train-row__main"><strong>${esc(w.title)}</strong>${w.status === "active" ? ' <span class="status-pill status-pill--active">läuft</span>' : ""}<span class="muted small">${w.startTime ? `${esc(w.startTime)} Uhr · ` : ""}${w.exerciseCount} ${w.exerciseCount === 1 ? "Übung" : "Übungen"}${w.volumeKg > 0 ? ` · ${F(w.volumeKg)} kg` : ""}${w.durationMin !== null ? ` · ${w.durationMin} min` : ""}</span></span><span aria-hidden="true">›</span></button>`)
      .join("")}${st ? `<span class="day-pill day-pill--${st.kind}">${st.kind === "rest" ? "🛏 Restday" : "🌡 Krankheit"}</span>` : ""}${
      !list.length && !st ? `<span class="muted small">Keine Einheit an diesem Tag.</span>` : ""
    }${sel <= t ? `<button class="btn sm" data-act="train-backfill-on" data-arg="${sel}" ${blocked ? "disabled" : ""}>+ Einheit nachtragen</button>` : ""}</div>`;
  }
  return `<div class="tcal"><div class="tcal__head"><button class="btn sm ghost" data-act="train-cal-month" data-arg="-1" aria-label="Vorheriger Monat">‹</button><b>${MONTHS[ym.month - 1]} ${ym.year}</b><button class="btn sm ghost" data-act="train-cal-month" data-arg="1" aria-label="Nächster Monat">›</button><span class="muted small">${count} ${count === 1 ? "Einheit" : "Einheiten"}</span></div>
    <div class="tcal__grid">${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => `<span class="tcal__wd">${d}</span>`).join("")}${cells}</div>
    <p class="muted small pcal-legend">${["strength", "cardio", "sport", "mobility"].map((k) => `<span><i class="pcal-dot is-done pcal--${k}"></i> ${esc(D.trainingKind.TRAINING_KIND_LABELS[k])}</span>`).join("")}<span><i class="pcal-rest"></i> Restday</span></p>${detail}</div>`;
}

export function adoptOffer() {
  const a = X.S.trainAdopt;
  return `<div class="adopt-offer" role="group" aria-label="Richtwerte übernehmen"><span class="small">Sätze, Gewichte und Einstellungen von „${esc(a.title)}“ als neue Richtwerte in den Trainingstag übernehmen? Beim nächsten Start sind die Sätze damit vorbelegt.</span>
    <div class="row-actions"><button class="btn sm primary" data-act="train-adopt">In den Plan übernehmen</button><button class="btn sm" data-act="train-adopt-no">Nein danke</button></div></div>`;
}

/** Restday/Krankheit für einen Tag setzen oder entfernen, mit den Meldungen wie am PC. */
export async function applyDay(date, kind) {
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
export function adoptWorkout(w) {
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

export const HISTORY_DAYS = 14;

export function neatTab() {
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
      <p class="card__note">Jede Bewegung, die kein geplantes Training ist. Gehen in Schritten, alles andere in Minuten. Leere Felder gelten als nicht erfasst.</p>
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
    ${stepsDayHtml(date)}
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

export function updateNeatLive() {
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

export function neatDraftNow() {
  const S = X.S;
  const date = S.trainNeatDate ?? today();
  const d = { date };
  for (const el of document.querySelectorAll("[data-neat]")) d[el.dataset.neat] = el.value;
  return d;
}
