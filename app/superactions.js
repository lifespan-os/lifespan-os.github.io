// LIFESPAN OS Mobil – Superhuman: Aktionen, Eingaben und Auswahlfelder (aus super.js, 1.75.0).
import * as SD from "./superdata.js";
import * as D from "./pcdomain.js";
import { today } from "./diary.js";
import { CL, CUSTOM, entries, fmt, fmtAmount, HR, nowTime, numberToInput, opts, persist, PR, products, protocolEntries, substances, X } from "./super.js";
import { calcState, newForm, newRow, savedIntervalOf } from "./supertabs.js";
import * as PS from "./pcsettings.js";

// ------------------------------------------------------------------ Aktionen

export async function change(fn, ok) {
  try {
    const r = fn();
    await persist();
    if (ok) X.toast(typeof ok === "function" ? ok(r) : ok);
  } catch (e) {
    X.toast(e.message, true);
  }
  X.rerender();
}

export function setList(fn) {
  const S = X.S;
  change(() => SD.setChecklist(S.super, fn(SD.checklistOf(S.catalog, S.super))));
}

export const superActions = {
  "sh-tab": (el) => {
    X.S.superTab = el.dataset.arg;
    if (X.S.view !== "super") X.go("super");
    else X.rerender();
  },
  "proto-new": () => {
    X.S.protoEdit = { draft: PR().emptyEntryDraft(today(), nowTime()), errors: {}, message: "" };
    X.go("protocol-edit");
  },
  "proto-edit": (el) => {
    const e = protocolEntries().find((x) => x.id === el.dataset.arg);
    if (!e) return;
    X.S.protoEdit = { draft: PR().entryToDraft(e), errors: {}, message: "" };
    X.go("protocol-edit");
  },
  "proto-delete": (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: Eintrag löschen")) return;
    const e = protocolEntries().find((x) => x.id === el.dataset.arg);
    change(() => SD.deleteProtocolEntry(X.S.catalog, X.S.super, el.dataset.arg), e ? `Eintrag vom ${D.formatDate(e.date)} gelöscht.` : "Gelöscht.");
  },
  "proto-save": async () => {
    const S = X.S;
    const f = S.protoEdit;
    f.message = "";
    const r = PR().entryDraftToInput(f.draft);
    if (!r.ok) {
      f.errors = r.errors;
      X.rerender();
      return;
    }
    try {
      const saved = SD.saveProtocolEntry(S.catalog, S.super, r.input, opts());
      await persist();
      // Sofort speichern (1.131.0): Formular bleibt offen und bearbeitet den gespeicherten Eintrag
      if (S.autosaving && saved?.id) {
        f.draft.id = saved.id;
        f.errors = {};
        X.toast(`${saved.substanceName}: ${fmtAmount(saved.amount, saved.unit)} am ${D.formatDate(saved.date)} gespeichert.`);
        return X.rerender();
      }
      S.protoEdit = null;
      S.superTab = "log";
      X.toast(`${saved.substanceName}: ${fmtAmount(saved.amount, saved.unit)} am ${D.formatDate(saved.date)} gespeichert.`);
      X.go("super");
    } catch (e) {
      if (e.field) f.errors = { [e.field]: e.message };
      else f.message = e.message;
      X.rerender();
    }
  },
  "ana-pick": (el) => {
    X.S.anaSubstance = el.dataset.arg;
    X.rerender();
  },
  "sub-new": () => {
    X.S.subEdit = { draft: PR().emptySubstanceDraft(), errors: {}, message: "" };
    X.go("substance-edit");
  },
  "sub-edit": (el) => {
    const s = substances(true).find((x) => x.id === el.dataset.arg);
    if (!s) return;
    X.S.subEdit = { draft: PR().substanceToDraft(s), errors: {}, message: "" };
    X.go("substance-edit");
  },
  "sub-save": async () => {
    const S = X.S;
    const f = S.subEdit;
    f.message = "";
    const r = PR().substanceDraftToInput(f.draft);
    if (!r.ok) {
      f.errors = r.errors;
      X.rerender();
      return;
    }
    try {
      const saved = SD.saveSubstance(S.catalog, S.super, r.input, opts());
      await persist();
      // Sofort speichern (1.131.0): Formular bleibt offen und bearbeitet die gespeicherte Substanz
      if (S.autosaving && saved?.id) {
        f.draft.id = saved.id;
        f.errors = {};
        X.toast(`„${saved.name}“ gespeichert.`);
        return X.rerender();
      }
      S.subEdit = null;
      S.superTab = "substances";
      X.toast(`„${saved.name}“ gespeichert.`);
      X.go("super");
    } catch (e) {
      if (e.field) f.errors = { [e.field]: e.message };
      else f.message = e.message;
      X.rerender();
    }
  },
  "sub-delete": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: Substanz löschen")) return;
    const S = X.S;
    const f = S.subEdit;
    try {
      SD.deleteSubstance(S.catalog, S.super, el.dataset.arg);
      await persist();
      S.subEdit = null;
      S.superTab = "substances";
      X.toast(`„${f.draft.name}“ gelöscht.`);
      X.go("super");
    } catch (e) {
      f.message = e.message;
      X.rerender();
    }
  },
  "hrt-new": () => {
    X.S.hrtEdit = newForm(HR().emptyHrtDraft(today(), nowTime()));
    X.go("hrt-edit");
  },
  "hrt-edit": (el) => {
    const e = entries().find((x) => x.id === el.dataset.arg);
    if (!e) return;
    X.S.hrtEdit = newForm(HR().hrtToDraft(e));
    X.go("hrt-edit");
  },
  "hrt-delete": (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: Eintrag löschen")) return;
    const e = entries().find((x) => x.id === el.dataset.arg);
    change(() => SD.deleteHrtEntry(X.S.catalog, X.S.super, el.dataset.arg), e ? `Eintrag vom ${D.formatDate(e.date)} gelöscht.` : "Gelöscht.");
  },
  "hrt-prefill": () => {
    const f = X.S.hrtEdit;
    f.draft = HR().prefillFromLast(f.draft, entries());
    const fresh = newForm(f.draft);
    f.customSite = fresh.customSite;
    f.customNeedle = fresh.customNeedle;
    X.rerender();
  },
  "hrt-dupe-cancel": () => {
    X.S.hrtEdit.dupes = null;
    X.rerender();
  },
  "hrt-save": async (el) => {
    const S = X.S;
    const f = S.hrtEdit;
    f.message = "";
    const r = HR().hrtDraftToInput(f.draft);
    // Injektionsintervall (1.113.0): leer = kein festes Intervall
    const savedIv = savedIntervalOf(f.draft.hormone);
    const ivText = f.intervalTouched ? (f.intervalText ?? "") : savedIv === null ? "" : String(savedIv);
    const iv = D.hrtSchedule.parseIntervalInput(ivText);
    if (!r.ok || !iv.ok) {
      f.errors = { ...(r.ok ? {} : r.errors), ...(iv.ok ? {} : { interval: iv.error }) };
      f.dupes = null;
      X.rerender();
      return;
    }
    if (el.dataset.arg === "confirmed") f.dupesOk = true;
    else if (!f.dupesOk) {
      const hint = D.hrtDuplicateHint(D.duplicateHrtEntries(r.input, entries()));
      if (hint) {
        f.dupes = hint.text;
        X.rerender();
        return;
      }
    }
    try {
      const saved = SD.saveHrtEntry(S.catalog, S.super, r.input, opts());
      await persist();
      const ivNow = savedIntervalOf(saved.hormone);
      if (iv.days !== ivNow) {
        const key = D.hrtSchedule.HRT_INTERVALS_SETTING;
        const current = PS.effective(S.catalog, S.pcsettings, key);
        S.pcsettings = PS.normSync(S.pcsettings);
        if (PS.setSetting(S.pcsettings, key, D.hrtSchedule.withHrtInterval(current, saved.hormone, iv.days), current)) {
          await X.store.set("pcsettings", S.pcsettings);
        }
      }
      const msg = `${saved.hormone}: ${fmt(saved.amount)} ${saved.unit} am ${D.formatDate(saved.date)} (${HR().STATUS_LABELS[saved.status]}) gespeichert.`;
      // Sofort speichern (1.131.0): Formular bleibt offen und bearbeitet den gespeicherten Eintrag
      if ((S.autosaving || el.dataset.arg === "confirmed") && saved?.id) {
        f.draft.id = saved.id;
        f.errors = {};
        f.dupes = null;
        X.toast(msg);
        return X.rerender();
      }
      S.hrtEdit = null;
      S.superTab = "hrt";
      X.toast(msg);
      X.go("super");
    } catch (e) {
      f.dupes = null;
      if (e.field) f.errors = { [e.field]: e.message };
      else f.message = e.message;
      X.rerender();
    }
  },
  "hrt-product-save": async () => {
    const S = X.S;
    const f = S.hrtEdit;
    const match = HR().matchingProduct(f.draft, products());
    const r = HR().productFromDraft(f.draft, match?.id ?? null);
    if (!r.ok) {
      f.errors = { ...f.errors, ...r.errors };
      X.rerender();
      return;
    }
    try {
      const saved = SD.saveProduct(S.catalog, S.super, r.input, opts());
      await persist();
      f.productNote = { tone: "ok", text: `Präparat „${HR().productLabel(saved)}“ ${match ? "aktualisiert" : "gespeichert"} – bei weiteren Gaben auswählbar.` };
    } catch (e) {
      f.productNote = { tone: "error", text: e.message };
    }
    X.rerender();
  },
  "hrt-product-delete": async (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: Präparat löschen")) return;
    const S = X.S;
    const p = products().find((x) => x.id === el.dataset.arg);
    SD.deleteProduct(S.catalog, S.super, el.dataset.arg);
    await persist();
    S.hrtEdit.productNote = { tone: "ok", text: `Präparat „${p ? HR().productLabel(p) : ""}“ gelöscht. Erfasste Gaben bleiben unverändert.` };
    X.rerender();
  },
  "level-measurand": (el) => {
    X.S.levelMeasurand = el.dataset.arg;
    X.rerender();
  },
  "level-range": (el) => {
    X.S.levelRange = Number(el.dataset.arg);
    X.rerender();
  },
  "calc-row-add": () => {
    calcState().rows.push(newRow());
    X.rerender();
  },
  "calc-row-remove": (el) => {
    const c = calcState();
    c.rows = c.rows.length > 1 ? c.rows.filter((r) => r.key !== el.dataset.arg) : [newRow()];
    X.rerender();
  },
  "calc-mode": (el) => {
    calcState().weekMode = el.dataset.arg;
    X.rerender();
  },
  "calc-take": (el) => {
    calcState().perInjection = el.dataset.arg;
    X.rerender();
  },
  "calc-powder-take": (el) => {
    calcState().rows = [newRow("", el.dataset.arg)];
    X.rerender();
  },
  "chk-editmode": (el) => {
    X.S.chkEdit = X.S.chkEdit === el.dataset.arg ? null : el.dataset.arg;
    X.S.chkItem = null;
    X.S.chkNew = "";
    X.rerender();
  },
  "chk-edit": (el) => {
    const [section, id] = el.dataset.arg.split("|");
    const it = SD.checklistOf(X.S.catalog, X.S.super)[section].find((i) => i.id === id);
    if (it) X.S.chkItem = { section, id, text: it.text };
    X.rerender();
  },
  "chk-edit-cancel": () => {
    X.S.chkItem = null;
    X.rerender();
  },
  "chk-edit-save": () => {
    const it = X.S.chkItem;
    X.S.chkItem = null;
    if (it) setList((l) => CL().editItem(l, it.section, it.id, it.text));
  },
  "chk-move": (el) => {
    const [section, id, dir] = el.dataset.arg.split("|");
    setList((l) => CL().moveItem(l, section, id, Number(dir)));
  },
  "chk-remove": (el) => {
    if (!X.confirmTwice(el, "Löschen?")) return;
    const [section, id] = el.dataset.arg.split("|");
    setList((l) => CL().removeItem(l, section, id));
  },
  "chk-add": (el) => {
    const text = (X.S.chkNew ?? "").trim();
    if (!text) return;
    X.S.chkNew = "";
    setList((l) => CL().addItem(l, el.dataset.arg, text, `u${Date.now().toString(36)}`));
  },
  "chk-reset": (el) => {
    setList((l) => CL().resetTicks(l, el.dataset.arg || undefined));
  },
  "chk-template": (el) => {
    if (!X.confirmTwice(el, "Nochmal tippen: eigene Punkte verwerfen")) return;
    setList((l) => CL().restoreTemplate(l, el.dataset.arg));
  },
};

