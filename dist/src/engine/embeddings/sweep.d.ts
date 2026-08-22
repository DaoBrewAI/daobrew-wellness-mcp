import { EmbeddingProvider } from "./provider.js";
/**
 * Async embedding sweep over warm-tier rows whose embedding column IS NULL.
 * Backfill and steady-state use the same loop: select null rows, embed a
 * batch per provider call, write halfvec literals back, record one
 * pipeline_metrics row per run. On provider failure source rows stay NULL
 * so the next sweep retries them.
 */
export type SweepTable = "user_insights" | "meeting_notes" | "transfer_records";
export interface EmbedSweepOptions {
    table: SweepTable;
    batchSize?: number;
    limit?: number;
    provider: EmbeddingProvider;
    exec?: (sql: string) => Promise<void>;
    query?: (sql: string) => Promise<Record<string, any>[]>;
    nowTs?: () => number;
}
export interface EmbedSweepResult {
    rowsEmbedded: number;
    geminiCallsUsed: number;
    warnings: string[];
}
export declare const MEETING_BODY_EMBED_LIMIT = 12000;
export declare function vectorLiteral(values: number[]): string;
export declare function embedSweep(options: EmbedSweepOptions): Promise<EmbedSweepResult>;
