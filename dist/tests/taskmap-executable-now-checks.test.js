"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const executable_now_checks_js_1 = require("../src/engine/taskmap/executable-now-checks.js");
const EXPECTED_CHECKS = [
    {
        checkId: "projection_accepted",
        reasonCode: "projection_not_accepted",
        blockerCodes: ["projection_not_accepted"],
    },
    {
        checkId: "atomic_task",
        reasonCode: "not_atomic_task",
        blockerCodes: ["not_atomic_task"],
    },
    {
        checkId: "root_membership",
        reasonCode: "invalid_root_membership",
        blockerCodes: ["invalid_root_membership"],
    },
    {
        checkId: "review_accepted",
        reasonCode: "not_accepted",
        blockerCodes: ["not_accepted"],
    },
    {
        checkId: "open_not_terminal",
        reasonCode: "task_not_open_or_terminal",
        blockerCodes: ["not_open", "terminal_task"],
    },
    {
        checkId: "lifecycle_current",
        reasonCode: "not_current",
        blockerCodes: ["not_current"],
    },
    {
        checkId: "source_contract",
        reasonCode: "source_contract_incomplete",
        blockerCodes: ["source_contract_incomplete"],
    },
    {
        checkId: "input_contract",
        reasonCode: "input_contract_incomplete",
        blockerCodes: ["input_contract_incomplete"],
    },
    {
        checkId: "done_definition",
        reasonCode: "done_contract_incomplete",
        blockerCodes: ["done_contract_incomplete"],
    },
    {
        checkId: "dependencies_resolved",
        reasonCode: "dependency_unresolved",
        blockerCodes: ["dependency_unresolved"],
    },
    {
        checkId: "permission_boundary",
        reasonCode: "permission_or_approval_contract_invalid",
        blockerCodes: [
            "permission_contract_invalid",
            "approval_package_contract_invalid",
        ],
    },
    {
        checkId: "return_route",
        reasonCode: "return_route_incomplete",
        blockerCodes: ["return_route_incomplete"],
    },
];
const ALL_READY_FRONTIER_BLOCKER_CODES = [
    "projection_not_accepted",
    "terminal_task",
    "not_atomic_task",
    "invalid_root_membership",
    "not_accepted",
    "not_open",
    "not_current",
    "source_contract_incomplete",
    "proof_target_missing",
    "proof_target_binding_invalid",
    "input_contract_incomplete",
    "done_contract_incomplete",
    "permission_contract_invalid",
    "return_route_incomplete",
    "predecessor_contract_mismatch",
    "dependency_unresolved",
    "approval_package_contract_invalid",
    "privacy_boundary_invalid",
];
(0, node_test_1.describe)("Task Map isExecutableNow registry", () => {
    (0, node_test_1.it)("defines exactly the twelve canonical checks in deterministic order", () => {
        strict_1.default.equal(executable_now_checks_js_1.TASKMAP_EXECUTABLE_NOW_CHECKS_V1.length, 12);
        strict_1.default.equal(new Set(executable_now_checks_js_1.TASKMAP_EXECUTABLE_NOW_CHECKS_V1.map((check) => check.checkId)).size, 12);
        strict_1.default.deepEqual(executable_now_checks_js_1.TASKMAP_EXECUTABLE_NOW_CHECKS_V1, EXPECTED_CHECKS);
    });
    (0, node_test_1.it)("maps every eligibility blocker code to exactly one check", () => {
        const mapped = executable_now_checks_js_1.TASKMAP_EXECUTABLE_NOW_CHECKS_V1.flatMap((check) => check.blockerCodes);
        strict_1.default.equal(new Set(mapped).size, mapped.length, "no code in two checks");
        strict_1.default.deepEqual(new Set(mapped), new Set(executable_now_checks_js_1.ELIGIBILITY_BLOCKER_CODES));
        strict_1.default.equal(mapped.length, 14);
    });
    (0, node_test_1.it)("keeps evidence-integrity blockers separate and accounts for all 18 codes", () => {
        strict_1.default.deepEqual(executable_now_checks_js_1.EVIDENCE_INTEGRITY_BLOCKER_CODES, [
            "proof_target_missing",
            "proof_target_binding_invalid",
            "predecessor_contract_mismatch",
            "privacy_boundary_invalid",
        ]);
        const eligibility = new Set(executable_now_checks_js_1.ELIGIBILITY_BLOCKER_CODES);
        const evidence = new Set(executable_now_checks_js_1.EVIDENCE_INTEGRITY_BLOCKER_CODES);
        strict_1.default.ok([...eligibility].every((code) => !evidence.has(code)));
        strict_1.default.deepEqual(new Set([...eligibility, ...evidence]), new Set(ALL_READY_FRONTIER_BLOCKER_CODES));
        strict_1.default.equal(eligibility.size + evidence.size, 18);
    });
    (0, node_test_1.it)("reports a passing check set when there are no blockers", () => {
        const checks = (0, executable_now_checks_js_1.taskMapExecutableNowChecks)([]);
        strict_1.default.equal(checks.length, 12);
        strict_1.default.ok(checks.every((check) => check.passed));
        strict_1.default.ok(checks.every((check) => check.blockers.length === 0));
        strict_1.default.deepEqual(checks.map((check) => check.checkId), EXPECTED_CHECKS.map((check) => check.checkId));
    });
    (0, node_test_1.it)("fails exactly the check that owns not_open and preserves its object", () => {
        const blocker = { code: "not_open" };
        const checks = (0, executable_now_checks_js_1.taskMapExecutableNowChecks)([blocker]);
        const failed = checks.filter((check) => !check.passed);
        strict_1.default.equal(failed.length, 1);
        strict_1.default.equal(failed[0].checkId, "open_not_terminal");
        strict_1.default.deepEqual(failed[0].blockers, [{ code: "not_open" }]);
        strict_1.default.equal(failed[0].blockers[0], blocker);
    });
    (0, node_test_1.it)("makes every eligibility blocker fail exactly its owning check", () => {
        for (const blockerCode of executable_now_checks_js_1.ELIGIBILITY_BLOCKER_CODES) {
            const failed = (0, executable_now_checks_js_1.taskMapExecutableNowChecks)([{ code: blockerCode }])
                .filter((check) => !check.passed);
            const owner = executable_now_checks_js_1.TASKMAP_EXECUTABLE_NOW_CHECKS_V1.find((check) => check.blockerCodes.includes(blockerCode));
            strict_1.default.equal(failed.length, 1, blockerCode);
            strict_1.default.equal(failed[0].checkId, owner?.checkId, blockerCode);
        }
    });
    (0, node_test_1.it)("preserves relatedTaskId on a dependency blocker", () => {
        const blocker = {
            code: "dependency_unresolved",
            relatedTaskId: "tmt_predecessor",
        };
        const failed = (0, executable_now_checks_js_1.taskMapExecutableNowChecks)([blocker])
            .find((check) => !check.passed);
        strict_1.default.equal(failed?.checkId, "dependencies_resolved");
        strict_1.default.deepEqual(failed?.blockers, [blocker]);
        strict_1.default.equal(failed?.blockers[0], blocker);
    });
    (0, node_test_1.it)("does not make canonical checks fail for evidence-integrity blockers", () => {
        const checks = (0, executable_now_checks_js_1.taskMapExecutableNowChecks)(executable_now_checks_js_1.EVIDENCE_INTEGRITY_BLOCKER_CODES.map((code) => ({ code })));
        strict_1.default.ok(checks.every((check) => check.passed));
        strict_1.default.ok(checks.every((check) => check.blockers.length === 0));
    });
    (0, node_test_1.it)("freezes the registry and blocker classification arrays", () => {
        strict_1.default.equal(Object.isFrozen(executable_now_checks_js_1.TASKMAP_EXECUTABLE_NOW_CHECKS_V1), true);
        strict_1.default.ok(executable_now_checks_js_1.TASKMAP_EXECUTABLE_NOW_CHECKS_V1.every((check) => Object.isFrozen(check)));
        strict_1.default.ok(executable_now_checks_js_1.TASKMAP_EXECUTABLE_NOW_CHECKS_V1.every((check) => Object.isFrozen(check.blockerCodes)));
        strict_1.default.equal(Object.isFrozen(executable_now_checks_js_1.ELIGIBILITY_BLOCKER_CODES), true);
        strict_1.default.equal(Object.isFrozen(executable_now_checks_js_1.EVIDENCE_INTEGRITY_BLOCKER_CODES), true);
    });
    (0, node_test_1.it)("does not mutate the blocker input", () => {
        const blocker = Object.freeze({
            code: "dependency_unresolved",
            relatedTaskId: "tmt_predecessor",
        });
        const blockers = Object.freeze([blocker]);
        strict_1.default.doesNotThrow(() => (0, executable_now_checks_js_1.taskMapExecutableNowChecks)(blockers));
        strict_1.default.deepEqual(blockers, [{
                code: "dependency_unresolved",
                relatedTaskId: "tmt_predecessor",
            }]);
    });
});
