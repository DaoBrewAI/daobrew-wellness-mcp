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
import { CappedClaim, CoverageTable } from "../coverage.js";
import { PatternSignature, RawSample } from "../signals/patterns.js";
import { EnrichmentGateResult, EnrichmentThresholds } from "./EnrichmentGate.js";
/** One corpus axis to test at the 7th gate. `citedDays.backed` is filled
 *  from the coverage table — callers only supply dates and sources. */
export interface EnrichmentAxisInput {
    theme: string;
    targetHits: number;
    targetN: number;
    referenceRate: number;
    referenceN: number;
    citedDays: {
        date: string;
        sources: string[];
    }[];
    rtmSuspected: boolean;
    /** Who minted the theme — observability ONLY. 'memory_topic' (default) or
     *  'llm_proposed' (proposer.ts). The gate/matching semantics are IDENTICAL
     *  for both origins: hits stay literal whole-word corpus matches and
     *  citations stay literal rows; LLM text is never evidence. */
    origin?: "memory_topic" | "llm_proposed";
}
export interface ReasonerV2Context {
    coverage: CoverageTable;
    signaturesByDate: Map<string, PatternSignature>;
    timezoneOffsetHours: number;
    /** Candidate axes for the 7th gate; the primary (root) axis first. */
    enrichmentAxes: EnrichmentAxisInput[];
    thresholds: EnrichmentThresholds;
}
export interface V2ContextOptions {
    timezoneOffsetHours?: number;
    enrichmentAxes?: EnrichmentAxisInput[];
    thresholds?: EnrichmentThresholds;
}
/** Local day key for an epoch-seconds timestamp, matching coverage.ts. */
export declare function localDayKey(epochSeconds: number, offsetHours: number): string;
/**
 * Build the v2 context from raw samples. Returns null when there are no
 * usable samples — the caller stays on the legacy path, honestly.
 */
export declare function buildV2Context(samples: readonly RawSample[], options?: V2ContextOptions): ReasonerV2Context | null;
export interface GatedAxisResult {
    gate: EnrichmentGateResult;
    coverageCap: CappedClaim;
}
/**
 * Run one axis through the 7th gate with coverage-derived backing:
 * a cited day is backed iff the coverage table calls it worn.
 */
export declare function runEnrichmentGateWithCoverage(axis: EnrichmentAxisInput, coverage: CoverageTable, thresholds?: EnrichmentThresholds): GatedAxisResult;
/** Map a gate verdict to the claim string written on the root node.
 *  The ceiling never rises above the deterministic reasoner's cap. */
export declare function claimLevelForVerdict(verdict: EnrichmentGateResult["verdict"], ceiling: string): string;
