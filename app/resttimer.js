// LIFESPAN OS Mobil – Pausentimer, Trainingsuhr und Bildschirm anlassen (aus app.js, 1.74.0).
import { bodyLeave } from "./body.js";
import { fmtSec, restEl, S, saveNow } from "./appbase.js";

// ------------------------------------------------------------------ Pausentimer

export let audioCtx = null;

export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    loadRestSounds();
  } catch {
    /* ohne Ton */
  }
}

// Klänge wie am PC (RestTimerBar.tsx, seit 1.44.0 auch am Handy): reihum, gemerkt im Gerät. Über
// Web Audio abgespielt, damit sie auf dem iPhone nach dem ersten Antippen auch ohne Tippen am Ende
// der Pause laufen – nur solange die App geöffnet ist (Web-Apps dürfen im Hintergrund keinen Ton
// abspielen). Fehlt ein Klang, kommt der Signalton.
export const REST_SOUNDS = ["yeah-buddy", "light-weight-baby", "do-you-even-lift", "i-can-do-this-all-day", "skinny"].map((n) => `sounds/${n}.mp3`);

export const REST_SOUND_KEY = "lifespan.restTimer.lastSound";

export let restBuffers = null;

export function loadRestSounds() {
  if (restBuffers || !audioCtx) return;
  restBuffers = REST_SOUNDS.map(() => null);
  REST_SOUNDS.forEach((src, i) => {
    fetch(src)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => new Promise((ok, fail) => audioCtx.decodeAudioData(data, ok, fail)))
      .then((buffer) => {
        restBuffers[i] = buffer;
      })
      .catch(() => {
        /* dieser Klang fehlt – dann Signalton */
      });
  });
}

export function nextSoundIndex(last, count) {
  if (count <= 0) return -1;
  if (last === null || !Number.isInteger(last) || last < 0 || last >= count) return 0;
  return (last + 1) % count;
}

export function restSignal() {
  let last = null;
  try {
    const raw = localStorage.getItem(REST_SOUND_KEY);
    last = raw === null ? null : Number(raw);
  } catch {
    last = null;
  }
  const index = nextSoundIndex(last, REST_SOUNDS.length);
  try {
    localStorage.setItem(REST_SOUND_KEY, String(index));
  } catch {
    /* ohne Merken */
  }
  const buffer = restBuffers?.[index] ?? null;
  if (!buffer || !audioCtx) return beep();
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(audioCtx.destination);
    src.start();
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    beep();
  }
}

export function beep() {
  try {
    if (!audioCtx) return;
    for (const [t, f] of [[0, 880], [0.25, 880], [0.5, 1320]]) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.25, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.22);
    }
  } catch {
    /* ohne Ton */
  }
  navigator.vibrate?.([200, 100, 200]);
}

export function startRest(seconds) {
  S.rest = { endsAt: Date.now() + seconds * 1000, total: seconds, beeped: false };
  renderRest();
}

export function adjustRest(delta) {
  if (!S.rest) return;
  S.rest.endsAt += delta * 1000;
  S.rest.total = Math.max(1, S.rest.total + delta);
  S.rest.beeped = false;
  renderRest();
}

export function stopRest() {
  S.rest = null;
  renderRest();
}

export function renderRest() {
  if (!S.rest || S.view !== "workout") {
    restEl.hidden = true;
    return;
  }
  const left = (S.rest.endsAt - Date.now()) / 1000;
  const over = left <= 0;
  if (over && !S.rest.beeped) {
    S.rest.beeped = true;
    restSignal();
  }
  if (left < -60) return stopRest();
  restEl.hidden = false;
  restEl.className = over ? "rest over" : "rest";
  const pct = Math.max(0, Math.min(100, (left / S.rest.total) * 100));
  restEl.innerHTML = `<div class="box"><span class="t">${over ? "Los!" : fmtSec(left)}</span>
    <span class="lbl">${over ? "Pause vorbei" : "Pause"}</span>
    <button data-act="rest-minus" aria-label="15 Sekunden weniger">−15</button>
    <button data-act="rest-plus" aria-label="15 Sekunden mehr">+15</button>
    <button data-act="rest-stop">✕</button>
    <span class="bar" style="width:${pct}%"></span></div>`;
}

setInterval(() => {
  if (S.rest) renderRest();
  const clock = document.querySelector("[data-clock]");
  if (clock && S.active) clock.textContent = fmtSec((Date.now() - new Date(S.active.startedAt)) / 1000);
}, 500);

// ------------------------------------------------------------------ Bildschirm anlassen

export let lock = null;

export async function wakeLock(on) {
  try {
    if (on && "wakeLock" in navigator && !lock) {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => (lock = null));
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch {
    lock = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.active) wakeLock(true);
  if (document.visibilityState === "hidden") {
    // App in den Hintergrund: offene Körperwerte sichern (1.40.0)
    if (S.view === "body-entry") bodyLeave();
    saveNow();
  }
});