/** Eingaben (ohne neu zu zeichnen); true = behandelt. */
export function superInput(el) {
  const S = X.S;
  const k = el.dataset ?? {};
  if (k.hrt === "interval" && S.hrtEdit) {
    S.hrtEdit.intervalTouched = true;
    S.hrtEdit.intervalText = el.value;
    if (S.hrtEdit.errors?.interval) S.hrtEdit.errors.interval = "";
    return true;
  }
  if (k.hrt && S.hrtEdit && !["product", "siteSelect", "needleSelect"].includes(k.hrt)) {
    S.hrtEdit.draft[k.hrt] = el.value;
    if (S.hrtEdit.errors?.[k.hrt]) S.hrtEdit.errors[k.hrt] = "";
    return true;
  }
  if (k.pf && S.protoEdit) {
    S.protoEdit.draft[k.pf] = el.value;
    if (S.protoEdit.errors?.[k.pf]) S.protoEdit.errors[k.pf] = "";
    return true;
  }
  if (k.sf && S.subEdit) {
    S.subEdit.draft[k.sf] = k.sf === "archived" ? el.checked : el.value;
    if (S.subEdit.errors?.[k.sf]) S.subEdit.errors[k.sf] = "";
    return true;
  }
  if (k.calc && k.calc !== "product") {
    calcState()[k.calc] = el.value;
    return true;
  }
  if (k.calcrow) {
    const r = calcState().rows.find((x) => x.key === k.calcrow);
    if (r) r[k.f] = el.value;
    return true;
  }
  if (k.chk === "edit" && S.chkItem) {
    S.chkItem.text = el.value;
    return true;
  }
  if (k.chk === "new") {
    S.chkNew = el.value;
    return true;
  }
  return false;
}

