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
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const bootstrap_js_1 = require("../src/engine/bootstrap.js");
const schema_js_1 = require("../src/engine/schema.js");
const graph_db_js_1 = require("../src/graph-db.js");
const internal_server_harness_js_1 = require("./internal-server-harness.js");
const BOOTSTRAP_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
function postgresRuntimePresent() {
    try {
        (0, node_child_process_1.execFileSync)("docker", [
            "compose",
            "-p",
            process.env.DAOBREW_POSTGRES_COMPOSE_PROJECT || "daobrewai",
            "-f",
            process.env.DAOBREW_POSTGRES_COMPOSE_FILE || "../docker-compose.postgres.yml",
            "exec",
            "-T",
            process.env.DAOBREW_POSTGRES_SERVICE || "postgres",
            "psql",
            "-At",
            "-U",
            process.env.DAOBREW_POSTGRES_USER || "daobrew",
            "-d",
            process.env.DAOBREW_POSTGRES_DB || "daobrew_local_truth",
            "-c",
            "SELECT 1;",
        ], { cwd: process.cwd(), stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
/** Sink whose upserts succeed with fixed counts and record call order. */
function fakeSink(calls, counts = { events: 1, notes: 1, insights: 2 }) {
    return {
        upsertEvents: async () => { calls.push("sink:events"); return { rowsWritten: counts.events, dedupSkips: 0 }; },
        upsertMeetingNotes: async () => { calls.push("sink:notes"); return { rowsWritten: counts.notes, dedupSkips: 0 }; },
        upsertInsights: async () => { calls.push("sink:insights"); return { rowsWritten: counts.insights, dedupSkips: 0 }; },
    };
}
/** Verification + pipeline_metrics readbacks for the injected query seam. */
function fakeQuery(calls, verified = { insights: 2, notes: 1, events: 1 }) {
    return async (sql) => {
        calls.push("query");
        if (/FROM user_insights/.test(sql) && /count\(\*\)/.test(sql))
            return [{ n: verified.insights }];
        if (/FROM meeting_notes/.test(sql) && /count\(\*\)/.test(sql))
            return [{ n: verified.notes }];
        if (/FROM events/.test(sql) && /count\(\*\)/.test(sql))
            return [{ n: verified.events }];
        return [{ bytes: 1, calls: 0, count: 0 }];
    };
}
/** Stubs for the phases wired in Task 4 — inert here, asserted there. */
function inertLatePhases(calls) {
    return {
        embedSweep: (async () => { calls.push("embed-sweep"); return { rowsEmbedded: 0, geminiCallsUsed: 0, warnings: [], alerts: [], tables: {} }; }),
        readBiometrics: (async () => { calls.push("biometrics"); return { signals: { metrics: [], states: [] }, source: "none" }; }),
        engine: (async () => {
            calls.push("engine");
            return {
                status: "no_signal", user_id: "u1", demo: false, dry_run: false,
                triplet_count: 0, node_count: 1, edge_count: 0, root_armed: false,
                graph_store: "postgres",
                signal_counts: { calendar: 0, granola: 0, memory: 0, biometric_episodes: 0, biometric_source: "none" },
                warnings: [],
            };
        }),
        nightly: (async () => { calls.push("layer2:nightly"); return { threadsUpserted: 0, evidenceInserted: 0, verdictsSettled: 0, threadsArchived: 0, transferRecordsEmitted: 0, profileVectorsWritten: 0, warnings: [], alerts: [] }; }),
        snapshot: (async () => { calls.push("layer2:snapshot"); return { written: false, warnings: [], alerts: [] }; }),
    };
}
(0, node_test_1.describe)("cold-start bootstrap — ingest phase", () => {
    (0, node_test_1.it)("runs memory, granola (rawNotes), calendar (rawEvents) through the sink and verifies per wizard criteria", async () => {
        const calls = [];
        const report = await (0, bootstrap_js_1.runBootstrap)({
            userId: "u1",
            nowTs: () => 1_800_000_000,
            sink: fakeSink(calls),
            query: fakeQuery(calls),
            granolaRawNotes: [{ id: "n1", title: "Sync", created_at: "2026-07-01T17:00:00Z" }],
            calendarRawEvents: [{ id: "e1", title: "Sync", startDate: "2026-07-01T17:00:00Z" }],
            memoryRows: [{
                    id: "m1", source: "claude_project_session", source_ref: "s:1",
                    insight_text: "Reviewable evidence trail.", topics: ["#memory"],
                    importance: 0.8, strength: 1, occurred_at_ts: null, last_accessed_ts: null,
                }],
            ...inertLatePhases(calls),
        });
        // 30-day window from injected now
        assert.strictEqual(report.window.end_ts, 1_800_000_000);
        assert.strictEqual(report.window.start_ts, 1_800_000_000 - bootstrap_js_1.BOOTSTRAP_DEFAULT_DAYS * 86400);
        assert.strictEqual(report.sources.memory.ran, true);
        assert.strictEqual(report.sources.memory.rows_written, 2);
        assert.strictEqual(report.sources.memory.verified_rows, 2);
        assert.strictEqual(report.sources.memory.ok, true);
        assert.strictEqual(report.sources.granola.ran, true);
        assert.strictEqual(report.sources.granola.ok, true);
        assert.strictEqual(report.sources.calendar.ran, true);
        assert.strictEqual(report.sources.calendar.ok, true);
        // ingest ordering: memory -> granola -> calendar
        const sinkOrder = calls.filter((c) => c.startsWith("sink:"));
        assert.deepStrictEqual(sinkOrder, ["sink:insights", "sink:notes", "sink:events"]);
    });
    (0, node_test_1.it)("skips calendar without rawEvents and granola without token/rawNotes, but still verifies pre-existing rows", async () => {
        const savedToken = process.env.GRANOLA_API_TOKEN;
        delete process.env.GRANOLA_API_TOKEN; // config file already /nonexistent in npm test
        try {
            const calls = [];
            const report = await (0, bootstrap_js_1.runBootstrap)({
                userId: "u1",
                nowTs: () => 1_800_000_000,
                sink: fakeSink(calls),
                query: fakeQuery(calls, { insights: 0, notes: 3, events: 0 }),
                memoryRows: [],
                ...inertLatePhases(calls),
            });
            assert.strictEqual(report.sources.calendar.ran, false);
            assert.match(report.sources.calendar.skipped_reason ?? "", /rawEvents/);
            assert.strictEqual(report.sources.granola.ran, false);
            assert.match(report.sources.granola.skipped_reason ?? "", /GRANOLA_API_TOKEN|granola_api_token|rawNotes/);
            // pre-existing warm rows still verify a skipped source as ok
            assert.strictEqual(report.sources.granola.verified_rows, 3);
            assert.strictEqual(report.sources.granola.ok, true);
            assert.strictEqual(report.sources.calendar.ok, false);
            // no calendar/granola sink calls happened
            assert.ok(!calls.includes("sink:events") && !calls.includes("sink:notes"));
        }
        finally {
            if (savedToken !== undefined)
                process.env.GRANOLA_API_TOKEN = savedToken;
        }
    });
    (0, node_test_1.it)("a throwing ingest job records error on that source and does not abort the bootstrap", async () => {
        const calls = [];
        const sink = fakeSink(calls);
        sink.upsertMeetingNotes = async () => { throw new Error("neon down"); };
        const report = await (0, bootstrap_js_1.runBootstrap)({
            userId: "u1",
            nowTs: () => 1_800_000_000,
            sink,
            query: fakeQuery(calls, { insights: 2, notes: 0, events: 1 }),
            granolaRawNotes: [{ id: "n1", title: "Sync" }],
            calendarRawEvents: [{ id: "e1", title: "Sync", startDate: "2026-07-01T17:00:00Z" }],
            memoryRows: [],
            ...inertLatePhases(calls),
        });
        assert.strictEqual(report.sources.granola.ran, true);
        assert.strictEqual(report.sources.granola.ok, false);
        assert.match(report.sources.granola.error ?? "", /neon down/);
        // calendar still ran after the granola failure
        assert.strictEqual(report.sources.calendar.ran, true);
        assert.strictEqual(report.ok, false);
    });
});
(0, node_test_1.describe)("cold-start bootstrap — engine, coverage, layer 2", () => {
    function baseDeps(calls) {
        return {
            userId: "u1",
            nowTs: () => 1_800_000_000,
            sink: fakeSink(calls),
            query: fakeQuery(calls),
            memoryRows: [],
        };
    }
    (0, node_test_1.it)("runs embed sweep, coverage read, engine replay over the window, then nightly + snapshot — in order", async () => {
        const calls = [];
        const engineArgs = [];
        // 2 worn days (>=3 HR samples each) + 1 sparse day
        const hr = (date, n) => Array.from({ length: n }, (_, i) => ({
            metric: "heart_rate", value: 60 + i, timestamp: `${date}T${String(9 + i).padStart(2, "0")}:00:00-07:00`,
            graph_source_ref: `hk:${date}:${i}`,
        }));
        const report = await (0, bootstrap_js_1.runBootstrap)({
            ...baseDeps(calls),
            embedSweep: (async () => { calls.push("embed-sweep"); return { rowsEmbedded: 4, geminiCallsUsed: 1, warnings: [], alerts: [], tables: {} }; }),
            readBiometrics: (async (options) => {
                calls.push("biometrics");
                assert.strictEqual(options.userId, "u1");
                assert.strictEqual(options.startTs, 1_800_000_000 - 30 * 86400);
                assert.strictEqual(options.endTs, 1_800_000_000);
                return {
                    signals: {
                        metrics: [{ metric: "heart_rate", range: "month", samples: [...hr("2027-01-10", 4), ...hr("2027-01-11", 5), ...hr("2027-01-12", 1)] }],
                        states: [],
                    },
                    source: "neon-direct",
                };
            }),
            engine: (async (options) => {
                calls.push("engine");
                engineArgs.push(options);
                return {
                    status: "written", user_id: "u1", demo: false, dry_run: false,
                    triplet_count: 7, node_count: 9, edge_count: 8,
                    armed_node_id: "ghost_u1_root", root_armed: true, graph_store: "postgres",
                    signal_counts: { calendar: 1, granola: 1, memory: 2, biometric_episodes: 5, biometric_source: "neon-direct" },
                    warnings: ["w-engine"],
                };
            }),
            nightly: (async (deps) => {
                calls.push("layer2:nightly");
                assert.strictEqual(deps.userId, "u1");
                return { threadsUpserted: 1, evidenceInserted: 2, verdictsSettled: 0, threadsArchived: 0, transferRecordsEmitted: 0, profileVectorsWritten: 0, warnings: [], alerts: [] };
            }),
            snapshot: (async () => { calls.push("layer2:snapshot"); return { written: true, version: 1, warnings: [], alerts: [] }; }),
        });
        // strict phase order: ingest -> embed sweep -> coverage -> engine -> nightly -> snapshot
        const phases = calls.filter((c) => !c.startsWith("sink:") && c !== "query");
        assert.deepStrictEqual(phases, ["embed-sweep", "biometrics", "engine", "layer2:nightly", "layer2:snapshot"]);
        // engine got the bootstrap window
        assert.strictEqual(engineArgs[0].startTs, 1_800_000_000 - 30 * 86400);
        assert.strictEqual(engineArgs[0].endTs, 1_800_000_000);
        assert.strictEqual(engineArgs[0].userId, "u1");
        assert.strictEqual(engineArgs[0].biometricRange, "month");
        // report fields
        assert.strictEqual(report.embed_sweep.ok, true);
        assert.strictEqual(report.embed_sweep.rows_embedded, 4);
        assert.strictEqual(report.sources.biometrics.worn_days, 2);
        assert.strictEqual(report.sources.biometrics.raw_sample_count, 10);
        assert.strictEqual(report.sources.biometrics.ok, true);
        assert.strictEqual(report.sources.biometrics.enrichment_ready, false); // 2 < 3
        assert.strictEqual(report.engine.ok, true);
        assert.strictEqual(report.engine.status, "written");
        assert.strictEqual(report.engine.armed_node_id, "ghost_u1_root");
        assert.deepStrictEqual(report.engine.warnings, ["w-engine"]);
        assert.strictEqual(report.layer2.nightly.ok, true);
        assert.strictEqual(report.layer2.nightly.threads_upserted, 1);
        assert.strictEqual(report.layer2.snapshot.ok, true);
        assert.strictEqual(report.layer2.snapshot.written, true);
        assert.strictEqual(report.layer2.snapshot.version, 1);
        assert.strictEqual(report.ok, true);
    });
    (0, node_test_1.it)("an engine failure is reported but nightly + snapshot still fire (day-1 snapshot guarantee)", async () => {
        const calls = [];
        const report = await (0, bootstrap_js_1.runBootstrap)({
            ...baseDeps(calls),
            ...inertLatePhases(calls),
            engine: (async () => { throw new Error("reasoner exploded"); }),
        });
        assert.strictEqual(report.engine.ok, false);
        assert.match(report.engine.error ?? "", /reasoner exploded/);
        assert.ok(calls.includes("layer2:nightly") && calls.includes("layer2:snapshot"));
        assert.strictEqual(report.ok, false);
    });
    (0, node_test_1.it)("zero worn days reports biometrics not ok without failing the bootstrap", async () => {
        const calls = [];
        const report = await (0, bootstrap_js_1.runBootstrap)({ ...baseDeps(calls), ...inertLatePhases(calls) });
        assert.strictEqual(report.sources.biometrics.ok, false);
        assert.strictEqual(report.sources.biometrics.worn_days, 0);
        assert.strictEqual(report.sources.biometrics.biometric_source, "none");
        // engine/embed/layer2 all fine (inert stubs) -> overall ok stays true:
        // biometrics is a wizard criterion, not a bootstrap-abort condition.
        assert.strictEqual(report.ok, true);
    });
});
(0, node_test_1.describe)("bootstrap entry points", () => {
    (0, node_test_1.it)("POST /internal/bootstrap is gated by DAOBREW_INTERNAL_TOKEN", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        process.env.DAOBREW_INTERNAL_TOKEN = "secret-1";
        try {
            const response = await (0, internal_server_harness_js_1.postInternal)("/internal/bootstrap", "{}");
            assert.strictEqual(response.status, 401);
        }
        finally {
            if (savedToken === undefined)
                delete process.env.DAOBREW_INTERNAL_TOKEN;
            else
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
        }
    });
    (0, node_test_1.it)("POST /internal/bootstrap returns 400 (not 500) on a non-postgres store", async () => {
        const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
        const savedStore = process.env.DAOBREW_GRAPH_STORE;
        delete process.env.DAOBREW_INTERNAL_TOKEN;
        delete process.env.DAOBREW_GRAPH_STORE; // resolves to sqlite default
        try {
            const response = await (0, internal_server_harness_js_1.postInternal)("/internal/bootstrap", { userId: BOOTSTRAP_TEST_USER });
            assert.strictEqual(response.status, 400);
            const body = response.json;
            assert.strictEqual(body.status, "error");
            assert.match(body.error, /requires DAOBREW_GRAPH_STORE=postgres/);
        }
        finally {
            if (savedToken !== undefined)
                process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
            if (savedStore !== undefined)
                process.env.DAOBREW_GRAPH_STORE = savedStore;
        }
    });
    (0, node_test_1.it)("--run bootstrap exits 1 with a clear error on a non-postgres store", () => {
        const env = { ...process.env };
        delete env.DAOBREW_GRAPH_STORE;
        delete env.DAOBREW_POSTGRES_URL;
        env.DAOBREW_INTERNAL_USER = BOOTSTRAP_TEST_USER;
        try {
            (0, node_child_process_1.execFileSync)(process.execPath, ["dist/src/engine/internal-server.js", "--run", "bootstrap"], {
                cwd: process.cwd(), env, encoding: "utf-8",
            });
            assert.fail("expected non-zero exit");
        }
        catch (err) {
            assert.strictEqual(err.status, 1);
            assert.match(String(err.stderr), /requires DAOBREW_GRAPH_STORE=postgres/);
        }
    });
});
(0, node_test_1.describe)("cold-start bootstrap — postgres end-to-end", () => {
    (0, node_test_1.it)("bootstraps a fresh user: ingest -> verify -> engine -> layer 2, one call", async (t) => {
        if (process.env.DAOBREW_ENABLE_POSTGRES_TESTS !== "1") {
            return t.skip("set DAOBREW_ENABLE_POSTGRES_TESTS=1 to exercise Docker Postgres");
        }
        if (!postgresRuntimePresent())
            return t.skip("Docker Postgres runtime is not available");
        const userId = `bootstrap-e2e-${process.pid}`;
        const nowSec = Math.floor(Date.now() / 1000);
        const root = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-bootstrap-e2e-"));
        const claudeProj = (0, node_path_1.join)(root, "claude-projects", "-Users-alice-Work-alpha");
        (0, node_fs_1.mkdirSync)(claudeProj, { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(claudeProj, "s1.jsonl"), JSON.stringify({ cwd: "/Users/alice/Work/alpha", type: "user", timestamp: new Date((nowSec - 86400) * 1000).toISOString(), message: { content: "Fix the login flow" } }) + "\n");
        const previousStore = process.env.DAOBREW_GRAPH_STORE;
        process.env.DAOBREW_GRAPH_STORE = "postgres";
        try {
            (0, schema_js_1.ensureSchema)();
            const report = await (0, bootstrap_js_1.runBootstrap)({
                userId,
                nowTs: () => nowSec,
                memoryDiscoveryRoots: {
                    claudeProjectsRoot: (0, node_path_1.join)(root, "claude-projects"),
                    codexSessionsRoot: (0, node_path_1.join)(root, "codex-sessions"),
                },
                granolaRawNotes: [{
                        id: "note-e2e-1", title: "Pilot sync", created_at: new Date((nowSec - 3600) * 1000).toISOString(),
                        summary: "Bootstrap smoke", content: "We reviewed the pilot bootstrap flow end to end.",
                    }],
                calendarRawEvents: [{
                        id: "evt-e2e-1", title: "Pilot sync", startDate: new Date((nowSec - 3600) * 1000).toISOString(),
                        endDate: new Date((nowSec - 1800) * 1000).toISOString(),
                    }],
                embedSweep: (async () => ({ rowsEmbedded: 0, geminiCallsUsed: 0, warnings: [], alerts: [], tables: {} })),
            });
            assert.strictEqual(report.window.days, 30);
            assert.ok(report.sources.memory.verified_rows >= 1, "memory row verified in user_insights");
            assert.strictEqual(report.sources.memory.ok, true);
            assert.ok(report.sources.granola.verified_rows >= 1, "granola row verified in meeting_notes");
            assert.strictEqual(report.sources.granola.ok, true);
            assert.ok(report.sources.calendar.verified_rows >= 1, "calendar row verified in events");
            assert.strictEqual(report.sources.calendar.ok, true);
            // No biometrics seeded: no_signal is the expected engine outcome, and
            // the layer-2 jobs still completed (day-1 snapshot attempt).
            assert.ok(report.engine.ok, `engine ran: ${report.engine.error}`);
            assert.ok(["no_signal", "written"].includes(report.engine.status ?? ""), String(report.engine.status));
            assert.strictEqual(report.layer2.nightly.ok, true);
            assert.strictEqual(report.layer2.snapshot.ok, true);
            assert.strictEqual(report.ok, true);
        }
        finally {
            try {
                await (0, graph_db_js_1.execSql)(`DELETE FROM thread_verifications WHERE user_id = ${(0, graph_db_js_1.q)(userId)};
           DELETE FROM causal_thread_evidence WHERE user_id = ${(0, graph_db_js_1.q)(userId)};
           DELETE FROM causal_memory_threads WHERE user_id = ${(0, graph_db_js_1.q)(userId)};
           DELETE FROM user_model_snapshots WHERE user_id = ${(0, graph_db_js_1.q)(userId)};
           DELETE FROM graph_edges WHERE user_id = ${(0, graph_db_js_1.q)(userId)};
           DELETE FROM graph_nodes WHERE user_id = ${(0, graph_db_js_1.q)(userId)};
           DELETE FROM events WHERE user_id = ${(0, graph_db_js_1.q)(userId)};
           DELETE FROM meeting_notes WHERE user_id = ${(0, graph_db_js_1.q)(userId)};
           DELETE FROM user_insights WHERE user_id = ${(0, graph_db_js_1.q)(userId)};`);
            }
            catch { /* best-effort cleanup */ }
            if (previousStore === undefined)
                delete process.env.DAOBREW_GRAPH_STORE;
            else
                process.env.DAOBREW_GRAPH_STORE = previousStore;
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
});
(0, node_test_1.describe)("bootstrap RLS scoping (F1 One-Time-Filter regression)", () => {
    (0, node_test_1.it)("verification counts filter user_id by the scope row, never by a literal", async () => {
        // The verification reads run through scopedQuery(userId) by default; a
        // `user_id = '<literal>'` in the body lets the planner fold the RLS qual
        // into a One-Time Filter evaluated at executor startup — before the
        // lateral scope row has run set_config — so a fresh pooled backend
        // silently returns zero rows (live bug F1) and every source would report
        // verified_rows = 0.
        const calls = [];
        const reads = [];
        const inner = fakeQuery(calls);
        await (0, bootstrap_js_1.runBootstrap)({
            userId: "u1",
            nowTs: () => 1_800_000_000,
            sink: fakeSink(calls),
            query: async (sql) => { reads.push(sql); return inner(sql); },
            memoryRows: [{
                    id: "m1", source: "claude_project_session", source_ref: "s:1",
                    insight_text: "Reviewable evidence trail.", topics: ["#memory"],
                    importance: 0.8, strength: 1, occurred_at_ts: null, last_accessed_ts: null,
                }],
            ...inertLatePhases(calls),
        });
        const verifyReads = reads.filter((sql) => /count\(\*\) AS n FROM/.test(sql));
        assert.strictEqual(verifyReads.length, 3, `expected 3 verification reads, got: ${JSON.stringify(reads)}`);
        for (const sql of verifyReads) {
            assert.ok(sql.includes("user_id = __daobrew_scope.uid"), `verification read must filter user_id via the scope row, got: ${sql}`);
            assert.ok(!sql.includes("user_id = 'u1'"), `verification read must NOT compare user_id to a literal (One-Time-Filter fail-closed trap), got: ${sql}`);
        }
    });
});
