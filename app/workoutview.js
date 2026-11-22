// LIFESPAN OS Mobil – Laufendes Training, Übungsauswahl, Maschine, Abschluss und Detail einer Einheit (aus app.js, 1.74.0).
import * as C from "./core.js";
import { icon } from "./nav.js";
import { focusInfo, machineNamesOf } from "./focusinfo.js";
import * as PDOM from "./pcdomain.js";
import { buildDb, today as todayIso } from "./diary.js";
import * as MI from "./machineimages.js";
import { workoutBodyMapHtml } from "./trainingstats.js";
import * as HX from "./hyrox.js";
import * as GY from "./gymsui.js";
import { esc, exById, fmtDate, fmtSec, go, header, machineById, S, saveNow, saveSoon, toast } from "./appbase.js";
import { wakeLock } from "./resttimer.js";
import { effectiveKind } from "./pcdb.js";
import { viewHome } from "./homeview.js";

export function exLabel(ex, machines) {
  const m = ex?.machine_id ? machines.get(ex.machine_id) : null;
  const nr = m?.own_number || m?.gym_number || ex?.equipment || null;
  return { name: ex?.name ?? "Unbekannte Übung", nr, m };
}

export function lastText(last, cardio) {
  if (!last?.sets?.length) return "";
  const parts = last.sets
    .filter((s) => !s.isWarmup)
    .map((s) =>
      cardio
        ? [s.durationSeconds ? `${Math.round(s.durationSeconds / 60)} min` : "", s.distanceM ? `${C.fmtNum(s.distanceM / 1000)} km` : ""].filter(Boolean).join(" ")
        : `${s.reps ?? "–"}×${s.weightKg !== null ? C.fmtNum(s.weightKg) : "–"}${C.usedProfiles(s.rp).length ? ` (${C.describeProfiles(s.rp)})` : ""}`,
    );
  return `<p class="last">Letztes Mal (${fmtDate(last.date)}): <b>${esc(parts.join(" · ") || "–")}</b>${cardio ? "" : " kg"}</p>`;
}

export function viewWorkout() {
  const w = S.active;
  if (!w) return viewHome();
  const exs = exById();
  const machines = machineById();
  const edit = !!w.editOf;
  const sub = w.backfill
    ? `${fmtDate(w.date)} · nachtragen`
    : edit
    ? `${fmtDate(w.date)} · bearbeiten`
    : `${fmtDate(w.date)} · seit ${C.localTime(new Date(w.startedAt))} Uhr`;
  return `${header(w.title, { back: "home", sub })}<main class="wrap">
    <div class="wo-head"><span class="muted small">${w.exercises.length} Übungen · ${C.fmtNum(C.volumeKg(w), 0)} kg Volumen</span>${
      edit ? `<span class="tag">${w.backfill ? "Nachtragen" : "Bearbeitung"}</span>` : `<span class="clock" data-clock>${fmtSec((Date.now() - new Date(w.startedAt)) / 1000)}</span>`
    }</div>
    ${GY.workoutGymSelectHtml(w)}
    ${w.competition ? competitionCard(w.competition) : ""}
    ${w.exercises.map((we, i) => exerciseCard(we, i, exs, machines)).join("")}
    <button class="btn block" data-go="picker">+ Übung oder Maschine hinzufügen</button>
    ${workoutBodyMapHtml(w, C.allExercises(S.catalog, S.localExercises))}
    ${w.competition || !isHyroxWorkout(w) ? "" : `<button class="btn ghost block" data-act="comp-add">HYROX-Wettkampf-Angaben hinzufügen</button>`}
    <button class="btn danger block" data-act="discard">${w.backfill ? "Verwerfen" : edit ? "Änderungen verwerfen" : "Training verwerfen"}</button>
  </main>
  <div class="bottom"><div class="inner"><button class="btn primary" data-go="finish">${w.backfill ? "Weiter zum Speichern" : edit ? "Änderungen speichern" : "Training beenden"}</button></div></div>`;
}

/**
 * Nur die aktuelle Übung ist aufgeklappt (1.4.1): die erste mit offenen Sätzen bzw. die zuletzt
 * hinzugefügte; von Hand auf- oder zugeklappte Übungen bleiben so, bis die aktuelle wechselt.
 */
export const exComplete = (e) => e.sets.length > 0 && e.sets.every((x) => x.isDone);

/** Wie am PC (domain/workoutFocus.ts): zuletzt begonnene offene Übung, sonst die nächste offene danach, sonst die erste offene. */
export function focusExId(w) {
  if (w.focusEx && w.exercises.some((e) => e.id === w.focusEx)) return w.focusEx;
  const list = w.exercises;
  let started = -1;
  list.forEach((e, i) => {
    if (e.sets.some((x) => x.isDone)) started = i;
  });
  if (started >= 0 && !exComplete(list[started])) return list[started].id;
  return (list.slice(started + 1).find((e) => !exComplete(e)) ?? list.find((e) => !exComplete(e)))?.id ?? null;
}

export function isOpen(w, we) {
  const manual = S.exOpen?.[we.id];
  return manual ?? we.id === focusExId(w);
}

export function setFocus(w, id) {
  w.focusEx = id;
  S.exOpen = {};
}

/** HYROX-Einheit (1.54.0, wie am PC): „HYROX“ im Titel oder eine Übung, deren Name mit „Hyrox“ beginnt. */
export function isHyroxWorkout(w) {
  if (/hyrox/i.test(w.title ?? "")) return true;
  const exs = exById();
  return w.exercises.some((e) => /^\s*hyrox/i.test(exs.get(e.exerciseId)?.name ?? e.exerciseName ?? ""));
}

