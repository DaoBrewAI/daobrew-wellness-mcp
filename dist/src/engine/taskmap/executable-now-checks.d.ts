import type { TaskMapReadyFrontierBlockerCode, TaskMapReadyFrontierBlockerV1 } from "./ready-frontier.js";
export type TaskMapExecutableNowCheckIdV1 = "projection_accepted" | "atomic_task" | "root_membership" | "review_accepted" | "open_not_terminal" | "lifecycle_current" | "source_contract" | "input_contract" | "done_definition" | "dependencies_resolved" | "permission_boundary" | "return_route";
export type TaskMapExecutableNowReasonCodeV1 = "projection_not_accepted" | "not_atomic_task" | "invalid_root_membership" | "not_accepted" | "task_not_open_or_terminal" | "not_current" | "source_contract_incomplete" | "input_contract_incomplete" | "done_contract_incomplete" | "dependency_unresolved" | "permission_or_approval_contract_invalid" | "return_route_incomplete";
export type TaskMapEligibilityBlockerCodeV1 = Exclude<TaskMapReadyFrontierBlockerCode, "proof_target_missing" | "proof_target_binding_invalid" | "predecessor_contract_mismatch" | "privacy_boundary_invalid">;
export type TaskMapEvidenceIntegrityBlockerCodeV1 = Extract<TaskMapReadyFrontierBlockerCode, "proof_target_missing" | "proof_target_binding_invalid" | "predecessor_contract_mismatch" | "privacy_boundary_invalid">;
export interface TaskMapExecutableNowCheckDefinitionV1 {
    readonly checkId: TaskMapExecutableNowCheckIdV1;
    readonly reasonCode: TaskMapExecutableNowReasonCodeV1;
    readonly blockerCodes: readonly TaskMapEligibilityBlockerCodeV1[];
}
export interface TaskMapExecutableNowCheckV1 {
    checkId: TaskMapExecutableNowCheckIdV1;
    reasonCode: TaskMapExecutableNowReasonCodeV1;
    passed: boolean;
    blockers: TaskMapReadyFrontierBlockerV1[];
}
export declare const TASKMAP_EXECUTABLE_NOW_CHECKS_V1: readonly TaskMapExecutableNowCheckDefinitionV1[];
export declare const ELIGIBILITY_BLOCKER_CODES: readonly ("projection_not_accepted" | "not_atomic_task" | "invalid_root_membership" | "not_accepted" | "not_current" | "source_contract_incomplete" | "input_contract_incomplete" | "done_contract_incomplete" | "dependency_unresolved" | "return_route_incomplete" | "terminal_task" | "not_open" | "permission_contract_invalid" | "approval_package_contract_invalid")[];
export declare const EVIDENCE_INTEGRITY_BLOCKER_CODES: readonly ("proof_target_missing" | "proof_target_binding_invalid" | "predecessor_contract_mismatch" | "privacy_boundary_invalid")[];
export declare function taskMapExecutableNowChecks(blockers: readonly TaskMapReadyFrontierBlockerV1[]): TaskMapExecutableNowCheckV1[];
