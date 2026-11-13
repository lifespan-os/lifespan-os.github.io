// LIFESPAN OS Mobil – Bausteine wie in der Desktop-App (1.5.0): Tagessumme gegen Ziele
// (DayGoalSummary), Tagesgrafik (NutritionDayChart), Makroanteile (MacroBreakdown), Balken- und
// Liniendiagramme (BarTrend, TrendChart). Rechnung aus pcdomain.js (= src/domain der Desktop-App).

import * as D from "./pcdomain.js";

/** Farben wie src/ui/theme/tokens.ts */
export const COLOR = {
  ink: "#14233B",
  line: "#DCE3EC",
  lineStrong: "#C3CEDC",
  training: "#2B59C3",
  nutrition: "#9A6210",
  sleep: "#5446B8",
  recovery: "#1E7A72",
  body: "#A8415F",
  protein: "#2B59C3",
  carbs: "#9A6210",
  fat: "#1E7A72",
  water: "#1F6E9C",
  waterSoft: "#D6ECF8",
  danger: "#B42318",
  success: "#1D7048",
};

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const SEGMENTS = {
  protein: { label: "Protein", fill: COLOR.protein },
  carbs: { label: "Kohlenhydrate", fill: COLOR.carbs },
  fat: { label: "Fett", fill: COLOR.fat },
  other: { label: "Sonstiges", fill: COLOR.lineStrong },
};
const MACRO_FILL = { protein: COLOR.protein, carbs: COLOR.carbs, fat: COLOR.fat };

/** Tagessumme gegen die Tagesziele wie `DayGoalSummary.tsx`. */
export function dayGoalHtml({ totals, goal, stepKcal = null, expenditure = null }) {
  const need = D.dailyNeed(goal, stepKcal, expenditure);
  const energy = need ? D.energyGoalView(totals, need.total) : null;
  const needText = D.describeNeed(need);
  const dynamicMissing =
    goal.energyMode === "dynamic" && !need
      ? `Dynamisches Kalorienziel: Gesamtverbrauch noch nicht berechenbar${
          expenditure && expenditure.missing.length > 0 ? ` – es fehlt: ${expenditure.missing.join(", ")}` : ""
        }.`
      : null;
  const dayMacros = D.dayMacroGoals(goal, need, expenditure);
  const macros = D.macroGoalRows(totals, dayMacros);
  const macroNote = D.describeMacroGoals(dayMacros);
  let out = `<div class="day-goal">`;
  if (dynamicMissing) out += `<p class="muted small">${esc(dynamicMissing)}</p>`;
  if (energy) {
    const balance =
      energy.balance.kind === "deficit"
        ? `<span class="balance balance--deficit">Defizit: noch ${esc(D.formatKcal(energy.balance.kcal))} offen</span>`
        : energy.balance.kind === "surplus"
          ? `<span class="balance balance--surplus">Überschuss: ${esc(D.formatKcal(energy.balance.kcal))} über dem Ziel</span>`
          : `<span class="balance balance--exact">Kalorienziel genau erreicht</span>`;
    out += `<div class="day-goal__energy">
      <div class="day-goal__head">
        <p class="day-goal__value"><strong>${esc(D.formatKcal(energy.consumed))}</strong><span class="muted"> von ${esc(D.formatKcal(energy.goal))}</span>
          <span class="muted small"> · ${esc(D.percentText(energy.percentOfGoal))}</span></p>
        ${balance}
      </div>
      ${needText ? `<p class="muted small day-goal__need">${esc(needText)}</p>` : ""}
      <div class="goal-bar goal-bar--energy" role="img" aria-label="${esc(`${D.formatKcal(energy.consumed)} von ${D.formatKcal(energy.goal)} Kalorienziel`)}">
        ${energy.segments.map((s) => `<span class="goal-bar__fill" style="width:${s.percent}%;background:${SEGMENTS[s.key].fill}"></span>`).join("")}
        ${energy.goalMarkerPercent < 100 ? `<span class="goal-bar__marker" style="left:${energy.goalMarkerPercent}%"></span>` : ""}
      </div>
      <ul class="legend">
        ${energy.segments.map((s) => `<li><span class="swatch" style="background:${SEGMENTS[s.key].fill}"></span>${esc(SEGMENTS[s.key].label)} ${esc(D.formatKcal(s.kcal))}</li>`).join("")}
        ${energy.goalMarkerPercent < 100 ? `<li><span class="swatch swatch--marker"></span>Kalorienziel</li>` : ""}
      </ul>
    </div>`;
  }
  if (macros.length) {
    out += `<div class="day-goal__macros">${macros
      .map(
        (m) => `<div class="macro-goal">
        <div class="macro-goal__head"><span class="macro-goal__label">${esc(m.label)}</span>
          <span>${esc(D.formatGrams(m.actual))} <span class="muted">von ${esc(D.formatGrams(m.goal))}</span></span>
          <span class="macro-goal__status ${m.reached ? "is-reached" : ""}">${
            m.reached ? `✓ erreicht (${esc(D.percentText(m.percent))})` : `${esc(D.percentText(m.percent))} · noch ${esc(D.formatGrams(m.remaining))}`
          }</span></div>
        <div class="goal-bar"><span class="goal-bar__fill" style="width:${Math.min(100, m.percent)}%;background:${MACRO_FILL[m.key]}"></span></div>
        ${m.remaining < 0 ? `<p class="muted small macro-goal__over">${esc(D.formatGrams(-m.remaining))} über dem Ziel</p>` : ""}
      </div>`,
      )
      .join("")}
      ${macroNote ? `<p class="muted small day-goal__need">${esc(macroNote)}</p>` : ""}</div>`;
  }
  return `${out}</div>`;
}

