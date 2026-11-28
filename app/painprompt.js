// LIFESPAN OS Mobil – Schmerz in einer Notiz einordnen (1.186.0, wie `ui/painPrompt.ts` am PC 1.0.255):
// Steht in einem Notizfeld ein Schmerz ohne Stufe („Schulter tut weh“), erscheint unter dem Feld die
// Frage nach der Stufe 1–10. Die gewählte Stufe wird als Text an die Notiz gehängt („… – Schmerz 6/10“)
// und geht mit dem normalen Speichern in die Daten. Gilt für alle Notizfelder (alle mehrzeiligen Felder
// und einzeilige Felder, die „Notiz“, „Bemerkung“ o. ä. heißen). Erkennung: `D.painNotes` (pcdomain.js).

import * as D from "./pcdomain.js";

const NOTE_HINT = /notiz|note|bemerk|kommentar|comment|anmerk|beschwerd/i;
const DELAY_MS = 400;

export function isNoteField(el) {
  if (!el || el.readOnly || el.disabled) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT" || (el.type !== "text" && el.type !== "")) return false;
  const label = el.labels?.[0]?.textContent ?? "";
  const data = Object.entries(el.dataset ?? {})
    .map(([k, v]) => `${k} ${v}`)
    .join(" ");
  return NOTE_HINT.test(`${el.id} ${el.name} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""} ${label} ${data}`);
}

/** Wert setzen und so melden, dass Formulare und das automatische Speichern die Änderung sehen. */
export function setFieldValue(el, value) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function initPainPrompt() {
  const P = D.painNotes;
  if (!P || typeof document === "undefined") return;
  let pop = null;
  let target = null;
  let timer = 0;
  let watch = 0;
  const dismissed = new WeakSet();

  const close = () => {
    pop?.remove();
    pop = null;
    target = null;
    clearInterval(watch);
  };
  const place = () => {
    if (!pop || !target) return;
    if (!target.isConnected) return close();
    const r = target.getBoundingClientRect();
    const top = Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 6);
    pop.style.top = `${Math.max(8, top)}px`;
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`;
  };
  const choose = (btn) => {
    if (!btn || !target) return;
    const field = target;
    if (btn.dataset.skip) {
      dismissed.add(field);
      return close();
    }
    close();
    setFieldValue(field, P.withPainLevel(field.value, Number(btn.dataset.level)));
  };
  const open = (el, min) => {
    if (target === el && pop) return place();
    close();
    target = el;
    pop = document.createElement("div");
    pop.className = "pain-prompt";
    pop.setAttribute("role", "group");
    pop.setAttribute("aria-label", "Schmerz einordnen");
    const levels = [];
    for (let n = min; n <= P.PAIN_MAX; n += 1) levels.push(`<button type="button" class="chip" data-level="${n}" aria-label="Schmerz ${n} von ${P.PAIN_MAX}">${n}</button>`);
    pop.innerHTML = `<p>${min > 1 ? `Schmerz erwähnt – „stark“, „massiv“, „hart“ oder „intensiv“ zählt mindestens als ${min}. Wie stark von 1 bis ${P.PAIN_MAX}?` : `Schmerz erwähnt. Wie stark von 1 bis ${P.PAIN_MAX}?`}</p>
      <div class="pain-prompt__levels">${levels.join("")}</div>
      <button type="button" class="linkbtn small" data-skip="1">Ohne Angabe</button>`;
    // Schon beim Antippen wählen: so bleibt der Fokus im Notizfeld, und das Formular speichert erst mit der Stufe
    let handled = false;
    pop.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const btn = e.target.closest("button");
      if (!btn) return;
      handled = true;
      choose(btn);
    });
    pop.addEventListener("click", (e) => {
      if (handled) return;
      choose(e.target.closest("button"));
    });
    document.body.appendChild(pop);
    place();
    watch = setInterval(place, 800);
  };
  const check = (el) => {
    const p = P.painPrompt(el.value);
    if (!p) {
      dismissed.delete(el);
      if (target === el) close();
      return;
    }
    if (!dismissed.has(el)) open(el, p.min);
  };
  document.addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (!isNoteField(el)) return;
      clearTimeout(timer);
      timer = setTimeout(() => check(el), DELAY_MS);
    },
    true,
  );
  document.addEventListener(
    "focusin",
    (e) => {
      if (isNoteField(e.target) && e.target.value) check(e.target);
    },
    true,
  );
  document.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
}
