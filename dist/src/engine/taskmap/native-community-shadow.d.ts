import { type TaskMapAgentSessionGraphFeedV1, type TaskMapAgentSessionSemanticAdmissionV2 } from "./agent-session-semantic-admission.js";
import { type TaskMapCommunityGraphCommunityV1, type TaskMapCommunityGraphOptimizationV1, type TaskMapCommunityGraphResourceUsageV1 } from "./community-graph-brain.js";
import { type TaskMapCommunityRootProposalSetV1, type TaskMapPreviousAcceptedRootV1 } from "./community-root-proposals.js";
import { type TaskMapCommunitySemanticEvidenceInputV1, type TaskMapCommunitySemanticEvidenceReportV1 } from "./community-semantic-evidence.js";
import { type TaskMapNativeSemanticBuilderInputV1 } from "./native-semantic-builder-adapter.js";
import { type BrainRootProposal, type TaskMapInput } from "./types.js";
export declare const TASKMAP_NATIVE_COMMUNITY_SHADOW_VERSION: "taskmap-native-community-shadow.v1";
export declare const TASKMAP_NATIVE_COMMUNITY_SHADOW_UNAVAILABLE_VERSION: "taskmap-native-community-shadow-unavailable.v1";
export declare const TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION: "taskmap-native-community-graph-coverage.v1";
export declare const TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1: Readonly<{
    readonly directoryLimit: 1024;
    readonly candidateLimit: 4096;
    readonly attemptLimit: 1024;
    readonly globalScanByteLimit: number;
    readonly perFileScanByteLimit: number;
    readonly observationLimit: 512;
    readonly rawByteLimit: number;
    readonly maxGraphEpisodes: 256;
}>;
export declare const TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1: Readonly<{
    readonly maximumInputBytes: number;
    readonly maximumOutputBytes: number;
    readonly maximumAgentNodes: 256;
    readonly maximumMeetingCalendarNodes: 128;
}>;
export interface TaskMapNativeCommunityShadowLegacyBindingsV1 {
    graphInputDigest: string;
    candidateDigest: string;
    projectionDigest: string;
    promotionReceiptHeadDigest: string;
}
export interface TaskMapNativeCommunityShadowLegacyFlagsV1 {
    readAuthority: false;
    rankingMutated: false;
    bodyMutated: false;
    acceptanceStoreMutated: false;
}
export type TaskMapNativeCommunityShadowSemanticEvidenceOptionsV1 = Omit<TaskMapCommunitySemanticEvidenceInputV1, "nodes"> & {
    /** Recorded community-title-v1 envelope directory for byte-stable replay. */
    titleReplayPath?: string;
};
export interface TaskMapNativeCommunityGraphCoverageV1 {
    contractVersion: typeof TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION;
    discovery: {
        directoriesVisited: number;
        candidatesDiscovered: number;
        directoryLimit: number;
        candidateLimit: number;
        directoryLimitReached: boolean;
        candidateLimitReached: boolean;
    };
    reads: {
        attemptedFiles: number;
        attemptLimit: number;
        droppedAttemptLimit: number;
        droppedInvalid: number;
    };
    scan: {
        chargedBytes: number;
        globalByteLimit: number;
        perFileByteLimit: number;
        droppedScanBudget: number;
    };
    observations: {
        selectedObservations: number;
        observationLimit: number;
        droppedObservationLimit: number;
        rawBytesSelected: number;
        rawByteLimit: number;
        droppedRawByteBudget: number;
        graphEpisodesSelected: number;
        maxGraphEpisodes: number;
        droppedGraphEpisodes: number;
    };
    distribution: {
        codexSelected: number;
        claudeSelected: number;
        isoWeeksSelected: number;
    };
    completeness: "complete" | "bounded_partial" | "unknown";
    truncationReasons: Array<"candidate_limit" | "directory_limit" | "read_attempt_limit" | "scan_byte_limit" | "raw_byte_limit" | "observation_limit" | "graph_episode_limit" | "invalid_or_raced" | "not_collected">;
    authority: "none";
    privacy: {
        pathsPersisted: false;
        textPersisted: false;
        secretsPersisted: false;
        vectorsPersisted: false;
    };
}
export interface TaskMapNativeCommunityShadowInputV1 {
    ownerScopeDigest: string;
    requestedAt: string;
    legacyBindings: TaskMapNativeCommunityShadowLegacyBindingsV1;
    agentSessionGraphFeed: TaskMapAgentSessionGraphFeedV1 | null;
    graphCollectionCoverage: TaskMapNativeCommunityGraphCoverageV1;
    candidateSemanticFragment?: TaskMapNativeSemanticBuilderInputV1;
    semanticEvidence: TaskMapNativeCommunityShadowSemanticEvidenceOptionsV1;
    previousAcceptedRoots: TaskMapPreviousAcceptedRootV1[];
    expectedLegacyFlags: TaskMapNativeCommunityShadowLegacyFlagsV1;
}
/**
 * Transient Plan2 input used by the authoritative projection builder. Unlike
 * the former shadow artifact, this plan has no publication binding or durable
 * filename: it exists only long enough to shape SemanticBrainOutput roots.
 */
