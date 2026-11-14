// LIFESPAN OS Mobil – iCoach.me wie am PC (1.16.0, ICoachPage.tsx): Evolve (Module; Videos aus dem
// Video-Ordner gibt es nur am PC), Ask iCoach.me (Fragen & Antworten zu den drei Büchern mit Suche,
// AskTab.tsx), Downloads (die Bücher als PDF – mit Passwort geschützt), Magazin (Magazine und
// Reports als PDF, MagazineTab.tsx) und Widgets (Koffein-Zeitstrahl, CaffeineWidget.tsx).
// Inhalte liegen unter `icoach/` und werden erst beim Öffnen geladen; Rechnung aus pcdomain.js
// (src/domain/icoach.ts, magazines.ts, caffeine.ts). Koffein-Einnahmen: caffeinedata.js.

import * as D from "./pcdomain.js";
import * as CF from "./caffeinedata.js";
import { today } from "./diary.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initICoach(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const C = () => D.caffeine;
const M = () => D.magazines;

const TABS = [
  ["evolve", "Evolve"],
  ["ask", "Ask iCoach.me"],
  ["downloads", "Downloads"],
  ["magazin", "Magazin"],
  ["widgets", "Widgets"],
];

/** PDF-Dateien der Bücher (mit Passwort verschlüsselt). */
const BOOK_FILES = {
  masterclass: "icoach/books/iCoachMe_Die_Masterclass.pdf",
  blutwerte: "icoach/books/iCoachMe_Die_Masterclass_Blutwerte.pdf",
  blutgruppen: "icoach/books/iCoachMe_Die_Masterclass_Blutgruppen.pdf",
};
const FAQ_FILES = [
  ["masterclass", "icoach/icoachme-faq.json"],
  ["blutwerte", "icoach/icoachme-faq-blutwerte.json"],
  ["blutgruppen", "icoach/icoachme-faq-blutgruppen.json"],
];
const PAGE = 40;

const bookHref = (book, page = null) => `${BOOK_FILES[book]}${page ? `#page=${page}` : ""}`;

// ------------------------------------------------------------------ Hauptansicht

export function viewICoach() {
  const S = X.S;
  const tab = S.icTab ?? "evolve";
  const views = { evolve: evolveTab, ask: askTab, downloads: downloadsTab, magazin: magazineTab, widgets: widgetsTab };
  return `${X.header("iCoach.me")}<main class="wrap icoach">
    <p class="icoach__brand">iCoach.Me · Die Masterclass</p>
    <p class="muted small">Wissen für Training, Ernährung und Gesundheit: Module, Antworten auf deine Fragen, die Bücher „Die Masterclass“, „Die Masterclass Blutwerte“ und „Die Masterclass Blutgruppen“ und Magazine zum Lesen.</p>
    <nav class="tabs" aria-label="iCoach.me">${TABS.map(
      ([v, l]) => `<button class="tab ${v === tab ? "active" : ""}" data-act="ic-tab" data-arg="${v}" ${v === tab ? 'aria-current="page"' : ""}>${l}</button>`,
    ).join("")}</nav>
    ${(views[tab] ?? evolveTab)()}
  </main>`;
}

// ------------------------------------------------------------------ Evolve

function evolveTab() {
  const S = X.S;
  const open = D.COACH_MODULES.find((m) => m.id === S.icModule) ?? null;
  return `${
    open
      ? `<section class="card icoach-module">
      <div class="wo-head"><h3>${esc(open.title)}</h3><button class="btn sm" data-act="ic-module" data-arg="">Schließen</button></div>
      <p class="muted small">${esc(open.description)}</p>
      <p class="muted small">Die Videos zu den Modulen liegen in einem Ordner auf dem PC und werden dort abgespielt (iCoach.me → Evolve).</p>
      ${open.ask ? `<button class="btn block" data-act="ic-ask-module" data-arg="${esc(open.id)}">Fragen &amp; Antworten zu „${esc(open.title)}“ in Ask iCoach.me</button>` : ""}
    </section>`
      : ""
  }
    <section class="card"><h3>Module</h3>
      <div class="icoach-tiles">${D.COACH_MODULES.map(
        (m) => `<button class="icoach-tile ${open?.id === m.id ? "is-active" : ""}" data-act="ic-module" data-arg="${esc(m.id)}"><strong>${esc(m.title)}</strong><span class="muted small">${esc(m.description)}</span></button>`,
      ).join("")}</div>
    </section>`;
}

