// LIFESPAN OS Mobil – Sleep: grafische Karten der gemessenen Nächte (1.180.0, wie
// SleepVisualCards.tsx am PC 1.0.245): Schlafverlauf, Nightly Recharge, Anteile der Phasen,
// Schlafphasen je Nacht, Schlaffenster, Schlafdauer und HRV, Koffein und Schlafdauer, niedrigste
// Herzfrequenz und HRV. Rechnungen aus pcdomain.js (= src/domain/sleepVisual.ts). Jede Karte hat
// hinter dem ⓘ dieselben Erklärungen wie am PC.

import * as D from "./pcdomain.js";
import * as W from "./wearabledata.js";
import { COLOR, esc } from "./pcview.js";

const V = () => D.sleepVisual;
const F = (v, d = 0) => D.formatNumber(v, d);
const dur = (m) => (m === null || m === undefined || !Number.isFinite(m) ? "–" : D.formatDuration(m));
const fx = (v) => v.toFixed(1);
const hours = (m) => F(m / 60, m % 60 === 0 ? 0 : 1);
const nights = (n) => `${n} ${n === 1 ? "Nacht" : "Nächte"}`;
const shortDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const every = (count, max) => Math.max(1, Math.ceil(count / max));

const C = {
  ...COLOR,
  deep: "#2E2580",
  light: "#A39BE3",
  rem: "#2F86B8",
  wake: "#7A889D",
  unknown: "#C3CEDC",
  orange: "#F39A22",
  muted: "#55657C",
};
const STAGE_COLOR = { wake: C.wake, rem: C.rem, light: C.light, deep: C.deep, unknown: C.unknown };

const ADJUST =
  "Zeitraum oben über „Zeitraum“ wählen (7, 30 oder 90 Nächte, 1 Jahr). Bereich 3 Sekunden gedrückt halten, um ihn zu verschieben oder über das Auge auszublenden.";

function info(what, means, adjust = "") {
  return `<p class="card__note"><strong>Was du siehst:</strong> ${esc(what)}</p>
    <p class="card__note"><strong>Was es aussagt:</strong> ${esc(means)}</p>
    <p class="card__note"><strong>Anpassen:</strong> ${esc(adjust ? `${adjust} ${ADJUST}` : ADJUST)}</p>`;
}

function card(title, meta, body) {
  return `<section class="card ov-card card--sleep sleep-viz"><div class="wo-head"><h3>${esc(title)}</h3>${meta ? `<span class="tag">${esc(meta)}</span>` : ""}</div>${body}</section>`;
}

function legend(items) {
  return `<ul class="legend sleep-viz__legend">${items
    .map((i) => `<li><span class="swatch${i.dashed ? " swatch--line" : ""}" style="background:${i.color}"></span> ${esc(i.label)}</li>`)
    .join("")}</ul>`;
}

