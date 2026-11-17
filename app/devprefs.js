// LIFESPAN OS Mobil – Einstellungen nur für dieses Handy (1.48.0). Reine Logik ohne Oberfläche.
//
// Entscheidung des Nutzers vom 17.11.2026: Darstellung, Erinnerungen, Schnellerfassung und die
// Einstellungen unter Import/Export gelten je Gerät (wie am PC „nur auf diesem PC“). Sie liegen in
// `S.prefs` (Speicher „prefs“) und gehen nicht an den PC.

import * as D from "./pcdomain.js";

export const THEMES = [
  ["light", "Hell"],
  ["dark", "Dunkel"],
  ["system", "Wie das Handy"],
];
export const BAR_LABELS = [
  ["both", "Symbole und Text"],
  ["icons", "Nur Symbole"],
];
export const SEND_REMIND_DAYS = [0, 1, 2, 3, 7, 14];

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Gespeicherte Einstellungen prüfen; Unbekanntes fällt auf den Standard zurück. */
export function normPrefs(prefs) {
  const p = prefs && typeof prefs === "object" ? prefs : {};
  const theme = THEMES.some(([v]) => v === p.theme) ? p.theme : "light";
  const barLabels = BAR_LABELS.some(([v]) => v === p.barLabels) ? p.barLabels : "both";
  const reminders = D.parseReminderSettings(p.reminders ? JSON.stringify(p.reminders) : null);
  const quick = { order: Array.isArray(p.quick?.order) ? p.quick.order.filter((x) => typeof x === "string") : [], hidden: Array.isArray(p.quick?.hidden) ? p.quick.hidden.filter((x) => typeof x === "string") : [] };
  const t = p.transfer ?? {};
  const transfer = {
    remindDays: SEND_REMIND_DAYS.includes(t.remindDays) ? t.remindDays : 0,
    autoMark: t.autoMark === true,
  };
  const remShown = Array.isArray(p.remShown) ? p.remShown.filter((x) => typeof x === "string") : [];
  return { ...p, theme, barLabels, reminders, quick, transfer, remShown };
}

/** Wirksames Design: „system“ folgt dem Handy. */
export const resolvedTheme = (theme, systemDark) => (theme === "system" ? (systemDark ? "dark" : "light") : theme === "dark" ? "dark" : "light");

/** Erinnerung ein-/ausschalten oder Uhrzeit ändern; ungültige Uhrzeit → `false`. */
export function setReminder(prefs, kind, { on, time }) {
  if (!D.REMINDER_KINDS.includes(kind)) return false;
  if (time !== undefined && !TIME.test(String(time).trim())) return false;
  const r = prefs.reminders[kind];
  prefs.reminders = { ...prefs.reminders, [kind]: { on: on ?? r.on, time: time === undefined ? r.time : String(time).trim() } };
  return true;
}

/**
 * Fällige Erinnerungen (wie am PC `pendingKinds` + `dueNotices`): ab der Uhrzeit, höchstens einmal
 * je Tag, nur solange für heute nichts eingetragen ist. `status` = { weighed, supplements, hrtDue }.
 * `shown` = schon gezeigte Schlüssel („art:Tag“). Liefert alle fälligen und die noch nicht gezeigten.
 */
export function remindersDue(prefs, today, time, status, allowHrt) {
  const kinds = D.pendingKinds(prefs.reminders, today, time, new Set(), allowHrt);
  const due = D.dueNotices(kinds, today, status);
  const shown = new Set(prefs.remShown ?? []);
  return { due, fresh: due.filter((n) => !shown.has(n.key)) };
}

/** Gezeigte Erinnerungen merken (nur die des Tages bleiben). */
export function markShown(prefs, keys, today) {
  prefs.remShown = [...new Set([...(prefs.remShown ?? []).filter((k) => k.endsWith(today)), ...keys])];
}

/** Stand für die Erinnerungen aus den Daten (`db` aus buildDb). */
export function reminderStatus(db, today, weightMetricId, hrtEntries = []) {
  const weighed = (db.body ?? []).some((r) => r.metric_id === weightMetricId && r.date === today);
  const supplements = (db.intakesByDate?.get(today) ?? []).length > 0;
  return { weighed, supplements, hrtDue: D.hrtDueToday(hrtEntries, today) };
}

/** Einträge der Schnellerfassung in gewählter Reihenfolge; `all` = mit ausgeblendeten. */
export function quickItems(items, quick, { all = false } = {}) {
  const ids = items.map((q) => q.id);
  const order = [...quick.order.filter((id) => ids.includes(id)), ...ids.filter((id) => !quick.order.includes(id))];
  const list = order.map((id) => items.find((q) => q.id === id));
  return all ? list : list.filter((q) => !quick.hidden.includes(q.id));
}

/** Eintrag der Schnellerfassung verschieben (`by` = −1/+1) oder ein-/ausblenden. */
export function changeQuick(items, quick, { move = null, toggle = null }) {
  const order = quickItems(items, quick, { all: true }).map((q) => q.id);
  if (move) {
    const i = order.indexOf(move.id);
    const j = i + move.by;
    if (i >= 0 && j >= 0 && j < order.length) [order[i], order[j]] = [order[j], order[i]];
  }
  let hidden = [...quick.hidden];
  if (toggle) hidden = hidden.includes(toggle) ? hidden.filter((h) => h !== toggle) : [...hidden, toggle];
  // Mindestens ein Eintrag bleibt sichtbar
  if (order.every((id) => hidden.includes(id))) return quick;
  return { order, hidden };
}

/**
 * Erinnerung ans Senden: offene Daten und seit `remindDays` Tagen nichts gesendet (ohne Senden
 * bisher: seit der geladenen Exportdatei vom PC). Liefert die Tage oder `null`.
 */
export function sendReminder(prefs, openCount, lastSentAt, baseline, now = new Date()) {
  const days = prefs.transfer.remindDays;
  if (!days || openCount <= 0) return null;
  const since = Date.parse(lastSentAt ?? baseline ?? "");
  if (Number.isNaN(since)) return null;
  const passed = Math.floor((now.getTime() - since) / 86_400_000);
  return passed >= days ? passed : null;
}
