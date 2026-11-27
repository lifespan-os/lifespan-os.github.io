// LIFESPAN OS Mobil – Rechnungen für Heart, gemessene Nächte, Schritte über den Tag und Blutzucker (1.47.0).
// Gebündelt aus src/domain/wearable.ts, src/domain/wearableMore.ts und src/domain/glucose.ts des PCs (esbuild,
// ES2022) – dort ändern und testen, dann neu erzeugen.
// src/domain/wearable.ts
function describeSync(r) {
  const parts = [
    `${r.heartDays} ${r.heartDays === 1 ? "Tag" : "Tage"} Herzfrequenz`,
    `${r.sleepNights} ${r.sleepNights === 1 ? "Nacht" : "N\xE4chte"}`,
    `${r.recoveries}\xD7 n\xE4chtliche Erholung`,
    `${r.exercises} ${r.exercises === 1 ? "Training" : "Trainings"}`
  ];
  if (r.sleepwiseDays > 0) parts.push(`${r.sleepwiseDays} Tage SleepWise`);
  if (r.biosensing > 0) parts.push(`${r.biosensing} Temperatur-/SpO2-/EKG-Messungen`);
  const added = [];
  if (r.sleepLogNew > 0) added.push(`${r.sleepLogNew} neue N\xE4chte im Schlafprotokoll`);
  if (r.sleepLogCompleted > 0)
    added.push(`${r.sleepLogCompleted}\xD7 eigene N\xE4chte erg\xE4nzt (Phasen, Effizienz, Qualit\xE4t)`);
  if (r.hrvNew > 0) added.push(`${r.hrvNew}\xD7 HRV in Body & Longevity`);
  if ((r.restingHrNew ?? 0) > 0)
    added.push(`${r.restingHrNew}\xD7 Ruhepuls in Body & Longevity`);
  if (r.stepsNew > 0) added.push(`${r.stepsNew}\xD7 Schritte in der Alltagsbewegung`);
  if (r.stepsUpdated > 0)
    added.push(`${r.stepsUpdated}\xD7 Schritte in der Alltagsbewegung aktualisiert`);
  return `Abgerufen (${formatShort(r.from)}\u2013${formatShort(r.to)}): ${parts.join(", ")}.${added.length ? ` Erg\xE4nzt: ${added.join(", ")}.` : ""}`;
}
function formatShort(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.` : iso;
}
function clockOf(minute) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function minuteOf(clock) {
  const m = /^(\d{1,2}):(\d{2})/.exec(clock.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}
function nightSeries(json) {
  if (!json) return [];
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    return [];
  }
  if (!obj || typeof obj !== "object") return [];
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const minute = minuteOf(k);
    if (minute === null || typeof v !== "number" || !Number.isFinite(v)) continue;
    out.push({ minute, value: v });
  }
  const order = (m) => m >= 12 * 60 ? m - 1440 : m;
  return out.sort((a, b) => order(a.minute) - order(b.minute));
}
function nightLowestHr(s) {
  const values = nightSeries(s.hrSamples).map((p) => p.value).filter((v) => v >= 25 && v <= 250);
  return values.length ? Math.min(...values) : null;
}
function measuredSleepMin(s) {
  const parts = [s.lightS, s.deepS, s.remS, s.unrecognizedS].filter((x) => x !== null);
  const sum = parts.reduce((a, b) => a + b, 0);
  return parts.length && sum > 0 ? Math.round(sum / 60) : null;
}
function sleepEfficiencyPct(s) {
  if (!s.sleepStart || !s.sleepEnd) return null;
  const parts = [s.lightS, s.deepS, s.remS, s.unrecognizedS].filter((x) => x !== null && x !== void 0);
  if (parts.length === 0) return null;
  const at = (t) => /[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? Date.parse(t) : Date.parse(`${t.slice(0, 19)}Z`);
  const span = (at(s.sleepEnd) - at(s.sleepStart)) / 1e3;
  if (!Number.isFinite(span) || span <= 0) return null;
  const pct = Math.round(parts.reduce((a, b) => a + b, 0) * 100 / span);
  return pct >= 1 && pct <= 100 ? pct : null;
}
function phaseShares(s) {
  if (s.lightS === null || s.deepS === null || s.remS === null) return null;
  const total = s.lightS + s.deepS + s.remS + (s.unrecognizedS ?? 0);
  if (total <= 0) return null;
  const pct = (x) => Math.round(x / total * 1e3) / 10;
  return { light: pct(s.lightS), deep: pct(s.deepS), rem: pct(s.remS) };
}
function mean(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function bedMinute(s) {
  const t = s.sleepStart?.split("T")[1];
  if (!t) return null;
  const m = minuteOf(t);
  if (m === null) return null;
  return m >= 12 * 60 ? m - 1440 : m;
}
function spread(values) {
  if (values.length < 3) return null;
  const avg2 = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - avg2) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
function recentVsBaseline(points, today) {
  const day = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const t = day(today);
  const recent = [];
  const base = [];
  for (const p of points) {
    if (p.value === null) continue;
    const ago = Math.round((t - day(p.date)) / 864e5);
    if (ago >= 0 && ago < 7) recent.push(p.value);
    else if (ago >= 7 && ago < 35) base.push(p.value);
  }
  const r = mean(recent);
  const b = mean(base);
  return {
    recent: r,
    recentCount: recent.length,
    baseline: b,
    baselineCount: base.length,
    difference: r !== null && b !== null && recent.length >= 3 && base.length >= 3 ? r - b : null
  };
}
function zoneMinutes(samples, zones) {
  const byZone = [0, 0, 0, 0, 0];
  let below = 0;
  let total = 0;
  const sorted = [...samples].sort((a, b) => a[0] - b[0]);
  const lowest = zones.length ? Math.min(...zones.map((z) => z.from)) : Infinity;
  sorted.forEach(([minute, bpm], i) => {
    const next = sorted[i + 1];
    const step = next ? Math.min(15, Math.max(1, next[0] - minute)) : 5;
    total += step;
    const zone = [...zones].reverse().find((z) => bpm >= z.from);
    if (zone && zone.zone >= 1 && zone.zone <= 5)
      byZone[zone.zone - 1] = (byZone[zone.zone - 1] ?? 0) + step;
    else if (bpm < lowest) below += step;
  });
  return { byZone, below, total };
}

// src/lib/format.ts
var LOCALE = "de-DE";
var dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});
function formatNumber(value, fractionDigits = 0) {
  if (!Number.isFinite(value)) {
    return "\u2013";
  }
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}
var longDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
});

// src/domain/trends.ts
var DAY_MS = 864e5;
var ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
function utcDay(iso) {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Ung\xFCltiges Datum: "${iso}" (erwartet JJJJ-MM-TT)`);
  const d = /* @__PURE__ */ new Date(0);
  d.setUTCFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getUTCDate() !== Number(m[3]) || d.getUTCMonth() !== Number(m[2]) - 1) {
    throw new Error(`Ung\xFCltiges Datum: "${iso}"`);
  }
  return d.getTime();
}
function isoFromUtc(t) {
  return new Date(t).toISOString().slice(0, 10);
}
function shiftDays(iso, days) {
  return isoFromUtc(utcDay(iso) + days * DAY_MS);
}

