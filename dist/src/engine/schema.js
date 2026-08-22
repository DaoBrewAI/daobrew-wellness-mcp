"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRAPH_EDGE_KINDS = exports.GRAPH_NODE_KINDS = void 0;
exports.verifyPostgresRuntimeSchema = verifyPostgresRuntimeSchema;
exports.__resetPostgresSchemaEnsureForTests = __resetPostgresSchemaEnsureForTests;
exports.ensureSchema = ensureSchema;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const graph_db_js_1 = require("../graph-db.js");
const postgres_schema_js_1 = require("./postgres-schema.js");
exports.GRAPH_NODE_KINDS = [
    "pattern",
    "meeting",
    "episode",
    "theme",
    "ghost",
    "prediction",
    "intervention",
    "memory_hit",
];
exports.GRAPH_EDGE_KINDS = [
    "triggered",
    "manifested",
    "tagged",
    "clusters",
    "suggests",
    "evidence_for",
    "predicts",
    "caused",
    "relates_to",
];
const GRAPH_DDL = `
PRAGMA busy_timeout=2000;
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS graph_nodes(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('pattern','meeting','episode','theme','ghost','prediction','intervention','memory_hit')),
  title TEXT NOT NULL,
  subtitle TEXT,
  element TEXT,
  occurred_at_ts INTEGER,
  source TEXT,
  source_ref TEXT,
  props_json TEXT NOT NULL DEFAULT '{}',
  embedding BLOB,
  created_at_ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_nodes_dedup
  ON graph_nodes(user_id, kind, source, source_ref) WHERE source_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS graph_edges(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  src_id TEXT NOT NULL,
  dst_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('triggered','manifested','tagged','clusters','suggests','evidence_for','predicts','caused','relates_to')),
  label TEXT,
  weight REAL DEFAULT 1.0,
  props_json TEXT DEFAULT '{}',
  created_at_ts INTEGER NOT NULL,
  UNIQUE(user_id, src_id, dst_id, kind)
);
`;
const SOURCE_DDL = `
CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'eventkit',
  source_ref TEXT,
  title TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER,
  all_day INTEGER NOT NULL DEFAULT 0,
  attendee_count INTEGER,
  attendees_json TEXT,
  calendar_name TEXT,
  location TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at_ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_events_dedup ON events(user_id, source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_user_time ON events(user_id, start_ts);

CREATE TABLE IF NOT EXISTS meeting_notes(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'granola',
  source_ref TEXT,
  event_id TEXT,
  kind TEXT NOT NULL DEFAULT 'meeting' CHECK(kind IN ('meeting','call','interview','one_on_one','standup','other')),
  title TEXT NOT NULL,
  occurred_at_ts INTEGER,
  duration_sec INTEGER,
  participants_json TEXT,
  summary TEXT,
  body TEXT,
  transcript_spans_json TEXT,
  topics_json TEXT,
  embedding BLOB,
  created_at_ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_meeting_notes_dedup ON meeting_notes(user_id, source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_notes_user_time ON meeting_notes(user_id, occurred_at_ts);

CREATE TABLE IF NOT EXISTS user_insights(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'claude_sessions',
  source_ref TEXT,
  insight_text TEXT NOT NULL,
  topics_json TEXT,
  importance REAL NOT NULL DEFAULT 0.5,
  strength REAL NOT NULL DEFAULT 1.0,
  occurred_at_ts INTEGER,
  last_accessed_ts INTEGER,
  embedding BLOB,
  created_at_ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_insights_dedup ON user_insights(user_id, source, source_ref, insight_text);
CREATE INDEX IF NOT EXISTS idx_user_insights_user_strength ON user_insights(user_id, strength);
`;
function sqlite(dbPath, sql) {
    return (0, child_process_1.execFileSync)("sqlite3", ["-cmd", ".timeout 5000", dbPath, sql], { encoding: "utf-8" });
}
function sqliteRows(dbPath, sql) {
    const output = (0, child_process_1.execFileSync)("sqlite3", ["-json", "-cmd", ".timeout 5000", dbPath, sql], { encoding: "utf-8" }).trim();
    return output ? JSON.parse(output) : [];
}
function tableHasColumn(dbPath, table, column) {
    const escapedTable = table.replace(/"/g, '""');
    const out = sqlite(dbPath, `PRAGMA table_info("${escapedTable}");`);
    return out
        .split("\n")
        .filter(Boolean)
        .some((line) => line.split("|")[1] === column);
}
function sqliteStringLiteral(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
function sqliteIdentifier(value) {
    return `"${value.replace(/"/g, '""')}"`;
}
function dropSqliteLocalUserDefaults(dbPath) {
    const legacyLocalDefault = ["user_id TEXT NOT NULL DEFAULT", "'local'"].join(" ");
    const legacyLocalDefaultLiteral = sqliteStringLiteral(legacyLocalDefault);
    const tables = sqliteRows(dbPath, `SELECT name, sql
       FROM sqlite_schema
      WHERE type = 'table'
        AND sql IS NOT NULL
        AND instr(sql, ${legacyLocalDefaultLiteral}) > 0
      ORDER BY name;`);
    for (const table of tables) {
        const canonicalSql = table.sql.split(legacyLocalDefault).join("user_id TEXT NOT NULL");
        const firstColumn = canonicalSql.indexOf("(");
        if (firstColumn < 0) {
            throw new Error(`cannot rebuild legacy SQLite table ${table.name}`);
        }
        const temporaryName = `__daobrew_user_id_${table.name}`;
        const columns = sqliteRows(dbPath, `SELECT name FROM pragma_table_info(${sqliteStringLiteral(table.name)}) ORDER BY cid;`).map(({ name }) => sqliteIdentifier(name));
        if (columns.length === 0) {
            throw new Error(`cannot read columns for legacy SQLite table ${table.name}`);
        }
        const schemaObjects = sqliteRows(dbPath, `SELECT sql
         FROM sqlite_schema
        WHERE tbl_name = ${sqliteStringLiteral(table.name)}
          AND type IN ('index', 'trigger')
          AND sql IS NOT NULL
        ORDER BY type, name;`);
        const columnList = columns.join(", ");
        const createTemporary = `CREATE TABLE ${sqliteIdentifier(temporaryName)}${canonicalSql.slice(firstColumn)}`;
        const restoreSchemaObjects = schemaObjects.map(({ sql }) => `${sql};`).join("\n");
        // Rebuild through ordinary SQLite DDL. Newer macOS runners compile the
        // CLI with defensive schema protections and reject writable_schema even
        // after its pragma is enabled. The transaction preserves every row plus
        // explicit index/trigger while changing only the removed column default.
        sqlite(dbPath, `PRAGMA foreign_keys=OFF;
       BEGIN IMMEDIATE;
       ${createTemporary};
       INSERT INTO ${sqliteIdentifier(temporaryName)} (${columnList})
         SELECT ${columnList} FROM ${sqliteIdentifier(table.name)};
       DROP TABLE ${sqliteIdentifier(table.name)};
       ALTER TABLE ${sqliteIdentifier(temporaryName)} RENAME TO ${sqliteIdentifier(table.name)};
       ${restoreSchemaObjects}
       COMMIT;`);
    }
    const foreignKeyViolations = sqlite(dbPath, "PRAGMA foreign_key_check;").trim();
    if (foreignKeyViolations) {
        throw new Error("SQLite identity migration produced a foreign-key violation");
    }
}
let postgresSchemaEnsured = false;
/**
 * Strict, read-only readiness probe for the shared backend/engine database.
 * The result contains catalog names only; connection strings and credentials
 * are never reflected into an error or log message.
 */
function verifyPostgresRuntimeSchema() {
    const output = (0, graph_db_js_1.execSqlSync)(postgres_schema_js_1.POSTGRES_RUNTIME_VERIFY_SQL).trim();
    const line = output.split("\n").map((value) => value.trim()).filter(Boolean).at(-1);
    let status;
    try {
        status = JSON.parse(line ?? "");
    }
    catch {
        throw new Error("Postgres causal runtime schema verification returned an invalid result");
    }
    if (typeof status?.ready !== "boolean"
        || typeof status.vector_extension !== "boolean"
        || typeof status.generation_current_marker !== "boolean"
        || typeof status.trigger_count !== "number"
        || !Array.isArray(status.missing_tables)
        || !Array.isArray(status.missing_indexes)
        || !Array.isArray(status.missing_functions)
        || !Array.isArray(status.missing_triggers)
        || ![
            ...status.missing_tables,
            ...status.missing_indexes,
            ...status.missing_functions,
            ...status.missing_triggers,
        ].every((value) => typeof value === "string")) {
        throw new Error("Postgres causal runtime schema verification returned an invalid result");
    }
    if (!status.ready) {
        const missing = [
            ...status.missing_tables.map((name) => `table:${name}`),
            ...status.missing_indexes.map((name) => `index:${name}`),
            ...status.missing_functions.map((name) => `function:${name}`),
            ...status.missing_triggers.map((name) => `trigger:${name}`),
        ];
        if (!status.vector_extension)
            missing.push("extension:vector");
        if (!status.generation_current_marker) {
            missing.push("column:causal_graph_generations.is_current");
        }
        throw new Error(`Postgres causal runtime schema is not ready (${missing.join(", ") || "invalid trigger count"})`);
    }
    return status;
}
/** Test-only cache reset; production callers never need to clear readiness. */
function __resetPostgresSchemaEnsureForTests() {
    postgresSchemaEnsured = false;
}
/**
 * Ensure the local causal-chain store exists.
 *
 * This is intentionally synchronous so local maintenance commands
 * can call it before issuing their inserts, and so every runtime path shares one
 * graph DDL source.
 */
function ensureSchema(dbPath = (0, graph_db_js_1.graphDbPath)()) {
    if ((0, graph_db_js_1.graphStoreKind)() === "postgres") {
        if (!postgresSchemaEnsured) {
            verifyPostgresRuntimeSchema();
            postgresSchemaEnsured = true;
        }
        return;
    }
    (0, fs_1.mkdirSync)((0, path_1.dirname)(dbPath), { recursive: true });
    sqlite(dbPath, GRAPH_DDL);
    sqlite(dbPath, SOURCE_DDL);
    dropSqliteLocalUserDefaults(dbPath);
    if (!tableHasColumn(dbPath, "graph_nodes", "embedding")) {
        sqlite(dbPath, "ALTER TABLE graph_nodes ADD COLUMN embedding BLOB;");
    }
    if (!tableHasColumn(dbPath, "meeting_notes", "transcript_spans_json")) {
        sqlite(dbPath, "ALTER TABLE meeting_notes ADD COLUMN transcript_spans_json TEXT;");
    }
}
