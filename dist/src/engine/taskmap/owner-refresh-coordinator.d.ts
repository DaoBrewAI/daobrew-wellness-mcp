/**
 * Small host-side coordinator for refreshing the owner Task Map.
 *
 * The coordinator owns orchestration only:
 * - collectors are injected read-only functions;
 * - collected slices remain opaque here;
 * - one injected identity/dedupe barrier sees all four settled sources;
 * - one injected graph builder may run only after that barrier succeeds;
 * - no connector, task inference, publication, or external write happens here.
 */
export declare const TASKMAP_OWNER_REFRESH_POLICY_VERSION: "taskmap-owner-refresh-policy.1";
/**
 * Product cadence requested for owner freshness. This is a due-status policy,
 * not a timer, timeout, retry loop, or resource limit.
 */
export declare const TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS: number;
export declare const TASKMAP_OWNER_REFRESH_SOURCES: readonly ["agent_session", "meeting_notes", "calendar", "body"];
export type TaskMapOwnerRefreshSource = (typeof TASKMAP_OWNER_REFRESH_SOURCES)[number];
export type TaskMapOwnerRefreshTrigger = "launch" | "manual" | "timer";
export type TaskMapOwnerRefreshSourceDisposition = "fresh" | "retained_last_good" | "unavailable";
export interface TaskMapOwnerCollectedSlice<TSlice> {
    /** Immutable owner binding required on every collected or restored slice. */
    ownerScopeDigest: string;
    /**
     * Provider-native or adapter-native revision. The coordinator compares
     * neither its format nor its meaning.
     */
    revision: string;
    /**
     * Digest of the bounded normalized slice. Raw counts never become work here.
     */
    sliceDigest: string;
    /**
     * Opaque normalized input for the mandatory identity/dedupe barrier.
     */
    value: TSlice;
}
export interface TaskMapOwnerSettledSource<TSlice> {
    source: TaskMapOwnerRefreshSource;
    disposition: TaskMapOwnerRefreshSourceDisposition;
    slice?: TaskMapOwnerCollectedSlice<TSlice>;
}
export interface TaskMapOwnerIdentityBarrierInput<TSlice> {
    sources: readonly TaskMapOwnerSettledSource<TSlice>[];
}
export interface TaskMapOwnerIdentityBarrierResult<TGraphInput> {
    /**
     * Deterministic identity/dedupe output digest. Equal digests are the only
     * basis for coordinator-level no-op detection.
     */
    graphInputDigest: string;
    graphInput: TGraphInput;
}
export interface TaskMapOwnerGraphBuildResult<TCandidate> {
    candidateDigest: string;
    candidate: TCandidate;
}
export type TaskMapOwnerRefreshCollectors<TSlice> = {
    [TSource in TaskMapOwnerRefreshSource]: () => Promise<TaskMapOwnerCollectedSlice<TSlice>>;
};
export interface TaskMapOwnerRefreshCoordinatorDependencies<TSlice, TGraphInput, TCandidate> {
    /** Reject fresh and restored slices outside this immutable owner scope. */
    expectedOwnerScopeDigest: string;
    collectors: TaskMapOwnerRefreshCollectors<TSlice>;
    identityDedupeBarrier: (input: TaskMapOwnerIdentityBarrierInput<TSlice>) => Promise<TaskMapOwnerIdentityBarrierResult<TGraphInput>>;
    graphBuilder: (input: TaskMapOwnerIdentityBarrierResult<TGraphInput>) => Promise<TaskMapOwnerGraphBuildResult<TCandidate>>;
}
export interface TaskMapOwnerRefreshRequest {
    trigger: TaskMapOwnerRefreshTrigger;
    nowMs: number;
}
export type TaskMapOwnerRefreshStatus = "publication_candidate_ready" | "no_op" | "blocked";
export type TaskMapOwnerRefreshFailureStage = "identity_dedupe_barrier" | "graph_builder";
export interface TaskMapOwnerPublicationCandidate<TCandidate> {
    graphInputDigest: string;
    candidateDigest: string;
    candidate: TCandidate;
}
export interface TaskMapOwnerRefreshSourceStatus {
    source: TaskMapOwnerRefreshSource;
    disposition: TaskMapOwnerRefreshSourceDisposition;
}
export interface TaskMapOwnerRefreshDueStatus {
    policyVersion: typeof TASKMAP_OWNER_REFRESH_POLICY_VERSION;
    intervalMs: typeof TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS;
    state: "never_refreshed" | "current" | "due";
    due: boolean;
    lastSuccessfulRefreshAtMs: number | null;
    nextDueAtMs: number | null;
}
export interface TaskMapOwnerRefreshResult<TCandidate> {
    policyVersion: typeof TASKMAP_OWNER_REFRESH_POLICY_VERSION;
    status: TaskMapOwnerRefreshStatus;
    requestedAtMs: number;
    triggers: TaskMapOwnerRefreshTrigger[];
    coalescedRequestCount: number;
    sourceStatuses: TaskMapOwnerRefreshSourceStatus[];
    graphInputDigest: string | null;
    candidateDigest: string | null;
    publicationCandidate: TaskMapOwnerPublicationCandidate<TCandidate> | null;
    failureStage: TaskMapOwnerRefreshFailureStage | null;
    dueStatus: TaskMapOwnerRefreshDueStatus;
}
export declare function taskMapOwnerRefreshDueStatus(nowMs: number, lastSuccessfulRefreshAtMs: number | null): TaskMapOwnerRefreshDueStatus;
/**
 * Coalescing in-memory owner-refresh coordinator.
 *
 * Host code may call requestRefresh from launch, a timer, or a manual action.
 * Overlapping calls share the exact same Promise and one collector/barrier/
 * builder pass. The host remains responsible for scheduling and publication.
 */
export declare class TaskMapOwnerRefreshCoordinator<TSlice, TGraphInput, TCandidate> {
    private readonly dependencies;
    private readonly lastGood;
    private activeRun;
    private lastVerifiedGraphInputDigest;
    private lastVerifiedPublication;
    private lastSuccessfulRefreshAtMs;
    constructor(dependencies: TaskMapOwnerRefreshCoordinatorDependencies<TSlice, TGraphInput, TCandidate>);
    dueStatus(nowMs: number): TaskMapOwnerRefreshDueStatus;
    /**
     * Advance the coordinator's no-op baseline only after the host has
     * atomically published and independently verified the candidate.
     *
     * Candidate construction alone is deliberately insufficient: callers may
     * crash, fail validation, or lose a publication race after graph building.
     */
    acknowledgeVerifiedPublication(publication: TaskMapOwnerPublicationCandidate<TCandidate>, publishedAtMs: number): void;
    restoreLastGoodSource(source: TaskMapOwnerRefreshSource, slice: TaskMapOwnerCollectedSlice<TSlice>): void;
    requestRefresh(request: TaskMapOwnerRefreshRequest): Promise<TaskMapOwnerRefreshResult<TCandidate>>;
    private executeRun;
    private result;
}
