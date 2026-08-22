import { createHash } from "node:crypto";
import { graphStoreKind, q, type GraphStoreKind } from "../../graph-db.js";
import type { TextGenerationProvider } from "../memory/llm.js";
import { semanticStage1Sql } from "../retrieval/semantic.js";
import { SCOPED_USER_ID_SQL } from "../user-scope.js";
import type { InsightLifecycleDecisionCounts, InsightRow } from "./types.js";

type Query = (sql: string) => Promise<Record<string, any>[]>;
type EmbedRows = (texts: string[]) => Promise<number[][]>;

export const INSIGHT_LIFECYCLE_NEIGHBOR_LIMIT = 8;
export const INSIGHT_LIFECYCLE_MAX_CLASSIFIED_ROWS = 24;
export const SUPPRESSED_INSIGHT_STRENGTH = 0;

export type InsightLifecycleDecisionKind = "add" | "supersedes" | "noop_duplicate";

export interface InsightLifecyclePlan {
  rows: InsightRow[];
  /** Aligned with rows; true only when a durable or replayed lifecycle decision owns importance/strength. */
  lifecycleOwned: boolean[];
  postWriteSql: string[];
  warnings: string[];
  geminiCallsUsed: number;
  decisionCounts: InsightLifecycleDecisionCounts;
}

export interface InsightLifecycleOptions {
  userId: string;
  rows: InsightRow[];
  query: Query;
  llm?: TextGenerationProvider | null;
  embedRows?: EmbedRows | null;
  nowTs?: () => number;
  storeKind?: () => GraphStoreKind;
  maxClassifiedRows?: number;
}

interface RowWork {
  row: InsightRow;
  contentHash: string;
  key: string;
}

interface StoredDecision {
  incoming_source: string;
  incoming_source_ref: string;
  incoming_content_hash: string;
  decision_kind: InsightLifecycleDecisionKind;
  winner_insight_id: string | null;
  winner_source: string | null;
  winner_source_ref: string | null;
  loser_insight_id: string | null;
  loser_source: string | null;
  loser_source_ref: string | null;
  decided_importance: number;
  rationale: string;
}

interface CandidateMetadata {
  id: string;
  source: string;
  source_ref: string | null;
  insight_text: string;
  topics: string[];
  importance: number;
  strength: number;
  occurred_at_ts: number | null;
  last_accessed_ts: number | null;
}

interface CandidateSummary {
  id: string;
  source_ref: string | null;
  text: string;
  distance: number;
}

interface RawLifecycleDecision {
  incoming_source_ref: string;
  incoming_content_hash: string;
  decision_kind: InsightLifecycleDecisionKind;
  target_id?: string | null;
  importance: number;
  rationale: string;
}

