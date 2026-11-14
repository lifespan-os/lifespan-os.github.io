// LIFESPAN OS Mobil – Checklisten wie am PC (1.9.0, ab 1.15.0 vollständig): Tageswahl mit
// Wochenstreifen, Wochen-/Monatsübersicht (Training geplant/erfasst, To-dos, Alarme, Hinweise
// Restday/Krank wie ScheduleOverview.tsx), „Heute noch einzutragen“ (DayStatusCard.tsx), die To-dos
// des Tages (TodosCard.tsx) und die Checklisten-Bibliothek (ChecklistLibrary.tsx: anlegen,
// bearbeiten, importieren aus Excel/CSV/Text/Apple Notizen, als To-dos übernehmen, PDF/Excel).
// Logik: todosdata.js und checklistdata.js (wie checklist.rs, day_status.rs). Änderungen gehen
// mit der Datei „Körperwerte“ an den PC.

import * as T from "./todosdata.js";
import * as O from "./pcoverview.js";
import * as P from "./pcdb.js";
import * as D from "./pcdomain.js";
import * as CD from "./checklistdata.js";
import * as SD from "./superdata.js";
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
    await X.store.set("checklists", X.S.checklists);
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
  const pending = T.unsentTodos(S.todos) + CD.unsentChecklists(S.checklists);
  return `${X.header("Checklisten")}<main class="wrap">
    <p class="muted small">To-dos für den Tag, eigene Checklisten und Importe aus Excel oder Apple Notizen – dazu ein Überblick, welche Werte heute noch einzutragen sind.</p>
    <section class="card day-nav">
      <button class="btn sm" data-act="todo-shift" data-arg="-1" aria-label="Vortag">‹</button>
      <label class="day-nav__date"><span class="muted small">${date === t ? "Heute" : `${wd} ${D.formatDate(date)}`}</span>
        <input type="date" data-todo="date" value="${esc(date)}" aria-label="Tag"></label>
      <button class="btn sm" data-act="todo-shift" data-arg="1" aria-label="Folgetag">›</button>
    </section>
    ${weekStrip(date)}
    ${scheduleCard(date)}
    ${pending ? `<p class="muted small">${pending} ${pending === 1 ? "Änderung" : "Änderungen"} an To-dos und Checklisten noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    ${dayStatusCard(date)}
    ${todosCard(date)}
    ${libraryCard(date)}
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

// ------------------------------------------------------------------ Wochen-/Monatsübersicht (ScheduleOverview.tsx)

const SC = () => D.schedule;
const HRT_LOOKBACK_DAYS = 180;
const KIND_ICON = { note: "ℹ", training: "🏋", workout: "✓", alarm: "⏰", todo: "☐" };

/** Schalter „Secret Protocols“ vom PC (für die fällige Hormongabe als Alarm). */
const secretOn = () => (X.S.catalog?.pc?.settings ?? []).some((s) => s.key === "secret_protocols" && String(s.value) === "1");

/** Pläne in der Form `TrainingPlan` (Tage mit Terminen) für `plannedTrainings`. */
function plansWithSlots(db) {
  const slots = db.pc.training_plan_slot ?? [];
  return (X.S.catalog.plans ?? []).map((p) => ({
    id: p.row.id,
    name: p.row.name,
    archived: !!p.row.archived,
    days: p.days.map((d) => ({
      id: d.row.id,
      name: d.row.name,
      slots: slots
        .filter((s) => s.plan_day_id === d.row.id)
        .map((s) => ({ weekday: s.weekday ?? null, date: s.date ?? null, time: s.time ?? null })),
    })),
  }));
}

