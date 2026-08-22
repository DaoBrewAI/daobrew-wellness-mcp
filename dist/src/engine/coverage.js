"use strict";
/**
 * Coverage as a first-class citizen — causal-engine-v2 P1.
 *
 * Builds a per-day / per-metric wear-coverage table from raw health
 * samples (the unified, deduped timeline), and enforces the two
 * defenses that keep claims honest on a dirty backend:
 *
 * 1. Claim capping: any cited day without real biometric coverage caps
 *    the candidate at context-only — days without physiological
 *    coverage cannot back a physiological attribution.
 * 2. Mock-contamination detection (F8): a state window with NO raw
 *    samples inside is synthetic — it contributes zero coverage and
 *    its readings must never enter an evidence chain. Truth is decided
 *    ONLY by the presence of raw sample rows, never by backend
 *    source_quality flags (which mislabel mock as data_verified).
 *
 * The worn-day rule mirrors the round-4 reconstruction exactly
 * (fixtures/causal-engine-v2/scripts/reunify/reconstruct_unified.py):
 * real_inference requires >= 3 heart-rate samples in the local day.
 * Day boundaries use a fixed Pacific daylight offset (-7h) to match
 * the committed fixtures; override per caller when generalizing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCoverageTable = buildCoverageTable;
exports.capClaimByCoverage = capClaimByCoverage;
exports.detectMockContamination = detectMockContamination;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OFFSET_HOURS = -7;
const DEFAULT_MIN_HR_SAMPLES = 3;
const HR_BUCKETS = 12;
function localDayKey(epochMs, offsetHours) {
    const shifted = new Date(epochMs + offsetHours * 3600 * 1000);
    return shifted.toISOString().slice(0, 10);
}
function localHour(epochMs, offsetHours) {
    const shifted = new Date(epochMs + offsetHours * 3600 * 1000);
    return shifted.getUTCHours();
}
function dayQuality(counts, minHrSamples) {
    const hr = counts["heart_rate"] ?? 0;
    const hrv = counts["heart_rate_variability"] ?? 0;
    const steps = counts["step_count"] ?? 0;
    // Mirrors reconstruct_unified.classify_window: data must exist AND
    // carry at least minHrSamples heart-rate rows to count as worn.
    if ((hr > 0 || hrv > 0) && hr >= minHrSamples)
        return "real_inference";
    if (hr > 0 || steps > 0)
        return "sparse_data";
    return "no_data";
}
function buildCoverageTable(samples, options = {}) {
    const offset = options.timezoneOffsetHours ?? DEFAULT_OFFSET_HOURS;
    const minHr = options.minHrSamples ?? DEFAULT_MIN_HR_SAMPLES;
    const counts = new Map();
    const hrBuckets = new Map();
    for (const sample of samples) {
        const ms = Date.parse(sample.timestamp);
        if (!Number.isFinite(ms))
            continue;
        const day = localDayKey(ms, offset);
        const dayCounts = counts.get(day) ?? {};
        dayCounts[sample.metric] = (dayCounts[sample.metric] ?? 0) + 1;
        counts.set(day, dayCounts);
        if (sample.metric === "heart_rate") {
            const buckets = hrBuckets.get(day) ?? new Set();
            buckets.add(Math.floor(localHour(ms, offset) / 2));
            hrBuckets.set(day, buckets);
        }
    }
    const sampledDays = [...counts.keys()].sort();
    const days = {};
    const wornDays = [];
    const vacuumDays = [];
    let span = null;
    if (sampledDays.length > 0) {
        span = { start: sampledDays[0], end: sampledDays[sampledDays.length - 1] };
        const startMs = Date.parse(`${span.start}T00:00:00Z`);
        const endMs = Date.parse(`${span.end}T00:00:00Z`);
        for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
            const date = new Date(ms).toISOString().slice(0, 10);
            const dayCounts = counts.get(date) ?? {};
            const total = Object.values(dayCounts).reduce((a, b) => a + b, 0);
            const quality = total === 0 ? "no_data" : dayQuality(dayCounts, minHr);
            const buckets = hrBuckets.get(date)?.size ?? 0;
            const coverage = {
                date,
                counts: dayCounts,
                totalSamples: total,
                worn: quality === "real_inference",
                quality,
                hrBucketsCovered: buckets,
                coverageFraction: buckets / HR_BUCKETS,
            };
            days[date] = coverage;
            if (coverage.worn)
                wornDays.push(date);
            if (total === 0)
                vacuumDays.push(date);
        }
    }
    return { days, wornDays, vacuumDays, span, timezoneOffsetHours: offset };
}
/**
 * Cap a candidate's claim level by the coverage of its cited dates.
 * Any cited day falling outside real biometric coverage drops the
 * ceiling to context-only — the day cannot physiologically back the
 * claim, whatever the corpus says.
 */
function capClaimByCoverage(requested, citedDates, table) {
    const backedDates = [];
    const unbackedDates = [];
    for (const date of citedDates) {
        if (table.days[date]?.worn)
            backedDates.push(date);
        else
            unbackedDates.push(date);
    }
    if (citedDates.length === 0) {
        return {
            level: "insufficient_power",
            backedDates,
            unbackedDates,
            cappedBecause: "no cited dates",
        };
    }
    if (unbackedDates.length > 0 && requested === "attribution_candidate") {
        return {
            level: "context_only",
            backedDates,
            unbackedDates,
            cappedBecause: `no biometric coverage on ${unbackedDates.join(", ")}`,
        };
    }
    return { level: requested, backedDates, unbackedDates, cappedBecause: null };
}
function detectMockContamination(states, samples) {
    const timestamps = samples
        .map((s) => Date.parse(s.timestamp) / 1000)
        .filter((t) => Number.isFinite(t))
        .sort((a, b) => a - b);
    const hasSampleIn = (startTs, endTs) => {
        // binary search for the first timestamp >= startTs
        let lo = 0;
        let hi = timestamps.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (timestamps[mid] < startTs)
                lo = mid + 1;
            else
                hi = mid;
        }
        return lo < timestamps.length && timestamps[lo] < endTs;
    };
    const clean = [];
    const contaminated = [];
    for (const window of states) {
        (hasSampleIn(window.startTs, window.endTs) ? clean : contaminated).push(window);
    }
    return { clean, contaminated };
}
