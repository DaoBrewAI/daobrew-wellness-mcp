import { type TextGenerationProvider } from "../memory/llm.js";
import type { GraphStoreKind } from "../../graph-db.js";
import type { EventRow, MeetingRow, InsightRow, IngestResult, IngestSink } from "./types.js";
/**
 * Postgres-only warm-tier writer. All SQL for the warm-tier source tables
 * lives here; source normalizers hand over typed rows and never touch SQL.
 *
 * Writes are read-compare-write: existing rows matching the dedup key are
 * fetched first, unchanged rows are skipped (dedupSkips), and changed rows
 * are upserted with `embedding` reset to NULL whenever a text-bearing field
 * changed so the async sweep re-embeds them.
 *
 * RLS scoping: every row read/write is user-scoped via scopedExec/scopedQuery
 * (user-scope.ts) with the batch's userId, so the writes survive the Neon
 * `daobrew_app` role flip. The class is Postgres-only (constructor throws on
 * sqlite), so scoping is unconditional. Batches are homogeneous by
 * construction — userId is a per-call parameter and rows carry no user_id
 * field — so scope is composed per method call. Schema DDL is Alembic-owned;
 * ingest only performs read-only readiness probes before writing rows.
 */
export interface SinkExecutors {
    exec?: (sql: string) => Promise<void>;
    query?: (sql: string) => Promise<Record<string, any>[]>;
    nowTs?: () => number;
    lifecycle?: {
        llm?: TextGenerationProvider | null;
        embedRows?: ((texts: string[]) => Promise<number[][]>) | null;
        storeKind?: () => GraphStoreKind;
        maxClassifiedRows?: number;
    };
}
export declare class PostgresIngestSink implements IngestSink {
    private readonly exec;
    private readonly query;
    private readonly nowTs;
    private readonly lifecycle;
    private schemaReady;
    constructor(executors?: SinkExecutors);
    private ensureSchema;
    private fetchExisting;
    upsertEvents(userId: string, rows: EventRow[]): Promise<IngestResult>;
    private eventUnchanged;
    upsertMeetingNotes(userId: string, rows: MeetingRow[]): Promise<IngestResult>;
    private meetingTextChanged;
    private meetingMetaUnchanged;
    upsertInsights(userId: string, rows: InsightRow[]): Promise<IngestResult>;
    private insightUnchanged;
}
