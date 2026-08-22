/**
 * 5B two-stage transfer retrieval.
 *
 * Stage 1 is a PURE ANN query — a bare `ORDER BY trigger_embedding <=> $vec`
 * so the partial HNSW index is actually used. Mixing weights into that
 * ORDER BY defeats the index; all weighting lives here in Stage 2. The Stage-1
 * candidate pool is capped at STAGE1_LIMIT_DEFAULT by user decision
 * (computation vs information tradeoff; per-call stage1Limit overrides).
 * Compounding recall mode with the per-contributor cap below: if one
 * contributor dominates the nearest neighbors, the served set can be smaller
 * than k even when the bucket holds diverse contributors just outside the pool.
 *
 * Stage 2 re-ranks in TypeScript with the locked cross-user weights
 * (trigger 0.5 / outcome 0.3 / context 0.2) and w_rec = 0 BY DESIGN: if the
 * cause matches, when it worked for the other user does not matter.
 *
 * k-anonymity is enforced at READ time (D2): a context bucket served to a
 * borrower must have >= 5 distinct contributors in the pool, else the whole
 * bucket is suppressed. Records keep accumulating while suppressed and become
 * servable when the fifth contributor arrives.
 */
type Query = (sql: string) => Promise<Record<string, any>[]>;
export declare const TRANSFER_WEIGHTS: {
    readonly trigger: 0.5;
    readonly outcome: 0.3;
    readonly context: 0.2;
};
export declare const STAGE1_LIMIT_DEFAULT = 15;
export declare const FINAL_K_DEFAULT = 3;
export declare const K_ANON_THRESHOLD_DEFAULT = 5;
export interface ContextBucket {
    stress_pattern: string;
    root_cause_class: string;
}
export interface ScoredTransferCandidate {
    id: string;
    method_json: Record<string, unknown>;
    outcome: string;
    outcome_strength: number;
    context_bucket_json: ContextBucket;
    score: number;
}
export interface TransferRetrievalResult {
    source: "transfer_records" | "population_priors" | "none";
    candidates: ScoredTransferCandidate[];
    /** Cohort aggregate served when the neighbor pool is empty/suppressed. */
    prior?: object;
}
export declare function stage1AnnSql(triggerVector: number[], limit?: number): string;
/** Distinct-contributor counts per coarse bucket — a separate grouped query
 *  (window functions cannot COUNT(DISTINCT), and the ANN query stays pure). */
export declare function bucketContributorCountsSql(): string;
export declare function contextFit(candidateBucket: ContextBucket, currentBucket: ContextBucket): number;
export declare function rerankTransferCandidates(rows: Record<string, any>[], currentBucket: ContextBucket, k?: number): ScoredTransferCandidate[];
export interface RetrieveTransferCandidatesInput {
    triggerVector: number[];
    contextBucket: ContextBucket;
    query: Query;
    stage1Limit?: number;
    k?: number;
    kAnonThreshold?: number;
    /** §6 fallback: cohort prior served when neighbors are empty/suppressed. */
    readPrior?: (stressPattern: string) => Promise<object | null>;
}
export declare function retrieveTransferCandidates(input: RetrieveTransferCandidatesInput): Promise<TransferRetrievalResult>;
export {};
