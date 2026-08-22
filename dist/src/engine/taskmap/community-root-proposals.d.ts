import { type TaskMapCommunityGraphNodeInputV1, type TaskMapCommunityGraphOutputV1 } from "./community-graph-brain.js";
import { type LlmStation, type LlmStationEnvelope, type LlmProviderId } from "./llm-station.js";
export declare const TASKMAP_COMMUNITY_ROOT_PROPOSALS_VERSION: "taskmap-community-root-proposals.v1";
export declare const TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD: 0.5;
export declare const TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1: Readonly<{
    readonly maxRoots: 384;
    readonly maxPreviousRoots: 384;
    readonly maxMembersPerPreviousRoot: 384;
    readonly maxPreviousMembersTotal: 4096;
    readonly maxPreviousRootsBytes: number;
    readonly maxOutputBytes: number;
    readonly maxTitlePromptBytes: number;
    readonly maxTitleOutputBytes: number;
    readonly titleBatchTimeoutMs: 30000;
    readonly maxNodeTextCharacters: 480;
    readonly maxNodeTextBytes: number;
}>;
export interface TaskMapPreviousAcceptedRootV1 {
    rootProposalId: string;
    memberNodeIds: string[];
}
export interface TaskMapCommunityRootProposalV1 {
    rootProposalId: string;
    baseRootProposalId: string;
    proposalDigest: string;
    memberNodeIds: string[];
    title: string;
    titleSource: "llm_community_title_v1" | "deterministic_fallback";
    recordKind: "review_only_root_proposal";
    proposalDisposition: "review_only";
    authority: "none";
    requiresOwnerAcceptance: true;
    acceptedMembershipAuthority: false;
}
export interface TaskMapCommunityRootIdentityReuseProposalV1 {
    kind: "identity_reuse_proposed";
    rootProposalId: string;
    baseRootProposalId: string;
    previousMemberNodeIds: string[];
    currentMemberNodeIds: string[];
    jaccardSimilarity: number;
    recordKind: "review_only_identity_reuse_proposal";
    proposalDisposition: "review_only";
    authority: "none";
    requiresOwnerAcceptance: true;
    lifecycleAuthority: false;
}
export interface TaskMapCommunityRootReuseMetricsV1 {
    reuseThreshold: typeof TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD;
    communityCount: number;
    previousAcceptedRootCount: number;
    eligiblePairCount: number;
    identityReuseProposedCount: number;
    unmatchedCommunityCount: number;
    unmatchedPreviousRootCount: number;
}
export interface TaskMapCommunityRootMonitoringV1 {
    titlePromptBytes: number;
    titleOutputBytes: number;
    titleBatchAttempted: boolean;
    titleBatchTimedOut: boolean;
    titleFallbackReason: "none" | "no_station" | "missing_titles" | "station_timeout" | "station_unavailable_or_invalid";
    llmTitleCount: number;
    fallbackTitleCount: number;
}
export interface TaskMapCommunityRootProposalSetV1 {
    contractVersion: typeof TASKMAP_COMMUNITY_ROOT_PROPOSALS_VERSION;
    proposalSetId: string;
    proposalSetDigest: string;
    authority: "none";
    requiresOwnerAcceptance: true;
    nodeLookupDigest: string;
    titleGeneration: TaskMapCommunityTitleGenerationV1 | null;
    monitoring: TaskMapCommunityRootMonitoringV1;
    reuseMetrics: TaskMapCommunityRootReuseMetricsV1;
    proposals: TaskMapCommunityRootProposalV1[];
    lifecycle: TaskMapCommunityRootIdentityReuseProposalV1[];
}
export interface TaskMapCommunityTitleGenerationV1 {
    source: "live_station" | "recorded_replay";
    stationId: "community-title-v1";
    inputDigest: string;
    promptDigest: string;
    outputDigest: string;
    envelopeDigest: string;
    transport: LlmProviderId;
    model: string;
    producedAt: string;
}
export interface BuildTaskMapCommunityRootProposalsInputV1 {
    graphOutput: TaskMapCommunityGraphOutputV1;
    nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>;
    nodeLookupDigest: string;
    previousAcceptedRoots: readonly TaskMapPreviousAcceptedRootV1[];
    llmStation?: LlmStation | null;
    recordedTitleEnvelope?: LlmStationEnvelope | null;
    signal?: AbortSignal;
}
export declare function taskMapCommunityRootNodeLookupDigest(nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>): string;
export declare function buildTaskMapCommunityRootProposals(input: BuildTaskMapCommunityRootProposalsInputV1): Promise<TaskMapCommunityRootProposalSetV1>;
export interface TaskMapCommunityTitleBatchRequestDigestsV1 {
    inputDigest: string;
    promptDigest: string;
}
/**
 * The batch title request digests for one validated community graph, or null
 * when there is no community to title. Callers use this to key the recorded
 * title-envelope store before invoking the proposal builder.
 */
export declare function taskMapCommunityTitleBatchRequestDigests(input: {
    graphOutput: TaskMapCommunityGraphOutputV1;
    nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>;
}): TaskMapCommunityTitleBatchRequestDigestsV1 | null;
/**
 * Full replay-side validation of a recorded community title envelope against
 * the current community set. Returns the frozen envelope when it would
 * satisfy the recorded-replay path, and null on any mismatch, so callers can
 * fall back to the live station instead of failing the whole proposal build.
 */
export declare function taskMapCommunityRecordedTitleEnvelope(candidate: unknown, input: {
    graphOutput: TaskMapCommunityGraphOutputV1;
    nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>;
}): LlmStationEnvelope | null;
/** @internal One bounded seam for run-level title timeout tests. */
export declare const TASKMAP_COMMUNITY_ROOT_PROPOSALS_TEST_ONLY: Readonly<{
    buildWithTitleTimeout(input: BuildTaskMapCommunityRootProposalsInputV1, titleBatchTimeoutMs: number): Promise<TaskMapCommunityRootProposalSetV1>;
}>;
