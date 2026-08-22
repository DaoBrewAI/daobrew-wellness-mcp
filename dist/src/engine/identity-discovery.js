"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalIdentities = canonicalIdentities;
exports.discoverActiveIdentities = discoverActiveIdentities;
const graph_db_js_1 = require("../graph-db.js");
const user_id_js_1 = require("../user-id.js");
const DEFAULT_WINDOW_DAYS = 30;
const SECONDS_PER_DAY = 86_400;
/** Backend-owned biometric tables (probe-guarded — absence is tolerated). */
const BACKEND_TABLES = ["intraday_state", "health_samples"];
/**
 * Collapse a set of raw user_ids to canonical UUID anchors. Empty, local,
 * api-key, and non-UUID legacy ids are dropped. Deterministic (sorted) output.
 */
function canonicalIdentities(rawIds) {
    const result = new Set();
    for (const id of rawIds) {
        const canonical = (0, user_id_js_1.canonicalUserId)(id);
        if (canonical)
            result.add(canonical);
    }
    return [...result].sort();
}
async function discoverActiveIdentities(options = {}) {
    const query = options.query ?? ((sql) => (0, graph_db_js_1.queryJson)(sql));
    const nowTs = options.nowTs ?? Math.floor(Date.now() / 1000);
    const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
    const cutoffTs = nowTs - windowDays * SECONDS_PER_DAY;
    const raw = new Set();
    // Probe backend tables — absent on dev machines pointing graph-db at a local
    // compose PG (same guard biometricsDb uses); missing tables contribute
    // nothing rather than erroring the whole discovery.
    const probe = await query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${BACKEND_TABLES.map((t) => (0, graph_db_js_1.q)(t)).join(", ")});`);
    const present = new Set(probe.map((row) => row.table_name));
    if (present.has("intraday_state")) {
        const rows = await query(`SELECT DISTINCT user_id FROM intraday_state WHERE bucket_ts >= ${cutoffTs} AND user_id IS NOT NULL;`);
        for (const row of rows)
            if (row.user_id)
                raw.add(String(row.user_id));
    }
    if (present.has("health_samples")) {
        const rows = await query(`SELECT DISTINCT user_id FROM health_samples WHERE start_time_ts >= ${cutoffTs} AND user_id IS NOT NULL;`);
        for (const row of rows)
            if (row.user_id)
                raw.add(String(row.user_id));
    }
    // Engine-owned activity: user_insights.created_at_ts (NOT NULL — ingest time).
    // This table is RLS-managed, but the owner runtime bypasses policies, so plain
    // queryJson surfaces every user's rows.
    const insightRows = await query(`SELECT DISTINCT user_id FROM user_insights WHERE created_at_ts >= ${cutoffTs} AND user_id IS NOT NULL;`);
    for (const row of insightRows)
        if (row.user_id)
            raw.add(String(row.user_id));
    return canonicalIdentities(raw);
}
