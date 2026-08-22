import { EmbeddingProvider } from "../embeddings/provider.js";
/**
 * 5B anonymized what-worked emitter. Called from the nightly settlement pass
 * the moment a thread's verify cycle reaches a verdict — the only point where
 * "method + outcome" is a settled fact. The record deliberately carries:
 *   method   — structured brief fields (suggested_block, artifact_spec) ONLY
 *   outcome  — verdict mapped to worked / did_not_work
 *   context  — coarse bucket {stress_pattern, root_cause_class} (D6)
 *   identity — a salted contributor hash, never user_id
 * brief.cause/evidence prose and artifact_ref paths never cross this boundary.
 */
type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface EmitTransferRecordInput {
    userId: string;
    ghostId: string;
    threadKey: string;
    threadId: string;
    handledAtTs: number;
    verdict: string;
    /** The done root's props (already loaded by the settlement pass). */
    ghostProps: Record<string, any>;
    /** Server-custody salt; empty → fail closed with a warning. */
    salt: string;
    /** null → emit with NULL embedding (backfillable); trigger_text is stored. */
    provider: EmbeddingProvider | null;
    exec: Exec;
    query: Query;
    nowTs: number;
}
export interface EmitTransferRecordResult {
    written: number;
    warnings: string[];
}
/** Gemini needs a key; jobs degrade to NULL-embedding rows without one. */
export declare function resolveTransferProvider(): EmbeddingProvider | null;
export declare function emitTransferRecord(input: EmitTransferRecordInput): Promise<EmitTransferRecordResult>;
export {};
