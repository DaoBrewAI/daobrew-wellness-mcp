import { GraphStoreKind, graphStoreKind, q, queryJson } from "../../graph-db.js";
import type { MetricBaseline } from "../reasoner/biometric-endorsement.js";
import {
  BiometricMetricSeries,
  BiometricsClient,
  BiometricsSignalOptions,
  BiometricsSignals,
  DEFAULT_BIOMETRIC_METRICS,
  StateSignal,
  readBiometricSignals,
} from "./biometrics.js";

/**
 * The direct read augments the shared BiometricsSignals shape with 30-day
 * per-metric baselines (design 2026-07-07). The shared type stays untouched;
 * callers that don't care ignore the extra field. The HTTP path also populates
 * baselines now (from a month-range fetch — see readBiometricSignals, D-16); it
 * still degrades gracefully to an empty list (endorsement falls back to
 * absolute-only) when no baselines can be computed.
 */
export interface BiometricsSignalsWithBaselines extends BiometricsSignals {
  baselines?: MetricBaseline[];
}

/** Days of history the per-metric baseline aggregates over. */
const BASELINE_WINDOW_DAYS = 30;
/** health_samples.start_time_ts is UNIX SECONDS in this table. */
const SECONDS_PER_DAY = 86_400;

/**
 * Direct Neon/Postgres biometrics source.
 *
 * The deployed backend writes its biometric tables (intraday_state,
 * health_samples) into the SAME warm-tier database the engine already reaches
 * through graph-db's server/operator environment URL mode. Reading them directly by
 * user_id sidesteps the backend HTTP API's windowing/identity quirks that
 * live-verified starved the reasoner (/state/history returned zero buckets
 * for a window Neon holds continuous 12h buckets for).
 *
 * Identity: rows are read under the resolved UUID anchor only. Historical
 * `apikey:` and raw device buckets are folded into that anchor by merge-on-claim
 * and the explicit remerge path; normal readers do not keep those legacy buckets
 * live.
 *
 * Scoping: these reads run through the plain graph-db executor, NOT
 * scopedQuery. The backend tables are backend-owned (no engine RLS policies)
 * and their in-table identity is the canonical UUID anchor.
 *
 */

/** Same executor shape graph-db exports; injectable for tests. */
export type SqlExecutor = <T = Record<string, any>>(sql: string) => Promise<T[]>;

export type BiometricSource = "neon-direct" | "api" | "none";

/** Mirrors run.ts RANGE_WINDOW_SEC — the backend resolves range strings
 *  relative to now; unknown ranges fall back to week. */
const RANGE_WINDOW_SEC: Record<string, number> = {
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
  year: 365 * 86400,
};

const BACKEND_TABLES = ["intraday_state", "health_samples"] as const;

interface StateRow {
  bucket_ts: number;
  yin_score: number;
  yang_score: number;
  category: string;
  source_quality: string;
  updated_at_ts: number;
}

interface SampleRow {
  metric_type: string;
  value: number;
  start_time_ts: number;
}

export interface DirectBiometricsOptions extends BiometricsSignalOptions {
  userId: string;
  /** Injectable executor; defaults to graph-db queryJson (call-time resolved). */
  query?: SqlExecutor;
  /** Injectable clock for the now-anchored sample window; unix seconds. */
  nowTs?: number;
}

function identityList(identities: readonly string[]): string {
  return identities.map((identity) => q(identity)).join(", ");
}

