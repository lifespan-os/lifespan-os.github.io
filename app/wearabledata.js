// LIFESPAN OS Mobil – Rechnungen für Heart und gemessene Nächte (1.43.0). Gebündelt aus
// src/domain/wearable.ts und src/domain/wearableMore.ts des PCs (esbuild, ES2022) – dort ändern und
// testen, dann neu erzeugen.
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
    added.push(`${r.sleepLogCompleted}\xD7 Schlafphasen zu eigenen N\xE4chten erg\xE4nzt`);
  if (r.hrvNew > 0) added.push(`${r.hrvNew}\xD7 HRV in Body & Longevity`);
  if (r.stepsNew > 0) added.push(`${r.stepsNew}\xD7 Schritte in der Alltagsbewegung`);
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
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / 60) : null;
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
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / (values.length - 1);
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
export {
  STAGE_LABEL,
  bedMinute,
  bedtimeOffset,
  biosensingOf,
  clockOf,
  daySources,
  describeSync,
  detailSamples,
  energyCompare,
  exerciseHr,
  exerciseZones,
  hypnogramSegments,
  loadSeries,
  localClock,
  mean,
  measuredSleepMin,
  minuteOf,
  nightAssociations,
  nightLowestHr,
  nightSeries,
  nightTargets,
  phaseShares,
  polarDayLabels,
  polarLabel,
  recentVsBaseline,
  rechargeStatusLabel,
  recoveryToday,
  sportLabel,
  spread,
  stageOf,
  supplementComparisons,
  usualLabel,
  zoneMinutes
};