interface DecisionRecord {
  incomingRow: InsightRow;
  incomingContentHash: string;
  decisionKind: InsightLifecycleDecisionKind;
  winnerInsightId: string | null;
  winnerSource: string | null;
  winnerSourceRef: string | null;
  loserInsightId: string | null;
  loserSource: string | null;
  loserSourceRef: string | null;
  decidedImportance: number;
  rationale: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function litText(value: string | null): string {
  return value === null ? "NULL" : q(value);
}

function litNum(value: number | null): string {
  return value === null || value === undefined ? "NULL" : String(value);
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function normalizeImportance(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function lifecycleRowKey(source: string, sourceRef: string, contentHash: string): string {
  return `${source}\u0000${sourceRef}\u0000${contentHash}`;
}

function decisionRecordId(userId: string, source: string, sourceRef: string, contentHash: string): string {
  const digest = createHash("sha256")
    .update([userId, source, sourceRef, contentHash].join("\u0000"))
    .digest("hex")
    .slice(0, 24);
  return `insight_lifecycle_${digest}`;
}

function scopedLifecycleInsightId(id: string, userId: string): string {
  if (userId === "local") return id;
  const suffix = createHash("sha256").update(userId).digest("hex").slice(0, 8);
  return `${id}_u${suffix}`;
}

export function insightContentHash(row: Pick<InsightRow, "insight_text" | "topics" | "occurred_at_ts" | "last_accessed_ts">): string {
  return createHash("sha256")
    .update(stableStringify({
      insight_text: row.insight_text,
      topics: row.topics,
      occurred_at_ts: row.occurred_at_ts,
      last_accessed_ts: row.last_accessed_ts,
    }))
    .digest("hex");
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function cloneRow(row: InsightRow): InsightRow {
  return {
    ...row,
    topics: [...row.topics],
  };
}

function recentSameSourceSql(row: InsightRow): string {
  return (
    `SELECT id, source_ref, insight_text AS text,\n` +
    `       COALESCE(occurred_at_ts, created_at_ts) AS ts,\n` +
    `       1.0 AS distance\n` +
    `  FROM user_insights\n` +
    ` WHERE user_id = ${SCOPED_USER_ID_SQL}\n` +
    `   AND source = ${q(row.source)}\n` +
    `   AND strength > 0\n` +
    ` ORDER BY created_at_ts DESC\n` +
    ` LIMIT ${INSIGHT_LIFECYCLE_NEIGHBOR_LIMIT};`
  );
}

function buildLifecyclePrompt(rows: Array<{ work: RowWork; candidates: CandidateSummary[] }>): string {
  const payload = rows.map(({ work, candidates }) => ({
    incoming_source: work.row.source,
    incoming_source_ref: work.row.source_ref,
    incoming_content_hash: work.contentHash,
    incoming_text: truncate(work.row.insight_text, 800),
    incoming_topics: work.row.topics,
    default_importance: work.row.importance,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      source_ref: candidate.source_ref,
      text: truncate(candidate.text, 400),
      distance: Number(candidate.distance.toFixed(4)),
    })),
  }));

  return [
    "You are deciding whether each incoming user insight should be added, supersede an older row, or be treated as a duplicate.",
    "Return strict JSON with this shape only:",
    '{"decisions":[{"incoming_source_ref":"string","incoming_content_hash":"string","decision_kind":"add|supersedes|noop_duplicate","target_id":"string|null","importance":0.0,"rationale":"string"}]}',
    "Rules:",
    "- choose exactly one decision for every input row",
    "- `add` means the insight is genuinely new; use target_id null",
    "- `supersedes` means the incoming row replaces an older candidate; target_id must be one of that row's candidate ids",
    "- `noop_duplicate` means the incoming row is a semantic duplicate; target_id must be one of that row's candidate ids",
    "- importance must be a number between 0 and 1",
    "- do not invent target ids or omit any row",
    `Input: ${JSON.stringify(payload)}`,
  ].join("\n");
}

function validateDecisionPayload(
  raw: unknown,
  classified: Array<{ work: RowWork; candidates: CandidateSummary[] }>,
): Map<string, RawLifecycleDecision> {
  const payload = raw as { decisions?: unknown };
  if (!payload || !Array.isArray(payload.decisions)) {
    throw new Error("lifecycle LLM response missing decisions[]");
  }

  const byKey = new Map(classified.map(({ work }) => [work.key, work]));
  const validated = new Map<string, RawLifecycleDecision>();
  if (payload.decisions.length !== classified.length) {
    throw new Error(`lifecycle LLM returned ${payload.decisions.length} decisions for ${classified.length} rows`);
  }

  for (const entry of payload.decisions) {
    const row = entry as Record<string, unknown>;
    const sourceRef = typeof row.incoming_source_ref === "string" ? row.incoming_source_ref : "";
    const contentHash = typeof row.incoming_content_hash === "string" ? row.incoming_content_hash : "";
    const key = lifecycleRowKey(
      classified.find(({ work }) => work.row.source_ref === sourceRef && work.contentHash === contentHash)?.work.row.source ?? "",
      sourceRef,
      contentHash,
    );
    const match = byKey.get(key);
    if (!match) {
      throw new Error(`lifecycle LLM returned an unknown row key for ${sourceRef}`);
    }
    if (validated.has(key)) {
      throw new Error(`lifecycle LLM returned duplicate decisions for ${sourceRef}`);
    }

    const decisionKind = row.decision_kind;
    if (decisionKind !== "add" && decisionKind !== "supersedes" && decisionKind !== "noop_duplicate") {
      throw new Error(`lifecycle LLM returned invalid decision_kind for ${sourceRef}`);
    }
    const importance = Number(row.importance);
    if (!Number.isFinite(importance) || importance < 0 || importance > 1) {
      throw new Error(`lifecycle LLM returned invalid importance for ${sourceRef}`);
    }
    const rationale = typeof row.rationale === "string" ? row.rationale.trim() : "";
    if (!rationale) {
      throw new Error(`lifecycle LLM returned an empty rationale for ${sourceRef}`);
    }

    const targetId = row.target_id === null || row.target_id === undefined || row.target_id === ""
      ? null
      : String(row.target_id);
    const candidateIds = new Set(classified.find(({ work }) => work.key === key)?.candidates.map((candidate) => candidate.id) ?? []);
    if (decisionKind === "add") {
      if (targetId !== null) {
        throw new Error(`lifecycle LLM returned a target_id for add on ${sourceRef}`);
      }
    } else if (!targetId || !candidateIds.has(targetId)) {
      throw new Error(`lifecycle LLM returned an out-of-pool target_id for ${sourceRef}`);
    }

    validated.set(key, {
      incoming_source_ref: sourceRef,
      incoming_content_hash: contentHash,
      decision_kind: decisionKind,
      target_id: targetId,
      importance,
      rationale,
    });
  }

  return validated;
}

async function fetchStoredDecisions(query: Query, rows: RowWork[]): Promise<Map<string, StoredDecision>> {
  if (rows.length === 0) return new Map();
  const tuples = rows
    .filter((work) => work.row.source_ref !== null)
    .map((work) => `(${q(work.row.source)}, ${q(work.row.source_ref!)}, ${q(work.contentHash)})`);
  if (tuples.length === 0) return new Map();

  const records = await query(
    `SELECT incoming_source, incoming_source_ref, incoming_content_hash, decision_kind,\n` +
      `       winner_insight_id, winner_source, winner_source_ref,\n` +
      `       loser_insight_id, loser_source, loser_source_ref,\n` +
      `       decided_importance, rationale\n` +
      `  FROM insight_lifecycle_decisions\n` +
      ` WHERE user_id = ${SCOPED_USER_ID_SQL}\n` +
      `   AND (incoming_source, incoming_source_ref, incoming_content_hash) IN (${tuples.join(", ")});`,
  );

  return new Map(records.map((row) => [
    lifecycleRowKey(String(row.incoming_source), String(row.incoming_source_ref), String(row.incoming_content_hash)),
    {
      incoming_source: String(row.incoming_source),
      incoming_source_ref: String(row.incoming_source_ref),
      incoming_content_hash: String(row.incoming_content_hash),
      decision_kind: String(row.decision_kind) as InsightLifecycleDecisionKind,
      winner_insight_id: row.winner_insight_id === null || row.winner_insight_id === undefined ? null : String(row.winner_insight_id),
      winner_source: row.winner_source === null || row.winner_source === undefined ? null : String(row.winner_source),
      winner_source_ref: row.winner_source_ref === null || row.winner_source_ref === undefined ? null : String(row.winner_source_ref),
      loser_insight_id: row.loser_insight_id === null || row.loser_insight_id === undefined ? null : String(row.loser_insight_id),
      loser_source: row.loser_source === null || row.loser_source === undefined ? null : String(row.loser_source),
      loser_source_ref: row.loser_source_ref === null || row.loser_source_ref === undefined ? null : String(row.loser_source_ref),
      decided_importance: Number(row.decided_importance),
      rationale: String(row.rationale ?? ""),
    },
  ]));
}

async function fetchCandidateMetadata(query: Query, ids: string[]): Promise<Map<string, CandidateMetadata>> {
  if (ids.length === 0) return new Map();
  const rows = await query(
    `SELECT id, source, source_ref, insight_text, topics_json, importance, strength, occurred_at_ts, last_accessed_ts\n` +
      `  FROM user_insights\n` +
      ` WHERE user_id = ${SCOPED_USER_ID_SQL}\n` +
      `   AND id IN (${ids.map((id) => q(id)).join(", ")});`,
  );
  return new Map(rows.map((row) => [
    String(row.id),
    {
      id: String(row.id),
      source: String(row.source),
      source_ref: row.source_ref === null || row.source_ref === undefined ? null : String(row.source_ref),
      insight_text: String(row.insight_text ?? ""),
      topics: parseJsonArray(row.topics_json),
      importance: Number(row.importance) || 0,
      strength: Number(row.strength) || 0,
      occurred_at_ts: row.occurred_at_ts === null || row.occurred_at_ts === undefined ? null : Number(row.occurred_at_ts),
      last_accessed_ts: row.last_accessed_ts === null || row.last_accessed_ts === undefined ? null : Number(row.last_accessed_ts),
    },
  ]));
}

function buildDecisionSql(userId: string, nowTs: number, records: DecisionRecord[]): string[] {
  return records.map((record) =>
    `INSERT INTO insight_lifecycle_decisions(\n` +
      `  id, user_id, incoming_source, incoming_source_ref, incoming_content_hash, incoming_insight_id,\n` +
      `  decision_kind, winner_insight_id, winner_source, winner_source_ref,\n` +
      `  loser_insight_id, loser_source, loser_source_ref,\n` +
      `  decided_importance, rationale, decided_at_ts, created_at_ts\n` +
      `)\n` +
      `VALUES (\n` +
      `  ${q(decisionRecordId(userId, record.incomingRow.source, record.incomingRow.source_ref ?? "", record.incomingContentHash))},\n` +
      `  ${q(userId)}, ${q(record.incomingRow.source)}, ${q(record.incomingRow.source_ref ?? "")}, ${q(record.incomingContentHash)}, ${q(record.incomingRow.id)},\n` +
      `  ${q(record.decisionKind)}, ${litText(record.winnerInsightId)}, ${litText(record.winnerSource)}, ${litText(record.winnerSourceRef)},\n` +
      `  ${litText(record.loserInsightId)}, ${litText(record.loserSource)}, ${litText(record.loserSourceRef)},\n` +
      `  ${normalizeImportance(record.decidedImportance, record.incomingRow.importance)}, ${q(record.rationale)}, ${nowTs}, ${nowTs}\n` +
      `)\n` +
      `ON CONFLICT (user_id, incoming_source, incoming_source_ref, incoming_content_hash) DO UPDATE SET\n` +
      `  incoming_insight_id = EXCLUDED.incoming_insight_id,\n` +
      `  decision_kind = EXCLUDED.decision_kind,\n` +
      `  winner_insight_id = EXCLUDED.winner_insight_id,\n` +
      `  winner_source = EXCLUDED.winner_source,\n` +
      `  winner_source_ref = EXCLUDED.winner_source_ref,\n` +
      `  loser_insight_id = EXCLUDED.loser_insight_id,\n` +
      `  loser_source = EXCLUDED.loser_source,\n` +
      `  loser_source_ref = EXCLUDED.loser_source_ref,\n` +
      `  decided_importance = EXCLUDED.decided_importance,\n` +
      `  rationale = EXCLUDED.rationale,\n` +
      `  decided_at_ts = EXCLUDED.decided_at_ts;`,
  );
}

function fallbackPlan(
  rows: InsightRow[],
  warnings: string[],
  geminiCallsUsed: number,
  decisionCounts: InsightLifecycleDecisionCounts,
  prefixRows?: Map<string, InsightRow>,
): InsightLifecyclePlan {
  return {
    rows: rows.map((row) => {
      if (!prefixRows || row.source_ref === null) return cloneRow(row);
      const key = lifecycleRowKey(row.source, row.source_ref, insightContentHash(row));
      return prefixRows.get(key) ?? cloneRow(row);
    }),
    lifecycleOwned: rows.map((row) => {
      if (!prefixRows || row.source_ref === null) return false;
      return prefixRows.has(lifecycleRowKey(row.source, row.source_ref, insightContentHash(row)));
    }),
    postWriteSql: [],
    warnings,
    geminiCallsUsed,
    decisionCounts,
  };
}

export async function planInsightLifecycle(options: InsightLifecycleOptions): Promise<InsightLifecyclePlan> {
  const nowTs = options.nowTs ?? (() => Math.floor(Date.now() / 1000));
  const warnings: string[] = [];
  const counts: InsightLifecycleDecisionCounts = {
    add: 0,
    supersedes: 0,
    noopDuplicate: 0,
    replayed: 0,
    overflow: 0,
  };
  const prefixRows = new Map<string, InsightRow>();
  const replayRows = new Map<string, InsightRow>();
  const rows = options.rows.map(cloneRow);
  const llmCallsBefore = options.llm?.callsUsed() ?? 0;
  const storeKind = options.storeKind ?? graphStoreKind;

  if (rows.length === 0) {
    return { rows, lifecycleOwned: [], postWriteSql: [], warnings, geminiCallsUsed: 0, decisionCounts: counts };
  }
  if (storeKind() !== "postgres") {
    warnings.push("insight lifecycle degraded: graph store is not postgres; using plain insight upsert");
    return fallbackPlan(rows, warnings, 0, counts);
  }

  const workRows = rows
    .filter((row) => row.source_ref !== null)
    .map((row) => ({
      row,
      contentHash: insightContentHash(row),
      key: lifecycleRowKey(row.source, row.source_ref!, insightContentHash(row)),
    }));

  try {
    const stored = await fetchStoredDecisions(options.query, workRows);
    const pending: RowWork[] = [];
    const winnerUpdates = new Map<string, { importance: number; strength: number }>();
    const loserSuppressions = new Set<string>();

    for (const work of workRows) {
      const replay = stored.get(work.key);
      if (!replay) {
        pending.push(work);
        continue;
      }

      counts.replayed += 1;
      const replayedRow = cloneRow(work.row);
      replayedRow.importance = normalizeImportance(replay.decided_importance, work.row.importance);
      if (replay.decision_kind === "noop_duplicate") {
        replayedRow.strength = SUPPRESSED_INSIGHT_STRENGTH;
        if (replay.winner_insight_id) {
          winnerUpdates.set(replay.winner_insight_id, {
            importance: Math.max(winnerUpdates.get(replay.winner_insight_id)?.importance ?? 0, replayedRow.importance),
            strength: Math.max(winnerUpdates.get(replay.winner_insight_id)?.strength ?? 0, work.row.strength),
          });
        }
      } else if (replay.decision_kind === "supersedes" && replay.loser_insight_id) {
        loserSuppressions.add(replay.loser_insight_id);
      }
      prefixRows.set(work.key, replayedRow);
      replayRows.set(work.key, replayedRow);
    }

    const maxClassifiedRows = Math.max(0, options.maxClassifiedRows ?? INSIGHT_LIFECYCLE_MAX_CLASSIFIED_ROWS);
    const classified = pending.slice(0, maxClassifiedRows);
    const overflow = pending.slice(maxClassifiedRows);
    counts.overflow = overflow.length;

    if (classified.length === 0) {
      const postWriteSql = [
        ...[...winnerUpdates.entries()].map(([id, update]) =>
          `UPDATE user_insights SET importance = GREATEST(importance, ${update.importance}), strength = GREATEST(strength, ${update.strength}) WHERE user_id = ${q(options.userId)} AND id = ${q(id)};`,
        ),
        ...[...loserSuppressions].map((id) =>
          `UPDATE user_insights SET strength = ${SUPPRESSED_INSIGHT_STRENGTH} WHERE user_id = ${q(options.userId)} AND id = ${q(id)};`,
        ),
      ];
      return {
        rows: rows.map((row) => {
          if (row.source_ref === null) return cloneRow(row);
          const key = lifecycleRowKey(row.source, row.source_ref, insightContentHash(row));
          return prefixRows.get(key) ?? cloneRow(row);
        }),
        lifecycleOwned: rows.map((row) => {
          if (row.source_ref === null) return false;
          return prefixRows.has(lifecycleRowKey(row.source, row.source_ref, insightContentHash(row)));
        }),
        postWriteSql,
        warnings,
        geminiCallsUsed: (options.llm?.callsUsed() ?? llmCallsBefore) - llmCallsBefore,
        decisionCounts: counts,
      };
    }
    if (!options.llm || !options.embedRows) {
      warnings.push("insight lifecycle degraded: Gemini lifecycle seams unavailable; using plain insight upsert");
      return fallbackPlan(rows, warnings, (options.llm?.callsUsed() ?? llmCallsBefore) - llmCallsBefore, counts, prefixRows);
    }

    const vectors = await options.embedRows(classified.map((work) => work.row.insight_text));
    if (vectors.length !== classified.length) {
      throw new Error(`lifecycle embed returned ${vectors.length} vectors for ${classified.length} rows`);
    }

    const candidateBundles: Array<{ work: RowWork; candidates: CandidateSummary[] }> = [];
    for (let index = 0; index < classified.length; index++) {
      const work = classified[index];
      const annRows = await options.query(
        semanticStage1Sql("user_insights", options.userId, vectors[index], {
          limit: INSIGHT_LIFECYCLE_NEIGHBOR_LIMIT,
          mode: "memory_evidence",
        }),
      );
      const candidates = annRows.length === 0
        ? await options.query(recentSameSourceSql(work.row))
        : annRows;
      candidateBundles.push({
        work,
        candidates: candidates.filter((candidate) => {
          const source = candidate.source === null || candidate.source === undefined
            ? work.row.source
            : String(candidate.source);
          const sourceRef = candidate.source_ref === null || candidate.source_ref === undefined
            ? null
            : String(candidate.source_ref);
          return source !== work.row.source || sourceRef !== work.row.source_ref;
        }).map((candidate) => ({
          id: String(candidate.id),
          source_ref: candidate.source_ref === null || candidate.source_ref === undefined ? null : String(candidate.source_ref),
          text: String(candidate.text ?? ""),
          distance: Number(candidate.distance) || 0,
        })),
      });
    }

    const rawPayload = await options.llm.generateJson(buildLifecyclePrompt(candidateBundles));
    const validated = validateDecisionPayload(rawPayload, candidateBundles);
    const targetIds = [...new Set([...validated.values()]
      .map((decision) => decision.target_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0))];
    const metadataById = await fetchCandidateMetadata(options.query, targetIds);
    const decisionRecords: DecisionRecord[] = [];

    for (const { work } of candidateBundles) {
      const raw = validated.get(work.key);
      if (!raw) {
        throw new Error(`lifecycle LLM omitted ${work.row.source_ref}`);
      }
      const nextRow = cloneRow(work.row);
      nextRow.importance = normalizeImportance(raw.importance, work.row.importance);

      if (raw.decision_kind === "add") {
        counts.add += 1;
        prefixRows.set(work.key, nextRow);
        decisionRecords.push({
          incomingRow: work.row,
          incomingContentHash: work.contentHash,
          decisionKind: "add",
          winnerInsightId: null,
          winnerSource: null,
          winnerSourceRef: null,
          loserInsightId: null,
          loserSource: null,
          loserSourceRef: null,
          decidedImportance: nextRow.importance,
          rationale: raw.rationale,
        });
        continue;
      }

      const targetId = raw.target_id!;
      const target = metadataById.get(targetId);
      if (!target) {
        throw new Error(`lifecycle target ${targetId} was not found in user_insights`);
      }

      if (raw.decision_kind === "noop_duplicate") {
        counts.noopDuplicate += 1;
        nextRow.strength = SUPPRESSED_INSIGHT_STRENGTH;
        winnerUpdates.set(target.id, {
          importance: Math.max(winnerUpdates.get(target.id)?.importance ?? 0, nextRow.importance),
          strength: Math.max(winnerUpdates.get(target.id)?.strength ?? 0, work.row.strength),
        });
        decisionRecords.push({
          incomingRow: work.row,
          incomingContentHash: work.contentHash,
          decisionKind: "noop_duplicate",
          winnerInsightId: target.id,
          winnerSource: target.source,
          winnerSourceRef: target.source_ref,
          loserInsightId: work.row.id,
          loserSource: work.row.source,
          loserSourceRef: work.row.source_ref,
          decidedImportance: nextRow.importance,
          rationale: raw.rationale,
        });
      } else {
        counts.supersedes += 1;
        nextRow.strength = Math.max(work.row.strength, target.strength);
        loserSuppressions.add(target.id);
        decisionRecords.push({
          incomingRow: work.row,
          incomingContentHash: work.contentHash,
          decisionKind: "supersedes",
          winnerInsightId: scopedLifecycleInsightId(work.row.id, options.userId),
          winnerSource: work.row.source,
          winnerSourceRef: work.row.source_ref,
          loserInsightId: target.id,
          loserSource: target.source,
          loserSourceRef: target.source_ref,
          decidedImportance: nextRow.importance,
          rationale: raw.rationale,
        });
        if (target.source_ref !== null) {
          const aliasRow: InsightRow = {
            id: target.id,
            source: target.source,
            source_ref: target.source_ref,
            insight_text: target.insight_text,
            topics: target.topics,
            importance: target.importance,
            strength: target.strength,
            occurred_at_ts: target.occurred_at_ts,
            last_accessed_ts: target.last_accessed_ts,
          };
          decisionRecords.push({
            incomingRow: aliasRow,
            incomingContentHash: insightContentHash(aliasRow),
            decisionKind: "noop_duplicate",
            winnerInsightId: scopedLifecycleInsightId(work.row.id, options.userId),
            winnerSource: work.row.source,
            winnerSourceRef: work.row.source_ref,
            loserInsightId: target.id,
            loserSource: target.source,
            loserSourceRef: target.source_ref,
            decidedImportance: normalizeImportance(target.importance, aliasRow.importance),
            rationale: `Replay alias: ${raw.rationale}`,
          });
        }
      }

      prefixRows.set(work.key, nextRow);
    }

    const postWriteSql = [
      ...[...winnerUpdates.entries()].map(([id, update]) =>
        `UPDATE user_insights SET importance = GREATEST(importance, ${update.importance}), strength = GREATEST(strength, ${update.strength}) WHERE user_id = ${q(options.userId)} AND id = ${q(id)};`,
      ),
      ...[...loserSuppressions].map((id) =>
        `UPDATE user_insights SET strength = ${SUPPRESSED_INSIGHT_STRENGTH} WHERE user_id = ${q(options.userId)} AND id = ${q(id)};`,
      ),
      ...buildDecisionSql(options.userId, nowTs(), decisionRecords),
    ];

    return {
      rows: rows.map((row) => {
        if (row.source_ref === null) return cloneRow(row);
        const key = lifecycleRowKey(row.source, row.source_ref, insightContentHash(row));
        return prefixRows.get(key) ?? cloneRow(row);
      }),
      lifecycleOwned: rows.map((row) => {
        if (row.source_ref === null) return false;
        return prefixRows.has(lifecycleRowKey(row.source, row.source_ref, insightContentHash(row)));
      }),
      postWriteSql,
      warnings,
      geminiCallsUsed: (options.llm.callsUsed() ?? llmCallsBefore) - llmCallsBefore,
      decisionCounts: counts,
    };
  } catch (err: any) {
    warnings.push(`insight lifecycle degraded: ${err?.message ?? err}`);
    return fallbackPlan(rows, warnings, (options.llm?.callsUsed() ?? llmCallsBefore) - llmCallsBefore, counts, replayRows);
  }
}