const svg = (w, h, label, body) =>
  `<svg class="pc-chart sleep-viz__svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
const hline = (x1, x2, y, cls = "grid") => `<line x1="${x1}" x2="${x2}" y1="${fx(y)}" y2="${fx(y)}" class="${cls}"/>`;
const text = (x, y, t, anchor = "middle", extra = "") =>
  `<text x="${fx(x)}" y="${fx(y)}" text-anchor="${anchor}"${extra}>${esc(t)}</text>`;
const title = (t) => `<title>${esc(t)}</title>`;

// ------------------------------------------------------------------ Schlafverlauf

const LANES = ["wake", "rem", "light", "deep"];

function hypnogramCard(range, pick) {
  const list = range.sleep.filter((s) => W.hypnogramSegments(s).length > 0).reverse();
  if (!list.length) return "";
  const n = list.find((x) => x.date === pick) ?? list[0];
  const segs = W.hypnogramSegments(n);
  const start = segs[0].from;
  const end = segs[segs.length - 1].to;
  const Wd = 340, H = 170, L = 44, R = 6, T = 6, B = 20;
  const laneH = (H - T - B) / LANES.length;
  const x = (m) => L + ((m - start) / Math.max(1, end - start)) * (Wd - L - R);
  const laneY = (s) => T + Math.max(0, LANES.indexOf(s === "unknown" ? "light" : s)) * laneH;
  const ticks = [];
  const stepH = end - start > 9 * 60 ? 120 : 60;
  for (let t = Math.ceil(start / stepH) * stepH; t <= end; t += stepH) ticks.push(t);
  const totals = {};
  for (const s of segs) totals[s.stage] = (totals[s.stage] ?? 0) + (s.to - s.from);
  const body =
    LANES.map((s) => `<rect x="${L}" y="${fx(laneY(s))}" width="${Wd - L - R}" height="${fx(laneH)}" class="sleep-viz__lane"/>${text(L - 5, laneY(s) + laneH / 2 + 3, W.STAGE_LABEL[s], "end")}`).join("") +
    ticks.map((t) => `<line x1="${fx(x(t))}" x2="${fx(x(t))}" y1="${T}" y2="${H - B}" class="grid"/>${text(x(t), H - 6, V().clockText(t))}`).join("") +
    segs
      .map((s) => `<rect x="${fx(x(s.from))}" y="${fx(laneY(s.stage) + 2)}" width="${fx(Math.max(0.8, x(s.to) - x(s.from)))}" height="${fx(laneH - 4)}" rx="1.5" fill="${STAGE_COLOR[s.stage]}">${title(`${W.STAGE_LABEL[s.stage]}: ${V().clockText(s.from)}–${V().clockText(s.to)} Uhr (${dur(Math.round(s.to - s.from))})`)}</rect>`)
      .join("");
  const options = list
    .map((x) => `<option value="${esc(x.date)}" ${x.date === n.date ? "selected" : ""}>${esc(D.formatDate(x.date))}</option>`)
    .join("");
  return card(
    "Schlafverlauf",
    `${V().clockText(start)}–${V().clockText(end)} Uhr`,
    `<label class="field logs-select"><span>Nacht</span><select data-logs="sleep-hypno">${options}</select></label>
    ${svg(Wd, H, `Schlafverlauf der Nacht bis ${D.formatDate(n.date)}`, body)}
    ${legend(LANES.map((s) => ({ label: `${W.STAGE_LABEL[s]} ${dur(Math.round(totals[s] ?? 0))}`, color: STAGE_COLOR[s] })))}
    ${info(
      "Für eine Nacht, in welcher Schlafphase du laut Uhr wann warst – von oben nach unten Wach, REM, Leicht und Tief. Jeder Balken ist ein Abschnitt; Antippen zeigt Uhrzeit und Dauer. Unter der Grafik die Summe je Phase.",
      "Typisch ist ein Wechsel in Zyklen von etwa 90 Minuten mit mehr Tiefschlaf in der ersten und mehr REM in der zweiten Nachthälfte. Wearables erkennen Schlaf und Wach recht gut, die einzelnen Phasen nur mäßig genau – betrachte eher das Muster über mehrere Nächte als eine einzelne Nacht.",
      "Über „Nacht“ eine andere Nacht wählen.",
    )}`,
  );
}

// ------------------------------------------------------------------ Nightly Recharge

function rechargeCard(range) {
  const list = V().rechargeNights(range.recovery);
  if (!list.length) return "";
  const last = list[list.length - 1];
  const ans = list.filter((r) => r.ansCharge !== null);
  const status = W.rechargeStatusLabel(last.rechargeStatus);
  const Wd = 340, H = 130, L = 24, R = 4, T = 6, B = 18;
  const y = (v) => T + ((10 - v) / 20) * (H - T - B);
  const step = (Wd - L - R) / Math.max(1, ans.length);
  const bw = Math.max(2, Math.min(14, step * 0.7));
  const ev = every(ans.length, 6);
  const chart =
    ans.length > 1
      ? svg(
          Wd,
          H,
          "ANS Charge je Nacht",
          [10, 5, 0, -5, -10].map((v) => `${hline(L, Wd - R, y(v), v === 0 ? "sleep-viz__zero" : "grid")}${text(L - 3, y(v) + 3, v > 0 ? `+${v}` : String(v), "end")}`).join("") +
            ans
              .map((r, i) => {
                const cx = L + i * step + step / 2;
                return `<rect x="${fx(cx - bw / 2)}" y="${fx(Math.min(y(r.ansCharge), y(0)))}" width="${fx(bw)}" height="${fx(Math.max(1, Math.abs(y(r.ansCharge) - y(0))))}" rx="1.5" fill="${C.recovery}">${title(`${D.formatDate(r.date)}: ANS Charge ${F(r.ansCharge, 1)}`)}</rect>${i % ev === 0 ? text(cx, H - 5, shortDate(r.date)) : ""}`;
              })
              .join(""),
        )
      : "";
  const v = (x, d, unit) => (x === null || x === undefined ? "–" : `${F(x, d)}${unit ? ` ${unit}` : ""}`);
  return card(
    "Nightly Recharge",
    D.formatDate(last.date),
    `<div class="stat">
      <div><b>${v(last.ansCharge, 1)}</b><span>ANS Charge (−10 bis +10)</span></div>
      <div><b>${v(last.hrvMs, 0, "ms")}</b><span>Ø HRV (RMSSD)</span></div>
      <div><b>${v(last.hrAvg, 0, "/min")}</b><span>Ø Puls</span></div>
      <div><b>${v(last.breathingAvg, 1, "/min")}</b><span>Ø Atemfrequenz</span></div>
    </div>
    ${status ? `<p class="muted small">Nightly Recharge der letzten Nacht: ${esc(status)}</p>` : ""}
    ${chart}
    ${info(
      "Oben die Werte der letzten Nacht aus Nightly Recharge der Polar-Uhr: ANS Charge, mittlere HRV, mittlerer Puls und Atemfrequenz in den ersten Stunden des Schlafs. Darunter die ANS Charge je Nacht als Balken um die Nulllinie.",
      "ANS Charge ist ein Wert von Polar (−10 bis +10), der Puls, HRV und Atmung der Nacht mit deinem eigenen üblichen Bereich vergleicht: über 0 = über deinem Üblichen, unter 0 = darunter. Die Einstufung „Nightly Recharge“ stammt ebenfalls von Polar, LIFESPAN OS bewertet nicht selbst.",
      "Die Werte kommen per Polar-Abgleich am PC (Import/Export → Polar) und mit der Exportdatei aufs Handy.",
    )}`,
  );
}

// ------------------------------------------------------------------ Anteile der Phasen

function sharesCard(range) {
  const a = V().phaseAverage(range.sleep);
  if (!a) return "";
  const parts = [
    { key: "deep", label: "Tief", pct: a.deepPct, min: a.deepMin, color: C.deep },
    { key: "light", label: "Leicht", pct: a.lightPct, min: a.lightMin, color: C.light },
    { key: "rem", label: "REM", pct: a.remPct, min: a.remMin, color: C.rem },
  ];
  const size = 150, r = 58, c = 2 * Math.PI * r;
  let off = 0;
  const rings = parts
    .map((p) => {
      const len = (p.pct / 100) * c;
      const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p.color}" stroke-width="22" stroke-dasharray="${fx(len)} ${fx(c - len)}" stroke-dashoffset="${fx(-off)}">${title(`${p.label}: ${F(p.pct)} % (Ø ${dur(p.min)})`)}</circle>`;
      off += len;
      return el;
    })
    .join("");
  const typical = (k) => {
    const p = D.sleep.SLEEP_PHASES.find((x) => x.key === k);
    return p ? `${p.typicalMin}–${p.typicalMax} %` : "";
  };
  return card(
    "Anteile der Phasen",
    `Ø aus ${nights(a.nights)}`,
    `<div class="sleep-viz__donut"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Mittlere Anteile der Schlafphasen"><g transform="rotate(-90 ${size / 2} ${size / 2})">${rings}</g>
      <text x="${size / 2}" y="${size / 2}" text-anchor="middle" class="sleep-viz__center">${esc(dur(a.deepMin + a.lightMin + a.remMin))}</text>
      <text x="${size / 2}" y="${size / 2 + 15}" text-anchor="middle" class="sleep-viz__axis">Ø Schlaf</text></svg>
      <ul class="legend sleep-viz__legend legend--column">${parts
        .map((p) => `<li><span class="swatch" style="background:${p.color}"></span> <span><strong>${p.label}</strong> ${F(p.pct)} % · Ø ${esc(dur(p.min))}<span class="muted small"> (typisch ${typical(p.key)})</span></span></li>`)
        .join("")}<li><span class="swatch" style="background:${C.wake}"></span> Wach (Unterbrechungen) Ø ${esc(dur(a.wakeMin))}</li></ul></div>
    ${info(
      "Der Ring zeigt, wie sich dein gemessener Schlaf im Mittel auf Tief-, Leicht- und REM-Schlaf verteilt (Anteile an der Summe dieser drei Phasen), in der Mitte die mittlere Schlafdauer aus den Phasen. Daneben die Minuten je Phase und die Wachzeit.",
      "Die typischen Bereiche sind grobe Richtwerte aus der Literatur für Erwachsene, keine Bewertung. Die Phasen-Erkennung der Uhr ist nur mäßig genau; Veränderungen über Wochen sagen mehr als ein einzelner Prozentwert.",
    )}`,
  );
}

