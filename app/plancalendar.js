// LIFESPAN OS Mobil – Training → Pläne als Kalender (1.108.0, wie PC 1.0.182, Wunsch 23.11.2026).
// Alle Termine der Pläne im Monat (dazu getrackte Einheiten). Tag antippen zeigt seine Termine;
// ein Termin lässt sich auf einen anderen Tag, eine andere Uhrzeit oder Dauer legen, löschen bzw.
// heute starten – bei Wochenterminen nur dieser Termin oder jede Woche. „+ Training planen“ legt
// einen Kalendertermin an. Regeln aus `pcdomain.js` (`workoutTimeline`, wie am PC).

import * as D from "./pcdomain.js";
import * as P from "./pcdb.js";
import * as TR from "./trainingdata.js";
import * as PS from "./pcsettings.js";
import { buildDb, today } from "./diary.js";
import { esc, fmtDate, monthGrid, persistTrain, X } from "./training.js";

const WT = () => D.workoutTimeline;
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAYS = { 1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag", 6: "Samstag", 7: "Sonntag" };
const pad2 = (n) => String(n).padStart(2, "0");
const shortDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isoMinus(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function weekdayOf(iso) {
  const d = new Date(`${iso}T12:00:00`).getDay();
  return d === 0 ? 7 : d;
}

function plans() {
  const S = X.S;
  try {
    return TR.plansOf(S.catalogRaw, S.train, S.catalog?.exercises ?? []);
  } catch {
    return [];
  }
}

function settingsOf(db) {
  return {
    skips: WT().parseSkips(db.settings?.get?.(WT().TRAINING_SKIPS_SETTING) ?? null),
    durations: WT().parseDurations(db.settings?.get?.(WT().TRAINING_DURATIONS_SETTING) ?? null),
  };
}

async function putSetting(key, value) {
  const S = X.S;
  S.pcsettings = PS.normSync(S.pcsettings);
  const changed = PS.setSetting(S.pcsettings, key, value, buildDb().settings.get(key) ?? null);
  if (changed) await X.store.set("pcsettings", S.pcsettings);
}

/** Kalender der Termine (Training → Pläne → Kalender). */
export function planCalendarHtml() {
  const S = X.S;
  const t = today();
  const ym = S.planMonth ?? { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) };
  const weeks = monthGrid(ym.year, ym.month);
  const first = weeks[0][0].date;
  const last = weeks[weeks.length - 1][6].date;
  const db = buildDb();
  const list = plans();
  const entries = WT().plannedEntries(list, first, last, settingsOf(db));
  const byDate = new Map();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const done = new Map();
  try {
    for (const w of P.workoutsBetween(db, first, last)) done.set(w.date, [...(done.get(w.date) ?? []), w]);
  } catch {
    // ohne Einheiten
  }
  const prefix = `${ym.year}-${pad2(ym.month)}`;
  const count = entries.filter((e) => e.date.startsWith(prefix)).length;
  const sel = S.planCalDay && S.planCalDay >= first && S.planCalDay <= last ? S.planCalDay : null;
  const cells = weeks
    .flat()
    .map((c) => {
      const p = byDate.get(c.date) ?? [];
      const w = done.get(c.date) ?? [];
      const marks = p.length || w.length ? `<span class="tcal__dots">${p.map(() => `<i class="pcal-dot"></i>`).join("")}${w.map(() => `<i class="pcal-dot is-done"></i>`).join("")}</span>` : "";
      return `<button type="button" class="tcal__day ${c.inMonth ? "" : "is-outside"} ${c.date === t ? "is-today" : ""} ${c.date === sel ? "is-selected" : ""}" data-act="pcal-day" data-arg="${c.date}" aria-label="${fmtDate(c.date)}${p.length ? `: ${p.length} ${p.length === 1 ? "Termin" : "Termine"}` : ""}"><span>${c.day}</span>${marks}</button>`;
    })
    .join("");
  const edit = S.planCalEdit;
  let detail = "";
  if (sel) {
    const p = byDate.get(sel) ?? [];
    const w = done.get(sel) ?? [];
    detail = `<div class="tcal__detail"><b>${fmtDate(sel)}</b>${p
      .map((e) => {
        const open = edit && edit.kind === "edit" && edit.key === e.key;
        return `<button class="train-row tcal__entry ${open ? "is-open" : ""}" data-act="pcal-open" data-arg="${esc(e.key)}"><span class="train-row__main"><strong>${esc(e.dayName)}</strong><span class="muted small">${esc(e.planName)} · ${e.time ? `${esc(e.time)} Uhr · ` : ""}${e.durationMin} min${e.slot.weekday !== null ? ` · jeden ${WEEKDAYS[e.slot.weekday]}` : ""}</span></span><span aria-hidden="true">✎</span></button>${open ? editForm(edit, e, t) : ""}`;
      })
      .join("")}${w.map((x) => `<span class="pcal-done">✓ ${esc(x.title)}${x.start_time ? ` · ${esc(x.start_time)} Uhr` : ""}</span>`).join("")}${
      !p.length && !w.length ? `<span class="muted small">Kein Termin an diesem Tag.</span>` : ""
    }${sel >= t ? (edit && edit.kind === "new" && edit.date === sel ? newForm(edit, list) : `<button class="btn sm" data-act="pcal-new" data-arg="${sel}">+ Training planen</button>`) : ""}</div>`;
  }
  return `<div class="tcal pcal"><div class="tcal__head"><button class="btn sm ghost" data-act="pcal-month" data-arg="-1" aria-label="Vorheriger Monat">‹</button><b>${MONTHS[ym.month - 1]} ${ym.year}</b><button class="btn sm ghost" data-act="pcal-month" data-arg="1" aria-label="Nächster Monat">›</button><span class="muted small">${count} ${count === 1 ? "Termin" : "Termine"}</span></div>
    <div class="tcal__grid">${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => `<span class="tcal__wd">${d}</span>`).join("")}${cells}</div>
    <p class="muted small"><i class="pcal-dot"></i> geplant · <i class="pcal-dot is-done"></i> erfasst</p>${detail}</div>`;
}

function editForm(edit, e, t) {
  const weekly = e.slot.weekday !== null;
  return `<div class="pcal-form">
    <div class="row"><label class="field"><span>Tag</span><input type="date" id="pcal-date" value="${esc(edit.date)}"></label><label class="field"><span>Uhrzeit</span><input type="time" id="pcal-time" value="${esc(edit.time)}"></label><label class="field"><span>Dauer (Min.)</span><input type="number" id="pcal-dur" min="5" max="600" step="5" inputmode="numeric" value="${esc(edit.dur)}"></label></div>
    ${weekly ? `<div class="pcal-scope"><label><input type="radio" name="pcal-scope" value="day" ${edit.scope === "day" ? "checked" : ""}> Nur dieser Termin (${shortDate(e.date)})</label><label><input type="radio" name="pcal-scope" value="series" ${edit.scope === "series" ? "checked" : ""}> Jeden ${WEEKDAYS[e.slot.weekday]}</label></div>` : ""}
    ${edit.error ? `<p class="field-error">${esc(edit.error)}</p>` : ""}
    ${
      edit.ask
        ? `<div class="row"><span class="small">${weekly && edit.scope === "day" ? `Training am ${shortDate(e.date)} auslassen?` : "Termin aus dem Plan entfernen?"}</span><button class="btn sm danger" data-act="pcal-del">Ja</button><button class="btn sm ghost" data-act="pcal-ask" data-arg="0">Nein</button></div>`
        : `<div class="row"><button class="btn sm primary" data-act="pcal-save">✓ Speichern</button><button class="btn sm" data-act="pcal-ask" data-arg="1">🗑 Löschen</button>${
            e.date === t && !X.S.active ? `<button class="btn sm" data-act="train-start-plan-day" data-arg="${esc(e.dayId)}">▶ Starten</button>` : ""
          }<button class="btn sm ghost" data-act="pcal-cancel">Abbrechen</button></div>`
    }</div>`;
}

function newForm(edit, list) {
  const opts = list
    .filter((p) => !p.archived)
    .flatMap((p) => p.days.map((d) => ({ key: `${p.id}:${d.id}`, label: `${p.name} · ${d.name}` })));
  if (!opts.length) return `<span class="muted small">Noch kein Plan mit Trainingstagen.</span>`;
  return `<div class="pcal-form">
    <label class="field"><span>Trainingstag</span><select id="pcal-daykey">${opts.map((o) => `<option value="${esc(o.key)}" ${o.key === edit.dayKey ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>
    <div class="row"><label class="field"><span>Uhrzeit</span><input type="time" id="pcal-time" value="${esc(edit.time)}"></label><label class="field"><span>Dauer (Min.)</span><input type="number" id="pcal-dur" min="5" max="600" step="5" inputmode="numeric" value="${esc(edit.dur)}"></label></div>
    ${edit.error ? `<p class="field-error">${esc(edit.error)}</p>` : ""}
    <div class="row"><button class="btn sm primary" data-act="pcal-save">✓ Planen</button><button class="btn sm ghost" data-act="pcal-cancel">Abbrechen</button></div></div>`;
}

/** Eingaben des offenen Formulars übernehmen. */
function readForm() {
  const edit = X.S.planCalEdit;
  if (!edit) return null;
  const v = (id) => document.getElementById(id)?.value;
  if (v("pcal-date")) edit.date = v("pcal-date");
  if (v("pcal-time") !== undefined) edit.time = v("pcal-time") ?? "";
  if (v("pcal-dur") !== undefined) edit.dur = v("pcal-dur") ?? "";
  if (v("pcal-daykey")) edit.dayKey = v("pcal-daykey");
  const scope = document.querySelector('input[name="pcal-scope"]:checked')?.value;
  if (scope === "day" || scope === "series") edit.scope = scope;
  return edit;
}

function check(edit) {
  if (edit.time !== "" && !TIME.test(edit.time)) throw new Error("Bitte eine Uhrzeit wie 18:30 angeben.");
  const n = Number(String(edit.dur).replace(",", "."));
  if (!Number.isFinite(n) || n < 5 || n > 600) throw new Error("Dauer: 5 bis 600 Minuten.");
  return Math.round(n);
}

function entryOf(key) {
  const [planId, dayId, idx, date] = String(key).split(":");
  const list = plans();
  const plan = list.find((p) => p.id === planId);
  const day = plan?.days.find((d) => d.id === dayId);
  const slot = day?.slots[Number(idx)];
  if (!plan || !day || !slot) return null;
  return { plan, day, slot, slotIndex: Number(idx), date };
}

function planInput(plan, dayId, slots) {
  return { ...plan, days: plan.days.map((d) => ({ ...d, slots: d.id === dayId ? slots : d.slots.map((s) => ({ ...s })), exercises: d.exercises.map((e) => ({ ...e })) })) };
}

const allExercises = () => [...(X.S.catalog?.exercises ?? []), ...(X.S.localExercises ?? [])];

async function save() {
  const S = X.S;
  const edit = readForm();
  if (!edit) return;
  const db = buildDb();
  const { skips, durations } = settingsOf(db);
  const keepFrom = isoMinus(today(), 30);
  try {
    const dur = check(edit);
    const time = edit.time === "" ? null : edit.time;
    if (edit.kind === "new") {
      const [planId, dayId] = String(edit.dayKey).split(":");
      const plan = plans().find((p) => p.id === planId);
      const day = plan?.days.find((d) => d.id === dayId);
      if (!plan || !day) throw new Error("Bitte einen Trainingstag wählen.");
      TR.savePlan(S.catalogRaw, S.train, planInput(plan, day.id, [...day.slots.map((s) => ({ ...s })), { weekday: null, date: edit.date, time }]), { uuid: X.uuid, now: new Date(), exercises: allExercises() });
      await persistTrain();
      if (dur !== WT().DEFAULT_PLANNED_MIN || durations[day.id] !== undefined) await putSetting(WT().TRAINING_DURATIONS_SETTING, JSON.stringify(WT().setDuration(durations, day.id, dur, edit.date, keepFrom)));
      S.planCalEdit = null;
      X.toast(`„${day.name}“ am ${fmtDate(edit.date)}${time ? ` um ${time} Uhr` : ""} geplant.`);
      return X.rerender();
    }
    const r = entryOf(edit.key);
    if (!r) throw new Error("Der Termin ist nicht mehr im Plan.");
    const weekly = r.slot.weekday !== null;
    if (edit.date !== r.date || time !== r.slot.time) {
      const next = WT().rescheduledSlots(r.day.slots, r.slotIndex, edit.date, time, edit.scope);
      TR.savePlan(S.catalogRaw, S.train, planInput(r.plan, r.day.id, next.slots), { uuid: X.uuid, now: new Date(), exercises: allExercises() });
      await persistTrain();
      if (next.skip) await putSetting(WT().TRAINING_SKIPS_SETTING, JSON.stringify(WT().addSkip(skips, WT().skipKey(r.day.id, r.slot, r.date), keepFrom)));
    }
    if (dur !== WT().plannedDuration(durations, r.day.id, r.date)) {
      const perDay = !weekly || edit.scope === "day";
      await putSetting(WT().TRAINING_DURATIONS_SETTING, JSON.stringify(WT().setDuration(durations, r.day.id, dur, perDay ? edit.date : null, keepFrom)));
    }
    S.planCalEdit = null;
    S.planCalDay = edit.date;
    X.toast(weekly && edit.scope === "series" ? `„${r.day.name}“ jetzt jeden ${WEEKDAYS[weekdayOf(edit.date)]}${time ? ` um ${time} Uhr` : ""}.` : `„${r.day.name}“ am ${fmtDate(edit.date)} gespeichert.`);
  } catch (e) {
    edit.error = e.message;
  }
  X.rerender();
}

async function remove() {
  const S = X.S;
  const edit = readForm();
  if (!edit || edit.kind !== "edit") return;
  const r = entryOf(edit.key);
  if (!r) return;
  const db = buildDb();
  const { skips } = settingsOf(db);
  const onlyDay = r.slot.weekday !== null && edit.scope === "day";
  try {
    if (onlyDay) await putSetting(WT().TRAINING_SKIPS_SETTING, JSON.stringify(WT().addSkip(skips, WT().skipKey(r.day.id, r.slot, r.date), isoMinus(today(), 30))));
    else {
      TR.savePlan(S.catalogRaw, S.train, planInput(r.plan, r.day.id, r.day.slots.filter((_, i) => i !== r.slotIndex)), { uuid: X.uuid, now: new Date(), exercises: allExercises() });
      await persistTrain();
    }
    S.planCalEdit = null;
    X.toast(onlyDay ? `„${r.day.name}“ am ${fmtDate(r.date)} ausgelassen.` : `Termin „${r.day.name}“ aus dem Plan entfernt.`);
  } catch (e) {
    edit.error = e.message;
  }
  X.rerender();
}

export const planCalActions = {
  "plan-view": (el) => {
    X.S.plansView = el.dataset.arg === "calendar" ? "calendar" : "list";
    try {
      localStorage.setItem("lifespan.plansView", X.S.plansView);
    } catch {
      // nur für diese Sitzung
    }
    X.rerender();
  },
  "pcal-month": (el) => {
    const t = today();
    const cur = X.S.planMonth ?? { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) };
    const n = cur.year * 12 + cur.month - 1 + Number(el.dataset.arg || 0);
    X.S.planMonth = { year: Math.floor(n / 12), month: (n % 12) + 1 };
    X.S.planCalDay = null;
    X.S.planCalEdit = null;
    X.rerender();
  },
  "pcal-day": (el) => {
    X.S.planCalDay = X.S.planCalDay === el.dataset.arg ? null : el.dataset.arg;
    X.S.planCalEdit = null;
    X.rerender();
  },
  "pcal-open": (el) => {
    const S = X.S;
    const key = el.dataset.arg;
    if (S.planCalEdit?.key === key) {
      S.planCalEdit = null;
      return X.rerender();
    }
    const r = entryOf(key);
    if (!r) return;
    const { durations } = settingsOf(buildDb());
    S.planCalEdit = { kind: "edit", key, date: r.date, time: r.slot.time ?? "", dur: String(WT().plannedDuration(durations, r.day.id, r.date)), scope: "day", ask: false, error: null };
    X.rerender();
  },
  "pcal-new": (el) => {
    X.S.planCalEdit = { kind: "new", date: el.dataset.arg, dayKey: "", time: "", dur: String(WT().DEFAULT_PLANNED_MIN), error: null };
    X.rerender();
  },
  "pcal-ask": (el) => {
    const edit = readForm();
    if (edit) edit.ask = el.dataset.arg === "1";
    X.rerender();
  },
  "pcal-cancel": () => {
    X.S.planCalEdit = null;
    X.rerender();
  },
  "pcal-save": () => save(),
  "pcal-del": () => remove(),
};

/** Liste oder Kalender (gemerkt im Browser). */
export function plansView() {
  const S = X.S;
  if (!S.plansView) {
    try {
      S.plansView = localStorage.getItem("lifespan.plansView") === "calendar" ? "calendar" : "list";
    } catch {
      S.plansView = "list";
    }
  }
  return S.plansView;
}
