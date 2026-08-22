"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readBiometricSignalsFromDb = readBiometricSignalsFromDb;
exports.readBiometricSignalsPreferDirect = readBiometricSignalsPreferDirect;
const graph_db_js_1 = require("../../graph-db.js");
const biometrics_js_1 = require("./biometrics.js");
/** Days of history the per-metric baseline aggregates over. */
const BASELINE_WINDOW_DAYS = 30;
/** health_samples.start_time_ts is UNIX SECONDS in this table. */
const SECONDS_PER_DAY = 86_400;
/** Mirrors run.ts RANGE_WINDOW_SEC — the backend resolves range strings
 *  relative to now; unknown ranges fall back to week. */
const RANGE_WINDOW_SEC = {
    day: 86400,
    week: 7 * 86400,
    month: 30 * 86400,
    year: 365 * 86400,
};
const BACKEND_TABLES = ["intraday_state", "health_samples"];
function identityList(identities) {
    return identities.map((identity) => (0, graph_db_js_1.q)(identity)).join(", ");
}
async function readBiometricSignalsFromDb(options) {
    const query = options.query ?? ((sql) => (0, graph_db_js_1.queryJson)(sql));
    const userId = options.userId;
    const metrics = options.metrics ?? biometrics_js_1.DEFAULT_BIOMETRIC_METRICS;
    const range = options.range ?? "week";
    const stateLimit = Math.max(1, Math.trunc(options.stateLimit ?? 24));
    const nowTs = options.nowTs ?? Math.floor(Date.now() / 1000);
    // Schema probe: dev machines pointing graph-db at a local compose PG have
    // the engine tables but not the backend's. Absent tables must route to the
    // API fallback, not read as "user has no biometrics".
    const probe = await query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${BACKEND_TABLES.map((t) => (0, graph_db_js_1.q)(t)).join(", ")});`);
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
    const stateRows = await query(`SELECT bucket_ts, yin_score, yang_score, category, source_quality, updated_at_ts
       FROM intraday_state
      WHERE user_id IN (${identityList(identities)})
        ${stateBounds}
      ORDER BY bucket_ts DESC, updated_at_ts DESC
      ${bounded ? "" : `LIMIT ${stateLimit * Math.max(2, identities.length)}`};`);
    const byBucket = new Map();
    for (const row of stateRows) {
        const previous = byBucket.get(row.bucket_ts);
        if (!previous || row.updated_at_ts >= previous.updated_at_ts)
            byBucket.set(row.bucket_ts, row);
    }
    let states = [...byBucket.values()]
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
    if (!bounded && states.length > stateLimit)
        states = states.slice(states.length - stateLimit);
    // Raw samples: honor the requested biometric window. Unlike the HTTP path
    // (backend resolves `range` against server-now and IGNORES startTs/endTs —
    // the replay divergence run.ts's staleness diagnostic complains about),
    // the direct read anchors on the run's own bounds when present, exactly
    // matching the diagnostic window.
    const windowEndTs = Math.trunc(options.endTs ?? nowTs);
    const windowStartTs = Math.trunc(options.startTs ?? windowEndTs - (RANGE_WINDOW_SEC[range] ?? RANGE_WINDOW_SEC.week));
    const sampleRows = await query(`SELECT metric_type, value, start_time_ts
       FROM health_samples
      WHERE user_id IN (${identityList(identities)})
        AND metric_type IN (${metrics.map((metric) => (0, graph_db_js_1.q)(metric)).join(", ")})
        AND start_time_ts >= ${windowStartTs}
        AND start_time_ts <= ${windowEndTs}
      ORDER BY metric_type ASC, start_time_ts ASC, id ASC;`);
    const seriesByMetric = new Map();
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
        if (!series)
            continue;
        const timestamp = new Date(row.start_time_ts * 1000).toISOString();
        series.samples.push({
            metric: row.metric_type,
            value: row.value,
            timestamp,
            graph_source_ref: `healthkit:${row.metric_type}:${timestamp}`,
        });
    }
    for (const series of seriesByMetric.values()) {
        if (series.samples.length === 0)
            continue;
        // reduce, not Math.min/max(...spread): a year of fine-grained samples
        // can exceed the spread-arg limit and throw RangeError (same trap as
        // run.ts's staleness scan).
        let sum = 0;
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (const sample of series.samples) {
            sum += sample.value;
            if (sample.value < min)
                min = sample.value;
            if (sample.value > max)
                max = sample.value;
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
    const baselineRows = await query(`SELECT metric_type,
            avg(value)::float8 AS baseline_avg,
            count(DISTINCT (start_time_ts / ${SECONDS_PER_DAY})) AS day_count
       FROM health_samples
      WHERE user_id IN (${identityList(identities)})
        AND metric_type IN (${metrics.map((metric) => (0, graph_db_js_1.q)(metric)).join(", ")})
        AND start_time_ts >= ${baselineStartTs}
        AND start_time_ts < ${windowEndTs}
      GROUP BY metric_type;`);
    const baselines = baselineRows
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
function emptyBiometrics() {
    return { metrics: [], states: [] };
}
/**
 * Source selection: Postgres stores read biometrics directly from the warm
 * tier; ANY direct-path failure (connection, missing backend tables) falls
 * back to the HTTP client path with a warning, so cloud deploys and dev
 * machines keep working unchanged. SQLite stores go straight to HTTP.
 */
async function readBiometricSignalsPreferDirect(options, warnings) {
    const kind = options.storeKind ?? (0, graph_db_js_1.graphStoreKind)();
    if (kind === "postgres") {
        try {
            return { signals: await readBiometricSignalsFromDb(options), source: "neon-direct" };
        }
        catch (err) {
            warnings.push(`direct graph-store biometrics read failed (${err?.message ?? String(err)}); falling back to backend API`);
        }
    }
    if (!options.client) {
        warnings.push("no backend API key; biometrics were not read");
        return { signals: emptyBiometrics(), source: "none" };
    }
    try {
        return { signals: await (0, biometrics_js_1.readBiometricSignals)(options.client, options), source: "api" };
    }
    catch (err) {
        warnings.push(`backend history unavailable: ${err?.message ?? String(err)}`);
        return { signals: emptyBiometrics(), source: "none" };
    }
}
