// LIFESPAN OS Mobil – Konten am Handy (aus app.js, 1.74.0).
import * as C from "./core.js";
import * as store from "./store.js";
import { buildDb } from "./diary.js";
import * as PS from "./pcsettings.js";
import { esc, header, refreshCatalog, S, saveNow, toast } from "./appbase.js";
import { applyCatalog } from "./catalogload.js";

// ------------------------------------------------------------------ Konten (1.25.0)

/** Name des aktiven Kontos: Profil (vom PC oder am Handy angelegt), sonst „Hauptkonto“. */
export function accountName(id = S.accountId) {
  // Aktives Konto: Profilname (am Handy geändert gilt vor dem Stand vom PC, 1.48.0)
  const own = id === S.accountId ? (PS.normSync(S.pcsettings).profile?.row?.name ?? S.catalog?.pc?.profile?.[0]?.name) : null;
  if (own) return own;
  if (!id) return S.mainAccountName || "Hauptkonto";
  return S.accounts.find((a) => a.id === id)?.name ?? "Konto";
}

/** Startpaket laden (Maschinen, Lebensmittel, Übungsbibliothek – wie ein neuer Benutzer am PC). */
export async function loadStartPackage() {
  const res = await fetch("startpaket.json");
  if (!res.ok) throw new Error("Die Grunddaten konnten nicht geladen werden. Bitte mit Internet erneut versuchen.");
  return res.json();
}

/**
 * Konto am Handy anlegen. Ohne Daten auf diesem Gerät (Startbildschirm) wird das aktuelle Konto
 * eingerichtet; sonst entsteht ein weiteres Konto mit eigenem Speicher und die App startet neu.
 */
export async function createAccount(input) {
  const start = await loadStartPackage();
  const catalog = C.parseExport(C.accountDoc(start, input));
  const iso = new Date().toISOString();
  if (!S.catalog) {
    await applyCatalog(catalog);
    if (S.accountId) {
      S.accounts = S.accounts.map((a) => (a.id === S.accountId ? { ...a, name: catalog.pc.profile[0].name } : a));
      await store.setGlobal("accounts", S.accounts);
    } else {
      S.mainAccountName = catalog.pc.profile[0].name;
      await store.setGlobal("mainName", S.mainAccountName);
    }
    await store.persist();
    refreshCatalog();
    return false;
  }
  const id = `k${Date.now().toString(36)}`;
  S.accounts = [...S.accounts, { id, name: catalog.pc.profile[0].name, createdAt: iso }];
  await store.setGlobal("accounts", S.accounts);
  if (!S.mainAccountName && !S.accountId) {
    S.mainAccountName = accountName("");
    await store.setGlobal("mainName", S.mainAccountName);
  }
  store.useAccount(id);
  await store.set("catalog", catalog);
  await store.setGlobal("activeAccount", id);
  await store.persist();
  return true;
}

/** Name des angemeldeten Kontos in der Kontenliste nachziehen (nach dem Speichern des Profils). */
export async function renameActiveAccount(name) {
  if (S.accountId) {
    S.accounts = S.accounts.map((a) => (a.id === S.accountId ? { ...a, name } : a));
    await store.setGlobal("accounts", S.accounts);
  } else {
    S.mainAccountName = name;
    await store.setGlobal("mainName", name);
  }
}

/**
 * Beim Start: Wurde dieses Konto umbenannt, während ein anderes angemeldet war, gilt der Name jetzt
 * auch im Profil (geht mit „An den PC senden“ zum PC).
 */
export async function applyPendingRename() {
  const pending = S.accountId ? S.accounts.find((a) => a.id === S.accountId)?.rename : await store.getGlobal("mainRename");
  if (!pending) return;
  try {
    const db = buildDb();
    if (db.profile && db.profile.name !== pending) {
      PS.setProfile(S.pcsettings, { ...db.profile, name: pending });
      await store.set("pcsettings", S.pcsettings);
    }
  } catch {
    // ohne Profil: nur der Name in der Liste
  }
  if (S.accountId) {
    S.accounts = S.accounts.map((a) => (a.id === S.accountId ? { ...a, rename: undefined } : a));
    await store.setGlobal("accounts", S.accounts);
  } else {
    await store.setGlobal("mainRename", null);
  }
}

export async function switchAccount(id) {
  if (S.active) return toast("Erst das laufende Training beenden.", true);
  await saveNow();
  await store.setGlobal("activeAccount", id);
  location.reload();
}

