import { EmbeddingProvider } from "../embeddings/provider.js";
/**
 * 5B slow vector space: one versioned user-profile vector per local day,
 * derived from closed thread vocabulary (thread keys, pattern keys, claim
 * ceiling) — never snapshot_text prose. This is the Stage-1 query vector for
 * "find similar users" transfer; versions are append-only history.
 */
type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface WriteProfileVectorInput {
    userId: string;
    provider: EmbeddingProvider | null;
    exec: Exec;
    query: Query;
    nowTs: number;
}
export interface WriteProfileVectorResult {
    written: number;
    warnings: string[];
}
export declare function writeProfileVector(input: WriteProfileVectorInput): Promise<WriteProfileVectorResult>;
export {};
