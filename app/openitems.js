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

const OI = () => D.openItems;
const WT = () => D.workoutTimeline;

let cache = { at: 0, items: [] };

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
  try {
    const m = missingAll(db);
    dueValues = m.values.length + (m.grip ? 1 : 0);
  } catch {
    dueValues = 0;
  }
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
  let hrtDue = [];
  try {
    if (String(PS.effective(S.catalog, S.pcsettings, "secret_protocols")) === "1") {
      hrtDue = D.hrtDueToday(SD.hrtEntriesOf(S.catalog, S.super), t).map((d) => d.hormone);
    }
  } catch {
    hrtDue = [];
  }
  return OI().openItems({ status, dueValues, todos, planned, workoutsToday, hrtDue });
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
  return null;
}

/** Kleiner oranger Punkt (für Reiter) */
export const dotHtml = () => `<i class="tab__dot" aria-label="offen"></i>`;
