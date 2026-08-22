import { ensureSchema } from "../schema.js";
import { queryJson } from "../../graph-db.js";
import { scopedUserIdExpr } from "../user-scope.js";
import { requireUserId } from "../require-user-id.js";

type Query = (sql: string) => Promise<Record<string, any>[]>;

export interface CalendarSignalOptions {
  userId?: string;
  startTs?: number;
  endTs?: number;
  limit?: number;
  /** RLS seam (deferred wiring 1/3): injected read executor. Defaults to the
   *  module-level queryJson — behavior is byte-identical when absent. */
  query?: Query;
}

export interface CalendarEventSignal {
  id: string;
  user_id: string;
  source: string;
  source_ref: string | null;
  graph_source_ref: string;
  title: string;
  start_ts: number;
  end_ts: number | null;
  all_day: boolean;
  attendee_count: number | null;
  attendees: unknown[];
  calendar_name: string | null;
  location: string | null;
  metadata: Record<string, unknown>;
  created_at_ts: number;
}

interface CalendarEventRow {
  id: string;
  user_id: string;
  source: string;
  source_ref: string | null;
  title: string;
  start_ts: number;
  end_ts: number | null;
  all_day: number;
  attendee_count: number | null;
  attendees_json: string | null;
  calendar_name: string | null;
  location: string | null;
  metadata_json: string;
  created_at_ts: number;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function andTimeBounds(column: string, startTs?: number, endTs?: number): string {
  const clauses: string[] = [];
  if (startTs !== undefined) clauses.push(`${column} >= ${Math.trunc(startTs)}`);
  if (endTs !== undefined) clauses.push(`${column} <= ${Math.trunc(endTs)}`);
  return clauses.length ? ` AND ${clauses.join(" AND ")}` : "";
}

export async function readCalendarSignals(
  options: CalendarSignalOptions = {},
): Promise<CalendarEventSignal[]> {
  ensureSchema();
  const userId = requireUserId(options.userId, "readCalendarSignals");
  const limit = Math.trunc(options.limit ?? 100);
  const query = options.query ?? queryJson;
  const rows = await query(
    `SELECT id, user_id, source, source_ref, title, start_ts, end_ts, all_day,
            attendee_count, attendees_json, calendar_name, location,
            metadata_json, created_at_ts
       FROM events
      WHERE user_id = ${scopedUserIdExpr(userId)}
      ${andTimeBounds("start_ts", options.startTs, options.endTs)}
      ORDER BY start_ts ASC, id ASC
      LIMIT ${limit};`,
  ) as CalendarEventRow[];

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
    attendees: parseJson<unknown[]>(row.attendees_json, []),
    calendar_name: row.calendar_name,
    location: row.location,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
    created_at_ts: row.created_at_ts,
  }));
}
