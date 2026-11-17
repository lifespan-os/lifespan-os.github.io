// LIFESPAN OS Mobil – Insights → Weekly Reports (1.49.0). Die Berichte erstellt der PC jeden
// Montag (Tabelle `weekly_report` der Exportdatei); hier werden sie gelesen und als PDF
// ausgegeben – mit denselben Bausteinen wie am PC (pcdomain.js = src/domain).

import * as D from "./pcdomain.js";
import * as PS from "./pcsettings.js";

let X = null; // { S, esc, rerender }

export function initWeeklyReports(ctx) {
  X = ctx;
}

/** So viele Berichte stehen zunächst in der Liste. */
export const SHOWN = 6;
export const LOGO_URL = "lifespan-logo-freigestellt.png";

/** Berichte aus der Exportdatei, neueste Woche zuerst (nur lesbare). */
export function reportsOf(catalog) {
  return (catalog?.pc?.weekly_report ?? [])
    .map((row) => ({ row, report: D.parseWeeklyReport(row.data) }))
    .filter((x) => x.report)
    .sort((a, b) => (a.row.week_start < b.row.week_start ? 1 : -1));
}

const secretOn = () => String(PS.effective(X.S.catalog, X.S.pcsettings, "secret_protocols")) === "1";
const state = () => (X.S.weeklyReports ??= { open: null, all: false, pdf: null, message: null, busy: false });

/** Karte für Insights (ganz oben, wie am PC). */
export function weeklyReportsCard(card) {
  const esc = X.esc;
  const st = state();
  const list = reportsOf(X.S.catalog);
  const shown = st.all ? list : list.slice(0, SHOWN);
  const open = list.find((x) => x.row.week_start === st.open)?.report ?? null;
  const rows = shown
    .map(({ row, report }) => {
      const isOpen = st.open === row.week_start;
      return `<li class="wr-row ${isOpen ? "is-open" : ""}">
        <div><strong>KW ${report.week}/${report.year}</strong><span class="muted small">${esc(D.weeklyRangeText(row.week_start, row.week_end))}</span></div>
        <span class="row-actions"><button class="btn sm" data-act="wr-read" data-arg="${esc(row.week_start)}">${isOpen ? "Schließen" : "Lesen"}</button><button class="btn sm blue" data-act="wr-pdf" data-arg="${esc(row.week_start)}" ${st.busy ? "disabled" : ""}>PDF</button></span>
      </li>`;
    })
    .join("");
  const body = `<p class="muted small">Jeden Montag erstellt der PC den Bericht der abgeschlossenen Woche. Nach dem nächsten Export vom PC erscheint er hier.</p>
    ${list.length ? `<ul class="wr-rows">${rows}</ul>` : `<p class="muted">Noch kein Bericht in der geladenen Exportdatei.</p>`}
    ${list.length > SHOWN ? `<button class="linkbtn" data-act="wr-all">${st.all ? "Weniger anzeigen" : `Alle ${list.length} Berichte anzeigen`}</button>` : ""}
    ${st.message ? `<p class="${st.message.tone === "error" ? "warn" : "muted small"}">${esc(st.message.text)}</p>` : ""}
    ${st.pdf ? `<a class="btn blue block" href="${st.pdf.url}" download="${esc(st.pdf.name)}">${esc(st.pdf.name)}</a>` : ""}
    ${open ? `<div class="wr-view">${D.weeklyReportHtml(open, { logoUrl: LOGO_URL, showSuperhuman: secretOn() })}</div>` : ""}`;
  return card("weekly-reports", "Weekly Reports", "jeden Montag", body, { wide: true });
}

// ------------------------------------------------------------------ Logo fürs PDF

let logoCache = null;

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Freigestelltes Logo als PDF-Bild (RGB + Deckkraft); ohne Canvas/Kompression: null. */
function logoImage() {
  logoCache ??= (async () => {
    try {
      const img = new Image();
      img.src = LOGO_URL;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const n = canvas.width * canvas.height;
      const rgb = new Uint8Array(n * 3);
      const alpha = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        rgb[i * 3] = px[i * 4];
        rgb[i * 3 + 1] = px[i * 4 + 1];
        rgb[i * 3 + 2] = px[i * 4 + 2];
        alpha[i] = px[i * 4 + 3];
      }
      return { width: canvas.width, height: canvas.height, data: await deflate(rgb), alpha: await deflate(alpha) };
    } catch {
      return null;
    }
  })();
  return logoCache;
}

async function sharePdf(report) {
  const st = state();
  if (st.pdf) URL.revokeObjectURL(st.pdf.url);
  st.pdf = null;
  st.message = null;
  st.busy = true;
  X.rerender();
  try {
    const name = D.weeklyReportFileName(report);
    const bytes = D.weeklyReportToPdf(report, { logo: await logoImage(), showSuperhuman: secretOn() });
    const blob = new Blob([bytes], { type: "application/pdf" });
    const file = new File([blob], name, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        st.message = { tone: "ok", text: `„${name}“ weitergegeben.` };
        return;
      } catch (e) {
        if (e.name === "AbortError") {
          st.message = { tone: "ok", text: "Abgebrochen." };
          return;
        }
      }
    }
    st.pdf = { url: URL.createObjectURL(blob), name };
    st.message = { tone: "ok", text: "Das PDF ist bereit – zum Öffnen oder Sichern antippen:" };
  } catch (e) {
    st.message = { tone: "error", text: e?.message ?? String(e) };
  } finally {
    st.busy = false;
    X.rerender();
  }
}

export const weeklyReportsActions = {
  "wr-read": (el) => {
    const st = state();
    st.open = st.open === el.dataset.arg ? null : el.dataset.arg;
    X.rerender();
  },
  "wr-all": () => {
    const st = state();
    st.all = !st.all;
    X.rerender();
  },
  "wr-pdf": (el) => {
    const found = reportsOf(X.S.catalog).find((x) => x.row.week_start === el.dataset.arg);
    if (found) void sharePdf(found.report);
  },
};
