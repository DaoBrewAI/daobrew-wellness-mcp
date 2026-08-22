import { ensureSchema } from "../schema.js";
import { queryJson } from "../../graph-db.js";
import { scopedUserIdExpr } from "../user-scope.js";
import { requireUserId } from "../require-user-id.js";

type Query = (sql: string) => Promise<Record<string, any>[]>;

export interface MemorySignalOptions {
  userId?: string;
  startTs?: number;
  endTs?: number;
  limit?: number;
  minStrength?: number;
  /** RLS seam (deferred wiring 1/3): injected read executor. Defaults to the
   *  module-level queryJson — behavior is byte-identical when absent. */
  query?: Query;
}

export interface MemoryInsightSignal {
  id: string;
  user_id: string;
  source: string;
  source_ref: string | null;
  graph_source_ref: string;
  insight_text: string;
  topics: string[];
  importance: number;
  strength: number;
  occurred_at_ts: number | null;
  last_accessed_ts: number | null;
  created_at_ts: number;
}

interface MemoryInsightRow {
  id: string;
  user_id: string;
  source: string;
  source_ref: string | null;
  insight_text: string;
  topics_json: string | null;
  importance: number;
  strength: number;
  occurred_at_ts: number | null;
  last_accessed_ts: number | null;
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

export async function readMemorySignals(
  options: MemorySignalOptions = {},
): Promise<MemoryInsightSignal[]> {
  ensureSchema();
  const userId = requireUserId(options.userId, "readMemorySignals");
  const limit = Math.trunc(options.limit ?? 50);
  const minStrength = options.minStrength ?? 0;
  const query = options.query ?? queryJson;
  // Time bounds are NULL-safe: session insights without a parsable first
  // timestamp carry occurred_at_ts=NULL (claudeMemory.ts), so bounds fall
  // back to created_at_ts (ingest time) instead of silently dropping them.
  const rows = await query(
    `SELECT id, user_id, source, source_ref, insight_text, topics_json,
            importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts
      FROM user_insights
      WHERE user_id = ${scopedUserIdExpr(userId)}
        AND strength > 0
        AND strength >= ${Number(minStrength)}
      ${andTimeBounds("COALESCE(occurred_at_ts, created_at_ts)", options.startTs, options.endTs)}
      ORDER BY strength DESC, importance DESC, occurred_at_ts DESC, id ASC
      LIMIT ${limit};`,
  ) as MemoryInsightRow[];

  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    source: row.source,
    source_ref: row.source_ref,
    graph_source_ref: `memory:${row.source_ref ?? row.id}`,
    insight_text: row.insight_text,
    topics: parseJson<string[]>(row.topics_json, []),
    importance: row.importance,
    strength: row.strength,
    occurred_at_ts: row.occurred_at_ts,
    last_accessed_ts: row.last_accessed_ts,
    created_at_ts: row.created_at_ts,
  }));
}
