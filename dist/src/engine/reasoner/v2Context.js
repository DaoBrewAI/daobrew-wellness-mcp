"use strict";
/**
 * Reasoner v2 context — causal-engine-v2 P3.
 *
 * Bundles the three P1/P2 layers into one optional input the Reasoner
 * activates on: raw multi-metric pattern signatures (patterns.ts), the
 * wear-coverage table (coverage.ts), and the corpus enrichment axes fed
 * to the 7th gate (EnrichmentGate.ts).
 *
 * v2 is INPUT-ACTIVATED: when a run has raw samples, run.ts (or the
 * dry-run) builds this context and the Reasoner swaps its pattern layer
 * from the legacy gated-quadrant re-encoding to the raw signature, caps
 * claims by coverage, and runs the enrichment gate. Runs without raw
 * samples keep the legacy path untouched (and their outputs keep the
 * legacy `watch_data_only` provenance tag so nothing masquerades as v2).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.localDayKey = localDayKey;
exports.buildV2Context = buildV2Context;
exports.runEnrichmentGateWithCoverage = runEnrichmentGateWithCoverage;
exports.claimLevelForVerdict = claimLevelForVerdict;
const coverage_js_1 = require("../coverage.js");
const patterns_js_1 = require("../signals/patterns.js");
const EnrichmentGate_js_1 = require("./EnrichmentGate.js");
const DEFAULT_OFFSET_HOURS = -7;
/** Local day key for an epoch-seconds timestamp, matching coverage.ts. */
function localDayKey(epochSeconds, offsetHours) {
    return new Date((epochSeconds + offsetHours * 3600) * 1000)
        .toISOString()
        .slice(0, 10);
}
/**
 * Build the v2 context from raw samples. Returns null when there are no
 * usable samples — the caller stays on the legacy path, honestly.
 */
function buildV2Context(samples, options = {}) {
    if (samples.length === 0)
        return null;
    const offset = options.timezoneOffsetHours ?? DEFAULT_OFFSET_HOURS;
    const coverage = (0, coverage_js_1.buildCoverageTable)(samples.map((s) => ({ metric: s.metric, timestamp: s.timestamp })), { timezoneOffsetHours: offset });
    if (coverage.wornDays.length === 0)
        return null;
    const signatures = (0, patterns_js_1.computePatternSignatures)(samples, coverage, {
        timezoneOffsetHours: offset,
    });
    return {
        coverage,
        signaturesByDate: new Map(signatures.map((sig) => [sig.date, sig])),
        timezoneOffsetHours: offset,
        enrichmentAxes: options.enrichmentAxes ?? [],
        thresholds: options.thresholds ?? EnrichmentGate_js_1.DEFAULT_ENRICHMENT_THRESHOLDS,
    };
}
/**
 * Run one axis through the 7th gate with coverage-derived backing:
 * a cited day is backed iff the coverage table calls it worn.
 */
function runEnrichmentGateWithCoverage(axis, coverage, thresholds) {
    const citedDays = axis.citedDays.map((day) => ({
        date: day.date,
        backed: coverage.days[day.date]?.worn ?? false,
        sources: day.sources,
    }));
    const gate = (0, EnrichmentGate_js_1.enrichmentGate)({
        theme: axis.theme,
        targetHits: axis.targetHits,
        targetN: axis.targetN,
        referenceRate: axis.referenceRate,
        referenceN: axis.referenceN,
        citedDays,
        rtmSuspected: axis.rtmSuspected,
        thresholds,
    });
    const coverageCap = (0, coverage_js_1.capClaimByCoverage)("attribution_candidate", axis.citedDays.map((day) => day.date), coverage);
    return { gate, coverageCap };
}
/** Map a gate verdict to the claim string written on the root node.
 *  The ceiling never rises above the deterministic reasoner's cap. */
function claimLevelForVerdict(verdict, ceiling) {
    switch (verdict) {
        case "attribution_candidate":
            return ceiling;
        case "context_only":
            return "context_only";
        case "insufficient_power":
            return "insufficient_power";
        case "no_data":
            return "no_data";
    }
}
