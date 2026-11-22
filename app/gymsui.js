// LIFESPAN OS Mobil – Meine Gyms (1.60.0): Training → „Meine Gyms“, Gymauswahl vor „Freies Training“
// und die Maschinenauswahl im Training nur mit den Maschinen des aktiven Gyms (wie am PC 1.0.159).
// Logik in gymsdata.js; Änderungen gehen mit der Rückgabedatei an den PC.
// Seit 1.78.0 je Gym ein Zutrittscode (Foto mit der Kamera oder Screenshot), antippen vergrößert ihn.
// Seit 1.80.0 (wie PC 1.0.166): Ausschnitt wählen vor dem Speichern und Knopf „Zutrittscode“ im Training.
// Seit 1.82.0 (wie PC 1.0.168): Vorder- und Rückseite, Antippen dreht die Karte um.

import * as G from "./gymsdata.js";
import { cropPhoto } from "./photocrop.js";
import { thumbButton } from "./machineimages.js";
import { openImageZoom } from "./mapzoom.js";

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

/** Aktives Gym (ID) und seine Maschinenliste; im Training das Gym der Einheit (Handy 1.65.0). */
export function activeGym() {
  const S = X.S;
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
export function activeGymSelectHtml(blocked) {
  const S = X.S;
  const list = G.gymList(S.catalog, S.gyms);
  if (!list.length) return "";
  const id = G.activeGymId(S.catalog, S.gyms, pcActive());
  const count = (g) => G.gymEntries(S.catalog, S.gyms, g.id).length;
  return `<div class="field"><label for="w-gym">Gym</label>
    <div class="gym-pick"><select id="w-gym" data-gym="active" ${blocked ? "disabled" : ""}>${list
      .map((g) => `<option value="${esc(g.id)}" ${g.id === id ? "selected" : ""}>${esc(g.name)} (${count(g)} Maschinen)</option>`)
      .join("")}</select>${gymCodeButtonHtml(id, "w-gym")}</div></div>`;
}

/** ID des aktiven Gyms (für neue Einheiten). */
export function activeGymIdNow() {
  const S = X.S;
  return G.activeGymId(S.catalog, S.gyms, pcActive());
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
  ${packagesHtml(list)}`;
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
  const parsed = G.parsePackage(textValue);
  if (parsed.error) {
    X.toast(parsed.error, true);
    return;
  }
  const report = G.installPackage(S.catalog, S.gyms, parsed.pkg);
  await persist();
  S.gymPkgReport = G.describeInstall(report);
  X.toast(`„${report.name}“ installiert`);
  X.rerender();
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
  return `<section class="card">
    <div class="wo-head"><h3>${d.id ? "Gym bearbeiten" : "Neues Gym"}</h3></div>
    ${f("name", "Name", 'maxlength="120" placeholder="z. B. John Reed Wien Mitte"')}
    ${f("address", "Anschrift", 'maxlength="300"')}
    ${f("contact", "Kontakt", 'maxlength="300" placeholder="Ansprechperson, Öffnungszeiten …"')}
    ${f("phone", "Telefon", 'maxlength="40" type="tel" inputmode="tel" placeholder="z. B. +43 1 234 56 78"')}
    ${f("email", "E-Mail", 'maxlength="200" type="email" inputmode="email" placeholder="z. B. info@studio.at"')}
    ${f("social", "Social Media", 'maxlength="300" placeholder="z. B. instagram.com/studio oder @studio"')}
    ${f("member_number", "Mitgliedsnummer", 'maxlength="60"')}
    ${f("website", "Website", 'maxlength="300" inputmode="url" placeholder="z. B. dasgym.at"')}
    <div class="gym-head">${photoHtml(d, "gym-photo gym-photo--large")}<div>
      <label class="btn sm" for="ge-photo">${d.photo ? "Anderes Foto" : "Foto aufnehmen oder wählen"}</label>
      <input id="ge-photo" type="file" accept="image/*" data-gym="photo" hidden>
      ${d.photo ? '<button class="linkbtn" data-act="gym-photo-crop">Ausschnitt ändern</button> <button class="linkbtn" data-act="gym-photo-remove">Foto entfernen</button>' : ""}
      <p class="muted small">Du wählst den Ausschnitt; das Bild wird verkleinert gespeichert.</p>
      ${err.photo ? `<p class="warn small">${esc(err.photo)}</p>` : ""}
    </div></div>
    <div class="row-actions">
      <button class="btn primary" data-act="gym-save">Speichern</button>
      <button class="btn" data-act="gym-cancel">Abbrechen</button>
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
    S.gymEdit = null;
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
    void persist().then(() => X.rerender());
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
