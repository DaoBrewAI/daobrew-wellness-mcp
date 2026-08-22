import { queryJson, q, graphStoreKind } from "../../graph-db.js";
import { SCOPED_USER_ID_SQL } from "../user-scope.js";
import { gateThreadInfluence } from "./claims.js";
import { CausalThreadRow, InfluenceLevel, MemoryClaimLevel, UserModelSnapshotRow, CLAIM_LEVELS } from "./types.js";

/**
 * Layer 2 hot-path reader: returns claim-gated active threads plus the latest
 * user model snapshot. Read-only; a missing snapshot never throws — the caller
 * falls back to direct thread retrieval (snapshot_fallback = true). Influence
 * is gated by claim level with memory-only demotion: threads whose evidence
 * comes only from user_insights (or graph/biometric refs) stay background
 * context regardless of claim level.
 */

type Query = (sql: string) => Promise<Record<string, any>[]>;

export interface MemoryReadOptions {
  userId: string;
  graphRootId?: string;
  patternKeys?: string[];
  limit?: number;
  query?: Query;
  /** Injectable clock for snapshot_fresh (tests); defaults to Date.now. */
  nowTs?: () => number;
}

/** G5 verify-loop rollup per thread, aggregated from thread_verifications
 *  verdict rows. Counting is consistent with the nightly claim pass:
 *  no_recurrence_observed → confirmation, pattern_recurred → contradiction,
 *  insufficient_observation → neither. */
export interface ThreadVerificationSummary {
  confirmations: number;
  contradictions: number;
  last_verdict_at_ts: number | null;
}

export interface GatedThread extends CausalThreadRow {
  influence: InfluenceLevel;
  evidence_tables: string[];
  verification: ThreadVerificationSummary;
}

export interface CausalMemoryReadResult {
  threads: GatedThread[];
  snapshot: UserModelSnapshotRow | null;
  snapshot_fallback: boolean;
  /** True when a snapshot exists AND it is younger than 7 days (G11-lite). */
  snapshot_fresh: boolean;
}

const DEFAULT_LIMIT = 12;

/** Snapshots older than this stop counting as fresh context. */
const SNAPSHOT_FRESH_SECONDS = 7 * 86_400;

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through
    }
  }
  return [];
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toClaimLevel(value: unknown): MemoryClaimLevel {
  return (CLAIM_LEVELS as readonly string[]).includes(String(value))
    ? (value as MemoryClaimLevel)
    : "correlation";
}

