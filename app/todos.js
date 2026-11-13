// LIFESPAN OS Mobil – Checklisten wie am PC (1.9.0): Tageswahl mit Wochenstreifen (offene
// To-dos je Tag), „Heute noch einzutragen“ (dayStatus wie DayStatusCard.tsx) und die To-dos des
// Tages – abhaken, anlegen (auch an mehreren Tagen bzw. wiederholt), Text ändern, sortieren,
// löschen, Erledigte entfernen und offene vom Vortag übernehmen (wie TodosCard.tsx).
// Logik: todosdata.js (wie checklist.rs). Änderungen gehen mit der Datei „Körperwerte“ an den PC.

import * as T from "./todosdata.js";
import * as O from "./pcoverview.js";
import * as P from "./pcdb.js";
import * as D from "./pcdomain.js";
import { buildDb, today } from "./diary.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initTodos(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const SECTION_OF = { body: "body", sleep: "sleep", recovery: "recovery", nutrition: "nutrition", training: "training" };

async function persist() {
  try {
    await X.store.set("todos", X.S.todos);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

const dateOf = () => X.S.todoDate ?? today();

function weekStrip(date) {
  const S = X.S;
  const monday = D.trends.weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => D.trends.shiftDays(monday, i));
  const counts = new Map(T.openCounts(S.catalog, S.todos, days[0], days[6]).map((c) => [c.date, c]));
  const t = today();
  return `<div class="todo-week">${days
    .map((d) => {
      const c = counts.get(d);
      const wd = WEEKDAYS[new Date(`${d}T12:00:00`).getDay()];
      return `<button class="todo-week__day ${d === date ? "is-active" : ""} ${d === t ? "is-today" : ""}" data-act="todo-day" data-arg="${d}">
        <span>${wd}</span><strong>${d.slice(8, 10)}.</strong>
        <small>${c ? (c.open ? `${c.open} offen` : "✓") : "&nbsp;"}</small></button>`;
    })
    .join("")}</div>`;
}

function dayStatusCard(date) {
  const S = X.S;
  const db = buildDb();
  const o = O.overviewFor(db, date);
  const st = D.dayStatus(o, P.intakesOn(db, date).length);
  const isToday = date === today();
  return `<section class="card"><div class="wo-head"><h3>${isToday ? "Heute noch einzutragen" : `Einträge am ${esc(D.formatDate(date))}`}</h3>
      <span class="tag">${st.open === 0 ? "Alles eingetragen" : `${st.done} von ${st.done + st.open} eingetragen`}</span></div>
    <ul class="status-grid">${st.rows
      .map(
        (r) => `<li class="${r.done ? "is-done" : ""}"><span class="status-icon ${r.done ? "" : "status-icon--open"}" aria-label="${r.done ? "eingetragen" : "offen"}">${r.done ? "✓" : ""}</span>
        <span><button class="linkbtn" data-act="menu-go" data-arg="${SECTION_OF[r.section] ?? "overview"}">${esc(r.label)}</button>${r.optional ? ` <span class="muted small">(optional)</span>` : ""}
        <span class="muted small">${r.value ? esc(r.value) : esc(r.where)}</span></span></li>`,
      )
      .join("")}</ul>
    ${S.todoDate && !isToday ? "" : ""}</section>`;
}

function todosCard(date) {
  const S = X.S;
  const list = T.todosFor(S.catalog, S.todos, date);
  const open = list.filter((t) => !t.done).length;
  const yesterday = D.trends.shiftDays(date, -1);
  const openYesterday = T.todosFor(S.catalog, S.todos, yesterday).filter((t) => !t.done).length;
  const add = S.todoAdd ?? { text: "", when: "day", end: "" };
  const editing = S.todoEdit;
  const rows = list
    .map((t, i) => {
      if (editing?.id === t.id) {
        return `<li class="todo-item is-editing"><input type="text" data-todo="edit" value="${esc(editing.text)}" maxlength="${T.TEXT_MAX_CHARS}" aria-label="Aufgabe">
          <div class="todo-item__actions"><button class="btn sm primary" data-act="todo-edit-save">Speichern</button><button class="btn sm" data-act="todo-edit-cancel">Abbrechen</button></div></li>`;
      }
      return `<li class="todo-item ${t.done ? "is-done" : ""}">
        <button class="todo-check ${t.done ? "is-done" : ""}" data-act="todo-toggle" data-arg="${esc(t.id)}" aria-label="${t.done ? "Als offen markieren" : "Abhaken"}">${t.done ? "✓" : ""}</button>
        <span class="todo-item__text" data-act="todo-edit" data-arg="${esc(t.id)}">${esc(t.text)}${unsent(t.id) ? ` <span class="tag">noch nicht am PC</span>` : ""}</span>
        <span class="todo-item__move">
          <button class="btn sm" data-act="todo-move" data-arg="${esc(t.id)}|-1" ${i === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button>
          <button class="btn sm" data-act="todo-move" data-arg="${esc(t.id)}|1" ${i === list.length - 1 ? "disabled" : ""} aria-label="Nach unten">↓</button>
          <button class="btn sm danger" data-act="todo-delete" data-arg="${esc(t.id)}" aria-label="Löschen">✕</button>
        </span></li>`;
    })
    .join("");
  const repeating = add.when === "daily" || add.when === "weekly" || add.when === "monthly";
  return `<section class="card"><div class="wo-head"><h3>To-dos</h3><span class="tag">${list.length ? `${open} offen von ${list.length}` : "keine"}</span></div>
    ${list.length ? `<ul class="todo-list">${rows}</ul>` : `<p class="muted">Für diesen Tag sind keine To-dos eingetragen.</p>`}
    <div class="todo-add">
      <input type="text" data-todo="text" value="${esc(add.text)}" placeholder="Neue Aufgabe" maxlength="${T.TEXT_MAX_CHARS}" aria-label="Neue Aufgabe">
      <div class="todo-add__row">
        <select data-todo="when" aria-label="Wann">
          ${[
            ["day", "Nur an diesem Tag"],
            ["daily", `${D.REPEAT_LABEL.daily}`],
            ["weekly", `${D.REPEAT_LABEL.weekly}`],
            ["monthly", `${D.REPEAT_LABEL.monthly}`],
          ]
            .map(([v, l]) => `<option value="${v}" ${add.when === v ? "selected" : ""}>${esc(l)}</option>`)
            .join("")}
        </select>
        ${repeating ? `<label class="todo-add__end"><span class="muted small">bis</span><input type="date" data-todo="end" value="${esc(add.end || D.defaultRepeatEnd(date, add.when))}" min="${date}"></label>` : ""}
      </div>
      <button class="btn primary block" data-act="todo-add">Hinzufügen</button>
    </div>
    <div class="todo-tools">
      ${openYesterday ? `<button class="btn" data-act="todo-carry">${openYesterday} offene vom Vortag übernehmen</button>` : ""}
      ${list.some((t) => t.done) ? `<button class="btn" data-act="todo-clear">Erledigte entfernen</button>` : ""}
    </div>
    <p class="card__note">Antippen eines To-dos ändert den Text. Eigene Checklisten anlegen und als To-dos übernehmen geht bisher am PC.</p></section>`;
}

const unsent = (id) => {
  const e = X.S.todos.rows[id];
  return e && !e.sent;
};

export function viewTodos() {
  const S = X.S;
  if (!S.catalog?.pc) return `${X.header("Checklisten")}<main class="wrap"><section class="card"><p class="warn">Für die Checklisten fehlen noch Daten: Bitte am PC einen neuen Export erstellen und hier unter Settings „Neue Exportdatei laden“.</p></section></main>`;
  const date = dateOf();
  const t = today();
  const wd = WEEKDAYS[new Date(`${date}T12:00:00`).getDay()];
  const pending = T.unsentTodos(S.todos);
  return `${X.header("Checklisten")}<main class="wrap">
    <p class="muted small">To-dos für den Tag und ein Überblick, welche Werte heute noch einzutragen sind.</p>
    <section class="card day-nav">
      <button class="btn sm" data-act="todo-shift" data-arg="-1" aria-label="Vortag">‹</button>
      <label class="day-nav__date"><span class="muted small">${date === t ? "Heute" : `${wd} ${D.formatDate(date)}`}</span>
        <input type="date" data-todo="date" value="${esc(date)}" aria-label="Tag"></label>
      <button class="btn sm" data-act="todo-shift" data-arg="1" aria-label="Folgetag">›</button>
    </section>
    ${weekStrip(date)}
    ${pending ? `<p class="muted small">${pending} ${pending === 1 ? "Änderung" : "Änderungen"} an To-dos noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    ${todosCard(date)}
    ${dayStatusCard(date)}
  </main>`;
}

async function change(fn, ok) {
  try {
    const r = fn();
    await persist();
    if (ok) X.toast(typeof ok === "function" ? ok(r) : ok);
  } catch (e) {
    X.toast(e.message, true);
  }
  X.rerender();
}

const opts = () => ({ uuid: X.uuid, now: new Date() });

export const todoActions = {
  "todo-shift": (el) => {
    X.S.todoDate = D.trends.shiftDays(dateOf(), Number(el.dataset.arg));
    X.S.todoEdit = null;
    X.rerender();
  },
  "todo-day": (el) => {
    X.S.todoDate = el.dataset.arg;
    X.S.todoEdit = null;
    X.rerender();
  },
  "todo-toggle": (el) => {
    const S = X.S;
    const t = T.allTodos(S.catalog, S.todos).find((x) => x.id === el.dataset.arg);
    if (t) change(() => T.updateTodo(S.catalog, S.todos, t.id, { done: !t.done }));
  },
  "todo-edit": (el) => {
    const S = X.S;
    const t = T.allTodos(S.catalog, S.todos).find((x) => x.id === el.dataset.arg);
    if (!t) return;
    S.todoEdit = { id: t.id, text: t.text };
    X.rerender();
    requestAnimationFrame(() => document.querySelector("[data-todo=edit]")?.focus());
  },
  "todo-edit-cancel": () => {
    X.S.todoEdit = null;
    X.rerender();
  },
  "todo-edit-save": () => {
    const S = X.S;
    const e = S.todoEdit;
    if (!e) return;
    change(() => {
      T.updateTodo(S.catalog, S.todos, e.id, { text: e.text });
      S.todoEdit = null;
    });
  },
  "todo-move": (el) => {
    const [id, step] = el.dataset.arg.split("|");
    change(() => T.moveTodo(X.S.catalog, X.S.todos, id, Number(step)));
  },
  "todo-delete": (el) => {
    if (!X.confirmTwice(el, "Löschen?")) return;
    change(() => T.deleteTodo(X.S.catalog, X.S.todos, el.dataset.arg), "To-do gelöscht.");
  },
  "todo-clear": (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: Erledigte entfernen")) return;
    change(() => T.clearDone(X.S.catalog, X.S.todos, dateOf()), (n) => `${n} erledigte entfernt.`);
  },
  "todo-carry": () => {
    const date = dateOf();
    change(() => T.carryOver(X.S.catalog, X.S.todos, D.trends.shiftDays(date, -1), date, opts()), (n) => (n ? `${n} übernommen.` : "Schon alle vorhanden."));
  },
  "todo-add": () => {
    const S = X.S;
    const date = dateOf();
    const add = S.todoAdd ?? { text: "", when: "day", end: "" };
    change(
      () => {
        if (add.when === "day") {
          T.addTodo(S.catalog, S.todos, date, add.text, opts());
          S.todoAdd = { ...add, text: "" };
          return null;
        }
        const end = add.end || D.defaultRepeatEnd(date, add.when);
        if (end < date) throw new Error("Das Enddatum muss am oder nach dem Startdatum liegen.");
        const dates = D.repeatDates(date, end, add.when);
        if (dates.length > D.MAX_DATES) throw new Error(`Das wären mehr als ${D.MAX_DATES} Tage. Bitte ein früheres Enddatum wählen.`);
        const r = T.addTodoDates(S.catalog, S.todos, dates, add.text, opts());
        S.todoAdd = { ...add, text: "" };
        return r;
      },
      (r) => (r ? `An ${r.added} ${r.added === 1 ? "Tag" : "Tagen"} eingetragen${r.skipped ? `, ${r.skipped} schon vorhanden` : ""}.` : null),
    );
  },
};

/** Eingaben (ohne neu zu zeichnen); true = behandelt. */
export function todoInput(el) {
  const k = el.dataset?.todo;
  if (!k) return false;
  const S = X.S;
  if (k === "edit" && S.todoEdit) S.todoEdit.text = el.value;
  else if (k === "text") S.todoAdd = { ...(S.todoAdd ?? { when: "day", end: "" }), text: el.value };
  else if (k === "end") S.todoAdd = { ...(S.todoAdd ?? { text: "", when: "day" }), end: el.value };
  else return false;
  return true;
}

/** Auswahlfelder; true = behandelt. */
export function todoChange(el) {
  const k = el.dataset?.todo;
  if (!k) return false;
  const S = X.S;
  if (k === "date") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) S.todoDate = el.value;
    S.todoEdit = null;
    X.rerender();
    return true;
  }
  if (k === "when") {
    S.todoAdd = { ...(S.todoAdd ?? { text: "" }), when: el.value, end: "" };
    X.rerender();
    return true;
  }
  return todoInput(el);
}
