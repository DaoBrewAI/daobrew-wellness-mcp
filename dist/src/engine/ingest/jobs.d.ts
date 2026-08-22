import { DiscoverMemoryProjectsOptions } from "../sources/claudeMemory.js";
import { IngestSink, IngestResult, InsightRow } from "./types.js";
/**
 * Warm-tier ingest jobs: normalize source rows, write through the sink,
 * record one pipeline_metrics row per run, and surface capacity warnings
 * before limits bite (Neon 0.5 GB tier, Gemini free-tier daily quota).
 */
export declare const EMBEDDING_ROW_WARN_THRESHOLD = 500000;
export declare const WARM_DB_BYTES_WARN_THRESHOLD = 400000000;
export declare const GEMINI_DAILY_CALLS_WARN_THRESHOLD = 1200;
export declare const INGEST_P95_RISE_FACTOR = 2;
export declare const INGEST_ERROR_RATE_WARN = 0.2;
export declare const INGEST_HEALTH_MIN_RUNS = 5;
type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface IngestJobDeps {
    userId: string;
    sink: IngestSink;
    exec?: Exec;
    query?: Query;
    nowTs?: () => number;
    alertWebhook?: string;
    fetchImpl?: typeof fetch;
}
export interface IngestJobResult extends IngestResult {
    jobName: string;
    warnings: string[];
    alerts: string[];
    /** Discovery-mode memory ingest only: per-project counts of rows BUILT
     *  (pre-sink); the sum may exceed rowsWritten after sink dedup. */
    projects?: {
        path: string;
        rows: number;
    }[];
}
/**
 * Best-effort push of threshold alerts to DAOBREW_ALERT_WEBHOOK (Slack/Discord
 * compatible JSON body). Failures never break the job — the warning is already
 * durable in pipeline_metrics.warnings_json.
 */
export declare function postAlertWebhook(jobName: string, alerts: string[], options?: {
    alertWebhook?: string;
    fetchImpl?: typeof fetch;
}): Promise<void>;
interface WarmReadback {
    embeddingRowCount: number;
    warmDbBytes: number;
    geminiCallsToday: number;
}
export interface IngestHealth {
    p95Recent: number;
    p95Baseline: number;
    runsRecent: number;
    failedRecent: number;
}
export declare function ingestHealthWarnings(health: IngestHealth): string[];
export declare function thresholdWarnings(state: WarmReadback): string[];
export interface CalendarIngestJobOptions extends IngestJobDeps {
    rawEvents: any[];
}
export declare function runCalendarIngestJob(options: CalendarIngestJobOptions): Promise<IngestJobResult>;
export interface GranolaIngestJobOptions extends IngestJobDeps {
    rawNotes?: any[];
}
export declare function runGranolaIngestJob(options: GranolaIngestJobOptions): Promise<IngestJobResult>;
export interface MemoryIngestJobOptions extends IngestJobDeps {
    /** Explicit project to ingest. Omit to discover projects server-side. */
    projectPath?: string;
    memoryRows?: InsightRow[];
    /** Discovery root overrides — test injection; production uses homedir defaults. */
    discoveryRoots?: DiscoverMemoryProjectsOptions;
}
export declare const MEMORY_DISCOVERY_EMPTY_WARNING = "no Claude/Codex session projects discovered under ~/.claude/projects or ~/.codex/sessions";
export declare function runMemoryIngestJob(options: MemoryIngestJobOptions): Promise<IngestJobResult>;
export {};
