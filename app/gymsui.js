// LIFESPAN OS Mobil – Meine Gyms (1.60.0): Training → „Meine Gyms“, Gymauswahl vor „Freies Training“
// und die Maschinenauswahl im Training nur mit den Maschinen des aktiven Gyms (wie am PC 1.0.159).
// Logik in gymsdata.js; Änderungen gehen mit der Rückgabedatei an den PC.

import * as G from "./gymsdata.js";

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

/** Aktives Gym (ID) und seine Maschinenliste. */
export function activeGym() {
  const S = X.S;
  const id = G.activeGymId(S.catalog, S.gyms, pcActive());
  const gym = G.gymList(S.catalog, S.gyms).find((g) => g.id === id) ?? null;
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

/** Auswahl „Gym“ vor „Freies Training“. */
export function activeGymSelectHtml(blocked) {
  const S = X.S;
  const list = G.gymList(S.catalog, S.gyms);
  if (!list.length) return "";
  const id = G.activeGymId(S.catalog, S.gyms, pcActive());
  const count = (g) => G.gymEntries(S.catalog, S.gyms, g.id).length;
  return `<div class="field"><label for="w-gym">Gym</label>
    <select id="w-gym" data-gym="active" ${blocked ? "disabled" : ""}>${list
      .map((g) => `<option value="${esc(g.id)}" ${g.id === id ? "selected" : ""}>${esc(g.name)} (${count(g)} Maschinen)</option>`)
      .join("")}</select></div>`;
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
    <p class="muted small">Im Training wählst du unter „Einheiten“ das Gym – dann stehen nur dessen Maschinen mit der Nummer im Studio zur Auswahl.</p>
    ${open ? `<p class="muted small">${open} ${open === 1 ? "Änderung" : "Änderungen"} noch nicht am PC · <button class="linkbtn" data-go="send">An den PC senden</button></p>` : ""}
    <div class="list">${list
      .map(
        (g) => `<button class="item gym-item" data-act="gym-open" data-arg="${esc(g.id)}">${photoHtml(g)}<span class="main"><b>${esc(g.name)}</b>
          <span class="muted small">${G.gymEntries(S.catalog, S.gyms, g.id).length} Maschinen${g.address ? ` · ${esc(g.address)}` : ""}</span>
          <span>${g.id === active ? '<span class="tag">Aktiv</span> ' : ""}${g.package_id === G.REFERENCE_PACKAGE ? '<span class="tag">Referenz</span>' : ""}</span></span><span class="chev">›</span></button>`,
      )
      .join("")}</div>
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
  return `<section class="card">
    <div class="wo-head"><h3>${esc(g.name)}</h3><button class="linkbtn" data-act="gym-back">‹ Alle Gyms</button></div>
    <div class="gym-head">${photoHtml(g, "gym-photo gym-photo--large")}<div>
      ${g.address ? fact("Anschrift", esc(g.address)) : ""}
      ${g.contact ? fact("Kontakt", esc(g.contact)) : ""}
      ${g.member_number ? fact("Mitgliedsnummer", esc(g.member_number)) : ""}
      ${g.website ? fact("Website", href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(g.website)}</a>` : esc(g.website)) : ""}
    </div></div>
    <div class="row-actions">
      ${g.id !== active ? `<button class="btn sm primary" data-act="gym-activate" data-arg="${esc(g.id)}">Aktiv setzen</button>` : '<span class="tag">Aktiv</span>'}
      <button class="btn sm" data-act="gym-edit" data-arg="${esc(g.id)}">Bearbeiten</button>
      ${g.package_id === G.REFERENCE_PACKAGE ? "" : `<button class="btn sm ghost danger" data-act="gym-delete" data-arg="${esc(g.id)}">Löschen</button>`}
    </div>
  </section>
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
            <button class="linkbtn" data-act="gym-remove" data-arg="${esc(m.id)}" aria-label="${esc(m.display_name)} aus dem Gym nehmen">✕</button>
          </div>`,
            )
            .join("")}</div>`
        : `<p class="empty">Noch keine Maschinen – oben suchen und antippen.</p>`
    }
  </section>`;
}

function hitsHtml(hits) {
  return hits
    .map(
      (m) => `<button class="item" data-act="gym-add" data-arg="${esc(m.id)}"><span class="main"><b>${esc(m.display_name)}</b>
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
    ${f("contact", "Kontakt", 'maxlength="300" placeholder="Telefon, E-Mail …"')}
    ${f("member_number", "Mitgliedsnummer", 'maxlength="60"')}
    ${f("website", "Website", 'maxlength="300" inputmode="url" placeholder="z. B. dasgym.at"')}
    <div class="gym-head">${photoHtml(d, "gym-photo gym-photo--large")}<div>
      <label class="btn sm" for="ge-photo">${d.photo ? "Anderes Foto" : "Foto aufnehmen oder wählen"}</label>
      <input id="ge-photo" type="file" accept="image/*" data-gym="photo" hidden>
      ${d.photo ? '<button class="linkbtn" data-act="gym-photo-remove">Foto entfernen</button>' : ""}
      ${err.photo ? `<p class="warn small">${esc(err.photo)}</p>` : ""}
    </div></div>
    <div class="row-actions">
      <button class="btn primary" data-act="gym-save">Speichern</button>
      <button class="btn" data-act="gym-cancel">Abbrechen</button>
    </div>
  </section>`;
}

/** Foto verkleinern (längste Seite 900 px, JPEG) wie am PC. */
async function fileToPhoto(file) {
  const bitmap = await createImageBitmap(file);
  let size = 900;
  let quality = 0.82;
  for (;;) {
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= 550000 || size <= 400) return url;
    size = Math.round(size * 0.8);
    quality = 0.72;
  }
}

const toDraft = (g) => ({
  id: g?.id ?? null,
  name: g?.name ?? "",
  address: g?.address ?? "",
  contact: g?.contact ?? "",
  member_number: g?.member_number ?? "",
  website: g?.website ?? "",
  photo: g?.photo ?? null,
});

export const gymsActions = {
  "gym-new": () => {
    X.S.gymEdit = toDraft(null);
    X.S.gymErrors = {};
    X.rerender();
  },
  "gym-open": (el) => {
    X.S.gymSel = el.dataset.arg;
    X.S.gymQuery = "";
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
  if (kind === "photo") {
    const file = el.files?.[0];
    if (!file || !S.gymEdit) return true;
    fileToPhoto(file)
      .then((url) => {
        S.gymEdit.photo = url;
        S.gymErrors = { ...(S.gymErrors ?? {}), photo: undefined };
        X.rerender();
      })
      .catch(() => X.toast("Das Bild konnte nicht gelesen werden.", true));
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
