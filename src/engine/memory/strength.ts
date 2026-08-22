import { DecayState, MemoryClaimLevel } from "./types.js";

export const WEEK_SECONDS = 7 * 24 * 60 * 60;
export const DORMANCY_THRESHOLD = 0.3;
export const OBSERVATION_WEIGHT = 1.0;
export const INTERVENTION_OUTCOME_WEIGHT = 2.5;

/** Half-life in weeks per claim level; stronger claims decay slower. */
export const HALF_LIFE_WEEKS: Record<MemoryClaimLevel, number> = {
  correlation: 6,
  attribution_candidate: 6,
  causal_hypothesis: 16,
  validated_pattern: 52,
};

/** Validated patterns decay to dormant, never to zero. */
const STRENGTH_FLOOR: Record<MemoryClaimLevel, number> = {
  correlation: 0,
  attribution_candidate: 0,
  causal_hypothesis: 0,
  validated_pattern: 0.5,
};

export interface EvidenceForStrength {
  observed_at_ts: number | null;
  weight: number;
}

/**
 * Pure function of evidence timestamps and now: strength = sum of weight_j * 2^(-delta_weeks_j / half_life).
 * Recomputed from scratch each run — never read-modify-write, so re-runs cannot double-decay.
 */
export function computeStrength(
  evidence: EvidenceForStrength[],
  level: MemoryClaimLevel,
  nowTs: number,
): number {
  const halfLife = HALF_LIFE_WEEKS[level];
  let sum = 0;
  for (const item of evidence) {
    if (typeof item.observed_at_ts !== "number") continue;
    const deltaWeeks = Math.max(0, (nowTs - item.observed_at_ts) / WEEK_SECONDS);
    const weight = Number.isFinite(item.weight) ? item.weight : OBSERVATION_WEIGHT;
    sum += weight * Math.pow(2, -deltaWeeks / halfLife);
  }
  const floored = Math.max(sum, STRENGTH_FLOOR[level]);
  return Math.round(floored * 10000) / 10000;
}

export function decayStateFor(strength: number): DecayState {
  return strength < DORMANCY_THRESHOLD ? "dormant" : "active";
}
