import { type ConfirmedTaskMapOwner } from "../../identity.js";
import type { EmbeddingProvider } from "../embeddings/provider.js";
import { type RemoteGeminiEmbeddingOptions } from "../embeddings/gemini-remote.js";
import { type LlmStationOptions } from "./llm-station.js";
import { type TaskMapBodyPatternResultV1 } from "./body-causal-assessment.js";
import { type TaskMapOwnerGraphBuildResult, type TaskMapOwnerIdentityBarrierResult, type TaskMapOwnerRefreshCollectors, type TaskMapOwnerRefreshSource, type TaskMapOwnerRefreshSourceDisposition, type TaskMapOwnerRefreshTrigger } from "./owner-refresh-coordinator.js";
import { type TaskMapAgentSessionGraphFeedV1, type TaskMapAgentSessionSemanticAdmissionV2 } from "./agent-session-semantic-admission.js";
import { type TaskMapNativeCommunityAgentRootPlanV1, type TaskMapNativeCommunityRootEvidenceV1 } from "./native-community-shadow.js";
import { type TaskMapCommunityTaskDigestionV1 } from "./community-task-digestion.js";
import { type TaskMapPreviousAcceptedRootV1 } from "./community-root-proposals.js";
import { type TaskMapAgentSessionExtractionReportV1 } from "./agent-session-refresh-llm-replay.js";
import { type TaskMapCalendarProviderFreshness } from "./calendar-producer-freshness.js";
import { type TaskMapNativeSemanticBuilderInputV1 } from "./native-semantic-builder-adapter.js";
import { type TaskMapPhysiologicalProviderReader } from "./physiological-source-snapshot.js";
import { type ReadTaskMapStrategySourceAdapterInputV1 } from "./strategy-source-adapter.js";
import { type TaskMapNativeAgentSessionEpisodeAdmissionV1, type TaskMapNativeAgentSessionTaskProofV1, type TaskMapNativeCurrentWorkV1 } from "./native-current-work-successor.js";
import { type TaskMapReadyProofTargetsV1 } from "./ready-frontier.js";
import { type TaskMapNativeCandidateAcceptanceStoreV1 } from "./native-candidate-acceptance.js";
import { type TaskMapMeetingExtractionDegradationCode, type TaskMapLlmStationFactory, type VerifiedTaskMapGranolaExtractionReportV1 } from "./meeting-refresh-llm-replay.js";
import { type TaskMapTaskRankingPublicationV1 } from "./task-ranking-publication.js";
import { type TaskMapEdge, type TaskMapInput, type TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_NATIVE_REFRESH_STATE_VERSION: "taskmap-native-refresh-state.v1";
export declare const TASKMAP_NATIVE_REFRESH_STATUS_VERSION: "taskmap-native-refresh-status.v1";
export declare const TASKMAP_NATIVE_REFRESH_CANDIDATE_VERSION: "taskmap-native-refresh-candidate.v1";
export declare const TASKMAP_NATIVE_GRAPH_INPUT_VERSION: "taskmap-native-graph-input.v1";
export declare const TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION: "taskmap-native-publication-candidate.v1";
export declare const TASKMAP_NATIVE_CURRENTNESS_GATE_VERSION: "taskmap-native-currentness-gate.v1";
export declare const TASKMAP_NATIVE_CONTEXT_ONLY_RETIREMENT_VERSION: "taskmap-native-context-only-retirement.v1";
export declare const TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION: "taskmap-native-generation-reference.v1";
export declare const TASKMAP_NATIVE_GENERATION_MANIFEST_VERSION: "taskmap-native-generation-manifest.v1";
export declare const TASKMAP_NATIVE_GENERATION_REFERENCE_FILENAME: "taskmap-current-generation.v1.json";
export declare const TASKMAP_NATIVE_GENERATIONS_DIRECTORY: "taskmap-generations";
export declare const TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME: "taskmap-generation-manifest.v1.json";
export declare const TASKMAP_NATIVE_READY_PROOF_TARGETS_FILENAME: "taskmap-ready-proof-targets.v1.json";
export declare const TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION: "taskmap-body-signal-assessment.v1";
export declare const TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME: "taskmap-body-signal-assessment.v1.json";
export declare const TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND: Readonly<{
    readonly codex_session: "Codex sessions";
    readonly claude_session: "Claude sessions";
    readonly cursor_session: "Cursor sessions";
    readonly gemini_meet: "Gemini meeting notes";
    readonly granola: "Granola meeting notes";
    readonly google_calendar: "Google Calendar";
    readonly gmail: "Gmail";
    readonly slack: "Slack";
    readonly google_chat: "Google Chat";
    readonly linear: "Linear";
    readonly jira: "Jira";
    readonly github: "GitHub";
    readonly google_tasks: "Google Tasks";
    readonly strategy: "Strategy";
    readonly manual: "Manual work records";
}>;
export declare const TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABELS: readonly [...("Codex sessions" | "Claude sessions" | "Cursor sessions" | "Gemini meeting notes" | "Granola meeting notes" | "Google Calendar" | "Gmail" | "Slack" | "Google Chat" | "Linear" | "Jira" | "GitHub" | "Google Tasks" | "Strategy" | "Manual work records")[], "Another work source"];
export declare const TASKMAP_NATIVE_COMMUNITY_PLAN_DISCOVERY_BUDGET_MS = 5000;
export declare const TASKMAP_NATIVE_COMMUNITY_PLAN_INFERENCE_BUDGET_MS = 80000;
export declare const TASKMAP_NATIVE_COMMUNITY_PLAN_TITLE_BUDGET_MS: 30000;
export declare const TASKMAP_NATIVE_COMMUNITY_PLAN_PUBLICATION_HEADROOM_MS = 5000;
/** Discovery/auth + measured grouping + bounded title + publication headroom. */
export declare const TASKMAP_NATIVE_COMMUNITY_PLAN_DEFAULT_DEADLINE_MS: number;
export declare const TASKMAP_NATIVE_COMMUNITY_PLAN_MAX_DEADLINE_MS = 120000;
/** Bounded first-generation budget for per-root community task digestion. */
export declare const TASKMAP_COMMUNITY_TASK_DIGESTION_BUDGET_MS = 240000;
export declare const TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_FILENAME = "taskmap-community-task-digestion-report.v1.json";
interface TaskMapNativeSafeRecord {
    identityDigest: string;
    revision: string;
    occurredAtMs: number | null;
}
export interface TaskMapNativeSafeSlice {
    contractVersion: "taskmap-native-safe-source-slice.v1";
    /** Exact immutable owner binding on every refresh receipt. */
    ownerScopeDigest: string;
    source: TaskMapOwnerRefreshSource;
    recordCount: number;
    records: TaskMapNativeSafeRecord[];
    metadata: Record<string, string | number | boolean | null>;
    semanticAdmission?: TaskMapAgentSessionSemanticAdmissionV2;
}
export interface TaskMapNativeGraphInput {
    contractVersion: typeof TASKMAP_NATIVE_GRAPH_INPUT_VERSION;
    promotionReceiptHeadDigest: string;
    strategyProofDigest?: string;
    predecessorEvidenceBindingDigest?: string;
    sources: Array<{
        source: TaskMapOwnerRefreshSource;
        disposition: TaskMapOwnerRefreshSourceDisposition;
        revision: string | null;
        sliceDigest: string | null;
        value: TaskMapNativeSafeSlice | null;
    }>;
}
export type TaskMapNativeCandidate = Record<string, unknown>;
export interface TaskMapNativePublicationCandidate {
    contractVersion: typeof TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION;
    projection: TaskMapProjectionV1;
    currentness: {
        contractVersion: typeof TASKMAP_NATIVE_CURRENTNESS_GATE_VERSION;
        runId: string;
        inputDigest: string;
        projectionDigest: string;
        taskDispositions: Array<{
            taskId: string;
            disposition: "current" | "needs_lifecycle_review";
        }>;
    };
    ranking?: TaskMapTaskRankingPublicationV1;
    agentSessionEpisode?: TaskMapNativeAgentSessionEpisodeAdmissionV1;
    agentSessionTaskProofs?: TaskMapNativeAgentSessionTaskProofV1[];
    contextOnlyRetirement?: {
        contractVersion: typeof TASKMAP_NATIVE_CONTEXT_ONLY_RETIREMENT_VERSION;
        reason: "verified_no_eligible_work";
        graphInputDigest: string;
        coverageDigest: string;
    };
}
export interface TaskMapBodySignalAssessmentV1 {
    contractVersion: typeof TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION;
    artifactDigest: string;
    projection: {
        runId: string;
        inputDigest: string;
        projectionDigest: string;
    };
    physiologicalSnapshotDigest: string;
    assessedAt: string;
    sourceFamily: "physiological";
    signal: {
        axis: "composite_recovery";
        displayName: "Readiness + Sleep";
        comparison: "relative_to_recent_personal_range";
        targetCategory: "below_baseline";
    };
    coverage: {
        startDay: string;
        endDay: string;
        classifiedDays: number;
        unknownDays: number;
    };
    roots: Array<{
        rootId: string;
        relationship: "body_informed" | "repeated_association" | "not_established";
        evidenceLevel?: "body_informed" | "corroborated_association" | "not_established";
        observedSignalDates: string[];
        matchedWorkDates: string[];
        matchedWorkSources: string[];
        matchedDateCount: number;
        signalSummary: string;
        relevanceSummary: string;
        reasonCode: TaskMapBodyPatternResultV1["reasonCode"];
    }>;
    boundary: "Body-informed context only. Association is not proof of cause.";
    privacy: {
        rawBiometricsStored: false;
        sourceBodiesStored: false;
        localPathsStored: false;
        providerIdentityStored: false;
    };
}
export type TaskMapNativeRefreshSourceState = "current" | "retained" | "unavailable";
export type TaskMapNativeRefreshSourceProof = "local_source_read" | "live_provider_read";
export type TaskMapNativeMeetingExtractionDegradationCode = Extract<TaskMapMeetingExtractionDegradationCode, "no_provider" | "provider_unauthenticated" | "remote_consent_required">;
export type TaskMapNativeStationDegradationCode = "no_provider" | "provider_unauthenticated" | "remote_consent_required" | "prompt_template_missing" | "provider_rate_limited" | "provider_timeout" | "provider_malformed_output" | "invalid_extraction_output" | "runner_failure";
export interface TaskMapNativeRefreshSourceStatus {
    source: TaskMapOwnerRefreshSource;
    disposition: TaskMapOwnerRefreshSourceDisposition;
    state: TaskMapNativeRefreshSourceState;
    lastSuccessAtMs: number | null;
    nextDueAtMs: number | null;
    proof: TaskMapNativeRefreshSourceProof | null;
    /** Present only on meeting_notes for one report-wide station failure. */
    extractionDegradationCode?: TaskMapNativeMeetingExtractionDegradationCode;
    /** Present only on agent_session/calendar while extraction units are pending. */
    stationDegradationCode?: TaskMapNativeStationDegradationCode;
    stationPendingCount?: number;
}
export type TaskMapNativeCalendarProvider = "local_calendar" | "google_calendar";
export interface TaskMapNativeCalendarProviderStatus {
    provider: TaskMapNativeCalendarProvider;
    state: TaskMapNativeRefreshSourceState;
    freshness: TaskMapCalendarProviderFreshness;
    lastSuccessAtMs: number | null;
    nextDueAtMs: number | null;
    eventCount: number;
}
export interface TaskMapNativeLlmStationStatus {
    stationId: "identity-adjudication-v1" | "task-decomposition-v1";
    state: "current" | "deferred" | "unavailable";
    pendingCount: number;
    degradationCode: "embedding_provider_failed" | "llm_station_unavailable" | "validation_failed" | null;
    lastSuccessAtMs: number | null;
}
export interface TaskMapNativeSemanticGroupingRetentionV1 {
    state: "retained_predecessor";
    reason: "plan2_unavailable";
    /** SHA-256 of the exact immutable projection bytes that remain selected. */
    projectionDigest: string;
    /** Count of distinct receipt-backed accepted tasks in singleton roots. */
    acceptedTaskCount: number;
}
export interface TaskMapNativeRefreshStatusDocument {
    contractVersion: typeof TASKMAP_NATIVE_REFRESH_STATUS_VERSION;
    status: "ok" | "partial";
    refreshStatus: TaskMapNativeRefreshStatus;
    sourceStatuses: TaskMapNativeRefreshSourceStatus[];
    calendarProviderStatuses: TaskMapNativeCalendarProviderStatus[];
    stationStatuses: TaskMapNativeLlmStationStatus[];
    requestedAtMs: number;
    completedAtMs: number;
    nextDueAtMs: number;
    candidateDigest: string | null;
    projectionDigest: string | null;
    publicationBlockReason: TaskMapNativePublicationBlockReason;
    semanticGroupingRetention: TaskMapNativeSemanticGroupingRetentionV1 | null;
    failureStage: "identity_dedupe_barrier" | "graph_builder" | "publication" | null;
}
export type TaskMapNativeRefreshStatus = "published" | "no_op" | "unavailable";
export type TaskMapNativePublicationBlockReason = "semantic_provider_unavailable" | "accepted_membership_migration_unavailable" | "currentness_companion_required" | "predecessor_continuity_required" | "loader_incompatible" | "publication_failed" | null;
export interface TaskMapNativeRefreshResponse {
    status: "ok" | "partial";
    refreshStatus: TaskMapNativeRefreshStatus;
    sourceStatuses: TaskMapNativeRefreshSourceStatus[];
    calendarProviderStatuses?: TaskMapNativeCalendarProviderStatus[];
    /** Optional only for backward-compatible injected/old-runtime responses. */
    stationStatuses?: TaskMapNativeLlmStationStatus[];
    requestedAtMs: number;
    nextDueAtMs: number;
    publicationVerified: boolean;
    publicationBlockReason: TaskMapNativePublicationBlockReason;
    semanticGroupingRetention?: TaskMapNativeSemanticGroupingRetentionV1 | null;
}
export interface TaskMapNativePublicationInput {
    graphInputDigest: string;
    candidateDigest: string;
    candidate: TaskMapNativeCandidate;
    requestedAtMs: number;
    /** Exact owner-confirmed receipt head captured with the graph input. */
    promotionReceiptHeadDigest?: string;
    /** Required external authority for every owner-generation publication. */
    expectedOwnerScopeDigest?: string;
}
export interface TaskMapNativePublicationDependencies {
    writeCurrentness?: (directory: string, filename: string, value: TaskMapNativePublicationCandidate["currentness"]) => Promise<void>;
    writeCurrentWork?: (directory: string, filename: string, value: TaskMapNativeCurrentWorkV1) => Promise<void>;
    writeReadyProofTargets?: (directory: string, filename: string, value: TaskMapReadyProofTargetsV1) => Promise<void>;
    writeRanking?: (directory: string, filename: string, value: TaskMapTaskRankingPublicationV1) => Promise<void>;
    writeProjection?: (directory: string, filename: string, value: TaskMapProjectionV1) => Promise<void>;
    writeGenerationManifest?: (directory: string, filename: string, value: TaskMapNativeGenerationManifestV1) => Promise<void>;
    writeGenerationReference?: (directory: string, filename: string, value: TaskMapNativeGenerationReferenceV1) => Promise<void>;
}
interface TaskMapNativeGenerationArtifactReceipt {
    filename: string;
    sha256: string;
}
export interface TaskMapNativeGenerationManifestV1 {
    contractVersion: typeof TASKMAP_NATIVE_GENERATION_MANIFEST_VERSION;
    generationId: string;
    ownerScopeDigest: string;
    graphInputDigest: string;
    candidateDigest: string;
    requestedAtMs: number;
    artifacts: {
        projection: TaskMapNativeGenerationArtifactReceipt;
        currentness: TaskMapNativeGenerationArtifactReceipt;
        currentWork: TaskMapNativeGenerationArtifactReceipt | null;
        ranking: TaskMapNativeGenerationArtifactReceipt;
    };
}
export interface TaskMapNativeGenerationReferenceV1 {
    contractVersion: typeof TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION;
    generationId: string;
    ownerScopeDigest: string;
    manifestDigest: string;
}
export interface TaskMapNativePublicationResult {
    projectionDigest: string;
    candidateDigest: string;
    currentnessPreserved: true;
    rankingDigest?: string;
    readyProofTargetsDigest?: string;
}
export interface TaskMapNativeSourcePaths {
    agentSessionRoots: Array<{
        sourceLabel: "codex" | "claude";
        rootPath: string;
    }>;
    agentSessionProducerSnapshotPath: string;
    meetingSnapshotPaths: Array<{
        sourceLabel: "gdocs" | "granola";
        filePath: string;
    }>;
    residentReceiptPath: string;
    calendarExportPath: string;
    googleCalendarSnapshotPath: string;
    physiologicalSnapshotPath: string;
}
export interface TaskMapNativeStrategyFallbackOptions {
    homeDirectory: string;
    readAdapterInput: () => Promise<ReadTaskMapStrategySourceAdapterInputV1>;
}
export interface TaskMapNativeCommunityGraphCollectionMetrics {
    discoveredCandidates: number;
    directoriesVisited: number;
    discoveryExhausted: boolean;
    directoryLimitReached: boolean;
    candidateLimitReached: boolean;
    attemptedFiles: number;
    chargedScanBytes: number;
    droppedAttemptLimit: number;
    droppedScanBudget: number;
    droppedInvalid: number;
    rawBytesSelected: number;
    droppedRawByteBudget: number;
    selectedObservations: number;
    droppedObservationLimit: number;
    selectedProviderCounts: {
        codex: number;
        claude: number;
    };
    selectedIsoWeeks: string[];
}
export interface TaskMapNativeRefreshServiceOptions {
    /** Unforgeable authority returned only after persisted enrollment checks. */
    confirmedOwner: ConfirmedTaskMapOwner;
    runtimeRoot?: string;
    meetingProducerSnapshotPath?: string;
    sourcePaths?: Partial<TaskMapNativeSourcePaths>;
    collectors?: Partial<TaskMapOwnerRefreshCollectors<TaskMapNativeSafeSlice>>;
    graphBuilder?: (input: TaskMapOwnerIdentityBarrierResult<TaskMapNativeGraphInput>) => Promise<TaskMapOwnerGraphBuildResult<TaskMapNativeCandidate>>;
    publisher?: (input: TaskMapNativePublicationInput) => Promise<TaskMapNativePublicationResult>;
    projectionPath?: string;
    currentnessPath?: string;
    nowMs?: () => number;
    readPhysiologicalProviderContext?: TaskMapPhysiologicalProviderReader;
    strategyFallback?: TaskMapNativeStrategyFallbackOptions;
    lockWaitMs?: number;
    /** Deterministic local-process identity seam for isolated lock tests. */
    readProcessStartMarker?: (pid: number) => Promise<string | null>;
    /** Deterministic lock interleaving seams; production callers omit both. */
    afterLockReceiptClaimForTesting?: () => Promise<void>;
    afterLockAcquisitionMissForTesting?: () => void;
    afterEmptyLockRecoveryReceiptClaimForTesting?: () => Promise<void>;
    /** Authenticated receipt-head reader seam for deterministic lock tests. */
    readCandidateAcceptanceHeadDigest?: () => Promise<string>;
    rawGranolaSnapshotPath?: string;
    meetingExtractionPromptTemplatePath?: string;
    createMeetingExtractionStation?: TaskMapLlmStationFactory;
    agentSessionExtractionPromptTemplatePath?: string;
    communityTaskExtractionPromptTemplatePath?: string;
    calendarExtractionPromptTemplatePath?: string;
    createAgentSessionExtractionStation?: TaskMapLlmStationFactory;
    createCalendarExtractionStation?: TaskMapLlmStationFactory;
    /** Station-2 deterministic seams; production resolves enrolled remote/local providers. */
    identityEmbeddingProvider?: EmbeddingProvider;
    identityEmbeddingModelId?: string;
    createIdentityAdjudicationStation?: TaskMapLlmStationFactory;
    /** Station-3 deterministic seam; production resolves the shared LLM station. */
    createDecompositionStation?: TaskMapLlmStationFactory;
    /** Production-default transport seams for fixture-backed refresh tests. */
    defaultLlmStationOptions?: Omit<LlmStationOptions, "remoteRequestGroupId">;
    defaultRemoteEmbeddingOptions?: Omit<RemoteGeminiEmbeddingOptions, "requestGroupId">;
    /** Separate Station-1 instance used only by the review-only community graph. */
    createCommunityGroupingStation?: TaskMapLlmStationFactory;
    /** Optional Plan2 embeddings. `null` explicitly disables key lookup. */
    communityPlanEmbeddingProvider?: EmbeddingProvider | null;
    communityPlanEmbeddingModelId?: string | null;
    /** Total lock-held Plan2 deadline. Production uses the bounded 120s budget. */
    communityPlanDeadlineMs?: number;
    /** Explicit graph-only feed seam when collector overrides own agent input. */
    agentSessionGraphFeedForTesting?: TaskMapAgentSessionGraphFeedV1 | null;
    /** Internal graph-only scan metrics; never enters a durable contract. */
    afterAgentSessionGraphCollectionForTesting?: (metrics: TaskMapNativeCommunityGraphCollectionMetrics) => void;
    /** Deterministic source-race seam; production callers omit it. */
    afterDefaultContextBarrierForTesting?: () => Promise<void>;
    /** Deterministic final source-check race seam; production callers omit it. */
    afterDefaultContextFreshSlicesForTesting?: () => Promise<void>;
}
declare function readRegularJson(filePath: string, maximumBytes?: number): Promise<{
    parsed: unknown;
    bytes: Buffer;
    modifiedAtMs: number;
}>;
export interface TaskMapCurrentOwnerGranolaEvidenceV1 {
    snapshotPath: string;
    residentReceiptPath: string;
    snapshot: Awaited<ReturnType<typeof readRegularJson>>;
    snapshotDigest: string;
    successAtMs: number;
    validThroughMs: number;
}
export declare function resolveCurrentTaskMapOwnerGranolaEvidence(snapshotPath: string, residentReceiptPath: string, assessedAtMs: number, expectedOwnerScopeDigest: string): Promise<TaskMapCurrentOwnerGranolaEvidenceV1>;
export declare function loadCurrentTaskMapOwnerGranolaExtractionReport(input: {
    snapshotPath: string;
    residentReceiptPath: string;
    assessedAt: string;
    taskMapRoot: string;
    runtimeRoot: string;
    ownerScopeDigest: string;
    promptTemplatePath: string;
}): Promise<VerifiedTaskMapGranolaExtractionReportV1>;
/**
 * Promotion receipts whose authoritative tasks have already been published.
 * Candidate presentation uses this fail-closed handoff boundary: an absent or
 * invalid publication hides nothing, so a durable adoption cannot disappear
 * merely because refresh or relaunch happened before publication succeeded.
 */
export declare function acceptedPromotionIdsInVerifiedTaskMapProjection(taskMapRoot: string, expectedOwnerScopeDigest: string): Promise<Set<string>>;
export declare function taskMapNativeReadyProofTargetsPath(projectionPath: string): string;
export declare function nativeTaskMapGenerationReferencePath(projectionPath: string): string;
export declare function nativeTaskRankingPath(projectionPath: string): string;
export declare function boundedHistoricalGenerationIdsForRecovery(generationIds: readonly string[]): string[] | null;
export declare function mergeAcceptedAgentSessionTaskProofHistory(immediate: readonly TaskMapNativeAgentSessionTaskProofV1[], historical: readonly TaskMapNativeAgentSessionTaskProofV1[]): TaskMapNativeAgentSessionTaskProofV1[];
export declare function currentnessForNativeProjection(projection: TaskMapProjectionV1, predecessor: TaskMapNativePublicationCandidate["currentness"] | null): TaskMapNativePublicationCandidate["currentness"];
export declare function publishTaskMapNativeProjection(projectionPath: string, currentnessPath: string, journalPath: string, input: TaskMapNativePublicationInput, dependencies?: TaskMapNativePublicationDependencies): Promise<TaskMapNativePublicationResult>;
export declare function reconcileTaskMapProjectionMembership(projection: TaskMapProjectionV1): TaskMapProjectionV1;
export declare function buildAgentSessionOnlyProjection(admission: TaskMapAgentSessionSemanticAdmissionV2, extraction: TaskMapAgentSessionExtractionReportV1, generatedAt: string, previousProjection?: TaskMapProjectionV1, pendingWorkstreamDigests?: ReadonlySet<string>, communityRootPlan?: TaskMapNativeCommunityAgentRootPlanV1, rootEvidence?: TaskMapNativeCommunityRootEvidenceV1 | null, taskDigestion?: TaskMapCommunityTaskDigestionV1 | null): TaskMapProjectionV1;
/**
 * Extract only the proposal-only Agent community component from a verified
 * mixed-source projection. This lets a degraded Agent refresh retain semantic
 * work without reviving stale Meeting or Calendar roots.
 */
export declare function agentCommunitySubtreeOf(projection: TaskMapProjectionV1): TaskMapProjectionV1 | null;
/**
 * Reconstruct the published community membership identity that Plan2 needs
 * for cross-generation root reuse. Projection citations contain only local,
 * opaque episode digests; the current feed maps those digests back to the
 * graph node IDs consumed by the Hungarian/Jaccard reuse harness.
 */
export declare function previousAcceptedCommunityRootsFromProjection(projection: TaskMapProjectionV1 | null, feed: TaskMapAgentSessionGraphFeedV1 | null): TaskMapPreviousAcceptedRootV1[];
export declare function acceptedAgentSessionTaskProofs(admission: TaskMapAgentSessionSemanticAdmissionV2 | null, extraction: TaskMapAgentSessionExtractionReportV1 | null, acceptanceStore: TaskMapNativeCandidateAcceptanceStoreV1 | null, projection: TaskMapProjectionV1, ranking: TaskMapTaskRankingPublicationV1): TaskMapNativeAgentSessionTaskProofV1[];
export declare function acceptedMembershipPredecessorProjection(projection: TaskMapProjectionV1, excludedTaskIds?: ReadonlySet<string>): TaskMapProjectionV1 | null;
export declare function composeCurrentWorkProjections(meetingProjection: TaskMapProjectionV1, agentProjection: TaskMapProjectionV1): TaskMapProjectionV1;
export declare function retainedSemanticGroupingMarker(projection: TaskMapProjectionV1, projectionDigest: string, acceptanceStore: TaskMapNativeCandidateAcceptanceStoreV1 | null, blockReason: TaskMapNativePublicationBlockReason): TaskMapNativeSemanticGroupingRetentionV1 | null;
export declare function acceptedAgentMigrationResultUnavailable(beforeRecovery: ReadonlySet<string>, unresolvedAfterRecovery: ReadonlySet<string>, survivingTaskIds: ReadonlySet<string>, multiMemberSemanticPlanAvailable?: boolean): boolean;
export declare function acceptedAgentTopicMembershipEdgeShouldBeReplaced(edge: Pick<TaskMapEdge, "relation" | "to">, movedTaskIds: ReadonlySet<string>): boolean;
export declare function mergeTaskMapSemanticFragment(base: TaskMapNativeSemanticBuilderInputV1, fragment: {
    ownerScopeDigest: string;
    sourceBindings: TaskMapNativeSemanticBuilderInputV1["sourceBindings"];
    evidenceBindings: TaskMapNativeSemanticBuilderInputV1["evidenceBindings"];
    taskMapInput: TaskMapInput;
}): TaskMapNativeSemanticBuilderInputV1;
export declare function emptyTaskMapSemanticInputForAcceptedReceipts(ownerScopeDigest: string, assessedAt: string): TaskMapNativeSemanticBuilderInputV1;
export declare function taskMapBodyAssessmentPreservesAcceptedMembership(baseline: TaskMapProjectionV1, fixed: TaskMapProjectionV1): boolean;
export declare class TaskMapNativeRefreshService {
    readonly runtimeRoot: string;
    private readonly statePath;
    private readonly statusPath;
    private readonly candidatePath;
    private readonly lockPath;
    private readonly projectionPath;
    private readonly currentnessPath;
    private readonly bodySignalAssessmentPath;
    private readonly publicationJournalPath;
    private readonly candidateAcceptanceStorePath;
    private readonly sourcePaths;
    private readonly meetingProducerSnapshotPath;
    private readonly ownerScope;
    private readonly usesDefaultGraphBuilder;
    private readonly nowMs;
    private readonly readPhysiologicalProviderContext;
    private readonly strategyFallback;
    private readonly collectorOverrides;
    private readonly graphBuilder;
    private readonly publisher;
    private readonly lockWaitMs;
    private readonly readProcessStartMarker;
    private readonly afterLockReceiptClaimForTesting;
    private readonly afterLockAcquisitionMissForTesting;
    private readonly afterEmptyLockRecoveryReceiptClaimForTesting;
    private readonly readCandidateAcceptanceHeadDigest;
    private readonly rawGranolaSnapshotPath;
    private readonly meetingExtractionPromptTemplatePath;
    private readonly createMeetingExtractionStation;
    private readonly agentSessionExtractionPromptTemplatePath;
    private readonly communityTaskExtractionPromptTemplatePath;
    private readonly calendarExtractionPromptTemplatePath;
    private readonly createAgentSessionExtractionStation;
    private readonly createCalendarExtractionStation;
    private readonly identityEmbeddingProvider;
    private readonly identityEmbeddingModelId;
    private readonly createIdentityAdjudicationStation;
    private readonly createDecompositionStation;
    private readonly defaultLlmStationOptions;
    private readonly defaultRemoteEmbeddingOptions;
    private activeRemoteRequestGroupId;
    private identityStationStatus;
    private decompositionStationStatus;
    private readonly createCommunityGroupingStation;
    private readonly communityPlanEmbeddingProvider;
    private readonly communityPlanEmbeddingModelId;
    private readonly communityPlanDeadlineMs;
    private readonly agentSessionGraphFeedForTesting;
    private readonly afterAgentSessionGraphCollectionForTesting;
    private communityPlanCircuitOpen;
    private pendingRawGranolaReport;
    private pendingAgentSessionExtraction;
    private pendingCalendarExtraction;
    private pendingCalendarResult;
    private pendingAgentSessionGraphFeed;
    private pendingAgentSessionGraphFileReceipts;
    private pendingAgentSessionGraphMetrics;
    private pendingAgentExtractionUnavailableCount;
    private pendingCalendarExtractionUnavailableCount;
    private pendingAgentExtractionUnavailableCode;
    private pendingCalendarExtractionUnavailableCode;
    private pendingRawGranolaCandidateReportDigest;
    private readonly afterDefaultContextBarrierForTesting;
    private readonly afterDefaultContextFreshSlicesForTesting;
    private pendingBodySignalAssessment;
    private pendingCalendarProviderStatuses;
    constructor(options: TaskMapNativeRefreshServiceOptions);
    private readDefaultMeetingProducer;
    private readDefaultContextSourceSlice;
    private assertDefaultContextBarrierBindings;
    private assertDefaultContextFreshSlices;
    private readDefaultStrategyFallback;
    private assertDefaultStrategyFallbackFixedPredecessor;
    private revalidatePendingRawGranolaReport;
    private refreshPendingStationExtractions;
    private identityEmbeddingSelection;
    private llmStationFactory;
    private refreshIdentityAdjudicationStation;
    private identityAdjudicationInputDigest;
    private restoreIdentityAdjudicationStationStatus;
    private stationStatuses;
    private semanticGroupingRetention;
    private restoreDecompositionStationStatus;
    private refreshDecompositionStation;
    private communityGraphCoverage;
    private buildAuthoritativeAgentRootPlan;
    /**
     * Digests each Plan2 root's selected evidence into semantic review leaves.
     * Recorded envelopes replay byte-identically without a station; a failed
     * digestion returns null and the projection then drops taskless roots
     * instead of inventing placeholder tasks.
     */
    private digestCommunityRootTasks;
    private pendingAgentSessionGraphFilesAreCurrent;
    private finalizeDefaultGraphCandidate;
    private buildDefaultGraphCandidate;
    private publishPendingBodySignalAssessment;
    requestRefresh(trigger: TaskMapOwnerRefreshTrigger): Promise<TaskMapNativeRefreshResponse>;
    /**
     * Reconcile only a durable publication generation. This is intentionally
     * separate from refresh so an application can repair a crash boundary
     * before any fixed-path reader is allowed to load Task Map artifacts.
     */
    recoverPendingPublication(): Promise<boolean>;
    private collectSource;
    private executeWithLock;
    private waitForLockOwner;
    private executeLocked;
    private writeStatus;
}
export {};
