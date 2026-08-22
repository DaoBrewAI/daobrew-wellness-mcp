"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Numeric parity test: src/engine/signals/prodPort.ts vs the committed golden
 * timeline produced by the Python driver
 * fixtures/causal-engine-v2/scripts/reunify/reconstruct_unified.py running the
 * EXACT production inference code (prod_features_main.py sha 5701517 +
 * daobrew_backend/state_inference).
 *
 * Re-runs the full daily walk (2026-03-18 .. 2026-07-02, fixed PDT -7h day
 * boundaries, rolling EMA baselines updated only on worn days,
 * previous_state=None, min_hr_samples=3) in TypeScript and asserts:
 *  - source_quality matches the golden for every one of the 107 days
 *  - dominant_pattern_raw_pre_gate matches day-by-day on worn (real_inference) days
 *  - the aggregate raw distribution is exactly
 *    TENSION 40 / OVERDRIVE 18 / STAGNATION 4 / CONSTRICTION 1 / DEPLETION 0
 *  - yin_score / yang_score within +/-1 of golden on worn days. Both sides are
 *    IEEE754 doubles and in practice match exactly (Python statistics.mean is
 *    exact-fraction arithmetic vs Neumaier-compensated summation in the port —
 *    a <=1 ulp difference that could in principle flip a round()/int()
 *    boundary, hence the spec'd tolerance).
 */
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const prodPort_js_1 = require("../src/engine/signals/prodPort.js");
const FIXTURES = (0, node_path_1.join)(__dirname, "..", "..", "fixtures", "causal-engine-v2", "data", "reunified");
const unified = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(FIXTURES, "unified_v2.json"), "utf-8"));
const golden = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(FIXTURES, "pattern_timeline_v2.json"), "utf-8"));
// DaobrewIOS Models.swift:136-168 element -> pattern vocabulary
const PATTERN_NAME = {
    wood: "TENSION",
    fire: "OVERDRIVE",
    earth: "STAGNATION",
    metal: "CONSTRICTION",
    water: "DEPLETION",
};
const EXPECTED_RAW_DISTRIBUTION = {
    TENSION: 40,
    OVERDRIVE: 18,
    STAGNATION: 4,
    CONSTRICTION: 1,
    DEPLETION: 0,
};
/** Mirrors reconstruct_unified.load(): (epoch_seconds, value) sorted as Python tuples. */
function loadSeries(metric) {
    const samples = unified.metrics[metric] ?? [];
    const out = samples.map((s) => [Date.parse(s.ts) / 1000, Number(s.value)]);
    // Python sorted() on (ts, value) tuples: ts first, value tie-break.
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out;
}
function inRange(series, lo, hi) {
    const out = [];
    for (const [t, v] of series) {
        if (lo <= t && t < hi)
            out.push(v);
    }
    return out;
}
/** Re-runs the reconstruct_unified.py daily walk via the TS port. */
function runDailyWalk(nDays) {
    const hr = loadSeries("heart_rate");
    const hrv = loadSeries("heart_rate_variability");
    const steps = loadSeries("step_count");
    const energy = loadSeries("active_energy_burned");
    const resp = loadSeries("respiratory_rate");
    // Pacific local day boundaries, fixed PDT -7h for the whole window
    // (Mar-Jul all DST): day start = 2026-03-18T00:00:00-07:00.
    const DAY_SECONDS = 86400;
    const startSec = Date.UTC(2026, 2, 18, 7, 0, 0) / 1000;
    const baselines = {};
    const timeline = [];
    for (let i = 0; i < nDays; i++) {
        const lo = startSec + i * DAY_SECONDS;
        const hi = lo + DAY_SECONDS;
        const hk = {
            heart_rate: inRange(hr, lo, hi),
            heart_rate_variability: inRange(hrv, lo, hi),
            step_count: inRange(steps, lo, hi),
            active_energy_burned: inRange(energy, lo, hi),
            respiratory_rate: inRange(resp, lo, hi),
        };
        const feats = (0, prodPort_js_1.extractIntradayFeatures)(hk, baselines, 12.0);
        const nHr = hk.heart_rate.length;
        const nSteps = hk.step_count.length;
        const yy = (0, prodPort_js_1.inferYinYangState)(feats, baselines);
        const wxf = (0, prodPort_js_1.normalizeForWuxing)(feats, baselines);
        const wxRaw = (0, prodPort_js_1.inferWuxingStates)(wxf, yy.yin_score, yy.yang_score);
        // source_quality rules from reconstruct_unified.classify_window (day
        // windows use min_hr_samples=3).
        const dataOk = feats.heart_rate.data_available || feats.hrv.data_available;
        const quality = dataOk && nHr >= 3
            ? "real_inference"
            : nHr > 0 || nSteps > 0
                ? "sparse_data"
                : "no_data";
        const hasBio = quality === "real_inference" || quality === "sparse_data";
        // Python max(raw_scores, key=raw_scores.get): FIRST key with the max
        // value in insertion order wood, fire, earth, metal, water.
        let dominantRaw = null;
        if (hasBio) {
            let best = prodPort_js_1.WUXING_ELEMENTS[0];
            for (const element of prodPort_js_1.WUXING_ELEMENTS) {
                if (wxRaw[element].score > wxRaw[best].score)
                    best = element;
            }
            if (wxRaw[best].score > 0)
                dominantRaw = PATTERN_NAME[best];
        }
        // Rolling baselines updated only from worn days (skip empty windows).
        if (hasBio)
            (0, prodPort_js_1.updateBaselinesFromFeatures)(baselines, feats);
        timeline.push({
            date: new Date(lo * 1000).toISOString().slice(0, 10),
            source_quality: quality,
            dominant_pattern_raw_pre_gate: dominantRaw,
            yin_score: hasBio ? yy.yin_score : null,
            yang_score: hasBio ? yy.yang_score : null,
        });
    }
    return timeline;
}
(0, node_test_1.describe)("prod port parity vs golden pattern_timeline_v2.json", () => {
    const goldenDays = golden.timeline;
    const walk = runDailyWalk(goldenDays.length);
    (0, node_test_1.it)("golden fixture has the expected shape (107 days, 63 worn)", () => {
        assert.strictEqual(golden.n_days, 107);
        assert.strictEqual(goldenDays.length, 107);
        const worn = goldenDays.filter((d) => d.source_quality === "real_inference");
        assert.strictEqual(worn.length, 63);
    });
    (0, node_test_1.it)("walk covers the same dates as the golden timeline", () => {
        assert.strictEqual(walk.length, goldenDays.length);
        assert.strictEqual(walk[0].date, "2026-03-18");
        assert.strictEqual(walk[walk.length - 1].date, "2026-07-02");
        for (let i = 0; i < walk.length; i++) {
            assert.strictEqual(walk[i].date, goldenDays[i].date, `date drift at index ${i}`);
        }
    });
    (0, node_test_1.it)("source_quality matches the golden for every day", () => {
        for (let i = 0; i < walk.length; i++) {
            assert.strictEqual(walk[i].source_quality, goldenDays[i].source_quality, `source_quality mismatch on ${walk[i].date}`);
        }
    });
    (0, node_test_1.it)("raw dominant pattern matches the golden day-by-day on worn days", () => {
        for (let i = 0; i < walk.length; i++) {
            if (goldenDays[i].source_quality !== "real_inference")
                continue;
            assert.strictEqual(walk[i].dominant_pattern_raw_pre_gate, goldenDays[i].dominant_pattern_raw_pre_gate, `dominant_pattern_raw_pre_gate mismatch on ${walk[i].date}`);
        }
    });
    (0, node_test_1.it)("aggregate raw distribution is exactly TENSION 40 / OVERDRIVE 18 / STAGNATION 4 / CONSTRICTION 1 / DEPLETION 0", () => {
        const distribution = {
            TENSION: 0,
            OVERDRIVE: 0,
            STAGNATION: 0,
            CONSTRICTION: 0,
            DEPLETION: 0,
        };
        for (let i = 0; i < walk.length; i++) {
            if (walk[i].source_quality !== "real_inference")
                continue;
            const pattern = walk[i].dominant_pattern_raw_pre_gate;
            assert.ok(pattern !== null, `worn day ${walk[i].date} has no raw dominant pattern`);
            distribution[pattern] += 1;
        }
        assert.deepStrictEqual(distribution, EXPECTED_RAW_DISTRIBUTION);
    });
    (0, node_test_1.it)("yin/yang scores within +/-1 of golden on worn days", () => {
        for (let i = 0; i < walk.length; i++) {
            if (goldenDays[i].source_quality !== "real_inference")
                continue;
            const day = walk[i];
            assert.ok(Math.abs(day.yin_score - goldenDays[i].yin_score) <= 1, `yin_score off on ${day.date}: got ${day.yin_score}, golden ${goldenDays[i].yin_score}`);
            assert.ok(Math.abs(day.yang_score - goldenDays[i].yang_score) <= 1, `yang_score off on ${day.date}: got ${day.yang_score}, golden ${goldenDays[i].yang_score}`);
        }
    });
});
