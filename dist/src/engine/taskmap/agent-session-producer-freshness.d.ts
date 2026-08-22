/**
 * Local, bounded semantic evidence from Codex and Claude Code sessions.
 *
 * This contract deliberately does not carry a transcript, a local path, tool
 * arguments, reasoning, credentials, lifecycle state, or accepted Task Map
 * membership. It is only candidate/context input for a later semantic gate.
 */
export declare const TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION: "taskmap-agent-session-producer-snapshot.v2";
export declare const TASKMAP_AGENT_SESSION_PRODUCER_RESULT_VERSION: "taskmap-agent-session-producer-result.v2";
export declare const TASKMAP_AGENT_SESSION_PRODUCER_VERSION: "taskmap-agent-session-producer.2";
export declare const TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS: 14400000;
export declare const TASKMAP_AGENT_SESSION_CONTEXT_WINDOW_MS: number;
export declare const TASKMAP_AGENT_SESSION_OWNER_SCOPE_DOMAIN: "taskmap-agent-session-owner-local.1";
export declare const TASKMAP_AGENT_SESSION_IDENTITY_DOMAIN: "taskmap-agent-session-identity.1";
export declare const TASKMAP_AGENT_SESSION_EPISODE_IDENTITY_DOMAIN: "taskmap-agent-session-work-episode-identity.2";
export declare const TASKMAP_AGENT_SESSION_TURN_LINEAGE_IDENTITY_DOMAIN: "taskmap-agent-session-turn-lineage-identity.2";
export declare const TASKMAP_AGENT_SESSION_DIRECTIVE_SEMANTIC_DOMAIN: "taskmap-agent-session-directive-semantic.2";
export declare const TASKMAP_AGENT_SESSION_PROJECT_ROUTING_DOMAIN: "taskmap-agent-session-project-routing.1";
export declare const TASKMAP_AGENT_SESSION_REPOSITORY_ROUTING_DOMAIN: "taskmap-agent-session-repository-routing.1";
export declare const TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_PROJECT_ROUTING_DOMAIN: "taskmap-agent-session-provider-neutral-project-routing.2";
export declare const TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_REPOSITORY_ROUTING_DOMAIN: "taskmap-agent-session-provider-neutral-repository-routing.2";
export declare const TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1: Readonly<{
    readonly maxObservations: 128;
    readonly maxEpisodesPerRootSession: 16;
    readonly maxEpisodesGlobal: 64;
    readonly maxRawBytesPerObservation: number;
    readonly maxRawBytesGlobal: number;
    readonly maxHeadScanBytes: number;
    readonly maxTailScanBytes: number;
    readonly maxLinesPerObservation: 4096;
    readonly maxLineBytes: number;
    readonly maxNativeIdentityBytes: 1024;
    readonly maxRoutingIdentityDigestsPerKind: 2;
    readonly maxUserDirectiveCharacters: 360;
    readonly maxAssistantOutcomeCharacters: 480;
    readonly maxSnapshotBytes: number;
}>;
/**
 * Separate, graph-only ingestion bounds. These do not widen the persisted
 * producer snapshot or the native semantic builder input.
 */
export declare const TASKMAP_GRAPH_BRAIN_LIMITS_V1: Readonly<{
    readonly maxObservations: 512;
    readonly maxEpisodesGlobal: 256;
    readonly maxRawBytesPerObservation: number;
    readonly maxRawBytesGlobal: number;
}>;
/** Preferred v2 name; V1 is retained for downstream source compatibility. */
export declare const TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V2: Readonly<{
    readonly maxObservations: 128;
    readonly maxEpisodesPerRootSession: 16;
    readonly maxEpisodesGlobal: 64;
    readonly maxRawBytesPerObservation: number;
    readonly maxRawBytesGlobal: number;
    readonly maxHeadScanBytes: number;
    readonly maxTailScanBytes: number;
    readonly maxLinesPerObservation: 4096;
    readonly maxLineBytes: number;
    readonly maxNativeIdentityBytes: 1024;
    readonly maxRoutingIdentityDigestsPerKind: 2;
    readonly maxUserDirectiveCharacters: 360;
    readonly maxAssistantOutcomeCharacters: 480;
    readonly maxSnapshotBytes: number;
}>;
declare const PRIVACY: Readonly<{
    fullAgentSessionBodiesStored: false;
    localPathsStored: false;
    credentialsStored: false;
    toolArgumentsStored: false;
    chainOfThoughtStored: false;
    participantDetailsStored: false;
}>;
export type TaskMapAgentSessionProvider = "codex" | "claude";
export interface TaskMapAgentSessionObservationV1 {
    provider: TaskMapAgentSessionProvider;
    rawJsonl: string;
    coverage?: "complete" | "partial";
}
export interface TaskMapAgentSessionCompactedJsonlLineV1 {
    kind: "identity" | "routing" | "user" | "assistant";
    jsonlLine: string;
}
export interface TaskMapAgentSessionProducerSnapshotDraftV1 {
    ownerScopeDigest: string;
    producedAt: string;
    observations: TaskMapAgentSessionObservationV1[];
}
export interface TaskMapAgentSessionWorkEpisodeRoutingV1 {
    role: "routing_metadata_only";
    projectIdentityDigests: string[];
    repositoryIdentityDigests: string[];
    providerNeutralProjectIdentityDigests: string[];
    providerNeutralRepositoryIdentityDigests: string[];
}
export type TaskMapAgentSessionDirectiveDispositionV2 = "acknowledgement_only" | "continuity_only" | "option_only" | "terminal_control" | "work_candidate";
export type TaskMapAgentSessionGraphDirectiveClassificationV1 = TaskMapAgentSessionDirectiveDispositionV2 | "execution_receipt";
/**
 * One row is one bounded user-turn episode, including exact non-work
 * dispositions needed to prevent prior-task resurrection. It is not an
 * entire conversation. Session lineage and routing remain provenance only.
 */
