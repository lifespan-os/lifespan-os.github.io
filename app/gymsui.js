// LIFESPAN OS Mobil – Meine Gyms (1.60.0): Training → „Meine Gyms“, Gymauswahl vor „Freies Training“
// und die Maschinenauswahl im Training nur mit den Maschinen des aktiven Gyms (wie am PC 1.0.159).
// Logik in gymsdata.js; Änderungen gehen mit der Rückgabedatei an den PC.
// Seit 1.78.0 je Gym ein Zutrittscode (Foto mit der Kamera oder Screenshot), antippen vergrößert ihn.
// Seit 1.80.0 (wie PC 1.0.166): Ausschnitt wählen vor dem Speichern und Knopf „Zutrittscode“ im Training.
// Seit 1.82.0 (wie PC 1.0.168): Vorder- und Rückseite, Antippen dreht die Karte um.

import * as G from "./gymsdata.js";
import * as D from "./pcdomain.js";
import { appDay } from "./core.js";
import { cropPhoto } from "./photocrop.js";
import { thumbButton, has as hasImage, imageUrl } from "./machineimages.js";
import * as TR from "./trainingdata.js";
import { openImageZoom } from "./mapzoom.js";
import { autoAttrs, autoSaveHtml, autosaveNow } from "./autosave.js";

let X = null; // { S, esc, header, toast, store, uuid, rerender, go, confirmTwice }

export function initGyms(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const pcActive = () => (X.S.catalog?.pc?.settings ?? []).find((s) => s.key === "training.active_gym")?.value ?? null;

export async function gymsBoot() {
  X.S.gyms = G.gymsState(await X.store.get("gyms").catch(() => null));
}

async function persist() {
  try {
    await X.store.set("gyms", X.S.gyms);
  } catch (e) {
    X.toast("Speichern auf dem Gerät fehlgeschlagen: " + e.message, true);
  }
}

export const unsentGyms = () => G.unsentGyms(X.S.gyms);

/** Mitgelieferte Studios (1.97.0, z. B. „Grünblick Private Gym“) einmal anlegen. */
function ensureBuiltin() {
  const S = X.S;
  if (!S.catalog || !S.gyms) return;
  if (G.ensureBuiltin(S.catalog, S.gyms)) void persist();
}

/** Aktives Gym (ID) und seine Maschinenliste; im Training das Gym der Einheit (Handy 1.65.0). */
export function activeGym() {
  const S = X.S;
  ensureBuiltin();
  const list = G.gymList(S.catalog, S.gyms);
  const own = S.active?.gymId && list.some((g) => g.id === S.active.gymId) ? S.active.gymId : null;
  const id = own ?? G.activeGymId(S.catalog, S.gyms, pcActive());
  const gym = list.find((g) => g.id === id) ?? null;
  return { gym, entries: gym ? G.gymEntries(S.catalog, S.gyms, gym.id) : [] };
}

/** Katalog für die Maschinensuche im Training (nur Maschinen des aktiven Gyms, Nummer des Gyms). */
export function pickerCatalog() {
  const { entries } = activeGym();
  return G.gymCatalog(X.S.catalog, entries, { all: Boolean(X.S.gymAll) });
}

/** Hinweis unter der Maschinensuche mit Umschalter „Alle Maschinen“. */
export function pickerGymNote() {
  const { gym, entries } = activeGym();
  if (!gym || !entries.length) return "";
  return `<p class="muted small">${
    X.S.gymAll ? `Alle Maschinen – die aus „${esc(gym.name)}“ haben ihre Nummer.` : `Nur Maschinen aus „${esc(gym.name)}“ (${entries.length}).`
  } <button class="linkbtn" data-act="gym-all">${X.S.gymAll ? `Nur ${esc(gym.name)}` : "Alle Maschinen zeigen"}</button></p>`;
}

/**
 * Knopf „Zutrittscode“ neben einer Gym-Auswahl im Training (1.80.0). `selectId`: die Auswahl, deren
 * aktueller Wert beim Tippen gilt; sichtbar, wenn das gewählte Gym einen Code hat.
 */
function gymCodeButtonHtml(gymId, selectId) {
  const g = G.gymList(X.S.catalog, X.S.gyms).find((x) => x.id === gymId);
  if (!G.accessCodeImages(g).front) return "";
  return `<button class="btn sm gym-code-btn" data-act="gym-code-show" data-arg="${esc(selectId)}" aria-label="Zutrittscode von ${esc(g.name)} zeigen">Zutrittscode</button>`;
}

/** Auswahl „Gym“ vor „Freies Training“. */
/**
 * Vorgewähltes Gym (Handy 1.117.0, wie PC 1.0.193): Auswahl von heute, sonst das Gym mit den meisten
 * Einheiten der letzten 30 Tage (PC und Handy), sonst das bisher aktive Gym. Das Plan-Gym setzt der Plan.
 */
function preselectedGymId() {
  const S = X.S;
  const list = G.gymList(S.catalog, S.gyms);
  const today = appDay();
  const seen = new Set();
  const workouts = [];
  for (const w of S.workouts ?? []) {
    seen.add(w.id);
    workouts.push({ date: w.date, gymId: w.gymId ?? null });
  }
  for (const w of S.catalog?.pc?.workout ?? []) if (!seen.has(w.id)) workouts.push({ date: w.date, gymId: w.gym_id ?? null });
  const choice = S.gyms.choiceDate && S.gyms.active ? { date: S.gyms.choiceDate, gymId: S.gyms.active } : null;
  return D.gymPreselect.preselectGym({
    today,
    manual: choice,
    workouts,
    active: G.activeGymId(S.catalog, S.gyms, pcActive()),
    valid: new Set(list.map((g) => g.id)),
  });
}

export function activeGymSelectHtml(blocked) {
  const S = X.S;
  const list = G.gymList(S.catalog, S.gyms);
  if (!list.length) return "";
  const id = preselectedGymId();
  return `<div class="field"><label for="w-gym">Gym</label>
    <div class="gym-pick"><select id="w-gym" data-gym="active" ${blocked ? "disabled" : ""}>${list
      .map((g) => `<option value="${esc(g.id)}" ${g.id === id ? "selected" : ""}>${esc(g.name)}</option>`)
      .join("")}</select>${gymCodeButtonHtml(id, "w-gym")}</div></div>`;
}

/** ID des aktiven Gyms (für neue Einheiten). */
export function activeGymIdNow() {
  return preselectedGymId();
}

/** Auswahl „Gym“ einer Einheit (im Training, beim Bearbeiten und Nachtragen, Handy 1.65.0). */
export function workoutGymSelectHtml(w) {
  const S = X.S;
  const list = G.gymList(S.catalog, S.gyms);
  const names = G.gymNames(S.catalog, S.gyms);
  if (!list.length && !w.gymId) return "";
  const options = [...list.map((g) => [g.id, g.name])];
  if (w.gymId && !list.some((g) => g.id === w.gymId)) options.push([w.gymId, names.get(w.gymId) ?? "Gym (entfernt)"]);
  return `<div class="field wo-gym"><label for="wo-gym">Gym</label>
    <div class="gym-pick"><select id="wo-gym" data-wfield="gymId"><option value="">Ohne Gym</option>${options
      .map(([id, name]) => `<option value="${esc(id)}" ${id === w.gymId ? "selected" : ""}>${esc(name)}</option>`)
      .join("")}</select>${w.editOf || w.backfill ? "" : gymCodeButtonHtml(w.gymId, "wo-gym")}</div></div>`;
}

/** Auswahl „Gym“ eines Plans im Plan-Editor (optional). */
export function planGymSelectHtml(draft) {
  const S = X.S;
  const list = G.gymList(S.catalog, S.gyms);
  const names = G.gymNames(S.catalog, S.gyms);
  const value = draft.gymId ?? "";
  const options = list.map((g) => [g.id, g.name]);
  if (value && !list.some((g) => g.id === value)) options.push([value, names.get(value) ?? "Gym (entfernt)"]);
  return `<div class="field"><label for="plan-gym">Gym</label>
    <select id="plan-gym" data-plan="gymId"><option value="">Ohne festes Gym</option>${options
      .map(([id, name]) => `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(name)}</option>`)
      .join("")}</select><p class="muted small">Beim Start eines Trainingstags wird dieses Gym für die Einheit vorgewählt.</p></div>`;
}

