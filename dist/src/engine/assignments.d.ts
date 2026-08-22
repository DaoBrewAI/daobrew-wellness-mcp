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
export declare const ELIGIBLE_ACTIONS: readonly ["task_package"];
export declare const ASSIGNED_ACTION = "task_package";
export declare const ASSIGNMENT_PROBABILITY = 1;
export declare const ROUTE_POLICY = "deterministic_argmax_v1";
export declare const OFFER_ELIGIBLE_ACTIONS: readonly ["task_package", "hold_noop"];
export type OfferArm = (typeof OFFER_ELIGIBLE_ACTIONS)[number];
export declare const RANDOMIZED_ROUTE_POLICY = "randomized_offer_v1";
export declare const DEFAULT_MRT_TREATMENT_P = 0.9;
/** Treatment probability from env DAOBREW_MRT_TREATMENT_P — default 0.9,
 *  clamped to [0,1]; blank/junk falls back to the default. */
export declare function mrtTreatmentP(raw?: string | undefined): number;
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
export declare function drawOfferArm(userId: string, ghostId: string, armedAtTs: number | null, p: number): OfferDraw;
export declare const USER_ACCEPTANCE_VALUES: readonly ["accepted", "edited", "rejected"];
export type UserAcceptance = (typeof USER_ACCEPTANCE_VALUES)[number];
export interface AssignmentKeyInput {
    userId: string;
    ghostId: string;
    /** The episode key — armedEpisodeTs(props, created_at_ts): retries within
     *  one arming collide (idempotent); a re-arm is a new decision point → new id. */
    armedAtTs: number | null;
}
export declare function assignmentId(input: AssignmentKeyInput): string;
/** The episode timestamp both detonate AND detonate_done key the assignment
 *  id on. Ghost ids are stable across armings and the upsert conflict path
 *  PRESERVES created_at_ts, so only the transition-stamped props.armed_at_ts
 *  (upsert.ts nodeSql) separates episodes — created_at_ts is the fallback for
 *  legacy ghosts armed before the stamp existed. */
export declare function armedEpisodeTs(ghostProps: Record<string, any>, createdAtTs: number | null): number | null;
export interface AssignmentLogResult {
    logged: boolean;
    warning?: string;
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
export type InterventionAssignmentRecord = Omit<LogInterventionAssignmentInput, "storeKind" | "exec">;
/**
 * Build the idempotent assignment INSERT without executing it.
 *
 * The production graph writer uses this to place the normal arming-time
 * assignment in the same transaction as offer_state, the graph delta, and the
 * generation receipt. logInterventionAssignment remains the fail-soft retry
 * boundary after that transaction, so a missing/temporarily unavailable
 * research table can never block the user-visible causal graph.
 */
export declare function interventionAssignmentSql(input: InterventionAssignmentRecord): string;
export declare function logInterventionAssignment(input: LogInterventionAssignmentInput): Promise<AssignmentLogResult>;
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
export declare function prepareArmedOffer(input: {
    userId: string;
    ghostId: string;
    ghostProps: Record<string, any>;
    createdAtTs: number | null;
    treatmentP?: number;
}): PreparedArmedOffer;
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
export declare function assignArmedOffer(input: AssignArmedOfferInput): Promise<AssignArmedOfferResult>;
export interface CloseInterventionAssignmentInput extends AssignmentKeyInput {
    userAcceptance: UserAcceptance | null;
    storeKind: StoreKind;
    exec: Exec;
    nowTs: number;
}
export declare function closeInterventionAssignment(input: CloseInterventionAssignmentInput): Promise<AssignmentLogResult>;
export {};
