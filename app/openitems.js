// LIFESPAN OS Mobil – offene Punkte des Tages als orange Punkte (1.109.0, wie PC 1.0.183,
// Wunsch 23.11.2026). Ein Bereich im Menü bzw. in der unteren Leiste bekommt einen Punkt, solange
// heute dort noch etwas einzutragen oder zu erledigen ist; der Punkt führt direkt dorthin, der
// passende Reiter (z. B. „Erfassen“) trägt ebenfalls einen Punkt. Regeln aus `pcdomain.js`
// (`openItems`, wie am PC): Tagesüberblick, fällige Körperwerte, To-dos, geplante Trainings ohne
// erfasste Einheit, fällige Hormongabe.

import * as D from "./pcdomain.js";
import * as O from "./pcoverview.js";
import * as P from "./pcdb.js";
import * as T from "./todosdata.js";
import * as TR from "./trainingdata.js";
import * as SD from "./superdata.js";
import * as PS from "./pcsettings.js";
import { missingAll } from "./extras.js";
import { buildDb, today } from "./diary.js";
import { S } from "./appbase.js";
import * as store from "./store.js";

const OI = () => D.openItems;
const WT = () => D.workoutTimeline;

const HS = () => D.hrtSchedule;

let cache = { at: 0, items: [] };
/** Hormongaben mit festem Intervall: höchste Stufe und Warnungen (1.113.0, wie PC 1.0.189) */
let hrtState = { stage: null, alarms: [] };

/** Offene Punkte für heute; innerhalb einer Sekunde aus dem Zwischenspeicher (mehrere Leisten). */
export function openItemsNow() {
  if (!S.catalog || !OI()) return [];
  const now = Date.now();
  if (now - cache.at < 1000) return cache.items;
  let items = [];
  try {
    items = compute();
  } catch (e) {
    console.error(e);
  }
  cache = { at: now, items };
  return items;
}

/** Nach Änderungen sofort neu berechnen. */
export function resetOpenItems() {
  cache = { at: 0, items: [] };
}

function compute() {
  const t = today();
  const db = buildDb();
  const status = D.dayStatus(O.overviewFor(db, t), P.intakesOn(db, t).length).rows;
  let dueValues = 0;
  // Punkt bis aufs Feld (1.145.0, wie PC 1.0.215): fällige Messgrößen und Griffkraft
  let dueFields = [];
  try {
    const m = missingAll(db);
    dueValues = m.values.length + (m.grip ? 1 : 0);
    dueFields = [...m.values.map((v) => `metric:${v.metricId}`), ...(m.grip ? ["grip"] : [])];
  } catch {
    dueValues = 0;
  }
  // Offene To-dos der letzten Tage zuerst auf heute ziehen (1.156.0, wie openItemsStore.ts am PC)
  if (S.todos && T.carryForward(S.catalog, S.todos, t)) store.set("todos", S.todos).catch(() => {});
  const todos = T.todosFor(S.catalog, S.todos, t)
    .filter((x) => !Number(x.done))
    .map((x) => ({ id: x.id, text: x.text }));
  let planned = [];
  try {
    const plans = TR.plansOf(S.catalogRaw, S.train, S.catalog?.exercises ?? []);
    const skips = WT().parseSkips(db.settings?.get?.(WT().TRAINING_SKIPS_SETTING) ?? null);
    planned = WT()
      .plannedEntries(plans, t, t, { skips })
      .map((e) => ({ key: e.key, title: e.dayName, time: e.time }));
  } catch {
    planned = [];
  }
  let workoutsToday = 0;
  try {
    workoutsToday = P.workoutsBetween(db, t, t).length + (S.active ? 1 : 0);
  } catch {
    workoutsToday = 0;
  }
  // Hormongabe: festes Intervall nach Uhrzeit (Punkt, nach 6 h Leuchten, nach 12 h Warnung),
  // sonst der geschätzte Abstand wie bisher
  let hrtDue = [];
  hrtState = { stage: null, alarms: [] };
  try {
    if (String(PS.effective(S.catalog, S.pcsettings, "secret_protocols")) === "1") {
      const all = SD.hrtEntriesOf(S.catalog, S.super);
      const intervals = HS().parseHrtIntervals(PS.effective(S.catalog, S.pcsettings, HS().HRT_INTERVALS_SETTING));
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const fixed = HS().hrtSchedules(all, intervals, date, time);
      hrtState = { stage: HS().topStage(fixed), alarms: fixed.filter((x) => x.stage === "alarm") };
      hrtDue = [
        ...fixed.filter((x) => x.stage !== null).map((x) => x.hormone),
        ...D.hrtDueToday(all, t)
          .filter((d) => !intervals[HS().hrtKey(d.hormone)])
          .map((d) => d.hormone),
      ];
    }
  } catch (e) {
    console.error(e);
    hrtDue = [];
  }
  return OI().openItems({ status, dueValues, dueFields, todos, planned, workoutsToday, hrtDue });
}

/** Stand der Hormongaben (nach `openItemsNow`) */
export function hrtStateNow() {
  openItemsNow();
  return hrtState;
}

