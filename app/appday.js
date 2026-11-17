// LIFESPAN OS Mobil – „Heute“ mit Tageswechsel wie am PC (1.48.0, `lib/appDay.ts`, Einstellung
// `ui.day_start`): bis zu dieser Uhrzeit (00:00 bis 12:00) zählt alles noch zum Vortag.

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