export interface TaskMapAgentSessionWorkEpisodeV1 {
    episodeId: string;
    episodeIdentityDigest: string;
    episodeRevisionDigest: string;
    /** Effective support identity: native lineage, or semantic fallback. */
    turnLineageIdentityDigest: string;
    directiveSemanticDigest: string;
    disposition: TaskMapAgentSessionDirectiveDispositionV2;
    rootSessionIdentityDigest: string;
    parentRootSessionIdentityDigest: string | null;
    provider: TaskMapAgentSessionProvider;
    semanticUnit: "bounded_user_turn_work_episode";
    recordKind: "work_context";
    proposalDisposition: "candidate_or_context_only";
    authority: "none";
    acceptedMembershipAuthority: false;
    lifecycleAuthority: false;
    completionAuthority: false;
    verificationAuthority: false;
    occurredAt: string;
    observedAt: string;
    routing: TaskMapAgentSessionWorkEpisodeRoutingV1;
    userDirectiveSummary: string;
    assistantOutcomeSummary: string | null;
}
export interface TaskMapAgentSessionProducerRejectionsV1 {
    malformed: number;
    oversize: number;
    missingIdentity: number;
    missingUserRequest: number;
    episodeOverflow: number;
}
export interface TaskMapAgentSessionProducerSnapshotV1 {
    contractVersion: typeof TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION;
    snapshotId: string;
    snapshotDigest: string;
    producerVersion: typeof TASKMAP_AGENT_SESSION_PRODUCER_VERSION;
    ownerScopeDigest: string;
    producedAt: string;
    validThrough: string;
    maxAgeMs: typeof TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS;
    coverage: "complete" | "partial" | "fresh_empty";
    observedCount: number;
    rejections: TaskMapAgentSessionProducerRejectionsV1;
    watermark: {
        kind: "episode_revision";
        valueDigest: string;
        observedThrough: string;
    };
    sessions: TaskMapAgentSessionWorkEpisodeV1[];
    privacy: typeof PRIVACY;
}
export type TaskMapAgentSessionFreshnessDecision = "fresh" | "boundary_due" | "stale" | "missing" | "unknown_version" | "malformed";
export interface TaskMapAgentSessionProducerResultV1 {
    contractVersion: typeof TASKMAP_AGENT_SESSION_PRODUCER_RESULT_VERSION;
    resultId: string;
    resultDigest: string;
    producerVersion: typeof TASKMAP_AGENT_SESSION_PRODUCER_VERSION;
    availability: "available" | "unavailable";
    coverage: "complete" | "partial" | "fresh_empty" | "unavailable";
    freshness: {
        decision: TaskMapAgentSessionFreshnessDecision;
        interval: "[producedAt,validThrough)";
        assessedAt: string;
        producedAt: string | null;
        validThrough: string | null;
        maxAgeMs: typeof TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS;
        currentSemanticInputEligible: boolean;
    };
    snapshot: TaskMapAgentSessionProducerSnapshotV1 | null;
    reasonDetailDigest: string;
    privacy: typeof PRIVACY;
}
export interface TaskMapAgentSessionProducerLoadInputV1 {
    snapshotPath: string;
    assessedAt: string;
    expectedOwnerScopeDigest: string;
}
export interface TaskMapAgentSessionProducerWriteInputV1 {
    snapshotPath: string;
    snapshot: TaskMapAgentSessionProducerSnapshotV1;
}
/** Preferred v2 names; v1 declarations remain as compatibility aliases. */
export type TaskMapAgentSessionObservationV2 = TaskMapAgentSessionObservationV1;
export type TaskMapAgentSessionProducerSnapshotDraftV2 = TaskMapAgentSessionProducerSnapshotDraftV1;
export type TaskMapAgentSessionWorkEpisodeRoutingV2 = TaskMapAgentSessionWorkEpisodeRoutingV1;
export type TaskMapAgentSessionWorkEpisodeV2 = TaskMapAgentSessionWorkEpisodeV1;
export type TaskMapAgentSessionProducerRejectionsV2 = TaskMapAgentSessionProducerRejectionsV1;
export type TaskMapAgentSessionProducerSnapshotV2 = TaskMapAgentSessionProducerSnapshotV1;
export type TaskMapAgentSessionProducerResultV2 = TaskMapAgentSessionProducerResultV1;
export type TaskMapAgentSessionProducerLoadInputV2 = TaskMapAgentSessionProducerLoadInputV1;
export type TaskMapAgentSessionProducerWriteInputV2 = TaskMapAgentSessionProducerWriteInputV1;
export interface TaskMapAgentSessionGraphEpisodeSelectionDraftV1 {
    ownerScopeDigest: string;
    producedAt: string;
    observations: TaskMapAgentSessionObservationV1[];
}
export interface TaskMapAgentSessionGraphEpisodeSelectionV1 {
    ownerScopeDigest: string;
    producedAt: string;
    observedCount: number;
    /** All validated, receipt-free work occurrences used only for recurrence. */
    recurrenceEpisodes: TaskMapAgentSessionWorkEpisodeV1[];
    /** First/latest graph-node evidence for each native root. */
    episodes: TaskMapAgentSessionWorkEpisodeV1[];
}
export declare function classifyTaskMapAgentSessionDirectiveForGraph(value: string): TaskMapAgentSessionGraphDirectiveClassificationV1;
/**
 * Pure traversal guard for the native collector. Claude stores delegated
 * sessions below `subagents/`; those files are receipts of delegation rather
 * than independent owner work. Codex paths retain their existing behavior.
 */
