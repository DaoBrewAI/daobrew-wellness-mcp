import {
  IngestJobResult,
  runCalendarIngestJob,
  runGranolaIngestJob,
  runMemoryIngestJob,
} from "./ingest/jobs.js";
import { PostgresIngestSink } from "./ingest/sink.js";
import { IngestSink, InsightRow } from "./ingest/types.js";
import { DiscoverMemoryProjectsOptions } from "./sources/claudeMemory.js";
import { resolveGranolaToken } from "./local-config.js";
import { buildCoverageTable } from "./coverage.js";
import { BiometricSource, readBiometricSignalsPreferDirect } from "./signals/biometricsDb.js";
import {
  runEngineOnce,
  type EngineRunOptions,
  type EngineRunResult,
} from "./run.js";
import { runNightlyThreadMaintenance } from "./memory/nightly.js";
import { runWeeklySnapshotJob } from "./memory/snapshot.js";
import { SCOPED_USER_ID_SQL, scopedExec, scopedQuery } from "./user-scope.js";
import { graphStoreKind, q } from "../graph-db.js";

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

export const BOOTSTRAP_DEFAULT_DAYS = 30;

type Query = (sql: string) => Promise<Record<string, any>[]>;
type Exec = (sql: string) => Promise<void>;

export type EmbedSweepFn = (options?: { tables?: string[]; batchSize?: number; limit?: number }) => Promise<{
  rowsEmbedded: number;
  geminiCallsUsed: number;
  warnings: string[];
  alerts: string[];
  tables: Record<string, { rowsEmbedded: number; geminiCallsUsed: number }>;
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
  projects?: { path: string; rows: number }[];
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
  window: { start_ts: number; end_ts: number; days: number };
  sources: {
    memory: BootstrapSourceReport;
    granola: BootstrapSourceReport;
    calendar: BootstrapSourceReport;
    biometrics: BootstrapBiometricsReport;
  };
  embed_sweep: { ok: boolean; rows_embedded: number; gemini_calls_used: number; warnings: string[]; error?: string };
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
    nightly: { ok: boolean; threads_upserted?: number; warnings: string[]; error?: string };
    snapshot: { ok: boolean; written?: boolean; version?: number; warnings: string[]; error?: string };
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
  // --- injectable seams (default: real implementations) ---
  sink?: IngestSink;
  engine?: (
    options: EngineRunOptions & { userId: string },
  ) => Promise<EngineRunResult>;
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

function message(err: unknown): string {
  return String((err as any)?.message ?? err).slice(0, 500);
}

function emptySource(): BootstrapSourceReport {
  return { ran: false, ok: false, rows_written: 0, dedup_skips: 0, verified_rows: 0, warnings: [] };
}

function absorbJob(report: BootstrapSourceReport, job: IngestJobResult): void {
  report.ran = true;
  report.rows_written = job.rowsWritten;
  report.dedup_skips = job.dedupSkips;
  report.warnings.push(...job.warnings);
  if (job.projects) report.projects = job.projects;
}

async function verifyCount(query: Query, sql: string, warnings: string[]): Promise<number> {
  try {
    const rows = await query(sql);
    return Number(rows[0]?.n ?? 0);
  } catch (err) {
    warnings.push(`verification query failed: ${message(err)}`);
    return 0;
  }
}

export async function runBootstrap(deps: BootstrapDeps): Promise<BootstrapReport> {
  const userId = deps.userId;
  const nowTs = deps.nowTs ?? (() => Math.floor(Date.now() / 1000));
  const days = deps.days ?? BOOTSTRAP_DEFAULT_DAYS;
  const endTs = deps.endTs ?? nowTs();
  const startTs = deps.startTs ?? endTs - days * 86400;
  const warnings: string[] = [];

  // Fail fast off-postgres: warm-tier ingest is Postgres-only (sink guard),
  // and layer-2 jobs are too. Injected seams (unit tests) bypass this.
  if (!deps.sink && graphStoreKind() !== "postgres") {
    throw new Error(
      "bootstrap requires DAOBREW_GRAPH_STORE=postgres (warm-tier ingest and layer-2 memory are Postgres-only)",
    );
  }
  const sink = deps.sink ?? new PostgresIngestSink();
  const query = deps.query ?? (scopedQuery(userId) as Query);
  // Ingest-job metric seams: on postgres the jobs keep their own
  // execSql/queryJson defaults for pipeline_metrics (matching the
  // /internal/ingest/* HTTP routes); on other stores — reachable only with
  // an injected sink — the metrics exec is a no-op because the jobs' metrics
  // SQL uses Postgres-only `::jsonb` casts.
  const jobExec: Exec | undefined =
    deps.exec ?? (graphStoreKind() === "postgres" ? undefined : async () => {});
  const jobQuery: Query | undefined = deps.query;

  const memory = emptySource();
  const granola = emptySource();
  const calendar = emptySource();

  // --- ingest: memory (discovery mode unless projectPath/memoryRows given) --
  try {
    absorbJob(memory, await runMemoryIngestJob({
      userId,
      sink,
      exec: jobExec,
      query: jobQuery,
      nowTs: deps.nowTs,
      projectPath: deps.memoryProjectPath,
      memoryRows: deps.memoryRows,
      discoveryRoots: deps.memoryDiscoveryRoots,
    }));
  } catch (err) {
    memory.ran = true;
    memory.error = message(err);
  }

  // --- ingest: granola (skip when no token and no rawNotes — the fetch throws) --
  if (deps.granolaRawNotes || resolveGranolaToken()) {
    try {
      absorbJob(granola, await runGranolaIngestJob({
        userId,
        sink,
        exec: jobExec,
        query: jobQuery,
        nowTs: deps.nowTs,
        rawNotes: deps.granolaRawNotes,
      }));
    } catch (err) {
      granola.ran = true;
      granola.error = message(err);
    }
  } else {
    granola.skipped_reason =
      "no GRANOLA_API_TOKEN / granola_api_token in ~/.daobrew/config.json and no rawNotes in the payload";
  }

  // --- ingest: calendar (only when raw events were provided/cached) --------
  if (deps.calendarRawEvents) {
    try {
      absorbJob(calendar, await runCalendarIngestJob({
        userId,
        sink,
        exec: jobExec,
        query: jobQuery,
        nowTs: deps.nowTs,
        rawEvents: deps.calendarRawEvents,
      }));
    } catch (err) {
      calendar.ran = true;
      calendar.error = message(err);
    }
  } else {
    calendar.skipped_reason = "no rawEvents in the payload (calendar daemon bridge is Phase 3)";
  }

  // --- per-source verification: wizard-scope §5 success criteria ----------
  memory.verified_rows = await verifyCount(
    query,
    `SELECT count(*) AS n FROM user_insights WHERE user_id = ${SCOPED_USER_ID_SQL} AND source IN ('claude_project_session', 'codex_project_session');`,
    memory.warnings,
  );
  granola.verified_rows = await verifyCount(
    query,
    `SELECT count(*) AS n FROM meeting_notes WHERE user_id = ${SCOPED_USER_ID_SQL} AND source = 'granola';`,
    granola.warnings,
  );
  calendar.verified_rows = await verifyCount(
    query,
    `SELECT count(*) AS n FROM events WHERE user_id = ${SCOPED_USER_ID_SQL} AND start_ts >= ${Math.trunc(startTs)};`,
    calendar.warnings,
  );
  for (const source of [memory, granola, calendar]) {
    source.ok = !source.error && source.verified_rows >= 1;
  }

  // Later phases (embed sweep, biometrics coverage, engine, layer 2) are
  // wired in the next task; report placeholders keep the shape stable.
  const report: BootstrapReport = {
    ok: false,
    user_id: userId,
    window: { start_ts: startTs, end_ts: endTs, days },
    sources: {
      memory,
      granola,
      calendar,
      biometrics: { ok: false, worn_days: 0, raw_sample_count: 0, biometric_source: "none", enrichment_ready: false, warnings: [] },
    },
    embed_sweep: { ok: false, rows_embedded: 0, gemini_calls_used: 0, warnings: [] },
    engine: { ok: false, warnings: [] },
    layer2: { nightly: { ok: false, warnings: [] }, snapshot: { ok: false, warnings: [] } },
    warnings,
  };
  await runLatePhases(deps, report, startTs, endTs);
  report.ok =
    ![memory, granola, calendar].some((s) => s.error) &&
    report.embed_sweep.ok &&
    !report.engine.error &&
    report.layer2.nightly.ok &&
    report.layer2.snapshot.ok;
  return report;
}

/** Embed sweep → biometrics coverage → engine replay → layer-2 nightly +
 *  snapshot. Every phase is fail-soft: a failure records `ok:false` +
 *  `error` and the remaining phases still run (day-1 snapshot guarantee). */
async function runLatePhases(
  deps: BootstrapDeps,
  report: BootstrapReport,
  startTs: number,
  endTs: number,
): Promise<void> {
  const userId = deps.userId;

  // --- embed sweep (keyless machines skip gracefully inside runEmbedSweep) --
  try {
    const sweep = await deps.embedSweep();
    report.embed_sweep = {
      ok: true,
      rows_embedded: sweep.rowsEmbedded,
      gemini_calls_used: sweep.geminiCallsUsed,
      warnings: sweep.warnings,
    };
  } catch (err) {
    report.embed_sweep = { ok: false, rows_embedded: 0, gemini_calls_used: 0, warnings: [], error: message(err) };
  }

  // --- biometrics coverage: direct warm-tier read + buildCoverageTable ------
  // runEngineOnce does not expose raw samples, so the report reads them
  // itself (direct-only; a one-shot double read is acceptable on day 1).
  const bio = report.sources.biometrics;
  try {
    const readBiometrics = deps.readBiometrics ?? readBiometricSignalsPreferDirect;
    const read = await readBiometrics(
      { userId, range: "month", startTs, endTs, stateLimit: 100, stateChunkDays: 7 },
      bio.warnings,
    );
    bio.biometric_source = read.source;
    const samples = read.signals.metrics.flatMap((series) =>
      series.samples.map((sample) => ({ metric: series.metric, timestamp: sample.timestamp })),
    );
    bio.raw_sample_count = samples.length;
    bio.worn_days = buildCoverageTable(samples).wornDays.length;
  } catch (err) {
    bio.warnings.push(`biometrics coverage read failed: ${message(err)}`);
  }
  bio.ok = bio.worn_days >= 1;
  bio.enrichment_ready = bio.worn_days >= 3;

  // --- engine replay over the bootstrap window ------------------------------
  try {
    const engineOptions = {
      startTs,
      endTs,
      biometricRange: "month",
      stateChunkDays: 7,
    };
    const result = deps.engine === undefined
      ? await runEngineOnce(engineOptions)
      : await deps.engine({ userId, ...engineOptions });
    if (result.user_id !== userId) {
      throw new Error("bootstrap owner does not match confirmed engine owner");
    }
    report.engine = {
      ok: true,
      status: result.status,
      armed_node_id: result.armed_node_id,
      root_armed: result.root_armed,
      triplet_count: result.triplet_count,
      signal_counts: result.signal_counts,
      proposed_theme_count: result.proposed_theme_count,
      llm_proposed_axes_count: result.llm_proposed_axes_count,
      warnings: result.warnings,
    };
  } catch (err) {
    report.engine = { ok: false, warnings: [], error: message(err) };
  }

  // --- layer 2: nightly + snapshot so a snapshot exists on day 1 -----------
  // Mirrors internal-server layer2ScopedDeps: GUC-scoped executors on
  // postgres, empty spread otherwise (the jobs keep their own store guard).
  const scoped = graphStoreKind() === "postgres"
    ? { exec: scopedExec(userId), query: scopedQuery(userId) }
    : {};
  try {
    const nightly = deps.nightly ?? runNightlyThreadMaintenance;
    const result = await nightly({ userId, ...scoped });
    report.layer2.nightly = { ok: true, threads_upserted: result.threadsUpserted, warnings: result.warnings };
  } catch (err) {
    report.layer2.nightly = { ok: false, warnings: [], error: message(err) };
  }
  try {
    const snapshot = deps.snapshot ?? runWeeklySnapshotJob;
    const result = await snapshot({ userId, ...scoped });
    report.layer2.snapshot = { ok: true, written: result.written, version: result.version, warnings: result.warnings };
  } catch (err) {
    report.layer2.snapshot = { ok: false, warnings: [], error: message(err) };
  }
}
