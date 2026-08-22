"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapGraphClaimLevel = mapGraphClaimLevel;
exports.influenceForClaim = influenceForClaim;
exports.gateThreadInfluence = gateThreadInfluence;
exports.compareClaimLevels = compareClaimLevels;
exports.promotedClaimLevel = promotedClaimLevel;
exports.lintCausalLanguage = lintCausalLanguage;
const types_js_1 = require("./types.js");
const GRAPH_CLAIM_MAP = {
    source_backed_hypothesis_not_settled_causality: "attribution_candidate",
    insufficient_evidence: "correlation",
};
function mapGraphClaimLevel(raw) {
    if (raw && GRAPH_CLAIM_MAP[raw])
        return GRAPH_CLAIM_MAP[raw];
    return "correlation";
}
const INFLUENCE_BY_CLAIM = {
    correlation: "background_context",
    attribution_candidate: "candidate_ranking",
    causal_hypothesis: "recommendation",
    validated_pattern: "personalization",
};
function influenceForClaim(level) {
    return INFLUENCE_BY_CLAIM[level];
}
/** Memory-only demotion: threads backed solely by user_insights stay background context. */
function gateThreadInfluence(level, evidenceTables) {
    const external = evidenceTables.filter((table) => table && table !== "user_insights");
    if (external.length === 0)
        return "background_context";
    return influenceForClaim(level);
}
function compareClaimLevels(a, b) {
    return types_js_1.CLAIM_LEVELS.indexOf(a) - types_js_1.CLAIM_LEVELS.indexOf(b);
}
/**
 * D1 promotion thresholds, evaluated as a PURE function every nightly — never
 * incremental read-modify-write, so re-runs are stable and a wave of
 * contradictions demotes without any "silent demote" in upsert SQL:
 *   X>=2               -> back to base (whatever was earned is re-evaluated away)
 *   C>=5 and X=0       -> validated_pattern
 *   C>=2 and X<=1      -> causal_hypothesis
 * A correlation base never promotes: promotion presumes the thread at least
 * reached attribution_candidate on source-backed evidence.
 */
function promotedClaimLevel(base, confirmations, contradictions) {
    if (compareClaimLevels(base, "attribution_candidate") < 0)
        return base;
    if (contradictions >= 2)
        return base;
    if (confirmations >= 5 && contradictions === 0)
        return "validated_pattern";
    if (confirmations >= 2 && contradictions <= 1)
        return "causal_hypothesis";
    return base;
}
/**
 * Deterministic verb bans per claim level; applied to LLM snapshot output.
 * Correlation and attribution_candidate deliberately share one policy — both
 * sit below the causal-language line.
 */
const SUB_CAUSAL_BANS = [
    /\bcauses?\b/i,
    /\bcaused\b/i,
    /\bleads? to\b/i,
    /\bled to\b/i,
    /\bdrives?\b/i,
    /\bbecause of\b/i,
    /\bresults? in\b/i,
    /\bmakes? (you|me|them)\b/i,
    /\bdue to\b/i,
];
const BANNED_LANGUAGE = {
    correlation: SUB_CAUSAL_BANS,
    attribution_candidate: SUB_CAUSAL_BANS,
    causal_hypothesis: [/\bproves?\b/i, /\bproven\b/i, /\bdefinitely\b/i, /\bconfirmed\b/i, /\balways\b/i, /\bcertainly\b/i],
    validated_pattern: [/\bproves?\b/i, /\bproven\b/i, /\bcertainly\b/i],
};
function lintCausalLanguage(text, level) {
    const violations = [];
    for (const pattern of BANNED_LANGUAGE[level]) {
        const match = text.match(pattern);
        if (match)
            violations.push(`banned_for_${level}: "${match[0]}"`);
    }
    return violations;
}
