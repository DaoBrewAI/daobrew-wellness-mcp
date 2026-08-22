import { type TaskMapReadyBatchV1, type TaskMapRefreshPlanV1, type TaskMapRefreshSourceRevisionV1 } from "./refresh-plan.js";
import { type TaskMapConnectorCheckpointV1, type TaskMapSourceSnapshotV1 } from "./types.js";
export declare const TASKMAP_REFRESH_RUN_BUNDLE_VERSION: "taskmap-refresh-run-bundle.v1";
export declare const TASKMAP_REFRESH_RUN_CHECKPOINTS_VERSION: "taskmap-refresh-run-checkpoints.v1";
export declare const TASKMAP_REFRESH_RUN_SOURCE_SNAPSHOT_PROOF_VERSION: "taskmap-refresh-run-source-snapshot-proof.v1";
export declare const TASKMAP_REFRESH_RUN_SOURCE_SLICE_PROOF_VERSION: "taskmap-refresh-run-source-slice-proof.v1";
export declare const TASKMAP_REFRESH_RUN_COMMIT_VERSION: "taskmap-refresh-run-commit.v1";
export declare const TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1: Readonly<{
    maxMemberBytes: number;
    maxTotalBytes: number;
    maxCheckpoints: 4096;
    maxFiles: 6;
    maxJsonDepth: 32;
    maxJsonNodes: 262144;
    maxObjectKeys: 4096;
    maxReservationWaitMs: 30000;
}>;
declare const CONTENT_MEMBER_ORDER: readonly ["plan.json", "batch.json", "checkpoints.json", "source-snapshot.json"];
declare const BUNDLE_PRIVACY: Readonly<{
    sourceBodiesStored: false;
    rawSourceObjectIdentifiersStored: false;
    discoveryIdentifiersStored: false;
    connectorSecretsStored: false;
    localPathsStored: false;
}>;
export type TaskMapRefreshRunContentMemberName = typeof CONTENT_MEMBER_ORDER[number];
export type TaskMapRefreshRunMaterializationStatus = "created" | "already_present";
export type TaskMapRefreshRunFaultPoint = "after_reservation" | "after_plan" | "after_batch" | "after_checkpoints" | "after_source_snapshot" | "after_manifest" | "after_precommit_directory_sync" | "after_committed" | "after_final_directory_sync" | "after_publish_rename";
export interface TaskMapRefreshRunCheckpointRecordV1 {
    checkpointDigest: string;
    bindingDigest: string;
    checkpoint: TaskMapConnectorCheckpointV1;
}
export interface TaskMapRefreshRunSourceSliceProofDraftV1 {
    sliceRole?: "serving" | "observed_non_serving";
    ownerScopeDigest: string;
    bindingDigest: string;
    sourceRevisions: TaskMapRefreshSourceRevisionV1[];
    acceptedSourceIdentityDigests: string[];
}
export interface TaskMapRefreshRunSourceSliceProofV1 extends Omit<TaskMapRefreshRunSourceSliceProofDraftV1, "sliceRole"> {
    contractVersion: typeof TASKMAP_REFRESH_RUN_SOURCE_SLICE_PROOF_VERSION;
    sourceRevisionSetDigest: string;
    sourceSliceDigest: string;
    sliceRole: "serving" | "observed_non_serving";
}
export interface TaskMapRefreshRunLaneReferenceV1 {
    laneId: string;
    referenceKind: "attempt_output" | "retained_last_good";
    checkpointDigest: string;
    sourceSliceDigest: string;
}
export interface TaskMapRefreshRunAttemptOutputV1 {
    laneId: string;
    checkpointDigest: string;
    sourceSliceDigest: string;
}
export interface TaskMapRefreshRunCheckpointsV1 {
    contractVersion: typeof TASKMAP_REFRESH_RUN_CHECKPOINTS_VERSION;
    checkpointSetId: string;
    ownerScopeDigest: string;
    planId: string;
    batchId: string;
    checkpoints: TaskMapRefreshRunCheckpointRecordV1[];
    checkpointDigests: string[];
    sourceSlices: TaskMapRefreshRunSourceSliceProofV1[];
    laneReferences: TaskMapRefreshRunLaneReferenceV1[];
    privacy: typeof BUNDLE_PRIVACY;
}
export interface TaskMapRefreshRunSourceSnapshotProofV1 {
    contractVersion: typeof TASKMAP_REFRESH_RUN_SOURCE_SNAPSHOT_PROOF_VERSION;
    sourceSnapshotProofId: string;
    sourceContractVersion: TaskMapSourceSnapshotV1["contractVersion"];
    ownerScopeDigest: string;
    planId: string;
    snapshotId: string;
    /**
     * Producer-attested P9.2 audit provenance. This digest is copied from the
     * validated source snapshot, but the digest-only proof intentionally omits
     * the snapshot body needed to recompute it. It is never promotion authority.
     */
    sourceSnapshotDigest: string;
    semanticInputDigest: string;
    /**
     * Producer-attested audit provenance only. P10.1C must not use this field as
     * independently verified body evidence or as a promotion condition.
     */
    bodyContextDigest: string;
    /**
     * Producer-attested audit provenance only. The privacy-safe bundle does not
     * persist discovery pointers, so this digest is not independently
     * recomputable here and must never authorize promotion.
     */
    discoveryProvenanceDigest: string;
    sourceBindingProofDigest: string;
    sourceRevisionProofDigest: string;
    sourceRevisionSetProofDigest: string;
    sourceBindingCount: number;
    sourceRevisionCount: number;
    privacy: typeof BUNDLE_PRIVACY;
}
export interface TaskMapRefreshRunMemberDescriptorV1 {
    fileName: TaskMapRefreshRunContentMemberName;
    kind: "plan" | "batch" | "checkpoints" | "source_snapshot_proof";
    contractVersion: string;
    artifactId: string;
    canonicalArtifactDigest: string;
    byteSha256: string;
    byteLength: number;
}
export interface TaskMapRefreshRunManifestV1 {
    contractVersion: typeof TASKMAP_REFRESH_RUN_BUNDLE_VERSION;
    bundleId: string;
    bundleContentDigest: string;
    ownerScopeDigest: string;
    planId: string;
    batchId: string;
    candidateAcceptedStateDigest: string;
    members: TaskMapRefreshRunMemberDescriptorV1[];
    privacy: typeof BUNDLE_PRIVACY;
}
export interface TaskMapRefreshRunCommitV1 {
    contractVersion: typeof TASKMAP_REFRESH_RUN_COMMIT_VERSION;
    bundleId: string;
    manifestByteSha256: string;
}
export interface PreparedTaskMapRefreshRunBundle {
    bundleId: string;
    manifest: TaskMapRefreshRunManifestV1;
    commitMarker: TaskMapRefreshRunCommitV1;
    members: Readonly<Partial<Record<TaskMapRefreshRunContentMemberName, string>>>;
}
export interface PrepareTaskMapRefreshRunBundleInput {
    plan: TaskMapRefreshPlanV1;
    batch: TaskMapReadyBatchV1;
    connectorCheckpoints: TaskMapConnectorCheckpointV1[];
    attemptOutputs: TaskMapRefreshRunAttemptOutputV1[];
    sourceSliceProofs: TaskMapRefreshRunSourceSliceProofV1[];
    sourceSnapshot?: TaskMapSourceSnapshotV1;
}
export interface TaskMapRefreshRunMaterializeOptions {
    reservationWaitMs?: number;
    pollIntervalMs?: number;
    faultInjection?: (point: TaskMapRefreshRunFaultPoint) => void | Promise<void>;
}
export interface TaskMapRefreshRunMaterializationResult {
    status: TaskMapRefreshRunMaterializationStatus;
    bundleId: string;
    /**
     * True when a cooperating-writer staging/reservation/final residual is
     * intentionally preserved for later P10.1C recovery.
     */
    sameUidResidual: boolean;
}
/**
 * Proof of bounded canonical bytes, immutable member identity, and cross-file
 * closure only. It is not a publication or promotion receipt. P10.1C must
 * resolve accepted predecessors and validate checkpoint transitions before
 * changing any current reference. In particular, the optional snapshot
 * sourceSnapshotDigest/bodyContextDigest/discoveryProvenanceDigest values are
 * producer-attested audit provenance, not independently recomputable proof,
 * and P10.1C must not use them for lifecycle validity or promotion.
 */
