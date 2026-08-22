import { q } from "../../graph-db.js";
import { SCOPED_USER_ID_SQL } from "../user-scope.js";
import { EmbeddingProvider } from "../embeddings/provider.js";
import { vectorLiteral } from "../embeddings/sweep.js";
import { localDayKey } from "../reasoner/v2Context.js";
import { canonicalProfileText } from "./vectors.js";

/**
 * 5B slow vector space: one versioned user-profile vector per local day,
 * derived from closed thread vocabulary (thread keys, pattern keys, claim
 * ceiling) — never snapshot_text prose. This is the Stage-1 query vector for
 * "find similar users" transfer; versions are append-only history.
 */

type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;

/** Same fixed-offset day convention as verify.ts coverage buckets. */
const PROFILE_TZ_OFFSET_HOURS = -7;
const PROFILE_THREAD_CAP = 20;

function patternKeys(value: unknown): string[] {
  const parsed = typeof value === "string" && value.trim() ? safeParse(value) : value;
  return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export interface WriteProfileVectorInput {
  userId: string;
  provider: EmbeddingProvider | null;
  exec: Exec;
  query: Query;
  nowTs: number;
}

export interface WriteProfileVectorResult {
  written: number;
  warnings: string[];
}

export async function writeProfileVector(input: WriteProfileVectorInput): Promise<WriteProfileVectorResult> {
  const threads = await input.query(
    `SELECT thread_key, pattern_keys_json FROM causal_memory_threads WHERE user_id = ${SCOPED_USER_ID_SQL} AND status = 'active' ORDER BY strength DESC, thread_key ASC LIMIT ${PROFILE_THREAD_CAP}`,
  );
  if (threads.length === 0) return { written: 0, warnings: [] }; // nothing to profile — silent

  if (!input.provider) {
    return { written: 0, warnings: ["profile vector skipped: no embedding provider"] };
  }

  const latest = await input.query(
    `SELECT version, created_at_ts FROM user_vectors WHERE user_id = ${SCOPED_USER_ID_SQL} AND kind = 'profile' ORDER BY version DESC LIMIT 1`,
  );
  const today = localDayKey(input.nowTs, PROFILE_TZ_OFFSET_HOURS);
  const latestVersion = Number(latest[0]?.version ?? 0) || 0;
  const latestTs = Number(latest[0]?.created_at_ts ?? NaN);
  if (Number.isFinite(latestTs) && localDayKey(latestTs, PROFILE_TZ_OFFSET_HOURS) === today) {
    return { written: 0, warnings: [] }; // one vector per local day — re-runs are no-ops
  }

  const snapshot = await input.query(
    `SELECT claim_ceiling FROM user_model_snapshots WHERE user_id = ${SCOPED_USER_ID_SQL} ORDER BY version DESC LIMIT 1`,
  );
  const basis = canonicalProfileText({
    dominantPatterns: threads.flatMap((row) => patternKeys(row.pattern_keys_json)),
    threadKeys: threads.map((row) => String(row.thread_key)),
    snapshotClaimCeiling: typeof snapshot[0]?.claim_ceiling === "string" ? snapshot[0].claim_ceiling : null,
  });
  const [vector] = await input.provider.embed([basis]);

  await input.exec(
    `INSERT INTO user_vectors(user_id, kind, version, profile_embedding, basis_text, created_at_ts)\n` +
      `VALUES (${q(input.userId)}, 'profile', ${latestVersion + 1}, ${vectorLiteral(vector)}, ${q(basis)}, ${input.nowTs})\n` +
      `ON CONFLICT (user_id, kind, version) DO NOTHING;`,
  );
  return { written: 1, warnings: [] };
}