function scheduleData(date, mode) {
  const S = X.S;
  const { from, to } = SC().periodRange(date, mode);
  const db = buildDb();
  const lists = new Map(CD.checklistsOf(S.catalog, S.checklists).map((c) => [c.id, c.name]));
  const todos = T.allTodos(S.catalog, S.todos)
    .filter((t) => t.date >= from && t.date <= to)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((t) => ({ id: t.id, date: t.date, position: t.position ?? 0, text: t.text, done: !!Number(t.done), checklistId: t.checklist_id ?? null, checklistName: t.checklist_id ? (lists.get(t.checklist_id) ?? null) : null }));
  const workouts = P.workoutsBetween(db, from, to).map((w) => O.workoutSummary(db, w));
  const dayStatus = CD.dayStatusOf(S.catalog, S.checklists, from, to);
  const hrt = secretOn() ? SD.hrtEntriesOf(S.catalog, S.super).filter((e) => e.date >= D.trends.shiftDays(from, -HRT_LOOKBACK_DAYS) && e.date <= to) : [];
  return { days: SC().periodDays(date, mode), todos, workouts, plans: plansWithSlots(db), dayStatus, hrtDue: D.nextHrtDoses(hrt) };
}

function scheduleItem(item) {
  const todo = item.todo;
  if (todo) {
    const ed = X.S.schedEdit;
    if (ed?.id === todo.id) {
      return `<li class="schedule__item is-todo"><div class="schedule__edit"><input type="text" data-sched="edit" value="${esc(ed.text)}" aria-label="Aufgabe bearbeiten">
        <button class="btn sm primary" data-act="sched-edit-save">OK</button><button class="btn sm" data-act="sched-edit-cancel">Abbrechen</button></div></li>`;
    }
    return `<li class="schedule__item is-todo ${todo.done ? "is-done" : ""}">
      <button class="todo-check ${todo.done ? "is-done" : ""}" data-act="todo-toggle" data-arg="${esc(todo.id)}" aria-label="${esc(todo.text)} ${todo.done ? "wieder öffnen" : "abhaken"}">${todo.done ? "✓" : ""}</button>
      <span class="schedule__text">${esc(todo.text)}${item.detail ? ` <span class="muted small">· ${esc(item.detail)}</span>` : ""}</span>
      <span class="schedule__actions"><button class="btn sm" data-act="sched-edit" data-arg="${esc(todo.id)}" aria-label="Bearbeiten">✎</button><button class="btn sm danger" data-act="todo-delete" data-arg="${esc(todo.id)}" aria-label="Löschen">✕</button></span>
    </li>`;
  }
  const action =
    item.kind === "note"
      ? `<select data-sched="status" data-date="${item.date}" aria-label="Hinweis am ${esc(SC().dayLabel(item.date))}">${[["", "Kein Hinweis"], ["rest", "Restday"], ["sick", "Krank"]]
          .map(([v, l]) => `<option value="${v}" ${v === (item.status ?? "") ? "selected" : ""}>${l}</option>`)
          .join("")}</select>`
      : item.kind === "training"
        ? `<button class="linkbtn small" data-go="plans">Plan öffnen</button>`
        : "";
  return `<li class="schedule__item is-${item.kind}">
    <span class="schedule__icon" aria-hidden="true">${KIND_ICON[item.kind]}</span>
    <span class="schedule__text">${item.time ? `<strong class="schedule__time">${esc(item.time)}</strong> ` : ""}<span class="visually-hidden">${esc(SC().SCHEDULE_KIND_LABELS[item.kind])}: </span>${esc(item.title)}${item.detail ? ` <span class="muted small">· ${esc(item.detail)}</span>` : ""}</span>
    ${action ? `<span class="schedule__actions">${action}</span>` : ""}
  </li>`;
}

