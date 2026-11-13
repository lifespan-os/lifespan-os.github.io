// LIFESPAN OS Mobil – Overview wie am PC (1.6.0): dieselben Karten mit denselben Werten und
// Grafiken (LiveOverview.tsx, DashboardWidgets.tsx, Widgets.tsx) in der Anordnung, die am PC
// unter „Übersicht anpassen“ gewählt ist (Settings `ui.overview_layout`). Daten: pcoverview.js
// (wie der Rust-Kern), Rechnung: pcdomain.js (= src/domain der Desktop-App).

import * as P from "./pcdb.js";
import * as O from "./pcoverview.js";
import * as D from "./pcdomain.js";
import { barTrendSvg, COLOR, dayChartHtml, esc, trendSvg } from "./pcview.js";

let X = null; // { S, buildDb, rerender, today }

export function initOverview(ctx) {
  X = ctx;
}

const F = (v, d = 0) => D.formatNumber(v, d);
const dur = (m) => D.formatDuration(m);
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// ------------------------------------------------------------------ Bausteine

function card(id, title, meta, body, { area = "", wide = false } = {}) {
  return `<section class="card ov-card ${area ? `card--${area}` : ""} ${wide ? "ov-card--wide" : ""}" data-card="${esc(id)}">
    <div class="wo-head"><h3>${esc(title)}</h3>${meta ? `<span class="tag">${esc(meta)}</span>` : ""}</div>
    ${body}</section>`;
}

const metric = (label, value, unit = "", display = false) =>
  `<div class="metric ${display ? "metric--display" : ""}"><span class="metric__value">${esc(value)}${unit ? `<span class="metric__unit">${esc(unit)}</span>` : ""}</span><span class="metric__label">${esc(label)}</span></div>`;

const row = (...items) => `<div class="metric-row">${items.filter(Boolean).join("")}</div>`;
const note = (text) => (text ? `<p class="card__note">${text}</p>` : "");
const link = (section, label) => `<button class="linkbtn" data-act="menu-go" data-arg="${section}">${esc(label)}</button>`;
const missing = (text, section, action) => `<p class="muted">${esc(text)} ${link(section, action)}</p>`;

function ring(share, label) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, share));
  return `<svg class="goal-ring" viewBox="0 0 64 64" role="img" aria-label="${esc(label)}">
    <circle class="goal-ring__track" cx="32" cy="32" r="${r}"/>
    <circle class="goal-ring__fill ${f >= 1 ? "is-done" : ""}" cx="32" cy="32" r="${r}" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 32 32)"/>
    <text x="32" y="37" text-anchor="middle" class="goal-ring__text">${Math.round(f * 100)}%</text></svg>`;
}

const FLAME =
  '<svg class="streaks__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';

function logoProgress(share, label) {
  const pct = Math.round(Math.max(0, Math.min(1, share)) * 100);
  return `<span class="logo-progress" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(label)}" title="${esc(label)}">
    <span class="logo-progress__base" aria-hidden="true">LIFESPAN OS</span>
    <span class="logo-progress__fill" aria-hidden="true" style="clip-path:inset(0 ${100 - pct}% 0 0)">LIFESPAN OS</span></span>`;
}

const LEVEL = (l) => D.dashboard.LEVEL_LABELS[l] ?? "";

// ------------------------------------------------------------------ Daten des Tages

/** Alles, was die Karten brauchen (wie OverviewPage.tsx lädt). */
export function overviewData(db, catalog, date) {
  const data = O.overviewFor(db, date);
  const insights = O.insightsFor(db, P.addDays(date, -(O.STREAK_DAYS - 1)), date);
  const monday = D.trends.weekStart(date);
  const week = D.insights.weeklySummary(O.insightsFor(db, D.trends.shiftDays(monday, -7), date), monday);
  return {
    data,
    week,
    widgets: {
      dashboard: O.dashboardFor(db, date, catalog?.plans ?? []),
      insights,
      cardio: O.cardioSessions(db),
      exportReminder: { lastExportAt: catalog?.exportedAt ? String(catalog.exportedAt).slice(0, 19) : null, snoozedUntil: null },
      log: O.setLog(db),
      exercises: O.exercisesOf(db),
      foods: O.foodsWithUsage(db),
      weekGoals: D.dashboard.parseWeekGoals(db.settings.get(D.dashboard.WEEK_GOALS_KEY) ?? null),
    },
  };
}

// ------------------------------------------------------------------ Karten wie DashboardWidgets.tsx

const PROGRESS_KEY = "overview.progressExercise";
function storedExercise() {
  try {
    return localStorage.getItem(PROGRESS_KEY) ?? "";
  } catch {
    return "";
  }
}
export function chooseProgressExercise(id) {
  try {
    localStorage.setItem(PROGRESS_KEY, id);
  } catch {
    // ohne Speicher gilt die Auswahl bis zum Schließen
  }
}