export interface VerifiedTaskMapRefreshRunBundle {
    bundleId: string;
    manifest: TaskMapRefreshRunManifestV1;
    commitMarker: TaskMapRefreshRunCommitV1;
    plan: TaskMapRefreshPlanV1;
    batch: TaskMapReadyBatchV1;
    checkpoints: TaskMapRefreshRunCheckpointsV1;
    sourceSnapshotProof?: TaskMapRefreshRunSourceSnapshotProofV1;
}
export type TaskMapRefreshRunBundleErrorCode = "invalid_contract" | "invalid_root" | "unsafe_target" | "reservation_incomplete" | "bundle_corrupt" | "write_failed";
export declare class TaskMapRefreshRunBundleError extends Error {
    readonly code: TaskMapRefreshRunBundleErrorCode;
    readonly sameUidResidual: boolean;
    constructor(code: TaskMapRefreshRunBundleErrorCode, message: string, sameUidResidual?: boolean);
}
export declare function assertTaskMapRefreshRunBundleByteLimits(byteLengths: readonly number[]): void;
export declare function buildTaskMapRefreshRunSourceSliceProof(untrustedDraft: TaskMapRefreshRunSourceSliceProofDraftV1): TaskMapRefreshRunSourceSliceProofV1;
export declare function assertTaskMapRefreshRunSourceSliceProof(untrustedProof: TaskMapRefreshRunSourceSliceProofV1): TaskMapRefreshRunSourceSliceProofV1;
export declare function prepareTaskMapRefreshRunBundle(input: PrepareTaskMapRefreshRunBundleInput): PreparedTaskMapRefreshRunBundle;
export declare function verifyTaskMapRefreshRunBundle(bundleDirectory: string, expectedBundleId?: string): Promise<VerifiedTaskMapRefreshRunBundle>;
export declare function materializeTaskMapRefreshRunBundle(runRootInput: string, untrustedPrepared: PreparedTaskMapRefreshRunBundle, options?: TaskMapRefreshRunMaterializeOptions): Promise<TaskMapRefreshRunMaterializationResult>;
export {};