/** Nach dem Verlassen eines Textfelds neu zeichnen, ohne den Fokus des nächsten Felds zu verlieren. */
export function rerenderLater() {
  setTimeout(() => {
    const id = document.activeElement?.id;
    X.rerender();
    if (id) document.getElementById(id)?.focus();
  }, 0);
}

/** Auswahlfelder und verlassene Textfelder; true = behandelt. */
export function superChange(el) {
  const S = X.S;
  const k = el.dataset ?? {};
  // Nächste Laborkontrolle: Abstände ändern (1.141.0, wie PC; `ui.lab_schedule`)
  if (k.labsched) {
    const LS = D.labSchedule;
    const key = LS.LAB_SCHEDULE_KEY;
    S.pcsettings = PS.normSync(S.pcsettings);
    const current = PS.effective(S.catalog, S.pcsettings, key);
    const next = LS.parseLabSchedule(JSON.stringify({ ...LS.parseLabSchedule(current), [k.labsched]: Number(el.value) }));
    if (PS.setSetting(S.pcsettings, key, JSON.stringify(next), current)) {
      void X.store.set("pcsettings", S.pcsettings).then(() => X.toast(`Laborabstände: ${next.weeksAfterChange} Wochen, dann alle ${next.months} Monate`));
    }
    X.rerender();
    return true;
  }
  if (k.super === "range") {
    S.hrtRange = el.value;
    X.rerender();
    return true;
  }
  if (k.super === "protoRange" || k.super === "anaRange") {
    S[k.super] = el.value;
    X.rerender();
    return true;
  }
  if (k.pf === "substanceId" && S.protoEdit) {
    // Wie am PC: übliche Anwendung der Substanz vorschlagen, wenn noch keine gewählt ist
    const d = S.protoEdit.draft;
    const s = substances(true).find((x) => x.id === el.value);
    d.substanceId = el.value;
    if (d.route === "" && s?.defaultRoute) d.route = s.defaultRoute;
    S.protoEdit.errors.substanceId = "";
    X.rerender();
    return true;
  }
  if (k.pf === "route" || k.sf === "category" || k.sf === "unit" || k.sf === "defaultRoute" || k.sf === "archived") {
    superInput(el);
    return true;
  }
  if (k.chk === "toggle") {
    setList((l) => CL().toggleItem(l, k.section, k.id));
    return true;
  }
  if (k.hrt && S.hrtEdit) {
    const f = S.hrtEdit;
    if (k.hrt === "product") {
      const p = products().find((x) => x.id === el.value);
      if (p) f.draft = HR().applyProduct(f.draft, p);
      f.productNote = null;
    } else if (k.hrt === "siteSelect") {
      f.customSite = el.value === CUSTOM;
      f.draft.site = el.value === CUSTOM ? "" : el.value;
    } else if (k.hrt === "needleSelect") {
      f.customNeedle = el.value === CUSTOM;
      f.draft.needle = el.value === CUSTOM ? "" : el.value;
    } else {
      superInput(el);
      rerenderLater();
      return true;
    }
    X.rerender();
    return true;
  }
  if (k.calc === "product") {
    const p = products().find((x) => x.id === el.value);
    const c = calcState();
    if (p?.concentrationMgMl != null) c.rows = [newRow(p.hormone, numberToInput(p.concentrationMgMl, 3))];
    if (p?.vialVolumeMl != null) c.vial = numberToInput(p.vialVolumeMl, 2);
    X.rerender();
    return true;
  }
  if (k.calc || k.calcrow) {
    superInput(el);
    rerenderLater();
    return true;
  }
  return superInput(el);
}
