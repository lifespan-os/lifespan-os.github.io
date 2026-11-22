// LIFESPAN OS Mobil – „Heute“ mit Tageswechsel wie am PC (1.48.0, `lib/appDay.ts`, Einstellung
// `ui.day_start`): bis zu dieser Uhrzeit (00:00 bis 12:00) zählt alles noch zum Vortag.
// Seit 1.102.0 mit Verlauf wie am PC (`ui.day_start_history`): Eine Änderung gilt ab dem
// aktuellen Tag, vergangene Tage behalten ihren Tageswechsel.

let dayStartMin = 0;

const p = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

/** Tageswechsel setzen („HH:MM“, ungültig oder fehlend = 00:00). */
export function setDayStart(time) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time ?? "").trim());
  const v = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  dayStartMin = v <= 720 ? v : 0;
}

export const dayStartMinutes = () => dayStartMin;

/** „Heute“ der App: vor dem Tageswechsel noch der Vortag (wie `appDayFor` am PC). */
export function appDay(now = new Date()) {
  if (now.getHours() * 60 + now.getMinutes() >= dayStartMin) return ymd(now);
  const d = new Date(now.getTime());
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (t) => {
  const m = TIME.exec(String(t ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
let history = [];

/** Verlauf aus der Einstellung lesen (wie `parseDayStartHistory` am PC). */
export function parseDayStartHistory(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((e) => e && typeof e.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.from) && (minutesOf(e.time) ?? 999) <= 720)
      .map((e) => ({ from: e.from, time: e.time }))
      .sort((a, b) => a.from.localeCompare(b.from));
  } catch {
    return [];
  }
}

/** Verlauf nach einer Änderung am Tag `today` (wie `recordDayStartChange` am PC). */
export function recordDayStartChange(list, today, previous, next) {
  const base = list.length > 0 ? [...list] : [{ from: "0000-01-01", time: previous }];
  const kept = base.filter((h) => h.from < today);
  const last = kept[kept.length - 1];
  return last && last.time === next ? kept : [...kept, { from: today, time: next }];
}

export function setDayStartHistory(raw) {
  history = Array.isArray(raw) ? raw : parseDayStartHistory(raw);
}

export const dayStartHistory = () => history;

/** Tageswechsel (Minuten) am Tag `date`: Verlauf, sonst die aktuelle Einstellung. */
export function dayStartMinutesOn(date) {
  let found = null;
  for (const h of history) if (h.from <= date) found = h.time;
  const m = found === null ? null : minutesOf(found);
  return m ?? dayStartMin;
}
