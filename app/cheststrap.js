// LIFESPAN OS Mobil – Messung mit dem Brustgurt (1.185.0, wie PC 1.0.254): Ruhepuls und HRV (RMSSD)
// aus den Herzschlag-Abständen eines Standard-Pulsgurts. Gelesen wird über Web Bluetooth
// (Heart Rate Service, Merkmal „Heart Rate Measurement“), gerechnet mit denselben Regeln wie am PC
// (pcdomain.js aus src/domain/chestStrap.ts). Web Bluetooth gibt es in Chrome (Android, Windows,
// macOS) – Safari auf dem iPhone bietet es Web-Apps nicht an; dort zeigt der Baustein nur den
// Hinweis, am PC zu messen oder die Werte von Hand einzutragen. Es wird nichts ins Internet gesendet.

import * as D from "./pcdomain.js";

let X = null; // { S, esc, rerender, toast }
let onAdopt = null;
/** Laufende Verbindung: { device, ch, onValue, onLost, timer, lastNew, wake } */
let session = null;

/** `adopt(result)`: übernimmt das Ergebnis in das Formular, das den Baustein zeigt. */
export function initChestStrap(ctx, adopt) {
  X = ctx;
  onAdopt = adopt;
}

/** Kann dieser Browser Bluetooth-Geräte ansprechen? */
export function strapSupported() {
  return typeof navigator !== "undefined" && typeof navigator.bluetooth?.requestDevice === "function";
}

const C = () => D.chestStrap;
const esc = (v) => X.esc(v);
const F = (v, d = 0) => D.formatNumber(v, d);

function st() {
  X.S.strap ??= { open: false, step: "idle", packets: [], result: null, error: null, name: "" };
  return X.S.strap;
}

/** So lange ohne neues Datenpaket, bis die Anzeige darauf hinweist (ms). */
const QUIET_MS = 8000;

function howto() {
  return `<ol class="strap__howto">${C()
    .STRAP_HOWTO.map((t) => `<li>${esc(t)}</li>`)
    .join("")}</ol>`;
}

function info() {
  const K = C();
  const src = K.STRAP_SOURCES.map((s) => `<button type="button" class="linkbtn" data-act="icoach-ask" data-arg="${esc(`${s.book}|${s.question}`)}">${esc(D.connections.CONN_BOOK_LABELS[s.book])}: „${esc(s.title)}“</button>`).join(" · ");
  return `<details class="ov-more"><summary>So wird gerechnet</summary><p class="muted small">${esc(K.STRAP_METHOD_TEXT)}</p><p class="muted small">${src}</p><p class="muted small">Studienlage: ${esc(K.STRAP_LITERATURE.join(" "))} Orientierung, keine ärztliche Beratung.</p></details>`;
}

function body() {
  const s = st();
  const K = C();
  const err = s.error ? `<p class="warn" role="alert">${esc(s.error)}</p>` : "";
  if (!strapSupported()) {
    return `<p class="muted small">Dieser Browser kann keine Bluetooth-Geräte ansprechen. Safari auf dem iPhone bietet das Web-Apps nicht an; mit Chrome auf Android funktioniert die Messung direkt hier.</p>
      <p class="muted small">So geht es trotzdem: am PC messen (Overview → Morgen-Check-in oder Recovery → ANS-Werte erfassen → „Mit dem Brustgurt messen“) – oder Ruhepuls und HRV unten von Hand eintragen.</p>${info()}`;
  }
  if (s.step === "connecting") {
    return `<p class="strap__phase" role="status">Verbinde mit ${esc(s.name || "dem Gurt")} …</p>
      <div class="strap__actions"><button type="button" class="btn" data-act="strap-cancel">Abbrechen</button></div>`;
  }
  if (s.step === "measuring") {
    const elapsed = s.packets[s.packets.length - 1]?.tMs ?? 0;
    const p = K.strapProgress(elapsed);
    const live = K.strapLive(s.packets);
    const quiet = session && Date.now() - session.lastNew > QUIET_MS;
    const pct = Math.round(p.share * 100);
    return `<p class="strap__phase" role="status">${esc(p.label)} – noch ${p.remainingSec} s</p>
      <div class="strap__bar" role="progressbar" aria-label="Fortschritt der Messung" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <p class="strap__live"><span>Puls <strong>${live.bpm !== null ? F(live.bpm) : "–"}</strong> bpm</span><span>Herzschläge <strong>${F(live.beats)}</strong></span>
        ${live.contact === false ? `<span class="strap__warn">Kein Hautkontakt</span>` : quiet ? `<span class="strap__warn">Der Gurt sendet gerade nichts</span>` : ""}</p>
      <div class="strap__actions"><button type="button" class="btn" data-act="strap-cancel">Abbrechen</button></div>`;
  }
  if (s.step === "result" && s.result) {
    const r = s.result;
    const usable = r.quality === "ok" || r.quality === "limited";
    const cell = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    return `<dl class="strap__result">
        ${cell("Ruhepuls", r.restingHr !== null ? `${F(r.restingHr)} bpm` : "–")}
        ${cell("HRV (RMSSD)", r.rmssdMs !== null ? `${F(r.rmssdMs, 1)} ms` : "–")}
        ${cell("Ø Schlag-Abstand", r.meanRrMs !== null ? `${F(r.meanRrMs)} ms` : "–")}
        ${cell("Gewertete Schläge", `${F(r.valid)} von ${F(r.beats)}`)}</dl>
      <p class="${usable ? "muted small" : "strap__warn"}" role="status">${esc(r.text)}</p>
      <div class="strap__actions"><button type="button" class="btn primary" data-act="strap-adopt" ${usable ? "" : "disabled"}>Werte übernehmen</button>
        <button type="button" class="btn" data-act="strap-start">Noch einmal messen</button></div>`;
  }
  return `${howto()}${err}<div class="strap__actions"><button type="button" class="btn primary" data-act="strap-start">Brustgurt verbinden und messen (${(K.STRAP.settleSec + K.STRAP.measureSec) / 60} Min)</button></div>${info()}`;
}

