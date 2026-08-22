"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMORY_DISCOVERY_EMPTY_WARNING = exports.INGEST_HEALTH_MIN_RUNS = exports.INGEST_ERROR_RATE_WARN = exports.INGEST_P95_RISE_FACTOR = exports.GEMINI_DAILY_CALLS_WARN_THRESHOLD = exports.WARM_DB_BYTES_WARN_THRESHOLD = exports.EMBEDDING_ROW_WARN_THRESHOLD = void 0;
exports.postAlertWebhook = postAlertWebhook;
exports.ingestHealthWarnings = ingestHealthWarnings;
exports.thresholdWarnings = thresholdWarnings;
exports.runCalendarIngestJob = runCalendarIngestJob;
exports.runGranolaIngestJob = runGranolaIngestJob;
exports.runMemoryIngestJob = runMemoryIngestJob;
const node_crypto_1 = require("node:crypto");
const graph_db_js_1 = require("../../graph-db.js");
const postgres_schema_js_1 = require("../postgres-schema.js");
const calendar_js_1 = require("../sources/calendar.js");
const granola_js_1 = require("../sources/granola.js");
const claudeMemory_js_1 = require("../sources/claudeMemory.js");
/**
 * Warm-tier ingest jobs: normalize source rows, write through the sink,
 * record one pipeline_metrics row per run, and surface capacity warnings
 * before limits bite (Neon 0.5 GB tier, Gemini free-tier daily quota).
 */
exports.EMBEDDING_ROW_WARN_THRESHOLD = 500_000;
exports.WARM_DB_BYTES_WARN_THRESHOLD = 400_000_000; // 80% of a 0.5 GB tier
exports.GEMINI_DAILY_CALLS_WARN_THRESHOLD = 1_200; // 80% of 1,500/day
exports.INGEST_P95_RISE_FACTOR = 2; // last 24h vs prior-week baseline
exports.INGEST_ERROR_RATE_WARN = 0.2;
exports.INGEST_HEALTH_MIN_RUNS = 5; // below this the signal is noise
/**
 * Best-effort push of threshold alerts to DAOBREW_ALERT_WEBHOOK (Slack/Discord
 * compatible JSON body). Failures never break the job — the warning is already
 * durable in pipeline_metrics.warnings_json.
 */
