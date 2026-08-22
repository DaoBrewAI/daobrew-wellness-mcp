type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface MemorySignalOptions {
    userId?: string;
    startTs?: number;
    endTs?: number;
    limit?: number;
    minStrength?: number;
    /** RLS seam (deferred wiring 1/3): injected read executor. Defaults to the
     *  module-level queryJson — behavior is byte-identical when absent. */
    query?: Query;
}
export interface MemoryInsightSignal {
    id: string;
    user_id: string;
    source: string;
    source_ref: string | null;
    graph_source_ref: string;
    insight_text: string;
    topics: string[];
    importance: number;
    strength: number;
    occurred_at_ts: number | null;
    last_accessed_ts: number | null;
    created_at_ts: number;
}
export declare function readMemorySignals(options?: MemorySignalOptions): Promise<MemoryInsightSignal[]>;
export {};
