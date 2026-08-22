"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const claudeMemory_js_1 = require("../src/engine/sources/claudeMemory.js");
const priors_js_1 = require("../src/engine/transfer/priors.js");
const internal_server_js_1 = require("../src/engine/internal-server.js");
const internal_server_harness_js_1 = require("./internal-server-harness.js");
const jobs_js_1 = require("../src/engine/ingest/jobs.js");
const postgres_schema_js_1 = require("../src/engine/postgres-schema.js");
(0, node_test_1.describe)("warm-tier ingest jobs", () => {
    (0, node_test_1.it)("runs calendar ingest through the sink and metrics", async () => {
        const calls = [];
        const result = await (0, jobs_js_1.runCalendarIngestJob)({
            userId: "u1",
            rawEvents: [{ id: "e1", title: "Sync", startDate: "2026-07-01T17:00:00Z" }],
            sink: {
                upsertEvents: async () => ({ rowsWritten: 1, dedupSkips: 0 }),
                upsertMeetingNotes: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertInsights: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
            },
            exec: async (sql) => { calls.push(sql); },
            query: async () => [{ bytes: 1 }],
            nowTs: () => 1234,
        });
        assert.strictEqual(result.rowsWritten, 1);
        assert.match(calls.join("\n"), /INSERT INTO pipeline_metrics/);
    });
    (0, node_test_1.it)("sizes warm_db_bytes over every schema table so growth is never invisible to alerts", async () => {
        const sizeQueries = [];
        await (0, jobs_js_1.runCalendarIngestJob)({
            userId: "u1",
            rawEvents: [{ id: "e1", title: "Sync", startDate: "2026-07-01T17:00:00Z" }],
            sink: {
                upsertEvents: async () => ({ rowsWritten: 1, dedupSkips: 0 }),
                upsertMeetingNotes: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertInsights: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
            },
            exec: async () => { },
            query: async (sql) => {
                if (/pg_total_relation_size/.test(sql))
                    sizeQueries.push(sql);
                return [{ bytes: 1 }];
            },
            nowTs: () => 1234,
        });
        assert.strictEqual(sizeQueries.length, 1);
        for (const table of postgres_schema_js_1.POSTGRES_TABLES) {
            assert.ok(sizeQueries[0].includes(`to_regclass('${table}')`), `warm-db size query must include ${table}`);
        }
    });
    (0, node_test_1.it)("fires threshold warnings exactly at the boundary and not below", () => {
        const below = (0, jobs_js_1.thresholdWarnings)({
            embeddingRowCount: jobs_js_1.EMBEDDING_ROW_WARN_THRESHOLD - 1,
            warmDbBytes: jobs_js_1.WARM_DB_BYTES_WARN_THRESHOLD - 1,
            geminiCallsToday: jobs_js_1.GEMINI_DAILY_CALLS_WARN_THRESHOLD - 1,
        });
        assert.deepStrictEqual(below, []);
        const atBoundary = (0, jobs_js_1.thresholdWarnings)({
            embeddingRowCount: jobs_js_1.EMBEDDING_ROW_WARN_THRESHOLD,
            warmDbBytes: jobs_js_1.WARM_DB_BYTES_WARN_THRESHOLD,
            geminiCallsToday: jobs_js_1.GEMINI_DAILY_CALLS_WARN_THRESHOLD,
        });
        assert.strictEqual(atBoundary.length, 3);
        assert.match(atBoundary[0], /embedding_row_count/);
        assert.match(atBoundary[1], /warm_db_bytes/);
        assert.match(atBoundary[2], /gemini_calls_used/);
    });
    (0, node_test_1.it)("records a failure metrics row when the sink throws", async () => {
        const calls = [];
        await assert.rejects(() => (0, jobs_js_1.runCalendarIngestJob)({
            userId: "u1",
            rawEvents: [{ id: "e1", title: "Sync", startDate: "2026-07-01T17:00:00Z" }],
            sink: {
                upsertEvents: async () => { throw new Error("neon down"); },
                upsertMeetingNotes: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertInsights: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
            },
            exec: async (sql) => { calls.push(sql); },
            query: async () => [],
            nowTs: () => 1234,
        }), /neon down/);
        assert.match(calls.join("\n"), /INSERT INTO pipeline_metrics/);
        assert.match(calls.join("\n"), /job_failed/);
    });
    (0, node_test_1.it)("warns when ingest p95 rises or write errors accumulate", async () => {
        const result = await (0, jobs_js_1.runCalendarIngestJob)({
            userId: "u1",
            rawEvents: [{ id: "e1", title: "Sync", startDate: "2026-07-01T17:00:00Z" }],
            sink: {
                upsertEvents: async () => ({ rowsWritten: 1, dedupSkips: 0 }),
                upsertMeetingNotes: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertInsights: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
            },
            exec: async () => { },
            query: async (sql) => {
                if (/percentile_cont/.test(sql))
                    return [{ p95_recent: 4000, p95_baseline: 1000, runs_recent: 10, failed_recent: 3 }];
                if (/count\(\*\)/.test(sql))
                    return [{ count: 0 }];
                return [{ bytes: 1, calls: 0 }];
            },
            nowTs: () => 1234,
        });
        assert.ok(result.warnings.some((warning) => /p95/.test(warning)));
        assert.ok(result.warnings.some((warning) => /write-error/.test(warning)));
        assert.ok(result.alerts.some((alert) => /PubSubIngestSink/.test(alert)));
    });
    (0, node_test_1.it)("stays quiet on healthy ingest history", () => {
        assert.deepStrictEqual((0, jobs_js_1.ingestHealthWarnings)({ p95Recent: 1200, p95Baseline: 1000, runsRecent: 10, failedRecent: 0 }), []);
        assert.deepStrictEqual((0, jobs_js_1.ingestHealthWarnings)({ p95Recent: 9000, p95Baseline: 1000, runsRecent: 3, failedRecent: 2 }), []);
    });
    (0, node_test_1.it)("posts a webhook alert when a threshold is crossed", async () => {
        const webhookCalls = [];
        const result = await (0, jobs_js_1.runCalendarIngestJob)({
            userId: "u1",
            rawEvents: [{ id: "e1", title: "Sync", startDate: "2026-07-01T17:00:00Z" }],
            sink: {
                upsertEvents: async () => ({ rowsWritten: 1, dedupSkips: 0 }),
                upsertMeetingNotes: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertInsights: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
            },
            exec: async () => { },
            query: async (sql) => {
                if (/count\(\*\)/.test(sql))
                    return [{ count: 500_000 }];
                return [{ bytes: 1, calls: 0 }];
            },
            nowTs: () => 1234,
            alertWebhook: "https://hooks.example.com/warm-tier",
            fetchImpl: (async (url, init) => {
                webhookCalls.push(`${url} ${init?.body ?? ""}`);
                return { ok: true, json: async () => ({}) };
            }),
        });
        assert.ok(result.warnings.some((warning) => /embedding_row_count/.test(warning)));
        assert.strictEqual(webhookCalls.length, 1);
        assert.match(webhookCalls[0], /hooks\.example\.com/);
        assert.match(webhookCalls[0], /embedding_row_count/);
    });
    (0, node_test_1.it)("runs memory ingest through normalized Claude/Codex rows", async () => {
        const result = await (0, jobs_js_1.runMemoryIngestJob)({
            userId: "u1",
            projectPath: "/repo/DaobrewAI",
            memoryRows: [{
                    id: "m1",
                    source: "claude_sessions",
                    source_ref: "session:1",
                    insight_text: "Reviewable evidence trail.",
                    topics: ["#memory"],
                    importance: 0.8,
                    strength: 1,
                    occurred_at_ts: null,
                    last_accessed_ts: null,
                }],
            sink: {
                upsertEvents: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertMeetingNotes: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertInsights: async () => ({ rowsWritten: 1, dedupSkips: 0 }),
            },
            exec: async () => { },
            query: async () => [{ bytes: 1 }],
            nowTs: () => 1234,
        });
        assert.strictEqual(result.rowsWritten, 1);
    });
    (0, node_test_1.it)("records memory lifecycle gemini usage and lifecycle warnings in pipeline_metrics", async () => {
        const calls = [];
        const result = await (0, jobs_js_1.runMemoryIngestJob)({
            userId: "u1",
            projectPath: "/repo/DaobrewAI",
            memoryRows: [{
                    id: "m1",
                    source: "claude_sessions",
                    source_ref: "session:1",
                    insight_text: "Reviewable evidence trail.",
                    topics: ["#memory"],
                    importance: 0.8,
                    strength: 1,
                    occurred_at_ts: null,
                    last_accessed_ts: null,
                }],
            sink: {
                upsertEvents: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertMeetingNotes: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertInsights: async () => ({
                    rowsWritten: 1,
                    dedupSkips: 0,
                    geminiCallsUsed: 1,
                    lifecycleDecisionCounts: { add: 1, supersedes: 0, noopDuplicate: 0, replayed: 0, overflow: 0 },
                    warnings: [],
                }),
            },
            exec: async (sql) => { calls.push(sql); },
            query: async (sql) => {
                if (/count\(\*\)/.test(sql))
                    return [{ count: 0 }];
                if (/percentile_cont/.test(sql))
                    return [{ p95_recent: 0, p95_baseline: 0, runs_recent: 0, failed_recent: 0 }];
                return [{ bytes: 1, calls: 0 }];
            },
            nowTs: () => 1234,
        });
        assert.equal(result.geminiCallsUsed, 1);
        assert.ok(result.warnings.some((warning) => /insight lifecycle decisions: add=1/.test(warning)));
        const metricsSql = calls.find((sql) => /INSERT INTO pipeline_metrics/.test(sql)) ?? "";
        assert.match(metricsSql, /, 1, 0, 1, 0, 1,/);
    });
});
(0, node_test_1.describe)("discoverMemoryProjects", () => {
    (0, node_test_1.it)("finds real cwd values from claude and codex session files, deduped", () => {
        const root = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-discover-"));
        const claudeProj = (0, node_path_1.join)(root, "claude-projects", "-Users-alice-Work-app");
        (0, node_fs_1.mkdirSync)(claudeProj, { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(claudeProj, "s1.jsonl"), JSON.stringify({ cwd: "/Users/alice/Work/app", type: "user" }) + "\n");
        const codexDir = (0, node_path_1.join)(root, "codex-sessions", "2026", "07");
        (0, node_fs_1.mkdirSync)(codexDir, { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(codexDir, "rollout-1.jsonl"), 
        // real codex shape: turn_context carries payload.cwd — duplicate of the
        // claude file's top-level cwd, so the dedup assertion still holds
        JSON.stringify({ type: "turn_context", payload: { cwd: "/Users/alice/Work/app" } }) + "\n" +
            JSON.stringify({ cwd: "/Users/alice/Work/other" }) + "\n");
        const found = (0, claudeMemory_js_1.discoverMemoryProjects)({
            claudeProjectsRoot: (0, node_path_1.join)(root, "claude-projects"),
            codexSessionsRoot: (0, node_path_1.join)(root, "codex-sessions"),
        });
        assert.deepEqual(found.sort(), ["/Users/alice/Work/app", "/Users/alice/Work/other"]);
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
    });
    (0, node_test_1.it)("returns [] when roots are missing", () => {
        assert.deepEqual((0, claudeMemory_js_1.discoverMemoryProjects)({
            claudeProjectsRoot: "/nonexistent-a", codexSessionsRoot: "/nonexistent-b",
        }), []);
    });
});
(0, node_test_1.describe)("memory ingest discovery mode (no projectPath)", () => {
    (0, node_test_1.it)("discovers projects and ingests rows from all of them with per-project counts", async () => {
        const root = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-discover-job-"));
        const claudeProj = (0, node_path_1.join)(root, "claude-projects", "-Users-alice-Work-alpha");
        (0, node_fs_1.mkdirSync)(claudeProj, { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(claudeProj, "s1.jsonl"), JSON.stringify({ cwd: "/Users/alice/Work/alpha", type: "user", message: { content: "Fix the login flow" } }) + "\n");
        const codexDir = (0, node_path_1.join)(root, "codex-sessions", "2026", "07");
        (0, node_fs_1.mkdirSync)(codexDir, { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(codexDir, "rollout-b.jsonl"), JSON.stringify({ type: "turn_context", payload: { cwd: "/Users/alice/Work/beta" } }) + "\n" +
            JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: "Refactor the beta service" } }) + "\n");
        let upserted = [];
        const result = await (0, jobs_js_1.runMemoryIngestJob)({
            userId: "u1",
            discoveryRoots: {
                claudeProjectsRoot: (0, node_path_1.join)(root, "claude-projects"),
                codexSessionsRoot: (0, node_path_1.join)(root, "codex-sessions"),
            },
            sink: {
                upsertEvents: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertMeetingNotes: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertInsights: async (_userId, rows) => {
                    upserted = upserted.concat(rows);
                    return { rowsWritten: rows.length, dedupSkips: 0 };
                },
            },
            exec: async () => { },
            query: async () => [{ bytes: 1 }],
            nowTs: () => 1234,
        });
        assert.strictEqual(result.rowsWritten, 2);
        assert.deepEqual(result.projects, [
            { path: "/Users/alice/Work/alpha", rows: 1 },
            { path: "/Users/alice/Work/beta", rows: 1 },
        ]);
        assert.deepEqual(upserted.map((row) => row.source).sort(), [
            "claude_project_session",
            "codex_project_session",
        ]);
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
    });
    (0, node_test_1.it)("warns and writes nothing when zero projects are discovered", async () => {
        const execCalls = [];
        let sinkTouched = false;
        const result = await (0, jobs_js_1.runMemoryIngestJob)({
            userId: "u1",
            discoveryRoots: {
                claudeProjectsRoot: "/nonexistent-a",
                codexSessionsRoot: "/nonexistent-b",
            },
            sink: {
                upsertEvents: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertMeetingNotes: async () => ({ rowsWritten: 0, dedupSkips: 0 }),
                upsertInsights: async () => { sinkTouched = true; return { rowsWritten: 0, dedupSkips: 0 }; },
            },
            exec: async (sql) => { execCalls.push(sql); },
            query: async () => [{ bytes: 1 }],
            nowTs: () => 1234,
        });
        assert.strictEqual(result.rowsWritten, 0);
        assert.ok(result.warnings.some((warning) => /no Claude\/Codex session projects discovered/.test(warning)));
        assert.strictEqual(sinkTouched, false);
        // zero discovery is a no-op: no sink write, no pipeline_metrics row
        assert.deepEqual(execCalls, []);
        assert.deepEqual(result.projects, []);
    });
    (0, node_test_1.it)("accepts a bodyless HTTP memory ingest request (discovery mode, 200 not 400)", async () => {
        const emptyHome = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-empty-home-"));
        const savedHome = process.env.HOME;
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        const savedStore = process.env.DAOBREW_GRAPH_STORE;
        const savedInternalUser = process.env.DAOBREW_INTERNAL_USER;
        process.env.HOME = emptyHome;
        delete process.env.DAOBREW_INTERNAL_TOKEN;
        // The route's PostgresIngestSink constructor requires the postgres store
        // kind (unchanged); zero discovery returns before any SQL executes.
        process.env.DAOBREW_GRAPH_STORE = "postgres";
        process.env.DAOBREW_INTERNAL_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
        try {
            const response = await (0, internal_server_harness_js_1.postInternal)("/internal/ingest/memory", "{}");
            assert.strictEqual(response.status, 200);
            const body = response.json;
            assert.strictEqual(body.status, "ok");
            assert.strictEqual(body.rowsWritten, 0);
            assert.ok(body.warnings.some((warning) => /no Claude\/Codex session projects discovered/.test(warning)));
        }
        finally {
            if (savedHome === undefined)
                delete process.env.HOME;
            else
                process.env.HOME = savedHome;
            if (savedToken !== undefined)
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            if (savedStore !== undefined)
                process.env.DAOBREW_GRAPH_STORE = savedStore;
            if (savedStore === undefined)
                delete process.env.DAOBREW_GRAPH_STORE;
            else
                process.env.DAOBREW_GRAPH_STORE = savedStore;
            if (savedInternalUser === undefined)
                delete process.env.DAOBREW_INTERNAL_USER;
            else
                process.env.DAOBREW_INTERNAL_USER = savedInternalUser;
            (0, node_fs_1.rmSync)(emptyHome, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects a present but non-string projectPath with 400 (no silent discovery)", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        const savedInternalUser = process.env.DAOBREW_INTERNAL_USER;
        delete process.env.DAOBREW_INTERNAL_TOKEN;
        // Also unset the store so this test pins guard-before-sink ordering: if a
        // regression moved sink construction ahead of the 400 guard, the
        // constructor would throw here instead of returning 400.
        const savedStore = process.env.DAOBREW_GRAPH_STORE;
        delete process.env.DAOBREW_GRAPH_STORE;
        process.env.DAOBREW_INTERNAL_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
        try {
            const response = await (0, internal_server_harness_js_1.postInternal)("/internal/ingest/memory", { projectPath: 42 });
            assert.strictEqual(response.status, 400);
            const body = response.json;
            assert.strictEqual(body.status, "error");
            assert.match(body.error, /projectPath must be a non-empty string when provided/);
        }
        finally {
            if (savedToken !== undefined)
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            if (savedStore === undefined)
                delete process.env.DAOBREW_GRAPH_STORE;
            else
                process.env.DAOBREW_GRAPH_STORE = savedStore;
            if (savedInternalUser === undefined)
                delete process.env.DAOBREW_INTERNAL_USER;
            else
                process.env.DAOBREW_INTERNAL_USER = savedInternalUser;
        }
    });
});
// --- T8: population_priors consolidation + cold-start read (5B / design §6) --
function priorsQueryFixture(opts = {}) {
    return async (sql) => {
        if (/COUNT\(DISTINCT contributor_hash\)/.test(sql)) {
            return opts.aggregates ?? [
                { stress_pattern: "overdrive", outcome: "worked", n: 6, contributors: 5 },
                { stress_pattern: "overdrive", outcome: "did_not_work", n: 2, contributors: 2 },
                { stress_pattern: "tension", outcome: "worked", n: 2, contributors: 2 },
            ];
        }
        if (/SELECT context_bucket_json ->> 'stress_pattern' AS stress_pattern, method_json/.test(sql)) {
            return opts.methodRows ?? [
                { stress_pattern: "overdrive", method_json: { suggested_block: { title: "Draft wedge" } }, outcome_strength: 0.9, contributor_hash: "c1" },
                { stress_pattern: "overdrive", method_json: { suggested_block: { title: "Block deep work" } }, outcome_strength: 0.7, contributor_hash: "c2" },
                { stress_pattern: "tension", method_json: { suggested_block: { title: "PRIVATE_METHOD" } }, outcome_strength: 1, contributor_hash: "c9" },
            ];
        }
        if (/MAX\(version\)/.test(sql)) {
            return [{ v: opts.maxVersion ?? null }];
        }
        if (/FROM population_priors WHERE/.test(sql)) {
            return opts.priorRows ?? [];
        }
        return [];
    };
}
(0, node_test_1.describe)("T8 population priors job (5B)", () => {
    (0, node_test_1.it)("writes one versioned prior per stress pattern with k-anon-gated top methods", async () => {
        const calls = [];
        const result = await (0, priors_js_1.runTransferPriorsJob)({
            exec: async (sql) => { calls.push(sql); },
            query: priorsQueryFixture(),
            nowTs: () => 1_800_000_000,
        });
        const inserts = calls.filter((sql) => /INSERT INTO population_priors/.test(sql));
        assert.equal(inserts.length, 2);
        const overdrive = inserts.find((sql) => sql.includes("'overdrive'"));
        const tension = inserts.find((sql) => sql.includes("'tension'"));
        assert.ok(overdrive && tension);
        assert.match(overdrive, /"worked":6/);
        assert.match(overdrive, /"did_not_work":2/);
        assert.match(overdrive, /Draft wedge/);
        assert.match(overdrive, /'global'/);
        // tension has only 2 contributors — counts stay, methods are suppressed
        assert.match(tension, /"worked":2/);
        assert.ok(!tension.includes("PRIVATE_METHOD"), "below-threshold bucket must not expose methods");
        assert.equal(result.priorsWritten, 2);
        const metrics = calls.filter((sql) => /INSERT INTO pipeline_metrics/.test(sql));
        assert.equal(metrics.length, 1);
        assert.match(metrics[0], /'transfer_priors'/);
    });
    (0, node_test_1.it)("bumps the global cohort version past the existing max", async () => {
        const calls = [];
        await (0, priors_js_1.runTransferPriorsJob)({
            exec: async (sql) => { calls.push(sql); },
            query: priorsQueryFixture({ maxVersion: 4 }),
            nowTs: () => 1_800_000_000,
        });
        const insert = calls.find((sql) => /INSERT INTO population_priors/.test(sql));
        assert.ok(insert);
        assert.match(insert, /, 5, 1800000000\)/);
    });
    (0, node_test_1.it)("writes nothing (but still a metrics row) on an empty record store", async () => {
        const calls = [];
        const result = await (0, priors_js_1.runTransferPriorsJob)({
            exec: async (sql) => { calls.push(sql); },
            query: priorsQueryFixture({ aggregates: [], methodRows: [] }),
            nowTs: () => 1_800_000_000,
        });
        assert.equal(result.priorsWritten, 0);
        assert.equal(calls.filter((sql) => /INSERT INTO population_priors/.test(sql)).length, 0);
        assert.equal(calls.filter((sql) => /INSERT INTO pipeline_metrics/.test(sql)).length, 1);
    });
    (0, node_test_1.it)("readPopulationPrior returns the latest-version prior or null", async () => {
        const prior = await (0, priors_js_1.readPopulationPrior)("overdrive", priorsQueryFixture({
            priorRows: [{ stress_pattern: "overdrive", prior_json: { worked: 6, did_not_work: 2, top_methods: [] }, sample_size: 8, confidence: 0.5, version: 5 }],
        }));
        assert.ok(prior);
        assert.equal(prior.stress_pattern, "overdrive");
        assert.equal(prior.prior_json.worked, 6);
        assert.equal(await (0, priors_js_1.readPopulationPrior)("missing", priorsQueryFixture()), null);
    });
});
(0, node_test_1.describe)("internal server port resolution", () => {
    function withPortEnv(fn) {
        const savedInternal = process.env.DAOBREW_INTERNAL_PORT;
        const savedPort = process.env.PORT;
        try {
            fn();
        }
        finally {
            if (savedInternal === undefined)
                delete process.env.DAOBREW_INTERNAL_PORT;
            else
                process.env.DAOBREW_INTERNAL_PORT = savedInternal;
            if (savedPort === undefined)
                delete process.env.PORT;
            else
                process.env.PORT = savedPort;
        }
    }
    (0, node_test_1.it)("internal server honors Cloud Run PORT when DAOBREW_INTERNAL_PORT is unset", () => {
        withPortEnv(() => {
            delete process.env.DAOBREW_INTERNAL_PORT;
            process.env.PORT = "9099";
            assert.equal((0, internal_server_js_1.resolveInternalPort)(), 9099);
        });
    });
    (0, node_test_1.it)("DAOBREW_INTERNAL_PORT wins over PORT", () => {
        withPortEnv(() => {
            process.env.DAOBREW_INTERNAL_PORT = "8791";
            process.env.PORT = "9099";
            assert.equal((0, internal_server_js_1.resolveInternalPort)(), 8791);
        });
    });
    (0, node_test_1.it)("defaults to 8787 when neither is set", () => {
        withPortEnv(() => {
            delete process.env.DAOBREW_INTERNAL_PORT;
            delete process.env.PORT;
            assert.equal((0, internal_server_js_1.resolveInternalPort)(), 8787);
        });
    });
});
// --- D2: multi-user iteration over discovered identities -------------------
(0, node_test_1.describe)("multi-user iteration (D2)", () => {
    (0, node_test_1.it)("iterates every discovered identity and isolates one identity's failure", async () => {
        const ran = [];
        const aliceId = "14802294-BEED-480E-ABF6-7E3703FA25CD";
        const bobId = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
        const carolId = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";
        const discover = async () => [aliceId, bobId, carolId];
        const runOne = async (uid) => {
            ran.push(uid);
            if (uid === bobId)
                throw new Error("bob's threads exploded");
            return { threadsUpserted: 1 };
        };
        const out = await (0, internal_server_js_1.runForAllUsers)(runOne, { discover });
        // All three ran despite Bob failing — one failure must not stop the rest.
        assert.deepStrictEqual(ran, [aliceId, bobId, carolId]);
        assert.strictEqual(out.usersTotal, 3);
        assert.strictEqual(out.usersOk, 2);
        assert.strictEqual(out.usersFailed, 1);
        const bob = out.results.find((r) => r.userId === bobId);
        assert.strictEqual(bob.status, "error");
        assert.match(bob.error, /exploded/);
        const alice = out.results.find((r) => r.userId === aliceId);
        assert.strictEqual(alice.status, "ok");
        assert.deepStrictEqual(alice.result, { threadsUpserted: 1 });
    });
    (0, node_test_1.it)("returns an empty all-users result when no identities are active", async () => {
        const out = await (0, internal_server_js_1.runForAllUsers)(async () => {
            throw new Error("must not run");
        }, { discover: async () => [] });
        assert.strictEqual(out.usersTotal, 0);
        assert.strictEqual(out.usersOk, 0);
        assert.strictEqual(out.usersFailed, 0);
        assert.deepStrictEqual(out.results, []);
    });
    (0, node_test_1.it)("passes each discovered UUID identity to the per-user job verbatim", async () => {
        const seen = [];
        const ids = ["783A7344-AE06-4125-8A37-D452A9C1C92F", "4A008E08-4076-4BA6-B930-3C41B6E50153"];
        const discover = async () => ids;
        await (0, internal_server_js_1.runForAllUsers)(async (uid) => { seen.push(uid); return { ok: true }; }, { discover });
        assert.deepStrictEqual(seen, ids);
    });
});
// --- D2: multi-user route wiring (HTTP, discovery injected as empty) --------
//
// The layer2 routes accept `allUsers:true` and delegate to runForAllUsers. To
// exercise the route branch without a live DB, the internal server is created
// with an injected `discover` that returns zero identities — so no per-user job
// runs and the handler returns the empty all-users report shape.
(0, node_test_1.describe)("layer2 routes accept the allUsers opt-in", () => {
    async function postJson(path, body) {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        delete process.env.DAOBREW_INTERNAL_TOKEN;
        try {
            const response = await (0, internal_server_harness_js_1.postInternal)(path, body, { discover: async () => [] });
            return { status: response.status, json: response.json };
        }
        finally {
            if (savedToken !== undefined)
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
        }
    }
    for (const path of ["/internal/layer2/nightly", "/internal/layer2/snapshot"]) {
        (0, node_test_1.it)(`${path} with allUsers:true returns the multi-user report shape`, async () => {
            const { status, json } = await postJson(path, { allUsers: true });
            assert.strictEqual(status, 200);
            assert.strictEqual(json.status, "ok");
            assert.strictEqual(json.mode, "all_users");
            assert.strictEqual(json.usersTotal, 0);
            assert.strictEqual(json.usersOk, 0);
            assert.strictEqual(json.usersFailed, 0);
            assert.deepStrictEqual(json.results, []);
        });
    }
});
// --- Authenticated backend -> engine proxy ---------------------------------
const ENGINE_GENERATION_ID = "11111111-1111-4111-8111-111111111111";
const ENGINE_LEASE_TOKEN = "22222222-2222-4222-8222-222222222222";
function productionEnginePayload(extra = {}) {
    return {
        userId: "server-resolved-user",
        generationId: ENGINE_GENERATION_ID,
        leaseToken: ENGINE_LEASE_TOKEN,
        ...extra,
    };
}
function fakeEngineResult(status, userId, generationId = ENGINE_GENERATION_ID) {
    return {
        status,
        user_id: userId,
        generation_id: generationId,
        demo: false,
        dry_run: false,
        triplet_count: status === "no_signal" ? 1 : 2,
        node_count: status === "written" ? 6 : 0,
        edge_count: status === "written" ? 1 : 0,
        root_armed: false,
        graph_store: "postgres",
        signal_counts: {
            calendar: 0,
            granola: 0,
            memory: 0,
            biometric_episodes: 1,
            biometric_source: "neon-direct",
        },
        warnings: [],
    };
}
(0, node_test_1.describe)("token-gated /internal/engine/run", () => {
    (0, node_test_1.it)("pins the authenticated principal to a non-demo month run and ignores execution knobs", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        process.env.DAOBREW_INTERNAL_TOKEN = "internal-test-token";
        const calls = [];
        const server = (0, internal_server_js_1.createInternalServer)({
            runEngineOnce: async (options) => {
                calls.push(options);
                return fakeEngineResult("written", options.userId);
            },
        });
        try {
            await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            const response = await fetch(`http://127.0.0.1:${port}/internal/engine/run`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-daobrew-internal-token": "internal-test-token",
                },
                body: JSON.stringify(productionEnginePayload({
                    demo: true,
                    dryRun: true,
                    biometricRange: "day",
                    allUsers: true,
                })),
            });
            assert.strictEqual(response.status, 200);
            const body = await response.json();
            assert.strictEqual(body.status, "written");
            assert.strictEqual(body.demo, false);
            assert.deepStrictEqual(calls, [{
                    once: true,
                    dryRun: false,
                    demo: false,
                    userId: "server-resolved-user",
                    deviceId: "server-resolved-user",
                    generationId: ENGINE_GENERATION_ID,
                    leaseToken: ENGINE_LEASE_TOKEN,
                    biometricRange: "month",
                }]);
        }
        finally {
            if (savedToken === undefined)
                delete process.env.DAOBREW_INTERNAL_TOKEN;
            else
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            await new Promise((resolve) => server.close(() => resolve()));
        }
    });
    (0, node_test_1.it)("fails closed when the token is missing or wrong, without invoking the engine", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        process.env.DAOBREW_INTERNAL_TOKEN = "internal-test-token";
        let calls = 0;
        const server = (0, internal_server_js_1.createInternalServer)({
            runEngineOnce: async () => {
                calls += 1;
                return fakeEngineResult("no_signal", "must-not-run");
            },
        });
        try {
            await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            for (const token of [undefined, "wrong-token"]) {
                const headers = { "content-type": "application/json" };
                if (token)
                    headers["x-daobrew-internal-token"] = token;
                const response = await fetch(`http://127.0.0.1:${port}/internal/engine/run`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ userId: "server-resolved-user" }),
                });
                assert.strictEqual(response.status, 401);
            }
            assert.strictEqual(calls, 0);
        }
        finally {
            if (savedToken === undefined)
                delete process.env.DAOBREW_INTERNAL_TOKEN;
            else
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            await new Promise((resolve) => server.close(() => resolve()));
        }
    });
    (0, node_test_1.it)("requires token configuration and an explicit non-local principal", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        delete process.env.DAOBREW_INTERNAL_TOKEN;
        let calls = 0;
        const server = (0, internal_server_js_1.createInternalServer)({
            runEngineOnce: async () => {
                calls += 1;
                return fakeEngineResult("skipped_done", "must-not-run");
            },
        });
        try {
            await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            const unconfigured = await fetch(`http://127.0.0.1:${port}/internal/engine/run`, {
                method: "POST",
                body: JSON.stringify(productionEnginePayload()),
            });
            assert.strictEqual(unconfigured.status, 503);
            process.env.DAOBREW_INTERNAL_TOKEN = "internal-test-token";
            for (const payload of [{}, { userId: "local" }, { user_id: "forged-fallback" }]) {
                const response = await fetch(`http://127.0.0.1:${port}/internal/engine/run`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-daobrew-internal-token": "internal-test-token",
                    },
                    body: JSON.stringify(payload),
                });
                assert.strictEqual(response.status, 400);
            }
            assert.strictEqual(calls, 0);
        }
        finally {
            if (savedToken === undefined)
                delete process.env.DAOBREW_INTERNAL_TOKEN;
            else
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            await new Promise((resolve) => server.close(() => resolve()));
        }
    });
    (0, node_test_1.it)("redacts engine/provider failures at the HTTP boundary", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        process.env.DAOBREW_INTERNAL_TOKEN = "internal-test-token";
        const server = (0, internal_server_js_1.createInternalServer)({
            runEngineOnce: async () => {
                throw new Error("postgresql://shared-secret@example.invalid/db");
            },
        });
        try {
            await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            const response = await fetch(`http://127.0.0.1:${port}/internal/engine/run`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-daobrew-internal-token": "internal-test-token",
                },
                body: JSON.stringify(productionEnginePayload()),
            });
            const body = await response.json();
            assert.strictEqual(response.status, 500);
            assert.deepStrictEqual(body, {
                status: "error",
                error: "production engine run failed",
            });
            assert.doesNotMatch(JSON.stringify(body), /shared-secret/);
        }
        finally {
            if (savedToken === undefined)
                delete process.env.DAOBREW_INTERNAL_TOKEN;
            else
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            await new Promise((resolve) => server.close(() => resolve()));
        }
    });
    (0, node_test_1.it)("rejects a cross-principal engine result", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        process.env.DAOBREW_INTERNAL_TOKEN = "internal-test-token";
        const server = (0, internal_server_js_1.createInternalServer)({
            runEngineOnce: async () => fakeEngineResult("written", "other-user"),
        });
        try {
            await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            const response = await fetch(`http://127.0.0.1:${port}/internal/engine/run`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-daobrew-internal-token": "internal-test-token",
                },
                body: JSON.stringify(productionEnginePayload()),
            });
            const body = await response.json();
            assert.strictEqual(response.status, 500);
            assert.deepStrictEqual(body, {
                status: "error",
                error: "production engine returned an invalid result",
            });
            assert.doesNotMatch(JSON.stringify(body), /other-user|server-resolved-user/);
        }
        finally {
            if (savedToken === undefined)
                delete process.env.DAOBREW_INTERNAL_TOKEN;
            else
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            await new Promise((resolve) => server.close(() => resolve()));
        }
    });
    (0, node_test_1.it)("preserves every durable truth status", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        process.env.DAOBREW_INTERNAL_TOKEN = "internal-test-token";
        let nextStatus = "written";
        const server = (0, internal_server_js_1.createInternalServer)({
            runEngineOnce: async (options) => fakeEngineResult(nextStatus, options.userId),
        });
        try {
            await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            for (const status of ["written", "no_signal", "skipped_done"]) {
                nextStatus = status;
                const response = await fetch(`http://127.0.0.1:${port}/internal/engine/run`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-daobrew-internal-token": "internal-test-token",
                    },
                    body: JSON.stringify(productionEnginePayload()),
                });
                const body = await response.json();
                assert.strictEqual(response.status, 200);
                assert.strictEqual(body.status, status);
            }
        }
        finally {
            if (savedToken === undefined)
                delete process.env.DAOBREW_INTERNAL_TOKEN;
            else
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            await new Promise((resolve) => server.close(() => resolve()));
        }
    });
    (0, node_test_1.it)("requires canonical backend generation and lease capabilities", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        process.env.DAOBREW_INTERNAL_TOKEN = "internal-test-token";
        let calls = 0;
        const server = (0, internal_server_js_1.createInternalServer)({
            runEngineOnce: async () => {
                calls += 1;
                return fakeEngineResult("written", "server-resolved-user");
            },
        });
        try {
            await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            const invalidPayloads = [
                { userId: "server-resolved-user" },
                { ...productionEnginePayload(), generationId: "caller-generation" },
                { ...productionEnginePayload(), leaseToken: "wrong-token" },
                { ...productionEnginePayload(), generation_id: ENGINE_GENERATION_ID, generationId: undefined },
            ];
            for (const payload of invalidPayloads) {
                const response = await fetch(`http://127.0.0.1:${port}/internal/engine/run`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-daobrew-internal-token": "internal-test-token",
                    },
                    body: JSON.stringify(payload),
                });
                assert.strictEqual(response.status, 400);
            }
            assert.strictEqual(calls, 0);
        }
        finally {
            if (savedToken === undefined)
                delete process.env.DAOBREW_INTERNAL_TOKEN;
            else
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            await new Promise((resolve) => server.close(() => resolve()));
        }
    });
    (0, node_test_1.it)("rejects a mismatched engine generation receipt", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        process.env.DAOBREW_INTERNAL_TOKEN = "internal-test-token";
        const server = (0, internal_server_js_1.createInternalServer)({
            runEngineOnce: async (options) => fakeEngineResult("written", options.userId, "33333333-3333-4333-8333-333333333333"),
        });
        try {
            await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            const response = await fetch(`http://127.0.0.1:${port}/internal/engine/run`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-daobrew-internal-token": "internal-test-token",
                },
                body: JSON.stringify(productionEnginePayload()),
            });
            assert.strictEqual(response.status, 500);
            assert.deepStrictEqual(await response.json(), {
                status: "error",
                error: "production engine returned an invalid result",
            });
        }
        finally {
            if (savedToken === undefined)
                delete process.env.DAOBREW_INTERNAL_TOKEN;
            else
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            await new Promise((resolve) => server.close(() => resolve()));
        }
    });
});
