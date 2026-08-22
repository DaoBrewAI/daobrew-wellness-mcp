import { execSql, queryJson, q, graphStoreKind } from "../../graph-db.js";
import { SCOPED_USER_ID_SQL } from "../user-scope.js";
import { GraphDelta } from "../reasoner/types.js";
import { localDayKey } from "../reasoner/v2Context.js";
import { deriveThreadKey, threadId, verificationId } from "./keys.js";

/**
 * G5 verify-loop observation writers (Workstream V3): when a done root
 * re-fires, `upsertGraphDelta` returns `skipped_done` and WRITES NOTHING
 * (upsert.ts) — so recurrence is observable only at run time, here. Every
 * write is Postgres-only (thread_verifications is a warm-tier table),
 * idempotent by construction (deterministic ids + ON CONFLICT DO NOTHING),
 * and fail-soft at the call site (run.ts wraps calls in try/catch →
 * warnings). No predictions exist in the MVP, so predicted_outcome is
 * honestly fixed: the done thread was expected NOT to re-trigger within
 * the verify horizon.
 *
 * Id-bucket namespace (verificationId hashes the bucket verbatim, so the
 * prefixes are this module's contract): same_thread_trigger buckets are
 * `wk:<observed_week_start>`, engine_ran_no_trigger buckets are
 * `day:<local YYYY-MM-DD>` — both raw values are bare YYYY-MM-DD dates and
 * would mint the SAME id every Monday. V5 verdict rows must follow the
 * convention with `vd:<handled_at_ts>` (an epoch can't collide with a
 * date, but the prefix keeps the namespace uniform).
 */

type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;

const PREDICTED_OUTCOME = "no_same_thread_trigger_within_horizon";

/** Day-bucket timezone for engine_ran_no_trigger observations: the engine's
 *  existing fixed-offset convention (v2Context DEFAULT_OFFSET_HOURS = -7,
 *  used by coverage/signature localDayKey). Not exported there, so pinned
 *  here — keep the two in sync if the engine ever grows a real tz config. */
const VERIFY_TZ_OFFSET_HOURS = -7;

function litText(value: string | null | undefined): string {
  return value === null || value === undefined ? "NULL" : q(String(value));
}

