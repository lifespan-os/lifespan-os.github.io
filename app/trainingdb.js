// LIFESPAN OS Mobil – Training → Datenbank (Übungsdatenbank ExercisesTab.tsx, Maschinendatenbank
// MachinesCard.tsx, Sportarten-Datenbank SportsCard.tsx) und Check-Ins (CheckinsTab.tsx) wie am
// PC (1.17.0). Übungen, Sportarten und Check-In-Fotos lassen sich am Handy anlegen, ändern und
// löschen (trainingdata.js); Maschinen-Import und Master-Editor gibt es nur am PC (Dateien dort).

import * as D from "./pcdomain.js";
import * as TR from "./trainingdata.js";
import { buildDb, today } from "./diary.js";
import { esc } from "./pcview.js";
import { exerciseModels } from "./trainingstats.js";

let X = null;

export function initTrainingDb(ctx) {
  X = ctx;
}

const F = (v, d = 0) => D.formatNumber(v, d);
const fmtDate = (d) => D.formatDate(d);
const norm = (s) =>
  String(s ?? "")
    .toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const fe = (errors, n) => (errors?.[n] ? `<p class="field-error">${esc(errors[n])}</p>` : "");
const notice = () => {
  const n = X.S.trainNotice;
  return n ? `<p class="${n.tone === "error" ? "warn" : "ok-note"}" role="status">${esc(n.text)}</p>` : "";
};
const PROFILE_KEYS = D.resistance.PROFILE_KEYS;

function usageByExercise() {
  const db = buildDb();
  const m = new Map();
  for (const list of db.wexByWorkout.values()) {
    const seen = new Set();
    for (const we of list) {
      if (seen.has(we.exercise_id)) continue;
      seen.add(we.exercise_id);
      m.set(we.exercise_id, (m.get(we.exercise_id) ?? 0) + 1);
    }
  }
  return { db, usage: m };
}

/** Übung mit Änderungen speichern (am PC angelegt oder in der Datenbank am Handy). */
export async function saveExerciseRow(row, patch) {
  const S = X.S;
  const local = (S.localExercises ?? []).find((e) => e.id === row.id);
  const all = [...S.catalog.exercises, ...(S.localExercises ?? [])];
  let profiles = [];
  try {
    profiles = row.resistance_profiles ? JSON.parse(row.resistance_profiles) : [];
  } catch {
    profiles = [];
  }
  const input = {
    id: row.id,
    name: row.name,
    category: row.category ?? "strength",
    muscleGroup: row.muscle_group ?? null,
    equipment: row.equipment ?? null,
    notes: row.notes ?? null,
    discipline: row.discipline ?? null,
    archived: Boolean(row.archived),
    resistanceProfiles: profiles,
    cardioKind: row.cardio_kind ?? null,
    ...patch,
  };
  if (local) {
    // Nur am Handy angelegt: in die Datenbank am Handy übernehmen (geht mit „Körperwerte“ mit)
    TR.addExerciseRow(S.catalogRaw, S.train, local);
  }
  TR.saveExercise(S.catalogRaw, S.train, input, { uuid: X.uuid, now: new Date(), all });
  if (local) S.localExercises = S.localExercises.filter((e) => e.id !== row.id);
  await X.persistTrain();
}

// ------------------------------------------------------------------ Datenbank

export function viewDatabaseTab() {
  const S = X.S;
  if (S.trainExEdit) return exerciseEditor();
  if (S.trainSportEdit) return sportEditor();
  if (S.trainMachine) return machineDetail();
  return `${notice()}${exercisesCard()}${machinesCard()}${sportsCard()}`;
}

