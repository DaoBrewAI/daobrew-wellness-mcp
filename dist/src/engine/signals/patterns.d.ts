/**
 * Pattern Signature v2 — causal-engine-v2 P1.
 *
 * Computes a stress-pattern signature straight from raw health samples,
 * bypassing the backend's step-driven eligibility gate. This is the
 * documented replacement for the Reasoner's biometricPatternScores
 * (Reasoner.ts:449, which re-encodes the gated quadrant into patterns)
 * and its .depletion fallback (:503).
 *
 * Three disciplines from the reasoner-redesign direction (findings F3/F6):
 *
 * 1. RAW, not gated. Patterns come from prodPort's ungated WuXing raw
 *    scores over a 14-day personal rolling baseline — never the
 *    step-gated display value. On the committed snapshot the raw
 *    dominant distribution is TENSION 40 / OVERDRIVE 18 / STAGNATION 4
 *    / CONSTRICTION 1 / DEPLETION 0; DEPLETION is never emitted by day-
 *    time signal (it needs a nighttime-recovery layer that doesn't exist
 *    yet).
 *
 * 2. Measurability is explicit. TENSION vs OVERDRIVE separate cleanly on
 *    all-day HR (Hedges g = -3.26) but NOT on HRV/RHR (CI crosses 0), so
 *    those axes carry a low measurability tag. CONSTRICTION is
 *    unmeasurable with current sensors (needs respiration/location);
 *    DEPLETION is unmeasurable in daytime signal. The signature says so
 *    rather than inventing a state.
 *
 * 3. Every signature carries confidence + coverage. A pattern is a
 *    triple — label, how sure, how much wear backs it — never a bare
 *    label. No-activation resolves to an explicit low-confidence
 *    `balanced` state, not a collapse to depletion.
 */
import { CoverageTable, DayCoverage } from "../coverage.js";
export type PatternLabel = "TENSION" | "OVERDRIVE" | "STAGNATION" | "CONSTRICTION" | "DEPLETION" | "BALANCED";
/** Patterns that current sensors cannot actually measure — flagged, never
 *  emitted as a confident daytime dominant. */
export declare const UNMEASURABLE_PATTERNS: ReadonlySet<PatternLabel>;
export type Measurability = "hr-separable" | "low" | "unmeasurable";
export interface PatternSignature {
    date: string;
    /** The raw dominant pattern, or BALANCED when nothing activates. */
    dominant: PatternLabel;
    /** Per-pattern raw scores (pre-gate), wood→water order preserved. */
    scores: Record<PatternLabel, number>;
    /** 0..1 — separation strength of the dominant, discounted for wear. */
    confidence: number;
    /** Wear fraction of the day (from the coverage table). */
    coverage: number;
    /** How trustworthy the dominant's axis is (see class doc). */
    measurability: Measurability;
    /** True when the dominant is a sensor-unmeasurable pattern — callers
     *  must not treat it as a confident physiological read. */
    flaggedUnmeasurable: boolean;
    quality: DayCoverage["quality"];
}
export interface SignatureOptions {
    timezoneOffsetHours?: number;
    minHrSamples?: number;
}
export interface RawSample {
    metric: string;
    value: number;
    timestamp: string;
}
/**
 * Walk a date span day by day and emit one signature per day. Baselines
 * update only on worn days (mirrors the reconstruction driver); windows
 * are classified independently (no cross-day EMA smoothing over gaps).
 * Coverage/quality are read from a prebuilt CoverageTable so the mock-
 * contamination and wear rules stay in one place.
 */
export declare function computePatternSignatures(samples: readonly RawSample[], coverage: CoverageTable, options?: SignatureOptions): PatternSignature[];
/** Distribution of raw dominant patterns over worn days — the P1 gate metric. */
export declare function wornDominantDistribution(signatures: readonly PatternSignature[]): Record<string, number>;
