// LIFESPAN OS Mobil – Trainingsregeln in Insights → Training (1.186.0, wie `TrainingAdviceSection.tsx`
// am PC 1.0.255): Treffer aus dem freigegebenen Regelkatalog (`trainingAdvisor` in pcdomain.js).
// Beobachtung und eigene Werte stehen immer da; Empfehlung, Begründung und Alternative nur mit
// Einwilligung (Settings → Hauptziele). Die App ändert den Plan nicht selbst.

import * as D from "./pcdomain.js";
import { connData } from "./connections.js";
import { activeGym } from "./gymsui.js";
import { heartOn } from "./trainingstats.js";
import * as TR from "./trainingdata.js";
import { S } from "./appbase.js";

const WEIGHT = "00000000-0000-7000-8000-000000000001";
/** Taillenumfang und Bauchumfang (mitgelieferte Messgrößen 4 und 7) */
const WAIST = new Set(["00000000-0000-7000-8000-000000000004", "00000000-0000-7000-8000-000000000007"]);

/** Pläne (auch archivierte) und Tage mit Check-in-Fotos; fehlen die Tabellen in den PC-Daten, bleibt es offen */
function plansAndPhotos() {
  const out = {};
  try {
    if (TR.hasTable(S.catalogRaw, "training_plan")) out.plans = TR.plansOf(S.catalogRaw, S.train, S.catalog.exercises).map((p) => ({ name: p.name, createdAt: p.createdAt ?? "" }));
    if (TR.hasTable(S.catalogRaw, "checkin_photo")) out.photoDates = TR.checkinsOf(S.catalogRaw, S.train).map((c) => c.date);
  } catch {
    /* ohne diese Angaben ruhen TR-PR-002 und der Foto-Teil von TR-FA-007 */
  }
  return out;
}

/** Pulszonen des Tages (eigene vor berechneten); ohne Zonen leer */
function zonesOn(db, t) {
  try {
    return heartOn(db, t).zones.map((z) => z.effective);
  } catch {
    return [];
  }
}

/**
 * Alle Notizfelder (wie `notes_dated` am PC): Tabellen vom PC, darüber die am Handy geänderten Einträge
 * für Mahlzeiten, Ernährungstag, Supplements, Training, Körperwerte, Schlaf, Nickerchen, Recovery und
 * Griffkraft. Für die übrigen Tabellen (z. B. HRT, Labor, Check-ins) gilt der Stand der letzten PC-Datei.
 */
function allNotes(db, input, t) {
  const P = D.painNotes;
  try {
    const flat = (map) => (map ? [...map.values()].flat() : []);
    const tables = {
      ...(db.pc ?? {}),
      sleep_log: db.sleep ?? [],
      sleep_nap: db.naps ?? [],
      recovery_log: db.recovery ?? [],
      grip_strength_measurement: db.grip ?? [],
      meal: db.meals ?? [],
      nutrition_day_entry: flat(db.fastByDate),
      supplement_intake: flat(db.intakesByDate),
      body_measurement: db.body ?? [],
      workout: db.workouts ?? [],
      workout_exercise: flat(db.wexByWorkout),
      workout_set: flat(db.setsByWex),
      exercise: input.exercises,
    };
    return P.noteSourcesFromTables(tables, D.trends.shiftDays(t, -(D.connections.CONN_DAYS - 1)), t);
  } catch {
    return P.painSourcesOf(input);
  }
}

const CALF_ALT = "Wadenmuskulatur von hinten und von der Seite: Musculus gastrocnemius (rot) und Musculus soleus (orange)";

// Ergebnis je Datenstand merken: das laufende Training zeichnet oft neu, die Auswertung geht über das
// ganze Satzprotokoll. Schlüssel = geladene Daten (connData, höchstens eine Minute alt) + Profil + Ziele + Gym.
const memo = new WeakMap();

