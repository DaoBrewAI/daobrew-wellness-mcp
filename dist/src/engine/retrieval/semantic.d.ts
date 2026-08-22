import type { MemoryInsightSignal } from "../signals/memory.js";
import type { GraphDelta } from "../reasoner/types.js";
/**
 * Semantic (ANN) retrieval over the user's OWN Layer-1 embeddings.
 *
 * Same two-stage idiom as transfer/retrieve.ts: Stage 1 is a PURE ANN query
 * (`ORDER BY embedding <=> $vec LIMIT 40`, no weights in the ORDER BY so the
 * partial HNSW indexes stay usable), then TypeScript performs deterministic
 * stage-2 reranking. The default mode preserves the current similarity+recency
 * blend for the two existing consumers; memory-evidence mode adds the §5B
 * within-user weights without changing those callers.
 *
 * Contract (LOCKED): alive at delivery, degrades to an EMPTY array — never a
 * throw, never dormant. Every degradation (no Gemini key, non-postgres store,
 * zero embedded rows, embed/query failure) pushes one warning into the
 * caller's sink so "alive but empty" is observable in run warnings.
 */
type Query = (sql: string) => Promise<Record<string, any>[]>;
export declare const SEMANTIC_STAGE1_LIMIT = 40;
export declare const SEMANTIC_K_DEFAULT = 8;
export declare const SEMANTIC_SNIPPET_MAX = 200;
export declare const SEMANTIC_WEIGHTS: {
    readonly similarity: 0.8;
    readonly recency: 0.2;
};
export declare const SEMANTIC_RECENCY_HALF_LIFE_DAYS = 30;
export declare const SEMANTIC_MEMORY_EVIDENCE_WEIGHTS: {
    readonly similarity: 0.5;
    readonly strength: 0.2;
    readonly recency: 0.2;
    readonly importance: 0.1;
};
export declare const SEMANTIC_MEMORY_EVIDENCE_RECENCY_TAU_DAYS = 14;
export declare const SEMANTIC_MEMORY_EVIDENCE_MATCH_THRESHOLD = 0.6;
export type SemanticTable = "user_insights" | "meeting_notes";
export type SemanticRerankMode = "default" | "memory_evidence";
export interface SemanticNeighbor {
    table: SemanticTable;
    id: string;
    source_ref: string | null;
    snippet: string;
    distance: number;
}
export interface SemanticCandidateRow {
    table: SemanticTable;
    id: string;
    source_ref: string | null;
    title: string | null;
    text: string | null;
    ts: number | null;
    distance: number;
    importance?: number | null;
    strength?: number | null;
    source?: string | null;
    user_id?: string | null;
    insight_text?: string | null;
    topics_json?: unknown;
    occurred_at_ts?: number | null;
    last_accessed_ts?: number | null;
    created_at_ts?: number | null;
}
export interface SemanticStage1Options {
    limit?: number;
    endTs?: number;
    mode?: SemanticRerankMode;
}
export interface SemanticMemoryEvidence {
    memory: MemoryInsightSignal;
    semanticScore: number;
    distance: number;
}
export declare function semanticStage1Sql(table: SemanticTable, userId: string, queryVector: number[], limitOrOptions?: number | SemanticStage1Options): string;
export declare function semanticRecencyScore(rowTs: number | null, nowTs: number): number;
export declare function semanticMemoryEvidenceRecencyScore(rowTs: number | null, nowTs: number): number;
export declare function rerankSemanticNeighbors(rows: readonly SemanticCandidateRow[], currentTs: number, k?: number): SemanticNeighbor[];
export declare function rerankSemanticMemoryEvidence(rows: readonly SemanticCandidateRow[], currentTs: number, k?: number): SemanticMemoryEvidence[];
export interface RetrieveSemanticNeighborsInput {
    userId: string;
    queryText?: string;
    queryEmbedding?: number[];
    k?: number;
    query?: Query;
    embedText?: (text: string) => Promise<number[]>;
    warnings?: string[];
    nowTs?: () => number;
    endTs?: number;
    tables?: SemanticTable[];
    mode?: SemanticRerankMode;
}
export declare function retrieveSemanticNeighbors(input: RetrieveSemanticNeighborsInput): Promise<SemanticNeighbor[]>;
export interface RetrieveSemanticMemoryEvidenceInput extends Omit<RetrieveSemanticNeighborsInput, "mode" | "tables"> {
}
export declare function retrieveSemanticMemoryEvidence(input: RetrieveSemanticMemoryEvidenceInput): Promise<SemanticMemoryEvidence[]>;
export interface AttachSemanticContextInput {
    delta: GraphDelta;
    userId: string;
    query?: Query;
    embedText?: (text: string) => Promise<number[]>;
    k?: number;
    nowTs?: () => number;
}
export interface AttachSemanticContextResult {
    attached: number;
    warnings: string[];
}
/**
 * Attach semantic neighbors to the armed root as `props_json.semantic_context`.
 *
 * BOUNDARY: context only — same honesty marker as memory_context (Reasoner.ts
 * memoryContextProps): this props fragment MUST NOT influence scoring, claims,
 * gate outcomes, or arming. It runs AFTER buildDelta and BEFORE the upsert
 * (the attachTransferCandidates pattern), so the reasoner never sees it —
 * influence is impossible by construction. Only row REFERENCES
 * (table:source_ref-or-id) and distances are attached; full text stays in the
 * warm tier. Degrades to "no semantic_context key at all" with warnings.
 */
export declare function attachSemanticContext(input: AttachSemanticContextInput): Promise<AttachSemanticContextResult>;
export {};