function scheduleCard(date) {
  const S = X.S;
  const mode = S.schedMode ?? "week";
  const open = !!S.schedOpen;
  const t = today();
  const schedule = SC().buildSchedule(scheduleData(date, mode));
  const c = SC().scheduleCounts(schedule);
  const shown = mode === "week" || S.schedEmpty ? schedule : schedule.filter((d) => d.items.length > 0 || d.date === date || d.date === t);
  const body = open
    ? `<div class="segmented" role="group" aria-label="Ansicht">${[["week", "Woche"], ["month", "Monat"]]
        .map(([v, l]) => `<button class="${v === mode ? "is-active" : ""}" aria-pressed="${v === mode}" data-act="sched-mode" data-arg="${v}">${l}</button>`)
        .join("")}</div>
      <div class="schedule__nav"><button class="btn sm" data-act="sched-shift" data-arg="-1" aria-label="${mode === "week" ? "Vorige Woche" : "Voriger Monat"}">‹</button>
        <strong>${esc(SC().periodLabel(date, mode))}</strong>
        <button class="btn sm" data-act="sched-shift" data-arg="1" aria-label="${mode === "week" ? "Nächste Woche" : "Nächster Monat"}">›</button></div>
      <ol class="schedule__days">${shown
        .map((day) => {
          const adding = S.schedAdd?.date === day.date;
          return `<li class="schedule__day ${day.date === t ? "is-today" : ""} ${day.date === date ? "is-selected" : ""}">
          <div class="schedule__day-head">
            <button class="linkbtn schedule__day-label" data-act="todo-day" data-arg="${day.date}">${esc(SC().dayLabel(day.date))}${day.date === t ? ` <span class="tag">heute</span>` : ""}</button>
            <span class="schedule__day-tools">
              ${day.items.some((i) => i.kind === "note") ? "" : `<select data-sched="status" data-date="${day.date}" aria-label="Hinweis am ${esc(SC().dayLabel(day.date))} setzen"><option value="">+ Hinweis</option><option value="rest">Restday</option><option value="sick">Krank</option></select>`}
              <button class="btn sm" data-act="sched-add" data-arg="${day.date}" aria-label="To-do am ${esc(SC().dayLabel(day.date))} hinzufügen">+</button>
            </span>
          </div>
          ${day.items.length ? `<ul class="schedule__items">${day.items.map(scheduleItem).join("")}</ul>` : adding ? "" : `<p class="muted small">Keine Termine</p>`}
          ${adding ? `<div class="schedule__edit"><input type="text" data-sched="add" value="${esc(S.schedAdd.text)}" placeholder="Neue Aufgabe" aria-label="Neue Aufgabe"><button class="btn sm primary" data-act="sched-add-save">Hinzufügen</button><button class="btn sm" data-act="sched-add-cancel">Abbrechen</button></div>` : ""}
        </li>`;
        })
        .join("")}</ol>
      ${mode === "month" ? `<label class="hrt-check__item"><input type="checkbox" data-sched="empty" ${S.schedEmpty ? "checked" : ""}><span>Auch Tage ohne Termine zeigen</span></label>` : ""}
      <p class="muted small">Tägliche Erinnerungen (Wiegen, Supplements) stellst du am PC ein; hier erscheinen Alarme mit eigenem Termin (nächste Hormongabe).</p>`
    : "";
  return `<section class="card schedule">
    <button class="lab-group__toggle" data-act="sched-open" aria-expanded="${open}"><strong>${mode === "week" ? "Wochenübersicht" : "Monatsübersicht"}</strong><span class="muted small">${open ? "▴" : "▾"}</span></button>
    <p class="muted small">${c.trainings} Training · ${c.todosOpen} von ${c.todos} To-dos offen · ${c.alarms} Alarme · ${c.notes} Hinweise</p>
    ${body}
  </section>`;
}

// ------------------------------------------------------------------ Checklisten-Bibliothek (ChecklistLibrary.tsx)

let keyCounter = 0;
const newKey = () => `k${(keyCounter += 1)}`;

function toDraft(c) {
  return { id: c.id, name: c.name, source: c.source, items: c.items.map((i) => ({ key: newKey(), id: i.id, text: i.text, done: i.done })), notes: [], importing: false };
}

function importedDraft(list, source) {
  return { id: null, name: [...list.name].slice(0, CD.NAME_MAX).join(""), source, items: list.items.map((i) => ({ key: newKey(), id: null, text: i.text, done: i.done })), notes: list.notes ?? [], importing: true };
}

