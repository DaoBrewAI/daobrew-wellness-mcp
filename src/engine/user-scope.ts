import { execSql, graphStoreKind, queryJson, q } from "../graph-db.js";
import { RLS_GUC } from "./postgres-rls.js";

/**
 * User-scoped SQL executors for Postgres row-level security.
 *
 * RLS policies filter on the GUC `app.daobrew_user_id` (see postgres-rls.ts).
 * Every graph-db execSql/queryJson invocation is a fresh psql subprocess, but
 * production connects through Neon's POOLED endpoint (PgBouncer transaction
 * mode): each top-level transaction may be routed to a DIFFERENT shared
 * backend process. The set_config and the SQL that relies on it must
 * therefore ride ONE transaction — a session-level GUC set in a separate
 * autocommit statement can land on a different backend than the statements
 * after it, and whatever it does set persists on a backend other tenants
 * will reuse. Both paths therefore set the GUC transaction-locally
 * (is_local = true): the setting dies with its transaction, so nothing ever
 * persists on the shared pool backend for a later UNSCOPED statement (or
 * another tenant's) to inherit.
 *
 * Transport notes (why exec and query compose differently):
 *
 * - execSql ignores stdout, so scopedExec composes the delegated SQL into a
 *   single explicit transaction:
 *     BEGIN; SELECT set_config(GUC, uid, true); <delegated sql>; COMMIT;
 *   Transaction pooling pins the whole script to one backend, so the GUC is
 *   guaranteed visible to the delegated DML, and is_local = true makes it
 *   die at COMMIT — nothing leaks onto the shared pool backend. Atomicity
 *   is part of the contract: psql runs with ON_ERROR_STOP=1, so any
 *   statement error aborts psql with the transaction still open and the
 *   WHOLE delegated batch rolls back (no partial writes). Delegated SQL
 *   must NOT carry its own top-level BEGIN/COMMIT — a nested COMMIT would
 *   end the scope transaction early (see upsert.ts, which relies on
 *   scopedExec for its transaction in postgres mode).
 *
 * - queryJson (postgres mode) embeds the ENTIRE sql string inside
 *   `SELECT COALESCE(jsonb_agg(...)) FROM ( <sql> ) AS __daobrew_rows;`
 *   and JSON.parses psql's raw stdout. A statement prefix would be a syntax
 *   error inside those parens — and even without the wrapper, a leading `SET`
 *   command tag or a set_config result row on stdout would corrupt the JSON
 *   parse. So the scope must live INSIDE a single SELECT: set_config runs in
 *   a one-row scope subquery, and the caller's query is CROSS JOIN LATERAL'd
 *   after it with a WHERE that references the scope row. is_local = true is
 *   sufficient here even without an explicit BEGIN: an autocommit statement
 *   runs inside its own implicit transaction, so the transaction-local
 *   setting is visible to the whole lateral body (same statement, same
 *   transaction) and vanishes the moment the statement completes — exactly
 *   the lifetime the scope needs. The lateral
 *   reference biases the planner into a nested loop with the scope row on
 *   the outer side (set_config is VOLATILE + parallel-unsafe, which also
 *   blocks pull-up and parallel workers) — and if the planner ever deviates,
 *   the construction FAILS CLOSED: an RLS qual reading current_setting()
 *   before set_config ran sees NULL and denies, so the worst case is missing
 *   rows, never cross-tenant leakage. The RLS-active ordering is pinned by
 *   the live isolation matrix in tests/rls-live.test.ts.
 */

/** Standard injected-executor shapes used across engine/transfer/memory modules. */
export type Exec = (sql: string) => Promise<void>;
export type Query = (sql: string) => Promise<Record<string, any>[]>;

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
function setConfigCall(userId: string, isLocal: boolean): string {
  return `set_config('${RLS_GUC}', ${q(userId)}, ${isLocal})`;
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
export const SCOPED_USER_ID_SQL = "__daobrew_scope.uid";

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
export function scopedUserIdExpr(userId: string): string {
  return graphStoreKind() === "postgres" ? SCOPED_USER_ID_SQL : q(userId);
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
export function scopedExec(userId: string, exec: Exec = execSql): Exec {
  return (sql) => {
    const body = sql.trim().replace(/;+\s*$/, "");
    return exec(
      ["BEGIN;", `SELECT ${setConfigCall(userId, true)};`, body, ";", "COMMIT;"].join("\n"),
    );
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
export function causalLeaseScopedExec(
  userId: string,
  leaseToken: string,
  exec: Exec = execSql,
): Exec {
  const user = q(userId);
  const lease = q(leaseToken);
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
export function scopedQuery(userId: string, query: Query = queryJson): Query {
  return (sql) => {
    const body = sql.trim().replace(/;+\s*$/, "");
    return query(
      `SELECT __daobrew_scoped.* ` +
        `FROM (SELECT ${setConfigCall(userId, true)} AS uid) AS __daobrew_scope ` +
        `CROSS JOIN LATERAL (` +
        `SELECT __daobrew_body.* FROM (${body}) AS __daobrew_body ` +
        `WHERE __daobrew_scope.uid IS NOT NULL` +
        `) AS __daobrew_scoped`,
    );
  };
}