// ------------------------------------------------------------------ Schlafphasen je Nacht

const MAX_BARS = 60;
const STACK = [
  { key: "deepMin", label: "Tief", color: C.deep },
  { key: "lightMin", label: "Leicht", color: C.light },
  { key: "remMin", label: "REM", color: C.rem },
  { key: "unknownMin", label: "Nicht erkannt", color: C.unknown },
  { key: "wakeMin", label: "Wach (Unterbrechungen)", color: C.wake },
];

function phaseNightsCard(range, goalMin) {
  const all = V().phaseNights(range.sleep);
  if (!all.length) return "";
  const list = all.slice(-MAX_BARS);
  const top = V().niceRange([0, ...list.map((n) => n.sleepMin + n.wakeMin), goalMin ?? 0], 120).max;
  const Wd = 340, H = 190, L = 30, R = 4, T = 6, B = 18;
  const y = (m) => T + (1 - m / top) * (H - T - B);
  const step = (Wd - L - R) / list.length;
  const bw = Math.max(2, Math.min(16, step * 0.7));
  const ev = every(list.length, 7);
  const body =
    V().niceRange([0, top], 120).ticks.map((t) => `${hline(L, Wd - R, y(t))}${text(L - 3, y(t) + 3, `${hours(t)} h`, "end")}`).join("") +
    list
      .map((n, i) => {
        const cx = L + i * step + step / 2;
        let acc = 0;
        const rects = STACK.map((p) => {
          const v = n[p.key];
          if (v <= 0) return "";
          const y0 = y(acc);
          acc += v;
          return `<rect x="${fx(cx - bw / 2)}" y="${fx(y(acc))}" width="${fx(bw)}" height="${fx(y0 - y(acc))}" fill="${p.color}">${title(`${D.formatDate(n.date)} – ${p.label}: ${dur(v)}`)}</rect>`;
        }).join("");
        return `${rects}${i % ev === 0 ? text(cx, H - 5, shortDate(n.date)) : ""}`;
      })
      .join("") +
    (goalMin ? hline(L, Wd - R, y(goalMin), "sleep-viz__goal") : "");
  return card(
    "Schlafphasen je Nacht",
    `${nights(list.length)}${all.length > list.length ? ` (letzte ${MAX_BARS})` : ""}`,
    `${svg(Wd, H, "Schlafphasen je Nacht als gestapelte Balken", body)}
    ${legend([...STACK, ...(goalMin ? [{ label: `Schlafziel ${dur(goalMin)}`, color: C.orange, dashed: true }] : [])])}
    ${info(
      "Je gemessener Nacht ein Balken: von unten Tiefschlaf, Leichtschlaf, REM, nicht erkannte Phase und oben die Wachzeit (Unterbrechungen). Die Höhe ist die Zeit von Einschlafen bis Aufwachen. Die gestrichelte orange Linie ist dein Schlafziel. Antippen eines Abschnitts zeigt die Minuten.",
      "Du siehst, wie lang die Nächte waren und wie sich die Phasen verteilen – etwa ob kurze Nächte vor allem weniger REM haben (REM liegt eher am Ende der Nacht). Werte der Uhr, keine Bewertung.",
      "Das Schlafziel änderst du am PC unter Settings → Ziele.",
    )}`,
  );
}