function libraryCard(date) {
  const S = X.S;
  const lists = CD.checklistsOf(S.catalog, S.checklists);
  const selected = lists.find((c) => c.id === S.clSelected) ?? lists[0] ?? null;
  const msg = S.clMessage;
  return `<section class="card">
    <div class="wo-head"><h3>Checklisten</h3>
      <span class="row-actions"><button class="btn sm" data-act="cl-import">Importieren</button><button class="btn sm primary" data-act="cl-new">+ Neue Checkliste</button></span></div>
    ${
      lists.length
        ? `<div class="chip-row" role="tablist" aria-label="Checklisten">${lists
            .map((c) => `<button class="chip ${selected?.id === c.id ? "on" : ""}" role="tab" aria-selected="${selected?.id === c.id}" data-act="cl-select" data-arg="${esc(c.id)}">${esc(c.name)} <span class="small">(${c.items.filter((i) => !i.done).length}/${c.items.length})</span></button>`)
            .join("")}</div>`
        : `<p class="muted">Noch keine Checklisten. Lege eine eigene an (z. B. Morgenroutine, Packliste) oder importiere eine aus Excel oder Apple Notizen.</p>`
    }
    ${
      selected
        ? `<p class="muted small">${esc(D.SOURCE_LABEL[selected.source] ?? selected.source)} · ${selected.items.filter((i) => i.done).length} von ${selected.items.length} abgehakt · geändert am ${esc(D.formatDate(String(selected.updatedAt).slice(0, 10)))}</p>
      ${
        selected.items.length
          ? `<ul class="todo-list">${selected.items
              .map(
                (it) => `<li class="todo-item ${it.done ? "is-done" : ""}"><button class="todo-check ${it.done ? "is-done" : ""}" data-act="cl-toggle" data-arg="${esc(it.id)}|${it.done ? 0 : 1}" aria-label="${it.done ? "Als offen markieren" : "Abhaken"}">${it.done ? "✓" : ""}</button><span class="todo-item__text">${esc(it.text)}</span></li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">Diese Checkliste hat keine Punkte.</p>`
      }
      ${msg ? `<p class="${msg.tone === "error" ? "field-error" : "ok-note"}">${esc(msg.text)}</p>` : ""}
      <div class="row-actions">
        <button class="btn primary" data-act="cl-todos" data-arg="${esc(selected.id)}" ${selected.items.length ? "" : "disabled"}>Als To-dos für ${esc(D.formatDate(date))} übernehmen</button>
        <button class="btn" data-act="cl-edit" data-arg="${esc(selected.id)}">Bearbeiten</button>
        <button class="btn" data-act="cl-reset" data-arg="${esc(selected.id)}" ${selected.items.some((i) => i.done) ? "" : "disabled"}>Haken zurücksetzen</button>
        <button class="btn" data-act="cl-export" data-arg="pdf|${esc(selected.id)}">Als PDF</button>
        <button class="btn" data-act="cl-export" data-arg="xlsx|${esc(selected.id)}">Als Excel</button>
        <button class="btn danger" data-act="cl-delete" data-arg="${esc(selected.id)}">Löschen</button>
      </div>
      <div id="cl-file-result"></div>`
        : msg
          ? `<p class="${msg.tone === "error" ? "field-error" : "ok-note"}">${esc(msg.text)}</p>`
          : ""
    }
  </section>`;
}

