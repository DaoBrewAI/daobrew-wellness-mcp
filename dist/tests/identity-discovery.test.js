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
const identity_discovery_js_1 = require("../src/engine/identity-discovery.js");
(0, node_test_1.describe)("canonicalIdentities", () => {
    const UUID_A = "14802294-BEED-480E-ABF6-7E3703FA25CD";
    const UUID_B = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
    const UUID_C = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";
    (0, node_test_1.it)("drops api-key legacy buckets instead of treating them as runnable identities", () => {
        assert.deepStrictEqual((0, identity_discovery_js_1.canonicalIdentities)(["dbk_alice", "apikey:dbk_alice"]), []);
    });
    (0, node_test_1.it)("keeps a canonical UUID as a standalone principal", () => {
        assert.deepStrictEqual((0, identity_discovery_js_1.canonicalIdentities)([UUID_A.toLowerCase()]), [UUID_A]);
    });
    (0, node_test_1.it)("dedupes and sorts UUID anchors deterministically", () => {
        assert.deepStrictEqual((0, identity_discovery_js_1.canonicalIdentities)([UUID_B, UUID_A, UUID_B.toLowerCase()]), [UUID_A, UUID_B]);
    });
    (0, node_test_1.it)("drops empty/falsy ids", () => {
        assert.deepStrictEqual((0, identity_discovery_js_1.canonicalIdentities)(["", UUID_A]), [UUID_A]);
    });
    (0, node_test_1.it)("drops non-UUID labels", () => {
        assert.deepStrictEqual((0, identity_discovery_js_1.canonicalIdentities)(["UUID-X", "local", "config-user"]), []);
    });
});
(0, node_test_1.describe)("discoverActiveIdentities", () => {
    const UUID_A = "14802294-BEED-480E-ABF6-7E3703FA25CD";
    const UUID_B = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
    const UUID_C = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";
    (0, node_test_1.it)("unions DISTINCT UUID user_ids across biometric + insight tables and drops legacy buckets", async () => {
        const sqls = [];
        const query = async (sql) => {
            sqls.push(sql);
            if (sql.includes("information_schema.tables")) {
                return [{ table_name: "intraday_state" }, { table_name: "health_samples" }];
            }
            if (sql.includes("FROM intraday_state"))
                return [{ user_id: "apikey:dbk_alice" }, { user_id: UUID_A }];
            if (sql.includes("FROM health_samples"))
                return [{ user_id: "dbk_alice" }, { user_id: UUID_A.toLowerCase() }];
            if (sql.includes("FROM user_insights"))
                return [{ user_id: "apikey:dbk_alice" }, { user_id: UUID_B }];
            throw new Error(`unexpected sql: ${sql}`);
        };
        const ids = await (0, identity_discovery_js_1.discoverActiveIdentities)({ query, nowTs: 1_000_000, windowDays: 30 });
        assert.deepStrictEqual([...ids].sort(), [UUID_A, UUID_B].sort());
    });
    (0, node_test_1.it)("runs on the plain owner executor — never a scopedQuery wrapper", async () => {
        const sqls = [];
        const query = async (sql) => {
            sqls.push(sql);
            if (sql.includes("information_schema.tables")) {
                return [{ table_name: "intraday_state" }, { table_name: "health_samples" }];
            }
            return [];
        };
        await (0, identity_discovery_js_1.discoverActiveIdentities)({ query, nowTs: 1_000_000, windowDays: 30 });
        assert.ok(!sqls.some((s) => /set_config|__daobrew_scope/.test(s)), "discovery must NOT use scopedQuery — it would fail-closed to one user");
    });
    (0, node_test_1.it)("applies the recency window on the right column per table", async () => {
        const cutoff = 1_000_000 - 30 * 86_400;
        const sqls = [];
        const query = async (sql) => {
            sqls.push(sql);
            if (sql.includes("information_schema.tables")) {
                return [{ table_name: "intraday_state" }, { table_name: "health_samples" }];
            }
            return [];
        };
        await (0, identity_discovery_js_1.discoverActiveIdentities)({ query, nowTs: 1_000_000, windowDays: 30 });
        const stateSql = sqls.find((s) => s.includes("FROM intraday_state"));
        const sampleSql = sqls.find((s) => s.includes("FROM health_samples"));
        const insightSql = sqls.find((s) => s.includes("FROM user_insights"));
        assert.ok(stateSql.includes(`bucket_ts >= ${cutoff}`), `state: ${stateSql}`);
        assert.ok(sampleSql.includes(`start_time_ts >= ${cutoff}`), `sample: ${sampleSql}`);
        assert.ok(insightSql.includes(`created_at_ts >= ${cutoff}`), `insight: ${insightSql}`);
        // Each is a DISTINCT user_id scan (no per-user literal comparison).
        for (const [label, sql] of [["state", stateSql], ["sample", sampleSql], ["insight", insightSql]]) {
            assert.ok(/SELECT DISTINCT user_id/.test(sql), `${label} must be a DISTINCT user_id scan, got: ${sql}`);
        }
    });
    (0, node_test_1.it)("tolerates absent backend biometric tables (probe-guarded, insights only)", async () => {
        const query = async (sql) => {
            if (sql.includes("information_schema.tables"))
                return []; // no backend tables present
            if (sql.includes("FROM intraday_state") || sql.includes("FROM health_samples")) {
                throw new Error(`must not query absent table: ${sql}`);
            }
            if (sql.includes("FROM user_insights"))
                return [{ user_id: UUID_C }];
            throw new Error(`unexpected sql: ${sql}`);
        };
        const ids = await (0, identity_discovery_js_1.discoverActiveIdentities)({ query, nowTs: 1_000_000, windowDays: 30 });
        assert.deepStrictEqual([...ids], [UUID_C]);
    });
});
