// LIFESPAN OS Mobil – Globale Suche wie am PC (`GlobalSearch.tsx`, Strg+K; 1.92.0, Paket E):
// Bereiche und Reiter, Übungen, Lebensmittel, Laborwerte, Einheiten, Lebensstil-Notizen, Ziele und
// Termine – dazu Tage („17.11.“, „heute“, „gestern“). Rechnung aus pcdomain.js (`globalSearch`).
// Die Sprungziele sind die Ansichten am Handy (statt der Hash-Adressen des PCs).

import * as D from "./pcdomain.js";
import * as N from "./nutrition.js";
import * as O from "./pcoverview.js";
import { SECTIONS, sectionHidden } from "./nav.js";
import { TRAINING_TABS } from "./training.js";
import { BODY_TABS } from "./body.js";
import { TABS as SUPER_TABS } from "./super.js";
import { TABS as NUTRITION_TABS, X, buildDb, today } from "./diary.js";

const esc = (v) => X.esc(v);
const G = () => D.globalSearch;

const HEALTH_TABS = [
  ["draws", "Blutabnahmen"],
  ["trend", "Verlauf"],
  ["heart", "Heart"],
  ["glucose", "Blutzucker"],
  ["appointments", "Termine"],
  ["report", "Arztbericht"],
  ["lifetime", "Once in a Lifetime"],
  ["analytes", "Parameter"],
];

let cache = null;

/** Alle Einträge der Suche (einmal je Öffnen der Ansicht berechnet). */
export function searchEntries(db) {
  const S = X.S;
  const e = G().entry;
  const out = [];
  for (const s of SECTIONS) if (s.view && !sectionHidden(s.id)) out.push(e("section", s.id, s.label, `sec|${s.id}`));
  const tabs = (section, label, list) => {
    for (const t of list) out.push(e("section", `${section}:${t[0]}`, `${label} → ${t[1]}`, `tab|${section}|${t[0]}`));
  };
  tabs("training", "Training", TRAINING_TABS);
  tabs("nutrition", "Nutrition", NUTRITION_TABS);
  tabs("body", "Body & Longevity", BODY_TABS);
  tabs("health", "Health", HEALTH_TABS);
  if (!sectionHidden("superhuman")) tabs("superhuman", "Superhuman", SUPER_TABS.filter((t) => typeof t[0] === "string" && Number.isNaN(Number(t[0]))));

  const used = new Map();
  for (const s of O.setLog(db)) used.set(s.exerciseId, (used.get(s.exerciseId) ?? 0) + 1);
  for (const x of db.exercises.values()) {
    if (x.archived) continue;
    out.push(e("exercise", x.id, x.name, `ex|${x.id}`, [x.muscle_group, x.equipment].filter(Boolean).join(" · ") || null, used.get(x.id) ?? 0));
  }
  const foods = S.food?.local ? N.allFoods(S.catalog, S.food.local) : new Map((S.catalog?.nutrition?.foods ?? []).map((f) => [f.id, f]));
  for (const f of foods.values()) if (!f.archived) out.push(e("food", f.id, f.name, `food|${f.id}`, f.brand ?? null));
  for (const a of db.pc.lab_analyte ?? []) if (!a.archived) out.push(e("analyte", a.id, a.name, `lab|${a.id}`, a.short_name ?? a.unit ?? null));
  for (const w of db.workouts ?? []) {
    if ((w.status ?? "done") !== "done") continue;
    out.push(e("workout", w.id, w.title || "Einheit", `wo|${w.id}`, D.formatDate(w.date)));
  }
  for (const n of db.pc.lifestyle_note ?? []) out.push(e("note", n.id, String(n.text ?? "").slice(0, 80), `note|${n.id}`, D.formatDate(n.date)));
  for (const g of db.pc.goal ?? []) out.push(e("goal", g.id, g.title, `goal|${g.id}`, g.archived ? "archiviert" : null));
  for (const a of db.pc.appointment ?? []) out.push(e("appointment", a.id, a.title, `appt|${a.id}`, D.formatDate(a.date)));
  return out;
}

