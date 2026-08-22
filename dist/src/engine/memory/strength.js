"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HALF_LIFE_WEEKS = exports.INTERVENTION_OUTCOME_WEIGHT = exports.OBSERVATION_WEIGHT = exports.DORMANCY_THRESHOLD = exports.WEEK_SECONDS = void 0;
exports.computeStrength = computeStrength;
exports.decayStateFor = decayStateFor;
exports.WEEK_SECONDS = 7 * 24 * 60 * 60;
exports.DORMANCY_THRESHOLD = 0.3;
exports.OBSERVATION_WEIGHT = 1.0;
exports.INTERVENTION_OUTCOME_WEIGHT = 2.5;
/** Half-life in weeks per claim level; stronger claims decay slower. */
exports.HALF_LIFE_WEEKS = {
    correlation: 6,
    attribution_candidate: 6,
    causal_hypothesis: 16,
    validated_pattern: 52,
};
/** Validated patterns decay to dormant, never to zero. */
const STRENGTH_FLOOR = {
    correlation: 0,
    attribution_candidate: 0,
    causal_hypothesis: 0,
    validated_pattern: 0.5,
};
/**
 * Pure function of evidence timestamps and now: strength = sum of weight_j * 2^(-delta_weeks_j / half_life).
 * Recomputed from scratch each run — never read-modify-write, so re-runs cannot double-decay.
 */
function computeStrength(evidence, level, nowTs) {
    const halfLife = exports.HALF_LIFE_WEEKS[level];
    let sum = 0;
    for (const item of evidence) {
        if (typeof item.observed_at_ts !== "number")
            continue;
        const deltaWeeks = Math.max(0, (nowTs - item.observed_at_ts) / exports.WEEK_SECONDS);
        const weight = Number.isFinite(item.weight) ? item.weight : exports.OBSERVATION_WEIGHT;
        sum += weight * Math.pow(2, -deltaWeeks / halfLife);
    }
    const floored = Math.max(sum, STRENGTH_FLOOR[level]);
    return Math.round(floored * 10000) / 10000;
}
function decayStateFor(strength) {
    return strength < exports.DORMANCY_THRESHOLD ? "dormant" : "active";
}