// ------------------------------------------------------------------ Schlaffenster

function windowCard(range) {
  const all = V().sleepWindows(range.sleep);
  if (!all.length) return "";
  const list = all.slice(-MAX_BARS);
  const sum = V().windowSummary(list);
  const ax = V().niceRange([...list.map((w) => w.start), ...list.map((w) => w.end)], 60, 240);
  const Wd = 340, H = 200, L = 36, R = 4, T = 6, B = 18;
  const y = (m) => T + ((m - ax.min) / (ax.max - ax.min)) * (H - T - B);
  const step = (Wd - L - R) / list.length;
  const bw = Math.max(2, Math.min(12, step * 0.6));
  const ev = every(list.length, 7);
  const ck = V().clockText;
  const body =
    ax.ticks.map((t) => `${hline(L, Wd - R, y(t))}${text(L - 3, y(t) + 3, ck(t), "end")}`).join("") +
    (sum ? hline(L, Wd - R, y(sum.start), "sleep-viz__mean") + hline(L, Wd - R, y(sum.end), "sleep-viz__mean") : "") +
    list
      .map((w, i) => {
        const cx = L + i * step + step / 2;
        return `<rect x="${fx(cx - bw / 2)}" y="${fx(y(w.start))}" width="${fx(bw)}" height="${fx(Math.max(2, y(w.end) - y(w.start)))}" rx="${fx(bw / 2)}" fill="${C.sleep}">${title(`${D.formatDate(w.date)}: ${ck(w.start)}–${ck(w.end)} Uhr, Mitte ${ck(w.mid)}`)}</rect><circle cx="${fx(cx)}" cy="${fx(y(w.mid))}" r="${fx(Math.min(3, bw / 2))}" fill="${C.orange}"/>${i % ev === 0 ? text(cx, H - 5, shortDate(w.date)) : ""}`;
      })
      .join("");
  return card(
    "Schlaffenster je Nacht",
    sum ? `Ø ${ck(sum.start)}–${ck(sum.end)} · Mitte ${ck(sum.mid)}${sum.midSpread !== null ? ` ± ${F(sum.midSpread)} min` : ""}` : "",
    `${svg(Wd, H, "Einschlafen und Aufwachen je Nacht", body)}
    ${legend([
      { label: "Einschlafen bis Aufwachen", color: C.sleep },
      { label: "Schlafmitte", color: C.orange },
      { label: "Ø Einschlafen / Ø Aufwachen", color: C.muted, dashed: true },
    ])}
    ${info(
      "Je gemessener Nacht ein Balken vom Einschlafen (oben) bis zum Aufwachen (unten) laut Uhr, der orange Punkt ist die Schlafmitte. Die gestrichelten Linien zeigen deine mittlere Einschlaf- und Aufwachzeit im Zeitraum.",
      "Je gleichmäßiger die Balken liegen, desto regelmäßiger ist dein Schlafrhythmus. Die Schwankung der Schlafmitte (± Minuten, Standardabweichung ab 3 Nächten) fasst das in einer Zahl zusammen – eine Beschreibung deiner Werte, keine Bewertung.",
    )}`,
  );
}

