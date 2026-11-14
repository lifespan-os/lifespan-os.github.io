// LIFESPAN OS Mobil – Training → Auswertung (ReviewTab.tsx mit Körperkarte, „unter dem
// Zielvolumen“, Muskelgruppen, Hinweisen), Verlauf (ProgressTab.tsx) und Cardio (CardioTab.tsx)
// wie am PC (1.17.0). Rechnung: pcdomain.js (= src/domain der Desktop-App); Cardio-Einheiten wie
// `cardio_report::sessions`, Herzfrequenzzonen wie `heart::get`.

import * as D from "./pcdomain.js";
import * as P from "./pcdb.js";
import * as O from "./pcoverview.js";
import * as TR from "./trainingdata.js";
import { buildDb, today } from "./diary.js";
import { barTrendSvg, COLOR, esc, trendSvg } from "./pcview.js";
import { focusIndex, heatmapHtml, machinesOf } from "./overview.js";

let X = null;

export function initTrainingStats(ctx) {
  X = ctx;
}

const F = (v, d = 0) => D.formatNumber(v, d);
const fmtDate = (d) => D.formatDate(d);
const C = () => D.trainingCalc;

function seg(items, current, act) {
  return `<div class="segmented" role="radiogroup">${items
    .map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === current}" class="${v === current ? "is-active" : ""}" data-act="${act}" data-arg="${esc(v)}">${esc(l)}</button>`)
    .join("")}</div>`;
}

const metricBox = (label, value, unit = "") =>
  `<div class="metric"><span class="metric__value">${esc(value)}${unit ? `<span class="metric__unit">${esc(unit)}</span>` : ""}</span><span class="metric__label">${esc(label)}</span></div>`;

/** Übungen in der Form der Desktop-App (alles, was Auswertung und Datenbank brauchen). */
export function exerciseModels(db, catalog) {
  const usage = catalog?.usage ?? {};
  return [...db.exercises.values()].map((e) => {
    let profiles = [];
    try {
      profiles = e.resistance_profiles ? JSON.parse(e.resistance_profiles) : [];
    } catch {
      profiles = [];
    }
    return {
      id: e.id,
      name: e.name,
      category: e.category ?? "strength",
      muscleGroup: e.muscle_group ?? null,
      equipment: e.equipment ?? null,
      notes: e.notes ?? null,
      discipline: e.discipline ?? null,
      archived: Boolean(e.archived),
      machineId: e.machine_id ?? null,
      sportId: e.sport_id ?? null,
      resistanceProfiles: Array.isArray(profiles) ? profiles : [],
      cardioKind: e.cardio_kind ?? null,
      cardioKindEffective: P.effectiveKind(e.category ?? "strength", e.cardio_kind ?? null, e.name ?? "", e.equipment ?? null, e.sport_id ? db.sports.get(e.sport_id)?.category ?? null : null),
      usageCount: usage[e.id] ?? 0,
    };
  });
}

function coverageHtml(items, meta, note) {
  const missing = items.filter((i) => !i.ok).length;
  return `<section class="card card--training insights-coverage"><div class="wo-head"><h3>Welche Daten die Auswertung verbessern</h3><span class="tag">${esc(meta)}</span></div>
    <p class="muted small">${missing === 0 ? "Für alle Auswertungen auf dieser Seite liegen genug Einträge vor." : `${missing} ${missing === 1 ? "Angabe" : "Angaben"} würden weitere oder genauere Auswertungen und Hinweise ermöglichen – je regelmäßiger erfasst, desto aussagekräftiger.`}</p>
    <ul class="plain-list coverage-list">${items
      .map(
        (i) => `<li class="${i.ok ? "is-ok" : ""}"><span class="coverage-list__icon" aria-label="${i.ok ? "ausreichend" : "mehr erfassen"}">${i.ok ? "✓" : "+"}</span>
          <div><strong>${esc(i.label)}</strong> <span class="muted small">· ${esc(i.status)}</span>${i.ok ? "" : `<p class="coverage-list__benefit small">${esc(i.benefit)}</p>`}</div></li>`,
      )
      .join("")}</ul>
    <p class="muted small">${esc(note)}</p></section>`;
}

// ------------------------------------------------------------------ Auswertung (ReviewTab.tsx)

function change(percent) {
  if (percent === null || percent === undefined) return "";
  const cls = percent > 0 ? "review-change is-up" : percent < 0 ? "review-change is-down" : "review-change";
  return `<span class="${cls}">${esc(D.formatSigned(percent, 0))} %</span>`;
}

export function viewReviewTab() {
  const S = X.S;
  const db = buildDb();
  const log = O.setLog(db);
  const exercises = exerciseModels(db, S.catalog);
  const machines = machinesOf(S.catalog);
  const focus = focusIndex(S.catalog);
  const r = D.trainingReview.trainingReview(log, exercises, D.trainingReview.REVIEW_SESSIONS);
  if (r.sessions.length === 0) {
    return `<section class="card card--training"><div class="empty-state"><p><strong>Noch keine abgeschlossene Einheit</strong></p><p class="muted small">Sobald du Einheiten abschließt, siehst du hier die Auswertung der letzten sieben.</p></div></section>`;
  }
  const n = r.sessions.length;
  const ids = r.sessions.map((s) => s.workoutId);
  const totalChange = r.previousVolumeKg !== null && r.previousVolumeKg > 0 ? Math.round(((r.totalVolumeKg - r.previousVolumeKg) / r.previousVolumeKg) * 100) : null;
  const maxGroup = Math.max(1, ...r.groups.map((g) => g.volumeKg));
  const labels = D.trainingGroupLabels.reviewGroupLabels(
    r.groups.map((g) => g.group),
    log,
    exercises,
    machines,
    ids,
    focus,
  );
  const labelOf = (g) => labels.get(g)?.label ?? g;
  const maxCell = Math.max(1, ...r.groups.flatMap((g) => g.perSession));
  const fv = (v) => C().formatVolume(v);

  // Körperkarte
  const metric = S.trainReviewMetric ?? "volume";
  const map = D.muscleMapAll.muscleMapForWorkouts(log, exercises, machines, ids, focus);
  const values = metric === "volume" ? map.volumeKg : map.sets;
  const levels = D.muscleLevels(values, "relative");
  const describe = (m) => {
    const level = levels[m];
    const value = metric === "volume" ? fv(map.volumeKg[m]) : `${F(map.sets[m], 1)} ${map.sets[m] === 1 ? "Satz" : "Sätze"}`;
    return `${D.MUSCLE_LABELS[m]} · ${value}${level > 0 ? ` · ${D.LEVEL_NAMES[level - 1]}` : ""}`;
  };
  const sexRaw = db.profile?.sex;
  const sex = sexRaw === "female" || sexRaw === "male" ? sexRaw : null;

  // Unter dem Zielvolumen
  const mapSettings = D.parseMuscleMapSettings(db.settings.get(D.MUSCLE_MAP_SETTINGS_KEY) ?? null);
  const under = D.trainingProgress.underTargetMuscles(log, exercises, machines, mapSettings.targets, today(), focus);
  const first = under.weeks[0];
  const last = under.weeks.at(-1);
  const range = first && last ? `${fmtDate(first.from)} – ${fmtDate(last.to)}` : "";
  const W = D.trainingProgress.UNDER_TARGET_WEEKS;

  const ungrouped = D.trainingCoverage.exercisesWithoutGroup(log, exercises, ids);
  const coverage = D.trainingCoverage.trainingCoverage(r, map, ungrouped);

  return `<section class="card card--training"><div class="wo-head"><h3>Letzte ${n} ${n === 1 ? "Einheit" : "Einheiten"}</h3><span class="tag">${fmtDate(r.sessions[0]?.date ?? "")} – ${fmtDate(r.sessions.at(-1)?.date ?? "")}</span></div>
      <div class="metric-row">${metricBox("Gesamtvolumen", F(r.totalVolumeKg), "kg")}${metricBox("Arbeitssätze", F(r.totalSets))}${metricBox("Ø Volumen je Einheit", F(r.totalVolumeKg / n), "kg")}${metricBox("Muskelgruppen", F(r.groups.length))}</div>
      ${r.previousCount > 0 ? `<p class="muted small">Gegenüber den ${r.previousCount} Einheiten davor (${esc(fv(r.previousVolumeKg ?? 0))}): ${change(totalChange)}${totalChange === null ? "kein Vergleich möglich" : ""}</p>` : ""}
      <ul class="train-list">${[...r.sessions]
        .reverse()
        .map(
          (s) => `<li class="train-row"><span class="train-row__date">${fmtDate(s.date)}</span><span class="train-row__main"><strong>${esc(s.title)}</strong>
            <span class="muted small">${s.exercises} Übungen · ${s.workingSets} Sätze · ${F(s.reps)} Wdh. · ${esc(fv(s.volumeKg))}</span></span></li>`,
        )
        .join("")}</ul>
    </section>
    <section class="card card--training"><div class="wo-head"><h3>Muskel-Körperkarte</h3><span class="tag">letzte ${n} ${n === 1 ? "Einheit" : "Einheiten"}</span></div>
      <div class="muscle-map__tools">${seg([["volume", "Volumen"], ["sets", "Arbeitssätze"]], metric, "train-review-metric")}</div>
      ${heatmapHtml({ levels, describe, sex: sex ?? "male", active: S.trainMuscle ?? null, act: "train-muscle", legend: D.legendLabels("relative") })}
      <p class="muted small">Farbe = Anteil am meisttrainierten Muskel (${metric === "volume" ? "Volumen" : "Arbeitssätze"}). Hauptmuskel = erste Muskelgruppe der Übung bzw. der Maschine, weitere zählen zur Hälfte. Maschinen mit Bewegungsprofil werden nach diesem Profil verteilt, Griffbreite/Fußstellung und Griffstellung verfeinern es.${
        map.setsWithoutMuscle > 0 ? ` ${map.setsWithoutMuscle} ${map.setsWithoutMuscle === 1 ? "Satz" : "Sätze"} ohne zuordenbare Muskelgruppe.` : ""
      }${map.unmapped.length > 0 ? ` Nicht zugeordnet: ${esc(map.unmapped.map((u) => u.term).join(", "))}.` : ""}${sex === null ? " Ohne Geschlecht im Profil wird das männliche Modell gezeigt – Profil am PC in Settings ergänzen." : ""}</p>
    </section>
    <section class="card card--training"><div class="wo-head"><h3>Muskeln unter dem Zielvolumen</h3><span class="tag">letzte ${W} Wochen · ${esc(range)}</span></div>
      ${
        under.kind === "insufficient"
          ? `<p class="muted small">Für den Hinweis braucht es in jeder der letzten ${W} abgeschlossenen Wochen mindestens eine Einheit mit Kraftübungen (vorhanden: ${under.weeksWithTraining}).</p>`
          : under.below.length === 0 && under.untrained.length === 0
            ? `<p class="muted small">Jeder Muskel mit Zielwert lag in mindestens einer der Wochen im Zielbereich.</p>`
            : `${under.below.length ? `<ul class="plain-list insight-list">${under.below.map((m) => `<li><strong>${esc(m.group)} – ${esc(m.label)}:</strong> ${esc(D.trainingProgress.describeUnderTarget(m))}</li>`).join("")}</ul>` : ""}
               ${under.untrained.length ? `<p class="muted small">In diesen Wochen gar nicht trainiert: ${esc(under.untrained.map((m) => m.label).join(", "))}.</p>` : ""}`
      }
      <p class="muted small">Gezählt werden gewichtete Arbeitssätze je Woche (Montag–Sonntag) wie in der Muskel-Körperkarte. Zielvolumen = Beginn der Stufe „Aufbau“ deiner Zielwerte je Muskel (Overview → Muskel-Körperkarte → Individuell; ohne eigene Werte die Ausgangswerte). Ein Muskel erscheint nur, wenn er in jeder der Wochen darunter lag. Das ist ein Hinweis, keine Bewertung.</p>
    </section>
    <section class="card card--training"><div class="wo-head"><h3>Trainingsvolumen je Muskelgruppe</h3><span class="tag">Kraftübungen, ohne Aufwärmsätze</span></div>
      ${
        r.groups.length === 0
          ? `<p class="muted small">In diesen Einheiten gab es keine Kraftübungen mit Sätzen.</p>`
          : `<ul class="review-bars" aria-label="Volumen je Muskelgruppe">${r.groups
              .map(
                (g) => `<li><div class="review-bars__head"><strong>${esc(labelOf(g.group))}</strong><span class="review-bars__value">${esc(fv(g.volumeKg))} · ${g.sharePercent} % ${change(g.changePercent)}</span></div>
                <span class="review-bars__track" role="img" aria-label="${esc(`${labelOf(g.group)}: ${fv(g.volumeKg)}, ${g.sharePercent} % des Volumens`)}"><span class="review-bars__fill" style="width:${(g.volumeKg / maxGroup) * 100}%;background:${COLOR.training}"></span></span>
                <span class="muted small">${g.workingSets} ${g.workingSets === 1 ? "Satz" : "Sätze"} · ${F(g.reps)} Wdh. · in ${g.sessions} von ${n} Einheiten${g.previousVolumeKg !== null ? ` · davor ${esc(fv(g.previousVolumeKg))}` : ""}${labels.get(g.group)?.detail ? ` · ${esc(labels.get(g.group).detail)}` : ""}</span>
                ${g.group === D.trainingVolume.NO_MUSCLE_GROUP ? ungroupedHtml(ungrouped, exercises, machines) : ""}</li>`,
              )
              .join("")}</ul>
            <h4>Volumen je Einheit</h4>
            <div class="table-scroll"><table class="data-table review-matrix"><thead><tr><th>Muskelgruppe</th>${r.sessions.map((s) => `<th class="num" title="${esc(s.title)}">${esc(D.formatDate(s.date).slice(0, 6))}</th>`).join("")}<th class="num">Summe</th></tr></thead>
              <tbody>${r.groups
                .map(
                  (g) => `<tr><td>${esc(labelOf(g.group))}</td>${g.perSession
                    .map((v) => `<td class="num review-matrix__cell" ${v > 0 ? `style="background:rgba(43,89,195,${(0.08 + (v / maxCell) * 0.32).toFixed(3)})"` : ""}>${v > 0 ? F(v) : "–"}</td>`)
                    .join("")}<td class="num"><strong>${F(g.volumeKg)}</strong></td></tr>`,
                )
                .join("")}</tbody></table></div>
            <p class="muted small">Volumen = Wiederholungen × kg der Arbeitssätze (kg). Die Muskelgruppe stammt aus der Übungsdatenbank; Übungen ohne Angabe stehen unter „Ohne Muskelgruppe“ und lassen sich dort direkt zuweisen. Gehören mehrere Zeilen zur selben Körperregion, steht dort der Muskelteil mit dem meisten Volumen laut Fokusprofil (Master-Editor), sofern er mindestens die Hälfte ausmacht. Die Veränderung vergleicht mit den ${D.trainingReview.REVIEW_SESSIONS} Einheiten davor.</p>`
      }
    </section>
    ${coverageHtml(coverage, `letzte ${n} ${n === 1 ? "Einheit" : "Einheiten"}`, "Gezählt werden nur abgeschlossene Einheiten und Arbeitssätze. Die Hinweise bewerten das Training nicht.")}`;
}

function ungroupedHtml(ungrouped, exercises, machines) {
  if (!ungrouped.length) return "";
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const machineById = new Map(machines.map((m) => [m.id, m]));
  const groups = [...new Set(exercises.flatMap((e) => (e.muscleGroup?.trim() ? [e.muscleGroup.trim()] : [])))].sort((a, b) => a.localeCompare(b, "de"));
  const values = X.S.trainUngrouped ?? {};
  return `<div class="ungrouped"><datalist id="ungrouped-groups">${groups.map((g) => `<option value="${esc(g)}"></option>`).join("")}</datalist>
    <p class="muted small">Diese Übungen haben in der Übungsdatenbank keine Muskelgruppe. Hier zuweisen – dann zählt ihr Volumen bei der Muskelgruppe:</p>
    <ul class="plain-list">${ungrouped
      .map((item) => {
        const e = byId.get(item.id);
        const m = e?.machineId ? machineById.get(e.machineId) : null;
        const suggestion = m ? m.muscleGroups.join(", ") : "";
        return `<li class="ungrouped__row"><span><strong>${esc(item.name)}</strong> <span class="muted small">${item.sets} ${item.sets === 1 ? "Satz" : "Sätze"}${m ? ` · Maschine „${esc(m.displayName ?? m.name ?? "")}“` : " · freie Übung"}</span></span>
          ${e ? `<span class="ungrouped__form"><input type="text" list="ungrouped-groups" placeholder="z. B. Brust, Trizeps" aria-label="Muskelgruppe für „${esc(item.name)}“" data-ungrouped="${esc(item.id)}" value="${esc(values[item.id] ?? suggestion)}"><button class="btn sm" data-act="train-ungrouped-save" data-arg="${esc(item.id)}">Zuweisen</button></span>` : ""}</li>`;
      })
      .join("")}</ul></div>`;
}

// ------------------------------------------------------------------ Verlauf (ProgressTab.tsx)

const METRIC_LABEL = {
  weight: "Höchstes Gewicht je Einheit",
  e1rm: "Geschätztes 1RM je Einheit (Epley)",
  volume: "Volumen je Einheit",
  reps: "Wiederholungen je Einheit",
  distance: "Strecke je Einheit",
};

export function viewProgressTab() {
  const S = X.S;
  const db = buildDb();
  const log = O.setLog(db);
  const exercises = exerciseModels(db, S.catalog);
  const byExercise = new Map();
  for (const s of log) {
    if (!byExercise.has(s.exerciseId)) byExercise.set(s.exerciseId, []);
    byExercise.get(s.exerciseId).push(s);
  }
  const used = exercises.filter((e) => (byExercise.get(e.id) ?? []).some((s) => !s.isWarmup)).sort((a, b) => a.name.localeCompare(b.name, "de"));
  if (!used.length) {
    return `<section class="card card--training"><div class="empty-state"><p><strong>Noch kein Verlauf</strong></p><p class="muted small">Sobald du eine Einheit mit Arbeitssätzen abgeschlossen hast, siehst du hier den Verlauf und deine Bestleistungen je Übung.</p></div></section>`;
  }
  const selected = used.find((e) => e.id === S.trainProgEx) ?? used[0];
  const elog = byExercise.get(selected.id) ?? [];
  const sessions = C().summarizeSessions(elog);
  const records = C().personalRecords(elog, selected.category);
  const isCardio = selected.category === "cardio";
  const hasWeight = sessions.some((s) => s.maxWeightKg !== null);
  const available = isCardio ? ["distance"] : hasWeight ? ["weight", "e1rm", "volume", "reps"] : ["reps"];
  const metric = available.includes(S.trainProgMetric) ? S.trainProgMetric : available[0];
  const e1rm = new Map(D.trainingVolume.e1rmBySession(elog).map((p) => [p.workoutId, p.value]));
  const best1RM = isCardio ? null : D.trainingVolume.bestE1RM(elog);
  const valueOf = (s) => ({ weight: s.maxWeightKg, e1rm: e1rm.get(s.workoutId) ?? null, volume: s.volumeKg, reps: s.totalReps, distance: s.totalDistanceM / 1000 })[metric];
  const chartData = sessions.map((s) => ({ date: s.date, value: valueOf(s) })).filter((p) => p.value !== null && p.value !== undefined);
  const overview = used.map((e) => {
    const entries = byExercise.get(e.id) ?? [];
    const recs = C().personalRecords(entries, e.category);
    const mainKind = e.category === "cardio" ? "longestDistance" : "heaviest";
    return { exercise: e, main: recs.find((r) => r.kind === mainKind) ?? recs[0], sessions: C().summarizeSessions(entries).length };
  });
  const muscleWeeks = D.weeklyMuscleSets(log, exercises, today());
  const decimals = metric === "distance" ? 2 : metric === "reps" || metric === "volume" ? 0 : 1;
  return `<section class="card card--training" id="progress-title"><h3>Verlauf je Übung</h3>
      <div class="field"><label for="progress-exercise">Übung</label><select id="progress-exercise" data-schange="progEx">${used.map((e) => `<option value="${esc(e.id)}" ${e.id === selected.id ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select></div>
      ${available.length > 1 ? `<div class="field"><label for="progress-metric">Anzeige</label><select id="progress-metric" data-schange="progMetric">${available.map((m) => `<option value="${m}" ${m === metric ? "selected" : ""}>${esc(METRIC_LABEL[m])}</option>`).join("")}</select></div>` : ""}
      ${chartData.length ? trendSvg(chartData, { color: COLOR.training, decimals, label: `Verlauf ${selected.name}: ${METRIC_LABEL[metric]}` }) : ""}
      <p class="muted small">Nur Arbeitssätze abgeschlossener Einheiten. Volumen = Wiederholungen × kg; Sätze ohne Zusatzgewicht zählen 0 kg. Einzige Schätzung ist das 1RM (Epley: Gewicht × (1 + Wdh. ÷ 30), nur aus Sätzen mit 1–12 Wiederholungen).</p>
      <h4>🏆 Bestleistungen</h4>
      ${records.length ? `<dl class="record-list">${records.map((r) => `<div class="record-list__item"><dt>${esc(r.label)}</dt><dd><strong>${esc(r.display)}</strong><span class="muted small"> am ${fmtDate(r.date)}</span></dd></div>`).join("")}</dl>` : `<p class="muted small">Noch keine Messwerte.</p>`}
      ${best1RM ? `<p class="small">Geschätztes 1RM (Epley): <strong>${esc(C().formatKg(best1RM.value))}</strong><span class="muted"> aus ${esc(C().formatKg(best1RM.weightKg))} × ${best1RM.reps} am ${fmtDate(best1RM.date)}</span></p>` : ""}
      <h4>Einheiten</h4>
      <ul class="train-list">${[...sessions]
        .reverse()
        .map(
          (s) => `<li class="train-row"><span class="train-row__date">${fmtDate(s.date)}<span class="muted small">${esc(s.title)}</span></span><span class="train-row__main"><span class="small">${s.workingSets} Arbeitssätze · ${s.totalReps} Wdh.</span>
            <span class="muted small">${
              isCardio
                ? `${F(s.totalDistanceM / 1000, 2)} km · ${F(s.totalDurationSeconds / 60)} min`
                : `Schwerster Satz ${s.maxWeightKg !== null ? `${esc(C().formatKg(s.maxWeightKg))} × ${s.repsAtMaxWeight ?? "–"}` : "–"} · ${s.volumeKg > 0 ? esc(C().formatVolume(s.volumeKg)) : "–"}`
            }</span></span></li>`,
        )
        .join("")}</ul>
    </section>
    ${
      muscleWeeks.rows.length
        ? `<section class="card card--training"><div class="wo-head"><h3>Arbeitssätze je Muskelgruppe</h3><span class="tag">letzte 4 Wochen</span></div>
          <div class="table-scroll"><table class="data-table"><thead><tr><th>Muskelgruppe</th>${muscleWeeks.weeks.map((w, i) => `<th class="num" title="${esc(`${fmtDate(w.start)} – ${fmtDate(w.end)}`)}">${esc(i === muscleWeeks.weeks.length - 1 ? `${w.label} (laufend)` : w.label)}</th>`).join("")}</tr></thead>
          <tbody>${muscleWeeks.rows.map((r) => `<tr><td>${esc(r.group)}</td>${r.sets.map((n, i) => `<td class="num">${n > 0 ? `${n}${(r.volumeKg[i] ?? 0) > 0 ? `<span class="sub">${esc(C().formatVolume(r.volumeKg[i] ?? 0))}</span>` : ""}` : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
          <p class="muted small">Arbeitssätze von Kraftübungen je Kalenderwoche (Montag–Sonntag), darunter das Volumen. Die Muskelgruppe kommt aus der Übungsdatenbank (Reiter „Datenbank“).</p></section>`
        : ""
    }
    <section class="card"><div class="wo-head"><h3>Bestleistungen aller Übungen</h3><span class="tag">gemessen, nicht geschätzt</span></div>
      <ul class="train-list">${overview
        .map(
          (o) => `<li class="train-row"><span class="train-row__main"><strong>${esc(o.exercise.name)}</strong><span class="small">${o.main ? `<span class="muted">${esc(o.main.label)}: </span>${esc(o.main.display)} · ${fmtDate(o.main.date)}` : "–"}</span>
            <span class="muted small">${o.sessions} ${o.sessions === 1 ? "Einheit" : "Einheiten"}</span></span><button class="linkbtn" data-act="train-prog-pick" data-arg="${esc(o.exercise.id)}">Verlauf</button></li>`,
        )
        .join("")}</ul></section>`;
}

// ------------------------------------------------------------------ Cardio (CardioTab.tsx)

const RESTING_HR_METRIC_ID = "00000000-0000-7000-8000-000000000018";

/** Herzfrequenzzonen eines Tages wie `heart::get` (eigene Zonen vor berechneten). */
export function heartOn(db, date) {
  const profile = db.profile ?? null;
  const age = profile ? P.ageOn(profile, date) : null;
  const sex = profile?.sex ?? null;
  const a = age ?? 0;
  const calculated = sex === "male" && age !== null ? Math.round(208 - 0.7 * a) : sex === "female" && age !== null ? Math.round(206 - 0.88 * a) : null;
  const maxCustom = Number.parseInt(String(db.settings.get("heart.max") ?? "").trim(), 10);
  const maxEffective = Number.isFinite(maxCustom) ? maxCustom : calculated;
  const resting = P.latestMeasurement(db, RESTING_HR_METRIC_ID, date);
  let computed = null;
  if (maxEffective !== null && resting) {
    const r = Math.round(resting.value);
    if (r < maxEffective) {
      const reserve = maxEffective - r;
      computed = D.heart.ZONE_SHARES.map(([lo, hi]) => ({ from: Math.round(r + lo * reserve), to: Math.round(r + hi * reserve) }));
    }
  }
  let custom = [null, null, null, null, null];
  try {
    const list = JSON.parse(db.settings.get("heart.zones") ?? "null");
    if (Array.isArray(list)) custom = [0, 1, 2, 3, 4].map((i) => list[i] ?? null);
  } catch {
    /* ohne eigene Zonen */
  }
  return { zones: [0, 1, 2, 3, 4].map((i) => ({ zone: i + 1, calculated: computed?.[i] ?? null, custom: custom[i], effective: custom[i] ?? computed?.[i] ?? null })) };
}

function zoneOf(hr, zones) {
  if (hr < zones[0].from) return null;
  for (let i = 1; i < 5; i++) if (hr < zones[i].from) return i - 1;
  return 4;
}

/** Cardio-Einheiten mit Kennzahlen wie `cardio_report::sessions` (älteste zuerst). */
export function cardioSessionsFull(db) {
  const out = [];
  const done = db.workouts
    .filter((w) => (w.status ?? "done") === "done")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")) || String(a.created_at).localeCompare(String(b.created_at))));
  const profile = db.profile ?? null;
  for (const w of done) {
    const o = P.workoutOf(db, w);
    if (!o.exercises.some((e) => e.exerciseCategory === "cardio")) continue;
    const weight = P.stepEnergy(db, w.date).weightKg;
    const person = weight !== null && weight !== undefined ? { weightKg: weight, sex: profile?.sex ?? null, age: profile ? P.ageOn(profile, w.date) : null } : null;
    const h = heartOn(db, w.date);
    const zones = h.zones.every((z) => z.effective) ? h.zones.map((z) => z.effective) : null;
    const sessionRpe = w.perceived_exertion ?? null;
    for (const ex of o.exercises) {
      if (!ex.cardioKind) continue;
      const s = { workoutId: w.id, date: w.date, title: w.title, exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, kind: ex.cardioKind, blocks: ex.sets.length, durationSeconds: 0, distanceM: 0, hrAvg: null, hrMax: null, powerAvg: null, powerMax: null, kcal: null, methods: [], deviceKcal: null, zoneSeconds: [0, 0, 0, 0, 0], belowZoneSeconds: 0, withoutZoneSeconds: 0 };
      let hrSum = 0;
      let hrTime = 0;
      let pSum = 0;
      let pTime = 0;
      let kcal = 0;
      let anyKcal = false;
      for (const set of ex.sets) {
        const sec = set.duration_seconds ?? 0;
        s.durationSeconds += sec;
        s.distanceM += set.distance_m ?? 0;
        if (set.hr_avg !== null && set.hr_avg !== undefined && sec > 0) {
          hrSum += set.hr_avg * sec;
          hrTime += sec;
        }
        const bmax = set.hr_max ?? set.hr_avg ?? null;
        if (bmax !== null) s.hrMax = s.hrMax === null ? bmax : Math.max(s.hrMax, bmax);
        if (set.power_w !== null && set.power_w !== undefined && sec > 0) {
          pSum += set.power_w * sec;
          pTime += sec;
        }
        const pmax = set.power_max_w ?? set.power_w ?? null;
        if (pmax !== null) s.powerMax = s.powerMax === null ? pmax : Math.max(s.powerMax, pmax);
        if (set.device_kcal !== null && set.device_kcal !== undefined) s.deviceKcal = (s.deviceKcal ?? 0) + set.device_kcal;
        if (set.hr_avg !== null && set.hr_avg !== undefined && zones) {
          const z = zoneOf(set.hr_avg, zones);
          if (z === null) s.belowZoneSeconds += sec;
          else s.zoneSeconds[z] += sec;
        } else s.withoutZoneSeconds += sec;
        if (person) {
          const e = P.blockEnergy(ex.cardioKind, set, sessionRpe, person);
          if (e) {
            kcal += e.kcal;
            anyKcal = true;
            if (!s.methods.includes(e.method)) s.methods.push(e.method);
          }
        }
      }
      if (hrTime > 0) s.hrAvg = hrSum / hrTime;
      if (pTime > 0) s.powerAvg = pSum / pTime;
      if (anyKcal) s.kcal = P.rround(kcal);
      out.push(s);
    }
  }
  return out;
}

const PERIODS = [
  ["4", "Letzte 4 Wochen"],
  ["12", "Letzte 12 Wochen"],
  ["26", "Letzte 26 Wochen"],
  ["52", "Letzte 52 Wochen"],
  ["all", "Alles"],
];

function hoursMinutes(seconds) {
  const min = Math.round(seconds / 60);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`;
}
const percent = (v) => (v === null || v === undefined ? "–" : `${F(v * 100)} %`);

export function viewCardioTab() {
  const S = X.S;
  const day0 = today();
  const db = buildDb();
  const all = cardioSessionsFull(db);
  const heart = heartOn(db, day0);
  if (!all.length) {
    return `<section class="card card--training"><div class="empty-state"><p><strong>Noch keine Cardio-Einheiten</strong></p><p class="muted small">Erfasse Cardio unter „Einheiten“ mit <strong>Cardio erfassen</strong> oder als Cardio-Übung in einer Einheit. Hier erscheinen dann Wochenminuten, Zeit in den Trainingszonen, dein Fitness-Trend und Bestwerte.</p></div></section>`;
  }
  const R = D.cardioReport;
  const period = S.trainCardioPeriod ?? "12";
  const kind = S.trainCardioKind ?? "";
  const weeks = period === "all" ? null : Number(period);
  const shown = R.filterSessions(all, R.periodStart(day0, weeks), kind === "" ? null : kind);
  const t = R.totals(shown);
  const perWeek = R.weeklyMinutes(shown, day0, Math.min(weeks ?? 12, 26));
  const avgWeek = perWeek.length ? perWeek.reduce((a, w) => a + w.value, 0) / perWeek.length : 0;
  const z = R.zoneTotals(shown);
  const kinds = R.kindsIn(all);
  const autoTrend = R.bestTrendKind(shown);
  const trendKind = S.trainCardioTrend ?? "";
  const tk = trendKind === "" ? (kind === "" ? autoTrend : kind) : trendKind;
  const trend = tk ? R.efficiencyTrend(shown, tk) : null;
  const bestRows = R.bests(shown);
  const zoneMax = Math.max(1, ...z.zones, z.below);
  const label = (k) => D.cardio.cardioKindLabel(k);
  const tile = (value, lbl) => `<div class="cardio-tile"><span class="cardio-tile__value">${esc(value)}</span><span class="cardio-tile__label">${esc(lbl)}</span></div>`;
  return `<section class="card card--training"><h3>Cardio</h3>
      <div class="field"><label for="cardio-period">Zeitraum</label><select id="cardio-period" data-schange="cardioPeriod">${PERIODS.map(([v, l]) => `<option value="${v}" ${v === period ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label for="cardio-kind">Cardio-Art</label><select id="cardio-kind" data-schange="cardioKind"><option value="">Alle Arten</option>${kinds.map((k) => `<option value="${esc(k)}" ${k === kind ? "selected" : ""}>${esc(label(k))}</option>`).join("")}</select></div>
      <div class="cardio-tiles">${tile(String(t.sessions), "Einheiten")}${tile(hoursMinutes(t.seconds), "Dauer")}${tile(`${F(t.meters / 1000, 1)} km`, "Strecke")}${tile(`${F(t.kcal)} kcal`, `Mehrverbrauch${t.withoutKcal > 0 ? ` (${t.withoutKcal} ohne kcal – Gewicht fehlt)` : ""}`)}${tile(`${F(avgWeek)} min`, `Ø je Woche (WHO: ${R.WHO_MIN_MINUTES}–${R.WHO_MAX_MINUTES} min)`)}</div>
    </section>
    <section class="card card--training"><div class="wo-head"><h3>Minuten je Woche</h3><span class="tag">letzte ${perWeek.length} Wochen</span></div>
      ${barTrendSvg(perWeek, { color: COLOR.training, format: (v) => `${F(v)} min`, height: 200, ticks: [0, R.WHO_MIN_MINUTES, R.WHO_MAX_MINUTES], tickFormat: (v) => `${v}`, label: "Cardio-Minuten je Woche" })}
      <p class="muted small">Die Hilfslinien bei ${R.WHO_MIN_MINUTES} und ${R.WHO_MAX_MINUTES} Minuten zeigen die WHO-Empfehlung für moderate Ausdauer je Woche (bei intensiver Ausdauer reicht die Hälfte).</p>
    </section>
    <section class="card card--training"><div class="wo-head"><h3>Zeit in Trainingszonen</h3><span class="tag">locker (bis Zone 2) ${percent(z.easyShare)} · intensiv (Zone 3–5) ${percent(z.hardShare)}</span></div>
      <ul class="zone-list">${D.heart.ZONE_TITLES.map((title, i) => {
        const sec = z.zones[i] ?? 0;
        const share = z.withHr > 0 ? sec / z.withHr : null;
        return `<li><div class="zone-list__head"><strong class="small">${esc(title)}</strong><span class="muted small">Puls heute ${esc(D.heart.formatZone(heart.zones[i]?.effective) || "–")}</span></div>
          <div class="zone-list__bar"><span class="cardio-bar"><span class="cardio-bar__fill cardio-bar__fill--z${i + 1}" style="width:${(sec / zoneMax) * 100}%"></span></span> <span class="small">${esc(hoursMinutes(sec))}</span> <span class="muted small">${percent(share)}</span></div></li>`;
      }).join("")}${
        z.below > 0
          ? `<li><div class="zone-list__head"><strong class="small">Unter Zone 1</strong></div><div class="zone-list__bar"><span class="cardio-bar"><span class="cardio-bar__fill" style="width:${(z.below / zoneMax) * 100}%"></span></span> <span class="small">${esc(hoursMinutes(z.below))}</span> <span class="muted small">${percent(z.withHr > 0 ? z.below / z.withHr : null)}</span></div></li>`
          : ""
      }</ul>
      <p class="muted small">Jeder Block zählt mit seiner ganzen Dauer in der Zone seines Ø Pulses (eine Näherung). Grundlage sind die Zonen aus Body &amp; Longevity → Vitalwerte zum Tag der Einheit.${z.without > 0 ? ` ${esc(hoursMinutes(z.without))} ohne Ø Puls bzw. ohne Zonen sind nicht enthalten.` : ""}${heart.zones.every((x) => x.effective === null) ? " Noch keine Zonen berechenbar – dafür fehlen max. Herzfrequenz oder Ruhepuls." : ""}</p>
    </section>
    <section class="card card--training"><div class="wo-head"><h3>Fitness-Trend</h3></div>
      <div class="field"><label for="cardio-trend-kind">Art</label><select id="cardio-trend-kind" data-schange="cardioTrend"><option value="">Automatisch${tk ? ` (${esc(label(tk))})` : ""}</option>${kinds.map((k) => `<option value="${esc(k)}" ${k === trendKind ? "selected" : ""}>${esc(label(k))}</option>`).join("")}</select></div>
      ${
        trend && trend.points.length >= 2
          ? `${trendSvg(trend.points, { color: COLOR.training, decimals: 2, height: 200, label: `Fitness-Trend ${tk ? label(tk) : ""}: ${trend.unit}` })}
            <p class="muted small">${esc(trend.unit)} je Einheit: Tempo bzw. Leistung geteilt durch den Ø Puls. Steigt der Wert, bist du bei gleichem Puls schneller bzw. stärker – ein Zeichen besserer Ausdauer. Vergleichbar sind vor allem ähnliche Einheiten (z. B. lockere Läufe).</p>`
          : `<p class="muted">Für den Trend braucht es mindestens zwei Einheiten dieser Art mit Ø Puls und Strecke (bzw. Ø Watt bei Geräten).</p>`
      }
    </section>
    <section class="card card--training"><div class="wo-head"><h3>Bestwerte</h3><span class="tag">im gewählten Zeitraum</span></div>
      ${bestRows.length ? `<ul class="train-list">${bestRows.map((r) => `<li class="train-row"><span class="train-row__main"><span>${esc(r.label)}</span><strong>${esc(r.value)}</strong><span class="muted small">${esc(r.exerciseName)} · ${fmtDate(r.date)}</span></span></li>`).join("")}</ul>` : `<p class="muted">Noch keine Bestwerte.</p>`}
    </section>
    <section class="card card--training"><div class="wo-head"><h3>Cardio-Einheiten</h3><span class="tag">${shown.length} Einträge</span></div>
      ${
        shown.length
          ? `<ul class="train-list">${[...shown]
              .reverse()
              .map(
                (s) => `<li class="train-row"><span class="train-row__date">${fmtDate(s.date)}</span><span class="train-row__main"><strong>${esc(s.exerciseName)}</strong> <span class="muted small">· ${esc(label(s.kind))}</span>
                  <span class="small">${esc(D.cardio.formatDuration(s.durationSeconds) || "–")} · ${s.distanceM > 0 ? `${F(s.distanceM / 1000, 2)} km` : "–"} · ${esc(D.cardio.cardioPace(s.kind, s.durationSeconds, s.distanceM) ?? "–")}</span>
                  <span class="muted small">Ø Puls ${s.hrAvg !== null ? F(s.hrAvg) : "–"} · Ø Watt ${s.powerAvg !== null ? F(s.powerAvg) : "–"} · ${s.kcal !== null ? `${F(s.kcal)} kcal` : "– kcal"}${s.deviceKcal !== null ? ` (Gerät ${F(s.deviceKcal)})` : ""}</span>
                  <span class="muted small">${esc(s.methods.map(D.cardio.cardioMethodLabel).join(", ") || "–")}</span></span></li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">Keine Einträge im gewählten Zeitraum.</p>`
      }
    </section>`;
}

// ------------------------------------------------------------------ Aktionen

export const statsActions = {
  "train-review-metric": (el) => {
    X.S.trainReviewMetric = el.dataset.arg;
    X.rerender();
  },
  "train-muscle": (el) => {
    X.S.trainMuscle = X.S.trainMuscle === el.dataset.arg ? null : el.dataset.arg;
    X.rerender();
  },
  "train-prog-pick": (el) => {
    X.S.trainProgEx = el.dataset.arg;
    X.S.trainProgMetric = null;
    X.rerender();
    requestAnimationFrame(() => document.getElementById("progress-title")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "train-ungrouped-save": async (el) => {
    const S = X.S;
    const id = el.dataset.arg;
    const input = document.querySelector(`[data-ungrouped="${CSS.escape(id)}"]`);
    const value = (input?.value ?? "").trim();
    const row = S.catalog.exercises.find((e) => e.id === id) ?? (S.localExercises ?? []).find((e) => e.id === id);
    if (!row || value === "") {
      X.setNotice("error", "Bitte eine Muskelgruppe eintragen.");
      return X.rerender();
    }
    try {
      await X.saveExerciseRow(row, { muscleGroup: value });
      X.setNotice("ok", `„${row.name}“: Muskelgruppe „${value}“ gespeichert.`);
      X.toast(`„${row.name}“: Muskelgruppe „${value}“ gespeichert.`);
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
};

export function statsChange(el) {
  const S = X.S;
  const k = el.dataset.schange;
  if (!k) return false;
  if (k === "progEx") {
    S.trainProgEx = el.value;
    S.trainProgMetric = null;
  } else if (k === "progMetric") S.trainProgMetric = el.value;
  else if (k === "cardioPeriod") S.trainCardioPeriod = el.value;
  else if (k === "cardioKind") S.trainCardioKind = el.value;
  else if (k === "cardioTrend") S.trainCardioTrend = el.value;
  X.rerender();
  return true;
}

void TR;
