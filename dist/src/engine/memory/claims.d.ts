import { InfluenceLevel, MemoryClaimLevel } from "./types.js";
export declare function mapGraphClaimLevel(raw: string | undefined | null): MemoryClaimLevel;
export declare function influenceForClaim(level: MemoryClaimLevel): InfluenceLevel;
/** Memory-only demotion: threads backed solely by user_insights stay background context. */
export declare function gateThreadInfluence(level: MemoryClaimLevel, evidenceTables: Array<string | null>): InfluenceLevel;
export declare function compareClaimLevels(a: MemoryClaimLevel, b: MemoryClaimLevel): number;
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
export declare function promotedClaimLevel(base: MemoryClaimLevel, confirmations: number, contradictions: number): MemoryClaimLevel;
export declare function lintCausalLanguage(text: string, level: MemoryClaimLevel): string[];