// ------------------------------------------------------------------ Schlafdauer und HRV

function scatterCard(range) {
  const sc = V().sleepHrvScatter(range.sleep, range.recovery);
  if (!sc.points.length) return "";
  const xs = V().niceRange(sc.points.map((p) => p.x), 60, 120);
  const ys = V().niceRange(sc.points.map((p) => p.y), 10, 20);
  const Wd = 340, H = 220, L = 30, R = 8, T = 12, B = 28;
  const x = (v) => L + ((v - xs.min) / (xs.max - xs.min)) * (Wd - L - R);
  const y = (v) => T + (1 - (v - ys.min) / (ys.max - ys.min)) * (H - T - B);
  const line = sc.r !== null ? V().fitLine(sc.points) : null;
  const body =
    ys.ticks.map((t) => `${hline(L, Wd - R, y(t))}${text(L - 3, y(t) + 3, String(t), "end")}`).join("") +
    xs.ticks.map((t) => text(x(t), H - 14, `${hours(t)} h`)).join("") +
    text(Wd - R, H - 2, "Schlafdauer gemessen", "end") +
    text(L, 8, "HRV ms", "start") +
    (line ? `<line x1="${fx(x(xs.min))}" x2="${fx(x(xs.max))}" y1="${fx(y(line.intercept + line.slope * xs.min))}" y2="${fx(y(line.intercept + line.slope * xs.max))}" class="sleep-viz__fit"/>` : "") +
    sc.points.map((p) => `<circle cx="${fx(x(p.x))}" cy="${fx(y(p.y))}" r="4" fill="${C.sleep}" fill-opacity="0.75">${title(`${D.formatDate(p.date)}: ${dur(p.x)}, HRV ${F(p.y)} ms`)}</circle>`).join("");
  return card(
    "Schlafdauer und HRV",
    nights(sc.points.length),
    `${svg(Wd, H, "Punktwolke Schlafdauer gegen HRV je Nacht", body)}
    <p class="muted small">${esc(sc.r !== null ? `r = ${F(sc.r, 2)} aus ${nights(sc.points.length)}.` : `Für eine Kennzahl des Zusammenhangs braucht es mindestens ${sc.minPairs} Nächte mit beiden Werten (bisher ${sc.points.length}).`)}</p>
    ${info(
      "Jeder Punkt ist eine Nacht: rechts = länger geschlafen, oben = höhere mittlere HRV (RMSSD aus Nightly Recharge). Antippen eines Punkts zeigt Datum und Werte. Ab 10 Nächten erscheinen eine Ausgleichsgerade und der Korrelationskoeffizient r.",
      "r liegt zwischen −1 und +1: nahe +1 = längere Nächte gingen bei dir mit höherer HRV einher, nahe 0 = kein erkennbarer Zusammenhang. Das ist eine Beobachtung in deinen Daten, kein Nachweis einer Ursache – HRV hängt auch von Training, Alkohol, Krankheit und Stress ab.",
    )}`,
  );
}

