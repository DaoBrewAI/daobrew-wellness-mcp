import { vectorLiteral } from "../embeddings/sweep.js";

/**
 * 5B two-stage transfer retrieval.
 *
 * Stage 1 is a PURE ANN query — a bare `ORDER BY trigger_embedding <=> $vec`
 * so the partial HNSW index is actually used. Mixing weights into that
 * ORDER BY defeats the index; all weighting lives here in Stage 2. The Stage-1
 * candidate pool is capped at STAGE1_LIMIT_DEFAULT by user decision
 * (computation vs information tradeoff; per-call stage1Limit overrides).
 * Compounding recall mode with the per-contributor cap below: if one
 * contributor dominates the nearest neighbors, the served set can be smaller
 * than k even when the bucket holds diverse contributors just outside the pool.
 *
 * Stage 2 re-ranks in TypeScript with the locked cross-user weights
 * (trigger 0.5 / outcome 0.3 / context 0.2) and w_rec = 0 BY DESIGN: if the
 * cause matches, when it worked for the other user does not matter.
 *
 * k-anonymity is enforced at READ time (D2): a context bucket served to a
 * borrower must have >= 5 distinct contributors in the pool, else the whole
 * bucket is suppressed. Records keep accumulating while suppressed and become
 * servable when the fifth contributor arrives.
 */

type Query = (sql: string) => Promise<Record<string, any>[]>;

export const TRANSFER_WEIGHTS = { trigger: 0.5, outcome: 0.3, context: 0.2 } as const;
export const STAGE1_LIMIT_DEFAULT = 15;
export const FINAL_K_DEFAULT = 3;
export const K_ANON_THRESHOLD_DEFAULT = 5;

export interface ContextBucket {
  stress_pattern: string;
  root_cause_class: string;
}

export interface ScoredTransferCandidate {
  id: string;
  method_json: Record<string, unknown>;
  outcome: string;
  outcome_strength: number;
  context_bucket_json: ContextBucket;
  score: number;
}

export interface TransferRetrievalResult {
  source: "transfer_records" | "population_priors" | "none";
  candidates: ScoredTransferCandidate[];
  /** Cohort aggregate served when the neighbor pool is empty/suppressed. */
  prior?: object;
}

export function stage1AnnSql(triggerVector: number[], limit: number = STAGE1_LIMIT_DEFAULT): string {
  const vec = vectorLiteral(triggerVector);
  return (
    `SELECT id, contributor_hash, method_json, outcome, outcome_strength, context_bucket_json, created_at_ts,\n` +
    `       trigger_embedding <=> ${vec} AS distance\n` +
    `  FROM transfer_records\n` +
    ` WHERE trigger_embedding IS NOT NULL AND outcome = 'worked'\n` +
    ` ORDER BY trigger_embedding <=> ${vec}\n` +
    ` LIMIT ${limit};`
  );
}

/** Distinct-contributor counts per coarse bucket — a separate grouped query
 *  (window functions cannot COUNT(DISTINCT), and the ANN query stays pure). */
export function bucketContributorCountsSql(): string {
  return (
    `SELECT context_bucket_json ->> 'stress_pattern' AS stress_pattern,\n` +
    `       context_bucket_json ->> 'root_cause_class' AS root_cause_class,\n` +
    `       COUNT(DISTINCT contributor_hash) AS contributors\n` +
    `  FROM transfer_records\n` +
    ` GROUP BY 1, 2;`
  );
}

function parseBucket(value: unknown): ContextBucket {
  let record: Record<string, unknown> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) record = value as Record<string, unknown>;
  else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) record = parsed;
    } catch {
      // fall through to unknowns
    }
  }
  return {
    stress_pattern: typeof record.stress_pattern === "string" ? record.stress_pattern : "unknown",
    root_cause_class: typeof record.root_cause_class === "string" ? record.root_cause_class : "unknown",
  };
}

function bucketKey(bucket: ContextBucket): string {
  return `${bucket.stress_pattern}|${bucket.root_cause_class}`;
}

