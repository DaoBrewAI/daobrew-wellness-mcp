import { createHash } from "node:crypto";
import { q } from "../graph-db.js";
import { SCOPED_USER_ID_SQL } from "./user-scope.js";
import { sha24 } from "./memory/keys.js";

/**
 * Intervention assignment log — the thin MRT contracts (research doc
 * 2026-07-05 §6.2 c1–c3). Written at the daobrew_detonate serve moment and
 * closed at daobrew_detonate_done. The policy is deterministic today
 * (one eligible action, p=1); the log exists so historical data can support
 * causal claims later — assignment logging is not retroactive.
 *
 * Boundary rules:
 *   - Postgres warm-tier only (sqlite/Sentinel-local runs skip logging).
 *   - Fail-soft by contract: these functions resolve with a warning instead
 *     of rejecting — a logging failure must never break detonation.
 *   - Closed vocabulary + refs only: brief prose, evidence, and artifact
 *     paths never enter this table.
 */

type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;
type StoreKind = "sqlite" | "postgres";

export const ELIGIBLE_ACTIONS = ["task_package"] as const;
export const ASSIGNED_ACTION = "task_package";
export const ASSIGNMENT_PROBABILITY = 1; // deterministic policy — recorded, not assumed
export const ROUTE_POLICY = "deterministic_argmax_v1";

// ── MRT randomization v1 (design 2026-07-06 "Verification-loop completeness"):
// system-initiated offers are randomized AT ARMING TIME. The detonate-time
// deterministic contract above is unchanged — its INSERT..ON CONFLICT DO
// NOTHING simply loses to the arming-time row (same episode id), which is
// exactly the intent-to-treat override semantics for held episodes.
export const OFFER_ELIGIBLE_ACTIONS = ["task_package", "hold_noop"] as const;
export type OfferArm = (typeof OFFER_ELIGIBLE_ACTIONS)[number];
export const RANDOMIZED_ROUTE_POLICY = "randomized_offer_v1";
export const DEFAULT_MRT_TREATMENT_P = 0.9;

/** Treatment probability from env DAOBREW_MRT_TREATMENT_P — default 0.9,
 *  clamped to [0,1]; blank/junk falls back to the default. */
export function mrtTreatmentP(raw: string | undefined = process.env.DAOBREW_MRT_TREATMENT_P): number {
  const parsed = typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_MRT_TREATMENT_P;
  return Math.min(1, Math.max(0, parsed));
}

export interface OfferDraw {
  arm: OfferArm;
  /** Uniform [0,1) derived from sha256 of the episode key — auditable, no RNG state. */
  draw: number;
  /** The clamped treatment probability the draw was evaluated against. */
  treatmentProbability: number;
  /** The ASSIGNED arm's probability: p for treatment, 1-p for control. */
  assignmentProbability: number;
}

/**
 * Hash-deterministic per-episode randomization: sha256(userId|ghostId|armedAtTs)
 * first 6 bytes / 2^48 → uniform [0,1); treatment iff draw < p. The key string
 * joins exactly like assignmentId (null armedAtTs → ""), so the draw and the
 * assignment row describe the same episode. Deterministic by construction:
 * retries within one arming re-draw the SAME arm; a re-arm (fresh armed_at_ts)
 * is a new decision point → fresh draw.
 */
export function drawOfferArm(
  userId: string,
  ghostId: string,
  armedAtTs: number | null,
  p: number,
): OfferDraw {
  const clamped = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : DEFAULT_MRT_TREATMENT_P;
  const digest = createHash("sha256")
    .update([userId, ghostId, String(armedAtTs ?? "")].join("|"))
    .digest();
  const draw = digest.readUIntBE(0, 6) / 2 ** 48;
  const treatment = draw < clamped;
  // Round so float dust (1 - 0.9 = 0.09999...) never reaches the SQL literal.
  const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
  return {
    arm: treatment ? "task_package" : "hold_noop",
    draw,
    treatmentProbability: clamped,
    assignmentProbability: round6(treatment ? clamped : 1 - clamped),
  };
}
export const USER_ACCEPTANCE_VALUES = ["accepted", "edited", "rejected"] as const;
export type UserAcceptance = (typeof USER_ACCEPTANCE_VALUES)[number];

export interface AssignmentKeyInput {
  userId: string;
  ghostId: string;
  /** The episode key — armedEpisodeTs(props, created_at_ts): retries within
   *  one arming collide (idempotent); a re-arm is a new decision point → new id. */
  armedAtTs: number | null;
}

export function assignmentId(input: AssignmentKeyInput): string {
  return `ivn_${sha24([input.userId, input.ghostId, String(input.armedAtTs ?? "")].join("|"))}`;
}