export function viewSearch() {
  const S = X.S;
  if (!cache) {
    try {
      cache = searchEntries(buildDb());
    } catch {
      cache = [];
    }
  }
  const q = S.gsQuery ?? "";
  return `${X.header("Suchen")}<main class="wrap">
    <section class="card gs-card">
      <label class="sr-only" for="gs-q">Suchen</label>
      <input id="gs-q" type="search" placeholder="Übung, Lebensmittel, Laborwert, Datum …" value="${esc(q)}" autocomplete="off" enterkeyhint="search">
      <div id="gs-results">${resultsHtml(q)}</div>
      <p class="muted small card-info">Sucht in Bereichen und Reitern, Übungen, Lebensmitteln, Laborwerten, Einheiten, Notizen, Zielen und Terminen. Ein Datum („17.11.“, „heute“, „gestern“) führt zu Ernährung, Schlaf, Körperwerten und Alltagsbewegung dieses Tages.</p>
    </section>
  </main>`;
}

/** Antworten aus den FAQ (1.103.0, wie PC 1.0.177): z. B. „Gym anlegen“ zeigt die Anleitung. */
export function faqHtml(list, openFirst = true) {
  const F = D.appFaq;
  return list
    .map(
      (it, i) =>
        `<details class="faq-item" ${openFirst && i === 0 ? "open" : ""}><summary><span class="faq-item__q">${esc(it.question)}</span><span class="tag">${esc(F.FAQ_DEVICE_LABELS[it.device])}</span></summary><p class="faq-item__a">${esc(it.answer)}</p></details>`,
    )
    .join("");
}

function resultsHtml(q) {
  if (!String(q).trim()) return "";
  const hits = G().searchAll(cache ?? [], q, today(), 20);
  const faq = String(q).trim().length >= 3 ? D.appFaq.searchFaq(q, undefined, 3).map((h) => h.item) : [];
  const answers = faq.length
    ? `<div class="gs-faq"><b class="small">Antwort aus den FAQ</b>${faqHtml(faq)}<button class="linkbtn small" data-act="faq-open" data-arg="${esc(String(q).trim())}">Alle passenden Antworten unter Settings → FAQ</button></div>`
    : "";
  if (!hits.length) return answers || `<p class="muted">Keine Treffer.</p>`;
  return `${answers}<ul class="plain-list gs-list">${hits
    .map(
      (h) =>
        `<li><button class="gs-hit" data-act="gs-go" data-arg="${esc(h.kind === "day" ? `day|${h.id.slice(4)}` : h.href)}"><span class="tag">${esc(G().HIT_KIND_LABELS[h.kind])}</span><span class="gs-hit__text"><strong>${esc(h.label)}</strong>${h.detail ? `<span class="muted small">${esc(h.detail)}</span>` : ""}</span></button></li>`,
    )
    .join("")}</ul>`;
}

/** Eingabe in der Suche; true = behandelt. */
export function searchInput(el) {
  if (el.id === "faq-q") {
    X.S.faqQuery = el.value;
    const box = document.getElementById("faq-results");
    if (box) box.innerHTML = faqListHtml(el.value);
    return true;
  }
  if (el.id !== "gs-q") return false;
  X.S.gsQuery = el.value;
  const box = document.getElementById("gs-results");
  if (box) box.innerHTML = resultsHtml(el.value);
  return true;
}

function openSection(id) {
  const s = SECTIONS.find((x) => x.id === id);
  if (s?.view) X.go(s.view);
}