// ------------------------------------------------------------------ Koffein und Schlafdauer

function caffeineCard(range, logs, contextFrom) {
  const V0 = V();
  const split = V0.caffeineSleepSplit(logs.map((l) => ({ date: l.date, sleepMin: l.sleepMin })), range.context, contextFrom);
  if (!split.nights.length) return "";
  const ys = V0.niceRange(split.nights.map((n) => n.sleepMin), 60, 120);
  const Wd = 340, H = 220, L = 30, R = 6, T = 8, B = 30;
  const y = (v) => T + (1 - (v - ys.min) / (ys.max - ys.min)) * (H - T - B);
  const colW = (Wd - L - R) / 2;
  const late = V0.LATE_CAFFEINE;
  const groups = [
    { late: false, label: `vor ${late} oder keins`, color: C.sleep, stat: split.rest },
    { late: true, label: `ab ${late} Uhr`, color: C.caffeine, stat: split.late },
  ];
  const body =
    ys.ticks.map((t) => `${hline(L, Wd - R, y(t))}${text(L - 3, y(t) + 3, `${hours(t)} h`, "end")}`).join("") +
    groups
      .map((g, gi) => {
        const cx = L + colW * gi + colW / 2;
        const pts = split.nights.filter((n) => n.late === g.late);
        return (
          pts
            .map((n, k) => {
              const j = ((k % 7) - 3) * (colW / 22);
              return `<circle cx="${fx(cx + j)}" cy="${fx(y(n.sleepMin))}" r="4" fill="${g.color}" fill-opacity="0.7">${title(`${D.formatDate(n.date)}: ${dur(n.sleepMin)}${n.lastMinute !== null ? `, letztes Koffein am Vortag ${V0.clockText(n.lastMinute)} Uhr` : ", kein Koffein am Vortag eingetragen"}${n.mg !== null ? ` (${F(n.mg)} mg)` : ""}`)}</circle>`;
            })
            .join("") +
          (g.stat.meanMin !== null ? `<line x1="${fx(cx - colW * 0.32)}" x2="${fx(cx + colW * 0.32)}" y1="${fx(y(g.stat.meanMin))}" y2="${fx(y(g.stat.meanMin))}" class="sleep-viz__groupmean"/>` : "") +
          text(cx, H - 16, "Letztes Koffein") +
          text(cx, H - 4, `${g.label} (${g.stat.count})`)
        );
      })
      .join("");
  const diff = split.difference !== null ? ` · Unterschied ${split.difference >= 0 ? "+" : "−"}${dur(Math.abs(split.difference))}` : ` · Unterschied erst ab ${V0.MIN_GROUP} Nächten je Gruppe`;
  return card(
    "Koffein und Schlafdauer",
    nights(split.nights.length),
    `${svg(Wd, H, "Schlafdauer nach spätem Koffein und ohne", body)}
    <p class="muted small">Ø ohne spätes Koffein: <strong>${esc(dur(split.rest.meanMin))}</strong> · Ø nach Koffein ab ${late} Uhr: <strong>${esc(dur(split.late.meanMin))}</strong>${esc(diff)}</p>
    ${info(
      `Jeder Punkt ist eine Nacht aus dem Schlafprotokoll (Schlafdauer ohne Nickerchen). Links Nächte, vor denen dein letztes eingetragenes Koffein vor ${late} Uhr lag oder an dem Tag keins eingetragen ist, rechts Nächte nach Koffein ab ${late} Uhr. Der waagrechte Strich ist der Mittelwert der Gruppe. Antippen eines Punkts zeigt Uhrzeit und Menge.`,
      "Der Vergleich zeigt, ob deine Nächte nach spätem Koffein im Mittel kürzer waren. Es ist eine Beobachtung, kein Nachweis einer Ursache: Späte Tage unterscheiden sich oft auch anders (Termine, Training, Licht). Tage ohne Koffein-Eintrag zählen links – trage Koffein vollständig ein, damit der Vergleich stimmt.",
      "Koffein trägst du unter Nutrition ein; die Uhrzeit der letzten Einnahme zählt.",
    )}`,
  );
}

