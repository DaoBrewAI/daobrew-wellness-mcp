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
const sweep_js_1 = require("../src/engine/embeddings/sweep.js");
const internal_server_js_1 = require("../src/engine/internal-server.js");
const postgres_schema_js_1 = require("../src/engine/postgres-schema.js");
function vector(value) {
    return Array.from({ length: 768 }, () => value);
}
(0, node_test_1.describe)("embedSweep", () => {
    (0, node_test_1.it)("embeds user_insights null rows and writes one metrics row", async () => {
        const updates = [];
        const provider = {
            embed: async (texts) => texts.map((_, i) => vector(i / 10)),
        };
        const result = await (0, sweep_js_1.embedSweep)({
            table: "user_insights",
            batchSize: 2,
            limit: 2,
            provider,
            exec: async (sql) => { updates.push(sql); },
            query: async (sql) => {
                if (/embedding IS NULL/.test(sql))
                    return [
                        { id: "a", text: "first" },
                        { id: "b", text: "second" },
                    ];
                if (/count\(\*\).*embedding IS NOT NULL/.test(sql))
                    return [{ count: 2 }];
                if (/pg_total_relation_size/.test(sql))
                    return [{ bytes: 12345 }];
                return [];
            },
            nowTs: () => 1234,
        });
        assert.strictEqual(result.rowsEmbedded, 2);
        // One embedContent HTTP request per text, so the quota metric counts rows.
        assert.strictEqual(result.geminiCallsUsed, 2);
        assert.match(updates.join("\n"), /UPDATE user_insights/);
        assert.match(updates.join("\n"), /INSERT INTO pipeline_metrics/);
    });
    (0, node_test_1.it)("counts one gemini call per row across multiple batches", async () => {
        let served = 0;
        const metricsInserts = [];
        const result = await (0, sweep_js_1.embedSweep)({
            table: "user_insights",
            batchSize: 2,
            limit: 3,
            provider: { embed: async (texts) => texts.map(() => vector(0.2)) },
            exec: async (sql) => { if (/INSERT INTO pipeline_metrics/.test(sql))
                metricsInserts.push(sql); },
            query: async (sql) => {
                if (/embedding IS NULL/.test(sql)) {
                    const remaining = 3 - served;
                    const take = Math.min(2, remaining);
                    const rows = Array.from({ length: take }, (_, i) => ({ id: `r${served + i}`, text: `t${served + i}` }));
                    served += take;
                    return rows;
                }
                return [];
            },
            nowTs: () => 1234,
        });
        assert.strictEqual(result.rowsEmbedded, 3);
        // 3 texts embedded = 3 embedContent requests, regardless of batching (2+1).
        assert.strictEqual(result.geminiCallsUsed, 3);
        assert.strictEqual(metricsInserts.length, 1);
        assert.match(metricsInserts[0], /, 3, 0, 3, /); // rows_written=3, dedup_skips=0, gemini_calls_used=3
    });
    (0, node_test_1.it)("warns when meeting bodies are truncated for embedding", async () => {
        const result = await (0, sweep_js_1.embedSweep)({
            table: "meeting_notes",
            batchSize: 2,
            limit: 2,
            provider: { embed: async (texts) => texts.map(() => vector(0.1)) },
            exec: async () => { },
            query: async (sql) => {
                if (/embedding IS NULL/.test(sql))
                    return [
                        { id: "m1", text: "long body", truncated: true },
                        { id: "m2", text: "short body", truncated: false },
                    ];
                return [];
            },
            nowTs: () => 1234,
        });
        assert.strictEqual(result.rowsEmbedded, 2);
        assert.strictEqual(result.warnings.length, 1);
        assert.match(result.warnings[0], /truncated/);
        assert.match(result.warnings[0], /m1/);
    });
    (0, node_test_1.it)("sweeps transfer_records: selects NULL trigger_embedding rows guarded by trigger_text", async () => {
        const selects = [];
        await (0, sweep_js_1.embedSweep)({
            table: "transfer_records",
            batchSize: 2,
            limit: 2,
            provider: { embed: async (texts) => texts.map(() => vector(0.2)) },
            exec: async () => { },
            query: async (sql) => {
                if (/trigger_embedding IS NULL/.test(sql)) {
                    selects.push(sql);
                    return selects.length === 1
                        ? [
                            { id: "tr1", text: "post-lunch meeting overrun", truncated: false },
                            { id: "tr2", text: "late-night deploy spiral", truncated: false },
                        ]
                        : [];
                }
                return [];
            },
            nowTs: () => 1234,
        });
        assert.strictEqual(selects[0], "SELECT id, trigger_text AS text, FALSE AS truncated FROM transfer_records WHERE trigger_embedding IS NULL AND trigger_text IS NOT NULL ORDER BY created_at_ts LIMIT 2");
    });
    (0, node_test_1.it)("sweeps transfer_records: UPDATE writes trigger_embedding halfvec keyed by id", async () => {
        const updates = [];
        const result = await (0, sweep_js_1.embedSweep)({
            table: "transfer_records",
            batchSize: 2,
            limit: 2,
            provider: { embed: async (texts) => texts.map(() => vector(0.3)) },
            exec: async (sql) => { updates.push(sql); },
            query: async (sql) => /trigger_embedding IS NULL/.test(sql) && updates.length === 0
                ? [
                    { id: "tr1", text: "post-lunch meeting overrun", truncated: false },
                    { id: "tr2", text: "late-night deploy spiral", truncated: false },
                ]
                : [],
            nowTs: () => 1234,
        });
        assert.strictEqual(result.rowsEmbedded, 2);
        const joined = updates.join("\n");
        assert.match(joined, /UPDATE transfer_records SET trigger_embedding = '\[[^\]]+\]'::halfvec WHERE id = 'tr1';/);
        assert.match(joined, /UPDATE transfer_records SET trigger_embedding = '\[[^\]]+\]'::halfvec WHERE id = 'tr2';/);
        assert.doesNotMatch(joined, /SET embedding =/);
        assert.match(joined, /'embed_sweep:transfer_records'/);
    });
    (0, node_test_1.it)("sweeps transfer_records: embeds trigger_text verbatim", async () => {
        const embeddedBatches = [];
        await (0, sweep_js_1.embedSweep)({
            table: "transfer_records",
            batchSize: 2,
            limit: 2,
            provider: {
                embed: async (texts) => {
                    embeddedBatches.push([...texts]);
                    return texts.map(() => vector(0.4));
                },
            },
            exec: async () => { },
            query: async (sql) => /trigger_embedding IS NULL/.test(sql) && embeddedBatches.length === 0
                ? [
                    { id: "tr1", text: "post-lunch meeting overrun", truncated: false },
                    { id: "tr2", text: "late-night deploy spiral", truncated: false },
                ]
                : [],
            nowTs: () => 1234,
        });
        assert.deepEqual(embeddedBatches, [["post-lunch meeting overrun", "late-night deploy spiral"]]);
    });
    (0, node_test_1.it)("keeps meeting SQL byte-identical and excludes suppressed insights", async () => {
        const seen = {};
        for (const table of ["user_insights", "meeting_notes"]) {
            await (0, sweep_js_1.embedSweep)({
                table,
                batchSize: 2,
                limit: 2,
                provider: { embed: async (texts) => texts.map(() => vector(0.5)) },
                exec: async () => { },
                query: async (sql) => {
                    if (/embedding IS NULL/.test(sql) && !seen[table])
                        seen[table] = sql;
                    return [];
                },
                nowTs: () => 1234,
            });
        }
        assert.strictEqual(seen.user_insights, "SELECT id, insight_text AS text, FALSE AS truncated FROM user_insights WHERE embedding IS NULL AND insight_text IS NOT NULL AND strength > 0 ORDER BY created_at_ts LIMIT 2");
        assert.strictEqual(seen.meeting_notes, "SELECT id, COALESCE(NULLIF(summary,''), left(body, 12000)) AS text, (NULLIF(summary,'') IS NULL AND length(body) > 12000) AS truncated FROM meeting_notes WHERE embedding IS NULL AND COALESCE(NULLIF(summary,''), body) IS NOT NULL ORDER BY created_at_ts LIMIT 2");
    });
    (0, node_test_1.it)("sizes warm_db_bytes over every schema table so growth is never invisible to alerts", async () => {
        const sizeQueries = [];
        await (0, sweep_js_1.embedSweep)({
            table: "user_insights",
            batchSize: 1,
            limit: 1,
            provider: { embed: async (texts) => texts.map(() => vector(0.1)) },
            exec: async () => { },
            query: async (sql) => {
                if (/pg_total_relation_size/.test(sql))
                    sizeQueries.push(sql);
                return [];
            },
            nowTs: () => 1234,
        });
        assert.strictEqual(sizeQueries.length, 1);
        for (const table of postgres_schema_js_1.POSTGRES_TABLES) {
            assert.ok(sizeQueries[0].includes(`to_regclass('${table}')`), `warm-db size query must include ${table}`);
        }
    });
    (0, node_test_1.it)("leaves rows null when provider fails", async () => {
        const updates = [];
        await assert.rejects(() => (0, sweep_js_1.embedSweep)({
            table: "meeting_notes",
            batchSize: 1,
            limit: 1,
            provider: { embed: async () => { throw new Error("quota"); } },
            exec: async (sql) => { updates.push(sql); },
            query: async (sql) => /embedding IS NULL/.test(sql) ? [{ id: "m1", text: "body" }] : [],
            nowTs: () => 1234,
        }));
        assert.doesNotMatch(updates.join("\n"), /UPDATE meeting_notes/);
    });
});
(0, node_test_1.describe)("runEmbedSweep gemini key gate", () => {
    // DAOBREW_POSTGRES_URL / DAOBREW_GRAPH_STORE are cleared too so the skip
    // path is provably DB-free: this test passing without any database IS the
    // proof that the guard runs before all table work.
    const ENV_KEYS = [
        "DAOBREW_CONFIG_FILE",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "DAOBREW_POSTGRES_URL",
        "DAOBREW_GRAPH_STORE",
    ];
    let savedEnv;
    (0, node_test_1.beforeEach)(() => {
        savedEnv = {};
        for (const key of ENV_KEYS) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
        process.env.DAOBREW_CONFIG_FILE = "/nonexistent/config.json";
    });
    (0, node_test_1.afterEach)(() => {
        for (const key of ENV_KEYS) {
            if (savedEnv[key] !== undefined)
                process.env[key] = savedEnv[key];
            else
                delete process.env[key];
        }
    });
    (0, node_test_1.it)("skips with a warning and zero work when no gemini key exists anywhere", async () => {
        const result = await (0, internal_server_js_1.runEmbedSweep)();
        assert.strictEqual(result.rowsEmbedded, 0);
        assert.strictEqual(result.geminiCallsUsed, 0);
        assert.deepEqual(result.alerts, []);
        assert.match(result.warnings.join(" "), /gemini key missing.*embed sweep skipped/i);
    });
    (0, node_test_1.it)("default sweep table set includes transfer_records", async () => {
        const result = await (0, internal_server_js_1.runEmbedSweep)();
        assert.deepEqual(Object.keys(result.tables).sort(), [
            "meeting_notes",
            "transfer_records",
            "user_insights",
        ]);
    });
});
