import { DecayState, MemoryClaimLevel } from "./types.js";
export declare const WEEK_SECONDS: number;
export declare const DORMANCY_THRESHOLD = 0.3;
export declare const OBSERVATION_WEIGHT = 1;
export declare const INTERVENTION_OUTCOME_WEIGHT = 2.5;
/** Half-life in weeks per claim level; stronger claims decay slower. */
export declare const HALF_LIFE_WEEKS: Record<MemoryClaimLevel, number>;
export interface EvidenceForStrength {
    observed_at_ts: number | null;
    weight: number;
}
/**
 * Pure function of evidence timestamps and now: strength = sum of weight_j * 2^(-delta_weeks_j / half_life).
 * Recomputed from scratch each run — never read-modify-write, so re-runs cannot double-decay.
 */
export declare function computeStrength(evidence: EvidenceForStrength[], level: MemoryClaimLevel, nowTs: number): number;
export declare function decayStateFor(strength: number): DecayState;