const ACK_KEY = "lifespan.hrt_alarm_ack";
function readAck() {
  try {
    const list = JSON.parse(localStorage.getItem(ACK_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Offene Warnungen (seit 12 Stunden überfällig, noch nicht weggeklickt) */
export function openHrtAlarms() {
  const ack = readAck();
  return hrtStateNow().alarms.filter((a) => !ack.includes(HS().alarmKey(a)));
}

/** Warnungen wegklicken (je Präparat und Termin einmal) */
export function ackHrtAlarms() {
  const keys = [...readAck(), ...openHrtAlarms().map((a) => HS().alarmKey(a))].slice(-50);
  try {
    localStorage.setItem(ACK_KEY, JSON.stringify(keys));
  } catch {
    // ohne Speicher erscheint die Warnung beim nächsten Öffnen erneut
  }
}

/** Warnung als Dialog (muss aktiv weggeklickt werden) */
export function hrtAlarmHtml(esc) {
  const list = openHrtAlarms();
  if (!list.length) return "";
  return `<div class="hrt-alarm-backdrop" role="presentation"><div class="hrt-alarm card" role="alertdialog" aria-modal="true" aria-labelledby="hrt-alarm-title">
    <h3 id="hrt-alarm-title">Hormongabe überfällig</h3>
    <p>Seit mehr als 12 Stunden ist keine Gabe eingetragen:</p>
    <ul>${list.map((a) => `<li>${esc(HS().alarmText(a))}</li>`).join("")}</ul>
    <p class="muted small">Trage die Gabe ein oder vermerke sie als „ausgelassen“ – dann endet die Erinnerung.</p>
    <div class="row-actions"><button class="btn primary" data-act="hrt-alarm-go">Gabe eintragen</button><button class="btn" data-act="hrt-alarm-ok">Verstanden</button></div>
  </div></div>`;
}

/** Punkte je Bereich */
export const marksOf = (items, section) => OI()?.itemsOf(items, section) ?? [];

/** Reiter eines Bereichs mit offenen Punkten */
export const openTabsOf = (section) => {
  const items = openItemsNow();
  return OI()?.openTabs(items, section) ?? new Set();
};

/** Kurztext („2 offen: …“) */
export const markTitle = (items) => OI()?.markTitle(items) ?? "";

/** Reiter am Handy für das Ziel am PC (Body „entry“ öffnet direkt „Werte erfassen“). */
export function phoneTab(item) {
  if (!item?.tab) return null;
  if (item.section === "training" && (item.tab === "plans" || item.tab === "neat")) return item.tab;
  if (item.section === "body" && item.tab === "entry") return "entry";
  if (item.section === "superhuman" && item.tab === "hrt") return "hrt";
  return null;
}

/**
 * Orange Punkte auf der Seite (1.143.0, wie PC 1.0.213, Wunsch 25.11.2026): Knöpfe und
 * Überschriften, über die heute noch etwas einzutragen ist, bekommen die Klasse `open-mark`
 * (Punkt per CSS). Zuordnung offener Punkt → Stelle der Handy-Ansicht; „todo-*“ = alle Punkte,
 * deren Schlüssel so beginnt (wie `marksMatch` am PC).
 */
export const PAGE_MARKS = [
  ["status-sleep", '[data-act="sleep-new"]'],
  ["status-hrv status-restingHr", '[data-act="vitals-new"]'],
  ["status-recovery", '[data-act="rec-today"]'],
  ["status-steps", 'label[for="neat-steps"]'],
  ["status-nutrition", '[data-act="diary-add"], .meals-card > .card__head > h3'],
  ["body-values", '[data-act="body-day-open"]'],
  ["hrt-*", '[data-act="hrt-new"]'],
  ["todo-*", '[data-act="todo-add"]'],
  ["plan-* train-*", '[data-act="train-start-plan-day"], [data-act="train-start-day"]'],
];

/** Passt einer der offenen Punkte zu den Stichwörtern („status-hrv status-restingHr“, „todo-*“)? */
export function marksMatch(items, tokens) {
  const list = String(tokens ?? "").split(/\s+/).filter(Boolean);
  if (!list.length) return false;
  const hit = (name, t) => (t.endsWith("*") ? name.startsWith(t.slice(0, -1)) : name === t);
  return items.some((i) => list.some((t) => hit(i.key, t) || (i.fields ?? []).some((f) => hit(f, t))));
}

/** Punkte in `root` setzen bzw. entfernen (nach jedem Neuzeichnen) */
export function applyPageMarks(root, items = openItemsNow()) {
  if (!root?.querySelectorAll) return;
  const on = new Set();
  for (const [tokens, selector] of PAGE_MARKS) {
    if (!marksMatch(items, tokens)) continue;
    root.querySelectorAll(selector).forEach((el) => on.add(el));
  }
  // Elemente mit eigenen Stichwörtern (1.145.0): `data-open="metric:<id> grip"` wie am PC
  root.querySelectorAll("[data-open]").forEach((el) => {
    if (marksMatch(items, el.dataset.open)) on.add(el);
  });
  root.querySelectorAll(".open-mark").forEach((el) => {
    if (!on.has(el)) el.classList.remove("open-mark");
  });
  on.forEach((el) => el.classList.add("open-mark"));
}

/** Kleiner oranger Punkt (für Reiter) */
export const dotHtml = () => `<i class="tab__dot" aria-label="offen"></i>`;