function litNum(value: number | null | undefined, field: string): string {
  if (value === null || value === undefined) return "NULL";
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric value for ${field}: ${value}`);
  return String(value);
}

function litJson(value: unknown): string {
  return `${q(JSON.stringify(value ?? null))}::jsonb`;
}

function parseProps(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, any>;
    } catch {
      // fall through to empty props
    }
  }
  return {};
}

function finiteOrNull(value: unknown): number | null {
  const num = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) ? num : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Handled timestamp for a done ghost whose props are already in hand:
 *  props.done_at_ts (stamped by daobrew_detonate_done since V2) ?? the
 *  e_done_<ghostId> edge's created_at_ts (the only persisted
 *  handled-timestamp before that). Shared with the V5 settlement pass
 *  (nightly.ts) so both sides resolve the same `vd:<handled>` bucket. */
export async function resolveHandledAtTs(
  userId: string,
  ghostId: string,
  ghostProps: Record<string, any>,
  query: Query,
): Promise<number | null> {
  const handled = finiteOrNull(ghostProps.done_at_ts);
  if (handled !== null) return handled;
  const edgeRows = await query(
    `SELECT created_at_ts FROM graph_edges WHERE user_id = ${SCOPED_USER_ID_SQL} AND id = ${q(`e_done_${ghostId}`)}`,
  );
  return finiteOrNull(edgeRows[0]?.created_at_ts);
}

/** Handled timestamp for a done ghost, fetching its props first. */
async function handledAtTs(
  userId: string,
  ghostId: string,
  query: Query,
): Promise<{ handled: number | null; ghostProps: Record<string, any> }> {
  const ghostRows = await query(
    `SELECT props_json FROM graph_nodes WHERE user_id = ${SCOPED_USER_ID_SQL} AND id = ${q(ghostId)}`,
  );
  const ghostProps = parseProps(ghostRows[0]?.props_json);
  const handled = await resolveHandledAtTs(userId, ghostId, ghostProps, query);
  return { handled, ghostProps };
}

export interface RecordSkippedDoneObservationInput {
  userId: string;
  /** The done root that re-fired (upsert result's armed_node_id). */
  ghostId: string;
  /** The UNWRITTEN delta the reasoner built this run — its root props carry
   *  the observed pattern/week/claim evidence that never reached the graph. */
  delta: GraphDelta;
  exec?: Exec;
  query?: Query;
  nowTs?: number;
}

export interface RecordObservationResult {
  written: number;
}

/**
 * Record a same_thread_trigger observation when a run's armed delta was
 * skipped because the persistent root is already done. Bucketed by the
 * delta root's week_start, so a same-week re-fire is a single row.
 */
export async function recordSkippedDoneObservation(
  input: RecordSkippedDoneObservationInput,
): Promise<RecordObservationResult> {
  if (graphStoreKind() !== "postgres") return { written: 0 };
  const exec = input.exec ?? execSql;
  const query = input.query ?? queryJson;
  const now = input.nowTs ?? Math.floor(Date.now() / 1000);
  const { userId, ghostId } = input;

  const { handled, ghostProps } = await handledAtTs(userId, ghostId, query);

  const rootNode = input.delta.nodes.find((node) => node.id === input.delta.armed_root_cause.node_id);
  const rootProps = parseProps(rootNode?.props_json);
  const weekStart =
    textOrNull(rootProps.week_start) ??
    // Defensive fallback only: buildDelta always stamps week_start on the
    // armed root. An ISO week key keeps the id deterministic regardless.
    new Date(now * 1000).toISOString().slice(0, 10);

  const threadKey = deriveThreadKey({ graphRootId: ghostId });
  const tid = threadId(userId, threadKey);
  // bucket prefixed — week_start and localDayKey are both YYYY-MM-DD and collide on Mondays
  const id = verificationId({ threadId: tid, kind: "observation", bucket: `wk:${weekStart}` });
  const horizon = finiteOrNull(rootProps.verify_horizon_weeks) ?? finiteOrNull(ghostProps.verify_horizon_weeks);
  const details = {
    selected_pattern: rootProps.selected_pattern ?? null,
    week_start: rootProps.week_start ?? null,
    verify_horizon_weeks: rootProps.verify_horizon_weeks ?? null,
    claim_level: rootProps.claim_level ?? null,
    evidence_grade: rootProps.evidence_grade ?? null,
  };

  await exec(
    `INSERT INTO thread_verifications(id, user_id, thread_id, thread_key, graph_root_id, kind, observation, handled_at_ts, horizon_weeks, predicted_outcome, observed_pattern_key, observed_week_start, observed_at_ts, details_json, created_at_ts)\n` +
    `VALUES (${q(id)}, ${q(userId)}, ${q(tid)}, ${q(threadKey)}, ${q(ghostId)}, 'observation', 'same_thread_trigger', ${litNum(handled, "handled_at_ts")}, ${litNum(horizon, "horizon_weeks")}, ${q(PREDICTED_OUTCOME)}, ${litText(textOrNull(rootProps.selected_pattern))}, ${q(weekStart)}, ${now}, ${litJson(details)}, ${now})\n` +
    `ON CONFLICT (id) DO NOTHING;`,
  );
  return { written: 1 };
}

export interface RecordCoverageObservationsInput {
  userId: string;
  exec?: Exec;
  query?: Query;
  nowTs?: number;
}

/** MRT randomization v1: a held (control-arm) armed root is an episode that
 *  was deliberately NOT offered — observation-eligible like a done thread,
 *  anchored on armed_at_ts instead of done_at_ts. */
function isHeldControlGhost(props: Record<string, any>): boolean {
  return props.status === "armed" && props.offer_state === "held";
}

/**
 * Coverage observations (D2): when a Postgres run ends watching/no_signal,
 * write one engine_ran_no_trigger row per done thread — "the engine ran
 * today and this handled thread did NOT re-fire". The local-day bucket in
 * the deterministic id caps it at 1/day/thread, which is what makes the
 * no_recurrence_observed verdict reachable at settlement (≥N quiet days).
 * MUST run BEFORE any watching upsert for the same run: a watching write
 * replaces ghost props wholesale (mergeGhostProps) and erases status='done'.
 *
 * MRT v1: held control episodes join the scan — a quiet run is equally
 * evidence that a withheld offer's pattern did not re-fire today. Their rows
 * carry handled_at_ts = armed_at_ts (episode anchor) and an arm:"control"
 * detail so settlement can tell the arms apart.
 */
export async function recordCoverageObservations(
  input: RecordCoverageObservationsInput,
): Promise<RecordObservationResult> {
  if (graphStoreKind() !== "postgres") return { written: 0 };
  const exec = input.exec ?? execSql;
  const query = input.query ?? queryJson;
  const now = input.nowTs ?? Math.floor(Date.now() / 1000);
  const { userId } = input;

  const rows = await query(
    `SELECT id, props_json FROM graph_nodes WHERE user_id = ${SCOPED_USER_ID_SQL} AND kind = 'ghost' AND (props_json ->> 'status' = 'done' OR (props_json ->> 'status' = 'armed' AND props_json ->> 'offer_state' = 'held'))`,
  );
  if (rows.length === 0) return { written: 0 };

  const day = localDayKey(now, VERIFY_TZ_OFFSET_HOURS);
  const values = rows.map((row) => {
    const props = parseProps(row.props_json);
    const ghostId = String(row.id);
    const held = isHeldControlGhost(props);
    const handled = finiteOrNull(held ? props.armed_at_ts : props.done_at_ts);
    const details = held ? { local_day: day, arm: "control" } : { local_day: day };
    const threadKey = deriveThreadKey({ graphRootId: ghostId });
    const tid = threadId(userId, threadKey);
    // bucket prefixed — week_start and localDayKey are both YYYY-MM-DD and collide on Mondays
    const id = verificationId({ threadId: tid, kind: "observation", bucket: `day:${day}` });
    return `(${q(id)}, ${q(userId)}, ${q(tid)}, ${q(threadKey)}, ${q(ghostId)}, 'observation', 'engine_ran_no_trigger', ${litNum(handled, "handled_at_ts")}, ${litNum(finiteOrNull(props.verify_horizon_weeks), "horizon_weeks")}, ${q(PREDICTED_OUTCOME)}, ${now}, ${litJson(details)}, ${now})`;
  });

  await exec(
    `INSERT INTO thread_verifications(id, user_id, thread_id, thread_key, graph_root_id, kind, observation, handled_at_ts, horizon_weeks, predicted_outcome, observed_at_ts, details_json, created_at_ts)\n` +
    `VALUES\n${values.join(",\n")}\n` +
    `ON CONFLICT (id) DO NOTHING;`,
  );
  return { written: rows.length };
}

export interface RecordHeldTriggerObservationInput {
  userId: string;
  /** The held control root that is still firing. */
  ghostId: string;
  /** Its post-upsert props (status/offer_state/week fields already merged). */
  ghostProps: Record<string, any>;
  exec?: Exec;
  nowTs?: number;
}

/**
 * Control-arm recurrence (MRT v1): a held root that the engine re-arms in a
 * LATER week than its arming week is the counterfactual analog of a done
 * thread re-firing — the pattern persisted without the offer. Bucketed by the
 * current week_start (`wk:` namespace, same as skipped-done triggers) so
 * within-week re-arms collapse to one row; the arming week itself never
 * counts (the episode IS that firing). Postgres-only, idempotent, fail-soft
 * at the call site.
 */
export async function recordHeldTriggerObservation(
  input: RecordHeldTriggerObservationInput,
): Promise<RecordObservationResult> {
  if (graphStoreKind() !== "postgres") return { written: 0 };
  const exec = input.exec ?? execSql;
  const now = input.nowTs ?? Math.floor(Date.now() / 1000);
  const props = input.ghostProps ?? {};
  if (!isHeldControlGhost(props)) return { written: 0 };
  const weekStart = textOrNull(props.week_start);
  const firstWeek = textOrNull(props.first_seen_week) ?? weekStart;
  if (!weekStart || weekStart === firstWeek) return { written: 0 };

  const handled = finiteOrNull(props.armed_at_ts);
  const horizon = finiteOrNull(props.verify_horizon_weeks);
  const threadKey = deriveThreadKey({ graphRootId: input.ghostId });
  const tid = threadId(input.userId, threadKey);
  const id = verificationId({ threadId: tid, kind: "observation", bucket: `wk:${weekStart}` });
  const details = {
    arm: "control",
    selected_pattern: props.selected_pattern ?? null,
    week_start: weekStart,
    first_seen_week: firstWeek,
    verify_horizon_weeks: props.verify_horizon_weeks ?? null,
    claim_level: props.claim_level ?? null,
  };

  await exec(
    `INSERT INTO thread_verifications(id, user_id, thread_id, thread_key, graph_root_id, kind, observation, handled_at_ts, horizon_weeks, predicted_outcome, observed_pattern_key, observed_week_start, observed_at_ts, details_json, created_at_ts)\n` +
    `VALUES (${q(id)}, ${q(input.userId)}, ${q(tid)}, ${q(threadKey)}, ${q(input.ghostId)}, 'observation', 'same_thread_trigger', ${litNum(handled, "handled_at_ts")}, ${litNum(horizon, "horizon_weeks")}, ${q(PREDICTED_OUTCOME)}, ${litText(textOrNull(props.selected_pattern))}, ${q(weekStart)}, ${now}, ${litJson(details)}, ${now})\n` +
    `ON CONFLICT (id) DO NOTHING;`,
  );
  return { written: 1 };
}
