// LIFESPAN OS Mobil – Maschinenbilder (1.67.0): je Hersteller ein Bilderpaket von der Website (app/bilder/,
// erzeugt am PC mit scripts/tools/handy/bilderpakete-erzeugen.cmd) oder als Datei. Je Maschine ein Bild
// (Hauptbild, lange Seite 800 px, JPEG). Die Bilder liegen in einer eigenen IndexedDB („lifespan-bilder“) –
// getrennt von den Daten der Konten, gelten für alle Konten und gehen nie an den PC zurück.
//
// Anzeige: `thumb(id)` setzt einen Platzhalter `<img data-mimg="id">`, `hydrate(root)` füllt ihn (läuft nach
// jedem Zeichnen über einen MutationObserver in app.js). Das Wissen, welche Maschinen ein Bild haben, liegt
// im Speicher (`ids`), damit Listen ohne Flackern nur dort einen Platz reservieren.

import * as GD from "./gymsdata.js";

export const PACKAGE_FORMAT = "lifespan-os-bilderpaket";
export const INDEX_FORMAT = "lifespan-os-bilderpaketliste";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const DB_NAME = "lifespan-bilder";
const IMAGES = "images";
const PACKAGES = "packages";

let X = null; // { S, esc, header, toast, rerender, go, confirmTwice, store }
let ids = null; // Set der Maschinen-IDs mit Bild (null = noch nicht geladen)
const urls = new Map(); // Maschinen-ID → Objekt-URL
let dbPromise = null;
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// ------------------------------------------------------------------ reine Regeln (getestet)

/** Inhalt einer Paketdatei prüfen; wirft mit deutscher Meldung. */
export function parsePackage(text) {
  let d;
  try {
    d = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    throw new Error("Die Datei ist kein Bilderpaket (kein gültiges JSON).");
  }
  if (!d || d.format !== PACKAGE_FORMAT) throw new Error("Die Datei ist kein Bilderpaket von LIFESPAN OS.");
  const p = d.package ?? {};
  if (!p.key || !p.version) throw new Error("Im Bilderpaket fehlen Name oder Stand.");
  const images = (Array.isArray(d.images) ? d.images : []).filter(
    (x) => x && typeof x.machine === "string" && x.machine && typeof x.data === "string" && x.data && /^image\/(jpeg|png|webp)$/.test(x.type ?? ""),
  );
  return {
    package: {
      key: String(p.key),
      manufacturer: String(p.manufacturer ?? p.folder ?? p.key),
      folder: String(p.folder ?? ""),
      version: String(p.version),
      part: Number(p.part) || 1,
      parts: Number(p.parts) || 1,
      images: Number(p.images) || images.length,
    },
    images,
  };
}

/** Liste von der Website prüfen. */
export function parseIndex(d) {
  if (!d || d.format !== INDEX_FORMAT || !Array.isArray(d.packages)) throw new Error("Die Liste der Bilderpakete ist ungültig.");
  return d.packages
    .filter((p) => p && p.key && Array.isArray(p.files) && p.files.length)
    .map((p) => ({
      key: String(p.key),
      manufacturer: String(p.manufacturer ?? p.folder ?? p.key),
      folder: String(p.folder ?? ""),
      version: String(p.version ?? ""),
      images: Number(p.images) || 0,
      bytes: Number(p.bytes) || 0,
      files: p.files.map(String).filter((f) => /^[\w.-]+\.json$/.test(f)),
    }));
}

/** Zustand eines Pakets der Liste gegenüber dem installierten: none | partial | old | current. */
export function packageState(entry, installed) {
  if (!installed) return "none";
  if ((installed.partsDone?.length ?? 0) < (installed.parts ?? 1)) return "partial";
  return installed.version === entry.version ? "current" : "old";
}

