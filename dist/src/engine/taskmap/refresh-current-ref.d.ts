import type { TaskMapSourceKind } from "./types.js";
export declare const TASKMAP_REFRESH_CURRENT_REF_VERSION: "taskmap-refresh-current-ref.v1";
export declare const TASKMAP_REFRESH_CURRENT_LIMITS_V1: Readonly<{
    maxGenerations: 4096;
    maxRefBytes: number;
    maxHistoryBytes: number;
    maxVerifiedBundleBytesPerOperation: number;
    maxBundleCacheEntries: 4096;
    maxConnectorHeads: 4096;
    maxUnknownNames: 256;
    maxObjectEntries: 4352;
    maxDirectoryEntries: 4352;
    generationWidth: 20;
}>;
export declare const TASKMAP_REFRESH_CURRENT_PENDING_RECOVERY_VERSION: "taskmap-refresh-current-pending-recovery.v1";
declare const PRIVACY: Readonly<{
    sourceBodiesStored: false;
    rawOwnerIdentifiersStored: false;
    connectorSecretsStored: false;
    localPathsStored: false;
}>;
export type TaskMapRefreshCurrentPublicationState = "complete" | "no_op" | "blocked";
export type TaskMapRefreshCurrentOperation = TaskMapRefreshCurrentPublicationState | "rollback";
export interface TaskMapRefreshCurrentAttemptV1 {
    generation: string;
    bundleId: string;
    planId: string;
    batchId: string;
    publicationState: TaskMapRefreshCurrentPublicationState;
    candidateAcceptedStateDigest: string;
}
export interface TaskMapRefreshCurrentAcceptedV1 {
    acceptedStateDigest: string;
    bundleId: string;
    planId: string;
    batchId: string;
    originGeneration: string;
}
export interface TaskMapRefreshCurrentConnectorArtifactV1 {
    bundleId: string;
    checkpointDigest: string;
    sourceSliceDigest: string;
}
export interface TaskMapRefreshCurrentConnectorHeadV1 {
    connectorKeyDigest: string;
    bindingDigest: string;
    sourceKind: TaskMapSourceKind;
    adapterVersion: string;
    latestCheckpoint: TaskMapRefreshCurrentConnectorArtifactV1;
    lastGood?: TaskMapRefreshCurrentConnectorArtifactV1;
}
export interface TaskMapRefreshCurrentRollbackV1 {
    targetGeneration: string;
    targetRefId: string;
    targetAcceptedStateDigest: string;
}
export interface TaskMapRefreshCurrentRefV1 {
    contractVersion: typeof TASKMAP_REFRESH_CURRENT_REF_VERSION;
    refId: string;
    generation: string;
    predecessorRefId?: string;
    ownerScopeDigest: string;
    operation: TaskMapRefreshCurrentOperation;
    attempt?: TaskMapRefreshCurrentAttemptV1;
    accepted?: TaskMapRefreshCurrentAcceptedV1;
    connectorHeads: TaskMapRefreshCurrentConnectorHeadV1[];
    rollback?: TaskMapRefreshCurrentRollbackV1;
    privacy: typeof PRIVACY;
}
export interface TaskMapRefreshCurrentFaultV1 {
    generation: string;
    code: "generation_hole" | "generation_corrupt" | "generation_limit" | "store_unavailable";
    detail: string;
}
export interface TaskMapRefreshCurrentSnapshotV1 {
    status: "empty" | "healthy" | "degraded";
    head?: TaskMapRefreshCurrentRefV1;
    generations: TaskMapRefreshCurrentRefV1[];
    fault?: TaskMapRefreshCurrentFaultV1;
    unknownGenerationNames: string[];
    unknownObjectNames: string[];
}
export interface TaskMapRefreshCurrentRecoveryReceiptV1 {
    contractVersion: typeof TASKMAP_REFRESH_CURRENT_REF_VERSION;
    operationToken: string;
    objectName: string;
    expectedGeneration: string;
    expectedPredecessorRefId?: string;
    refId: string;
    ref: TaskMapRefreshCurrentRefV1;
    rootDev: string;
    rootIno: string;
    dev: string;
    ino: string;
    byteLength: number;
    byteSha256: string;
}
export type TaskMapRefreshCurrentFaultPoint = "after_reservation_link" | "after_reservation_directory_sync" | "after_object_create_before_identity" | "after_object_identity_link" | "after_stage_create" | "after_object_partial_write" | "after_stage_sync" | "after_object_link" | "after_object_directory_sync" | "before_generation_link" | "after_generation_link" | "after_generation_directory_sync" | "after_current_validation";
export interface TaskMapRefreshCurrentWriteOptions {
    operationToken?: string;
    faultInjection?: (point: TaskMapRefreshCurrentFaultPoint) => void | Promise<void>;
}
export interface PublishTaskMapRefreshCurrentInput {
    currentRoot: string;
    runRoot: string;
    bundleId: string;
    expectedGeneration: string;
    expectedRefId?: string;
    options?: TaskMapRefreshCurrentWriteOptions;
}
export interface RollbackTaskMapRefreshCurrentInput {
    currentRoot: string;
    runRoot: string;
    targetGeneration: string;
    expectedGeneration: string;
    expectedRefId: string;
    options?: TaskMapRefreshCurrentWriteOptions;
}
export interface TaskMapRefreshCurrentWriteResult {
    status: "published" | "already_current";
    ref: TaskMapRefreshCurrentRefV1;
    processCrashAtomic: true;
    powerLossDurabilityClaimed: false;
}
export type TaskMapRefreshCurrentPendingOriginV1 = {
    kind: "bundle";
    bundleId: string;
} | {
    kind: "rollback";
    targetGeneration: string;
    targetRefId: string;
};
export interface TaskMapRefreshCurrentPendingRecoveryV1 {
    contractVersion: typeof TASKMAP_REFRESH_CURRENT_PENDING_RECOVERY_VERSION;
    generation: string;
    expectedPredecessorRefId?: string;
    refId: string;
    origin: TaskMapRefreshCurrentPendingOriginV1;
    state: "claim_only" | "object_pending" | "generation_pending";
}
export type TaskMapRefreshCurrentErrorCode = "invalid_contract" | "invalid_root" | "unsafe_target" | "degraded" | "cas_conflict" | "checkpoint_replay_failed" | "write_failed" | "recovery_required" | "recovery_refused" | "resource_limit";
export declare class TaskMapRefreshCurrentError extends Error {
    readonly code: TaskMapRefreshCurrentErrorCode;
    readonly committed: boolean;
    readonly recoveryReceipt?: TaskMapRefreshCurrentRecoveryReceiptV1;
    readonly pendingRecovery?: TaskMapRefreshCurrentPendingRecoveryV1;
    constructor(code: TaskMapRefreshCurrentErrorCode, message: string, options?: {
        committed?: boolean;
        recoveryReceipt?: TaskMapRefreshCurrentRecoveryReceiptV1;
        pendingRecovery?: TaskMapRefreshCurrentPendingRecoveryV1;
    });
}
export declare function initializeTaskMapRefreshCurrentStore(currentRoot: string): Promise<void>;
export declare function assertTaskMapRefreshCurrentRef(value: TaskMapRefreshCurrentRefV1): TaskMapRefreshCurrentRefV1;
export declare function readTaskMapRefreshCurrent(currentRoot: string, runRoot: string): Promise<TaskMapRefreshCurrentSnapshotV1>;
export declare function publishTaskMapRefreshRunCurrent(input: PublishTaskMapRefreshCurrentInput): Promise<TaskMapRefreshCurrentWriteResult>;
export declare function rollbackTaskMapRefreshCurrent(input: RollbackTaskMapRefreshCurrentInput): Promise<TaskMapRefreshCurrentWriteResult>;
export declare function recoverTaskMapRefreshCurrentResidue(currentRoot: string, runRoot: string, receipt: TaskMapRefreshCurrentRecoveryReceiptV1): Promise<"recovered" | "already_complete">;
export {};
