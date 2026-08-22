type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface GranolaSignalOptions {
    userId?: string;
    startTs?: number;
    endTs?: number;
    limit?: number;
    /** RLS seam (deferred wiring 1/3): injected read executor. Defaults to the
     *  module-level queryJson — behavior is byte-identical when absent. */
    query?: Query;
}
export interface GranolaMeetingSignal {
    id: string;
    user_id: string;
    source: string;
    source_ref: string | null;
    graph_source_ref: string;
    event_id: string | null;
    kind: string;
    title: string;
    occurred_at_ts: number | null;
    duration_sec: number | null;
    participants: unknown[];
    summary: string | null;
    body: string | null;
    transcript_spans?: TranscriptSpan[];
    topics: string[];
    created_at_ts: number;
}
export interface TranscriptSpan {
    idx?: number;
    speaker?: string | null;
    ts_offset_sec?: number | null;
    text: string;
}
export declare function readGranolaSignals(options?: GranolaSignalOptions): Promise<GranolaMeetingSignal[]>;
export {};
