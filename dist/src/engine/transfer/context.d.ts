import { EmbeddingProvider } from "../embeddings/provider.js";
import { GraphDelta } from "../reasoner/types.js";
import { TransferRetrievalResult } from "./retrieve.js";
/**
 * D7 context-only surface. Runs AFTER buildDelta and BEFORE the graph upsert:
 * the reasoner never sees transfer candidates, so gate/verdict/arming influence
 * is impossible by construction — an even stronger guarantee than the
 * memory_context BOUNDARY comment it extends. Attached fields are stable and
 * anonymous: method + outcome_strength + score (+ prior aggregate). Contributor
 * hashes and trigger_text stay server-side.
 */
type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface AttachTransferCandidatesInput {
    delta: GraphDelta;
    userId: string;
    query?: Query;
    /** null = no embedding possible (warn, attach nothing); undefined = resolve Gemini. */
    provider?: EmbeddingProvider | null;
}
export interface AttachTransferCandidatesResult {
    source: TransferRetrievalResult["source"];
    attached: number;
    warnings: string[];
}
export declare function attachTransferCandidates(input: AttachTransferCandidatesInput): Promise<AttachTransferCandidatesResult>;
export {};
