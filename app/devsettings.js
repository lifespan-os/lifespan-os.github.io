// LIFESPAN OS Mobil – Einstellungen je Gerät und Erinnerungen (aus app.js, 1.74.0).
import * as C from "./core.js";
import { setHiddenSections } from "./nav.js";
import * as P from "./pcdb.js";
import { buildDb, today as todayIso } from "./diary.js";
import { weeklyReportNoticeHtml } from "./weeklyreports.js";
import * as SD from "./superdata.js";
import * as PS from "./pcsettings.js";
import * as DP from "./devprefs.js";
import { esc, S, saveSoon, toast, unsent, unsentBodyCount, unsentFood } from "./appbase.js";
import { renderNav, rerenderKeepScroll } from "./navshell.js";

// ------------------------------------------------------------------ Einstellungen je Gerät (1.48.0)

/** Design, Beschriftung der unteren Leiste und sichtbare Bereiche anwenden. */
export function applyPrefs() {
  const sysDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  document.documentElement.dataset.theme = DP.resolvedTheme(S.prefs.theme, sysDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", document.documentElement.dataset.theme === "dark" ? "#0b1622" : "#0b2a4a");
  document.body.classList.toggle("bar-icons", S.prefs.barLabels === "icons");
  syncSections();
  if (S.catalog) renderNav();
}

/** „Superhuman“ nur mit Secret Protocols (wie am PC). */
export function syncSections() {
  const secret = !S.catalog || String(PS.effective(S.catalog, S.pcsettings, "secret_protocols")) === "1";
  setHiddenSections(secret ? [] : ["superhuman"]);
}

window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
  if (S.prefs.theme === "system") applyPrefs();
});

/** Benachrichtigung zeigen (wenn erlaubt), sonst Hinweis in der App. */
export async function notify(title, body) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg?.showNotification) await reg.showNotification(title, { body, icon: "icons/icon-192.png", tag: title });
      else new Notification(title, { body, icon: "icons/icon-192.png" });
      return true;
    }
  } catch {
    // weiter mit dem Hinweis in der App
  }
  toast(`${title}: ${body}`);
  return false;
}

/** Fällige Erinnerungen (Settings → Erinnerungen) mit dem Stand der Daten. */
export function reminderState() {
  if (!S.catalog) return { due: [], fresh: [] };
  const db = buildDb();
  const t = todayIso();
  const secret = db.settings.get("secret_protocols") === "1";
  let hrt = [];
  if (secret && S.prefs.reminders.hrt.on) {
    try {
      hrt = SD.hrtEntriesOf(S.catalog, S.super);
    } catch {
      hrt = [];
    }
  }
  return DP.remindersDue(S.prefs, t, C.localTime(new Date()), DP.reminderStatus(db, t, P.WEIGHT_METRIC_ID, hrt), secret);
}

export async function checkReminders() {
  let fresh = [];
  try {
    fresh = reminderState().fresh;
  } catch {
    return;
  }
  if (!fresh.length) return;
  DP.markShown(S.prefs, fresh.map((n) => n.key), todayIso());
  saveSoon();
  for (const n of fresh) await notify(n.title, n.body);
  if (S.view === "home") rerenderKeepScroll();
}

export let reminderTimer = null;

export function startReminders() {
  if (reminderTimer) return;
  void checkReminders();
  reminderTimer = setInterval(() => void checkReminders(), 60_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void checkReminders();
  });
}

/** Overview: fällige Erinnerungen und Erinnerung ans Senden. */
export function remindersCardHtml() {
  let due = [];
  try {
    due = reminderState().due;
  } catch {
    due = [];
  }
  const open = unsent().length + unsentFood() + unsentBodyCount();
  const sendDays = DP.sendReminder(S.prefs, open, S.prefs.lastSentAt ?? null, S.catalog?.exportedAt ?? null);
  // Neuer Weekly Report vom PC (1.51.0)
  const wr = weeklyReportNoticeHtml();
  if (!due.length && sendDays === null && !wr) return "";
  const label = { weigh: "Gewicht eintragen", supplements: "Supplements eintragen", hrt: "Zu Superhuman" };
  return `<section class="card hl ov-reminders"><h3>Erinnerungen</h3><ul class="list">${wr}${due
    .map((n) => `<li class="meal-item"><span><b>${esc(n.title)}</b><br><span class="muted small">${esc(n.body)}</span></span><button class="btn sm" data-act="rem-go" data-arg="${esc(n.kind)}">${esc(label[n.kind] ?? "Öffnen")}</button></li>`)
    .join("")}${
    sendDays !== null
      ? `<li class="meal-item"><span><b>An den PC senden</b><br><span class="muted small">Seit ${sendDays === 1 ? "1 Tag" : `${sendDays} Tagen`} nichts gesendet – ${open === 1 ? "1 Eintrag ist" : `${open} Einträge sind`} offen.</span></span><button class="btn sm" data-go="send">Senden</button></li>`
      : ""
  }</ul></section>`;
}
