export declare const CLAIM_LEVELS: readonly ["correlation", "attribution_candidate", "causal_hypothesis", "validated_pattern"];
export type MemoryClaimLevel = (typeof CLAIM_LEVELS)[number];
export type InfluenceLevel = "background_context" | "candidate_ranking" | "recommendation" | "personalization";
export type DecayState = "active" | "dormant";
export type ThreadStatus = "active" | "archived" | "done";
export interface CausalThreadRow {
    id: string;
    user_id: string;
    thread_key: string;
    key_version: number;
    graph_root_id: string | null;
    title: string;
    summary: string | null;
    claim_level: MemoryClaimLevel;
    status: ThreadStatus;
    pattern_keys_json: string[];
    recurrence_count: number;
    first_seen_ts: number | null;
    last_seen_ts: number | null;
    last_reinforced_ts: number | null;
    strength: number;
    decay_state: DecayState;
}
export interface ThreadEvidenceInput {
    threadId: string;
    userId: string;
    evidenceKind: string;
    sourceTable: string | null;
    sourceId: string | null;
    sourceRef: string | null;
    graphNodeId: string | null;
    graphEdgeId: string | null;
    claimLevel: MemoryClaimLevel;
    patternKey: string | null;
    evidenceRole: string;
    observedAtTs: number | null;
    weight: number;
}
export interface UserModelSnapshotRow {
    id: string;
    user_id: string;
    version: number;
    snapshot_text: string;
    source_thread_ids_json: string[];
    claim_ceiling: MemoryClaimLevel;
    generated_from_count: number;
    created_at_ts: number;
}
