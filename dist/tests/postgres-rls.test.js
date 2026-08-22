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
const node_path_1 = require("node:path");
const postgres_rls_js_1 = require("../src/engine/postgres-rls.js");
const postgres_schema_js_1 = require("../src/engine/postgres-schema.js");
function repoRoot() {
    return (0, node_fs_1.existsSync)((0, node_path_1.resolve)(process.cwd(), "alembic.ini"))
        ? process.cwd()
        : (0, node_path_1.resolve)(process.cwd(), "..");
}
function sharedGraphMigrationSource() {
    return (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(repoRoot(), "alembic", "versions", "0015_shared_graph_schema.py"), "utf8");
}
function currentRlsMigrationSource() {
    return [
        sharedGraphMigrationSource(),
        (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(repoRoot(), "alembic", "versions", "0024_insight_lifecycle_decisions.py"), "utf8"),
    ].join("\n");
}
(0, node_test_1.describe)("Postgres RLS DDL contract (multi-user tenant isolation)", () => {
    (0, node_test_1.it)("pins the session GUC name used for user scoping", () => {
        assert.equal(postgres_rls_js_1.RLS_GUC, "app.daobrew_user_id");
    });
    (0, node_test_1.it)("classifies every schema table exactly once (union === POSTGRES_TABLES)", () => {
        const union = [...postgres_rls_js_1.USER_SCOPED_TABLES, ...postgres_rls_js_1.PERMISSIVE_TABLES];
        // No table classified twice.
        assert.equal(new Set(union).size, union.length, "a table appears in both classifications");
        // Union is exactly the schema's table list — a future table cannot silently
        // skip classification without breaking this test.
        assert.deepEqual([...union].sort(), [...postgres_schema_js_1.POSTGRES_TABLES].sort());
    });
    (0, node_test_1.it)("classification matches the design of record", () => {
        assert.deepEqual([...postgres_rls_js_1.USER_SCOPED_TABLES].sort(), [
            "causal_memory_threads",
            "causal_thread_evidence",
            "events",
            "graph_edges",
            "graph_nodes",
            "insight_lifecycle_decisions",
            "intervention_assignments",
            "meeting_notes",
            "thread_verifications",
            "transfer_consent",
            "user_insights",
            "user_model_snapshots",
            "user_vectors",
        ]);
        assert.deepEqual([...postgres_rls_js_1.PERMISSIVE_TABLES].sort(), ["pipeline_metrics", "population_priors", "transfer_records"]);
    });
    (0, node_test_1.it)("MCP exports only RLS metadata; Alembic owns shared policy DDL", () => {
        const source = (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(repoRoot(), "daobrew-wellness-mcp", "src", "engine", "postgres-rls.ts"), "utf8");
        assert.doesNotMatch(source, /POSTGRES_RLS_DDL/);
        assert.doesNotMatch(source, /CREATE POLICY/);
        assert.doesNotMatch(source, /ENABLE ROW LEVEL SECURITY/);
    });
    (0, node_test_1.it)("Alembic enables RLS on every table — ENABLE, never FORCE (owner must bypass)", () => {
        const migration = currentRlsMigrationSource();
        for (const table of postgres_schema_js_1.POSTGRES_TABLES) {
            assert.match(migration, new RegExp(`"${table}"`), `${table} is not listed in the Alembic RLS table classifications`);
        }
        assert.match(migration, /ALTER TABLE \{table\} ENABLE ROW LEVEL SECURITY;/);
        assert.doesNotMatch(migration, /FORCE ROW LEVEL SECURITY/);
    });
    (0, node_test_1.it)("Alembic user-scoped tables get deny-by-default policies keyed on the GUC", () => {
        const migration = currentRlsMigrationSource();
        for (const table of postgres_rls_js_1.USER_SCOPED_TABLES) {
            assert.match(migration, new RegExp(`"${table}"`), `${table} is not listed in USER_SCOPED_TABLES`);
        }
        assert.match(migration, /guard = "user_id = current_setting\('app\.daobrew_user_id', true\)"/);
        assert.match(migration, /CREATE POLICY \{table\}_user_isolation ON \{table\}/);
        assert.match(migration, /USING \(\{guard\}\)/);
        assert.match(migration, /WITH CHECK \(\{guard\}\)/);
    });
    (0, node_test_1.it)("Alembic user-scoped policy template has NO fallback-to-permissive", () => {
        const migration = sharedGraphMigrationSource();
        const userScopedStart = migration.indexOf("for table in USER_SCOPED_TABLES:");
        const permissiveStart = migration.indexOf("for table in PERMISSIVE_TABLES:");
        assert.ok(userScopedStart >= 0 && permissiveStart > userScopedStart);
        const section = migration.slice(userScopedStart, permissiveStart);
        assert.doesNotMatch(section, /USING \(true\)/);
        assert.doesNotMatch(section, /WITH CHECK \(true\)/);
        assert.doesNotMatch(section, /COALESCE/i);
        assert.doesNotMatch(section, /'local'/);
    });
    (0, node_test_1.it)("Alembic annex + aggregate tables are explicitly permissive", () => {
        const migration = currentRlsMigrationSource();
        for (const table of postgres_rls_js_1.PERMISSIVE_TABLES) {
            assert.match(migration, new RegExp(`"${table}"`));
        }
        const permissiveStart = migration.indexOf("for table in PERMISSIVE_TABLES:");
        assert.ok(permissiveStart >= 0);
        const section = migration.slice(permissiveStart, migration.indexOf("def upgrade()", permissiveStart));
        assert.match(section, /CREATE POLICY \{table\}_permissive_all ON \{table\}/);
        assert.match(section, /USING \(true\)/);
        assert.match(section, /WITH CHECK \(true\)/);
        assert.doesNotMatch(section, /current_setting/);
    });
    (0, node_test_1.it)("Alembic policy DDL is idempotent: DROP precedes matching CREATE", () => {
        const migration = sharedGraphMigrationSource();
        const userDrop = migration.indexOf("DROP POLICY IF EXISTS {table}_user_isolation ON {table};");
        const userCreate = migration.indexOf("CREATE POLICY {table}_user_isolation ON {table}");
        const permissiveDrop = migration.indexOf("DROP POLICY IF EXISTS {table}_permissive_all ON {table};");
        const permissiveCreate = migration.indexOf("CREATE POLICY {table}_permissive_all ON {table}");
        assert.ok(userDrop >= 0 && userDrop < userCreate);
        assert.ok(permissiveDrop >= 0 && permissiveDrop < permissiveCreate);
    });
    (0, node_test_1.it)("app-role provisioning SQL creates a non-bypass login role with table grants", () => {
        const sql = (0, postgres_rls_js_1.appRoleProvisionSql)("daobrew_app");
        assert.match(sql, /CREATE ROLE daobrew_app LOGIN NOSUPERUSER NOBYPASSRLS/);
        assert.match(sql, /GRANT USAGE ON SCHEMA public TO daobrew_app;/);
        assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO daobrew_app;/);
        // Future tables inherit the grants.
        assert.match(sql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO daobrew_app;/);
    });
    (0, node_test_1.it)("provisioning SQL never embeds a password literal — psql variable placeholder only", () => {
        const sql = (0, postgres_rls_js_1.appRoleProvisionSql)("daobrew_app");
        // The password is a psql variable (:'app_password'), interpolated client-side
        // at apply time from the environment — never a literal in generated SQL.
        assert.match(sql, /PASSWORD :'app_password'/);
        // No password-looking literal anywhere: PASSWORD followed by a plain quoted string.
        assert.doesNotMatch(sql, /PASSWORD\s+'[^']*'/i);
        assert.doesNotMatch(sql, /PASSWORD\s+"[^"]*"/i);
    });
    (0, node_test_1.it)("rejects role names that are not simple SQL identifiers", () => {
        assert.throws(() => (0, postgres_rls_js_1.appRoleProvisionSql)("bad role; DROP TABLE graph_nodes--"));
        assert.throws(() => (0, postgres_rls_js_1.appRoleProvisionSql)(""));
        assert.throws(() => (0, postgres_rls_js_1.appRoleProvisionSql)("role'name"));
    });
});