export async function readBiometricSignalsFromDb(
  options: DirectBiometricsOptions,
): Promise<BiometricsSignalsWithBaselines> {
  const query: SqlExecutor = options.query ?? ((sql) => queryJson(sql));
  const userId = options.userId;
  const metrics = options.metrics ?? DEFAULT_BIOMETRIC_METRICS;
  const range = options.range ?? "week";
  const stateLimit = Math.max(1, Math.trunc(options.stateLimit ?? 24));
  const nowTs = options.nowTs ?? Math.floor(Date.now() / 1000);

  // Schema probe: dev machines pointing graph-db at a local compose PG have
  // the engine tables but not the backend's. Absent tables must route to the
  // API fallback, not read as "user has no biometrics".
  const probe = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${BACKEND_TABLES.map((t) => q(t)).join(", ")});`,
  );
  const present = new Set(probe.map((row) => row.table_name));
  const missing = BACKEND_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`backend biometric tables absent from graph store: ${missing.join(", ")}`);
  }

  const identities = [userId];

  // States. Bounded (replay) reads take the whole window — the HTTP path's
  // chunked pagination exists only to defeat per-request limits, so
  // stateChunkDays is irrelevant here. Unbounded reads mirror the API's
  // "most recent N buckets" (over-fetched by the identity count: the same
  // bucket may exist under every identity form and dedupe must not eat
  // into the cap).
  const bounded = options.startTs !== undefined || options.endTs !== undefined;
  const stateBounds = [
    options.startTs !== undefined ? `AND bucket_ts >= ${Math.trunc(options.startTs)}` : "",
    options.endTs !== undefined ? `AND bucket_ts <= ${Math.trunc(options.endTs)}` : "",
  ].filter(Boolean).join("\n        ");
  const stateRows = await query<StateRow>(
    `SELECT bucket_ts, yin_score, yang_score, category, source_quality, updated_at_ts
       FROM intraday_state
      WHERE user_id IN (${identityList(identities)})
        ${stateBounds}
      ORDER BY bucket_ts DESC, updated_at_ts DESC
      ${bounded ? "" : `LIMIT ${stateLimit * Math.max(2, identities.length)}`};`,
  );
  const byBucket = new Map<number, StateRow>();
  for (const row of stateRows) {
    const previous = byBucket.get(row.bucket_ts);
    if (!previous || row.updated_at_ts >= previous.updated_at_ts) byBucket.set(row.bucket_ts, row);
  }
  let states: StateSignal[] = [...byBucket.values()]
    .sort((a, b) => a.bucket_ts - b.bucket_ts)
    .map((row) => ({
      bucket_ts: row.bucket_ts,
      yin_score: row.yin_score,
      yang_score: row.yang_score,
      category: row.category,
      source_quality: row.source_quality,
      updated_at_ts: row.updated_at_ts,
      graph_source_ref: `state:${row.bucket_ts}`,
    }));
  if (!bounded && states.length > stateLimit) states = states.slice(states.length - stateLimit);

  // Raw samples: honor the requested biometric window. Unlike the HTTP path
  // (backend resolves `range` against server-now and IGNORES startTs/endTs —
  // the replay divergence run.ts's staleness diagnostic complains about),
  // the direct read anchors on the run's own bounds when present, exactly
  // matching the diagnostic window.
  const windowEndTs = Math.trunc(options.endTs ?? nowTs);
  const windowStartTs = Math.trunc(
    options.startTs ?? windowEndTs - (RANGE_WINDOW_SEC[range] ?? RANGE_WINDOW_SEC.week),
  );
  const sampleRows = await query<SampleRow>(
    `SELECT metric_type, value, start_time_ts
       FROM health_samples
      WHERE user_id IN (${identityList(identities)})
        AND metric_type IN (${metrics.map((metric) => q(metric)).join(", ")})
        AND start_time_ts >= ${windowStartTs}
        AND start_time_ts <= ${windowEndTs}
      ORDER BY metric_type ASC, start_time_ts ASC, id ASC;`,
  );

  const seriesByMetric = new Map<string, BiometricMetricSeries>();
  for (const metric of metrics) {
    seriesByMetric.set(metric, {
      metric,
      range,
      samples: [],
      aggregated: { avg: null, min: null, max: null },
    });
  }
  for (const row of sampleRows) {
    const series = seriesByMetric.get(row.metric_type);
    if (!series) continue;
    const timestamp = new Date(row.start_time_ts * 1000).toISOString();
    series.samples.push({
      metric: row.metric_type,
      value: row.value,
      timestamp,
      graph_source_ref: `healthkit:${row.metric_type}:${timestamp}`,
    });
  }
  for (const series of seriesByMetric.values()) {
    if (series.samples.length === 0) continue;
    // reduce, not Math.min/max(...spread): a year of fine-grained samples
    // can exceed the spread-arg limit and throw RangeError (same trap as
    // run.ts's staleness scan).
    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const sample of series.samples) {
      sum += sample.value;
      if (sample.value < min) min = sample.value;
      if (sample.value > max) max = sample.value;
    }
    series.aggregated = { avg: sum / series.samples.length, min, max };
  }

  // 30-day per-metric baselines ride the SAME identity union. Anchored on the
  // read's endTs (never Date.now(): replay runs must baseline against their own
  // window end). day_count = distinct calendar days with ANY sample behind the
  // average — the endorsement builder gates baseline-relative phrasing on
  // maturity (>= MIN_BASELINE_DAYS). start_time_ts is UNIX SECONDS here, so the
  // 30-day span and the day bucket both divide by seconds, not milliseconds.
  const baselineStartTs = windowEndTs - BASELINE_WINDOW_DAYS * SECONDS_PER_DAY;
  const baselineRows = await query<{
    metric_type: string;
    baseline_avg: number | string | null;
    day_count: number | string | null;
  }>(
    `SELECT metric_type,
            avg(value)::float8 AS baseline_avg,
            count(DISTINCT (start_time_ts / ${SECONDS_PER_DAY})) AS day_count
       FROM health_samples
      WHERE user_id IN (${identityList(identities)})
        AND metric_type IN (${metrics.map((metric) => q(metric)).join(", ")})
        AND start_time_ts >= ${baselineStartTs}
        AND start_time_ts < ${windowEndTs}
      GROUP BY metric_type;`,
  );
  const baselines: MetricBaseline[] = baselineRows
    .map((row) => ({
      metric_type: row.metric_type,
      baseline_avg: Number(row.baseline_avg),
      day_count: Number(row.day_count),
    }))
    // psql avg over an empty group is NULL → NaN; drop unusable rows.
    .filter((b) => Number.isFinite(b.baseline_avg) && Number.isFinite(b.day_count));

  return {
    metrics: [...seriesByMetric.values()],
    states,
    baselines,
  };
}

export interface SelectBiometricsOptions extends DirectBiometricsOptions {
  /** HTTP fallback client; absent (no API key) means no fallback exists. */
  client?: BiometricsClient;
  /** Store-kind override for tests; defaults to graph-db resolution. */
  storeKind?: GraphStoreKind;
}

export interface BiometricsRead {
  signals: BiometricsSignalsWithBaselines;
  source: BiometricSource;
}

function emptyBiometrics(): BiometricsSignals {
  return { metrics: [], states: [] };
}

/**
 * Source selection: Postgres stores read biometrics directly from the warm
 * tier; ANY direct-path failure (connection, missing backend tables) falls
 * back to the HTTP client path with a warning, so cloud deploys and dev
 * machines keep working unchanged. SQLite stores go straight to HTTP.
 */
export async function readBiometricSignalsPreferDirect(
  options: SelectBiometricsOptions,
  warnings: string[],
): Promise<BiometricsRead> {
  const kind = options.storeKind ?? graphStoreKind();
  if (kind === "postgres") {
    try {
      return { signals: await readBiometricSignalsFromDb(options), source: "neon-direct" };
    } catch (err: any) {
      warnings.push(
        `direct graph-store biometrics read failed (${err?.message ?? String(err)}); falling back to backend API`,
      );
    }
  }
  if (!options.client) {
    warnings.push("no backend API key; biometrics were not read");
    return { signals: emptyBiometrics(), source: "none" };
  }
  try {
    return { signals: await readBiometricSignals(options.client, options), source: "api" };
  } catch (err: any) {
    warnings.push(`backend history unavailable: ${err?.message ?? String(err)}`);
    return { signals: emptyBiometrics(), source: "none" };
  }
}
