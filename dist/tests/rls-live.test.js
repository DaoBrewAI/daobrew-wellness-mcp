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
const node_path_1 = require("node:path");
const postgres_rls_js_1 = require("../src/engine/postgres-rls.js");
const user_scope_js_1 = require("../src/engine/user-scope.js");
const graph_db_js_1 = require("../src/graph-db.js");
/**
 * Live RLS isolation matrix (PG-gated).
 *
 * Everything runs on a scratch database + scratch app role on the local
 * compose fixture — created in the test, dropped in `finally`. The test env
 * clears DAOBREW_POSTGRES_URL and points DAOBREW_CONFIG_FILE at a nonexistent
 * path so graph-db's Neon-default URL fallback CANNOT fire: only the compose
 * container is ever touched.
 *
 * The matrix (each assertion executed AS THE NON-OWNER APP ROLE unless noted):
 *   1. No GUC        → zero rows visible; INSERT rejected (deny-by-default)
 *   2. GUC=tenant_a  → only tenant_a rows; cross-tenant UPDATE hits 0 rows;
 *                      INSERT with user_id='tenant_b' rejected by WITH CHECK
 *   3. transfer_records → SELECT + INSERT succeed with no GUC (annex exemption)
 *   4. population_priors → SELECT succeeds (global aggregate exemption)
 *   5. Owner connection still sees both tenants (ENABLE-not-FORCE bypass)
 *   6. Real scopedQuery() through graph-db's transport AS THE APP ROLE — pins
 *      the CROSS JOIN LATERAL set_config construction with policies active
 *      (the planner-ordering regression; see user-scope.ts transport notes).
 *
 * Assertion 6 works because the compose container authenticates local socket
 * connections with `trust`: pointing DAOBREW_POSTGRES_USER at the scratch role
 * routes graph-db's `docker compose exec psql -U <role>` transport through a
 * genuine non-BYPASSRLS session, no password required.
 */
// ---------------------------------------------------------------------------
// Gate + transport helpers (gate idiom copied from run.test.ts /
// user-scope.test.ts: env flag + docker runtime probe, self-skip otherwise).
// ---------------------------------------------------------------------------
/** Compose/owner coordinates snapshotted BEFORE the test mutates env. */
const COMPOSE_PROJECT = process.env.DAOBREW_POSTGRES_COMPOSE_PROJECT || "daobrewai";
const COMPOSE_FILE = process.env.DAOBREW_POSTGRES_COMPOSE_FILE || "../docker-compose.postgres.yml";
const COMPOSE_SERVICE = process.env.DAOBREW_POSTGRES_SERVICE || "postgres";
const OWNER_USER = process.env.DAOBREW_POSTGRES_USER || "daobrew";
const ADMIN_DB = process.env.DAOBREW_POSTGRES_DB || "daobrew_local_truth";
const OWNER_PASSWORD = process.env.DAOBREW_POSTGRES_PASSWORD || "daobrew_local_dev";
const POSTGRES_PORT = process.env.DAOBREW_POSTGRES_PORT || "54329";
function composePsqlArgs(user, db, extraPsqlArgs = []) {
    return [
        "compose",
        "-p",
        COMPOSE_PROJECT,
        "-f",
        COMPOSE_FILE,
        "exec",
        "-T",
        COMPOSE_SERVICE,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        ...extraPsqlArgs,
        "-U",
        user,
        "-d",
        db,
    ];
}
/**
 * Run SQL (possibly multi-statement) over stdin in ONE psql invocation ==
 * one Postgres session, mirroring graph-db's runPostgres transport. Returns
 * raw stdout (`-At`: tuples only, unaligned).
 */
function psqlAs(user, db, sql, extraPsqlArgs = []) {
    return (0, node_child_process_1.execFileSync)("docker", composePsqlArgs(user, db, extraPsqlArgs), {
        cwd: process.cwd(),
        encoding: "utf-8",
        input: sql,
        timeout: 30_000,
    });
}
/** Like psqlAs, but the SQL is EXPECTED to fail; returns psql's stderr. */
function psqlAsExpectFailure(user, db, sql) {
    try {
        psqlAs(user, db, sql);
    }
    catch (err) {
        return typeof err?.stderr === "string" ? err.stderr : String(err);
    }
    throw new Error(`expected psql failure but SQL succeeded:\n${sql}`);
}
/** Non-empty stdout lines (skips SET/SELECT-set_config echo parsing at call sites). */
function lines(stdout) {
    return stdout.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}
