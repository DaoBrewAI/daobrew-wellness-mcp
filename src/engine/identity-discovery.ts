import { queryJson, q } from "../graph-db.js";
import { canonicalUserId } from "../user-id.js";

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

const DEFAULT_WINDOW_DAYS = 30;
const SECONDS_PER_DAY = 86_400;
/** Backend-owned biometric tables (probe-guarded — absence is tolerated). */
const BACKEND_TABLES = ["intraday_state", "health_samples"] as const;

/**
 * Collapse a set of raw user_ids to canonical UUID anchors. Empty, local,
 * api-key, and non-UUID legacy ids are dropped. Deterministic (sorted) output.
 */
export function canonicalIdentities(rawIds: Iterable<string>): string[] {
  const result = new Set<string>();
  for (const id of rawIds) {
    const canonical = canonicalUserId(id);
    if (canonical) result.add(canonical);
  }
  return [...result].sort();
}

export async function discoverActiveIdentities(
  options: DiscoverIdentitiesOptions = {},
): Promise<string[]> {
  const query: SqlExecutor = options.query ?? ((sql) => queryJson(sql));
  const nowTs = options.nowTs ?? Math.floor(Date.now() / 1000);
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const cutoffTs = nowTs - windowDays * SECONDS_PER_DAY;

  const raw = new Set<string>();

  // Probe backend tables — absent on dev machines pointing graph-db at a local
  // compose PG (same guard biometricsDb uses); missing tables contribute
  // nothing rather than erroring the whole discovery.
  const probe = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${BACKEND_TABLES.map((t) => q(t)).join(", ")});`,
  );
  const present = new Set(probe.map((row) => row.table_name));

  if (present.has("intraday_state")) {
    const rows = await query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM intraday_state WHERE bucket_ts >= ${cutoffTs} AND user_id IS NOT NULL;`,
    );
    for (const row of rows) if (row.user_id) raw.add(String(row.user_id));
  }
  if (present.has("health_samples")) {
    const rows = await query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM health_samples WHERE start_time_ts >= ${cutoffTs} AND user_id IS NOT NULL;`,
    );
    for (const row of rows) if (row.user_id) raw.add(String(row.user_id));
  }

  // Engine-owned activity: user_insights.created_at_ts (NOT NULL — ingest time).
  // This table is RLS-managed, but the owner runtime bypasses policies, so plain
  // queryJson surfaces every user's rows.
  const insightRows = await query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM user_insights WHERE created_at_ts >= ${cutoffTs} AND user_id IS NOT NULL;`,
  );
  for (const row of insightRows) if (row.user_id) raw.add(String(row.user_id));

  return canonicalIdentities(raw);
}