function exercisesCard() {
  const S = X.S;
  const { db, usage } = usageByExercise();
  const all = exerciseModels(db, S.catalog).map((e) => ({ ...e, usageCount: usage.get(e.id) ?? 0 }));
  const showArchived = Boolean(S.trainExArchived);
  const own = all.filter((e) => !e.machineId && !e.sportId && (showArchived || !e.archived));
  const atMachines = all.filter((e) => e.machineId).length;
  const disciplines = [...new Set(own.map((e) => e.discipline).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
  const q = S.trainExQuery ?? "";
  const disc = S.trainExDisc ?? "";
  const words = norm(q).split(/\s+/).filter(Boolean);
  const shown = own
    .filter((e) => {
      if (disc === "__none__" && e.discipline) return false;
      if (disc && disc !== "__none__" && e.discipline !== disc) return false;
      const hay = norm([e.name, e.muscleGroup, e.discipline, e.equipment, D.labelsAll.exerciseCategoryLabel(e.category)].filter(Boolean).join(" "));
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
  const filtered = q.trim() !== "" || disc !== "";
  return `<section class="card card--training" id="exercises-title"><h3>Übungsdatenbank</h3>
    <div class="row-actions"><label class="toggle"><input type="checkbox" data-dbchange="exArchived" ${showArchived ? "checked" : ""}> Archivierte anzeigen</label>
      <button class="btn sm primary" data-act="train-ex-new">Neue Übung</button></div>
    ${atMachines > 0 ? `<p class="muted small">${atMachines} ${atMachines === 1 ? "Übung gehört" : "Übungen gehören"} zu einer Maschine und ${atMachines === 1 ? "steht" : "stehen"} mit Verlauf in der Maschinendatenbank.</p>` : ""}
    ${
      own.length === 0 && atMachines === 0
        ? `<div class="empty-state"><p><strong>Noch keine Übungen</strong></p><p class="muted small">Lege deine Übungen einmal an. Danach kannst du sie in Plänen und Einheiten auswählen.</p></div>`
        : ""
    }
    ${
      own.length
        ? `<div class="field"><label for="exercise-search">Übungen durchsuchen</label><input id="exercise-search" type="search" placeholder="Name, Muskelgruppe, Bereich, Gerät …" value="${esc(q)}" data-dbinput="exQuery" autocomplete="off"></div>
          <div class="field"><label for="exercise-discipline-filter">Bereich</label><select id="exercise-discipline-filter" data-dbchange="exDisc"><option value="">Alle</option>${disciplines.map((d) => `<option value="${esc(d)}" ${d === disc ? "selected" : ""}>${esc(d)}</option>`).join("")}<option value="__none__" ${disc === "__none__" ? "selected" : ""}>Ohne Bereich</option></select></div>
          <p class="muted small" aria-live="polite" id="ex-count">${filtered ? `${shown.length} von ${own.length}` : `${own.length} Übungen`}${filtered ? ` · <button class="linkbtn" data-act="train-ex-reset">Filter zurücksetzen</button>` : ""}</p>`
        : ""
    }
    <div id="ex-results">${exerciseRows(shown, own.length)}</div>
  </section>`;
}

function exerciseRows(shown, total) {
  if (total > 0 && shown.length === 0) return `<p class="muted">Keine Übung passt zu Suche und Filter.</p>`;
  const limit = X.S.trainExLimit ?? 30;
  return `<ul class="train-list">${shown
    .slice(0, limit)
    .map(
      (e) => `<li class="train-row"><span class="train-row__main"><strong>${esc(e.name)}</strong>${e.archived ? ' <span class="pill">Archiviert</span>' : ""}
        <span class="muted small">${esc([e.muscleGroup ?? "–", e.discipline ?? "–", D.labelsAll.exerciseCategoryLabel(e.category), e.equipment ?? "–"].join(" · "))} · ${e.usageCount} ${e.usageCount === 1 ? "Einheit" : "Einheiten"}</span>
        ${e.resistanceProfiles.length ? `<span class="muted small">Profil: ${esc(e.resistanceProfiles.filter((k) => PROFILE_KEYS.includes(k)).map((k) => D.resistance.PROFILE_SHORT[k]).join(", "))}</span>` : ""}</span>
        <span class="row-actions"><button class="linkbtn" data-act="train-ex-edit" data-arg="${esc(e.id)}">Bearbeiten</button><button class="linkbtn danger" data-act="train-ex-delete" data-arg="${esc(e.id)}">Löschen</button></span></li>`,
    )
    .join("")}</ul>${shown.length > limit ? `<button class="btn sm" data-act="train-more" data-arg="trainExLimit">Weitere anzeigen (${shown.length - limit})</button>` : ""}`;
}

function exerciseEditor() {
  const S = X.S;
  const d = S.trainExEdit;
  const errors = S.trainErrors ?? {};
  return `<section class="card card--training"><h3>${d.id ? "Übung bearbeiten" : "Neue Übung"}</h3>
    ${notice()}
    <div class="field"><label for="ex-name">Name</label><input id="ex-name" type="text" maxlength="80" value="${esc(d.name)}" data-exf="name">${fe(errors, "name")}</div>
    <div class="field"><label for="ex-category">Typ</label><select id="ex-category" data-exf="category" data-dbchange="exCategory">${D.labelsAll.EXERCISE_CATEGORIES.map((c) => `<option value="${c.value}" ${c.value === d.category ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>${fe(errors, "category")}</div>
    ${
      d.category === "cardio"
        ? `<div class="field"><label for="ex-cardio">Cardio-Art</label><select id="ex-cardio" data-exf="cardioKind"><option value="">automatisch aus dem Namen</option>${D.cardio.CARDIO_KINDS.map((k) => `<option value="${k.value}" ${k.value === d.cardioKind ? "selected" : ""}>${esc(k.label)}</option>`).join("")}</select>${fe(errors, "cardioKind")}</div>`
        : ""
    }
    <div class="field"><label for="ex-muscle">Muskelgruppe (optional)</label><input id="ex-muscle" type="text" maxlength="60" placeholder="z. B. Brust" value="${esc(d.muscleGroup)}" data-exf="muscleGroup">${fe(errors, "muscleGroup")}</div>
    <div class="field"><label for="ex-discipline">Bereich (optional)</label><input id="ex-discipline" type="text" maxlength="60" list="ex-disciplines" placeholder="z. B. Calisthenics, Hyrox, Bodyweight, Cardio" value="${esc(d.discipline)}" data-exf="discipline"><datalist id="ex-disciplines">${D.sports.EXERCISE_DISCIPLINES.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>${fe(errors, "discipline")}</div>
    <div class="field"><label for="ex-equipment">Gerät / Gerät-Nr. (optional)</label><input id="ex-equipment" type="text" maxlength="60" placeholder="z. B. Langhantel" value="${esc(d.equipment)}" data-exf="equipment">${fe(errors, "equipment")}</div>
    <div class="field"><label for="ex-notes">Notizen (optional)</label><textarea id="ex-notes" rows="3" maxlength="2000" data-exf="notes">${esc(d.notes)}</textarea>${fe(errors, "notes")}</div>
    <fieldset class="fast-group"><legend>Widerstandsprofile (Standard für neue Sätze)</legend>
      ${PROFILE_KEYS.map((k) => `<label class="toggle"><input type="checkbox" data-exprofile="${k}" ${d.resistanceProfiles.includes(k) ? "checked" : ""}> ${esc(D.resistance.PROFILE_LABELS[k])}</label>`).join("")}
      ${fe(errors, "resistanceProfiles")}</fieldset>
    <label class="toggle"><input type="checkbox" data-exf="archived" ${d.archived ? "checked" : ""}> Archiviert</label>
    <div class="row-actions"><button class="btn primary" data-act="train-ex-save">Speichern</button><button class="btn" data-act="train-ex-cancel">Abbrechen</button></div>
  </section>`;
}

function syncExercise() {
  const d = X.S.trainExEdit;
  if (!d) return;
  for (const el of document.querySelectorAll("[data-exf]")) d[el.dataset.exf] = el.type === "checkbox" ? el.checked : el.value;
  const boxes = [...document.querySelectorAll("[data-exprofile]")];
  if (boxes.length) d.resistanceProfiles = boxes.filter((b) => b.checked).map((b) => b.dataset.exprofile);
}

// ------------------------------------------------------------------ Maschinen (MachinesCard.tsx)

function machineModels(catalog) {
  const list = (v) => {
    if (Array.isArray(v)) return v.map(String);
    try {
      const p = JSON.parse(v ?? "[]");
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  };
  return (catalog.machines ?? []).map((m) => ({
    id: m.id,
    manufacturer: m.manufacturer ?? "",
    folder: m.folder ?? "",
    articleNumber: m.article_number ?? null,
    category: m.category ?? "",
    series: m.series ?? "",
    name: m.name ?? "",
    displayName: m.display_name ?? m.name ?? "",
    machineType: m.machine_type ?? "",
    muscleGroups: list(m.muscle_groups),
    features: list(m.features),
    images: list(m.images),
    productUrl: m.product_url ?? null,
    ownNumber: m.own_number ?? null,
    gymNumber: m.gym_number ?? null,
    notes: m.notes ?? null,
    archived: Boolean(m.archived),
    origin: m.origin ?? "import",
    updatedAt: m.updated_at ?? "",
  }));
}

function machinesCard() {
  const S = X.S;
  const M = D.machinesDomain;
  const machines = machineModels(S.catalog).filter((m) => !m.archived);
  const { usage } = usageByExercise();
  const exByMachine = new Map();
  for (const e of [...S.catalog.exercises, ...(S.localExercises ?? [])]) {
    if (!e.machine_id || e.archived) continue;
    if (!exByMachine.has(e.machine_id)) exByMachine.set(e.machine_id, []);
    exByMachine.get(e.machine_id).push(e);
  }
  const used = (m) => (exByMachine.get(m.id) ?? []).reduce((a, e) => a + (usage.get(e.id) ?? 0), 0);
  const f = { ...M.EMPTY_FILTER, ...(S.trainMachineFilter ?? {}) };
  const onlyUsed = Boolean(S.trainMachineUsed);
  let shown = M.filterMachines(machines, f);
  if (onlyUsed) shown = shown.filter((m) => used(m) > 0);
  const qn = norm(f.query).trim();
  const exact = (m) => qn !== "" && [m.ownNumber, m.gymNumber].some((n) => n && norm(n) === qn);
  shown = M.sortMachines ? M.sortMachines(shown, M.DEFAULT_MACHINE_SORT) : shown;
  shown = [...shown].sort((a, b) => Number(exact(b)) - Number(exact(a)));
  const manufacturers = M.distinct(machines, (m) => m.manufacturer);
  const categories = M.distinct(machines, (m) => m.category);
  const muscles = M.distinct(machines, (m) => m.muscleGroups);
  const filtered = f.query || f.manufacturer || f.category || f.muscle || onlyUsed;
  const sel = (id, label, key, options, extra = "") =>
    `<div class="field"><label for="${id}">${label}</label><select id="${id}" data-mfilter="${key}"><option value="">Alle</option>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === f[key] ? "selected" : ""}>${esc(l)}</option>`).join("")}${extra}</select></div>`;
  return `<section class="card card--training" id="machines-title"><h3>Maschinendatenbank</h3>
    <p class="muted small">Maschinen kommen mit der Exportdatei vom PC. Importieren, Stammdaten und Bilder ändern (Master-Editor) und Doppelte zusammenführen geht am PC.</p>
    <div class="field"><label for="machine-search">Maschinen durchsuchen</label><input id="machine-search" type="search" placeholder="Name, Hersteller, Nummer, Muskelgruppe …" value="${esc(f.query)}" data-dbinput="machineQuery" autocomplete="off"></div>
    ${sel("machine-manufacturer", "Hersteller", "manufacturer", manufacturers.map((x) => [x, x]))}
    ${sel("machine-category", "Kategorie", "category", categories.map((x) => [x, x]))}
    ${sel("machine-muscle", "Muskelgruppe", "muscle", muscles.map((x) => [x, x]), `<option value="${M.NO_MUSCLE}" ${f.muscle === M.NO_MUSCLE ? "selected" : ""}>Ohne Muskelgruppe</option>`)}
    <label class="toggle"><input type="checkbox" data-dbchange="machineUsed" ${onlyUsed ? "checked" : ""}> Nur im Training verwendete</label>
    <p class="muted small" id="machine-count">${shown.length.toLocaleString("de-DE")} von ${machines.length.toLocaleString("de-DE")}${filtered ? ` · <button class="linkbtn" data-act="train-machine-reset">Filter zurücksetzen</button>` : ""}</p>
    <div id="machine-results">${machineRows(shown, exByMachine, usage)}</div>
  </section>`;
}

function machineRows(shown, exByMachine, usage) {
  const M = D.machinesDomain;
  if (!shown.length) return `<p class="muted">Keine Maschine passt zu Suche und Filter.</p>`;
  const limit = X.S.trainMachineLimit ?? 30;
  const more = shown.length > limit ? `<button class="btn sm" data-act="train-more" data-arg="trainMachineLimit">Weitere anzeigen (${(shown.length - limit).toLocaleString("de-DE")})</button>` : "";
  return `<ul class="train-list">${shown
    .slice(0, limit)
    .map((m) => {
      const exs = exByMachine.get(m.id) ?? [];
      const n = exs.reduce((a, e) => a + (usage.get(e.id) ?? 0), 0);
      return `<li class="train-row"><span class="train-row__main"><strong>${esc(m.displayName)}</strong>
        <span class="muted small">${esc([m.manufacturer, m.series, [m.category, m.machineType].filter(Boolean).join(" · ")].filter(Boolean).join(" · "))}</span>
        <span class="small">${esc(m.muscleGroups.join(", ") || "–")}${M.numberLabel(m) ? ` · <strong>${esc(M.numberLabel(m))}</strong>` : ""}</span>
        ${exs.length ? `<span class="muted small">Im Training: ${esc(exs.map((e) => `${e.name} (${usage.get(e.id) ?? 0}×)`).join(", "))}</span>` : ""}</span>
        <span class="row-actions"><span class="tag">${n} ${n === 1 ? "Einheit" : "Einheiten"}</span><button class="linkbtn" data-act="train-machine-open" data-arg="${esc(m.id)}">Details</button></span></li>`;
    })
    .join("")}</ul>${more}`;
}

function machineDetail() {
  const S = X.S;
  const m = machineModels(S.catalog).find((x) => x.id === S.trainMachine);
  if (!m) {
    S.trainMachine = null;
    return viewDatabaseTab();
  }
  const { usage } = usageByExercise();
  const exs = [...S.catalog.exercises, ...(S.localExercises ?? [])].filter((e) => e.machine_id === m.id && !e.archived);
  const focus = S.catalog.focus?.machines?.[m.id] ?? [];
  const row = (label, value) => (value ? `<div class="kv"><span class="muted small">${esc(label)}</span><span>${esc(value)}</span></div>` : "");
  return `<section class="card card--training"><button class="linkbtn" data-act="train-machine-close">‹ Zurück zur Datenbank</button>
    <h3>${esc(m.displayName)}</h3>
    ${row("Hersteller", m.manufacturer)}${row("Serie", m.series)}${row("Kategorie · Typ", [m.category, m.machineType].filter(Boolean).join(" · "))}${row("Artikelnummer", m.articleNumber)}
    ${row("Eigene Nummer", m.ownNumber)}${row("dasGym-Nummer", m.gymNumber)}${row("Muskelgruppen", m.muscleGroups.join(", "))}${row("Besonderheiten", m.features.join(", "))}
    ${focus.length ? row("Muskelfokus", focus.map(([mu, p]) => `${D.MUSCLE_LABELS[mu] ?? mu} ${F(p)} %`).join(", ")) : ""}
    ${row("Notiz", m.notes)}${row("Bilder", m.images.length ? `${m.images.length} am PC` : "")}
    ${m.productUrl ? `<p class="small"><a href="${esc(m.productUrl)}" target="_blank" rel="noopener">Produktseite des Herstellers</a></p>` : ""}
    <h4>Übungen an dieser Maschine</h4>
    ${
      exs.length
        ? `<ul class="train-list">${exs.map((e) => `<li class="train-row"><span class="train-row__main"><strong>${esc(e.name)}</strong><span class="muted small">${usage.get(e.id) ?? 0} ${(usage.get(e.id) ?? 0) === 1 ? "Einheit" : "Einheiten"}${e.muscle_group ? ` · ${esc(e.muscle_group)}` : ""}</span></span><button class="linkbtn" data-act="train-ex-edit" data-arg="${esc(e.id)}">Bearbeiten</button></li>`).join("")}</ul>`
        : `<p class="muted small">Noch keine Übung – sie entsteht, sobald du die Maschine im Training oder in einem Plan wählst.</p>`
    }
    <p class="muted small">Stammdaten, Nummern und Bilder ändern: am PC unter Training → Datenbank → Maschinendatenbank bzw. im Master-Editor.</p>
  </section>`;
}

// ------------------------------------------------------------------ Sportarten (SportsCard.tsx)

function sportModels() {
  const S = X.S;
  const { db } = usageByExercise();
  const exBySport = new Map();
  for (const e of db.exercises.values()) if (e.sport_id) exBySport.set(e.id, e.sport_id);
  const count = new Map();
  for (const list of db.wexByWorkout.values()) {
    const seen = new Set();
    for (const we of list) {
      const sid = exBySport.get(we.exercise_id);
      if (!sid || seen.has(sid)) continue;
      seen.add(sid);
      count.set(sid, (count.get(sid) ?? 0) + 1);
    }
  }
  return (S.catalog.sports ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category ?? "",
    description: s.description ?? null,
    imageKey: s.image_key ?? null,
    image: s.image && s.image !== "None" ? s.image : null,
    archived: Boolean(Number(s.archived)),
    usageCount: count.get(s.id) ?? 0,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));
}

function sportsCard() {
  const S = X.S;
  const all = sportModels();
  const showArchived = Boolean(S.trainSportArchived);
  const list = all.filter((s) => showArchived || !s.archived);
  const filter = { query: S.trainSportQuery ?? "", category: S.trainSportCategory ?? "" };
  const shown = D.sports.filterSports(list, filter).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const cats = D.sports.sportCategories(list);
  const filtered = filter.query.trim() !== "" || filter.category !== "";
  return `<section class="card card--training" id="sports-title"><h3>Sportarten-Datenbank</h3>
    <div class="row-actions"><label class="toggle"><input type="checkbox" data-dbchange="sportArchived" ${showArchived ? "checked" : ""}> Archivierte anzeigen</label>
      <button class="btn sm primary" data-act="train-sport-new">Neue Sportart</button></div>
    <div class="field"><label for="sport-search">Sportarten durchsuchen</label><input id="sport-search" type="search" placeholder="Name, Kategorie, Beschreibung …" value="${esc(filter.query)}" data-dbinput="sportQuery" autocomplete="off"></div>
    <div class="field"><label for="sport-category">Kategorie</label><select id="sport-category" data-dbchange="sportCategory"><option value="">Alle</option>${cats.map((c) => `<option value="${esc(c)}" ${c === filter.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
    <p class="muted small">${filtered ? `${shown.length} von ${list.length}` : `${list.length} Sportarten`}${filtered ? ` · <button class="linkbtn" data-act="train-sport-reset">Filter zurücksetzen</button>` : ""}</p>
    ${
      shown.length
        ? `<ul class="train-list sport-list">${shown
            .slice(0, X.S.trainSportLimit ?? 30)
            .map(
              (s) => `<li class="train-row">${s.image ? `<img class="sport-thumb" src="${esc(s.image)}" alt="" loading="lazy">` : ""}<span class="train-row__main"><strong>${esc(s.name)}</strong>${s.archived ? ' <span class="pill">Archiviert</span>' : ""}<span class="muted small">${esc(s.category)} · ${s.usageCount} ${s.usageCount === 1 ? "Einheit" : "Einheiten"}</span>${s.description ? `<span class="muted small sport-desc">${esc(s.description)}</span>` : ""}</span>
                <span class="row-actions"><button class="linkbtn" data-act="train-sport-edit" data-arg="${esc(s.id)}">Bearbeiten</button><button class="linkbtn danger" data-act="train-sport-delete" data-arg="${esc(s.id)}">Löschen</button></span></li>`,
            )
            .join("")}</ul>${shown.length > (X.S.trainSportLimit ?? 30) ? `<button class="btn sm" data-act="train-more" data-arg="trainSportLimit">Weitere anzeigen (${shown.length - (X.S.trainSportLimit ?? 30)})</button>` : ""}`
        : `<p class="muted">Keine Sportart passt zu Suche und Filter.</p>`
    }
  </section>`;
}

function sportEditor() {
  const S = X.S;
  const d = S.trainSportEdit;
  const errors = S.trainErrors ?? {};
  const cats = D.sports.sportCategories(sportModels());
  return `<section class="card card--training"><h3>${d.id ? "Sportart bearbeiten" : "Neue Sportart"}</h3>
    ${notice()}
    <div class="field"><label for="sport-name">Name</label><input id="sport-name" type="text" maxlength="80" value="${esc(d.name)}" data-spf="name">${fe(errors, "name")}</div>
    <div class="field"><label for="sport-cat">Kategorie</label><input id="sport-cat" type="text" maxlength="60" list="sport-cats" placeholder="z. B. Mannschaftssport, Wassersport" value="${esc(d.category)}" data-spf="category"><datalist id="sport-cats">${cats.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>${fe(errors, "category")}</div>
    <div class="field"><label for="sport-desc">Beschreibung (optional)</label><textarea id="sport-desc" rows="3" maxlength="2000" data-spf="description">${esc(d.description)}</textarea>${fe(errors, "description")}</div>
    <div class="field"><label>Bild (optional)</label>${d.image ? `<img class="sport-preview" src="${esc(d.image)}" alt="">` : ""}
      <div class="row-actions"><label class="btn sm">Bild wählen<input type="file" accept="image/*" hidden data-dbchange="sportImage"></label>${d.image ? `<button class="btn sm" data-act="train-sport-image-remove">Bild entfernen</button>` : ""}</div>${fe(errors, "image")}</div>
    <label class="toggle"><input type="checkbox" data-spf="archived" ${d.archived ? "checked" : ""}> Archiviert</label>
    <div class="row-actions"><button class="btn primary" data-act="train-sport-save">Speichern</button><button class="btn" data-act="train-sport-cancel">Abbrechen</button></div>
  </section>`;
}

function syncSport() {
  const d = X.S.trainSportEdit;
  if (!d) return;
  for (const el of document.querySelectorAll("[data-spf]")) d[el.dataset.spf] = el.type === "checkbox" ? el.checked : el.value;
}

// ------------------------------------------------------------------ Bilder verkleinern (lib/imageResize.ts)

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Das Bild konnte nicht gelesen werden. Bitte ein JPEG-, PNG- oder WebP-Bild wählen."));
    };
    img.src = url;
  });
}

function draw(img, max, quality) {
  const { width, height } = D.checkin.fitSize(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Das Bild konnte nicht verarbeitet werden.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const url = canvas.toDataURL("image/jpeg", quality);
  return { mime: "image/jpeg", data: url.slice(url.indexOf(",") + 1), width, height };
}

// ------------------------------------------------------------------ Check-Ins (CheckinsTab.tsx)

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const emptyCheckin = () => ({ id: null, date: today(), time: nowTime(), pose: "front_relaxed", notes: "", image: null, thumb: null });
const ckLabel = (c) => `${fmtDate(c.date)}${c.time ? ` ${c.time} Uhr` : ""} · ${D.checkin.POSE_LABELS[c.pose]}`;
const dataUrl = (mime, data) => `data:${mime};base64,${data}`;

export function viewCheckinsTab() {
  const S = X.S;
  if (!TR.hasTable(S.catalogRaw, "checkin_photo") && !S.train?.rows?.checkin_photo) {
    return `<section class="card"><p class="warn">Für die Check-Ins wie am PC fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Settings „Neue Exportdatei laden“.</p></section>`;
  }
  const C = D.checkin;
  const all = TR.checkinsOf(S.catalogRaw, S.train);
  const draft = S.trainCheckin ?? emptyCheckin();
  S.trainCheckin = draft;
  const errors = S.trainErrors ?? {};
  const pair = C.defaultPair(all);
  const before = all.find((c) => c.id === S.trainBefore) ?? pair?.before ?? null;
  const after = all.find((c) => c.id === S.trainAfter) ?? pair?.after ?? null;
  const options = C.chronological(all).reverse();
  const poseFilter = S.trainPoseFilter ?? "";
  const shown = all.filter((c) => poseFilter === "" || c.pose === poseFilter);
  const poseSel = (c) => `<option value="${esc(c.id)}">${esc(ckLabel(c))}</option>`;
  const opt = (list, cur) => list.map((c) => poseSel(c).replace(`value="${esc(c.id)}"`, `value="${esc(c.id)}" ${c.id === cur ? "selected" : ""}`)).join("");
  const info = C.poseInfo(draft.pose);
  return `<section class="card card--training" id="checkin-new-title">
      <h3>${draft.id ? "Check-In bearbeiten" : "Neues Check-In"}</h3>
      <details class="small"><summary>Information</summary><p>${esc(C.CHECKIN_INFO)}</p></details>
      <p class="muted small">Formbild aufnehmen oder wählen und mit Datum, Uhrzeit und Pose speichern. Für gute Vergleiche: gleiches Licht, gleiche Pose, gleicher Abstand. Das Foto wird verkleinert und bleibt auf diesem Handy, bis du es an den PC sendest.</p>
      ${notice()}
      ${
        draft.id
          ? ""
          : `<div class="field"><label>Foto</label>${draft.thumb ? `<img class="checkin-preview" src="${esc(dataUrl(draft.thumb.mime, draft.thumb.data))}" alt="Vorschau">` : ""}
          <div class="row-actions"><label class="btn sm">📷 Foto aufnehmen<input type="file" accept="image/*" capture="environment" hidden data-dbchange="checkinImage"></label><label class="btn sm">Aus Fotos wählen<input type="file" accept="image/*" hidden data-dbchange="checkinImage"></label></div>${fe(errors, "image")}</div>`
      }
      <div class="field"><label for="ck-date">Datum</label><input id="ck-date" type="date" value="${esc(draft.date)}" data-ckf="date">${fe(errors, "date")}</div>
      <div class="field"><label for="ck-time">Uhrzeit</label><input id="ck-time" type="time" value="${esc(draft.time)}" data-ckf="time">${fe(errors, "time")}</div>
      <fieldset class="pose-picker"><legend>Pose</legend>
        ${C.POSES.filter((p) => !p.extra).map((p) => `<label class="toggle"><input type="radio" name="ck-pose" value="${p.pose}" data-ckpose ${draft.pose === p.pose ? "checked" : ""}> ${esc(p.label)}</label>`).join("")}
        <p class="small"><strong>${esc(C.EXTRA_POSES_TITLE)}</strong></p>
        ${C.POSES.filter((p) => p.extra).map((p) => `<label class="toggle"><input type="radio" name="ck-pose" value="${p.pose}" data-ckpose ${draft.pose === p.pose ? "checked" : ""}> ${esc(p.label)}</label>`).join("")}
        ${C.isLegacyPose(draft.pose) ? `<label class="toggle"><input type="radio" name="ck-pose" value="${draft.pose}" data-ckpose checked> ${esc(C.POSE_LABELS[draft.pose])}</label>` : ""}
        ${info ? `<p class="muted small pose-info">${esc(info).replace(/\n/g, "<br>")}</p>` : ""}
        ${fe(errors, "pose")}</fieldset>
      <div class="field"><label for="ck-notes">Notiz (optional)</label><textarea id="ck-notes" rows="2" maxlength="500" data-ckf="notes">${esc(draft.notes)}</textarea>${fe(errors, "notes")}</div>
      <div class="row-actions"><button class="btn primary" data-act="train-checkin-save" ${S.trainCheckinBusy ? "disabled" : ""}>Speichern</button>${draft.id ? `<button class="btn" data-act="train-checkin-cancel">Abbrechen</button>` : ""}</div>
    </section>
    <section class="card card--training" id="checkin-compare-title"><div class="wo-head"><h3>Vergleich</h3>${before && after ? `<span class="tag">${C.daysApart(before, after)} ${C.daysApart(before, after) === 1 ? "Tag" : "Tage"} dazwischen</span>` : ""}</div>
      ${
        all.length < 2
          ? `<p class="muted">Für einen Vergleich werden mindestens zwei Check-Ins benötigt.</p>`
          : `<div class="field"><label for="ck-before">Vorher</label><select id="ck-before" data-dbchange="ckBefore">${opt(options, before?.id)}</select></div>
            <button class="btn sm" data-act="train-checkin-swap">⇄ Tauschen</button>
            <div class="field"><label for="ck-after">Nachher</label><select id="ck-after" data-dbchange="ckAfter">${opt(options, after?.id)}</select></div>
            <div class="checkin-compare">${[before, after]
              .map((c, i) =>
                c
                  ? `<figure class="checkin-compare__side"><img class="checkin-compare__img" src="${esc(dataUrl(c.mime, c.imageData || c.thumbData))}" alt="Check-In ${esc(ckLabel(c))}"><figcaption class="small"><strong>${i === 0 ? "Vorher" : "Nachher"}:</strong> ${esc(ckLabel(c))}${c.notes ? `<span class="sub">${esc(c.notes)}</span>` : ""}</figcaption></figure>`
                  : "",
              )
              .join("")}</div>`
      }
    </section>
    <section class="card card--training"><h3>Information</h3><h4>${esc(C.PHOTO_GUIDE.title)}</h4><p class="muted small">${esc(C.PHOTO_GUIDE.subtitle)}</p>
      <dl class="guide-list">${C.PHOTO_GUIDE.rows.map(([t, v]) => `<div><dt>${esc(t)}</dt><dd class="small">${esc(v)}</dd></div>`).join("")}</dl></section>
    <section class="card card--training"><h3>Alle Check-Ins</h3>
      <div class="field"><label for="ck-filter">Pose</label><select id="ck-filter" data-dbchange="ckFilter"><option value="">Alle Posen</option>${C.poseOptions(all.map((c) => c.pose)).map((o) => `<option value="${esc(o.value)}" ${o.value === poseFilter ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>
      ${
        shown.length
          ? `<ul class="checkin-grid">${shown
              .map(
                (c) => `<li class="checkin-tile"><img src="${esc(dataUrl(c.mime, c.thumbData))}" alt="Check-In ${esc(ckLabel(c))}" loading="lazy">
                <div class="checkin-tile__meta"><strong>${fmtDate(c.date)}</strong><span class="muted small">${c.time ? `${esc(c.time)} Uhr · ` : ""}${esc(C.POSE_LABELS[c.pose])}</span></div>
                <div class="checkin-tile__actions"><button class="linkbtn small" data-act="train-checkin-before" data-arg="${esc(c.id)}">Vorher</button><button class="linkbtn small" data-act="train-checkin-after" data-arg="${esc(c.id)}">Nachher</button>
                  <button class="linkbtn small" data-act="train-checkin-edit" data-arg="${esc(c.id)}">Bearbeiten</button><button class="linkbtn small danger" data-act="train-checkin-delete" data-arg="${esc(c.id)}">Löschen</button></div></li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">Noch keine Check-Ins${poseFilter ? " in dieser Pose" : ""}.</p>`
      }
    </section>`;
}

function syncCheckin() {
  const d = X.S.trainCheckin;
  if (!d) return;
  for (const el of document.querySelectorAll("[data-ckf]")) d[el.dataset.ckf] = el.value;
  const pose = document.querySelector("[data-ckpose]:checked");
  if (pose) d.pose = pose.value;
}

// ------------------------------------------------------------------ Aktionen

export const dbActions = {
  "train-more": (el) => {
    const k = el.dataset.arg;
    X.S[k] = (X.S[k] ?? 30) + 30;
    X.rerender();
  },
  "train-ex-new": () => {
    const S = X.S;
    S.trainExEdit = { id: null, name: "", category: "strength", cardioKind: "", muscleGroup: "", discipline: "", equipment: "", notes: "", resistanceProfiles: [], archived: false };
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
    window.scrollTo(0, 0);
  },
  "train-ex-edit": (el) => {
    const S = X.S;
    const row = [...S.catalog.exercises, ...(S.localExercises ?? [])].find((e) => e.id === el.dataset.arg);
    if (!row) return;
    let profiles = [];
    try {
      profiles = row.resistance_profiles ? JSON.parse(row.resistance_profiles) : [];
    } catch {
      profiles = [];
    }
    S.trainExEdit = { id: row.id, name: row.name, category: row.category ?? "strength", cardioKind: row.cardio_kind ?? "", muscleGroup: row.muscle_group ?? "", discipline: row.discipline ?? "", equipment: row.equipment ?? "", notes: row.notes ?? "", resistanceProfiles: Array.isArray(profiles) ? profiles : [], archived: Boolean(row.archived) };
    S.trainMachine = null;
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
    window.scrollTo(0, 0);
  },
  "train-ex-cancel": () => {
    const S = X.S;
    S.trainExEdit = null;
    S.trainErrors = {};
    S.trainNotice = null;
    X.rerender();
  },
  "train-ex-save": async () => {
    const S = X.S;
    syncExercise();
    const d = S.trainExEdit;
    try {
      const patch = { name: d.name, category: d.category, cardioKind: d.cardioKind || null, muscleGroup: d.muscleGroup, discipline: d.discipline, equipment: d.equipment, notes: d.notes, resistanceProfiles: d.resistanceProfiles, archived: d.archived };
      if (d.id) {
        const row = [...S.catalog.exercises, ...(S.localExercises ?? [])].find((e) => e.id === d.id);
        if (!row) throw new Error("Die Übung gibt es nicht mehr.");
        await saveExerciseRow(row, patch);
      } else {
        TR.saveExercise(S.catalogRaw, S.train, { id: null, ...patch }, { uuid: X.uuid, now: new Date(), all: [...S.catalog.exercises, ...(S.localExercises ?? [])] });
        await X.persistTrain();
      }
      X.setNotice("ok", `Übung „${d.name.trim()}“ gespeichert.`);
      S.trainExEdit = null;
      S.trainErrors = {};
    } catch (e) {
      X.failed(e);
    }
    X.rerender();
  },
  "train-ex-delete": async (el) => {
    const S = X.S;
    const row = [...S.catalog.exercises, ...(S.localExercises ?? [])].find((e) => e.id === el.dataset.arg);
    if (!row || !X.confirmTwice(el, `Nochmal tippen: „${row.name}“ löschen`)) return;
    const { usage } = usageByExercise();
    const inPhoneWorkouts = S.workouts.filter((w) => w.exercises.some((e) => e.exerciseId === row.id)).length;
    try {
      if ((S.localExercises ?? []).some((e) => e.id === row.id) && !S.catalog.exercises.some((e) => e.id === row.id)) {
        if (inPhoneWorkouts > 0) throw new Error(`Die Übung wird noch verwendet (${inPhoneWorkouts}× in Trainingseinheiten, 0× in Plänen) und kann nicht gelöscht werden. Du kannst sie stattdessen archivieren.`);
        S.localExercises = S.localExercises.filter((e) => e.id !== row.id);
        await X.saveNow();
      } else {
        TR.deleteExercise(S.catalogRaw, S.train, row.id, { usedInWorkouts: usage.get(row.id) ?? 0, now: new Date() });
        await X.persistTrain();
      }
      X.setNotice("ok", `„${row.name}“ gelöscht.`);
    } catch (e) {
      X.setNotice("error", e.message);
    }
    X.rerender();
  },
  "train-ex-reset": () => {
    X.S.trainExQuery = "";
    X.S.trainExDisc = "";
    X.rerender();
  },
  "train-machine-reset": () => {
    X.S.trainMachineFilter = null;
    X.S.trainMachineUsed = false;
    X.rerender();
  },
  "train-machine-open": (el) => {
    X.S.trainMachine = el.dataset.arg;
    X.rerender();
    window.scrollTo(0, 0);
  },
  "train-machine-close": () => {
    X.S.trainMachine = null;
    X.rerender();
    requestAnimationFrame(() => document.getElementById("machines-title")?.scrollIntoView({ block: "start" }));
  },
  "train-sport-new": () => {
    const S = X.S;
    S.trainSportEdit = { id: null, name: "", category: "", description: "", image: null, imageKey: null, archived: false };
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
    window.scrollTo(0, 0);
  },
  "train-sport-edit": (el) => {
    const S = X.S;
    const s = sportModels().find((x) => x.id === el.dataset.arg);
    if (!s) return;
    S.trainSportEdit = { id: s.id, name: s.name, category: s.category, description: s.description ?? "", image: s.image, imageKey: s.imageKey, archived: s.archived };
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
    window.scrollTo(0, 0);
  },
  "train-sport-cancel": () => {
    X.S.trainSportEdit = null;
    X.S.trainErrors = {};
    X.S.trainNotice = null;
    X.rerender();
  },
  "train-sport-image-remove": () => {
    syncSport();
    X.S.trainSportEdit.image = null;
    X.rerender();
  },
  "train-sport-save": async () => {
    const S = X.S;
    syncSport();
    const d = S.trainSportEdit;
    try {
      TR.saveSport(S.catalogRaw, S.train, { id: d.id, name: d.name, category: d.category, description: d.description, image: d.image, imageKey: d.imageKey, archived: d.archived }, { uuid: X.uuid, now: new Date() });
      await X.persistTrain();
      X.setNotice("ok", `Sportart „${d.name.trim()}“ gespeichert.`);
      S.trainSportEdit = null;
      S.trainErrors = {};
    } catch (e) {
      X.failed(e);
    }
    X.rerender();
  },
  "train-sport-delete": async (el) => {
    const S = X.S;
    const s = sportModels().find((x) => x.id === el.dataset.arg);
    if (!s || !X.confirmTwice(el, `Nochmal tippen: „${s.name}“ löschen`)) return;
    try {
      TR.deleteSport(S.catalogRaw, S.train, s.id, { usedInWorkouts: s.usageCount, now: new Date() });
      await X.persistTrain();
      X.setNotice("ok", `Sportart „${s.name}“ gelöscht.`);
    } catch (e) {
      X.setNotice("error", e.message);
    }
    X.rerender();
  },
  "train-sport-reset": () => {
    X.S.trainSportQuery = "";
    X.S.trainSportCategory = "";
    X.rerender();
  },
  // Check-Ins
  "train-checkin-save": async () => {
    const S = X.S;
    syncCheckin();
    const d = S.trainCheckin;
    if (!d.id && !d.image) {
      S.trainErrors = { image: "Bitte ein Foto wählen." };
      return X.rerender();
    }
    try {
      TR.saveCheckin(
        S.catalogRaw,
        S.train,
        {
          id: d.id,
          date: d.date,
          time: d.time,
          pose: d.pose,
          notes: d.notes,
          ...(d.image && d.thumb ? { mime: d.image.mime, imageData: d.image.data, thumbData: d.thumb.data, width: d.image.width, height: d.image.height } : {}),
        },
        { uuid: X.uuid, now: new Date() },
      );
      await X.persistTrain();
      X.setNotice("ok", d.id ? "Check-In gespeichert." : `Check-In vom ${fmtDate(d.date)} gespeichert.`);
      S.trainCheckin = null;
      S.trainErrors = {};
    } catch (e) {
      X.failed(e);
    }
    X.rerender();
  },
  "train-checkin-cancel": () => {
    X.S.trainCheckin = null;
    X.S.trainErrors = {};
    X.rerender();
  },
  "train-checkin-edit": (el) => {
    const S = X.S;
    const c = TR.checkinsOf(S.catalogRaw, S.train).find((x) => x.id === el.dataset.arg);
    if (!c) return;
    S.trainCheckin = { id: c.id, date: c.date, time: c.time ?? "", pose: c.pose, notes: c.notes ?? "", image: null, thumb: null };
    S.trainNotice = null;
    S.trainErrors = {};
    X.rerender();
    window.scrollTo(0, 0);
  },
  "train-checkin-delete": async (el) => {
    const S = X.S;
    if (!X.confirmTwice(el, "Nochmal tippen: Foto löschen")) return;
    const c = TR.checkinsOf(S.catalogRaw, S.train).find((x) => x.id === el.dataset.arg);
    if (!c) return;
    TR.deleteCheckin(S.catalogRaw, S.train, c.id, new Date());
    if (S.trainBefore === c.id) S.trainBefore = null;
    if (S.trainAfter === c.id) S.trainAfter = null;
    await X.persistTrain();
    X.setNotice("ok", `Check-In vom ${fmtDate(c.date)} gelöscht.`);
    X.rerender();
  },
  "train-checkin-before": (el) => {
    X.S.trainBefore = el.dataset.arg;
    X.rerender();
    requestAnimationFrame(() => document.getElementById("checkin-compare-title")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "train-checkin-after": (el) => {
    X.S.trainAfter = el.dataset.arg;
    X.rerender();
    requestAnimationFrame(() => document.getElementById("checkin-compare-title")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "train-checkin-swap": () => {
    const S = X.S;
    const C = D.checkin;
    const all = TR.checkinsOf(S.catalogRaw, S.train);
    const pair = C.defaultPair(all);
    const before = all.find((c) => c.id === S.trainBefore) ?? pair?.before ?? null;
    const after = all.find((c) => c.id === S.trainAfter) ?? pair?.after ?? null;
    S.trainBefore = after?.id ?? null;
    S.trainAfter = before?.id ?? null;
    X.rerender();
  },
};

export function dbInput(el) {
  const S = X.S;
  const k = el.dataset.dbinput;
  if (!k) return false;
  if (k === "exQuery") {
    S.trainExQuery = el.value;
    const box = document.getElementById("exercises-title");
    if (box) {
      const pos = el.selectionStart;
      box.outerHTML = exercisesCard();
      const again = document.getElementById("exercise-search");
      again?.focus();
      again?.setSelectionRange(pos, pos);
    }
  } else if (k === "machineQuery") {
    S.trainMachineFilter = { ...(S.trainMachineFilter ?? {}), query: el.value };
    const box = document.getElementById("machines-title");
    if (box) {
      const pos = el.selectionStart;
      box.outerHTML = machinesCard();
      const again = document.getElementById("machine-search");
      again?.focus();
      again?.setSelectionRange(pos, pos);
    }
  } else if (k === "sportQuery") {
    S.trainSportQuery = el.value;
    const box = document.getElementById("sports-title");
    if (box) {
      const pos = el.selectionStart;
      box.outerHTML = sportsCard();
      const again = document.getElementById("sport-search");
      again?.focus();
      again?.setSelectionRange(pos, pos);
    }
  }
  return true;
}

export function dbChange(el) {
  const S = X.S;
  if (el.dataset.mfilter) {
    S.trainMachineFilter = { ...(S.trainMachineFilter ?? {}), [el.dataset.mfilter]: el.value };
    X.rerender();
    return true;
  }
  if (el.dataset.ckpose !== undefined) {
    syncCheckin();
    X.rerender();
    return true;
  }
  const k = el.dataset.dbchange;
  if (!k) return false;
  if (k === "exArchived") S.trainExArchived = el.checked;
  else if (k === "exDisc") S.trainExDisc = el.value;
  else if (k === "exCategory") syncExercise();
  else if (k === "machineUsed") S.trainMachineUsed = el.checked;
  else if (k === "sportArchived") S.trainSportArchived = el.checked;
  else if (k === "sportCategory") S.trainSportCategory = el.value;
  else if (k === "ckBefore") S.trainBefore = el.value;
  else if (k === "ckAfter") S.trainAfter = el.value;
  else if (k === "ckFilter") S.trainPoseFilter = el.value;
  else if (k === "sportImage") {
    syncSport();
    const file = el.files?.[0];
    if (!file) return true;
    loadImage(file)
      .then((img) => {
        const r = draw(img, 480, 0.8);
        S.trainSportEdit.image = `data:${r.mime};base64,${r.data}`;
        S.trainErrors = {};
      })
      .catch((e) => {
        S.trainErrors = { image: e.message };
      })
      .finally(() => X.rerender());
    return true;
  } else if (k === "checkinImage") {
    syncCheckin();
    const file = el.files?.[0];
    if (!file) return true;
    S.trainCheckinBusy = true;
    X.rerender();
    loadImage(file)
      .then((img) => {
        S.trainCheckin.image = draw(img, 1600, 0.85);
        S.trainCheckin.thumb = draw(img, 360, 0.8);
        S.trainErrors = {};
      })
      .catch((e) => {
        S.trainErrors = { image: e.message };
      })
      .finally(() => {
        S.trainCheckinBusy = false;
        X.rerender();
      });
    return true;
  }
  X.rerender();
  return true;
}

void F;
