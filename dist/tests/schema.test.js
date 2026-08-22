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
const node_path_1 = require("node:path");
const schema_js_1 = require("../src/engine/schema.js");
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
function sqliteResult(dbPath, sql) {
    const result = (0, node_child_process_1.spawnSync)("sqlite3", [dbPath, sql], { encoding: "utf-8" });
    return { status: result.status, stderr: result.stderr };
}
function objectExists(dbPath, type, name) {
    const out = sqlite(dbPath, `SELECT count(*) FROM sqlite_master WHERE type='${type}' AND name='${name.replace(/'/g, "''")}';`).trim();
    return out === "1";
}
(0, node_test_1.describe)("engine schema", () => {
    (0, node_test_1.it)("ensureSchema is idempotent and migrates graph_nodes.embedding", (t) => {
        if (!sqliteCliPresent())
            return t.skip("sqlite3 CLI not available");
        const scratchRoot = (0, node_path_1.join)(process.cwd(), ".test-tmp", "schema-test");
        (0, node_fs_1.mkdirSync)(scratchRoot, { recursive: true });
        const tmpDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(scratchRoot, "daobrew-schema-"));
        const dbPath = (0, node_path_1.join)(tmpDir, "sentinel-graph.db");
        const previousGraphStore = process.env.DAOBREW_GRAPH_STORE;
        process.env.DAOBREW_GRAPH_STORE = "sqlite";
        try {
            sqlite(dbPath, `
        CREATE TABLE graph_nodes(
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT 'local',
          kind TEXT NOT NULL CHECK(kind IN ('pattern','meeting','episode','theme','ghost','prediction','intervention','memory_hit')),
          title TEXT NOT NULL,
          subtitle TEXT,
          element TEXT,
          occurred_at_ts INTEGER,
          source TEXT,
          source_ref TEXT,
          props_json TEXT NOT NULL DEFAULT '{}',
          created_at_ts INTEGER NOT NULL
        );
        CREATE TABLE graph_edges(
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT 'local',
          src_id TEXT NOT NULL,
          dst_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('triggered','manifested','tagged','clusters','suggests','evidence_for','predicts','caused','relates_to')),
          label TEXT,
          weight REAL DEFAULT 1.0,
          props_json TEXT DEFAULT '{}',
          created_at_ts INTEGER NOT NULL,
          UNIQUE(user_id, src_id, dst_id, kind)
        );
        CREATE INDEX idx_legacy_graph_title ON graph_nodes(title);
        INSERT INTO graph_nodes(
          id, user_id, kind, title, props_json, created_at_ts
        ) VALUES (
          'legacy-row', '14802294-BEED-480E-ABF6-7E3703FA25CD',
          'episode', 'preserved row', '{}', 1
        );
        `);
            (0, schema_js_1.ensureSchema)(dbPath);
            (0, schema_js_1.ensureSchema)(dbPath);
            const columns = sqlite(dbPath, "PRAGMA table_info(graph_nodes);");
            assert.match(columns, /\|embedding\|BLOB\|/);
            const meetingColumns = sqlite(dbPath, "PRAGMA table_info(meeting_notes);");
            assert.match(meetingColumns, /\|transcript_spans_json\|TEXT\|/);
            const indexCount = sqlite(dbPath, "SELECT count(*) FROM sqlite_master WHERE type='index' AND name='ux_nodes_dedup';").trim();
            assert.strictEqual(indexCount, "1");
            assert.ok(objectExists(dbPath, "index", "idx_legacy_graph_title"), "legacy explicit index was not restored");
            assert.strictEqual(sqlite(dbPath, "SELECT title FROM graph_nodes WHERE id='legacy-row';").trim(), "preserved row");
            for (const table of ["events", "meeting_notes", "user_insights"]) {
                assert.ok(objectExists(dbPath, "table", table), `missing source table ${table}`);
            }
            for (const index of [
                "ux_events_dedup",
                "idx_events_user_time",
                "ux_meeting_notes_dedup",
                "idx_meeting_notes_user_time",
                "ux_user_insights_dedup",
                "idx_user_insights_user_strength",
            ]) {
                assert.ok(objectExists(dbPath, "index", index), `missing source index ${index}`);
            }
            const graphColumns = sqlite(dbPath, "PRAGMA table_info(graph_nodes);");
            assert.doesNotMatch(graphColumns, /user_id\|TEXT\|1\|'local'/);
            const missingUserInsert = sqliteResult(dbPath, `
        INSERT INTO graph_nodes(id, kind, title, created_at_ts)
        VALUES ('missing-user', 'episode', 'missing user', 1);
        `);
            assert.notStrictEqual(missingUserInsert.status, 0);
            assert.match(missingUserInsert.stderr, /NOT NULL constraint failed: graph_nodes\.user_id/);
        }
        finally {
            if (previousGraphStore === undefined) {
                delete process.env.DAOBREW_GRAPH_STORE;
            }
            else {
                process.env.DAOBREW_GRAPH_STORE = previousGraphStore;
            }
            (0, node_fs_1.rmSync)(tmpDir, { recursive: true, force: true });
            (0, node_fs_1.rmSync)(scratchRoot, { recursive: true, force: true });
        }
    });
});
