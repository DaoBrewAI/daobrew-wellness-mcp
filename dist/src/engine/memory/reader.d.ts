import { CausalThreadRow, InfluenceLevel, UserModelSnapshotRow } from "./types.js";
/**
 * Layer 2 hot-path reader: returns claim-gated active threads plus the latest
 * user model snapshot. Read-only; a missing snapshot never throws — the caller
 * falls back to direct thread retrieval (snapshot_fallback = true). Influence
 * is gated by claim level with memory-only demotion: threads whose evidence
 * comes only from user_insights (or graph/biometric refs) stay background
 * context regardless of claim level.
 */
type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface MemoryReadOptions {
    userId: string;
    graphRootId?: string;
    patternKeys?: string[];
    limit?: number;
    query?: Query;
    /** Injectable clock for snapshot_fresh (tests); defaults to Date.now. */
    nowTs?: () => number;
}
/** G5 verify-loop rollup per thread, aggregated from thread_verifications
 *  verdict rows. Counting is consistent with the nightly claim pass:
 *  no_recurrence_observed → confirmation, pattern_recurred → contradiction,
 *  insufficient_observation → neither. */
export interface ThreadVerificationSummary {
    confirmations: number;
    contradictions: number;
    last_verdict_at_ts: number | null;
}
export interface GatedThread extends CausalThreadRow {
    influence: InfluenceLevel;
    evidence_tables: string[];
    verification: ThreadVerificationSummary;
}
export interface CausalMemoryReadResult {
    threads: GatedThread[];
    snapshot: UserModelSnapshotRow | null;
    snapshot_fallback: boolean;
    /** True when a snapshot exists AND it is younger than 7 days (G11-lite). */
    snapshot_fresh: boolean;
}
export declare function readCausalMemory(options: MemoryReadOptions): Promise<CausalMemoryReadResult>;
export {};
