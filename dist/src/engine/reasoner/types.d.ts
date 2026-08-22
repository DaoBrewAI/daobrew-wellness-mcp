import { GRAPH_EDGE_KINDS, GRAPH_NODE_KINDS } from "../schema.js";
import { JoinedTriplet } from "../triplet.js";
import type { MetricBaseline } from "./biometric-endorsement.js";
export type GraphNodeKind = typeof GRAPH_NODE_KINDS[number];
export type GraphEdgeKind = typeof GRAPH_EDGE_KINDS[number];
export type RootCauseClass = "productivity";
export interface GraphNodeDelta {
    id: string;
    user_id?: string;
    kind: GraphNodeKind;
    title: string;
    subtitle?: string | null;
    element?: "wood" | "fire" | "earth" | "metal" | "water" | null;
    occurred_at_ts?: number | null;
    source: string;
    source_ref: string;
    props_json?: Record<string, unknown>;
    embedding?: Buffer | null;
}
export interface GraphEdgeDelta {
    id: string;
    user_id?: string;
    src_id: string;
    dst_id: string;
    kind: GraphEdgeKind;
    label?: string | null;
    weight?: number;
    props_json?: Record<string, unknown>;
}
export interface DetonateBrief {
    cause: string;
    evidence: string[];
    context: string;
    artifact_spec: string;
    suggested_block: {
        title: string;
        start_offset_min: number;
        duration_min: number;
    };
}
export interface ArmedRootCauseDelta {
    node_id: string;
    confidence: number;
    root_cause_class: RootCauseClass;
    brief: DetonateBrief;
}
export interface GraphDelta {
    user_id?: string;
    nodes: GraphNodeDelta[];
    edges: GraphEdgeDelta[];
    root_armed?: boolean;
    armed_root_cause: ArmedRootCauseDelta;
    assumptions?: Array<{
        key: string;
        value: unknown;
    }>;
}
export interface ReasoningInput {
    user_id?: string;
    triplets: JoinedTriplet[];
    generated_at_ts?: number;
    /** 30-day per-metric biometric baselines from the identity-unioned read
     *  (biometricsDb.readBiometricSignalsFromDb). Feeds each episode's
     *  biometric_summary / pattern_endorsements. Undefined on the HTTP-fallback
     *  path and SQLite runs — the endorsement builder degrades to absolute-only. */
    baselines?: MetricBaseline[];
    /** Optional v2 context (raw signatures + coverage + enrichment axes).
     *  When present the Reasoner swaps to the raw pattern layer, caps
     *  claims by coverage, and runs the 7th gate. Absent = legacy path. */
    v2?: import("./v2Context.js").ReasonerV2Context;
    /** Layer 2 causal memory read for this run (Postgres-only; absent on
     *  SQLite runs and on read failure). CONTEXT ONLY — attached to the root
     *  node's props_json.memory_context for downstream consumers. MUST NOT
     *  influence scoring, claims, gate outcomes, or arming without separate
     *  design + sign-off from the reasoner owner. */
    memoryContext?: {
        threads: import("../memory/reader.js").GatedThread[];
        snapshotId: string | null;
        /** V7: the reader's snapshot_fresh (snapshot exists AND is <7 days old).
         *  Context only, like everything else in this bag. */
        snapshotFresh: boolean;
    };
}
export interface AttributionReasoner {
    buildDelta(input: ReasoningInput): Promise<GraphDelta>;
}
