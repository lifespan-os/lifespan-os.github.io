// Sofort speichern (1.131.0, wie am PC): Formulare speichern ohne Knopf.
//
// Ein Formular trägt `data-autosave="<schlüssel>"` und `data-autosave-mode="edit|new"`; darin steht
// der bisherige Speichern-Knopf versteckt (`data-autosave-btn`). Bei jeder Änderung eines Feldes
// (Verlassen des Feldes, Auswahl, Haken) löst die App dessen Aktion aus:
// - „edit“: sofort (bestehende Werte, Einstellungen, Bearbeiten);
// - „new“: erst, wenn alle Pflichtfelder (`required`) ausgefüllt und gültig sind – danach bearbeitet
//   das Formular den angelegten Eintrag (die Aktion merkt sich dafür die neue ID).
// Danach „✓ Gespeichert“ mit „Rückgängig“: stellt die geschriebenen Daten im Gerätespeicher wieder her.

/** Merkmale für das Formular */
export function autoAttrs(key, mode = "edit") {
  return `data-autosave="${key}" data-autosave-mode="${mode}"`;
}

/**
 * Versteckter Speichern-Knopf (die bisherige Aktion) und ein Hinweis an seiner Stelle.
 * `attrs`: weitere Merkmale des Knopfes (z. B. data-arg).
 */
export function autoSaveHtml(act, { mode = "edit", attrs = "", note = null } = {}) {
  const text =
    note ??
    (mode === "new"
      ? "Wird automatisch gespeichert, sobald alle Pflichtfelder ausgefüllt sind."
      : "Änderungen werden automatisch gespeichert.");
  return `<button type="button" hidden data-autosave-btn data-act="${act}" ${attrs}></button>${text ? `<p class="autosave-note muted small">${text}</p>` : ""}`;
}

/** Pflichtfelder ausgefüllt und alle Felder gültig? */
export function formComplete(box) {
  const fields = [...box.querySelectorAll("input, select, textarea")].filter((f) => !f.disabled && f.type !== "hidden");
  for (const f of fields) {
    if (f.required && !String(f.value ?? "").trim()) return false;
    if (typeof f.checkValidity === "function" && !f.checkValidity()) return false;
  }
  return true;
}

let ctx = null;
let busy = false;
const again = new Set();

/**
 * Einrichten. `c`: { S, actions, store, toast, reload(keys) } – `reload` lädt die Zustände der
 * genannten Speicherschlüssel neu (für „Rückgängig“).
 */
export function initAutosave(c) {
  ctx = c;
  document.addEventListener("change", (ev) => {
    const box = ev.target.closest?.("[data-autosave]");
    if (!box || ev.target.closest("[data-autosave-skip]")) return;
    const key = box.dataset.autosave;
    // nach den übrigen Verarbeitungen der Änderung (die das Formular neu zeichnen können)
    setTimeout(() => void run(key), 0);
  });
  // Knöpfe, die den Inhalt ändern (z. B. Supplement hinzufügen): danach ebenfalls speichern
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest?.("[data-autosave-click]");
    const box = el?.closest("[data-autosave]");
    if (!box) return;
    const key = box.dataset.autosave;
    setTimeout(() => void run(key), 0);
  });
}

/** Formular jetzt speichern (z. B. nach dem Ziehen eines Balkens) */
export function autosaveNow(key) {
  setTimeout(() => void run(key), 0);
}

async function run(key) {
  if (busy) {
    again.add(key);
    return;
  }
  const box = document.querySelector(`[data-autosave="${CSS.escape(key)}"]`);
  const btn = box?.querySelector("[data-autosave-btn]");
  const fn = btn ? ctx.actions[btn.dataset.act] : null;
  if (!fn) return;
  // `data-autosave-ready="0"`: noch nicht vollständig (z. B. Einnahme ohne Supplement)
  if (box.dataset.autosaveReady === "0") return;
  if (box.dataset.autosaveMode === "new" && !formComplete(box)) return;
  const focusId = document.activeElement?.id || null;
  const { S, store, toast } = ctx;
  const before = new Map();
  const messages = [];
  let failed = false;
  busy = true;
  S.autosaving = true;
  store.watchWrites(async (k) => {
    if (!before.has(k)) before.set(k, await store.get(k));
  });
  toast.capture = (text, err) => {
    if (err) failed = true;
    else messages.push(text);
    return !err;
  };
  try {
    await fn(btn);
  } catch (e) {
    failed = true;
    toast(e.message || "Speichern ging nicht.", true);
  } finally {
    store.watchWrites(null);
    toast.capture = null;
    S.autosaving = false;
    busy = false;
  }
  // nur melden, wenn sich wirklich etwas geändert hat (Feld nur betreten und verlassen: nichts)
  for (const [k, v] of [...before]) {
    if (JSON.stringify(v) === JSON.stringify(await store.get(k))) before.delete(k);
  }
  if (before.size && !failed) {
    const msg = messages.find((m) => !/^✓?\s*Gespeichert\.?$/.test(m)) ?? null;
    toast(msg ? `✓ ${msg.replace(/^✓\s*/, "")}` : "✓ Gespeichert", false, async () => {
      for (const [k, v] of before) await store.set(k, v);
      await ctx.reload([...before.keys()]);
    });
  }
  // der Fokus bleibt im Feld, in das gerade getippt wurde
  if (focusId) {
    setTimeout(() => {
      const el = document.getElementById(focusId);
      if (el && document.activeElement !== el) el.focus({ preventScroll: true });
    }, 0);
  }
  if (again.size) {
    const next = [...again];
    again.clear();
    for (const k of next) await run(k);
  }
}