export declare function isTaskMapAgentSessionDiscoveryPathEligible(provider: TaskMapAgentSessionProvider, candidatePath: string): boolean;
/**
 * Reduces one already byte-bounded JSONL row to only the fields consumed by
 * the episode parser. Tool/system/reasoning/compaction/delegation rows return
 * null. User and assistant text is privacy-sanitized and character-bounded
 * before it can enter the in-memory compacted observation.
 */
export declare function compactTaskMapAgentSessionJsonlLine(provider: TaskMapAgentSessionProvider, rawLine: string): TaskMapAgentSessionCompactedJsonlLineV1 | null;
export declare function buildTaskMapAgentSessionProducerSnapshot(input: TaskMapAgentSessionProducerSnapshotDraftV1): TaskMapAgentSessionProducerSnapshotV1;
/**
 * Validates the wider graph-only observation feed, deduplicates immutable
 * episode revisions, and retains the first and latest real directive for each
 * native root. It intentionally does not call or widen the persisted producer.
 */
export declare function selectTaskMapAgentSessionGraphEpisodeCandidates(input: TaskMapAgentSessionGraphEpisodeSelectionDraftV1): TaskMapAgentSessionGraphEpisodeSelectionV1;
export declare function assertTaskMapAgentSessionProducerSnapshot(value: unknown): asserts value is TaskMapAgentSessionProducerSnapshotV1;
/**
 * Semantic admission may use this view for "current topic" selection while
 * the producer snapshot retains earlier bounded episodes for continuity and
 * later anti-resurrection matching.
 */
export declare function selectLatestTaskMapAgentSessionWorkEpisodesByRoot(sessions: readonly TaskMapAgentSessionWorkEpisodeV1[]): TaskMapAgentSessionWorkEpisodeV1[];
export declare function assessTaskMapAgentSessionProducerSnapshot(value: unknown, assessedAtInput: string): TaskMapAgentSessionProducerResultV1;
export declare function taskMapAgentSessionOwnerScopeDigest(userId: string): string;
export declare function taskMapAgentSessionProducerSnapshotPath(homeDirectory: string): string;
/**
 * Explicit local writer. The canonical artifact is owner-only (0600), while
 * the containing product directory is owner-only (0700).
 */
export declare function writeTaskMapAgentSessionProducerSnapshot(input: TaskMapAgentSessionProducerWriteInputV1): Promise<void>;
/**
 * Authenticated local read only. The returned result never includes the local
 * path and never turns retained or malformed bytes into semantic input.
 */
export declare function loadTaskMapAgentSessionProducerResult(input: TaskMapAgentSessionProducerLoadInputV1): Promise<TaskMapAgentSessionProducerResultV1>;
export {};