/** Hersteller-Ordner der Maschinen in den eigenen Gyms (für „Für meine Gyms laden“). */
export function gymFolders(catalog, local) {
  const byId = new Map((catalog?.machines ?? []).map((m) => [m.id, m]));
  const folders = new Set();
  for (const g of GD.gymList(catalog, local)) {
    for (const e of GD.gymEntries(catalog, local, g.id)) {
      const f = byId.get(e.machine_id)?.folder;
      if (f) folders.add(f);
    }
  }
  return folders;
}

/** Base64 → Bytes. */
export function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;

// ------------------------------------------------------------------ Speicher

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const os = db.createObjectStore(IMAGES);
        os.createIndex("pkg", "pkg");
        db.createObjectStore(PACKAGES, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Speichern abgebrochen (Speicher voll?)."));
  });

const result = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function installedPackages() {
  try {
    const db = await open();
    return (await result(db.transaction(PACKAGES).objectStore(PACKAGES).getAll())) ?? [];
  } catch {
    return [];
  }
}

/** Ein Teil eines Pakets speichern (ersetzt die Bilder dieses Pakets beim ersten Teil einer neuen Version). */
export async function storePart(parsed) {
  const db = await open();
  const p = parsed.package;
  const old = await result(db.transaction(PACKAGES).objectStore(PACKAGES).get(p.key));
  const fresh = !old || old.version !== p.version;
  if (fresh && old) await removeImages(db, p.key);
  const tx = db.transaction([IMAGES, PACKAGES], "readwrite");
  const os = tx.objectStore(IMAGES);
  for (const im of parsed.images) {
    os.put({ pkg: p.key, type: im.type, w: im.w ?? null, h: im.h ?? null, blob: new Blob([decodeBase64(im.data)], { type: im.type }) }, im.machine);
  }
  const partsDone = [...new Set([...(fresh ? [] : (old?.partsDone ?? [])), p.part])].sort((a, b) => a - b);
  const count = (fresh ? 0 : (old?.count ?? 0)) + parsed.images.length;
  tx.objectStore(PACKAGES).put({
    key: p.key,
    manufacturer: p.manufacturer,
    folder: p.folder,
    version: p.version,
    parts: p.parts,
    partsDone,
    count,
    installedAt: new Date().toISOString(),
  });
  await done(tx);
  for (const im of parsed.images) {
    ids?.add(im.machine);
    const u = urls.get(im.machine);
    if (u) URL.revokeObjectURL(u);
    urls.delete(im.machine);
  }
}

async function removeImages(db, key) {
  const keys = await result(db.transaction(IMAGES).objectStore(IMAGES).index("pkg").getAllKeys(key));
  const tx = db.transaction(IMAGES, "readwrite");
  const os = tx.objectStore(IMAGES);
  for (const k of keys) os.delete(k);
  await done(tx);
  for (const k of keys) {
    ids?.delete(k);
    const u = urls.get(k);
    if (u) URL.revokeObjectURL(u);
    urls.delete(k);
  }
}

export async function removePackage(key) {
  const db = await open();
  await removeImages(db, key);
  const tx = db.transaction(PACKAGES, "readwrite");
  tx.objectStore(PACKAGES).delete(key);
  await done(tx);
}

/** Welche Maschinen ein Bild haben, einmal laden; danach `onReady` (neu zeichnen). */
export async function loadIds(onReady) {
  try {
    const db = await open();
    ids = new Set(await result(db.transaction(IMAGES).objectStore(IMAGES).getAllKeys()));
  } catch {
    ids = new Set();
  }
  if (ids.size) onReady?.();
}

export const has = (id) => Boolean(id && ids?.has(id));
export const imageCount = () => ids?.size ?? 0;