export type TaskMapNativeCommunityPlanInputV1 = Omit<TaskMapNativeCommunityShadowInputV1, "expectedLegacyFlags" | "legacyBindings">;
export interface TaskMapNativeCommunityPlanV1 {
    planDigest: string;
    feedDigest: string | null;
    proposalSet: TaskMapCommunityRootProposalSetV1;
    /**
     * False when the grouping station was unavailable, so an empty proposal
     * set is a degradation signal rather than evidence that no communities
     * exist. Callers must then preserve the predecessor tree instead of
     * publishing a collapsed rebuild.
     */
    groupingAvailable: boolean;
}
export interface TaskMapNativeCommunityAgentRootPlanV1 {
    roots: Array<{
        rootProposalId: string;
        title: string;
        clusterIdentityDigests: string[];
    }>;
}
export declare const TASKMAP_NATIVE_COMMUNITY_ROOT_EVIDENCE_LIMITS_V1: Readonly<{
    readonly maximumEventsPerRoot: 5;
    readonly maximumEventsTotal: 128;
}>;
export interface TaskMapNativeCommunityRootEvidenceV1 {
    taskMapInput: TaskMapInput;
    rootProposals: BrainRootProposal[];
}
export interface TaskMapNativeCommunityShadowFeedSummaryV1 {
    feedDigest: string | null;
    counts: TaskMapAgentSessionGraphFeedV1["counts"];
}
export interface TaskMapNativeCommunityShadowSourceFamilyCountsV1 {
    agent: number;
    meeting: number;
    calendar: number;
}
export interface TaskMapNativeCommunityShadowArtifactV1 extends TaskMapNativeCommunityShadowLegacyFlagsV1 {
    contractVersion: typeof TASKMAP_NATIVE_COMMUNITY_SHADOW_VERSION;
    artifactId: string;
    artifactDigest: string;
    ownerScopeDigest: string;
    requestedAt: string;
    legacyBindings: TaskMapNativeCommunityShadowLegacyBindingsV1;
    feed: TaskMapNativeCommunityShadowFeedSummaryV1;
    graphCollectionCoverage: TaskMapNativeCommunityGraphCoverageV1;
    sourceFamilyCounts: TaskMapNativeCommunityShadowSourceFamilyCountsV1;
    semanticEvidenceReport: TaskMapCommunitySemanticEvidenceReportV1;
    communities: TaskMapCommunityGraphCommunityV1[];
    unclustered: string[];
    optimization: TaskMapCommunityGraphOptimizationV1;
    resourceUsage: TaskMapCommunityGraphResourceUsageV1;
    edges: {
        count: number;
        digest: string;
    };
    proposalSet: TaskMapCommunityRootProposalSetV1;
    authority: "none";
}
export interface BuildTaskMapNativeCommunityShadowUnavailableReceiptInputV1 {
    ownerScopeDigest: string;
    requestedAt: string;
    legacyBindings: TaskMapNativeCommunityShadowLegacyBindingsV1;
    graphCollectionCoverage: TaskMapNativeCommunityGraphCoverageV1;
}
export interface TaskMapNativeCommunityShadowUnavailableReceiptV1 extends TaskMapNativeCommunityShadowLegacyFlagsV1 {
    contractVersion: typeof TASKMAP_NATIVE_COMMUNITY_SHADOW_UNAVAILABLE_VERSION;
    receiptId: string;
    receiptDigest: string;
    ownerScopeDigest: string;
    requestedAt: string;
    legacyBindings: TaskMapNativeCommunityShadowLegacyBindingsV1;
    graphCollectionCoverage: TaskMapNativeCommunityGraphCoverageV1;
    availability: "unavailable";
    authority: "none";
}
export type TaskMapNativeCommunityShadowFailureCode = "invalid_input" | "pipeline_unavailable" | "output_limit_exceeded";
export declare class TaskMapNativeCommunityShadowUnavailableError extends TypeError {
    readonly code: TaskMapNativeCommunityShadowFailureCode;
    constructor(code: TaskMapNativeCommunityShadowFailureCode);
}
export interface TaskMapNativeCommunityCandidateNodeBindingV1 {
    statementReferenceDigest: string;
    nodeId: string;
}
/** Exact candidate-to-node bridge for the review hierarchy. */
export declare function taskMapNativeCommunityCandidateNodeBindings(fragment: TaskMapNativeSemanticBuilderInputV1, ownerScopeDigest: string, requestedAt: string): TaskMapNativeCommunityCandidateNodeBindingV1[];
export declare function buildTaskMapNativeCommunityShadowUnavailableReceipt(input: BuildTaskMapNativeCommunityShadowUnavailableReceiptInputV1): TaskMapNativeCommunityShadowUnavailableReceiptV1;
/**
 * Computes the Plan2 community proposal set without writing a sidecar or
 * acquiring read/ranking/body/acceptance authority.
 */
export declare function buildTaskMapNativeCommunityPlan(input: TaskMapNativeCommunityPlanInputV1): Promise<TaskMapNativeCommunityPlanV1>;
/**
 * Resolves Plan2 graph members back to the current admission through the
 * exact graph-episode tuple. Missing or multiply-routed tuples are omitted so
 * the projection builder can retain their legacy workstream fallback roots.
 */
export declare function mapTaskMapNativeCommunityPlanToAgentRoots(input: {
    plan: TaskMapNativeCommunityPlanV1;
    feed: TaskMapAgentSessionGraphFeedV1;
    admission: TaskMapAgentSessionSemanticAdmissionV2;
}): TaskMapNativeCommunityAgentRootPlanV1;
export declare function buildTaskMapNativeCommunityRootEvidence(input: {
    plan: TaskMapNativeCommunityPlanV1;
    feed: TaskMapAgentSessionGraphFeedV1;
    generatedAt: string;
    currentAdmission?: TaskMapAgentSessionSemanticAdmissionV2 | null;
}): TaskMapNativeCommunityRootEvidenceV1;
/**
 * Pure shadow orchestration. It only returns a review-only artifact; no legacy
 * projection, ranking, body, acceptance, or read-authority state is mutated.
 */
export declare function buildTaskMapNativeCommunityShadow(input: TaskMapNativeCommunityShadowInputV1): Promise<TaskMapNativeCommunityShadowArtifactV1>;
