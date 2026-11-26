// Details der Tagessumme (1.164.0, wie MacroDetails.tsx am PC 1.0.229): Fett, Protein und
// Kohlenhydrate – Aufteilung, je Mahlzeit, woher und Verlauf der letzten 14 Tage. Rechnung aus
// `D.macroDetails` (gemeinsam mit dem PC).

import * as D from "./pcdomain.js";
import { esc } from "./pcview.js";

const M = () => D.macroDetails;
const F = (v, d = 0) => D.formatNumber(v, d);
const grams = (g) => `${F(g, g < 10 ? 1 : 0)} g`;
const pct = (v) => `${F(v, v < 10 ? 1 : 0)} %`;
const TOP_SOURCES = 6;
const shortDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Farben der Teile (CSS-Klassen in app.css) */
const PART_CLASS = { saturated: "sat", mono: "mono", poly: "poly", trans: "trans", sugar: "sugar", starch: "starch", rest: "rest", total: "total" };

function niceTicks(max) {
  const raw = Math.max(max, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= raw) ?? 10 * pow;
  const n = Math.ceil(Math.max(max, 1) / step);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * step * 10) / 10);
}

const row = (label, note, value, share) => `<li class="xs__row"><span class="xs__name">${esc(label)}</span><span class="xs__amount">${esc(note ?? "")}</span>
  <span class="xs__value">${esc(value)}</span><span class="xs__share">${F(share * 100)} %</span>
  <span class="xs__bar" aria-hidden="true"><span style="width:${Math.round(Math.min(1, share) * 100)}%"></span></span></li>`;

function partRows(parts, totalG) {
  return `<ul class="xs">${parts
    .map((p) => row(p.label, p.energyPct !== null ? `${pct(p.energyPct)} der Energie` : "", grams(p.grams), totalG > 0 ? p.grams / totalG : 0))
    .join("")}</ul>`;
}

function missingHtml(parts, unit) {
  const gaps = parts.filter((p) => p.missing.length);
  if (!gaps.length) return "";
  return `<ul class="muted small md__missing">${gaps
    .map(
      (p) =>
        `<li>${esc(p.label)} ohne Angabe bei ${esc(p.missing.slice(0, 3).join(", "))}${p.missing.length > 3 ? ` und ${p.missing.length - 3} weiteren` : ""} (${grams(p.missingMacroG)} ${esc(unit)}, zählt nicht mit)</li>`,
    )
    .join("")}</ul>`;
}

