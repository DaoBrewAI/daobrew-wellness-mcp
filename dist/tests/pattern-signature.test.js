"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const coverage_js_1 = require("../src/engine/coverage.js");
const patterns_js_1 = require("../src/engine/signals/patterns.js");
const PACKAGE_ROOT = __dirname.includes(`${node_path_1.default.sep}dist${node_path_1.default.sep}`)
    ? node_path_1.default.join(__dirname, "..", "..")
    : node_path_1.default.join(__dirname, "..");
const FIXTURES = node_path_1.default.join(PACKAGE_ROOT, "fixtures", "causal-engine-v2", "data", "reunified");
function unifiedSamples() {
    const unified = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(FIXTURES, "unified_v2.json"), "utf8"));
    const samples = [];
    for (const [metric, rows] of Object.entries(unified.metrics)) {
        for (const row of rows) {
            samples.push({ metric, value: row.value, timestamp: row.ts });
        }
    }
    return samples;
}
(0, node_test_1.test)("raw signature reproduces the 63-worn-day golden distribution; DEPLETION hard-zero", () => {
    const samples = unifiedSamples();
    const coverage = (0, coverage_js_1.buildCoverageTable)(samples.map((s) => ({ metric: s.metric, timestamp: s.timestamp })));
    const signatures = (0, patterns_js_1.computePatternSignatures)(samples, coverage);
    const dist = (0, patterns_js_1.wornDominantDistribution)(signatures);
    // The P1 gate: raw dominant on worn days, DEPLETION exactly 0.
    strict_1.default.equal(dist["TENSION"], 40);
    strict_1.default.equal(dist["OVERDRIVE"], 18);
    strict_1.default.equal(dist["STAGNATION"], 4);
    strict_1.default.equal(dist["CONSTRICTION"], 1);
    strict_1.default.equal(dist["DEPLETION"] ?? 0, 0, "DEPLETION must never appear in raw signal");
    const worn = signatures.filter((s) => s.quality === "real_inference");
    strict_1.default.equal(worn.length, 63);
});
(0, node_test_1.test)("every signature carries confidence + coverage; unmeasurable patterns are capped", () => {
    const samples = unifiedSamples();
    const coverage = (0, coverage_js_1.buildCoverageTable)(samples.map((s) => ({ metric: s.metric, timestamp: s.timestamp })));
    const signatures = (0, patterns_js_1.computePatternSignatures)(samples, coverage);
    for (const sig of signatures) {
        strict_1.default.ok(sig.confidence >= 0 && sig.confidence <= 1);
        strict_1.default.ok(sig.coverage >= 0 && sig.coverage <= 1);
        if (patterns_js_1.UNMEASURABLE_PATTERNS.has(sig.dominant)) {
            strict_1.default.ok(sig.flaggedUnmeasurable && sig.confidence <= 0.2, `${sig.date}: unmeasurable dominant must be flagged and low-confidence`);
        }
    }
    // HR-separable dominants (TENSION/OVERDRIVE) carry the hr-separable tag.
    const hrDay = signatures.find((s) => s.dominant === "OVERDRIVE" && s.quality === "real_inference");
    strict_1.default.ok(hrDay);
    strict_1.default.equal(hrDay.measurability, "hr-separable");
});
(0, node_test_1.test)("no-data days resolve to BALANCED, never a fabricated depletion", () => {
    const samples = unifiedSamples();
    const coverage = (0, coverage_js_1.buildCoverageTable)(samples.map((s) => ({ metric: s.metric, timestamp: s.timestamp })));
    const signatures = (0, patterns_js_1.computePatternSignatures)(samples, coverage);
    const vacuum = signatures.filter((s) => s.quality === "no_data");
    strict_1.default.ok(vacuum.length > 0);
    for (const sig of vacuum) {
        strict_1.default.equal(sig.dominant, "BALANCED");
        strict_1.default.equal(sig.confidence, 0);
    }
});
