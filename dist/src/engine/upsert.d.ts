import { PreparedArmedOffer } from "./assignments.js";
import { GraphDelta } from "./reasoner/types.js";
type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface UpsertGraphDeltaOptions {
    userId?: string;
    nowTs?: number;
    allowRearmDone?: boolean;
    /** Server-generated production generation. Valid only as an exact pair
     *  with leaseToken on Postgres; local/CLI callers never supply either. */
    generationId?: string;
    /** Exact backend execution lease authorizing one atomic graph commit. */
    leaseToken?: string;
    /** Arm-time MRT decision to embed in the graph transaction. Production
     *  callers enable this on Postgres; direct/local upserts remain unchanged. */
    armedOffer?: {
        treatmentP?: number;
    };
    /** RLS seam (deferred wiring 1/3): injected executors for the transactional
     *  batch and the internal graph_nodes reads. Defaults to the module-level
     *  execSql/queryJson — behavior is byte-identical when absent. */
    exec?: Exec;
    query?: Query;
}
export interface UpsertGraphDeltaResult {
    status: "written" | "skipped_done";
    user_id: string;
    nodes_upserted: number;
    edges_attempted: number;
    armed_node_id: string;
    root_armed: boolean;
    /** Present only when offer_state and its normal assignment INSERT were
     *  included before the generation receipt in this exact graph transaction. */
    armed_offer?: PreparedArmedOffer;
}
export declare class GraphDeltaValidationError extends Error {
    issues: string[];
    constructor(issues: string[]);
}
interface GenerationLeaseSql {
    guard: string;
    commit: string;
}
/**
 * Build the two halves of the production graph commit protocol.
 *
 * scopedExec supplies the surrounding transaction.  The guard takes the
 * same transaction-level advisory lock as the Python execution gate and
 * row-locks the exact still-live lease before any graph DML.  The final block
 * re-checks expiry at commit time, stamps the lease receipt, and advances the
 * graph generation.  Any failure aborts the outer transaction, rolling back
 * every graph statement and the marker together.
 */
export declare function generationLeaseSql(userId: string, generationId: string, leaseToken: string): GenerationLeaseSql;
export declare function mergeGhostProps(existingDbProps?: Record<string, unknown>, incomingProps?: Record<string, unknown>): Record<string, unknown>;
export declare function validateGraphDelta(delta: GraphDelta, options?: UpsertGraphDeltaOptions): Promise<void>;
export declare function upsertGraphDelta(delta: GraphDelta, options?: UpsertGraphDeltaOptions): Promise<UpsertGraphDeltaResult>;
export {};
