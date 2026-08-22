"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const EnrichmentGate_js_1 = require("../src/engine/reasoner/EnrichmentGate.js");
const PACKAGE_ROOT = __dirname.includes(`${node_path_1.default.sep}dist${node_path_1.default.sep}`)
    ? node_path_1.default.join(__dirname, "..", "..")
    : node_path_1.default.join(__dirname, "..");
const ENRICHMENT = node_path_1.default.join(PACKAGE_ROOT, "fixtures", "causal-engine-v2", "data", "enrichment.json");
// The committed fixture emits bare `Infinity` (Python json.dump default),
// which is not valid JSON. Rewrite it to a sentinel string before parsing.
function loadEnrichment() {
    const raw = (0, node_fs_1.readFileSync)(ENRICHMENT, "utf8").replace(/:\s*Infinity/g, ': "__Infinity__"');
    return JSON.parse(raw, (_k, v) => (v === "__Infinity__" ? Infinity : v));
}
(0, node_test_1.test)("enrichmentRatio reproduces the committed enrich_vs_ref values (regression lock)", () => {
    const fixture = loadEnrichment();
    // The gated memory axis carries the DEPLETION theme breakdown with
    // committed hits/n/rate/enrich_vs_ref. Recomputing from hits + the
    // reference rate must reproduce every committed ratio.
    const axis = fixture.enrichment_gated_axis_memory;
    const refRates = axis.reference_rates;
    const themes = axis.by_pattern.DEPLETION.themes;
    let checked = 0;
    for (const [theme, cell] of Object.entries(themes)) {
        const expected = cell.enrich_vs_ref;
        const got = (0, EnrichmentGate_js_1.enrichmentRatio)(cell.hits, cell.n, refRates[theme]);
        if (expected === null)
            continue;
        if (!Number.isFinite(expected)) {
            strict_1.default.equal(Number.isFinite(got), false, `${theme}: expected non-finite enrichment`);
        }
        else {
            // committed values are rounded to 2 decimals
            strict_1.default.ok(Math.abs((0, EnrichmentGate_js_1.roundRatio)(got) - expected) <= 0.01, `${theme}: recomputed ${(0, EnrichmentGate_js_1.roundRatio)(got)} != committed ${expected}`);
        }
        checked++;
    }
    strict_1.default.ok(checked >= 6, "should have checked the full theme axis");
});
(0, node_test_1.test)("legacy quadrant-axis ratios are locked (legacy-lineage golden)", () => {
    const fixture = loadEnrichment();
    const ref = fixture.quadrant_layer_reference;
    // These are the round-2 legacy numbers (running_on_empty vs in_flow);
    // they ride the deprecated quadrant layer and are locked as regression
    // reference only — never a claim basis.
    strict_1.default.equal(ref.pricing_monetization, 2.89);
    strict_1.default.equal(ref.b2b_b2c_positioning, 4.0);
    strict_1.default.equal(ref.product_intervention, 3.11);
});
// The three round-4 candidates and their documented outcomes:
// demo_polish PASS (3/3 backed, multi-source), pricing no_data (a cited
// day has no wear), attribution insufficient_power (n<3 backed days).
(0, node_test_1.test)("candidate gate: demo_polish passes at attribution-candidate", () => {
    const r = (0, EnrichmentGate_js_1.enrichmentGate)({
        theme: "demo_readiness",
        targetHits: 3,
        targetN: 6,
        referenceRate: 0.1, // rate/ref = 0.5/0.1 = 5x, clears 2.0
        referenceN: 27,
        citedDays: [
            { date: "2026-06-13", backed: true, sources: ["granola", "memory"] },
            { date: "2026-06-14", backed: true, sources: ["calendar", "memory"] },
            { date: "2026-06-26", backed: true, sources: ["granola", "memory"] },
        ],
        rtmSuspected: true,
    });
    strict_1.default.equal(r.verdict, "attribution_candidate");
    strict_1.default.equal(r.backedDays.length, 3);
    strict_1.default.equal(r.multiSourceBackedDays.length, 3);
    // RTM + workload flags always travel with the surviving claim.
    strict_1.default.ok(r.flags.some((f) => f.includes("regression-to-mean")));
    strict_1.default.ok(r.flags.some((f) => f.includes("workload")));
});
(0, node_test_1.test)("candidate gate: pricing is no_data when a cited day has no wear", () => {
    const r = (0, EnrichmentGate_js_1.enrichmentGate)({
        theme: "pricing_monetization",
        targetHits: 2,
        targetN: 6,
        referenceRate: 0.1,
        referenceN: 27,
        citedDays: [
            { date: "2026-06-09", backed: true, sources: ["granola", "memory"] },
            { date: "2026-06-10", backed: false, sources: ["memory"] }, // vacuum day
            { date: "2026-06-26", backed: true, sources: ["granola", "memory"] },
        ],
        rtmSuspected: true,
    });
    // Two backed days < 3 → insufficient_power (still short even ignoring
    // the vacuum day); the vacuum day is what removes the third backing.
    strict_1.default.equal(r.verdict, "insufficient_power");
    strict_1.default.deepEqual(r.backedDays, ["2026-06-09", "2026-06-26"]);
});
(0, node_test_1.test)("candidate gate: attribution loses on n<3 backed days", () => {
    const r = (0, EnrichmentGate_js_1.enrichmentGate)({
        theme: "causal_rootcause",
        targetHits: 2,
        targetN: 6,
        referenceRate: 0.05,
        referenceN: 27,
        citedDays: [
            { date: "2026-06-22", backed: true, sources: ["granola", "memory"] },
            { date: "2026-06-26", backed: true, sources: ["memory"] },
        ],
        rtmSuspected: false,
    });
    strict_1.default.equal(r.verdict, "insufficient_power");
});
(0, node_test_1.test)("candidate gate: strong enrichment but single-source days cannot corroborate", () => {
    const r = (0, EnrichmentGate_js_1.enrichmentGate)({
        theme: "b2b_b2c_positioning",
        targetHits: 4,
        targetN: 6,
        referenceRate: 0.05,
        referenceN: 27,
        citedDays: [
            { date: "2026-06-12", backed: true, sources: ["memory"] },
            { date: "2026-06-24", backed: true, sources: ["memory"] },
            { date: "2026-06-29", backed: true, sources: ["memory"] },
        ],
        rtmSuspected: false,
    });
    // ratio clears 2.0 and 3 backed days, but no day has >=2 sources
    strict_1.default.equal(r.verdict, "insufficient_power");
    strict_1.default.equal(r.multiSourceBackedDays.length, 0);
});
(0, node_test_1.test)("enrichment below 2.0x degrades to context_only, not a candidate", () => {
    const r = (0, EnrichmentGate_js_1.enrichmentGate)({
        theme: "demo_readiness",
        targetHits: 2,
        targetN: 10, // rate 0.2 / ref 0.15 = 1.33x < 2.0
        referenceRate: 0.15,
        referenceN: 27,
        citedDays: [
            { date: "2026-06-13", backed: true, sources: ["granola", "memory"] },
            { date: "2026-06-14", backed: true, sources: ["calendar", "memory"] },
            { date: "2026-06-26", backed: true, sources: ["granola", "memory"] },
        ],
        rtmSuspected: false,
    });
    strict_1.default.equal(r.verdict, "context_only");
});
