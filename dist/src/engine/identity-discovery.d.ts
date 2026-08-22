/**
 * Multi-user identity discovery for the shared cloud instance.
 *
 * Discovers every ACTIVE principal in the data over a recent window, so a
 * per-user job (layer2 nightly/snapshot) can iterate ALL identities instead of
 * a single configured user. Sources: the backend-owned biometric tables the
 * engine already reads directly (intraday_state/health_samples — outside
 * scopedQuery) UNION the engine-owned user_insights activity.
 *
 * Scoping: runs on the PLAIN graph-db executor (queryJson), NEVER scopedQuery.
 * RLS is ENABLEd-not-FORCEd and today's runtime connects as the table owner,
 * which bypasses policies (see postgres-rls.ts) — so plain queryJson sees every
 * user's rows, exactly like runTransferPriorsJob's cross-user reads. A
 * scopedQuery here would set the GUC and fail-closed to a single user. There is
 * no user_id literal comparison (DISTINCT over the whole table), so the RLS
 * RULE (no literals inside scoped bodies) does not apply — there is nothing to
 * constant-fold.
 *
 * Identity dedupe: only canonical UUID anchors are runnable principals. Legacy
 * api-key/device buckets are folded into UUID anchors by merge-on-claim or the
 * explicit remerge operator path, not kept live by all-user readers.
 */
export type SqlExecutor = <T = Record<string, any>>(sql: string) => Promise<T[]>;
export interface DiscoverIdentitiesOptions {
    /** Injectable plain executor; defaults to graph-db queryJson (owner path). */
    query?: SqlExecutor;
    /** Unix seconds anchor for the recent window; defaults to now. */
    nowTs?: number;
    /** How many days back counts as "active"; default 30. */
    windowDays?: number;
}
/**
 * Collapse a set of raw user_ids to canonical UUID anchors. Empty, local,
 * api-key, and non-UUID legacy ids are dropped. Deterministic (sorted) output.
 */
export declare function canonicalIdentities(rawIds: Iterable<string>): string[];
export declare function discoverActiveIdentities(options?: DiscoverIdentitiesOptions): Promise<string[]>;
