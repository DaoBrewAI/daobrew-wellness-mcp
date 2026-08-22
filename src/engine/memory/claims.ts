import { CLAIM_LEVELS, InfluenceLevel, MemoryClaimLevel } from "./types.js";

const GRAPH_CLAIM_MAP: Record<string, MemoryClaimLevel> = {
  source_backed_hypothesis_not_settled_causality: "attribution_candidate",
  insufficient_evidence: "correlation",
};

export function mapGraphClaimLevel(raw: string | undefined | null): MemoryClaimLevel {
  if (raw && GRAPH_CLAIM_MAP[raw]) return GRAPH_CLAIM_MAP[raw];
  return "correlation";
}

const INFLUENCE_BY_CLAIM: Record<MemoryClaimLevel, InfluenceLevel> = {
  correlation: "background_context",
  attribution_candidate: "candidate_ranking",
  causal_hypothesis: "recommendation",
  validated_pattern: "personalization",
};

export function influenceForClaim(level: MemoryClaimLevel): InfluenceLevel {
  return INFLUENCE_BY_CLAIM[level];
}

/** Memory-only demotion: threads backed solely by user_insights stay background context. */
export function gateThreadInfluence(level: MemoryClaimLevel, evidenceTables: Array<string | null>): InfluenceLevel {
  const external = evidenceTables.filter((table) => table && table !== "user_insights");
  if (external.length === 0) return "background_context";
  return influenceForClaim(level);
}

export function compareClaimLevels(a: MemoryClaimLevel, b: MemoryClaimLevel): number {
  return CLAIM_LEVELS.indexOf(a) - CLAIM_LEVELS.indexOf(b);
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
export function promotedClaimLevel(
  base: MemoryClaimLevel,
  confirmations: number,
  contradictions: number,
): MemoryClaimLevel {
  if (compareClaimLevels(base, "attribution_candidate") < 0) return base;
  if (contradictions >= 2) return base;
  if (confirmations >= 5 && contradictions === 0) return "validated_pattern";
  if (confirmations >= 2 && contradictions <= 1) return "causal_hypothesis";
  return base;
}

/**
 * Deterministic verb bans per claim level; applied to LLM snapshot output.
 * Correlation and attribution_candidate deliberately share one policy — both
 * sit below the causal-language line.
 */
const SUB_CAUSAL_BANS: RegExp[] = [
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

const BANNED_LANGUAGE: Record<MemoryClaimLevel, RegExp[]> = {
  correlation: SUB_CAUSAL_BANS,
  attribution_candidate: SUB_CAUSAL_BANS,
  causal_hypothesis: [/\bproves?\b/i, /\bproven\b/i, /\bdefinitely\b/i, /\bconfirmed\b/i, /\balways\b/i, /\bcertainly\b/i],
  validated_pattern: [/\bproves?\b/i, /\bproven\b/i, /\bcertainly\b/i],
};

export function lintCausalLanguage(text: string, level: MemoryClaimLevel): string[] {
  const violations: string[] = [];
  for (const pattern of BANNED_LANGUAGE[level]) {
    const match = text.match(pattern);
    if (match) violations.push(`banned_for_${level}: "${match[0]}"`);
  }
  return violations;
}
