import { type TaskMapExecutableNowCheckV1 } from "./executable-now-checks.js";
import type { TaskMapNativeCurrentnessForWorkV1, TaskMapNativeCurrentWorkV1 } from "./native-current-work-successor.js";
import type { CausalGrade, TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_READY_FRONTIER_VERSION: "taskmap-ready-frontier.v1";
export declare const TASKMAP_READY_FRONTIER_POLICY_VERSION: "taskmap-ready-frontier-policy.1";
export declare const TASKMAP_READY_PROOF_TARGETS_VERSION: "taskmap-ready-proof-targets.v1";
export declare const TASKMAP_READY_FRONTIER_LIMITS_V1: Readonly<{
    maxTasks: 4096;
    maxProofTargets: 32;
    maxProofTargetsArtifactBytes: number;
    maxContextPointers: 128;
    maxPredecessors: 256;
    maxDoneItems: 12;
    maxOutcomeCharacters: 320;
    maxInputSummaryCharacters: 320;
    maxDoneItemCharacters: 240;
    maxPointerIdCharacters: 512;
}>;
type ProofTarget = TaskMapNativeCurrentWorkV1["nextTaskToProve"];
export interface TaskMapReadyFrontierApprovalPackageBoundaryV1 {
    contractVersion: "taskmap-local-approval-inspection.v1";
    readyForLocalApproval: true;
    currentWorkApprovalGranted: false;
    currentWorkExecutable: false;
    authorizationScope: "prepare_local_package_only";
    dispatchAuthorized: false;
    sourceWritebackAuthorized: false;
    codexTaskStartAuthorized: false;
    sourceCompletionAuthorized: false;
    outcomeVerificationAuthorized: false;
}
export type TaskMapReadyFrontierProofTargetV1 = ProofTarget & {
    approvalPackage: TaskMapReadyFrontierApprovalPackageBoundaryV1;
};
export interface TaskMapReadyFrontierCurrentnessBindingV1 {
    contractVersion: "taskmap-native-currentness-gate.v1";
    runId: string;
    inputDigest: string;
    projectionDigest: string;
    taskDispositionsDigest: string;
}
export interface TaskMapReadyProofTargetsV1 {
    contractVersion: typeof TASKMAP_READY_PROOF_TARGETS_VERSION;
    projection: {
        contractVersion: string;
        runId: string;
        inputDigest: string;
        generatedAt: string;
        projectionDigest: string;
    };
    currentness: TaskMapReadyFrontierCurrentnessBindingV1;
    proofTargets: TaskMapReadyFrontierProofTargetV1[];
    artifactDigest: string;
}
export interface TaskMapReadyFrontierTerminalOverlayBindingV1 {
    contractVersion: "taskmap-local-completion-overlay.v1";
    artifactDigest: string;
    localOwnerScopeDigest: string;
    terminalTaskIds: string[];
}
export interface TaskMapReadyFrontierExactDeadlineV1 {
    taskId: string;
    deadlineAt: string | null;
}
export interface TaskMapReadyFrontierCausalGradeV1 {
    rootId: string;
    causalGrade: CausalGrade;
}
export interface TaskMapReadyFrontierInputV1 {
    projection: TaskMapProjectionV1;
    currentness: TaskMapNativeCurrentnessForWorkV1;
    evaluatedAt: string;
    terminalOverlay: TaskMapReadyFrontierTerminalOverlayBindingV1;
    exactDeadlineSourceDigest: string;
    exactDeadlineBindingDigest: string;
    exactDeadlines: TaskMapReadyFrontierExactDeadlineV1[];
    causalGradeSourceDigest: string;
    causalGradeBindingDigest: string;
    causalGrades: TaskMapReadyFrontierCausalGradeV1[];
    proofTargets: TaskMapReadyFrontierProofTargetV1[];
}
export interface ValidateTaskMapReadyFrontierInputV1 {
    projection: TaskMapProjectionV1;
    currentness: TaskMapNativeCurrentnessForWorkV1;
    terminalOverlay: TaskMapReadyFrontierTerminalOverlayBindingV1;
    proofTargets: TaskMapReadyFrontierProofTargetV1[];
}
export type TaskMapReadyFrontierBlockerCode = "projection_not_accepted" | "terminal_task" | "not_atomic_task" | "invalid_root_membership" | "not_accepted" | "not_open" | "not_current" | "source_contract_incomplete" | "proof_target_missing" | "proof_target_binding_invalid" | "input_contract_incomplete" | "done_contract_incomplete" | "permission_contract_invalid" | "return_route_incomplete" | "predecessor_contract_mismatch" | "dependency_unresolved" | "approval_package_contract_invalid" | "privacy_boundary_invalid";
export interface TaskMapReadyFrontierBlockerV1 {
    code: TaskMapReadyFrontierBlockerCode;
    relatedTaskId?: string;
}
export type TaskMapReadyFrontierDeadlineTier = 0 | 1 | 2 | 3 | 4;
export type TaskMapReadyFrontierDeadlineTierLabel = "overdue" | "within_24_hours" | "within_3_days" | "within_7_days" | "later" | "none";
export interface TaskMapReadyFrontierRankInputsV1 {
    deadlineTier: TaskMapReadyFrontierDeadlineTier;
    deadlineTierLabel: TaskMapReadyFrontierDeadlineTierLabel;
    newlyUnblockedCount: number;
    boundCausalGrade: CausalGrade | null;
    currentCausalTier: 0 | 2 | 3 | 4;
    deadlineAt: string | null;
    stableTaskId: string;
}
export interface TaskMapReadyFrontierEvaluationV1 {
    taskId: string;
    rootId: string;
    readiness: "ready" | "blocked";
    blockers: TaskMapReadyFrontierBlockerV1[];
    checks: TaskMapExecutableNowCheckV1[];
    rankInputs: TaskMapReadyFrontierRankInputsV1;
}
export interface TaskMapReadyFrontierLeafV1 {
    taskId: string;
    rootId: string;
    rank: number;
    readiness: "ready_for_owner_approval";
    approvalGranted: false;
    executable: false;
    rankInputs: TaskMapReadyFrontierRankInputsV1;
    proofTarget: TaskMapReadyFrontierProofTargetV1;
}
export interface TaskMapReadyFrontierV1 {
    contractVersion: typeof TASKMAP_READY_FRONTIER_VERSION;
    policyVersion: typeof TASKMAP_READY_FRONTIER_POLICY_VERSION;
    evaluatedAt: string;
    projection: {
        contractVersion: string;
        runId: string;
        inputDigest: string;
        generatedAt: string;
        projectionDigest: string;
    };
    currentness: TaskMapReadyFrontierCurrentnessBindingV1;
    terminalOverlay: TaskMapReadyFrontierTerminalOverlayBindingV1;
    exactDeadlineSourceDigest: string;
    exactDeadlineBindingDigest: string;
    causalGradeSourceDigest: string;
    causalGradeBindingDigest: string;
    evaluations: TaskMapReadyFrontierEvaluationV1[];
    readyLeaves: TaskMapReadyFrontierLeafV1[];
    authorityBoundary: {
        membershipCreated: false;
        readinessCreatedByCausalData: false;
        approvalGranted: false;
        executionStarted: false;
        completionGranted: false;
    };
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        rawBiometricsStored: false;
    };
    artifactDigest: string;
}
export declare function taskMapReadyFrontierCurrentnessBindingDigest(currentness: TaskMapNativeCurrentnessForWorkV1): string;
export declare function taskMapReadyFrontierDeadlineBindingDigest(input: {
    projection: TaskMapProjectionV1;
    currentness: TaskMapNativeCurrentnessForWorkV1;
    sourceDigest: string;
    rows: TaskMapReadyFrontierExactDeadlineV1[];
}): string;
export declare function taskMapReadyFrontierCausalGradeBindingDigest(input: {
    projection: TaskMapProjectionV1;
    currentness: TaskMapNativeCurrentnessForWorkV1;
    sourceDigest: string;
    rows: TaskMapReadyFrontierCausalGradeV1[];
}): string;
export declare function buildTaskMapReadyProofTargets(input: {
    projection: TaskMapProjectionV1;
    currentness: TaskMapNativeCurrentnessForWorkV1;
    proofTargets: TaskMapReadyFrontierProofTargetV1[];
}): TaskMapReadyProofTargetsV1;
export declare function validateTaskMapReadyProofTargets(value: unknown, projection: TaskMapProjectionV1, currentness: TaskMapNativeCurrentnessForWorkV1): TaskMapReadyProofTargetsV1;
/**
 * Fill projection-bound proof evidence without turning derivation into ranking
 * or execution authority. Authenticated rows retain their accepted semantics;
 * only structurally eligible missing rows are derived from bounded projection
 * text and exact source/dependency/return bindings.
 */
export declare function deriveTaskMapReadyProofTargets(input: {
    projection: TaskMapProjectionV1;
    currentness: TaskMapNativeCurrentnessForWorkV1;
    existingProofTargets: TaskMapReadyFrontierProofTargetV1[];
}): TaskMapReadyProofTargetsV1;
export declare function buildTaskMapReadyFrontier(input: TaskMapReadyFrontierInputV1): TaskMapReadyFrontierV1;
/**
 * Rebuild a persisted frontier from its projection-bound evidence inputs.
 *
 * The deadline rows are recoverable from the sealed per-task rank inputs;
 * causal grades come from the accepted projection, while proof targets and
 * the terminal overlay must be supplied by their independently revalidated
 * owner-scoped sources. Canonical equality with the rebuild prevents callers
 * from treating an unsealed readyTaskIds/status response as approval evidence.
 */
export declare function validateTaskMapReadyFrontier(value: unknown, input: ValidateTaskMapReadyFrontierInputV1): TaskMapReadyFrontierV1;
export {};