/** Wert ohne bzw. mit Ziel wie `Compare` im Tagebuch. */
export function compareHtml(label, value, goal, unit) {
  const fmt = unit === "kcal" ? D.formatKcal : D.formatGrams;
  const p = D.goalProgress(goal, value, unit === "kcal" ? 0 : 1);
  return `<div><dt class="muted">${esc(label)}</dt><dd>${esc(fmt(value))}${goal !== null ? `<span class="of">von ${esc(fmt(goal))}</span>` : ""}${
    p.kind !== "none" ? `<span class="goal-note goal-note--${p.kind}">${esc(D.describeGoalProgress(p, unit))}</span>` : ""
  }</dd></div>`;
}

/** Makroanteile an der Energie wie `MacroBreakdown.tsx`. */
export function macroBreakdownHtml(macros, variant = "full") {
  const shares = D.macroEnergyShares(macros);
  const rows = [
    ["protein", "Protein", macros.proteinG],
    ["carbs", "Kohlenhydrate", macros.carbsG],
    ["fat", "Fett", macros.fatG],
  ];
  return `<div class="macros"><div class="macros__bar">${rows.map(([k]) => `<span style="width:${shares[k]}%;background:${MACRO_FILL[k]}"></span>`).join("")}</div>${
    variant === "shares"
      ? `<ul class="legend">${rows.map(([k, l]) => `<li><span class="swatch" style="background:${MACRO_FILL[k]}"></span>${l} ${shares[k]} % der Energie</li>`).join("")}</ul>`
      : `<dl class="macros__list">${rows
          .map(
            ([k, l, g]) =>
              `<div class="macros__item"><dt><span class="swatch" style="background:${MACRO_FILL[k]}"></span>${l}</dt><dd><span class="macros__grams">${D.formatNumber(g, 0)} g</span><span class="macros__share">${shares[k]} % der Energie</span></dd></div>`,
          )
          .join("")}</dl>`
  }</div>`;
}