/** Bearbeiten, neue Checkliste und Import (Datei oder eingefügter Text) wie ChecklistEditor/ImportPanel. */
export function viewChecklistEdit() {
  const S = X.S;
  const f = S.clEdit;
  if (!f) return viewTodos();
  if (f.mode === "import") {
    return `${X.header("Checkliste importieren", { back: "todos" })}<main class="wrap"><section class="card">
      <div class="field"><label>Aus einer Datei (Excel .xlsx, .csv, .txt, .md)</label>
        <label class="btn block">Datei auswählen …<input type="file" data-cl="file" accept=".xlsx,.xlsm,.xls,.csv,.txt,.md,.text" hidden></label>
        <p class="muted small">Excel: erstes Tabellenblatt; die Spalte „Aufgabe“/„To-do“ (sonst die Spalte mit den meisten Texten) wird übernommen, eine Spalte „Erledigt“/„Status“ mit x, ✓ oder „ja“ setzt Haken.</p></div>
      <div class="field"><label for="cl-text">Aus Apple Notizen (Text einfügen)</label><textarea id="cl-text" data-cl="text" rows="6">${esc(f.text ?? "")}</textarea>
        <p class="muted small">In Notizen die Notiz markieren, kopieren und hier einfügen. Die erste Zeile wird zum Namen; Kästchen ☐/☑ und - [ ]/- [x] werden erkannt.</p></div>
      <div class="row-actions"><button class="btn primary" data-act="cl-from-text">Text übernehmen</button><button class="btn" data-go="todos">Abbrechen</button></div>
      ${f.error ? `<p class="field-error">${esc(f.error)}</p>` : ""}
    </section></main>`;
  }
  const d = f.draft;
  const e = f.errors ?? {};
  return `${X.header(d.importing ? "Vorschau des Imports" : d.id ? "Checkliste bearbeiten" : "Neue Checkliste", { back: "todos" })}<main class="wrap"><section class="card">
    ${d.importing ? `<p class="muted small">${esc(D.SOURCE_LABEL[d.source] ?? "")}: ${d.items.length} ${d.items.length === 1 ? "Punkt" : "Punkte"} erkannt. Prüfe Name und Punkte und speichere dann. Ist der Name schon vergeben, wird „(2)“ angehängt.</p>` : ""}
    ${d.notes.map((n) => `<p class="muted small">${esc(n)}</p>`).join("")}
    <div class="field ${e.name ? "has-error" : ""}"><label for="cl-name">Name</label><input id="cl-name" type="text" data-cl="name" value="${esc(d.name)}" maxlength="${CD.NAME_MAX}">${e.name ? `<p class="field-error">${esc(e.name)}</p>` : ""}</div>
    ${
      d.items.length
        ? `<ul class="check-edit">${d.items
            .map(
              (it, i) => `<li><input type="checkbox" data-cl="done" data-key="${it.key}" ${it.done ? "checked" : ""} aria-label="Punkt ${i + 1} erledigt">
          <input type="text" data-cl="item" data-key="${it.key}" value="${esc(it.text)}" aria-label="Punkt ${i + 1}" maxlength="${CD.TEXT_MAX}">
          <span class="row-actions"><button class="btn sm" data-act="cl-move" data-arg="${it.key}|-1" ${i === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button><button class="btn sm" data-act="cl-move" data-arg="${it.key}|1" ${i === d.items.length - 1 ? "disabled" : ""} aria-label="Nach unten">↓</button><button class="btn sm danger" data-act="cl-item-remove" data-arg="${it.key}" aria-label="Entfernen">✕</button></span></li>`,
            )
            .join("")}</ul>`
        : `<p class="muted">Noch keine Punkte.</p>`
    }
    <div class="field"><label for="cl-new">Punkte hinzufügen (eine Zeile je Punkt)</label><textarea id="cl-new" data-cl="new" rows="2">${esc(f.newText ?? "")}</textarea></div>
    <div class="row-actions"><button class="btn sm" data-act="cl-item-add">+ Hinzufügen</button></div>
    ${f.message ? `<p class="field-error">${esc(f.message)}</p>` : ""}
    <div class="row-actions"><button class="btn primary" data-act="cl-save">${d.importing ? "Importieren" : "Speichern"}</button><button class="btn" data-go="todos">Abbrechen</button></div>
  </section></main>`;
}

