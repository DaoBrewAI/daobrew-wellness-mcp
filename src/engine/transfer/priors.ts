import { randomUUID } from "node:crypto";
import { execSql, q, queryJson } from "../../graph-db.js";
import { sha24 } from "../memory/keys.js";
import { K_ANON_THRESHOLD_DEFAULT } from "./retrieve.js";

/**
 * Design §6, finally built: "a population pattern is a consolidation job with
 * a different GROUP BY." Aggregates the anonymized transfer_records into
 * cohort-level population_priors — the cold-start / sparse-cohort fallback
 * when neighbor retrieval is below k-anonymity. v1 cohort is 'global'
 * (no cohort attributes exist yet — D6). Counts are always published;
 * concrete top_methods are k-anon-gated like the neighbor path.
 */

type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;

const JOB_NAME = "transfer_priors";
const COHORT_KEY = "global";
const TOP_METHODS_CAP = 3;

export interface TransferPriorsJobDeps {
  exec?: Exec;
  query?: Query;
  nowTs?: () => number;
  kAnonThreshold?: number;
}

export interface TransferPriorsJobResult {
  priorsWritten: number;
  version: number | null;
  warnings: string[];
}

export async function runTransferPriorsJob(deps: TransferPriorsJobDeps = {}): Promise<TransferPriorsJobResult> {
  const exec = deps.exec ?? execSql;
  const query = deps.query ?? queryJson;
  const nowTs = deps.nowTs ?? (() => Math.floor(Date.now() / 1000));
  const threshold = deps.kAnonThreshold ?? K_ANON_THRESHOLD_DEFAULT;
  const startTs = nowTs();
  const warnings: string[] = [];

  const aggregates = await query(
    `SELECT context_bucket_json ->> 'stress_pattern' AS stress_pattern, outcome, COUNT(*) AS n, COUNT(DISTINCT contributor_hash) AS contributors\n` +
      `  FROM transfer_records\n` +
      ` GROUP BY 1, 2;`,
  );

  let priorsWritten = 0;
  let version: number | null = null;
  if (aggregates.length > 0) {
    const methodRows = await query(
      `SELECT context_bucket_json ->> 'stress_pattern' AS stress_pattern, method_json, outcome_strength, contributor_hash\n` +
        `  FROM transfer_records\n` +
        ` WHERE outcome = 'worked';`,
    );
    const versionRows = await query(
      `SELECT MAX(version) AS v FROM population_priors WHERE cohort_key = ${q(COHORT_KEY)};`,
    );
    version = (Number(versionRows[0]?.v) || 0) + 1;

    interface PatternAgg {
      worked: number;
      didNotWork: number;
      contributors: number;
    }
    const byPattern = new Map<string, PatternAgg>();
    for (const row of aggregates) {
      const pattern = String(row.stress_pattern ?? "unknown");
      const agg = byPattern.get(pattern) ?? { worked: 0, didNotWork: 0, contributors: 0 };
      const n = Number(row.n) || 0;
      if (row.outcome === "worked") {
        agg.worked += n;
        // Contributor gate keys off WORKED contributors — the only rows whose
        // methods can be published.
        agg.contributors = Math.max(agg.contributors, Number(row.contributors) || 0);
      } else {
        agg.didNotWork += n;
      }
      byPattern.set(pattern, agg);
    }

    for (const [pattern, agg] of [...byPattern.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const topMethods = agg.contributors >= threshold
        ? methodRows
            .filter((row) => String(row.stress_pattern) === pattern)
            .sort((a, b) => (Number(b.outcome_strength) || 0) - (Number(a.outcome_strength) || 0))
            .slice(0, TOP_METHODS_CAP)
            .map((row) => ({ method: row.method_json ?? {}, outcome_strength: Number(row.outcome_strength) || 0 }))
        : [];
      const prior = {
        worked: agg.worked,
        did_not_work: agg.didNotWork,
        top_methods: topMethods,
      };
      const sampleSize = agg.worked + agg.didNotWork;
      const confidence = Number(Math.min(1, agg.contributors / 10).toFixed(4));
      const id = `pp_${sha24([COHORT_KEY, pattern, String(version)].join("|"))}`;
      await exec(
        `INSERT INTO population_priors(id, cohort_key, stress_pattern, prior_json, sample_size, confidence, version, created_at_ts)\n` +
          `VALUES (${q(id)}, ${q(COHORT_KEY)}, ${q(pattern)}, ${q(JSON.stringify(prior))}::jsonb, ${sampleSize}, ${confidence}, ${version}, ${nowTs()})\n` +
          `ON CONFLICT (id) DO NOTHING;`,
      );
      priorsWritten += 1;
    }
  }

  const durationMs = Math.max(0, (nowTs() - startTs) * 1000);
  await exec(
    `INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
      `VALUES (${q(`metric_${randomUUID()}`)}, ${q(JOB_NAME)}, ${durationMs}, ${priorsWritten}, 0, 0, 0, 0, ${q(JSON.stringify(warnings))}::jsonb, ${nowTs()});`,
  );
  return { priorsWritten, version, warnings };
}

export interface PopulationPriorRow {
  stress_pattern: string;
  prior_json: { worked: number; did_not_work: number; top_methods: Array<Record<string, unknown>> };
  sample_size: number;
  confidence: number;
  version: number;
}

export async function readPopulationPrior(
  stressPattern: string,
  query: Query = queryJson,
): Promise<PopulationPriorRow | null> {
  const rows = await query(
    `SELECT stress_pattern, prior_json, sample_size, confidence, version\n` +
      `  FROM population_priors WHERE cohort_key = ${q(COHORT_KEY)} AND stress_pattern = ${q(stressPattern)}\n` +
      ` ORDER BY version DESC LIMIT 1;`,
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const parsed = typeof row.prior_json === "string" ? JSON.parse(row.prior_json) : row.prior_json ?? {};
  return {
    stress_pattern: String(row.stress_pattern),
    prior_json: {
      worked: Number(parsed.worked) || 0,
      did_not_work: Number(parsed.did_not_work) || 0,
      top_methods: Array.isArray(parsed.top_methods) ? parsed.top_methods : [],
    },
    sample_size: Number(row.sample_size) || 0,
    confidence: Number(row.confidence) || 0,
    version: Number(row.version) || 0,
  };
}