export function viewAccountNew() {
  const f = S.accountForm ?? { name: "", sex: "", birthDate: "", heightCm: "", error: null, busy: false };
  return `${header("Neues Konto", { back: S.catalog ? "settings" : "setup" })}<main class="wrap">
    <section class="card">
      <h3>Konto am Handy</h3>
      <p class="muted small">Für jemanden ohne PC: Alles bleibt auf diesem Gerät. Mit dabei sind die Maschinendatenbank (mit Muskelgruppen, ohne Bilder), die Lebensmitteldatenbank und die Übungsbibliothek – wie bei einem neuen Benutzer am PC. Später überträgst du alles mit „An den PC senden“.</p>
      <div class="field"><label for="acc-name">Name</label><input id="acc-name" type="text" autocomplete="off" maxlength="80" value="${esc(f.name)}"></div>
      <div class="grid2">
        <div class="field"><label for="acc-sex">Geschlecht</label><select id="acc-sex"><option value="">wählen …</option>
          <option value="female" ${f.sex === "female" ? "selected" : ""}>weiblich</option><option value="male" ${f.sex === "male" ? "selected" : ""}>männlich</option></select></div>
        <div class="field"><label for="acc-height">Größe (cm)</label><input id="acc-height" type="text" inputmode="decimal" value="${esc(f.heightCm)}" placeholder="z. B. 172"></div>
      </div>
      <div class="field"><label for="acc-birth">Geburtsdatum</label><input id="acc-birth" type="date" value="${esc(f.birthDate)}"></div>
      <p class="muted small card-info">Geschlecht, Alter und Größe braucht die App für Energiebedarf und Referenzwerte.</p>
      ${f.error ? `<p class="field-error">${esc(f.error)}</p>` : ""}
      <button class="btn primary block" data-act="account-create" ${f.busy ? "disabled" : ""}>${f.busy ? "Wird eingerichtet …" : "Konto anlegen"}</button>
    </section>
    ${S.catalog ? `<p class="muted small">Das neue Konto bekommt einen eigenen Speicher. Dein bisheriges Konto bleibt unverändert; wechseln kannst du jederzeit unter Settings → Konten.</p>` : ""}
  </main>`;
}

/** Settings-Karte „Konten“. */
export function accountsCard() {
  const list = [{ id: "", name: accountName("") }, ...S.accounts];
  return `<section class="card">
    <div class="wo-head"><h3>Konten</h3><span class="tag">${list.length}</span></div>
    <p class="small">Angemeldet: <b>${esc(accountName())}</b> · ${S.catalog?.startpaket ? "Konto am Handy" : "Daten vom PC"}</p>
    <p class="muted small card-info">Den Namen des angemeldeten Kontos änderst du oben im Profil; andere Konten hier mit „Umbenennen“. Benutzer am PC sind eigene Datenbanken am PC.</p>
    ${
      list.length > 1
        ? `<ul class="account-list">${list
            .filter((a) => a.id !== S.accountId)
            .map(
              (a) =>
                S.accRename === a.id
                  ? `<li class="account-rename"><div class="field"><label for="acc-rename">Neuer Name</label><input id="acc-rename" type="text" maxlength="80" autocomplete="off" value="${esc(a.id === "" ? accountName("") : a.name)}"></div>
                <span class="row-actions"><button class="btn sm primary" data-act="account-rename-save" data-arg="${esc(a.id)}">Speichern</button><button class="btn sm ghost" data-act="account-rename-cancel">Abbrechen</button></span></li>`
                  : `<li><span>${esc(a.id === "" ? accountName("") : a.name)}<small class="muted">${a.id === "" ? "Hauptkonto" : "Konto am Handy"}</small></span>
                <span class="row-actions"><button class="btn sm" data-act="account-switch" data-arg="${esc(a.id)}">Wechseln</button><button class="btn sm ghost" data-act="account-rename" data-arg="${esc(a.id)}">Umbenennen</button>${
                  a.id ? `<button class="btn sm ghost danger" data-act="account-delete" data-arg="${esc(a.id)}">Löschen</button>` : ""
                }</span></li>`,
            )
            .join("")}</ul>`
        : ""
    }
    ${S.catalog?.startpaket ? `<p class="muted small">Das ganze Konto an den PC bringen: Import/Export → „Ganzes Konto an den PC“.</p>` : ""}
    <button class="btn block" data-act="account-new">Neues Konto anlegen</button>
    <p class="muted small" id="persist-note">Alle Daten liegen nur auf diesem Gerät.</p>
  </section>`;
}
