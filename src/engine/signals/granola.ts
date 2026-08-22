import { ensureSchema } from "../schema.js";
import { queryJson } from "../../graph-db.js";
import { scopedUserIdExpr } from "../user-scope.js";
import { requireUserId } from "../require-user-id.js";

type Query = (sql: string) => Promise<Record<string, any>[]>;

export interface GranolaSignalOptions {
  userId?: string;
  startTs?: number;
  endTs?: number;
  limit?: number;
  /** RLS seam (deferred wiring 1/3): injected read executor. Defaults to the
   *  module-level queryJson — behavior is byte-identical when absent. */
  query?: Query;
}

export interface GranolaMeetingSignal {
  id: string;
  user_id: string;
  source: string;
  source_ref: string | null;
  graph_source_ref: string;
  event_id: string | null;
  kind: string;
  title: string;
  occurred_at_ts: number | null;
  duration_sec: number | null;
  participants: unknown[];
  summary: string | null;
  body: string | null;
  transcript_spans?: TranscriptSpan[];
  topics: string[];
  created_at_ts: number;
}

export interface TranscriptSpan {
  idx?: number;
  speaker?: string | null;
  ts_offset_sec?: number | null;
  text: string;
}

interface GranolaMeetingRow {
  id: string;
  user_id: string;
  source: string;
  source_ref: string | null;
  event_id: string | null;
  kind: string;
  title: string;
  occurred_at_ts: number | null;
  duration_sec: number | null;
  participants_json: string | null;
  summary: string | null;
  body: string | null;
  transcript_spans_json: string | null;
  topics_json: string | null;
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

export async function readGranolaSignals(
  options: GranolaSignalOptions = {},
): Promise<GranolaMeetingSignal[]> {
  ensureSchema();
  const userId = requireUserId(options.userId, "readGranolaSignals");
  const limit = Math.trunc(options.limit ?? 50);
  const query = options.query ?? queryJson;
  const rows = await query(
    `SELECT id, user_id, source, source_ref, event_id, kind, title,
            occurred_at_ts, duration_sec, participants_json, summary, body,
            transcript_spans_json, topics_json, created_at_ts
       FROM meeting_notes
      WHERE user_id = ${scopedUserIdExpr(userId)}
      ${andTimeBounds("occurred_at_ts", options.startTs, options.endTs)}
      ORDER BY occurred_at_ts ASC, id ASC
      LIMIT ${limit};`,
  ) as GranolaMeetingRow[];

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
    participants: parseJson<unknown[]>(row.participants_json, []),
    summary: row.summary,
    body: row.body,
    transcript_spans: parseJson<TranscriptSpan[]>(row.transcript_spans_json, [])
      .filter((span) => typeof span?.text === "string" && span.text.trim().length > 0),
    topics: parseJson<string[]>(row.topics_json, []),
    created_at_ts: row.created_at_ts,
  }));
}