/**
 * HYROX-Wettkampf (1.46.0): Frauen/Männer, Wettkampfklasse (Division), Ort, Altersklasse,
 * Endzeit und Platzierung gesamt und in der Altersklasse – wie am PC.
 */
export function competitionCard(c) {
  const sex = c.sex ?? HX.divisionSex(c.division);
  const num = (v) => (v === null || v === undefined ? "" : String(v));
  const field = (id, label, value, attrs, cls = "field") =>
    `<div class="${cls}"><label for="${id}">${label}</label><input id="${id}" type="text" ${attrs} value="${esc(value)}"></div>`;
  return `<section class="card competition" aria-label="Wettkampf-Angaben">
    <h3>HYROX-Wettkampf</h3>
    <div class="chips" role="group" aria-label="Wettkampf">
      <button class="chip${sex === "women" ? " on" : ""}" data-act="comp-sex" data-arg="women" aria-pressed="${sex === "women"}">Wettkampf Frauen</button>
      <button class="chip${sex === "men" ? " on" : ""}" data-act="comp-sex" data-arg="men" aria-pressed="${sex === "men"}">Wettkampf Männer</button>
    </div>
    <div class="comp-grid">
      <div class="field wide"><label for="comp-division">Wettkampfklasse (Division)</label>
        <select id="comp-division" data-cfield="division">
          <option value="">–</option>
          ${HX.divisionsFor(sex).map((d) => `<option value="${d.value}"${c.division === d.value ? " selected" : ""}>${esc(d.label)}</option>`).join("")}
        </select></div>
      ${field("comp-location", "Ort", c.location ?? "", 'maxlength="120" placeholder="z. B. Wien" data-cfield="location"')}
      <div class="field"><label for="comp-age">Altersklasse</label>
        <select id="comp-age" data-cfield="ageGroup">
          <option value="">–</option>
          ${HX.HYROX_AGE_GROUPS.map((a) => `<option value="${a}"${c.ageGroup === a ? " selected" : ""}>${a}</option>`).join("")}
          ${c.ageGroup && !HX.HYROX_AGE_GROUPS.includes(c.ageGroup) ? `<option value="${esc(c.ageGroup)}" selected>${esc(c.ageGroup)}</option>` : ""}
        </select></div>
      ${field("comp-finish", "Endzeit", c.finishText ?? HX.formatFinishTime(c.finishSeconds), 'inputmode="numeric" placeholder="h:mm:ss" data-cfield="finish"', "field wide")}
      ${field("comp-rank", "Platz gesamt", num(c.rank), 'inputmode="numeric" placeholder="–" data-cfield="rank"')}
      ${field("comp-field", "von", num(c.field), 'inputmode="numeric" placeholder="–" data-cfield="field"')}
      ${field("comp-rank-age", "Platz AK", num(c.rankAge), 'inputmode="numeric" placeholder="–" data-cfield="rankAge"')}
      ${field("comp-field-age", "von", num(c.fieldAge), 'inputmode="numeric" placeholder="–" data-cfield="fieldAge"')}
    </div>
    <p class="muted small">Beim Wechsel der Klasse werden die Stationsgewichte laut Regelwerk eingetragen; sie bleiben änderbar.</p>
    <button class="btn sm ghost" data-act="comp-remove">Wettkampf-Angaben entfernen</button>
  </section>`;
}

/** Stationsgewichte und -notizen der Einheit an eine Klasse anpassen (ohne Gewichte: unverändert). */
export function applyDivisionWeights(w, division) {
  if (!HX.weightsForDivision(division)) return;
  for (const we of w.exercises) {
    if (!HX.HYROX_WEIGHTED.has(we.exerciseId)) continue;
    const load = HX.loadFor(we.exerciseId, division);
    if (!load) continue;
    for (const s of we.sets) {
      s.weightKg = load.weightKg;
      if (load.notes) s.notes = load.notes;
    }
  }
}

/** Vorlage gewählt: alle 16 Abschnitte mit vorbelegten Werten anlegen. */
export function addHyrox(template) {
  const w = S.active;
  const all = C.allExercises(S.catalog, S.localExercises);
  const { found, missing } = HX.matchStations(all);
  const iso = new Date().toISOString();
  for (const station of missing) {
    const id = all.some((e) => e.id === station.exerciseId) ? C.uuidv7() : station.exerciseId;
    const ex = HX.stationExercise(station, id, iso);
    S.localExercises.push(ex);
    found.set(station.key, ex);
  }
  const race = template !== "simulation";
  const division = race && !w.planDayId ? HX.defaultDivision(template) : null;
  let first = null;
  for (const seg of HX.hyroxSegments(division)) {
    const ex = found.get(seg.station.key);
    const we = C.workoutExercise({ exerciseId: ex.id });
    const set = C.newSet({ distanceM: seg.distanceM, reps: seg.reps, weightKg: seg.weightKg });
    set.notes = seg.notes;
    we.sets = [set];
    we.restSeconds = null;
    w.exercises.push(we);
    first ??= we;
  }
  if (!w.title.trim() || w.title === "Freies Training" || w.title === "Training") {
    w.title = race ? "HYROX-Wettkampf" : "HYROX-Simulation";
  }
  if (division && !w.competition) {
    w.competition = { ...HX.emptyCompetition(division), sex: template };
  }
  return first;
}

