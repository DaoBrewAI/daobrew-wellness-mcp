import { TASKMAP_SOURCE_ENVELOPE_VERSION, type TaskMapSourceKind } from "./types.js";
/**
 * P10.1A is deliberately a pure planning contract. It contains no clock,
 * connector, filesystem, projection, task-runner, or source-writeback logic.
 */
export declare const TASKMAP_REFRESH_PLAN_DRAFT_VERSION: "taskmap-refresh-plan-draft.v1";
export declare const TASKMAP_REFRESH_PLAN_VERSION: "taskmap-refresh-plan.v1";
export declare const TASKMAP_REFRESH_LANE_VERSION: "taskmap-refresh-lane.v1";
export declare const TASKMAP_REFRESH_BATCH_VERSION: "taskmap-refresh-ready-batch.v1";
export declare const TASKMAP_REFRESH_BARRIER_POLICY_VERSION: "taskmap-refresh-all-settled-barrier.1";
export declare const TASKMAP_REFRESH_REQUIREDNESS_POLICY_VERSION: "taskmap-refresh-requiredness.1";
export declare const TASKMAP_REFRESH_SCHEDULING_POLICY_VERSION: "taskmap-refresh-scheduling.1";
export declare const TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION: "taskmap-owner-review-attestation.v2";
export declare const TASKMAP_REFRESH_PLAN_LIMITS_V1: Readonly<{
    readonly maxLanes: 1024;
    readonly maxConcurrency: 64;
    readonly maxPriorityReasonCodesPerLane: 64;
    readonly maxOutputKindsPerLane: 64;
    readonly maxResourceClaimsPerLane: 4096;
    readonly maxTotalResourceClaims: 4096;
    readonly maxInputDigestsPerLane: 256;
    readonly maxPredecessorsPerLane: 256;
    readonly maxTotalInputDigests: 4096;
    readonly maxTotalPredecessorEdges: 4096;
    readonly maxRawStringBytes: 4096;
    readonly maxRawNestingDepth: 64;
    readonly maxRawObjectKeys: 64;
    readonly maxRawNodes: 131072;
    readonly maxCanonicalPlanBytes: number;
}>;
declare const PRIVACY: {
    readonly sourceBodiesStored: false;
    readonly emailBodiesStored: false;
    readonly participantDetailsStored: false;
    readonly rawBiometricsStored: false;
    readonly fullAgentSessionBodiesStored: false;
    readonly localPathsStored: false;
    readonly secretsStored: false;
    readonly taskExecutionFieldsStored: false;
};
export type TaskMapRefreshPriority = "P0" | "P1" | "P2";
export type TaskMapRefreshGoal = "provider_collect" | "source_normalize" | "identity_dedupe_barrier" | "deterministic_gate" | "taskmap_projection" | "strategy_projection" | "publication" | "refresh_audit";
export type TaskMapRefreshPriorityReasonCode = "source_freshness" | "identity_integrity" | "privacy_safety" | "deterministic_replay" | "publication_safety" | "connector_visibility" | "optional_projection" | "optional_enrichment" | "optional_audit" | "optional_automation";
export type TaskMapRefreshEffect = "read_only" | "local_state" | "external_mutation";
export type TaskMapResourceClaimMode = "shared" | "exclusive";
export type TaskMapRefreshOutputKind = "connector_checkpoint" | "source_slice" | "normalized_source" | "identity_set" | "gate_decision" | "taskmap_projection" | "strategy_projection" | "accepted_state" | "refresh_audit";
export type TaskMapRefreshPolicyName = "source-policy" | "normalization-policy" | "identity-policy" | "publication-policy" | "scheduling-policy";
export type TaskMapRefreshLaneStatus = "absent" | "pending" | "running" | "succeeded" | "partial" | "failed" | "skipped";
export type TaskMapRefreshErrorCode = "provider_unavailable" | "provider_partial_result" | "upstream_unusable" | "deterministic_gate_failed" | "projection_failed" | "publication_failed" | "optional_lane_failed" | "refresh_operation_failed";
export interface TaskMapResourceClaimV1 {
    resourceId: string;
    mode: TaskMapResourceClaimMode;
}
export interface TaskMapRefreshSourceBindingV1 {
    bindingDigest: string;
    sourceKind: TaskMapSourceKind;
    sourceContractVersion: typeof TASKMAP_SOURCE_ENVELOPE_VERSION;
    adapterVersion: string;
}
export interface TaskMapRefreshSourceRevisionV1 {
    bindingDigest: string;
    sourceIdentityDigest: string;
    sourceRevisionDigest: string;
    contentDigest: string;
}
export interface TaskMapRefreshSourceRevisionSetV1 {
    bindingDigest: string;
    revisionSetDigest: string;
}
export interface TaskMapRefreshReviewedDigestsV1 {
    truthSetDigest: string;
    reviewBatchDigest: string;
    reviewAttestationVersion: typeof TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION;
    reviewAttestationDigest: string;
    sourceManifestDigest: string;
}
export interface TaskMapRefreshPriorProviderArtifactV1 {
    bindingDigest: string;
    checkpointDigest: string;
    sourceSliceDigest: string;
}
export interface TaskMapRefreshPolicyBindingV1 {
    name: TaskMapRefreshPolicyName;
    version: string;
    digest: string;
}
export interface TaskMapRefreshBaselineV1 {
    kind: "genesis" | "accepted";
    priorCheckpointDigests: string[];
    priorSourceSliceDigests: string[];
    priorProviderArtifacts: TaskMapRefreshPriorProviderArtifactV1[];
    priorAcceptedStateDigest?: string;
    priorOwnerScopeDigest?: string;
    priorSourceSnapshotDigest?: string;
    priorReviewedEvidenceDigest?: string;
    priorPolicyBundleDigest?: string;
    priorSemanticImplementationDigest?: string;
    acceptedSourceRevisions: TaskMapRefreshSourceRevisionV1[];
    acceptedSourceRevisionSets: TaskMapRefreshSourceRevisionSetV1[];
    acceptedSemanticInputDigests: string[];
    acceptedDeterministicReplayDigest?: string;
}
export interface TaskMapRefreshLaneV1 {
    contractVersion: typeof TASKMAP_REFRESH_LANE_VERSION;
    laneDigest: string;
    laneId: string;
    goal: TaskMapRefreshGoal;
    operationVersion: string;
    priority: TaskMapRefreshPriority;
    priorityReasonCodes: TaskMapRefreshPriorityReasonCode[];
    predecessorLaneIds: string[];
    resourceClaims: TaskMapResourceClaimV1[];
    effect: TaskMapRefreshEffect;
    approvalGateId?: string;
    requiredForPublication: boolean;
    inputDigests: string[];
    outputKinds: TaskMapRefreshOutputKind[];
}
export type TaskMapRefreshLaneDraftV1 = Omit<TaskMapRefreshLaneV1, "laneDigest">;
export interface TaskMapRefreshPlanDraftV1 {
    contractVersion: typeof TASKMAP_REFRESH_PLAN_DRAFT_VERSION;
    ownerScopeDigest: string;
    baseline: TaskMapRefreshBaselineV1;
    reviewedDigests: TaskMapRefreshReviewedDigestsV1;
    sourceBindings: TaskMapRefreshSourceBindingV1[];
    sourceRevisions: TaskMapRefreshSourceRevisionV1[];
    sourceRevisionSets: TaskMapRefreshSourceRevisionSetV1[];
    semanticInputDigests: string[];
    deterministicReplayDigest: string;
    policyBindings: TaskMapRefreshPolicyBindingV1[];
    lanes: TaskMapRefreshLaneDraftV1[];
}
export type TaskMapRefreshReasonCode = "genesis" | "source_revision_changed" | "semantic_input_changed" | "deterministic_replay_changed" | "reviewed_evidence_changed" | "policy_bundle_changed" | "semantic_implementation_changed" | "exact_source_input_replay_match";
export interface TaskMapRefreshPlanV1 {
    contractVersion: typeof TASKMAP_REFRESH_PLAN_VERSION;
    planId: string;
    ownerScopeDigest: string;
    baseline: TaskMapRefreshBaselineV1;
    reviewedDigests: TaskMapRefreshReviewedDigestsV1;
    reviewedEvidenceDigest: string;
    sourceBindings: TaskMapRefreshSourceBindingV1[];
    sourceRevisions: TaskMapRefreshSourceRevisionV1[];
    sourceRevisionSets: TaskMapRefreshSourceRevisionSetV1[];
    sourceRevisionDigests: string[];
    semanticInputDigests: string[];
    deterministicReplayDigest: string;
    policyBindings: TaskMapRefreshPolicyBindingV1[];
    policyBundleDigest: string;
    semanticImplementationDigest: string;
    barrierPolicyVersion: typeof TASKMAP_REFRESH_BARRIER_POLICY_VERSION;
    requirednessPolicyVersion: typeof TASKMAP_REFRESH_REQUIREDNESS_POLICY_VERSION;
    schedulingPolicyVersion: typeof TASKMAP_REFRESH_SCHEDULING_POLICY_VERSION;
    lanes: TaskMapRefreshLaneV1[];
    candidateAcceptedStateDigest: string;
    isExactNoOp: boolean;
    refreshReasonCodes: TaskMapRefreshReasonCode[];
    privacy: typeof PRIVACY;
}
export interface TaskMapRefreshLaneStateV1 {
    laneId: string;
    status: TaskMapRefreshLaneStatus;
    lastGoodCheckpointDigest?: string;
    lastGoodSourceSliceDigest?: string;
    errorCode?: TaskMapRefreshErrorCode;
    errorDetailDigest?: string;
}
export interface TaskMapRefreshSelectionDraftV1 {
    maxConcurrency: number;
    laneStates: TaskMapRefreshLaneStateV1[];
}
export interface TaskMapActiveResourceClaimV1 extends TaskMapResourceClaimV1 {
    laneId: string;
}
export type TaskMapPublicationState = "waiting" | "blocked" | "ready" | "running" | "complete" | "no_op";
export type TaskMapPublicationReasonCode = "required_lane_absent" | "required_lane_pending" | "required_lane_running" | "required_lane_partial" | "required_lane_failed" | "required_lane_skipped" | "approval_authority_unavailable" | "publication_ready" | "publication_running" | "publication_complete" | "exact_replay_no_op";
export interface TaskMapRefreshPublicationV1 {
    state: TaskMapPublicationState;
    eligible: boolean;
    reasonCodes: TaskMapPublicationReasonCode[];
    priorAcceptedStateDigest?: string;
    candidateAcceptedStateDigest: string;
    preservesPriorAcceptedState: true;
}
export interface TaskMapReadyBatchV1 {
    contractVersion: typeof TASKMAP_REFRESH_BATCH_VERSION;
    batchId: string;
    planId: string;
    candidateAcceptedStateDigest: string;
    maxConcurrency: number;
    laneStates: TaskMapRefreshLaneStateV1[];
    activeClaims: TaskMapActiveResourceClaimV1[];
    selectedLaneIds: string[];
    publication: TaskMapRefreshPublicationV1;
}
export declare function buildTaskMapRefreshPlan(draft: TaskMapRefreshPlanDraftV1): TaskMapRefreshPlanV1;
export declare function assertTaskMapRefreshPlan(value: TaskMapRefreshPlanV1): TaskMapRefreshPlanV1;
export declare function selectTaskMapReadyBatch(untrustedPlan: TaskMapRefreshPlanV1, selection: TaskMapRefreshSelectionDraftV1): TaskMapReadyBatchV1;
export declare function assertTaskMapReadyBatch(untrustedPlan: TaskMapRefreshPlanV1, value: TaskMapReadyBatchV1): TaskMapReadyBatchV1;
export {};