function dashboardCards(data, w, isToday) {
  const today = data.date;
  const weight = data.stepEnergyToday.weightKg;
  const goal = w.insights.goal ?? data.goal;
  const insights = { ...w.insights, goal };
  const next = w.dashboard.nextPlanDay;
  const exportState = D.exportReminderState(w.exportReminder, today);
  const muscles = D.weeklyMuscleSets(w.log, w.exercises, today, 2);
  const current = muscles.weeks.length - 1;
  const regularity = D.dashboard.sleepRegularity(w.insights.sleep, today);
  const due = D.dashboard.dueReminders(w.dashboard, today);
  const exportText = isToday && exportState.due ? exportState.text : null;
  const machineIds = new Set(w.exercises.filter((e) => e.machineId).map((e) => e.id));

  // Tagesbereitschaft
  const r = D.dashboard.readiness(insights, today, goal?.sleepMin ?? null);
  const readinessCard = card(
    "readiness",
    "Tagesbereitschaft",
    isToday ? "Heute" : "An diesem Tag",
    `<div class="readiness"><span class="readiness__light readiness__light--${r.level ?? "none"}" role="img" aria-label="${esc(r.level ? `Ampel ${LEVEL(r.level)}` : "Keine Einschätzung")}"></span>
      <p class="readiness__headline">${esc(r.headline)}</p></div>
    ${
      r.factors.length
        ? `<ul class="readiness__factors">${r.factors
            .map((f) => `<li><span class="readiness__dot readiness__dot--${f.level}" aria-hidden="true"></span><strong>${esc(f.label)}:</strong> ${esc(f.text)}</li>`)
            .join("")}</ul>`
        : ""
    }
    ${r.missing.length ? note(`Ohne Wert: ${esc(r.missing.join(", "))}.`) : ""}
    ${note("Vergleich mit deinem eigenen Schnitt der 28 Tage davor – Orientierung, keine medizinische Bewertung.")}`,
    { area: "recovery" },
  );

  // Wochenziele
  const goals = D.dashboard.weeklyGoals({
    today,
    data: insights,
    cardio: w.cardio,
    weightKg: weight,
    planDays: next?.planDayCount ?? null,
    planName: next?.planName ?? null,
    settings: w.weekGoals,
  });
  const weeklyCard = card(
    "weekly",
    "Wochenziele",
    D.trends.formatRange(D.trends.weekStart(today), today),
    `<ul class="goal-rings">${goals
      .map(
        (g) => `<li>${ring(g.share, `${g.label}: ${g.value}`)}<span class="goal-rings__label">${esc(g.label)}</span>
          <strong class="goal-rings__value">${esc(g.value)}</strong><span class="goal-rings__note">${esc(g.note)}</span></li>`,
      )
      .join("")}</ul>
    ${
      goals.length < 4
        ? note(
            `${
              goals.some((g) => g.key === "protein")
                ? "Der Schlafring erscheint mit einem Schlafziel"
                : goals.some((g) => g.key === "sleep")
                  ? "Der Proteinring erscheint mit einem Proteinziel"
                  : "Protein- und Schlafring erscheinen mit einem Proteinziel bzw. Schlafziel"
            } unter Settings → Tagesziele (am PC).`,
          )
        : ""
    }
    ${note("Alle Wochenziele bearbeiten: Settings → Wochenziele (am PC).")}`,
    { area: "training" },
  );

  // Streaks
  const list = D.dashboard.streaks({ today, days: O.STREAK_DAYS, data: insights, dashboard: w.dashboard, weightKg: weight });
  const streaksCard = card(
    "streaks",
    "Streaks",
    `Tage in Folge · letzte ${O.STREAK_DAYS} Tage`,
    list.length === 0
      ? `<p class="muted">Für Streaks braucht es Tagesziele (Protein, Wasser, Schritte, Schlaf) oder Supplement-Einträge – am PC unter Settings → Tagesziele.</p>`
      : `<ul class="streaks">${list
          .map(
            (s) => `<li class="${s.current > 0 ? "is-active" : ""}">${FLAME}
          <span class="streaks__label"><strong>${esc(s.label)}</strong>
            <span class="streaks__goal"><span class="muted small">${esc(s.goal)}</span>${logoProgress(s.todayShare, `${s.label}: ${s.todayText}`)}</span></span>
          <span class="streaks__count"><span><strong>${s.current}${s.atLimit ? "+" : ""}</strong> ${s.current === 1 ? "Tag" : "Tage"}</span>
            <span class="muted small">${s.today ? "heute geschafft" : s.current > 0 ? "heute noch offen" : "—"}${s.best > s.current ? ` · Rekord ${s.best}` : ""}</span></span></li>`,
          )
          .join("")}</ul>`,
    { area: "nutrition" },
  );

  // Nächstes Training
  const nextCard = card(
    "next",
    "Nächstes Training",
    next ? next.planName : "aus deinem Plan",
    next
      ? `<p class="card__subject">${esc(next.dayName)}</p>
        ${next.scheduledDate ? `<p class="next-training__when">Geplant: <strong>${esc(D.describeScheduled(next.scheduledDate, next.scheduledTime, today))}</strong></p>` : ""}
        ${note(
          esc(
            `${next.previousDayName && next.previousDate ? `Nach „${next.previousDayName}“ am ${D.formatDate(next.previousDate)}. ` : ""}${
              next.lastDate
                ? `Zuletzt am ${D.formatDate(next.lastDate)}${next.lastVolumeKg ? ` · ${D.trainingCalc.formatVolume(next.lastVolumeKg)}` : ""}.`
                : "Diesen Tag hast du noch nicht trainiert."
            }`,
          ),
        )}
        ${next.exercises.length ? `<ul class="plain-list next-training__list">${next.exercises.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
        <button class="btn block" data-go="plans">Plan starten</button>`
      : `<p class="muted">Noch kein Termin und keine Einheit aus einem Trainingsplan. Gib am PC unter Training → Pläne einem Trainingstag einen Termin oder starte einen Tag aus einem Plan – danach steht hier der nächste.</p>`,
    { area: "training" },
  );

  // Arbeitssätze je Muskelgruppe
  const mrows = muscles.rows
    .filter((x) => (x.sets[current] ?? 0) > 0 || (x.sets[current - 1] ?? 0) > 0)
    .sort((a, b) => (b.sets[current] ?? 0) - (a.sets[current] ?? 0) || (b.sets[current - 1] ?? 0) - (a.sets[current - 1] ?? 0));
  const mmax = Math.max(1, ...mrows.map((x) => Math.max(x.sets[current] ?? 0, x.sets[current - 1] ?? 0)));
  const mbar = (x) => {
    const now = x.sets[current] ?? 0;
    const before = x.sets[current - 1] ?? 0;
    return `<li><div class="review-bars__head"><strong>${esc(x.group)}</strong><span class="review-bars__value">${now} ${now === 1 ? "Satz" : "Sätze"}<span class="muted"> · Vorwoche ${before}</span></span></div>
      <span class="review-bars__track" role="img" aria-label="${esc(`${x.group}: ${now} Sätze diese Woche, ${before} in der Vorwoche`)}"><span class="review-bars__fill" style="width:${(now / mmax) * 100}%;background:${COLOR.training}"></span></span></li>`;
  };
  const musclesCard = card(
    "muscles",
    "Arbeitssätze je Muskelgruppe",
    "diese Woche · Vorwoche",
    `${
      mrows.length === 0
        ? `<p class="muted">In dieser und der letzten Woche keine Kraftübungen mit Muskelgruppe.</p>`
        : `<ul class="review-bars">${mrows.slice(0, 8).map(mbar).join("")}</ul>${
            mrows.length > 8
              ? `<details class="ov-more"><summary>Weitere ${mrows.length - 8} Muskelgruppen anzeigen</summary><ul class="review-bars">${mrows.slice(8).map(mbar).join("")}</ul></details>`
              : ""
          }`
    }
    ${note("Arbeitssätze von Kraftübungen (Montag–Sonntag); oft genannt werden 10–20 Sätze je Muskelgruppe und Woche.")}`,
    { area: "training" },
  );

  // Übungsfortschritt
  const options = D.dashboard.progressExercises(w.log, today, 180);
  const chosen = storedExercise();
  const selected = options.find((o) => o.exerciseId === chosen) ?? options[0];
  let progressBody;
  if (!selected) {
    progressBody = `<p class="muted">Noch keine Kraftübung mit Gewicht und 1–12 Wiederholungen in den letzten 6 Monaten.</p>`;
  } else {
    const p = D.dashboard.exerciseProgress(w.log, selected.exerciseId, today);
    const last = p.points.at(-1);
    progressBody = `<div class="field"><label for="ov-progress">Übung</label><select id="ov-progress" data-ov="progress">${options
      .map((o) => `<option value="${esc(o.exerciseId)}" ${o.exerciseId === selected.exerciseId ? "selected" : ""}>${esc(`${o.name} (${o.sessions}×)`)}</option>`)
      .join("")}</select></div>
      ${row(
        last ? metric("Zuletzt", F(last.value, 1), "kg", true) : "",
        p.changePercent !== null ? metric(`Seit ${D.formatDate(p.points[0]?.date ?? today)}`, D.formatSigned(p.changePercent, 0), "%") : "",
        p.best ? metric(`Bestwert am ${D.formatDate(p.best.date)}`, F(p.best.value, 1), "kg") : "",
      )}
      ${p.points.length >= 2 ? trendSvg(p.points.map((x) => ({ date: x.date, value: x.value })), { color: COLOR.training, decimals: 0, height: 150, label: `1RM-Schätzung ${selected.name} der letzten 6 Monate` }) : ""}
      ${
        machineIds.has(selected.exerciseId)
          ? note(
              "Maschine: Das eingestellte Gewicht wirkt über Hebel bzw. Übersetzung – die Schätzung ist nicht mit freien Gewichten oder anderen Maschinen vergleichbar, zeigt aber zuverlässig deinen eigenen Fortschritt an dieser Maschine.",
            )
          : ""
      }
      ${note("Epley: Gewicht × (1 + Wdh. ÷ 30), bester Arbeitssatz je Einheit (1–12 Wdh.). Die Auswahl merkt sich die App.")}`;
  }
  const progressCard = card("progress", "Übungsfortschritt", selected ? "1RM-Schätzung · 6 Monate" : "1RM-Schätzung", progressBody, { area: "training" });

  // Schlaf-Regelmäßigkeit
  const sleepregCard = card(
    "sleepreg",
    "Schlaf-Regelmäßigkeit",
    "14 Nächte",
    regularity
      ? `<div class="readiness"><span class="readiness__light readiness__light--${regularity.level}" role="img" aria-label="${esc(`Ampel ${LEVEL(regularity.level)}`)}"></span>
          <p class="readiness__headline">${esc(regularity.text)}</p></div>
        ${row(metric(`Zubettgehen Ø (± ${F(regularity.bedSd)} min)`, regularity.bedMean, "Uhr"), metric(`Aufwachen Ø (± ${F(regularity.wakeSd)} min)`, regularity.wakeMean, "Uhr"))}
        ${note(`Streuung (Standardabweichung) aus ${regularity.nights} Nächten: bis ± 30 min regelmäßig, bis ± 60 min mittel.`)}`
      : `<p class="muted">Dafür braucht es mindestens 5 Nächte mit Zubettgeh- und Aufwachzeit in den letzten 14 Tagen.</p>`,
    { area: "sleep" },
  );

  // Ballaststoffe, Zucker, Salz
  const ex = D.dashboard.extrasCheck(w.dashboard.extras);
  const extrasCard = card(
    "extras",
    "Ballaststoffe, Zucker, Salz",
    "Ø letzte 7 Tage",
    `${
      ex.checks.length === 0
        ? `<p class="muted">Dafür braucht es an mindestens 3 der letzten 7 Tage Mahlzeiten mit Lebensmitteln (bisher ${ex.days}). ${link("nutrition", "Mahlzeit erfassen")}</p>`
        : `<ul class="readiness__factors">${ex.checks
            .map(
              (c) => `<li><span class="readiness__dot readiness__dot--${c.level}" aria-hidden="true"></span><strong>${esc(c.label)}:</strong> ${esc(c.value)}
            <span class="muted small"> · Richtwert ${esc(c.reference)}</span>${c.missingShare >= 0.2 ? `<span class="muted small"> · bei ${F(c.missingShare * 100)} % der Einträge ohne Angabe</span>` : ""}</li>`,
            )
            .join("")}</ul>`
    }
    ${note(
      `Aus den Lebensmitteln deiner Mahlzeiten an ${ex.days} ${ex.days === 1 ? "Tag" : "Tagen"} (ohne Fasttracking). Beim Zucker zählt der gesamte Zucker – auch aus Obst und Milch –, der WHO-Richtwert gilt nur für freie Zucker; die Ampel ist hier also eher streng. Orientierung, keine Ernährungsberatung.`,
    )}`,
    { area: "nutrition" },
  );

  // Erinnerungen
  const none = due.length === 0 && !exportText;
  const remindersCard = card(
    "reminders",
    "Erinnerungen",
    none ? "alles erledigt" : `${due.length + (exportText ? 1 : 0)} fällig`,
    `${
      none
        ? `<p class="muted">Keine Messung fällig – alles im Rhythmus.</p>`
        : `<ul class="reminders">${due
            .map((d) => `<li>${link(d.where, d.label)}<span class="muted small">${esc(d.text)}</span></li>`)
            .join("")}${exportText ? `<li><strong>Datenexport (am PC)</strong><span class="muted small">${esc(exportText)}</span></li>` : ""}</ul>`
    }
    ${note(
      "Rhythmus: Gewicht, Umfänge und ANS-Werte wöchentlich, Check-In-Fotos alle 4 Wochen, Griffkraft monatlich, VO2max vierteljährlich. Griffkraft, VO2max und ANS-Werte erst, wenn du sie einmal erfasst hast.",
    )}`,
    { area: "body" },
  );

  return [
    { id: "readiness", node: readinessCard },
    { id: "weekly", node: weeklyCard },
    { id: "streaks", node: streaksCard },
    { id: "next", empty: next === null, node: nextCard },
    { id: "muscles", empty: mrows.length === 0, node: musclesCard },
    { id: "progress", empty: w.log.length === 0, node: progressCard },
    { id: "sleepreg", empty: regularity === null, node: sleepregCard },
    { id: "extras", empty: w.dashboard.extras.length === 0, node: extrasCard },
    { id: "reminders", empty: none, node: remindersCard },
  ];
}

// ------------------------------------------------------------------ Karten wie LiveOverview.tsx

function energyHtml(energy) {
  const rows = D.energy.energyRows(energy);
  const total = energy.calibratedTotalKcal ?? energy.totalKcal;
  const pal = energy.calibratedPal ?? energy.pal;
  const cal = D.energy.describeCalibration(energy);
  if (total === null) {
    return `<p class="muted">Für den Gesamtverbrauch fehlt noch: ${esc(energy.missing.join(", "))}.</p>
      ${note(`${link("body", "Gewicht erfassen")} · Profil am PC unter Settings`)}`;
  }
  return `${row(
    metric(energy.calibratedTotalKcal !== null ? "Gesamtverbrauch (kalibriert)" : "Gesamtverbrauch (berechnet)", F(total), "kcal", true),
    pal !== null ? metric(`PAL · ${D.energy.palLabel(pal)}`, D.energy.formatPal(pal)) : "",
  )}
    <table class="data-table"><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.label)}${r.detail ? `<span class="muted small"> · ${esc(r.detail)}</span>` : ""}</td><td class="tnum">${F(r.kcal)} kcal</td></tr>`).join("")}
      ${energy.calibratedTotalKcal !== null && energy.totalKcal !== null ? `<tr><td>Berechnet (vor Kalibrierung)</td><td class="tnum">${F(energy.totalKcal)} kcal</td></tr>` : ""}
    </tbody></table>
    ${cal ? note(esc(cal)) : ""}
    ${
      energy.workoutsWithoutDuration > 0
        ? note(energy.workoutsWithoutDuration === 1 ? "Eine Einheit ohne Dauer zählt nicht mit." : `${energy.workoutsWithoutDuration} Einheiten ohne Dauer zählen nicht mit.`)
        : ""
    }
    ${note("Schätzung aus Formeln, keine Messung. PAL = Gesamtverbrauch ÷ Grundumsatz.")}`;
}