// ------------------------------------------------------------------ Ask iCoach.me

let library = null; // geladene Fragen (FaqLibrary)
let loading = null;

async function loadLibrary() {
  if (library) return library;
  if (!loading) {
    loading = Promise.all(
      FAQ_FILES.map(async ([book, url]) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Die Fragen konnten nicht geladen werden (${res.status}). Bitte mit Internet einmal öffnen.`);
        return { book, data: D.parseFaq(await res.text()) };
      }),
    )
      .then((sets) => {
        library = D.buildLibrary(sets);
        return library;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

function askState() {
  if (!X.S.ask) X.S.ask = { q: "", group: null, part: null, chapter: null, question: null, shown: PAGE, error: null };
  return X.S.ask;
}

/** Text mit hervorgehobenen Suchtreffern. */
const marked = (text, query) => (query ? D.highlight(text, query).map((p) => (p.hit ? `<mark>${esc(p.text)}</mark>` : esc(p.text))).join("") : esc(text));

function questionItem(q, st, query, notices, showWhere) {
  const open = st.question === q.id;
  const book = D.bookOf(q);
  const page = D.firstPage(q.seiten, book);
  return `<li class="faq-q ${open ? "is-open" : ""}" id="faq-${esc(q.id)}">
    <button class="faq-q__button" data-act="ic-q" data-arg="${esc(q.id)}" aria-expanded="${open}">
      ${showWhere ? `<span class="faq-q__where muted small">${esc(D.BOOKS[book].collection)} · Teil ${esc(D.roman(q.teil))} · ${esc(q.thema)} › ${esc(q.kapitel)}</span>` : ""}
      <span>${marked(q.frage, query)}</span></button>
    ${
      open
        ? `<div class="faq-q__answer">
      <p>${marked(q.antwort, query)}</p>
      ${q.sicherheitshinweis ? `<p class="warn small">${esc(notices.get(book) ?? "")}</p>` : ""}
      <div class="faq-meta">
        ${page !== null ? `<a class="chip" href="${bookHref(book, page)}" target="_blank" rel="noopener" title="Diese Stelle im Buch öffnen (Passwort nötig)">📖 ${esc(D.describePages(q.seiten))}</a>` : ""}
        ${q.stichworte.map((s) => `<span class="chip">${marked(s, query)}</span>`).join("")}
      </div>
      ${q.auch_relevant_fuer.length ? `<p class="muted small">Auch relevant für: ${esc(q.auch_relevant_fuer.join(", "))}</p>` : ""}
    </div>`
        : ""
    }
  </li>`;
}

function askTab() {
  const st = askState();
  if (!library) {
    loadLibrary()
      .then(() => X.rerender())
      .catch((e) => {
        st.error = e.message;
        X.rerender();
      });
    return st.error ? `<section class="card"><p class="field-error">${esc(st.error)}</p></section>` : `<section class="card"><p class="muted">Fragen werden geladen …</p></section>`;
  }
  const lib = library;
  const query = st.q;
  const active = D.searchTerms(query).length > 0;
  const notices = new Map(lib.collections.map((c) => [c.book, c.data.meta.hinweistext_sicherheit]));
  const sources = lib.collections.map((c) => c.data.meta.quelle).join(" · ");
  let body;
  if (active) {
    const hits = D.searchFaq(lib.fragen, query);
    body = `<p class="muted small" aria-live="polite">${hits.length ? `${D.formatNumber(hits.length, 0)} ${hits.length === 1 ? "Frage" : "Fragen"} gefunden` : "Keine Frage gefunden – anderes Wort versuchen."}</p>
      <ul class="faq-list">${hits
        .slice(0, st.shown)
        .map((h) => questionItem(h.question, st, query, notices, true))
        .join("")}</ul>
      ${hits.length > st.shown ? `<button class="btn block" data-act="ic-more">Weitere anzeigen (${D.formatNumber(hits.length - st.shown, 0)})</button>` : ""}`;
  } else {
    body = `<ul class="faq-groups">${lib.collections
      .map((g) => {
        const gOpen = st.group === g.book;
        return `<li class="faq-group ${gOpen ? "is-open" : ""}">
        <button class="faq-row faq-row--group" data-act="ic-group" data-arg="${g.book}" aria-expanded="${gOpen}"><strong>${esc(g.label)}</strong><span class="muted small">${D.formatNumber(g.data.fragen.length, 0)} Fragen · ${g.parts.length} Teile ${gOpen ? "▴" : "▾"}</span></button>
        ${
          gOpen
            ? `<ul class="faq-parts">${g.parts
                .map((p) => {
                  const pk = `${g.book}|${p.teil}`;
                  const pOpen = st.part === pk;
                  return `<li class="faq-part ${pOpen ? "is-open" : ""}">
            <button class="faq-row" data-act="ic-part" data-arg="${esc(pk)}" aria-expanded="${pOpen}"><span><span class="muted small">Teil ${esc(D.roman(p.teil))}</span><br><strong>${esc(p.thema)}</strong></span><span class="muted small">${p.count} Fragen · ${p.chapters.length} Kapitel ${pOpen ? "▴" : "▾"}</span></button>
            ${
              pOpen
                ? `<ul class="faq-chapters">${p.chapters
                    .map((c) => {
                      const ck = `${pk}|${c.name}`;
                      const cOpen = st.chapter === ck;
                      return `<li class="faq-chapter ${cOpen ? "is-open" : ""}">
                <button class="faq-row faq-row--chapter" data-act="ic-chapter" data-arg="${esc(ck)}" aria-expanded="${cOpen}"><span>${esc(c.name)}</span><span class="muted small">${c.questions.length} ${cOpen ? "▴" : "▾"}</span></button>
                ${cOpen ? `<ul class="faq-list">${c.questions.map((q) => questionItem(q, st, "", notices, false)).join("")}</ul>` : ""}
              </li>`;
                    })
                    .join("")}</ul>`
                : ""
            }
          </li>`;
                })
                .join("")}</ul>`
            : ""
        }
      </li>`;
      })
      .join("")}</ul>`;
  }
  return `<section class="card faq">
    <div class="wo-head"><h3>Ask iCoach.me</h3></div>
    <p class="muted small">${D.formatNumber(lib.fragen.length, 0)} Fragen aus ${lib.collections.length} Büchern · ${esc(sources)}</p>
    <div class="field"><input type="search" id="ic-q" data-ic="q" value="${esc(query)}" placeholder="Schlagwort, z. B. Kreatin, Schlaf, Ferritin …" autocomplete="off" aria-label="Fragen durchsuchen"></div>
    ${active ? "" : `<p class="muted small">Sucht in allen Büchern: Fragen, Antworten, Stichworte und Kapitel.</p>`}
    ${body}
    <p class="muted small">${esc(lib.collections[0]?.data.meta.hinweistext_sicherheit ?? "")}</p>
  </section>`;
}

/** Ziel aus einem Modul: Buch und Teil (Thema) aufklappen. */
function openTarget(target) {
  const st = askState();
  Object.assign(st, { q: "", group: null, part: null, chapter: null, question: null, shown: PAGE });
  if (!target || target.kind !== "book") return;
  st.group = target.book;
  const apply = () => {
    const c = library?.collections.find((x) => x.book === target.book);
    const p = c?.parts.find((x) => x.thema === target.thema);
    if (p) st.part = `${c.book}|${p.teil}`;
  };
  if (library) apply();
  else loadLibrary().then(() => {
    apply();
    X.rerender();
  });
}

// ------------------------------------------------------------------ Downloads

function downloadsTab() {
  return `<section class="card">
      <h3>Downloads</h3>
      <p class="muted small">Die Bücher als PDF. Sie sind mit einem Passwort geschützt – beim Öffnen fragt das PDF-Programm danach.</p>
    </section>
    ${D.BOOK_ORDER.map((id) => {
      const b = D.BOOKS[id];
      return `<section class="card icoach-book">
        <div class="icoach-book__cover" aria-hidden="true"><span class="icoach-book__brand">${esc(b.brand)}</span><span class="icoach-book__title">${esc(b.title)}</span><span class="icoach-book__sub">${esc(b.subtitle)}</span></div>
        <h3>${esc(b.brand)} – ${esc(b.title)}</h3>
        <p class="small">${esc(b.subtitle)}. ${esc(b.description)}</p>
        <p class="muted small">PDF · ${b.pages} Seiten · ${esc(b.edition)} · mit Passwort</p>
        <div class="row-actions"><a class="btn primary" href="${bookHref(id)}" target="_blank" rel="noopener">Im Buch lesen</a><a class="btn" href="${bookHref(id)}" download>Herunterladen</a></div>
      </section>`;
    }).join("")}`;
}

// ------------------------------------------------------------------ Magazin

function magazineTab() {
  const S = X.S;
  const filter = S.icMagFilter ?? "alle";
  const list = M().magazinesIn(filter);
  const chips = [["alle", "Alle"], ...M().MAGAZINE_CATEGORY_ORDER.map((c) => [c, M().MAGAZINE_CATEGORY_LABELS[c]])];
  return `<section class="card"><h3>Magazin</h3>
      <p class="muted small">Magazine und Reports von iCoach.Me und LIFESPAN OS als PDF – zu jedem Heft, worum es geht und was du daraus lernst.</p>
      <div class="chip-row">${chips.map(([v, l]) => `<button class="chip ${v === filter ? "on" : ""}" data-act="ic-mag-filter" data-arg="${v}">${esc(l)}</button>`).join("")}</div>
    </section>
    ${list
      .map(
        (m) => `<section class="card magazine">
      <a class="magazine__cover" href="icoach/magazin/${esc(m.id)}.pdf" target="_blank" rel="noopener" title="„${esc(m.title)}“ lesen"><img src="icoach/magazin/${esc(m.id)}.jpg" alt="" loading="lazy" width="112" height="158"></a>
      <div class="magazine__body">
        <p class="muted small">${esc(m.series)} · ${esc(m.issued)}</p>
        <h3>${esc(m.title)}</h3>
        <p class="small">${esc(m.summary)}</p>
        <p class="small"><strong>Das lernst du</strong></p>
        <ul class="small">${m.learn.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        <p class="muted small">${esc(M().magazineMeta(m))}</p>
        <div class="row-actions"><a class="btn primary" href="icoach/magazin/${esc(m.id)}.pdf" target="_blank" rel="noopener">Lesen</a><a class="btn" href="icoach/magazin/${esc(m.id)}.pdf" download>Herunterladen</a></div>
      </div>
    </section>`,
      )
      .join("")}`;
}

// ------------------------------------------------------------------ Widgets: Koffein

function caffeineForm() {
  const S = X.S;
  if (!S.cf) {
    const d = new Date();
    S.cf = { bedtime: C().DEFAULT_BEDTIME, halfLife: String(C().DEFAULT_HALF_LIFE_H), drinkId: "filter", time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, amount: "200", errors: {} };
  }
  return S.cf;
}

const defaultAmount = (id) => {
  const ml = C().findDrink(id)?.portionMl;
  return ml === null || ml === undefined ? "" : String(ml);
};

function caffeineChart(t) {
  const W = 340;
  const H = 170;
  const L = 34;
  const R = 8;
  const T = 10;
  const B = 22;
  const DAY = 1440;
  const steps = [50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000];
  const peak = t.peak?.mg ?? 0;
  const max = steps.find((s) => s >= peak) ?? Math.ceil(peak / 500) * 500;
  const x = (o) => L + (o / DAY) * (W - L - R);
  const y = (mg) => T + (1 - mg / max) * (H - T - B);
  const pts = C().chartPoints(t);
  const line = pts.map((p, k) => `${k ? "L" : "M"}${x(p.offset).toFixed(1)},${y(p.mg).toFixed(1)}`).join(" ");
  const bed = Math.min(t.bedtimeOffset, DAY);
  return `<svg class="pc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Koffein im Körper über den Tag">
    ${[0, max / 2, max].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${D.formatNumber(v, 0)}</text>`).join("")}
    <path d="${line} L${x(DAY).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z" fill="var(--orange)" fill-opacity=".15"/>
    <path d="${line}" fill="none" stroke="var(--orange)" stroke-width="2"/>
    ${t.bedtimeOffset <= DAY ? `<line x1="${x(bed).toFixed(1)}" x2="${x(bed).toFixed(1)}" y1="${T}" y2="${H - B}" class="level-now"/><text x="${x(bed).toFixed(1)}" y="${T + 8}" text-anchor="middle" class="level-now__label">Schlaf</text>` : ""}
    ${[0, 360, 720, 1080, 1440].map((o) => `<text x="${x(o).toFixed(1)}" y="${H - 6}" text-anchor="${o === 0 ? "start" : o === 1440 ? "end" : "middle"}">${o === 1440 ? "24:00" : C().formatClock(o)}</text>`).join("")}
  </svg>`;
}

function widgetsTab() {
  const S = X.S;
  const f = caffeineForm();
  const date = today();
  const intakes = CF.intakesOn(S.catalog, S.caffeine, date);
  const hl = D.parseDecimal(f.halfLife);
  const hlMsg = C().halfLifeError(hl);
  const bedOk = C().parseClock(f.bedtime) !== null;
  const t = C().caffeineTimeline(
    intakes.map((i) => ({ id: i.id, drinkId: i.drinkId, time: i.time, mg: i.mg, ml: i.ml, label: i.label })),
    bedOk ? f.bedtime : C().DEFAULT_BEDTIME,
    hlMsg === null ? hl : C().DEFAULT_HALF_LIFE_H,
  );
  const drink = C().findDrink(f.drinkId);
  const free = drink?.portionMl === null;
  const preview = C().buildIntake({ drinkId: f.drinkId, time: "12:00", amount: D.parseDecimal(f.amount) });
  const e = f.errors ?? {};
  const fmg = C().formatMg;
  const pending = CF.unsentCaffeine(S.caffeine);
  return `<section class="card">
    <div class="wo-head"><h3>Koffein</h3><span class="tag">Modellrechnung</span></div>
    <p class="muted small">Zeitstrahl über 24 Stunden: wie viel Koffein zur Einschlafzeit noch im Körper ist.</p>
    <div class="lab-row__grid">
      <div class="field ${bedOk ? "" : "has-error"}"><label for="cf-bed">Einschlafzeit</label><input id="cf-bed" type="time" data-cf="bedtime" value="${esc(f.bedtime)}">${bedOk ? "" : `<p class="field-error">Uhrzeit als HH:MM eingeben.</p>`}</div>
      <div class="field ${hlMsg ? "has-error" : ""}"><label for="cf-hl">Halbwertszeit</label><div class="input-row"><input id="cf-hl" type="text" inputmode="decimal" data-cf="halfLife" value="${esc(f.halfLife)}"><span class="unit">h</span></div>${hlMsg ? `<p class="field-error">${esc(hlMsg)}</p>` : `<p class="muted small">Durchschnitt etwa 5 Stunden</p>`}</div>
    </div>
    <div class="field ${e.drinkId ? "has-error" : ""}"><label for="cf-drink">Getränk</label><select id="cf-drink" data-cf="drinkId">${C()
      .CAFFEINE_DRINKS.map((d) => `<option value="${esc(d.id)}" ${d.id === f.drinkId ? "selected" : ""}>${esc(d.portionMl === null ? `${d.label} (mg frei eintragen)` : `${d.label} · ${d.portionMl} ml · ${d.portionMg} mg`)}</option>`)
      .join("")}</select></div>
    <div class="lab-row__grid">
      <div class="field ${e.time ? "has-error" : ""}"><label for="cf-time">Uhrzeit</label><input id="cf-time" type="time" data-cf="time" value="${esc(f.time)}">${e.time ? `<p class="field-error">${esc(e.time)}</p>` : ""}</div>
      <div class="field ${e.amount ? "has-error" : ""}"><label for="cf-amount">${free ? "Koffein" : "Menge"}</label><div class="input-row"><input id="cf-amount" type="text" inputmode="decimal" data-cf="amount" value="${esc(f.amount)}" ${free ? 'placeholder="z. B. 200"' : ""}><span class="unit">${free ? "mg" : "ml"}</span></div>
        ${e.amount ? `<p class="field-error">${esc(e.amount)}</p>` : !free && preview.ok ? `<p class="muted small">entspricht ${esc(fmg(preview.intake.mg))} mg Koffein</p>` : ""}</div>
    </div>
    <button class="btn primary block" data-act="cf-add">Eintragen</button>
    ${pending ? `<p class="muted small">${pending} ${pending === 1 ? "Änderung" : "Änderungen"} beim Koffein noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
  </section>
  ${
    intakes.length
      ? `<section class="card">
    <div class="level-metrics">
      <div><span class="muted small">Koffein im Körper ${esc(C().formatDayTime(t.bedtimeOffset))}</span><strong class="level-big">${esc(fmg(t.bedtimeMg))} mg</strong></div>
      <div><span class="muted small">Aufgenommen</span><strong>${esc(fmg(t.totalMg))} mg</strong></div>
      ${t.bedtimeShare !== null ? `<div><span class="muted small">davon zur Einschlafzeit noch vorhanden</span><strong>${esc(D.formatNumber(t.bedtimeShare * 100, 0))} %</strong></div>` : ""}
      ${t.peak ? `<div><span class="muted small">Höchstwert ${esc(C().formatDayTime(t.peak.offset))}</span><strong>${esc(fmg(t.peak.mg))} mg</strong></div>` : ""}
      ${t.clearedOffset !== null ? `<div><span class="muted small">vollständig abgebaut (höchstens ${C().CLEARED_BELOW_MG} mg)</span><strong>${esc(C().formatDayTime(t.clearedOffset).replace(/^./, (c) => c.toUpperCase()))}</strong></div>` : ""}
    </div>
    ${caffeineChart(t)}
    <ul class="lab-results">${t.intakes
      .map(
        (i) => `<li><span><strong>${esc(i.time)}</strong> ${esc(i.label)}<br><span class="muted small">${i.ml === null ? "" : `${D.formatNumber(i.ml, 0)} ml · `}${esc(fmg(i.mg))} mg · Rest um ${esc(f.bedtime)}: ${esc(fmg(i.atBedtimeMg))} mg</span></span>
        <button class="btn sm danger" data-act="cf-delete" data-arg="${esc(i.id)}" aria-label="Entfernen">✕</button></li>`,
      )
      .join("")}</ul>
    <p class="muted small">Vereinfachte Modellrechnung (vollständige Aufnahme, Abbau mit fester Halbwertszeit) – keine Messung. Koffein aus Nutrition (Supplemente, Mahlzeiten, Fasttracking) zeigt der Zeitstrahl am PC.</p>
  </section>`
      : `<section class="card"><p class="muted">Noch keine Einnahme heute. Wähle Getränk, Uhrzeit und Menge und tippe auf „Eintragen“.</p></section>`
  }`;
}

// ------------------------------------------------------------------ Aktionen

async function persistCaffeine() {
  try {
    await X.store.set("caffeine", X.S.caffeine);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

export const icoachActions = {
  "ic-tab": (el) => {
    X.S.icTab = el.dataset.arg;
    X.rerender();
  },
  "ic-module": (el) => {
    X.S.icModule = el.dataset.arg || null;
    X.rerender();
    window.scrollTo(0, 0);
  },
  "ic-ask-module": (el) => {
    const m = D.COACH_MODULES.find((x) => x.id === el.dataset.arg);
    openTarget(m?.ask ?? null);
    X.S.icTab = "ask";
    X.rerender();
    window.scrollTo(0, 0);
  },
  "ic-group": (el) => {
    const st = askState();
    st.group = st.group === el.dataset.arg ? null : el.dataset.arg;
    st.part = st.chapter = st.question = null;
    X.rerender();
  },
  "ic-part": (el) => {
    const st = askState();
    st.part = st.part === el.dataset.arg ? null : el.dataset.arg;
    st.chapter = st.question = null;
    X.rerender();
  },
  "ic-chapter": (el) => {
    const st = askState();
    st.chapter = st.chapter === el.dataset.arg ? null : el.dataset.arg;
    st.question = null;
    X.rerender();
  },
  "ic-q": (el) => {
    const st = askState();
    st.question = st.question === el.dataset.arg ? null : el.dataset.arg;
    X.rerender();
    if (st.question) requestAnimationFrame(() => document.getElementById(`faq-${st.question}`)?.scrollIntoView({ block: "nearest" }));
  },
  "ic-more": () => {
    askState().shown += PAGE;
    X.rerender();
  },
  "ic-mag-filter": (el) => {
    X.S.icMagFilter = el.dataset.arg;
    X.rerender();
  },
  "cf-add": async () => {
    const S = X.S;
    const f = caffeineForm();
    const r = C().buildIntake({ drinkId: f.drinkId, time: f.time, amount: D.parseDecimal(f.amount) });
    if (!r.ok) {
      f.errors = r.errors;
      return X.rerender();
    }
    f.errors = {};
    try {
      CF.addIntake(S.catalog, S.caffeine, { date: today(), time: r.intake.time, drinkId: r.intake.drinkId, label: C().findDrink(r.intake.drinkId)?.label ?? r.intake.drinkId, ml: r.intake.ml, mg: Math.round(r.intake.mg * 10) / 10 }, { uuid: X.uuid, now: new Date() });
      await persistCaffeine();
      X.toast(`${C().formatMg(r.intake.mg)} mg Koffein eingetragen.`);
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
  "cf-delete": async (el) => {
    if (!X.confirmTwice(el, "Entfernen?")) return;
    try {
      CF.deleteIntake(X.S.catalog, X.S.caffeine, el.dataset.arg);
      await persistCaffeine();
    } catch (e) {
      X.toast(e.message, true);
    }
    X.rerender();
  },
};

let searchTimer = null;

/** Eingaben; true = behandelt. */
export function icoachInput(el) {
  const S = X.S;
  if (el.dataset?.ic === "q") {
    const st = askState();
    st.q = el.value;
    st.shown = PAGE;
    st.question = null;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const pos = el.selectionStart;
      X.rerender();
      const box = document.getElementById("ic-q");
      if (box) {
        box.focus();
        try {
          box.setSelectionRange(pos, pos);
        } catch {
          /* type=search ohne Auswahl */
        }
      }
    }, 250);
    return true;
  }
  const k = el.dataset?.cf;
  if (k) {
    const f = caffeineForm();
    f[k] = el.value;
    if (f.errors?.[k]) f.errors[k] = "";
    return true;
  }
  return false;
}

/** Auswahlfelder und verlassene Felder; true = behandelt. */
export function icoachChange(el) {
  const k = el.dataset?.cf;
  if (k) {
    const f = caffeineForm();
    f[k] = el.value;
    if (k === "drinkId") {
      f.amount = defaultAmount(el.value);
      f.errors = {};
    }
    const id = document.activeElement?.id;
    setTimeout(() => {
      X.rerender();
      if (id) document.getElementById(id)?.focus();
    }, 0);
    return true;
  }
  if (el.dataset?.ic) return icoachInput(el);
  return false;
}