/** Gestapelte Säulen je Tag (Teile), bei Protein gestrichelt 0,8 g je kg */
function historySvg(points, keys, label, reference) {
  const W = 340, H = 150, L = 30, R = 6, T = 8, B = 22;
  const withData = points.filter((p) => p.totalG !== null);
  const ticks = niceTicks(Math.max(...withData.map((p) => p.totalG ?? 0), reference ?? 0));
  const top = ticks[ticks.length - 1];
  const step = (W - L - R) / points.length;
  const bw = Math.max(2, step * 0.62);
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const cx = (i) => L + i * step + step / 2;
  const bars = points
    .map((p, i) => {
      if (p.totalG === null) return "";
      const vals = keys.length === 1 ? { total: p.totalG } : p.values;
      let acc = 0;
      return keys
        .map((k) => {
          const v = vals[k] ?? 0;
          if (!(v > 0)) return "";
          const y1 = y(acc + v);
          const h = y(acc) - y1;
          acc += v;
          return `<rect x="${(cx(i) - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" class="md__bar md__bar--${PART_CLASS[k]}"><title>${esc(D.formatDate(p.date))}: ${esc(grams(v))}</title></rect>`;
        })
        .join("");
    })
    .join("");
  const labels = points
    .map((p, i) => ((points.length - 1 - i) % 3 === 0 ? `<text x="${cx(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${shortDate(p.date)}</text>` : ""))
    .join("");
  const ref = reference ? `<line x1="${L}" x2="${W - R}" y1="${y(reference).toFixed(1)}" y2="${y(reference).toFixed(1)}" class="xh__limit"/>` : "";
  return `<svg class="pc-chart xh" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${F(v)}</text>`).join("")}
    ${bars}${labels}${ref}</svg>`;
}

function detailHtml(input, days, date, k) {
  const m = M();
  const d = m.macroDetail(input, k);
  const label = m.MACRO_DETAIL_LABELS[k];
  const R = m.MACRO_REFERENCES;
  const shown = d.sources.slice(0, TOP_SOURCES);
  const rest = d.sources.slice(TOP_SOURCES);
  const ratio = k === "fat" ? m.omegaRatio(d) : null;
  const points = m.macroHistory(days, date, k, input.foods, input.bls);
  const withData = points.filter((p) => p.totalG !== null);
  const avg = withData.length ? withData.reduce((a, p) => a + p.totalG, 0) / withData.length : 0;
  const keys = k === "fat" ? [...m.FAT_PARTS.map((p) => p.key), "rest"] : k === "carbs" ? [...m.CARB_PARTS.map((p) => p.key), "rest"] : ["total"];
  const partLabel = Object.fromEntries([...m.FAT_PARTS, ...m.CARB_PARTS].map((p) => [p.key, p.label]));
  const reference = k === "protein" && input.weightKg ? input.weightKg * 0.8 : null;
  return `<section class="xd__item" aria-label="${esc(label)}">
    <h4 class="xd__title">${esc(label)}<span class="xd__total">${d.totalG > 0 ? `${grams(d.totalG)} an diesem Tag` : "an diesem Tag nichts erfasst"}${
      d.energyPct !== null && d.totalG > 0 ? ` · ${pct(d.energyPct)} der Energie` : ""
    }${d.perKg !== null ? ` · ${F(d.perKg, 2)} g je kg` : ""}</span></h4>
    <p class="xd__sub">Referenz (DGE): ${esc(R[k])}${k === "fat" ? ` · gesättigt ${esc(R.saturated)} · mehrfach ungesättigt ${esc(R.poly)} · Trans ${esc(R.trans)}` : ""}${k === "carbs" ? ` · Zucker ${esc(R.sugar)}` : ""}</p>
    ${d.parts.length && d.totalG > 0 ? `<p class="md__head">Aufteilung</p>${partRows(d.parts, d.totalG)}${missingHtml(d.parts, label)}` : ""}
    ${
      k === "protein" && d.subParts.length
        ? ["essential", "nonessential"]
            .map((g) => {
              const list = d.subParts.filter((p) => p.group === g);
              return list.length
                ? `<p class="md__head">${g === "essential" ? "Essenzielle Aminosäuren" : "Nicht essenzielle Aminosäuren"}</p>${partRows(list, d.totalG)}`
                : "";
            })
            .join("") +
          `<p class="muted small">Aus dem Aminogramm der Lebensmittel (Hersteller bzw. BLS) und den Supplements; Lebensmittel ohne Angabe zählen nicht mit.</p>`
        : ""
    }
    ${
      k !== "protein" && d.subParts.length
        ? `<p class="md__head">${k === "fat" ? "Mehrfach ungesättigt im Einzelnen" : "Zucker im Einzelnen (nur BLS-Lebensmittel)"}</p>${partRows(d.subParts, d.totalG)}${
            ratio !== null ? `<p class="muted small">Omega-6 zu Omega-3 heute ${F(ratio, 1)} : 1 · Referenz ${esc(R.omega)}</p>` : ""
          }`
        : ""
    }
    ${d.meals.length ? `<p class="md__head">Je Mahlzeit</p><ul class="xs">${d.meals.map((x) => row(x.label, x.time ? `${x.time} Uhr` : "", grams(x.grams), x.share)).join("")}</ul>` : ""}
    ${
      shown.length
        ? `<p class="md__head">Woher (Lebensmittel)</p><ul class="xs">${shown.map((s) => row(s.name, `${F(s.amount)} ${s.unit}`, grams(s.grams), s.share)).join("")}${
            rest.length ? `<li class="muted small xs__more">${rest.length === 1 ? "1 weiteres Lebensmittel" : `${rest.length} weitere Lebensmittel`}: ${grams(rest.reduce((a, s) => a + s.grams, 0))}</li>` : ""
          }</ul>`
        : ""
    }
    ${d.supplementsG > 0 || d.otherG > 0 ? `<p class="muted small">${d.supplementsG > 0 ? `Aus Supplements: ${grams(d.supplementsG)}. ` : ""}${d.otherG > 0 ? `Aus Fasttracking (ohne Aufteilung): ${grams(d.otherG)}.` : ""}</p>` : ""}
    ${
      withData.length
        ? `<p class="xd__sub xd__histhead">Letzte ${m.MACRO_HISTORY_DAYS} Tage aus den Mahlzeiten · Ø ${grams(avg)} an ${withData.length} ${withData.length === 1 ? "Tag" : "Tagen"}</p>
          ${historySvg(points, keys, `${label} der letzten ${m.MACRO_HISTORY_DAYS} Tage in Gramm`, reference)}
          ${keys.length > 1 ? `<p class="md__legend small">${keys.map((x) => `<span><span class="md__swatch md__swatch--${PART_CLASS[x]}" aria-hidden="true"></span>${esc(x === "rest" ? "ohne Angabe" : partLabel[x])}</span>`).join("")}</p>` : ""}`
        : ""
    }
  </section>`;
}

/** „Details“-Knopf und aufgeklappte Details für die Tagessumme */
export function macroDetailsHtml(input, days, date, open) {
  return `<button class="btn sm ghost extras-card__toggle" data-act="macro-toggle" aria-expanded="${open}">Details <span class="extras-card__chev" aria-hidden="true">▾</span></button>
    ${
      open
        ? `<div class="xd md"><p class="card__note">Woher Fett, Protein und Kohlenhydrate an diesem Tag kommen und wie sie sich aufteilen. Je Lebensmittel zählt der eigene Wert, sonst der Wert aus dem BLS (wenn er auf dem Handy liegt); fehlt beides, steht das Lebensmittel unter „ohne Angabe“. Ergänze die Werte beim Lebensmittel unter „Weitere Angaben“.</p>
          ${M().MACRO_DETAIL_KEYS.map((k) => detailHtml(input, days, date, k)).join("")}</div>`
        : ""
    }`;
}