export function exerciseCard(we, i, exs, machines) {
  const ex = exs.get(we.exerciseId);
  const { name, nr, m } = exLabel(ex, machines);
  const cardio = ex?.category === "cardio";
  const weighted = cardio && HX.HYROX_WEIGHTED.has(we.exerciseId);
  const last = C.lastSessionFor(S.catalog, S.workouts, we.exerciseId, S.active.id);
  const st = we.settings || C.emptySettings();
  const open = isOpen(S.active, we);
  const done = we.sets.filter((x) => x.isDone).length;
  const head = `<button class="ex-head ex-toggle" data-act="toggle-ex" data-we="${we.id}" aria-expanded="${open}">
      <span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span>${MI.thumb(m?.id)}
      <span class="main"><b>${esc(name)}</b><span class="muted small">${esc([m?.manufacturer, ex?.muscle_group].filter(Boolean).join(" · "))}</span></span>
      <span class="ex-progress${we.sets.length && done === we.sets.length ? " all" : ""}">${done}/${we.sets.length}</span>
      <span class="chev" aria-hidden="true">${open ? "▾" : "▸"}</span>
    </button>`;
  if (!open) {
    return `<section class="ex collapsed" id="ex-${we.id}">${head}${we.notes ? `<p class="ex-note-line muted small">📝 ${esc(we.notes)}</p>` : ""}</section>`;
  }
  return `<section class="ex" id="ex-${we.id}">
    ${head}
    ${lastText(last, cardio)}
    <details class="settings"${Object.values(st).some((v) => v) ? "" : ""}>
      <summary>Geräteeinstellungen${Object.values(st).some((v) => v) ? `: ${esc(Object.entries(C.SETTING_LABELS).filter(([k]) => st[k]).map(([k, l]) => `${l} ${st[k]}`).join(", "))}` : ""}</summary>
      <div class="settings-grid">
        ${Object.entries(C.SETTING_LABELS)
          .map(
            ([k, l]) => `<div class="field"><label for="st-${we.id}-${k}">${l}</label>
            <input id="st-${we.id}-${k}" type="text" maxlength="40" value="${esc(st[k] ?? "")}" data-we="${we.id}" data-setting="${k}"></div>`,
          )
          .join("")}
        <div class="field"><label for="st-${we.id}-grip">Griffstellung</label>
          <select id="st-${we.id}-grip" data-we="${we.id}" data-setting="gripPosition">
            <option value="">–</option>
            ${Object.entries(C.GRIP_LABELS).map(([k, l]) => `<option value="${k}"${st.gripPosition === k ? " selected" : ""}>${l}</option>`).join("")}
          </select></div>
        <div class="field"><label for="rest-${we.id}">Pause (Sekunden)</label>
          <input id="rest-${we.id}" type="text" inputmode="numeric" value="${we.restSeconds ?? ""}" data-we="${we.id}" data-field="restSeconds"></div>
      </div>
    </details>
    ${cardio ? cardioMachinePicker(we, ex) : profilePicker(we, ex)}
    <details class="settings ex-notes"${we.notes ? " open" : ""}>
      <summary>Notiz zur Übung${we.notes ? "" : " (optional)"}</summary>
      <textarea id="note-${we.id}" rows="2" maxlength="500" placeholder="z. B. Sitz zu tief, nächstes Mal mehr Gewicht" data-we="${we.id}" data-field="notes">${esc(we.notes ?? "")}</textarea>
    </details>
    <div class="set-head${cardio ? " cardio" : ""}${weighted ? " kg" : ""}"><span>#</span>${cardio ? `<span>Minuten</span><span>km</span>${weighted ? "<span>kg</span>" : ""}` : "<span>kg</span><span>Wdh.</span><span>RPE</span>"}<span>✓</span></div>
    <div class="sets">
      ${we.sets.map((s, si) => setRow(we, s, si, cardio, cardio ? [] : C.visibleProfiles(we, ex), weighted)).join("")}
    </div>
    <div class="ex-foot">
      <button class="btn sm" data-act="add-set" data-we="${we.id}">+ Satz</button>
      <button class="btn sm ghost" data-act="move-up" data-we="${we.id}" ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="btn sm danger" data-act="remove-ex" data-we="${we.id}">Entfernen</button>
    </div>
  </section>`;
}