/** Tagesgrafik: Ring (Energie) und Balken (Makros) wie `NutritionDayChart.tsx`. */
export function dayChartHtml(chart) {
  const SIZE = 132;
  const STROKE = 14;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const e = chart.energy;
  return `<div class="day-chart">
    <figure class="day-chart__ring">
      <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true">
        <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="${COLOR.line}" stroke-width="${STROKE}"/>
        ${
          e.fraction > 0
            ? `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="${e.over ? COLOR.danger : COLOR.nutrition}" stroke-width="${STROKE}"
                stroke-linecap="${e.fraction < 1 ? "round" : "butt"}" stroke-dasharray="${C * e.fraction} ${C}" transform="rotate(-90 ${SIZE / 2} ${SIZE / 2})"/>`
            : ""
        }
      </svg>
      <figcaption class="day-chart__center"><strong>${D.formatNumber(e.actual, 0)}</strong>
        <span>${e.goal === null ? "kcal" : `von ${D.formatNumber(e.goal, 0)} kcal`}</span>
        ${e.percent !== null ? `<span class="day-chart__pct">${D.formatNumber(e.percent, 0)} %</span>` : ""}</figcaption>
    </figure>
    <ul class="day-chart__bars">${chart.bars
      .map(
        (b) => `<li><div class="day-chart__bar-head"><span><span class="swatch" style="background:${MACRO_FILL[b.key]}"></span>${esc(b.label)}</span>
          <span class="day-chart__value"><strong>${D.formatNumber(b.actual, 0)}</strong>${b.goal !== null ? ` / ${D.formatNumber(b.goal, 0)} g` : " g"}<span class="muted"> · ${b.energyShare} % kcal</span></span></div>
          <span class="day-chart__track ${b.over ? "is-over" : ""}"><span class="day-chart__fill" style="width:${b.width}%;background:${MACRO_FILL[b.key]}"></span></span></li>`,
      )
      .join("")}</ul>
  </div>`;
}

const shortDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Balken je Tag wie `BarTrend.tsx` (Werte 0 = kein Balken). */
export function barTrendSvg(data, { color = COLOR.training, format = (v) => D.formatNumber(v, 0), height = 180, label = "", ticks = null, tickFormat = (v) => D.formatNumber(v, 0) } = {}) {
  const W = 340;
  const H = height;
  const L = 38;
  const R = 6;
  const T = 10;
  const B = 22;
  const max = Math.max(1, ...data.map((d) => d.value));
  // Mit festen Skalenstrichen (wie BarTrend `ticks`): Achse bis zum größten Wert bzw. Strich
  const nice = ticks ? Math.max(max, ...ticks) : niceMax(max);
  const step = (W - L - R) / Math.max(1, data.length);
  const bw = Math.max(2, step * 0.66);
  const y = (v) => T + (1 - v / nice) * (H - T - B);
  const lines = ticks ?? [0, nice / 2, nice];
  const label0 = ticks ? tickFormat : (v) => D.formatNumber(v, 0);
  const every = Math.ceil(data.length / 7);
  return `<svg class="pc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${lines.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${esc(label0(v))}</text>`).join("")}
    ${data
      .map((d, i) => {
        const x = L + i * step + (step - bw) / 2;
        const top = y(d.value);
        return `${d.value > 0 ? `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - top).toFixed(1)}" rx="2" fill="${color}"><title>${esc(D.formatDate(d.date))}: ${esc(format(d.value))}</title></rect>` : ""}
          ${i % every === 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${shortDate(d.date)}</text>` : ""}`;
      })
      .join("")}
  </svg>`;
}

/** Linie über Datumswerte wie `TrendChart.tsx` (optional Mittel-/Trendlinie). */
export function trendSvg(points, { color = COLOR.body, decimals = 1, height = 160, label = "", trend = null } = {}) {
  if (!points.length) return "";
  const W = 340;
  const H = height;
  const L = 40;
  const R = 8;
  const T = 10;
  const B = 22;
  const all = [...points.map((p) => p.value), ...(trend ?? []).map((p) => p.value)];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi === lo) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const t0 = Date.parse(`${points[0].date}T12:00:00Z`);
  const t1 = Date.parse(`${points[points.length - 1].date}T12:00:00Z`);
  const x = (d) => L + (t1 === t0 ? (W - L - R) / 2 : ((Date.parse(`${d}T12:00:00Z`) - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = (list) => list.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad];
  return `<svg class="pc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${esc(D.formatNumber(v, decimals))}</text>`).join("")}
    ${trend && trend.length > 1 ? `<polyline points="${line(trend)}" fill="none" stroke="${COLOR.ink}" stroke-width="2.5" stroke-linejoin="round"/>` : ""}
    <polyline points="${line(points)}" fill="none" stroke="${color}" stroke-width="${trend ? 1.4 : 2}" stroke-linejoin="round" ${trend ? 'stroke-opacity=".7"' : ""}/>
    ${points.map((p) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.4" fill="${color}"><title>${esc(D.formatDate(p.date))}: ${esc(D.formatNumber(p.value, decimals))}</title></circle>`).join("")}
    <text x="${L}" y="${H - 6}" text-anchor="start">${shortDate(points[0].date)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${shortDate(points[points.length - 1].date)}</text>
  </svg>`;
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
