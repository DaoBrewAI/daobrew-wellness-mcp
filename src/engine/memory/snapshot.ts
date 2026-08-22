import { randomUUID } from "node:crypto";
import { execSql, queryJson, q, graphStoreKind } from "../../graph-db.js";
import { SCOPED_USER_ID_SQL } from "../user-scope.js";
import { postAlertWebhook } from "../ingest/jobs.js";
import { compareClaimLevels, lintCausalLanguage } from "./claims.js";
import { snapshotId } from "./keys.js";
import { GeminiTextProvider, TextGenerationProvider } from "./llm.js";
import { resolveGeminiApiKey } from "../local-config.js";
import { CLAIM_LEVELS, MemoryClaimLevel } from "./types.js";

/**
 * Layer 2 weekly snapshot: render the strongest active causal threads into a
 * compact prompt-ready user model via the LLM, validated fail-closed. The LLM
 * writes human-readable language only — it cannot merge threads, promote claim
 * levels, or cite ids outside the provided allowlist. Invalid output (after
 * one retry) keeps the previous snapshot and records the failure in
 * pipeline_metrics so staleness stays visible.
 */

const JOB_NAME = "layer2:snapshot";
const MAX_THREADS_DEFAULT = 8;
const MAX_TOTAL_ITEMS = 16;
const MAX_JSON_LENGTH = 4000;
const STALE_AFTER_SECONDS = 14 * 24 * 60 * 60;

type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;

export interface SnapshotThreadFacts {
  id: string;
  title: string;
  summary: string | null;
  claim_level: MemoryClaimLevel;
  recurrence_count: number;
  pattern_keys: string[];
  evidence_count: number;
  first_seen_ts: number | null;
  last_seen_ts: number | null;
  strength: number;
}

export interface SnapshotSection {
  text: string;
  thread_id: string;
}

export interface SnapshotModel {
  recurring_stressors: SnapshotSection[];
  pattern_tendencies: SnapshotSection[];
  intervention_response: SnapshotSection[];
  inference_cautions: SnapshotSection[];
}

const SECTION_KEYS = [
  "recurring_stressors",
  "pattern_tendencies",
  "intervention_response",
  "inference_cautions",
] as const;

const SECTION_HEADERS: Record<(typeof SECTION_KEYS)[number], string> = {
  recurring_stressors: "## Recurring stressors",
  pattern_tendencies: "## Pattern tendencies",
  intervention_response: "## Intervention response",
  inference_cautions: "## Inference cautions",
};

const LANGUAGE_GUIDANCE: Record<MemoryClaimLevel, string> = {
  correlation: "correlational language only (co-occurs with, was followed by); never causal verbs",
  attribution_candidate: "correlational language only (co-occurs with, was followed by); never causal verbs",
  causal_hypothesis: "hedged causal language allowed (may contribute to, likely relates to); never definitive claims",
  validated_pattern: "confident language allowed, but never 'proves' or 'certainly'",
};

export interface WeeklySnapshotJobDeps {
  userId: string;
  exec?: Exec;
  query?: Query;
  nowTs?: () => number;
  llm?: TextGenerationProvider;
  maxThreads?: number;
  alertWebhook?: string;
  fetchImpl?: typeof fetch;
}

export interface WeeklySnapshotJobResult {
  written: boolean;
  version?: number;
  warnings: string[];
  alerts: string[];
}

export function claimCeiling(threads: Array<Pick<SnapshotThreadFacts, "claim_level">>): MemoryClaimLevel {
  let ceiling: MemoryClaimLevel = "correlation";
  for (const thread of threads) {
    if (compareClaimLevels(thread.claim_level, ceiling) > 0) ceiling = thread.claim_level;
  }
  return ceiling;
}

