export declare const TASKMAP_GRAPH_BRAIN_POLICY_V1: Readonly<{
    readonly semanticSimilarityThreshold: 0.6;
    readonly externalRefWeight: 3;
    readonly semanticEmbeddingWeight: 2;
    readonly semanticGroupingWeight: 1.5;
    readonly routingWeight: 0.3;
    readonly minimumEdgeWeight: 1;
    readonly convergenceEpsilon: 0.000001;
}>;
/**
 * Operational graph head: 256 retained Agent episodes plus 128 bounded
 * meeting/calendar candidates. Every aggregate budget is checked before the
 * pairwise graph and Louvain loops begin.
 */
export declare const TASKMAP_GRAPH_BRAIN_LIMITS_V1: Readonly<{
    readonly agentEpisodeCapacity: 256;
    readonly meetingCalendarHeadroom: 128;
    readonly maxNodes: 384;
    readonly maxOpaqueIdCharacters: 512;
    readonly maxNodeTextCharacters: 480;
    readonly embeddingDimensions: 768;
    readonly maxEmbeddingCoordinates: 294912;
    readonly maxExternalRefsPerNode: 32;
    readonly maxExternalRefCharacters: 82;
    readonly maxExternalRefsTotal: 4096;
    readonly maxSemanticGroups: 128;
    readonly maxSemanticGroupMembers: 64;
    readonly maxSemanticPairMemberships: 16384;
    readonly maxPairComparisons: 73536;
    readonly maxEdges: 16384;
    readonly maxOutputBytes: number;
    readonly maxOptimizationPasses: 128;
}>;
export type TaskMapCommunityGraphSourceFamily = "agent" | "meeting" | "calendar";
export interface TaskMapCommunityGraphNodeInputV1 {
    nodeId: string;
    text: string;
    sourceFamily: TaskMapCommunityGraphSourceFamily;
    routingDigest: string;
    occurredAt: string;
    externalRefs: string[];
    embedding: number[] | null;
    isCalendarCommitment: boolean;
}
export interface TaskMapCommunityGraphSemanticGroupInputV1 {
    groupId: string;
    source: "llm_grouping";
    sourceDigest: string;
    memberNodeIds: string[];
}
export interface TaskMapCommunityGraphInputV1 {
    nodes: TaskMapCommunityGraphNodeInputV1[];
    semanticGroups?: TaskMapCommunityGraphSemanticGroupInputV1[];
}
export interface TaskMapCommunityGraphEdgeV1 {
    fromNodeId: string;
    toNodeId: string;
    weight: number;
    sharedExternalRefDigests: string[];
    sharedSemanticGroupIds: string[];
    embeddingSimilarity: number | null;
    sameRoutingDigest: boolean;
}
export interface TaskMapCommunityGraphSemanticGroupProvenanceV1 {
    groupId: string;
    source: "llm_grouping";
    sourceDigest: string;
}
export interface TaskMapCommunityGraphDateSpanV1 {
    startAt: string;
    endAt: string;
}
export interface TaskMapCommunityGraphQualityV1 {
    internalDensity: number;
    cutEdgeRatio: number;
    weakestMemberSimilarity: number | null;
}
export interface TaskMapCommunityGraphCommunityV1 {
    memberNodeIds: string[];
    contextNodeIds: string[];
    internalEdgeCount: number;
    dateSpan: TaskMapCommunityGraphDateSpanV1;
    sourceFamilies: TaskMapCommunityGraphSourceFamily[];
    quality: TaskMapCommunityGraphQualityV1;
}
export interface TaskMapCommunityGraphOutputV1 {
    edges: TaskMapCommunityGraphEdgeV1[];
    communities: TaskMapCommunityGraphCommunityV1[];
    unclustered: string[];
    semanticGroupProvenance: TaskMapCommunityGraphSemanticGroupProvenanceV1[];
    optimization: TaskMapCommunityGraphOptimizationV1;
    resourceUsage: TaskMapCommunityGraphResourceUsageV1;
}
export interface TaskMapCommunityGraphResourceUsageV1 {
    nodeCount: number;
    pairComparisons: number;
    embeddingSimilarityComputations: number;
    emittedEdgeCount: number;
    semanticPairMemberships: number;
}
export interface TaskMapCommunityGraphOptimizationV1 {
    algorithm: "deterministic_louvain_local_modularity";
    passes: number;
    passLimit: number;
    converged: true;
    finalPassModularityGain: number;
}
export interface TaskMapCommunityConnectivityEdge {
    fromNodeId: string;
    toNodeId: string;
}
export declare function splitTaskMapCommunityConnectedComponents(nodeIds: readonly string[], edges: readonly TaskMapCommunityConnectivityEdge[]): string[][];
export declare function buildTaskMapCommunityGraph(input: TaskMapCommunityGraphInputV1): TaskMapCommunityGraphOutputV1;
/** @internal One encapsulated seam for fail-closed optimization-cap tests. */
export declare const TASKMAP_GRAPH_BRAIN_TEST_ONLY: Readonly<{
    buildWithPassLimit(input: TaskMapCommunityGraphInputV1, passLimit: number): TaskMapCommunityGraphOutputV1;
}>;