async function readChecklistFile(file) {
  const f = X.S.clEdit;
  f.error = null;
  try {
    const name = file.name.toLowerCase();
    const stem = D.fileStem(file.name);
    let draft;
    if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
      const sheet = await D.readXlsx(new Uint8Array(await file.arrayBuffer()), D.browserInflateRaw);
      const list = D.rowsToChecklist(sheet.rows, stem || sheet.name);
      if (!list.items.length) throw new Error(list.notes[0] ?? "In der Datei wurden keine Punkte gefunden.");
      draft = importedDraft(list, "excel");
    } else if (name.endsWith(".xls")) {
      throw new Error("Das alte Excel-Format (.xls) wird nicht unterstützt. Bitte in Excel als .xlsx oder .csv speichern.");
    } else if (name.endsWith(".csv")) {
      const list = D.rowsToChecklist(D.parseCsv(await file.text()), stem);
      if (!list.items.length) throw new Error(list.notes[0] ?? "In der Datei wurden keine Punkte gefunden.");
      draft = importedDraft(list, "excel");
    } else if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".text")) {
      const list = D.parseChecklistText(await file.text(), stem);
      if (!list.items.length) throw new Error("In der Datei wurden keine Punkte gefunden.");
      draft = importedDraft(list, "notes");
    } else {
      throw new Error("Bitte eine Excel-Datei (.xlsx), eine CSV-Datei oder eine Text-Datei (.txt, .md) wählen.");
    }
    X.S.clEdit = { mode: "edit", draft, errors: {}, message: "", newText: "" };
  } catch (e) {
    f.error = e.message;
  }
  X.rerender();
}

/** Datei teilen oder als Link anbieten (wie beim Senden). */
async function offerFile(bytes, name, type) {
  const blob = new Blob([bytes], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return `„${name}“ weitergegeben.`;
    } catch (e) {
      if (e.name === "AbortError") return "Abgebrochen.";
    }
  }
  const url = URL.createObjectURL(blob);
  requestAnimationFrame(() => {
    const box = document.getElementById("cl-file-result");
    if (box) box.innerHTML = `<a class="btn blue block" href="${url}" download="${esc(name)}">${esc(name)}</a>`;
  });
  return "Die Datei ist bereit – zum Öffnen oder Sichern antippen:";
}

