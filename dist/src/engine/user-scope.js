"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCOPED_USER_ID_SQL = void 0;
exports.scopedUserIdExpr = scopedUserIdExpr;
exports.scopedExec = scopedExec;
exports.causalLeaseScopedExec = causalLeaseScopedExec;
exports.scopedQuery = scopedQuery;
const graph_db_js_1 = require("../graph-db.js");
const postgres_rls_js_1 = require("./postgres-rls.js");
// Must match daobrew_backend.database.operations and engine/upsert.ts. The
// public API's reserve/renew/finalize operations and every lease-gated Layer 2
// write serialize on this database-owned lock.
const CAUSAL_EXECUTION_ADVISORY_LOCK_KEY = 1_144_153_669;
/**
 * `set_config('app.daobrew_user_id', '<escaped userId>', <isLocal>)`.
 * BOTH callers pass isLocal = true — the GUC is always transaction-local:
 * - scopedExec: set inside its explicit BEGIN/COMMIT, dies at COMMIT.
 * - scopedQuery: set inside its single autocommit SELECT, whose implicit
 *   transaction IS the statement — visible to the lateral body, gone when
 *   the statement ends. Session-level (false) would persist the tenant GUC
 *   on the shared PgBouncer/Neon pool backend, where a later UNSCOPED
 *   queryJson statement routed there would run with a stale tenant scope.
 * The parameter stays explicit so the composed SQL shape is pinned at each
 * call site (and by the shape tests).
 */
function setConfigCall(userId, isLocal) {
    return `set_config('${postgres_rls_js_1.RLS_GUC}', ${(0, graph_db_js_1.q)(userId)}, ${isLocal})`;
}
/**
 * SQL expression for the scoped user id INSIDE a scopedQuery body — the
 * lateral scope row's set_config return value. Body SQL that must filter on
 * the user MUST compare against THIS expression, never against a userId
 * literal: a literal lets the planner fold the RLS qual into a One-Time
 * Filter (`current_setting(GUC) = '<literal>'`) that is evaluated at
 * executor startup, BEFORE the scope row has run set_config. On a fresh
 * pooled backend (Neon autosuspend recycles them) the GUC is unset there,
 * so the whole query silently returns zero rows — fail-closed by design,
 * but fatal for read-compare-write flows (F1: the ingest dedup read-back
 * returned empty, every row took the INSERT path, and the first unchanged
 * old-scheme row hit ux_user_insights_dedup). Referencing the scope row
 * keeps the filter a join qual the planner cannot constant-fold, and pins
 * the set_config-before-scan ordering via the lateral dependency.
 */
exports.SCOPED_USER_ID_SQL = "__daobrew_scope.uid";
/**
 * Store-aware user_id comparison expression for DUAL-MODE query bodies —
 * SQL composed by modules that run through scopedQuery under Postgres but
 * through the PLAIN queryJson executor under SQLite (signal readers,
 * semantic stage-1, upsert's internal reads, consent). Under Postgres the
 * body must compare against the lateral scope row (SCOPED_USER_ID_SQL) —
 * a userId literal folds into the One-Time-Filter fail-closed trap
 * documented above. Under SQLite no scope wrapper exists (set_config is
 * invalid SQLite), so `__daobrew_scope.uid` would be an unknown-column
 * error; the q()-escaped literal is correct there and must be preserved.
 * Postgres-ONLY call paths whose SQL always runs inside scopedQuery should
 * use the SCOPED_USER_ID_SQL constant directly instead.
 * Note the userId argument is consumed only by the SQLite branch — under
 * Postgres, scoping is entirely the executor's job (scopedQuery sets the
 * GUC the scope row carries).
 */
function scopedUserIdExpr(userId) {
    return (0, graph_db_js_1.graphStoreKind)() === "postgres" ? exports.SCOPED_USER_ID_SQL : (0, graph_db_js_1.q)(userId);
}
/**
 * Exec that runs the delegated SQL inside ONE explicit transaction with the
 * RLS GUC set transaction-locally (see transport notes): pooler-safe (one
 * transaction == one backend), leak-free (the GUC dies at COMMIT), and
 * atomic under ON_ERROR_STOP=1 (any error rolls back the whole batch).
 * Trailing semicolons on the delegated SQL are stripped and a terminator is
 * re-appended on its own line — immune to a trailing `--` line comment — so
 * COMMIT can never fuse with the last delegated statement.
 * The delegated SQL must not carry its own top-level BEGIN/COMMIT.
 * The set_config result row on stdout is harmless — execSql discards output.
 */
function scopedExec(userId, exec = graph_db_js_1.execSql) {
    return (sql) => {
        const body = sql.trim().replace(/;+\s*$/, "");
        return exec(["BEGIN;", `SELECT ${setConfigCall(userId, true)};`, body, ";", "COMMIT;"].join("\n"));
    };
}
/**
 * User-scoped executor whose every delegated write also proves ownership of
 * one exact, live causal execution lease in the SAME transaction.
 *
 * This is used by the legacy causal-refresh -> Layer 2 nightly route. The
 * Python HTTP client can time out while Node continues executing; finalize
 * acquires the same advisory lock before deleting the lease. Therefore a
 * write already inside this guard finishes before finalize, and every later
 * write fails after finalize/replacement. A timed-out invocation can never
 * overlap writes with its retry even though closing the HTTP socket cannot
 * cancel JavaScript work already running on the engine.
 */
function causalLeaseScopedExec(userId, leaseToken, exec = graph_db_js_1.execSql) {
    const user = (0, graph_db_js_1.q)(userId);
    const lease = (0, graph_db_js_1.q)(leaseToken);
    const scoped = scopedExec(userId, exec);
    return (sql) => scoped(`
DO $daobrew_causal_lease_guard$
BEGIN
  PERFORM pg_advisory_xact_lock(${CAUSAL_EXECUTION_ADVISORY_LOCK_KEY});
  PERFORM 1
    FROM causal_execution_leases
   WHERE user_id = ${user}
     AND lease_token = ${lease}
     AND committed_generation_id IS NULL
     AND lease_expires_at_ts >
         floor(extract(epoch from clock_timestamp()))::bigint
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'causal execution lease is not live'
      USING ERRCODE = '55000';
  END IF;
END
$daobrew_causal_lease_guard$;
${sql}`);
}
/**
 * Query that runs the delegated SELECT with the RLS GUC set first, composed
 * as a single semicolon-free statement so it survives queryJson's
 * jsonQuerySql subquery wrapper (see transport notes above). The GUC is set
 * transaction-locally: the statement's implicit transaction scopes it, so
 * the lateral body sees it and nothing persists on the pooled session
 * afterwards. Trailing semicolons on the delegated SQL are stripped,
 * mirroring jsonQuerySql.
 */
function scopedQuery(userId, query = graph_db_js_1.queryJson) {
    return (sql) => {
        const body = sql.trim().replace(/;+\s*$/, "");
        return query(`SELECT __daobrew_scoped.* ` +
            `FROM (SELECT ${setConfigCall(userId, true)} AS uid) AS __daobrew_scope ` +
            `CROSS JOIN LATERAL (` +
            `SELECT __daobrew_body.* FROM (${body}) AS __daobrew_body ` +
            `WHERE __daobrew_scope.uid IS NOT NULL` +
            `) AS __daobrew_scoped`);
    };
}
