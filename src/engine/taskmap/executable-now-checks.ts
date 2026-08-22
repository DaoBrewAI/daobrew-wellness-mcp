import type {
  TaskMapReadyFrontierBlockerCode,
  TaskMapReadyFrontierBlockerV1,
} from "./ready-frontier.js";

export type TaskMapExecutableNowCheckIdV1 =
  | "projection_accepted"
  | "atomic_task"
  | "root_membership"
  | "review_accepted"
  | "open_not_terminal"
  | "lifecycle_current"
  | "source_contract"
  | "input_contract"
  | "done_definition"
  | "dependencies_resolved"
  | "permission_boundary"
  | "return_route";

export type TaskMapExecutableNowReasonCodeV1 =
  | "projection_not_accepted"
  | "not_atomic_task"
  | "invalid_root_membership"
  | "not_accepted"
  | "task_not_open_or_terminal"
  | "not_current"
  | "source_contract_incomplete"
  | "input_contract_incomplete"
  | "done_contract_incomplete"
  | "dependency_unresolved"
  | "permission_or_approval_contract_invalid"
  | "return_route_incomplete";

export type TaskMapEligibilityBlockerCodeV1 = Exclude<
  TaskMapReadyFrontierBlockerCode,
  | "proof_target_missing"
  | "proof_target_binding_invalid"
  | "predecessor_contract_mismatch"
  | "privacy_boundary_invalid"
>;

export type TaskMapEvidenceIntegrityBlockerCodeV1 = Extract<
  TaskMapReadyFrontierBlockerCode,
  | "proof_target_missing"
  | "proof_target_binding_invalid"
  | "predecessor_contract_mismatch"
  | "privacy_boundary_invalid"
>;

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

function frozenCheck(
  checkId: TaskMapExecutableNowCheckIdV1,
  reasonCode: TaskMapExecutableNowReasonCodeV1,
  blockerCodes: readonly TaskMapEligibilityBlockerCodeV1[],
): TaskMapExecutableNowCheckDefinitionV1 {
  return Object.freeze({
    checkId,
    reasonCode,
    blockerCodes: Object.freeze([...blockerCodes]),
  });
}

export const TASKMAP_EXECUTABLE_NOW_CHECKS_V1 = Object.freeze([
  frozenCheck(
    "projection_accepted",
    "projection_not_accepted",
    ["projection_not_accepted"],
  ),
  frozenCheck("atomic_task", "not_atomic_task", ["not_atomic_task"]),
  frozenCheck(
    "root_membership",
    "invalid_root_membership",
    ["invalid_root_membership"],
  ),
  frozenCheck("review_accepted", "not_accepted", ["not_accepted"]),
  frozenCheck(
    "open_not_terminal",
    "task_not_open_or_terminal",
    ["not_open", "terminal_task"],
  ),
  frozenCheck("lifecycle_current", "not_current", ["not_current"]),
  frozenCheck(
    "source_contract",
    "source_contract_incomplete",
    ["source_contract_incomplete"],
  ),
  frozenCheck(
    "input_contract",
    "input_contract_incomplete",
    ["input_contract_incomplete"],
  ),
  frozenCheck(
    "done_definition",
    "done_contract_incomplete",
    ["done_contract_incomplete"],
  ),
  frozenCheck(
    "dependencies_resolved",
    "dependency_unresolved",
    ["dependency_unresolved"],
  ),
  frozenCheck(
    "permission_boundary",
    "permission_or_approval_contract_invalid",
    ["permission_contract_invalid", "approval_package_contract_invalid"],
  ),
  frozenCheck(
    "return_route",
    "return_route_incomplete",
    ["return_route_incomplete"],
  ),
] satisfies readonly TaskMapExecutableNowCheckDefinitionV1[]);

export const ELIGIBILITY_BLOCKER_CODES = Object.freeze([
  "projection_not_accepted",
  "not_atomic_task",
  "invalid_root_membership",
  "not_accepted",
  "not_open",
  "terminal_task",
  "not_current",
  "source_contract_incomplete",
  "input_contract_incomplete",
  "done_contract_incomplete",
  "dependency_unresolved",
  "permission_contract_invalid",
  "approval_package_contract_invalid",
  "return_route_incomplete",
] satisfies readonly TaskMapEligibilityBlockerCodeV1[]);

export const EVIDENCE_INTEGRITY_BLOCKER_CODES = Object.freeze([
  "proof_target_missing",
  "proof_target_binding_invalid",
  "predecessor_contract_mismatch",
  "privacy_boundary_invalid",
] satisfies readonly TaskMapEvidenceIntegrityBlockerCodeV1[]);

export function taskMapExecutableNowChecks(
  blockers: readonly TaskMapReadyFrontierBlockerV1[],
): TaskMapExecutableNowCheckV1[] {
  return TASKMAP_EXECUTABLE_NOW_CHECKS_V1.map((definition) => {
    const matchingBlockers = blockers.filter((blocker) => (
      definition.blockerCodes.some((code) => code === blocker.code)
    ));

    return {
      checkId: definition.checkId,
      reasonCode: definition.reasonCode,
      passed: matchingBlockers.length === 0,
      blockers: matchingBlockers,
    };
  });
}
