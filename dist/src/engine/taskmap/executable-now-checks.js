"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVIDENCE_INTEGRITY_BLOCKER_CODES = exports.ELIGIBILITY_BLOCKER_CODES = exports.TASKMAP_EXECUTABLE_NOW_CHECKS_V1 = void 0;
exports.taskMapExecutableNowChecks = taskMapExecutableNowChecks;
function frozenCheck(checkId, reasonCode, blockerCodes) {
    return Object.freeze({
        checkId,
        reasonCode,
        blockerCodes: Object.freeze([...blockerCodes]),
    });
}
exports.TASKMAP_EXECUTABLE_NOW_CHECKS_V1 = Object.freeze([
    frozenCheck("projection_accepted", "projection_not_accepted", ["projection_not_accepted"]),
    frozenCheck("atomic_task", "not_atomic_task", ["not_atomic_task"]),
    frozenCheck("root_membership", "invalid_root_membership", ["invalid_root_membership"]),
    frozenCheck("review_accepted", "not_accepted", ["not_accepted"]),
    frozenCheck("open_not_terminal", "task_not_open_or_terminal", ["not_open", "terminal_task"]),
    frozenCheck("lifecycle_current", "not_current", ["not_current"]),
    frozenCheck("source_contract", "source_contract_incomplete", ["source_contract_incomplete"]),
    frozenCheck("input_contract", "input_contract_incomplete", ["input_contract_incomplete"]),
    frozenCheck("done_definition", "done_contract_incomplete", ["done_contract_incomplete"]),
    frozenCheck("dependencies_resolved", "dependency_unresolved", ["dependency_unresolved"]),
    frozenCheck("permission_boundary", "permission_or_approval_contract_invalid", ["permission_contract_invalid", "approval_package_contract_invalid"]),
    frozenCheck("return_route", "return_route_incomplete", ["return_route_incomplete"]),
]);
exports.ELIGIBILITY_BLOCKER_CODES = Object.freeze([
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
]);
exports.EVIDENCE_INTEGRITY_BLOCKER_CODES = Object.freeze([
    "proof_target_missing",
    "proof_target_binding_invalid",
    "predecessor_contract_mismatch",
    "privacy_boundary_invalid",
]);
function taskMapExecutableNowChecks(blockers) {
    return exports.TASKMAP_EXECUTABLE_NOW_CHECKS_V1.map((definition) => {
        const matchingBlockers = blockers.filter((blocker) => (definition.blockerCodes.some((code) => code === blocker.code)));
        return {
            checkId: definition.checkId,
            reasonCode: definition.reasonCode,
            passed: matchingBlockers.length === 0,
            blockers: matchingBlockers,
        };
    });
}