/** Eingaben wie `loadTrainingAdvice` am PC; `machines` = Maschinen mit Namen (für die Geräte des Gyms). */
export function trainingAdviceData(db, t) {
  const A = D.trainingAdvisor;
  const TP = D.trainingProfile;
  const G = D.goalAdvice;
  const conn = connData(db, t);
  const { input, consent } = conn;
  const profileRaw = db.settings.get(TP.TRAINING_PROFILE_KEY) ?? null;
  const goalsRaw = db.settings.get(G.MAIN_GOALS_KEY) ?? null;
  let gymId = null;
  try {
    gymId = activeGym().gym?.id ?? null;
  } catch {
    gymId = null;
  }
  const sig = `${t}|${profileRaw}|${goalsRaw}|${gymId}`;
  const hit = memo.get(conn);
  if (hit && hit.sig === sig) return hit.data;
  const profile = TP.parseTrainingProfile(profileRaw);
  const dietDetected = D.connDiet.dietState(input).inDiet;
  let gymName = null;
  let gymPatterns = null;
  try {
    const { gym, entries } = activeGym();
    if (gym) {
      gymPatterns = A.gymPatternSet(
        entries.map((e) => e.machine_id),
        input.machines ?? [],
        input.exercises,
      );
      if (gymPatterns) gymName = gym.name;
    }
  } catch {
    gymPatterns = null;
  }
  const result = A.trainingAdvice({
    today: t,
    setLog: input.setLog,
    exercises: input.exercises,
    machines: input.machines,
    focus: input.focus,
    profile,
    mainGoals: G.parseMainGoals(goalsRaw),
    dietDetected,
    gymPatterns,
    // Stufe 2: Schlaf, Schritte, Gewicht, Pulszonen und Schmerz-Angaben aus den Notizen
    sleep: D.trainingAdvisorMore.nightMinutes(input.sleep),
    steps: input.neat.flatMap((n) => (n.steps ? [{ date: n.date, steps: n.steps }] : [])),
    weights: input.measurements.filter((m) => m.metricId === WEIGHT).map((m) => ({ date: m.date, value: m.value })),
    heartZones: zonesOn(db, t),
    pain: D.painNotes.painEntries(allNotes(db, input, t)),
    waistDates: input.measurements.filter((m) => WAIST.has(m.metricId)).map((m) => m.date),
    ...plansAndPhotos(),
  });
  const data = { result, profile, consent, gymName, dietDetected };
  memo.set(conn, { sig, data });
  return data;
}

/**
 * Hinweise direkt im Training bzw. in der Planung (wie `TrainingRuleHints.tsx` am PC): die Treffer, für die
 * die Tabelle in der Spalte „Anzeige“ diesen Ort nennt. Eingeklappt; ohne Treffer leer.
 */
export function trainingHintsHtml(db, t, place, esc) {
  const A = D.trainingAdvisor;
  if (!A?.hitsFor) return "";
  let data;
  try {
    data = trainingAdviceData(db, t);
  } catch {
    return "";
  }
  const hits = A.hitsFor(data.result.hits, place);
  if (!hits.length) return "";
  const consent = data.consent !== null;
  return `<details class="ov-more rule-hints"><summary>Trainingsregeln: ${hits.length === 1 ? "1 Hinweis" : `${hits.length} Hinweise`} ${place === "Training" ? "für dein Training" : "für die Planung"}</summary>
    <div class="advice-list">${hits.map((h) => hitHtml(esc, h, consent)).join("")}</div>
    <p class="muted small">Alle Regeln und dein Trainingsprofil: Insights → Training.</p></details>`;
}

