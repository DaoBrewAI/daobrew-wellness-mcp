"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// tests/biometric-endorsement.test.ts
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const biometric_endorsement_js_1 = require("../src/engine/reasoner/biometric-endorsement.js");
const HOUR = 3_600_000;
const T0 = 1_783_400_000_000; // arbitrary fixed epoch ms — never Date.now()
function hr(ts, value) {
    return { metric_type: "heart_rate", value, unit: "bpm", start_time_ts: ts };
}
function hrv(ts, value) {
    return { metric_type: "hrv", value, unit: "ms", start_time_ts: ts };
}
const BASELINES = [
    { metric_type: "heart_rate", baseline_avg: 79, day_count: 30 },
    { metric_type: "hrv", baseline_avg: 36, day_count: 30 },
];
(0, node_test_1.describe)("buildBiometricEndorsement", () => {
    (0, node_test_1.it)("computes avg + delta_pct per metric and a prebuilt summary string", () => {
        const samples = [hr(T0, 92), hr(T0 + HOUR, 96), hrv(T0, 28)];
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples, baselines: BASELINES,
            window: { start_ts: T0, end_ts: T0 + 2 * HOUR },
            patterns: ["overdrive", "tension"],
            claimLevel: "context_only",
            timeZone: "America/Los_Angeles",
        });
        const hrMetric = out.biometric_summary.metrics.find(m => m.type === "heart_rate");
        strict_1.default.equal(hrMetric.avg, 94); // (92+96)/2
        strict_1.default.equal(hrMetric.baseline_avg, 79);
        strict_1.default.equal(hrMetric.delta_pct, 19); // round((94-79)/79*100)
        strict_1.default.equal(out.biometric_summary.sample_count, 3);
        strict_1.default.match(out.biometric_summary.summary, /HR 94 bpm avg/);
        strict_1.default.match(out.biometric_summary.summary, /19% above your 30-day baseline/);
        strict_1.default.match(out.biometric_summary.summary, /HRV 28 ?ms/);
    });
    (0, node_test_1.it)("young baseline (<7 days) → null baseline fields and absolute-only string", () => {
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [hr(T0, 94)],
            baselines: [{ metric_type: "heart_rate", baseline_avg: 79, day_count: 4 }],
            window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["overdrive"], claimLevel: "context_only", timeZone: "UTC",
        });
        const m = out.biometric_summary.metrics[0];
        strict_1.default.equal(m.baseline_avg, null);
        strict_1.default.equal(m.delta_pct, null);
        strict_1.default.doesNotMatch(out.biometric_summary.summary, /%/); // no fabricated percentages
        strict_1.default.match(out.biometric_summary.summary, /HR 94 bpm avg/);
    });
    (0, node_test_1.it)("sparse window (<10 samples) appends the (sparse) qualifier", () => {
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [hr(T0, 91), hr(T0 + HOUR, 91)],
            baselines: BASELINES,
            window: { start_ts: T0, end_ts: T0 + 2 * HOUR },
            patterns: ["tension"], claimLevel: "context_only", timeZone: "UTC",
        });
        strict_1.default.match(out.biometric_summary.summary, /\(sparse\)/);
    });
    (0, node_test_1.it)("missing metric is omitted entirely — no n/a noise", () => {
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [hr(T0, 94)], baselines: BASELINES,
            window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["overdrive"], claimLevel: "context_only", timeZone: "UTC",
        });
        strict_1.default.equal(out.biometric_summary.metrics.length, 1);
        strict_1.default.doesNotMatch(out.biometric_summary.summary, /hrv/i);
    });
    (0, node_test_1.it)("dedupes samples by (metric_type,start_time_ts) against device overlap", () => {
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [hr(T0, 90), hr(T0, 90), hr(T0 + HOUR, 98)], // first two = same reading, two devices
            baselines: BASELINES,
            window: { start_ts: T0, end_ts: T0 + 2 * HOUR },
            patterns: ["overdrive"], claimLevel: "context_only", timeZone: "UTC",
        });
        strict_1.default.equal(out.biometric_summary.sample_count, 2);
        strict_1.default.equal(out.biometric_summary.metrics[0].avg, 94); // (90+98)/2, not (90+90+98)/3
    });
    (0, node_test_1.it)("pattern endorsements: context_only wording is observational, never causal", () => {
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [hr(T0, 94), hrv(T0, 28)], baselines: BASELINES,
            window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["tension", "overdrive"], claimLevel: "context_only", timeZone: "UTC",
        });
        strict_1.default.equal(out.pattern_endorsements.length, 2);
        const tension = out.pattern_endorsements.find(p => p.key === "tension");
        strict_1.default.match(tension.summary, /HRV .*below your 30-day baseline/);
        for (const p of out.pattern_endorsements) {
            strict_1.default.doesNotMatch(p.summary, /caused|because of|due to|coincided/i);
        }
    });
    (0, node_test_1.it)("attribution_candidate may say 'coincided with'; still never 'caused'", () => {
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [hr(T0, 94)], baselines: BASELINES,
            window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["overdrive"], claimLevel: "attribution_candidate", timeZone: "UTC",
        });
        strict_1.default.doesNotMatch(out.pattern_endorsements[0].summary, /caused/i);
    });
    // Real-fixture regression (Task 4): the live pipeline emits the CANONICAL
    // metric name "heart_rate_variability" (DEFAULT_BIOMETRIC_METRICS), not "hrv".
    // It must render as HRV/ms, drive the tension picker, and never leave a
    // double space when a metric has no unit.
    (0, node_test_1.it)("recognizes the canonical heart_rate_variability metric name as HRV", () => {
        const hrvCanon = (ts, value) => ({ metric_type: "heart_rate_variability", value, unit: "ms", start_time_ts: ts });
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [hr(T0, 94), hrvCanon(T0, 28)],
            baselines: [
                { metric_type: "heart_rate", baseline_avg: 79, day_count: 30 },
                { metric_type: "heart_rate_variability", baseline_avg: 36, day_count: 30 },
            ],
            window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["tension", "overdrive"], claimLevel: "context_only", timeZone: "UTC",
        });
        strict_1.default.match(out.biometric_summary.summary, /HRV 28 ?ms/);
        const tension = out.pattern_endorsements.find(p => p.key === "tension");
        strict_1.default.match(tension.summary, /HRV .*below your 30-day baseline/);
    });
    (0, node_test_1.it)("never renders a double space when a metric has no unit", () => {
        const noUnit = (ts, value) => ({ metric_type: "step_count", value, unit: "", start_time_ts: ts });
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [noUnit(T0, 480)], baselines: [],
            window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["stagnation"], claimLevel: "context_only", timeZone: "UTC",
        });
        strict_1.default.doesNotMatch(out.biometric_summary.summary, /  /); // no doubled spaces
        for (const p of out.pattern_endorsements)
            strict_1.default.doesNotMatch(p.summary, /  /);
    });
    // --- Task 1 (review #1): omit zero metrics, sum cumulative metrics as totals ---
    (0, node_test_1.it)("omits metrics whose aggregate rounds to zero — no 'Energy 0 kcal' noise", () => {
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [hr(T0, 94), { metric_type: "active_energy_burned", value: 0.004, unit: "kcal", start_time_ts: T0 }],
            baselines: BASELINES, window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["overdrive"], claimLevel: "context_only", timeZone: "UTC",
        });
        strict_1.default.doesNotMatch(out.biometric_summary.summary, /Energy/i);
        strict_1.default.equal(out.biometric_summary.metrics.find(m => m.type === "active_energy_burned"), undefined);
    });
    (0, node_test_1.it)("cumulative metrics (energy, steps) SUM over the window and label as totals, no baseline pct", () => {
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [
                { metric_type: "step_count", value: 200, unit: "count", start_time_ts: T0 },
                { metric_type: "step_count", value: 280, unit: "count", start_time_ts: T0 + HOUR },
                hr(T0, 94),
            ],
            baselines: [...BASELINES, { metric_type: "step_count", baseline_avg: 300, day_count: 30 }],
            window: { start_ts: T0, end_ts: T0 + 2 * HOUR },
            patterns: ["overdrive"], claimLevel: "context_only", timeZone: "UTC",
        });
        const steps = out.biometric_summary.metrics.find(m => m.type === "step_count");
        strict_1.default.equal(steps.avg, 480); // SUM, not mean 240 (field name stays `avg` for contract compat)
        strict_1.default.equal(steps.delta_pct, null); // per-sample baseline is not comparable to a window sum
        strict_1.default.match(out.biometric_summary.summary, /steps 480/);
        // Totals are not labeled "avg": no "avg" between "steps 480" and the next
        // " · " separator (scope to the steps segment, not the whole string — a
        // later instantaneous metric like "HR 94 bpm avg" legitimately carries avg).
        strict_1.default.doesNotMatch(out.biometric_summary.summary, /steps 480[^·]*avg/);
    });
    // --- Task 2 (review #2): structured metric.unit is self-contained ---
    (0, node_test_1.it)("structured metric carries a unit even when samples omit it (canonical names)", () => {
        const bare = (metric_type, value) => ({ metric_type, value, unit: "", start_time_ts: T0 });
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [
                bare("heart_rate_variability", 45),
                bare("resting_heart_rate", 58),
                bare("respiratory_rate", 14),
            ],
            baselines: [], window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["tension"], claimLevel: "context_only", timeZone: "UTC",
        });
        const byType = (t) => out.biometric_summary.metrics.find(m => m.type === t);
        strict_1.default.equal(byType("heart_rate_variability").unit, "ms"); // DEFAULT_UNITS fallback reaches the chip
        strict_1.default.equal(byType("resting_heart_rate").unit, "bpm");
        strict_1.default.equal(byType("respiratory_rate").unit, "brpm");
    });
    // --- Task 3 (review #5): fallback patterns must not duplicate endorsement lines ---
    (0, node_test_1.it)("distinct fallback patterns take distinct metrics — no duplicated endorsement lines", () => {
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [
                { metric_type: "heart_rate", value: 99, unit: "bpm", start_time_ts: T0 },
                { metric_type: "heart_rate_variability", value: 45, unit: "ms", start_time_ts: T0 },
            ],
            baselines: [], window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["depletion", "stagnation"], claimLevel: "context_only", timeZone: "UTC",
        });
        const [a, b] = out.pattern_endorsements;
        strict_1.default.notEqual(a.summary, b.summary); // the two chips read differently
    });
    (0, node_test_1.it)("single available metric + two fallback patterns → second pattern falls back to state-scoring line, not a repeat", () => {
        const out = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [{ metric_type: "heart_rate", value: 99, unit: "bpm", start_time_ts: T0 }],
            baselines: [], window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["depletion", "stagnation"], claimLevel: "context_only", timeZone: "UTC",
        });
        const [a, b] = out.pattern_endorsements;
        strict_1.default.notEqual(a.summary, b.summary); // still not identical
        strict_1.default.match(a.summary, /HR 99 bpm/); // first pattern gets the one metric
        strict_1.default.match(b.summary, /flagged by state scoring/); // second falls back, no repeat
        strict_1.default.deepEqual(b.metrics, []); // no metric attached to the fallback line
    });
    (0, node_test_1.it)("uses median for sparse instantaneous metric windows while mean remains default for dense windows", () => {
        const sparse = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [hr(T0, 60), hr(T0 + HOUR, 200), hr(T0 + 2 * HOUR, 62)],
            baselines: BASELINES,
            window: { start_ts: T0, end_ts: T0 + 3 * HOUR },
            patterns: ["overdrive"],
            claimLevel: "context_only",
            timeZone: "UTC",
        });
        strict_1.default.equal(sparse.biometric_summary.metrics.find(m => m.type === "heart_rate").avg, 62);
        const dense = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: Array.from({ length: 10 }, (_, index) => hr(T0 + index, index === 0 ? 200 : 60)),
            baselines: BASELINES,
            window: { start_ts: T0, end_ts: T0 + HOUR },
            patterns: ["overdrive"],
            claimLevel: "context_only",
            timeZone: "UTC",
        });
        strict_1.default.equal(dense.biometric_summary.metrics.find(m => m.type === "heart_rate").avg, 74);
    });
    (0, node_test_1.it)("uses the median gate per metric, not across the total mixed window", () => {
        const mixed = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
            samples: [
                hr(T0, 60), hr(T0 + HOUR, 200), hr(T0 + 2 * HOUR, 62),
                ...Array.from({ length: 7 }, (_, index) => hrv(T0 + index, 30 + index)),
            ],
            baselines: BASELINES,
            window: { start_ts: T0, end_ts: T0 + 3 * HOUR },
            patterns: ["overdrive"],
            claimLevel: "context_only",
            timeZone: "UTC",
        });
        strict_1.default.equal(mixed.biometric_summary.sample_count, 10);
        strict_1.default.equal(mixed.biometric_summary.metrics.find(m => m.type === "heart_rate").avg, 62);
    });
});