export async function readCausalMemory(options: MemoryReadOptions): Promise<CausalMemoryReadResult> {
  if (!options.query && graphStoreKind() !== "postgres") {
    throw new Error("readCausalMemory requires DAOBREW_GRAPH_STORE=postgres; layer 2 memory is Postgres-only");
  }
  const query = options.query ?? queryJson;
  const userId = options.userId;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const filters = [
    `user_id = ${SCOPED_USER_ID_SQL}`,
    `status = 'active'`,
    `decay_state = 'active'`,
  ];
  if (options.graphRootId) filters.push(`graph_root_id = ${q(options.graphRootId)}`);
  if (options.patternKeys && options.patternKeys.length > 0) {
    const keys = options.patternKeys.map((key) => q(key)).join(", ");
    filters.push(`pattern_keys_json ?| array[${keys}]`);
  }

  const threadRows = await query(
    `SELECT id, user_id, thread_key, key_version, graph_root_id, title, summary, claim_level, status, pattern_keys_json, recurrence_count, first_seen_ts, last_seen_ts, last_reinforced_ts, strength, decay_state\n` +
      `FROM causal_memory_threads\n` +
      `WHERE ${filters.join(" AND ")}\n` +
      `ORDER BY strength DESC, last_seen_ts DESC\n` +
      `LIMIT ${limit}`,
  );

  const evidenceTablesByThread = new Map<string, Set<string | null>>();
  const verificationByThread = new Map<string, ThreadVerificationSummary>();
  if (threadRows.length > 0) {
    // Scope to the returned threads — this is the hot path; never drag the
    // user's full evidence history through the transport.
    const threadIdList = threadRows.map((row) => q(String(row.id))).join(", ");
    const evidenceRows = await query(
      `SELECT thread_id, source_table FROM causal_thread_evidence WHERE user_id = ${SCOPED_USER_ID_SQL} AND thread_id IN (${threadIdList})`,
    );
    for (const row of evidenceRows) {
      const key = String(row.thread_id);
      const bucket = evidenceTablesByThread.get(key) ?? new Set<string | null>();
      bucket.add(typeof row.source_table === "string" && row.source_table ? row.source_table : null);
      evidenceTablesByThread.set(key, bucket);
    }

    // V6: one aggregate pass over the settled verdicts for these threads.
    // Same scoping idiom as the evidence query; counting mirrors nightly's
    // claim pass (insufficient_observation is neither side).
    const verdictRows = await query(
      `SELECT thread_id, verdict, observed_at_ts FROM thread_verifications WHERE user_id = ${SCOPED_USER_ID_SQL} AND kind = 'verdict' AND thread_id IN (${threadIdList})`,
    );
    for (const row of verdictRows) {
      const key = String(row.thread_id);
      const summary = verificationByThread.get(key) ?? {
        confirmations: 0,
        contradictions: 0,
        last_verdict_at_ts: null,
      };
      if (row.verdict === "no_recurrence_observed") summary.confirmations += 1;
      else if (row.verdict === "pattern_recurred") summary.contradictions += 1;
      const ts = finiteOrNull(row.observed_at_ts);
      if (ts !== null && (summary.last_verdict_at_ts === null || ts > summary.last_verdict_at_ts)) {
        summary.last_verdict_at_ts = ts;
      }
      verificationByThread.set(key, summary);
    }
  }

  const threads: GatedThread[] = threadRows.map((row) => {
    const id = String(row.id);
    const claim = toClaimLevel(row.claim_level);
    const tables = [...(evidenceTablesByThread.get(id) ?? new Set<string | null>())];
    return {
      id,
      user_id: String(row.user_id ?? userId),
      thread_key: String(row.thread_key ?? ""),
      key_version: Number(row.key_version) || 1,
      graph_root_id: typeof row.graph_root_id === "string" && row.graph_root_id ? row.graph_root_id : null,
      title: String(row.title ?? id),
      summary: typeof row.summary === "string" && row.summary ? row.summary : null,
      claim_level: claim,
      status: "active",
      pattern_keys_json: parseJsonArray(row.pattern_keys_json),
      recurrence_count: Number(row.recurrence_count) || 0,
      first_seen_ts: finiteOrNull(row.first_seen_ts),
      last_seen_ts: finiteOrNull(row.last_seen_ts),
      last_reinforced_ts: finiteOrNull(row.last_reinforced_ts),
      strength: Number(row.strength) || 0,
      decay_state: "active",
      influence: gateThreadInfluence(claim, tables),
      evidence_tables: tables.filter((table): table is string => table !== null).sort(),
      verification: verificationByThread.get(id) ?? {
        confirmations: 0,
        contradictions: 0,
        last_verdict_at_ts: null,
      },
    };
  });

  const snapshotRows = await query(
    `SELECT id, user_id, version, snapshot_text, source_thread_ids_json, claim_ceiling, generated_from_count, created_at_ts\n` +
      `FROM user_model_snapshots\n` +
      `WHERE user_id = ${SCOPED_USER_ID_SQL}\n` +
      `ORDER BY version DESC\n` +
      `LIMIT 1`,
  );
  const snapshotRow = snapshotRows[0];
  const snapshot: UserModelSnapshotRow | null = snapshotRow
    ? {
        id: String(snapshotRow.id),
        user_id: String(snapshotRow.user_id ?? userId),
        version: Number(snapshotRow.version) || 0,
        snapshot_text: String(snapshotRow.snapshot_text ?? ""),
        source_thread_ids_json: parseJsonArray(snapshotRow.source_thread_ids_json),
        claim_ceiling: toClaimLevel(snapshotRow.claim_ceiling),
        generated_from_count: Number(snapshotRow.generated_from_count) || 0,
        created_at_ts: finiteOrNull(snapshotRow.created_at_ts) ?? 0,
      }
    : null;

  const now = options.nowTs ? options.nowTs() : Math.floor(Date.now() / 1000);
  const snapshotFresh = snapshot !== null && now - snapshot.created_at_ts < SNAPSHOT_FRESH_SECONDS;

  return { threads, snapshot, snapshot_fallback: snapshot === null, snapshot_fresh: snapshotFresh };
}
