// LIFESPAN OS Mobil – Tagebuch → Mahlzeiten als Tagesverlauf (1.100.0, wie PC 1.0.175).
// Mahlzeiten, geplante Mahlzeiten, Koffein, Supplements und Wasser auf einer senkrechten Zeitachse.
// Der orange Knopf lässt sich mit dem Finger an jede Uhrzeit ziehen (5-Minuten-Schritte): davor =
// gegessen eintragen, danach = planen. Anordnung wie `src/domain/mealTimeline.ts` am PC.

import * as P from "./pcdb.js";
import * as N from "./nutrition.js";
import { X, today } from "./diary.js";
import { caffeineIntakesOn } from "./icoach.js";

// ------------------------------------------------------------------ Anordnung (wie mealTimeline.ts)

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const minuteOf = (t) => {
  const m = TIME.exec(String(t ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const clockOf = (minute) => {
  const m = Math.max(0, Math.min(1439, Math.round(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const snapMinute = (minute, step = 5) => Math.max(0, Math.min(1440 - step, Math.round(minute / step) * step));

export function layoutTimeline(list, { pxPerMin = 1, gap = 8, minStart = 360, minEnd = 1380, include = [] } = {}) {
  const items = [...list].sort((a, b) => a.minute - b.minute || String(a.key).localeCompare(String(b.key)));
  const minutes = [...items.map((i) => i.minute), ...include];
  const first = minutes.length ? Math.min(...minutes) : minStart;
  const last = minutes.length ? Math.max(...minutes) : minEnd;
  const start = Math.max(0, Math.min(minStart, Math.floor((first - 30) / 60) * 60));
  const end = Math.min(1439, Math.max(minEnd, Math.ceil((last + 60) / 60) * 60));
  const anchors = [{ minute: start, y: 0 }];
  const placed = [];
  let bottom = -gap;
  for (const item of items) {
    const prev = anchors[anchors.length - 1];
    const y = Math.max(prev.y + (item.minute - prev.minute) * pxPerMin, bottom + gap);
    if (item.minute > prev.minute) anchors.push({ minute: item.minute, y });
    placed.push({ ...item, y });
    bottom = y + item.height;
  }
  const prev = anchors[anchors.length - 1];
  const endY = Math.max(prev.y + (end - prev.minute) * pxPerMin, bottom + gap);
  anchors.push({ minute: end, y: endY });
  const hours = [];
  for (let h = Math.ceil(start / 60); h * 60 <= end; h++) hours.push({ label: clockOf(h * 60), y: yAt(anchors, h * 60) });
  return { start, end, height: endY, items: placed, anchors, hours };
}

export function yAt(anchors, minute) {
  if (!anchors.length) return 0;
  if (minute <= anchors[0].minute) return anchors[0].y;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (minute <= b.minute) return b.minute - a.minute <= 0 ? b.y : a.y + ((minute - a.minute) / (b.minute - a.minute)) * (b.y - a.y);
  }
  return anchors[anchors.length - 1].y;
}

export function minuteAt(anchors, y) {
  if (!anchors.length) return 0;
  if (y <= anchors[0].y) return anchors[0].minute;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (y <= b.y) return b.y - a.y <= 0 ? b.minute : a.minute + ((y - a.y) / (b.y - a.y)) * (b.minute - a.minute);
  }
  return anchors[anchors.length - 1].minute;
}

export function mealTypeAt(minute) {
  const h = Math.floor(minute / 60);
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

export function groupWater(glasses, withinMin = 45) {
  const timed = glasses
    .map((g) => ({ minute: minuteOf(g.time), ml: g.amountMl }))
    .filter((g) => g.minute !== null)
    .sort((a, b) => a.minute - b.minute);
  const out = [];
  for (const g of timed) {
    const last = out[out.length - 1];
    if (last && g.minute - last.minute <= withinMin) {
      last.count += 1;
      last.ml += g.ml;
    } else out.push({ minute: g.minute, count: 1, ml: g.ml });
  }
  return out;
}

// ------------------------------------------------------------------ Ansicht

const PX = 0.9;
/** Höhe des Knopfes; er belegt auf der Achse Platz wie ein Eintrag, damit er nichts verdeckt. */
const HANDLE_H = 52;
const nowMinute = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** Zustand des Knopfes für den Tag (Uhrzeit, offenes Fenster, gewählte Mahlzeit). */
function handleState(date) {
  const S = X.S;
  if (!S.mtl || S.mtl.date !== date) S.mtl = { date, minute: date === today() ? snapMinute(nowMinute()) : 12 * 60, panel: false, key: null };
  return S.mtl;
}

function macroBar(m) {
  const p = m.proteinG * 4;
  const c = m.carbsG * 4;
  const f = m.fatG * 9;
  const sum = p + c + f;
  if (sum <= 0) return "";
  const w = (v) => ((v / sum) * 100).toFixed(1);
  return `<span class="mtl-macros" aria-hidden="true"><span class="mtl-macro mtl-macro--p" style="width:${w(p)}%"></span><span class="mtl-macro mtl-macro--c" style="width:${w(c)}%"></span><span class="mtl-macro mtl-macro--f" style="width:${w(f)}%"></span></span>`;
}

const foodsLine = (items) => {
  const names = items.map((i) => i.foodName);
  return names.length > 3 ? `${names.slice(0, 3).join(" · ")} · +${names.length - 3}` : names.join(" · ");
};

/**
 * Tagesverlauf als HTML. `slots` = Mahlzeiten des Tages wie im Tagebuch (D.daySlots),
 * `glucoseOf(meal)` = Text zum Blutzucker nach der Mahlzeit oder "".
 */
export function timelineHtml(db, date, slots, glucoseOf = () => "") {
  const esc = X.esc;
  const S = X.S;
  const local = S.food?.local;
  const h = handleState(date);
  const isToday = date === today();
  const now = isToday ? nowMinute() : null;
  const future = date > today();
  const list = [];
  const untimed = [];
  for (const slot of slots) {
    const m = slot.meal;
    if (!m || (m.items.length === 0 && Object.keys(m.values ?? {}).length === 0)) continue;
    const minute = minuteOf(m.time);
    if (minute === null) {
      untimed.push(slot);
      continue;
    }
    list.push({ key: `meal:${slot.key}`, kind: "meal", minute, time: m.time, height: 78 + (glucoseOf(m) ? 18 : 0), slot, meal: m });
  }
  const planned = local ? N.plannedOn(S.catalog, local, date) : [];
  for (const p of planned) {
    const minute = minuteOf(p.time);
    if (minute !== null) list.push({ key: `plan:${p.id}`, kind: "planned", minute, time: p.time, height: 150, plan: p });
  }
  let caffeine = [];
  try {
    caffeine = caffeineIntakesOn(date).filter((c) => (c.source ?? "calculator") === "calculator");
  } catch {
    caffeine = [];
  }
  for (const c of caffeine) {
    const minute = minuteOf(c.time);
    if (minute !== null) list.push({ key: `caf:${c.id}`, kind: "caffeine", minute, time: c.time, height: 32, text: `${c.label} · ${Math.round(c.mg)} mg Koffein` });
  }
  const mealTimes = new Map(slots.filter((s) => s.meal).map((s) => [s.meal.id, s.meal.time]));
  for (const i of P.intakesOn(db, date)) {
    const t = i.time ?? (i.mealId ? mealTimes.get(i.mealId) : null) ?? null;
    const minute = minuteOf(t);
    if (minute !== null) list.push({ key: `sup:${i.id}`, kind: "supplement", minute, time: t, height: 32, text: `${i.name}${i.items.length > 1 ? ` · ${i.items.length} Supplements` : ""}` });
  }
  for (const [n, g] of groupWater(P.waterDay(db, date).glasses).entries()) {
    list.push({ key: `water:${n}`, kind: "water", minute: g.minute, time: clockOf(g.minute), height: 32, text: `Wasser · ${g.count} ${g.count === 1 ? "Glas" : "Gläser"} (${String(Math.round(g.ml / 10) / 100).replace(".", ",")} l)` });
  }
  list.push({ key: "!handle", kind: "handle", minute: h.minute, time: clockOf(h.minute), height: HANDLE_H });
  const layout = layoutTimeline(list, { pxPerMin: PX, gap: 8, include: [h.minute, ...(now !== null ? [now] : [])] });
  const handleItem = layout.items.find((i) => i.kind === "handle");
  const plannedAt = (minute) => future || (now !== null && minute > now);
  const handlePlanned = plannedAt(h.minute);
  const hy = handleItem.y + 24;
  const handleClock = clockOf(h.minute);
  // Mahlzeit, in die der Knopf einträgt: Vorschlag nach Uhrzeit, änderbar
  const options = slots.map((s) => ({ key: s.ref.name ? N.extraKey(s.ref.name) : s.ref.mealType, title: s.title, type: s.ref.mealType }));
  const suggested = options.find((o) => o.type === mealTypeAt(h.minute))?.key ?? options[0]?.key ?? "";
  const chosen = h.key && options.some((o) => o.key === h.key) ? h.key : suggested;
  const chosenTitle = options.find((o) => o.key === chosen)?.title ?? "Mahlzeit";

  const rowHtml = (it) => {
    let body = "";
    if (it.kind === "meal") {
      const m = it.meal;
      const key = it.slot.ref.name ? N.extraKey(it.slot.ref.name) : it.slot.ref.mealType;
      const g = glucoseOf(m);
      body = `<button type="button" class="mtl-card" data-act="mtl-open" data-arg="${esc(key)}"><span class="mtl-card__head"><b>${esc(it.slot.title)}</b><span class="mtl-kcal">${Math.round(m.energyKcal)} kcal</span></span>
        ${macroBar(m)}<span class="muted small mtl-foods">${esc(m.items.length ? foodsLine(m.items) : "Fasttracking-Werte")}</span>${g ? `<span class="muted small">${esc(g)}</span>` : ""}</button>`;
    } else if (it.kind === "planned") {
      const p = it.plan;
      body = `<div class="mtl-card mtl-card--planned"><span class="mtl-card__head"><b>${esc(N.mealLabel(p.key))} · geplant</b><span class="mtl-kcal">${Math.round(p.energyKcal)} kcal</span></span>
        <span class="muted small mtl-foods">${esc(foodsLine(p.items))}</span>
        <span class="mtl-card__actions"><button class="btn sm primary" data-act="mtl-confirm" data-arg="${esc(p.id)}">✓ Gegessen</button><button class="btn sm" data-act="mtl-plan-add" data-arg="${esc(p.id)}">+ Lebensmittel</button>${
          handleClock !== p.time ? `<button class="btn sm ghost" data-act="mtl-plan-move" data-arg="${esc(p.id)}">Auf ${handleClock}</button>` : ""
        }<button class="btn sm ghost" data-act="mtl-plan-del" data-arg="${esc(p.id)}" aria-label="Geplante Mahlzeit löschen">✕</button></span></div>`;
    } else body = `<span class="mtl-chip mtl-chip--${it.kind}">${esc(it.text)}</span>`;
    return `<div class="mtl-row mtl-row--${it.kind}" style="top:${it.y.toFixed(1)}px"><span class="mtl-time">${esc(it.time)}</span><span class="mtl-dot" aria-hidden="true"></span>${body}</div>`;
  };

  const panel =
    h.panel && options.length
      ? `<div class="mtl-panel" style="top:${(hy + 30).toFixed(1)}px" role="dialog" aria-label="Neuer Eintrag">
      <b>${esc(chosenTitle)} · ${handleClock} Uhr · ${handlePlanned ? "geplant" : "gegessen"}</b>
      <label class="field"><span>Mahlzeit</span><select data-diary="mtl-key">${options.map((o) => `<option value="${esc(o.key)}" ${o.key === chosen ? "selected" : ""}>${esc(o.title)}</option>`).join("")}</select></label>
      <span class="muted small">${handlePlanned ? "Zählt erst, wenn du sie mit „Gegessen“ bestätigst." : "Wird mit dieser Uhrzeit ins Tagebuch eingetragen."}</span>
      <div class="row"><button class="btn sm primary" data-act="mtl-add" data-arg="${esc(chosen)}">+ Lebensmittel</button>${
        handlePlanned ? "" : `<button class="btn sm" data-act="mtl-caffeine">Koffein</button>`
      }<button class="btn sm ghost" data-act="mtl-close">Abbrechen</button></div></div>`
      : "";

  return `<div class="mtl-wrap">
    ${untimed.length ? `<p class="muted small">Ohne Uhrzeit: ${untimed.map((s) => `<button class="linkbtn" data-act="mtl-open" data-arg="${esc(s.ref.name ? N.extraKey(s.ref.name) : s.ref.mealType)}">${esc(s.title)} · ${Math.round(s.meal.energyKcal)} kcal</button>`).join(" ")}</p>` : ""}
    <div class="mtl" style="height:${Math.ceil(layout.height) + 24}px" data-anchors="${esc(JSON.stringify(layout.anchors.map((a) => [a.minute, Math.round(a.y * 10) / 10])))}" data-now="${now ?? ""}" data-future="${future ? 1 : 0}">
      <span class="mtl-axis" aria-hidden="true"></span>
      ${layout.hours.map((x) => `<span class="mtl-hour" style="top:${x.y.toFixed(1)}px" aria-hidden="true">${x.label}</span>`).join("")}
      ${now !== null ? `<span class="mtl-now" style="top:${yAt(layout.anchors, now).toFixed(1)}px" aria-hidden="true"></span>` : ""}
      ${layout.items.filter((i) => i.kind !== "handle").map(rowHtml).join("")}
      <div class="mtl-handle ${handlePlanned ? "is-planned" : ""}" style="top:${handleItem.y.toFixed(1)}px">
        <span class="mtl-time mtl-time--handle">${handleClock}</span>
        <button type="button" class="mtl-grip" aria-label="Neuer Eintrag um ${handleClock} Uhr – zum Verschieben ziehen">＋ <span class="mtl-grip__text">${handlePlanned ? "Planen" : now !== null && Math.abs(h.minute - now) <= 5 ? "Jetzt eintragen" : "Eintragen"}</span></button>
      </div>
      ${panel}
    </div>
    <p class="muted small">Den orangen Knopf antippen oder an die passende Uhrzeit ziehen: davor = gegessen, danach = geplant. Eine Mahlzeit antippen öffnet sie in der Liste.</p>
  </div>`;
}

// ------------------------------------------------------------------ Ziehen mit dem Finger (oder der Maus)

/** Einmal beim Start: Ziehen des Knopfes auf der Zeitachse. Während des Ziehens wird nur der Knopf bewegt. */
export function initTimelineDrag() {
  let g = null;
  const setLabel = (el, minute, now, future) => {
    const planned = future || (now !== null && minute > now);
    el.handle.style.top = `${yAt(el.anchors, minute).toFixed(1)}px`;
    el.time.textContent = clockOf(minute);
    el.text.textContent = planned ? "Planen" : "Eintragen";
    el.handle.classList.toggle("is-planned", planned);
  };
  document.addEventListener("pointerdown", (ev) => {
    const grip = ev.target.closest?.(".mtl-grip");
    if (!grip || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    const box = grip.closest(".mtl");
    let anchors = [];
    try {
      anchors = JSON.parse(box.dataset.anchors || "[]").map(([minute, y]) => ({ minute, y }));
    } catch {
      return;
    }
    const handle = grip.closest(".mtl-handle");
    g = {
      grip,
      box,
      anchors,
      handle,
      time: handle.querySelector(".mtl-time--handle"),
      text: handle.querySelector(".mtl-grip__text"),
      startY: ev.clientY,
      moved: false,
      minute: X.S.mtl?.minute ?? 720,
      now: box.dataset.now === "" ? null : Number(box.dataset.now),
      future: box.dataset.future === "1",
    };
    grip.setPointerCapture?.(ev.pointerId);
    handle.classList.add("is-dragging");
    ev.preventDefault();
  });
  document.addEventListener("pointermove", (ev) => {
    if (!g) return;
    if (!g.moved && Math.abs(ev.clientY - g.startY) < 4) return;
    g.moved = true;
    const rect = g.box.getBoundingClientRect();
    const minute = snapMinute(minuteAt(g.anchors, ev.clientY - rect.top - 24));
    if (minute !== g.minute) {
      g.minute = minute;
      setLabel(g, minute, g.now, g.future);
      if (navigator.vibrate) {
        try {
          navigator.vibrate(5);
        } catch {
          // Vibration nicht verfügbar (z. B. iPhone)
        }
      }
    }
    // am Bildschirmrand mitscrollen
    if (ev.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
    else if (ev.clientY < 90) window.scrollBy(0, -12);
    ev.preventDefault();
  });
  const end = () => {
    if (!g) return;
    const S = X.S;
    S.mtl = { ...(S.mtl ?? {}), minute: g.minute, panel: true, key: null };
    g.handle.classList.remove("is-dragging");
    g = null;
    X.rerender();
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}

// ------------------------------------------------------------------ Aktionen

async function persistFood() {
  try {
    await X.store.set("nutrition", X.S.food.local);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

export const timelineActions = {
  "meals-view": (el) => {
    X.S.mealsView = el.dataset.arg === "list" ? "list" : "timeline";
    try {
      localStorage.setItem("lifespan.mealsView", X.S.mealsView);
    } catch {
      // ohne Speicher gilt die Wahl bis zum Neustart
    }
    X.rerender();
  },
  "mtl-close": () => {
    if (X.S.mtl) X.S.mtl.panel = false;
    X.rerender();
  },
  "mtl-open": (el) => {
    const key = el.dataset.arg;
    X.S.mealsView = "list";
    X.S.mealOpen = { ...(X.S.mealOpen ?? {}), [key]: true };
    X.S.diaryFocus = key;
    X.rerender();
    requestAnimationFrame(() => document.querySelector(`[data-meal-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "start" }));
  },
  "mtl-add": (el) => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const minute = S.mtl?.minute ?? 720;
    const now = date === today() ? new Date().getHours() * 60 + new Date().getMinutes() : null;
    const planned = date > today() || (now !== null && minute > now);
    const f = S.food;
    f.mealType = el.dataset.arg;
    f.trackDate = date;
    f.returnTo = "diary";
    f.planAt = planned ? clockOf(minute) : null;
    f.planId = null;
    f.time = planned ? "" : clockOf(minute);
    f.dishTime = f.time;
    S.mtl.panel = false;
    X.go("food");
  },
  "mtl-caffeine": () => {
    const S = X.S;
    S.mtl.panel = false;
    S.diaryCf = { id: null, date: S.diaryDate ?? today(), drinkId: "espresso", amount: "30", time: clockOf(S.mtl.minute), errors: {} };
    X.rerender();
    requestAnimationFrame(() => document.getElementById("dcf-drink")?.scrollIntoView({ block: "center" }));
  },
  "mtl-confirm": async (el) => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const plan = N.plannedOn(S.catalog, S.food.local, date).find((p) => p.id === el.dataset.arg);
    if (!plan) return;
    const now = date === today() ? new Date().getHours() * 60 + new Date().getMinutes() : null;
    // früher gegessen als geplant: Uhrzeit = jetzt
    const time = now !== null && now < (minuteOf(plan.time) ?? 0) ? clockOf(now) : plan.time;
    try {
      N.confirmPlanned(S.catalog, S.food.local, plan.id, { time, uuid: () => X.uuid(), now: new Date() });
      await persistFood();
      X.toast(`${N.mealLabel(plan.key)} als gegessen eingetragen (${time} Uhr).`);
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
  "mtl-plan-add": (el) => {
    const S = X.S;
    const date = S.diaryDate ?? today();
    const plan = N.plannedOn(S.catalog, S.food.local, date).find((p) => p.id === el.dataset.arg);
    if (!plan) return;
    const f = S.food;
    f.mealType = plan.key;
    f.trackDate = date;
    f.returnTo = "diary";
    f.planAt = plan.time;
    f.planId = plan.id;
    X.go("food");
  },
  "mtl-plan-move": async (el) => {
    const S = X.S;
    try {
      N.movePlanned(S.catalog, S.food.local, el.dataset.arg, clockOf(S.mtl?.minute ?? 720), new Date());
      await persistFood();
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
  "mtl-plan-del": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: löschen")) return;
    N.deletePlanned(X.S.catalog, X.S.food.local, el.dataset.arg, new Date());
    await persistFood();
    X.rerender();
  },
};

/** Auswahl der Mahlzeit im Fenster des Knopfes; true = behandelt. */
export function timelineChange(el) {
  if (el.dataset?.diary !== "mtl-key") return false;
  if (X.S.mtl) X.S.mtl.key = el.value;
  X.rerender();
  return true;
}

