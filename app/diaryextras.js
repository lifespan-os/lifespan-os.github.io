// Ballaststoffe, Zucker, Salz im Tagebuch neben dem Wasserhaushalt (wie ExtrasDiaryCard.tsx, 1.114.0):
// Ampel der letzten 7 Tage, „Details“ mit den Quellen des Tages und dem Verlauf der letzten 14 Tage.

import * as P from "./pcdb.js";
import * as D from "./pcdomain.js";
import { esc } from "./pcview.js";

const S = D.nutrientSources;
const F = (v, d = 0) => D.formatNumber(v, d);
const grams = (g) => `${F(g, g < 10 ? 1 : 0)} g`;
const TOP_SOURCES = 6;
const REFERENCE = {
  fiber: "mindestens 30 g",
  sugar: "höchstens 10 % der Energie",
  saturatedFat: "höchstens 10 % der Energie",
  salt: "höchstens 6 g",
};
const shortDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Runde Achsenwerte wie am PC (höchstens 4 Schritte) */
function niceTicks(max) {
  const raw = Math.max(max, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= raw) ?? 10 * pow;
  const n = Math.ceil(Math.max(max, 1) / step);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * step * 10) / 10);
}

/** Säulen je Tag in Ampelfarbe, gestrichelt der Richtwert */
function historySvg(points, label) {
  const W = 340, H = 150, L = 30, R = 6, T = 8, B = 22;
  const withData = points.filter((p) => p.grams !== null);
  const ticks = niceTicks(Math.max(...withData.map((p) => Math.max(p.grams ?? 0, p.limit ?? 0))));
  const top = ticks[ticks.length - 1];
  const step = (W - L - R) / points.length;
  const bw = Math.max(2, step * 0.62);
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const cx = (i) => L + i * step + step / 2;
  const limitPath = points
    .map((p, i) => (p.limit === null ? null : `${cx(i).toFixed(1)},${y(p.limit).toFixed(1)}`))
    .filter(Boolean);
  return `<svg class="pc-chart xh" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${F(v)}</text>`).join("")}
    ${points
      .map((p, i) => {
        const x = cx(i) - bw / 2;
        const bar =
          p.grams !== null && p.grams > 0
            ? `<rect x="${x.toFixed(1)}" y="${y(p.grams).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - y(p.grams)).toFixed(1)}" rx="2" class="xh__bar xh__bar--${p.level ?? "none"}"><title>${esc(D.formatDate(p.date))}: ${esc(grams(p.grams))}${p.limit !== null ? ` (Richtwert ${esc(grams(p.limit))})` : ""}</title></rect>`
            : "";
        const lab = (points.length - 1 - i) % 3 === 0 ? `<text x="${cx(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${shortDate(p.date)}</text>` : "";
        return bar + lab;
      })
      .join("")}
    ${limitPath.length > 1 ? `<polyline points="${limitPath.join(" ")}" class="xh__limit"/>` : ""}
  </svg>`;
}

function detailHtml(days, todayDay, date, k) {
  const sums = S.dayExtrasOf(todayDay);
  const src = S.extraSources(todayDay, k);
  const total = S.gramsOf(sums, k);
  const level = sums.items > 0 ? S.extraLevel(k, total, sums.energyKcal) : null;
  const limit = S.limitGrams(k, sums.energyKcal);
  const relevant = src.sources.filter((x) => x.grams >= 0.05);
  const shown = relevant.slice(0, TOP_SOURCES);
  const rest = relevant.slice(TOP_SOURCES);
  const points = S.extraHistory(days, date, k);
  const withData = points.filter((p) => p.grams !== null);
  const avg = withData.length ? withData.reduce((a, p) => a + p.grams, 0) / withData.length : 0;
  const label = S.EXTRA_LABELS[k];
  return `<section class="xd__item" aria-label="${esc(label)}">
    <h4 class="xd__title">${level ? `<span class="readiness__dot readiness__dot--${level}" aria-hidden="true"></span>` : ""}${esc(label)}
      <span class="xd__total">${sums.items > 0 ? `${grams(total)} an diesem Tag` : "an diesem Tag nichts erfasst"}</span></h4>
    <p class="xd__sub">Richtwert ${REFERENCE[k]}${limit !== null && (k === "sugar" || k === "saturatedFat") ? ` (heute ${grams(limit)} bei ${F(sums.energyKcal)} kcal)` : ""}</p>
    ${
      shown.length && total > 0
        ? `<ul class="xs">${shown
            .map(
              (x) => `<li class="xs__row"><span class="xs__name">${esc(x.name)}</span><span class="xs__amount">${F(x.amount)} ${esc(x.unit)}</span>
                <span class="xs__value">${grams(x.grams)}</span><span class="xs__share">${F(x.share * 100)} %</span>
                <span class="xs__bar" aria-hidden="true"><span style="width:${Math.round(x.share * 100)}%"></span></span></li>`,
            )
            .join("")}${rest.length ? `<li class="muted small xs__more">${rest.length === 1 ? "1 weiteres Lebensmittel" : `${rest.length} weitere Lebensmittel`}: ${grams(rest.reduce((a, x) => a + x.grams, 0))}</li>` : ""}</ul>`
        : sums.items > 0
          ? `<p class="muted small">Keines der Lebensmittel dieses Tages enthält ${esc(label)}.</p>`
          : ""
    }
    ${src.missing.length ? `<p class="muted small">Ohne Angabe (zählt nicht mit): ${esc(src.missing.join(", "))}</p>` : ""}
    ${
      withData.length
        ? `<p class="xd__sub xd__histhead">Letzte ${S.EXTRA_HISTORY_DAYS} Tage · Ø ${grams(avg)} an ${withData.length} ${withData.length === 1 ? "Tag" : "Tagen"} mit Mahlzeiten</p>
          ${historySvg(points, `${label} der letzten ${S.EXTRA_HISTORY_DAYS} Tage in Gramm, gestrichelt der Richtwert`)}`
        : ""
    }
  </section>`;
}

/** Karte „Ballaststoffe, Zucker, Salz“ für das Tagebuch */
export function extrasCard(db, date, open) {
  const days = Array.from({ length: S.EXTRA_HISTORY_DAYS }, (_, i) => P.mealDay(db, D.trends.shiftDays(date, -i)));
  const ex = D.dashboard.extrasCheck(S.weekExtras(days, date));
  const todayDay = days[0];
  return `<section class="card card--nutrition extras-card${open ? " extras-card--open" : ""}"><div class="card__head"><h3>Ballaststoffe, Zucker, Salz</h3><span class="card__meta">Ø letzte 7 Tage</span></div>
    ${
      ex.checks.length === 0
        ? `<p class="muted">Dafür braucht es an mindestens 3 der letzten 7 Tage Mahlzeiten mit Lebensmitteln (bisher ${ex.days}).</p>`
        : `<ul class="readiness__factors">${ex.checks
            .map(
              (c) => `<li><span class="readiness__dot readiness__dot--${c.level}" aria-hidden="true"></span><strong>${esc(c.label)}:</strong> ${esc(c.value)}
            <span class="muted small"> · Richtwert ${esc(c.reference)}</span>${c.missingShare >= 0.2 ? `<span class="muted small"> · bei ${F(c.missingShare * 100)} % der Einträge ohne Angabe</span>` : ""}</li>`,
            )
            .join("")}</ul>`
    }
    <button class="btn sm ghost extras-card__toggle" data-act="extras-toggle" aria-expanded="${open}">Details <span class="extras-card__chev" aria-hidden="true">▾</span></button>
    ${
      open
        ? `<div class="xd"><p class="card__note">Woher die Stoffe an diesem Tag kommen (Lebensmittel aus allen Mahlzeiten zusammengefasst) und wie viel du in den letzten ${S.EXTRA_HISTORY_DAYS} Tagen aufgenommen hast. Balkenfarbe = Ampel des Tages, gestrichelt der Richtwert.</p>
          ${S.EXTRA_KEYS.map((k) => detailHtml(days, todayDay, date, k)).join("")}</div>`
        : ""
    }
    <p class="card__note">Aus den Lebensmitteln deiner Mahlzeiten an ${ex.days} ${ex.days === 1 ? "Tag" : "Tagen"} (ohne Fasttracking). Beim Zucker zählt der gesamte Zucker – auch aus Obst und Milch –, der WHO-Richtwert gilt nur für freie Zucker; die Ampel ist hier also eher streng. Orientierung, keine Ernährungsberatung.</p>
  </section>`;
}
