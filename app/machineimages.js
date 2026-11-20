// LIFESPAN OS Mobil – Maschinenbilder (1.67.0; seit 1.68.0 ein Gesamtpaket „Maschinenbilder“ in Teilen mit allen
// Bildern jeder Maschine): von der Website (app/bilder/, erzeugt am PC mit scripts/tools/handy/bilderpakete-erzeugen.cmd)
// oder als Datei. Je Maschine alle Bilder in der Reihenfolge des PCs (eigenes Foto zuerst), lange Seite 800 px, JPEG.
// Die Bilder liegen in einer eigenen IndexedDB („lifespan-bilder“) – getrennt von den Daten der Konten, gelten für
// alle Konten und gehen nie an den PC zurück. Schlüssel: Maschinen-ID für das Hauptbild, „<ID>#<n>“ für weitere.
//
// Anzeige: `thumb(id)` setzt einen Platzhalter `<img data-mimg="id">` (Hauptbild), `hydrate(root)` füllt ihn (läuft
// nach jedem Zeichnen über einen MutationObserver in app.js). Wie viele Bilder eine Maschine hat, liegt im Speicher
// (`counts`), damit Listen ohne Flackern nur dort einen Platz reservieren. `showMachine` öffnet alle Bilder als Galerie.

export const PACKAGE_FORMAT = "lifespan-os-bilderpaket";
export const INDEX_FORMAT = "lifespan-os-bilderpaketliste";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const DB_NAME = "lifespan-bilder";
const IMAGES = "images";
const PACKAGES = "packages";

let X = null; // { S, esc, header, toast, rerender, go, confirmTwice, store }
let counts = null; // Maschinen-ID → Anzahl Bilder (null = noch nicht geladen)
const urls = new Map(); // Bild-Schlüssel → Objekt-URL
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
  const images = (Array.isArray(d.images) ? d.images : [])
    .filter(
      (x) =>
        x && typeof x.machine === "string" && x.machine && !x.machine.includes("#") && typeof x.data === "string" && x.data && /^image\/(jpeg|png|webp)$/.test(x.type ?? ""),
    )
    .map((x) => ({ ...x, i: Math.max(0, Math.floor(Number(x.i) || 0)) }));
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

/** Schlüssel eines Bilds: Hauptbild = Maschinen-ID, weitere = „<ID>#<n>“. */
export const imageKey = (machine, i = 0) => (i ? `${machine}#${i}` : machine);

