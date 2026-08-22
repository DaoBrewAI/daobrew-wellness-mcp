import { GraphDelta } from "../reasoner/types.js";
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
/** Handled timestamp for a done ghost whose props are already in hand:
 *  props.done_at_ts (stamped by daobrew_detonate_done since V2) ?? the
 *  e_done_<ghostId> edge's created_at_ts (the only persisted
 *  handled-timestamp before that). Shared with the V5 settlement pass
 *  (nightly.ts) so both sides resolve the same `vd:<handled>` bucket. */
export declare function resolveHandledAtTs(userId: string, ghostId: string, ghostProps: Record<string, any>, query: Query): Promise<number | null>;
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
export declare function recordSkippedDoneObservation(input: RecordSkippedDoneObservationInput): Promise<RecordObservationResult>;
export interface RecordCoverageObservationsInput {
    userId: string;
    exec?: Exec;
    query?: Query;
    nowTs?: number;
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
export declare function recordCoverageObservations(input: RecordCoverageObservationsInput): Promise<RecordObservationResult>;
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
export declare function recordHeldTriggerObservation(input: RecordHeldTriggerObservationInput): Promise<RecordObservationResult>;
export {};