export function buildSnapshotPrompt(threads: SnapshotThreadFacts[]): string {
  const facts = threads.map((thread) => ({
    thread_id: thread.id,
    title: thread.title,
    summary: thread.summary,
    claim_level: thread.claim_level,
    language_rule: LANGUAGE_GUIDANCE[thread.claim_level],
    recurrence_count: thread.recurrence_count,
    pattern_keys: thread.pattern_keys,
    evidence_count: thread.evidence_count,
    first_seen_ts: thread.first_seen_ts,
    last_seen_ts: thread.last_seen_ts,
    strength: thread.strength,
  }));
  return [
    "You summarize a user's causal memory threads into a compact wellness user model.",
    "",
    "Rules:",
    "- Cite exactly one thread_id per item, chosen ONLY from the thread list below.",
    "- Do not merge threads, do not upgrade claim language, do not add uncited observations.",
    "- Respect each thread's language_rule for what causal language is allowed.",
    "- At most 4 items per section. Keep every item to one short sentence.",
    "- Return JSON only, exactly this shape:",
    '{"recurring_stressors":[{"text":"...","thread_id":"..."}],"pattern_tendencies":[{"text":"...","thread_id":"..."}],"intervention_response":[{"text":"...","thread_id":"..."}],"inference_cautions":[{"text":"...","thread_id":"..."}]}',
    "",
    `Threads: ${JSON.stringify(facts)}`,
  ].join("\n");
}

export interface SnapshotValidationVerdict {
  ok: boolean;
  errors: string[];
}

export function validateSnapshotModel(
  raw: unknown,
  threads: Array<Pick<SnapshotThreadFacts, "id" | "claim_level">>,
): SnapshotValidationVerdict {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["not_an_object"] };
  }
  const model = raw as Record<string, unknown>;
  const claimByThread = new Map(threads.map((thread) => [thread.id, thread.claim_level]));
  let totalItems = 0;
  for (const key of SECTION_KEYS) {
    const section = model[key];
    if (!Array.isArray(section)) {
      errors.push(`missing_section: ${key}`);
      continue;
    }
    section.forEach((item, index) => {
      totalItems += 1;
      if (!item || typeof item !== "object") {
        errors.push(`invalid_item: ${key}[${index}]`);
        return;
      }
      const text = (item as any).text;
      const threadRef = (item as any).thread_id;
      if (typeof text !== "string" || !text.trim()) {
        errors.push(`empty_text: ${key}[${index}]`);
        return;
      }
      if (typeof threadRef !== "string" || !claimByThread.has(threadRef)) {
        errors.push(`unknown_thread_id: ${String(threadRef)}`);
        return;
      }
      errors.push(...lintCausalLanguage(text, claimByThread.get(threadRef)!));
    });
  }
  if (totalItems > MAX_TOTAL_ITEMS) errors.push(`too_many_items: ${totalItems}`);
  const serialized = JSON.stringify(raw)?.length ?? 0;
  if (serialized > MAX_JSON_LENGTH) errors.push(`oversized_json: ${serialized}`);
  return { ok: errors.length === 0, errors };
}

export function renderSnapshotText(
  model: SnapshotModel,
  _threads: Array<Pick<SnapshotThreadFacts, "id">>,
): string {
  const sections = SECTION_KEYS.map((key) => {
    const bullets = model[key].map((item) => `- ${item.text.trim()} [${item.thread_id}]`);
    return [SECTION_HEADERS[key], ...bullets].join("\n");
  });
  return sections.join("\n\n");
}

function citedThreadIds(model: SnapshotModel): string[] {
  const ids = new Set<string>();
  for (const key of SECTION_KEYS) {
    for (const item of model[key]) ids.add(item.thread_id);
  }
  return [...ids].sort();
}

function litText(value: string | null | undefined): string {
  return value === null || value === undefined ? "NULL" : q(String(value));
}

function litJson(value: unknown): string {
  return `${q(JSON.stringify(value ?? null))}::jsonb`;
}

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