/** Anzahl Bilder je Maschine aus den Schlüsseln. */
export function countKeys(keys) {
  const m = new Map();
  for (const k of keys) {
    const id = String(k).replace(/#\d+$/, "");
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
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
      // Version 2 (1.68.0): ein Gesamtpaket mit mehreren Bildern je Maschine – frühere Herstellerpakete werden verworfen
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of [IMAGES, PACKAGES]) if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
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
    os.put(
      { pkg: p.key, machine: im.machine, i: im.i, own: Boolean(im.own), type: im.type, w: im.w ?? null, h: im.h ?? null, blob: new Blob([decodeBase64(im.data)], { type: im.type }) },
      imageKey(im.machine, im.i),
    );
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
  await dropEmptyPackages(db, p.key);
  for (const im of parsed.images) forgetUrl(imageKey(im.machine, im.i));
  await refreshCounts(db);
}

function forgetUrl(key) {
  const u = urls.get(key);
  if (u) URL.revokeObjectURL(u);
  urls.delete(key);
}

async function refreshCounts(db) {
  counts = countKeys(await result(db.transaction(IMAGES).objectStore(IMAGES).getAllKeys()));
}

/** Pakete ohne eigene Bilder mehr (ihre Bilder gehören jetzt einem anderen Paket) aus der Liste nehmen. */
async function dropEmptyPackages(db, keep) {
  const metas = (await result(db.transaction(PACKAGES).objectStore(PACKAGES).getAll())) ?? [];
  for (const m of metas) {
    if (m.key === keep) continue;
    const n = await result(db.transaction(IMAGES).objectStore(IMAGES).index("pkg").count(m.key));
    if (!n) {
      const tx = db.transaction(PACKAGES, "readwrite");
      tx.objectStore(PACKAGES).delete(m.key);
      await done(tx);
    }
  }
}

async function removeImages(db, key) {
  const keys = await result(db.transaction(IMAGES).objectStore(IMAGES).index("pkg").getAllKeys(key));
  const tx = db.transaction(IMAGES, "readwrite");
  const os = tx.objectStore(IMAGES);
  for (const k of keys) os.delete(k);
  await done(tx);
  for (const k of keys) forgetUrl(k);
  await refreshCounts(db);
}

export async function removePackage(key) {
  const db = await open();
  await removeImages(db, key);
  const tx = db.transaction(PACKAGES, "readwrite");
  tx.objectStore(PACKAGES).delete(key);
  await done(tx);
}

/** Welche Maschinen Bilder haben, einmal laden; danach `onReady` (neu zeichnen). */
export async function loadIds(onReady) {
  try {
    await refreshCounts(await open());
  } catch {
    counts = new Map();
  }
  if (counts.size) onReady?.();
}

export const has = (id) => Boolean(id && counts?.has(id));
/** Anzahl Bilder einer Maschine. */
export const countOf = (id) => counts?.get(id) ?? 0;
/** Maschinen mit Bild. */
export const imageCount = () => counts?.size ?? 0;
/** Bilder insgesamt. */
export const totalImages = () => [...(counts?.values() ?? [])].reduce((a, b) => a + b, 0);

/** Objekt-URL des Bilds `i` einer Maschine (0 = Hauptbild) oder null. */
export async function imageUrl(id, i = 0) {
  if (!has(id)) return null;
  const key = imageKey(id, i);
  if (urls.has(key)) return urls.get(key);
  try {
    const db = await open();
    const row = await result(db.transaction(IMAGES).objectStore(IMAGES).get(key));
    if (!row?.blob) return null;
    const u = URL.createObjectURL(row.blob);
    urls.set(key, u);
    return u;
  } catch {
    return null;
  }
}

/** Alle Bilder einer Maschine (Objekt-URLs in Reihenfolge). */
async function machineUrls(id) {
  const db = await open();
  const keys = (await result(db.transaction(IMAGES).objectStore(IMAGES).getAllKeys(IDBKeyRange.bound(id, `${id}#\uffff`))))
    .filter((k) => k === id || /^#\d+$/.test(k.slice(id.length)))
    .sort((a, b) => Number(a.split("#")[1] ?? 0) - Number(b.split("#")[1] ?? 0));
  const out = [];
  for (const k of keys) {
    const [, n] = k.split("#");
    const u = await imageUrl(id, Number(n ?? 0));
    if (u) out.push(u);
  }
  return out;
}

// ------------------------------------------------------------------ Anzeige

const escAttr = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Platzhalter für das Bild einer Maschine (leer, wenn es keins gibt). */
export function thumb(id, cls = "mthumb") {
  return has(id) ? `<img class="${cls}" data-mimg="${escAttr(id)}" alt="" decoding="async">` : "";
}

/** Großes Bild einer Maschine mit Anzahl; Antippen öffnet die Galerie (leer, wenn es kein Bild gibt). */
export function photoButton(id, caption) {
  if (!has(id)) return "";
  const n = countOf(id);
  return `<button class="machine-photo" data-act="mimg-show" data-arg="${escAttr(id)}" data-caption="${escAttr(caption)}" aria-label="${escAttr(n > 1 ? `Alle ${n} Bilder groß anzeigen` : "Bild groß anzeigen")}">${thumb(id, "machine-photo__img")}${n > 1 ? `<span class="machine-photo__count">${n} Bilder</span>` : ""}</button>`;
}

/** Platzhalter in `root` mit dem Bild füllen. */
export function hydrate(root) {
  if (!counts?.size) return;
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

/**
 * Galerie in Bildschirmgröße (1.68.0): Wischen oder ‹ › blättern, Zähler „2 / 5“, Antippen außerhalb oder ✕ schließt.
 */
export function openGallery(srcs, caption, start = 0) {
  if (srcs.length <= 1) return srcs[0] ? openLightbox(srcs[0], caption) : undefined;
  let at = Math.min(Math.max(0, start), srcs.length - 1);
  const box = document.createElement("div");
  box.className = "lightbox lightbox--gallery";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", caption || "Bilder");
  box.innerHTML = `<button class="lightbox__close" aria-label="Bilder schließen">✕</button>
    <button class="lightbox__nav lightbox__nav--prev" aria-label="Voriges Bild">‹</button>
    <figure class="lightbox__figure"><img class="lightbox__img" alt="${escAttr(caption)}"><figcaption class="lightbox__caption"><span class="lightbox__counter"></span> ${escAttr(caption)}</figcaption></figure>
    <button class="lightbox__nav lightbox__nav--next" aria-label="Nächstes Bild">›</button>`;
  const img = box.querySelector("img");
  const counter = box.querySelector(".lightbox__counter");
  const show = () => {
    img.src = srcs[at];
    counter.textContent = `${at + 1} / ${srcs.length}`;
  };
  const step = (d) => {
    at = (at + d + srcs.length) % srcs.length;
    show();
  };
  const close = () => {
    box.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  };
  box.querySelector(".lightbox__nav--prev").addEventListener("click", (e) => (e.stopPropagation(), step(-1)));
  box.querySelector(".lightbox__nav--next").addEventListener("click", (e) => (e.stopPropagation(), step(1)));
  let x0 = null;
  box.addEventListener("touchstart", (e) => (x0 = e.touches.length === 1 ? e.touches[0].clientX : null), { passive: true });
  box.addEventListener("touchend", (e) => {
    const dx = x0 === null ? 0 : (e.changedTouches[0]?.clientX ?? x0) - x0;
    x0 = null;
    if (Math.abs(dx) > 40) {
      step(dx < 0 ? 1 : -1);
      box.dataset.swiped = "1";
    }
  });
  box.addEventListener("click", (e) => {
    if (box.dataset.swiped) return void delete box.dataset.swiped;
    if (e.target === img) return step(1);
    close();
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(box);
  show();
  box.querySelector(".lightbox__close").focus();
}

/** Großansicht aller Bilder einer Maschine. */
export async function showMachine(id, caption) {
  const srcs = await machineUrls(id).catch(() => []);
  if (srcs.length) openGallery(srcs, caption);
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
  const missing = (sel) => sel.filter((p) => packageState(p, installed.get(p.key)) !== "current");
  const sum = (sel) => sel.reduce((a, p) => a + p.bytes, 0);
  const busy = S.mimgBusy;
  const row = (p) => {
    const st = packageState(p, installed.get(p.key));
    const label = { none: "Laden", partial: "Fertig laden", old: "Aktualisieren", current: "" }[st];
    const inst = installed.get(p.key);
    return `<li><span><b>${esc(p.manufacturer)}</b>${p.folder && p.folder !== p.manufacturer ? `<small class="muted">Ordner ${esc(p.folder)}</small>` : ""}
      <small class="muted">${n(p.images)} Bilder · ${mb(p.bytes)} · Stand ${esc(p.version)}${st === "current" ? " · installiert" : st === "old" ? ` · installiert: ${esc(inst.version)}` : st === "partial" ? " · unvollständig" : ""}</small></span>
      <span class="mimg-actions">${label ? `<button class="btn sm" data-act="mimg-get" data-arg="${esc(p.key)}" ${busy ? "disabled" : ""}>${label}</button>` : ""}${inst ? `<button class="btn sm ghost" data-act="mimg-remove" data-arg="${esc(p.key)}" ${busy ? "disabled" : ""} aria-label="Bilder von ${esc(p.manufacturer)} entfernen">Entfernen</button>` : ""}</span></li>`;
  };
  const extra = [...installed.values()].filter((p) => !(list ?? []).some((x) => x.key === p.key));
  const st = S.mimgStorage;
  return `${X.header("Maschinenbilder", { back: "transfer" })}<main class="wrap">
    <section class="card">
      <h3>Bilder der Maschinen</h3>
      <p class="muted small">Alle Bilder der Maschinen, so wie sie am PC hinterlegt sind – auch deine eigenen Fotos –, fürs Handy verkleinert. Das Hauptbild erscheint in der Maschinensuche, im Training, im Verlauf und in der Datenbank; Antippen in Verlauf und Datenbank zeigt alle Bilder der Maschine zum Durchblättern. Die Bilder bleiben auf diesem Gerät und gelten für alle Konten.</p>
      ${busy ? `<p class="notice" role="status">${esc(busy)}</p>` : ""}
      <p class="small">${imageCount() ? `${n(totalImages())} Bilder von ${n(imageCount())} Maschinen auf diesem Gerät` : "Noch keine Bilder auf diesem Gerät"}${st?.usage ? ` · belegter Speicher der App: ${mb(st.usage)}` : ""}</p>
      ${
        list === null
          ? `<p class="muted small">Liste wird geladen …</p>`
          : list.length
            ? `
              ${
                missing(list).length
                  ? `<button class="btn ${list.length === 1 ? "primary " : ""}block" data-act="mimg-get-all" ${busy ? "disabled" : ""}>${
                      list.length === 1
                        ? `${{ none: "Alle Maschinenbilder laden", partial: "Laden fortsetzen", old: "Maschinenbilder aktualisieren" }[packageState(list[0], installed.get(list[0].key))] ?? "Laden"} (${n(list[0].images)} Bilder, ${mb(list[0].bytes)})`
                        : `Alle laden (${missing(list).length} Pakete, ${mb(sum(missing(list)))})`
                    }</button>`
                  : `<p class="muted small">${list.length === 1 ? "Alle Maschinenbilder sind geladen und aktuell." : "Alle Pakete sind installiert und aktuell."}</p>`
              }`
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
      <p class="muted small">Ein Teil des Bilderpakets, das du von der Website (Bilderpakete) geladen hast – jeden Teil einmal wählen. Abgebrochenes Laden setzt „Alle Maschinenbilder laden“ beim nächsten Mal fort.</p>
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
        S.mimgBusy = `Lädt ${p.key === "maschinenbilder" ? "Maschinenbilder" : p.manufacturer}${p.files.length > 1 ? ` – Teil ${j + 1} von ${p.files.length}` : ""} …${entries.length > 1 ? ` Paket ${i + 1} von ${entries.length}` : ""} Bitte die App geöffnet lassen.`;
        X.rerender();
        const res = await fetch(`bilder/${encodeURIComponent(file)}`, { cache: "no-cache" });
        if (!res.ok) throw new Error(`${p.manufacturer}: Datei nicht erreichbar.`);
        await storePart(parsePackage(await res.text()));
      }
      ok++;
    }
    X.toast(entries.length === 1 ? (entries[0].key === "maschinenbilder" ? `${n(entries[0].images)} Maschinenbilder geladen.` : `Bilder von ${entries[0].manufacturer} geladen.`) : `${ok} Bilderpakete geladen.`);
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