/** Objekt-URL des Bilds einer Maschine (oder null). */
export async function imageUrl(id) {
  if (!has(id)) return null;
  if (urls.has(id)) return urls.get(id);
  try {
    const db = await open();
    const row = await result(db.transaction(IMAGES).objectStore(IMAGES).get(id));
    if (!row?.blob) return null;
    const u = URL.createObjectURL(row.blob);
    urls.set(id, u);
    return u;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Anzeige

const escAttr = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Platzhalter für das Bild einer Maschine (leer, wenn es keins gibt). */
export function thumb(id, cls = "mthumb") {
  return has(id) ? `<img class="${cls}" data-mimg="${escAttr(id)}" alt="" decoding="async">` : "";
}

/** Platzhalter in `root` mit dem Bild füllen. */
export function hydrate(root) {
  if (!ids?.size) return;
  for (const el of root.querySelectorAll("img[data-mimg]:not([src])")) {
    const id = el.dataset.mimg;
    el.setAttribute("src", BLANK); // nicht doppelt laden
    imageUrl(id).then((u) => {
      if (u) el.src = u;
      else el.remove();
    });
  }
}

/** Bild in Bildschirmgröße; Antippen schließt (auch für eigene Fotos und Sportbilder). */
export function openLightbox(src, caption) {
  const box = document.createElement("div");
  box.className = "lightbox";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", caption || "Bild");
  box.innerHTML = `<button class="lightbox__close" aria-label="Bild schließen">✕</button><figure class="lightbox__figure"><img class="lightbox__img" alt="${escAttr(caption)}"><figcaption class="lightbox__caption">${escAttr(caption)}</figcaption></figure>`;
  box.querySelector("img").src = src;
  const close = () => {
    box.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  box.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(box);
  box.querySelector(".lightbox__close").focus();
}

/** Großansicht des Maschinenbilds (Paketbild). */
export async function showMachine(id, caption) {
  const u = await imageUrl(id);
  if (u) openLightbox(u, caption);
}

// ------------------------------------------------------------------ Ansicht Import/Export → Maschinenbilder

export function initMachineImages(ctx) {
  X = ctx;
}

const esc = (v) => X.esc(v);
const n = (v) => Number(v ?? 0).toLocaleString("de-DE");

async function loadIndex() {
  const S = X.S;
  if (S.mimgIndex || S.mimgIndexLoading) return;
  S.mimgIndexLoading = true;
  S.mimgIndexError = null;
  try {
    const res = await fetch("bilder/index.json", { cache: "no-cache" });
    if (!res.ok) throw new Error();
    S.mimgIndex = parseIndex(await res.json());
  } catch {
    S.mimgIndex = [];
    S.mimgIndexError = "Die Liste der Bilderpakete ist gerade nicht erreichbar (offline?). Eine Paketdatei kannst du trotzdem wählen.";
  }
  S.mimgIndexLoading = false;
  await refreshInstalled();
}

async function refreshInstalled() {
  const S = X.S;
  S.mimgInstalled = await installedPackages();
  try {
    S.mimgStorage = (await navigator.storage?.estimate?.()) ?? null;
  } catch {
    S.mimgStorage = null;
  }
  if (S.view === "mimages") X.rerender();
}

export function viewMachineImages() {
  const S = X.S;
  loadIndex();
  if (!S.mimgInstalled) refreshInstalled();
  const installed = new Map((S.mimgInstalled ?? []).map((p) => [p.key, p]));
  const list = S.mimgIndex ?? null;
  const gymSet = gymFolders(S.catalog, S.gyms);
  const gymPkgs = (list ?? []).filter((p) => gymSet.has(p.folder));
  const missing = (sel) => sel.filter((p) => packageState(p, installed.get(p.key)) !== "current");
  const sum = (sel) => sel.reduce((a, p) => a + p.bytes, 0);
  const busy = S.mimgBusy;
  const row = (p) => {
    const st = packageState(p, installed.get(p.key));
    const label = { none: "Laden", partial: "Fertig laden", old: "Aktualisieren", current: "" }[st];
    const inst = installed.get(p.key);
    return `<li><span><b>${esc(p.manufacturer)}</b>${p.folder && p.folder !== p.manufacturer ? `<small class="muted">Ordner ${esc(p.folder)}</small>` : ""}
      <small class="muted">${n(p.images)} Bilder · ${mb(p.bytes)} · Stand ${esc(p.version)}${st === "current" ? " · installiert" : st === "old" ? ` · installiert: ${esc(inst.version)}` : st === "partial" ? " · unvollständig" : ""}${gymSet.has(p.folder) ? " · in deinen Gyms" : ""}</small></span>
      <span class="mimg-actions">${label ? `<button class="btn sm" data-act="mimg-get" data-arg="${esc(p.key)}" ${busy ? "disabled" : ""}>${label}</button>` : ""}${inst ? `<button class="btn sm ghost" data-act="mimg-remove" data-arg="${esc(p.key)}" ${busy ? "disabled" : ""} aria-label="Bilder von ${esc(p.manufacturer)} entfernen">Entfernen</button>` : ""}</span></li>`;
  };
  const extra = [...installed.values()].filter((p) => !(list ?? []).some((x) => x.key === p.key));
  const st = S.mimgStorage;
  return `${X.header("Maschinenbilder", { back: "transfer" })}<main class="wrap">
    <section class="card">
      <h3>Bilder der Maschinen</h3>
      <p class="muted small">Je Hersteller ein Paket mit einem Bild pro Maschine – dieselben Bilder wie im Maschinen-Ordner am PC, fürs Handy verkleinert. Sie erscheinen in der Maschinensuche, im Training, im Verlauf und in der Datenbank; Antippen im Verlauf und in der Datenbank zeigt sie groß. Die Bilder bleiben auf diesem Gerät und gelten für alle Konten.</p>
      ${busy ? `<p class="notice" role="status">${esc(busy)}</p>` : ""}
      <p class="small">${n(imageCount())} Maschinen mit Bild auf diesem Gerät${st?.usage ? ` · belegter Speicher der App: ${mb(st.usage)}` : ""}</p>
      ${
        list === null
          ? `<p class="muted small">Liste wird geladen …</p>`
          : list.length
            ? `${gymPkgs.length && missing(gymPkgs).length ? `<button class="btn primary block" data-act="mimg-get-gyms" ${busy ? "disabled" : ""}>Für meine Gyms laden (${missing(gymPkgs).length} ${missing(gymPkgs).length === 1 ? "Paket" : "Pakete"}, ${mb(sum(missing(gymPkgs)))})</button>` : ""}
              ${missing(list).length ? `<button class="btn block" data-act="mimg-get-all" ${busy ? "disabled" : ""}>Alle laden (${missing(list).length} Pakete, ${mb(sum(missing(list)))})</button>` : `<p class="muted small">Alle Pakete sind installiert und aktuell.</p>`}`
            : `<p class="muted small">${esc(S.mimgIndexError ?? "Noch keine Bilderpakete in der Liste.")}</p>`
      }
    </section>
    ${list?.length ? `<section class="card"><h3>Pakete</h3><ul class="vendor-list mimg-list">${list.map(row).join("")}</ul></section>` : ""}
    ${
      extra.length
        ? `<section class="card"><h3>Weitere installierte Pakete</h3><ul class="vendor-list mimg-list">${extra
            .map(
              (p) => `<li><span><b>${esc(p.manufacturer)}</b><small class="muted">${n(p.count)} Bilder · Stand ${esc(p.version)}</small></span>
              <button class="btn sm ghost" data-act="mimg-remove" data-arg="${esc(p.key)}" ${busy ? "disabled" : ""}>Entfernen</button></li>`,
            )
            .join("")}</ul></section>`
        : ""
    }
    <section class="card">
      <h3>Paketdatei wählen</h3>
      <p class="muted small">Ein Bilderpaket, das du von der Website (Bilderpakete) geladen hast. Große Hersteller haben mehrere Teile – jeden Teil einmal wählen.</p>
      <label class="btn block" for="mimg-file">Paketdatei wählen …</label>
      <input id="mimg-file" type="file" accept=".json,application/json" hidden>
    </section>
  </main>`;
}

async function installFromIndex(entries) {
  const S = X.S;
  if (S.mimgBusy) return;
  const installed = new Map((S.mimgInstalled ?? []).map((p) => [p.key, p]));
  let ok = 0;
  try {
    await X.store.persist?.();
    for (const [i, p] of entries.entries()) {
      const inst = installed.get(p.key);
      const skip = inst && inst.version === p.version ? new Set(inst.partsDone ?? []) : new Set();
      for (const [j, file] of p.files.entries()) {
        if (skip.has(j + 1)) continue;
        S.mimgBusy = `Lädt ${p.manufacturer}${p.files.length > 1 ? ` (Teil ${j + 1} von ${p.files.length})` : ""} … ${entries.length > 1 ? `Paket ${i + 1} von ${entries.length}` : ""}`;
        X.rerender();
        const res = await fetch(`bilder/${encodeURIComponent(file)}`, { cache: "no-cache" });
        if (!res.ok) throw new Error(`${p.manufacturer}: Datei nicht erreichbar.`);
        await storePart(parsePackage(await res.text()));
      }
      ok++;
    }
    X.toast(entries.length === 1 ? `Bilder von ${entries[0].manufacturer} geladen.` : `${ok} Bilderpakete geladen.`);
  } catch (e) {
    X.toast(`${ok ? `${ok} Pakete geladen, dann abgebrochen: ` : ""}${e?.message || "Laden fehlgeschlagen (offline oder Speicher voll?)."}`, true);
  }
  S.mimgBusy = null;
  await refreshInstalled();
  X.rerender();
}

export const machineImageActions = {
  "mimg-open": () => X.go("mimages"),
  "mimg-get": (el) => {
    const p = (X.S.mimgIndex ?? []).find((x) => x.key === el.dataset.arg);
    if (p) installFromIndex([p]);
  },
  "mimg-get-gyms": () => {
    const S = X.S;
    const set = gymFolders(S.catalog, S.gyms);
    const installed = new Map((S.mimgInstalled ?? []).map((p) => [p.key, p]));
    installFromIndex((S.mimgIndex ?? []).filter((p) => set.has(p.folder) && packageState(p, installed.get(p.key)) !== "current"));
  },
  "mimg-get-all": () => {
    const S = X.S;
    const installed = new Map((S.mimgInstalled ?? []).map((p) => [p.key, p]));
    installFromIndex((S.mimgIndex ?? []).filter((p) => packageState(p, installed.get(p.key)) !== "current"));
  },
  "mimg-remove": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: entfernen")) return;
    await removePackage(el.dataset.arg);
    X.toast("Bilder entfernt.");
    await refreshInstalled();
    X.rerender();
  },
  /** Großansicht: data-arg = Maschinen-ID, data-caption = Beschriftung */
  "mimg-show": (el) => showMachine(el.dataset.arg, el.dataset.caption ?? ""),
};

/** Dateiauswahl; true = behandelt. */
export function machineImageChange(el) {
  if (el.id !== "mimg-file") return false;
  const f = el.files?.[0];
  el.value = "";
  if (!f) return true;
  if (f.size > MAX_FILE_BYTES) {
    X.toast("Die Datei ist zu groß für ein Bilderpaket.", true);
    return true;
  }
  (async () => {
    const S = X.S;
    try {
      S.mimgBusy = `Liest ${f.name} …`;
      X.rerender();
      const parsed = parsePackage(await f.text());
      await storePart(parsed);
      const p = parsed.package;
      X.toast(`${p.manufacturer}: ${n(parsed.images.length)} Bilder gespeichert${p.parts > 1 ? ` (Teil ${p.part} von ${p.parts})` : ""}.`);
    } catch (e) {
      X.toast(e?.message || "Die Datei konnte nicht gelesen werden.", true);
    }
    S.mimgBusy = null;
    await refreshInstalled();
  })();
  return true;
}
