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
export interface RawCoverageSample {
    metric: string;
    /** ISO-8601 timestamp (any zone; normalized internally). */
    timestamp: string;
}
export type DayQuality = "real_inference" | "sparse_data" | "no_data";
export interface DayCoverage {
    date: string;
    /** Raw sample count per metric for the local day. */
    counts: Record<string, number>;
    totalSamples: number;
    /** real_inference — the only quality that backs claims. */
    worn: boolean;
    quality: DayQuality;
    /** Of 12 two-hour buckets, how many hold at least one HR sample. */
    hrBucketsCovered: number;
    /** hrBucketsCovered / 12 — the day's wear fraction. */
    coverageFraction: number;
}
export interface CoverageTable {
    days: Record<string, DayCoverage>;
    wornDays: string[];
    /** Days inside the span with zero raw samples of any metric. */
    vacuumDays: string[];
    span: {
        start: string;
        end: string;
    } | null;
    timezoneOffsetHours: number;
}
export interface CoverageOptions {
    /** Fixed local-day offset in hours (default -7, Pacific daylight —
     *  matches the committed unified fixtures Mar–Jul 2026). */
    timezoneOffsetHours?: number;
    /** Minimum HR samples for a worn (real_inference) day. */
    minHrSamples?: number;
}
export declare function buildCoverageTable(samples: readonly RawCoverageSample[], options?: CoverageOptions): CoverageTable;
/** Claim ladder, weakest to strongest. The engine's ceiling stays
 *  attribution_candidate (n=1 passive logs never identify causality). */
export type ClaimLevel = "insufficient_power" | "context_only" | "attribution_candidate";
export interface CappedClaim {
    level: ClaimLevel;
    backedDates: string[];
    unbackedDates: string[];
    cappedBecause: string | null;
}
/**
 * Cap a candidate's claim level by the coverage of its cited dates.
 * Any cited day falling outside real biometric coverage drops the
 * ceiling to context-only — the day cannot physiologically back the
 * claim, whatever the corpus says.
 */
export declare function capClaimByCoverage(requested: ClaimLevel, citedDates: readonly string[], table: CoverageTable): CappedClaim;
export interface StateWindow {
    /** Inclusive window start, epoch seconds UTC. */
    startTs: number;
    /** Exclusive window end, epoch seconds UTC. */
    endTs: number;
    id?: string;
}
export interface MockContaminationReport {
    clean: StateWindow[];
    /** State exists but the raw table holds no samples in the window —
     *  synthetic; its readings never enter an evidence chain. */
    contaminated: StateWindow[];
}
export declare function detectMockContamination(states: readonly StateWindow[], samples: readonly RawCoverageSample[]): MockContaminationReport;