// ------------------------------------------------------------------ niedrigste HF und HRV

function heartCard(range) {
  const list = V().heartNights(range.sleep, range.recovery);
  if (list.length < 2) return "";
  const hr = list.flatMap((n, i) => (n.lowestHr === null ? [] : [{ i, v: n.lowestHr, date: n.date }]));
  const hrv = list.flatMap((n, i) => (n.hrvMs === null ? [] : [{ i, v: n.hrvMs, date: n.date }]));
  const hs = V().niceRange(hr.map((p) => p.v), 5, 10);
  const vs = V().niceRange(hrv.map((p) => p.v), 10, 20);
  const Wd = 340, H = 190, L = 28, R = 30, T = 8, B = 18;
  const x = (i) => L + (i / (list.length - 1)) * (Wd - L - R);
  const yH = (v) => T + (1 - (v - hs.min) / (hs.max - hs.min)) * (H - T - B);
  const yV = (v) => T + (1 - (v - vs.min) / (vs.max - vs.min)) * (H - T - B);
  const path = (pts, y) => pts.map((p, k) => `${k ? "L" : "M"}${fx(x(p.i))},${fx(y(p.v))}`).join(" ");
  const ev = every(list.length, 7);
  const avg = (pts) => (pts.length ? pts.reduce((a, p) => a + p.v, 0) / pts.length : null);
  const body =
    hs.ticks.map((t) => `${hline(L, Wd - R, yH(t))}${text(L - 3, yH(t) + 3, String(t), "end", ` fill="${C.sleep}"`)}`).join("") +
    vs.ticks.map((t) => text(Wd - R + 4, yV(t) + 3, String(t), "start")).join("") +
    list.map((n, i) => (i % ev === 0 ? text(x(i), H - 5, shortDate(n.date)) : "")).join("") +
    (hr.length > 1 ? `<path d="${path(hr, yH)}" fill="none" stroke="${C.sleep}" stroke-width="1.8"/>` : "") +
    (hrv.length > 1 ? `<path d="${path(hrv, yV)}" fill="none" stroke="${C.recovery}" stroke-width="1.8"/>` : "") +
    hr.map((p) => `<circle cx="${fx(x(p.i))}" cy="${fx(yH(p.v))}" r="2.8" fill="${C.sleep}">${title(`${D.formatDate(p.date)}: niedrigste HF ${F(p.v)} /min`)}</circle>`).join("") +
    hrv.map((p) => `<circle cx="${fx(x(p.i))}" cy="${fx(yV(p.v))}" r="2.8" fill="${C.recovery}">${title(`${D.formatDate(p.date)}: HRV ${F(p.v)} ms`)}</circle>`).join("");
  const a = avg(hr);
  const b = avg(hrv);
  return card(
    "Niedrigste Herzfrequenz und HRV",
    `Ø ${a !== null ? `${F(a)} /min` : "–"} · Ø ${b !== null ? `${F(b)} ms` : "–"}`,
    `${svg(Wd, H, "Niedrigste Herzfrequenz und HRV je Nacht", body)}
    ${legend([
      { label: "Niedrigste Herzfrequenz (/min, links)", color: C.sleep },
      { label: "HRV RMSSD (ms, rechts)", color: C.recovery },
    ])}
    ${info(
      "Je gemessener Nacht die niedrigste Herzfrequenz (aus den Herzfrequenzwerten der Uhr) und die mittlere HRV aus Nightly Recharge. Zwei Skalen: links Schläge pro Minute, rechts Millisekunden. Antippen eines Punkts zeigt den Wert.",
      "Beide Werte schwanken von Nacht zu Nacht. Aussagekräftig ist der Verlauf im Vergleich zu deinem eigenen Mittel (oben rechts): Liegt die niedrigste Herzfrequenz über mehrere Nächte höher oder die HRV niedriger als sonst, kann das z. B. mit Belastung, spätem Essen, Alkohol oder Infekt zusammenfallen – das ist eine Beobachtung, keine Diagnose.",
    )}`,
  );
}

/**
 * Karten für viewSleep in derselben Reihenfolge und mit denselben Kennungen wie am PC.
 * `wearable` = wearableOf(catalog) (alle Tage), `from`/`to` = Zeitraum, `logs` = Schlafprotokoll.
 */
export function sleepVizCards(wearable, { from, to, logs, goalMin, pick }) {
  if (!D.sleepVisual) return [];
  const range = {
    ...wearable,
    sleep: wearable.sleep.filter((s) => s.date >= from && s.date <= to),
    recovery: wearable.recovery.filter((r) => r.date >= from && r.date <= to),
  };
  const contextFrom = D.addDaysIso(from, -1);
  return [
    { id: "viz-hypnogram", node: hypnogramCard(range, pick) },
    { id: "viz-recharge", node: rechargeCard(range) },
    { id: "viz-phase-shares", node: sharesCard(range) },
    { id: "viz-phase-nights", node: phaseNightsCard(range, goalMin) },
    { id: "viz-window", node: windowCard(range) },
    { id: "viz-hrv-scatter", node: scatterCard(range) },
    { id: "viz-caffeine", node: caffeineCard(range, logs, contextFrom) },
    { id: "viz-heart", node: heartCard(range) },
  ].filter((c) => c.node);
}
