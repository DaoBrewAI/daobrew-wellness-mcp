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
const user_scope_js_1 = require("../src/engine/user-scope.js");
const graph_db_js_1 = require("../src/graph-db.js");
const graphDb = __importStar(require("../src/graph-db.js"));
const internal_server_harness_js_1 = require("./internal-server-harness.js");
/** Keep in sync with postgres-rls.ts RLS_GUC and user-scope.ts. */
const GUC = "app.daobrew_user_id";
const HOSTILE_USER_ID = "bob'; DROP TABLE graph_nodes;--";
/** q()-escaped form: the single quote doubles, so the payload stays inside the literal. */
const HOSTILE_ESCAPED_LITERAL = "'bob''; DROP TABLE graph_nodes;--'";
function occurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}
/** SQL with quoted string literals removed — what the statement lexer sees as structure. */
function outsideLiterals(sql) {
    return sql.replace(/'(?:[^']|'')*'/g, "<lit>");
}
// ---------------------------------------------------------------------------
// Always-run SQL-shape tests (fake delegates capture the composed SQL).
// ---------------------------------------------------------------------------
(0, node_test_1.describe)("user-scope SQL shape (exec)", () => {
    (0, node_test_1.it)("composes ONE transaction: BEGIN, transaction-local set_config, delegated SQL, COMMIT", async () => {
        const captured = [];
        const exec = (0, user_scope_js_1.scopedExec)("u1", async (sql) => {
            captured.push(sql);
        });
        await exec("INSERT INTO graph_nodes (id, user_id) VALUES ('n1', 'u1');");
        assert.strictEqual(captured.length, 1);
        const sql = captured[0];
        // One explicit transaction pins ONE pooled backend under PgBouncer
        // transaction pooling — the GUC set and the DML can never split across
        // backends (the old separate autocommit prefix could).
        assert.ok(sql.startsWith("BEGIN;"), `exec SQL must open a transaction, got: ${sql}`);
        assert.ok(sql.trimEnd().endsWith("COMMIT;"), `exec SQL must end with COMMIT, got: ${sql}`);
        assert.strictEqual(occurrences(sql, "BEGIN;"), 1, "exactly one BEGIN");
        assert.strictEqual(occurrences(sql, "COMMIT;"), 1, "exactly one COMMIT");
        // is_local = true: the GUC dies at COMMIT — nothing leaks onto the
        // shared pool backend for the next tenant's transaction.
        assert.ok(sql.includes(`SELECT set_config('${GUC}', 'u1', true);`), `exec SQL must set the GUC transaction-locally (is_local = true), got: ${sql}`);
        assert.strictEqual(occurrences(sql, GUC), 1, "GUC must appear exactly once");
        assert.strictEqual(occurrences(sql, "set_config"), 1, "set_config must appear exactly once");
        // The statement text arrives intact; its terminator is re-appended on a
        // line of its own (pinned by the termination tests below).
        assert.ok(sql.includes("INSERT INTO graph_nodes (id, user_id) VALUES ('n1', 'u1')"), "delegated SQL must appear intact inside the transaction");
        assert.ok(sql.indexOf("set_config") < sql.indexOf("INSERT INTO graph_nodes"), "set_config must run before the delegated SQL");
    });
    (0, node_test_1.it)("statement-terminates the delegated SQL whether or not it ends with a semicolon", async () => {
        // Delegated SQL may arrive with or without a trailing `;` — either way
        // the composed script must not fuse `<stmt>\nCOMMIT` into one statement.
        for (const delegated of ["SELECT 1", "SELECT 1;", "SELECT 1;;  "]) {
            const captured = [];
            await (0, user_scope_js_1.scopedExec)("u1", async (sql) => {
                captured.push(sql);
            })(delegated);
            const lines = captured[0].split("\n").map((line) => line.trim()).filter(Boolean);
            assert.deepStrictEqual(lines, ["BEGIN;", `SELECT set_config('${GUC}', 'u1', true);`, "SELECT 1", ";", "COMMIT;"], `delegated ${JSON.stringify(delegated)} must compose a well-terminated script`);
        }
    });
    (0, node_test_1.it)("keeps the terminator effective when the delegated SQL ends in a line comment", async () => {
        // A trailing `-- comment` would swallow a same-line terminator and fuse
        // the last delegated statement with COMMIT (a loud syntax error, but far
        // from the cause). The terminator must live on its own line, immune to
        // line comments.
        const captured = [];
        await (0, user_scope_js_1.scopedExec)("u1", async (sql) => {
            captured.push(sql);
        })("SELECT 1 -- trailing note");
        const withoutComments = captured[0]
            .split("\n")
            .map((line) => line.replace(/--.*$/, "").trim())
            .filter(Boolean);
        assert.deepStrictEqual(withoutComments, ["BEGIN;", `SELECT set_config('${GUC}', 'u1', true);`, "SELECT 1", ";", "COMMIT;"], `the delegated statement must stay terminated once comments are stripped, got: ${captured[0]}`);
    });
    (0, node_test_1.it)("escapes a hostile userId so it stays inert inside a quoted literal", async () => {
        const captured = [];
        const exec = (0, user_scope_js_1.scopedExec)(HOSTILE_USER_ID, async (sql) => {
            captured.push(sql);
        });
        await exec("SELECT 1;");
        const sql = captured[0];
        assert.ok(sql.includes(`set_config('${GUC}', ${HOSTILE_ESCAPED_LITERAL}, true)`), `hostile userId must be q()-escaped inside the literal, got: ${sql}`);
        // The unescaped break-out sequence (quote immediately closed by the raw
        // single quote) must not exist anywhere in the composed SQL.
        assert.ok(!sql.includes("'bob';"), "unescaped quote break-out must not appear");
        assert.ok(!outsideLiterals(sql).includes("DROP TABLE"), "DROP TABLE payload must stay confined to the quoted literal");
    });
});
(0, node_test_1.describe)("user-scope SQL shape (query)", () => {
    (0, node_test_1.it)("composes a single SELECT with a lateral scope dependency (no statement prefix)", async () => {
        const captured = [];
        const rows = [{ id: "n1" }];
        const query = (0, user_scope_js_1.scopedQuery)("u1", async (sql) => {
            captured.push(sql);
            return rows;
        });
        const result = await query("SELECT id FROM graph_nodes ORDER BY id;");
        assert.strictEqual(captured.length, 1);
        const sql = captured[0];
        // Must survive graph-db's jsonQuerySql wrapper, which embeds this whole
        // string inside `FROM ( ... ) AS __daobrew_rows` — so it must be a single
        // statement (no semicolons) that is valid as a subquery body.
        assert.ok(!sql.includes(";"), `query SQL must be a single semicolon-free statement, got: ${sql}`);
        assert.ok(sql.startsWith(`SELECT __daobrew_scoped.* FROM (SELECT set_config('${GUC}', 'u1', true) AS uid) AS __daobrew_scope`), `query SQL must lead with the set_config scope subquery, got: ${sql}`);
        assert.ok(sql.includes("CROSS JOIN LATERAL"), "body must be laterally joined after the scope row");
        assert.ok(sql.includes("WHERE __daobrew_scope.uid IS NOT NULL"), "lateral body must reference the scope row to pin evaluation order");
        assert.ok(sql.includes("(SELECT id FROM graph_nodes ORDER BY id) AS __daobrew_body"), "original query must be embedded with its trailing semicolon stripped");
        assert.strictEqual(occurrences(sql, GUC), 1, "GUC prefix must appear exactly once");
        assert.strictEqual(occurrences(sql, "set_config"), 1, "set_config must appear exactly once");
        assert.strictEqual(result, rows, "scopedQuery must return the delegate's rows untouched");
    });
    (0, node_test_1.it)("sets the GUC transaction-locally (is_local = true) — nothing persists on the pooled session", async () => {
        // The single autocommit statement IS its own implicit transaction, so a
        // transaction-local set_config lives exactly as long as the lateral body
        // needs it and dies when the statement ends. A session-level set (false)
        // would persist the tenant GUC on the shared PgBouncer/Neon pool backend,
        // where a later UNSCOPED queryJson statement routed to the same backend
        // would run with a stale tenant scope.
        const captured = [];
        const query = (0, user_scope_js_1.scopedQuery)("u1", async (sql) => {
            captured.push(sql);
            return [];
        });
        await query("SELECT id FROM graph_nodes");
        const sql = captured[0];
        assert.ok(sql.includes(`set_config('${GUC}', 'u1', true)`), `scoped query must set the GUC transaction-locally, got: ${sql}`);
        assert.ok(!sql.includes(", false)"), `scoped query must not contain a session-level set_config, got: ${sql}`);
    });
    (0, node_test_1.it)("escapes a hostile userId so it stays inert inside a quoted literal", async () => {
        const captured = [];
        const query = (0, user_scope_js_1.scopedQuery)(HOSTILE_USER_ID, async (sql) => {
            captured.push(sql);
            return [];
        });
        await query("SELECT 1 AS one");
        const sql = captured[0];
        assert.ok(sql.includes(`set_config('${GUC}', ${HOSTILE_ESCAPED_LITERAL}, true)`), `hostile userId must be q()-escaped inside the literal, got: ${sql}`);
        assert.ok(!sql.includes("'bob';"), "unescaped quote break-out must not appear");
        // The payload's semicolons must all be inside the quoted literal: once
        // literals are stripped, the composed query is still semicolon-free.
        assert.ok(!outsideLiterals(sql).includes(";"), `hostile userId must not smuggle a statement boundary outside a literal, got: ${sql}`);
        assert.ok(!outsideLiterals(sql).includes("DROP TABLE"), "DROP TABLE payload must stay confined to the quoted literal");
    });
});
const WIRING_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
async function withWiredServer(fn) {
    const mod = graphDb;
    const realExec = mod.execSql;
    const realQuery = mod.queryJson;
    const savedToken = process.env.DAOBREW_INTERNAL_TOKEN;
    const savedStore = process.env.DAOBREW_GRAPH_STORE;
    const captured = { execs: [], queries: [] };
    mod.execSql = async (sql) => {
        captured.execs.push(sql);
    };
    mod.queryJson = async (sql) => {
        captured.queries.push(sql);
        return [];
    };
    delete process.env.DAOBREW_INTERNAL_TOKEN;
    // The layer-2 jobs are postgres-only; the transport is fully faked above,
    // so no real Postgres (local or Neon) is ever touched.
    process.env.DAOBREW_GRAPH_STORE = "postgres";
    (0, graph_db_js_1.__resetGraphDbConfigCacheForTests)();
    try {
        const post = async (path, body) => {
            const response = await (0, internal_server_harness_js_1.postInternal)(path, body);
            return {
                status: response.status,
                text: async () => response.text,
                json: async () => response.json,
            };
        };
        await fn(post, captured);
    }
    finally {
        mod.execSql = realExec;
        mod.queryJson = realQuery;
        if (savedToken === undefined)
            delete process.env.DAOBREW_INTERNAL_TOKEN;
        else
            process.env.DAOBREW_INTERNAL_TOKEN = savedToken;
        if (savedStore === undefined)
            delete process.env.DAOBREW_GRAPH_STORE;
        else
            process.env.DAOBREW_GRAPH_STORE = savedStore;
        (0, graph_db_js_1.__resetGraphDbConfigCacheForTests)();
    }
}
function assertAllScopedQueries(statements, label) {
    assert.ok(statements.length > 0, `${label}: at least one SQL statement must reach the transport`);
    for (const sql of statements) {
        // Query path: transaction-local set_config inside scopedQuery's single
        // lateral SELECT — the autocommit statement's implicit transaction scopes
        // it, so nothing persists on the pooled session afterwards.
        assert.ok(sql.includes(`set_config('${GUC}', '${WIRING_USER}', true)`), `${label}: every query must carry the lateral GUC scope for the request's userId, got: ${sql}`);
        assert.strictEqual(occurrences(sql, "set_config"), 1, `${label}: the GUC scope must appear exactly once per statement, got: ${sql}`);
    }
}
function assertAllScopedExecs(statements, label) {
    assert.ok(statements.length > 0, `${label}: at least one SQL statement must reach the transport`);
    for (const sql of statements) {
        // Exec path: one explicit transaction with a transaction-local GUC set
        // (pins one pooled backend; nothing persists past COMMIT).
        assert.ok(sql.startsWith("BEGIN;"), `${label}: every exec must open a transaction, got: ${sql}`);
        assert.ok(sql.trimEnd().endsWith("COMMIT;"), `${label}: every exec must commit, got: ${sql}`);
        assert.ok(sql.includes(`set_config('${GUC}', '${WIRING_USER}', true)`), `${label}: every exec must carry the transaction-local GUC for the request's userId, got: ${sql}`);
        assert.strictEqual(occurrences(sql, "set_config"), 1, `${label}: the GUC scope must appear exactly once per statement, got: ${sql}`);
    }
}
(0, node_test_1.describe)("entry-point wiring (internal-server handler path)", () => {
    (0, node_test_1.it)("/internal/layer2/nightly runs every statement through the request user's scope", async () => {
        await withWiredServer(async (post, captured) => {
            const leaseToken = "22222222-2222-4222-8222-222222222222";
            const response = await post("/internal/layer2/nightly", {
                userId: WIRING_USER,
                leaseToken,
            });
            assert.strictEqual(response.status, 200, `nightly handler must succeed, got ${await response.text()}`);
            assertAllScopedQueries(captured.queries, "nightly queries");
            assertAllScopedExecs(captured.execs, "nightly execs");
            assert.ok(captured.execs.length > 0, "nightly must attempt at least one lease-gated write");
            assert.ok(captured.execs.every((sql) => sql.includes("pg_advisory_xact_lock(1144153669)")
                && sql.includes(`lease_token = '${leaseToken}'`)
                && sql.includes(`user_id = '${WIRING_USER}'`)
                && sql.includes("lease_expires_at_ts >")
                && sql.indexOf("causal execution lease is not live") < sql.lastIndexOf("COMMIT;")), "every nightly write must prove the exact live lease inside its transaction");
            // The scope must be the caller's user, not a hardcoded default —
            // assertAllScopedQueries above pins the request userId inside every
            // query's set_config. The body itself must compare user_id against
            // the lateral scope row, NEVER the literal: a literal folds the RLS
            // qual into a One-Time Filter evaluated before set_config has run,
            // silently returning zero rows on a fresh pooled backend (F1).
            assert.ok(captured.queries.some((sql) => sql.includes("user_id = __daobrew_scope.uid")), "nightly reads must filter user_id via the scope row");
            assert.ok(!captured.queries.some((sql) => sql.includes(`user_id = '${WIRING_USER}'`)), "nightly reads must NOT compare user_id to a literal (One-Time-Filter fail-closed trap)");
        });
    });
    (0, node_test_1.it)("/internal/layer2/nightly preserves trusted unleased maintenance but rejects malformed capabilities", async () => {
        await withWiredServer(async (post, captured) => {
            const schedulerResponse = await post("/internal/layer2/nightly", {
                userId: WIRING_USER,
            });
            assert.strictEqual(schedulerResponse.status, 200);
            assert.ok(captured.execs.length > 0);
            assert.ok(captured.execs.every((sql) => !sql.includes("daobrew_causal_lease_guard")), "trusted scheduled maintenance without a lease keeps its existing idempotent path");
            captured.queries.length = 0;
            captured.execs.length = 0;
            const malformed = await post("/internal/layer2/nightly", {
                userId: WIRING_USER,
                leaseToken: "not-a-canonical-uuid",
            });
            assert.strictEqual(malformed.status, 400);
            assert.deepStrictEqual(captured.queries, []);
            assert.deepStrictEqual(captured.execs, []);
        });
    });
    (0, node_test_1.it)("/internal/layer2/snapshot runs every statement through the request user's scope", async () => {
        await withWiredServer(async (post, captured) => {
            const response = await post("/internal/layer2/snapshot", { userId: WIRING_USER });
            assert.strictEqual(response.status, 200, `snapshot handler must succeed, got ${await response.text()}`);
            assertAllScopedQueries(captured.queries, "snapshot queries");
            assertAllScopedExecs(captured.execs, "snapshot execs");
        });
    });
    (0, node_test_1.it)("/internal/transfer/priors stays UNSCOPED — cross-user aggregation by design", async () => {
        await withWiredServer(async (post, captured) => {
            const response = await post("/internal/transfer/priors", {});
            assert.strictEqual(response.status, 200, `priors handler must succeed, got ${await response.text()}`);
            const all = [...captured.queries, ...captured.execs];
            assert.ok(all.length > 0, "priors job must reach the transport");
            // Proof the job actually ran its real SQL (not a silent no-op)...
            assert.ok(captured.execs.some((sql) => /INSERT INTO pipeline_metrics/.test(sql)), "priors job must write its metrics row");
            // ...and none of it may be tenant-scoped: the GUC would filter the
            // anonymized annex aggregation down to one user under enforcement.
            for (const sql of all) {
                assert.ok(!sql.includes("set_config"), `priors SQL must never carry the GUC prefix, got: ${sql}`);
            }
        });
    });
});
// ---------------------------------------------------------------------------
// PG-gated live transport proof (gate idiom copied from run.test.ts).
// ---------------------------------------------------------------------------
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
/** psql against the compose fixture's default DB (for scratch-DB create/drop). */
function adminPsql(sql) {
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
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-U",
        process.env.DAOBREW_POSTGRES_USER || "daobrew",
        "-d",
        process.env.DAOBREW_POSTGRES_DB || "daobrew_local_truth",
        "-c",
        sql,
    ], { cwd: process.cwd(), stdio: "ignore" });
}
(0, node_test_1.describe)("user-scope live transport (postgres)", () => {
    (0, node_test_1.it)("GUC scope survives queryJson's JSON extraction and scopedExec's transaction wrapper", async (t) => {
        if (process.env.DAOBREW_ENABLE_POSTGRES_TESTS !== "1") {
            return t.skip("set DAOBREW_ENABLE_POSTGRES_TESTS=1 to exercise Docker Postgres");
        }
        if (!postgresRuntimePresent())
            return t.skip("Docker Postgres runtime is not available");
        const scratchDb = `user_scope_scratch_${process.pid}`;
        const previousEnv = {
            DAOBREW_GRAPH_STORE: process.env.DAOBREW_GRAPH_STORE,
            DAOBREW_POSTGRES_DB: process.env.DAOBREW_POSTGRES_DB,
            DAOBREW_POSTGRES_URL: process.env.DAOBREW_POSTGRES_URL,
            DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
        };
        adminPsql(`CREATE DATABASE ${scratchDb};`);
        try {
            // Route graph-db at the scratch DB via compose mode only — clearing the
            // URL env + pointing config at a nonexistent file guarantees no live
            // Neon connection can be touched by this test.
            process.env.DAOBREW_GRAPH_STORE = "postgres";
            process.env.DAOBREW_POSTGRES_DB = scratchDb;
            delete process.env.DAOBREW_POSTGRES_URL;
            process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-user-scope-test-config.json";
            (0, graph_db_js_1.__resetGraphDbConfigCacheForTests)();
            // 1. The core round-trip: the GUC set survives transport AND the JSON
            //    extraction in queryJson stays uncorrupted.
            const scoped = await (0, user_scope_js_1.scopedQuery)("u1")(`SELECT current_setting('${GUC}', true) AS uid`);
            assert.deepStrictEqual(scoped, [{ uid: "u1" }]);
            // 2. Request scoping: a fresh unscoped session sees no GUC (NULL).
            const unscoped = await (0, graph_db_js_1.queryJson)(`SELECT current_setting('${GUC}', true) AS uid`);
            assert.deepStrictEqual(unscoped, [{ uid: null }]);
            // 3. scopedExec: the transaction-local set_config (inside the BEGIN/
            //    COMMIT wrapper) is visible to the delegated DML in the same
            //    transaction — and, being is_local = true, gone after COMMIT.
            await (0, graph_db_js_1.execSql)("CREATE TABLE user_scope_probe (uid TEXT);");
            await (0, user_scope_js_1.scopedExec)("u2")(`INSERT INTO user_scope_probe (uid) VALUES (current_setting('${GUC}', true));`);
            const probe = await (0, graph_db_js_1.queryJson)("SELECT uid FROM user_scope_probe");
            assert.deepStrictEqual(probe, [{ uid: "u2" }]);
        }
        finally {
            for (const [key, value] of Object.entries(previousEnv)) {
                if (value === undefined)
                    delete process.env[key];
                else
                    process.env[key] = value;
            }
            (0, graph_db_js_1.__resetGraphDbConfigCacheForTests)();
            adminPsql(`DROP DATABASE IF EXISTS ${scratchDb} WITH (FORCE);`);
        }
    });
});
(0, node_test_1.describe)("scopedUserIdExpr (store-aware user_id comparison)", () => {
    function withGraphStore(kind, fn) {
        const previous = process.env.DAOBREW_GRAPH_STORE;
        process.env.DAOBREW_GRAPH_STORE = kind;
        try {
            return fn();
        }
        finally {
            if (previous === undefined)
                delete process.env.DAOBREW_GRAPH_STORE;
            else
                process.env.DAOBREW_GRAPH_STORE = previous;
        }
    }
    (0, node_test_1.it)("returns the lateral scope-row reference under postgres", () => {
        withGraphStore("postgres", () => {
            assert.strictEqual((0, user_scope_js_1.scopedUserIdExpr)("u1"), "__daobrew_scope.uid");
            // Never the literal: a constant lets the planner fold the RLS qual into
            // a One-Time Filter evaluated before set_config has run (F1).
            assert.ok(!(0, user_scope_js_1.scopedUserIdExpr)("u1").includes("'u1'"));
        });
    });
    (0, node_test_1.it)("returns the q()-escaped literal under sqlite (no scope row exists there)", () => {
        withGraphStore("sqlite", () => {
            assert.strictEqual((0, user_scope_js_1.scopedUserIdExpr)("u1"), "'u1'");
            assert.strictEqual((0, user_scope_js_1.scopedUserIdExpr)(HOSTILE_USER_ID), HOSTILE_ESCAPED_LITERAL);
        });
    });
});
