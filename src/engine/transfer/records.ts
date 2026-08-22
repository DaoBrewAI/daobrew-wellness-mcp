import { q } from "../../graph-db.js";
import { SCOPED_USER_ID_SQL } from "../user-scope.js";
import { GeminiEmbeddingProvider } from "../embeddings/gemini.js";
import { EmbeddingProvider } from "../embeddings/provider.js";
import { vectorLiteral } from "../embeddings/sweep.js";
import { contributorHash, transferRecordId } from "../memory/keys.js";
import { isOptedIn } from "./consent.js";
import { canonicalTriggerText } from "./vectors.js";

/**
 * 5B anonymized what-worked emitter. Called from the nightly settlement pass
 * the moment a thread's verify cycle reaches a verdict — the only point where
 * "method + outcome" is a settled fact. The record deliberately carries:
 *   method   — structured brief fields (suggested_block, artifact_spec) ONLY
 *   outcome  — verdict mapped to worked / did_not_work
 *   context  — coarse bucket {stress_pattern, root_cause_class} (D6)
 *   identity — a salted contributor hash, never user_id
 * brief.cause/evidence prose and artifact_ref paths never cross this boundary.
 */

type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;

export interface EmitTransferRecordInput {
  userId: string;
  ghostId: string;
  threadKey: string;
  threadId: string;
  handledAtTs: number;
  verdict: string;
  /** The done root's props (already loaded by the settlement pass). */
  ghostProps: Record<string, any>;
  /** Server-custody salt; empty → fail closed with a warning. */
  salt: string;
  /** null → emit with NULL embedding (backfillable); trigger_text is stored. */
  provider: EmbeddingProvider | null;
  exec: Exec;
  query: Query;
  nowTs: number;
}

export interface EmitTransferRecordResult {
  written: number;
  warnings: string[];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function litText(value: string | null | undefined): string {
  return value === null || value === undefined ? "NULL" : q(String(value));
}

/** First entry of the future action ontology; constant until more method shapes exist. */
const METHOD_CLASS = "task_package";

/**
 * Fixed engine-local frame, matching VERIFY_TZ_OFFSET_HOURS in memory/verify.ts
 * and the localDayKey convention in reasoner/v2Context.ts.
 */
const TRANSFER_TZ_OFFSET_HOURS = -7;

/**
 * Week bucket (Monday-start) containing `epochSeconds` in the fixed-offset local
 * frame. `key` is the Monday's YYYY-MM-DD; `startTs` is the epoch seconds of
 * Monday 00:00 in that frame — the only timestamp transfer_records may store
 * (privacy: exact_ts_absent).
 */
function weekBucket(epochSeconds: number, offsetHours: number): { key: string; startTs: number } {
  const shifted = new Date((epochSeconds + offsetHours * 3600) * 1000);
  const dayStartMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  const mondayMs = dayStartMs - daysSinceMonday * 86_400_000;
  return {
    key: new Date(mondayMs).toISOString().slice(0, 10),
    startTs: mondayMs / 1000 - offsetHours * 3600,
  };
}

/** Gemini needs a key; jobs degrade to NULL-embedding rows without one. */
export function resolveTransferProvider(): EmbeddingProvider | null {
  try {
    return new GeminiEmbeddingProvider();
  } catch {
    return null;
  }
}

export async function emitTransferRecord(input: EmitTransferRecordInput): Promise<EmitTransferRecordResult> {
  const warnings: string[] = [];
  if (input.verdict !== "no_recurrence_observed" && input.verdict !== "pattern_recurred") {
    return { written: 0, warnings }; // insufficient_observation settles nothing transferable
  }
  if (!(await isOptedIn(input.userId, input.query))) {
    return { written: 0, warnings }; // default-closed, silently
  }
  if (!input.salt) {
    return { written: 0, warnings: ["transfer record skipped: DAOBREW_TRANSFER_SALT unset (fail closed)"] };
  }

  const props = input.ghostProps;
  const stressPattern = typeof props.selected_pattern === "string" && props.selected_pattern.trim()
    ? props.selected_pattern
    : "unknown";
  const rootCauseClass = typeof props.root_cause_class === "string" && props.root_cause_class.trim()
    ? props.root_cause_class
    : "productivity";
  const trigger = canonicalTriggerText({
    stressPattern,
    rootCauseClass,
    contextTerms: stringArray(props.linked_patterns),
  });

  let embeddingLiteral = "NULL";
  if (input.provider) {
    const [vector] = await input.provider.embed([trigger]);
    embeddingLiteral = vectorLiteral(vector);
  } else {
    warnings.push("transfer trigger embedding skipped: no embedding provider (row is backfillable)");
  }

  const brief = props.brief && typeof props.brief === "object" ? props.brief as Record<string, any> : {};
  const method = {
    suggested_block: brief.suggested_block ?? null,
    artifact_spec: typeof brief.artifact_spec === "string" ? brief.artifact_spec : null,
  };
  const outcome = input.verdict === "no_recurrence_observed" ? "worked" : "did_not_work";

  const verdictRows = await input.query(
    `SELECT verdict FROM thread_verifications WHERE user_id = ${SCOPED_USER_ID_SQL} AND thread_id = ${q(input.threadId)} AND kind = 'verdict'`,
  );
  let confirmations = 0;
  let contradictions = 0;
  for (const row of verdictRows) {
    if (row.verdict === "no_recurrence_observed") confirmations += 1;
    else if (row.verdict === "pattern_recurred") contradictions += 1;
  }
  const settled = confirmations + contradictions;
  const outcomeStrength = settled > 0 ? Number((confirmations / settled).toFixed(4)) : 0;

  const hash = contributorHash(input.userId, input.salt);
  const id = transferRecordId({ contributorHash: hash, threadKey: input.threadKey, handledAtTs: input.handledAtTs });
  const contextBucket = { stress_pattern: stressPattern, root_cause_class: rootCauseClass };

  // §6.3 provenance: quality tiers travel with the record; the Reasoner stamps
  // source_quality into the episode root props, claim_level is the evidence tier.
  const sourceQuality = textOrNull(props.source_quality);
  const evidenceQuality = textOrNull(props.claim_level);
  // §6.2.4 exact_ts_absent: created_at_ts is coarsened to the week-bucket start —
  // the exact emission timestamp never reaches the cross-user store.
  const week = weekBucket(input.nowTs, TRANSFER_TZ_OFFSET_HOURS);

  await input.exec(
    `INSERT INTO transfer_records(id, contributor_hash, trigger_embedding, trigger_text, method_json, outcome, outcome_strength, context_bucket_json, source_quality, evidence_quality, method_class, created_week_bucket, created_at_ts)\n` +
      `VALUES (${q(id)}, ${q(hash)}, ${embeddingLiteral}, ${q(trigger)}, ${q(JSON.stringify(method))}::jsonb, ${q(outcome)}, ${outcomeStrength}, ${q(JSON.stringify(contextBucket))}::jsonb, ${litText(sourceQuality)}, ${litText(evidenceQuality)}, ${q(METHOD_CLASS)}, ${q(week.key)}, ${week.startTs})\n` +
      `ON CONFLICT (id) DO NOTHING;`,
  );
  return { written: 1, warnings };
}