/** Baustein für das Formular „ANS-Werte erfassen“. */
export function strapPanelHtml() {
  const s = st();
  if (!s.open) return `<p class="strap-open"><button type="button" class="btn" data-act="strap-open">Ruhepuls und HRV mit dem Brustgurt messen</button></p>`;
  return `<div class="strap" data-autosave-skip><div class="strap__head"><strong>Messung mit dem Brustgurt</strong><span class="spacer"></span>${
    s.step === "connecting" || s.step === "measuring" ? "" : `<button type="button" class="linkbtn small" data-act="strap-close">Schließen</button>`
  }</div><div id="strap-panel">${body()}</div></div>`;
}

function refresh() {
  const el = typeof document !== "undefined" ? document.getElementById("strap-panel") : null;
  if (el) el.innerHTML = body();
  return el;
}

async function stopSession() {
  const cur = session;
  session = null;
  if (!cur) return;
  clearInterval(cur.timer);
  try {
    cur.ch?.removeEventListener("characteristicvaluechanged", cur.onValue);
    cur.device?.removeEventListener("gattserverdisconnected", cur.onLost);
    if (cur.device?.gatt?.connected) {
      await cur.ch?.stopNotifications().catch(() => undefined);
      cur.device.gatt.disconnect();
    }
  } catch {
    // Gurt schon weg – nichts mehr zu trennen
  }
  try {
    await cur.wake?.release();
  } catch {
    // Bildschirmsperre war schon wieder frei
  }
}

function fail(message) {
  const s = st();
  void stopSession();
  s.error = message;
  s.step = "idle";
  refresh();
}

function tick() {
  const s = st();
  // Formular verlassen: Messung beenden
  if (!refresh()) {
    void stopSession();
    s.step = "idle";
    return;
  }
  const elapsed = s.packets[s.packets.length - 1]?.tMs ?? 0;
  if (C().strapProgress(elapsed).phase === "done") {
    void stopSession();
    s.result = C().strapResult(s.packets);
    s.step = "result";
    refresh();
  }
}

async function start() {
  const s = st();
  await stopSession();
  s.error = null;
  s.result = null;
  s.packets = [];
  let device;
  try {
    // Der Browser zeigt seine eigene Auswahl; angeboten werden nur Geräte mit Pulsdienst
    device = await navigator.bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }] });
  } catch (e) {
    // Auswahl geschlossen: still zurück; alles andere melden
    s.step = "idle";
    if (e?.name !== "NotFoundError") s.error = `Bluetooth lässt sich nicht nutzen: ${e?.message ?? e}`;
    refresh();
    return;
  }
  s.name = device.name ?? "";
  s.step = "connecting";
  refresh();
  const cur = { device, ch: null, onValue: null, onLost: null, timer: null, lastNew: Date.now(), wake: null };
  session = cur;
  try {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService("heart_rate");
    cur.ch = await service.getCharacteristic("heart_rate_measurement");
    let t0 = null;
    cur.onValue = (ev) => {
      const v = ev.target.value;
      const now = performance.now();
      if (t0 === null) t0 = now;
      s.packets.push({ tMs: Math.round(now - t0), bytes: Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) });
      cur.lastNew = Date.now();
    };
    cur.onLost = () => {
      if (session === cur) fail("Die Verbindung zum Gurt ist abgebrochen. Bitte näher herangehen und die Messung wiederholen.");
    };
    cur.ch.addEventListener("characteristicvaluechanged", cur.onValue);
    device.addEventListener("gattserverdisconnected", cur.onLost);
    await cur.ch.startNotifications();
    if (session !== cur) return; // inzwischen abgebrochen
    // Bildschirm während der Messung wach halten (wo der Browser das kann)
    cur.wake = await navigator.wakeLock?.request("screen").catch(() => null);
    s.step = "measuring";
    cur.timer = setInterval(tick, 500);
    refresh();
  } catch (e) {
    if (session === cur) fail(`Der Gurt lässt sich nicht verbinden: ${e?.message ?? e}. Gurt anfeuchten und anlegen – er sendet erst mit Hautkontakt.`);
  }
}

export const strapActions = {
  "strap-open": () => {
    st().open = true;
    X.rerender();
  },
  "strap-close": () => {
    const s = st();
    void stopSession();
    s.open = false;
    s.step = "idle";
    s.error = null;
    X.rerender();
  },
  "strap-start": () => void start(),
  "strap-cancel": () => {
    const s = st();
    void stopSession();
    s.step = "idle";
    refresh();
  },
  "strap-adopt": () => {
    const s = st();
    const r = s.result;
    if (!r || (r.quality !== "ok" && r.quality !== "limited")) return;
    s.open = false;
    s.step = "idle";
    s.result = null;
    onAdopt?.(r);
  },
};
