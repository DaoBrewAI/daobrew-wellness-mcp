"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOOTSTRAP_DEFAULT_DAYS = void 0;
exports.runBootstrap = runBootstrap;
const jobs_js_1 = require("./ingest/jobs.js");
const sink_js_1 = require("./ingest/sink.js");
const local_config_js_1 = require("./local-config.js");
const coverage_js_1 = require("./coverage.js");
const biometricsDb_js_1 = require("./signals/biometricsDb.js");
const run_js_1 = require("./run.js");
const nightly_js_1 = require("./memory/nightly.js");
const snapshot_js_1 = require("./memory/snapshot.js");
const user_scope_js_1 = require("./user-scope.js");
const graph_db_js_1 = require("../graph-db.js");
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
exports.BOOTSTRAP_DEFAULT_DAYS = 30;
function message(err) {
    return String(err?.message ?? err).slice(0, 500);
}
function emptySource() {
    return { ran: false, ok: false, rows_written: 0, dedup_skips: 0, verified_rows: 0, warnings: [] };
}
function absorbJob(report, job) {
    report.ran = true;
    report.rows_written = job.rowsWritten;
    report.dedup_skips = job.dedupSkips;
    report.warnings.push(...job.warnings);
    if (job.projects)
        report.projects = job.projects;
}
async function verifyCount(query, sql, warnings) {
    try {
        const rows = await query(sql);
        return Number(rows[0]?.n ?? 0);
    }
    catch (err) {
        warnings.push(`verification query failed: ${message(err)}`);
        return 0;
    }
}
async function runBootstrap(deps) {
    const userId = deps.userId;
    const nowTs = deps.nowTs ?? (() => Math.floor(Date.now() / 1000));
    const days = deps.days ?? exports.BOOTSTRAP_DEFAULT_DAYS;
    const endTs = deps.endTs ?? nowTs();
    const startTs = deps.startTs ?? endTs - days * 86400;
    const warnings = [];
    // Fail fast off-postgres: warm-tier ingest is Postgres-only (sink guard),
    // and layer-2 jobs are too. Injected seams (unit tests) bypass this.
    if (!deps.sink && (0, graph_db_js_1.graphStoreKind)() !== "postgres") {
        throw new Error("bootstrap requires DAOBREW_GRAPH_STORE=postgres (warm-tier ingest and layer-2 memory are Postgres-only)");
    }
    const sink = deps.sink ?? new sink_js_1.PostgresIngestSink();
    const query = deps.query ?? (0, user_scope_js_1.scopedQuery)(userId);
    // Ingest-job metric seams: on postgres the jobs keep their own
    // execSql/queryJson defaults for pipeline_metrics (matching the
    // /internal/ingest/* HTTP routes); on other stores — reachable only with
    // an injected sink — the metrics exec is a no-op because the jobs' metrics
    // SQL uses Postgres-only `::jsonb` casts.
    const jobExec = deps.exec ?? ((0, graph_db_js_1.graphStoreKind)() === "postgres" ? undefined : async () => { });
    const jobQuery = deps.query;
    const memory = emptySource();
    const granola = emptySource();
    const calendar = emptySource();
    // --- ingest: memory (discovery mode unless projectPath/memoryRows given) --
    try {
        absorbJob(memory, await (0, jobs_js_1.runMemoryIngestJob)({
            userId,
            sink,
            exec: jobExec,
            query: jobQuery,
            nowTs: deps.nowTs,
            projectPath: deps.memoryProjectPath,
            memoryRows: deps.memoryRows,
            discoveryRoots: deps.memoryDiscoveryRoots,
        }));
    }
    catch (err) {
        memory.ran = true;
        memory.error = message(err);
    }
    // --- ingest: granola (skip when no token and no rawNotes — the fetch throws) --
    if (deps.granolaRawNotes || (0, local_config_js_1.resolveGranolaToken)()) {
        try {
            absorbJob(granola, await (0, jobs_js_1.runGranolaIngestJob)({
                userId,
                sink,
                exec: jobExec,
                query: jobQuery,
                nowTs: deps.nowTs,
                rawNotes: deps.granolaRawNotes,
            }));
        }
        catch (err) {
            granola.ran = true;
            granola.error = message(err);
        }
    }
    else {
        granola.skipped_reason =
            "no GRANOLA_API_TOKEN / granola_api_token in ~/.daobrew/config.json and no rawNotes in the payload";
    }
    // --- ingest: calendar (only when raw events were provided/cached) --------
    if (deps.calendarRawEvents) {
        try {
            absorbJob(calendar, await (0, jobs_js_1.runCalendarIngestJob)({
                userId,
                sink,
                exec: jobExec,
                query: jobQuery,
                nowTs: deps.nowTs,
                rawEvents: deps.calendarRawEvents,
            }));
        }
        catch (err) {
            calendar.ran = true;
            calendar.error = message(err);
        }
    }
    else {
        calendar.skipped_reason = "no rawEvents in the payload (calendar daemon bridge is Phase 3)";
    }
    // --- per-source verification: wizard-scope §5 success criteria ----------
    memory.verified_rows = await verifyCount(query, `SELECT count(*) AS n FROM user_insights WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND source IN ('claude_project_session', 'codex_project_session');`, memory.warnings);
    granola.verified_rows = await verifyCount(query, `SELECT count(*) AS n FROM meeting_notes WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND source = 'granola';`, granola.warnings);
    calendar.verified_rows = await verifyCount(query, `SELECT count(*) AS n FROM events WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND start_ts >= ${Math.trunc(startTs)};`, calendar.warnings);
    for (const source of [memory, granola, calendar]) {
        source.ok = !source.error && source.verified_rows >= 1;
    }
    // Later phases (embed sweep, biometrics coverage, engine, layer 2) are
    // wired in the next task; report placeholders keep the shape stable.
    const report = {
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
async function runLatePhases(deps, report, startTs, endTs) {
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
    }
    catch (err) {
        report.embed_sweep = { ok: false, rows_embedded: 0, gemini_calls_used: 0, warnings: [], error: message(err) };
    }
    // --- biometrics coverage: direct warm-tier read + buildCoverageTable ------
    // runEngineOnce does not expose raw samples, so the report reads them
    // itself (direct-only; a one-shot double read is acceptable on day 1).
    const bio = report.sources.biometrics;
    try {
        const readBiometrics = deps.readBiometrics ?? biometricsDb_js_1.readBiometricSignalsPreferDirect;
        const read = await readBiometrics({ userId, range: "month", startTs, endTs, stateLimit: 100, stateChunkDays: 7 }, bio.warnings);
        bio.biometric_source = read.source;
        const samples = read.signals.metrics.flatMap((series) => series.samples.map((sample) => ({ metric: series.metric, timestamp: sample.timestamp })));
        bio.raw_sample_count = samples.length;
        bio.worn_days = (0, coverage_js_1.buildCoverageTable)(samples).wornDays.length;
    }
    catch (err) {
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
            ? await (0, run_js_1.runEngineOnce)(engineOptions)
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
    }
    catch (err) {
        report.engine = { ok: false, warnings: [], error: message(err) };
    }
    // --- layer 2: nightly + snapshot so a snapshot exists on day 1 -----------
    // Mirrors internal-server layer2ScopedDeps: GUC-scoped executors on
    // postgres, empty spread otherwise (the jobs keep their own store guard).
    const scoped = (0, graph_db_js_1.graphStoreKind)() === "postgres"
        ? { exec: (0, user_scope_js_1.scopedExec)(userId), query: (0, user_scope_js_1.scopedQuery)(userId) }
        : {};
    try {
        const nightly = deps.nightly ?? nightly_js_1.runNightlyThreadMaintenance;
        const result = await nightly({ userId, ...scoped });
        report.layer2.nightly = { ok: true, threads_upserted: result.threadsUpserted, warnings: result.warnings };
    }
    catch (err) {
        report.layer2.nightly = { ok: false, warnings: [], error: message(err) };
    }
    try {
        const snapshot = deps.snapshot ?? snapshot_js_1.runWeeklySnapshotJob;
        const result = await snapshot({ userId, ...scoped });
        report.layer2.snapshot = { ok: true, written: result.written, version: result.version, warnings: result.warnings };
    }
    catch (err) {
        report.layer2.snapshot = { ok: false, warnings: [], error: message(err) };
    }
}
