/**
 * EnrichmentGate — causal-engine-v2 P2, the reasoner's 7th gate.
 *
 * Sits after the six existing gates (citation / title_ban /
 * time_plausibility / biometrics_firewall / recurrence_cross_source /
 * non_clinical_language). It answers one question: does a corpus theme
 * appear on a pattern's days *more than it does at baseline*, by enough,
 * with enough real backing, to earn attribution-candidate status?
 *
 * The core is a CONTROL RATIO, not a raw count: a theme's hit-rate on
 * the target pattern's days divided by its hit-rate on a reference
 * class (recharging + balanced days). Raw counts let one talkative day
 * flood a high-frequency axis; the control ratio is what let the memory
 * axis show real signal (causal 1.61x / pricing 1.46x) while the
 * calendar axis washed out to noise (<=1x, demoted to context).
 *
 * A theme is promoted to an attribution candidate only if it clears all
 * five conditions; otherwise it degrades to context_only,
 * insufficient_power, or no_data — never a silent pass.
 *
 * Provenance: fixtures/causal-engine-v2/scripts/reunify/enrichment_unified.py
 * and findings.md F5/F7. The enrichment ratio and reference class are
 * ported verbatim; the five-condition gate is the round-4 candidate
 * contract.
 */
export interface EnrichmentThresholds {
    /** Minimum control ratio to be a candidate (round-4 initial value). */
    minRatio: number;
    /** Minimum real-coverage-backed cited days. */
    minBackedDays: number;
    /** Minimum independent sources per backed day (calendar/granola/memory). */
    minSourcesPerDay: number;
}
export declare const DEFAULT_ENRICHMENT_THRESHOLDS: EnrichmentThresholds;
/**
 * Control ratio: the theme's rate on the target days over its rate on
 * the reference class. Returns Infinity when the theme never appears in
 * the reference class but does appear on target days (a real, if
 * unquantifiable, signal); 0 when it never appears on target days.
 */
export declare function enrichmentRatio(targetHits: number, targetN: number, referenceRate: number): number;
/** Round to the same 2 decimals the Python reference emits, for parity. */
export declare function roundRatio(ratio: number): number;
export type EnrichmentVerdict = "attribution_candidate" | "context_only" | "insufficient_power" | "no_data";
export interface CitedDayEvidence {
    date: string;
    /** Did this day fall inside real biometric coverage? (from coverage.ts) */
    backed: boolean;
    /** Distinct corpus sources citing this day: calendar / granola / memory. */
    sources: string[];
}
export interface EnrichmentGateInput {
    theme: string;
    /** Theme hits on the target pattern's days. */
    targetHits: number;
    /** Target pattern's day count. */
    targetN: number;
    /** Theme's hit-rate in the reference class. */
    referenceRate: number;
    /** Size of the reference class (for reporting / power). */
    referenceN: number;
    citedDays: CitedDayEvidence[];
    /** Any cited day is a self-selected extreme → mean-reversion flag. */
    rtmSuspected: boolean;
    thresholds?: EnrichmentThresholds;
}
export interface EnrichmentGateResult {
    theme: string;
    verdict: EnrichmentVerdict;
    ratio: number;
    backedDays: string[];
    /** Backed days that also clear the >=2-source rule. */
    multiSourceBackedDays: string[];
    reasons: string[];
    flags: string[];
}
/**
 * The five-condition candidate gate. Order matters: coverage first (a
 * candidate with no backed days is no_data, not a weak candidate), then
 * enrichment strength, then multi-source support, then RTM/workload
 * flagging (which annotates but does not reject — the flags travel with
 * the surviving claim).
 */
export declare function enrichmentGate(input: EnrichmentGateInput): EnrichmentGateResult;
