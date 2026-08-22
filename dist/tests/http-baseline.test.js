"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// tests/http-baseline.test.ts
//
// 30-day biometric baseline on the HTTP/non-Postgres path (D-16). SQLite stores
// have NO health_samples table, so the ONLY sample source on a non-Postgres run
// is the backend HTTP client. These tests cover (1) the pure aggregate
// computeHttpBaselines and (2) end-to-end wiring: a non-Postgres readBiometricSignals
// with a stub client now returns per-metric baselines with day_count/baseline_avg,
// exactly parallel to the Postgres direct read.
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const biometrics_js_1 = require("../src/engine/signals/biometrics.js");
const DAY_SEC = 86_400;
/** ISO string for a given UTC day index + seconds offset within the day. */
function iso(daySec, offsetSec = 0) {
    return new Date((daySec + offsetSec) * 1000).toISOString();
}
(0, node_test_1.describe)("computeHttpBaselines (pure aggregate)", () => {
    (0, node_test_1.it)("averages values and counts DISTINCT UTC calendar days", () => {
        // Two samples on the SAME UTC day → day_count counts that day once; the
        // mean is over ALL valid samples (not deduped by day).
        const day0 = 0 * DAY_SEC; // 1970-01-01 UTC
        const day1 = 1 * DAY_SEC; // 1970-01-02 UTC
        const samples = new Map([
            [
                "heart_rate",
                [
                    { value: 60, timestamp: iso(day0, 0) },
                    { value: 80, timestamp: iso(day0, 3_600) }, // same UTC day as above
                    { value: 70, timestamp: iso(day1, 0) },
                ],
            ],
        ]);
        const out = (0, biometrics_js_1.computeHttpBaselines)(samples);
        strict_1.default.strictEqual(out.length, 1);
        const hr = out[0];
        strict_1.default.strictEqual(hr.metric_type, "heart_rate");
        strict_1.default.strictEqual(hr.baseline_avg, 70); // (60 + 80 + 70) / 3
        strict_1.default.strictEqual(hr.day_count, 2); // day0 counted once, day1 once
    });
    (0, node_test_1.it)("drops non-finite values and unparseable timestamps from BOTH mean and day set", () => {
        const day0 = 5 * DAY_SEC;
        const day1 = 6 * DAY_SEC;
        const samples = new Map([
            [
                "heart_rate",
                [
                    { value: 100, timestamp: iso(day0) }, // valid
                    { value: NaN, timestamp: iso(day1) }, // bad value → excluded from mean AND day set
                    { value: 200, timestamp: "not-a-timestamp" }, // bad ts → excluded from mean AND day set
                ],
            ],
        ]);
        const out = (0, biometrics_js_1.computeHttpBaselines)(samples);
        strict_1.default.strictEqual(out.length, 1);
        strict_1.default.strictEqual(out[0].baseline_avg, 100); // only the one valid sample
        strict_1.default.strictEqual(out[0].day_count, 1); // only day0 survives
    });
    (0, node_test_1.it)("emits no baseline for an all-empty or all-invalid metric", () => {
        const samples = new Map([
            ["heart_rate", []],
            [
                "hrv",
                [
                    { value: NaN, timestamp: "nope" },
                    { value: 42, timestamp: "also-not-a-date" },
                ],
            ],
        ]);
        const out = (0, biometrics_js_1.computeHttpBaselines)(samples);
        strict_1.default.deepStrictEqual(out, []);
    });
});
(0, node_test_1.describe)("readBiometricSignals (HTTP path) baselines", () => {
    (0, node_test_1.it)("populates .baselines from a month-range history per metric (day_count >= 7, finite avg)", async () => {
        // Stub BiometricsClient: heart_rate returns >= 7 distinct-UTC-day month
        // samples; other metrics are empty.
        const now = Math.floor(Date.now() / 1000);
        const hrSamples = Array.from({ length: 9 }, (_, i) => ({
            // one sample per day, ending within the last ~9 days → all inside "month"
            value: 70 + i,
            timestamp: new Date((now - i * DAY_SEC) * 1000).toISOString(),
        }));
        const healthCalls = [];
        const client = {
            async getHealthkitHistory(metric, range) {
                healthCalls.push(`${metric}:${range}`);
                return {
                    metric,
                    range,
                    samples: metric === "heart_rate" ? hrSamples : [],
                    aggregated: { avg: metric === "heart_rate" ? 74 : null, min: null, max: null },
                };
            },
            async getStateHistory(limit) {
                return { states: [], total_count: 0, limit: limit ?? 10 };
            },
        };
        const signals = await (0, biometrics_js_1.readBiometricSignals)(client, {
            metrics: ["heart_rate", "step_count"],
            range: "week", // display window stays on the caller's range …
        });
        // Baselines arrive on the HTTP path.
        strict_1.default.ok(signals.baselines, "readBiometricSignals returns baselines on the HTTP path");
        const hr = signals.baselines.find((b) => b.metric_type === "heart_rate");
        strict_1.default.ok(hr, "heart_rate baseline present");
        strict_1.default.ok(hr.day_count >= 7, `day_count must be mature (>=7), got ${hr.day_count}`);
        strict_1.default.ok(Number.isFinite(hr.baseline_avg), "baseline_avg must be finite");
        strict_1.default.strictEqual(hr.baseline_avg, 74); // mean of 70..78
        // The baseline fetch is a SEPARATE month-range request per metric, distinct
        // from the display-range fetch — the episode window samples stay on "week".
        strict_1.default.ok(healthCalls.includes("heart_rate:month"), `baseline must fetch a month-range history, got: ${JSON.stringify(healthCalls)}`);
        strict_1.default.ok(healthCalls.includes("heart_rate:week"), `display fetch must stay on the caller's range, got: ${JSON.stringify(healthCalls)}`);
    });
    (0, node_test_1.it)("degrades gracefully: a failing month (baseline) fetch nulls baselines but keeps the primary read", async () => {
        // The baseline fetch is isolated (own await + catch), so a month-fetch
        // failure must only yield empty baselines — the display/state read the
        // caller previously got must still succeed (regression guard, review Minor 1).
        const client = {
            async getHealthkitHistory(metric, range) {
                if (range === "month")
                    throw new Error("simulated backend flake on baseline fetch");
                return {
                    metric,
                    range,
                    samples: [{ value: 88, timestamp: new Date().toISOString() }],
                    aggregated: { avg: 88, min: 88, max: 88 },
                };
            },
            async getStateHistory(limit) {
                return { states: [], total_count: 0, limit: limit ?? 10 };
            },
        };
        const signals = await (0, biometrics_js_1.readBiometricSignals)(client, { metrics: ["heart_rate"], range: "week" });
        // Primary read intact …
        strict_1.default.strictEqual(signals.metrics.length, 1);
        strict_1.default.strictEqual(signals.metrics[0].samples.length, 1);
        // … baselines simply absent (empty), not a thrown error.
        strict_1.default.deepStrictEqual(signals.baselines, []);
    });
    (0, node_test_1.it)("honors the replay window: month samples outside [endTs-30d, endTs) are dropped", async () => {
        // Anchor a replay endTs in the past; month samples span both sides of it.
        const endTs = 100 * DAY_SEC; // replay window end (seconds)
        const inWindow = Array.from({ length: 8 }, (_, i) => ({
            value: 60,
            // days 92..99 → all inside [endTs-30d, endTs)
            timestamp: new Date((endTs - (i + 1) * DAY_SEC) * 1000).toISOString(),
        }));
        const afterWindow = [
            { value: 999, timestamp: new Date((endTs + DAY_SEC) * 1000).toISOString() }, // >= endTs → dropped
        ];
        const client = {
            async getHealthkitHistory(metric) {
                return {
                    metric,
                    range: "month",
                    samples: metric === "heart_rate" ? [...inWindow, ...afterWindow] : [],
                    aggregated: { avg: null, min: null, max: null },
                };
            },
            async getStateHistory(limit) {
                return { states: [], total_count: 0, limit: limit ?? 10 };
            },
        };
        const signals = await (0, biometrics_js_1.readBiometricSignals)(client, {
            metrics: ["heart_rate"],
            startTs: endTs - 30 * DAY_SEC,
            endTs,
        });
        const hr = signals.baselines.find((b) => b.metric_type === "heart_rate");
        // The out-of-window value=999 sample is filtered before averaging.
        strict_1.default.strictEqual(hr.baseline_avg, 60);
        strict_1.default.strictEqual(hr.day_count, 8);
    });
});