/** Dateiname wie am PC: Name ohne unerlaubte Zeichen. */
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, "_").trim() || "Checkliste";

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
  "sched-open": () => {
    X.S.schedOpen = !X.S.schedOpen;
    X.rerender();
  },
  "sched-mode": (el) => {
    X.S.schedMode = el.dataset.arg;
    X.rerender();
  },
  "sched-shift": (el) => {
    X.S.todoDate = SC().shiftPeriod(dateOf(), X.S.schedMode ?? "week", Number(el.dataset.arg));
    X.rerender();
  },
  "sched-add": (el) => {
    X.S.schedAdd = X.S.schedAdd?.date === el.dataset.arg ? null : { date: el.dataset.arg, text: "" };
    X.rerender();
    requestAnimationFrame(() => document.querySelector("[data-sched=add]")?.focus());
  },
  "sched-add-cancel": () => {
    X.S.schedAdd = null;
    X.rerender();
  },
  "sched-add-save": () => {
    const S = X.S;
    const a = S.schedAdd;
    if (!a) return;
    if (a.text.trim() === "") return X.toast("Bitte eine Aufgabe eingeben.", true);
    change(() => {
      T.addTodo(S.catalog, S.todos, a.date, a.text, opts());
      S.schedAdd = null;
    });
  },
  "sched-edit": (el) => {
    const t = T.allTodos(X.S.catalog, X.S.todos).find((x) => x.id === el.dataset.arg);
    if (!t) return;
    X.S.schedEdit = { id: t.id, text: t.text };
    X.rerender();
    requestAnimationFrame(() => document.querySelector("[data-sched=edit]")?.focus());
  },
  "sched-edit-cancel": () => {
    X.S.schedEdit = null;
    X.rerender();
  },
  "sched-edit-save": () => {
    const S = X.S;
    const e = S.schedEdit;
    if (!e) return;
    change(() => {
      T.updateTodo(S.catalog, S.todos, e.id, { text: e.text });
      S.schedEdit = null;
    });
  },
  "cl-select": (el) => {
    X.S.clSelected = el.dataset.arg;
    X.S.clMessage = null;
    X.rerender();
  },
  "cl-toggle": (el) => {
    const [id, done] = el.dataset.arg.split("|");
    change(() => CD.setItemDone(X.S.catalog, X.S.checklists, id, done === "1"));
  },
  "cl-new": () => {
    X.S.clMessage = null;
    X.S.clEdit = { mode: "edit", draft: { id: null, name: "", source: "own", items: [], notes: [], importing: false }, errors: {}, message: "", newText: "" };
    X.go("checklist-edit");
  },
  "cl-import": () => {
    X.S.clMessage = null;
    X.S.clEdit = { mode: "import", text: "", error: null };
    X.go("checklist-edit");
  },
  "cl-edit": (el) => {
    const c = CD.checklistsOf(X.S.catalog, X.S.checklists).find((x) => x.id === el.dataset.arg);
    if (!c) return;
    X.S.clEdit = { mode: "edit", draft: toDraft(c), errors: {}, message: "", newText: "" };
    X.go("checklist-edit");
  },
  "cl-from-text": () => {
    const f = X.S.clEdit;
    const list = D.parseChecklistText(f.text ?? "", "Importierte Checkliste");
    if (!list.items.length) {
      f.error = "Im Text wurden keine Punkte gefunden.";
      return X.rerender();
    }
    X.S.clEdit = { mode: "edit", draft: importedDraft(list, "notes"), errors: {}, message: "", newText: "" };
    X.rerender();
  },
  "cl-move": (el) => {
    const [key, step] = el.dataset.arg.split("|");
    const items = X.S.clEdit.draft.items;
    const i = items.findIndex((x) => x.key === key);
    const j = i + Number(step);
    if (i < 0 || j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    X.rerender();
  },
  "cl-item-remove": (el) => {
    const d = X.S.clEdit.draft;
    d.items = d.items.filter((x) => x.key !== el.dataset.arg);
    X.rerender();
  },
  "cl-item-add": () => {
    const f = X.S.clEdit;
    const lines = String(f.newText ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    f.draft.items.push(...lines.map((text) => ({ key: newKey(), id: null, text, done: false })));
    f.newText = "";
    X.rerender();
  },
  "cl-save": async () => {
    const S = X.S;
    const f = S.clEdit;
    const d = f.draft;
    f.message = "";
    f.errors = {};
    if (d.items.length > CD.MAX_ITEMS) {
      f.message = `Eine Checkliste darf höchstens ${CD.MAX_ITEMS} Punkte haben.`;
      return X.rerender();
    }
    try {
      const id = CD.saveChecklist(S.catalog, S.checklists, { id: d.id, name: d.name, source: d.source, items: d.items.map((i) => ({ id: i.id, text: i.text, done: i.done })) }, d.importing, opts());
      await persist();
      const saved = CD.checklistsOf(S.catalog, S.checklists).find((c) => c.id === id);
      S.clSelected = id;
      S.clMessage = { tone: "ok", text: d.importing ? `Checkliste „${saved?.name ?? d.name}“ importiert.` : "Checkliste gespeichert." };
      S.clEdit = null;
      X.go("todos");
    } catch (e) {
      if (e.field === "name") f.errors = { name: e.message };
      else f.message = e.message;
      X.rerender();
    }
  },
  "cl-todos": (el) => {
    const S = X.S;
    const c = CD.checklistsOf(S.catalog, S.checklists).find((x) => x.id === el.dataset.arg);
    if (!c) return;
    const date = dateOf();
    change(() => {
      const n = T.addFromChecklist(S.catalog, S.todos, date, c.id, c.items, false, opts());
      S.clMessage = { tone: "ok", text: n === 0 ? `Alle Punkte stehen schon bei den To-dos am ${D.formatDate(date)}.` : `${n} ${n === 1 ? "Punkt" : "Punkte"} als To-dos für ${D.formatDate(date)} übernommen.` };
    });
  },
  "cl-reset": (el) => {
    change(() => {
      CD.resetChecklist(X.S.catalog, X.S.checklists, el.dataset.arg);
      X.S.clMessage = { tone: "ok", text: "Alle Haken entfernt." };
    });
  },
  "cl-delete": (el) => {
    const S = X.S;
    const c = CD.checklistsOf(S.catalog, S.checklists).find((x) => x.id === el.dataset.arg);
    if (!c || !X.confirmTwice(el, `Nochmal tippen: „${c.name}“ löschen`)) return;
    change(() => {
      CD.deleteChecklist(S.catalog, S.checklists, c.id);
      S.clSelected = null;
      S.clMessage = { tone: "ok", text: `„${c.name}“ gelöscht.` };
    });
  },
  "cl-export": async (el) => {
    const S = X.S;
    const [kind, id] = el.dataset.arg.split("|");
    const c = CD.checklistsOf(S.catalog, S.checklists).find((x) => x.id === id);
    if (!c) return;
    const items = c.items.map((i) => ({ text: i.text, done: i.done }));
    const subtitle = D.progressText(items);
    const bytes = kind === "pdf" ? D.checklistToPdf(c.name, items, subtitle) : D.checklistToXlsx(c.name, items);
    const name = `${safeName(c.name)}.${kind}`;
    const type = kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const text = await offerFile(bytes, name, type);
    S.clMessage = { tone: "ok", text };
    X.rerender();
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
  const S = X.S;
  const sc = el.dataset?.sched;
  if (sc === "edit" && S.schedEdit) {
    S.schedEdit.text = el.value;
    return true;
  }
  if (sc === "add" && S.schedAdd) {
    S.schedAdd.text = el.value;
    return true;
  }
  const cl = el.dataset?.cl;
  if (cl && S.clEdit) {
    const f = S.clEdit;
    if (cl === "text") f.text = el.value;
    else if (cl === "new") f.newText = el.value;
    else if (cl === "name" && f.draft) {
      f.draft.name = el.value;
      if (f.errors?.name) f.errors.name = "";
    } else if ((cl === "item" || cl === "done") && f.draft) {
      const it = f.draft.items.find((x) => x.key === el.dataset.key);
      if (it) {
        if (cl === "item") it.text = el.value;
        else it.done = el.checked;
      }
    } else return false;
    return true;
  }
  const k = el.dataset?.todo;
  if (!k) return false;
  if (k === "edit" && S.todoEdit) S.todoEdit.text = el.value;
  else if (k === "text") S.todoAdd = { ...(S.todoAdd ?? { when: "day", end: "" }), text: el.value };
  else if (k === "end") S.todoAdd = { ...(S.todoAdd ?? { text: "", when: "day" }), end: el.value };
  else return false;
  return true;
}

/** Auswahlfelder; true = behandelt. */
export function todoChange(el) {
  const S = X.S;
  if (el.dataset?.sched === "status") {
    const kind = el.value || null;
    change(() => CD.setDayStatus(S.catalog, S.checklists, el.dataset.date, kind, opts()));
    return true;
  }
  if (el.dataset?.sched === "empty") {
    S.schedEmpty = el.checked;
    X.rerender();
    return true;
  }
  if (el.dataset?.cl === "file" && S.clEdit) {
    const file = el.files?.[0];
    el.value = "";
    if (file) readChecklistFile(file);
    return true;
  }
  if (el.dataset?.sched || el.dataset?.cl) return todoInput(el);
  const k = el.dataset?.todo;
  if (!k) return false;
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
