/**
 * Row-level security metadata + app-role provisioning for the shared warm tier.
 *
 * Enforcement model
 * -----------------
 * RLS is `ENABLE`d — never `FORCE`d — on every table, so the table OWNER
 * (neondb_owner / the bootstrap role) bypasses all policies. That is
 * deliberate: bootstrap, migrations, and sync scripts keep working unchanged,
 * and today's runtime (which still connects as the owner) is unaffected.
 * Enforcement begins only when a connection uses the non-owner application
 * role (`daobrew_app`, created LOGIN NOSUPERUSER NOBYPASSRLS by
 * {@link appRoleProvisionSql}) — i.e. when the runtime URL is deliberately
 * swapped to the app-role credentials. The shared table/policy DDL itself is
 * owned by Alembic, not this runtime package.
 *
 * User-scoped tables carry a single ALL-verb policy keyed on the session GUC
 * {@link RLS_GUC}: `user_id = current_setting('app.daobrew_user_id', true)`.
 * With the GUC unset, `current_setting(..., true)` returns NULL, the
 * comparison is never true, and the app role sees zero rows and can write
 * nothing — deny-by-default, with NO fallback-to-permissive on any
 * user-scoped table.
 *
 * Explicitly permissive tables (USING (true) / WITH CHECK (true)):
 * - `transfer_records`: the anonymized transfer annex has no user_id BY
 *   DESIGN — cross-user read/write is its purpose (contributor_hash + k-anon
 *   are enforced at the app layer). Enabling RLS with an explicit permissive
 *   policy documents that intent and makes future tightening a policy edit.
 * - `population_priors`: global cross-user aggregates, readable by every
 *   scoped session and written by the cross-user priors job.
 * - `pipeline_metrics`: operational job telemetry with no user dimension.
 */
/** Session GUC carrying the tenant id; policies read it with `current_setting(..., true)`. */
export declare const RLS_GUC = "app.daobrew_user_id";
/** Tables whose rows belong to exactly one user (all have a user_id column). */
export declare const USER_SCOPED_TABLES: readonly ["graph_nodes", "graph_edges", "events", "meeting_notes", "user_insights", "insight_lifecycle_decisions", "transfer_consent", "user_vectors", "causal_memory_threads", "causal_thread_evidence", "user_model_snapshots", "thread_verifications", "intervention_assignments"];
/** Cross-user-by-design tables: anonymized annex + global aggregates/ops (see module doc). */
export declare const PERMISSIVE_TABLES: readonly ["pipeline_metrics", "transfer_records", "population_priors"];
/**
 * SQL to provision the non-owner application role. The password is a psql
 * variable placeholder (`:'app_password'`) — supply it at apply time via
 * `psql -v app_password="$DAOBREW_APP_ROLE_PASSWORD"`; a literal password
 * never appears in generated SQL, argv, or logs.
 */
export declare function appRoleProvisionSql(roleName: string): string;
