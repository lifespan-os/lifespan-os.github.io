// LIFESPAN OS Mobil – Rechnungen für Heart und gemessene Nächte (1.42.0). Erzeugt aus
// src/domain/wearable.ts des PCs (tsc, ES2022) – dort ändern und testen, dann neu erzeugen.
/**
 * Gemessene Daten von Uhr und Ring (Polar): Typen und Rechnungen für Health → Heart und Sleep.
 *
 * Nur Werte und nachvollziehbare Rechnungen, keine Bewertungen oder Scores: Einordnung immer
 * gegenüber dem eigenen Verlauf. Fehlende Werte bleiben `null`, nie 0.
 */
/** Kurzer Bericht nach dem Synchronisieren. */
export function describeSync(r) {
    const parts = [
        `${r.heartDays} ${r.heartDays === 1 ? "Tag" : "Tage"} Herzfrequenz`,
        `${r.sleepNights} ${r.sleepNights === 1 ? "Nacht" : "Nächte"}`,
        `${r.recoveries}× nächtliche Erholung`,
        `${r.exercises} ${r.exercises === 1 ? "Training" : "Trainings"}`,
    ];
    const added = [];
    if (r.sleepLogNew > 0)
        added.push(`${r.sleepLogNew} neue Nächte im Schlafprotokoll`);
    if (r.sleepLogCompleted > 0)
        added.push(`${r.sleepLogCompleted}× Schlafphasen zu eigenen Nächten ergänzt`);
    if (r.hrvNew > 0)
        added.push(`${r.hrvNew}× HRV in Body & Longevity`);
    if (r.stepsNew > 0)
        added.push(`${r.stepsNew}× Schritte in der Alltagsbewegung`);
    return `Abgerufen (${formatShort(r.from)}–${formatShort(r.to)}): ${parts.join(", ")}.${added.length ? ` Ergänzt: ${added.join(", ")}.` : ""}`;
}
function formatShort(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? `${m[3]}.${m[2]}.` : iso;
}
/** Minute des Tages → „HH:MM“. */
export function clockOf(minute) {
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
/** „HH:MM“ → Minute des Tages (oder null). */
export function minuteOf(clock) {
    const m = /^(\d{1,2}):(\d{2})/.exec(clock.trim());
    if (!m)
        return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h < 24 && min < 60 ? h * 60 + min : null;
}
/** JSON-Objekt „HH:MM“ → Zahl aus der Nacht, nach Zeit ab 12:00 (Abend vor Morgen) sortiert. */
export function nightSeries(json) {
    if (!json)
        return [];
    let obj;
    try {
        obj = JSON.parse(json);
    }
    catch {
        return [];
    }
    if (!obj || typeof obj !== "object")
        return [];
    const out = [];
    for (const [k, v] of Object.entries(obj)) {
        const minute = minuteOf(k);
        if (minute === null || typeof v !== "number" || !Number.isFinite(v))
            continue;
        out.push({ minute, value: v });
    }
    const order = (m) => (m >= 12 * 60 ? m - 1440 : m);
    return out.sort((a, b) => order(a.minute) - order(b.minute));
}
/** Niedrigste Herzfrequenz der Nacht (aus den Nachtwerten der Messung). */
export function nightLowestHr(s) {
    const values = nightSeries(s.hrSamples)
        .map((p) => p.value)
        .filter((v) => v >= 25 && v <= 250);
    return values.length ? Math.min(...values) : null;
}
/** Gemessene Schlafdauer in Minuten (alle Schlafphasen, ohne Wachphasen). */
export function measuredSleepMin(s) {
    const parts = [s.lightS, s.deepS, s.remS, s.unrecognizedS].filter((x) => x !== null);
    return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / 60) : null;
}
/** Anteile der Phasen an der gemessenen Schlafdauer (in %), nur wenn alle drei vorhanden sind. */
export function phaseShares(s) {
    if (s.lightS === null || s.deepS === null || s.remS === null)
        return null;
    const total = s.lightS + s.deepS + s.remS + (s.unrecognizedS ?? 0);
    if (total <= 0)
        return null;
    const pct = (x) => Math.round((x / total) * 1000) / 10;
    return { light: pct(s.lightS), deep: pct(s.deepS), rem: pct(s.remS) };
}
export function mean(values) {
    const v = values.filter((x) => x !== null && Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
/** Einschlafzeit aus „…T23:10:00…“ als Minuten relativ zu Mitternacht (Abend negativ). */
export function bedMinute(s) {
    const t = s.sleepStart?.split("T")[1];
    if (!t)
        return null;
    const m = minuteOf(t);
    if (m === null)
        return null;
    return m >= 12 * 60 ? m - 1440 : m;
}
/** Standardabweichung (Stichprobe) – ab 3 Werten, sonst null. */
export function spread(values) {
    if (values.length < 3)
        return null;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}
export function recentVsBaseline(points, today) {
    const day = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    const t = day(today);
    const recent = [];
    const base = [];
    for (const p of points) {
        if (p.value === null)
            continue;
        const ago = Math.round((t - day(p.date)) / 86_400_000);
        if (ago >= 0 && ago < 7)
            recent.push(p.value);
        else if (ago >= 7 && ago < 35)
            base.push(p.value);
    }
    const r = mean(recent);
    const b = mean(base);
    return {
        recent: r,
        recentCount: recent.length,
        baseline: b,
        baselineCount: base.length,
        difference: r !== null && b !== null && recent.length >= 3 && base.length >= 3 ? r - b : null,
    };
}
/**
 * Minuten je Trainingszone an einem Tag. Jeder Messwert steht für den Abstand bis zum nächsten
 * (höchstens 15 Minuten, Polar: 5 Minuten). `below` = unter Zone 1.
 */
export function zoneMinutes(samples, zones) {
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
        else if (bpm < lowest)
            below += step;
    });
    return { byZone, below, total };
}