/** The episode timestamp both detonate AND detonate_done key the assignment
 *  id on. Ghost ids are stable across armings and the upsert conflict path
 *  PRESERVES created_at_ts, so only the transition-stamped props.armed_at_ts
 *  (upsert.ts nodeSql) separates episodes — created_at_ts is the fallback for
 *  legacy ghosts armed before the stamp existed. */
export function armedEpisodeTs(
  ghostProps: Record<string, any>,
  createdAtTs: number | null,
): number | null {
  const armed = ghostProps?.armed_at_ts;
  return typeof armed === "number" && Number.isFinite(armed) ? armed : createdAtTs;
}

export interface AssignmentLogResult {
  logged: boolean;
  warning?: string;
}

function vocab(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function litText(value: string | null): string {
  return value === null ? "NULL" : q(value);
}

/** Optional per-call policy override (MRT randomization v1). Absent → the
 *  deterministic detonate-time contract (task_package, p=1) byte-identically. */
export interface AssignmentPolicyOverride {
  assignedAction: string;
  assignmentProbability: number;
  routePolicy: string;
  eligibleActions: readonly string[];
}

export interface LogInterventionAssignmentInput extends AssignmentKeyInput {
  /** The armed ghost's props_json — only closed-vocabulary fields are read. */
  ghostProps: Record<string, any>;
  storeKind: StoreKind;
  exec: Exec;
  nowTs: number;
  assignment?: AssignmentPolicyOverride;
}

export type InterventionAssignmentRecord = Omit<
  LogInterventionAssignmentInput,
  "storeKind" | "exec"
>;

/**
 * Build the idempotent assignment INSERT without executing it.
 *
 * The production graph writer uses this to place the normal arming-time
 * assignment in the same transaction as offer_state, the graph delta, and the
 * generation receipt. logInterventionAssignment remains the fail-soft retry
 * boundary after that transaction, so a missing/temporarily unavailable
 * research table can never block the user-visible causal graph.
 */
export function interventionAssignmentSql(input: InterventionAssignmentRecord): string {
  const stressPattern = vocab(input.ghostProps?.selected_pattern);
  const rootCauseClass = vocab(input.ghostProps?.root_cause_class);
  const policy: AssignmentPolicyOverride = input.assignment ?? {
    assignedAction: ASSIGNED_ACTION,
    assignmentProbability: ASSIGNMENT_PROBABILITY,
    routePolicy: ROUTE_POLICY,
    eligibleActions: ELIGIBLE_ACTIONS,
  };
  return (
    `INSERT INTO intervention_assignments(` +
    `id, user_id, ghost_id, thread_key, stress_pattern, root_cause_class, ` +
    `eligible_actions_json, assigned_action, assignment_probability, route_policy, created_at_ts) ` +
    `VALUES (${q(assignmentId(input))}, ${q(input.userId)}, ${q(input.ghostId)}, ` +
    `${q(`root:${input.ghostId}`)}, ${litText(stressPattern)}, ${litText(rootCauseClass)}, ` +
    `${q(JSON.stringify(policy.eligibleActions))}::jsonb, ${q(policy.assignedAction)}, ${policy.assignmentProbability}, ` +
    `${q(policy.routePolicy)}, ${Math.floor(input.nowTs)}) ` +
    `ON CONFLICT (id) DO NOTHING;`
  );
}

export async function logInterventionAssignment(
  input: LogInterventionAssignmentInput,
): Promise<AssignmentLogResult> {
  if (input.storeKind !== "postgres") return { logged: false };
  try {
    await input.exec(interventionAssignmentSql(input));
    return { logged: true };
  } catch (err: any) {
    return { logged: false, warning: `assignment log failed: ${err?.message ?? err}` };
  }
}

export type OfferState = "offered" | "held";

export interface AssignArmedOfferInput {
  userId: string;
  ghostId: string;
  storeKind: StoreKind;
  exec: Exec;
  query: Query;
  nowTs: number;
  /** Treatment probability; defaults to mrtTreatmentP() (env-driven). */
  treatmentP?: number;
}

export interface AssignArmedOfferResult {
  assigned: boolean;
  offerState?: OfferState;
  /** The episode key the draw and assignment row were keyed on. */
  armedAtTs?: number | null;
  /** The armed root's props as read (plus the stamped offer_state) — handed
   *  back so the caller can feed observation writers without a re-read. */
  ghostProps?: Record<string, any>;
  warning?: string;
}

export interface PreparedArmedOffer {
  offerState: OfferState;
  armedAtTs: number | null;
  ghostProps: Record<string, any>;
  assignment: AssignmentPolicyOverride;
}

/** Pure arming-time decision used by both the legacy helper and the atomic
 * production graph transaction. Keeping the episode-key/draw logic in one
 * place prevents the graph stamp and assignment row from describing different
 * randomization arms. */
export function prepareArmedOffer(input: {
  userId: string;
  ghostId: string;
  ghostProps: Record<string, any>;
  createdAtTs: number | null;
  treatmentP?: number;
}): PreparedArmedOffer {
  const armedAtTs = armedEpisodeTs(input.ghostProps, input.createdAtTs);
  const draw = drawOfferArm(
    input.userId,
    input.ghostId,
    armedAtTs,
    input.treatmentP ?? mrtTreatmentP(),
  );
  const offerState: OfferState = draw.arm === "task_package" ? "offered" : "held";
  return {
    offerState,
    armedAtTs,
    ghostProps: { ...input.ghostProps, offer_state: offerState },
    assignment: {
      assignedAction: draw.arm,
      assignmentProbability: draw.assignmentProbability,
      routePolicy: RANDOMIZED_ROUTE_POLICY,
      eligibleActions: OFFER_ELIGIBLE_ACTIONS,
    },
  };
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

/**
 * MRT randomization v1 standalone compatibility helper. Production engine
 * runs now use prepareArmedOffer inside upsertGraphDelta so offer_state cannot
 * land after a generation marker; this helper retains the same behavior for
 * isolated callers/tests that do not own a generation transaction.
 *
 * Boundary rules match the rest of this module: Postgres warm-tier only,
 * fail-soft by contract (resolves with a warning instead of rejecting —
 * randomization must never block arming), closed vocabulary only. A held
 * episode's daobrew_detonate is ALWAYS honored: the detonate-time INSERT is
 * ON CONFLICT DO NOTHING against the hold_noop row logged here, so the
 * control assignment survives and detonate_done's artifact_done=true marks
 * the intent-to-treat override.
 */
export async function assignArmedOffer(input: AssignArmedOfferInput): Promise<AssignArmedOfferResult> {
  if (input.storeKind !== "postgres") return { assigned: false };
  try {
    const rows = await input.query(
      `SELECT id, user_id, created_at_ts, props_json FROM graph_nodes ` +
      `WHERE user_id = ${SCOPED_USER_ID_SQL} AND id = ${q(input.ghostId)} AND kind = 'ghost'`,
    );
    if (rows.length === 0) return { assigned: false, warning: `offer randomization skipped: armed root ${input.ghostId} not found` };
    const props = parseProps(rows[0].props_json);
    if (props.status !== "armed") return { assigned: false };
    const createdAtRaw = Number(rows[0].created_at_ts);
    const prepared = prepareArmedOffer({
      userId: input.userId,
      ghostId: input.ghostId,
      ghostProps: props,
      createdAtTs: Number.isFinite(createdAtRaw) ? createdAtRaw : null,
      treatmentP: input.treatmentP,
    });

    const logged = await logInterventionAssignment({
      userId: input.userId,
      ghostId: input.ghostId,
      armedAtTs: prepared.armedAtTs,
      ghostProps: props,
      storeKind: input.storeKind,
      exec: input.exec,
      nowTs: input.nowTs,
      assignment: prepared.assignment,
    });

    // Idempotent stamp — re-runs of the same episode re-derive the same state.
    await input.exec(
      `UPDATE graph_nodes SET props_json = COALESCE(props_json, '{}'::jsonb) ` +
      `|| jsonb_build_object('offer_state', ${q(prepared.offerState)}) ` +
      `WHERE user_id = ${q(input.userId)} AND id = ${q(input.ghostId)};`,
    );

    return {
      assigned: true,
      offerState: prepared.offerState,
      armedAtTs: prepared.armedAtTs,
      ghostProps: prepared.ghostProps,
      warning: logged.warning,
    };
  } catch (err: any) {
    return { assigned: false, warning: `offer randomization failed: ${err?.message ?? err}` };
  }
}

export interface CloseInterventionAssignmentInput extends AssignmentKeyInput {
  userAcceptance: UserAcceptance | null;
  storeKind: StoreKind;
  exec: Exec;
  nowTs: number;
}

export async function closeInterventionAssignment(
  input: CloseInterventionAssignmentInput,
): Promise<AssignmentLogResult> {
  if (input.storeKind !== "postgres") return { logged: false };
  const acceptance = input.userAcceptance ? `, user_acceptance = ${q(input.userAcceptance)}` : "";
  const sql =
    `UPDATE intervention_assignments ` +
    `SET artifact_done = TRUE, closed_at_ts = ${Math.floor(input.nowTs)}${acceptance} ` +
    `WHERE id = ${q(assignmentId(input))};`;
  try {
    await input.exec(sql);
    return { logged: true };
  } catch (err: any) {
    return { logged: false, warning: `assignment close failed: ${err?.message ?? err}` };
  }
}