export function contextFit(candidateBucket: ContextBucket, currentBucket: ContextBucket): number {
  let matches = 0;
  if (candidateBucket.stress_pattern === currentBucket.stress_pattern) matches += 1;
  if (candidateBucket.root_cause_class === currentBucket.root_cause_class) matches += 1;
  return matches / 2;
}

export function rerankTransferCandidates(
  rows: Record<string, any>[],
  currentBucket: ContextBucket,
  k: number = FINAL_K_DEFAULT,
): ScoredTransferCandidate[] {
  const scored = rows.map((row) => {
    const bucket = parseBucket(row.context_bucket_json);
    const distance = Number(row.distance) || 0;
    const outcomeStrength = Number(row.outcome_strength) || 0;
    const score =
      TRANSFER_WEIGHTS.trigger * (1 - distance) +
      TRANSFER_WEIGHTS.outcome * outcomeStrength +
      TRANSFER_WEIGHTS.context * contextFit(bucket, currentBucket);
    return {
      contributorHash: typeof row.contributor_hash === "string" ? row.contributor_hash : "",
      candidate: {
        id: String(row.id),
        method_json: row.method_json && typeof row.method_json === "object" ? row.method_json : {},
        outcome: String(row.outcome),
        outcome_strength: outcomeStrength,
        context_bucket_json: bucket,
        score: Number(score.toFixed(6)),
      },
    };
  });
  scored.sort((a, b) => b.candidate.score - a.candidate.score || a.candidate.id.localeCompare(b.candidate.id));
  // Read-time contribution bound + result diversity (research doc §1.7,
  // "contribution-bounded"): k-anonymity counts distinct contributors in the
  // pool, but without this cap the served top-k could all come from one
  // contributor. Keep only the highest-scoring record per contributor_hash;
  // rows with a missing/empty hash each count as their own contributor.
  const seenContributors = new Set<string>();
  const capped = scored.filter(({ contributorHash }) => {
    if (!contributorHash) return true;
    if (seenContributors.has(contributorHash)) return false;
    seenContributors.add(contributorHash);
    return true;
  });
  // contributor_hash is stripped here — it must never appear on ScoredTransferCandidate.
  return capped.slice(0, k).map(({ candidate }) => candidate);
}

export interface RetrieveTransferCandidatesInput {
  triggerVector: number[];
  contextBucket: ContextBucket;
  query: Query;
  stage1Limit?: number;
  k?: number;
  kAnonThreshold?: number;
  /** §6 fallback: cohort prior served when neighbors are empty/suppressed. */
  readPrior?: (stressPattern: string) => Promise<object | null>;
}

async function priorFallback(input: RetrieveTransferCandidatesInput): Promise<TransferRetrievalResult> {
  const prior = input.readPrior ? await input.readPrior(input.contextBucket.stress_pattern) : null;
  return prior
    ? { source: "population_priors", candidates: [], prior }
    : { source: "none", candidates: [] };
}

export async function retrieveTransferCandidates(
  input: RetrieveTransferCandidatesInput,
): Promise<TransferRetrievalResult> {
  const pool = await input.query(stage1AnnSql(input.triggerVector, input.stage1Limit ?? STAGE1_LIMIT_DEFAULT));
  if (pool.length === 0) return priorFallback(input);

  const threshold = input.kAnonThreshold ?? K_ANON_THRESHOLD_DEFAULT;
  const countRows = await input.query(bucketContributorCountsSql());
  const contributorsByBucket = new Map<string, number>();
  for (const row of countRows) {
    contributorsByBucket.set(
      bucketKey(parseBucket({ stress_pattern: row.stress_pattern, root_cause_class: row.root_cause_class })),
      Number(row.contributors) || 0,
    );
  }
  const servable = pool.filter((row) => {
    const key = bucketKey(parseBucket(row.context_bucket_json));
    return (contributorsByBucket.get(key) ?? 0) >= threshold;
  });
  if (servable.length === 0) return priorFallback(input);

  return {
    source: "transfer_records",
    candidates: rerankTransferCandidates(servable, input.contextBucket, input.k ?? FINAL_K_DEFAULT),
  };
}
