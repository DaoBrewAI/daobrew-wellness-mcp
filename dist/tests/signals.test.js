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
// Mask the machine's real ~/.daobrew/config.json BEFORE anything resolves the
// graph store — an operator Postgres environment would flip sqlite assumptions to
// postgres on a configured machine. Explicit per-test env (wiring tests set
// DAOBREW_GRAPH_STORE themselves) is unaffected.
process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-test-config.json";
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const biometrics_js_1 = require("../src/engine/signals/biometrics.js");
const biometricsDb_js_1 = require("../src/engine/signals/biometricsDb.js");
const calendar_js_1 = require("../src/engine/signals/calendar.js");
const granola_js_1 = require("../src/engine/signals/granola.js");
const memory_js_1 = require("../src/engine/signals/memory.js");
const schema_js_1 = require("../src/engine/schema.js");
const run_js_1 = require("../src/engine/run.js");
const graphDb = __importStar(require("../src/graph-db.js"));
const graph_db_js_1 = require("../src/graph-db.js");
function sqliteCliPresent() {
    try {
        (0, node_child_process_1.execFileSync)("sqlite3", ["-version"], { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
function sqlite(dbPath, sql) {
    return (0, node_child_process_1.execFileSync)("sqlite3", [dbPath, sql], { encoding: "utf-8" });
}
async function withTempGraphDb(run) {
    const tmpDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-signals-"));
    const dbPath = (0, node_path_1.join)(tmpDir, "sentinel-graph.db");
    const previous = process.env.DAOBREW_GRAPH_DB;
    process.env.DAOBREW_GRAPH_DB = dbPath;
    try {
        (0, schema_js_1.ensureSchema)(dbPath);
        await run(dbPath);
    }
    finally {
        if (previous === undefined)
            delete process.env.DAOBREW_GRAPH_DB;
        else
            process.env.DAOBREW_GRAPH_DB = previous;
        (0, node_fs_1.rmSync)(tmpDir, { recursive: true, force: true });
    }
}
(0, node_test_1.describe)("signal readers", () => {
    (0, node_test_1.it)("readBiometricSignals reads backend history without fabricating samples", async () => {
        const calls = [];
        const client = {
            async getHealthkitHistory(metric, range) {
                calls.push(`health:${metric}:${range}`);
                return {
                    metric,
                    range,
                    samples: metric === "heart_rate"
                        ? [{ value: 72, timestamp: "2026-06-15T00:00:00+00:00" }]
                        : [],
                    aggregated: { avg: metric === "heart_rate" ? 72 : null, min: null, max: null },
                };
            },
            async getStateHistory(limit, start_ts, end_ts) {
                calls.push(`state:${limit}:${start_ts}:${end_ts}`);
                return {
                    states: [{
                            bucket_ts: 100,
                            yin_score: 40,
                            yang_score: 75,
                            category: "pushing_it",
                            source_quality: "data_verified",
                            updated_at_ts: 101,
                        }],
                    total_count: 1,
                    limit: limit ?? 10,
                };
            },
        };
        const signals = await (0, biometrics_js_1.readBiometricSignals)(client, {
            metrics: ["heart_rate", "step_count"],
            range: "day",
            stateLimit: 5,
            startTs: 10,
            endTs: 20,
        });
        // The display-range fetch is per-metric on the caller's range; a SEPARATE
        // per-metric month-range fetch drives the 30-day baseline (D-16).
        assert.deepStrictEqual(calls.sort(), [
            "health:heart_rate:day",
            "health:heart_rate:month",
            "health:step_count:day",
            "health:step_count:month",
            "state:5:10:20",
        ].sort());
        assert.strictEqual(signals.metrics[0].samples[0].graph_source_ref, "healthkit:heart_rate:2026-06-15T00:00:00+00:00");
        assert.deepStrictEqual(signals.metrics[1].samples, []);
        assert.strictEqual(signals.states[0].graph_source_ref, "state:100");
    });
    (0, node_test_1.it)("readBiometricSignals chunks historical state reads and dedupes buckets", async () => {
        const stateCalls = [];
        const client = {
            async getHealthkitHistory(metric, range) {
                return { metric, range, samples: [], aggregated: { avg: null, min: null, max: null } };
            },
            async getStateHistory(limit, start_ts, end_ts) {
                stateCalls.push([limit, start_ts, end_ts]);
                return {
                    states: [
                        {
                            bucket_ts: start_ts ?? 0,
                            yin_score: 40,
                            yang_score: 60,
                            category: "in_flow",
                            source_quality: "data_verified",
                            updated_at_ts: start_ts === 10 ? 10 : 20,
                        },
                        {
                            bucket_ts: 12,
                            yin_score: 41,
                            yang_score: 61,
                            category: "in_flow",
                            source_quality: "data_verified",
                            updated_at_ts: start_ts === 10 ? 10 : 30,
                        },
                    ],
                    total_count: 2,
                    limit: limit ?? 10,
                };
            },
        };
        const signals = await (0, biometrics_js_1.readBiometricSignals)(client, {
            metrics: ["heart_rate"],
            stateLimit: 100,
            startTs: 10,
            endTs: 35,
            stateChunkDays: 0.00012,
        });
        assert.deepStrictEqual(stateCalls, [
            [100, 10, 19],
            [100, 20, 29],
            [100, 30, 35],
        ]);
        assert.deepStrictEqual(signals.states.map((state) => state.graph_source_ref), [
            "state:10",
            "state:12",
            "state:20",
            "state:30",
        ]);
        assert.strictEqual(signals.states.find((state) => state.bucket_ts === 12)?.updated_at_ts, 30);
    });
    (0, node_test_1.it)("reads calendar, granola, and memory source tables", async (t) => {
        if (!sqliteCliPresent())
            return t.skip("sqlite3 CLI not available");
        await withTempGraphDb(async (dbPath) => {
            sqlite(dbPath, `
        INSERT INTO events (
          id, user_id, source, source_ref, title, start_ts, end_ts,
          all_day, attendee_count, attendees_json, calendar_name, location,
          metadata_json, created_at_ts
        ) VALUES (
          'event-1', '14802294-BEED-480E-ABF6-7E3703FA25CD', 'eventkit', 'evt-1', 'Investor sync', 100, 160,
          0, 2, '["Neo","Linhan"]', 'DaoBrew', 'Zoom',
          '{"source":"fixture"}', 90
        );
        INSERT INTO events (
          id, user_id, source, source_ref, title, start_ts, created_at_ts
        ) VALUES ('event-other', '8D6C05BD-9220-46F7-822C-23F0F0D2DA41', 'eventkit', 'evt-other', 'Other', 110, 90);

        INSERT INTO meeting_notes (
          id, user_id, source, source_ref, event_id, kind, title,
          occurred_at_ts, duration_sec, participants_json, summary, body,
          transcript_spans_json,
          topics_json, created_at_ts
        ) VALUES (
          'meeting-1', '14802294-BEED-480E-ABF6-7E3703FA25CD', 'granola', 'granola-1', 'event-1', 'meeting',
          'Investor sync', 100, 1800, '["Neo"]', 'Demo risks', 'Full notes',
          '[{"idx":0,"speaker":"Neo","ts_offset_sec":12,"text":"Full notes"}]',
          '["#demo"]', 91
        );

        INSERT INTO user_insights (
          id, user_id, source, source_ref, insight_text, topics_json,
          importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts
        ) VALUES (
          'insight-1', '14802294-BEED-480E-ABF6-7E3703FA25CD', 'claude_sessions', 'session.md:42',
          'Show the real handoff path.', '["#detonator"]',
          0.9, 0.8, 95, 120, 92
        );
        INSERT INTO user_insights (
          id, user_id, source, source_ref, insight_text, topics_json,
          importance, strength, occurred_at_ts, created_at_ts
        ) VALUES (
          'insight-weak', '14802294-BEED-480E-ABF6-7E3703FA25CD', 'claude_sessions', 'session.md:99',
          'Too weak.', '[]', 0.1, 0.2, 95, 92
        );

        -- Extra rows for the time-bound test: one dated OUT of window, one
        -- undated (occurred_at_ts NULL) whose created_at_ts is IN window.
        INSERT INTO user_insights (
          id, user_id, source, source_ref, insight_text, topics_json,
          importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts
        ) VALUES (
          'insight-old', '14802294-BEED-480E-ABF6-7E3703FA25CD', 'claude_sessions', 'session.md:7',
          'Ancient insight.', '[]', 0.9, 0.9, 10, NULL, 10
        );
        INSERT INTO user_insights (
          id, user_id, source, source_ref, insight_text, topics_json,
          importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts
        ) VALUES (
          'insight-undated', '14802294-BEED-480E-ABF6-7E3703FA25CD', 'claude_sessions', 'session.md:8',
          'Undated but freshly ingested.', '[]', 0.9, 0.9, NULL, NULL, 100
        );
        `);
            const events = await (0, calendar_js_1.readCalendarSignals)({ userId: "14802294-BEED-480E-ABF6-7E3703FA25CD", startTs: 50, endTs: 150 });
            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].graph_source_ref, "calendar:evt-1");
            assert.deepStrictEqual(events[0].attendees, ["Neo", "Linhan"]);
            assert.strictEqual(events[0].metadata.source, "fixture");
            const meetings = await (0, granola_js_1.readGranolaSignals)({ userId: "14802294-BEED-480E-ABF6-7E3703FA25CD", startTs: 50, endTs: 150 });
            assert.strictEqual(meetings.length, 1);
            assert.strictEqual(meetings[0].graph_source_ref, "granola:granola-1");
            assert.deepStrictEqual(meetings[0].topics, ["#demo"]);
            assert.deepStrictEqual(meetings[0].transcript_spans, [{
                    idx: 0,
                    speaker: "Neo",
                    ts_offset_sec: 12,
                    text: "Full notes",
                }]);
            const insights = await (0, memory_js_1.readMemorySignals)({ userId: "14802294-BEED-480E-ABF6-7E3703FA25CD", minStrength: 0.5 });
            assert.strictEqual(insights.length, 3); // insight-1, insight-old, insight-undated
            const insight1 = insights.find((row) => row.id === "insight-1");
            assert.ok(insight1, "insight-1 present");
            assert.strictEqual(insight1.graph_source_ref, "memory:session.md:42");
            assert.deepStrictEqual(insight1.topics, ["#detonator"]);
            // startTs must bound dated rows AND keep undated rows whose
            // created_at_ts is in window (NULL-safe via
            // COALESCE(occurred_at_ts, created_at_ts)).
            const bounded = await (0, memory_js_1.readMemorySignals)({ userId: "14802294-BEED-480E-ABF6-7E3703FA25CD", startTs: 50, endTs: 150, minStrength: 0.5 });
            const boundedIds = bounded.map((row) => row.id).sort();
            assert.deepStrictEqual(boundedIds, ["insight-1", "insight-undated"]);
            // 'insight-old' (occurred 10 < 50) excluded; 'insight-1' (occurred 95) kept.
        });
    });
    (0, node_test_1.it)("suppresses zero-strength lifecycle rows even when minStrength defaults to zero", async (t) => {
        if (!sqliteCliPresent())
            return t.skip("sqlite3 CLI not available");
        await withTempGraphDb(async (dbPath) => {
            sqlite(dbPath, `
          DELETE FROM user_insights;
          INSERT INTO user_insights (
            id, user_id, source, source_ref, insight_text, topics_json,
            importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts
          ) VALUES (
            'insight-live', '14802294-BEED-480E-ABF6-7E3703FA25CD', 'claude_sessions', 'session.md:1',
            'Keep the live row.', '[]', 0.8, 0.6, 95, NULL, 92
          );
          INSERT INTO user_insights (
            id, user_id, source, source_ref, insight_text, topics_json,
            importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts
          ) VALUES (
            'insight-suppressed', '14802294-BEED-480E-ABF6-7E3703FA25CD', 'claude_sessions', 'session.md:2',
            'Suppressed duplicate.', '[]', 0.9, 0, 95, NULL, 92
          );
        `);
            const insights = await (0, memory_js_1.readMemorySignals)({ userId: "14802294-BEED-480E-ABF6-7E3703FA25CD" });
            assert.deepStrictEqual(insights.map((row) => row.id), ["insight-live"]);
        });
    });
});
// ---------------------------------------------------------------------------
// Direct Neon/Postgres biometrics source (biometricsDb.ts): the deployed
// backend writes intraday_state/health_samples into the SAME warm-tier DB the
// engine already reaches via graph-db, under the canonical UUID anchor. These
// tests inject a fake query executor — no real
// Postgres is touched.
// ---------------------------------------------------------------------------
(0, node_test_1.describe)("direct db biometrics source", () => {
    const USER_UUID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
    const OTHER_UUID = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
    const PROBE_OK = [{ table_name: "intraday_state" }, { table_name: "health_samples" }];
    const PROBE_OK_WITH_PAIRING = [...PROBE_OK, { table_name: "pairing_codes" }];
    function fakeApiClient(calls) {
        return {
            async getHealthkitHistory(metric, range) {
                calls.push(`health:${metric}:${range}`);
                return { metric, range, samples: [], aggregated: { avg: null, min: null, max: null } };
            },
            async getStateHistory(limit, start_ts, end_ts) {
                calls.push(`state:${limit}:${start_ts}:${end_ts}`);
                return {
                    states: [{
                            bucket_ts: 900,
                            yin_score: 50,
                            yang_score: 50,
                            category: "in_flow",
                            source_quality: "api_fallback",
                            updated_at_ts: 901,
                        }],
                    total_count: 1,
                    limit: limit ?? 10,
                };
            },
        };
    }
    (0, node_test_1.it)("parses intraday_state and health_samples rows into the engine signal shapes", async () => {
        const sqls = [];
        const query = async (sql) => {
            sqls.push(sql);
            if (sql.includes("information_schema.tables"))
                return PROBE_OK;
            if (sql.includes("FROM intraday_state")) {
                // Includes a stale duplicate for bucket 100 that dedupe must drop.
                return [
                    { bucket_ts: 200, yin_score: 42, yang_score: 61, category: "in_flow", source_quality: "data_verified", updated_at_ts: 250 },
                    { bucket_ts: 100, yin_score: 40, yang_score: 75, category: "pushing_it", source_quality: "data_verified", updated_at_ts: 150 },
                    { bucket_ts: 100, yin_score: 1, yang_score: 1, category: "stale", source_quality: "stale", updated_at_ts: 120 },
                ];
            }
            if (sql.includes("FROM health_samples")) {
                return [
                    { metric_type: "heart_rate", value: 72, start_time_ts: 1_750_000_000 },
                    { metric_type: "heart_rate", value: 80, start_time_ts: 1_750_000_600 },
                ];
            }
            throw new Error(`unexpected sql: ${sql}`);
        };
        const signals = await (0, biometricsDb_js_1.readBiometricSignalsFromDb)({
            userId: USER_UUID,
            query,
            metrics: ["heart_rate", "step_count"],
            range: "day",
            startTs: 50,
            endTs: 300,
        });
        // Identity: only the UUID anchor is queried; legacy buckets fold in during
        // merge-on-claim/remerge rather than staying live in normal readers.
        const stateSql = sqls.find((sql) => sql.includes("FROM intraday_state"));
        const sampleSql = sqls.find((sql) => sql.includes("FROM health_samples"));
        assert.ok(stateSql?.includes(`'${USER_UUID}'`), `state sql must query UUID anchor, got: ${stateSql}`);
        assert.ok(!stateSql?.includes("apikey:"), `state sql must not query apikey shadows, got: ${stateSql}`);
        assert.ok(sampleSql?.includes(`'${USER_UUID}'`), `sample sql must query UUID anchor, got: ${sampleSql}`);
        assert.ok(!sampleSql?.includes("apikey:"), `sample sql must not query apikey shadows, got: ${sampleSql}`);
        // The requested biometric window bounds the sample read.
        assert.ok(sampleSql?.includes("start_time_ts >= 50") && sampleSql.includes("start_time_ts <= 300"), `sample sql must honor the window, got: ${sampleSql}`);
        // States: deduped per bucket (freshest updated_at_ts wins), ascending.
        assert.deepStrictEqual(signals.states, [
            { bucket_ts: 100, yin_score: 40, yang_score: 75, category: "pushing_it", source_quality: "data_verified", updated_at_ts: 150, graph_source_ref: "state:100" },
            { bucket_ts: 200, yin_score: 42, yang_score: 61, category: "in_flow", source_quality: "data_verified", updated_at_ts: 250, graph_source_ref: "state:200" },
        ]);
        // Samples: exact HTTP-path shape — per-metric series in the requested
        // order, ISO timestamps, healthkit graph_source_refs, aggregates.
        assert.strictEqual(signals.metrics.length, 2);
        const hr = signals.metrics[0];
        const isoA = new Date(1_750_000_000 * 1000).toISOString();
        const isoB = new Date(1_750_000_600 * 1000).toISOString();
        assert.strictEqual(hr.metric, "heart_rate");
        assert.strictEqual(hr.range, "day");
        assert.deepStrictEqual(hr.samples, [
            { metric: "heart_rate", value: 72, timestamp: isoA, graph_source_ref: `healthkit:heart_rate:${isoA}` },
            { metric: "heart_rate", value: 80, timestamp: isoB, graph_source_ref: `healthkit:heart_rate:${isoB}` },
        ]);
        assert.deepStrictEqual(hr.aggregated, { avg: 76, min: 72, max: 80 });
        assert.strictEqual(signals.metrics[1].metric, "step_count");
        assert.deepStrictEqual(signals.metrics[1].samples, []);
        assert.deepStrictEqual(signals.metrics[1].aggregated, { avg: null, min: null, max: null });
    });
    (0, node_test_1.it)("does not query pairing_codes or paired device ids on the normal reader path", async () => {
        const sqls = [];
        const query = async (sql) => {
            sqls.push(sql);
            if (sql.includes("information_schema.tables"))
                return PROBE_OK_WITH_PAIRING;
            if (sql.includes("FROM pairing_codes")) {
                throw new Error("normal reader must not query pairing_codes");
            }
            return [];
        };
        await (0, biometricsDb_js_1.readBiometricSignalsFromDb)({ userId: USER_UUID, query, metrics: ["heart_rate"] });
        assert.ok(!sqls.some((sql) => sql.includes("FROM pairing_codes")), "normal reader must not query pairing_codes");
        const stateSql = sqls.find((sql) => sql.includes("FROM intraday_state"));
        const sampleSql = sqls.find((sql) => sql.includes("FROM health_samples"));
        for (const [label, sql] of [["state", stateSql], ["sample", sampleSql]]) {
            assert.ok(sql?.includes(`'${USER_UUID}'`) && !sql.includes("4A008E08-AAAA-BBBB-CCCC-000000000001") && !sql.includes("apikey:"), `${label} sql must use only the UUID anchor, got: ${sql}`);
        }
    });
    (0, node_test_1.it)("stays on the UUID anchor when pairing_codes is absent", async () => {
        const sqls = [];
        const query = async (sql) => {
            sqls.push(sql);
            if (sql.includes("information_schema.tables"))
                return PROBE_OK;
            if (sql.includes("FROM pairing_codes"))
                throw new Error("relation does not exist");
            return [];
        };
        const signals = await (0, biometricsDb_js_1.readBiometricSignalsFromDb)({ userId: USER_UUID, query, metrics: ["heart_rate"] });
        assert.ok(!sqls.some((sql) => sql.includes("FROM pairing_codes")), "absent pairing_codes must not be queried");
        assert.deepStrictEqual(signals.states, []);
    });
    (0, node_test_1.it)("resolves the identity list to exactly the UUID anchor", async () => {
        const sqls = [];
        const query = async (sql) => {
            sqls.push(sql);
            if (sql.includes("information_schema.tables"))
                return PROBE_OK;
            return [];
        };
        await (0, biometricsDb_js_1.readBiometricSignalsFromDb)({ userId: USER_UUID, query, metrics: ["heart_rate"] });
        for (const [label, marker] of [["state", "FROM intraday_state"], ["sample", "FROM health_samples"]]) {
            const sql = sqls.find((s) => s.includes(marker));
            assert.ok(sql, `${label} read must run`);
            const match = sql.match(/user_id IN \(([^)]*)\)/);
            assert.ok(match, `${label} sql must filter user_id IN (...), got: ${sql}`);
            assert.strictEqual(match[1], `'${USER_UUID}'`, `${label} identity list must be exactly the UUID anchor, got: ${match[1]}`);
        }
    });
    (0, node_test_1.it)("reads a UUID anchor identity end-to-end", async () => {
        const deviceUuid = "4A008E08-1111-2222-3333-444455556666";
        const sqls = [];
        const query = async (sql) => {
            sqls.push(sql);
            if (sql.includes("information_schema.tables"))
                return PROBE_OK;
            if (sql.includes("FROM intraday_state")) {
                return [
                    { bucket_ts: 300, yin_score: 30, yang_score: 70, category: "pushing_it", source_quality: "data_verified", updated_at_ts: 350 },
                ];
            }
            if (sql.includes("FROM health_samples")) {
                return [{ metric_type: "heart_rate", value: 88, start_time_ts: 1_750_000_000 }];
            }
            throw new Error(`unexpected sql: ${sql}`);
        };
        const signals = await (0, biometricsDb_js_1.readBiometricSignalsFromDb)({
            userId: deviceUuid,
            query,
            metrics: ["heart_rate"],
            range: "day",
            startTs: 100,
            endTs: 400,
        });
        // The UUID passes through without apikey shadows.
        const stateSql = sqls.find((s) => s.includes("FROM intraday_state"));
        const sampleSql = sqls.find((s) => s.includes("FROM health_samples"));
        assert.ok(stateSql.includes(`'${deviceUuid}'`), `state must query the UUID anchor, got: ${stateSql}`);
        assert.ok(!stateSql.includes("apikey:"), `state must not query apikey shadows, got: ${stateSql}`);
        assert.ok(sampleSql.includes(`'${deviceUuid}'`) && !sampleSql.includes("apikey:"), `sample sql: ${sampleSql}`);
        // Rows keyed under the bare UUID flow into the signal shapes.
        assert.strictEqual(signals.states.length, 1);
        assert.strictEqual(signals.states[0].bucket_ts, 300);
        assert.strictEqual(signals.states[0].category, "pushing_it");
        assert.strictEqual(signals.metrics[0].samples.length, 1);
        assert.deepStrictEqual(signals.metrics[0].aggregated, { avg: 88, min: 88, max: 88 });
    });
    (0, node_test_1.describe)("metric baselines", () => {
        (0, node_test_1.it)("fetches 30-day per-metric baselines over the SAME UUID anchor", async () => {
            const captured = [];
            const query = async (sql) => {
                captured.push(sql);
                if (sql.includes("information_schema.tables"))
                    return PROBE_OK;
                if (/avg\(/i.test(sql)) {
                    // psql json marshals numerics as strings — the read must parse them.
                    return [
                        { metric_type: "heart_rate", baseline_avg: "79.2", day_count: "30" },
                        { metric_type: "hrv", baseline_avg: "36.0", day_count: "12" },
                    ];
                }
                return []; // states/samples reads return empty for this test
            };
            const read = await (0, biometricsDb_js_1.readBiometricSignalsFromDb)({
                userId: OTHER_UUID,
                query,
                metrics: ["heart_rate", "hrv"],
                // health_samples.start_time_ts is UNIX SECONDS in this table.
                startTs: 1_783_400,
                endTs: 1_783_500,
            });
            assert.ok(read.baselines, "read result carries baselines");
            const hr = read.baselines.find((b) => b.metric_type === "heart_rate");
            assert.strictEqual(hr.baseline_avg, 79.2);
            assert.strictEqual(hr.day_count, 30);
            const baselineSql = captured.find((s) => /avg\(/i.test(s));
            assert.match(baselineSql, /user_id IN/i); // identity scoping respected
            assert.match(baselineSql, /health_samples/);
            // Same UUID anchor as the samples/state reads.
            assert.ok(baselineSql.includes(`'${OTHER_UUID}'`) && !baselineSql.includes("apikey:"), `baseline sql must use the UUID anchor only, got: ${baselineSql}`);
        });
        (0, node_test_1.it)("windows the baseline to 30 days ending at the read's endTs (seconds)", async () => {
            const captured = [];
            const query = async (sql) => {
                captured.push(sql);
                if (sql.includes("information_schema.tables"))
                    return PROBE_OK;
                return [];
            };
            const endTs = 1_783_500_000; // seconds
            await (0, biometricsDb_js_1.readBiometricSignalsFromDb)({ userId: USER_UUID, query, metrics: ["heart_rate"], endTs });
            const baselineSql = captured.find((s) => /avg\(/i.test(s));
            assert.ok(baselineSql, "baseline read must run");
            const windowStart = endTs - 30 * 86400;
            assert.ok(baselineSql.includes(`start_time_ts >= ${windowStart}`) &&
                baselineSql.includes(`start_time_ts < ${endTs}`), `baseline window must be [endTs-30d, endTs) in seconds, got: ${baselineSql}`);
        });
        (0, node_test_1.it)("baselines is empty (not undefined) when the aggregate returns no rows", async () => {
            const query = async (sql) => {
                if (sql.includes("information_schema.tables"))
                    return PROBE_OK;
                return [];
            };
            const read = await (0, biometricsDb_js_1.readBiometricSignalsFromDb)({ userId: USER_UUID, query, metrics: ["heart_rate"] });
            assert.deepStrictEqual(read.baselines, []);
        });
    });
    (0, node_test_1.it)("prefers the direct read on postgres and never touches the API client", async () => {
        const apiCalls = [];
        const warnings = [];
        const query = async (sql) => {
            if (sql.includes("information_schema.tables"))
                return PROBE_OK;
            return [];
        };
        const { signals, source } = await (0, biometricsDb_js_1.readBiometricSignalsPreferDirect)({
            userId: USER_UUID,
            storeKind: "postgres",
            query,
            client: fakeApiClient(apiCalls),
            metrics: ["heart_rate"],
        }, warnings);
        assert.strictEqual(source, "neon-direct");
        assert.deepStrictEqual(apiCalls, [], "API client must not be invoked when the direct read serves");
        assert.deepStrictEqual(warnings, []);
        assert.deepStrictEqual(signals.states, []);
    });
    (0, node_test_1.it)("falls back to the API path with a warning when the direct read throws", async () => {
        const apiCalls = [];
        const warnings = [];
        const { signals, source } = await (0, biometricsDb_js_1.readBiometricSignalsPreferDirect)({
            userId: USER_UUID,
            storeKind: "postgres",
            query: async () => { throw new Error("connection refused"); },
            client: fakeApiClient(apiCalls),
            metrics: ["heart_rate"],
        }, warnings);
        assert.strictEqual(source, "api");
        assert.ok(apiCalls.length > 0, "HTTP client must serve the fallback");
        assert.ok(warnings.some((w) => w.includes("falling back") && w.includes("connection refused")), `fallback must record a warning, got: ${JSON.stringify(warnings)}`);
        assert.strictEqual(signals.states[0]?.source_quality, "api_fallback");
    });
    (0, node_test_1.it)("falls back when the backend tables are absent (empty schema probe)", async () => {
        const apiCalls = [];
        const warnings = [];
        const { source } = await (0, biometricsDb_js_1.readBiometricSignalsPreferDirect)({
            userId: USER_UUID,
            storeKind: "postgres",
            // Local compose PG without the backend tables: probe comes back empty.
            query: async () => [],
            client: fakeApiClient(apiCalls),
            metrics: ["heart_rate"],
        }, warnings);
        assert.strictEqual(source, "api");
        assert.ok(apiCalls.length > 0);
        assert.ok(warnings.some((w) => w.includes("intraday_state") && w.includes("health_samples")), `missing-table warning must name the absent tables, got: ${JSON.stringify(warnings)}`);
    });
    (0, node_test_1.it)("skips the direct path entirely on sqlite stores", async () => {
        const apiCalls = [];
        const warnings = [];
        const { source } = await (0, biometricsDb_js_1.readBiometricSignalsPreferDirect)({
            userId: USER_UUID,
            storeKind: "sqlite",
            query: async () => { throw new Error("must not be called"); },
            client: fakeApiClient(apiCalls),
            metrics: ["heart_rate"],
        }, warnings);
        assert.strictEqual(source, "api");
        assert.deepStrictEqual(warnings, []);
        assert.ok(apiCalls.length > 0);
    });
    (0, node_test_1.it)("reports source none with warnings when direct fails and no client exists", async () => {
        const warnings = [];
        const { signals, source } = await (0, biometricsDb_js_1.readBiometricSignalsPreferDirect)({
            userId: USER_UUID,
            storeKind: "postgres",
            query: async () => { throw new Error("boom"); },
            metrics: ["heart_rate"],
        }, warnings);
        assert.strictEqual(source, "none");
        assert.deepStrictEqual(signals, { metrics: [], states: [] });
        assert.ok(warnings.some((w) => w.includes("falling back")));
        assert.ok(warnings.some((w) => w.includes("no backend API key")));
    });
});
// ---------------------------------------------------------------------------
// RLS deferred wiring (1/3): injected query seams + run.ts entry-point wiring.
// Same seam as tests/user-scope.test.ts — the compiled CJS modules resolve
// `graph_db_js_1.execSql`/`queryJson`/`execSqlSync` at call time, so swapping
// graph-db's exports for capturing fakes intercepts the genuine delegate
// chain and no real Postgres (local or Neon) is ever touched. execSqlSync is
// faked too so ensureSchema's postgres bootstrap becomes a no-op.
// ---------------------------------------------------------------------------
/** Keep in sync with postgres-rls.ts RLS_GUC and user-scope.ts. */
const GUC = "app.daobrew_user_id";
const INJECT_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const DEFAULT_READER_USER = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const WIRING_USER = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";
function occurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}
async function withPostgresFakeTransport(fn) {
    const mod = graphDb;
    const realExec = mod.execSql;
    const realQuery = mod.queryJson;
    const realExecSync = mod.execSqlSync;
    const savedEnv = {
        DAOBREW_GRAPH_STORE: process.env.DAOBREW_GRAPH_STORE,
        DAOBREW_API_KEY: process.env.DAOBREW_API_KEY,
        DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
    };
    const captured = { execs: [], queries: [] };
    mod.execSql = async (sql) => {
        captured.execs.push(sql);
    };
    mod.queryJson = async (sql) => {
        captured.queries.push(sql);
        return [];
    };
    mod.execSqlSync = (sql) => {
        if (sql.includes("daobrew_runtime_schema")) {
            return JSON.stringify({
                ready: true,
                vector_extension: true,
                generation_current_marker: true,
                missing_tables: [],
                missing_indexes: [],
                missing_functions: [],
                missing_triggers: [],
                trigger_count: 4,
            });
        }
        return "";
    };
    process.env.DAOBREW_GRAPH_STORE = "postgres";
    // No backend key: biometrics stay empty and the run degrades to a loud
    // warning instead of reaching out to any API.
    delete process.env.DAOBREW_API_KEY;
    process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-wiring-test-config.json";
    (0, graph_db_js_1.__resetGraphDbConfigCacheForTests)();
    (0, schema_js_1.__resetPostgresSchemaEnsureForTests)();
    try {
        await fn(captured);
    }
    finally {
        mod.execSql = realExec;
        mod.queryJson = realQuery;
        mod.execSqlSync = realExecSync;
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        }
        (0, graph_db_js_1.__resetGraphDbConfigCacheForTests)();
        (0, schema_js_1.__resetPostgresSchemaEnsureForTests)();
    }
}
(0, node_test_1.describe)("signal readers injected query", () => {
    (0, node_test_1.it)("all three readers route their reads through the injected query", async () => {
        await withPostgresFakeTransport(async (captured) => {
            const reads = [];
            const query = async (sql) => {
                reads.push(sql);
                return [];
            };
            const events = await (0, calendar_js_1.readCalendarSignals)({ userId: INJECT_USER, startTs: 1, endTs: 2, query });
            const meetings = await (0, granola_js_1.readGranolaSignals)({ userId: INJECT_USER, startTs: 1, endTs: 2, query });
            const insights = await (0, memory_js_1.readMemorySignals)({ userId: INJECT_USER, minStrength: 0.5, query });
            assert.deepStrictEqual(events, []);
            assert.deepStrictEqual(meetings, []);
            assert.deepStrictEqual(insights, []);
            assert.strictEqual(reads.length, 3, `expected 3 injected reads, got: ${JSON.stringify(reads)}`);
            assert.ok(reads.some((sql) => sql.includes("FROM events") && sql.includes("user_id = __daobrew_scope.uid")), "calendar read must flow through the injected query");
            assert.ok(reads.some((sql) => sql.includes("FROM meeting_notes") && sql.includes("user_id = __daobrew_scope.uid")), "granola read must flow through the injected query");
            assert.ok(reads.some((sql) => sql.includes("FROM user_insights") && sql.includes("user_id = __daobrew_scope.uid")), "memory read must flow through the injected query");
            // Nothing may leak to the module-level default when a query is injected.
            assert.deepStrictEqual(captured.queries, [], "no read may bypass the injected query");
        });
    });
    (0, node_test_1.it)("reader bodies filter user_id by the scope row under postgres (F1 One-Time-Filter regression)", async () => {
        // In postgres mode the readers' query is scopedQuery(userId) (run.ts
        // scopedRead); a `user_id = '<literal>'` in the body lets the planner
        // fold the RLS qual into a One-Time Filter evaluated at executor startup
        // — before the lateral scope row has run set_config — so a fresh pooled
        // backend silently returns zero rows (live bug F1). The body must
        // reference the scope row's uid instead.
        await withPostgresFakeTransport(async () => {
            const reads = [];
            const query = async (sql) => {
                reads.push(sql);
                return [];
            };
            await (0, calendar_js_1.readCalendarSignals)({ userId: INJECT_USER, query });
            await (0, granola_js_1.readGranolaSignals)({ userId: INJECT_USER, query });
            await (0, memory_js_1.readMemorySignals)({ userId: INJECT_USER, query });
            assert.strictEqual(reads.length, 3);
            for (const sql of reads) {
                assert.ok(sql.includes("user_id = __daobrew_scope.uid"), `postgres read must filter user_id via the scope row, got: ${sql}`);
                assert.ok(!sql.includes(`user_id = '${INJECT_USER}'`), `postgres read must NOT compare user_id to a literal (One-Time-Filter fail-closed trap), got: ${sql}`);
            }
        });
    });
    (0, node_test_1.it)("reader bodies keep the escaped literal under sqlite (plain queryJson has no scope row)", async (t) => {
        if (!sqliteCliPresent())
            return t.skip("sqlite3 CLI not available");
        const previousStore = process.env.DAOBREW_GRAPH_STORE;
        process.env.DAOBREW_GRAPH_STORE = "sqlite";
        try {
            await withTempGraphDb(async () => {
                const reads = [];
                const query = async (sql) => {
                    reads.push(sql);
                    return [];
                };
                await (0, calendar_js_1.readCalendarSignals)({ userId: INJECT_USER, query });
                await (0, granola_js_1.readGranolaSignals)({ userId: INJECT_USER, query });
                await (0, memory_js_1.readMemorySignals)({ userId: INJECT_USER, query });
                assert.strictEqual(reads.length, 3);
                for (const sql of reads) {
                    assert.ok(sql.includes(`user_id = '${INJECT_USER}'`), `sqlite read must keep the escaped literal, got: ${sql}`);
                    assert.ok(!sql.includes("__daobrew_scope.uid"), `sqlite has no scope row — the reference would be an unknown-column error, got: ${sql}`);
                }
            });
        }
        finally {
            if (previousStore === undefined)
                delete process.env.DAOBREW_GRAPH_STORE;
            else
                process.env.DAOBREW_GRAPH_STORE = previousStore;
        }
    });
    (0, node_test_1.it)("prefixes graph_source_ref with the row's own source", async () => {
        await withPostgresFakeTransport(async () => {
            const rows = await (0, granola_js_1.readGranolaSignals)({
                userId: INJECT_USER,
                query: async () => [{
                        id: "p1", user_id: INJECT_USER, source: "plaud", source_ref: "file-9",
                        event_id: null, kind: "meeting", title: "Standup", occurred_at_ts: 100,
                        duration_sec: null, participants_json: null, summary: null, body: null,
                        transcript_spans_json: null, topics_json: null, created_at_ts: 100,
                    }],
            });
            assert.strictEqual(rows[0].graph_source_ref, "plaud:file-9");
        });
    });
    (0, node_test_1.it)("keeps the granola prefix for granola rows (back-compat)", async () => {
        await withPostgresFakeTransport(async () => {
            const rows = await (0, granola_js_1.readGranolaSignals)({
                userId: INJECT_USER,
                query: async () => [{
                        id: "g1", user_id: INJECT_USER, source: "granola", source_ref: "note-1",
                        event_id: null, kind: "meeting", title: "Standup", occurred_at_ts: 100,
                        duration_sec: null, participants_json: null, summary: null, body: null,
                        transcript_spans_json: null, topics_json: null, created_at_ts: 100,
                    }],
            });
            assert.strictEqual(rows[0].graph_source_ref, "granola:note-1");
        });
    });
    (0, node_test_1.it)("defaults to module queryJson with GUC-free SQL when no query is injected", async () => {
        await withPostgresFakeTransport(async (captured) => {
            await (0, calendar_js_1.readCalendarSignals)({ userId: DEFAULT_READER_USER });
            await (0, granola_js_1.readGranolaSignals)({ userId: DEFAULT_READER_USER });
            await (0, memory_js_1.readMemorySignals)({ userId: DEFAULT_READER_USER });
            assert.strictEqual(captured.queries.length, 3, "reads must fall back to queryJson");
            for (const sql of captured.queries) {
                assert.ok(!sql.includes("set_config"), `un-injected SQL must stay GUC-free (unchanged behavior), got: ${sql}`);
            }
        });
    });
});
(0, node_test_1.describe)("engine run wiring (postgres signal reads)", () => {
    (0, node_test_1.it)("runEngineOnce routes every signal-table read through the run user's scope", async () => {
        await withPostgresFakeTransport(async (captured) => {
            const result = await (0, run_js_1.runEngineOnce)({ once: true, userId: WIRING_USER });
            assert.strictEqual(result.status, "no_signal");
            assert.strictEqual(result.graph_store, "postgres");
            for (const table of ["FROM events", "FROM meeting_notes", "FROM user_insights"]) {
                const reads = captured.queries.filter((sql) => sql.includes(table));
                assert.ok(reads.length > 0, `${table} read must reach the transport`);
                for (const sql of reads) {
                    assert.ok(sql.includes(`set_config('${GUC}', '${WIRING_USER}', true)`), `${table} read must carry the GUC scope for the run's userId, got: ${sql}`);
                    assert.strictEqual(occurrences(sql, "set_config"), 1, `${table} read must carry the GUC scope exactly once, got: ${sql}`);
                }
            }
        });
    });
});