function hitHtml(esc, h, consent) {
  const A = D.trainingAdvisor;
  const C = D.trainingCatalog;
  const r = h.rule;
  const facts = [`Regel ${r.id}`, r.threshold ? `Grenze: ${r.threshold}` : "", r.period ? `Zeitraum: ${r.period}` : "", r.evidence ? `Evidenz: ${r.evidence}` : "", r.masterclassRef ? `Masterclass: ${r.masterclassRef}` : ""].filter(Boolean).join(" · ");
  return `<div class="advice advice--${consent ? "act" : "info"} conn-item"><strong>${esc(r.condition)}</strong>
    <p>${esc(h.basis)}</p>
    ${h.items.length ? `<ul class="ta-items small muted">${h.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
    ${consent && r.recommendation ? `<p class="conn-item__advice">${esc(r.recommendation)}</p>` : ""}
    <details class="ov-more conn-item__more"><summary>${consent ? "Begründung und Quellen" : "Quellen"}</summary>
      ${consent && r.reason ? `<p class="small">${esc(r.reason)}</p>` : ""}
      ${consent && A.CALF_IMAGE_RULES.has(r.id) ? `<img class="training-rules__img" src="icons/wade-anatomie.svg" alt="${CALF_ALT}">` : ""}
      ${consent && r.alternative ? `<p class="small">Alternative: ${esc(r.alternative)}</p>` : ""}
      <p class="muted small">${esc(facts)}</p>
      ${C.ruleSources(r).map((s) => `<p class="muted small ta-source">${esc(C.sourceText(s))}</p>`).join("")}
    </details></div>`;
}

function profileLine(esc, data, t) {
  const TP = D.trainingProfile;
  const A = D.trainingAdvisor;
  const { profile, result, dietDetected, gymName } = data;
  const label = (list, id) => list.find((x) => x.id === id)?.label ?? null;
  const goals = result.goals.map((g) => label(TP.TRAINING_GOALS, g)).filter(Boolean);
  const phase = profile.phase
    ? `${label(TP.TRAINING_PHASES, profile.phase) ?? ""}${profile.phaseSince ? ` seit ${D.formatDate(profile.phaseSince)}` : ""}`
    : dietDetected ? "Diät (aus Gewichtsverlauf und Energiebilanz erkannt)" : null;
  const prios = profile.priorities.map((p) => `${A.muscleGroupLabel(p.group)} (${TP.PRIORITY_LABELS[p.level]})`);
  const limits = profile.limitations.filter((l) => TP.limitationActive(l, t));
  const parts = [
    goals.length ? `Ziel: ${goals.join(", ")}${profile.goal ? "" : " (aus den Hauptzielen)"}` : "Ziel: nicht gewählt",
    phase ? `Phase: ${phase}` : null,
    profile.experience ? label(TP.TRAINING_EXPERIENCE, profile.experience) : null,
    prios.length ? prios.join(", ") : null,
    limits.length ? `Einschränkung: ${limits.map((l) => l.region).join(", ")}` : null,
    gymName ? `Geräte: ${gymName}` : null,
  ].filter(Boolean);
  return `<p class="muted small">${esc(parts.join(" · "))} · <button class="linkbtn small" data-act="ta-profile">Trainingsprofil ändern</button></p>`;
}

/**
 * Abschnitt „Trainingsregeln“ der Karte Training. `esc` = Maskierung der Ansicht, `note` = Hinweis
 * hinter dem Info-Symbol, `head` = Zwischenüberschrift der Karte.
 */
export function trainingAdviceHtml(db, t, { esc, note, head }) {
  const A = D.trainingAdvisor;
  const C = D.trainingCatalog;
  if (!A || !C) return "";
  const data = trainingAdviceData(db, t);
  const { result } = data;
  const consent = data.consent !== null;
  const groups = [];
  for (const h of result.hits) {
    const last = groups[groups.length - 1];
    if (last && last.name === h.rule.group) last.hits.push(h);
    else groups.push({ name: h.rule.group, hits: [h] });
  }
  const guards = C.guardRules();
  const row = (label, value, subs) => `<tr><td>${esc(label)}</td><td class="tnum"><strong>${esc(value)}</strong>${subs.map((x) => `<span class="sub">${esc(x)}</span>`).join("")}</td></tr>`;
  return `${head("Trainingsregeln")}${profileLine(esc, data, t)}
    <table class="data-table insights-table"><tbody>
      ${row("Erkannter Split", result.split ? result.split.name : "nicht eindeutig", consent && result.split?.classification ? [result.split.classification] : [])}
      ${row(
        "Erkanntes Trainingsmodell",
        result.models.length ? result.models.map((m) => m.name).join(" · ") : "nicht eindeutig",
        consent ? result.models.map((m) => `${m.classification ?? ""}${A.MODEL_ADVICE[m.id] ? ` Empfehlung: ${A.MODEL_ADVICE[m.id]}` : ""}`.trim()).filter(Boolean) : [],
      )}
    </tbody></table>
    ${
      result.hits.length
        ? `<p class="muted small">${result.hits.length === 1 ? "1 Regel greift." : `${result.hits.length} Regeln greifen.`}${consent ? "" : " Empfehlung und Begründung gibt es mit Einwilligung unter Settings → Hauptziele."}</p>
          ${groups.map((g) => `<p class="list-head small ta-group"><b>${esc(g.name)}</b> <span class="muted">· ${g.hits.length}</span></p><div class="advice-list">${g.hits.map((h) => hitHtml(esc, h, consent)).join("")}</div>`).join("")}`
        : `<p class="muted small">Keine Regel greift. Die meisten Regeln brauchen drei Einheiten mit der Muskelgruppe bzw. zwei bis vier volle Kalenderwochen.</p>`
    }
    ${
      consent
        ? `<details class="ov-more"><summary>Was die App bewusst nicht empfiehlt (${guards.length})</summary><ul class="ta-guards">${guards
            .map((g) => `<li><strong>${esc(g.condition)}</strong><span class="sub">${esc(g.recommendation)}</span>${g.reason ? `<span class="sub">${esc(g.reason)}</span>` : ""}</li>`)
            .join("")}</ul></details>`
        : ""
    }
    ${note(
      `Trainingsregeln: ${C.TRAINING_CATALOG.rules.length} Regeln aus deiner freigegebenen Tabelle${C.TRAINING_CATALOG.approvedOn ? ` vom ${D.formatDate(C.TRAINING_CATALOG.approvedOn)}` : ""}. Ausgewertet werden Übungsauswahl, Volumen, Frequenz, Intensität, Wiederholungen, Modelle, Pausen, Progression, Aufwärmen, Planung, Cardio, Verletzungen, Deload und Fettabbau. Pausen und Dauer brauchen Satz-Zeitpunkte (entstehen beim Abhaken im laufenden Training). Einen Planwechsel erkennt die App am Anlagedatum der Pläne; Pläne, die innerhalb von 7 Tagen angelegt wurden, gelten als ein Programm. Schmerz liest die App aus allen Notizfeldern mit Tag (Training, Schlaf, Recovery, Körperwerte, Mahlzeiten, Supplements …); das ist keine Diagnose. Harte Sätze = Arbeitssätze, mit RPE-Angabe ab RPE 7; indirekte Sätze zählen anteilig nach den Muskelanteilen der App. Wochenregeln rechnen mit vollen Kalenderwochen vor der laufenden Woche und nur für Muskeln mit Sätzen in den letzten vier Wochen. Empfohlen wird nur, wofür es im aktiven Gym ein Gerät gibt (freie Übungen gelten überall). Muskeln mit der Stufe „bewusst wenig“ im Trainingsprofil melden kein zu geringes Volumen. Die App ändert den Plan nicht selbst. Ersetzt keine ärztliche Beratung.`,
    )}`;
}

/** Alte Vorschläge (1.173.0), die der Katalog nicht abdeckt: Gegenrichtung als Abwechslung. */
export function legacyHits(log, t) {
  const TR = D.trainingRules;
  const covered = D.trainingAdvisor?.LEGACY_COVERED ?? new Set();
  return TR ? TR.trainingRuleHits(log, t).filter((h) => !covered.has(h.rule.id)) : [];
}
