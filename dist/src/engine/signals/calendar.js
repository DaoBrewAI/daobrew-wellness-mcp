"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCalendarSignals = readCalendarSignals;
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
async function readCalendarSignals(options = {}) {
    (0, schema_js_1.ensureSchema)();
    const userId = (0, require_user_id_js_1.requireUserId)(options.userId, "readCalendarSignals");
    const limit = Math.trunc(options.limit ?? 100);
    const query = options.query ?? graph_db_js_1.queryJson;
    const rows = await query(`SELECT id, user_id, source, source_ref, title, start_ts, end_ts, all_day,
            attendee_count, attendees_json, calendar_name, location,
            metadata_json, created_at_ts
       FROM events
      WHERE user_id = ${(0, user_scope_js_1.scopedUserIdExpr)(userId)}
      ${andTimeBounds("start_ts", options.startTs, options.endTs)}
      ORDER BY start_ts ASC, id ASC
      LIMIT ${limit};`);
    return rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        source: row.source,
        source_ref: row.source_ref,
        graph_source_ref: `calendar:${row.source_ref ?? row.start_ts}`,
        title: row.title,
        start_ts: row.start_ts,
        end_ts: row.end_ts,
        all_day: row.all_day === 1,
        attendee_count: row.attendee_count,
        attendees: parseJson(row.attendees_json, []),
        calendar_name: row.calendar_name,
        location: row.location,
        metadata: parseJson(row.metadata_json, {}),
        created_at_ts: row.created_at_ts,
    }));
}
