import { TASKMAP_GRAPH_BRAIN_LIMITS_V1, TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION, TASKMAP_AGENT_SESSION_PRODUCER_VERSION, type TaskMapAgentSessionGraphEpisodeSelectionDraftV1, type TaskMapAgentSessionDirectiveDispositionV2, type TaskMapAgentSessionProducerSnapshotV1, type TaskMapAgentSessionProvider, type TaskMapAgentSessionWorkEpisodeV1 } from "./agent-session-producer-freshness.js";
export declare const TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_VERSION: "taskmap-agent-session-semantic-admission.v2";
export declare const TASKMAP_AGENT_SESSION_WORKSTREAM_IDENTITY_DOMAIN: "taskmap-agent-session-workstream-identity.2";
export declare const TASKMAP_AGENT_SESSION_PROPOSAL_CLUSTER_IDENTITY_DOMAIN: "taskmap-agent-session-proposal-cluster-identity.2";
export declare const TASKMAP_AGENT_SESSION_GRAPH_FEED_VERSION: "taskmap-agent-session-graph-feed.v1";
export declare const TASKMAP_AGENT_SESSION_GRAPH_EPISODE_IDENTITY_DOMAIN: "taskmap-agent-session-graph-episode-identity.1";
export declare const TASKMAP_AGENT_SESSION_GRAPH_EPISODE_REVISION_DOMAIN: "taskmap-agent-session-graph-episode-revision.1";
export declare const TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2: Readonly<{
    readonly maxClustersPerWorkstream: 8;
    readonly maxClustersGlobal: 24;
    readonly maxSupportKeysPerCluster: 8;
}>;
export type TaskMapAgentSessionRoutingKindV2 = "project" | "repository";
export interface TaskMapAgentSessionProposalSupportV2 {
    supportIdentityDigest: string;
    turnLineageIdentityDigest: string;
    episodeId: string;
    episodeIdentityDigest: string;
    rootSessionIdentityDigest: string;
    provider: TaskMapAgentSessionProvider;
    occurredAt: string;
    observedAt: string;
}
export interface TaskMapAgentSessionProposalClusterV2 {
    clusterId: string;
    clusterIdentityDigest: string;
    proposalClusterDigest: string;
    workstreamIdentityDigest: string;
    routingKind: TaskMapAgentSessionRoutingKindV2;
    providerNeutralRoutingDigest: string;
    directiveSemanticDigest: string;
    recordKind: "review_only_agent_proposal";
    proposalDisposition: "candidate_or_context_only";
    authority: "none";
    acceptedMembershipAuthority: false;
    lifecycleAuthority: false;
    completionAuthority: false;
    verificationAuthority: false;
    userDirectiveSummary: string;
    assistantOutcomeSummary: string | null;
    occurredAt: string;
    observedAt: string;
    supports: TaskMapAgentSessionProposalSupportV2[];
}
export interface TaskMapAgentSessionSemanticAdmissionV2 {
    contractVersion: typeof TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_VERSION;
    admissionId: string;
    admissionDigest: string;
    producerVersion: typeof TASKMAP_AGENT_SESSION_PRODUCER_VERSION;
    sourceSnapshotContractVersion: typeof TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION;
    sourceSnapshotDigest: string;
    ownerScopeDigest: string;
    producedAt: string;
    authority: "none";
    acceptedMembershipAuthority: false;
    limits: typeof TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2;
    counts: {
        inputTurns: number;
        latestTurns: number;
        suppressedNonWork: number;
        unrouted: number;
        duplicateLineage: number;
        clusterOverflow: number;
        supportOverflow: number;
    };
    dispositionCounts: Array<{
        disposition: TaskMapAgentSessionDirectiveDispositionV2;
        count: number;
    }>;
    clusters: TaskMapAgentSessionProposalClusterV2[];
}
export interface TaskMapAgentSessionGraphFeedEpisodeV1 extends TaskMapAgentSessionWorkEpisodeV1 {
    graphEpisodeId: string;
    graphEpisodeDigest: string;
    graphEpisodeRevisionDigest: string;
    workstreamIdentityDigest: string;
    routingKind: TaskMapAgentSessionRoutingKindV2;
    providerNeutralRoutingDigest: string;
    isoWeek: string;
    /**
     * Count of validated, receipt-free occurrences with the same provider-
     * neutral workstream and directive semantic digest across the graph window,
     * including middle turns that are recurrence-only rather than graph nodes.
     */
    recurrenceCount: number;
    /** Earliest occurredAt among the occurrences counted above. */
    firstSeenAt: string;
}
export interface TaskMapAgentSessionGraphFeedV1 {
    contractVersion: typeof TASKMAP_AGENT_SESSION_GRAPH_FEED_VERSION;
    feedId: string;
    feedDigest: string;
    ownerScopeDigest: string;
    producedAt: string;
    authority: "none";
    acceptedMembershipAuthority: false;
    limits: typeof TASKMAP_GRAPH_BRAIN_LIMITS_V1;
    counts: {
        inputObservations: number;
        eligibleEpisodes: number;
        deduplicatedEpisodes: number;
        selectedEpisodes: number;
    };
    episodes: TaskMapAgentSessionGraphFeedEpisodeV1[];
}
export declare function taskMapAgentSessionIsoWeek(timestamp: string): string;
/**
 * Builds the community-brain-only history feed. It never enters the bounded
 * native semantic admission path above/below this function.
 */
export declare function buildTaskMapAgentSessionGraphFeed(input: TaskMapAgentSessionGraphEpisodeSelectionDraftV1): TaskMapAgentSessionGraphFeedV1;
/**
 * Reuses the authenticated bounded producer snapshot for review-only grouping.
 * It performs no wider session scan and grants no accepted membership.
 */
export declare function buildTaskMapAgentSessionGraphFeedFromSnapshot(snapshot: TaskMapAgentSessionProducerSnapshotV1): TaskMapAgentSessionGraphFeedV1;
export declare function buildTaskMapAgentSessionSemanticAdmission(snapshot: TaskMapAgentSessionProducerSnapshotV1): TaskMapAgentSessionSemanticAdmissionV2;
export declare function assertTaskMapAgentSessionSemanticAdmission(value: unknown): asserts value is TaskMapAgentSessionSemanticAdmissionV2;