// ------------------------------------------------------------------ Reiter „Meine Gyms“

const photoHtml = (g, cls = "gym-photo") => `<span class="${cls}">${g?.photo ? `<img src="${esc(g.photo)}" alt="">` : "🏋️"}</span>`;

export function viewGymsTab() {
  ensureBuiltin();
  const S = X.S;
  if (S.gymEdit) return editorHtml(S.gymEdit);
  const list = G.gymList(S.catalog, S.gyms);
  const active = G.activeGymId(S.catalog, S.gyms, pcActive());
  const sel = list.find((g) => g.id === S.gymSel) ?? null;
  if (sel) return detailHtml(sel, active);
  const open = G.unsentGyms(S.gyms);
  return `<section class="card">
    <div class="wo-head"><h3>Meine Gyms</h3><button class="btn sm primary" data-act="gym-new">+ Neues Gym</button></div>
    <p class="card__note">Im Training wählst du unter „Einheiten“ das Gym – dann stehen nur dessen Maschinen mit der Nummer im Studio zur Auswahl.</p>
    ${open ? `<p class="muted small">${open} ${open === 1 ? "Änderung" : "Änderungen"} noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    <div class="list">${list
      .map(
        (g) => `<button class="item gym-item" data-act="gym-open" data-arg="${esc(g.id)}">${photoHtml(g)}<span class="main"><b>${esc(g.name)}</b>
          <span class="muted small">${G.gymEntries(S.catalog, S.gyms, g.id).length} Maschinen${g.address ? ` · ${esc(g.address)}` : ""}</span>
          <span>${g.id === active ? '<span class="tag">Aktiv</span> ' : ""}${g.package_id === G.REFERENCE_PACKAGE ? '<span class="tag">Referenz</span>' : ""}</span></span><span class="chev">›</span></button>`,
      )
      .join("")}</div>
  </section>
  ${reviewHtml()}
  ${shareHtml(list)}
  ${packagesHtml(list)}`;
}

// ------------------------------------------------------------------ Gyms teilen (1.137.0, wie PC 1.0.208)

/** Gewählte Gyms zum Teilen; ohne eigene Wahl alle außer dem Referenz-Studio. */
function shareSelection(list) {
  const S = X.S;
  if (!S.gymShare) S.gymShare = list.filter((g) => g.package_id !== G.REFERENCE_PACKAGE).map((g) => g.id);
  return new Set(S.gymShare.filter((id) => list.some((g) => g.id === id)));
}

const machinesText = (n) => `${n} ${n === 1 ? "Maschine" : "Maschinen"}`;

function shareHtml(list) {
  if (!list.length) return "";
  const picked = shareSelection(list);
  return `<section class="card">
    <h3>Gyms teilen</h3>
    <p class="card__note">Eine Datei mit den gewählten Gyms: Name, Anschrift, Kontakt, Telefon, E-Mail, Social Media, Website, Foto und die Maschinen mit Nummer und Notiz. Nicht enthalten: Mitgliedsnummer und Zutrittscode (Vorder- und Rückseite). Andere übernehmen sie mit „Paketdatei wählen …“ unter Studio-Pakete bzw. am PC mit „Studio-Paket installieren …“ – ihre eigenen Angaben bleiben dabei erhalten.</p>
    <div class="gym-share">${list
      .map(
        (g) => `<label class="toggle"><input type="checkbox" data-gym="share" value="${esc(g.id)}" ${picked.has(g.id) ? "checked" : ""}> ${esc(g.name)} <span class="muted small">(${machinesText(G.gymEntries(X.S.catalog, X.S.gyms, g.id).length)})</span></label>`,
      )
      .join("")}</div>
    <button class="btn block primary" data-act="gym-share" ${picked.size ? "" : "disabled"}>Exportieren</button>
    <div id="gym-share-result"></div>
  </section>`;
}

/** Bild (URL) als verkleinertes JPEG (data-URL) wie am PC: Längsseite ≤ 480 px. */
function scaledPhoto(url) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error("kein Bild"));
    const img = new Image();
    img.onload = () => {
      const max = D.gymShare.PHOTO_MAX_SIDE;
      const f = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * f));
      c.height = Math.max(1, Math.round(img.naturalHeight * f));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", D.gymShare.PHOTO_QUALITY));
    };
    img.onerror = () => reject(new Error("Bild nicht lesbar"));
    img.src = url;
  });
}

async function shareGyms() {
  const S = X.S;
  const list = G.gymList(S.catalog, S.gyms);
  const ids = list.filter((g) => shareSelection(list).has(g.id)).map((g) => g.id);
  const r = G.shareBundle(S.catalog, S.gyms, ids);
  if (r.error) return X.toast(r.error, true);
  // eigene Maschinen ohne eigenes Foto: erstes Bild verkleinert mitgeben (1.138.0, wie PC 1.0.209)
  const byId = new Map(S.catalog.machines.map((m) => [m.id, m]));
  for (const sm of r.bundle.machines) {
    const m = byId.get(sm.id);
    if (sm.photo || !m || !D.gymShare.needsPhoto({ id: m.id, origin: m.origin, hasOwnPhoto: Boolean(m.own_photo) }) || !hasImage(m.id)) continue;
    try {
      sm.photo = await scaledPhoto(await imageUrl(m.id));
    } catch {
      // ohne Foto weiter
    }
  }
  const name = G.shareFileName();
  const blob = new Blob([JSON.stringify(r.bundle, null, 2)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });
  const what = ids.length === 1 ? "1 Gym" : `${ids.length} Gyms`;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return X.toast(`${what} weitergegeben.`);
    } catch (e) {
      if (e.name === "AbortError") return X.toast("Abgebrochen");
    }
  }
  const box = document.getElementById("gym-share-result");
  if (box) {
    box.innerHTML = `<p class="small">Die Datei mit ${what} ist bereit – zum Öffnen oder Sichern antippen:</p>
      <a class="btn blue block" href="${URL.createObjectURL(blob)}" download="${esc(name)}">${esc(name)}</a>`;
  }
}

// ------------------------------------------------------------------ Studio-Pakete (1.61.0)

/** Liste der Studio-Pakete (studios/index.json, wie pakete/index.json bei den Herstellerpaketen) einmal laden. */
async function loadStudioIndex() {
  const S = X.S;
  if (S.studioIndex !== undefined || S.studioIndexLoading) return;
  S.studioIndexLoading = true;
  try {
    const res = await fetch("studios/index.json", { cache: "no-cache" });
    if (!res.ok) throw new Error();
    S.studioIndex = (await res.json()).studios ?? [];
  } catch {
    S.studioIndex = [];
    S.studioIndexError = "Die Liste der Studio-Pakete ist gerade nicht erreichbar (offline?). Eine Paketdatei kannst du trotzdem wählen.";
  }
  S.studioIndexLoading = false;
  if (S.view === "training") X.rerender();
}

function packagesHtml(list) {
  const S = X.S;
  void loadStudioIndex();
  const installed = new Map(list.filter((g) => g.package_id).map((g) => [g.package_id, g]));
  const idx = S.studioIndex;
  return `<section class="card">
    <h3>Studio-Pakete</h3>
    <p class="card__note">Ein Studio mit seiner Maschinenliste und den Nummern im Studio auf einmal übernehmen. Deine Mitgliedsnummer, Fotos und Notizen bleiben unverändert; fehlende Maschinen werden genannt.</p>
    ${S.gymPkgReport ? `<p class="ok-note">${esc(S.gymPkgReport)}</p>` : ""}
    ${
      idx === undefined
        ? `<p class="muted small">Liste wird geladen …</p>`
        : idx.length
          ? `<ul class="vendor-list">${idx
              .map((p) => {
                const have = installed.get(p.id);
                return `<li><span><b>${esc(p.name)}</b><small class="muted">${p.address ? `${esc(p.address)} · ` : ""}${Number(p.machines ?? 0).toLocaleString("de-DE")} Maschinen · Stand ${esc(String(p.created ?? "").split("-").reverse().join("."))}${have ? " · installiert" : ""}</small></span>
                  <button class="btn sm" data-act="gym-pkg" data-arg="${esc(p.file)}" ${S.gymPkgBusy ? "disabled" : ""}>${have ? "Aktualisieren" : "Installieren"}</button></li>`;
              })
              .join("")}</ul>`
          : `<p class="muted small">${esc(S.studioIndexError ?? "Noch keine Studio-Pakete in der Liste.")}</p>`
    }
    <label class="btn block" for="gym-pkg-file">Paketdatei wählen …</label>
    <input id="gym-pkg-file" type="file" data-gym="package" hidden>
  </section>`;
}

async function installFromText(textValue) {
  const S = X.S;
  // Studio-Paket oder Gym-Datei mit mehreren Studios (1.137.0)
  const parsed = G.parseGymFile(textValue);
  if (parsed.error) {
    X.toast(parsed.error, true);
    return;
  }
  // fremde Maschinen (1.138.0, wie PC 1.0.209): erst prüfen lassen
  if (parsed.machines?.length) {
    const mine = S.catalog.machines
      .filter((m) => !m.archived)
      .map((m) => ({ id: m.id, manufacturer: m.manufacturer ?? "", series: m.series ?? "", name: m.name ?? m.display_name ?? "", displayName: m.display_name ?? "", articleNumber: m.article_number ?? null }));
    const numberOf = (studioId, machineId) => G.gymEntries(S.catalog, S.gyms, G.stableId(`gym:${studioId}`)).find((e) => e.machine_id === machineId)?.number ?? null;
    const bundle = { format: G.BUNDLE_FORMAT, version: 1, studios: parsed.pkgs, machines: parsed.machines };
    const items = D.gymShare.reviewItems(bundle, mine, S.gyms.aliases ?? {}, numberOf);
    if (items.length) {
      S.gymReview = { pkgs: parsed.pkgs, machines: parsed.machines, items };
      S.gymPkgReport = null;
      X.rerender();
      setTimeout(() => document.getElementById("gym-review")?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
      return;
    }
  }
  await finishInstall(parsed.pkgs, []);
}

/** Entscheidungen anwenden (neu anlegen bzw. zusammenführen), merken und die Gyms installieren. */
async function finishInstall(pkgs, items) {
  const S = X.S;
  if (items.length) {
    const muscles = new Set(D.muscleMapAll.MUSCLE_IDS);
    const opts = { uuid: X.uuid, now: new Date(), muscles };
    for (const it of items) {
      if (it.action === "new") TR.addSharedMachine(S.catalogRaw, S.train, it.machine, opts);
      else if (it.action === "map" && it.target) TR.fillFromShared(S.catalogRaw, S.train, it.target, it.machine, opts);
    }
    await X.store.set("train", S.train);
    X.refreshCatalog?.();
    G.rememberDecisions(S.gyms, D.gymShare.decisionsOf(items));
  }
  const reports = pkgs.map((pkg) => G.installPackage(S.catalog, S.gyms, pkg));
  await persist();
  S.gymReview = null;
  S.gymPkgReport = [...reports.map(G.describeInstall), D.gymShare.describeDecisions(items)].filter(Boolean).join(" ");
  X.toast(reports.length === 1 ? `„${reports[0].name}“ installiert` : `${reports.length} Gyms installiert`);
  X.rerender();
}

const reviewValue = (it) => (it.action === "map" ? `map:${it.target}` : it.action);

/** Prüfliste fremder Maschinen (1.138.0, wie PC 1.0.209). */
function reviewHtml() {
  const S = X.S;
  const r = S.gymReview;
  if (!r) return "";
  const byId = new Map(S.catalog.machines.map((m) => [m.id, m]));
  const n = r.items.length;
  return `<section class="card" id="gym-review">
    <h3>${n === 1 ? "1 neue Maschine" : `${n} neue Maschinen`} aus der Datei</h3>
    <p class="card__note">Diese Maschinen gibt es in deiner Maschinendatenbank noch nicht. „Zusammenführen“ ordnet sie einer ähnlichen eigenen Maschine zu – fehlender Muskelfokus und, ohne eigene Bilder, das Foto werden ergänzt. „Als neu übernehmen“ legt sie als eigene Maschine mit Muskelfokus und Foto an (geht mit den Trainingsdaten an den PC). „Weglassen“ übernimmt sie nicht. Deine Wahl gilt auch für spätere Dateien.</p>
    <div class="list">${r.items
      .map((it, i) => {
        const m = it.machine;
        const opts = [
          ...it.candidates.map((c) => {
            const own = byId.get(c.id);
            return [`map:${c.id}`, `Zusammenführen mit ${own ? `${own.display_name} (${own.manufacturer})` : c.id} – ${c.score} %`];
          }),
          ["new", "Als neue Maschine übernehmen"],
          ["skip", "Weglassen"],
        ];
        const sub = [m.manufacturer, it.number ? `Nr. ${it.number} in ${it.studio}` : it.studio].filter(Boolean).join(" · ") + (m.focus?.length ? " · mit Muskelfokus" : "");
        return `<div class="gym-review">
          ${m.photo ? `<img class="gym-review__img" src="${esc(m.photo)}" alt="">` : ""}
          <div class="gym-review__main"><b>${esc(m.displayName || m.name)}</b><span class="muted small">${esc(sub)}</span>${it.candidates[0] ? `<span class="muted small">Ähnlich: ${esc(it.candidates[0].reason)}</span>` : ""}
          <select data-gym="review" data-arg="${i}" aria-label="Übernehmen: ${esc(m.displayName || m.name)}">${opts
            .map(([v, label]) => `<option value="${esc(v)}" ${v === reviewValue(it) ? "selected" : ""}>${esc(label)}</option>`)
            .join("")}</select></div>
        </div>`;
      })
      .join("")}</div>
    <button class="btn block primary" data-act="gym-review-ok">Gym installieren</button>
    <button class="btn block" data-act="gym-review-cancel">Abbrechen</button>
  </section>`;
}

function detailHtml(g, active) {
  const S = X.S;
  const href = G.websiteHref(g.website);
  const byId = new Map(S.catalog.machines.map((m) => [m.id, m]));
  const rows = G.gymEntries(S.catalog, S.gyms, g.id)
    .map((e) => ({ e, m: byId.get(e.machine_id) }))
    .filter((r) => r.m && !r.m.archived)
    .sort((a, b) => G.numberCompare(a.e.number, b.e.number) || String(a.m.display_name).localeCompare(String(b.m.display_name), "de"));
  const inGym = new Set(rows.map((r) => r.m.id));
  const q = String(S.gymQuery ?? "").trim().toLowerCase();
  const hits = q.length >= 2
    ? S.catalog.machines
        .filter((m) => !m.archived && !inGym.has(m.id))
        .filter((m) => q.split(/\s+/).every((w) => `${m.display_name} ${m.manufacturer} ${m.series ?? ""} ${m.muscle_groups ?? ""}`.toLowerCase().includes(w)))
        .slice(0, 25)
    : [];
  const fact = (label, value) => `<p class="small"><span class="muted">${label}:</span> ${value}</p>`;
  const link = (text, url, external = false) =>
    url ? `<a href="${esc(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(text)}</a>` : esc(text);
  return `<section class="card">
    <div class="wo-head"><h3>${esc(g.name)}</h3><button class="linkbtn" data-act="gym-back">‹ Alle Gyms</button></div>
    <div class="gym-head">${photoHtml(g, "gym-photo gym-photo--large")}<div>
      ${g.address ? fact("Anschrift", esc(g.address)) : ""}
      ${g.contact ? fact("Kontakt", esc(g.contact)) : ""}
      ${g.phone ? fact("Telefon", link(g.phone, G.phoneHref(g.phone))) : ""}
      ${g.email ? fact("E-Mail", link(g.email, G.emailHref(g.email))) : ""}
      ${g.social ? fact("Social Media", link(g.social, G.socialHref(g.social), true)) : ""}
      ${g.member_number ? fact("Mitgliedsnummer", esc(g.member_number)) : ""}
      ${g.website ? fact("Website", href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(g.website)}</a>` : esc(g.website)) : ""}
    </div></div>
    <div class="row-actions">
      ${g.id !== active ? `<button class="btn sm primary" data-act="gym-activate" data-arg="${esc(g.id)}">Aktiv setzen</button>` : '<span class="tag">Aktiv</span>'}
      <button class="btn sm" data-act="gym-edit" data-arg="${esc(g.id)}">Bearbeiten</button>
      ${g.package_id === G.REFERENCE_PACKAGE ? "" : `<button class="btn sm ghost danger" data-act="gym-delete" data-arg="${esc(g.id)}">Löschen</button>`}
    </div>
  </section>
  ${accessHtml(g)}
  <section class="card">
    <div class="wo-head"><h3>Maschinen (${rows.length})</h3></div>
    <div class="field"><label for="gym-q">Maschine hinzufügen</label>
      <input id="gym-q" type="search" data-gym="query" placeholder="Name, Hersteller, Muskel …" value="${esc(S.gymQuery ?? "")}" autocomplete="off"></div>
    <div class="list" id="gym-hits">${hitsHtml(hits)}</div>
    ${
      rows.length
        ? `<div class="gym-rows">${rows
            .map(
              ({ e, m }) => `<div class="gym-row">
            <input class="gym-row__no" aria-label="Nummer ${esc(m.display_name)}" data-gym="number" data-arg="${esc(m.id)}" value="${esc(e.number ?? "")}" maxlength="40" placeholder="Nr.">
            <span class="gym-row__name"><b>${esc(m.display_name)}</b><span class="muted small">${esc([m.manufacturer, m.series].filter(Boolean).join(" · "))}</span>
              <input aria-label="Notiz ${esc(m.display_name)}" data-gym="note" data-arg="${esc(m.id)}" value="${esc(e.note ?? "")}" maxlength="500" placeholder="Notiz, z. B. OG hinten links"></span>
            <span class="gym-row__img">${thumbButton(m.id, m.display_name)}</span>
            <button class="linkbtn" data-act="gym-remove" data-arg="${esc(m.id)}" aria-label="${esc(m.display_name)} aus dem Gym nehmen">✕</button>
          </div>`,
            )
            .join("")}</div>`
        : `<p class="empty">Noch keine Maschinen – oben suchen und antippen.</p>`
    }
  </section>`;
}

/** Karte „Zutrittscode“ (1.78.0): Bild des Barcodes bzw. QR-Codes, antippen vergrößert.
 *  Seit 1.82.0 Vorder- und Rückseite: angezeigt wird die Vorderseite, Antippen dreht die Karte um;
 *  „Vergrößern“ zeigt die sichtbare Seite (mit „Umdrehen“). */
function accessHtml(g) {
  const err = X.S.gymCodeError;
  const { front, back } = G.accessCodeImages(g);
  const flipped = Boolean(back && X.S.gymCodeFlip === g.id);
  const sideHtml = (side, label, stored) => `<div class="gym-code__side">
      <b>${label}</b>
      <div class="row-actions">
        <label class="btn sm" for="gym-code-cam-${side}">Kamera</label>
        <input id="gym-code-cam-${side}" type="file" accept="image/*" capture="environment" data-gym="code" data-side="${side}" hidden>
        <label class="btn sm" for="gym-code-pick-${side}">${stored ? "Anderes Bild" : "Bild wählen"}</label>
        <input id="gym-code-pick-${side}" type="file" accept="image/*" data-gym="code" data-side="${side}" hidden>
        ${stored ? `<button class="btn sm" data-act="gym-code-crop" data-arg="${esc(g.id)}" data-side="${side}">Ausschnitt</button>` : ""}
        ${stored ? `<button class="btn sm ghost danger" data-act="gym-code-remove" data-arg="${esc(g.id)}" data-side="${side}">Entfernen</button>` : ""}
      </div>
    </div>`;
  return `<section class="card gym-code">
    <div class="wo-head"><h3>Zutrittscode</h3></div>
    ${
      front
        ? `<button class="gym-code__card${flipped ? " is-flipped" : ""}" data-act="${back ? "gym-code-flip" : "gym-code-zoom"}" data-arg="${esc(g.id)}" aria-label="${back ? (flipped ? "Karte umdrehen – Vorderseite zeigen" : "Karte umdrehen – Rückseite zeigen") : "Zutrittscode vergrößern"}">
            <span class="gym-code__inner">
              <span class="gym-code__face"><img src="${esc(front)}" alt="Zutrittscode ${esc(g.name)}"></span>
              ${back ? `<span class="gym-code__face gym-code__face--back"><img src="${esc(back)}" alt="Zutrittscode ${esc(g.name)}, Rückseite"></span>` : ""}
            </span>
          </button>
          <div class="gym-code__hint"><span class="muted small">${back ? `${flipped ? "Rückseite" : "Vorderseite"} – antippen dreht die Karte um.` : "Antippen vergrößert den Code."}</span>
            ${back ? `<button class="btn sm" data-act="gym-code-zoom" data-arg="${esc(g.id)}">Vergrößern</button>` : ""}</div>`
        : `<p class="muted small">Noch kein Zutrittscode. Fotografiere deine Mitgliedskarte bzw. den Barcode oder QR-Code oder wähle einen Screenshot aus der Studio-App – auf Wunsch Vorder- und Rückseite.</p>`
    }
    <div class="gym-code__sides">
      ${sideHtml("front", "Vorderseite", g.access_code)}
      ${sideHtml("back", "Rückseite", g.access_code_back)}
    </div>
    ${err ? `<p class="warn small">${esc(err)}</p>` : ""}
    <p class="muted small card-info">Vorderseite z. B. die Mitgliedskarte, Rückseite der Barcode – oder nur ein Bild. Vor dem Speichern wählst du den Ausschnitt (ganzes Bild, Barcode, Karte oder QR-Code). Die Bilder werden verkleinert gespeichert (längste Seite 1.600 px) und gehen mit „An den PC senden“ an den PC – nie in Studio-Pakete. Im Training öffnest du sie mit „Zutrittscode“ neben der Gym-Auswahl. Am Eingang: vergrößern und die Bildschirmhelligkeit hochdrehen.</p>
  </section>`;
}

const SIDE_LABEL = { front: "Vorderseite", back: "Rückseite" };

/** Ausschnitt wählen (neue Datei oder das gespeicherte Bild) und als Vorder- bzw. Rückseite speichern. */
async function cropAccessCode(gymId, source, side = "front") {
  const S = X.S;
  let data;
  try {
    data = await cropPhoto(source, {
      title: `Ausschnitt für den Zutrittscode – ${SIDE_LABEL[side] ?? "Vorderseite"}`,
      frames: G.ACCESS_CODE_FRAMES,
      hint: "Am besten den Code mit etwas weißem Rand.",
      maxSide: G.ACCESS_CODE_MAX_SIDE,
      maxChars: G.MAX_ACCESS_CODE_CHARS,
    });
  } catch {
    S.gymCodeError = "Das Bild konnte nicht gelesen werden.";
    return X.rerender();
  }
  if (!data) return;
  if (data.length > G.MAX_ACCESS_CODE_CHARS) {
    S.gymCodeError = "Das Bild ist zu groß – bitte einen engeren Ausschnitt wählen.";
    return X.rerender();
  }
  await storeAccessCode(gymId, data, side);
}

async function storeAccessCode(gymId, dataUrl, side = "front") {
  const S = X.S;
  const r = G.setAccessCode(S.catalog, S.gyms, gymId, dataUrl, X.uuid, new Date(), side);
  if (r.errors) {
    S.gymCodeError = Object.values(r.errors)[0];
    return X.rerender();
  }
  S.gymCodeError = null;
  if (side === "back" && !dataUrl) S.gymCodeFlip = null;
  await persist();
  X.toast(dataUrl ? `${SIDE_LABEL[side]} gespeichert.` : `${SIDE_LABEL[side]} entfernt.`);
  X.rerender();
}

/** Zutrittscode vergrößert zeigen (mit „Umdrehen“, wenn es eine Rückseite gibt). */
function zoomAccessCode(g, startBack = false) {
  const { front, back } = G.accessCodeImages(g);
  if (front) openImageZoom(front, `Zutrittscode ${g.name}`, undefined, { back, startBack });
  return Boolean(front);
}

function hitsHtml(hits) {
  return hits
    .map(
      (m) => `<button class="item" data-act="gym-add" data-arg="${esc(m.id)}">${thumbButton(m.id, m.display_name, { inner: true })}<span class="main"><b>${esc(m.display_name)}</b>
        <span class="muted small">${esc([m.manufacturer, m.series].filter(Boolean).join(" · "))}</span></span><span class="chev">+</span></button>`,
    )
    .join("");
}

function editorHtml(d) {
  const err = X.S.gymErrors ?? {};
  const f = (key, label, extra = "") => `<div class="field"><label for="ge-${key}">${label}</label>
    <input id="ge-${key}" data-gymf="${key}" value="${esc(d[key] ?? "")}" ${extra}>${err[key] ? `<p class="warn small">${esc(err[key])}</p>` : ""}</div>`;
  return `<section class="card" ${autoAttrs("gym", d.id ? "edit" : "new")}>
    <div class="wo-head"><h3>${d.id ? "Gym bearbeiten" : "Neues Gym"}</h3></div>
    ${f("name", "Name", 'maxlength="120" required placeholder="z. B. John Reed Wien Mitte"')}
    ${f("address", "Anschrift", 'maxlength="300"')}
    ${f("contact", "Kontakt", 'maxlength="300" placeholder="Ansprechperson, Öffnungszeiten …"')}
    ${f("phone", "Telefon", 'maxlength="40" type="tel" inputmode="tel" placeholder="z. B. +43 1 234 56 78"')}
    ${f("email", "E-Mail", 'maxlength="200" type="email" inputmode="email" placeholder="z. B. info@studio.at"')}
    ${f("social", "Social Media", 'maxlength="300" placeholder="z. B. instagram.com/studio oder @studio"')}
    ${f("member_number", "Mitgliedsnummer", 'maxlength="60"')}
    ${f("website", "Website", 'maxlength="300" inputmode="url" placeholder="z. B. dasgym.at"')}
    <div class="gym-head">${photoHtml(d, "gym-photo gym-photo--large")}<div>
      <label class="btn sm" for="ge-photo">${d.photo ? "Anderes Foto" : "Foto aufnehmen oder wählen"}</label>
      <input id="ge-photo" type="file" accept="image/*" data-gym="photo" data-autosave-skip hidden>
      ${d.photo ? '<button class="linkbtn" data-act="gym-photo-crop">Ausschnitt ändern</button> <button class="linkbtn" data-act="gym-photo-remove" data-autosave-click>Foto entfernen</button>' : ""}
      <p class="muted small">Du wählst den Ausschnitt; das Bild wird verkleinert gespeichert.</p>
      ${err.photo ? `<p class="warn small">${esc(err.photo)}</p>` : ""}
    </div></div>
    ${autoSaveHtml("gym-save", { mode: d.id ? "edit" : "new", note: d.id ? "Änderungen werden automatisch gespeichert." : "Wird automatisch gespeichert, sobald ein Name eingetragen ist." })}
    <div class="row-actions">
      <button class="btn" data-act="gym-cancel">${d.id ? "Fertig" : "Abbrechen"}</button>
    </div>
  </section>`;
}

/** Ausschnitt wählen (Datei oder vorhandenes Foto) und ins Formular übernehmen. */
async function choosePhoto(source) {
  const S = X.S;
  try {
    const url = await cropPhoto(source, { title: "Ausschnitt für das Gym-Foto" });
    if (!url || !S.gymEdit) return;
    S.gymEdit.photo = url;
    autosaveNow("gym");
    S.gymErrors = { ...(S.gymErrors ?? {}), photo: undefined };
    X.rerender();
  } catch {
    X.toast("Das Bild konnte nicht gelesen werden.", true);
  }
}

const toDraft = (g) => ({
  id: g?.id ?? null,
  name: g?.name ?? "",
  address: g?.address ?? "",
  contact: g?.contact ?? "",
  phone: g?.phone ?? "",
  email: g?.email ?? "",
  social: g?.social ?? "",
  member_number: g?.member_number ?? "",
  website: g?.website ?? "",
  photo: g?.photo ?? null,
  // Zutrittscode (1.78.0): bleibt beim Bearbeiten erhalten, geändert wird er in seiner Karte
  access_code: g?.access_code ?? null,
  // Rückseite (1.82.0): bleibt beim Bearbeiten ebenfalls erhalten
  access_code_back: g?.access_code_back ?? null,
});

export const gymsActions = {
  "gym-share": () => void shareGyms(),
  "gym-review-ok": async () => {
    const r = X.S.gymReview;
    if (!r) return;
    try {
      await finishInstall(r.pkgs, r.items);
    } catch (e) {
      X.toast(e.message || "Installieren ging nicht.", true);
    }
  },
  "gym-review-cancel": () => {
    X.S.gymReview = null;
    X.rerender();
  },
  "gym-pkg": async (el) => {
    const S = X.S;
    const file = el.dataset.arg;
    if (!/^[a-z0-9-]+\.json$/.test(file ?? "")) return;
    S.gymPkgBusy = true;
    X.rerender();
    try {
      const res = await fetch(`studios/${file}`, { cache: "no-cache" });
      if (!res.ok) throw new Error();
      await installFromText(await res.text());
    } catch {
      X.toast("Das Studio-Paket konnte nicht geladen werden (offline?).", true);
    } finally {
      S.gymPkgBusy = false;
      X.rerender();
    }
  },
  "gym-new": () => {
    X.S.gymEdit = toDraft(null);
    X.S.gymErrors = {};
    X.rerender();
  },
  "gym-open": (el) => {
    X.S.gymSel = el.dataset.arg;
    X.S.gymQuery = "";
    X.S.gymCodeError = null;
    X.rerender();
  },
  "gym-back": () => {
    X.S.gymSel = null;
    X.rerender();
  },
  "gym-edit": (el) => {
    const g = G.gymList(X.S.catalog, X.S.gyms).find((x) => x.id === el.dataset.arg);
    X.S.gymEdit = toDraft(g);
    X.S.gymErrors = {};
    X.rerender();
  },
  "gym-cancel": () => {
    X.S.gymEdit = null;
    X.rerender();
  },
  "gym-photo-crop": () => {
    if (X.S.gymEdit?.photo) void choosePhoto(X.S.gymEdit.photo);
  },
  "gym-photo-remove": () => {
    X.S.gymEdit.photo = null;
    X.rerender();
  },
  "gym-save": async () => {
    const S = X.S;
    const r = G.saveGym(S.catalog, S.gyms, S.gymEdit, X.uuid);
    if (r.errors) {
      S.gymErrors = r.errors;
      return X.rerender();
    }
    await persist();
    // Sofort speichern (1.131.0): Editor bleibt offen und bearbeitet das gespeicherte Gym
    S.gymEdit = S.autosaving ? { ...S.gymEdit, id: r.row.id } : null;
    S.gymErrors = null;
    S.gymSel = r.row.id;
    X.toast(`„${r.row.name}“ gespeichert.`);
    X.rerender();
  },
  "gym-delete": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: löschen")) return;
    const r = G.removeGym(X.S.catalog, X.S.gyms, el.dataset.arg);
    if (r.error) return X.toast(r.error, true);
    await persist();
    X.S.gymSel = null;
    X.toast("Gym gelöscht.");
    X.rerender();
  },
  "gym-activate": async (el) => {
    X.S.gyms.active = el.dataset.arg;
    await persist();
    X.rerender();
  },
  "gym-add": async (el) => {
    const S = X.S;
    G.addMachines(S.catalog, S.gyms, S.gymSel, [el.dataset.arg], X.uuid);
    await persist();
    S.gymQuery = "";
    X.rerender();
  },
  "gym-remove": async (el) => {
    G.removeMachine(X.S.catalog, X.S.gyms, X.S.gymSel, el.dataset.arg);
    await persist();
    X.rerender();
  },
  "gym-code-zoom": (el) => {
    const g = G.gymList(X.S.catalog, X.S.gyms).find((x) => x.id === el.dataset.arg);
    if (g) zoomAccessCode(g, X.S.gymCodeFlip === g.id);
  },
  "gym-code-flip": (el) => {
    X.S.gymCodeFlip = X.S.gymCodeFlip === el.dataset.arg ? null : el.dataset.arg;
    // ohne Neuzeichnen, damit die Drehung sichtbar abläuft
    el.classList.toggle("is-flipped", X.S.gymCodeFlip === el.dataset.arg);
    const on = X.S.gymCodeFlip === el.dataset.arg;
    el.setAttribute("aria-label", on ? "Karte umdrehen – Vorderseite zeigen" : "Karte umdrehen – Rückseite zeigen");
    const hint = el.parentElement?.querySelector(".gym-code__hint .muted");
    if (hint) hint.textContent = `${on ? "Rückseite" : "Vorderseite"} – antippen dreht die Karte um.`;
  },
  "gym-code-crop": async (el) => {
    const g = G.gymList(X.S.catalog, X.S.gyms).find((x) => x.id === el.dataset.arg);
    const side = el.dataset.side === "back" ? "back" : "front";
    const img = side === "back" ? g?.access_code_back : g?.access_code;
    if (img) await cropAccessCode(g.id, img, side);
  },
  // Training (1.80.0): Code des in der Auswahl gewählten Gyms zeigen
  "gym-code-show": (el) => {
    const id = document.getElementById(el.dataset.arg)?.value ?? "";
    const g = G.gymList(X.S.catalog, X.S.gyms).find((x) => x.id === id);
    if (g && zoomAccessCode(g)) return;
    X.toast(g ? `Für „${g.name}“ ist kein Zutrittscode hinterlegt (Training → Meine Gyms).` : "Kein Gym gewählt.", true);
  },
  "gym-code-remove": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: entfernen")) return;
    await storeAccessCode(el.dataset.arg, null, el.dataset.side === "back" ? "back" : "front");
  },
  "gym-all": () => {
    X.S.gymAll = !X.S.gymAll;
    X.rerender();
  },
};

/** Eingaben (Suche, Formularfelder). true = behandelt. */
export function gymsInput(el) {
  const S = X.S;
  if (el.dataset?.gymf && S.gymEdit) {
    S.gymEdit[el.dataset.gymf] = el.value;
    return true;
  }
  if (el.dataset?.gym === "query") {
    S.gymQuery = el.value;
    const byId = new Set(G.gymEntries(S.catalog, S.gyms, S.gymSel).map((e) => e.machine_id));
    const q = el.value.trim().toLowerCase();
    const hits = q.length >= 2
      ? S.catalog.machines
          .filter((m) => !m.archived && !byId.has(m.id))
          .filter((m) => q.split(/\s+/).every((w) => `${m.display_name} ${m.manufacturer} ${m.series ?? ""} ${m.muscle_groups ?? ""}`.toLowerCase().includes(w)))
          .slice(0, 25)
      : [];
    const box = document.getElementById("gym-hits");
    if (box) box.innerHTML = hitsHtml(hits);
    return true;
  }
  return false;
}

/** Änderungen (Auswahl, Nummer/Notiz beim Verlassen, Foto). true = behandelt. */
export function gymsChange(el) {
  const S = X.S;
  const kind = el.dataset?.gym;
  if (!kind || kind === "query") return false;
  if (kind === "active") {
    S.gyms.active = el.value;
    // Auswahl von Hand gilt heute vor dem meistgenutzten Gym (1.117.0)
    S.gyms.choiceDate = appDay();
    void persist().then(() => X.rerender());
    return true;
  }
  if (kind === "review") {
    const it = S.gymReview?.items?.[Number(el.dataset.arg)];
    if (!it) return true;
    if (el.value.startsWith("map:")) {
      it.action = "map";
      it.target = el.value.slice(4);
    } else {
      it.action = el.value;
      it.target = null;
    }
    return true;
  }
  if (kind === "share") {
    const list = G.gymList(S.catalog, S.gyms);
    const picked = shareSelection(list);
    if (el.checked) picked.add(el.value);
    else picked.delete(el.value);
    S.gymShare = [...picked];
    X.rerender();
    return true;
  }
  if (kind === "package") {
    const file = el.files?.[0];
    el.value = "";
    if (file) file.text().then(installFromText).catch(() => X.toast("Die Datei konnte nicht gelesen werden.", true));
    return true;
  }
  if (kind === "code") {
    const file = el.files?.[0];
    el.value = "";
    const gymId = S.gymSel;
    if (!file || !gymId) return true;
    if (!file.type.startsWith("image/")) {
      S.gymCodeError = "Bitte ein Bild wählen (Foto oder Screenshot des Codes).";
      X.rerender();
      return true;
    }
    S.gymCodeError = null;
    void cropAccessCode(gymId, file, el.dataset.side === "back" ? "back" : "front");
    return true;
  }
  if (kind === "photo") {
    const file = el.files?.[0];
    el.value = "";
    if (!file || !S.gymEdit) return true;
    void choosePhoto(file);
    return true;
  }
  if (kind === "number" || kind === "note") {
    const mid = el.dataset.arg;
    const e = G.gymEntries(S.catalog, S.gyms, S.gymSel).find((x) => x.machine_id === mid);
    const number = kind === "number" ? el.value : e?.number;
    const note = kind === "note" ? el.value : e?.note;
    if ((number ?? "") === (e?.number ?? "") && (note ?? "") === (e?.note ?? "")) return true;
    const r = G.setEntry(S.catalog, S.gyms, S.gymSel, mid, number, note, X.uuid);
    if (r.error) {
      X.toast(r.error, true);
      el.value = kind === "number" ? e?.number ?? "" : e?.note ?? "";
      return true;
    }
    void persist();
    return true;
  }
  return false;
}
