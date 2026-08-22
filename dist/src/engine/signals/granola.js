"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readGranolaSignals = readGranolaSignals;
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
async function readGranolaSignals(options = {}) {
    (0, schema_js_1.ensureSchema)();
    const userId = (0, require_user_id_js_1.requireUserId)(options.userId, "readGranolaSignals");
    const limit = Math.trunc(options.limit ?? 50);
    const query = options.query ?? graph_db_js_1.queryJson;
    const rows = await query(`SELECT id, user_id, source, source_ref, event_id, kind, title,
            occurred_at_ts, duration_sec, participants_json, summary, body,
            transcript_spans_json, topics_json, created_at_ts
       FROM meeting_notes
      WHERE user_id = ${(0, user_scope_js_1.scopedUserIdExpr)(userId)}
      ${andTimeBounds("occurred_at_ts", options.startTs, options.endTs)}
      ORDER BY occurred_at_ts ASC, id ASC
      LIMIT ${limit};`);
    return rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        source: row.source,
        source_ref: row.source_ref,
        graph_source_ref: `${row.source || "granola"}:${row.source_ref ?? row.id}`,
        event_id: row.event_id,
        kind: row.kind,
        title: row.title,
        occurred_at_ts: row.occurred_at_ts,
        duration_sec: row.duration_sec,
        participants: parseJson(row.participants_json, []),
        summary: row.summary,
        body: row.body,
        transcript_spans: parseJson(row.transcript_spans_json, [])
            .filter((span) => typeof span?.text === "string" && span.text.trim().length > 0),
        topics: parseJson(row.topics_json, []),
        created_at_ts: row.created_at_ts,
    }));
}