function stepGoalBar(steps, goal) {
  const p = D.neat.stepProgress(steps, goal);
  if (p.goal === null || p.percent === null) {
    return `<p class="muted small">${steps !== null ? `${F(steps)} Schritte. ` : ""}Kein Tagesschrittziel festgelegt – am PC in den Tageszielen eintragen.</p>`;
  }
  return `<div class="neat-steps"><div class="macro-goal__head"><span class="macro-goal__label">${F(p.steps)} Schritte</span><span class="muted">von ${F(p.goal)}</span>
    <span class="macro-goal__status ${p.reached ? "is-reached" : ""}">${p.reached ? `Ziel erreicht (${Math.round(p.percent)} %)` : `${Math.round(p.percent)} % · noch ${F(p.remaining ?? 0)}`}</span></div>
    <div class="goal-bar goal-bar--energy" role="img" aria-label="${esc(`${F(p.steps)} von ${F(p.goal)} Schritten`)}"><span class="goal-bar__fill" style="width:${Math.min(100, p.percent)}%;background:${COLOR.training}"></span></div></div>`;
}

function liveCards(data, week, widgets, isToday) {
  const dayMeta = isToday ? "Heute" : D.formatDate(data.date);
  const onDay = isToday ? "Heute" : "An diesem Tag";
  const nightMeta = isToday ? "Letzte Nacht" : `Nacht zum ${D.formatDate(data.date)}`;
  const goal = data.goal ? D.withProteinFromWeight(data.goal, data.stepEnergyToday.weightKg) : null;

  // Training
  const workouts = data.workoutsToday;
  const allSets = workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets));
  const workingSets = allSets.filter((s) => !s.isWarmup);
  const volume = D.trainingCalc.volumeBreakdown(allSets).volumeKg;
  const duration = workouts.reduce((a, w) => a + (w.durationMin ?? 0), 0);
  const trainingCard = card(
    "training",
    "Training",
    dayMeta,
    workouts.length
      ? `<p class="card__subject">${esc(workouts.map((w) => (w.status === "active" ? `${w.title} (läuft)` : w.title)).join(" · "))}</p>
        ${row(
          duration > 0 ? metric("Dauer", dur(duration), "", true) : "",
          metric("Arbeitssätze", String(workingSets.length)),
          volume > 0 ? metric("Volumen (Wdh. × kg, Arbeitssätze)", D.trainingCalc.formatVolume(volume).replace(" kg", ""), "kg") : "",
        )}
        <table class="data-table"><thead><tr><th>Übung</th><th class="tnum">Sätze</th><th class="tnum">Höchstes Gewicht</th></tr></thead><tbody>
        ${workouts
          .flatMap((w) =>
            w.exercises.map((e) => {
              const sets = e.sets.filter((s) => !s.isWarmup);
              const max = Math.max(...sets.map((s) => s.weightKg ?? 0));
              return `<tr><td>${esc(e.exerciseName)}</td><td class="tnum">${sets.length}</td><td class="tnum">${max > 0 ? esc(D.trainingCalc.formatKg(max)) : "–"}</td></tr>`;
            }),
          )
          .join("")}</tbody></table>`
      : `${missing(`${onDay} noch keine Einheit erfasst.`, "training", "Zum Training")}
        ${data.lastWorkout ? note(esc(`Letzte Einheit: ${data.lastWorkout.title} am ${D.formatDate(data.lastWorkout.date)} · ${data.lastWorkout.setCount} Arbeitssätze`)) : ""}`,
    { area: "training" },
  );

  // Regeneration
  const recovery = D.insights.recoverySeries(data.recoveryLast7Days, "readiness");
  const today = data.recoveryToday;
  const latestVital = (id) => data.vitalsLast7Days.filter((m) => m.metricId === id).at(-1) ?? null;
  const hr = latestVital(O.RESTING_HR_METRIC_ID);
  const hrv = latestVital(O.HRV_METRIC_ID);
  const vitalLabel = (name, date) => (date === data.date ? `${name}, ${isToday ? "heute" : "an diesem Tag"}` : `${name}, ${D.formatDate(date)}`);
  const recoveryCard = card(
    "recovery",
    "Regeneration",
    "Selbsteinschätzung",
    `${
      today
        ? row(
            today.readiness !== null ? metric(isToday ? "Erholung heute (1–10)" : "Erholung (1–10)", String(today.readiness), "/ 10", true) : "",
            ...D.recovery.RECOVERY_SCALES.filter((s) => s.key !== "readiness" && today[s.key] !== null).map((s) => metric(`${s.label} (0–10)`, String(today[s.key]), "/ 10")),
          )
        : missing(`${onDay} noch nicht erfasst.`, "recovery", "Jetzt erfassen (am PC)")
    }
    ${recovery.length >= 2 ? trendSvg(recovery, { color: COLOR.recovery, decimals: 0, height: 150, label: "Selbsteinschätzung der letzten 7 Tage" }) : ""}
    ${hr || hrv ? row(hr ? metric(vitalLabel("Ruhepuls", hr.date), F(hr.value), "bpm") : "", hrv ? metric(vitalLabel("HRV (RMSSD)", hrv.date), F(hrv.value, 1), "ms") : "") : ""}
    ${note(`Eigene Einschätzung, kein berechneter Wert.${hr || hrv ? " Ruhepuls und HRV: zuletzt erfasste Messung, ohne Bewertung." : ""}`)}`,
    { area: "recovery" },
  );

  // Ernährung
  const n = data.nutritionToday;
  const energyDay = data.energyToday;
  const need = D.dailyNeed(goal, data.stepEnergyToday.kcal, energyDay);
  const needNote = D.describeNeed(need);
  const dayMacros = goal ? D.dayMacroGoals(goal, need, energyDay) : null;
  const targets = { energyKcal: need?.total ?? null, proteinG: dayMacros?.proteinG ?? null, carbsG: dayMacros?.carbsG ?? null, fatG: dayMacros?.fatG ?? null };
  const macroNote = dayMacros ? D.describeMacroGoals(dayMacros) : null;
  const openProtein = isToday && targets.proteinG !== null ? targets.proteinG - (n?.proteinG ?? 0) : null;
  const openKcal = need !== null ? need.total - (n?.energyKcal ?? 0) : null;
  const suggestions = openProtein !== null ? D.dashboard.proteinSuggestions(widgets.foods, openProtein, openKcal) : [];
  const budget =
    openProtein !== null && openProtein >= 10
      ? `<div class="protein-suggest"><p class="card__note"><strong>Noch ${F(openProtein)} g Protein offen.</strong>${
          suggestions.length
            ? openProtein > D.dashboard.MEAL_PROTEIN
              ? ` Für die nächste Mahlzeit (etwa ${D.dashboard.MEAL_PROTEIN} g Protein) passend aus deinen häufig genutzten Lebensmitteln – je eines davon:`
              : " Passend aus deinen häufig genutzten Lebensmitteln – je eines davon:"
            : ""
        }</p>${
          suggestions.length
            ? `<ul class="plain-list">${suggestions.map((s) => `<li>${esc(`${s.amount} ${s.name} – ${F(s.proteinG)} g Protein, ${F(s.energyKcal)} kcal`)}</li>`).join("")}</ul>`
            : ""
        }</div>`
      : "";
  const hasFood = n && n.energyKcal > 0;
  const nutritionCard = card(
    "nutrition",
    "Ernährung",
    dayMeta,
    hasFood
      ? `${dayChartHtml(D.dayChart(n, targets))}
        ${n.fasttracking ? note(n.mealCount > 0 ? "Mahlzeiten und Fasttracking-Tageswerte zusammen." : "Aus Fasttracking (Tageswerte ohne einzelne Mahlzeiten).") : ""}
        ${needNote ? note(esc(needNote)) : ""}${macroNote ? note(esc(macroNote)) : ""}${budget}
        ${
          need !== null || goal?.proteinG != null
            ? note(
                esc(
                  [
                    need !== null ? `Energie: ${D.describeGoalProgress(D.goalProgress(need.total, n.energyKcal, 0), "kcal")}` : null,
                    goal?.proteinG != null ? `Protein (Ziel ${F(goal.proteinG)} g): ${D.describeGoalProgress(D.goalProgress(goal.proteinG, n.proteinG, 1), "g")}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                ),
              )
            : ""
        }`
      : `${need !== null ? dayChartHtml(D.dayChart(null, targets)) : ""}
        ${missing(`${onDay} noch keine Mahlzeit erfasst.`, "nutrition", "Zur Ernährung")}
        ${needNote ? note(esc(needNote)) : ""}${macroNote ? note(esc(macroNote)) : ""}${budget}`,
    { area: "nutrition" },
  );

  // Schlaf
  const nights = data.sleepLast7Days;
  const naps = D.sleep.napMinutesByDate(data.napsLast7Days ?? []);
  const sleepAvg = nights.length ? D.stats.mean(nights.map((s) => D.sleep.sleepWithNaps(s, naps))) : null;
  const napsToday = naps.get(data.date) ?? 0;
  const sleepCard = card(
    "sleep",
    "Schlaf",
    nightMeta,
    `${
      data.sleepToday
        ? row(
            metric(`${data.sleepToday.bedTime} bis ${data.sleepToday.wakeTime} Uhr`, dur(D.sleep.sleepWithNaps(data.sleepToday, naps)), "", true),
            sleepAvg !== null && nights.length > 1 ? metric(`Mittel, ${nights.length} Nächte`, dur(sleepAvg)) : "",
          )
        : missing(isToday ? "Letzte Nacht noch nicht erfasst." : "Für diese Nacht nichts erfasst.", "sleep", "Jetzt erfassen (am PC)")
    }
    ${
      nights.length >= 2
        ? barTrendSvg(
            nights.map((s) => ({ date: s.date, value: D.sleep.sleepWithNaps(s, naps) })),
            { color: COLOR.sleep, format: (v) => dur(v), label: "Schlafdauer der letzten 7 Nächte", ticks: [0, 240, 480], tickFormat: (v) => `${F(v / 60)} h` },
          )
        : ""
    }
    ${data.sleepToday && napsToday > 0 ? note(`Nacht ${dur(data.sleepToday.sleepMin)} + Nickerchen ${dur(napsToday)}`) : ""}
    ${goal?.sleepMin != null ? note(`Dein Schlafziel: ${dur(goal.sleepMin)}`) : ""}`,
    { area: "sleep" },
  );

  // Alltagsbewegung
  const neat = data.neatToday;
  const stepGoal = goal?.steps ?? null;
  const stepDays = data.neatLast7Days.filter((d) => d.steps !== null);
  const minutes = neat ? D.neat.minuteRows(neat) : [];
  const maxMin = Math.max(1, ...minutes.map((r) => r.minutes));
  const neatCard = card(
    "neat",
    "Alltagsbewegung (NEAT)",
    dayMeta,
    neat
      ? `<div class="neat-overview"><div>${stepGoalBar(neat.steps, stepGoal)}
          ${
            minutes.length
              ? `${note(`Weitere Alltagsbewegung: ${dur(neat.totalMin)}`)}<ul class="neat-bars" aria-label="Minuten je Tätigkeit">${minutes
                  .map(
                    (r) =>
                      `<li><span>${esc(r.label)}</span><span class="goal-bar"><span class="goal-bar__fill" style="width:${(r.minutes / maxMin) * 100}%;background:${COLOR.recovery}"></span></span><span class="muted">${dur(r.minutes)}</span></li>`,
                  )
                  .join("")}</ul>`
              : ""
          }</div>
          ${
            stepDays.length >= 2
              ? barTrendSvg(
                  stepDays.map((d) => ({ date: d.date, value: d.steps ?? 0 })),
                  {
                    color: COLOR.training,
                    format: (v) => `${F(v)} Schritte`,
                    label: "Schritte der letzten 7 Tage",
                    ticks: stepGoal !== null ? [0, stepGoal] : undefined,
                  },
                )
              : ""
          }</div>`
      : `${missing(`${onDay} noch keine Alltagsbewegung erfasst.`, "training", "Zum Training (NEAT)")}${stepGoal !== null ? note(`Dein Tagesschrittziel: ${F(stepGoal)} Schritte`) : ""}`,
    { area: "training" },
  );

  const energyCard = card("energy", "Energieverbrauch", dayMeta, energyHtml(energyDay), { area: "nutrition" });

  // Gewichtstrend
  const weights = data.weightLast30Days.map((w) => ({ date: w.date, value: w.value }));
  const latest = data.weightLast30Days.at(-1) ?? null;
  const thisWeek = D.stats.windowMean(weights, data.date, 7);
  const lastWeek = D.stats.windowMean(weights, D.addDaysIso(data.date, -7), 7);
  const chart = D.energy.weightTrendSeries(weights);
  const composition = [
    { label: "Taille", c: D.dashboard.metricChange(widgets.insights.measurements, O.WAIST_METRIC_ID, data.date) },
    { label: "Körperfett", c: D.dashboard.metricChange(widgets.insights.measurements, P.BODY_FAT_METRIC_ID, data.date) },
  ].filter((x) => x.c !== null);
  const weightCard = card(
    "weight",
    "Gewichtstrend",
    "30 Tage",
    latest
      ? `${row(
          metric(`Zuletzt gemessen am ${D.formatDate(latest.date)}`, F(latest.value, 1), "kg", true),
          thisWeek ? metric(`Mittel der letzten 7 Tage (${thisWeek.count} ${thisWeek.count === 1 ? "Messung" : "Messungen"})`, F(thisWeek.mean, 1), "kg") : "",
          thisWeek && lastWeek ? metric("Änderung zum Mittel der 7 Tage davor", D.formatSigned(thisWeek.mean - lastWeek.mean, 1), "kg") : "",
          goal?.weightKg != null ? metric("Zielgewicht", F(goal.weightKg, 1), "kg") : "",
        )}
        ${
          composition.length
            ? row(
                ...composition.map(({ label, c }) =>
                  metric(
                    c.change !== null && c.since
                      ? `${label} am ${D.formatDate(c.latestDate)} · ${D.formatSigned(c.change, c.decimals)} ${c.unit} seit ${D.formatDate(c.since)}`
                      : `${label} am ${D.formatDate(c.latestDate)}`,
                    F(c.latest, c.decimals),
                    c.unit,
                  ),
                ),
              )
            : ""
        }
        ${
          weights.length >= 2
            ? `${trendSvg(weights, {
                color: COLOR.body,
                decimals: 1,
                label: "Körpergewicht der letzten 30 Tage",
                trend: chart.filter((p) => p.average !== null).map((p) => ({ date: p.date, value: p.average })),
              })}<ul class="legend"><li><span class="swatch" style="background:${COLOR.body}"></span>Messwert</li><li><span class="swatch" style="background:${COLOR.ink}"></span>Gewichtstrend (Mittel der letzten 7 Tage)</li></ul>`
            : ""
        }`
      : missing("In den letzten 30 Tagen kein Gewicht erfasst.", "body", "Gewicht erfassen"),
    { area: "body", wide: true },
  );

  const cards = [
    ...dashboardCards(data, widgets, isToday),
    { id: "training", empty: workouts.length === 0, node: trainingCard },
    { id: "recovery", empty: !today && !hr && !hrv, node: recoveryCard },
    { id: "nutrition", empty: !hasFood, node: nutritionCard },
    { id: "sleep", empty: !data.sleepToday && nights.length < 2, node: sleepCard },
    { id: "neat", empty: !neat, node: neatCard },
    { id: "energy", empty: false, node: energyCard },
    { id: "weight", empty: !latest, node: weightCard },
  ];
  if (week) {
    cards.push({
      id: "week",
      empty: week.observations.length === 0,
      node: card(
        "week",
        "Diese Woche",
        D.trends.formatRange(week.from, week.to),
        `${
          week.observations.length
            ? `<ul class="plain-list insight-list">${week.observations
                .slice(0, 3)
                .map((o) => `<li>${esc(o)}</li>`)
                .join("")}</ul>`
            : `<p class="muted">Noch keine deutlichen Veränderungen gegenüber der Vorwoche – oder zu wenige Werte für einen Vergleich.</p>`
        }
        ${note("Nur aus deinen erfassten Daten, ohne Diagnose oder Empfehlung. Wochenrückblick am PC unter Insights.")}`,
        { wide: true },
      ),
    });
  }
  return cards;
}

// ------------------------------------------------------------------ Ansicht

/** Tageswahl wie am PC (heute oder ein früherer Tag). */
export function overviewDayNav(date, today) {
  const wd = WEEKDAYS[new Date(`${date}T12:00:00`).getDay()];
  return `<section class="card day-nav">
    <button class="btn sm" data-act="ov-shift" data-arg="-1" aria-label="Vortag">‹</button>
    <label class="day-nav__date"><span class="muted small">${date === today ? "Heute" : `${wd} ${D.formatDate(date)}`}</span>
      <input type="date" data-ov="date" value="${esc(date)}" max="${today}" aria-label="Tag"></label>
    <button class="btn sm" data-act="ov-shift" data-arg="1" aria-label="Folgetag" ${date >= today ? "disabled" : ""}>›</button>
  </section>`;
}

/** Alle Karten der Overview in der Anordnung vom PC (ausgeblendete fehlen, leere ans Ende). */
export function overviewCardsHtml(db, catalog, date, today) {
  const { data, week, widgets } = overviewData(db, catalog, date);
  const layout = D.parseLayout(db.settings.get(D.OVERVIEW_LAYOUT_KEY) ?? null);
  const cards = D.arrange(liveCards(data, week, widgets, date === today), layout);
  return `<div class="ov-grid">${cards.map((c) => (c.empty && layout.emptyLast ? `<div class="overview-card--empty">${c.node}</div>` : c.node)).join("")}</div>`;
}

export const overviewActions = {
  "ov-shift": (el) => {
    const S = X.S;
    const today = X.today();
    const d = new Date(`${S.ovDate ?? today}T12:00:00`);
    d.setDate(d.getDate() + Number(el.dataset.arg));
    const pad = (x) => String(x).padStart(2, "0");
    const next = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    S.ovDate = next >= today ? null : next;
    X.rerender();
  },
};

/** Änderungen an Auswahlfeldern der Overview; true = behandelt. */
export function overviewChange(el) {
  const k = el.dataset?.ov;
  if (!k) return false;
  if (k === "date") {
    const v = el.value;
    const today = X.today();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) X.S.ovDate = v >= today ? null : v;
    X.rerender();
    return true;
  }
  if (k === "progress") {
    chooseProgressExercise(el.value);
    X.rerender();
    return true;
  }
  return false;
}