/** Sprungziel ausführen (Ansichten und Zustand am Handy). */
export function goTarget(target) {
  const S = X.S;
  const [kind, a, b] = target.split("|");
  cache = null;
  if (kind === "sec") return openSection(a);
  if (kind === "tab") {
    if (a === "training") S.trainTab = b;
    else if (a === "body") S.bodyTab = b;
    else if (a === "health") S.healthTab = b;
    else if (a === "superhuman") S.superTab = b;
    else if (a === "nutrition") return X.go(b);
    return openSection(a);
  }
  if (kind === "ex") {
    const db = buildDb();
    if (O.setLog(db).some((s) => s.exerciseId === a && !s.isWarmup)) {
      S.trainTab = "progress";
      S.trainProgEx = a;
      S.trainProgMetric = null;
    } else {
      S.trainTab = "exercises";
      S.trainExQuery = db.exercises.get(a)?.name ?? "";
    }
    return X.go("training");
  }
  if (kind === "food") {
    const foods = S.food?.local ? N.allFoods(S.catalog, S.food.local) : new Map();
    if (S.food) S.food.query = foods.get(a)?.name ?? "";
    return X.go("food");
  }
  if (kind === "lab") {
    S.healthTab = "trend";
    S.healthTrend = a;
    return X.go("health");
  }
  if (kind === "wo") return X.go("detail", a);
  if (kind === "note") {
    const n = (buildDb().pc.lifestyle_note ?? []).find((x) => x.id === a);
    S.bodyTab = "lifestyle";
    S.bpNote = n ? { id: n.id, date: n.date, category: n.category, text: n.text } : null;
    return X.go("body");
  }
  if (kind === "goal") {
    X.go("insights");
    requestAnimationFrame(() => document.querySelector('[data-card="goals"]')?.scrollIntoView({ block: "start" }));
    return;
  }
  if (kind === "appt") {
    S.healthTab = "appointments";
    return X.go("health");
  }
  if (kind === "day") {
    const [date, part] = a.includes(":") ? a.split(":") : [a, b];
    const t = today();
    const d = date > t ? t : date;
    if (part === "nutrition") {
      S.diaryDate = d;
      return X.go("diary");
    }
    if (part === "sleep") return X.go("sleep");
    if (part === "body") {
      S.bodyTab = "entry";
      return X.go("body");
    }
    if (part === "neat") {
      S.trainTab = "neat";
      S.trainNeatDate = d === t ? null : d;
      return X.go("training");
    }
  }
  return undefined;
}

export const searchActions = {
  "gs-open": () => {
    X.S.menuOpen = false;
    cache = null;
    X.go("search");
    setTimeout(() => document.getElementById("gs-q")?.focus(), 60);
  },
  "gs-go": (el) => goTarget(el.dataset.arg ?? ""),
  // Aus der Suche zu Settings → FAQ mit derselben Frage (1.103.0)
  "faq-open": (el) => {
    X.S.faqQuery = el.dataset.arg ?? "";
    X.go("settings");
    setTimeout(() => document.getElementById("set-faq")?.scrollIntoView({ block: "start" }), 80);
  },
};

/** Settings → FAQ: Liste nach Bereichen bzw. Treffer zur Eingabe. */
export function faqListHtml(q) {
  const F = D.appFaq;
  if (String(q ?? "").trim()) {
    const hits = F.searchFaq(q, undefined, 25).map((h) => h.item);
    return hits.length
      ? `<p class="muted small">${hits.length} ${hits.length === 1 ? "Antwort" : "Antworten"}</p>${faqHtml(hits)}`
      : `<p class="muted small">Keine passende Antwort. Versuche ein anderes Wort – z. B. „Studio“ statt „Gym“ wird ebenfalls erkannt.</p>`;
  }
  return `<p class="muted small">${F.APP_FAQ.length} Fragen in ${F.FAQ_AREAS.length} Bereichen – antippen zum Aufklappen.</p>${F.FAQ_AREAS.map(
    (a) => `<h4 class="faq-area__title">${esc(a)}</h4>${faqHtml(F.APP_FAQ.filter((f) => f.area === a), false)}`,
  ).join("")}`;
}

/** Karte „FAQ“ in Settings (1.103.0). */
export function faqCardHtml() {
  const q = X.S.faqQuery ?? "";
  return `<section class="card" id="set-faq"><h3>FAQ – Fragen zur App</h3>
    <label class="sr-only" for="faq-q">FAQ durchsuchen</label>
    <input id="faq-q" type="search" placeholder="Frage oder Stichwort, z. B. Gym anlegen" value="${esc(q)}" autocomplete="off" enterkeyhint="search">
    <div id="faq-results" class="faq-list">${faqListHtml(q)}</div>
  </section>`;
}
