import { IngestSink, InsightRow } from "./ingest/types.js";
import { DiscoverMemoryProjectsOptions } from "./sources/claudeMemory.js";
import { BiometricSource, readBiometricSignalsPreferDirect } from "./signals/biometricsDb.js";
import { type EngineRunOptions, type EngineRunResult } from "./run.js";
import { runNightlyThreadMaintenance } from "./memory/nightly.js";
import { runWeeklySnapshotJob } from "./memory/snapshot.js";
/**
 * Cold-start bootstrap (MVP Phase 2): one entry point that backfills the
 * warm tier for a 30-day window, runs an embed sweep, replays the engine
 * over the window, and fires the Layer-2 nightly + snapshot jobs so a
 * snapshot exists on day 1. Every phase is fail-soft — the report carries
 * per-source success booleans matching docs/design/setup-wizard-scope.md §5.
 *
 * embedSweep is INJECTED (not imported) because runEmbedSweep lives in
 * internal-server.ts, which imports this module — importing back would
 * create a CJS require cycle.
 */
export declare const BOOTSTRAP_DEFAULT_DAYS = 30;
type Query = (sql: string) => Promise<Record<string, any>[]>;
type Exec = (sql: string) => Promise<void>;
export type EmbedSweepFn = (options?: {
    tables?: string[];
    batchSize?: number;
    limit?: number;
}) => Promise<{
    rowsEmbedded: number;
    geminiCallsUsed: number;
    warnings: string[];
    alerts: string[];
    tables: Record<string, {
        rowsEmbedded: number;
        geminiCallsUsed: number;
    }>;
}>;
export interface BootstrapSourceReport {
    ran: boolean;
    /** Wizard-scope §5 criterion: verified_rows >= 1 (and no job error). */
    ok: boolean;
    skipped_reason?: string;
    rows_written: number;
    dedup_skips: number;
    /** Warm-table row count matching the wizard success criterion. */
    verified_rows: number;
    projects?: {
        path: string;
        rows: number;
    }[];
    warnings: string[];
    error?: string;
}
export interface BootstrapBiometricsReport {
    /** ok = >=1 worn day (>=3 raw HR samples/local day — raw-sample-backed, F8-proof). */
    ok: boolean;
    worn_days: number;
    raw_sample_count: number;
    biometric_source: BiometricSource;
    /** EnrichmentGate needs >=3 backed days; surfaced so the wizard can say so. */
    enrichment_ready: boolean;
    warnings: string[];
}
export interface BootstrapReport {
    ok: boolean;
    user_id: string;
    window: {
        start_ts: number;
        end_ts: number;
        days: number;
    };
    sources: {
        memory: BootstrapSourceReport;
        granola: BootstrapSourceReport;
        calendar: BootstrapSourceReport;
        biometrics: BootstrapBiometricsReport;
    };
    embed_sweep: {
        ok: boolean;
        rows_embedded: number;
        gemini_calls_used: number;
        warnings: string[];
        error?: string;
    };
    engine: {
        ok: boolean;
        status?: EngineRunResult["status"];
        armed_node_id?: string;
        root_armed?: boolean;
        triplet_count?: number;
        signal_counts?: EngineRunResult["signal_counts"];
        /** Pipeline completeness stage 2 observability, straight from the replay
         *  run: lint-surviving proposed themes and their surviving axes. Present
         *  only when the run's proposer attempted (Gemini key present). */
        proposed_theme_count?: number;
        llm_proposed_axes_count?: number;
        warnings: string[];
        error?: string;
    };
    layer2: {
        nightly: {
            ok: boolean;
            threads_upserted?: number;
            warnings: string[];
            error?: string;
        };
        snapshot: {
            ok: boolean;
            written?: boolean;
            version?: number;
            warnings: string[];
            error?: string;
        };
    };
    warnings: string[];
}
export interface BootstrapDeps {
    userId: string;
    /** Backfill window length; default 30. startTs/endTs override it. */
    days?: number;
    startTs?: number;
    endTs?: number;
    /** Calendar ingest input — no daemon exists yet (Phase 3), so calendar
     *  runs ONLY when the caller supplies cached raw EventKit events. */
    calendarRawEvents?: any[];
    /** Granola ingest input override; without it AND without a resolvable
     *  token the granola job is skipped (fetchGranolaNotes would throw). */
    granolaRawNotes?: any[];
    memoryProjectPath?: string;
    /** Test seam passthrough to runMemoryIngestJob discovery mode. */
    memoryDiscoveryRoots?: DiscoverMemoryProjectsOptions;
    /** Test seam: explicit memory rows (mirrors runMemoryIngestJob). */
    memoryRows?: InsightRow[];
    /** REQUIRED: internal-server passes its runEmbedSweep (import-cycle guard). */
    embedSweep: EmbedSweepFn;
    sink?: IngestSink;
    engine?: (options: EngineRunOptions & {
        userId: string;
    }) => Promise<EngineRunResult>;
    nightly?: typeof runNightlyThreadMaintenance;
    snapshot?: typeof runWeeklySnapshotJob;
    readBiometrics?: typeof readBiometricSignalsPreferDirect;
    /** Verification reads; default scopedQuery(userId) — user-scoped tables. */
    query?: Query;
    /** pipeline_metrics write seam passed through to the ingest jobs; default:
     *  the jobs' own execSql on postgres (byte-parity with the
     *  /internal/ingest/* routes), no-op on other stores (unit tests — the
     *  jobs' metrics SQL is Postgres-only `::jsonb`). */
    exec?: Exec;
    nowTs?: () => number;
}
export declare function runBootstrap(deps: BootstrapDeps): Promise<BootstrapReport>;
export {};