// src/domain/insights.ts
var MIN_PAIRS = 10;
var MIN_ABS_R = 0.3;
function pearson(xs, ys) {
  if (xs.length !== ys.length) throw new Error("Beide Reihen m\xFCssen gleich lang sein.");
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
function pairByDate(x, y, lagDays = 0) {
  const xs = new Map(x.map((p) => [p.date, p.value]));
  return y.flatMap((p) => {
    const v = xs.get(shiftDays(p.date, -lagDays));
    return v === void 0 ? [] : [{ date: p.date, x: v, y: p.value }];
  });
}
function describeAssociation(pairs, wording) {
  const n = pairs.length;
  if (n < MIN_PAIRS) {
    return {
      n,
      r: null,
      text: `Noch zu wenige gemeinsame Tage f\xFCr eine Aussage (${n} von mindestens ${MIN_PAIRS}).`
    };
  }
  const r = pearson(
    pairs.map((p) => p.x),
    pairs.map((p) => p.y)
  );
  if (r === null) {
    return { n, r, text: `Die Werte schwanken zu wenig f\xFCr eine Aussage (${n} Tage).` };
  }
  const rText = `r = ${formatNumber(r, 2)}, ${n} Tage`;
  if (Math.abs(r) < MIN_ABS_R) {
    return {
      n,
      r,
      text: `Zwischen ${wording.pair} ist in deinen Daten kein deutlicher Zusammenhang erkennbar (${rText}).`
    };
  }
  const direction = r > 0 ? wording.higher : wording.lower;
  return {
    n,
    r,
    text: `${wording.x} ging in deinen Daten tendenziell mit ${direction} einher (${rText}). Das ist eine Beobachtung, kein Nachweis einer Ursache.`
  };
}

// src/domain/wearableMore.ts
function rechargeStatusLabel(n) {
  const labels = ["sehr schlecht", "schlecht", "beeintr\xE4chtigt", "OK", "gut", "sehr gut"];
  return n !== null && n >= 1 && n <= 6 ? labels[n - 1] ?? null : null;
}
function usualLabel(n) {
  const labels = [
    "deutlich unter \xFCblich",
    "unter \xFCblich",
    "\xFCblich",
    "\xFCber \xFCblich",
    "deutlich \xFCber \xFCblich"
  ];
  return n !== null && n >= 1 && n <= 5 ? labels[n - 1] ?? null : null;
}
var POLAR_LABELS = {
  // Cardio Load
  LOAD_STATUS_NOT_AVAILABLE: "nicht verf\xFCgbar",
  DETRAINING: "R\xFCckgang der Fitness",
  MAINTAINING: "erhaltend",
  PRODUCTIVE: "produktiv",
  OVERREACHING: "\xDCberbelastung",
  // SleepWise
  GRADE_CLASSIFICATION_WEAK: "schwach",
  GRADE_CLASSIFICATION_FAIR: "m\xE4\xDFig",
  GRADE_CLASSIFICATION_STRONG: "stark",
  GRADE_CLASSIFICATION_EXCELLENT: "sehr stark",
  SLEEP_INERTIA_NO_INERTIA: "keine",
  SLEEP_INERTIA_MILD: "leicht",
  SLEEP_INERTIA_MODERATE: "mittel",
  SLEEP_INERTIA_HEAVY: "stark",
  ALERTNESS_LEVEL_VERY_LOW: "sehr niedrig",
  ALERTNESS_LEVEL_LOW: "niedrig",
  ALERTNESS_LEVEL_MEDIUM: "mittel",
  ALERTNESS_LEVEL_HIGH: "hoch",
  ALERTNESS_LEVEL_VERY_HIGH: "sehr hoch",
  CIRCADIAN_BEDTIME_QUALITY_WEAK: "schwach",
  CIRCADIAN_BEDTIME_QUALITY_COMPROMISED: "beeintr\xE4chtigt",
  CIRCADIAN_BEDTIME_QUALITY_CLEARLY_RECOGNIZABLE: "deutlich erkennbar",
  CIRCADIAN_BEDTIME_QUALITY_GOOD: "gut",
  // Biosensing
  SPO2_CLASS_NORMAL: "im \xFCblichen Bereich",
  SPO2_CLASS_LOW_BASELINE: "niedrig",
  SPO2_CLASS_VERY_LOW: "sehr niedrig",
  SPO2_CLASS_UNKNOWN: "unbekannt",
  ECG_HRV_LEVEL_NO_BASELINE: "noch kein Ausgangswert",
  ECG_HRV_LEVEL_BELOW_USUAL: "unter \xFCblich",
  ECG_HRV_LEVEL_USUAL: "\xFCblich",
  ECG_HRV_LEVEL_ABOVE_USUAL: "\xFCber \xFCblich",
  TM_CORE_TEMPERATURE: "K\xF6rperkerntemperatur",
  TM_SKIN_TEMPERATURE: "Hauttemperatur"
};
function polarLabel(code) {
  if (!code) return null;
  const known = POLAR_LABELS[code] ?? POLAR_LABELS[code.replace(/^LOAD_STATUS_/, "")];
  if (known) return known;
  const words = code.replace(
    /^(LOAD_STATUS|GRADE_CLASSIFICATION|SLEEP_INERTIA|ALERTNESS_LEVEL|CIRCADIAN_BEDTIME_QUALITY|SPO2_CLASS|ECG_HRV_LEVEL|TM)_/,
    ""
  ).toLowerCase().replace(/_/g, " ");
  return words || null;
}
function stageOf(code) {
  if (code === 0) return "wake";
  if (code === 1) return "rem";
  if (code === 2 || code === 3) return "light";
  if (code === 4) return "deep";
  if (code === 5) return "unknown";
  return null;
}
var STAGE_LABEL = {
  wake: "Wach",
  rem: "REM",
  light: "Leicht",
  deep: "Tief",
  unknown: "Unbekannt"
};
var evening = (m) => m >= 12 * 60 ? m - 1440 : m;
function hypnogramSegments(s) {
  if (!s.hypnogram) return [];
  let obj;
  try {
    obj = JSON.parse(s.hypnogram);
  } catch {
    return [];
  }
  if (!obj || typeof obj !== "object") return [];
  const points = [];
  for (const [k, v] of Object.entries(obj)) {
    const m = minuteOf(k);
    const stage = typeof v === "number" ? stageOf(v) : null;
    if (m === null || stage === null) continue;
    points.push({ minute: evening(m), stage });
  }
  points.sort((a, b) => a.minute - b.minute);
  const endClock = s.sleepEnd?.split("T")[1];
  const endMinute = endClock ? minuteOf(endClock) : null;
  const end = endMinute === null ? null : evening(endMinute);
  const out = [];
  points.forEach((p, i) => {
    const next = points[i + 1];
    const to = next ? next.minute : end !== null && end > p.minute ? end : p.minute + 0.5;
    const last = out[out.length - 1];
    if (last && last.stage === p.stage && last.to === p.minute) last.to = to;
    else out.push({ stage: p.stage, from: p.minute, to });
  });
  return out;
}
function parseRows(json) {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((r) => Array.isArray(r)) : [];
  } catch {
    return [];
  }
}
var numOrNull = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
function exerciseZones(json) {
  return parseRows(json).flatMap((r) => {
    const zone = numOrNull(r[0]);
    const seconds = numOrNull(r[3]);
    return zone === null || seconds === null ? [] : [{ zone, lower: numOrNull(r[1]), upper: numOrNull(r[2]), seconds }];
  });
}
function exerciseHr(json) {
  return parseRows(json).flatMap((r) => {
    const second = numOrNull(r[0]);
    const bpm = numOrNull(r[1]);
    return second === null || bpm === null ? [] : [{ second, bpm }];
  });
}
function sportLabel(sport, detailed) {
  const raw = (detailed || sport || "Training").replace(/_/g, " ").toLowerCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
function biosensingOf(list, kind) {
  return list.filter((b) => b.kind === kind).sort((a, b) => (a.measuredAt ?? a.date).localeCompare(b.measuredAt ?? b.date));
}
function detailSamples(b) {
  if (!b.details) return [];
  try {
    const d = JSON.parse(b.details);
    if (!Array.isArray(d.samples)) return [];
    return d.samples.flatMap((r) => {
      if (!Array.isArray(r)) return [];
      const ms = numOrNull(r[0]);
      const value = numOrNull(r[1]);
      return ms === null || value === null ? [] : [{ ms, value }];
    });
  } catch {
    return [];
  }
}
var DAY = 864e5;
var toDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
function compare(key, label, unit, digits, higherIs, points, today) {
  const t = toDay(today);
  let value = null;
  const base = [];
  for (const p of points) {
    const ago = Math.round((t - toDay(p.date)) / DAY);
    if (ago === 0) value = p.value;
    else if (ago >= 1 && ago <= 28) base.push(p.value);
  }
  const baseline = mean(base);
  return {
    key,
    label,
    unit,
    digits,
    today: value,
    baseline,
    baselineCount: base.length,
    difference: value !== null && baseline !== null && base.length >= 5 ? value - baseline : null,
    higherIs
  };
}
function recoveryToday(r, today) {
  const hrv = r.recovery.flatMap(
    (x) => x.hrvMs === null ? [] : [{ date: x.date, value: x.hrvMs }]
  );
  const lowest = r.sleep.flatMap((s) => {
    const v = nightLowestHr(s);
    return v === null ? [] : [{ date: s.date, value: v }];
  });
  const restHr = r.recovery.flatMap(
    (x) => x.hrAvg === null ? [] : [{ date: x.date, value: x.hrAvg }]
  );
  const sleepMin = r.sleep.flatMap((s) => {
    const v = measuredSleepMin(s);
    return v === null ? [] : [{ date: s.date, value: v / 60 }];
  });
  const breathing = r.recovery.flatMap(
    (x) => x.breathingAvg === null ? [] : [{ date: x.date, value: x.breathingAvg }]
  );
  const skin = r.biosensing.flatMap(
    (b) => b.kind === "skin_temp" && b.value !== null ? [{ date: b.date, value: b.value }] : []
  );
  const rows = [
    compare("hrv", "HRV (RMSSD)", "ms", 0, "better", hrv, today),
    compare("restHr", "\xD8 Herzfrequenz in der Nacht", "/min", 0, "worse", restHr, today),
    compare("lowestHr", "Niedrigste Herzfrequenz", "/min", 0, "worse", lowest, today),
    compare("sleep", "Gemessener Schlaf", "h", 1, "neutral", sleepMin, today),
    compare("breathing", "Atemfrequenz", "/min", 1, "neutral", breathing, today),
    compare("skinTemp", "Hauttemperatur im Schlaf", "\xB0C", 1, "neutral", skin, today)
  ];
  return rows.filter((row) => row.today !== null || row.baseline !== null);
}
function polarDayLabels(r, today) {
  const out = [];
  const rec = r.recovery.find((x) => x.date === today);
  const recharge = rechargeStatusLabel(rec?.rechargeStatus ?? null);
  if (recharge) out.push({ label: "Nightly Recharge", value: recharge });
  const ans = usualLabel(rec?.ansChargeStatus ?? null);
  if (ans) out.push({ label: "Erholung des Nervensystems (ANS)", value: ans });
  const night = r.sleep.find((s) => s.date === today);
  const charge = usualLabel(night?.sleepCharge ?? null);
  if (charge) out.push({ label: "Sleep Charge", value: charge });
  const day = [...r.days].reverse().find((d) => d.date <= today && d.cardioStatus);
  const status = polarLabel(day?.cardioStatus ?? null);
  if (status && day?.cardioStatus !== "LOAD_STATUS_NOT_AVAILABLE")
    out.push({ label: "Belastungsstatus", value: status });
  const sw = r.sleepwise.find((x) => x.date === today);
  const grade = polarLabel(sw?.gradeClass ?? null);
  if (grade) out.push({ label: "Wachheit (SleepWise)", value: grade });
  return out;
}
function loadSeries(days) {
  return days.filter(
    (d) => d.cardioLoad !== null || d.strain !== null || d.tolerance !== null || d.cardioLoadRatio !== null
  ).map((d) => ({
    date: d.date,
    load: d.cardioLoad,
    strain: d.strain,
    tolerance: d.tolerance,
    ratio: d.cardioLoadRatio ?? (d.strain !== null && d.tolerance ? d.strain / d.tolerance : null),
    status: d.cardioStatus
  })).sort((a, b) => a.date.localeCompare(b.date));
}
function energyCompare(days, appEnergy) {
  const app = new Map(appEnergy.map((e) => [e.date, e.totalKcal]));
  const dates = /* @__PURE__ */ new Set([...days.filter((d) => d.calories !== null).map((d) => d.date)]);
  return [...dates].sort().map((date) => {
    const w = days.find((d) => d.date === date && d.calories !== null);
    const a = app.get(date) ?? null;
    const watch = w?.calories ?? null;
    return {
      date,
      app: a,
      watch,
      watchActive: w?.activeCalories ?? null,
      difference: a !== null && watch !== null ? watch - a : null
    };
  });
}
function nightTargets(r) {
  return [
    {
      key: "hrv",
      label: "HRV in der Nacht",
      pair: "deiner HRV in der folgenden Nacht",
      series: r.recovery.flatMap(
        (x) => x.hrvMs === null ? [] : [{ date: x.date, value: x.hrvMs }]
      )
    },
    {
      key: "lowestHr",
      label: "Niedrigste Herzfrequenz",
      pair: "deiner niedrigsten Herzfrequenz in der folgenden Nacht",
      series: r.sleep.flatMap((s) => {
        const v = nightLowestHr(s);
        return v === null ? [] : [{ date: s.date, value: v }];
      })
    },
    {
      key: "sleepScore",
      label: "Schlafwert (Polar)",
      pair: "deinem Schlafwert in der folgenden Nacht",
      series: r.sleep.flatMap(
        (s) => s.sleepScore === null ? [] : [{ date: s.date, value: s.sleepScore }]
      )
    },
    {
      key: "sleepMin",
      label: "Gemessener Schlaf",
      pair: "deiner gemessenen Schlafdauer in der folgenden Nacht",
      series: r.sleep.flatMap((s) => {
        const v = measuredSleepMin(s);
        return v === null ? [] : [{ date: s.date, value: v }];
      })
    }
  ];
}
function daySources(context, days, extra = []) {
  const clock = (c) => c ? minuteOf(c) : null;
  const fromCtx = (pick) => context.flatMap((c) => {
    const v = pick(c);
    return v === null ? [] : [{ date: c.date, value: v }];
  });
  return [
    {
      key: "caffeine",
      x: "Mehr Koffein am Tag",
      label: "Koffein (mg)",
      series: fromCtx((c) => c.caffeineMg),
      higherWord: "mehr"
    },
    {
      key: "caffeineLast",
      x: "Sp\xE4teres letztes Koffein",
      label: "Letztes Koffein (Uhrzeit)",
      series: fromCtx((c) => clock(c.caffeineLast)),
      higherWord: "sp\xE4ter"
    },
    {
      key: "mealLast",
      x: "Eine sp\xE4tere letzte Mahlzeit",
      label: "Letzte Mahlzeit (Uhrzeit)",
      series: fromCtx((c) => clock(c.mealLast)),
      higherWord: "sp\xE4ter"
    },
    {
      key: "cardioLoad",
      x: "H\xF6here Trainingsbelastung (Uhr)",
      label: "Cardio Load (Uhr)",
      series: days.flatMap(
        (d) => d.cardioLoad === null ? [] : [{ date: d.date, value: d.cardioLoad }]
      ),
      higherWord: "mehr"
    },
    ...extra
  ];
}
function nightAssociations(sources, targets) {
  const out = [];
  for (const s of sources) {
    for (const t of targets) {
      const pairs = pairByDate(s.series, t.series, 1);
      const association = describeAssociation(pairs, {
        x: s.x,
        pair: `${s.label.replace(/ \(.*\)$/, "")} und ${t.pair}`,
        higher: `h\xF6heren Werten bei ${t.label}`,
        lower: `niedrigeren Werten bei ${t.label}`
      });
      if (association.r !== null) out.push({ source: s.label, target: t.label, association });
    }
  }
  return out.sort((a, b) => Math.abs(b.association.r ?? 0) - Math.abs(a.association.r ?? 0));
}
function supplementComparisons(context, targets, minEach = 5) {
  const names = [...new Set(context.flatMap((c) => c.supplements))].sort(
    (a, b) => a.localeCompare(b, "de")
  );
  const taken = new Map(context.map((c) => [c.date, new Set(c.supplements)]));
  const prev = (iso) => new Date(toDay(iso) - DAY).toISOString().slice(0, 10);
  const out = [];
  for (const name of names) {
    for (const t of targets) {
      const withV = [];
      const withoutV = [];
      for (const p of t.series) {
        const set = taken.get(prev(p.date));
        if (!set || set.size === 0) continue;
        if (set.has(name)) withV.push(p.value);
        else withoutV.push(p.value);
      }
      const w = mean(withV);
      const wo = mean(withoutV);
      if (w === null || wo === null || withV.length < minEach || withoutV.length < minEach)
        continue;
      out.push({
        name,
        target: t.label,
        withMean: w,
        withCount: withV.length,
        withoutMean: wo,
        withoutCount: withoutV.length,
        difference: w - wo
      });
    }
  }
  return out;
}
function localClock(utc, offsetMin) {
  if (!utc) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(utc);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + (offsetMin ?? 0) * 6e4;
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function bedtimeOffset(actual, preferred) {
  const a = actual ? minuteOf(actual) : null;
  const p = preferred ? minuteOf(preferred) : null;
  if (a === null || p === null) return null;
  let d = evening(a) - evening(p);
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
}
function sleepRatingLabel(n) {
  const labels = ["sehr schlecht", "schlecht", "okay", "gut", "sehr gut"];
  return n != null && n >= 1 && n <= 5 ? labels[n - 1] ?? null : null;
}
function continuityClassLabel(n) {
  const labels = [
    "sehr zerst\xFCckelt",
    "zerst\xFCckelt",
    "eher durchgehend",
    "durchgehend",
    "sehr durchgehend"
  ];
  return n != null && n >= 1 && n <= 5 ? labels[n - 1] ?? null : null;
}
function stepSeries(json) {
  return parseRows(json ?? null).flatMap((r) => {
    const minute = numOrNull(r[0]);
    const steps = numOrNull(r[1]);
    return minute === null || steps === null || minute < 0 || minute >= 1440 ? [] : [{ minute, steps }];
  });
}
var STEP_SLOTS = 288;
var MIN_STEP_DAYS = 3;
function cumulativeSteps(series) {
  const slots = new Array(STEP_SLOTS).fill(0);
  for (const s of series) {
    const i = Math.floor(s.minute / 5);
    if (i >= 0 && i < STEP_SLOTS) slots[i] = (slots[i] ?? 0) + s.steps;
  }
  let sum = 0;
  return slots.map((v) => sum += v);
}
function medianOf(values) {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
function stepDayCompare(todaySamples, pastSamples, nowMinute = 1440) {
  const todaySeries = stepSeries(todaySamples);
  const past = pastSamples.map(stepSeries).filter((s) => s.length > 0).map(cumulativeSteps);
  if (todaySeries.length === 0 && past.length < MIN_STEP_DAYS) return null;
  const today = todaySeries.length > 0 ? cumulativeSteps(todaySeries) : null;
  const now = Math.max(0, Math.min(1440, Math.floor(nowMinute / 5) * 5));
  const withMedian = past.length >= MIN_STEP_DAYS;
  const points = [
    { minute: 0, today: today ? 0 : null, median: withMedian ? 0 : null }
  ];
  for (let i = 0; i < STEP_SLOTS; i++) {
    const minute = (i + 1) * 5;
    points.push({
      minute,
      today: today && minute <= now ? today[i] : null,
      median: withMedian ? medianOf(past.map((c) => c[i])) : null
    });
  }
  const at = points.find((p) => p.minute === now) ?? points[0];
  return {
    points,
    nowMinute: now,
    todayNow: at?.today ?? null,
    medianNow: at?.median ?? null,
    days: past.length
  };
}
var ACTIVITY_ZONE_LABEL = ["Schlaf", "sitzend", "leicht", "mittel", "intensiv"];
function zoneSegments(json) {
  const pts = parseRows(json ?? null).flatMap((r) => {
    const m = numOrNull(r[0]);
    const z = numOrNull(r[1]);
    return m === null || z === null ? [] : [{ m, z }];
  }).sort((a, b) => a.m - b.m);
  return pts.map((p, i) => ({ from: p.m, to: pts[i + 1]?.m ?? 1440, zone: p.z }));
}
function dayTimeline(heart, steps) {
  const hr = /* @__PURE__ */ new Map();
  for (const [m, bpm] of heart) {
    const k = Math.floor(m / 5) * 5;
    const e = hr.get(k) ?? { sum: 0, n: 0 };
    e.sum += bpm;
    e.n += 1;
    hr.set(k, e);
  }
  const st = /* @__PURE__ */ new Map();
  for (const s of steps) {
    const k = Math.floor(s.minute / 5) * 5;
    st.set(k, (st.get(k) ?? 0) + s.steps);
  }
  const out = [];
  for (let m = 0; m < 1440; m += 5) {
    const h = hr.get(m);
    out.push({
      minute: m,
      hr: h ? Math.round(h.sum / h.n) : null,
      steps: st.has(m) ? st.get(m) : null
    });
  }
  return out;
}
function signedText(value, digits) {
  const rounded = Number(Math.abs(value).toFixed(digits));
  const sign = rounded === 0 ? "\xB1" : value > 0 ? "+" : "\u2212";
  return `${sign}${rounded.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
function secondsInZones(points, zones, capS = 15) {
  const byZone = [0, 0, 0, 0, 0];
  let below = 0;
  let total = 0;
  if (!zones.length) return { byZone, below, total };
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const gaps = sorted.slice(1).map((p, i) => p[0] - sorted[i][0]).filter((g) => g > 0);
  const usual = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 1;
  const ordered = [...zones].sort((a, b) => b.from - a.from);
  sorted.forEach(([second, bpm], i) => {
    const next = sorted[i + 1];
    const step = Math.min(capS, next ? Math.max(0, next[0] - second) : usual);
    total += step;
    const z = ordered.find((x) => bpm >= x.from);
    if (z && z.zone >= 1 && z.zone <= 5) byZone[z.zone - 1] = (byZone[z.zone - 1] ?? 0) + step;
    else below += step;
  });
  return { byZone, below, total };
}
function zoneWeeks(items, zones) {
  const monday = (iso) => {
    const t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    const wd = (new Date(t).getUTCDay() + 6) % 7;
    return new Date(t - wd * 864e5).toISOString().slice(0, 10);
  };
  const weeks = /* @__PURE__ */ new Map();
  for (const it of items) {
    const watch = exerciseZones(it.heart.zones);
    let secs = null;
    if (watch.length) {
      secs = [0, 0, 0, 0, 0];
      for (const z of watch) if (z.zone >= 1 && z.zone <= 5) secs[z.zone - 1] += z.seconds;
    } else if (zones.length && it.heart.points.length > 1) {
      secs = secondsInZones(it.heart.points, zones, it.heart.kind === "day" ? 900 : 15).byZone;
    }
    if (!secs) continue;
    const key = monday(it.date);
    const w = weeks.get(key) ?? { week: key, minutes: [0, 0, 0, 0, 0], units: 0 };
    secs.forEach((s, i) => w.minutes[i] = (w.minutes[i] ?? 0) + s / 60);
    w.units += 1;
    weeks.set(key, w);
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
}

// src/domain/glucose.ts
var MMOL_FACTOR = 18.016;
var mmol = (mgDl) => mgDl / MMOL_FACTOR;
function splitCsv(line, sep) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function sepOf(header) {
  const commas = (header.match(/,/g) ?? []).length;
  const semis = (header.match(/;/g) ?? []).length;
  const tabs = (header.match(/\t/g) ?? []).length;
  if (tabs > commas && tabs > semis) return "	";
  return semis > commas ? ";" : ",";
}
var pad = (n) => String(n).padStart(2, "0");
function normalizeTimestamp(raw, dayFirst = true) {
  const v = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${pad(+m[4])}:${m[5]}`;
  m = /^(\d{1,2})([./-])(\d{1,2})[./-](\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/.exec(
    v
  );
  if (!m) return null;
  const first = m[2] === "." ? true : dayFirst;
  const day = first ? +m[1] : +m[3];
  const month = first ? +m[3] : +m[1];
  let hour = +m[5];
  const ampm = m[7]?.toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  if (day < 1 || day > 31 || month < 1 || month > 12 || hour > 23 || +m[6] > 59) return null;
  return `${m[4]}-${pad(month)}-${pad(day)}T${pad(hour)}:${m[6]}`;
}
function numberOf(raw) {
  if (raw === void 0) return null;
  const t = raw.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
var lower = (s) => s.toLowerCase();
function makeReading(at, value, unitMmol, source, kind) {
  const mg = unitMmol ? value * MMOL_FACTOR : value;
  if (!(mg >= 10 && mg <= 700)) return null;
  return {
    id: null,
    measuredAt: at,
    mgDl: Math.round(mg * 10) / 10,
    source,
    kind,
    notes: null
  };
}
function parseLibre(lines, headerIndex) {
  const header = lines[headerIndex];
  const sep = sepOf(header);
  const cols = splitCsv(header, sep).map(lower);
  const find = (...words) => cols.findIndex((c) => words.every((w) => c.includes(w)));
  const tsCol = Math.max(find("zeitstempel"), find("timestamp"));
  const typeCol = Math.max(find("aufzeichnungstyp"), find("record type"));
  const histCol = Math.max(find("verlauf"), find("historic glucose"));
  const scanCol = Math.max(find("scan"), -1);
  const stripCol = Math.max(find("teststreifen", "glukose"), find("strip glucose"));
  const unitMmol = (cols[histCol] ?? cols[scanCol] ?? "").includes("mmol");
  const device = splitCsv(lines[headerIndex + 1] ?? "", sep)[0] || "FreeStyle Libre";
  let dayFirst = true;
  for (const l of lines.slice(headerIndex + 1, headerIndex + 400)) {
    const ts = splitCsv(l, sep)[tsCol] ?? "";
    const m = /^(\d{1,2})-(\d{1,2})-\d{4}/.exec(ts);
    if (m && +m[2] > 12) {
      dayFirst = false;
      break;
    }
    if (m && +m[1] > 12) break;
  }
  const readings = [];
  let skipped = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const f = splitCsv(line, sep);
    const at = normalizeTimestamp(f[tsCol] ?? "", dayFirst);
    const type = f[typeCol]?.trim();
    const pick = (col, kind) => {
      const v = numberOf(f[col]);
      if (at && v !== null) {
        const r = makeReading(at, v, unitMmol, device, kind);
        if (r) {
          readings.push(r);
          return true;
        }
      }
      return false;
    };
    let used = false;
    if (type === "0" || type === void 0) used = pick(histCol, "cgm");
    if (type === "1") used = pick(scanCol, "scan");
    if (type === "2" && stripCol >= 0) used = pick(stripCol, "manual");
    if (!used) skipped++;
  }
  return {
    format: "libre",
    source: device.slice(0, 40),
    readings,
    skipped,
    notes: unitMmol ? ["Werte in mmol/l \u2013 umgerechnet in mg/dl (\xD7 18,016)."] : []
  };
}
function parseDexcom(lines, headerIndex) {
  const sep = sepOf(lines[headerIndex]);
  const cols = splitCsv(lines[headerIndex], sep).map(lower);
  const tsCol = cols.findIndex((c) => c.includes("zeitstempel") || c.includes("timestamp"));
  const typeCol = cols.findIndex((c) => c.includes("ereignistyp") || c.includes("event type"));
  const valCol = cols.findIndex(
    (c) => (c.includes("glukosewert") || c.includes("glucose value")) && !c.includes("rate")
  );
  const unitMmol = (cols[valCol] ?? "").includes("mmol");
  const readings = [];
  let skipped = 0;
  let outOfRange = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const f = splitCsv(line, sep);
    const type = lower(f[typeCol] ?? "");
    const at = normalizeTimestamp(f[tsCol] ?? "");
    const v = numberOf(f[valCol]);
    if (!at || type && type !== "egv" && !type.includes("kalibr") && type !== "calibration") {
      skipped++;
      continue;
    }
    if (v === null) {
      if (/low|niedrig|high|hoch/i.test(f[valCol] ?? "")) outOfRange++;
      skipped++;
      continue;
    }
    const r = makeReading(at, v, unitMmol, "Dexcom", type === "egv" ? "cgm" : "manual");
    if (r) readings.push(r);
    else skipped++;
  }
  const notes = [];
  if (outOfRange > 0)
    notes.push(
      `${outOfRange} Werte au\xDFerhalb des Messbereichs (\u201ENiedrig\u201C/\u201EHoch\u201C) ohne Zahl \u2013 nicht \xFCbernommen.`
    );
  if (unitMmol) notes.push("Werte in mmol/l \u2013 umgerechnet in mg/dl (\xD7 18,016).");
  return { format: "dexcom", source: "Dexcom", readings, skipped, notes };
}
function parseGeneric(lines, headerIndex) {
  const sep = sepOf(lines[headerIndex]);
  const cols = splitCsv(lines[headerIndex], sep).map(lower);
  const dateCol = cols.findIndex((c) => /datum|date|zeitpunkt|zeitstempel|timestamp/.test(c));
  const timeCol = cols.findIndex((c) => /uhrzeit|^zeit$|^time$/.test(c));
  const valCol = cols.findIndex((c) => /blutzucker|glukose|glucose|bz/.test(c));
  if (dateCol < 0 || valCol < 0) return null;
  const unitMmol = (cols[valCol] ?? "").includes("mmol");
  const readings = [];
  let skipped = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const f = splitCsv(line, sep);
    const raw = timeCol >= 0 ? `${f[dateCol] ?? ""} ${f[timeCol] ?? ""}` : f[dateCol] ?? "";
    const at = normalizeTimestamp(raw);
    const v = numberOf(f[valCol]);
    const r = at && v !== null ? makeReading(at, v, unitMmol || v < 35 && v > 1, "CSV-Import", "manual") : null;
    if (r) readings.push(r);
    else skipped++;
  }
  return { format: "csv", source: "CSV-Import", readings, skipped, notes: [] };
}
function parseGlucoseFile(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const l = lower(lines[i] ?? "");
    if ((l.includes("ger\xE4tezeitstempel") || l.includes("device timestamp")) && (l.includes("aufzeichnungstyp") || l.includes("record type"))) {
      return parseLibre(lines, i);
    }
    if ((l.includes("zeitstempel (") || l.includes("timestamp (")) && (l.includes("glukosewert") || l.includes("glucose value"))) {
      return parseDexcom(lines, i);
    }
  }
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const g = parseGeneric(lines, i);
    if (g && g.readings.length > 0) return g;
  }
  return null;
}
var RANGES = [
  { key: "veryLow", label: "unter 54", max: 54 },
  { key: "low", label: "54\u201369", max: 70 },
  { key: "inRange", label: "70\u2013180", max: 181 },
  { key: "high", label: "181\u2013250", max: 251 },
  { key: "veryHigh", label: "\xFCber 250", max: Infinity }
];
function glucoseStats(readings) {
  const values = readings.map((r) => r.mgDl);
  const n = values.length;
  const ranges = Object.fromEntries(RANGES.map((r) => [r.key, 0]));
  if (n === 0) {
    return {
      count: 0,
      days: 0,
      mean: null,
      sd: null,
      cv: null,
      gmi: null,
      min: null,
      max: null,
      ranges
    };
  }
  const mean2 = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean2) ** 2, 0) / (n - 1)) : null;
  for (const v of values) {
    const r = RANGES.find((x) => v < x.max);
    ranges[r.key] += 100 / n;
  }
  const days = new Set(readings.map((r) => r.measuredAt.slice(0, 10))).size;
  return {
    count: n,
    days,
    mean: mean2,
    sd,
    cv: sd !== null && mean2 > 0 ? sd / mean2 * 100 : null,
    gmi: days >= 10 ? 3.31 + 0.02392 * mean2 : null,
    min: Math.min(...values),
    max: Math.max(...values),
    ranges
  };
}
var minuteOfReading = (r) => Number(r.measuredAt.slice(11, 13)) * 60 + Number(r.measuredAt.slice(14, 16));
function dayReadings(readings, date) {
  const order = { cgm: 0, scan: 1, manual: 2 };
  return readings.filter((r) => r.measuredAt.startsWith(date)).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt) || order[a.kind] - order[b.kind]);
}
function mealResponse(day, meal) {
  const m = Number(meal.time.slice(0, 2)) * 60 + Number(meal.time.slice(3, 5));
  const withMin = day.map((r) => ({ t: minuteOfReading(r), v: r.mgDl }));
  const before = [...withMin].reverse().find((p) => p.t <= m && p.t >= m - 20)?.v ?? null;
  const after = withMin.filter((p) => p.t > m && p.t <= m + 180);
  let peak = null;
  for (const p of after) if (!peak || p.v > peak.v) peak = p;
  const two = withMin.find((p) => p.t >= m + 110 && p.t <= m + 130)?.v ?? null;
  return {
    time: meal.time.slice(0, 5),
    label: meal.label,
    before,
    peak: peak?.v ?? null,
    peakAfterMin: peak ? peak.t - m : null,
    rise: before !== null && peak ? peak.v - before : null,
    after2h: two
  };
}
function nightStats(readings) {
  const byDay = /* @__PURE__ */ new Map();
  for (const r of readings) {
    if (minuteOfReading(r) >= 360) continue;
    const d = r.measuredAt.slice(0, 10);
    byDay.set(d, [...byDay.get(d) ?? [], r.mgDl]);
  }
  return [...byDay.entries()].filter(([, v]) => v.length >= 6).map(([date, v]) => ({
    date,
    mean: v.reduce((a, b) => a + b, 0) / v.length,
    min: Math.min(...v),
    count: v.length
  })).sort((a, b) => a.date.localeCompare(b.date));
}
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function dailyProfile(readings) {
  const byHour = Array.from({ length: 24 }, () => []);
  for (const r of readings) byHour[Math.floor(minuteOfReading(r) / 60)]?.push(r.mgDl);
  return byHour.flatMap((v, h) => {
    if (v.length < 3) return [];
    const s = [...v].sort((a, b) => a - b);
    return [
      {
        minute: h * 60,
        p10: quantile(s, 0.1),
        p25: quantile(s, 0.25),
        median: quantile(s, 0.5),
        p75: quantile(s, 0.75),
        p90: quantile(s, 0.9),
        count: v.length
      }
    ];
  });
}
function dailyMeans(readings) {
  const byDay = /* @__PURE__ */ new Map();
  for (const r of readings) {
    const d = r.measuredAt.slice(0, 10);
    byDay.set(d, [...byDay.get(d) ?? [], r.mgDl]);
  }
  return [...byDay.entries()].map(([date, v]) => ({ date, value: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => a.date.localeCompare(b.date));
}
var MIN_GROUP = 3;
function mealGlucoseRows(readings, meals) {
  const byDay = /* @__PURE__ */ new Map();
  for (const r of readings) {
    const d = r.measuredAt.slice(0, 10);
    byDay.set(d, [...byDay.get(d) ?? [], r]);
  }
  const out = [];
  for (const m of meals) {
    if (!/^\d{2}:\d{2}/.test(m.time)) continue;
    const day = byDay.get(m.date);
    if (!day) continue;
    const sorted = [...day].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const res = mealResponse(sorted, m);
    if (res.rise === null) continue;
    out.push({ ...res, date: m.date, carbsG: m.carbsG, energyKcal: m.energyKcal });
  }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
var groupMean = (label, values) => ({
  label,
  count: values.length,
  mean: values.length >= MIN_GROUP ? values.reduce((a, b) => a + b, 0) / values.length : null
});
var CARB_GROUPS = [
  { label: "unter 20 g", from: 0, to: 20 },
  { label: "20\u201349 g", from: 20, to: 50 },
  { label: "50\u201379 g", from: 50, to: 80 },
  { label: "ab 80 g", from: 80, to: Infinity }
];
function riseByCarbs(rows) {
  return CARB_GROUPS.map(
    (g) => groupMean(
      g.label,
      rows.filter((r) => r.carbsG >= g.from && r.carbsG < g.to).map((r) => r.rise)
    )
  );
}
var avg = (v) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
function workoutGlucoseRows(readings, workouts) {
  const out = [];
  for (const w of workouts) {
    if (!/^\d{2}:\d{2}/.test(w.startTime) || !(w.durationMin > 0)) continue;
    const s = Number(w.startTime.slice(0, 2)) * 60 + Number(w.startTime.slice(3, 5));
    const e = s + w.durationMin;
    const day = readings.filter((r) => r.measuredAt.startsWith(w.date));
    if (!day.length) continue;
    const pts = day.map((r) => ({ t: minuteOfReading(r), v: r.mgDl }));
    const pick = (a, b) => pts.filter((p) => p.t >= a && p.t < b).map((p) => p.v);
    const during = pick(s, e);
    const after = pick(e, e + 120);
    const before = pick(s - 60, s);
    if (!during.length && !after.length) continue;
    const both = [...during, ...after];
    out.push({
      date: w.date,
      startTime: w.startTime.slice(0, 5),
      title: w.title,
      before: avg(before),
      during: avg(during),
      after: avg(after),
      min: both.length ? Math.min(...both) : null
    });
  }
  return out.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}
function sleepGlucoseRows(readings, sleep) {
  const nights = new Map(nightStats(readings).map((n) => [n.date, n]));
  const out = [];
  for (const s of sleep) {
    if (!(s.durationMin > 0)) continue;
    const day = readings.filter((r) => r.measuredAt.startsWith(s.date) && minuteOfReading(r) >= 360).map((r) => r.mgDl);
    const n = nights.get(s.date);
    if (!n && day.length < 6) continue;
    out.push({
      date: s.date,
      sleepMin: s.durationMin,
      nightMean: n?.mean ?? null,
      nightMin: n?.min ?? null,
      dayMean: day.length >= 6 ? avg(day) : null
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function dayMeanBySleep(rows) {
  const v = (f) => rows.filter((r) => f(r) && r.dayMean !== null).map((r) => r.dayMean);
  return [
    groupMean(
      "N\xE4chte unter 7 Std.",
      v((r) => r.sleepMin < 420)
    ),
    groupMean(
      "N\xE4chte ab 7 Std.",
      v((r) => r.sleepMin >= 420)
    )
  ];
}
export {
  ACTIVITY_ZONE_LABEL,
  CARB_GROUPS,
  MIN_GROUP,
  MIN_STEP_DAYS,
  MMOL_FACTOR,
  RANGES,
  STAGE_LABEL,
  STEP_SLOTS,
  bedMinute,
  bedtimeOffset,
  biosensingOf,
  clockOf,
  continuityClassLabel,
  cumulativeSteps,
  dailyMeans,
  dailyProfile,
  dayMeanBySleep,
  dayReadings,
  daySources,
  dayTimeline,
  describeSync,
  detailSamples,
  energyCompare,
  exerciseHr,
  exerciseZones,
  glucoseStats,
  hypnogramSegments,
  loadSeries,
  localClock,
  mealGlucoseRows,
  mealResponse,
  mean,
  measuredSleepMin,
  minuteOf,
  minuteOfReading,
  mmol,
  nightAssociations,
  nightLowestHr,
  nightSeries,
  nightStats,
  nightTargets,
  normalizeTimestamp,
  parseGlucoseFile,
  phaseShares,
  polarDayLabels,
  polarLabel,
  recentVsBaseline,
  rechargeStatusLabel,
  recoveryToday,
  riseByCarbs,
  secondsInZones,
  signedText,
  sleepEfficiencyPct,
  sleepGlucoseRows,
  sleepRatingLabel,
  splitCsv,
  sportLabel,
  spread,
  stageOf,
  stepDayCompare,
  stepSeries,
  supplementComparisons,
  usualLabel,
  workoutGlucoseRows,
  zoneMinutes,
  zoneSegments,
  zoneWeeks
};