function postgresRuntimePresent() {
    try {
        (0, node_child_process_1.execFileSync)("docker", composePsqlArgs(OWNER_USER, ADMIN_DB, ["-c", "SELECT 1;"]), {
            cwd: process.cwd(),
            stdio: "ignore",
        });
        return true;
    }
    catch {
        return false;
    }
}
function alembicUpgradeHead(db) {
    (0, node_child_process_1.execFileSync)(process.env.DAOBREW_PYTHON_BIN || "python3", [
        "-m",
        "alembic",
        "upgrade",
        "head",
    ], {
        cwd: (0, node_path_1.resolve)(process.cwd(), ".."),
        env: {
            ...process.env,
            DATABASE_URL: `postgresql://${OWNER_USER}:${OWNER_PASSWORD}@localhost:${POSTGRES_PORT}/${db}`,
            DAOBREW_SKIP_DOTENV: "1",
        },
        stdio: "pipe",
        timeout: 60_000,
    });
}
// ---------------------------------------------------------------------------
// The matrix.
// ---------------------------------------------------------------------------
(0, node_test_1.describe)("RLS live isolation matrix (postgres)", () => {
    (0, node_test_1.it)("enforces deny-by-default per-tenant isolation for the app role", async (t) => {
        if (process.env.DAOBREW_ENABLE_POSTGRES_TESTS !== "1") {
            return t.skip("set DAOBREW_ENABLE_POSTGRES_TESTS=1 to exercise Docker Postgres");
        }
        if (!postgresRuntimePresent())
            return t.skip("Docker Postgres runtime is not available");
        const scratchDb = `rls_matrix_${process.pid}`;
        const appRole = `daobrew_app_matrix_${process.pid}`;
        // Local-fixture-only throwaway credential; socket auth is trust anyway.
        const appPassword = `matrix_pw_${process.pid}`;
        const setGuc = (userId) => `SELECT set_config('${postgres_rls_js_1.RLS_GUC}', '${userId}', false);`;
        const previousEnv = {
            DAOBREW_GRAPH_STORE: process.env.DAOBREW_GRAPH_STORE,
            DAOBREW_POSTGRES_DB: process.env.DAOBREW_POSTGRES_DB,
            DAOBREW_POSTGRES_USER: process.env.DAOBREW_POSTGRES_USER,
            DAOBREW_POSTGRES_URL: process.env.DAOBREW_POSTGRES_URL,
            DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
        };
        psqlAs(OWNER_USER, ADMIN_DB, `CREATE DATABASE ${scratchDb};`);
        try {
            // Route graph-db (owner transport) at the scratch DB via compose mode
            // only — clearing the URL env + pointing config at a nonexistent file
            // guarantees no operator Postgres environment can affect this test.
            process.env.DAOBREW_GRAPH_STORE = "postgres";
            process.env.DAOBREW_POSTGRES_DB = scratchDb;
            delete process.env.DAOBREW_POSTGRES_URL;
            process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-rls-live-test-config.json";
            (0, graph_db_js_1.__resetGraphDbConfigCacheForTests)();
            // --- Setup as owner: Alembic schema + scratch app role + fixtures. ---
            alembicUpgradeHead(scratchDb);
            psqlAs(OWNER_USER, scratchDb, `DROP ROLE IF EXISTS ${appRole};`);
            psqlAs(OWNER_USER, scratchDb, (0, postgres_rls_js_1.appRoleProvisionSql)(appRole), [
                "-v",
                `app_password=${appPassword}`,
            ]);
            await (0, graph_db_js_1.execSql)(`
        INSERT INTO graph_nodes (id, user_id, kind, title, created_at_ts) VALUES
          ('node_a1', 'tenant_a', 'pattern', 'tenant_a node one', 100),
          ('node_a2', 'tenant_a', 'pattern', 'tenant_a node two', 101),
          ('node_b1', 'tenant_b', 'pattern', 'tenant_b node one', 102);
        INSERT INTO causal_memory_threads
          (id, user_id, thread_key, title, claim_level, created_at_ts, updated_at_ts) VALUES
          ('thread_a1', 'tenant_a', 'key_a', 'tenant_a thread', 'correlation', 100, 100),
          ('thread_b1', 'tenant_b', 'key_b', 'tenant_b thread', 'correlation', 100, 100);
        INSERT INTO transfer_records (id, contributor_hash, trigger_text, outcome, created_at_ts)
          VALUES ('transfer_1', 'contrib_hash_1', 'late-night overdrive spiral', 'worked', 100);
        INSERT INTO population_priors (id, cohort_key, stress_pattern, version, created_at_ts)
          VALUES ('prior_1', 'cohort_default', 'overdrive', 1, 100);
      `);
            // Sanity: the matrix below runs as a genuinely non-bypass role.
            assert.deepStrictEqual(lines(psqlAs(appRole, scratchDb, "SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user);")), [`${appRole}|f`], "matrix must run as the non-BYPASSRLS scratch role");
            // --- 1. No GUC → deny-by-default: zero rows, no writes. --------------
            await t.test("1: unscoped app-role session sees nothing and writes nothing", () => {
                assert.deepStrictEqual(lines(psqlAs(appRole, scratchDb, "SELECT count(*) FROM graph_nodes;")), ["0"], "unscoped session must see zero graph_nodes");
                assert.deepStrictEqual(lines(psqlAs(appRole, scratchDb, "SELECT count(*) FROM causal_memory_threads;")), ["0"], "unscoped session must see zero causal_memory_threads");
                const err = psqlAsExpectFailure(appRole, scratchDb, `INSERT INTO graph_nodes (id, user_id, kind, title, created_at_ts)
             VALUES ('smuggled_unscoped', 'tenant_a', 'pattern', 'x', 1);`);
                assert.match(err, /new row violates row-level security policy/, `unscoped INSERT must be rejected by RLS, got: ${err}`);
            });
            // --- 2. GUC = tenant_a → sees only tenant_a; cannot touch tenant_b. --
            await t.test("2: tenant_a-scoped session is isolated from tenant_b", () => {
                const counts = lines(psqlAs(appRole, scratchDb, `${setGuc("tenant_a")}
           SELECT count(*) FROM graph_nodes;
           SELECT count(*) FROM causal_memory_threads;
           SELECT count(*) FROM graph_nodes WHERE user_id = 'tenant_b';
           SELECT id FROM graph_nodes ORDER BY id;`));
                assert.deepStrictEqual(counts, ["tenant_a", "2", "1", "0", "node_a1", "node_a2"], "tenant_a session must see exactly the tenant_a fixtures and no tenant_b rows");
                // Cross-tenant UPDATE: policy filters tenant_b rows out of the target
                // set entirely, so the statement reports UPDATE 0.
                const updateOut = psqlAs(appRole, scratchDb, `${setGuc("tenant_a")}
           UPDATE graph_nodes SET title = 'hacked by tenant_a' WHERE user_id = 'tenant_b';`);
                assert.match(updateOut, /UPDATE 0/, `cross-tenant UPDATE must affect 0 rows, got: ${updateOut}`);
                // Cross-tenant INSERT: WITH CHECK rejects a row whose user_id is not
                // the session tenant.
                const err = psqlAsExpectFailure(appRole, scratchDb, `${setGuc("tenant_a")}
           INSERT INTO graph_nodes (id, user_id, kind, title, created_at_ts)
             VALUES ('smuggled_cross', 'tenant_b', 'pattern', 'x', 1);`);
                assert.match(err, /new row violates row-level security policy/, `cross-tenant INSERT must be rejected by WITH CHECK, got: ${err}`);
                // Positive control: a correctly-scoped write SUCCEEDS — the denials
                // above are RLS decisions, not missing table grants.
                psqlAs(appRole, scratchDb, `${setGuc("tenant_a")}
           INSERT INTO graph_nodes (id, user_id, kind, title, created_at_ts)
             VALUES ('node_a3', 'tenant_a', 'pattern', 'tenant_a node three', 103);`);
                assert.deepStrictEqual(lines(psqlAs(appRole, scratchDb, `${setGuc("tenant_a")} SELECT count(*) FROM graph_nodes;`)), ["tenant_a", "3"], "properly scoped INSERT must land (grants intact, isolation is policy-driven)");
            });
            // --- 3. transfer_records: annex exemption (no user_id BY DESIGN). ----
            await t.test("3: transfer_records annex is readable/writable without a GUC", () => {
                assert.deepStrictEqual(lines(psqlAs(appRole, scratchDb, "SELECT count(*) FROM transfer_records;")), ["1"], "annex must be readable with no GUC set");
                psqlAs(appRole, scratchDb, `INSERT INTO transfer_records (id, contributor_hash, trigger_text, outcome, created_at_ts)
             VALUES ('transfer_2', 'contrib_hash_2', 'meeting overload', 'worked', 101);`);
                assert.deepStrictEqual(lines(psqlAs(appRole, scratchDb, "SELECT count(*) FROM transfer_records;")), ["2"], "annex must accept writes with no GUC set");
            });
            // --- 4. population_priors: global aggregate exemption. ---------------
            await t.test("4: population_priors are readable without a GUC", () => {
                assert.deepStrictEqual(lines(psqlAs(appRole, scratchDb, "SELECT count(*) FROM population_priors;")), ["1"], "global priors must be readable with no GUC set");
            });
            // --- 5. Owner bypass intact (ENABLE, not FORCE). ----------------------
            await t.test("5: owner connection still sees every tenant's rows", async () => {
                const ownerCounts = await (0, graph_db_js_1.queryJson)(`SELECT
             (SELECT count(*) FROM graph_nodes) AS total,
             (SELECT count(*) FROM graph_nodes WHERE user_id = 'tenant_a') AS a,
             (SELECT count(*) FROM graph_nodes WHERE user_id = 'tenant_b') AS b`);
                assert.deepStrictEqual(ownerCounts, [{ total: 4, a: 3, b: 1 }], "owner must bypass RLS and see all rows of both tenants");
                const untouched = await (0, graph_db_js_1.queryJson)("SELECT title FROM graph_nodes WHERE id = 'node_b1'");
                assert.deepStrictEqual(untouched, [{ title: "tenant_b node one" }], "tenant_b's row must be untouched by the blocked cross-tenant UPDATE");
            });
            // --- 6. BONUS: real scopedQuery through the app-role transport. ------
            // Pins the CROSS JOIN LATERAL set_config construction WITH POLICIES
            // ACTIVE: graph-db's compose transport is pointed at the scratch role
            // (socket auth is trust), so this is the genuine user-scope module on a
            // genuine non-BYPASSRLS session — the in-repo regression for the
            // planner-ordering question. Equality (not just no-leak) also proves
            // set_config ran BEFORE the RLS quals read the GUC; if the planner ever
            // reorders, the construction fails closed to [] and this test fails.
            await t.test("6: scopedQuery returns exactly the scoped tenant's rows with policies active", async () => {
                process.env.DAOBREW_POSTGRES_USER = appRole;
                try {
                    const who = await (0, graph_db_js_1.queryJson)("SELECT current_user AS cu");
                    assert.deepStrictEqual(who, [{ cu: appRole }], "transport must run as the scratch app role");
                    const unscoped = await (0, graph_db_js_1.queryJson)("SELECT id FROM graph_nodes ORDER BY id");
                    assert.deepStrictEqual(unscoped, [], "unscoped queryJson as app role must see zero rows");
                    const tenantA = await (0, user_scope_js_1.scopedQuery)("tenant_a")("SELECT id, user_id FROM graph_nodes ORDER BY id");
                    assert.deepStrictEqual(tenantA, [
                        { id: "node_a1", user_id: "tenant_a" },
                        { id: "node_a2", user_id: "tenant_a" },
                        { id: "node_a3", user_id: "tenant_a" },
                    ], "scopedQuery('tenant_a') must return exactly tenant_a's rows");
                    const tenantB = await (0, user_scope_js_1.scopedQuery)("tenant_b")("SELECT id, user_id FROM graph_nodes ORDER BY id");
                    assert.deepStrictEqual(tenantB, [{ id: "node_b1", user_id: "tenant_b" }], "scopedQuery('tenant_b') must return exactly tenant_b's rows");
                }
                finally {
                    if (previousEnv.DAOBREW_POSTGRES_USER === undefined)
                        delete process.env.DAOBREW_POSTGRES_USER;
                    else
                        process.env.DAOBREW_POSTGRES_USER = previousEnv.DAOBREW_POSTGRES_USER;
                }
            });
        }
        finally {
            for (const [key, value] of Object.entries(previousEnv)) {
                if (value === undefined)
                    delete process.env[key];
                else
                    process.env[key] = value;
            }
            (0, graph_db_js_1.__resetGraphDbConfigCacheForTests)();
            psqlAs(OWNER_USER, ADMIN_DB, `DROP DATABASE IF EXISTS ${scratchDb} WITH (FORCE);`);
            psqlAs(OWNER_USER, ADMIN_DB, `DROP ROLE IF EXISTS ${appRole};`);
        }
    });
});