async function writeMetrics(
  exec: Exec,
  nowTs: () => number,
  startTs: number,
  rowsWritten: number,
  llmCalls: number,
  warnings: string[],
): Promise<void> {
  const durationMs = Math.max(0, (nowTs() - startTs) * 1000);
  await exec(
    `INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
      `VALUES (${q(`metric_${randomUUID()}`)}, ${q(JOB_NAME)}, ${durationMs}, ${rowsWritten}, 0, ${llmCalls}, 0, 0, ${q(JSON.stringify(warnings))}::jsonb, ${nowTs()});`,
  );
}

async function recordFailure(
  deps: WeeklySnapshotJobDeps,
  err: unknown,
  startTs: number,
  llmCalls: number,
): Promise<void> {
  const exec = deps.exec ?? execSql;
  const nowTs = deps.nowTs ?? (() => Math.floor(Date.now() / 1000));
  const message = String((err as any)?.message ?? err).slice(0, 500);
  try {
    await writeMetrics(exec, nowTs, startTs, 0, llmCalls, [`job_failed: ${message}`]);
  } catch {
    // metrics are best-effort on the failure path; the original error still propagates
  }
  await postAlertWebhook(JOB_NAME, [`job_failed: ${message}`], deps);
}

export async function runWeeklySnapshotJob(deps: WeeklySnapshotJobDeps): Promise<WeeklySnapshotJobResult> {
  if (!(deps.exec && deps.query) && graphStoreKind() !== "postgres") {
    throw new Error(
      "runWeeklySnapshotJob requires DAOBREW_GRAPH_STORE=postgres; layer 2 memory is Postgres-only",
    );
  }
  const exec = deps.exec ?? execSql;
  const query = deps.query ?? queryJson;
  const nowTs = deps.nowTs ?? (() => Math.floor(Date.now() / 1000));
  const userId = deps.userId;
  const maxThreads = deps.maxThreads ?? MAX_THREADS_DEFAULT;
  const startTs = nowTs();
  let llm: TextGenerationProvider | null = deps.llm ?? null;
  const llmCalls = (): number => llm?.callsUsed() ?? 0;

  try {
    const rows = await query(
      `SELECT t.id, t.title, t.summary, t.claim_level, t.recurrence_count, t.pattern_keys_json, t.first_seen_ts, t.last_seen_ts, t.strength,\n` +
        `  (SELECT COUNT(*) FROM causal_thread_evidence e WHERE e.thread_id = t.id) AS evidence_count\n` +
        `FROM causal_memory_threads t\n` +
        `WHERE t.user_id = ${SCOPED_USER_ID_SQL} AND t.status = 'active' AND t.decay_state = 'active'\n` +
        `ORDER BY t.strength DESC, t.last_seen_ts DESC\n` +
        `LIMIT ${maxThreads}`,
    );
    const threads: SnapshotThreadFacts[] = rows.map((row) => ({
      id: String(row.id),
      title: String(row.title ?? row.id),
      summary: typeof row.summary === "string" && row.summary ? row.summary : null,
      claim_level: toClaimLevel(row.claim_level),
      recurrence_count: Number(row.recurrence_count) || 0,
      pattern_keys: parseJsonArray(row.pattern_keys_json ?? row.pattern_keys),
      evidence_count: Number(row.evidence_count) || 0,
      first_seen_ts: finiteOrNull(row.first_seen_ts),
      last_seen_ts: finiteOrNull(row.last_seen_ts),
      strength: Number(row.strength) || 0,
    }));
    // jsonb_agg over the wrapped subquery does not guarantee row order —
    // re-assert strongest-first here so prompt order is deterministic.
    threads.sort(
      (a, b) => b.strength - a.strength || (b.last_seen_ts ?? 0) - (a.last_seen_ts ?? 0),
    );

    if (threads.length === 0) {
      const warnings = ["no_active_threads"];
      await writeMetrics(exec, nowTs, startTs, 0, llmCalls(), warnings);
      return { written: false, warnings, alerts: [] };
    }

    // Fresh-machine guard: an injected llm bypasses the key check entirely
    // (the caller took responsibility); otherwise resolve the key per-call
    // immediately before construction so config edits take effect without a
    // restart. No key anywhere → skip gracefully instead of throwing a 500.
    llm = llm ?? (resolveGeminiApiKey() ? new GeminiTextProvider({ fetchImpl: deps.fetchImpl }) : null);
    if (!llm) {
      const warnings = ["gemini_key_missing: snapshot skipped, previous snapshot retained"];
      const latest = await query(
        `SELECT created_at_ts FROM user_model_snapshots WHERE user_id = ${SCOPED_USER_ID_SQL} ORDER BY version DESC LIMIT 1`,
      );
      const latestTs = finiteOrNull(latest[0]?.created_at_ts);
      if (latestTs === null || nowTs() - latestTs > STALE_AFTER_SECONDS) warnings.push("snapshot_stale");
      await writeMetrics(exec, nowTs, startTs, 0, llmCalls(), warnings);
      return { written: false, warnings, alerts: [] };
    }
    const prompt = buildSnapshotPrompt(threads);

    let model: SnapshotModel | null = null;
    let lastErrors: string[] = [];
    for (let attempt = 0; attempt < 2 && !model; attempt += 1) {
      const attemptPrompt =
        attempt === 0
          ? prompt
          : `${prompt}\n\nYour previous output failed validation: ${lastErrors.join("; ")}\nReturn corrected JSON only.`;
      const raw = await llm.generateJson(attemptPrompt);
      const verdict = validateSnapshotModel(raw, threads);
      if (verdict.ok) model = raw as SnapshotModel;
      else lastErrors = verdict.errors;
    }

    if (!model) {
      // Fail closed: keep the previous snapshot, surface the failure.
      const warnings = [`snapshot_validation_failed: ${lastErrors.join("; ")}`.slice(0, 500)];
      const latest = await query(
        `SELECT created_at_ts FROM user_model_snapshots WHERE user_id = ${SCOPED_USER_ID_SQL} ORDER BY version DESC LIMIT 1`,
      );
      const latestTs = finiteOrNull(latest[0]?.created_at_ts);
      if (latestTs === null || nowTs() - latestTs > STALE_AFTER_SECONDS) warnings.push("snapshot_stale");
      const alerts = [warnings[0]];
      await writeMetrics(exec, nowTs, startTs, 0, llmCalls(), warnings);
      await postAlertWebhook(JOB_NAME, alerts, deps);
      return { written: false, warnings, alerts };
    }

    const versionRows = await query(
      `SELECT COALESCE(MAX(version), 0) AS v FROM user_model_snapshots WHERE user_id = ${SCOPED_USER_ID_SQL}`,
    );
    const version = (finiteOrNull(versionRows[0]?.v) ?? 0) + 1;
    const cited = citedThreadIds(model);
    const citedFacts = threads.filter((thread) => cited.includes(thread.id));
    const snapshotText = renderSnapshotText(model, threads);
    const now = nowTs();
    await exec(
      `INSERT INTO user_model_snapshots(id, user_id, version, snapshot_text, source_thread_ids_json, claim_ceiling, generated_from_count, prompt_tokens_estimate, created_at_ts)\n` +
        `VALUES (${q(snapshotId(userId, version))}, ${q(userId)}, ${version}, ${litText(snapshotText)}, ${litJson(cited)}, ${q(claimCeiling(citedFacts))}, ${threads.length}, ${Math.ceil(prompt.length / 4)}, ${now});`,
    );

    const warnings: string[] = [];
    await writeMetrics(exec, nowTs, startTs, 1, llmCalls(), warnings);
    return { written: true, version, warnings, alerts: [] };
  } catch (err) {
    await recordFailure(deps, err, startTs, llmCalls());
    throw err;
  }
}
