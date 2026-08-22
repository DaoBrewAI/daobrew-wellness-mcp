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
// Compiled tests run from dist/tests/, sources from tests/ — resolve the
// fixtures dir from the package root either way.
const PACKAGE_ROOT = __dirname.includes(`${node_path_1.default.sep}dist${node_path_1.default.sep}`)
    ? node_path_1.default.join(__dirname, "..", "..")
    : node_path_1.default.join(__dirname, "..");
const FIXTURES = node_path_1.default.join(PACKAGE_ROOT, "fixtures", "causal-engine-v2", "data", "reunified");
function unifiedSamples() {
    const unified = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(FIXTURES, "unified_v2.json"), "utf8"));
    const samples = [];
    for (const [metric, rows] of Object.entries(unified.metrics)) {
        for (const row of rows)
            samples.push({ metric, timestamp: row.ts });
    }
    return samples;
}
// The 8 vacuum days the round-4 findings name inside the May-June void
// window — coverage must call every one of them unworn (F4 gate).
const KNOWN_VACUUM_DAYS = [
    "2026-05-29",
    "2026-05-31",
    "2026-06-04",
    "2026-06-05",
    "2026-06-10",
    "2026-06-19",
    "2026-06-20",
    "2026-06-21",
];
(0, node_test_1.test)("coverage table reproduces the 63 worn days of the unified snapshot", () => {
    const table = (0, coverage_js_1.buildCoverageTable)(unifiedSamples());
    strict_1.default.equal(table.wornDays.length, 63);
    strict_1.default.equal(table.span?.start, "2026-03-18");
    strict_1.default.equal(table.span?.end, "2026-07-02");
    for (const day of KNOWN_VACUUM_DAYS) {
        strict_1.default.equal(table.days[day]?.worn ?? false, false, `${day} must be unworn`);
        strict_1.default.ok(table.vacuumDays.includes(day), `${day} must be a vacuum day (zero raw samples)`);
    }
});
(0, node_test_1.test)("claim capping: a cited vacuum day drops attribution to context-only", () => {
    const table = (0, coverage_js_1.buildCoverageTable)(unifiedSamples());
    // pricing candidate shape from the findings: cited 6/09 (worn), 6/10
    // (vacuum), 6/26 (worn) — the 6/10 gap caps the claim.
    const capped = (0, coverage_js_1.capClaimByCoverage)("attribution_candidate", ["2026-06-09", "2026-06-10", "2026-06-26"], table);
    strict_1.default.equal(capped.level, "context_only");
    strict_1.default.deepEqual(capped.unbackedDates, ["2026-06-10"]);
    strict_1.default.ok(capped.cappedBecause?.includes("2026-06-10"));
    // demo_polish shape: all three cited days worn — claim survives.
    const passed = (0, coverage_js_1.capClaimByCoverage)("attribution_candidate", ["2026-06-13", "2026-06-14", "2026-06-26"], table);
    strict_1.default.equal(passed.level, "attribution_candidate");
    strict_1.default.equal(passed.unbackedDates.length, 0);
    const empty = (0, coverage_js_1.capClaimByCoverage)("attribution_candidate", [], table);
    strict_1.default.equal(empty.level, "insufficient_power");
});
(0, node_test_1.test)("mock contamination: state windows without raw rows are synthetic (F8)", () => {
    const samples = [
        { metric: "heart_rate", timestamp: "2026-06-23T10:00:00+00:00" },
        { metric: "heart_rate", timestamp: "2026-06-23T11:00:00+00:00" },
    ];
    const t = (iso) => Date.parse(iso) / 1000;
    const report = (0, coverage_js_1.detectMockContamination)([
        // real: raw rows inside
        { id: "w1", startTs: t("2026-06-23T09:00:00Z"), endTs: t("2026-06-23T12:00:00Z") },
        // mock: state exists after the sync break, no raw rows
        { id: "w2", startTs: t("2026-06-24T09:00:00Z"), endTs: t("2026-06-24T21:00:00Z") },
    ], samples);
    strict_1.default.deepEqual(report.clean.map((w) => w.id), ["w1"]);
    strict_1.default.deepEqual(report.contaminated.map((w) => w.id), ["w2"]);
});
(0, node_test_1.test)("coverage fraction counts distinct 2h HR buckets", () => {
    const samples = [
        // three samples in the same local bucket + one in another bucket,
        // plus enough HR rows to make the day worn
        { metric: "heart_rate", timestamp: "2026-06-01T10:05:00-07:00" },
        { metric: "heart_rate", timestamp: "2026-06-01T10:25:00-07:00" },
        { metric: "heart_rate", timestamp: "2026-06-01T11:15:00-07:00" },
        { metric: "heart_rate", timestamp: "2026-06-01T15:00:00-07:00" },
    ];
    const table = (0, coverage_js_1.buildCoverageTable)(samples);
    const day = table.days["2026-06-01"];
    strict_1.default.ok(day.worn);
    strict_1.default.equal(day.hrBucketsCovered, 2);
    strict_1.default.equal(day.coverageFraction, 2 / 12);
});