async function postAlertWebhook(jobName, alerts, options) {
    const url = options?.alertWebhook ?? process.env.DAOBREW_ALERT_WEBHOOK;
    if (!url || alerts.length === 0)
        return;
    const fetchImpl = options?.fetchImpl ?? fetch;
    try {
        await fetchImpl(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                text: `DaoBrew warm-tier alert [${jobName}]: ${alerts.join("; ")}`,
                job_name: jobName,
                warnings: alerts,
            }),
        });
    }
    catch {
        // best-effort only
    }
}
async function readWarmState(query, nowTs, warnings) {
    let embeddingRowCount = 0;
    let warmDbBytes = 0;
    let geminiCallsToday = 0;
    try {
        const counted = await query(`SELECT (SELECT count(*) FROM meeting_notes WHERE embedding IS NOT NULL) + (SELECT count(*) FROM user_insights WHERE embedding IS NOT NULL) AS count`);
        embeddingRowCount = Number(counted[0]?.count ?? 0);
        const sized = await query(postgres_schema_js_1.WARM_DB_BYTES_SQL);
        warmDbBytes = Number(sized[0]?.bytes ?? 0);
        const calls = await query(`SELECT COALESCE(sum(gemini_calls_used), 0) AS calls FROM pipeline_metrics WHERE run_at >= ${nowTs() - 86_400}`);
        geminiCallsToday = Number(calls[0]?.calls ?? 0);
    }
    catch (err) {
        warnings.push(`warm-tier metrics readback failed: ${err?.message ?? err}`);
    }
    return { embeddingRowCount, warmDbBytes, geminiCallsToday };
}
async function readIngestHealth(query, nowTs, warnings) {
    const now = nowTs();
    const dayAgo = now - 86_400;
    const weekAgo = now - 7 * 86_400;
    try {
        const rows = await query(`SELECT\n` +
            `  (SELECT COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) FROM pipeline_metrics WHERE job_name LIKE 'ingest:%' AND run_at >= ${dayAgo}) AS p95_recent,\n` +
            `  (SELECT COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) FROM pipeline_metrics WHERE job_name LIKE 'ingest:%' AND run_at >= ${weekAgo} AND run_at < ${dayAgo}) AS p95_baseline,\n` +
            `  (SELECT count(*) FROM pipeline_metrics WHERE job_name LIKE 'ingest:%' AND run_at >= ${dayAgo}) AS runs_recent,\n` +
            `  (SELECT count(*) FROM pipeline_metrics WHERE job_name LIKE 'ingest:%' AND run_at >= ${dayAgo} AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(warnings_json) w WHERE w LIKE 'job_failed:%')) AS failed_recent`);
        return {
            p95Recent: Number(rows[0]?.p95_recent ?? 0),
            p95Baseline: Number(rows[0]?.p95_baseline ?? 0),
            runsRecent: Number(rows[0]?.runs_recent ?? 0),
            failedRecent: Number(rows[0]?.failed_recent ?? 0),
        };
    }
    catch (err) {
        warnings.push(`ingest health readback failed: ${err?.message ?? err}`);
        return { p95Recent: 0, p95Baseline: 0, runsRecent: 0, failedRecent: 0 };
    }
}
function ingestHealthWarnings(health) {
    const warnings = [];
    if (health.runsRecent < exports.INGEST_HEALTH_MIN_RUNS)
        return warnings;
    if (health.p95Baseline > 0 && health.p95Recent >= health.p95Baseline * exports.INGEST_P95_RISE_FACTOR) {
        warnings.push(`ingest p95 ${health.p95Recent}ms >= ${exports.INGEST_P95_RISE_FACTOR}x baseline ${health.p95Baseline}ms — consider Path B (PubSubIngestSink)`);
    }
    const errorRate = health.failedRecent / health.runsRecent;
    if (errorRate >= exports.INGEST_ERROR_RATE_WARN) {
        warnings.push(`ingest write-error rate ${(errorRate * 100).toFixed(0)}% (${health.failedRecent}/${health.runsRecent} runs in 24h) >= ${exports.INGEST_ERROR_RATE_WARN * 100}% — consider Path B (PubSubIngestSink)`);
    }
    return warnings;
}
async function recordJobFailure(jobName, err, deps, startTs) {
    const exec = deps.exec ?? graph_db_js_1.execSql;
    const nowTs = deps.nowTs ?? (() => Math.floor(Date.now() / 1000));
    const message = String(err?.message ?? err).slice(0, 500);
    const durationMs = Math.max(0, (nowTs() - startTs) * 1000);
    try {
        await exec(`INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
            `VALUES (${(0, graph_db_js_1.q)(`metric_${(0, node_crypto_1.randomUUID)()}`)}, ${(0, graph_db_js_1.q)(jobName)}, ${durationMs}, 0, 0, 0, 0, 0, ${(0, graph_db_js_1.q)(JSON.stringify([`job_failed: ${message}`]))}::jsonb, ${nowTs()});`);
    }
    catch {
        // metrics are best-effort on the failure path; the original error still propagates
    }
}
function thresholdWarnings(state) {
    const warnings = [];
    if (state.embeddingRowCount >= exports.EMBEDDING_ROW_WARN_THRESHOLD) {
        warnings.push(`embedding_row_count ${state.embeddingRowCount} >= ${exports.EMBEDDING_ROW_WARN_THRESHOLD}`);
    }
    if (state.warmDbBytes >= exports.WARM_DB_BYTES_WARN_THRESHOLD) {
        warnings.push(`warm_db_bytes ${state.warmDbBytes} >= ${exports.WARM_DB_BYTES_WARN_THRESHOLD} (80% of 0.5 GB tier)`);
    }
    if (state.geminiCallsToday >= exports.GEMINI_DAILY_CALLS_WARN_THRESHOLD) {
        warnings.push(`gemini_calls_used ${state.geminiCallsToday} in last 24h >= ${exports.GEMINI_DAILY_CALLS_WARN_THRESHOLD} (80% of 1,500/day)`);
    }
    return warnings;
}
async function finishJob(jobName, result, deps, startTs) {
    const exec = deps.exec ?? graph_db_js_1.execSql;
    const query = deps.query ?? graph_db_js_1.queryJson;
    const nowTs = deps.nowTs ?? (() => Math.floor(Date.now() / 1000));
    const warnings = [...(result.warnings ?? [])];
    const state = await readWarmState(query, nowTs, warnings);
    const health = await readIngestHealth(query, nowTs, warnings);
    const lifecycleDegraded = warnings.some((warning) => warning.startsWith("insight lifecycle degraded:"));
    if (result.lifecycleDecisionCounts && !lifecycleDegraded) {
        const counts = result.lifecycleDecisionCounts;
        const total = counts.add + counts.supersedes + counts.noopDuplicate + counts.replayed + counts.overflow;
        if (total > 0) {
            warnings.push(`insight lifecycle decisions: add=${counts.add}, supersedes=${counts.supersedes}, noop_duplicate=${counts.noopDuplicate}, replayed=${counts.replayed}, overflow=${counts.overflow}`);
        }
    }
    const alerts = [...thresholdWarnings(state), ...ingestHealthWarnings(health)];
    warnings.push(...alerts);
    const durationMs = Math.max(0, (nowTs() - startTs) * 1000);
    await exec(`INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
        `VALUES (${(0, graph_db_js_1.q)(`metric_${(0, node_crypto_1.randomUUID)()}`)}, ${(0, graph_db_js_1.q)(jobName)}, ${durationMs}, ${result.rowsWritten}, ${result.dedupSkips}, ${result.geminiCallsUsed ?? 0}, ${state.embeddingRowCount}, ${state.warmDbBytes}, ${(0, graph_db_js_1.q)(JSON.stringify(warnings))}::jsonb, ${nowTs()});`);
    await postAlertWebhook(jobName, alerts, deps);
    return { jobName, ...result, warnings, alerts };
}
async function runCalendarIngestJob(options) {
    const nowTs = options.nowTs ?? (() => Math.floor(Date.now() / 1000));
    const startTs = nowTs();
    const rows = (0, calendar_js_1.normalizeCalendarEvents)(options.rawEvents);
    let result;
    try {
        result = await options.sink.upsertEvents(options.userId, rows);
    }
    catch (err) {
        await recordJobFailure("ingest:calendar", err, options, startTs);
        throw err;
    }
    return finishJob("ingest:calendar", result, options, startTs);
}
async function runGranolaIngestJob(options) {
    const nowTs = options.nowTs ?? (() => Math.floor(Date.now() / 1000));
    const startTs = nowTs();
    const rawNotes = options.rawNotes ?? (await (0, granola_js_1.fetchGranolaNotes)({ fetchImpl: options.fetchImpl }));
    const rows = (0, granola_js_1.normalizeGranolaNotes)(rawNotes);
    let result;
    try {
        result = await options.sink.upsertMeetingNotes(options.userId, rows);
    }
    catch (err) {
        await recordJobFailure("ingest:granola", err, options, startTs);
        throw err;
    }
    return finishJob("ingest:granola", result, options, startTs);
}
exports.MEMORY_DISCOVERY_EMPTY_WARNING = "no Claude/Codex session projects discovered under ~/.claude/projects or ~/.codex/sessions";
async function runMemoryIngestJob(options) {
    const nowTs = options.nowTs ?? (() => Math.floor(Date.now() / 1000));
    const startTs = nowTs();
    let rows;
    let projects;
    if (options.memoryRows) {
        rows = options.memoryRows;
    }
    else if (typeof options.projectPath === "string" && options.projectPath) {
        rows = (0, claudeMemory_js_1.buildMemoryRows)({ projectPath: options.projectPath });
    }
    else {
        // Discovery mode: scan every session file once, then preserve the existing
        // project-major row order from the bounded summaries.
        const discovered = await (0, claudeMemory_js_1.buildDiscoveredMemoryRows)(options.discoveryRoots);
        if (discovered.projects.length === 0) {
            // Nothing to ingest: return a warning without touching the sink or
            // pipeline_metrics — a store-configured machine with an unreachable DB
            // must not error on zero discovery (the sink constructor still requires
            // DAOBREW_GRAPH_STORE=postgres — lazy construction is a follow-up in
            // the local-pipeline-triggers plan).
            return {
                jobName: "ingest:memory",
                rowsWritten: 0,
                dedupSkips: 0,
                warnings: [exports.MEMORY_DISCOVERY_EMPTY_WARNING],
                alerts: [],
                projects: [],
            };
        }
        projects = discovered.projects;
        rows = discovered.rows;
    }
    let result;
    try {
        result = await options.sink.upsertInsights(options.userId, rows);
    }
    catch (err) {
        await recordJobFailure("ingest:memory", err, options, startTs);
        throw err;
    }
    // One pipeline_metrics row per job run (recency signal), even when
    // discovery ingested multiple projects.
    const finished = await finishJob("ingest:memory", result, options, startTs);
    return projects ? { ...finished, projects } : finished;
}