const jsonList = (v) => {
  if (Array.isArray(v)) return v.map(String);
  try {
    const a = JSON.parse(v ?? "[]");
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
};

/** Cardiogeräte des Katalogs in der Form von `CardioMachineInfo` (PC `cardioMachines.ts`). */
function cardioMachineInfos() {
  return (S.catalog?.machines ?? []).map((m) => ({
    id: m.id,
    manufacturer: m.manufacturer ?? "",
    name: m.name ?? "",
    displayName: m.display_name ?? "",
    category: m.category ?? "",
    features: jsonList(m.features),
    muscleGroups: C.machineMuscles(m),
    archived: Boolean(m.archived),
  }));
}

/** Zuletzt verwendete Cardiogeräte (1.97.0): aus allen Einheiten vom PC und vom Handy, neueste zuerst. */
function recentCardioMachines(CMA) {
  if (!CMA.recentMachineIds) return [];
  try {
    const db = buildDb();
    const dateOf = new Map(db.workouts.map((w) => [w.id, w.date]));
    const entries = [];
    for (const [wid, list] of db.wexByWorkout ?? []) {
      for (const we of list) if (we.machine_id) entries.push({ date: dateOf.get(wid) ?? "", machineId: we.machine_id });
    }
    return CMA.recentMachineIds(entries);
  } catch {
    return [];
  }
}

/**
 * Gerät einer Cardio-Übung (1.96.0, wie PC 1.0.174 `CardioMachineField.tsx`): passende Geräte zur
 * Cardio-Art oben, je Hersteller gruppiert; die Muskelgruppen des Geräts gelten in der Körperkarte.
 */
export function cardioMachinePicker(we, ex) {
  const CMA = PDOM.cardioMachines;
  if (!CMA?.cardioMachineOptions) return "";
  const sport = ex?.sport_id ? (S.catalog?.sports ?? []).find((x) => x.id === ex.sport_id) : null;
  const kind = effectiveKind("cardio", ex?.cardio_kind ?? null, ex?.name ?? "", ex?.equipment ?? null, sport?.category ?? null) ?? "other";
  const infos = cardioMachineInfos();
  const options = CMA.cardioMachineOptions(infos, kind ?? "other", we.machineId ?? null, recentCardioMachines(CMA));
  const groups = [];
  for (const o of options) {
    const g = groups.at(-1);
    if (g && g.label === o.group) g.items.push(o);
    else groups.push({ label: o.group, items: [o] });
  }
  const chosen = infos.find((m) => m.id === we.machineId);
  return `<div class="field ex-machine"><label for="mach-${we.id}">Gerät (optional)</label>
      <select id="mach-${we.id}" data-we="${we.id}" data-field="machineId">
        <option value="">ohne Gerät</option>
        ${groups
          .map(
            (g) => `<optgroup label="${esc(g.label)}">${g.items
              .map((o) => `<option value="${esc(o.value)}"${o.value === we.machineId ? " selected" : ""}>${esc(o.label)}</option>`)
              .join("")}</optgroup>`,
          )
          .join("")}
      </select>
      <p class="muted small">${esc(CMA.cardioMachineHint(chosen))}</p>
      ${chosen ? MI.photoButton(chosen.id, chosen.displayName || chosen.name) : ""}</div>`;
}

export function profilePicker(we, ex) {
  const vis = C.visibleProfiles(we, ex);
  const locked = new Set(C.PROFILE_KEYS.filter((k) => we.sets.some((s) => s.rp?.[k] !== null && s.rp?.[k] !== undefined)));
  const both = vis.includes("conc") && vis.includes("ecc");
  return `<details class="settings resist"${vis.length ? " open" : ""}>
    <summary>Widerstand${vis.length ? `: ${esc(vis.map((k) => C.PROFILES.find((p) => p.key === k).short).join(", "))}` : ""}</summary>
    <div class="chips">${C.PROFILES.map(
      (p) => `<button class="chip${vis.includes(p.key) ? " on" : ""}" data-act="toggle-profile" data-we="${we.id}" data-arg="${p.key}" ${locked.has(p.key) ? 'data-locked="1"' : ""} title="${esc(p.label)}">${esc(p.short)}</button>`,
    ).join("")}</div>
    <p class="muted small">${vis.length ? "Sobald Profilgewichte eingetragen sind, ist das Gewicht ihre Summe." : "Profil wählen, um das Gewicht in Profile aufzuteilen."}${both ? " " + esc(C.CONC_ECC_RULE) : ""}</p>
  </details>`;
}

export function setRow(we, s, si, cardio, profiles = [], weighted = false) {
  const id = `${we.id}-${s.id}`;
  const warmIdx = we.sets.slice(0, si + 1).filter((x) => !x.isWarmup).length;
  const idx = s.isWarmup ? `<span class="idx w">W</span>` : `<span class="idx">${warmIdx}</span>`;
  const inputs = cardio
    ? `<input id="d-${id}" type="text" inputmode="decimal" placeholder="min" value="${s.durationSeconds ? C.fmtNum(s.durationSeconds / 60) : ""}" data-we="${we.id}" data-set="${s.id}" data-f="durationMin" aria-label="Dauer in Minuten">
       <input id="k-${id}" type="text" inputmode="decimal" placeholder="km" value="${s.distanceM !== null ? C.fmtNum(s.distanceM / 1000, 3) : ""}" data-we="${we.id}" data-set="${s.id}" data-f="distanceKm" aria-label="Strecke in km">${
         weighted
           ? `<input id="w-${id}" type="text" inputmode="decimal" placeholder="kg" value="${C.fmtNum(s.weightKg)}" data-we="${we.id}" data-set="${s.id}" data-f="weightKg" aria-label="Gewicht in kg">`
           : ""
       }`
    : `<input id="w-${id}" type="text" inputmode="decimal" placeholder="kg" value="${C.fmtNum(C.profileTotal(s.rp) ?? s.weightKg)}" data-we="${we.id}" data-set="${s.id}" data-f="weightKg" aria-label="Gewicht in kg"${C.profileTotal(s.rp) !== null ? ' readonly class="sum" title="Summe der Profilgewichte"' : ""}>
       <input id="r-${id}" type="text" inputmode="numeric" placeholder="Wdh." value="${s.reps ?? ""}" data-we="${we.id}" data-set="${s.id}" data-f="reps" aria-label="Wiederholungen">
       <input id="p-${id}" class="rpe" type="text" inputmode="decimal" placeholder="–" value="${C.fmtNum(s.rpe, 1)}" data-we="${we.id}" data-set="${s.id}" data-f="rpe" aria-label="RPE">`;
  return `<div class="set${cardio ? " cardio" : ""}${cardio && weighted ? " kg" : ""}${s.isDone ? " done" : ""}">${idx}${inputs}
      <button class="check${s.isDone ? " on" : ""}" data-act="toggle-done" data-we="${we.id}" data-set="${s.id}" aria-label="Satz abhaken" aria-pressed="${s.isDone}">✓</button>
    </div>
    ${s.notes ? `<p class="set-note muted small">${esc(s.notes)}</p>` : ""}
    ${
      profiles.length
        ? `<div class="rp-grid">${profiles
            .map((k) => {
              const p = C.PROFILES.find((x) => x.key === k);
              return `<label class="rp"><span>${esc(p.short)}</span><input id="rp-${id}-${k}" type="text" inputmode="decimal" placeholder="kg" value="${C.fmtNum(s.rp?.[k])}" data-we="${we.id}" data-set="${s.id}" data-f="rp:${k}" aria-label="${esc(p.label)} in kg"></label>`;
            })
            .join("")}</div>`
        : ""
    }
    <div class="set-opts">
      <button class="chip${s.isWarmup ? " on" : ""}" data-act="flag" data-flag="isWarmup" data-we="${we.id}" data-set="${s.id}">Aufwärmen</button>
      ${cardio ? "" : `<button class="chip${s.isFailure ? " on" : ""}" data-act="flag" data-flag="isFailure" data-we="${we.id}" data-set="${s.id}">Fail</button>
      <button class="chip${s.isUnilateral ? " on" : ""}" data-act="flag" data-flag="isUnilateral" data-we="${we.id}" data-set="${s.id}">Einseitig</button>`}
      <button class="chip del" data-act="del-set" data-we="${we.id}" data-set="${s.id}" aria-label="Satz löschen">✕</button>
    </div>`;
}

export function viewPicker() {
  return `${header("Übung hinzufügen", { back: "workout" })}<main class="wrap">
    <div class="search">
      <input id="q" type="search" placeholder="Nummer oder Name, z. B. 47 oder Beinpresse" value="${esc(S.query)}" autocomplete="off" enterkeyhint="search">
      ${GY.pickerGymNote() || `<label class="toggle"><input id="only-nr" type="checkbox" ${S.prefs.onlyNumbered ? "checked" : ""}> Nur Maschinen mit Nummer (dein Studio)</label>`}
    </div>
    <div class="list" id="results">${pickerResults()}</div>
  </main>`;
}

/** „12× benutzt · zuletzt 03.11.2026“ bzw. „noch nicht benutzt“. */
export function usageText(u) {
  return u.count ? `${u.count}× benutzt · zuletzt ${fmtDate(u.last)}` : "noch nicht benutzt";
}

export function pickerResults() {
  // Meine Gyms (1.60.0): nur die Maschinen des aktiven Gyms mit dessen Nummer (zuschaltbar)
  const gymOn = Boolean(GY.pickerGymNote());
  const catalog = gymOn ? GY.pickerCatalog() : S.catalog;
  const anyNumbered = catalog.machines.some((m) => m.own_number || m.gym_number);
  const onlyNr = !gymOn && S.prefs.onlyNumbered && anyNumbered;
  const hits = C.search(catalog, S.localExercises, S.query, { onlyNumbered: onlyNr, smart: PDOM.smartFilter });
  if (!hits.length) {
    return `<p class="empty">Nichts gefunden.${gymOn && !S.gymAll ? " Tippe auf „Alle Maschinen zeigen“, um alle Maschinen zu durchsuchen." : onlyNr ? " Schalte „Nur Maschinen mit Nummer“ aus, um alle Maschinen zu durchsuchen." : ""}</p>`;
  }
  const similarFrom = hits.findIndex((h) => h.match === "related" || h.match === "typo");
  const typoOnly = similarFrom >= 0 && hits.slice(similarFrom).every((h) => h.match === "typo");
  return hits
    .map((h, i) => (i === similarFrom ? `<p class="pick-group">${typoOnly ? (i === 0 ? `Keine genauen Treffer – meintest du …?` : "Meintest du …?") : "Ähnlich"}</p>` : "") + hitHtml(h))
    .join("");
}

/** Ein Treffer der Übungsauswahl (Maschine oder freie Übung). */
export function hitHtml(h) {
  const same = h.match === "synonym" ? ' <span class="tag">gleichbedeutend</span>' : "";
      if (h.kind === "machine") {
        const m = h.machine;
        const nr = m.own_number || m.gym_number;
        const key = `machine:${m.id}`;
        return `<div class="item-row" data-mswipe="${esc(m.id)}"><button class="item" data-act="pick-machine" data-arg="${esc(m.id)}">
          <span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span>${MI.thumbButton(m.id, m.display_name, { inner: true })}
          <span class="main"><b>${esc(m.display_name)}</b>${same}<span class="muted small">${esc([m.manufacturer, m.series, C.machineMuscles(m).slice(0, 3).join(", ")].filter(Boolean).join(" · "))}</span>${
            h.exercises.length ? `<span class="small">Übungen: ${esc(h.exercises.map((e) => e.name).join(" · "))}</span>` : ""
          }<span class="usage small">${esc(usageText(C.usageOf(S.catalog, S.workouts, C.machineExercises(S.catalog, S.localExercises, m.id).map((e) => e.id))))}</span></span>
          <span class="chev">${h.exercises.length ? "›" : "+"}</span></button>
          <button class="info-btn" data-act="focus-info" data-arg="${esc(key)}" aria-expanded="${S.focusOpen === key}" aria-label="Muskelverteilung der Maschine ${esc(m.display_name)}">${icon("info")}</button>
          ${S.focusOpen === key ? focusPanelHtml(machineFocusInfo(m)) : ""}</div>`;
      }
      const e = h.exercise;
      return `<button class="item" data-act="pick-exercise" data-arg="${esc(e.id)}">
        <span class="num none">Übung</span>${e.machine_id ? MI.thumbButton(e.machine_id, e.name, { inner: true }) : ""}
        <span class="main"><b>${esc(e.name)}</b>${same}<span class="muted small">${esc([e.muscle_group, e.equipment].filter(Boolean).join(" · "))}</span>
          <span class="usage small">${esc(usageText(C.usageOf(S.catalog, S.workouts, [e.id])))}</span></span>
        <span class="chev">+</span></button>`;
}

/** Maschine mit Übungen: eine davon wählen oder eine weitere anlegen. */
/** Muskelverteilung einer Übung (Info-Symbol), gleiche Regeln wie am PC. */
export function focusPanel(e, m) {
  return focusPanelHtml(
    focusInfo(
      {
        exerciseId: e.id,
        exerciseName: e.name,
        muscleGroup: e.muscle_group,
        machineId: m?.id ?? e.machine_id,
        machineMuscleGroups: m ? C.machineMuscles(m) : [],
        machineNames: machineNamesOf(m ?? S.catalog.machines.find((x) => x.id === e.machine_id)),
      },
      S.catalog.focus,
    ),
  );
}

/** Muskelverteilung der Maschine selbst (1.5.1): eigener Fokus der Maschine, sonst Standardverteilung, sonst Muskelgruppen. */
export function machineFocusInfo(m) {
  return focusInfo(
    { exerciseId: `machine:${m.id}`, exerciseName: m.name, muscleGroup: null, machineId: m.id, machineMuscleGroups: C.machineMuscles(m), machineNames: machineNamesOf(m) },
    S.catalog.focus,
  );
}

/** Kurztext unter „Muskelverteilung der Maschine“. */
export function machineFocusText(info) {
  if (info.source === "machine") return "Eigener Muskelfokus der Maschine";
  if (info.source === "pattern") return info.title;
  if (info.source === "text") return "Aus den Muskelgruppen der Maschine";
  return "Keine Verteilung hinterlegt";
}

export function focusPanelHtml(info) {
  return `<div class="focus-panel">
    <b>${esc(info.title)}</b>
    ${info.groups
      .map(
        (g) => `<div class="fp-group"><div class="fp-head"><span>${esc(g.label)}</span><span>Anteil ${g.total} %</span></div>
        ${g.rows.map((r) => `<div class="fp-row"><span>${esc(r.label)}</span><span>${r.relative} %<small class="fp-share"> (Anteil ${r.percent} %)</small></span></div>`).join("")}</div>`,
      )
      .join("")}
    ${info.groups.length ? `<p class="muted small">Hauptmuskel = 100 %, so zählt die Körperkarte; in Klammern der eingetragene Anteil.</p>` : ""}
    ${info.terms.length ? `<div class="fp-group">${info.terms.map((t) => `<div class="fp-row"><span>${esc(t.label)}</span><span>${t.percent} %</span></div>`).join("")}</div>` : ""}
    ${info.note ? `<p class="muted small">${esc(info.note)}</p>` : ""}
    ${S.catalog.focus ? "" : `<p class="muted small">Für den eigenen Muskelfokus bitte eine neue Exportdatei vom PC laden.</p>`}
  </div>`;
}

export function viewMachine() {
  const m = S.catalog.machines.find((x) => x.id === S.arg);
  if (!m) return viewPicker();
  const nr = m.own_number || m.gym_number;
  const list = C.machineExercises(S.catalog, S.localExercises, m.id);
  return `${header(m.display_name, { back: "picker", sub: [nr ? `Nr. ${nr}` : "", m.manufacturer].filter(Boolean).join(" · ") })}<main class="wrap">
    ${MI.photoButton(m.id, [m.manufacturer, m.display_name].filter(Boolean).join(" · "))}
    ${(() => {
      const info = machineFocusInfo(m);
      const key = `machine:${m.id}`;
      return `<div class="item-row machine-focus">
        <div class="item machine-focus__text"><span class="main"><b>Muskelverteilung der Maschine</b>
          <span class="muted small">${esc(machineFocusText(info))}</span></span></div>
        <button class="info-btn" data-act="focus-info" data-arg="${esc(key)}" aria-expanded="${S.focusOpen === key}" aria-label="Muskelverteilung der Maschine ${esc(m.display_name)}">${icon("info")}</button>
        ${S.focusOpen === key ? focusPanelHtml(info) : ""}
      </div>`;
    })()}
    <p class="muted small">Übungen an dieser Maschine – der Verlauf gehört jeweils zur Übung.</p>
    <div class="list">${list
      .map(
        (e) => `<div class="item-row">
        <button class="item" data-act="pick-exercise" data-arg="${esc(e.id)}">
        <span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span>
        <span class="main"><b>${esc(e.name)}</b><span class="muted small">${esc(e.muscle_group ?? "")}</span>
          <span class="usage small">${esc(usageText(C.usageOf(S.catalog, S.workouts, [e.id])))}</span></span>
        <span class="chev">+</span></button>
        <button class="info-btn" data-act="focus-info" data-arg="${esc(e.id)}" aria-expanded="${S.focusOpen === e.id}" aria-label="Muskelverteilung von ${esc(e.name)}">${icon("info")}</button>
        ${S.focusOpen === e.id ? focusPanel(e, m) : ""}
      </div>`,
      )
      .join("")}</div>
    <section class="card"><h3>Weitere Übung an dieser Maschine</h3>
      <p class="small muted">Zum Beispiel „Butterfly“ und „Rear Delt“ an derselben Maschine. Die Übung wird gespeichert, steht hier beim nächsten Mal zur Auswahl und kommt mit „An den PC senden“ auch in die Desktop-App.</p>
      <p class="small muted">Die Muskelfokusgruppe ergibt sich aus Schlagwörtern im Namen: „Wadenheben stehend“ (auch aufrecht, gestreckt) → Wade stehend, „Wadenheben sitzend“ (auch angewinkelt, abgeknickt, 90 Grad) → Wade sitzend.</p>
      <div class="new-ex"><input id="new-ex-name" type="text" placeholder="Name der Übung, z. B. Butterfly" autocomplete="off" enterkeyhint="done" maxlength="80">
      <button class="btn primary" data-act="new-machine-ex" data-arg="${esc(m.id)}">Übung anlegen und hinzufügen</button></div>
    </section>
  </main>`;
}

export function viewFinish() {
  const w = S.active;
  if (!w) return viewHome();
  const unticked = C.untickedCount(w);
  const errors = C.checkWorkout(w, { keepUnticked: S.prefs.keepUnticked });
  const edit = !!w.editOf;
  if (edit && w.durationMin !== null && (!Number.isFinite(w.durationMin) || w.durationMin < 1 || w.durationMin > 1440)) {
    errors.push("Dauer: bitte 1 bis 1440 Minuten eintragen.");
  }
  return `${header(w.backfill ? "Einheit nachtragen" : edit ? "Änderungen speichern" : "Training beenden", { back: "workout" })}<main class="wrap">
    ${
      edit
        ? `<section class="card"><div class="field"><label for="wo-date">Datum</label><input id="wo-date" type="date" value="${esc(w.date ?? "")}" max="${esc(todayIso())}" data-wfield="date"></div>
           <div class="field"><label for="wo-start">Uhrzeit (optional)</label><input id="wo-start" type="time" value="${esc(w.startTime ?? "")}" data-wfield="startTime"></div>
           <div class="field"><label for="wo-duration">Dauer in Minuten${w.backfill ? " (optional)" : ""}</label><input id="wo-duration" type="text" inputmode="numeric" value="${w.durationMin ?? ""}" data-wfield="durationMin"></div>
           <p class="muted small">${w.exercises.length} ${w.exercises.length === 1 ? "Übung" : "Übungen"} · ${C.fmtNum(C.volumeKg(w), 0)} kg Volumen. ${
             w.backfill
               ? "Nach dem Speichern steht die Einheit unter Training → Einheiten; mit „An den PC senden“ und „Abgleichen (zweites Gerät)“ kommt sie an den PC."
               : "Nach dem Speichern zählt das Training wieder als „offen“ – mit „An den PC senden“ und „Abgleichen (zweites Gerät)“ übernimmt der PC die Änderungen, auch entfernte Sätze und Übungen."
           }</p></section>`
        : ""
    }
    <section class="card"${edit ? " hidden" : ""}>
      <div class="stat">
        <div><b>${fmtSec((Date.now() - new Date(w.startedAt)) / 1000)}</b><span>Dauer</span></div>
        <div><b>${w.exercises.length}</b><span>Übungen</span></div>
        <div><b>${C.fmtNum(C.volumeKg(w), 0)}</b><span>kg Volumen</span></div>
      </div>
    </section>
    <section class="card">
      <h3>Wie anstrengend war es? (1–10)</h3>
      <div class="rpe-row">${Array.from({ length: 10 }, (_, i) => i + 1)
        .map((n) => `<button data-act="exertion" data-arg="${n}" class="${w.perceivedExertion === n ? "on" : ""}">${n}</button>`)
        .join("")}</div>
      <div class="field"><label for="wo-notes">Notiz (optional)</label><textarea id="wo-notes" maxlength="2000" data-wfield="notes">${esc(w.notes ?? "")}</textarea></div>
      <div class="field"><label for="wo-title">Titel</label><input id="wo-title" type="text" maxlength="80" value="${esc(w.title)}" data-wfield="title"></div>
    </section>
    ${
      unticked
        ? `<section class="card"><p class="warn">${unticked === 1 ? "1 Satz ist" : `${unticked} Sätze sind`} eingetragen, aber nicht abgehakt.</p>
           <label class="toggle"><input id="keep-unticked" type="checkbox" ${S.prefs.keepUnticked ? "checked" : ""}> Nicht abgehakte Sätze trotzdem speichern</label></section>`
        : ""
    }
    ${errors.length ? `<div class="errors">${errors.map((e) => `<p>${esc(e)}</p>`).join("")}</div>` : ""}
  </main>
  <div class="bottom"><div class="inner"><button class="btn primary" data-act="finish" ${errors.length ? "disabled" : ""}>Speichern</button></div></div>`;
}

/** „HYROX · Männer Open · Wien · AK 30-34 · 1:28:12 · Platz 120. von 1.500 · AK 12. von 210“ */
export function competitionText(c) {
  return [
    "HYROX",
    c.division ? HX.divisionLabel(c.division) : null,
    c.location,
    c.ageGroup ? `AK ${c.ageGroup}` : null,
    c.finishSeconds ? HX.formatFinishTime(c.finishSeconds) : null,
    c.rank ? `Platz ${HX.placementText(c.rank, c.field)}` : null,
    c.rankAge ? `AK ${HX.placementText(c.rankAge, c.fieldAge)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function viewDetail() {
  const own = S.workouts.find((x) => x.id === S.arg);
  const w = own ?? pcWorkout(S.arg);
  if (!w) return viewHome();
  const exs = exById();
  const machines = machineById();
  const adopt = S.trainAdopt?.id === w.id;
  return `${header(w.title, { back: "training", sub: `${fmtDate(w.date)}${w.startTime ? ` · ${w.startTime} Uhr` : ""}` })}<main class="wrap">
    ${S.trainNotice ? `<p class="${S.trainNotice.tone === "error" ? "warn" : "ok-note"}" role="status">${esc(S.trainNotice.text)}</p>` : ""}
    ${
      adopt
        ? `<div class="adopt-offer" role="group" aria-label="Richtwerte übernehmen"><span class="small">Sätze, Gewichte und Einstellungen von „${esc(w.title)}“ als neue Richtwerte in den Trainingstag übernehmen? Beim nächsten Start sind die Sätze damit vorbelegt.</span>
          <div class="row-actions"><button class="btn sm primary" data-act="train-adopt">In den Plan übernehmen</button><button class="btn sm" data-act="train-adopt-no">Nein danke</button></div></div>`
        : ""
    }
    <section class="card"><div class="stat">
      <div><b>${w.durationMin ?? "–"}</b><span>Minuten</span></div>
      <div><b>${w.perceivedExertion ?? "–"}</b><span>Anstrengung</span></div>
      <div><b>${C.fmtNum(C.volumeKg(w), 0)}</b><span>kg Volumen</span></div>
    </div>${w.competition ? `<p class="small"><b>${esc(competitionText(w.competition))}</b></p>` : ""}${w.notes ? `<p class="small">${esc(w.notes)}</p>` : ""}
    <p class="muted small">${!own ? "Einheit vom PC." : w.exported ? "An den PC gesendet." : "Noch nicht an den PC gesendet."}</p></section>
    ${w.exercises
      .map((we) => {
        const { name, nr } = exLabel(exs.get(we.exerciseId), machines);
        return `<section class="card"><div class="row"><span class="num ${nr ? "" : "none"}">${nr ? esc(nr) : "–"}</span><h3 style="flex:1">${esc(name)}</h3></div>
          <p class="small">${we.sets
            .map((s) =>
              s.durationSeconds !== null || s.distanceM !== null
                ? `${s.isWarmup ? "W " : ""}${s.durationSeconds !== null ? `${Math.round(s.durationSeconds / 60)} min` : "–"}${s.distanceM !== null ? ` · ${C.fmtNum(s.distanceM / 1000)} km` : ""}${s.weightKg !== null ? ` · ${C.fmtNum(s.weightKg)} kg` : ""}${s.rpe ? ` @${C.fmtNum(s.rpe, 1)}` : ""}`
                : `${s.isWarmup ? "W " : ""}${s.reps ?? "–"} × ${s.weightKg !== null ? C.fmtNum(s.weightKg) + " kg" : "–"}${s.rpe ? ` @${C.fmtNum(s.rpe, 1)}` : ""}${s.isFailure ? " (Fail)" : ""}`,
            )
            .map(esc)
            .join("<br>")}</p></section>`;
      })
      .join("")}
    ${workoutBodyMapHtml(w, C.allExercises(S.catalog, S.localExercises), { finished: true })}
    <button class="btn block" data-act="edit-workout" data-arg="${w.id}">Training bearbeiten</button>
    ${!own || w.exported || w.fromPc ? "" : `<button class="btn danger block" data-act="delete-workout" data-arg="${w.id}">Training löschen</button>`}
  </main>`;
}

// ------------------------------------------------------------------ Aktionen

export function findWe(id) {
  return S.active?.exercises.find((e) => e.id === id) || null;
}

export function findSet(weId, setId) {
  return findWe(weId)?.sets.find((s) => s.id === setId) || null;
}

/** Trainingstag (ID) aus einem Plan starten (wie „Tag starten“ am PC). */
export function startPlanDay(dayId) {
  for (const p of S.catalog.plans) {
    const d = p.days.find((x) => x.row.id === dayId);
    if (d) return startWorkout(d.row.name, d, p.row.gym_id ?? null);
  }
  toast("Den Trainingstag gibt es nicht mehr.", true);
}

/**
 * Einheit nachtragen bzw. Cardio erfassen (wie „Nachtragen“ und „Cardio erfassen“ am PC): ein
 * Eintrag mit Datum, Uhrzeit und Dauer, kein laufendes Training. Intern eine Bearbeitung ohne
 * Vorlage (`pcOriginal` leer), gespeichert wird mit „Speichern“.
 */
export async function startBackfill(date, exerciseId = null) {
  if (S.active) return go("workout");
  const ex = exerciseId ? C.allExercises(S.catalog, S.localExercises).find((e) => e.id === exerciseId) : null;
  const w = C.newWorkout({ title: ex ? ex.name : "Training", gymId: GY.activeGymIdNow() });
  w.date = date;
  w.startTime = null;
  w.status = "done";
  w.durationMin = null;
  w.exported = false;
  const original = { ...w, exercises: [] };
  if (ex) w.exercises.push(C.workoutExercise({ exerciseId: ex.id, last: C.lastSessionFor(S.catalog, S.workouts, ex.id) }));
  S.active = { ...C.startEdit(w), pcOriginal: original, backfill: true };
  await saveNow();
  go(ex ? "workout" : "picker");
}

/** Einheit vom PC (Zeilen der Exportdatei) als Handy-Training. */
export function pcWorkout(id) {
  const db = buildDb();
  const w = db.workouts.find((x) => x.id === id);
  if (!w) return null;
  const wex = db.wexByWorkout.get(id) ?? [];
  return C.workoutFromPc(w, wex, db.setsByWex);
}

export async function startWorkout(title, planDay = null, planGymId = null) {
  if (S.active) return go("workout");
  // Gym (1.65.0): das des Plans, sonst das aktive Gym
  const w = C.newWorkout({ title, planDayId: planDay?.row.id ?? null, gymId: planGymId || GY.activeGymIdNow() });
  if (planDay) {
    for (const pe of planDay.exercises) {
      w.exercises.push(C.workoutExercise({ exerciseId: pe.exerciseId, planExercise: pe, last: C.lastSessionFor(S.catalog, S.workouts, pe.exerciseId) }));
    }
  }
  S.active = w;
  await saveNow();
  wakeLock(true);
  go(planDay ? "workout" : "picker");
}

export function addExercise(exerciseId) {
  const template = HX.hyroxTemplate(exerciseId);
  if (template) {
    const first = addHyrox(template);
    setFocus(S.active, first.id);
    saveSoon();
    S.query = "";
    go("workout");
    requestAnimationFrame(() => document.getElementById(`ex-${first.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    return;
  }
  const last = C.lastSessionFor(S.catalog, S.workouts, exerciseId, S.active.id);
  const we = C.workoutExercise({ exerciseId, last });
  S.active.exercises.push(we);
  setFocus(S.active, we.id);
  saveSoon();
  S.query = "";
  go("workout");
  requestAnimationFrame(() => document.getElementById(`ex-${we.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
}
