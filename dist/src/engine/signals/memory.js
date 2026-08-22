"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readMemorySignals = readMemorySignals;
const schema_js_1 = require("../schema.js");
const graph_db_js_1 = require("../../graph-db.js");
const user_scope_js_1 = require("../user-scope.js");
const require_user_id_js_1 = require("../require-user-id.js");
function parseJson(value, fallback) {
    if (!value)
        return fallback;
    if (typeof value !== "string")
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function andTimeBounds(column, startTs, endTs) {
    const clauses = [];
    if (startTs !== undefined)
        clauses.push(`${column} >= ${Math.trunc(startTs)}`);
    if (endTs !== undefined)
        clauses.push(`${column} <= ${Math.trunc(endTs)}`);
    return clauses.length ? ` AND ${clauses.join(" AND ")}` : "";
}
async function readMemorySignals(options = {}) {
    (0, schema_js_1.ensureSchema)();
    const userId = (0, require_user_id_js_1.requireUserId)(options.userId, "readMemorySignals");
    const limit = Math.trunc(options.limit ?? 50);
    const minStrength = options.minStrength ?? 0;
    const query = options.query ?? graph_db_js_1.queryJson;
    // Time bounds are NULL-safe: session insights without a parsable first
    // timestamp carry occurred_at_ts=NULL (claudeMemory.ts), so bounds fall
    // back to created_at_ts (ingest time) instead of silently dropping them.
    const rows = await query(`SELECT id, user_id, source, source_ref, insight_text, topics_json,
            importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts
      FROM user_insights
      WHERE user_id = ${(0, user_scope_js_1.scopedUserIdExpr)(userId)}
        AND strength > 0
        AND strength >= ${Number(minStrength)}
      ${andTimeBounds("COALESCE(occurred_at_ts, created_at_ts)", options.startTs, options.endTs)}
      ORDER BY strength DESC, importance DESC, occurred_at_ts DESC, id ASC
      LIMIT ${limit};`);
    return rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        source: row.source,
        source_ref: row.source_ref,
        graph_source_ref: `memory:${row.source_ref ?? row.id}`,
        insight_text: row.insight_text,
        topics: parseJson(row.topics_json, []),
        importance: row.importance,
        strength: row.strength,
        occurred_at_ts: row.occurred_at_ts,
        last_accessed_ts: row.last_accessed_ts,
        created_at_ts: row.created_at_ts,
    }));
}
